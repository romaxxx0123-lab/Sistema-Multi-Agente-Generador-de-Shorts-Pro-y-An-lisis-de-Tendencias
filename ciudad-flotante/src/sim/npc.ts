/**
 * [AGENTE sim-life] HABITANTES AUTÓNOMOS (docs/SISTEMAS.md §11).
 *
 * Cada habitante tiene necesidades (hambre, sed, energía, salud) y ánimo, y elige qué hacer con
 * una lista de prioridades que se reevalúa cada ~10 min o al acabar la tarea:
 *   1. expedición (la gestiona events.ts) · 2. incendio (van a apagarlo) · 3. tormenta a la
 *   intemperie → a cubierto · 4. dormir (de noche o agotado) en su cama · 5. comer de los almacenes
 *   en una mesa · 6. beber del depósito · 7. trabajar según el puesto (8–20 h) · 8. ocio.
 * Las emergencias (fuego, tormenta, discusión, balsa de náufragos) se comprueban cada minuto y se
 * adelantan a lo que estén haciendo.
 *
 * Movimiento: rutas A* con `sim.nav.findPath` cacheadas en `npc.path` (solo se replanifican si la
 * ruta falla, si el barco cambia o si se atascan), 1,4 m por minuto de juego, con altura del suelo y
 * de las rampas sacada de la propia rejilla de navegación, y tiempos límite para no quedarse
 * atrapados. `yaw = atan2(−dx, −dz)` según la dirección de la marcha (o mirando a lo que usan).
 *
 * Trabajo real: el cocinero encola recetas pagando SOLO con los almacenes y alimenta el fogón; el
 * jardinero siembra, cosecha y quita plagas; el mecánico repara con repuestos del almacén y recarga
 * los generadores; el pescador pesca desde la borda; el recolector rescata restos con el gancho; los
 * demás ayudan en las obras (actividad 'building' + `task.targetModuleId`, que construction.ts cuenta).
 *
 * Estado transitorio (no se guarda; se reconstruye al cargar): próxima decisión, recuerdos cortos
 * para el ánimo (última comida caliente, comedor, charla), control de atascos y la máscara de
 * zonas alcanzables de la rejilla. Todo el azar sale de `sim.rng`.
 */
import { clamp } from '../core/math';
import { ITEMS } from '../data/items';
import { moduleDef } from '../data/modules';
import { NPC_NAMES, ROLES, TRAITS, type TraitDef } from '../data/names';
import { RECIPES } from '../data/recipes';
import { bedProp } from './actions';
import { HOOK_RANGE, SHIP_ORIGIN_X, WATER_PER_DRINK } from './constants';
import { expansionWorkPoint, REPAIR_THRESHOLD, repair, repairInfo } from './construction';
import { COLLECT_RANGE, driftSpeed, fishingMultiplier, hullBounds, rollCatch } from './debris';
import { burningModules, discussionOf, distanceToModule, isBreakdownTarget, mediateDiscussion, npcCollectDebris, onFishCaught, onNpcCured, onNpcDied, startEvent } from './events';
import { depositToStorage, findModule, itemName, payInventories, spawnCrate, storageModules } from './helpers';
import { addItem, countIn, countItem, missingFor, removeItem, takeFromSlot } from './inventory';
import { NAV_RES, type NavGrid, type NavPoint } from './nav';
import { makeNpc } from './newGame';
import { cellAtPoint, cellCenter, levelOfY, levelY, moduleCells, moduleCenter, type PropInstance } from './ship';
import type { ActionResult, NpcTalk, Simulation } from './Simulation';
import { harvest, plant, queueCraft, tendPlot } from './stations';
import { hourOf } from './time';
import type { ActiveEvent, ItemId, ItemStack, ModuleInstance, NpcActivity, NpcRole, NpcState, Vec3 } from './types';
import { fuelMinutes, moduleHasSky, withArticle } from './utilities';

/* ------------------------------------------------------------------ */
/* Parámetros de equilibrio                                            */
/* ------------------------------------------------------------------ */

/** Velocidad al andar (m por minuto de juego). */
export const NPC_WALK_SPEED = 1.4;
export const NPC_RATES = {
  hungerPerHour: 5,
  thirstPerHour: 7,
  energyPerHour: 4.5,
  sleepBedPerHour: 14,
  sleepFloorPerHour: 8,
  starvingDamagePerHour: 6,
  sickDamagePerHour: 2,
  fireDamagePerHour: 10,
  regenPerHour: 1,
  moodPerHour: 4,
};
/** Cada cuánto se reevalúan las prioridades (min). */
export const DECIDE_EVERY = 10;
/** Horas de comida (con hambre < 75 se sientan a comer). */
export const MEAL_HOURS = [8, 14, 20];
export const WORK_FROM = 8;
export const WORK_TO = 20;
export const NIGHT_FROM = 22;
export const DEFAULT_WAKE_HOUR = 6;
/** Minutos que dura un bocadillo de texto. */
export const SAY_MINUTES = 6;
/** Enfriamiento de las quejas de cada habitante (min). */
export const COMPLAINT_COOLDOWN = 240;
/** Habitantes como máximo apagando el mismo fuego. */
export const MAX_FIREFIGHTERS = 3;
/** Fuego que apaga cada habitante por minuto (× valentía). */
export const FIREFIGHT_RATE = 5;
/** Distancia (m) a las celdas del módulo desde la que se lucha contra el fuego. */
export const FIRE_REACH = 3;
/** Comer en la mesa (min). */
export const EAT_MINUTES = 20;
export const DRINK_MINUTES = 2;
/** Sed que quita un litro de agua. */
export const DRINK_THIRST = 40;
/** Ayudantes como máximo en la misma obra. */
export const MAX_BUILDERS = 3;
/** Comida "lista" que el cocinero intenta tener en los almacenes, por habitante. */
const FOOD_STOCK_PER_NPC = 2;
/** Botellas de agua que el cocinero reserva (no las usa para cocinar). */
const WATER_BOTTLE_RESERVE = 2;
/** Probabilidad de ponerse enfermo al comer pescado crudo. */
const RAW_FISH_SICK = 0.3;
/** Probabilidad por hora de curarse de una enfermedad (en camilla / por sí solo). */
const CURE_PER_HOUR_INFIRMARY = 0.2;
const CURE_PER_HOUR_NATURAL = 0.02;
/** Salud a partir de la que se cura una herida. */
const INJURY_HEALED_AT = 90;

/** Comida por orden de preferencia (los habitantes toman la mejor disponible). */
export const FOOD_PREFERENCE: readonly ItemId[] = ['guiso', 'sopa', 'pescado_asado', 'conserva', 'fruta', 'hortaliza', 'pescado_crudo'];
const COOKED_FOOD = new Set(['guiso', 'sopa', 'pescado_asado']);
const READY_FOOD = ['guiso', 'sopa', 'pescado_asado', 'conserva', 'fruta'];

/** Prioridades de las tareas. */
const PRIO = {
  expedicion: 200,
  apagar: 100,
  refugio: 90,
  discutir: 85,
  dormirAgotado: 80,
  beberUrgente: 75,
  balsa: 72,
  comerUrgente: 70,
  urgente: 65,
  dormir: 60,
  descansar: 55,
  beber: 50,
  comer: 45,
  trabajar: 30,
  construir: 28,
  ocio: 10,
};

type TaskKind =
  | 'dormir'
  | 'descansar'
  | 'comer'
  | 'beber'
  | 'trabajar'
  | 'construir'
  | 'apagar'
  | 'refugio'
  | 'ocio'
  | 'charlar'
  | 'discutir'
  | 'partir'
  | 'expedicion';

/** Plazo "sin límite" (finito: `Infinity` no sobrevive a JSON). */
const NO_DEADLINE = 1e12;

/** Datos de la tarea en curso (en `npc.task.data`, serializables). */
interface TaskData {
  phase: 'go' | 'act';
  prio: number;
  /** Límite para llegar al destino (min de juego). */
  deadline: number;
  job?: string;
  stage?: string;
  /** Pista de animación para la vista ('cocinar', 'cultivar', 'reparar', 'pescar', 'gancho'…). */
  anim?: string;
  /** Hacia dónde mira al llegar. */
  faceYaw?: number;
  [k: string]: unknown;
}

const fail = (msg: string): ActionResult => ({ ok: false, msg });

/* ------------------------------------------------------------------ */
/* Frases                                                              */
/* ------------------------------------------------------------------ */

const LINES = {
  greetMorning: ['¡Buenos días!', 'Buen día, ¿has dormido bien?', 'Mañana tranquila, de momento.', '¡Arriba, que el mar no espera!'],
  greetAfternoon: ['¡Buenas tardes!', '¿Qué tal la jornada?', 'Buen viento hoy, ¿eh?'],
  greetNight: ['Buenas noches…', 'Es tarde, deberías descansar.', 'Qué noche más clara.'],
  greetGrumpy: ['Hmm.', '¿Qué quieres ahora?', 'No estoy de humor.', 'Ya, ya…'],
  work: {
    cocinero: ['Esto huele de maravilla.', '¡Un poco más de sal!', 'La sopa no se hace sola.', 'Que nadie toque mi cucharón.', 'A fuego lento, como debe ser.'],
    jardinero: ['Crecen a buen ritmo.', 'Un poco de agua y luz, no piden más.', 'Estas hojas tienen buena pinta.', 'Hay que quitar estas malas hierbas.'],
    mecanico: ['Una vuelta más a esta tuerca…', 'Este trasto aguanta lo que le echen.', 'Si suena así, es que funciona.', 'Grasa, paciencia y una buena llave.'],
    pescador: ['Hoy pican.', 'Paciencia… paciencia…', '¡Ese era grande! Bueno, casi.', 'El mar da de comer a quien sabe esperar.'],
    recolector: ['¡Allá va el gancho!', 'Todo lo que flota sirve para algo.', 'Madera buena, madera seca.', '¡Lo tengo!'],
    libre: ['¿En qué echo una mano?', 'Aquí estoy para lo que haga falta.'],
  } as Record<NpcRole, string[]>,
  build: ['¡Esto va tomando forma!', 'Pásame esos clavos.', 'Un tablón más y listo.', 'Quedará precioso, ya verás.'],
  leisure: ['Qué tranquilo está el mar.', '¿Has visto esas gaviotas?', 'Echo de menos tierra firme… a veces.', 'Este barco empieza a parecer un hogar.', 'Me gusta el olor a salitre.'],
  chat: ['¿Te acuerdas del puerto?', 'Dicen que más allá hay un faro que nadie construyó.', 'Mañana quiero pescar en la proa.', '¡Ja, ja! ¡No me digas!', '¿Y qué pasó después?', 'Mi abuela decía que el mar no perdona.'],
  stormFear: ['¡Vamos a hundirnos!', 'No soporto este vaivén…', 'Que pare ya, por favor…'],
  storm: ['Menuda tormenta.', 'Agarraos fuerte.', 'Esto amainará pronto.'],
  fireAlarm: ['¡Fuego! ¡Fuego en {lugar}!', '¡Rápido, cubos de agua! ¡Arde {lugar}!'],
  firefight: ['¡Más agua aquí!', '¡No dejéis que se extienda!', '¡Ya casi está!'],
  fireOut: ['¡Apagado!', 'Uf… por poco.', 'Ya está, ya está.'],
  hungry: ['Me suenan las tripas…', 'No queda nada que llevarse a la boca.'],
  thirsty: ['Tengo la garganta seca.', '¿No queda agua en los depósitos?'],
  sick: ['Me arde la frente…', 'No me encuentro bien.', 'Necesito tumbarme un rato.'],
  injured: ['Ay, la pierna…', 'Necesito descansar un poco.'],
  argue: ['¡Siempre igual contigo!', '¡Eso no es justo!', '¡Déjame en paz!', '¿Y tú qué sabrás?', '¡No pienso ceder!'],
  depart: ['¡Allá vamos!', '¡Volveremos cargados!', 'A ver qué encontramos.'],
  back: ['¡Hemos vuelto!', '¡Qué viaje! Traemos de todo.', 'Ya echaba de menos el barco.'],
  rescued: ['¡Gracias por sacarme del agua!', 'Creí que no lo contaba…', '¡Tierra firme! Bueno, casi.'],
  eat: {
    guiso: '¡Qué guiso más rico!',
    sopa: 'Una sopa caliente, qué lujo.',
    pescado_asado: 'Pescado a la brasa, como en casa.',
    conserva: 'Lata otra vez… en fin.',
    fruta: '¡Qué fruta más dulce!',
    hortaliza: 'Verdura cruda… algo es algo.',
    pescado_crudo: 'Crudo… no es lo ideal.',
  } as Record<string, string>,
  trait: {
    grunon: ['Siempre me toca lo peor.', 'Este barco cruje demasiado.', 'En mis tiempos esto se hacía mejor.'],
    optimista: ['¡Hoy va a ser un gran día!', 'Saldremos de esta, seguro.', '¡Qué suerte tenemos de estar aquí!'],
    hablador: ['¿Sabías que las ballenas cantan?', 'Te cuento una cosa…', '¡Qué ganas tenía de charlar!'],
    miedoso: ['¿Has oído eso?', 'No me gusta nada este oleaje.'],
    valiente: ['Si hay jaleo, aquí estoy.', 'Que venga lo que tenga que venir.'],
    dormilon: ['Qué sueño tengo…', 'Una siestecita no vendría mal.'],
    gloton: ['¿Qué hay de comer hoy?', 'Huele a guiso… ¿o lo he soñado?'],
    madrugador: ['A quien madruga…', 'El amanecer en el mar no tiene precio.'],
    trabajador: ['Manos a la obra.', 'Hay mucho que hacer.'],
  } as Record<string, string[]>,
};

/* ------------------------------------------------------------------ */
/* Memoria transitoria                                                 */
/* ------------------------------------------------------------------ */

interface NpcMemo {
  nextDecideAt: number;
  emergencyAt: number;
  ateCookedAt: number;
  comedorAt: number;
  chatAt: number;
  greetAt: number;
  chatterAt: number;
  lastMealAt: number;
  progressAt: number;
  progressDist: number;
  /** Puntos de ruta que quedaban en la última medición (al consumir uno se reinicia la medida). */
  progressLeft: number;
  replans: number;
  lastHarm: string;
  /** Tarea → no reintentar hasta este minuto (tras un fallo o un enfriamiento). */
  blocked: Record<string, number>;
}

interface LifeMemo {
  npcs: Map<string, NpcMemo>;
  rev: number;
  reach: { nav: NavGrid; mask: Uint8Array[] } | null;
  rails: { nav: NavGrid; spots: RailSpot[] } | null;
  bedsAt: number;
  complainAt: number;
  stats: NpcDebugStats;
}

export interface NpcDebugStats {
  /** Llegadas a destino. */
  arrivals: number;
  /** Tareas abandonadas por no llegar a tiempo o no encontrar ruta. */
  aborts: number;
  /** Replanificaciones por atasco o cambio del barco. */
  replans: number;
  /** Búsquedas A* sin resultado. */
  pathFails: number;
  /** Búsquedas A* realizadas. */
  pathSearches: number;
  /** Habitantes recolocados en la rejilla (posición no transitable tras un cambio del barco). */
  snaps: number;
}

interface RailSpot {
  pos: Vec3;
  yaw: number;
  side: number;
}

const memos = new WeakMap<Simulation, LifeMemo>();

function lifeMemo(sim: Simulation): LifeMemo {
  let m = memos.get(sim);
  if (!m) {
    m = { npcs: new Map(), rev: -1, reach: null, rails: null, bedsAt: -Infinity, complainAt: -Infinity, stats: { arrivals: 0, aborts: 0, replans: 0, pathFails: 0, pathSearches: 0, snaps: 0 } };
    memos.set(sim, m);
  }
  return m;
}

function memoOf(sim: Simulation, npc: NpcState): NpcMemo {
  const lm = lifeMemo(sim);
  let m = lm.npcs.get(npc.id);
  if (!m) {
    const t = sim.state.time;
    m = {
      nextDecideAt: t,
      emergencyAt: t,
      ateCookedAt: -Infinity,
      comedorAt: -Infinity,
      chatAt: -Infinity,
      greetAt: -Infinity,
      chatterAt: t + sim.rng.range(10, 60),
      lastMealAt: t - 120,
      progressAt: t,
      progressDist: Infinity,
      progressLeft: -1,
      replans: 0,
      lastHarm: 'heridas',
      blocked: {},
    };
    lm.npcs.set(npc.id, m);
  }
  return m;
}

/** Estadísticas de navegación (pruebas y depuración). */
export function npcDebugStats(sim: Simulation): NpcDebugStats {
  return lifeMemo(sim).stats;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Nombres femeninos de `NPC_NAMES` (para concordar adjetivos: "agotada", "herido"…). */
const FEMININE_NAMES = new Set(['Marina', 'Lucía', 'Nora', 'Alma', 'Vera', 'Inés', 'Carla', 'Rocío', 'Julia', 'Sol', 'Olga', 'Aitana', 'Celia', 'Lola', 'Greta']);

/** ¿El habitante es mujer? (por su nombre; los nombres desconocidos terminados en -a cuentan como femeninos). */
export function isFemaleNpc(npc: Pick<NpcState, 'name'>): boolean {
  const first = npc.name.split(/\s+/)[0] ?? '';
  return FEMININE_NAMES.has(first) || (!/^(Tomás|Andrés|Simón|Joaquín|Fermín|Elías|Darío)$/.test(first) && /a$/.test(first));
}

/** Concuerda un adjetivo terminado en -o con el habitante: g(Marina, 'agotado') → 'agotada'. */
export function npcAdj(npc: Pick<NpcState, 'name'>, adjMasc: string): string {
  return isFemaleNpc(npc) ? adjMasc.replace(/o$/, 'a') : adjMasc;
}

function traitOf(npc: NpcState): TraitDef {
  return TRAITS[npc.trait] ?? { id: npc.trait, name: npc.trait, desc: '' };
}

function td(npc: NpcState): TaskData {
  return (npc.task?.data ?? { phase: 'act', prio: 0, deadline: NO_DEADLINE }) as TaskData;
}

function dist2(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function yawTo(from: Vec3, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

function isPresent(npc: NpcState): boolean {
  return npc.awayUntil === null && npc.activity !== 'away';
}

function say(sim: Simulation, npc: NpcState, text: string, minutes = SAY_MINUTES): void {
  npc.say = { text, until: sim.state.time + minutes };
}

function sayFrom(sim: Simulation, npc: NpcState, lines: readonly string[], minutes = SAY_MINUTES): void {
  if (lines.length) say(sim, npc, sim.rng.pick(lines), minutes);
}

/** Hash determinista (para elegir frases en consultas que no deben gastar azar). */
function hashPick<T>(arr: readonly T[], key: string): T {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return arr[Math.abs(h) % arr.length]!;
}

function isNightFor(npc: NpcState, hour: number): boolean {
  const wake = traitOf(npc).wakeHour ?? DEFAULT_WAKE_HOUR;
  return hour >= NIGHT_FROM || hour < wake;
}

function isWorkHour(hour: number): boolean {
  return hour >= WORK_FROM && hour < WORK_TO;
}

function stormNow(sim: Simulation): boolean {
  return sim.state.weather.kind === 'tormenta';
}

function isIndoorAt(sim: Simulation, p: Vec3): boolean {
  const c = cellAtPoint(sim.layout, p.x, p.y, p.z);
  return !!c && c.indoor;
}

/** Multiplicador de rendimiento en el trabajo (rasgo, ánimo, discusión). */
function workMult(sim: Simulation, npc: NpcState): number {
  let k = traitOf(npc).workMult ?? 1;
  if (npc.needs.mood < 30) k *= 0.6;
  if (discussionOf(sim, npc.id)) k *= 0.7;
  return k;
}

/** Almacenes del barco (los habitantes nunca usan el inventario del jugador). */
function storageInvs(sim: Simulation) {
  return payInventories(sim, false);
}

function storageCount(sim: Simulation, id: ItemId): number {
  return countIn(storageInvs(sim), id);
}

/** Quita `qty` de los almacenes (la cantidad que haya, como mucho). Devuelve lo retirado. */
function takeFromStorage(sim: Simulation, id: ItemId, qty: number, only?: ModuleInstance): number {
  let left = qty;
  const invs = only?.inventory ? [only.inventory] : storageInvs(sim);
  for (const inv of invs) {
    if (left <= 0) break;
    const have = countItem(inv, id);
    const take = Math.min(have, left);
    if (take > 0 && removeItem(inv, id, take)) left -= take;
  }
  return qty - left;
}

/** Guarda en los almacenes; lo que no quepa, en una caja junto al habitante. */
function storeOrDrop(sim: Simulation, items: ItemStack[], at: Vec3, label: string): void {
  const left: ItemStack[] = [];
  for (const s of items) {
    const l = depositToStorage(sim, s.id, s.qty);
    if (l > 0) left.push({ id: s.id, qty: l });
  }
  if (left.length) spawnCrate(sim, { ...at }, left, label);
}

/* ------------------------------------------------------------------ */
/* Rejilla de navegación: zonas alcanzables y puntos útiles            */
/* ------------------------------------------------------------------ */

/** Máscara de nodos alcanzables desde la cubierta principal (una por revisión del barco). */
function reachMask(sim: Simulation): Uint8Array[] {
  const nav = sim.nav;
  const lm = lifeMemo(sim);
  if (lm.reach && lm.reach.nav === nav) return lm.reach.mask;
  const mask = Array.from({ length: nav.levels }, () => new Uint8Array(nav.nx * nav.nz));
  const start = nav.nearestWalkable(sim.collision.safeSpawn(), 8);
  if (start) {
    const queue: number[] = [nav.gid(start.level, start.i, start.j)];
    mask[start.level]![start.i * nav.nz + start.j] = 1;
    while (queue.length) {
      const g = queue.pop()!;
      const p = nav.fromGid(g);
      const h0 = nav.height[p.level]![p.i * nav.nz + p.j]!;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = p.i + di;
          const nj = p.j + dj;
          if (!nav.isWalk(p.level, ni, nj)) continue;
          if (di && dj && (!nav.isWalk(p.level, p.i + di, p.j) || !nav.isWalk(p.level, p.i, p.j + dj))) continue;
          if (Math.abs(nav.height[p.level]![ni * nav.nz + nj]! - h0) > 0.6) continue;
          const k = ni * nav.nz + nj;
          if (mask[p.level]![k]) continue;
          mask[p.level]![k] = 1;
          queue.push(nav.gid(p.level, ni, nj));
        }
      }
      for (const n of nav.links.get(g) ?? []) {
        const q = nav.fromGid(n);
        const k = q.i * nav.nz + q.j;
        if (mask[q.level]![k]) continue;
        mask[q.level]![k] = 1;
        queue.push(n);
      }
    }
  }
  lm.reach = { nav, mask };
  return mask;
}

function isReachableNode(sim: Simulation, p: NavPoint): boolean {
  const nav = sim.nav;
  return nav.isWalk(p.level, p.i, p.j) && reachMask(sim)[p.level]![p.i * nav.nz + p.j] === 1;
}

/** ¿El punto está en un nodo transitable y alcanzable? */
export function isOnReachableNav(sim: Simulation, p: Vec3): boolean {
  const n = sim.nav.locate(p);
  return !!n && isReachableNode(sim, n);
}

/** Nodo alcanzable más cercano a un punto (mismo nivel), en coordenadas del barco. */
function snapReachable(sim: Simulation, p: Vec3, radius = 3): Vec3 | null {
  const nav = sim.nav;
  const start = nav.locate(p);
  if (start && isReachableNode(sim, start)) return nav.worldOf(start);
  // Celda de partida: la que localiza la rejilla o, si el punto no tiene suelo, la de su nivel.
  const lv = start?.level ?? Math.max(0, Math.min(nav.levels - 1, levelOfY(p.y)));
  const ci = start?.i ?? clamp(Math.floor((p.x + SHIP_ORIGIN_X) / NAV_RES), 0, nav.nx - 1);
  const cj = start?.j ?? clamp(Math.floor((p.z + (nav.nz * NAV_RES) / 2) / NAV_RES), 0, nav.nz - 1);
  const maxR = Math.ceil(radius / NAV_RES);
  for (let r = 1; r <= maxR; r++) {
    let best: NavPoint | null = null;
    let bestD = Infinity;
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const q = { level: lv, i: ci + di, j: cj + dj };
        if (!nav.inside(q.i, q.j) || !isReachableNode(sim, q)) continue;
        const d = di * di + dj * dj;
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
    }
    if (best) return nav.worldOf(best);
  }
  return null;
}

/** Punto de uso de un mueble (delante de él), alcanzable. */
function propSpot(sim: Simulation, prop: PropInstance): Vec3 | null {
  const sp = sim.nav.standPoint(prop);
  if (sp && isOnReachableNav(sim, sp)) return sp;
  return snapReachable(sim, sp ?? { x: prop.x, y: prop.y, z: prop.z }, 3);
}

function propsOf(sim: Simulation, moduleId: number): PropInstance[] {
  return sim.layout.props.filter((p) => p.moduleId === moduleId);
}

/** Punto de trabajo en un módulo: su mueble principal o el punto alcanzable más cercano a su centro. */
function moduleSpot(sim: Simulation, m: ModuleInstance, kinds?: string[]): { pos: Vec3; prop: PropInstance | null } | null {
  const props = propsOf(sim, m.id).filter((p) => (kinds ? kinds.includes(p.kind) : p.interact !== null));
  for (const p of props) {
    const s = propSpot(sim, p);
    if (s) return { pos: s, prop: p };
  }
  const c = moduleCenter(m, sim.state.ship.width);
  const s = snapReachable(sim, { x: c.x, y: c.y, z: c.z }, 5);
  return s ? { pos: s, prop: null } : null;
}

/** Puntos junto a la borda (cubiertas a cielo abierto), con la orientación hacia el agua. */
function railSpots(sim: Simulation): RailSpot[] {
  const nav = sim.nav;
  const lm = lifeMemo(sim);
  if (lm.rails && lm.rails.nav === nav) return lm.rails.spots;
  const L = sim.layout;
  const b = hullBounds(sim);
  const spots: RailSpot[] = [];
  const tryAdd = (x: number, y: number, z: number, yaw: number, side: number) => {
    const p = snapReachable(sim, { x, y, z }, 1.2);
    if (!p || isIndoorAt(sim, p)) return;
    const edge = Math.min(b.halfW - Math.abs(p.z), b.bowX - p.x, p.x - b.sternX);
    if (edge > 1.6) return;
    if (spots.some((s) => Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 0.9 && Math.abs(s.pos.y - p.y) < 1)) return;
    spots.push({ pos: p, yaw, side });
  };
  for (let l = 1; l < L.levels; l++) {
    for (let x = 0; x < L.length; x++) {
      for (let z = 0; z < L.width; z++) {
        const c = L.cells[l]![x]![z]!;
        if (!c.walkable || c.indoor || c.kind === 'stairLow' || c.kind === 'stairHigh') continue;
        const cc = cellCenter(x, z, L.width);
        const y = levelY(l);
        if (z === 0) for (const off of [-1, 1]) tryAdd(cc.x + off, y, -b.halfW + 0.7, 0, -1);
        if (z === L.width - 1) for (const off of [-1, 1]) tryAdd(cc.x + off, y, b.halfW - 0.7, Math.PI, 1);
        if (x === 0) tryAdd(b.sternX + 0.7, y, cc.z, Math.PI / 2, 0);
        if (x === L.length - 1) tryAdd(b.bowX - 0.7, y, cc.z, -Math.PI / 2, 0);
      }
    }
  }
  lm.rails = { nav, spots };
  return spots;
}

/** Punto de borda más cercano a una x (y opcionalmente a un costado). */
function railSpotNear(sim: Simulation, x: number, side?: number, y?: number): RailSpot | null {
  let best: RailSpot | null = null;
  let bestD = Infinity;
  for (const s of railSpots(sim)) {
    if (side !== undefined && side !== 0 && s.side !== side) continue;
    const d = Math.abs(s.pos.x - x) + (y !== undefined ? Math.abs(s.pos.y - y) * 2 : 0);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Punto interior (habitación o bodega) alcanzable más cercano. */
function indoorSpot(sim: Simulation, from: Vec3, preferHold = false): Vec3 | null {
  const L = sim.layout;
  let best: Vec3 | null = null;
  let bestD = Infinity;
  for (let l = 0; l < L.levels; l++) {
    for (let x = 0; x < L.length; x++) {
      for (let z = 0; z < L.width; z++) {
        const c = L.cells[l]![x]![z]!;
        if (!c.indoor || !c.walkable) continue;
        // No dormir en el camarote de otro.
        if (c.kind === 'room' && c.moduleId !== null) {
          const m = findModule(sim, c.moduleId);
          if (m && m.type === 'camarote') continue;
        }
        const cc = cellCenter(x, z, L.width);
        const d = Math.hypot(cc.x - from.x, cc.z - from.z) + Math.abs(l * 3.2 - from.y) * 4 + (preferHold && l !== 0 ? 25 : 0);
        if (d >= bestD) continue;
        const p = snapReachable(sim, { x: cc.x, y: levelY(l), z: cc.z }, 2);
        if (!p) continue;
        best = p;
        bestD = d;
      }
    }
  }
  return best;
}

/** Punto al aire libre en cubierta (pasear). */
function deckSpot(sim: Simulation): Vec3 | null {
  for (let t = 0; t < 12; t++) {
    const p = sim.nav.randomPoint(sim.rng, (level, kind, sky) => level >= 1 && sky && (kind === 'deck' || kind === 'roof'));
    if (p && isOnReachableNav(sim, p)) return p;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Movimiento                                                          */
/* ------------------------------------------------------------------ */

function walkSpeed(npc: NpcState, hurry = false): number {
  let v = NPC_WALK_SPEED;
  if (npc.injured) v *= 0.6;
  else if (npc.sick) v *= 0.8;
  if (hurry) v *= 1.35;
  return v;
}

/** Calcula la ruta hasta `target`. */
function planPath(sim: Simulation, npc: NpcState, target: Vec3): boolean {
  const st = lifeMemo(sim).stats;
  st.pathSearches++;
  const path = sim.nav.findPath(npc.pos, target);
  if (!path || !path.length) {
    st.pathFails++;
    return false;
  }
  npc.path = path.map((p) => ({ x: p.x, y: p.y, z: p.z }));
  return true;
}

function pathLength(npc: NpcState): number {
  let d = 0;
  let prev = npc.pos;
  for (const p of npc.path) {
    d += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return d;
}

/**
 * Altura del suelo (cubierta, bodega o rampa) en (x, z) más próxima a `hint`. Así los habitantes
 * pisan siempre la superficie real aunque un tramo de ruta una el suelo con media rampa (la
 * interpolación lineal de la altura los haría "flotar").
 */
function groundY(sim: Simulation, x: number, z: number, hint: number): number {
  let best = hint;
  let bestD = Infinity;
  for (const s of sim.collision.surfaces(x, z)) {
    const d = Math.abs(s - hint);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

/** Avanza por la ruta. Devuelve true si ha llegado al final. */
function walk(sim: Simulation, npc: NpcState, dt: number, speed: number): boolean {
  let budget = speed * dt;
  const pos = npc.pos;
  while (budget > 1e-9 && npc.path.length) {
    const wp = npc.path[0]!;
    const dx = wp.x - pos.x;
    const dz = wp.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-4) npc.yaw = Math.atan2(-dx, -dz);
    if (d <= budget) {
      pos.x = wp.x;
      pos.y = wp.y;
      pos.z = wp.z;
      budget -= d;
      npc.path.shift();
    } else {
      const t = budget / d;
      pos.x += dx * t;
      pos.z += dz * t;
      pos.y = groundY(sim, pos.x, pos.z, pos.y + (wp.y - pos.y) * t);
      budget = 0;
    }
  }
  return npc.path.length === 0;
}

/** Recoloca al habitante en la rejilla si su posición dejó de ser transitable (obra nueva, carga). */
function ensureOnNav(sim: Simulation, npc: NpcState): void {
  if (isOnReachableNav(sim, npc.pos)) return;
  if (isSeated(npc)) {
    const key = td(npc)['seatKey'];
    if (sim.layout.props.some((p) => p.key === key && p.kind === 'silla')) return; // la silla sigue ahí
    td(npc)['seated'] = false;
  }
  const p = snapReachable(sim, npc.pos, 6) ?? snapReachable(sim, sim.collision.safeSpawn(), 8);
  if (p) {
    npc.pos = { ...p };
    lifeMemo(sim).stats.snaps++;
  }
}

/* ------------------------------------------------------------------ */
/* Tareas                                                              */
/* ------------------------------------------------------------------ */

interface Plan {
  kind: TaskKind;
  prio: number;
  target: Vec3 | null;
  moduleId?: number;
  data?: Partial<TaskData>;
  /** Duración de la acción al llegar (min). */
  duration?: number;
  say?: string;
}

/** Deshace lo que una tarea tuviera reservado (camilla de la enfermería). */
function cleanupTask(sim: Simulation, npc: NpcState): void {
  const t = npc.task;
  if (!t) return;
  const d = td(npc);
  // Se levanta de la silla y vuelve al punto de la rejilla desde el que se sentó.
  if (d['seated'] && d['standPos']) {
    const sp = d['standPos'] as Vec3;
    const back = isOnReachableNav(sim, sp) ? sp : snapReachable(sim, sp, 3);
    if (back) npc.pos = { x: back.x, y: back.y, z: back.z };
    d['seated'] = false;
  }
  if (t.kind === 'descansar' && d['restModuleId'] !== undefined) {
    const m = findModule(sim, d['restModuleId'] as number);
    const idx = d['restIndex'] as number;
    if (m && m.beds[idx] === npc.id) m.beds[idx] = null;
    const home = d['homeBed'] as { moduleId: number; index: number } | null;
    npc.bed = home ?? null;
    if (home) {
      const hm = findModule(sim, home.moduleId);
      if (!hm || hm.beds[home.index] !== npc.id) npc.bed = null;
    }
  }
}

function clearTask(sim: Simulation, npc: NpcState): void {
  cleanupTask(sim, npc);
  npc.task = null;
  npc.path = [];
  if (isPresent(npc)) npc.activity = npc.injured ? 'injured' : 'idle';
}

function abortTask(sim: Simulation, npc: NpcState, job?: string, retryIn = 20): void {
  lifeMemo(sim).stats.aborts++;
  const key = job ?? npc.task?.kind;
  if (key) memoOf(sim, npc).blocked[key] = sim.state.time + retryIn;
  clearTask(sim, npc);
  memoOf(sim, npc).nextDecideAt = sim.state.time + 1;
}

function actActivity(npc: NpcState, kind: TaskKind, d: TaskData): NpcActivity {
  switch (kind) {
    case 'dormir':
    case 'descansar':
      return 'sleeping';
    case 'comer':
    case 'beber':
      return 'eating';
    case 'trabajar':
      return d['matchesRole'] === false ? 'idle' : 'working';
    case 'construir':
      return 'building';
    case 'apagar':
      return 'firefighting';
    case 'refugio':
      return 'sheltering';
    case 'charlar':
    case 'discutir':
      return 'socializing';
    case 'expedicion':
      return 'away';
    default:
      return npc.injured ? 'injured' : 'idle';
  }
}

/** Empieza una tarea: camino al destino o acción inmediata. */
function startPlan(sim: Simulation, npc: NpcState, plan: Plan): boolean {
  const now = sim.state.time;
  cleanupTask(sim, npc);
  const data: TaskData = { phase: 'go', prio: plan.prio, deadline: NO_DEADLINE, ...(plan.data ?? {}) } as TaskData;
  if (plan.duration !== undefined) data['duration'] = plan.duration;
  npc.task = { kind: plan.kind, data };
  if (plan.moduleId !== undefined) npc.task.targetModuleId = plan.moduleId;
  if (plan.kind === 'descansar' && typeof data['restModuleId'] === 'number') {
    // Reserva temporal de la camilla: la vista lo tumba en ella y nadie más la ocupa.
    const m = findModule(sim, data['restModuleId'] as number);
    const idx = data['restIndex'] as number;
    if (m && m.beds[idx] === null) {
      data['homeBed'] = npc.bed ? { ...npc.bed } : null;
      m.beds[idx] = npc.id;
      npc.bed = { moduleId: m.id, index: idx };
    } else {
      delete data['restModuleId'];
    }
  }
  npc.path = [];
  if (plan.say) say(sim, npc, plan.say);
  if (!plan.target || dist2(npc.pos, plan.target) < 0.35) {
    if (plan.target) npc.task.targetPos = { ...plan.target };
    arrive(sim, npc);
    return true;
  }
  npc.task.targetPos = { ...plan.target };
  if (!planPath(sim, npc, plan.target)) {
    cleanupTask(sim, npc);
    npc.task = null;
    return false;
  }
  const eta = pathLength(npc) / walkSpeed(npc, plan.kind === 'apagar');
  data.deadline = now + Math.max(12, eta * 3 + 6);
  npc.activity = 'walking';
  const m = memoOf(sim, npc);
  m.progressAt = now;
  m.progressDist = Infinity;
  m.replans = 0;
  return true;
}

/** Cambia a la fase de acción (o encadena otra etapa). */
function arrive(sim: Simulation, npc: NpcState): void {
  const t = npc.task;
  if (!t) return;
  const d = td(npc);
  const now = sim.state.time;
  if (d.phase === 'go') lifeMemo(sim).stats.arrivals++;
  npc.path = [];
  if (t.targetPos) {
    npc.pos.x = t.targetPos.x;
    npc.pos.y = t.targetPos.y;
    npc.pos.z = t.targetPos.z;
  }
  // Etapas encadenadas.
  if (t.kind === 'comer' && d.stage === 'recoger') {
    pickUpFood(sim, npc);
    return;
  }
  if (t.kind === 'beber' && d.stage === 'botella') {
    const got = takeFromStorage(sim, 'agua_potable', 1, findModule(sim, d['moduleId'] as number));
    if (!got) {
      abortTask(sim, npc, 'beber', 5);
      return;
    }
    npc.carry = { id: 'agua_potable', qty: 1 };
  }
  if (t.kind === 'partir') {
    depart(sim, npc);
    return;
  }
  d.phase = 'act';
  const dur = typeof d['duration'] === 'number' ? (d['duration'] as number) : 10;
  t.until = now + dur;
  npc.activity = actActivity(npc, t.kind as TaskKind, d);
  if (d.faceYaw !== undefined) npc.yaw = d.faceYaw;
  sitDown(sim, npc);
  onActStart(sim, npc);
}

/**
 * Si la tarea reservó una silla, el habitante da el último paso hasta ella (las sillas no tienen
 * colisión, pero la rejilla de navegación no siempre llega a menos de 1,3 m por las mesas).
 */
function sitDown(sim: Simulation, npc: NpcState): void {
  const d = td(npc);
  const key = d['seatKey'];
  if (typeof key !== 'string') return;
  const chair = sim.layout.props.find((p) => p.key === key && p.kind === 'silla');
  if (!chair || Math.hypot(chair.x - npc.pos.x, chair.z - npc.pos.z) > 2.5 || Math.abs(chair.y - npc.pos.y) > 0.5) return;
  d['standPos'] = { x: npc.pos.x, y: npc.pos.y, z: npc.pos.z };
  d['seated'] = true;
  npc.pos = { x: chair.x, y: chair.y, z: chair.z };
  npc.yaw = chair.yaw;
}

/** ¿Está sentado en una silla (fuera de la rejilla de navegación)? */
export function isSeated(npc: NpcState): boolean {
  return !!(npc.task?.data as { seated?: boolean } | undefined)?.seated;
}

function onActStart(sim: Simulation, npc: NpcState): void {
  const t = npc.task!;
  const d = td(npc);
  switch (t.kind) {
    case 'trabajar': {
      const job = d.job;
      if (job === 'cocinar') {
        const k = findModule(sim, t.targetModuleId ?? -1);
        const r = d['recipe'] as string;
        if (!k || !queueCraft(sim, k.id, r, 1, { by: 'npc' }).ok) {
          abortTask(sim, npc, 'cocinar', 30);
          return;
        }
        if (sim.rng.chance(0.5)) sayFrom(sim, npc, LINES.work.cocinero);
      } else if (job === 'fabricar') {
        const st = findModule(sim, t.targetModuleId ?? -1);
        const r = d['recipe'] as string;
        if (!st || !queueCraft(sim, st.id, r, 1, { by: 'npc' }).ok) {
          abortTask(sim, npc, `fabricar:${r}`, 30);
          return;
        }
        memoOf(sim, npc).blocked[`fabricar:${r}`] = sim.state.time + 20;
        say(sim, npc, `Voy a fabricar ${(RECIPES[r]?.name ?? r).toLowerCase()}.`);
      } else if (job === 'leña' || job === 'combustible') {
        const m = findModule(sim, t.targetModuleId ?? -1);
        if (!m || !m.fuelInv || !loadFuelFromStorage(sim, m)) {
          abortTask(sim, npc, job, 30);
          return;
        }
      }
      return;
    }
    case 'apagar': {
      const m = findModule(sim, t.targetModuleId ?? -1);
      if (m) {
        npc.yaw = yawTo(npc.pos, moduleCenter(m, sim.state.ship.width));
        sayFrom(sim, npc, LINES.firefight);
      }
      return;
    }
    case 'charlar':
    case 'discutir': {
      const other = sim.state.npcs.find((n) => n.id === d['partner']);
      if (other) npc.yaw = yawTo(npc.pos, other.pos);
      return;
    }
    case 'refugio':
      if ((traitOf(npc).stormFear ?? 1) > 1) sayFrom(sim, npc, LINES.stormFear);
      else if (sim.rng.chance(0.4)) sayFrom(sim, npc, LINES.storm);
      return;
    default:
      return;
  }
}

/* ------------------------------------------------------------------ */
/* Camas                                                               */
/* ------------------------------------------------------------------ */

function isRegularBedModule(m: ModuleInstance): boolean {
  const def = moduleDef(m.type);
  return !!def.beds && !def.healingBeds && m.status !== 'construction';
}

/**
 * Asignación automática de camas: valida las asignaciones (módulos demolidos, habitantes muertos),
 * da cama a quien no tiene (camarote primero, luego dormitorio) y sube de dormitorio a camarote
 * cuando queda uno libre.
 */
export function assignBeds(sim: Simulation): void {
  const st = sim.state;
  const byId = new Map(st.npcs.map((n) => [n.id, n]));
  const resting = (n: NpcState) => n.task?.kind === 'descansar';
  // 1. Limpiar referencias rotas en los módulos y reenlazar.
  for (const m of st.ship.modules) {
    m.beds.forEach((owner, i) => {
      if (!owner || owner === 'player') return;
      const n = byId.get(owner);
      if (!n) {
        m.beds[i] = null;
        return;
      }
      if (resting(n)) return; // reservas temporales de la enfermería
      const healing = !!moduleDef(m.type).healingBeds;
      if (healing || m.status === 'construction') {
        m.beds[i] = null;
        if (n.bed?.moduleId === m.id && n.bed.index === i) n.bed = null;
        return;
      }
      if (!n.bed) n.bed = { moduleId: m.id, index: i };
      else if (n.bed.moduleId !== m.id || n.bed.index !== i) m.beds[i] = null;
    });
  }
  // 2. Validar la cama de cada habitante.
  for (const n of st.npcs) {
    if (!n.bed || resting(n)) continue;
    const m = findModule(sim, n.bed.moduleId);
    if (!m || !isRegularBedModule(m) || m.beds[n.bed.index] !== n.id) n.bed = null;
  }
  // 3. Camas libres.
  const free = (type: string) => {
    const out: { m: ModuleInstance; i: number }[] = [];
    for (const m of st.ship.modules) {
      if (m.type !== type || !isRegularBedModule(m) || m.status !== 'active') continue;
      m.beds.forEach((o, i) => {
        if (o === null) out.push({ m, i });
      });
    }
    return out;
  };
  const take = (n: NpcState, slot: { m: ModuleInstance; i: number }) => {
    if (n.bed) {
      const old = findModule(sim, n.bed.moduleId);
      if (old && old.beds[n.bed.index] === n.id) old.beds[n.bed.index] = null;
    }
    slot.m.beds[slot.i] = n.id;
    n.bed = { moduleId: slot.m.id, index: slot.i };
  };
  const homeless = st.npcs.filter((n) => !n.bed && !resting(n));
  for (const n of homeless) {
    const slot = free('camarote')[0] ?? free('dormitorio')[0] ?? st.ship.modules.flatMap((m) => (m.status === 'active' && isRegularBedModule(m) ? m.beds.map((o, i) => ({ m, i, o })) : [])).find((s) => s.o === null);
    if (!slot) break;
    take(n, slot);
  }
  // 4. Mejoras: de dormitorio a camarote libre (por antigüedad).
  for (const n of [...st.npcs].sort((a, b) => a.joinedDay - b.joinedDay)) {
    if (!n.bed || resting(n)) continue;
    const m = findModule(sim, n.bed.moduleId);
    if (!m || m.type === 'camarote') continue;
    const slot = free('camarote')[0];
    if (!slot) break;
    take(n, slot);
  }
}

/** ¿La cama del habitante está ocupada ahora por el jugador? */
function bedTakenByPlayer(sim: Simulation, moduleId: number, index: number): boolean {
  const s = sim.state.player.sleeping;
  return !!s && s.moduleId === moduleId && s.bed === index;
}

/* ------------------------------------------------------------------ */
/* Planes concretos                                                    */
/* ------------------------------------------------------------------ */

function sleepPlan(sim: Simulation, npc: NpcState, prio: number, nap: boolean): Plan | null {
  if (npc.bed) {
    const m = findModule(sim, npc.bed.moduleId);
    if (m && m.status === 'active' && m.fire <= 0 && !bedTakenByPlayer(sim, m.id, npc.bed.index)) {
      const bp = bedProp(sim, m.id, npc.bed.index);
      const spot = bp ? propSpot(sim, bp.prop) : null;
      if (spot) return { kind: 'dormir', prio, target: spot, moduleId: m.id, data: { bed: true, nap }, duration: 60 * 12 };
    }
  }
  const floor = indoorSpot(sim, npc.pos, true);
  if (!floor) return null;
  return { kind: 'dormir', prio, target: floor, data: { bed: false, nap }, duration: 60 * 12 };
}

/** Camilla libre de la enfermería (para enfermos y heridos). */
function restPlan(sim: Simulation, npc: NpcState): Plan | null {
  for (const m of sim.state.ship.modules) {
    const def = moduleDef(m.type);
    if (!def.healingBeds || m.status !== 'active' || m.fire > 0) continue;
    for (let i = 0; i < m.beds.length; i++) {
      if (m.beds[i] !== null || bedTakenByPlayer(sim, m.id, i)) continue;
      const bp = bedProp(sim, m.id, i);
      const spot = bp ? propSpot(sim, bp.prop) : null;
      if (!spot) continue;
      return { kind: 'descansar', prio: PRIO.descansar, target: spot, moduleId: m.id, data: { restModuleId: m.id, restIndex: i }, duration: 180 };
    }
  }
  // Sin enfermería: reposo en su cama.
  const p = sleepPlan(sim, npc, PRIO.descansar, true);
  if (p) {
    p.kind = 'descansar';
    p.duration = 120;
  }
  return p;
}

/** Módulo de almacén con la mejor comida disponible. */
function bestFood(sim: Simulation): { m: ModuleInstance; id: ItemId } | null {
  const mods = storageModules(sim).filter((m) => m.fire <= 0);
  for (const id of FOOD_PREFERENCE) {
    const m = mods.find((mm) => countItem(mm.inventory, id) > 0);
    if (m) return { m, id };
  }
  return null;
}

function storageSpot(sim: Simulation, m: ModuleInstance): Vec3 | null {
  return moduleSpot(sim, m, m.type === 'cocina' ? ['despensa'] : ['estanteria', 'banco', 'torno'])?.pos ?? moduleSpot(sim, m)?.pos ?? null;
}

function eatPlan(sim: Simulation, npc: NpcState, prio: number): Plan | null {
  if (npc.carry && ITEMS[npc.carry.id]?.category === 'comida') {
    const seat = freeSeat(sim, npc);
    return { kind: 'comer', prio, target: seat?.pos ?? null, data: { stage: 'mesa', seatKey: seat?.key ?? null, comedor: seat?.comedor ?? false }, duration: EAT_MINUTES };
  }
  const food = bestFood(sim);
  if (!food) return null;
  const spot = storageSpot(sim, food.m);
  if (!spot) return null;
  return { kind: 'comer', prio, target: spot, moduleId: food.m.id, data: { stage: 'recoger', moduleId: food.m.id }, duration: EAT_MINUTES };
}

/** Silla libre (comedor primero) para comer o descansar. */
function freeSeat(sim: Simulation, npc: NpcState): { pos: Vec3; key: string; comedor: boolean } | null {
  const taken = new Set<string>();
  for (const n of sim.state.npcs) {
    if (n.id === npc.id) continue;
    const k = (n.task?.data as TaskData | undefined)?.['seatKey'];
    if (typeof k === 'string') taken.add(k);
  }
  let best: { pos: Vec3; key: string; comedor: boolean } | null = null;
  let bestD = Infinity;
  for (const p of sim.layout.props) {
    if (p.kind !== 'silla' || taken.has(p.key)) continue;
    const m = findModule(sim, p.moduleId);
    if (!m || m.status !== 'active' || m.fire > 0) continue;
    const spot = snapReachable(sim, { x: p.x, y: p.y, z: p.z }, 2.2);
    if (!spot || Math.hypot(spot.x - p.x, spot.z - p.z) > 2.2) continue;
    const comedor = m.type === 'comedor';
    const d = dist2(npc.pos, spot) + Math.abs(spot.y - npc.pos.y) * 5 - (comedor ? 30 : 0);
    if (d < bestD) {
      bestD = d;
      best = { pos: spot, key: p.key, comedor };
    }
  }
  return best;
}

function pickUpFood(sim: Simulation, npc: NpcState): void {
  const d = td(npc);
  const m = findModule(sim, d['moduleId'] as number);
  let got: ItemId | null = null;
  if (m && m.inventory) {
    for (const id of FOOD_PREFERENCE) {
      if (takeFromStorage(sim, id, 1, m) === 1) {
        got = id;
        break;
      }
    }
  }
  if (!got) {
    // Se la han llevado: probar en otro almacén (una vez).
    const tries = (d['tries'] as number | undefined) ?? 0;
    const food = tries < 1 ? bestFood(sim) : null;
    const spot = food ? storageSpot(sim, food.m) : null;
    if (food && spot) {
      startPlan(sim, npc, { kind: 'comer', prio: d.prio, target: spot, moduleId: food.m.id, data: { stage: 'recoger', moduleId: food.m.id, tries: tries + 1 }, duration: EAT_MINUTES });
    } else abortTask(sim, npc, 'comer', 15);
    return;
  }
  npc.carry = { id: got, qty: 1 };
  const seat = freeSeat(sim, npc);
  startPlan(sim, npc, { kind: 'comer', prio: d.prio, target: seat?.pos ?? null, data: { stage: 'mesa', seatKey: seat?.key ?? null, comedor: seat?.comedor ?? false }, duration: EAT_MINUTES });
}

function finishEating(sim: Simulation, npc: NpcState): void {
  const c = npc.carry;
  const d = td(npc);
  const mem = memoOf(sim, npc);
  if (!c) return;
  const def = ITEMS[c.id];
  const eff = def?.consume;
  npc.carry = null;
  if (eff) {
    npc.needs.hunger = clamp(npc.needs.hunger + (eff.hunger ?? 0), 0, 100);
    npc.needs.thirst = clamp(npc.needs.thirst + (eff.thirst ?? 0), 0, 100);
    npc.needs.energy = clamp(npc.needs.energy + (eff.energy ?? 0), 0, 100);
    npc.needs.health = clamp(npc.needs.health + Math.max(0, eff.health ?? 0), 0, 100);
  }
  mem.lastMealAt = sim.state.time;
  if (COOKED_FOOD.has(c.id)) mem.ateCookedAt = sim.state.time;
  if (d['comedor']) mem.comedorAt = sim.state.time;
  const line = LINES.eat[c.id];
  if (line && sim.rng.chance(0.6)) say(sim, npc, line);
  if (c.id === 'pescado_crudo' && !npc.sick && sim.rng.chance(RAW_FISH_SICK)) {
    if (!startEvent(sim, 'enfermedad', { npcId: npc.id, cause: 'comió pescado crudo', scripted: true })) npc.sick = true;
  }
}

function drinkPlan(sim: Simulation, npc: NpcState, prio: number): Plan | null {
  const u = sim.state.utilities;
  if (u.waterL >= WATER_PER_DRINK) {
    const tank = sim.state.ship.modules.find((m) => m.type === 'deposito' && m.status !== 'construction' && m.fire <= 0 && moduleSpot(sim, m));
    if (tank) {
      const spot = moduleSpot(sim, tank)!;
      return { kind: 'beber', prio, target: spot.pos, moduleId: tank.id, data: { stage: 'deposito', faceYaw: spot.prop ? yawTo(spot.pos, spot.prop) : undefined }, duration: DRINK_MINUTES };
    }
  }
  if (npc.carry?.id === 'agua_potable') return { kind: 'beber', prio, target: null, data: { stage: 'mano' }, duration: DRINK_MINUTES };
  const m = storageModules(sim).find((mm) => countItem(mm.inventory, 'agua_potable') > 0);
  if (m) {
    const spot = storageSpot(sim, m);
    if (spot) return { kind: 'beber', prio, target: spot, moduleId: m.id, data: { stage: 'botella', moduleId: m.id }, duration: DRINK_MINUTES };
  }
  return null;
}

function finishDrinking(sim: Simulation, npc: NpcState): void {
  const d = td(npc);
  const u = sim.state.utilities;
  if (d.stage === 'deposito') {
    if (u.waterL >= WATER_PER_DRINK) {
      u.waterL = Math.max(0, u.waterL - WATER_PER_DRINK);
      npc.needs.thirst = clamp(npc.needs.thirst + DRINK_THIRST, 0, 100);
    }
    return;
  }
  if (npc.carry?.id === 'agua_potable') {
    npc.carry = null;
    npc.needs.thirst = clamp(npc.needs.thirst + (ITEMS['agua_potable']?.consume?.thirst ?? DRINK_THIRST), 0, 100);
  }
}

/* ---- Trabajo ---- */

function kitchen(sim: Simulation): ModuleInstance | null {
  return sim.state.ship.modules.find((m) => m.type === 'cocina' && m.status === 'active' && m.fire <= 0) ?? null;
}

function readyFoodCount(sim: Simulation): number {
  let n = 0;
  for (const id of READY_FOOD) n += storageCount(sim, id);
  return n;
}

function foodLow(sim: Simulation): boolean {
  return readyFoodCount(sim) < presentCount(sim) * FOOD_STOCK_PER_NPC + 2;
}

function presentCount(sim: Simulation): number {
  return Math.max(1, sim.state.npcs.filter(isPresent).length);
}

/** Receta que el cocinero puede preparar con lo que hay en los almacenes (reservando agua). */
function chooseRecipe(sim: Simulation): string | null {
  const invs = storageInvs(sim);
  const water = countIn(invs, 'agua_potable');
  for (const id of ['guiso', 'pescado_asado', 'sopa']) {
    const r = RECIPES[id];
    if (!r) continue;
    if (Object.keys(missingFor(invs, r.inputs)).length) continue;
    if ((r.inputs['agua_potable'] ?? 0) > 0 && water - (r.inputs['agua_potable'] ?? 0) < WATER_BOTTLE_RESERVE) continue;
    return id;
  }
  return null;
}

/** Combustible que hay en los almacenes para el fogón o el generador. */
function fuelInStorage(sim: Simulation): { id: ItemId; qty: number } | null {
  const comb = storageCount(sim, 'combustible');
  const wood = storageCount(sim, 'madera');
  if (wood > 10) return { id: 'madera', qty: 3 };
  if (comb > 0) return { id: 'combustible', qty: 1 };
  if (wood >= 3) return { id: 'madera', qty: 3 };
  return null;
}

/** Pasa combustible de los almacenes a la ranura de un módulo. */
function loadFuelFromStorage(sim: Simulation, m: ModuleInstance): boolean {
  const f = fuelInStorage(sim);
  if (!f || !m.fuelInv) return false;
  const got = takeFromStorage(sim, f.id, f.qty);
  if (!got) return false;
  const left = addItem(m.fuelInv, f.id, got);
  if (left > 0) depositToStorage(sim, f.id, left);
  return got - left > 0;
}

function workTarget(sim: Simulation, m: ModuleInstance, kinds?: string[]): { pos: Vec3; faceYaw?: number } | null {
  const s = moduleSpot(sim, m, kinds);
  if (!s) return null;
  return s.prop ? { pos: s.pos, faceYaw: yawTo(s.pos, s.prop) } : { pos: s.pos };
}

function cookPlan(sim: Simulation, npc: NpcState): Plan | null {
  const k = kitchen(sim);
  if (!k) return null;
  const stove = workTarget(sim, k, ['fogon']);
  if (!stove) return null;
  const wm = workMult(sim, npc);
  const low = foodLow(sim);
  if (fuelMinutes(k) < 45 && (k.queue.length > 0 || low) && fuelInStorage(sim) && !blocked(sim, npc, 'leña')) {
    return { kind: 'trabajar', prio: PRIO.trabajar, target: stove.pos, moduleId: k.id, data: { job: 'leña', anim: 'cocinar', faceYaw: stove.faceYaw }, duration: 5 / wm };
  }
  if (k.queue.length < 2 && low && fuelMinutes(k) > 0 && !blocked(sim, npc, 'cocinar')) {
    const r = chooseRecipe(sim);
    if (r) return { kind: 'trabajar', prio: PRIO.trabajar, target: stove.pos, moduleId: k.id, data: { job: 'cocinar', recipe: r, anim: 'cocinar', faceYaw: stove.faceYaw }, duration: 25 / wm };
  }
  if (k.queue.length > 0 && fuelMinutes(k) > 0) {
    return { kind: 'trabajar', prio: PRIO.trabajar, target: stove.pos, moduleId: k.id, data: { job: 'vigilar', anim: 'cocinar', faceYaw: stove.faceYaw }, duration: 30 };
  }
  const u = sim.state.utilities;
  if (storageCount(sim, 'agua_potable') < 3 && u.waterL > Math.max(12, u.water.capacityL * 0.35) && !blocked(sim, npc, 'botellas')) {
    const tank = sim.state.ship.modules.find((m) => m.type === 'deposito' && m.status !== 'construction' && m.fire <= 0);
    const t = tank ? workTarget(sim, tank) : null;
    if (tank && t) return { kind: 'trabajar', prio: PRIO.trabajar, target: t.pos, moduleId: tank.id, data: { job: 'botellas', matchesRole: false, faceYaw: t.faceYaw }, duration: 6 / wm };
  }
  return null;
}

function seedFor(sim: Simulation): ItemId | null {
  const veg = storageCount(sim, 'semilla_hortaliza');
  const flax = storageCount(sim, 'semilla_lino');
  if (!veg && !flax) return null;
  if (veg && (storageCount(sim, 'hortaliza') < 8 || !flax)) return 'semilla_hortaliza';
  if (flax && storageCount(sim, 'fibra') < 12) return 'semilla_lino';
  return veg ? 'semilla_hortaliza' : 'semilla_lino';
}

function gardenPlan(sim: Simulation, npc: NpcState): Plan | null {
  const storm = stormNow(sim);
  let best: { m: ModuleInstance; plot: number; job: string; rank: number } | null = null;
  for (const m of sim.state.ship.modules) {
    if (m.status !== 'active' || !m.plots.length || m.fire > 0) continue;
    if (storm && moduleHasSky(sim, m)) continue;
    m.plots.forEach((p, i) => {
      let job: string | null = null;
      let rank = 9;
      if (p.dead || p.pest) {
        job = 'cuidar';
        rank = 0;
      } else if (p.crop && p.growth >= 1) {
        job = 'cosechar';
        rank = 1;
      } else if (!p.crop && seedFor(sim) && (moduleHasSky(sim, m) || sim.state.unlocks.includes('invernadero'))) {
        job = 'sembrar';
        rank = 2;
      }
      if (job && !blocked(sim, npc, `${job}:${m.id}:${i}`) && (!best || rank < best.rank)) best = { m, plot: i, job, rank };
    });
  }
  if (!best) return null;
  const b = best as { m: ModuleInstance; plot: number; job: string };
  const prop = propsOf(sim, b.m.id).find((p) => p.kind === 'bancal' && p.index === b.plot);
  const spot = prop ? propSpot(sim, prop) : moduleSpot(sim, b.m)?.pos ?? null;
  if (!spot) return null;
  return {
    kind: 'trabajar',
    prio: PRIO.trabajar,
    target: spot,
    moduleId: b.m.id,
    data: { job: b.job, plot: b.plot, anim: 'cultivar', matchesRole: npc.role === 'jardinero', faceYaw: prop ? yawTo(spot, prop) : undefined },
    duration: 10 / workMult(sim, npc),
  };
}

/**
 * ¿Merece la pena gastar repuestos en este módulo? Averías, fugas, condición < 50 o un daño que
 * un evento de avería exige reparar.
 */
function needsFixing(sim: Simulation, m: ModuleInstance): boolean {
  if (m.status === 'construction' || m.fire > 0) return false;
  if (m.status === 'broken' || m.leak || m.condition < 50) return true;
  return m.condition < REPAIR_THRESHOLD && isBreakdownTarget(sim, m.id);
}

/** Recetas de repuestos: qué fabricar (y dónde) para conseguir una pieza que falta. */
const PART_CHAIN: Record<string, { recipe: string; station: string }[]> = {
  kit_reparacion: [
    { recipe: 'kit_reparacion', station: 'banco_trabajo' },
    { recipe: 'tornillos', station: 'banco_trabajo' },
  ],
  pieza_mecanica: [
    { recipe: 'pieza_mecanica', station: 'taller' },
    { recipe: 'placa_metal', station: 'banco_trabajo' },
    { recipe: 'tornillos', station: 'banco_trabajo' },
  ],
};

/**
 * El mecánico fabrica el repuesto que le falta con materiales de los almacenes (o el paso
 * intermedio: tornillería, placas). Devuelve null si no hay nada que pueda fabricar.
 */
function partsPlan(sim: Simulation, npc: NpcState, part: string): Plan | null {
  const chain = PART_CHAIN[part];
  if (!chain) return null;
  const invs = storageInvs(sim);
  for (const step of chain) {
    const r = RECIPES[step.recipe];
    if (!r || (r.unlock && !sim.state.unlocks.includes(r.unlock))) continue;
    if (Object.keys(missingFor(invs, r.inputs)).length) continue;
    // Solo si el paso sirve: la receta final, o un intermedio que de verdad falta.
    if (step.recipe !== part) {
      const final = RECIPES[chain[0]!.recipe];
      const need = final ? missingFor(invs, final.inputs) : {};
      if (!Object.keys(r.outputs).some((id) => need[id])) continue;
    }
    const station = sim.state.ship.modules.find(
      (m) => m.type === step.station && m.status === 'active' && m.fire <= 0 && m.queue.length < 6 && !m.queue.some((j) => j.recipeId === r.id),
    );
    if (!station || blocked(sim, npc, `fabricar:${r.id}`)) continue;
    const t = workTarget(sim, station);
    if (!t) continue;
    return { kind: 'trabajar', prio: PRIO.trabajar, target: t.pos, moduleId: station.id, data: { job: 'fabricar', recipe: r.id, anim: 'reparar', faceYaw: t.faceYaw }, duration: 12 / workMult(sim, npc) };
  }
  return null;
}

function mechanicPlan(sim: Simulation, npc: NpcState): Plan | null {
  const storm = stormNow(sim);
  const cands = sim.state.ship.modules
    .filter((m) => needsFixing(sim, m))
    .filter((m) => !(storm && moduleHasSky(sim, m)))
    .sort((a, b) => (a.status === 'broken' ? 0 : a.leak ? 1 : 2) - (b.status === 'broken' ? 0 : b.leak ? 1 : 2) || a.condition - b.condition);
  let missingPart: { m: ModuleInstance; part: string } | null = null;
  for (const m of cands) {
    if (blocked(sim, npc, `reparar:${m.id}`)) continue;
    const info = repairInfo(sim, m.id, { by: 'npc' });
    if (!info.ok) {
      if (!missingPart && info.part) missingPart = { m, part: info.part };
      continue;
    }
    const t = workTarget(sim, m);
    if (!t) continue;
    return { kind: 'trabajar', prio: PRIO.trabajar, target: t.pos, moduleId: m.id, data: { job: 'reparar', anim: 'reparar', faceYaw: t.faceYaw }, duration: 30 / workMult(sim, npc) };
  }
  if (missingPart && npc.role === 'mecanico') {
    const craft = partsPlan(sim, npc, missingPart.part);
    if (craft) return craft;
    const what = missingPart.part === 'pieza_mecanica' ? 'piezas mecánicas' : 'kits de reparación';
    complain(sim, npc, `Necesito ${what} en el almacén para arreglar ${withArticle(moduleDef(missingPart.m.type).name)}.`, `${npc.name}: «Necesito ${what} en el almacén para reparar ${withArticle(moduleDef(missingPart.m.type).name)}»`);
  }
  for (const g of sim.state.ship.modules) {
    if (g.type !== 'generador' || g.status !== 'active' || !g.on || g.fire > 0) continue;
    if (fuelMinutes(g) >= 90 || !fuelInStorage(sim) || blocked(sim, npc, `combustible:${g.id}`)) continue;
    const t = workTarget(sim, g);
    if (!t) continue;
    return { kind: 'trabajar', prio: PRIO.trabajar, target: t.pos, moduleId: g.id, data: { job: 'combustible', anim: 'reparar', faceYaw: t.faceYaw }, duration: 5 };
  }
  return null;
}

/**
 * Reparaciones que no pueden esperar a la mañana: un depósito que pierde agua (o un incendio ya
 * apagado que dejó una fuga). El mecánico se levanta si tiene con qué arreglarlo.
 */
function urgentRepairPlan(sim: Simulation, npc: NpcState): Plan | null {
  if (sim.state.utilities.waterL < 2) return null;
  const leak = sim.state.ship.modules.find((m) => m.leak && m.status !== 'construction' && m.fire <= 0);
  if (!leak || blocked(sim, npc, `reparar:${leak.id}`)) return null;
  const p = mechanicPlan(sim, npc);
  if (!p) return null;
  if (p.moduleId !== leak.id && (p.data?.job !== 'fabricar')) return null;
  p.prio = PRIO.urgente;
  p.say = 'Una fuga no puede esperar a mañana.';
  return p;
}

function fishPlan(sim: Simulation, npc: NpcState): Plan | null {
  if (stormNow(sim) || blocked(sim, npc, 'pescar')) return null;
  const spots = railSpots(sim).filter((s) => s.side !== 0 && Math.abs(s.pos.y - 3.2) < 0.5);
  const free = spots.filter((s) => !sim.state.npcs.some((n) => n.id !== npc.id && n.task?.targetPos && dist2(n.task.targetPos, s.pos) < 1.5));
  const list = free.length ? free : spots;
  if (!list.length) return null;
  const s = sim.rng.pick(list);
  const session = sim.rng.range(60, 90);
  return {
    kind: 'trabajar',
    prio: PRIO.trabajar,
    target: s.pos,
    data: { job: 'pescar', anim: 'pescar', matchesRole: npc.role === 'pescador', faceYaw: s.yaw, nextCatchAt: -1 },
    duration: session,
  };
}

/** Resto más interesante al alcance de la borda (las balsas primero). */
function hookTarget(sim: Simulation, npc: NpcState, raftsOnly = false): Plan | null {
  const b = hullBounds(sim);
  let best: { id: number; spot: RailSpot; score: number } | null = null;
  const drift = driftSpeed(sim);
  for (const d of sim.state.debris) {
    const raft = (d.survivors ?? 0) > 0;
    if (raftsOnly && !raft) continue;
    if (Math.abs(d.pos.z) - b.halfW > HOOK_RANGE - 2) continue;
    if (sim.state.npcs.some((n) => n.id !== npc.id && n.task?.data && (n.task.data as TaskData)['debrisId'] === d.id)) continue;
    // Dónde estará cuando lleguemos (aprox.).
    const eta = Math.min(8, dist2(npc.pos, { x: d.pos.x, y: 0, z: d.pos.z }) / NPC_WALK_SPEED);
    const fx = d.pos.x - drift * (eta + 3);
    if (fx < b.sternX - 6 || fx > b.bowX + 30) continue;
    const spot = railSpotNear(sim, clamp(fx, b.sternX + 1, b.bowX - 1), Math.sign(d.pos.z));
    if (!spot) continue;
    const reach = Math.hypot(spot.pos.x - fx, spot.pos.z - d.pos.z);
    if (reach > COLLECT_RANGE - 3) continue;
    const score = reach + (raft ? -100 : 0) + (d.eventId !== undefined ? -20 : 0);
    if (!best || score < best.score) best = { id: d.id, spot, score };
  }
  if (!best) return null;
  const isRaft = (sim.state.debris.find((d) => d.id === best!.id)?.survivors ?? 0) > 0;
  return {
    kind: 'trabajar',
    prio: isRaft ? PRIO.balsa : PRIO.trabajar,
    target: best.spot.pos,
    data: { job: 'gancho', debrisId: best.id, anim: 'gancho', matchesRole: npc.role === 'recolector', faceYaw: best.spot.yaw, waitUntil: -1 },
    duration: 3,
    ...(isRaft ? { say: '¡Una balsa! ¡Voy con el gancho!' } : {}),
  };
}

function hookPlan(sim: Simulation, npc: NpcState): Plan | null {
  if (stormNow(sim) || blocked(sim, npc, 'gancho')) return null;
  return hookTarget(sim, npc);
}

function buildPlan(sim: Simulation, npc: NpcState): Plan | null {
  if (blocked(sim, npc, 'construir')) return null;
  const st = sim.state;
  const helpers = (id: number) => st.npcs.filter((n) => n.id !== npc.id && n.task?.kind === 'construir' && n.task.targetModuleId === id).length;
  const storm = stormNow(sim);
  for (const m of st.ship.modules) {
    if (m.status !== 'construction' || helpers(m.id) >= MAX_BUILDERS) continue;
    const c = moduleCenter(m, st.ship.width);
    const p = { x: c.x, y: c.y, z: c.z };
    if (storm && !isIndoorAt(sim, p)) continue;
    const spot = snapReachable(sim, p, 6);
    if (!spot) continue;
    return { kind: 'construir', prio: PRIO.construir, target: spot, moduleId: m.id, data: { anim: 'construir', faceYaw: yawTo(spot, c) }, duration: 60 };
  }
  if (st.ship.expansion && helpers(-1) < MAX_BUILDERS && !storm) {
    const spot = snapReachable(sim, expansionWorkPoint(sim), 4);
    if (spot) return { kind: 'construir', prio: PRIO.construir, target: spot, moduleId: -1, data: { anim: 'construir', faceYaw: -Math.PI / 2 }, duration: 60 };
  }
  return null;
}

function workPlan(sim: Simulation, npc: NpcState): Plan | null {
  if (npc.sick || npc.injured) return null;
  if (npc.needs.mood < 15) {
    complain(sim, npc, 'No pienso mover un dedo hasta que mejoren las cosas.', `${npc.name} se niega a trabajar: su ánimo está por los suelos`);
    return null;
  }
  let p: Plan | null = null;
  switch (npc.role) {
    case 'cocinero':
      p = cookPlan(sim, npc);
      break;
    case 'jardinero':
      p = gardenPlan(sim, npc);
      break;
    case 'mecanico':
      p = mechanicPlan(sim, npc) ?? buildPlan(sim, npc);
      break;
    case 'pescador':
      p = fishPlan(sim, npc);
      break;
    case 'recolector':
      p = hookPlan(sim, npc);
      break;
    default:
      p = buildPlan(sim, npc);
  }
  if (p) return p;
  // Si no hay nada propio que hacer: obras y, si falta comida, a pescar.
  p = buildPlan(sim, npc);
  if (p) return p;
  if (foodLow(sim) && readyFoodCount(sim) + storageCount(sim, 'pescado_crudo') < presentCount(sim)) {
    const f = fishPlan(sim, npc);
    if (f) {
      f.say = 'Si no hay comida, habrá que pescarla.';
      return f;
    }
  }
  if (npc.role === 'libre' || npc.role === 'pescador') return hookPlan(sim, npc);
  return null;
}

/* ---- Ocio ---- */

function leisurePlan(sim: Simulation, npc: NpcState): Plan {
  const storm = stormNow(sim);
  const hour = hourOf(sim.state.time);
  const night = isNightFor(npc, hour);
  if (npc.injured || npc.sick) {
    return { kind: 'ocio', prio: PRIO.ocio, target: null, data: { job: 'reposo' }, duration: 20 };
  }
  const weights: Record<string, number> = { quieto: 1 };
  const partner = chatPartner(sim, npc);
  if (partner && !blocked(sim, npc, 'charlar')) weights['charlar'] = npc.trait === 'hablador' ? 6 : 3;
  weights['sentarse'] = 2;
  if (!storm && !night) {
    weights['mirar'] = 2;
    weights['pasear'] = 2;
  }
  const pick = sim.rng.weighted(weights) ?? 'quieto';
  switch (pick) {
    case 'charlar': {
      const p = partner!;
      const near = snapReachable(sim, { x: p.pos.x + Math.sin(sim.rng.range(0, 6.28)) * 1.1, y: p.pos.y, z: p.pos.z + Math.cos(sim.rng.range(0, 6.28)) * 1.1 }, 2) ?? snapReachable(sim, p.pos, 2);
      if (near) return { kind: 'charlar', prio: PRIO.ocio, target: near, data: { partner: p.id }, duration: sim.rng.range(12, 20) };
      break;
    }
    case 'sentarse': {
      const seat = freeSeat(sim, npc);
      if (seat) return { kind: 'ocio', prio: PRIO.ocio, target: seat.pos, data: { job: 'sentarse', seatKey: seat.key }, duration: sim.rng.range(20, 40) };
      break;
    }
    case 'mirar': {
      const s = sim.rng.pick(railSpots(sim).length ? railSpots(sim) : [null]);
      if (s) return { kind: 'ocio', prio: PRIO.ocio, target: s.pos, data: { job: 'mirar', faceYaw: s.yaw }, duration: sim.rng.range(10, 20) };
      break;
    }
    case 'pasear': {
      const p = deckSpot(sim);
      if (p) return { kind: 'ocio', prio: PRIO.ocio, target: p, data: { job: 'pasear' }, duration: sim.rng.range(5, 15) };
      break;
    }
    default:
      break;
  }
  if (storm && !isIndoorAt(sim, npc.pos)) {
    const spot = indoorSpot(sim, npc.pos);
    if (spot) return { kind: 'refugio', prio: PRIO.refugio, target: spot, duration: 30 };
  }
  return { kind: 'ocio', prio: PRIO.ocio, target: null, data: { job: 'quieto' }, duration: sim.rng.range(6, 14) };
}

/** Alguien con quien charlar: presente, despierto y sin nada urgente, a menos de 25 m. */
function chatPartner(sim: Simulation, npc: NpcState): NpcState | null {
  let best: NpcState | null = null;
  let bestD = 25;
  for (const n of sim.state.npcs) {
    if (n.id === npc.id || !isPresent(n)) continue;
    if (n.activity === 'sleeping' || n.activity === 'walking') continue;
    const k = n.task?.kind;
    if (k && k !== 'ocio') continue;
    if (Math.abs(n.pos.y - npc.pos.y) > 1.5) continue;
    const d = dist2(n.pos, npc.pos);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Decisión                                                            */
/* ------------------------------------------------------------------ */

function blocked(sim: Simulation, npc: NpcState, key: string): boolean {
  return (memoOf(sim, npc).blocked[key] ?? -Infinity) > sim.state.time;
}

function fit(npc: NpcState): boolean {
  return !npc.injured && npc.needs.health > 30;
}

/** Módulo en llamas que necesita más manos (o null). */
function fireToFight(sim: Simulation, npc: NpcState): ModuleInstance | null {
  if (!fit(npc)) return null;
  let best: ModuleInstance | null = null;
  let bestN = Infinity;
  for (const m of burningModules(sim)) {
    const n = sim.state.npcs.filter((o) => o.id !== npc.id && o.task?.kind === 'apagar' && o.task.targetModuleId === m.id).length;
    if (n >= MAX_FIREFIGHTERS) continue;
    if (blocked(sim, npc, `apagar:${m.id}`)) continue;
    if (n < bestN) {
      bestN = n;
      best = m;
    }
  }
  return best;
}

function firePlan(sim: Simulation, m: ModuleInstance): Plan | null {
  // Punto alcanzable junto al fuego (dentro de la habitación o delante del equipo).
  const spot = moduleSpot(sim, m)?.pos ?? null;
  if (!spot || distanceToModule(sim, m, spot) > FIRE_REACH) {
    // Buscar cualquier nodo alcanzable pegado a las celdas del módulo.
    for (const c of moduleCells(m)) {
      if (c.level !== m.level) continue;
      const cc = cellCenter(c.x, c.z, sim.state.ship.width);
      const p = snapReachable(sim, { x: cc.x, y: levelY(c.level), z: cc.z }, 4);
      if (p && distanceToModule(sim, m, p) <= FIRE_REACH) return { kind: 'apagar', prio: PRIO.apagar, target: p, moduleId: m.id, duration: 999 };
    }
    return null;
  }
  return { kind: 'apagar', prio: PRIO.apagar, target: spot, moduleId: m.id, duration: 999 };
}

/** Emergencias que se adelantan a la tarea en curso. */
function emergencyPlan(sim: Simulation, npc: NpcState): Plan | null {
  const cur = npc.task?.kind;
  const curPrio = td(npc).prio;
  if (cur === 'partir' || cur === 'expedicion') return null;
  const fire = cur === 'apagar' ? null : fireToFight(sim, npc);
  if (fire) {
    const p = firePlan(sim, fire);
    if (p) {
      const lugar = withArticle(moduleDef(fire.type).name);
      p.say = hashPick(LINES.fireAlarm, npc.id + fire.id).replace('{lugar}', lugar);
      return p;
    }
    memoOf(sim, npc).blocked[`apagar:${fire.id}`] = sim.state.time + 10;
  }
  if (cur === 'apagar') return null;
  const desperate = (npc.needs.thirst < 12 && (cur === 'beber' || !!drinkPlan(sim, npc, 0))) || (npc.needs.hunger < 12 && (cur === 'comer' || !!bestFood(sim)));
  if (stormNow(sim) && cur !== 'refugio' && !desperate && !isIndoorAt(sim, npc.pos)) {
    // ¿Va de camino a un interior? Entonces no hace falta cambiar.
    const tp = npc.task?.targetPos;
    if (!(tp && isIndoorAt(sim, tp) && td(npc).phase === 'go')) {
      const spot = indoorSpot(sim, npc.pos);
      if (spot) return { kind: 'refugio', prio: PRIO.refugio, target: spot, duration: 60 };
    }
  }
  const disc = discussionOf(sim, npc.id);
  if (disc && sim.state.time < disc.argueUntil && cur !== 'discutir' && curPrio < PRIO.discutir && npc.activity !== 'sleeping') {
    const other = sim.state.npcs.find((n) => n.id === disc.other);
    if (other && isPresent(other)) {
      const near = snapReachable(sim, { x: other.pos.x + 1, y: other.pos.y, z: other.pos.z }, 2) ?? snapReachable(sim, other.pos, 2);
      if (near) return { kind: 'discutir', prio: PRIO.discutir, target: near, data: { partner: other.id }, duration: Math.max(5, disc.argueUntil - sim.state.time) };
    }
  }
  // Balsa de náufragos: el recolector (o quien no tenga puesto) acude con el gancho.
  if (curPrio < PRIO.balsa && npc.activity !== 'sleeping' && (npc.role === 'recolector' || npc.role === 'libre') && !stormNow(sim) && fit(npc)) {
    if (sim.state.debris.some((d) => (d.survivors ?? 0) > 0)) {
      const p = hookTarget(sim, npc, true);
      if (p) return p;
    }
  }
  return null;
}

function shouldSleep(sim: Simulation, npc: NpcState): { prio: number; nap: boolean } | null {
  const hour = hourOf(sim.state.time);
  if (npc.needs.energy < 15) return { prio: PRIO.dormirAgotado, nap: !isNightFor(npc, hour) };
  if (isNightFor(npc, hour)) return { prio: PRIO.dormir, nap: false };
  return null;
}

function isMealTime(hour: number): boolean {
  return MEAL_HOURS.some((h) => hour >= h && hour < h + 1);
}

/** Elige lo más importante que hacer ahora. */
function decide(sim: Simulation, npc: NpcState): Plan | null {
  const n = npc.needs;
  const hour = hourOf(sim.state.time);
  const mem = memoOf(sim, npc);
  const e = emergencyPlan(sim, npc);
  if (e) return e;
  const candidates: Plan[] = [];
  const add = (p: Plan | null) => {
    if (p) candidates.push(p);
  };
  // Necesidades urgentes.
  if (n.thirst < 20 && !blocked(sim, npc, 'beber')) {
    const p = drinkPlan(sim, npc, PRIO.beberUrgente);
    if (p) add(p);
    else complainThirst(sim, npc);
  }
  if (n.hunger < 25 && !blocked(sim, npc, 'comer')) {
    const p = eatPlan(sim, npc, PRIO.comerUrgente);
    if (p) add(p);
    else complainHunger(sim, npc);
  }
  const sl = shouldSleep(sim, npc);
  if (sl) {
    add(sleepPlan(sim, npc, sl.prio, sl.nap));
    if (!npc.bed && sl.prio === PRIO.dormir) complain(sim, npc, 'No tengo cama: dormiré en el suelo de la bodega.', `${npc.name}: «No tengo cama: necesitamos un camarote o un dormitorio»`);
  }
  if ((npc.sick || npc.injured) && !blocked(sim, npc, 'descansar')) {
    add(restPlan(sim, npc));
    if (npc.sick && sim.rng.chance(0.3)) complain(sim, npc, sim.rng.pick(LINES.sick), `${npc.name} está ${npcAdj(npc, 'enfermo')}: un botiquín o la enfermería le curarían`);
  }
  if (n.thirst < 45 && !blocked(sim, npc, 'beber')) add(drinkPlan(sim, npc, PRIO.beber));
  if ((n.hunger < 40 || (isMealTime(hour) && n.hunger < 75 && sim.state.time - mem.lastMealAt > 180)) && !blocked(sim, npc, 'comer')) {
    const p = eatPlan(sim, npc, PRIO.comer);
    if (p) add(p);
    else if (n.hunger < 40) complainHunger(sim, npc);
  }
  if (isWorkHour(hour) && !sl) add(workPlan(sim, npc));
  else if (npc.role === 'mecanico' && !npc.sick && !npc.injured && n.energy > 10) add(urgentRepairPlan(sim, npc));
  if (!candidates.length) return sl ? null : leisurePlan(sim, npc);
  candidates.sort((a, b) => b.prio - a.prio);
  return candidates[0]!;
}

/* ------------------------------------------------------------------ */
/* Quejas                                                              */
/* ------------------------------------------------------------------ */

function complain(sim: Simulation, npc: NpcState, line: string, notice?: string): void {
  const now = sim.state.time;
  if (now - npc.lastComplaintAt < COMPLAINT_COOLDOWN) return;
  npc.lastComplaintAt = now;
  say(sim, npc, line, 8);
  const lm = lifeMemo(sim);
  if (notice && now - lm.complainAt > 20) {
    lm.complainAt = now;
    sim.notify(notice, 'warn');
  }
}

function complainHunger(sim: Simulation, npc: NpcState): void {
  complain(sim, npc, sim.rng.pick(LINES.hungry), `${npc.name}: «No queda comida en los almacenes»`);
}

function complainThirst(sim: Simulation, npc: NpcState): void {
  complain(sim, npc, sim.rng.pick(LINES.thirsty), `${npc.name}: «No queda agua potable a bordo»`);
}

/* ------------------------------------------------------------------ */
/* Acción en curso                                                     */
/* ------------------------------------------------------------------ */

function finishTask(sim: Simulation, npc: NpcState): void {
  clearTask(sim, npc);
  memoOf(sim, npc).nextDecideAt = sim.state.time;
}

function tickGo(sim: Simulation, npc: NpcState, dt: number): void {
  const t = npc.task!;
  const d = td(npc);
  const now = sim.state.time;
  const mem = memoOf(sim, npc);
  if (typeof d.deadline === 'number' && now > d.deadline) {
    if (t.kind === 'partir') depart(sim, npc); // el bote no espera: embarca donde esté
    else abortTask(sim, npc, d.job ?? t.kind, 15);
    return;
  }
  if (!npc.path.length) {
    if (t.targetPos && dist2(npc.pos, t.targetPos) > 0.3) {
      if (!planPath(sim, npc, t.targetPos)) {
        if (t.kind === 'partir') depart(sim, npc);
        else abortTask(sim, npc, d.job ?? t.kind, 20);
        return;
      }
    } else {
      arrive(sim, npc);
      return;
    }
  }
  npc.activity = 'walking';
  const arrived = walk(sim, npc, dt, walkSpeed(npc, t.kind === 'apagar' || t.kind === 'refugio' || d.prio >= PRIO.balsa));
  if (arrived) {
    arrive(sim, npc);
    return;
  }
  // Atascos: si no se acerca al siguiente punto en 3 min, replanificar (dos veces como mucho).
  const wp = npc.path[0];
  if (wp) {
    const dd = dist2(npc.pos, wp) + Math.abs(npc.pos.y - wp.y);
    if (npc.path.length !== mem.progressLeft) {
      mem.progressLeft = npc.path.length;
      mem.progressDist = dd;
      mem.progressAt = now;
    } else if (dd < mem.progressDist - 0.05) {
      mem.progressDist = dd;
      mem.progressAt = now;
    } else if (now - mem.progressAt > 3) {
      lifeMemo(sim).stats.replans++;
      mem.replans++;
      mem.progressAt = now;
      mem.progressDist = Infinity;
      ensureOnNav(sim, npc);
      if (mem.replans > 2 || !t.targetPos || !planPath(sim, npc, t.targetPos)) abortTask(sim, npc, d.job ?? t.kind, 20);
    }
  }
}

function tickAct(sim: Simulation, npc: NpcState, dt: number): void {
  const t = npc.task!;
  const d = td(npc);
  const now = sim.state.time;
  const hour = hourOf(now);
  const until = t.until ?? now;
  switch (t.kind as TaskKind) {
    case 'dormir': {
      npc.activity = 'sleeping';
      const n = npc.needs;
      const fire = fit(npc) && fireToFight(sim, npc);
      const starving = n.hunger < 10 || n.thirst < 10;
      const night = isNightFor(npc, hour);
      const rested = d['nap'] ? n.energy >= 60 : !night && n.energy >= 30;
      // El mecánico se levanta para una fuga (comprobado cada 10 min).
      let urgent = false;
      const mem = memoOf(sim, npc);
      if (npc.role === 'mecanico' && n.energy > 40 && now >= mem.nextDecideAt) {
        mem.nextDecideAt = now + DECIDE_EVERY;
        urgent = !!urgentRepairPlan(sim, npc);
      }
      if (fire || starving || rested || urgent || (!night && n.energy >= 98)) {
        finishTask(sim, npc);
        if (!night && !fire && !starving && sim.rng.chance(0.3)) sayFrom(sim, npc, ['¡Buenos días!', 'Qué bien he dormido.', '*bostezo*']);
      }
      return;
    }
    case 'descansar': {
      npc.activity = 'sleeping';
      if ((!npc.sick && !npc.injured) || now >= until || npc.needs.hunger < 15 || npc.needs.thirst < 15 || (fit(npc) && fireToFight(sim, npc))) finishTask(sim, npc);
      return;
    }
    case 'comer':
      if (now >= until) {
        finishEating(sim, npc);
        finishTask(sim, npc);
      }
      return;
    case 'beber':
      if (now >= until) {
        finishDrinking(sim, npc);
        finishTask(sim, npc);
      }
      return;
    case 'trabajar':
      tickWork(sim, npc);
      return;
    case 'construir': {
      const id = t.targetModuleId ?? -2;
      const site = id === -1 ? sim.state.ship.expansion : findModule(sim, id)?.status === 'construction' ? findModule(sim, id) : null;
      if (!site || now >= until) {
        finishTask(sim, npc);
        return;
      }
      npc.activity = 'building';
      chatter(sim, npc, LINES.build);
      return;
    }
    case 'apagar': {
      const m = findModule(sim, t.targetModuleId ?? -1);
      if (!m || !(m.fire > 0)) {
        if (m && sim.rng.chance(0.5)) sayFrom(sim, npc, LINES.fireOut);
        finishTask(sim, npc);
        return;
      }
      if (distanceToModule(sim, m, npc.pos) > FIRE_REACH + 0.5 || !fit(npc)) {
        abortTask(sim, npc, `apagar:${m.id}`, 5);
        return;
      }
      npc.activity = 'firefighting';
      m.fire = Math.max(0, m.fire - FIREFIGHT_RATE * (traitOf(npc).braveryMult ?? 1) * dt);
      if (sim.rng.chance(0.02 * dt)) sayFrom(sim, npc, LINES.firefight);
      return;
    }
    case 'refugio':
      npc.activity = 'sheltering';
      if (!stormNow(sim) || now >= until || npc.needs.thirst < 12 || npc.needs.hunger < 12) finishTask(sim, npc);
      else if (sim.rng.chance(0.01 * dt)) sayFrom(sim, npc, (traitOf(npc).stormFear ?? 1) > 1 ? LINES.stormFear : LINES.storm);
      return;
    case 'charlar': {
      const other = sim.state.npcs.find((n) => n.id === d['partner']);
      if (!other || !isPresent(other) || other.activity === 'sleeping' || now >= until) {
        const mem = memoOf(sim, npc);
        mem.chatAt = now;
        mem.blocked['charlar'] = now + 90;
        finishTask(sim, npc);
        return;
      }
      npc.activity = 'socializing';
      npc.yaw = yawTo(npc.pos, other.pos);
      // El otro también charla (si estaba libre).
      if (!other.task || other.task.kind === 'ocio') {
        if (other.task?.kind !== 'charlar') {
          startPlan(sim, other, { kind: 'charlar', prio: PRIO.ocio, target: null, data: { partner: npc.id }, duration: Math.max(3, until - now) });
        }
      }
      if (sim.rng.chance(0.08 * dt)) sayFrom(sim, npc, npc.trait === 'hablador' ? [...LINES.chat, ...(LINES.trait['hablador'] ?? [])] : LINES.chat);
      return;
    }
    case 'discutir': {
      const disc = discussionOf(sim, npc.id);
      const other = disc ? sim.state.npcs.find((n) => n.id === disc.other) : undefined;
      if (!disc || now >= disc.argueUntil || !other || !isPresent(other)) {
        finishTask(sim, npc);
        return;
      }
      npc.activity = 'socializing';
      npc.yaw = yawTo(npc.pos, other.pos);
      if (sim.rng.chance(0.12 * dt)) sayFrom(sim, npc, LINES.argue);
      return;
    }
    case 'ocio':
      npc.activity = npc.injured ? 'injured' : 'idle';
      if (now >= until) finishTask(sim, npc);
      else if (d.job !== 'reposo') chatter(sim, npc, [...LINES.leisure, ...(LINES.trait[npc.trait] ?? [])]);
      return;
    default:
      if (now >= until) finishTask(sim, npc);
  }
}

function tickWork(sim: Simulation, npc: NpcState): void {
  const t = npc.task!;
  const d = td(npc);
  const now = sim.state.time;
  const until = t.until ?? now;
  npc.activity = d['matchesRole'] === false ? 'idle' : 'working';
  switch (d.job) {
    case 'pescar': {
      if (stormNow(sim) || now >= until) {
        finishTask(sim, npc);
        return;
      }
      if ((d['nextCatchAt'] as number) < 0) d['nextCatchAt'] = now + sim.rng.range(45, 75) / (fishingMultiplier(sim) * workMult(sim, npc));
      if (now >= (d['nextCatchAt'] as number)) {
        const c = rollCatch(sim);
        storeOrDrop(sim, [c], npc.pos, 'Capturas');
        if (c.id === 'pescado_crudo') {
          onFishCaught(sim, c.qty);
          if (sim.rng.chance(0.5)) say(sim, npc, c.qty > 1 ? '¡Dos de golpe!' : '¡Uno más para la cena!');
        } else say(sim, npc, `Vaya… ${itemName(c.id).toLowerCase()}.`);
        d['nextCatchAt'] = now + sim.rng.range(45, 75) / (fishingMultiplier(sim) * workMult(sim, npc));
      }
      chatter(sim, npc, LINES.work.pescador);
      return;
    }
    case 'gancho': {
      const id = d['debrisId'] as number;
      const deb = sim.state.debris.find((x) => x.id === id);
      if (!deb) {
        finishTask(sim, npc);
        return;
      }
      npc.yaw = yawTo(npc.pos, { x: deb.pos.x, z: deb.pos.z });
      if (now < until) return;
      const dist = Math.hypot(deb.pos.x - npc.pos.x, deb.pos.z - npc.pos.z);
      if (dist <= COLLECT_RANGE - 1) {
        const raft = (deb.survivors ?? 0) > 0;
        npcCollectDebris(sim, id, npc.pos);
        say(sim, npc, raft ? '¡Agarraos, os subo!' : hashPick(LINES.work.recolector, `${npc.id}${id}`));
        memoOf(sim, npc).blocked['gancho'] = now + sim.rng.range(20, 40);
        finishTask(sim, npc);
        return;
      }
      // Aún lejos: esperar a que la corriente lo acerque (como mucho 15 min).
      if ((d['waitUntil'] as number) < 0) d['waitUntil'] = now + 15;
      if (deb.pos.x > npc.pos.x - 2 && now < (d['waitUntil'] as number)) {
        t.until = now + 1;
        return;
      }
      abortTask(sim, npc, 'gancho', 10);
      return;
    }
    case 'vigilar': {
      const k = findModule(sim, t.targetModuleId ?? -1);
      if (!k || !k.queue.length || now >= until) {
        finishTask(sim, npc);
        return;
      }
      chatter(sim, npc, LINES.work.cocinero);
      return;
    }
    default:
      break;
  }
  if (now < until) {
    chatter(sim, npc, LINES.work[npc.role] ?? LINES.work.libre);
    return;
  }
  // Fin del trabajo: el efecto real se aplica al terminar.
  const m = t.targetModuleId !== undefined ? findModule(sim, t.targetModuleId) : undefined;
  const plot = d['plot'] as number;
  switch (d.job) {
    case 'reparar':
      if (m) {
        const r = repair(sim, m.id, { by: 'npc' });
        if (r.ok) {
          say(sim, npc, '¡Arreglado!');
          sim.notify(`${npc.name} ha reparado ${withArticle(moduleDef(m.type).name)}`, 'good');
        } else memoOf(sim, npc).blocked[`reparar:${m.id}`] = now + 60;
      }
      break;
    case 'sembrar': {
      const seed = seedFor(sim);
      if (m && seed && !plant(sim, m.id, plot, seed, { by: 'npc' }).ok) memoOf(sim, npc).blocked[`sembrar:${m.id}:${plot}`] = now + 120;
      break;
    }
    case 'cosechar':
      if (m && !harvest(sim, m.id, plot, { by: 'npc' }).ok) memoOf(sim, npc).blocked[`cosechar:${m.id}:${plot}`] = now + 60;
      else if (m) say(sim, npc, '¡Buena cosecha!');
      break;
    case 'cuidar':
      if (m && !tendPlot(sim, m.id, plot).ok) memoOf(sim, npc).blocked[`cuidar:${m.id}:${plot}`] = now + 60;
      break;
    case 'botellas': {
      const u = sim.state.utilities;
      let filled = 0;
      while (filled < 3 && u.waterL - WATER_PER_DRINK >= Math.max(8, u.water.capacityL * 0.25)) {
        if (depositToStorage(sim, 'agua_potable', 1) > 0) break;
        u.waterL -= WATER_PER_DRINK;
        filled++;
      }
      memoOf(sim, npc).blocked['botellas'] = now + 120;
      break;
    }
    case 'cocinar':
    case 'leña':
    case 'combustible':
      break;
    default:
      break;
  }
  finishTask(sim, npc);
}

function chatter(sim: Simulation, npc: NpcState, lines: readonly string[]): void {
  const mem = memoOf(sim, npc);
  const now = sim.state.time;
  if (now < mem.chatterAt) return;
  mem.chatterAt = now + sim.rng.range(40, 110);
  if (npc.say && npc.say.until > now) return;
  sayFrom(sim, npc, lines);
}

/* ------------------------------------------------------------------ */
/* Necesidades, ánimo y salud                                          */
/* ------------------------------------------------------------------ */

function onBed(npc: NpcState): boolean {
  const k = npc.task?.kind;
  if (k === 'descansar') return true;
  return k === 'dormir' && td(npc)['bed'] === true;
}

function inHealingBed(sim: Simulation, npc: NpcState): boolean {
  if (npc.task?.kind !== 'descansar' || npc.activity !== 'sleeping') return false;
  const id = td(npc)['restModuleId'];
  if (typeof id !== 'number') return false;
  const m = findModule(sim, id);
  return !!m && !!moduleDef(m.type).healingBeds;
}

function nearFire(sim: Simulation, npc: NpcState): boolean {
  for (const m of burningModules(sim)) {
    if (m.level !== levelOfY(npc.pos.y)) continue;
    if (distanceToModule(sim, m, npc.pos) < 1.5) return true;
  }
  return false;
}

function moodTarget(sim: Simulation, npc: NpcState): number {
  const mem = memoOf(sim, npc);
  const now = sim.state.time;
  const tr = traitOf(npc);
  const n = npc.needs;
  let t = 60 + (tr.moodBias ?? 0);
  const home = npc.task?.kind === 'descansar' ? ((td(npc)['homeBed'] as { moduleId: number } | null) ?? null) : npc.bed;
  const homeType = home ? findModule(sim, home.moduleId)?.type : undefined;
  if (homeType === 'camarote') t += 10;
  else if (homeType === 'dormitorio') t += 4;
  else if (!home) t -= 15;
  if (now - mem.ateCookedAt < 8 * 60) t += 8;
  if (now - mem.comedorAt < 8 * 60) t += 5;
  if (stormNow(sim)) t -= 10 * (tr.stormFear ?? 1);
  if (n.hunger < 30) t -= 15;
  if (n.thirst < 30) t -= 15;
  if (npc.sick || npc.injured) t -= 10;
  if (now - mem.chatAt < 4 * 60) t += 5;
  if (discussionOf(sim, npc.id)) t -= 10;
  return clamp(t, 0, 100);
}

function tickNeedsOf(sim: Simulation, npc: NpcState, dt: number): void {
  const h = dt / 60;
  const n = npc.needs;
  const tr = traitOf(npc);
  const mem = memoOf(sim, npc);
  const sleeping = npc.activity === 'sleeping';
  const k = sleeping ? 0.5 : 1;
  n.hunger = clamp(n.hunger - NPC_RATES.hungerPerHour * (tr.hungerMult ?? 1) * k * h, 0, 100);
  n.thirst = clamp(n.thirst - NPC_RATES.thirstPerHour * k * h, 0, 100);
  if (sleeping) n.energy = clamp(n.energy + (onBed(npc) ? NPC_RATES.sleepBedPerHour : NPC_RATES.sleepFloorPerHour) * h, 0, 100);
  else {
    const effort = npc.activity === 'firefighting' || npc.activity === 'building' || npc.activity === 'working' ? 1.15 : 1;
    n.energy = clamp(n.energy - NPC_RATES.energyPerHour * (tr.energyMult ?? 1) * effort * h, 0, 100);
  }
  // Salud.
  let dmg = 0;
  if (n.hunger <= 0 || n.thirst <= 0) {
    dmg += NPC_RATES.starvingDamagePerHour;
    mem.lastHarm = n.thirst <= 0 ? 'sed' : 'hambre';
  }
  if (npc.sick) {
    dmg += NPC_RATES.sickDamagePerHour;
    if (!(n.hunger <= 0 || n.thirst <= 0)) mem.lastHarm = 'enfermedad';
  }
  if (nearFire(sim, npc)) {
    dmg += NPC_RATES.fireDamagePerHour;
    mem.lastHarm = 'fuego';
  }
  const healing = inHealingBed(sim, npc);
  if (dmg > 0) n.health = clamp(n.health - dmg * h, 0, 100);
  else if (n.hunger > 30 && n.thirst > 30) n.health = clamp(n.health + NPC_RATES.regenPerHour * (healing ? 3 : 1) * (sleeping ? 1.5 : 1) * h, 0, 100);
  if (npc.injured && n.health >= INJURY_HEALED_AT) {
    npc.injured = false;
    say(sim, npc, 'Ya estoy mucho mejor.');
  }
  if (npc.sick && sim.rng.chance(1 - Math.pow(1 - (healing ? CURE_PER_HOUR_INFIRMARY : CURE_PER_HOUR_NATURAL), h))) {
    npc.sick = false;
    say(sim, npc, '¡Por fin se me ha pasado la fiebre!');
    onNpcCured(sim, npc);
  }
  // Ánimo.
  const target = moodTarget(sim, npc);
  const delta = target - n.mood;
  n.mood = clamp(n.mood + Math.sign(delta) * Math.min(Math.abs(delta), NPC_RATES.moodPerHour * h), 0, 100);
}

const DEATH_TEXT: Record<string, string> = {
  hambre: 'ha muerto de hambre',
  sed: 'ha muerto de sed',
  enfermedad: 'no ha superado la enfermedad',
  fuego: 'ha muerto en el incendio',
  heridas: 'ha muerto por sus heridas',
};

function killNpc(sim: Simulation, npc: NpcState): void {
  const st = sim.state;
  const mem = memoOf(sim, npc);
  cleanupTask(sim, npc);
  if (npc.carry) spawnCrate(sim, { ...npc.pos }, [npc.carry], `Pertenencias de ${npc.name}`);
  for (const m of st.ship.modules) m.beds.forEach((o, i) => (o === npc.id ? (m.beds[i] = null) : null));
  st.npcs = st.npcs.filter((n) => n.id !== npc.id);
  lifeMemo(sim).npcs.delete(npc.id);
  for (const o of st.npcs) o.needs.mood = clamp(o.needs.mood - 20, 0, 100);
  sim.log(`${npc.name} ${DEATH_TEXT[mem.lastHarm] ?? DEATH_TEXT['heridas']}. La tripulación está de luto.`, 'danger');
  sim.bus.emit('sfx', { name: 'muerte', x: npc.pos.x, y: npc.pos.y + 1, z: npc.pos.z });
  onNpcDied(sim, npc);
}

/* ------------------------------------------------------------------ */
/* Expediciones (las lanza events.ts)                                  */
/* ------------------------------------------------------------------ */

/** Habitantes que pueden salir de expedición (sanos, presentes y descansados), los más idóneos primero. */
export function availableForExpedition(sim: Simulation): NpcState[] {
  const rank: Record<NpcRole, number> = { libre: 0, recolector: 1, pescador: 2, jardinero: 3, mecanico: 4, cocinero: 5 };
  return sim.state.npcs
    .filter((n) => isPresent(n) && !n.sick && !n.injured && n.needs.health >= 60 && n.needs.energy >= 25 && n.task?.kind !== 'partir' && n.task?.kind !== 'apagar')
    .sort((a, b) => rank[a.role] - rank[b.role] || b.needs.energy - a.needs.energy);
}

/** Manda a un habitante hacia la borda para embarcar en el bote. */
export function sendOnExpedition(sim: Simulation, npc: NpcState, eventId: number, returnAt: number): void {
  const spot = railSpotNear(sim, npc.pos.x, undefined, npc.pos.y);
  const ok = startPlan(sim, npc, { kind: 'partir', prio: PRIO.expedicion, target: spot?.pos ?? null, data: { eventId, returnAt, faceYaw: spot?.yaw }, say: sim.rng.pick(LINES.depart) });
  if (!ok || !npc.task) {
    npc.task = { kind: 'partir', data: { phase: 'act', prio: PRIO.expedicion, deadline: NO_DEADLINE, eventId, returnAt } };
    depart(sim, npc);
  } else {
    // Se embarca como muy tarde a los 15 min (aunque no llegue a la borda).
    td(npc).deadline = Math.min(td(npc).deadline, sim.state.time + 15);
  }
}

function depart(sim: Simulation, npc: NpcState): void {
  const d = td(npc);
  const eventId = d['eventId'] as number;
  const returnAt = d['returnAt'] as number;
  cleanupTask(sim, npc);
  npc.path = [];
  npc.activity = 'away';
  npc.awayUntil = returnAt;
  npc.say = null;
  npc.task = { kind: 'expedicion', data: { phase: 'act', prio: PRIO.expedicion, deadline: NO_DEADLINE, eventId } };
}

/** Vuelta de la expedición: reaparece junto a la borda, cansado y con hambre. */
export function returnFromExpedition(sim: Simulation, npc: NpcState): void {
  const spot = railSpotNear(sim, 0, undefined, 3.2);
  const p = spot?.pos ?? snapReachable(sim, sim.collision.safeSpawn(), 6) ?? npc.pos;
  npc.pos = { ...p };
  npc.yaw = spot ? spot.yaw + Math.PI : npc.yaw;
  npc.awayUntil = null;
  npc.task = null;
  npc.path = [];
  npc.activity = npc.injured ? 'injured' : 'idle';
  npc.needs.hunger = clamp(npc.needs.hunger - 15, 0, 100);
  npc.needs.thirst = clamp(npc.needs.thirst - 20, 0, 100);
  npc.needs.energy = clamp(npc.needs.energy - 20, 0, 100);
  npc.needs.mood = clamp(npc.needs.mood + 6, 0, 100);
  say(sim, npc, sim.rng.pick(LINES.back));
  memoOf(sim, npc).nextDecideAt = sim.state.time + 2;
}

/** events.ts avisa de que un evento ha terminado: se sueltan las tareas que dependían de él. */
export function onNpcEventEnded(sim: Simulation, ev: ActiveEvent): void {
  if (ev.type !== 'discusion') return;
  for (const n of sim.state.npcs) {
    if (n.task?.kind === 'discutir') {
      clearTask(sim, n);
      memoOf(sim, n).nextDecideAt = sim.state.time;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Nuevos habitantes                                                   */
/* ------------------------------------------------------------------ */

const USEFUL_ROLES: NpcRole[] = ['pescador', 'recolector', 'jardinero', 'cocinero', 'mecanico'];

function pickRole(sim: Simulation): NpcRole {
  const have = new Set(sim.state.npcs.map((n) => n.role));
  const missing = USEFUL_ROLES.filter((r) => !have.has(r));
  return missing.length ? missing[0]! : 'libre';
}

export interface SurvivorOptions {
  pos?: Vec3;
  origin?: 'balsa' | 'isla' | 'estructura' | 'otro';
  role?: NpcRole;
  name?: string;
}

/**
 * Crea un habitante nuevo (náufrago rescatado, superviviente de una isla…): nombre libre de
 * `NPC_NAMES`, rasgo y aspecto aleatorios, puesto que falte en el barco y cama si la hay.
 */
export function spawnSurvivor(sim: Simulation, opts: SurvivorOptions = {}): NpcState | null {
  const st = sim.state;
  const used = new Set(st.npcs.map((n) => n.name));
  const free = NPC_NAMES.filter((n) => !used.has(n));
  const name = opts.name ?? (free.length ? sim.rng.pick(free) : `${sim.rng.pick(NPC_NAMES)} ${sim.rng.int(2, 9)}º`);
  const traitIds = Object.keys(TRAITS);
  const trait = sim.rng.pick(traitIds);
  const role = opts.role ?? pickRole(sim);
  const near = opts.pos ? railSpotNear(sim, opts.pos.x, Math.sign(opts.pos.z) || undefined, 3.2) : null;
  const pos = near?.pos ?? snapReachable(sim, opts.pos ?? sim.collision.safeSpawn(), 6) ?? sim.collision.safeSpawn();
  const npc = makeNpc(`npc${sim.nextId()}`, name, role, trait, { ...pos }, sim.rng.int(0, 9999), sim.day);
  npc.yaw = near ? near.yaw + Math.PI : sim.rng.range(-Math.PI, Math.PI);
  npc.needs = { hunger: 35, thirst: 25, energy: 40, mood: 55, health: 70 };
  st.npcs.push(npc);
  assignBeds(sim);
  say(sim, npc, sim.rng.pick(LINES.rescued), 8);
  memoOf(sim, npc).nextDecideAt = st.time + 3;
  const t = TRAITS[trait];
  const bedNote = npc.bed ? '' : ' No queda ninguna cama libre: construye un camarote o un dormitorio.';
  sim.log(`${name} se une a la tripulación (${(t?.name ?? trait).toLowerCase()}, ${ROLES[role].name.toLowerCase()}).${bedNote}`, 'good');
  return npc;
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

export function tickNpcs(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  const lm = lifeMemo(sim);
  const now = st.time;
  // Cambios del barco: recolocar y replanificar rutas.
  const rev = st.ship.revision;
  const shipChanged = lm.rev !== rev;
  if (shipChanged || now - lm.bedsAt > 30) {
    assignBeds(sim);
    lm.bedsAt = now;
  }
  for (const npc of [...st.npcs]) {
    if (!st.npcs.includes(npc)) continue;
    // De expedición: no se simula a bordo (salvo red de seguridad si nadie le trae de vuelta).
    if (!isPresent(npc)) {
      if (npc.awayUntil !== null && now > npc.awayUntil + 120 && !st.events.active.some((e) => (e.data as { npcIds?: string[] }).npcIds?.includes(npc.id))) returnFromExpedition(sim, npc);
      continue;
    }
    if (shipChanged) {
      ensureOnNav(sim, npc);
      if (npc.path.length && npc.task?.targetPos) {
        lm.stats.replans++;
        if (!planPath(sim, npc, npc.task.targetPos)) abortTask(sim, npc, td(npc).job ?? npc.task.kind, 10);
      }
    }
    tickNeedsOf(sim, npc, dt);
    if (npc.needs.health <= 0) {
      killNpc(sim, npc);
      continue;
    }
    if (npc.say && npc.say.until <= now) npc.say = null;
    const mem = memoOf(sim, npc);
    // Emergencias cada minuto.
    if (now >= mem.emergencyAt) {
      mem.emergencyAt = now + 1;
      const e = emergencyPlan(sim, npc);
      if (e && e.prio > td(npc).prio) {
        if (!startPlan(sim, npc, e)) memoOf(sim, npc).blocked[e.kind] = now + 5;
      }
    }
    // Tarea en curso.
    if (npc.task) {
      if (td(npc).phase === 'go') tickGo(sim, npc, dt);
      else tickAct(sim, npc, dt);
    }
    // Decisión.
    if (!npc.task || (now >= mem.nextDecideAt && npc.activity !== 'sleeping' && npc.task.kind !== 'partir')) {
      mem.nextDecideAt = now + DECIDE_EVERY + sim.rng.range(0, 3);
      const plan = decide(sim, npc);
      if (plan && (!npc.task || (plan.kind !== npc.task.kind && plan.prio > td(npc).prio + 4))) {
        // La comida que lleva en la mano vuelve al almacén si ya no tiene hambre.
        if (npc.carry && plan.kind !== 'comer' && npc.needs.hunger > 70 && ITEMS[npc.carry.id]?.category === 'comida') {
          storeOrDrop(sim, [npc.carry], npc.pos, 'Comida');
          npc.carry = null;
        }
        if (!startPlan(sim, npc, plan)) {
          memoOf(sim, npc).blocked[(plan.data?.job as string | undefined) ?? plan.kind] = now + 10;
          if (!npc.task) startPlan(sim, npc, { kind: 'ocio', prio: PRIO.ocio, target: null, data: { job: 'quieto' }, duration: 5 });
        }
      } else if (!npc.task) {
        startPlan(sim, npc, { kind: 'ocio', prio: PRIO.ocio, target: null, data: { job: 'quieto' }, duration: 5 });
      }
    }
    greet(sim, npc);
  }
  lm.rev = rev;
}

/** Saluda al jugador cuando pasa cerca (con enfriamiento). */
function greet(sim: Simulation, npc: NpcState): void {
  const p = sim.state.player;
  if (p.sleeping || !p.alive || npc.activity === 'sleeping') return;
  if (Math.abs(p.pos.y - npc.pos.y) > 1.5 || dist2(p.pos, npc.pos) > 2.6) return;
  const mem = memoOf(sim, npc);
  const now = sim.state.time;
  if (now - mem.greetAt < 180 || (npc.say && npc.say.until > now)) return;
  mem.greetAt = now;
  say(sim, npc, greetingLine(sim, npc, sim.rng.next()));
}

function greetingLine(sim: Simulation, npc: NpcState, r: number): string {
  const hour = hourOf(sim.state.time);
  let lines: string[];
  if (npc.needs.mood < 40) lines = LINES.greetGrumpy;
  else if (hour >= 5 && hour < 13) lines = LINES.greetMorning;
  else if (hour >= 13 && hour < 20) lines = LINES.greetAfternoon;
  else lines = LINES.greetNight;
  return lines[Math.floor(r * lines.length) % lines.length]!;
}

/* ------------------------------------------------------------------ */
/* Diálogo y comandos                                                  */
/* ------------------------------------------------------------------ */

/** Qué está haciendo (texto para la interfaz). */
export function npcStatusText(sim: Simulation, npc: NpcState): string {
  if (!isPresent(npc)) return 'De expedición';
  const t = npc.task;
  const d = t ? td(npc) : null;
  const go = d?.phase === 'go';
  const mod = t?.targetModuleId !== undefined ? findModule(sim, t.targetModuleId) : undefined;
  const at = mod ? withArticle(moduleDef(mod.type).name) : 'el barco';
  switch (t?.kind) {
    case 'dormir':
      return go ? 'Va a dormir' : 'Durmiendo';
    case 'descansar':
      return go ? 'Va a descansar' : 'Reposando';
    case 'comer':
      return go ? (d?.stage === 'recoger' ? 'Va a por comida' : 'Va a sentarse a comer') : 'Comiendo';
    case 'beber':
      return go ? 'Va a beber' : 'Bebiendo';
    case 'apagar':
      return go ? `Corre a apagar el fuego en ${at}` : `Apagando el fuego en ${at}`;
    case 'refugio':
      return go ? 'Busca refugio' : 'Refugiado de la tormenta';
    case 'construir':
      return go ? 'Va a ayudar en la obra' : 'Ayudando en la obra';
    case 'charlar':
      return 'Charlando';
    case 'discutir':
      return 'Discutiendo';
    case 'partir':
      return 'Embarca en el bote';
    case 'trabajar':
      switch (d?.job) {
        case 'cocinar':
        case 'vigilar':
          return go ? 'Va a la cocina' : 'Cocinando';
        case 'leña':
          return 'Echando leña al fogón';
        case 'botellas':
          return 'Rellenando botellas de agua';
        case 'sembrar':
          return 'Sembrando en el huerto';
        case 'cosechar':
          return 'Cosechando';
        case 'cuidar':
          return 'Cuidando los bancales';
        case 'reparar':
          return go ? `Va a reparar ${at}` : `Reparando ${at}`;
        case 'combustible':
          return `Recargando ${at}`;
        case 'pescar':
          return go ? 'Va a pescar' : 'Pescando desde la borda';
        case 'gancho':
          return 'Rescatando restos con el gancho';
        default:
          return 'Trabajando';
      }
    case 'ocio':
      switch (d?.job) {
        case 'sentarse':
          return 'Descansando un rato';
        case 'mirar':
          return 'Contemplando el mar';
        case 'pasear':
          return 'Paseando por cubierta';
        case 'reposo':
          return npc.injured ? 'Herido, guardando reposo' : 'Guardando reposo';
        default:
          return 'Sin nada que hacer';
      }
    default:
      return npc.activity === 'walking' ? 'Caminando' : 'Sin nada que hacer';
  }
}

function petitionLines(sim: Simulation, npc: NpcState): string[] {
  const out: string[] = [];
  switch (npc.role) {
    case 'cocinero': {
      const k = kitchen(sim);
      if (!k) out.push('Sin cocina no puedo hacer mi trabajo. ¿Construimos una?');
      else if (!fuelInStorage(sim) && fuelMinutes(k) <= 0) out.push('No queda leña ni combustible para el fogón.');
      else if (!chooseRecipe(sim) && foodLow(sim)) out.push('Si me traes pescado crudo u hortalizas, prepararé algo caliente.');
      break;
    }
    case 'jardinero':
      if (!sim.state.ship.modules.some((m) => m.plots.length && m.status === 'active')) out.push('Me encantaría tener un huerto a bordo.');
      else if (!seedFor(sim)) out.push('Sin semillas en el almacén no puedo plantar nada.');
      else if (sim.state.utilities.waterL < 2) out.push('Las plantas necesitan agua de los depósitos.');
      break;
    case 'mecanico': {
      const broken = sim.state.ship.modules.find((m) => needsFixing(sim, m) && !repairInfo(sim, m.id, { by: 'npc' }).ok);
      if (broken) {
        const part = repairInfo(sim, broken.id, { by: 'npc' }).part;
        out.push(`Para arreglar ${withArticle(moduleDef(broken.type).name)} necesito ${part === 'pieza_mecanica' ? 'piezas mecánicas' : 'kits de reparación'} en el almacén.`);
      }
      break;
    }
    case 'pescador':
      if (stormNow(sim)) out.push('Con esta mar no se puede pescar.');
      break;
    case 'recolector':
      if (!sim.state.debris.length) out.push('No flota nada útil cerca, ahora mismo.');
      break;
    default:
      if (!sim.state.ship.modules.some((m) => m.status === 'construction')) out.push('Si empiezas una obra, te echo una mano.');
  }
  return out;
}

/** Conversación con un habitante: frases según su estado y opciones disponibles. */
export function talkTo(sim: Simulation, npcId: string): NpcTalk | null {
  const st = sim.state;
  const npc = st.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const key = `${npc.id}:${Math.floor(st.time / 30)}`;
  const lines: string[] = [];
  if (!isPresent(npc)) {
    lines.push(`${npc.name} está de expedición. Volverá hacia las ${npc.awayUntil !== null ? clock(npc.awayUntil) : '…'}.`);
    return { npcId, name: npc.name, role: npc.role, roleName: ROLES[npc.role].name, trait: traitOf(npc).name, mood: npc.needs.mood, lines, options: [] };
  }
  const r = (() => {
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000) / 1000;
  })();
  if (npc.activity === 'sleeping') lines.push('Zzz… ¿Eh? Ah, eres tú… Déjame dormir un poco más.');
  else lines.push(greetingLine(sim, npc, r));
  lines.push(`Ahora mismo: ${npcStatusText(sim, npc).toLowerCase()}.`);
  const n = npc.needs;
  const disc = discussionOf(sim, npc.id);
  if (disc) {
    const other = st.npcs.find((o) => o.id === disc.other);
    lines.push(`No soporto a ${other?.name ?? 'ese'}. Lo de ${disc.topic} no tiene nombre.`);
  }
  if (n.hunger < 30) lines.push(bestFood(sim) ? 'Tengo un hambre que me muero.' : 'Tengo hambre y no queda nada de comer en los almacenes.');
  if (n.thirst < 30) lines.push(sim.state.utilities.waterL >= 1 || storageCount(sim, 'agua_potable') ? 'Necesito beber algo.' : 'Tengo sed y los depósitos están secos.');
  if (n.energy < 20) lines.push(`Estoy ${npcAdj(npc, 'agotado')}: necesito dormir.`);
  if (!npc.bed) lines.push('No tengo cama. El suelo de la bodega está frío y duro.');
  if (npc.sick) lines.push('Me encuentro fatal… un botiquín o la enfermería me vendrían de maravilla.');
  if (npc.injured) lines.push('Me hice daño y aún me duele. Un vendaje me ayudaría.');
  lines.push(...petitionLines(sim, npc));
  if (lines.length <= 2 && n.mood >= 60) lines.push(hashPick(LINES.trait[npc.trait] ?? LINES.leisure, key));
  if (n.mood < 30) lines.push('La verdad, el ánimo por aquí está por los suelos.');

  const inv = st.player.inventory;
  const options: NpcTalk['options'] = [];
  if (disc) options.push({ id: 'mediar', label: 'Mediar en la discusión', enabled: true });
  const medkit = countItem(inv, 'botiquin') > 0;
  const bandage = countItem(inv, 'vendaje') > 0;
  if (npc.sick || npc.injured || n.health < 80) {
    options.push({ id: 'curar', label: 'Curar con un botiquín', enabled: medkit });
    if (npc.injured || n.health < 80) options.push({ id: 'vendar', label: 'Poner un vendaje', enabled: bandage });
  }
  options.push({ id: 'charlar', label: 'Charlar un rato', enabled: npc.activity !== 'sleeping' });
  options.push({ id: 'dar', label: 'Darle algo del inventario', enabled: true });
  for (const role of Object.keys(ROLES) as NpcRole[]) {
    if (role === npc.role) continue;
    options.push({ id: `rol:${role}`, label: `Puesto: ${ROLES[role].name}`, enabled: true });
  }
  return { npcId, name: npc.name, role: npc.role, roleName: ROLES[npc.role].name, trait: traitOf(npc).name, mood: npc.needs.mood, lines, options };
}

function clock(t: number): string {
  const m = Math.floor(((t % 1440) + 1440) % 1440);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Opción de diálogo elegida por el jugador. */
export function npcOption(sim: Simulation, npcId: string, optionId: string): ActionResult {
  const st = sim.state;
  const npc = st.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('Ya no está a bordo');
  if (!isPresent(npc)) return fail(`${npc.name} está de expedición`);
  if (!st.player.alive || st.player.sleeping) return fail('Ahora no puedes');
  if (optionId.startsWith('rol:')) return setRole(sim, npcId, optionId.slice(4) as NpcRole);
  const inv = st.player.inventory;
  const mem = memoOf(sim, npc);
  switch (optionId) {
    case 'mediar': {
      const r = mediateDiscussion(sim, npcId);
      if (r.ok) say(sim, npc, 'Tienes razón… lo siento. Hagamos las paces.');
      return r;
    }
    case 'curar': {
      if (!(npc.sick || npc.injured || npc.needs.health < 80)) return fail(`${npc.name} está bien, no necesita un botiquín`);
      const slot = inv.slots.findIndex((s) => s?.id === 'botiquin');
      if (slot < 0) return fail('No tienes ningún botiquín');
      takeFromSlot(inv, slot, 1);
      const wasSick = npc.sick;
      npc.sick = false;
      npc.injured = false;
      npc.needs.health = clamp(npc.needs.health + 40, 0, 100);
      npc.needs.mood = clamp(npc.needs.mood + 5, 0, 100);
      say(sim, npc, '¡Gracias! Ya me siento mucho mejor.');
      if (wasSick) onNpcCured(sim, npc);
      sim.bus.emit('sfx', { name: 'curar', x: npc.pos.x, y: npc.pos.y + 1, z: npc.pos.z });
      if (npc.task?.kind === 'descansar') finishTask(sim, npc);
      return { ok: true, msg: `Atiendes a ${npc.name} con el botiquín` };
    }
    case 'vendar': {
      const slot = inv.slots.findIndex((s) => s?.id === 'vendaje');
      if (slot < 0) return fail('No tienes vendajes');
      if (!npc.injured && npc.needs.health >= 80) return fail(`${npc.name} no está ${npcAdj(npc, 'herido')}`);
      takeFromSlot(inv, slot, 1);
      npc.needs.health = clamp(npc.needs.health + 15, 0, 100);
      npc.injured = false;
      say(sim, npc, 'Así está mejor, gracias.');
      return { ok: true, msg: `Le pones un vendaje a ${npc.name}` };
    }
    case 'charlar': {
      if (npc.activity === 'sleeping') return fail(`${npc.name} está durmiendo`);
      const now = st.time;
      const recent = now - mem.chatAt < 180;
      mem.chatAt = now;
      if (!recent) npc.needs.mood = clamp(npc.needs.mood + 6, 0, 100);
      say(sim, npc, sim.rng.pick([...LINES.chat, ...(LINES.trait[npc.trait] ?? [])]));
      return { ok: true, msg: recent ? `Charlas otro rato con ${npc.name}` : `Charlas un rato con ${npc.name}: se le ve más animado` };
    }
    case 'dar':
      return fail('Elige qué darle desde tu inventario');
    default:
      return fail('Esa opción no está disponible');
  }
}

/** Cambia el puesto de trabajo de un habitante. */
export function setRole(sim: Simulation, npcId: string, role: NpcRole): ActionResult {
  const npc = sim.state.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('Ya no está a bordo');
  if (!ROLES[role]) return fail('Ese puesto no existe');
  if (npc.role === role) return fail(`${npc.name} ya es ${ROLES[role].name.toLowerCase()}`);
  npc.role = role;
  if (npc.task?.kind === 'trabajar' || npc.task?.kind === 'construir') finishTask(sim, npc);
  memoOf(sim, npc).blocked = {};
  if (isPresent(npc)) say(sim, npc, `¡Entendido! Ahora soy ${ROLES[role].name.toLowerCase()}.`);
  return { ok: true, msg: `${npc.name} pasa a ser ${ROLES[role].name.toLowerCase()}` };
}

/**
 * El jugador le da un objeto de su inventario: comida, bebida o medicina la usa en el acto si la
 * necesita; lo demás lo guarda en el almacén (o en una caja si no cabe). Nunca se pierde nada.
 */
export function giveItem(sim: Simulation, npcId: string, slot: number): ActionResult {
  const st = sim.state;
  const npc = st.npcs.find((n) => n.id === npcId);
  if (!npc) return fail('Ya no está a bordo');
  if (!isPresent(npc)) return fail(`${npc.name} está de expedición`);
  const inv = st.player.inventory;
  if (!Number.isInteger(slot) || slot < 0 || slot >= inv.slots.length) return fail('Ranura no válida');
  const s = inv.slots[slot];
  if (!s) return fail('No hay nada en esa ranura');
  const def = ITEMS[s.id];
  if (!def) return fail('Objeto desconocido');
  const n = npc.needs;
  const c = def.consume;
  if (c && (def.category === 'comida' || def.category === 'bebida')) {
    const useful = ((c.hunger ?? 0) > 0 && n.hunger < 92) || ((c.thirst ?? 0) > 0 && n.thirst < 92);
    if (!useful) return fail(`${npc.name} no tiene hambre ni sed ahora`);
    if ((c.thirst ?? 0) < 0) return fail(`${npc.name} no piensa beber agua salada`);
    takeFromSlot(inv, slot, 1);
    n.hunger = clamp(n.hunger + (c.hunger ?? 0), 0, 100);
    n.thirst = clamp(n.thirst + (c.thirst ?? 0), 0, 100);
    n.energy = clamp(n.energy + (c.energy ?? 0), 0, 100);
    n.mood = clamp(n.mood + 4, 0, 100);
    const mem = memoOf(sim, npc);
    mem.lastMealAt = st.time;
    if (COOKED_FOOD.has(s.id)) mem.ateCookedAt = st.time;
    say(sim, npc, LINES.eat[def.id] ?? '¡Gracias!');
    if (s.id === 'pescado_crudo' && !npc.sick && sim.rng.chance(RAW_FISH_SICK)) {
      if (!startEvent(sim, 'enfermedad', { npcId: npc.id, cause: 'comió pescado crudo', scripted: true })) npc.sick = true;
    }
    return { ok: true, msg: `${npc.name} acepta ${def.name.toLowerCase()} y te lo agradece` };
  }
  if (def.category === 'medicina' && c) {
    if (!(npc.sick || npc.injured || n.health < 90)) return fail(`${npc.name} está bien, guárdalo para cuando haga falta`);
    takeFromSlot(inv, slot, 1);
    n.health = clamp(n.health + (c.health ?? 0), 0, 100);
    const wasSick = npc.sick;
    if (c.cures) npc.sick = false;
    if (npc.injured && (c.cures || def.id === 'vendaje')) npc.injured = false;
    say(sim, npc, '¡Gracias! Ya me siento mejor.');
    if (wasSick && !npc.sick) onNpcCured(sim, npc);
    return { ok: true, msg: `${npc.name} se cura con ${def.name.toLowerCase()}` };
  }
  // Materiales, herramientas, semillas…: al almacén.
  const taken = takeFromSlot(inv, slot);
  if (!taken) return fail('No hay nada en esa ranura');
  storeOrDrop(sim, [taken], npc.pos, 'Objetos');
  say(sim, npc, 'Lo guardo en el almacén.');
  return { ok: true, msg: `${npc.name} guarda ${taken.qty}× ${def.name} en el almacén` };
}



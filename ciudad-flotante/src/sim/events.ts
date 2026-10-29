/**
 * [AGENTE sim-life] DIRECTOR DE EVENTOS, INCENDIOS, EXPEDICIONES Y COMERCIO (docs/SISTEMAS.md §10).
 *
 * - Director: cada 150–300 min tira dados con los pesos de la región (`eventWeights`), respetando
 *   enfriamientos por tipo, día mínimo (contado en horas jugadas: el «día 2» empieza 24 h después de
 *   zarpar, no a medianoche, así que la primera noche no trae crisis), condiciones previas (p. ej.
 *   una plaga necesita algo plantado) y un peso de "calma". De noche, o mientras el jugador duerme,
 *   no se avista nada, y nunca hay más de dos crisis a la vez.
 * - Solo despiertan al jugador las emergencias (tormenta, incendio, náufragos): el resto de eventos
 *   que empiezan mientras duerme quedan anotados en el diario (`data.wakePlayer = false`).
 * - Guion inicial garantizado (`SCRIPT`): día 1 13:00 naufragio con el primer plano pendiente
 *   (`BLUEPRINT_ORDER`), día 2 10:00 náufragos, día 3 11:00 mercante, día 4 10:00 isla y día 5
 *   16:00 naufragio con el siguiente plano. Los avistamientos del guion esperan a que el jugador
 *   esté despierto.
 * - 13 tipos de evento con título, descripción, objetivos, opciones y consecuencias físicas reales
 *   (lo que dice cada texto ocurre de verdad):
 *   tormenta (daños por hora a módulos expuestos, más cuanto más se ha jugado; fugas, rayos y golpes
 *   de mar que hieren a quien siga en cubierta; luego una fase de daños de 12 h como mucho),
 *   naufragio (fondeo y restos con cofre; se leva el ancla al rescatarlo todo), isla y estructura
 *   (expediciones de habitantes que vuelven con botín a los almacenes), náufragos (balsa que hay que
 *   enganchar; fondeados, se acerca a remo hasta el alcance del gancho), avería (máquina parada, o
 *   estructura que sigue cediendo con el oleaje; objetivos por pasos y, a las 24 h, un apaño del
 *   mecánico que la deja al 40 %), incendio (crece, quema condición y contenido, se propaga; los
 *   habitantes lo combaten a cubos o, sin cubos, muy despacio), banco de peces, mercante (4
 *   ofertas), plaga, fuga, enfermedad (solo se cura con tratamiento; sin él la salud cae y puede
 *   contagiarse) y discusión (el mal ambiente baja el ánimo de toda la tripulación).
 * - El director evita repetir el último tipo de evento (`REPEAT_FACTOR`).
 * - Cada evento emite `worldEventStarted` / `worldEventEnded`, deja entrada en el diario y queda en
 *   `events.history`.
 * - Comandos: `eventChoice`, `trade`, `extinguish` (cubo de agua de mar, lo devuelve vacío).
 *
 * Todo el estado vive en `state.events` (serializable); el azar sale de `sim.rng`.
 */
import type { NotifyKind } from '../core/EventBus';
import { clamp } from '../core/math';
import { ITEMS } from '../data/items';
import { BLUEPRINT_ORDER, TRADE_OFFERS } from '../data/loot';
import { moduleDef } from '../data/modules';
import { REGIONS, START_REGION } from '../data/regions';
import { wake } from './actions';
import { CELL, MINUTES_PER_DAY, START_HOUR } from './constants';
import { REPAIR_THRESHOLD, repairNeeds } from './construction';
import { collectDebrisFor, hullBounds, playerSlotOf, rollLoot, spawnDebris } from './debris';
import { depositToStorage, findModule, giveToPlayer, itemName, payInventories, shipCount, spawnCrate, stacksText } from './helpers';
import { consume, countItem, missingFor } from './inventory';
import { availableForExpedition, isFemaleNpc, npcAdj, onNpcEventEnded, returnFromExpedition, sendOnExpedition, spawnSurvivor, survivorJoinText } from './npc';
import { damagePlayer } from './needs';
import { cellAtPoint, cellMin, isIndoorAt, levelOfY, moduleCells, moduleCenter } from './ship';
import type { ActionResult, Simulation } from './Simulation';
import { clockText, hourOf } from './time';
import { markTutorial } from './tutorial';
import type { ActiveEvent, Debris, DebrisKind, EventObjective, ItemId, ItemStack, ModuleInstance, NpcState, Sighting, Vec3 } from './types';
import { capitalize, hasFuel, isFeminineName, machineRunning, moduleHasSky, withArticle } from './utilities';
import { anchorShip, isAnchored, weighAnchor } from './voyage';
import { forceWeather } from './weather';

/* ------------------------------------------------------------------ */
/* Tipos y parámetros                                                  */
/* ------------------------------------------------------------------ */

export type EventType =
  | 'tormenta'
  | 'naufragio'
  | 'isla'
  | 'naufragos'
  | 'averia'
  | 'incendio'
  | 'banco_peces'
  | 'mercante'
  | 'plaga'
  | 'fuga'
  | 'enfermedad'
  | 'discusion'
  | 'estructura';

export const EVENT_TYPES: readonly EventType[] = [
  'tormenta',
  'naufragio',
  'isla',
  'naufragos',
  'averia',
  'incendio',
  'banco_peces',
  'mercante',
  'plaga',
  'fuga',
  'enfermedad',
  'discusion',
  'estructura',
];

/** Nombre corto de cada tipo (UI, diario). */
export const EVENT_NAMES: Record<EventType, string> = {
  tormenta: 'Tormenta',
  naufragio: 'Naufragio',
  isla: 'Isla',
  naufragos: 'Náufragos',
  averia: 'Avería',
  incendio: 'Incendio',
  banco_peces: 'Banco de peces',
  mercante: 'Barco mercante',
  plaga: 'Plaga',
  fuga: 'Fuga de agua',
  enfermedad: 'Enfermedad',
  discusion: 'Discusión',
  estructura: 'Estructura misteriosa',
};

/** Minutos de juego antes de que un tipo pueda repetirse (desde que empieza). */
export const EVENT_COOLDOWN: Record<EventType, number> = {
  tormenta: 0,
  naufragio: 360,
  isla: 480,
  naufragos: 480,
  averia: 720,
  incendio: 1080,
  banco_peces: 300,
  mercante: 720,
  plaga: 1080,
  fuga: 1080,
  enfermedad: 1080,
  discusion: 720,
  estructura: 900,
};

/**
 * Día a partir del cual el director puede sacar cada tipo (el guion no lo respeta). Se cuenta en
 * horas jugadas, no por el calendario: el día D empieza (D − 1) × 24 h después de zarpar (ver
 * `playedHours`), así que el «día 2» no llega a medianoche, en plena primera noche.
 */
export const EVENT_MIN_DAY: Record<EventType, number> = {
  tormenta: 1,
  naufragio: 1,
  isla: 2,
  naufragos: 1,
  averia: 2,
  incendio: 2,
  banco_peces: 1,
  mercante: 2,
  plaga: 2,
  fuga: 2,
  enfermedad: 3,
  discusion: 2,
  estructura: 6,
};

/** Intervalo entre tiradas del director (min). */
export const DIRECTOR_INTERVAL: readonly [number, number] = [150, 300];
/** Peso de "no pasa nada" en cada tirada. */
export const CALM_WEIGHT = 4;
/** Pesos de tipos que las regiones no declaran (base y por región). */
const EXTRA_WEIGHTS: Partial<Record<EventType, { base: number; regions: Record<string, number> }>> = {
  estructura: { base: 0.35, regions: { faro: 2.2, cementerio: 0.9, tormentas: 0.6, boreal: 0.5 } },
};
/** Eventos que se ven en el horizonte: de noche no se avistan (la tripulación duerme y no se ve nada). */
const SIGHTING_TYPES = new Set<EventType>(['naufragio', 'isla', 'mercante', 'estructura', 'naufragos']);
const NIGHT_SIGHTING_FACTOR = 0;
/** Crisis a bordo: nunca más de MAX_CRISES a la vez. */
const CRISIS_TYPES = new Set<EventType>(['averia', 'incendio', 'fuga', 'plaga', 'enfermedad', 'discusion']);
/**
 * Emergencias que sí despiertan al jugador (la tormenta y el fuego, además, los detecta needs.ts;
 * una balsa de náufragos pasa de largo en minutos). El resto se anota en el diario sin despertarle.
 */
const URGENT_TYPES = new Set<EventType>(['tormenta', 'incendio', 'naufragos']);
const MAX_CRISES = 2;
/** De noche hay menos crisis (casi todo está parado). */
const NIGHT_CRISIS_FACTOR = 0.4;
/** El director no saca un tipo guionizado en las horas previas a su cita. */
const SCRIPT_GUARD_MIN = 180;

/** Guion inicial garantizado. */
export const SCRIPT: readonly { id: string; day: number; hour: number; type: EventType; opts?: StartOptions }[] = [
  { id: 'dia1-naufragio', day: 1, hour: 13, type: 'naufragio', opts: { blueprint: 'next' } },
  { id: 'dia2-naufragos', day: 2, hour: 10, type: 'naufragos', opts: { survivors: 1 } },
  { id: 'dia3-mercante', day: 3, hour: 11, type: 'mercante' },
  { id: 'dia4-isla', day: 4, hour: 10, type: 'isla' },
  { id: 'dia5-naufragio', day: 5, hour: 16, type: 'naufragio', opts: { blueprint: 'next' } },
];
/** Un paso del guion que se pasa más de esto (p. ej. una partida cargada) se descarta. */
const SCRIPT_STALE_MIN = 36 * 60;
/** Los avistamientos del guion solo ocurren de día: una cita perdida espera a la mañana. */
const SCRIPT_HOURS: readonly [number, number] = [7, 20];

/* Tormenta */
/** Probabilidad por hora (× ola/2,6 × `stormDamageFactor`) de que cada módulo expuesto sufra daños. */
export const STORM_DAMAGE_CHANCE_PER_HOUR = 0.25;
export const STORM_DAMAGE: readonly [number, number] = [10, 30];
export const STORM_LEAK_CHANCE = 0.3;
export const STORM_LIGHTNING_PER_HOUR = 0.02;
/** Duración máxima de la fase de daños tras la tormenta (min). */
export const STORM_REPAIR_WINDOW = 12 * 60;
/** Probabilidad por hora (× ola/2,6) de que un golpe de mar alcance a quien esté en cubierta abierta. */
export const STORM_WAVE_HIT_PER_HOUR = 0.35;
/** Daño de un golpe de mar al jugador. */
export const STORM_WAVE_DAMAGE: readonly [number, number] = [6, 12];
/** Salud que pierde un habitante derribado por un golpe de mar (queda herido). */
export const STORM_WAVE_NPC_DAMAGE = 15;
/** Una avería estructural empeora con el oleaje: condición perdida por hora y metro de ola. */
export const STRUCTURAL_DECAY_PER_HOUR_PER_M = 0.8;

/* Fuego (una amenaza real: los habitantes sin cubos apenas lo frenan; ver npc.ts FIREFIGHT_RATE) */
export const FIRE_START = 40;
export const FIRE_GROWTH_PER_HOUR = 9;
/** Condición que quema un fuego al 100 % por hora (proporcional a la intensidad). */
export const FIRE_BURN_PER_HOUR = 45;
export const FIRE_SPREAD_ABOVE = 60;
export const FIRE_SPREAD_CHANCE_PER_HOUR = 0.2;
/** Lo que apaga un cubo de agua de mar. */
export const BUCKET_EXTINGUISH = 35;
/** Distancia (m) desde la que se puede arrojar un cubo al fuego. */
export const EXTINGUISH_RANGE = 3;
/** La lluvia apaga los fuegos a cielo abierto (por hora, × intensidad de la lluvia). */
const RAIN_QUENCH_PER_HOUR = 15;
/** Probabilidad por hora de que un fuego fuerte (> 50) destruya parte del contenido del módulo. */
const FIRE_CONTENT_LOSS_PER_HOUR = 0.15;
const NONFLAMMABLE = new Set(['escalera', 'deposito']);
const BURNABLE_ITEMS = new Set(['madera', 'fibra', 'cuerda', 'tela', 'plastico', 'combustible']);
const BURNABLE_CATEGORIES = new Set(['comida', 'semilla', 'plano', 'ropa', 'medicina']);

/* Expediciones */
export const ISLAND_EXPEDITION_MIN = 180;
export const STRUCTURE_EXPEDITION_MIN = 120;
/** Probabilidad de que la sala de control de una estructura guarde el siguiente plano. */
export const STRUCTURE_BLUEPRINT_CHANCE = 0.5;

/* Naufragios */
/** Probabilidad de que un naufragio que no es del guion lleve un plano en el cofre. */
export const WRECK_BLUEPRINT_CHANCE = 0.15;
/** Restos que deja un pecio al fondear junto a él (el primero, el cofre). */
export const WRECK_DEBRIS_COUNT: readonly [number, number] = [5, 8];
/** Multiplicador del botín de los restos de un pecio. */
export const WRECK_RICHNESS = 1.2;

/* Averías */
/** Pasadas estas horas sin reparar una avería, el mecánico (o quien haya) hace un apaño. */
export const BREAKDOWN_PATCH_MIN = 24 * 60;
/** Condición en la que deja la máquina (o la estructura) ese apaño. */
export const BREAKDOWN_PATCH_CONDITION = 40;

/* Enfermedad */
/** Si la salud del enfermo cae por debajo de esto, el evento se da por perdido: ha empeorado. */
export const SICKNESS_WORSE_HEALTH = 40;

/* Otros */
export const SIGHTING_WINDOW = 120;
export const FISH_BANK_MIN = 120;
export const MERCHANT_MIN = 120;
export const PEST_DEADLINE_MIN = 24 * 60;
export const ARGUMENT_MIN = 40;
export const DISCUSSION_MAX_MIN = 8 * 60;
export const RAFT_ANCHOR_MIN = 45;
/** Motivo del fondeo para esperar a una balsa (se leva el ancla al rescatarla). */
const RAFT_ANCHOR_REASON = 'esperar a la balsa de náufragos';
export const WRECK_ANCHOR_MIN = 60;

const fail = (msg: string): ActionResult => ({ ok: false, msg });

/* ------------------------------------------------------------------ */
/* Datos de cada tipo (en `ActiveEvent.data`, serializables)           */
/* ------------------------------------------------------------------ */

interface StormData {
  phase: 'activa' | 'danos';
  damaged: number[];
  strikes: number;
}
interface WreckData {
  phase: 'avistado' | 'rescate';
  sightingId: number;
  ship: string;
  side: 1 | -1;
  blueprint: string | null;
  total: number;
  collected: number;
  lost: number;
  chestCollected: boolean;
}
interface ExpeditionData {
  phase: 'avistado' | 'expedicion';
  sightingId: number;
  name: string;
  npcIds: string[];
  returnAt: number | null;
  minutes: number;
}
interface RaftData {
  debrisId: number;
  survivors: number;
  rescued: boolean;
}
interface BreakdownData {
  moduleId: number;
  structural: boolean;
  reason: string;
  /** Minuto en que el mecánico hace un apaño si nadie la ha reparado (partidas antiguas: inicio + 24 h). */
  patchAt?: number;
}
interface FireData {
  modules: number[];
  destroyed: number[];
}
interface FishBankData {
  catches: number;
}
export interface TradeOfferState {
  give: Record<ItemId, number>;
  get: Record<ItemId, number>;
  done: boolean;
}
interface MerchantData {
  sightingId: number;
  ship: string;
  captain: string;
  offers: TradeOfferState[];
  trades: number;
}
interface PestData {
  plots: { moduleId: number; plot: number }[];
}
interface LeakData {
  moduleId: number;
}
interface SicknessData {
  npcId: string;
  name: string;
}
interface DiscussionData {
  npcIds: [string, string];
  names: [string, string];
  topic: string;
  argueUntil: number;
}

export interface StartOptions {
  /** Naufragio: 'next' = garantiza el primer plano pendiente. */
  blueprint?: 'next' | null;
  /** Náufragos: número de supervivientes en la balsa. */
  survivors?: number;
  /** Módulo afectado (avería, incendio, fuga). */
  moduleId?: number;
  /** Habitante afectado (enfermedad). */
  npcId?: string;
  /** Motivo (enfermedad: "comió pescado crudo"). */
  cause?: string;
  /** Lo lanza el guion o una prueba: ignora enfriamientos y día mínimo. */
  scripted?: boolean;
}

/* ------------------------------------------------------------------ */
/* Nombres evocadores                                                  */
/* ------------------------------------------------------------------ */

const WRECK_SHIPS = ['Albatros', 'Estrella del Sur', 'Santa Inés', 'Marea Alta', 'Gaviota Gris', 'Libertad', 'Corazón de Roble', 'Brisa de Levante', 'San Telmo', 'La Esperanza', 'Viento Norte', 'Perla Negra'];
const MERCHANT_SHIPS = ['Rosa de los Vientos', 'Mercader de Sal', 'Fortuna', 'Tres Hermanas', 'Lucero del Alba', 'Ballena Azul'];
const CAPTAINS = ['la capitana Ofelia', 'el capitán Baltasar', 'la capitana Remedios', 'el capitán Anselmo', 'la capitana Brígida', 'el capitán Severino'];
const ISLANDS = ['Isla de las Palmas', 'Cayo Tortuga', 'Islote Verde', 'Isla de los Cocos', 'Isla del Coral', 'Peñón de las Gaviotas', 'Isla Bruma'];
const STRUCTURES = ['una plataforma petrolífera abandonada', 'una torre de señales oxidada', 'una estación meteorológica a la deriva', 'un faro sin luz sobre las rocas'];
const DISCUSSION_TOPICS = ['el reparto de la comida', 'quién hace las guardias', 'un cabo mal atado', 'el rumbo del barco', 'unas botas desaparecidas', 'el ruido por las noches'];
const BREAKDOWN_REASONS: Record<string, string[]> = {
  generador: ['Se ha partido la correa del alternador', 'El carburador está obstruido', 'Una bujía se ha quemado'],
  potabilizadora: ['La membrana del filtro ha reventado', 'La bomba de agua se ha gripado'],
  taller: ['El motor del torno se ha quemado', 'La prensa ha perdido presión'],
  bateria: ['Cortocircuito en las celdas', 'Los bornes están corroídos por la sal'],
  panel_solar: ['Las conexiones se han corroído por la sal', 'Un cristal del panel se ha agrietado'],
  motor: ['La hélice se ha enredado en un cabo', 'El eje del motor está desalineado'],
  enfermeria: ['El equipo médico ha dejado de funcionar'],
};

const sideName = (side: number): string => (side < 0 ? 'babor' : 'estribor');

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

export function eventById(sim: Simulation, id: number): ActiveEvent | undefined {
  return sim.state.events.active.find((e) => e.id === id);
}

export function activeEvent(sim: Simulation, type: EventType): ActiveEvent | undefined {
  return sim.state.events.active.find((e) => e.type === type);
}

/** Datos tipados de un evento (los datos son JSON del guardado). */
function dataOf<T>(ev: ActiveEvent): T {
  return ev.data as unknown as T;
}

export function isFishBankActive(sim: Simulation): boolean {
  return !!activeEvent(sim, 'banco_peces');
}

/** ¿Hay una avería activa sobre este módulo? (el mecánico la trata como urgente). */
export function isBreakdownTarget(sim: Simulation, moduleId: number): boolean {
  return sim.state.events.active.some((e) => e.type === 'averia' && (e.data as { moduleId?: number }).moduleId === moduleId);
}

/** Motivo de la avería activa sobre un módulo («La prensa ha perdido presión»), o null (para la interfaz). */
export function breakdownReason(sim: Simulation, moduleId: number): string | null {
  const ev = sim.state.events.active.find((e) => e.type === 'averia' && (e.data as { moduleId?: number }).moduleId === moduleId);
  return ev ? ((ev.data as { reason?: string }).reason ?? null) : null;
}

/** Módulos que arden ahora mismo. */
export function burningModules(sim: Simulation): ModuleInstance[] {
  return sim.state.ship.modules.filter((m) => m.fire > 0);
}

/** "la cocina", "el generador"… */
export function moduleLabel(m: ModuleInstance): string {
  return withArticle(moduleDef(m.type).name);
}

/** ¿Hay alguien disponible a bordo? (lo usan las opciones de expedición). */
function expeditionBlocker(sim: Simulation): string | null {
  return availableForExpedition(sim).length ? null : 'No hay nadie disponible: todos están ocupados, heridos, enfermos o de expedición';
}

/**
 * Primer plano de `BLUEPRINT_ORDER` que aún no se conoce y que no está ya a bordo, flotando o
 * prometido por otro evento activo (null si no queda ninguno).
 */
export function nextBlueprint(sim: Simulation): ItemId | null {
  const st = sim.state;
  for (const id of BLUEPRINT_ORDER) {
    const key = ITEMS[id]?.unlocks;
    if (key && st.unlocks.includes(key)) continue;
    if (shipCount(sim, id) > 0) continue;
    if (st.crates.some((c) => c.inventory.slots.some((s) => s?.id === id))) continue;
    if (st.debris.some((d) => d.loot.some((l) => l.id === id))) continue;
    if (st.events.active.some((e) => (e.data as { blueprint?: unknown }).blueprint === id)) continue;
    return id;
  }
  return null;
}

/** Horas jugadas desde que zarpamos (el día 1 a las `START_HOUR`). */
export function playedHours(sim: Simulation): number {
  return Math.max(0, (sim.state.time - START_HOUR * 60) / 60);
}

/** ¿Ha pasado ya el día mínimo de un tipo, contado en horas jugadas? */
export function minDayReached(sim: Simulation, type: EventType): boolean {
  return playedHours(sim) >= (EVENT_MIN_DAY[type] - 1) * 24;
}

/**
 * Las tormentas castigan más cuanto más se ha jugado: × min(1,5; 0,5 + días jugados / 10). Al
 * principio, la mitad de daños; hacia el día 10, lo normal; desde el día 10, un 50 % más.
 */
export function stormDamageFactor(sim: Simulation): number {
  return Math.min(1.5, 0.5 + playedHours(sim) / 24 / 10);
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

function newEvent(sim: Simulation, type: EventType, title: string, description: string): ActiveEvent {
  return { id: sim.nextId(), type, title, description, startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: {} };
}

function obj(text: string, done = false): EventObjective {
  return { text, done };
}

/**
 * Registra el evento: lista activa, enfriamiento, bus y diario. Los que no son emergencias no
 * despiertan al jugador (`data.wakePlayer = false`, lo respeta needs.ts): quedan en el diario.
 */
function begin(sim: Simulation, ev: ActiveEvent, kind: NotifyKind, logText?: string | null, notify = true): ActiveEvent {
  const st = sim.state;
  st.events.active.push(ev);
  const type = ev.type as EventType;
  if (!URGENT_TYPES.has(type) && ev.data['wakePlayer'] === undefined) ev.data['wakePlayer'] = false;
  st.events.cooldowns[type] = st.time + (EVENT_COOLDOWN[type] ?? 0);
  sim.bus.emit('worldEventStarted', { eventId: ev.id, type: ev.type, title: ev.title });
  if (logText !== null) sim.log(logText ?? `${ev.title}. ${ev.description}`, kind, notify);
  return ev;
}

/** Termina un evento: historial, bus, diario y limpieza. `success` null = decisión neutra (seguir rumbo). */
export function endEvent(sim: Simulation, ev: ActiveEvent, success: boolean | null, text?: string, kind?: NotifyKind): void {
  const st = sim.state;
  const i = st.events.active.indexOf(ev);
  if (i < 0) return;
  st.events.active.splice(i, 1);
  st.events.history.push({ type: ev.type, title: ev.title, at: st.time, success });
  if (st.events.history.length > 80) st.events.history.splice(0, st.events.history.length - 80);
  // Los avistamientos asociados se pierden de vista poco después.
  for (const s of st.voyage.sightings) if (s.eventId === ev.id) s.expiresAt = Math.min(s.expiresAt, st.time + 30);
  for (const o of ev.objectives) if (success) o.done = true;
  ev.choices = [];
  onNpcEventEnded(sim, ev);
  sim.bus.emit('worldEventEnded', { eventId: ev.id, type: ev.type, title: ev.title, success: success === true });
  if (text) sim.log(text, kind ?? (success ? 'good' : success === false ? 'warn' : 'info'));
}

function addSighting(sim: Simulation, ev: ActiveEvent, kind: Sighting['kind'], name: string, side: 1 | -1, x: number, distance: number, minutes: number): Sighting {
  const s: Sighting = { id: sim.nextId(), kind, name, expiresAt: sim.state.time + minutes, side, distance, x, eventId: ev.id };
  sim.state.voyage.sightings.push(s);
  return s;
}

function sightingOf(sim: Simulation, id: number): Sighting | undefined {
  return sim.state.voyage.sightings.find((s) => s.id === id);
}

/* ------------------------------------------------------------------ */
/* Arranque de eventos                                                 */
/* ------------------------------------------------------------------ */

/** Habitantes presentes (a bordo, no de expedición). */
function presentNpcs(sim: Simulation): NpcState[] {
  return sim.state.npcs.filter((n) => n.awayUntil === null && n.activity !== 'away');
}

function plantedPlots(sim: Simulation): { m: ModuleInstance; plot: number }[] {
  const out: { m: ModuleInstance; plot: number }[] = [];
  for (const m of sim.state.ship.modules) {
    if (m.status !== 'active') continue;
    m.plots.forEach((p, i) => {
      if (p.crop && !p.dead && !p.pest) out.push({ m, plot: i });
    });
  }
  return out;
}

function arguingPair(sim: Simulation): [NpcState, NpcState] | null {
  const grumpy = presentNpcs(sim)
    .filter((n) => n.needs.mood < 45 && n.activity !== 'sleeping')
    .sort((a, b) => a.needs.mood - b.needs.mood);
  if (grumpy.length < 2) return null;
  return [grumpy[0]!, grumpy[1]!];
}

function isFlammable(m: ModuleInstance): boolean {
  return !NONFLAMMABLE.has(m.type) && m.status !== 'construction';
}

/** Módulos donde puede empezar un incendio, con su peso. */
function fireCandidates(sim: Simulation): { m: ModuleInstance; w: number }[] {
  const out: { m: ModuleInstance; w: number }[] = [];
  for (const m of sim.state.ship.modules) {
    if (m.status !== 'active' || m.fire > 0 || !isFlammable(m)) continue;
    const def = moduleDef(m.type);
    if (m.type === 'cocina' && (m.powered || hasFuel(m))) out.push({ m, w: 4 });
    else if (m.type === 'generador' && m.powered) out.push({ m, w: 3 });
    else if (def.enclosed && m.type !== 'puente') out.push({ m, w: 1 });
  }
  return out;
}

/** ¿Se cumplen las condiciones previas del tipo? (sin mirar enfriamientos). */
export function canStartEvent(sim: Simulation, type: EventType): boolean {
  const st = sim.state;
  if (!st.player.alive) return false;
  if (type !== 'incendio' && activeEvent(sim, type)) return false;
  switch (type) {
    case 'tormenta':
      return true;
    case 'averia':
      return st.ship.modules.some((m) => m.status === 'active' && m.type !== 'escalera');
    case 'incendio':
      return !activeEvent(sim, 'incendio') && fireCandidates(sim).length > 0;
    case 'plaga':
      return plantedPlots(sim).length > 0;
    case 'fuga':
      return st.ship.modules.some((m) => m.type === 'deposito' && m.status === 'active' && !m.leak);
    case 'enfermedad':
      return presentNpcs(sim).some((n) => !n.sick && !n.injured);
    case 'discusion':
      return arguingPair(sim) !== null;
    default:
      return true;
  }
}

/**
 * Inicia un evento de un tipo (lo usan el director, el guion, otros sistemas y las pruebas).
 * Devuelve el evento o null si no se pudo.
 */
export function startEvent(sim: Simulation, type: EventType, opts: StartOptions = {}): ActiveEvent | null {
  // Una enfermedad concreta (pescado crudo, contagio) abre su propio evento aunque ya haya otro
  // enfermo: cada uno tiene su tratamiento. El director sigue sacando como mucho una a la vez.
  if (type === 'enfermedad' && opts.npcId !== undefined && sim.state.player.alive) {
    const n = sim.state.npcs.find((nn) => nn.id === opts.npcId);
    const has = sim.state.events.active.some((e) => e.type === 'enfermedad' && dataOf<SicknessData>(e).npcId === opts.npcId);
    return n && !n.sick && !has ? startSickness(sim, opts) : null;
  }
  if (!canStartEvent(sim, type)) return null;
  switch (type) {
    case 'tormenta':
      return startStorm(sim);
    case 'naufragio':
      return startWreck(sim, opts);
    case 'isla':
      return startExpeditionSighting(sim, 'isla');
    case 'estructura':
      return startExpeditionSighting(sim, 'estructura');
    case 'naufragos':
      return startRaft(sim, opts);
    case 'averia':
      return startBreakdown(sim, opts);
    case 'incendio':
      return startFireEvent(sim, opts);
    case 'banco_peces':
      return startFishBank(sim);
    case 'mercante':
      return startMerchant(sim);
    case 'plaga':
      return startPest(sim);
    case 'fuga':
      return startLeak(sim, opts);
    case 'enfermedad':
      return startSickness(sim, opts);
    case 'discusion':
      return startDiscussion(sim);
    default:
      return null;
  }
}

/* ---- Tormenta ---- */

function startStorm(sim: Simulation): ActiveEvent {
  if (sim.state.weather.kind !== 'tormenta') forceWeather(sim, 'tormenta');
  const ev = newEvent(sim, 'tormenta', 'Tormenta', 'Olas de varios metros barren la cubierta y el viento aúlla en la jarcia. Todo lo que esté a la intemperie sufrirá.');
  const d: StormData = { phase: 'activa', damaged: [], strikes: 0 };
  ev.data = d as unknown as Record<string, unknown>;
  refreshObjectives(sim, ev);
  ev.data['wakePlayer'] = true;
  // weather.ts ya anuncia la tormenta en el diario: aquí solo se registra.
  begin(sim, ev, 'danger', null);
  wake(sim, 'Te despierta el estruendo de la tormenta');
  return ev;
}

/* ---- Naufragio ---- */

function startWreck(sim: Simulation, opts: StartOptions): ActiveEvent {
  const st = sim.state;
  const ship = sim.rng.pick(WRECK_SHIPS);
  let blueprint: string | null = null;
  if (opts.blueprint === 'next' || (opts.blueprint === undefined && sim.rng.chance(WRECK_BLUEPRINT_CHANCE))) blueprint = nextBlueprint(sim);
  const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
  const hint = blueprint ? ' Entre los restos flota un cofre metálico bien cerrado.' : ' Quizá quede algo de valor entre los restos.';
  const ev = newEvent(sim, 'naufragio', 'Naufragio a la vista', `Por ${sideName(side)} asoma el casco destrozado del «${ship}», escorado y medio hundido.${hint}`);
  const b = hullBounds(sim);
  const s = addSighting(sim, ev, 'naufragio', `Restos del «${ship}»`, side, b.bowX + 220, sim.rng.range(70, 105), SIGHTING_WINDOW);
  const d: WreckData = { phase: 'avistado', sightingId: s.id, ship, side, blueprint, total: 0, collected: 0, lost: 0, chestCollected: false };
  ev.data = d as unknown as Record<string, unknown>;
  ev.endsAt = st.time + SIGHTING_WINDOW;
  ev.objectives = [obj('Decide en el timón: detenerse a rescatar o seguir rumbo')];
  ev.choices = [
    { id: 'rescatar', label: 'Detenerse a rescatar (1 h)', enabled: true },
    { id: 'seguir', label: 'Seguir rumbo', enabled: true },
  ];
  return begin(sim, ev, 'info', `Naufragio a la vista: el «${ship}» flota a la deriva por ${sideName(side)}. Decide en el timón si nos detenemos.`);
}

const WRECK_DEBRIS: Partial<Record<DebrisKind, number>> = { restos: 4, caja: 3, barril: 2, bidon: 2, tablones: 2, red: 1 };

/** Motivo del fondeo junto a un pecio (para levar anclas al terminar el rescate). */
function wreckAnchorReason(d: WreckData): string {
  return `rescate de los restos del «${d.ship}»`;
}

function rescueWreck(sim: Simulation, ev: ActiveEvent): ActionResult {
  const st = sim.state;
  const d = dataOf<WreckData>(ev);
  // anchorShip ya deja en el diario «Echamos el ancla: rescate de los restos del «X»».
  anchorShip(sim, WRECK_ANCHOR_MIN, wreckAnchorReason(d));
  const b = hullBounds(sim);
  const n = sim.rng.int(WRECK_DEBRIS_COUNT[0], WRECK_DEBRIS_COUNT[1]);
  for (let i = 0; i < n; i++) {
    const chest = i === 0;
    const kind: DebrisKind = chest ? 'cofre' : ((sim.rng.weighted(WRECK_DEBRIS) ?? 'restos') as DebrisKind);
    const loot = rollLoot(sim, kind, chest ? 1 : WRECK_RICHNESS);
    if (chest && d.blueprint) loot.unshift({ id: d.blueprint, qty: 1 });
    // Alrededor del barco, del lado del pecio (algunos al otro lado, arrastrados por la corriente).
    const side = sim.rng.chance(0.8) ? d.side : -d.side;
    const x = sim.rng.range(b.sternX + 2, b.bowX + 6);
    const z = side * (b.halfW + sim.rng.range(chest ? 5 : 3.5, chest ? 12 : 17));
    spawnDebris(sim, kind, { x, z }, { loot, eventId: ev.id, lateral: sim.rng.range(-0.03, 0.03) });
  }
  d.phase = 'rescate';
  d.total = n;
  ev.stage = 1;
  ev.title = `Rescate del «${d.ship}»`;
  ev.description = `Fondeados junto al pecio del «${d.ship}»: ${n} restos flotan alrededor del barco. Rescátalos con el gancho antes de levar anclas.`;
  ev.endsAt = st.time + WRECK_ANCHOR_MIN + 30;
  ev.choices = [];
  const s = sightingOf(sim, d.sightingId);
  if (s) s.expiresAt = Math.max(s.expiresAt, st.time + WRECK_ANCHOR_MIN + 40);
  refreshObjectives(sim, ev);
  return { ok: true, msg: `${n} restos flotan alrededor del barco: ¡rescátalos con el gancho antes de levar anclas!` };
}

/* ---- Isla y estructura (expediciones) ---- */

function startExpeditionSighting(sim: Simulation, type: 'isla' | 'estructura'): ActiveEvent {
  const st = sim.state;
  const b = hullBounds(sim);
  const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
  const inFaro = st.voyage.regionId === 'faro';
  let ev: ActiveEvent;
  let name: string;
  let minutes: number;
  if (type === 'isla') {
    name = sim.rng.pick(ISLANDS);
    minutes = ISLAND_EXPEDITION_MIN;
    ev = newEvent(sim, 'isla', 'Isla en el horizonte', `${name} asoma por ${sideName(side)}: playas blancas, palmeras y quizá un arroyo. Si fondeamos, alguien podría bajar a explorar.`);
    addSighting(sim, ev, 'isla', name, side, b.bowX + 260, sim.rng.range(140, 210), SIGHTING_WINDOW + 30);
  } else {
    name = inFaro ? 'un faro sin luz sobre las rocas' : sim.rng.pick(STRUCTURES);
    minutes = STRUCTURE_EXPEDITION_MIN;
    ev = newEvent(sim, 'estructura', 'Estructura misteriosa', `Por ${sideName(side)} se distingue ${name}. Nadie sabe quién la levantó ni cuándo. Dentro podría haber material valioso… o algo más.`);
    addSighting(sim, ev, 'estructura', capitalize(name), side, b.bowX + 250, sim.rng.range(115, 165), SIGHTING_WINDOW + 30);
  }
  const s = st.voyage.sightings[st.voyage.sightings.length - 1]!;
  const d: ExpeditionData = { phase: 'avistado', sightingId: s.id, name, npcIds: [], returnAt: null, minutes };
  ev.data = d as unknown as Record<string, unknown>;
  ev.endsAt = st.time + SIGHTING_WINDOW + 30;
  ev.objectives = [obj('Decide en el timón: enviar una expedición o seguir rumbo')];
  const block = expeditionBlocker(sim);
  ev.choices = [
    { id: 'expedicion', label: `Fondear y enviar una expedición (${minutes / 60} h)`, enabled: !block, ...(block ? { reason: block } : {}) },
    { id: 'seguir', label: 'Seguir rumbo', enabled: true },
  ];
  return begin(sim, ev, 'info', type === 'isla' ? `Tierra a la vista: ${name}. Podemos fondear y enviar una expedición.` : `Avistamos ${name}. Una expedición podría registrarla.`);
}

function launchExpedition(sim: Simulation, ev: ActiveEvent): ActionResult {
  const st = sim.state;
  const d = dataOf<ExpeditionData>(ev);
  const avail = availableForExpedition(sim);
  if (!avail.length) return fail(expeditionBlocker(sim) ?? 'No hay nadie disponible');
  const count = avail.length >= 3 ? 2 : 1;
  const team = avail.slice(0, count);
  const returnAt = st.time + d.minutes;
  for (const n of team) sendOnExpedition(sim, n, ev.id, returnAt);
  d.phase = 'expedicion';
  d.npcIds = team.map((n) => n.id);
  d.returnAt = returnAt;
  ev.stage = 1;
  ev.endsAt = returnAt; // la cuenta atrás del HUD es la de la vuelta
  ev.choices = [];
  anchorShip(sim, d.minutes, ev.type === 'isla' ? `expedición a ${d.name}` : 'expedición a la estructura');
  const names = listNames(team.map((n) => n.name));
  ev.objectives = [obj(`${names} ${team.length > 1 ? 'exploran' : 'explora'} ${ev.type === 'isla' ? d.name : 'la estructura'} (vuelta hacia las ${clockText(returnAt)})`)];
  const s = sightingOf(sim, d.sightingId);
  if (s) s.expiresAt = Math.max(s.expiresAt, returnAt + 40);
  sim.log(`${names} ${team.length > 1 ? 'bajan' : 'baja'} en el bote hacia ${d.name}. ${team.length > 1 ? 'Volverán' : 'Volverá'} hacia las ${clockText(returnAt)}.`, 'info');
  return { ok: true, msg: `La expedición parte: ${names}` };
}

/** «Taller mecánico» para el plano «Plano: Taller mecánico». */
function blueprintTitle(id: ItemId): string {
  const name = itemName(id);
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1).trim() : name;
}

function finishExpedition(sim: Simulation, ev: ActiveEvent): void {
  const d = dataOf<ExpeditionData>(ev);
  const back: NpcState[] = [];
  for (const id of d.npcIds) {
    const n = sim.state.npcs.find((nn) => nn.id === id);
    if (n) back.push(n);
  }
  for (const n of back) returnFromExpedition(sim, n);
  // Botín, sumado por objeto (nunca «3× Componentes … 2× Componentes»).
  const loot: ItemStack[] = [];
  const add = (id: ItemId, qty: number): void => {
    if (qty <= 0) return;
    const s = loot.find((x) => x.id === id);
    if (s) s.qty += qty;
    else loot.push({ id, qty });
  };
  /** Frases completas que siguen al botín (cada una con su punto final). */
  const extra: string[] = [];
  const crew = Math.max(1, back.length);
  const plural = back.length > 1;
  let blueprint: ItemId | null = null;
  if (ev.type === 'isla') {
    add('madera', sim.rng.int(6, 12) * crew);
    add('fruta', sim.rng.int(4, 8) * crew);
    add('fibra', sim.rng.int(3, 6));
    add(sim.rng.chance(0.6) ? 'semilla_hortaliza' : 'semilla_lino', sim.rng.int(1, 3));
    if (sim.rng.chance(0.25)) {
      blueprint = nextBlueprint(sim);
      if (blueprint) extra.push(`En una cabaña abandonada ${plural ? 'encontraron' : 'encontró'} un plano: «${blueprintTitle(blueprint)}».`);
    }
  } else {
    add('componentes', sim.rng.int(1, 3));
    add('placa_metal', sim.rng.int(2, 4));
    add('chatarra', sim.rng.int(4, 8));
    add('tornillos', sim.rng.int(3, 6));
    if (sim.rng.chance(STRUCTURE_BLUEPRINT_CHANCE)) blueprint = nextBlueprint(sim);
    if (blueprint) extra.push(`En la sala de control ${plural ? 'encontraron' : 'encontró'} un plano: «${blueprintTitle(blueprint)}».`);
    else add('componentes', 2);
  }
  // Todo a los almacenes (el plano también); lo que no cabe, a una caja en cubierta junto a la borda.
  const left: ItemStack[] = [];
  for (const s of blueprint ? [...loot, { id: blueprint, qty: 1 }] : loot) {
    const l = depositToStorage(sim, s.id, s.qty);
    if (l > 0) left.push({ id: s.id, qty: l });
  }
  if (left.length) {
    const at = back[0]?.pos ?? sim.collision.safeSpawn();
    spawnCrate(sim, { ...at }, left, 'Botín de la expedición');
  }
  // Imprevistos.
  if (back.length && sim.rng.chance(0.1)) {
    const hurt = sim.rng.pick(back);
    hurt.injured = true;
    hurt.needs.health = Math.max(15, hurt.needs.health - 35);
    extra.push(`${hurt.name} vuelve ${npcAdj(hurt, 'herido')} y necesita reposo.`);
  }
  if (sim.rng.chance(ev.type === 'isla' ? 0.15 : 0.05)) {
    const at = back[0]?.pos;
    const n = spawnSurvivor(sim, { ...(at ? { pos: at } : {}), origin: ev.type === 'isla' ? 'isla' : 'estructura', quiet: true });
    if (n) {
      const story = ev.type === 'isla' ? `sobrevivía ${npcAdj(n, 'solo')} en la isla desde hacía meses` : 'se refugiaba en la estructura';
      const withThem = !back.length ? 'en el bote' : plural ? (back.every(isFemaleNpc) ? 'con ellas' : 'con ellos') : isFemaleNpc(back[0]!) ? 'con ella' : 'con él';
      extra.push(`${n.name} ${story} y viene ${withThem}. ${survivorJoinText([n])}`);
    }
  }
  const who = back.length ? listNames(back.map((n) => n.name)) : 'La expedición';
  const where = ev.type === 'isla' ? d.name : 'la estructura';
  const stored = left.length ? ' (parte no cabía en los almacenes: está en una caja en cubierta)' : '';
  const text = `${who} ${plural ? 'vuelven' : 'vuelve'} de ${where} con ${stacksText(loot)}${stored}.${extra.length ? ` ${extra.join(' ')}` : ''}`;
  sim.bus.emit('sfx', { name: 'expedicion_vuelve' });
  endEvent(sim, ev, true, text, 'good');
}

/* ---- Náufragos ---- */

function startRaft(sim: Simulation, opts: StartOptions): ActiveEvent {
  const survivors = Math.max(1, Math.min(3, Math.floor(opts.survivors ?? sim.rng.int(1, 2))));
  const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
  const b = hullBounds(sim);
  const who = survivors === 1 ? 'una persona agita' : `${survivors === 2 ? 'dos' : 'tres'} personas agitan`;
  const ev = newEvent(sim, 'naufragos', 'Náufragos a la deriva', `Una balsa improvisada se acerca por ${sideName(side)}: ${who} los brazos pidiendo ayuda. Si pasa de largo, ${survivors === 1 ? 'la' : 'los'} perderemos.`);
  const anchored = isAnchored(sim);
  const x = anchored ? sim.rng.range(b.sternX + 6, b.bowX + 10) : b.bowX + sim.rng.range(48, 60);
  const raft = spawnDebris(sim, 'balsa', { x, z: side * (b.halfW + sim.rng.range(5, 11)) }, { survivors, eventId: ev.id, lateral: 0 });
  const d: RaftData = { debrisId: raft.id, survivors, rescued: false };
  ev.data = d as unknown as Record<string, unknown>;
  ev.objectives = [obj('Lanza el gancho a la balsa antes de que pase de largo')];
  ev.choices = anchored ? [] : [{ id: 'fondear', label: `Echar el ancla para esperar a la balsa (${RAFT_ANCHOR_MIN} min)`, enabled: true }];
  return begin(sim, ev, 'warn', `¡Náufragos! Una balsa se acerca por ${sideName(side)}. Lanza el gancho para subirlos a bordo.`);
}

/* ---- Avería ---- */

/** Fuentes de energía en marcha (generadores y paneles). */
function powerSources(sim: Simulation): ModuleInstance[] {
  return sim.state.ship.modules.filter((m) => m.status === 'active' && (moduleDef(m.type).powerGen ?? 0) > 0);
}

/**
 * ¿Averiar este módulo dejaría al barco sin salida? Sin ningún repuesto a bordo, el taller (que
 * fabrica las piezas mecánicas), la única fuente de energía (sin ella el taller no trabaja) o el
 * banco de trabajo (que fabrica los kits) bloquearían su propia reparación. El director no los
 * elige entonces (el guion y las pruebas sí pueden, con `moduleId`).
 */
function wouldDeadlock(sim: Simulation, m: ModuleInstance): boolean {
  const { part } = repairNeeds(m.type);
  if (shipCount(sim, part) > 0) return false;
  if (m.type === 'taller' || m.type === 'banco_trabajo') return true;
  return (moduleDef(m.type).powerGen ?? 0) > 0 && powerSources(sim).length <= 1;
}

/**
 * Objetivos por pasos para reparar un módulo (GDD §9: conseguir la herramienta, conseguir o
 * fabricar el repuesto y reparar), marcados según lo que ya hay: la herramienta en el inventario
 * del jugador y el repuesto en el inventario o en los almacenes. Dicen dónde se consigue cada cosa.
 */
function repairObjectives(sim: Simulation, m: ModuleInstance, finalText: string): EventObjective[] {
  const { tool, part } = repairNeeds(m.type);
  const fixed = m.status === 'active' && m.condition >= REPAIR_THRESHOLD && !m.leak;
  const hasTool = countItem(sim.state.player.inventory, tool) > 0;
  const hasPart = shipCount(sim, part) > 0;
  const toolText = tool === 'martillo' ? 'Consigue un martillo (banco de trabajo)' : 'Consigue una llave inglesa (banco de trabajo)';
  const partText =
    part === 'pieza_mecanica'
      ? 'Consigue una pieza mecánica (taller con energía, pieza improvisada en el banco, pecios o mercantes)'
      : 'Consigue un kit de reparación (banco de trabajo)';
  return [obj(toolText, fixed || hasTool), obj(partText, fixed || hasPart), obj(finalText, fixed)];
}

/**
 * Pasadas 24 h sin reparar una avería, el mecánico (o quien haya a bordo) hace un apaño: la
 * máquina vuelve a funcionar (o la estructura deja de ceder) al 40 % y el evento se cierra como
 * fracaso parcial. Queda pendiente una reparación de verdad, que el mecánico hará en cuanto tenga
 * repuestos.
 */
function patchBreakdown(sim: Simulation, ev: ActiveEvent, m: ModuleInstance): void {
  const d = dataOf<BreakdownData>(ev);
  const crew = presentNpcs(sim).filter((n) => !n.injured && n.needs.health > 30);
  const who = crew.find((n) => n.role === 'mecanico') ?? crew[0];
  if (!who) {
    d.patchAt = sim.state.time + 120; // nadie en condiciones: se vuelve a intentar más tarde
    return;
  }
  const name = moduleDef(m.type).name;
  m.status = 'active';
  m.brokenReason = null;
  m.condition = Math.max(m.condition, BREAKDOWN_PATCH_CONDITION);
  const what = d.structural ? `${withArticle(name)} aguantará` : `${withArticle(name)} vuelve a funcionar`;
  endEvent(sim, ev, false, `${who.name} hace un apaño provisional: ${what}, pero al ${BREAKDOWN_PATCH_CONDITION} %. Hará falta repararl${isFeminineName(name) ? 'a' : 'o'} de verdad.`, 'warn');
}

function startBreakdown(sim: Simulation, opts: StartOptions): ActiveEvent | null {
  const st = sim.state;
  let m: ModuleInstance | undefined = opts.moduleId !== undefined ? findModule(sim, opts.moduleId) : undefined;
  if (!m) {
    const ok = (mm: ModuleInstance) => mm.status === 'active' && mm.fire <= 0 && !wouldDeadlock(sim, mm);
    const machines = st.ship.modules.filter((mm) => ok(mm) && moduleDef(mm.type).machine);
    if (machines.length) {
      const weights: Record<string, number> = {};
      for (const mm of machines) weights[String(mm.id)] = machineRunning(sim, mm) ? 3 : 1;
      const pick = sim.rng.weighted(weights);
      m = machines.find((mm) => String(mm.id) === pick) ?? machines[0];
    } else {
      const structures = st.ship.modules.filter((mm) => ok(mm) && mm.type !== 'escalera' && !moduleDef(mm.type).machine);
      if (!structures.length) return null;
      m = sim.rng.pick(structures);
    }
  }
  if (!m || m.status === 'construction') return null;
  const def = moduleDef(m.type);
  const structural = !def.machine;
  const name = def.name;
  let reason: string;
  if (structural) {
    reason = sim.rng.pick(['Una viga se ha agrietado', 'Las juntas del suelo ceden', 'El oleaje ha desencajado varios tablones']);
    m.condition = Math.max(0, m.condition - 35);
    if (m.condition <= 0) {
      m.status = 'broken';
      m.brokenReason = reason;
    }
  } else {
    reason = sim.rng.pick(BREAKDOWN_REASONS[m.type] ?? ['Una pieza se ha roto']);
    m.status = 'broken';
    m.brokenReason = reason;
    m.powered = false;
    m.condition = Math.min(m.condition, 40);
  }
  const pron = isFeminineName(name) ? 'la' : 'lo';
  const ev = newEvent(sim, 'averia', `Avería: ${name}`, `${reason} en ${withArticle(name)}. ${structural ? 'La estructura está debilitada y seguirá empeorando con el oleaje.' : `${capitalize(withArticle(name))} no funcionará hasta reparar${pron}.`}`);
  const d: BreakdownData = { moduleId: m.id, structural, reason, patchAt: st.time + BREAKDOWN_PATCH_MIN };
  ev.data = d as unknown as Record<string, unknown>;
  ev.objectives = repairObjectives(sim, m, `Repara ${withArticle(name)}`);
  const c = moduleCenter(m, st.ship.width);
  sim.bus.emit('sfx', { name: 'averia', x: c.x, y: c.y + 1, z: c.z });
  return begin(sim, ev, 'warn', `Avería: ${reason.charAt(0).toLowerCase()}${reason.slice(1)} en ${withArticle(name)}.`);
}

/* ---- Incendio ---- */

function startFireEvent(sim: Simulation, opts: StartOptions): ActiveEvent | null {
  let m: ModuleInstance | undefined = opts.moduleId !== undefined ? findModule(sim, opts.moduleId) : undefined;
  if (!m) {
    const cands = fireCandidates(sim);
    if (!cands.length) return null;
    const weights: Record<string, number> = {};
    for (const c of cands) weights[String(c.m.id)] = c.w;
    const pick = sim.rng.weighted(weights);
    m = cands.find((c) => String(c.m.id) === pick)?.m ?? cands[0]!.m;
  }
  if (!m || !isFlammable(m)) return null;
  startFire(sim, m, FIRE_START);
  return activeEvent(sim, 'incendio') ?? null;
}

/**
 * Prende fuego a un módulo (o aviva el que ya tiene) y abre o amplía el evento de incendio.
 * Lo usan el director, los rayos de la tormenta y la propagación.
 */
export function startFire(sim: Simulation, m: ModuleInstance, intensity = FIRE_START, cause?: string): void {
  if (!isFlammable(m)) return;
  const st = sim.state;
  const was = m.fire > 0;
  m.fire = clamp(Math.max(m.fire, intensity), 0, 100);
  let ev = activeEvent(sim, 'incendio');
  const label = moduleLabel(m);
  if (!ev) {
    ev = newEvent(sim, 'incendio', '¡Incendio a bordo!', `Las llamas prenden en ${label}${cause ? ` (${cause})` : ''}. El fuego crece, destruye lo que encuentra y puede saltar a los módulos vecinos.`);
    const d: FireData = { modules: [m.id], destroyed: [] };
    ev.data = d as unknown as Record<string, unknown>;
    ev.objectives = [];
    begin(sim, ev, 'danger', `¡Fuego en ${label}! Llena un cubo de agua de mar en la borda y apágalo antes de que se extienda.`);
  } else if (!was) {
    const d = dataOf<FireData>(ev);
    if (!d.modules.includes(m.id)) d.modules.push(m.id);
    sim.log(`¡El fuego se extiende a ${label}!`, 'danger');
  }
  refreshObjectives(sim, ev);
  const c = moduleCenter(m, st.ship.width);
  sim.bus.emit('sfx', { name: 'fuego', x: c.x, y: c.y + 1, z: c.z });
}

/** Módulos vecinos (comparten arista en el mismo nivel o están justo encima/debajo). */
function neighbours(sim: Simulation, m: ModuleInstance): ModuleInstance[] {
  const mine = moduleCells(m);
  const out: ModuleInstance[] = [];
  for (const o of sim.state.ship.modules) {
    if (o.id === m.id) continue;
    const cells = moduleCells(o);
    const touch = cells.some((c) =>
      mine.some((k) => (c.level === k.level && Math.abs(c.x - k.x) + Math.abs(c.z - k.z) === 1) || (c.x === k.x && c.z === k.z && Math.abs(c.level - k.level) === 1)),
    );
    if (touch) out.push(o);
  }
  return out;
}

function burnContents(sim: Simulation, m: ModuleInstance): void {
  const inv = m.inventory;
  if (!inv) return;
  const burnable = inv.slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !!s && (BURNABLE_ITEMS.has(s.id) || BURNABLE_CATEGORIES.has(ITEMS[s.id]?.category ?? '')));
  if (!burnable.length) return;
  const { s, i } = sim.rng.pick(burnable);
  const lost = Math.max(1, Math.ceil(s!.qty * 0.2));
  s!.qty -= lost;
  if (s!.qty <= 0) inv.slots[i] = null;
  sim.notify(`El fuego destruye ${lost}× ${itemName(s!.id)} en ${moduleLabel(m)}`, 'danger');
}

function tickFires(sim: Simulation, dt: number): void {
  const st = sim.state;
  const hours = dt / 60;
  const w = st.weather;
  const burning = burningModules(sim);
  for (const m of burning) {
    const sky = moduleHasSky(sim, m);
    const name = moduleDef(m.type).name;
    let growth = FIRE_GROWTH_PER_HOUR * (sky ? 1 + 0.5 * clamp(w.wind, 0, 1) : 1);
    if (sky) growth -= RAIN_QUENCH_PER_HOUR * clamp(w.rain, 0, 1);
    if (m.condition <= 0) growth = -20; // ya no queda nada que arda
    m.fire = clamp(m.fire + growth * hours, 0, 100);
    // Daño estructural.
    if (m.condition > 0) {
      m.condition = Math.max(0, m.condition - (m.fire / 100) * FIRE_BURN_PER_HOUR * hours);
      if (m.condition <= 0) {
        m.condition = 0;
        m.status = 'broken';
        m.brokenReason = 'Calcinado por el fuego';
        m.powered = false;
        const ev = activeEvent(sim, 'incendio');
        if (ev) {
          const d = dataOf<FireData>(ev);
          if (!d.destroyed.includes(m.id)) d.destroyed.push(m.id);
        }
        sim.log(`El fuego ha calcinado ${withArticle(name)}: hay que reparar${isFeminineName(name) ? 'la' : 'lo'}`, 'danger');
      }
    }
    // Contenido.
    if (m.fire > 50 && sim.rng.chance(1 - Math.pow(1 - FIRE_CONTENT_LOSS_PER_HOUR, hours))) burnContents(sim, m);
    // Propagación.
    if (m.fire > FIRE_SPREAD_ABOVE) {
      const p = 1 - Math.pow(1 - FIRE_SPREAD_CHANCE_PER_HOUR, hours);
      for (const n of neighbours(sim, m)) {
        if (n.fire > 0 || !isFlammable(n)) continue;
        if (sim.rng.chance(p)) startFire(sim, n, 15);
      }
    }
    if (m.fire <= 0) {
      m.fire = 0;
      sim.notify(`Se ha apagado el fuego en ${moduleLabel(m)}`, 'good');
    }
  }
}

/* ---- Banco de peces ---- */

function startFishBank(sim: Simulation): ActiveEvent {
  const ev = newEvent(sim, 'banco_peces', 'Banco de peces', 'El agua hierve de peces plateados alrededor del casco. ¡Es el momento de echar la caña!');
  const d: FishBankData = { catches: 0 };
  ev.data = d as unknown as Record<string, unknown>;
  ev.data['wakePlayer'] = false;
  ev.endsAt = sim.state.time + FISH_BANK_MIN;
  refreshObjectives(sim, ev);
  return begin(sim, ev, 'good', 'Un banco de peces rodea el barco: durante dos horas pican mucho más rápido.');
}

/** Lo llaman la pesca del jugador y la de los habitantes. */
export function onFishCaught(sim: Simulation, n: number): void {
  const ev = activeEvent(sim, 'banco_peces');
  if (!ev) return;
  dataOf<FishBankData>(ev).catches += n;
  refreshObjectives(sim, ev);
}

/* ---- Mercante ---- */

function startMerchant(sim: Simulation): ActiveEvent {
  const st = sim.state;
  const ship = sim.rng.pick(MERCHANT_SHIPS);
  const captain = sim.rng.pick(CAPTAINS);
  const side: 1 | -1 = sim.rng.chance(0.5) ? 1 : -1;
  // Ofertas: 4 distintas, sin planos que ya conozcamos.
  const pool = TRADE_OFFERS.filter((o) =>
    Object.keys(o.get).every((id) => {
      const key = ITEMS[id]?.unlocks;
      return !key || !st.unlocks.includes(key);
    }),
  );
  const offers: TradeOfferState[] = [];
  const bag = [...pool];
  while (offers.length < 4 && bag.length) {
    const i = sim.rng.int(0, bag.length - 1);
    const o = bag.splice(i, 1)[0]!;
    offers.push({ give: { ...o.give }, get: { ...o.get }, done: false });
  }
  const ev = newEvent(sim, 'mercante', 'Barco mercante', `El «${ship}» se pone a la par por ${sideName(side)}. Desde la borda, ${captain} ofrece intercambios durante dos horas.`);
  const b = hullBounds(sim);
  const s = addSighting(sim, ev, 'mercante', `Mercante «${ship}»`, side, b.bowX + 120, sim.rng.range(30, 38), MERCHANT_MIN);
  const d: MerchantData = { sightingId: s.id, ship, captain, offers, trades: 0 };
  ev.data = d as unknown as Record<string, unknown>;
  ev.endsAt = st.time + MERCHANT_MIN;
  ev.choices = [
    { id: 'comerciar', label: 'Comerciar con el mercante', enabled: true },
    { id: 'despedir', label: 'Despedir al mercante', enabled: true },
  ];
  refreshObjectives(sim, ev);
  return begin(sim, ev, 'info', `El mercante «${ship}» se acerca por ${sideName(side)}: podemos comerciar durante dos horas.`);
}

/** Ofertas del mercante con su disponibilidad (para la UI). */
export function tradeOffers(sim: Simulation, eventId: number): { index: number; give: Record<ItemId, number>; get: Record<ItemId, number>; done: boolean; canAfford: boolean; missing: Record<ItemId, number> }[] {
  const ev = eventById(sim, eventId);
  if (!ev || ev.type !== 'mercante') return [];
  const invs = payInventories(sim);
  return dataOf<MerchantData>(ev).offers.map((o, index) => {
    const missing = missingFor(invs, o.give);
    return { index, give: o.give, get: o.get, done: o.done, canAfford: !o.done && Object.keys(missing).length === 0, missing };
  });
}

/** Intercambio con el mercante: paga con el inventario del jugador y luego con los almacenes. */
export function trade(sim: Simulation, eventId: number, offerIndex: number): ActionResult {
  const st = sim.state;
  if (!st.player.alive) return fail('No puedes hacer nada');
  if (st.player.sleeping) return fail('Estás durmiendo');
  const ev = eventById(sim, eventId);
  if (!ev || ev.type !== 'mercante') return fail('El mercante ya se ha ido');
  const d = dataOf<MerchantData>(ev);
  const o = d.offers[offerIndex];
  if (!o) return fail('Esa oferta no existe');
  if (o.done) return fail('Ya hiciste ese trato');
  const invs = payInventories(sim);
  const miss = missingFor(invs, o.give);
  if (Object.keys(miss).length) return fail(`Te faltan: ${stacksText(miss)}`);
  consume(invs, o.give);
  let allFit = true;
  for (const [id, q] of Object.entries(o.get)) allFit = giveToPlayer(sim, id, q, true) && allFit;
  o.done = true;
  d.trades++;
  refreshObjectives(sim, ev);
  sim.log(`Trato con el «${d.ship}»: ${stacksText(o.give)} a cambio de ${stacksText(o.get)}`, 'good', false);
  const p = st.player.pos;
  sim.bus.emit('sfx', { name: 'comercio', x: p.x, y: p.y + 1, z: p.z });
  const msg = `Entregas ${stacksText(o.give)} y recibes ${stacksText(o.get)}${allFit ? '' : ' (no cabía todo: el resto está en una caja a tus pies)'}`;
  if (d.offers.every((x) => x.done)) endEvent(sim, ev, true, `${capitalize(d.captain)} se despide: «¡Da gusto comerciar con vosotros!». El «${d.ship}» se aleja.`, 'good');
  return { ok: true, msg };
}

/* ---- Plaga ---- */

function startPest(sim: Simulation): ActiveEvent | null {
  const plots = plantedPlots(sim);
  if (!plots.length) return null;
  const n = Math.min(plots.length, sim.rng.int(1, 3));
  const chosen: { moduleId: number; plot: number }[] = [];
  const bag = [...plots];
  for (let i = 0; i < n; i++) {
    const k = sim.rng.int(0, bag.length - 1);
    const p = bag.splice(k, 1)[0]!;
    p.m.plots[p.plot]!.pest = true;
    chosen.push({ moduleId: p.m.id, plot: p.plot });
  }
  const ev = newEvent(sim, 'plaga', 'Plaga en el huerto', 'Pulgones y moho blanco se extienden por los bancales. Las plantas afectadas no crecen y, si no se limpian en un día, morirán.');
  const d: PestData = { plots: chosen };
  ev.data = d as unknown as Record<string, unknown>;
  ev.data['wakePlayer'] = false;
  ev.endsAt = sim.state.time + PEST_DEADLINE_MIN;
  refreshObjectives(sim, ev);
  return begin(sim, ev, 'warn', `Plaga en el huerto: ${n === 1 ? 'un bancal afectado' : `${n} bancales afectados`}. Retírala antes de que mate las plantas.`);
}

function pestPending(sim: Simulation, d: PestData): { moduleId: number; plot: number }[] {
  return d.plots.filter((p) => {
    const m = findModule(sim, p.moduleId);
    const plot = m?.plots[p.plot];
    return !!plot && plot.pest && !!plot.crop && !plot.dead;
  });
}

/* ---- Fuga ---- */

function startLeak(sim: Simulation, opts: StartOptions): ActiveEvent | null {
  let m = opts.moduleId !== undefined ? findModule(sim, opts.moduleId) : undefined;
  if (!m) {
    const tanks = sim.state.ship.modules.filter((mm) => mm.type === 'deposito' && mm.status === 'active' && !mm.leak);
    if (!tanks.length) return null;
    m = sim.rng.pick(tanks);
  }
  if (!m) return null;
  m.leak = true;
  const ev = newEvent(sim, 'fuga', 'Fuga en el depósito', 'Una junta ha reventado y el agua potable se escapa a chorro (unos 6 litros por hora). Hay que sellarla cuanto antes.');
  const d: LeakData = { moduleId: m.id };
  ev.data = d as unknown as Record<string, unknown>;
  ev.objectives = repairObjectives(sim, m, 'Sella la fuga del depósito');
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name: 'fuga', x: c.x, y: c.y + 1, z: c.z });
  return begin(sim, ev, 'warn', '¡Fuga en el depósito de agua! Repárala con martillo y kit de reparación.');
}

/* ---- Enfermedad ---- */

function startSickness(sim: Simulation, opts: StartOptions): ActiveEvent | null {
  let n = opts.npcId ? sim.state.npcs.find((nn) => nn.id === opts.npcId) : undefined;
  if (!n) {
    const cands = presentNpcs(sim).filter((nn) => !nn.sick && !nn.injured);
    if (!cands.length) return null;
    // Al azar, pero no se ensaña con quien aún no se ha repuesto (evita rachas mortales).
    const healthy = cands.filter((nn) => nn.needs.health >= 60);
    n = sim.rng.pick(healthy.length ? healthy : cands);
  }
  if (!n) return null;
  n.sick = true;
  const cause = opts.cause ? ` (${opts.cause})` : '';
  const pron = isFemaleNpc(n) ? 'la' : 'lo';
  const ev = newEvent(
    sim,
    'enfermedad',
    `${n.name} ha enfermado`,
    `${n.name} tiene fiebre y escalofríos${cause}. Sin tratamiento no se cura: pierde salud poco a poco y puede contagiar a quien tenga cerca. Necesita un botiquín, una camilla en la enfermería o guardar cama.`,
  );
  const d: SicknessData = { npcId: n.id, name: n.name };
  ev.data = d as unknown as Record<string, unknown>;
  ev.data['wakePlayer'] = false;
  ev.objectives = [obj(`Cura a ${n.name}: dale un botiquín o que repose en la enfermería o en su cama`)];
  return begin(sim, ev, 'warn', `${n.name} ha enfermado${cause}. Un botiquín, la enfermería o guardar cama ${pron} curarán.`);
}

/* ---- Discusión ---- */

function startDiscussion(sim: Simulation): ActiveEvent | null {
  const pair = arguingPair(sim);
  if (!pair) return null;
  const [a, b] = pair;
  const topic = sim.rng.pick(DISCUSSION_TOPICS);
  const ev = newEvent(sim, 'discusion', 'Discusión a bordo', `${a.name} y ${b.name} discuten a gritos por ${topic}. El mal ambiente se contagia y el trabajo se resiente.`);
  const d: DiscussionData = { npcIds: [a.id, b.id], names: [a.name, b.name], topic, argueUntil: sim.state.time + ARGUMENT_MIN };
  ev.data = d as unknown as Record<string, unknown>;
  ev.data['wakePlayer'] = false;
  ev.endsAt = sim.state.time + DISCUSSION_MAX_MIN;
  ev.objectives = [obj(`Habla con ${a.name} o ${b.name} para mediar`)];
  return begin(sim, ev, 'warn', `${a.name} y ${b.name} discuten por ${topic}. Habla con uno de los dos para calmar los ánimos.`);
}

/** Habitantes enfrentados en una discusión activa (para npc.ts). */
export function discussionOf(sim: Simulation, npcId: string): { ev: ActiveEvent; other: string; argueUntil: number; topic: string } | null {
  const ev = activeEvent(sim, 'discusion');
  if (!ev) return null;
  const d = dataOf<DiscussionData>(ev);
  const i = d.npcIds.indexOf(npcId);
  if (i < 0) return null;
  return { ev, other: d.npcIds[1 - i]!, argueUntil: d.argueUntil, topic: d.topic };
}

/** El jugador media en la discusión hablando con uno de los implicados. */
export function mediateDiscussion(sim: Simulation, npcId: string): ActionResult {
  const info = discussionOf(sim, npcId);
  if (!info) return fail('No hay ninguna discusión que mediar');
  const d = dataOf<DiscussionData>(info.ev);
  for (const id of d.npcIds) {
    const n = sim.state.npcs.find((nn) => nn.id === id);
    if (n) n.needs.mood = clamp(n.needs.mood + 15, 0, 100);
  }
  endEvent(sim, info.ev, true, `Gracias a tu mediación, ${d.names[0]} y ${d.names[1]} hacen las paces.`, 'good');
  return { ok: true, msg: `Escuchas a ${d.names[0]} y a ${d.names[1]} y les ayudas a entenderse. Hacen las paces.` };
}

/* ------------------------------------------------------------------ */
/* Ganchos desde otros sistemas                                        */
/* ------------------------------------------------------------------ */

/**
 * Un resto con evento ha sido rescatado (por el jugador o un habitante). `survivors`: los náufragos
 * que suben a bordo (ya creados en silencio: este aviso único cuenta el rescate y quién se une).
 */
export function onDebrisCollected(sim: Simulation, d: Debris, by: 'player' | 'npc', survivors: NpcState[]): void {
  if (d.eventId === undefined) return;
  const ev = eventById(sim, d.eventId);
  if (!ev) return;
  if (ev.type === 'naufragos') {
    const data = dataOf<RaftData>(ev);
    data.rescued = true;
    // Si fondeamos para esperarla, ya no hace falta seguir parados.
    if (isAnchored(sim) && sim.state.voyage.anchorReason === RAFT_ANCHOR_REASON) weighAnchor(sim, true);
    const many = survivors.length > 1;
    const names = survivors.length ? listNames(survivors.map((n) => n.name)) : 'Los náufragos';
    const rescuer = by === 'player' ? '' : ' gracias a la tripulación';
    const join = survivors.length ? ` ${survivorJoinText(survivors)}` : '';
    endEvent(sim, ev, true, `${names} ya ${many ? 'están' : 'está'} a salvo a bordo${rescuer}. ${many ? 'Cuentan que llevaban' : 'Cuenta que llevaba'} días a la deriva.${join}`, 'good');
  } else if (ev.type === 'naufragio') {
    const data = dataOf<WreckData>(ev);
    data.collected++;
    if (d.kind === 'cofre') data.chestCollected = true;
    refreshObjectives(sim, ev);
    if (data.collected + data.lost >= data.total && data.total > 0) {
      // Rescatado todo: se leva el ancla en el acto (no hace falta esperar a que venza el fondeo).
      const anchoredHere = isAnchored(sim) && sim.state.voyage.anchorReason === wreckAnchorReason(data);
      if (anchoredHere) weighAnchor(sim, true);
      endEvent(sim, ev, true, `Hemos rescatado todo lo aprovechable del «${data.ship}».${anchoredHere ? ' Levamos anclas y seguimos rumbo.' : ''}`, 'good');
    }
  }
}

/** Un resto con evento se ha perdido a popa. */
export function onDebrisLost(sim: Simulation, d: Debris): void {
  if (d.eventId === undefined) return;
  const ev = eventById(sim, d.eventId);
  if (!ev) return;
  if (ev.type === 'naufragos' && d.survivors) {
    endEvent(sim, ev, false, 'La balsa se pierde a popa entre las olas. No pudimos rescatar a los náufragos.', 'danger');
  } else if (ev.type === 'naufragio') {
    const data = dataOf<WreckData>(ev);
    data.lost++;
    refreshObjectives(sim, ev);
  }
}

/** Un habitante ha muerto: cierra los eventos que dependían de él. */
export function onNpcDied(sim: Simulation, npc: NpcState): void {
  for (const ev of [...sim.state.events.active]) {
    if (ev.type === 'enfermedad' && dataOf<SicknessData>(ev).npcId === npc.id) endEvent(sim, ev, false);
    else if (ev.type === 'discusion' && dataOf<DiscussionData>(ev).npcIds.includes(npc.id)) endEvent(sim, ev, null);
  }
}

/** Cómo se ha curado un habitante (siempre con tratamiento: la enfermedad no se pasa sola). */
export type CureMethod = 'botiquin' | 'medicina' | 'enfermeria' | 'cama';

const CURE_TEXT: Record<CureMethod, string> = {
  botiquin: 'gracias al botiquín',
  medicina: 'gracias a la medicina',
  enfermeria: 'tras reposar en la enfermería',
  cama: 'tras guardar cama',
};

/** Un habitante se ha curado: el evento de su enfermedad se cierra con éxito. */
export function onNpcCured(sim: Simulation, npc: NpcState, how: CureMethod): void {
  for (const ev of [...sim.state.events.active]) {
    if (ev.type === 'enfermedad' && dataOf<SicknessData>(ev).npcId === npc.id) endEvent(sim, ev, true, `${npc.name} se ha recuperado de la enfermedad ${CURE_TEXT[how]}.`, 'good');
  }
}

/* ------------------------------------------------------------------ */
/* Objetivos                                                           */
/* ------------------------------------------------------------------ */

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

function refreshObjectives(sim: Simulation, ev: ActiveEvent): void {
  switch (ev.type as EventType) {
    case 'naufragio': {
      const d = dataOf<WreckData>(ev);
      if (d.phase !== 'rescate') return;
      ev.objectives = [obj(`Recupera los restos del naufragio (${d.collected}/${d.total})`, d.collected >= d.total)];
      ev.objectives.push(obj(d.blueprint ? 'Rescata el cofre: ¡guarda un plano!' : 'Rescata el cofre metálico', d.chestCollected));
      return;
    }
    case 'incendio': {
      const burning = burningModules(sim);
      ev.objectives = burning.map((m) => obj(`Apaga el fuego en ${moduleLabel(m)} (${Math.round(m.fire)} %)`));
      if (!burning.length) ev.objectives = [obj('Apaga todos los fuegos', true)];
      else ev.objectives.push(obj('Llena cubos de agua de mar en la borda y arrójalos al fuego'));
      return;
    }
    case 'banco_peces': {
      const d = dataOf<FishBankData>(ev);
      ev.objectives = [obj(`Pesca mientras dure el banco (${d.catches} ${d.catches === 1 ? 'captura' : 'capturas'})`, d.catches > 0)];
      return;
    }
    case 'mercante': {
      const d = dataOf<MerchantData>(ev);
      ev.objectives = [obj(`Comercia desde el timón (${d.trades}/${d.offers.length} tratos)`, d.trades > 0)];
      return;
    }
    case 'plaga': {
      const d = dataOf<PestData>(ev);
      const left = pestPending(sim, d).length;
      ev.objectives = [obj(`Retira la plaga de los bancales (${d.plots.length - left}/${d.plots.length})`, left === 0)];
      return;
    }
    case 'tormenta': {
      const d = dataOf<StormData>(ev);
      if (d.phase === 'activa') {
        ev.objectives = [obj('Ponte a cubierto: el oleaje barre la cubierta', playerSheltered(sim)), obj('Aguanta hasta que amaine')];
        return;
      }
      const left = stormPending(sim, d).length;
      ev.objectives = [obj(left ? `Repara los daños de la tormenta (${left} ${left === 1 ? 'pendiente' : 'pendientes'})` : 'Repara los daños de la tormenta', left === 0)];
      return;
    }
    case 'averia': {
      const d = dataOf<BreakdownData>(ev);
      const m = findModule(sim, d.moduleId);
      if (m) ev.objectives = repairObjectives(sim, m, `Repara ${withArticle(moduleDef(m.type).name)}`);
      return;
    }
    case 'fuga': {
      const m = findModule(sim, dataOf<LeakData>(ev).moduleId);
      if (m) ev.objectives = repairObjectives(sim, m, 'Sella la fuga del depósito');
      return;
    }
    default:
      return;
  }
}

/** ¿El jugador está a cubierto (en un interior: camarote, cocina, bodega…)? */
function playerSheltered(sim: Simulation): boolean {
  const p = sim.state.player;
  return p.alive && isIndoorAt(sim.layout, p.pos.x, p.pos.y, p.pos.z);
}

/* ------------------------------------------------------------------ */
/* Actualización de cada evento                                        */
/* ------------------------------------------------------------------ */

function isExposed(sim: Simulation, m: ModuleInstance): boolean {
  if (m.status === 'construction' || m.type === 'escalera') return false;
  return moduleHasSky(sim, m) || (moduleDef(m.type).enclosed && m.level >= 1);
}

function stormPending(sim: Simulation, d: StormData): ModuleInstance[] {
  const out: ModuleInstance[] = [];
  for (const id of d.damaged) {
    const m = findModule(sim, id);
    if (m && (m.condition < 50 || m.status === 'broken' || m.leak)) out.push(m);
  }
  return out;
}

/** ¿El punto está en una cubierta a cielo abierto (donde rompen las olas)? */
function onOpenDeckAt(sim: Simulation, p: Vec3): boolean {
  if (levelOfY(p.y) < 1) return false;
  const c = cellAtPoint(sim.layout, p.x, p.y, p.z);
  return !!c && c.walkable && !c.indoor;
}

/**
 * Un golpe de mar barre la cubierta: el jugador pierde salud y los habitantes que sigan fuera
 * quedan heridos. `p` = probabilidad de que alcance a cada uno en este paso.
 */
export function stormWaveHits(sim: Simulation, p: number): void {
  const st = sim.state;
  const pl = st.player;
  if (pl.alive && !pl.sleeping && onOpenDeckAt(sim, pl.pos) && sim.rng.chance(p)) {
    const dmg = sim.rng.int(STORM_WAVE_DAMAGE[0], STORM_WAVE_DAMAGE[1]);
    sim.notify(`¡Un golpe de mar te derriba contra la borda! (−${dmg} salud) Ponte a cubierto`, 'danger');
    sim.bus.emit('sfx', { name: 'golpe_mar', x: pl.pos.x, y: pl.pos.y + 1, z: pl.pos.z });
    damagePlayer(sim, dmg, 'Un golpe de mar te arrojó por la borda en plena tormenta');
  }
  for (const n of st.npcs) {
    if (n.awayUntil !== null || n.activity === 'away' || n.injured || !onOpenDeckAt(sim, n.pos)) continue;
    if (!sim.rng.chance(p)) continue;
    n.injured = true;
    n.needs.health = clamp(n.needs.health - STORM_WAVE_NPC_DAMAGE, 1, 100);
    sim.bus.emit('sfx', { name: 'golpe_mar', x: n.pos.x, y: n.pos.y + 1, z: n.pos.z });
    sim.log(`Un golpe de mar derriba a ${n.name}: está ${npcAdj(n, 'herido')} y necesita reposo.`, 'warn');
  }
}

/**
 * «la cocina (55 %) y el puente de mando (71 %)»: módulos dañados, los peores primero; con más de
 * tres, «… y 2 más».
 */
function damageList(mods: ModuleInstance[]): string {
  const sorted = [...mods].sort((a, b) => a.condition - b.condition);
  const parts = sorted.slice(0, 3).map((m) => `${withArticle(moduleDef(m.type).name)} (${Math.round(m.condition)} %)`);
  const more = sorted.length - parts.length;
  if (more > 0) return `${parts.join(', ')} y ${more} ${more === 1 ? 'módulo más' : 'módulos más'}`;
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Módulos dañados por la tormenta que aún no están del todo bien (aunque no sean graves). */
function stormLightDamage(sim: Simulation, d: StormData): ModuleInstance[] {
  return d.damaged.map((id) => findModule(sim, id)).filter((m): m is ModuleInstance => !!m && m.status !== 'construction' && m.condition < REPAIR_THRESHOLD);
}

function updateStorm(sim: Simulation, ev: ActiveEvent, dt: number): void {
  const st = sim.state;
  const d = dataOf<StormData>(ev);
  if (d.phase === 'activa') {
    if (st.weather.kind !== 'tormenta') {
      d.phase = 'danos';
      ev.stage = 1;
      if (!stormPending(sim, d).length) {
        // Nada grave: tres casos, y el texto dice la verdad sobre cada uno.
        const light = stormLightDamage(sim, d);
        let text: string;
        if (!d.damaged.length) text = 'La tormenta ha pasado: el barco la ha capeado sin daños.';
        else if (light.length) text = `La tormenta ha pasado. Daños leves en ${damageList(light)}: repára${light.length === 1 ? (isFeminineName(moduleDef(light[0]!.type).name) ? 'la' : 'lo') : 'los'} cuando puedas.`;
        else text = 'La tormenta ha pasado y los daños ya están reparados.';
        endEvent(sim, ev, true, text, 'good');
        return;
      }
      ev.title = 'Daños de la tormenta';
      ev.description = 'La tormenta ha amainado, pero ha dejado el barco maltrecho. Repara lo más dañado antes de que vuelva a arreciar.';
      ev.endsAt = st.time + STORM_REPAIR_WINDOW;
      refreshObjectives(sim, ev);
      return;
    }
    refreshObjectives(sim, ev); // «Ponte a cubierto» se marca al estar en un interior
    const hours = dt / 60;
    const wave = clamp(st.weather.waveHeight / 2.6, 0, 1.5);
    const p = 1 - Math.pow(1 - clamp(STORM_DAMAGE_CHANCE_PER_HOUR * wave * stormDamageFactor(sim), 0, 1), hours);
    for (const m of st.ship.modules) {
      if (!isExposed(sim, m) || !sim.rng.chance(p)) continue;
      const dmg = sim.rng.int(STORM_DAMAGE[0], STORM_DAMAGE[1]);
      const name = moduleDef(m.type).name;
      m.condition = Math.max(0, m.condition - dmg);
      if (!d.damaged.includes(m.id)) d.damaged.push(m.id);
      let extra = '';
      if (m.type === 'deposito' && !m.leak && sim.rng.chance(STORM_LEAK_CHANCE)) {
        m.leak = true;
        extra = ': ¡pierde agua!';
      }
      if (m.condition <= 0 && m.status !== 'broken') {
        m.status = 'broken';
        m.brokenReason = 'Destrozado por la tormenta';
        m.powered = false;
        sim.log(`La tormenta ha destrozado ${withArticle(name)}`, 'danger');
      } else {
        sim.notify(`Un golpe de mar daña ${withArticle(name)} (${Math.round(m.condition)} %)${extra}`, 'warn');
      }
      const c = moduleCenter(m, st.ship.width);
      sim.bus.emit('sfx', { name: 'golpe_mar', x: c.x, y: c.y + 1, z: c.z });
    }
    // Golpes de mar contra quien siga a la intemperie (por eso el objetivo es ponerse a cubierto).
    stormWaveHits(sim, 1 - Math.pow(1 - STORM_WAVE_HIT_PER_HOUR * wave, hours));
    // Rayos sobre lo más alto del barco.
    if (sim.rng.chance(1 - Math.pow(1 - STORM_LIGHTNING_PER_HOUR, hours))) {
      const exposed = st.ship.modules.filter((m) => isExposed(sim, m) && isFlammable(m) && m.fire <= 0);
      if (exposed.length) {
        const top = Math.max(...exposed.map((m) => m.level));
        const m = sim.rng.pick(exposed.filter((mm) => mm.level === top));
        d.strikes++;
        st.weather.lightning = Math.max(st.weather.lightning, 0.6);
        sim.bus.emit('sfx', { name: 'rayo', x: moduleCenter(m, st.ship.width).x, y: 10, z: moduleCenter(m, st.ship.width).z });
        startFire(sim, m, 30, 'un rayo');
      }
    }
    return;
  }
  // Fase de daños.
  if (st.weather.kind === 'tormenta') {
    // Llega otra tormenta antes de reparar lo de la anterior: se cierra esta y empieza otra (con su
    // propio aviso de evento nuevo).
    const left = stormPending(sim, d).length;
    endEvent(sim, ev, false, `Vuelve a arreciar antes de reparar los daños de la tormenta anterior (${left} sin reparar).`, 'warn');
    startStorm(sim);
    return;
  }
  refreshObjectives(sim, ev);
  if (!stormPending(sim, d).length) {
    const light = stormLightDamage(sim, d);
    endEvent(sim, ev, true, light.length ? `Hemos reparado los daños graves de la tormenta. Quedan desperfectos leves en ${damageList(light)}.` : 'Hemos reparado los daños de la tormenta. El barco vuelve a estar en orden.', 'good');
    return;
  }
  // Pasadas las 12 h, el evento se da por cerrado: lo que siga roto lo atenderá el mecánico.
  if (ev.endsAt !== null && st.time >= ev.endsAt) {
    const left = stormPending(sim, d);
    endEvent(sim, ev, false, `Han pasado horas desde la tormenta y siguen sin reparar ${damageList(left)}: el barco tendrá que aguantar así.`, 'warn');
  }
}

function updateEvent(sim: Simulation, ev: ActiveEvent, dt: number): void {
  const st = sim.state;
  const now = st.time;
  switch (ev.type as EventType) {
    case 'tormenta':
      updateStorm(sim, ev, dt);
      return;
    case 'naufragio': {
      const d = dataOf<WreckData>(ev);
      if (now >= (ev.endsAt ?? Infinity)) {
        if (d.phase === 'avistado') endEvent(sim, ev, false, `El «${d.ship}» se pierde a popa. Quién sabe qué guardaba.`, 'info');
        else {
          const good = d.chestCollected || d.collected >= Math.ceil(d.total / 2);
          endEvent(sim, ev, good, `Levamos anclas y dejamos atrás el pecio del «${d.ship}» (rescatados ${d.collected} de ${d.total} restos).`, good ? 'good' : 'info');
        }
      }
      return;
    }
    case 'isla':
    case 'estructura': {
      const d = dataOf<ExpeditionData>(ev);
      if (d.phase === 'avistado') {
        const block = expeditionBlocker(sim);
        const c = ev.choices.find((cc) => cc.id === 'expedicion');
        if (c) {
          c.enabled = !block;
          if (block) c.reason = block;
          else delete c.reason;
        }
        if (now >= (ev.endsAt ?? Infinity)) endEvent(sim, ev, false, ev.type === 'isla' ? `${d.name} se pierde en el horizonte.` : 'La estructura queda atrás, envuelta en misterio.', 'info');
        return;
      }
      // La vuelta (`returnAt`, que es también `endsAt`) cierra el evento.
      if (now >= (d.returnAt ?? ev.endsAt ?? Infinity)) finishExpedition(sim, ev);
      return;
    }
    case 'naufragos': {
      const d = dataOf<RaftData>(ev);
      if (!st.debris.some((x) => x.id === d.debrisId) && !d.rescued) endEvent(sim, ev, false, 'La balsa ha desaparecido entre las olas.', 'danger');
      else if (isAnchored(sim) && ev.choices.length) ev.choices = [];
      return;
    }
    case 'averia': {
      const d = dataOf<BreakdownData>(ev);
      const m = findModule(sim, d.moduleId);
      if (!m) endEvent(sim, ev, false, 'El módulo averiado se ha desmontado.', 'info');
      else if (m.status === 'active' && m.condition >= REPAIR_THRESHOLD) {
        endEvent(sim, ev, true, d.structural ? `${capitalize(withArticle(moduleDef(m.type).name))} vuelve a estar en buen estado.` : `${capitalize(withArticle(moduleDef(m.type).name))} vuelve a estar en marcha.`, 'good');
      } else if (now >= (d.patchAt ?? ev.startedAt + BREAKDOWN_PATCH_MIN) && m.fire <= 0) {
        patchBreakdown(sim, ev, m);
      } else if (d.structural && m.status === 'active' && m.condition > 0) {
        // La estructura debilitada sigue cediendo con el oleaje hasta que se repare.
        const loss = STRUCTURAL_DECAY_PER_HOUR_PER_M * Math.max(0, st.weather.waveHeight) * (dt / 60);
        m.condition = Math.max(0, m.condition - loss);
        if (m.condition <= 0) {
          m.status = 'broken';
          m.brokenReason = d.reason;
          m.powered = false;
          sim.log(`${capitalize(withArticle(moduleDef(m.type).name))} ha cedido del todo: hay que repararl${isFeminineName(moduleDef(m.type).name) ? 'a' : 'o'} cuanto antes.`, 'danger');
        }
      }
      if (st.events.active.includes(ev)) refreshObjectives(sim, ev);
      return;
    }
    case 'incendio': {
      refreshObjectives(sim, ev);
      if (!burningModules(sim).length) {
        const d = dataOf<FireData>(ev);
        const tail = d.destroyed.length ? ` Ha dejado ${d.destroyed.length === 1 ? 'un módulo calcinado' : `${d.destroyed.length} módulos calcinados`} que hay que reparar.` : '';
        endEvent(sim, ev, true, `¡Fuego extinguido!${tail}`, 'good');
      }
      return;
    }
    case 'banco_peces': {
      if (now >= (ev.endsAt ?? Infinity)) {
        const d = dataOf<FishBankData>(ev);
        endEvent(sim, ev, d.catches > 0, d.catches > 0 ? `El banco de peces se aleja (${d.catches} ${d.catches === 1 ? 'captura' : 'capturas'}).` : 'El banco de peces se aleja sin que nadie lo aprovechara.', 'info');
      }
      return;
    }
    case 'mercante': {
      if (now >= (ev.endsAt ?? Infinity)) {
        const d = dataOf<MerchantData>(ev);
        endEvent(sim, ev, d.trades > 0, `El «${d.ship}» iza velas y se aleja${d.trades ? ` tras ${d.trades} ${d.trades === 1 ? 'trato' : 'tratos'}` : ''}.`, 'info');
      }
      return;
    }
    case 'plaga': {
      const d = dataOf<PestData>(ev);
      refreshObjectives(sim, ev);
      const pending = pestPending(sim, d);
      if (!pending.length) {
        // Desmontar el huerto no es controlar la plaga: se va con él (resultado neutro).
        if (d.plots.some((p) => !findModule(sim, p.moduleId))) endEvent(sim, ev, null, 'El huerto afectado se ha desmontado y la plaga se ha ido con él.', 'info');
        else endEvent(sim, ev, true, 'La plaga está controlada: los bancales se recuperan.', 'good');
        return;
      }
      if (now >= (ev.endsAt ?? Infinity)) {
        for (const p of pending) {
          const plot = findModule(sim, p.moduleId)!.plots[p.plot]!;
          plot.dead = true;
          plot.pest = false;
        }
        endEvent(sim, ev, false, `La plaga ha arrasado ${pending.length === 1 ? 'un bancal' : `${pending.length} bancales`}: las plantas han muerto.`, 'danger');
      }
      return;
    }
    case 'fuga': {
      const d = dataOf<LeakData>(ev);
      const m = findModule(sim, d.moduleId);
      if (!m) endEvent(sim, ev, false, 'El depósito con la fuga se ha desmontado.', 'info');
      else if (!m.leak) endEvent(sim, ev, true, 'Fuga sellada: el depósito ya no pierde agua.', 'good');
      else refreshObjectives(sim, ev);
      return;
    }
    case 'enfermedad': {
      const d = dataOf<SicknessData>(ev);
      const n = st.npcs.find((nn) => nn.id === d.npcId);
      if (!n) endEvent(sim, ev, false);
      else if (!n.sick) endEvent(sim, ev, true, `${n.name} se ha recuperado de la enfermedad.`, 'good');
      else if (n.needs.health < SICKNESS_WORSE_HEALTH) {
        // Nadie le ha atendido a tiempo: la enfermedad se agrava (sigue enfermo hasta que le curen).
        endEvent(sim, ev, false, `${n.name} ha empeorado: sin tratamiento, la enfermedad se ha agravado. Necesita un botiquín o la enfermería cuanto antes.`, 'danger');
      }
      return;
    }
    case 'discusion': {
      const d = dataOf<DiscussionData>(ev);
      if (now >= (ev.endsAt ?? Infinity)) {
        for (const id of d.npcIds) {
          const n = st.npcs.find((nn) => nn.id === id);
          if (n) n.needs.mood = clamp(n.needs.mood - 8, 0, 100);
        }
        endEvent(sim, ev, false, `La discusión entre ${d.names[0]} y ${d.names[1]} se enquista: ni se miran.`, 'warn');
      }
      return;
    }
    default:
      if (ev.endsAt !== null && now >= ev.endsAt) endEvent(sim, ev, null);
  }
}

/* ------------------------------------------------------------------ */
/* Director y guion                                                    */
/* ------------------------------------------------------------------ */

/**
 * Tipo del último evento que empezó (sin contar la tormenta, que la trae el clima). Se deduce de
 * los enfriamientos guardados (`inicio = cooldown − EVENT_COOLDOWN`), sin estado extra.
 */
export function lastStartedType(sim: Simulation): EventType | null {
  let best: EventType | null = null;
  let bestAt = -Infinity;
  for (const type of EVENT_TYPES) {
    if (type === 'tormenta') continue;
    const cd = sim.state.events.cooldowns[type];
    if (cd === undefined || !Number.isFinite(cd)) continue;
    const startedAt = cd - EVENT_COOLDOWN[type];
    if (startedAt > bestAt) {
      bestAt = startedAt;
      best = type;
    }
  }
  return best;
}

/** Peso del tipo que acaba de salir (variedad: no el mismo evento dos veces seguidas). */
export const REPEAT_FACTOR = 0.35;

/** Pesos actuales de cada tipo para el director (0 = imposible ahora) más el de calma. */
export function eventWeights(sim: Simulation): Partial<Record<EventType | 'calma', number>> {
  const st = sim.state;
  const region = REGIONS[st.voyage.regionId] ?? REGIONS[START_REGION]!;
  const h = hourOf(st.time);
  const night = h >= 22 || h < 6;
  // Mientras el jugador duerme no se avista nada: el avistamiento pasaría de largo sin que se entere.
  const asleep = !!st.player.sleeping;
  const crises = st.events.active.filter((e) => CRISIS_TYPES.has(e.type as EventType)).length;
  const last = lastStartedType(sim);
  const out: Partial<Record<EventType | 'calma', number>> = { calma: CALM_WEIGHT };
  for (const type of EVENT_TYPES) {
    if (type === 'tormenta') continue; // la trae el clima
    let w = region.eventWeights[type] ?? 0;
    // Tipos que la región no declara (p. ej. 'estructura'): peso por defecto.
    const extra = EXTRA_WEIGHTS[type];
    if (extra && region.eventWeights[type] === undefined) w = extra.regions[region.id] ?? extra.base;
    if (w <= 0) continue;
    if (!minDayReached(sim, type)) continue;
    if ((st.events.cooldowns[type] ?? -Infinity) > st.time) continue;
    if (CRISIS_TYPES.has(type) && crises >= MAX_CRISES) continue;
    if (scriptedSoon(sim, type)) continue;
    if (!canStartEvent(sim, type)) continue;
    if ((night || asleep) && SIGHTING_TYPES.has(type)) w *= NIGHT_SIGHTING_FACTOR;
    if (night && CRISIS_TYPES.has(type)) w *= NIGHT_CRISIS_FACTOR;
    if (type === last) w *= REPEAT_FACTOR;
    if (w > 0) out[type] = w;
  }
  return out;
}

function scriptAt(step: { day: number; hour: number }): number {
  return (step.day - 1) * MINUTES_PER_DAY + step.hour * 60;
}

function scriptedSoon(sim: Simulation, type: EventType): boolean {
  const st = sim.state;
  return SCRIPT.some((s) => s.type === type && !st.events.scripted.includes(s.id) && scriptAt(s) - st.time < SCRIPT_GUARD_MIN && scriptAt(s) + SCRIPT_STALE_MIN > st.time);
}

function runScript(sim: Simulation): void {
  const st = sim.state;
  for (const step of SCRIPT) {
    if (st.events.scripted.includes(step.id)) continue;
    const at = scriptAt(step);
    if (st.time < at) continue;
    if (st.time > at + SCRIPT_STALE_MIN) {
      st.events.scripted.push(step.id); // cita perdida (partida cargada muy tarde)
      continue;
    }
    if (activeEvent(sim, step.type)) continue; // se aplaza hasta que acabe el anterior
    const h = hourOf(st.time);
    if (h < SCRIPT_HOURS[0] || h >= SCRIPT_HOURS[1]) continue; // de noche no se avista nada
    if (st.player.sleeping && SIGHTING_TYPES.has(step.type)) continue; // espera a que el jugador despierte
    const ev = startEvent(sim, step.type, { ...(step.opts ?? {}), scripted: true });
    if (ev) st.events.scripted.push(step.id);
  }
}

function director(sim: Simulation): void {
  const ev = sim.state.events;
  const now = sim.state.time;
  if (!Number.isFinite(ev.nextRollAt)) ev.nextRollAt = now + DIRECTOR_INTERVAL[0];
  if (now < ev.nextRollAt) return;
  ev.nextRollAt = now + sim.rng.range(DIRECTOR_INTERVAL[0], DIRECTOR_INTERVAL[1]);
  const pick = sim.rng.weighted(eventWeights(sim));
  if (pick && pick !== 'calma') startEvent(sim, pick);
}

function checkStorm(sim: Simulation): void {
  if (sim.state.weather.kind === 'tormenta' && !activeEvent(sim, 'tormenta')) startStorm(sim);
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

export function tickEvents(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  if (!st.player.alive) return;
  checkStorm(sim);
  tickFires(sim, dt);
  for (const ev of [...st.events.active]) {
    if (!st.events.active.includes(ev)) continue;
    updateEvent(sim, ev, dt);
  }
  runScript(sim);
  director(sim);
}

/* ------------------------------------------------------------------ */
/* Comandos                                                            */
/* ------------------------------------------------------------------ */

export function eventChoice(sim: Simulation, eventId: number, choiceId: string): ActionResult {
  const st = sim.state;
  if (!st.player.alive) return fail('No puedes hacer nada');
  const ev = eventById(sim, eventId);
  if (!ev) return fail('Esa situación ya ha pasado');
  const c = ev.choices.find((cc) => cc.id === choiceId);
  if (!c) return fail('Esa opción ya no está disponible');
  if (!c.enabled) return fail(c.reason ?? 'Ahora no es posible');
  let res: ActionResult;
  switch (`${ev.type}:${choiceId}`) {
    case 'naufragio:rescatar':
      res = rescueWreck(sim, ev);
      break;
    case 'naufragio:seguir': {
      const d = dataOf<WreckData>(ev);
      endEvent(sim, ev, null, `Seguimos rumbo y dejamos atrás el «${d.ship}».`, 'info');
      res = { ok: true, msg: 'Seguimos rumbo' };
      break;
    }
    case 'isla:expedicion':
    case 'estructura:expedicion':
      res = launchExpedition(sim, ev);
      break;
    case 'isla:seguir':
    case 'estructura:seguir': {
      const d = dataOf<ExpeditionData>(ev);
      endEvent(sim, ev, null, ev.type === 'isla' ? `Seguimos rumbo: ${d.name} queda atrás.` : 'Seguimos rumbo: la estructura queda atrás.', 'info');
      res = { ok: true, msg: 'Seguimos rumbo' };
      break;
    }
    case 'naufragos:fondear':
      // Con el barco parado, los náufragos reman hacia el costado hasta ponerse a tiro del gancho
      // (debris.ts, `RAFT_APPROACH_SPEED`).
      anchorShip(sim, RAFT_ANCHOR_MIN, RAFT_ANCHOR_REASON);
      ev.choices = [];
      res = { ok: true, msg: 'Echamos el ancla: los náufragos reman hacia el costado. ¡Prepara el gancho en la borda!' };
      break;
    case 'mercante:comerciar': {
      const d = dataOf<MerchantData>(ev);
      res = { ok: true, msg: `${capitalize(d.captain)} te enseña su mercancía` };
      break;
    }
    case 'mercante:despedir': {
      const d = dataOf<MerchantData>(ev);
      endEvent(sim, ev, d.trades > 0, `Despedimos al «${d.ship}», que se aleja a toda vela.`, 'info');
      res = { ok: true, msg: 'El mercante se despide y se aleja' };
      break;
    }
    default:
      return fail('Esa opción no hace nada');
  }
  if (res.ok) markTutorial(sim, 'timon');
  return res;
}

/** Arroja un cubo de agua de mar a un módulo en llamas (el cubo vuelve vacío). */
export function extinguish(sim: Simulation, moduleId: number): ActionResult {
  const st = sim.state;
  const p = st.player;
  if (!p.alive) return fail('No puedes hacer nada');
  if (p.sleeping) return fail('Estás durmiendo');
  const m = findModule(sim, moduleId);
  if (!m) return fail('Ese módulo ya no existe');
  if (!(m.fire > 0)) return fail('Ahí no hay fuego');
  const slot = playerSlotOf(sim, 'cubo_agua');
  if (slot < 0) return fail(countItem(p.inventory, 'cubo') > 0 ? 'Llena el cubo de agua de mar en la borda' : 'Necesitas un cubo de agua de mar');
  if (distanceToModule(sim, m, p.pos) > EXTINGUISH_RANGE) return fail('Acércate más al fuego');
  m.fire = Math.max(0, m.fire - BUCKET_EXTINGUISH);
  const s = p.inventory.slots[slot]!;
  if (s.qty > 1) {
    s.qty -= 1;
    giveToPlayer(sim, 'cubo', 1);
  } else p.inventory.slots[slot] = { id: 'cubo', qty: 1 };
  const c = moduleCenter(m, st.ship.width);
  sim.bus.emit('sfx', { name: 'apagar', x: c.x, y: c.y + 1, z: c.z });
  const label = moduleLabel(m);
  let msg: string;
  if (m.fire <= 0) {
    m.fire = 0;
    p.stats.firesPutOut++;
    msg = `Apagas el fuego en ${label}`;
  } else msg = `El fuego en ${label} se reduce (${Math.round(m.fire)} %): ¡otro cubo!`;
  const ev = activeEvent(sim, 'incendio');
  if (ev) {
    refreshObjectives(sim, ev);
    if (!burningModules(sim).length) {
      const d = dataOf<FireData>(ev);
      const tail = d.destroyed.length ? ` Hay ${d.destroyed.length === 1 ? 'un módulo calcinado' : `${d.destroyed.length} módulos calcinados`} que reparar.` : '';
      endEvent(sim, ev, true, `¡Fuego extinguido!${tail}`, 'good');
    }
  }
  return { ok: true, msg };
}

/** Distancia en planta (m) de un punto a las celdas de un módulo en su mismo nivel (Infinity si no). */
export function distanceToModule(sim: Simulation, m: ModuleInstance, pos: Vec3): number {
  const level = levelOfY(pos.y);
  let best = Infinity;
  for (const c of moduleCells(m)) {
    if (c.level !== level) continue;
    const mn = cellMin(c.x, c.z, sim.state.ship.width);
    const dx = Math.max(mn.x - pos.x, 0, pos.x - (mn.x + CELL));
    const dz = Math.max(mn.z - pos.z, 0, pos.z - (mn.z + CELL));
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

/** Recoge un resto para un habitante (envoltorio para npc.ts). */
export function npcCollectDebris(sim: Simulation, debrisId: number, at: Vec3): boolean {
  return collectDebrisFor(sim, debrisId, 'npc', at).ok;
}

/** Texto de estado corto de un evento para la interfaz ("quedan 45 min"). */
export function eventStatusText(sim: Simulation, ev: ActiveEvent): string {
  const now = sim.state.time;
  if (ev.endsAt === null) return 'En curso';
  const left = Math.max(0, Math.round(ev.endsAt - now));
  if (left < 60) return `Quedan ${left} min`;
  const h = Math.floor(left / 60);
  const m = left % 60;
  return m ? `Quedan ${h} h ${m} min` : `Quedan ${h} h`;
}


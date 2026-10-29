/**
 * [AGENTE sim-economy] FABRICACIÓN, COCINA Y CULTIVOS (docs/SISTEMAS.md §7).
 *
 * - Estación por tipo de módulo: banco_trabajo → banco, taller → taller, cocina → cocina; sin
 *   módulo → a mano (instantáneo).
 * - Los ingredientes se pagan con el inventario del jugador y luego con almacenes y bandejas
 *   (`payInventories`). Los habitantes (`by: 'npc'`) pagan solo con los almacenes.
 * - Cola de hasta 8 trabajos por estación; se paga al encolar y se devuelve al cancelar. Los
 *   encargos del jugador van delante de los de los habitantes (`by: 'npc'`), que conservan su avance.
 * - El primer trabajo avanza `dt × velocidad`: banco siempre (×1), taller con energía
 *   (× satisfacción), cocina quemando combustible de su ranura (si se acaba, se pausa y avisa).
 * - Productos → bandeja de la estación → almacén → caja junto a la estación (nunca se pierden). Las
 *   cajas se dejan siempre en un punto transitable (`safeDropPoint`): nunca sobre el hueco de una
 *   escalera, en una rampa ni dentro de un mueble.
 * - Una estación averiada no trabaja, salvo que sea una estructura (banco de trabajo) y el trabajo
 *   sea su propio repuesto (kit de reparación): así nunca queda bloqueada sin salida.
 * - Huerto: luz (cielo abierto: 30 % de noche, 100 % de día; interior: lámparas con energía),
 *   agua de la red (a cielo abierto la lluvia riega y ahorra depósito), horas sin agua, muerte,
 *   plaga y maduración. Los cultivos maduros esperan a la cosecha sin gastar agua.
 */
import { CROPS, cropForSeed, type CropDef } from '../data/crops';
import { ITEMS } from '../data/items';
import { moduleDef } from '../data/modules';
import { RECIPES, recipesFor, type RecipeDef, type StationKind } from '../data/recipes';
import { SHIP_ORIGIN_X } from './constants';
import { NAV_RES } from './nav';
import { forwardOf, STEP_HEIGHT } from './physics';
import { depositToStorage, findModule, giveToPlayer, itemName, payInventories, spawnCrate, stacksText } from './helpers';
import { addItem, consume, missingFor } from './inventory';
import { halfWidthM, levelOfY, moduleCenter } from './ship';
import type { ActionResult, Simulation } from './Simulation';
import { daylight } from './time';
import { markTutorial } from './tutorial';
import type { CraftJob, ItemId, ItemStack, ModuleInstance, PlotState, Vec3 } from './types';
import {
  agree,
  burnFuel,
  clearWarn,
  conditionFactor,
  fuelMinutes,
  hasFuel,
  hasGrowLamps,
  isFeminineName,
  isPluralName,
  markWarned,
  moduleHasSky,
  repairNeeds,
  warnOnce,
  withArticle,
} from './utilities';

/* ------------------------------------------------------------------ */
/* Datos y tipos                                                       */
/* ------------------------------------------------------------------ */

/** Trabajos máximos en la cola de una estación. */
export const MAX_QUEUE = 8;
/** Luz mínima de un huerto a cielo abierto por la noche (fracción del ritmo de día). */
export const NIGHT_GROWTH = 0.3;
/** Horas sin agua a partir de las que se avisa de que el huerto se seca. */
const DRY_WARN_HOURS = 3;
/** Intensidad de lluvia que basta para regar por completo un huerto a cielo abierto. */
export const RAIN_WATERS = 0.5;

/** Estación de cada tipo de módulo. */
export const STATION_OF_MODULE: Readonly<Record<string, StationKind>> = {
  banco_trabajo: 'banco',
  taller: 'taller',
  cocina: 'cocina',
};

/** "en el banco de trabajo", "en la cocina"… */
export const STATION_PLACE: Readonly<Record<StationKind, string>> = {
  mano: 'a mano',
  banco: 'el banco de trabajo',
  taller: 'el taller',
  cocina: 'la cocina',
};

/** Quién realiza la acción: el jugador (por defecto) o un habitante (paga con los almacenes). */
export interface EconomyActor {
  by?: 'player' | 'npc';
}

/** Trabajo de cola con autor (campo opcional: los guardados antiguos no lo tienen). */
type Job = CraftJob & { by?: 'npc' };

export interface RecipeAvailability {
  recipe: RecipeDef;
  locked: boolean;
  canCraft: boolean;
  missing: Record<ItemId, number>;
  /** Motivo por el que no se puede fabricar ahora (null si se puede). */
  reason: string | null;
  /** Estación donde se fabrica. */
  station: StationKind;
}

export interface StationStatus {
  kind: StationKind;
  /** Hay un trabajo avanzando ahora mismo. */
  working: boolean;
  /** Velocidad actual (1 = normal). */
  speed: number;
  /** Texto de estado: "Trabajando", "Apagado", "Sin energía", "Sin combustible", "Averiado"… */
  status: string;
  /** Minutos de combustión que quedan (cocina) o null. */
  fuelMinutes: number | null;
  jobs: { index: number; recipe: RecipeDef; progress: number; etaMin: number | null; byNpc: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const fail = (msg: string): ActionResult => ({ ok: false, msg });

export function stationKindOf(m: ModuleInstance | undefined | null): StationKind | null {
  if (!m) return null;
  return STATION_OF_MODULE[m.type] ?? null;
}

/** Nombre del plano que concede una clave de desbloqueo. */
export function blueprintName(unlockKey: string): string {
  for (const it of Object.values(ITEMS)) if (it.unlocks === unlockKey) return it.name;
  return 'plano correspondiente';
}

function isLocked(sim: Simulation, r: RecipeDef): boolean {
  return !!r.unlock && !sim.state.unlocks.includes(r.unlock);
}

function units(outputs: Record<ItemId, number>): number {
  let n = 0;
  for (const q of Object.values(outputs)) n += q;
  return n;
}

/**
 * ¿Se puede hacer esta receta en la estación aunque esté averiada? Solo en una estructura (banco de
 * trabajo, no una máquina) y si la receta produce el repuesto que la repara: un banco roto aún
 * sirve para clavar un kit de reparación con el que arreglarlo (si no, quedaría bloqueado).
 */
export function craftableWhileBroken(m: ModuleInstance, r: RecipeDef | undefined): boolean {
  if (!r || m.status !== 'broken' || moduleDef(m.type).machine) return false;
  return (r.outputs[repairNeeds(m.type).part] ?? 0) > 0;
}

/** Motivo por el que una estación no admite trabajos ahora (o null). Con `r`, para esa receta. */
function stationBlocker(m: ModuleInstance, r?: RecipeDef): string | null {
  const name = moduleDef(m.type).name;
  if (m.status === 'construction') return `${withArticle(name, true)} aún está en obras`;
  if (m.status === 'broken' && !craftableWhileBroken(m, r)) {
    const why = m.brokenReason ? ` (${m.brokenReason.toLowerCase()})` : '';
    return `${withArticle(name, true)} está ${agree(name, 'averiado')}${why}: repára${isFeminineName(name) ? 'la' : 'lo'} primero`;
  }
  if (m.fire > 0) return `¡${withArticle(name, true)} está ardiendo!`;
  if (m.queue.length >= MAX_QUEUE) return `La cola está llena (máx. ${MAX_QUEUE})`;
  return null;
}

/** Nombre para el aviso de "listo": las recetas con nombre de verbo usan su primer producto. */
function productName(r: RecipeDef): string {
  const first = r.name.split(/\s+/)[0] ?? '';
  if (/(ar|er|ir)$/i.test(first)) {
    const out = Object.keys(r.outputs)[0];
    if (out) return itemName(out);
  }
  return r.name;
}

/* ------------------------------------------------------------------ */
/* Puntos transitables (cajas y recolocación de personas)              */
/* ------------------------------------------------------------------ */

/** Radio en planta de una caja suelta (para no dejarla dentro de un mueble o una pared). */
export const CRATE_RADIUS = 0.35;

/** Nodos de la rejilla de navegación alcanzables desde la cubierta (caché por rejilla). */
const reachCache = new WeakMap<object, Uint8Array | null>();

function reachableNodes(sim: Simulation): Uint8Array | null {
  const nav = sim.nav;
  if (reachCache.has(nav)) return reachCache.get(nav) ?? null;
  const start = nav.nearestWalkable(sim.collision.safeSpawn(), 6);
  const seen = start ? nav.reachableFrom(start) : null;
  reachCache.set(nav, seen);
  return seen;
}

/**
 * ¿Se puede dejar una caja aquí? Suelo plano (ni rampa ni hueco de escalera) justo a la altura del
 * punto y sin muebles ni paredes encima.
 */
export function isValidDropPoint(sim: Simulation, p: Vec3): boolean {
  if (![p.x, p.y, p.z].every(Number.isFinite)) return false;
  const col = sim.collision;
  const cell = col.cellOf(p);
  if (!cell || !cell.walkable || cell.kind === 'stairLow' || cell.kind === 'stairHigh') return false;
  const g = col.groundAt(p.x, p.z, p.y + 0.05);
  if (g === null || Math.abs(g - p.y) > 0.05) return false;
  return col.isFree(p.x, p.z, g, CRATE_RADIUS);
}

/** ¿Una persona de radio `radius` puede estar de pie aquí (con suelo bajo los pies y sin chocar)? */
export function standsOn(sim: Simulation, p: Vec3, radius: number): boolean {
  if (![p.x, p.y, p.z].every(Number.isFinite)) return false;
  const col = sim.collision;
  const g = col.groundAt(p.x, p.z, p.y);
  if (g === null || p.y - g > STEP_HEIGHT) return false;
  return col.isFree(p.x, p.z, g, radius);
}

/**
 * Nodo transitable de la rejilla de navegación, alcanzable desde la cubierta, más cercano a `pos`
 * que cumpla `ok`. Busca primero en el nivel del punto y luego en los demás. null si no hay.
 */
export function nearestSpot(sim: Simulation, pos: Vec3, ok: (p: Vec3) => boolean, maxRadius = 12): Vec3 | null {
  const nav = sim.nav;
  const seen = reachableNodes(sim);
  const lv0 = Math.max(0, Math.min(nav.levels - 1, levelOfY(Number.isFinite(pos.y) ? pos.y : 0)));
  const ci = Math.max(0, Math.min(nav.nx - 1, Math.floor(((Number.isFinite(pos.x) ? pos.x : 0) + SHIP_ORIGIN_X) / NAV_RES)));
  const cj = Math.max(0, Math.min(nav.nz - 1, Math.floor(((Number.isFinite(pos.z) ? pos.z : 0) + halfWidthM(sim.layout.width)) / NAV_RES)));
  const maxR = Math.ceil(maxRadius / NAV_RES);
  const levels = Array.from({ length: nav.levels }, (_, l) => l).sort((a, b) => Math.abs(a - lv0) - Math.abs(b - lv0));
  for (const lv of levels) {
    let best: Vec3 | null = null;
    let bestD = Infinity;
    let foundAt = -1;
    for (let r = 0; r <= maxR; r++) {
      // Un anillo más tras el primer hallazgo: puede haber un nodo más cerca en línea recta.
      if (best && r > foundAt + 1) break;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di;
          const j = cj + dj;
          if (!nav.isWalk(lv, i, j)) continue;
          if (seen && !seen[nav.gid(lv, i, j)]) continue;
          const p = nav.worldOf({ level: lv, i, j });
          const d = (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 + 0.25 * (p.y - pos.y) ** 2;
          if (d >= bestD || !ok(p)) continue;
          best = p;
          bestD = d;
          if (foundAt < 0) foundAt = r;
        }
      }
    }
    if (best) {
      // Altura exacta de la superficie (la rejilla guarda alturas en coma flotante de 32 bits).
      const g = sim.collision.groundAt(best.x, best.z, best.y + 0.05);
      return { x: best.x, y: g !== null && Math.abs(g - best.y) < 0.05 ? g : best.y, z: best.z };
    }
  }
  return null;
}

/**
 * Punto donde dejar una caja cerca de `pos`: el propio punto si es válido o el punto transitable
 * más cercano (nunca sobre el hueco de una escalera, en una rampa ni dentro de un mueble).
 */
export function safeDropPoint(sim: Simulation, pos: Vec3): Vec3 {
  if (isValidDropPoint(sim, pos)) return { x: pos.x, y: pos.y, z: pos.z };
  const spot = nearestSpot(sim, pos, (p) => isValidDropPoint(sim, p));
  if (spot) return spot;
  const s = sim.collision.safeSpawn();
  return { x: s.x, y: s.y, z: s.z };
}

/** Punto delante del mueble principal de la estación (para dejar cajas), o el centro del módulo. */
export function stationDropPoint(sim: Simulation, m: ModuleInstance): Vec3 {
  const layout = sim.layout;
  const c = moduleCenter(m, sim.state.ship.width);
  const prop = layout.props.find((p) => p.moduleId === m.id && p.interact !== null);
  if (prop) {
    const f = forwardOf(prop.yaw);
    const reach = Math.abs(f.x) * prop.hx + Math.abs(f.z) * prop.hz + 0.55;
    // A ras del suelo del módulo (algunos muebles se apoyan sobre otros: y > suelo).
    return safeDropPoint(sim, { x: prop.x + f.x * reach, y: c.y, z: prop.z + f.z * reach });
  }
  return safeDropPoint(sim, { x: c.x, y: c.y, z: c.z });
}

/**
 * Guarda productos: bandeja de la estación → almacenes → caja junto a la estación.
 * Devuelve dónde acabó lo último que no cupo.
 */
function storeProducts(sim: Simulation, m: ModuleInstance, items: ItemStack[]): 'bandeja' | 'almacen' | 'caja' {
  let where: 'bandeja' | 'almacen' | 'caja' = 'bandeja';
  for (const s of items) {
    let left = m.inventory ? addItem(m.inventory, s.id, s.qty) : s.qty;
    if (left > 0) {
      left = depositToStorage(sim, s.id, left);
      if (where === 'bandeja') where = 'almacen';
    }
    if (left > 0) {
      spawnCrate(sim, stationDropPoint(sim, m), [{ id: s.id, qty: left }], `Productos: ${moduleDef(m.type).name}`);
      where = 'caja';
    }
  }
  return where;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function sfxAt(sim: Simulation, name: string, m: ModuleInstance): void {
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name, x: c.x, y: c.y + 1, z: c.z });
}

/* ------------------------------------------------------------------ */
/* Recetas                                                             */
/* ------------------------------------------------------------------ */

/** Recetas de una estación (o a mano si `moduleId` es null) con su disponibilidad. */
export function availableRecipes(sim: Simulation, moduleId: number | null): RecipeAvailability[] {
  let kind: StationKind = 'mano';
  let station: ModuleInstance | null = null;
  if (moduleId !== null) {
    const m = findModule(sim, moduleId);
    const k = stationKindOf(m);
    if (!m || !k) return [];
    kind = k;
    station = m;
  }
  const invs = payInventories(sim);
  return recipesFor(kind).map((recipe) => {
    const locked = isLocked(sim, recipe);
    const missing = missingFor(invs, recipe.inputs);
    const blocker = station ? stationBlocker(station, recipe) : null;
    let reason: string | null = null;
    if (locked) reason = `Necesitas el ${blueprintName(recipe.unlock!)}`;
    else if (blocker) reason = blocker;
    else if (Object.keys(missing).length) reason = `Faltan: ${stacksText(missing)}`;
    return { recipe, locked, canCraft: reason === null, missing, reason, station: kind };
  });
}

/** Fabricación instantánea a mano (recetas de estación 'mano'). */
export function craftByHand(sim: Simulation, recipeId: string): ActionResult {
  const r = RECIPES[recipeId];
  if (!r) return fail('Receta desconocida');
  if (r.station !== 'mano') return fail(`Hay que fabricarlo en ${STATION_PLACE[r.station]}`);
  if (isLocked(sim, r)) return fail(`Necesitas el ${blueprintName(r.unlock!)}`);
  const invs = payInventories(sim);
  const miss = missingFor(invs, r.inputs);
  if (Object.keys(miss).length) return fail(`Faltan: ${stacksText(miss)}`);
  consume(invs, r.inputs);
  let allFit = true;
  for (const [id, q] of Object.entries(r.outputs)) allFit = giveToPlayer(sim, id, q, true) && allFit;
  sim.state.player.stats.itemsCrafted += units(r.outputs);
  markTutorial(sim, 'fabricar');
  const p = sim.state.player.pos;
  sim.bus.emit('sfx', { name: 'fabricar', x: p.x, y: p.y + 1, z: p.z });
  return { ok: true, msg: `Fabricas ${stacksText(r.outputs)}${allFit ? '' : ' (no cabía todo: el resto está en una caja a tus pies)'}` };
}

/**
 * Encola `count` trabajos (se pagan al encolar). Si no alcanza para todos, encola los que pueda.
 * Con `{ by: 'npc' }` paga solo con los almacenes y no da avisos ni cuenta para el tutorial.
 */
export function queueCraft(sim: Simulation, moduleId: number, recipeId: string, count = 1, actor: EconomyActor = {}): ActionResult {
  const m = findModule(sim, moduleId);
  if (!m) return fail('Esa estación ya no existe');
  const kind = stationKindOf(m);
  if (!kind) return fail('Aquí no se puede fabricar');
  const r = RECIPES[recipeId];
  const blocker = stationBlocker(m, r);
  if (blocker) return fail(blocker);
  if (!r) return fail('Receta desconocida');
  if (r.station !== kind) return fail(r.station === 'mano' ? 'Esto se fabrica a mano' : `Esto se fabrica en ${STATION_PLACE[r.station]}`);
  if (isLocked(sim, r)) return fail(`Necesitas el ${blueprintName(r.unlock!)}`);
  const npc = actor.by === 'npc';
  const invs = payInventories(sim, !npc);
  const want = Math.max(1, Math.min(Math.floor(Number.isFinite(count) ? count : 1), MAX_QUEUE - m.queue.length));
  // Los encargos del jugador pasan delante de los de los habitantes (que conservan su avance).
  let at = npc ? m.queue.length : m.queue.findIndex((j) => (j as Job).by === 'npc');
  if (at < 0) at = m.queue.length;
  let n = 0;
  for (let i = 0; i < want; i++) {
    if (!consume(invs, r.inputs)) break;
    const job: Job = { recipeId: r.id, progress: 0 };
    if (npc) job.by = 'npc';
    m.queue.splice(at, 0, job);
    at++;
    n++;
  }
  if (n === 0) return fail(`Faltan: ${stacksText(missingFor(invs, r.inputs))}`);
  let msg = `En cola en ${STATION_PLACE[kind]}: ${r.name}${n > 1 ? ` ×${n}` : ''}`;
  if (n < want) msg += ` (solo alcanzaba para ${n})`;
  if (!npc) {
    // El taller sin energía avisa en el siguiente tick (con el estado de la red ya actualizado).
    if (kind === 'cocina' && !hasFuel(m)) {
      sim.notify('La cocina no tiene combustible: echa leña o un bidón en el fogón', 'warn');
      markWarned(sim, `stove:${m.id}`);
    }
    sfxAt(sim, 'encargo', m);
  }
  return { ok: true, msg };
}

/** Cancela un trabajo de la cola y devuelve los ingredientes al jugador (caja a sus pies si no caben). */
export function cancelCraft(sim: Simulation, moduleId: number, jobIndex: number): ActionResult {
  const m = findModule(sim, moduleId);
  if (!m) return fail('Esa estación ya no existe');
  const job = m.queue[jobIndex];
  if (!job) return fail('Ese trabajo ya no está en la cola');
  m.queue.splice(jobIndex, 1);
  const r = RECIPES[job.recipeId];
  if (!r) return { ok: true, msg: 'Trabajo cancelado' };
  let allFit = true;
  for (const [id, q] of Object.entries(r.inputs)) allFit = giveToPlayer(sim, id, q, true) && allFit;
  return { ok: true, msg: `Cancelado: ${r.name}. Recuperas ${stacksText(r.inputs)}${allFit ? '' : ' (lo que no cabía está en una caja a tus pies)'}` };
}

/** Velocidad actual de una estación (0 = parada). No tiene en cuenta el combustible. */
function stationSpeed(sim: Simulation, m: ModuleInstance, kind: StationKind): number {
  if (m.fire > 0) return 0;
  if (m.status === 'broken') return workIndex(m) >= 0 ? 1 : 0;
  if (m.status !== 'active') return 0;
  if (kind === 'taller') return m.on && m.powered ? sim.state.utilities.power.satisfaction * conditionFactor(m) : 0;
  return 1;
}

/**
 * Trabajo de la cola que avanza ahora: el primero si la estación funciona; si es una estructura
 * averiada, el primero que sea su propio repuesto (`craftableWhileBroken`). -1 si ninguno.
 */
function workIndex(m: ModuleInstance): number {
  if (!m.queue.length) return -1;
  if (m.status === 'active') return 0;
  if (m.status !== 'broken') return -1;
  return m.queue.findIndex((j) => craftableWhileBroken(m, RECIPES[j.recipeId]));
}

/** Estado de una estación para la UI (cola con progreso y tiempo restante). */
export function stationStatus(sim: Simulation, moduleId: number): StationStatus | null {
  const m = findModule(sim, moduleId);
  const kind = stationKindOf(m);
  if (!m || !kind) return null;
  let speed = stationSpeed(sim, m, kind);
  let status = 'En espera';
  const name = moduleDef(m.type).name;
  if (m.status === 'construction') status = 'En obras';
  else if (m.status === 'broken') {
    status = agree(name, 'Averiado');
    if (speed > 0 && m.fire <= 0) status += ': fabricando su repuesto';
  } else if (m.fire > 0) status = '¡Ardiendo!';
  else if (kind === 'taller' && !m.on) status = agree(name, 'Apagado');
  else if (m.queue.length) {
    if (kind === 'taller' && speed <= 0) status = 'Sin energía';
    else if (kind === 'cocina' && !hasFuel(m)) {
      status = 'Sin combustible';
      speed = 0;
    } else status = speed < 0.99 ? `Trabajando (${Math.round(speed * 100)} %)` : 'Trabajando';
  }
  let eta = 0;
  const jobs = m.queue.map((j, index) => {
    const recipe = RECIPES[j.recipeId]!;
    const left = recipe ? Math.max(0, recipe.time - j.progress) : 0;
    eta += left;
    return {
      index,
      recipe,
      progress: recipe && recipe.time > 0 ? Math.min(1, j.progress / recipe.time) : 1,
      etaMin: speed > 0 ? eta / speed : null,
      byNpc: (j as Job).by === 'npc',
    };
  });
  return {
    kind,
    working: speed > 0 && m.queue.length > 0,
    speed,
    status,
    fuelMinutes: m.fuelInv ? Math.round(fuelMinutes(m)) : null,
    jobs: jobs.filter((j) => !!j.recipe),
  };
}

/** El fogón de la cocina está encendido (cocinando). Útil para el calor y la presentación. */
export function isStoveLit(m: ModuleInstance): boolean {
  return m.type === 'cocina' && m.status === 'active' && m.powered;
}

/* ------------------------------------------------------------------ */
/* Tick de estaciones                                                  */
/* ------------------------------------------------------------------ */

function finishJob(sim: Simulation, m: ModuleInstance, kind: StationKind, r: RecipeDef, job: Job): void {
  const outputs: ItemStack[] = Object.entries(r.outputs).map(([id, qty]) => ({ id, qty }));
  const where = storeProducts(sim, m, outputs);
  sfxAt(sim, kind === 'cocina' ? 'cocinado' : 'fabricado', m);
  if (job.by === 'npc') return;
  sim.state.player.stats.itemsCrafted += units(r.outputs);
  markTutorial(sim, kind === 'cocina' ? 'cocinar' : 'fabricar');
  const name = productName(r);
  let text = `${name} ${agree(name, 'listo')} en ${STATION_PLACE[kind]}`;
  if (where === 'almacen') text += ' (bandeja llena: guardado en el almacén)';
  else if (where === 'caja') text += ' (sin sitio: en una caja junto a la estación)';
  sim.notify(text, 'good');
}

function tickStation(sim: Simulation, m: ModuleInstance, kind: StationKind, dt: number): void {
  let lit = false;
  const speed = m.queue.length ? stationSpeed(sim, m, kind) : 0;
  if (kind === 'taller' && m.status === 'active' && m.fire <= 0) {
    // Apagado con el interruptor no es lo mismo que sin energía: cada caso, su aviso.
    if (!m.queue.length || speed > 0) {
      clearWarn(sim, `workshop:${m.id}`);
      clearWarn(sim, `workshop-off:${m.id}`);
    } else if (!m.on) {
      clearWarn(sim, `workshop:${m.id}`);
      const name = moduleDef(m.type).name;
      warnOnce(sim, `workshop-off:${m.id}`, `${withArticle(name, true)} está ${agree(name, 'apagado')}: enciénde${isFeminineName(name) ? 'la' : 'lo'} para seguir trabajando`, 'warn');
    } else {
      clearWarn(sim, `workshop-off:${m.id}`);
      warnOnce(sim, `workshop:${m.id}`, 'El taller no tiene energía: el trabajo está en pausa hasta que la haya', 'warn');
    }
  }
  let time = dt;
  while (speed > 0 && time > 1e-9) {
    const idx = workIndex(m);
    if (idx < 0) break;
    const job = m.queue[idx] as Job;
    const r = RECIPES[job.recipeId];
    if (!r) {
      m.queue.splice(idx, 1); // receta desconocida (guardado de otra versión)
      continue;
    }
    const need = Math.max(0, (r.time - job.progress) / speed);
    const work = Math.min(time, need);
    if (kind === 'cocina' && work > 0) {
      const burned = burnFuel(m, work);
      if (burned > 0) lit = true;
      if (burned < work - 1e-9) {
        job.progress += burned * speed;
        warnOnce(sim, `stove:${m.id}`, `La cocina se ha quedado sin combustible: ${r.name} en pausa`, 'warn');
        break;
      }
      clearWarn(sim, `stove:${m.id}`);
    }
    job.progress += work * speed;
    time -= work;
    if (job.progress >= r.time - 1e-9) {
      m.queue.splice(m.queue.indexOf(job), 1);
      finishJob(sim, m, kind, r, job);
    }
  }
  if (kind === 'cocina') m.powered = lit;
}

/* ------------------------------------------------------------------ */
/* Huerto                                                              */
/* ------------------------------------------------------------------ */

/** Luz efectiva 0..1 que recibe un huerto ahora mismo. */
export function plotLight(sim: Simulation, m: ModuleInstance): number {
  if (m.status !== 'active') return 0;
  if (moduleHasSky(sim, m)) return NIGHT_GROWTH + (1 - NIGHT_GROWTH) * daylight(sim.state.time);
  if (hasGrowLamps(sim, m) && m.on && m.powered) return sim.state.utilities.power.satisfaction;
  return 0;
}

/**
 * Por qué un huerto no recibe luz ahora mismo (null si la recibe): sin el plano de lámparas en un
 * interior, lámparas apagadas o sin energía.
 */
export function plotLightIssue(sim: Simulation, m: ModuleInstance): string | null {
  if (m.status !== 'active' || moduleHasSky(sim, m)) return null;
  if (!hasGrowLamps(sim, m)) return `aquí no llega el sol y falta el ${blueprintName('invernadero')}`;
  if (!m.on) return 'las lámparas de cultivo están apagadas';
  if (!m.powered || sim.state.utilities.power.satisfaction <= 0) return 'las lámparas de cultivo no tienen energía';
  return null;
}

function resetPlot(p: PlotState): void {
  p.crop = null;
  p.growth = 0;
  p.dryHours = 0;
  p.dead = false;
  p.pest = false;
}

function tickPlots(sim: Simulation, m: ModuleInstance, dt: number): void {
  if (m.status !== 'active') return;
  const hours = dt / 60;
  const u = sim.state.utilities;
  const light = plotLight(sim, m);
  // A cielo abierto la lluvia riega: con lluvia moderada (≥ RAIN_WATERS) no hace falta agua de la red.
  const rainShare = moduleHasSky(sim, m) ? Math.min(1, Math.max(0, sim.state.weather.rain) / RAIN_WATERS) : 0;
  let thirsty = false;
  for (const p of m.plots) {
    if (!p.crop || p.dead) continue;
    const crop: CropDef | undefined = CROPS[p.crop];
    if (!crop) {
      resetPlot(p);
      continue;
    }
    if (p.growth >= 1) continue; // maduro: espera a la cosecha sin gastar agua
    const need = crop.waterPerHour * hours;
    const fromRain = need * (Number.isFinite(rainShare) ? rainShare : 0);
    const got = Math.min(need - fromRain, Math.max(0, u.waterL));
    u.waterL -= got;
    const wet = need > 0 ? (fromRain + got) / need : 1;
    if (wet >= 0.999) p.dryHours = 0;
    else {
      p.dryHours += hours * (1 - wet);
      thirsty = true;
    }
    if (p.dryHours >= crop.dryHoursToDie) {
      p.dead = true;
      sim.log(`El cultivo de ${crop.name.toLowerCase()} se ha secado en el huerto`, 'warn');
      continue;
    }
    if (p.dryHours >= DRY_WARN_HOURS) {
      warnOnce(sim, `dry:${m.id}`, 'El huerto no recibe agua: las plantas se están secando', 'warn');
    }
    if (!p.pest && light > 0) {
      const before = p.growth;
      p.growth = Math.min(1, p.growth + (hours / crop.growHours) * light * wet);
      if (before < 1 && p.growth >= 1) sim.notify(`Cosecha lista en el huerto: ${crop.name}`, 'good');
    }
  }
  if (!thirsty) clearWarn(sim, `dry:${m.id}`);
}

/** Texto de estado de una parcela para la UI. */
export function plotStatus(sim: Simulation, moduleId: number, plot: number): string {
  const m = findModule(sim, moduleId);
  const p = m?.plots[plot];
  if (!m || !p) return '';
  if (!p.crop) return p.pest ? 'Vacía (con plaga)' : 'Vacía';
  const crop = CROPS[p.crop];
  const name = crop?.name ?? p.crop;
  if (p.dead) return `${name}: ${agree(name, 'seco')}`;
  if (p.growth >= 1) return `${name}: ${agree(name, 'listo')} para cosechar`;
  const parts = [`${name}: ${Math.floor(p.growth * 100)} %`];
  if (p.pest) parts.push('¡plaga!');
  if (p.dryHours > 0.05) parts.push(`sin agua ${p.dryHours.toFixed(1)} h`);
  if (plotLight(sim, m) <= 0) {
    const issue = plotLightIssue(sim, m);
    parts.push(issue ? `sin luz: ${issue}` : 'sin luz');
  }
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ */
/* Tick general                                                        */
/* ------------------------------------------------------------------ */

export function tickStations(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  for (const m of sim.state.ship.modules) {
    const kind = STATION_OF_MODULE[m.type];
    if (kind) {
      if (m.status === 'active' || (m.status === 'broken' && workIndex(m) >= 0)) tickStation(sim, m, kind, dt);
      else if (kind === 'cocina') m.powered = false;
    }
    if (m.plots.length) tickPlots(sim, m, dt);
  }
}

/* ------------------------------------------------------------------ */
/* Comandos del huerto                                                 */
/* ------------------------------------------------------------------ */

function plotOf(sim: Simulation, moduleId: number, plot: number): { m: ModuleInstance; p: PlotState } | string {
  const m = findModule(sim, moduleId);
  if (!m || !m.plots.length) return 'Aquí no hay parcelas de cultivo';
  if (m.status === 'construction') return 'El huerto aún está en obras';
  const p = m.plots[plot];
  if (!p) return 'Esa parcela no existe';
  return { m, p };
}

/** Planta una semilla del inventario del jugador (o de los almacenes si lo hace un habitante). */
export function plant(sim: Simulation, moduleId: number, plot: number, seed: ItemId, actor: EconomyActor = {}): ActionResult {
  const ref = plotOf(sim, moduleId, plot);
  if (typeof ref === 'string') return fail(ref);
  const { m, p } = ref;
  if (p.dead) return fail('Retira primero las plantas secas');
  if (p.crop) return fail('Esa parcela ya está plantada');
  if (p.pest) return fail('Retira primero la plaga');
  const cropId = cropForSeed(seed);
  const crop = cropId ? CROPS[cropId] : undefined;
  if (!cropId || !crop) return fail(`${itemName(seed)}: eso no se puede plantar`);
  if (!moduleHasSky(sim, m) && !hasGrowLamps(sim, m)) {
    return fail(`Aquí no llega la luz del sol: necesitas el ${blueprintName('invernadero')}`);
  }
  const npc = actor.by === 'npc';
  const invs = npc ? payInventories(sim, false) : [sim.state.player.inventory];
  if (!consume(invs, { [seed]: 1 })) return fail(`No tienes ${lowerFirst(itemName(seed))}`);
  resetPlot(p);
  p.crop = cropId;
  if (!npc) markTutorial(sim, 'plantar');
  sfxAt(sim, 'plantar', m);
  let msg = `Plantas ${crop.name.toLowerCase()}`;
  // Si no va a crecer, se dice por qué (y qué hacer).
  const issue = plotLightIssue(sim, m);
  const many = isPluralName(crop.name);
  if (issue === 'las lámparas de cultivo están apagadas') msg += `. Enciende las lámparas de cultivo para que ${many ? 'crezcan' : 'crezca'}`;
  else if (issue) msg += `. No ${many ? 'crecerán' : 'crecerá'}: ${issue}`;
  if (sim.state.utilities.waterL <= 0.5) msg += '. ¡Ojo: los depósitos están vacíos y necesitarán agua!';
  return { ok: true, msg };
}

/** Cosecha una parcela madura: productos y semillas (azar con sim.rng) al jugador o a los almacenes. */
export function harvest(sim: Simulation, moduleId: number, plot: number, actor: EconomyActor = {}): ActionResult {
  const ref = plotOf(sim, moduleId, plot);
  if (typeof ref === 'string') return fail(ref);
  const { m, p } = ref;
  if (!p.crop) return fail('No hay nada plantado');
  if (p.dead) return fail('Las plantas están secas: retíralas');
  const crop = CROPS[p.crop];
  if (!crop) {
    resetPlot(p);
    return fail('Cultivo desconocido');
  }
  if (p.growth < 1) return fail(`Aún no está maduro (${Math.floor(p.growth * 100)} %)`);
  const items: ItemStack[] = [];
  for (const y of crop.yield) {
    const q = sim.rng.int(y.min, y.max);
    if (q > 0) items.push({ id: y.id, qty: q });
  }
  if (sim.rng.chance(crop.seedReturn.chance)) {
    const q = sim.rng.int(crop.seedReturn.min, crop.seedReturn.max);
    if (q > 0) items.push({ id: crop.seed, qty: q });
  }
  resetPlot(p);
  let note = '';
  if (actor.by === 'npc') {
    const left: ItemStack[] = [];
    for (const s of items) {
      const l = depositToStorage(sim, s.id, s.qty);
      if (l > 0) left.push({ id: s.id, qty: l });
    }
    if (left.length) spawnCrate(sim, safeDropPoint(sim, moduleCenter(m, sim.state.ship.width)), left, 'Cosecha');
  } else {
    let allFit = true;
    for (const s of items) allFit = giveToPlayer(sim, s.id, s.qty, true) && allFit;
    if (!allFit) note = ' (no cabía todo: el resto está en una caja a tus pies)';
  }
  sfxAt(sim, 'cosechar', m);
  return { ok: true, msg: `Cosechas ${stacksText(items)}${note}` };
}

/** Retira plantas muertas o una plaga de la parcela. */
export function tendPlot(sim: Simulation, moduleId: number, plot: number): ActionResult {
  const ref = plotOf(sim, moduleId, plot);
  if (typeof ref === 'string') return fail(ref);
  const { m, p } = ref;
  if (p.dead) {
    resetPlot(p);
    sfxAt(sim, 'cuidar', m);
    return { ok: true, msg: 'Retiras las plantas secas: la parcela queda libre' };
  }
  if (p.pest) {
    p.pest = false;
    sfxAt(sim, 'cuidar', m);
    return { ok: true, msg: 'Retiras la plaga de la parcela' };
  }
  return fail('Esta parcela no necesita cuidados');
}

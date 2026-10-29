/**
 * [AGENTE sim-economy] FABRICACIÓN, COCINA Y CULTIVOS (docs/SISTEMAS.md §7).
 *
 * - Estación por tipo de módulo: banco_trabajo → banco, taller → taller, cocina → cocina; sin
 *   módulo → a mano (instantáneo).
 * - Los ingredientes se pagan con el inventario del jugador y luego con almacenes y bandejas
 *   (`payInventories`). Los habitantes (`by: 'npc'`) pagan solo con los almacenes.
 * - Cola de hasta 8 trabajos por estación; se paga al encolar y se devuelve al cancelar.
 * - El primer trabajo avanza `dt × velocidad`: banco siempre (×1), taller con energía
 *   (× satisfacción), cocina quemando combustible de su ranura (si se acaba, se pausa y avisa).
 * - Productos → bandeja de la estación → almacén → caja junto a la estación (nunca se pierden).
 * - Huerto: luz (cielo abierto: 30 % de noche, 100 % de día; interior: lámparas con energía),
 *   agua de la red (a cielo abierto la lluvia riega y ahorra depósito), horas sin agua, muerte,
 *   plaga y maduración. Los cultivos maduros esperan a la cosecha sin gastar agua.
 */
import { CROPS, cropForSeed, type CropDef } from '../data/crops';
import { ITEMS } from '../data/items';
import { moduleDef } from '../data/modules';
import { RECIPES, recipesFor, type RecipeDef, type StationKind } from '../data/recipes';
import { forwardOf } from './physics';
import { depositToStorage, findModule, giveToPlayer, itemName, payInventories, spawnCrate, stacksText } from './helpers';
import { addItem, consume, missingFor } from './inventory';
import { moduleCenter } from './ship';
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
  markWarned,
  moduleHasSky,
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
  /** Texto de estado: "Trabajando", "Sin energía", "Sin combustible", "Averiado"… */
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

/** Motivo por el que una estación no admite trabajos ahora (o null). */
function stationBlocker(m: ModuleInstance): string | null {
  const name = moduleDef(m.type).name;
  if (m.status === 'construction') return `${withArticle(name, true)} aún está en obras`;
  if (m.status === 'broken') {
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

/** Punto delante del mueble principal de la estación (para dejar cajas), o el centro del módulo. */
export function stationDropPoint(sim: Simulation, m: ModuleInstance): Vec3 {
  const layout = sim.layout;
  const prop = layout.props.find((p) => p.moduleId === m.id && p.interact !== null);
  if (prop) {
    const f = forwardOf(prop.yaw);
    const reach = Math.abs(f.x) * prop.hx + Math.abs(f.z) * prop.hz + 0.55;
    return { x: prop.x + f.x * reach, y: prop.y, z: prop.z + f.z * reach };
  }
  const c = moduleCenter(m, sim.state.ship.width);
  return { x: c.x, y: c.y, z: c.z };
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
  let blocker: string | null = null;
  if (moduleId !== null) {
    const m = findModule(sim, moduleId);
    const k = stationKindOf(m);
    if (!m || !k) return [];
    kind = k;
    blocker = stationBlocker(m);
  }
  const invs = payInventories(sim);
  return recipesFor(kind).map((recipe) => {
    const locked = isLocked(sim, recipe);
    const missing = missingFor(invs, recipe.inputs);
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
  const blocker = stationBlocker(m);
  if (blocker) return fail(blocker);
  const r = RECIPES[recipeId];
  if (!r) return fail('Receta desconocida');
  if (r.station !== kind) return fail(r.station === 'mano' ? 'Esto se fabrica a mano' : `Esto se fabrica en ${STATION_PLACE[r.station]}`);
  if (isLocked(sim, r)) return fail(`Necesitas el ${blueprintName(r.unlock!)}`);
  const npc = actor.by === 'npc';
  const invs = payInventories(sim, !npc);
  const want = Math.max(1, Math.min(Math.floor(Number.isFinite(count) ? count : 1), MAX_QUEUE - m.queue.length));
  let n = 0;
  for (let i = 0; i < want; i++) {
    if (!consume(invs, r.inputs)) break;
    const job: Job = { recipeId: r.id, progress: 0 };
    if (npc) job.by = 'npc';
    m.queue.push(job);
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
  if (m.status !== 'active' || m.fire > 0) return 0;
  if (kind === 'taller') return m.powered ? sim.state.utilities.power.satisfaction * conditionFactor(m) : 0;
  return 1;
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
  else if (m.status === 'broken') status = agree(name, 'averiado').replace(/^./, (c) => c.toUpperCase());
  else if (m.fire > 0) status = '¡Ardiendo!';
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
  if (kind === 'taller' && m.queue.length && m.status === 'active' && m.fire <= 0) {
    if (speed > 0) clearWarn(sim, `workshop:${m.id}`);
    else warnOnce(sim, `workshop:${m.id}`, 'El taller no tiene energía: el trabajo está en pausa hasta que la haya', 'warn');
  }
  let time = dt;
  while (speed > 0 && time > 1e-9 && m.queue.length) {
    const job = m.queue[0] as Job;
    const r = RECIPES[job.recipeId];
    if (!r) {
      m.queue.shift(); // receta desconocida (guardado de otra versión)
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
      m.queue.shift();
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
  if (plotLight(sim, m) <= 0) parts.push('sin luz');
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
      if (m.status === 'active') tickStation(sim, m, kind, dt);
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
  if (!consume(invs, { [seed]: 1 })) return fail(`No tienes ${itemName(seed)}`);
  resetPlot(p);
  p.crop = cropId;
  if (!npc) markTutorial(sim, 'plantar');
  sfxAt(sim, 'plantar', m);
  let msg = `Plantas ${crop.name.toLowerCase()}`;
  if (sim.state.utilities.waterL <= 0.5) msg += '. ¡Ojo: los depósitos están vacíos y necesitarán agua!';
  else if (!moduleHasSky(sim, m) && !m.on) msg += '. Enciende las lámparas de cultivo para que crezcan';
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
    if (left.length) spawnCrate(sim, moduleCenter(m, sim.state.ship.width), left, 'Cosecha');
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

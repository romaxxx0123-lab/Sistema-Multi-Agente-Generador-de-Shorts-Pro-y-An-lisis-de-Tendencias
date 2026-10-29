/**
 * [AGENTE sim-economy] CONSTRUCCIÓN, DEMOLICIÓN, AMPLIACIÓN DEL CASCO, OBRAS Y REPARACIONES
 * (docs/SISTEMAS.md §8).
 *
 * - `checkPlace` = reglas espaciales de `checkPlacement` + luz de los huertos (un huerto sin cielo
 *   abierto necesita el plano de lámparas de cultivo) + coste contra `payInventories`.
 * - `placeModule` paga y crea la obra (`status: 'construction'`). Las obras avanzan solas
 *   (`dt / buildTime`) y más rápido con ayuda: +75 % por habitante con actividad 'building' cuya
 *   tarea apunta a la obra, y el jugador con martillo (`helpBuild`) trabaja a ritmo ×2.
 * - Al terminar: módulo activo, `shipChanged()`, diario y estadística. Quien estuviera dentro de la
 *   obra (jugador, habitantes, cajas) y se quede sin suelo o dentro de un mueble pasa al punto
 *   transitable más cercano (nadie cae a la bodega por una escalera nueva).
 * - Demoler: reembolso 100 % en obra / 50 % construido; contenido + reembolso a una caja en el
 *   centro del módulo (o el punto transitable más cercano); libera camas; despierta al jugador si
 *   dormía allí. `checkDemolishModule` avisa antes del agua y la carga que se perderían.
 * - Ampliación del casco: obra especial `ship.expansion` (+2 celdas por proa, máx. 18). Cuesta
 *   `HULL_EXPANSION.cost × (1 + ampliaciones hechas)`; cancelarla devuelve lo pagado.
 * - Desgaste: las máquinas funcionando pierden 1 de condición cada 8 h; a 0 se averían.
 * - Reparación: máquinas → llave inglesa + pieza mecánica; estructuras → martillo + kit. Si falta
 *   el repuesto, se dice dónde conseguirlo (`partSourceHint`).
 */
import { HULL_EXPANSION, MODULES, moduleDef } from '../data/modules';
import { RECIPE_LIST, RECIPES } from '../data/recipes';
import { CROPS } from '../data/crops';
import { CELL, HULL_EXPANSION_CELLS, LEVEL_H, SHIP_MAX_LENGTH } from './constants';
import { findModule, itemName, payInventories, spawnCrate, stacksText } from './helpers';
import { consume, countItem, missingFor } from './inventory';
import { AGENT_RADIUS } from './nav';
import { PLAYER_RADIUS } from './physics';
import {
  cellMin,
  checkDemolish,
  checkPlacement,
  computeLayout,
  getCell,
  instantiateModule,
  levelOfY,
  moduleCells,
  moduleCenter,
  previewModule,
  type PlaceCheck,
} from './ship';
import type { ActionResult, Simulation } from './Simulation';
import {
  blueprintName,
  craftableWhileBroken,
  isValidDropPoint,
  nearestSpot,
  safeDropPoint,
  STATION_OF_MODULE,
  STATION_PLACE,
  standsOn,
  type EconomyActor,
} from './stations';
import { markTutorial } from './tutorial';
import type { ItemId, ItemStack, ModuleInstance, Vec3 } from './types';
import {
  agree,
  capacities,
  finite,
  GROW_LAMP_KW,
  isFeminineName,
  machineLoad,
  refreshCapacities,
  repairNeeds as sharedRepairNeeds,
  withArticle,
} from './utilities';

/* ------------------------------------------------------------------ */
/* Parámetros                                                          */
/* ------------------------------------------------------------------ */

/** Aceleración de la obra por cada habitante ayudando. */
export const NPC_HELP_BONUS = 0.75;
/** Ritmo del jugador con martillo respecto al avance base de la obra. */
export const PLAYER_HELP_RATE = 2;
/** Horas de funcionamiento por punto de condición perdido (desgaste). */
export const WEAR_HOURS_PER_POINT = 8;
/** Fracción del coste que se recupera al desmontar un módulo terminado. */
export const DEMOLISH_REFUND = 0.5;
/**
 * Condición por debajo de la cual se ofrece reparar (además de averías y fugas). El desgaste
 * normal (1 punto cada 8 h) pide repuestos tras unas 40 h de funcionamiento.
 */
export const REPAIR_THRESHOLD = 95;

const fail = (msg: string): ActionResult => ({ ok: false, msg });

/** "40 min", "1 h 30 min", "4 h". */
export function durationText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/* ------------------------------------------------------------------ */
/* Colocación                                                          */
/* ------------------------------------------------------------------ */

/** ¿Le daría el sol a un módulo colocado así? (alguna celda de su nivel a cielo abierto). */
export function plannedHasSky(sim: Simulation, type: string, level: number, x: number, z: number, rot: ModuleInstance['rot']): boolean {
  const preview = previewModule(type, level, x, z, rot);
  const planned = computeLayout(sim.state.ship, true, [preview]);
  return moduleCells(preview).some((c) => c.level === level && !!getCell(planned, c.level, c.x, c.z)?.sky);
}

/** Resultado de `checkPlace`: validación espacial y de coste, y un aviso opcional. */
export type PlaceInfo = PlaceCheck & {
  missing: Record<ItemId, number>;
  /** Aviso que no impide construir (p. ej. el consumo de las lámparas de un huerto interior). */
  warning?: string | null;
};

/**
 * Validación espacial + luz de los huertos + coste. Si falta material, `ok=false` y
 * `reason = "Faltan: 3× Madera"`. Un huerto donde no llega el sol necesita el plano de lámparas.
 */
export function checkPlace(sim: Simulation, type: string, level: number, x: number, z: number, rot: ModuleInstance['rot']): PlaceInfo {
  const base = checkPlacement(sim.state.ship, sim.state.unlocks, type, level, x, z, rot);
  const def = MODULES[type];
  const missing = def ? missingFor(payInventories(sim), def.cost) : {};
  // Nombra el plano concreto que falta ("Necesitas el Plano: Energía").
  if (!base.ok && def?.unlock && !sim.state.unlocks.includes(def.unlock)) {
    return { ...base, reason: `Necesitas el ${blueprintName(def.unlock)}`, missing };
  }
  let warning: string | null = null;
  if (base.ok && def?.plots && !plannedHasSky(sim, type, level, x, z, rot)) {
    // Sin sol ni lámparas no crecería nada: no se deja pagar una instalación inútil. (El motivo
    // empieza por "Necesitas" para que el modo construcción no sugiera girar la pieza.)
    if (!sim.state.unlocks.includes('invernadero')) {
      return { ...base, ok: false, reason: `Necesitas el ${blueprintName('invernadero')} (aquí no llega el sol)`, missing };
    }
    const kw = (GROW_LAMP_KW * def.plots).toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
    warning = `En interior crece con lámparas de cultivo: consumirán hasta ${kw} kW`;
  }
  if (base.ok && Object.keys(missing).length) {
    return { ...base, ok: false, reason: `Faltan: ${stacksText(missing)}`, missing, warning };
  }
  return { ...base, missing, warning };
}

/** Paga y crea la obra de un módulo. */
export function placeModule(sim: Simulation, type: string, level: number, x: number, z: number, rot: ModuleInstance['rot']): ActionResult & { moduleId?: number } {
  const chk = checkPlace(sim, type, level, x, z, rot);
  if (!chk.ok) return fail(chk.reason ?? 'No se puede construir aquí');
  const def = moduleDef(type);
  if (!consume(payInventories(sim), def.cost)) return fail(`Faltan: ${stacksText(missingFor(payInventories(sim), def.cost))}`);
  const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'construction');
  sim.state.ship.modules.push(m);
  sim.shipChanged();
  markTutorial(sim, 'construir');
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name: 'obra_iniciada', x: c.x, y: c.y + 1, z: c.z });
  return { ok: true, moduleId: m.id, msg: `Obra iniciada: ${def.name} (${durationText(def.buildTime)}; ayuda con el martillo para acabar antes)` };
}

/* ------------------------------------------------------------------ */
/* Obras                                                               */
/* ------------------------------------------------------------------ */

/** Habitantes trabajando ahora en una obra (`-1` = ampliación del casco). */
export function buildersOn(sim: Simulation, targetId: number): number {
  let n = 0;
  for (const npc of sim.state.npcs) {
    if (npc.activity === 'building' && npc.task?.targetModuleId === targetId) n++;
  }
  return n;
}

export interface ConstructionStatus {
  /** 0..1 */
  progress: number;
  /** Habitantes ayudando ahora mismo. */
  builders: number;
  /** Minutos de juego que faltan al ritmo actual (sin contar al jugador). */
  etaMin: number;
  name: string;
}

/** Estado de una obra (`-1` = ampliación del casco) para la UI y el modo construcción. */
export function constructionStatus(sim: Simulation, moduleId: number): ConstructionStatus | null {
  if (moduleId === -1) {
    const ex = sim.state.ship.expansion;
    if (!ex) return null;
    const builders = buildersOn(sim, -1);
    const rate = (1 + NPC_HELP_BONUS * builders) / HULL_EXPANSION.buildTime;
    return { progress: ex.progress, builders, etaMin: (1 - ex.progress) / rate, name: HULL_EXPANSION.name };
  }
  const m = findModule(sim, moduleId);
  if (!m || m.status !== 'construction') return null;
  const def = moduleDef(m.type);
  const builders = buildersOn(sim, m.id);
  const rate = (1 + NPC_HELP_BONUS * builders) / Math.max(1, def.buildTime);
  return { progress: m.buildProgress, builders, etaMin: (1 - m.buildProgress) / rate, name: def.name };
}

/** Celdas (niveles 0 y 1) que añadirá la ampliación del casco en curso o la siguiente. */
export function expansionCells(sim: Simulation): { level: number; x: number; z: number }[] {
  const ship = sim.state.ship;
  const out: { level: number; x: number; z: number }[] = [];
  for (let i = 0; i < HULL_EXPANSION_CELLS; i++) {
    for (let z = 0; z < ship.width; z++) for (const level of [0, 1]) out.push({ level, x: ship.length + i, z });
  }
  return out;
}

/** Punto de trabajo de la ampliación (borde de proa en la cubierta principal), en metros locales. */
export function expansionWorkPoint(sim: Simulation): Vec3 {
  const ship = sim.state.ship;
  const bow = cellMin(ship.length, 0, ship.width).x;
  return { x: bow - 0.6, y: LEVEL_H, z: 0 };
}

/**
 * Tras terminar o desmontar `m`, recoloca lo que haya quedado mal en su sitio:
 * - cajas sueltas sobre el hueco de una escalera, en una rampa o dentro de un mueble nuevo → al
 *   punto transitable más cercano (nunca se pierden objetos);
 * - el jugador o un habitante sin suelo bajo los pies (una escalera nueva bajo él) o dentro de un
 *   mueble o una pared → al punto transitable más cercano (sobre la rampa si estaba en ella).
 * Solo se mira lo que está dentro de las celdas del módulo (o rozándolas).
 */
function settleAround(sim: Simulation, m: ModuleInstance): void {
  const st = sim.state;
  const width = st.ship.width;
  const cells = moduleCells(m);
  const near = (p: Vec3, margin: number): boolean => {
    const lv = levelOfY(p.y);
    return cells.some((c) => {
      if (c.level !== lv) return false;
      const mn = cellMin(c.x, c.z, width);
      return p.x > mn.x - margin && p.x < mn.x + CELL + margin && p.z > mn.z - margin && p.z < mn.z + CELL + margin;
    });
  };
  for (const crate of st.crates) {
    if (!near(crate.pos, 0.5) || isValidDropPoint(sim, crate.pos)) continue;
    crate.pos = safeDropPoint(sim, crate.pos);
  }
  const pl = st.player;
  const inBed = !!pl.sleeping && pl.sleeping.moduleId !== null;
  if (pl.alive && !inBed && near(pl.pos, PLAYER_RADIUS + 0.3) && !standsOn(sim, pl.pos, PLAYER_RADIUS)) {
    const spot = nearestSpot(sim, pl.pos, (p) => standsOn(sim, p, PLAYER_RADIUS));
    if (spot) pl.pos = spot;
  }
  for (const npc of st.npcs) {
    // Quien duerme está en una cama de otro módulo; quien está de expedición, fuera del barco.
    if (npc.activity === 'away' || npc.activity === 'sleeping') continue;
    if (!near(npc.pos, 0) || standsOn(sim, npc.pos, AGENT_RADIUS)) continue;
    const spot = nearestSpot(sim, npc.pos, (p) => standsOn(sim, p, AGENT_RADIUS));
    if (spot) npc.pos = spot;
  }
}

function finishModule(sim: Simulation, m: ModuleInstance): void {
  const def = moduleDef(m.type);
  m.status = 'active';
  m.buildProgress = 1;
  m.condition = 100;
  sim.shipChanged();
  settleAround(sim, m);
  sim.state.player.stats.modulesBuilt++;
  sim.log(`Obra terminada: ${def.name}`, 'good');
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name: 'obra_terminada', x: c.x, y: c.y + 1, z: c.z });
}

function finishExpansion(sim: Simulation): void {
  const ship = sim.state.ship;
  ship.length = Math.min(SHIP_MAX_LENGTH, ship.length + HULL_EXPANSION_CELLS);
  ship.hullTier++;
  ship.expansion = null;
  sim.shipChanged();
  sim.log(`Ampliación del casco terminada: el barco mide ahora ${ship.length * CELL} m de eslora`, 'good');
  sim.bus.emit('sfx', { name: 'obra_terminada' });
}

/** Avance de obras, ampliación del casco y desgaste de las máquinas. */
export function tickConstruction(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;

  // Obras de módulos (copia: terminar una obra no altera la lista, pero por si acaso).
  for (const m of [...st.ship.modules]) {
    if (m.status !== 'construction') continue;
    const def = moduleDef(m.type);
    const rate = (1 + NPC_HELP_BONUS * buildersOn(sim, m.id)) / Math.max(1, def.buildTime);
    m.buildProgress = Math.min(1, m.buildProgress + dt * rate);
    if (m.buildProgress >= 1 - 1e-9) finishModule(sim, m);
  }

  // Ampliación del casco.
  const ex = st.ship.expansion;
  if (ex) {
    const rate = (1 + NPC_HELP_BONUS * buildersOn(sim, -1)) / HULL_EXPANSION.buildTime;
    ex.progress = Math.min(1, ex.progress + dt * rate);
    if (ex.progress >= 1 - 1e-9) finishExpansion(sim);
  }

  // Desgaste de las máquinas en funcionamiento.
  const wear = dt / (WEAR_HOURS_PER_POINT * 60);
  for (const m of st.ship.modules) {
    const load = machineLoad(sim, m);
    if (load <= 0) continue;
    const name = moduleDef(m.type).name;
    const before = m.condition;
    m.condition = Math.max(0, m.condition - wear * load);
    if (before >= 50 && m.condition < 50) {
      const pron = isFeminineName(name) ? 'la' : 'lo';
      sim.notify(`${withArticle(name, true)} está muy ${agree(name, 'desgastado')} y rinde menos: repára${pron} con llave inglesa y pieza mecánica`, 'warn');
    }
    if (m.condition <= 0) {
      m.status = 'broken';
      m.brokenReason = 'Desgaste';
      m.powered = false;
      sim.log(`${withArticle(name, true)} se ha ${agree(name, 'averiado')} por desgaste`, 'danger');
      const c = moduleCenter(m, st.ship.width);
      sim.bus.emit('sfx', { name: 'averia', x: c.x, y: c.y + 1, z: c.z });
    }
  }
}

/** El jugador trabaja `minutes` minutos en una obra con el martillo (`-1` = ampliación del casco). */
export function helpBuild(sim: Simulation, moduleId: number, minutes: number): ActionResult {
  if (countItem(sim.state.player.inventory, 'martillo') < 1) return fail('Necesitas un martillo para ayudar en la obra');
  const mins = Math.max(0, Math.min(30, Number.isFinite(minutes) ? minutes : 0));
  if (moduleId === -1) {
    const ex = sim.state.ship.expansion;
    if (!ex) return fail('No hay ninguna ampliación del casco en obras');
    ex.progress = Math.min(1, ex.progress + (mins * PLAYER_HELP_RATE) / HULL_EXPANSION.buildTime);
    const pct = Math.floor(ex.progress * 100);
    if (ex.progress >= 1 - 1e-9) {
      finishExpansion(sim);
      return { ok: true, msg: 'Ampliación del casco terminada' };
    }
    return { ok: true, msg: `Ampliación del casco: ${pct} %` };
  }
  const m = findModule(sim, moduleId);
  if (!m) return fail('Esa obra ya no existe');
  const def = moduleDef(m.type);
  if (m.status !== 'construction') return fail(`${withArticle(def.name, true)} ya está ${agree(def.name, 'terminado')}`);
  m.buildProgress = Math.min(1, m.buildProgress + (mins * PLAYER_HELP_RATE) / Math.max(1, def.buildTime));
  if (m.buildProgress >= 1 - 1e-9) {
    finishModule(sim, m);
    return { ok: true, msg: `Obra terminada: ${def.name}` };
  }
  return { ok: true, msg: `${def.name}: ${Math.floor(m.buildProgress * 100)} %` };
}

/* ------------------------------------------------------------------ */
/* Demolición                                                          */
/* ------------------------------------------------------------------ */

function addTo(acc: Record<ItemId, number>, id: ItemId, qty: number): void {
  if (qty > 0) acc[id] = (acc[id] ?? 0) + qty;
}

/** Materiales que se recuperan al desmontar (100 % si sigue en obras, 50 % redondeado abajo si no). */
export function demolishRefund(m: ModuleInstance): Record<ItemId, number> {
  const def = moduleDef(m.type);
  const out: Record<ItemId, number> = {};
  const f = m.status === 'construction' ? 1 : DEMOLISH_REFUND;
  for (const [id, q] of Object.entries(def.cost)) addTo(out, id, Math.floor(q * f));
  return out;
}

/** Resultado de `checkDemolishModule`. */
export interface DemolishCheck {
  ok: boolean;
  reason: string | null;
  refund: Record<ItemId, number>;
  /** Agua potable que se perdería porque baja la capacidad de los depósitos (L; 0 si nada). */
  waterLossL?: number;
  /** Carga de las baterías que se perdería (kWh; 0 si nada). */
  batteryLossKWh?: number;
  /** Capacidad de agua (L) y de baterías (kWh) que quedarían. */
  waterCapacityAfterL?: number;
  batteryCapacityAfterKWh?: number;
  /** Avisos para la confirmación: "Se perderán 40 L de agua: la capacidad baja a 20 L". */
  losses?: string[];
}

/** Agua y carga que se perderían al desmontar `m` (lo que no cabe en lo que queda). */
export function demolishLosses(sim: Simulation, m: ModuleInstance): Required<Pick<DemolishCheck, 'waterLossL' | 'batteryLossKWh' | 'waterCapacityAfterL' | 'batteryCapacityAfterKWh' | 'losses'>> {
  const u = sim.state.utilities;
  const after = capacities(sim, m.id);
  const waterLossL = Math.max(0, finite(u.waterL) - after.waterL);
  const batteryLossKWh = Math.max(0, finite(u.batteryKWh) - after.batteryKWh);
  const losses: string[] = [];
  if (waterLossL >= 0.5) {
    const rest = after.waterL > 0 ? `la capacidad baja a ${Math.round(after.waterL)} L` : 'no quedará ningún depósito';
    losses.push(`Se perderán ${Math.round(waterLossL)} L de agua: ${rest}`);
  }
  if (batteryLossKWh >= 0.5) {
    const rest = after.batteryKWh > 0 ? `la capacidad baja a ${Math.round(after.batteryKWh)} kWh` : 'no quedará ninguna batería';
    losses.push(`Se perderán ${Math.round(batteryLossKWh)} kWh de las baterías: ${rest}`);
  }
  return { waterLossL, batteryLossKWh, waterCapacityAfterL: after.waterL, batteryCapacityAfterKWh: after.batteryKWh, losses };
}

export function checkDemolishModule(sim: Simulation, moduleId: number): DemolishCheck {
  const m = findModule(sim, moduleId);
  if (!m) return { ok: false, reason: 'Ese módulo ya no existe', refund: {} };
  const refund = demolishRefund(m);
  const losses = demolishLosses(sim, m);
  const base = checkDemolish(sim.state.ship, moduleId);
  if (!base.ok) return { ok: false, reason: base.reason, refund, ...losses };
  if (m.fire > 0) return { ok: false, reason: 'No se puede desmontar mientras arde', refund, ...losses };
  return { ok: true, reason: null, refund, ...losses };
}

/** Todo lo que guarda un módulo: inventario, combustible, trabajos pagados y cultivos vivos. */
function moduleContents(m: ModuleInstance): Record<ItemId, number> {
  const out: Record<ItemId, number> = {};
  for (const inv of [m.inventory, m.fuelInv]) for (const s of inv?.slots ?? []) if (s) addTo(out, s.id, s.qty);
  for (const j of m.queue) {
    const r = RECIPES[j.recipeId];
    if (r) for (const [id, q] of Object.entries(r.inputs)) addTo(out, id, q);
  }
  for (const p of m.plots) {
    if (!p.crop || p.dead) continue;
    const crop = CROPS[p.crop];
    if (!crop) continue;
    // Se trasplanta: vuelve la semilla y, si estaba madura, la cosecha mínima.
    addTo(out, crop.seed, 1);
    if (p.growth >= 1) for (const y of crop.yield) addTo(out, y.id, y.min);
  }
  return out;
}

/** Desmonta un módulo: materiales y contenido a una caja en su centro. */
export function demolish(sim: Simulation, moduleId: number): ActionResult {
  const chk = checkDemolishModule(sim, moduleId);
  if (!chk.ok) return fail(chk.reason ?? 'No se puede desmontar');
  const st = sim.state;
  const m = findModule(sim, moduleId)!;
  const def = moduleDef(m.type);
  const wasBuilt = m.status !== 'construction';

  const all: Record<ItemId, number> = { ...chk.refund };
  const contents = moduleContents(m);
  const hadContents = Object.keys(contents).length > 0;
  for (const [id, q] of Object.entries(contents)) addTo(all, id, q);
  const stacks: ItemStack[] = Object.entries(all).map(([id, qty]) => ({ id, qty }));
  const c = moduleCenter(m, st.ship.width);

  // Camas y tareas de los habitantes que dependían del módulo.
  for (const npc of st.npcs) {
    if (npc.bed?.moduleId === moduleId) npc.bed = null;
    if (npc.task?.targetModuleId === moduleId) {
      npc.task = null;
      npc.path = [];
      if (npc.activity !== 'away') npc.activity = 'idle';
    }
  }
  // El jugador dormía aquí: se despierta.
  if (st.player.sleeping?.moduleId === moduleId) {
    sim.wake(`Han desmontado ${withArticle(def.name)}`);
    if (st.player.sleeping) st.player.sleeping = null;
  }

  st.ship.modules = st.ship.modules.filter((mm) => mm.id !== moduleId);
  sim.shipChanged();
  const lost = refreshCapacities(sim);
  // La caja, en el centro del módulo o, si ahí no se sostiene, en el punto transitable más cercano.
  const crate = spawnCrate(sim, safeDropPoint(sim, { x: c.x, y: c.y, z: c.z }), stacks, `Restos: ${def.name}`);
  settleAround(sim, m);

  let msg = wasBuilt ? `Desmontado: ${def.name}` : `Obra cancelada: ${def.name}`;
  if (crate) msg += `. ${hadContents ? 'Materiales y contenido' : 'Materiales'} en una caja`;
  if (lost.lostWaterL >= 0.5) msg += `. Se pierden ${Math.round(lost.lostWaterL)} L de agua`;
  if (lost.lostKWh >= 0.5) msg += `. Se pierden ${Math.round(lost.lostKWh)} kWh de las baterías`;
  if (wasBuilt) sim.log(msg, 'info', false);
  sim.bus.emit('sfx', { name: 'demoler', x: c.x, y: c.y + 1, z: c.z });
  return { ok: true, msg };
}

/* ------------------------------------------------------------------ */
/* Ampliación del casco                                                */
/* ------------------------------------------------------------------ */

/**
 * Coste de la próxima ampliación del casco (o de la que está en obras: `hullTier` solo sube al
 * terminarla): el coste base × (1 + ampliaciones ya hechas).
 */
export function hullExpansionCost(sim: Simulation): Record<ItemId, number> {
  const k = 1 + Math.max(0, Math.floor(finite(sim.state.ship.hullTier)));
  const out: Record<ItemId, number> = {};
  for (const [id, q] of Object.entries(HULL_EXPANSION.cost)) out[id] = q * k;
  return out;
}

export function checkExpandHull(sim: Simulation): { ok: boolean; reason: string | null; missing: Record<ItemId, number>; cost: Record<ItemId, number> } {
  const st = sim.state;
  const cost = hullExpansionCost(sim);
  const missing = missingFor(payInventories(sim), cost);
  if (!st.unlocks.includes(HULL_EXPANSION.unlock)) return { ok: false, reason: `Necesitas el ${blueprintName(HULL_EXPANSION.unlock)}`, missing, cost };
  if (st.ship.expansion) return { ok: false, reason: 'Ya hay una ampliación del casco en obras', missing, cost };
  if (st.ship.length + HULL_EXPANSION_CELLS > SHIP_MAX_LENGTH) return { ok: false, reason: 'El casco ya tiene la eslora máxima', missing, cost };
  if (Object.keys(missing).length) return { ok: false, reason: `Faltan: ${stacksText(missing)}`, missing, cost };
  return { ok: true, reason: null, missing, cost };
}

export function expandHull(sim: Simulation): ActionResult {
  const chk = checkExpandHull(sim);
  if (!chk.ok) return fail(chk.reason ?? 'No se puede ampliar el casco');
  if (!consume(payInventories(sim), chk.cost)) return fail('Faltan materiales');
  sim.state.ship.expansion = { progress: 0 };
  sim.shipChanged();
  markTutorial(sim, 'construir');
  sim.log('Comienza la ampliación del casco por la proa', 'info', false);
  sim.bus.emit('sfx', { name: 'obra_iniciada' });
  return { ok: true, msg: `Ampliación del casco iniciada (${durationText(HULL_EXPANSION.buildTime)}; ayuda con el martillo en la proa)` };
}

/**
 * Cancela la ampliación del casco en obras: como cualquier obra sin terminar, devuelve el 100 % de
 * lo pagado (el coste del nivel actual, que es el que se pagó) en una caja en la proa.
 */
export function cancelExpansion(sim: Simulation): ActionResult {
  const st = sim.state;
  if (!st.ship.expansion) return fail('No hay ninguna ampliación del casco en obras');
  const refund = hullExpansionCost(sim);
  st.ship.expansion = null;
  for (const npc of st.npcs) {
    if (npc.task?.targetModuleId !== -1) continue;
    npc.task = null;
    npc.path = [];
    if (npc.activity !== 'away') npc.activity = 'idle';
  }
  sim.shipChanged();
  const stacks: ItemStack[] = Object.entries(refund).map(([id, qty]) => ({ id, qty }));
  spawnCrate(sim, safeDropPoint(sim, expansionWorkPoint(sim)), stacks, `Restos: ${HULL_EXPANSION.name}`);
  sim.bus.emit('sfx', { name: 'demoler' });
  return { ok: true, msg: 'Ampliación del casco cancelada. Materiales en una caja en la proa' };
}

/* ------------------------------------------------------------------ */
/* Reparación                                                          */
/* ------------------------------------------------------------------ */

/** Herramienta y pieza necesarias para reparar un tipo de módulo. */
export function repairNeeds(type: string): { tool: ItemId; part: ItemId } {
  return sharedRepairNeeds(type);
}

/** Tipo de módulo de una estación ('banco' → 'banco_trabajo'…). */
function moduleOfStation(kind: string): string | undefined {
  return Object.keys(STATION_OF_MODULE).find((type) => STATION_OF_MODULE[type] === kind);
}

/**
 * Dónde conseguir un repuesto, para orientar al jugador: las estaciones del barco que pueden
 * fabricarlo ahora mismo (una averiada solo si puede hacer su propio repuesto; el taller, solo con
 * energía), o pecios y mercantes si ninguna puede.
 * Ej.: "fabrícala en el taller o improvísala en el banco de trabajo".
 */
export function partSourceHint(sim: Simulation, part: ItemId): string {
  const pron = isFeminineName(itemName(part)) ? 'la' : 'lo';
  const opts: string[] = [];
  // Primero las recetas normales y después los apaños (más caros).
  const recipes = [...RECIPE_LIST].sort((a, b) => Number(/improvisad/i.test(a.name)) - Number(/improvisad/i.test(b.name)));
  for (const r of recipes) {
    if (!(r.outputs[part]! > 0) || r.station === 'mano') continue;
    if (r.unlock && !sim.state.unlocks.includes(r.unlock)) continue;
    const type = moduleOfStation(r.station);
    const station = sim.state.ship.modules.find((mm) => {
      if (mm.type !== type || mm.fire > 0) return false;
      if (mm.status === 'broken') return craftableWhileBroken(mm, r);
      if (mm.status !== 'active') return false;
      // El taller solo sirve si tiene (o tendría) energía.
      return r.station !== 'taller' || (mm.on && mm.powered);
    });
    if (!station) continue;
    const verb = /improvisad/i.test(r.name) ? `improvísa${pron}` : `fabríca${pron}`;
    const text = `${verb} en ${STATION_PLACE[r.station]}`;
    if (!opts.includes(text)) opts.push(text);
  }
  if (!opts.length) return `búsca${pron} en los pecios o cámbia${pron} a un mercante`;
  return opts.join(', ').replace(/, ([^,]*)$/, ' o $1');
}

/** ¿Necesita reparación? (avería, fuga o condición < REPAIR_THRESHOLD). */
export function needsRepair(m: ModuleInstance): boolean {
  return m.status !== 'construction' && (m.status === 'broken' || m.leak || m.condition < REPAIR_THRESHOLD);
}

export function repairInfo(sim: Simulation, moduleId: number, actor: EconomyActor = {}): { needed: boolean; tool: ItemId | null; part: ItemId | null; ok: boolean; reason: string | null } {
  const m = findModule(sim, moduleId);
  if (!m) return { needed: false, tool: null, part: null, ok: false, reason: 'Ese módulo ya no existe' };
  const { tool, part } = repairNeeds(m.type);
  if (m.status === 'construction') return { needed: false, tool, part, ok: false, reason: 'Está en obras' };
  if (!needsRepair(m)) return { needed: false, tool, part, ok: false, reason: 'No necesita reparación' };
  if (m.fire > 0) return { needed: true, tool, part, ok: false, reason: 'Primero hay que apagar el fuego' };
  const npc = actor.by === 'npc';
  if (!npc && countItem(sim.state.player.inventory, tool) < 1) {
    return { needed: true, tool, part, ok: false, reason: `Necesitas ${tool === 'martillo' ? 'un martillo' : 'una llave inglesa'} en el inventario` };
  }
  const invs = payInventories(sim, !npc);
  if (missingFor(invs, { [part]: 1 })[part]) {
    const what = part === 'pieza_mecanica' ? 'una pieza mecánica' : 'un kit de reparación';
    return { needed: true, tool, part, ok: false, reason: `Necesitas ${what}: ${partSourceHint(sim, part)}` };
  }
  return { needed: true, tool, part, ok: true, reason: null };
}

/** Repara: condición 100, quita avería y fuga. Consume la pieza (jugador → almacenes). */
export function repair(sim: Simulation, moduleId: number, actor: EconomyActor = {}): ActionResult {
  const info = repairInfo(sim, moduleId, actor);
  if (!info.ok) return fail(info.reason ?? 'No se puede reparar');
  const m = findModule(sim, moduleId)!;
  const npc = actor.by === 'npc';
  if (!consume(payInventories(sim, !npc), { [info.part!]: 1 })) return fail('Falta la pieza de repuesto');
  const def = moduleDef(m.type);
  const wasBroken = m.status === 'broken';
  const hadLeak = m.leak;
  m.condition = 100;
  m.leak = false;
  if (m.status === 'broken') m.status = 'active';
  m.brokenReason = null;
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name: 'reparar', x: c.x, y: c.y + 1, z: c.z });
  let msg = `${def.name} ${agree(def.name, 'reparado')}`;
  if (hadLeak) msg += ': fuga sellada';
  if (!npc) {
    sim.state.player.stats.repairs++;
    markTutorial(sim, 'reparar');
  }
  if (wasBroken || hadLeak) sim.log(msg, 'good', false);
  return { ok: true, msg };
}

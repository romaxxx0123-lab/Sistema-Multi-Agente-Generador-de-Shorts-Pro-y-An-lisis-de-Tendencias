/**
 * Datos que muestra el modo construcción (lógica pura, sin DOM ni three.js): fichas de la paleta
 * con coste "tengo/necesito", estadísticas de energía y agua, bloqueos por plano, resumen del
 * barco, información de módulos y obras, vista previa de demoliciones y de la ampliación del casco.
 *
 * Todo se calcula a partir de la simulación con sus funciones públicas, así que lo que se ve en
 * la paleta es exactamente lo que comprobará `sim.checkPlace` / `sim.placeModule`.
 */
import { ITEMS } from '../data/items';
import { HULL_EXPANSION, MODULE_LIST, moduleDef, type ModuleCategory, type ModuleDef } from '../data/modules';
import { CELL, HULL_EXPANSION_CELLS, SHIP_MAX_LENGTH } from '../sim/constants';
import { durationText } from '../sim/construction';
import { payInventories } from '../sim/helpers';
import { totals } from '../sim/inventory';
import type { Simulation } from '../sim/Simulation';
import { blueprintName } from '../sim/stations';
import type { ItemId, ModuleInstance } from '../sim/types';
import { isConsumer } from '../sim/utilities';

/* ------------------------------------------------------------------ */
/* Textos y formato                                                    */
/* ------------------------------------------------------------------ */

export const LEVEL_NAMES = ['Bodega', 'Cubierta', 'Cubierta superior'] as const;
export const LEVEL_SHORT = ['Bodega', 'Cubierta', 'Superior'] as const;

export function levelName(l: number): string {
  return LEVEL_NAMES[l] ?? `Nivel ${l}`;
}

export interface CategoryInfo {
  id: ModuleCategory;
  label: string;
  glyph: string;
}

export const CATEGORIES: CategoryInfo[] = [
  { id: 'vivienda', label: 'Vivienda', glyph: 'bed' },
  { id: 'produccion', label: 'Producción', glyph: 'hammer' },
  { id: 'agua', label: 'Agua', glyph: 'drop' },
  { id: 'energia', label: 'Energía', glyph: 'power' },
  { id: 'estructura', label: 'Estructura', glyph: 'ship' },
];

/** Número con coma decimal y sin ",0" sobrante: 1.5 → "1,5"; 2 → "2". */
export function fmtNum(v: number, decimals = 1): string {
  if (!Number.isFinite(v)) return '0';
  const s = v.toFixed(decimals);
  return (s.includes('.') ? s.replace(/\.?0+$/, '') : s).replace('.', ',').replace(/^-0$/, '0');
}

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? id;
}

/** Módulos de la paleta de una categoría (construibles, en orden de datos). */
export function paletteModules(cat: ModuleCategory): ModuleDef[] {
  return MODULE_LIST.filter((d) => d.buildable && d.category === cat);
}

/* ------------------------------------------------------------------ */
/* Costes                                                              */
/* ------------------------------------------------------------------ */

export interface CostLine {
  id: ItemId;
  name: string;
  have: number;
  need: number;
  ok: boolean;
}

/** Existencias del barco (jugador + almacenes + bandejas), las mismas con las que se paga. */
export function stock(sim: Simulation): Record<ItemId, number> {
  return totals(payInventories(sim));
}

export function costLines(cost: Record<ItemId, number>, have: Record<ItemId, number>): CostLine[] {
  return Object.entries(cost).map(([id, need]) => {
    const h = have[id] ?? 0;
    return { id, name: itemName(id), have: h, need, ok: h >= need };
  });
}

/* ------------------------------------------------------------------ */
/* Fichas de la paleta                                                 */
/* ------------------------------------------------------------------ */

export type Tone = 'good' | 'bad' | 'info' | 'dim' | 'warn';

export interface StatChip {
  glyph: string;
  text: string;
  tone: Tone;
  title: string;
}

/** Datos técnicos de un módulo para su ficha: obra, energía, agua, camas, almacenaje... */
export function moduleStats(def: ModuleDef): StatChip[] {
  const out: StatChip[] = [];
  out.push({ glyph: 'clock', text: durationText(def.buildTime), tone: 'dim', title: 'Tiempo de obra (más rápido si ayudas con el martillo)' });
  if (def.powerUse) out.push({ glyph: 'plug', text: `−${fmtNum(def.powerUse)} kW`, tone: 'bad', title: 'Consumo eléctrico mientras funciona' });
  if (def.powerGen) {
    const solar = !def.fuelSlots;
    out.push({ glyph: 'power', text: `+${fmtNum(def.powerGen)} kW${solar ? ' de día' : ''}`, tone: 'good', title: solar ? 'Produce con la luz del sol (menos con nubes)' : 'Produce quemando madera o combustible' });
  }
  if (def.batteryKWh) out.push({ glyph: 'battery', text: `${fmtNum(def.batteryKWh)} kWh`, tone: 'good', title: 'Guarda la energía sobrante' });
  if (def.waterGen) {
    const rain = def.id === 'colector';
    out.push({ glyph: 'drop', text: `+${fmtNum(def.waterGen)} L/h${rain ? ' con lluvia' : ''}`, tone: 'good', title: rain ? 'Recoge agua cuando llueve' : 'Potabiliza agua de mar con electricidad' });
  }
  if (def.waterCapacity) out.push({ glyph: 'tank', text: `+${fmtNum(def.waterCapacity)} L`, tone: 'info', title: 'Capacidad de agua potable' });
  if (def.beds) {
    const word = def.healingBeds ? (def.beds === 1 ? 'camilla' : 'camillas') : def.beds === 1 ? 'cama' : 'camas';
    out.push({ glyph: def.healingBeds ? 'medical' : 'bed', text: `${def.beds} ${word}`, tone: 'info', title: def.healingBeds ? 'Se cura más rápido' : 'Plazas para dormir' });
  }
  if (def.storageSlots) out.push({ glyph: 'box', text: `${def.storageSlots} huecos`, tone: 'info', title: def.id === 'almacen' || def.id === 'cocina' ? 'Almacén compartido' : 'Bandeja de la estación' });
  if (def.plots) out.push({ glyph: 'sprout', text: `${def.plots} bancales`, tone: 'info', title: 'Parcelas de cultivo (consumen agua)' });
  if (def.comfort) out.push({ glyph: 'smile', text: `Confort +${def.comfort}`, tone: 'good', title: 'Mejora el ánimo de los habitantes' });
  if (def.speedBonus) out.push({ glyph: 'speed', text: `+${fmtNum(def.speedBonus)} nudos`, tone: 'good', title: 'Más velocidad mientras tenga energía' });
  if (def.needsSky) out.push({ glyph: 'sun', text: 'Cielo abierto', tone: 'warn', title: 'Debe estar a la intemperie' });
  return out;
}

/** "Todos los niveles", "Solo bodega", "Cubierta y superior"... */
export function levelsText(levels: number[]): string {
  const ls = [...levels].sort((a, b) => a - b);
  if (ls.length >= LEVEL_NAMES.length) return 'Todos los niveles';
  const names = ls.map((l) => (LEVEL_SHORT[l] ?? String(l)).toLowerCase());
  if (names.length === 1) return `Solo ${names[0]}`;
  const txt = `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

export interface CardInfo {
  def: ModuleDef;
  locked: boolean;
  /** "Necesitas el Plano: Taller mecánico". */
  lockReason: string | null;
  /** Versión corta para la ficha: "Plano: Taller mecánico". */
  lockShort: string | null;
  cost: CostLine[];
  affordable: boolean;
  stats: StatChip[];
  /** "Bodega · Cubierta · Superior". */
  levelsText: string;
  /** "8×4 m". */
  sizeText: string;
}

export function cardInfo(sim: Simulation, def: ModuleDef, have: Record<ItemId, number>): CardInfo {
  const locked = !!def.unlock && !sim.state.unlocks.includes(def.unlock);
  const cost = costLines(def.cost, have);
  return {
    def,
    locked,
    lockReason: locked && def.unlock ? `Necesitas el ${blueprintName(def.unlock)}` : null,
    lockShort: locked && def.unlock ? blueprintName(def.unlock) : null,
    cost,
    affordable: cost.every((c) => c.ok),
    stats: moduleStats(def),
    levelsText: levelsText(def.levels),
    sizeText: `${def.size[0] * CELL}×${def.size[1] * CELL} m`,
  };
}

/* ------------------------------------------------------------------ */
/* Ampliación del casco                                                */
/* ------------------------------------------------------------------ */

export interface ExpansionInfo {
  locked: boolean;
  /** Plano necesario (texto corto) si está bloqueada. */
  lockShort: string | null;
  ok: boolean;
  reason: string | null;
  cost: CostLine[];
  timeText: string;
  lengthNowM: number;
  lengthAfterM: number;
  atMax: boolean;
  /** Obra en curso: progreso 0..1 y minutos restantes. */
  progress: number | null;
  etaMin: number | null;
}

export function expansionInfo(sim: Simulation, have: Record<ItemId, number>): ExpansionInfo {
  const st = sim.state;
  const chk = sim.checkExpandHull();
  const status = st.ship.expansion ? sim.constructionStatus(-1) : null;
  return {
    locked: !st.unlocks.includes(HULL_EXPANSION.unlock),
    lockShort: st.unlocks.includes(HULL_EXPANSION.unlock) ? null : blueprintName(HULL_EXPANSION.unlock),
    ok: chk.ok,
    reason: chk.reason,
    cost: costLines(HULL_EXPANSION.cost, have),
    timeText: durationText(HULL_EXPANSION.buildTime),
    lengthNowM: st.ship.length * CELL,
    lengthAfterM: Math.min(SHIP_MAX_LENGTH, st.ship.length + HULL_EXPANSION_CELLS) * CELL,
    atMax: st.ship.length + HULL_EXPANSION_CELLS > SHIP_MAX_LENGTH,
    progress: status ? status.progress : null,
    etaMin: status ? status.etaMin : null,
  };
}

/* ------------------------------------------------------------------ */
/* Resumen del barco                                                   */
/* ------------------------------------------------------------------ */

export interface ShipSummary {
  genKW: number;
  demandKW: number;
  satisfaction: number;
  batteryKWh: number;
  batteryCapKWh: number;
  waterL: number;
  waterCapL: number;
  waterInPerHour: number;
  waterOutPerHour: number;
  beds: number;
  /** Camillas de enfermería (no cuentan como camas para vivir). */
  healingBeds: number;
  inhabitants: number;
  lengthM: number;
  maxLengthM: number;
  /** Obras de módulos en curso. */
  works: number;
  expansion: { progress: number; etaMin: number } | null;
}

export function shipSummary(sim: Simulation): ShipSummary {
  const st = sim.state;
  const u = st.utilities;
  let beds = 0;
  let healingBeds = 0;
  let works = 0;
  for (const m of st.ship.modules) {
    if (m.status === 'construction') {
      works++;
      continue;
    }
    const def = moduleDef(m.type);
    if (def.healingBeds) healingBeds += m.beds.length;
    else beds += m.beds.length;
  }
  const ex = st.ship.expansion ? sim.constructionStatus(-1) : null;
  return {
    genKW: u.power.generation,
    demandKW: u.power.demand,
    satisfaction: u.power.satisfaction,
    batteryKWh: u.batteryKWh,
    batteryCapKWh: u.power.capacityKWh,
    waterL: u.waterL,
    waterCapL: u.water.capacityL,
    waterInPerHour: u.water.inPerHour,
    waterOutPerHour: u.water.outPerHour,
    beds,
    healingBeds,
    inhabitants: st.npcs.length + (st.player.alive ? 1 : 0),
    lengthM: st.ship.length * CELL,
    maxLengthM: SHIP_MAX_LENGTH * CELL,
    works,
    expansion: ex ? { progress: ex.progress, etaMin: ex.etaMin } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Información de módulos y obras (al pasar el ratón)                  */
/* ------------------------------------------------------------------ */

export interface ModuleInfo {
  id: number;
  name: string;
  type: string;
  level: number;
  state: string;
  tone: Tone;
  /** Progreso de obra 0..1 (solo obras). */
  progress: number | null;
  /** Condición 0..100 (solo módulos terminados). */
  condition: number | null;
  lines: string[];
}

function bedOwnerName(sim: Simulation, owner: string | null): string {
  if (!owner) return 'libre';
  if (owner === 'player') return 'tuya';
  return sim.state.npcs.find((n) => n.id === owner)?.name ?? 'ocupada';
}

export function moduleInfo(sim: Simulation, m: ModuleInstance): ModuleInfo {
  const def = moduleDef(m.type);
  const lines: string[] = [];
  let state = 'En servicio';
  let tone: Tone = 'good';
  let progress: number | null = null;
  let condition: number | null = null;

  if (m.status === 'construction') {
    const cs = sim.constructionStatus(m.id);
    progress = cs?.progress ?? m.buildProgress;
    state = `En obras · ${Math.floor(progress * 100)} %`;
    tone = 'warn';
    if (cs) {
      lines.push(`Faltan ${durationText(cs.etaMin)}${cs.builders ? ` · ${cs.builders} ${cs.builders === 1 ? 'habitante ayuda' : 'habitantes ayudan'}` : ''}`);
    }
    lines.push('Ayuda con el martillo para acabar antes');
  } else {
    condition = m.condition;
    if (m.status === 'broken') {
      state = m.brokenReason ? `Averiado: ${m.brokenReason}` : 'Averiado';
      tone = 'bad';
    } else if (m.condition < 50) {
      state = 'Dañado';
      tone = 'warn';
    }
    if (m.fire > 0) {
      state = '¡Ardiendo!';
      tone = 'bad';
    }
    if (m.leak) lines.push('Fuga de agua: repárala con martillo y kit');
    if (isConsumer(sim, m)) {
      if (!m.on) lines.push('Apagado');
      else if (!m.powered && m.status === 'active') lines.push('Sin energía suficiente');
    }
    if (def.powerGen && !m.on) lines.push('Apagado');
    if (m.beds.length) {
      const word = def.healingBeds ? 'Camilla' : 'Cama';
      if (m.beds.length <= 2) {
        lines.push(m.beds.map((b, i) => `${word}${m.beds.length > 1 ? ` ${i + 1}` : ''}: ${bedOwnerName(sim, b)}`).join(' · '));
      } else {
        const used = m.beds.filter((b) => !!b).length;
        lines.push(`${word}s ocupadas: ${used}/${m.beds.length}`);
      }
    }
    if (m.inventory) {
      const used = m.inventory.slots.filter((s) => !!s).length;
      lines.push(`Almacenaje: ${used}/${m.inventory.slots.length} huecos ocupados`);
    }
    if (m.plots.length) {
      const growing = m.plots.filter((p) => p.crop && !p.dead).length;
      lines.push(`Bancales: ${growing}/${m.plots.length} plantados`);
    }
    if (m.queue.length) lines.push(`Cola de trabajo: ${m.queue.length}`);
  }
  return { id: m.id, name: def.name, type: m.type, level: m.level, state, tone, progress, condition, lines };
}

/* ------------------------------------------------------------------ */
/* Demolición                                                          */
/* ------------------------------------------------------------------ */

export interface DemolishPreview {
  id: number;
  name: string;
  ok: boolean;
  reason: string | null;
  inConstruction: boolean;
  refund: { id: ItemId; name: string; qty: number }[];
  /** Unidades guardadas dentro (almacén, combustible, trabajos pagados, plantas vivas). */
  contents: number;
}

export function demolishPreview(sim: Simulation, m: ModuleInstance): DemolishPreview {
  const chk = sim.checkDemolishModule(m.id);
  let contents = 0;
  for (const inv of [m.inventory, m.fuelInv]) for (const s of inv?.slots ?? []) if (s) contents += s.qty;
  contents += m.queue.length;
  contents += m.plots.filter((p) => p.crop && !p.dead).length;
  return {
    id: m.id,
    name: moduleDef(m.type).name,
    ok: chk.ok,
    reason: chk.reason,
    inConstruction: m.status === 'construction',
    refund: Object.entries(chk.refund)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({ id, name: itemName(id), qty })),
    contents,
  };
}

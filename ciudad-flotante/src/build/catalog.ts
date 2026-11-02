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
import { recipesFor } from '../data/recipes';
import { CELL, HULL_EXPANSION_CELLS, SHIP_MAX_LENGTH } from '../sim/constants';
import { activeUpgrade, durationText, repairNeeds } from '../sim/construction';
import { GRUA_CYCLE_MIN, GRUA_RANGE, gruaRange } from '../sim/debris';
import { RADAR_EXTRA_MIN } from '../sim/events';
import { payInventories } from '../sim/helpers';
import { totals } from '../sim/inventory';
import { maxTier, moduleDisplayName, moduleMult, moduleStat, moduleTier, nextUpgrade } from '../sim/moduleStats';
import type { Simulation } from '../sim/Simulation';
import { moduleCells, unreachableModules } from '../sim/ship';
import { blueprintName, viveroStatus } from '../sim/stations';
import type { ItemId, ModuleInstance } from '../sim/types';
import { finite, isConsumer, isFeminineName, isRadarActive, VIVERO_MINUTES, withArticle } from '../sim/utilities';
import { RADAR_STORM_LEAD } from '../sim/weather';

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
  out.push(...specialStats(def));
  // La grúa (solo cubierta) y el radar (solo superior) siempre quedan a cielo abierto: su regla
  // la dicen el pie de la ficha y la borda; el aviso se reserva para lo que podría ir en la bodega
  // o elegir nivel.
  if (def.edge) out.push({ glyph: 'ship', text: 'Junto a la borda', tone: 'warn', title: 'Debe ocupar una celda del borde de la cubierta, junto a la barandilla, a cielo abierto' });
  else if (def.needsSky && def.levels.length > 1) out.push({ glyph: 'sun', text: 'Cielo abierto', tone: 'warn', title: 'Debe estar a la intemperie' });
  return out;
}

/** Qué hace cada módulo especializado (ahumadero, vivero, grúa, radar, sala común). */
function specialStats(def: ModuleDef): StatChip[] {
  switch (def.id) {
    case 'sala_comun':
      return [{ glyph: 'people', text: 'Ocio y relaciones', tone: 'good', title: 'La tripulación pasa aquí sus ratos libres: juegan a las cartas, leen, mejoran su ánimo y se llevan mejor' }];
    case 'ahumadero': {
      const r = recipesFor('ahumadero')[0];
      if (!r) return [];
      const [outId, outQty] = Object.entries(r.outputs)[0] ?? ['', 0];
      const inputs = Object.entries(r.inputs).map(([id, q]) => `${q}× ${itemName(id)}`).join(' + ');
      return [{ glyph: 'fish', text: `${outQty} en ${durationText(r.time)}`, tone: 'good', title: `${r.name}: ${inputs} → ${outQty}× ${itemName(outId)} (no hace falta cocinarlo)` }];
    }
    case 'vivero':
      return [{ glyph: 'fish', text: `1 cada ${durationText(VIVERO_MINUTES)}`, tone: 'good', title: `Con energía cría un pescado crudo cada ${durationText(VIVERO_MINUTES)} y lo deja en su bandeja` }];
    case 'grua':
      return [{ glyph: 'lifebuoy', text: `Rescata a ${fmtNum(GRUA_RANGE)} m`, tone: 'good', title: `Con energía engancha sola el resto más cercano de su costado a ${fmtNum(GRUA_RANGE)} m o menos, cada ${durationText(GRUA_CYCLE_MIN)} (también balsas de náufragos)` }];
    case 'radar':
      return [{ glyph: 'storm', text: `Tormentas ${durationText(RADAR_STORM_LEAD)} antes`, tone: 'good', title: `Con energía: aviso de tormenta ${durationText(RADAR_STORM_LEAD)} antes, avistamientos ${durationText(RADAR_EXTRA_MIN)} antes y durante más tiempo, y mensajes de radio de otros barcos` }];
    default:
      return [];
  }
}

/** "Mejorable hasta el nivel 3: Nivel 2: Almacén con altillo · Nivel 3: Almacén reforzado" (o null). */
export function upgradesSummary(def: ModuleDef): string | null {
  const ups = def.upgrades ?? [];
  if (!ups.length) return null;
  const top = Math.max(...ups.map((u) => u.tier));
  return `Mejorable hasta el nivel ${top} con la herramienta Mejorar (U). ${ups.map((u) => `Nivel ${u.tier}: ${u.name}`).join(' · ')}`;
}

/** Número de nivel en romanos (las placas de latón de los muebles mejorados dicen II y III). */
export function tierRoman(t: number): string {
  return ['', 'I', 'II', 'III', 'IV', 'V'][t] ?? String(t);
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
  /** Nivel máximo de mejora (1 = no se mejora) y su explicación para el título. */
  maxTier: number;
  upgradesText: string | null;
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
    maxTier: maxTier(def.id),
    upgradesText: upgradesSummary(def),
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
  /** Ampliaciones ya terminadas (el coste base se multiplica por 1 + este número). */
  done: number;
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
    // El coste crece con cada ampliación hecha: el que dice la simulación, no el base de los datos.
    cost: costLines(chk.cost ?? HULL_EXPANSION.cost, have),
    timeText: durationText(HULL_EXPANSION.buildTime),
    lengthNowM: st.ship.length * CELL,
    lengthAfterM: Math.min(SHIP_MAX_LENGTH, st.ship.length + HULL_EXPANSION_CELLS) * CELL,
    atMax: st.ship.length + HULL_EXPANSION_CELLS > SHIP_MAX_LENGTH,
    done: Math.max(0, Math.floor(finite(st.ship.hullTier))),
    progress: status ? status.progress : null,
    etaMin: status ? status.etaMin : null,
  };
}

/* ------------------------------------------------------------------ */
/* Mejoras de instalaciones (herramienta Mejorar, U)                   */
/* ------------------------------------------------------------------ */

type TierRef = { type: string; tier: number };

/** "40 %" de un factor <1 ("−40 % agua") o el ahorro de un multiplicador de duración (1,5 → 33 %). */
function pct(v: number): string {
  return `${fmtNum(Math.abs(v) * 100, 0)} %`;
}

/**
 * Efectos legibles de pasar un módulo del nivel `from` al `to`, comparando sus estadísticas
 * efectivas (`moduleStat` / `moduleMult`): "+12 huecos", "+100 L", "×1,5 velocidad",
 * "−40 % agua"… Solo aparece lo que cambia.
 */
export function upgradeEffects(type: string, from: number, to: number): StatChip[] {
  const def = moduleDef(type);
  const a: TierRef = { type, tier: from };
  const b: TierRef = { type, tier: to };
  const out: StatChip[] = [];
  const diff = (key: Parameters<typeof moduleStat>[1]): [number, number, number] | null => {
    const va = moduleStat(a, key);
    const vb = moduleStat(b, key);
    return Math.abs(vb - va) > 1e-9 ? [va, vb, vb - va] : null;
  };
  const plus = (d: number): string => `${d >= 0 ? '+' : '−'}${fmtNum(Math.abs(d))}`;

  let d = diff('storageSlots');
  if (d) out.push({ glyph: 'box', text: `${plus(d[2])} ${Math.abs(d[2]) === 1 ? 'hueco' : 'huecos'}`, tone: 'info', title: `Almacenaje: ${d[0]} → ${d[1]} huecos` });
  d = diff('fuelSlots');
  if (d) out.push({ glyph: 'fire', text: `${plus(d[2])} ${Math.abs(d[2]) === 1 ? 'ranura' : 'ranuras'} de combustible`, tone: 'info', title: `Combustible: ${d[0]} → ${d[1]} ranuras` });
  d = diff('waterCapacity');
  if (d) out.push({ glyph: 'tank', text: `${plus(d[2])} L`, tone: 'info', title: `Capacidad de agua potable: ${fmtNum(d[0])} → ${fmtNum(d[1])} L` });
  d = diff('waterGen');
  if (d) {
    const rain = type === 'colector';
    out.push({ glyph: 'drop', text: `${plus(d[2])} L/h${rain ? ' con lluvia' : ''}`, tone: 'good', title: `${rain ? 'Agua recogida con lluvia' : 'Agua potabilizada'}: ${fmtNum(d[0])} → ${fmtNum(d[1])} L/h` });
  }
  d = diff('powerGen');
  if (d) {
    const solar = !def.fuelSlots;
    out.push({ glyph: 'power', text: `${plus(d[2])} kW${solar ? ' de día' : ''}`, tone: 'good', title: `Potencia${solar ? ' a pleno sol' : ''}: ${fmtNum(d[0])} → ${fmtNum(d[1])} kW` });
  }
  d = diff('powerUse');
  if (d) out.push({ glyph: 'plug', text: `${plus(d[2])} kW de consumo`, tone: d[2] < 0 ? 'good' : 'bad', title: `Consumo eléctrico: ${fmtNum(d[0])} → ${fmtNum(d[1])} kW` });
  d = diff('batteryKWh');
  if (d) out.push({ glyph: 'battery', text: `${plus(d[2])} kWh`, tone: 'good', title: `Capacidad de las baterías: ${fmtNum(d[0])} → ${fmtNum(d[1])} kWh` });
  d = diff('comfort');
  if (d) {
    const why = def.beds && !def.healingBeds ? 'mejor ánimo y mejor descanso en sus camas' : 'mejor ánimo de quien pasa aquí su tiempo';
    out.push({ glyph: 'smile', text: `Confort ${plus(d[2])}`, tone: 'good', title: `Confort: ${fmtNum(d[0])} → ${fmtNum(d[1])} (${why})` });
  }
  d = diff('speedBonus');
  if (d) out.push({ glyph: 'speed', text: `${plus(d[2])} nudos`, tone: 'good', title: `Velocidad extra del motor: ${fmtNum(d[0])} → ${fmtNum(d[1])} nudos` });

  // Multiplicadores: "×1,5 velocidad" si parte de 1; "Velocidad ×1,2 → ×1,5" si ya estaba mejorado.
  const mult = (key: Parameters<typeof moduleMult>[1]): [number, number] | null => {
    const va = moduleMult(a, key);
    const vb = moduleMult(b, key);
    return Math.abs(vb - va) > 1e-9 ? [va, vb] : null;
  };
  const times = (m: [number, number], label: string): string =>
    Math.abs(m[0] - 1) < 1e-9 ? `×${fmtNum(m[1], 2)} ${label}` : `${label.charAt(0).toUpperCase()}${label.slice(1)} ×${fmtNum(m[0], 2)} → ×${fmtNum(m[1], 2)}`;
  /** Factor < 1 que ahorra: "−40 % agua" / "Agua −40 % → −50 %". */
  const saves = (fa: number, fb: number, label: string): string =>
    Math.abs(fa - 1) < 1e-9 ? `−${pct(1 - fb)} ${label}` : `${label.charAt(0).toUpperCase()}${label.slice(1)} −${pct(1 - fa)} → −${pct(1 - fb)}`;

  const ws = mult('workSpeed');
  if (ws) {
    const what: Record<string, string> = {
      cocina: 'Cocina más deprisa',
      banco_trabajo: 'Fabrica más deprisa',
      taller: 'Fabrica más deprisa',
      ahumadero: 'Ahúma más deprisa',
      vivero: `Un pescado cada ${durationText(VIVERO_MINUTES / ws[1])} (ahora cada ${durationText(VIVERO_MINUTES / ws[0])})`,
      grua: `Lanza el gancho cada ${durationText(GRUA_CYCLE_MIN / ws[1])} (ahora cada ${durationText(GRUA_CYCLE_MIN / ws[0])})`,
    };
    out.push({ glyph: 'speed', text: times(ws, 'velocidad'), tone: 'good', title: what[type] ?? 'Trabaja más deprisa' });
  }
  const fe = mult('fuelEfficiency');
  if (fe) out.push({ glyph: 'fire', text: saves(1 / fe[0], 1 / fe[1], 'combustible'), tone: 'good', title: `Cada carga de combustible dura ×${fmtNum(fe[1], 2)}` });
  const gm = mult('growthMult');
  if (gm) out.push({ glyph: 'sprout', text: times(gm, 'crecimiento'), tone: 'good', title: 'Las plantas crecen más deprisa' });
  const wu = mult('waterUseMult');
  if (wu) out.push({ glyph: 'drop', text: saves(wu[0], wu[1], 'agua'), tone: 'good', title: 'Los cultivos beben menos agua de los depósitos' });
  const hm = mult('healMult');
  if (hm) out.push({ glyph: 'medical', text: times(hm, 'curación'), tone: 'good', title: 'Quien descansa en sus camillas se cura antes' });
  const wm = mult('wearMult');
  if (wm) out.push({ glyph: 'wrench', text: saves(wm[0], wm[1], 'desgaste'), tone: 'good', title: 'Pierde condición más despacio: se avería menos' });
  if (type === 'grua') {
    const ra = gruaRange(a);
    const rb = gruaRange(b);
    if (Math.abs(rb - ra) > 1e-9) out.push({ glyph: 'lifebuoy', text: `Alcance ${fmtNum(ra)} → ${fmtNum(rb)} m`, tone: 'good', title: 'Hasta dónde llega la pluma para enganchar restos de su costado' });
  }
  return out;
}

/**
 * Estado de la mejora de un módulo:
 *  - `ok`: se puede encargar ya; `cost`: solo faltan materiales; `blocked`: otra cosa lo impide
 *    (en obras, averiado, ardiendo, sin plano);
 *  - `busy`: hay una mejora en obras (clic para cancelarla); `max`: ya está al máximo;
 *  - `none`: ese tipo de módulo no admite mejoras.
 */
export type UpgradeState = 'ok' | 'cost' | 'blocked' | 'busy' | 'max' | 'none';

export interface UpgradePreview {
  id: number;
  type: string;
  /** Nivel del barco donde está (bodega, cubierta…). */
  level: number;
  /** Nombre actual (según su nivel de mejora). */
  name: string;
  tier: number;
  maxTier: number;
  state: UpgradeState;
  /** Motivo de no poder mejorar (null si se puede o si está en obras de mejora). */
  reason: string | null;
  /** Qué hacer para poder mejorarlo, si se sabe. */
  hint: string | null;
  /** Mejora siguiente (o la que está en obras). */
  toTier: number | null;
  nextName: string | null;
  desc: string | null;
  effects: StatChip[];
  /** Coste (en obras: lo pagado, que se recupera entero al cancelar). */
  cost: CostLine[];
  timeText: string | null;
  /** Obra de mejora en curso. */
  progress: number | null;
  etaMin: number | null;
  builders: number;
}

/** "Repáralo con la llave inglesa y una pieza mecánica". */
function repairHint(m: ModuleInstance): string {
  const { tool, part } = repairNeeds(m.type);
  const fem = isFeminineName(moduleDisplayName(m));
  const partName = itemName(part);
  const partLower = partName.charAt(0).toLowerCase() + partName.slice(1);
  return `Repára${fem ? 'la' : 'lo'} con ${withArticle(itemName(tool))} y ${isFeminineName(partName) ? 'una' : 'un'} ${partLower}`;
}

export function upgradePreview(sim: Simulation, m: ModuleInstance, have: Record<ItemId, number> = stock(sim)): UpgradePreview {
  const def = moduleDef(m.type);
  const tier = moduleTier(m);
  const top = maxTier(m.type);
  const base: UpgradePreview = {
    id: m.id,
    type: m.type,
    level: m.level,
    name: moduleDisplayName(m),
    tier,
    maxTier: top,
    state: 'none',
    reason: null,
    hint: null,
    toTier: null,
    nextName: null,
    desc: null,
    effects: [],
    cost: [],
    timeText: null,
    progress: null,
    etaMin: null,
    builders: 0,
  };
  if (!def.upgrades?.length) return { ...base, state: 'none', reason: `${withArticle(def.name, true)} no admite mejoras` };
  const busy = m.status !== 'construction' ? activeUpgrade(m) : null;
  if (!busy && !nextUpgrade(m)) return { ...base, state: 'max', reason: `Nivel máximo (${tier} de ${top})` };
  const chk = sim.checkUpgrade(m.id);
  const to = chk.toTier ?? tier + 1;
  const info = {
    toTier: to,
    nextName: chk.name,
    desc: chk.desc,
    effects: upgradeEffects(m.type, tier, to),
    cost: costLines(chk.cost, have),
    timeText: chk.buildTime > 0 ? durationText(chk.buildTime) : null,
  };
  if (busy) {
    const cs = sim.constructionStatus(m.id);
    return { ...base, ...info, state: 'busy', progress: cs?.progress ?? finite(m.upgrade?.progress), etaMin: cs?.etaMin ?? null, builders: cs?.builders ?? 0 };
  }
  if (chk.ok) return { ...base, ...info, state: 'ok' };
  const reason = chk.reason ?? 'No se puede mejorar';
  if (reason.startsWith('Faltan')) return { ...base, ...info, state: 'cost', reason, hint: 'Consigue los materiales: cuentan la mochila, los almacenes y las bandejas' };
  let hint: string | null = null;
  if (m.status === 'construction') hint = 'Espera a que termine la obra (o ayuda con el martillo)';
  else if (m.fire > 0) hint = 'Apaga antes el fuego con el cubo';
  else if (m.status === 'broken') hint = repairHint(m);
  return { ...base, ...info, state: 'blocked', reason, hint };
}

const UPGRADE_ORDER: Record<UpgradeState, number> = { ok: 0, cost: 1, busy: 2, blocked: 3, max: 4, none: 5 };

/**
 * Módulos del barco que admiten mejoras, para la lista de la herramienta Mejorar: primero los que
 * se pueden mejorar ya, luego los que solo esperan materiales, las obras de mejora, los bloqueados
 * y, al final, los que ya están al máximo. Las obras de construcción no salen (aún no se mejoran).
 */
export function upgradeList(sim: Simulation, have: Record<ItemId, number> = stock(sim)): UpgradePreview[] {
  const out: UpgradePreview[] = [];
  for (const m of sim.state.ship.modules) {
    if (m.status === 'construction' || !moduleDef(m.type).upgrades?.length) continue;
    out.push(upgradePreview(sim, m, have));
  }
  return out.sort((a, b) => UPGRADE_ORDER[a.state] - UPGRADE_ORDER[b.state] || b.level - a.level || a.name.localeCompare(b.name, 'es') || a.id - b.id);
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
  /** Mejoras en obras (módulos que siguen en uso mientras tanto). */
  upgrades: number;
  expansion: { progress: number; etaMin: number } | null;
}

export function shipSummary(sim: Simulation): ShipSummary {
  const st = sim.state;
  const u = st.utilities;
  let beds = 0;
  let healingBeds = 0;
  let works = 0;
  let upgrades = 0;
  for (const m of st.ship.modules) {
    if (m.status === 'construction') {
      works++;
      continue;
    }
    if (activeUpgrade(m)) upgrades++;
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
    upgrades,
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
  /** Nivel de mejora actual y máximo (1 y 1 si no se mejora). */
  tier: number;
  maxTier: number;
  /** Obra de mejora en curso (el módulo sigue en uso mientras dura). */
  upgrade: { name: string; toTier: number; progress: number; etaMin: number; builders: number } | null;
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
    lines.push(...specialLines(sim, m));
  }
  let upgrade: ModuleInfo['upgrade'] = null;
  const up = m.status !== 'construction' ? activeUpgrade(m) : null;
  if (up) {
    const cs = sim.constructionStatus(m.id);
    upgrade = { name: up.name, toTier: up.tier, progress: cs?.progress ?? finite(m.upgrade?.progress), etaMin: cs?.etaMin ?? 0, builders: cs?.builders ?? 0 };
  }
  return { id: m.id, name: moduleDisplayName(m), type: m.type, level: m.level, state, tone, progress, condition, lines, tier: moduleTier(m), maxTier: maxTier(m.type), upgrade };
}

/** Estado de los módulos automáticos (vivero, grúa, radar) para la ficha. */
function specialLines(sim: Simulation, m: ModuleInstance): string[] {
  const out: string[] = [];
  if (m.type === 'vivero') {
    const v = viveroStatus(sim, m.id);
    if (v) {
      out.push(`${v.status} · ${v.stock}/${v.capacity} ${v.capacity === 1 ? 'pescado' : 'pescados'} en la bandeja`);
      if (v.working && v.etaMin !== null) out.push(`Próximo pescado en ${durationText(v.etaMin)}`);
    }
  } else if (m.type === 'grua') {
    const g = sim.gruaStatus(m.id);
    if (g) {
      out.push(g.status);
      const side = g.side > 0 ? 'estribor' : 'babor';
      out.push(`Alcance ${fmtNum(g.range)} m por ${side} · ${g.inRange} ${g.inRange === 1 ? 'resto' : 'restos'} a su alcance`);
    }
  } else if (m.type === 'radar' && m.status === 'active' && m.on && m.powered && isRadarActive(sim)) {
    out.push(`En marcha: avisa de las tormentas ${durationText(RADAR_STORM_LEAD)} antes`);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Demolición                                                          */
/* ------------------------------------------------------------------ */

export interface DemolishPreview {
  id: number;
  name: string;
  ok: boolean;
  reason: string | null;
  /** Qué hacer para poder desmontarlo ("Desmonta antes la escalera"), si se sabe. */
  hint: string | null;
  inConstruction: boolean;
  refund: { id: ItemId; name: string; qty: number }[];
  /** Unidades guardadas dentro (almacén, combustible, trabajos pagados, plantas vivas). */
  contents: number;
  /** Agua potable (L) y carga (kWh) que se perderían porque baja la capacidad. */
  waterLossL: number;
  batteryLossKWh: number;
  /** Avisos de pérdida para la ficha y la confirmación ("Se perderán 40 L de agua: …"). */
  losses: string[];
  /** Mejora en obras que se cancelaría (se recupera entera), o null. */
  upgradeInProgress: string | null;
  /** Nivel de mejora terminado (las mejoras hechas se recuperan a medias). */
  tier: number;
}

/**
 * Agua y carga que se perderían al desmontar `m`, si la simulación no lo dice: lo que no cabe en
 * la capacidad que queda sin el módulo (las obras aún no cuentan en la capacidad).
 */
export function estimateLosses(sim: Simulation, m: ModuleInstance): Pick<DemolishPreview, 'waterLossL' | 'batteryLossKWh' | 'losses'> {
  const u = sim.state.utilities;
  const built = m.status !== 'construction';
  // Capacidad efectiva (con su nivel de mejora), no la de la definición base.
  const waterCap = Math.max(0, finite(u.water?.capacityL) - (built ? moduleStat(m, 'waterCapacity') : 0));
  const battCap = Math.max(0, finite(u.power?.capacityKWh) - (built ? moduleStat(m, 'batteryKWh') : 0));
  const waterLossL = Math.max(0, finite(u.waterL) - waterCap);
  const batteryLossKWh = Math.max(0, finite(u.batteryKWh) - battCap);
  const losses: string[] = [];
  if (waterLossL >= 0.5) losses.push(`Se perderán ${Math.round(waterLossL)} L de agua: ${waterCap > 0 ? `la capacidad baja a ${Math.round(waterCap)} L` : 'no quedará ningún depósito'}`);
  if (batteryLossKWh >= 0.5) losses.push(`Se perderán ${Math.round(batteryLossKWh)} kWh de las baterías: ${battCap > 0 ? `la capacidad baja a ${Math.round(battCap)} kWh` : 'no quedará ninguna batería'}`);
  return { waterLossL, batteryLossKWh, losses };
}

export function demolishPreview(sim: Simulation, m: ModuleInstance): DemolishPreview {
  const chk = sim.checkDemolishModule(m.id);
  let contents = 0;
  for (const inv of [m.inventory, m.fuelInv]) for (const s of inv?.slots ?? []) if (s) contents += s.qty;
  contents += m.queue.length;
  contents += m.plots.filter((p) => p.crop && !p.dead).length;
  const reason = chk.ok ? null : demolishReason(sim, m, chk.reason);
  return {
    id: m.id,
    name: moduleDisplayName(m),
    ok: chk.ok,
    reason,
    hint: chk.ok ? null : demolishHint(reason, aboveModules(sim, m).every((mm) => moduleDef(mm.type).demolishable)),
    inConstruction: m.status === 'construction',
    refund: Object.entries(chk.refund)
      .filter(([, q]) => q > 0)
      .map(([id, qty]) => ({ id, name: itemName(id), qty })),
    contents,
    ...demolishLossesOf(sim, m, chk),
    upgradeInProgress: m.status !== 'construction' ? (activeUpgrade(m)?.name ?? null) : null,
    tier: moduleTier(m),
  };
}

/** Pérdidas que devuelve `checkDemolishModule` o, si no las trae, una estimación propia. */
function demolishLossesOf(
  sim: Simulation,
  m: ModuleInstance,
  chk: { waterLossL?: number; batteryLossKWh?: number; losses?: string[] },
): Pick<DemolishPreview, 'waterLossL' | 'batteryLossKWh' | 'losses'> {
  if (chk.waterLossL === undefined && chk.batteryLossKWh === undefined && !chk.losses) return estimateLosses(sim, m);
  const est = chk.losses ? null : estimateLosses(sim, m);
  return {
    waterLossL: finite(chk.waterLossL),
    batteryLossKWh: finite(chk.batteryLossKWh),
    losses: chk.losses ? [...chk.losses] : est!.losses,
  };
}

/** Módulos apoyados encima de `m` (en el nivel superior, sobre sus celdas). */
function aboveModules(sim: Simulation, m: ModuleInstance): ModuleInstance[] {
  const cells = moduleCells(m).filter((c) => c.level === m.level);
  return sim.state.ship.modules.filter(
    (o) => o.id !== m.id && o.level === m.level + 1 && moduleCells(o).some((oc) => oc.level === o.level && cells.some((c) => c.x === oc.x && c.z === oc.z)),
  );
}

/** "el almacén", "el almacén y la cocina". */
function namesList(mods: ModuleInstance[]): string {
  const names = [...new Set(mods.map((mm) => withArticle(moduleDef(mm.type).name)))];
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Motivo de no poder desmontar, nombrando lo que sostiene o lo que quedaría aislado. */
function demolishReason(sim: Simulation, m: ModuleInstance, reason: string | null): string | null {
  if (reason === 'Sostiene una estructura del nivel superior') {
    const above = aboveModules(sim, m);
    return above.length ? `Sostiene ${namesList(above)}` : reason;
  }
  if (reason !== 'Dejaría otra zona del barco sin acceso') return reason;
  const ship = sim.state.ship;
  const before = new Set(unreachableModules(ship, true));
  const lost = unreachableModules(ship, true, [], [m.id])
    .filter((id) => !before.has(id))
    .map((id) => ship.modules.find((mm) => mm.id === id))
    .filter((mm): mm is ModuleInstance => !!mm);
  return lost.length ? `Dejaría sin acceso ${namesList(lost)}` : reason;
}

/**
 * Qué hacer para poder desmontar, según el motivo. `aboveRemovable`: lo que tiene encima se
 * puede desmontar (el puente de mando, no).
 */
export function demolishHint(reason: string | null, aboveRemovable = true): string | null {
  if (!reason) return null;
  if (reason.startsWith('Sostiene')) return aboveRemovable ? 'Desmonta antes lo que tiene encima' : null;
  if (reason.startsWith('Una escalera desembarca')) return 'Desmonta antes la escalera que sube a su techo';
  if (reason.startsWith('Dejaría')) return 'Es el único paso: construye antes otro acceso';
  if (reason.includes('arde')) return 'Apaga antes el fuego con el cubo';
  return null;
}

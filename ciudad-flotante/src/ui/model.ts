/**
 * Datos derivados para la interfaz (puro: sin DOM). Lee el estado de la simulación y lo resume
 * para los paneles: comida en almacenes, camas, módulos con problemas, recetas, guardados…
 * Nunca modifica el estado.
 */
import { ITEMS, type ItemDef } from '../data/items';
import { moduleDef } from '../data/modules';
import { NPC_RATES } from '../sim/npc';
import { RECIPE_LIST, type RecipeDef, type StationKind } from '../data/recipes';
import { NEED_RATES } from '../sim/constants';
import { payInventories, storageModules } from '../sim/helpers';
import { countIn, countItem, missingFor, stackLimit } from '../sim/inventory';
import type { SaveSlotInfo } from '../sim/save';
import type { Simulation } from '../sim/Simulation';
import { blueprintName } from '../sim/stations';
import type { ActiveEvent, Inventory, ItemId, ItemStack, ModuleInstance } from '../sim/types';

/* ------------------------------------------------------------------ */
/* Objetos                                                             */
/* ------------------------------------------------------------------ */

export const CATEGORY_NAMES: Record<string, string> = {
  material: 'Material',
  comida: 'Comida',
  bebida: 'Bebida',
  herramienta: 'Herramienta',
  medicina: 'Medicina',
  pieza: 'Repuesto',
  semilla: 'Semilla',
  plano: 'Plano',
  ropa: 'Ropa de abrigo',
  combustible: 'Combustible',
};

const TOOL_USE: Record<string, string> = {
  gancho: 'En la barra rápida: clic hacia los restos que flotan para rescatarlos.',
  cana: 'En la barra rápida: clic desde la borda para lanzar y otra vez cuando pique.',
  cubo: 'En la barra rápida: clic en la borda para llenarlo de agua de mar.',
  cubo_lleno: 'En la barra rápida: clic sobre un fuego para apagarlo. También se destila en la cocina.',
  martillo: 'Mantén E en una obra para ayudar. R repara estructuras (gasta un kit de reparación).',
  llave: 'R repara máquinas averiadas (gasta una pieza mecánica).',
};

export interface Effect {
  label: string;
  value: string;
  tone: 'good' | 'bad' | 'info';
  /** Clave de color (hunger, thirst…) para pintar el valor. */
  need?: string;
}

const NEED_LABEL: Record<string, string> = {
  hunger: 'Hambre',
  thirst: 'Sed',
  energy: 'Energía',
  health: 'Salud',
  warmth: 'Calor',
};

/** Efectos y usos de un objeto, en filas legibles para la descripción emergente. */
export function itemEffects(def: ItemDef, unlocks: readonly string[] = []): Effect[] {
  const out: Effect[] = [];
  const c = def.consume;
  if (c) {
    for (const k of ['hunger', 'thirst', 'energy', 'health', 'warmth'] as const) {
      const v = c[k];
      if (!v) continue;
      out.push({ label: NEED_LABEL[k]!, value: v > 0 ? `+${v}` : `−${-v}`, tone: v > 0 ? 'good' : 'bad', need: k });
    }
    if (c.sickChance) out.push({ label: 'Riesgo de enfermar', value: `${Math.round(c.sickChance * 100)} %`, tone: 'bad' });
    if (c.cures) out.push({ label: 'Cura la enfermedad', value: '✓', tone: 'good' });
  }
  if (def.fuel) out.push({ label: 'Combustible', value: `arde ${def.fuel >= 60 ? `${Math.round(def.fuel / 60)} h` : `${def.fuel} min`}`, tone: 'info' });
  if (def.warmthProtection) out.push({ label: 'Abrigo en cubierta', value: `${Math.round(def.warmthProtection * 100)} %`, tone: 'good' });
  if (def.unlocks) {
    const known = unlocks.includes(def.unlocks);
    out.push({ label: known ? 'Plano ya aprendido' : 'Úsalo para aprender el plano', value: known ? '✓' : '', tone: known ? 'info' : 'good' });
  }
  return out;
}

/** Texto de uso de una herramienta (o null). */
export function toolUse(def: ItemDef): string | null {
  return def.tool ? (TOOL_USE[def.tool] ?? null) : null;
}

/**
 * Verbo de la acción "usar" de un objeto (clic derecho), o null si no se usa directamente.
 * Las herramientas se empuñan también desde la mochila: el inventario las pasa antes a la barra
 * rápida (por eso la ranura ya no cambia el verbo).
 */
export function useVerb(def: ItemDef, _slot: number): string | null {
  if (def.category === 'plano') return 'Estudiar';
  if (def.category === 'ropa') return 'Ponérselo';
  if (def.consume) return def.consume.verb;
  if (def.category === 'herramienta') return 'Empuñar';
  return null;
}

/* ------------------------------------------------------------------ */
/* Recetas                                                             */
/* ------------------------------------------------------------------ */

export interface RecipeRow {
  recipe: RecipeDef;
  locked: boolean;
  /** Se puede pagar ya (con el inventario y los almacenes). */
  affordable: boolean;
  missing: Record<ItemId, number>;
  reason: string | null;
}

/** Recetas de un tipo de estación con su disponibilidad (vista de consulta). */
export function recipeRows(sim: Simulation, station: StationKind): RecipeRow[] {
  const invs = payInventories(sim);
  return RECIPE_LIST.filter((r) => r.station === station).map((recipe) => {
    const locked = !!recipe.unlock && !sim.state.unlocks.includes(recipe.unlock);
    const missing = missingFor(invs, recipe.inputs);
    const affordable = !locked && Object.keys(missing).length === 0;
    const reason = locked ? `Necesitas el ${blueprintName(recipe.unlock!)}` : affordable ? null : 'Faltan ingredientes';
    return { recipe, locked, affordable, missing, reason };
  });
}

export interface IngredientRow {
  id: ItemId;
  need: number;
  /** En el inventario del jugador. */
  carried: number;
  /** Total disponible para pagar (jugador + almacenes + bandejas). */
  have: number;
}

/** Filas "tengo / necesito" de los ingredientes de una receta. */
export function ingredientRows(sim: Simulation, inputs: Record<ItemId, number>): IngredientRow[] {
  const invs = payInventories(sim);
  return Object.entries(inputs).map(([id, need]) => ({
    id,
    need,
    carried: countItem(sim.state.player.inventory, id),
    have: countIn(invs, id),
  }));
}

/* ------------------------------------------------------------------ */
/* Barco                                                               */
/* ------------------------------------------------------------------ */

export interface FoodSummary {
  items: { id: ItemId; qty: number }[];
  /** Puntos de hambre que cubren las reservas. */
  hungerPoints: number;
  /** Bocas que alimentar (jugador + habitantes a bordo o de expedición). */
  crew: number;
  /** Días aproximados de comida al ritmo actual. */
  days: number;
}

/** Comida en almacenes, despensas y en el inventario del jugador. */
export function foodSummary(sim: Simulation): FoodSummary {
  const invs = [sim.state.player.inventory, ...storageModules(sim).map((m) => m.inventory)];
  const items: { id: ItemId; qty: number }[] = [];
  let hungerPoints = 0;
  for (const def of Object.values(ITEMS)) {
    if (def.category !== 'comida') continue;
    const qty = countIn(invs, def.id);
    if (qty <= 0) continue;
    items.push({ id: def.id, qty });
    hungerPoints += qty * Math.max(0, def.consume?.hunger ?? 0);
  }
  const npcs = sim.state.npcs.length;
  const perDay = -NEED_RATES.hungerPerHour * 24 + npcs * Math.abs(NPC_RATES.hungerPerHour) * 24;
  return { items, hungerPoints, crew: npcs + 1, days: perDay > 0 ? hungerPoints / perDay : 0 };
}

export interface BedSummary {
  total: number;
  assigned: number;
  free: number;
  /** Habitantes sin cama asignada. */
  homeless: string[];
}

export function bedSummary(sim: Simulation): BedSummary {
  let total = 0;
  let assigned = 0;
  for (const m of sim.state.ship.modules) {
    if (m.status === 'construction' || !m.beds.length) continue;
    total += m.beds.length;
    assigned += m.beds.filter((b) => b !== null).length;
  }
  const homeless = sim.state.npcs.filter((n) => !n.bed).map((n) => n.name);
  return { total, assigned, free: Math.max(0, total - assigned), homeless };
}

export type IssueKind = 'fire' | 'broken' | 'leak' | 'damaged' | 'construction' | 'wear';

export interface ModuleIssue {
  module: ModuleInstance;
  name: string;
  kind: IssueKind;
  text: string;
  severity: 'danger' | 'warn' | 'info';
}

/** Módulos con fuego, averías, fugas, daños u obras en curso (de más a menos grave). */
export function moduleIssues(sim: Simulation): ModuleIssue[] {
  const out: ModuleIssue[] = [];
  for (const m of sim.state.ship.modules) {
    const name = moduleDef(m.type).name;
    if (m.status === 'construction') {
      out.push({ module: m, name, kind: 'construction', text: `En obras · ${Math.floor(m.buildProgress * 100)} %`, severity: 'info' });
      continue;
    }
    if (m.fire > 0) out.push({ module: m, name, kind: 'fire', text: `¡Ardiendo! (${Math.round(m.fire)} %)`, severity: 'danger' });
    if (m.status === 'broken') out.push({ module: m, name, kind: 'broken', text: m.brokenReason ? `Averiado: ${m.brokenReason}` : 'Averiado', severity: 'danger' });
    if (m.leak) out.push({ module: m, name, kind: 'leak', text: 'Fuga de agua', severity: 'warn' });
    if (m.status !== 'broken' && m.condition < 50) out.push({ module: m, name, kind: 'damaged', text: `Dañado · condición ${Math.round(m.condition)} %`, severity: 'warn' });
  }
  const rank = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

const EVENT_PRIORITY: Record<string, number> = {
  incendio: 0,
  tormenta: 1,
  naufragos: 2,
  fuga: 3,
  averia: 4,
  enfermedad: 5,
  plaga: 6,
  naufragio: 7,
  isla: 8,
  estructura: 9,
  mercante: 10,
  discusion: 11,
  banco_peces: 12,
};

/** Tono visual de un evento. */
export function eventTone(type: string): 'danger' | 'warn' | 'info' | 'good' {
  if (type === 'incendio' || type === 'tormenta') return 'danger';
  if (type === 'fuga' || type === 'averia' || type === 'enfermedad' || type === 'plaga' || type === 'discusion' || type === 'naufragos') return 'warn';
  if (type === 'banco_peces' || type === 'mercante') return 'good';
  return 'info';
}

/** Eventos activos ordenados por urgencia. */
export function sortedEvents(events: readonly ActiveEvent[]): ActiveEvent[] {
  return [...events].sort((a, b) => (EVENT_PRIORITY[a.type] ?? 20) - (EVENT_PRIORITY[b.type] ?? 20) || b.startedAt - a.startedAt);
}

/* ------------------------------------------------------------------ */
/* Guardados                                                           */
/* ------------------------------------------------------------------ */

/** Guardados del más reciente al más antiguo. */
export function sortedSaves(list: readonly SaveSlotInfo[]): SaveSlotInfo[] {
  return [...list].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

/** Guardado más reciente que se puede continuar (legible y con el jugador vivo). */
export function latestPlayableSave(list: readonly SaveSlotInfo[]): SaveSlotInfo | null {
  return sortedSaves(list).find((s) => !s.corrupt && s.alive !== false) ?? null;
}

/* ------------------------------------------------------------------ */
/* Carta náutica                                                       */
/* ------------------------------------------------------------------ */

/** Posición de cada región en la carta del timón (viewBox 360 × 210). */
export const CHART_POS: Record<string, { x: number; y: number }> = {
  templadas: { x: 62, y: 104 },
  sargazos: { x: 140, y: 46 },
  archipielago: { x: 140, y: 154 },
  cementerio: { x: 222, y: 70 },
  boreal: { x: 222, y: 168 },
  tormentas: { x: 300, y: 46 },
  faro: { x: 300, y: 140 },
};

/** Texto de peligro 1..5. */
export function dangerText(d: number): string {
  return ['', 'Tranquilo', 'Moderado', 'Arriesgado', 'Peligroso', 'Muy peligroso'][Math.max(1, Math.min(5, Math.round(d)))]!;
}

/* ------------------------------------------------------------------ */
/* Ordenar inventario                                                  */
/* ------------------------------------------------------------------ */

const SORT_RANK: Record<string, number> = {
  herramienta: 0,
  comida: 1,
  bebida: 2,
  medicina: 3,
  ropa: 4,
  plano: 5,
  semilla: 6,
  combustible: 7,
  pieza: 8,
  material: 9,
};

function compareStacks(a: ItemStack, b: ItemStack): number {
  const da = ITEMS[a.id];
  const db = ITEMS[b.id];
  const ra = SORT_RANK[da?.category ?? ''] ?? 20;
  const rb = SORT_RANK[db?.category ?? ''] ?? 20;
  if (ra !== rb) return ra - rb;
  const n = (da?.name ?? a.id).localeCompare(db?.name ?? b.id, 'es');
  if (n !== 0) return n;
  return b.qty - a.qty;
}

/**
 * Ordena las ranuras [from, to) de un inventario: primero junta las pilas incompletas del mismo
 * objeto y luego las coloca por categoría y nombre, con los huecos al final. No toca el estado
 * directamente: cada paso es `move(origen, destino)` (en la UI, `sim.moveItem`), que fusiona o
 * intercambia. Devuelve el número de movimientos hechos.
 */
export function sortInventory(inv: Inventory, from: number, to: number, move: (a: number, b: number) => boolean): number {
  let moves = 0;
  const end = Math.min(to, inv.slots.length);
  // 1. Juntar pilas incompletas del mismo objeto.
  for (let i = from; i < end; i++) {
    for (let j = i + 1; j < end; j++) {
      const a = inv.slots[i];
      const b = inv.slots[j];
      if (!a || a.qty >= stackLimit(a.id)) break;
      if (b && b.id === a.id && move(j, i)) moves++;
    }
  }
  // 2. Ordenación por selección (cada paso es un intercambio o un traslado a un hueco).
  for (let i = from; i < end; i++) {
    let best = -1;
    for (let j = i; j < end; j++) {
      const s = inv.slots[j];
      if (!s) continue;
      if (best < 0 || compareStacks(s, inv.slots[best]!) < 0) best = j;
    }
    if (best < 0) break;
    if (best !== i && move(best, i)) moves++;
  }
  return moves;
}

/**
 * [AGENTE sim-survival] GUARDADO Y CARGA (docs/SISTEMAS.md §5).
 *
 * - Ranuras: `auto`, `manual`, `manual2`, `manual3` (cualquier nombre simple vale).
 *   Clave `<prefijo>:save:<ranura>` con `{ meta: SaveSlotInfo, state: GameState }`.
 * - `list()` devuelve solo los metadatos (sin validar el estado), ordenados del más reciente al
 *   más antiguo. Las entradas ilegibles aparecen marcadas como dañadas para poder borrarlas.
 * - `deserialize` valida, aplica migraciones por `version` y RELLENA los campos ausentes o con
 *   tipos incorrectos con los de `createNewGame` (fusión profunda). Las listas de módulos,
 *   habitantes, cajas, restos, avistamientos y eventos se rellenan elemento a elemento con una
 *   plantilla de su tipo. Errores claros (`SaveError`) si el guardado está dañado.
 * - Errores de cuota: se reintenta liberando la propia ranura y, si aun así no cabe, se lanza un
 *   `SaveError` de tipo 'quota' sin perder el guardado anterior.
 * - Ronda de contenido 2 (retrocompatible, misma `SAVE_VERSION`): mejoras de módulos (`tier`,
 *   `upgrade`), relaciones entre habitantes (`relations`) e hilo narrativo (`story`). Una partida
 *   anterior a esta ronda se reconoce porque no tiene `story`: se migra con `tier = 1`,
 *   `upgrade = null`, `relations = {}`, la historia por defecto y la hoja 1 del cuaderno (que una
 *   partida nueva lleva en la mochila), con una entrada en el diario. En las partidas actuales esos
 *   campos opcionales se validan si están (nivel dentro de 1..máximo, mejora del nivel siguiente,
 *   afinidades −100..100, hojas 1..7 sin repetir, avance del vivero y de la grúa) y, si faltan,
 *   significan lo mismo que su valor
 *   por defecto (`moduleTier`, `activeUpgrade`), así que una ida y vuelta deja el estado idéntico.
 *   Bandejas y combustible se dimensionan con el nivel de mejora (`moduleStat`): nunca se pierden
 *   objetos de un almacén ampliado.
 */
import { ITEMS } from '../data/items';
import { MODULES } from '../data/modules';
import { REGIONS, START_REGION } from '../data/regions';
import { PAGES_TO_REVEAL, STORY_PAGES } from '../data/story';
import { HOTBAR_SLOTS, PLAYER_SLOTS } from './constants';
import { addItem } from './inventory';
import { maxTier, moduleStat } from './moduleStats';
import { createNewGame, makeNpc } from './newGame';
import { instantiateModule } from './ship';
import { dayOf } from './time';
import type { GameState, Inventory, ModuleInstance, NpcState, Rotation } from './types';
import { SAVE_VERSION } from './types';

/* ------------------------------------------------------------------ */
/* Tipos públicos                                                      */
/* ------------------------------------------------------------------ */

export interface SaveSlotInfo {
  slot: string;
  day: number;
  time: number;
  /** Fecha real del guardado (ms desde 1970). */
  savedAt: number;
  /** Nombre legible de la región ("Aguas Templadas"). */
  region: string;
  /** Etiqueta legible ("Día 3 · Aguas Templadas") o la que dio el jugador. */
  label: string;
  /** Id de la región. */
  regionId?: string;
  /** Nombre de la ranura para la interfaz ("Guardado automático", "Ranura 2"...). */
  slotName?: string;
  /** El jugador seguía vivo al guardar. */
  alive?: boolean;
  /** Versión del formato. */
  version?: number;
  /** La entrada no se puede leer (se puede borrar). */
  corrupt?: boolean;
}

export type SaveErrorKind = 'corrupt' | 'version' | 'quota' | 'unavailable';

/** Error de guardado/carga con un mensaje claro en español. */
export class SaveError extends Error {
  constructor(
    readonly kind: SaveErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SaveError';
  }
}

/** Ranuras estándar. */
export const SAVE_SLOTS = ['auto', 'manual', 'manual2', 'manual3'] as const;

/** Nombre legible de una ranura. */
export function slotName(slot: string): string {
  switch (slot) {
    case 'auto':
      return 'Guardado automático';
    case 'manual':
      return 'Ranura 1';
    case 'manual2':
      return 'Ranura 2';
    case 'manual3':
      return 'Ranura 3';
    default:
      return slot;
  }
}

/** Metadatos de una partida para la lista de guardados. */
export function slotInfo(slot: string, state: GameState, savedAt: number, label?: string): SaveSlotInfo {
  const day = dayOf(state.time);
  const regionId = state.voyage?.regionId ?? START_REGION;
  const region = REGIONS[regionId]?.name ?? regionId;
  return {
    slot,
    day,
    time: state.time,
    savedAt,
    region,
    label: label && label.trim() ? label.trim() : `Día ${day} · ${region}`,
    regionId,
    slotName: slotName(slot),
    alive: state.player?.alive !== false,
    version: state.version,
  };
}

/* ------------------------------------------------------------------ */
/* Serialización                                                       */
/* ------------------------------------------------------------------ */

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/**
 * Lee una partida desde JSON: un estado suelto o un archivo exportado `{ meta, state }`.
 * Valida, migra y rellena los campos ausentes (ver `restoreState`).
 */
export function deserialize(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new SaveError('corrupt', 'La partida guardada está dañada: el archivo no es JSON válido');
  }
  return restoreState(unwrap(raw));
}

/** Partida lista para exportar a un archivo (mismo formato que el almacenamiento local). */
export function exportSave(state: GameState, label?: string): string {
  return `{"meta":${JSON.stringify(slotInfo('export', state, Date.now(), label))},"state":${serialize(state)}}`;
}

/** Extrae el estado de un envoltorio `{ meta, state }` (o devuelve el valor tal cual). */
function unwrap(raw: unknown): unknown {
  return isObj(raw) && 'state' in raw && !('ship' in raw) ? raw['state'] : raw;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

/**
 * Fusión profunda: devuelve `value` con los campos que falten (o tengan un tipo incorrecto)
 * tomados de `def`. Los campos con valor por defecto null aceptan cualquier valor guardado.
 * Las listas guardadas se conservan tal cual (sus elementos se rellenan aparte).
 */
export function fillDefaults(value: unknown, def: unknown): unknown {
  if (def === null || def === undefined) return value === undefined ? def : value;
  if (Array.isArray(def)) return Array.isArray(value) ? value : clone(def);
  if (isObj(def)) {
    if (!isObj(value)) return clone(def);
    for (const k of Object.keys(def)) value[k] = fillDefaults(value[k], def[k]);
    return value;
  }
  if (typeof def === 'number') return isNum(value) ? value : def;
  if (typeof def === 'string') return typeof value === 'string' ? value : def;
  if (typeof def === 'boolean') return typeof value === 'boolean' ? value : def;
  return value === undefined ? def : value;
}

/** Migraciones: `MIGRATIONS[n]` convierte un guardado de la versión n a la n+1. */
const MIGRATIONS: Record<number, (raw: Obj) => void> = {
  // v0: prototipos sin campo `version`. Misma estructura; el relleno completa lo que falte.
  0: () => {},
};

function migrate(raw: Obj): void {
  let v = raw['version'] === undefined ? 0 : raw['version'];
  if (!isNum(v) || !Number.isInteger(v) || v < 0) throw new SaveError('corrupt', 'La partida guardada está dañada: versión de formato no válida');
  if (v > SAVE_VERSION) throw new SaveError('version', 'La partida se guardó con una versión más nueva del juego y no se puede cargar');
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError('version', `No se puede actualizar una partida de la versión ${v}`);
    step(raw);
    v++;
  }
  raw['version'] = SAVE_VERSION;
}

/** Limpia un inventario: pilas válidas de objetos conocidos; tamaño mínimo `minSlots`. */
function sanitizeInventory(inv: unknown, minSlots: number): Inventory {
  const slots = isObj(inv) && Array.isArray(inv['slots']) ? (inv['slots'] as unknown[]) : [];
  const out: Inventory = {
    slots: slots.map((s) => {
      if (!isObj(s) || typeof s['id'] !== 'string' || !ITEMS[s['id']] || !isNum(s['qty']) || s['qty'] <= 0) return null;
      return { id: s['id'], qty: Math.floor(s['qty']) || 1 };
    }),
  };
  while (out.slots.length < minSlots) out.slots.push(null);
  return out;
}

const int = (v: unknown, d: number): number => (isNum(v) ? Math.round(v) : d);

/** Afinidad mínima y máxima entre habitantes (npc.ts). */
const RELATION_LIMIT = 100;

/**
 * Nivel de mejora y mejora en obras de un módulo, y el avance de las máquinas automáticas (vivero,
 * grúa). `fill`: partida anterior a las mejoras (se escriben los valores por defecto); si no, los
 * campos ausentes se dejan ausentes (= nivel 1, sin obra, sin avance).
 */
function sanitizeModuleExtras(m: ModuleInstance, fill: boolean): void {
  const max = maxTier(m.type);
  const raw = m as unknown as Obj;
  if (raw['tier'] !== undefined || fill) {
    const t = isNum(raw['tier']) ? Math.floor(raw['tier']) : 1;
    m.tier = Math.min(max, Math.max(1, t));
  }
  if (raw['upgrade'] !== undefined || fill) {
    const u = raw['upgrade'];
    const tier = m.tier ?? 1;
    const valid = isObj(u) && isNum(u['toTier']) && u['toTier'] === tier + 1 && u['toTier'] <= max && isNum(u['progress']) && m.status !== 'construction';
    m.upgrade = valid ? { toTier: u['toTier'] as number, progress: Math.min(1, Math.max(0, u['progress'] as number)) } : null;
  }
  if (raw['prodProgress'] !== undefined) m.prodProgress = isNum(raw['prodProgress']) ? Math.max(0, raw['prodProgress']) : 0;
  if (raw['prodTarget'] !== undefined) m.prodTarget = isNum(raw['prodTarget']) ? Math.round(raw['prodTarget']) : null;
}

/** Afinidades de un habitante: ids → número finito en −100..100. */
function sanitizeRelations(n: NpcState, fill: boolean): void {
  const raw = (n as unknown as Obj)['relations'];
  if (raw === undefined && !fill) return;
  const out: Record<string, number> = {};
  if (isObj(raw)) {
    for (const [id, v] of Object.entries(raw)) {
      if (id && id !== n.id && isNum(v)) out[id] = Math.min(RELATION_LIMIT, Math.max(-RELATION_LIMIT, v));
    }
  }
  n.relations = out;
}

/** ¿Hay un objeto en algún sitio de la partida (jugador, módulos, cajas, restos)? */
function stateHasItem(s: GameState, id: string): boolean {
  const inInv = (inv: Inventory | null) => !!inv && inv.slots.some((x) => x?.id === id);
  if (inInv(s.player.inventory)) return true;
  if (s.ship.modules.some((m) => inInv(m.inventory) || inInv(m.fuelInv))) return true;
  if (s.crates.some((c) => inInv(c.inventory))) return true;
  return s.debris.some((d) => d.loot.some((l) => l.id === id));
}

/**
 * Partida anterior al hilo narrativo: la hoja 1 del cuaderno (que una partida nueva trae en la
 * mochila) aparece en la mochila del jugador, o en la barra, o en un almacén, o en una caja a sus
 * pies; nunca se pierde. Queda anotado en el diario, diciendo dónde está.
 */
function grantFirstPage(s: GameState): void {
  const item = STORY_PAGES[0]?.item;
  if (!item || !ITEMS[item] || stateHasItem(s, item)) return;
  const slots = s.player.inventory.slots;
  let where: string | null = null;
  let free = slots.findIndex((x, i) => i >= HOTBAR_SLOTS && !x);
  if (free < 0) free = slots.findIndex((x) => !x);
  if (free >= 0) {
    slots[free] = { id: item, qty: 1 };
    where = free >= HOTBAR_SLOTS ? 'en tu mochila' : 'en tu barra rápida';
  } else {
    const store = s.ship.modules.find((m) => m.type === 'almacen' && m.status !== 'construction' && m.inventory && addItem(m.inventory, item, 1) === 0);
    if (store) where = 'en el almacén';
  }
  if (!where) {
    const p = s.player.pos;
    s.crates.push({ id: s.nextId++, pos: { x: p.x, y: p.y, z: p.z }, inventory: { slots: [{ id: item, qty: 1 }] }, label: 'Hoja del cuaderno' });
    where = 'en una caja a tus pies';
  }
  s.log.push({
    at: s.time,
    text: `Ordenando las cartas náuticas del puente aparece una hoja doblada: «${ITEMS[item]!.name}». La tienes ${where}: habrá que leerla.`,
    kind: 'info',
  });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

/** Valida y completa un estado leído de un guardado. */
export function restoreState(raw: unknown): GameState {
  if (!isObj(raw)) throw new SaveError('corrupt', 'La partida guardada está dañada: no contiene un estado de juego');
  if (!isObj(raw['ship']) || !Array.isArray((raw['ship'] as Obj)['modules'])) throw new SaveError('corrupt', 'La partida guardada está dañada: falta el barco');
  if (!isObj(raw['player'])) throw new SaveError('corrupt', 'La partida guardada está dañada: falta el jugador');
  if (!isNum(raw['time']) || (raw['time'] as number) < 0) throw new SaveError('corrupt', 'La partida guardada está dañada: el reloj no es válido');

  migrate(raw);
  // Partida anterior a la ronda de contenido 2 (mejoras, relaciones, hilo narrativo).
  const preStory = !isObj(raw['story']);
  const def = createNewGame(isNum(raw['seed']) ? (raw['seed'] as number) : 12345);
  const s = fillDefaults(raw, def) as GameState;

  // --- Barco: módulos de tipos conocidos, rellenados con una instancia nueva de su tipo.
  s.ship.modules = (s.ship.modules as unknown[])
    .filter((m): m is Obj => isObj(m) && typeof m['type'] === 'string' && !!MODULES[m['type']])
    .map((m) => {
      const type = m['type'] as string;
      const rot = (int(m['rot'], 0) & 3) as Rotation;
      const status = m['status'] === 'construction' || m['status'] === 'broken' ? m['status'] : 'active';
      const tpl = instantiateModule(int(m['id'], 0), type, int(m['level'], 0), int(m['x'], 0), int(m['z'], 0), rot, status);
      const out = fillDefaults(m, tpl) as typeof tpl;
      out.rot = rot;
      out.status = status;
      // Camas y parcelas: tantas como diga la definición actual.
      out.beds = tpl.beds.map((_, i) => {
        const b = out.beds[i];
        return typeof b === 'string' ? b : null;
      });
      out.plots = tpl.plots.map((p, i) => fillDefaults(out.plots[i], p) as typeof p);
      sanitizeModuleExtras(out, preStory);
      // Huecos según el nivel de mejora (un almacén con altillo tiene 32): nunca se recorta lo guardado.
      const storage = moduleStat(out, 'storageSlots');
      const fuel = moduleStat(out, 'fuelSlots');
      out.inventory = storage > 0 ? sanitizeInventory(out.inventory, storage) : null;
      out.fuelInv = fuel > 0 ? sanitizeInventory(out.fuelInv, fuel) : null;
      out.queue = (Array.isArray(out.queue) ? out.queue : []).filter((j) => isObj(j) && typeof j.recipeId === 'string' && isNum(j.progress));
      return out;
    });

  // --- Jugador.
  const p = s.player;
  p.inventory = sanitizeInventory(p.inventory, PLAYER_SLOTS);
  if (p.clothing !== null && (typeof p.clothing !== 'string' || !ITEMS[p.clothing])) p.clothing = null;
  if (p.sleeping !== null && (!isObj(p.sleeping) || !isNum((p.sleeping as unknown as Obj)['bed']))) p.sleeping = null;
  if (p.sleeping) {
    const sl = p.sleeping as unknown as Obj;
    if (!isNum(sl['moduleId'])) sl['moduleId'] = null;
    if (!isNum(sl['until'])) sl['until'] = null;
  }
  if (p.deathCause !== null && typeof p.deathCause !== 'string') p.deathCause = null;

  // --- Habitantes.
  s.npcs = (s.npcs as unknown[])
    .filter((n): n is Obj => isObj(n) && typeof n['id'] === 'string')
    .map((n) => {
      const pos = isObj(n['pos']) ? (n['pos'] as Obj) : {};
      const tpl = makeNpc(
        n['id'] as string,
        typeof n['name'] === 'string' ? n['name'] : 'Habitante',
        'libre',
        typeof n['trait'] === 'string' ? n['trait'] : 'tranquilo',
        { x: isNum(pos['x']) ? pos['x'] : 0, y: isNum(pos['y']) ? pos['y'] : 0, z: isNum(pos['z']) ? pos['z'] : 0 },
        int(n['joinedDay'], 1),
        int(n['joinedDay'], 1),
      );
      const out = fillDefaults(n, tpl) as typeof tpl;
      sanitizeRelations(out, preStory);
      return out;
    });

  // --- Cajas sueltas.
  s.crates = (s.crates as unknown[])
    .filter(isObj)
    .map((c) => {
      const out = fillDefaults(c, { id: 0, pos: { x: 0, y: 0, z: 0 }, inventory: { slots: [] }, label: 'Caja' }) as GameState['crates'][number];
      out.inventory = sanitizeInventory(out.inventory, 0);
      return out;
    })
    .filter((c) => c.inventory.slots.some((sl) => !!sl));

  // --- Restos flotantes.
  s.debris = (s.debris as unknown[])
    .filter(isObj)
    .map((d) => fillDefaults(d, { id: 0, kind: 'tablones', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, loot: [], spin: 0 }) as GameState['debris'][number]);
  for (const d of s.debris) d.loot = d.loot.filter((l) => isObj(l) && typeof l.id === 'string' && !!ITEMS[l.id] && isNum(l.qty) && l.qty > 0);

  // --- Viaje.
  const v = s.voyage;
  if (!REGIONS[v.regionId]) {
    v.regionId = START_REGION;
    v.regionDistance = 0;
    v.regionLength = REGIONS[START_REGION]!.length;
    v.nextChoices = null;
    v.chosenNext = null;
  }
  if (!(v.regionLength > 0)) v.regionLength = REGIONS[v.regionId]!.length;
  v.route = v.route.filter((r) => typeof r === 'string' && !!REGIONS[r]);
  if (!v.route.length) v.route = [v.regionId];
  if (v.nextChoices !== null) {
    v.nextChoices = Array.isArray(v.nextChoices) ? v.nextChoices.filter((r) => typeof r === 'string' && !!REGIONS[r]) : null;
  }
  if (v.chosenNext !== null && (typeof v.chosenNext !== 'string' || !REGIONS[v.chosenNext])) v.chosenNext = null;
  if (v.anchoredUntil !== null && !isNum(v.anchoredUntil)) v.anchoredUntil = null;
  v.sightings = (v.sightings as unknown[])
    .filter(isObj)
    .map((x) => fillDefaults(x, { id: 0, kind: 'naufragio', name: '', expiresAt: 0, side: 1, distance: 120, x: 0, eventId: -1 }) as GameState['voyage']['sightings'][number]);

  // --- Clima.
  const kinds = ['despejado', 'nublado', 'lluvia', 'tormenta', 'niebla'];
  if (!kinds.includes(s.weather.kind)) s.weather.kind = 'despejado';
  if (!kinds.includes(s.weather.next) || (s.weather.kind === 'tormenta' && s.weather.next === 'tormenta')) s.weather.next = 'nublado';

  // --- Eventos.
  s.events.active = (s.events.active as unknown[])
    .filter((e): e is Obj => isObj(e) && typeof e['type'] === 'string')
    .map(
      (e) =>
        fillDefaults(e, { id: 0, type: '', title: '', description: '', startedAt: 0, endsAt: null, stage: 0, objectives: [], choices: [], data: {} }) as GameState['events']['active'][number],
    );
  s.events.scripted = s.events.scripted.filter((x) => typeof x === 'string');
  s.events.history = s.events.history.filter(isObj) as GameState['events']['history'];

  // --- Hilo narrativo: hojas leídas válidas (1..7, sin repetir); el rumbo se conoce con
  // PAGES_TO_REVEAL hojas (o si ya se llegó).
  const story = s.story!;
  story.pages = [...new Set(story.pages.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= STORY_PAGES.length))].sort((a, b) => a - b);
  if (story.arrived || story.pages.length >= PAGES_TO_REVEAL) story.revealed = true;

  // --- Listas simples.
  s.unlocks = s.unlocks.filter((u) => typeof u === 'string');
  s.tutorial.done = s.tutorial.done.filter((u) => typeof u === 'string');
  s.log = s.log.filter((l) => isObj(l) && isNum(l.at) && typeof l.text === 'string').map((l) => ({ ...l, kind: ['info', 'good', 'warn', 'danger'].includes(l.kind) ? l.kind : 'info' }));

  // --- Ids: el siguiente id nunca puede chocar con uno existente.
  let maxId = 0;
  const see = (id: unknown) => {
    if (isNum(id) && id > maxId) maxId = id;
  };
  s.ship.modules.forEach((m) => see(m.id));
  s.crates.forEach((c) => see(c.id));
  s.debris.forEach((d) => see(d.id));
  s.voyage.sightings.forEach((x) => see(x.id));
  s.events.active.forEach((e) => see(e.id));
  s.nextId = Math.max(int(s.nextId, 1), maxId + 1);
  if (preStory) grantFirstPage(s);
  s.rngState = int(s.rngState, s.seed) >>> 0;
  s.version = SAVE_VERSION;
  return s;
}

/* ------------------------------------------------------------------ */
/* Almacén de partidas (localStorage)                                  */
/* ------------------------------------------------------------------ */

export interface SaveStore {
  list(): SaveSlotInfo[];
  save(slot: string, state: GameState, label?: string): void;
  load(slot: string): GameState | null;
  remove(slot: string): void;
}

/** Subconjunto de la API Storage que usamos (permite inyectar uno falso en los tests). */
export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    return ls ?? null;
  } catch {
    return null; // acceso denegado (modo privado estricto, iframes...)
  }
}

function isQuotaError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { name?: string; code?: number };
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014;
}

const SLOT_RE = /^[a-z0-9_-]{1,32}$/i;

/**
 * Almacén de partidas en `localStorage`. `storage` permite inyectar otro almacenamiento; si no se
 * indica se usa `globalThis.localStorage` en el momento de cada llamada.
 */
export function createLocalSaveStore(prefix = 'ciudad-flotante', storage?: StorageLike): SaveStore {
  const base = `${prefix}:save:`;
  const keyOf = (slot: string) => `${base}${slot}`;
  const store = (): StorageLike | null => storage ?? defaultStorage();
  const checkSlot = (slot: string) => {
    if (!SLOT_RE.test(slot)) throw new SaveError('unavailable', `Nombre de ranura no válido: ${slot}`);
  };

  return {
    list(): SaveSlotInfo[] {
      const st = store();
      if (!st) return [];
      const out: SaveSlotInfo[] = [];
      const keys: string[] = [];
      try {
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i);
          if (k && k.startsWith(base)) keys.push(k);
        }
      } catch {
        return [];
      }
      for (const k of keys) {
        const slot = k.slice(base.length);
        let raw: string | null = null;
        try {
          raw = st.getItem(k);
        } catch {
          raw = null;
        }
        if (raw === null) continue;
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!isObj(parsed)) throw new Error('no es un objeto');
          const meta = parsed['meta'];
          if (isObj(meta) && isNum(meta['day']) && isNum(meta['time']) && typeof meta['label'] === 'string') {
            out.push({
              ...(meta as unknown as SaveSlotInfo),
              slot,
              savedAt: isNum(meta['savedAt']) ? meta['savedAt'] : 0,
              region: typeof meta['region'] === 'string' ? meta['region'] : '',
              slotName: slotName(slot),
            });
          } else if (isObj(parsed['state']) && isNum((parsed['state'] as Obj)['time'])) {
            // Guardado sin metadatos (versión antigua): los calculamos del estado.
            out.push(slotInfo(slot, parsed['state'] as unknown as GameState, 0));
          } else {
            throw new Error('sin metadatos');
          }
        } catch {
          out.push({ slot, day: 0, time: 0, savedAt: 0, region: '', label: 'Guardado dañado', slotName: slotName(slot), corrupt: true });
        }
      }
      return out.sort((a, b) => b.savedAt - a.savedAt);
    },

    save(slot: string, state: GameState, label?: string): void {
      checkSlot(slot);
      const st = store();
      if (!st) throw new SaveError('unavailable', 'Este navegador no permite guardar partidas (almacenamiento local desactivado)');
      const payload = `{"meta":${JSON.stringify(slotInfo(slot, state, Date.now(), label))},"state":${serialize(state)}}`;
      const key = keyOf(slot);
      try {
        st.setItem(key, payload);
        return;
      } catch (e) {
        if (!isQuotaError(e)) throw new SaveError('unavailable', `No se pudo guardar la partida: ${e instanceof Error ? e.message : String(e)}`);
      }
      // Sin espacio: liberamos el hueco de la propia ranura y reintentamos; si tampoco cabe,
      // restauramos el guardado anterior para no perderlo.
      let old: string | null = null;
      try {
        old = st.getItem(key);
      } catch {
        old = null;
      }
      if (old !== null) {
        try {
          st.removeItem(key);
          st.setItem(key, payload);
          return;
        } catch {
          try {
            st.setItem(key, old);
          } catch {
            /* no se pudo restaurar: el navegador no deja escribir nada */
          }
        }
      }
      throw new SaveError('quota', 'No queda espacio en el navegador para guardar la partida. Borra alguna partida guardada e inténtalo de nuevo');
    },

    load(slot: string): GameState | null {
      checkSlot(slot);
      const st = store();
      if (!st) return null;
      let raw: string | null;
      try {
        raw = st.getItem(keyOf(slot));
      } catch {
        throw new SaveError('unavailable', 'No se pudo leer el almacenamiento del navegador');
      }
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new SaveError('corrupt', 'La partida guardada está dañada: el archivo no es JSON válido');
      }
      // Formato actual { meta, state }; se aceptan también estados sueltos (versiones antiguas).
      return restoreState(unwrap(parsed));
    },

    remove(slot: string): void {
      if (!SLOT_RE.test(slot)) return;
      const st = store();
      if (!st) return;
      try {
        st.removeItem(keyOf(slot));
      } catch {
        /* nada que borrar */
      }
    },
  };
}

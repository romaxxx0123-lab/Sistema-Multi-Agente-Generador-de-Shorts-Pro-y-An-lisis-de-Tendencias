/**
 * [AGENTE audio] Lógica pura de mezcla: dónde está el oyente (intemperie, habitación, bodega),
 * qué capas de ambiente suenan y con cuánta fuerza, fuentes continuas del barco (máquinas,
 * fogón, incendios, grúa, radar, vivero, ahumadero, sala común), ambiente del puerto,
 * atenuación por distancia, panorama y oclusión.
 *
 * Sin WebAudio ni three.js: se prueba en Node y `Audio`/`Ambience` traducen el resultado a nodos.
 */
import { clamp, lerp, smoothstep } from '../core/math';
import type { NotifyKind } from '../core/EventBus';
import { FINAL_REGION } from '../data/story';
import { GRUA_CYCLE_MIN, GRUA_LIFT_MIN } from '../sim/debris';
import { moduleTier } from '../sim/moduleStats';
import { cellAtPoint, getCell, levelOfY, levelY, moduleCenter, type LayoutCell, type ShipLayout } from '../sim/ship';
import { daylight } from '../sim/time';
import type { GameState, ModuleInstance, NpcState } from '../sim/types';
import { viveroHasRoom } from '../sim/utilities';

/* ------------------------------------------------------------------ */
/* Entorno del oyente                                                  */
/* ------------------------------------------------------------------ */

export type SpaceKind = 'exterior' | 'habitacion' | 'bodega' | 'escalera';
export type Surface = 'cubierta' | 'techo' | 'interior' | 'bodega' | 'escalera';

export interface ListenerEnv {
  kind: SpaceKind;
  level: number;
  /** Módulo de la habitación (o null a la intemperie / bodega abierta). */
  moduleId: number | null;
  /** 0..1: cuánto se oye el exterior (1 = a la intemperie, ~0,1 en una habitación cerrada). */
  exposure: number;
  /** 0..1: lluvia tamborileando en el techo o la cubierta justo encima (solo interiores). */
  roof: number;
  /** Material bajo los pies (pasos). */
  surface: Surface;
  /** Cielo abierto encima (pisadas mojadas con lluvia). */
  sky: boolean;
}

/** Exposición de una habitación cerrada (las ventanas dejan pasar algo). */
/** Habitación de la bodega (sin ventanas). */
const ROOM_EXPOSURE = 0.1;
/** Habitación en cubierta (con ventanas). */
const ROOM_EXPOSURE_UPPER = 0.17;
const HOLD_EXPOSURE = 0.07;
/** Exposición extra máxima junto a un vano de puerta o la boca de una escalera. */
const OPENING_BONUS = 0.34;
const OPENING_RADIUS = 3.6;

const EXTERIOR_ENV: ListenerEnv = { kind: 'exterior', level: 1, moduleId: null, exposure: 1, roof: 0, surface: 'cubierta', sky: true };

function openingBonus(dist: number): number {
  if (dist >= OPENING_RADIUS) return 0;
  const k = 1 - dist / OPENING_RADIUS;
  return OPENING_BONUS * k * k;
}

/** Clasifica el punto del oyente con el layout del barco. Nunca lanza: fuera del barco = intemperie. */
export function listenerEnv(layout: ShipLayout | null, x: number, y: number, z: number): ListenerEnv {
  if (!layout) return { ...EXTERIOR_ENV };
  const cell = cellAtPoint(layout, x, y, z);
  if (!cell || cell.kind === 'void') return { ...EXTERIOR_ENV, level: clamp(Math.round(y / 3.2), 0, 2) };
  const l = cell.level;
  if (cell.sky) {
    const surface: Surface = cell.kind === 'roof' ? 'techo' : cell.kind === 'stairLow' || cell.kind === 'stairHigh' ? 'escalera' : 'cubierta';
    return { kind: 'exterior', level: l, moduleId: null, exposure: 1, roof: 0, surface, sky: true };
  }
  const above = getCell(layout, l + 1, cell.x, cell.z);
  if (cell.kind === 'stairLow' || cell.kind === 'stairHigh') {
    // Escalera desde la bodega: medio abierta a la cubierta.
    return { kind: 'escalera', level: l, moduleId: cell.moduleId, exposure: 0.45, roof: 0.3, surface: 'escalera', sky: false };
  }
  if (cell.kind === 'room') {
    let best = Infinity;
    for (const d of layout.doors) {
      if (d.level !== l) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < best) best = dist;
    }
    const base = l >= 1 ? ROOM_EXPOSURE_UPPER : ROOM_EXPOSURE;
    // Techo: última planta o azotea encima → la lluvia suena justo encima; con otra habitación encima, lejos.
    const roof = !above || above.kind === 'roof' || above.kind === 'void' ? 1 : above.kind === 'room' ? 0.25 : 0.55;
    return {
      kind: l === 0 ? 'bodega' : 'habitacion',
      level: l,
      moduleId: cell.moduleId,
      exposure: clamp(base + openingBonus(best), 0, 0.6),
      roof,
      surface: l === 0 ? 'bodega' : 'interior',
      sky: false,
    };
  }
  // Bodega abierta (nivel 0 sin habitación): la boca de las escaleras deja entrar el exterior.
  let best = Infinity;
  for (const r of layout.ramps) {
    if (r.level !== l) continue;
    const cx = (r.minX + r.maxX) / 2;
    const cz = (r.minZ + r.maxZ) / 2;
    const dist = Math.max(0, Math.hypot(cx - x, cz - z) - 1.2);
    if (dist < best) best = dist;
  }
  const roof = above && above.kind === 'room' ? 0.2 : 0.55;
  return { kind: 'bodega', level: l, moduleId: null, exposure: clamp(HOLD_EXPOSURE + openingBonus(best), 0, 0.5), roof, surface: 'bodega', sky: false };
}

/** Identificador del "espacio acústico" de una celda: exterior, una habitación o la bodega de un nivel. */
export function spaceOf(cell: LayoutCell | null): string {
  if (!cell || !cell.indoor) return 'ext';
  return cell.kind === 'room' ? `r${cell.level}:${cell.moduleId}` : `h${cell.level}`;
}

export function listenerSpace(env: ListenerEnv): string {
  if (env.kind === 'exterior') return 'ext';
  // La escalera de la bodega y la bodega abierta comparten espacio acústico.
  if (env.kind === 'escalera' || (env.kind === 'bodega' && env.moduleId === null)) return `h${env.level}`;
  return `r${env.level}:${env.moduleId}`;
}

/* ------------------------------------------------------------------ */
/* Filtro "desde fuera" según la exposición                            */
/* ------------------------------------------------------------------ */

const EXT_MIN_CUTOFF = 320;
const EXT_MAX_CUTOFF = 18000;

/** Frecuencia de corte del exterior oído desde dentro (exposición 0..1 → 320 Hz..18 kHz, exponencial). */
export function exteriorCutoff(exposure: number): number {
  const e = clamp(exposure, 0, 1);
  return EXT_MIN_CUTOFF * Math.pow(EXT_MAX_CUTOFF / EXT_MIN_CUTOFF, Math.pow(e, 1.25));
}

/** Ganancia del exterior oído desde dentro. */
export function exteriorGain(exposure: number): number {
  return lerp(0.32, 1, clamp(exposure, 0, 1));
}

/* ------------------------------------------------------------------ */
/* Ambiente                                                            */
/* ------------------------------------------------------------------ */

export interface AmbientInput {
  /** Altura de ola (m). */
  waveHeight: number;
  /** 0..1 */
  wind: number;
  /** 0..1 */
  rain: number;
  /** Nudos (0 fondeado). */
  speed: number;
  storm: boolean;
  env: Pick<ListenerEnv, 'exposure' | 'roof' | 'kind'>;
  /** 0..1 presencia de gaviotas (ver `gullPresence`). */
  gulls: number;
  /** Dirección del viento (rad; el oleaje avanza hacia (cos, sin) en x, z) y orientación del oyente. */
  windDir?: number;
  yaw?: number;
  /** 0..1 cercanía de Puerto Esperanza (campanas del puerto y de las boyas). Ver `portPresence`. */
  port?: number;
  /** 0..1 gente en el muelle (murmullo; fiesta = 1). */
  crowd?: number;
}

/**
 * Niveles relativos (0..~1,3) de cada capa; `Ambience` los multiplica por la ganancia de
 * referencia de cada capa, medida para una mezcla equilibrada.
 */
export interface AmbientMix {
  /** Exterior oído desde la posición del oyente. */
  extGain: number;
  extCutoff: number;
  /** Mar de fondo (grave) y rompiente (medios), y su brillo. */
  seaDeep: number;
  seaWash: number;
  seaBright: number;
  /** Profundidad (0..1) y velocidad relativa del oleaje. */
  swellDepth: number;
  swellSpeed: number;
  /** Agua corriendo junto al casco al navegar. */
  hullRush: number;
  /** Retumbo grave del mar contra el casco (bodega). */
  hullRumble: number;
  windBody: number;
  windWhistle: number;
  /** Ráfagas por segundo (velocidad del ruido de ráfagas). */
  gustSpeed: number;
  /** Panorama del viento: se oye llegar del lado de barlovento (−1..1, moderado). */
  windPan: number;
  rainHiss: number;
  rainPatter: number;
  rainRoar: number;
  /** Lluvia en el techo/cubierta encima (interiores) y su filtro. */
  roofRain: number;
  roofCutoff: number;
  /** Eventos por segundo. */
  slapRate: number;
  creakRate: number;
  creakGain: number;
  gullRate: number;
  /** Murmullo del muelle de Puerto Esperanza. */
  portCrowd: number;
  /** Repiques de la campana del puerto y campanadas de las boyas (eventos por segundo). */
  harborBellRate: number;
  buoyBellRate: number;
}

/** Número finito o `fallback` (el estado guardado podría traer valores corruptos). */
function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

export function ambientMix(i: AmbientInput): AmbientMix {
  const wave = clamp(fin(i.waveHeight, 0.6) / 2.6, 0, 1.3);
  const wind = clamp(fin(i.wind, i.wind === Infinity ? 1 : 0), 0, 1);
  const rain = clamp(fin(i.rain, 0), 0, 1);
  const speed = clamp(fin(i.speed, 0), 0, 14);
  const exposure = clamp(fin(i.env.exposure, 1), 0, 1);
  const roof = clamp(fin(i.env.roof, 0), 0, 1);
  const gulls = clamp(fin(i.gulls, 0), 0, 1);
  const port = clamp(fin(i.port ?? 0, 0), 0, 1);
  const crowd = clamp(fin(i.crowd ?? 0, 0), 0, 1);
  const inside = 1 - exposure;
  const hold = i.env.kind === 'bodega';
  return {
    extGain: exteriorGain(exposure),
    extCutoff: exteriorCutoff(exposure),
    seaDeep: 0.4 + 0.6 * wave,
    seaWash: 0.15 + 0.85 * wave,
    seaBright: 650 + 950 * Math.min(1, wave),
    swellDepth: clamp(0.35 + 0.5 * wave, 0, 0.9),
    swellSpeed: 1 + 0.6 * Math.min(1, wave),
    hullRush: clamp(speed / 7, 0, 1.3) * 0.65,
    hullRumble: hold ? (0.55 + 0.45 * Math.min(1, wave)) * inside : 0,
    windBody: Math.pow(wind, 1.25),
    windWhistle: smoothstep(0.5, 1, wind),
    gustSpeed: 0.12 + 0.45 * wind,
    // El viento viene de (−cos d, −sin d); la derecha del oyente es (cos yaw, −sin yaw).
    windPan: Number.isFinite(i.windDir) && Number.isFinite(i.yaw) ? -Math.cos(i.windDir! + i.yaw!) * 0.45 * (0.3 + 0.7 * exposure) : 0,
    rainHiss: Math.pow(rain, 0.8),
    rainPatter: rain,
    rainRoar: rain * rain,
    roofRain: rain * roof * inside,
    roofCutoff: hold ? 520 : 1500,
    slapRate: 0.06 + 0.3 * Math.min(1, wave),
    creakRate: (0.035 + 0.2 * Math.min(1, wave)) * (i.storm ? 1.3 : 1),
    creakGain: lerp(0.5, 1, inside),
    gullRate: gulls * 0.22,
    // Con lluvia la gente se recoge (y la lluvia tapa el resto).
    portCrowd: crowd * (1 - 0.7 * rain),
    harborBellRate: port / 75,
    // La boya suena con el vaivén: más con mar movida.
    buoyBellRate: port * (0.03 + 0.05 * Math.min(1, wave)),
  };
}

/* ------------------------------------------------------------------ */
/* Gaviotas                                                            */
/* ------------------------------------------------------------------ */

/** Gaviotas "de fondo" en cada región (lejos de cualquier isla). */
const REGION_GULLS: Record<string, number> = { archipielago: 0.3, sargazos: 0.12, templadas: 0.06, faro: 0.08, [FINAL_REGION]: 0.65 };

/**
 * Presencia 0..1 de gaviotas: de día, cerca de islas (avistamientos), algo con mercantes,
 * estructuras y bancos de peces; nunca con tormenta ni de noche.
 */
export function gullPresence(state: GameState): number {
  const day = smoothstep(0.15, 0.5, daylight(state.time));
  if (day <= 0) return 0;
  const w = state.weather;
  if (w.kind === 'tormenta') return 0;
  let near = REGION_GULLS[state.voyage.regionId] ?? 0.03;
  for (const s of state.voyage.sightings) {
    const d = Math.hypot(s.x, s.distance);
    const k = s.kind === 'isla' ? 1 : s.kind === 'estructura' ? 0.6 : s.kind === 'mercante' ? 0.45 : s.kind === 'naufragio' ? 0.25 : 0;
    if (k <= 0) continue;
    near = Math.max(near, k * clamp(1 - (d - 90) / 420, 0, 1));
  }
  if (state.events.active.some((e) => e.type === 'banco_peces')) near = Math.max(near, 0.5);
  return clamp(near * day * (1 - 0.85 * clamp(w.rain, 0, 1)), 0, 1);
}

/* ------------------------------------------------------------------ */
/* Puerto Esperanza                                                    */
/* ------------------------------------------------------------------ */

export interface PortPresence {
  /** 0..1 campanas del puerto y de las boyas (aún lejos antes de llegar). */
  port: number;
  /** 0..1 gente en el muelle (de día; de noche, poca; durante la fiesta, mucha). */
  crowd: number;
}

/**
 * Ambiente del puerto: solo en la región de Puerto Esperanza. Antes de la llegada el puerto se
 * oye a lo lejos (campanas, sin gente); después, el muelle está animado de día y casi en
 * silencio de noche, salvo con los fuegos y farolillos de la fiesta (`celebrating`).
 */
export function portPresence(state: GameState, celebrating = false): PortPresence {
  if (state.voyage.regionId !== FINAL_REGION) return { port: 0, crowd: 0 };
  const arrived = !!state.story?.arrived;
  const day = smoothstep(0.15, 0.5, daylight(state.time));
  const port = arrived ? 1 : 0.55;
  let crowd = arrived ? 0.12 + 0.68 * day : 0;
  if (celebrating) crowd = 1;
  return { port, crowd };
}

/* ------------------------------------------------------------------ */
/* Radio y radar                                                       */
/* ------------------------------------------------------------------ */

/**
 * Señal sonora de un aviso según su texto: los mensajes de radio (`'Radio: …'`, events.ts) suenan
 * por el altavoz de la radio; los contactos del radar («El radar detecta…», «El radar marca…»,
 * weather.ts y events.ts), con un ping. null = aviso normal.
 */
export function notifyCue(text: string): 'radio' | 'radar_contacto' | null {
  if (typeof text !== 'string') return null;
  const t = text.trimStart();
  if (/^radio:/i.test(t)) return 'radio';
  if (/\bel radar (detecta|marca)\b/i.test(t)) return 'radar_contacto';
  return null;
}

/* ------------------------------------------------------------------ */
/* Fuentes continuas del barco                                         */
/* ------------------------------------------------------------------ */

export type EmitterKind = 'generador' | 'motor' | 'bomba' | 'torno' | 'fogon' | 'incendio' | 'grua' | 'radar' | 'vivero' | 'ahumadero' | 'sala';

export interface Emitter {
  kind: EmitterKind;
  moduleId: number;
  /** Nivel del módulo (oclusión entre cubiertas). */
  level: number;
  x: number;
  y: number;
  z: number;
  /** 0..1 */
  intensity: number;
  /** Máquina dañada (condición < 50): suena más irregular. */
  rough: boolean;
}

/** Distancia de referencia (m) a la que cada fuente suena a pleno. */
export const EMITTER_REF: Record<EmitterKind, number> = {
  generador: 4,
  motor: 4.5,
  bomba: 2.5,
  torno: 3,
  fogon: 2.2,
  incendio: 5,
  grua: 4,
  radar: 2,
  vivero: 2.2,
  ahumadero: 2.4,
  sala: 3.2,
};
/** Más allá de esta distancia (m) no se oye. */
export const EMITTER_MAX: Record<EmitterKind, number> = {
  generador: 34,
  motor: 36,
  bomba: 18,
  torno: 22,
  fogon: 16,
  incendio: 46,
  grua: 34,
  radar: 14,
  vivero: 16,
  ahumadero: 18,
  sala: 22,
};

const PROP_FOR: Partial<Record<EmitterKind, string>> = {
  generador: 'generador',
  motor: 'motor',
  bomba: 'potabilizadora',
  torno: 'torno',
  fogon: 'fogon',
  grua: 'grua',
  radar: 'radar',
  ahumadero: 'ahumadero',
};

/** Intensidad de la grúa en cada fase (izar con carga es lo más fuerte; recoger cable, un zumbido). */
export const GRUA_LEVEL = { izando: 1, enganchando: 0.75, recargando: 0.35 } as const;

/**
 * Fase audible de la grúa a partir de sus campos guardados (debris.ts): izando la carga,
 * recogiendo cable, lanzando el gancho o parada (null: sin energía, apagada, tormenta o
 * esperando restos a su alcance).
 */
export function craneSoundPhase(state: GameState, m: ModuleInstance): keyof typeof GRUA_LEVEL | null {
  if (m.type !== 'grua' || m.status !== 'active' || m.fire > 0 || !m.on || !m.powered) return null;
  if (state.weather.kind === 'tormenta') return null;
  const raw = (m as ModuleInstance & { prodProgress?: number }).prodProgress;
  const w = Number.isFinite(raw) ? Math.max(0, raw!) : GRUA_LIFT_MIN;
  if (w < GRUA_LIFT_MIN && w < GRUA_CYCLE_MIN) return 'izando';
  if (w < GRUA_CYCLE_MIN) return 'recargando';
  const target = (m as ModuleInstance & { prodTarget?: number | null }).prodTarget;
  return typeof target === 'number' ? 'enganchando' : null;
}

/** Habitante a bordo y despierto (no de expedición ni durmiendo). */
function awakeAboard(n: NpcState): boolean {
  return n.awayUntil === null && n.activity !== 'away' && n.activity !== 'sleeping';
}

/** Ocupación de una sala común: habitantes despiertos dentro y cuántos juegan a la mesa. */
export interface LoungeInfo {
  moduleId: number;
  level: number;
  /** Centro de la sala (murmullo). */
  x: number;
  y: number;
  z: number;
  people: number;
  players: number;
  /** Mesa de juegos (cartas) y estufa del nivel 2 (en la estantería; null sin estufa). */
  table: { x: number; y: number; z: number } | null;
  stove: { x: number; y: number; z: number } | null;
}

export function loungeInfo(state: GameState, layout: ShipLayout | null): LoungeInfo[] {
  const out: LoungeInfo[] = [];
  const width = state.ship.width;
  for (const m of state.ship.modules) {
    if (m.type !== 'sala_comun' || m.status !== 'active' || m.fire > 0) continue;
    let people = 0;
    let players = 0;
    for (const n of state.npcs) {
      if (!awakeAboard(n)) continue;
      const cell = layout ? cellAtPoint(layout, n.pos.x, n.pos.y + 0.3, n.pos.z) : null;
      const inside = cell ? cell.moduleId === m.id && cell.kind === 'room' : n.task?.targetModuleId === m.id && n.activity !== 'walking';
      if (!inside) continue;
      people++;
      if (n.task?.kind === 'ocio' && n.task.data?.['anim'] === 'jugar' && n.activity !== 'walking') players++;
    }
    const c = moduleCenter(m, width);
    const prop = (kind: string): { x: number; y: number; z: number } | null => {
      const p = layout?.props.find((pp) => pp.moduleId === m.id && pp.kind === kind);
      return p ? { x: p.x, y: p.y + Math.min(1, p.height * 0.5), z: p.z } : null;
    };
    const shelf = prop('estanteria_libros');
    out.push({
      moduleId: m.id,
      level: m.level,
      x: c.x,
      y: c.y + 1.2,
      z: c.z,
      people,
      players,
      table: prop('mesa_juegos') ?? { x: c.x, y: c.y + 0.8, z: c.z },
      stove: moduleTier(m) >= 2 ? (shelf ? { ...shelf, y: c.y + 0.5 } : { x: c.x, y: c.y + 0.5, z: c.z }) : null,
    });
  }
  return out;
}

function sailing(state: GameState): boolean {
  const a = state.voyage.anchoredUntil;
  return a === null || a <= state.time;
}

/**
 * Fuentes de sonido continuas a partir del estado (solo campos del contrato):
 * generador funcionando (`powered`), motor navegando, potabilizadora llenando, torno con cola,
 * fogón encendido (cocina `powered`), incendios (`fire`), grúa trabajando (`craneSoundPhase`),
 * radar encendido, aireadores del vivero (con energía y sitio en la bandeja), ahumadero con
 * encargos, y la sala común con gente (murmullo; estufa del nivel 2).
 */
export function collectEmitters(state: GameState, layout: ShipLayout | null): Emitter[] {
  const out: Emitter[] = [];
  const width = state.ship.width;
  const waterRoom = state.utilities.water.capacityL - state.utilities.waterL;
  const propPos = (m: ModuleInstance, kind: EmitterKind): { x: number; y: number; z: number } => {
    const pk = PROP_FOR[kind];
    if (pk && layout) {
      const p = layout.props.find((pp) => pp.moduleId === m.id && pp.kind === pk);
      if (p) return { x: p.x, y: p.y + Math.min(1.2, p.height * 0.6), z: p.z };
    }
    const c = moduleCenter(m, width);
    return { x: c.x, y: c.y + 1, z: c.z };
  };
  for (const m of state.ship.modules) {
    if (m.fire > 0) {
      const c = moduleCenter(m, width);
      out.push({ kind: 'incendio', moduleId: m.id, level: m.level, x: c.x, y: c.y + 1.2, z: c.z, intensity: clamp(m.fire / 100, 0.15, 1), rough: false });
    }
    if (m.status !== 'active' || m.fire > 0) continue;
    let kind: EmitterKind | null = null;
    switch (m.type) {
      case 'generador':
        if (m.on && m.powered) kind = 'generador';
        break;
      case 'motor':
        if (m.on && m.powered && sailing(state)) kind = 'motor';
        break;
      case 'potabilizadora':
        if (m.on && m.powered && waterRoom > 0.5) kind = 'bomba';
        break;
      case 'taller':
        if (m.on && m.powered && m.queue.length > 0) kind = 'torno';
        break;
      case 'cocina':
        if (m.powered) kind = 'fogon';
        break;
      case 'grua': {
        const phase = craneSoundPhase(state, m);
        if (phase) {
          // En la pluma, algo por encima de la cubierta.
          const p = propPos(m, 'grua');
          out.push({ kind: 'grua', moduleId: m.id, level: m.level, x: p.x, y: p.y + 1.2, z: p.z, intensity: GRUA_LEVEL[phase], rough: m.condition < 50 });
        }
        continue;
      }
      case 'radar':
        if (m.on && m.powered) kind = 'radar';
        break;
      case 'vivero': {
        // Con la bandeja llena las bombas paran (utilities.ts): no burbujea.
        if (!m.on || !m.powered || !viveroHasRoom(m)) continue;
        const tanks = layout ? layout.props.filter((pp) => pp.moduleId === m.id && pp.kind === 'tanque_peces') : [];
        if (!tanks.length) {
          const c = moduleCenter(m, width);
          out.push({ kind: 'vivero', moduleId: m.id, level: m.level, x: c.x, y: c.y + 0.8, z: c.z, intensity: 1, rough: m.condition < 50 });
        }
        for (const t of tanks) out.push({ kind: 'vivero', moduleId: m.id, level: m.level, x: t.x, y: t.y + Math.min(1, t.height * 0.7), z: t.z, intensity: 0.75, rough: m.condition < 50 });
        continue;
      }
      case 'ahumadero':
        if (m.queue.length > 0) kind = 'ahumadero';
        break;
      default:
        break;
    }
    if (!kind) continue;
    const p = propPos(m, kind);
    out.push({ kind, moduleId: m.id, level: m.level, ...p, intensity: 1, rough: m.condition < 50 });
  }
  for (const l of loungeInfo(state, layout)) {
    // Conversación: hacen falta al menos dos; con más gente, más animada.
    if (l.people >= 2) out.push({ kind: 'sala', moduleId: l.moduleId, level: l.level, x: l.x, y: l.y, z: l.z, intensity: clamp(0.5 + 0.17 * (l.people - 2), 0.5, 1), rough: false });
    // La estufa del nivel 2 arde siempre que la sala esté en uso (como se ve en la vista).
    if (l.stove) out.push({ kind: 'fogon', moduleId: l.moduleId, level: l.level, ...l.stove, intensity: 0.55, rough: false });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Espacialización                                                     */
/* ------------------------------------------------------------------ */

export interface Listener {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Panorama −1 (izquierda) .. 1 (derecha) de una fuente según la orientación del oyente. */
export function panFor(l: Listener, sx: number, sz: number): number {
  const dx = sx - l.x;
  const dz = sz - l.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return 0;
  // Derecha del oyente: (cos yaw, −sin yaw) en (x, z).
  const right = (dx * Math.cos(l.yaw) - dz * Math.sin(l.yaw)) / d;
  return clamp(right * 0.85 * smoothstep(0.25, 1.6, d), -1, 1);
}

/** 0..1: cuánto queda la fuente a la espalda del oyente (para apagar un poco los agudos). */
export function behindFor(l: Listener, sx: number, sz: number): number {
  const dx = sx - l.x;
  const dz = sz - l.z;
  const d = Math.hypot(dx, dz);
  if (d < 1) return 0;
  const fwd = (-dx * Math.sin(l.yaw) - dz * Math.cos(l.yaw)) / d;
  return clamp(-fwd, 0, 1);
}

/** Atenuación por distancia (inversa con referencia) que se desvanece del todo en `maxDist`. */
export function distanceGain(d: number, ref: number, maxDist: number): number {
  if (!Number.isFinite(d)) return 0;
  const near = d <= ref ? 1 : ref / (ref + 1.1 * (d - ref));
  return near * (1 - smoothstep(maxDist * 0.65, maxDist, d));
}

export interface Occlusion {
  gain: number;
  cutoff: number;
}

/** Por encima de esta altura (m), fuera del casco, una fuente está en el cielo (fuegos artificiales). */
const SKY_Y = levelY(3) + 1;

/**
 * Cubierta de una fuente para la oclusión. Lo que suena en el cielo lejos del barco (fuegos) es
 * exterior a la altura del oyente: entra por las ventanas como el mar, sin atravesar cubiertas.
 */
export function sourceLevel(cell: LayoutCell | null, y: number, listenerLevel: number): number {
  if (!cell && y > SKY_Y) return listenerLevel;
  return levelOfY(y - 0.5);
}

/**
 * Oclusión entre el oyente y una fuente: paredes, suelos y cubiertas apagan y oscurecen.
 * @param srcCell celda de la fuente (null = en el agua o fuera del barco).
 */
export function occlusion(env: ListenerEnv, srcCell: LayoutCell | null, srcLevel: number): Occlusion {
  const ls = listenerSpace(env);
  const ss = spaceOf(srcCell);
  let gain = 1;
  let cutoff = 20000;
  if (ls === ss) {
    // Mismo espacio; aun así, distinto nivel exterior (cubierta superior / principal) apaga un poco.
    if (ss === 'ext' && Math.abs(srcLevel - env.level) >= 1) {
      gain = 0.8;
      cutoff = 9000;
    }
  } else if (ss === 'ext') {
    gain = exteriorGain(env.exposure);
    cutoff = exteriorCutoff(env.exposure);
  } else if (ls === 'ext') {
    // Fuera escuchando algo de dentro: las paredes tienen puertas y ventanas.
    gain = 0.5;
    cutoff = 1300;
  } else {
    gain = 0.38;
    cutoff = 850;
  }
  const dl = Math.abs(srcLevel - env.level);
  if (dl >= 1 && ls !== ss) {
    gain *= dl >= 2 ? 0.35 : 0.6;
    cutoff = Math.min(cutoff, dl >= 2 ? 420 : 700);
  }
  return { gain, cutoff };
}

/* ------------------------------------------------------------------ */
/* Avisos, herramientas y deduplicación                                 */
/* ------------------------------------------------------------------ */

const NOTIFY_PRIORITY: Record<NotifyKind, number> = { info: 0, good: 1, warn: 2, danger: 3 };

/** El aviso más importante de una ráfaga (se suena uno solo). */
export function topNotify(kinds: readonly NotifyKind[]): NotifyKind | null {
  let best: NotifyKind | null = null;
  for (const k of kinds) if (best === null || NOTIFY_PRIORITY[k] > NOTIFY_PRIORITY[best]) best = k;
  return best;
}

/**
 * Efectos 'sfx' que ya acompañan a cada herramienta (si alguno sonó en el mismo frame, el
 * `toolUsed` no añade nada para no duplicar).
 */
export const TOOL_FAMILY: Record<string, readonly string[]> = {
  martillo: ['martillo', 'reparar', 'obra_iniciada', 'obra_terminada'],
  llave: ['llave', 'reparar'],
  gancho: ['gancho', 'gancho_impulso', 'tirar_cabo', 'chapoteo', 'recoger', 'recoger_resto', 'rescate'],
  cana: ['cana', 'carrete', 'picada', 'escapado', 'pez', 'pesca_basura', 'chapoteo_corcho', 'chapoteo'],
  cubo: ['chapoteo', 'llenar_cubo'],
  cubo_lleno: ['agua_fuego', 'apagar', 'chapoteo'],
  cubo_agua: ['agua_fuego', 'apagar', 'chapoteo'],
};

/**
 * Sonido de respaldo para un `toolUsed` sin efecto propio en el mismo frame (null = nada).
 * El inicio suena a "blandir"; el golpe y el fallo tienen su propio carácter.
 */
export function toolFallback(tool: string, phase: 'start' | 'hit' | 'success' | 'fail', frameSfx: ReadonlySet<string>): string | null {
  const fam = TOOL_FAMILY[tool] ?? [];
  if (fam.some((n) => frameSfx.has(n))) return null;
  switch (phase) {
    case 'start':
      return tool === 'martillo' || tool === 'llave' ? 'blandir' : tool.startsWith('cubo') ? 'blandir_cubo' : null;
    case 'hit':
      return tool === 'martillo' ? 'martillo' : tool === 'llave' ? 'llave' : null;
    case 'success':
      return null;
    case 'fail':
      return 'herramienta_falla';
    default:
      return null;
  }
}

/** Efectos que ya expresan "has conseguido algo" (si suenan, `itemGained` no añade otro). */
export const GAIN_SFX = new Set([
  'recoger',
  'recoger_resto',
  'rescate',
  'pez',
  'pesca_basura',
  'cosechar',
  'comercio',
  'fabricado',
  'fabricar',
  'cocinado',
  'llenar',
  'llenar_cubo',
  'expedicion_vuelve',
  'ui_mover',
]);

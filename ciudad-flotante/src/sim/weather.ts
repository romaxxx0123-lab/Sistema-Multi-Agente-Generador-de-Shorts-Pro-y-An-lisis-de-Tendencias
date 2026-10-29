/**
 * [AGENTE sim-survival] CLIMA DINÁMICO (docs/SISTEMAS.md §2).
 *
 * Máquina de estados: despejado, nublado, lluvia, tormenta y niebla. Cada estado dura un tiempo
 * aleatorio (ver `WEATHER_DURATION`) y el siguiente se elige con los pesos de la región actual,
 * sin dos tormentas seguidas. El siguiente clima se decide al empezar el actual (`weather.next`)
 * para que el barómetro pueda avisar con antelación.
 *
 * Los parámetros visuales/físicos (nubes, lluvia, niebla, viento, ola) se suavizan hacia el
 * objetivo del clima actual (≈ 1/30 por minuto). La temperatura del aire sigue la fórmula
 * `base región + 5·sol − 4·lluvia − 3·viento`, con la base de la región suavizada para que el
 * cambio de región no dé saltos bruscos.
 *
 * Los avisos menores de cambio de clima (lluvia, niebla, cielo despejado o nublado) no se muestran
 * mientras el jugador duerme: a ×14 serían una lluvia de mensajes que nadie lee. La tormenta, su
 * final y el barómetro sí (quedan en el diario).
 *
 * Con un radar y radio funcionando (`isRadarActive`), el frente de tormenta se ve en la pantalla
 * del radar con `RADAR_STORM_LEAD` minutos (3 h) de antelación: el aviso llega entonces y la
 * lectura del barómetro dice cuánto falta.
 *
 * Estado transitorio (no se guarda): aviso del barómetro ya dado, antelación del aviso, rumbo
 * objetivo del viento y base de temperatura suavizada. Se reconstruye al cargar.
 */
import { approach, clamp, wrapAngle } from '../core/math';
import { REGIONS, START_REGION, type RegionDef } from '../data/regions';
import type { Simulation } from './Simulation';
import { sunElevation } from './time';
import type { WeatherKind, WeatherState } from './types';
import { isRadarActive } from './utilities';

/* ------------------------------------------------------------------ */
/* Datos de equilibrio                                                 */
/* ------------------------------------------------------------------ */

export const WEATHER_KINDS: readonly WeatherKind[] = ['despejado', 'nublado', 'lluvia', 'tormenta', 'niebla'];

/** Duración (minutos de juego) de cada clima: [mínimo, máximo]. */
export const WEATHER_DURATION: Record<WeatherKind, readonly [number, number]> = {
  despejado: [240, 600],
  nublado: [180, 420],
  lluvia: [90, 240],
  tormenta: [90, 180],
  niebla: [120, 300],
};

export interface WeatherTarget {
  cloudiness: number;
  rain: number;
  fog: number;
  wind: number;
  /** Altura de ola característica (m). */
  waveHeight: number;
}

/** Valores objetivo de cada clima (los parámetros se suavizan hacia ellos). */
export const WEATHER_TARGETS: Record<WeatherKind, WeatherTarget> = {
  despejado: { cloudiness: 0.15, rain: 0, fog: 0, wind: 0.3, waveHeight: 0.6 },
  nublado: { cloudiness: 0.7, rain: 0, fog: 0.1, wind: 0.45, waveHeight: 0.9 },
  lluvia: { cloudiness: 0.9, rain: 0.7, fog: 0.2, wind: 0.55, waveHeight: 1.2 },
  tormenta: { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, waveHeight: 2.6 },
  niebla: { cloudiness: 0.6, rain: 0, fog: 0.85, wind: 0.15, waveHeight: 0.5 },
};

/** Nombres para la interfaz. */
export const WEATHER_NAMES: Record<WeatherKind, string> = {
  despejado: 'Despejado',
  nublado: 'Nublado',
  lluvia: 'Lluvia',
  tormenta: 'Tormenta',
  niebla: 'Niebla',
};

/** Fracción del camino hacia el objetivo que se recorre por minuto de juego. */
const SMOOTH_PER_MIN = 1 / 30;
/** Minutos que tarda la transición visual (`blend`) en completarse. */
const BLEND_MINUTES = 30;
/** °C por minuto a los que la base de temperatura se acerca a la de la región nueva. */
const BASE_TEMP_RATE = 0.12;
/** Relámpagos: probabilidad por minuto durante una tormenta ya formada. */
const LIGHTNING_PER_MIN = 0.15;
/** Lluvia mínima para que la tormenta descargue rayos (cuando ya se ha formado). */
const LIGHTNING_MIN_RAIN = 0.5;
/** Duración del destello (minutos de juego). */
const LIGHTNING_FLASH = 0.4;
/** Antelación del aviso del barómetro (minutos antes de la tormenta). */
const BAROMETER_LEAD: readonly [number, number] = [60, 90];
/** Con el radar en marcha, el frente de tormenta se detecta esta antelación (min). */
export const RADAR_STORM_LEAD = 180;
/** Giro del viento (rad/min) en calma y en tormenta. */
const WIND_TURN_RATE = 0.01;
const WIND_TURN_RATE_STORM = 0.03;

/* ------------------------------------------------------------------ */
/* Estado transitorio por simulación                                   */
/* ------------------------------------------------------------------ */

interface WeatherMemo {
  /** Ya se avisó de la tormenta que viene. */
  warned: boolean;
  /** Minutos de antelación con los que avisar de la próxima tormenta. */
  lead: number;
  /** Dirección hacia la que gira el viento. */
  windTarget: number;
  /** Región observada en el último tick (para reconsiderar el pronóstico al cambiar). */
  region: string | null;
  /** Temperatura base suavizada (°C). */
  baseTemp: number | null;
}

const memos = new WeakMap<Simulation, WeatherMemo>();

function memoOf(sim: Simulation): WeatherMemo {
  let m = memos.get(sim);
  if (!m) {
    const w = sim.state.weather;
    m = {
      warned: false,
      lead: (BAROMETER_LEAD[0] + BAROMETER_LEAD[1]) / 2,
      windTarget: Number.isFinite(w.windDir) ? w.windDir : 0,
      region: null,
      baseTemp: null,
    };
    memos.set(sim, m);
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function isKind(k: unknown): k is WeatherKind {
  return typeof k === 'string' && (WEATHER_KINDS as readonly string[]).includes(k);
}

/** Región actual (con respaldo si el id no existe). */
function regionOf(sim: Simulation): RegionDef {
  return REGIONS[sim.state.voyage.regionId] ?? REGIONS[START_REGION]!;
}

/** Duración aleatoria de un clima. */
export function rollDuration(sim: Simulation, kind: WeatherKind): number {
  const [a, b] = WEATHER_DURATION[kind];
  return sim.rng.range(a, b);
}

/**
 * Elige el clima siguiente al actual con los pesos de la región.
 * Nunca devuelve 'tormenta' si el actual ya es tormenta.
 */
export function chooseNextWeather(sim: Simulation, current: WeatherKind, regionId?: string): WeatherKind {
  const region = (regionId && REGIONS[regionId]) || regionOf(sim);
  const weights: Partial<Record<WeatherKind, number>> = { ...region.weather };
  if (current === 'tormenta') weights.tormenta = 0;
  const k = sim.rng.weighted(weights);
  return k ?? (current === 'despejado' ? 'nublado' : 'despejado');
}

/** Temperatura del aire (°C) con una base dada. */
export function airTemperature(base: number, time: number, rain: number, wind: number): number {
  return base + 5 * clamp(sunElevation(time), -1, 1) - 4 * rain - 3 * wind;
}

/** Mensaje al cambiar de clima (null = no merece aviso). `collectors`: hay colectores de lluvia a bordo. */
function transitionMessage(prev: WeatherKind, next: WeatherKind, collectors = true): { text: string; kind: 'info' | 'good' | 'warn' | 'danger'; log: boolean } | null {
  if (prev === next) return null;
  if (next === 'tormenta') return { text: '¡Estalla la tormenta! Ponte a cubierto y vigila el barco', kind: 'danger', log: true };
  if (prev === 'tormenta') return { text: 'La tormenta amaina. Revisa los daños del barco', kind: 'good', log: true };
  switch (next) {
    case 'lluvia':
      return { text: collectors ? 'Empieza a llover: los colectores recogen agua' : 'Empieza a llover', kind: 'info', log: false };
    case 'niebla':
      return { text: 'Un banco de niebla envuelve el barco', kind: 'info', log: false };
    case 'despejado':
      return { text: 'El cielo se despeja', kind: 'info', log: false };
    case 'nublado':
      return prev === 'despejado' ? { text: 'El cielo se cubre de nubes', kind: 'info', log: false } : null;
    default:
      return null;
  }
}

/** Empieza el clima `kind`: duración nueva, pronóstico del siguiente y aviso. */
function beginWeather(sim: Simulation, kind: WeatherKind, carry: number): void {
  const w = sim.state.weather;
  const memo = memoOf(sim);
  const prev = w.kind;
  w.kind = kind;
  w.remaining = rollDuration(sim, kind) + carry;
  w.next = chooseNextWeather(sim, kind);
  w.blend = prev === kind ? w.blend : 0;
  memo.warned = false;
  memo.lead = sim.rng.range(BAROMETER_LEAD[0], BAROMETER_LEAD[1]);
  // El viento rola un poco (mucho más con tormenta).
  const swing = kind === 'tormenta' ? 1.5 : 0.8;
  memo.windTarget = wrapAngle(w.windDir + sim.rng.range(-swing, swing));
  const collectors = sim.state.ship.modules.some((m) => m.type === 'colector' && m.status === 'active');
  const msg = transitionMessage(prev, kind, collectors);
  if (msg) {
    if (msg.log) sim.log(msg.text, msg.kind);
    else if (!sim.state.player.sleeping) sim.notify(msg.text, msg.kind);
  }
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

export function tickWeather(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  const w = st.weather;
  const memo = memoOf(sim);
  const region = regionOf(sim);

  // Protección ante estados raros (guardados antiguos o manipulados).
  if (!isKind(w.kind)) w.kind = 'despejado';
  if (!isKind(w.next) || (w.kind === 'tormenta' && w.next === 'tormenta')) w.next = chooseNextWeather(sim, w.kind);
  if (!Number.isFinite(w.remaining)) w.remaining = rollDuration(sim, w.kind);

  // Cambio de región: el pronóstico se recalcula con los pesos nuevos
  // (salvo una tormenta ya anunciada por el barómetro, que llega igualmente).
  if (memo.region !== region.id) {
    if (memo.region !== null && !(w.next === 'tormenta' && memo.warned)) w.next = chooseNextWeather(sim, w.kind, region.id);
    memo.region = region.id;
  }

  // Avance del reloj del clima y transiciones.
  w.remaining -= dt;
  let guard = 0;
  while (w.remaining <= 0 && guard++ < 8) beginWeather(sim, w.next, w.remaining);

  // Barómetro: aviso único 60–90 min antes de una tormenta (3 h antes con el radar en marcha).
  if (!memo.warned && w.next === 'tormenta' && w.kind !== 'tormenta') {
    const radar = isRadarActive(sim);
    if (w.remaining <= (radar ? Math.max(RADAR_STORM_LEAD, memo.lead) : memo.lead)) {
      memo.warned = true;
      if (radar) {
        sim.log(`El radar detecta un frente de tormenta y el barómetro empieza a caer: llegará en ${etaText(w.remaining)}. Prepara el barco y busca refugio`, 'warn');
      } else {
        sim.log('El barómetro cae en picado: se acerca una tormenta. Prepara el barco y busca refugio', 'warn');
      }
    }
  }

  // Suavizado de parámetros hacia el objetivo.
  const t = WEATHER_TARGETS[w.kind];
  const k = 1 - Math.pow(1 - SMOOTH_PER_MIN, dt);
  w.cloudiness = clamp(lerpSafe(w.cloudiness, t.cloudiness, k), 0, 1);
  w.rain = clamp(lerpSafe(w.rain, t.rain, k), 0, 1);
  w.fog = clamp(lerpSafe(w.fog, t.fog, k), 0, 1);
  w.wind = clamp(lerpSafe(w.wind, t.wind, k), 0, 1);
  w.waveHeight = Math.max(0, lerpSafe(w.waveHeight, t.waveHeight, k));
  w.blend = clamp(approach(Number.isFinite(w.blend) ? w.blend : 1, 1, dt / BLEND_MINUTES), 0, 1);

  // Dirección del viento: gira despacio hacia el objetivo.
  if (!Number.isFinite(w.windDir)) w.windDir = 0;
  const rate = (w.kind === 'tormenta' ? WIND_TURN_RATE_STORM : WIND_TURN_RATE) * dt;
  const diff = wrapAngle(memo.windTarget - w.windDir);
  w.windDir = wrapAngle(w.windDir + clamp(diff, -rate, rate));

  // Temperatura del aire.
  memo.baseTemp = memo.baseTemp === null || !Number.isFinite(memo.baseTemp) ? region.baseTemp : approach(memo.baseTemp, region.baseTemp, BASE_TEMP_RATE * dt);
  w.temperature = airTemperature(memo.baseTemp, st.time, w.rain, w.wind);

  // Relámpagos.
  w.lightning = Math.max(0, (Number.isFinite(w.lightning) ? w.lightning : 0) - dt);
  if (w.kind === 'tormenta' && w.rain >= LIGHTNING_MIN_RAIN) {
    const p = 1 - Math.pow(1 - LIGHTNING_PER_MIN, dt);
    if (sim.rng.chance(p)) {
      w.lightning = LIGHTNING_FLASH;
      const ang = sim.rng.range(0, Math.PI * 2);
      const dist = sim.rng.range(150, 520);
      sim.bus.emit('sfx', { name: 'trueno', x: Math.cos(ang) * dist, y: 80, z: Math.sin(ang) * dist });
    }
  }
}

/** «unas tres horas», «una hora», «menos de una hora» (antelación de un aviso). */
export function etaText(minutes: number): string {
  if (!(minutes >= 45)) return 'menos de una hora';
  const h = Math.max(1, Math.round(minutes / 60));
  if (h === 1) return 'una hora';
  const words = ['', '', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];
  return `unas ${words[h] ?? String(h)} horas`;
}

function lerpSafe(cur: number, target: number, k: number): number {
  const c = Number.isFinite(cur) ? cur : target;
  return c + (target - c) * k;
}

/* ------------------------------------------------------------------ */
/* Consultas y utilidades para otras capas                             */
/* ------------------------------------------------------------------ */

export interface BarometerReading {
  /** Tendencia de la presión. */
  trend: 'sube' | 'estable' | 'baja' | 'tormenta';
  /** Texto para la interfaz. */
  text: string;
  /** Clima previsto. */
  next: WeatherKind;
  /** Minutos que faltan para el cambio (aprox.). */
  inMinutes: number;
  /** Hay un radar en marcha (la lectura incluye lo que ve en pantalla). */
  radar: boolean;
}

/** Lectura del barómetro para el puente y el HUD. */
export function barometer(sim: Simulation): BarometerReading {
  const w = sim.state.weather;
  const inMinutes = Math.max(0, Math.round(w.remaining));
  const radar = isRadarActive(sim);
  if (w.kind === 'tormenta') return { trend: 'tormenta', text: 'Tormenta en curso', next: w.next, inMinutes, radar };
  if (w.next === 'tormenta') {
    if (radar && w.remaining <= RADAR_STORM_LEAD) return { trend: 'baja', text: `Radar: frente de tormenta, llegará en ${etaText(w.remaining)}`, next: w.next, inMinutes, radar };
    const close = w.remaining <= 180;
    return { trend: 'baja', text: close ? 'Cae en picado: tormenta en camino' : 'Bajando: empeorará', next: w.next, inMinutes, radar };
  }
  const rank: Record<WeatherKind, number> = { despejado: 0, niebla: 1, nublado: 1, lluvia: 2, tormenta: 3 };
  const d = rank[w.next] - rank[w.kind];
  if (d > 0) return { trend: 'baja', text: 'Bajando: empeorará', next: w.next, inMinutes, radar };
  if (d < 0) return { trend: 'sube', text: 'Subiendo: mejorará', next: w.next, inMinutes, radar };
  return { trend: 'estable', text: 'Estable', next: w.next, inMinutes, radar };
}

/** Nombre legible del clima actual. */
export function weatherName(kind: WeatherKind): string {
  return WEATHER_NAMES[kind] ?? kind;
}

/**
 * Fuerza un clima (depuración, pruebas y eventos guionizados). Con `instant` los parámetros
 * saltan directamente a su objetivo.
 */
export function forceWeather(sim: Simulation, kind: WeatherKind, minutes?: number, instant = false): void {
  const w: WeatherState = sim.state.weather;
  beginWeather(sim, kind, 0);
  if (minutes !== undefined && Number.isFinite(minutes)) w.remaining = Math.max(1, minutes);
  if (instant) {
    const t = WEATHER_TARGETS[kind];
    w.cloudiness = t.cloudiness;
    w.rain = t.rain;
    w.fog = t.fog;
    w.wind = t.wind;
    w.waveHeight = t.waveHeight;
    w.blend = 1;
  }
}

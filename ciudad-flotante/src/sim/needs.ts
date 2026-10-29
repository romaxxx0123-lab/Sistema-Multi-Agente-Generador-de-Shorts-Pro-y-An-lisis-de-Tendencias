/**
 * [AGENTE sim-survival] SUPERVIVENCIA DEL JUGADOR (docs/SISTEMAS.md §1).
 *
 * Cada paso de simulación:
 *  1. Hambre y sed bajan (a la mitad durmiendo).
 *  2. Energía: baja despierto; sube durmiendo (cama/camilla +15/h, suelo +8/h).
 *  3. Calor corporal: tiende (30/h) a un objetivo según el entorno: temperatura del aire,
 *     interior (+12), junto a la cocina encendida (+10), lluvia y viento a la intemperie y abrigo.
 *  4. Enfermedad: cuenta atrás en horas (el doble de rápido en una enfermería con energía).
 *  5. Salud: daño por hambre, sed, frío, enfermedad, agotamiento y fuego cercano; regenera si
 *     todo está bien (×3 en camilla de enfermería encendida y con energía; sin ella, como una
 *     cama normal). A 0 → muerte con causa.
 *  6. Desmayo: energía a 0 → 3 h dormido en el suelo.
 *  7. Despertar automático con motivo: descansado de día o por una emergencia real (fuego a bordo,
 *     inicio de tormenta, hambre o sed críticas, salud en peligro, un golpe que le hiere). Los
 *     demás sucesos (avistamientos, averías, fugas...) no le despiertan: se anotan y, al
 *     despertar, se resumen en un aviso «Mientras dormías: …». Un evento puede forzar o impedir
 *     el despertar con `data.wakePlayer`.
 *  8. Avisos con histéresis (una vez al cruzar el umbral; se rearman al recuperarse). Al
 *     despertar, el hambre y la sed se avisan en el mismo mensaje del despertar.
 *
 * El estado transitorio (avisos dados, clima anterior, eventos conocidos, última causa de daño,
 * lo ocurrido durante el sueño) vive en un WeakMap por simulación: no se guarda y se reconstruye
 * al cargar.
 */
import type { NotifyKind } from '../core/EventBus';
import { approach, clamp } from '../core/math';
import { ITEMS } from '../data/items';
import { MODULES } from '../data/modules';
import { CELL, NEED_RATES } from './constants';
import { findModule } from './helpers';
import { cellAtPoint, cellMin, levelOfY, moduleCells } from './ship';
import type { Simulation } from './Simulation';
import { hourOf } from './time';
import type { ActiveEvent, ModuleInstance, Needs, Vec3, WeatherKind } from './types';
import { isHealingBedPowered, withArticle } from './utilities';
import { regionWithArticle } from './voyage';

/* ------------------------------------------------------------------ */
/* Parámetros de equilibrio                                            */
/* ------------------------------------------------------------------ */

/** Horas que dura una enfermedad sin tratar. */
export const SICK_HOURS = 18;
/** Minutos que dura un desmayo por agotamiento. */
export const FAINT_MINUTES = 180;
/** Radio (m) del calor de una cocina encendida. */
export const STOVE_RADIUS = 4;
/** Radio (m) a partir del que un incendio quema al jugador. */
export const FIRE_RADIUS = 1.5;
export const FIRE_DAMAGE_PER_HOUR = 10;
/** Multiplicador de regeneración en una camilla de enfermería. */
export const INFIRMARY_REGEN_MULT = 3;
/** Multiplicador de la recuperación de la enfermedad descansando en la enfermería. */
export const INFIRMARY_SICK_MULT = 2;
/** Energía a partir de la que el jugador se despierta descansado (de día). */
export const WAKE_ENERGY = 98;
export const WAKE_HOUR_FROM = 6;
export const WAKE_HOUR_TO = 20;
/** Hambre/sed por debajo de la que el jugador se despierta (y no puede dormirse). */
export const CRITICAL_NEED = 8;
/** Salud por debajo de la que el jugador se despierta si la está perdiendo. */
export const CRITICAL_HEALTH = 25;
/** Calor por debajo del cual el frío hace daño. */
export const COLD_HARM_BELOW = 20;
/** Protección de referencia del abrigo (la fórmula da +12 °C con esta protección). */
const COAT_REFERENCE = 0.6;
/** Margen por encima del umbral para rearmar un aviso. */
const WARN_REARM = 5;

/**
 * Eventos del mundo que despiertan al jugador cuando empiezan si el propio evento no dice otra cosa
 * (`data.wakePlayer`): solo las emergencias reales. El resto se resume al despertar.
 */
const WAKE_EVENTS = new Set(['incendio', 'tormenta']);
/** Eventos que siguen pidiendo atención al despertar (el resumen se muestra como advertencia). */
const PENDING_CRISES = new Set(['averia', 'incendio', 'fuga', 'plaga', 'enfermedad', 'discusion', 'naufragio', 'isla', 'estructura', 'naufragos', 'mercante']);
/** Avistamientos: si acaban sin éxito, se han perdido de vista. */
const SIGHTINGS = new Set(['naufragio', 'isla', 'estructura', 'naufragos', 'mercante', 'banco_peces']);
/** Sucesos menores que no merecen mención si ya han terminado al despertar. */
const MINOR_EVENTS = new Set(['banco_peces']);
/** Sucesos que se nombran como mucho en el resumen del despertar (el resto, «y N más»). */
const NIGHT_SUMMARY_MAX = 4;

/** Causas de muerte (texto que ve el jugador). */
export const DEATH_CAUSES = {
  hunger: 'Moriste de hambre',
  thirst: 'Moriste de sed',
  cold: 'Moriste de frío',
  sickness: 'La enfermedad acabó contigo',
  exhaustion: 'Moriste de agotamiento',
  fire: 'Moriste en un incendio',
  wounds: 'Moriste por tus heridas',
} as const;

export type HarmKind = keyof typeof DEATH_CAUSES;

/* ------------------------------------------------------------------ */
/* Estado transitorio                                                  */
/* ------------------------------------------------------------------ */

/** Evento empezado mientras el jugador dormía (sin despertarle). */
interface NightEvent {
  id: number;
  type: string;
  title: string;
  startedAt: number;
  data: Record<string, unknown>;
}

/** Lo ocurrido durante el sueño, para el resumen del despertar. */
interface NightLog {
  /** Región en la que se acostó. */
  regionId: string;
  events: NightEvent[];
}

interface NeedsMemo {
  /** Avisos ya dados (claves de `WARN_RULES`). */
  flags: Set<string>;
  /** Última causa de daño (para atribuir la muerte si la salud llega a 0 por otro sistema). */
  lastCause: string | null;
  /** Clima del tick anterior (para detectar el inicio de una tormenta). */
  prevWeather: WeatherKind | null;
  /** Ids de eventos activos conocidos (null hasta el primer tick). */
  knownEvents: Set<number> | null;
  /** Sucesos de la noche en curso (null despierto). */
  night: NightLog | null;
}

const memos = new WeakMap<Simulation, NeedsMemo>();

function memoOf(sim: Simulation): NeedsMemo {
  let m = memos.get(sim);
  if (!m) memos.set(sim, (m = { flags: new Set(), lastCause: null, prevWeather: null, knownEvents: null, night: null }));
  return m;
}

/* ------------------------------------------------------------------ */
/* Entorno                                                             */
/* ------------------------------------------------------------------ */

export interface WarmthEnvironment {
  /** Temperatura del aire (°C). */
  airTemp: number;
  /** El jugador está en un interior (habitación o bodega). */
  indoor: boolean;
  /** A ≤ 4 m de una cocina encendida. */
  nearStove: boolean;
  /** Protección del abrigo equipado (0..1). */
  coat: number;
  /** Temperatura efectiva que siente el jugador (°C). */
  effectiveTemp: number;
  /** Calor corporal hacia el que tiende (0..100). */
  target: number;
}

/** Cocina con el fogón encendido (lo fija stations.ts en `powered`). */
function stoveLit(m: ModuleInstance): boolean {
  return m.type === 'cocina' && m.status === 'active' && m.powered;
}

/** ¿Hay una cocina encendida a ≤ STOVE_RADIUS del punto? */
export function nearLitStove(sim: Simulation, pos: Vec3): boolean {
  const lit = new Set<number>();
  for (const m of sim.state.ship.modules) if (stoveLit(m)) lit.add(m.id);
  if (!lit.size) return false;
  for (const p of sim.layout.props) {
    if (p.kind !== 'fogon' || !lit.has(p.moduleId)) continue;
    if (Math.abs(p.y - pos.y) > 2) continue;
    if (Math.hypot(p.x - pos.x, p.z - pos.z) <= STOVE_RADIUS) return true;
  }
  return false;
}

/** Distancia en planta de un punto a un rectángulo. */
function distToRect(px: number, pz: number, minX: number, minZ: number, maxX: number, maxZ: number): number {
  const dx = Math.max(minX - px, 0, px - maxX);
  const dz = Math.max(minZ - pz, 0, pz - maxZ);
  return Math.hypot(dx, dz);
}

/** Módulo en llamas a menos de FIRE_RADIUS del punto (mismo nivel), o null. */
export function fireNear(sim: Simulation, pos: Vec3): ModuleInstance | null {
  const level = levelOfY(pos.y);
  const width = sim.state.ship.width;
  for (const m of sim.state.ship.modules) {
    if (!(m.fire > 0)) continue;
    for (const c of moduleCells(m)) {
      if (c.level !== level) continue;
      const mn = cellMin(c.x, c.z, width);
      if (distToRect(pos.x, pos.z, mn.x, mn.z, mn.x + CELL, mn.z + CELL) < FIRE_RADIUS) return m;
    }
  }
  return null;
}

/** ¿Arde algo a bordo? */
export function fireAboard(sim: Simulation): boolean {
  return sim.state.ship.modules.some((m) => m.fire > 0);
}

/** Calcula el entorno térmico del jugador y su calor objetivo (fórmula de SISTEMAS.md §1). */
export function warmthEnvironment(sim: Simulation): WarmthEnvironment {
  const p = sim.state.player;
  const w = sim.state.weather;
  const cell = cellAtPoint(sim.layout, p.pos.x, p.pos.y, p.pos.z);
  const indoor = !!cell && cell.indoor;
  const nearStove = nearLitStove(sim, p.pos);
  const coat = p.clothing ? clamp(ITEMS[p.clothing]?.warmthProtection ?? 0, 0, 1) : 0;
  const air = Number.isFinite(w.temperature) ? w.temperature : 20;
  let t = air;
  if (indoor) t += 12;
  if (nearStove) t += 10;
  if (!indoor) {
    t -= 6 * clamp(w.rain, 0, 1) + 4 * clamp(w.wind, 0, 1);
    t += (12 * coat) / COAT_REFERENCE;
  }
  return { airTemp: air, indoor, nearStove, coat, effectiveTemp: t, target: clamp(t * 3.2 + 10, 0, 100) };
}

/**
 * Dónde duerme el jugador (null si está despierto). Una camilla de enfermería solo cuenta como
 * 'infirmary' (curación ×3) si la enfermería funciona: activa, encendida y con energía
 * (`utilities.isHealingBedPowered`); si no, es una cama normal ('bed').
 */
export function sleepSpot(sim: Simulation): { kind: 'bed' | 'infirmary' | 'floor'; module: ModuleInstance | null } | null {
  const s = sim.state.player.sleeping;
  if (!s) return null;
  if (s.moduleId === null) return { kind: 'floor', module: null };
  const m = sim.state.ship.modules.find((mm) => mm.id === s.moduleId) ?? null;
  const def = m ? MODULES[m.type] : undefined;
  if (!m || !def?.beds) return { kind: 'floor', module: m };
  return { kind: def.healingBeds && isHealingBedPowered(sim, m) ? 'infirmary' : 'bed', module: m };
}

/* ------------------------------------------------------------------ */
/* Salud                                                               */
/* ------------------------------------------------------------------ */

export interface Harm {
  kind: HarmKind;
  /** Puntos de salud por hora. */
  perHour: number;
}

/** Fuentes de daño activas ahora mismo. */
export function activeHarms(sim: Simulation): Harm[] {
  const p = sim.state.player;
  const n = p.needs;
  const R = NEED_RATES;
  const out: Harm[] = [];
  if (n.hunger <= 0) out.push({ kind: 'hunger', perHour: R.starvingDamagePerHour });
  if (n.thirst <= 0) out.push({ kind: 'thirst', perHour: R.dehydrationDamagePerHour });
  if (n.warmth < COLD_HARM_BELOW) out.push({ kind: 'cold', perHour: (R.coldDamagePerHour * (COLD_HARM_BELOW - n.warmth)) / COLD_HARM_BELOW });
  if (p.sick > 0) out.push({ kind: 'sickness', perHour: R.sickDamagePerHour });
  if (n.energy <= 0) out.push({ kind: 'exhaustion', perHour: R.exhaustedDamagePerHour });
  if (fireNear(sim, p.pos)) out.push({ kind: 'fire', perHour: FIRE_DAMAGE_PER_HOUR });
  return out;
}

/** Condiciones para regenerar salud (sin fuentes de daño). */
export function canRegenerate(sim: Simulation): boolean {
  const p = sim.state.player;
  const n = p.needs;
  return n.hunger > 40 && n.thirst > 40 && n.energy > 15 && n.warmth > 30 && p.sick <= 0;
}

/** Variación de salud por hora en las condiciones actuales (negativa = pierde salud). */
export function healthRatePerHour(sim: Simulation): number {
  const harms = activeHarms(sim);
  if (harms.length) return -harms.reduce((a, h) => a + h.perHour, 0);
  if (!canRegenerate(sim)) return 0;
  const spot = sleepSpot(sim);
  return NEED_RATES.healthRegenPerHour * (spot?.kind === 'infirmary' ? INFIRMARY_REGEN_MULT : 1);
}

/** Mata al jugador con una causa (texto). Idempotente. */
export function killPlayer(sim: Simulation, cause: string): void {
  const p = sim.state.player;
  if (!p.alive) return;
  p.alive = false;
  p.needs.health = 0;
  p.deathCause = cause;
  p.sleeping = null;
  memoOf(sim).night = null;
  const days = p.stats.daysSurvived;
  const tail = days <= 0 ? 'No llegaste a completar el primer día a bordo.' : `Sobreviviste ${days} ${days === 1 ? 'día' : 'días'} a bordo.`;
  sim.log(`${cause}. ${tail}`, 'danger', false);
  sim.bus.emit('playerDied', { cause });
}

/**
 * Daño al jugador desde otros sistemas (eventos, heridas...). `cause` es el texto de la causa de
 * muerte si este daño le mata (p. ej. 'Moriste en el naufragio').
 */
export function damagePlayer(sim: Simulation, amount: number, cause: string = DEATH_CAUSES.wounds): void {
  const p = sim.state.player;
  if (!p.alive || !(amount > 0)) return;
  memoOf(sim).lastCause = cause;
  p.needs.health -= amount;
  if (p.needs.health <= 0) {
    killPlayer(sim, cause);
    return;
  }
  // Un golpe despierta a quien duerme (no a quien está inconsciente: eso lo decide `checkWake`).
  if (p.sleeping && p.sleeping.until === null) wakePlayer(sim, 'Te despiertas de golpe: ¡algo te ha herido!', 'danger');
}

/* ------------------------------------------------------------------ */
/* Estado legible para la interfaz                                     */
/* ------------------------------------------------------------------ */

export interface PlayerCondition {
  id: string;
  /** Texto corto ("Enfermo (12 h)", "A cubierto"). */
  label: string;
  kind: NotifyKind;
}

/**
 * Condiciones actuales del jugador como etiquetas para el HUD (de más a menos urgentes):
 * peligros, molestias y ventajas del entorno.
 */
export function playerConditions(sim: Simulation): PlayerCondition[] {
  const p = sim.state.player;
  if (!p.alive) return [];
  const n = p.needs;
  const out: PlayerCondition[] = [];
  const env = warmthEnvironment(sim);
  const s = p.sleeping;
  if (s) out.push(s.until !== null ? { id: 'inconsciente', label: 'Inconsciente', kind: 'danger' } : { id: 'durmiendo', label: 'Durmiendo', kind: 'info' });
  if (fireNear(sim, p.pos)) out.push({ id: 'quemandose', label: 'Te quemas', kind: 'danger' });
  if (n.thirst <= 0) out.push({ id: 'deshidratado', label: 'Deshidratado', kind: 'danger' });
  else if (n.thirst < 25) out.push({ id: 'sediento', label: 'Sediento', kind: 'warn' });
  if (n.hunger <= 0) out.push({ id: 'famelico', label: 'Famélico', kind: 'danger' });
  else if (n.hunger < 25) out.push({ id: 'hambriento', label: 'Hambriento', kind: 'warn' });
  if (n.warmth < COLD_HARM_BELOW) out.push({ id: 'congelado', label: 'Congelándote', kind: 'danger' });
  else if (n.warmth < 30) out.push({ id: 'frio', label: 'Frío', kind: 'warn' });
  if (p.sick > 0) out.push({ id: 'enfermo', label: `Enfermo (${Math.ceil(p.sick)} h)`, kind: 'warn' });
  if (!s && n.energy < 20) out.push({ id: 'agotado', label: 'Agotado', kind: 'warn' });
  if (!env.indoor && sim.state.weather.rain > 0.3) out.push({ id: 'mojado', label: env.coat > 0 ? 'Lluvia (abrigado)' : 'Mojándote', kind: env.coat > 0 ? 'info' : 'warn' });
  else if (!env.indoor && env.coat > 0 && env.airTemp < 15) out.push({ id: 'abrigado', label: 'Abrigado', kind: 'good' });
  if (env.nearStove) out.push({ id: 'fogon', label: 'Junto al fogón', kind: 'good' });
  else if (env.indoor) out.push({ id: 'cubierto', label: 'A cubierto', kind: 'info' });
  const rate = healthRatePerHour(sim);
  if (rate > 0 && n.health < 100) out.push({ id: 'recuperando', label: 'Recuperándote', kind: 'good' });
  return out;
}

/* ------------------------------------------------------------------ */
/* Sueño                                                               */
/* ------------------------------------------------------------------ */

/**
 * Despierta al jugador (si dormía) con un motivo. Si al levantarse tiene hambre o sed, se dice en
 * el mismo aviso (y no se repite aparte); después llega el resumen de lo ocurrido mientras dormía.
 * Devuelve true si estaba dormido.
 */
export function wakePlayer(sim: Simulation, reason: string | null, kind: NotifyKind = 'info'): boolean {
  const p = sim.state.player;
  if (!p.sleeping) return false;
  p.sleeping = null;
  if (reason) {
    const needsNote = wakeNeedsNote(sim, reason);
    sim.notify(needsNote ? `${reason}. ${needsNote}` : reason, kind);
  }
  flushNight(sim);
  sim.bus.emit('sfx', { name: 'despertar', x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
  return true;
}

/**
 * «Tienes hambre y sed: come y bebe algo» si al despertar el hambre o la sed están por debajo del
 * aviso (y no se había avisado ya). Marca esos avisos como dados para no repetirlos en otro mensaje.
 * Si el propio motivo ya habla del hambre o la sed, solo se marcan.
 */
function wakeNeedsNote(sim: Simulation, reason: string): string | null {
  const memo = memoOf(sim);
  const n = sim.state.player.needs;
  const hungry = n.hunger < 25 && !memo.flags.has('hambre25');
  const thirsty = n.thirst < 25 && !memo.flags.has('sed25');
  if (hungry) memo.flags.add('hambre25');
  if (thirsty) memo.flags.add('sed25');
  if (/hambre/.test(reason)) {
    memo.flags.add('hambre25');
    if (n.hunger < 10) memo.flags.add('hambre10');
  }
  if (/sed\b/.test(reason)) {
    memo.flags.add('sed25');
    if (n.thirst < 10) memo.flags.add('sed10');
  }
  const h = hungry && !/hambre/.test(reason);
  const t = thirsty && !/sed\b/.test(reason);
  if (h && t) return 'Tienes hambre y sed: come y bebe algo';
  if (h) return 'Tienes hambre: come algo pronto';
  if (t) return 'Tienes sed: bebe agua potable';
  return null;
}

/* ------------------------------------------------------------------ */
/* Resumen de la noche                                                 */
/* ------------------------------------------------------------------ */

/** Frase (en pasado, sin mayúscula inicial) de un suceso ocurrido mientras dormía. */
function nightEventPhrase(sim: Simulation, ev: NightEvent): string {
  switch (ev.type) {
    case 'naufragio':
      return 'se avistó un naufragio';
    case 'isla':
      return 'se avistó una isla';
    case 'estructura':
      return 'se avistó una estructura misteriosa';
    case 'naufragos':
      return 'apareció una balsa con náufragos';
    case 'mercante':
      return 'se acercó un barco mercante';
    case 'banco_peces':
      return 'un banco de peces rodeó el barco';
    case 'averia': {
      const id = ev.data['moduleId'];
      const m = typeof id === 'number' ? findModule(sim, id) : undefined;
      const name = m ? (MODULES[m.type]?.name ?? null) : ev.title.replace(/^Avería:\s*/i, '') || null;
      return name ? `hubo una avería en ${withArticle(name)}` : 'hubo una avería';
    }
    case 'fuga':
      return 'se abrió una fuga en el depósito';
    case 'plaga':
      return 'apareció una plaga en el huerto';
    case 'enfermedad': {
      const name = ev.data['name'];
      return typeof name === 'string' && name ? `${name} enfermó` : 'alguien de la tripulación enfermó';
    }
    case 'discusion':
      return 'hubo una discusión a bordo';
    case 'incendio':
      return 'hubo un incendio a bordo';
    case 'tormenta':
      return 'hubo una tormenta';
    default:
      return ev.title.charAt(0).toLowerCase() + ev.title.slice(1);
  }
}

/** Une frases: «a», «a y b», «a, b y c». */
function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Texto del resumen de lo ocurrido mientras dormía (null si no pasó nada digno de mención). */
export function nightSummary(sim: Simulation, night: NightLog): { text: string; kind: NotifyKind } | null {
  const st = sim.state;
  const parts: string[] = [];
  let pending = false;
  const isActive = (ev: NightEvent): boolean => st.events.active.some((e: ActiveEvent) => e.id === ev.id);
  const events = night.events.filter((ev) => !MINOR_EVENTS.has(ev.type) || isActive(ev));
  for (const ev of events.slice(0, NIGHT_SUMMARY_MAX)) {
    let phrase = nightEventPhrase(sim, ev);
    const active = isActive(ev);
    if (active) {
      if (PENDING_CRISES.has(ev.type)) pending = true;
    } else {
      const end = [...st.events.history].reverse().find((h) => h.type === ev.type && h.title === ev.title && h.at >= ev.startedAt);
      if (end?.success) phrase += ' (ya se resolvió)';
      else phrase += SIGHTINGS.has(ev.type) ? ' (ya se perdió de vista)' : ' (ya pasó)';
    }
    parts.push(phrase);
  }
  const extra = events.length - NIGHT_SUMMARY_MAX;
  if (extra > 0) parts.push(`${extra} ${extra === 1 ? 'cosa más' : 'cosas más'}`);
  if (st.voyage.regionId !== night.regionId) parts.push(`entramos en ${regionWithArticle(st.voyage.regionId)}`);
  if (!parts.length) return null;
  const tail = events.length ? '. Los detalles están en el diario (J)' : '';
  return { text: `Mientras dormías: ${joinList(parts)}${tail}`, kind: pending ? 'warn' : 'info' };
}

/** Avisa de lo ocurrido durante el sueño (una vez) y lo olvida. */
function flushNight(sim: Simulation): void {
  const memo = memoOf(sim);
  const night = memo.night;
  memo.night = null;
  if (!night || !sim.state.player.alive) return;
  const sum = nightSummary(sim, night);
  if (sum) sim.notify(sum.text, sum.kind);
}

/** Desmayo por agotamiento: duerme FAINT_MINUTES en el suelo donde esté. */
function faint(sim: Simulation): void {
  const p = sim.state.player;
  p.needs.energy = 0;
  p.sleeping = { moduleId: null, bed: -1, until: sim.state.time + FAINT_MINUTES };
  sim.log('Te desmayas de agotamiento. Pasarás unas horas inconsciente en el suelo…', 'danger');
  sim.bus.emit('sfx', { name: 'desmayo', x: p.pos.x, y: p.pos.y, z: p.pos.z });
}

/* ------------------------------------------------------------------ */
/* Avisos                                                              */
/* ------------------------------------------------------------------ */

interface WarnRule {
  key: string;
  get: (n: Needs) => number;
  below: number;
  kind: NotifyKind;
  text: (sim: Simulation) => string;
}

const WARN_RULES: readonly WarnRule[] = [
  { key: 'hambre25', get: (n) => n.hunger, below: 25, kind: 'warn', text: () => 'Tienes hambre: come algo pronto' },
  { key: 'hambre10', get: (n) => n.hunger, below: 10, kind: 'danger', text: () => '¡Te mueres de hambre! Come algo ya o perderás salud' },
  { key: 'sed25', get: (n) => n.thirst, below: 25, kind: 'warn', text: () => 'Tienes sed: bebe agua potable' },
  { key: 'sed10', get: (n) => n.thirst, below: 10, kind: 'danger', text: () => '¡Te estás deshidratando! Bebe agua cuanto antes' },
  { key: 'energia20', get: (n) => n.energy, below: 20, kind: 'warn', text: () => 'Estás agotado: duerme en una cama antes de desmayarte' },
  {
    key: 'calor30',
    get: (n) => n.warmth,
    below: 30,
    kind: 'warn',
    text: (sim) => {
      const env = warmthEnvironment(sim);
      if (env.indoor) return 'Tienes frío incluso a cubierto: acércate a la cocina encendida';
      if (env.coat <= 0) return 'Tienes frío: ponte a cubierto, junto a la cocina encendida, o abrígate';
      return 'Tienes frío: busca un interior o la cocina encendida';
    },
  },
  { key: 'salud30', get: (n) => n.health, below: 30, kind: 'danger', text: () => 'Tu salud es crítica: come, bebe, abrígate y descansa' },
];

function checkWarnings(sim: Simulation, memo: NeedsMemo): void {
  const n = sim.state.player.needs;
  for (const r of WARN_RULES) {
    const v = r.get(n);
    if (v < r.below) {
      if (!memo.flags.has(r.key)) {
        memo.flags.add(r.key);
        sim.notify(r.text(sim), r.kind);
      }
    } else if (v >= r.below + WARN_REARM) {
      memo.flags.delete(r.key);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

export function tickNeeds(sim: Simulation, dt: number): void {
  const st = sim.state;
  const p = st.player;
  if (!p.alive || dt <= 0) return;
  const memo = memoOf(sim);
  const hours = dt / 60;
  const n = p.needs;
  const R = NEED_RATES;

  // Saneado de valores corruptos.
  n.hunger = finiteOr(n.hunger, 50);
  n.thirst = finiteOr(n.thirst, 50);
  n.energy = finiteOr(n.energy, 50);
  n.health = finiteOr(n.health, 50);
  n.warmth = finiteOr(n.warmth, 60);
  p.sick = Math.max(0, finiteOr(p.sick, 0));

  const spot = sleepSpot(sim);
  const asleep = !!spot;
  const metabolism = asleep ? 0.5 : 1;

  // 1. Hambre y sed.
  n.hunger = clamp(n.hunger + R.hungerPerHour * metabolism * hours, 0, 100);
  n.thirst = clamp(n.thirst + R.thirstPerHour * metabolism * hours, 0, 100);

  // 2. Energía.
  let energyRate = R.energyPerHourAwake;
  if (spot) energyRate = spot.kind === 'floor' ? R.energyPerHourFloor : R.energyPerHourBed;
  n.energy = clamp(n.energy + energyRate * hours, 0, 100);

  // 3. Calor corporal.
  const env = warmthEnvironment(sim);
  n.warmth = clamp(approach(n.warmth, env.target, R.warmthRatePerHour * hours), 0, 100);

  // 4. Enfermedad.
  if (p.sick > 0) {
    p.sick -= hours * (spot?.kind === 'infirmary' ? INFIRMARY_SICK_MULT : 1);
    if (p.sick <= 0) {
      p.sick = 0;
      sim.notify('Te has recuperado de la enfermedad', 'good');
    }
  }

  // 5. Salud.
  const harms = activeHarms(sim);
  let healthDelta = 0;
  if (harms.length) {
    let worst = harms[0]!;
    for (const h of harms) {
      healthDelta -= h.perHour * hours;
      if (h.perHour > worst.perHour) worst = h;
    }
    memo.lastCause = DEATH_CAUSES[worst.kind];
  } else if (canRegenerate(sim)) {
    healthDelta = R.healthRegenPerHour * hours * (spot?.kind === 'infirmary' ? INFIRMARY_REGEN_MULT : 1);
  }
  n.health = Math.min(100, n.health + healthDelta);
  if (n.health <= 0) {
    killPlayer(sim, memo.lastCause ?? DEATH_CAUSES.wounds);
    return;
  }
  const losingHealth = healthDelta < 0;

  // 6. Desmayo por agotamiento.
  if (!p.sleeping && n.energy <= 0) faint(sim);

  // 7. Despertar automático (y registro de lo que pasa mientras duerme).
  const stormStarted = memo.prevWeather !== null && memo.prevWeather !== 'tormenta' && st.weather.kind === 'tormenta';
  memo.prevWeather = st.weather.kind;
  const newEvents = trackEvents(sim, memo);
  if (p.sleeping) {
    if (!memo.night) memo.night = { regionId: st.voyage.regionId, events: [] };
    for (const ev of newEvents) if (!wakesPlayer(ev)) memo.night.events.push({ id: ev.id, type: ev.type, title: ev.title, startedAt: ev.startedAt, data: ev.data ?? {} });
    checkWake(sim, losingHealth, stormStarted, newEvents);
  } else if (memo.night) {
    // Le han despertado sin pasar por `wakePlayer` (otro sistema): el resumen sale igual.
    flushNight(sim);
  }

  // 8. Avisos (no mientras duerme a ×14: las emergencias ya le despiertan y, al levantarse,
  // los avisos pendientes saltan en el siguiente paso).
  if (!p.sleeping) checkWarnings(sim, memo);
}

/** Devuelve los eventos que han empezado desde el tick anterior. */
function trackEvents(sim: Simulation, memo: NeedsMemo): ActiveEvent[] {
  const active = sim.state.events.active;
  if (!memo.knownEvents) {
    memo.knownEvents = new Set(active.map((e) => e.id));
    return [];
  }
  const known = memo.knownEvents;
  const fresh = active.filter((e) => !known.has(e.id));
  if (fresh.length || known.size !== active.length) memo.knownEvents = new Set(active.map((e) => e.id));
  return fresh;
}

/**
 * ¿Despierta al jugador este evento al empezar? Manda `data.wakePlayer` si el evento lo fija; si
 * no, solo las emergencias reales (`WAKE_EVENTS`).
 */
export function wakesPlayer(ev: { type: string; data?: Record<string, unknown> }): boolean {
  const flag = ev.data?.['wakePlayer'];
  if (typeof flag === 'boolean') return flag;
  return WAKE_EVENTS.has(ev.type);
}

function checkWake(sim: Simulation, losingHealth: boolean, stormStarted: boolean, newEvents: { type: string; title: string; data?: Record<string, unknown> }[]): void {
  const st = sim.state;
  const p = st.player;
  const s = p.sleeping;
  if (!s) return;
  const n = p.needs;

  // Desmayo: inconsciente hasta que pase el tiempo (o si la salud se hunde).
  if (s.until !== null) {
    if (st.time >= s.until) wakePlayer(sim, 'Recuperas el conocimiento. Necesitas dormir en una cama', 'warn');
    else if (n.health < CRITICAL_HEALTH && losingHealth) wakePlayer(sim, 'Vuelves en ti: tu salud está en peligro', 'danger');
    return;
  }

  if (fireAboard(sim)) {
    wakePlayer(sim, '¡Fuego a bordo! Te despiertas sobresaltado', 'danger');
    return;
  }
  if (stormStarted) {
    wakePlayer(sim, 'Te despierta el estruendo de la tormenta', 'warn');
    return;
  }
  const ev = newEvents.find(wakesPlayer);
  if (ev) {
    wakePlayer(sim, `Te despiertan: ${ev.title.replace(/^¡(.*)!$/, '$1')}`, 'warn');
    return;
  }
  if (n.thirst < CRITICAL_NEED) {
    wakePlayer(sim, 'Te despierta la sed: necesitas beber', 'warn');
    return;
  }
  if (n.hunger < CRITICAL_NEED) {
    wakePlayer(sim, 'Te despierta el hambre: necesitas comer', 'warn');
    return;
  }
  if (n.health < CRITICAL_HEALTH && losingHealth) {
    wakePlayer(sim, 'Te despiertas débil: tu salud está en peligro', 'danger');
    return;
  }
  const h = hourOf(st.time);
  if (n.energy >= WAKE_ENERGY && h >= WAKE_HOUR_FROM && h < WAKE_HOUR_TO) {
    wakePlayer(sim, 'Te despiertas descansado', 'good');
  }
}

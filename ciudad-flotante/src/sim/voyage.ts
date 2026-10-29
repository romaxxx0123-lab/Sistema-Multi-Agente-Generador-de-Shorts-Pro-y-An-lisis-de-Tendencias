/**
 * [AGENTE sim-survival] VIAJE POR REGIONES Y RUMBO (docs/SISTEMAS.md §3).
 *
 * - Velocidad: 0 fondeado; si no, `CRUISE_SPEED × región.speedMult` + bonificación de cada motor
 *   auxiliar activo, encendido y con energía. La velocidad cambia de forma gradual (aceleración
 *   limitada) para que el mar y los restos no den tirones al fondear o levar anclas.
 * - Distancia en millas: `velocidad × dt / 60`.
 * - A `ROUTE_CHOICE_MILES` del final de la región se ofrecen las regiones siguientes
 *   (`nextChoices`) y se avisa de que hay que elegir rumbo en el timón. Al llegar se entra en
 *   `chosenNext` o, si nadie fijó el rumbo, en la que elige el piloto (`autopilotTarget`), con
 *   entrada de diario.
 * - El peligro escala con la progresión: durante los primeros `DANGER_GATE_DAYS` días jugados no
 *   se ofrecen regiones de peligro ≥ `DANGER_GATE` si hay alternativa (si todas las salidas lo son,
 *   se ofrece volver a una región vecina más tranquila), y el piloto busca las aguas más
 *   tranquilas. Después, sin rumbo fijado, el barco sigue la corriente (la primera salida).
 * - Fondeo: al pasar `anchoredUntil` se levan anclas.
 * - Avistamientos (los crea events.ts): derivan hacia popa y desaparecen al caducar.
 */
import { approach } from '../core/math';
import { moduleDef } from '../data/modules';
import { REGIONS, START_REGION, type RegionDef } from '../data/regions';
import { CRUISE_SPEED, MINUTES_PER_DAY, START_HOUR, VISUAL_DRIFT } from './constants';
import type { ActionResult, Simulation } from './Simulation';
import { markTutorial } from './tutorial';

/** Millas antes del final de la región en que se decide el rumbo. */
export const ROUTE_CHOICE_MILES = 10;
/** Aceleración/frenada del barco (nudos por minuto de juego). */
export const SHIP_ACCEL = 1;
/** Bonificación por defecto de un motor si su definición no la indica. */
const DEFAULT_MOTOR_BONUS = 3;
/** Peligro a partir del cual una región se reserva para cuando la tripulación ya lleva días a bordo. */
export const DANGER_GATE = 4;
/** Días jugados (desde que zarpamos) antes de los que no se ofrecen regiones de peligro ≥ DANGER_GATE. */
export const DANGER_GATE_DAYS = 6;
/**
 * Si todas las salidas son peligrosas, solo se da media vuelta hacia aguas tranquilas cuando aún
 * faltan más de estas horas para que se abran las regiones peligrosas (si no, sería desandar días
 * de viaje por unas horas).
 */
export const BACKTRACK_MIN_HOURS = 24;

const fail = (msg: string): ActionResult => ({ ok: false, msg });

/* ------------------------------------------------------------------ */
/* Consultas                                                           */
/* ------------------------------------------------------------------ */

/** Región actual (con respaldo si el id guardado no existe). */
export function currentRegion(sim: Simulation): RegionDef {
  return REGIONS[sim.state.voyage.regionId] ?? REGIONS[START_REGION]!;
}

/** Nombre legible de una región (o el id si no existe). */
export function regionName(id: string): string {
  return REGIONS[id]?.name ?? id;
}

/** Artículo de los nombres de región según su primera palabra («el Mar de…», «la Corriente…»). */
const REGION_ARTICLE: Record<string, string> = { mar: 'el', archipiélago: 'el', cementerio: 'el', corriente: 'la', aguas: '', faro: 'el', isla: 'la', islas: 'las' };

/**
 * Nombre de una región con su artículo, para frases: «el Mar de los Sargazos», «la Corriente
 * Boreal», «Aguas Templadas», «El Faro del Fin del Mundo» (si el nombre ya lo lleva, tal cual).
 */
export function regionWithArticle(id: string): string {
  const name = regionName(id);
  const first = (name.split(/\s+/)[0] ?? '').toLowerCase();
  if (['el', 'la', 'los', 'las'].includes(first)) return name;
  const art = REGION_ARTICLE[first] ?? (/(a|as|ción|dad)$/.test(first) ? (first.endsWith('s') ? 'las' : 'la') : first.endsWith('s') ? 'los' : 'el');
  return art ? `${art} ${name}` : name;
}

/** Días jugados desde que zarpamos (el día 1 a las `START_HOUR`). */
export function playedDays(sim: Simulation): number {
  return Math.max(0, (sim.state.time - START_HOUR * 60) / MINUTES_PER_DAY);
}

/** ¿Siguen reservadas las regiones peligrosas (primeros días de travesía)? */
export function dangerGated(sim: Simulation): boolean {
  return playedDays(sim) < DANGER_GATE_DAYS;
}

/**
 * Regiones a las que se puede poner rumbo ahora desde `from` (por defecto, la actual). Al principio
 * se descartan las de peligro ≥ DANGER_GATE si queda alguna otra salida; si todas lo son (p. ej. la
 * Corriente Boreal) y aún falta más de un día para que se abran, se ofrece volver a las regiones
 * vecinas más tranquilas. Si no, todas las salidas.
 */
export function nextRegions(sim: Simulation, from: RegionDef = currentRegion(sim)): string[] {
  const all = from.next.filter((id) => !!REGIONS[id]);
  if (!dangerGated(sim)) return all;
  const safe = all.filter((id) => REGIONS[id]!.danger < DANGER_GATE);
  if (safe.length) return safe;
  if ((DANGER_GATE_DAYS - playedDays(sim)) * 24 <= BACKTRACK_MIN_HOURS) return all;
  const back = Object.values(REGIONS)
    .filter((r) => r.id !== from.id && r.next.includes(from.id) && r.danger < DANGER_GATE)
    .sort((a, b) => a.danger - b.danger)
    .map((r) => r.id);
  return back.length ? back : all;
}

/**
 * Rumbo que toma el barco si nadie lo fija: los primeros días, el de menor peligro (a igualdad, el
 * primero de la lista); después, la corriente (la primera opción).
 */
export function autopilotTarget(sim: Simulation, choices: readonly string[] = nextRegions(sim)): string {
  const valid = choices.filter((id) => !!REGIONS[id]);
  if (!valid.length) return START_REGION;
  if (!dangerGated(sim)) return valid[0]!;
  return valid.reduce((best, id) => (REGIONS[id]!.danger < REGIONS[best]!.danger ? id : best), valid[0]!);
}

/** ¿Está el barco fondeado ahora mismo? */
export function isAnchored(sim: Simulation): boolean {
  const a = sim.state.voyage.anchoredUntil;
  return a !== null && a > sim.state.time;
}

/** Nudos extra que aportan los motores auxiliares activos, encendidos y con energía. */
export function motorBonus(sim: Simulation): number {
  let bonus = 0;
  for (const m of sim.state.ship.modules) {
    if (m.type !== 'motor' || m.status !== 'active' || !m.on || !m.powered || m.fire > 0) continue;
    bonus += moduleDef(m.type).speedBonus ?? DEFAULT_MOTOR_BONUS;
  }
  return bonus;
}

/** Velocidad a la que tiende el barco (nudos). */
export function targetSpeed(sim: Simulation): number {
  if (isAnchored(sim)) return 0;
  return CRUISE_SPEED * currentRegion(sim).speedMult + motorBonus(sim);
}

/** Millas que faltan para salir de la región actual. */
export function milesToRegionEnd(sim: Simulation): number {
  const v = sim.state.voyage;
  return Math.max(0, v.regionLength - v.regionDistance);
}

/** Horas de juego estimadas hasta el final de la región (null si estamos parados). */
export function hoursToRegionEnd(sim: Simulation): number | null {
  const v = sim.state.voyage;
  const speed = Math.max(v.speed, isAnchored(sim) ? 0 : targetSpeed(sim));
  if (speed <= 0.01) return null;
  return milesToRegionEnd(sim) / speed;
}

export interface RouteOption {
  id: string;
  name: string;
  desc: string;
  /** Peligro 1..5. */
  danger: number;
  baseTemp: number;
  chosen: boolean;
  /** Es el rumbo que tomará el piloto si nadie fija otro. */
  autopilot: boolean;
}

/** Rumbos que se pueden fijar ahora (los ofrecidos al final de la región o, antes, los posibles). */
function currentChoices(sim: Simulation): string[] {
  const v = sim.state.voyage;
  return (v.nextChoices ?? nextRegions(sim)).filter((id) => !!REGIONS[id]);
}

/**
 * Rumbos disponibles desde la región actual (para el timón). Se pueden fijar en cualquier
 * momento; al acercarse al final de la región se pide explícitamente.
 */
export function routeOptions(sim: Simulation): RouteOption[] {
  const v = sim.state.voyage;
  const ids = currentChoices(sim);
  const auto = v.chosenNext ? null : autopilotTarget(sim, ids);
  return ids.map((id) => {
    const r = REGIONS[id]!;
    return { id, name: r.name, desc: r.desc, danger: r.danger, baseTemp: r.baseTemp, chosen: v.chosenNext === id, autopilot: auto === id };
  });
}

/**
 * Regiones de la carta a las que aún no se puede poner rumbo por ser demasiado peligrosas para
 * estos primeros días, con el motivo (para la interfaz del timón).
 */
export function gatedRoutes(sim: Simulation): { id: string; name: string; reason: string }[] {
  if (!dangerGated(sim)) return [];
  const offered = new Set(currentChoices(sim));
  const day = DANGER_GATE_DAYS + 1;
  return currentRegion(sim)
    .next.filter((id) => !!REGIONS[id] && !offered.has(id))
    .map((id) => ({ id, name: regionName(id), reason: `Aún no es prudente navegar hacia ${regionWithArticle(id)}: el barco podrá adentrarse a partir del día ${day}` }));
}

/* ------------------------------------------------------------------ */
/* Fondeo                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fondea el barco `minutes` minutos (lo usan los eventos: rescates, expediciones). Si ya estaba
 * fondeado, se queda hasta la más tardía de las dos horas.
 */
export function anchorShip(sim: Simulation, minutes: number, reason: string): void {
  const v = sim.state.voyage;
  const until = sim.state.time + Math.max(0, minutes);
  const was = isAnchored(sim);
  v.anchoredUntil = Math.max(v.anchoredUntil ?? 0, until);
  v.anchorReason = reason;
  if (!was) sim.log(`Echamos el ancla: ${reason}`, 'info');
}

/** Leva anclas inmediatamente (si estaba fondeado). */
export function weighAnchor(sim: Simulation, quiet = false): void {
  const v = sim.state.voyage;
  if (v.anchoredUntil === null) return;
  v.anchoredUntil = null;
  v.anchorReason = null;
  if (!quiet) sim.log('Levamos anclas y seguimos rumbo', 'info');
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

function enterRegion(sim: Simulation, id: string, overflow: number): void {
  const v = sim.state.voyage;
  const prev = currentRegion(sim);
  const chose = v.chosenNext === id;
  const r = REGIONS[id] ?? REGIONS[START_REGION]!;
  v.regionId = r.id;
  v.regionLength = r.length;
  v.regionDistance = Math.max(0, Math.min(overflow, r.length - 0.01));
  v.route.push(r.id);
  v.nextChoices = null;
  v.chosenNext = null;
  const via = chose ? '' : dangerGated(sim) ? ' (sin rumbo fijado, el piloto busca aguas tranquilas)' : ' (sin rumbo fijado, seguimos la corriente)';
  sim.log(`Dejamos atrás ${regionWithArticle(prev.id)}. Entramos en ${regionWithArticle(r.id)}${via}. ${r.desc}`, r.danger >= 4 ? 'warn' : 'info');
}

export function tickVoyage(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  const v = st.voyage;

  // Saneado (guardados antiguos o manipulados).
  if (!REGIONS[v.regionId]) v.regionId = START_REGION;
  if (!(v.regionLength > 0)) v.regionLength = currentRegion(sim).length;
  if (!Number.isFinite(v.regionDistance)) v.regionDistance = 0;
  if (!Number.isFinite(v.speed)) v.speed = 0;

  // Fondeo cumplido: levar anclas.
  if (v.anchoredUntil !== null && st.time >= v.anchoredUntil) weighAnchor(sim);

  // Velocidad (gradual) y distancia.
  v.speed = Math.max(0, approach(v.speed, targetSpeed(sim), SHIP_ACCEL * dt));
  const miles = (v.speed * dt) / 60;
  v.distance += miles;
  v.regionDistance += miles;

  // Elección de rumbo cerca del final de la región.
  const region = currentRegion(sim);
  if (v.nextChoices === null && v.regionDistance >= v.regionLength - ROUTE_CHOICE_MILES) {
    v.nextChoices = nextRegions(sim, region);
    if (v.chosenNext && !v.nextChoices.includes(v.chosenNext)) v.chosenNext = null;
    if (v.chosenNext) {
      sim.log(`Nos acercamos al final de ${regionWithArticle(region.id)}. Rumbo fijado hacia ${regionWithArticle(v.chosenNext)}`, 'info');
    } else if (v.nextChoices.length > 1) {
      const opts = v.nextChoices.map(regionWithArticle).join(' o ');
      sim.log(`Nos acercamos al final de ${regionWithArticle(region.id)}: elige rumbo en el timón del puente (${opts})`, 'info');
    }
  }

  // Cambio de región.
  if (v.regionDistance >= v.regionLength) {
    const choices = v.nextChoices && v.nextChoices.length ? v.nextChoices : nextRegions(sim, region);
    const target = v.chosenNext && REGIONS[v.chosenNext] ? v.chosenNext : autopilotTarget(sim, choices);
    enterRegion(sim, target, v.regionDistance - v.regionLength);
  }

  // Avistamientos: derivan hacia popa y desaparecen al caducar.
  if (v.sightings.length) {
    const drift = (VISUAL_DRIFT * v.speed) / 6;
    for (const s of v.sightings) s.x -= drift * dt;
    v.sightings = v.sightings.filter((s) => s.expiresAt > st.time);
  }
}

/* ------------------------------------------------------------------ */
/* Comandos                                                            */
/* ------------------------------------------------------------------ */

/** Fija el rumbo hacia una de las regiones siguientes (se elige en el timón). */
export function chooseRoute(sim: Simulation, regionId: string): ActionResult {
  const v = sim.state.voyage;
  const options = currentChoices(sim);
  const r = REGIONS[regionId];
  if (r && !options.includes(regionId)) {
    const gated = gatedRoutes(sim).find((g) => g.id === regionId);
    if (gated) return fail(gated.reason);
  }
  if (!r || !options.includes(regionId)) return fail('Ese rumbo no está disponible desde aquí');
  markTutorial(sim, 'timon');
  if (v.chosenNext === regionId) return { ok: true, msg: `Ya llevamos rumbo hacia ${regionWithArticle(regionId)}` };
  v.chosenNext = regionId;
  sim.log(`Fijamos rumbo hacia ${regionWithArticle(regionId)}`, 'info', false);
  return { ok: true, msg: `Rumbo fijado: ${r.name}` };
}

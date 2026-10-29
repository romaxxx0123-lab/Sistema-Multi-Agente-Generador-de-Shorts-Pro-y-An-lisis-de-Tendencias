/**
 * [AGENTE game-player] SELECCIÓN DE OBJETIVOS (pura, sin three.js).
 *
 * Cada frame `Interaction` pregunta qué hay delante del jugador:
 *  - `scanFocus`: el mejor objetivo para la tecla E (props interactivos, habitantes, cajas
 *    sueltas, obras y la ampliación del casco) a ≤ INTERACT_RANGE, en el cono de visión, en el
 *    mismo nivel y sin paredes en medio.
 *  - `scanRepair`: módulo dañado o averiado cercano al que se apunta (tecla R / herramienta).
 *  - `scanFire`: módulo en llamas al alcance del cubo.
 *  - `scanDebris`: resto flotante cerca del rayo de la cámara (gancho), en coordenadas del océano.
 *  - `railFacing`: si el jugador está junto a la borda mirando al agua (caña y cubo).
 *
 * Puntuación: menor es mejor. Un objeto atravesado por el rayo de la mirada siempre gana a uno
 * que solo cae dentro del cono.
 */
import { INTERACT_RANGE, LEVEL_H, RAIL_USE_RANGE, WALL_H, WALL_T, CELL } from '../../sim/constants';
import { distanceToEdge, hullBounds, onOpenDeck, railBlocker } from '../../sim/debris';
import { EXTINGUISH_RANGE, distanceToModule } from '../../sim/events';
import { findModule } from '../../sim/helpers';
import { cellMin, levelOfY, levelY, moduleCells, type AABB, type PropInstance, type ShipLayout } from '../../sim/ship';
import type { Simulation } from '../../sim/Simulation';
import type { Debris, LooseCrate, ModuleInstance, NpcState } from '../../sim/types';
import { moduleDef } from '../../data/modules';
import { angleTo, boxAt, centerOf, closestOnAabb, distXZToAabb, inflate, insideAabb, rayAabb, segmentBlocked, type V3 } from './aim';

/** Semiángulo del cono de visión para objetivos que no están justo en la mira (rad). */
export const FOCUS_CONE = 0.42;
/** Alcance del rayo de la mirada para interactuar (desde el ojo). */
export const FOCUS_RAY = INTERACT_RANGE + 1.4;
/** Diferencia de altura máxima (m) para considerar que algo está en el mismo nivel. */
export const SAME_LEVEL_DY = 1.25;
/** Distancia (m, en planta) a un módulo para ofrecer repararlo. */
export const REPAIR_RANGE = 2.2;

export interface Aim {
  sim: Simulation;
  /** Pies del jugador. */
  pos: V3;
  /** Ojo (origen de la mirada). */
  eye: V3;
  /** Dirección unitaria de la mirada. */
  dir: V3;
}

export type FocusKind = 'prop' | 'npc' | 'crate' | 'site' | 'expansion';

export interface Focus {
  kind: FocusKind;
  /** Identidad estable (para no repetir avisos y saber si el objetivo cambió). */
  key: string;
  score: number;
  /** Distancia en planta del jugador al objetivo. */
  dist: number;
  /** Punto al que se apunta (para efectos). */
  point: V3;
  /** La mira lo atraviesa (no solo está en el cono). */
  direct: boolean;
  prop?: PropInstance;
  npc?: NpcState;
  crate?: LooseCrate;
  /** Módulo relacionado (prop u obra). */
  moduleId?: number;
}

/* ------------------------------------------------------------------ */
/* Cajas de paredes (cacheadas por layout)                             */
/* ------------------------------------------------------------------ */

const losCache = new WeakMap<ShipLayout, AABB[]>();
const camCache = new WeakMap<ShipLayout, AABB[]>();

/** Paredes que tapan la vista (sin barandillas: se puede hablar por encima de una borda). */
export function losBoxes(layout: ShipLayout): AABB[] {
  let out = losCache.get(layout);
  if (out) return out;
  out = [];
  const ht = WALL_T / 2;
  for (const w of layout.walls) {
    if (w.kind === 'rail') continue;
    out.push({ minX: Math.min(w.x0, w.x1) - ht, maxX: Math.max(w.x0, w.x1) + ht, minZ: Math.min(w.z0, w.z1) - ht, maxZ: Math.max(w.z0, w.z1) + ht, minY: w.y0, maxY: w.y1 });
  }
  losCache.set(layout, out);
  return out;
}

/** Obstáculos para la cámara en tercera persona: paredes y barandillas (altura visual) y muebles. */
export function cameraBoxes(layout: ShipLayout): AABB[] {
  let out = camCache.get(layout);
  if (out) return out;
  out = [];
  const ht = WALL_T / 2;
  for (const w of layout.walls) {
    out.push({ minX: Math.min(w.x0, w.x1) - ht, maxX: Math.max(w.x0, w.x1) + ht, minZ: Math.min(w.z0, w.z1) - ht, maxZ: Math.max(w.z0, w.z1) + ht, minY: w.y0, maxY: w.y1 });
  }
  for (const p of layout.props) if (p.collider && p.height > 1.2) out.push(p.collider);
  camCache.set(layout, out);
  return out;
}

/* ------------------------------------------------------------------ */
/* Cajas de objetos                                                    */
/* ------------------------------------------------------------------ */

export function propBox(p: PropInstance): AABB {
  if (p.collider) {
    // Muebles muy bajos (alfombras, bancales): altura mínima para poder apuntarlos.
    const c = p.collider;
    return c.maxY - c.minY < 0.5 ? { ...c, maxY: c.minY + 0.5 } : c;
  }
  return boxAt(p.x, p.y, p.z, Math.max(0.3, p.hx), Math.max(0.3, p.hz), Math.max(0.5, p.height));
}

export function npcBox(n: NpcState): AABB {
  return boxAt(n.pos.x, n.pos.y, n.pos.z, 0.32, 0.32, 1.75 * (n.appearance?.height ?? 1));
}

export function crateBox(c: LooseCrate): AABB {
  return boxAt(c.pos.x, c.pos.y, c.pos.z, 0.36, 0.36, 0.58);
}

/** Caja de las celdas de un módulo en su nivel base. */
export function moduleBox(m: Pick<ModuleInstance, 'type' | 'level' | 'x' | 'z' | 'rot'>, width: number): AABB {
  const def = moduleDef(m.type);
  const h = def.enclosed ? WALL_H : def.id === 'escalera' ? LEVEL_H : 2.4;
  const box: AABB = { minX: Infinity, maxX: -Infinity, minY: levelY(m.level), maxY: levelY(m.level) + h, minZ: Infinity, maxZ: -Infinity };
  for (const c of moduleCells(m)) {
    if (c.level !== m.level) continue;
    const mn = cellMin(c.x, c.z, width);
    box.minX = Math.min(box.minX, mn.x);
    box.maxX = Math.max(box.maxX, mn.x + CELL);
    box.minZ = Math.min(box.minZ, mn.z);
    box.maxZ = Math.max(box.maxZ, mn.z + CELL);
  }
  return box;
}

/* ------------------------------------------------------------------ */
/* Objetivo principal (tecla E)                                        */
/* ------------------------------------------------------------------ */

interface Candidate {
  box: AABB;
  /** Distancia en planta del jugador a la caja. */
  dist: number;
}

/**
 * Puntúa una caja: atravesada por la mira → `0,02·t`; si no, dentro del cono → `0,25 + ángulo`.
 * Devuelve null si no se ve (fuera de alcance, del cono o tapada por una pared).
 */
function rate(aim: Aim, c: Candidate, walls: readonly AABB[], inside = false): { score: number; point: V3; direct: boolean } | null {
  if (c.dist > INTERACT_RANGE) return null;
  const hitBox = inflate(c.box, 0.06);
  const t = inside ? null : rayAabb(aim.eye, aim.dir, hitBox, FOCUS_RAY);
  if (t !== null) {
    const point = { x: aim.eye.x + aim.dir.x * t, y: aim.eye.y + aim.dir.y * t, z: aim.eye.z + aim.dir.z * t };
    if (occluded(aim.eye, point, c.box, walls)) return null;
    return { score: 0.02 * t, point, direct: true };
  }
  const ctr = centerOf(c.box);
  // Punto de la caja más cercano a la línea de la mirada a la distancia del centro.
  const dc = Math.hypot(ctr.x - aim.eye.x, ctr.y - aim.eye.y, ctr.z - aim.eye.z);
  const onRay = { x: aim.eye.x + aim.dir.x * dc, y: aim.eye.y + aim.dir.y * dc, z: aim.eye.z + aim.dir.z * dc };
  const point = closestOnAabb(onRay, c.box);
  const ang = angleTo(aim.eye, aim.dir, point);
  if (ang > FOCUS_CONE) return null;
  if (occluded(aim.eye, point, c.box, walls)) return null;
  return { score: 0.25 + ang + c.dist * 0.02, point, direct: false };
}

/**
 * ¿Hay una pared entre el ojo y el objeto? Se comprueba hasta el punto de la superficie y hasta
 * el centro del objeto: los muebles pegados a una pared asoman por su grosor y, sin lo segundo,
 * se podrían usar desde el otro lado.
 */
function occluded(eye: V3, point: V3, box: AABB, walls: readonly AABB[]): boolean {
  return segmentBlocked(eye, point, walls) || segmentBlocked(eye, centerOf(box), walls);
}

const sameLevel = (aim: Aim, y: number): boolean => Math.abs(y - aim.pos.y) <= SAME_LEVEL_DY;

/** El mejor objetivo para la tecla E, o null. */
export function scanFocus(aim: Aim): Focus | null {
  const { sim, pos } = aim;
  const st = sim.state;
  const layout = sim.layout;
  const walls = losBoxes(layout);
  let best: Focus | null = null;
  const consider = (f: Focus): void => {
    if (!best || f.score < best.score) best = f;
  };

  // Muebles interactivos.
  for (const p of layout.props) {
    if (!p.interact || !sameLevel(aim, p.y)) continue;
    const box = propBox(p);
    const r = rate(aim, { box, dist: distXZToAabb(pos.x, pos.z, box) }, walls);
    if (r) consider({ kind: 'prop', key: `prop:${p.key}`, ...r, dist: distXZToAabb(pos.x, pos.z, box), prop: p, moduleId: p.moduleId });
  }

  // Habitantes presentes.
  for (const n of st.npcs) {
    if (n.awayUntil !== null || n.activity === 'away' || !sameLevel(aim, n.pos.y)) continue;
    const box = npcBox(n);
    const d = Math.max(0, Math.hypot(n.pos.x - pos.x, n.pos.z - pos.z) - 0.32);
    const r = rate(aim, { box, dist: d }, walls);
    // Ligera preferencia por las personas frente a los muebles en empate.
    if (r) consider({ kind: 'npc', key: `npc:${n.id}`, ...r, score: r.score - 0.01, dist: d, npc: n });
  }

  // Cajas sueltas.
  for (const c of st.crates) {
    if (!sameLevel(aim, c.pos.y)) continue;
    const box = crateBox(c);
    const d = distXZToAabb(pos.x, pos.z, box);
    const r = rate(aim, { box, dist: d }, walls);
    if (r) consider({ kind: 'crate', key: `crate:${c.id}`, ...r, dist: d, crate: c });
  }

  // Obras en curso: el jugador puede estar dentro del recinto (andamios en cubierta).
  for (const site of layout.sites) {
    const m = findModule(sim, site.moduleId);
    if (!m || m.status !== 'construction' || !sameLevel(aim, levelY(m.level))) continue;
    const box = moduleBox(m, layout.width);
    const d = distXZToAabb(pos.x, pos.z, box);
    if (d > INTERACT_RANGE) continue;
    const inside = insideAabb(aim.eye, inflate(box, 0.05));
    if (inside) {
      // Dentro de la obra: cuenta si se mira hacia su interior (no al cielo).
      if (aim.dir.y > 0.75) continue;
      consider({ kind: 'site', key: `site:${m.id}`, score: 0.35, dist: 0, point: centerOf(box), direct: false, moduleId: m.id });
      continue;
    }
    const r = rate(aim, { box, dist: d }, walls);
    // Las obras son grandes: un poco de penalización para que un mueble apuntado gane.
    if (r) consider({ kind: 'site', key: `site:${m.id}`, ...r, score: r.score + 0.08, dist: d, moduleId: m.id });
  }

  // Ampliación del casco (andamio en la proa).
  if (st.ship.expansion) {
    const bowX = hullBounds(sim).bowX;
    const deckY = LEVEL_H;
    if (sameLevel(aim, deckY) && bowX - pos.x <= INTERACT_RANGE + 0.6 && aim.dir.x > 0.25) {
      const box: AABB = { minX: bowX - 0.2, maxX: bowX + CELL * 2, minY: deckY - 1, maxY: deckY + 2.6, minZ: -hullBounds(sim).halfW, maxZ: hullBounds(sim).halfW };
      const t = rayAabb(aim.eye, aim.dir, box, FOCUS_RAY + 2);
      const point = { x: bowX, y: deckY + 1, z: pos.z };
      consider({ kind: 'expansion', key: 'expansion', score: t !== null ? 0.05 + t * 0.02 : 0.3, dist: Math.max(0, bowX - pos.x), point, direct: t !== null });
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Reparaciones                                                        */
/* ------------------------------------------------------------------ */

export interface RepairTarget {
  module: ModuleInstance;
  info: ReturnType<Simulation['repairInfo']>;
}

/**
 * Módulo a reparar: el del objetivo enfocado si lo necesita; si no, el módulo dañado más cercano
 * en el que está el jugador o al que apunta (≤ REPAIR_RANGE, mismo nivel).
 */
export function scanRepair(aim: Aim, focus: Focus | null): RepairTarget | null {
  const { sim, pos } = aim;
  if (focus?.moduleId !== undefined && focus.kind === 'prop') {
    const m = findModule(sim, focus.moduleId);
    if (m && m.status !== 'construction') {
      const info = sim.repairInfo(m.id);
      if (info.needed) return { module: m, info };
    }
  }
  let best: RepairTarget | null = null;
  let bestScore = Infinity;
  for (const m of sim.state.ship.modules) {
    if (m.status === 'construction') continue;
    const dist = distanceToModule(sim, m, pos);
    if (dist > REPAIR_RANGE) continue;
    const info = sim.repairInfo(m.id);
    if (!info.needed) continue;
    const box = moduleBox(m, sim.state.ship.width);
    const inside = insideAabb(pos, inflate(box, 0.05, 0.6));
    const t = rayAabb(aim.eye, aim.dir, inflate(box, 0.15), FOCUS_RAY + 1);
    if (!inside && t === null) continue;
    const score = inside ? 0.5 + dist : (t ?? 0) * 0.05 + dist;
    if (score < bestScore) {
      bestScore = score;
      best = { module: m, info };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Incendios                                                           */
/* ------------------------------------------------------------------ */

export interface FireTarget {
  module: ModuleInstance;
  /** Punto de las llamas al que echar el agua. */
  point: V3;
  dist: number;
}

/** Punto donde arde un módulo: sobre su mueble interactivo principal o en su centro. */
export function firePoint(sim: Simulation, m: ModuleInstance): V3 {
  let best: PropInstance | null = null;
  for (const p of sim.layout.props) {
    if (p.moduleId !== m.id) continue;
    if (!best || (p.interact && !best.interact) || p.height > best.height) best = p;
  }
  if (best) return { x: best.x, y: best.y + Math.min(1.4, best.height + 0.2), z: best.z };
  const b = moduleBox(m, sim.state.ship.width);
  const c = centerOf(b);
  return { x: c.x, y: b.minY + 1.2, z: c.z };
}

/** Fuego al alcance del cubo al que se apunta (o en el que está el jugador). */
export function scanFire(aim: Aim): FireTarget | null {
  const { sim, pos } = aim;
  let best: FireTarget | null = null;
  let bestScore = Infinity;
  for (const m of sim.state.ship.modules) {
    if (!(m.fire > 0)) continue;
    const dist = distanceToModule(sim, m, pos);
    if (dist > EXTINGUISH_RANGE) continue;
    const box = moduleBox(m, sim.state.ship.width);
    const point = firePoint(sim, m);
    const inside = insideAabb(pos, inflate(box, 0.05, 0.6));
    const ang = angleTo(aim.eye, aim.dir, point);
    const t = rayAabb(aim.eye, aim.dir, inflate(box, 0.3), EXTINGUISH_RANGE + 3);
    if (!inside && t === null && ang > 0.7) continue;
    const score = ang + dist * 0.1 - m.fire * 0.001;
    if (score < bestScore) {
      bestScore = score;
      best = { module: m, point, dist };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Restos flotantes (gancho)                                           */
/* ------------------------------------------------------------------ */

export interface DebrisTarget {
  debris: Debris;
  /** Distancia en planta del jugador al resto (la que comprueba la simulación). */
  dist: number;
  /** Punto del resto en coordenadas del océano. */
  point: V3;
}

/**
 * Resto más cercano al rayo de la cámara (coordenadas del OCÉANO: el barco se balancea).
 * `radius(kind)` da el radio visual de cada tipo; la tolerancia crece con la distancia.
 */
export function scanDebris(
  debris: readonly Debris[],
  camW: V3,
  dirW: V3,
  playerPos: V3,
  waterHeight: (x: number, z: number) => number,
  radius: (d: Debris) => number,
  maxDist: number,
): DebrisTarget | null {
  let best: DebrisTarget | null = null;
  let bestScore = Infinity;
  for (const d of debris) {
    const point = { x: d.pos.x, y: waterHeight(d.pos.x, d.pos.z) + 0.25, z: d.pos.z };
    const vx = point.x - camW.x;
    const vy = point.y - camW.y;
    const vz = point.z - camW.z;
    const along = vx * dirW.x + vy * dirW.y + vz * dirW.z;
    if (along <= 0.5) continue;
    const px = vx - dirW.x * along;
    const py = vy - dirW.y * along;
    const pz = vz - dirW.z * along;
    const perp = Math.hypot(px, py, pz);
    const tol = radius(d) + 0.7 + along * 0.035;
    if (perp > tol) continue;
    const dist = Math.hypot(d.pos.x - playerPos.x, d.pos.z - playerPos.z);
    if (dist > maxDist) continue;
    const score = perp / tol + dist * 0.004;
    if (score < bestScore) {
      bestScore = score;
      best = { debris: d, dist, point };
    }
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* Borda (caña y cubo)                                                 */
/* ------------------------------------------------------------------ */

export interface RailInfo {
  /** Se puede usar la borda ahora (posición válida y mirando al agua). */
  ok: boolean;
  /** Motivo si no se puede (para avisos). */
  reason: string | null;
  /** Normal hacia fuera del borde más cercano. */
  nx: number;
  nz: number;
  /** Punto del borde frente al jugador (metros locales). */
  edgeX: number;
  edgeZ: number;
  /** Distancia en planta al borde. */
  edgeDist: number;
  /** La posición vale (cubierta a cielo abierto junto a la borda), mire hacia donde mire. */
  posOk: boolean;
}

/**
 * Comprueba la borda: posición (regla de la simulación: cubierta a cielo abierto y a
 * ≤ RAIL_USE_RANGE del borde) y orientación (la mirada horizontal apunta hacia fuera).
 */
export function railFacing(sim: Simulation, pos: V3, dir: V3): RailInfo {
  const b = hullBounds(sim);
  const edges = [
    { d: b.halfW - pos.z, nx: 0, nz: 1, ex: pos.x, ez: b.halfW },
    { d: b.halfW + pos.z, nx: 0, nz: -1, ex: pos.x, ez: -b.halfW },
    { d: b.bowX - pos.x, nx: 1, nz: 0, ex: b.bowX, ez: pos.z },
    { d: pos.x - b.sternX, nx: -1, nz: 0, ex: b.sternX, ez: pos.z },
  ];
  // Borde más cercano hacia el que se mira (si se mira hacia uno a distancia de uso, ese gana).
  const hlen = Math.hypot(dir.x, dir.z) || 1;
  const hx = dir.x / hlen;
  const hz = dir.z / hlen;
  let best = edges[0]!;
  let bestScore = Infinity;
  for (const e of edges) {
    const facing = hx * e.nx + hz * e.nz;
    const score = e.d - (facing > 0.3 && e.d <= RAIL_USE_RANGE + 0.5 ? 10 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  const base = { nx: best.nx, nz: best.nz, edgeX: best.ex, edgeZ: best.ez, edgeDist: Math.max(0, best.d) };
  const why = railBlocker(sim, pos);
  if (why) return { ok: false, reason: why, posOk: false, ...base };
  const facing = hx * best.nx + hz * best.nz;
  if (facing < 0.3 || dir.y > 0.45) return { ok: false, reason: 'Mira hacia el agua', posOk: true, ...base };
  return { ok: true, reason: null, posOk: true, ...base };
}

/** ¿Puede lanzar el gancho desde aquí? (cubierta a cielo abierto). */
export function canHookFrom(sim: Simulation, pos: V3): string | null {
  if (levelOfY(pos.y) < 1) return 'Sube a cubierta para lanzar el gancho';
  if (!onOpenDeck(sim, pos)) return 'Sal a cubierta para lanzar el gancho';
  return null;
}

/** Distancia del jugador al borde (re-exportado para la interfaz de herramientas). */
export function edgeDistance(sim: Simulation, pos: V3): number {
  return distanceToEdge(sim, pos.x, pos.z);
}

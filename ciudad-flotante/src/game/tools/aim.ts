/**
 * [AGENTE game-player] Geometría de puntería pura (sin three.js): rayos contra cajas alineadas
 * (AABB), segmentos bloqueados por paredes, ángulos y suavizados. La usan la selección de
 * objetivos (`targets.ts`), la cámara en tercera persona (`cameraRig.ts`) y las herramientas.
 *
 * Todas las coordenadas son metros locales del barco salvo que se indique otra cosa.
 */
import type { AABB } from '../../sim/ship';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Rayo `o + t·d` contra una caja (método de las láminas). Devuelve la distancia de entrada
 * (0 si el origen está dentro) o null si no la toca antes de `maxT`.
 * `d` no tiene por qué ser unitario: `t` se mide en múltiplos de `d`.
 */
export function rayAabb(o: V3, d: V3, b: AABB, maxT = Infinity): number | null {
  let tmin = 0;
  let tmax = maxT;
  // Eje X
  if (Math.abs(d.x) < 1e-9) {
    if (o.x < b.minX || o.x > b.maxX) return null;
  } else {
    let t1 = (b.minX - o.x) / d.x;
    let t2 = (b.maxX - o.x) / d.x;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Eje Y
  if (Math.abs(d.y) < 1e-9) {
    if (o.y < b.minY || o.y > b.maxY) return null;
  } else {
    let t1 = (b.minY - o.y) / d.y;
    let t2 = (b.maxY - o.y) / d.y;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  // Eje Z
  if (Math.abs(d.z) < 1e-9) {
    if (o.z < b.minZ || o.z > b.maxZ) return null;
  } else {
    let t1 = (b.minZ - o.z) / d.z;
    let t2 = (b.maxZ - o.z) / d.z;
    if (t1 > t2) [t1, t2] = [t2, t1];
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  return tmin;
}

/** ¿El punto está dentro de la caja? */
export function insideAabb(p: V3, b: AABB, margin = 0): boolean {
  return (
    p.x >= b.minX - margin &&
    p.x <= b.maxX + margin &&
    p.y >= b.minY - margin &&
    p.y <= b.maxY + margin &&
    p.z >= b.minZ - margin &&
    p.z <= b.maxZ + margin
  );
}

/**
 * ¿Hay alguna caja entre `a` y `b`? Ignora las cajas que contienen `a` (el ojo pegado a una
 * pared no debe tapar todo) y las que contienen `b` (el objetivo puede estar empotrado).
 */
export function segmentBlocked(a: V3, b: V3, boxes: readonly AABB[]): boolean {
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  for (const box of boxes) {
    if (insideAabb(a, box) || insideAabb(b, box, 0.02)) continue;
    const t = rayAabb(a, d, box, 1);
    if (t !== null && t < 0.995) return true;
  }
  return false;
}

/** Caja agrandada `r` metros en todas direcciones. */
export function inflate(b: AABB, r: number, ry = r): AABB {
  return { minX: b.minX - r, maxX: b.maxX + r, minY: b.minY - ry, maxY: b.maxY + ry, minZ: b.minZ - r, maxZ: b.maxZ + r };
}

/** Caja a partir de una base (x, y, z) con media extensión en planta y altura. */
export function boxAt(x: number, y: number, z: number, hx: number, hz: number, h: number): AABB {
  return { minX: x - hx, maxX: x + hx, minY: y, maxY: y + h, minZ: z - hz, maxZ: z + hz };
}

/** Distancia en planta de un punto al borde de una caja (0 si está encima/dentro). */
export function distXZToAabb(x: number, z: number, b: AABB): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
  return Math.hypot(dx, dz);
}

/** Punto de la caja más cercano a `p`. */
export function closestOnAabb(p: V3, b: AABB): V3 {
  return {
    x: Math.min(b.maxX, Math.max(b.minX, p.x)),
    y: Math.min(b.maxY, Math.max(b.minY, p.y)),
    z: Math.min(b.maxZ, Math.max(b.minZ, p.z)),
  };
}

export function centerOf(b: AABB): V3 {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2, z: (b.minZ + b.maxZ) / 2 };
}

/** Ángulo (rad) entre la dirección `d` (unitaria) y el vector de `o` a `p`. */
export function angleTo(o: V3, d: V3, p: V3): number {
  const vx = p.x - o.x;
  const vy = p.y - o.y;
  const vz = p.z - o.z;
  const len = Math.hypot(vx, vy, vz);
  if (len < 1e-6) return 0;
  const c = (vx * d.x + vy * d.y + vz * d.z) / len;
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Dirección unitaria de la mirada para un yaw/pitch (convención three.js, orden YXZ). */
export function lookDir(yaw: number, pitch: number): V3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Yaw/pitch que miran de `from` hacia `to`. */
export function yawPitchTo(from: V3, to: V3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const h = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, h) };
}

/** Normaliza un ángulo a (-π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2);
  if (r <= -Math.PI) r += Math.PI * 2;
  else if (r > Math.PI) r -= Math.PI * 2;
  return r;
}

/** Factor de suavizado exponencial independiente del frame rate. */
export function damp(k: number, dt: number): number {
  return 1 - Math.exp(-k * dt);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
export const easeInQuad = (t: number): number => clamp01(t) * clamp01(t);
export const smooth01 = (t: number): number => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};

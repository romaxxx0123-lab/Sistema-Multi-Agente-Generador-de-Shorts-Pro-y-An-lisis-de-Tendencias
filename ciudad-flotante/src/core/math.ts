export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Aproxima `current` a `target` a una velocidad máxima `rate * dt`. */
export const approach = (current: number, target: number, maxDelta: number): number => {
  if (current < target) return Math.min(target, current + maxDelta);
  return Math.max(target, current - maxDelta);
};
export const dist2D = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(ax - bx, az - bz);
/** Normaliza un ángulo a (-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let r = (a + Math.PI) % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r - Math.PI;
};

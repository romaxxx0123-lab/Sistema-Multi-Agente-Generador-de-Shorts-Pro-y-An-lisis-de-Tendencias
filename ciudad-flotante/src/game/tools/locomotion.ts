/**
 * [AGENTE game-player] LOCOMOCIÓN (pura, sin three.js): aceleración suave y ayuda para coronar
 * las rampas de escalera. La usa `PlayerController` y se prueba con Vitest.
 */
import type { Body, ShipCollision } from '../../sim/physics';

/** Elevación de prueba de la ayuda para coronar rampas (m). */
export const STEP_ASSIST = 0.25;

/**
 * Acerca la velocidad horizontal `vel` a la deseada `(wx, wz)` con una aceleración máxima
 * `accel` (m/s²) durante `dt` segundos. Modifica `vel`.
 */
export function approachVelocity(vel: { x: number; z: number }, wx: number, wz: number, accel: number, dt: number): void {
  const dvx = wx - vel.x;
  const dvz = wz - vel.z;
  const dl = Math.hypot(dvx, dvz);
  const maxDv = accel * dt;
  if (dl <= maxDv || dl < 1e-6) {
    vel.x = wx;
    vel.z = wz;
  } else {
    vel.x += (dvx / dl) * maxDv;
    vel.z += (dvz / dl) * maxDv;
  }
}

/**
 * Ayuda para coronar las rampas de escalera. Al final de la rampa, el remate de la pared del
 * nivel inferior (hasta 3 m) queda por encima de los pies y frena al personaje antes del borde.
 * Si estando en una rampa el avance de este paso se queda corto, se repite con los pies un poco
 * más altos y, si así se avanza hacia un suelo alcanzable, se acepta. Devuelve true si ayudó.
 * (Petición de contrato: tratarlo como escalón en `ShipCollision.resolve`.)
 */
export function stepAssist(col: ShipCollision, body: Body, bx: number, by: number, bz: number, vx: number, vz: number, dt: number): boolean {
  const speed = Math.hypot(vx, vz);
  const want = speed * dt;
  if (want < 1e-4) return false;
  const ux = vx / speed;
  const uz = vz / speed;
  // Avance en la dirección deseada (puede ser negativo si la colisión empujó hacia atrás).
  const moved = (body.pos.x - bx) * ux + (body.pos.z - bz) * uz;
  if (moved > want * 0.6) return false;
  const onRamp = col.layout.ramps.some((r) => bx >= r.minX - 0.4 && bx <= r.maxX + 0.4 && bz >= r.minZ - 0.4 && bz <= r.maxZ + 0.4 && by > r.y0 + 0.05);
  if (!onRamp) return false;
  const probe: Body = { pos: { x: bx, y: by + STEP_ASSIST, z: bz }, vy: 0, onGround: false };
  col.move(probe, vx, vz, dt, false);
  const pm = (probe.pos.x - bx) * ux + (probe.pos.z - bz) * uz;
  if (pm <= Math.max(0, moved) + want * 0.25) return false;
  const g = col.groundAt(probe.pos.x, probe.pos.z, by + STEP_ASSIST);
  if (g === null || g < by - 0.08 || g > by + STEP_ASSIST + 0.2) return false;
  body.pos = { x: probe.pos.x, y: g, z: probe.pos.z };
  body.vy = 0;
  body.onGround = true;
  return true;
}

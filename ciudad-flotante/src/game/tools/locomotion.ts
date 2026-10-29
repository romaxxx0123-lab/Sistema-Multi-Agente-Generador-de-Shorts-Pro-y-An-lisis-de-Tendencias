/**
 * [AGENTE game-player] LOCOMOCIÓN (pura, sin three.js): aceleración suave, ayuda para coronar
 * las rampas de escalera y choque con los habitantes. La usa `PlayerController` y se prueba con
 * Vitest.
 */
import { PLAYER_RADIUS, STEP_HEIGHT, type Body, type ShipCollision } from '../../sim/physics';

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

/* ------------------------------------------------------------------ */
/* Habitantes                                                          */
/* ------------------------------------------------------------------ */

/** Radio del cuerpo de un habitante para chocar con el jugador (m). */
export const NPC_RADIUS = 0.3;
/** Diferencia de altura (m) a partir de la cual un habitante está en otro nivel y no choca. */
const OBSTACLE_DY = 1.2;

/** Cuerpo cilíndrico (pies en `y`) con el que choca el jugador. */
export interface Obstacle {
  x: number;
  y: number;
  z: number;
  r: number;
  /** Altura (m). */
  h: number;
}

/**
 * Saca al jugador de los cuerpos de los habitantes (choque círculo-círculo, después de
 * `collision.move`). El empuje pasa por la colisión del barco: nunca mete al jugador en una pared
 * ni lo deja sin suelo; si no hay sitio, se queda donde está. `away` = dirección de escape cuando
 * los centros coinciden (p. ej. hacia atrás de la mirada). Devuelve true si empujó.
 */
export function pushOutOfObstacles(col: ShipCollision, body: Body, obstacles: readonly Obstacle[], away: { x: number; z: number }): boolean {
  let pushed = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const o of obstacles) {
      if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || Math.abs(o.y - body.pos.y) > OBSTACLE_DY) continue;
      const min = o.r + PLAYER_RADIUS;
      let dx = body.pos.x - o.x;
      let dz = body.pos.z - o.z;
      let d = Math.hypot(dx, dz);
      if (!(d < min - 1e-4)) continue;
      if (d < 1e-4) {
        dx = Number.isFinite(away.x) ? away.x : 1;
        dz = Number.isFinite(away.z) ? away.z : 0;
        d = Math.hypot(dx, dz);
        if (d < 1e-6) {
          dx = 1;
          dz = 0;
          d = 1;
        }
        dx /= d;
        dz /= d;
        d = 0;
      } else {
        dx /= d;
        dz /= d;
      }
      const push = min - d;
      const r = col.resolve(body.pos.x + dx * push, body.pos.z + dz * push, body.pos.y);
      if (!Number.isFinite(r.x) || !Number.isFinite(r.z)) continue;
      const g = col.groundAt(r.x, r.z, body.pos.y);
      if (g === null || g > body.pos.y + STEP_HEIGHT || g < body.pos.y - 0.6) continue;
      // La pared puede devolverlo hacia el habitante: solo cuenta si de verdad se aleja.
      const nd = Math.hypot(r.x - o.x, r.z - o.z);
      if (nd <= d + 1e-4) continue;
      body.pos.x = r.x;
      body.pos.z = r.z;
      if (body.onGround) body.pos.y = g;
      moved = true;
      pushed = true;
    }
    if (!moved) break;
  }
  return pushed;
}

/**
 * Desvía la velocidad deseada alrededor de los habitantes con los que se está en contacto: se
 * quita la componente que va hacia ellos (se desliza por su contorno) y, si se va de frente, se
 * esquiva hacia la derecha. Así se rodea a una persona en vez de quedarse empujándola.
 */
export function steerAround(pos: { x: number; y: number; z: number }, vx: number, vz: number, obstacles: readonly Obstacle[]): { x: number; z: number } {
  const speed = Math.hypot(vx, vz);
  let x = vx;
  let z = vz;
  if (!(speed > 1e-4)) return { x, z };
  for (const o of obstacles) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.z) || Math.abs(o.y - pos.y) > OBSTACLE_DY) continue;
    const dx = pos.x - o.x;
    const dz = pos.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d > o.r + PLAYER_RADIUS + 0.12 || d < 1e-6) continue;
    const nx = dx / d;
    const nz = dz / d;
    const into = x * nx + z * nz;
    if (into >= 0) continue;
    x -= into * nx;
    z -= into * nz;
    if (Math.hypot(x, z) < speed * 0.35) {
      // De frente: rodearlo por el lado hacia el que ya se desliza (o por la derecha).
      let tx = -nz;
      let tz = nx;
      const side = x * tx + z * tz;
      const right = -vz * tx + vx * tz;
      if (side < 0 || (Math.abs(side) < 1e-6 && right < 0)) {
        tx = -tx;
        tz = -tz;
      }
      x = tx * speed * 0.7;
      z = tz * speed * 0.7;
    }
  }
  return { x, z };
}

/** Tiempo (s) empujando contra un habitante sin avanzar tras el cual se le deja atravesar. */
export const NPC_SQUEEZE_TIME = 2.5;

/**
 * Choque con los habitantes con salida de emergencia: si el jugador lleva NPC_SQUEEZE_TIME
 * empujando contra uno sin avanzar (un habitante quieto en una puerta o un pasillo estrecho), se
 * le deja pasar hasta separarse de él. Así nadie se queda encerrado por un habitante trabajando.
 */
export class NpcCollider {
  private blocked = 0;
  /** Atravesando habitantes hasta separarse de ellos. */
  ghost = false;

  /**
   * Aplica el choque después de `collision.move`. `from` = posición antes de moverse este frame;
   * `wantsMove` = el jugador pulsa una dirección. Devuelve true si empujó.
   */
  resolve(col: ShipCollision, body: Body, obstacles: readonly Obstacle[], away: { x: number; z: number }, from: { x: number; z: number }, wantsMove: boolean, dt: number): boolean {
    if (this.ghost) {
      const touching = obstacles.some((o) => Math.abs(o.y - body.pos.y) <= OBSTACLE_DY && Math.hypot(body.pos.x - o.x, body.pos.z - o.z) < o.r + PLAYER_RADIUS + 0.05);
      if (touching) return false;
      this.ghost = false;
    }
    const pushed = pushOutOfObstacles(col, body, obstacles, away);
    const advanced = Math.hypot(body.pos.x - from.x, body.pos.z - from.z);
    if (pushed && wantsMove && advanced < 0.4 * dt) this.blocked += dt;
    else this.blocked = Math.max(0, this.blocked - dt);
    if (this.blocked >= NPC_SQUEEZE_TIME) {
      this.ghost = true;
      this.blocked = 0;
    }
    return pushed;
  }

  reset(): void {
    this.blocked = 0;
    this.ghost = false;
  }
}

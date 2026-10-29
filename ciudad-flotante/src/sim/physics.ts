/**
 * FÍSICA DEL PERSONAJE dentro del barco (coordenadas locales).
 *
 * - Suelo: "superficies" por columna de celda (suelos de nivel y rampas de escalera).
 *   El cuerpo se apoya en la superficie más alta que esté por debajo de pies + STEP_HEIGHT.
 * - Paredes y props: AABBs del layout; el cuerpo es un círculo en planta con rango vertical.
 *
 * Convención de orientación: yaw = rotation.y de three.js; la dirección "adelante" es
 * (-sin(yaw), 0, -cos(yaw)).
 */
import { clamp } from '../core/math';
import { CELL, LEVEL_H as levelHeight } from './constants';
import { cellMin, getCell, pointToCell, referenceCell, type AABB, type Ramp, type ShipLayout } from './ship';
import type { Vec3 } from './types';

export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.62;
export const STEP_HEIGHT = 0.45;
export const GRAVITY = 20;
export const JUMP_SPEED = 5.4;

export interface Body {
  pos: Vec3;
  vy: number;
  onGround: boolean;
}

export class ShipCollision {
  private grid = new Map<string, AABB[]>();

  constructor(public readonly layout: ShipLayout) {
    for (const c of layout.colliders) {
      const a = pointToCell(c.minX - 0.5, c.minZ - 0.5, layout.width);
      const b = pointToCell(c.maxX + 0.5, c.maxZ + 0.5, layout.width);
      for (let x = a.x; x <= b.x; x++) {
        for (let z = a.z; z <= b.z; z++) {
          const k = `${x},${z}`;
          let arr = this.grid.get(k);
          if (!arr) this.grid.set(k, (arr = []));
          arr.push(c);
        }
      }
    }
  }

  /** Colisionadores cercanos a un punto. */
  nearby(x: number, z: number): AABB[] {
    const c = pointToCell(x, z, this.layout.width);
    return this.grid.get(`${c.x},${c.z}`) ?? [];
  }

  /** Alturas de todas las superficies transitables en (x, z). */
  surfaces(x: number, z: number): number[] {
    const L = this.layout;
    const c = pointToCell(x, z, L.width);
    if (c.x < 0 || c.z < 0 || c.x >= L.length || c.z >= L.width) return [];
    const out: number[] = [];
    for (let l = 0; l < L.levels; l++) {
      const cell = L.cells[l]![c.x]![c.z]!;
      switch (cell.kind) {
        case 'hold':
        case 'deck':
        case 'roof':
        case 'room':
          out.push(l * levelHeight);
          break;
        case 'stairLow': {
          const r = L.ramps.find((rr) => rr.x === c.x && rr.z === c.z && rr.level === l);
          if (r) out.push(rampHeight(r, x, z));
          break;
        }
        default:
          break;
      }
    }
    return out;
  }

  /** Superficie de apoyo para unos pies a altura `footY` (null si no hay suelo). */
  groundAt(x: number, z: number, footY: number): number | null {
    let best: number | null = null;
    for (const s of this.surfaces(x, z)) {
      if (s <= footY + STEP_HEIGHT && (best === null || s > best)) best = s;
    }
    return best;
  }

  /** Empuja un círculo fuera de los colisionadores que solapan verticalmente. */
  resolve(x: number, z: number, footY: number, radius = PLAYER_RADIUS, height = PLAYER_HEIGHT): { x: number; z: number } {
    let px = x;
    let pz = z;
    // Lo que no supera la altura de un escalón no bloquea (p. ej. el remate de la pared del nivel
    // inferior al final de una rampa: sin esto no se puede coronar ninguna escalera).
    const y0 = footY + STEP_HEIGHT;
    const y1 = footY + height;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.nearby(px, pz)) {
        if (b.maxY <= y0 || b.minY >= y1) continue;
        const cx = clamp(px, b.minX, b.maxX);
        const cz = clamp(pz, b.minZ, b.maxZ);
        let dx = px - cx;
        let dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          px += (dx / d) * push;
          pz += (dz / d) * push;
        } else {
          // Centro dentro de la caja: salir por el lado más cercano.
          const left = px - b.minX;
          const right = b.maxX - px;
          const back = pz - b.minZ;
          const front = b.maxZ - pz;
          const m = Math.min(left, right, back, front);
          if (m === left) px = b.minX - radius;
          else if (m === right) px = b.maxX + radius;
          else if (m === back) pz = b.minZ - radius;
          else pz = b.maxZ + radius;
          dx = 0;
          dz = 0;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return { x: px, z: pz };
  }

  /** ¿Está libre la posición (para colocar habitantes o restos)? */
  isFree(x: number, z: number, footY: number, radius = PLAYER_RADIUS): boolean {
    const r = this.resolve(x, z, footY, radius);
    return Math.abs(r.x - x) < 1e-4 && Math.abs(r.z - z) < 1e-4 && this.groundAt(x, z, footY) !== null;
  }

  /**
   * Mueve un cuerpo con velocidad horizontal deseada (m/s) durante dt segundos.
   * Gestiona colisiones, escalones, rampas, gravedad y salto.
   */
  move(body: Body, vx: number, vz: number, dt: number, jump: boolean): void {
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) this.step(body, vx, vz, h, jump && s === 0);
  }

  private step(body: Body, vx: number, vz: number, dt: number, jump: boolean): void {
    const p = body.pos;
    const tryMove = (nx: number, nz: number): boolean => {
      const r = this.resolve(nx, nz, p.y);
      const g = this.groundAt(r.x, r.z, p.y);
      if (g === null) return false;
      if (g > p.y + STEP_HEIGHT) return false;
      p.x = r.x;
      p.z = r.z;
      return true;
    };
    const nx = p.x + vx * dt;
    const nz = p.z + vz * dt;
    if (!tryMove(nx, nz)) {
      if (!tryMove(nx, p.z)) tryMove(p.x, nz);
    }
    // Vertical.
    if (jump && body.onGround) {
      body.vy = JUMP_SPEED;
      body.onGround = false;
    }
    const ground = this.groundAt(p.x, p.z, p.y);
    if (body.onGround && body.vy <= 0) {
      if (ground !== null && p.y - ground <= 0.6) {
        p.y = ground;
        body.vy = 0;
        return;
      }
      body.onGround = false;
    }
    body.vy -= GRAVITY * dt;
    const prevY = p.y;
    p.y += body.vy * dt;
    const g2 = this.groundAt(p.x, p.z, Math.max(prevY, p.y));
    if (g2 !== null && p.y <= g2) {
      p.y = g2;
      body.vy = 0;
      body.onGround = true;
    }
  }

  /** Punto seguro de reaparición (cubierta principal). */
  safeSpawn(): Vec3 {
    const k = referenceCell(this.layout);
    if (k) {
      const [, x, z] = k.split(',').map(Number) as [number, number, number];
      const m = cellMin(x, z, this.layout.width);
      return { x: m.x + CELL / 2, y: levelHeight, z: m.z + CELL / 2 };
    }
    return { x: 0, y: levelHeight, z: 0 };
  }

  /** Celda del layout donde está el cuerpo (según superficie de apoyo). */
  cellOf(pos: Vec3): ReturnType<typeof getCell> {
    const c = pointToCell(pos.x, pos.z, this.layout.width);
    const level = Math.max(0, Math.min(this.layout.levels - 1, Math.floor((pos.y + 0.6) / levelHeight)));
    return getCell(this.layout, level, c.x, c.z);
  }
}

export function rampHeight(r: Ramp, x: number, z: number): number {
  let t: number;
  if (r.dx === 1) t = (x - r.minX) / CELL;
  else if (r.dx === -1) t = (r.maxX - x) / CELL;
  else if (r.dz === 1) t = (z - r.minZ) / CELL;
  else t = (r.maxZ - z) / CELL;
  return r.y0 + clamp(t, 0, 1) * (r.y1 - r.y0);
}

/** Vector "adelante" para un yaw. */
export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

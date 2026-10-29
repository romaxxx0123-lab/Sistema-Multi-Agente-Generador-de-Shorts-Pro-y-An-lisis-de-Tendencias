/**
 * Cámara orbital del modo construcción (lógica pura, sin DOM).
 *
 * La cámara orbita alrededor de un punto objetivo expresado en coordenadas LOCALES del barco
 * (x eslora, z manga, y altura). `yaw` y `pitch` son ángulos del mundo: con yaw = 0 la cámara
 * queda en +z (estribor) mirando hacia -z. Cada parámetro tiene un valor "meta" (lo que pide
 * el jugador) y un valor actual que lo persigue con amortiguación exponencial, para que todos
 * los movimientos sean suaves sea cual sea la velocidad de fotogramas.
 */
import * as THREE from 'three';
import { clamp } from '../core/math';

export interface OrbitParams {
  yaw: number;
  pitch: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
}

/** Límites de la cámara. */
export const ORBIT_LIMITS = {
  minDist: 9,
  maxDist: 95,
  /** ≈ 9°: casi a ras de agua. */
  minPitch: 0.16,
  /** ≈ 84°: vista cenital. */
  maxPitch: 1.47,
  /** Margen (m) que puede salirse el objetivo del casco al desplazar. */
  panMargin: 6,
};

/** Vista por defecto: tres cuartos desde estribor y algo hacia popa. */
export const DEFAULT_YAW = -0.62;
export const DEFAULT_PITCH = 0.6;

/** Rapidez de la amortiguación (1/s). */
const DAMP = 11;

export class OrbitRig {
  readonly goal: OrbitParams = { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: 40, tx: 0, ty: 4, tz: 0 };
  readonly cur: OrbitParams = { ...this.goal };
  /** Límites del objetivo en planta (metros locales). */
  private bounds = { minX: -30, maxX: 30, minZ: -10, maxZ: 10 };

  /** Fija los límites del objetivo según el casco (se añade `panMargin`). */
  setBounds(minX: number, maxX: number, minZ: number, maxZ: number): void {
    const m = ORBIT_LIMITS.panMargin;
    this.bounds = { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m };
    this.clampGoal();
  }

  /** Coloca la cámara en una vista sin transición. */
  snap(p: Partial<OrbitParams>): void {
    Object.assign(this.goal, p);
    this.clampGoal();
    Object.assign(this.cur, this.goal);
  }

  /** Cambia la vista con transición. */
  set(p: Partial<OrbitParams>): void {
    Object.assign(this.goal, p);
    this.clampGoal();
  }

  orbit(dYaw: number, dPitch: number): void {
    this.goal.yaw += dYaw;
    this.goal.pitch += dPitch;
    this.clampGoal();
  }

  /** Acerca (pasos < 0) o aleja (pasos > 0) la cámara de forma multiplicativa. */
  zoom(steps: number): void {
    this.goal.dist *= Math.pow(1.13, steps);
    this.clampGoal();
  }

  /**
   * Desplaza el objetivo en el plano horizontal relativo a la vista: `forward` hacia donde
   * mira la cámara y `right` a su derecha (metros).
   */
  pan(right: number, forward: number): void {
    const y = this.goal.yaw;
    // Derecha = (cos yaw, -sin yaw); adelante (de la cámara al objetivo) = (-sin yaw, -cos yaw).
    this.goal.tx += Math.cos(y) * right - Math.sin(y) * forward;
    this.goal.tz += -Math.sin(y) * right - Math.cos(y) * forward;
    this.clampGoal();
  }

  /** Avanza la amortiguación. */
  update(dt: number): void {
    const k = 1 - Math.exp(-DAMP * Math.max(0, dt));
    const c = this.cur;
    const g = this.goal;
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitch += (g.pitch - c.pitch) * k;
    // La distancia se interpola en escala logarítmica: el zoom se siente uniforme.
    c.dist = Math.exp(Math.log(c.dist) + (Math.log(g.dist) - Math.log(c.dist)) * k);
    c.tx += (g.tx - c.tx) * k;
    c.ty += (g.ty - c.ty) * k;
    c.tz += (g.tz - c.tz) * k;
  }

  /** ¿Sigue moviéndose la cámara? */
  get settling(): boolean {
    const c = this.cur;
    const g = this.goal;
    return (
      Math.abs(c.yaw - g.yaw) > 1e-3 ||
      Math.abs(c.pitch - g.pitch) > 1e-3 ||
      Math.abs(c.dist - g.dist) > 1e-2 ||
      Math.abs(c.tx - g.tx) + Math.abs(c.ty - g.ty) + Math.abs(c.tz - g.tz) > 1e-2
    );
  }

  /** Desplazamiento cámara − objetivo para unos parámetros. */
  static offset(p: Pick<OrbitParams, 'yaw' | 'pitch' | 'dist'>, out: THREE.Vector3): THREE.Vector3 {
    const cp = Math.cos(p.pitch);
    return out.set(Math.sin(p.yaw) * cp * p.dist, Math.sin(p.pitch) * p.dist, Math.cos(p.yaw) * cp * p.dist);
  }

  private clampGoal(): void {
    const g = this.goal;
    const b = this.bounds;
    g.pitch = clamp(g.pitch, ORBIT_LIMITS.minPitch, ORBIT_LIMITS.maxPitch);
    g.dist = clamp(g.dist, ORBIT_LIMITS.minDist, ORBIT_LIMITS.maxDist);
    g.tx = clamp(g.tx, b.minX, b.maxX);
    g.tz = clamp(g.tz, b.minZ, b.maxZ);
    if (!Number.isFinite(g.yaw)) g.yaw = DEFAULT_YAW;
  }
}

/**
 * Distancia que encuadra un barco de `lengthM` metros de eslora en vista 3/4 con una cámara de
 * `fovDeg` grados, dejando sitio a la paleta inferior (que tapa ~40 % del alto).
 */
export function fitDistance(lengthM: number, fovDeg: number, aspect: number): number {
  const vHalf = THREE.MathUtils.degToRad(fovDeg) / 2;
  const hHalf = Math.atan(Math.tan(vHalf) * Math.max(0.5, aspect));
  // La eslora más la proa y el bauprés, con margen; en 3/4 se ve algo acortada (×0,85).
  const half = (lengthM + 14) * 0.5 * 0.85;
  // Solo el 60 % superior de la pantalla queda libre: el encuadre horizontal se reduce igual.
  const d = half / (Math.tan(hHalf) * 0.62);
  return clamp(d, ORBIT_LIMITS.minDist + 6, ORBIT_LIMITS.maxDist - 5);
}

/**
 * MOVIMIENTO DEL BARCO sobre las olas: cabeceo (rotación sobre z), balanceo (sobre x) y arfada
 * (y). Se ajusta un plano por mínimos cuadrados a la altura del oleaje (sin la ola que levanta el
 * propio barco) en 9 puntos del casco y el
 * barco lo sigue con un muelle amortiguado (un casco grande no copia cada ola: filtra las cortas
 * y responde con inercia). Se añade la escora constante del viento y, en tormenta, un balanceo
 * propio con su periodo natural. El giro es alrededor del centro del casco en la flotación.
 *
 * En calma queda en torno a ±1,5°; en tormenta, varios grados.
 */
import * as THREE from 'three';
import { WATERLINE_Y } from '../../sim/constants';
import type { HullProfile, WaveField } from './waves';

/** Límites de seguridad (rad / m). */
export const MAX_PITCH = 0.1;
export const MAX_ROLL = 0.16;
export const MAX_HEAVE = 1.4;

interface Dof {
  x: number;
  v: number;
}

function spring(d: Dof, target: number, dt: number, w0: number, zeta: number): void {
  // Euler semiimplícito en subpasos (estable con dt de hasta 0,1 s).
  const n = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = w0 * w0 * (target - d.x) - 2 * zeta * w0 * d.v;
    d.v += a * h;
    d.x += d.v * h;
  }
}

export class ShipMotion {
  readonly pitch: Dof = { x: 0, v: 0 };
  readonly roll: Dof = { x: 0, v: 0 };
  readonly heave: Dof = { x: 0, v: 0 };
  private t = 0;
  private first = true;
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private pivot = new THREE.Vector3();
  private tmp = new THREE.Vector3();

  /** Objetivos instantáneos (para pruebas). */
  targets(w: WaveField, hull: HullProfile, wind: number, windDir: number, storm: number): { pitch: number; roll: number; heave: number } {
    const L = hull.xMax - hull.xMin;
    const cx = (hull.xMin + hull.xMax) / 2;
    let hwMax = 0;
    for (const v of hull.hw) hwMax = Math.max(hwMax, v);
    const xs = [hull.xMin + 0.12 * L, cx, hull.xMax - 0.18 * L];
    const zs = [-hwMax * 0.85, 0, hwMax * 0.85];
    let sum = 0;
    let sx = 0;
    let sxx = 0;
    let sz = 0;
    let szz = 0;
    for (const x of xs) {
      for (const z of zs) {
        const h = w.heightAt(x, z, false);
        sum += h;
        sx += h * (x - cx);
        sxx += (x - cx) * (x - cx);
        sz += h * z;
        szz += z * z;
      }
    }
    const a = sum / 9;
    const b = sx / sxx;
    const c = sz / szz;
    const heel = wind * wind * 0.022 * Math.sin(windDir);
    const stormRoll = storm * 0.04 * Math.sin((this.t * Math.PI * 2) / 8.5) + storm * 0.015 * Math.sin((this.t * Math.PI * 2) / 5.3 + 1.1);
    const stormPitch = storm * 0.012 * Math.sin((this.t * Math.PI * 2) / 6.7 + 0.4);
    return {
      pitch: Math.atan(b) * 0.75 + stormPitch,
      roll: -Math.atan(c) * 0.85 + heel + stormRoll,
      heave: a * 0.8,
    };
  }

  /** Coloca el barco al instante en su actitud de equilibrio (carga / partida nueva). */
  reset(): void {
    this.first = true;
  }

  update(dt: number, w: WaveField, hull: HullProfile, wind: number, windDir: number, storm: number, root: THREE.Object3D): void {
    this.t += dt;
    const tg = this.targets(w, hull, wind, windDir, storm);
    if (this.first) {
      this.first = false;
      this.pitch.x = tg.pitch;
      this.roll.x = tg.roll;
      this.heave.x = tg.heave;
      this.pitch.v = this.roll.v = this.heave.v = 0;
    } else if (dt > 0) {
      spring(this.pitch, tg.pitch, dt, 1.25, 0.75);
      spring(this.roll, tg.roll, dt, 1.05, 0.55);
      spring(this.heave, tg.heave, dt, 1.4, 0.7);
    }
    const p = THREE.MathUtils.clamp(this.pitch.x, -MAX_PITCH, MAX_PITCH);
    const r = THREE.MathUtils.clamp(this.roll.x, -MAX_ROLL, MAX_ROLL);
    const hv = THREE.MathUtils.clamp(this.heave.x, -MAX_HEAVE, MAX_HEAVE);
    this.apply(root, p, r, hv, (hull.xMin + hull.xMax) / 2);
  }

  /** Rotación alrededor de (cx, flotación + 0,5, 0) más la arfada. */
  apply(root: THREE.Object3D, pitch: number, roll: number, heave: number, cx: number): void {
    this.e.set(roll, 0, pitch, 'XYZ');
    this.q.setFromEuler(this.e);
    this.pivot.set(cx, WATERLINE_Y + 0.5, 0);
    this.tmp.copy(this.pivot).applyQuaternion(this.q);
    root.quaternion.copy(this.q);
    root.position.set(this.pivot.x - this.tmp.x, this.pivot.y - this.tmp.y + heave, this.pivot.z - this.tmp.z);
    root.updateMatrix();
    if (root.parent) root.matrixWorld.multiplyMatrices(root.parent.matrixWorld, root.matrix);
    else root.matrixWorld.copy(root.matrix);
  }

  /** Ángulos actuales en grados (depuración). */
  get degrees(): { pitch: number; roll: number; heave: number } {
    return { pitch: THREE.MathUtils.radToDeg(this.pitch.x), roll: THREE.MathUtils.radToDeg(this.roll.x), heave: this.heave.x };
  }
}

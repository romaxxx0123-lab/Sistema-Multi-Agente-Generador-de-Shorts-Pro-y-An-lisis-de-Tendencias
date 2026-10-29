/**
 * RELÁMPAGOS: cuando la simulación marca un rayo (`weather.lightning` sube), se dibuja un rayo
 * quebrado con ramas entre las nubes y el mar a cierta distancia y se genera un destello con
 * parpadeo (`flash`, 0..1) que aclaran el cielo, las nubes y la luz ambiente.
 */
import * as THREE from 'three';

/** Perfil temporal del destello (s → intensidad): golpe, rebote y caída. */
export function flashProfile(t: number): number {
  if (t < 0 || t > 1.2) return 0;
  if (t < 0.06) return 1;
  if (t < 0.11) return 0.25;
  if (t < 0.17) return 0.85;
  return Math.max(0, 0.85 * Math.exp(-(t - 0.17) * 7));
}

export class Lightning {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private last = 0;
  private t = 99;
  private seed = 1;
  /** Destello actual 0..1. */
  flash = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: '#eef2ff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.name = 'rayo';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /**
   * Construye un rayo quebrado como cinta orientada hacia la cámara. La mayoría (85 %) caen dentro
   * del campo de visión (`viewAz`), para que el jugador los vea.
   */
  private buildBolt(camPos: THREE.Vector3, viewAz: number | null): void {
    const az = viewAz !== null && this.rnd() < 0.85 ? viewAz + (this.rnd() - 0.5) * 1.0 : this.rnd() * Math.PI * 2;
    const dist = 380 + this.rnd() * 520;
    const bx = camPos.x + Math.cos(az) * dist;
    const bz = camPos.z + Math.sin(az) * dist;
    // Eje lateral de la cinta: perpendicular a la visual.
    const side = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    const pos: number[] = [];
    const ribbon = (pts: THREE.Vector3[], w0: number, w1: number): void => {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[i + 1]!;
        const wa = w0 + (w1 - w0) * (i / (pts.length - 1));
        const wb = w0 + (w1 - w0) * ((i + 1) / (pts.length - 1));
        const a0 = a.clone().addScaledVector(side, -wa);
        const a1 = a.clone().addScaledVector(side, wa);
        const b0 = b.clone().addScaledVector(side, -wb);
        const b1 = b.clone().addScaledVector(side, wb);
        pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      }
    };
    const top = 175 + this.rnd() * 40;
    const main: THREE.Vector3[] = [];
    let x = bx;
    let z = bz;
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const y = top * (1 - i / steps);
      main.push(new THREE.Vector3(x, y, z));
      const j = (this.rnd() - 0.5) * 26;
      x += side.x * j;
      z += side.z * j;
    }
    ribbon(main, 2.2, 1.3);
    // Ramas.
    const branches = 2 + Math.floor(this.rnd() * 3);
    for (let b = 0; b < branches; b++) {
      const startI = 2 + Math.floor(this.rnd() * (steps - 6));
      const start = main[startI]!.clone();
      const pts = [start];
      const dirS = this.rnd() < 0.5 ? -1 : 1;
      const n = 3 + Math.floor(this.rnd() * 4);
      for (let i = 0; i < n; i++) {
        const p = pts[pts.length - 1]!.clone();
        p.y -= 9 + this.rnd() * 10;
        p.addScaledVector(side, dirS * (6 + this.rnd() * 12));
        pts.push(p);
      }
      ribbon(pts, 1.1, 0.3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
  }

  /**
   * @param value `weather.lightning` (minutos de destello restantes; >0 durante el rayo).
   * @param viewAz azimut de la mirada de la cámara (atan2(z, x)) o null.
   */
  update(dt: number, value: number, camPos: THREE.Vector3, viewAz: number | null = null): void {
    const v = Number.isFinite(value) ? value : 0;
    if (v > 0 && (this.last <= 0 || v > this.last + 1e-4)) {
      this.t = 0;
      this.buildBolt(camPos, viewAz);
    }
    this.last = v;
    this.t += dt;
    this.flash = flashProfile(this.t);
    const boltVis = this.t < 0.32 ? flashProfile(this.t) : 0;
    this.mesh.visible = boltVis > 0.02;
    this.material.opacity = Math.min(1, boltVis * 1.1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

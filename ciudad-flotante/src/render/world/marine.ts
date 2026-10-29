/**
 * VIDA MARINA: peces que saltan cuando hay un banco de peces (evento `banco_peces`) y delfines
 * que, de vez en cuando y con buen tiempo, acompañan a la proa saltando en arco. Mallas
 * instanciadas; las salpicaduras de entrada y salida las pone `Spray.burst`.
 */
import * as THREE from 'three';
import { Kit, makeRng } from './kit';
import type { HullProfile } from './waves';

interface Jumper {
  active: boolean;
  /** Avance del salto 0..1. */
  t: number;
  dur: number;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  len: number;
  h: number;
  /** El salto se desplaza con el agua (peces) o acompaña al barco (delfines). */
  withWater: boolean;
  splashed: boolean;
}

function fishGeometry(): THREE.BufferGeometry {
  const k = new Kit(9, 0.06);
  k.add(new THREE.OctahedronGeometry(0.5, 0), '#b8c4cc', { s: [0.45, 0.14, 0.09] });
  k.add(new THREE.OctahedronGeometry(0.5, 0), '#4f6d80', { p: [0.02, 0.03, 0], s: [0.4, 0.08, 0.07] });
  k.poly(
    [
      [-0.2, 0, 0],
      [-0.34, 0.09, 0],
      [-0.34, -0.09, 0],
    ],
    '#8fa3b0',
  );
  return k.build();
}

function dolphinGeometry(): THREE.BufferGeometry {
  const k = new Kit(19, 0.05);
  k.add(new THREE.IcosahedronGeometry(0.5, 1), '#6c7a86', { s: [2.3, 0.55, 0.6] });
  k.add(new THREE.IcosahedronGeometry(0.5, 1), '#c9d1d6', { p: [0.1, -0.1, 0], s: [1.9, 0.36, 0.46] });
  k.cone(0.12, 0.45, 6, '#6c7a86', { p: [1.3, -0.02, 0], r: [0, 0, -Math.PI / 2] });
  // Aleta dorsal, pectorales y cola
  k.poly(
    [
      [0.1, 0.2, 0],
      [-0.25, 0.62, 0],
      [-0.4, 0.2, 0],
    ],
    '#5a6773',
  );
  for (const s of [1, -1]) {
    k.poly(
      [
        [0.4, -0.12, 0.2 * s],
        [0.05, -0.3, 0.55 * s],
        [0.15, -0.12, 0.2 * s],
      ],
      '#5a6773',
    );
  }
  k.add(new THREE.ConeGeometry(0.16, 0.9, 6), '#6c7a86', { p: [-1.45, 0.02, 0], r: [0, 0, Math.PI / 2] });
  k.poly(
    [
      [-1.85, 0.02, 0],
      [-2.2, 0.02, 0.45],
      [-2.05, 0.02, 0],
      [-2.2, 0.02, -0.45],
    ],
    '#5a6773',
  );
  return k.build();
}

const FISH = 14;
const DOLPHINS = 4;

export class MarineLife {
  readonly fishMesh: THREE.InstancedMesh;
  readonly dolphinMesh: THREE.InstancedMesh;
  private material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private fish: Jumper[] = [];
  private dolphins: (Jumper & { slot: number; next: number })[] = [];
  private rnd = makeRng(1234);
  private fishTimer = 0;
  /** Episodio de delfines: segundos restantes (0 = no hay). */
  private pod = 0;
  private podTimer = 90;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor() {
    this.fishMesh = new THREE.InstancedMesh(fishGeometry(), this.material, FISH);
    this.dolphinMesh = new THREE.InstancedMesh(dolphinGeometry(), this.material, DOLPHINS);
    for (const mesh of [this.fishMesh, this.dolphinMesh]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
    }
    this.fishMesh.name = 'peces';
    this.dolphinMesh.name = 'delfines';
    for (let i = 0; i < FISH; i++) this.fish.push(this.blank());
    for (let i = 0; i < DOLPHINS; i++) this.dolphins.push({ ...this.blank(), slot: i, next: i * 0.9 });
  }

  private blank(): Jumper {
    return { active: false, t: 0, dur: 1, x: 0, z: 0, dirX: 1, dirZ: 0, len: 2, h: 1, withWater: true, splashed: false };
  }

  /** Delfines en este momento (pruebas/depuración). */
  get podActive(): boolean {
    return this.pod > 0;
  }

  /** Fuerza un episodio de delfines (depuración). */
  startPod(seconds = 40): void {
    this.pod = seconds;
  }

  /**
   * @param fishBank hay banco de peces
   * @param dolphinsOk el tiempo y la región permiten delfines
   * @param ds desplazamiento del agua hacia popa en este frame (m)
   * @param water altura del agua
   * @param splash callback de salpicadura (x, y, z, tamaño)
   */
  update(
    dt: number,
    fishBank: boolean,
    dolphinsOk: boolean,
    ds: number,
    hull: HullProfile,
    shipSpeed: number,
    water: (x: number, z: number) => number,
    splash: (x: number, y: number, z: number, big: boolean) => void,
  ): void {
    let hwMax = 0;
    for (const v of hull.hw) hwMax = Math.max(hwMax, v);
    // --- Peces ---
    if (fishBank) {
      this.fishTimer -= dt;
      if (this.fishTimer <= 0) {
        this.fishTimer = 0.25 + this.rnd() * 0.9;
        const j = this.fish.find((f) => !f.active);
        if (j) {
          const side = this.rnd() < 0.5 ? -1 : 1;
          j.active = true;
          j.t = 0;
          j.dur = 0.7 + this.rnd() * 0.5;
          j.x = hull.xMin + this.rnd() * (hull.xMax - hull.xMin + 20);
          j.z = side * (hwMax + 4 + this.rnd() * 30);
          const a = this.rnd() * Math.PI * 2;
          j.dirX = Math.cos(a);
          j.dirZ = Math.sin(a);
          j.len = 1.6 + this.rnd() * 1.6;
          j.h = 0.7 + this.rnd() * 0.9;
          j.withWater = true;
          j.splashed = false;
        }
      }
    }
    // --- Delfines ---
    if (this.pod > 0) this.pod -= dt;
    else if (dolphinsOk) {
      this.podTimer -= dt;
      if (this.podTimer <= 0) {
        this.pod = 35 + this.rnd() * 30;
        this.podTimer = 240 + this.rnd() * 300;
      }
    }
    for (const d of this.dolphins) {
      if (d.active || this.pod <= 0) continue;
      d.next -= dt;
      if (d.next > 0) continue;
      d.next = 1.6 + this.rnd() * 1.6;
      const side = d.slot % 2 ? -1 : 1;
      d.active = true;
      d.t = 0;
      d.dur = 1.1 + this.rnd() * 0.3;
      // Junto a la proa, nadando a la par del barco.
      d.x = hull.xMax - 6 + d.slot * 2.5 + this.rnd() * 4;
      d.z = side * (hwMax * 0.6 + 3 + (d.slot >> 1) * 3 + this.rnd() * 2);
      d.dirX = 1;
      d.dirZ = side * 0.05;
      d.len = 4.5 + this.rnd();
      d.h = 1.0 + this.rnd() * 0.5;
      d.withWater = false;
      d.splashed = false;
    }

    let nf = 0;
    for (const f of this.fish) {
      if (!f.active) continue;
      if (f.withWater) f.x -= ds;
      if (!this.place(f, dt, water, splash, false)) continue;
      this.fishMesh.setMatrixAt(nf++, this.m);
    }
    this.fishMesh.count = nf;
    this.fishMesh.instanceMatrix.needsUpdate = nf > 0;
    let nd = 0;
    for (const d of this.dolphins) {
      if (!d.active) continue;
      // Avanzan con el barco: su salto es relativo al agua, que va hacia popa.
      void shipSpeed;
      if (!this.place(d, dt, water, splash, true)) continue;
      this.dolphinMesh.setMatrixAt(nd++, this.m);
    }
    this.dolphinMesh.count = nd;
    this.dolphinMesh.instanceMatrix.needsUpdate = nd > 0;
  }

  /** Coloca un saltador en su arco; devuelve false si ya ha terminado. */
  private place(j: Jumper, dt: number, water: (x: number, z: number) => number, splash: (x: number, y: number, z: number, big: boolean) => void, big: boolean): boolean {
    j.t += dt / j.dur;
    const x0 = j.x;
    const z0 = j.z;
    if (!j.splashed) {
      j.splashed = true;
      splash(x0, water(x0, z0), z0, big);
    }
    if (j.t >= 1) {
      j.active = false;
      const xe = x0 + j.dirX * j.len;
      const ze = z0 + j.dirZ * j.len;
      splash(xe, water(xe, ze), ze, big);
      return false;
    }
    const t = j.t;
    const x = x0 + j.dirX * j.len * t;
    const z = z0 + j.dirZ * j.len * t;
    const y = water(x, z) + j.h * 4 * t * (1 - t) - 0.15;
    const slope = (j.h * 4 * (1 - 2 * t)) / j.len;
    this.e.set(0, Math.atan2(-j.dirZ, j.dirX), Math.atan(slope), 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.m.compose(this.p, this.q, this.s);
    return true;
  }

  dispose(): void {
    this.fishMesh.geometry.dispose();
    this.dolphinMesh.geometry.dispose();
    this.material.dispose();
    this.fishMesh.dispose();
    this.dolphinMesh.dispose();
  }
}

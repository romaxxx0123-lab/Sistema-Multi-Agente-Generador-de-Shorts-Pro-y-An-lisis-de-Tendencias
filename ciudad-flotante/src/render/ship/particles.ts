/**
 * Partículas low-poly del barco: humo (chimenea, generador, averías, incendios), vapor de la
 * cocina, chispas de averías y goteo de fugas. Dos InstancedMesh (bocanadas y chispas), con
 * un número fijo de instancias: coste constante y una sola llamada de dibujo cada una.
 *
 * Las partículas viven en coordenadas locales del barco y las arrastra el viento aparente
 * (viento real + avance del barco). Las que están en niveles ocultos no se dibujan.
 */
import * as THREE from 'three';
import { LEVEL_H, WALL_H } from '../../sim/constants';

export type PuffKind = 'smoke' | 'darkSmoke' | 'steam' | 'exhaust';
export type SparkKind = 'spark' | 'ember' | 'drip';

interface Puff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  s0: number;
  s1: number;
  rot: number;
  level: number;
  color: THREE.Color;
  /** Cuánto le afecta el viento (0..1). */
  drag: number;
  /** Techo bajo el que se queda el humo (bajo cubierta) o Infinity. */
  ceil: number;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  level: number;
  color: THREE.Color;
  gravity: number;
  floorY: number;
}

const PUFF_COLORS: Record<PuffKind, THREE.Color> = {
  smoke: new THREE.Color('#9aa3a8'),
  darkSmoke: new THREE.Color('#3b3f44'),
  steam: new THREE.Color('#f2f4f3'),
  exhaust: new THREE.Color('#6c7378'),
};
const SPARK_COLORS: Record<SparkKind, THREE.Color> = {
  spark: new THREE.Color('#ffe08a'),
  ember: new THREE.Color('#ff8c3a'),
  drip: new THREE.Color('#7fd0f0'),
};

const MAX_PUFFS = 420;
const MAX_SPARKS = 160;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Particles {
  readonly puffMesh: THREE.InstancedMesh;
  readonly sparkMesh: THREE.InstancedMesh;
  private puffs: Puff[] = [];
  private sparks: Spark[] = [];
  /** Semilla para variaciones (no se usa Math.random fuera de la simulación por coherencia visual). */
  private seed = 1;

  constructor(parent: THREE.Object3D) {
    const puffGeo = new THREE.IcosahedronGeometry(1, 0);
    const puffMat = new THREE.MeshLambertMaterial({ color: '#ffffff', transparent: true, opacity: 0.82, depthWrite: false });
    this.puffMesh = new THREE.InstancedMesh(puffGeo, puffMat, MAX_PUFFS);
    this.puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.puffMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3);
    this.puffMesh.count = 0;
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 2;
    this.puffMesh.name = 'particulas-humo';
    const sparkGeo = new THREE.TetrahedronGeometry(1, 0);
    const sparkMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    this.sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparkMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_SPARKS * 3), 3);
    this.sparkMesh.count = 0;
    this.sparkMesh.frustumCulled = false;
    this.sparkMesh.name = 'particulas-chispas';
    parent.add(this.puffMesh, this.sparkMesh);
  }

  /** Pseudoaleatorio visual determinista (no afecta a la simulación). */
  rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  get puffCount(): number {
    return this.puffs.length;
  }

  /** Emite una bocanada. `sheltered` = bajo techo: no la arrastra el viento y se disipa antes. */
  emitPuff(kind: PuffKind, x: number, y: number, z: number, level: number, size = 1, vy = 0.8, sheltered = false): void {
    if (this.puffs.length >= MAX_PUFFS) this.puffs.shift();
    const r = (): number => this.rnd() - 0.5;
    const big = kind === 'darkSmoke' ? 1.4 : kind === 'steam' ? 0.55 : kind === 'exhaust' ? 0.6 : 1;
    this.puffs.push({
      x: x + r() * 0.1 * size,
      y,
      z: z + r() * 0.1 * size,
      vx: r() * 0.3,
      vy: vy * (0.8 + this.rnd() * 0.4),
      vz: r() * 0.3,
      age: 0,
      life: (kind === 'steam' ? 1.6 : kind === 'exhaust' ? 2.2 : 3.6) * (0.8 + this.rnd() * 0.4) * (sheltered ? 0.55 : 1),
      s0: 0.12 * big * size,
      s1: 0.55 * big * size * (0.8 + this.rnd() * 0.4),
      rot: this.rnd() * 6,
      level,
      color: PUFF_COLORS[kind].clone().multiplyScalar(0.92 + this.rnd() * 0.16),
      drag: sheltered ? 0 : kind === 'steam' ? 0.5 : 1,
      ceil: sheltered ? level * LEVEL_H + WALL_H - 0.3 : Infinity,
    });
  }

  emitSpark(kind: SparkKind, x: number, y: number, z: number, level: number, floorY: number): void {
    if (this.sparks.length >= MAX_SPARKS) this.sparks.shift();
    const r = (): number => this.rnd() - 0.5;
    const drip = kind === 'drip';
    this.sparks.push({
      x,
      y,
      z,
      vx: drip ? r() * 0.1 : r() * 2.4,
      vy: drip ? 0 : 1.2 + this.rnd() * 2,
      vz: drip ? r() * 0.1 : r() * 2.4,
      age: 0,
      life: drip ? 1.2 : 0.5 + this.rnd() * 0.5,
      size: drip ? 0.035 : kind === 'ember' ? 0.045 : 0.03,
      level,
      color: SPARK_COLORS[kind],
      gravity: drip ? 9 : kind === 'ember' ? -0.6 : 7,
      floorY,
    });
  }

  /** Avanza y dibuja. `wind` = viento aparente (m/s) en coordenadas del barco. */
  update(dt: number, wind: THREE.Vector3, maxLevel: number): void {
    // Bocanadas
    let n = 0;
    const alive: Puff[] = [];
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) continue;
      alive.push(p);
      const k = Math.min(1, p.age * 0.9) * p.drag;
      p.vx += (wind.x - p.vx) * k * dt * 1.2;
      p.vz += (wind.z - p.vz) * k * dt * 1.2;
      p.vy *= 1 - 0.35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y > p.ceil) {
        // bajo techo: el humo se aplasta y se extiende por el techo
        p.y = p.ceil;
        p.vy = 0;
        if (Math.abs(p.vx) + Math.abs(p.vz) < 0.4) {
          p.vx += (this.rnd() - 0.5) * 0.8;
          p.vz += (this.rnd() - 0.5) * 0.8;
        }
      }
      p.rot += dt * 0.6;
      if (p.level > maxLevel) continue;
      const t = p.age / p.life;
      const grow = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      const s = grow * fade;
      _p.set(p.x, p.y, p.z);
      _q.setFromEuler(_e.set(p.rot, p.rot * 0.7, 0));
      _s.set(s, s * 0.85, s);
      _m.compose(_p, _q, _s);
      this.puffMesh.setMatrixAt(n, _m);
      this.puffMesh.setColorAt(n, p.color);
      n++;
    }
    this.puffs = alive;
    this.puffMesh.count = n;
    this.puffMesh.instanceMatrix.needsUpdate = true;
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;

    // Chispas y gotas
    let m = 0;
    const aliveS: Spark[] = [];
    for (const s of this.sparks) {
      s.age += dt;
      if (s.age >= s.life) continue;
      s.vy -= s.gravity * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.y < s.floorY) {
        s.y = s.floorY;
        s.vx *= 0.3;
        s.vz *= 0.3;
        s.vy = 0;
      }
      aliveS.push(s);
      if (s.level > maxLevel) continue;
      const k = 1 - s.age / s.life;
      _p.set(s.x, s.y, s.z);
      _q.setFromEuler(_e.set(s.age * 9, s.age * 7, 0));
      _s.setScalar(s.size * (0.4 + 0.6 * k));
      _m.compose(_p, _q, _s);
      this.sparkMesh.setMatrixAt(m, _m);
      this.sparkMesh.setColorAt(m, s.color);
      m++;
    }
    this.sparks = aliveS;
    this.sparkMesh.count = m;
    this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (this.sparkMesh.instanceColor) this.sparkMesh.instanceColor.needsUpdate = true;
  }

  clear(): void {
    this.puffs = [];
    this.sparks = [];
    this.puffMesh.count = 0;
    this.sparkMesh.count = 0;
  }

  dispose(): void {
    this.puffMesh.geometry.dispose();
    (this.puffMesh.material as THREE.Material).dispose();
    this.sparkMesh.geometry.dispose();
    (this.sparkMesh.material as THREE.Material).dispose();
    this.puffMesh.removeFromParent();
    this.sparkMesh.removeFromParent();
  }
}

/**
 * NUBES low-poly: cúmulos hechos de icosaedros instanciados (una sola llamada de dibujo). Derivan
 * hacia popa con el viaje y con el viento, aparecen/crecen al aumentar `weather.cloudiness`,
 * bajan, crecen y se oscurecen en tormenta, y se desvanecen en los bordes del campo.
 */
import * as THREE from 'three';
import type { Quality } from '../../game/types';
import type { Atmosphere } from './atmosphere';

interface Puff {
  ox: number;
  oy: number;
  oz: number;
  s: number;
  rot: THREE.Quaternion;
}

interface Cloud {
  x: number;
  z: number;
  y: number;
  size: number;
  /** Umbral de nubosidad a partir del cual aparece. */
  th: number;
  vis: number;
  puffs: Puff[];
}

const FIELD = 1500;
const EDGE = 320;
const COUNT: Record<Quality, number> = { baja: 18, media: 30, alta: 42 };

export class Clouds {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.MeshLambertMaterial;
  private clouds: Cloud[] = [];
  private rngState = 7;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private maxInstances: number;

  constructor(quality: Quality) {
    this.material = new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: new THREE.Color(0, 0, 0) });
    const geo = new THREE.IcosahedronGeometry(1, 1);
    // Base algo aplanada: las nubes de buen tiempo tienen la panza plana.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.25) pos.setY(i, -0.25 + (y + 0.25) * 0.35);
    }
    geo.computeVertexNormals();
    this.maxInstances = COUNT.alta * 11;
    this.mesh = new THREE.InstancedMesh(geo, this.material, this.maxInstances);
    this.mesh.name = 'nubes';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.build(quality);
  }

  private rnd(): number {
    this.rngState = (this.rngState * 16807) % 2147483647;
    return this.rngState / 2147483647;
  }

  private makeCloud(i: number, n: number): Cloud {
    const puffs: Puff[] = [];
    // Un cúmulo: un núcleo grande y lóbulos alrededor (alargado en x, base plana).
    const np = 6 + Math.floor(this.rnd() * 5);
    const stretch = 1.4 + this.rnd() * 0.8;
    for (let k = 0; k < np; k++) {
      const core = k === 0;
      const a = this.rnd() * Math.PI * 2;
      const d = core ? 0 : 0.45 + this.rnd() * 0.6;
      const s = core ? 1 : 0.5 + this.rnd() * 0.35;
      const e = new THREE.Euler(this.rnd() * 3, this.rnd() * 3, this.rnd() * 3);
      puffs.push({
        ox: Math.cos(a) * d * stretch,
        oy: core ? 0.15 : (1 - d) * 0.35 + this.rnd() * 0.15,
        oz: Math.sin(a) * d * 0.75,
        s,
        rot: new THREE.Quaternion().setFromEuler(e),
      });
    }
    return {
      x: (this.rnd() * 2 - 1) * FIELD,
      z: (this.rnd() * 2 - 1) * FIELD,
      y: 150 + this.rnd() * 110,
      size: 26 + this.rnd() * 30,
      // Umbrales repartidos: con cielo casi despejado solo quedan unas pocas nubes.
      th: ((i + this.rnd() * 0.8) / n) * 0.92,
      vis: 0,
      puffs,
    };
  }

  private build(q: Quality): void {
    this.rngState = 7;
    const n = COUNT[q];
    this.clouds = [];
    for (let i = 0; i < n; i++) this.clouds.push(this.makeCloud(i, n));
  }

  setQuality(q: Quality): void {
    const vis = new Map(this.clouds.map((c, i) => [i, c.vis]));
    this.build(q);
    this.clouds.forEach((c, i) => (c.vis = vis.get(i) ?? 0));
  }

  /** Ajusta la nubosidad visible al instante (al cargar una partida). */
  snap(cloudiness: number): void {
    for (const c of this.clouds) c.vis = cloudiness * 1.04 + 0.12 >= c.th ? 1 : 0;
  }

  /**
   * @param ds desplazamiento del agua hacia popa en este frame (m)
   * @param windX,windZ velocidad del viento (m/s) en el marco del océano
   */
  update(dt: number, ds: number, windX: number, windZ: number, cloudiness: number, atm: Atmosphere): void {
    const storm = atm.storm;
    let k = 0;
    for (const c of this.clouds) {
      // Las nubes van más despacio que el agua (paralaje: están lejos y altas).
      c.x += -ds * 0.6 + windX * dt;
      c.z += windZ * dt;
      if (c.x < -FIELD) {
        c.x += FIELD * 2;
        c.z = (this.rnd() * 2 - 1) * FIELD;
      } else if (c.x > FIELD) {
        c.x -= FIELD * 2;
        c.z = (this.rnd() * 2 - 1) * FIELD;
      }
      if (c.z < -FIELD) c.z += FIELD * 2;
      else if (c.z > FIELD) c.z -= FIELD * 2;
      const target = THREE.MathUtils.smoothstep(cloudiness * 1.04 + 0.12, c.th - 0.03, c.th + 0.06);
      c.vis += (target - c.vis) * Math.min(1, dt * 0.25);
      const edge = Math.min(FIELD - Math.abs(c.x), FIELD - Math.abs(c.z));
      const ef = THREE.MathUtils.smoothstep(edge, 0, EDGE);
      const sc = c.size * c.vis * ef * (1 + 0.45 * storm);
      const y = c.y * (1 - 0.3 * storm);
      for (const p of c.puffs) {
        if (k >= this.maxInstances) break;
        if (sc < 0.05) {
          this.m.makeScale(0, 0, 0);
        } else {
          this.p.set(c.x + p.ox * sc, y + p.oy * sc, c.z + p.oz * sc);
          const ps = p.s * sc;
          this.s.set(ps, ps * 0.78, ps);
          this.m.compose(this.p, p.rot, this.s);
        }
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.material.color.copy(atm.cloudColor);
    // Las nubes dispersan luz: algo de brillo propio las aleja del aspecto de "roca".
    this.material.emissive.copy(atm.cloudColor).multiplyScalar(0.05 + 0.17 * atm.day).add(atm.cloudGlow);
    this.material.emissive.r += 0.55 * atm.flash * 0.6;
    this.material.emissive.g += 0.6 * atm.flash * 0.6;
    this.material.emissive.b += 0.75 * atm.flash * 0.6;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/**
 * GAVIOTAS que acompañan al barco: vuelan en círculos sobre la cubierta y a los costados,
 * alternando aleteo y planeo. Una sola malla instanciada; el aleteo se hace en el vertex shader
 * (las alas se flexionan según la distancia al cuerpo). De día hay más (y más aún cerca de
 * islas o con banco de peces); de noche y con tormenta se retiran.
 */
import * as THREE from 'three';
import { Kit } from './kit';

interface Bird {
  /** Centro del círculo (marco del barco ≈ mundo). */
  cx: number;
  cz: number;
  r: number;
  y: number;
  /** Velocidad angular (rad/s, con signo). */
  w: number;
  a: number;
  phase: number;
  /** Presencia actual 0..1 (entran y salen volando). */
  vis: number;
  /** Umbral de presencia (las primeras aparecen antes). */
  th: number;
}

const MAX = 12;

function birdGeometry(): THREE.BufferGeometry {
  const k = new Kit(77, 0.04);
  // Cuerpo: octaedro alargado (x = adelante).
  k.add(new THREE.OctahedronGeometry(0.22, 0), '#f4f1ea', { s: [2.2, 0.85, 0.85] });
  // Cabeza y pico
  k.add(new THREE.OctahedronGeometry(0.12, 0), '#f4f1ea', { p: [0.48, 0.08, 0] });
  k.cone(0.04, 0.16, 4, '#e9b44c', { p: [0.62, 0.07, 0], r: [0, 0, -Math.PI / 2] });
  // Cola
  k.poly(
    [
      [-0.4, 0.02, 0],
      [-0.72, 0.02, 0.14],
      [-0.72, 0.02, -0.14],
    ],
    '#d9d6cf',
  );
  // Alas (dos tramos, punta oscura)
  for (const s of [1, -1]) {
    k.poly(
      [
        [0.18, 0.04, 0.08 * s],
        [-0.12, 0.04, 0.08 * s],
        [-0.16, 0.06, 0.62 * s],
        [0.12, 0.06, 0.6 * s],
      ],
      '#ecebe6',
    );
    k.poly(
      [
        [0.12, 0.06, 0.6 * s],
        [-0.16, 0.06, 0.62 * s],
        [-0.3, 0.02, 1.05 * s],
      ],
      '#4a4f55',
    );
  }
  return k.build();
}

export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private material: THREE.MeshLambertMaterial;
  private birds: Bird[] = [];
  private uniforms = { uTime: { value: 0 } };
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private t = 0;

  constructor() {
    const geo = birdGeometry();
    // Fase por instancia para el aleteo.
    const phase = new Float32Array(MAX);
    for (let i = 0; i < MAX; i++) phase[i] = (i * 2.399) % (Math.PI * 2);
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aPhase;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          {
            // Aleteo: ciclos de batida y planeo; la punta del ala se mueve más.
            float cyc = sin(uTime * 0.6 + aPhase * 3.0);
            float flap = sin(uTime * 9.0 + aPhase) * smoothstep(-0.2, 0.4, cyc);
            float d = abs(transformed.z);
            transformed.y += flap * d * 0.55 + d * d * 0.08;
          }`,
        );
    };
    this.material.customProgramCacheKey = () => 'ciudad-flotante-gaviotas-v1';
    this.mesh = new THREE.InstancedMesh(geo, this.material, MAX);
    this.mesh.name = 'gaviotas';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    let s = 31;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < MAX; i++) {
      this.birds.push({
        cx: -10 + rnd() * 30,
        cz: (rnd() - 0.5) * 24,
        r: 12 + rnd() * 26,
        y: 14 + rnd() * 16,
        w: (0.18 + rnd() * 0.2) * (rnd() < 0.5 ? -1 : 1),
        a: rnd() * Math.PI * 2,
        phase: rnd() * Math.PI * 2,
        vis: 0,
        th: (i + 0.5) / MAX,
      });
    }
  }

  /**
   * @param amount presencia deseada 0..1 (fracción de gaviotas)
   * @param shipX centro del barco (x)
   */
  update(dt: number, amount: number, shipX: number): void {
    this.t += dt;
    this.uniforms.uTime.value = this.t % 1000;
    let k = 0;
    for (const b of this.birds) {
      const target = amount > b.th ? 1 : 0;
      b.vis += (target - b.vis) * Math.min(1, dt * 0.35);
      b.a += b.w * dt;
      // Al irse, se alejan y suben; al venir, llegan desde lejos.
      const away = 1 - b.vis;
      const r = b.r + away * 260;
      const x = shipX + b.cx + Math.cos(b.a) * r;
      const z = b.cz + Math.sin(b.a) * r;
      const y = b.y + Math.sin(this.t * 0.4 + b.phase) * 2 + away * 60;
      // Rumbo tangente al círculo, alabeo hacia el centro.
      const heading = Math.atan2(-Math.cos(b.a) * Math.sign(b.w), -Math.sin(b.a) * Math.sign(b.w));
      this.e.set(-0.35 * Math.sign(b.w), heading, 0.05 * Math.sin(this.t + b.phase), 'YXZ');
      this.q.setFromEuler(this.e);
      const sc = b.vis > 0.02 ? 1.6 : 0;
      this.p.set(x, y, z);
      this.s.setScalar(sc);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(k++, this.m);
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

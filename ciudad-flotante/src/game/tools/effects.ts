/**
 * [AGENTE game-player] EFECTOS DE LAS HERRAMIENTAS en el mundo (marco de la escena = océano):
 *  - `Rope`: cuerda/sedal como `THREE.Line` con catenaria aproximada y vibración.
 *  - `Particles`: gotas, astillas y chispas low-poly (InstancedMesh) con gravedad.
 *  - `Ripples`: ondas que se abren sobre el agua al caer algo.
 *  - Mallas sueltas: garfio volando, corcho flotando y pez capturado.
 *
 * Todo se crea una vez y se reutiliza (sin asignaciones por frame).
 */
import * as THREE from 'three';
import { PALETTE } from '../../render/palette';
import { GeoBuilder } from '../../render/ship/geo';
import { buildBobber, buildFish, buildGrapnel } from './models';

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/* ------------------------------------------------------------------ */
/* Cuerda                                                              */
/* ------------------------------------------------------------------ */

export class Rope {
  readonly line: THREE.Line;
  private readonly pos: Float32Array;
  private t = 0;

  constructor(
    parent: THREE.Object3D,
    color: THREE.ColorRepresentation,
    readonly segments = 28,
  ) {
    this.pos = new Float32Array((segments + 1) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.renderOrder = 3;
    parent.add(this.line);
  }

  set visible(v: boolean) {
    this.line.visible = v;
  }

  get visible(): boolean {
    return this.line.visible;
  }

  /**
   * Tiende la cuerda de `a` a `b` (coordenadas de mundo). `sag` = flecha en el centro (m),
   * `wobble` = amplitud de vibración lateral (m), `dt` para animarla.
   */
  set(a: THREE.Vector3, b: THREE.Vector3, sag: number, wobble = 0, dt = 0): void {
    this.t += dt;
    const n = this.segments;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const hl = Math.hypot(dx, dz) || 1;
    // Perpendicular horizontal para la vibración.
    const px = -dz / hl;
    const pz = dx / hl;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const bow = 4 * u * (1 - u);
      const w = wobble ? Math.sin(u * Math.PI * 3 + this.t * 22) * wobble * bow : 0;
      this.pos[i * 3] = a.x + dx * u + px * w;
      this.pos[i * 3 + 1] = a.y + (b.y - a.y) * u - sag * bow;
      this.pos[i * 3 + 2] = a.z + dz * u + pz * w;
    }
    const attr = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Partículas                                                          */
/* ------------------------------------------------------------------ */

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  gravity: number;
  /** Se detienen al llegar a esta altura (agua, suelo) o -Infinity. */
  floor: number;
  r: number;
  g: number;
  b: number;
}

export interface BurstOptions {
  count: number;
  color: THREE.ColorRepresentation;
  /** Color alternativo (se mezcla al azar). */
  color2?: THREE.ColorRepresentation;
  speed: number;
  /** Velocidad vertical extra (m/s). */
  up?: number;
  /** Dirección principal (se suma a la dispersión). */
  dir?: THREE.Vector3;
  spread?: number;
  life?: number;
  size?: number;
  gravity?: number;
  floor?: number;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: Particle[] = [];

  constructor(
    parent: THREE.Object3D,
    readonly max = 220,
  ) {
    const geo = new THREE.OctahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'particulas-herramientas';
    parent.add(this.mesh);
  }

  burst(at: THREE.Vector3, o: BurstOptions): void {
    const c1 = new THREE.Color(o.color);
    const c2 = new THREE.Color(o.color2 ?? o.color);
    for (let i = 0; i < o.count; i++) {
      if (this.list.length >= this.max) this.list.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.4 + Math.random() * 0.8);
      const spread = o.spread ?? 1;
      const k = Math.random();
      _c.copy(c1).lerp(c2, k);
      const life = (o.life ?? 0.7) * (0.6 + Math.random() * 0.6);
      this.list.push({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: Math.cos(a) * sp * spread + (o.dir?.x ?? 0),
        vy: (o.up ?? 0) * (0.6 + Math.random() * 0.7) + (Math.random() - 0.3) * sp * spread + (o.dir?.y ?? 0),
        vz: Math.sin(a) * sp * spread + (o.dir?.z ?? 0),
        life,
        max: life,
        size: (o.size ?? 0.05) * (0.6 + Math.random() * 0.8),
        gravity: o.gravity ?? 9.8,
        floor: o.floor ?? -Infinity,
        r: _c.r,
        g: _c.g,
        b: _c.b,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.list.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor) {
        p.y = p.floor;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.life = Math.min(p.life, 0.12);
      }
    }
    for (const p of this.list) {
      if (n >= this.max) break;
      const s = p.size * Math.min(1, (p.life / p.max) * 2.5);
      _q.set(0, 0, 0, 1);
      _m.compose(_v.set(p.x, p.y, p.z), _q, _s.set(s, s, s));
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.setRGB(p.r, p.g, p.b));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get active(): number {
    return this.list.length;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Ondas sobre el agua                                                 */
/* ------------------------------------------------------------------ */

export class Ripples {
  private readonly rings: { mesh: THREE.Mesh; t: number; dur: number; size: number }[] = [];
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly geo: THREE.RingGeometry;

  constructor(parent: THREE.Object3D, count = 6) {
    this.geo = new THREE.RingGeometry(0.82, 1, 24);
    this.geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: PALETTE.foam, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat.clone());
      mesh.visible = false;
      mesh.renderOrder = 4;
      mesh.name = 'onda';
      parent.add(mesh);
      this.rings.push({ mesh, t: 1, dur: 1, size: 1 });
    }
  }

  spawn(at: THREE.Vector3, size = 1, dur = 0.9): void {
    let r = this.rings[0]!;
    for (const x of this.rings) if (x.t / x.dur > r.t / r.dur) r = x;
    r.t = 0;
    r.dur = dur;
    r.size = size;
    r.mesh.position.copy(at);
    r.mesh.visible = true;
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt;
      const u = r.t / r.dur;
      if (u >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const s = r.size * (0.25 + u * 1.1);
      r.mesh.scale.set(s, 1, s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - u);
    }
  }

  dispose(): void {
    for (const r of this.rings) {
      r.mesh.removeFromParent();
      (r.mesh.material as THREE.Material).dispose();
    }
    this.geo.dispose();
    this.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Mallas sueltas                                                      */
/* ------------------------------------------------------------------ */

function solid(build: (b: GeoBuilder) => void, mat: THREE.Material, name: string): THREE.Mesh {
  const b = new GeoBuilder();
  build(b);
  const m = new THREE.Mesh(b.build(), mat);
  m.name = name;
  m.castShadow = true;
  m.visible = false;
  return m;
}

/** Contenedor de todos los efectos de herramientas (vive en la escena). */
export class ToolEffects {
  readonly root = new THREE.Group();
  readonly particles: Particles;
  readonly ripples: Ripples;
  readonly hookRope: Rope;
  readonly fishLine: Rope;
  /** Garfio en vuelo (escala visible desde lejos). */
  readonly grapnel: THREE.Mesh;
  /** Corcho flotando. */
  readonly bobber: THREE.Mesh;
  /** Pez saliendo del agua. */
  readonly fish: THREE.Mesh;
  private readonly mat = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(scene: THREE.Object3D) {
    this.root.name = 'efectos-herramientas';
    scene.add(this.root);
    this.particles = new Particles(this.root);
    this.ripples = new Ripples(this.root);
    this.hookRope = new Rope(this.root, PALETTE.rope);
    this.fishLine = new Rope(this.root, '#f1f5f2', 22);
    this.grapnel = solid((b) => buildGrapnel(b, 2.2), this.mat, 'garfio-lanzado');
    this.bobber = solid((b) => buildBobber(b, 2.4), this.mat, 'corcho');
    this.fish = solid((b) => buildFish(b, '#8ecae6', '#e8f4f2', 2.2), this.mat, 'pez-capturado');
    this.root.add(this.grapnel, this.bobber, this.fish);
  }

  update(dt: number): void {
    this.particles.update(dt);
    this.ripples.update(dt);
  }

  /** Oculta todo (cambio de partida). */
  hideAll(): void {
    this.hookRope.visible = false;
    this.fishLine.visible = false;
    this.grapnel.visible = false;
    this.bobber.visible = false;
    this.fish.visible = false;
  }

  dispose(): void {
    this.particles.dispose();
    this.ripples.dispose();
    this.hookRope.dispose();
    this.fishLine.dispose();
    for (const m of [this.grapnel, this.bobber, this.fish]) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.mat.dispose();
    this.root.removeFromParent();
  }
}

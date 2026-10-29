/**
 * INCENDIOS a bordo (module.fire > 0): llamas low-poly animadas por las celdas del módulo,
 * humo negro, pavesas y una luz anaranjada parpadeante (vía pool de luces). La intensidad
 * del fuego (0..100) controla cuántas llamas hay y su tamaño.
 */
import * as THREE from 'three';
import { CELL } from '../../sim/constants';
import { cellMin, getCell, levelY, moduleCells, type ShipLayout } from '../../sim/ship';
import type { GameState } from '../../sim/types';
import { flameGeometry } from './dynamic';
import { hash01 } from './geo';
import type { LightCandidate } from './lights';
import type { ShipMaterials } from './materials';
import type { Particles } from './particles';

const MAX_FLAMES = 260;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const FIRE_COLOR = new THREE.Color('#ff7b25');

export class FireView {
  readonly mesh: THREE.InstancedMesh;
  private smokeAcc = new Map<number, number>();

  constructor(parent: THREE.Object3D, mats: ShipMaterials) {
    this.mesh = new THREE.InstancedMesh(flameGeometry(), mats.fire, MAX_FLAMES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    this.mesh.name = 'incendios';
    parent.add(this.mesh);
  }

  /** Módulos ardiendo ahora (ids). */
  burning(state: GameState): number[] {
    return state.ship.modules.filter((m) => m.fire > 0 && m.status !== 'construction').map((m) => m.id);
  }

  update(state: GameState, layout: ShipLayout, t: number, dt: number, maxLevel: number, particles: Particles, lights: LightCandidate[]): void {
    const width = layout.width;
    let n = 0;
    for (const m of state.ship.modules) {
      if (m.fire <= 0 || m.status === 'construction') continue;
      const k = Math.min(1, m.fire / 100);
      const cells = moduleCells(m).filter((c) => c.level === m.level);
      const y0 = levelY(m.level);
      let cx = 0;
      let cz = 0;
      for (const c of cells) {
        const mn = cellMin(c.x, c.z, width);
        cx += mn.x + CELL / 2;
        cz += mn.z + CELL / 2;
        const count = Math.min(9, 2 + Math.round(k * 7));
        for (let i = 0; i < count && n < MAX_FLAMES; i++) {
          const h = hash01(m.id, c.x, c.z, i);
          const h2 = hash01(c.z, i, m.id, 3);
          const px = mn.x + 0.5 + h * (CELL - 1);
          const pz = mn.z + 0.5 + h2 * (CELL - 1);
          const flick = 0.75 + 0.25 * Math.sin(t * (8 + h * 6) + i) + 0.1 * Math.sin(t * 23 + h * 9);
          const sz = (0.25 + 0.3 * h2) * (0.5 + 0.7 * k);
          const hy = (0.7 + 1.1 * h) * (0.4 + 0.8 * k) * flick;
          if (m.level <= maxLevel) {
            _p.set(px + Math.sin(t * 3 + i) * 0.04, y0 + 0.02, pz);
            _q.setFromEuler(_e.set(Math.sin(t * 5 + h * 7) * 0.12, h * 6, Math.cos(t * 4 + i) * 0.12));
            _s.set(sz, hy, sz);
            _m.compose(_p, _q, _s);
            this.mesh.setMatrixAt(n++, _m);
          }
        }
        // humo negro y pavesas
        if (m.level <= maxLevel) {
          const indoor = !!getCell(layout, c.level, c.x, c.z)?.indoor;
          const acc = (this.smokeAcc.get(m.id * 100 + c.x * 10 + c.z) ?? 0) + dt * (1.5 + 4 * k);
          let a = acc;
          while (a > 1) {
            a -= 1;
            particles.emitPuff('darkSmoke', mn.x + 0.8 + particles.rnd() * (CELL - 1.6), y0 + 1.2 + k, mn.z + 0.8 + particles.rnd() * (CELL - 1.6), m.level, 0.8 + k, indoor ? 0.6 : 1.3, indoor);
            if (particles.rnd() < 0.5) particles.emitSpark('ember', mn.x + 1 + particles.rnd() * (CELL - 2), y0 + 0.6, mn.z + 1 + particles.rnd() * (CELL - 2), m.level, y0);
          }
          this.smokeAcc.set(m.id * 100 + c.x * 10 + c.z, a);
        }
      }
      cx /= cells.length || 1;
      cz /= cells.length || 1;
      // En habitaciones cerradas el humo sale por las puertas (se ve desde fuera).
      if (m.level <= maxLevel) {
        for (const d of layout.doors) {
          if (d.moduleId !== m.id) continue;
          const key = -(m.id * 1000 + Math.round(d.x * 10 + d.z));
          let a = (this.smokeAcc.get(key) ?? 0) + dt * (1 + 3 * k);
          while (a > 1) {
            a -= 1;
            const ox = d.axis === 'x' ? (particles.rnd() - 0.5) * 1.2 : 0;
            const oz = d.axis === 'z' ? (particles.rnd() - 0.5) * 1.2 : 0;
            particles.emitPuff('darkSmoke', d.x + ox, d.y + 2.1, d.z + oz, m.level, 0.7 + k * 0.6, 1.1);
          }
          this.smokeAcc.set(key, a);
        }
      }
      const flick = 0.75 + 0.25 * Math.sin(t * 17) * Math.sin(t * 6.1 + m.id);
      lights.push({ id: `fuego:${m.id}`, x: cx, y: y0 + 1.3, z: cz, level: m.level, intensity: (5 + 9 * k) * flick, color: FIRE_COLOR, distance: 12, priority: 8 });
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
  }
}

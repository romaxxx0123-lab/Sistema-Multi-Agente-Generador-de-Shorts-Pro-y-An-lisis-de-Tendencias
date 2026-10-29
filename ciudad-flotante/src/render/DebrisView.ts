/** [AGENTE render-ship] Restos flotantes en el agua. STUB: cajas. */
import * as THREE from 'three';
import type { GameState } from '../sim/types';

export class DebrisView {
  private meshes = new Map<number, THREE.Object3D>();
  constructor(readonly worldRoot: THREE.Group) {}

  reset(): void {
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
  }

  sync(state: GameState, _dtReal: number, waterHeight: (x: number, z: number) => number): void {
    const alive = new Set<number>();
    for (const d of state.debris) {
      alive.add(d.id);
      let m = this.meshes.get(d.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshLambertMaterial({ color: '#b07d48' }));
        this.worldRoot.add(m);
        this.meshes.set(d.id, m);
      }
      m.position.set(d.pos.x, waterHeight(d.pos.x, d.pos.z), d.pos.z);
    }
    for (const [id, m] of this.meshes) {
      if (!alive.has(id)) {
        m.removeFromParent();
        this.meshes.delete(id);
      }
    }
  }

  /** Posición mundial actual de un resto (para el gancho). */
  objectOf(id: number): THREE.Object3D | null {
    return this.meshes.get(id) ?? null;
  }
}

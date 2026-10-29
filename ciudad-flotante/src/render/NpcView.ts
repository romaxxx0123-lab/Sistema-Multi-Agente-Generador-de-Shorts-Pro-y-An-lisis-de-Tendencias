/** [AGENTE render-ship] Personajes de los habitantes (low-poly, animados). STUB: cápsulas. */
import * as THREE from 'three';
import type { GameState } from '../sim/types';

export class NpcView {
  private meshes = new Map<string, THREE.Object3D>();
  constructor(readonly root: THREE.Group) {}

  reset(): void {
    for (const m of this.meshes.values()) m.removeFromParent();
    this.meshes.clear();
  }

  sync(state: GameState, _dtReal: number, _hideAboveLevel: number | null): void {
    for (const n of state.npcs) {
      let m = this.meshes.get(n.id);
      if (!m) {
        m = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1), new THREE.MeshLambertMaterial({ color: '#e76f51' }));
        this.root.add(m);
        this.meshes.set(n.id, m);
      }
      m.visible = n.activity !== 'away';
      m.position.set(n.pos.x, n.pos.y + 0.85, n.pos.z);
    }
  }

  /** Objeto 3D de un habitante (para resaltado / bocadillos). */
  objectOf(id: string): THREE.Object3D | null {
    return this.meshes.get(id) ?? null;
  }
}

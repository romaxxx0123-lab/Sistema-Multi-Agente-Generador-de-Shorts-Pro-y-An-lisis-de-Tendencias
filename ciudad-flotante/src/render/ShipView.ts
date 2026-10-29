/**
 * [AGENTE render-ship] Geometría del barco a partir del layout: casco, suelos, paredes,
 * puertas, ventanas, barandillas, escaleras, techos, props, obras, cajas, fuego, plantas, luces.
 * STUB: cajas grises para ver algo mientras se implementa.
 */
import * as THREE from 'three';
import type { HighlightTarget } from '../game/types';
import type { ShipLayout } from '../sim/ship';
import type { GameState } from '../sim/types';

export interface ShipViewOptions {
  /** Oculta todo lo que esté por encima de este nivel (modo construcción). null = nada oculto. */
  hideAboveLevel: number | null;
  /** Oculta techos/losas superiores del nivel indicado (vista en corte). */
  cutaway: boolean;
  highlight: HighlightTarget | null;
}

export class ShipView {
  private group = new THREE.Group();
  private rev = -1;

  constructor(readonly root: THREE.Group) {
    root.add(this.group);
  }

  /** Fuerza reconstrucción (nueva partida / carga). */
  reset(): void {
    this.rev = -1;
  }

  sync(state: GameState, layout: ShipLayout, _opts: ShipViewOptions, _dtReal: number, _camera: THREE.Camera): void {
    if (this.rev === state.ship.revision) return;
    this.rev = state.ship.revision;
    this.group.clear();
    const mat = new THREE.MeshLambertMaterial({ color: '#c89f6c' });
    const wallMat = new THREE.MeshLambertMaterial({ color: '#efe3c8' });
    for (const s of layout.slabs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), mat);
      const x = s.x * 4 - 20 + 2;
      const z = s.z * 4 - 8 + 2;
      m.position.set(x, s.y - 0.1, z);
      this.group.add(m);
    }
    for (const w of layout.walls) {
      const len = Math.hypot(w.x1 - w.x0, w.z1 - w.z0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(len, w.y1 - w.y0, 0.2), wallMat);
      m.position.set((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, (w.z0 + w.z1) / 2);
      if (Math.abs(w.x1 - w.x0) < 1e-6) m.rotation.y = Math.PI / 2;
      this.group.add(m);
    }
    for (const p of layout.props) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(p.hx * 2, p.height, p.hz * 2), new THREE.MeshLambertMaterial({ color: '#8a9399' }));
      m.position.set(p.x, p.y + p.height / 2, p.z);
      this.group.add(m);
    }
  }

  getPropObject(_key: string): THREE.Object3D | null {
    return null;
  }

  dispose(): void {
    this.group.removeFromParent();
  }
}

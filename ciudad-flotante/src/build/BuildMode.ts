/**
 * [AGENTE build-mode] Modo construcción: vista exterior del barco, selector de nivel con
 * vista en corte, paleta de módulos con costes, fantasma de colocación con validación,
 * rotación, demolición y ampliación del casco. STUB.
 */
import * as THREE from 'three';
import type { GameContext } from '../game/context';

export class BuildMode {
  readonly camera: THREE.PerspectiveCamera;
  private _active = false;

  constructor(private readonly ctx: GameContext) {
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.5, 3000);
    this.camera.position.set(-30, 30, 40);
    this.camera.lookAt(0, 3, 0);
  }

  get active(): boolean {
    return this._active;
  }

  /** Nivel seleccionado: los superiores se ocultan en la vista. */
  get hideAboveLevel(): number | null {
    return null;
  }

  enter(): void {
    this._active = true;
  }

  exit(): void {
    this._active = false;
  }

  reset(): void {}

  update(_dtReal: number): void {
    void this.ctx;
  }
}

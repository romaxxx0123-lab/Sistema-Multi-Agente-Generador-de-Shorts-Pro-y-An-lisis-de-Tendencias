// Sonda de reflejos dinámica: cubemap del entorno real (edificios, calles, cielo) alrededor del auto
// del jugador, renderizado una cara por cuadro y convertido a PMREM para reflejos con rugosidad.
// La pintura, los vidrios y los cromados reflejan la ciudad verdadera en lugar de sólo el cielo.
import * as THREE from 'three';
import { LAYER_PROBE } from '../core/layers.js';

export class ReflectionProbe {
  constructor(engine, size = 128) {
    this.engine = engine;
    this.rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.rt.texture.name = 'sonda-reflejos';
    this.cube = new THREE.CubeCamera(0.3, 3000, this.rt);
    for (const c of this.cube.children) c.layers.set(LAYER_PROBE);
    this.face = 0;
    this.ready = false; // hasta completar las 6 caras se usa el entorno del cielo
    this.enabled = true;
    this.pos = new THREE.Vector3();
  }

  get texture() {
    return this.rt.texture;
  }

  /** Renderiza una cara del cubemap desde pos (sin recalcular sombras). */
  update(pos) {
    if (!this.enabled) return;
    const r = this.engine.renderer;
    const scene = this.engine.scene;
    // al saltar lejos (teletransporte), reiniciar para no mezclar caras de lugares distintos
    if (this.pos.distanceToSquared(pos) > 400) {
      this.face = 0;
      this.ready = false;
    }
    this.pos.copy(pos);
    this.cube.position.copy(pos);
    this.cube.updateMatrixWorld(true);
    const prevRT = r.getRenderTarget();
    const prevAuto = r.shadowMap.autoUpdate;
    const prevInfo = r.info.autoReset;
    r.shadowMap.autoUpdate = false;
    r.info.autoReset = false;
    const i = this.face;
    r.setRenderTarget(this.rt, i);
    r.render(scene, this.cube.children[i]);
    r.setRenderTarget(prevRT);
    r.shadowMap.autoUpdate = prevAuto;
    r.info.autoReset = prevInfo;
    this.face = (i + 1) % 6;
    if (this.face === 0) {
      this.rt.texture.needsPMREMUpdate = true;
      this.ready = true;
    }
  }

  dispose() {
    this.rt.dispose();
  }
}

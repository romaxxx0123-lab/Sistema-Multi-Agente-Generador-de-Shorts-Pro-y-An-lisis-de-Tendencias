/**
 * [AGENTE render-world] Escena, cámara, cielo, sol, océano, clima, avistamientos y balanceo del barco.
 * STUB funcional mínimo: escena con luz y un plano de agua.
 */
import * as THREE from 'three';
import type { Quality } from '../game/types';
import type { ShipLayout } from '../sim/ship';
import type { GameState } from '../sim/types';

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Grupo que se balancea con las olas. Todo lo que vive "en el barco" cuelga de aquí (coords locales). */
  readonly shipRoot = new THREE.Group();
  /** Marco del océano (restos flotantes, islas). El barco está en el origen; el agua se desplaza. */
  readonly worldRoot = new THREE.Group();
  private water: THREE.Mesh;

  constructor(
    readonly container: HTMLElement,
    quality: Quality,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'baja', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'alta' ? 2 : 1));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color('#7cc4e8');
    this.scene.add(this.shipRoot, this.worldRoot);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#335566', 1.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.5);
    sun.position.set(30, 50, 20);
    this.scene.add(sun);
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: '#2fa3c6' }));
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 1;
    this.scene.add(this.water);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /** Altura del agua (coordenadas del océano, barco en el origen). */
  waterHeight(_x: number, _z: number): number {
    return 1;
  }

  setQuality(_q: Quality): void {}

  resize(): void {
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  update(_state: GameState, _layout: ShipLayout, _dtReal: number, _camera: THREE.Camera): void {}

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}

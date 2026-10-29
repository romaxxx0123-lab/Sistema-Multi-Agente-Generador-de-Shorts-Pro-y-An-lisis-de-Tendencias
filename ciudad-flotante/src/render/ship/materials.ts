/**
 * Materiales compartidos por la vista del barco. Casi todo usa colores por vértice con un
 * único material Lambert; los emisivos (ventanas, lámparas, ojos de buey) se actualizan cada
 * frame según la luz diurna para que el barco "se encienda" de noche.
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';

const PORT_DAY = new THREE.Color('#bfe6f0');
const PORT_NIGHT = new THREE.Color('#14233a');

export class ShipMaterials {
  /** Opaco con colores por vértice (estructura, props, detalles). */
  readonly solid = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** Casco: doble cara para que nunca se vea "a través" desde la bodega. */
  readonly hull = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  /** Cristal visto desde fuera: reflejo azulado de día, luz cálida de noche. */
  readonly glassOut = new THREE.MeshLambertMaterial({
    color: PALETTE.window,
    emissive: new THREE.Color(PALETTE.windowNight),
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  /** Cristal visto desde dentro: casi transparente, deja ver el mar. */
  readonly glassIn = new THREE.MeshLambertMaterial({
    color: '#cfeef5',
    emissive: new THREE.Color('#bfe6f0'),
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  /** Ojos de buey vistos desde la bodega: muestran la luz de fuera (cielo de día, noche oscura). */
  readonly portIn = new THREE.MeshBasicMaterial({ color: '#bfe6f0' });
  /** Bombillas y pantallas de lámparas de techo. */
  readonly lamp = new THREE.MeshLambertMaterial({ color: '#fff4dc', emissive: new THREE.Color('#ffcf7a'), emissiveIntensity: 0.2 });
  /** Faroles de la bodega (siempre algo encendidos: la bodega es oscura). */
  readonly lantern = new THREE.MeshLambertMaterial({ color: '#ffe2a8', emissive: new THREE.Color('#ffb347'), emissiveIntensity: 0.8 });
  /** Luces de navegación / tope (emisivo puro, por vértice). */
  readonly beacon = new THREE.MeshBasicMaterial({ vertexColors: true });
  /** Fuego y brasas (sin iluminación, colores por vértice). */
  readonly fire = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false });
  /** Fantasma de obra: sube con el progreso. */
  readonly ghost = new THREE.MeshLambertMaterial({
    color: '#bfe9f2',
    emissive: new THREE.Color('#5fb3c9'),
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  /** Resaltado del objetivo: brillo aditivo suave encima del objeto. */
  readonly highlight = new THREE.MeshBasicMaterial({
    color: '#ffe6a6',
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  /** Contorno del resaltado (caras traseras de una copia algo mayor). */
  readonly outline = new THREE.MeshBasicMaterial({ color: '#ffd27d', side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false });
  /** Agua del indicador de nivel de los depósitos. */
  readonly water = new THREE.MeshLambertMaterial({ color: '#3fa7d6', emissive: new THREE.Color('#1d6f99'), emissiveIntensity: 0.35, transparent: true, opacity: 0.85 });
  /** LEDs de estado. */
  readonly ledGreen = new THREE.MeshBasicMaterial({ color: '#5dff7a' });
  readonly ledAmber = new THREE.MeshBasicMaterial({ color: '#ffb547' });
  readonly ledRed = new THREE.MeshBasicMaterial({ color: '#ff4a3d' });
  readonly ledOff = new THREE.MeshLambertMaterial({ color: '#2b2f33' });
  /** Rótulos pintados (nombre del barco). */
  readonly decals: THREE.Material[] = [];

  private all(): THREE.Material[] {
    return [this.solid, this.hull, this.portIn, this.glassOut, this.glassIn, this.lamp, this.lantern, this.beacon, this.fire, this.ghost, this.highlight, this.outline, this.water, this.ledGreen, this.ledAmber, this.ledRed, this.ledOff, ...this.decals];
  }

  /**
   * Actualiza los emisivos según la "noche" (0 = pleno día, 1 = noche cerrada).
   * `t` = tiempo real acumulado (s) para un leve parpadeo de los faroles.
   */
  update(night: number, t: number): void {
    const n = THREE.MathUtils.clamp(night, 0, 1);
    this.glassOut.emissiveIntensity = 0.05 + n * 1.1;
    this.glassOut.opacity = 0.5 + n * 0.4;
    this.glassIn.emissiveIntensity = 0.3 * (1 - n);
    this.glassIn.opacity = 0.18 + n * 0.25;
    this.glassIn.color.setRGB(0.8 - n * 0.6, 0.93 - n * 0.7, 0.96 - n * 0.6);
    this.lamp.emissiveIntensity = 0.15 + n * 1.25;
    this.portIn.color.copy(PORT_DAY).lerp(PORT_NIGHT, n);
    this.lantern.emissiveIntensity = 0.6 + n * 0.8 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 3.1) * 0.04;
  }

  dispose(): void {
    for (const m of this.all()) m.dispose();
  }
}

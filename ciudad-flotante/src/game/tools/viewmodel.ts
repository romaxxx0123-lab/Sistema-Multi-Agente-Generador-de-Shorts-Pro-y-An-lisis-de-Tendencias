/**
 * [AGENTE game-player] MODELO EN MANO (primera persona).
 *
 * El objeto seleccionado en la barra rápida (o el que exige la acción en curso: martillo al
 * reparar, por ejemplo) se dibuja en la esquina inferior derecha, hijo de la cámara, con:
 *  - balanceo al andar (sincronizado con los pasos), inercia al girar y golpe al aterrizar;
 *  - animaciones de uso por fotogramas clave (martillazo, llave, lanzamiento del gancho,
 *    tirar del cabo, lanzar y recoger la caña, llenar y volcar el cubo, comer…);
 *  - cambio de objeto bajando uno y subiendo el otro.
 *
 * Nunca atraviesa paredes: todos sus materiales van en la lista de transparentes con un
 * `renderOrder` de grupo altísimo y, justo antes de dibujarlo, un objeto invisible limpia el
 * búfer de profundidad. Así se pinta encima de todo pero con su propia profundidad correcta.
 */
import * as THREE from 'three';
import { ITEMS } from '../../data/items';
import { PALETTE } from '../../render/palette';
import type { ItemId } from '../../sim/types';
import { easeInOutSine, wrapAngle } from './aim';
import { buildArm, buildItemModel, type ItemModel } from './models';

/** Orden de grupo del modelo en mano (por encima de cualquier otro objeto de la escena). */
export const VIEWMODEL_ORDER = 1_000_000;

export interface VmPose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

const ZERO: VmPose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
/** Parte del giro de una acción que hace el brazo entero (el resto lo hace la muñeca). */
const ARM_SHARE = 0.45;
/** Muelle de la inercia al girar: rigidez, amortiguación y paso máximo de integración (s). */
const SWAY_K = 120;
const SWAY_C = 18;
const SWAY_STEP = 1 / 120;

function allFinite(...v: number[]): boolean {
  for (const x of v) if (!Number.isFinite(x)) return false;
  return true;
}

export type VmActionName = 'swing' | 'wrench' | 'throw' | 'pull' | 'cast' | 'wait' | 'reel' | 'dip' | 'pour' | 'eat' | 'use' | 'aim';

interface ActionDef {
  dur: number;
  /** Se repite mientras no se cambie de acción. */
  loop?: boolean;
  /** Al acabar se queda en la última pose (en vez de volver al reposo). */
  hold?: boolean;
  keys: { t: number; p: Partial<VmPose> }[];
  /** Momentos con nombre (golpe, suelta, salpicadura…) que se notifican a quien la lanzó. */
  events?: { t: number; name: string }[];
  /** Parte del giro que hace el brazo entero (el resto, la muñeca). Por defecto ARM_SHARE. */
  armShare?: number;
}

/** Animaciones de uso (desplazamientos sobre la pose de reposo, en espacio de cámara). */
const ACTIONS: Record<VmActionName, ActionDef> = {
  swing: {
    dur: 0.62,
    loop: true,
    keys: [
      { t: 0, p: {} },
      { t: 0.24, p: { rx: 0.8, y: 0.06, z: 0.07, rz: -0.08 } },
      { t: 0.33, p: { rx: -0.62, y: -0.07, z: -0.13, rz: 0.06 } },
      { t: 0.44, p: { rx: -0.42, y: -0.05, z: -0.1 } },
      { t: 0.62, p: {} },
    ],
    events: [{ t: 0.33, name: 'hit' }],
  },
  wrench: {
    dur: 0.56,
    loop: true,
    keys: [
      { t: 0, p: { z: -0.04 } },
      { t: 0.22, p: { rz: 0.75, z: -0.08, x: -0.02 } },
      { t: 0.34, p: { rz: -0.35, z: -0.1, x: 0.01 } },
      { t: 0.56, p: { z: -0.04 } },
    ],
    events: [{ t: 0.34, name: 'hit' }],
  },
  throw: {
    dur: 0.6,
    hold: true,
    keys: [
      { t: 0, p: {} },
      { t: 0.24, p: { rx: 0.95, y: 0.1, z: 0.14, rz: -0.1 } },
      { t: 0.32, p: { rx: -0.75, y: -0.02, z: -0.3, rz: 0.08 } },
      { t: 0.6, p: { rx: -0.3, y: -0.03, z: -0.14 } },
    ],
    events: [{ t: 0.31, name: 'release' }],
  },
  pull: {
    dur: 0.42,
    loop: true,
    keys: [
      { t: 0, p: { rx: -0.3, y: -0.03, z: -0.14 } },
      { t: 0.2, p: { rx: 0.15, y: -0.08, z: 0.1, rz: -0.06 } },
      { t: 0.42, p: { rx: -0.3, y: -0.03, z: -0.14 } },
    ],
    events: [{ t: 0.2, name: 'tug' }],
  },
  cast: {
    dur: 0.62,
    hold: true,
    keys: [
      { t: 0, p: {} },
      { t: 0.3, p: { rx: 0.9, y: 0.07, z: 0.12 } },
      { t: 0.4, p: { rx: -0.6, z: -0.16 } },
      { t: 0.62, p: { rx: -0.32, z: -0.1 } },
    ],
    events: [{ t: 0.39, name: 'release' }],
  },
  wait: {
    dur: 1,
    hold: true,
    keys: [
      { t: 0, p: { rx: -0.32, z: -0.1 } },
      { t: 1, p: { rx: -0.32, z: -0.1 } },
    ],
  },
  reel: {
    dur: 0.5,
    hold: true,
    keys: [
      { t: 0, p: { rx: -0.32, z: -0.1 } },
      { t: 0.14, p: { rx: 0.7, y: 0.09, z: 0.1 } },
      { t: 0.5, p: { rx: 0.25, y: 0.03, z: 0.02 } },
    ],
  },
  dip: {
    dur: 1.15,
    keys: [
      { t: 0, p: {} },
      { t: 0.42, p: { y: -0.45, z: -0.24, rx: -0.55, x: -0.04 } },
      { t: 0.7, p: { y: -0.5, z: -0.26, rx: -0.6, x: -0.04 } },
      { t: 1.15, p: {} },
    ],
    events: [{ t: 0.56, name: 'fill' }],
  },
  pour: {
    dur: 0.85,
    armShare: 0.15,
    keys: [
      { t: 0, p: {} },
      { t: 0.2, p: { rx: 0.3, z: 0.05, y: -0.04 } },
      { t: 0.36, p: { rx: -1.6, z: -0.2, y: 0.02, x: -0.05 } },
      { t: 0.55, p: { rx: -1.5, z: -0.18, y: 0.01, x: -0.05 } },
      { t: 0.85, p: {} },
    ],
    events: [{ t: 0.34, name: 'splash' }],
  },
  eat: {
    dur: 0.95,
    keys: [
      { t: 0, p: {} },
      { t: 0.3, p: { x: -0.24, y: 0.15, z: 0.22, rx: 0.45, ry: 0.55 } },
      { t: 0.45, p: { x: -0.23, y: 0.13, z: 0.24, rx: 0.55, ry: 0.5 } },
      { t: 0.6, p: { x: -0.24, y: 0.15, z: 0.22, rx: 0.45, ry: 0.55 } },
      { t: 0.95, p: {} },
    ],
    events: [{ t: 0.42, name: 'consume' }],
  },
  use: {
    dur: 0.36,
    keys: [
      { t: 0, p: {} },
      { t: 0.14, p: { z: -0.1, y: 0.03, rx: -0.12 } },
      { t: 0.36, p: {} },
    ],
  },
  aim: {
    dur: 0.3,
    hold: true,
    keys: [
      { t: 0, p: {} },
      { t: 0.3, p: { x: -0.05, y: 0.04, rx: 0.12 } },
    ],
  },
};

function lerpPose(a: Partial<VmPose>, b: Partial<VmPose>, t: number, out: VmPose): VmPose {
  for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz'] as const) out[k] = (a[k] ?? 0) + ((b[k] ?? 0) - (a[k] ?? 0)) * t;
  return out;
}

/** Pose de una acción en el instante `t` (segundos). */
export function samplePose(def: ActionDef, t: number, out: VmPose): VmPose {
  const keys = def.keys;
  if (t <= keys[0]!.t) return lerpPose(keys[0]!.p, keys[0]!.p, 0, out);
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]!;
    if (t <= k.t) {
      const prev = keys[i - 1]!;
      const u = (t - prev.t) / Math.max(1e-6, k.t - prev.t);
      return lerpPose(prev.p, k.p, easeInOutSine(u), out);
    }
  }
  const last = keys[keys.length - 1]!;
  return lerpPose(last.p, last.p, 0, out);
}

/** Datos de movimiento del jugador que alimentan el balanceo. */
export interface VmMotion {
  /** Fase de los pasos (π por paso). */
  bobPhase: number;
  /** 0..~1.4 intensidad del balanceo (0 parado o en el aire). */
  bobAmount: number;
  yaw: number;
  pitch: number;
  /** 0..1 golpe de aterrizaje. */
  landKick: number;
  /** Multiplicador de luz (interiores sin sombras). */
  light: number;
}

/** Clave de modelo: el cubo vacío y el lleno comparten modelo (solo cambia el agua). */
function modelKey(id: ItemId): ItemId {
  return id === 'cubo_agua' ? 'cubo' : id;
}

export class ViewModel {
  /** Raíz colgada de la cámara. */
  readonly root = new THREE.Group();
  private readonly holder = new THREE.Object3D();
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly lineMat: THREE.LineBasicMaterial;
  private readonly depthClear: THREE.Mesh;
  private readonly models = new Map<ItemId, { model: ItemModel; arm: THREE.Group }>();
  private current: { id: ItemId; model: ItemModel; arm: THREE.Group } | null = null;
  private wanted: ItemId | null = null;
  /** 0 = bajado (fuera de pantalla), 1 = en posición. */
  private equip = 0;
  private action: { name: VmActionName; def: ActionDef; t: number; cb?: (ev: string) => void } | null = null;
  private readonly actPose: VmPose = { ...ZERO };
  private readonly blend: VmPose = { ...ZERO };
  private blendFrom: VmPose = { ...ZERO };
  private blendT = 1;
  private lastYaw = 0;
  private lastPitch = 0;
  private swayX = 0;
  private swayY = 0;
  private swayVX = 0;
  private swayVY = 0;
  private shake = 0;
  private t = 0;
  private shown = true;
  private shadowOn = false;
  private shadowFor: THREE.Object3D | null = null;

  constructor(readonly camera: THREE.Camera) {
    this.root.name = 'modelo-en-mano';
    this.root.renderOrder = VIEWMODEL_ORDER;
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1, depthWrite: true, depthTest: true });
    this.lineMat = new THREE.LineBasicMaterial({ color: PALETTE.rope, transparent: true, depthWrite: true });
    // Limpia la profundidad justo antes de dibujar el modelo en mano (va primero dentro del grupo).
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.2, 0.001, 0, -0.2, 0, 0.001, -0.2], 3));
    this.depthClear = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ transparent: true, colorWrite: false, depthWrite: false, depthTest: false }));
    this.depthClear.name = 'limpia-profundidad';
    this.depthClear.frustumCulled = false;
    this.depthClear.renderOrder = 0;
    this.depthClear.onBeforeRender = (renderer) => renderer.clearDepth();
    this.root.add(this.depthClear, this.holder);
    camera.add(this.root);
  }

  /** Muestra u oculta todo el modelo en mano (tercera persona, durmiendo, modo construcción). */
  setVisible(v: boolean): void {
    this.shown = v;
    this.root.visible = v && this.current !== null;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Objeto que se quiere ver en la mano (null = mano vacía). */
  show(id: ItemId | null): void {
    this.wanted = id && ITEMS[id] ? id : null;
  }

  /** Id del objeto que se está dibujando ahora mismo. */
  get shownId(): ItemId | null {
    return this.current?.id ?? null;
  }

  get actionName(): VmActionName | null {
    return this.action?.name ?? null;
  }

  /** Lanza una animación. `cb` recibe los eventos con nombre (golpe, suelta…). */
  play(name: VmActionName, cb?: (ev: string) => void): void {
    this.blendFrom = { ...this.currentOffset() };
    this.blendT = 0;
    this.action = { name, def: ACTIONS[name], t: 0, cb };
  }

  /** Vuelve al reposo (suavemente). */
  stop(): void {
    if (!this.action) return;
    this.blendFrom = { ...this.currentOffset() };
    this.blendT = 0;
    this.action = null;
  }

  /** Temblor breve (picada, tirón). */
  kick(amount: number): void {
    this.shake = Math.max(this.shake, amount);
  }

  /** Muestra/oculta una pieza del modelo actual (garfio lanzado, corcho en el agua, agua del cubo…). */
  setPart(name: string, visible: boolean): void {
    const p = this.current?.model.parts.get(name);
    if (p) p.visible = visible;
  }

  /** Posición de mundo de un punto de referencia del modelo actual (punta de la caña, garfio…). */
  anchorWorld(name: string, out: THREE.Vector3): THREE.Vector3 | null {
    const a = this.current?.model.anchors.get(name);
    if (!a || !this.root.visible) return null;
    a.updateWorldMatrix(true, false);
    a.getWorldPosition(out);
    return Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.z) ? out : null;
  }

  private currentOffset(): VmPose {
    return this.blend;
  }

  private getModel(id: ItemId): { id: ItemId; model: ItemModel; arm: THREE.Group } {
    const key = modelKey(id);
    let m = this.models.get(key);
    if (!m) {
      const model = buildItemModel(key, this.mat, this.lineMat);
      const arm = buildArm(this.mat);
      arm.rotation.set(model.armRot.x, model.armRot.y, model.armRot.z);
      const g = new THREE.Group();
      g.add(arm, model.group);
      m = { model, arm: g };
      // Todo el modelo en el grupo de orden alto; las mallas, después del limpiador de profundidad.
      g.traverse((o) => {
        if ((o as THREE.Group).isGroup) o.renderOrder = VIEWMODEL_ORDER;
        else o.renderOrder = 1;
        o.frustumCulled = false;
        o.castShadow = false;
        o.receiveShadow = false;
      });
      this.models.set(key, m);
    }
    return { id, ...m };
  }

  private attach(id: ItemId | null): void {
    if (this.current) this.holder.remove(this.current.arm);
    this.current = id ? this.getModel(id) : null;
    if (this.current) {
      this.holder.add(this.current.arm);
      // Restablece piezas que una acción anterior pudo ocultar.
      for (const [name, part] of this.current.model.parts) part.visible = name === 'agua' ? id === 'cubo_agua' : true;
    }
    this.root.visible = this.shown && this.current !== null;
  }

  update(dt: number, mo: VmMotion, receiveShadow: boolean): void {
    this.t += dt;
    // --- Cambio de objeto ---
    const want = this.wanted;
    const cur = this.current?.id ?? null;
    if (want !== cur) {
      const sameModel = want !== null && cur !== null && modelKey(want) === modelKey(cur);
      if (sameModel) {
        this.current = this.getModel(want);
        this.setPart('agua', want === 'cubo_agua');
      } else {
        this.equip = Math.max(0, this.equip - dt / 0.14);
        if (this.equip <= 0 || cur === null) {
          // La acción en curso (si la hay) sigue con el nuevo objeto: p. ej. reparar con la llave.
          this.attach(want);
          this.equip = 0;
        }
      }
    } else {
      this.equip = Math.min(1, this.equip + dt / 0.22);
    }
    if (!this.current) return;
    this.mat.color.setScalar(mo.light);
    if (receiveShadow !== this.shadowOn || this.shadowFor !== this.current.arm) {
      // Recibir sombras oscurece el objeto dentro de las habitaciones igual que el resto del barco.
      this.shadowOn = receiveShadow;
      this.shadowFor = this.current.arm;
      this.current.arm.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.receiveShadow = receiveShadow;
      });
    }

    // --- Acción ---
    const pose = this.actPose;
    if (this.action) {
      const a = this.action;
      const prevT = a.t;
      a.t += dt;
      const def = a.def;
      if (def.events && a.cb) {
        for (const ev of def.events) {
          const cross = def.loop ? Math.floor((a.t - ev.t) / def.dur) > Math.floor((prevT - ev.t) / def.dur) : prevT < ev.t && a.t >= ev.t;
          if (cross) a.cb(ev.name);
        }
      }
      let t = a.t;
      if (def.loop) t = a.t % def.dur;
      samplePose(def, Math.min(t, def.dur), pose);
      if (!def.loop && !def.hold && a.t >= def.dur) {
        this.action = null;
        Object.assign(pose, ZERO);
      }
    } else Object.assign(pose, ZERO);
    // Mezcla suave al empezar/terminar una acción.
    this.blendT = Math.min(1, this.blendT + dt / 0.12);
    lerpPose(this.blendFrom, pose, easeInOutSine(this.blendT), this.blend);

    // --- Inercia al girar la vista ---
    this.updateSway(dt, mo.yaw, mo.pitch);
    this.shake *= Math.exp(-dt * 6);

    // --- Composición ---
    const base = this.current.model.pose;
    const amt = mo.bobAmount;
    const bobX = Math.cos(mo.bobPhase) * 0.011 * amt;
    const bobY = (Math.abs(Math.sin(mo.bobPhase)) - 0.5) * 0.016 * amt;
    const idle = Math.sin(this.t * 1.6) * 0.004;
    const lowered = (1 - this.equip) * 0.45;
    const sh = this.shake ? Math.sin(this.t * 60) * this.shake * 0.012 : 0;
    const b = this.blend;
    const px = base.x + b.x + bobX + this.swayX * 0.5 + sh;
    const py = base.y + b.y + bobY + idle - lowered - mo.landKick * 0.05 - this.swayY * 0.4;
    const pz = base.z + b.z;
    // Los giros de las acciones se reparten entre el brazo (codo) y la muñeca: el objeto gira
    // alrededor del puño sin que el antebrazo barra media pantalla.
    const arm = this.action?.def.armShare ?? ARM_SHARE;
    const rx = base.rx + b.rx * arm + this.swayY * 1.2 - lowered * 0.6;
    const ry = base.ry + b.ry * arm + this.swayX * 1.5;
    const rz = base.rz + b.rz * arm + bobX * 0.8 + sh;
    // Red de seguridad: un valor no finito (entrada corrupta) nunca llega a la escena; se vuelve
    // al reposo. Con NaN en el modelo, los anclajes de la mano envenenarían la cuerda del gancho.
    if (!allFinite(px, py, pz, rx, ry, rz)) {
      this.resetMotion();
      this.holder.position.set(base.x, base.y, base.z);
      this.holder.rotation.set(base.rx, base.ry, base.rz, 'XYZ');
      this.current.model.group.rotation.set(0, 0, 0, 'XYZ');
      return;
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.set(rx, ry, rz, 'XYZ');
    this.holder.scale.setScalar(this.current.model.scale);
    this.current.model.group.rotation.set(b.rx * (1 - arm), b.ry * (1 - arm), b.rz * (1 - arm), 'XYZ');
  }

  /**
   * Muelle de la inercia al girar la vista. Se integra en subpasos fijos: con un paso de 0,1 s
   * (≈10 fps, render por software o pestaña lenta) la integración explícita del muelle
   * (k = 120, c = 18) es inestable a partir de ~0,086 s, la oscilación crece ×1,5 por frame y
   * acaba en Infinity/NaN (origen del «computeBoundingSphere(): radius is NaN» del gancho).
   */
  private updateSway(dt: number, yaw: number, pitch: number): void {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
    const dYaw = wrapAngle(yaw - this.lastYaw);
    const dPitch = pitch - this.lastPitch;
    this.lastYaw = yaw;
    this.lastPitch = pitch;
    if (!(dt > 0)) return;
    const tx = Math.max(-0.06, Math.min(0.06, Number.isFinite(dYaw) ? dYaw * 0.9 : 0));
    const ty = Math.max(-0.05, Math.min(0.05, Number.isFinite(dPitch) ? -dPitch * 0.9 : 0));
    let rest = Math.min(dt, 0.25);
    while (rest > 1e-6) {
      const h = Math.min(SWAY_STEP, rest);
      rest -= h;
      this.swayVX += (SWAY_K * (tx - this.swayX) - SWAY_C * this.swayVX) * h;
      this.swayVY += (SWAY_K * (ty - this.swayY) - SWAY_C * this.swayVY) * h;
      this.swayX += this.swayVX * h;
      this.swayY += this.swayVY * h;
    }
    // Nunca más allá de lo que permite el objetivo (más un rebote pequeño).
    this.swayX = Math.max(-0.1, Math.min(0.1, this.swayX));
    this.swayY = Math.max(-0.1, Math.min(0.1, this.swayY));
    if (!allFinite(this.swayX, this.swayY, this.swayVX, this.swayVY)) this.resetMotion();
  }

  private resetMotion(): void {
    this.swayX = 0;
    this.swayY = 0;
    this.swayVX = 0;
    this.swayVY = 0;
    this.shake = 0;
  }

  /** Desplazamiento actual de la inercia (pruebas). */
  get sway(): { x: number; y: number } {
    return { x: this.swayX, y: this.swayY };
  }

  /** Posición del puño en el espacio de la cámara (pruebas). */
  get handOffset(): THREE.Vector3 {
    return this.holder.position;
  }

  dispose(): void {
    this.root.removeFromParent();
    for (const { model, arm } of this.models.values()) {
      arm.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      void model;
    }
    this.mat.dispose();
    this.lineMat.dispose();
  }
}

/**
 * PERSONAJE CON ESQUELETO (modelo `persona` de Blender: scripts/blender/models/personas.py).
 *
 * Lo usa `CharacterRig` cuando el modelo está cargado; si falta (o no trae los clips), el rig
 * procedimental de siempre sigue funcionando igual.
 *
 * - UNA llamada de dibujo por personaje: las primitivas del .glb (una por material: skin, shirt,
 *   pants, shoes, hair, hat, coat, eyes, detalle, botones) se fusionan una vez en una plantilla
 *   compartida (posición, huesos y pesos son los mismos búferes para todos) y cada personaje solo
 *   tiene su color por vértice (el color de su CharacterLook × el multiplicador pintado en Blender)
 *   y su índice (las piezas que lleva: peinado, gorro, abrigo). Todos comparten un único material
 *   (y otro para el resaltado), así que no se multiplican los programas de sombreado.
 * - Las piezas se reconocen por su hueso (los peinados y gorros van pesados al 100 % a un hueso
 *   hijo de la cabeza: `pelo_corto`, `gorro_lana`…) o por su material (el abrigo y sus botones).
 * - Animación: un AnimationMixer con un clip por pose (acciones de Blender) y fundidos lineales de
 *   CLIP_FADE s entre clips. Andar y correr se mezclan según la velocidad real y van sincronizados
 *   con ella (la fase avanza con la distancia recorrida: el pie no patina).
 * - Enganches en los huesos con el marco del rig procedimental en reposo: la herramienta en
 *   `mano_d`, la caja que carga en `pecho` y la manta en `raiz` (que es lo que se tumba).
 */
import * as THREE from 'three';
import { hasModel, modelAnimations, modelObject } from '../assets';
import type { CharacterLook, RigPose, RigState } from './character';

/** Nombre del modelo en el .glb. */
export const CHARACTER_MODEL = 'persona';

/** Fundido entre clips (s). */
export const CLIP_FADE = 0.25;

/** Huesos de las piezas que se ponen y se quitan (hijos de la cabeza). */
const HAIR_PIECES = ['pelo_corto', 'pelo_melena', 'pelo_rapado', 'pelo_recogido'] as const;
const ACCESSORIES = new Set<string>([...HAIR_PIECES, 'pelo_bollo', 'gorro_lana', 'gorra']);
/** Materiales con color fijo (el color por vértice es el color final). */
const ABSOLUTE = new Set(['detalle', 'botones']);
/** Materiales que forman el abrigo. */
const COAT = new Set(['coat', 'botones']);
const SHOES = '#3b2a1e';
const EYES = '#1d1d1d';

/** Clip de cada pose quieta (las de andar se deciden aparte, según velocidad, carga y cojera). */
export const POSE_CLIP: Record<Exclude<RigPose, 'walk' | 'stand' | 'wave'>, string> = {
  sit: 'sentado',
  eat: 'comer',
  sitFloor: 'suelo',
  lie: 'dormir',
  work: 'trabajar',
  stir: 'remover',
  kneel: 'arrodillado',
  hammer: 'martillear',
  throw: 'lanzar',
  talk: 'hablar',
  shelter: 'cubierto',
  injured: 'herido',
  cast: 'lanzar_gancho',
  reel: 'recoger',
  use: 'usar',
  drink: 'beber',
  jump: 'saltar',
  cards: 'cartas',
  cardsStand: 'cartas_pie',
  read: 'leer',
};

/** Clips de desplazamiento y su zancada: metros por ciclo del clip. */
const STRIDE: Record<string, number> = { andar: 1.35, correr: 2.4, andar_carga: 1.2, cojear: 1.0 };

/** Todos los clips que el modelo tiene que traer para usarse. */
export const REQUIRED_CLIPS: readonly string[] = [
  ...new Set([...Object.values(POSE_CLIP), 'idle', 'idle_carga', 'idle_cojo', 'andar', 'correr', 'andar_carga', 'cojear', 'saludar', 'saludar_suelo']),
];

/** Posiciones de reposo (coordenadas del personaje, como el rig procedimental) de los enganches. */
const SOCKETS = {
  /** Empuñadura de la herramienta (el `toolMesh` del procedimental, bajo el puño). */
  tool: { bone: 'mano_d', at: new THREE.Vector3(0.235, 0.715, -0.006) },
  /** Caja que carga delante del pecho. */
  carry: { bone: 'pecho', at: new THREE.Vector3(0, 1.1, -0.36) },
  /** Manta: se tumba con el cuerpo (el `body` del procedimental). */
  blanket: { bone: 'raiz', at: new THREE.Vector3(0, 0, 0) },
} as const;
export type SocketName = keyof typeof SOCKETS;

interface Template {
  position: THREE.BufferAttribute;
  skinIndex: THREE.BufferAttribute;
  skinWeight: THREE.BufferAttribute;
  /** Multiplicador (o color absoluto) RGB por vértice. */
  base: Float32Array;
  /** Material de cada vértice (índice en `slots`). */
  slotOf: Uint8Array;
  slots: string[];
  /** Vértices (tres por triángulo) de cada pieza: 'cuerpo', 'abrigo' y los huesos de ACCESSORIES. */
  pieces: Map<string, Uint16Array>;
  vertexCount: number;
  clips: Map<string, THREE.AnimationClip>;
  /** Inversa de la matriz de reposo (en el espacio del modelo) de cada hueso con enganche. */
  restInverse: Map<string, THREE.Matrix4>;
}

let template: Template | null | undefined;
let sharedMaterial: THREE.MeshLambertMaterial | null = null;
let highlightMaterial: THREE.MeshLambertMaterial | null = null;

/** Materiales compartidos por todos los personajes (normal y resaltado). */
function materials(): [THREE.MeshLambertMaterial, THREE.MeshLambertMaterial] {
  sharedMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  highlightMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#5a4520') });
  sharedMaterial.name = 'personaje';
  highlightMaterial.name = 'personaje-resaltado';
  return [sharedMaterial, highlightMaterial];
}

function skinnedMeshes(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

function materialName(m: THREE.Material | THREE.Material[]): string {
  return (Array.isArray(m) ? m[0]?.name : m.name) ?? '';
}

/** Construye la plantilla a partir del modelo cargado (null si falta o le falta algo). */
function buildTemplate(): Template | null {
  const obj = modelObject(CHARACTER_MODEL);
  if (!obj) return null;
  const meshes = skinnedMeshes(obj);
  if (meshes.length === 0) return null;
  const clips = new Map(modelAnimations(CHARACTER_MODEL).map((c) => [c.name, c]));
  if (REQUIRED_CLIPS.some((n) => !clips.has(n))) return null;
  const bones = meshes[0]!.skeleton.bones;
  const slots: string[] = [];
  let vertexCount = 0;
  let indexCount = 0;
  for (const m of meshes) {
    vertexCount += m.geometry.getAttribute('position').count;
    indexCount += m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count;
  }
  if (vertexCount > 65535) return null;
  const pos = new Float32Array(vertexCount * 3);
  const si = new Uint16Array(vertexCount * 4);
  const sw = new Float32Array(vertexCount * 4);
  const base = new Float32Array(vertexCount * 3);
  const slotOf = new Uint8Array(vertexCount);
  const index = new Uint16Array(indexCount);
  let v0 = 0;
  let i0 = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    const ji = g.getAttribute('skinIndex');
    const jw = g.getAttribute('skinWeight');
    const name = materialName(m.material);
    let slot = slots.indexOf(name);
    if (slot < 0) slot = slots.push(name) - 1;
    for (let i = 0; i < p.count; i++) {
      const v = v0 + i;
      pos[v * 3] = p.getX(i);
      pos[v * 3 + 1] = p.getY(i);
      pos[v * 3 + 2] = p.getZ(i);
      base[v * 3] = c ? c.getX(i) : 1;
      base[v * 3 + 1] = c ? c.getY(i) : 1;
      base[v * 3 + 2] = c ? c.getZ(i) : 1;
      for (let k = 0; k < 4; k++) {
        si[v * 4 + k] = ji.getComponent(i, k);
        sw[v * 4 + k] = jw.getComponent(i, k);
      }
      slotOf[v] = slot;
    }
    const idx = g.index;
    const n = idx ? idx.count : p.count;
    for (let k = 0; k < n; k++) index[i0 + k] = v0 + (idx ? idx.getX(k) : k);
    v0 += p.count;
    i0 += n;
  }
  // Pieza de cada triángulo: la del hueso accesorio dominante de su primer vértice, el abrigo por material.
  const pieceOfVertex = (v: number): string => {
    let best = -1;
    let bw = 0;
    for (let k = 0; k < 4; k++) {
      if (sw[v * 4 + k]! > bw) {
        bw = sw[v * 4 + k]!;
        best = si[v * 4 + k]!;
      }
    }
    const bone = bones[best]?.name ?? '';
    if (ACCESSORIES.has(bone)) return bone;
    return COAT.has(slots[slotOf[v]!]!) ? 'abrigo' : 'cuerpo';
  };
  const lists = new Map<string, number[]>();
  for (let t = 0; t < indexCount; t += 3) {
    const piece = pieceOfVertex(index[t]!);
    let l = lists.get(piece);
    if (!l) lists.set(piece, (l = []));
    l.push(index[t]!, index[t + 1]!, index[t + 2]!);
  }
  const pieces = new Map([...lists].map(([k, v]) => [k, Uint16Array.from(v)]));
  if (!pieces.has('cuerpo')) return null;
  // Enganches: inversa de la matriz de reposo de su hueso, en el espacio del modelo.
  obj.updateMatrixWorld(true);
  const rootInv = obj.matrixWorld.clone().invert();
  const restInverse = new Map<string, THREE.Matrix4>();
  for (const s of Object.values(SOCKETS)) {
    const bone = obj.getObjectByName(s.bone);
    if (!bone) return null;
    restInverse.set(s.bone, rootInv.clone().multiply(bone.matrixWorld).invert());
  }
  return {
    position: new THREE.Float32BufferAttribute(pos, 3),
    skinIndex: new THREE.Uint16BufferAttribute(si, 4),
    skinWeight: new THREE.Float32BufferAttribute(sw, 4),
    base,
    slotOf,
    slots,
    pieces,
    vertexCount,
    clips,
    restInverse,
  };
}

/**
 * Plantilla compartida (se construye la primera vez); null si el modelo no está cargado o no sirve
 * (entonces los personajes usan el rig procedimental). Si aún no está cargado no se recuerda el
 * resultado: un personaje creado más tarde lo usará.
 */
export function characterTemplate(): Template | null {
  if (template === undefined) {
    if (!hasModel(CHARACTER_MODEL)) return null;
    try {
      template = buildTemplate();
      if (!template) console.warn(`El modelo «${CHARACTER_MODEL}» no trae todo lo que necesita el personaje; se usa el procedimental`);
    } catch (err) {
      console.warn('Modelo de personaje no válido; se usa el procedimental', err);
      template = null;
    }
  }
  return template;
}

/** Olvida la plantilla (pruebas: tras cambiar los modelos cargados). */
export function resetCharacterTemplate(): void {
  template = undefined;
}

/** Piezas visibles con un aspecto: peinado, moño (sin gorro), gorro y abrigo. */
export function piecesFor(look: CharacterLook): string[] {
  const out = ['cuerpo', HAIR_PIECES[((look.hairStyle % 4) + 4) % 4]!];
  if (look.hairStyle === 3 && look.hat === 'none') out.push('pelo_bollo');
  if (look.hat === 'beanie') out.push('gorro_lana');
  if (look.hat === 'cap') out.push('gorra');
  if (look.coat) out.push('abrigo');
  return out;
}

const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

interface Layer {
  action: THREE.AnimationAction;
  weight: number;
}

/** Un personaje con el modelo de Blender (lo crea y lo maneja CharacterRig). */
export class CharacterModel {
  /** Copia del modelo (origen en los pies, frente hacia −z). */
  readonly object: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  private geometry = new THREE.BufferGeometry();
  private color: THREE.Float32BufferAttribute;
  private mixer: THREE.AnimationMixer;
  private layers = new Map<string, Layer>();
  private phase = 0;
  private skinColor = new THREE.Color();
  private eyesClosed = false;
  private highlighted = false;
  /** Clip principal que se está mostrando (para pruebas y depuración). */
  clip = '';

  /** Peso de cada clip activo (pruebas y depuración). */
  weights(): Record<string, number> {
    return Object.fromEntries([...this.layers].map(([k, l]) => [k, l.weight]));
  }

  /** Fase (0..1) del ciclo de paso, que avanza con la distancia recorrida. */
  get stepPhase(): number {
    return this.phase;
  }

  constructor(
    private readonly tpl: Template,
    look: CharacterLook,
    private readonly seed = 0,
  ) {
    const obj = modelObject(CHARACTER_MODEL)!;
    this.object = obj;
    obj.name = 'personaje-modelo';
    const meshes = skinnedMeshes(obj);
    // Se queda con una de las primitivas (ya enlazada a sus huesos) y le pone la geometría fusionada.
    this.mesh = meshes[0]!;
    for (const m of meshes.slice(1)) m.removeFromParent();
    this.color = new THREE.Float32BufferAttribute(new Float32Array(tpl.vertexCount * 3), 3);
    this.geometry.setAttribute('position', tpl.position);
    this.geometry.setAttribute('skinIndex', tpl.skinIndex);
    this.geometry.setAttribute('skinWeight', tpl.skinWeight);
    this.geometry.setAttribute('color', this.color);
    this.mesh.geometry = this.geometry;
    this.mesh.material = materials()[0];
    this.mesh.name = 'personaje';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Esfera que abarca cualquier pose (de pie, sentado, tumbado hacia +z, brazos arriba): la de
    // three.js se calcularía una sola vez con la primera pose.
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0.45), 1.6);
    this.mixer = new THREE.AnimationMixer(obj);
    this.applyLook(look);
  }

  /** Colores e índice del aspecto (piezas visibles). */
  applyLook(look: CharacterLook): void {
    const t = this.tpl;
    const colors: Record<string, string> = {
      skin: look.skin,
      shirt: look.shirt,
      pants: look.pants,
      shoes: SHOES,
      hair: look.hair,
      hat: look.hatColor,
      coat: look.coat ?? look.shirt,
      eyes: EYES,
    };
    this.skinColor.set(look.skin);
    const slotColor = t.slots.map((s) => (ABSOLUTE.has(s) ? null : _c.set(colors[s] ?? '#ffffff').clone()));
    const arr = this.color.array as Float32Array;
    for (let v = 0; v < t.vertexCount; v++) {
      const c = slotColor[t.slotOf[v]!];
      const k = v * 3;
      arr[k] = c ? c.r * t.base[k]! : t.base[k]!;
      arr[k + 1] = c ? c.g * t.base[k + 1]! : t.base[k + 1]!;
      arr[k + 2] = c ? c.b * t.base[k + 2]! : t.base[k + 2]!;
    }
    this.color.needsUpdate = true;
    const eyes = this.eyesClosed;
    this.eyesClosed = false;
    this.setEyesClosed(eyes);
    const parts = piecesFor(look).map((p) => t.pieces.get(p)).filter((p): p is Uint16Array => !!p);
    const index = new Uint16Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      index.set(p, o);
      o += p.length;
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }

  /** Ojos cerrados (durmiendo): los pinta del color de la piel algo más oscuro. */
  private setEyesClosed(closed: boolean): void {
    if (closed === this.eyesClosed) return;
    this.eyesClosed = closed;
    const t = this.tpl;
    const slot = t.slots.indexOf('eyes');
    if (slot < 0) return;
    _c.set(EYES);
    const r = closed ? this.skinColor.r * 0.62 : _c.r;
    const g = closed ? this.skinColor.g * 0.62 : _c.g;
    const b = closed ? this.skinColor.b * 0.62 : _c.b;
    const arr = this.color.array as Float32Array;
    for (let v = 0; v < t.vertexCount; v++) {
      if (t.slotOf[v] !== slot) continue;
      arr[v * 3] = r * t.base[v * 3]!;
      arr[v * 3 + 1] = g * t.base[v * 3 + 1]!;
      arr[v * 3 + 2] = b * t.base[v * 3 + 2]!;
    }
    this.color.needsUpdate = true;
  }

  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.mesh.material = materials()[on ? 1 : 0];
  }

  /**
   * Objeto enganchado a un hueso con el marco del rig procedimental en reposo (la herramienta, la
   * caja o la manta se colocan igual que antes).
   */
  socket(name: SocketName): THREE.Object3D {
    const s = SOCKETS[name];
    const bone = this.object.getObjectByName(s.bone)!;
    const o = new THREE.Object3D();
    o.name = `enganche-${name}`;
    _m.makeTranslation(s.at.x, s.at.y, s.at.z).premultiply(this.tpl.restInverse.get(s.bone)!);
    _m.decompose(o.position, o.quaternion, o.scale);
    bone.add(o);
    return o;
  }

  /** Clips objetivo (con su peso) para un estado; actualiza la fase de los de andar. */
  private targets(st: RigState, dt: number): Record<string, number> {
    const sp = Math.max(0, st.speed);
    if (st.pose === 'walk' || st.pose === 'stand') {
      if (sp > 0.15) {
        let out: Record<string, number>;
        let stride: number;
        if (st.carry) {
          out = { andar_carga: 1 };
          stride = STRIDE['andar_carga']!;
        } else if (st.limp) {
          out = { cojear: 1 };
          stride = STRIDE['cojear']!;
        } else {
          const run = THREE.MathUtils.clamp((sp - 2.2) / 2, 0, 1);
          out = run >= 1 ? { correr: 1 } : run <= 0 ? { andar: 1 } : { andar: 1 - run, correr: run };
          stride = THREE.MathUtils.lerp(STRIDE['andar']!, STRIDE['correr']!, run);
        }
        this.phase = (this.phase + (sp / stride) * dt) % 1;
        return out;
      }
      return { [st.carry ? 'idle_carga' : st.limp ? 'idle_cojo' : 'idle']: 1 };
    }
    if (st.pose === 'wave') return { [sp < 0.01 ? 'saludar_suelo' : 'saludar']: 1 };
    return { [POSE_CLIP[st.pose]]: 1 };
  }

  /** Avanza la animación (`dt` en segundos reales). */
  animate(st: RigState, dt: number): void {
    const want = this.targets(st, dt);
    const step = dt / CLIP_FADE;
    for (const name of Object.keys(want)) {
      if (this.layers.has(name)) continue;
      const clip = this.tpl.clips.get(name);
      if (!clip) continue;
      const action = this.mixer.clipAction(clip);
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      // Cada personaje empieza los ciclos en un punto distinto (no van todos a la vez).
      action.time = (((this.seed * 0.618 + name.length * 0.13) % 1) + 1) % 1 * clip.duration;
      action.setEffectiveWeight(0);
      action.play();
      this.layers.set(name, { action, weight: 0 });
    }
    let main = '';
    let mainW = -1;
    for (const [name, layer] of this.layers) {
      const target = want[name] ?? 0;
      layer.weight += THREE.MathUtils.clamp(target - layer.weight, -step, step);
      if (layer.weight <= 0 && target <= 0) {
        layer.action.stop();
        this.layers.delete(name);
        continue;
      }
      layer.action.setEffectiveWeight(layer.weight);
      if (name in STRIDE) {
        // Sincronizados con la distancia recorrida (y entre sí, al mezclar andar y correr).
        layer.action.timeScale = 0;
        layer.action.time = this.phase * layer.action.getClip().duration;
      } else layer.action.timeScale = 1;
      if (target > mainW) {
        mainW = target;
        main = name;
      }
    }
    this.clip = main;
    this.mixer.update(dt);
    this.setEyesClosed(st.pose === 'lie');
  }

  /**
   * Inclinación (rad, sobre x) del eje de la mano respecto al personaje, con el mismo sentido que
   * `shRX + elR + torsoX` del procedimental. Necesita las matrices al día.
   */
  handPitch(socket: THREE.Object3D, root: THREE.Object3D): number {
    socket.getWorldQuaternion(_q);
    root.getWorldQuaternion(_qr);
    _q.premultiply(_qr.invert());
    _v.set(0, -1, 0).applyQuaternion(_q);
    return Math.atan2(-_v.z, -_v.y);
  }

  /** Orientación de `socket` respecto a `root` (para dejar un objeto con una orientación fija). */
  socketToRoot(socket: THREE.Object3D, root: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
    socket.getWorldQuaternion(out);
    root.getWorldQuaternion(_qr);
    return out.premultiply(_qr.invert());
  }

  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.object);
    // Los búferes de posición, huesos y pesos son de la plantilla (compartidos): solo se liberan
    // el color y el índice propios.
    this.geometry.deleteAttribute('position');
    this.geometry.deleteAttribute('skinIndex');
    this.geometry.deleteAttribute('skinWeight');
    this.geometry.dispose();
    this.object.removeFromParent();
  }
}

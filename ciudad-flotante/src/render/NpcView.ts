/**
 * [AGENTE render-ship] PERSONAJES DE LOS HABITANTES (low-poly, articulados y animados).
 *
 * Cada habitante es un `CharacterRig` con los colores de su `appearance` (índices de
 * PALETTE.skins/shirts/pants/hair) y su altura. La pose sale de `activity` y del movimiento
 * real entre frames:
 *  - caminar (balanceo según la velocidad medida; cojea si está herido), cargando si lleva algo;
 *  - dormir tumbado en SU cama (npc.bed → cama/litera con dos alturas/camilla) con manta y "Zzz";
 *  - comer sentado en la silla más cercana (o de pie con un cuenco);
 *  - trabajar según el puesto (remover la olla, arrodillarse en el huerto, martillear con la
 *    llave, pescar con caña, lanzar el gancho), construir, apagar fuego con el cubo, charlar
 *    gesticulando y mirando al interlocutor, a cubierto encogido, herido.
 * Bocadillo de texto (npc.say) legible a cualquier distancia. Oculto si está fuera ('away') o
 * por encima del nivel visible. Resaltado con `setHighlight(id)`.
 */
import * as THREE from 'three';
import { wrapAngle } from '../core/math';
import { WATERLINE_Y } from '../sim/constants';
import { levelOfY } from '../sim/ship';
import type { GameState, NpcState } from '../sim/types';
import { SpeechBubble } from './ship/bubble';
import { CharacterRig, lookFromAppearance, type RigPose, type RigTool } from './ship/character';
import { bedPose, seatsOf, type Seat } from './ship/furniture';
import { hash01 } from './ship/geo';
import { insideHull } from './ship/hull';

interface NpcEntry {
  container: THREE.Group;
  rig: CharacterRig;
  bubble: SpeechBubble;
  /** Sedal y corcho del pescador (solo mientras pesca). */
  line: THREE.Line | null;
  bobber: THREE.Mesh | null;
  last: THREE.Vector3 | null;
  speed: number;
  yaw: number;
  lookKey: string;
}

/** Resultado de decidir la pose de un habitante. */
export interface NpcPoseInfo {
  pose: RigPose;
  tool: RigTool;
  carry: boolean;
  limp: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Colocación fija (cama, silla): sin suavizado de giro. */
  snap: boolean;
  blanket: string | null;
}

const _cam = new THREE.Vector3();
const _p = new THREE.Vector3();
const _tip = new THREE.Vector3();
const LINE_MAT = new THREE.LineBasicMaterial({ color: '#e8e3c9', transparent: true, opacity: 0.8 });
const BOBBER_GEO = new THREE.SphereGeometry(0.07, 6, 4);
const BOBBER_MAT = new THREE.MeshLambertMaterial({ color: '#e63946' });

/** Decide la pose de un habitante (lógica pura, testeable). */
export function decideNpcPose(n: NpcState, state: GameState, speed: number, seats: Seat[]): NpcPoseInfo {
  const base: NpcPoseInfo = { pose: 'stand', tool: null, carry: !!n.carry, limp: n.injured || n.needs.health < 35, x: n.pos.x, y: n.pos.y, z: n.pos.z, yaw: n.yaw, snap: false, blanket: null };
  const act = n.activity;
  if (act === 'sleeping') {
    const bed = n.bed ? bedPose(state.ship, n.bed.moduleId, n.bed.index) : null;
    if (bed && Math.hypot(bed.x - n.pos.x, bed.z - n.pos.z) < 3 && Math.abs(bed.y - n.pos.y) < 2.4) {
      return { ...base, pose: 'lie', x: bed.x, y: bed.y, z: bed.z, yaw: bed.yaw, snap: true, blanket: bed.blanket, carry: false, limp: false };
    }
    return { ...base, pose: 'lie', y: n.pos.y + 0.02, snap: true, carry: false, limp: false };
  }
  const moving = speed > 0.25;
  if (act === 'eating' && !moving) {
    let best: Seat | null = null;
    let bd = 1.3;
    for (const s of seats) {
      const d = Math.hypot(s.x - n.pos.x, s.z - n.pos.z);
      if (d < bd && Math.abs(s.y - n.pos.y) < 1) {
        bd = d;
        best = s;
      }
    }
    if (best) return { ...base, pose: 'eat', tool: 'cuenco', x: best.x, y: best.y, z: best.z, yaw: best.yaw, snap: true, carry: false };
    return { ...base, pose: 'stand', tool: 'cuenco', carry: false };
  }
  if (moving) return { ...base, pose: 'walk' };
  if (act === 'idle') {
    // si se para junto a una silla, se sienta a descansar
    for (const s of seats) {
      if (Math.hypot(s.x - n.pos.x, s.z - n.pos.z) < 0.6 && Math.abs(s.y - n.pos.y) < 1) {
        return { ...base, pose: 'sit', x: s.x, y: s.y, z: s.z, yaw: s.yaw, snap: true, carry: false };
      }
    }
  }
  switch (act) {
    case 'working': {
      // Pista de animación que deja la IA (task.data.anim); si no hay, la pose del puesto.
      const anim = (n.task?.data as { anim?: string } | undefined)?.anim;
      switch (anim) {
        case 'cocinar':
          return { ...base, pose: 'stir', tool: 'cucharon', carry: false };
        case 'cultivar':
          return { ...base, pose: 'kneel', tool: null, carry: false };
        case 'reparar':
          return { ...base, pose: 'hammer', tool: 'llave', carry: false };
        case 'pescar':
          return { ...base, pose: 'reel', tool: 'cana', carry: false };
        case 'gancho':
          return { ...base, pose: 'cast', tool: 'gancho', carry: false };
        case 'construir':
          return { ...base, pose: 'hammer', tool: 'martillo', carry: false };
        default:
          break;
      }
      switch (n.role) {
        case 'cocinero':
          return { ...base, pose: 'stir', tool: 'cucharon', carry: false };
        case 'jardinero':
          return { ...base, pose: 'kneel', tool: null, carry: false };
        case 'mecanico':
          return { ...base, pose: 'hammer', tool: 'llave', carry: false };
        case 'pescador':
          return { ...base, pose: 'reel', tool: 'cana', carry: false };
        case 'recolector':
          return { ...base, pose: 'cast', tool: 'gancho', carry: false };
        default:
          return { ...base, pose: 'work', carry: false };
      }
    }
    case 'building':
      return { ...base, pose: 'hammer', tool: 'martillo', carry: false };
    case 'firefighting':
      return { ...base, pose: 'throw', tool: 'cubo_lleno', carry: false };
    case 'socializing': {
      // mira al interlocutor más cercano (habitante o jugador)
      let tx: number | null = null;
      let tz = 0;
      let bd = 3.5;
      const consider = (x: number, y: number, z: number): void => {
        const d = Math.hypot(x - n.pos.x, z - n.pos.z);
        if (d > 0.3 && d < bd && Math.abs(y - n.pos.y) < 1.5) {
          bd = d;
          tx = x;
          tz = z;
        }
      };
      for (const o of state.npcs) if (o.id !== n.id && o.activity !== 'away') consider(o.pos.x, o.pos.y, o.pos.z);
      consider(state.player.pos.x, state.player.pos.y, state.player.pos.z);
      const yaw = tx !== null ? Math.atan2(-((tx as number) - n.pos.x), -(tz - n.pos.z)) : n.yaw;
      return { ...base, pose: 'talk', yaw, carry: false };
    }
    case 'sheltering':
      return { ...base, pose: 'shelter', carry: false };
    case 'injured':
      return { ...base, pose: 'injured', carry: false, limp: true };
    default:
      return base;
  }
}

export class NpcView {
  private entries = new Map<string, NpcEntry>();
  private highlightId: string | null = null;
  private seats: Seat[] = [];
  private seatsRev = -1;

  constructor(readonly root: THREE.Group) {}

  reset(): void {
    for (const e of this.entries.values()) this.disposeEntry(e);
    this.entries.clear();
    this.seatsRev = -1;
  }

  /** Resalta un habitante (objetivo de interacción) o ninguno. */
  setHighlight(id: string | null): void {
    if (id === this.highlightId) return;
    if (this.highlightId) this.entries.get(this.highlightId)?.rig.setHighlight(false);
    this.highlightId = id;
    if (id) this.entries.get(id)?.rig.setHighlight(true);
  }

  /**
   * Sincroniza con el estado. `camera` (opcional) sirve para desvanecer los bocadillos con la
   * distancia; si no se pasa se usa la posición de los ojos del jugador.
   */
  sync(state: GameState, dtReal: number, hideAboveLevel: number | null, camera?: THREE.Camera): void {
    const dt = Math.min(0.1, Math.max(0, dtReal));
    if (this.seatsRev !== state.ship.revision) {
      this.seats = seatsOf(state);
      this.seatsRev = state.ship.revision;
    }
    let fov = 72;
    if (camera) {
      camera.getWorldPosition(_cam);
      this.root.worldToLocal(_cam);
      if (camera instanceof THREE.PerspectiveCamera) fov = camera.fov;
    } else _cam.set(state.player.pos.x, state.player.pos.y + 1.6, state.player.pos.z);
    const alive = new Set<string>();
    for (const n of state.npcs) {
      alive.add(n.id);
      let e = this.entries.get(n.id);
      const lookKey = `${n.appearance.skin}|${n.appearance.shirt}|${n.appearance.pants}|${n.appearance.hair}|${n.appearance.hat}|${n.appearance.height}|${n.sick}`;
      if (!e) {
        const seed = hashId(n.id);
        const rig = new CharacterRig(this.lookFor(n, seed), seed);
        rig.root.name = `habitante-${n.id}`;
        const container = new THREE.Group();
        container.name = `npc-${n.id}`;
        container.userData = { npcId: n.id };
        container.add(rig.root);
        const bubble = new SpeechBubble();
        this.root.add(container, bubble.sprite);
        e = { container, rig, bubble, last: null, speed: 0, yaw: n.yaw, lookKey, line: null, bobber: null };
        this.entries.set(n.id, e);
        if (this.highlightId === n.id) rig.setHighlight(true);
      } else if (e.lookKey !== lookKey) {
        e.rig.applyLook(this.lookFor(n, hashId(n.id)));
        e.lookKey = lookKey;
      }
      // velocidad real medida entre frames (m/s)
      _p.set(n.pos.x, n.pos.y, n.pos.z);
      if (e.last && dt > 0) {
        const d = Math.hypot(_p.x - e.last.x, _p.z - e.last.z);
        const v = d / dt;
        e.speed += ((v > 40 ? 0 : v) - e.speed) * Math.min(1, dt * 8);
      }
      e.last = (e.last ?? new THREE.Vector3()).copy(_p);
      const level = levelOfY(n.pos.y);
      const visible = n.activity !== 'away' && (hideAboveLevel === null || level <= hideAboveLevel);
      e.container.visible = visible;
      const info = decideNpcPose(n, state, e.speed, this.seats);
      e.container.position.set(info.x, info.y, info.z);
      if (info.snap) e.yaw = info.yaw;
      else e.yaw += wrapAngle(info.yaw - e.yaw) * Math.min(1, dt * 8);
      e.rig.root.rotation.y = e.yaw;
      if (visible) e.rig.animate({ pose: info.pose, speed: e.speed, limp: info.limp, tool: info.tool, carry: info.carry, blanket: info.blanket }, dt);
      this.updateFishingLine(e, info, state, visible);
      // bocadillo
      const saying = n.say && state.time < n.say.until ? n.say.text : null;
      e.bubble.setFov(fov);
      e.bubble.set(saying, info.pose === 'lie');
      const headY = info.pose === 'lie' ? 0.75 : info.pose === 'eat' || info.pose === 'kneel' ? 1.55 * n.appearance.height : 1.95 * n.appearance.height;
      _p.set(info.x, info.y + headY, info.z);
      e.bubble.update(_p, _cam, visible, dt);
    }
    for (const [id, e] of this.entries) {
      if (!alive.has(id)) {
        this.disposeEntry(e);
        this.entries.delete(id);
      }
    }
  }

  /** Sedal desde la punta de la caña hasta un corcho en el agua, delante del pescador. */
  private updateFishingLine(e: NpcEntry, info: NpcPoseInfo, state: GameState, visible: boolean): void {
    const fishing = visible && info.tool === 'cana';
    let show = false;
    if (fishing) {
      const tip = e.rig.rodTip(_tip);
      // corcho a unos metros por delante, en la superficie (solo si cae fuera del casco)
      const bx = info.x - Math.sin(e.yaw) * 3.6;
      const bz = info.z - Math.cos(e.yaw) * 3.6;
      if (tip && !insideHull(bx, bz, state.ship.length, state.ship.width)) {
        this.root.worldToLocal(tip);
        if (!e.line) {
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
          e.line = new THREE.Line(g, LINE_MAT);
          e.line.frustumCulled = false;
          e.line.name = 'sedal';
          e.bobber = new THREE.Mesh(BOBBER_GEO, BOBBER_MAT);
          e.bobber.name = 'corcho';
          this.root.add(e.line, e.bobber);
        }
        const by = WATERLINE_Y + 0.04 + Math.sin(e.yaw * 7 + performance.now() / 600) * 0.03;
        const pos = e.line.geometry.getAttribute('position') as THREE.BufferAttribute;
        pos.setXYZ(0, tip.x, tip.y, tip.z);
        pos.setXYZ(1, bx, by, bz);
        pos.needsUpdate = true;
        e.bobber!.position.set(bx, by, bz);
        show = true;
      }
    }
    if (e.line) e.line.visible = show;
    if (e.bobber) e.bobber.visible = show;
  }

  private lookFor(n: NpcState, seed: number): ReturnType<typeof lookFromAppearance> {
    const look = lookFromAppearance(n.appearance, seed);
    if (n.sick) look.skin = new THREE.Color(look.skin).lerp(new THREE.Color('#9dbf7a'), 0.25).getStyle();
    return look;
  }

  private disposeEntry(e: NpcEntry): void {
    if (e.line) {
      e.line.geometry.dispose();
      e.line.removeFromParent();
    }
    e.bobber?.removeFromParent();
    e.rig.dispose();
    e.bubble.dispose();
    e.container.removeFromParent();
  }

  /** Objeto 3D de un habitante (para resaltado / bocadillos / interacción). */
  objectOf(id: string): THREE.Object3D | null {
    return this.entries.get(id)?.container ?? null;
  }
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) + hash01(h) * 0.001;
}

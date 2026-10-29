/**
 * [AGENTE render-ship] Personaje del jugador visible en tercera persona (mismo estilo que los
 * habitantes): herramienta en la mano según `pose.tool`, caminar/correr, salto, dormir
 * tumbado, acciones (martillo, lanzar el gancho/caña, recoger, cubo) y abrigo si lo lleva.
 */
import * as THREE from 'three';
import type { ToolKind } from '../data/items';
import { ITEMS } from '../data/items';
import { CharacterRig, type CharacterLook, type RigPose, type RigTool } from './ship/character';

export interface AvatarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** m/s horizontal (para animación de caminar/correr). Si es 0 se mide entre frames. */
  speed: number;
  onGround: boolean;
  sleeping: boolean;
  tool: ToolKind | null;
  /**
   * Acción en curso para animar brazos: 'idle' | 'use' | 'hammer' | 'cast' | 'reel' | 'throw' |
   * 'drink' | 'work' (y sinónimos: repair, fish, hook, extinguish, pickup, eat, plant, cook…).
   */
  action: string;
  clothing: string | null;
  /**
   * Opcional: colchón sobre el que duerme (ver `bedPose` en ship/furniture.ts). Si falta y
   * `sleeping` es true, se tumba en el suelo en (x, y, z) mirando hacia `yaw`.
   */
  bed?: { x: number; y: number; z: number; yaw: number; blanket?: string } | null;
}

/** Aspecto fijo del jugador: camisa azul, gorro de lana rojo. */
export const PLAYER_LOOK: CharacterLook = {
  skin: '#e0ac69',
  shirt: '#457b9d',
  pants: '#3d405b',
  hair: '#5a3825',
  hat: 'beanie',
  hatColor: '#bc4749',
  hairStyle: 0,
  height: 1.0,
  coat: null,
};

/** Acción del controlador → pose (con sinónimos para que cualquier nombre razonable funcione). */
const ACTION_POSE: Record<string, RigPose> = {
  use: 'use',
  pickup: 'use',
  collect: 'use',
  plant: 'kneel',
  harvest: 'kneel',
  hammer: 'hammer',
  repair: 'hammer',
  build: 'hammer',
  cast: 'cast',
  hook: 'cast',
  reel: 'reel',
  fish: 'reel',
  throw: 'throw',
  extinguish: 'throw',
  drink: 'drink',
  eat: 'drink',
  work: 'work',
  cook: 'stir',
};

export class PlayerAvatar {
  readonly object = new THREE.Group();
  readonly rig: CharacterRig;
  private last: THREE.Vector3 | null = null;
  private measured = 0;
  private coat: string | null = null;

  constructor(readonly root: THREE.Group) {
    this.rig = new CharacterRig({ ...PLAYER_LOOK }, 7);
    this.rig.root.name = 'jugador';
    this.object.name = 'avatar-jugador';
    this.object.add(this.rig.root);
    root.add(this.object);
  }

  update(pose: AvatarPose, dtReal: number, visible: boolean): void {
    const dt = Math.min(0.1, Math.max(0, dtReal));
    this.object.visible = visible;
    // abrigo
    const coat = pose.clothing ? (ITEMS[pose.clothing]?.color ?? '#3a5a40') : null;
    if (coat !== this.coat) {
      this.coat = coat;
      this.rig.applyLook({ ...this.rig.look, coat });
    }
    // velocidad: la que dé el controlador o la medida entre frames
    if (this.last && dt > 0) {
      const v = Math.hypot(pose.x - this.last.x, pose.z - this.last.z) / dt;
      this.measured += ((v > 30 ? 0 : v) - this.measured) * Math.min(1, dt * 10);
    }
    this.last = (this.last ?? new THREE.Vector3()).set(pose.x, pose.y, pose.z);
    const speed = pose.speed > 0 ? pose.speed : this.measured;

    let rp: RigPose = 'stand';
    let x = pose.x;
    let y = pose.y;
    let z = pose.z;
    let yaw = pose.yaw;
    let blanket: string | null = null;
    if (pose.sleeping) {
      rp = 'lie';
      if (pose.bed) {
        x = pose.bed.x;
        y = pose.bed.y;
        z = pose.bed.z;
        yaw = pose.bed.yaw;
        blanket = pose.bed.blanket ?? '#2a9d8f';
      } else {
        // en el suelo: los pies en la posición, el cuerpo hacia donde mira
        yaw = pose.yaw + Math.PI;
        y += 0.02;
      }
    } else if (!pose.onGround) rp = 'jump';
    else if (ACTION_POSE[pose.action]) rp = ACTION_POSE[pose.action]!;
    else rp = speed > 0.2 ? 'walk' : 'stand';
    this.object.position.set(x, y, z);
    this.rig.root.rotation.y = yaw;
    if (visible) this.rig.animate({ pose: rp, speed, tool: pose.sleeping ? null : (pose.tool as RigTool), blanket }, dt);
  }

  dispose(): void {
    this.rig.dispose();
    this.object.removeFromParent();
  }
}

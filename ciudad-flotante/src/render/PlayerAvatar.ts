/** [AGENTE render-ship] Personaje del jugador visible en tercera persona. STUB. */
import * as THREE from 'three';
import type { ToolKind } from '../data/items';

export interface AvatarPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** m/s horizontal (para animación de caminar/correr). */
  speed: number;
  onGround: boolean;
  sleeping: boolean;
  tool: ToolKind | null;
  /** Acción en curso para animar brazos: 'idle' | 'use' | 'hammer' | 'cast' | 'reel' */
  action: string;
  clothing: string | null;
}

export class PlayerAvatar {
  readonly object = new THREE.Group();
  constructor(readonly root: THREE.Group) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1), new THREE.MeshLambertMaterial({ color: '#457b9d' }));
    body.position.y = 0.85;
    this.object.add(body);
    root.add(this.object);
  }

  update(pose: AvatarPose, _dtReal: number, visible: boolean): void {
    this.object.visible = visible;
    this.object.position.set(pose.x, pose.y, pose.z);
    this.object.rotation.y = pose.yaw;
  }
}

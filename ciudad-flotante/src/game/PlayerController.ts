/**
 * [AGENTE game-player] Control del personaje: movimiento, salto, carrera, cámara en
 * primera/tercera persona, sueño. STUB funcional básico (primera persona WASD + ratón).
 */
import * as THREE from 'three';
import { EYE_HEIGHT, forwardOf, type Body } from '../sim/physics';
import type { PlayerAvatar } from '../render/PlayerAvatar';
import type { GameContext } from './context';

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  private body: Body | null = null;
  perspective: 'first' | 'third' = 'first';

  constructor(
    private readonly ctx: GameContext,
    private readonly avatar: PlayerAvatar,
  ) {
    this.camera = new THREE.PerspectiveCamera(ctx.settings.fov, 16 / 9, 0.05, 3000);
  }

  /** Reinicia el cuerpo físico desde el estado (nueva partida / carga / teletransporte). */
  reset(): void {
    const p = this.ctx.sim.state.player.pos;
    this.body = { pos: { ...p }, vy: 0, onGround: true };
  }

  togglePerspective(): void {
    this.perspective = this.perspective === 'first' ? 'third' : 'first';
  }

  update(dtReal: number): void {
    const { sim, input } = this.ctx;
    const st = sim.state.player;
    if (!this.body) this.reset();
    const body = this.body!;
    if (!st.sleeping) {
      const md = input.mouseDelta();
      const sens = this.ctx.settings.sensitivity / 1000;
      st.yaw -= md.dx * sens;
      st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - md.dy * sens * (this.ctx.settings.invertY ? -1 : 1)));
      const f = forwardOf(st.yaw);
      const r = { x: -f.z, z: f.x };
      let mx = 0;
      let mz = 0;
      if (input.down('KeyW')) { mx += f.x; mz += f.z; }
      if (input.down('KeyS')) { mx -= f.x; mz -= f.z; }
      if (input.down('KeyD')) { mx += r.x; mz += r.z; }
      if (input.down('KeyA')) { mx -= r.x; mz -= r.z; }
      const len = Math.hypot(mx, mz) || 1;
      const speed = input.down('ShiftLeft') ? 5.6 : 3.4;
      sim.collision.move(body, (mx / len) * speed * (mx || mz ? 1 : 0), (mz / len) * speed * (mx || mz ? 1 : 0), dtReal, input.pressed('Space'));
      st.pos.x = body.pos.x;
      st.pos.y = body.pos.y;
      st.pos.z = body.pos.z;
    }
    this.camera.position.set(st.pos.x, st.pos.y + EYE_HEIGHT, st.pos.z);
    this.camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
    if (this.camera.parent !== this.ctx.renderer.shipRoot) this.ctx.renderer.shipRoot.add(this.camera);
    this.avatar.update(
      { x: st.pos.x, y: st.pos.y, z: st.pos.z, yaw: st.yaw, speed: 0, onGround: body.onGround, sleeping: !!st.sleeping, tool: null, action: 'idle', clothing: st.clothing },
      dtReal,
      this.perspective === 'third',
    );
  }
}

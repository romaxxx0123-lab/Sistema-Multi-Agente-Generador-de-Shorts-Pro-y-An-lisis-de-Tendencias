/**
 * [AGENTE game-player] CONTROL DEL PERSONAJE.
 *
 * - Movimiento con aceleración y frenado suaves (caminar 3,4 m/s, correr con Mayús 5,6 m/s),
 *   salto con margen de pulsación, física del barco (`sim.collision.move`: paredes, muebles,
 *   escalones y rampas de escalera) y corrección de la velocidad al chocar (deslizamiento).
 * - Ratón con la sensibilidad y la inversión de los ajustes; FOV de los ajustes con un leve
 *   ensanchamiento al correr. Los deltas de los primeros frames tras recuperar el control (cerrar
 *   un panel o el menú) o capturar el puntero se descartan: al capturarlo, el navegador puede
 *   mandar un salto igual a la posición del cursor y la vista acabaría mirando al cielo.
 * - Choque con los habitantes visibles (círculo contra círculo, radios 0,32 + 0,3 m) y la cámara
 *   en tercera persona tampoco se mete en ellos. Si uno tapa un paso estrecho y el jugador lleva
 *   2,5 s empujando sin avanzar, se le deja pasar (nunca se queda encerrado).
 * - Cámara hija de `shipRoot` (se mece con el barco). Primera persona con cabeceo al andar
 *   sincronizado con los pasos (sonido 'paso' en cada pisada) y golpe al aterrizar. Tercera
 *   persona (V): brazo detrás del hombro con colisión contra paredes y techos, transición suave.
 * - Durmiendo: cámara tumbada en la cama (o en el suelo si se desmaya); E o Espacio despiertan.
 * - Red de seguridad: fuera del casco o por debajo de y = -3 reaparece en `safeSpawn()`.
 *
 * Escribe `player.pos/yaw/pitch` (única excepción a "el estado solo cambia por comandos").
 */
import * as THREE from 'three';
import { ITEMS, type ToolKind } from '../data/items';
import type { PlayerAvatar } from '../render/PlayerAvatar';
import { bedPose } from '../render/ship/furniture';
import { EYE_HEIGHT, forwardOf, type Body } from '../sim/physics';
import { cellAtPoint, type AABB } from '../sim/ship';
import type { Vec3 } from '../sim/types';
import type { GameContext } from './context';
import { boxAt, damp, lookDir, wrapAngle, type V3 } from './tools/aim';
import { approachVelocity, NPC_RADIUS, NpcCollider, stepAssist, type Obstacle } from './tools/locomotion';
import { ARM_LENGTH, computeArm, THIRD_PITCH_MAX, THIRD_PITCH_MIN, verticalLimits } from './tools/cameraRig';

/** Velocidades (m/s). */
export const WALK_SPEED = 3.4;
export const RUN_SPEED = 5.6;
/** Aceleración y frenado en el suelo y control en el aire (m/s²). */
const ACCEL_GROUND = 26;
const DECEL_GROUND = 32;
const ACCEL_AIR = 6;
/** Margen para pulsar salto antes de tocar el suelo (s). */
const JUMP_BUFFER = 0.14;
/** Largo de zancada (m por paso) caminando y corriendo. */
const STRIDE_WALK = 0.74;
const STRIDE_RUN = 0.98;
/** Límite de cabeceo de la vista en primera persona (rad). */
const PITCH_LIMIT = 1.45;
/** Altura por debajo de la cual se considera que el jugador cayó al mar (m). */
const FALL_LIMIT_Y = -3;
/** Frames de ratón descartados al recuperar el control o capturar el puntero. */
export const LOOK_GRACE_FRAMES = 2;
/**
 * Un delta de ratón mayor que esto en un solo frame (px) es un salto espurio del navegador (con la
 * sensibilidad por defecto son 4,4 rad: más de media vuelta en un frame).
 */
export const MAX_LOOK_DELTA = 2000;

const _v = new THREE.Vector3();

export class PlayerController {
  readonly camera: THREE.PerspectiveCamera;
  private body: Body | null = null;
  perspective: 'first' | 'third' = 'first';

  /** Velocidad horizontal deseada/actual (m/s, coordenadas del barco). */
  private vel = { x: 0, z: 0 };
  /** Última posición escrita en el estado (para detectar teletransportes externos). */
  private written: Vec3 | null = null;
  private jumpBuffer = 0;
  private wasOnGround = true;
  private fallSpeed = 0;
  private stepIndex = 0;
  private fovCur = 0;
  /** Largo actual del brazo de cámara (transición 1ª ↔ 3ª persona y colisiones). */
  private arm = 0;
  private armFree = 0;
  private avatarYaw = 0;
  private wakeHintAt = -Infinity;
  private time = 0;
  private landVel = 0;
  /** Orientación del cuerpo tumbado en el suelo durante un desmayo (null = sin calcular). */
  private floorYaw: number | null = null;
  /** Frames de ratón que quedan por descartar (ver LOOK_GRACE_FRAMES). */
  private lookGrace = 0;
  private hadControl = false;
  private wasLocked = false;
  /** Cuerpos de los habitantes de este frame (reutilizado). */
  private readonly obstacles: Obstacle[] = [];
  /** Choque con los habitantes (con salida de emergencia si uno tapa un paso estrecho). */
  private readonly npcCollider = new NpcCollider();

  /** Fase de los pasos (π por pisada) para el cabeceo y el modelo en mano. */
  bobPhase = 0;
  /** Intensidad del balanceo 0..~1,4 (0 parado o en el aire). */
  bobAmount = 0;
  /** 0..1 golpe de aterrizaje (se amortigua solo). */
  landKick = 0;
  /** Velocidad horizontal real (m/s). */
  speed = 0;
  running = false;
  onGround = true;

  constructor(
    private readonly ctx: GameContext,
    private readonly avatar: PlayerAvatar,
  ) {
    this.camera = new THREE.PerspectiveCamera(ctx.settings.fov, 16 / 9, 0.05, 3000);
    this.camera.name = 'camara-jugador';
    this.camera.rotation.order = 'YXZ';
    this.fovCur = ctx.settings.fov;
    this.perspective = ctx.settings.perspective;
  }

  /** Reinicia el cuerpo físico desde el estado (nueva partida / carga / teletransporte). */
  reset(): void {
    const p = this.ctx.sim.state.player.pos;
    this.body = { pos: { ...p }, vy: 0, onGround: true };
    this.vel.x = 0;
    this.vel.z = 0;
    this.jumpBuffer = 0;
    this.fallSpeed = 0;
    this.wasOnGround = true;
    this.landKick = 0;
    this.landVel = 0;
    this.bobAmount = 0;
    this.speed = 0;
    this.written = { ...p };
    this.avatarYaw = this.ctx.sim.state.player.yaw;
    this.npcCollider.reset();
  }

  togglePerspective(): void {
    this.perspective = this.perspective === 'first' ? 'third' : 'first';
    // Se recuerda como preferencia del jugador.
    if (this.ctx.settings.perspective !== this.perspective) {
      this.ctx.settings.perspective = this.perspective;
      this.ctx.saveSettings();
    }
  }

  /** 0 = primera persona pura, 1 = tercera persona con el brazo completo. */
  get thirdPersonBlend(): number {
    return Math.min(1, this.arm / ARM_LENGTH);
  }

  /** ¿Se ve el mundo en primera persona ahora mismo (modelo en mano visible)? */
  get firstPersonView(): boolean {
    return this.arm < 0.35;
  }

  /** Ojo del personaje (coordenadas del barco, sin cabeceo). */
  eye(out: V3 = { x: 0, y: 0, z: 0 }): V3 {
    const p = this.ctx.sim.state.player.pos;
    out.x = p.x;
    out.y = p.y + EYE_HEIGHT;
    out.z = p.z;
    return out;
  }

  /** Dirección de la mirada (unitaria, coordenadas del barco). */
  lookDirection(): V3 {
    const st = this.ctx.sim.state.player;
    return lookDir(st.yaw, st.pitch);
  }

  /**
   * Mano derecha del avatar en coordenadas de MUNDO (tercera persona). Con la caña, la punta.
   * En primera persona `Interaction` usa los anclajes del modelo en mano.
   */
  handWorld(out: THREE.Vector3, anchor = 'mano'): THREE.Vector3 {
    if (anchor === 'punta') {
      const tip = this.avatar.rig.rodTip(out);
      if (tip) return tip;
    }
    const st = this.ctx.sim.state.player;
    const yaw = this.avatarYaw;
    const f = forwardOf(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    out.set(st.pos.x + rx * 0.3 + f.x * 0.32, st.pos.y + 1.12, st.pos.z + rz * 0.3 + f.z * 0.32);
    return this.ctx.renderer.shipRoot.localToWorld(out);
  }

  update(dtReal: number): void {
    const ctx = this.ctx;
    const { sim, input } = ctx;
    const st = sim.state.player;
    const dt = Math.max(0, Math.min(0.1, dtReal));
    this.time += dt;
    if (!this.body) this.reset();
    // Alguien movió al jugador desde fuera (teletransporte de depuración, carga, la simulación…).
    if (this.written && Math.hypot(st.pos.x - this.written.x, st.pos.y - this.written.y, st.pos.z - this.written.z) > 0.05) this.reset();
    const body = this.body!;
    if (this.camera.parent !== ctx.renderer.shipRoot) ctx.renderer.shipRoot.add(this.camera);
    const canControl = input.enabled && ctx.mode === 'play' && !ctx.ui.panelOpen && st.alive;
    // Fuera del modo de juego (construcción) la mano no se dibuja: la cámara del jugador sigue en la escena.
    if (ctx.mode !== 'play') ctx.interaction?.hideViewModel();

    if (st.sleeping) {
      this.updateSleeping(dt, canControl);
      return;
    }
    this.floorYaw = null;

    // --- Mirada ---
    this.applyLook(canControl);

    // --- Intención de movimiento ---
    let ix = 0;
    let iz = 0;
    if (canControl) {
      const f = forwardOf(st.yaw);
      const r = { x: -f.z, z: f.x };
      if (input.down('KeyW') || input.down('ArrowUp')) {
        ix += f.x;
        iz += f.z;
      }
      if (input.down('KeyS') || input.down('ArrowDown')) {
        ix -= f.x;
        iz -= f.z;
      }
      if (input.down('KeyD') || input.down('ArrowRight')) {
        ix += r.x;
        iz += r.z;
      }
      if (input.down('KeyA') || input.down('ArrowLeft')) {
        ix -= r.x;
        iz -= r.z;
      }
    }
    const ilen = Math.hypot(ix, iz);
    const wantsRun = canControl && (input.down('ShiftLeft') || input.down('ShiftRight'));
    this.running = wantsRun && ilen > 0;
    const target = ilen > 0 ? (this.running ? RUN_SPEED : WALK_SPEED) : 0;
    const wx = ilen > 0 ? (ix / ilen) * target : 0;
    const wz = ilen > 0 ? (iz / ilen) * target : 0;
    const accel = body.onGround ? (ilen > 0 ? ACCEL_GROUND : DECEL_GROUND) : ACCEL_AIR;
    approachVelocity(this.vel, wx, wz, accel, dt);

    // --- Salto ---
    if (canControl && input.pressed('Space')) this.jumpBuffer = JUMP_BUFFER;
    const jump = this.jumpBuffer > 0 && body.onGround;
    if (jump) {
      this.jumpBuffer = 0;
      ctx.bus.emit('sfx', { name: 'salto', x: body.pos.x, y: body.pos.y, z: body.pos.z });
    }
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);

    // --- Física ---
    const bx = body.pos.x;
    const by = body.pos.y;
    const bz = body.pos.z;
    const vyBefore = body.vy;
    const wasGrounded = body.onGround;
    if (dt > 0) sim.collision.move(body, this.vel.x, this.vel.z, dt, jump);
    if (dt > 0 && wasGrounded && !jump) stepAssist(sim.collision, body, bx, by, bz, this.vel.x, this.vel.z, dt);
    // Los habitantes son sólidos: no se atraviesan ni se mete uno dentro de ellos.
    if (dt > 0) {
      const back = forwardOf(st.yaw);
      this.npcCollider.resolve(sim.collision, body, this.npcObstacles(), { x: -back.x, z: -back.z }, { x: bx, z: bz }, ilen > 0, dt);
    }
    let moved = 0;
    if (dt > 0) {
      const ax = (body.pos.x - bx) / dt;
      const az = (body.pos.z - bz) / dt;
      moved = Math.hypot(body.pos.x - bx, body.pos.z - bz);
      // Contra una pared la velocidad se queda en lo que realmente se avanza (desliza sin pegarse).
      if (Math.hypot(ax, az) < Math.hypot(this.vel.x, this.vel.z) - 0.05) {
        this.vel.x = ax;
        this.vel.z = az;
      }
      this.speed = Math.hypot(ax, az);
    } else this.speed = 0;
    this.onGround = body.onGround;
    if (!body.onGround) this.fallSpeed = Math.max(this.fallSpeed, -Math.min(body.vy, vyBefore));

    // --- Red de seguridad ---
    const p = body.pos;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) || p.y < FALL_LIMIT_Y || sim.collision.surfaces(p.x, p.z).length === 0) {
      const s = sim.collision.safeSpawn();
      body.pos = { ...s };
      body.vy = 0;
      body.onGround = true;
      this.vel.x = 0;
      this.vel.z = 0;
      this.fallSpeed = 0;
      ctx.interaction.toast('Vuelves a la cubierta', 'info');
    }

    // --- Aterrizaje y pasos ---
    if (body.onGround && !this.wasOnGround) {
      const v = this.fallSpeed;
      if (v > 2.2) {
        this.landVel = Math.min(1, v / 9);
        ctx.bus.emit('sfx', { name: v > 6 ? 'aterrizar_fuerte' : 'aterrizar', x: p.x, y: p.y, z: p.z });
      }
      this.fallSpeed = 0;
    }
    this.wasOnGround = body.onGround;
    if (body.onGround && moved > 0) {
      const stride = this.running ? STRIDE_RUN : STRIDE_WALK;
      this.bobPhase += (moved / stride) * Math.PI;
      const idx = Math.floor(this.bobPhase / Math.PI);
      if (idx !== this.stepIndex) {
        this.stepIndex = idx;
        if (this.speed > 0.6) ctx.bus.emit('sfx', { name: 'paso', x: p.x, y: p.y, z: p.z });
      }
    }
    const bobTarget = body.onGround ? Math.min(1.4, this.speed / WALK_SPEED) : 0;
    this.bobAmount += (bobTarget - this.bobAmount) * damp(10, dt);
    // Golpe de aterrizaje: muelle amortiguado.
    this.landKick += (this.landVel - this.landKick) * damp(30, dt);
    this.landVel *= Math.exp(-dt * 9);

    st.pos.x = p.x;
    st.pos.y = p.y;
    st.pos.z = p.z;
    this.written = { ...st.pos };

    this.updateCamera(dt);
    this.updateAvatar(dt, ilen > 0);
  }

  /* ------------------------------------------------------------------ */
  /* Ratón                                                               */
  /* ------------------------------------------------------------------ */

  /**
   * Movimiento del ratón de este frame, o null si hay que descartarlo: sin control, en los
   * LOOK_GRACE_FRAMES frames tras recuperar el control o capturar el puntero (el navegador puede
   * mandar un salto igual a la posición del cursor), o si es absurdo / no finito.
   */
  lookDelta(canControl: boolean): { dx: number; dy: number } | null {
    const input = this.ctx.input;
    const locked = !!(input as { locked?: boolean }).locked;
    if ((canControl && !this.hadControl) || (locked && !this.wasLocked)) this.lookGrace = LOOK_GRACE_FRAMES;
    this.hadControl = canControl;
    this.wasLocked = locked;
    if (!canControl) return null;
    const md = input.mouseDelta();
    if (this.lookGrace > 0) {
      this.lookGrace--;
      return null;
    }
    if (!Number.isFinite(md.dx) || !Number.isFinite(md.dy)) return null;
    if (Math.abs(md.dx) > MAX_LOOK_DELTA || Math.abs(md.dy) > MAX_LOOK_DELTA) return null;
    return md;
  }

  private applyLook(canControl: boolean): void {
    const ctx = this.ctx;
    const st = ctx.sim.state.player;
    // Una orientación corrupta (NaN) nunca debe propagarse a la cámara ni a las herramientas.
    if (!Number.isFinite(st.yaw)) st.yaw = 0;
    if (!Number.isFinite(st.pitch)) st.pitch = 0;
    const md = this.lookDelta(canControl);
    if (!md) return;
    const sens = ctx.settings.sensitivity / 1000;
    st.yaw = wrapAngle(st.yaw - md.dx * sens);
    st.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, st.pitch - md.dy * sens * (ctx.settings.invertY ? -1 : 1)));
  }

  /* ------------------------------------------------------------------ */
  /* Habitantes                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Cuerpos de los habitantes presentes y despiertos, en la posición en que se ven (sentados en
   * su silla, por ejemplo) o, si aún no se han dibujado, en la de la simulación.
   */
  private npcObstacles(): Obstacle[] {
    const out = this.obstacles;
    out.length = 0;
    const view = this.ctx.npcView as { objectOf?: (id: string) => THREE.Object3D | null } | undefined;
    for (const n of this.ctx.sim.state.npcs) {
      if (n.awayUntil !== null || n.activity === 'away' || n.activity === 'sleeping') continue;
      const obj = view?.objectOf?.(n.id) ?? null;
      if (obj && !obj.visible) continue;
      const p = obj ? obj.position : n.pos;
      out.push({ x: p.x, y: p.y, z: p.z, r: NPC_RADIUS, h: 1.8 * (n.appearance?.height ?? 1) });
    }
    return out;
  }

  /** Cajas de los habitantes cercanos para el brazo de la cámara en tercera persona. */
  private npcCameraBoxes(): AABB[] {
    const st = this.ctx.sim.state.player;
    const out: AABB[] = [];
    for (const o of this.npcObstacles()) {
      if (Math.hypot(o.x - st.pos.x, o.z - st.pos.z) > ARM_LENGTH + 1.5 || Math.abs(o.y - st.pos.y) > 1.5) continue;
      out.push(boxAt(o.x, o.y, o.z, o.r, o.r, o.h));
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Cámara                                                              */
  /* ------------------------------------------------------------------ */

  private updateFov(dt: number): void {
    const want = this.ctx.settings.fov + (this.running && this.speed > 4 ? 5 : 0);
    this.fovCur += (want - this.fovCur) * damp(6, dt);
    if (Math.abs(this.camera.fov - this.fovCur) > 0.01) {
      this.camera.fov = this.fovCur;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateCamera(dt: number): void {
    const st = this.ctx.sim.state.player;
    this.updateFov(dt);
    const targetArm = this.perspective === 'third' ? ARM_LENGTH : 0;
    this.armFree += (targetArm - this.armFree) * damp(7, dt);
    if (Math.abs(targetArm - this.armFree) < 0.005) this.armFree = targetArm;
    const amt = this.bobAmount;
    const kick = this.landKick * 0.11;
    if (this.armFree < 0.02) {
      this.arm = 0;
      // Primera persona con cabeceo: más bajo en cada pisada, vaivén lateral alterno.
      const bobY = (Math.abs(Math.sin(this.bobPhase)) - 0.5) * 0.05 * amt;
      const side = Math.cos(this.bobPhase) * 0.022 * amt;
      const rx = Math.cos(st.yaw);
      const rz = -Math.sin(st.yaw);
      this.camera.position.set(st.pos.x + rx * side, st.pos.y + EYE_HEIGHT + bobY - kick, st.pos.z + rz * side);
      this.camera.rotation.set(st.pitch - kick * 0.25, st.yaw, Math.cos(this.bobPhase) * 0.005 * amt, 'YXZ');
      return;
    }
    const pitch = Math.max(THIRD_PITCH_MIN, Math.min(THIRD_PITCH_MAX, st.pitch));
    const res = computeArm({ layout: this.ctx.sim.layout, feet: st.pos, yaw: st.yaw, pitch, length: this.armFree, obstacles: this.npcCameraBoxes() });
    // Acorta al instante al chocar; se alarga despacio cuando se libera.
    if (res.length < this.arm) this.arm = res.length;
    else this.arm += (res.length - this.arm) * damp(4, dt);
    const t = res.length > 1e-6 ? this.arm / res.length : 0;
    const pos = {
      x: res.pivot.x + (res.pos.x - res.pivot.x) * t,
      y: res.pivot.y + (res.pos.y - res.pivot.y) * t,
      z: res.pivot.z + (res.pos.z - res.pivot.z) * t,
    };
    // Mezcla con la vista subjetiva durante la transición.
    const blend = Math.min(1, this.armFree / 0.6);
    const eyeY = st.pos.y + EYE_HEIGHT;
    const lim = verticalLimits(this.ctx.sim.layout, st.pos);
    this.camera.position.set(
      st.pos.x + (pos.x - st.pos.x) * blend,
      Math.min(lim.ceil, eyeY + (pos.y - eyeY) * blend) - kick * 0.5,
      st.pos.z + (pos.z - st.pos.z) * blend,
    );
    this.camera.rotation.set(pitch, st.yaw, 0, 'YXZ');
  }

  /* ------------------------------------------------------------------ */
  /* Avatar                                                              */
  /* ------------------------------------------------------------------ */

  private heldTool(): ToolKind | null {
    const st = this.ctx.sim.state.player;
    const s = st.inventory.slots[st.hotbar];
    return s ? (ITEMS[s.id]?.tool ?? null) : null;
  }

  private updateAvatar(dt: number, moving: boolean): void {
    const ctx = this.ctx;
    const st = ctx.sim.state.player;
    const action = ctx.interaction?.avatarAction ?? 'idle';
    // Mira hacia donde camina; parado o usando algo, hacia donde mira la cámara.
    let want = st.yaw;
    if (moving && this.speed > 0.5 && action === 'idle') want = Math.atan2(-this.vel.x, -this.vel.z);
    this.avatarYaw += wrapAngle(want - this.avatarYaw) * damp(12, dt);
    const shown = ctx.mode === 'build' || this.arm > 0.6;
    const override = ctx.interaction?.avatarTool;
    this.avatar.update(
      {
        x: st.pos.x,
        y: st.pos.y,
        z: st.pos.z,
        yaw: this.avatarYaw,
        speed: this.speed,
        onGround: this.onGround,
        sleeping: false,
        tool: override !== undefined ? override : this.heldTool(),
        action,
        clothing: st.clothing,
        bed: null,
      },
      dt,
      shown && st.alive,
    );
  }

  /* ------------------------------------------------------------------ */
  /* Sueño                                                               */
  /* ------------------------------------------------------------------ */

  private updateSleeping(dt: number, canControl: boolean): void {
    const ctx = this.ctx;
    const { sim, input } = ctx;
    const st = sim.state.player;
    const sl = st.sleeping!;
    if (canControl && (input.pressed('KeyE') || input.pressed('Space'))) {
      input.consume('KeyE');
      input.consume('Space');
      sim.wake();
      if (st.sleeping) {
        if (this.time - this.wakeHintAt > 2) {
          this.wakeHintAt = this.time;
          ctx.interaction.toast('Estás agotado: aún no puedes levantarte', 'warn');
        }
      } else {
        this.reset();
        this.updateCamera(dt);
        this.updateAvatar(dt, false);
        return;
      }
    }
    // Mirar alrededor tumbado (poco) o girar la cámara en tercera persona.
    this.applyLook(canControl);
    this.updateFov(dt);
    const bed = sl.moduleId !== null ? bedPose(sim.state.ship, sl.moduleId, sl.bed) : null;
    // Pies y orientación del cuerpo tumbado. En el suelo (desmayo), hacia un lado sin obstáculos.
    if (!bed && this.floorYaw === null) this.floorYaw = this.freeFloorYaw(st.yaw);
    const feet = bed ? { x: bed.x, y: bed.y, z: bed.z } : { x: st.pos.x, y: st.pos.y + 0.05, z: st.pos.z };
    // `bodyYaw`: la raíz mira hacia los pies; la cabeza queda detrás.
    const bodyYaw = bed ? bed.yaw : this.floorYaw! + Math.PI;
    const f = forwardOf(bodyYaw);
    const len = bed ? 1.5 : 1.45;
    // Cabeza: desde los pies hacia la cabecera.
    const head = { x: feet.x - f.x * len, y: feet.y + 0.24, z: feet.z - f.z * len };
    const breathe = Math.sin(this.time * 1.4) * 0.012;
    const targetArm = this.perspective === 'third' ? ARM_LENGTH : 0;
    this.armFree += (targetArm - this.armFree) * damp(5, dt);
    this.arm = this.armFree;
    if (this.armFree < 0.35) {
      // Tumbado boca arriba mirando hacia los pies y el techo.
      this.camera.position.set(head.x, head.y + breathe, head.z);
      this.camera.rotation.set(0.62 + breathe, bodyYaw, 0.06, 'YXZ');
    } else {
      // Tercera persona: vista desde arriba orbitando la cama.
      const cx = (feet.x + head.x) / 2;
      const cz = (feet.z + head.z) / 2;
      const lim = verticalLimits(sim.layout, { x: cx, y: feet.y - 0.3, z: cz });
      const back = lookDir(st.yaw, Math.max(-1.2, Math.min(-0.45, st.pitch)));
      const d = 2.6;
      _v.set(cx - back.x * d, Math.min(lim.ceil - 0.1, feet.y + 0.3 - back.y * d), cz - back.z * d);
      this.camera.position.copy(_v);
      // `lookAt` de three.js trabaja en mundo y la cámara es hija del barco: se orienta en local.
      this.lookAtLocal(cx, feet.y, cz);
    }
    this.avatar.update(
      {
        x: feet.x,
        y: feet.y,
        z: feet.z,
        // En el suelo, PlayerAvatar tumba el cuerpo hacia donde "mira" `yaw`.
        yaw: bed ? bed.yaw : this.floorYaw!,
        speed: 0,
        onGround: true,
        sleeping: true,
        tool: null,
        action: 'idle',
        clothing: st.clothing,
        bed: bed ? { x: bed.x, y: bed.y, z: bed.z, yaw: bed.yaw, blanket: bed.blanket } : null,
      },
      dt,
      this.armFree >= 0.35 || ctx.mode === 'build',
    );
    this.bobAmount = 0;
    this.speed = 0;
  }

  /** Dirección en la que cabe el cuerpo tumbado en el suelo (sin meter la cabeza en una pared). */
  private freeFloorYaw(prefer: number): number {
    const col = this.ctx.sim.collision;
    const p = this.ctx.sim.state.player.pos;
    for (let k = 0; k < 8; k++) {
      const yaw = prefer + (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4);
      const f = forwardOf(yaw);
      if ([0.5, 1.0, 1.5].every((d) => col.isFree(p.x + f.x * d, p.z + f.z * d, p.y, 0.18))) return yaw;
    }
    return prefer;
  }

  /** Orienta la cámara (hija de shipRoot) hacia un punto en coordenadas del barco. */
  private lookAtLocal(x: number, y: number, z: number): void {
    const p = this.camera.position;
    const dx = x - p.x;
    const dy = y - p.y;
    const dz = z - p.z;
    const yaw = Math.atan2(-dx, -dz);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  /** ¿Está el jugador en un interior (habitación o bodega)? */
  isIndoor(): boolean {
    const p = this.ctx.sim.state.player.pos;
    const c = cellAtPoint(this.ctx.sim.layout, p.x, p.y, p.z);
    return !!c && c.indoor;
  }
}

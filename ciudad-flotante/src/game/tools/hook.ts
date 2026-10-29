/**
 * [AGENTE game-player] GANCHO DE RESCATE.
 *
 * Fases: `windup` (el brazo toma impulso) → `flying` (el garfio vuela en parábola con la
 * cuerda desenrollándose y persigue al resto, que sigue derivando) → `pulling` (~1,2 s
 * arrastrando el resto hacia el casco, con estela de espuma) → `sim.collectDebris(id)` →
 * `retract` (el garfio vuelve a la mano). Sin objetivo, el garfio cae al agua y se recoge.
 *
 * El desplazamiento visual del resto arrastrado se aplica en `late()`, que se llama justo antes
 * de dibujar (después de que `DebrisView` haya colocado el resto en su posición de simulación).
 */
import * as THREE from 'three';
import { DEBRIS_NAMES, hullBounds } from '../../sim/debris';
import { HOOK_RANGE } from '../../sim/constants';
import type { PromptInfo } from '../types';
import { clamp01, easeInOutSine, easeOutCubic } from './aim';
import { finiteVec } from './effects';
import type { ToolEnv } from './env';
import type { DebrisTarget } from './targets';

export type HookPhase = 'idle' | 'windup' | 'flying' | 'pulling' | 'retract';

/** Duración del impulso antes de soltar el garfio (coincide con la animación 'throw'). */
const WINDUP = 0.31;
/** Tiempo de arrastre del resto hasta el casco. */
export const PULL_TIME = 1.2;
const RETRACT_TIME = 0.42;
const MISS_DRAG_TIME = 0.55;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

export class HookTool {
  phase: HookPhase = 'idle';
  private t = 0;
  private targetId: number | null = null;
  private targetName = '';
  private flightDur = 1;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly grap = new THREE.Vector3();
  /** Punto junto al casco hacia donde se arrastra el resto (coordenadas del océano). */
  private readonly hull = new THREE.Vector3();
  /** 0..1 cuánto se ha arrastrado el resto (para el desplazamiento visual). */
  private pullU = 0;
  /** Al fallar la recogida, el resto vuelve a su sitio suavemente. */
  private release = false;
  private splashTimer = 0;
  private tugTimer = 0;
  private retractFrom = new THREE.Vector3();
  private group: THREE.Object3D | null = null;
  /** Altura del resto sobre el agua según DebrisView (cabeceo, hundimiento): se conserva al arrastrarlo. */
  private floatY = 0;

  constructor(private readonly env: ToolEnv) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** Resto que se está arrastrando o persiguiendo (para no resaltar otro). */
  get targetDebris(): number | null {
    return this.targetId;
  }

  /** Pose del avatar en tercera persona. */
  get avatarAction(): string {
    if (this.phase === 'windup' || this.phase === 'flying') return 'throw';
    if (this.phase === 'pulling' || this.phase === 'retract') return 'reel';
    return 'idle';
  }

  get prompt(): PromptInfo | null {
    switch (this.phase) {
      case 'windup':
      case 'flying':
        return { key: '', text: this.targetId !== null ? `Lanzando el gancho a: ${this.targetName}` : 'Lanzando el gancho…' };
      case 'pulling':
        return { key: '', text: `Recogiendo: ${this.targetName}`, sub: 'Tirando del cabo…', progress: clamp01(this.t / PULL_TIME) };
      case 'retract':
        return { key: '', text: 'Recogiendo el cabo…' };
      default:
        return null;
    }
  }

  /** Lanza el garfio a un resto concreto. */
  throwAt(target: DebrisTarget): void {
    if (this.busy) return;
    this.targetId = target.debris.id;
    this.targetName = DEBRIS_NAMES[target.debris.kind] ?? 'Resto';
    this.begin();
    this.to.set(target.point.x, target.point.y, target.point.z);
    this.flightDur = 0.32 + target.dist / 26;
  }

  /** Lanza el garfio al agua sin objetivo (punto en coordenadas de mundo). */
  throwMiss(point: THREE.Vector3): void {
    if (this.busy) return;
    this.targetId = null;
    this.targetName = '';
    this.begin();
    const p = this.env.ctx.sim.state.player.pos;
    if (finiteVec(point)) this.to.copy(point);
    else {
      // Punto inválido (rayo degenerado): al agua, por el costado del jugador.
      const b = hullBounds(this.env.ctx.sim);
      const z = (Math.sign(p.z) || 1) * (b.halfW + 6);
      this.to.set(p.x, this.env.waterHeight(p.x, z), z);
    }
    const d = Math.hypot(this.to.x - p.x, this.to.z - p.z);
    this.flightDur = 0.32 + (Number.isFinite(d) ? d : 10) / 26;
  }

  private begin(): void {
    this.phase = 'windup';
    this.t = 0;
    this.pullU = 0;
    this.release = false;
    this.group = null;
    this.env.vm.play('throw');
    this.env.toolUsed('gancho', 'start');
    this.env.sfx('gancho_impulso', this.env.ctx.sim.state.player.pos);
  }

  /** Suelta la presa y recoge el cabo (cambio de herramienta, dormir, resto perdido…). */
  cancel(message?: string): void {
    if (!this.busy) return;
    if (message) this.env.toast(message, 'info');
    if (this.phase === 'windup') {
      this.finish();
      return;
    }
    if (this.phase !== 'retract') this.startRetract(true);
  }

  /** Corte inmediato sin animación (nueva partida). */
  abort(): void {
    this.finish();
    this.pullU = 0;
  }

  private startRetract(release: boolean): void {
    this.phase = 'retract';
    this.t = 0;
    this.release = release;
    this.retractFrom.copy(this.grap);
    this.env.vm.play('pull');
  }

  private finish(): void {
    this.phase = 'idle';
    this.t = 0;
    this.targetId = null;
    this.group = null;
    this.release = false;
    const fx = this.env.fx;
    fx.grapnel.visible = false;
    fx.hookRope.visible = false;
    this.env.vm.setPart('garfio', true);
    this.env.vm.stop();
  }

  /** Posición de simulación del resto (agua) o null si ya no existe. */
  private debrisPoint(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.targetId === null) return null;
    const d = this.env.ctx.sim.state.debris.find((x) => x.id === this.targetId);
    if (!d) return null;
    return out.set(d.pos.x, this.env.waterHeight(d.pos.x, d.pos.z) + 0.15, d.pos.z);
  }

  /** Punto del casco más cercano al resto, por el costado del jugador. */
  private computeHullPoint(): void {
    const sim = this.env.ctx.sim;
    const b = hullBounds(sim);
    const p = sim.state.player.pos;
    const d = this.to;
    let x: number;
    let z: number;
    if (Math.abs(d.z) >= b.halfW - 0.5) {
      x = Math.max(b.sternX + 1, Math.min(b.bowX - 1, p.x + (d.x - p.x) * 0.25));
      z = Math.sign(d.z) * (b.halfW + 1.1);
    } else if (d.x > 0) {
      x = b.bowX + 1.6;
      z = Math.max(-b.halfW + 0.6, Math.min(b.halfW - 0.6, p.z));
    } else {
      x = b.sternX - 1.6;
      z = Math.max(-b.halfW + 0.6, Math.min(b.halfW - 0.6, p.z));
    }
    this.hull.set(x, this.env.waterHeight(x, z) + 0.1, z);
  }

  update(dt: number): void {
    if (!this.busy) return;
    this.t += dt;
    const fx = this.env.fx;
    switch (this.phase) {
      case 'windup': {
        if (this.t >= WINDUP) {
          this.env.handWorld('garfio', this.from);
          if (!finiteVec(this.from)) {
            // Sin un punto de partida válido no se lanza nada (nunca NaN en la cuerda).
            this.finish();
            break;
          }
          this.grap.copy(this.from);
          this.env.vm.setPart('garfio', false);
          fx.grapnel.visible = true;
          fx.hookRope.visible = true;
          this.phase = 'flying';
          this.t = 0;
          this.env.sfx('gancho', this.env.ctx.sim.state.player.pos);
        }
        break;
      }
      case 'flying': {
        // El objetivo sigue derivando: el garfio lo persigue.
        if (this.targetId !== null) {
          const ok = this.debrisPoint(_a);
          if (ok && finiteVec(ok)) this.to.copy(ok);
          else if (ok) {
            // Posición del resto corrupta: se suelta como si se hubiera perdido.
            this.targetId = null;
          }
          else {
            // Se perdió el resto (lo recogió otro o se alejó): cae al agua.
            this.targetId = null;
            this.env.toast('El resto ya no está: recoges el gancho', 'info');
          }
        }
        const u = clamp01(this.t / this.flightDur);
        const dist = this.from.distanceTo(this.to);
        _c.copy(this.from).add(this.to).multiplyScalar(0.5);
        _c.y = Math.max(this.from.y, this.to.y) + 1.2 + dist * 0.16;
        // Bézier cuadrática.
        const iu = 1 - u;
        this.grap.set(
          iu * iu * this.from.x + 2 * iu * u * _c.x + u * u * this.to.x,
          iu * iu * this.from.y + 2 * iu * u * _c.y + u * u * this.to.y,
          iu * iu * this.from.z + 2 * iu * u * _c.z + u * u * this.to.z,
        );
        if (u >= 1) this.land();
        break;
      }
      case 'pulling': {
        const pt = this.debrisPoint(_a);
        if (!pt) {
          this.startRetract(true);
          this.env.toast('Se ha soltado: el resto ya no está', 'info');
          break;
        }
        this.pullU = easeInOutSine(clamp01(this.t / PULL_TIME));
        this.tugTimer -= dt;
        if (this.tugTimer <= 0) {
          this.tugTimer = 0.42;
          this.env.sfx('tirar_cabo', this.env.ctx.sim.state.player.pos);
        }
        this.splashTimer -= dt;
        if (this.splashTimer <= 0) {
          this.splashTimer = 0.18;
          _b.copy(pt).lerp(this.hull, this.pullU);
          _b.y = this.env.waterHeight(_b.x, _b.z) + 0.05;
          fx.particles.burst(_b, { count: 5, color: '#e8f4f2', color2: '#9ed8e6', speed: 1.2, up: 1.6, life: 0.5, size: 0.07, gravity: 7, floor: _b.y - 0.1 });
        }
        if (this.t >= PULL_TIME) this.collect();
        break;
      }
      case 'retract': {
        const u = clamp01(this.t / (this.targetId === null && this.release ? MISS_DRAG_TIME : RETRACT_TIME));
        if (this.release) this.pullU = Math.max(0, this.pullU - dt / 0.4);
        this.env.handWorld('garfio', _a);
        if (!finiteVec(_a)) {
          this.finish();
          break;
        }
        const e = easeOutCubic(u);
        this.grap.lerpVectors(this.retractFrom, _a, e);
        // Sale del agua con un pequeño arco.
        this.grap.y += Math.sin(u * Math.PI) * 0.6;
        if (u >= 1) this.finish();
        break;
      }
      default:
        break;
    }
  }

  private land(): void {
    const fx = this.env.fx;
    const w = this.to;
    _a.set(w.x, this.env.waterHeight(w.x, w.z) + 0.02, w.z);
    fx.particles.burst(_a, { count: 18, color: '#e8f4f2', color2: '#9ed8e6', speed: 1.8, up: 3.6, life: 0.7, size: 0.08, gravity: 9, floor: _a.y - 0.2 });
    fx.ripples.spawn(_a, 1.6, 1.1);
    this.env.sfx('chapoteo', { x: w.x, y: _a.y, z: w.z });
    if (this.targetId !== null) {
      this.phase = 'pulling';
      this.t = 0;
      this.tugTimer = 0;
      this.splashTimer = 0;
      this.computeHullPoint();
      this.env.vm.play('pull');
      this.env.toolUsed('gancho', 'hit');
    } else {
      this.startRetract(true);
    }
  }

  private collect(): void {
    const id = this.targetId;
    if (id === null) return;
    const sim = this.env.ctx.sim;
    const res = sim.collectDebris(id);
    if (res.ok) {
      this.env.toast(res.msg ?? 'Recuperas el resto', 'good');
      this.env.toolUsed('gancho', 'success');
      this.env.sfx('recoger', sim.state.player.pos);
      this.pullU = 0;
      this.targetId = null;
      this.startRetract(false);
      this.retractFrom.copy(this.hull);
      this.retractFrom.y += 1.2;
    } else {
      this.env.toast(res.msg ?? 'No se ha podido recoger', 'warn');
      this.env.toolUsed('gancho', 'fail');
      this.startRetract(true);
    }
  }

  /** Justo antes de dibujar: arrastre visual del resto y cuerda con las transformaciones finales. */
  late(dtRender: number): void {
    if (!this.busy) return;
    const fx = this.env.fx;
    // Resto enganchado: desplazarlo hacia el casco. Se calcula siempre desde la posición de
    // simulación, así da igual cuántas veces se dibuje la escena (o que el juego esté en pausa).
    if ((this.phase === 'pulling' || (this.phase === 'retract' && this.release)) && this.targetId !== null && this.pullU > 0) {
      const g = this.findGroup();
      const d = this.env.ctx.sim.state.debris.find((x) => x.id === this.targetId);
      if (g && d) {
        // Recién colocado por DebrisView en su sitio: se toma su altura sobre el agua (oleaje, cabeceo).
        if (Math.abs(g.position.x - d.pos.x) < 1e-6 && Math.abs(g.position.z - d.pos.z) < 1e-6) this.floatY = g.position.y - this.env.waterHeight(d.pos.x, d.pos.z);
        _b.set(d.pos.x, 0, d.pos.z).lerp(_a.set(this.hull.x, 0, this.hull.z), this.pullU);
        // Lo van izando un poco al final.
        _b.y = this.env.waterHeight(_b.x, _b.z) + this.floatY + this.pullU * this.pullU * 0.5;
        g.position.copy(_b);
        g.updateMatrixWorld(true);
        g.getWorldPosition(this.grap);
        this.grap.y += 0.35;
      }
    }
    if (this.phase === 'windup') return;
    this.env.handWorld('mano', _c);
    if (!finiteVec(this.grap) || !finiteVec(_c)) {
      // Nunca se dibuja un garfio o una cuerda con coordenadas no finitas.
      fx.grapnel.visible = false;
      fx.hookRope.visible = false;
      return;
    }
    fx.grapnel.visible = true;
    fx.hookRope.visible = true;
    fx.grapnel.position.copy(this.grap);
    // El garfio mira en la dirección del vuelo / del cabo.
    fx.grapnel.lookAt(_c);
    fx.grapnel.rotateX(Math.PI / 2);
    let sag = 0.25;
    let wobble = 0;
    if (this.phase === 'flying') sag = 0.15 + 0.5 * clamp01(this.t / this.flightDur);
    else if (this.phase === 'pulling') {
      sag = 0.08;
      wobble = 0.04;
    } else if (this.phase === 'retract') sag = 0.35 * (1 - clamp01(this.t / RETRACT_TIME));
    fx.hookRope.set(_c, this.grap, sag, wobble, dtRender);
  }

  private findGroup(): THREE.Object3D | null {
    const id = this.targetId;
    if (id === null) return null;
    if (this.group && this.group.parent && (this.group.userData as { debrisId?: number }).debrisId === id) return this.group;
    this.group = null;
    for (const c of this.env.ctx.renderer.worldRoot.children) {
      if ((c.userData as { debrisId?: number }).debrisId === id) {
        this.group = c;
        break;
      }
    }
    return this.group;
  }
}

/** Alcance máximo para mostrar un resto como objetivo (los más lejanos salen como "demasiado lejos"). */
export const HOOK_SCAN_RANGE = HOOK_RANGE + 14;

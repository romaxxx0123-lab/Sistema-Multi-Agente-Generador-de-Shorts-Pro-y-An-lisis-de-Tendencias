/**
 * [AGENTE game-player] CAÑA DE PESCAR.
 *
 * Fases: `casting` (impulso) → `flying` (el corcho vuela al agua, a unos metros de la borda)
 * → `waiting` (`sim.fishBiteDelay()` segundos, con algún mordisqueo de aviso) → `bite` (el
 * corcho se hunde: hay BITE_WINDOW s para hacer clic → `sim.catchFish()`) → `reeling`
 * (el pez sale del agua hacia la mano) → `retract` (el corcho vuelve a la punta).
 * Si no se hace clic a tiempo: "Se ha escapado" y se sigue esperando otra picada.
 */
import * as THREE from 'three';
import { isFishBankActive } from '../../sim/events';
import type { PromptInfo } from '../types';
import { clamp01, easeOutCubic, type V3 } from './aim';
import type { ToolEnv } from './env';
import type { RailInfo } from './targets';

export type FishPhase = 'idle' | 'casting' | 'flying' | 'waiting' | 'bite' | 'reeling' | 'retract';

/** Tiempo para reaccionar cuando pica (s). */
export const BITE_WINDOW = 1.4;
const CAST_RELEASE = 0.39;
const FLIGHT_TIME = 0.62;
const RETRACT_TIME = 0.45;
const FISH_FLIGHT = 0.6;

const _a = new THREE.Vector3();
const _c = new THREE.Vector3();

export class FishingTool {
  phase: FishPhase = 'idle';
  private t = 0;
  /** Punto de caída del corcho (coordenadas del océano: x, z). */
  private tx = 0;
  private tz = 0;
  private readonly from = new THREE.Vector3();
  private readonly bob = new THREE.Vector3();
  private readonly retractFrom = new THREE.Vector3();
  private biteAt = 0;
  private nibbles: number[] = [];
  private nibble = 0;
  private windowLeft = 0;
  private fishFlying = 0;

  constructor(private readonly env: ToolEnv) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  get avatarAction(): string {
    if (this.phase === 'casting' || this.phase === 'flying') return 'cast';
    if (this.phase === 'idle') return 'idle';
    return 'reel';
  }

  /** Segundos que quedan para que pique (pruebas y depuración). */
  get secondsToBite(): number {
    return this.phase === 'waiting' ? Math.max(0, this.biteAt - this.t) : 0;
  }

  get prompt(): PromptInfo | null {
    switch (this.phase) {
      case 'casting':
      case 'flying':
        return { key: '', text: 'Lanzando la caña…' };
      case 'waiting':
        return { key: 'Clic', text: 'Recoger el sedal', sub: isFishBankActive(this.env.ctx.sim) ? 'Esperando a que pique… (hay un banco de peces)' : 'Esperando a que pique…' };
      case 'bite':
        return { key: 'Clic', text: '¡Ha picado! Recoge ya', progress: clamp01(this.windowLeft / BITE_WINDOW) };
      case 'reeling':
      case 'retract':
        return { key: '', text: 'Recogiendo el sedal…' };
      default:
        return null;
    }
  }

  /** Lanza el corcho hacia el agua frente a la borda. `look` = dirección de la mirada. */
  cast(rail: RailInfo, look: V3): void {
    if (this.busy) return;
    // Distancia al agua: algo más allá del costado; desplazamiento lateral según la mirada.
    const out = 3.2 + Math.random() * 2.6;
    const tx = -rail.nz;
    const tz = rail.nx;
    const hl = Math.hypot(look.x, look.z) || 1;
    const lateral = Math.max(-4, Math.min(4, ((look.x * tx + look.z * tz) / hl) * 7));
    this.tx = rail.edgeX + rail.nx * out + tx * lateral;
    this.tz = rail.edgeZ + rail.nz * out + tz * lateral;
    this.phase = 'casting';
    this.t = 0;
    this.env.vm.play('cast');
    this.env.toolUsed('cana', 'start');
  }

  /** Clic con la caña lanzada: recoger (si ha picado, captura). */
  click(): void {
    if (this.phase === 'bite') this.catchNow();
    else if (this.phase === 'waiting') this.startRetract();
  }

  cancel(message?: string): void {
    if (!this.busy) return;
    if (message) this.env.toast(message, 'info');
    if (this.phase === 'casting') {
      this.finish();
      return;
    }
    if (this.phase !== 'retract') this.startRetract();
  }

  abort(): void {
    this.finish();
  }

  private startRetract(): void {
    this.phase = 'retract';
    this.t = 0;
    this.retractFrom.copy(this.bob);
    this.env.fx.particles.burst(this.bob, { count: 6, color: '#e8f4f2', speed: 0.8, up: 1.4, life: 0.4, size: 0.05, gravity: 7, floor: this.bob.y - 0.1 });
  }

  private finish(): void {
    this.phase = 'idle';
    this.t = 0;
    const fx = this.env.fx;
    fx.bobber.visible = false;
    fx.fishLine.visible = false;
    fx.fish.visible = false;
    this.fishFlying = 0;
    this.env.vm.setPart('colgante', true);
    this.env.vm.stop();
  }

  private startWaiting(): void {
    this.phase = 'waiting';
    this.t = 0;
    this.biteAt = Math.max(1.5, this.env.ctx.sim.fishBiteDelay());
    const n = 1 + Math.floor(Math.random() * 3);
    this.nibbles = [];
    for (let i = 0; i < n; i++) this.nibbles.push(this.biteAt * (0.25 + Math.random() * 0.65));
    this.nibbles.sort((a, b) => a - b);
    this.env.vm.play('wait');
  }

  private catchNow(): void {
    const sim = this.env.ctx.sim;
    const before = sim.state.player.stats.fishCaught;
    const res = sim.catchFish();
    if (res.ok) {
      this.env.toast(res.msg ?? '¡Captura!', 'good');
      this.env.toolUsed('cana', 'success');
      this.env.sfx('carrete', sim.state.player.pos);
      // El pez sale del agua hacia la mano (si lo que ha picado es un pez).
      if (sim.state.player.stats.fishCaught > before) {
        this.fishFlying = 1e-6;
        this.env.fx.fish.visible = true;
      }
      this.env.fx.particles.burst(this.bob, { count: 16, color: '#e8f4f2', color2: '#9ed8e6', speed: 1.6, up: 3.2, life: 0.6, size: 0.07, gravity: 9, floor: this.bob.y - 0.2 });
      this.env.fx.ripples.spawn(this.bob, 1.2, 0.8);
    } else {
      this.env.toast(res.msg ?? 'No has pescado nada', 'warn');
      this.env.toolUsed('cana', 'fail');
    }
    this.phase = 'reeling';
    this.t = 0;
    this.retractFrom.copy(this.bob);
    this.env.vm.play('reel');
  }

  update(dt: number): void {
    if (!this.busy) return;
    this.t += dt;
    const fx = this.env.fx;
    const water = (x: number, z: number) => this.env.waterHeight(x, z);
    switch (this.phase) {
      case 'casting':
        if (this.t >= CAST_RELEASE) {
          this.env.handWorld('punta', this.from);
          this.bob.copy(this.from);
          this.env.vm.setPart('colgante', false);
          fx.bobber.visible = true;
          fx.fishLine.visible = true;
          this.phase = 'flying';
          this.t = 0;
          this.env.sfx('cana', this.env.ctx.sim.state.player.pos);
        }
        break;
      case 'flying': {
        const u = clamp01(this.t / FLIGHT_TIME);
        const wy = water(this.tx, this.tz);
        _c.set((this.from.x + this.tx) / 2, Math.max(this.from.y, wy) + 1.8, (this.from.z + this.tz) / 2);
        const iu = 1 - u;
        this.bob.set(
          iu * iu * this.from.x + 2 * iu * u * _c.x + u * u * this.tx,
          iu * iu * this.from.y + 2 * iu * u * _c.y + u * u * wy,
          iu * iu * this.from.z + 2 * iu * u * _c.z + u * u * this.tz,
        );
        if (u >= 1) {
          _a.set(this.tx, wy, this.tz);
          fx.ripples.spawn(_a, 0.9, 0.9);
          fx.particles.burst(_a, { count: 8, color: '#e8f4f2', speed: 1, up: 2, life: 0.5, size: 0.05, gravity: 8, floor: wy - 0.1 });
          this.env.sfx('chapoteo_corcho', { x: this.tx, y: wy, z: this.tz });
          this.startWaiting();
        }
        break;
      }
      case 'waiting': {
        // Mordisqueos: el corcho tiembla un instante.
        if (this.nibbles.length && this.t >= this.nibbles[0]!) {
          this.nibbles.shift();
          this.nibble = 0.35;
          fx.ripples.spawn(this.bob, 0.45, 0.6);
          this.env.vm.kick(0.25);
        }
        this.nibble = Math.max(0, this.nibble - dt);
        const dip = this.nibble > 0 ? Math.sin(this.nibble * 30) * 0.05 : 0;
        this.floatAt(this.tx, this.tz, dip);
        if (this.t >= this.biteAt) {
          this.phase = 'bite';
          this.t = 0;
          this.windowLeft = BITE_WINDOW;
          this.env.vm.kick(1);
          fx.ripples.spawn(this.bob, 1.1, 0.8);
          fx.particles.burst(this.bob, { count: 10, color: '#e8f4f2', speed: 1.2, up: 2.2, life: 0.5, size: 0.06, gravity: 8, floor: this.bob.y - 0.2 });
          this.env.sfx('picada', { x: this.tx, y: this.bob.y, z: this.tz });
          this.env.toolUsed('cana', 'hit');
        }
        break;
      }
      case 'bite': {
        this.windowLeft -= dt;
        // El corcho se hunde y tira hacia los lados.
        const sink = -0.22 - Math.abs(Math.sin(this.t * 13)) * 0.08;
        this.floatAt(this.tx + Math.sin(this.t * 9) * 0.12, this.tz + Math.cos(this.t * 7) * 0.12, sink);
        if (this.t % 0.35 < dt) fx.ripples.spawn(this.bob, 0.7, 0.5);
        if (this.windowLeft <= 0) {
          this.env.toast('Se ha escapado', 'info');
          this.env.toolUsed('cana', 'fail');
          this.env.sfx('escapado', { x: this.tx, y: this.bob.y, z: this.tz });
          // El corcho vuelve a flotar: otra oportunidad.
          this.startWaiting();
        }
        break;
      }
      case 'reeling':
      case 'retract': {
        const dur = this.phase === 'reeling' ? FISH_FLIGHT : RETRACT_TIME;
        const u = clamp01(this.t / dur);
        this.env.handWorld('punta', _a);
        _a.y -= 0.25;
        this.bob.lerpVectors(this.retractFrom, _a, easeOutCubic(u));
        this.bob.y += Math.sin(u * Math.PI) * 0.9;
        if (u >= 1) this.finish();
        break;
      }
      default:
        break;
    }
    // Pez capturado: cuelga del anzuelo, bajo el corcho, coleteando mientras sale del agua.
    if (this.fishFlying > 0) {
      this.fishFlying += dt;
      const u = clamp01(this.fishFlying / FISH_FLIGHT);
      fx.fish.position.set(this.bob.x, this.bob.y - 0.42, this.bob.z);
      fx.fish.rotation.set(Math.sin(this.fishFlying * 28) * 0.6, this.fishFlying * 3, Math.PI / 2 + Math.sin(this.fishFlying * 19) * 0.35);
      fx.fish.scale.setScalar(0.6 + 0.4 * Math.min(1, u * 3));
      if (u >= 1) {
        this.fishFlying = 0;
        fx.fish.visible = false;
      }
    }
  }

  /** Corcho flotando en (x, z) con oleaje y un desplazamiento vertical extra. */
  private floatAt(x: number, z: number, dy: number): void {
    const wy = this.env.waterHeight(x, z);
    this.bob.set(x, wy + 0.02 + Math.sin(this.t * 2.3) * 0.015 + dy, z);
  }

  /** Antes de dibujar: corcho y sedal con las transformaciones finales de la caña. */
  late(dtRender: number): void {
    if (!this.busy || this.phase === 'casting') return;
    const fx = this.env.fx;
    fx.bobber.position.copy(this.bob);
    fx.bobber.rotation.set(this.phase === 'bite' ? Math.sin(this.t * 17) * 0.4 : 0, 0, this.phase === 'bite' ? Math.cos(this.t * 13) * 0.4 : 0);
    this.env.handWorld('punta', _a);
    let sag = 0.35;
    let wobble = 0;
    if (this.phase === 'flying') sag = 0.12;
    else if (this.phase === 'bite') {
      sag = 0.02;
      wobble = 0.03;
    } else if (this.phase === 'reeling' || this.phase === 'retract') sag = 0.1;
    fx.fishLine.set(_a, this.bob, sag, wobble, dtRender);
  }

  /** ¿Se ha alejado el jugador de la borda? (se recoge el sedal). La regla ya tiene 0,5 m de margen. */
  static tooFar(rail: RailInfo): boolean {
    return !rail.posOk;
  }
}

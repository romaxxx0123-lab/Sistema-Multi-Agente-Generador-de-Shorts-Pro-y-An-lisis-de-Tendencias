/**
 * [AGENTE game-player] INTERACCIÓN CON EL MUNDO.
 *
 * Cada frame:
 *  1. Elige objetivos: el mejor para la tecla E (muebles, habitantes, cajas, obras y la
 *     ampliación del casco; ver `tools/targets.ts`), el módulo a reparar, el fuego al alcance del
 *     cubo, el resto flotante cerca del rayo de la cámara (gancho) y la borda (caña y cubo).
 *  2. Procesa la entrada:
 *     - E: abre el panel (estación, almacén, huerto, agua, energía, timón, habitante, caja) o se
 *       acuesta; mantener E (o el clic con el martillo) en una obra ayuda a construir.
 *       En los usos frecuentes la tecla es física: pulsar E bebe del depósito, cosecha o limpia
 *       un bancal y coge todo lo de una caja (si cabe); mantener E abre el panel.
 *     - R en el depósito: llena una botella (si no hay que repararlo).
 *     - Clic: usa la herramienta de la barra rápida (gancho, caña, cubo, cubo con agua,
 *       martillo y llave en reparaciones).
 *     - R: repara el módulo dañado o averiado al que se apunta (con la herramienta adecuada).
 *     - Clic derecho o F: usa el consumible seleccionado (comer, beber, curarse, leer, vestirse).
 *  3. Publica el aviso (`ui.setPrompt`), el resaltado (`ctx.highlight`) y la pose del avatar,
 *     y anima el modelo en mano.
 *
 * Los comandos fallidos se muestran con `ui.toast(msg, 'warn')`.
 */
import * as THREE from 'three';
import type { NotifyKind } from '../core/EventBus';
import { ITEMS, type ToolKind } from '../data/items';
import { moduleDef } from '../data/modules';
import { DEBRIS_RADIUS } from '../render/ship/debrisModels';
import { HOOK_RANGE, HOTBAR_SLOTS, INTERACT_RANGE, TIME_SCALE, WATERLINE_Y } from '../sim/constants';
import { DEBRIS_NAMES, hullBounds, spawnDebris } from '../sim/debris';
import { distanceToModule, EXTINGUISH_RANGE, moduleLabel } from '../sim/events';
import { findModule } from '../sim/helpers';
import { addItem, countItem } from '../sim/inventory';
import { levelOfY } from '../sim/ship';
import type { DebrisKind, ItemId } from '../sim/types';
import type { GameContext } from './context';
import { registerDebug } from './debug';
import type { HighlightTarget, PromptInfo } from './types';
import { lookDir, yawPitchTo } from './tools/aim';
import { ToolEffects } from './tools/effects';
import type { ToolEnv } from './tools/env';
import { FishingTool } from './tools/fishing';
import { HOOK_SCAN_RANGE, HookTool } from './tools/hook';
import { finiteVec } from './tools/effects';
import { cratePrompt, crateFits, crateQuick, holdPrompt, npcPrompt, propAction, propPrompt, propQuick, sitePrompt, type QuickAction } from './tools/prompts';
import {
  canHookFrom,
  railFacing,
  REPAIR_RANGE,
  scanDebris,
  scanFire,
  scanFocus,
  scanRepair,
  type Aim,
  type DebrisTarget,
  type FireTarget,
  type Focus,
  type RailInfo,
  type RepairTarget,
} from './tools/targets';
import { ViewModel } from './tools/viewmodel';

/** Acción con duración (reparar, llenar o volcar el cubo, comer…). */
interface TimedAction {
  kind: 'repair' | 'fill' | 'pour' | 'eat';
  t: number;
  dur: number;
  /** Objeto que se ve en la mano mientras dura. */
  show: ItemId | null;
  /** Pose y herramienta del avatar. */
  avatar: string;
  avatarTool: ToolKind | null;
  prompt: PromptInfo | null;
  events: { t: number; fn: () => void; done: boolean }[];
  /** Si devuelve un motivo, la acción se interrumpe. */
  check?: () => string | null;
  onEnd?: () => void;
}

/** Duración de una reparación (s). */
export const REPAIR_TIME = 1.25;
/** Manteniendo E este tiempo (s) se abre el panel en vez de hacer la acción directa. */
export const HOLD_PANEL = 0.45;
/** El anillo de «Mantén E» aparece a partir de aquí (antes es una pulsación normal). */
const HOLD_HINT = 0.12;

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Interaction implements ToolEnv {
  readonly fx: ToolEffects;
  private _vm: ViewModel | null = null;
  private readonly hook: HookTool;
  private readonly fishing: FishingTool;
  private timed: TimedAction | null = null;
  /** Obra en la que se está ayudando con el martillo (-1 = ampliación del casco). */
  private building: { id: number; hits: number } | null = null;
  /** E pulsada sobre un objetivo con acción directa: al soltar se hace; si se mantiene, panel. */
  private eHold: { focus: Focus; quick: QuickAction; t: number } | null = null;
  /** La entrada estaba activa el frame anterior (para no usar un clic de recuperar el control). */
  private wasEnabled = false;

  /** Objetivos del último frame (lectura para depuración y pruebas). */
  focus: Focus | null = null;
  repairTarget: RepairTarget | null = null;
  fireTarget: FireTarget | null = null;
  debrisTarget: DebrisTarget | null = null;
  rail: RailInfo | null = null;
  /** Último aviso publicado. */
  prompt: PromptInfo | null = null;
  private promptKey = '';
  private lastDt = 0;
  private toastAt = new Map<string, number>();
  private clock = 0;
  /** Últimos avisos emergentes (depuración: `__game.cmd.jugador().toasts`). */
  readonly recentToasts: string[] = [];

  constructor(readonly ctx: GameContext) {
    this.fx = new ToolEffects(ctx.renderer.scene);
    this.hook = new HookTool(this);
    this.fishing = new FishingTool(this);
    // Game llama a lateUpdate() justo antes de dibujar (antes se enganchaba a scene.onBeforeRender).
    this.registerDebugCommands();
    // Al morir no se vuelve a actualizar la interacción: soltar herramientas y ocultar la mano.
    ctx.bus.on('playerDied', () => {
      this.cancelAll();
      this.hideViewModel();
    });
  }

  /** Oculta el modelo en mano (modo construcción, muerte…). Lo llama también PlayerController. */
  hideViewModel(): void {
    if (this._vm) this._vm.setVisible(false);
  }

  /** Modelo en mano (se crea al primer uso: necesita la cámara del jugador). */
  get vm(): ViewModel {
    if (!this._vm) this._vm = new ViewModel(this.ctx.player.camera);
    return this._vm;
  }

  /** Pose del avatar en tercera persona según la acción en curso. */
  get avatarAction(): string {
    if (this.timed) return this.timed.avatar;
    if (this.building) return 'hammer';
    if (this.hook.busy) return this.hook.avatarAction;
    if (this.fishing.busy) return this.fishing.avatarAction;
    return 'idle';
  }

  /** Herramienta que el avatar lleva en la mano si la acción la impone (undefined = la seleccionada). */
  get avatarTool(): ToolKind | null | undefined {
    if (this.timed) return this.timed.avatarTool;
    if (this.building) return 'martillo';
    return undefined;
  }

  /** Estado de las herramientas (depuración). */
  get toolState(): { hook: string; fishing: string; timed: string | null; building: number | null; bite: number; holdE: string | null } {
    return {
      hook: this.hook.phase,
      fishing: this.fishing.phase,
      timed: this.timed?.kind ?? null,
      building: this.building?.id ?? null,
      bite: this.fishing.secondsToBite,
      holdE: this.eHold ? this.eHold.quick.kind : null,
    };
  }

  reset(): void {
    this.hook.abort();
    this.fishing.abort();
    this.timed = null;
    this.building = null;
    this.eHold = null;
    this.fx.hideAll();
    this.focus = null;
    this.repairTarget = null;
    this.fireTarget = null;
    this.debrisTarget = null;
    this.rail = null;
    this.prompt = null;
    this.promptKey = '';
    this.ctx.ui.setPrompt(null);
    this.ctx.highlight = null;
    if (this._vm) {
      this._vm.stop();
      this._vm.show(null);
    }
  }

  /* ================================================================== */
  /* ToolEnv                                                             */
  /* ================================================================== */

  handWorld(anchor: string, out: THREE.Vector3): THREE.Vector3 {
    const player = this.ctx.player;
    if (player.firstPersonView && this.vm.visible) {
      const a = this.vm.anchorWorld(anchor, out);
      if (a) return a;
      this.ctx.player.camera.localToWorld(out.set(0.33, -0.28, -0.55));
    } else player.handWorld(out, anchor);
    if (finiteVec(out)) return out;
    // Último recurso: el pecho del jugador (las cuerdas nunca reciben coordenadas no finitas).
    const p = this.ctx.sim.state.player.pos;
    return this.shipToWorld(p.x, p.y + 1.3, p.z, out);
  }

  shipToWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    return this.ctx.renderer.shipRoot.localToWorld(out.set(x, y, z));
  }

  waterHeight(x: number, z: number): number {
    return this.ctx.renderer.waterHeight(x, z);
  }

  sfx(name: string, at?: { x: number; y: number; z: number }): void {
    const p = at ?? this.ctx.sim.state.player.pos;
    this.ctx.bus.emit('sfx', { name, x: p.x, y: p.y, z: p.z });
  }

  toast(text: string, kind: NotifyKind): void {
    // El mismo aviso repetido en ráfaga (clics seguidos) solo se muestra una vez por segundo.
    const key = `${kind}|${text}`;
    const last = this.toastAt.get(key) ?? -Infinity;
    if (this.clock - last < 1) return;
    this.toastAt.set(key, this.clock);
    if (this.toastAt.size > 40) this.toastAt.clear();
    this.recentToasts.push(`[${kind}] ${text}`);
    if (this.recentToasts.length > 8) this.recentToasts.shift();
    this.ctx.ui.toast(text, kind);
  }

  toolUsed(tool: string, phase: 'start' | 'hit' | 'success' | 'fail'): void {
    this.ctx.bus.emit('toolUsed', { tool, phase });
  }

  /* ================================================================== */
  /* Bucle                                                               */
  /* ================================================================== */

  update(dtReal: number): void {
    const dt = Math.max(0, Math.min(0.1, dtReal));
    this.lastDt = dt;
    this.clock += dt;
    const ctx = this.ctx;
    const sim = ctx.sim;
    const p = sim.state.player;
    const input = ctx.input;
    this.fx.update(dt);

    const held = p.inventory.slots[p.hotbar] ?? null;
    const heldId = held?.id ?? null;
    const tool = heldId ? (ITEMS[heldId]?.tool ?? null) : null;

    if (!p.alive || p.sleeping || ctx.mode !== 'play') {
      this.cancelAll();
      this.wasEnabled = false;
      this.focus = null;
      this.repairTarget = null;
      this.fireTarget = null;
      this.debrisTarget = null;
      this.rail = null;
      this.publish(p.alive && p.sleeping ? this.sleepPrompt() : null, null);
      this.updateViewModel(dt, heldId);
      return;
    }

    const enabled = input.enabled && !ctx.ui.panelOpen;
    // El primer frame con el control recuperado (al cerrar un panel o el menú, al capturar el
    // ratón) no usa la herramienta: ese clic era para volver al juego, no para lanzar el gancho.
    if (enabled && !this.wasEnabled) {
      input.consume('Mouse0');
      input.consume('Mouse2');
    }
    this.wasEnabled = enabled;
    if (!enabled) this.eHold = null;
    const aim = this.makeAim();

    // --- Objetivos ---
    this.focus = scanFocus(aim);
    this.repairTarget = scanRepair(aim, this.focus);
    this.fireTarget = sim.state.ship.modules.some((m) => m.fire > 0) ? scanFire(aim) : null;
    // Desde la bodega no se ve el mar: no se buscan restos.
    this.debrisTarget = tool === 'gancho' && !this.hook.busy && sim.state.debris.length && levelOfY(p.pos.y) >= 1 ? this.scanDebrisTarget() : null;
    this.rail = tool === 'cana' || tool === 'cubo' ? railFacing(sim, p.pos, aim.dir) : null;

    // --- Continuidad de las herramientas en curso ---
    if (this.hook.busy && tool !== 'gancho') this.hook.cancel();
    if (this.fishing.busy) {
      if (tool !== 'cana') this.fishing.cancel();
      else {
        const r = this.rail ?? railFacing(sim, p.pos, aim.dir);
        if (FishingTool.tooFar(r)) this.fishing.cancel('Te alejas de la borda y recoges el sedal');
      }
    }
    this.hook.update(dt);
    this.fishing.update(dt);
    this.updateTimed(dt);

    // --- Entrada ---
    if (enabled) this.handleInput(dt, aim, heldId, tool);
    else if (this.building) {
      this.building = null;
      this.vm.stop();
    }

    // --- Aviso y resaltado ---
    if (ctx.ui.panelOpen) this.publish(null, this.focusHighlight(this.focus));
    else this.composePrompt(heldId, tool);
    this.updateViewModel(dt, heldId);
  }

  private makeAim(): Aim {
    const player = this.ctx.player;
    const eye = player.eye();
    let dir = player.lookDirection();
    if (!player.firstPersonView) {
      // En tercera persona la mira está en el centro de la pantalla, no en la cara del personaje:
      // se apunta desde los ojos hacia el punto que la cámara tiene delante.
      const cam = player.camera;
      const cd = lookDir(cam.rotation.y, cam.rotation.x);
      const reach = cam.position.distanceTo(_o.set(eye.x, eye.y, eye.z)) + INTERACT_RANGE + 0.8;
      const tx = cam.position.x + cd.x * reach - eye.x;
      const ty = cam.position.y + cd.y * reach - eye.y;
      const tz = cam.position.z + cd.z * reach - eye.z;
      const l = Math.hypot(tx, ty, tz) || 1;
      dir = { x: tx / l, y: ty / l, z: tz / l };
    }
    return { sim: this.ctx.sim, pos: this.ctx.sim.state.player.pos, eye, dir };
  }

  /** Rayo de la cámara en coordenadas de mundo (océano). */
  private cameraRay(): { o: THREE.Vector3; d: THREE.Vector3 } {
    const cam = this.ctx.player.camera;
    cam.updateWorldMatrix(true, false);
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    return { o: _o, d: _d };
  }

  private scanDebrisTarget(): DebrisTarget | null {
    const { o, d } = this.cameraRay();
    return scanDebris(
      this.ctx.sim.state.debris,
      { x: o.x, y: o.y, z: o.z },
      { x: d.x, y: d.y, z: d.z },
      this.ctx.sim.state.player.pos,
      (x, z) => this.waterHeight(x, z),
      (db) => DEBRIS_RADIUS[db.kind] ?? 1,
      HOOK_SCAN_RANGE,
    );
  }

  /** Punto del agua al que se apunta (para lanzar el gancho sin objetivo). Siempre finito. */
  missPoint(out: THREE.Vector3): THREE.Vector3 {
    const { o, d } = this.cameraRay();
    const p = this.ctx.sim.state.player.pos;
    const plane = WATERLINE_Y;
    // Rayo degenerado (cámara con NaN, mirada vertical): se lanza hacia delante en planta.
    const ok = finiteVec(o) && finiteVec(d);
    const ox = ok ? o.x : p.x;
    const oz = ok ? o.z : p.z;
    let dx = ok ? d.x : 0;
    let dz = ok ? d.z : 0;
    let hl = Math.hypot(dx, dz);
    if (!(hl > 1e-3)) {
      const f = lookDir(this.ctx.sim.state.player.yaw, 0);
      dx = Number.isFinite(f.x) ? f.x : 0;
      dz = Number.isFinite(f.z) ? f.z : -1;
      hl = Math.hypot(dx, dz) || 1;
    }
    const t = ok && d.y < -0.05 ? (plane - o.y) / d.y : Infinity;
    // Entre 6 y 14 m del jugador en planta.
    const horiz = Math.max(6, Math.min(14, Number.isFinite(t) ? t * hl : 10));
    out.set(ox + (dx / hl) * horiz, 0, oz + (dz / hl) * horiz);
    // Nunca dentro del casco.
    const b = hullBounds(this.ctx.sim);
    if (Math.abs(out.z) < b.halfW + 1.5 && out.x > b.sternX - 1 && out.x < b.bowX + 1) out.z = (Math.sign(out.z || p.z || 1) || 1) * (b.halfW + 2.5);
    if (!Number.isFinite(out.x) || !Number.isFinite(out.z)) out.set(p.x, 0, (Math.sign(p.z) || 1) * (b.halfW + 6));
    const wy = this.waterHeight(out.x, out.z);
    out.y = Number.isFinite(wy) ? wy : WATERLINE_Y;
    return out;
  }

  /** Suelta todo al instante (dormir, morir): no habrá frames de herramienta para animar la recogida. */
  private cancelAll(): void {
    if (this.hook.busy) this.hook.abort();
    if (this.fishing.busy) this.fishing.abort();
    if (this.timed || this.building) this.vm.stop();
    this.timed = null;
    this.building = null;
    this.eHold = null;
  }

  /* ================================================================== */
  /* Entrada                                                             */
  /* ================================================================== */

  private handleInput(dt: number, aim: Aim, heldId: ItemId | null, tool: ToolKind | null): void {
    const ctx = this.ctx;
    const input = ctx.input;
    const sim = ctx.sim;
    const ePressed = input.pressed('KeyE');
    const eHeld = input.down('KeyE');
    const click = input.pressed('Mouse0');
    const clickHeld = input.down('Mouse0');
    const hasHammer = countItem(sim.state.player.inventory, 'martillo') > 0;
    const f = this.focus;
    const siteId = f?.kind === 'site' ? (f.moduleId ?? null) : f?.kind === 'expansion' ? -1 : null;

    // --- Obras: mantener E (o el clic con el martillo) ---
    if (this.building) {
      const keep = (eHeld || (clickHeld && tool === 'martillo')) && this.siteInReach(this.building.id);
      if (!keep) {
        this.building = null;
        this.vm.stop();
      }
    } else if (siteId !== null && !this.timed && (ePressed || (click && tool === 'martillo'))) {
      if (!hasHammer) this.toast('Necesitas un martillo para ayudar en la obra', 'warn');
      else {
        this.building = { id: siteId, hits: 0 };
        this.vm.play('swing', (ev) => this.onBuildHit(ev));
        this.toolUsed('martillo', 'start');
      }
    }
    if (this.building) {
      const res = sim.helpBuild(this.building.id, dt * TIME_SCALE);
      if (!res.ok) {
        this.toast(res.msg ?? 'No puedes ayudar en esta obra', 'warn');
        this.building = null;
      } else if (this.building.id === -1 ? !sim.state.ship.expansion : findModule(sim, this.building.id)?.status !== 'construction') {
        // Obra terminada: la simulación ya lo anuncia en el diario.
        this.toolUsed('martillo', 'success');
        this.building = null;
      }
      if (!this.building) this.vm.stop();
      return;
    }

    // --- Caña lanzada: el clic recoge ---
    if (this.fishing.busy) {
      if (click) this.fishing.click();
    } else if (click && !this.timed && !this.hook.busy) {
      this.useTool(aim, heldId, tool);
    }

    // --- E: acción directa al pulsar (beber, cosechar, coger) o panel al mantener; si no, abrir / hablar / dormir ---
    if (this.eHold) this.updateHoldE(dt, eHeld);
    else if (ePressed && !this.timed && f && f.kind !== 'site' && f.kind !== 'expansion') {
      const quick = this.quickFor(f);
      if (quick) {
        this.eHold = { focus: f, quick, t: 0 };
        // Pulsación tan rápida que ya se soltó dentro del mismo frame.
        this.updateHoldE(0, eHeld);
      } else this.interact(f);
    }

    // --- R: reparar (o llenar una botella en el depósito) ---
    if (input.pressed('KeyR') && !this.timed && !this.hook.busy && !this.fishing.busy) {
      const tank = this.focusedTank();
      if (this.repairTarget && (tank === null || this.repairTarget.module.id === tank)) this.startRepair(this.repairTarget);
      else if (tank !== null) this.fillBottle();
      else this.toast('Aquí no hay nada que reparar', 'info');
    }

    // --- Clic derecho / F: consumible ---
    if ((input.pressed('Mouse2') || input.pressed('KeyF')) && !this.timed && !this.hook.busy && !this.fishing.busy) this.consume(heldId);
  }

  /** Acción directa de la tecla E sobre el objetivo (null = E abre su panel al momento). */
  private quickFor(f: Focus): QuickAction | null {
    const sim = this.ctx.sim;
    if (f.kind === 'prop' && f.prop) return propQuick(sim, f.prop);
    if (f.kind === 'crate' && f.crate) return crateQuick(sim, f.crate);
    return null;
  }

  /** Módulo del depósito enfocado (null si no se mira a un depósito). */
  private focusedTank(): number | null {
    const f = this.focus;
    return f?.kind === 'prop' && f.prop?.interact === 'deposito' ? f.prop.moduleId : null;
  }

  /** E mantenida sobre un objetivo con acción directa: soltar pronto = acción; mantener = panel. */
  private updateHoldE(dt: number, held: boolean): void {
    const h = this.eHold;
    if (!h) return;
    // Mirar a otra parte mientras se mantiene E cancela (ni acción ni panel).
    if (this.focus?.key !== h.focus.key) {
      this.eHold = null;
      return;
    }
    if (!held) {
      this.eHold = null;
      if (h.t < HOLD_PANEL) this.runQuick(h.quick);
      return;
    }
    h.t += dt;
    if (h.t >= HOLD_PANEL) {
      this.eHold = null;
      this.interact(this.focus ?? h.focus);
    }
  }

  private runQuick(q: QuickAction): void {
    const ctx = this.ctx;
    const sim = ctx.sim;
    switch (q.kind) {
      case 'drink': {
        const res = sim.drinkFromTank();
        this.toast(res.msg ?? (res.ok ? 'Bebes agua del depósito' : 'No puedes beber ahora'), res.ok ? 'good' : 'warn');
        if (res.ok) {
          const show = this.ctx.sim.state.player.inventory.slots[this.ctx.sim.state.player.hotbar]?.id ?? null;
          this.vm.play('use');
          this.timed = { kind: 'eat', t: 0, dur: 0.8, show, avatar: 'drink', avatarTool: null, prompt: null, events: [] };
        }
        return;
      }
      case 'take': {
        const crate = sim.state.crates.find((c) => c.id === q.crateId);
        if (!crate) return;
        const res = sim.takeAll({ kind: 'crate', id: q.crateId });
        this.toast(res.msg ?? (res.ok ? 'Lo coges todo' : 'No puedes cogerlo'), res.ok ? 'good' : 'warn');
        if (res.ok) {
          this.vm.play('use');
          this.sfx('recoger', crate.pos);
        } else if (sim.state.crates.some((c) => c.id === q.crateId)) ctx.ui.openPanel({ kind: 'crate', crateId: q.crateId });
        return;
      }
      case 'harvest':
      case 'tend': {
        const res = q.kind === 'harvest' ? sim.harvest(q.moduleId, q.plot) : sim.tendPlot(q.moduleId, q.plot);
        this.toast(res.msg ?? (res.ok ? 'Hecho' : 'No se puede ahora'), res.ok ? 'good' : 'warn');
        if (res.ok) this.vm.play('use');
        return;
      }
    }
  }

  /** R en el depósito: llena una botella. */
  private fillBottle(): void {
    const res = this.ctx.sim.fillBottle();
    this.toast(res.msg ?? (res.ok ? 'Llenas una botella de agua' : 'No puedes llenar una botella'), res.ok ? 'good' : 'warn');
    if (res.ok) this.vm.play('use');
  }

  private siteInReach(id: number): boolean {
    const sim = this.ctx.sim;
    const p = sim.state.player.pos;
    if (id === -1) {
      if (!sim.state.ship.expansion) return false;
      return hullBounds(sim).bowX - p.x <= INTERACT_RANGE + 1.2;
    }
    const m = findModule(sim, id);
    if (!m || m.status !== 'construction') return false;
    // La obra aún no existe en el layout: distancia a sus celdas en el mismo nivel.
    return distanceToModule(sim, m, p) <= INTERACT_RANGE + 0.6;
  }

  private onBuildHit(ev: string): void {
    if (ev !== 'hit' || !this.building) return;
    this.building.hits++;
    this.sfx('martillo', this.focus?.point ?? this.ctx.sim.state.player.pos);
    this.toolUsed('martillo', 'hit');
    const pt = this.focus?.point;
    if (pt) {
      this.shipToWorld(pt.x, pt.y, pt.z, _w);
      this.fx.particles.burst(_w, { count: 6, color: '#c89f6c', color2: '#8b5e3c', speed: 1.6, up: 1.8, life: 0.55, size: 0.035, gravity: 9.8 });
    }
  }

  private interact(f: Focus): void {
    const ctx = this.ctx;
    const sim = ctx.sim;
    if (f.kind === 'npc' && f.npc) {
      ctx.ui.openPanel({ kind: 'npc', npcId: f.npc.id });
      this.vm.play('use');
      return;
    }
    if (f.kind === 'crate' && f.crate) {
      ctx.ui.openPanel({ kind: 'crate', crateId: f.crate.id });
      this.vm.play('use');
      return;
    }
    if (f.kind === 'prop' && f.prop) {
      const act = propAction(sim, f.prop);
      if (!act) return;
      if (act.kind === 'sleep') {
        const res = sim.sleep(act.moduleId, act.bed);
        if (res.ok) this.toast(res.msg ?? 'Te acuestas a dormir…', 'info');
        else this.toast(res.msg ?? 'No puedes dormir ahora', 'warn');
        return;
      }
      if (act.kind === 'helm') ctx.ui.openPanel({ kind: 'helm' });
      else ctx.ui.openPanel({ kind: 'station', moduleId: act.moduleId });
      this.vm.play('use');
    }
  }

  /** Clic izquierdo con la herramienta seleccionada. */
  private useTool(aim: Aim, heldId: ItemId | null, tool: ToolKind | null): void {
    const sim = this.ctx.sim;
    const p = sim.state.player;
    switch (tool) {
      case 'gancho': {
        const why = canHookFrom(sim, p.pos);
        if (why) {
          this.toast(why, 'warn');
          return;
        }
        const t = this.debrisTarget;
        if (t && t.dist > HOOK_RANGE) {
          this.toast(`Demasiado lejos (${Math.round(t.dist)} m): espera a que se acerque`, 'warn');
          return;
        }
        if (t) this.hook.throwAt(t);
        else this.hook.throwMiss(this.missPoint(_w));
        return;
      }
      case 'cana': {
        const r = this.rail ?? railFacing(sim, p.pos, aim.dir);
        if (!r.ok) {
          this.toast(r.reason ?? 'Acércate a la borda', 'warn');
          return;
        }
        this.fishing.cast(r, aim.dir);
        return;
      }
      case 'cubo': {
        const r = this.rail ?? railFacing(sim, p.pos, aim.dir);
        if (r.ok) this.startFill(r);
        else if (this.fireTarget) this.toast('El cubo está vacío: llénalo de agua de mar en la borda', 'warn');
        else this.toast(r.reason ?? 'Acércate a la borda', 'warn');
        return;
      }
      case 'cubo_lleno': {
        if (!this.fireTarget) {
          this.toast('Apunta a un fuego para echar el agua', 'info');
          return;
        }
        this.startPour(this.fireTarget);
        return;
      }
      case 'martillo':
      case 'llave': {
        const r = this.repairTarget;
        const wantTool = tool === 'martillo' ? 'martillo' : 'llave_inglesa';
        if (r && r.info.tool === wantTool) {
          this.startRepair(r);
          return;
        }
        if (r) {
          this.toast(r.info.tool === 'martillo' ? 'Esto se repara con el martillo y un kit de reparación' : 'Esto se repara con la llave inglesa y una pieza mecánica', 'info');
          return;
        }
        // Sin nada que hacer: un golpe al aire como respuesta.
        this.vm.play(tool === 'martillo' ? 'swing' : 'wrench');
        this.timed = {
          kind: 'repair',
          t: 0,
          dur: 0.6,
          show: heldId,
          avatar: 'hammer',
          avatarTool: tool,
          prompt: null,
          events: [],
          onEnd: () => this.vm.stop(),
        };
        return;
      }
      default:
        return;
    }
  }

  /* ================================================================== */
  /* Acciones con duración                                               */
  /* ================================================================== */

  private updateTimed(dt: number): void {
    const a = this.timed;
    if (!a) return;
    a.t += dt;
    const why = a.check?.() ?? null;
    if (why) {
      this.timed = null;
      this.vm.stop();
      this.toast(why, 'warn');
      return;
    }
    for (const ev of a.events) {
      if (!ev.done && a.t >= ev.t) {
        ev.done = true;
        ev.fn();
        if (this.timed !== a) return;
      }
    }
    if (a.prompt && a.prompt.progress !== undefined) a.prompt.progress = Math.min(1, a.t / a.dur);
    if (a.t >= a.dur) {
      this.timed = null;
      a.onEnd?.();
    }
  }

  private startRepair(r: RepairTarget): void {
    const sim = this.ctx.sim;
    const info = sim.repairInfo(r.module.id);
    if (!info.needed) return;
    if (!info.ok) {
      this.toast(info.reason ?? 'No puedes repararlo', 'warn');
      return;
    }
    const id = r.module.id;
    const name = moduleDef(r.module.type).name;
    const isHammer = info.tool === 'martillo';
    const show: ItemId = isHammer ? 'martillo' : 'llave_inglesa';
    this.vm.play(isHammer ? 'swing' : 'wrench', (ev) => {
      if (ev !== 'hit') return;
      this.sfx(isHammer ? 'martillo' : 'llave', this.focus?.point ?? sim.state.player.pos);
      this.toolUsed(isHammer ? 'martillo' : 'llave', 'hit');
    });
    this.toolUsed(isHammer ? 'martillo' : 'llave', 'start');
    this.timed = {
      kind: 'repair',
      t: 0,
      dur: REPAIR_TIME,
      show,
      avatar: 'repair',
      avatarTool: isHammer ? 'martillo' : 'llave',
      prompt: { key: '', text: `Reparando ${name}…`, progress: 0 },
      events: [],
      check: () => {
        const m = findModule(sim, id);
        if (!m) return 'Ese módulo ya no existe';
        return distanceToModule(sim, m, sim.state.player.pos) > REPAIR_RANGE + 0.8 ? 'Te has alejado: reparación interrumpida' : null;
      },
      onEnd: () => {
        this.vm.stop();
        const res = sim.repair(id);
        if (res.ok) {
          this.toast(res.msg ?? `${name} reparado`, 'good');
          this.toolUsed(isHammer ? 'martillo' : 'llave', 'success');
        } else {
          this.toast(res.msg ?? 'No se ha podido reparar', 'warn');
          this.toolUsed(isHammer ? 'martillo' : 'llave', 'fail');
        }
      },
    };
  }

  private startFill(r: RailInfo): void {
    const sim = this.ctx.sim;
    this.vm.play('dip');
    this.toolUsed('cubo', 'start');
    const water = { x: r.edgeX + r.nx * 1.2, z: r.edgeZ + r.nz * 1.2 };
    this.timed = {
      kind: 'fill',
      t: 0,
      dur: 1.15,
      show: 'cubo',
      avatar: 'use',
      avatarTool: 'cubo',
      prompt: { key: '', text: 'Llenando el cubo…', progress: 0 },
      events: [
        {
          t: 0.56,
          done: false,
          fn: () => {
            const res = sim.fillBucket();
            const wy = this.waterHeight(water.x, water.z);
            _w.set(water.x, wy, water.z);
            if (res.ok) {
              this.fx.particles.burst(_w, { count: 14, color: '#e8f4f2', color2: '#9ed8e6', speed: 1.4, up: 2.6, life: 0.6, size: 0.07, gravity: 9, floor: wy - 0.2 });
              this.fx.ripples.spawn(_w, 1, 0.9);
              this.sfx('chapoteo', { x: water.x, y: wy, z: water.z });
              this.toolUsed('cubo', 'success');
              this.toast(res.msg ?? 'Llenas el cubo de agua de mar', 'info');
              if (this.timed) this.timed.show = 'cubo_agua';
            } else {
              this.toolUsed('cubo', 'fail');
              this.toast(res.msg ?? 'No puedes llenar el cubo aquí', 'warn');
            }
          },
        },
      ],
    };
  }

  private startPour(fire: FireTarget): void {
    const sim = this.ctx.sim;
    const id = fire.module.id;
    const label = moduleLabel(fire.module);
    this.vm.play('pour');
    this.toolUsed('cubo_agua', 'start');
    this.timed = {
      kind: 'pour',
      t: 0,
      dur: 0.85,
      show: 'cubo_agua',
      avatar: 'throw',
      avatarTool: 'cubo_lleno',
      prompt: { key: '', text: `Echando agua: ${label}`, progress: 0 },
      events: [
        {
          t: 0.34,
          done: false,
          fn: () => {
            // Chorro de agua desde la mano hacia las llamas.
            this.handWorld('boca', _o);
            const m = findModule(sim, id);
            const pt = m ? fire.point : null;
            if (pt) {
              this.shipToWorld(pt.x, pt.y, pt.z, _w);
              _d.copy(_w).sub(_o);
              const dist = _d.length();
              const flight = 0.32;
              _d.multiplyScalar(1 / flight);
              _d.y += 0.5 * 9 * flight;
              this.fx.particles.burst(_o, { count: 48, color: '#9ed8e6', color2: '#e8f4f2', speed: 0.6 + dist * 0.05, dir: _d, life: flight + 0.15, size: 0.08, gravity: 9 });
              this.fx.particles.burst(_w, { count: 18, color: '#d9e2e6', color2: '#ffffff', speed: 0.6, up: 2.4, life: 1.1, size: 0.12, gravity: -1.2 });
            }
            this.vm.setPart('agua', false);
            const res = sim.extinguish(id);
            this.sfx(res.ok ? 'agua_fuego' : 'chapoteo', pt ?? sim.state.player.pos);
            if (res.ok) {
              const mm = findModule(sim, id);
              this.toast(res.msg ?? 'Echas agua al fuego', mm && mm.fire > 0 ? 'info' : 'good');
              this.toolUsed('cubo_agua', 'success');
            } else {
              this.toast(res.msg ?? 'No llegas al fuego', 'warn');
              this.toolUsed('cubo_agua', 'fail');
            }
            if (this.timed) this.timed.show = res.ok ? 'cubo' : 'cubo_agua';
          },
        },
      ],
      check: () => {
        // Una vez lanzada el agua, alejarse ya no interrumpe nada.
        if (this.timed?.events[0]?.done) return null;
        const m = findModule(sim, id);
        if (!m) return 'Ese módulo ya no existe';
        return distanceToModule(sim, m, sim.state.player.pos) > EXTINGUISH_RANGE + 1 ? 'Acércate más al fuego' : null;
      },
    };
  }

  private consume(heldId: ItemId | null): void {
    const sim = this.ctx.sim;
    const p = sim.state.player;
    if (!heldId) {
      this.toast('No llevas nada en la mano', 'info');
      return;
    }
    const def = ITEMS[heldId];
    if (!def) return;
    if (heldId === 'cubo_agua') {
      this.toast('El agua de mar no se bebe: sirve para apagar fuegos o destilarla en la cocina', 'info');
      return;
    }
    if (def.category === 'herramienta') {
      this.toast(`${def.name}: usa el clic izquierdo`, 'info');
      return;
    }
    const slot = p.hotbar;
    if (slot < 0 || slot >= HOTBAR_SLOTS) return;
    const res = sim.useItem(slot);
    if (!res.ok) {
      this.toast(res.msg ?? 'No puedes usar esto', 'warn');
      return;
    }
    this.toast(res.msg ?? `Usas ${def.name}`, 'good');
    if (def.category === 'comida' || def.category === 'bebida' || def.category === 'medicina') {
      this.vm.play('eat');
      this.timed = {
        kind: 'eat',
        t: 0,
        dur: 0.95,
        show: heldId,
        avatar: def.category === 'comida' ? 'eat' : 'drink',
        avatarTool: null,
        prompt: null,
        events: [],
      };
    } else this.vm.play('use');
  }

  /* ================================================================== */
  /* Avisos y resaltado                                                  */
  /* ================================================================== */

  private sleepPrompt(): PromptInfo {
    const sim = this.ctx.sim;
    const s = sim.state.player.sleeping!;
    const energy = Math.round(sim.state.player.needs.energy);
    if (s.until !== null && sim.state.time < s.until) return { key: '', text: 'Desmayado', sub: `Recuperando fuerzas… Energía ${energy} %`, disabled: true };
    return { key: 'E', text: 'Levantarse', sub: `Durmiendo… Energía ${energy} %` };
  }

  private focusHighlight(f: Focus | null): HighlightTarget | null {
    if (!f) return null;
    switch (f.kind) {
      case 'prop':
        return f.prop ? { kind: 'prop', key: f.prop.key } : null;
      case 'npc':
        return f.npc ? { kind: 'npc', id: f.npc.id } : null;
      case 'crate':
        return f.crate ? { kind: 'crate', id: f.crate.id } : null;
      case 'site':
        return f.moduleId !== undefined ? { kind: 'module', id: f.moduleId } : null;
      default:
        return null;
    }
  }

  private focusPrompt(f: Focus, hasHammer: boolean): PromptInfo | null {
    const sim = this.ctx.sim;
    switch (f.kind) {
      case 'prop':
        return f.prop ? propPrompt(sim, f.prop) : null;
      case 'npc':
        return f.npc ? npcPrompt(sim, f.npc) : null;
      case 'crate':
        return f.crate ? cratePrompt(f.crate, crateFits(sim, f.crate)) : null;
      case 'site':
        return f.moduleId !== undefined ? sitePrompt(sim, f.moduleId, hasHammer, false) : null;
      case 'expansion':
        return sitePrompt(sim, -1, hasHammer, false);
      default:
        return null;
    }
  }

  /** Aviso de la herramienta seleccionada (gancho, caña, cubo) según lo que hay delante. */
  private toolPrompt(tool: ToolKind | null): PromptInfo | null {
    const sim = this.ctx.sim;
    const p = sim.state.player;
    switch (tool) {
      case 'gancho': {
        const t = this.debrisTarget;
        if (!t) return null;
        const name = DEBRIS_NAMES[t.debris.kind] ?? 'Resto';
        const dist = Math.round(t.dist);
        const why = canHookFrom(sim, p.pos);
        if (why) return { key: 'Clic', text: `Lanzar el gancho: ${name}`, sub: why, disabled: true };
        if (t.dist > HOOK_RANGE) return { key: 'Clic', text: `Lanzar el gancho: ${name}`, sub: `Demasiado lejos (${dist} m): espera a que se acerque`, disabled: true };
        const extra = t.debris.survivors ? ' · ¡Hay náufragos!' : '';
        return { key: 'Clic', text: `Lanzar el gancho: ${name}`, sub: `A ${dist} m${extra}` };
      }
      case 'cana':
      case 'cubo': {
        const r = this.rail;
        if (!r) return null;
        const text = tool === 'cana' ? 'Lanzar la caña' : 'Llenar el cubo de agua de mar';
        if (r.ok) return { key: 'Clic', text };
        // Solo se insiste cuando está cerca de la borda.
        if (r.edgeDist <= 3.5 && r.reason) return { key: 'Clic', text, sub: r.reason, disabled: true };
        return null;
      }
      default:
        return null;
    }
  }

  private composePrompt(heldId: ItemId | null, tool: ToolKind | null): void {
    const sim = this.ctx.sim;
    const hasHammer = countItem(sim.state.player.inventory, 'martillo') > 0;
    let prompt: PromptInfo | null = null;
    let hl: HighlightTarget | null = null;
    const fire = this.fireTarget;

    if (this.fishing.busy) {
      prompt = this.fishing.prompt;
    } else if (this.hook.busy) {
      prompt = this.hook.prompt;
      const id = this.hook.targetDebris;
      if (id !== null && this.hook.phase === 'flying') hl = { kind: 'debris', id };
    } else if (this.timed) {
      prompt = this.timed.prompt;
      if (this.timed.kind === 'repair' && this.repairTarget) hl = { kind: 'module', id: this.repairTarget.module.id };
      if (this.timed.kind === 'pour' && fire) hl = { kind: 'module', id: fire.module.id };
    } else if (this.building) {
      prompt = sitePrompt(sim, this.building.id, true, true);
      if (this.building.id >= 0) hl = { kind: 'module', id: this.building.id };
    } else if (this.eHold && this.eHold.t >= HOLD_HINT) {
      // Manteniendo E: anillo de progreso hasta abrir el panel.
      prompt = holdPrompt(this.eHold.quick, this.eHold.t / HOLD_PANEL);
      hl = this.focusHighlight(this.focus);
    } else {
      // 1) Fuego con el cubo de agua en la mano: lo más urgente.
      if (fire && heldId === 'cubo_agua') {
        prompt = { key: 'Clic', text: `Echar agua al fuego: ${moduleLabel(fire.module)}`, sub: `Intensidad ${Math.round(fire.module.fire)} %` };
        hl = { kind: 'module', id: fire.module.id };
      }
      // 2) Objetivo de la tecla E.
      if (!prompt && this.focus) {
        prompt = this.focusPrompt(this.focus, hasHammer);
        hl = this.focusHighlight(this.focus);
      }
      // 3) Herramienta seleccionada.
      const tp = this.toolPrompt(tool);
      if (tp) {
        if (!prompt) {
          prompt = tp;
          if (tool === 'gancho' && this.debrisTarget) hl = { kind: 'debris', id: this.debrisTarget.debris.id };
        } else if (!prompt.alt) prompt = { ...prompt, alt: { key: tp.key, text: tp.text, disabled: tp.disabled } };
      }
      // 4) Reparación (R). Mirando al depósito, R llena una botella salvo que sea él el que se repara.
      const r = this.repairTarget;
      const tank = this.focusedTank();
      if (r && (tank === null || r.module.id === tank)) {
        const name = moduleDef(r.module.type).name;
        const what = r.module.status === 'broken' ? `Averiado: ${r.module.brokenReason ?? 'roto'}` : r.module.leak ? 'Tiene una fuga' : `Estado ${Math.round(r.module.condition)} %`;
        const need = r.info.tool === 'martillo' ? 'martillo + kit de reparación' : 'llave inglesa + pieza mecánica';
        if (!prompt) {
          prompt = { key: 'R', text: `Reparar ${name}`, sub: r.info.ok ? `${what} · Usa ${need}` : (r.info.reason ?? what), disabled: !r.info.ok };
          hl = { kind: 'module', id: r.module.id };
        } else if (!prompt.alt || tank !== null) prompt = { ...prompt, alt: { key: 'R', text: `Reparar ${name}`, disabled: !r.info.ok } };
      }
      // 5) Fuego sin cubo de agua en la mano: pista.
      if (!prompt && fire) {
        const inv = sim.state.player.inventory;
        const sub =
          countItem(inv, 'cubo_agua') > 0
            ? 'Selecciona el cubo con agua y haz clic'
            : countItem(inv, 'cubo') > 0
              ? 'Llena el cubo de agua de mar en la borda'
              : 'Necesitas un cubo de agua de mar';
        prompt = { key: '', text: `¡Fuego en ${moduleLabel(fire.module)}!`, sub, disabled: true };
        hl = { kind: 'module', id: fire.module.id };
      }
    }
    this.publish(prompt, hl);
  }

  private publish(prompt: PromptInfo | null, hl: HighlightTarget | null): void {
    const key = prompt ? `${prompt.key}|${prompt.text}|${prompt.sub ?? ''}|${prompt.disabled ? 1 : 0}|${prompt.progress?.toFixed(3) ?? ''}|${prompt.alt ? `${prompt.alt.key}|${prompt.alt.text}|${prompt.alt.disabled ? 1 : 0}` : ''}` : '';
    if (key !== this.promptKey) {
      this.promptKey = key;
      this.prompt = prompt;
      this.ctx.ui.setPrompt(prompt);
    }
    const cur = this.ctx.highlight;
    const same = cur === hl || (!!cur && !!hl && JSON.stringify(cur) === JSON.stringify(hl));
    if (!same) this.ctx.highlight = hl;
  }

  /* ================================================================== */
  /* Modelo en mano                                                      */
  /* ================================================================== */

  private updateViewModel(dt: number, heldId: ItemId | null): void {
    const ctx = this.ctx;
    const player = ctx.player;
    const p = ctx.sim.state.player;
    const vm = this.vm;
    const show = this.timed ? this.timed.show : this.building ? 'martillo' : heldId;
    vm.show(show);
    // Con el gancho apuntando a un resto al alcance, el brazo se prepara (respuesta visual de "listo").
    const t = this.debrisTarget;
    const ready = show === 'gancho' && !!t && t.dist <= HOOK_RANGE && !this.hook.busy && !this.timed;
    if (ready && vm.actionName === null) vm.play('aim');
    else if (!ready && vm.actionName === 'aim') vm.stop();
    const visible = ctx.mode === 'play' && p.alive && !p.sleeping && player.firstPersonView;
    vm.setVisible(visible);
    const shadows = ctx.renderer.renderer.shadowMap.enabled;
    // Sin sombras, el interior se oscurece a mano para que el objeto no brille dentro de la bodega.
    const light = shadows ? 1 : player.isIndoor() ? 0.72 : 1;
    vm.update(dt, { bobPhase: player.bobPhase, bobAmount: player.bobAmount, yaw: p.yaw, pitch: p.pitch, landKick: player.landKick, light }, shadows);
  }

  /* ================================================================== */
  /* Justo antes de dibujar                                              */
  /* ================================================================== */

  /**
   * Cuerdas, corcho y resto arrastrado con las transformaciones definitivas del frame (después
   * de colocar los restos y mecer el barco, antes de dibujar). `Game` la llama una vez por frame
   * justo antes de `renderer.render`.
   */
  lateUpdate(): void {
    this.late();
  }

  private late(): void {
    try {
      this.hook.late(this.lastDt);
      this.fishing.late(this.lastDt);
    } catch (e) {
      console.error('[Interaction] error al preparar las herramientas', e);
    }
  }

  /* ================================================================== */
  /* Depuración                                                          */
  /* ================================================================== */

  private registerDebugCommands(): void {
    const ctx = this.ctx;
    registerDebug('jugador', (() => {
      const st = ctx.sim.state.player;
      const pl = ctx.player;
      return {
        pos: { ...st.pos },
        yaw: st.yaw,
        pitch: st.pitch,
        perspective: pl.perspective,
        onGround: pl.onGround,
        speed: pl.speed,
        focus: this.focus ? this.focus.key : null,
        prompt: this.prompt,
        highlight: ctx.highlight,
        tools: this.toolState,
        hand: this.vm.shownId,
        handVisible: this.vm.visible,
        toasts: [...this.recentToasts],
        debrisTarget: this.debrisTarget ? { id: this.debrisTarget.debris.id, dist: this.debrisTarget.dist } : null,
        rail: this.rail ? { ok: this.rail.ok, reason: this.rail.reason, edgeDist: this.rail.edgeDist } : null,
        repair: this.repairTarget ? { id: this.repairTarget.module.id, ok: this.repairTarget.info.ok, reason: this.repairTarget.info.reason } : null,
        fire: this.fireTarget ? { id: this.fireTarget.module.id, fire: this.fireTarget.module.fire } : null,
      };
    }) as never);
    // Pone un objeto en la barra rápida (lo da si falta) y lo selecciona.
    registerDebug('herramienta', ((id: ItemId) => {
      const st = ctx.sim.state.player;
      const inv = st.inventory;
      let slot = inv.slots.findIndex((s) => s?.id === id);
      if (slot < 0) {
        addItem(inv, id, 1);
        slot = inv.slots.findIndex((s) => s?.id === id);
      }
      if (slot < 0) return -1;
      if (slot >= HOTBAR_SLOTS) {
        const target = st.hotbar;
        const tmp = inv.slots[target] ?? null;
        inv.slots[target] = inv.slots[slot] ?? null;
        inv.slots[slot] = tmp;
        slot = target;
      }
      ctx.sim.setHotbar(slot);
      return slot;
    }) as never);
    // Crea un resto flotante a `dist` m por el costado más cercano al jugador y devuelve su id.
    registerDebug('resto', ((kind: DebrisKind = 'caja', dist = 8, dx = 0, survivors = 0) => {
      const sim = ctx.sim;
      const p = sim.state.player.pos;
      const b = hullBounds(sim);
      const side = p.z >= 0 ? 1 : -1;
      const d = spawnDebris(sim, kind, { x: p.x + dx, z: side * (b.halfW + dist) }, survivors > 0 ? { survivors } : {});
      d.vel.x = 0;
      d.vel.z = 0;
      return d.id;
    }) as never);
    // Mira hacia un punto (coordenadas del barco) desde los ojos del jugador.
    registerDebug('mirarA', ((x: number, y: number, z: number) => {
      const st = ctx.sim.state.player;
      const e = ctx.player.eye();
      const yp = yawPitchTo(e, { x, y, z });
      st.yaw = yp.yaw;
      st.pitch = yp.pitch;
      return yp;
    }) as never);
    // Mira hacia un resto flotante.
    registerDebug('mirarResto', ((id: number) => {
      const d = ctx.sim.state.debris.find((x) => x.id === id);
      if (!d) return null;
      const st = ctx.sim.state.player;
      const e = ctx.player.eye();
      const yp = yawPitchTo(e, { x: d.pos.x, y: this.waterHeight(d.pos.x, d.pos.z) + 0.3, z: d.pos.z });
      st.yaw = yp.yaw;
      st.pitch = yp.pitch;
      return yp;
    }) as never);
    // Pulsa y suelta una tecla avanzando frames (simula una pulsación real).
    registerDebug('pulsar', ((code: string, frames = 2) => {
      const game = (window as unknown as { __game: { cmd: Record<string, (...a: unknown[]) => unknown> } }).__game;
      ctx.input.injectKey(code, true);
      game.cmd.step!(Math.max(1, frames));
      ctx.input.injectKey(code, false);
      game.cmd.step!(1);
      return this.toolState;
    }) as never);
    // Hace que pique ya (para probar la pesca sin esperar).
    registerDebug('picarYa', (() => {
      const f = this.fishing as unknown as { phase: string; biteAt: number; t: number };
      if (f.phase === 'waiting') f.biteAt = f.t + 0.01;
      return f.phase;
    }) as never);
  }
}

/**
 * Pegamento principal: crea todas las piezas, gestiona modos (menú, juego, construcción,
 * muerte), atajos globales, guardado automático y el bucle de render/simulación.
 *
 * Atajos globales (aquí): Esc (cerrar/pausa/salir de construcción), B (construcción),
 * V (perspectiva), Tab/I (inventario), J (diario), C (fabricar a mano), 1-8 y rueda (barra rápida).
 * E, clics y herramientas los gestiona Interaction; WASD/ratón, PlayerController.
 */
import { EventBus } from '../core/EventBus';
import { Audio } from '../audio/Audio';
import { BuildMode } from '../build/BuildMode';
import { DebrisView } from '../render/DebrisView';
import { NpcView } from '../render/NpcView';
import { PlayerAvatar } from '../render/PlayerAvatar';
import { Renderer } from '../render/Renderer';
import { ShipView } from '../render/ShipView';
import { TIME_SCALE } from '../sim/constants';
import { createLocalSaveStore, restoreState, serialize, type SaveSlotInfo, type SaveStore } from '../sim/save';
import { Simulation } from '../sim/Simulation';
import { UI } from '../ui/UI';
import type { GameContext } from './context';
import { installDebug, registerDebug } from './debug';
import { Input } from './Input';
import { Interaction } from './Interaction';
import { PlayerController } from './PlayerController';
import { DEFAULT_SETTINGS, type GameMode, type HighlightTarget, type Settings } from './types';
import { addItem } from '../sim/inventory';
import { BLUEPRINT_ORDER } from '../data/loot';
import { ITEMS } from '../data/items';
import { forceWeather } from '../sim/weather';
import type { WeatherKind } from '../sim/types';
import * as events from '../sim/events';
import { spawnSurvivor } from '../sim/npc';

const SETTINGS_KEY = 'ciudad-flotante:settings';
const AUTOSAVE_SLOT = 'auto';

export class Game implements GameContext {
  readonly bus = new EventBus();
  sim: Simulation;
  readonly renderer: Renderer;
  readonly shipView: ShipView;
  readonly npcView: NpcView;
  readonly debrisView: DebrisView;
  readonly avatar: PlayerAvatar;
  readonly input: Input;
  readonly ui: UI;
  readonly player: PlayerController;
  readonly interaction: Interaction;
  readonly build: BuildMode;
  readonly audio: Audio;
  readonly settings: Settings;
  private _mode: GameMode = 'menu';
  paused = false;
  highlight: HighlightTarget | null = null;
  private saves: SaveStore;
  private last = performance.now();
  private autosaveTimer = 0;
  private clickHintShown = false;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 0;

  constructor(private readonly container: HTMLElement) {
    this.settings = this.loadSettings();
    // Parámetro de URL ?quality=baja|media|alta (pruebas automáticas, equipos lentos). No se guarda.
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'baja' || q === 'media' || q === 'alta') this.settings.quality = q;
    this.saves = createLocalSaveStore();
    this.sim = Simulation.newGame(undefined, this.bus);
    this.renderer = new Renderer(container, this.settings.quality);
    this.input = new Input(this.renderer.canvas);
    this.shipView = new ShipView(this.renderer.shipRoot);
    this.npcView = new NpcView(this.renderer.shipRoot);
    this.debrisView = new DebrisView(this.renderer.worldRoot);
    this.avatar = new PlayerAvatar(this.renderer.shipRoot);
    this.player = new PlayerController(this, this.avatar);
    this.interaction = new Interaction(this);
    this.build = new BuildMode(this);
    this.ui = new UI(container, this);
    this.audio = new Audio(this);

    this.bus.on('playerDied', () => this.setMode('dead'));
    this.bus.on('newDay', () => this.autosave());
    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    installDebug(this);
    this.registerDebugCommands();

    const params = new URLSearchParams(location.search);
    if (params.has('autostart')) {
      const seed = params.get('seed');
      this.newGame(seed ? Number(seed) : undefined);
    } else {
      this.ui.showMainMenu();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  get mode(): GameMode {
    return this._mode;
  }

  setMode(mode: GameMode): void {
    if (mode === this._mode) return;
    const prev = this._mode;
    this._mode = mode;
    if (prev === 'build') this.build.exit();
    if (mode === 'build') this.build.enter();
    if (mode === 'menu' || mode === 'dead') {
      // La mano en primera persona cuelga de la cámara que también usa el menú: ocultarla.
      // (En juego, Interaction decide su visibilidad cada frame.)
      this.interaction.hideViewModel();
      if (mode === 'menu') this.avatar.object.visible = false;
    }
    if (mode === 'dead') this.ui.showDeath();
    if (mode === 'play') this.ui.hideMenus();
  }

  /* ---------------- Ajustes ---------------- */

  private loadSettings(): Settings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
    } catch {
      /* sin almacenamiento */
    }
    return { ...DEFAULT_SETTINGS };
  }

  saveSettings(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      /* sin almacenamiento */
    }
    this.applySettings();
  }

  applySettings(): void {
    this.player.camera.fov = this.settings.fov;
    this.player.camera.updateProjectionMatrix();
    this.renderer.setQuality(this.settings.quality);
    this.audio.setVolume(this.settings.volume);
  }

  /* ---------------- Partidas ---------------- */

  private replaceSim(sim: Simulation, reason: 'new' | 'load'): void {
    this.sim = sim;
    this.highlight = null;
    this.shipView.reset();
    this.npcView.reset();
    this.debrisView.reset();
    this.player.reset();
    this.interaction.reset();
    this.build.reset();
    this.ui.reset();
    this.paused = false;
    this.bus.emit('simReplaced', { reason });
    this._mode = 'menu';
    this.setMode('play');
    this.audio.unlock();
  }

  newGame(seed?: number): void {
    this.replaceSim(Simulation.newGame(seed, this.bus), 'new');
    this.player.perspective = this.settings.perspective;
  }

  saveGame(slot = 'manual'): void {
    try {
      this.sim.syncRng();
      this.saves.save(slot, this.sim.state);
      this.bus.emit('saved', { slot });
      this.sim.notify(slot === AUTOSAVE_SLOT ? 'Partida guardada automáticamente' : 'Partida guardada', 'good');
    } catch (e) {
      console.error(e);
      this.sim.notify('No se pudo guardar la partida', 'danger');
    }
  }

  private autosave(): void {
    if (this._mode === 'play' || this._mode === 'build') this.saveGame(AUTOSAVE_SLOT);
  }

  loadGame(slot: string): boolean {
    try {
      const st = this.saves.load(slot);
      if (!st) return false;
      this.replaceSim(new Simulation(st, this.bus), 'load');
      if (!this.sim.state.player.alive) this.setMode('dead');
      else this.sim.notify('Partida cargada', 'good');
      return true;
    } catch (e) {
      console.error(e);
      this.sim.notify('La partida guardada está dañada o no es compatible', 'danger');
      return false;
    }
  }

  /**
   * Instantánea de la partida en curso para conservarla si la página se actualiza en caliente
   * (publicaciones nuevas en claude.ai). null si no hay partida en marcha.
   */
  snapshot(): { state: string; mode: GameMode } | null {
    if (this._mode !== 'play' && this._mode !== 'build') return null;
    this.sim.syncRng();
    return { state: serialize(this.sim.state), mode: this._mode };
  }

  /** Restaura una instantánea de `snapshot()`. Devuelve false si no es válida. */
  restoreSnapshot(snap: { state?: unknown } | null | undefined): boolean {
    if (!snap || typeof snap.state !== 'string') return false;
    try {
      const st = restoreState(JSON.parse(snap.state));
      this.replaceSim(new Simulation(st, this.bus), 'load');
      if (!this.sim.state.player.alive) this.setMode('dead');
      return true;
    } catch (e) {
      console.warn('[Game] no se pudo restaurar la instantánea', e);
      return false;
    }
  }

  listSaves(): SaveSlotInfo[] {
    return this.saves.list();
  }

  deleteSave(slot: string): void {
    this.saves.remove(slot);
  }

  hasSaves(): boolean {
    return this.saves.list().length > 0;
  }

  /* ---------------- Bucle ---------------- */

  private onResize(): void {
    this.renderer.resize();
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    for (const cam of [this.player.camera, this.build.camera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  private handleGlobalKeys(): void {
    const inp = this.input;
    const ui = this.ui;
    if (this._mode === 'menu' || this._mode === 'dead') return;
    // Con el ratón capturado, el navegador se queda la tecla Esc: lo detectamos por la pérdida de captura.
    if (inp.consumeLockLost() && this._mode === 'play' && !ui.panelOpen && !this.paused) {
      this.paused = true;
      ui.showPauseMenu();
      return;
    }
    if (inp.pressed('Escape')) {
      if (this._mode === 'build') {
        if (!this.build.cancel()) this.setMode('play');
      } else if (ui.panelOpen) ui.closePanel();
      else if (this.paused) {
        this.paused = false;
        ui.hideMenus();
      } else {
        this.paused = true;
        ui.showPauseMenu();
      }
      return;
    }
    if (this.paused) return;
    if (inp.pressed('KeyB')) {
      if (this._mode === 'build') this.setMode('play');
      else if (!ui.panelOpen && !this.sim.state.player.sleeping) this.setMode('build');
      return;
    }
    if (this._mode !== 'play') return;
    if (inp.pressed('Tab') || inp.pressed('KeyI')) {
      if (ui.panelOpen) ui.closePanel();
      else ui.openPanel({ kind: 'inventory', tab: 'objetos' });
    }
    if (inp.pressed('KeyJ')) {
      if (ui.panelOpen) ui.closePanel();
      else ui.openPanel({ kind: 'inventory', tab: 'diario' });
    }
    if (inp.pressed('KeyC') && !ui.panelOpen) ui.openPanel({ kind: 'inventory', tab: 'fabricar' });
    if (ui.panelOpen) return;
    if (inp.pressed('KeyV')) this.player.togglePerspective();
    for (let i = 0; i < 8; i++) if (inp.pressed(`Digit${i + 1}`)) this.sim.setHotbar(i);
    const w = inp.wheel();
    if (w !== 0) this.sim.setHotbar((this.sim.state.player.hotbar + (w > 0 ? 1 : 7)) % 8);
  }

  private frame(t: number): void {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    try {
      this.step(dt);
    } catch (e) {
      console.error('[Game] error en el frame', e);
    }
    this.input.endFrame();
  }

  /** Un frame completo (también lo usan las pruebas automáticas). */
  step(dt: number): void {
    this.handleGlobalKeys();
    const playing = this._mode === 'play' || this._mode === 'build';
    const ui = this.ui;
    const wantLock = this._mode === 'play' && !ui.panelOpen && !ui.menuOpen && !this.paused;
    this.input.setPointerLockWanted(wantLock);
    this.input.enabled = wantLock;
    if (this.input.awaitingClick) {
      if (!this.clickHintShown) {
        this.clickHintShown = true;
        ui.toast('Haz clic en la pantalla para controlar la cámara', 'info');
      }
    } else if (this.input.locked) this.clickHintShown = false;
    if (playing && !this.paused) {
      if (this._mode === 'play') {
        this.player.update(dt);
        this.interaction.update(dt);
      } else {
        this.player.update(0);
        this.build.update(dt);
      }
      this.sim.tick(dt * TIME_SCALE * this.sim.timeScale);
      this.autosaveTimer += dt;
      if (this.autosaveTimer > 600) {
        this.autosaveTimer = 0;
        this.autosave();
      }
    }
    const camera = this._mode === 'build' ? this.build.camera : this.player.camera;
    const st = this.sim.state;
    const layout = this.sim.layout;
    const hide = this._mode === 'build' ? this.build.hideAboveLevel : null;
    this.shipView.sync(st, layout, { hideAboveLevel: hide, cutaway: this._mode === 'build', highlight: this.highlight }, dt, camera);
    const hl = this.highlight;
    this.npcView.setHighlight(hl?.kind === 'npc' ? hl.id : null);
    this.debrisView.setHighlight(hl?.kind === 'debris' ? hl.id : null);
    this.npcView.sync(st, dt, hide, camera);
    this.debrisView.sync(st, dt, (x, z) => this.renderer.waterHeight(x, z));
    this.renderer.update(st, layout, dt, camera);
    if (this._mode === 'play') this.interaction.lateUpdate();
    this.renderer.render(camera);
    ui.update(dt);
    this.audio.update(dt);
  }

  private registerDebugCommands(): void {
    registerDebug('give', ((id: string, qty = 1) => addItem(this.sim.state.player.inventory, id, qty)) as never);
    registerDebug('giveAll', (() => {
      for (const id of Object.keys(ITEMS)) addItem(this.sim.state.player.inventory, id, 5);
    }) as never);
    registerDebug('unlockAll', (() => {
      for (const id of BLUEPRINT_ORDER) {
        const k = ITEMS[id]?.unlocks;
        if (k && !this.sim.state.unlocks.includes(k)) this.sim.state.unlocks.push(k);
      }
    }) as never);
    registerDebug('setHour', ((h: number) => {
      const st = this.sim.state;
      const day = Math.floor(st.time / 1440);
      st.time = day * 1440 + h * 60;
    }) as never);
    registerDebug('teleport', ((x: number, y: number, z: number) => {
      const p = this.sim.state.player.pos;
      p.x = x;
      p.y = y;
      p.z = z;
      this.player.reset();
    }) as never);
    registerDebug('look', ((yaw: number, pitch = 0) => {
      this.sim.state.player.yaw = yaw;
      this.sim.state.player.pitch = pitch;
    }) as never);
    registerDebug('advance', ((minutes: number) => {
      for (let m = 0; m < minutes; m += 30) this.sim.tick(Math.min(30, minutes - m));
    }) as never);
    registerDebug('step', ((frames = 1, dt = 1 / 60) => {
      for (let i = 0; i < frames; i++) {
        this.step(dt);
        this.input.endFrame();
      }
    }) as never);
    registerDebug('key', ((code: string, down: boolean) => this.input.injectKey(code, down)) as never);
    registerDebug('mouse', ((dx: number, dy: number) => this.input.injectMouse(dx, dy)) as never);
    registerDebug('mode', ((m: GameMode) => this.setMode(m)) as never);
    registerDebug('newGame', ((seed?: number) => this.newGame(seed)) as never);
    registerDebug('weather', ((kind: WeatherKind, minutes?: number) => forceWeather(this.sim, kind, minutes, true)) as never);
    registerDebug('route', ((regionId: string) => this.sim.chooseRoute(regionId)) as never);
    registerDebug('event', ((type: string) => events.startEvent(this.sim, type as events.EventType, { scripted: true })) as never);
    registerDebug('fire', ((moduleId: number) => {
      const m = this.sim.state.ship.modules.find((mm) => mm.id === moduleId);
      if (m) events.startFire(this.sim, m, 40);
    }) as never);
    registerDebug('survivor', (() => spawnSurvivor(this.sim)) as never);
  }
}

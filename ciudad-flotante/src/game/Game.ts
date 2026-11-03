/**
 * Pegamento principal: crea todas las piezas, gestiona modos (menú, juego, construcción,
 * muerte), atajos globales, guardado automático y el bucle de render/simulación.
 *
 * Guardado automático (ranura `auto`): al empezar cada día, cada AUTOSAVE_INTERVAL segundos reales
 * de partida y, sin aviso, al ocultar o cerrar la página (`visibilitychange`/`pagehide`), para que
 * recargar, cerrar la pestaña o publicar una versión nueva no cueste lo jugado: al volver, el menú
 * principal ofrece «Continuar». La partida se pausa sola al perder el foco (clic fuera del juego).
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
import { createLocalSaveStore, restoreState, SaveError, serialize, type SaveSlotInfo, type SaveStore } from '../sim/save';
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
import { modelNames, modelObject } from '../render/assets';

const SETTINGS_KEY = 'ciudad-flotante:settings';
const AUTOSAVE_SLOT = 'auto';
/** Guardado automático periódico: segundos reales de partida (sin contar la pausa) entre guardados. */
export const AUTOSAVE_INTERVAL = 300;
/** Por debajo de este ancho (px) la interfaz no cabe bien: se avisa en el menú principal. */
export const NARROW_WIDTH = 700;

/** ¿Deja el navegador escribir en `localStorage`? (iframe de origen opaco, modo privado estricto…) */
export function storageWritable(): boolean {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    if (!ls) return false;
    const k = 'ciudad-flotante:prueba';
    ls.setItem(k, '1');
    ls.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** Aviso al guardar a mano sin almacenamiento local. */
export const NO_STORAGE_MESSAGE = 'Este navegador no permite guardar partidas: la partida se perderá al cerrar la página';

export type NoticeKind = 'storage' | 'touch' | 'narrow';

/** Avisos del núcleo en el menú principal (no dependen de la interfaz). */
export const NOTICE_TEXT: Record<NoticeKind, { title: string; body: string }> = {
  storage: {
    title: 'Este navegador no deja guardar partidas',
    body: 'El almacenamiento local está bloqueado aquí. Puedes jugar, pero la partida se perderá al cerrar o recargar la página.',
  },
  touch: {
    title: 'Ciudad Flotante se juega con teclado y ratón',
    body: 'En una pantalla táctil verás los menús, pero no podrás mover al personaje ni mirar alrededor. Ábrelo en un ordenador.',
  },
  narrow: {
    title: 'La ventana es demasiado estrecha',
    body: 'La interfaz no cabe entera. Ciudad Flotante se juega con teclado y ratón: amplía la ventana o ábrela a pantalla completa.',
  },
};

/** Aviso de dispositivo: solo táctil (sin ningún puntero fino) o pantalla demasiado estrecha. */
export function deviceNotice(env: { coarse: boolean; fine: boolean; width: number }): 'touch' | 'narrow' | null {
  if (env.coarse && !env.fine) return 'touch';
  if (env.width > 0 && env.width < NARROW_WIDTH) return 'narrow';
  return null;
}

function media(q: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(q).matches;
  } catch {
    return false;
  }
}

/**
 * Capa propia del núcleo sobre el lienzo: avisos del menú principal (sin almacenamiento, pantalla
 * táctil o estrecha) y la pista del giro por el borde en mirada libre. No usa `src/ui`: solo las
 * clases base (`panel`, `btn`) y las variables de `base.css`.
 */
export class CoreOverlay {
  readonly root: HTMLDivElement;
  private readonly notices: HTMLDivElement;
  private readonly edges: Record<'left' | 'right' | 'top' | 'bottom', HTMLDivElement>;
  private readonly dismissed = new Set<NoticeKind>();
  private shown = '';

  constructor(container: HTMLElement) {
    const root = document.createElement('div');
    root.className = 'core-overlay';
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:80;font-family:var(--font);';
    const notices = document.createElement('div');
    notices.className = 'core-notices';
    notices.setAttribute('role', 'status');
    notices.setAttribute('aria-live', 'polite');
    notices.style.cssText =
      'position:absolute;top:16px;left:50%;transform:translateX(-50%);width:min(520px,calc(100% - 32px));display:flex;flex-direction:column;gap:10px;';
    root.appendChild(notices);
    const edge = (side: 'left' | 'right' | 'top' | 'bottom'): HTMLDivElement => {
      const d = document.createElement('div');
      d.className = `core-edge core-edge-${side}`;
      const horiz = side === 'left' || side === 'right';
      const dir = { left: 'to right', right: 'to left', top: 'to bottom', bottom: 'to top' }[side];
      d.style.cssText =
        `position:absolute;${side}:0;${horiz ? 'top:0;bottom:0;width:84px' : 'left:0;right:0;height:64px'};opacity:0;` +
        `transition:opacity .15s;display:flex;align-items:center;justify-content:center;` +
        `background:linear-gradient(${dir},rgba(246,239,224,.38),rgba(246,239,224,0));`;
      // Chevrón hacia el lado del giro.
      const rot = { right: 0, bottom: 90, left: 180, top: 270 }[side];
      d.innerHTML =
        `<svg width="26" height="44" viewBox="0 0 26 44" style="transform:rotate(${rot}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,.55))">` +
        `<path d="M5 4 L21 22 L5 40" fill="none" stroke="#f6efe0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      root.appendChild(d);
      return d;
    };
    this.edges = { left: edge('left'), right: edge('right'), top: edge('top'), bottom: edge('bottom') };
    container.appendChild(root);
    this.root = root;
    this.notices = notices;
  }

  /** Avisos visibles ahora (los descartados con «Entendido» no vuelven en esta sesión). */
  get visibleNotices(): NoticeKind[] {
    return this.shown ? (this.shown.split(',') as NoticeKind[]) : [];
  }

  setNotices(kinds: NoticeKind[]): void {
    const list = kinds.filter((k) => !this.dismissed.has(k));
    const key = list.join(',');
    if (key === this.shown) return;
    this.shown = key;
    this.notices.replaceChildren();
    for (const k of list) {
      const t = NOTICE_TEXT[k];
      const card = document.createElement('div');
      card.className = 'panel core-notice';
      card.dataset['notice'] = k;
      card.style.cssText = 'pointer-events:auto;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;font-size:14px;line-height:1.4;';
      const text = document.createElement('div');
      text.style.cssText = 'flex:1;min-width:0;';
      const title = document.createElement('div');
      title.style.cssText = 'font-weight:800;color:var(--warn);margin-bottom:2px;';
      title.textContent = t.title;
      const body = document.createElement('div');
      body.style.cssText = 'color:var(--ink-dim);';
      body.textContent = t.body;
      text.append(title, body);
      const ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn';
      ok.textContent = 'Entendido';
      ok.style.cssText = 'flex:none;';
      ok.addEventListener('click', () => {
        this.dismissed.add(k);
        this.setNotices(list);
      });
      card.append(text, ok);
      this.notices.appendChild(card);
    }
  }

  /** Pista del giro por el borde (−1..1 por eje), o null para ocultarla. */
  setEdges(turn: { x: number; y: number } | null): void {
    const x = turn?.x ?? 0;
    const y = turn?.y ?? 0;
    const op = (v: number) => (v > 0 ? String(Math.min(1, 0.35 + v * 0.65)) : '0');
    this.edges.left.style.opacity = op(-x);
    this.edges.right.style.opacity = op(x);
    this.edges.top.style.opacity = op(-y);
    this.edges.bottom.style.opacity = op(y);
  }
}

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
  /** Segundos reales de partida (sin pausa) desde el último guardado. */
  private autosaveClock = 0;
  /** El navegador deja guardar (se comprueba al arrancar). */
  readonly storageOk: boolean;
  /** Tipos de error de guardado ya escritos en la consola (una vez cada uno). */
  private readonly saveErrorsLogged = new Set<string>();
  private clickHintShown = false;
  private freeLookHintShown = false;
  readonly overlay: CoreOverlay;
  /** Aviso de dispositivo (pantalla táctil o estrecha); se recalcula al cambiar el tamaño. */
  private deviceKind: 'touch' | 'narrow' | null = null;
  private fpsAcc = 0;
  private fpsFrames = 0;
  fps = 0;

  constructor(private readonly container: HTMLElement) {
    this.settings = this.loadSettings();
    // Parámetro de URL ?quality=baja|media|alta (pruebas automáticas, equipos lentos). No se guarda.
    const q = new URLSearchParams(location.search).get('quality');
    if (q === 'baja' || q === 'media' || q === 'alta') this.settings.quality = q;
    this.saves = createLocalSaveStore();
    this.storageOk = storageWritable();
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
    this.overlay = new CoreOverlay(container);
    this.audio = new Audio(this);
    // Cada estallido de los fuegos de Puerto Esperanza suena en su posición (marco del océano ≈ local).
    this.renderer.onFirework = (x, y, z) => this.bus.emit('sfx', { name: 'fuego_artificial', x, y, z });

    this.bus.on('playerDied', () => this.setMode('dead'));
    this.bus.on('newDay', () => this.autosave());
    window.addEventListener('resize', () => this.onResize());
    // Guardar al ocultar o cerrar la página (recargar, cerrar la pestaña, publicar una versión nueva).
    // Es síncrono y corto (unos KB en localStorage); no se usa `beforeunload`, que puede bloquear.
    window.addEventListener('pagehide', () => this.saveOnHide());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveOnHide();
    });
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
      // En el menú no se ve el personaje; al morir en primera persona tampoco (la cámara está en su cabeza;
      // pasa sobre todo al morir en el modo construcción, donde el avatar estaba visible).
      if (mode === 'menu' || this.player.perspective === 'first') this.avatar.object.visible = false;
    }
    if (mode === 'dead') this.ui.showDeath();
    if (mode === 'play') this.ui.hideMenus();
    // Los avisos del núcleo son del menú principal: fuera de él se retiran ya (no al frame siguiente).
    if (mode !== 'menu') this.overlay?.setNotices([]);
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
    this.autosaveClock = 0;
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
    const err = this.writeSave(slot);
    if (err === null) {
      this.bus.emit('saved', { slot });
      this.sim.notify(slot === AUTOSAVE_SLOT ? 'Partida guardada automáticamente' : 'Partida guardada', 'good');
      return;
    }
    // Los fallos conocidos (sin almacenamiento, sin espacio) traen un mensaje claro para el jugador;
    // en la consola quedan una sola vez, como aviso.
    if (err instanceof SaveError) {
      this.logSaveError(err.kind, err.message);
      // Sin almacenamiento el mensaje del navegador puede venir en inglés: uno fijo y claro.
      this.sim.notify(err.kind === 'unavailable' && !this.storageOk ? NO_STORAGE_MESSAGE : err.message, 'danger');
    } else {
      console.error(err);
      this.sim.notify('No se pudo guardar la partida', 'danger');
    }
  }

  /** Escribe la partida en una ranura sin avisar. Devuelve el error o null si se guardó. */
  private writeSave(slot: string): unknown {
    try {
      this.sim.syncRng();
      this.saves.save(slot, this.sim.state);
      this.autosaveClock = 0;
      return null;
    } catch (e) {
      return e ?? new Error('error desconocido al guardar');
    }
  }

  private logSaveError(kind: string, message: string): void {
    if (this.saveErrorsLogged.has(kind)) return;
    this.saveErrorsLogged.add(kind);
    console.warn(`[Game] ${message}`);
  }

  /** ¿Hay una partida en curso que merezca guardarse sola? */
  private get inGame(): boolean {
    return (this._mode === 'play' || this._mode === 'build') && this.sim.state.player.alive;
  }

  /** Guardado automático con aviso (nuevo día, periódico). Sin almacenamiento ya se avisó en el menú. */
  private autosave(): void {
    if (this.inGame && this.storageOk) this.saveGame(AUTOSAVE_SLOT);
  }

  /**
   * La página se oculta o se cierra: se guarda en la ranura automática sin aviso (nadie lo vería).
   * «Salir sin guardar» deja el modo en 'menu', así que no escribe nada.
   */
  saveOnHide(): void {
    if (!this.inGame || !this.storageOk) return;
    const err = this.writeSave(AUTOSAVE_SLOT);
    if (err !== null) this.logSaveError(err instanceof SaveError ? err.kind : 'hide', err instanceof SaveError ? err.message : `No se pudo guardar al salir: ${String(err)}`);
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
   * (gancho opcional `window.claude.hot`; ver main.ts). null si no hay partida en marcha.
   */
  snapshot(): { state: string; mode: GameMode; paused: boolean } | null {
    if (this._mode !== 'play' && this._mode !== 'build') return null;
    this.sim.syncRng();
    return { state: serialize(this.sim.state), mode: this._mode, paused: this.paused };
  }

  /**
   * Restaura una instantánea de `snapshot()` en su modo (también el de construcción). Tras
   * republicar no ha habido ningún gesto del jugador, así que la partida vuelve SIEMPRE en pausa
   * (aunque se guardara en marcha): no corre sola mientras el jugador lee el chat, y «Continuar»
   * es el clic que devuelve el ratón y el sonido. Devuelve false si no es válida.
   */
  restoreSnapshot(snap: { state?: unknown; mode?: unknown; paused?: unknown } | null | undefined): boolean {
    if (!snap || typeof snap.state !== 'string') return false;
    try {
      const st = restoreState(JSON.parse(snap.state));
      this.replaceSim(new Simulation(st, this.bus), 'load');
    } catch (e) {
      console.warn('[Game] no se pudo restaurar la instantánea', e);
      return false;
    }
    if (!this.sim.state.player.alive) {
      this.setMode('dead');
      return true;
    }
    if (snap.mode === 'build' && !this.sim.state.player.sleeping) this.setMode('build');
    this.pause();
    return true;
  }

  /** Pausa con el menú de pausa (cierra el panel abierto). */
  private pause(): void {
    this.paused = true;
    this.ui.showPauseMenu();
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
    this.deviceKind = deviceNotice({ coarse: media('(pointer: coarse)'), fine: media('(any-pointer: fine)'), width: this.container.clientWidth || window.innerWidth });
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
    // Se leen en todos los modos: una señal vieja (p. ej. del menú) no debe pausar la partida al empezar.
    const lockLost = inp.consumeLockLost();
    const focusLost = inp.consumeFocusLost();
    if (this._mode === 'menu' || this._mode === 'dead') return;
    // Con el ratón capturado, el navegador se queda la tecla Esc: lo detectamos por la pérdida de captura.
    if (lockLost && this._mode === 'play' && !ui.panelOpen && !this.paused) {
      this.pause();
      return;
    }
    // Sin captura (mirada libre, panel abierto, construcción) un clic fuera del juego no suelta
    // nada y las teclas dejan de llegar: se pausa al perder el foco para que la partida no siga
    // sola. Al volver, el clic cae en el menú de pausa, no en la herramienta.
    if (focusLost && !this.paused) {
      this.pause();
      return;
    }
    if (inp.pressed('Escape')) {
      // En pausa (también en el modo construcción, tras perder el foco o republicar) Esc la quita.
      if (this.paused) {
        this.paused = false;
        ui.hideMenus();
      } else if (this._mode === 'build') {
        if (!this.build.cancel()) this.setMode('play');
      } else if (ui.panelOpen) ui.closePanel();
      else this.pause();
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
    const real = Math.max(0, (t - this.last) / 1000);
    const dt = Math.min(0.1, real);
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
      // Guardado periódico en tiempo REAL (el `dt` recortado a 0,1 s contaría de menos por debajo
      // de 10 fps). Va aquí y no en step(): `cmd.step` de las pruebas no escribe partidas.
      this.tickAutosave(real);
    } catch (e) {
      console.error('[Game] error en el frame', e);
    }
    this.input.endFrame();
  }

  /** Suma tiempo real de partida (sin pausa) y guarda cada AUTOSAVE_INTERVAL s. */
  tickAutosave(realDt: number): void {
    if (!this.inGame || this.paused) return;
    // Un salto largo (pestaña oculta, depurador) no cuenta como partida: ya se guardó al ocultarla.
    this.autosaveClock += Math.min(1, Math.max(0, Number.isFinite(realDt) ? realDt : 0));
    if (this.autosaveClock >= AUTOSAVE_INTERVAL) {
      this.autosaveClock = 0;
      this.autosave();
    }
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
    if (this.input.freeLook && !this.freeLookHintShown) {
      this.freeLookHintShown = true;
      ui.toast('Sin captura del ratón: lleva el cursor al borde de la pantalla o usa ← → para girar', 'info');
    }
    if (playing && !this.paused) {
      if (this._mode === 'play') {
        this.player.update(dt);
        this.interaction.update(dt);
      } else {
        this.player.update(0);
        this.build.update(dt);
      }
      this.sim.tick(dt * TIME_SCALE * this.sim.timeScale);
    }
    this.updateOverlay();
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

  /** Avisos del menú principal y pista del giro por el borde (capa del núcleo). */
  private updateOverlay(): void {
    const ov = this.overlay;
    const lookEdges = this._mode === 'play' && !this.paused && this.input.freeLook && !this.ui.panelOpen && !this.ui.menuOpen;
    ov.setEdges(lookEdges ? this.player.edgeTurn : null);
    if (this._mode !== 'menu') {
      ov.setNotices([]);
      return;
    }
    const kinds: NoticeKind[] = [];
    if (!this.storageOk) kinds.push('storage');
    if (this.deviceKind) kinds.push(this.deviceKind);
    ov.setNotices(kinds);
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
    // Vista previa de modelos de Blender: models() los lista; showModel('barril', 2) lo pone a
    // 2 m delante del jugador (a la altura de sus pies, mirándole); clearModels() los quita.
    registerDebug('models', (() => modelNames()) as never);
    registerDebug('showModel', ((name: string, dist = 2.5, side = 0) => {
      const obj = modelObject(name);
      if (!obj) return `No existe el modelo «${name}» (models() da la lista)`;
      const pl = this.sim.state.player;
      const fx = -Math.sin(pl.yaw);
      const fz = -Math.cos(pl.yaw);
      obj.position.set(pl.pos.x + fx * dist - fz * side, pl.pos.y, pl.pos.z + fz * dist + fx * side);
      obj.rotation.y = pl.yaw + Math.PI;
      obj.userData['preview'] = true;
      this.renderer.shipRoot.add(obj);
      return name;
    }) as never);
    registerDebug('clearModels', (() => {
      const gone = this.renderer.shipRoot.children.filter((o) => o.userData['preview']);
      for (const o of gone) this.renderer.shipRoot.remove(o);
      return gone.length;
    }) as never);
  }
}

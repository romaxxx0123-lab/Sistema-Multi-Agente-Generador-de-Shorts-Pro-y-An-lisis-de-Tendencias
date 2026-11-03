/**
 * Pruebas del núcleo (Game, Input, mirada libre): guardado al ocultar o cerrar la página y
 * periódico en tiempo real, instantáneas de `window.claude.hot` (pausa y modo), pausa al perder el
 * foco, giro por el borde en mirada libre, guardado sin almacenamiento y avisos de dispositivo.
 *
 * `Game` no se puede construir en Node (necesita WebGL y DOM): se prueba su lógica sobre un objeto
 * con su prototipo y colaboradores falsos (`fakeGame`).
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext } from '../src/game/context';
import { AUTOSAVE_INTERVAL, deviceNotice, Game, NARROW_WIDTH, NO_STORAGE_MESSAGE, NOTICE_TEXT, storageWritable } from '../src/game/Game';
import { Input } from '../src/game/Input';
import { EDGE_BAND_MIN, EDGE_YAW_SPEED, edgeFactor, KEY_YAW_SPEED, LOOK_GRACE_TIME, PlayerController } from '../src/game/PlayerController';
import { DEFAULT_SETTINGS, type GameMode, type Settings } from '../src/game/types';
import type { PlayerAvatar } from '../src/render/PlayerAvatar';
import { LEVEL_H } from '../src/sim/constants';
import { createNewGame } from '../src/sim/newGame';
import { createLocalSaveStore, type StorageLike } from '../src/sim/save';
import { Simulation } from '../src/sim/Simulation';

/* ---------------------------------------------------------------------- */
/* Utilidades                                                              */
/* ---------------------------------------------------------------------- */

class MemoryStorage implements StorageLike {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

/** Almacenamiento que no deja escribir (iframe de origen opaco, modo privado estricto). */
class DeniedStorage extends MemoryStorage {
  override setItem(): void {
    throw Object.assign(new Error('The operation is insecure.'), { name: 'SecurityError' });
  }
}

/** Objeto que acepta cualquier método (devuelve undefined) salvo los que se le dan. */
function stub<T extends object>(props: T): T {
  return new Proxy(props, {
    get(t, k) {
      if (k in t) return (t as Record<string | symbol, unknown>)[k];
      return () => undefined;
    },
  });
}

class FakeGameInput {
  enabled = true;
  awaitingClick = false;
  freeLook = false;
  locked = false;
  lockLost = false;
  focusLost = false;
  wanted = false;
  private keys = new Set<string>();
  press(code: string): void {
    this.keys.add(code);
  }
  pressed(code: string): boolean {
    return this.keys.has(code);
  }
  consume(code: string): void {
    this.keys.delete(code);
  }
  consumeLockLost(): boolean {
    const v = this.lockLost;
    this.lockLost = false;
    return v;
  }
  consumeFocusLost(): boolean {
    const v = this.focusLost;
    this.focusLost = false;
    return v;
  }
  setPointerLockWanted(w: boolean): void {
    this.wanted = w;
  }
  wheel(): number {
    return 0;
  }
  down(): boolean {
    return false;
  }
  endFrame(): void {
    this.keys.clear();
  }
}

interface FakeUi {
  panelOpen: boolean;
  menuOpen: boolean;
  pauseShown: number;
  toasts: string[];
}

/** Lo que las pruebas tocan de Game (miembros privados incluidos). */
interface GameUnderTest {
  sim: Simulation;
  paused: boolean;
  readonly mode: GameMode;
  _mode: GameMode;
  storageOk: boolean;
  autosaveClock: number;
  saves: ReturnType<typeof createLocalSaveStore>;
  step(dt: number): void;
  tickAutosave(realDt: number): void;
  saveOnHide(): void;
  saveGame(slot?: string): void;
  setMode(m: GameMode): void;
  newGame(seed?: number): void;
  snapshot(): { state: string; mode: GameMode; paused: boolean } | null;
  restoreSnapshot(s: unknown): boolean;
  autosave(): void;
}

interface FakeGame {
  game: GameUnderTest;
  input: FakeGameInput;
  ui: FakeUi;
  storage: MemoryStorage;
  notes: string[];
  build: { active: boolean };
  frame(n?: number, dt?: number): void;
}

function fakeGame(opts: { storage?: MemoryStorage; mode?: GameMode } = {}): FakeGame {
  const storage = opts.storage ?? new MemoryStorage();
  const sim = new Simulation(createNewGame(1));
  const notes: string[] = [];
  const input = new FakeGameInput();
  const ui: FakeUi & Record<string, unknown> = {
    panelOpen: false,
    menuOpen: false,
    pauseShown: 0,
    toasts: [],
    showPauseMenu() {
      this.panelOpen = false;
      this.menuOpen = true;
      this.pauseShown++;
    },
    hideMenus() {
      this.menuOpen = false;
    },
    showDeath() {
      this.menuOpen = true;
    },
    closePanel() {
      this.panelOpen = false;
    },
    toast(t: string) {
      this.toasts.push(t);
    },
  };
  const build = { active: false };
  const camera = new THREE.PerspectiveCamera();
  const g = Object.create(Game.prototype) as GameUnderTest & Record<string, unknown>;
  Object.assign(g, {
    bus: sim.bus,
    sim,
    _mode: opts.mode ?? 'play',
    paused: false,
    highlight: null,
    saves: createLocalSaveStore('ciudad-flotante', storage),
    storageOk: !(storage instanceof DeniedStorage),
    saveErrorsLogged: new Set<string>(),
    autosaveClock: 0,
    clickHintShown: false,
    freeLookHintShown: false,
    deviceKind: null,
    settings: { ...DEFAULT_SETTINGS } as Settings,
    container: { clientWidth: 1280, clientHeight: 720 },
    input,
    ui: stub(ui),
    player: stub({ camera, edgeTurn: { x: 0, y: 0 }, perspective: 'first' }),
    interaction: stub({}),
    build: stub({
      camera,
      hideAboveLevel: null,
      enter: () => (build.active = true),
      exit: () => (build.active = false),
      cancel: () => false,
    }),
    shipView: stub({}),
    npcView: stub({}),
    debrisView: stub({}),
    renderer: stub({ waterHeight: () => 0 }),
    audio: stub({}),
    avatar: { object: { visible: true } },
    overlay: stub({}),
  });
  // newGame/restoreSnapshot crean otra Simulation con el mismo bus: los avisos siguen llegando.
  sim.bus.on('notify', (e) => notes.push(e.text));
  const frame = (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) {
      g.step(dt);
      input.endFrame();
    }
  };
  return { game: g, input, ui, storage, notes, build, frame };
}

const AUTO_KEY = 'ciudad-flotante:save:auto';

/* ---------------------------------------------------------------------- */
/* 1. Guardar al ocultar o cerrar la página                                */
/* ---------------------------------------------------------------------- */

describe('[nucleo-1] guardado al ocultar o cerrar la página y periódico en tiempo real', () => {
  it('ocultar/cerrar guarda en la ranura automática, sin aviso, solo con una partida en marcha', () => {
    const f = fakeGame();
    f.game.sim.state.time = 600;
    f.game.saveOnHide();
    const raw = f.storage.getItem(AUTO_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.time).toBe(600);
    expect(f.notes).toEqual([]);
    // Tras recargar, el menú lo ofrece («Continuar» usa la partida más reciente).
    expect(f.game.saves.list().map((s) => s.slot)).toEqual(['auto']);
    // En construcción también.
    f.storage.removeItem(AUTO_KEY);
    f.game.setMode('build');
    f.game.saveOnHide();
    expect(f.storage.getItem(AUTO_KEY)).not.toBeNull();
  });

  it('no guarda en el menú («Salir sin guardar»), muerto ni sin almacenamiento', () => {
    const f = fakeGame({ mode: 'menu' });
    f.game.saveOnHide();
    expect(f.storage.getItem(AUTO_KEY)).toBeNull();
    const d = fakeGame();
    d.game.sim.state.player.alive = false;
    d.game.saveOnHide();
    expect(d.storage.getItem(AUTO_KEY)).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const n = fakeGame({ storage: new DeniedStorage() });
    n.game.saveOnHide();
    expect(n.notes).toEqual([]);
    expect(err).not.toHaveBeenCalled();
    warn.mockRestore();
    err.mockRestore();
  });

  it('el guardado periódico cuenta tiempo real de partida (no el dt recortado) y no la pausa', () => {
    const f = fakeGame();
    // A 4 fps (0,25 s por frame) el dt de la simulación se recorta a 0,1 s, pero cuenta el real.
    const frames = AUTOSAVE_INTERVAL / 0.25;
    for (let i = 0; i < frames - 2; i++) f.game.tickAutosave(0.25);
    expect(f.storage.getItem(AUTO_KEY)).toBeNull();
    f.game.paused = true;
    for (let i = 0; i < 100; i++) f.game.tickAutosave(0.25);
    expect(f.storage.getItem(AUTO_KEY)).toBeNull();
    f.game.paused = false;
    f.game.tickAutosave(0.25);
    expect(f.storage.getItem(AUTO_KEY)).toBeNull();
    f.game.tickAutosave(0.25);
    expect(f.storage.getItem(AUTO_KEY)).not.toBeNull();
    expect(f.notes).toContain('Partida guardada automáticamente');
    expect(f.game.autosaveClock).toBe(0);
    // Un salto largo (pestaña oculta) cuenta como mucho 1 s.
    f.game.tickAutosave(3600);
    expect(f.game.autosaveClock).toBe(1);
  });

  it('step() (lo que usa cmd.step en las pruebas) no escribe partidas', () => {
    const f = fakeGame();
    f.frame(400, 1);
    expect(f.storage.getItem(AUTO_KEY)).toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* 2. window.claude.hot: pausa y modo                                      */
/* ---------------------------------------------------------------------- */

describe('[nucleo-2] la instantánea de hot conserva la pausa y el modo, y no corre sola', () => {
  it('la instantánea lleva la pausa; al restaurar vuelve en pausa y el reloj no avanza', () => {
    const a = fakeGame();
    a.game.sim.state.time = 420;
    a.game.paused = true;
    const snap = a.game.snapshot()!;
    expect(snap.paused).toBe(true);
    expect(snap.mode).toBe('play');
    const b = fakeGame({ mode: 'menu' });
    expect(b.game.restoreSnapshot(snap)).toBe(true);
    expect(b.game.mode).toBe('play');
    expect(b.game.paused).toBe(true);
    expect(b.ui.pauseShown).toBe(1);
    b.frame(600);
    expect(b.game.sim.state.time).toBeCloseTo(420, 6);
    // Esc (o «Continuar») la quita.
    b.input.press('Escape');
    b.frame();
    expect(b.game.paused).toBe(false);
    b.frame(60);
    expect(b.game.sim.state.time).toBeGreaterThan(420.5);
  });

  it('una partida guardada en marcha también vuelve en pausa (no hubo ningún gesto)', () => {
    const a = fakeGame();
    const b = fakeGame({ mode: 'menu' });
    b.game.restoreSnapshot(a.game.snapshot());
    expect(b.game.paused).toBe(true);
  });

  it('en el modo construcción vuelve al modo construcción (en pausa); Esc quita la pausa sin salir', () => {
    const a = fakeGame();
    a.game.setMode('build');
    const snap = a.game.snapshot()!;
    expect(snap.mode).toBe('build');
    const b = fakeGame({ mode: 'menu' });
    b.game.restoreSnapshot(snap);
    expect(b.game.mode).toBe('build');
    expect(b.build.active).toBe(true);
    expect(b.game.paused).toBe(true);
    const t0 = b.game.sim.state.time;
    b.frame(120);
    expect(b.game.sim.state.time).toBe(t0);
    b.input.press('Escape');
    b.frame();
    expect(b.game.paused).toBe(false);
    expect(b.game.mode).toBe('build');
  });

  it('una instantánea con el jugador muerto vuelve a la pantalla de muerte, sin pausa', () => {
    const a = fakeGame();
    a.game.sim.state.player.alive = false;
    const b = fakeGame({ mode: 'menu' });
    b.game.restoreSnapshot(a.game.snapshot());
    expect(b.game.mode).toBe('dead');
    expect(b.game.paused).toBe(false);
  });

  it('instantáneas inválidas no cambian nada', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const b = fakeGame({ mode: 'menu' });
    expect(b.game.restoreSnapshot(null)).toBe(false);
    expect(b.game.restoreSnapshot({ state: '{roto' })).toBe(false);
    expect(b.game.mode).toBe('menu');
    warn.mockRestore();
  });
});

/* ---------------------------------------------------------------------- */
/* 3. Pausa al perder el foco                                              */
/* ---------------------------------------------------------------------- */

describe('[nucleo-3] al perder el foco (clic fuera) la partida se pausa', () => {
  it('jugando: pausa con el menú y el reloj se para', () => {
    const f = fakeGame();
    f.frame(5);
    f.input.focusLost = true;
    f.frame();
    expect(f.game.paused).toBe(true);
    expect(f.ui.pauseShown).toBe(1);
    const t0 = f.game.sim.state.time;
    f.frame(300);
    expect(f.game.sim.state.time).toBe(t0);
    // Una segunda pérdida con la pausa puesta no hace nada más.
    f.input.focusLost = true;
    f.frame();
    expect(f.ui.pauseShown).toBe(1);
  });

  it('con un panel abierto y en construcción también', () => {
    const p = fakeGame();
    p.ui.panelOpen = true;
    p.input.focusLost = true;
    p.frame();
    expect(p.game.paused).toBe(true);
    expect(p.ui.panelOpen).toBe(false);
    const b = fakeGame();
    b.game.setMode('build');
    b.input.focusLost = true;
    b.frame();
    expect(b.game.paused).toBe(true);
    expect(b.game.mode).toBe('build');
  });

  it('con captura, perder la captura y el foco a la vez pausa una sola vez', () => {
    const f = fakeGame();
    f.input.lockLost = true;
    f.input.focusLost = true;
    f.frame();
    expect(f.ui.pauseShown).toBe(1);
    f.frame();
    expect(f.ui.pauseShown).toBe(1);
  });

  it('una pérdida de foco en el menú se descarta y no pausa la partida siguiente', () => {
    const f = fakeGame({ mode: 'menu' });
    f.input.focusLost = true;
    f.frame();
    f.game.setMode('play');
    f.frame();
    expect(f.game.paused).toBe(false);
  });
});

/* ---------------------------------------------------------------------- */
/* 4. Sin almacenamiento local                                             */
/* ---------------------------------------------------------------------- */

describe('[nucleo-4] sin almacenamiento local: aviso claro y sin errores en consola', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let err: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    err = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    warn.mockRestore();
    err.mockRestore();
  });

  it('guardar a mano muestra el motivo concreto; la consola solo avisa una vez', () => {
    const f = fakeGame({ storage: new DeniedStorage() });
    expect(f.game.storageOk).toBe(false);
    f.game.saveGame('manual');
    f.game.saveGame('auto'); // «Guardar y salir» del menú de pausa
    expect(f.notes).toEqual([NO_STORAGE_MESSAGE, NO_STORAGE_MESSAGE]);
    expect(err).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('los guardados automáticos no lo intentan (ya se avisó en el menú)', () => {
    const f = fakeGame({ storage: new DeniedStorage() });
    f.game.autosave();
    for (let i = 0; i < 400; i++) f.game.tickAutosave(1);
    f.game.saveOnHide();
    expect(f.notes).toEqual([]);
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('storageWritable detecta el almacenamiento bloqueado o ausente', () => {
    const g = globalThis as { localStorage?: unknown };
    const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
      expect(storageWritable()).toBe(true);
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new DeniedStorage() });
      expect(storageWritable()).toBe(false);
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw Object.assign(new Error('denied'), { name: 'SecurityError' });
        },
      });
      expect(storageWritable()).toBe(false);
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
      expect(storageWritable()).toBe(false);
    } finally {
      if (prev) Object.defineProperty(globalThis, 'localStorage', prev);
      else delete g.localStorage;
    }
  });
});

/* ---------------------------------------------------------------------- */
/* 5. Avisos de dispositivo                                                */
/* ---------------------------------------------------------------------- */

describe('[nucleo-5] aviso en pantallas táctiles o estrechas', () => {
  it('solo táctil o demasiado estrecha; un portátil con pantalla táctil y ratón, no', () => {
    expect(deviceNotice({ coarse: true, fine: false, width: 390 })).toBe('touch');
    expect(deviceNotice({ coarse: true, fine: false, width: 1366 })).toBe('touch');
    expect(deviceNotice({ coarse: true, fine: true, width: 1366 })).toBeNull();
    expect(deviceNotice({ coarse: false, fine: true, width: NARROW_WIDTH - 1 })).toBe('narrow');
    expect(deviceNotice({ coarse: false, fine: true, width: 800 })).toBeNull();
    expect(deviceNotice({ coarse: false, fine: true, width: 0 })).toBeNull();
  });

  it('los avisos dicen que se juega con teclado y ratón', () => {
    expect(NOTICE_TEXT.touch.title).toMatch(/teclado y ratón/);
    expect(NOTICE_TEXT.narrow.body).toMatch(/teclado y ratón/);
    expect(NOTICE_TEXT.storage.body).toMatch(/se perderá/);
  });
});

/* ---------------------------------------------------------------------- */
/* 6. Input: foco y cursor dentro de la página                             */
/* ---------------------------------------------------------------------- */

describe('[nucleo-6] Input avisa de la pérdida de foco y de que el cursor sale de la página', () => {
  const g = globalThis as Record<string, unknown>;
  let saved: Record<string, PropertyDescriptor | undefined>;
  beforeEach(() => {
    saved = { window: Object.getOwnPropertyDescriptor(g, 'window'), document: Object.getOwnPropertyDescriptor(g, 'document') };
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { pointerLockElement: null, exitPointerLock() {} });
    Object.defineProperty(g, 'window', { configurable: true, value: win });
    Object.defineProperty(g, 'document', { configurable: true, value: doc });
  });
  afterEach(() => {
    for (const k of ['window', 'document']) {
      const d = saved[k];
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
  });
  const ev = (type: string, props: Record<string, unknown> = {}) => Object.assign(new Event(type), props);
  function makeInput(): Input {
    const el = Object.assign(new EventTarget(), {
      style: {} as Record<string, string>,
      clientWidth: 800,
      clientHeight: 600,
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    });
    return new Input(el as unknown as HTMLElement);
  }

  it('blur: suelta las teclas, marca el foco perdido una vez y el cursor fuera', () => {
    const inp = makeInput();
    const win = g['window'] as EventTarget;
    win.dispatchEvent(ev('keydown', { code: 'KeyW' }));
    win.dispatchEvent(ev('mousemove', { clientX: 400, clientY: 300, movementX: 0, movementY: 0 }));
    expect(inp.down('KeyW')).toBe(true);
    expect(inp.pointerInside).toBe(true);
    expect(inp.consumeFocusLost()).toBe(false);
    win.dispatchEvent(ev('blur'));
    expect(inp.down('KeyW')).toBe(false);
    expect(inp.pointerInside).toBe(false);
    expect(inp.consumeFocusLost()).toBe(true);
    expect(inp.consumeFocusLost()).toBe(false);
    expect(inp.viewWidth).toBe(800);
    expect(inp.viewHeight).toBe(600);
  });

  it('salir por un borde (mouseout sin destino) deja el cursor fuera; moverse entre elementos no', () => {
    const inp = makeInput();
    const win = g['window'] as EventTarget;
    win.dispatchEvent(ev('mousemove', { clientX: 3, clientY: 300, movementX: -5, movementY: 0 }));
    win.dispatchEvent(ev('mouseout', { relatedTarget: {} }));
    expect(inp.pointerInside).toBe(true);
    win.dispatchEvent(ev('mouseout', { relatedTarget: null }));
    expect(inp.pointerInside).toBe(false);
    // Fuera, mouseX se queda en el borde (3 px): por eso hace falta pointerInside.
    expect(inp.mouseX).toBe(3);
    win.dispatchEvent(ev('mouseover'));
    expect(inp.pointerInside).toBe(true);
  });
});

/* ---------------------------------------------------------------------- */
/* 7. Mirada libre: giro por el borde y con ← →                            */
/* ---------------------------------------------------------------------- */

class FreeLookInput {
  enabled = true;
  locked = false;
  freeLook = true;
  pointerInside = true;
  viewWidth = 800;
  viewHeight = 600;
  mouseX = 400;
  mouseY = 300;
  dx = 0;
  dy = 0;
  private held = new Set<string>();
  private justDown = new Set<string>();
  key(code: string, down: boolean): void {
    if (down) {
      if (!this.held.has(code)) this.justDown.add(code);
      this.held.add(code);
    } else this.held.delete(code);
  }
  down(c: string): boolean {
    return this.held.has(c);
  }
  pressed(c: string): boolean {
    return this.justDown.has(c);
  }
  released(): boolean {
    return false;
  }
  consume(c: string): void {
    this.justDown.delete(c);
  }
  mouseDelta(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }
  wheel(): number {
    return 0;
  }
  endFrame(): void {
    this.justDown.clear();
    this.dx = 0;
    this.dy = 0;
  }
}

describe('[nucleo-7] mirada libre: se puede dar la vuelta entera', () => {
  it('edgeFactor: 0 en el centro, ±1 pegado al borde, franja mínima en pantallas pequeñas', () => {
    expect(edgeFactor(400, 800)).toBe(0);
    expect(edgeFactor(0, 800)).toBe(-1);
    expect(edgeFactor(800, 800)).toBe(1);
    expect(edgeFactor(-20, 800)).toBe(-1);
    expect(edgeFactor(32, 800)).toBeCloseTo(-0.5);
    expect(edgeFactor(800 - 32, 800)).toBeCloseTo(0.5);
    // 8 % de 200 px son 16 px: se usa la franja mínima.
    expect(edgeFactor(EDGE_BAND_MIN - 1, 200)).toBeLessThan(0);
    expect(edgeFactor(5, 0)).toBe(0);
    expect(edgeFactor(Number.NaN, 800)).toBe(0);
  });

  function setup(): { pc: PlayerController; input: FreeLookInput; sim: Simulation; frame(n?: number): void } {
    const sim = new Simulation(createNewGame(1));
    const st = sim.state.player;
    st.pos = { x: 4, y: LEVEL_H, z: -6 };
    st.yaw = 0;
    st.pitch = 0;
    const input = new FreeLookInput();
    const ctx = {
      sim,
      bus: sim.bus,
      input,
      ui: { panelOpen: false },
      mode: 'play',
      settings: { ...DEFAULT_SETTINGS },
      renderer: { shipRoot: new THREE.Group() },
      interaction: { hideViewModel() {}, toast() {} },
    } as unknown as GameContext;
    const avatar = { update() {}, object: new THREE.Group(), rig: { rodTip: () => null } } as unknown as PlayerAvatar;
    const pc = new PlayerController(ctx, avatar);
    const frame = (n = 1) => {
      for (let i = 0; i < n; i++) {
        pc.update(1 / 60);
        input.endFrame();
      }
    };
    // Pasar el margen de gracia del primer frame con control.
    frame(Math.ceil(LOOK_GRACE_TIME * 60) + 2);
    return { pc, input, sim, frame };
  }

  it('con el cursor en el borde derecho la vista gira sola a la derecha; en el izquierdo, a la izquierda', () => {
    const { input, sim, frame, pc } = setup();
    const st = sim.state.player;
    input.mouseX = 799;
    const y0 = st.yaw;
    frame(30);
    // Medio segundo pegado al borde: casi EDGE_YAW_SPEED × 0,5 rad (yaw baja hacia la derecha).
    const turned = y0 - st.yaw;
    expect(turned).toBeGreaterThan(EDGE_YAW_SPEED * 0.5 * 0.9);
    expect(pc.edgeTurn.x).toBeGreaterThan(0.9);
    input.mouseX = 400;
    frame();
    const y1 = st.yaw;
    frame(30);
    expect(st.yaw).toBe(y1);
    input.mouseX = 1;
    frame(30);
    expect(st.yaw).toBeGreaterThan(y1);
    // Una vuelta entera sin salir de la página: ~2,6 s pegado al borde.
    const start = st.yaw;
    let total = 0;
    let prev = start;
    for (let i = 0; i < 60 * 3; i++) {
      frame();
      let d = st.yaw - prev;
      if (d < -Math.PI) d += Math.PI * 2;
      total += d;
      prev = st.yaw;
    }
    expect(total).toBeGreaterThan(Math.PI * 2);
  });

  it('no gira si el cursor sale de la página, ni sin pasar antes por el centro (cerrar un panel en una esquina)', () => {
    const { input, sim, frame } = setup();
    const st = sim.state.player;
    input.mouseX = 799;
    frame(5);
    input.pointerInside = false;
    const y0 = st.yaw;
    frame(30);
    expect(st.yaw).toBe(y0);
    // Vuelve a entrar por el borde: no gira hasta pasar por la zona central.
    input.pointerInside = true;
    frame(30);
    expect(st.yaw).toBe(y0);
    input.mouseX = 400;
    frame();
    input.mouseX = 799;
    frame(10);
    expect(st.yaw).toBeLessThan(y0);
  });

  it('← → giran en mirada libre y no desplazan; con captura siguen desplazando', () => {
    const { input, sim, frame } = setup();
    const st = sim.state.player;
    const p0 = { ...st.pos };
    const y0 = st.yaw;
    input.key('ArrowLeft', true);
    frame(30);
    input.key('ArrowLeft', false);
    expect(st.yaw - y0).toBeCloseTo(KEY_YAW_SPEED * 0.5, 1);
    expect(Math.hypot(st.pos.x - p0.x, st.pos.z - p0.z)).toBeLessThan(0.01);
    input.freeLook = false;
    const y1 = st.yaw;
    input.key('ArrowLeft', true);
    frame(30);
    input.key('ArrowLeft', false);
    expect(st.yaw).toBe(y1);
    expect(Math.hypot(st.pos.x - p0.x, st.pos.z - p0.z)).toBeGreaterThan(0.3);
  });

  it('sin control (panel abierto) no gira y la pista del borde se apaga', () => {
    const { input, sim, frame, pc } = setup();
    const st = sim.state.player;
    input.mouseX = 799;
    frame(3);
    expect(pc.edgeTurn.x).toBeGreaterThan(0);
    (pc as unknown as { ctx: { ui: { panelOpen: boolean } } }).ctx.ui.panelOpen = true;
    const y0 = st.yaw;
    frame(30);
    expect(st.yaw).toBe(y0);
    expect(pc.edgeTurn.x).toBe(0);
  });
});

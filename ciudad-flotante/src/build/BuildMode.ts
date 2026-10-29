/**
 * MODO CONSTRUCCIÓN (GDD §7 y §12, docs/SISTEMAS.md §8 y §12).
 *
 * Una herramienta integrada para modificar el barco donde se vive, no un juego aparte: la
 * simulación sigue corriendo y el personaje se queda donde está. `Game` conmuta el modo con B/Esc,
 * no captura el ratón y llama a `update` cada frame.
 *
 * Piezas (src/build):
 *  - `orbit.ts`   cámara exterior orbital (arrastre derecho o Q/E, rueda, WASD o arrastre central).
 *  - `picking.ts` rayo del ratón → espacio local de `shipRoot` (el barco se balancea) → celda/módulo.
 *  - `ghost.ts`   fantasma de colocación, rejilla del nivel, cajas de demolición y ampliación.
 *  - `catalog.ts` datos de la paleta, resumen del barco, información de módulos (lógica pura).
 *  - `hud.ts`     interfaz DOM (paleta, niveles, resumen, atajos, rótulos y confirmación).
 *
 * Decisión de marcos: la cámara vive en el MUNDO (no cuelga de `shipRoot`): el barco se mece
 * suavemente delante de una cámara quieta, como un dron. El fantasma y la rejilla sí cuelgan de
 * `shipRoot`, y el rayo del ratón se transforma a su espacio local antes de cortar con el plano
 * del nivel, así que lo que se ve bajo el cursor es exactamente la celda elegida.
 *
 * Todas las acciones pasan por los comandos de `Simulation` (`checkPlace`, `placeModule`,
 * `checkDemolishModule`, `demolish`, `checkExpandHull`, `expandHull`).
 */
import * as THREE from 'three';
import { clamp, smoothstep } from '../core/math';
import { MODULES, moduleDef, type ModuleCategory, type ModuleDef } from '../data/modules';
import type { GameContext } from '../game/context';
import { registerDebug } from '../game/debug';
import { CELL, HULL_EXPANSION_CELLS, LEVEL_H, RAIL_H, SHIP_ORIGIN_X } from '../sim/constants';
import { cellMin, footprintSize, halfWidthM, levelOfY, levelY, moduleCells } from '../sim/ship';
import type { Simulation } from '../sim/Simulation';
import { daylight } from '../sim/time';
import type { ModuleInstance, Rotation } from '../sim/types';
import { withArticle } from '../sim/utilities';
import { explainPlacement, levelReason, placeHintSteps, type PlaceSpot } from './advice';
import { CATEGORIES, cardInfo, demolishPreview, expansionInfo, moduleInfo, paletteModules, shipSummary, stock, type DemolishPreview } from './catalog';
import { BoxMarker, GHOST_COLORS, GhostView, GridView, Pulse } from './ghost';
import { BuildHud, esc, type ConfirmModel, type HudActions, type TipModel } from './hud';
import { DEFAULT_PITCH, DEFAULT_YAW, fitDistance, OrbitRig } from './orbit';
import { anchorFor, continuousCell, intersectLevel, moduleBox, pickModule, toShipLocalRay } from './picking';

/** Duración de la transición de cámara al entrar (s). */
const ENTER_TIME = 0.9;
/** Campo de visión de la cámara orbital. */
const BUILD_FOV = 50;
/** Píxeles que hay que mover el ratón para que un clic se convierta en arrastre. */
const DRAG_THRESHOLD = 5;
/** Cada cuánto se repinta la interfaz con datos que cambian solos (existencias, energía...). */
const HUD_REFRESH = 0.25;
/** Cada cuánto se revalida la colocación aunque el cursor no se mueva (el coste puede cambiar). */
const CHECK_REFRESH = 0.4;
/** Segundos con el cursor quieto antes de buscar un giro que sí valga (pista "pulsa R"). */
const HINT_DELAY = 0.12;
/**
 * Milisegundos por frame que se dedican a calcular la pista (cada prueba es una validación
 * completa con la comprobación fina de muebles: varios ms). Siempre se da al menos un paso.
 */
const HINT_BUDGET_MS = 6;

type Confirm = { kind: 'demolish'; moduleId: number } | { kind: 'expand' };

interface PlaceState {
  key: string;
  ok: boolean;
  /** El sitio vale; solo faltan materiales (fantasma ámbar en vez de rojo). */
  costOnly: boolean;
  /** Motivo tal como lo da `sim.checkPlace` (para saber si cambió al revalidar). */
  rawReason: string | null;
  /** Motivo para el rótulo (más orientativo: ver `advice.ts`). */
  reason: string | null;
  hint: string | null;
  /** Aviso que no impide construir (p. ej. el consumo de las lámparas de un huerto interior). */
  warning: string | null;
}

const NO_PLACE: PlaceState = { key: '', ok: false, costOnly: false, rawReason: null, reason: null, hint: null, warning: null };

interface CursorGhost {
  level: number;
  x: number;
  z: number;
  /** Cursor en celdas continuas (para re-centrar la pieza al probar otros giros). */
  fx: number;
  fz: number;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ndc = new THREE.Vector2();
const _box = new THREE.Box3();
const _up = new THREE.Vector3();

export class BuildMode {
  readonly camera: THREE.PerspectiveCamera;
  private _active = false;

  /* --- Estado de la herramienta --- */
  private level = 1;
  private category: ModuleCategory = 'vivienda';
  private selected: string | null = null;
  private demolishing = false;
  private rot: Rotation = 0;
  private confirm: Confirm | null = null;
  private expansionHover = false;

  /* --- Cámara --- */
  private readonly rig = new OrbitRig();
  private rigReady = false;
  private trans = 1;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private fromFov = BUILD_FOV;
  /** Desplazamiento vertical del encuadre (px) para que la paleta no tape el barco. */
  private shiftPx = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly localRay = new THREE.Ray();

  /* --- Ratón --- */
  private drag: { button: 0 | 1 | 2; x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;
  private overCanvas = false;

  /* --- Resultado del cursor --- */
  private ghostAt: CursorGhost | null = null;
  private place: PlaceState = { ...NO_PLACE };
  private placeTimer = 0;
  /** Tiempo que el cursor lleva en la misma celda (para calcular la pista con calma). */
  private placeStill = 0;
  /** Cálculo de la pista en curso (por pasos, con presupuesto de tiempo por frame). */
  private hintJob: { key: string; it: Generator<void, string | null> } | null = null;
  /** Último rótulo mostrado junto al cursor (para depuración y pruebas). */
  private lastTip: TipModel | null = null;
  private hoverId: number | null = null;
  private hoverDemolish: DemolishPreview | null = null;
  private placedFlash = 0;
  private placedMsg = '';
  private demolishCache: { key: string; at: number; value: DemolishPreview } | null = null;
  /** Eslora con la que se calculó la distancia de la cámara (si crece el casco, se reencuadra). */
  private fitLength = 0;

  /* --- Presentación --- */
  private ghost: GhostView | null = null;
  private grid: GridView | null = null;
  private demolishBox: BoxMarker | null = null;
  private expansionBox: BoxMarker | null = null;
  private pulse: Pulse | null = null;
  private hud: BuildHud | null = null;
  private hudTimer = 0;
  private hudDirty = true;
  private simRef: Simulation | null = null;

  constructor(private readonly ctx: GameContext) {
    this.camera = new THREE.PerspectiveCamera(BUILD_FOV, 16 / 9, 0.5, 3000);
    this.camera.name = 'camara-construccion';
    this.camera.position.set(-30, 30, 40);
    this.camera.lookAt(0, 3, 0);

    // Esc / Intro antes de que Game los use: Input (creado antes) ya los ha registrado en este
    // mismo evento, así que podemos "consumirlos" para que Esc no saque del modo si solo
    // queríamos soltar la pieza o cerrar la confirmación.
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('mousemove', (e) => {
      this.overCanvas = e.target === this.ctx.renderer.canvas;
    });
    document.addEventListener('mouseleave', () => (this.overCanvas = false));
    // Sin desplazamiento automático del navegador al arrastrar con el botón central.
    ctx.renderer.canvas.addEventListener('mousedown', (e) => {
      if (this._active && e.button === 1) e.preventDefault();
    });
    this.registerDebug();
  }

  get active(): boolean {
    return this._active;
  }

  /** Nivel seleccionado: los superiores se ocultan en la vista (corte). */
  get hideAboveLevel(): number | null {
    return this._active ? this.level : null;
  }

  /* ================================================================== */
  /* Ciclo de vida                                                       */
  /* ================================================================== */

  enter(): void {
    if (this._active) return;
    this._active = true;
    const ctx = this.ctx;
    const sim = ctx.sim;
    this.ensurePresentation();
    this.syncSim();

    // Nivel inicial: el del jugador (se construye "alrededor" de donde se vive).
    this.level = clamp(levelOfY(sim.state.player.pos.y), 0, sim.state.ship.levels - 1);
    this.selected = null;
    this.demolishing = false;
    this.confirm = null;
    this.expansionHover = false;
    this.drag = null;
    this.hoverId = null;
    ctx.highlight = null;

    // Cámara: transición desde la vista del jugador hasta la órbita exterior.
    this.updateBounds();
    const center = this.shipCenterX();
    const length = sim.state.ship.length;
    if (!this.rigReady) {
      this.rig.snap({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: this.defaultDist(), tx: center, ty: this.levelTargetY(), tz: 0 });
      this.rigReady = true;
    } else if (length !== this.fitLength) {
      // El casco ha crecido desde la última vez: se reencuadra manteniendo el ángulo elegido.
      this.rig.snap({ dist: this.defaultDist(), tx: center, ty: this.levelTargetY(), tz: 0 });
    } else {
      this.rig.snap({ tx: center, ty: this.levelTargetY(), tz: 0 });
    }
    this.fitLength = length;
    const pc = ctx.player.camera;
    pc.updateWorldMatrix(true, false);
    pc.getWorldPosition(this.fromPos);
    pc.getWorldQuaternion(this.fromQuat);
    this.fromFov = pc.fov;
    this.trans = 0;

    const root = ctx.renderer.shipRoot;
    for (const o of this.objects()) root.add(o);
    this.hud!.show();
    this.refreshHud();
    // Tras mostrar la paleta: el encuadre ya cuenta con su altura desde el primer frame.
    this.applyCamera(0);
  }

  exit(): void {
    if (!this._active) return;
    this._active = false;
    this.cleanup();
  }

  /** Partida nueva o cargada: vuelve al estado inicial (y sale del modo si estaba activo). */
  reset(): void {
    this._active = false;
    this.cleanup();
    this.rigReady = false;
    this.category = 'vivienda';
    this.rot = 0;
    this.simRef = null;
    this.grid?.invalidate();
  }

  private cleanup(): void {
    for (const o of this.objects()) o.removeFromParent();
    this.hud?.hide();
    this.selected = null;
    this.demolishing = false;
    this.confirm = null;
    this.expansionHover = false;
    this.drag = null;
    this.ghostAt = null;
    this.hoverId = null;
    this.hoverDemolish = null;
    this.demolishCache = null;
    this.place = { ...NO_PLACE };
    this.hintJob = null;
    this.lastTip = null;
    if (this.ctx.highlight?.kind === 'module') this.ctx.highlight = null;
  }

  private objects(): THREE.Object3D[] {
    return [this.grid, this.ghost, this.demolishBox, this.expansionBox, this.pulse].filter((x): x is NonNullable<typeof x> => !!x).map((x) => x.group);
  }

  /** Crea la interfaz y los objetos 3D la primera vez (la UI general ya existe). */
  private ensurePresentation(): void {
    if (!this.hud) {
      // Dentro de la raíz de la UI (hereda fuente y reglas de `.interactive`); si aún no existe
      // (no debería: `enter` llega después de construir todo), directamente en el contenedor.
      const ui = this.ctx.ui as GameContext['ui'] | undefined;
      this.hud = new BuildHud(ui?.root ?? this.ctx.renderer.container, this.hudActions());
    }
    this.ghost ??= new GhostView();
    this.grid ??= new GridView();
    this.demolishBox ??= new BoxMarker('construccion-demoler');
    this.expansionBox ??= new BoxMarker('construccion-ampliacion');
    this.pulse ??= new Pulse();
  }

  /** La simulación se sustituye al cargar o empezar partida: invalida cachés. */
  private syncSim(): void {
    if (this.simRef === this.ctx.sim) return;
    this.simRef = this.ctx.sim;
    this.place.key = '';
    this.grid?.invalidate();
    this.hudDirty = true;
  }

  /* ================================================================== */
  /* Frame                                                               */
  /* ================================================================== */

  update(dtReal: number): void {
    if (!this._active || !this.hud) return;
    const dt = clamp(Number.isFinite(dtReal) ? dtReal : 0, 0, 0.1);
    this.syncSim();
    this.hud.updateScale();
    this.updateBounds();

    this.handleKeys(dt);
    this.handleMouse();

    this.rig.update(dt);
    this.trans = Math.min(1, this.trans + dt / ENTER_TIME);
    this.applyCamera(dt);

    this.updateCursor(dt);
    this.updateScene(dt);

    this.hudTimer += dt;
    if (this.hudDirty || this.hudTimer >= HUD_REFRESH) this.refreshHud();
    const ex = this.ctx.sim.state.ship.expansion;
    if (ex) this.hud.setExpansionProgress(ex.progress);
  }

  /* ---------------- Teclado ---------------- */

  private onKeyDown(e: KeyboardEvent): void {
    if (!this._active || this.ctx.paused) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.code === 'Escape') {
      // Solo se queda con Esc si hay algo que cancelar; si no, Game sale del modo.
      if (this.cancelOne()) this.ctx.input.consume('Escape');
    } else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.confirm) {
      this.doConfirm();
      this.ctx.input.consume(e.code);
    }
  }

  /**
   * Cancela lo más inmediato (confirmación, pieza o demolición) y devuelve si hizo algo. Público
   * para que `Game` pueda preguntar antes de salir del modo con Esc (hoy lo resuelve el oyente
   * de teclado consumiendo la tecla; esto cubre también las teclas inyectadas por depuración).
   */
  cancel(): boolean {
    return this._active && this.cancelOne();
  }

  private cancelOne(): boolean {
    if (this.confirm) {
      this.closeConfirm();
      return true;
    }
    if (this.selected) {
      this.selectModule(null);
      return true;
    }
    if (this.demolishing) {
      this.setDemolish(false);
      return true;
    }
    return false;
  }

  private handleKeys(dt: number): void {
    const inp = this.ctx.input;
    if (this.confirm) return;
    if (inp.pressed('PageUp')) this.setLevel(this.level + 1);
    if (inp.pressed('PageDown')) this.setLevel(this.level - 1);
    if (inp.pressed('KeyR')) this.rotate();
    if (inp.pressed('KeyX')) this.setDemolish(!this.demolishing);
    if (inp.pressed('KeyF')) this.resetView();
    if (inp.pressed('KeyH')) {
      this.hud?.toggleKeys();
      this.hudDirty = true;
    }
    if (inp.pressed('Tab')) {
      const i = CATEGORIES.findIndex((c) => c.id === this.category);
      const n = CATEGORIES.length;
      const next = CATEGORIES[(i + (inp.down('ShiftLeft') || inp.down('ShiftRight') ? n - 1 : 1)) % n]!;
      this.selectCategory(next.id);
    }
    for (let d = 1; d <= 9; d++) {
      if (!inp.pressed(`Digit${d}`) && !inp.pressed(`Numpad${d}`)) continue;
      const mods = paletteModules(this.category);
      const def = mods[d - 1];
      if (def) this.selectModule(def.id, true);
      else if (this.category === 'estructura' && d - 1 === mods.length) this.requestExpand();
    }

    // Cámara con teclado.
    const fast = inp.down('ShiftLeft') || inp.down('ShiftRight') ? 2.2 : 1;
    let orbit = 0;
    if (inp.down('KeyQ') || inp.down('ArrowLeft')) orbit += 1;
    if (inp.down('KeyE') || inp.down('ArrowRight')) orbit -= 1;
    if (orbit) this.rig.orbit(orbit * 1.5 * dt * fast, 0);
    let tilt = 0;
    if (inp.down('ArrowUp')) tilt += 1;
    if (inp.down('ArrowDown')) tilt -= 1;
    if (tilt) this.rig.orbit(0, tilt * 0.9 * dt);
    let fwd = 0;
    let right = 0;
    if (inp.down('KeyW')) fwd += 1;
    if (inp.down('KeyS')) fwd -= 1;
    if (inp.down('KeyD')) right += 1;
    if (inp.down('KeyA')) right -= 1;
    if (fwd || right) {
      const speed = (8 + this.rig.cur.dist * 0.55) * fast * dt;
      this.rig.pan(right * speed, fwd * speed);
    }
  }

  /* ---------------- Ratón ---------------- */

  private handleMouse(): void {
    const inp = this.ctx.input;
    const mx = inp.mouseX;
    const my = inp.mouseY;
    const blocked = !!this.confirm;

    // Rueda (Input solo la cuenta sobre el lienzo).
    const w = inp.wheel();
    if (w && !blocked) this.rig.zoom(w > 0 ? 1 : -1);

    // Inicio de arrastre: derecho = orbitar, central = desplazar, izquierdo sin herramienta = orbitar.
    if (!this.drag && !blocked && this.overCanvas) {
      const tool = !!this.selected || this.demolishing;
      const b: 0 | 1 | 2 | null = inp.pressed('Mouse2') ? 2 : inp.pressed('Mouse1') ? 1 : inp.pressed('Mouse0') && !tool ? 0 : null;
      if (b !== null) this.drag = { button: b, x: mx, y: my, lastX: mx, lastY: my, moved: false };
    }
    if (this.drag) {
      const d = this.drag;
      const code = `Mouse${d.button}`;
      if (!d.moved && Math.hypot(mx - d.x, my - d.y) > DRAG_THRESHOLD) d.moved = true;
      if (d.moved) {
        const dx = mx - d.lastX;
        const dy = my - d.lastY;
        if (d.button === 1) {
          // Arrastrar el barco: el punto bajo el cursor sigue al ratón.
          const h = Math.max(1, this.ctx.renderer.canvas.clientHeight);
          const k = (2 * this.rig.cur.dist * Math.tan(THREE.MathUtils.degToRad(BUILD_FOV) / 2)) / h;
          this.rig.pan(-dx * k, dy * k / Math.max(0.35, Math.sin(this.rig.cur.pitch)));
        } else {
          this.rig.orbit(-dx * 0.0065, dy * 0.0048);
        }
      }
      d.lastX = mx;
      d.lastY = my;
      if (!inp.down(code)) {
        // Soltado: si no hubo arrastre, el derecho es "soltar la pieza / dejar de demoler".
        if (!d.moved && d.button === 2) this.cancelOne();
        this.drag = null;
      }
    }

    // Clic izquierdo con herramienta: construir o desmontar.
    if (!blocked && this.overCanvas && inp.pressed('Mouse0') && !this.drag) {
      if (this.selected) this.tryPlace();
      else if (this.demolishing) this.tryDemolish();
    }
  }

  /* ---------------- Cámara ---------------- */

  private shipCenterX(): number {
    const L = this.ctx.sim.state.ship.length * CELL;
    return -SHIP_ORIGIN_X + L / 2;
  }

  private levelTargetY(): number {
    return levelY(this.level) + 1.2;
  }

  private defaultDist(): number {
    const L = this.ctx.sim.state.ship.length * CELL;
    return fitDistance(L, BUILD_FOV, this.camera.aspect || 16 / 9);
  }

  private updateBounds(): void {
    const ship = this.ctx.sim.state.ship;
    const hw = halfWidthM(ship.width);
    this.rig.setBounds(-SHIP_ORIGIN_X, -SHIP_ORIGIN_X + ship.length * CELL, -hw, hw);
  }

  /** Vista por defecto (F). */
  resetView(): void {
    this.rig.set({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, dist: this.defaultDist(), tx: this.shipCenterX(), ty: this.levelTargetY(), tz: 0 });
  }

  /** Coloca la cámara: órbita + desplazamiento para que la paleta no tape el barco + transición. */
  private applyCamera(dt: number): void {
    const cam = this.camera;
    const p = this.rig.cur;
    const target = _v.set(p.tx, p.ty, p.tz);
    OrbitRig.offset(p, _v2);
    cam.position.copy(target).add(_v2);
    cam.up.set(0, 1, 0);
    cam.lookAt(target);
    // Encuadre: sube el barco en pantalla la mitad del alto de la paleta (suavizado).
    const h = Math.max(1, this.ctx.renderer.canvas.clientHeight);
    const wantShift = Math.max(0, (this.hud?.paletteHeightPx ?? 0) * 0.5 - 24);
    this.shiftPx = dt > 0 ? this.shiftPx + (wantShift - this.shiftPx) * (1 - Math.exp(-8 * dt)) : wantShift;
    const shiftPx = this.shiftPx;
    const shift = (shiftPx / h) * 2 * p.dist * Math.tan(THREE.MathUtils.degToRad(BUILD_FOV) / 2);
    _up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.position.addScaledVector(_up, -shift);
    // Nunca bajo el agua.
    if (cam.position.y < 2) cam.position.y = 2;

    let fov = BUILD_FOV;
    if (this.trans < 1) {
      const e = smoothstep(0, 1, this.trans);
      const ey = Math.sqrt(e); // sube antes de alejarse: no "atraviesa" la cubierta
      _q.copy(cam.quaternion);
      const tx = cam.position.x;
      const ty = cam.position.y;
      const tz = cam.position.z;
      cam.position.set(this.fromPos.x + (tx - this.fromPos.x) * e, this.fromPos.y + (ty - this.fromPos.y) * ey, this.fromPos.z + (tz - this.fromPos.z) * e);
      cam.quaternion.slerpQuaternions(this.fromQuat, _q, e);
      fov = this.fromFov + (BUILD_FOV - this.fromFov) * e;
    }
    if (Math.abs(cam.fov - fov) > 1e-3) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld(true);
  }

  /* ---------------- Cursor: fantasma, demolición e información ---------------- */

  private updateCursor(dt: number): void {
    const ctx = this.ctx;
    const sim = ctx.sim;
    const hud = this.hud!;
    const inp = ctx.input;
    const mx = inp.mouseX;
    const my = inp.mouseY;
    const canvas = ctx.renderer.canvas;
    const usable = this.overCanvas && !this.confirm && !hud.pointerOverUi && !(this.drag && this.drag.moved) && this.trans > 0.6;
    this.ghostAt = null;
    this.hoverId = null;
    this.hoverDemolish = null;
    this.placeTimer += dt;
    this.placeStill += dt;
    if (this.placedFlash > 0) this.placedFlash = Math.max(0, this.placedFlash - dt);

    let tip: TipModel | null = null;
    let cursorCell: { x: number; z: number } | null = null;
    let info: { m: ModuleInstance; demolish: DemolishPreview | null } | null = null;

    if (usable) {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      _ndc.set((mx / w) * 2 - 1, -(my / h) * 2 + 1);
      this.raycaster.setFromCamera(_ndc, this.camera);
      const root = ctx.renderer.shipRoot;
      root.updateWorldMatrix(true, false);
      toShipLocalRay(this.raycaster.ray, root.matrixWorld, this.localRay);
      const ship = sim.state.ship;

      if (this.selected) {
        const def = moduleDef(this.selected);
        const hit = intersectLevel(this.localRay, this.level);
        const cell = hit ? continuousCell(hit.x, hit.z, ship.width) : null;
        const a = cell ? anchorFor(def, this.rot, cell.fx, cell.fz, ship) : null;
        if (a && cell) {
          this.ghostAt = { level: this.level, x: a.x, z: a.z, fx: cell.fx, fz: cell.fz };
          this.validate(def, this.ghostAt);
          tip = this.placeTip(def);
        } else {
          // Sin fantasma (lejos del casco o mirando al cielo): siempre un rótulo que diga por qué.
          tip = {
            tone: 'info',
            title: def.name,
            text: hit ? 'Fuera del casco' : 'Apunta al barco',
            sub: hit ? 'Acerca la pieza al barco para colocarla' : 'Señala una celda del nivel para colocar la pieza',
          };
        }
      } else {
        const m = pickModule(this.localRay, ship, this.level);
        if (m) {
          this.hoverId = m.id;
          const demolish = this.demolishing ? this.cachedDemolish(m) : null;
          this.hoverDemolish = demolish;
          info = { m, demolish };
        } else {
          const hit = intersectLevel(this.localRay, this.level);
          if (hit) {
            const { fx, fz } = continuousCell(hit.x, hit.z, ship.width);
            const cx = Math.floor(fx);
            const cz = Math.floor(fz);
            if (cx >= 0 && cz >= 0 && cx < ship.length && cz < ship.width) cursorCell = { x: cx, z: cz };
          }
          if (this.demolishing) tip = { tone: 'info', title: 'Demoler', text: 'Señala un módulo o una obra' };
        }
      }
    }

    // Resaltado del módulo señalado (lo dibuja ShipView).
    ctx.highlight = this.hoverId !== null ? { kind: 'module', id: this.hoverId } : null;
    this.grid?.setCursor(this.level, this.selected ? null : cursorCell, sim.state.ship.width);

    if (info) hud.setInfo(moduleInfo(sim, info.m), mx, my, info.demolish);
    else hud.setInfo(null, 0, 0);
    hud.setTip(tip, mx, my);
    this.lastTip = tip;
  }

  /** Vista previa de demolición con caché (comprobar la conectividad recalcula la distribución). */
  private cachedDemolish(m: ModuleInstance): DemolishPreview {
    const sim = this.ctx.sim;
    const key = `${m.id}|${sim.state.ship.revision}|${m.status}|${m.fire > 0}`;
    const c = this.demolishCache;
    if (c && c.key === key && sim.state.time - c.at < 0.5) return c.value;
    const value = demolishPreview(sim, m);
    this.demolishCache = { key, at: sim.state.time, value };
    return value;
  }

  /**
   * Valida la colocación con caché (`checkPlace` recalcula la distribución del barco y hace la
   * comprobación fina de muebles: varios ms). Se revalida al cambiar de celda/giro/nivel y cada
   * `CHECK_REFRESH` s (el coste puede cambiar). El motivo se traduce a algo orientativo al momento
   * (`explainPlacement`); la pista cara (probar giros y sitios para una escalera, todos con
   * `sim.checkPlace` completo) se calcula cuando el cursor se queda quieto, por pasos y con un
   * presupuesto de tiempo por frame, para que barrer el barco con el ratón no tironee.
   */
  private validate(def: ModuleDef, at: CursorGhost): void {
    const sim = this.ctx.sim;
    const { x, z } = at;
    const key = `${def.id}|${this.level}|${x}|${z}|${this.rot}|${sim.state.ship.revision}|${sim.state.unlocks.length}`;
    if (key !== this.place.key || this.placeTimer >= CHECK_REFRESH) {
      const sameSpot = key === this.place.key;
      this.placeTimer = 0;
      const chk = sim.checkPlace(def.id, this.level, x, z, this.rot);
      // `checkPlace` solo informa de la falta de materiales cuando el sitio es válido.
      const costOnly = !chk.ok && Object.keys(chk.missing).length > 0 && !!chk.reason?.startsWith('Faltan');
      const warning = chk.warning ?? null;
      if (!sameSpot) this.placeStill = 0;
      if (sameSpot && chk.reason === this.place.rawReason) {
        // Mismo sitio y mismo motivo: se conservan el texto y la pista (o su cálculo en curso).
        this.place.ok = chk.ok;
        this.place.costOnly = costOnly;
        this.place.warning = warning;
      } else {
        const spot: PlaceSpot = { def, level: this.level, x, z, rot: this.rot, fx: at.fx, fz: at.fz };
        const ex = chk.ok ? null : explainPlacement(sim, spot, chk.reason);
        this.place = { key, ok: chk.ok, costOnly, rawReason: chk.reason, reason: ex?.reason ?? chk.reason, hint: ex?.hint ?? null, warning };
        this.hintJob = !chk.ok && !costOnly && ex ? { key, it: placeHintSteps(sim, spot, chk.reason, ex) } : null;
      }
    }
    const job = this.hintJob;
    if (job && job.key === this.place.key && this.placeStill >= HINT_DELAY) {
      const t0 = performance.now();
      for (;;) {
        const r = job.it.next();
        if (r.done) {
          if (r.value) this.place.hint = r.value;
          this.hintJob = null;
          break;
        }
        if (performance.now() - t0 >= HINT_BUDGET_MS) break;
      }
    }
  }

  private placeTip(def: ModuleDef): TipModel {
    if (this.placedFlash > 0) return { tone: 'ok', title: def.name, text: this.placedMsg, sub: 'Sigue colocando o suelta la pieza con clic derecho' };
    if (this.place.ok) {
      const keys = `<span class="kbd">R</span> girar · <span class="kbd">Clic der.</span> soltar`;
      return { tone: 'ok', title: def.name, text: 'Clic para construir aquí', sub: this.place.warning ? esc(this.place.warning) : keys };
    }
    return {
      tone: this.place.costOnly ? 'warn' : 'bad',
      title: def.name,
      text: this.place.reason ?? 'No se puede construir aquí',
      sub: this.place.hint ? esc(this.place.hint) : undefined,
    };
  }

  /* ---------------- Escena 3D ---------------- */

  private updateScene(dt: number): void {
    const sim = this.ctx.sim;
    const ship = sim.state.ship;
    const grid = this.grid!;
    const ghost = this.ghost!;
    grid.sync(sim.layout, ship, this.level);
    grid.update(dt, 1 - daylight(sim.state.time));

    if (this.selected && this.ghostAt) {
      ghost.setShape(this.selected, this.rot, ship.width);
      ghost.place(this.ghostAt.level, this.ghostAt.x, this.ghostAt.z);
      ghost.setState(this.place.ok || this.placedFlash > 0 ? 'ok' : this.place.costOnly ? 'cost' : 'bad');
      ghost.group.visible = true;
      ghost.update(dt);
    } else {
      ghost.group.visible = false;
    }

    // Caja roja sobre lo que se va a desmontar.
    const dbox = this.demolishBox!;
    const target = this.confirm?.kind === 'demolish' ? this.confirm.moduleId : this.demolishing ? this.hoverId : null;
    const tm = target !== null ? ship.modules.find((m) => m.id === target) : undefined;
    if (tm) {
      moduleBox(tm, ship.width, _box).expandByScalar(0.12);
      const ok = this.confirm?.kind === 'demolish' ? true : (this.hoverDemolish?.ok ?? false);
      dbox.show(_box, ok ? GHOST_COLORS.demolish : GHOST_COLORS.blocked, ok ? 0.26 : 0.14);
    } else dbox.hide();
    dbox.update(dt);

    // Vista previa de la ampliación del casco.
    const xbox = this.expansionBox!;
    if ((this.expansionHover || this.confirm?.kind === 'expand') && !ship.expansion) {
      const x0 = cellMin(ship.length, 0, ship.width);
      const hw = halfWidthM(ship.width);
      _box.min.set(x0.x, 0.05, -hw);
      _box.max.set(x0.x + HULL_EXPANSION_CELLS * CELL, LEVEL_H + RAIL_H, hw);
      const ok = sim.checkExpandHull().ok;
      xbox.show(_box, ok ? GHOST_COLORS.ok : GHOST_COLORS.bad, 0.2);
    } else xbox.hide();
    xbox.update(dt);

    this.pulse!.update(dt);
  }

  /* ================================================================== */
  /* Acciones                                                            */
  /* ================================================================== */

  setLevel(level: number): void {
    const max = this.ctx.sim.state.ship.levels - 1;
    const l = clamp(Math.round(level), 0, max);
    if (l === this.level) return;
    this.level = l;
    this.rig.set({ ty: this.levelTargetY() });
    this.place.key = '';
    this.hudDirty = true;
    this.ctx.bus.emit('sfx', { name: 'ui_click' });
  }

  selectCategory(cat: ModuleCategory): void {
    if (this.category === cat && !this.demolishing) return;
    this.category = cat;
    if (this.demolishing) this.setDemolish(false);
    this.hudDirty = true;
  }

  /** Elige una pieza (null = ninguna). `fromKey`: atajo numérico (no alterna la selección). */
  selectModule(type: string | null, fromKey = false): void {
    const sim = this.ctx.sim;
    if (type !== null) {
      const def = MODULES[type];
      if (!def || !def.buildable) return;
      if (def.unlock && !sim.state.unlocks.includes(def.unlock)) {
        const card = cardInfo(sim, def, {});
        sim.notify(`${def.name}: ${card.lockReason ?? 'bloqueado'}`, 'warn');
        this.ctx.bus.emit('sfx', { name: 'ui_error' });
        return;
      }
      if (this.selected === type && !fromKey) type = null;
    }
    this.selected = type;
    this.demolishing = false;
    this.place.key = '';
    this.placedFlash = 0;
    if (type) {
      const def = moduleDef(type);
      this.category = def.category;
      if (!def.levels.includes(this.level)) {
        // Lleva al nivel permitido más cercano.
        const best = [...def.levels].sort((a, b) => Math.abs(a - this.level) - Math.abs(b - this.level))[0]!;
        this.setLevel(best);
        sim.notify(levelReason(def), 'info');
      }
      this.ctx.bus.emit('sfx', { name: 'ui_click' });
    }
    this.hudDirty = true;
  }

  rotate(): void {
    if (!this.selected) return;
    this.rot = ((this.rot + 1) % 4) as Rotation;
    this.place.key = '';
    this.ctx.bus.emit('sfx', { name: 'ui_click' });
  }

  setDemolish(on: boolean): void {
    if (on === this.demolishing) return;
    this.demolishing = on;
    if (on) this.selected = null;
    this.hudDirty = true;
    this.ctx.bus.emit('sfx', { name: 'ui_click' });
  }

  private tryPlace(): void {
    const sim = this.ctx.sim;
    const type = this.selected;
    const at = this.ghostAt;
    if (!type || !at) return;
    // Si el rótulo ya explicaba por qué no se puede, el aviso dice lo mismo (no el texto técnico).
    const shown = !this.place.ok && this.place.reason ? this.place.reason : null;
    const res = sim.placeModule(type, at.level, at.x, at.z, this.rot);
    this.place.key = '';
    if (res.ok) {
      sim.notify(res.msg ?? 'Obra iniciada', 'good');
      const def = moduleDef(type);
      const [fw, fd] = footprintSize(def, this.rot);
      const o = cellMin(at.x, at.z, sim.state.ship.width);
      this.pulse!.fire(o.x, o.z, o.x + fw * CELL, o.z + fd * CELL, levelY(at.level));
      this.placedFlash = 1.1;
      this.placedMsg = 'Obra iniciada';
      this.hudDirty = true;
    } else {
      sim.notify(shown ?? res.msg ?? 'No se puede construir aquí', 'warn');
      this.ctx.bus.emit('sfx', { name: 'ui_error' });
    }
  }

  private tryDemolish(): void {
    const sim = this.ctx.sim;
    if (this.hoverId === null) return;
    const m = sim.state.ship.modules.find((mm) => mm.id === this.hoverId);
    if (!m) return;
    const prev = demolishPreview(sim, m);
    if (!prev.ok) {
      sim.notify(`${prev.name}: ${prev.reason ?? 'no se puede desmontar'}`, 'warn');
      this.ctx.bus.emit('sfx', { name: 'ui_error' });
      return;
    }
    this.confirm = { kind: 'demolish', moduleId: m.id };
    this.hud!.showConfirm(this.demolishConfirm(prev));
    this.ctx.bus.emit('sfx', { name: 'ui_click' });
  }

  private demolishConfirm(p: DemolishPreview): ConfirmModel {
    const lines = p.inConstruction
      ? ['La obra se cancela y se recuperan todos los materiales.']
      : ['Se recupera la mitad de los materiales. Los habitantes que dormían o trabajaban aquí buscarán otro sitio.'];
    return {
      kind: 'demolish',
      title: p.inConstruction ? `¿Cancelar la obra: ${p.name}?` : `¿Desmontar ${withArticle(p.name)}?`,
      glyph: 'trash',
      lines,
      items: p.refund.map((r) => ({ id: r.id, name: r.name, qty: r.qty })),
      itemsLabel: 'Recuperas',
      // El agua y la carga no caben en la caja: se avisa antes, no después.
      warnings: p.losses,
      note:
        p.contents > 0
          ? `Lo que contenga (${p.contents} ${p.contents === 1 ? 'objeto' : 'objetos'}) quedará en una caja en el suelo, junto con los materiales.`
          : 'Lo que contenga quedará en una caja en el suelo, junto con los materiales.',
      confirmLabel: p.inConstruction ? 'Cancelar obra' : 'Desmontar',
      danger: true,
    };
  }

  requestExpand(): void {
    const sim = this.ctx.sim;
    const info = expansionInfo(sim, stock(sim));
    if (!info.ok) {
      sim.notify(info.reason ?? 'No se puede ampliar el casco', 'warn');
      this.ctx.bus.emit('sfx', { name: 'ui_error' });
      return;
    }
    this.confirm = { kind: 'expand' };
    this.selected = null;
    this.demolishing = false;
    this.hudDirty = true;
    this.hud!.showConfirm({
      kind: 'expand',
      title: '¿Ampliar el casco?',
      glyph: 'ship',
      lines: [
        `El barco crecerá dos secciones por la proa: de ${info.lengthNowM} m a ${info.lengthAfterM} m de eslora, con más cubierta y más bodega.`,
        `La obra dura unas ${info.timeText}; puedes ayudar con el martillo en la proa.`,
        ...(info.done > 0 ? [`Cada ampliación cuesta más que la anterior: esta es la ${info.done + 1}.ª.`] : []),
      ],
      items: info.cost.map((c) => ({ id: c.id, name: c.name, qty: c.need, have: c.have })),
      itemsLabel: 'Coste',
      confirmLabel: 'Ampliar',
      danger: false,
    });
    this.ctx.bus.emit('sfx', { name: 'ui_click' });
  }

  private doConfirm(): void {
    const c = this.confirm;
    if (!c) return;
    const sim = this.ctx.sim;
    this.closeConfirm();
    if (c.kind === 'demolish') {
      const res = sim.demolish(c.moduleId);
      sim.notify(res.msg ?? (res.ok ? 'Desmontado' : 'No se puede desmontar'), res.ok ? 'good' : 'warn');
    } else {
      const res = sim.expandHull();
      sim.notify(res.msg ?? (res.ok ? 'Ampliación iniciada' : 'No se puede ampliar el casco'), res.ok ? 'good' : 'warn');
      if (res.ok) this.expansionHover = false;
    }
    this.place.key = '';
    this.hudDirty = true;
  }

  private closeConfirm(): void {
    this.confirm = null;
    this.hud?.hideConfirm();
    this.hudDirty = true;
  }

  /* ================================================================== */
  /* Interfaz                                                            */
  /* ================================================================== */

  private hudActions(): HudActions {
    return {
      selectModule: (t) => this.selectModule(t),
      selectCategory: (c) => this.selectCategory(c),
      toggleDemolish: () => this.setDemolish(!this.demolishing),
      requestExpand: () => this.requestExpand(),
      setLevel: (l) => this.setLevel(l),
      rotate: () => this.rotate(),
      resetView: () => this.resetView(),
      exit: () => this.ctx.setMode('play'),
      confirm: () => this.doConfirm(),
      cancel: () => this.closeConfirm(),
      hoverExpansion: (on) => {
        this.expansionHover = on;
      },
    };
  }

  private refreshHud(): void {
    const hud = this.hud;
    if (!hud) return;
    this.hudTimer = 0;
    this.hudDirty = false;
    const sim = this.ctx.sim;
    const have = stock(sim);
    const cards = paletteModules(this.category).map((d) => cardInfo(sim, d, have));
    // La ficha de ampliación solo está en "Estructura": fuera de ella no hay vista previa.
    if (this.category !== 'estructura') this.expansionHover = false;
    hud.renderPalette(
      {
        category: this.category,
        selected: this.selected,
        demolish: this.demolishing,
        cards,
        expansion: this.category === 'estructura' ? expansionInfo(sim, have) : null,
      },
      !!this.selected,
    );
    const sel = this.selected ? moduleDef(this.selected) : null;
    hud.renderLevels(sim.state.ship.levels, this.level, (l) => (sel ? sel.levels.includes(l) : null));
    hud.renderSummary(shipSummary(sim));
    hud.renderKeys(this.selected ? 'place' : this.demolishing ? 'demolish' : 'inspect');
  }

  /* ================================================================== */
  /* Depuración (window.__game.cmd)                                      */
  /* ================================================================== */

  /** Estado del modo para pruebas. */
  debugInfo(): Record<string, unknown> {
    const c = this.rig.cur;
    return {
      activo: this._active,
      nivel: this.level,
      categoria: this.category,
      pieza: this.selected,
      giro: this.rot,
      demoler: this.demolishing,
      confirmacion: this.confirm?.kind ?? null,
      fantasma: this.ghostAt ? { level: this.ghostAt.level, x: this.ghostAt.x, z: this.ghostAt.z, ok: this.place.ok, motivo: this.place.reason, pista: this.place.hint, aviso: this.place.warning } : null,
      rotulo: this.lastTip ? { tono: this.lastTip.tone, titulo: this.lastTip.title, texto: this.lastTip.text, sub: this.lastTip.sub ?? null } : null,
      señalado: this.hoverId,
      camara: { yaw: +c.yaw.toFixed(3), pitch: +c.pitch.toFixed(3), dist: +c.dist.toFixed(2), tx: +c.tx.toFixed(2), ty: +c.ty.toFixed(2), tz: +c.tz.toFixed(2) },
      transicion: +this.trans.toFixed(2),
      sobreLienzo: this.overCanvas,
    };
  }

  /** Posición en pantalla (px CSS de la página) de un punto local del barco. */
  screenOf(x: number, y: number, z: number): { x: number; y: number } | null {
    const canvas = this.ctx.renderer.canvas;
    const r = canvas.getBoundingClientRect();
    const root = this.ctx.renderer.shipRoot;
    root.updateWorldMatrix(true, false);
    _v.set(x, y, z).applyMatrix4(root.matrixWorld).project(this.camera);
    if (_v.z > 1) return null;
    return { x: r.left + ((_v.x + 1) / 2) * r.width, y: r.top + ((1 - _v.y) / 2) * r.height };
  }

  private registerDebug(): void {
    registerDebug('buildInfo', (() => this.debugInfo()) as never);
    registerDebug('buildLevel', ((l: number) => this.setLevel(l)) as never);
    registerDebug('buildSelect', ((type: string | null) => this.selectModule(type, true)) as never);
    registerDebug('buildRotate', ((n = 1) => {
      for (let i = 0; i < n; i++) this.rotate();
    }) as never);
    registerDebug('buildDemolish', ((on = true) => this.setDemolish(on)) as never);
    registerDebug('buildCategory', ((c: ModuleCategory) => this.selectCategory(c)) as never);
    registerDebug('buildView', ((yaw?: number, pitch?: number, dist?: number, tx?: number, tz?: number) => {
      const p: Record<string, number> = {};
      if (yaw !== undefined) p.yaw = yaw;
      if (pitch !== undefined) p.pitch = pitch;
      if (dist !== undefined) p.dist = dist;
      if (tx !== undefined) p.tx = tx;
      if (tz !== undefined) p.tz = tz;
      this.rig.snap(p);
      this.trans = 1;
      this.applyCamera(0);
      return this.debugInfo().camara;
    }) as never);
    registerDebug('buildCellToScreen', ((level: number, x: number, z: number) => {
      const w = this.ctx.sim.state.ship.width;
      const mn = cellMin(x, z, w);
      return this.screenOf(mn.x + CELL / 2, levelY(level), mn.z + CELL / 2);
    }) as never);
    registerDebug('buildModuleToScreen', ((id: number, height = 1.2) => {
      const m = this.ctx.sim.state.ship.modules.find((mm) => mm.id === id);
      if (!m) return null;
      const cells = moduleCells(m).filter((c) => c.level === m.level);
      const w = this.ctx.sim.state.ship.width;
      let sx = 0;
      let sz = 0;
      for (const c of cells) {
        const cc = cellMin(c.x, c.z, w);
        sx += cc.x + CELL / 2;
        sz += cc.z + CELL / 2;
      }
      return this.screenOf(sx / cells.length, levelY(m.level) + height, sz / cells.length);
    }) as never);
    registerDebug('buildExpand', (() => this.requestExpand()) as never);
    registerDebug('buildConfirm', (() => this.doConfirm()) as never);
  }
}

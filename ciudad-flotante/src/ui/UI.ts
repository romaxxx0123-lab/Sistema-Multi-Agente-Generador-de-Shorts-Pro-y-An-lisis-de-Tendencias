/**
 * [AGENTE ui] INTERFAZ: HUD discreto, barra rápida, avisos, paneles (inventario, fabricación,
 * diario, estado del barco, estaciones, almacenes, cajas, habitantes, timón, comercio), menús
 * (principal, pausa, muerte, ajustes, controles, guardar/cargar) y tutorial no intrusivo.
 *
 * Capas (de abajo arriba): HUD → paneles (con fondo que cierra al hacer clic) → lector de hojas
 * del cuaderno → menús (y la pantalla de llegada a Puerto Esperanza) → descripción emergente y
 * fantasma de arrastre. Todas cuelgan de una capa escalada (zoom CSS)
 * para que la interfaz se lea igual de bien a 1280×720 que a 1920×1080.
 *
 * La UI solo LEE `ctx.sim.state` y cambia el estado con comandos de `Simulation` (y las funciones
 * de descartar/reactivar el tutorial de `sim/tutorial`). Los paneles se describen con nodos
 * virtuales (`vdom.ts`) y se repintan varias veces por segundo con datos vivos.
 */
import type { NotifyKind } from '../core/EventBus';
import type { GameContext } from '../game/context';
import type { PanelRequest, PromptInfo } from '../game/types';
import { CELL, SHIP_ORIGIN_X } from '../sim/constants';
import type { ActionResult, InvRef } from '../sim/Simulation';
import { registerDebug } from '../game/debug';
import { dismissTutorial, resumeTutorial } from '../sim/tutorial';
import { DragManager } from './drag';
import { refKey, type PanelState, type UiEnv } from './env';
import { Hud } from './hud';
import { Menus } from './menus';
import { renderPanel } from './panels/index';
import { newPages, PageReader, pageDestination } from './story';
import { Tooltip } from './tooltip';
import { cx, h, patch } from './vdom';
import { gl, kbd } from './widgets';
import './hud.css';
import './panels.css';
import './menus.css';
import './story.css';

/** Intervalo de repintado de los paneles (s). */
const PANEL_REFRESH = 0.15;

export class UI {
  readonly root: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly hud: Hud;
  private readonly panelLayer: HTMLElement;
  private readonly overLayer: HTMLElement;
  private readonly tip: Tooltip;
  private readonly drag: DragManager;
  private readonly menus: Menus;
  private readonly env: UiEnv;
  private panel: PanelRequest | null = null;
  private ps: PanelState = {};
  private panelTimer = 0;
  /** Vista del panel pintada la última vez (tipo y pestaña): al cambiar, el panel se monta de nuevo. */
  private panelView: string | null = null;
  /** El panel montado viene de un cambio de pestaña (sin animación de entrada mientras viva). */
  private panelSwap = false;
  /** Repintados del panel montado (al segundo se marca `pn-settled`, que fuerza un repintado entero). */
  private panelPaints = 0;
  /** El panel se abrió en este frame: la E que lo abrió no debe cerrarlo. */
  private skipE = false;
  private scale = 1;
  private lastSize = '';
  /** Tiempo del plano orbital del menú principal. */
  private menuTime = 0;
  /** Lector no bloqueante de las hojas del cuaderno. */
  private readonly reader: PageReader;
  /** Hojas del cuaderno ya leídas la última vez que se miró (para abrir el lector con las nuevas). */
  private seenPages: number[] = [];
  /** ¿Se había llegado a Puerto Esperanza la última vez que se miró? */
  private seenArrived = false;
  /** La llegada acaba de ocurrir: la pantalla se abre en el próximo frame (con los recién llegados). */
  private arrivalPending = false;

  constructor(
    container: HTMLElement,
    private readonly ctx: GameContext,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    container.appendChild(this.root);

    this.layer = document.createElement('div');
    this.layer.className = 'ui-layer';
    this.root.appendChild(this.layer);

    this.hud = new Hud(this.layer, ctx);
    this.hud.onDismissTutorial = () => {
      dismissTutorial(this.ctx.sim);
      this.hud.toast('Consejos ocultos. F1 los vuelve a mostrar (también en el Diario o en Ajustes)', 'info');
    };

    this.panelLayer = document.createElement('div');
    this.panelLayer.className = 'ui-panels';
    this.layer.appendChild(this.panelLayer);

    this.reader = new PageReader(this.layer);

    this.overLayer = document.createElement('div');
    this.overLayer.className = 'ui-layer ui-over';
    this.root.appendChild(this.overLayer);

    this.tip = new Tooltip(this.overLayer);
    this.drag = new DragManager(this.overLayer, (from, fromSlot, to, toSlot) => this.onDrop(from, fromSlot, to, toSlot));
    this.drag.onStart = () => this.tip.hide();

    const self = this;
    this.env = {
      get ctx() {
        return self.ctx;
      },
      tip: this.tip,
      drag: this.drag,
      get ps() {
        return self.ps;
      },
      hover: null,
      toast: (text, kind = 'info') => this.toast(text, kind),
      act: (res, okKind = 'good') => this.act(res, okKind),
      open: (p) => this.openPanel(p),
      close: () => this.closePanel(),
      refresh: () => this.renderPanelNow(),
      showArrival: () => this.showArrival(),
    };

    this.menus = new Menus(this.layer, ctx, this.env);

    const bus = ctx.bus;
    bus.on('notify', (e) => {
      // Mientras se duerme solo pasan los peligros: el resto se resume al despertar («Mientras dormías…»).
      if (this.ctx.sim.state.player.sleeping && e.kind !== 'danger') return;
      this.toast(e.text, e.kind);
    });
    bus.on('itemGained', (e) => this.hud.itemGained(e.id, e.qty));
    bus.on('unlocked', (e) => this.hud.unlocked(e.key, e.name));
    bus.on('newDay', (e) => this.hud.newDay(e.day));
    bus.on('worldEventStarted', (e) => {
      this.hud.eventStarted(e.eventId);
      if (e.type === 'llegada') this.arrivalPending = true;
    });
    bus.on('tutorialStep', () => this.hud.tutorialDone());

    bus.on('simReplaced', (e) => {
      if (e.reason === 'new') this.hud.newDay(1);
    });

    // Depuración y pruebas automáticas: pantalla de menú actual y subpantallas.
    registerDebug('uiScreen', (() => this.menus.screen) as never);
    registerDebug('uiMenu', ((sub: 'settings' | 'controls' | 'load' | 'save' | 'quit' | 'new') => this.menus.showSub(sub)) as never);
    // Hilo narrativo: lector de una hoja y pantalla de llegada (pruebas y capturas).
    registerDebug('uiLeer', ((n: number) => {
      this.reader.show(n);
      return this.reader.current;
    }) as never);
    registerDebug('uiLector', (() => ({ pagina: this.reader.current, quedan: Math.round(this.reader.remaining * 10) / 10 })) as never);
    registerDebug('uiLlegada', (() => this.showArrival()) as never);
    this.syncStory();

    window.addEventListener('keydown', (e) => this.onKey(e));
    // Tras un clic, el botón suelta el foco: así Espacio o Intro no lo repiten al volver al juego.
    // En fase de captura: los botones de los paneles paran la propagación de su clic y, si no,
    // conservaban el foco (y no sonaban).
    this.root.addEventListener(
      'click',
      (e) => {
        const b = (e.target as Element | null)?.closest?.('button');
        if (b) {
          // Con el teclado (Tab + Intro/Espacio, `detail` 0) un botón de menú conserva el foco para
          // seguir navegando; los menús desaparecen al volver al juego, así que no se repite nada.
          if ((e as MouseEvent).detail !== 0 || !b.closest('.ui-menus')) b.blur();
          this.sfx('ui_clic');
        }
      },
      true,
    );
    this.updateScale();
  }

  /* ================================================================== */
  /* API pública (contrato)                                              */
  /* ================================================================== */

  get panelOpen(): boolean {
    return this.panel !== null;
  }

  /** true si hay un menú (principal, pausa, muerte) a pantalla completa. */
  get menuOpen(): boolean {
    return this.menus.open;
  }

  openPanel(p: PanelRequest): void {
    const same = this.panel && JSON.stringify(this.panel) === JSON.stringify(p);
    if (!same) {
      this.ps = {};
      if (p.kind === 'inventory') this.ps.tab = p.tab ?? 'objetos';
    } else if (p.kind === 'inventory' && p.tab) this.ps.tab = p.tab;
    // Con una hoja en el lector, el Diario (J) se abre en el Cuaderno por esa hoja. Cualquier otro
    // panel retira el lector: no debe tapar sus botones (la hoja ya está en el Cuaderno).
    if (p.kind === 'inventory' && p.tab === 'diario' && this.reader.visible) {
      this.ps.diary = 'cuaderno';
      this.ps.page = this.reader.current;
      this.reader.hide();
    } else if (!same && this.reader.visible) this.reader.hide();
    if (!this.panel) this.sfx('ui_abrir');
    this.panel = p;
    this.skipE = true;
    this.env.hover = null;
    this.tip.hide();
    this.renderPanelNow();
  }

  closePanel(): void {
    if (!this.panel) return;
    this.sfx('ui_cerrar');
    this.panel = null;
    this.ps = {};
    this.panelView = null;
    this.panelSwap = false;
    this.panelPaints = 0;
    this.env.hover = null;
    this.tip.hide();
    this.drag.cancel();
    patch(this.panelLayer, null);
    this.panelLayer.classList.remove('open');
  }

  setPrompt(p: PromptInfo | null): void {
    this.hud.setPrompt(p);
  }

  toast(text: string, kind: 'info' | 'good' | 'warn' | 'danger' = 'info'): void {
    this.hud.toast(text, kind);
  }

  showMainMenu(): void {
    this.closePanel();
    this.menus.showMain();
  }

  showPauseMenu(): void {
    this.closePanel();
    this.menus.showPause();
  }

  showDeath(): void {
    this.closePanel();
    this.hud.clearToasts();
    this.menus.showDeath();
  }

  hideMenus(): void {
    this.menus.hide();
  }

  /** Reinicio tras nueva partida / carga. */
  reset(): void {
    this.closePanel();
    this.hud.reset();
    this.tip.hide();
    this.drag.cancel();
    this.reader.hide();
    this.syncStory();
  }

  /**
   * Toma como vistas las hojas leídas y la llegada de la partida actual: al cargar una partida no
   * se abre el lector ni la pantalla de llegada por lo que ya pasó.
   */
  private syncStory(): void {
    const story = this.ctx.sim.state.story;
    this.seenPages = [...(story?.pages ?? [])];
    this.seenArrived = !!story?.arrived;
    this.arrivalPending = false;
  }

  /**
   * Pantalla de llegada a Puerto Esperanza (si ya se llegó). Pausa la partida, sale del modo
   * construcción y cierra el panel abierto; «Seguir navegando» (o Esc) la cierra.
   */
  showArrival(): boolean {
    const ctx = this.ctx;
    const sum = ctx.sim.arrivalSummary();
    if (!sum || !ctx.sim.state.player.alive || ctx.mode === 'menu' || ctx.mode === 'dead') return false;
    if (ctx.mode === 'build') ctx.setMode('play');
    this.closePanel();
    this.reader.hide();
    ctx.paused = true;
    // La celebración se ve sin la mano en primera persona delante (vuelve sola al seguir jugando).
    ctx.interaction?.hideViewModel();
    this.menus.showArrival((eventId) => {
      // El mercado del muelle: un evento de mercante normal.
      if (ctx.sim.state.events.active.some((e) => e.id === eventId)) this.openPanel({ kind: 'trade', eventId });
      else this.toast('El mercado del muelle ya ha cerrado', 'info');
    });
    return true;
  }

  /** Lector de hojas y llegada: comprueba cada frame lo que ha cambiado en `state.story`. */
  private watchStory(): void {
    const ctx = this.ctx;
    const story = ctx.sim.state.story;
    const pages = story?.pages ?? [];
    if (pages.length !== this.seenPages.length || pages.some((n, i) => n !== this.seenPages[i])) {
      const fresh = newPages(this.seenPages, pages);
      this.seenPages = [...pages];
      const last = fresh[fresh.length - 1];
      if (last !== undefined && ctx.mode === 'play') {
        // Leída desde la mochila (o con el Cuaderno a la vista): el inventario pasa al Cuaderno del
        // Diario por esa hoja. Si no, el lector (con otro panel abierto, espera oculto a que se cierre).
        if (pageDestination(this.panel?.kind) === 'cuaderno') {
          this.ps.tab = 'diario';
          this.ps.diary = 'cuaderno';
          this.ps.page = last;
          this.renderPanelNow();
        } else this.reader.show(last);
      }
    }
    const arrived = !!story?.arrived;
    if (arrived && !this.seenArrived) this.arrivalPending = true;
    this.seenArrived = arrived;
    if (this.arrivalPending && !this.menuOpen && (ctx.mode === 'play' || ctx.mode === 'build') && ctx.sim.state.player.alive && !ctx.sim.state.player.sleeping) {
      this.arrivalPending = false;
      this.showArrival();
    }
  }

  update(dtReal: number): void {
    this.updateScale();
    const ctx = this.ctx;
    // Si el panel ya no tiene sentido (muerte, construcción, sueño), se cierra.
    if (this.panel && (ctx.mode !== 'play' || !ctx.sim.state.player.alive || ctx.sim.state.player.sleeping)) this.closePanel();
    // E cierra el panel (salvo en el frame en que se abrió).
    if (this.panel && !this.skipE && ctx.input.pressed('KeyE')) {
      ctx.input.consume('KeyE');
      this.closePanel();
    }
    this.skipE = false;

    if (this.panel) {
      this.panelTimer += dtReal;
      if (this.panelTimer >= PANEL_REFRESH) this.renderPanelNow();
    }
    this.watchStory();
    // La pantalla de llegada se ve sola, sobre la celebración: sin HUD ni avisos encima.
    this.hud.update(dtReal, { panelOpen: this.panelOpen, menuOpen: this.menuOpen, quiet: this.menus.screen === 'arrival' });
    this.reader.update(dtReal, { hidden: this.menuOpen || this.panelOpen || ctx.mode !== 'play' || !ctx.sim.state.player.alive });
    this.menus.update(dtReal);
    this.tip.update(dtReal);
    if (ctx.mode === 'menu') this.menuCamera(dtReal);
  }

  /**
   * Plano cinematográfico tras el menú principal: la cámara del jugador (que nadie mueve en el
   * modo menú) orbita despacio alrededor del barco, con el barco a la derecha del título.
   * Al empezar o cargar partida, el controlador del jugador vuelve a tomar la cámara.
   */
  private menuCamera(dt: number): void {
    const cam = this.ctx.player?.camera;
    if (!cam) return;
    this.menuTime += Math.min(0.1, Math.max(0, dt));
    const ship = this.ctx.sim.state.ship;
    const cx = (ship.length * CELL) / 2 - SHIP_ORIGIN_X;
    const r = Math.max(44, ship.length * CELL * 1.1);
    const a = 0.75 + this.menuTime * 0.03;
    const local = cam.position.clone().set(cx + Math.cos(a) * r, 10.5 + Math.sin(this.menuTime * 0.21) * 1.1, Math.sin(a) * r);
    const target = cam.position.clone().set(cx, 3.2, 0);
    // La cámara puede colgar del barco (tras una partida) o de nada (al arrancar el juego).
    cam.position.copy(local);
    if (cam.parent) cam.parent.localToWorld(target);
    cam.lookAt(target);
    cam.rotateY(0.26);
  }

  /* ================================================================== */
  /* Interno                                                             */
  /* ================================================================== */

  private act(res: ActionResult | null | undefined, okKind: NotifyKind): boolean {
    if (!res) return false;
    if (!res.ok) this.sfx('ui_error');
    if (res.msg) this.toast(res.msg, res.ok ? okKind : 'warn');
    else if (!res.ok) this.toast('No se puede hacer eso ahora', 'warn');
    this.renderPanelNow();
    this.menus.refresh();
    return res.ok;
  }

  private onDrop(from: InvRef, fromSlot: number, to: InvRef, toSlot: number): void {
    const res = this.ctx.sim.moveItem(from, fromSlot, to, toSlot);
    if (res.ok) this.sfx('ui_mover');
    if (!res.ok || res.msg) this.act(res, 'info');
    else this.renderPanelNow();
  }

  /** Sonido de interfaz (sin posición): lo reproduce el área de audio si lo conoce. */
  private sfx(name: string): void {
    this.ctx.bus.emit('sfx', { name });
  }

  private renderPanelNow(): void {
    this.panelTimer = 0;
    const req = this.panel;
    if (!req) return;
    let view;
    try {
      view = renderPanel(this.env, req);
    } catch (err) {
      console.error('[UI] error al pintar el panel', err);
      view = null;
    }
    if (!view) {
      this.closePanel();
      return;
    }
    this.panelLayer.classList.add('open');
    // Al cambiar de pestaña (Objetos → Diario → Cuaderno…) el panel se monta entero otra vez, sin la
    // animación de entrada: reutilizar el mismo elemento con un contenido muy distinto dejaba sin
    // repintar parte de su fondo en Chromium.
    const viewKey = panelViewKey(req, this.ps);
    if (viewKey !== this.panelView) {
      // La clase se queda mientras viva este elemento: quitarla relanzaría la animación de entrada.
      this.panelSwap = this.panelView !== null && this.panelView.split(':')[0] === req.kind;
      if (this.panelSwap) this.tip.hide();
      this.panelView = viewKey;
      this.panelPaints = 0;
    }
    const swapped = this.panelSwap;
    // Al segundo repintado (≈0,15 s después de montarlo) una clase sin efecto visible obliga a repintar
    // el panel entero: con mucho contenido nuevo, Chromium podía dejar sin pintar parte de su fondo.
    const settled = this.panelPaints++ > 0;
    patch(
      this.panelLayer,
      h(
        'div',
        { key: 'wrap', class: 'pn-wrap' },
        h('div', {
          class: 'pn-backdrop interactive',
          onmousedown: (e: MouseEvent) => {
            if (e.target === e.currentTarget) this.closePanel();
          },
        }),
        h(
          'div',
          { key: `pn-${viewKey}`, class: cx('pn', 'interactive', `pn-${req.kind}`, swapped && 'pn-swap', settled && 'pn-settled', view.cls), role: 'dialog', 'aria-label': view.title },
          h(
            'header',
            { class: 'pn-head' },
            view.glyph ? gl(view.glyph, 'gl pn-glyph') : null,
            h('div', { class: 'pn-titles' }, h('h2', { class: 'pn-title' }, view.title), view.subtitle ? h('div', { class: 'pn-sub' }, view.subtitle) : null),
            view.head ?? null,
            h(
              'button',
              { class: 'pn-close', type: 'button', title: 'Cerrar (Esc, E o Tab)', onclick: () => this.closePanel() },
              kbd('Esc'),
              gl('close'),
            ),
          ),
          view.tabs ?? null,
          h('div', { class: 'pn-body' }, view.body),
          view.foot ? h('footer', { class: 'pn-foot' }, view.foot) : null,
        ),
      ),
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (this.menus.onKey(e)) {
      this.ctx.input.consume(e.code);
      return;
    }
    // F1: ocultar o volver a mostrar los consejos del tutorial (sin necesidad de ratón).
    if (e.code === 'F1' && !e.repeat && (this.ctx.mode === 'play' || this.ctx.mode === 'build') && !this.menuOpen) {
      e.preventDefault();
      this.toggleTutorial();
      return;
    }
    // Con un panel abierto y el ratón sobre una ranura del jugador, 1-8 la lleva a la barra rápida.
    if (this.panel && /^Digit[1-8]$/.test(e.code)) {
      const hv = this.env.hover;
      if (hv && hv.ref.kind === 'player') {
        const to = Number(e.code.slice(5)) - 1;
        if (to !== hv.slot) {
          const res = this.ctx.sim.moveItem({ kind: 'player' }, hv.slot, { kind: 'player' }, to);
          if (!res.ok) this.act(res, 'info');
          else {
            this.env.hover = { ref: hv.ref, slot: to };
            this.renderPanelNow();
          }
        }
      }
    }
  }

  /** Oculta o muestra los consejos (estado de la partida y ajuste global). */
  private toggleTutorial(): void {
    const sim = this.ctx.sim;
    const visible = this.ctx.settings.tutorial && !sim.state.tutorial.dismissed;
    if (visible) {
      dismissTutorial(sim);
      this.toast('Consejos ocultos. F1 los vuelve a mostrar', 'info');
    } else {
      resumeTutorial(sim);
      if (!this.ctx.settings.tutorial) {
        this.ctx.settings.tutorial = true;
        this.ctx.saveSettings();
      }
      this.toast('Consejos activados. F1 los oculta', 'info');
    }
  }

  /** Escala de la interfaz según el tamaño de la ventana (1 a 1280×720, ~1,3 a 1920×1080). */
  private updateScale(): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    const key = `${w}x${hgt}`;
    if (key === this.lastSize) return;
    this.lastSize = key;
    const base = Math.min(w / 1280, hgt / 720);
    const s = Math.max(0.72, Math.min(1.6, 1 + (base - 1) * 0.62));
    this.scale = Math.round(s * 100) / 100;
    // Con `zoom` estandarizado (Chromium 128+, Firefox 126+), los porcentajes de la capa se
    // resuelven en píxeles visuales: la capa ocupa el 100 % y solo su contenido se escala.
    for (const el of [this.layer, this.overLayer]) el.style.setProperty('zoom', String(this.scale));
    this.tip.scale = this.scale;
    this.drag.scale = this.scale;
  }

  /** Para depuración y pruebas: clave del inventario bajo el cursor. */
  get hoverKey(): string | null {
    return this.env.hover ? `${refKey(this.env.hover.ref)}#${this.env.hover.slot}` : null;
  }
}

/**
 * Clave de la vista de un panel: el tipo y, en el inventario, la pestaña y la vista del Diario.
 * Cambia al cambiar de pestaña (y entonces el panel se monta de nuevo); no cambia al repintar.
 */
export function panelViewKey(req: PanelRequest, ps: PanelState): string {
  return req.kind === 'inventory' ? `${req.kind}:${ps.tab ?? 'objetos'}:${ps.tab === 'diario' ? (ps.diary ?? 'log') : ''}` : req.kind;
}

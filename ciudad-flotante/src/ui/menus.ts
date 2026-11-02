/**
 * MENÚS a pantalla completa:
 *  - principal (título sobre la escena 3D, Continuar, Nueva partida, Cargar, Ajustes, Controles,
 *    créditos);
 *  - pausa (Continuar, Guardar en ranura, Cargar, Ajustes, Controles, Salir al menú);
 *  - muerte (causa, días sobrevividos, estadísticas, cargar la última partida o empezar otra);
 *  - llegada a Puerto Esperanza (final del cuaderno del Albatros: story.ts `arrivalView`);
 *  - y sus pantallas: guardar, cargar (con borrar), ajustes (→ ctx.saveSettings) y controles.
 * Esc vuelve atrás desde las subpantallas. Teclado: Tab y Mayús+Tab (o las flechas arriba y abajo)
 * recorren los botones; Intro o Espacio pulsan el que tiene el foco.
 */
import type { GameContext } from '../game/context';
import { DEFAULT_SETTINGS, type Quality, type Settings } from '../game/types';
import { slotName, type SaveSlotInfo } from '../sim/save';
import { dayOf, clockText } from '../sim/time';
import { resumeTutorial } from '../sim/tutorial';
import { currentRegion } from '../sim/voyage';
import type { UiEnv } from './env';
import { realDate } from './fmt';
import { latestPlayableSave, sortedSaves } from './model';
import { cx, h, patch, type VInput, type VNode } from './vdom';
import { arrivalView } from './story';
import { btn, gl, kbd } from './widgets';

type Root = 'main' | 'pause' | 'death' | 'arrival';
type Sub = 'settings' | 'controls' | 'load' | 'save' | 'quit' | 'new';

const MANUAL_SLOTS = ['manual', 'manual2', 'manual3'];

export class Menus {
  readonly el: HTMLElement;
  private root: Root | null = null;
  private sub: Sub | null = null;
  private confirm: string | null = null;
  private timer = 0;
  private saves: SaveSlotInfo[] | null = null;
  /** Pantalla de llegada: qué hacer con «Ir al mercado del muelle». */
  private onMarket: ((eventId: number) => void) | null = null;
  /** Se navega con el teclado: al cambiar de pantalla, el foco pasa al primer control. */
  private kbNav = false;

  constructor(
    layer: HTMLElement,
    private readonly ctx: GameContext,
    private readonly env: UiEnv,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'ui-menus';
    layer.appendChild(this.el);
    // Con el ratón ya no se navega con el teclado (no se mueve el foco por sorpresa).
    this.el.addEventListener?.('mousedown', () => (this.kbNav = false), true);
  }

  get open(): boolean {
    return this.root !== null;
  }

  /** Pantalla actual (para pruebas): 'main', 'pause/settings'… */
  get screen(): string | null {
    return this.root ? (this.sub ? `${this.root}/${this.sub}` : this.root) : null;
  }

  showMain(): void {
    this.go('main');
  }

  showPause(): void {
    this.go('pause');
  }

  showDeath(): void {
    this.go('death');
  }

  /** Pantalla de llegada a Puerto Esperanza. `onMarket` abre el comercio con el mercado del muelle. */
  showArrival(onMarket: (eventId: number) => void): void {
    this.onMarket = onMarket;
    this.go('arrival');
  }

  /** Abre una subpantalla (depuración y pruebas). */
  showSub(sub: Sub): void {
    if (!this.root) return;
    this.sub = sub;
    this.confirm = null;
    this.refresh(true);
  }

  hide(): void {
    this.root = null;
    this.sub = null;
    this.confirm = null;
    patch(this.el, null);
    this.el.classList.remove('open');
  }

  private go(root: Root): void {
    if (root === 'pause') this.ctx.bus.emit('sfx', { name: 'ui_abrir' });
    this.root = root;
    this.sub = null;
    this.confirm = null;
    this.refresh(true);
  }

  /**
   * Teclado: Esc vuelve atrás desde una subpantalla; Tab/Mayús+Tab y las flechas mueven el foco por
   * los botones del menú (el juego se queda Tab y Espacio para sí, así que aquí se hace a mano) y
   * Espacio pulsa el botón con el foco. Devuelve true si consumió la tecla.
   */
  onKey(e: KeyboardEvent): boolean {
    if (!this.root) return false;
    if (e.code === 'Tab' || e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      this.kbNav = true;
      this.moveFocus(e.code === 'ArrowUp' || (e.code === 'Tab' && e.shiftKey) ? -1 : 1);
      return true;
    }
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      const a = typeof document !== 'undefined' ? document.activeElement : null;
      if (a instanceof HTMLElement && this.el.contains(a) && (a.tagName === 'BUTTON' || a.getAttribute('role') === 'switch')) {
        e.preventDefault();
        this.kbNav = true;
        if (!e.repeat) a.click();
        return true;
      }
      return false;
    }
    if (e.code !== 'Escape') return false;
    if (this.confirm) {
      this.confirm = null;
      this.refresh();
      return true;
    }
    if (this.sub) {
      this.sub = null;
      this.refresh();
      return true;
    }
    return false;
  }

  /** Elementos del menú que pueden recibir el foco, en orden de lectura. */
  focusables(): HTMLElement[] {
    const list = Array.from(this.el.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'));
    return list.filter((el) => !(el as HTMLButtonElement).disabled && el.offsetParent !== null);
  }

  /** Lleva el foco al siguiente (dir 1) o al anterior (dir −1) elemento del menú. */
  moveFocus(dir: 1 | -1): void {
    const list = this.focusables();
    if (!list.length) return;
    const cur = list.indexOf(document.activeElement as HTMLElement);
    const next = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : (cur + dir + list.length) % list.length;
    list[next]!.focus();
  }

  update(dt: number): void {
    if (!this.root) return;
    // La lista de guardados solo se relee al cambiar de pantalla o tras guardar/borrar
    // (leerla obliga a abrir cada partida del almacenamiento local).
    this.timer += dt;
    if (this.timer > 5) this.refresh();
  }

  /** Repinta el menú. `reload` vuelve a leer la lista de partidas guardadas. */
  refresh(reload = false): void {
    this.timer = 0;
    if (!this.root) return;
    if (reload || this.saves === null) {
      try {
        this.saves = sortedSaves(this.ctx.listSaves());
      } catch {
        this.saves = [];
      }
    }
    this.el.classList.add('open');
    patch(this.el, this.render());
    // Navegando con el teclado, si el control con el foco desapareció (otra pantalla), el foco
    // pasa al primero de la nueva: Tab, Intro y Esc encadenan pantallas sin ratón.
    if (this.kbNav && typeof document !== 'undefined') {
      const a = document.activeElement;
      if (!a || !this.el.contains(a)) this.focusables()[0]?.focus();
    }
  }

  private get list(): SaveSlotInfo[] {
    return this.saves ?? [];
  }

  /* ================================================================== */
  /* Pintado                                                             */
  /* ================================================================== */

  private render(): VNode {
    switch (this.root) {
      case 'main':
        return this.mainScreen();
      case 'pause':
        return this.pauseScreen();
      case 'arrival':
        return this.arrivalScreen();
      default:
        return this.deathScreen();
    }
  }

  private back(): VNode {
    return btn('Volver', () => {
      this.sub = null;
      this.confirm = null;
      this.refresh();
    }, { glyph: 'back', small: true, cls: 'menu-back' });
  }

  private subCard(): VNode | null {
    switch (this.sub) {
      case 'settings':
        return this.settingsCard();
      case 'controls':
        return this.controlsCard();
      case 'load':
        return this.loadCard();
      case 'save':
        return this.saveCard();
      case 'quit':
        return this.quitCard();
      case 'new':
        return this.newCard();
      default:
        return null;
    }
  }

  private menuButton(label: string, glyphName: string, onClick: () => void, o: { sub?: VInput; primary?: boolean; disabled?: boolean; key?: string } = {}): VNode {
    return h(
      'button',
      {
        key: o.key ?? label,
        type: 'button',
        class: cx('menu-btn', o.primary && 'primary'),
        disabled: !!o.disabled,
        onclick: () => {
          if (!o.disabled) onClick();
        },
      },
      gl(glyphName),
      h('span', { class: 'mb-text' }, h('b', null, label), o.sub ? h('small', null, o.sub) : null),
    );
  }

  /* ---------------- Principal ---------------- */

  private mainScreen(): VNode {
    const latest = latestPlayableSave(this.list);
    const card = this.subCard();
    return h(
      'div',
      { key: 'main', class: 'menu-screen menu-main interactive' },
      h('div', { class: 'menu-shade' }),
      h(
        'div',
        { class: 'menu-side' },
        h('div', { class: 'logo' }, h('div', { class: 'logo-mark', html: LOGO_SVG }), h('h1', null, 'Ciudad Flotante'), h('div', { class: 'tagline' }, 'Sobrevive, fabrica y construye a bordo de un barco que es tu hogar')),
        h(
          'nav',
          { class: 'menu-btns' },
          latest
            ? this.menuButton('Continuar', 'play', () => this.load(latest.slot), { primary: true, sub: `${latest.label} · ${realDate(latest.savedAt)}`, key: 'cont' })
            : null,
          this.menuButton('Nueva partida', 'ship', () => {
            if (latest) this.openSub('new');
            else this.ctx.newGame();
          }, { primary: !latest, key: 'new' }),
          this.menuButton('Cargar partida', 'folder', () => this.openSub('load'), { disabled: this.list.length === 0, sub: this.list.length ? `${this.list.length} guardada${this.list.length === 1 ? '' : 's'}` : 'No hay partidas guardadas', key: 'load' }),
          this.menuButton('Ajustes', 'gear', () => this.openSub('settings'), { key: 'set' }),
          this.menuButton('Controles', 'keyboard', () => this.openSub('controls'), { key: 'ctl' }),
        ),
        h('div', { class: 'credits' }, 'Un survival low-poly en el navegador. Hecho con Three.js, TypeScript y la tipografía Nunito. Sonido procedural.'),
      ),
      card ? h('div', { class: 'menu-card-wrap' }, card) : null,
    );
  }

  private newCard(): VNode {
    return h(
      'div',
      { class: 'menu-card' },
      h('h2', null, gl('ship'), 'Nueva partida'),
      h('p', { class: 'muted' }, 'Zarpas de puerto con lo justo, dos tripulantes y un barco por hacer. Tus partidas guardadas en ranuras no se tocan; el guardado automático pasará a ser el de la nueva travesía.'),
      h('div', { class: 'menu-row' }, this.back(), btn('Zarpar', () => this.ctx.newGame(), { primary: true, glyph: 'play' })),
    );
  }

  /* ---------------- Pausa ---------------- */

  private pauseScreen(): VNode {
    const sim = this.ctx.sim;
    const st = sim.state;
    const card = this.subCard();
    return h(
      'div',
      { key: 'pause', class: 'menu-screen menu-pause interactive' },
      h('div', { class: 'menu-blur' }),
      card
        ? h('div', { class: 'menu-center' }, card)
        : h(
            'div',
            { class: 'menu-center' },
            h(
              'div',
              { class: 'menu-card pause-card' },
              h('h2', null, gl('anchor'), 'Pausa'),
              h('div', { class: 'muted small' }, `Día ${dayOf(st.time)} · ${clockText(st.time)} · ${currentRegion(sim).name}`),
              h(
                'nav',
                { class: 'menu-btns' },
                this.menuButton('Continuar', 'play', () => this.resume(), { primary: true, sub: h('span', null, kbd('Esc')) }),
                this.menuButton('Guardar partida', 'save', () => this.openSub('save')),
                this.menuButton('Cargar partida', 'folder', () => this.openSub('load'), { disabled: this.list.length === 0 }),
                this.menuButton('Ajustes', 'gear', () => this.openSub('settings')),
                this.menuButton('Controles', 'keyboard', () => this.openSub('controls')),
                this.menuButton('Salir al menú principal', 'exit', () => this.openSub('quit')),
              ),
            ),
          ),
    );
  }

  private resume(): void {
    this.ctx.paused = false;
    this.hide();
  }

  /* ---------------- Llegada a Puerto Esperanza ---------------- */

  private arrivalScreen(): VNode {
    const sim = this.ctx.sim;
    const sum = sim.arrivalSummary();
    return h(
      'div',
      { key: 'arrival', class: 'menu-screen menu-arrival interactive' },
      h('div', { class: 'arrival-shade' }),
      h(
        'div',
        { class: 'arrival-wrap' },
        sum
          ? arrivalView(sim, sum, {
              onContinue: () => this.resume(),
              onMarket: (id) => {
                this.resume();
                this.onMarket?.(id);
              },
            })
          : h('div', { class: 'menu-card' }, h('p', null, 'Aún no habéis llegado a Puerto Esperanza.'), btn('Volver', () => this.resume(), { primary: true })),
      ),
    );
  }

  private quitCard(): VNode {
    return h(
      'div',
      { class: 'menu-card' },
      h('h2', null, gl('exit'), 'Salir al menú principal'),
      h('p', { class: 'muted' }, 'Lo que no hayas guardado se perderá. Puedes guardar ahora en el guardado automático.'),
      h(
        'div',
        { class: 'menu-row' },
        this.back(),
        btn('Salir sin guardar', () => this.quitToMenu(false), { danger: true }),
        btn('Guardar y salir', () => this.quitToMenu(true), { primary: true, glyph: 'save' }),
      ),
    );
  }

  private quitToMenu(save: boolean): void {
    if (save) this.ctx.saveGame('auto');
    this.ctx.paused = false;
    this.ctx.setMode('menu');
    this.showMain();
  }

  /* ---------------- Muerte ---------------- */

  private deathScreen(): VNode {
    const st = this.ctx.sim.state;
    const p = st.player;
    const days = p.stats.daysSurvived;
    const latest = latestPlayableSave(this.list);
    const card = this.subCard();
    const s = p.stats;
    return h(
      'div',
      { key: 'death', class: 'menu-screen menu-death interactive' },
      h('div', { class: 'death-shade' }),
      card
        ? h('div', { class: 'menu-center' }, card)
        : h(
            'div',
            { class: 'menu-center' },
            h(
              'div',
              { class: 'death-card' },
              h('div', { class: 'death-skull', html: SKULL_SVG }),
              h('h1', null, 'Has muerto'),
              h('p', { class: 'death-cause' }, p.deathCause ?? 'El mar se cobró su precio'),
              h('p', { class: 'muted' }, days <= 0 ? `No llegaste a completar el primer día a bordo (día ${dayOf(st.time)}, ${clockText(st.time)}).` : `Sobreviviste ${days} ${days === 1 ? 'día' : 'días'} a bordo.`),
              h(
                'div',
                { class: 'death-stats' },
                stat('Recorrido', `${Math.round(st.voyage.distance)} mi`),
                stat('Fabricados', s.itemsCrafted),
                stat('Restos rescatados', s.debrisCollected),
                stat('Peces', s.fishCaught),
                stat('Módulos', s.modulesBuilt),
                stat('Habitantes', st.npcs.length),
              ),
              h(
                'div',
                { class: 'menu-row center' },
                latest ? btn(['Cargar la última partida', h('small', null, ` (${latest.label})`)], () => this.load(latest.slot), { primary: true, glyph: 'folder' }) : null,
                btn('Nueva partida', () => this.ctx.newGame(), { primary: !latest, glyph: 'ship' }),
                this.list.length > 1 ? btn('Cargar otra…', () => this.openSub('load'), { glyph: 'folder' }) : null,
                btn('Menú principal', () => {
                  this.ctx.setMode('menu');
                  this.showMain();
                }, { glyph: 'exit' }),
              ),
            ),
          ),
    );
  }

  /* ---------------- Guardar / cargar ---------------- */

  private openSub(sub: Sub): void {
    this.sub = sub;
    this.confirm = null;
    this.refresh(true);
  }

  private load(slot: string): void {
    const ok = this.ctx.loadGame(slot);
    if (!ok) this.env.toast('No se pudo cargar la partida', 'danger');
  }

  private saveCard(): VNode {
    const bySlot = new Map(this.list.map((s) => [s.slot, s]));
    return h(
      'div',
      { class: 'menu-card wide' },
      h('h2', null, gl('save'), 'Guardar partida'),
      h(
        'div',
        { class: 'save-list' },
        MANUAL_SLOTS.map((slot) => {
          const info = bySlot.get(slot);
          const confirming = this.confirm === `save:${slot}`;
          return h(
            'div',
            { key: slot, class: cx('save-row', !info && 'empty') },
            gl(info ? 'save' : 'plus', 'gl save-ico'),
            h('div', { class: 'save-info' }, h('b', null, slotName(slot)), h('small', { class: 'muted' }, info ? `${info.label} · ${realDate(info.savedAt)}` : 'Vacía')),
            confirming
              ? h('div', { class: 'save-act' }, h('span', { class: 'warn small' }, '¿Sobrescribir?'), btn('No', () => this.setConfirm(null), { small: true }), btn('Sí', () => this.doSave(slot), { small: true, primary: true }))
              : h('div', { class: 'save-act' }, btn(info ? 'Sobrescribir' : 'Guardar aquí', () => (info ? this.setConfirm(`save:${slot}`) : this.doSave(slot)), { small: true, primary: !info, glyph: 'save' })),
          );
        }),
      ),
      h('div', { class: 'faint small' }, 'El juego también guarda solo al empezar cada día (guardado automático).'),
      h('div', { class: 'menu-row' }, this.back()),
    );
  }

  private doSave(slot: string): void {
    this.ctx.saveGame(slot);
    this.confirm = null;
    this.refresh(true);
  }

  private setConfirm(c: string | null): void {
    this.confirm = c;
    this.refresh();
  }

  private loadCard(): VNode {
    return h(
      'div',
      { class: 'menu-card wide' },
      h('h2', null, gl('folder'), 'Cargar partida'),
      this.list.length
        ? h(
            'div',
            { class: 'save-list scroll' },
            this.list.map((info) => {
              const confirming = this.confirm === `del:${info.slot}`;
              const dead = info.alive === false;
              return h(
                'div',
                { key: info.slot, class: cx('save-row', info.corrupt && 'corrupt') },
                gl(info.corrupt ? 'alert' : dead ? 'skull' : info.slot === 'auto' ? 'clock' : 'save', 'gl save-ico'),
                h(
                  'div',
                  { class: 'save-info' },
                  h('b', null, info.slotName ?? slotName(info.slot)),
                  h('small', { class: 'muted' }, info.corrupt ? 'Partida dañada: no se puede cargar' : `${info.label}${dead ? ' · (muerto)' : ''} · ${realDate(info.savedAt)}`),
                ),
                confirming
                  ? h('div', { class: 'save-act' }, h('span', { class: 'warn small' }, '¿Borrar para siempre?'), btn('No', () => this.setConfirm(null), { small: true }), btn('Borrar', () => this.doDelete(info.slot), { small: true, danger: true }))
                  : h(
                      'div',
                      { class: 'save-act' },
                      btn('Cargar', () => this.load(info.slot), { small: true, primary: true, disabled: !!info.corrupt, glyph: 'play' }),
                      btn('', () => this.setConfirm(`del:${info.slot}`), { small: true, glyph: 'trash', title: 'Borrar', cls: 'icon-btn' }),
                    ),
              );
            }),
          )
        : h('p', { class: 'muted' }, 'No hay partidas guardadas.'),
      h('div', { class: 'menu-row' }, this.back()),
    );
  }

  private doDelete(slot: string): void {
    this.ctx.deleteSave(slot);
    this.confirm = null;
    this.env.toast('Partida borrada', 'info');
    this.refresh(true);
  }

  /* ---------------- Ajustes ---------------- */

  private set<K extends keyof Settings>(k: K, v: Settings[K]): void {
    this.ctx.settings[k] = v;
    // La perspectiva es la preferencia del jugador (V también la cambia): se aplica ya.
    if (k === 'perspective' && this.ctx.player) this.ctx.player.perspective = v as Settings['perspective'];
    this.ctx.saveSettings();
    this.refresh();
  }

  /**
   * Restablece los ajustes. La perspectiva también se aplica al jugador (como al elegirla), para
   * que el control «Cámara» y la cámara real no queden distintos.
   */
  resetSettings(): void {
    Object.assign(this.ctx.settings, DEFAULT_SETTINGS);
    if (this.ctx.player) this.ctx.player.perspective = this.ctx.settings.perspective;
    this.ctx.saveSettings();
    this.refresh();
  }

  /**
   * ¿Hay que recargar para que la calidad elegida quede completa? (el suavizado de bordes solo se
   * fija al crear el contexto WebGL: `Renderer.needsReloadFor`).
   */
  qualityNeedsReload(): boolean {
    try {
      return !!this.ctx.renderer?.needsReloadFor?.(this.ctx.settings.quality);
    } catch {
      return false;
    }
  }

  /** Guarda (si hay partida en marcha) y recarga la página para aplicar el suavizado de bordes. */
  private reloadForQuality(): void {
    if (this.root === 'pause' && this.ctx.sim.state.player.alive) this.ctx.saveGame('auto');
    location.reload();
  }

  private settingsCard(): VNode {
    const s = this.ctx.settings;
    const reload = this.qualityNeedsReload();
    const range = (k: 'sensitivity' | 'fov' | 'volume', min: number, max: number, step: number, fmt: (v: number) => string, scale = 1): VNode =>
      h(
        'div',
        { class: 'set-range' },
        h('input', {
          type: 'range',
          min: min,
          max: max,
          step: step,
          value: String(s[k] * scale),
          'aria-label': k,
          oninput: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value) / scale;
            this.ctx.settings[k] = v;
            this.ctx.saveSettings();
            const out = (e.target as HTMLElement).parentElement?.querySelector('output');
            if (out) out.textContent = fmt(v);
          },
          onchange: () => this.refresh(),
        }),
        h('output', null, fmt(s[k])),
      );
    const toggle = (k: 'invertY' | 'tutorial' | 'showFps', after?: (v: boolean) => void): VNode =>
      h('button', {
        type: 'button',
        class: cx('switch', s[k] && 'on'),
        role: 'switch',
        'aria-checked': s[k] ? 'true' : 'false',
        onclick: () => {
          const v = !s[k];
          this.set(k, v);
          after?.(v);
        },
      }, h('i'));
    const seg = <T extends string>(k: 'quality' | 'perspective', options: [T, string][]): VNode =>
      h(
        'div',
        { class: 'seg' },
        options.map(([v, label]) =>
          h('button', { key: v, type: 'button', class: cx('seg-btn', s[k] === v && 'active'), onclick: () => this.set(k, v as never) }, label),
        ),
      );
    const row = (label: string, ctrl: VNode, hint?: string): VNode => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('b', null, label), hint ? h('small', { class: 'faint' }, hint) : null), ctrl);
    return h(
      'div',
      { class: 'menu-card wide settings' },
      h('h2', null, gl('gear'), 'Ajustes'),
      h('div', { class: 'set-group' }, 'Control'),
      row('Sensibilidad del ratón', range('sensitivity', 0.5, 6, 0.1, (v) => v.toFixed(1))),
      row('Invertir eje vertical', toggle('invertY')),
      row('Cámara', seg('perspective', [['first', 'Primera persona'], ['third', 'Tercera persona']]), 'En partida también se cambia con V'),
      h('div', { class: 'set-group' }, 'Imagen'),
      row('Campo de visión', range('fov', 55, 100, 1, (v) => `${Math.round(v)}°`)),
      row('Calidad gráfica', seg<Quality>('quality', [['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']]), 'Baja si el juego va a tirones'),
      reload
        ? h(
            'div',
            { class: 'set-reload' },
            gl('info'),
            h('span', null, s.quality === 'baja' ? 'Ya va en calidad baja, pero el suavizado de bordes (y su coste) sigue hasta recargar la página.' : 'El suavizado de bordes de esta calidad se aplica al recargar la página.'),
            btn(this.root === 'pause' ? 'Guardar y recargar' : 'Recargar ahora', () => this.reloadForQuality(), { small: true, glyph: 'save', title: this.root === 'pause' ? 'Guarda en el guardado automático y recarga: luego, «Continuar»' : 'Recarga la página' }),
          )
        : null,
      row('Mostrar FPS', toggle('showFps')),
      h('div', { class: 'set-group' }, 'Juego'),
      row('Volumen', range('volume', 0, 100, 1, (v) => `${Math.round(v * 100)} %`, 100)),
      row(
        'Consejos (tutorial)',
        toggle('tutorial', (v) => {
          if (v && this.ctx.sim.state.tutorial.dismissed) resumeTutorial(this.ctx.sim);
        }),
        'Consejos breves que no interrumpen',
      ),
      h(
        'div',
        { class: 'menu-row' },
        this.back(),
        btn('Valores por defecto', () => this.resetSettings(), { small: true }),
      ),
    );
  }

  /* ---------------- Controles ---------------- */

  private controlsCard(): VNode {
    const group = (title: string, rows: [VInput, string][]): VNode =>
      h('div', { class: 'ctl-group' }, h('h4', null, title), h('dl', null, rows.map(([k, v], i) => [h('dt', { key: `k${i}` }, k), h('dd', { key: `v${i}` }, v)])));
    return h(
      'div',
      { class: 'menu-card wide controls' },
      h('h2', null, gl('keyboard'), 'Controles'),
      h(
        'div',
        { class: 'ctl-grid' },
        group('Movimiento', [
          [[kbd('W'), kbd('A'), kbd('S'), kbd('D')], 'Moverse'],
          [kbd('Mayús'), 'Correr'],
          [kbd('Espacio'), 'Saltar'],
          ['Ratón', 'Mirar alrededor'],
          [kbd('V'), 'Primera / tercera persona'],
        ]),
        group('Acciones', [
          [kbd('E'), 'Interactuar: beber del depósito, coger una caja, cosechar, abrir, dormir, hablar'],
          [[kbd('Mantén'), kbd('E')], 'Abrir el panel (depósito, caja, bancal) o ayudar en una obra (con martillo)'],
          [kbd('Clic'), 'Usar la herramienta en la mano'],
          [[kbd('Clic der.'), ' / ', kbd('F')], 'Comer, beber o usar lo seleccionado'],
          [kbd('R'), 'Reparar lo que miras (en el depósito: llenar una botella)'],
          [[kbd('1'), '–', kbd('8'), ' / rueda'], 'Barra rápida'],
        ]),
        group('Paneles', [
          [[kbd('Tab'), ' / ', kbd('I')], 'Inventario'],
          [kbd('C'), 'Fabricar a mano'],
          [kbd('J'), 'Diario de a bordo'],
          [kbd('B'), 'Modo construcción'],
          [kbd('Esc'), 'Pausa / cerrar'],
          [kbd('F1'), 'Ocultar o mostrar consejos'],
        ]),
        group('Inventario', [
          ['Arrastrar', 'Mover entre ranuras e inventarios'],
          [[kbd('Clic der.'), ' / doble clic'], 'Usar o empuñar el objeto (inventario)'],
          [kbd('Clic'), 'Almacenes y cajas: pasar la pila'],
          [kbd('Clic der.'), 'Almacenes y cajas: pasar la mitad'],
          [[kbd('Ctrl'), '+', kbd('Clic')], 'Almacenes y cajas: pasar una'],
          [[kbd('Mayús'), '+', kbd('Clic')], 'Pasar todo lo de ese tipo'],
          [[kbd('1'), '–', kbd('8'), ' encima'], 'Llevar a la barra rápida'],
        ]),
      ),
      h('div', { class: 'menu-row' }, this.back()),
    );
  }
}

function stat(label: string, v: string | number): VNode {
  return h('div', { class: 'stat' }, h('b', null, String(v)), h('span', null, label));
}

/** Marca del título: velero low-poly sobre olas. */
const LOGO_SVG =
  '<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M58 8 L58 58 L22 58 Z" fill="#f3ead6" stroke="#1b2227" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<path d="M63 14 L63 58 L96 58 Z" fill="#e0a458" stroke="#1b2227" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<path d="M60 6 L60 60" stroke="#1b2227" stroke-width="3"/>' +
  '<path d="M60 6 L72 10 L60 13 Z" fill="#c8553d" stroke="#1b2227" stroke-width="1.5" stroke-linejoin="round"/>' +
  '<path d="M14 60 L106 60 L96 74 L24 74 Z" fill="#2f4858" stroke="#1b2227" stroke-width="2.5" stroke-linejoin="round"/>' +
  '<path d="M20 66 L100 66" stroke="#c8553d" stroke-width="3"/>' +
  '<path d="M4 80 C14 74 22 74 32 80 C42 86 50 86 60 80 C70 74 78 74 88 80 C98 86 106 86 116 80" fill="none" stroke="#7cc4e8" stroke-width="3.5" stroke-linecap="round"/>' +
  '</svg>';

const SKULL_SVG =
  '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M32 6 C18 6 10 16 10 28 C10 36 14 41 19 44 L19 54 L45 54 L45 44 C50 41 54 36 54 28 C54 16 46 6 32 6 Z" fill="#f3ead6" stroke="#1b2227" stroke-width="3" stroke-linejoin="round"/>' +
  '<path d="M20 30 L28 28 L28 36 L21 37 Z M44 30 L36 28 L36 36 L43 37 Z" fill="#1b2227"/>' +
  '<path d="M32 38 L29 44 L35 44 Z" fill="#1b2227"/>' +
  '<path d="M25 54 L25 48 M32 54 L32 48 M39 54 L39 48" stroke="#1b2227" stroke-width="2.5"/>' +
  '</svg>';

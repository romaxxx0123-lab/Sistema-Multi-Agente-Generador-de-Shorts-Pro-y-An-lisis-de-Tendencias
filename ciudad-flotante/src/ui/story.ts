/**
 * HILO NARRATIVO EN LA INTERFAZ: el cuaderno del Albatros (data/story.ts, SISTEMAS.md §15).
 *
 *  - `notebookView`: el Cuaderno del Diario (J). Índice de las siete hojas (las leídas con su título,
 *    las que faltan como «¿?» con la región donde suelen aparecer) y la hoja abierta sobre papel
 *    pautado con letra manuscrita; las que faltan, como un hueco con su pista. Arriba, el resumen
 *    de `storyStatus` y, con el rumbo revelado, «Rumbo de la capitana: elígelo en el timón».
 *  - `PageReader`: al leer una hoja aparece una cuartilla junto al borde de la pantalla con el texto
 *    completo. No bloquea: el juego sigue, no suelta el ratón y se cierra sola cuando da tiempo a
 *    leerla (se detiene con el cursor encima). J la abre en el Cuaderno. Nunca tapa un panel: al
 *    abrir uno se retira (la hoja ya está en el Cuaderno) y, si se lee desde la mochila, la hoja se
 *    abre directamente en el Cuaderno del Diario (`pageDestination`).
 *  - `arrivalView`: la pantalla de llegada a Puerto Esperanza (textos de story.ts y estadísticas
 *    de la travesía), con «Seguir navegando» y, mientras está abierto, «Ir al mercado del muelle».
 *
 * La letra del cuaderno es Caveat (Google Fonts, como Nunito en base.css); sin red se usa una
 * cursiva del sistema.
 */
import { STORY_PAGES } from '../data/story';
import { storyStatus, type StoryPageInfo, type StoryStatus } from '../sim/actions';
import type { ArrivalSummary } from '../sim/events';
import type { Simulation } from '../sim/Simulation';
import { CAPTAIN_COURSE_LABEL } from '../sim/voyage';
import type { UiEnv } from './env';
import { num } from './fmt';
import { cx, h, patch, type VInput, type VNode } from './vdom';
import { btn, chip, gl, kbd } from './widgets';

/* ------------------------------------------------------------------ */
/* Utilidades puras                                                    */
/* ------------------------------------------------------------------ */

export const NOTEBOOK_FONT_URL = 'https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&display=swap';
let fontRequested = false;

/** Carga (una vez) la letra manuscrita del cuaderno. Sin red, el CSS cae en una cursiva del sistema. */
export function ensureNotebookFont(): void {
  if (fontRequested || typeof document === 'undefined' || !document.head) return;
  fontRequested = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = NOTEBOOK_FONT_URL;
  document.head.appendChild(link);
}

/** Párrafos de un texto del cuaderno (separados por una línea en blanco). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Segundos que el lector deja una hoja en pantalla: unas tres palabras por segundo y un margen. */
export function readingSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(16, Math.min(50, 8 + words / 3));
}

/** Hojas de `now` que no estaban en `prev` (las que se acaban de leer). */
export function newPages(prev: readonly number[], now: readonly number[]): number[] {
  const seen = new Set(prev);
  return now.filter((n) => !seen.has(n));
}

/**
 * Dónde se enseña una hoja recién leída según el panel abierto: con el inventario a la vista (se
 * leyó desde la mochila), en el Cuaderno del Diario por esa hoja; si no, en el lector, que con otro
 * panel abierto espera oculto a que se cierre (nunca tapa los botones de un panel).
 */
export function pageDestination(panelKind: string | null | undefined): 'cuaderno' | 'lector' {
  return panelKind === 'inventory' ? 'cuaderno' : 'lector';
}

/** Hoja que abre el Cuaderno: la pedida si existe; si no, la última leída; si no, la primera. */
export function defaultPage(status: Pick<StoryStatus, 'pages' | 'read'>, wanted?: number | null): number {
  if (wanted !== null && wanted !== undefined && status.pages.some((p) => p.n === wanted)) return wanted;
  return status.read.length ? status.read[status.read.length - 1]! : (status.pages[0]?.n ?? 1);
}

/* ------------------------------------------------------------------ */
/* Hojas                                                               */
/* ------------------------------------------------------------------ */

/** Firma al pie de cada hoja. */
const SIGNATURE = 'Elena Duarte, capitana del Albatros';

/** Hoja leída sobre papel pautado. */
function pageSheet(info: StoryPageInfo, total: number, extra?: VInput): VNode {
  return h(
    'article',
    { key: `p${info.n}`, class: 'nb-paper', 'aria-label': `Página ${info.n}: ${info.title ?? ''}` },
    h('div', { class: 'nb-folio' }, `pág. ${info.n} de ${total}`),
    h('h3', { class: 'nb-title' }, info.title ?? ''),
    paragraphs(info.text).map((p, i) => h('p', { key: i, class: 'nb-text' }, p)),
    h('div', { class: 'nb-sign' }, `— ${SIGNATURE}`),
    extra ?? null,
  );
}

/** Hueco de una hoja que aún no se ha leído, con su pista. */
function missingSheet(info: StoryPageInfo, total: number): VNode {
  const aboard = info.aboard !== null;
  return h(
    'article',
    { key: `m${info.n}`, class: cx('nb-paper', 'missing', aboard && 'aboard') },
    h('div', { class: 'nb-folio' }, `pág. ${info.n} de ${total}`),
    h('h3', { class: 'nb-title' }, '¿?'),
    h('p', { class: 'nb-missing' }, aboard ? 'Esta hoja ya está a bordo, pero aún no la has leído.' : 'Esta hoja falta. La capitana dejó copias en botellas y cofres a lo largo de la ruta.'),
    info.hint ? h('div', { class: cx('nb-hint', aboard && 'good') }, gl(aboard ? 'hand' : 'compass'), h('span', null, info.hint)) : null,
    !aboard && info.n > 1 ? h('div', { class: 'nb-region' }, chip(info.regionName, 'info', 'map', 'Región donde suele aparecer')) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Cuaderno del Diario                                                 */
/* ------------------------------------------------------------------ */

/** Puntos de progreso: hojas leídas y la marca de las que revelan el rumbo. */
function progressDots(st: StoryStatus): VNode {
  return h(
    'div',
    { class: 'nb-dots', title: `${st.read.length} de ${st.total} hojas leídas · con ${st.needed} se conoce el rumbo a ${st.finalRegionName}` },
    st.pages.map((p, i) => h('i', { key: p.n, class: cx(p.read && 'on', p.aboard && 'aboard', i + 1 === st.needed && 'goal') })),
  );
}

/** Vista del Cuaderno del Albatros (pestaña Diario del inventario). */
export function notebookView(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  ensureNotebookFont();
  const st = storyStatus(sim);
  const sel = defaultPage(st, env.ps.page as number | null | undefined);
  const info = st.pages.find((p) => p.n === sel) ?? st.pages[0]!;
  const idx = st.pages.indexOf(info);
  const go = (n: number): void => {
    env.ps.page = n;
    env.refresh();
  };
  const nav = h(
    'div',
    { class: 'nb-nav' },
    btn('Anterior', () => go(st.pages[idx - 1]!.n), { small: true, glyph: 'back', disabled: idx <= 0 }),
    h('span', { class: 'faint small' }, `${idx + 1} / ${st.total}`),
    btn('Siguiente', () => go(st.pages[idx + 1]!.n), { small: true, glyph: 'arrow', disabled: idx >= st.pages.length - 1 }),
  );
  const index = h(
    'ol',
    { class: 'nb-index' },
    st.pages.map((p) =>
      h(
        'li',
        { key: p.n },
        h(
          'button',
          { type: 'button', class: cx('nb-entry', p.read ? 'read' : 'missing', p.aboard && 'aboard', p.n === sel && 'sel'), onclick: () => go(p.n) },
          h('span', { class: 'nb-n' }, `Pág. ${p.n}`),
          h('span', { class: 'nb-t' }, p.read ? `«${p.title}»` : '¿?'),
          !p.read ? h('small', { class: 'nb-r' }, p.aboard === 'mochila' ? 'En tu mochila, sin leer' : p.aboard === 'barco' ? 'A bordo, sin leer' : p.n === 1 ? 'Puente' : p.regionName) : null,
        ),
      ),
    ),
  );
  // Con el rumbo revelado, el resumen se destaca (y dice dónde elegirlo); al llegar, se puede volver a ver la llegada.
  let summary: VNode;
  if (st.revealed && !st.arrived) {
    summary = h('div', { class: 'nb-summary nb-course' }, gl('helm'), h('span', null, h('b', null, `${CAPTAIN_COURSE_LABEL}:`), ` elígelo en el timón al final de cualquier región para poner rumbo a ${st.finalRegionName}.`));
  } else if (st.arrived) {
    summary = h('div', { class: 'nb-summary nb-course arrived' }, gl('anchor'), h('span', null, st.summary), btn('Volver a ver la llegada', () => env.showArrival(), { small: true, glyph: 'flag' }));
  } else summary = h('div', { class: 'nb-summary' }, gl('quill'), h('span', null, st.summary));
  const head = h('div', { class: 'nb-head' }, summary, progressDots(st));
  return h(
    'div',
    { class: 'notebook' },
    head,
    h(
      'div',
      { class: 'nb-body' },
      h('div', { class: 'nb-side scroll' }, index),
      h('div', { class: 'nb-desk scroll' }, info.read ? pageSheet(info, st.total) : missingSheet(info, st.total), nav),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* Lector de hojas (no bloqueante)                                     */
/* ------------------------------------------------------------------ */

export class PageReader {
  readonly el: HTMLElement;
  private page: number | null = null;
  private left = 0;
  private total = 1;
  private hovered = false;

  constructor(layer: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'page-reader-layer';
    layer.appendChild(this.el);
  }

  get visible(): boolean {
    return this.page !== null;
  }

  /** Hoja que se está mostrando (o null). */
  get current(): number | null {
    return this.page;
  }

  /** Segundos que le quedan en pantalla (pruebas). */
  get remaining(): number {
    return this.page === null ? 0 : this.left;
  }

  show(n: number): void {
    const pg = STORY_PAGES.find((p) => p.n === n);
    if (!pg) return;
    ensureNotebookFont();
    this.page = n;
    this.total = readingSeconds(`${pg.title} ${pg.text}`);
    this.left = this.total;
    this.hovered = false;
  }

  hide(): void {
    if (this.page === null) return;
    this.page = null;
    this.hovered = false;
    patch(this.el, null);
  }

  /**
   * Un frame: descuenta el tiempo y repinta. `hidden` (menú o panel abierto, otro modo de juego):
   * la hoja no se ve y su tiempo no corre; tampoco corre con el cursor encima.
   */
  update(dt: number, opts: { hidden: boolean }): void {
    if (this.page === null) return;
    if (!opts.hidden && !this.hovered) this.left -= Math.max(0, dt);
    if (this.left <= 0) {
      this.hide();
      return;
    }
    patch(this.el, this.render(opts.hidden));
  }

  private render(hidden: boolean): VNode | null {
    const pg = STORY_PAGES.find((p) => p.n === this.page);
    if (!pg) return null;
    const frac = Math.max(0, Math.min(1, this.left / this.total));
    const n = pg.n;
    return h(
      'aside',
      {
        key: `reader-${n}`,
        class: cx('page-reader', 'interactive', hidden && 'hidden', frac < 0.06 && 'out'),
        role: 'status',
        'aria-label': `Cuaderno del Albatros, página ${n}`,
        onmouseenter: () => {
          this.hovered = true;
        },
        onmouseleave: () => {
          this.hovered = false;
        },
      },
      h('div', { class: 'pr-tape' }),
      h(
        'div',
        { class: 'nb-paper reader' },
        h('div', { class: 'nb-folio' }, `Cuaderno del Albatros · pág. ${n} de ${STORY_PAGES.length}`),
        h('h3', { class: 'nb-title' }, pg.title),
        paragraphs(pg.text).map((p, i) => h('p', { key: i, class: 'nb-text' }, p)),
        h('div', { class: 'nb-sign' }, `— ${SIGNATURE}`),
      ),
      h(
        'div',
        { class: 'pr-foot' },
        h('span', { class: 'pr-keys' }, kbd('J'), ' abre el cuaderno · se cierra sola'),
        h('div', { class: 'pr-timer' }, h('i', { style: { width: `${Math.round(frac * 1000) / 10}%` } })),
      ),
    );
  }
}

/* ------------------------------------------------------------------ */
/* Llegada a Puerto Esperanza                                          */
/* ------------------------------------------------------------------ */

export interface ArrivalStat {
  glyph: string;
  label: string;
  value: string;
}

/** Estadísticas de la travesía para la pantalla de llegada. */
export function arrivalStats(sim: Simulation, sum: ArrivalSummary): ArrivalStat[] {
  const s = sim.state.player.stats;
  const days = sum.daysAtSea;
  return [
    { glyph: 'sun', label: days === 1 ? 'Día de travesía' : 'Días de travesía', value: days < 1 ? 'Menos de uno' : String(days) },
    { glyph: 'map', label: 'Millas recorridas', value: num(sum.miles, 0) },
    { glyph: 'page', label: 'Hojas del cuaderno', value: `${sum.pagesRead} de ${sum.pagesTotal}` },
    { glyph: 'people', label: sum.crew.length === 1 ? 'Habitante a bordo' : 'Habitantes a bordo', value: String(sum.crew.length) },
    { glyph: 'box', label: sum.modules === 1 ? 'Módulo en el barco' : 'Módulos en el barco', value: String(sum.modules) },
    { glyph: 'waves', label: 'Restos rescatados', value: String(s.debrisCollected) },
    { glyph: 'fish', label: 'Peces pescados', value: String(s.fishCaught) },
    { glyph: 'hammer', label: 'Objetos fabricados', value: String(s.itemsCrafted) },
  ];
}

/** «Ana», «Ana y Luis», «Ana, Luis y Marta». */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/** Tarjeta de la pantalla de llegada (la monta Menus a pantalla completa). */
export function arrivalView(sim: Simulation, sum: ArrivalSummary, actions: { onContinue: () => void; onMarket: (eventId: number) => void }): VNode {
  ensureNotebookFont();
  const stats = arrivalStats(sim, sum);
  const newcomers = new Set(sum.newcomers);
  const veterans = sum.crew.filter((n) => !newcomers.has(n));
  const market = sum.marketEventId;
  return h(
    'div',
    { class: 'arrival-card' },
    h('div', { class: 'arr-light', 'aria-hidden': 'true' }),
    h('div', { class: 'arr-kicker' }, gl('lighthouse'), `Día ${sum.day} · el rumbo de la capitana Duarte`),
    h('h1', { class: 'arr-title' }, sum.title),
    h(
      'div',
      { class: 'arr-story' },
      sum.paragraphs.map((p, i) => h('p', { key: i }, p)),
    ),
    h(
      'div',
      { class: 'arr-stats' },
      stats.map((s) => h('div', { key: s.label, class: 'arr-stat' }, gl(s.glyph), h('b', null, s.value), h('span', null, s.label))),
    ),
    h(
      'div',
      { class: 'arr-crew' },
      veterans.length ? h('div', null, gl('people'), h('span', null, h('b', null, 'Llegáis a puerto: '), `tú, ${listNames(veterans)}.`)) : h('div', null, gl('person'), h('span', null, 'Llegas sin más compañía que el barco que has levantado.')),
      sum.newcomers.length ? h('div', { class: 'good' }, gl('heart'), h('span', null, h('b', null, sum.newcomers.length === 1 ? 'Se une al llegar: ' : 'Se unen al llegar: '), `${listNames(sum.newcomers)}.`)) : null,
    ),
    h('p', { class: 'arr-epilogue' }, sum.epilogue),
    h(
      'div',
      { class: 'arr-actions' },
      btn('Seguir navegando', () => actions.onContinue(), { primary: true, glyph: 'ship' }),
      market !== null ? btn('Ir al mercado del muelle', () => actions.onMarket(market), { glyph: 'swap', title: 'El mercado del puerto está abierto unas horas: precios de amigos' }) : null,
      h('span', { class: 'arr-note faint small' }, gl('anchor'), 'La partida continúa después de la llegada.'),
    ),
  );
}

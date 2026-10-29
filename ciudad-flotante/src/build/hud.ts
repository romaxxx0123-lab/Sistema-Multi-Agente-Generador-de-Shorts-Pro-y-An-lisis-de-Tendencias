/**
 * Interfaz DOM del modo construcción: paleta inferior (categorías, fichas de módulos, demoler y
 * ampliar casco), selector de nivel, resumen del barco, atajos, rótulo junto al cursor, ficha de
 * información al pasar sobre módulos y diálogo de confirmación.
 *
 * El DOM se crea una vez y se actualiza por partes: cada bloque se repinta solo cuando cambia su
 * "clave" de contenido, y los clics se atienden por delegación (`data-act`), así que repintar no
 * pierde manejadores. Usa las variables de `src/ui/base.css` y sus propios estilos (`build.css`).
 */
import './build.css';
import type { ModuleCategory } from '../data/modules';
import { glyph, itemIcon, MODULE_GLYPH } from '../ui/icons';
import { CATEGORIES, fmtNum, levelName, type CardInfo, type CostLine, type DemolishPreview, type ExpansionInfo, type ModuleInfo, type ShipSummary, type StatChip } from './catalog';
import { durationText } from '../sim/construction';

/** Acciones que la interfaz pide al modo construcción. */
export interface HudActions {
  selectModule(type: string): void;
  selectCategory(cat: ModuleCategory): void;
  toggleDemolish(): void;
  requestExpand(): void;
  setLevel(level: number): void;
  rotate(): void;
  resetView(): void;
  exit(): void;
  confirm(): void;
  cancel(): void;
  hoverExpansion(on: boolean): void;
}

export interface PaletteModel {
  category: ModuleCategory;
  selected: string | null;
  demolish: boolean;
  cards: CardInfo[];
  expansion: ExpansionInfo | null;
}

export interface TipModel {
  tone: 'ok' | 'bad' | 'warn' | 'info';
  title: string;
  text: string;
  sub?: string;
}

export interface ConfirmModel {
  kind: 'demolish' | 'expand';
  title: string;
  glyph: string;
  /** Párrafos de texto. */
  lines: string[];
  /** Lista de objetos (reembolso o coste). */
  items: { id: string; name: string; qty: number; have?: number }[];
  itemsLabel: string;
  note?: string;
  confirmLabel: string;
  danger: boolean;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

const gl = (name: string, cls = 'bm-gl'): string => `<i class="${cls}">${glyph(name)}</i>`;

/** Glifos que usa la interfaz del modo construcción (los tests comprueban que existen). */
export const HUD_GLYPHS = ['alert', 'battery', 'bed', 'box', 'check', 'drop', 'exit', 'eye', 'hammer', 'info', 'keyboard', 'lock', 'map', 'medical', 'power', 'ship', 'swap', 'trash'] as const;
const kbd = (k: string): string => `<span class="kbd">${esc(k)}</span>`;

function el(tag: string, cls: string, parent?: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function setHtml(e: HTMLElement, html: string): void {
  if (e.dataset.html !== html) {
    e.innerHTML = html;
    e.dataset.html = html;
  }
}

function costHtml(c: CostLine): string {
  return `<span class="bm-cost${c.ok ? '' : ' miss'}" title="${esc(`${c.name}: tienes ${c.have}, necesitas ${c.need}`)}"><i class="bm-item">${itemIcon(c.id)}</i><b>${c.have}</b><span class="bm-need">/${c.need}</span></span>`;
}

function statHtml(s: StatChip): string {
  return `<span class="bm-stat ${s.tone}" title="${esc(s.title)}">${gl(s.glyph)}${esc(s.text)}</span>`;
}

/** "+5", "−1,5" o "0" (sin signo si es cero). */
function signedKw(v: number, sign: string): string {
  const t = fmtNum(v);
  return t === '0' ? '0' : `${sign}${t}`;
}

/** Escala de la interfaz (misma fórmula que la UI general, para que todo case). */
export function uiScale(w: number, h: number): number {
  const base = Math.min(w / 1280, h / 720);
  const s = Math.max(0.72, Math.min(1.6, 1 + (base - 1) * 0.62));
  return Math.round(s * 100) / 100;
}

/* ------------------------------------------------------------------ */
/* Interfaz                                                            */
/* ------------------------------------------------------------------ */

export class BuildHud {
  readonly root: HTMLElement;
  private readonly levels: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly palette: HTMLElement;
  private readonly tabs: HTMLElement;
  private readonly tools: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly info: HTMLElement;
  private readonly modal: HTMLElement;
  private scale = 1;
  private sizeKey = '';
  private keysCollapsed = false;
  private palH = 0;
  /** El puntero está sobre un panel de la interfaz (no sobre el lienzo). */
  pointerOverUi = false;

  constructor(parent: HTMLElement, private readonly actions: HudActions) {
    this.root = el('div', 'bm-root', parent);
    this.root.setAttribute('aria-label', 'Modo construcción');
    this.levels = el('div', 'bm-levels panel interactive', this.root);
    const side = el('div', 'bm-side', this.root);
    this.summary = el('div', 'bm-summary panel', side);
    this.keys = el('div', 'bm-keys panel interactive', side);
    this.palette = el('div', 'bm-palette panel interactive', this.root);
    const head = el('div', 'bm-head', this.palette);
    this.tabs = el('div', 'bm-tabs', head);
    this.tools = el('div', 'bm-tools', head);
    this.cards = el('div', 'bm-cards', this.palette);
    this.tip = el('div', 'bm-tip', this.root);
    this.info = el('div', 'bm-info panel', this.root);
    this.modal = el('div', 'bm-modal interactive', this.root);
    this.root.style.display = 'none';

    // Clics por delegación.
    this.root.addEventListener('click', (e) => this.onClick(e));
    // Que los botones no se queden con el foco (Espacio/Intro no deben repetir el clic).
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('[data-act]')) e.preventDefault();
    });
    // Rueda sobre las fichas: desplazamiento horizontal.
    this.cards.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          this.cards.scrollLeft += e.deltaY;
          e.preventDefault();
        }
      },
      { passive: false },
    );
    // Vista previa de la ampliación del casco al pasar por su ficha.
    this.cards.addEventListener('mouseover', (e) => {
      if ((e.target as HTMLElement).closest('[data-hover="expand"]')) this.actions.hoverExpansion(true);
    });
    this.cards.addEventListener('mouseout', (e) => {
      const from = (e.target as HTMLElement).closest('[data-hover="expand"]');
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-hover="expand"]');
      if (from && from !== to) this.actions.hoverExpansion(false);
    });
    for (const p of [this.levels, this.keys, this.palette, this.modal]) {
      p.addEventListener('mouseenter', () => (this.pointerOverUi = true));
      p.addEventListener('mouseleave', () => (this.pointerOverUi = false));
    }
  }

  get visible(): boolean {
    return this.root.style.display !== 'none';
  }

  show(): void {
    this.root.style.display = '';
    this.updateScale();
  }

  hide(): void {
    this.root.style.display = 'none';
    this.hideConfirm();
    this.setTip(null, 0, 0);
    this.setInfo(null, 0, 0);
    this.pointerOverUi = false;
  }

  dispose(): void {
    this.root.remove();
  }

  /** Recalcula la escala si cambió el tamaño de la ventana. */
  updateScale(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const key = `${w}x${h}`;
    if (key === this.sizeKey) return;
    this.sizeKey = key;
    this.scale = uiScale(w, h);
    // Con `zoom` estandarizado (Chromium 128+, Firefox 126+) los porcentajes se resuelven en
    // píxeles visuales: la capa ocupa el 100 % y solo su contenido se escala (igual que la UI).
    this.root.style.setProperty('zoom', String(this.scale));
    this.measurePalette();
  }

  /** Alto (en píxeles de pantalla) que ocupa la paleta, para encuadrar el barco por encima. */
  get paletteHeightPx(): number {
    return this.visible ? this.palH : 0;
  }

  /** Mide la paleta (solo tras repintarla o cambiar el tamaño: evita forzar maquetación cada frame). */
  private measurePalette(): void {
    if (!this.visible) return;
    const r = this.palette.getBoundingClientRect();
    this.palH = Math.max(0, window.innerHeight - r.top);
  }

  private onClick(e: MouseEvent): void {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) {
      // Clic en el fondo del diálogo: cancelar.
      if (e.target === this.modal) this.actions.cancel();
      return;
    }
    const v = t.dataset.v ?? '';
    switch (t.dataset.act) {
      case 'cat':
        this.actions.selectCategory(v as ModuleCategory);
        break;
      case 'mod':
        this.actions.selectModule(v);
        break;
      case 'demolish':
        this.actions.toggleDemolish();
        break;
      case 'expand':
        this.actions.requestExpand();
        break;
      case 'level':
        this.actions.setLevel(Number(v));
        break;
      case 'rotate':
        this.actions.rotate();
        break;
      case 'recenter':
        this.actions.resetView();
        break;
      case 'exit':
        this.actions.exit();
        break;
      case 'confirm':
        this.actions.confirm();
        break;
      case 'cancel':
        this.actions.cancel();
        break;
      case 'keys':
        this.toggleKeys();
        break;
    }
  }

  /* ---------------- Selector de nivel ---------------- */

  renderLevels(levels: number, current: number, allowed: (l: number) => boolean | null): void {
    let html = `<div class="bm-levels-title">Nivel</div>`;
    for (let l = levels - 1; l >= 0; l--) {
      const ok = allowed(l);
      const cls = ['bm-level', l === current ? 'on' : '', ok === false ? 'na' : ''].filter(Boolean).join(' ');
      const title = ok === false ? 'La pieza seleccionada no se puede construir en este nivel' : `Ver y construir en: ${levelName(l)}`;
      html += `<button type="button" class="${cls}" data-act="level" data-v="${l}" title="${esc(title)}"><span class="bm-level-n">${l}</span>${esc(levelName(l))}</button>`;
    }
    html += `<div class="bm-levels-keys">${kbd('Re Pág')}${kbd('Av Pág')}</div>`;
    setHtml(this.levels, html);
  }

  /* ---------------- Paleta ---------------- */

  renderPalette(m: PaletteModel, rotateEnabled: boolean): void {
    // Pestañas
    const tabs = CATEGORIES.map((c) => {
      const on = c.id === m.category && !m.demolish;
      return `<button type="button" class="bm-tab${on ? ' on' : ''}" data-act="cat" data-v="${c.id}" title="${esc(`${c.label} (Tab para pasar de categoría)`)}">${gl(c.glyph)}<span>${esc(c.label)}</span></button>`;
    }).join('');
    setHtml(this.tabs, tabs);

    // Herramientas
    const tools =
      `<button type="button" class="bm-toolbtn${rotateEnabled ? '' : ' off'}" data-act="rotate" title="Girar la pieza (R)">${gl('swap')}<span>Girar</span>${kbd('R')}</button>` +
      `<button type="button" class="bm-toolbtn demolish${m.demolish ? ' on' : ''}" data-act="demolish" title="Desmontar módulos y cancelar obras (X)">${gl('trash')}<span>Demoler</span>${kbd('X')}</button>` +
      `<button type="button" class="bm-toolbtn" data-act="recenter" title="Centrar la vista (F)">${gl('eye')}<span>Vista</span>${kbd('F')}</button>` +
      `<button type="button" class="bm-toolbtn exit" data-act="exit" title="Volver al barco (B o Esc)">${gl('exit')}<span>Salir</span>${kbd('B')}</button>`;
    setHtml(this.tools, tools);

    // Fichas
    let html = '';
    m.cards.forEach((c, i) => {
      html += this.cardHtml(c, i, m.selected === c.def.id && !m.demolish);
    });
    if (m.expansion) html += this.expansionHtml(m.expansion);
    if (!html) html = `<div class="bm-empty">No hay piezas en esta categoría.</div>`;
    setHtml(this.cards, html);
    this.palette.classList.toggle('demolishing', m.demolish);
    this.measurePalette();
  }

  private cardHtml(c: CardInfo, index: number, selected: boolean): string {
    const d = c.def;
    const cls = ['bm-card', selected ? 'sel' : '', c.locked ? 'locked' : '', !c.locked && !c.affordable ? 'poor' : ''].filter(Boolean).join(' ');
    const glyphName = MODULE_GLYPH[d.id] ?? 'box';
    const cost = c.cost.length ? c.cost.map(costHtml).join('') : `<span class="bm-free">Sin coste</span>`;
    const stats = c.stats.map(statHtml).join('');
    const lock = c.locked ? `<div class="bm-card-lock" title="${esc(c.lockReason ?? 'Bloqueado')}">${gl('lock')}<span>${esc(c.lockShort ?? 'Bloqueado')}</span></div>` : '';
    const keyHint = index < 9 ? `<span class="bm-card-key">${index + 1}</span>` : '';
    return (
      `<div class="${cls}" role="button" data-act="mod" data-v="${d.id}" title="${esc(d.desc)}">` +
      `<div class="bm-card-head"><span class="bm-card-ico">${gl(glyphName, 'bm-gl big')}</span><span class="bm-card-name">${esc(d.name)}</span>${keyHint}</div>` +
      `<div class="bm-card-desc">${esc(d.desc)}</div>` +
      `<div class="bm-card-cost">${cost}</div>` +
      `<div class="bm-card-stats">${stats}</div>` +
      // Bloqueada: el motivo ocupa el lugar del pie (tamaño y niveles), que ya no importa.
      (lock || `<div class="bm-card-foot">${gl('map')}${esc(c.sizeText)} · ${esc(c.levelsText)}</div>`) +
      `</div>`
    );
  }

  private expansionHtml(x: ExpansionInfo): string {
    const busy = x.progress !== null;
    const poor = !x.locked && !busy && x.cost.some((c) => !c.ok);
    const cls = ['bm-card', 'bm-expand', x.locked ? 'locked' : '', poor ? 'poor' : '', busy ? 'busy' : '', !x.ok && !x.locked && !poor && !busy ? 'na' : ''].filter(Boolean).join(' ');
    const cost = x.cost.map(costHtml).join('');
    const stats =
      statHtml({ glyph: 'clock', text: x.timeText, tone: 'dim', title: 'Tiempo de obra (más rápido si ayudas en la proa)' }) +
      statHtml({ glyph: 'ship', text: x.atMax ? `${x.lengthNowM} m (máx.)` : `${x.lengthNowM} → ${x.lengthAfterM} m`, tone: 'good', title: 'Eslora del barco' });
    let foot = '';
    let desc = `<div class="bm-card-desc">Alarga el barco dos secciones por la proa: más cubierta y más bodega.</div>`;
    if (busy) {
      const p = Math.floor((x.progress ?? 0) * 100);
      desc = `<div class="bm-card-prog"><span>En obras · <b data-prog-text="expansion">${p} %</b>${x.etaMin !== null ? ` · faltan ${esc(durationText(x.etaMin))}` : ''}</span><div class="bm-bar work"><i data-prog="expansion" style="width:${p}%"></i></div></div>`;
    } else if (x.locked) foot = `<div class="bm-card-lock" title="${esc(x.reason ?? 'Bloqueado')}">${gl('lock')}<span>${esc(x.lockShort ?? 'Bloqueado')}</span></div>`;
    else if (!x.ok && !poor && x.reason) foot = `<div class="bm-card-lock warn">${gl('alert')}${esc(x.reason)}</div>`;
    return (
      `<div class="${cls}" role="button" data-act="expand" data-hover="expand" title="Alarga el barco dos secciones por la proa: más cubierta y más bodega.">` +
      `<div class="bm-card-head"><span class="bm-card-ico">${gl('ship', 'bm-gl big')}</span><span class="bm-card-name">Ampliar el casco</span></div>` +
      desc +
      `<div class="bm-card-cost">${cost}</div>` +
      `<div class="bm-card-stats">${stats}</div>` +
      foot +
      `</div>`
    );
  }

  /** Actualiza solo la barra de progreso de la ampliación (cambia cada frame). */
  setExpansionProgress(p: number): void {
    const bar = this.cards.querySelector<HTMLElement>('[data-prog="expansion"]');
    const txt = this.cards.querySelector<HTMLElement>('[data-prog-text="expansion"]');
    const pct = Math.floor(p * 100);
    if (bar) bar.style.width = `${pct}%`;
    if (txt) txt.textContent = `${pct} %`;
  }

  /* ---------------- Resumen del barco ---------------- */

  renderSummary(s: ShipSummary): void {
    const bar = (v01: number, cls: string) => `<div class="bm-bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, v01)) * 100)}%"></i></div>`;
    const short = s.demandKW > s.genKW + 0.05 && s.batteryKWh < 0.5;
    let html = `<div class="bm-sum-title">${gl('hammer')}Modo construcción</div>`;
    html += `<div class="bm-row" title="Generación / demanda eléctrica ahora">${gl('power')}<span class="lbl">Energía</span><span class="val${short ? ' bad' : ''}">${signedKw(s.genKW, '+')} / ${signedKw(s.demandKW, '−')} kW</span></div>`;
    if (s.batteryCapKWh > 0) {
      html += `<div class="bm-row sub" title="Carga de las baterías">${gl('battery')}<span class="lbl">Batería</span><span class="val">${fmtNum(s.batteryKWh, 0)} / ${fmtNum(s.batteryCapKWh, 0)} kWh</span></div>`;
      html += bar(s.batteryKWh / s.batteryCapKWh, 'energy');
    } else {
      html += `<div class="bm-row sub dim">${gl('battery')}<span class="lbl">Sin baterías</span></div>`;
    }
    const net = s.waterInPerHour - s.waterOutPerHour;
    const netTxt = Math.abs(net) >= 0.05 ? ` <span class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : '−'}${fmtNum(Math.abs(net))} L/h</span>` : '';
    html += `<div class="bm-row" title="Agua potable en los depósitos">${gl('drop')}<span class="lbl">Agua</span><span class="val">${fmtNum(s.waterL, 0)} / ${fmtNum(s.waterCapL, 0)} L${netTxt}</span></div>`;
    html += bar(s.waterCapL > 0 ? s.waterL / s.waterCapL : 0, 'water');
    const bedsShort = s.beds < s.inhabitants;
    html += `<div class="bm-row" title="Camas para vivir / personas a bordo">${gl('bed')}<span class="lbl">Camas</span><span class="val${bedsShort ? ' bad' : ''}">${s.beds} · ${s.inhabitants} a bordo</span></div>`;
    if (s.healingBeds) html += `<div class="bm-row sub">${gl('medical')}<span class="lbl">Camillas</span><span class="val">${s.healingBeds}</span></div>`;
    html += `<div class="bm-row" title="Eslora actual / máxima">${gl('ship')}<span class="lbl">Eslora</span><span class="val">${s.lengthM} m <span class="dim">/ ${s.maxLengthM} m</span></span></div>`;
    if (s.works) html += `<div class="bm-row">${gl('hammer')}<span class="lbl">Obras</span><span class="val warn">${s.works} en curso</span></div>`;
    if (s.expansion) {
      html += `<div class="bm-row">${gl('ship')}<span class="lbl">Ampliación</span><span class="val warn">${Math.floor(s.expansion.progress * 100)} % · ${esc(durationText(s.expansion.etaMin))}</span></div>`;
      html += bar(s.expansion.progress, 'work');
    }
    setHtml(this.summary, html);
  }

  /* ---------------- Atajos ---------------- */

  renderKeys(mode: 'inspect' | 'place' | 'demolish'): void {
    if (this.keysCollapsed) {
      setHtml(this.keys, `<button type="button" class="bm-keys-toggle" data-act="keys">${gl('keyboard')}Atajos ${kbd('H')}</button>`);
      return;
    }
    const rows: [string, string][] = [];
    if (mode === 'place') {
      rows.push(['Clic', 'Construir aquí'], ['R', 'Girar la pieza'], ['Clic der. · Esc', 'Soltar la pieza']);
    } else if (mode === 'demolish') {
      rows.push(['Clic', 'Desmontar'], ['Clic der. · Esc', 'Dejar de demoler']);
    } else {
      rows.push(['1-9', 'Elegir pieza'], ['Tab', 'Siguiente categoría'], ['X', 'Demoler']);
    }
    rows.push(['Arrastre der. · Q E', 'Girar la vista'], ['Rueda', 'Acercar / alejar'], ['WASD · Arrastre central', 'Desplazar'], ['Re Pág · Av Pág', 'Cambiar de nivel'], ['B · Esc', 'Volver al barco']);
    const body = rows.map(([k, t]) => `<div class="bm-key"><span class="k">${k.split(' · ').map(kbd).join('')}</span><span class="t">${esc(t)}</span></div>`).join('');
    setHtml(this.keys, `<div class="bm-keys-title">${gl('keyboard')}Atajos<button type="button" class="bm-keys-hide" data-act="keys" title="Ocultar (H)">${kbd('H')}</button></div>${body}`);
  }

  toggleKeys(): void {
    this.keysCollapsed = !this.keysCollapsed;
    this.keys.dataset.html = '';
  }

  /* ---------------- Rótulo junto al cursor ---------------- */

  /** `x`, `y` en píxeles de pantalla relativos al lienzo. */
  setTip(m: TipModel | null, x: number, y: number): void {
    if (!m) {
      this.tip.classList.remove('show');
      return;
    }
    const html = `<div class="bm-tip-title">${m.tone === 'bad' || m.tone === 'warn' ? gl('alert') : m.tone === 'ok' ? gl('check') : gl('info')}<b>${esc(m.title)}</b></div><div class="bm-tip-text">${esc(m.text)}</div>${m.sub ? `<div class="bm-tip-sub">${m.sub}</div>` : ''}`;
    setHtml(this.tip, html);
    this.tip.className = `bm-tip show ${m.tone}`;
    this.position(this.tip, x, y);
  }

  /** Ficha de información de un módulo (y vista previa de demolición si procede). */
  setInfo(m: ModuleInfo | null, x: number, y: number, demolish?: DemolishPreview | null): void {
    if (!m) {
      this.info.classList.remove('show');
      return;
    }
    const glyphName = MODULE_GLYPH[m.type] ?? 'box';
    let html = `<div class="bm-info-head">${gl(glyphName)}<b>${esc(m.name)}</b><span class="bm-info-lvl">${esc(levelName(m.level))}</span></div>`;
    html += `<div class="bm-info-state ${m.tone}">${esc(m.state)}</div>`;
    if (m.progress !== null) html += `<div class="bm-bar work"><i style="width:${Math.round(m.progress * 100)}%"></i></div>`;
    if (m.condition !== null) {
      const c = Math.round(m.condition);
      html += `<div class="bm-info-cond"><span>Condición</span><div class="bm-bar ${c < 50 ? 'bad' : c < 80 ? 'warnb' : 'goodb'}"><i style="width:${c}%"></i></div><b>${c} %</b></div>`;
    }
    for (const l of m.lines) html += `<div class="bm-info-line">${esc(l)}</div>`;
    if (demolish) {
      if (demolish.ok) {
        const refund = demolish.refund.length ? demolish.refund.map((r) => `${r.qty}× ${esc(r.name)}`).join(', ') : 'nada';
        html += `<div class="bm-info-foot bad">${gl('trash')}<span><b>Clic: ${demolish.inConstruction ? 'cancelar la obra' : 'desmontar'}</b><br>Recuperas: ${refund}</span></div>`;
      } else {
        html += `<div class="bm-info-foot warn">${gl('lock')}<span>${esc(demolish.reason ?? 'No se puede desmontar')}</span></div>`;
      }
    }
    setHtml(this.info, html);
    this.info.classList.add('show');
    this.position(this.info, x, y);
  }

  /** Coloca un rótulo junto al cursor sin salirse de la pantalla (cálculo en px de pantalla). */
  private position(e: HTMLElement, x: number, y: number): void {
    const s = this.scale;
    const r = e.getBoundingClientRect();
    const ew = r.width || 240 * s;
    const eh = r.height || 80 * s;
    let left = x + 18 * s;
    let top = y + 20 * s;
    if (left + ew > window.innerWidth - 8) left = x - ew - 14 * s;
    if (top + eh > window.innerHeight - 8) top = y - eh - 12 * s;
    // Los px de estilo dentro de la capa se multiplican por su zoom.
    e.style.left = `${Math.max(6, left) / s}px`;
    e.style.top = `${Math.max(6, top) / s}px`;
  }

  /* ---------------- Confirmación ---------------- */

  get confirmOpen(): boolean {
    return this.modal.classList.contains('show');
  }

  showConfirm(c: ConfirmModel): void {
    const items = c.items.length
      ? `<div class="bm-confirm-label">${esc(c.itemsLabel)}</div><div class="bm-confirm-items">${c.items
          .map((i) => {
            const miss = i.have !== undefined && i.have < i.qty;
            return `<span class="bm-cost big${miss ? ' miss' : ''}"><i class="bm-item">${itemIcon(i.id)}</i>${i.have !== undefined ? `<b>${i.have}</b><span class="bm-need">/${i.qty}</span>` : `<b>${i.qty}×</b>`}<span class="bm-cost-name">${esc(i.name)}</span></span>`;
          })
          .join('')}</div>`
      : '';
    const html =
      `<div class="bm-confirm panel" role="dialog" aria-modal="true" aria-label="${esc(c.title)}">` +
      `<div class="bm-confirm-title">${gl(c.glyph)}<span>${esc(c.title)}</span></div>` +
      c.lines.map((l) => `<p>${esc(l)}</p>`).join('') +
      items +
      (c.note ? `<div class="bm-confirm-note">${gl('box')}<span>${esc(c.note)}</span></div>` : '') +
      `<div class="bm-confirm-actions"><button type="button" class="btn" data-act="cancel">Cancelar ${kbd('Esc')}</button><button type="button" class="btn primary${c.danger ? ' bm-danger' : ''}" data-act="confirm">${esc(c.confirmLabel)} ${kbd('Intro')}</button></div>` +
      `</div>`;
    setHtml(this.modal, html);
    this.modal.classList.add('show');
  }

  hideConfirm(): void {
    if (!this.modal.classList.contains('show')) return;
    this.modal.classList.remove('show');
    this.pointerOverUi = false;
  }
}

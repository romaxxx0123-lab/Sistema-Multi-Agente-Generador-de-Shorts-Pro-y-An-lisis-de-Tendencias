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
import { CATEGORIES, fmtNum, levelName, tierRoman, UPGRADE_STALL_HINT, type CardInfo, type CostLine, type DemolishPreview, type ExpansionInfo, type ModuleInfo, type ShipSummary, type StatChip, type UpgradePreview } from './catalog';
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
  /** Herramienta Mejorar (U). */
  toggleUpgrade(): void;
  /** Elegir un módulo de la lista de mejoras (encarga o cancela su mejora). */
  pickUpgrade(moduleId: number): void;
  /** El puntero pasa por la ficha de mejora de un módulo (null = la deja). */
  hoverUpgrade(moduleId: number | null): void;
}

export interface PaletteModel {
  category: ModuleCategory;
  selected: string | null;
  demolish: boolean;
  /** Herramienta Mejorar activa: la paleta muestra los módulos del barco que admiten mejoras. */
  upgrade: boolean;
  cards: CardInfo[];
  expansion: ExpansionInfo | null;
  /** Lista de mejoras (solo con la herramienta Mejorar). */
  upgrades: UpgradePreview[] | null;
}

export interface TipModel {
  tone: 'ok' | 'bad' | 'warn' | 'info';
  title: string;
  text: string;
  sub?: string;
}

export interface ConfirmModel {
  kind: 'demolish' | 'expand' | 'upgrade' | 'cancelUpgrade';
  title: string;
  glyph: string;
  /** Párrafos de texto. */
  lines: string[];
  /** Efectos (mejoras): "+12 huecos", "×1,5 velocidad"... */
  chips?: StatChip[];
  /** Barra de progreso (obra de mejora que se cancelaría), 0..1. */
  progress?: number;
  /** Color de la barra: obra en marcha (`work`) o parada (`bad`). */
  progressTone?: 'work' | 'bad';
  /** Lista de objetos (reembolso o coste). */
  items: { id: string; name: string; qty: number; have?: number }[];
  itemsLabel: string;
  /** Avisos de peligro (agua o carga que se perderán), en rojo antes de los botones. */
  warnings?: string[];
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
export const HUD_GLYPHS = ['alert', 'arrow', 'battery', 'bed', 'box', 'check', 'clock', 'drop', 'exit', 'eye', 'fire', 'hammer', 'info', 'keyboard', 'lock', 'map', 'medical', 'power', 'ship', 'star', 'swap', 'trash'] as const;
const kbd = (k: string): string => `<span class="kbd">${esc(k)}</span>`;

/** Estructura de un diálogo (lo que no se puede parchear sin repintarlo). */
function confirmShape(c: ConfirmModel): string {
  return [c.kind, c.title, c.lines.length, c.progress !== undefined, c.items.length, c.warnings?.length ?? 0].join('|');
}

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

/**
 * Progreso de una mejora en obras: «40 % · faltan 25 min · 2 habitantes ayudan» o, parada mientras
 * arde, «40 % · obra parada mientras arde» (sin cuenta atrás: no baja). `short`: para la ficha de la
 * lista («2 ayudan», «parada: arde»).
 */
export function upgradeProgressText(u: Pick<UpgradePreview, 'progress' | 'etaMin' | 'builders' | 'paused'>, short = false): string {
  const p = `${Math.floor((u.progress ?? 0) * 100)} %`;
  if (u.paused) return `${p} · ${short ? 'parada por el fuego' : 'obra parada mientras arde'}`;
  const eta = u.etaMin !== null ? ` · faltan ${durationText(u.etaMin)}` : '';
  const help = u.builders ? ` · ${u.builders} ${short ? (u.builders === 1 ? 'ayuda' : 'ayudan') : u.builders === 1 ? 'habitante ayuda' : 'habitantes ayudan'}` : '';
  return `${p}${eta}${help}`;
}

/**
 * Niveles de mejora como placas (I · II · III): las alcanzadas encendidas y, si hay una mejora en
 * obras, la siguiente en color de obra.
 */
function tierPips(tier: number, max: number, working = false): string {
  if (max <= 1) return '';
  let html = '';
  for (let t = 1; t <= max; t++) {
    const cls = t <= tier ? ' on' : working && t === tier + 1 ? ' work' : '';
    html += `<span class="bm-pip${cls}">${tierRoman(t)}</span>`;
  }
  return `<span class="bm-pips" title="${esc(`Nivel ${tier} de ${max}`)}">${html}</span>`;
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

export interface TooltipBox {
  /** Cursor y tamaño del rótulo, en px de pantalla. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Escala de la interfaz (los márgenes junto al cursor crecen con ella). */
  scale: number;
  viewW: number;
  viewH: number;
  /** Borde superior de la paleta si el rótulo no debe pisarla (null = puede llegar abajo del todo). */
  paletteTop: number | null;
}

/**
 * Posición (px de pantalla) de un rótulo junto al cursor: a su derecha y debajo; a la izquierda si no
 * cabe; encima si no cabe debajo. Si no cabe ni debajo ni encima (fichas altas de la herramienta
 * Mejorar), lo más abajo posible sin pisar la paleta: va a un lado del cursor, así que no lo tapa, y
 * no sube hasta el borde superior, donde salen los avisos.
 */
export function tooltipPos(b: TooltipBox): { left: number; top: number } {
  const s = b.scale;
  const bottom = b.paletteTop !== null && b.y < b.paletteTop ? b.paletteTop - 6 : b.viewH - 8;
  let left = b.x + 18 * s;
  let top = b.y + 20 * s;
  if (left + b.w > b.viewW - 8) left = b.x - b.w - 14 * s;
  if (top + b.h > bottom) {
    const above = b.y - b.h - 12 * s;
    top = above >= 6 ? above : bottom - b.h;
  }
  return { left: Math.max(6, left), top: Math.max(6, top) };
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
  /** Estructura del diálogo abierto (`confirmShape`). */
  private confirmShape = '';
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
    // Fichas de la lista de mejoras: resaltan su módulo en el barco.
    this.cards.addEventListener('mouseover', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-upid]');
      if (card) this.actions.hoverUpgrade(Number(card.dataset.upid));
    });
    this.cards.addEventListener('mouseout', (e) => {
      const from = (e.target as HTMLElement).closest('[data-upid]');
      const to = (e.relatedTarget as HTMLElement | null)?.closest?.('[data-upid]');
      if (from && !to) this.actions.hoverUpgrade(null);
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
      case 'upgrade':
        this.actions.toggleUpgrade();
        break;
      case 'upmod':
        this.actions.pickUpgrade(Number(v));
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
      const on = c.id === m.category && !m.demolish && !m.upgrade;
      return `<button type="button" class="bm-tab${on ? ' on' : ''}" data-act="cat" data-v="${c.id}" title="${esc(`${c.label} (Tab para pasar de categoría)`)}">${gl(c.glyph)}<span>${esc(c.label)}</span></button>`;
    }).join('');
    setHtml(this.tabs, tabs);

    // Herramientas
    const tools =
      `<button type="button" class="bm-toolbtn${rotateEnabled ? '' : ' off'}" data-act="rotate" title="Girar la pieza (R)">${gl('swap')}<span>Girar</span>${kbd('R')}</button>` +
      `<button type="button" class="bm-toolbtn upgrade${m.upgrade ? ' on' : ''}" data-act="upgrade" title="Mejorar las instalaciones del barco (U)">${gl('star')}<span>Mejorar</span>${kbd('U')}</button>` +
      `<button type="button" class="bm-toolbtn demolish${m.demolish ? ' on' : ''}" data-act="demolish" title="Desmontar módulos y cancelar obras (X)">${gl('trash')}<span>Demoler</span>${kbd('X')}</button>` +
      `<button type="button" class="bm-toolbtn" data-act="recenter" title="Centrar la vista (F)">${gl('eye')}<span>Vista</span>${kbd('F')}</button>` +
      `<button type="button" class="bm-toolbtn exit" data-act="exit" title="Volver al barco (B o Esc)">${gl('exit')}<span>Salir</span>${kbd('B')}</button>`;
    setHtml(this.tools, tools);

    // Fichas
    let html = '';
    if (m.upgrade && m.upgrades) {
      html = this.upgradeHelpHtml(m.upgrades.length > 0);
      m.upgrades.forEach((u, i) => {
        html += this.upgradeCardHtml(u, i);
      });
    } else {
      m.cards.forEach((c, i) => {
        html += this.cardHtml(c, i, m.selected === c.def.id && !m.demolish);
      });
      if (m.expansion) html += this.expansionHtml(m.expansion);
      if (!html) html = `<div class="bm-empty">No hay piezas en esta categoría.</div>`;
    }
    setHtml(this.cards, html);
    if (m.upgrade && m.upgrades) this.patchUpgradeProgress(m.upgrades);
    this.palette.classList.toggle('demolishing', m.demolish);
    this.palette.classList.toggle('upgrading', m.upgrade);
    this.measurePalette();
  }

  /** Primera ficha de la lista de mejoras: qué hace la herramienta. */
  private upgradeHelpHtml(any: boolean): string {
    const text = any
      ? 'Señala un módulo en el barco o elige uno de esta lista. La mejora se paga al empezar y, mientras dura la obra, el módulo se sigue usando.'
      : 'Ningún módulo del barco admite mejoras todavía: construye almacenes, depósitos, generadores, camarotes, cocinas…';
    return (
      `<div class="bm-card bm-uphelp">` +
      `<div class="bm-card-head"><span class="bm-card-ico">${gl('star', 'bm-gl big')}</span><span class="bm-card-name">Mejorar instalaciones</span></div>` +
      `<div class="bm-card-desc">${esc(text)}</div>` +
      `<div class="bm-card-foot">${kbd('Clic')} o ${kbd('1–9')} mejorar · en obras, cancelar</div>` +
      `</div>`
    );
  }

  /** Ficha de un módulo del barco en la lista de mejoras (`index`: su atajo 1-9). */
  private upgradeCardHtml(u: UpgradePreview, index: number): string {
    const glyphName = MODULE_GLYPH[u.type] ?? 'box';
    const busy = u.state === 'busy';
    const cls = ['bm-card', 'bm-upcard', `up-${u.state}`, busy && u.paused ? 'paused' : ''].filter(Boolean).join(' ');
    const keyHint = index < 9 ? `<span class="bm-card-key">${index + 1}</span>` : '';
    const head =
      `<div class="bm-card-head"><span class="bm-card-ico">${gl(glyphName, 'bm-gl big')}</span>` +
      `<span class="bm-card-name">${esc(u.name)}</span>${tierPips(u.tier, u.maxTier, busy && !u.paused)}${keyHint}</div>`;
    let body = '';
    let foot = '';
    const where = esc(levelName(u.level));
    if (u.state === 'max') {
      body = `<div class="bm-card-desc">Nivel máximo: ya tiene todas sus mejoras.</div>`;
      foot = `<div class="bm-card-foot">${gl('check')}${where}</div>`;
    } else if (busy) {
      body =
        `<div class="bm-card-prog"><span>Mejorando a <b>${esc(u.nextName ?? '')}</b></span>` +
        `<span class="bm-up-prog" data-up-text="${u.id}"></span><div class="bm-bar ${u.paused ? 'bad' : 'work'}"><i data-up-bar="${u.id}" style="width:0%"></i></div></div>`;
      foot = u.paused
        ? `<div class="bm-card-lock bad" title="${esc(u.hint ?? '')}">${gl('fire')}<span>Parada mientras arde. Clic: cancelarla</span></div>`
        : `<div class="bm-card-lock warn">${gl('trash')}<span>Clic: cancelar la mejora (recuperas todo)</span></div>`;
    } else {
      body =
        `<div class="bm-up-next" title="${esc(`Nivel ${u.toTier ?? u.tier + 1}: ${u.nextName ?? ''}. ${u.desc ?? ''}`)}">${gl('arrow')}<span>${esc(u.nextName ?? '')}</span></div>` +
        `<div class="bm-card-stats">${u.effects.map(statHtml).join('')}</div>` +
        `<div class="bm-card-cost">${u.cost.map(costHtml).join('')}</div>`;
      foot =
        u.state === 'blocked'
          ? `<div class="bm-card-lock" title="${esc([u.reason, u.hint].filter(Boolean).join('. '))}">${gl('lock')}<span>${esc(u.reason ?? 'No se puede mejorar')}</span></div>`
          : `<div class="bm-card-foot">${gl('clock')}${esc(u.timeText ?? '')} · ${where}</div>`;
    }
    const title = u.state === 'blocked' || u.state === 'max' ? (u.reason ?? '') : busy ? (u.paused ? `Obra parada mientras arde. ${u.hint ?? ''} Clic para cancelar la mejora` : 'Clic para cancelar la mejora') : (u.desc ?? '');
    return `<div class="${cls}" role="button" data-act="upmod" data-v="${u.id}" data-upid="${u.id}" title="${esc(title)}">${head}${body}${foot}</div>`;
  }

  /** Progreso de las mejoras en obras (sin repintar las fichas: no se pierde el clic). */
  private patchUpgradeProgress(list: UpgradePreview[]): void {
    for (const u of list) {
      if (u.state !== 'busy') continue;
      const pct = Math.floor((u.progress ?? 0) * 100);
      const bar = this.cards.querySelector<HTMLElement>(`[data-up-bar="${u.id}"]`);
      const txt = this.cards.querySelector<HTMLElement>(`[data-up-text="${u.id}"]`);
      if (bar) bar.style.width = `${pct}%`;
      if (txt) {
        const t = upgradeProgressText(u, true);
        if (txt.textContent !== t) txt.textContent = t;
      }
    }
  }

  private cardHtml(c: CardInfo, index: number, selected: boolean): string {
    const d = c.def;
    const cls = ['bm-card', selected ? 'sel' : '', c.locked ? 'locked' : '', !c.locked && !c.affordable ? 'poor' : ''].filter(Boolean).join(' ');
    const glyphName = MODULE_GLYPH[d.id] ?? 'box';
    const cost = c.cost.length ? c.cost.map(costHtml).join('') : `<span class="bm-free">Sin coste</span>`;
    const stats = c.stats.map(statHtml).join('');
    const lock = c.locked ? `<div class="bm-card-lock" title="${esc(c.lockReason ?? 'Bloqueado')}">${gl('lock')}<span>${esc(c.lockShort ?? 'Bloqueado')}</span></div>` : '';
    const keyHint = index < 9 ? `<span class="bm-card-key">${index + 1}</span>` : '';
    // Mejorable: hasta qué nivel (las placas de latón de los muebles dicen II y III).
    const upBadge = c.maxTier > 1 ? `<span class="bm-card-up" title="${esc(c.upgradesText ?? '')}">${gl('star')}${tierRoman(c.maxTier)}</span>` : '';
    return (
      `<div class="${cls}" role="button" data-act="mod" data-v="${d.id}" title="${esc(d.desc)}">` +
      `<div class="bm-card-head"><span class="bm-card-ico">${gl(glyphName, 'bm-gl big')}</span><span class="bm-card-name">${esc(d.name)}</span>${upBadge}${keyHint}</div>` +
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
    if (s.upgrades) html += `<div class="bm-row" title="Mejoras en obras: los módulos se siguen usando mientras tanto">${gl('star')}<span class="lbl">Mejoras</span><span class="val warn">${s.upgrades} en obras</span></div>`;
    if (s.expansion) {
      html += `<div class="bm-row">${gl('ship')}<span class="lbl">Ampliación</span><span class="val warn">${Math.floor(s.expansion.progress * 100)} % · ${esc(durationText(s.expansion.etaMin))}</span></div>`;
      html += bar(s.expansion.progress, 'work');
    }
    setHtml(this.summary, html);
  }

  /* ---------------- Atajos ---------------- */

  renderKeys(mode: 'inspect' | 'place' | 'demolish' | 'upgrade'): void {
    if (this.keysCollapsed) {
      setHtml(this.keys, `<button type="button" class="bm-keys-toggle" data-act="keys">${gl('keyboard')}Atajos ${kbd('H')}</button>`);
      return;
    }
    const rows: [string, string][] = [];
    if (mode === 'place') {
      rows.push(['Clic', 'Construir aquí'], ['R', 'Girar la pieza'], ['Clic der. · Esc', 'Soltar la pieza']);
    } else if (mode === 'demolish') {
      rows.push(['Clic', 'Desmontar'], ['Clic der. · Esc', 'Dejar de demoler']);
    } else if (mode === 'upgrade') {
      rows.push(['Clic', 'Mejorar (o cancelar la mejora en obras)'], ['1–9', 'Elegir de la lista'], ['Clic der. · Esc · U', 'Dejar de mejorar']);
    } else {
      rows.push(['1–9', 'Elegir pieza'], ['Tab', 'Siguiente categoría'], ['U', 'Mejorar'], ['X', 'Demoler']);
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
    this.position(this.tip, x, y, true);
  }

  /** Ficha de información de un módulo (y vista previa de demolición si procede). */
  setInfo(m: ModuleInfo | null, x: number, y: number, demolish?: DemolishPreview | null, upgrade?: UpgradePreview | null): void {
    if (!m) {
      this.info.classList.remove('show');
      return;
    }
    const glyphName = MODULE_GLYPH[m.type] ?? 'box';
    let html = `<div class="bm-info-head">${gl(glyphName)}<b>${esc(m.name)}</b><span class="bm-info-lvl">${esc(levelName(m.level))}</span></div>`;
    if (m.maxTier > 1) html += `<div class="bm-info-tier">${tierPips(m.tier, m.maxTier, !!m.upgrade)}<span>Nivel ${m.tier} de ${m.maxTier}</span></div>`;
    html += `<div class="bm-info-state ${m.tone}">${esc(m.state)}</div>`;
    if (m.progress !== null) html += `<div class="bm-bar work"><i style="width:${Math.round(m.progress * 100)}%"></i></div>`;
    // Mejora en obras (la ficha de la herramienta Mejorar la cuenta con más detalle).
    if (m.upgrade && !upgrade) {
      const up = m.upgrade;
      const p = Math.floor(up.progress * 100);
      const when = up.paused ? 'parada mientras arde' : up.etaMin !== null ? `faltan ${durationText(up.etaMin)}` : '';
      html += `<div class="bm-info-line ${up.paused ? 'bad' : 'warn'}">Mejorando a ${esc(up.name)} · ${p} %${when ? ` · ${esc(when)}` : ''}</div><div class="bm-bar ${up.paused ? 'bad' : 'work'}"><i style="width:${p}%"></i></div>`;
    }
    if (m.condition !== null) {
      const c = Math.round(m.condition);
      html += `<div class="bm-info-cond"><span>Condición</span><div class="bm-bar ${c < 50 ? 'bad' : c < 80 ? 'warnb' : 'goodb'}"><i style="width:${c}%"></i></div><b>${c} %</b></div>`;
    }
    for (const l of m.lines) html += `<div class="bm-info-line">${esc(l)}</div>`;
    if (demolish) {
      if (demolish.ok) {
        const refund = demolish.refund.length ? demolish.refund.map((r) => `${r.qty}× ${esc(r.name)}`).join(', ') : 'nada';
        html += `<div class="bm-info-foot bad">${gl('trash')}<span><b>Clic: ${demolish.inConstruction ? 'cancelar la obra' : 'desmontar'}</b><br>Recuperas: ${refund}</span></div>`;
        for (const l of demolish.losses) html += `<div class="bm-info-loss">${gl('alert')}<span>${esc(l)}</span></div>`;
      } else {
        const hint = demolish.hint ? `<br><span class="bm-info-hint">${esc(demolish.hint)}</span>` : '';
        html += `<div class="bm-info-foot warn">${gl('lock')}<span>${esc(demolish.reason ?? 'No se puede desmontar')}${hint}</span></div>`;
      }
    }
    if (upgrade) html += this.upgradeInfoHtml(upgrade);
    setHtml(this.info, html);
    this.info.classList.add('show');
    this.info.classList.toggle('wide', !!upgrade);
    this.position(this.info, x, y, true);
  }

  /** Parte de la ficha con la mejora siguiente (herramienta Mejorar). */
  private upgradeInfoHtml(u: UpgradePreview): string {
    const hint = (h: string | null) => (h ? `<br><span class="bm-info-hint">${esc(h)}</span>` : '');
    if (u.state === 'none') return `<div class="bm-info-foot dim">${gl('info')}<span>${esc(u.reason ?? 'No admite mejoras')}</span></div>`;
    if (u.state === 'max') return `<div class="bm-info-foot good">${gl('check')}<span><b>${esc(u.reason ?? 'Nivel máximo')}</b><br><span class="bm-info-hint">Ya tiene todas sus mejoras</span></span></div>`;
    if (u.state === 'busy') {
      const p = Math.floor((u.progress ?? 0) * 100);
      // Parada (arde): ni cuenta atrás, ni «se sigue usando», ni el martillo, que ahora no ayuda.
      const how = u.paused
        ? `<div class="bm-info-line bad">${esc(upgradeProgressText(u))}.</div><div class="bm-info-line"><span class="bm-info-hint">${esc(u.hint ?? UPGRADE_STALL_HINT)}</span></div>`
        : `<div class="bm-info-line">${esc(upgradeProgressText(u))}. ${u.inUse ? 'Se sigue usando mientras tanto; el martillo acelera la obra' : 'El martillo acelera la obra'}</div>`;
      return (
        `<div class="bm-up-next">${gl(u.paused ? 'fire' : 'hammer')}<span>Mejorando a <b>${esc(u.nextName ?? '')}</b></span></div>` +
        `<div class="bm-bar ${u.paused ? 'bad' : 'work'}"><i style="width:${p}%"></i></div>` +
        how +
        `<div class="bm-info-foot bad">${gl('trash')}<span><b>Clic: cancelar la mejora</b><br>Recuperas: ${u.cost.map((c) => `${c.need}× ${esc(c.name)}`).join(', ')}</span></div>`
      );
    }
    let html =
      `<div class="bm-up-next">${gl('arrow')}<span>Nivel ${u.toTier ?? ''}: <b>${esc(u.nextName ?? '')}</b></span></div>` +
      (u.desc ? `<div class="bm-info-line">${esc(u.desc)}</div>` : '') +
      (u.effects.length ? `<div class="bm-card-stats">${u.effects.map(statHtml).join('')}</div>` : '') +
      `<div class="bm-card-cost">${u.cost.map(costHtml).join('')}</div>` +
      (u.timeText ? `<div class="bm-info-line">${gl('clock')} Obra: ${esc(u.timeText)} · se sigue usando mientras dura</div>` : '');
    if (u.state === 'ok') html += `<div class="bm-info-foot good">${gl('star')}<span><b>Clic: mejorar</b></span></div>`;
    else if (u.state === 'cost') html += `<div class="bm-info-foot warn">${gl('alert')}<span>${esc(u.reason ?? '')}${hint(u.hint)}</span></div>`;
    else html += `<div class="bm-info-foot bad">${gl('lock')}<span>${esc(u.reason ?? 'No se puede mejorar')}${hint(u.hint)}</span></div>`;
    return html;
  }

  /**
   * Coloca un rótulo junto al cursor sin salirse de la pantalla (ver `tooltipPos`).
   * `avoidPalette`: si el cursor está por encima de la paleta, el rótulo no se mete encima de ella.
   */
  private position(e: HTMLElement, x: number, y: number, avoidPalette = false): void {
    const s = this.scale;
    const r = e.getBoundingClientRect();
    const p = tooltipPos({
      x,
      y,
      w: r.width || 240 * s,
      h: r.height || 80 * s,
      scale: s,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      paletteTop: avoidPalette ? window.innerHeight - this.paletteHeightPx : null,
    });
    // Los px de estilo dentro de la capa se multiplican por su zoom.
    e.style.left = `${p.left / s}px`;
    e.style.top = `${p.top / s}px`;
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
      c.lines.map((l, i) => `<p data-cf-line="${i}">${esc(l)}</p>`).join('') +
      (c.progress !== undefined ? `<div class="bm-bar ${c.progressTone ?? 'work'} bm-confirm-bar"><i data-cf-bar style="width:${Math.round(Math.max(0, Math.min(1, c.progress)) * 100)}%"></i></div>` : '') +
      (c.chips?.length ? `<div class="bm-card-stats bm-confirm-chips">${c.chips.map(statHtml).join('')}</div>` : '') +
      items +
      (c.note ? `<div class="bm-confirm-note">${gl('box')}<span>${esc(c.note)}</span></div>` : '') +
      (c.warnings ?? []).map((w) => `<div class="bm-confirm-warn" role="alert">${gl('alert')}<span>${esc(w)}</span></div>`).join('') +
      `<div class="bm-confirm-actions"><button type="button" class="btn" data-act="cancel">Cancelar ${kbd('Esc')}</button><button type="button" class="btn primary${c.danger ? ' bm-danger' : ''}" data-act="confirm">${esc(c.confirmLabel)} ${kbd('Intro')}</button></div>` +
      `</div>`;
    setHtml(this.modal, html);
    this.modal.classList.add('show');
    this.confirmShape = confirmShape(c);
  }

  /**
   * Pone al día el diálogo abierto (la obra avanza o se para mientras se lee). Si solo cambian los
   * textos y la barra, los parchea sin repintar: así no se pierde un clic a medias en sus botones.
   */
  patchConfirm(c: ConfirmModel): void {
    if (!this.confirmOpen) return;
    if (confirmShape(c) !== this.confirmShape) {
      this.showConfirm(c);
      return;
    }
    c.lines.forEach((l, i) => {
      const p = this.modal.querySelector<HTMLElement>(`[data-cf-line="${i}"]`);
      if (p && p.textContent !== l) p.textContent = l;
    });
    const bar = this.modal.querySelector<HTMLElement>('[data-cf-bar]');
    if (bar && c.progress !== undefined) {
      bar.style.width = `${Math.round(Math.max(0, Math.min(1, c.progress)) * 100)}%`;
      // Obra en marcha o parada (arde): el color de la barra, sin repintar el diálogo.
      const tone = c.progressTone ?? 'work';
      const box = bar.parentElement;
      if (box && !box.classList.contains(tone)) {
        box.classList.remove('work', 'bad');
        box.classList.add(tone);
      }
    }
  }

  hideConfirm(): void {
    if (!this.modal.classList.contains('show')) return;
    this.modal.classList.remove('show');
    this.pointerOverUi = false;
  }
}

/**
 * Piezas reutilizables de la interfaz (nodos virtuales): iconos, teclas, barras, ranuras de
 * inventario con arrastre y descripción emergente, botones, secciones.
 */
import { ITEMS } from '../data/items';
import type { InvRef } from '../sim/Simulation';
import type { ItemStack } from '../sim/types';
import { refKey, type UiEnv } from './env';
import { itemName } from './fmt';
import { glyph, itemIcon } from './icons';
import { CATEGORY_NAMES, itemEffects, toolUse } from './model';
import { cx, h, type Props, type VInput, type VNode } from './vdom';

/** Icono de objeto. */
export function icon(id: string, cls = 'ico'): VNode {
  return h('span', { class: cls, html: itemIcon(id) });
}

/** Glifo monocromo. */
export function gl(name: string, cls = 'gl'): VNode {
  return h('span', { class: cls, html: glyph(name) });
}

export function kbd(text: string): VNode {
  return h('span', { class: 'kbd' }, text);
}

/** Barra de progreso 0..1 con color opcional (variable CSS o color). */
export function bar(v01: number, color?: string, cls = ''): VNode {
  const w = `${Math.round(Math.max(0, Math.min(1, Number.isFinite(v01) ? v01 : 0)) * 1000) / 10}%`;
  return h('div', { class: cx('bar', cls) }, h('i', { style: color ? { width: w, background: color } : { width: w } }));
}

/** Fila "etiqueta ······ valor" con barra opcional. */
export function meter(label: VInput, value: VInput, v01: number | null, color?: string, extra?: string): VNode {
  return h(
    'div',
    { class: cx('meter', extra) },
    h('div', { class: 'meter-row' }, h('span', { class: 'meter-label' }, label), h('span', { class: 'meter-val' }, value)),
    v01 === null ? null : bar(v01, color),
  );
}

export interface BtnOpts {
  primary?: boolean;
  danger?: boolean;
  small?: boolean;
  disabled?: boolean;
  title?: string;
  glyph?: string;
  cls?: string;
  key?: string | number;
}

export function btn(label: VInput, onClick: (e: MouseEvent) => void, o: BtnOpts = {}): VNode {
  const props: Props = {
    class: cx('btn', o.primary && 'primary', o.danger && 'danger', o.small && 'small', o.cls),
    disabled: !!o.disabled,
    title: o.title ?? false,
    type: 'button',
    onclick: (e: MouseEvent) => {
      e.stopPropagation();
      if (!o.disabled) onClick(e);
    },
  };
  if (o.key !== undefined) props['key'] = o.key;
  return h('button', props, o.glyph ? gl(o.glyph) : null, label);
}

export function chip(text: VInput, tone: 'good' | 'warn' | 'danger' | 'info' | 'dim' = 'dim', glyphName?: string, title?: string): VNode {
  return h('span', { class: `chip chip-${tone}`, title: title ?? false }, glyphName ? gl(glyphName) : null, text);
}

export function section(title: VInput, ...children: VInput[]): VNode {
  return h('section', { class: 'sec' }, title ? h('h3', { class: 'sec-title' }, title) : null, ...children);
}

/** Bloque vacío con explicación. */
export function empty(text: string, glyphName = 'info'): VNode {
  return h('div', { class: 'empty-note' }, gl(glyphName), h('span', null, text));
}

/* ------------------------------------------------------------------ */
/* Descripción emergente de objetos                                    */
/* ------------------------------------------------------------------ */

/** Contenido de la descripción emergente de un objeto. `hints` = líneas de controles. */
export function itemTip(env: UiEnv, stack: ItemStack, hints: string[] = []): VNode {
  const def = ITEMS[stack.id];
  if (!def) return h('div', { class: 'tip-item' }, stack.id);
  const effects = itemEffects(def, env.ctx.sim.state.unlocks);
  const use = toolUse(def);
  return h(
    'div',
    { class: 'tip-item' },
    h(
      'div',
      { class: 'tip-head' },
      icon(def.id, 'ico tip-ico'),
      h('div', null, h('div', { class: 'tip-name' }, def.name), h('div', { class: `tip-cat cat-${def.category}` }, CATEGORY_NAMES[def.category] ?? def.category)),
    ),
    h('p', { class: 'tip-desc' }, def.desc),
    effects.length
      ? h(
          'div',
          { class: 'tip-fx' },
          effects.map((e) => h('div', { class: `fx fx-${e.tone}` }, h('span', null, e.label), e.value ? h('b', { style: e.need ? `color: var(--${e.need === 'warmth' ? 'warmth' : e.need})` : '' }, e.value) : null)),
        )
      : null,
    use ? h('p', { class: 'tip-use' }, use) : null,
    h('div', { class: 'tip-meta' }, `${stack.qty} / ${def.stack} por pila · Valor ${def.value}`),
    hints.length ? h('div', { class: 'tip-hints' }, hints.map((t) => h('div', null, t))) : null,
  );
}

/* ------------------------------------------------------------------ */
/* Ranuras                                                             */
/* ------------------------------------------------------------------ */

export interface SlotOpts {
  ref: InvRef;
  index: number;
  stack: ItemStack | null;
  /** Número de tecla a mostrar (barra rápida). */
  hotkey?: number;
  selected?: boolean;
  /** Se ve pero atenuada (no válida en este contexto). */
  dim?: boolean;
  /** Glifo de fondo para la ranura vacía. */
  placeholder?: string;
  /** Clic izquierdo (sin arrastre). */
  onClick?: (e: MouseEvent) => void;
  /** Clic derecho / doble clic. */
  onUse?: () => void;
  /** Líneas de ayuda de la descripción emergente. */
  hints?: string[];
  cls?: string;
  /** Desactiva el arrastre desde esta ranura. */
  noDrag?: boolean;
  /** Texto de ayuda de la ranura vacía. */
  emptyTitle?: string;
}

export function slot(env: UiEnv, o: SlotOpts): VNode {
  const s = o.stack;
  const def = s ? ITEMS[s.id] : undefined;
  return h(
    'div',
    {
      key: `${refKey(o.ref)}#${o.index}`,
      class: cx('slot', 'inv-slot', o.selected && 'sel', o.dim && 'dim', !s && 'empty', o.cls, def && `cat-${def.category}`),
      'data-inv': refKey(o.ref),
      'data-slot': o.index,
      onmousedown: (e: MouseEvent) => {
        if (!o.noDrag) env.drag.begin(e, o.ref, o.index, s);
      },
      onclick: (e: MouseEvent) => {
        if (env.drag.swallowClick) return;
        o.onClick?.(e);
      },
      oncontextmenu: (e: MouseEvent) => {
        e.preventDefault();
        if (s) o.onUse?.();
      },
      ondblclick: (e: MouseEvent) => {
        e.preventDefault();
        if (s && !env.drag.swallowClick) o.onUse?.();
      },
      onmouseenter: (e: MouseEvent) => {
        env.hover = { ref: o.ref, slot: o.index };
        const el = e.currentTarget as Element;
        if (env.drag.active) return;
        if (s) {
          env.tip.show(el, () => {
            const live = env.ctx.sim.inventoryOf(o.ref)?.slots[o.index];
            return live ? itemTip(env, live, o.hints) : null;
          });
        } else env.tip.hide();
      },
      onmouseleave: () => {
        if (env.hover && env.hover.slot === o.index && refKey(env.hover.ref) === refKey(o.ref)) env.hover = null;
        env.tip.hide();
      },
      title: !s && o.emptyTitle ? o.emptyTitle : false,
    },
    o.hotkey !== undefined ? h('span', { class: 'hk' }, String(o.hotkey)) : null,
    s ? icon(s.id) : o.placeholder ? gl(o.placeholder, 'gl ph') : null,
    s && s.qty > 1 ? h('span', { class: 'qty' }, String(s.qty)) : null,
  );
}

/** Rejilla de ranuras de un inventario completo. */
export function grid(env: UiEnv, ref: InvRef, cols: number, opts: (i: number, stack: ItemStack | null) => Partial<SlotOpts> = () => ({}), from = 0, to?: number): VNode {
  const inv = env.ctx.sim.inventoryOf(ref);
  const slots = inv ? inv.slots.slice(from, to ?? inv.slots.length) : [];
  return h(
    'div',
    { class: 'slot-grid', style: `--cols:${cols}` },
    slots.map((st, k) => {
      const i = from + k;
      return slot(env, { ref, index: i, stack: st, ...opts(i, st) });
    }),
  );
}

/** Lista compacta "icono ×N" de un registro de objetos. */
export function stackList(rec: Record<string, number>, have?: (id: string) => number): VNode {
  return h(
    'span',
    { class: 'stack-list' },
    Object.entries(rec).map(([id, n]) => {
      const got = have ? have(id) : null;
      const okHave = got === null || got >= n;
      return h(
        'span',
        { class: cx('stk', !okHave && 'short'), title: `${itemName(id)}${got !== null ? ` (tienes ${got})` : ''}` },
        icon(id, 'ico ico-sm'),
        h('b', null, `${n}`),
        h('span', { class: 'stk-name' }, itemName(id)),
      );
    }),
  );
}

/** Teclas de una letra que usa el juego (para no confundir "A cielo abierto" con una tecla). */
const KEY_LETTERS = new Set(['E', 'B', 'R', 'F', 'V', 'J', 'C', 'I', 'W', 'S', 'D']);

/** Texto con teclas resaltadas: "(Tab)", "Pulsa B", "WASD", "(1)"… */
export function richKeys(text: string): VInput[] {
  const out: VInput[] = [];
  const re = /\b(WASD|Mayús|Espacio|Tab|Esc|[A-Z]|[1-8])\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const tok = m[1]!;
    // Solo dígitos entre paréntesis "(1)" y letras sueltas que sean teclas del juego.
    if (/^[1-8]$/.test(tok) && !(text[m.index - 1] === '(' && text[m.index + 1] === ')')) continue;
    if (/^[A-Z]$/.test(tok) && !KEY_LETTERS.has(tok)) continue;
    out.push(text.slice(last, m.index));
    out.push(kbd(tok));
    last = m.index + tok.length;
  }
  out.push(text.slice(last));
  return out;
}

/**
 * Vista de dos rejillas (tu inventario ↔ contenedor) para almacenes, despensa, bandejas, cajas
 * sueltas y ranuras de combustible.
 *
 * Controles (los mismos en todos los paneles con ranuras de dos inventarios):
 *  - clic = mover la pila al otro lado;
 *  - clic derecho = mover la mitad (redondeando hacia arriba; de una sola unidad, esa unidad);
 *  - Ctrl+clic = mover una unidad;
 *  - Mayús+clic = mover todas las pilas de ese objeto;
 *  - arrastrar = colocar la pila en una ranura concreta;
 *  - con el ratón encima de una ranura tuya, 1-8 la lleva a la barra rápida.
 *
 * Lo que entra en tu inventario se coloca como lo dejaría la simulación con el botín: herramientas,
 * ropa, medicinas, comida y bebida en la barra rápida (para empuñarlas o tomarlas con F); materiales
 * y lo demás, en la mochila. Si una herramienta no cabe en la barra, la barra cede su material
 * menos útil a la mochila.
 */
import { ITEMS } from '../../data/items';
import { HOTBAR_SLOTS } from '../../sim/constants';
import { stackLimit } from '../../sim/inventory';
import type { ActionResult, InvRef } from '../../sim/Simulation';
import type { Inventory, ItemId } from '../../sim/types';
import type { UiEnv } from '../env';
import { itemName, qtyName } from '../fmt';
import { h, type VInput, type VNode } from '../vdom';
import { btn, gl, grid, kbd } from '../widgets';

/* ------------------------------------------------------------------ */
/* Modos de movimiento                                                 */
/* ------------------------------------------------------------------ */

/** Qué parte de una pila mueve un clic. */
export type MoveMode = 'stack' | 'half' | 'one' | 'all';

/** Modo de un clic izquierdo según las teclas pulsadas: Mayús = todo lo de ese tipo, Ctrl/⌘ = una unidad. */
export function clickMode(e: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } | null | undefined): MoveMode {
  if (e?.shiftKey) return 'all';
  if (e?.ctrlKey || e?.metaKey) return 'one';
  return 'stack';
}

/** Unidades a mover de una pila de `qty` (undefined = la pila entera). */
export function modeQty(mode: MoveMode, qty: number): number | undefined {
  if (mode === 'one') return qty > 1 ? 1 : undefined;
  if (mode === 'half') return qty > 1 ? Math.ceil(qty / 2) : undefined;
  return undefined;
}

/** Categorías que, al cogerlas a propósito, van a la barra rápida (se empuñan o se toman con F). */
const HOTBAR_CATS = new Set(['herramienta', 'ropa', 'medicina', 'comida', 'bebida']);
/** Orden en que la barra rápida cede sitio a una herramienta (lo menos útil a mano, primero). */
const YIELD_RANK: Record<string, number> = { material: 0, pieza: 1, semilla: 2, combustible: 3, plano: 4, ropa: 5, medicina: 6, comida: 7, bebida: 8 };

function prefersHotbar(id: ItemId): boolean {
  return HOTBAR_CATS.has(ITEMS[id]?.category ?? '');
}

function firstFree(inv: Inventory, from: number, to: number): number {
  for (let i = Math.max(0, from); i < Math.min(to, inv.slots.length); i++) if (!inv.slots[i]) return i;
  return -1;
}

/**
 * Ranura del jugador donde dejar `id` al cogerlo de un contenedor, o undefined para que la
 * simulación lo reparta (si ya lleva una pila incompleta del mismo objeto, se completa primero).
 */
export function playerSlotFor(inv: Inventory, id: ItemId): number | undefined {
  const lim = stackLimit(id);
  if (inv.slots.some((s) => s && s.id === id && s.qty < lim)) return undefined;
  const hot = prefersHotbar(id);
  const pref = hot ? firstFree(inv, 0, HOTBAR_SLOTS) : firstFree(inv, HOTBAR_SLOTS, inv.slots.length);
  if (pref >= 0) return pref;
  const any = firstFree(inv, 0, inv.slots.length);
  return any >= 0 ? any : undefined;
}

/**
 * Hace sitio en la barra rápida para una herramienta: si está llena, pasa a la mochila lo menos
 * útil que no sea herramienta. Devuelve la ranura libre de la barra (o -1 si no se puede).
 */
export function makeHotbarRoom(env: UiEnv): number {
  const sim = env.ctx.sim;
  const inv = sim.state.player.inventory;
  const free = firstFree(inv, 0, HOTBAR_SLOTS);
  if (free >= 0) return free;
  const bag = firstFree(inv, HOTBAR_SLOTS, inv.slots.length);
  if (bag < 0) return -1;
  let best = -1;
  let bestRank = Infinity;
  for (let i = HOTBAR_SLOTS - 1; i >= 0; i--) {
    const s = inv.slots[i];
    const cat = s ? ITEMS[s.id]?.category : undefined;
    if (!s || cat === 'herramienta') continue;
    const r = YIELD_RANK[cat ?? ''] ?? 9;
    if (r < bestRank) {
      best = i;
      bestRank = r;
    }
  }
  if (best < 0) return -1;
  const res = sim.moveItem({ kind: 'player' }, best, { kind: 'player' }, bag);
  return res.ok ? best : -1;
}

/** Mueve una pila, media pila, una unidad o todas las pilas del mismo objeto de un inventario a otro. */
export function quickMove(env: UiEnv, from: InvRef, slot: number, to: InvRef, mode: MoveMode | boolean = 'stack'): void {
  const m: MoveMode = mode === true ? 'all' : mode === false ? 'stack' : mode;
  const sim = env.ctx.sim;
  const inv = sim.inventoryOf(from);
  const s = inv?.slots[slot];
  if (!inv || !s) return;
  if (m !== 'all') {
    const res = moveOne(env, from, slot, to, modeQty(m, s.qty));
    env.act(res, 'info');
    return;
  }
  const id = s.id;
  let last: ActionResult | null = null;
  let moved = 0;
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i]?.id !== id) continue;
    last = moveOne(env, from, i, to, undefined);
    if (!last.ok) break;
    moved++;
  }
  if (last && !last.ok) env.act(last, 'info');
  else {
    if (moved > 1) env.toast(`Mueves todas las pilas de ${itemName(id)}`, 'info');
    env.refresh();
  }
}

/** Un movimiento: al jugador, en la ranura que le corresponde; a un contenedor, donde quepa. */
function moveOne(env: UiEnv, from: InvRef, slot: number, to: InvRef, qty: number | undefined): ActionResult {
  const sim = env.ctx.sim;
  const s = sim.inventoryOf(from)?.slots[slot];
  if (!s) return { ok: false, msg: 'No hay nada que mover' };
  if (to.kind !== 'player' || from.kind === 'player') return sim.moveItem(from, slot, to, undefined, qty);
  const id = s.id;
  const pinv = sim.state.player.inventory;
  let target = playerSlotFor(pinv, id);
  // Una herramienta recién fabricada (o sacada del almacén) tiene que poder empuñarse con 1-8.
  let yielded: { id: ItemId; qty: number } | null = null;
  if (ITEMS[id]?.category === 'herramienta' && (target === undefined || target >= HOTBAR_SLOTS)) {
    const before = pinv.slots.map((x) => (x ? { ...x } : null));
    const room = makeHotbarRoom(env);
    if (room >= 0) {
      target = room;
      yielded = before[room] ?? null;
    }
  }
  const res = sim.moveItem(from, slot, to, target, qty);
  if (res.ok && !res.msg && ITEMS[id]?.category === 'herramienta' && target !== undefined && target < HOTBAR_SLOTS) {
    const note = `${itemName(id)} en la barra rápida (tecla ${target + 1})`;
    return { ok: true, msg: yielded ? `${note}. A la mochila: ${qtyName(yielded.id, yielded.qty)}` : note };
  }
  return res;
}

/** Coge todo lo del contenedor, colocando cada cosa en su sitio (barra rápida o mochila). */
export function takeAllFrom(env: UiEnv, from: InvRef): void {
  const sim = env.ctx.sim;
  const inv = sim.inventoryOf(from);
  if (!inv) return void env.act({ ok: false, msg: 'Ese contenedor ya no está disponible' }, 'info');
  let moved = 0;
  let left = 0;
  let fail: ActionResult | null = null;
  const n = inv.slots.length;
  for (let i = 0; i < n; i++) {
    const cur = sim.inventoryOf(from);
    const s = cur?.slots[i];
    if (!s) continue;
    const before = s.qty;
    const r = moveOne(env, from, i, { kind: 'player' }, undefined);
    const after = sim.inventoryOf(from)?.slots[i];
    const got = after && after.id === s.id ? before - after.qty : before;
    if (r.ok) moved += got;
    else fail = r;
    if (after && after.id === s.id) left += after.qty;
  }
  if (moved === 0) env.act(fail ?? { ok: false, msg: left > 0 ? 'No tienes sitio en el inventario' : 'No hay nada que coger' }, 'info');
  else env.act({ ok: true, msg: left > 0 || fail ? 'Coges lo que cabe: tu inventario está lleno' : 'Lo coges todo' }, 'good');
}

/**
 * Guarda en el contenedor todo lo de la mochila (ranuras 9-24). Con `hotbarToo`, también lo de la
 * barra rápida que no sea herramienta (comida, agua, materiales…); las herramientas se quedan.
 */
export function storeAll(env: UiEnv, to: InvRef, hotbarToo = false): void {
  const sim = env.ctx.sim;
  const inv = sim.state.player.inventory;
  let moved = 0;
  let fail: ActionResult | null = null;
  const start = hotbarToo ? 0 : HOTBAR_SLOTS;
  for (let i = start; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (!s) continue;
    if (i < HOTBAR_SLOTS && ITEMS[s.id]?.category === 'herramienta') continue;
    const r = sim.moveItem({ kind: 'player' }, i, to);
    if (r.ok) moved++;
    else fail = r;
  }
  if (moved > 0) {
    const what = hotbarToo ? 'Guardas todo menos las herramientas' : 'Guardas todo lo de la mochila';
    env.toast(fail ? 'Guardas lo que cabe: el contenedor está lleno' : what, fail ? 'warn' : 'good');
    env.refresh();
    return;
  }
  if (fail) return void env.act(fail, 'info');
  const hotbarItems = inv.slots.slice(0, HOTBAR_SLOTS).some((s) => s && ITEMS[s.id]?.category !== 'herramienta');
  const msg = hotbarToo ? 'Solo llevas herramientas: se quedan contigo' : hotbarItems ? 'La mochila está vacía. Para guardar también la barra rápida (menos las herramientas), usa Mayús+clic o «Guardar también la barra»' : 'No llevas nada en la mochila';
  env.act({ ok: false, msg }, 'info');
}

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */

export interface TransferOpts {
  /** Contenedor principal (almacén, caja, despensa, bandeja…). */
  ref: InvRef;
  title: VInput;
  cols: number;
  /** Botón "Guardar todo" (no en bandejas de salida). */
  canStore?: boolean;
  /** Contenido extra bajo la rejilla del contenedor (ranura de combustible…). */
  extra?: VInput;
  /** Texto de ayuda bajo el contenedor. */
  note?: VInput;
}

/** Líneas de ayuda de la descripción emergente de una ranura de transferencia. */
export function moveHints(verb: 'guardar' | 'coger' | 'sacar'): string[] {
  return [`Clic: ${verb} la pila · Clic derecho: la mitad · Ctrl+clic: una`, `Mayús+clic: ${verb} todo lo de ese tipo`];
}

/** Opciones de ranura para mover entre dos inventarios con el esquema común de clics. */
export function moveSlotOpts(env: UiEnv, from: InvRef, i: number, to: InvRef, verb: 'guardar' | 'coger' | 'sacar'): { hints: string[]; onClick: (e: MouseEvent) => void; onRight: () => void } {
  return {
    hints: moveHints(verb),
    onClick: (e: MouseEvent) => quickMove(env, from, i, to, clickMode(e)),
    onRight: () => quickMove(env, from, i, to, 'half'),
  };
}

export function transferView(env: UiEnv, o: TransferOpts): VNode {
  const sim = env.ctx.sim;
  const player = { kind: 'player' as const };
  const pinv = sim.state.player.inventory;
  const cinv = sim.inventoryOf(o.ref);
  const used = cinv ? cinv.slots.filter((s) => !!s).length : 0;
  return h(
    'div',
    { class: 'xfer' },
    h(
      'div',
      { class: 'xfer-col' },
      h('div', { class: 'grid-label' }, gl('bag'), 'Tu inventario', h('span', { class: 'faint' }, `${pinv.slots.filter((s) => !!s).length}/${pinv.slots.length}`)),
      grid(env, player, 8, (i) => ({
        hotkey: i < HOTBAR_SLOTS ? i + 1 : undefined,
        ...moveSlotOpts(env, player, i, o.ref, 'guardar'),
      })),
      o.canStore !== false
        ? h(
            'div',
            { class: 'xfer-actions' },
            btn('Guardar todo', (e) => storeAll(env, o.ref, e.shiftKey), { small: true, glyph: 'arrow', title: 'Guarda todo lo de la mochila; la barra rápida (1-8) se queda contigo. Mayús+clic: también la barra, menos las herramientas' }),
            btn('Guardar también la barra', () => storeAll(env, o.ref, true), { small: true, title: 'Guarda la mochila y lo que no sea herramienta de la barra rápida (comida, agua, materiales…)' }),
          )
        : null,
    ),
    h('div', { class: 'xfer-mid' }, gl('swap')),
    h(
      'div',
      { class: 'xfer-col' },
      h('div', { class: 'grid-label' }, o.title, cinv ? h('span', { class: 'faint' }, `${used}/${cinv.slots.length}`) : null),
      cinv ? h('div', { class: 'xfer-scroll scroll' }, grid(env, o.ref, o.cols, (i) => moveSlotOpts(env, o.ref, i, player, 'coger'))) : null,
      h('div', { class: 'xfer-actions' }, btn('Tomar todo', () => takeAllFrom(env, o.ref), { small: true, glyph: 'back', disabled: used === 0, title: 'Herramientas, comida y bebida van a la barra rápida; lo demás, a la mochila' })),
      o.extra ?? null,
      o.note ? h('div', { class: 'xfer-note faint' }, o.note) : null,
    ),
  );
}

/** Línea de ayuda de controles de transferencia (una sola línea). */
export function transferHelp(): VNode {
  return h(
    'div',
    { class: 'help-line' },
    h('span', null, kbd('Clic'), ' la pila'),
    h('span', null, kbd('Clic der.'), ' la mitad'),
    h('span', null, kbd('Ctrl'), '+', kbd('Clic'), ' una'),
    h('span', null, kbd('Mayús'), '+', kbd('Clic'), ' todo lo de ese tipo'),
    h('span', null, 'Arrastra para elegir la ranura'),
    h('span', null, kbd('1'), '–', kbd('8'), ' encima: a la barra rápida'),
  );
}

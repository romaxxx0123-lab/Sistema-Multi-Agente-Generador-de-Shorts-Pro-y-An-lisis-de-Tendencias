/**
 * Vista de dos rejillas (tu inventario ↔ contenedor) para almacenes, despensa, bandejas, cajas
 * sueltas y ranuras de combustible.
 *
 * Controles: clic = mover la pila al otro lado · Mayús+clic = mover todas las pilas de ese objeto ·
 * arrastrar = colocar en una ranura concreta · clic derecho en tu inventario = usar.
 */
import { ITEMS } from '../../data/items';
import { HOTBAR_SLOTS } from '../../sim/constants';
import type { ActionResult, InvRef } from '../../sim/Simulation';
import type { UiEnv } from '../env';
import { itemName } from '../fmt';
import { useVerb } from '../model';
import { h, type VInput, type VNode } from '../vdom';
import { btn, gl, grid, kbd } from '../widgets';

/** Mueve una pila (o, con Mayús, todas las pilas del mismo objeto) de un inventario a otro. */
export function quickMove(env: UiEnv, from: InvRef, slot: number, to: InvRef, all: boolean): void {
  const sim = env.ctx.sim;
  const inv = sim.inventoryOf(from);
  const s = inv?.slots[slot];
  if (!inv || !s) return;
  if (!all) {
    env.act(sim.moveItem(from, slot, to), 'info');
    return;
  }
  const id = s.id;
  let last: ActionResult | null = null;
  let moved = 0;
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i]?.id !== id) continue;
    last = sim.moveItem(from, i, to);
    if (!last.ok) break;
    moved++;
  }
  if (last && !last.ok) env.act(last, 'info');
  else {
    if (moved > 1) env.toast(`Mueves todas las pilas de ${itemName(id)}`, 'info');
    env.refresh();
  }
}

/** Guarda en el contenedor todo lo de la mochila (las ranuras 9-24; la barra rápida se queda). */
export function storeAll(env: UiEnv, to: InvRef): void {
  const sim = env.ctx.sim;
  const inv = sim.state.player.inventory;
  let moved = 0;
  let fail: ActionResult | null = null;
  for (let i = HOTBAR_SLOTS; i < inv.slots.length; i++) {
    if (!inv.slots[i]) continue;
    const r = sim.moveItem({ kind: 'player' }, i, to);
    if (r.ok) moved++;
    else fail = r;
  }
  if (moved === 0) env.act(fail ?? { ok: false, msg: 'No llevas nada en la mochila (la barra rápida no se guarda)' }, 'info');
  else {
    env.toast(fail ? 'Guardas lo que cabe: el contenedor está lleno' : 'Guardas todo lo de la mochila', fail ? 'warn' : 'good');
    env.refresh();
  }
}

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
      grid(env, player, 8, (i, s) => {
        const def = s ? ITEMS[s.id] : undefined;
        const verb = def ? useVerb(def, i) : null;
        return {
          hotkey: i < HOTBAR_SLOTS ? i + 1 : undefined,
          hints: ['Clic: guardar la pila · Mayús+clic: guardar todo lo de ese tipo', ...(verb ? [`Clic derecho: ${verb}`] : [])],
          onClick: (e: MouseEvent) => quickMove(env, player, i, o.ref, e.shiftKey),
          onUse: () => env.act(sim.useItem(i), 'good'),
        };
      }),
      o.canStore !== false ? h('div', { class: 'xfer-actions' }, btn('Guardar todo', () => storeAll(env, o.ref), { small: true, glyph: 'arrow', title: 'Guarda todo lo de la mochila; la barra rápida (1-8) se queda contigo' })) : null,
    ),
    h('div', { class: 'xfer-mid' }, gl('swap')),
    h(
      'div',
      { class: 'xfer-col' },
      h('div', { class: 'grid-label' }, o.title, cinv ? h('span', { class: 'faint' }, `${used}/${cinv.slots.length}`) : null),
      cinv
        ? h(
            'div',
            { class: 'xfer-scroll scroll' },
            grid(env, o.ref, o.cols, (i) => ({
              hints: ['Clic: coger la pila · Mayús+clic: coger todo lo de ese tipo'],
              onClick: (e: MouseEvent) => quickMove(env, o.ref, i, player, e.shiftKey),
            })),
          )
        : null,
      h('div', { class: 'xfer-actions' }, btn('Tomar todo', () => env.act(sim.takeAll(o.ref), 'good'), { small: true, glyph: 'back', disabled: used === 0 })),
      o.extra ?? null,
      o.note ? h('div', { class: 'xfer-note faint' }, o.note) : null,
    ),
  );
}

/** Línea de ayuda de controles de transferencia. */
export function transferHelp(): VNode {
  return h('div', { class: 'help-line' }, h('span', null, kbd('Clic'), ' mover la pila'), h('span', null, kbd('Mayús'), '+', kbd('Clic'), ' todo lo de ese tipo'), h('span', null, 'Arrastra para elegir la ranura'));
}

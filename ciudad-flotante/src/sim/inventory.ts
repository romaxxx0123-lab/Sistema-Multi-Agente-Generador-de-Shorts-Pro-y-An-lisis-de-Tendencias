import { ITEMS } from '../data/items';
import type { Inventory, ItemId, ItemStack } from './types';

export function createInventory(size: number): Inventory {
  return { slots: Array.from({ length: size }, () => null) };
}

export function stackLimit(id: ItemId): number {
  return ITEMS[id]?.stack ?? 1;
}

export function countItem(inv: Inventory | null | undefined, id: ItemId): number {
  if (!inv) return 0;
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.qty;
  return n;
}

export function countIn(invs: (Inventory | null | undefined)[], id: ItemId): number {
  let n = 0;
  for (const inv of invs) n += countItem(inv, id);
  return n;
}

/** Cuántas unidades de `id` caben en el inventario. */
export function spaceFor(inv: Inventory, id: ItemId): number {
  const lim = stackLimit(id);
  let space = 0;
  for (const s of inv.slots) {
    if (!s) space += lim;
    else if (s.id === id) space += Math.max(0, lim - s.qty);
  }
  return space;
}

/**
 * Añade `qty` unidades. Devuelve las unidades que NO cupieron (0 si todo entró).
 * Primero completa pilas existentes y luego usa huecos libres.
 */
export function addItem(inv: Inventory, id: ItemId, qty: number): number {
  if (qty <= 0) return 0;
  const lim = stackLimit(id);
  let left = qty;
  for (const s of inv.slots) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < lim) {
      const add = Math.min(lim - s.qty, left);
      s.qty += add;
      left -= add;
    }
  }
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    if (!inv.slots[i]) {
      const add = Math.min(lim, left);
      inv.slots[i] = { id, qty: add };
      left -= add;
    }
  }
  return left;
}

/**
 * Como `addItem`, pero los huecos libres se rellenan primero en el rango preferido
 * [from, to) y después en el resto. Las pilas existentes se completan siempre primero.
 */
export function addItemPreferring(inv: Inventory, id: ItemId, qty: number, from: number, to: number): number {
  if (qty <= 0) return 0;
  const lim = stackLimit(id);
  let left = qty;
  for (const s of inv.slots) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < lim) {
      const add = Math.min(lim - s.qty, left);
      s.qty += add;
      left -= add;
    }
  }
  const order: number[] = [];
  for (let i = Math.max(0, from); i < Math.min(inv.slots.length, to); i++) order.push(i);
  for (let i = 0; i < inv.slots.length; i++) if (i < from || i >= to) order.push(i);
  for (const i of order) {
    if (left <= 0) break;
    if (!inv.slots[i]) {
      const add = Math.min(lim, left);
      inv.slots[i] = { id, qty: add };
      left -= add;
    }
  }
  return left;
}

/** Quita `qty` unidades si hay suficientes. Devuelve true si se quitaron. Empieza por las últimas ranuras. */
export function removeItem(inv: Inventory, id: ItemId, qty: number): boolean {
  if (qty <= 0) return true;
  if (countItem(inv, id) < qty) return false;
  let left = qty;
  for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.slots[i];
    if (s && s.id === id) {
      const take = Math.min(s.qty, left);
      s.qty -= take;
      left -= take;
      if (s.qty <= 0) inv.slots[i] = null;
    }
  }
  return true;
}

/** Quita hasta `qty` unidades de una ranura concreta. Devuelve la pila retirada (o null). */
export function takeFromSlot(inv: Inventory, slot: number, qty?: number): ItemStack | null {
  const s = inv.slots[slot];
  if (!s) return null;
  const n = Math.min(s.qty, qty ?? s.qty);
  s.qty -= n;
  if (s.qty <= 0) inv.slots[slot] = null;
  return { id: s.id, qty: n };
}

/**
 * Mueve la pila de `from[fromSlot]` a `to`. Si `toSlot` se indica, intenta esa ranura
 * (fusiona o intercambia); si no, la reparte donde quepa. Lo que no cabe se queda en origen.
 */
export function moveStack(from: Inventory, fromSlot: number, to: Inventory, toSlot?: number): boolean {
  const s = from.slots[fromSlot];
  if (!s) return false;
  if (toSlot === undefined) {
    const left = addItem(to, s.id, s.qty);
    if (left === s.qty) return false;
    if (left <= 0) from.slots[fromSlot] = null;
    else s.qty = left;
    return true;
  }
  if (from === to && fromSlot === toSlot) return false;
  const t = to.slots[toSlot];
  if (!t) {
    to.slots[toSlot] = s;
    from.slots[fromSlot] = null;
    return true;
  }
  if (t.id === s.id) {
    const lim = stackLimit(s.id);
    const add = Math.min(lim - t.qty, s.qty);
    if (add <= 0) return false;
    t.qty += add;
    s.qty -= add;
    if (s.qty <= 0) from.slots[fromSlot] = null;
    return true;
  }
  to.slots[toSlot] = s;
  from.slots[fromSlot] = t;
  return true;
}

export function isEmpty(inv: Inventory | null | undefined): boolean {
  return !inv || inv.slots.every((s) => !s);
}

export function totals(invs: (Inventory | null | undefined)[]): Record<ItemId, number> {
  const out: Record<ItemId, number> = {};
  for (const inv of invs) {
    if (!inv) continue;
    for (const s of inv.slots) if (s) out[s.id] = (out[s.id] ?? 0) + s.qty;
  }
  return out;
}

/** Calcula lo que falta para pagar `cost` con los inventarios dados. */
export function missingFor(invs: (Inventory | null | undefined)[], cost: Record<ItemId, number>): Record<ItemId, number> {
  const t = totals(invs);
  const miss: Record<ItemId, number> = {};
  for (const [id, n] of Object.entries(cost)) {
    const have = t[id] ?? 0;
    if (have < n) miss[id] = n - have;
  }
  return miss;
}

export function canAfford(invs: (Inventory | null | undefined)[], cost: Record<ItemId, number>): boolean {
  return Object.keys(missingFor(invs, cost)).length === 0;
}

/** Consume `cost` repartido entre los inventarios en orden. Devuelve false (sin tocar nada) si no alcanza. */
export function consume(invs: (Inventory | null | undefined)[], cost: Record<ItemId, number>): boolean {
  if (!canAfford(invs, cost)) return false;
  for (const [id, n] of Object.entries(cost)) {
    let left = n;
    for (const inv of invs) {
      if (!inv || left <= 0) continue;
      const have = countItem(inv, id);
      const take = Math.min(have, left);
      if (take > 0) {
        removeItem(inv, id, take);
        left -= take;
      }
    }
  }
  return true;
}

/** Copia profunda (para tests y simulaciones hipotéticas). */
export function cloneInventory(inv: Inventory): Inventory {
  return { slots: inv.slots.map((s) => (s ? { ...s } : null)) };
}

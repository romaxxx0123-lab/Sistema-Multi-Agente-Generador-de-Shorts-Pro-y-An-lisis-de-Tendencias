/** Utilidades compartidas por los sistemas de simulación. */
import { ITEMS } from '../data/items';
import { moduleDef } from '../data/modules';
import { addItem, addItemPreferring, createInventory, countIn, isEmpty } from './inventory';
import { HOTBAR_SLOTS } from './constants';
import type { Simulation } from './Simulation';
import type { Inventory, ItemId, ItemStack, LooseCrate, ModuleInstance, Vec3 } from './types';

export function findModule(sim: Simulation, id: number): ModuleInstance | undefined {
  return sim.state.ship.modules.find((m) => m.id === id);
}

export function modulesOfType(sim: Simulation, type: string, activeOnly = true): ModuleInstance[] {
  return sim.state.ship.modules.filter((m) => m.type === type && (!activeOnly || m.status === 'active'));
}

/** Almacenes generales (almacén y despensa de la cocina) operativos. */
export function storageModules(sim: Simulation): ModuleInstance[] {
  return sim.state.ship.modules.filter((m) => (m.type === 'almacen' || m.type === 'cocina') && m.status !== 'construction' && m.inventory);
}

/** Inventarios donde se puede pagar/retirar: primero el jugador, luego los almacenes y bandejas de estaciones. */
export function payInventories(sim: Simulation, includePlayer = true): Inventory[] {
  const out: Inventory[] = [];
  if (includePlayer) out.push(sim.state.player.inventory);
  for (const m of sim.state.ship.modules) {
    if (m.status === 'construction' || !m.inventory) continue;
    out.push(m.inventory);
  }
  return out;
}

/** Cantidad total de un objeto en el barco (jugador + almacenes + bandejas). */
export function shipCount(sim: Simulation, id: ItemId): number {
  return countIn(payInventories(sim), id);
}

/** Guarda objetos en los almacenes (almacén primero). Devuelve lo que no cupo. */
export function depositToStorage(sim: Simulation, id: ItemId, qty: number): number {
  let left = qty;
  const mods = storageModules(sim).sort((a, b) => (a.type === 'almacen' ? -1 : 1) - (b.type === 'almacen' ? -1 : 1));
  for (const m of mods) {
    if (left <= 0) break;
    left = addItem(m.inventory!, id, left);
  }
  return left;
}

/** Crea (o reutiliza si hay una muy cerca) una caja suelta con los objetos. */
export function spawnCrate(sim: Simulation, pos: Vec3, items: ItemStack[], label = 'Caja'): LooseCrate | null {
  const real = items.filter((s) => s.qty > 0);
  if (!real.length) return null;
  let crate = sim.state.crates.find((c) => Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < 1.2 && Math.abs(c.pos.y - pos.y) < 1);
  if (!crate) {
    crate = { id: sim.nextId(), pos: { ...pos }, inventory: createInventory(16), label };
    sim.state.crates.push(crate);
  }
  for (const s of real) {
    let left = addItem(crate.inventory, s.id, s.qty);
    while (left > 0) {
      // Inventario de caja lleno: ampliar.
      crate.inventory.slots.push(null, null, null, null);
      left = addItem(crate.inventory, s.id, left);
    }
  }
  return crate;
}

/** Elimina cajas vacías. */
export function pruneCrates(sim: Simulation): void {
  sim.state.crates = sim.state.crates.filter((c) => !isEmpty(c.inventory));
}

/**
 * Da objetos al jugador. Lo que no quepa se deja en una caja a sus pies (nunca se pierde nada).
 * Emite 'itemGained'. Devuelve true si todo cupo en el inventario.
 */
export function giveToPlayer(sim: Simulation, id: ItemId, qty: number, quiet = false): boolean {
  if (qty <= 0) return true;
  const left = addToPlayerInventory(sim, id, qty);
  const got = qty - left;
  if (got > 0) sim.bus.emit('itemGained', { id, qty: got });
  if (left > 0) {
    spawnCrate(sim, sim.state.player.pos, [{ id, qty: left }], 'Objetos');
    if (!quiet) sim.notify(`Inventario lleno: ${left}× ${ITEMS[id]?.name ?? id} en una caja a tus pies`, 'warn');
    return false;
  }
  return true;
}

/**
 * Añade al inventario del jugador con preferencia de ranura: herramientas, ropa y medicinas van
 * primero a la barra rápida (para poder empuñarlas); materiales, comida y lo demás, a la mochila.
 * Devuelve lo que no cupo.
 */
export function addToPlayerInventory(sim: Simulation, id: ItemId, qty: number): number {
  const inv = sim.state.player.inventory;
  const cat = ITEMS[id]?.category;
  const toHotbar = cat === 'herramienta' || cat === 'medicina' || cat === 'ropa';
  return toHotbar ? addItemPreferring(inv, id, qty, 0, HOTBAR_SLOTS) : addItemPreferring(inv, id, qty, HOTBAR_SLOTS, inv.slots.length);
}

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? id;
}

export function moduleName(m: ModuleInstance): string {
  return moduleDef(m.type).name;
}

/** Texto "3× Madera, 2× Cuerda". */
export function stacksText(items: Record<ItemId, number> | ItemStack[]): string {
  const entries: [string, number][] = Array.isArray(items) ? items.map((s) => [s.id, s.qty]) : Object.entries(items);
  return entries.map(([id, n]) => `${n}× ${itemName(id)}`).join(', ');
}

/**
 * [AGENTE sim-survival] Acciones del jugador sobre objetos, inventarios, sueño y agua.
 * STUB: implementar según docs/ARQUITECTURA.md.
 */
import type { ActionResult, InvRef, Simulation } from './Simulation';
import type { Inventory } from './types';

export function inventoryOf(sim: Simulation, ref: InvRef): Inventory | null {
  if (ref.kind === 'player') return sim.state.player.inventory;
  if (ref.kind === 'crate') return sim.state.crates.find((c) => c.id === ref.id)?.inventory ?? null;
  const m = sim.state.ship.modules.find((mm) => mm.id === ref.id);
  if (!m) return null;
  return ref.slot === 'fuel' ? m.fuelInv : m.inventory;
}

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export function useItem(_sim: Simulation, _slot: number): ActionResult {
  return TODO;
}
export function unequipClothing(_sim: Simulation): ActionResult {
  return TODO;
}
export function moveItem(_sim: Simulation, _from: InvRef, _fromSlot: number, _to: InvRef, _toSlot?: number): ActionResult {
  return TODO;
}
export function takeAll(_sim: Simulation, _from: InvRef): ActionResult {
  return TODO;
}
export function dropItem(_sim: Simulation, _slot: number): ActionResult {
  return TODO;
}
export function sleep(_sim: Simulation, _moduleId: number, _bed: number): ActionResult {
  return TODO;
}
export function wake(_sim: Simulation, _reason?: string): void {}
export function drinkFromTank(_sim: Simulation): ActionResult {
  return TODO;
}
export function fillBottle(_sim: Simulation): ActionResult {
  return TODO;
}
export function setHotbar(sim: Simulation, index: number): void {
  sim.state.player.hotbar = Math.max(0, Math.min(7, index));
}

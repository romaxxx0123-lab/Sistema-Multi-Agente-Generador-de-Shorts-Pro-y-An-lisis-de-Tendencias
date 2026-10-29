/** [AGENTE sim-economy] Construcción, demolición, ampliación, obras y reparaciones. STUB. */
import { checkPlacement, type PlaceCheck } from './ship';
import type { ActionResult, Simulation } from './Simulation';
import type { ItemId, Rotation } from './types';

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export function tickConstruction(_sim: Simulation, _dt: number): void {}
export function checkPlace(sim: Simulation, type: string, level: number, x: number, z: number, rot: Rotation): PlaceCheck & { missing: Record<ItemId, number> } {
  return { ...checkPlacement(sim.state.ship, sim.state.unlocks, type, level, x, z, rot), missing: {} };
}
export function placeModule(_sim: Simulation, _type: string, _level: number, _x: number, _z: number, _rot: Rotation): ActionResult & { moduleId?: number } {
  return TODO;
}
export function checkDemolishModule(_sim: Simulation, _moduleId: number): { ok: boolean; reason: string | null; refund: Record<ItemId, number> } {
  return { ok: false, reason: 'Pendiente', refund: {} };
}
export function demolish(_sim: Simulation, _moduleId: number): ActionResult {
  return TODO;
}
export function checkExpandHull(_sim: Simulation): { ok: boolean; reason: string | null; missing: Record<ItemId, number> } {
  return { ok: false, reason: 'Pendiente', missing: {} };
}
export function expandHull(_sim: Simulation): ActionResult {
  return TODO;
}
export function helpBuild(_sim: Simulation, _moduleId: number, _minutes: number): ActionResult {
  return TODO;
}
export function repairInfo(_sim: Simulation, _moduleId: number): { needed: boolean; tool: ItemId | null; part: ItemId | null; ok: boolean; reason: string | null } {
  return { needed: false, tool: null, part: null, ok: false, reason: 'Pendiente' };
}
export function repair(_sim: Simulation, _moduleId: number): ActionResult {
  return TODO;
}

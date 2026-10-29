/** [AGENTE sim-life] Director de eventos, incendios, comercio. STUB. */
import type { ActionResult, Simulation } from './Simulation';

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export function tickEvents(_sim: Simulation, _dt: number): void {}
export function eventChoice(_sim: Simulation, _eventId: number, _choiceId: string): ActionResult {
  return TODO;
}
export function trade(_sim: Simulation, _eventId: number, _offerIndex: number): ActionResult {
  return TODO;
}
export function extinguish(_sim: Simulation, _moduleId: number): ActionResult {
  return TODO;
}

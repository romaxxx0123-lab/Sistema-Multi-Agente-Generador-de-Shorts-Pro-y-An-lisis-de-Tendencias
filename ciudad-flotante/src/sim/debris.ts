/** [AGENTE sim-life] Restos flotantes, pesca y cubo. STUB. */
import type { ActionResult, Simulation } from './Simulation';

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export function tickDebris(_sim: Simulation, _dt: number): void {}
export function collectDebris(_sim: Simulation, _debrisId: number): ActionResult {
  return TODO;
}
export function fishBiteDelay(_sim: Simulation): number {
  return 12;
}
export function catchFish(_sim: Simulation): ActionResult {
  return TODO;
}
export function fillBucket(_sim: Simulation): ActionResult {
  return TODO;
}

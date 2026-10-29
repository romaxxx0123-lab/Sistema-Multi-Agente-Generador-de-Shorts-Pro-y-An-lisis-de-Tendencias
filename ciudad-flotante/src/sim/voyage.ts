/** [AGENTE sim-survival] Viaje por regiones y rumbo. STUB. */
import type { ActionResult, Simulation } from './Simulation';
export function tickVoyage(_sim: Simulation, _dt: number): void {}
export function chooseRoute(_sim: Simulation, _regionId: string): ActionResult {
  return { ok: false, msg: 'Pendiente de implementar' };
}

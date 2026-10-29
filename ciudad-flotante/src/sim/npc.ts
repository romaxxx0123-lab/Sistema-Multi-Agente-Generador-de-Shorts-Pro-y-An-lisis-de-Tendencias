/** [AGENTE sim-life] Habitantes autónomos. STUB. */
import type { ActionResult, NpcTalk, Simulation } from './Simulation';
import type { NpcRole } from './types';

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export function tickNpcs(_sim: Simulation, _dt: number): void {}
export function talkTo(_sim: Simulation, _npcId: string): NpcTalk | null {
  return null;
}
export function npcOption(_sim: Simulation, _npcId: string, _optionId: string): ActionResult {
  return TODO;
}
export function setRole(_sim: Simulation, _npcId: string, _role: NpcRole): ActionResult {
  return TODO;
}
export function giveItem(_sim: Simulation, _npcId: string, _slot: number): ActionResult {
  return TODO;
}

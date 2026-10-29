/** [AGENTE sim-survival] Tutorial progresivo. STUB. */
import type { Simulation } from './Simulation';
export interface TutorialStep {
  id: string;
  title: string;
  text: string;
}
export function tickTutorial(_sim: Simulation, _dt: number): void {}

/** Marca un paso del tutorial como hecho (lo llaman los sistemas al ocurrir la acción). */
export function markTutorial(sim: Simulation, id: string): void {
  const t = sim.state.tutorial;
  if (t.done.includes(id)) return;
  t.done.push(id);
  sim.bus.emit('tutorialStep', { id });
}
/** Paso actual a mostrar (o null). */
export function currentTutorial(_sim: Simulation): TutorialStep | null {
  return null;
}

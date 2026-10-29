/** [AGENTE sim-economy] Fabricación, cocina, generadores y cultivos. STUB. */
import type { RecipeDef } from '../data/recipes';
import type { ActionResult, Simulation } from './Simulation';
import type { ItemId } from './types';

const TODO: ActionResult = { ok: false, msg: 'Pendiente de implementar' };

export interface RecipeAvailability {
  recipe: RecipeDef;
  locked: boolean;
  canCraft: boolean;
  missing: Record<ItemId, number>;
}

export function tickStations(_sim: Simulation, _dt: number): void {}
export function availableRecipes(_sim: Simulation, _moduleId: number | null): RecipeAvailability[] {
  return [];
}
export function craftByHand(_sim: Simulation, _recipeId: string): ActionResult {
  return TODO;
}
export function queueCraft(_sim: Simulation, _moduleId: number, _recipeId: string, _count: number): ActionResult {
  return TODO;
}
export function cancelCraft(_sim: Simulation, _moduleId: number, _jobIndex: number): ActionResult {
  return TODO;
}
export function plant(_sim: Simulation, _moduleId: number, _plot: number, _seed: ItemId): ActionResult {
  return TODO;
}
export function harvest(_sim: Simulation, _moduleId: number, _plot: number): ActionResult {
  return TODO;
}
export function tendPlot(_sim: Simulation, _moduleId: number, _plot: number): ActionResult {
  return TODO;
}

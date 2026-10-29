/** [AGENTE sim-survival] Guardado y carga. STUB mínimo funcional. */
import type { GameState } from './types';
import { SAVE_VERSION } from './types';

export interface SaveSlotInfo {
  slot: string;
  day: number;
  time: number;
  savedAt: number;
  region: string;
  label: string;
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (s.version !== SAVE_VERSION) throw new Error('Versión de guardado no compatible');
  return s;
}

export interface SaveStore {
  list(): SaveSlotInfo[];
  save(slot: string, state: GameState, label?: string): void;
  load(slot: string): GameState | null;
  remove(slot: string): void;
}

export function createLocalSaveStore(_prefix = 'ciudad-flotante'): SaveStore {
  return {
    list: () => [],
    save: () => {},
    load: () => null,
    remove: () => {},
  };
}

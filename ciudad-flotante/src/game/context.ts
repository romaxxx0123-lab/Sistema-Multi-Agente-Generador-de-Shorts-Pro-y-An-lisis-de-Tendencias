/**
 * Contexto compartido de la capa de juego. `Game` lo implementa y se pasa a controladores,
 * UI, modo construcción y audio. IMPORTANTE: `sim` se sustituye al cargar/empezar partida;
 * accede siempre a `ctx.sim` en lugar de guardarte la referencia.
 */
import type { EventBus } from '../core/EventBus';
import type { Audio } from '../audio/Audio';
import type { BuildMode } from '../build/BuildMode';
import type { DebrisView } from '../render/DebrisView';
import type { NpcView } from '../render/NpcView';
import type { Renderer } from '../render/Renderer';
import type { ShipView } from '../render/ShipView';
import type { SaveSlotInfo } from '../sim/save';
import type { Simulation } from '../sim/Simulation';
import type { UI } from '../ui/UI';
import type { Input } from './Input';
import type { Interaction } from './Interaction';
import type { PlayerController } from './PlayerController';
import type { GameMode, HighlightTarget, Settings } from './types';

export interface GameContext {
  readonly sim: Simulation;
  readonly bus: EventBus;
  readonly renderer: Renderer;
  readonly shipView: ShipView;
  readonly npcView: NpcView;
  readonly debrisView: DebrisView;
  readonly input: Input;
  readonly ui: UI;
  readonly player: PlayerController;
  readonly interaction: Interaction;
  readonly build: BuildMode;
  readonly audio: Audio;
  readonly settings: Settings;
  readonly mode: GameMode;
  /** Pausa (menú de pausa abierto). La simulación no avanza. */
  paused: boolean;
  /** Objetivo resaltado (lo fija Interaction, lo dibuja ShipView/NpcView). */
  highlight: HighlightTarget | null;
  setMode(mode: GameMode): void;
  saveSettings(): void;
  applySettings(): void;
  newGame(seed?: number): void;
  saveGame(slot?: string): void;
  loadGame(slot: string): boolean;
  listSaves(): SaveSlotInfo[];
  deleteSave(slot: string): void;
  /** true si existe al menos una partida guardada. */
  hasSaves(): boolean;
}

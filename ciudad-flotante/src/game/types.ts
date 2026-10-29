/** Tipos compartidos de la capa de juego/presentación. */
export type GameMode = 'menu' | 'play' | 'build' | 'dead';

export type Quality = 'baja' | 'media' | 'alta';

export interface Settings {
  /** Sensibilidad del ratón (radianes por píxel ×1000). */
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  perspective: 'first' | 'third';
  tutorial: boolean;
  /** 0..1 */
  volume: number;
  /** Mostrar FPS. */
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 2.2,
  invertY: false,
  fov: 72,
  quality: 'media',
  perspective: 'first',
  tutorial: true,
  volume: 0.7,
  showFps: false,
};

/** Paneles que la UI puede abrir. */
export type PanelRequest =
  | { kind: 'inventory'; tab?: 'objetos' | 'fabricar' | 'diario' }
  | { kind: 'station'; moduleId: number }
  | { kind: 'crate'; crateId: number }
  | { kind: 'npc'; npcId: string }
  | { kind: 'helm' }
  | { kind: 'trade'; eventId: number };

export interface PromptInfo {
  /** Tecla mostrada (E, Clic, Mantén E...). */
  key: string;
  text: string;
  sub?: string;
  /** 0..1 para acciones mantenidas. */
  progress?: number;
  disabled?: boolean;
  /** Acción secundaria (p.ej. "R: Reparar"). */
  alt?: { key: string; text: string; disabled?: boolean };
}

export type HighlightTarget =
  | { kind: 'prop'; key: string }
  | { kind: 'module'; id: number }
  | { kind: 'npc'; id: string }
  | { kind: 'debris'; id: number }
  | { kind: 'crate'; id: number };

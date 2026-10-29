/**
 * Tipos compartidos por las piezas de la interfaz (HUD, paneles, menús).
 */
import type { NotifyKind } from '../core/EventBus';
import type { GameContext } from '../game/context';
import type { PanelRequest } from '../game/types';
import type { ActionResult, InvRef } from '../sim/Simulation';
import type { DragManager } from './drag';
import type { Tooltip } from './tooltip';

/** Estado local (de interfaz) del panel abierto. Se reinicia al abrir otro panel. */
export interface PanelState {
  /** Pestaña activa (inventario: objetos/fabricar/diario/barco). */
  tab?: string;
  /** Ranura seleccionada del jugador (detalle del objeto). */
  sel?: number | null;
  /** Receta seleccionada. */
  recipe?: string | null;
  /** Filtro de estación en la pestaña Fabricar. */
  station?: string;
  /** Huerto: parcela que espera la elección de semilla. */
  seedFor?: number | null;
  /** Habitante: eligiendo qué darle. */
  giving?: boolean;
  /** Confirmación pendiente (clave de la acción). */
  confirm?: string | null;
}

/** Entorno que reciben los renderizadores de paneles. */
export interface UiEnv {
  readonly ctx: GameContext;
  readonly tip: Tooltip;
  readonly drag: DragManager;
  /** Estado local del panel abierto. */
  readonly ps: PanelState;
  /** Ranura del jugador bajo el cursor (para asignar a la barra rápida con 1-8). */
  hover: { ref: InvRef; slot: number } | null;
  toast(text: string, kind?: NotifyKind): void;
  /**
   * Muestra el resultado de un comando de la simulación (mensaje en un aviso) y repinta.
   * Devuelve `res.ok`.
   */
  act(res: ActionResult | null | undefined, okKind?: NotifyKind): boolean;
  open(p: PanelRequest): void;
  close(): void;
  /** Repinta el panel ya (tras un cambio de estado local). */
  refresh(): void;
}

/** Clave textual de un inventario (atributo `data-inv`). */
export function refKey(ref: InvRef): string {
  switch (ref.kind) {
    case 'player':
      return 'player';
    case 'crate':
      return `crate:${ref.id}`;
    default:
      return `module:${ref.id}:${ref.slot}`;
  }
}

export function parseRef(key: string | null | undefined): InvRef | null {
  if (!key) return null;
  if (key === 'player') return { kind: 'player' };
  const parts = key.split(':');
  if (parts[0] === 'crate' && parts[1]) return { kind: 'crate', id: Number(parts[1]) };
  if (parts[0] === 'module' && parts[1] && (parts[2] === 'inventory' || parts[2] === 'fuel')) {
    return { kind: 'module', id: Number(parts[1]), slot: parts[2] };
  }
  return null;
}

export function sameRef(a: InvRef, b: InvRef): boolean {
  return refKey(a) === refKey(b);
}

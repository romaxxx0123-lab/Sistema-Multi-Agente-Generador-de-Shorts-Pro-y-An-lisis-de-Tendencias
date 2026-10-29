/**
 * [AGENTE game-player] Entorno común de las herramientas (gancho, caña…): lo implementa
 * `Interaction` y se lo pasa a cada herramienta para que no dependan unas de otras.
 */
import type * as THREE from 'three';
import type { NotifyKind } from '../../core/EventBus';
import type { GameContext } from '../context';
import type { ToolEffects } from './effects';
import type { ViewModel } from './viewmodel';

export interface ToolEnv {
  readonly ctx: GameContext;
  readonly vm: ViewModel;
  readonly fx: ToolEffects;
  /**
   * Punto de la mano / herramienta en coordenadas de MUNDO: en primera persona, el ancla del
   * modelo en mano ('garfio', 'mano', 'punta', 'boca'…); en tercera, la mano del avatar.
   */
  handWorld(anchor: string, out: THREE.Vector3): THREE.Vector3;
  /** Coordenadas locales del barco → mundo (el barco se balancea). */
  shipToWorld(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3;
  /** Altura del agua en coordenadas del océano. */
  waterHeight(x: number, z: number): number;
  /** Efecto de sonido (posición opcional en coordenadas del barco). */
  sfx(name: string, at?: { x: number; y: number; z: number }): void;
  toast(text: string, kind: NotifyKind): void;
  toolUsed(tool: string, phase: 'start' | 'hit' | 'success' | 'fail'): void;
}

/**
 * [AGENTE game-player] Objetivo de interacción (props, habitantes, cajas, obras, fuego, restos),
 * avisos en pantalla, tecla E, uso de herramientas (gancho, caña, cubo, martillo, llave).
 * STUB.
 */
import type { GameContext } from './context';

export class Interaction {
  constructor(private readonly ctx: GameContext) {}
  reset(): void {}
  update(_dtReal: number): void {
    void this.ctx;
  }
}

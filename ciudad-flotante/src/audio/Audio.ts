/** [AGENTE audio] Sonido procedural (WebAudio): ambiente de mar, lluvia, viento, efectos. STUB. */
import type { GameContext } from '../game/context';

export class Audio {
  constructor(private readonly ctx: GameContext) {}
  /** Debe llamarse tras un gesto del usuario (clic en "Jugar"). */
  unlock(): void {}
  setVolume(_v: number): void {}
  update(_dtReal: number): void {
    void this.ctx;
  }
}

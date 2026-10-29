/**
 * Bus de eventos tipado. La simulación emite eventos y las capas de juego,
 * render y UI se suscriben. Los eventos NO forman parte del estado guardado.
 */
export type NotifyKind = 'info' | 'good' | 'warn' | 'danger';

export interface GameEvents {
  /** Mensaje corto para el jugador (toast). */
  notify: { text: string; kind: NotifyKind };
  /** La distribución del barco cambió (construcción, demolición, ampliación). */
  shipChanged: { revision: number };
  /** Un evento del mundo comenzó. */
  worldEventStarted: { eventId: number; type: string; title: string };
  /** Un evento del mundo terminó. */
  worldEventEnded: { eventId: number; type: string; title: string; success: boolean };
  /** Un objeto se añadió al inventario del jugador. */
  itemGained: { id: string; qty: number };
  /** Se desbloqueó un plano/tecnología. */
  unlocked: { key: string; name: string };
  /** Sonido/efecto puntual para la capa de presentación. */
  sfx: { name: string; x?: number; y?: number; z?: number };
  /** El jugador murió. */
  playerDied: { cause: string };
  /** Se completó un paso del tutorial. */
  tutorialStep: { id: string };
  /** Partida guardada / cargada. */
  saved: { slot: string };
  /** Nuevo día. */
  newDay: { day: number };
  /** Se sustituyó la simulación (partida nueva o cargada): las vistas deben reiniciarse. */
  simReplaced: { reason: 'new' | 'load' };
  /** El jugador usó una herramienta (para animaciones y sonido). */
  toolUsed: { tool: string; phase: 'start' | 'hit' | 'success' | 'fail' };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEvents, Set<Handler<unknown>>>();

  on<K extends keyof GameEvents>(type: K, handler: Handler<GameEvents[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => set!.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const h of [...set]) {
      try {
        (h as Handler<GameEvents[K]>)(payload);
      } catch (err) {
        console.error(`[EventBus] error en handler de "${String(type)}"`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

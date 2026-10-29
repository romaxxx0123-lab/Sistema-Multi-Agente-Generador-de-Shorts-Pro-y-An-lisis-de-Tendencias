/**
 * [AGENTE ui] Interfaz: HUD discreto, barra rápida, avisos, paneles (inventario, fabricación,
 * estaciones, almacenes, habitantes, timón, comercio, diario), menús y tutorial.
 * STUB mínimo.
 */
import type { GameContext } from '../game/context';
import type { PanelRequest, PromptInfo } from '../game/types';

export class UI {
  readonly root: HTMLElement;
  private hud: HTMLElement;
  private panel: PanelRequest | null = null;

  constructor(
    container: HTMLElement,
    private readonly ctx: GameContext,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'ui-root';
    container.appendChild(this.root);
    this.hud = document.createElement('div');
    this.hud.className = 'hud-stub';
    this.root.appendChild(this.hud);
  }

  get panelOpen(): boolean {
    return this.panel !== null;
  }

  /** true si hay un menú (principal, pausa, muerte) a pantalla completa. */
  get menuOpen(): boolean {
    return false;
  }

  openPanel(p: PanelRequest): void {
    this.panel = p;
  }

  closePanel(): void {
    this.panel = null;
  }

  setPrompt(_p: PromptInfo | null): void {}

  toast(_text: string, _kind: 'info' | 'good' | 'warn' | 'danger' = 'info'): void {}

  showMainMenu(): void {}
  showPauseMenu(): void {}
  showDeath(): void {}
  hideMenus(): void {}

  /** Reinicio tras nueva partida / carga. */
  reset(): void {}

  update(_dtReal: number): void {
    const n = this.ctx.sim.state.player.needs;
    this.hud.textContent = `Hambre ${n.hunger.toFixed(0)} · Sed ${n.thirst.toFixed(0)} · Energía ${n.energy.toFixed(0)} · Salud ${n.health.toFixed(0)}`;
  }
}

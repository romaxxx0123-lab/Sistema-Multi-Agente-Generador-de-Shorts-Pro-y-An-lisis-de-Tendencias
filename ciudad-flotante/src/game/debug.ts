/**
 * API de depuración en `window.__game` (para pruebas automáticas con Playwright y para
 * desarrollo). Cada módulo puede registrar comandos propios con `registerDebug`.
 */
import type { GameContext } from './context';

type DebugFn = (...args: never[]) => unknown;
const registry: Record<string, DebugFn> = {};

export function registerDebug(name: string, fn: DebugFn): void {
  registry[name] = fn;
}

export function installDebug(ctx: GameContext): void {
  const api = {
    get ctx() {
      return ctx;
    },
    get sim() {
      return ctx.sim;
    },
    get state() {
      return ctx.sim.state;
    },
    cmd: registry,
  };
  (window as unknown as { __game: typeof api }).__game = api;
}

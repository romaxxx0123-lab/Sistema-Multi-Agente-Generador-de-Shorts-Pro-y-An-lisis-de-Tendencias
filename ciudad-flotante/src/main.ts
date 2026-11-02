import './ui/base.css';
import { Game } from './game/Game';
import { preloadModels } from './render/assets';

const container = document.getElementById('app');
if (!container) throw new Error('Falta #app');

/** Gancho opcional del visor de claude.ai para conservar la partida al publicar versiones nuevas. */
interface HotHook {
  data?: unknown;
  ready?: (start: (data: unknown) => void) => void;
  snapshot?: (fn: () => unknown) => void;
}
const hot = (window as unknown as { claude?: { hot?: HotHook } }).claude?.hot;

function start(data: unknown): void {
  const game = new Game(container!);
  game.restoreSnapshot(data as { state?: unknown } | null);
  try {
    hot?.snapshot?.(() => game.snapshot());
  } catch {
    /* visor sin instantáneas */
  }
}

/** Los modelos de Blender se decodifican antes de crear las vistas (si fallan, se usan los procedimentales). */
function boot(data: unknown): void {
  void preloadModels()
    .catch((err: unknown) => console.warn('Modelos no disponibles', err))
    .then(() => start(data));
}

if (hot?.ready) hot.ready(boot);
else boot(hot?.data ?? null);

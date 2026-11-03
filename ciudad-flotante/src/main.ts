import './ui/base.css';
import { Game } from './game/Game';
import { preloadModels } from './render/assets';

const container = document.getElementById('app');
if (!container) throw new Error('Falta #app');

/**
 * Gancho OPCIONAL de un visor que conserve la partida al publicar versiones nuevas (`ready`,
 * `snapshot`, `data`). El contrato de las páginas de claude.ai no lo garantiza (solo promete
 * `window.claude.use`), así que el camino principal es otro: la partida se guarda en localStorage
 * al ocultar o cerrar la página (Game.saveOnHide) y, al volver, el menú ofrece «Continuar». Si el
 * gancho existe, la partida vuelve en su modo y en pausa (Game.restoreSnapshot).
 */
interface HotHook {
  data?: unknown;
  ready?: (start: (data: unknown) => void) => void;
  snapshot?: (fn: () => unknown) => void;
}
function hotHook(): HotHook | undefined {
  try {
    const hot = (window as unknown as { claude?: { hot?: unknown } }).claude?.hot;
    return hot && typeof hot === 'object' ? (hot as HotHook) : undefined;
  } catch {
    return undefined;
  }
}
const hot = hotHook();

/** ¿Puede este navegador crear un contexto WebGL 2? (three.js r186 ya no admite WebGL 1.) */
function webgl2Available(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    // No retener un segundo contexto: el juego crea el suyo.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

let fatalShown = false;

/**
 * Pantalla de error legible en lugar de una página azul vacía: sin WebGL 2 (aceleración por
 * hardware desactivada, GPU bloqueada, políticas de empresa) o con un fallo al arrancar.
 */
function showFatal(kind: 'webgl' | 'error', err?: unknown): void {
  if (fatalShown) return;
  fatalShown = true;
  if (err !== undefined) {
    if (kind === 'webgl') console.warn('[Ciudad Flotante] sin WebGL 2', err);
    else console.error('[Ciudad Flotante] no se pudo iniciar el juego', err);
  }
  const app = container!;
  app.replaceChildren();
  app.dataset['fatal'] = kind;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;font-family:var(--font);';
  const card = document.createElement('div');
  card.className = 'panel';
  card.setAttribute('role', 'alert');
  card.style.cssText = 'max-width:480px;width:100%;padding:22px 24px;line-height:1.45;';
  const h = document.createElement('h1');
  h.style.cssText = 'margin:0 0 10px;font-size:22px;font-weight:900;color:var(--accent);';
  const p = document.createElement('p');
  p.style.cssText = 'margin:0 0 16px;color:var(--ink-dim);font-size:15px;';
  if (kind === 'webgl') {
    h.textContent = 'Ciudad Flotante necesita WebGL 2';
    p.textContent =
      'Este navegador no ha podido crear el lienzo 3D del juego. Activa la aceleración por hardware en los ajustes del navegador o prueba con una versión reciente de Chrome, Edge, Firefox o Safari.';
  } else {
    h.textContent = 'No se pudo iniciar el juego';
    p.textContent = 'Algo ha fallado al arrancar. Recarga la página para intentarlo de nuevo; si vuelve a pasar, prueba con otro navegador.';
  }
  card.append(h, p);
  if (kind === 'error' && err !== undefined) {
    const detail = document.createElement('code');
    detail.style.cssText = 'display:block;margin:-6px 0 16px;font-size:12px;color:var(--ink-faint);word-break:break-word;';
    detail.textContent = err instanceof Error ? err.message : String(err);
    card.appendChild(detail);
  }
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = kind === 'webgl' ? 'Reintentar' : 'Recargar';
  btn.addEventListener('click', () => location.reload());
  card.appendChild(btn);
  wrap.appendChild(card);
  app.appendChild(wrap);
}

function start(data: unknown): void {
  if (!webgl2Available()) {
    showFatal('webgl');
    return;
  }
  let game: Game;
  try {
    game = new Game(container!);
  } catch (e) {
    // La sonda puede pasar y three.js fallar igualmente (contexto perdido, proceso de GPU caído).
    showFatal(/webgl/i.test(e instanceof Error ? e.message : String(e)) ? 'webgl' : 'error', e);
    return;
  }
  game.restoreSnapshot(data as { state?: unknown } | null);
  try {
    hot?.snapshot?.(() => game.snapshot());
  } catch {
    /* visor sin instantáneas */
  }
}

/**
 * Arranca una sola vez. Los modelos de Blender se decodifican antes de crear las vistas (si fallan,
 * se usan los procedimentales). Nunca lanza: cualquier fallo acaba en la pantalla de error.
 */
let booted = false;
function boot(data: unknown): void {
  if (booted) return;
  booted = true;
  Promise.resolve()
    .then(() => preloadModels())
    .catch((err: unknown) => console.warn('Modelos no disponibles', err))
    .then(() => start(data))
    .catch((err: unknown) => showFatal('error', err));
}

// Un gancho roto o que no responde no puede dejar la página vacía: se arranca sin instantánea.
try {
  if (hot?.ready) {
    hot.ready(boot);
    setTimeout(() => boot(null), 10000);
  } else boot(hot?.data ?? null);
} catch (e) {
  console.warn('[Ciudad Flotante] el gancho del visor falló; arranque normal', e);
  boot(null);
}

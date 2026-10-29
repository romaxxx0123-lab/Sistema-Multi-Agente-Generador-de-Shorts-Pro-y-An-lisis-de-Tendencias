#!/usr/bin/env node
/**
 * Prueba de humo: arranca el juego, avanza 6 horas de juego en saltos, alterna modos y
 * comprueba que no hay errores de consola y que el estado es coherente.
 *   node scripts/smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const checks = `
  const g = __game;
  const t0 = g.state.time;
  for (let i = 0; i < 12; i++) { g.cmd.advance(30); g.cmd.step(2); }
  g.cmd.mode('build'); g.cmd.step(10); g.cmd.mode('play'); g.cmd.step(10);
  const s = g.state;
  const problems = [];
  if (s.time - t0 < 359) problems.push('el tiempo no avanzó');
  if (!s.player.alive) problems.push('el jugador murió en 6 h sin hacer nada');
  for (const k of ['hunger','thirst','energy','health','warmth']) {
    const v = s.player.needs[k];
    if (!(v >= 0 && v <= 100)) problems.push('necesidad fuera de rango: ' + k + '=' + v);
  }
  for (const n of s.npcs) if (!Number.isFinite(n.pos.x + n.pos.y + n.pos.z)) problems.push('posición inválida de ' + n.name);
  return problems.length ? 'FALLOS: ' + problems.join('; ') : 'OK ' + JSON.stringify({ dia: Math.floor(s.time/1440)+1, npcs: s.npcs.length, restos: s.debris.length, eventos: s.events.active.map(e => e.type) });
`;
const r = spawnSync('node', ['scripts/shot.mjs', '--eval', checks, '--frames', '0', '--out', 'test-output/smoke.png'], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);

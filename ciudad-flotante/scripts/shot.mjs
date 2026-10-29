#!/usr/bin/env node
/**
 * Arranca el juego en Chromium headless (WebGL por SwiftShader), ejecuta pasos y hace capturas.
 *
 * Uso:
 *   node scripts/shot.mjs --out test-output/a.png
 *   node scripts/shot.mjs --seed 7 --eval "__game.cmd.setHour(20)" --frames 30 --out test-output/noche.png
 *   node scripts/shot.mjs --script scripts/escenas/mi-escena.mjs
 *
 * Opciones:
 *   --url <url>        Usar un servidor ya arrancado en vez de levantar Vite.
 *   --query <qs>       Querystring (por defecto "autostart&seed=<seed>").
 *   --seed <n>         Semilla de la partida (por defecto 1).
 *   --size <WxH>       Tamaño de la ventana (por defecto 1280x720).
 *   --eval <js>        Código a ejecutar en la página (repetible, en orden). Puede ser async.
 *   --frames <n>       Frames de juego a avanzar con __game.cmd.step tras cada --eval (por defecto 5).
 *   --wait <ms>        Espera real antes de capturar (por defecto 300).
 *   --out <png>        Captura (repetible: se toma tras el --eval anterior).
 *   --script <mjs>     Módulo con `export default async (page, helpers) => {}` para escenas complejas.
 *   --keep             No cerrar (depuración).
 * Calidad gráfica: baja por defecto (render por software); usa SHOT_QUALITY=media|alta para otra.
 * Imprime los errores y avisos de consola de la página. Código de salida 2 si hubo errores.
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const steps = [];
const opts = { seed: '1', size: '1280x720', frames: 5, wait: 300, url: null, query: null, script: null, keep: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => argv[++i];
  switch (a) {
    case '--url': opts.url = next(); break;
    case '--query': opts.query = next(); break;
    case '--seed': opts.seed = next(); break;
    case '--size': opts.size = next(); break;
    case '--frames': opts.frames = Number(next()); break;
    case '--wait': opts.wait = Number(next()); break;
    case '--eval': steps.push({ eval: next() }); break;
    case '--out': steps.push({ out: next() }); break;
    case '--script': opts.script = next(); break;
    case '--keep': opts.keep = true; break;
    default: console.error('Opción desconocida', a); process.exit(1);
  }
}

let server = null;
let base = opts.url;
if (!base) {
  const { createServer } = await import('vite');
  server = await createServer({ root: resolve(dirname(new URL(import.meta.url).pathname), '..'), server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
  await server.listen();
  const addr = server.httpServer.address();
  base = `http://127.0.0.1:${addr.port}/`;
}
const [w, h] = opts.size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
let errors = 0;
page.on('console', (msg) => {
  const t = msg.type();
  if (t === 'error' || t === 'warning') {
    const text = msg.text();
    if (/fonts\.googleapis|ERR_TUNNEL|net::ERR/.test(text)) return;
    if (t === 'error') errors++;
    console.log(`[consola ${t}] ${text}`);
  }
});
page.on('pageerror', (err) => {
  errors++;
  console.log(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
});
const query = opts.query ?? `autostart&seed=${opts.seed}&quality=${process.env.SHOT_QUALITY ?? 'baja'}`;
await page.goto(`${base}?${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__game, null, { timeout: 30000 });
await page.waitForTimeout(500);

const helpers = {
  step: (frames = 5, dt = 1 / 60) => page.evaluate(([f, d]) => window.__game.cmd.step(f, d), [frames, dt]),
  shot: async (out) => {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    await page.screenshot({ path: out, timeout: 120000 });
    console.log('captura:', out);
  },
  eval: (js) => page.evaluate(js),
};

if (opts.script) {
  const mod = await import(pathToFileURL(resolve(opts.script)).href);
  await mod.default(page, helpers);
}
for (const s of steps) {
  if (s.eval) {
    const r = await page.evaluate(`(async () => { ${s.eval.includes('return') ? s.eval : `return (${s.eval})`} })()`);
    if (r !== undefined) console.log('resultado:', typeof r === 'string' ? r : JSON.stringify(r)?.slice(0, 2000));
    if (opts.frames > 0) await helpers.step(opts.frames);
  }
  if (s.out) {
    await page.waitForTimeout(opts.wait);
    await helpers.shot(s.out);
  }
}
if (!opts.keep) {
  await browser.close();
  if (server) await server.close();
}
if (errors) {
  console.log(`${errors} error(es) en la página`);
  process.exit(2);
}

// Saca capturas del modelo con el mismo visor (Chromium sin ventana).
// Sirve para revisar el diseño desde varios ángulos.
//
// Uso: npm run render -- <id> [--views=hero,lado,frente,atras,arriba,detalle] [--size=1400x1000]
//      (una vista también puede ser azimut:elevación:zoom, p. ej. --views=-34:22:1.4)
//                              [--step=N] [--no-edges] [--png] [--out=carpeta]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? true]));
if (!id) {
  console.error('Uso: npm run render -- <id>');
  process.exit(1);
}

export const VIEWS = {
  hero: [-34, 22, 1],
  lado: [40, 20, 1],
  frente: [0, 12, 1],
  atras: [150, 24, 1],
  arriba: [-20, 58, 1],
  detalle: [-14, 10, 1.7],
};

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mpd': 'text/plain', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [w, h] = (opt.size || '1400x1000').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(`http://127.0.0.1:${port}/index.html#${id}`);
await page.waitForFunction(() => window.brickmatch && window.brickmatch.status !== 'loading', null, { timeout: 180000 });
const status = await page.evaluate(() => window.brickmatch.status);
if (status !== 'ready') {
  console.error(`El visor no cargó el modelo: ${status}\n${logs.join('\n')}`);
  await browser.close();
  server.close();
  process.exit(1);
}

await page.evaluate(() => window.brickmatch.clean());
await page.waitForTimeout(250);

const outDir = opt.out ? path.resolve(opt.out) : path.join(root, 'models', id, 'renders');
fs.mkdirSync(outDir, { recursive: true });
const names = (opt.views || 'hero,lado').split(',');
for (const name of names) {
  const v = VIEWS[name] || name.split(':').map(Number);
  await page.evaluate(
    ([a, e, z, step, edges]) => window.brickmatch.shot({ azimuth: a, elevation: e, zoom: z, step, edges }),
    [v[0], v[1], v[2] ?? 1, opt.step !== undefined ? Number(opt.step) : null, !opt['no-edges']],
  );
  const base = `${name.replace(/[^a-z0-9]+/gi, '_')}${opt.step !== undefined ? `_paso${opt.step}` : ''}`;
  const file = path.join(outDir, `${base}.${opt.png ? 'png' : 'jpg'}`);
  await page.locator('#stage-canvas').screenshot(opt.png ? { path: file } : { path: file, type: 'jpeg', quality: 88 });
  console.log(file);
}
if (logs.length) console.log(logs.slice(0, 10).join('\n'));
await browser.close();
server.close();

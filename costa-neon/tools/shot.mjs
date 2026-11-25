// Capturas automatizadas del juego con Chromium headless (SwiftShader).
// Uso: node tools/shot.mjs <salida-dir> '<json escenarios>' [calidad]
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = process.argv[2] || path.join(ROOT, 'build', 'shots');
const scenarios = JSON.parse(process.argv[3] || '[{"name":"default","wait":6000}]');
const quality = process.argv[4] || 'alto';
const size = (process.env.SHOT_SIZE || '1280x720').split('x').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => {
  const t = m.type();
  if (t === 'error' || t === 'warning' || t === 'log') logs.push(`[${t}] ${m.text()}`.slice(0, 2000));
});
page.on('pageerror', (e) => logs.push('[pageerror] ' + (e.stack || e.message).slice(0, 2000)));
// servidor local del build (los cielos fotografiados se cargan como archivos aparte)
const TYPES = { '.html': 'text/html', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, 'build', decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(path.join(ROOT, 'build')) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + server.address().port + '/costa-neon.html?q=' + quality + (process.env.SHOT_EXTRA || '');
const t0 = Date.now();
await page.goto(url);
try {
  await page.waitForFunction(() => window.__cn, null, { timeout: 240000 });
} catch (e) {
  console.log('No arrancó a tiempo. Logs:\n' + logs.join('\n'));
  await page.screenshot({ path: path.join(outDir, 'fail.png') });
  await browser.close();
server.close();
  process.exit(1);
}
console.log('arranque ms', Date.now() - t0);
for (const sc of scenarios) {
  await page.evaluate((sc) => {
    if (sc.time != null) window.__cn.setTime(sc.time);
    if (sc.weather) window.__cn.setWeather(sc.weather);
    if (sc.cam) window.__cn.setCam(...sc.cam);
    if (sc.eval) (0, eval)(sc.eval);
  }, sc);
  await page.waitForTimeout(sc.wait || 5000);
  const file = path.join(outDir, (sc.name || 'shot') + '.png');
  await page.screenshot({ path: file, timeout: 180000 });
  const info = await page.evaluate(() => (window.__cn.info ? window.__cn.info() : null));
  console.log('captura', file, JSON.stringify(info));
}
console.log('--- logs (' + logs.length + ') ---');
const uniq = [...new Set(logs)];
console.log(uniq.slice(0, 60).join('\n'));
await browser.close();
server.close();

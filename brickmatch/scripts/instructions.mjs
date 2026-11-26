// Cuadernillo de instrucciones en PDF. Una página por paso de armado: la imagen
// del modelo (las piezas nuevas en color, lo ya armado apagado), la lista de
// piezas del paso y un plano de ubicación. Al final, el inventario completo.
// Usa el mismo visor que la mini app (Chromium sin ventana).
//
// Uso: npm run instructions -- <id> [--out=archivo.pdf] [--size=1200x860] [--quality=70] [--to=N] [--keep]
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? true]));
if (!id) {
  console.error('Uso: npm run instructions -- <id>');
  process.exit(1);
}
const report = JSON.parse(fs.readFileSync(path.join(dist, 'models', id, 'report.json'), 'utf8'));
if (!report.chapters) {
  console.error('El modelo no tiene plan de armado: generalo de nuevo con npm run model');
  process.exit(1);
}
const out = path.resolve(opt.out || path.join(root, 'models', id, 'instrucciones.pdf'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'brickmatch-inst-'));
const t0 = Date.now();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.mpd': 'text/plain' };
const server = http.createServer((req, res) => {
  const file = path.join(dist, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [w, h] = (opt.size || '1200x860').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#${id}`);
await page.waitForFunction(() => window.brickmatch && window.brickmatch.status !== 'loading', null, { timeout: 240000 });
if ((await page.evaluate(() => window.brickmatch.status)) !== 'ready') throw new Error('El visor no cargó el modelo');
await page.evaluate(() => window.brickmatch.clean());
await page.addStyleTag({ content: '.stage{background:#f1f4f7!important}' });
await page.waitForTimeout(300);
const canvas = page.locator('#stage-canvas');
const base = Number(opt.quality || 70);
const shoot = (name, quality = base) => canvas.screenshot({ path: path.join(work, name), type: 'jpeg', quality });

// Tapa y plano: el modelo entero.
await page.evaluate(() => window.brickmatch.shot({ azimuth: -34, elevation: 22, zoom: 1 }));
await shoot('tapa.jpg', 84);
await page.evaluate(() => window.brickmatch.shot({ azimuth: 0, elevation: 86, zoom: 1, figs: false }));
await shoot('plano.jpg', 80);

// Miniatura de cada lote.
const thumbs = await page.evaluate(() => window.brickmatch.allThumbs());
thumbs.forEach((url, lot) => {
  if (url) fs.writeFileSync(path.join(work, `lote-${lot}.png`), Buffer.from(url.split(',')[1], 'base64'));
});

// Una imagen por paso. La cámara arranca en la vista de siempre y solo gira
// cuando las piezas nuevas quedarían tapadas.
const total = report.steps.length;
const last = opt.to ? Math.min(total, Number(opt.to)) : total;
await page.evaluate(() => window.brickmatch.stage.view(-34, 26));
const maps = [];
for (let k = 0; k < last; k++) {
  await page.evaluate((s) => window.brickmatch.stepShot(s), k);
  await shoot(`paso-${k}.jpg`);
  maps.push(await page.evaluate((s) => window.brickmatch.minimap(s), k));
  if ((k + 1) % 20 === 0 || k === last - 1) console.log(`  paso ${k + 1} de ${last}  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);
}

// ------------------------------------------------------------------- páginas
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const num = (n) => n.toLocaleString('es-AR');
const lotsOf = (k) => {
  const m = new Map();
  report.placements.forEach(([lot, s]) => {
    if (s === k) m.set(lot, (m.get(lot) || 0) + 1);
  });
  return [...m];
};
const card = (lot, qty) => {
  const b = report.bom[lot];
  return `<div class="lot"><img src="lote-${lot}.png" alt=""><b>${qty}×</b><span class="pn">${esc(b.part)}</span><span class="col"><i style="background:${b.rgb}"></i>${esc(b.colorName)}</span></div>`;
};
const parts = report.parts && report.parts.length ? report.parts : [''];
const v = report.validation;
const best = report.sets && report.sets.list[0];
const resting = (v.resting || []).map((x) => `${x.qty} × pieza ${x.part} (${x.name})`).join(', ');

const stepPages = [];
for (let k = 0; k < last; k++) {
  const ci = report.stepChapter[k];
  const ch = report.chapters[ci];
  const lots = lotsOf(k);
  const pieces = lots.reduce((a, [, q]) => a + q, 0);
  stepPages.push(`<section class="page step">
    <header><span>${parts[ch.part] ? `Parte ${ch.part + 1} · ${esc(parts[ch.part])}` : esc(report.title)}</span><span>${esc(report.title)}</span></header>
    <div class="head"><b class="n">${k + 1}</b><div><h2>${esc(ch.title)}</h2><p>${ch.count > 1 ? `Paso ${k - ch.first + 1} de ${ch.count} de este capítulo · ` : ''}${pieces} pieza${pieces === 1 ? '' : 's'}</p></div></div>
    <img class="shot" src="paso-${k}.jpg" alt="">
    ${report.stepTable[k] ? `<p class="tag">Sobre la mesa: estas piezas no encastran en lo anterior, van apoyadas en su lugar.</p>` : ''}
    ${ch.note ? `<p class="how">${esc(ch.note)}</p>` : ''}
    <div class="now">${maps[k]}<div class="lots">${lots.map(([l, q]) => card(l, q)).join('')}</div></div>
    <footer><span>${k + 1} / ${total}</span></footer>
  </section>`);
}

const toc = parts.map((t, p) => {
  const list = report.chapters.filter((c) => c.part === p);
  if (!list.length) return '';
  return `<div class="part"><h3>${t ? `${p + 1} · ${esc(t)}` : 'Capítulos'}</h3><ol>${list.map((c) => `<li><span>${esc(c.title)}</span><i>${c.first + 1}${c.count > 1 ? `–${c.first + c.count}` : ''}</i></li>`).join('')}</ol></div>`;
}).join('');

const inventory = [];
const perPage = 54;
for (let i = 0; i < report.bom.length; i += perPage) {
  inventory.push(`<section class="page inv"><header><span>Inventario · ${num(report.counts.pieces)} piezas en ${num(report.counts.lots)} lotes</span><span>${esc(report.title)}</span></header>
    <div class="lots wide">${report.bom.slice(i, i + perPage).map((b, j) => `<div class="lot"><img src="lote-${i + j}.png" alt=""><b>${b.qty}×</b><span class="pn">${esc(b.part)}</span><span class="col"><i style="background:${b.rgb}"></i>${esc(b.colorName)}</span><span class="nm">${esc(b.name)}</span></div>`).join('')}</div></section>`);
}

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(report.title)} · instrucciones</title><style>
  @page { size: A4; margin: 11mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10.5pt/1.4 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif; color: #17212b; }
  .page { break-after: page; height: 275mm; display: flex; flex-direction: column; gap: 3mm; overflow: hidden; }
  .page:last-child { break-after: auto; }
  header, footer { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .05em; text-transform: uppercase; color: #5b6b7a; }
  footer { margin-top: auto; justify-content: flex-end; }
  h1 { font-size: 30pt; line-height: 1.05; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 15pt; line-height: 1.15; margin: 0; }
  h3 { font-size: 10pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: .05em; color: #5b6b7a; }
  p { margin: 0; }
  .cover img { width: 100%; border-radius: 3mm; }
  .cover .lead { font-size: 11.5pt; color: #33414f; }
  .facts { display: flex; flex-wrap: wrap; gap: 2mm; }
  .facts span { background: #e6edf3; border-radius: 1.5mm; padding: 1mm 2.5mm; font-size: 9.5pt; }
  .box { background: #fff1bd; color: #54410a; border-radius: 2.5mm; padding: 3mm 4mm; }
  .box b { font-weight: 700; }
  ul { margin: 0; padding-left: 5mm; display: grid; gap: 1.2mm; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }
  .cols img { width: 100%; border-radius: 2.5mm; }
  .toc { columns: 3; column-gap: 7mm; }
  .partlist { margin: 0; padding-left: 5mm; display: grid; gap: 2mm; }
  .partlist span { display: block; color: #5b6b7a; font-size: 9pt; }
  .toc .part { break-inside: avoid; margin-bottom: 3mm; }
  .toc ol { list-style: none; margin: 0; padding: 0; font-size: 9pt; }
  .toc li { display: flex; gap: 2mm; justify-content: space-between; border-bottom: .2mm dotted #b9c6d2; padding: .4mm 0; }
  .toc li i { font-style: normal; font-variant-numeric: tabular-nums; color: #5b6b7a; white-space: nowrap; }
  .head { display: flex; align-items: center; gap: 4mm; }
  .head .n { font-size: 34pt; line-height: 1; font-weight: 800; background: #fff1bd; color: #54410a; border-radius: 2.5mm; padding: 1.5mm 4mm; font-variant-numeric: tabular-nums; }
  .head p { color: #5b6b7a; font-size: 9.5pt; }
  .shot { width: 100%; border-radius: 2.5mm; border: .25mm solid #c7d3dd; }
  .tag { font-weight: 700; border-left: 1mm solid #cf4327; padding-left: 2.5mm; }
  .how { background: #f1f5f8; border-radius: 2mm; padding: 2mm 3mm; }
  .now { display: grid; grid-template-columns: 32mm 1fr; gap: 4mm; align-items: start; }
  .minimap { width: 32mm; height: auto; background: #fff; border: .25mm solid #c7d3dd; border-radius: 2mm; }
  .mm-all { fill: #d5dee6; } .mm-now { fill: #cf4327; } .mm-ring { fill: none; stroke: #cf4327; stroke-width: .8; }
  .lots { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm; }
  .lots.wide { grid-template-columns: repeat(9, 1fr); }
  .lot { border: .25mm solid #c7d3dd; border-radius: 2mm; padding: 1.2mm 1.5mm; display: grid; gap: .2mm; font-size: 7.5pt; line-height: 1.2; min-width: 0; break-inside: avoid; }
  .lot img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #eef2f6; border-radius: 1.2mm; }
  .lot b { font-size: 11pt; }
  .lot .pn { font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; color: #5b6b7a; }
  .lot .col { display: flex; align-items: center; gap: 1mm; overflow-wrap: anywhere; }
  .lot .col i { flex: none; width: 2.4mm; height: 2.4mm; border-radius: 50%; border: .2mm solid #9aa9b7; }
  .lot .nm { color: #5b6b7a; font-size: 6.5pt; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style></head><body>
<section class="page cover">
  <header><span>Instrucciones de armado</span><span>BrickMatch</span></header>
  <h1>${esc(report.title)}</h1>
  <p class="lead">${esc(report.description)}</p>
  <img src="tapa.jpg" alt="">
  <div class="facts"><span><b>${num(report.counts.pieces)}</b> piezas</span><span><b>${num(report.counts.lots)}</b> lotes distintos</span><span><b>${num(total)}</b> pasos en ${report.chapters.length} capítulos</span>${report.size ? `<span>Mide <b>${report.size.join(' × ')} cm</b></span>` : ''}${v.stats.components > 1 ? `<span><b>${v.stats.components}</b> módulos</span>` : ''}</div>
  ${best && best.exact === report.counts.pieces ? `<p class="box"><b>Caja donante: ${esc(best.num)} ${esc(best.name)}</b> (${num(best.parts)} piezas). Todas las piezas del modelo salen de esa sola caja, en la pieza y el color exactos, sin usar los repuestos.</p>` : ''}
  <footer><span>Generado el ${report.generated.split('-').reverse().join('/')}</span></footer>
</section>
<section class="page">
  <header><span>Antes de empezar</span><span>${esc(report.title)}</span></header>
  <h2>Cómo leer cada página</h2>
  <ul>
    <li>En la imagen, las <b>piezas nuevas del paso se ven en su color real</b>; todo lo que ya está armado aparece apagado, en gris.</li>
    <li>Abajo está la lista de piezas del paso: cantidad, número de pieza y color (los nombres son los de BrickLink/Rebrickable).</li>
    <li>El planito muestra el modelo desde arriba, con el frente hacia abajo: lo rojo es dónde van las piezas de ese paso.</li>
    <li>El orden está pensado para armar de verdad: cada pieza entra cuando ya tiene dónde encastrar, y lo de adentro va antes de cerrar con pisos y techos.</li>
    <li>En la mini app, la pestaña Armado tiene estos mismos pasos en 3D, para girar el modelo cuando una pieza no se ve bien.</li>
  </ul>
  <h2>Lo que conviene saber</h2>
  <ul>
    ${v.stats.components > 1 ? `<li>El edificio principal queda en un solo bloque. El resto son <b>${v.stats.components - 1} módulos que van apoyados sobre la mesa</b> (muros, torres, galerías y muebles sueltos): los pasos marcados «Sobre la mesa» empiezan uno o le suman piezas a nivel del piso.</li>` : ''}
    <li>Se comprobaron una por una las ${v.stats.linksChecked} uniones que no son stud con stud (clips, bisagras, ejes, vidrios): cada capítulo explica cómo va la suya.</li>
    ${resting ? `<li>Van <b>apoyadas, sin presión</b>: ${esc(resting)}. El capítulo donde aparecen explica cómo quedan calzadas en su lugar.</li>` : ''}
    ${report.figs ? `<li>Las minifiguras${(report.figs.volumes || []).length ? ' y las siluetas transparentes (lo que el modelo tiene que alojar)' : ''} que aparecen en la tapa son de prueba: no forman parte del modelo.</li>` : ''}
  </ul>
  <div class="cols"><div><h3>El modelo desde arriba (el frente abajo)</h3><img src="plano.jpg" alt=""></div>
    <div><h3>Se arma en ${parts.length > 1 ? `${parts.length} partes` : `${report.chapters.length} capítulos`}</h3><ol class="partlist">${parts.map((t, p) => {
      const list = report.chapters.filter((c) => c.part === p);
      if (!list.length || !t) return '';
      const a = list[0].first + 1, b = list[list.length - 1].first + list[list.length - 1].count;
      return `<li><b>${esc(t)}</b><span>pasos ${a} a ${b} · ${num(list.reduce((n, c) => n + c.pieces, 0))} piezas</span></li>`;
    }).join('')}</ol></div></div>
</section>
<section class="page">
  <header><span>Índice de capítulos · en qué paso empieza cada uno</span><span>${esc(report.title)}</span></header>
  <div class="toc">${toc}</div>
</section>
${stepPages.join('\n')}
${inventory.join('\n')}
</body></html>`;
fs.writeFileSync(path.join(work, 'index.html'), html);

const doc = await browser.newPage();
await doc.goto(`file://${path.join(work, 'index.html')}`);
await doc.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true });
await browser.close();
server.close();
if (!opt.keep) fs.rmSync(work, { recursive: true, force: true });
else console.log(`Archivos intermedios en ${work}`);
console.log(`${out}  (${(fs.statSync(out).size / 1048576).toFixed(1)} MB, ${last} pasos)  [${((Date.now() - t0) / 1000).toFixed(0)} s]`);

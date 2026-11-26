// Cuadernillo de instrucciones en PDF, al estilo de un manual de Lego: dos
// pasos por página, cada uno con su recuadro de piezas (imagen y cantidad), la
// imagen del modelo con una flecha sobre cada pieza nueva y lo ya armado
// apagado, y un plano de ubicación. Cada parte abre con la lista de piezas que
// usa, para separarlas antes de empezar; al final va el inventario completo.
// Usa el mismo visor que la mini app (Chromium sin ventana).
//
// Uso: npm run instructions -- <id> [--out=archivo.pdf] [--size=880x660] [--quality=62] [--to=N] [--keep]
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
const [w, h] = (opt.size || '880x660').split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#${id}`);
await page.waitForFunction(() => window.brickmatch && window.brickmatch.status !== 'loading', null, { timeout: 240000 });
if ((await page.evaluate(() => window.brickmatch.status)) !== 'ready') throw new Error('El visor no cargó el modelo');
await page.evaluate(() => window.brickmatch.clean());
await page.addStyleTag({ content: '.stage{background:#f1f4f7!important}' });
await page.waitForTimeout(300);
const canvas = page.locator('#stage-canvas');
const base = Number(opt.quality || 62);
const shoot = (name, quality = base) => canvas.screenshot({ path: path.join(work, name), type: 'jpeg', quality });

// Tapa y plano: el modelo entero.
await page.evaluate(() => window.brickmatch.shot({ azimuth: -34, elevation: 22, zoom: 1 }));
await shoot('tapa.jpg', 84);
await page.evaluate(() => window.brickmatch.shot({ azimuth: -34, elevation: 22, zoom: 1, real: true, figs: false }));
await shoot('real.jpg', 84);
await page.evaluate(() => window.brickmatch.shot({ azimuth: 0, elevation: 86, zoom: 1, figs: false }));
await shoot('plano.jpg', 80);

// Miniatura de cada lote.
const thumbs = await page.evaluate(() => window.brickmatch.allThumbs());
thumbs.forEach((url, lot) => {
  if (url) fs.writeFileSync(path.join(work, `lote-${lot}.png`), Buffer.from(url.split(',')[1], 'base64'));
});

const total = report.steps.length;
const last = opt.to ? Math.min(total, Number(opt.to)) : total;
const parts = report.parts && report.parts.length ? report.parts : [''];
const chaptersOf = (p) => report.chapters.filter((c) => c.part === p);

// Cómo queda el modelo al terminar cada parte.
for (let p = 0; p < parts.length; p++) {
  const list = chaptersOf(p);
  if (!list.length) continue;
  const end = list[list.length - 1].first + list[list.length - 1].count - 1;
  await page.evaluate((s) => window.brickmatch.shot({ azimuth: -34, elevation: 26, zoom: 1, step: s }), end);
  await shoot(`parte-${p}.jpg`, 76);
}

// Una imagen por paso. La cámara usa la vista de tres cuartos de siempre y se
// queda quieta mientras los pasos sean de la misma zona.
await page.evaluate(() => window.brickmatch.stage.view(-34, 28));
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
const lotsOf = (from, to) => {
  const m = new Map();
  report.placements.forEach(([lot, s]) => {
    if (s >= from && s <= to) m.set(lot, (m.get(lot) || 0) + 1);
  });
  return [...m];
};
const chip = (lot, qty) => `<span class="chip"><img src="lote-${lot}.png" alt=""><b>${qty}×</b></span>`;
const card = (lot, qty, name = false) => {
  const b = report.bom[lot];
  return `<div class="lot"><img src="lote-${lot}.png" alt=""><b>${qty}×</b><span class="pn">${esc(b.part)}</span><span class="col"><i style="background:${b.rgb}"></i>${esc(b.colorName)}</span>${name ? `<span class="nm">${esc(b.name)}</span>` : ''}</div>`;
};
const v = report.validation;
const best = report.sets && report.sets.list[0];
const resting = (v.resting || []).map((x) => `${x.qty} × pieza ${x.part} (${x.name})`).join(', ');
const head = (left) => `<header><span>${left}</span><span>${esc(report.title)}</span></header>`;

// Un paso: a la izquierda el número, el recuadro de piezas y el plano; a la derecha la imagen.
const stepBlock = (k) => {
  const ch = report.chapters[report.stepChapter[k]];
  const lots = lotsOf(k, k);
  const first = k === ch.first;
  return `<article class="step">
    <div class="side"><b class="n">${k + 1}</b><div class="need">${lots.map(([l, q]) => chip(l, q)).join('')}</div>${maps[k]}</div>
    <div class="main">
      ${first ? `<h2>${esc(ch.title)}</h2>${ch.note ? `<p class="how">${esc(ch.note)}</p>` : ''}` : ''}
      <img class="shot" src="paso-${k}.jpg" alt="">
      ${report.stepTable[k] ? `<p class="tag">Sobre la mesa: estas piezas van apoyadas en su lugar, no encastran en lo anterior.</p>` : ''}
    </div>
  </article>`;
};

const pages = [];
for (let p = 0; p < parts.length; p++) {
  const list = chaptersOf(p);
  if (!list.length) continue;
  const from = list[0].first, to = Math.min(last - 1, list[list.length - 1].first + list[list.length - 1].count - 1);
  if (from > to) continue;
  if (parts[p]) {
    // Portada de la parte: cómo queda y qué piezas separar.
    const lots = lotsOf(from, to).sort((a, b) => a[0] - b[0]);
    pages.push(`<section class="flow part">
      ${head(`Parte ${p + 1} de ${parts.length}`)}
      <div class="parthead"><div><h1>${p + 1}</h1><h2>${esc(parts[p])}</h2><p>Pasos ${from + 1} a ${to + 1} · ${num(lots.reduce((n, [, q]) => n + q, 0))} piezas de ${lots.length} tipos</p><p class="small">Así queda el modelo al terminar esta parte. Abajo, las piezas que vas a usar: conviene separarlas antes de empezar.</p></div><img src="parte-${p}.jpg" alt=""></div>
      <div class="lots wide">${lots.map(([l, q]) => card(l, q)).join('')}</div>
    </section>`);
  }
  for (let k = from; k <= to; k += 2) {
    const ch = report.chapters[report.stepChapter[k]];
    pages.push(`<section class="page">${head(parts[p] ? `Parte ${p + 1} · ${esc(parts[p])}` : esc(ch.title))}${stepBlock(k)}${k + 1 <= to ? stepBlock(k + 1) : ''}<footer><span>pasos ${k + 1}${k + 1 <= to ? `–${k + 2}` : ''} de ${total}</span></footer></section>`);
  }
}

const toc = parts.map((t, p) => {
  const list = chaptersOf(p);
  if (!list.length) return '';
  return `<div class="part"><h3>${t ? `${p + 1} · ${esc(t)}` : 'Capítulos'}</h3><ol>${list.map((c) => `<li><span>${esc(c.title)}</span><i>${c.first + 1}${c.count > 1 ? `–${c.first + c.count}` : ''}</i></li>`).join('')}</ol></div>`;
}).join('');

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(report.title)} · instrucciones</title><style>
  @page { size: A4; margin: 10mm 11mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 10pt/1.4 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif; color: #17212b; }
  .page { break-after: page; height: 276mm; display: flex; flex-direction: column; gap: 3mm; overflow: hidden; }
  .flow { break-after: page; display: flex; flex-direction: column; gap: 3mm; }
  header, footer { display: flex; justify-content: space-between; font-size: 8pt; letter-spacing: .05em; text-transform: uppercase; color: #5b6b7a; }
  footer { margin-top: auto; justify-content: flex-end; }
  h1 { font-size: 30pt; line-height: 1.05; margin: 0; letter-spacing: -.01em; }
  h2 { font-size: 13pt; line-height: 1.15; margin: 0; }
  h3 { font-size: 10pt; margin: 0 0 1mm; text-transform: uppercase; letter-spacing: .05em; color: #5b6b7a; }
  p { margin: 0; }
  .cover img { width: 100%; border-radius: 3mm; }
  .cover .lead { font-size: 11pt; color: #33414f; }
  .facts { display: flex; flex-wrap: wrap; gap: 2mm; }
  .facts span { background: #e6edf3; border-radius: 1.5mm; padding: 1mm 2.5mm; font-size: 9.5pt; }
  .box { background: #fff1bd; color: #54410a; border-radius: 2.5mm; padding: 3mm 4mm; }
  ul { margin: 0; padding-left: 5mm; display: grid; gap: 1.2mm; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; align-items: start; }
  .cols img { width: 100%; border-radius: 2.5mm; }
  .toc { columns: 3; column-gap: 7mm; }
  .toc .part { break-inside: avoid; margin-bottom: 3mm; }
  .toc ol { list-style: none; margin: 0; padding: 0; font-size: 9pt; }
  .toc li { display: flex; gap: 2mm; justify-content: space-between; border-bottom: .2mm dotted #b9c6d2; padding: .4mm 0; }
  .toc li i { font-style: normal; font-variant-numeric: tabular-nums; color: #5b6b7a; white-space: nowrap; }
  .partlist { margin: 0; padding-left: 5mm; display: grid; gap: 2mm; }
  .partlist span { display: block; color: #5b6b7a; font-size: 9pt; }
  /* un paso */
  .step { display: grid; grid-template-columns: 47mm 1fr; gap: 4mm; align-items: start; height: 128mm; }
  .side { display: grid; gap: 2.5mm; justify-items: start; }
  .side .n { font-size: 30pt; line-height: 1; font-weight: 800; font-variant-numeric: tabular-nums; }
  .need { width: 100%; border: .6mm solid #17212b; border-radius: 2.5mm; padding: 1.5mm 2mm; display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 2mm; background: #fff; }
  .chip { display: flex; align-items: center; gap: .8mm; }
  .chip img { width: 11mm; height: 11mm; object-fit: contain; background: #eef2f6; border-radius: 1.2mm; }
  .chip b { font-size: 11pt; font-variant-numeric: tabular-nums; }
  .minimap { width: 26mm; height: auto; background: #fff; border: .25mm solid #c7d3dd; border-radius: 2mm; }
  .mm-all { fill: #d5dee6; } .mm-now { fill: #cf4327; } .mm-ring { fill: none; stroke: #cf4327; stroke-width: .8; }
  .main { display: grid; gap: 1.5mm; min-width: 0; }
  .main h2 { border-left: 1.2mm solid #17212b; padding-left: 2.5mm; }
  .how { font-size: 8.5pt; line-height: 1.3; color: #33414f; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
  .shot { width: 100%; max-height: 104mm; object-fit: contain; object-position: left top; border-radius: 2.5mm; }
  .step:has(h2) .shot { max-height: 92mm; }
  .tag { font-weight: 700; font-size: 8.5pt; color: #b3361f; }
  /* portada de parte e inventario */
  .parthead { display: grid; grid-template-columns: 1fr 96mm; gap: 6mm; align-items: center; }
  .parthead h1 { font-size: 54pt; color: #cf4327; }
  .parthead h2 { font-size: 20pt; margin-bottom: 2mm; }
  .parthead img { width: 100%; border-radius: 2.5mm; }
  .small { font-size: 9pt; color: #5b6b7a; margin-top: 2mm; }
  .lots { display: grid; grid-template-columns: repeat(6, 1fr); gap: 2mm; }
  .lots.wide { grid-template-columns: repeat(10, 1fr); gap: 1.6mm; }
  .lot { border: .25mm solid #c7d3dd; border-radius: 2mm; padding: 1mm 1.2mm; display: grid; gap: .2mm; font-size: 6.6pt; line-height: 1.15; min-width: 0; break-inside: avoid; }
  .lot img { width: 100%; aspect-ratio: 1; object-fit: contain; background: #eef2f6; border-radius: 1.2mm; }
  .lot b { font-size: 10pt; }
  .lot .pn { font-family: 'DejaVu Sans Mono', 'Liberation Mono', monospace; color: #5b6b7a; }
  .lot .col { display: flex; align-items: center; gap: .8mm; overflow-wrap: anywhere; }
  .lot .col i { flex: none; width: 2.2mm; height: 2.2mm; border-radius: 50%; border: .2mm solid #9aa9b7; }
  .lot .nm { color: #5b6b7a; font-size: 6pt; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style></head><body>
<section class="page cover">
  ${head('Instrucciones de armado')}
  <h1>${esc(report.title)}</h1>
  <p class="lead">${esc(report.description)}</p>
  <img src="tapa.jpg" alt="">
  <div class="facts"><span><b>${num(report.counts.pieces)}</b> piezas</span><span><b>${num(report.counts.lots)}</b> tipos de pieza</span><span><b>${num(total)}</b> pasos</span>${report.size ? `<span>Mide <b>${report.size.join(' × ')} cm</b></span>` : ''}${v.stats.components > 1 ? `<span><b>${v.stats.components}</b> módulos</span>` : ''}</div>
  ${best && best.exact === report.counts.pieces ? `<p class="box"><b>Caja donante: ${esc(best.num)} ${esc(best.name)}</b> (${num(best.parts)} piezas). Todas las piezas del modelo salen de esa sola caja, en la pieza y el color exactos, sin usar los repuestos.</p>` : ''}
  <footer><span>Generado el ${report.generated.split('-').reverse().join('/')}</span></footer>
</section>
<section class="page">
  ${head('Antes de empezar')}
  <h2>Cómo leer cada paso</h2>
  <ul>
    <li>El <b>recuadro negro</b> dice qué piezas hacen falta en ese paso y cuántas de cada una.</li>
    <li>En la imagen, una <b>flecha roja señala cada pieza nueva</b>, que se ve en su color real. Todo lo ya armado aparece apagado, en gris.</li>
    <li>El planito muestra el modelo desde arriba, con el frente hacia abajo: lo rojo es dónde se trabaja en ese paso.</li>
    <li>La vista es siempre la misma (desde adelante y un poco de costado) y solo gira cuando las piezas nuevas quedarían tapadas.</li>
    <li>Cuando empieza un capítulo, arriba de la imagen va su nombre y, si hay una unión especial, una línea que explica cómo va.</li>
  </ul>
  <h2>Lo que conviene saber</h2>
  <ul>
    <li>Cada parte abre con la lista de piezas que usa. Separalas antes de empezar: de una caja de ${best ? num(best.parts) : 'muchas'} piezas es lo que más tiempo ahorra.</li>
    ${v.stats.components > 1 ? `<li>El edificio principal queda en un solo bloque. El resto son <b>${v.stats.components - 1} módulos que van apoyados sobre la mesa</b> (muros, torres, galerías y muebles sueltos): los pasos marcados «Sobre la mesa» empiezan uno o le suman piezas a nivel del piso.</li>` : ''}
    ${resting ? `<li>Van <b>apoyadas, sin presión</b>: ${esc(resting)}. El capítulo donde aparecen explica cómo quedan calzadas en su lugar.</li>` : ''}
    ${report.figs ? `<li>Las minifiguras${(report.figs.volumes || []).length ? ' y las siluetas transparentes (lo que el modelo tiene que alojar)' : ''} de la tapa son de prueba: no forman parte del modelo.</li>` : ''}
    <li>En la mini app, el botón Instrucciones tiene estos mismos pasos en 3D, para girar el modelo cuando una pieza no se ve bien.</li>
  </ul>
  <div class="cols"><div><h3>Así queda armado</h3><img src="real.jpg" alt=""></div><div><h3>Desde arriba (el frente abajo)</h3><img src="plano.jpg" alt=""></div></div>
  <div><h3>Se arma en ${parts.length > 1 ? `${parts.length} partes` : `${report.chapters.length} capítulos`}</h3><ol class="partlist" style="grid-template-columns:1fr 1fr">${parts.map((t, p) => {
    const list = chaptersOf(p);
    if (!list.length || !t) return '';
    const a = list[0].first + 1, b = list[list.length - 1].first + list[list.length - 1].count;
    return `<li><b>${esc(t)}</b><span>pasos ${a} a ${b} · ${num(list.reduce((n, c) => n + c.pieces, 0))} piezas</span></li>`;
  }).join('')}</ol></div>
</section>
<section class="page">
  ${head('Índice de capítulos · en qué paso empieza cada uno')}
  <div class="toc">${toc}</div>
</section>
${pages.join('\n')}
<section class="flow">
  ${head(`Inventario · ${num(report.counts.pieces)} piezas de ${num(report.counts.lots)} tipos`)}
  <div class="lots wide">${report.bom.map((b, l) => card(l, b.qty, true)).join('')}</div>
</section>
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

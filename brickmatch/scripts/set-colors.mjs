// Uso: node scripts/set-colors.mjs 10315-1
// Inventario de un set agrupado por color. Un "!" marca piezas que no están
// en la librería 3D (no se pueden usar en un diseño).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const si = cat.sets.findIndex((s) => s[0] === process.argv[2]);
if (si < 0) throw new Error(`Set no encontrado: ${process.argv[2]}`);
const s = cat.setInfo(si);
console.log(`${s.num} ${s.name} (${s.year}, ${s.theme}) ${s.numParts} piezas`);
const byColor = new Map();
for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
  const row = { p: cat.parts[cat.rowPart[r]], q: cat.rowQty[r], sp: cat.rowSpare[r] };
  if (!row.q) continue;
  const c = cat.colors[cat.rowColor[r]].name;
  if (!byColor.has(c)) byColor.set(c, []);
  byColor.get(c).push(row);
}
const short = (n) => n.replace(/Brick |Plate |Special |with Groove|, Plate Round 1 x 1| \[.*?\]/g, '').slice(0, 34);
const sum = (l) => l.reduce((a, r) => a + r.q, 0);
for (const [c, list] of [...byColor].sort((a, b) => sum(b[1]) - sum(a[1]))) {
  console.log(`\n## ${c} (${sum(list)})`);
  console.log(list.sort((a, b) => b.q - a.q).map((r) => `${r.q}× ${r.p[0]}${lib.has(`${r.p[0]}.dat`) ? '' : '!'} ${short(r.p[1])}`).join(' | '));
}

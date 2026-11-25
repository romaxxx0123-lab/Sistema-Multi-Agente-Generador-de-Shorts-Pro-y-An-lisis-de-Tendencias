// Uso: node scripts/coverage.mjs <modelo> [set] [--max=2500] [--min-year=0]
// Sin set: mejores sets por forma y por color exacto, filtrando por tamaño.
// Con set: qué lotes del modelo cubre ese set y, de los que faltan, en qué
// otros colores trae esa misma pieza (para adaptar el diseño al set).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const report = JSON.parse(fs.readFileSync(path.join(root, 'models', pos[0], 'report.json'), 'utf8'));
const cat = new Catalog(defaultIndexDir(root));
const bom = report.bom;
const prep = cat.prepare(bom.map((b) => ({ part: b.part, color: b.color, qty: b.qty })));
const total = prep.total;
const pct = (n) => `${((n / total) * 100).toFixed(1)}%`.padStart(6);

if (!pos[1]) {
  const sc = cat.score(prep);
  const max = +(opt.max || 1e9), minYear = +(opt['min-year'] || 0);
  const idx = [];
  for (let i = 0; i < cat.sets.length; i++) {
    const s = cat.sets[i];
    if (sc.shape[i] && (s[4] || s[5]) <= max && s[2] >= minYear) idx.push(i);
  }
  const show = (title, key) => {
    console.log(`\n${title} (≤ ${max} piezas, desde ${minYear})`);
    idx.sort((a, b) => sc[key][b] - sc[key][a] || cat.sets[a][4] - cat.sets[b][4]);
    for (const i of idx.slice(0, +(opt.top || 15))) {
      const s = cat.sets[i];
      console.log(`  ${pct(sc.exact[i])} exacto ${pct(sc.shape[i])} forma  ${s[0].padEnd(10)} ${s[2]} ${String(s[4]).padStart(5)} pzs  ${s[1].slice(0, 44)}  [${s[3]}]`);
    }
  };
  show('Por color exacto', 'exact');
  show('Por forma', 'shape');
} else {
  const si = cat.sets.findIndex((s) => s[0] === pos[1]);
  if (si < 0) throw new Error(`Set no encontrado: ${pos[1]}`);
  const h = cat.have(prep, si);
  const s = cat.setInfo(si);
  let exact = 0;
  const missing = [];
  bom.forEach((b, i) => {
    const got = Math.min(b.qty, h.exact[i]);
    exact += got;
    if (got < b.qty) missing.push({ b, i, got });
  });
  console.log(`${s.num} ${s.name} (${s.year}) ${s.numParts} piezas → cubre ${exact}/${total} (${pct(exact).trim()}) en color exacto`);
  // colores en que el set trae cada pieza faltante (por grupo de forma)
  const byGroup = new Map();
  for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
    const g = prep.groupOf.get(cat.flex[cat.rowPart[r]]);
    if (g === undefined) continue;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(`${cat.colors[cat.rowColor[r]].name}×${cat.rowQty[r]}${cat.parts[cat.rowPart[r]][0] !== bom[prep.groups[g].lines[0]].part ? `(${cat.parts[cat.rowPart[r]][0]})` : ''}`);
  }
  console.log(`\nFaltan ${total - exact} piezas en ${missing.length} lotes:`);
  missing.sort((a, b) => (b.b.qty - b.got) - (a.b.qty - a.got));
  for (const { b, i, got } of missing) {
    const g = prep.lines[i].group;
    console.log(`  -${String(b.qty - got).padStart(3)}  ${String(b.qty).padStart(3)}× ${b.part.padEnd(8)} ${b.colorName.padEnd(18)} ${b.name.slice(0, 38).padEnd(38)} | el set trae: ${(byGroup.get(g) || ['—']).join(', ')}`);
  }
}

// Uso: node scripts/part-info.mjs 3001 3040b ...   (ids Rebrickable)
//      node scripts/part-info.mjs --find "slope 33"   (busca por nombre)
//      node scripts/part-info.mjs --set 71767-1        (inventario de un set)
// Para cada pieza: nombre en Rebrickable, si existe en LDraw y en qué colores
// salió (con cantidad de sets y último año).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const args = process.argv.slice(2);

if (args[0] === '--find') {
  const words = args.slice(1).join(' ').toLowerCase().split(/\s+/);
  const totals = new Map();
  for (let i = 0; i < cat._sp.length; i++) totals.set(cat._sp[i], (totals.get(cat._sp[i]) || 0) + cat._sv[i * 4]);
  const hits = cat.parts
    .map((p, i) => ({ p, n: totals.get(i) || 0 }))
    .filter(({ p }) => words.every((w) => p[1].toLowerCase().includes(w)))
    .sort((a, b) => b.n - a.n)
    .slice(0, 40);
  for (const { p, n } of hits) console.log(`${p[0].padEnd(14)} ${String(n).padStart(6)} usos  ${lib.has(p[0] + '.dat') ? 'LDraw' : '  -  '}  ${p[1]}`);
} else if (args[0] === '--set') {
  const si = cat.sets.findIndex((s) => s[0] === args[1]);
  if (si < 0) throw new Error(`Set no encontrado: ${args[1]}`);
  const s = cat.setInfo(si);
  console.log(`${s.num} ${s.name} (${s.year}, ${s.theme}) ${s.numParts} piezas`);
  const rows = [];
  for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
    rows.push({ p: cat.parts[cat.rowPart[r]], c: cat.colors[cat.rowColor[r]], q: cat.rowQty[r], s: cat.rowSpare[r] });
  }
  const filter = (args[2] || '').toLowerCase();
  rows.sort((a, b) => a.p[2].localeCompare(b.p[2]) || a.p[0].localeCompare(b.p[0]) || a.c.name.localeCompare(b.c.name));
  for (const r of rows) {
    const line = `${String(r.q).padStart(4)}${r.s ? `+${r.s}` : '  '} ${r.p[0].padEnd(14)} ${r.c.name.padEnd(20)} ${r.p[1]}  [${r.p[2]}]`;
    if (!filter || line.toLowerCase().includes(filter)) console.log(line);
  }
} else {
  for (const num of args) {
    const p = cat.part(num);
    const ld = lib.has(`${num}.dat`) ? lib.description(`${num}.dat`) : null;
    console.log(`${num}: RB=${p ? p.name : 'NO EXISTE'} | LDraw=${ld ?? 'NO EXISTE'}`);
    if (!p) continue;
    const cols = cat.colorsOf(num).slice(0, 14);
    console.log('   ' + cols.map((c) => `${c.color.name}:${c.sets}(${c.maxYear})`).join('  '));
  }
}

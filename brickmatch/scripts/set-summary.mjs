// Uso: node scripts/set-summary.mjs 71767-1 [minQty]
// Inventario resumido de un set, agrupado por categoría (para diseñar con lo que trae).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = new Catalog(defaultIndexDir(root));
const [num, min = '1'] = process.argv.slice(2);
const si = cat.sets.findIndex((s) => s[0] === num);
if (si < 0) throw new Error(`Set no encontrado: ${num}`);
const s = cat.setInfo(si);
console.log(`${s.num} ${s.name} (${s.year}, ${s.theme}) ${s.numParts} piezas`);
const skip = /Technic|Minifig|Sticker|Tools|Wheels|Tubes|Mechanical|String|Pneumatic|Electronics|Flags|Non-Buildable|Supports|Transportation|Windscreens|Hinges|Belville|Duplo|Znap|Magnets/;
const groups = new Map();
for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
  const p = cat.parts[cat.rowPart[r]], c = cat.colors[cat.rowColor[r]], q = cat.rowQty[r];
  if (q < +min || skip.test(p[2])) continue;
  if (!groups.has(p[2])) groups.set(p[2], new Map());
  const g = groups.get(p[2]);
  const key = `${p[0]} ${p[1].replace(/Brick |Plate |Tile |Special |with Groove|, Plate Round 1 x 1/g, '').slice(0, 34)}`;
  if (!g.has(key)) g.set(key, []);
  g.get(key).push(`${c.name.replace('Light Bluish Gray', 'LBG').replace('Dark Bluish Gray', 'DBG').replace('Reddish Brown', 'RBrown')}×${q}`);
}
for (const [name, g] of [...groups].sort()) {
  console.log(`\n[${name}]`);
  for (const [key, cols] of [...g].sort()) console.log(`  ${key.padEnd(44)} ${cols.join(', ')}`);
}

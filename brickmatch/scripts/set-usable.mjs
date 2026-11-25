// Uso: node scripts/set-usable.mjs 71866-1 [minQty]
// Piezas de construcción de un set que existen en la librería 3D, por categoría.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const [num, min = '1'] = process.argv.slice(2);
const si = cat.sets.findIndex((s) => s[0] === num);
const s = cat.setInfo(si);
const skip = /Technic|Minifig|Sticker|Tools|Wheels|Tubes|Mechanical|String|Pneumatic|Electronics|Flags|Non-Buildable|Supports|Transportation|Windscreens|Belville|Duplo|Znap|Magnets|Energy|Large Buildable|Animals/;
const groups = new Map();
let usable = 0;
for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
  const p = cat.parts[cat.rowPart[r]], c = cat.colors[cat.rowColor[r]], q = cat.rowQty[r];
  if (q < +min || skip.test(p[2]) || !lib.has(`${p[0]}.dat`)) continue;
  usable += q;
  if (!groups.has(p[2])) groups.set(p[2], new Map());
  const g = groups.get(p[2]);
  const key = `${p[0]} ${p[1].replace(/Brick |Plate |Tile |Special |with Groove|, Plate Round 1 x 1| \[.*?\]/g, '').slice(0, 30)}`;
  if (!g.has(key)) g.set(key, []);
  g.get(key).push(`${c.name.replace('Light Bluish Gray', 'LBG').replace('Dark Bluish Gray', 'DBG').replace('Reddish Brown', 'RBrown').replace('Bright Light Orange', 'BLOrange')}×${q}`);
}
console.log(`${s.num} ${s.name} (${s.year}) ${s.numParts} piezas · ${usable} utilizables listadas`);
for (const [name, g] of [...groups].sort()) {
  console.log(`[${name}] ` + [...g].sort().map(([k, cols]) => `${k}: ${cols.join(',')}`).join(' | '));
}

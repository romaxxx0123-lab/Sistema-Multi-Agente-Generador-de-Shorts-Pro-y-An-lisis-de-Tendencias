// Uso: node scripts/who-has.mjs <pieza> [minQty] [--max=3000]
// Qué sets traen más cantidad de una pieza (por color).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = new Catalog(defaultIndexDir(root));
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const p = cat.partIdx.get(pos[0]);
const members = new Set(cat.moldMembers(p));
const rows = [];
for (let s = 0; s < cat.sets.length; s++) {
  if ((cat.sets[s][4] || cat.sets[s][5]) > +(opt.max || 1e9)) continue;
  for (let r = cat.offsets[s]; r < cat.offsets[s + 1]; r++) {
    if (members.has(cat.rowPart[r]) && cat.rowQty[r] >= +(pos[1] || 1)) rows.push([cat.rowQty[r], cat.colors[cat.rowColor[r]].name, cat.sets[s]]);
  }
}
rows.sort((a, b) => b[0] - a[0] || b[2][2] - a[2][2]);
for (const [q, c, s] of rows.slice(0, +(opt.top || 40))) console.log(`${String(q).padStart(4)} ${c.padEnd(18)} ${s[0].padEnd(10)} ${s[2]} ${String(s[4]).padStart(5)}  ${s[1].slice(0, 46)} [${s[3]}]`);

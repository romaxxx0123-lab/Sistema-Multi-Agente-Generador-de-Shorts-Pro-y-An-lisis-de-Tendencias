// Uso: node scripts/budget.mjs <modelo> <set> [--left] [--cat=Plates]
// Presupuesto de piezas al diseñar con una caja: qué pide el modelo de más
// (sobregiros) y, con --left, qué queda sin usar en la caja por categoría.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const pos = args.filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, v]) => [k, v ?? true]));
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const report = JSON.parse(fs.readFileSync(path.join(root, 'models', pos[0], 'report.json'), 'utf8'));
const si = cat.sets.findIndex((s) => s[0] === pos[1]);
if (si < 0) throw new Error(`Set no encontrado: ${pos[1]}`);

// Lo que trae la caja, por molde (variantes de la misma pieza) y color.
const have = new Map();
for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
  const key = `${cat.mold[cat.rowPart[r]]}|${cat.rowColor[r]}`;
  const e = have.get(key) || { part: cat.parts[cat.rowPart[r]], color: cat.colors[cat.rowColor[r]], qty: 0, used: 0 };
  e.qty += cat.rowQty[r];
  have.set(key, e);
}
let total = 0, over = 0;
const overs = [];
for (const b of report.bom) {
  const p = cat.partIdx.get(b.part), c = cat.colorIdx.get(b.color);
  const e = have.get(`${cat.mold[p]}|${c}`);
  total += b.qty;
  if (e) e.used += b.qty;
  const miss = b.qty - (e ? e.qty : 0);
  if (miss > 0) {
    over += miss;
    const others = [...have.values()].filter((h) => cat.mold[cat.partIdx.get(h.part[0])] === cat.mold[p]).map((h) => `${h.color.name}×${h.qty}`);
    overs.push(`  -${String(miss).padStart(3)}  pide ${b.qty}× ${b.part} ${b.colorName} (${b.name.slice(0, 34)}) | la caja trae: ${others.join(', ') || 'ninguna'}`);
  }
}
const s = cat.setInfo(si);
console.log(`${report.title}: ${total} piezas · ${s.num} ${s.name} cubre ${total - over} (${(((total - over) / total) * 100).toFixed(1)}%)`);
if (overs.length) console.log(`Sobregiros (${over} piezas):\n${overs.join('\n')}`);
else console.log('Sin sobregiros: todo sale de la caja.');

if (opt.left) {
  const short = (n) => n.replace('Light Bluish Gray', 'LBG').replace('Dark Bluish Gray', 'DBG').replace('Reddish Brown', 'RBrown').replace('Bright Light Orange', 'BLOrange');
  const groups = new Map();
  let left = 0;
  for (const e of have.values()) {
    const rest = e.qty - e.used;
    if (rest <= 0 || !lib.has(`${e.part[0]}.dat`)) continue;
    if (opt.cat && !e.part[2].toLowerCase().includes(String(opt.cat).toLowerCase())) continue;
    left += rest;
    if (!groups.has(e.part[2])) groups.set(e.part[2], new Map());
    const g = groups.get(e.part[2]);
    const key = `${e.part[0]} ${e.part[1].replace(/Brick |Plate |Tile |Special |with Groove| \[.*?\]/g, '').slice(0, 30)}`;
    if (!g.has(key)) g.set(key, []);
    g.get(key).push(`${short(e.color.name)}×${rest}${e.used ? `(de ${e.qty})` : ''}`);
  }
  console.log(`\nQueda en la caja (${left} piezas dibujables):`);
  for (const [name, g] of [...groups].sort()) console.log(`[${name}] ` + [...g].sort().map(([k, cols]) => `${k}: ${cols.join(',')}`).join(' | '));
}

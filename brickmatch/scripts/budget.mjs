// Uso: node scripts/budget.mjs <modelo> <set>[+<set>…] [--left] [--cat=Plates] [--copies=2] [--taken=<set> [--csv=archivo.csv]]
// Con varios sets (70751-1+71848-1) se suman sus cajas; --from=<set> con --left
// muestra solo lo que queda de esa caja.
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
const copies = +(opt.copies || 1);
const nums = pos[1].split('+');
const sis = nums.map((n) => {
  const i = cat.sets.findIndex((s) => s[0] === n);
  if (i < 0) throw new Error(`Set no encontrado: ${n}`);
  return i;
});
const si = sis[0];

// Lo que traen las cajas, por molde (variantes de la misma pieza) y color.
const have = new Map();
for (const one of sis) {
  for (let r = cat.offsets[one]; r < cat.offsets[one + 1]; r++) {
    const key = `${cat.mold[cat.rowPart[r]]}|${cat.rowColor[r]}`;
    const e = have.get(key) || { part: cat.parts[cat.rowPart[r]], color: cat.colors[cat.rowColor[r]], qty: 0, used: 0, by: {} };
    e.qty += cat.rowQty[r] * copies;
    e.by[cat.sets[one][0]] = (e.by[cat.sets[one][0]] || 0) + cat.rowQty[r] * copies;
    have.set(key, e);
  }
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
const label = sis.length > 1 ? nums.join(' + ') : `${s.num} ${s.name}`;
console.log(`${report.title}: ${total} piezas · ${copies > 1 ? `${copies}× ` : ''}${label} cubre ${total - over} (${(((total - over) / total) * 100).toFixed(1)}%)`);
if (sis.length > 1) {
  // De cada caja, cuántas piezas se usan (se gasta primero la primera caja).
  const used = Object.fromEntries(nums.map((n) => [n, 0])), size = Object.fromEntries(nums.map((n) => [n, 0]));
  for (const e of have.values()) {
    let need = Math.min(e.used, e.qty);
    for (const n of nums) {
      const q = e.by[n] || 0;
      size[n] += q;
      const take = Math.min(need, q);
      used[n] += take;
      need -= take;
    }
  }
  for (const n of nums) console.log(`  de ${n}: ${used[n]} de ${size[n]} piezas (${((used[n] / size[n]) * 100).toFixed(0)}%)`);
}
if (overs.length) console.log(`Sobregiros (${over} piezas):\n${overs.join('\n')}`);
else console.log('Sin sobregiros: todo sale de la caja.');

// --taken=<set>: lista (CSV) de lo que el modelo saca de esa caja, por si se
// prefiere comprar esas piezas sueltas en vez de desarmar el set.
if (opt.taken) {
  const rows = [];
  let sum = 0;
  for (const e of have.values()) {
    let need = Math.min(e.used, e.qty), took = 0;
    for (const n of nums) {
      const take = Math.min(need, e.by[n] || 0);
      need -= take;
      if (n === opt.taken) took = take;
    }
    if (took) { rows.push([took, e.part[0], e.color.name, e.part[1], e.part[2]]); sum += took; }
  }
  rows.sort((a, b) => a[4].localeCompare(b[4]) || b[0] - a[0] || a[1].localeCompare(b[1]));
  const csv = ['cantidad,pieza,color,nombre,categoria', ...rows.map((r) => r.map((v) => (/[",]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(','))].join('\n') + '\n';
  if (typeof opt.taken === 'string' && opt.csv) {
    fs.writeFileSync(path.resolve(opt.csv), csv);
    console.log(`\nDe ${opt.taken} salen ${sum} piezas en ${rows.length} lotes → ${opt.csv}`);
  } else {
    console.log(`\nDe ${opt.taken} salen ${sum} piezas en ${rows.length} lotes:\n${csv}`);
  }
}

if (opt.left) {
  const short = (n) => n.replace('Light Bluish Gray', 'LBG').replace('Dark Bluish Gray', 'DBG').replace('Reddish Brown', 'RBrown').replace('Bright Light Orange', 'BLOrange');
  const groups = new Map();
  let left = 0;
  for (const e of have.values()) {
    let rest = e.qty - e.used;
    // --from: lo que queda de una sola caja (la primera caja se gasta primero).
    if (opt.from) {
      let need = e.used;
      for (const n of nums) {
        const q = e.by[n] || 0;
        const take = Math.min(need, q);
        need -= take;
        if (n === opt.from) rest = q - take;
      }
    }
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

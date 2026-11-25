// Uso: node scripts/donors.mjs [--theme=ninjago] [--min=100] [--max=400] [--from=2024] [--top=40]
// Busca sets "donantes": cajas chicas con mucha pieza de construcción que exista
// en la librería 3D. El volumen estima cuánto se puede construir con la caja.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));
const cat = new Catalog(defaultIndexDir(root));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const theme = (opt.theme || '').toLowerCase();
const min = +(opt.min || 100), max = +(opt.max || 400), from = +(opt.from || 2024), to = +(opt.to || 2100);

const building = /^(Bricks|Plates|Tiles|Bricks Sloped|Bricks Curved|Bricks Round and Cones|Windows and Doors|Panels|Plates Round Curved and Dishes|Bricks Special|Plates Special|Bars, Ladders and Fences)$/;
const volumes = new Map();
const volumeOf = (num) => {
  if (volumes.has(num)) return volumes.get(num);
  let v = 0;
  if (lib.has(`${num}.dat`) && !(lib.description(`${num}.dat`) || '').startsWith('~Moved')) {
    try {
      const b = lib.geometry(`${num}.dat`).bbox;
      v = ((b.max[0] - b.min[0]) / 20) * ((b.max[2] - b.min[2]) / 20) * ((b.max[1] - b.min[1]) / 24);
    } catch {
      v = 0;
    }
  } else if (lib.has(`${num}.dat`)) {
    try {
      const b = lib.geometry(`${num}.dat`).bbox;
      v = ((b.max[0] - b.min[0]) / 20) * ((b.max[2] - b.min[2]) / 20) * ((b.max[1] - b.min[1]) / 24);
    } catch {
      v = 0;
    }
  }
  volumes.set(num, v);
  return v;
};

const rows = [];
cat.sets.forEach((s, si) => {
  if ((theme && !s[3].toLowerCase().includes(theme)) || s[4] < min || s[4] > max || s[2] < from || s[2] > to) return;
  if (/Duplo|Technic|Bionicle|Mindstorms|Education|Dots|Art|Brickheadz|Books|Gear|Collectible/i.test(s[3])) return;
  let vol = 0, pieces = 0, usable = 0;
  for (let r = cat.offsets[si]; r < cat.offsets[si + 1]; r++) {
    const p = cat.parts[cat.rowPart[r]], q = cat.rowQty[r];
    pieces += q;
    if (!q || !building.test(p[2])) continue;
    const v = volumeOf(p[0]);
    if (v > 0) {
      usable += q;
      vol += v * q;
    }
  }
  rows.push({ s, vol, usable, pieces });
});
rows.sort((a, b) => b.vol - a.vol);
console.log('volumen  útiles/piezas  set        año  nombre  [tema]');
for (const r of rows.slice(0, +(opt.top || 40))) {
  console.log(`${String(Math.round(r.vol)).padStart(6)}   ${String(r.usable).padStart(4)}/${String(r.s[4]).padEnd(4)}     ${r.s[0].padEnd(10)} ${r.s[2]}  ${r.s[1].slice(0, 44)}  [${r.s[3].slice(0, 28)}]`);
}

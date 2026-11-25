// Uso: node scripts/inspect-part.mjs 3001 3040b ...
// Muestra, por pieza: descripción oficial, caja (en LDU), huella en studs,
// altura en plates, studs y hacia dónde "baja" (útil para orientar pendientes).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = new LDrawLibrary(defaultLibraryRoot(root));

const r = (n) => Math.round(n * 100) / 100;

export function profile(g) {
  // Para cada lado de la caja: punto más alto (menor Y) y más bajo (mayor Y)
  // de los vértices pegados a ese lado.
  const { min, max } = g.bbox;
  const sides = { '-x': [0, min[0]], '+x': [0, max[0]], '-z': [2, min[2]], '+z': [2, max[2]] };
  const out = {};
  for (const [name, [axis, val]] of Object.entries(sides)) {
    let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < g.tris.length; i += 3) {
      if (Math.abs(g.tris[i + axis] - val) < 1.01) {
        top = Math.min(top, g.tris[i + 1]);
        bottom = Math.max(bottom, g.tris[i + 1]);
      }
    }
    out[name] = [r(top), r(bottom)];
  }
  return out;
}

for (const id of process.argv.slice(2)) {
  const ref = id.endsWith('.dat') ? id : `${id}.dat`;
  if (!lib.has(ref)) {
    console.log(`${id}: NO EXISTE en LDraw`);
    continue;
  }
  const g = lib.geometry(ref);
  const { min, max } = g.bbox;
  const w = (max[0] - min[0]) / 20, d = (max[2] - min[2]) / 20, h = (max[1] - min[1]) / 8;
  console.log(`${id}: ${lib.description(ref)}`);
  console.log(`   caja x[${r(min[0])},${r(max[0])}] y[${r(min[1])},${r(max[1])}] z[${r(min[2])},${r(max[2])}]  => ${r(w)} x ${r(d)} studs, ${r(h)} plates, ${g.tris.length / 9} tris`);
  const studs = g.studs.map((s) => `(${r(s.m[9])},${r(s.m[10])},${r(s.m[11])})${s.kind === 'open' ? 'o' : ''}${Math.abs(s.m[4] - 1) > 1e-6 ? `^[${r(-s.m[1])},${r(-s.m[4])},${r(-s.m[7])}]` : ''}`);
  console.log(`   studs(${studs.length}): ${studs.join(' ')}`);
  const p = profile(g);
  console.log(`   lados [arriba,abajo]: ${Object.entries(p).map(([k, v]) => `${k}:[${v}]`).join('  ')}`);
  if (g.missing.length) console.log(`   FALTAN subarchivos: ${[...new Set(g.missing)].join(', ')}`);
}

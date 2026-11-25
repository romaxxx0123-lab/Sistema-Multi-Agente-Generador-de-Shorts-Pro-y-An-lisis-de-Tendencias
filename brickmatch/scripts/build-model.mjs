// Genera un modelo: lo arma, lo valida físicamente, comprueba que cada
// pieza+color existe, busca los sets que mejor lo cubren y escribe:
//   models/<id>/model.ldr    LDraw estándar (se abre en Studio, LeoCAD…)
//   models/<id>/model.mpd    lo mismo con todas las piezas incrustadas (para el visor)
//   models/<id>/report.json  lista de piezas, validación y ranking de sets
//
// Uso: npm run model -- <id> [--no-sets] [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LDrawLibrary, defaultLibraryRoot, applyPoint } from '../lib/ldraw.mjs';
import { Catalog, defaultIndexDir } from '../lib/catalog.mjs';
import { resolvePalette } from '../lib/palette.mjs';
import { Model } from '../lib/builder.mjs';
import { helpers } from '../lib/helpers.mjs';
import { validate } from '../lib/validate.mjs';
import { matchSets } from '../lib/match.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith('--'));
const flags = new Set(args.filter((a) => a.startsWith('--')));
if (!id) {
  console.error('Uso: npm run model -- <id>   (carpeta dentro de models/)');
  process.exit(1);
}
const dir = path.join(root, 'models', id);
const t0 = Date.now();

const lib = new LDrawLibrary(defaultLibraryRoot(root));
const catalog = new Catalog(defaultIndexDir(root));
const palette = resolvePalette(lib, catalog);

const mod = await import(pathToFileURL(path.join(dir, 'model.mjs')).href + `?t=${Date.now()}`);
const meta = mod.meta || {};
const model = new Model({ id, title: meta.title || id, description: meta.description || '', lib, palette });
mod.default(model, helpers(model));

// --- validación física ------------------------------------------------------
const check = validate(model);

// --- minifiguras de prueba: ¿entran sin chocar y bien paradas? ---------------
let figs = null;
if (model.props.length) {
  const N = model.placements.length;
  model.props.forEach((p, i) => { p.index = N + i; });
  const both = Object.create(model);
  both.placements = [...model.placements, ...model.props];
  both.links = [...model.links, ...model.propLinks.map(([a, b]) => [a.index, b.index])];
  // Cada pie tiene que caer sobre un stud: eso es lo que la sostiene.
  const studAt = new Map();
  const key = (x, y, z) => `${Math.round(x)}|${Math.round(y)}|${Math.round(z)}`;
  for (const q of model.placements) {
    for (const st of model.studsOf(q)) if (st.axis[1] < -0.99) studAt.set(key(...st.base), q.index);
  }
  const loose = [];
  for (const p of model.props) {
    if (p.def.ld !== '3815c01') continue;
    let feet = 0;
    for (const side of [-10, 10]) {
      const f = applyPoint(p.matrix, side, 40, 0);
      // Sobre la mesa no hay studs: parada en el piso también vale.
      if (Math.abs(f[1]) < 0.6) { feet++; continue; }
      const q = studAt.get(key(...f));
      if (q === undefined) continue;
      feet++;
      both.links.push([p.index, q]);
    }
    if (feet < 2) loose.push(`La minifigura ${p.fig + 1} no tiene los dos pies sobre studs (${feet} de 2)`);
  }
  const r = validate(both);
  const labels = ['minifigura', ...model.envelopes.map((v) => v.label)];
  const errors = [...new Set([...loose, ...r.errors.filter((e) => labels.some((l) => e.includes(l)))])];
  // Medidas de los volúmenes de prueba en centímetros (1 stud = 0,8 cm; 1 plate = 0,32 cm).
  // largo × ancho × alto: el largo es el lado mayor de la huella.
  const volumes = model.envelopes.map((v) => ({ label: v.label, cm: [Math.max(v.w, v.d) * 0.8, Math.min(v.w, v.d) * 0.8, v.h * 0.32].map((n) => Math.round(n)) }));
  figs = { count: model.figs, ok: errors.length === 0, errors, volumes };
}

// --- cada pieza+color tiene que existir de verdad ---------------------------
const bom = model.bom();
const notes = [];
for (const b of bom) {
  const part = catalog.part(b.part);
  if (!part) {
    check.errors.push(`La pieza ${b.part} no existe en el catálogo Rebrickable`);
    continue;
  }
  const st = catalog.elementStats(b.part, b.color);
  b.name = part.name;
  b.category = part.category;
  b.sets = st.sets;
  b.lastYear = st.maxYear;
  // Mismo número en LDraw y en Rebrickable no garantiza que sea la misma pieza.
  const ld = lib.description(`${b.ld}.dat`) || '';
  if (!ld.startsWith('~') && !(palette.parts[b.ld] && palette.parts[b.ld].verified)) {
    const words = (t) => new Set(t.toLowerCase().replace(/sloped/g, 'slope').split(/[^a-z]+/).filter((w) => w.length >= 3 && !['with', 'without', 'and', 'for', 'the', 'special'].includes(w)));
    const a = words(ld), c = words(part.name);
    if (![...a].some((w) => c.has(w))) notes.push(`Revisar identidad de ${b.part}: en LDraw es "${ld}" y en Rebrickable "${part.name}"`);
  }
  if (!st.sets) {
    const alt = catalog.colorsOf(b.part).slice(0, 6).map((c) => `${c.color.name} (${c.sets})`).join(', ');
    check.errors.push(`${b.part} ${part.name} nunca salió en ${b.colorName}. Colores comunes: ${alt}`);
  } else if (st.sets < 8) {
    notes.push(`Pieza rara: ${b.qty}× ${b.part} ${part.name} en ${b.colorName} solo salió en ${st.sets} set(s), último en ${st.maxYear}`);
  }
}
check.ok = check.errors.length === 0;
bom.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.colorName.localeCompare(b.colorName));

// --- LDraw -------------------------------------------------------------------
const lines = model.toLDrawLines();
const usedColors = [...new Map(model.placements.map((p) => [p.color.ld, p.color])).values()];
const shade = (hex, f) => '#' + [1, 3, 5].map((i) => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * f)).toString(16).padStart(2, '0')).join('').toUpperCase();
const lum = (hex) => [1, 3, 5].reduce((s, i, k) => s + (parseInt(hex.slice(i, i + 2), 16) / 255) * [0.2126, 0.7152, 0.0722][k], 0);
const colorLine = (c) => {
  const edge = lum(c.rgb) < 0.12 ? '#5B6670' : shade(c.rgb, 0.55);
  return `0 !COLOUR ${c.name.replace(/[^A-Za-z0-9]+/g, '_')} CODE ${c.ld} VALUE ${c.rgb.toUpperCase()} EDGE ${edge}${c.trans ? ' ALPHA 150' : ''}${c.finish ? ` ${c.finish}` : ''}`;
};
const colorLines = usedColors.map(colorLine);
const header = [
  `0 ${model.title}`,
  `0 Name: ${id}.ldr`,
  '0 Author: BrickMatch',
  `0 // ${model.placements.length} piezas, ${model.steps.length} pasos`,
];
fs.writeFileSync(path.join(dir, 'model.ldr'), [...header, ...lines].join('\n') + '\n');
const packed = lib.pack(lines, { title: model.title, colorLines });
fs.writeFileSync(path.join(dir, 'model.mpd'), packed.text);
// Las minifiguras van en un archivo aparte: el visor las muestra como capa.
const figFile = path.join(dir, 'figs.mpd');
if (figs) {
  // Negro y blanco siempre: los usan las caras impresas de las minifiguras.
  const figColors = [...new Map([...model.props.map((p) => p.color), ...['Black', 'White'].map((n) => model.colorDef(n))].map((c) => [c.ld, c])).values()];
  const figLines = model.props.map((p) => `1 ${p.color.ld} ${[9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => p.matrix[i]).join(' ')} ${p.def.ld}.dat`);
  fs.writeFileSync(figFile, lib.pack(figLines, { title: `${model.title} - minifiguras`, colorLines: figColors.map(colorLine) }).text);
} else if (fs.existsSync(figFile)) {
  fs.unlinkSync(figFile);
}

// --- ranking de sets ---------------------------------------------------------
const lineIndex = new Map(bom.map((b, i) => [`${b.part}|${b.color}`, i]));
// Medidas del modelo armado, en centímetros (1 LDU = 0,4 mm): ancho, fondo y alto.
const ext = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
for (const p of model.placements) {
  const b = model.boxOf(p);
  for (let k = 0; k < 3; k++) {
    ext.min[k] = Math.min(ext.min[k], b.min[k]);
    ext.max[k] = Math.max(ext.max[k], b.max[k]);
  }
}
const sizeCm = [0, 2, 1].map((k) => Math.round((ext.max[k] - ext.min[k]) * 0.04));
const report = {
  id,
  title: model.title,
  description: model.description,
  prompt: meta.prompt || '',
  order: meta.order || 0,
  generated: new Date().toISOString().slice(0, 10),
  data: { source: catalog.source, date: catalog.dataDate, setsSearched: catalog.sets.length },
  counts: { pieces: model.placements.length, lots: bom.length, steps: model.steps.length },
  size: sizeCm,
  steps: model.steps,
  placements: model.placements.map((p) => [lineIndex.get(`${p.def.rb}|${p.color.rb}`), p.step]),
  bom: bom.map((b) => ({
    part: b.part, ld: b.ld, name: b.name, category: b.category,
    color: b.color, colorName: b.colorName, rgb: palette.colors[b.colorName].rgb, trans: palette.colors[b.colorName].trans,
    qty: b.qty, sets: b.sets, lastYear: b.lastYear,
  })),
  validation: { ok: check.ok, errors: check.errors, warnings: check.warnings, notes, stats: check.stats },
  figs,
  sets: null,
};
if (!flags.has('--no-sets')) report.sets = matchSets(catalog, report.bom, { copies: meta.copies || 1 });
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report));

// --- resumen -----------------------------------------------------------------
const s = check.stats;
console.log(`\n${model.title}: ${s.parts} piezas, ${bom.length} lotes, ${model.steps.length} pasos  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
console.log(`Validación: ${check.ok ? 'OK' : `${check.errors.length} ERROR(ES)`} · ${s.connections} uniones · ${s.studsHeld} studs agarrados · ${s.components} bloque(s) · ${check.warnings.length} aviso(s)`);
const show = (title, list, max) => {
  if (!list.length) return;
  console.log(`\n${title}`);
  for (const e of list.slice(0, max)) console.log(`  - ${e}`);
  if (list.length > max) console.log(`  … y ${list.length - max} más`);
};
if (figs) console.log(`Minifiguras de prueba: ${figs.count} · ${figs.ok ? 'todas entran sin chocar' : `${figs.errors.length} problema(s)`}`);
show('ERRORES', check.errors, flags.has('--quiet') ? 12 : 60);
if (figs) show('MINIFIGURAS', figs.errors, 30);
show('AVISOS', check.warnings, 20);
show('NOTAS', notes, 20);
if (report.sets) {
  console.log(`\nMejores sets (de ${report.data.setsSearched} revisados, datos al ${report.data.date})${report.sets.copies > 1 ? `, comprando ${report.sets.copies} cajas iguales` : ''}:`);
  for (const st of report.sets.list.slice(0, 12)) {
    const pct = (n) => `${((n / report.counts.pieces) * 100).toFixed(1)}%`.padStart(6);
    console.log(`  ${pct(st.exact)} exacto ${pct(st.shape)} forma  ${st.num.padEnd(10)} ${String(st.year)} ${String(st.parts).padStart(5)} pzs  ${st.name}  [${st.theme}]`);
  }
}
process.exit(check.ok && (!figs || figs.ok) ? 0 : 2);

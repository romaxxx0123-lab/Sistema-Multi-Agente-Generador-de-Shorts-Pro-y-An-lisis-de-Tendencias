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
import { LDrawLibrary, defaultLibraryRoot } from '../lib/ldraw.mjs';
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
const colorLines = usedColors.map((c) => {
  const edge = lum(c.rgb) < 0.12 ? '#5B6670' : shade(c.rgb, 0.55);
  return `0 !COLOUR ${c.name.replace(/[^A-Za-z0-9]+/g, '_')} CODE ${c.ld} VALUE ${c.rgb.toUpperCase()} EDGE ${edge}${c.trans ? ' ALPHA 150' : ''}${c.finish ? ` ${c.finish}` : ''}`;
});
const header = [
  `0 ${model.title}`,
  `0 Name: ${id}.ldr`,
  '0 Author: BrickMatch',
  `0 // ${model.placements.length} piezas, ${model.steps.length} pasos`,
];
fs.writeFileSync(path.join(dir, 'model.ldr'), [...header, ...lines].join('\n') + '\n');
const packed = lib.pack(lines, { title: model.title, colorLines });
fs.writeFileSync(path.join(dir, 'model.mpd'), packed.text);

// --- ranking de sets ---------------------------------------------------------
const lineIndex = new Map(bom.map((b, i) => [`${b.part}|${b.color}`, i]));
const report = {
  id,
  title: model.title,
  description: model.description,
  prompt: meta.prompt || '',
  generated: new Date().toISOString().slice(0, 10),
  data: { source: catalog.source, date: catalog.dataDate, setsSearched: catalog.sets.length },
  counts: { pieces: model.placements.length, lots: bom.length, steps: model.steps.length },
  steps: model.steps,
  placements: model.placements.map((p) => [lineIndex.get(`${p.def.rb}|${p.color.rb}`), p.step]),
  bom: bom.map((b) => ({
    part: b.part, ld: b.ld, name: b.name, category: b.category,
    color: b.color, colorName: b.colorName, rgb: palette.colors[b.colorName].rgb, trans: palette.colors[b.colorName].trans,
    qty: b.qty, sets: b.sets, lastYear: b.lastYear,
  })),
  validation: { ok: check.ok, errors: check.errors, warnings: check.warnings, notes, stats: check.stats },
  sets: null,
};
if (!flags.has('--no-sets')) report.sets = matchSets(catalog, report.bom);
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
show('ERRORES', check.errors, flags.has('--quiet') ? 12 : 60);
show('AVISOS', check.warnings, 20);
show('NOTAS', notes, 20);
if (report.sets) {
  console.log(`\nMejores sets (de ${report.data.setsSearched} revisados, datos al ${report.data.date}):`);
  for (const st of report.sets.list.slice(0, 12)) {
    const pct = (n) => `${((n / report.counts.pieces) * 100).toFixed(1)}%`.padStart(6);
    console.log(`  ${pct(st.exact)} exacto ${pct(st.shape)} forma  ${st.num.padEnd(10)} ${String(st.year)} ${String(st.parts).padStart(5)} pzs  ${st.name}  [${st.theme}]`);
  }
}
process.exit(check.ok ? 0 : 2);

// Convierte la base Rebrickable (data/rebrickable/rb.db, SQLite) en un índice
// compacto en data/index/: para cada set, su inventario completo ya resuelto
// (última versión + piezas de sus minifiguras + sets incluidos en packs).
//
// Uso: npm run index
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.RB_DB || path.join(root, 'data/rebrickable/rb.db');
const outDir = path.join(root, 'data/index');
if (!fs.existsSync(dbPath)) {
  console.error(`No existe ${dbPath}. Corre "npm run data" primero.`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
const db = new DatabaseSync(dbPath, { readOnly: true });
const t0 = Date.now();
const all = (sql) => db.prepare(sql).all();

// --- catálogos -------------------------------------------------------------
const colors = all('select id, name, rgb, is_trans from colors order by id');
const colorIdx = new Map(colors.map((c, i) => [c.id, i]));

const cats = new Map(all('select id, name from part_categories').map((r) => [r.id, r.name]));
const partRows = all('select part_num, name, part_cat_id, part_material from parts order by part_num');
const partIdx = new Map(partRows.map((p, i) => [p.part_num, i]));

const themes = new Map(all('select id, name, parent_id from themes').map((r) => [r.id, r]));
const themePath = (id) => {
  const names = [];
  for (let t = themes.get(id), guard = 0; t && guard < 6; t = themes.get(t.parent_id), guard++) names.unshift(t.name);
  return names.join(' › ');
};

// --- equivalencias de piezas -----------------------------------------------
// mold: variantes de molde (M) → misma pieza a efectos de armado.
// flex: además alternativas (A) e impresas/patrones (P, T) → misma forma.
function unionFind(n) {
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  return { find, union: (a, b) => { parent[find(a)] = find(b); } };
}
const ufMold = unionFind(partRows.length);
const ufFlex = unionFind(partRows.length);
for (const r of all('select rel_type, child_part_num c, parent_part_num p from part_relationships')) {
  const a = partIdx.get(r.c), b = partIdx.get(r.p);
  if (a === undefined || b === undefined) continue;
  if (r.rel_type === 'M') ufMold.union(a, b);
  if (r.rel_type === 'M' || r.rel_type === 'A' || r.rel_type === 'P' || r.rel_type === 'T') ufFlex.union(a, b);
}

// --- inventarios -----------------------------------------------------------
const latest = new Map(); // set_num | fig_num → { id, version }
for (const r of all('select id, version, set_num from inventories')) {
  const cur = latest.get(r.set_num);
  if (!cur || r.version > cur.version) latest.set(r.set_num, { id: r.id, version: r.version });
}
const wanted = new Map([...latest].map(([num, v]) => [v.id, num]));

const invParts = new Map(); // inventory_id → number[] (partIdx, colorIdx, qty, spare)*
let rowCount = 0;
for (const r of db.prepare('select inventory_id i, part_num p, color_id c, quantity q, is_spare s from inventory_parts').iterate()) {
  rowCount++;
  if (!wanted.has(r.i)) continue;
  let arr = invParts.get(r.i);
  if (!arr) invParts.set(r.i, (arr = []));
  arr.push(partIdx.get(r.p), colorIdx.get(r.c), r.s ? 0 : r.q, r.s ? r.q : 0);
}
const invFigs = new Map();
for (const r of all('select inventory_id i, fig_num f, quantity q from inventory_minifigs')) {
  if (!wanted.has(r.i)) continue;
  if (!invFigs.has(r.i)) invFigs.set(r.i, []);
  invFigs.get(r.i).push([r.f, r.q]);
}
const invSets = new Map();
for (const r of all('select inventory_id i, set_num s, quantity q from inventory_sets')) {
  if (!wanted.has(r.i)) continue;
  if (!invSets.has(r.i)) invSets.set(r.i, []);
  invSets.get(r.i).push([r.s, r.q]);
}

const NC = colors.length;
function collect(num, mult, acc, depth, seen) {
  const inv = latest.get(num);
  if (!inv || depth > 4 || seen.has(num)) return;
  seen.add(num);
  const arr = invParts.get(inv.id);
  if (arr) {
    for (let i = 0; i < arr.length; i += 4) {
      const key = arr[i] * NC + arr[i + 1];
      let e = acc.get(key);
      if (!e) acc.set(key, (e = [0, 0]));
      e[0] += arr[i + 2] * mult;
      e[1] += arr[i + 3] * mult;
    }
  }
  for (const [fig, q] of invFigs.get(inv.id) || []) collect(fig, mult * q, acc, depth + 1, seen);
  for (const [child, q] of invSets.get(inv.id) || []) collect(child, mult * q, acc, depth + 1, seen);
  seen.delete(num);
}

// --- salida ----------------------------------------------------------------
const sets = [];
const offsets = [0];
const colPart = [], colColor = [], colQty = [], colSpare = [];
const stat = new Map(); // key → [numSets, minYear, maxYear, qty]
for (const s of all('select set_num, name, year, theme_id, num_parts from sets order by set_num')) {
  const acc = new Map();
  collect(s.set_num, 1, acc, 0, new Set());
  if (!acc.size) continue;
  let total = 0;
  for (const [key, [q, sp]] of acc) {
    colPart.push(Math.floor(key / NC));
    colColor.push(key % NC);
    colQty.push(Math.min(q, 65535));
    colSpare.push(Math.min(sp, 65535));
    total += q;
    if (q > 0) {
      let st = stat.get(key);
      if (!st) stat.set(key, (st = [0, 9999, 0, 0]));
      st[0]++;
      st[1] = Math.min(st[1], s.year);
      st[2] = Math.max(st[2], s.year);
      st[3] += q;
    }
  }
  sets.push([s.set_num, s.name, s.year, themePath(s.theme_id), s.num_parts, total]);
  offsets.push(colPart.length);
}

const write = (name, typed) => fs.writeFileSync(path.join(outDir, name), Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength));
write('rows.part.u32', Uint32Array.from(colPart));
write('rows.color.u16', Uint16Array.from(colColor));
write('rows.qty.u16', Uint16Array.from(colQty));
write('rows.spare.u16', Uint16Array.from(colSpare));
write('sets.offsets.u32', Uint32Array.from(offsets));
write('parts.mold.u32', Uint32Array.from(partRows.map((_, i) => ufMold.find(i))));
write('parts.flex.u32', Uint32Array.from(partRows.map((_, i) => ufFlex.find(i))));

const statPart = [], statColor = [], statVals = [];
for (const [key, st] of stat) {
  statPart.push(Math.floor(key / NC));
  statColor.push(key % NC);
  statVals.push(st[0], st[1], st[2], Math.min(st[3], 0xffffffff));
}
write('stats.part.u32', Uint32Array.from(statPart));
write('stats.color.u16', Uint16Array.from(statColor));
write('stats.vals.u32', Uint32Array.from(statVals));

const lov = Object.fromEntries(all('select key, value from rb_db_lov').map((r) => [r.key, r.value]));
const meta = {
  source: 'Rebrickable (rb.db)',
  dataDate: lov.data_timestamp ? new Date(+lov.data_timestamp * 1000).toISOString().slice(0, 10) : null,
  colors,
  parts: partRows.map((p) => [p.part_num, p.name, cats.get(p.part_cat_id) || '', p.part_material]),
  sets,
};
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta));
console.log(`Índice listo en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${sets.length} sets con inventario, ${colPart.length} líneas (de ${rowCount} filas), ${partRows.length} piezas, ${colors.length} colores, datos al ${meta.dataDate}.`);

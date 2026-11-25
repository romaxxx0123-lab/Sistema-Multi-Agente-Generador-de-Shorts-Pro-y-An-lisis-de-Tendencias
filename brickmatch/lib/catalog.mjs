// Catálogo Rebrickable en memoria (lee data/index/, generado por "npm run index"):
// - saber si una pieza+color existe de verdad y en cuántos sets salió
// - rankear TODOS los sets por cuántas piezas de un modelo cubren
import fs from 'node:fs';
import path from 'node:path';

function typed(file, Type) {
  const buf = fs.readFileSync(file);
  return new Type(buf.buffer, buf.byteOffset, buf.byteLength / Type.BYTES_PER_ELEMENT);
}

export class Catalog {
  constructor(indexDir) {
    const metaFile = path.join(indexDir, 'meta.json');
    if (!fs.existsSync(metaFile)) throw new Error(`No hay índice en ${indexDir}. Corre "npm run index".`);
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    this.source = meta.source;
    this.dataDate = meta.dataDate;
    this.colors = meta.colors; // [{id,name,rgb,is_trans}]
    this.parts = meta.parts; // [num, name, category, material]
    this.sets = meta.sets; // [num, name, year, theme, num_parts, total_qty]
    this.NC = this.colors.length;
    this.colorIdx = new Map(this.colors.map((c, i) => [c.id, i]));
    this.partIdx = new Map(this.parts.map((p, i) => [p[0], i]));
    this.rowPart = typed(path.join(indexDir, 'rows.part.u32'), Uint32Array);
    this.rowColor = typed(path.join(indexDir, 'rows.color.u16'), Uint16Array);
    this.rowQty = typed(path.join(indexDir, 'rows.qty.u16'), Uint16Array);
    this.rowSpare = typed(path.join(indexDir, 'rows.spare.u16'), Uint16Array);
    this.offsets = typed(path.join(indexDir, 'sets.offsets.u32'), Uint32Array);
    this.mold = typed(path.join(indexDir, 'parts.mold.u32'), Uint32Array);
    this.flex = typed(path.join(indexDir, 'parts.flex.u32'), Uint32Array);
    const sp = typed(path.join(indexDir, 'stats.part.u32'), Uint32Array);
    const sc = typed(path.join(indexDir, 'stats.color.u16'), Uint16Array);
    const sv = typed(path.join(indexDir, 'stats.vals.u32'), Uint32Array);
    this.stats = new Map();
    for (let i = 0; i < sp.length; i++) this.stats.set(sp[i] * this.NC + sc[i], i);
    this._sv = sv;
    this._sp = sp;
    this._sc = sc;
    this._moldMembers = null;
  }

  part(num) {
    const i = this.partIdx.get(num);
    if (i === undefined) return null;
    const p = this.parts[i];
    return { idx: i, num: p[0], name: p[1], category: p[2], material: p[3] };
  }

  color(id) {
    const i = this.colorIdx.get(id);
    return i === undefined ? null : { idx: i, ...this.colors[i] };
  }

  // Todas las piezas que son la misma a efectos de armado (variantes de molde).
  moldMembers(partIndex) {
    if (!this._moldMembers) {
      this._moldMembers = new Map();
      for (let i = 0; i < this.mold.length; i++) {
        const r = this.mold[i];
        if (!this._moldMembers.has(r)) this._moldMembers.set(r, []);
        this._moldMembers.get(r).push(i);
      }
    }
    return this._moldMembers.get(this.mold[partIndex]) || [partIndex];
  }

  // En cuántos sets apareció esta pieza en este color (sumando variantes de molde).
  elementStats(partNum, colorId) {
    const p = this.partIdx.get(partNum), c = this.colorIdx.get(colorId);
    if (p === undefined || c === undefined) return null;
    let sets = 0, minYear = 9999, maxYear = 0, qty = 0;
    for (const m of this.moldMembers(p)) {
      const i = this.stats.get(m * this.NC + c);
      if (i === undefined) continue;
      sets += this._sv[i * 4];
      minYear = Math.min(minYear, this._sv[i * 4 + 1]);
      maxYear = Math.max(maxYear, this._sv[i * 4 + 2]);
      qty += this._sv[i * 4 + 3];
    }
    return sets ? { sets, minYear, maxYear, qty } : { sets: 0, minYear: null, maxYear: null, qty: 0 };
  }

  // Colores en los que existe una pieza, del más común al más raro.
  colorsOf(partNum) {
    const p = this.partIdx.get(partNum);
    if (p === undefined) return [];
    const members = new Set(this.moldMembers(p));
    const acc = new Map();
    for (let i = 0; i < this._sp.length; i++) {
      if (!members.has(this._sp[i])) continue;
      const e = acc.get(this._sc[i]) || { sets: 0, maxYear: 0, qty: 0 };
      e.sets += this._sv[i * 4];
      e.maxYear = Math.max(e.maxYear, this._sv[i * 4 + 2]);
      e.qty += this._sv[i * 4 + 3];
      acc.set(this._sc[i], e);
    }
    return [...acc].map(([ci, e]) => ({ color: this.colors[ci], ...e })).sort((a, b) => b.sets - a.sets);
  }

  setInfo(i) {
    const s = this.sets[i];
    return { num: s[0], name: s[1], year: s[2], theme: s[3], numParts: s[4] };
  }

  // Prepara un BOM para comparar: bom = [{ part, color, qty }] con ids Rebrickable.
  prepare(bom) {
    const lines = [];
    const exactKey = new Map(); // moldRoot*NC+colorIdx → índice de línea
    const groupOf = new Map(); // flexRoot → índice de grupo
    const groups = [];
    for (const b of bom) {
      const p = this.partIdx.get(b.part), c = this.colorIdx.get(b.color);
      if (p === undefined) throw new Error(`Pieza desconocida en Rebrickable: ${b.part}`);
      if (c === undefined) throw new Error(`Color desconocido en Rebrickable: ${b.color}`);
      const key = this.mold[p] * this.NC + c;
      let li = exactKey.get(key);
      if (li === undefined) {
        li = lines.length;
        exactKey.set(key, li);
        let g = groupOf.get(this.flex[p]);
        if (g === undefined) {
          g = groups.length;
          groupOf.set(this.flex[p], g);
          groups.push({ need: 0, lines: [] });
        }
        groups[g].lines.push(li);
        lines.push({ part: b.part, color: b.color, need: 0, group: g });
      }
      lines[li].need += b.qty;
      groups[lines[li].group].need += b.qty;
    }
    const relevant = new Uint8Array(this.parts.length);
    for (let i = 0; i < this.parts.length; i++) {
      if (groupOf.has(this.flex[i])) relevant[i] = 1;
    }
    const total = lines.reduce((s, l) => s + l.need, 0);
    return { lines, groups, exactKey, groupOf, relevant, total };
  }

  // Cantidades que un set aporta a cada línea (exacto) y a cada grupo (forma).
  // copies: cuántas cajas iguales se compran.
  have(prep, setIndex, copies = 1) {
    const L = prep.lines.length, G = prep.groups.length;
    const exact = new Uint32Array(L), spare = new Uint32Array(L), shape = new Uint32Array(G);
    for (let r = this.offsets[setIndex], end = this.offsets[setIndex + 1]; r < end; r++) {
      const p = this.rowPart[r];
      if (!prep.relevant[p]) continue;
      const g = prep.groupOf.get(this.flex[p]);
      if (g !== undefined) shape[g] += (this.rowQty[r] + this.rowSpare[r]) * copies;
      const li = prep.exactKey.get(this.mold[p] * this.NC + this.rowColor[r]);
      if (li !== undefined) {
        exact[li] += this.rowQty[r] * copies;
        spare[li] += this.rowSpare[r] * copies;
      }
    }
    return { exact, spare, shape };
  }

  // Puntúa todos los sets contra el BOM. `need` permite pasar un faltante
  // residual (para buscar el mejor segundo set).
  score(prep, need = null, copies = 1) {
    const L = prep.lines.length, G = prep.groups.length;
    const needLine = need || Uint32Array.from(prep.lines.map((l) => l.need));
    const needGroup = new Uint32Array(G);
    for (let i = 0; i < L; i++) needGroup[prep.lines[i].group] += needLine[i];
    const n = this.sets.length;
    const exact = new Uint32Array(n), withSpare = new Uint32Array(n), shape = new Uint32Array(n);
    const hx = new Uint32Array(L), hs = new Uint32Array(L), hg = new Uint32Array(G);
    for (let s = 0; s < n; s++) {
      let touched = false;
      for (let r = this.offsets[s], end = this.offsets[s + 1]; r < end; r++) {
        const p = this.rowPart[r];
        if (!prep.relevant[p]) continue;
        touched = true;
        const g = prep.groupOf.get(this.flex[p]);
        if (g !== undefined) hg[g] += (this.rowQty[r] + this.rowSpare[r]) * copies;
        const li = prep.exactKey.get(this.mold[p] * this.NC + this.rowColor[r]);
        if (li !== undefined) {
          hx[li] += this.rowQty[r] * copies;
          hs[li] += this.rowSpare[r] * copies;
        }
      }
      if (!touched) continue;
      let e = 0, es = 0, f = 0;
      for (let i = 0; i < L; i++) {
        e += Math.min(needLine[i], hx[i]);
        es += Math.min(needLine[i], hx[i] + hs[i]);
      }
      for (let g = 0; g < G; g++) f += Math.min(needGroup[g], hg[g]);
      exact[s] = e;
      withSpare[s] = es;
      shape[s] = f;
      hx.fill(0);
      hs.fill(0);
      hg.fill(0);
    }
    return { exact, withSpare, shape };
  }
}

export function defaultIndexDir(projectRoot) {
  return process.env.BRICKMATCH_INDEX || path.join(projectRoot, 'data/index');
}

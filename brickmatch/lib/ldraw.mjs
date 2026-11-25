// Acceso a la librería oficial de piezas LDraw: localizar archivos, extraer
// geometría (triángulos + studs) y empaquetar un modelo con todas sus piezas
// en un único .mpd que el visor puede abrir sin red.
import fs from 'node:fs';
import path from 'node:path';

const SUBDIRS = ['parts', 'parts/s', 'p', 'p/48', 'p/8', 'models'];

// Matrices como [a,b,c, d,e,f, g,h,i, x,y,z]: p' = R·p + t (R por filas).
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

export function compose(P, C) {
  const out = new Array(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = P[r * 3] * C[c] + P[r * 3 + 1] * C[3 + c] + P[r * 3 + 2] * C[6 + c];
    }
    out[9 + r] = P[r * 3] * C[9] + P[r * 3 + 1] * C[10] + P[r * 3 + 2] * C[11] + P[9 + r];
  }
  return out;
}

export function applyPoint(M, x, y, z) {
  return [
    M[0] * x + M[1] * y + M[2] * z + M[9],
    M[3] * x + M[4] * y + M[5] * z + M[10],
    M[6] * x + M[7] * y + M[8] * z + M[11],
  ];
}

export function applyDir(M, x, y, z) {
  return [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
}

export function transformTris(M, tris) {
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const x = tris[i], y = tris[i + 1], z = tris[i + 2];
    out[i] = M[0] * x + M[1] * y + M[2] * z + M[9];
    out[i + 1] = M[3] * x + M[4] * y + M[5] * z + M[10];
    out[i + 2] = M[6] * x + M[7] * y + M[8] * z + M[11];
  }
  return out;
}

export function bboxOfTris(tris) {
  const b = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      if (v < b.min[k]) b.min[k] = v;
      if (v > b.max[k]) b.max[k] = v;
    }
  }
  return b;
}

export class LDrawLibrary {
  constructor(root) {
    this.root = root;
    this.index = new Map();
    for (const dir of SUBDIRS) {
      const abs = path.join(root, dir);
      if (!fs.existsSync(abs)) continue;
      for (const name of fs.readdirSync(abs)) {
        if (/\.(dat|ldr|mpd)$/i.test(name)) this.index.set(`${dir}/${name}`.toLowerCase(), `${dir}/${name}`);
      }
    }
    if (!this.index.size) throw new Error(`No hay librería LDraw en ${root}. Corre "npm run data".`);
    this._text = new Map();
    this._geom = new Map();
    this._studKind = new Map();
    this._colors = null;
  }

  // Normaliza una referencia igual que el LDrawLoader de three.js y la busca en disco.
  // `key` es el nombre con el que el archivo se incrusta en el .mpd empaquetado.
  locate(ref) {
    const name = ref.trim().replace(/\\/g, '/').toLowerCase();
    let candidates;
    if (name.startsWith('s/')) candidates = [[`parts/${name}`, `parts/${name}`]];
    else if (name.startsWith('48/')) candidates = [[`p/${name}`, `p/${name}`]];
    else if (name.startsWith('8/')) candidates = [[`p/${name}`, name]];
    else candidates = [[`parts/${name}`, name], [`p/${name}`, name], [`models/${name}`, name]];
    for (const [rel, key] of candidates) {
      if (this.index.has(rel)) return { key, rel: this.index.get(rel), isPrimitive: rel.startsWith('p/') };
    }
    return null;
  }

  has(ref) {
    return this.locate(ref) !== null;
  }

  text(rel) {
    let t = this._text.get(rel);
    if (t === undefined) {
      t = fs.readFileSync(path.join(this.root, rel), 'latin1').replace(/\r/g, '');
      this._text.set(rel, t);
    }
    return t;
  }

  // Primera línea del archivo: la descripción oficial de la pieza.
  description(ref) {
    const loc = this.locate(ref);
    if (!loc) return null;
    const first = this.text(loc.rel).split('\n', 1)[0];
    return first.replace(/^0\s+/, '').replace(/\s+/g, ' ').trim();
  }

  // 'top' para studs normales (los que encastran en la pieza de arriba),
  // null para tubos/encastres inferiores y cualquier otra primitiva.
  studKind(loc) {
    if (!loc.isPrimitive) return null;
    const base = path.basename(loc.rel).toLowerCase();
    if (!base.startsWith('stud')) return null;
    let kind = this._studKind.get(base);
    if (kind === undefined) {
      const desc = this.text(loc.rel).split('\n', 1)[0];
      const isTop = /^0\s+Stud\b/.test(desc) && !/Tube|Underside|Duplo|Scala|Quatro|Placeholder|Extension/i.test(desc);
      kind = isTop ? (/Open/i.test(desc) ? 'open' : 'solid') : null;
      this._studKind.set(base, kind);
    }
    return kind;
  }

  // Geometría de un archivo en su propio sistema de coordenadas:
  // tris (9 números por triángulo, sin studs superiores) y la lista de studs.
  geometry(ref) {
    const loc = this.locate(ref);
    if (!loc) throw new Error(`Pieza LDraw no encontrada: ${ref}`);
    let g = this._geom.get(loc.rel);
    if (g) return g;
    const tris = [];
    const studs = [];
    const missing = [];
    for (const line of this.text(loc.rel).split('\n')) {
      const c = line.charCodeAt(0);
      if (c !== 49 && c !== 51 && c !== 52) {
        // admite sangría
        const t = line.trimStart();
        if (!t || (t[0] !== '1' && t[0] !== '3' && t[0] !== '4')) continue;
      }
      const f = line.trim().split(/\s+/);
      if (f[0] === '3') {
        for (let i = 2; i < 11; i++) tris.push(+f[i]);
      } else if (f[0] === '4') {
        const v = f.slice(2, 14).map(Number);
        tris.push(v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8]);
        tris.push(v[0], v[1], v[2], v[6], v[7], v[8], v[9], v[10], v[11]);
      } else if (f[0] === '1') {
        const n = f.slice(2, 14).map(Number);
        const M = [n[3], n[4], n[5], n[6], n[7], n[8], n[9], n[10], n[11], n[0], n[1], n[2]];
        const file = f.slice(14).join(' ');
        const child = this.locate(file);
        if (!child) {
          missing.push(file);
          continue;
        }
        const kind = this.studKind(child);
        if (kind) {
          studs.push({ kind, m: M });
          continue;
        }
        const cg = this.geometry(file);
        const tt = transformTris(M, cg.tris);
        for (let i = 0; i < tt.length; i++) tris.push(tt[i]);
        for (const s of cg.studs) studs.push({ kind: s.kind, m: compose(M, s.m) });
        for (const m of cg.missing) missing.push(m);
      }
    }
    const arr = Float64Array.from(tris);
    g = { tris: arr, studs, bbox: bboxOfTris(arr), missing };
    this._geom.set(loc.rel, g);
    return g;
  }

  // Colores oficiales (LDConfig.ldr): código → { code, name, value, edge, alpha, finish, line }.
  colors() {
    if (this._colors) return this._colors;
    const map = new Map();
    for (const line of this.text('LDConfig.ldr').split('\n')) {
      const m = /^0\s+!COLOUR\s+(\S+)\s+CODE\s+(\d+)\s+VALUE\s+(#[0-9A-Fa-f]{6})\s+EDGE\s+(#[0-9A-Fa-f]{6})(.*)$/.exec(line.trim());
      if (!m) continue;
      const rest = m[5];
      const alpha = /ALPHA\s+(\d+)/.exec(rest);
      const finish = /\b(CHROME|PEARLESCENT|RUBBER|MATTE_METALLIC|METAL|MATERIAL)\b/.exec(rest);
      map.set(+m[2], {
        code: +m[2],
        name: m[1].replace(/_/g, ' '),
        value: m[3].toUpperCase(),
        edge: m[4].toUpperCase(),
        alpha: alpha ? +alpha[1] : 255,
        finish: finish ? finish[1] : null,
        line: line.trim().replace(/\s+/g, ' '),
      });
    }
    this._colors = map;
    return map;
  }

  // Empaqueta un modelo: devuelve un .mpd con el modelo principal primero y,
  // después, cada archivo referenciado (piezas, subpiezas y primitivas).
  pack(mainLines, { title = 'Model', colorLines = [] } = {}) {
    const head = [`0 ${title}`, '0 Name: model.ldr', '0 Author: BrickMatch', ...colorLines];
    const out = [...head, ...mainLines];
    const seen = new Set();
    const queue = [];
    const enqueue = (lines) => {
      for (const line of lines) {
        const t = line.trim();
        if (t[0] !== '1') continue;
        const f = t.split(/\s+/);
        const file = f.slice(14).join(' ');
        const loc = this.locate(file);
        if (!loc) throw new Error(`Referencia LDraw sin resolver al empaquetar: ${file}`);
        if (!seen.has(loc.key)) {
          seen.add(loc.key);
          queue.push(loc);
        }
      }
    };
    enqueue(mainLines);
    while (queue.length) {
      const loc = queue.shift();
      const kept = [];
      for (const line of this.text(loc.rel).split('\n')) {
        const t = line.trim();
        if (!t) continue;
        if (t[0] === '0') {
          if (/^0\s+(BFC\b|!LDRAW_ORG\b)/.test(t)) kept.push(t.replace(/\s+/g, ' '));
          continue;
        }
        kept.push(t.replace(/\s+/g, ' '));
      }
      out.push(`0 FILE ${loc.key}`);
      for (const k of kept) out.push(k);
      enqueue(kept);
    }
    return { text: out.join('\n') + '\n', files: seen.size };
  }
}

export function defaultLibraryRoot(projectRoot) {
  const candidates = [
    process.env.LDRAW_DIR,
    path.join(projectRoot, 'data/ldraw'),
    path.join(projectRoot, 'data/ldraw-extract/usr/share/ldraw'),
    '/usr/share/ldraw',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(path.join(c, 'parts'))) return c;
  throw new Error('No encuentro la librería LDraw. Corre "npm run data" o define LDRAW_DIR.');
}

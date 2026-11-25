// Validador físico de un modelo. Usa la geometría real de cada pieza para:
//  1. detectar piezas que se atraviesan (choques)
//  2. comprobar cada stud: si la pieza de arriba lo agarra o lo aplasta
//  3. verificar que todo queda unido y apoyado (nada flotando)
import { transformTris } from './ldraw.mjs';

const EPS = 0.5; // LDU: tolerancia para distinguir "se tocan" de "se atraviesan"

// ¿Se cruzan de verdad dos triángulos? (tocarse o ser coplanares no cuenta)
function triCross(P, i, Q, j) {
  const p0x = P[i], p0y = P[i + 1], p0z = P[i + 2];
  const p1x = P[i + 3], p1y = P[i + 4], p1z = P[i + 5];
  const p2x = P[i + 6], p2y = P[i + 7], p2z = P[i + 8];
  const q0x = Q[j], q0y = Q[j + 1], q0z = Q[j + 2];
  const q1x = Q[j + 3], q1y = Q[j + 4], q1z = Q[j + 5];
  const q2x = Q[j + 6], q2y = Q[j + 7], q2z = Q[j + 8];

  let ax = q1x - q0x, ay = q1y - q0y, az = q1z - q0z;
  let bx = q2x - q0x, by = q2y - q0y, bz = q2z - q0z;
  let n2x = ay * bz - az * by, n2y = az * bx - ax * bz, n2z = ax * by - ay * bx;
  let len = Math.hypot(n2x, n2y, n2z);
  if (len < 1e-9) return false;
  n2x /= len; n2y /= len; n2z /= len;
  const dp0 = n2x * (p0x - q0x) + n2y * (p0y - q0y) + n2z * (p0z - q0z);
  const dp1 = n2x * (p1x - q0x) + n2y * (p1y - q0y) + n2z * (p1z - q0z);
  const dp2 = n2x * (p2x - q0x) + n2y * (p2y - q0y) + n2z * (p2z - q0z);
  if (!(Math.min(dp0, dp1, dp2) < -EPS && Math.max(dp0, dp1, dp2) > EPS)) return false;

  ax = p1x - p0x; ay = p1y - p0y; az = p1z - p0z;
  bx = p2x - p0x; by = p2y - p0y; bz = p2z - p0z;
  let n1x = ay * bz - az * by, n1y = az * bx - ax * bz, n1z = ax * by - ay * bx;
  len = Math.hypot(n1x, n1y, n1z);
  if (len < 1e-9) return false;
  n1x /= len; n1y /= len; n1z /= len;
  const dq0 = n1x * (q0x - p0x) + n1y * (q0y - p0y) + n1z * (q0z - p0z);
  const dq1 = n1x * (q1x - p0x) + n1y * (q1y - p0y) + n1z * (q1z - p0z);
  const dq2 = n1x * (q2x - p0x) + n1y * (q2y - p0y) + n1z * (q2z - p0z);
  if (!(Math.min(dq0, dq1, dq2) < -EPS && Math.max(dq0, dq1, dq2) > EPS)) return false;

  // Recta de intersección de los dos planos; se proyecta sobre su eje dominante.
  const dx = n1y * n2z - n1z * n2y, dy = n1z * n2x - n1x * n2z, dz = n1x * n2y - n1y * n2x;
  const adx = Math.abs(dx), ady = Math.abs(dy), adz = Math.abs(dz);
  const dl = Math.hypot(dx, dy, dz);
  if (dl < 1e-9) return false;
  let pa, pb, pc, qa, qb, qc, scale;
  if (adx >= ady && adx >= adz) { pa = p0x; pb = p1x; pc = p2x; qa = q0x; qb = q1x; qc = q2x; scale = dl / adx; }
  else if (ady >= adz) { pa = p0y; pb = p1y; pc = p2y; qa = q0y; qb = q1y; qc = q2y; scale = dl / ady; }
  else { pa = p0z; pb = p1z; pc = p2z; qa = q0z; qb = q1z; qc = q2z; scale = dl / adz; }

  const iv = (a, b, c, da, db, dc) => {
    let lo = Infinity, hi = -Infinity;
    const edge = (u, v, du, dv) => {
      if ((du < 0 && dv > 0) || (du > 0 && dv < 0)) {
        const t = u + ((v - u) * du) / (du - dv);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    };
    edge(a, b, da, db); edge(b, c, db, dc); edge(c, a, dc, da);
    if (da === 0) { if (a < lo) lo = a; if (a > hi) hi = a; }
    if (db === 0) { if (b < lo) lo = b; if (b > hi) hi = b; }
    if (dc === 0) { if (c < lo) lo = c; if (c > hi) hi = c; }
    return [lo, hi];
  };
  const [l1, h1] = iv(pa, pb, pc, dp0, dp1, dp2);
  const [l2, h2] = iv(qa, qb, qc, dq0, dq1, dq2);
  return (Math.min(h1, h2) - Math.max(l1, l2)) * scale > EPS;
}

function triBoxes(tris) {
  const n = tris.length / 9;
  const b = new Float64Array(n * 6);
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 3; k++) {
      const a = tris[t * 9 + k], c = tris[t * 9 + 3 + k], d = tris[t * 9 + 6 + k];
      b[t * 6 + k] = Math.min(a, c, d);
      b[t * 6 + 3 + k] = Math.max(a, c, d);
    }
  }
  return b;
}

// Distancia mínima desde el origen 2D a un polígono (0 si el origen está dentro).
function originToPolygon(pts) {
  const n = pts.length;
  if (n === 0) return Infinity;
  let best = Infinity, inside = n >= 3, sign = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    const ex = x2 - x1, ey = y2 - y1;
    const l2 = ex * ex + ey * ey;
    let t = l2 > 0 ? -(x1 * ex + y1 * ey) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x1 + t * ex, y1 + t * ey));
    const cross = x1 * y2 - x2 * y1;
    if (Math.abs(cross) > 1e-9) {
      if (sign === 0) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) inside = false;
    }
  }
  return inside && sign !== 0 ? 0 : best;
}

// Recorta un polígono 3D con el semiespacio h(p) >= 0.
function clip(poly, h) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ha = h(a), hb = h(b);
    if (ha >= 0) out.push(a);
    if ((ha > 0 && hb < 0) || (ha < 0 && hb > 0)) {
      const t = ha / (ha - hb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

export function validate(model, { ground = 0 } = {}) {
  const lib = model.lib;
  const P = model.placements;
  const errors = [], warnings = [];
  const label = (p) => (p.fig !== undefined ? p.label || `minifigura ${p.fig + 1}` : `#${p.index} ${p.def.name} ${p.color.name} (paso ${p.step + 1})`);

  // Geometría rotada por pieza+orientación (se comparte entre copias).
  const cache = new Map();
  const geomOf = (p) => {
    const key = `${p.def.ld}|${p.matrix.slice(0, 9).join(',')}`;
    let g = cache.get(key);
    if (!g) {
      const R = p.matrix.slice(0, 9).concat([0, 0, 0]);
      const tris = transformTris(R, lib.geometry(`${p.def.ld}.dat`).tris);
      g = { tris, boxes: triBoxes(tris) };
      cache.set(key, g);
    }
    return g;
  };
  // Triángulos de p (en mundo) que tocan una caja dada.
  const trisIn = (p, min, max) => {
    const g = geomOf(p), t = [p.matrix[9], p.matrix[10], p.matrix[11]];
    const out = [];
    for (let i = 0, n = g.boxes.length / 6; i < n; i++) {
      let hit = true;
      for (let k = 0; k < 3; k++) {
        if (g.boxes[i * 6 + k] + t[k] > max[k] || g.boxes[i * 6 + 3 + k] + t[k] < min[k]) { hit = false; break; }
      }
      if (hit) for (let v = 0; v < 9; v++) out.push(g.tris[i * 9 + v] + t[v % 3]);
    }
    return out;
  };

  // Pieza inclinada: su caja alineada a los ejes exagera el lugar que ocupa.
  const skew = (p) => p.matrix.slice(0, 9).some((v) => Math.abs(v) > 0.01 && Math.abs(Math.abs(v) - 1) > 0.01);
  const boxes = P.map((p) => model.boxOf(p));
  const linked = new Set(model.links.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  const pairKey = (a, b) => `${Math.min(a, b)}-${Math.max(a, b)}`;

  // --- 1. duplicados y choques ---------------------------------------------
  let pairsTested = 0;
  for (let a = 0; a < P.length; a++) {
    for (let b = a + 1; b < P.length; b++) {
      const A = boxes[a], B = boxes[b];
      let deep = true;
      for (let k = 0; k < 3; k++) {
        if (Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]) <= 1) { deep = false; break; }
      }
      if (!deep) continue;
      if (P[a].def.ld === P[b].def.ld && P[a].matrix.every((v, i) => Math.abs(v - P[b].matrix[i]) < 0.01)) {
        errors.push(`Pieza duplicada en el mismo lugar: ${label(P[a])} y ${label(P[b])}`);
        continue;
      }
      pairsTested++;
      const min = [0, 1, 2].map((k) => Math.max(A.min[k], B.min[k]) - 0.01);
      const max = [0, 1, 2].map((k) => Math.min(A.max[k], B.max[k]) + 0.01);
      const ta = trisIn(P[a], min, max), tb = trisIn(P[b], min, max);
      let hit = false;
      outer: for (let i = 0; i < ta.length; i += 9) {
        for (let j = 0; j < tb.length; j += 9) {
          if (triCross(ta, i, tb, j)) { hit = true; break outer; }
        }
      }
      const allowed = linked.has(pairKey(a, b)) || (P[a].nest && P[a].nest === P[b].nest);
      if (hit && !allowed) {
        errors.push(`Choque: ${label(P[a])} atraviesa a ${label(P[b])}`);
      } else if (!hit && !allowed && !skew(P[a]) && !skew(P[b])) {
        const vol = (X) => (X.max[0] - X.min[0]) * (X.max[1] - X.min[1]) * (X.max[2] - X.min[2]);
        const inter = [0, 1, 2].reduce((v, k) => v * (max[k] - min[k]), 1);
        if (inter > 0.6 * Math.min(vol(A), vol(B))) {
          warnings.push(`Revisar: ${label(P[a])} y ${label(P[b])} ocupan casi el mismo espacio`);
        }
      }
    }
  }

  // --- 2. studs --------------------------------------------------------------
  const edges = new Map(); // "a-b" → cantidad de studs que los unen
  const addEdge = (a, b, n = 1) => edges.set(pairKey(a, b), (edges.get(pairKey(a, b)) || 0) + n);
  let studsHeld = 0, studsFree = 0;
  for (let a = 0; a < P.length; a++) {
    for (const s of model.studsOf(P[a])) {
      const q = [s.base[0] + 2 * s.axis[0], s.base[1] + 2 * s.axis[1], s.base[2] + 2 * s.axis[2]];
      // base ortonormal perpendicular al eje del stud
      const u = Math.abs(s.axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const d = u[0] * s.axis[0] + u[1] * s.axis[1] + u[2] * s.axis[2];
      const e1 = [u[0] - d * s.axis[0], u[1] - d * s.axis[1], u[2] - d * s.axis[2]];
      const l1 = Math.hypot(...e1);
      e1[0] /= l1; e1[1] /= l1; e1[2] /= l1;
      const e2 = [s.axis[1] * e1[2] - s.axis[2] * e1[1], s.axis[2] * e1[0] - s.axis[0] * e1[2], s.axis[0] * e1[1] - s.axis[1] * e1[0]];
      const height = (p) => (p[0] - s.base[0]) * s.axis[0] + (p[1] - s.base[1]) * s.axis[1] + (p[2] - s.base[2]) * s.axis[2];
      let held = false;
      for (let b = 0; b < P.length; b++) {
        if (b === a) continue;
        const B = boxes[b];
        if (q[0] < B.min[0] - 6.5 || q[0] > B.max[0] + 6.5 || q[1] < B.min[1] - 6.5 || q[1] > B.max[1] + 6.5 || q[2] < B.min[2] - 6.5 || q[2] > B.max[2] + 6.5) continue;
        if (linked.has(pairKey(a, b))) continue;
        const tb = trisIn(P[b], [q[0] - 9, q[1] - 9, q[2] - 9], [q[0] + 9, q[1] + 9, q[2] + 9]);
        let dmin = Infinity;
        for (let j = 0; j < tb.length; j += 9) {
          let poly = [[tb[j], tb[j + 1], tb[j + 2]], [tb[j + 3], tb[j + 4], tb[j + 5]], [tb[j + 6], tb[j + 7], tb[j + 8]]];
          poly = clip(poly, (p) => height(p) + 0.5);
          if (poly.length < 2) continue;
          poly = clip(poly, (p) => 3.5 - height(p));
          if (poly.length < 2) continue;
          const pts = poly.map((p) => {
            const r = [p[0] - s.base[0], p[1] - s.base[1], p[2] - s.base[2]];
            return [r[0] * e1[0] + r[1] * e1[1] + r[2] * e1[2], r[0] * e2[0] + r[1] * e2[1] + r[2] * e2[2]];
          });
          dmin = Math.min(dmin, originToPolygon(pts));
          if (dmin < 3) break;
        }
        if (dmin < 5.2) {
          errors.push(`Stud aplastado: un stud de ${label(P[a])} choca con ${label(P[b])} (a ${dmin.toFixed(1)} LDU del eje)`);
        } else if (dmin <= 6.8) {
          held = true;
          addEdge(a, b);
        }
      }
      if (held) studsHeld++;
      else studsFree++;
    }
  }
  for (const [a, b] of model.links) addEdge(a, b);

  // --- 3. conectividad -------------------------------------------------------
  const adj = P.map(() => []);
  for (const key of edges.keys()) {
    const [a, b] = key.split('-').map(Number);
    adj[a].push(b);
    adj[b].push(a);
  }
  const flood = (seeds) => {
    const seen = new Uint8Array(P.length);
    const stack = [...seeds];
    for (const s of seeds) seen[s] = 1;
    while (stack.length) {
      const n = stack.pop();
      for (const m of adj[n]) if (!seen[m]) { seen[m] = 1; stack.push(m); }
    }
    return seen;
  };
  const grounded = P.filter((p) => Math.abs(boxes[p.index].max[1] - ground) < 0.6).map((p) => p.index);
  const reach = flood(grounded);
  const floating = P.filter((p) => !reach[p.index]);
  for (const p of floating) errors.push(`Pieza sin sostén: ${label(p)} no está encastrada en nada que llegue al suelo`);

  // ¿Se puede levantar el modelo entero de una pieza?
  let components = 0;
  const comp = new Int32Array(P.length).fill(-1);
  for (let i = 0; i < P.length; i++) {
    if (comp[i] !== -1) continue;
    const seen = flood([i]);
    for (let j = 0; j < P.length; j++) if (seen[j]) comp[j] = components;
    components++;
  }
  if (components > 1) {
    const sizes = new Array(components).fill(0);
    for (const c of comp) sizes[c]++;
    const main = sizes.indexOf(Math.max(...sizes));
    const loose = [];
    for (let c = 0; c < components; c++) {
      if (c === main) continue;
      const members = P.filter((p) => comp[p.index] === c);
      loose.push(`${members.length} pieza(s) desde ${label(members[0])}`);
    }
    warnings.push(`El modelo queda en ${components} bloques separados (apoyados pero no unidos entre sí): ${loose.slice(0, 8).join('; ')}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: { parts: P.length, pairsTested, connections: edges.size, studsHeld, studsFree, components },
    edges,
  };
}

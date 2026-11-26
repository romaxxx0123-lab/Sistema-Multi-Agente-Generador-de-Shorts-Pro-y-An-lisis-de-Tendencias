// Modelos de vehículos procedurales: carrocería suave por secciones, vidrios, luces, detalles y ruedas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Perfiles laterales por estilo: [z normalizado (-1 atrás .. 1 adelante), altura relativa (0..1 del alto)]
const STYLES = {
  sedan: { top: [[1, 0.37], [0.985, 0.54], [0.75, 0.6], [0.42, 0.64], [0.12, 0.98], [-0.3, 1.0], [-0.5, 0.96], [-0.7, 0.7], [-0.93, 0.69], [-1, 0.6], [-1, 0.4]], ws: [0.42, 0.12], rw: [-0.5, -0.7], belt: [0.64, 0.7], tumble: 0.8, bpillar: 0.0 },
  hatch: { top: [[1, 0.36], [0.98, 0.53], [0.7, 0.59], [0.45, 0.63], [0.15, 0.97], [-0.55, 0.99], [-0.78, 0.95], [-0.96, 0.72], [-1, 0.62], [-1, 0.38]], ws: [0.45, 0.15], rw: [-0.78, -0.96], belt: [0.63, 0.68], tumble: 0.82, bpillar: -0.12 },
  suv: { top: [[1, 0.36], [0.985, 0.53], [0.72, 0.6], [0.5, 0.63], [0.24, 0.97], [-0.75, 0.99], [-0.92, 0.95], [-1, 0.68], [-1, 0.35]], ws: [0.5, 0.24], rw: [-0.88, -1], belt: [0.62, 0.64], tumble: 0.86, bpillar: -0.15 },
  van: { top: [[1, 0.3], [0.97, 0.43], [0.84, 0.48], [0.7, 0.52], [0.46, 0.97], [-0.98, 1.0], [-1, 0.96], [-1, 0.28]], ws: [0.7, 0.46], rw: [-2, -2], belt: [0.52, 0.52], tumble: 0.92, bpillar: 0.3, cargo: true },
  sports: { top: [[1, 0.36], [0.985, 0.52], [0.6, 0.6], [0.25, 0.68], [-0.02, 0.98], [-0.3, 1.0], [-0.55, 0.87], [-0.85, 0.78], [-1, 0.72], [-1, 0.38]], ws: [0.25, -0.02], rw: [-0.3, -0.55], belt: [0.67, 0.74], tumble: 0.74, bpillar: -0.18, spoiler: true },
  super: { top: [[1, 0.32], [0.985, 0.47], [0.55, 0.6], [0.3, 0.69], [0.02, 0.98], [-0.25, 1.0], [-0.6, 0.86], [-0.9, 0.79], [-1, 0.74], [-1, 0.37]], ws: [0.3, 0.02], rw: [-0.25, -0.6], belt: [0.68, 0.76], tumble: 0.7, bpillar: -0.12, spoiler: true },
  muscle: { top: [[1, 0.42], [0.985, 0.6], [0.55, 0.68], [0.3, 0.72], [0.05, 0.98], [-0.35, 1.0], [-0.55, 0.83], [-0.75, 0.74], [-0.97, 0.73], [-1, 0.64], [-1, 0.42]], ws: [0.3, 0.05], rw: [-0.35, -0.55], belt: [0.71, 0.74], tumble: 0.78, bpillar: -0.15 },
  pickup: { top: [[1, 0.37], [0.98, 0.55], [0.7, 0.61], [0.45, 0.63], [0.25, 0.97], [-0.12, 0.99], [-0.18, 0.92], [-0.2, 0.64], [-1, 0.63], [-1, 0.35]], ws: [0.45, 0.25], rw: [-0.12, -0.18], belt: [0.63, 0.63], tumble: 0.86, bpillar: 9, bed: true },
};

export const MODELS = {
  compacto: { name: 'Pulga 1.4', style: 'hatch', L: 4.05, W: 1.76, H: 1.46, wb: 2.56, wr: 0.31, clear: 0.15, mass: 1050, accel: 8.6, top: 42, grip: 9, steer: 0.62, brake: 18, hp: 800, engine: 'car', price: 9500, cls: 'Compacto', doors: [0.95, -0.05], rim: 'aero' },
  sedan: { name: 'Delta GL', style: 'sedan', L: 4.86, W: 1.87, H: 1.44, wb: 2.82, wr: 0.335, clear: 0.14, mass: 1400, accel: 9.6, top: 47, grip: 9.4, steer: 0.58, brake: 19, hp: 1000, engine: 'car', price: 18000, cls: 'Sedán', doors: [1.05, 0.0, -1.0], rim: 'twin5' },
  taxi: { name: 'Delta Taxi', style: 'sedan', L: 4.86, W: 1.87, H: 1.44, wb: 2.82, wr: 0.335, clear: 0.14, mass: 1420, accel: 9.6, top: 46, grip: 9.4, steer: 0.58, brake: 19, hp: 1000, engine: 'car', price: 15000, cls: 'Servicio', fixedColor: 0xf2bf0a, roofSign: true, doors: [1.05, 0.0, -1.0], rim: 'steel' },
  patrulla: { name: 'Interceptor', style: 'sedan', L: 4.86, W: 1.87, H: 1.44, wb: 2.82, wr: 0.335, clear: 0.14, mass: 1650, accel: 13.5, top: 64, grip: 10.5, steer: 0.6, brake: 23, hp: 1500, engine: 'sports', price: 0, cls: 'Emergencia', fixedColor: 0xf4f4f2, livery: 'police', lightbar: true, pushbar: true, doors: [1.05, 0.0, -1.0], rim: 'steel' },
  suv: { name: 'Cóndor 4x4', style: 'suv', L: 4.8, W: 1.96, H: 1.73, wb: 2.86, wr: 0.375, clear: 0.215, mass: 2100, accel: 9.2, top: 45, grip: 8.6, steer: 0.55, brake: 18, hp: 1300, engine: 'car', price: 32000, cls: 'SUV', doors: [1.1, 0.0, -1.05], rim: 'offroad6' },
  furgon: { name: 'Carga Van', style: 'van', L: 5.25, W: 2.0, H: 2.29, wb: 3.3, wr: 0.355, clear: 0.22, mass: 2600, accel: 6.6, top: 37, grip: 7.6, steer: 0.52, brake: 15, hp: 1500, engine: 'truck', price: 21000, cls: 'Utilitario', doors: [1.5, 0.55], rim: 'steel' },
  pickup: { name: 'Ranchera', style: 'pickup', L: 5.25, W: 1.96, H: 1.81, wb: 3.2, wr: 0.385, clear: 0.24, mass: 2000, accel: 9, top: 46, grip: 8.6, steer: 0.53, brake: 17, hp: 1300, engine: 'truck', price: 26000, cls: 'Utilitario', doors: [1.35, 0.35], rim: 'offroad6' },
  muscle: { name: 'Bravo V8', style: 'muscle', L: 4.9, W: 1.94, H: 1.33, wb: 2.85, wr: 0.355, clear: 0.135, mass: 1600, accel: 13, top: 65, grip: 8.4, steer: 0.55, brake: 20, hp: 1100, engine: 'sports', price: 45000, cls: 'Muscle', doors: [0.95, -0.25], rim: 'deep5' },
  deportivo: { name: 'Rayo GT', style: 'sports', L: 4.46, W: 1.96, H: 1.24, wb: 2.6, wr: 0.345, clear: 0.115, mass: 1320, accel: 15.5, top: 73, grip: 11.5, steer: 0.55, brake: 24, hp: 900, engine: 'sports', price: 95000, cls: 'Deportivo', doors: [0.75, -0.4], rim: 'mesh' },
  superauto: { name: 'Vortex X', style: 'super', L: 4.6, W: 2.03, H: 1.13, wb: 2.7, wr: 0.35, clear: 0.1, mass: 1350, accel: 19.5, top: 87, grip: 12.5, steer: 0.52, brake: 27, hp: 900, engine: 'sports', price: 320000, cls: 'Superauto', doors: [0.7, -0.45], rim: 'multi10' },
  moto: { name: 'Libélula 600', style: 'bike', L: 2.15, W: 0.78, H: 1.15, wb: 1.42, wr: 0.32, clear: 0.12, mass: 230, accel: 14, top: 66, grip: 10.5, steer: 0.7, brake: 22, hp: 450, engine: 'bike', price: 16000, cls: 'Moto', bike: true, rim: 'multi10' },
};

export const PAINTS = [0x101418, 0xf2f2f0, 0x8c9399, 0x2b3a55, 0x7a1d1d, 0x1e4d3a, 0xc9c2b2, 0x0e3f73, 0xb83a1f, 0x5b5f66, 0x3a2e28, 0x9fb7c9, 0xe0a91b, 0x1b1b1b, 0x6d1a4a, 0x2f6f73];
// Pinturas metalizadas (el resto son sólidas): plata, grafito, azules, verdes, bordó, champán
export const METALLIC = new Set([0x8c9399, 0x2b3a55, 0x1e4d3a, 0xc9c2b2, 0x0e3f73, 0x5b5f66, 0x3a2e28, 0x9fb7c9, 0x6d1a4a, 0x2f6f73, 0x101418, 0x14306e, 0xb8b9ba]);

function interp(points, zn) {
  // Catmull-Rom monótono sobre una lista [z, y] ordenada de mayor a menor z
  const P = points;
  if (zn >= P[0][0]) return P[0][1];
  if (zn <= P[P.length - 1][0]) return P[P.length - 1][1];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (zn <= a[0] && zn >= b[0]) {
      const t = (a[0] - zn) / (a[0] - b[0] || 1e-6);
      const p0 = P[Math.max(0, i - 1)], p3 = P[Math.min(P.length - 1, i + 2)];
      const m1 = (b[1] - p0[1]) * 0.5, m2 = (p3[1] - a[1]) * 0.5;
      const t2 = t * t, t3 = t2 * t;
      let y = (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * m2;
      const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
      return Math.min(hi + 0.02, Math.max(lo - 0.02, y));
    }
  }
  return P[P.length - 1][1];
}

const FLARE = { muscle: 0.05, sports: 0.045, super: 0.05, suv: 0.035, pickup: 0.035, sedan: 0.02, hatch: 0.025, van: 0.01 };

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function addBox(list, w, h, d, x, y, z, rx = 0, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  list.push(g.index ? g.toNonIndexed() : g);
}
function addCyl(list, r, h, x, y, z, axis = 'x', seg = 10) {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  list.push(g.index ? g.toNonIndexed() : g);
}
function mergeOrEmpty(list) {
  if (!list.length) return null;
  const norm = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  const hasColor = norm.some((g) => g.attributes.color);
  if (hasColor) for (const g of norm) if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return mergeGeometries(norm);
}
function tint(g, c) {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * Oclusión ambiental precalculada por vértice (atributo aAO, 0..1): cerca del piso, en los arcos
 * de rueda y dentro del habitáculo. Sólo atenúa la luz indirecta (cielo y reflejos) en el shader.
 */
function bakeAO(geo, ctx) {
  if (!geo) return;
  const pos = geo.attributes.position;
  const ao = new Float32Array(pos.count);
  const { clear, wheelZ, wr, arch, W, cabinZ, ringAt } = ctx;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // suelo: la parte baja ve menos cielo y más asfalto
    let a = 0.42 + 0.58 * smooth(clear - 0.02, clear + 0.55, y);
    // arcos de rueda: el labio y el interior quedan en penumbra
    for (const wz of wheelZ) {
      const d = Math.hypot(z - wz, y - wr);
      if (d < arch + 0.22 && Math.abs(x) > W / 2 - 0.42) a *= 0.32 + 0.68 * smooth(arch - 0.12, arch + 0.22, d);
    }
    // habitáculo: espacio cerrado
    if (cabinZ && z > cabinZ[0] - 0.05 && z < cabinZ[1] + 0.05) {
      const r = ringAt(z);
      if (r && r.c > 0.4 && Math.abs(x) < r.hw * 0.86 && y > r.yb + 0.04 && y < r.yt - 0.03) a *= 0.55 + 0.25 * smooth(r.yb, r.yt, y);
    }
    ao[i] = a;
  }
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}

/** AO de una moto: sólo suelo y ruedas. */
function bakeAOBike(geo, wheels) {
  if (!geo) return;
  const pos = geo.attributes.position;
  const ao = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    let a = 0.5 + 0.5 * smooth(0.1, 0.7, y);
    for (const w of wheels) {
      const d = Math.hypot(z - w.z, y - w.y);
      if (d < w.r + 0.15) a *= 0.6 + 0.4 * smooth(w.r - 0.1, w.r + 0.15, d);
    }
    ao[i] = a;
  }
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}

/** AO por vértice para modelos importados de Blender: suelo y arcos de rueda. */
function bakeAOAsset(geo, spec) {
  if (!geo || geo.attributes.aAO) return;
  const pos = geo.attributes.position;
  const ao = new Float32Array(pos.count);
  const archR = spec.wr + 0.05, W = spec.W, clear = spec.clear;
  const wz = [spec.wb / 2, -spec.wb / 2];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let a = 0.45 + 0.55 * smooth(clear - 0.02, clear + 0.55, y);
    for (const w of wz) {
      const d = Math.hypot(z - w, y - spec.wr);
      if (d < archR + 0.22 && Math.abs(x) > W / 2 - 0.45) a *= 0.32 + 0.68 * smooth(archR - 0.12, archR + 0.22, d);
    }
    ao[i] = a;
  }
  geo.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
}

/** Estructura de partes a partir de un modelo de Blender (ver carAssets.js). */
export function assetGeometry(asset, spec) {
  const g = asset.geo, m = asset.meta;
  const parts = (s) => {
    bakeAOAsset(s.paint, spec);
    bakeAOAsset(s.trim, spec);
    return {
      paint: s.paint, trim: s.trim, glass: s.glass || null, lens: s.lens || null, chrome: s.chrome || null,
      head: s.head || null, drl: s.drl || null, tail: s.tail || null, extra: s.extra || null,
      blinkL: s.blinkL || null, blinkR: s.blinkR || null,
    };
  };
  return {
    ...parts(g),
    // nivel de detalle lejano (también proyecta las sombras de los autos lejanos)
    lo: g.lo ? parts(g.lo) : null,
    // Blender: +X = derecha → juego: +x = izquierda
    wheels: m.wheels.map((w) => ({ ...w, x: -w.x, side: -w.side })),
    seat: m.seat, height: m.height, noHood: false,
    hood: [99, -99, 0, 0],
    plates: m.plates,
    fromAsset: true,
  };
}

/** Altura de la cadera del conductor: baja en autos bajos para que la cabeza no toque el techo. */
function seatHipOf(spec) {
  const base = spec.style === 'van' || spec.style === 'suv' || spec.style === 'pickup' ? 0.55 : 0.36;
  return Math.max(spec.clear + 0.12, Math.min(spec.clear + base, spec.H - 0.95));
}

/** Construye la geometría de un auto. Devuelve partes y metadatos. */
export function buildCar(spec) {
  const S = STYLES[spec.style];
  const L = spec.L, W = spec.W, H = spec.H;
  const hz = L / 2;
  const NZ = 60, HALF = 9;
  const wheelZ = [spec.wb / 2, -spec.wb / 2];
  const wr = spec.wr, arch = wr + 0.06;
  const clear = spec.clear;
  const yAt = (zn) => interp(S.top, zn) * H;
  const beltAt = (zn) => Math.min(yAt(zn), (S.belt[1] + (S.belt[0] - S.belt[1]) * (zn + 1) / 2) * H);
  const hwAt = (zn, y) => {
    // en planta el auto es romo: mantiene el ancho y redondea sólo los últimos ~25 cm
    const end = Math.max(0, (Math.abs(zn) - 0.89) / 0.11);
    let k = Math.sqrt(Math.max(0.0, 1 - end * end * 0.45));
    k *= 1 - 0.04 * smooth(0.3, 1, Math.abs(zn));
    return (W / 2) * k;
  };
  const inCabin = (zn) => smooth(S.ws[0] + 0.04, S.ws[0] - 0.02, zn) * smooth(S.rw[1] - 0.04, S.rw[1] + 0.02, zn);
  // anillos
  const rings = [];
  for (let i = 0; i <= NZ; i++) {
    const zn = -1 + (2 * i) / NZ;
    const z = zn * hz;
    let yb = clear + 0.04 * smooth(0.75, 1, Math.abs(zn));
    for (const wz of wheelZ) {
      const dz = z - wz;
      if (Math.abs(dz) < arch) yb = Math.max(yb, wr + Math.sqrt(arch * arch - dz * dz) * 0.92);
    }
    let yt = yAt(zn);
    // trompa y cola redondeadas: las últimas secciones se cierran en altura (y en ancho vía hwAt)
    const endR = smooth(0.92, 1.0, Math.abs(zn));
    if (endR > 0) {
      const span = yt - yb;
      yt -= endR * endR * span * 0.16;
      yb += endR * endR * span * 0.12;
    }
    const yB = Math.max(yb + 0.12, beltAt(zn));
    const hw = hwAt(zn, yB) * (1 - endR * endR * 0.12);
    const c = inCabin(zn) * smooth(0.1, 0.25, yt - yB);
    const tw = hw * S.tumble;
    // guardabarros ensanchados sobre las ruedas (más marcados en deportivos y todoterrenos)
    let flare = 0;
    for (const wz of wheelZ) flare = Math.max(flare, Math.exp(-Math.pow((z - wz) / (arch * 1.15), 2) * 2));
    flare *= FLARE[spec.style] ?? 0.02;
    // línea de hombro: el punto más ancho del lateral queda alto, marcando un reflejo a lo largo
    const sh = yb + (yB - yb) * 0.64;
    const low = [[0, yb], [hw * 0.9 * (1 + flare * 0.5), yb], [hw * 0.985 * (1 + flare), yb + 0.1], [hw * 1.013 * (1 + flare * 0.9), sh], [hw * 0.982 * (1 + flare * 0.25), yB]];
    const cabinPts = [...low, [tw * 1.04, yB + (yt - yB) * 0.55], [tw, yt - 0.055], [tw * 0.55, yt - 0.008], [0, yt]];
    const flatPts = [...low, [hw * 0.965, Math.min(yt, yB) - 0.0 + (yt - yB) * 0.3], [hw * 0.9, yt - 0.03], [hw * 0.5, yt - 0.005], [0, yt]];
    const pts = cabinPts.map((p, k) => [p[0] * c + flatPts[k][0] * (1 - c), p[1] * c + flatPts[k][1] * (1 - c)]);
    rings.push({ zn, z, pts, c, yb, yB, yt, hw });
  }
  // vértices de la malla (mitad derecha x>=0 y espejo)
  const ringVerts = rings.map((r) => {
    const v = [];
    for (let k = 0; k < HALF; k++) v.push([r.pts[k][0], r.pts[k][1], r.z]);
    for (let k = HALF - 2; k >= 1; k--) v.push([-r.pts[k][0], r.pts[k][1], r.z]);
    return v;
  });
  const RV = ringVerts[0].length; // 16
  const P = (i, k) => ringVerts[i][(k + RV) % RV];
  // normales por diferencias finitas
  const nrm = (i, k) => {
    const a = P(Math.min(NZ, i + 1), k), b = P(Math.max(0, i - 1), k);
    const c = P(i, k + 1), d = P(i, k - 1);
    const dz = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dt = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    let n = [dt[1] * dz[2] - dt[2] * dz[1], dt[2] * dz[0] - dt[0] * dz[2], dt[0] * dz[1] - dt[1] * dz[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    return [n[0] / l, n[1] / l, n[2] / l];
  };
  const paint = { p: [], n: [] }, trim = { p: [], n: [] }, glass = { p: [], n: [] };
  const pushTri = (buf, a, b, c, na, nb, nc) => {
    buf.p.push(...a, ...b, ...c);
    buf.n.push(...na, ...nb, ...nc);
  };
  const quad = (buf, i, k, off = 0) => {
    const a = P(i, k), b = P(i + 1, k), c = P(i + 1, k + 1), d = P(i, k + 1);
    const na = nrm(i, k), nb = nrm(i + 1, k), nc = nrm(i + 1, k + 1), nd = nrm(i, k + 1);
    const o = (p, n) => [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off];
    // orden antihorario visto desde afuera (cara frontal hacia el exterior)
    if (off) {
      pushTri(buf, o(a, na), o(c, nc), o(b, nb), na, nc, nb);
      pushTri(buf, o(a, na), o(d, nd), o(c, nc), na, nd, nc);
    } else {
      pushTri(buf, a, c, b, na, nc, nb);
      pushTri(buf, a, d, c, na, nd, nc);
    }
  };
  // Vidrios: bandas del anillo 4-5 / 10-11 laterales, 6-9 techo/parabrisas. Debajo no hay chapa:
  // a través del vidrio se ve el habitáculo.
  const sideRear = Math.max(S.rw[0], S.rw[1] + 0.06);
  const glassCell = new Set();
  for (let i = 0; i < NZ; i++) {
    if (rings[i].c < 0.5 || rings[i + 1].c < 0.5) continue;
    const zm = (rings[i].zn + rings[i + 1].zn) / 2;
    const ws = zm <= S.ws[0] - 0.015 && zm >= S.ws[1] + 0.01;
    const rw = zm <= S.rw[0] - 0.01 && zm >= S.rw[1] + 0.015;
    let side = zm < S.ws[0] - 0.06 && zm > sideRear && Math.abs(zm - S.bpillar) > 0.035;
    if (S.cargo) side = zm < S.ws[0] - 0.06 && zm > 0.22;
    if (ws || rw) for (const k of [6, 7, 8, 9]) glassCell.add(i * RV + k);
    if (side) for (const k of [4, 5, 10, 11]) glassCell.add(i * RV + k);
  }
  // Bandas: k=0..1 (fondo) y espejo → trim; resto → pintura (salvo donde hay vidrio)
  const isTrimBand = (k) => k <= 1 || k >= RV - 2;
  for (let i = 0; i < NZ; i++)
    for (let k = 0; k < RV; k++) {
      if (glassCell.has(i * RV + k)) {
        quad(glass, i, k);
        continue;
      }
      quad(isTrimBand(k) ? trim : paint, i, k);
    }
  // Habitáculo: carcasa interna (orientada hacia adentro), mamparas, butacas, tablero y volante
  const cabin = { p: [], n: [] }, headliner = { p: [], n: [] };
  let iRear = -1, iFront = -1;
  for (let i = 0; i <= NZ; i++) if (rings[i].c >= 0.5) {
    if (iRear < 0) iRear = i;
    iFront = i;
  }
  const interiorParts = [];
  if (iRear >= 0 && iFront > iRear) {
    const IN = 0.04;
    const PI_ = (i, k) => {
      const q = P(i, k), n = nrm(i, k);
      return [q[0] - n[0] * IN, q[1] - n[1] * IN, q[2] - n[2] * IN];
    };
    const NI = (i, k) => {
      const n = nrm(i, k);
      return [-n[0], -n[1], -n[2]];
    };
    for (let i = iRear; i < iFront; i++)
      for (let k = 0; k < RV; k++) {
        if (glassCell.has(i * RV + k)) continue; // detrás del vidrio: se ve hacia afuera y entra la luz
        const buf = k >= 6 && k <= 9 ? headliner : cabin;
        const a = PI_(i, k), b = PI_(i + 1, k), c = PI_(i + 1, k + 1), d = PI_(i, k + 1);
        pushTri(buf, a, b, c, NI(i, k), NI(i + 1, k), NI(i + 1, k + 1));
        pushTri(buf, a, c, d, NI(i, k), NI(i + 1, k + 1), NI(i, k + 1));
      }
    // mampara delantera (mira hacia atrás) y trasera (mira hacia adelante)
    for (const [ri, dir] of [[iFront, -1], [iRear, 1]]) {
      const ring = [];
      for (let k = 0; k < RV; k++) ring.push(PI_(ri, k));
      const cen = [0, ring.reduce((t, v) => t + v[1], 0) / RV, ring.reduce((t, v) => t + v[2], 0) / RV];
      const nz = [0, 0, dir];
      for (let k = 0; k < RV; k++) {
        const a = ring[k], b = ring[(k + 1) % RV];
        if (dir < 0) pushTri(cabin, cen, b, a, nz, nz, nz);
        else pushTri(cabin, cen, a, b, nz, nz, nz);
      }
    }
    const seatHip = seatHipOf(spec);
    const seatZ = S.ws[0] * hz - 0.95;
    const seats = [];
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.22;
      addBox(seats, 0.5, 0.13, 0.5, x, seatHip - 0.05, seatZ + 0.02);
      addBox(seats, 0.48, 0.6, 0.12, x, seatHip + 0.27, seatZ - 0.27, -0.2);
      addBox(seats, 0.24, 0.17, 0.1, x, seatHip + 0.68, seatZ - 0.35, -0.12);
    }
    const twoSeater = spec.style === 'sports' || spec.style === 'super' || S.cargo || S.bed;
    const rearZ = seatZ - 0.92;
    if (!twoSeater && rearZ - 0.3 > rings[iRear].z) {
      addBox(seats, W * 0.76, 0.13, 0.48, 0, seatHip - 0.03, rearZ);
      addBox(seats, W * 0.76, 0.55, 0.12, 0, seatHip + 0.25, rearZ - 0.28, -0.22);
    }
    for (const g of seats) interiorParts.push(tint(g, spec.livery === 'police' ? 0x1b1c1f : 0x2a2622));
    // tablero bajo el parabrisas y volante frente al conductor
    const dashZ = rings[iFront].z - 0.24;
    const dashY = Math.min(beltAt(S.ws[0]), yAt(S.ws[0])) - 0.1;
    const dash = [];
    addBox(dash, W * 0.84, 0.2, 0.46, 0, dashY, dashZ);
    interiorParts.push(tint(mergeOrEmpty(dash), 0x161719));
    const wheelG = new THREE.TorusGeometry(0.17, 0.022, 5, 16);
    wheelG.rotateX(-0.35);
    wheelG.translate(W * 0.22, seatHip + 0.4, seatZ + 0.52);
    interiorParts.push(tint(wheelG.toNonIndexed(), 0x111214));
    const col = new THREE.CylinderGeometry(0.03, 0.03, 0.34, 6);
    col.rotateX(Math.PI / 2 - 0.35);
    col.translate(W * 0.22, seatHip + 0.34, seatZ + 0.68);
    interiorParts.push(tint(col.toNonIndexed(), 0x111214));
  }
  // Tapas delantera y trasera
  for (const end of [0, NZ]) {
    const ring = ringVerts[end];
    const cy = ring.reduce((s, v) => s + v[1], 0) / RV;
    const cz = ring[0][2];
    const cen = [0, cy, cz];
    const nz = end === 0 ? [0, 0, -1] : [0, 0, 1];
    for (let k = 0; k < RV; k++) {
      const a = ring[k], b = ring[(k + 1) % RV];
      // frente y cola del color de la carrocería (el faldón negro se agrega aparte)
      if (end === 0) pushTri(paint, cen, b, a, nz, nz, nz);
      else pushTri(paint, cen, a, b, nz, nz, nz);
    }
  }
  const toGeo = (buf) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(buf.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.n, 3));
    return g;
  };
  const paintParts = [toGeo(paint)];
  const trimParts = [tint(toGeo(trim), 0x16181b)];
  if (cabin.p.length) trimParts.push(tint(toGeo(cabin), 0x1e1f22));
  if (headliner.p.length) trimParts.push(tint(toGeo(headliner), 0x5c5953));
  trimParts.push(...interiorParts);
  const chromeParts = [];
  const headParts = [];
  const blinkL = [], blinkR = [];
  const tailParts = [];
  const extraParts = [];
  const r0 = rings[NZ], rEnd = rings[0];
  const frontY = yAt(0.96);
  // Ópticas, espejos, manijas y molduras
  const sporty = spec.style === 'muscle' || spec.style === 'sports' || spec.style === 'super';
  const glassBox = (w, h, d, x, y, z, rx = 0, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const n = g.toNonIndexed();
    const pa = n.attributes.position, na = n.attributes.normal;
    for (let i = 0; i < pa.count; i++) {
      glass.p.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      glass.n.push(na.getX(i), na.getY(i), na.getZ(i));
    }
  };
  for (const s of [-1, 1]) {
    // --- faro: carcasa cromada (reflector), proyector y tira LED (emisivos), lente transparente
    const hwF = hwAt(0.96, frontY);
    const thin = spec.style === 'sports' || spec.style === 'super';
    const hW = thin ? 0.38 : spec.style === 'van' ? 0.3 : 0.34, hH = thin ? 0.07 : 0.12;
    const hx = s * hwF * 0.64, hy = frontY - (thin ? 0.05 : 0.085), hzz = hz * 0.968;
    const tilt = thin ? 0.42 : 0.22;
    addBox(chromeParts, hW, hH, 0.09, hx, hy, hzz, tilt, s * -0.12);
    addBox(trimParts, hW + 0.02, hH + 0.02, 0.05, hx, hy, hzz - 0.04, tilt, s * -0.12);
    const proj = new THREE.CylinderGeometry(0.036, 0.04, 0.03, 14);
    proj.rotateX(Math.PI / 2);
    proj.translate(hx + s * hW * 0.24, hy + 0.003, hzz + 0.04);
    headParts.push(proj.toNonIndexed());
    if (!thin) {
      const proj2 = proj.clone();
      proj2.translate(-s * hW * 0.36, 0, 0);
      headParts.push(proj2.toNonIndexed());
    }
    addBox(headParts, hW * 0.86, 0.014, 0.012, hx, hy - hH * 0.36, hzz + 0.045, tilt, s * -0.12);
    glassBox(hW + 0.015, hH + 0.012, 0.016, hx, hy, hzz + 0.052, tilt, s * -0.12);
    // intermitente delantero (ámbar) en el extremo exterior del faro, envolviendo la esquina
    const bl = s > 0 ? blinkL : blinkR;
    addBox(bl, 0.07, hH * 0.55, 0.06, hx + s * (hW * 0.5 + 0.02), hy - hH * 0.1, hzz + 0.01, tilt, s * -0.35);
    // --- piloto trasero: bloque emisivo principal, segmento interior y reflector de marcha atrás
    const rearY = yAt(-0.97);
    const hwR = hwAt(-0.97, rearY);
    const van = spec.style === 'van';
    const tW = van ? 0.13 : sporty ? 0.42 : 0.36, tH = van ? 0.42 : 0.095;
    const tx = s * hwR * (van ? 0.86 : 0.7), ty = rearY - (van ? 0.6 : 0.085), tz = -hz * 0.988;
    // carcasa interior oscura y segmentos LED (el bloque principal envuelve la esquina)
    addBox(trimParts, tW + 0.03, tH + 0.02, 0.05, tx, ty, tz + 0.012);
    if (!van) {
      for (let k = 0; k < 5; k++) addBox(tailParts, tW * 0.17, tH * 0.62, 0.05, tx + s * tW * (0.38 - k * 0.19), ty + tH * 0.08, tz - 0.004);
      addBox(tailParts, tW * 0.96, tH * 0.16, 0.05, tx, ty - tH * 0.36, tz - 0.004);
      // envolvente lateral
      const wrap = new THREE.BoxGeometry(0.05, tH * 0.8, 0.14);
      wrap.translate(s * (hwR * 0.985), ty, tz + 0.06);
      tailParts.push(wrap.toNonIndexed());
      addBox(tailParts, tW * 0.5, tH * 0.32, 0.05, tx - s * tW * 0.66, ty + tH * 0.18, tz + 0.004);
    } else addBox(tailParts, tW, tH, 0.06, tx, ty, tz);
    addBox(chromeParts, van ? 0.1 : 0.09, van ? 0.08 : 0.05, 0.03, tx - s * (van ? 0 : tW * 0.28), ty - (van ? tH * 0.36 : tH * 0.15), tz - 0.022);
    glassBox(tW + 0.012, tH + 0.012, 0.012, tx, ty, tz - 0.034);
    // intermitente trasero dentro del grupo óptico (extremo exterior)
    addBox(s > 0 ? blinkL : blinkR, van ? 0.11 : tW * 0.2, van ? 0.09 : tH * 0.5, 0.05, tx + s * (van ? 0 : tW * 0.38), ty + (van ? tH * 0.36 : -tH * 0.05), tz - 0.012);
    // --- espejo: brazo, carcasa del color del auto y vidrio
    const mz = (S.ws[0] - 0.035) * hz;
    const my = beltAt(S.ws[0]) + 0.075;
    const mxIn = hwAt(S.ws[0], my);
    addBox(trimParts, 0.1, 0.035, 0.07, s * (mxIn + 0.045), my - 0.02, mz + 0.02);
    const housing = new THREE.SphereGeometry(0.5, 14, 10);
    housing.scale(0.2, 0.115, 0.13);
    housing.translate(s * (mxIn + 0.12), my + 0.02, mz);
    paintParts.push(housing.toNonIndexed());
    addBox(chromeParts, 0.15, 0.08, 0.01, s * (mxIn + 0.12), my + 0.02, mz - 0.062);
    // --- manijas de puerta (cromo en autos medianos y grandes, negras en los chicos)
    const seams = spec.doors || [];
    const handleBuf = spec.style === 'hatch' || S.cargo ? trimParts : chromeParts;
    for (let d = 1; d < seams.length; d++) {
      const hz2 = (seams[d] + 0.2) * 1; // por delante de la línea trasera de cada puerta
      const zn2 = hz2 / hz;
      const hy2 = beltAt(zn2) - 0.075;
      addBox(handleBuf, 0.022, 0.03, 0.16, s * (hwAt(zn2, hy2) + 0.012), hy2, hz2);
    }
    if (seams.length === 2 || S.cargo) {
      const hz2 = (seams[seams.length - 1] + 0.2);
      const zn2 = hz2 / hz;
      const hy2 = beltAt(zn2) - 0.075;
      addBox(handleBuf, 0.022, 0.03, 0.16, s * (hwAt(zn2, hy2) + 0.012), hy2, hz2);
    }
    // escape (doble en deportivos, simple del lado derecho en el resto)
    if (spec.style !== 'van' && (sporty || s < 0)) addCyl(chromeParts, sporty ? 0.05 : 0.04, 0.16, s * (sporty ? 0.45 : 0.5), clear + 0.08, -hz - 0.02, 'z', 10);
  }
  // Moldura negra bajo las ventanillas laterales (línea de cintura)
  for (let i = 0; i < NZ; i++) {
    for (const [kb, kd] of [[4, 3], [RV - 4, RV - 3]]) {
      const band = kb === 4 ? 4 : RV - 5;
      if (!glassCell.has(i * RV + band)) continue;
      const a = P(i, kb), b = P(i + 1, kb);
      const na = nrm(i, kb), nb = nrm(i + 1, kb);
      const o = (p, n, dy) => [p[0] + n[0] * 0.004, p[1] + dy, p[2] + n[2] * 0.004];
      const a2 = o(a, na, -0.03), b2 = o(b, nb, -0.03), a1 = o(a, na, 0.004), b1 = o(b, nb, 0.004);
      if (kb === 4) {
        pushTri(trim, a2, b2, b1, na, nb, nb);
        pushTri(trim, a2, b1, a1, na, nb, na);
      } else {
        pushTri(trim, a2, b1, b2, na, nb, nb);
        pushTri(trim, a2, a1, b1, na, na, nb);
      }
    }
  }
  // Guardabarros interiores: medio tubo oscuro sobre cada rueda (se ve por el hueco del arco)
  for (const wz of wheelZ)
    for (const sx of [-1, 1]) {
      const liner = new THREE.CylinderGeometry(arch + 0.03, arch + 0.03, 0.42, 16, 1, true, -Math.PI * 0.04, Math.PI * 1.08);
      liner.rotateZ(Math.PI / 2);
      liner.scale(-1, 1, 1); // caras hacia adentro del tubo (visibles desde la rueda)
      liner.translate(sx * (W / 2 - 0.25), wr, wz);
      const li = liner.toNonIndexed();
      const n = li.attributes.normal;
      for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
      trimParts.push(tint(li, 0x0b0b0c));
    }
  // Faldones inferiores negros delante y detrás (sobre la tapa del paragolpes)
  for (const end of [0, NZ]) {
    const r = rings[end];
    const sgn = end === 0 ? -1 : 1;
    addBox(trimParts, r.hw * 2 * 0.96, 0.1, 0.05, 0, r.yb + 0.05, r.z + sgn * 0.012);
  }
  // Parrilla con lamas y toma inferior
  const gy = frontY - 0.2;
  addBox(trimParts, W * 0.44, 0.15, 0.04, 0, gy, hz * 0.985);
  for (let k = 0; k < 4; k++) addBox(chromeParts, W * 0.42, 0.012, 0.02, 0, gy - 0.055 + k * 0.037, hz * 0.985 + 0.022);
  addBox(trimParts, W * 0.56, 0.07, 0.04, 0, clear + 0.12, hz * 0.975);
  // portapatentes (la patente con su número es una instancia aparte con textura)
  const plateF = { x: 0, y: clear + 0.22, z: hz + 0.012, front: true };
  const plateR = { x: 0, y: yAt(-0.98) - 0.25, z: -hz - 0.012, front: false };
  addBox(trimParts, 0.45, 0.13, 0.016, 0, plateF.y, hz + 0.002);
  addBox(trimParts, 0.45, 0.13, 0.016, 0, plateR.y, -hz - 0.002);
  // Extras por estilo
  if (S.spoiler) {
    const sy = yAt(-0.9) + 0.18;
    addBox(paintParts, W * 0.86, 0.04, 0.26, 0, sy, -hz * 0.9);
    for (const s of [-1, 1]) addBox(trimParts, 0.05, 0.18, 0.12, s * W * 0.3, sy - 0.09, -hz * 0.9);
  }
  if (S.bed) {
    const zb0 = -0.2 * hz, zb1 = -hz, yb = 0.63 * H;
    for (const s of [-1, 1]) addBox(paintParts, 0.06, 0.32, zb0 - zb1, s * (W / 2 - 0.05), yb + 0.14, (zb0 + zb1) / 2);
    addBox(paintParts, W - 0.1, 0.32, 0.06, 0, yb + 0.14, zb1 + 0.03);
    addBox(trimParts, W - 0.16, 0.04, zb0 - zb1, 0, yb - 0.01, (zb0 + zb1) / 2);
  }
  if (spec.roofSign) {
    const ry = yAt(-0.2) + 0.12;
    addBox(extraParts, 0.62, 0.2, 0.26, 0, ry, -0.2 * hz);
  }
  if (spec.lightbar) {
    const ry = yAt(-0.15) + 0.07;
    addBox(trimParts, 1.2, 0.05, 0.28, 0, ry - 0.03, -0.15 * hz);
    addBox(extraParts, 0.56, 0.1, 0.22, -0.31, ry + 0.04, -0.15 * hz);
    addBox(extraParts, 0.56, 0.1, 0.22, 0.31, ry + 0.04, -0.15 * hz);
  }
  if (spec.pushbar) {
    addBox(trimParts, W * 0.7, 0.07, 0.07, 0, clear + 0.35, hz + 0.12);
    addBox(trimParts, W * 0.7, 0.07, 0.07, 0, clear + 0.6, hz + 0.12);
    for (const s of [-1, 1]) addBox(trimParts, 0.06, 0.4, 0.2, s * W * 0.3, clear + 0.45, hz + 0.05);
  }
  if (spec.livery === 'police') {
    // franja azul y puertas: se resuelven en el shader con uLivery
  }
  const wheels = [];
  const track = W / 2 - 0.12;
  for (const wz of wheelZ) for (const s of [-1, 1]) wheels.push({ x: s * track, y: wr, z: wz, r: wr, w: 0.24 + (spec.style === 'super' || spec.style === 'sports' ? 0.06 : 0), front: wz > 0, side: s });
  // las piezas de moldura sin color propio son plástico negro satinado
  const paintGeo = mergeOrEmpty(paintParts), trimGeo = mergeOrEmpty(trimParts.map((g) => (g.attributes.color ? g : tint(g.index ? g.toNonIndexed() : g, 0x131416))));
  const cabinZ = iRear >= 0 ? [rings[iRear].z, rings[iFront].z] : [0, 0];
  const ringAt = (z) => rings[Math.max(0, Math.min(NZ, Math.round((z / hz + 1) * NZ / 2)))];
  const aoCtx = { clear, wheelZ, wr, arch, W, cabinZ, ringAt };
  bakeAO(paintGeo, aoCtx);
  bakeAO(trimGeo, aoCtx);
  return {
    paint: paintGeo,
    trim: trimGeo,
    glass: toGeo(glass),
    chrome: mergeOrEmpty(chromeParts),
    head: mergeOrEmpty(headParts),
    tail: mergeOrEmpty(tailParts),
    extra: mergeOrEmpty(extraParts),
    wheels,
    seat: { x: W * 0.22, hip: seatHipOf(spec), z: S.ws[0] * hz - 0.95 },
    height: yAt(0) + 0.02,
    noHood: false,
    // líneas de capó y baúl para el shader: [inicio capó z, fin baúl z, x de la línea, límite z]
    hood: [S.ws[0] * hz, S.cargo || S.bed ? -99 : S.rw[1] * hz, W * 0.355, hz * 0.94],
    plates: [plateF, plateR],
    blinkL: mergeOrEmpty(blinkL),
    blinkR: mergeOrEmpty(blinkR),
  };
}

/** Moto: cuadro, tanque, asiento, horquilla y escape. */
export function buildBike(spec) {
  const paint = [], trim = [], chrome = [], head = [], tail = [];
  const wb = spec.wb, r = spec.wr;
  // tanque y carenado
  const tank = new THREE.SphereGeometry(0.22, 12, 8);
  tank.scale(0.75, 0.6, 1.3);
  tank.translate(0, 0.86, 0.18);
  paint.push(tank.toNonIndexed());
  addBox(paint, 0.3, 0.32, 0.4, 0, 0.88, 0.62, -0.5);
  addBox(paint, 0.22, 0.12, 0.5, 0, 0.82, -0.62, 0.15);
  // asiento
  addBox(trim, 0.26, 0.08, 0.62, 0, 0.84, -0.28);
  // cuadro y motor
  addBox(trim, 0.08, 0.08, 0.95, 0, 0.62, 0.0, -0.35);
  addBox(trim, 0.28, 0.3, 0.4, 0, 0.45, 0.05);
  addCyl(trim, 0.03, 0.75, 0, 0.55, -0.42, 'z', 6);
  // horquilla y manubrio
  for (const s of [-1, 1]) {
    const f = new THREE.CylinderGeometry(0.025, 0.025, 0.72, 6);
    f.rotateX(0.42);
    f.translate(s * 0.09, 0.62, wb / 2 - 0.12);
    chrome.push(f.toNonIndexed());
  }
  addCyl(trim, 0.02, 0.7, 0, 1.02, 0.5, 'x', 6);
  // escape
  addCyl(chrome, 0.045, 0.7, 0.16, 0.38, -0.35, 'z', 8);
  addBox(head, 0.14, 0.1, 0.06, 0, 0.94, 0.84);
  addBox(tail, 0.12, 0.05, 0.05, 0, 0.83, -0.88);
  const bL = [], bR = [];
  for (const sx of [-1, 1]) {
    addBox(sx > 0 ? bL : bR, 0.05, 0.035, 0.05, sx * 0.13, 0.93, 0.8);
    addBox(sx > 0 ? bL : bR, 0.05, 0.035, 0.05, sx * 0.12, 0.8, -0.86);
  }
  const wheels = [{ x: 0, y: r, z: wb / 2, r, w: 0.13, front: true, side: 0 }, { x: 0, y: r, z: -wb / 2, r, w: 0.16, front: false, side: 0 }];
  const paintGeo = mergeOrEmpty(paint), trimGeo = mergeOrEmpty(trim.map((g) => tint(g, 0x1a1b1d)));
  bakeAOBike(paintGeo, wheels);
  bakeAOBike(trimGeo, wheels);
  return {
    paint: paintGeo, trim: trimGeo, glass: null, chrome: mergeOrEmpty(chrome),
    head: mergeOrEmpty(head), tail: mergeOrEmpty(tail), extra: null,
    blinkL: mergeOrEmpty(bL), blinkR: mergeOrEmpty(bR),
    plates: [{ x: 0, y: 0.62, z: -0.95, front: false, small: true }],
    wheels,
    seat: { x: 0, hip: 0.9, z: -0.22 },
    height: 1.1,
    noHood: true,
  };
}

/**
 * Rueda unitaria (radio 1, ancho 1; eje en X, cara exterior hacia +X).
 * tire: neumático con banda de rodadura, surcos y flancos. rim: llanta de 5 rayos cóncavos con aro,
 * barril, tuercas, tapa y disco de freno (gira con la rueda). caliper: pinza fija (no gira).
 * Los colores de vértice de la llanta distinguen cara pulida, barril oscuro y disco.
 */
export function buildWheel() {
  const RIM = 0.68; // radio del aro relativo al neumático
  // --- neumático (torno): de la pestaña interior a la exterior pasando por la banda
  const prof = [];
  const flank = (t) => 1 - 0.035 * Math.sin(t * Math.PI); // flanco levemente abombado
  // flanco interior (x negativo) desde el aro hasta el hombro
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const r = RIM + (0.93 - RIM) * t;
    prof.push(new THREE.Vector2(r, -0.47 * flank(t) - 0.03 * (1 - t)));
  }
  // hombro y banda con 4 surcos
  const tread = [[-0.44, 0.965], [-0.42, 0.99], [-0.36, 1.0], [-0.27, 1.0], [-0.255, 0.975], [-0.235, 0.975], [-0.22, 1.0], [-0.1, 1.0], [-0.085, 0.975], [-0.065, 0.975], [-0.05, 1.0],
    [0.05, 1.0], [0.065, 0.975], [0.085, 0.975], [0.1, 1.0], [0.22, 1.0], [0.235, 0.975], [0.255, 0.975], [0.27, 1.0], [0.36, 1.0], [0.42, 0.99], [0.44, 0.965]];
  for (const [x, r] of tread) prof.push(new THREE.Vector2(r, x));
  for (let i = 6; i >= 0; i--) {
    const t = i / 6;
    const r = RIM + (0.93 - RIM) * t;
    prof.push(new THREE.Vector2(r, 0.47 * flank(t) + 0.03 * (1 - t)));
  }
  // LatheGeometry gira alrededor de Y con (x=radio, y=altura): luego el eje pasa a X
  const tire = new THREE.LatheGeometry(prof.map((v) => new THREE.Vector2(v.x, v.y)), 40);
  tire.rotateZ(-Math.PI / 2);
  tire.computeVertexNormals();
  // --- llanta
  const parts = [];
  const add = (g, c) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    parts.push(tint(n, c));
  };
  // aro exterior pulido (labio) y barril
  const lipP = [new THREE.Vector2(RIM - 0.03, 0.47), new THREE.Vector2(RIM + 0.015, 0.475), new THREE.Vector2(RIM + 0.03, 0.455), new THREE.Vector2(RIM + 0.012, 0.43), new THREE.Vector2(RIM - 0.02, 0.43)];
  const lip = new THREE.LatheGeometry(lipP, 40);
  lip.rotateZ(-Math.PI / 2);
  add(lip, 0xd4d7da);
  const barrel = new THREE.CylinderGeometry(RIM - 0.02, RIM - 0.02, 0.86, 32, 1, true);
  barrel.rotateZ(Math.PI / 2);
  barrel.scale(1, 1, 1);
  const bi = barrel.toNonIndexed();
  const bn = bi.attributes.normal;
  for (let i = 0; i < bn.count; i++) bn.setXYZ(i, -bn.getX(i), -bn.getY(i), -bn.getZ(i));
  // invertir el orden para que la cara interna sea la visible
  const bp = bi.attributes.position;
  for (let i = 0; i < bp.count; i += 3) {
    for (const a of [bp, bn]) {
      const x = a.getX(i + 1), y = a.getY(i + 1), z = a.getZ(i + 1);
      a.setXYZ(i + 1, a.getX(i + 2), a.getY(i + 2), a.getZ(i + 2));
      a.setXYZ(i + 2, x, y, z);
    }
  }
  add(bi, 0x2a2c2f);
  // 5 rayos cóncavos (de la maza al aro, inclinados hacia adentro en el centro)
  const spokeShape = new THREE.Shape();
  spokeShape.moveTo(-0.055, 0.0);
  spokeShape.lineTo(0.055, 0.0);
  spokeShape.lineTo(0.1, 0.43);
  spokeShape.quadraticCurveTo(0.0, 0.47, -0.1, 0.43);
  spokeShape.lineTo(-0.055, 0.0);
  for (let k = 0; k < 5; k++) {
    for (const off of [-0.075, 0.075]) {
      const g = new THREE.ExtrudeGeometry(spokeShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 4 });
      // forma en el plano XY (Y radial) con espesor en Z -> la pasamos al plano YZ de la rueda
      g.translate(0, 0.2, -0.03);
      g.rotateX(0.2); // concavidad: el extremo exterior sale hacia la cara de la rueda
      g.rotateY(Math.PI / 2); // espesor a lo largo de X (eje)
      g.translate(0.3, 0, 0);
      g.rotateX((k / 5) * Math.PI * 2 + off * 2.2);
      add(g, 0xc9ccd0);
    }
  }
  // maza, tapa central y tuercas
  const hub = new THREE.CylinderGeometry(0.21, 0.23, 0.12, 20);
  hub.rotateZ(Math.PI / 2);
  hub.translate(0.32, 0, 0);
  add(hub, 0xbfc3c7);
  const cap = new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.rotateZ(-Math.PI / 2);
  cap.scale(0.45, 1, 1);
  cap.translate(0.38, 0, 0);
  add(cap, 0x9aa0a6);
  for (let k = 0; k < 5; k++) {
    const nut = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6);
    nut.rotateZ(Math.PI / 2);
    const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
    nut.translate(0.4, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
    add(nut, 0xe0e2e4);
  }
  // disco de freno con campana (gira con la rueda)
  const disc = new THREE.CylinderGeometry(0.56, 0.56, 0.07, 32);
  disc.rotateZ(Math.PI / 2);
  disc.translate(0.02, 0, 0);
  add(disc, 0x6d7074);
  const hat = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 18);
  hat.rotateZ(Math.PI / 2);
  hat.translate(0.12, 0, 0);
  add(hat, 0x3c3e41);
  const rim = mergeGeometries(parts);
  // --- pinza de freno (fija): abraza el borde del disco arriba, detrás de los rayos
  const cal = new THREE.BoxGeometry(0.17, 0.17, 0.34, 1, 1, 2);
  // curvar levemente siguiendo el disco
  const cp = cal.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const z = cp.getZ(i), y = cp.getY(i);
    cp.setY(i, y - z * z * 0.9);
  }
  cal.translate(0.1, 0.53, 0);
  const caliper = cal.toNonIndexed();
  caliper.computeVertexNormals();
  for (const k of Object.keys(caliper.attributes)) if (k !== 'position' && k !== 'normal') caliper.deleteAttribute(k);
  return { tire, rim, caliper };
}

// ---------------------------------------------------------------- llantas por estilo
// Cada modelo usa su propio diseño de llanta (el color lo pone cada auto por instancia).
export const RIM_STYLES = ['twin5', 'multi10', 'mesh', 'steel', 'offroad6', 'deep5', 'aero'];

export function buildRim(style = 'twin5') {
  if (style === 'twin5') return buildWheel().rim;
  const RIM = 0.68;
  const parts = [];
  const add = (g, c) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (!n.attributes.normal) n.computeVertexNormals();
    parts.push(tint(n, c));
  };
  const lathe = (pts, c, seg = 40) => {
    const g = new THREE.LatheGeometry(pts.map(([r, x]) => new THREE.Vector2(r, x)), seg);
    g.rotateZ(-Math.PI / 2);
    add(g, c);
  };
  const deep = style === 'deep5';
  // labio pulido (ancho y escalonado en la llanta de plato hondo) y barril oscuro
  lathe(deep ? [[RIM - 0.1, 0.475], [RIM + 0.015, 0.478], [RIM + 0.03, 0.455], [RIM + 0.012, 0.42], [RIM - 0.1, 0.41]]
    : [[RIM - 0.03, 0.47], [RIM + 0.015, 0.475], [RIM + 0.03, 0.455], [RIM + 0.012, 0.43], [RIM - 0.02, 0.43]], 0xd4d7da);
  lathe([[RIM - 0.02, 0.43], [RIM - 0.02, -0.43]], 0x2a2c2f, 32);
  // rayo extruido: de la maza (len0) al aro, inclinado (tilt) para dar concavidad
  const spoke = (w0, w1, len0, len1, depth, tilt, x, angle, color) => {
    const sh = new THREE.Shape();
    const L = len1 - len0;
    sh.moveTo(-w0, 0);
    sh.lineTo(w0, 0);
    sh.lineTo(w1, L);
    sh.quadraticCurveTo(0, L + 0.03, -w1, L);
    sh.lineTo(-w0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1, curveSegments: 4 });
    g.translate(0, len0, -depth / 2);
    g.rotateX(tilt);
    g.rotateY(Math.PI / 2);
    g.translate(x, 0, 0);
    g.rotateX(angle);
    add(g, color);
  };
  const TAU = Math.PI * 2;
  let nuts = 5, capR = 0.1, hubR = 0.21;
  if (style === 'multi10') {
    // forjada de diez rayos finos y rectos
    for (let k = 0; k < 10; k++) spoke(0.03, 0.045, 0.19, 0.63, 0.05, 0.1, 0.32, (k / 10) * TAU, 0xc9ccd0);
    hubR = 0.18;
  } else if (style === 'mesh') {
    // malla de rayos cruzados (pares que se abren hacia el aro)
    for (let k = 0; k < 14; k++) {
      for (const o of [-0.13, 0.13]) spoke(0.014, 0.02, 0.2, 0.64, 0.04, 0.08, 0.31, (k / 14) * TAU + o, 0xcfd2d6);
    }
    hubR = 0.2;
  } else if (style === 'offroad6') {
    // seis rayos anchos y planos de todoterreno
    for (let k = 0; k < 6; k++) spoke(0.07, 0.11, 0.2, 0.62, 0.08, 0.0, 0.3, (k / 6) * TAU, 0x9da1a6);
    nuts = 6;
    hubR = 0.24;
  } else if (style === 'deep5') {
    // plato hondo: cinco rayos anchos hundidos detrás de un labio pulido
    for (let k = 0; k < 5; k++) spoke(0.06, 0.09, 0.19, 0.58, 0.06, 0.05, 0.2, (k / 5) * TAU, 0xc9ccd0);
    capR = 0.09;
  } else if (style === 'steel') {
    // llanta de chapa estampada con ocho ventanas y tapa central
    lathe([[0.18, 0.31], [0.24, 0.335], [0.33, 0.31], [0.47, 0.27], [0.58, 0.3], [RIM - 0.02, 0.42]], 0x8c9095);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      const h = new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14);
      h.rotateZ(Math.PI / 2);
      h.scale(1, 1, 1.5);
      h.rotateX(a);
      h.translate(0.276 + 0.012, Math.cos(a) * 0.43, Math.sin(a) * 0.43);
      add(h, 0x0b0c0d);
    }
    nuts = 4;
  } else if (style === 'aero') {
    // disco aerodinámico casi plano con cinco ranuras
    lathe([[0.1, 0.37], [0.3, 0.36], [0.52, 0.33], [RIM - 0.02, 0.43]], 0xb8bcc1);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.3;
      const s = new THREE.BoxGeometry(0.02, 0.05, 0.17);
      s.rotateX(a);
      s.translate(0.345, Math.cos(a) * 0.5, Math.sin(a) * 0.5);
      add(s, 0x0b0c0d);
    }
    nuts = 0;
  }
  // maza, tapa central y tuercas
  if (style !== 'aero') {
    const hub = new THREE.CylinderGeometry(hubR, hubR + 0.02, 0.12, 20);
    hub.rotateZ(Math.PI / 2);
    hub.translate(deep ? 0.22 : 0.32, 0, 0);
    add(hub, 0xbfc3c7);
  }
  const cap = new THREE.SphereGeometry(capR, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.rotateZ(-Math.PI / 2);
  cap.scale(0.45, 1, 1);
  cap.translate(style === 'aero' ? 0.37 : deep ? 0.28 : 0.38, 0, 0);
  add(cap, 0x9aa0a6);
  for (let k = 0; k < nuts; k++) {
    const nut = new THREE.CylinderGeometry(0.025, 0.025, 0.05, 6);
    nut.rotateZ(Math.PI / 2);
    const a = (k / nuts) * TAU + Math.PI / nuts;
    nut.translate(deep ? 0.3 : 0.4, Math.cos(a) * 0.15, Math.sin(a) * 0.15);
    add(nut, 0xe0e2e4);
  }
  // disco de freno con campana
  const disc = new THREE.CylinderGeometry(0.56, 0.56, 0.07, 32);
  disc.rotateZ(Math.PI / 2);
  disc.translate(0.02, 0, 0);
  add(disc, 0x6d7074);
  const hat = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 18);
  hat.rotateZ(Math.PI / 2);
  hat.translate(0.12, 0, 0);
  add(hat, 0x3c3e41);
  return mergeGeometries(parts);
}

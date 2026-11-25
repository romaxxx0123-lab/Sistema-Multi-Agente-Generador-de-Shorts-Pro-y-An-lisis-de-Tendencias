// Humanos procedurales: malla suave con esqueleto (SkinnedMesh), ropa y rostro por shader, animación procedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, damp, RNG } from '../core/utils.js';
import { setDynamic } from '../core/layers.js';

// ------------------------------------------------------------------ tipos de cuerpo
export const BODY_TYPES = [
  { id: 'hombre', h: 1.78, sh: 0.205, ch: 0.172, wa: 0.142, hp: 0.162, dp: 1.0, lb: 1.0, fem: 0 },
  { id: 'hombre_delgado', h: 1.81, sh: 0.19, ch: 0.158, wa: 0.128, hp: 0.152, dp: 0.9, lb: 0.9, fem: 0 },
  { id: 'hombre_robusto', h: 1.75, sh: 0.218, ch: 0.2, wa: 0.192, hp: 0.182, dp: 1.28, lb: 1.15, fem: 0 },
  { id: 'mujer', h: 1.66, sh: 0.172, ch: 0.158, wa: 0.118, hp: 0.172, dp: 0.95, lb: 0.86, fem: 1 },
  { id: 'mujer_delgada', h: 1.7, sh: 0.164, ch: 0.148, wa: 0.108, hp: 0.162, dp: 0.88, lb: 0.82, fem: 1 },
  { id: 'mujer_curvas', h: 1.63, sh: 0.178, ch: 0.172, wa: 0.134, hp: 0.192, dp: 1.08, lb: 0.95, fem: 1 },
];
export const HAIR_STYLES = ['calvo', 'corto', 'rapado', 'largo', 'colita', 'rulos', 'gorra'];

const R = { HEAD: 0, NECK: 1, TORSO: 2, PELVIS: 3, UARM: 4, FARM: 5, HAND: 6, THIGH: 7, SHIN: 8, FOOT: 9, HAIR: 10, HAT: 11 };
const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  clavL: 6, uarmL: 7, farmL: 8, handL: 9, clavR: 10, uarmR: 11, farmR: 12, handR: 13,
  thighL: 14, shinL: 15, footL: 16, thighR: 17, shinR: 18, footR: 19,
};
const BONE_NAMES = Object.keys(B);
const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 1, 14, 15, 1, 17, 18];

function restPositions(bt) {
  const H = bt.h;
  const sx = bt.sh - 0.018;
  const hx = 0.088 * bt.hp / 0.162;
  const P = [];
  P[B.root] = [0, 0, 0];
  P[B.hips] = [0, 0.555 * H, 0];
  P[B.spine] = [0, 0.625 * H, 0];
  P[B.chest] = [0, 0.72 * H, 0];
  P[B.neck] = [0, 0.842 * H, 0];
  P[B.head] = [0, 0.875 * H, 0];
  for (const [s, c, u, f, h] of [[1, B.clavL, B.uarmL, B.farmL, B.handL], [-1, B.clavR, B.uarmR, B.farmR, B.handR]]) {
    P[c] = [s * 0.04, 0.81 * H, 0];
    P[u] = [s * sx, 0.815 * H, 0];
    P[f] = [s * sx, 0.632 * H, 0];
    P[h] = [s * sx, 0.475 * H, 0];
  }
  for (const [s, t, sh, ft] of [[1, B.thighL, B.shinL, B.footL], [-1, B.thighR, B.shinR, B.footR]]) {
    P[t] = [s * hx, 0.53 * H, 0];
    P[sh] = [s * hx, 0.285 * H, 0];
    P[ft] = [s * hx, 0.052 * H, 0];
  }
  return P;
}

// ------------------------------------------------------------------ construcción de malla
class MeshBuilder {
  constructor() {
    this.pos = [];
    this.si = [];
    this.sw = [];
    this.reg = [];
    this.t = [];
    this.face = [];
    this.idx = [];
  }
  vert(p, bones, weights, region, t, face = [0, 0]) {
    this.pos.push(p[0], p[1], p[2]);
    const bi = [0, 0, 0, 0], bw = [0, 0, 0, 0];
    for (let k = 0; k < bones.length && k < 4; k++) {
      bi[k] = bones[k];
      bw[k] = weights[k];
    }
    const s = bw[0] + bw[1] + bw[2] + bw[3] || 1;
    this.si.push(...bi);
    this.sw.push(bw[0] / s, bw[1] / s, bw[2] / s, bw[3] / s);
    this.reg.push(region);
    this.t.push(t);
    this.face.push(face[0], face[1]);
    return this.pos.length / 3 - 1;
  }
  /** Tubo vertical: rings = [{y, x, z, rx, rz, bones, w, t}] de arriba hacia abajo */
  tube(rings, seg, region, { capTop = false, capBottom = false } = {}) {
    const start = this.pos.length / 3;
    for (const r of rings) {
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        // frente (+z) con más volumen para pecho/glúteos según r.fz/r.bz
        const zr = sa > 0 ? r.rz * (r.fz || 1) : r.rz * (r.bz || 1);
        this.vert([r.x + ca * r.rx, r.y, (r.z || 0) + sa * zr], r.bones, r.w, region, r.t);
      }
    }
    for (let i = 0; i < rings.length - 1; i++)
      for (let k = 0; k < seg; k++) {
        const a = start + i * seg + k, b = start + i * seg + ((k + 1) % seg);
        const c = a + seg, d = b + seg;
        this.idx.push(a, b, c, b, d, c);
      }
    const cap = (ri, up) => {
      const r = rings[ri];
      const ci = this.vert([r.x, r.y + (up ? 0.008 : -0.008), r.z || 0], r.bones, r.w, region, r.t);
      const base = start + ri * seg;
      for (let k = 0; k < seg; k++) {
        const a = base + k, b = base + ((k + 1) % seg);
        if (up) this.idx.push(ci, b, a);
        else this.idx.push(ci, a, b);
      }
    };
    if (capTop) cap(0, true);
    if (capBottom) cap(rings.length - 1, false);
  }
  /** Elipsoide (cabeza / pelo). */
  ellipsoid(c, rad, wSeg, hSeg, bones, w, region, opts = {}) {
    const start = this.pos.length / 3;
    const th0 = opts.thetaStart || 0, th1 = opts.thetaEnd || Math.PI;
    for (let j = 0; j <= hSeg; j++) {
      for (let k = 0; k <= wSeg; k++) {
        const ph = (k / wSeg) * Math.PI * 2;
        let thEnd = th1;
        if (opts.hairline) {
          const back = (1 - Math.cos(ph)) / 2; // 0 frente, 1 nuca
          thEnd = Math.PI * (opts.hairline[0] + (opts.hairline[1] - opts.hairline[0]) * Math.pow(back, 0.8));
        }
        const th = th0 + ((thEnd - th0) * j) / hSeg;
        let x = Math.sin(th) * Math.sin(ph), y = Math.cos(th), z = Math.sin(th) * Math.cos(ph);
        let rx = rad[0], ry = rad[1], rz = rad[2];
        if (opts.head) {
          // mandíbula más angosta, frente plana, nariz
          if (y < -0.2) {
            rx *= 1 - (-0.2 - y) * 0.38;
            rz *= 1 - (-0.2 - y) * 0.18;
          }
          if (z > 0.6 && Math.abs(x) < 0.25 && y > -0.45 && y < 0.05) z += 0.12 * (1 - Math.abs(x) / 0.25) * (1 - Math.abs(y + 0.2) / 0.25);
        }
        if (opts.bumpy) {
          const n = Math.sin(ph * 7 + th * 5) * Math.sin(th * 9) * 0.06;
          rx *= 1 + n;
          ry *= 1 + n;
          rz *= 1 + n;
        }
        const p = [c[0] + x * rx, c[1] + y * ry, c[2] + z * rz];
        if (opts.backDrop && z < 0) p[1] -= opts.backDrop * (-z) * Math.max(0, 1 - y);
        const faceAng = Math.atan2(x, z);
        this.vert(p, bones, w, region, 0, [faceAng, y]);
      }
    }
    for (let j = 0; j < hSeg; j++)
      for (let k = 0; k < wSeg; k++) {
        const a = start + j * (wSeg + 1) + k, b = a + 1, cc = a + wSeg + 1, d = cc + 1;
        this.idx.push(a, cc, b, b, cc, d);
      }
  }
  /** Zapato: tubo a lo largo de Z. */
  shoe(x, ankleY, bone, H) {
    const start = this.pos.length / 3;
    const seg = 10;
    const L = 0.135 * H / 1.75;
    const prof = [
      [-0.055, 0.075, 0.042], [-0.035, 0.085, 0.046], [0.0, 0.07, 0.048], [0.06, 0.05, 0.05], [0.12, 0.04, 0.047], [0.17, 0.032, 0.04], [0.2, 0.024, 0.028],
    ];
    for (const [zz, hh, ww] of prof) {
      const z = zz * (L / 0.135);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        let y = hh * 0.5 + Math.sin(a) * hh * 0.5;
        y = Math.max(0.004, y);
        this.vert([x + Math.cos(a) * ww, y, z], [bone], [1], R.FOOT, (Math.sin(a) + 1) / 2);
      }
    }
    for (let i = 0; i < prof.length - 1; i++)
      for (let k = 0; k < seg; k++) {
        const a = start + i * seg + k, b = start + i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
        this.idx.push(a, b, c, b, d, c);
      }
    // tapas
    for (const [ri, flip] of [[0, true], [prof.length - 1, false]]) {
      const base = start + ri * seg;
      const cz = prof[ri][0] * (L / 0.135);
      const ci = this.vert([x, prof[ri][1] * 0.5, cz], [bone], [1], R.FOOT, 0.5);
      for (let k = 0; k < seg; k++) {
        const a = base + k, b = base + ((k + 1) % seg);
        if (flip) this.idx.push(ci, a, b);
        else this.idx.push(ci, b, a);
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setAttribute('aRegion', new THREE.Float32BufferAttribute(this.reg, 1));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(this.t, 1));
    g.setAttribute('aFace', new THREE.Float32BufferAttribute(this.face, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

function buildBodyGeometry(bt, hairStyle) {
  const H = bt.h, k = H / 1.76;
  const mb = new MeshBuilder();
  const P = restPositions(bt);
  const lb = bt.lb, dp = bt.dp;
  // Piernas
  for (const [s, T, S, F] of [[1, B.thighL, B.shinL, B.footL], [-1, B.thighR, B.shinR, B.footR]]) {
    const x = P[T][0];
    const ring = (yf, rx, rz, bones, w, t, extra = {}) => ({ y: yf * H, x: x + (extra.dx || 0) * s, z: (extra.z || 0) * k, rx: rx * k * lb, rz: rz * k * lb, bones, w, t, fz: extra.fz, bz: extra.bz });
    mb.tube([
      ring(0.6, 0.08, 0.09, [B.hips, T], [0.75, 0.25], 0, { dx: -0.004 }),
      ring(0.53, 0.083, 0.088, [T], [1], 0.05, { bz: 1.12 }),
      ring(0.45, 0.073, 0.078, [T], [1], 0.32),
      ring(0.37, 0.061, 0.065, [T], [1], 0.65),
      ring(0.305, 0.051, 0.056, [T, S], [0.65, 0.35], 0.9),
      ring(0.272, 0.049, 0.053, [S, T], [0.65, 0.35], 0.0),
      ring(0.215, 0.054, 0.06, [S], [1], 0.25, { z: -0.008, bz: 1.15 }),
      ring(0.15, 0.044, 0.048, [S], [1], 0.55),
      ring(0.085, 0.033, 0.036, [S], [1], 0.85),
      ring(0.058, 0.031, 0.034, [S, F], [0.6, 0.4], 1.0),
    ], 12, 0);
    // las regiones de pierna se asignan por tramo
    mb.shoe(x, 0.052 * H, F, H);
  }
  // Asignar región muslo/pierna en los vértices de las piernas recién creados
  {
    const n = mb.pos.length / 3;
    for (let i = 0; i < n; i++) {
      if (mb.reg[i] !== 0) continue;
      const bi = mb.si[i * 4];
      mb.reg[i] = bi === B.shinL || bi === B.shinR ? R.SHIN : R.THIGH;
      if (bi === B.hips) mb.reg[i] = R.PELVIS;
    }
  }
  const legEnd = mb.pos.length / 3;
  // Torso (de arriba hacia abajo)
  const tr = (yf, rx, rz, bones, w, t, fz = 1, bz = 1, z = 0) => ({ y: yf * H, x: 0, z: z * k, rx: rx * k, rz: rz * k * dp, bones, w, t, fz, bz });
  const bust = bt.fem ? 1.22 : 1.04;
  mb.tube([
    tr(0.845, 0.056, 0.05, [B.neck, B.chest], [0.6, 0.4], 0.0),
    tr(0.838, bt.sh * 0.44, 0.068, [B.chest, B.neck], [0.75, 0.25], 0.02),
    tr(0.826, bt.sh * 0.78, 0.084, [B.chest], [1], 0.05),
    tr(0.808, bt.sh * 0.95, 0.094, [B.chest], [1], 0.09),
    tr(0.78, bt.ch * 1.03, 0.112, [B.chest], [1], 0.18, bust * 0.98),
    tr(0.745, bt.ch, 0.118, [B.chest], [1], 0.3, bust, 1.0, 0.005),
    tr(0.7, (bt.ch + bt.wa) / 2, 0.104, [B.chest, B.spine], [0.5, 0.5], 0.45),
    tr(0.645, bt.wa, 0.096, [B.spine], [1], 0.6, 1.02),
    tr(0.6, bt.hp * 0.97, 0.104, [B.spine, B.hips], [0.3, 0.7], 0.72, 1.0, 1.1),
    tr(0.555, bt.hp, 0.11, [B.hips], [1], 0.84, 1.0, 1.22, -0.004),
    tr(0.515, bt.hp * 0.8, 0.095, [B.hips], [1], 0.95, 1.0, 1.15),
    tr(0.49, bt.hp * 0.45, 0.06, [B.hips], [1], 1.0),
  ], 16, 0, { capBottom: true });
  for (let i = legEnd; i < mb.pos.length / 3; i++) mb.reg[i] = mb.t[i] < 0.66 ? R.TORSO : R.PELVIS;
  // Cuello
  let st = mb.pos.length / 3;
  mb.tube([
    { y: 0.885 * H, x: 0, z: 0.004, rx: 0.046 * k, rz: 0.048 * k, bones: [B.head, B.neck], w: [0.5, 0.5], t: 0 },
    { y: 0.862 * H, x: 0, z: 0, rx: 0.05 * k, rz: 0.05 * k, bones: [B.neck], w: [1], t: 0.5 },
    { y: 0.835 * H, x: 0, z: 0, rx: 0.058 * k, rz: 0.055 * k, bones: [B.neck, B.chest], w: [0.6, 0.4], t: 1 },
  ], 12, R.NECK);
  // Cabeza
  const hc = [0, 0.935 * H, 0.006 * k];
  const hr = [0.083 * k, 0.112 * k, 0.098 * k];
  st = mb.pos.length / 3;
  mb.ellipsoid(hc, hr, 16, 12, [B.head], [1], R.HEAD, { head: true });
  // Orejas
  for (const s of [1, -1]) {
    mb.ellipsoid([hc[0] + s * hr[0] * 0.98, hc[1] - 0.005, hc[2] - 0.006], [0.012 * k, 0.026 * k, 0.017 * k], 6, 5, [B.head], [1], R.HEAD);
  }
  // Brazos
  for (const [s, C, U, Fa, Ha] of [[1, B.clavL, B.uarmL, B.farmL, B.handL], [-1, B.clavR, B.uarmR, B.farmR, B.handR]]) {
    const x = P[U][0];
    const ar = (yf, rx, rz, bones, w, t, dx = 0) => ({ y: yf * H, x: x + dx * s, z: 0, rx: rx * k * lb, rz: rz * k * lb, bones, w, t });
    st = mb.pos.length / 3;
    mb.tube([
      ar(0.818, 0.044, 0.05, [C, U], [0.45, 0.55], 0, -0.012),
      ar(0.8, 0.05, 0.054, [U], [1], 0.1),
      ar(0.725, 0.043, 0.047, [U], [1], 0.5),
      ar(0.648, 0.037, 0.04, [U, Fa], [0.6, 0.4], 0.92),
      ar(0.62, 0.035, 0.038, [Fa, U], [0.65, 0.35], 0.05),
      ar(0.57, 0.036, 0.038, [Fa], [1], 0.32),
      ar(0.505, 0.027, 0.03, [Fa], [1], 0.75),
      ar(0.478, 0.025, 0.028, [Fa, Ha], [0.5, 0.5], 1.0),
    ], 10, R.UARM, { capTop: true });
    for (let i = st; i < mb.pos.length / 3; i++) {
      const bi = mb.si[i * 4];
      mb.reg[i] = bi === Fa ? R.FARM : R.UARM;
    }
    // Mano (aplanada, palma hacia el cuerpo)
    mb.tube([
      ar(0.47, 0.019, 0.034, [Ha], [1], 0),
      ar(0.44, 0.02, 0.04, [Ha], [1], 0.4),
      ar(0.415, 0.017, 0.032, [Ha], [1], 0.8),
      ar(0.398, 0.011, 0.02, [Ha], [1], 1),
    ], 8, R.HAND, { capBottom: true });
    // pulgar
    mb.ellipsoid([x - s * 0.002, 0.452 * H, 0.03 * k], [0.011 * k, 0.026 * k, 0.012 * k], 6, 5, [Ha], [1], R.HAND);
  }
  // Pelo / gorra
  const hairBones = [B.head];
  const hrc = [hc[0], hc[1] + 0.006 * k, hc[2] - 0.004 * k];
  switch (hairStyle) {
    case 'corto':
      mb.ellipsoid(hrc, [hr[0] * 1.07, hr[1] * 1.05, hr[2] * 1.08], 18, 8, hairBones, [1], R.HAIR, { hairline: [0.34, 0.66], backDrop: 0.02 });
      break;
    case 'rapado':
      mb.ellipsoid(hrc, [hr[0] * 1.025, hr[1] * 1.02, hr[2] * 1.03], 18, 8, hairBones, [1], R.HAIR, { hairline: [0.33, 0.62], backDrop: 0.01 });
      break;
    case 'largo':
      mb.ellipsoid(hrc, [hr[0] * 1.1, hr[1] * 1.06, hr[2] * 1.1], 18, 9, hairBones, [1], R.HAIR, { hairline: [0.33, 0.72], backDrop: 0.05 });
      mb.tube([
        { y: hc[1] + 0.02, x: 0, z: -0.04 * k, rx: hr[0] * 1.08, rz: 0.07 * k, bones: [B.head], w: [1], t: 0 },
        { y: hc[1] - 0.08, x: 0, z: -0.055 * k, rx: hr[0] * 1.02, rz: 0.06 * k, bones: [B.head, B.neck], w: [0.7, 0.3], t: 0.4 },
        { y: 0.79 * H, x: 0, z: -0.075 * k, rx: hr[0] * 1.15, rz: 0.05 * k, bones: [B.neck, B.chest], w: [0.3, 0.7], t: 1 },
      ], 12, R.HAIR, { capBottom: true });
      break;
    case 'colita':
      mb.ellipsoid(hrc, [hr[0] * 1.05, hr[1] * 1.04, hr[2] * 1.06], 18, 8, hairBones, [1], R.HAIR, { hairline: [0.32, 0.66], backDrop: 0.02 });
      mb.tube([
        { y: hc[1] + 0.03, x: 0, z: -0.105 * k, rx: 0.026 * k, rz: 0.026 * k, bones: [B.head], w: [1], t: 0 },
        { y: hc[1] - 0.06, x: 0, z: -0.13 * k, rx: 0.03 * k, rz: 0.03 * k, bones: [B.head], w: [1], t: 0.5 },
        { y: hc[1] - 0.15, x: 0, z: -0.12 * k, rx: 0.012 * k, rz: 0.012 * k, bones: [B.head, B.neck], w: [0.6, 0.4], t: 1 },
      ], 8, R.HAIR, { capBottom: true, capTop: true });
      break;
    case 'rulos':
      mb.ellipsoid(hrc, [hr[0] * 1.22, hr[1] * 1.15, hr[2] * 1.22], 18, 9, hairBones, [1], R.HAIR, { hairline: [0.36, 0.68], backDrop: 0.02, bumpy: true });
      break;
    case 'gorra':
      mb.ellipsoid(hrc, [hr[0] * 1.08, hr[1] * 1.0, hr[2] * 1.09], 18, 7, hairBones, [1], R.HAT, { hairline: [0.36, 0.52] });
      // visera
      {
        const s0 = mb.pos.length / 3;
        const y = hc[1] + 0.035 * k, z0 = hr[2] * 0.85 + hc[2];
        const pts = [];
        for (let i = 0; i <= 8; i++) {
          const a = -Math.PI / 2 + (i / 8) * Math.PI;
          pts.push([Math.sin(a) * hr[0] * 0.95, y, z0 + Math.cos(a) * 0.085 * k]);
        }
        for (const p of pts) {
          mb.vert(p, [B.head], [1], R.HAT, 0);
          mb.vert([p[0] * 0.98, y + 0.004, z0 - 0.01], [B.head], [1], R.HAT, 0);
        }
        for (let i = 0; i < 8; i++) {
          const a = s0 + i * 2;
          mb.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3, a + 1, a + 2, a, a + 3, a + 2, a + 1);
        }
      }
      break;
    default:
      break;
  }
  const g = mb.build();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H * 0.5, 0), H * 1.05);
  return g;
}

// ------------------------------------------------------------------ material
const HUMAN_HEAD = /* glsl */ `
attribute float aRegion; attribute float aT; attribute vec2 aFace;
flat varying float vRegion; varying float vT; varying vec2 vFace; varying vec3 vObjPos;
`;
const HUMAN_VWORLD = /* glsl */ `
vRegion = aRegion; vT = aT; vFace = aFace; vObjPos = position;
`;
const HUMAN_FHEAD = /* glsl */ `
uniform vec3 uSkin; uniform vec3 uShirt; uniform vec3 uPants; uniform vec3 uShoes; uniform vec3 uHair; uniform vec3 uAccent; uniform vec3 uEyes;
uniform float uSleeve; uniform float uLegs; uniform float uStyle; uniform float uDirt; uniform float uSeed;
flat varying float vRegion; varying float vT; varying vec2 vFace; varying vec3 vObjPos;
vec3 faceColor(vec2 f, vec3 skin){
  vec3 c = skin;
  float ax = abs(f.x);
  if (ax < 1.25) {
    // ojos
    vec2 e = vec2(ax - .36, f.y - .12);
    float eye = smoothstep(.075, .06, length(e * vec2(1., 1.9)));
    float iris = smoothstep(.034, .026, length(e * vec2(1.05, 1.1)));
    float pupil = smoothstep(.016, .01, length(e));
    c = mix(c, vec3(.9, .88, .86), eye);
    c = mix(c, uEyes, iris * eye);
    c = mix(c, vec3(.02), pupil * eye);
    // párpado superior
    float lid = smoothstep(.012, .0, abs(length(e * vec2(1., 1.9)) - .07)) * step(0., e.y);
    c = mix(c, skin * .45, lid * .8);
    // cejas
    float by = .25 + ax * .04 - (ax - .36) * (ax - .36) * .6;
    float brow = smoothstep(.022, .006, abs(f.y - by)) * step(abs(ax - .37), .14);
    c = mix(c, uHair * .7, brow * .9);
    // nariz y boca
    float nose = smoothstep(.05, .0, ax) * smoothstep(-.05, -.22, f.y) * smoothstep(-.3, -.2, f.y);
    c *= 1. - nose * .12;
    float my = -.36 - ax * ax * .5;
    float mouth = smoothstep(.022, .006, abs(f.y - my)) * step(ax, .2);
    c = mix(c, skin * vec3(.62, .38, .38), mouth);
    float lipL = smoothstep(.045, .02, abs(f.y - my + .025)) * step(ax, .17) * (1. - mouth);
    c = mix(c, skin * vec3(.82, .58, .56), lipL * .5);
    // mejillas
    c *= 1. + .05 * smoothstep(.2, .0, length(vec2(ax - .45, f.y + .15))) * vec3(1., .3, .3);
  }
  return c;
}
`;
const HUMAN_FRAG = /* glsl */ `
int rg = int(vRegion + .5);
vec3 c = uSkin;
float rough = .55;
float fabric = 0.;
float n1 = fbm3(vObjPos.xy * 90. + vObjPos.z * 40. + uSeed);
if (rg == 0) { c = faceColor(vFace, uSkin); rough = .5; }
else if (rg == 1 || rg == 6) { c = uSkin; rough = .5; }
else if (rg == 2) {
  c = uShirt; fabric = 1.;
  if (uStyle > .5 && uStyle < 1.5) { float btn = step(abs(vObjPos.x), .006) * step(.1, fract(vObjPos.y * 12.)) * step(fract(vObjPos.y * 12.), .25); c = mix(c, vec3(.92), btn * step(0., vObjPos.z)); }
  if (uStyle > 1.5) { c = mix(c, c * .7, step(abs(vObjPos.x), .012) * step(0., vObjPos.z)); }
  if (vT < .05) c = mix(c, uStyle > .5 ? uShirt * .85 : uSkin, .0);
}
else if (rg == 3) { c = vT < .74 ? uShirt : uPants; fabric = 1.; if (vT > .74 && vT < .79) c = vec3(.08, .06, .05); }
else if (rg == 4) { c = vT < uSleeve * 2.2 ? uShirt : uSkin; fabric = vT < uSleeve * 2.2 ? 1. : 0.; }
else if (rg == 5) { bool sl = uSleeve > .9 && vT < .92; c = sl ? uShirt : uSkin; fabric = sl ? 1. : 0.; }
else if (rg == 7) { bool cov = vT < uLegs * 2.2; c = cov ? uPants : uSkin; fabric = cov ? 1. : 0.; }
else if (rg == 8) { bool cov = uLegs > .95 || vT < (uLegs - .55) * 2.4; c = cov ? uPants : uSkin; fabric = cov ? 1. : 0.; }
else if (rg == 9) { c = mix(vec3(.9, .88, .84) * (uShoes.r + uShoes.g + uShoes.b > 1.8 ? 1. : .25), uShoes, step(.18, vT)); rough = .6; }
else if (rg == 10) { c = uHair * (.75 + .5 * vnoise(vObjPos.xy * 300. + vObjPos.z * 200.)); rough = .45; }
else if (rg == 11) { c = uAccent; rough = .7; }
if (fabric > .5) {
  c *= .88 + .2 * n1;
  // jean: tono azul con trama
  rough = .85;
}
c *= 1. - uDirt * .5 * fbm3(vObjPos.xz * 20. + uSeed);
diffuseColor.rgb = c;
float hRough = rough;
float hSkin = (rg == 0 || rg == 1 || rg == 6 || (rg >= 4 && rg <= 8 && fabric < .5)) ? 1. : 0.;
`;

let HUMAN_MAT_COUNT = 0;

export class HumanFactory {
  constructor(lib) {
    this.lib = lib;
    this.geoCache = new Map();
  }
  geometry(bodyIdx, hair) {
    const key = bodyIdx + '_' + hair;
    if (!this.geoCache.has(key)) this.geoCache.set(key, buildBodyGeometry(BODY_TYPES[bodyIdx], hair));
    return this.geoCache.get(key);
  }
  material(app) {
    const u = {
      uSkin: { value: new THREE.Color(app.skin) }, uShirt: { value: new THREE.Color(app.shirt) }, uPants: { value: new THREE.Color(app.pants) },
      uShoes: { value: new THREE.Color(app.shoes) }, uHair: { value: new THREE.Color(app.hairColor) }, uAccent: { value: new THREE.Color(app.accent || app.shirt) },
      uEyes: { value: new THREE.Color(app.eyes || 0x4a3020) },
      uSleeve: { value: app.sleeve ?? 0.45 }, uLegs: { value: app.legs ?? 1 }, uStyle: { value: app.style ?? 0 }, uDirt: { value: 0 },
      uSeed: { value: (HUMAN_MAT_COUNT++ * 13.37) % 100 },
    };
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
    this.lib.register(m, {
      key: 'human',
      uniforms: u,
      vertexHead: HUMAN_HEAD,
      vertexWorld: HUMAN_VWORLD,
      fragHead: HUMAN_FHEAD,
      fragColor: HUMAN_FRAG,
      fragRoughness: 'roughnessFactor = hRough;',
      fragEmissive: `
        {
          // dispersión subsuperficial aproximada en la piel (borde iluminado cálido)
          vec3 Vv = normalize(cameraPosition - vWPos);
          float rim = pow(1. - max(dot(Vv, normalize(vWNrm)), 0.), 3.);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1., .45, .35) * rim * hSkin * .12 * (1. - uNight * .7);
        }`,
    });
    m.userData.u = u;
    return m;
  }
}

// ------------------------------------------------------------------ apariencias
const SKINS = [0xf2d3bd, 0xe8b996, 0xd29f7b, 0xb87a55, 0x8d5a3b, 0x6b4128, 0x4a2c1c, 0xf6dfcf];
const HAIRS = [0x1a1410, 0x2b1d14, 0x4a3221, 0x6e4a2c, 0xa77b4a, 0xd4b27a, 0x8c8c8c, 0x2a2a2a, 0x7a2a1c];
const TOPS = [0x1f2a44, 0xf2f2f0, 0x3b3f45, 0x111214, 0x6b7a4f, 0xc9b79c, 0x7a1f2b, 0x2e6f95, 0xe0805f, 0x58a6a6, 0xf2c14e, 0x9b59b6, 0xff8fa3, 0x4d8b6f, 0xd9d4c7];
const BOTTOMS = [0x2d3e5e, 0x1b2a40, 0x3c4b6a, 0x222222, 0x5b5148, 0xb9a98a, 0x6d7b8a, 0x2b2b2e, 0x8a7356];
const SHOES = [0xf0f0ee, 0x1a1a1a, 0x5a3a24, 0x2a3a5a, 0xc0392b, 0x888888];

export function randomAppearance(rng = new RNG((Math.random() * 1e9) | 0), opts = {}) {
  const body = opts.body ?? rng.int(0, BODY_TYPES.length - 1);
  const fem = BODY_TYPES[body].fem;
  const hairList = fem ? ['largo', 'colita', 'rulos', 'corto', 'largo', 'gorra'] : ['corto', 'rapado', 'calvo', 'rulos', 'gorra', 'corto', 'colita'];
  const hot = opts.beach;
  return {
    body,
    hair: opts.hair ?? rng.pick(hairList),
    skin: rng.pick(SKINS),
    hairColor: rng.pick(HAIRS),
    shirt: rng.pick(TOPS),
    pants: rng.pick(BOTTOMS),
    shoes: rng.pick(SHOES),
    accent: rng.pick(TOPS),
    eyes: rng.pick([0x3b2a1a, 0x4a6a3a, 0x3a5a8a, 0x2a1a10]),
    sleeve: hot ? rng.pick([0, 0.45]) : rng.pick([0, 0.45, 0.45, 0.45, 1, 1]),
    legs: hot ? rng.pick([0.42, 0.5]) : rng.pick([1, 1, 1, 0.5, 0.42]),
    style: rng.pick([0, 0, 1, 2]),
  };
}

// ------------------------------------------------------------------ humano
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');

export class Human {
  constructor(factory, app) {
    this.factory = factory;
    this.object = new THREE.Group();
    this.anim = {
      state: 'idle', speed: 0, phase: Math.random() * 6.28, aim: 0, aimPitch: 0, aimYaw: 0, weapon: 'none',
      punchT: 0, reloadT: 0, lean: 0, idleT: Math.random() * 10, deadPose: 0, flail: 0, seat: 0, steer: 0, talk: 0,
    };
    this.setAppearance(app);
  }

  setAppearance(app) {
    this.app = { ...app };
    const bt = BODY_TYPES[app.body] || BODY_TYPES[0];
    this.height = bt.h;
    if (this.mesh) {
      this.object.remove(this.mesh);
      this.mesh.material.dispose();
    }
    const geo = this.factory.geometry(app.body, app.hair);
    const mat = this.factory.material(app);
    const P = restPositions(bt);
    const bones = [];
    for (let i = 0; i < BONE_NAMES.length; i++) {
      const b = new THREE.Bone();
      b.name = BONE_NAMES[i];
      const p = P[i], pp = PARENT[i] >= 0 ? P[PARENT[i]] : [0, 0, 0];
      b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
      b.rotation.order = 'YXZ';
      bones.push(b);
      if (PARENT[i] >= 0) bones[PARENT[i]].add(b);
    }
    this.bones = bones;
    this.rest = bones.map((b) => b.position.clone());
    this.skeleton = new THREE.Skeleton(bones);
    const mesh = new THREE.SkinnedMesh(geo, mat);
    mesh.add(bones[0]);
    mesh.bind(this.skeleton);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, bt.h * 0.5, 0), bt.h * 1.2);
    this.mesh = mesh;
    setDynamic(mesh);
    this.object.add(mesh);
    this.targets = bones.map(() => new THREE.Quaternion());
    this.handR = bones[B.handR];
    this.handL = bones[B.handL];
    this.headBone = bones[B.head];
    if (this.weaponObj) this.handR.add(this.weaponObj);
  }

  setColors(partial) {
    const u = this.mesh.material.userData.u;
    for (const [k, v] of Object.entries(partial)) {
      const key = { skin: 'uSkin', shirt: 'uShirt', pants: 'uPants', shoes: 'uShoes', hairColor: 'uHair', accent: 'uAccent' }[k];
      if (key) u[key].value.set(v);
      if (k === 'sleeve') u.uSleeve.value = v;
      if (k === 'legs') u.uLegs.value = v;
      if (k === 'style') u.uStyle.value = v;
      this.app[k] = v;
    }
  }

  attachWeapon(obj) {
    if (this.weaponObj) this.handR.remove(this.weaponObj);
    this.weaponObj = obj;
    if (obj) this.handR.add(setDynamic(obj));
  }

  dispose() {
    this.mesh.material.dispose();
    if (this.object.parent) this.object.parent.remove(this.object);
  }

  // ---------------------------------------------------------------- animación
  _set(i, x, y, z) {
    _e.set(x, y, z, 'YXZ');
    this.targets[i].setFromEuler(_e);
  }

  /** Calcula la pose objetivo y la mezcla suavemente. */
  animate(dt) {
    const a = this.anim;
    const T = this.targets;
    for (const q of T) q.identity();
    a.idleT += dt;
    let hipBob = 0, hipSway = 0, rootPitch = 0, rootRoll = 0, rootY = 0, rootZ = 0;
    const st = a.state;
    const sp = a.speed;
    if (st === 'walk' || st === 'run' || st === 'sprint' || st === 'idle' || st === 'crouch' || st === 'getup') {
      const moving = sp > 0.15;
      const run = clamp((sp - 2.2) / 3.0, 0, 1);
      const sprint = clamp((sp - 5.5) / 2.0, 0, 1);
      const stride = lerp(1.35, 2.5, run) + sprint * 0.5;
      if (moving) a.phase += (sp / stride) * Math.PI * 2 * dt;
      const ph = a.phase;
      const amp = moving ? clamp(sp / 1.4, 0, 1) : 0;
      const legA = lerp(0.42, 0.78, run) * amp;
      const s = Math.sin(ph), c = Math.cos(ph);
      // muslos (adelante positivo => rotación x negativa)
      const thighL = -s * legA - 0.05 * run;
      const thighR = s * legA - 0.05 * run;
      // rodillas: flexión en la fase de balanceo
      const kneeBase = lerp(0.08, 0.25, run) * amp;
      const kneeL = kneeBase + Math.max(0, -c) * lerp(0.9, 1.7, run) * amp + Math.max(0, s) * 0.15 * amp;
      const kneeR = kneeBase + Math.max(0, c) * lerp(0.9, 1.7, run) * amp + Math.max(0, -s) * 0.15 * amp;
      let crouch = st === 'crouch' ? 1 : st === 'getup' ? 0.8 : 0;
      this._set(B.thighL, thighL - crouch * 0.9, 0, 0.02);
      this._set(B.thighR, thighR - crouch * 0.9, 0, -0.02);
      this._set(B.shinL, kneeL + crouch * 1.4, 0, 0);
      this._set(B.shinR, kneeR + crouch * 1.4, 0, 0);
      this._set(B.footL, -kneeL * 0.35 + thighL * -0.25 - crouch * 0.5, 0, 0);
      this._set(B.footR, -kneeR * 0.35 + thighR * -0.25 - crouch * 0.5, 0, 0);
      hipBob = moving ? -Math.abs(Math.cos(ph)) * lerp(0.03, 0.07, run) + lerp(0.015, 0.05, run) : Math.sin(a.idleT * 1.6) * 0.004;
      hipSway = moving ? s * 0.035 * (1 - run * 0.5) : Math.sin(a.idleT * 0.5) * 0.02;
      rootY = -crouch * 0.38;
      const lean = lerp(0.04, 0.22, run) * amp + sprint * 0.08 + crouch * 0.35;
      this._set(B.hips, 0, -s * 0.12 * amp, hipSway * 0.6);
      this._set(B.spine, lean * 0.5, s * 0.1 * amp, -hipSway * 0.4);
      this._set(B.chest, lean * 0.5 + (moving ? 0 : Math.sin(a.idleT * 1.7) * 0.015), s * 0.12 * amp, a.lean * 0.2);
      this._set(B.neck, -lean * 0.4, 0, 0);
      this._set(B.head, -lean * 0.3 + (moving ? 0 : Math.sin(a.idleT * 0.3) * 0.05), moving ? 0 : Math.sin(a.idleT * 0.23) * 0.25, 0);
      // brazos en contrafase
      const armA = lerp(0.35, 0.95, run) * amp;
      const elbow = lerp(0.25, 1.45, run) * (moving ? 1 : 0.4) + (moving ? 0 : 0.12);
      this._set(B.uarmL, s * armA + 0.05, 0, 0.08 + run * 0.12);
      this._set(B.uarmR, -s * armA + 0.05, 0, -0.08 - run * 0.12);
      this._set(B.farmL, -elbow - Math.max(0, -s) * 0.3 * run, 0, 0);
      this._set(B.farmR, -elbow - Math.max(0, s) * 0.3 * run, 0, 0);
      this._set(B.handL, 0, 0.2, 0);
      this._set(B.handR, 0, -0.2, 0);
    } else if (st === 'jump' || st === 'fall') {
      const f = st === 'fall' ? 1 : 0;
      this._set(B.thighL, -0.7 - f * 0.2, 0, 0.1);
      this._set(B.thighR, -0.2 + f * 0.3, 0, -0.1);
      this._set(B.shinL, 1.1, 0, 0);
      this._set(B.shinR, 0.5 + f * 0.6, 0, 0);
      this._set(B.uarmL, -0.4 - f * 0.8, 0, 0.6 + f * 0.6);
      this._set(B.uarmR, -0.2 - f * 0.8, 0, -0.6 - f * 0.6);
      this._set(B.farmL, -0.6, 0, 0);
      this._set(B.farmR, -0.6, 0, 0);
      this._set(B.spine, 0.1, 0, 0);
      if (f) {
        a.flail += dt * 9;
        T[B.uarmL].multiply(_q.setFromEuler(_e.set(Math.sin(a.flail) * 0.5, 0, 0)));
        T[B.uarmR].multiply(_q.setFromEuler(_e.set(-Math.sin(a.flail) * 0.5, 0, 0)));
      }
    } else if (st === 'swim') {
      a.phase += dt * (2.2 + sp * 0.6);
      const s = Math.sin(a.phase), c = Math.cos(a.phase);
      rootPitch = 1.25;
      rootY = 0.15;
      this._set(B.uarmL, -1.6 + s * 1.6, 0, 0.3);
      this._set(B.uarmR, -1.6 - s * 1.6, 0, -0.3);
      this._set(B.farmL, -0.3 - Math.max(0, c) * 0.6, 0, 0);
      this._set(B.farmR, -0.3 - Math.max(0, -c) * 0.6, 0, 0);
      this._set(B.thighL, Math.sin(a.phase * 2) * 0.35, 0, 0.05);
      this._set(B.thighR, -Math.sin(a.phase * 2) * 0.35, 0, -0.05);
      this._set(B.shinL, 0.2, 0, 0);
      this._set(B.shinR, 0.2, 0, 0);
      this._set(B.neck, -0.9, 0, 0);
      this._set(B.head, -0.3, s * 0.4, 0);
    } else if (st === 'drive' || st === 'ride' || st === 'sit') {
      const ride = st === 'ride';
      this._set(B.thighL, -1.45 + (ride ? 0.2 : 0), 0, ride ? 0.25 : 0.06);
      this._set(B.thighR, -1.45 + (ride ? 0.2 : 0), 0, ride ? -0.25 : -0.06);
      this._set(B.shinL, ride ? 1.2 : 1.35, 0, 0);
      this._set(B.shinR, ride ? 1.2 : 1.35, 0, 0);
      this._set(B.footL, -0.2, 0, 0);
      this._set(B.footR, -0.2, 0, 0);
      if (st !== 'sit') {
        const steer = a.steer || 0;
        this._set(B.uarmL, -0.95 + steer * 0.25, 0, 0.12);
        this._set(B.uarmR, -0.95 - steer * 0.25, 0, -0.12);
        this._set(B.farmL, -0.7, 0.2, 0);
        this._set(B.farmR, -0.7, -0.2, 0);
        this._set(B.spine, ride ? 0.35 : -0.05, 0, steer * 0.06);
        this._set(B.head, ride ? -0.25 : 0, steer * 0.3, 0);
      } else {
        this._set(B.uarmL, -0.25, 0, 0.1);
        this._set(B.uarmR, -0.25, 0, -0.1);
        this._set(B.farmL, -0.9, 0, 0);
        this._set(B.farmR, -0.9, 0, 0);
        this._set(B.spine, -0.05, 0, 0);
      }
      rootY = st === 'sit' ? -0.42 : 0;
    } else if (st === 'dead' || st === 'down') {
      const v = a.deadPose;
      rootPitch = v < 0.5 ? -Math.PI / 2 : Math.PI / 2;
      rootY = 0.11;
      this._set(B.uarmL, -0.4 + v, 0, 1.0 + v * 0.4);
      this._set(B.uarmR, 0.2 - v * 0.5, 0, -0.9 - v * 0.3);
      this._set(B.farmL, -0.5, 0, 0);
      this._set(B.farmR, -0.3, 0, 0);
      this._set(B.thighL, -0.1 * v, 0, 0.2);
      this._set(B.thighR, 0.1, 0, -0.15 - v * 0.2);
      this._set(B.shinL, 0.25 + v * 0.4, 0, 0);
      this._set(B.shinR, 0.1, 0, 0);
      this._set(B.head, 0, v > 0.5 ? 0.9 : -0.6, 0);
    } else if (st === 'ragdoll') {
      a.flail += dt * 14;
      const f = a.flail;
      this._set(B.uarmL, Math.sin(f) * 1.2, 0, 1.2 + Math.cos(f * 1.3) * 0.5);
      this._set(B.uarmR, Math.cos(f * 1.1) * 1.2, 0, -1.2 - Math.sin(f) * 0.5);
      this._set(B.thighL, Math.sin(f * 0.9) * 0.8, 0, 0.3);
      this._set(B.thighR, -Math.sin(f * 0.8) * 0.8, 0, -0.3);
      this._set(B.shinL, 0.8, 0, 0);
      this._set(B.shinR, 0.6, 0, 0);
      this._set(B.spine, Math.sin(f * 0.5) * 0.3, 0, 0);
    } else if (st === 'handsup' || st === 'cower' || st === 'phone') {
      if (st === 'handsup') {
        this._set(B.uarmL, -2.6, 0, 0.35);
        this._set(B.uarmR, -2.6, 0, -0.35);
        this._set(B.farmL, -0.5, 0, 0);
        this._set(B.farmR, -0.5, 0, 0);
        this._set(B.head, 0.1, Math.sin(a.idleT * 2) * 0.2, 0);
      } else if (st === 'cower') {
        rootY = -0.45;
        this._set(B.thighL, -1.6, 0, 0.15);
        this._set(B.thighR, -1.6, 0, -0.15);
        this._set(B.shinL, 2.2, 0, 0);
        this._set(B.shinR, 2.2, 0, 0);
        this._set(B.spine, 0.6, 0, 0);
        this._set(B.chest, 0.3, 0, 0);
        this._set(B.uarmL, -2.4, 0, 0.6);
        this._set(B.uarmR, -2.4, 0, -0.6);
        this._set(B.farmL, -2.0, 0, 0);
        this._set(B.farmR, -2.0, 0, 0);
        this._set(B.head, 0.5, 0, 0);
      } else {
        this._set(B.uarmR, -0.4, 0, -0.6);
        this._set(B.farmR, -2.5, 0, 0.3);
        this._set(B.handR, 0, 0, 0.4);
        this._set(B.uarmL, 0.05, 0, 0.08);
        this._set(B.farmL, -0.15, 0, 0);
        this._set(B.head, 0, Math.sin(a.idleT * 1.3) * 0.15, -0.15);
        hipBob = Math.sin(a.idleT * 1.5) * 0.004;
      }
    }
    // Capa superior: apuntar / golpear / recargar (sólo de pie o en vehículo)
    const upperOK = st === 'idle' || st === 'walk' || st === 'run' || st === 'crouch' || st === 'drive' || st === 'jump';
    if (upperOK && (a.aim > 0.01 || a.punchT > 0 || a.reloadT > 0)) {
      const ap = a.aimPitch || 0;
      const ay = clamp(a.aimYaw || 0, -1.2, 1.2);
      if (a.punchT > 0) {
        const t = 1 - a.punchT / 0.35;
        const ext = Math.sin(Math.min(1, t * 1.6) * Math.PI);
        this._set(B.uarmR, -1.45 * ext - 0.3, 0.2 * ext, -0.25);
        this._set(B.farmR, -1.6 * (1 - ext) - 0.1, 0, 0);
        this._set(B.uarmL, -0.9, 0, 0.25);
        this._set(B.farmL, -1.9, 0, 0);
        this._set(B.chest, 0.1, -0.5 * ext, 0);
      } else if (a.weapon === 'pistol' || a.weapon === 'smg') {
        const k = a.aim;
        this._set(B.chest, -ap * 0.3, ay * 0.6 * k, 0);
        this._set(B.uarmR, (-Math.PI / 2 - ap * 0.7) * k + 0.05 * (1 - k), ay * 0.35 * k, -0.1);
        this._set(B.farmR, -0.05, 0, 0);
        this._set(B.uarmL, (-1.25 - ap * 0.6) * k, (ay * 0.3 - 0.55) * k, 0.1);
        this._set(B.farmL, -0.6 * k, 0, 0);
        this._set(B.head, -ap * 0.4 * k, ay * 0.3 * k, 0);
      } else if (a.weapon === 'rifle' || a.weapon === 'heavy') {
        const k = a.aim > 0.01 ? a.aim : 0.35;
        this._set(B.chest, -ap * 0.3, (ay * 0.6 - 0.2) * k, 0);
        this._set(B.uarmR, (-1.2 - ap * 0.6) * k, (0.35 + ay * 0.2) * k, -0.25);
        this._set(B.farmR, -1.2 * k, 0, 0);
        this._set(B.uarmL, (-1.35 - ap * 0.6) * k, (-0.6 + ay * 0.2) * k, 0.15);
        this._set(B.farmL, -0.35 * k, 0, 0);
        this._set(B.head, -ap * 0.4 * k, ay * 0.3 * k, 0.1 * k);
      } else if (a.weapon === 'melee') {
        this._set(B.uarmR, -0.6, 0, -0.3);
        this._set(B.farmR, -1.3, 0, 0);
      }
      if (a.reloadT > 0) {
        const t = Math.sin((1 - a.reloadT / 1.2) * Math.PI);
        this._set(B.uarmL, -1.0, -0.4, 0.2);
        this._set(B.farmL, -1.5 - t * 0.5, 0, 0);
        this._set(B.uarmR, -0.9, 0.3, -0.2);
        this._set(B.farmR, -1.4, 0, 0);
        this._set(B.head, 0.35, 0.1, 0);
      }
    } else if (upperOK && (a.weapon === 'rifle' || a.weapon === 'heavy') && st !== 'drive') {
      // arma larga en reposo (cruzada)
      this._set(B.uarmR, -0.45, 0.3, -0.25);
      this._set(B.farmR, -1.1, 0, 0);
      this._set(B.uarmL, -0.75, -0.5, 0.15);
      this._set(B.farmL, -0.9, 0, 0);
    }
    if (a.punchT > 0) a.punchT = Math.max(0, a.punchT - dt);
    if (a.reloadT > 0) a.reloadT = Math.max(0, a.reloadT - dt);
    // Raíz (todo el cuerpo)
    _e.set(rootPitch, 0, rootRoll, 'YXZ');
    T[B.root].setFromEuler(_e);
    // Mezcla
    const k = 1 - Math.exp(-dt * (st === 'dead' || st === 'down' ? 6 : st === 'ragdoll' ? 18 : st === 'getup' ? 4 : 14));
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.slerp(T[i], k);
    const hips = this.bones[B.hips];
    const restH = this.rest[B.hips];
    hips.position.y = damp(hips.position.y, restH.y + hipBob, 20, dt);
    hips.position.x = damp(hips.position.x, hipSway * 0.5, 10, dt);
    const root = this.bones[B.root];
    root.position.y = damp(root.position.y, rootY, 10, dt);
    root.position.z = damp(root.position.z, rootZ, 10, dt);
  }
}

export { B as BONES, R as REGIONS };

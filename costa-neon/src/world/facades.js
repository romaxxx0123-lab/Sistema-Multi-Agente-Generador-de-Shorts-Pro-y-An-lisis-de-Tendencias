// Fachadas con volumen: delante de cada caja de edificio va un muro de espesor real (20 cm) con un hueco
// por ventana; el vidrio (con su interior, cortinas y luces, dibujado por el shader de la caja) queda
// hundido detrás, con jambas, dintel y alféizar que proyectan sombras y reciben oclusión de verdad.
// Las torres de vidrio llevan parteluces y travesaños de aluminio en relieve en lugar de muro.
// La grilla de ventanas es la misma que usa el shader de fachada (materials.js) para que coincidan.
import * as THREE from 'three';
import { FACADE_STYLES } from './materials.js';
import { GLSL_ARRAY_SAMPLING } from './textures.js';
import { GLSL_WORLD_TO_VIEW_NORMAL } from './shaders.js';

const T = 0.2; // muro por delante del vidrio
const PARAPET = 0.55; // pretil sobre azoteas planas
const SILL_OUT = 0.06, SILL_H = 0.06, SILL_X = 0.05;
const MULL_D = 0.12, MULL_W = 0.07; // parteluces de las torres de vidrio
const CHUNK = 160;
const SKIN_STYLES = ['office', 'brick', 'pastel', 'shop', 'house'];
const FIN_STYLES = ['glass'];

const f32 = Math.fround;
const fract = (x) => x - Math.floor(x);
/** Mismo hash12 que el GLSL (aproximado en float32) para saber qué ventanas omite el estilo SPARSE. */
function hash12(x, y) {
  let a = f32(fract(f32(x * 0.1031))), b = f32(fract(f32(y * 0.1031))), c = a;
  const d = f32(a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33));
  a += d; b += d; c += d;
  return fract(f32((a + b) * c));
}

/** Arreglos que crecen solos para armar geometría grande sin copias intermedias. */
class Builder {
  constructor() {
    this.n = 0;
    this.cap = 4096;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Float32Array(this.cap * 3);
    this.tan = new Float32Array(this.cap * 3);
    this.face = new Float32Array(this.cap * 2);
    this.col = new Float32Array(this.cap * 3);
    this.seed = new Float32Array(this.cap);
    this.grid = new Float32Array(this.cap * 2);
    this.cur = [0, 0];
    this.idx = [];
  }
  _grow() {
    this.cap *= 2;
    for (const k of ['pos', 'nrm', 'tan', 'col']) { const a = new Float32Array(this.cap * 3); a.set(this[k]); this[k] = a; }
    const f = new Float32Array(this.cap * 2); f.set(this.face); this.face = f;
    const s = new Float32Array(this.cap); s.set(this.seed); this.seed = s;
    const gr = new Float32Array(this.cap * 2); gr.set(this.grid); this.grid = gr;
  }
  vert(p, n, t, u, v, c, ao, seed) {
    if (this.n >= this.cap) this._grow();
    const i = this.n++;
    this.pos.set(p, i * 3);
    this.nrm.set(n, i * 3);
    this.tan.set(t, i * 3);
    this.face[i * 2] = u;
    this.face[i * 2 + 1] = v;
    this.col[i * 3] = c.r * ao;
    this.col[i * 3 + 1] = c.g * ao;
    this.col[i * 3 + 2] = c.b * ao;
    this.seed[i] = seed;
    this.grid[i * 2] = this.cur[0];
    this.grid[i * 2 + 1] = this.cur[1];
    return i;
  }
  /** Cuadrilátero (4 puntos en orden antihorario visto desde la normal). */
  quad(P, n, t, UV, c, AO, seed) {
    const i = this.vert(P[0], n, t, UV[0][0], UV[0][1], c, AO[0], seed);
    this.vert(P[1], n, t, UV[1][0], UV[1][1], c, AO[1], seed);
    this.vert(P[2], n, t, UV[2][0], UV[2][1], c, AO[2], seed);
    this.vert(P[3], n, t, UV[3][0], UV[3][1], c, AO[3], seed);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, n * 3), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(this.tan.slice(0, n * 3), 3));
    g.setAttribute('aFace', new THREE.BufferAttribute(this.face.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed.slice(0, n), 1));
    g.setAttribute('aGrid', new THREE.BufferAttribute(this.grid.slice(0, n * 2), 2));
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Cara de la caja: origen (esquina inferior izquierda sobre la caja), normal, tangente (sentido de u) y ancho. */
function facesOf(b) {
  const hw = b.w / 2, hd = b.d / 2;
  return [
    { n: [1, 0, 0], t: [0, 0, 1], o: [b.x + hw, b.y0, b.z - hd], w: b.d, id: 3 },
    { n: [-1, 0, 0], t: [0, 0, 1], o: [b.x - hw, b.y0, b.z - hd], w: b.d, id: 2 },
    { n: [0, 0, 1], t: [1, 0, 0], o: [b.x - hw, b.y0, b.z + hd], w: b.w, id: 7 },
    { n: [0, 0, -1], t: [1, 0, 0], o: [b.x - hw, b.y0, b.z - hd], w: b.w, id: 5 },
  ];
}

/** Huecos (u0, u1, v0, v1, profundidad, alféizar) de una cara según la misma grilla que el shader. */
function openings(b, S, f) {
  const flags = new Set(S.flags);
  const cols = Math.max(1, Math.floor(f.w / S.cw + 0.5));
  const cw = f.w / cols;
  const floors = Math.max(1, Math.floor((b.h - S.top) / S.fh));
  const out = [];
  for (let j = 0; j < floors; j++) {
    for (let i = 0; i < cols; i++) {
      let wx0 = S.wx0, wx1 = S.wx1, wy0 = S.wy0, wy1 = S.wy1;
      if (j === 0 && flags.has('STOREFRONT')) { wx0 = 0.04; wx1 = 0.96; wy0 = 0.05; wy1 = 0.8; }
      if (j === 0 && (flags.has('TINTED') || flags.has('LEDGE'))) { wy0 = 0.04; wy1 = 0.9; }
      let has = true;
      if (flags.has('SPARSE')) {
        has = hash12(i + f.id * 11, j * 3 + b.seed * 50) >= 0.3;
        if (j === 0 && Math.abs(i - Math.floor(cols * 0.5)) < 0.5) {
          // puerta de entrada (el shader la pinta oscura)
          out.push({ u0: (i + 0.36) * cw, u1: (i + 0.64) * cw, v0: 0, v1: 0.74 * S.fh, depth: 0.12, sill: false, door: true });
          continue;
        }
      }
      if (!has) continue;
      out.push({ u0: (i + wx0) * cw, u1: (i + wx1) * cw, v0: (j + wy0) * S.fh, v1: (j + wy1) * S.fh, depth: T, sill: j > 0 && !flags.has('BALCONY'), door: false });
    }
  }
  return { list: out, cols, cw, floors };
}

const _c = new THREE.Color();

/** El orden de los puntos está escrito para caras con cross(t, arriba) = n; si no, se invierte el giro. */
function flipOf(f) {
  return -f.t[2] * f.n[0] + f.t[0] * f.n[2] < 0;
}

function at(f, u, v, d) {
  // punto de la cara: u a lo largo, v hacia arriba, d hacia afuera
  return [f.o[0] + f.t[0] * u + f.n[0] * d, f.o[1] + v, f.o[2] + f.t[2] * u + f.n[2] * d];
}

/** Muro con huecos + jambas, dinteles, alféizares, tapa y pretil de una cara. */
function skinFace(B, b, S, f, top) {
  const { list, cw } = openings(b, S, f);
  const c = _c.set(b.color);
  const seed = b.seed;
  const n = f.n, t = f.t, up = [0, 1, 0];
  const flip = flipOf(f);
  const Q = (P, nn, tt, UV, AO) => {
    if (flip) B.quad([P[1], P[0], P[3], P[2]], nn, tt, [UV[1], UV[0], UV[3], UV[2]], c, [AO[1], AO[0], AO[3], AO[2]], seed);
    else B.quad(P, nn, tt, UV, c, AO, seed);
  };
  // --- superficie exterior: franjas horizontales entre los bordes de los huecos
  const ys = new Set([0, top]);
  for (const o of list) { ys.add(o.v0); ys.add(o.v1); }
  const yv = [...ys].filter((y) => y >= 0 && y <= top).sort((a, b2) => a - b2);
  for (let k = 0; k < yv.length - 1; k++) {
    const y0 = yv[k], y1 = yv[k + 1];
    if (y1 - y0 < 1e-4) continue;
    const ym = (y0 + y1) / 2;
    const cut = list.filter((o) => o.v0 <= ym && o.v1 >= ym).map((o) => [o.u0, o.u1]).sort((a, b2) => a[0] - b2[0]);
    let u = -T;
    const segs = [];
    for (const [a, e] of cut) {
      if (a > u + 1e-4) segs.push([u, a]);
      u = Math.max(u, e);
    }
    if (f.w + T > u + 1e-4) segs.push([u, f.w + T]);
    B.cur = [cw, top];
    for (const [u0, u1] of segs) {
      Q([at(f, u0, y0, T), at(f, u1, y0, T), at(f, u1, y1, T), at(f, u0, y1, T)], n, t, [[u0, y0], [u1, y0], [u1, y1], [u0, y1]], [1, 1, 1, 1]);
    }
    B.cur = [0, top];
  }
  // --- jambas, dintel y piso de cada hueco
  for (const o of list) {
    const d = o.depth;
    const aoIn = o.door ? 0.5 : 0.62, aoOut = 0.92;
    // jamba izquierda (mira hacia +u)
    Q([at(f, o.u0, o.v0, d), at(f, o.u0, o.v0, 0), at(f, o.u0, o.v1, 0), at(f, o.u0, o.v1, d)],
      t, n, [[0, o.v0], [d, o.v0], [d, o.v1], [0, o.v1]], [aoOut, aoIn, aoIn, aoOut]);
    // jamba derecha (mira hacia -u)
    Q([at(f, o.u1, o.v0, 0), at(f, o.u1, o.v0, d), at(f, o.u1, o.v1, d), at(f, o.u1, o.v1, 0)],
      [-t[0], 0, -t[2]], n, [[d, o.v0], [0, o.v0], [0, o.v1], [d, o.v1]], [aoIn, aoOut, aoOut, aoIn]);
    // dintel (mira hacia abajo)
    Q([at(f, o.u0, o.v1, d), at(f, o.u0, o.v1, 0), at(f, o.u1, o.v1, 0), at(f, o.u1, o.v1, d)],
      [0, -1, 0], t, [[o.u0, 0], [o.u0, d], [o.u1, d], [o.u1, 0]], [aoOut * 0.85, aoIn * 0.8, aoIn * 0.8, aoOut * 0.85]);
    // piso del hueco (mira hacia arriba)
    if (o.v0 > 0.01) {
      Q([at(f, o.u0, o.v0, 0), at(f, o.u0, o.v0, d), at(f, o.u1, o.v0, d), at(f, o.u1, o.v0, 0)],
        up, t, [[o.u0, d], [o.u0, 0], [o.u1, 0], [o.u1, d]], [aoIn + 0.15, 1, 1, aoIn + 0.15]);
    }
    // alféizar que sobresale bajo la ventana
    if (o.sill) {
      const a = o.u0 - SILL_X, e = o.u1 + SILL_X, y1 = o.v0, y0 = o.v0 - SILL_H, d1 = T + SILL_OUT;
      Q([at(f, a, y1, d1), at(f, e, y1, d1), at(f, e, y1, T), at(f, a, y1, T)], up, t, [[a, d1], [e, d1], [e, T], [a, T]], [1, 1, 0.9, 0.9]);
      Q([at(f, a, y0, d1), at(f, e, y0, d1), at(f, e, y1, d1), at(f, a, y1, d1)], n, t, [[a, y0], [e, y0], [e, y1], [a, y1]], [0.95, 0.95, 1, 1]);
      Q([at(f, a, y0, T), at(f, e, y0, T), at(f, e, y0, d1), at(f, a, y0, d1)], [0, -1, 0], t, [[a, T], [e, T], [e, d1], [a, d1]], [0.45, 0.45, 0.6, 0.6]);
      Q([at(f, a, y0, T), at(f, a, y0, d1), at(f, a, y1, d1), at(f, a, y1, T)], [-t[0], 0, -t[2]], n, [[T, y0], [d1, y0], [d1, y1], [T, y1]], [0.8, 0.9, 0.9, 0.8]);
      Q([at(f, e, y0, d1), at(f, e, y0, T), at(f, e, y1, T), at(f, e, y1, d1)], t, n, [[d1, y0], [T, y0], [T, y1], [d1, y1]], [0.9, 0.8, 0.8, 0.9]);
    }
  }
  // --- tapa superior del espesor y cara interior del pretil
  // (las esquinas de la tapa las cubren sólo las caras ±x, para no superponer dos quads)
  const c0 = f.t[2] ? -T : 0, c1 = f.t[2] ? f.w + T : f.w;
  Q([at(f, c0, top, T), at(f, c1, top, T), at(f, c1, top, 0), at(f, c0, top, 0)], up, t,
    [[c0, T], [c1, T], [c1, 0], [c0, 0]], [1, 1, 0.95, 0.95]);
  if (top > b.h + 0.01) {
    Q([at(f, f.w, b.h, 0), at(f, 0, b.h, 0), at(f, 0, top, 0), at(f, f.w, top, 0)], [-n[0], 0, -n[2]], t,
      [[f.w, b.h], [0, b.h], [0, top], [f.w, top]], [0.7, 0.7, 0.95, 0.95]);
  }
}

/** Torres de vidrio: parteluces verticales y travesaños en relieve sobre el muro cortina. */
function finsFace(B, b, S, f) {
  const cols = Math.max(1, Math.floor(f.w / S.cw + 0.5));
  const cw = f.w / cols;
  const floors = Math.max(1, Math.floor((b.h - S.top) / S.fh));
  const c = _c.setRGB(0.55, 0.57, 0.6);
  const seed = b.seed;
  const box = (u0, u1, v0, v1, d0, d1, ao) => {
    const P = (u, v, d) => at(f, u, v, d);
    const flip = flipOf(f);
    const quad = (pts, nn, tt, uv, a) => {
      if (flip) B.quad([pts[1], pts[0], pts[3], pts[2]], nn, tt, [uv[1], uv[0], uv[3], uv[2]], c, [a, a, a, a], seed);
      else B.quad(pts, nn, tt, uv, c, [a, a, a, a], seed);
    };
    quad([P(u0, v0, d1), P(u1, v0, d1), P(u1, v1, d1), P(u0, v1, d1)], f.n, f.t, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], ao);
    quad([P(u0, v0, d0), P(u0, v0, d1), P(u0, v1, d1), P(u0, v1, d0)], [-f.t[0], 0, -f.t[2]], f.n, [[d0, v0], [d1, v0], [d1, v1], [d0, v1]], ao * 0.8);
    quad([P(u1, v0, d1), P(u1, v0, d0), P(u1, v1, d0), P(u1, v1, d1)], f.t, f.n, [[d1, v0], [d0, v0], [d0, v1], [d1, v1]], ao * 0.8);
    quad([P(u0, v1, d1), P(u1, v1, d1), P(u1, v1, d0), P(u0, v1, d0)], [0, 1, 0], f.t, [[u0, d1], [u1, d1], [u1, d0], [u0, d0]], ao);
    quad([P(u0, v0, d0), P(u1, v0, d0), P(u1, v0, d1), P(u0, v0, d1)], [0, -1, 0], f.t, [[u0, d0], [u1, d0], [u1, d1], [u0, d1]], ao * 0.6);
  };
  for (let i = 0; i <= cols; i++) box(i * cw - MULL_W / 2, i * cw + MULL_W / 2, 0, b.h, 0, MULL_D, 1);
  for (let j = 1; j <= floors; j++) {
    box(-MULL_W / 2, f.w + MULL_W / 2, j * S.fh - MULL_W / 2, j * S.fh + MULL_W / 2, 0, MULL_D * 0.8, 0.95);
    box(-MULL_W / 2, f.w + MULL_W / 2, (j - 1 + S.wy0) * S.fh - 0.03, (j - 1 + S.wy0) * S.fh + 0.03, 0, MULL_D * 0.6, 0.95);
  }
}

export class FacadeSkins {
  constructor(group, world, lib) {
    this.group = group;
    this.lib = lib;
    this.chunks = [];
    this.maxDist = 650;
    const byKey = new Map();
    for (const b of world.buildings) {
      const S = FACADE_STYLES[b.style];
      const skin = SKIN_STYLES.includes(b.style), fins = FIN_STYLES.includes(b.style);
      if (!S || (!skin && !fins) || b.h < 3) continue;
      const key = (skin ? 'skin_' : 'fins_') + b.style + '|' + Math.floor(b.x / CHUNK) + ',' + Math.floor(b.z / CHUNK);
      if (!byKey.has(key)) byKey.set(key, { style: b.style, skin, list: [] });
      byKey.get(key).list.push(b);
    }
    let tris = 0;
    for (const [key, g] of byKey) {
      const B = new Builder();
      const S = FACADE_STYLES[g.style];
      let cx = 0, cz = 0;
      for (const b of g.list) {
        const top = b.h + (b.roof === 1 ? 0 : PARAPET);
        for (const f of facesOf(b)) {
          if (g.skin) skinFace(B, b, S, f, top);
          else finsFace(B, b, S, f);
        }
        cx += b.x;
        cz += b.z;
      }
      const geo = B.geometry();
      tris += geo.index.count / 3;
      const mesh = new THREE.Mesh(geo, g.skin ? this.material(g.style) : this.finMaterial());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'fachada_' + key;
      group.add(mesh);
      cx /= g.list.length;
      cz /= g.list.length;
      let r = 0;
      for (const b of g.list) r = Math.max(r, Math.hypot(b.x - cx, b.z - cz) + Math.hypot(b.w, b.d) / 2);
      this.chunks.push({ mesh, cx, cz, r });
    }
    this.tris = tris;
  }

  material(style) {
    const S = FACADE_STYLES[style];
    const lib = this.lib;
    const key = 'skin_' + style;
    if (lib.cache.has(key)) return lib.cache.get(key);
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, vertexColors: true });
    const fl = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));
    m.defines = { DTILE: fl(S.tile), DLAYER: fl(S.detail), FH: fl(S.fh), WX0: fl(S.wx0), WX1: fl(S.wx1), WY0: fl(S.wy0),
      STREAK: fl(S.flags.includes('SPARSE') ? 0.4 : 1.0) };
    lib.register(m, {
      key,
      lamps: true,
      uniforms: { uDA: { value: lib.detail.albedo }, uDN: { value: lib.detail.normal } },
      vertexHead: 'attribute vec2 aFace; attribute vec3 aT; attribute float aSeed; attribute vec2 aGrid; varying vec2 vFace; varying vec3 vT; varying float vSeed; varying vec2 vGrid;',
      vertexWorld: 'vFace = aFace; vT = aT; vSeed = aSeed; vGrid = aGrid;',
      fragHead: `uniform sampler2DArray uDA; uniform sampler2DArray uDN; varying vec2 vFace; varying vec3 vT; varying float vSeed; varying vec2 vGrid;
        ${GLSL_ARRAY_SAMPLING} ${GLSL_WORLD_TO_VIEW_NORMAL}`,
      fragColor: `
        vec3 sN = normalize(vWNrm);
        vec3 sT = normalize(vT - sN * dot(vT, sN) + 1e-5);
        vec3 sB = cross(sT, sN);
        vec2 duv = vFace / DTILE + vSeed * 7.;
        vec4 dA = sampleDet(uDA, duv, DLAYER);
        vec4 dN = sampleNrm(uDN, duv, DLAYER);
        vec3 alb = diffuseColor.rgb * dA.rgb;
        float hY = vWPos.y;
        alb *= mix(.68, 1., smoothstep(0., 1.4, vFace.y));
        alb *= .9 + .1 * fbm3(vec2(vFace.x * .04, vFace.y * .015) + vSeed * 30.);
        alb *= 1. - .08 * smoothstep(.6, .9, vnoise(vec2(vFace.x * 1.3, vFace.y * .05 + vSeed * 9.)));
        // desgaste: chorreaduras bajo los extremos de cada alféizar y desde el pretil, mugre al pie,
        // pintura despareja por sol y repintados
        float sd = floor(vSeed * 8192. + .5) / 8192.;
        float dirt = 0.;
        if (vGrid.x > .1) {
          float cu = vFace.x / vGrid.x, fu = fract(cu);
          float cv = vFace.y / FH, fv = fract(cv);
          float below = (WY0 - fv) * FH;
          float zone = step(0., below) * step(1., cv);
          float ends = exp(-pow((fu - WX0) * 16., 2.)) + exp(-pow((fu - WX1) * 16., 2.));
          float mid = smoothstep(.6, .92, vnoise(vec2(vFace.x * 3.1, floor(cv) * 7.7 + sd * 5.))) * step(WX0, fu) * step(fu, WX1);
          float streak = (ends * .8 + mid * .55) * exp(-below / 1.15) * zone;
          streak *= .55 + .45 * vnoise(vec2(vFace.x * 9., vFace.y * .7));
          float fromTop = vGrid.y - vFace.y;
          float topS = smoothstep(.45, .85, vnoise(vec2(vFace.x * 1.9 + sd * 31., .5))) * exp(-max(fromTop, 0.) / 2.6);
          dirt = (streak * .32 + topS * .3) * STREAK;
        }
        float base = 1. - smoothstep(0., .9, vFace.y + .3 * vnoise(vec2(vFace.x * 2.3, sd * 9.)));
        dirt += .22 * base;
        alb *= 1. - clamp(dirt, 0., .5);
        alb *= .93 + .12 * fbm3(vec2(vFace.x * .07 + sd * 13., vFace.y * .09));
        alb *= mix(1., .72, uWet);
        diffuseColor.rgb = alb;
        float sRough = dA.a;
        vec3 sNW = normalize(sT * dN.x * .7 + sB * dN.y * .7 + sN * dN.z);`,
      fragRoughness: 'roughnessFactor = mix(sRough, sRough * .45, uWet);',
      fragNormal: 'normal = cnWorldToViewN(sNW);',
      fragEmissive: 'totalEmissiveRadiance += alb * LAMP_COLOR * streetLamps(vWPos) * uLamps * .8;',
    });
    lib.cache.set(key, m);
    return m;
  }

  finMaterial() {
    const lib = this.lib;
    if (lib.cache.has('skin_fins')) return lib.cache.get('skin_fins');
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.75, vertexColors: true });
    lib.register(m, { key: 'skin_fins', lamps: true, fragColor: 'diffuseColor.rgb *= mix(1., .8, uWet);' });
    lib.cache.set('skin_fins', m);
    return m;
  }

  update(camPos, distScale = 1) {
    for (const c of this.chunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) - c.r;
      c.mesh.visible = d < this.maxDist * distScale;
    }
  }
}

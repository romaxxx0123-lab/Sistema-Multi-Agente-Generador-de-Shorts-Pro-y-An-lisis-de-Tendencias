// Vegetación procedural: palmeras y árboles de copa, instanciados con viento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RNG, hash2 } from '../core/utils.js';
import { DETAIL } from './textures.js';
import { ChunkedInstances } from './instancing.js';

function frondTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 512);
  const rng = new RNG(1234);
  // folíolos como hojas lanceoladas rellenas (anchas en la base, en punta), con pequeños huecos entre sí
  for (let i = 0; i < 64; i++) {
    const v = 10 + i * 7.6 + rng.range(-1.5, 1.5);
    const t = v / 512;
    const len = 114 * Math.sin(Math.min(1, t * 1.08 + 0.07) * Math.PI) * rng.range(0.82, 1.04) + 8;
    for (const s of [-1, 1]) {
      const shade = rng.range(0.72, 1.12);
      const yellow = rng.next() < 0.1 ? 1.3 : 1;
      g.fillStyle = `rgb(${(46 * shade * yellow) | 0},${(96 * shade + 8) | 0},${(24 * shade) | 0})`;
      const droop = 26 + t * 26;
      const w0 = 4.6 - t * 1.8;
      const tx = 128 + s * len, ty = v + droop;
      const mx = 128 + s * len * 0.5, my = v + droop * 0.32;
      g.beginPath();
      g.moveTo(128 + s * 2, v - w0 * 0.5);
      g.quadraticCurveTo(mx, my - w0, tx, ty);
      g.quadraticCurveTo(mx, my + w0, 128 + s * 2, v + w0 * 0.5);
      g.closePath();
      g.fill();
      if (rng.next() < 0.18) {
        g.fillStyle = 'rgb(126,108,60)';
        g.beginPath();
        g.moveTo(128 + s * len * 0.82, v + droop * 0.8 - 1.5);
        g.lineTo(tx, ty);
        g.lineTo(128 + s * len * 0.82, v + droop * 0.8 + 1.5);
        g.closePath();
        g.fill();
      }
    }
  }
  g.strokeStyle = 'rgb(104,112,52)';
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo(128, 0);
  g.lineTo(128, 512);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function leafClusterTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = new RNG(77);
  for (let i = 0; i < 420; i++) {
    const a = r.next() * Math.PI * 2, d = Math.sqrt(r.next()) * 112;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const sh = 0.6 + r.next() * 0.55;
    g.fillStyle = `rgb(${(45 * sh) | 0},${(95 * sh + 10) | 0},${(30 * sh) | 0})`;
    g.save();
    g.translate(x, y);
    g.rotate(r.next() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, 7 + r.next() * 4, 3.5 + r.next() * 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tronco curvo y ahusado. */
function trunkGeometry(height, r0, r1, bend, rings = 9, sides = 7) {
  const P = [], N = [], UV = [], I = [];
  const pts = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const x = bend * (t * t * 0.8 + Math.sin(t * Math.PI) * 0.2);
    pts.push(new THREE.Vector3(x, height * t, 0));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(rings, false);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const c = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.7)) * (1 + (i === 0 ? 0.35 : 0));
    const nrm = frames.normals[i], bin = frames.binormals[i];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const n = new THREE.Vector3().addScaledVector(nrm, dx).addScaledVector(bin, dy).normalize();
      P.push(c.x + n.x * r, c.y + n.y * r, c.z + n.z * r);
      N.push(n.x, n.y, n.z);
      UV.push(k / sides, (t * height) / 2.5);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let k = 0; k < sides; k++) {
      const a = i * (sides + 1) + k, b = a + sides + 1;
      I.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  return { geo: g, top: curve.getPointAt(1) };
}

/** Fronda de palmera: tira arqueada con sección en V. */
function frondGeometry(top, az, lift, length, dead = false) {
  const segs = 7;
  const P = [], UV = [], C = [], I = [];
  const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const col = dead ? [0.55, 0.42, 0.26] : [1, 1, 1];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ang = lift - t * t * (dead ? 2.6 : 1.9);
    const along = length * t;
    const p = new THREE.Vector3(top.x, top.y, top.z)
      .addScaledVector(dir, Math.cos(lift) * along * 0.9 + Math.sin(t * 1.4) * 0.1)
      .add(new THREE.Vector3(0, Math.sin(ang) * along * 0.75 - t * t * (dead ? 2.2 : 0.9), 0));
    const w = (0.18 + Math.sin(Math.min(1, t * 1.1) * Math.PI) * 0.95) * (dead ? 0.6 : 1);
    const fold = 0.28 * w;
    for (const s of [-1, 0, 1]) {
      const q = p.clone().addScaledVector(side, s * w);
      if (s !== 0) q.y -= fold;
      P.push(q.x, q.y, q.z);
      UV.push((s + 1) / 2, t);
      C.push(...col);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 3;
    I.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

function palmVariant(seed) {
  const r = new RNG(seed);
  const h = r.range(7, 10.5);
  const { geo: trunk, top } = trunkGeometry(h, 0.3, 0.19, r.range(0.4, 1.6));
  const fronds = [];
  const n = r.int(11, 15);
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2 + r.range(-0.2, 0.2);
    fronds.push(frondGeometry(top, az, r.range(0.25, 0.75), r.range(3.6, 4.8)));
  }
  for (let i = 0; i < 3; i++) fronds.push(frondGeometry({ x: top.x, y: top.y - 0.3, z: top.z }, r.range(0, Math.PI * 2), -0.6, r.range(2.6, 3.2), true));
  const crown = mergeGeometries(fronds);
  // normales suavizadas hacia afuera para iluminación volumétrica
  const pos = crown.attributes.position, nor = crown.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3(pos.getX(i) - top.x, (pos.getY(i) - top.y) * 0.6 + 0.6, pos.getZ(i) - top.z).normalize();
    const n0 = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
    if (n0.y < 0) n0.negate();
    n0.lerp(v, 0.55).normalize();
    nor.setXYZ(i, n0.x, n0.y, n0.z);
  }
  return { trunk, crown, swayBase: h - 1.5 };
}

function roundTreeVariant(seed) {
  const r = new RNG(seed);
  const h = r.range(3.2, 4.2);
  const parts = [];
  const { geo: trunk } = trunkGeometry(h, 0.22, 0.13, r.range(0.1, 0.4), 6, 7);
  parts.push(trunk);
  // ramas
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + r.range(-0.3, 0.3);
    const len = r.range(1.4, 2.2);
    const b = new THREE.CylinderGeometry(0.05, 0.1, len, 5);
    b.translate(0, len / 2, 0);
    b.rotateZ(-0.75);
    b.rotateY(a);
    b.translate(0, h * 0.75, 0);
    parts.push(b);
  }
  const trunkAll = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
    if (!p.attributes.uv) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
    p.deleteAttribute && p.attributes.normal === undefined && p.computeVertexNormals();
    return p;
  }));
  // copa: tarjetas de hojas en nube esférica
  const cards = [];
  const center = new THREE.Vector3(0, h + 1.6, 0);
  const R = r.range(2.2, 2.9);
  for (let i = 0; i < 46; i++) {
    const card = new THREE.PlaneGeometry(1.9, 1.9);
    const dir = new THREE.Vector3(r.range(-1, 1), r.range(-0.6, 1), r.range(-1, 1)).normalize();
    const pos = center.clone().addScaledVector(dir, R * Math.cbrt(r.range(0.25, 1)));
    card.lookAt(dir);
    card.rotateZ(r.next() * Math.PI);
    card.translate(pos.x, pos.y, pos.z);
    cards.push(card);
  }
  const crown = mergeGeometries(cards);
  const p = crown.attributes.position, n = crown.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3(p.getX(i) - center.x, (p.getY(i) - center.y) * 1.2, p.getZ(i) - center.z).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  const col = new Float32Array(p.count * 3).fill(1);
  crown.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { trunk: trunkAll, crown, swayBase: h };
}

/** Follaje hecho con hojas reales escaneadas (veg/leaves.webp, veg/frond.webp; ver tools/vegetation).
 * Devuelve null si no se pudo cargar (quedan las texturas dibujadas). */
export async function loadFoliageTextures(base = 'veg/') {
  try {
    const load = async (name) => {
      const r = await fetch(base + name);
      if (!r.ok) throw new Error(name + ' ' + r.status);
      const bmp = await createImageBitmap(await r.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none' });
      const t = new THREE.Texture(bmp);
      t.flipY = false;
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      t.needsUpdate = true;
      return t;
    };
    const [leaves, frond] = await Promise.all([load('leaves.webp'), load('frond.webp')]);
    return { leaves, frond };
  } catch (e) {
    console.warn('Follaje escaneado no disponible; quedan las hojas dibujadas.', e && e.message);
    return null;
  }
}

export class Vegetation {
  constructor(engine, world, lib, foliage = null) {
    this.group = new THREE.Group();
    this.group.name = 'vegetacion';
    engine.scene.add(this.group);
    this.chunked = [];
    const frondTex = foliage ? foliage.frond : frondTexture();
    const leafTex = foliage ? foliage.leaves : leafClusterTexture();
    const bark = lib.detailed(DETAIL.BARK, 0xffffff, { roughness: 0.95 }, 1);
    const barkTree = lib.detailed(DETAIL.BARK, 0x8a7a6a, { roughness: 0.95 }, 1);
    const palms = [palmVariant(11), palmVariant(23), palmVariant(37)];
    const rounds = [roundTreeVariant(5), roundTreeVariant(9)];
    const buckets = { palm: palms.map(() => []), round: rounds.map(() => []) };
    for (const t of world.trees) {
      const list = t.type === 'palm' ? buckets.palm : buckets.round;
      const v = Math.floor(hash2(Math.round(t.x * 3), Math.round(t.z * 7)) * list.length) % list.length;
      list[v].push(t);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
    const build = (variants, lists, isPalm) => {
      variants.forEach((v, i) => {
        const list = lists[i];
        if (!list.length) return;
        const crownMat = lib.foliage(isPalm ? frondTex : leafTex, { vertexColors: true, palm: isPalm, swayBase: v.swayBase, roughness: isPalm ? 0.6 : 0.8 });
        const opts = { chunk: 380, maxDist: isPalm ? 720 : 520, shadowDist: 300 };
        const trunk = new ChunkedInstances(this.group, v.trunk, isPalm ? bark : barkTree, { ...opts, name: 'tronco' });
        const crown = new ChunkedInstances(this.group, v.crown, crownMat, { ...opts, name: 'copa' });
        list.forEach((t, k) => {
          const y = world.groundAt(t.x, t.z) + (t.planter ? 0.75 : 0) - 0.05;
          q.setFromEuler(e.set(0, t.r || 0, 0));
          const sc = t.s || 1;
          m.compose(p.set(t.x, y, t.z), q, s.set(sc, sc * (isPalm ? 1 : 1), sc));
          trunk.add(m);
          const tint = 0.85 + hash2(k, i * 13) * 0.3;
          crown.add(m, isPalm ? null : new THREE.Color(tint * 0.95, tint, tint * 0.85));
        });
        trunk.build();
        crown.build();
        this.chunked.push(trunk, crown);
      });
    };
    build(palms, buckets.palm, true);
    build(rounds, buckets.round, false);
  }

  update(camPos) {
    for (const c of this.chunked) c.update(camPos);
  }
}

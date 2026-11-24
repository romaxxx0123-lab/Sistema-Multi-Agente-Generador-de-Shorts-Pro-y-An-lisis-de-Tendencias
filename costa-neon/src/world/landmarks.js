// Hitos y estructuras: puerto (contenedores, grúas, barco), industria, faro, playa, piletas, fuentes y rampas.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U, FOG_PARS_VERTEX, FOG_VERTEX, FOG_PARS_FRAGMENT } from './shaders.js';
import { RNG, hash2 } from '../core/utils.js';
import { DETAIL } from './textures.js';
import { unitBox, placeBetween } from './city.js';
import { WATER_LEVEL } from './map.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
function compose(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}
function ni(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
function merge(list) {
  return mergeGeometries(list.map(ni));
}
function box(w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function colorize(g, c) {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

export class Landmarks {
  constructor(engine, world, lib) {
    this.engine = engine;
    this.world = world;
    this.lib = lib;
    this.group = new THREE.Group();
    this.group.name = 'hitos';
    engine.scene.add(this.group);
    this.vc = lib.standard({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.35 }, { key: 'vcolor', fragColor: 'diffuseColor.rgb *= mix(1., .75, uWet);' });
    this._containers();
    this._cranes();
    this._industry();
    this._beach();
    this._rocks();
    this._pools();
    this._fountains();
    this._ramps();
    this._ship();
    this._lighthouse();
  }

  _add(o, cast = true, recv = true) {
    o.castShadow = cast;
    o.receiveShadow = recv;
    if (o.isInstancedMesh) o.computeBoundingSphere();
    this.group.add(o);
    return o;
  }

  _containers() {
    const list = this.world.props.containers;
    if (!list.length) return;
    const geo = new THREE.BoxGeometry(12.2, 2.6, 2.44);
    geo.translate(0, 1.3, 0);
    const mat = this.lib.triplanar(DETAIL.METAL, 0xffffff, 2.4, { roughness: 0.6, metalness: 0.45 });
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((c, i) => {
      mesh.setMatrixAt(i, compose(c.x, this.world.groundAt(c.x, c.z) + c.y, c.z, c.yaw));
      const col = new THREE.Color(c.c).multiplyScalar(0.85 + hash2(i, 3) * 0.3);
      mesh.setColorAt(i, col);
    });
    this._add(mesh);
  }

  _cranes() {
    const list = this.world.props.cranes;
    if (!list.length) return;
    const red = [], white = [];
    for (const sx of [-8, 8]) for (const sz of [-6, 6]) red.push(box(1.4, 42, 1.4, sx, 21, sz));
    for (const sz of [-6, 6]) red.push(box(17.4, 1.6, 1.4, 0, 40.8, sz));
    for (const sx of [-8, 8]) red.push(box(1.4, 1.6, 13.4, sx, 40.8, 0));
    // arriostramientos en X
    for (const sz of [-6, 6]) {
      red.push(box(1.0, 22, 0.6, 0, 26, sz, 0, 0, 0.6));
      red.push(box(1.0, 22, 0.6, 0, 26, sz, 0, 0, -0.6));
    }
    red.push(box(3.0, 3.2, 92, 0, 44.2, 14));
    white.push(box(9, 5.2, 11, 0, 48.4, -6));
    red.push(box(1.2, 18, 1.2, -1.6, 55, -2, 0.18, 0, 0));
    red.push(box(1.2, 18, 1.2, 1.6, 55, -2, 0.18, 0, 0));
    white.push(box(5, 1.2, 4, 0, 44, 30));
    const redG = colorize(merge(red), 0xb9361f), whiteG = colorize(merge(white), 0xe9e7e2);
    const geo = mergeGeometries([redG, whiteG]);
    const mesh = new THREE.InstancedMesh(geo, this.vc, list.length);
    list.forEach((c, i) => mesh.setMatrixAt(i, compose(c.x, this.world.groundAt(c.x, c.z), c.z, c.yaw)));
    this._add(mesh);
    // tensores del brazo
    const cables = [];
    for (const c of list)
      for (const zEnd of [58, -30, 30])
        cables.push([new THREE.Vector3(c.x, 63.5, c.z - 0.5), new THREE.Vector3(c.x, 45.6, c.z + zEnd)]);
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 5), this.lib.standard({ color: 0x333333, roughness: 0.5, metalness: 0.8 }, { key: 'cable' }), cables.length);
    cables.forEach(([a, b], i) => cm.setMatrixAt(i, placeBetween(a, b, 0.08, _m)));
    this._add(cm, false, false);
  }

  _industry() {
    const P = this.world.props;
    const tankMat = this.lib.triplanar(DETAIL.PAINT, 0xd9d6cf, 3, { roughness: 0.4, metalness: 0.5 });
    if (P.tanks.length) {
      const body = new THREE.CylinderGeometry(1, 1, 1, 28);
      body.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(body, tankMat, P.tanks.length);
      P.tanks.forEach((t, i) => mesh.setMatrixAt(i, compose(t.x, this.world.groundAt(t.x, t.z), t.z, 0, t.r, t.h, t.r)));
      this._add(mesh);
      const dome = new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2);
      const dm = new THREE.InstancedMesh(dome, tankMat, P.tanks.length);
      P.tanks.forEach((t, i) => dm.setMatrixAt(i, compose(t.x, this.world.groundAt(t.x, t.z) + t.h, t.z, 0, t.r, t.r * 0.28, t.r)));
      this._add(dm);
    }
    if (P.chimneys.length) {
      const geo = new THREE.CylinderGeometry(0.75, 1, 1, 18);
      geo.translate(0, 0.5, 0);
      const mat = this.lib.standard({ color: 0xffffff, roughness: 0.8 }, {
        key: 'chimney',
        fragColor: 'float bnd = step(.5, fract(vWPos.y / 5.)) * step(18., vWPos.y); diffuseColor.rgb = mix(vec3(.62, .58, .55), vec3(.75, .12, .08), bnd) * (.85 + .2 * fbm3(vWPos.xz * 2. + vWPos.y));',
      });
      const mesh = new THREE.InstancedMesh(geo, mat, P.chimneys.length);
      P.chimneys.forEach((c, i) => mesh.setMatrixAt(i, compose(c.x, this.world.groundAt(c.x, c.z), c.z, 0, c.r, c.h, c.r)));
      this._add(mesh);
    }
  }

  _beach() {
    const P = this.world.props;
    const gy = (x, z) => this.world.groundAt(x, z);
    if (P.umbrellas.length) {
      const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6);
      pole.translate(0, 1.15, 0);
      const pm = new THREE.InstancedMesh(pole, this.lib.standard({ color: 0xeeeeee, roughness: 0.5 }, { key: 'upole' }), P.umbrellas.length);
      const canopy = new THREE.ConeGeometry(1.35, 0.5, 10, 1, true);
      canopy.translate(0, 2.15, 0);
      const cmat = this.lib.standard({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }, { key: 'canopy', fragColor: 'float ang = atan(vWPos.z, vWPos.x); diffuseColor.rgb *= mix(1., .82, step(.5, fract(ang * 1.59)));' });
      const cm = new THREE.InstancedMesh(canopy, cmat, P.umbrellas.length);
      P.umbrellas.forEach((u, i) => {
        const tilt = (hash2(i, 9) - 0.5) * 0.25;
        _q.setFromEuler(_e.set(tilt, hash2(i, 4) * 6, tilt * 0.6));
        _m.compose(_p.set(u.x, gy(u.x, u.z) - 0.25, u.z), _q, _s.set(1, 1, 1));
        pm.setMatrixAt(i, _m);
        cm.setMatrixAt(i, _m);
        cm.setColorAt(i, new THREE.Color(u.c));
      });
      this._add(pm, true, false);
      this._add(cm, true, true);
    }
    if (P.loungers.length) {
      const g = merge([
        box(0.7, 0.08, 1.4, 0, 0.32, 0.2),
        box(0.7, 0.08, 0.6, 0, 0.5, -0.65, -0.7),
        box(0.06, 0.3, 0.06, 0.3, 0.15, 0.8), box(0.06, 0.3, 0.06, -0.3, 0.15, 0.8),
        box(0.06, 0.3, 0.06, 0.3, 0.15, -0.3), box(0.06, 0.3, 0.06, -0.3, 0.15, -0.3),
      ]);
      const mesh = new THREE.InstancedMesh(g, this.lib.standard({ color: 0xf2efe8, roughness: 0.7 }, { key: 'lounger' }), P.loungers.length);
      P.loungers.forEach((l, i) => mesh.setMatrixAt(i, compose(l.x, gy(l.x, l.z), l.z, l.yaw)));
      this._add(mesh);
    }
    if (P.lifeguards.length) {
      const parts = [];
      for (const sx of [-0.9, 0.9]) for (const sz of [-0.9, 0.9]) parts.push(box(0.12, 2.2, 0.12, sx, 1.1, sz));
      const cab = colorize(merge([box(2.2, 1.6, 2.2, 0, 3.0, 0)]), 0xe8483a);
      const roof = colorize(merge([box(2.8, 0.15, 2.8, 0, 3.9, 0, 0.12)]), 0xf2d34c);
      const legs = colorize(merge([...parts, box(2.6, 0.12, 2.6, 0, 2.2, 0), box(0.7, 0.06, 2.6, 0, 1.1, 1.7, 0.8)]), 0xf1eee6);
      const g = mergeGeometries([cab, roof, legs]);
      const mesh = new THREE.InstancedMesh(g, this.vc, P.lifeguards.length);
      P.lifeguards.forEach((l, i) => mesh.setMatrixAt(i, compose(l.x, gy(l.x, l.z), l.z, l.yaw)));
      this._add(mesh);
    }
  }

  _rocks() {
    const list = this.world.props.rocks;
    if (!list.length) return;
    const g = new THREE.IcosahedronGeometry(1, 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      const n = 0.75 + 0.35 * hash2(Math.round(v.x * 5 + 9), Math.round(v.y * 5 + v.z * 3 + 7));
      v.multiplyScalar(n);
      pos.setXYZ(i, v.x, v.y * 0.7, v.z);
    }
    g.computeVertexNormals();
    const mat = this.lib.triplanar(DETAIL.CONCRETE, 0x7d746a, 2.5, { roughness: 0.92 });
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((r, i) => {
      _q.setFromEuler(_e.set(hash2(i, 1) * 0.6, r.r, hash2(i, 2) * 0.6));
      _m.compose(_p.set(r.x, r.y ?? -0.4, r.z), _q, _s.set(r.s, r.s * 0.8, r.s * 1.1));
      mesh.setMatrixAt(i, _m);
    });
    this._add(mesh);
  }

  _pools() {
    const list = this.world.pools;
    if (!list.length) return;
    const water = this.lib.standard({ color: 0xffffff, roughness: 0.04, metalness: 0 }, {
      key: 'pool',
      fragColor: `
        vec2 pq = vWPos.xz * 1.3;
        float ca = 0.;
        for (int i = 0; i < 3; i++) { vec2 o = vec2(float(i) * 1.7, float(i) * 2.3); ca += abs(sin(pq.x * (1.1 + float(i) * .3) + uTime * (.9 + float(i) * .2) + vnoise(pq + o + uTime * .3) * 3.) * sin(pq.y * (1.3 + float(i) * .25) - uTime * .7 + vnoise(pq * .7 - o) * 3.)); }
        ca = pow(ca / 3., 3.) * 2.5;
        diffuseColor.rgb = vec3(.03, .32, .42) + vec3(.25, .45, .45) * ca;
        diffuseColor.rgb *= 1. - uNight * .7;`,
      fragNormal: `{ vec2 g = vec2(vnoise(vWPos.xz * 2. + uTime) - .5, vnoise(vWPos.xz * 2. - uTime + 7.) - .5) * .25; normal = normalize((viewMatrix * vec4(normalize(vec3(g.x, 1., g.y)), 0.)).xyz); }`,
      fragEmissive: 'totalEmissiveRadiance += vec3(.05, .4, .5) * uNight * .6 * (1. + ca);',
    });
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.rotateX(-Math.PI / 2);
    const wm = new THREE.InstancedMesh(quad, water, list.length);
    const copings = [];
    list.forEach((p, i) => {
      const y = this.world.groundAt(p.x, p.z) + 0.03;
      wm.setMatrixAt(i, compose(p.x, y, p.z, 0, p.w, 1, p.d));
      copings.push({ x: p.x, z: p.z - p.d / 2 - 0.3, w: p.w + 1.2, d: 0.6, y });
      copings.push({ x: p.x, z: p.z + p.d / 2 + 0.3, w: p.w + 1.2, d: 0.6, y });
      copings.push({ x: p.x - p.w / 2 - 0.3, z: p.z, w: 0.6, d: p.d, y });
      copings.push({ x: p.x + p.w / 2 + 0.3, z: p.z, w: 0.6, d: p.d, y });
    });
    this._add(wm, false, true);
    const cm = new THREE.InstancedMesh(unitBox(), this.lib.triplanar(DETAIL.STUCCO, 0xf1ede4, 2), copings.length);
    copings.forEach((c, i) => cm.setMatrixAt(i, compose(c.x, c.y - 0.02, c.z, 0, c.w, 0.08, c.d)));
    this._add(cm, false, true);
  }

  _fountains() {
    const list = this.world.props.fountains;
    if (!list.length) return;
    const stone = this.lib.triplanar(DETAIL.STUCCO, 0xd8d0c2, 2);
    const waterMat = this.lib.standard({ color: 0x2a6f7a, roughness: 0.03, metalness: 0.1 }, {
      key: 'fwater',
      fragNormal: `{ float r = length(vWPos.xz - floor(vWPos.xz / 200.) * 200.); vec2 g = vec2(vnoise(vWPos.xz * 3. + uTime * 2.) - .5, vnoise(vWPos.xz * 3. - uTime * 2.) - .5) * .35; normal = normalize((viewMatrix * vec4(normalize(vec3(g.x, 1., g.y)), 0.)).xyz); }`,
    });
    this.jets = [];
    const jetMat = new THREE.MeshStandardMaterial({ color: 0xe8f6ff, roughness: 0.1, transparent: true, opacity: 0.55 });
    this.lib.register(jetMat, { key: 'jet' });
    for (const f of list) {
      const y = this.world.groundAt(f.x, f.z);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r + 0.25, 0.75, 40, 1, true), stone);
      wall.position.set(f.x, y + 0.37, f.z);
      this._add(wall);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(f.r + 0.1, 0.22, 8, 48), stone);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(f.x, y + 0.75, f.z);
      this._add(rim);
      const water = new THREE.Mesh(new THREE.CircleGeometry(f.r, 40), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.set(f.x, y + 0.55, f.z);
      this._add(water, false, true);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 16), stone);
      col.position.set(f.x, y + 1.1, f.z);
      this._add(col);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(f.r * 0.35, 0.4, 0.5, 24), stone);
      bowl.position.set(f.x, y + 2.3, f.z);
      this._add(bowl);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1, 6), jetMat);
        const rr = k === 0 ? 0 : f.r * 0.62;
        jet.position.set(f.x + Math.cos(a) * rr * (k ? 1 : 0), y + 0.55, f.z + Math.sin(a) * rr * (k ? 1 : 0));
        jet.userData = { base: y + 0.55, h: k === 0 ? 4.5 : 1.8, phase: k * 0.7 };
        this.group.add(jet);
        this.jets.push(jet);
      }
    }
  }

  _ramps() {
    const list = this.world.ramps;
    if (!list.length) return;
    // Cuña: base de 0 a len sobre +Z, altura h al final
    const P = [];
    const C = [];
    const yellow = [0.95, 0.75, 0.1], gray = [0.42, 0.43, 0.45], dark = [0.2, 0.2, 0.22];
    const tri = (a, b, c, col) => {
      P.push(...a, ...b, ...c);
      C.push(...col, ...col, ...col);
    };
    const quad = (a, b, c, d, col) => {
      tri(a, b, c, col);
      tri(a, c, d, col);
    };
    const w = 0.5, L = 1, H = 1;
    quad([-w, 0, 0], [w, 0, 0], [w, H, L], [-w, H, L], gray); // rampa
    quad([w, 0, L], [-w, 0, L], [-w, H, L], [w, H, L], dark); // frente vertical (atrás de la rampa)
    tri([w, 0, 0], [w, 0, L], [w, H, L], yellow);
    tri([-w, 0, L], [-w, 0, 0], [-w, H, L], yellow);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.computeVertexNormals();
    const mat = this.lib.standard({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0.6 }, {
      key: 'ramp',
      fragColor: 'float stripe = step(.5, fract((vWPos.x + vWPos.z) * .9)); diffuseColor.rgb *= mix(1., .85, stripe * step(.6, diffuseColor.r));',
    });
    const mesh = new THREE.InstancedMesh(g, mat, list.length);
    list.forEach((r, i) => mesh.setMatrixAt(i, compose(r.x, this.world.groundAt(r.x - Math.sin(r.yaw) * 1, r.z - Math.cos(r.yaw) * 1) + 0.01, r.z, r.yaw, r.wid, r.h, r.len)));
    this._add(mesh);
  }

  _ship() {
    const s = this.world.ship;
    if (!s) return;
    const L = s.len, W = s.wid;
    const x0 = s.x - L / 2;
    // Casco: planta con proa en punta hacia -X
    const shape = new THREE.Shape();
    shape.moveTo(L - 4, -W / 2);
    shape.lineTo(18, -W / 2);
    shape.quadraticCurveTo(2, -W / 2 + 1, 0, 0);
    shape.quadraticCurveTo(2, W / 2 - 1, 18, W / 2);
    shape.lineTo(L - 4, W / 2);
    shape.quadraticCurveTo(L, W / 2, L, W / 2 - 3);
    shape.lineTo(L, -W / 2 + 3);
    shape.quadraticCurveTo(L, -W / 2, L - 4, -W / 2);
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 13.5, bevelEnabled: false, curveSegments: 10 });
    hull.rotateX(-Math.PI / 2);
    hull.translate(x0, -8.5, s.z);
    const pos = hull.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const c = y < WATER_LEVEL - 0.9 ? [0.45, 0.07, 0.06] : y > 4.7 ? [0.32, 0.33, 0.35] : [0.05, 0.08, 0.16];
      col.set(c, i * 3);
    }
    hull.setAttribute('color', new THREE.BufferAttribute(col, 3));
    hull.computeVertexNormals();
    const hm = new THREE.Mesh(hull, this.vc);
    this._add(hm);
    // Contenedores en cubierta
    const r = new RNG(4321);
    const cont = [];
    const colors = [0xb5402f, 0x2f6fa8, 0x3f8a52, 0xd9a032, 0x8e3f7a, 0x2e9aa0, 0xe0e0dc, 0xc4632a];
    for (let bay = 0; bay < 8; bay++)
      for (let row = 0; row < 7; row++) {
        const tiers = r.int(1, 4);
        for (let t = 0; t < tiers; t++) cont.push({ x: x0 + 26 + bay * 13.2, y: 5 + t * 2.6, z: s.z - 8.6 + row * 2.86, c: r.pick(colors) });
      }
    const cg = new THREE.BoxGeometry(12.2, 2.6, 2.44);
    cg.translate(0, 1.3, 0);
    const cmat = this.lib.triplanar(DETAIL.METAL, 0xffffff, 2.4, { roughness: 0.6, metalness: 0.45 });
    const cm = new THREE.InstancedMesh(cg, cmat, cont.length);
    cont.forEach((c, i) => {
      cm.setMatrixAt(i, compose(c.x, c.y, c.z, 0));
      cm.setColorAt(i, new THREE.Color(c.c));
    });
    this._add(cm);
    // Superestructura con ventanas (material de fachada)
    const sup = new THREE.InstancedMesh(unitBox(), this.lib.facade('office'), 1);
    sup.setMatrixAt(0, compose(x0 + L - 14, 5, s.z, 0, 16, 17, 20));
    sup.setColorAt(0, new THREE.Color(0xf1efe9));
    const seeds = new THREE.InstancedBufferAttribute(new Float32Array([0.37]), 1);
    const meta = new THREE.InstancedBufferAttribute(new Float32Array([1, 0, 0, 0]), 4);
    sup.geometry.setAttribute('aSeed', seeds);
    sup.geometry.setAttribute('aMeta', meta);
    this._add(sup);
    const funnel = colorize(merge([box(6, 7, 5, x0 + L - 8, 25.5, s.z)]), 0xf0b02a);
    const band = colorize(merge([box(6.1, 1.2, 5.1, x0 + L - 8, 27.5, s.z)]), 0x1a2a6b);
    const masts = colorize(merge([box(0.5, 10, 0.5, x0 + 10, 10, s.z), box(0.4, 6, 0.4, x0 + L - 14, 25, s.z)]), 0xe8e8e8);
    this._add(new THREE.Mesh(mergeGeometries([funnel, band, masts]), this.vc));
  }

  _lighthouse() {
    const lh = this.world.lighthouse;
    if (!lh) return;
    const y0 = this.world.groundAt(lh.x, lh.z);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.9, 26, 32), this.lib.standard({ color: 0xffffff, roughness: 0.7 }, {
      key: 'lhtower',
      fragColor: 'float bnd = step(.5, fract((vWPos.y) / 6.5)); diffuseColor.rgb = mix(vec3(.93, .92, .9), vec3(.72, .1, .08), bnd) * (.88 + .18 * fbm3(vWPos.xz * 3. + vWPos.y)); diffuseColor.rgb *= mix(1., .75, uWet);',
    }));
    tower.position.set(lh.x, y0 + 13, lh.z);
    this._add(tower);
    const dark = this.lib.standard({ color: 0x1c1f22, roughness: 0.4, metalness: 0.8 }, { key: 'lhdark' });
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 0.35, 32), dark);
    gallery.position.set(lh.x, y0 + 26.2, lh.z);
    this._add(gallery);
    this.lanternMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.9 });
    this.lanternMat.userData.lit = false;
    this.lib.register(this.lanternMat, { key: 'lantern', basic: true });
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 20), this.lanternMat);
    lantern.position.set(lh.x, y0 + 27.6, lh.z);
    this.group.add(lantern);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    cap.position.set(lh.x, y0 + 28.8, lh.z);
    this._add(cap);
    // Haz giratorio volumétrico
    const beamGeo = new THREE.ConeGeometry(9, 140, 24, 1, true);
    beamGeo.translate(0, -70, 0);
    beamGeo.rotateZ(Math.PI / 2);
    this.beamMat = new THREE.ShaderMaterial({
      uniforms: { uNight: U.uNight, uFogDensity: U.uFogDensity, uFogFalloff: U.uFogFalloff, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor, uSunDir: U.uSunDir },
      vertexShader: `varying float vT; varying vec3 vN; varying vec3 vWP; void main(){ vT = clamp(-position.x / 140., 0., 1.); vec4 wp = modelMatrix * vec4(position, 1.); vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `uniform float uNight; uniform float uFogDensity; varying float vT; varying vec3 vN; varying vec3 vWP;
        void main(){ vec3 V = normalize(cameraPosition - vWP); float e = pow(abs(dot(V, normalize(vN))), 2.); float a = e * (1. - vT) * (1. - vT) * uNight * (.08 + uFogDensity * 140.); gl_FragColor = vec4(vec3(1., .95, .8) * a, 1.); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.beam = new THREE.Group();
    this.beam.position.set(lh.x, y0 + 27.6, lh.z);
    const b1 = new THREE.Mesh(beamGeo, this.beamMat);
    const b2 = new THREE.Mesh(beamGeo, this.beamMat);
    b2.rotation.y = Math.PI;
    b1.renderOrder = b2.renderOrder = 6;
    this.beam.add(b1, b2);
    this.group.add(this.beam);
  }

  update(dt, t, nightK) {
    if (this.beam) this.beam.rotation.y = t * 0.9;
    if (this.lanternMat) this.lanternMat.color.setRGB(1, 0.95, 0.8).multiplyScalar(0.6 + nightK * 14);
    if (this.jets) {
      for (const j of this.jets) {
        const h = j.userData.h * (0.85 + 0.15 * Math.sin(t * 2.2 + j.userData.phase));
        j.scale.set(1, h, 1);
        j.position.y = j.userData.base + h / 2;
      }
    }
  }
}

// Construcción 3D de la ciudad: edificios, techos, calles, veredas, terreno, murallones, muelles y puente.
import * as THREE from 'three';
import { CURB_H, ISLAND, BRIDGE, PIERS_X, PIER, terrainHeight, bridgeDeckY, isRoad } from './map.js';
import { DETAIL } from './textures.js';
import { FacadeSkins } from './facades.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

export function unitBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  return g;
}

/** Cilindro entre dos puntos (para cables y caños). */
export function placeBetween(a, b, radius, out) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  _p.copy(a).add(b).multiplyScalar(0.5);
  _s.set(radius, len, radius);
  return out.compose(_p, _q, _s);
}

export class CityRenderer {
  constructor(engine, world, lib) {
    this.engine = engine;
    this.world = world;
    this.lib = lib;
    this.group = new THREE.Group();
    this.group.name = 'ciudad';
    this.flat = []; // superficies reflectantes (se ocultan en el pase de reflejo)
    engine.scene.add(this.group);
    this._buildings();
    // muros con espesor y ventanas hundidas (no en calidad baja)
    this.facades = engine.q.density >= 0.6 ? new FacadeSkins(this.group, world, lib) : null;
    this._roofs();
    this._ground();
    this._terrain();
    this._seawalls();
    this._piers();
    this._bridge();
  }

  update(camPos) {
    if (this.facades) this.facades.update(camPos, 0.45 + 0.55 * this.engine.q.density);
  }

  add(obj, cast = true, receive = true) {
    obj.castShadow = cast;
    obj.receiveShadow = receive;
    this.group.add(obj);
    return obj;
  }

  _buildings() {
    const byStyle = {};
    for (const b of this.world.buildings) (byStyle[b.style] || (byStyle[b.style] = [])).push(b);
    const box = unitBox();
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 64, 1, false);
    cyl.translate(0, 0.5, 0);
    this.buildingMeshes = {};
    for (const [style, list] of Object.entries(byStyle)) {
      const geo = (style === 'round' ? cyl : box).clone();
      const seeds = new Float32Array(list.length);
      const meta = new Float32Array(list.length * 4);
      const mesh = new THREE.InstancedMesh(geo, this.lib.facade(style), list.length);
      list.forEach((b, i) => {
        _p.set(b.x, b.y0, b.z);
        _s.set(b.w, b.h, b.d);
        _m.compose(_p, _q.identity(), _s);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.set(b.color));
        seeds[i] = b.seed;
        meta[i * 4] = b.crown || 0;
        meta[i * 4 + 1] = b.roof || 0;
      });
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      geo.setAttribute('aMeta', new THREE.InstancedBufferAttribute(meta, 4));
      mesh.computeBoundingSphere();
      mesh.name = 'edificios_' + style;
      this.add(mesh);
      this.buildingMeshes[style] = mesh;
    }
  }

  _roofs() {
    const houses = this.world.buildings.filter((b) => b.roof === 1);
    if (!houses.length) return;
    // Prisma unitario con cumbrera sobre X; UV: u a lo largo de la cumbrera, v desde el alero
    const P = [];
    const UV = [];
    const quad = (a, b, c, d, ua, ub, uc, ud) => {
      P.push(...a, ...b, ...c, ...a, ...c, ...d);
      UV.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
    };
    quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0], [-0.5, 1, 0], [0, 0], [1, 0], [1, 1], [0, 1]);
    quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, 0], [0.5, 1, 0], [1, 0], [0, 0], [0, 1], [1, 1]);
    // cara inferior del alero (sombra)
    quad([-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [0, 0], [1, 0], [1, 1], [0, 1]);
    const roofGeo = new THREE.BufferGeometry();
    roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    roofGeo.computeVertexNormals();
    const G = [];
    for (const s of [-0.5, 0.5]) G.push(s, 0, 0.5 * Math.sign(s), s, 0, -0.5 * Math.sign(s), s, 1, 0);
    const gableGeo = new THREE.BufferGeometry();
    gableGeo.setAttribute('position', new THREE.Float32BufferAttribute(G, 3));
    gableGeo.computeVertexNormals();
    const roofs = new THREE.InstancedMesh(roofGeo, this.lib.roofTiles(), houses.length);
    const gables = new THREE.InstancedMesh(gableGeo, this.lib.standard({ color: 0xffffff, roughness: 0.9 }, { key: 'gable', fragColor: 'diffuseColor.rgb *= mix(1., .72, uWet);' }), houses.length);
    houses.forEach((b, i) => {
      const alongX = b.w >= b.d;
      const len = alongX ? b.w : b.d, wid = alongX ? b.d : b.w;
      const rh = wid * 0.36;
      _q.setFromEuler(_e.set(0, alongX ? 0 : Math.PI / 2, 0));
      _p.set(b.x, b.y0 + b.h, b.z);
      _m.compose(_p, _q, _s.set(len + 0.9, rh, wid + 0.9));
      roofs.setMatrixAt(i, _m);
      roofs.setColorAt(i, _c.set(b.roofColor));
      _m.compose(_p, _q, _s.set(len, rh * (wid / (wid + 0.9)), wid));
      gables.setMatrixAt(i, _m);
      gables.setColorAt(i, _c.set(b.color));
      // la colisión del edificio incluye el techo
    });
    roofs.computeBoundingSphere();
    gables.computeBoundingSphere();
    this.add(roofs);
    this.add(gables);
  }

  _ground() {
    const road = this.lib.road();
    const plane = (w, d, x, z, y = 0) => {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, road);
      m.position.set(x, y, z);
      this.add(m, false, true);
      this.flat.push(m);
      return m;
    };
    plane(976, 976, 0, 0);
    plane(256, 256, 920, -200);
    plane(72, 16, 524, -160);
    plane(32, 16, 776, -160);

    const slabs = [];
    for (const b of this.world.blocks) slabs.push({ x: b.cx, z: b.cz, w: b.maxX - b.minX, d: b.maxZ - b.minZ, g: b.ground, r: 1, deep: false });
    slabs.push({ x: -36, z: -547, w: 1048, d: 26, g: 0, r: 0, deep: true });
    slabs.push({ x: -36, z: -511, w: 1048, d: 46, g: 1, r: 0, deep: true });
    slabs.push({ x: -524, z: 0, w: 72, d: 976, g: 3, r: 0, deep: true });
    slabs.push({ x: -36, z: 524, w: 1048, d: 72, g: 3, r: 0, deep: true });
    slabs.push({ x: 492, z: (-560 - 168) / 2, w: 8, d: 392, g: 0, r: 0, deep: true });
    slabs.push({ x: 492, z: (-152 + 560) / 2, w: 8, d: 712, g: 0, r: 0, deep: true });
    const geo = unitBox();
    const aG = new Float32Array(slabs.length), aR = new Float32Array(slabs.length);
    const mesh = new THREE.InstancedMesh(geo, this.lib.slab(), slabs.length);
    slabs.forEach((s, i) => {
      const y0 = s.deep ? -0.7 : 0;
      _m.compose(_p.set(s.x, y0, s.z), _q.identity(), _s.set(s.w, CURB_H - y0, s.d));
      mesh.setMatrixAt(i, _m);
      aG[i] = s.g;
      aR[i] = s.r;
    });
    geo.setAttribute('aGround', new THREE.InstancedBufferAttribute(aG, 1));
    geo.setAttribute('aRing', new THREE.InstancedBufferAttribute(aR, 1));
    mesh.computeBoundingSphere();
    mesh.name = 'veredas';
    this.add(mesh, true, true);
    this.flat.push(mesh);
  }

  _terrain() {
    const W = 700, D = 1440, SX = 112, SZ = 230;
    const g = new THREE.PlaneGeometry(W, D, SX, SZ);
    g.rotateX(-Math.PI / 2);
    g.translate(820, 0, 70);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      let h = terrainHeight(x, z);
      if (x < 497 && z > -560 && z < 560) h = Math.min(h, -0.4);
      if (x >= 790 && x <= 1050 && z >= -330 && z <= -70) h = Math.min(h, -0.4);
      if (Math.abs(z - BRIDGE.z) < 9 && ((x >= 486 && x <= 562) || (x >= 758 && x <= 802))) h = Math.min(h, -0.4);
      if (isRoad(x, z) && h >= 0) h = -0.4;
      pos.setY(i, h);
    }
    g.computeVertexNormals();
    const t = new THREE.Mesh(g, this.lib.terrain());
    t.name = 'terreno';
    this.add(t, false, true);
    this.flat.push(t);
    const sea = new THREE.PlaneGeometry(9000, 9000);
    sea.rotateX(-Math.PI / 2);
    const sb = new THREE.Mesh(sea, this.lib.standard({ color: 0x24342c, roughness: 1 }, { key: 'seabed' }));
    sb.position.y = -7.7;
    this.add(sb, false, false);
    this.flat.push(sb);
  }

  _seawalls() {
    const mat = this.lib.triplanar(DETAIL.CONCRETE, 0x9c968b, 4);
    const walls = [
      [0, -560.7, 1121.4, 1.4],
      [0, 560.7, 1121.4, 1.4],
      [-560.7, 0, 1.4, 1121.4],
    ];
    for (const [x, z, w, d] of walls) {
      const g = new THREE.BoxGeometry(w, 6.4, d);
      const m = new THREE.Mesh(g, mat);
      m.position.set(x, CURB_H - 3.2 + 0.02, z);
      this.add(m, true, true);
    }
    // Coronamiento claro
    const cap = this.lib.triplanar(DETAIL.CONCRETE, 0xc9c4ba, 2);
    for (const [x, z, w, d] of walls) {
      const g = new THREE.BoxGeometry(w + 0.2, 0.25, d + 0.3);
      const m = new THREE.Mesh(g, cap);
      m.position.set(x, CURB_H + 0.1, z);
      this.add(m, true, true);
    }
    // Isla: borde de playa no requiere muro
  }

  _piers() {
    const wood = this.lib.triplanar(DETAIL.PAINT, 0x8a6a4a, 2, { roughness: 0.9 });
    const deckGeo = new THREE.BoxGeometry(PIER.halfW * 2, 0.5, PIER.z1 - PIER.z0);
    const decks = new THREE.InstancedMesh(deckGeo, wood, PIERS_X.length);
    PIERS_X.forEach((px, i) => {
      _m.compose(_p.set(px, PIER.y - 0.25, (PIER.z0 + PIER.z1) / 2), _q.identity(), _s.set(1, 1, 1));
      decks.setMatrixAt(i, _m);
    });
    this.add(decks);
    // Pilotes
    const pileGeo = new THREE.CylinderGeometry(0.28, 0.32, 1, 10);
    pileGeo.translate(0, 0.5, 0);
    const piles = [];
    for (const px of PIERS_X)
      for (let z = PIER.z0 + 4; z <= PIER.z1; z += 6)
        for (const s of [-1, 1]) piles.push([px + s * (PIER.halfW - 0.4), z]);
    const pm = new THREE.InstancedMesh(pileGeo, this.lib.triplanar(DETAIL.PAINT, 0x4f3a2a, 1.5, { roughness: 0.95 }), piles.length);
    piles.forEach(([x, z], i) => {
      _m.compose(_p.set(x, -7, z), _q.identity(), _s.set(1, 7.5 + PIER.y, 1));
      pm.setMatrixAt(i, _m);
    });
    this.add(pm);
  }

  _bridge() {
    const N = 60;
    const x0 = BRIDGE.x0, x1 = BRIDGE.x1, zc = BRIDGE.z;
    const P = [], I = [];
    const SP = [], SI = [];
    // Calzada
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N, y = bridgeDeckY(x);
      P.push(x, y + 0.02, zc - 8, x, y + 0.02, zc + 8);
      if (i < N) {
        const a = i * 2;
        I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    roadGeo.setIndex(I);
    roadGeo.computeVertexNormals();
    this.flat.push(this.add(new THREE.Mesh(roadGeo, this.lib.road()), false, true));
    // Veredas + viga cajón: perfil transversal extruido a lo largo del arco
    const prof = [
      [-8, 0.02], [-8, 0.2], [-10.5, 0.2], [-10.5, -1.8], [10.5, -1.8], [10.5, 0.2], [8, 0.2], [8, 0.02],
    ];
    const M = prof.length;
    for (let i = 0; i <= N; i++) {
      const x = x0 + ((x1 - x0) * i) / N, y = bridgeDeckY(x);
      for (const [dz, dy] of prof) SP.push(x, y + dy, zc + dz);
    }
    for (let i = 0; i < N; i++)
      for (let k = 0; k < M - 1; k++) {
        const a = i * M + k, b = a + 1, c = a + M, d = c + 1;
        SI.push(a, c, b, b, c, d);
      }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(SP, 3));
    sg.setIndex(SI);
    sg.computeVertexNormals();
    const concrete = this.lib.triplanar(DETAIL.CONCRETE, 0xb9b4aa, 3);
    this.add(new THREE.Mesh(sg, concrete));
    // Pilonos en A
    const white = this.lib.triplanar(DETAIL.CONCRETE, 0xe8e6e0, 4);
    const legGeo = new THREE.BoxGeometry(3.2, 1, 2.8);
    legGeo.translate(0, 0.5, 0);
    const steel = this.lib.standard({ color: 0xcfd3d8, roughness: 0.35, metalness: 0.85 }, { key: 'steel' });
    const cables = [];
    for (const px of [610, 710]) {
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, white);
        leg.position.set(px, -8, zc + s * 12.2);
        leg.scale.set(1, 56, 1);
        this.add(leg);
        // Cables en abanico
        for (const k of [-4, -3, -2, -1, 1, 2, 3, 4]) {
          const dx = k * 11;
          const xa = px + dx;
          const top = new THREE.Vector3(px, 44 - Math.abs(k) * 1.6, zc + s * 12.2);
          const bot = new THREE.Vector3(xa, bridgeDeckY(xa) + 0.6, zc + s * 10.3);
          cables.push([top, bot]);
        }
      }
      for (const yb of [45, -1.2]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 24.4), white);
        beam.position.set(px, yb, zc);
        this.add(beam);
      }
    }
    const cg = new THREE.CylinderGeometry(1, 1, 1, 6);
    const cm = new THREE.InstancedMesh(cg, steel, cables.length);
    cables.forEach(([a, b], i) => cm.setMatrixAt(i, placeBetween(a, b, 0.07, _m)));
    this.add(cm, true, false);
    // Barandas: postes y pasamanos
    const posts = [];
    for (let x = x0 + 1; x < x1; x += 2.5) for (const s of [-1, 1]) posts.push([x, s]);
    const postGeo = new THREE.BoxGeometry(0.1, 1.05, 0.1);
    postGeo.translate(0, 0.525, 0);
    const pm = new THREE.InstancedMesh(postGeo, steel, posts.length);
    posts.forEach(([x, s], i) => {
      _m.compose(_p.set(x, bridgeDeckY(x) + 0.2, zc + s * 10.35), _q.identity(), _s.set(1, 1, 1));
      pm.setMatrixAt(i, _m);
    });
    this.add(pm, true, false);
    const rails = [];
    for (let i = 0; i < N; i++) {
      const xa = x0 + ((x1 - x0) * i) / N, xb = x0 + ((x1 - x0) * (i + 1)) / N;
      for (const s of [-1, 1]) rails.push([new THREE.Vector3(xa, bridgeDeckY(xa) + 1.25, zc + s * 10.35), new THREE.Vector3(xb, bridgeDeckY(xb) + 1.25, zc + s * 10.35)]);
    }
    const rm = new THREE.InstancedMesh(cg, steel, rails.length);
    rails.forEach(([a, b], i) => rm.setMatrixAt(i, placeBetween(a, b, 0.05, _m)));
    this.add(rm, false, false);
    // Pilas intermedias
    const pierGeo = new THREE.CylinderGeometry(1.2, 1.5, 1, 16);
    pierGeo.translate(0, 0.5, 0);
    const piers = [];
    for (let x = 575; x < 760; x += 37) for (const s of [-1, 1]) piers.push([x, s]);
    const pp = new THREE.InstancedMesh(pierGeo, concrete, piers.length);
    piers.forEach(([x, s], i) => {
      _m.compose(_p.set(x, -8, zc + s * 5), _q.identity(), _s.set(1, bridgeDeckY(x) - 1.8 + 8, 1));
      pp.setMatrixAt(i, _m);
    });
    this.add(pp);
  }
}

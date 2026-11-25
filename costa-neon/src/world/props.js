// Mobiliario urbano: faroles, semáforos, carteles de neón, publicidad, pantalla LED y equipamiento.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U, FOG_PARS_VERTEX, FOG_VERTEX, FOG_PARS_FRAGMENT, FOG_FRAGMENT } from './shaders.js';
import { RNG } from '../core/utils.js';
import { DETAIL } from './textures.js';
import { unitBox } from './city.js';
import { ChunkedInstances } from './instancing.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const ONE = new THREE.Vector3(1, 1, 1);

function compose(x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(0, yaw, 0));
  return _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

function nonIndexed(g) {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}
function merge(list) {
  return mergeGeometries(list.map(nonIndexed));
}

// --------------------------------------------------------------- geometrías
function lampGeometry() {
  const pole = new THREE.CylinderGeometry(0.075, 0.12, 7.5, 6, 1, true);
  pole.translate(0, 3.75, 0);
  const base = new THREE.CylinderGeometry(0.2, 0.24, 0.55, 6, 1, true);
  base.translate(0, 0.27, 0);
  // brazo curvo hacia +Z (sobre la calzada)
  const arm1 = new THREE.CylinderGeometry(0.05, 0.06, 1.0, 5, 1, true);
  arm1.rotateX(Math.PI / 2.6);
  arm1.translate(0, 7.75, 0.38);
  const arm2 = new THREE.CylinderGeometry(0.045, 0.05, 0.9, 5, 1, true);
  arm2.rotateX(Math.PI / 2);
  arm2.translate(0, 7.98, 1.1);
  const head = new THREE.BoxGeometry(0.42, 0.14, 0.85);
  head.translate(0, 7.95, 1.55);
  return merge([pole, base, arm1, arm2, head]);
}
function lampBulbGeometry() {
  const g = new THREE.BoxGeometry(0.32, 0.04, 0.66);
  g.translate(0, 7.86, 1.55);
  return g;
}
function lightConeGeometry() {
  const g = new THREE.CylinderGeometry(0.25, 4.8, 7.8, 14, 1, true);
  g.translate(0, 7.84 - 3.9, 1.55);
  return g;
}

function trafficPoleGeometry() {
  const pole = new THREE.CylinderGeometry(0.11, 0.15, 6.4, 7, 1, true);
  pole.translate(0, 3.2, 0);
  const arm = new THREE.CylinderGeometry(0.07, 0.09, 5.4, 6, 1, true);
  arm.rotateZ(Math.PI / 2);
  arm.translate(2.7, 6.1, 0);
  const brace = new THREE.CylinderGeometry(0.035, 0.035, 2.2, 4, 1, true);
  brace.rotateZ(Math.PI / 3.2);
  brace.translate(0.9, 5.5, 0);
  const box = new THREE.BoxGeometry(0.42, 1.25, 0.36);
  box.translate(5.0, 5.55, 0);
  const visor = [];
  for (let k = 0; k < 3; k++) {
    const v = new THREE.CylinderGeometry(0.17, 0.17, 0.22, 6, 1, true, 0, Math.PI);
    v.rotateX(Math.PI / 2);
    v.rotateZ(Math.PI);
    v.translate(5.0, 5.55 + 0.37 - k * 0.37 + 0.08, -0.28);
    visor.push(v);
  }
  const ped = new THREE.BoxGeometry(0.3, 0.55, 0.25);
  ped.translate(0.0, 2.6, -0.25);
  return merge([pole, arm, brace, box, ...visor, ped]);
}

function benchGeometry() {
  const parts = [];
  for (let k = 0; k < 4; k++) {
    const s = new THREE.BoxGeometry(1.8, 0.04, 0.09);
    s.translate(0, 0.45, -0.18 + k * 0.12);
    parts.push(s);
  }
  for (let k = 0; k < 3; k++) {
    const b = new THREE.BoxGeometry(1.8, 0.09, 0.035);
    b.rotateX(-0.2);
    b.translate(0, 0.6 + k * 0.13, -0.27 - k * 0.025);
    parts.push(b);
  }
  for (const x of [-0.75, 0.75]) {
    const l = new THREE.BoxGeometry(0.06, 0.45, 0.5);
    l.translate(x, 0.225, -0.05);
    parts.push(l);
  }
  return merge(parts);
}
function binGeometry() {
  const c = new THREE.CylinderGeometry(0.28, 0.25, 0.95, 8, 1, true);
  c.translate(0, 0.52, 0);
  const lid = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 8);
  lid.translate(0, 1.0, 0);
  const post = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 6);
  post.translate(0, 0.05, 0);
  return merge([c, lid, post]);
}
function hydrantGeometry() {
  const b = new THREE.CylinderGeometry(0.14, 0.17, 0.7, 7);
  b.translate(0, 0.35, 0);
  const t = new THREE.SphereGeometry(0.15, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
  t.translate(0, 0.7, 0);
  const n1 = new THREE.CylinderGeometry(0.06, 0.06, 0.42, 8);
  n1.rotateZ(Math.PI / 2);
  n1.translate(0, 0.5, 0);
  const n2 = new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8);
  n2.rotateX(Math.PI / 2);
  n2.translate(0, 0.48, 0.12);
  return merge([b, t, n1, n2]);
}
function bollardGeometry() {
  const b = new THREE.CylinderGeometry(0.09, 0.11, 0.95, 6, 1, true);
  b.translate(0, 0.47, 0);
  const t = new THREE.SphereGeometry(0.095, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2);
  t.translate(0, 0.95, 0);
  return merge([b, t]);
}
function shelterGeometry() {
  const parts = [];
  for (const x of [-2.1, 2.1]) {
    const p = new THREE.BoxGeometry(0.08, 2.5, 0.08);
    p.translate(x, 1.25, -0.6);
    parts.push(p);
    const p2 = p.clone();
    p2.translate(0, 0, 1.2);
    parts.push(p2);
  }
  const roof = new THREE.BoxGeometry(4.6, 0.1, 1.7);
  roof.translate(0, 2.55, 0);
  parts.push(roof);
  const bench = new THREE.BoxGeometry(3.0, 0.06, 0.4);
  bench.translate(0, 0.45, -0.35);
  parts.push(bench);
  return merge(parts);
}
function shelterGlassGeometry() {
  const g = new THREE.BoxGeometry(4.1, 2.0, 0.02);
  g.translate(-0.0, 1.35, -0.62);
  return g;
}
function shelterAdGeometry() {
  const g = new THREE.BoxGeometry(0.06, 1.75, 1.15);
  g.translate(2.1, 1.3, 0.0);
  return g;
}
function kioskGeometry() {
  const body = new THREE.BoxGeometry(3, 2.3, 3);
  body.translate(0, 1.15, 0);
  const roof = new THREE.BoxGeometry(3.6, 0.15, 3.6);
  roof.translate(0, 2.42, 0);
  return merge([body, roof]);
}
function awningGeometry() {
  const g = new THREE.BoxGeometry(1, 0.05, 1.8);
  g.rotateX(0.32);
  return g;
}

// --------------------------------------------------------------- texturas
function neonAtlas(signs) {
  const keys = [];
  const map = new Map();
  for (const s of signs) {
    const k = s.text + '|' + s.color;
    if (!map.has(k)) {
      map.set(k, keys.length);
      keys.push(s);
    }
  }
  const cols = 4, slotW = 512, slotH = 128;
  const rows = Math.ceil(keys.length / cols);
  const c = document.createElement('canvas');
  c.width = cols * slotW;
  c.height = THREE.MathUtils.ceilPowerOfTwo(Math.max(1, rows) * slotH);
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  keys.forEach((s, i) => {
    const x = (i % cols) * slotW, y = Math.floor(i / cols) * slotH;
    const col = new THREE.Color(s.color);
    const css = `rgb(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0})`;
    let size = 84;
    g.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    let w = g.measureText(s.text).width;
    if (w > slotW - 40) {
      size = Math.floor(size * (slotW - 40) / w);
      g.font = `800 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cx = x + slotW / 2, cy = y + slotH / 2 + 4;
    g.lineJoin = 'round';
    g.strokeStyle = css;
    g.globalAlpha = 0.28;
    g.lineWidth = 16;
    g.strokeText(s.text, cx, cy);
    g.globalAlpha = 1;
    g.lineWidth = 6;
    g.strokeText(s.text, cx, cy);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 2;
    g.strokeText(s.text, cx, cy);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, index: (s) => map.get(s.text + '|' + s.color), cols, rows: c.height / slotH, slotW, slotH, W: c.width, H: c.height };
}

const ADS = [
  { bg: ['#0a2a6b', '#1b6fd6'], title: 'COLA ÍNDIGO', sub: 'Refrescá tu noche', accent: '#33e1ff' },
  { bg: ['#ffb547', '#ff6a2a'], title: 'AUTOS SOL', sub: '0 km en 60 cuotas', accent: '#ffffff' },
  { bg: ['#14532d', '#22a35a'], title: 'SEGUROS TORTUGA', sub: 'Lento, pero seguro', accent: '#e9ffd6' },
  { bg: ['#1a1a2e', '#6c2bd9'], title: 'CLUB ÓRBITA', sub: 'Viernes de techno', accent: '#ff4fa3' },
  { bg: ['#e8f4ff', '#9cc9f2'], title: 'FLYCOSTA', sub: 'Volá a donde quieras', accent: '#0a3d7a' },
  { bg: ['#2b0f0f', '#a3122a'], title: 'PULSO 6G', sub: 'La red más rápida', accent: '#ffd27a' },
  { bg: ['#ffe8f2', '#ff8fc0'], title: 'HELADOS POLAR', sub: 'Artesanales desde 1962', accent: '#5a1236' },
  { bg: ['#06141f', '#0e4b5c'], title: 'ÍNDIGO FM 104.7', sub: 'La radio de la costa', accent: '#4dffa6' },
];

export function drawAd(g, ad, x, y, w, h) {
  const grd = g.createLinearGradient(x, y, x + w, y + h);
  grd.addColorStop(0, ad.bg[0]);
  grd.addColorStop(1, ad.bg[1]);
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.save();
  g.globalAlpha = 0.18;
  g.fillStyle = ad.accent;
  g.beginPath();
  g.arc(x + w * 0.82, y + h * 0.35, h * 0.55, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.12;
  g.fillRect(x, y + h * 0.78, w, h * 0.06);
  g.restore();
  g.fillStyle = ad.accent;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  g.font = `900 ${Math.floor(h * 0.27)}px "Arial Black", Arial, sans-serif`;
  g.fillText(ad.title, x + w * 0.06, y + h * 0.48, w * 0.88);
  g.globalAlpha = 0.9;
  g.font = `600 ${Math.floor(h * 0.13)}px Arial, sans-serif`;
  g.fillText(ad.sub, x + w * 0.06, y + h * 0.7, w * 0.88);
  g.globalAlpha = 1;
}

function adAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d');
  ADS.forEach((ad, i) => {
    const x = (i % 2) * 512, y = Math.floor(i / 2) * 256;
    drawAd(g, ad, x + 4, y + 4, 504, 248);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// --------------------------------------------------------------- clase
export class StreetProps {
  constructor(engine, world, lib) {
    this.engine = engine;
    this.world = world;
    this.lib = lib;
    this.group = new THREE.Group();
    this.group.name = 'mobiliario';
    engine.scene.add(this.group);
    this.paintMetal = lib.standard({ color: 0x2c3433, roughness: 0.45, metalness: 0.7 }, { key: 'paintmetal' });
    this.steel = lib.standard({ color: 0xb9bec4, roughness: 0.32, metalness: 0.9 }, { key: 'steel2' });
    this.concrete = lib.triplanar(DETAIL.CONCRETE, 0xaaa59c, 2);
    this.instGroups = {};
    this.chunked = [];
    this._lamps();
    this._trafficLights();
    this._furniture();
    this._signs();
    this._billboards();
    this._screen();
  }

  _inst(name, geo, mat, list, place, cast = true, opts = null) {
    if (!list.length) return null;
    if (opts && opts.chunk) {
      const ch = new ChunkedInstances(this.group, geo, mat, { ...opts, cast, name });
      list.forEach((it, i) => {
        place(it, i);
        ch.add(_m, opts.colorFn ? opts.colorFn(it, i) : null);
      });
      ch.build();
      this.instGroups[name] = ch;
      this.chunked.push(ch);
      return ch;
    }
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => {
      place(it, i);
      mesh.setMatrixAt(i, _m);
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.name = name;
    this.group.add(mesh);
    this.instGroups[name] = mesh;
    return mesh;
  }

  /** Oculta una instancia rota (faroles, hidrantes, cestos, bancos). */
  hideInstance(group, index) {
    const names = { lamps: ['lamps', 'lampBulbs', 'lampCones'], hydrants: ['hydrants'], bins: ['bins'], benches: ['benches'] }[group] || [];
    for (const n of names) {
      const mesh = this.instGroups[n];
      if (!mesh) continue;
      if (mesh.isChunked) {
        mesh.hide(index);
        continue;
      }
      mesh.getMatrixAt(index, _m);
      _m.decompose(_p, _q, _s);
      _m.compose(_p, _q, _s.set(0, 0, 0));
      mesh.setMatrixAt(index, _m);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  showInstance(group, index) {
    // Al recargar la partida los objetos se restauran reconstruyendo la matriz original
    const w = this.world;
    if (group === 'lamps') {
      const l = w.lamps[index];
      const y = l.y != null ? l.y : w.groundAt(l.x, l.z);
      for (const n of ['lamps', 'lampBulbs', 'lampCones']) {
        const mesh = this.instGroups[n];
        if (!mesh) continue;
        if (mesh.isChunked) {
          mesh.show(index);
          continue;
        }
        mesh.setMatrixAt(index, compose(l.x, y, l.z, l.yaw));
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  _lamps() {
    const w = this.world;
    const lamps = w.lamps;
    const lampY = (l) => (l.y != null ? l.y : w.groundAt(l.x, l.z));
    this._inst('lamps', lampGeometry(), this.paintMetal, lamps, (l) => compose(l.x, lampY(l), l.z, l.yaw), true, { chunk: 360, maxDist: 560 });
    this.bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    this.bulbMat.userData.lit = false;
    this.lib.register(this.bulbMat, { key: 'bulb', basic: true });
    this._inst('lampBulbs', lampBulbGeometry(), this.bulbMat, lamps, (l) => compose(l.x, lampY(l), l.z, l.yaw), false, { chunk: 360, maxDist: 700 });
    // Conos volumétricos
    this.coneMat = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        uLamps: U.uLamps, uFogDensity: U.uFogDensity, uFogFalloff: U.uFogFalloff, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor,
        uSunDir: U.uSunDir, uRain: U.uRain, uStrength: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying float vH; varying vec3 vN; varying vec3 vWP;
        ${FOG_PARS_VERTEX}
        void main(){
          vec4 wp = instanceMatrix * vec4(position, 1.0);
          wp = modelMatrix * wp;
          vWP = wp.xyz;
          vH = clamp((position.y - (7.84 - 7.8)) / 7.8, 0., 1.);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          ${FOG_VERTEX}
        }`,
      fragmentShader: /* glsl */ `
        uniform float uLamps; uniform float uRain; uniform float uStrength; uniform vec3 uSunDir;
        varying float vH; varying vec3 vN; varying vec3 vWP;
        ${FOG_PARS_FRAGMENT}
        void main(){
          vec3 V = normalize(cameraPosition - vWP);
          float edge = pow(abs(dot(V, normalize(vN))), 1.6);
          float dist = length(cameraPosition - vWP);
          float fade = smoothstep(180., 40., dist) * smoothstep(1.5, 6., dist);
          float a = edge * vH * vH * uLamps * fade * (0.05 + uFogDensity * 90. + uRain * 0.08) * uStrength;
          gl_FragColor = vec4(vec3(1.0, .72, .42) * a, 1.0);
          #ifdef USE_FOG
            vec3 fogRd; float fogF = heightFog(cameraPosition, vFogWP, fogRd);
            gl_FragColor.rgb *= 1. - fogF;
          #endif
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: true,
    });
    this._inst('lampCones', lightConeGeometry(), this.coneMat, lamps, (l) => compose(l.x, lampY(l), l.z, l.yaw), false, { chunk: 360, maxDist: 220, receive: false, renderOrder: 5 });
  }

  _trafficLights() {
    const w = this.world;
    const yawFor = { 'x+': 0, 'x-': Math.PI, 'z+': -Math.PI / 2, 'z-': Math.PI / 2 };
    const list = w.tlights;
    this._inst('tpoles', trafficPoleGeometry(), this.paintMetal, list, (t) => compose(t.x, w.groundAt(t.x, t.z), t.z, yawFor[t.armDir]), true, { chunk: 360, maxDist: 480 });
    // Lámparas: 3 discos por poste (rojo, amarillo, verde) mirando al tránsito que llega
    const lampGeo = new THREE.CircleGeometry(0.13, 10);
    lampGeo.rotateY(Math.PI);
    this.sigMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.sigMat.userData.lit = false;
    this.lib.register(this.sigMat, { key: 'signal', basic: true });
    const sig = new ChunkedInstances(this.group, lampGeo, this.sigMat, { chunk: 360, maxDist: 360, cast: false, receive: false, name: 'signals' });
    const local = new THREE.Vector3();
    const dark = new THREE.Color(0x111111);
    list.forEach((t) => {
      const yaw = yawFor[t.armDir];
      const y0 = w.groundAt(t.x, t.z);
      for (let k = 0; k < 3; k++) {
        local.set(5.0, 5.55 + 0.37 - k * 0.37, -0.19).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        sig.add(compose(t.x + local.x, y0 + local.y, t.z + local.z, yaw), dark);
      }
    });
    sig.build();
    this.sig = sig;
    this.chunked.push(sig);
    this.sigState = new Array(list.length).fill('');
    this.sigColors = {
      on: [new THREE.Color(5, 0.25, 0.15), new THREE.Color(5, 3.0, 0.2), new THREE.Color(0.25, 4.5, 1.4)],
      off: [new THREE.Color(0.12, 0.02, 0.02), new THREE.Color(0.12, 0.08, 0.01), new THREE.Color(0.01, 0.1, 0.04)],
    };
  }

  _furniture() {
    const w = this.world, P = w.props;
    const gy = (x, z) => w.groundAt(x, z);
    const wood = this.lib.triplanar(DETAIL.PAINT, 0x7a5638, 1, { roughness: 0.75 });
    this._inst('benches', benchGeometry(), wood, P.benches, (b) => compose(b.x, gy(b.x, b.z), b.z, b.yaw), true, { chunk: 360, maxDist: 170 });
    this._inst('bins', binGeometry(), this.paintMetal, P.bins, (b) => compose(b.x, gy(b.x, b.z), b.z, 0), false, { chunk: 360, maxDist: 140 });
    const red = this.lib.standard({ color: 0xb3221c, roughness: 0.5, metalness: 0.3 }, { key: 'hydrant' });
    this._inst('hydrants', hydrantGeometry(), red, P.hydrants, (b) => compose(b.x, gy(b.x, b.z), b.z, 0), false, { chunk: 360, maxDist: 130 });
    this._inst('bollards', bollardGeometry(), this.paintMetal, P.bollards, (b) => compose(b.x, gy(b.x, b.z), b.z, 0), false, { chunk: 360, maxDist: 160 });
    this._inst('planters', unitBox(), this.concrete, P.planters, (b) => compose(b.x, gy(b.x, b.z), b.z, 0, 1.8, 0.75, 1.8), true, { chunk: 360, maxDist: 320 });
    this._inst('shelters', shelterGeometry(), this.steel, P.shelters, (b) => compose(b.x, gy(b.x, b.z), b.z, b.yaw));
    const glass = this.lib.physical({ color: 0xbfd8e0, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.25 }, { key: 'shelterglass' });
    this._inst('shelterGlass', shelterGlassGeometry(), glass, P.shelters, (b) => compose(b.x, gy(b.x, b.z), b.z, b.yaw), false);
    this.adTex = adAtlas();
    this.adMat = this.lib.standard({ map: this.adTex, emissiveMap: this.adTex, emissive: 0xffffff, emissiveIntensity: 0.4, roughness: 0.35 }, { key: 'admat' });
    // Panel publicitario con UV de una celda del atlas
    const adGeo = shelterAdGeometry();
    const uv = adGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.5, 0.75 + uv.getY(i) * 0.25);
    this._inst('shelterAds', adGeo, this.adMat, P.shelters, (b) => compose(b.x, gy(b.x, b.z), b.z, b.yaw), false);
    this._inst('kiosks', kioskGeometry(), this.lib.standard({ color: 0x2f6d6b, roughness: 0.6 }, { key: 'kiosk' }), P.kiosks, (b) => compose(b.x, gy(b.x, b.z), b.z, b.yaw));
    const fabric = this.lib.standard({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide }, { key: 'fabric', fragColor: 'diffuseColor.rgb *= mix(1., .7, uWet);' });
    const aw = this._inst('awnings', awningGeometry(), fabric, P.awnings, (a) => compose(a.x, a.y, a.z, a.yaw, a.w, 1, 1));
    if (aw) P.awnings.forEach((a, i) => aw.setColorAt(i, new THREE.Color(a.c)));
    // Setos
    const hedge = this.lib.standard({ color: 0x2f5a24, roughness: 0.95 }, {
      key: 'hedge',
      fragColor: 'diffuseColor.rgb *= .75 + .5 * fbm3(vWPos.xz * 3.1 + vWPos.y * 2.7); diffuseColor.rgb *= mix(1., .75, uWet);',
    });
    this._inst('hedges', unitBox(), hedge, P.hedges, (h) => compose(h.x, gy(h.x, h.z), h.z, 0, h.w, h.h, h.d));
    // Barandas del paseo
    const posts = [];
    const rails = [];
    for (const f of P.fences) {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      const n = Math.floor(len / 2.4);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        posts.push({ x: f.x0 + (f.x1 - f.x0) * t, z: f.z0 + (f.z1 - f.z0) * t, h: f.h });
      }
      rails.push(f);
    }
    const postGeo = new THREE.CylinderGeometry(0.04, 0.05, 1, 4, 1, true);
    postGeo.translate(0, 0.5, 0);
    this._inst('fencePosts', postGeo, this.steel, posts, (p) => compose(p.x, gy(p.x, p.z), p.z, 0, 1, p.h, 1), false, { chunk: 360, maxDist: 240 });
    const railGeo = new THREE.BoxGeometry(1, 0.05, 0.05);
    const railList = [];
    for (const f of rails) for (const hh of [f.h, f.h * 0.5]) railList.push({ ...f, hh });
    this._inst('fenceRails', railGeo, this.steel, railList, (f) => {
      const len = Math.hypot(f.x1 - f.x0, f.z1 - f.z0);
      const yaw = Math.atan2(-(f.z1 - f.z0), f.x1 - f.x0);
      return compose((f.x0 + f.x1) / 2, gy((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2) + f.hh, (f.z0 + f.z1) / 2, yaw, len, 1, 1);
    }, false);
    // Equipos de azotea
    this._inst('roofBoxes', unitBox(), this.lib.standard({ color: 0xffffff, roughness: 0.6, metalness: 0.4 }, { key: 'roofbox' }), P.roofBoxes, (b) => compose(b.x, b.y, b.z, 0, b.w, b.h, b.d));
    if (this.instGroups.roofBoxes) P.roofBoxes.forEach((b, i) => this.instGroups.roofBoxes.setColorAt(i, new THREE.Color(b.c)));
    const tankGeo = new THREE.CylinderGeometry(1, 1, 1, 14);
    tankGeo.translate(0, 0.5, 0);
    this._inst('roofTanks', tankGeo, this.lib.triplanar(DETAIL.PAINT, 0x8d8375, 1.5), P.roofTanks, (t) => compose(t.x, t.y + 1.2, t.z, 0, t.r, t.h, t.r));
    const antGeo = new THREE.CylinderGeometry(0.06, 0.12, 1, 6);
    antGeo.translate(0, 0.5, 0);
    this._inst('antennas', antGeo, this.steel, P.antennas, (a) => compose(a.x, a.y, a.z, 0, a.spire ? 6 : 1, a.h, a.spire ? 6 : 1), false);
    // Luces de balizamiento (rojo intermitente)
    const avGeo = new THREE.SphereGeometry(0.35, 8, 6);
    this.avMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    this.avMat.userData.lit = false;
    this.lib.register(this.avMat, { key: 'aviation', basic: true });
    this._inst('aviation', avGeo, this.avMat, P.aviation, (a) => compose(a.x, a.y, a.z), false);
    // Tiras LED en bordes de torres
    const edges = [];
    for (const e of P.edgeLights) {
      const b = e.b;
      const top = b.y0 + b.h + 0.05;
      if (b.radius) {
        const n = 48;
        for (let i = 0; i < n; i++) {
          const a0 = (i / n) * Math.PI * 2;
          edges.push({ x: b.x + Math.cos(a0) * b.radius, y: top, z: b.z + Math.sin(a0) * b.radius, yaw: -a0, len: (2 * Math.PI * b.radius) / n + 0.05, c: e.color });
        }
      } else {
        edges.push({ x: b.x, y: top, z: b.z - b.d / 2, yaw: 0, len: b.w, c: e.color });
        edges.push({ x: b.x, y: top, z: b.z + b.d / 2, yaw: 0, len: b.w, c: e.color });
        edges.push({ x: b.x - b.w / 2, y: top, z: b.z, yaw: Math.PI / 2, len: b.d, c: e.color });
        edges.push({ x: b.x + b.w / 2, y: top, z: b.z, yaw: Math.PI / 2, len: b.d, c: e.color });
      }
    }
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.edgeMat.userData.lit = false;
    this.lib.register(this.edgeMat, { key: 'edgeled', basic: true });
    const em = this._inst('edgeLights', new THREE.BoxGeometry(1, 0.18, 0.18), this.edgeMat, edges, (e) => compose(e.x, e.y, e.z, e.yaw, e.len, 1, 1), false);
    if (em) edges.forEach((e, i) => em.setColorAt(i, new THREE.Color(e.c)));
  }

  _signs() {
    const signs = this.world.signs;
    if (!signs.length) return;
    const atlas = neonAtlas(signs);
    this.neonAtlas = atlas;
    const quads = [];
    const plates = [];
    for (const s of signs) {
      const idx = atlas.index(s);
      const col = idx % atlas.cols, row = Math.floor(idx / atlas.cols);
      const u0 = (col * atlas.slotW) / atlas.W, u1 = ((col + 1) * atlas.slotW) / atlas.W;
      const v1 = 1 - (row * atlas.slotH) / atlas.H, v0 = 1 - ((row + 1) * atlas.slotH) / atlas.H;
      const g = new THREE.PlaneGeometry(s.w, s.h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0);
      g.rotateY(s.yaw);
      const off = new THREE.Vector3(0, 0, 0.09).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.yaw);
      g.translate(s.x + off.x, s.y, s.z + off.z);
      quads.push(g);
      plates.push(s);
    }
    const geo = mergeGeometries(quads);
    this.neonMat = new THREE.MeshBasicMaterial({ map: atlas.tex, transparent: true, depthWrite: false, color: 0xffffff });
    this.neonMat.userData.lit = false;
    this.lib.register(this.neonMat, { key: 'neon', basic: true });
    const mesh = new THREE.Mesh(geo, this.neonMat);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    // placas de respaldo
    const plateMat = this.lib.standard({ color: 0x15171c, roughness: 0.5, metalness: 0.6 }, { key: 'signplate' });
    this._inst('signPlates', new THREE.BoxGeometry(1, 1, 0.12), plateMat, plates, (s) => compose(s.x, s.y, s.z, s.yaw, s.w * 1.04, s.h * 1.1, 1));
  }

  _billboards() {
    // Carteles publicitarios sobre azoteas de edificios medianos frente a avenidas
    const r = new RNG(9001);
    const list = [];
    for (const b of this.world.buildings) {
      if (b.style === 'house' || b.style === 'glass' || b.style === 'round' || b.y0 > 0) continue;
      if (b.h < 9 || b.h > 34 || b.w < 14 || b.d < 12) continue;
      if (!r.chance(0.12)) continue;
      const side = r.pick(['n', 's', 'e', 'w']);
      const yaw = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[side];
      const off = new THREE.Vector3(0, 0, (side === 'n' || side === 's' ? b.d : b.w) * 0.25).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      list.push({ x: b.x + off.x, y: b.h, z: b.z + off.z, yaw, ad: r.int(0, ADS.length - 1) });
      if (list.length >= 34) break;
    }
    this.world.billboards = list;
    if (!list.length) return;
    const faces = [];
    const frames = [];
    for (const bb of list) {
      const g = new THREE.PlaneGeometry(12, 4.6);
      const uv = g.attributes.uv;
      const cx = (bb.ad % 2) * 0.5, cy = 1 - (Math.floor(bb.ad / 2) + 1) * 0.25;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, cx + uv.getX(i) * 0.5, cy + uv.getY(i) * 0.25);
      g.rotateY(bb.yaw);
      g.translate(bb.x, bb.y + 4.4, bb.z);
      faces.push(g);
      frames.push(bb);
    }
    const mesh = new THREE.Mesh(mergeGeometries(faces), this.adMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    const frameGeo = merge([
      (() => { const g = new THREE.BoxGeometry(12.4, 5.0, 0.25); g.translate(0, 4.4, -0.16); return g; })(),
      (() => { const g = new THREE.BoxGeometry(0.25, 2.2, 0.25); g.translate(-4, 1.1, -0.3); return g; })(),
      (() => { const g = new THREE.BoxGeometry(0.25, 2.2, 0.25); g.translate(4, 1.1, -0.3); return g; })(),
      (() => { const g = new THREE.BoxGeometry(12, 0.08, 0.9); g.translate(0, 1.9, 0.3); return g; })(),
    ]);
    this._inst('billboardFrames', frameGeo, this.paintMetal, frames, (bb) => compose(bb.x, bb.y, bb.z, bb.yaw));
  }

  _screen() {
    const scr = this.world.props.screens[0];
    if (!scr) return;
    const c = document.createElement('canvas');
    c.width = 640;
    c.height = 360;
    this.screenCanvas = c;
    this.screenCtx = c.getContext('2d');
    this.screenTex = new THREE.CanvasTexture(c);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, color: 0xffffff });
    this.screenMat.userData.lit = false;
    this.lib.register(this.screenMat, { key: 'screen', basic: true });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(scr.w, scr.h), this.screenMat);
    face.position.set(scr.x, 5 + scr.h / 2, scr.z + 0.36);
    face.rotation.y = scr.yaw;
    this.group.add(face);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(scr.w + 0.6, scr.h + 0.6, 0.6), this.paintMetal);
    frame.position.set(scr.x, 5 + scr.h / 2, scr.z);
    frame.castShadow = true;
    this.group.add(frame);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.2, 0.8), this.paintMetal);
      leg.position.set(scr.x + s * (scr.w / 2 - 1.5), 2.6, scr.z);
      leg.castShadow = true;
      this.group.add(leg);
    }
    this.screenT = 0;
    this.screenTicker = 'BIENVENIDOS A PUERTO ÍNDIGO  •  HOY: 27°C, BRISA DEL ESTE  •  CARRERAS EN LA COSTANERA ESTE VIERNES  •  EL PUENTE ESMERALDA CUMPLE 40 AÑOS  •  ';
    this._drawScreen(0);
  }

  _drawScreen(t) {
    const g = this.screenCtx, W = 640, H = 360;
    const ad = ADS[Math.floor(t / 6) % ADS.length];
    drawAd(g, ad, 0, 0, W, H - 50);
    g.fillStyle = '#05070c';
    g.fillRect(0, H - 50, W, 50);
    g.fillStyle = '#ffb547';
    g.font = '700 26px Arial, sans-serif';
    g.textBaseline = 'middle';
    const tw = g.measureText(this.screenTicker).width;
    const x = -((t * 90) % tw);
    g.fillText(this.screenTicker + this.screenTicker, x, H - 25);
    g.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    this.screenTex.needsUpdate = true;
  }

  /** t: reloj visual (animaciones). signalT: reloj del juego que también usa el tránsito para los semáforos. */
  update(dt, t, nightK, lampsOn, camPos, signalT = t) {
    if (camPos) for (const c of this.chunked) c.update(camPos);
    // Faroles
    const k = lampsOn;
    this.bulbMat.color.setRGB(1.0, 0.82, 0.58).multiplyScalar(0.25 + k * 9);
    // Neón: tenue de día, intenso de noche
    if (this.neonMat) this.neonMat.color.setScalar(0.85 + nightK * 4.5 + k * 0.6);
    if (this.edgeMat) this.edgeMat.color.setScalar(0.2 + Math.max(nightK, k * 0.6) * 5);
    if (this.adMat) this.adMat.emissiveIntensity = 0.05 + nightK * 1.3;
    if (this.screenMat) this.screenMat.color.setScalar(1.1 + nightK * 1.6);
    if (this.avMat) this.avMat.color.setRGB(1, 0.12, 0.06).multiplyScalar((0.5 + 0.5 * Math.sin(t * 3.2) > 0.6 ? 10 : 0.3) * (0.3 + nightK));
    // Pantalla LED (10 fps)
    if (this.screenCtx) {
      this.screenT += dt;
      if (this.screenT > 0.1) {
        this.screenT = 0;
        this._drawScreen(t);
      }
    }
    // Semáforos
    if (this.sig) {
      const w = this.world;
      let changed = false;
      const list = w.tlights;
      for (let i = 0; i < list.length; i++) {
        const tl = list[i];
        const st = w.lightState(w.nodes[tl.node], tl.axis, signalT);
        if (st === this.sigState[i]) continue;
        this.sigState[i] = st;
        changed = true;
        const on = st === 'r' ? 0 : st === 'y' ? 1 : 2;
        for (let kk = 0; kk < 3; kk++) this.sig.setColor(i * 3 + kk, kk === on ? this.sigColors.on[kk] : this.sigColors.off[kk]);
      }
      if (changed) this.sig.flushColors();
    }
  }
}

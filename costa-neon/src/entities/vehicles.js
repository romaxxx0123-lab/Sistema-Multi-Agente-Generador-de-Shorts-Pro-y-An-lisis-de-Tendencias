// Vehículos: render instanciado, física arcade, colisiones, daño, luces, audio y gestión.
import * as THREE from 'three';
import { MODELS, PAINTS, METALLIC, buildCar, buildBike, buildWheel } from './vehicleModels.js';
import { clamp, damp, moveToward, angleDiff, wrapAngle, rand } from '../core/utils.js';
import { WATER_LEVEL, isRoad } from '../world/map.js';
import { U } from '../world/shaders.js';
import { setDynamic } from '../core/layers.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _v = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _c = new THREE.Color();
// Llantas y pinzas por tipo de auto
const RIMS = {
  sport: [0x3a3d42, 0x1c1d20, 0x8a6a3a, 0xffffff, 0x9a9ea3],
  normal: [0xffffff, 0xe8e9ea, 0xb4b7ba, 0x5a5d61],
  police: [0x2a2b2e],
  work: [0xffffff, 0x2f3134, 0xd8d9da],
};
const CALIPERS = { sport: [0xc4161c, 0xd9a60f, 0x2a2b2d, 0xc4161c], other: [0x2a2b2d, 0x3a3b3d] };
const CAPACITY = { compacto: 26, sedan: 30, taxi: 14, patrulla: 16, suv: 18, furgon: 12, pickup: 12, muscle: 10, deportivo: 10, superauto: 8, moto: 10 };

const GLASS_VHEAD = /* glsl */ `
attribute vec4 aDamage;
uniform vec4 uDims; // L, W, H, clear
varying vec3 vObj; varying vec4 vDmg;
`;
const PAINT_HEAD = GLASS_VHEAD + /* glsl */ `
attribute float aAO; varying float vAO;
attribute vec3 aPaint; varying vec3 vPaint;
`;
const AO_BEGIN = /* glsl */ `vAO = aAO; vPaint = aPaint;`;
// Faroles de la calle sobre la carrocería (cualquier orientación): difuso Lambert y dos lóbulos
// especulares GGX (base y laca). Mismo patrón de faroles que el suelo, así los reflejos coinciden.
const CAR_LAMPS = /* glsl */ `
float carGGX(float NoH, float a){ float a2 = a * a; float d = NoH * NoH * (a2 - 1.) + 1.; return a2 / (3.14159 * d * d); }
vec3 carLamps(vec3 wp, vec3 N, vec3 V, float roughBase, float roughCoat){
  vec3 acc = vec3(0.);
  if (uLamps < .01) return acc;
  float lx = floor((wp.x - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float lz = floor((wp.z - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float ab = max(roughBase * roughBase, .003), ac = max(roughCoat * roughCoat, .0015);
  float sy = L_H + .2;
  for (int k = 0; k < 2; k++){
    bool vertical = k == 0;
    float line = vertical ? lx : lz;
    float off = vertical ? wp.x - lx : wp.z - lz;
    if (abs(off) > 34.) continue;
    if (vertical ? !roadV(lx, wp.z) : !roadH(lz, wp.x)) continue;
    float kk = floor(((vertical ? wp.z : wp.x) - L_ORIGIN) / L_SP);
    for (int s = -1; s < 3; s++){
      float n = kk + float(s);
      if (mod(n, 4.) < .5) continue;
      float alongP = L_ORIGIN + n * L_SP;
      for (int side = 0; side < 2; side++){
        float o = side == 0 ? -L_OFF : L_OFF;
        vec3 lp = vertical ? vec3(line + o, sy, alongP) : vec3(alongP, sy, line + o);
        vec3 d = lp - wp;
        float r2 = dot(d, d);
        vec3 L = d * inversesqrt(r2);
        float fall = pow(max(L.y, 0.), 3.5) * (L_H * L_H) / (r2 + .6);
        float NoL = max(dot(N, L), 0.);
        if (NoL <= 0. || fall <= 0.) continue;
        float NoH = max(dot(N, normalize(L + V)), 0.);
        acc.x += NoL * fall;
        acc.y += carGGX(NoH, ab) * NoL * fall * .25;
        acc.z += carGGX(NoH, ac) * NoL * fall * .25;
      }
    }
  }
  return acc;
}
`;
const LAMPS_POST = /* glsl */ `
{
  vec3 cnNW = inverseTransformDirection(normal, viewMatrix);
  vec3 cnV = normalize(cameraPosition - vWPos);
  #ifdef USE_CLEARCOAT
    float cnCoatR = material.clearcoatRoughness;
  #else
    float cnCoatR = .3;
  #endif
  vec3 cl = carLamps(vWPos, cnNW, cnV, max(material.roughness, .04), cnCoatR) * uLamps;
  reflectedLight.directDiffuse += LAMP_COLOR * cl.x * material.diffuseColor * 1.1;
  reflectedLight.directSpecular += LAMP_COLOR * cl.y * material.specularColor * .8;
  #ifdef USE_CLEARCOAT
    float cnF = .04 + .96 * pow(1. - max(dot(cnNW, cnV), 0.), 5.);
    reflectedLight.directSpecular += LAMP_COLOR * cl.z * cnF * material.clearcoat * .8;
  #endif
}
`;
// Oclusión precalculada: sólo atenúa la luz indirecta (cielo/entorno), no el sol directo.
const AO_FHEAD = /* glsl */ `varying float vAO;`;
const AO_POST = /* glsl */ `
  reflectedLight.indirectDiffuse *= vAO;
  reflectedLight.indirectSpecular *= mix(1.0, vAO, 0.65);
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= mix(1.0, vAO, 0.55);
  #endif
`;
const PAINT_BEGIN = /* glsl */ `
{
  vObj = position; vDmg = aDamage;
  float hz = uDims.x * .5, hw = uDims.y * .5;
  float n = sin(position.x * 23.1 + position.y * 17.3) * sin(position.z * 19.7 + position.y * 7.1);
  float f = smoothstep(hz - 1.3, hz, position.z) * aDamage.x;
  float r = (1. - smoothstep(-hz, -hz + 1.3, position.z)) * aDamage.y;
  float l = smoothstep(hw - .45, hw + .05, position.x) * aDamage.z;
  float rr = (1. - smoothstep(-hw - .05, -hw + .45, position.x)) * aDamage.w;
  transformed.z -= f * (.32 + .22 * n);
  transformed.z += r * (.3 + .2 * n);
  transformed.x -= l * (.22 + .15 * n);
  transformed.x += rr * (.22 + .15 * n);
  transformed.y -= (f + r) * .06 * (.5 + .5 * n);
}
`;
const PAINT_FHEAD = /* glsl */ `
uniform vec4 uDims; uniform vec4 uSeams; uniform float uLivery; uniform vec4 uHood;
varying vec3 vObj; varying vec4 vDmg; varying float vAO; varying vec3 vPaint;
float gDirt = 0.0; // suciedad efectiva en este fragmento (color → rugosidad)
float flakeHash(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
` + CAR_LAMPS;
// Pintura sólida o metalizada por auto: metalizado con escamas que destellan bajo el barniz
const PAINT_METAL = /* glsl */ `
  metalnessFactor = mix(0.0, 0.62, vPaint.x);
`;
const PAINT_ROUGH = /* glsl */ `
  roughnessFactor = mix(mix(0.42, 0.34, vPaint.x), 0.82, gDirt);
  roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.55, uWet); // película de agua
`;
const PAINT_FLAKES = /* glsl */ `
  {
    // escamas sólo de cerca (de lejos se promedian en el brillo del metalizado y no titilan)
    float flakeK = vPaint.y * (1.0 - smoothstep(1.5, 9.0, length(cameraPosition - vWPos)));
    if (flakeK > 0.01) {
      vec3 cell = floor(vObj * 300.0);
      vec3 r = vec3(flakeHash(cell), flakeHash(cell + 17.3), flakeHash(cell + 41.7)) - 0.5;
      normal = normalize(normal + r * 0.12 * flakeK);
    }
  }
`;
const PAINT_FRAG = /* glsl */ `
{
  vec3 on = normalize(vWNrm);
  float side = 1. - step(.75, abs(dot(on, vec3(0., 1., 0.))));
  float seam = 0.;
  for (int i = 0; i < 4; i++) seam = max(seam, 1. - smoothstep(.004, .012, abs(vObj.z - uSeams[i])));
  seam *= side * step(uDims.w + .12, vObj.y) * step(vObj.y, uDims.z * .66);
  // líneas de capó y baúl sobre las superficies superiores
  float topF = step(.55, on.y);
  float lineX = 1. - smoothstep(.003, .009, abs(abs(vObj.x) - uHood.z));
  seam = max(seam, lineX * topF * step(uHood.x, vObj.z) * step(vObj.z, uHood.w));
  seam = max(seam, lineX * topF * step(vObj.z, uHood.y) * step(-uHood.w, vObj.z));
  vec3 c = diffuseColor.rgb;
  if (uLivery > .5) {
    float lower = step(vObj.y, uDims.z * .45);
    c = mix(c, vec3(.02, .03, .06), lower);
    float stripe = (1. - smoothstep(.0, .02, abs(vObj.y - uDims.z * .5) - .045)) * side;
    c = mix(c, vec3(.05, .2, .75), stripe);
  }
  c *= 1. - seam * .75;
  // suciedad baja y daño (rayones)
  float dmg = max(max(vDmg.x, vDmg.y), max(vDmg.z, vDmg.w));
  c *= 1. - .25 * (1. - smoothstep(uDims.w, uDims.w + .35, vObj.y));
  // suciedad por auto: película de polvo general y barro salpicado en la parte baja
  {
    // barro salpicado abajo (más cerca de las ruedas), polvo parejo arriba y chorreaduras en los laterales
    float low = 1. - smoothstep(uDims.w + .05, uDims.w + .7, vObj.y);
    float n = fbm3(vObj.xz * 9.0 + vObj.y * 4.0);
    float splash = low * smoothstep(.35, .8, n + low * .3);
    float up = smoothstep(.45, .9, on.y);
    float streak = side * smoothstep(.55, .95, vnoise(vec2(vObj.z * 14.0 + vObj.x * 9.0, vObj.y * 1.5))) * .35;
    float film = up * (.32 + .1 * vnoise(vObj.xz * 1.7)) + streak + .08;
    gDirt = clamp(vPaint.z * (splash * .85 + film * .7), 0., .85);
    c = mix(c, vec3(.33, .3, .26), gDirt);
    // mojado: la pintura se oscurece levemente
    c *= 1. - .14 * uWet * (1. - gDirt * .5);
  }
  // rayones alargados sólo en la zona golpeada (frente, cola, laterales según cada abolladura)
  {
    float hz = uDims.x * .5, hw = uDims.y * .5;
    float zone = max(max(smoothstep(hz - 1.4, hz, vObj.z) * vDmg.x, smoothstep(-hz + 1.4, -hz, vObj.z) * vDmg.y),
                     max(smoothstep(hw - .5, hw, vObj.x) * vDmg.z, smoothstep(-hw + .5, -hw, vObj.x) * vDmg.w));
    vec2 sp = vec2(vObj.z * 3.0 + vObj.x * 1.2, vObj.y * 55.0 + vObj.z * 4.0);
    float lines = smoothstep(.62, .95, vnoise(sp)) * smoothstep(.3, .7, vnoise(vObj.xz * 4.0 + vObj.y * 2.0));
    float sc = lines * smoothstep(.15, .7, zone);
    c = mix(c, vec3(.42, .42, .41), sc * .7);
    // chapa raspada: menos laca donde hay rayones
    gDirt = max(gDirt, sc * .5);
  }
  diffuseColor.rgb = c;
}
`;

// Vidrio: transparencia según Fresnel (de frente se ve el interior, de costado refleja) y
// reflejos sin atenuar (alfa premultiplicado: el color difuso se mezcla, el especular se suma).
const GLASS_FHEAD = /* glsl */ `uniform float uGlassAlpha; varying vec3 vObj;
// gotas de lluvia sobre el vidrio: celdas con gotas de tamaño variable que reflejan el cielo
float rainDrops(vec3 p, float t){
  vec2 uv = p.xz * 9.0 + vec2(p.y * 7.0, 0.0);
  vec2 cell = floor(uv), f = fract(uv) - .5;
  vec2 h = hash22(cell);
  float on = step(.35, h.x);
  vec2 c = (h - .5) * .5;
  float r = .07 + .16 * h.y;
  float d = length(f - c);
  return on * (1. - smoothstep(r * .6, r, d));
}
` + CAR_LAMPS;
const GLASS_OUT = /* glsl */ `
{
  float cnNV = saturate(dot(geometryNormal, geometryViewDir));
  float cnA = mix(uGlassAlpha, 0.97, pow(1.0 - cnNV, 4.0));
  vec3 cnSpec = max(outgoingLight - totalDiffuse, vec3(0.0));
  // gotas: más reflejo y algo menos de transparencia
  float drops = rainDrops(vObj, uTime) * uWet;
  cnSpec += drops * (0.08 + cnSpec * 1.5);
  cnA = mix(cnA, 0.85, drops * 0.5);
  outgoingLight = (totalDiffuse * cnA + cnSpec) / cnA;
  diffuseColor.a = cnA;
}
`;

// Patentes ficticias de Puerto Índigo: atlas de 4×8 placas con números distintos
const PLATE_COLS = 4, PLATE_ROWS = 8;
function makePlateAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let r = 0; r < PLATE_ROWS; r++)
    for (let k = 0; k < PLATE_COLS; k++) {
      const x = k * 256, y = r * 64;
      g.fillStyle = '#f1f2ee';
      g.fillRect(x + 2, y + 2, 252, 60);
      g.strokeStyle = '#1b1d22';
      g.lineWidth = 3;
      g.strokeRect(x + 5, y + 5, 246, 54);
      g.fillStyle = '#1d3f8f';
      g.fillRect(x + 7, y + 7, 242, 12);
      g.fillStyle = '#f4f6ff';
      g.font = 'bold 10px Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('PUERTO ÍNDIGO', x + 128, y + 13.5);
      const txt = L[(rnd() * L.length) | 0] + L[(rnd() * L.length) | 0] + ' ' + String(100 + ((rnd() * 900) | 0)) + ' ' + L[(rnd() * L.length) | 0] + L[(rnd() * L.length) | 0];
      g.fillStyle = '#16181c';
      g.font = 'bold 33px "Arial Narrow", Arial, sans-serif';
      g.fillText(txt, x + 128, y + 41);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 10, 2, 32, 40, 70);
  grd.addColorStop(0, 'rgba(255,240,220,0.9)');
  grd.addColorStop(0.4, 'rgba(255,230,200,0.35)');
  grd.addColorStop(1, 'rgba(255,230,200,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  return new THREE.CanvasTexture(c);
}

class VehicleRenderer {
  constructor(game) {
    this.game = game;
    const lib = game.lib;
    this.group = new THREE.Group();
    this.group.name = 'vehiculos';
    game.engine.scene.add(this.group);
    this.models = {};
    this.trimMat = lib.standard({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.2 }, { key: 'vtrim' });
    this.glassMat = lib.physical({ color: 0x0a0d10, roughness: 0.035, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.02 }, { key: 'vglass' });
    this.chromeMat = lib.standard({ color: 0xe2e5e8, roughness: 0.12, metalness: 1 }, { key: 'vchrome' });
    const basic = (key) => {
      const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
      m.userData.lit = false;
      return lib.register(m, { key, basic: true });
    };
    this.headMat = basic('vhead');
    this.tailMat = basic('vtail');
    this.extraMat = basic('vextra');
    this.blinkMat = basic('vblink');
    // patentes: atlas + índice por instancia
    this.plateMat = lib.standard({ map: makePlateAtlas(), roughness: 0.42, metalness: 0.25 }, {
      key: 'vplate',
      vertexHead: 'attribute float aPlate;',
      vertexWorld: `vMapUv = (uv + vec2(mod(aPlate, ${PLATE_COLS}.0), ${PLATE_ROWS - 1}.0 - floor(aPlate / ${PLATE_COLS}.0))) / vec2(${PLATE_COLS}.0, ${PLATE_ROWS}.0);`,
    });
    const maxPlates = Object.values(CAPACITY).reduce((s, c) => s + c * 2, 0);
    const plateGeo = new THREE.PlaneGeometry(0.42, 0.11);
    this.plateIdx = new Float32Array(maxPlates);
    plateGeo.setAttribute('aPlate', new THREE.InstancedBufferAttribute(this.plateIdx, 1).setUsage(THREE.DynamicDrawUsage));
    this.plates = new THREE.InstancedMesh(plateGeo, this.plateMat, maxPlates);
    for (let i = 0; i < maxPlates; i++) this.plates.setMatrixAt(i, ZERO);
    this.plates.frustumCulled = false;
    this.plates.receiveShadow = true;
    this.plates.count = 0;
    setDynamic(this.plates);
    this.group.add(this.plates);
    this.plateSlots = new Array(maxPlates).fill(null);
    const wheel = buildWheel();
    // caucho: gris muy oscuro (no negro puro), mate con leve brillo en el flanco
    this.tireMat = lib.standard({ color: 0x1e1e20, roughness: 0.86, metalness: 0 }, { key: 'tire' });
    // llanta: colores de vértice (cara pulida, barril oscuro, disco) × color por auto (instancia)
    this.rimMat = lib.standard({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.85 }, { key: 'rim' });
    this.caliperMat = lib.standard({ color: 0xffffff, roughness: 0.45, metalness: 0.2 }, { key: 'caliper' });
    const maxWheels = Object.values(CAPACITY).reduce((s, c) => s + c * 4, 0);
    this.tires = new THREE.InstancedMesh(wheel.tire, this.tireMat, maxWheels);
    this.rims = new THREE.InstancedMesh(wheel.rim, this.rimMat, maxWheels);
    this.calipers = new THREE.InstancedMesh(wheel.caliper, this.caliperMat, maxWheels);
    this.rims.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxWheels * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    this.calipers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxWheels * 3).fill(0.2), 3).setUsage(THREE.DynamicDrawUsage);
    for (const m of [this.tires, this.rims, this.calipers]) {
      for (let i = 0; i < maxWheels; i++) m.setMatrixAt(i, ZERO);
      setDynamic(m);
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.count = 0;
      this.group.add(m);
    }
    this.wheelSlots = new Array(maxWheels).fill(null);
    // Haces de faros proyectados (aditivos)
    const beamGeo = new THREE.PlaneGeometry(1, 1);
    beamGeo.rotateX(-Math.PI / 2);
    beamGeo.translate(0, 0, 0.5);
    this.beamMat = new THREE.MeshBasicMaterial({ map: makeBeamTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -3 });
    this.beams = new THREE.InstancedMesh(beamGeo, this.beamMat, 80);
    this.beams.frustumCulled = false;
    this.beams.count = 0;
    this.beams.renderOrder = 4;
    setDynamic(this.beams);
    this.group.add(this.beams);
    // Neón inferior
    const neonGeo = new THREE.PlaneGeometry(1, 1);
    neonGeo.rotateX(-Math.PI / 2);
    this.neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, map: makeBeamTexture() });
    this.neons = new THREE.InstancedMesh(neonGeo, this.neonMat, 40);
    this.neons.frustumCulled = false;
    this.neons.count = 0;
    setDynamic(this.neons);
    this.group.add(this.neons);
    // Faros reales del vehículo del jugador
    this.spots = [0, 1].map(() => {
      const s = new THREE.SpotLight(0xfff1dc, 0, 55, 0.42, 0.55, 1.6);
      s.castShadow = false;
      game.engine.scene.add(s);
      game.engine.scene.add(s.target);
      return s;
    });
  }

  /** Mapa de entorno de todos los materiales de vehículos (sonda de reflejos, o null = cielo). */
  setEnvMap(tex) {
    this.envMap = tex;
    const mats = [this.chromeMat, this.tireMat, this.rimMat, this.caliperMat, this.trimMat, this.glassMat, this.plateMat];
    for (const m of Object.values(this.models)) {
      for (const p of Object.values(m.parts)) mats.push(p.material);
    }
    for (const mat of new Set(mats)) {
      if (!mat || !mat.isMeshStandardMaterial) continue;
      mat.envMap = tex;
      mat.envMapIntensity = tex ? 1.0 : 1.0;
      mat.needsUpdate = true;
    }
  }

  model(id) {
    if (this.models[id]) return this.models[id];
    const spec = MODELS[id];
    const geo = spec.bike ? buildBike(spec) : buildCar(spec);
    const cap = CAPACITY[id] || 10;
    const lib = this.game.lib;
    const paintMat = lib.physical({ color: 0xffffff, roughness: 0.3, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.035 }, {
      key: 'vpaint_' + id,
      uniforms: {
        uDims: { value: new THREE.Vector4(spec.L, spec.W, spec.H, spec.clear) },
        uSeams: { value: new THREE.Vector4(...(spec.doors || [99, 99, 99]).concat([99, 99, 99, 99]).slice(0, 4)) },
        uLivery: { value: spec.livery === 'police' ? 1 : 0 },
        uHood: { value: new THREE.Vector4(...(geo.hood || [99, -99, 0, 0])) },
      },
      lamps: true,
      vertexHead: PAINT_HEAD,
      vertexBegin: PAINT_BEGIN + AO_BEGIN,
      fragHead: PAINT_FHEAD,
      fragColor: PAINT_FRAG,
      fragRoughness: PAINT_ROUGH,
      fragMetalness: PAINT_METAL,
      fragNormal: PAINT_FLAKES,
      fragPostLights: LAMPS_POST + AO_POST,
    });
    const dmgAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const paintAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const parts = {};
    const mk = (name, g, mat, cast = true) => {
      if (!g) return;
      if (name === 'paint' || name === 'trim' || name === 'glass') g.setAttribute('aDamage', dmgAttr);
      if (name === 'paint' || name === 'trim') g.setAttribute('aPaint', paintAttr);
      const mesh = new THREE.InstancedMesh(g, mat, cap);
      mesh.frustumCulled = false;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      mesh.count = 0;
      for (let i = 0; i < cap; i++) mesh.setMatrixAt(i, ZERO);
      if (name === 'paint' || name === 'head' || name === 'tail' || name === 'extra' || name === 'barR' || name === 'barB' || name === 'blinkL' || name === 'blinkR') mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
      setDynamic(mesh);
      this.group.add(mesh);
      parts[name] = mesh;
    };
    // Trim y vidrio comparten el desplazamiento de abolladuras
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0.2 });
    lib.register(trimMat, { key: 'vtrim_' + id, lamps: true, uniforms: { uDims: paintMat.userData.patch.uniforms.uDims }, vertexHead: PAINT_HEAD, vertexBegin: PAINT_BEGIN + AO_BEGIN, fragHead: AO_FHEAD + CAR_LAMPS, fragPostLights: LAMPS_POST + AO_POST });
    // depthWrite: la AO en espacio de pantalla necesita ver el vidrio (si no, el piso bajo el auto queda sin oclusión)
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x141b20, roughness: 0.02, metalness: 0, transparent: true, depthWrite: true, premultipliedAlpha: true });
    lib.register(glassMat, {
      key: 'vglass_' + id,
      lamps: true,
      uniforms: { uDims: paintMat.userData.patch.uniforms.uDims, uGlassAlpha: { value: spec.livery === 'police' ? 0.42 : 0.3 } },
      vertexHead: GLASS_VHEAD, vertexBegin: PAINT_BEGIN, fragHead: GLASS_FHEAD, fragPostLights: LAMPS_POST, fragOutput: GLASS_OUT,
    });
    mk('paint', geo.paint, paintMat);
    mk('trim', geo.trim, trimMat);
    mk('glass', geo.glass, glassMat, false);
    if (parts.glass) parts.glass.renderOrder = 2;
    mk('chrome', geo.chrome, this.chromeMat, false);
    mk('head', geo.head, this.headMat, false);
    mk('tail', geo.tail, this.tailMat, false);
    mk('blinkL', geo.blinkL, this.blinkMat, false);
    mk('blinkR', geo.blinkR, this.blinkMat, false);
    if (spec.lightbar && geo.extra) {
      // dividir barra en rojo (izq) y azul (der)
      const pos = geo.extra.attributes.position;
      const left = [], right = [];
      for (let i = 0; i < pos.count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
        const tri = [];
        for (let k = 0; k < 3; k++) tri.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
        (cx > 0 ? left : right).push(...tri);
      }
      const gL = new THREE.BufferGeometry();
      gL.setAttribute('position', new THREE.Float32BufferAttribute(left, 3));
      gL.computeVertexNormals();
      const gR = new THREE.BufferGeometry();
      gR.setAttribute('position', new THREE.Float32BufferAttribute(right, 3));
      gR.computeVertexNormals();
      mk('barR', gL, this.extraMat, false);
      mk('barB', gR, this.extraMat, false);
    } else mk('extra', geo.extra, this.extraMat, false);
    const m = { id, spec, geo, cap, parts, dmgAttr, paintAttr, free: Array.from({ length: cap }, (_, i) => cap - 1 - i), paintMat };
    this.models[id] = m;
    if (this.envMap) {
      for (const p of Object.values(parts)) {
        if (p.material.isMeshStandardMaterial) {
          p.material.envMap = this.envMap;
          p.material.needsUpdate = true;
        }
      }
    }
    return m;
  }

  alloc(v) {
    const m = this.model(v.modelId);
    if (!m.free.length) return false;
    v.slot = m.free.pop();
    v.render = m;
    for (const p of Object.values(m.parts)) p.count = Math.max(p.count, v.slot + 1);
    v.wheelSlots = [];
    for (let k = 0; k < m.geo.wheels.length; k++) {
      const ws = this.wheelSlots.indexOf(null);
      if (ws < 0) break;
      this.wheelSlots[ws] = v;
      v.wheelSlots.push(ws);
      this.tires.count = Math.max(this.tires.count, ws + 1);
      this.rims.count = Math.max(this.rims.count, ws + 1);
      this.calipers.count = Math.max(this.calipers.count, ws + 1);
      this.rims.setColorAt(ws, _c.set(v.rimColor));
      this.calipers.setColorAt(ws, _c.set(v.caliperColor));
    }
    this.rims.instanceColor.needsUpdate = true;
    this.calipers.instanceColor.needsUpdate = true;
    v.plateSlots = [];
    for (let k = 0; k < (m.geo.plates || []).length; k++) {
      const ps = this.plateSlots.indexOf(null);
      if (ps < 0) break;
      this.plateSlots[ps] = v;
      v.plateSlots.push(ps);
      this.plateIdx[ps] = v.plateNo;
      this.plates.count = Math.max(this.plates.count, ps + 1);
    }
    this.plates.geometry.attributes.aPlate.needsUpdate = true;
    this.setColor(v, v.color);
    return true;
  }

  release(v) {
    const m = v.render;
    if (!m) return;
    for (const p of Object.values(m.parts)) {
      p.setMatrixAt(v.slot, ZERO);
      p.instanceMatrix.needsUpdate = true;
    }
    m.free.push(v.slot);
    for (const ws of v.wheelSlots) {
      this.tires.setMatrixAt(ws, ZERO);
      this.rims.setMatrixAt(ws, ZERO);
      this.calipers.setMatrixAt(ws, ZERO);
      this.wheelSlots[ws] = null;
    }
    this.tires.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
    this.calipers.instanceMatrix.needsUpdate = true;
    for (const ps of v.plateSlots || []) {
      this.plates.setMatrixAt(ps, ZERO);
      this.plateSlots[ps] = null;
    }
    this.plates.instanceMatrix.needsUpdate = true;
    v.render = null;
  }

  setColor(v, hex) {
    const p = v.render && v.render.parts.paint;
    if (!p) return;
    const c = new THREE.Color(hex);
    if (v.burnt) c.setRGB(0.06, 0.055, 0.05);
    p.setColorAt(v.slot, c);
    p.instanceColor.needsUpdate = true;
    // tipo de pintura: metalizada con escamas o sólida; quemada = mate
    const metal = !v.burnt && (v.metallic ?? METALLIC.has(hex)) ? 1 : 0;
    v.render.paintAttr.setXYZ(v.slot, metal, metal ? 0.55 : 0, v.burnt ? 0.6 : v.dirt);
    v.render.paintAttr.needsUpdate = true;
  }

  sync(list, cam, nightK) {
    let beamN = 0, neonN = 0;
    const lightsNeeded = nightK > 0.35 || U.uWet.value > 0.5;
    for (const v of list) {
      if (!v.render) continue;
      const m = v.render;
      const visible = !v.sunk;
      // matriz base con cabeceo/rolido
      _e.set(v.pitch, v.yaw, v.roll, 'YXZ');
      _q.setFromEuler(_e);
      _p.set(v.pos.x, v.pos.y + v.bob, v.pos.z);
      _m.compose(_p, _q, _s.set(1, 1, 1));
      for (const [name, mesh] of Object.entries(m.parts)) {
        if (!visible || (name === 'glass' && v.glassBroken)) mesh.setMatrixAt(v.slot, ZERO);
        else mesh.setMatrixAt(v.slot, _m);
        mesh.instanceMatrix.needsUpdate = true;
      }
      // luces
      const on = v.engineOn && !v.destroyed;
      const alarm = v.alarmT > 0 && !v.destroyed && Math.floor(v.alarmT * 4.4) % 2 === 0;
      const head = m.parts.head;
      if (head) {
        const hk = alarm ? 6 : on ? (lightsNeeded ? 6 : 0.9) : 0.12;
        head.setColorAt(v.slot, _v.set(hk, hk * 0.95, hk * 0.86));
        head.instanceColor.needsUpdate = true;
      }
      const tail = m.parts.tail;
      if (tail) {
        const tk = alarm ? 4 : v.braking && on ? 5 : on ? (lightsNeeded ? 1.6 : 0.5) : 0.15;
        tail.setColorAt(v.slot, _v.set(tk, tk * 0.06, tk * 0.05));
        tail.instanceColor.needsUpdate = true;
      }
      // intermitentes: giro anunciado por la IA o balizas
      if (m.parts.blinkL) {
        const ph = Math.floor(performance.now() / 385) % 2 === 0;
        const lOn = !v.destroyed && ph && (v.blink === 'left' || v.hazard || (alarm && v.alarmT > 0));
        const rOn = !v.destroyed && ph && (v.blink === 'right' || v.hazard || (alarm && v.alarmT > 0));
        const dim = 0.14;
        m.parts.blinkL.setColorAt(v.slot, _v.set(1, 0.5, 0.06).multiplyScalar(lOn ? 5.5 : dim));
        m.parts.blinkR.setColorAt(v.slot, _v.set(1, 0.5, 0.06).multiplyScalar(rOn ? 5.5 : dim));
        m.parts.blinkL.instanceColor.needsUpdate = true;
        m.parts.blinkR.instanceColor.needsUpdate = true;
      }
      // patentes
      const PL = m.geo.plates || [];
      for (let k = 0; k < (v.plateSlots || []).length; k++) {
        const ps = v.plateSlots[k];
        if (!visible) {
          this.plates.setMatrixAt(ps, ZERO);
          continue;
        }
        const pl = PL[k];
        _q2.setFromAxisAngle(_v.set(0, 1, 0), pl.front ? 0 : Math.PI);
        _m2.compose(_p.set(pl.x, pl.y, pl.z), _q2, _s.set(pl.small ? 0.55 : 1, pl.small ? 0.8 : 1, 1)).premultiply(_m);
        this.plates.setMatrixAt(ps, _m2);
      }
      if (m.parts.extra) {
        const ek = v.modelId === 'taxi' ? (on ? (lightsNeeded ? 3.2 : 1.2) : 0.3) : 1;
        m.parts.extra.setColorAt(v.slot, _v.set(ek, ek * 0.78, ek * 0.25));
        m.parts.extra.instanceColor.needsUpdate = true;
      }
      if (m.parts.barR) {
        const t = performance.now() / 1000;
        const ph = Math.floor(t * 6) % 2;
        const s = v.siren && !v.destroyed;
        const r = s ? (ph ? 7 : 0.4) : 0.35, b = s ? (ph ? 0.4 : 7) : 0.35;
        m.parts.barR.setColorAt(v.slot, _v.set(r, r * 0.05, r * 0.05));
        m.parts.barB.setColorAt(v.slot, _v.set(b * 0.08, b * 0.25, b));
        m.parts.barR.instanceColor.needsUpdate = true;
        m.parts.barB.instanceColor.needsUpdate = true;
      }
      // daño (abolladuras)
      m.dmgAttr.setXYZW(v.slot, v.dents.f, v.dents.r, v.dents.l, v.dents.rt);
      m.dmgAttr.needsUpdate = true;
      // ruedas
      const W = m.geo.wheels;
      for (let k = 0; k < v.wheelSlots.length; k++) {
        const w = W[k];
        const ws = v.wheelSlots[k];
        if (!visible) {
          this.tires.setMatrixAt(ws, ZERO);
          this.rims.setMatrixAt(ws, ZERO);
          this.calipers.setMatrixAt(ws, ZERO);
          continue;
        }
        const steer = w.front ? -v.steerAngle : 0;
        // las ruedas derechas se giran media vuelta para que su cara exterior mire hacia afuera
        const right = w.side < 0;
        const yawW = steer + (right ? Math.PI : 0);
        const yOff = w.y + (v.wheelDrop || 0);
        _p.set(w.x, yOff, w.z);
        _s.set(w.w, w.r, w.r);
        _e.set(right ? -v.wheelSpin : v.wheelSpin, yawW, 0, 'YXZ');
        _q2.setFromEuler(_e);
        _m2.compose(_p, _q2, _s).premultiply(_m);
        this.tires.setMatrixAt(ws, _m2);
        this.rims.setMatrixAt(ws, _m2);
        _e.set(0, yawW, 0, 'YXZ');
        _q2.setFromEuler(_e);
        _m2.compose(_p, _q2, _s).premultiply(_m);
        this.calipers.setMatrixAt(ws, _m2);
      }
      // haz de faros sobre el suelo
      if (on && lightsNeeded && !m.spec.bike && beamN < 80) {
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        _q2.setFromAxisAngle(_v.set(0, 1, 0), v.yaw);
        _m2.compose(_p.set(v.pos.x + fx * (m.spec.L / 2), v.groundY + 0.04, v.pos.z + fz * (m.spec.L / 2)), _q2, _s.set(m.spec.W * 2.1, 1, 14));
        this.beams.setMatrixAt(beamN++, _m2);
      }
      if (v.neon && visible && neonN < 40) {
        _q2.setFromAxisAngle(_v.set(0, 1, 0), v.yaw);
        _m2.compose(_p.set(v.pos.x, v.groundY + 0.05, v.pos.z), _q2, _s.set(m.spec.W * 1.5, 1, m.spec.L * 1.15));
        this.neons.setMatrixAt(neonN, _m2);
        this.neons.setColorAt(neonN, new THREE.Color(v.neon).multiplyScalar(1.5 + nightK * 2.5));
        neonN++;
      }
    }
    this.tires.instanceMatrix.needsUpdate = true;
    this.rims.instanceMatrix.needsUpdate = true;
    this.calipers.instanceMatrix.needsUpdate = true;
    this.plates.instanceMatrix.needsUpdate = true;
    this.beams.count = beamN;
    this.beams.instanceMatrix.needsUpdate = true;
    this.beamMat.opacity = 0.32 * Math.max(nightK, U.uWet.value * 0.5);
    this.neons.count = neonN;
    if (neonN) {
      this.neons.instanceMatrix.needsUpdate = true;
      this.neons.instanceColor.needsUpdate = true;
    }
  }

  /** Faros reales para el vehículo del jugador. */
  playerLights(v, nightK) {
    const on = v && v.engineOn && !v.destroyed && !v.render?.spec.bike && (nightK > 0.3 || U.uWet.value > 0.5);
    for (let i = 0; i < 2; i++) {
      const s = this.spots[i];
      if (!on) {
        s.intensity = 0;
        continue;
      }
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
      const side = i ? 1 : -1;
      const L = v.render.spec.L, W = v.render.spec.W;
      s.position.set(v.pos.x + fx * L * 0.48 + lx * side * W * 0.33, v.pos.y + 0.75, v.pos.z + fz * L * 0.48 + lz * side * W * 0.33);
      s.target.position.set(s.position.x + fx * 20, v.pos.y - 1.5, s.position.z + fz * 20);
      s.target.updateMatrixWorld();
      s.intensity = 260;
    }
  }
}

// ------------------------------------------------------------------ vehículo
let VID = 1;
export class Vehicle {
  constructor(mgr, modelId, x, z, yaw, opts = {}) {
    this.mgr = mgr;
    this.id = VID++;
    this.modelId = modelId;
    this.spec = MODELS[modelId];
    this.color = opts.color ?? this.spec.fixedColor ?? PAINTS[(Math.random() * PAINTS.length) | 0];
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.vel = new THREE.Vector3();
    this.yawRate = 0;
    this.spin = 0;
    this.vy = 0;
    this.onGround = true;
    this.groundY = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bob = 0;
    this.pitchV = 0;
    this.rollV = 0;
    this.health = this.spec.hp * (opts.armor ? 1.5 : 1);
    this.maxHealth = this.health;
    this.dents = { f: 0, r: 0, l: 0, rt: 0 };
    this.onFire = false;
    this.fireT = 0;
    this.destroyed = false;
    this.burnt = false;
    this.driver = opts.driver || null;
    this.ai = null;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.mode = opts.mode || 'physics';
    this.engineOn = opts.engineOn ?? !!this.driver;
    this.siren = false;
    this.horn = false;
    this.station = opts.station ?? (Math.random() * 5) | 0;
    this.steerAngle = 0;
    this.wheelSpin = 0;
    this.speed = 0;
    this.rpm = 0;
    this.gear = 1;
    this.braking = false;
    this.nitroCharge = 1;
    this.nitroOn = false;
    this.upgrades = opts.upgrades || { engine: 0, brakes: 0, armor: 0, turbo: 0, nitro: 0 };
    this.neon = opts.neon || null;
    const st = this.spec.style;
    const sporty = st === 'muscle' || st === 'sports' || st === 'super';
    const rims = modelId === 'patrulla' ? RIMS.police : sporty ? RIMS.sport : st === 'van' || st === 'pickup' ? RIMS.work : RIMS.normal;
    this.rimColor = opts.rimColor ?? rims[(Math.random() * rims.length) | 0];
    const cals = sporty ? CALIPERS.sport : CALIPERS.other;
    this.caliperColor = opts.caliperColor ?? cals[(Math.random() * cals.length) | 0];
    // nivel de suciedad: la mayoría limpios o con polvo leve, algunos muy sucios (utilitarios más)
    const r = Math.random();
    this.dirt = opts.dirt ?? (st === 'van' || st === 'pickup' ? 0.35 + r * 0.55 : r < 0.55 ? r * 0.25 : r < 0.9 ? 0.2 + r * 0.3 : 0.6 + r * 0.35);
    this.persistent = !!opts.persistent;
    this.plateNo = opts.plateNo ?? (Math.random() * PLATE_COLS * PLATE_ROWS) | 0;
    this.blink = null;
    this.hazard = false;
    this.parked = !!opts.parked;
    this.isPolice = modelId === 'patrulla';
    this.sunk = false;
    this.inWater = false;
    this.glassBroken = false;
    this.lastHitBy = null;
    this.airTime = 0;
    this.slip = 0;
    this.age = 0;
    this.prevGround = 0;
    this.wheelDrop = 0;
    this.stuckT = 0;
    const g = mgr.renderer.model(modelId).geo;
    this.geoInfo = g;
    this.length = this.spec.L;
    this.width = this.spec.W;
    this.height = g.height;
    this.radius = this.spec.bike ? 0.4 : this.spec.W / 2;
    const off = this.spec.bike ? [0.55, -0.55] : [this.spec.L / 2 - this.spec.W / 2, 0, -(this.spec.L / 2 - this.spec.W / 2)];
    this.circleOffsets = off;
    this.mass = this.spec.mass;
    this.pos.y = mgr.game.collision.surfaceBelow(x, z, 30);
    this.groundY = this.pos.y;
    this.prevGround = this.pos.y;
  }

  get forward() {
    return _v.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  circles() {
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    return this.circleOffsets.map((o) => ({ x: this.pos.x + fx * o, z: this.pos.z + fz * o, r: this.radius }));
  }

  /** Daño con zona aproximada según el punto de impacto. */
  damage(amount, from = null, worldPoint = null) {
    if (this.destroyed) return;
    const armor = 1 - this.upgrades.armor * 0.15;
    amount *= armor;
    this.health -= amount;
    if (worldPoint) {
      const dx = worldPoint.x - this.pos.x, dz = worldPoint.z - this.pos.z;
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const along = dx * fx + dz * fz, lat = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
      const k = Math.min(1, amount / 320);
      if (Math.abs(along) > Math.abs(lat) * 1.2) {
        if (along > 0) this.dents.f = Math.min(1, this.dents.f + k);
        else this.dents.r = Math.min(1, this.dents.r + k);
      } else if (lat > 0) this.dents.l = Math.min(1, this.dents.l + k);
      else this.dents.rt = Math.min(1, this.dents.rt + k);
    }
    if (from) this.lastHitBy = from;
    if (this.health < this.maxHealth * 0.25 && !this.glassBroken && amount > 40) {
      this.glassBroken = true;
      this.mgr.game.audio.play('glass', { pos: this.pos });
    }
    if (this.health <= 0 && !this.onFire) {
      this.onFire = true;
      this.fireT = 0;
      this.mgr.game.effects.burn(() => this.pos, 6, this.spec.bike ? 0.5 : 1);
    }
  }

  explode() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.burnt = true;
    this.engineOn = false;
    this.health = 0;
    this.mgr.renderer.setColor(this, 0);
    this.glassBroken = true;
    const game = this.mgr.game;
    game.effects.explosion({ x: this.pos.x, y: this.pos.y + 0.8, z: this.pos.z }, 1);
    game.audio.play('explosion', { pos: this.pos });
    game.camRig.shake(Math.max(0, 1 - this.pos.distanceTo(game.engine.camera.position) / 60));
    this.vel.y = 0;
    this.vy = 6;
    this.onGround = false;
    this.yawRate += rand.range(-2, 2);
    game.events.emit('explosion', { pos: this.pos.clone(), radius: 9, damage: 160, source: this.lastHitBy, vehicle: this });
  }

  /** Física arcade (modo 'physics'). */
  physics(dt) {
    const S = this.spec;
    const c = this.controls;
    const up = this.upgrades;
    const game = this.mgr.game;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * lx + this.vel.z * lz;
    const drivable = this.engineOn && !this.destroyed && !this.inWater && !this.fallen;
    const top = S.top * (1 + up.engine * 0.07);
    const accel = S.accel * (1 + up.engine * 0.12 + up.turbo * 0.1);
    const brakeF = S.brake * (1 + up.brakes * 0.15);
    // superficie
    const road = isRoad(this.pos.x, this.pos.z);
    const sand = !road && this.groundY <= 0.05 && (this.pos.x > 494 || this.pos.x > 760);
    let surf = road ? 1 : sand ? 0.6 : 0.88;
    surf *= 1 - U.uWet.value * 0.22;
    this.braking = false;
    if (this.onGround) {
      const thr = drivable ? c.throttle : 0;
      const brk = drivable ? c.brake : 0;
      if (thr > 0.01) {
        if (vf > -0.5) {
          const curve = Math.max(0, 1 - Math.pow(Math.max(0, vf) / top, 2.2));
          vf += thr * accel * curve * dt * (sand ? 0.7 : 1);
        } else {
          vf = moveToward(vf, 0, brakeF * thr * dt);
          this.braking = true;
        }
      }
      if (brk > 0.01) {
        if (vf > 0.5) {
          vf = moveToward(vf, 0, brakeF * brk * dt);
          this.braking = true;
        } else vf = Math.max(-S.top * 0.28, vf - brk * accel * 0.55 * dt);
      }
      // nitro
      this.nitroOn = false;
      if (drivable && c.nitro && up.nitro > 0 && this.nitroCharge > 0.02 && thr > 0.1) {
        vf += accel * 0.9 * dt;
        this.nitroCharge = Math.max(0, this.nitroCharge - dt * 0.22);
        this.nitroOn = true;
      } else this.nitroCharge = Math.min(1, this.nitroCharge + dt * 0.05 * (up.nitro || 0));
      // resistencia
      const roll = (thr < 0.01 && brk < 0.01 ? 2.2 : 0.6) + (sand ? 3 : 0);
      vf = moveToward(vf, 0, roll * dt);
      vf -= Math.sign(vf) * 0.0004 * vf * vf * dt; // arrastre aerodinámico
      if (c.handbrake && drivable) vf = moveToward(vf, 0, 6.5 * dt);
      if (!drivable && !this.driver) vf = moveToward(vf, 0, 4 * dt);
      if (this.fallen) vf = moveToward(vf, 0, 7 * dt); // moto arrastrándose de costado
      // agarre lateral con saturación
      let grip = this.fallen ? 2.5 : S.grip * surf * (c.handbrake ? 0.22 : 1);
      const slipLimit = 3.5 + S.grip * 0.25;
      if (Math.abs(vl) > slipLimit) grip *= clamp(1 - (Math.abs(vl) - slipLimit) * 0.07, 0.35, 1);
      vl *= Math.exp(-grip * dt);
      this.slip = Math.abs(vl);
      // dirección (modelo bicicleta); steer positivo = derecha
      const maxSteer = S.steer * (1 / (1 + Math.abs(vf) / 24));
      this.steerAngle = damp(this.steerAngle, (drivable || this.driver ? c.steer : 0) * maxSteer, 9, dt);
      let target = (vf / S.wb) * Math.tan(-this.steerAngle);
      if (c.handbrake) target *= 1.45;
      this.yawRate = damp(this.yawRate, target, S.bike ? 7 : 9, dt);
    } else {
      this.yawRate *= Math.exp(-0.4 * dt);
      this.slip = 0;
    }
    this.spin *= Math.exp(-3.5 * dt);
    this.yaw = wrapAngle(this.yaw + (this.yawRate + this.spin) * dt);
    this.vel.x = fx * vf + lx * vl;
    this.vel.z = fz * vf + lz * vl;
    this.speed = vf;
  }

  /**
   * Integración, suelo y colisiones estáticas. Con kinematic=true el controlador de tránsito ya
   * ubicó el auto en x/z: sólo se resuelven el suelo, la pose y el motor (con el dt real).
   */
  integrate(dt, kinematic = false) {
    const game = this.mgr.game;
    const col = game.collision;
    if (!kinematic) {
      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
    }
    // colisiones con el entorno usando 2-3 círculos
    const spd = Math.hypot(this.vel.x, this.vel.z);
    const circles = kinematic ? [] : this.circles();
    let push = null;
    for (let i = 0; i < circles.length; i++) {
      const cc = circles[i];
      const r = col.resolveCircle(cc.x, cc.z, cc.r, this.pos.y + 0.35, this.pos.y + this.height, {
        ignoreBreakable: spd > 3.5,
        onBreakable: (c) => this.mgr.breakProp(c, this),
      });
      if (r.hit) {
        const dx = r.x - cc.x, dz = r.z - cc.z;
        this.pos.x += dx;
        this.pos.z += dz;
        if (!push || r.depth > push.depth) push = { nx: r.nx, nz: r.nz, depth: r.depth, i, cx: cc.x, cz: cc.z, collider: r.collider };
      }
    }
    if (push) {
      const vn = this.vel.x * push.nx + this.vel.z * push.nz;
      if (vn < 0) {
        const impact = -vn;
        this.vel.x -= 1.25 * vn * push.nx;
        this.vel.z -= 1.25 * vn * push.nz;
        this.vel.x *= 0.9;
        this.vel.z *= 0.9;
        // giro por impacto descentrado
        const off = this.circleOffsets[push.i];
        const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
        const cross = off * (fx * push.nz - fz * push.nx);
        this.spin += clamp(cross * impact * 0.12, -3, 3);
        if (impact > 2.5) this.mgr.onImpact(this, impact, { x: push.cx - push.nx * this.radius, y: this.pos.y + 0.6, z: push.cz - push.nz * this.radius }, push.collider);
      }
    }
    // suelo
    const g = col.surfaceBelow(this.pos.x, this.pos.z, this.pos.y + 1.2);
    this.groundY = g;
    const S = this.spec;
    if (this.onGround) {
      if (g < this.pos.y - 0.25) {
        // se terminó el piso (borde de rampa, muelle o puente): despega
        this.onGround = false;
        this.airTime = 0; // conserva vy (velocidad de subida de la rampa)
      } else {
        const climb = (g - this.prevGround) / Math.max(dt, 1e-3);
        const onRamp = game.world.rampHeightAt(this.pos.x, this.pos.z) > 0.02 || Math.abs(this.pos.z + 160) < 11;
        this.vy = onRamp ? clamp(climb, -15, 25) : clamp(climb, -15, 2.2);
        this.pos.y = g;
      }
    }
    if (!this.onGround) {
      this.airTime += dt;
      this.vy -= 21 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= g) {
        const impact = -this.vy;
        this.pos.y = g;
        this.onGround = true;
        if (impact > 7) {
          this.damage((impact - 7) * 14, null, null);
          this.mgr.game.audio.play(impact > 12 ? 'crash_heavy' : 'crash_light', { pos: this.pos, volume: 0.7 });
          if (this.driver === 'player') game.camRig.shake(Math.min(0.6, impact * 0.03));
        }
        this.pitchV += impact * 0.05;
        this.vy = 0;
      }
    }
    this.prevGround = g;
    // agua
    const depth = WATER_LEVEL - g;
    this.inWater = depth > 0.9 && this.pos.y < WATER_LEVEL + 0.2;
    if (this.inWater) {
      this.pos.y = Math.max(g, this.pos.y - dt * 0.8);
      this.vel.multiplyScalar(Math.exp(-dt * 1.6));
      this.engineOn = false;
      if (!this._splashed) {
        this._splashed = true;
        game.audio.play('splash', { pos: this.pos });
        game.effects.emit('splash', { x: this.pos.x, y: WATER_LEVEL, z: this.pos.z }, { count: 24, floor: WATER_LEVEL });
      }
      if (this.pos.y < WATER_LEVEL - 1.6) this.sunk = true;
    }
    // pose visual (cabeceo/rolido con resortes)
    let targetPitch = 0, targetRoll = 0;
    if (this.onGround) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const hF = col.surfaceBelow(this.pos.x + fx * S.wb * 0.5, this.pos.z + fz * S.wb * 0.5, this.pos.y + 1);
      const hR = col.surfaceBelow(this.pos.x - fx * S.wb * 0.5, this.pos.z - fz * S.wb * 0.5, this.pos.y + 1);
      targetPitch = -Math.atan2(hF - hR, S.wb);
      const acc = (this.speed - (this._lastSpeed ?? this.speed)) / Math.max(dt, 1e-3);
      targetPitch += clamp(acc * 0.004, -0.06, 0.06);
      targetRoll = clamp(this.yawRate * this.speed * (S.bike ? -0.045 : 0.006), S.bike ? -0.75 : -0.08, S.bike ? 0.75 : 0.08);
    } else {
      targetPitch = clamp(-this.vy * 0.025, -0.4, 0.4);
    }
    this._lastSpeed = this.speed;
    const k = this.onGround ? 10 : 2;
    this.pitchV += (targetPitch - this.pitch) * k * dt * 6 - this.pitchV * 8 * dt;
    this.rollV += (targetRoll - this.roll) * k * dt * 6 - this.rollV * 8 * dt;
    this.pitch += this.pitchV * dt;
    this.roll += this.rollV * dt;
    if (this.fallen) this.roll = damp(this.roll, 1.35, 6, dt);
    this.bob = this.onGround ? -Math.abs(this.pitchV) * 0.02 : 0;
    // ruedas y motor
    this.wheelSpin += (this.speed / this.spec.wr) * dt;
    const absV = Math.abs(this.speed);
    const ratio = absV / this.spec.top;
    const gearF = ratio * 5.5;
    this.gear = this.speed < -0.5 ? -1 : Math.min(6, Math.floor(gearF) + 1);
    const inGear = gearF - Math.floor(gearF);
    const targetRpm = this.engineOn ? (absV < 0.5 ? 0.12 + this.controls.throttle * 0.5 : 0.25 + inGear * 0.65 + this.controls.throttle * 0.1) : 0;
    this.rpm = damp(this.rpm, targetRpm, 8, dt);
  }
}

// ------------------------------------------------------------------ gestor
export class VehicleManager {
  constructor(game) {
    this.game = game;
    this.renderer = new VehicleRenderer(game);
    this.list = [];
    this.parkedSpots = game.world.parking.map((p) => ({ ...p, vehicle: null, cooldown: 0 }));
    this.engineVoices = [];
    this.playerEngine = null;
    this.sirens = [];
    this.skidLoop = null;
    this.hornLoop = null;
    this.alarmLoop = null;
    this.brokenProps = new Set();
    this.parkTimer = 0;
  }

  spawn(modelId, x, z, yaw, opts = {}) {
    const v = new Vehicle(this, modelId, x, z, yaw, opts);
    if (!this.renderer.alloc(v)) return null;
    this.list.push(v);
    return v;
  }

  remove(v) {
    if (v.driverHuman && this.game.peds) this.game.peds.releaseDriver(v);
    this.renderer.release(v);
    this.list = this.list.filter((x) => x !== v);
    if (v.engineVoice) {
      v.engineVoice.stop();
      v.engineVoice = null;
    }
    if (v.sirenVoice) {
      v.sirenVoice.stop();
      v.sirenVoice = null;
    }
  }

  nearestEnterable(pos, maxDist = 4) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (v.destroyed || v.sunk || v.onFire) continue;
      const d = Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) - v.length * 0.35;
      if (d < bd && Math.abs(v.pos.y - pos.y) < 2.5) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** Punto de la puerta del conductor (lado izquierdo del auto). */
  doorPoint(v) {
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const side = v.spec.bike ? 0.7 : v.width / 2 + 0.55;
    return new THREE.Vector3(v.pos.x + lx * side + fx * (v.spec.bike ? 0 : 0.35), v.pos.y, v.pos.z + lz * side + fz * (v.spec.bike ? 0 : 0.35));
  }

  /** Transformación del asiento del conductor (para ubicar al humano). */
  seatTransform(v, human, out) {
    const seat = v.geoInfo.seat;
    const hipH = human.height * 0.555;
    _e.set(v.pitch, v.yaw, v.roll, 'YXZ');
    _q.setFromEuler(_e);
    const local = new THREE.Vector3(seat.x, seat.hip - hipH + 0.05, seat.z).applyQuaternion(_q);
    out.position.set(v.pos.x + local.x, v.pos.y + v.bob + local.y, v.pos.z + local.z);
    out.quaternion.copy(_q);
  }

  breakProp(c, v) {
    if (c.disabled) return;
    c.disabled = true;
    this.brokenProps.add(c.group + ':' + c.index);
    const game = this.game;
    game.props.hideInstance(c.group, c.index);
    const spd = Math.hypot(v.vel.x, v.vel.z);
    v.vel.multiplyScalar(c.type === 'lamp' ? 0.88 : 0.95);
    const dir = new THREE.Vector3(v.vel.x, 0, v.vel.z).normalize();
    const p = c.ref;
    const gy = game.world.groundAt(p.x, p.z);
    if (c.type === 'lamp') {
      game.audio.play('crash_light', { pos: v.pos, volume: 0.8 });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7.6, 6), game.props.paintMetal);
      mesh.geometry.translate(0, 3.8, 0);
      mesh.castShadow = true;
      game.effects.topple(mesh, new THREE.Vector3(p.x, gy, p.z), dir, spd);
      for (let i = 0; i < 6; i++) game.effects.emit('spark', { x: p.x, y: gy + 1, z: p.z }, { floor: gy });
    } else if (c.type === 'hydrant') {
      game.audio.play('crash_light', { pos: v.pos, volume: 0.6 });
      game.effects.spray({ x: p.x, y: gy, z: p.z }, 16);
    } else {
      game.audio.play('crash_light', { pos: v.pos, volume: 0.5 });
      for (let i = 0; i < 8; i++) game.effects.emit('debris', { x: p.x, y: gy + 0.5, z: p.z }, { floor: gy, color: 0.4 });
    }
    game.events.emit('propBroken', { type: c.type, pos: new THREE.Vector3(p.x, gy, p.z), vehicle: v });
  }

  onImpact(v, impact, point, collider) {
    const game = this.game;
    // los roces leves casi no dañan; los choques fuertes sí (cuadrático por encima de ~2 m/s)
    const k = Math.max(0, impact - 2);
    const dmg = k * k * 2.2 * (v.driver === 'player' ? (game.vehicleDamageMul ?? 0.7) : 1);
    v.damage(dmg, null, point);
    const near = v.driver === 'player' || v.pos.distanceTo(game.engine.camera.position) < 80;
    if (near) {
      game.audio.play(impact > 11 ? 'crash_heavy' : 'crash_light', { pos: point, volume: Math.min(1, 0.4 + impact * 0.05) });
      for (let i = 0; i < Math.min(14, impact); i++) game.effects.emit('spark', point, { speed: 4 + impact * 0.3, floor: v.groundY });
    }
    if (v.driver === 'player') {
      game.camRig.shake(Math.min(0.75, impact * 0.045));
      game.input.rumble(Math.min(1, impact * 0.06), 0.5, 160);
    }
    if (v.spec.bike && impact > 7.5 && v.driver) this.throwRider(v, impact);
    game.events.emit('vehicleImpact', { vehicle: v, impact, point, collider });
  }

  /** Colisiones entre vehículos (impulso inelástico). */
  _vehicleCollisions() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.sunk) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (b.sunk) continue;
        const dx0 = a.pos.x - b.pos.x, dz0 = a.pos.z - b.pos.z;
        if (dx0 * dx0 + dz0 * dz0 > 81 || Math.abs(a.pos.y - b.pos.y) > 2.2) continue;
        const ca = a.circles(), cb = b.circles();
        let best = null;
        for (const p of ca)
          for (const q of cb) {
            const dx = p.x - q.x, dz = p.z - q.z;
            const d = Math.hypot(dx, dz), rr = p.r + q.r;
            if (d < rr && (!best || rr - d > best.depth)) best = { nx: d > 1e-4 ? dx / d : 1, nz: d > 1e-4 ? dz / d : 0, depth: rr - d, px: (p.x + q.x) / 2, pz: (p.z + q.z) / 2 };
          }
        if (!best) continue;
        const ma = a.mode === 'kinematic' ? a.mass * 3 : a.mass, mb = b.mode === 'kinematic' ? b.mass * 3 : b.mass;
        const ta = mb / (ma + mb), tb = ma / (ma + mb);
        a.pos.x += best.nx * best.depth * ta;
        a.pos.z += best.nz * best.depth * ta;
        b.pos.x -= best.nx * best.depth * tb;
        b.pos.z -= best.nz * best.depth * tb;
        const rvx = a.vel.x - b.vel.x, rvz = a.vel.z - b.vel.z;
        const vn = rvx * best.nx + rvz * best.nz;
        if (vn >= 0) continue;
        const e = 0.25;
        const jimp = (-(1 + e) * vn) / (1 / ma + 1 / mb);
        a.vel.x += (jimp / ma) * best.nx;
        a.vel.z += (jimp / ma) * best.nz;
        b.vel.x -= (jimp / mb) * best.nx;
        b.vel.z -= (jimp / mb) * best.nz;
        const impact = -vn;
        a.spin += clamp((Math.random() - 0.5) * impact * 0.15, -2, 2);
        b.spin += clamp((Math.random() - 0.5) * impact * 0.15, -2, 2);
        const point = { x: best.px, y: (a.pos.y + b.pos.y) / 2 + 0.6, z: best.pz };
        if (impact > 2) {
          const k = Math.max(0, impact - 1.5);
          const base = k * k * 2.4 * 2;
          const pm = this.game.vehicleDamageMul ?? 0.7;
          a.damage(base * (mb / (ma + mb)) * (a.driver === 'player' ? pm : 1), b.driver === 'player' ? 'player' : null, point);
          b.damage(base * (ma / (ma + mb)) * (b.driver === 'player' ? pm : 1), a.driver === 'player' ? 'player' : null, point);
          this.onImpactPair(a, b, impact, point);
        }
      }
    }
  }

  onImpactPair(a, b, impact, point) {
    const game = this.game;
    game.audio.play(impact > 9 ? 'crash_heavy' : 'crash_light', { pos: point, volume: Math.min(1, 0.4 + impact * 0.06) });
    for (let i = 0; i < Math.min(16, impact * 1.5); i++) game.effects.emit('spark', point, { speed: 3 + impact * 0.4 });
    if (a.driver === 'player' || b.driver === 'player') {
      game.camRig.shake(Math.min(0.8, impact * 0.05));
      game.input.rumble(Math.min(1, impact * 0.07), 0.6, 180);
    }
    for (const v of [a, b]) if (v.ai && v.ai.onHit) v.ai.onHit(v === a ? b : a, impact);
    // alarma de autos estacionados
    for (const v of [a, b]) if (!v.driver && v.parked && !v.destroyed && impact > 2.5 && !(v.alarmT > 0) && Math.random() < 0.65) v.alarmT = 14;
    for (const v of [a, b]) if (v.spec.bike && impact > 6 && v.driver) this.throwRider(v, impact);
    game.events.emit('vehicleCollision', { a, b, impact, point });
  }

  /** Choque fuerte en moto: el conductor sale despedido y la moto cae. */
  throwRider(v, impact) {
    v.fallen = true;
    if (v.driver === 'player') this.game.throwPlayerFromVehicle?.(v, impact);
    else if (v.driverHuman && this.game.peds?.throwDriver) this.game.peds.throwDriver(v, impact);
  }

  /** Atropellos y empuje de personas. */
  collideHumans(humans) {
    for (const v of this.list) {
      if (v.sunk) continue;
      const spd = Math.hypot(v.vel.x, v.vel.z);
      const cs = v.circles();
      for (const h of humans) {
        if (!h || h.dead && !h.ragdoll || h.vehicle) continue;
        const hp = h.pos;
        if (Math.abs(hp.y - v.pos.y) > 2) continue;
        if (Math.abs(hp.x - v.pos.x) > v.length || Math.abs(hp.z - v.pos.z) > v.length) continue;
        for (const c of cs) {
          const dx = hp.x - c.x, dz = hp.z - c.z;
          const d = Math.hypot(dx, dz), rr = c.r + 0.35;
          if (d >= rr) continue;
          const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
          const rel = v.vel.x * nx + v.vel.z * nz;
          if (spd > 3.2 && rel > 2) {
            if (h.onVehicleHit) h.onVehicleHit(v, spd, new THREE.Vector3(v.vel.x, 0, v.vel.z));
            v.vel.multiplyScalar(0.93);
            this.game.audio.play('impact_body', { pos: hp, volume: Math.min(1, spd * 0.06) });
            this.game.events.emit('runOver', { vehicle: v, human: h, speed: spd });
          } else {
            hp.x += nx * (rr - d);
            hp.z += nz * (rr - d);
          }
          break;
        }
      }
    }
  }

  /** Autos estacionados alrededor del jugador. */
  _populateParked(dt) {
    this.parkTimer -= dt;
    if (this.parkTimer > 0) return;
    this.parkTimer = 1.2;
    const p = this.game.player.vehicle ? this.game.player.vehicle.pos : this.game.player.pos;
    const density = this.game.engine.q.density;
    for (const s of this.parkedSpots) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (s.vehicle) {
        if (d > 260 && s.vehicle.parked && !s.vehicle.persistent && s.vehicle.driver == null) {
          this.remove(s.vehicle);
          s.vehicle = null;
        } else if (!s.vehicle.parked || !this.list.includes(s.vehicle)) {
          s.vehicle = null;
          s.cooldown = 60;
        }
        continue;
      }
      if (s.cooldown > 0) {
        s.cooldown -= 1.2;
        continue;
      }
      if (d < 170 && d > 25 && Math.random() < 0.55 * density) {
        const pool = s.poi === 'policia' ? ['patrulla'] : s.poi === 'concesionaria' ? ['deportivo', 'muscle', 'suv', 'superauto', 'sedan'] : ['sedan', 'compacto', 'suv', 'pickup', 'compacto', 'sedan', 'muscle', 'moto'];
        const id = pool[(Math.random() * pool.length) | 0];
        const v = this.spawn(id, s.x, s.z, s.yaw + (Math.random() < 0.5 ? Math.PI : 0), { parked: true, engineOn: false });
        if (v) s.vehicle = v;
      } else s.cooldown = 8;
    }
  }

  _audio(dt) {
    const game = this.game;
    const audio = game.audio;
    const pv = game.player.vehicle;
    const cam = game.engine.camera.position;
    // motor del jugador
    if (pv && pv.engineOn) {
      if (!this.playerEngine || this.playerEngine.vehicle !== pv) {
        if (this.playerEngine) this.playerEngine.h.stop();
        this.playerEngine = { h: audio.createEngine(pv.spec.engine), vehicle: pv };
      }
      this.playerEngine.h.update({ rpm: pv.rpm, throttle: pv.controls.throttle, pos: pv.pos, volume: 1 });
    } else if (this.playerEngine) {
      this.playerEngine.h.stop();
      this.playerEngine = null;
    }
    // derrape
    const slipping = pv && pv.onGround && (pv.slip > 3.2 || (pv.controls.handbrake && Math.abs(pv.speed) > 6));
    if (slipping) {
      if (!this.skidLoop) this.skidLoop = audio.createLoop('skid');
      this.skidLoop.update({ pos: pv.pos, volume: Math.min(1, (pv.slip - 2) / 8 + 0.3) });
    } else if (this.skidLoop) {
      this.skidLoop.stop();
      this.skidLoop = null;
    }
    // bocina
    if (pv && pv.horn) {
      if (!this.hornLoop) this.hornLoop = audio.createLoop('horn');
      this.hornLoop.update({ pos: pv.pos, volume: 0.9 });
    } else if (this.hornLoop) {
      this.hornLoop.stop();
      this.hornLoop = null;
    }
    // alarma más cercana (bocina intermitente)
    let alarmV = null, ad = 70;
    for (const v of this.list) {
      if (!(v.alarmT > 0) || v.destroyed || v === pv) continue;
      const d = v.pos.distanceTo(cam);
      if (d < ad) {
        ad = d;
        alarmV = v;
      }
    }
    if (alarmV) {
      if (!this.alarmLoop) this.alarmLoop = audio.createLoop('horn');
      this.alarmLoop.update({ pos: alarmV.pos, volume: Math.floor(alarmV.alarmT * 4.4) % 2 === 0 ? 0.85 : 0 });
    } else if (this.alarmLoop) {
      this.alarmLoop.stop();
      this.alarmLoop = null;
    }
    // motores cercanos (hasta 3 voces)
    const near = this.list.filter((v) => v !== pv && v.engineOn && !v.destroyed && v.pos.distanceTo(cam) < 45).sort((a, b) => a.pos.distanceTo(cam) - b.pos.distanceTo(cam)).slice(0, 3);
    for (const v of this.list) {
      if (v.engineVoice && !near.includes(v)) {
        v.engineVoice.stop();
        v.engineVoice = null;
      }
    }
    for (const v of near) {
      if (!v.engineVoice) v.engineVoice = audio.createEngine(v.spec.engine);
      v.engineVoice.update({ rpm: v.rpm, throttle: Math.max(0.15, v.controls.throttle), pos: v.pos, volume: 0.45 });
    }
    // sirenas (hasta 3)
    const sir = this.list.filter((v) => v.siren && !v.destroyed).sort((a, b) => a.pos.distanceTo(cam) - b.pos.distanceTo(cam)).slice(0, 3);
    for (const v of this.list) {
      if (v.sirenVoice && !sir.includes(v)) {
        v.sirenVoice.stop();
        v.sirenVoice = null;
      }
    }
    for (const v of sir) {
      if (!v.sirenVoice) v.sirenVoice = audio.createSiren();
      v.sirenVoice.update({ pos: v.pos, mode: v.sirenMode || 'wail' });
    }
  }

  update(dt) {
    const game = this.game;
    this._populateParked(dt);
    for (const v of this.list) {
      v.age += dt;
      if (v.alarmT > 0) v.alarmT = Math.max(0, v.alarmT - dt);
      if (v.mode === 'physics') {
        v.physics(dt);
        v.integrate(dt);
      } else if (v.mode === 'kinematic') {
        // el controlador de tránsito ya movió el auto; sólo actualizar suelo y pose
        v.integrate(dt, true);
      }
      // moto sin conductor en movimiento: se cae; parada queda sobre el pie de apoyo
      if (v.spec.bike && !v.driver && !v.parked && Math.abs(v.speed) > 2.5) v.fallen = true;
      // humo y fuego por daño
      if (!v.destroyed && v.health < v.maxHealth * 0.4 && Math.random() < dt * 8) {
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        game.effects.emit('smoke', { x: v.pos.x + fx * v.length * 0.36, y: v.pos.y + v.height * 0.8, z: v.pos.z + fz * v.length * 0.36 }, { dark: v.health < v.maxHealth * 0.2 ? 0.9 : 0.4, size: 0.4 });
      }
      if (v.onFire && !v.destroyed) {
        v.fireT += dt;
        if (v.fireT > 4.5) v.explode();
      }
      // marcas y humo de neumáticos
      if (v.onGround && !v.sunk && (v.slip > 3.5 || (v.braking && Math.abs(v.speed) > 12) || (v.controls.handbrake && Math.abs(v.speed) > 5))) {
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
        const hw = v.width / 2 - 0.15, hl = v.spec.wb / 2;
        for (const [k, s] of [[0, 1], [1, -1]]) {
          const p = { x: v.pos.x - fx * hl + lx * s * hw, y: v.groundY, z: v.pos.z - fz * hl + lz * s * hw };
          game.effects.skids.add(v.id * 4 + k, p, 0.24, Math.min(1, v.slip / 8));
          if (Math.random() < 0.35 && v.pos.distanceTo(game.engine.camera.position) < 70) game.effects.emit('tire', p, { vel: { x: v.vel.x * 0.2, y: 0, z: v.vel.z * 0.2 } });
        }
      } else {
        game.effects.skids.break(v.id * 4);
        game.effects.skids.break(v.id * 4 + 1);
      }
      // rocío de agua detrás de las ruedas con el asfalto mojado
      const wet = U.uWet.value;
      const absSp = Math.abs(v.speed);
      if (wet > 0.35 && absSp > 7 && v.onGround && !v.inWater) {
        const dc = v.pos.distanceTo(game.engine.camera.position);
        const rate = (absSp - 6) * 0.9 * (wet - 0.3) * (v.spec.bike ? 0.5 : 1);
        if (dc < 90 && Math.random() < rate * dt * 6) {
          const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
          const hl = v.spec.wb / 2 + 0.25, hw = v.spec.bike ? 0 : v.width / 2 - 0.2;
          for (const sgn of v.spec.bike ? [0] : [1, -1]) {
            game.effects.emit('spray', { x: v.pos.x - fx * hl + lx * sgn * hw, y: v.groundY + 0.25, z: v.pos.z - fz * hl + lz * sgn * hw }, { vel: { x: v.vel.x, y: 0, z: v.vel.z }, floor: v.groundY, k: Math.min(1, absSp / 30) });
          }
        }
      }
      if (v.nitroOn && Math.random() < 0.6) {
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
        game.effects.emit('flash', { x: v.pos.x - fx * v.length * 0.52, y: v.pos.y + 0.35, z: v.pos.z - fz * v.length * 0.52 }, { size: 0.5, life: 0.08 });
      }
    }
    this._vehicleCollisions();
    // limpieza
    const pv = game.player.vehicle;
    for (const v of [...this.list]) {
      if (v === pv) continue;
      const d = v.pos.distanceTo(game.player.pos);
      if ((v.destroyed && v.age > 60 && d > 60) || (v.sunk && d > 30) || (d > 420 && !v.persistent)) this.remove(v);
    }
    this._audio(dt);
  }

  render() {
    const game = this.game;
    this.renderer.sync(this.list, game.engine.camera, game.sky.nightK);
    this.renderer.playerLights(game.player.vehicle, game.sky.nightK);
  }
}

// Arrays de capas de texturas (albedo+rugosidad y normal+altura+cavidad) para suelos y fachadas.
// Cada capa es una textura escaneada de una superficie real (Poly Haven, CC0; ver tools/textures) si se pudo
// cargar; si no, la versión procedural generada en la placa de video.
// Detalle de fachadas: se guarda a la mitad (los moduladores pueden pasar de 1, p. ej. la junta del ladrillo);
// los shaders lo multiplican por 2 al leerlo (sampleDet).
import * as THREE from 'three';
import TEXMETA from '../../assets/textures/textures.json';

// Capas del array de suelos
export const GROUND = { ASPHALT: 0, PAVERS: 1, GRASS: 2, TILES: 3, SAND: 4, CONCRETE: 5, GRAVEL: 6, WOOD: 7, GRANITE: 8, SEABED: 9 };
export const GROUND_LAYERS = 10;
// Tamaño (m) que cubre cada repetición de textura
export const GROUND_TILE = [5.0, 2.4, 4.0, 4.0, 6.0, 8.0, 3.0, 3.0, 2.0, 8.0];

// Capas del array de fachadas/detalles
export const DETAIL = { STUCCO: 0, CONCRETE: 1, BRICK: 2, METAL: 3, BARK: 4, PAINT: 5 };
export const DETAIL_LAYERS = 6;

const NOISE_P = /* glsl */ `
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 h22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnP(vec2 p, vec2 per){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1., per);
  return mix(mix(h12(i0), h12(vec2(i1.x, i0.y)), u.x), mix(h12(vec2(i0.x, i1.y)), h12(i1), u.x), u.y);
}
float fbmP(vec2 uv, float F, int oct){
  float s = 0., a = .5, n = 0.; vec2 per = vec2(F);
  for (int i = 0; i < 8; i++){ if (i >= oct) break; s += a * vnP(uv * per, per); n += a; per *= 2.; a *= .5; }
  return s / n;
}
// Voronoi periódico: x = distancia F1, y = F2-F1 (borde), z = hash de celda
vec3 vorP(vec2 uv, float F){
  vec2 p = uv * F; vec2 i = floor(p), f = fract(p);
  float d1 = 8., d2 = 8.; float id = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){
    vec2 g = vec2(float(x), float(y));
    vec2 c = mod(i + g, vec2(F));
    vec2 o = h22(c);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < d1){ d2 = d1; d1 = d; id = h12(c + 7.7); } else if (d < d2){ d2 = d; }
  }
  return vec3(sqrt(d1), sqrt(d2) - sqrt(d1), id);
}
`;

const GROUND_FUNCS = /* glsl */ `
// Cada capa: altura H (0..1) y albedo (rgb lineal) + rugosidad
float H(vec2 uv, int L){
  if (L == 0) { // asfalto
    vec3 v = vorP(uv, 150.);
    float stones = smoothstep(.6, .1, v.x) * (.5 + .5 * v.z);
    return .4 * stones + .35 * fbmP(uv, 24., 4) + .25 * fbmP(uv, 220., 2);
  }
  if (L == 1) { // adoquines de vereda 0.4 m
    vec2 g = uv * 6.; vec2 f = fract(g);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    float pav = smoothstep(.02, .06, e);
    return pav * (.7 + .3 * smoothstep(.04, .16, e)) + .06 * fbmP(uv, 48., 3) * pav;
  }
  if (L == 2) { // pasto
    float bl = vnP(uv * vec2(260., 90.), vec2(260., 90.));
    return .5 * fbmP(uv, 12., 4) + .5 * bl;
  }
  if (L == 3) { // baldosas de piedra 1 m
    vec2 g = uv * 4.; vec2 f = fract(g);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    return smoothstep(.006, .02, e) * (.9 + .1 * fbmP(uv, 16., 3));
  }
  if (L == 4) { // arena con ondas
    vec2 q = uv + .03 * vec2(fbmP(uv, 6., 3), fbmP(uv + .5, 6., 3));
    float rip = sin((q.x * .8 + q.y * .6) * 6.2831 * 18. + fbmP(uv, 8., 3) * 6.) * .5 + .5;
    return .45 * rip + .4 * fbmP(uv, 96., 3) + .15 * fbmP(uv, 300., 2);
  }
  if (L == 5) { // hormigón
    float j = min(abs(fract(uv.x * 2. + .5) - .5), abs(fract(uv.y * 2. + .5) - .5));
    float joint = smoothstep(.0015, .004, j);
    vec3 v = vorP(uv, 6.);
    float crack = smoothstep(.0, .012, v.y) + step(.35, h12(vec2(v.z * 91.)));
    return joint * clamp(crack, 0., 1.) * (.85 + .15 * fbmP(uv, 40., 4));
  }
  if (L == 6) { // grava / membrana de techo
    vec3 v = vorP(uv, 90.);
    return smoothstep(.6, .1, v.x) * (.5 + .5 * v.z) * .8 + .2 * fbmP(uv, 30., 3);
  }
  if (L == 7) { // tablas de madera
    float pl = uv.y * 20.; float f = fract(pl);
    float gap = smoothstep(.0, .06, f) * smoothstep(1., .94, f);
    float row = floor(pl);
    float seam = fract(uv.x * 2. + h12(vec2(row, 3.)));
    gap *= smoothstep(0., .01, seam) * smoothstep(1., .99, seam);
    return gap * (.8 + .2 * vnP(vec2(uv.x * 40., pl * 3.), vec2(40., 60.)));
  }
  if (L == 8) { // granito (cordón)
    return .5 + .5 * fbmP(uv, 64., 4);
  }
  // 9: lecho marino
  return .6 * fbmP(uv, 8., 5) + .4 * smoothstep(.5, .1, vorP(uv, 24.).x);
}

vec4 A(vec2 uv, int L){
  if (L == 0) {
    vec3 v = vorP(uv, 150.);
    float stone = smoothstep(.55, .15, v.x);
    float n = fbmP(uv, 3., 4);
    float g = .085 + .022 * v.z * stone + .02 * fbmP(uv, 40., 3) - .008 * (1. - stone);
    g *= .88 + .24 * n;
    // piedras claras ocasionales (cuarzo)
    g += step(.95, v.z) * stone * .035;
    // manchas de aceite
    float oil = smoothstep(.62, .75, fbmP(uv + 3.1, 4., 4));
    g *= 1. - .35 * oil;
    float rough = .9 - .12 * stone * v.z + .05 * oil * -1.;
    return vec4(vec3(g * 1.02, g, g * .98), rough);
  }
  if (L == 1) {
    vec2 g = uv * 6.; vec2 id = floor(g); vec2 f = fract(g);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    float pav = smoothstep(.02, .05, e);
    float t = h12(mod(id, 6.));
    float base = .36 + .12 * t;
    float stain = fbmP(uv, 3., 4);
    vec3 c = vec3(base) * (.82 + .3 * stain);
    c *= vec3(1.02, 1., .97);
    vec3 gapC = vec3(.09, .1, .08) + vec3(.0, .03, .0) * fbmP(uv, 30., 2);
    c = mix(gapC, c, pav);
    return vec4(c, mix(.95, .74 + .08 * t, pav));
  }
  if (L == 2) {
    float n = fbmP(uv, 6., 4);
    float d = fbmP(uv + 1.7, 14., 3);
    vec3 rich = vec3(.06, .16, .035), dry = vec3(.2, .22, .08), dark = vec3(.035, .08, .02);
    vec3 c = mix(rich, dry, smoothstep(.45, .75, n));
    c = mix(c, dark, smoothstep(.55, .8, d) * .6);
    float bl = vnP(uv * vec2(260., 90.), vec2(260., 90.));
    c *= .75 + .5 * bl;
    float dirt = smoothstep(.72, .82, fbmP(uv + 9.1, 5., 4));
    c = mix(c, vec3(.16, .12, .08), dirt * .7);
    return vec4(c, .96);
  }
  if (L == 3) {
    vec2 g = uv * 4.; vec2 id = floor(g); vec2 f = fract(g);
    float e = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
    float t = h12(mod(id, 4.) + 2.);
    vec2 w = uv * 6. + vec2(fbmP(uv, 4., 4), fbmP(uv + .3, 4., 4)) * 2.;
    float vein = smoothstep(.02, .0, abs(sin(w.x * 3.1 + w.y * 1.7)) - .02) * .25;
    vec3 c = vec3(.58, .54, .48) * (.88 + .18 * t) * (.92 + .1 * fbmP(uv, 32., 3)) - vein * .08;
    c = mix(vec3(.22, .21, .19), c, smoothstep(.006, .015, e));
    return vec4(c, mix(.9, .42 + .1 * t, smoothstep(.006, .015, e)));
  }
  if (L == 4) {
    float n = fbmP(uv, 4., 4);
    float grain = fbmP(uv, 220., 2);
    vec3 c = vec3(.62, .52, .36) * (.85 + .25 * n) * (.9 + .2 * grain);
    c += step(.985, h12(floor(uv * 900.))) * .15; // conchillas
    return vec4(c, .94);
  }
  if (L == 5) {
    float n = fbmP(uv, 3., 5);
    float st = smoothstep(.55, .8, fbmP(uv + 2.3, 5., 4));
    float c0 = .34 + .1 * n - .1 * st;
    float hh = H(uv, 5);
    c0 *= mix(.55, 1., smoothstep(.2, .6, hh));
    return vec4(vec3(c0 * 1.01, c0, c0 * .97), .86);
  }
  if (L == 6) {
    vec3 v = vorP(uv, 90.);
    float g = .22 + .2 * v.z;
    return vec4(vec3(g, g * .98, g * .95) * (.8 + .3 * fbmP(uv, 8., 3)), .95);
  }
  if (L == 7) {
    float pl = uv.y * 20.;
    float row = floor(pl);
    float t = h12(vec2(row, 1.3));
    float grain = vnP(vec2(uv.x * 60., pl * 8.), vec2(60., 160.));
    vec3 c = mix(vec3(.32, .22, .14), vec3(.42, .38, .33), .55 + .3 * t) * (.8 + .35 * grain);
    float hh = H(uv, 7);
    c *= mix(.3, 1., smoothstep(.2, .7, hh));
    return vec4(c, .8);
  }
  if (L == 8) {
    float s = fbmP(uv, 64., 4);
    float sp = step(.8, h12(floor(uv * 512.)));
    vec3 c = vec3(.52, .52, .5) * (.8 + .3 * s) - sp * .18 + step(.97, h12(floor(uv * 512.) + 3.)) * .2;
    return vec4(c, .55);
  }
  float n = fbmP(uv, 8., 5);
  vec3 c = mix(vec3(.42, .38, .28), vec3(.2, .26, .18), smoothstep(.4, .7, n));
  return vec4(c, .9);
}
`;

const DETAIL_FUNCS = /* glsl */ `
float H(vec2 uv, int L){
  if (L == 0) return fbmP(uv, 32., 5);
  if (L == 1) { // hormigón con juntas de encofrado
    float j = abs(fract(uv.y * 4.) - .5);
    return smoothstep(.49, .47, j) * (.7 + .3 * fbmP(uv, 24., 4)) + step(.97, h12(floor(uv * 64.))) * -.2;
  }
  if (L == 2) { // ladrillos 24x7cm (tile 1.2 m)
    vec2 g = uv * vec2(5., 16.);
    float row = floor(g.y);
    g.x += mod(row, 2.) * .5;
    vec2 f = fract(g);
    float e = min(min(f.x * 3.4, (1. - f.x) * 3.4), min(f.y, 1. - f.y));
    return smoothstep(.05, .14, e) * (.85 + .15 * fbmP(uv, 40., 3));
  }
  if (L == 3) { // chapa acanalada vertical
    float r = sin(uv.x * 6.2831 * 24.) * .5 + .5;
    return r * .85 + .15 * fbmP(uv, 30., 3);
  }
  if (L == 4) { // corteza de palmera (anillos)
    float ring = fract(uv.y * 14. + .15 * fbmP(uv, 6., 3));
    return smoothstep(0., .25, ring) * smoothstep(1., .7, ring) * .8 + .2 * fbmP(uv, 40., 3);
  }
  return fbmP(uv, 20., 3) * .3 + .7;
}
vec4 A(vec2 uv, int L){
  if (L == 0) { float n = fbmP(uv, 4., 5); float d = fbmP(uv, 60., 3); float g = .9 + .12 * n - .08 * d; return vec4(vec3(g), .88); }
  if (L == 1) { float n = fbmP(uv, 3., 5); float g = .82 + .18 * n; g *= mix(.75, 1., smoothstep(.0, .5, H(uv, 1))); return vec4(vec3(g * 1.01, g, g * .98), .9); }
  if (L == 2) {
    vec2 g = uv * vec2(5., 16.); float row = floor(g.y); g.x += mod(row, 2.) * .5; vec2 id = floor(g);
    float t = h12(mod(id, vec2(5., 16.)) + 4.);
    float mortar = 1. - smoothstep(.05, .12, H(uv, 2) / .85);
    vec3 c = vec3(1.) * (.78 + .35 * t) * (.9 + .15 * fbmP(uv, 30., 3));
    c = mix(c, vec3(1.45, 1.4, 1.3), mortar * .85);
    return vec4(c, .9);
  }
  if (L == 3) { float n = fbmP(uv, 5., 4); float rust = smoothstep(.62, .8, fbmP(uv + 4., 6., 4)); vec3 c = vec3(.95 + .1 * n); c = mix(c, vec3(.75, .5, .32), rust * .5); return vec4(c, .55 + .3 * rust); }
  if (L == 4) { float r = H(uv, 4); vec3 c = mix(vec3(.24, .19, .14), vec3(.47, .4, .31), r) * (.85 + .2 * fbmP(uv, 12., 3)); return vec4(c, .92); }
  float s = fbmP(uv, 50., 3); float scratch = step(.995, h12(floor(uv * vec2(2., 300.)))); return vec4(vec3(.95 + .05 * s - scratch * .2), .45 + .2 * s);
}
`;

function makeGenMaterial(funcs, layerCount) {
  return new THREE.ShaderMaterial({
    uniforms: { uLayer: { value: 0 }, uTexel: { value: 1 / 1024 }, uStrength: { value: 1 }, uAlbScale: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform int uLayer; uniform float uTexel; uniform float uStrength; uniform int uMode; uniform float uAlbScale;
      varying vec2 vUv;
      ${NOISE_P}
      ${funcs}
      void main(){
        vec2 uv = vUv;
        if (uMode == 0) {
          vec4 a = A(uv, uLayer);
          // codificación gamma 2 para conservar precisión en tonos oscuros
          gl_FragColor = vec4(sqrt(clamp(a.rgb * uAlbScale, 0., 1.)), a.a);
        } else {
          float e = uTexel;
          float hl = H(fract(uv - vec2(e, 0.)), uLayer), hr = H(fract(uv + vec2(e, 0.)), uLayer);
          float hd = H(fract(uv - vec2(0., e)), uLayer), hu = H(fract(uv + vec2(0., e)), uLayer);
          float hc = H(uv, uLayer);
          vec3 n = normalize(vec3((hl - hr) * uStrength, (hd - hu) * uStrength, 2. * e * 60.));
          float cav = clamp(1. - (4. * hc - hl - hr - hd - hu) * 6., 0., 1.);
          gl_FragColor = vec4(n.xy * .5 + .5, hc, cav);
        }
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Empaqueta una capa escaneada: albedo (lineal × ganancia, o modulador si se tiñe) + rugosidad; normal + altura + oclusión. */
function makePackMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null }, tN: { value: null }, tR: { value: null }, uMode: { value: 0 },
      uGain: { value: 1 }, uMean: { value: new THREE.Vector3(1, 1, 1) }, uMod: { value: 0 }, uAlbScale: { value: 1 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * .5 + .5; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tA; uniform sampler2D tN; uniform sampler2D tR;
      uniform int uMode; uniform float uGain; uniform vec3 uMean; uniform float uMod; uniform float uAlbScale;
      varying vec2 vUv;
      void main(){
        if (uMode == 0) {
          vec3 lin = texture2D(tA, vUv).rgb;
          lin = uMod > .5 ? lin / uMean * .92 : lin * uGain;
          gl_FragColor = vec4(sqrt(clamp(lin * uAlbScale, 0., 1.)), texture2D(tR, vUv).r);
        } else {
          vec3 n = texture2D(tN, vUv).rgb;
          gl_FragColor = vec4(n, texture2D(tR, vUv).g);
        }
      }`,
    depthTest: false,
    depthWrite: false,
  });
}

function genArray(renderer, funcs, layers, size, strengths, scanned = null, albScale = 1) {
  const mat = makeGenMaterial(funcs, layers);
  mat.uniforms.uMode = { value: 0 };
  mat.uniforms.uAlbScale.value = albScale;
  const pack = scanned ? makePackMaterial() : null;
  if (pack) pack.uniforms.uAlbScale.value = albScale;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mk = () => {
    const rt = new THREE.WebGLArrayRenderTarget(size, size, layers, { depthBuffer: false });
    const t = rt.texture;
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const albedo = mk(), normal = mk();
  const prevRT = renderer.getRenderTarget();
  const prevAuto = renderer.autoClear;
  renderer.autoClear = false;
  mat.uniforms.uTexel.value = 1 / size;
  for (let L = 0; L < layers; L++) {
    const sc = scanned && scanned[L];
    if (sc) {
      // capa escaneada
      mesh.material = pack;
      const u = pack.uniforms;
      u.tA.value = sc.a;
      u.tN.value = sc.n;
      u.tR.value = sc.r;
      u.uGain.value = sc.meta.gain || 1;
      u.uMean.value.fromArray(sc.meta.mean);
      u.uMod.value = sc.meta.mode === 'mod' ? 1 : 0;
      u.uMode.value = 0;
      renderer.setRenderTarget(albedo, L);
      renderer.render(scene, cam);
      u.uMode.value = 1;
      renderer.setRenderTarget(normal, L);
      renderer.render(scene, cam);
      mesh.material = mat;
      continue;
    }
    mat.uniforms.uLayer.value = L;
    mat.uniforms.uMode.value = 0;
    renderer.setRenderTarget(albedo, L);
    renderer.render(scene, cam);
    mat.uniforms.uMode.value = 1;
    mat.uniforms.uStrength.value = strengths[L] ?? 1;
    renderer.setRenderTarget(normal, L);
    renderer.render(scene, cam);
  }
  renderer.setRenderTarget(prevRT);
  renderer.autoClear = prevAuto;
  mat.dispose();
  if (pack) pack.dispose();
  if (scanned) for (const sc of Object.values(scanned)) for (const k of ['a', 'n', 'r']) sc[k].dispose();
  geo.dispose();
  return { albedo: albedo.texture, normal: normal.texture, targets: [albedo, normal] };
}

export function generateGroundTextures(renderer, size = 1024, scanned = null) {
  return genArray(renderer, GROUND_FUNCS, GROUND_LAYERS, size, [1.2, 1.6, 1.0, 0.8, 0.7, 0.9, 1.4, 1.5, 0.6, 1.0], scanned && scanned.ground);
}

export function generateDetailTextures(renderer, size = 512, scanned = null) {
  return genArray(renderer, DETAIL_FUNCS, DETAIL_LAYERS, size, [0.5, 0.8, 1.4, 1.6, 1.8, 0.4], scanned && scanned.detail, 0.5);
}

async function loadImageTexture(url, srgb) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const bmp = await createImageBitmap(await res.blob(), { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const t = new THREE.Texture(bmp);
  t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Carga las texturas escaneadas (tex/…); devuelve null si no se pueden cargar (queda lo procedural). */
export async function loadScannedTextures(base = 'tex/') {
  try {
    const out = { ground: {}, detail: {} };
    const jobs = [];
    for (const arr of ['ground', 'detail']) {
      for (const [idx, meta] of Object.entries(TEXMETA[arr])) {
        jobs.push((async () => {
          const [a, n, r] = await Promise.all([
            loadImageTexture(base + meta.file + '_a.webp', true),
            loadImageTexture(base + meta.file + '_n.jpg', false),
            loadImageTexture(base + meta.file + '_r.jpg', false),
          ]);
          out[arr][idx] = { a, n, r, meta };
        })());
      }
    }
    await Promise.all(jobs);
    return out;
  } catch (e) {
    console.warn('Texturas escaneadas no disponibles; quedan las procedurales.', e && e.message);
    return null;
  }
}

/** GLSL para muestrear los arrays (decodifica gamma 2 y normal). */
export const GLSL_ARRAY_SAMPLING = /* glsl */ `
vec4 sampleAlb(sampler2DArray t, vec2 uv, float layer){ vec4 a = texture(t, vec3(uv, layer)); return vec4(a.rgb * a.rgb, a.a); }
vec4 sampleNrm(sampler2DArray t, vec2 uv, float layer){ vec4 n = texture(t, vec3(uv, layer)); vec2 xy = n.xy * 2. - 1.; return vec4(xy, sqrt(max(1. - dot(xy, xy), 0.)), n.w); }
float sampleHgt(sampler2DArray t, vec2 uv, float layer){ return texture(t, vec3(uv, layer)).z; }
vec4 sampleDet(sampler2DArray t, vec2 uv, float layer){ vec4 a = sampleAlb(t, uv, layer); return vec4(a.rgb * 2., a.a); }
`;

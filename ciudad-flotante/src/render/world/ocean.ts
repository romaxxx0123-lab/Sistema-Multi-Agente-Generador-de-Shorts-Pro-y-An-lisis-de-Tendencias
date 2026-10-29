/**
 * OCÉANO low-poly: una malla cuadrada centrada en el barco, con celdas finas cerca (núcleo
 * uniforme) que crecen geométricamente hacia el horizonte (≈ 3 km), desplazada en el vertex
 * shader con las olas de Gerstner de `waves.ts`.
 *
 * Material: `MeshPhongMaterial` con sombreado plano extendido con `onBeforeCompile`, para heredar
 * luces, sombras del barco y niebla de three.js. Añade:
 *  - color por altura (seno = agua profunda, cresta = agua clara) con la paleta de la región,
 *  - espuma por cara (varying `flat`): crestas con viento, costados, ola de proa, brazos de
 *    Kelvin y estela de la hélice; con ruido que viaja con el agua,
 *  - reflejo del cielo con Fresnel, contraluz en crestas y manchas de sargazo (región),
 *  - destellos del sol/luna acotados y apagados con el cielo cubierto (`uGlint`),
 *  - máscara: no se dibuja dentro del casco (la bodega está por debajo de la flotación).
 *
 * La malla se traslada en −x con el desplazamiento del agua (módulo una celda): así los vértices
 * cercanos siguen al agua y las facetas "pasan" junto al casco, reforzando la sensación de viaje.
 */
import * as THREE from 'three';
import type { Quality } from '../../game/types';
import { GLSL_WAVES, HULL_SAMPLES, WAVE_COUNT, writeWaveUniforms, type WaveField } from './waves';

interface GridSpec {
  /** Lado de celda del núcleo (m). Debe dividir a NOISE_PERIOD_M (1536) para que el ciclo cierre. */
  cell: number;
  /** Semilado del núcleo uniforme (m). */
  core: number;
  /** Celdas de la corona exterior a cada lado. */
  outer: number;
  /** Semilado total de la malla (m). */
  extent: number;
}

export const OCEAN_GRID: Record<Quality, GridSpec> = {
  baja: { cell: 3, core: 72, outer: 36, extent: 3000 },
  media: { cell: 2, core: 80, outer: 54, extent: 3000 },
  alta: { cell: 1.6, core: 88, outer: 64, extent: 3000 },
};

/** Coordenadas de un eje: núcleo uniforme y corona con crecimiento geométrico hasta `extent`. */
export function axisCoords(s: GridSpec): number[] {
  const coreN = Math.round(s.core / s.cell);
  const coreHalf = coreN * s.cell;
  const remain = s.extent - coreHalf;
  // Busca el factor g tal que Σ_{k=1..outer} cell·g^k = remain.
  let lo = 1.0001;
  let hi = 2;
  const sum = (g: number): number => (s.cell * g * (g ** s.outer - 1)) / (g - 1);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) < remain) lo = mid;
    else hi = mid;
  }
  const g = (lo + hi) / 2;
  const pos: number[] = [];
  for (let i = -coreN; i <= coreN; i++) pos.push(i * s.cell);
  let x = coreHalf;
  let step = s.cell;
  const outer: number[] = [];
  for (let k = 1; k <= s.outer; k++) {
    step *= g;
    x += step;
    outer.push(k === s.outer ? s.extent : x);
  }
  return [...outer.map((v) => -v).reverse(), ...pos, ...outer];
}

/** Rejilla plana (y = 0) con diagonales alternas: facetas más orgánicas. */
export function buildOceanGeometry(s: GridSpec): THREE.BufferGeometry {
  const ax = axisCoords(s);
  const n = ax.length;
  const pos = new Float32Array(n * n * 3);
  const nrm = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      pos[k] = ax[i]!;
      pos[k + 1] = 0;
      pos[k + 2] = ax[j]!;
      nrm[k + 1] = 1;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      // Orden antihorario visto desde arriba (+y).
      if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
      else idx.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), s.extent * 1.5);
  return g;
}

/* ------------------------------------------------------------------ */
/* Shaders                                                             */
/* ------------------------------------------------------------------ */

const NOISE_GLSL = /* glsl */ `
float ocHash(vec2 p) { p = mod(p, 64.0); return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float ocNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = fract(p);
  vec2 u = fr * fr * (3.0 - 2.0 * fr);
  float a = ocHash(i);
  float b = ocHash(i + vec2(1.0, 0.0));
  float c = ocHash(i + vec2(0.0, 1.0));
  float d = ocHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const VERT_PARS = /* glsl */ `
${GLSL_WAVES}
${NOISE_GLSL}
uniform float uDrift;   // desplazamiento del agua (m), envuelto
uniform float uNoiseT;  // tiempo para el ruido, envuelto
uniform float uAmp;     // amplitud total
uniform float uCrest;   // cantidad de espuma en crestas
uniform float uAlgae;   // sargazos 0..1
varying vec3 vOcWorld;
varying float vWake;
flat varying float vFoam;
flat varying float vShade;
flat varying float vAlgae;
`;

const VERT_BEGIN = /* glsl */ `
vec3 transformed = vec3(position);
vec2 gW = (modelMatrix * vec4(position, 1.0)).xz;
float hRaw;
vec3 dsp = gerstner(gW, hRaw);
transformed += vec3(dsp.x, dsp.y + wakeBump(gW), dsp.z);
vOcWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vShade = hRaw / max(uAmp, 0.05);

vec2 np = vec2(gW.x + uDrift, gW.y);
float n2 = ocNoise(np / 1.5 + vec2(uNoiseT, 0.0));
float foam = 0.0;
float sf = uWake.x;
float az = abs(gW.y);
float hw = hullHW(gW.x);
if (hw >= 0.0) {
  // Espuma pegada al casco (más ancha y viva en la proa).
  float e = max(0.0, az - hw);
  float bowZone = sstep(uHull.y - 14.0, uHull.y - 2.0, gW.x);
  foam += exp(-e / (0.55 + 0.5 * sf)) * (0.2 + 0.55 * sf);
  foam += bowZone * exp(-(e * e) / 4.0) * sf * 0.9;
} else if (gW.x > uHull.y) {
  float dTip = length(vec2(gW.x - uHull.y, gW.y));
  foam += exp(-(dTip * dTip) / 3.0) * sf;
}
float dBow = uHull.y - 6.0 - gW.x;
if (dBow > 0.0) {
  // Brazos de Kelvin: una línea fina de espuma que se abre y se apaga.
  float arm = az - (uWake.y * 0.8 + dBow * 0.354);
  float sg = 0.9 + dBow * 0.02;
  foam += exp(-(arm * arm) / (2.0 * sg * sg)) * exp(-dBow / 55.0) * sf * 0.75;
}
float dSt = uHull.x - gW.x;
if (dSt > 0.0) {
  // Estela de la hélice: estrecha junto a la popa, se ensancha y se deshace.
  float wid = uWake.z * (0.38 + dSt * 0.01);
  foam += exp(-(gW.y * gW.y) / (wid * wid)) * exp(-dSt / 55.0) * sf * 0.95;
  float arm2 = az - (uWake.z * 0.9 + dSt * 0.354);
  float sg2 = 0.9 + dSt * 0.02;
  foam += exp(-(arm2 * arm2) / (2.0 * sg2 * sg2)) * exp(-dSt / 45.0) * sf * 0.5;
}
vWake = foam;
// Borreguitos: solo en las crestas más altas y con el ruido a favor (facetas sueltas, no mantos).
float crest = sstep(0.55, 0.98, vShade) * uCrest * (0.1 + 1.3 * n2 * n2);
vFoam = clamp(crest - 0.42, 0.0, 1.0) * 1.3;
vAlgae = uAlgae * sstep(0.66, 0.74, ocNoise(np / 24.0) * 0.5 + ocNoise(np / 6.0) * 0.5);
`;

const FRAG_PARS = /* glsl */ `
${NOISE_GLSL}
uniform mat4 uShipInv;
uniform float uHullHW[${HULL_SAMPLES}];
uniform vec4 uHull;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uFoamCol;
uniform vec3 uAlgaeCol;
uniform vec3 uSkyZen;
uniform vec3 uSkyHor;
uniform vec3 uSkyHorSun;
uniform vec3 uSunDirW;
uniform vec3 uSunCol;
uniform float uReflect;
uniform float uSSS;
uniform float uDrift;
uniform float uGlint;
varying vec3 vOcWorld;
varying float vWake;
flat varying float vFoam;
flat varying float vShade;
flat varying float vAlgae;
float ocHullHW(float x) {
  float fi = (x - uHull.x) / (uHull.y - uHull.x) * ${(HULL_SAMPLES - 1).toFixed(1)};
  if (fi < 0.0 || fi > ${(HULL_SAMPLES - 1).toFixed(1)}) return -1.0;
  int i = min(${HULL_SAMPLES - 2}, int(floor(fi)));
  return mix(uHullHW[i], uHullHW[i + 1], fi - float(i));
}
`;

const FRAG_MASK = /* glsl */ `
{
  vec3 ocLocal = (uShipInv * vec4(vOcWorld, 1.0)).xyz;
  float ocHw = ocHullHW(ocLocal.x);
  if (ocHw > 0.0 && abs(ocLocal.z) < ocHw) discard;
}
// Espuma de la estela por píxel: bordes nítidos y orgánicos que viajan con el agua
// (estilo "toon"); la de las crestas va por faceta.
float ocFoam = vFoam;
if (vWake > 0.02) {
  // (el ruido solo se calcula cerca de la estela: la mayor parte del mar se lo ahorra)
  vec2 ocNp = vec2(vOcWorld.x + uDrift, vOcWorld.z);
  float ocN = 0.55 * ocNoise(ocNp / 3.0) + 0.3 * ocNoise(ocNp / 1.2) + 0.15 * ocNoise(ocNp / 0.5);
  float ocW = vWake * (0.2 + 1.25 * ocN);
  ocFoam = max(ocFoam, smoothstep(0.52, 0.6, ocW) * 0.92 + smoothstep(0.3, 0.52, ocW) * 0.22);
}
ocFoam = clamp(ocFoam, 0.0, 1.0);
`;

const FRAG_COLOR = /* glsl */ `
{
  float sh = clamp(vShade * 0.5 + 0.5, 0.0, 1.0);
  vec3 wc = mix(uDeep, uShallow, smoothstep(0.08, 0.95, sh));
  wc = mix(wc, uAlgaeCol, vAlgae * 0.75);
  wc = mix(wc, uFoamCol, ocFoam);
  diffuseColor.rgb = wc;
}
`;

const FRAG_REFLECT = /* glsl */ `
{
  vec3 ocN = normalize(cross(dFdx(vOcWorld), dFdy(vOcWorld)));
  if (ocN.y < 0.0) ocN = -ocN;
  vec3 ocV = normalize(cameraPosition - vOcWorld);
  float ocF = 0.02 + 0.98 * pow(1.0 - clamp(dot(ocN, ocV), 0.0, 1.0), 5.0);
  vec3 ocR = reflect(-ocV, ocN);
  vec2 ocRh = ocR.xz / max(length(ocR.xz), 1e-4);
  vec2 ocSh = uSunDirW.xz / max(length(uSunDirW.xz), 1e-4);
  float ocSunward = pow(dot(ocRh, ocSh) * 0.5 + 0.5, 3.0);
  vec3 ocHor = mix(uSkyHor, uSkyHorSun, ocSunward);
  vec3 ocSky = mix(ocHor, uSkyZen, 0.3 + 0.7 * sqrt(clamp(ocR.y, 0.0, 1.0)));
  float keep = 1.0 - max(ocFoam, vAlgae * 0.7);
  outgoingLight = mix(outgoingLight, ocSky, clamp(ocF * uReflect, 0.0, 0.85) * keep);
  float sh = clamp(vShade * 0.5 + 0.5, 0.0, 1.0);
  float back = pow(clamp(dot(-ocV, uSunDirW), 0.0, 1.0), 4.0) * smoothstep(0.5, 1.0, sh);
  outgoingLight += uShallow * uSunCol * back * uSSS * keep;
}
`;

/**
 * Destellos del sol/luna en las facetas. El Blinn-Phong de three.js usa un Fresnel de Schlick con
 * f90 = 1 fijo: a contraluz rasante (ola empinada entre la cámara y el sol) el término crece hasta
 * ~50× el f0 normalizado y una faceta entera se volvía blanca, incluso bajo un cielo de tormenta.
 * Aquí se escala TODO el especular con la visibilidad del disco (`uGlint`: nubes y niebla lo
 * apagan) y se comprime con una rodilla suave por encima de 1 (máx. 2): el camino de destellos
 * del ocaso se conserva, pero ninguna faceta "se enciende".
 */
const FRAG_GLINT = /* glsl */ `
{
  reflectedLight.directSpecular *= uGlint;
  float ocM = max(max(reflectedLight.directSpecular.r, reflectedLight.directSpecular.g), reflectedLight.directSpecular.b);
  if (ocM > 1.0) reflectedLight.directSpecular *= (2.0 - 1.0 / ocM) / ocM;
}
`;

/**
 * Copia del bloque de luces de three.js sin las luces puntuales: las lámparas interiores del
 * barco (pool de luces, sin sombras) no deben iluminar el mar a través del casco y las paredes.
 * Si el formato del bloque cambiase, se devuelve sin tocar.
 */
export function withoutPointLights(chunk: string): string {
  const start = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )');
  if (start < 0) return chunk;
  const re = /#(if|ifdef|ifndef|endif)\b/g;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    if (m[1] === 'endif') {
      depth--;
      if (depth === 0) return chunk.slice(0, start) + chunk.slice(m.index + '#endif'.length);
    } else depth++;
  }
  return chunk;
}

/* ------------------------------------------------------------------ */
/* Clase                                                               */
/* ------------------------------------------------------------------ */

export class Ocean {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshPhongMaterial;
  private spec: GridSpec;
  readonly uniforms = {
    uWaveA: { value: new Float32Array(WAVE_COUNT * 4) },
    uWaveB: { value: new Float32Array(WAVE_COUNT * 4) },
    uHullHW: { value: new Float32Array(HULL_SAMPLES) },
    uHull: { value: new THREE.Vector4(-20, 27, 0, 0) },
    uWake: { value: new THREE.Vector4(1, 8.3, 8.3, 0) },
    uDrift: { value: 0 },
    /** Visibilidad de los destellos especulares (0 cielo cubierto … 1 disco limpio). */
    uGlint: { value: 1 },
    uNoiseT: { value: 0 },
    uAmp: { value: 0.3 },
    uCrest: { value: 0.2 },
    uAlgae: { value: 0 },
    uShipInv: { value: new THREE.Matrix4() },
    uDeep: { value: new THREE.Color('#155e80') },
    uShallow: { value: new THREE.Color('#2fa3c6') },
    uFoamCol: { value: new THREE.Color('#e8f4f2') },
    uAlgaeCol: { value: new THREE.Color('#a08a34') },
    uSkyZen: { value: new THREE.Color('#7cc4e8') },
    uSkyHor: { value: new THREE.Color('#f6ecd2') },
    uSkyHorSun: { value: new THREE.Color('#f6ecd2') },
    uSunDirW: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color('#ffffff') },
    uReflect: { value: 0.6 },
    uSSS: { value: 0.35 },
  };

  constructor(quality: Quality) {
    this.spec = OCEAN_GRID[quality];
    this.material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: new THREE.Color('#9fb6bf'),
      // Brillo muy concentrado: con facetas planas, destellos sueltos en lugar de un reflejo difuso.
      shininess: 1400,
      flatShading: true,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
        .replace('#include <begin_vertex>', VERT_BEGIN);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${FRAG_MASK}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
        // La espuma flota casi plana: se suaviza su normal para que no se vea a "baldosas" con mar gruesa.
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz), ocFoam * 0.8));')
        .replace('#include <lights_phong_fragment>', '#include <lights_phong_fragment>\nmaterial.specularStrength = 1.0 - ocFoam * 0.85;')
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG_GLINT}`)
        .replace('#include <opaque_fragment>', `${FRAG_REFLECT}\n#include <opaque_fragment>`)
        .replace('#include <lights_fragment_begin>', withoutPointLights(THREE.ShaderChunk.lights_fragment_begin));
    };
    this.material.customProgramCacheKey = () => 'ciudad-flotante-oceano-v3';
    this.mesh = new THREE.Mesh(buildOceanGeometry(this.spec), this.material);
    this.mesh.name = 'oceano';
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
  }

  /** Cambia la resolución de la malla. */
  setQuality(q: Quality): void {
    const spec = OCEAN_GRID[q];
    if (spec === this.spec) return;
    this.spec = spec;
    const old = this.mesh.geometry;
    this.mesh.geometry = buildOceanGeometry(spec);
    old.dispose();
  }

  /** Vuelca el estado del oleaje y del barco a los uniformes. */
  sync(w: WaveField, shipMatrixWorld: THREE.Matrix4, crestFoam: number): void {
    writeWaveUniforms(w, this.uniforms);
    const u = this.uniforms;
    u.uDrift.value = w.drift;
    u.uNoiseT.value = (w.time * 0.12) % 64;
    u.uAmp.value = w.ampTotal;
    u.uCrest.value = crestFoam;
    u.uShipInv.value.copy(shipMatrixWorld).invert();
    // La malla acompaña al agua (módulo una celda): los vértices cercanos siguen a las olas.
    const c = this.spec.cell;
    this.mesh.position.x = -(((w.drift % c) + c) % c);
    this.mesh.updateMatrix();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

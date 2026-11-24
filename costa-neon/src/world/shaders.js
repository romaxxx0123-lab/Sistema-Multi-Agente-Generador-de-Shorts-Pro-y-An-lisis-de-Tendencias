// Librería GLSL compartida y utilidades para parchear materiales de Three.js.
import * as THREE from 'three';

/** Uniforms globales compartidos por todos los materiales parcheados. */
export const U = {
  uTime: { value: 0 },
  uNight: { value: 0 }, // 0 = día, 1 = noche cerrada
  uLamps: { value: 0 }, // intensidad de faroles (encendidos al anochecer)
  uLitWindows: { value: 0.5 }, // fracción de ventanas encendidas
  uInteriorDay: { value: 0.35 }, // luminancia de interiores durante el día
  uWet: { value: 0 }, // humedad de superficies
  uRain: { value: 0 }, // intensidad de lluvia (ondas en charcos)
  uWind: { value: 0.35 },
  uFogDensity: { value: 0.0016 },
  uFogFalloff: { value: 0.018 },
  uFogColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
  uFogSunColor: { value: new THREE.Color(1.0, 0.85, 0.6) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uExposure: { value: 1 },
  uReflTex: { value: null },
  uReflMatrix: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  uLightning: { value: 0 },
};

export const GLSL_NOISE = /* glsl */ `
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec3 hash33(vec3 p3){ p3 = fract(p3 * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yxz + 33.33); return fract((p3.xxy + p3.yxx) * p3.zyx); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash12(i), hash12(i + vec2(1., 0.)), u.x), mix(hash12(i + vec2(0., 1.)), hash12(i + vec2(1., 1.)), u.x), u.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 17.13; a *= .5; } return s; }
float fbm3(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = p * 2.07 + 11.7; a *= .5; } return s / .875; }
`;

/** Niebla de altura con dispersión hacia el sol (reemplaza los chunks de niebla). */
export const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWP;
#endif
`;
export const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogWP = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif
`;
export const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  varying vec3 vFogWP;
  uniform float uFogDensity;
  uniform float uFogFalloff;
  uniform vec3 uFogColor;
  uniform vec3 uFogSunColor;
  float heightFog(vec3 ro, vec3 wp, out vec3 rd){
    vec3 v = wp - ro; float dist = length(v); rd = v / max(dist, 1e-4);
    float b = uFogFalloff;
    float k = b * rd.y * dist;
    float f = abs(k) < 1e-3 ? dist * (1. - .5 * k) : (1. - exp(-k)) / (b * rd.y);
    float amount = uFogDensity * exp(-b * max(ro.y, -2.)) * f;
    return 1. - exp(-amount);
  }
  vec3 fogTint(vec3 rd){
    float s = max(dot(rd, uSunDir), 0.);
    return mix(uFogColor, uFogSunColor, pow(s, 7.) * .9);
  }
#endif
`;
export const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  vec3 fogRd;
  float fogF = heightFog(cameraPosition, vFogWP, fogRd);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint(fogRd), fogF);
#endif
`;

/**
 * Luz analítica de faroles. Los faroles están cada 20 m a ambos lados de cada calle (offset 9.5 m,
 * fuente a ~8.2 m del eje) salvo en los cruces. Coincide con la ubicación generada en map.js.
 */
export const GLSL_LAMPS = /* glsl */ `
uniform float uLamps;
const float L_ORIGIN = -480.;
const float L_CELL = 80.;
const float L_SP = 20.;
const float L_OFF = 8.2;
const float L_H = 7.4;
bool roadV(float lx, float z){
  if (lx >= -480.5 && lx <= 480.5 && z >= -482. && z <= 482.) return true;
  if (lx >= 799.5 && lx <= 1040.5 && z >= -322. && z <= -78.) return true;
  return false;
}
bool roadH(float lz, float x){
  if (lz >= -480.5 && lz <= 480.5 && x >= -482. && x <= 482.) return true;
  if (lz >= -320.5 && lz <= -79.5 && x >= 798. && x <= 1042.) return true;
  if (abs(lz + 160.) < .5 && x >= 480. && x <= 800.) return true;
  return false;
}
float lampFall(vec3 d){
  float r2 = dot(d, d) + .6;
  float cosT = clamp(d.y / sqrt(r2), 0., 1.);
  return pow(cosT, 3.5) * (L_H * L_H) / r2;
}
// Devuelve la iluminancia relativa (1 = justo debajo del farol) en el punto wp; sy = altura de la fuente.
float streetLamps(vec3 wp){
  float acc = 0.;
  float lx = floor((wp.x - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float lz = floor((wp.z - L_ORIGIN) / L_CELL + .5) * L_CELL + L_ORIGIN;
  float sy = L_H + 0.2;
  if (abs(wp.x - lx) < 34. && roadV(lx, wp.z)) {
    float kz = floor((wp.z - L_ORIGIN) / L_SP);
    for (int s = 0; s < 2; s++){
      float k = kz + float(s);
      if (mod(k, 4.) > .5) {
        float z = L_ORIGIN + k * L_SP;
        acc += lampFall(vec3(lx - L_OFF - wp.x, sy - wp.y, z - wp.z));
        acc += lampFall(vec3(lx + L_OFF - wp.x, sy - wp.y, z - wp.z));
      }
    }
  }
  if (abs(wp.z - lz) < 34. && roadH(lz, wp.x)) {
    float kx = floor((wp.x - L_ORIGIN) / L_SP);
    for (int s = 0; s < 2; s++){
      float k = kx + float(s);
      if (mod(k, 4.) > .5) {
        float x = L_ORIGIN + k * L_SP;
        acc += lampFall(vec3(x - wp.x, sy - wp.y, lz - L_OFF - wp.z));
        acc += lampFall(vec3(x - wp.x, sy - wp.y, lz + L_OFF - wp.z));
      }
    }
  }
  // Paseo costero este (x = 494.5) y Malecón Norte (z = -549)
  if (wp.x > 470. && wp.x < 520. && wp.z > -560. && wp.z < 560.) {
    float k = floor((wp.z + 548.) / 20.);
    for (int s = 0; s < 2; s++){
      float z = -548. + (k + float(s)) * 20.;
      if (abs(z + 160.) > 14.) acc += lampFall(vec3(493.6 - wp.x, sy - wp.y, z - wp.z));
    }
  }
  if (wp.z < -525. && wp.z > -575. && wp.x > -560. && wp.x < 490.) {
    float k = floor((wp.x + 550.) / 20.);
    for (int s = 0; s < 2; s++){
      float x = -550. + (k + float(s)) * 20.;
      acc += lampFall(vec3(x - wp.x, sy - wp.y, -548.2 - wp.z));
    }
  }
  return acc;
}
const vec3 LAMP_COLOR = vec3(1.0, 0.72, 0.42);
`;

/**
 * Parchea un material estándar de Three.js con fragmentos de código.
 * spec: { uniforms, vertexHead, vertexWorld, fragHead, fragColor, fragRoughness, fragMetalness,
 *         fragNormal, fragEmissive, fragOutput, key, fog }
 * Si csm está presente (CSM de three/examples), se encadena su onBeforeCompile.
 */
export function patchMaterial(mat, spec = {}) {
  mat.userData.patch = spec;
  mat.customProgramCacheKey = () => 'cn_' + (spec.key || mat.type) + '_' + (mat.defines && mat.defines.USE_CSM ? 'csm' + mat.defines.CSM_CASCADES : 'nocsm');
  const prev = mat.userData.csmOBC || null;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    applyPatch(shader, spec);
  };
  return mat;
}

export function applyPatch(shader, spec) {
  const fog = spec.fog !== false;
  Object.assign(shader.uniforms, {
    uTime: U.uTime, uNight: U.uNight, uLamps: U.uLamps, uLitWindows: U.uLitWindows, uInteriorDay: U.uInteriorDay,
    uWet: U.uWet, uRain: U.uRain, uWind: U.uWind,
    uFogDensity: U.uFogDensity, uFogFalloff: U.uFogFalloff, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor, uSunDir: U.uSunDir,
    uReflTex: U.uReflTex, uReflMatrix: U.uReflMatrix, uReflOn: U.uReflOn, uLightning: U.uLightning,
  }, spec.uniforms || {});
  let vs = shader.vertexShader, fs = shader.fragmentShader;
  const commonV = `
uniform float uTime; uniform float uWind;
varying vec3 vWPos;
varying vec3 vWNrm;
${spec.vertexHead || ''}
`;
  vs = vs.replace('#include <common>', '#include <common>\n' + commonV);
  vs = vs.replace(
    '#include <worldpos_vertex>',
    `#include <worldpos_vertex>
  {
    vec4 cnWp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      cnWp = instanceMatrix * cnWp;
    #endif
    cnWp = modelMatrix * cnWp;
    vWPos = cnWp.xyz;
    vec3 cnN = ${spec.basic ? 'vec3(0.0, 1.0, 0.0)' : 'objectNormal'};
    #ifdef USE_INSTANCING
      cnN = mat3(instanceMatrix) * cnN;
    #endif
    vWNrm = normalize(mat3(modelMatrix) * cnN);
  }
  ${spec.vertexWorld || ''}`
  );
  if (spec.vertexBegin) vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + spec.vertexBegin);
  if (fog) {
    vs = vs.replace('#include <fog_pars_vertex>', FOG_PARS_VERTEX).replace('#include <fog_vertex>', FOG_VERTEX);
  }
  const commonF = `
uniform float uTime; uniform float uNight; uniform float uLitWindows; uniform float uInteriorDay;
uniform float uWet; uniform float uRain; uniform float uLightning; uniform float uWind; uniform vec3 uSunDir;
uniform sampler2D uReflTex; uniform mat4 uReflMatrix; uniform float uReflOn;
varying vec3 vWPos;
varying vec3 vWNrm;
${GLSL_NOISE}
${spec.lamps ? GLSL_LAMPS : ''}
${spec.fragHead || ''}
`;
  fs = fs.replace('#include <common>', '#include <common>\n' + commonF);
  if (spec.fragColor) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + spec.fragColor);
  if (spec.fragRoughness) fs = fs.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + spec.fragRoughness);
  if (spec.fragMetalness) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + spec.fragMetalness);
  if (spec.fragNormal) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + spec.fragNormal);
  if (spec.fragEmissive) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + spec.fragEmissive);
  if (spec.fragPostLights) fs = fs.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + spec.fragPostLights);
  if (spec.fragOutput) fs = fs.replace('#include <opaque_fragment>', spec.fragOutput + '\n#include <opaque_fragment>');
  if (fog) fs = fs.replace('#include <fog_pars_fragment>', FOG_PARS_FRAGMENT).replace('#include <fog_fragment>', FOG_FRAGMENT);
  shader.vertexShader = vs;
  shader.fragmentShader = fs;
}

/** Convierte una perturbación de normal en espacio mundo a espacio vista (para `normal`). */
export const GLSL_WORLD_TO_VIEW_NORMAL = /* glsl */ `
vec3 cnWorldToViewN(vec3 n){ return normalize((viewMatrix * vec4(n, 0.0)).xyz); }
`;

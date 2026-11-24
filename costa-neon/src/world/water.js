// Océano: olas de Gerstner, color por profundidad real, espuma costera y reflejos PBR.
import * as THREE from 'three';
import { WATER_LEVEL, terrainHeight } from './map.js';
import { U } from './shaders.js';
import { GLSL_PLANAR } from './reflection.js';

export const WAVES = [
  { a: 0.55, l: 42, h: 0.2 },
  { a: -0.45, l: 27, h: 0.13 },
  { a: 1.85, l: 16, h: 0.07 },
  { a: 2.6, l: 9.5, h: 0.04 },
];
for (const w of WAVES) {
  w.k = (Math.PI * 2) / w.l;
  w.w = Math.sqrt(9.81 * w.k);
  w.dx = Math.cos(w.a);
  w.dz = Math.sin(w.a);
}

export const waterState = { amp: 1 };

/** Altura de la superficie del mar en (x,z) en el tiempo t (coincide con el shader). */
export function waveHeight(x, z, t) {
  let h = 0;
  for (let i = 0; i < 2; i++) {
    const w = WAVES[i];
    h += w.h * waterState.amp * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t);
  }
  return WATER_LEVEL + h;
}

/** Pendiente de la superficie (para inclinar lanchas). */
export function waveSlope(x, z, t) {
  let sx = 0, sz = 0;
  for (let i = 0; i < 2; i++) {
    const w = WAVES[i];
    const c = w.h * waterState.amp * w.k * Math.cos(w.k * (w.dx * x + w.dz * z) - w.w * t);
    sx += c * w.dx;
    sz += c * w.dz;
  }
  return { sx, sz };
}

const REGION = { x0: -900, z0: -900, x1: 1500, z1: 1100, res: 4 };

function makeDepthTexture() {
  const w = Math.ceil((REGION.x1 - REGION.x0) / REGION.res);
  const h = Math.ceil((REGION.z1 - REGION.z0) / REGION.res);
  const data = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const x = REGION.x0 + (i + 0.5) * REGION.res, z = REGION.z0 + (j + 0.5) * REGION.res;
      const d = Math.min(10, Math.max(0, WATER_LEVEL - terrainHeight(x, z)));
      data[j * w + i] = Math.round((d / 10) * 255);
    }
  const tex = new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const WAVE_GLSL = WAVES.map((w, i) => `const vec4 W${i} = vec4(${w.dx.toFixed(5)}, ${w.dz.toFixed(5)}, ${w.k.toFixed(5)}, ${w.w.toFixed(5)}); const float H${i} = ${w.h.toFixed(4)};`).join('\n');

export class Ocean {
  constructor(engine, lib) {
    this.engine = engine;
    this.depthTex = makeDepthTexture();
    this.uAmp = { value: 1 };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, depthWrite: true });
    lib.register(mat, {
      key: 'ocean',
      uniforms: {
        uDepthTex: { value: this.depthTex },
        uRegion: { value: new THREE.Vector4(REGION.x0, REGION.z0, REGION.x1 - REGION.x0, REGION.z1 - REGION.z0) },
        uAmp: this.uAmp,
        uSunDirW: U.uSunDir,
      },
      vertexHead: `uniform float uAmp; ${WAVE_GLSL}`,
      vertexBegin: `
        {
          vec4 wpp = modelMatrix * vec4(transformed, 1.0);
          float hh = 0.;
          hh += H0 * uAmp * sin(W0.z * dot(W0.xy, wpp.xz) - W0.w * uTime);
          hh += H1 * uAmp * sin(W1.z * dot(W1.xy, wpp.xz) - W1.w * uTime);
          transformed.y += hh;
        }`,
      fragHead: `
        uniform sampler2D uDepthTex; uniform vec4 uRegion; uniform float uAmp; uniform vec3 uSunDirW;
        ${WAVE_GLSL}
        ${'vec3 cnWorldToViewN(vec3 n){ return normalize((viewMatrix * vec4(n, 0.0)).xyz); }'}
        vec2 waveGrad(vec2 p, float t){
          vec2 g = vec2(0.);
          float c;
          c = H0 * uAmp * W0.z * cos(W0.z * dot(W0.xy, p) - W0.w * t); g += c * W0.xy;
          c = H1 * uAmp * W1.z * cos(W1.z * dot(W1.xy, p) - W1.w * t); g += c * W1.xy;
          c = H2 * uAmp * W2.z * cos(W2.z * dot(W2.xy, p) - W2.w * t); g += c * W2.xy;
          c = H3 * uAmp * W3.z * cos(W3.z * dot(W3.xy, p) - W3.w * t); g += c * W3.xy;
          return g;
        }
        float ripple(vec2 p){ return vnoise(p) * .6 + vnoise(p * 2.3 + 7.1) * .4; }
        ${GLSL_PLANAR}
      `,
      fragColor: `
        vec2 p = vWPos.xz;
        vec2 ruv = (p - uRegion.xy) / uRegion.zw;
        float depth = 10.;
        if (ruv.x > 0. && ruv.x < 1. && ruv.y > 0. && ruv.y < 1.) depth = texture2D(uDepthTex, ruv).r * 10.;
        vec2 g = waveGrad(p, uTime);
        // ondulación fina animada (diferencias finitas)
        float e = .35;
        vec2 rp1 = p * .55 + vec2(uTime * .6, uTime * .35);
        vec2 rp2 = p * 1.3 - vec2(uTime * .4, -uTime * .7);
        float r0 = ripple(rp1) + ripple(rp2) * .5;
        float rx = ripple(rp1 + vec2(e * .55, 0.)) + ripple(rp2 + vec2(e * 1.3, 0.)) * .5;
        float rz = ripple(rp1 + vec2(0., e * .55)) + ripple(rp2 + vec2(0., e * 1.3)) * .5;
        g += vec2(rx - r0, rz - r0) * (.35 + uWind * .5) * (1. + uRain * .8);
        vec3 wN = normalize(vec3(-g.x, 1., -g.y));
        float shallow = exp(-depth * .38);
        vec3 deepC = vec3(.004, .03, .055);
        vec3 midC = vec3(.01, .11, .13);
        vec3 shalC = vec3(.06, .32, .3);
        vec3 wc = mix(deepC, midC, exp(-depth * .12));
        wc = mix(wc, shalC, shallow);
        wc *= 1. - uNight * .6;
        // espuma en la costa y crestas con viento
        float shore = smoothstep(.9, .0, depth);
        float fn = vnoise(p * .9 + vec2(uTime * .3, -uTime * .2)) * vnoise(p * 2.7 - uTime * .25);
        float band = sin(depth * 9. - uTime * 2.2 + fn * 3.) * .5 + .5;
        float foam = shore * smoothstep(.25, .75, fn + band * .5) ;
        float crest = smoothstep(.35, .55, length(g)) * smoothstep(.55, 1., uWind) * smoothstep(.3, .7, fn);
        foam = clamp(foam + crest * .6, 0., 1.);
        float alpha = clamp(.42 + depth * .45, 0., .97);
        alpha = max(alpha, foam * .95);
        diffuseColor.rgb = mix(wc, vec3(.85, .88, .9) * (1. - uNight * .75), foam);
        diffuseColor.a = alpha;
        float wFoam = foam;
        float wCrest = clamp(dot(g, g) * 4., 0., 1.);
      `,
      fragRoughness: 'roughnessFactor = mix(.035 + uWind * .05 + uRain * .08, .8, wFoam);',
      fragNormal: 'normal = cnWorldToViewN(normalize(mix(wN, vec3(0., 1., 0.), wFoam * .6)));',
      fragPostLights: `
        if (uReflOn > .5) {
          vec3 Vr = normalize(cameraPosition - vWPos);
          float NoVr = max(dot(Vr, wN), 0.);
          float Fr = .02 + .98 * pow(1. - NoVr, 5.);
          vec3 pr = planarRefl(vWPos, wN * 2.5, .06);
          reflectedLight.indirectSpecular = mix(reflectedLight.indirectSpecular, pr * Fr, (1. - wFoam) * .8);
        }`,
      fragEmissive: `
        {
          vec3 Vv = normalize(cameraPosition - vWPos);
          float sss = pow(max(dot(-Vv, uSunDirW), 0.), 4.) * (.3 + wCrest) * (1. - uNight) * (1. - wFoam);
          totalEmissiveRadiance += vec3(.05, .35, .3) * sss * .6;
        }`,
    });
    this.material = mat;
    const geo = new THREE.PlaneGeometry(3200, 3200, 140, 140);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = WATER_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.renderOrder = 2;
    this.mesh.userData.treatAsOpaque = true;
    this.mesh.frustumCulled = false;
    engine.scene.add(this.mesh);
  }

  update(camera, wind) {
    // La malla sigue a la cámara en pasos de la grilla (16 m) para no "nadar"
    const step = 16;
    this.mesh.position.x = Math.round(camera.position.x / step) * step;
    this.mesh.position.z = Math.round(camera.position.z / step) * step;
    const amp = 0.7 + wind * 1.5;
    this.uAmp.value = amp;
    waterState.amp = amp;
  }
}

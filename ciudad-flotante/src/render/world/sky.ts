/**
 * CIELO: cúpula con degradado cenit/horizonte (más cálido hacia el sol al atardecer), banda de
 * bruma que casa exactamente con el color de la niebla en el horizonte (el borde del océano se
 * funde con el cielo), disco solar con halo, luna con fase y estrellas que titilan.
 *
 * La cúpula y las estrellas acompañan a la cámara y se dibujan antes que todo, sin escribir
 * profundidad. Escriben directamente en sRGB (sin tone mapping) para que el horizonte coincida
 * con `scene.fog`, que three.js también aplica en sRGB y después del tone mapping.
 */
import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import { toSRGB } from './atmosphere';

const DOME_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHorizonSun;
uniform vec3 uFog;
uniform vec3 uSunCol;
uniform vec3 uMoonCol;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uGolden;
uniform float uSunDisk;
uniform float uMoonDisk;
uniform float uMoonPhase;
uniform float uFogAmt;
uniform float uFlash;
uniform float uAurora;
uniform float uTime;
varying vec3 vDir;

void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec2 hd = d.xz / max(length(d.xz), 1e-4);
  vec2 hs = uSunDir.xz / max(length(uSunDir.xz), 1e-4);
  float sunward = pow(dot(hd, hs) * 0.5 + 0.5, 2.5);
  vec3 hor = mix(uHorizon, uHorizonSun, sunward);
  float t = pow(clamp(y, 0.0, 1.0), 0.42);
  vec3 col = mix(hor, uZenith, smoothstep(0.0, 1.0, t));
  // Resplandor cálido sobre el horizonte del lado del sol (atardecer).
  col = mix(col, uHorizonSun, uGolden * sunward * (1.0 - smoothstep(0.0, 0.35, y)) * 0.6);

  // Aurora boreal (Corriente Boreal, de noche y con cielo limpio): cortinas verdes y violetas
  // hacia popa-babor que ondulan despacio.
  if (uAurora > 0.001) {
    float az = atan(d.z, d.x);
    float sector = smoothstep(1.9, 0.9, abs(mod(az - 2.4 + 3.14159, 6.28318) - 3.14159));
    // Base ondulada de la cortina y rayos verticales.
    float yb = 0.13 + 0.05 * sin(az * 2.3 + uTime * 0.05) + 0.025 * sin(az * 5.7 - uTime * 0.09);
    float above = y - yb;
    float body = smoothstep(-0.06, 0.012, above) * exp(-max(above, 0.0) / 0.13);
    float rays = 0.55 + 0.45 * sin(az * 70.0 + uTime * 0.35 + sin(az * 11.0 + uTime * 0.1) * 2.5);
    float curtain = body * rays * sector;
    vec3 auroraCol = mix(vec3(0.2, 0.95, 0.55), vec3(0.6, 0.3, 0.85), smoothstep(0.0, 0.22, above));
    col += auroraCol * curtain * uAurora * 0.32;
  }

  // Luna con fase.
  float cm = dot(d, uMoonDir);
  col += uMoonCol * pow(max(cm, 0.0), 90.0) * 0.18 * uMoonDisk;
  float mr = 0.026;
  float md = smoothstep(cos(mr), cos(mr * 0.86), cm);
  if (md > 0.0 && uMoonDisk > 0.0) {
    vec3 right = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
    vec3 up = cross(right, uMoonDir);
    vec2 uv = vec2(dot(d, right), dot(d, up)) / mr;
    float k = cos(uMoonPhase * 6.2831853);
    float side = uMoonPhase < 0.5 ? uv.x : -uv.x;
    float lit = smoothstep(-0.08, 0.08, side - k * sqrt(max(0.0, 1.0 - uv.y * uv.y)));
    // Mares lunares: manchas suaves fijas.
    float spots = 1.0 - 0.16 * (smoothstep(0.38, 0.18, length(uv - vec2(-0.25, 0.28))) + smoothstep(0.32, 0.12, length(uv - vec2(0.3, -0.05))) + smoothstep(0.24, 0.08, length(uv - vec2(-0.1, -0.42))));
    vec3 moon = mix(col * 0.75 + vec3(0.03, 0.04, 0.06), uMoonCol * spots, lit);
    col = mix(col, moon, md * uMoonDisk);
  }

  // Por debajo del horizonte y en la franja baja: color exacto de la niebla.
  col = mix(uFog, col, smoothstep(-0.015, 0.07, y));
  // Niebla densa del clima: todo el cielo se vuelve bruma.
  col = mix(col, uFog, uFogAmt * (0.75 + 0.25 * (1.0 - smoothstep(0.0, 0.7, y))));
  // Sol (después de la bruma: se pone "dentro" de ella pero sin volverse gris).
  float cs = dot(d, uSunDir);
  float above = smoothstep(-0.03, 0.01, y);
  float halo = pow(max(cs, 0.0), 10.0) * (0.1 + 0.4 * uGolden) + pow(max(cs, 0.0), 400.0) * 0.4;
  col += uSunCol * halo * uSunDisk * (0.4 + 0.6 * above);
  float disk = smoothstep(0.99935, 0.99958, cs) * above;
  col = mix(col, min(vec3(1.0), uSunCol * 1.15 + 0.25), disk * uSunDisk);
  col += uFlash * vec3(0.3, 0.33, 0.42) * (0.5 + 0.5 * y);
  gl_FragColor = vec4(col, 1.0);
}
`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute float aSeed;
uniform float uAlpha;
uniform float uTime;
uniform float uPix;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w * 0.99999;
  gl_PointSize = aSize * uPix;
  float tw = 0.7 + 0.3 * sin(uTime * (1.3 + aSeed * 2.0) + aSeed * 40.0);
  vec3 wp = (modelMatrix * vec4(position, 0.0)).xyz;
  vA = uAlpha * tw * smoothstep(-0.01, 0.12, normalize(wp).y);
}
`;

const STAR_FRAG = /* glsl */ `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  if (r > 0.5) discard;
  gl_FragColor = vec4(vec3(1.0, 0.97, 0.9), vA * (1.0 - smoothstep(0.15, 0.5, r)));
}
`;

export class Sky {
  readonly group = new THREE.Group();
  private dome: THREE.Mesh;
  private stars: THREE.Points;
  private starGroup = new THREE.Group();
  private domeMat: THREE.ShaderMaterial;
  private starMat: THREE.ShaderMaterial;
  private time = 0;

  constructor() {
    this.group.name = 'cielo';
    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: DOME_VERT,
      fragmentShader: DOME_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uZenith: { value: new THREE.Vector3() },
        uHorizon: { value: new THREE.Vector3() },
        uHorizonSun: { value: new THREE.Vector3() },
        uFog: { value: new THREE.Vector3() },
        uSunCol: { value: new THREE.Vector3() },
        uMoonCol: { value: new THREE.Vector3() },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uGolden: { value: 0 },
        uSunDisk: { value: 1 },
        uMoonDisk: { value: 0 },
        uMoonPhase: { value: 0.5 },
        uFogAmt: { value: 0 },
        uFlash: { value: 0 },
        uAurora: { value: 0 },
        uTime: { value: 0 },
      },
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.domeMat);
    this.dome.name = 'cupula';
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // Estrellas en toda la esfera (el cielo gira e inclina su eje: cualquier zona puede quedar arriba);
    // las que caen bajo el horizonte se desvanecen en el shader.
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const size = new Float32Array(N);
    const seed = new Float32Array(N);
    let s = 12345;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < N; i++) {
      const y = rnd() * 2 - 1;
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      pos[i * 3] = Math.cos(a) * r * 900;
      pos[i * 3 + 1] = y * 900;
      pos[i * 3 + 2] = Math.sin(a) * r * 900;
      const m = rnd();
      size[i] = m > 0.985 ? 3.2 : m > 0.9 ? 2.3 : 1.5;
      seed[i] = rnd();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uAlpha: { value: 0 }, uTime: { value: 0 }, uPix: { value: 1 } },
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.name = 'estrellas';
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -99;
    this.starGroup.add(this.stars);
    // Eje de giro del cielo nocturno inclinado (polo celeste hacia popa).
    this.starGroup.rotation.set(0.5, 0, 0.35);
    this.group.add(this.starGroup);
  }

  /** Intensidad deseada de la aurora (0..1); se suaviza aquí. */
  aurora = 0;
  private auroraNow = 0;

  update(atm: Atmosphere, camPos: THREE.Vector3, dtReal: number, timeOfDay: number, pixelRatio: number): void {
    this.time += dtReal;
    this.group.position.copy(camPos);
    const u = this.domeMat.uniforms;
    toSRGB(atm.zenith, u.uZenith!.value as THREE.Vector3);
    toSRGB(atm.horizon, u.uHorizon!.value as THREE.Vector3);
    toSRGB(atm.horizonSun, u.uHorizonSun!.value as THREE.Vector3);
    toSRGB(atm.fogColor, u.uFog!.value as THREE.Vector3);
    toSRGB(atm.sunColor, u.uSunCol!.value as THREE.Vector3);
    toSRGB(atm.moonColor, u.uMoonCol!.value as THREE.Vector3);
    (u.uSunDir!.value as THREE.Vector3).copy(atm.sunDir);
    (u.uMoonDir!.value as THREE.Vector3).copy(atm.moonDir);
    u.uGolden!.value = atm.golden;
    u.uSunDisk!.value = atm.sunDisk;
    u.uMoonDisk!.value = atm.moonDisk;
    u.uMoonPhase!.value = atm.moonPhase;
    u.uFogAmt!.value = atm.fogAmount;
    u.uFlash!.value = atm.flash;
    const auroraTarget = this.aurora * THREE.MathUtils.smoothstep(atm.starAlpha, 0.2, 0.8);
    this.auroraNow += (auroraTarget - this.auroraNow) * Math.min(1, dtReal * 0.2);
    u.uAurora!.value = this.auroraNow;
    u.uTime!.value = this.time % 10000;
    // Estrellas: giran con la hora (una vuelta al día).
    const su = this.starMat.uniforms;
    su.uAlpha!.value = atm.starAlpha;
    su.uTime!.value = this.time % 1000;
    su.uPix!.value = pixelRatio;
    this.stars.visible = atm.starAlpha > 0.01;
    this.stars.rotation.y = (timeOfDay / 24) * Math.PI * 2;
  }

  dispose(): void {
    this.dome.geometry.dispose();
    this.domeMat.dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
  }
}

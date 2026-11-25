// Cielo físico (Preetham), sol, luna, estrellas, nubes, ciclo día/noche, clima e iluminación global.
import * as THREE from 'three';
import { U } from './shaders.js';
import { clamp, lerp, smoothstep, damp } from '../core/utils.js';

const LAT = 25 * Math.PI / 180;
const POLE = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)).normalize();

export const WEATHERS = {
  despejado: { name: 'Despejado', icon: 'sun', cloud: 0.22, dark: 0, rain: 0, fog: 1.0, wind: 0.3, wet: 0, lightning: 0, turbidity: 2.4, sun: 1.0 },
  nublado: { name: 'Nublado', icon: 'cloud', cloud: 0.68, dark: 0.25, rain: 0, fog: 1.4, wind: 0.5, wet: 0, lightning: 0, turbidity: 4.5, sun: 0.55 },
  lluvia: { name: 'Lluvia', icon: 'rain', cloud: 0.94, dark: 0.6, rain: 0.65, fog: 2.4, wind: 0.65, wet: 1, lightning: 0, turbidity: 8, sun: 0.18 },
  tormenta: { name: 'Tormenta', icon: 'storm', cloud: 1.0, dark: 0.82, rain: 1.0, fog: 3.0, wind: 1.0, wet: 1, lightning: 1, turbidity: 10, sun: 0.1 },
  niebla: { name: 'Niebla', icon: 'fog', cloud: 0.55, dark: 0.2, rain: 0, fog: 7.0, wind: 0.12, wet: 0.35, lightning: 0, turbidity: 9, sun: 0.45 },
};
const WEATHER_CHAIN = {
  despejado: [['despejado', 4], ['nublado', 3], ['niebla', 0.6]],
  nublado: [['despejado', 3], ['nublado', 1.5], ['lluvia', 2.5], ['niebla', 0.6]],
  lluvia: [['nublado', 2], ['lluvia', 1], ['tormenta', 1.5]],
  tormenta: [['lluvia', 3], ['nublado', 1]],
  niebla: [['despejado', 2], ['nublado', 2]],
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w;
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSun; uniform vec3 uMoon; uniform float uTurb; uniform float uRay; uniform float uMie; uniform float uMieG;
uniform float uCloud; uniform float uDark; uniform float uNightK; uniform float uT; uniform mat3 uStarRot;
uniform float uMoonPhase; uniform float uFlash; uniform float uEnv; uniform vec3 uCityGlow; uniform float uSkyMul;
uniform vec3 uSunCol; uniform vec3 uCloudAmb; uniform vec2 uWindOff;
uniform float uFogDensity; uniform float uFogFalloff; uniform vec3 uFogColor; uniform vec3 uFogSunColor;
uniform float uHdrK; uniform sampler2D uHdrBg0; uniform sampler2D uHdrBg1; uniform sampler2D uHdrBg2;
uniform sampler2D uHdrEnv0; uniform sampler2D uHdrEnv1; uniform sampler2D uHdrEnv2;
uniform vec3 uHdrWbg; uniform vec3 uHdrWenv; uniform vec3 uHdrBgOn; uniform vec3 uHdrYaw; uniform vec3 uSunDisk;
varying vec3 vDir;
const float PI = 3.141592653589793;
// cielo fotografiado: fondo equirectangular de +90° a -11,25° (sin costura en el salto del azimut)
vec3 hdrBg(sampler2D t, vec3 d, float yaw){
  float u = (atan(d.z, d.x) - yaw) / 6.2831853 + .5;
  float v = (degrees(asin(clamp(d.y, -1., 1.))) + 11.25) / 101.25;
  vec2 uv = vec2(fract(u), v), uv2 = vec2(fract(u + .5) - .5, v);
  vec2 dx = dFdx(uv), dy = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  if (dot(dx, dx) + dot(dy, dy) > dot(dx2, dx2) + dot(dy2, dy2)) { dx = dx2; dy = dy2; }
  return textureGrad(t, uv, dx, dy).rgb;
}
vec3 hdrEnv(sampler2D t, vec3 d, float yaw){
  float u = (atan(d.z, d.x) - yaw) / 6.2831853 + .5;
  float v = (degrees(asin(clamp(d.y, -1., 1.))) + 90.) / 180.;
  return texture2D(t, vec2(fract(u), v)).rgb;
}
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
float h13(vec3 p3){ p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(h12(i), h12(i + vec2(1, 0)), u.x), mix(h12(i + vec2(0, 1)), h12(i + vec2(1, 1)), u.x), u.y); }
float fbmC(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 6; i++){ s += a * vn(p); p = p * 2.02 + vec2(13.1, 7.7); a *= .5; } return s; }
float sunIntensity(float zc){ zc = clamp(zc, -1., 1.); return 1000. * max(0., 1. - exp(-((1.6110731556870734 - acos(zc)) / 1.5))); }
vec3 preetham(vec3 dir, vec3 sun){
  float sunE = sunIntensity(sun.y);
  vec3 betaR = totalRayleigh * uRay;
  float c = (0.2 * uTurb) * 10E-18;
  vec3 betaM = 0.434 * c * MieConst * uMie;
  float zen = acos(max(0., dir.y));
  float inv = 1. / (cos(zen) + .15 * pow(93.885 - (zen * 180. / PI), -1.253));
  vec3 Fex = exp(-(betaR * 8.4E3 * inv + betaM * 1.25E3 * inv));
  float cosT = dot(dir, sun);
  float rPhase = 0.05968310365946075 * (1. + pow(cosT * .5 + .5, 2.));
  float g2 = uMieG * uMieG;
  float mPhase = 0.07957747154594767 * ((1. - g2) / pow(1. - 2. * uMieG * cosT + g2, 1.5));
  vec3 ratio = (betaR * rPhase + betaM * mPhase) / (betaR + betaM);
  vec3 Lin = pow(sunE * ratio * (1. - Fex), vec3(1.5));
  Lin *= mix(vec3(1.), pow(sunE * ratio * Fex, vec3(.5)), clamp(pow(1. - sun.y, 5.), 0., 1.));
  vec3 L0 = vec3(.1) * Fex;
  float disk = smoothstep(0.99995, 0.99997, cosT);
  L0 += (sunE * 19000. * Fex) * disk * (uEnv > .5 ? .015 : 1.) * (1. - uCloud * .9);
  vec3 tex = (Lin + L0) * .04 + vec3(0., .0003, .00075);
  return pow(tex, vec3(1. / 2.4));
}
void main(){
  vec3 dir = normalize(vDir);
  vec3 col = preetham(vec3(dir.x, max(dir.y, .003), dir.z), uSun) * uSkyMul;
  // gris de nubosidad densa
  float lum = dot(col, vec3(.3, .55, .15));
  col = mix(col, vec3(lum) * vec3(.92, .95, 1.), uDark * .8);
  col *= 1. - uDark * .55;
  // cielo nocturno
  float elev = dir.y;
  vec3 night = mix(vec3(.006, .008, .016), vec3(.0012, .0018, .005), smoothstep(0., .45, elev));
  night += uCityGlow * exp(-max(elev, 0.) * 7.) * (1. + uCloud * 1.6);
  vec3 sd = uStarRot * dir;
  float stars = 0.;
  if (elev > 0.) {
    vec3 cell = floor(sd * 220.);
    float h = h13(cell);
    vec3 fc = fract(sd * 220.) - .5;
    float st = smoothstep(.08, .0, length(fc - (vec3(h13(cell + 1.), h13(cell + 2.), h13(cell + 3.)) - .5) * .7));
    stars = step(.996, h) * st * (.4 + 1.6 * h13(cell + 9.)) * (.75 + .25 * sin(uT * (3. + 7. * h) + h * 50.));
    // vía láctea tenue
    float band = exp(-pow(dot(sd, normalize(vec3(.3, .2, .93))) * 4., 2.));
    night += vec3(.012, .013, .02) * band * fbmC(sd.xy * 6. + sd.z * 3.) * smoothstep(0., .3, elev);
    stars *= smoothstep(0., .25, elev);
  }
  night += vec3(.9, .95, 1.) * stars * .5 * (1. - uCloud);
  // luna
  float mc = dot(dir, uMoon);
  float moonDisk = smoothstep(.99955, .99965, mc);
  vec3 mUp = normalize(cross(uMoon, vec3(0., 1., 0.)) + 1e-4);
  vec3 mRight = cross(uMoon, mUp);
  vec2 mq = vec2(dot(dir - uMoon, mUp), dot(dir - uMoon, mRight)) / .0265;
  float phaseLit = smoothstep(-.1, .1, mq.x * cos(uMoonPhase * 6.2831) + sqrt(max(1. - dot(mq, mq), 0.)) * sin(uMoonPhase * 6.2831) * 1.);
  float crater = .75 + .25 * fbmC(mq * 3. + 4.);
  vec3 moonCol = vec3(1.0, .97, .9) * 2.2 * crater * (.08 + .92 * phaseLit) * moonDisk;
  float moonGlow = pow(max(mc, 0.), 600.) * .25 + pow(max(mc, 0.), 40.) * .04;
  night += moonCol * (1. - uCloud * .85) + vec3(.55, .62, .8) * moonGlow * (1. - uCloud * .5);
  col = mix(col, night, uNightK) + col * (1. - uNightK) * 0.;
  col = max(col, night * uNightK);
  // nubes
  if (dir.y > 0.) {
    float t = (1600.) / max(dir.y, .02);
    vec2 cp = (dir.xz * t) * .00042 + uWindOff;
    float d = fbmC(cp);
    float cov = smoothstep(1. - uCloud * .85 - .12, 1. - uCloud * .85 + .22, d);
    float dens = cov * smoothstep(.0, .14, dir.y);
    // sombreado: densidad hacia el sol
    float ds = fbmC(cp + uSun.xz * .03);
    float shade = clamp(1. - (ds - d) * 3.5, .35, 1.25);
    float silver = pow(max(dot(dir, uSun), 0.), 12.) * (1. - cov) * 2.5;
    vec3 sunLit = uSunCol * (.55 * shade + silver);
    vec3 cloudCol = uCloudAmb * (.8 + .4 * shade) + sunLit * (1. - uNightK);
    cloudCol = mix(cloudCol, cloudCol * vec3(.45, .47, .52), uDark);
    // de noche: luna y resplandor urbano desde abajo
    vec3 nightCloud = uCityGlow * 2.2 * (1.2 - d * .6) + vec3(.03, .035, .05) * (1. - uDark) * pow(max(mc, 0.), 4.);
    cloudCol = mix(cloudCol, nightCloud, uNightK);
    cloudCol += vec3(.7, .75, 1.) * uFlash * 6. * cov;
    col = mix(col, cloudCol, clamp(dens * (.65 + .35 * uCloud), 0., 1.));
  }
  // de día: el cielo fotografiado reemplaza al procedural (que queda para la noche)
  if (uHdrK > 0.) {
    vec3 hd;
    if (uEnv > .5) {
      hd = uHdrWenv.x * hdrEnv(uHdrEnv0, dir, uHdrYaw.x) + uHdrWenv.y * hdrEnv(uHdrEnv1, dir, uHdrYaw.y) + uHdrWenv.z * hdrEnv(uHdrEnv2, dir, uHdrYaw.z);
    } else {
      hd = vec3(0.);
      if (uHdrWbg.x > 0.) hd += uHdrBgOn.x > .5 ? uHdrWbg.x * hdrBg(uHdrBg0, dir, uHdrYaw.x) : uHdrWenv.x * hdrEnv(uHdrEnv0, dir, uHdrYaw.x);
      if (uHdrWbg.y > 0.) hd += uHdrBgOn.y > .5 ? uHdrWbg.y * hdrBg(uHdrBg1, dir, uHdrYaw.y) : uHdrWenv.y * hdrEnv(uHdrEnv1, dir, uHdrYaw.y);
      if (uHdrWbg.z > 0.) hd += uHdrBgOn.z > .5 ? uHdrWbg.z * hdrBg(uHdrBg2, dir, uHdrYaw.z) : uHdrWenv.z * hdrEnv(uHdrEnv2, dir, uHdrYaw.z);
      hd += uSunDisk * smoothstep(.99995, .99998, dot(dir, uSun));
    }
    col = mix(col, hd, uHdrK);
  }
  col += vec3(.6, .65, .9) * uFlash * 1.5;
  // fundido con la niebla del horizonte
  float b = uFogFalloff;
  float dist = 9000.;
  float k = b * dir.y * dist;
  float fo = abs(k) < 1e-3 ? dist : (1. - exp(-k)) / (b * dir.y);
  float fogF = 1. - exp(-uFogDensity * exp(-b * max(cameraPosition.y, -2.)) * fo);
  float s = max(dot(dir, uSun), 0.);
  vec3 fogC = mix(uFogColor, uFogSunColor, pow(s, 7.) * .9);
  col = mix(col, fogC, fogF * smoothstep(.45, -.02, dir.y));
  if (dir.y < 0.) col = mix(col, fogC, smoothstep(0., -.05, dir.y));
  gl_FragColor = vec4(col, 1.);
}
`;

// Port JS del modelo de Preetham (para colores de niebla e iluminación coherentes con el cielo)
const TR = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MC = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
function preethamJS(dir, sun, turb, ray, mie, mieG, out) {
  const sunE = 1000 * Math.max(0, 1 - Math.exp(-((1.6110731556870734 - Math.acos(clamp(sun.y, -1, 1))) / 1.5)));
  const c = 0.2 * turb * 10e-18;
  const zen = Math.acos(Math.max(0, dir.y));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
  const cosT = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
  const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
  const g2 = mieG * mieG;
  const mPhase = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * mieG * cosT + g2, 1.5));
  const k5 = clamp(Math.pow(1 - sun.y, 5), 0, 1);
  const add = [0, 0.0003, 0.00075];
  for (let i = 0; i < 3; i++) {
    const bR = TR[i] * ray, bM = 0.434 * c * MC[i] * mie;
    const Fex = Math.exp(-(bR * 8.4e3 * inv + bM * 1.25e3 * inv));
    const ratio = (bR * rPhase + bM * mPhase) / (bR + bM);
    let Lin = Math.pow(sunE * ratio * (1 - Fex), 1.5);
    Lin *= lerp(1, Math.pow(sunE * ratio * Fex, 0.5), k5);
    const tex = (Lin + 0.1 * Fex) * 0.04 + add[i];
    out[i] = Math.pow(tex, 1 / 2.4);
  }
  return out;
}
function transmittanceJS(sun, turb, ray, mie, out) {
  const c = 0.2 * turb * 10e-18;
  const zen = Math.acos(clamp(sun.y, 0.0, 1));
  const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(Math.max(93.885 - (zen * 180) / Math.PI, 0.5), -1.253));
  for (let i = 0; i < 3; i++) {
    const bR = TR[i] * ray, bM = 0.434 * c * MC[i] * mie;
    out[i] = Math.exp(-(bR * 8.4e3 * inv + bM * 1.25e3 * inv));
  }
  return out;
}

/** Color del sol tras la atmósfera (mismo modelo que tools/sky/make_sky.py). */
function sunColorModel(el, out) {
  const e = Math.max(el, 0.5);
  const am = 1 / (Math.sin(e * Math.PI / 180) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
  const t = [0.65, 0.55, 0.45].map((l) => Math.exp(-am * (0.0088 * Math.pow(l, -4.05) + 0.09)));
  const m = Math.max(...t);
  return out.setRGB(t[0] / m, t[1] / m, t[2] / m);
}

function rotateAround(v, axis, ang, out) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = v.dot(axis);
  const cr = new THREE.Vector3().crossVectors(axis, v);
  out.copy(v).multiplyScalar(c).addScaledVector(cr, s).addScaledVector(axis, d * (1 - c));
  return out;
}

export class Sky {
  constructor(engine) {
    this.engine = engine;
    this.time = 18.2; // hora del día
    this.day = 1;
    this.timeScale = 1 / 60; // horas de juego por segundo real (1 día = 24 min)
    this.paused = false;
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.weatherId = 'despejado';
    this.target = { ...WEATHERS.despejado };
    this.w = { ...WEATHERS.despejado };
    this.nextWeatherIn = 5 + Math.random() * 6; // horas de juego
    this.wet = 0;
    this.flash = 0;
    this.flashTimer = 6;
    this.windOff = new THREE.Vector2();
    this.nightK = 0;
    this.envTimer = 0;
    this._lastEnvSun = new THREE.Vector3(0, -2, 0);
    this._lastEnvW = -1;
    this.listeners = new Set();
    this._tmp = [0, 0, 0];
    this._tmp2 = [0, 0, 0];

    this.uniforms = {
      uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, -1, 0) },
      uTurb: { value: 2.4 }, uRay: { value: 1.6 }, uMie: { value: 0.005 }, uMieG: { value: 0.8 },
      uCloud: { value: 0.2 }, uDark: { value: 0 }, uNightK: { value: 0 }, uT: { value: 0 },
      uStarRot: { value: new THREE.Matrix3() }, uMoonPhase: { value: 0.3 }, uFlash: { value: 0 },
      uCityGlow: { value: new THREE.Color(0.05, 0.03, 0.018) }, uSkyMul: { value: 1 },
      uSunCol: { value: new THREE.Color(1, 1, 1) }, uCloudAmb: { value: new THREE.Color(0.5, 0.55, 0.6) },
      uWindOff: { value: this.windOff },
      uFogDensity: U.uFogDensity, uFogFalloff: U.uFogFalloff, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor,
      uHdrK: { value: 0 }, uHdrBg0: { value: null }, uHdrBg1: { value: null }, uHdrBg2: { value: null },
      uHdrEnv0: { value: null }, uHdrEnv1: { value: null }, uHdrEnv2: { value: null },
      uHdrWbg: { value: new THREE.Vector3() }, uHdrWenv: { value: new THREE.Vector3() }, uHdrBgOn: { value: new THREE.Vector3() },
      uHdrYaw: { value: new THREE.Vector3() }, uSunDisk: { value: new THREE.Color(0, 0, 0) },
    };
    this.hdri = null;
    const mkMat = (env) => new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uEnv: { value: env } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mkMat(0));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.scale.setScalar(5000);
    engine.scene.add(this.dome);
    // Escena para el mapa de entorno (IBL)
    this.envScene = new THREE.Scene();
    this.envDome = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mkMat(1));
    this.envDome.scale.setScalar(100);
    this.envScene.add(this.envDome);
    this.pmrem = new THREE.PMREMGenerator(engine.renderer);
    this.envRT = null;

    // Luces
    this.hemi = new THREE.HemisphereLight(0x9fc4ff, 0x4a4036, 0.5);
    engine.scene.add(this.hemi);
    this.update(0, true);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setTime(h) {
    this.time = ((h % 24) + 24) % 24;
    this.update(0, true);
  }

  setWeather(id, instant = false) {
    if (!WEATHERS[id]) return;
    this.weatherId = id;
    this.target = { ...WEATHERS[id] };
    if (instant) {
      this.w = { ...WEATHERS[id] };
      this.wet = this.w.wet;
    }
    this.nextWeatherIn = 6 + Math.random() * 10;
    for (const fn of this.listeners) fn({ type: 'weather', id });
  }

  get hoursText() {
    const h = Math.floor(this.time), m = Math.floor((this.time - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  get isNight() {
    return this.nightK > 0.5;
  }

  _celestial() {
    // Sol: declinación 12°, ángulo horario por la hora del día
    const H = ((this.time - 12) / 24) * Math.PI * 2;
    const dec = 12 * Math.PI / 180;
    const alt0 = Math.PI / 2 - LAT + dec;
    const noon = new THREE.Vector3(0, Math.sin(alt0), Math.cos(alt0));
    rotateAround(noon, POLE, -H, this.sunDir);
    this.sunDir.normalize();
    // Luna: desfasada según el día (ciclo de 8 días de juego)
    const phase = ((this.day % 8) + this.time / 24) / 8;
    const Hm = H + Math.PI + phase * Math.PI * 2 * 0.15;
    const decm = -6 * Math.PI / 180;
    const altm = Math.PI / 2 - LAT + decm;
    const noonM = new THREE.Vector3(0, Math.sin(altm), Math.cos(altm));
    rotateAround(noonM, POLE, -Hm, this.moonDir);
    this.moonDir.normalize();
    this.uniforms.uMoonPhase.value = phase;
    // Rotación de estrellas
    const ang = (this.time / 24 + this.day * 0.0027) * Math.PI * 2;
    const m4 = new THREE.Matrix4().makeRotationAxis(POLE, ang);
    this.uniforms.uStarRot.value.setFromMatrix4(m4);
  }

  update(dt, force = false) {
    if (!this.paused) {
      const prevDay = this.time;
      this.time += dt * this.timeScale;
      if (this.time >= 24) {
        this.time -= 24;
        this.day++;
        for (const fn of this.listeners) fn({ type: 'day', day: this.day });
      }
      // Clima automático
      this.nextWeatherIn -= dt * this.timeScale;
      if (this.nextWeatherIn <= 0 && this.autoWeather !== false) {
        const opts = WEATHER_CHAIN[this.weatherId];
        let tot = opts.reduce((s, o) => s + o[1], 0), r = Math.random() * tot;
        let next = opts[0][0];
        for (const [id, wgt] of opts) {
          if ((r -= wgt) <= 0) {
            next = id;
            break;
          }
        }
        this.setWeather(next);
      }
    }
    // Transición suave del clima
    const k = force ? 1 : 1 - Math.exp(-dt * 0.12);
    for (const key of ['cloud', 'dark', 'rain', 'fog', 'wind', 'lightning', 'turbidity', 'sun']) this.w[key] = lerp(this.w[key], this.target[key], k);
    // Humedad: sube rápido con lluvia, seca lento
    if (this.w.rain > 0.05) this.wet = Math.min(1, this.wet + dt * 0.05 * this.w.rain);
    else this.wet = Math.max(this.target.wet * 0.5, this.wet - dt * 0.006);
    if (force) this.wet = Math.max(this.wet, this.target.wet * (this.target.rain > 0 ? 1 : 0.5));

    this._celestial();
    const sun = this.sunDir;
    const elevDeg = Math.asin(clamp(sun.y, -1, 1)) * 180 / Math.PI;
    this.elevDeg = elevDeg;
    const nightK = smoothstep(3, -9, elevDeg);
    this.nightK = nightK;
    const twilight = smoothstep(12, 0, elevDeg) * (1 - smoothstep(0, -10, elevDeg));
    this.windOff.x += dt * (0.004 + this.w.wind * 0.012);
    this.windOff.y += dt * (0.002 + this.w.wind * 0.006);

    const u = this.uniforms;
    u.uSun.value.copy(sun);
    u.uMoon.value.copy(this.moonDir);
    u.uTurb.value = this.w.turbidity;
    u.uRay.value = 1.4 + twilight * 0.8;
    u.uMie.value = 0.004 + this.w.turbidity * 0.0006;
    u.uMieG.value = 0.8;
    u.uCloud.value = this.w.cloud;
    u.uDark.value = this.w.dark;
    u.uNightK.value = nightK;
    u.uT.value += dt;
    u.uSkyMul.value = 1;
    const cg = 0.011 + this.w.fog * 0.0025 + this.w.cloud * 0.012;
    u.uCityGlow.value.setRGB(cg * 1.15, cg * 0.72, cg * 0.5);

    // Relámpagos
    if (this.w.lightning > 0.5 && !this.paused) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashTimer = 4 + Math.random() * 12;
        this.flashSeq = [0, 0.09, 0.22, 0.31].map((t) => t + Math.random() * 0.05);
        this.flashT = 0;
        const dist = Math.random();
        for (const fn of this.listeners) fn({ type: 'lightning', distance: dist });
      }
    }
    if (this.flashSeq) {
      this.flashT += dt;
      let f = 0;
      for (const t0 of this.flashSeq) f = Math.max(f, Math.exp(-Math.pow((this.flashT - t0) * 28, 2)));
      this.flash = f;
      if (this.flashT > 0.6) this.flashSeq = null;
    } else this.flash = 0;
    u.uFlash.value = this.flash;
    U.uLightning.value = this.flash;

    // Colores de sol, cielo y niebla coherentes con el modelo
    const tr = transmittanceJS({ y: Math.max(sun.y, 0.02) }, this.w.turbidity, u.uRay.value, u.uMie.value, this._tmp);
    const mx = Math.max(tr[0], tr[1], tr[2], 1e-4);
    const sunCol = new THREE.Color(tr[0] / mx, tr[1] / mx, tr[2] / mx).lerp(new THREE.Color(1, 0.93, 0.85), 0.28);
    const sunUp = smoothstep(-1.5, 6, elevDeg);
    const sunI = 4.6 * sunUp * this.w.sun * (0.6 + 0.4 * smoothstep(0, 25, elevDeg));
    u.uSunCol.value.copy(sunCol).multiplyScalar(0.9 + 0.4 * sunUp);
    const zen = preethamJS({ x: 0, y: 1, z: 0 }, sun, this.w.turbidity, u.uRay.value, u.uMie.value, 0.8, this._tmp2);
    const zenC = new THREE.Color(zen[0], zen[1], zen[2]);
    const dark = this.w.dark;
    const lum = zenC.r * 0.3 + zenC.g * 0.55 + zenC.b * 0.15;
    zenC.lerp(new THREE.Color(lum, lum, lum * 1.05), dark * 0.8).multiplyScalar(1 - dark * 0.55);
    // horizonte perpendicular al sol y hacia el sol
    const az = Math.atan2(sun.z, sun.x);
    const side = { x: Math.cos(az + Math.PI / 2) * 0.995, y: 0.06, z: Math.sin(az + Math.PI / 2) * 0.995 };
    const hz = preethamJS(side, sun, this.w.turbidity, u.uRay.value, u.uMie.value, 0.8, [0, 0, 0]);
    const toward = { x: Math.cos(az) * 0.995, y: 0.06, z: Math.sin(az) * 0.995 };
    const hs = preethamJS(toward, sun, this.w.turbidity, u.uRay.value, u.uMie.value, 0.8, [0, 0, 0]);
    const nightHz = new THREE.Color(u.uCityGlow.value.r * 1.4 + 0.004, u.uCityGlow.value.g * 1.4 + 0.006, u.uCityGlow.value.b * 1.4 + 0.012);
    const fogC = new THREE.Color(hz[0], hz[1], hz[2]).lerp(zenC.clone().multiplyScalar(1.1), 0.25).multiplyScalar(0.88);
    const fogLum = fogC.r * 0.3 + fogC.g * 0.55 + fogC.b * 0.15;
    fogC.lerp(new THREE.Color(fogLum, fogLum, fogLum * 1.04), Math.min(1, dark * 0.9 + (this.w.fog > 3 ? 0.4 : 0))).multiplyScalar(1 - dark * 0.5);
    fogC.lerp(nightHz, nightK);
    const fogS = new THREE.Color(hs[0], hs[1], hs[2]).multiplyScalar(1 - dark * 0.6);
    fogS.lerp(nightHz, nightK);
    U.uFogColor.value.copy(fogC);
    U.uFogSunColor.value.copy(fogS).lerp(fogC, dark);
    const H = this._hdriState(elevDeg, nightK);
    if (H) {
      U.uFogColor.value.lerp(H.fogC, H.k);
      U.uFogSunColor.value.lerp(H.fogS, H.k);
    }
    U.uFogDensity.value = 0.00028 * this.w.fog * (1 + nightK * 0.2);
    U.uFogFalloff.value = 0.012 / Math.sqrt(this.w.fog);
    u.uCloudAmb.value.copy(zenC).multiplyScalar(1.4).lerp(fogC, 0.4);

    // Luz direccional: sol de día, luna de noche
    const moonUp = smoothstep(-2, 8, Math.asin(clamp(this.moonDir.y, -1, 1)) * 180 / Math.PI);
    const useMoon = elevDeg < -1.5;
    const lightDir = useMoon ? this.moonDir : sun;
    const moonI = 0.22 * moonUp * (1 - this.w.cloud * 0.8);
    const lightColor = useMoon ? new THREE.Color(0.55, 0.65, 0.95) : sunCol;
    const lightI = useMoon ? moonI : sunI;
    this.light = { dir: lightDir.clone(), color: lightColor, intensity: lightI };
    if (H && !useMoon) {
      this.light.color = lightColor.clone().lerp(H.sunCol, H.k);
      this.light.intensity = lerp(lightI, H.sunI, H.k);
    }
    U.uSunDir.value.copy(sun.y > -0.1 ? sun : this.moonDir);

    // Hemisférica
    const skyAmb = zenC.clone().multiplyScalar(0.9 + dark * 0.4);
    const nightAmb = new THREE.Color(0.018, 0.022, 0.035).add(u.uCityGlow.value.clone().multiplyScalar(0.25));
    skyAmb.lerp(nightAmb, nightK);
    const groundAmb = sunCol.clone().multiplyScalar(0.18 * sunI / 4.6).add(new THREE.Color(0.02, 0.018, 0.015));
    groundAmb.lerp(new THREE.Color(0.03, 0.02, 0.014), nightK);
    this.hemi.color.copy(skyAmb);
    this.hemi.groundColor.copy(groundAmb);
    this.hemi.intensity = lerp(0.28, 0.42, nightK) * (H ? 1 - H.k : 1) + this.flash * 4;

    // Uniforms globales
    U.uNight.value = nightK;
    U.uLamps.value = smoothstep(5, -3, elevDeg) + (this.w.fog > 4 || dark > 0.5 ? 0.35 * (1 - nightK) : 0);
    U.uLamps.value = clamp(U.uLamps.value, 0, 1);
    const h = this.time;
    const lit = h >= 17 && h < 23.5 ? lerp(0.32, 0.6, smoothstep(17, 20, h)) : h >= 23.5 || h < 5 ? 0.22 : h < 8 ? lerp(0.3, 0.2, smoothstep(5, 8, h)) : 0.2;
    U.uLitWindows.value = lit;
    U.uInteriorDay.value = 0.22 * (1 - nightK) * (1 - dark * 0.5) * (0.4 + 0.6 * sunUp);
    U.uWet.value = this.wet;
    U.uRain.value = this.w.rain;
    U.uWind.value = this.w.wind;
    // Exposición (adaptación ocular)
    const dayExp = 0.62 / (0.5 + 0.5 * this.w.sun);
    const nightExp = 2.0;
    U.uExposure.value = H ? lerp(H.exp, nightExp, nightK) : lerp(dayExp, nightExp, nightK) * (1 + twilight * 0.25);

    // Mapa de entorno
    this.envTimer -= dt;
    const sunMoved = this._lastEnvSun.angleTo(sun) > 0.012;
    const wChanged = Math.abs(this._lastEnvW - (this.w.cloud + this.w.dark + nightK)) > 0.03;
    if (force || (this.envTimer <= 0 && (sunMoved || wChanged))) {
      this.envTimer = 2.5;
      this._lastEnvSun.copy(sun);
      this._lastEnvW = this.w.cloud + this.w.dark + nightK;
      this._updateEnv();
    }
    this.engine.scene.environmentIntensity = H ? lerp(1.0, 0.9, nightK) : lerp(0.55 + dark * 0.35, 0.9, nightK);
  }

  /** Mezcla de cielos fotografiados para este momento: uniforms del cielo y luz/bruma/exposición. */
  _hdriState(el, nightK) {
    const hd = this.hdri;
    const u = this.uniforms;
    if (!hd || !hd.ready) {
      u.uHdrK.value = 0;
      return null;
    }
    const weatherK = smoothstep(0.32, 0.75, this.w.cloud);
    const list = hd.mix(el, this.time < 12, weatherK, this.weatherId).slice(0, 3);
    const sunAz = Math.atan2(this.sunDir.z, this.sunDir.x);
    const st = this._hs || (this._hs = { sunCol: new THREE.Color(), fogC: new THREE.Color(), fogS: new THREE.Color(), c: new THREE.Color(), a: new THREE.Color(), s: new THREE.Color() });
    st.sunCol.setRGB(0, 0, 0);
    st.fogC.setRGB(0, 0, 0);
    st.fogS.setRGB(0, 0, 0);
    let sunI = 0, eg = 0, wsum = 0;
    const comp = ['x', 'y', 'z'];
    for (const v of [u.uHdrWbg.value, u.uHdrWenv.value, u.uHdrBgOn.value]) v.set(0, 0, 0);
    list.forEach((o, i) => {
      const e = hd.entries[o.id], m = e.meta;
      const yaw = sunAz - m.sunAzim * Math.PI / 180;
      const bg = hd.background(o.id);
      u.uHdrWbg.value[comp[i]] = o.w * o.k / m.bgScale;
      u.uHdrWenv.value[comp[i]] = o.w * o.k;
      u.uHdrBgOn.value[comp[i]] = bg ? 1 : 0;
      u.uHdrYaw.value[comp[i]] = yaw;
      u['uHdrBg' + i].value = bg;
      u['uHdrEnv' + i].value = e.env;
      const si = hd.sunIntensity(o.id, el);
      sunI += o.w * si;
      if (m.synthSun) sunColorModel(el, st.c);
      else st.c.setRGB(m.sunColor[0], m.sunColor[1], m.sunColor[2]);
      st.sunCol.add(st.c.multiplyScalar(o.w));
      hd.horizon(o.id, sunAz, yaw, st.s, st.a);
      st.fogS.add(st.s.multiplyScalar(o.w * o.k));
      st.fogC.add(st.a.multiplyScalar(o.w * o.k));
      eg += o.w * (si * Math.max(Math.sin(el * Math.PI / 180), 0) + m.skyIllum * o.k);
      wsum += o.w;
    });
    if (wsum > 0) {
      const mx = Math.max(st.sunCol.r, st.sunCol.g, st.sunCol.b, 1e-4);
      st.sunCol.multiplyScalar(1 / mx);
    }
    const k = clamp(1 - nightK * 1.15, 0, 1);
    u.uHdrK.value = k;
    u.uSunDisk.value.copy(st.sunCol).multiplyScalar(sunI * 600 * smoothstep(-0.6, 0.4, el));
    // adaptación parcial, como una cámara: el atardecer queda más oscuro que el mediodía
    const exp = clamp(0.62 * Math.pow(4.9 / Math.max(eg, 1e-3), 0.45), 0.3, 6);
    return { k, sunI, sunCol: st.sunCol, fogC: st.fogC, fogS: st.fogS, exp };
  }

  _updateEnv() {
    const old = this.envRT;
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 200);
    this.engine.scene.environment = this.envRT.texture;
    if (old) old.dispose();
  }

  /** Conecta los cielos fotografiados (ya cargados) y rehace el entorno. */
  setHdri(h) {
    this.hdri = h;
    this._lastEnvW = -1;
    this.update(0, true);
  }

  follow(camera) {
    this.dome.position.copy(camera.position);
  }

  serialize() {
    return { time: this.time, day: this.day, weather: this.weatherId };
  }
  deserialize(d) {
    if (!d) return;
    this.time = d.time ?? this.time;
    this.day = d.day ?? this.day;
    if (d.weather) this.setWeather(d.weather, true);
    this.update(0, true);
  }
}

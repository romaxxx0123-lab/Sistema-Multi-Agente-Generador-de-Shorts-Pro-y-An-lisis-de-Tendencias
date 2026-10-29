/**
 * LLUVIA: segmentos inclinados por el viento aparente (viento + avance del barco) en una caja
 * que acompaña a la cámara. Todo se anima en la GPU (posición = semilla + tiempo, envuelta).
 *
 * No llueve bajo techo: un mapa de cubiertas (altura de la losa más alta de cada columna del
 * barco, incluida la proa) oculta las gotas que quedarían bajo un techo o una cubierta. Así se
 * ve llover por la ventana sin que llueva dentro del camarote. Tampoco hay gotas bajo el agua.
 */
import * as THREE from 'three';
import type { Quality } from '../../game/types';
import { CELL, LEVEL_H, SHIP_ORIGIN_X } from '../../sim/constants';
import type { ShipLayout } from '../../sim/ship';
import { hullHalfWidthAt, type HullProfile } from './waves';

const COUNT: Record<Quality, number> = { baja: 1600, media: 3600, alta: 6000 };
/** Resolución del mapa de cubiertas (m por texel). */
const COVER_RES = 1;
/** Caja de lluvia alrededor de la cámara (m). */
const BOX = new THREE.Vector3(46, 26, 46);

const VERT = /* glsl */ `
attribute vec4 aSeed;
attribute float aEnd;
uniform vec3 uCam;
uniform vec3 uBox;
uniform vec3 uVel;      // velocidad de caída (m/s), incluido el viento aparente
uniform float uTime;
uniform float uLen;
uniform float uAmount;  // fracción de gotas activas
uniform mat4 uShipInv;
uniform sampler2D uCover;
uniform vec4 uCoverInfo; // x0, z0, ancho (m), fondo (m)
uniform float uWater;    // nivel del agua (y mundial aprox.)
varying float vAlpha;

void main() {
  vAlpha = 0.0;
  if (aSeed.w > uAmount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Cada gota recorre la caja verticalmente; su posición horizontal se arrastra con el viento.
  float fallT = uTime * (-uVel.y) / uBox.y;
  float cyc = floor(aSeed.y + fallT);
  float fy = fract(aSeed.y + fallT);
  vec3 drift = uVel * (fy * uBox.y / max(0.1, -uVel.y));
  vec3 base;
  // Cada ciclo la gota cambia de columna (para que no se vean patrones repetidos).
  vec2 jitter = vec2(fract(sin(cyc * 12.9898 + aSeed.x * 78.233) * 43758.5453), fract(sin(cyc * 39.346 + aSeed.z * 11.135) * 24634.6345));
  base.xz = uCam.xz + (fract(aSeed.xz + jitter) - 0.5) * uBox.xz;
  base.y = uCam.y + uBox.y * 0.55;
  vec3 p = base + drift;
  vec3 dir = normalize(uVel);
  vec3 pos = p - dir * uLen * (1.0 - aEnd);
  // Bajo el agua no hay gotas.
  float vis = step(uWater, pos.y);
  // Bajo techo tampoco: altura de la cubierta más alta de esa columna del barco.
  vec3 local = (uShipInv * vec4(pos, 1.0)).xyz;
  vec2 uv = (local.xz - uCoverInfo.xy) / uCoverInfo.zw;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    float cover = texture2D(uCover, uv).r;
    vis *= step(cover, local.y);
  }
  vAlpha = vis * (0.35 + 0.65 * aEnd);
  gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.01) discard;
  gl_FragColor = vec4(uColor, vAlpha * uOpacity);
}
`;

/** Salpicaduras: anillos que se abren donde cae la gota (mar, cubierta o techo). */
const SPLASH_VERT = /* glsl */ `
attribute float aLife;
uniform float uPix;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aLife > 0.0 ? clamp(uPix * 150.0 / max(1.0, -mv.z), 1.0, 32.0) : 0.0;
}
`;

const SPLASH_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vLife;
void main() {
  if (vLife <= 0.0) discard;
  vec2 c = (gl_PointCoord - 0.5) * vec2(1.0, 2.2); // aplastado: anillo visto en escorzo
  float r = length(c);
  float r0 = 0.12 + 0.36 * (1.0 - vLife);
  float ring = smoothstep(r0 - 0.12, r0, r) * (1.0 - smoothstep(r0, r0 + 0.07, r));
  if (ring < 0.02) discard;
  gl_FragColor = vec4(uColor, ring * vLife * uOpacity);
}
`;

const SPLASH_MAX = 360;
/** Radio alrededor de la cámara en que se ven salpicaduras (m). */
const SPLASH_RADIUS = 24;

export class Rain {
  readonly lines: THREE.LineSegments;
  private material: THREE.ShaderMaterial;
  private cover: THREE.DataTexture;
  private coverKey = '';
  /** Copia en CPU del mapa de cubiertas (para colocar salpicaduras). */
  private coverData: Float32Array = new Float32Array([-1000]);
  private coverInfo = { x0: 0, z0: 0, nx: 1, nz: 1 };
  /** Salpicaduras en el mar y en cubierta. */
  readonly splashes: THREE.Points;
  private splashMat: THREE.ShaderMaterial;
  private sPos = new Float32Array(SPLASH_MAX * 3);
  private sLife = new Float32Array(SPLASH_MAX);
  private sNext = 0;
  private sAcc = 0;
  private sSeed = 41;
  private sMax = SPLASH_MAX;
  private readonly tmpV = new THREE.Vector3();
  private readonly inv = new THREE.Matrix4();
  private max: number;
  private time = 0;

  constructor(quality: Quality) {
    this.max = COUNT.alta;
    const n = this.max;
    const seed = new Float32Array(n * 2 * 4);
    const end = new Float32Array(n * 2);
    const pos = new Float32Array(n * 2 * 3);
    let s = 99;
    const rnd = (): number => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const a = rnd();
      const b = rnd();
      const c = rnd();
      // Las primeras gotas son las que se activan con poca lluvia: reparto uniforme en w.
      const w = (i + rnd()) / n;
      for (let e = 0; e < 2; e++) {
        const k = (i * 2 + e) * 4;
        seed[k] = a;
        seed[k + 1] = b;
        seed[k + 2] = c;
        seed[k + 3] = w;
        end[i * 2 + e] = e;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.cover = new THREE.DataTexture(new Float32Array([-1000]), 1, 1, THREE.RedFormat, THREE.FloatType);
    this.cover.magFilter = THREE.NearestFilter;
    this.cover.minFilter = THREE.NearestFilter;
    this.cover.needsUpdate = true;
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uCam: { value: new THREE.Vector3() },
        uBox: { value: BOX.clone() },
        uVel: { value: new THREE.Vector3(0, -20, 0) },
        uTime: { value: 0 },
        uLen: { value: 1.1 },
        uAmount: { value: 0 },
        uShipInv: { value: new THREE.Matrix4() },
        uCover: { value: this.cover },
        uCoverInfo: { value: new THREE.Vector4(0, 0, 1, 1) },
        uWater: { value: 0.6 },
        uColor: { value: new THREE.Color('#c9d6df') },
        uOpacity: { value: 0.45 },
      },
    });
    this.lines = new THREE.LineSegments(g, this.material);
    this.lines.name = 'lluvia';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    this.lines.visible = false;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('aLife', new THREE.BufferAttribute(this.sLife, 1).setUsage(THREE.DynamicDrawUsage));
    this.splashMat = new THREE.ShaderMaterial({
      vertexShader: SPLASH_VERT,
      fragmentShader: SPLASH_FRAG,
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uPix: { value: 1 }, uColor: { value: new THREE.Color('#dfe8ee') }, uOpacity: { value: 0.6 } },
    });
    this.splashes = new THREE.Points(sg, this.splashMat);
    this.splashes.name = 'salpicaduras';
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 9;
    this.splashes.visible = false;
    this.setQuality(quality);
  }

  private srnd(): number {
    this.sSeed = (this.sSeed * 16807) % 2147483647;
    return this.sSeed / 2147483647;
  }

  /** Altura (y local del barco) de la cubierta más alta en (x, z) locales, o −1000 fuera del barco. */
  coverAt(x: number, z: number): number {
    const c = this.coverInfo;
    const i = Math.floor((x - c.x0) / COVER_RES);
    const j = Math.floor((z - c.z0) / COVER_RES);
    if (i < 0 || j < 0 || i >= c.nx || j >= c.nz) return -1000;
    return this.coverData[j * c.nx + i]!;
  }

  setQuality(q: Quality): void {
    this.lines.geometry.setDrawRange(0, Math.min(this.max, COUNT[q]) * 2);
    this.sMax = q === 'baja' ? 120 : q === 'media' ? 240 : SPLASH_MAX;
  }

  /**
   * Reconstruye el mapa de cubiertas si cambia la distribución del barco. Altura en coordenadas
   * locales del barco de la losa más alta de cada columna; en la proa (fuera de la cuadrícula),
   * la cubierta del castillo.
   */
  updateCover(layout: ShipLayout, hull: HullProfile): void {
    const key = `${layout.revision}:${layout.length}:${layout.width}:${hull.xMin.toFixed(2)}:${hull.xMax.toFixed(2)}`;
    if (key === this.coverKey) return;
    this.coverKey = key;
    const x0 = hull.xMin - 1;
    const x1 = hull.xMax + 1;
    const hwMax = Math.max(...hull.hw) + 1;
    const z0 = -hwMax;
    const nx = Math.max(1, Math.ceil((x1 - x0) / COVER_RES));
    const nz = Math.max(1, Math.ceil((2 * hwMax) / COVER_RES));
    const data = new Float32Array(nx * nz).fill(-1000);
    // Columnas de la cuadrícula: losa más alta.
    const top = new Map<string, number>();
    for (const s of layout.slabs) {
      const k = `${s.x},${s.z}`;
      top.set(k, Math.max(top.get(k) ?? -1000, s.y));
    }
    const halfW = (layout.width * CELL) / 2;
    for (let j = 0; j < nz; j++) {
      const z = z0 + (j + 0.5) * COVER_RES;
      for (let i = 0; i < nx; i++) {
        const x = x0 + (i + 0.5) * COVER_RES;
        const hw = hullHalfWidthAt(hull, x);
        if (hw < 0 || Math.abs(z) > hw + 0.3) continue;
        const cx = Math.floor((x + SHIP_ORIGIN_X) / CELL);
        const cz = Math.floor((z + halfW) / CELL);
        let y = LEVEL_H + 0.1; // cubierta (proa, bordes)
        if (cx >= 0 && cx < layout.length && cz >= 0 && cz < layout.width) {
          const t = top.get(`${cx},${cz}`);
          if (t !== undefined) y = t + 0.1;
        }
        data[j * nx + i] = y;
      }
    }
    this.coverData = data;
    this.coverInfo = { x0, z0, nx, nz };
    this.cover.dispose();
    this.cover = new THREE.DataTexture(data, nx, nz, THREE.RedFormat, THREE.FloatType);
    this.cover.magFilter = THREE.NearestFilter;
    this.cover.minFilter = THREE.NearestFilter;
    this.cover.needsUpdate = true;
    const u = this.material.uniforms;
    u.uCover!.value = this.cover;
    (u.uCoverInfo!.value as THREE.Vector4).set(x0, z0, nx * COVER_RES, nz * COVER_RES);
  }

  /**
   * @param amount intensidad 0..1 (weather.rain)
   * @param velX,velZ viento aparente horizontal (m/s)
   */
  update(
    dt: number,
    amount: number,
    velX: number,
    velZ: number,
    camPos: THREE.Vector3,
    shipMatrixWorld: THREE.Matrix4,
    color: THREE.Color,
    waterY: number,
    water?: (x: number, z: number) => number,
    pixelRatio = 1,
  ): void {
    this.time = (this.time + dt) % 3600;
    const a = THREE.MathUtils.clamp(amount, 0, 1);
    this.lines.visible = a > 0.02;
    this.updateSplashes(dt, a, camPos, shipMatrixWorld, color, water, pixelRatio);
    if (!this.lines.visible) return;
    const u = this.material.uniforms;
    (u.uCam!.value as THREE.Vector3).copy(camPos);
    (u.uVel!.value as THREE.Vector3).set(velX, -18 - 6 * a, velZ);
    u.uTime!.value = this.time;
    u.uAmount!.value = 0.15 + 0.85 * a;
    u.uLen!.value = 0.8 + 0.7 * a;
    u.uOpacity!.value = 0.22 + 0.33 * a;
    u.uWater!.value = waterY;
    (u.uShipInv!.value as THREE.Matrix4).copy(shipMatrixWorld).invert();
    // El shader escribe directamente en pantalla: color en sRGB.
    (u.uColor!.value as THREE.Color).copy(color).convertLinearToSRGB();
  }

  /** Salpicaduras: nacen al azar cerca de la cámara, sobre el mar o sobre la cubierta/techo. */
  private updateSplashes(dt: number, a: number, camPos: THREE.Vector3, ship: THREE.Matrix4, color: THREE.Color, water: ((x: number, z: number) => number) | undefined, pixelRatio: number): void {
    let any = false;
    if (a > 0.02 && water) {
      this.inv.copy(ship).invert();
      this.sAcc += dt * this.sMax * 1.4 * a;
      let n = Math.floor(this.sAcc);
      this.sAcc -= n;
      while (n-- > 0) {
        const ang = this.srnd() * Math.PI * 2;
        const d = Math.sqrt(this.srnd()) * SPLASH_RADIUS;
        const x = camPos.x + Math.cos(ang) * d;
        const z = camPos.z + Math.sin(ang) * d;
        // ¿Cae sobre el barco? (mapa de cubiertas en coordenadas locales)
        const local = this.tmpV.set(x, 0, z).applyMatrix4(this.inv);
        const cover = this.coverAt(local.x, local.z);
        let y: number;
        if (cover > -100) {
          local.y = cover - 0.08;
          local.applyMatrix4(ship);
          y = local.y;
        } else y = water(x, z) + 0.05;
        const i = this.sNext;
        this.sNext = (this.sNext + 1) % this.sMax;
        this.sPos[i * 3] = x;
        this.sPos[i * 3 + 1] = y;
        this.sPos[i * 3 + 2] = z;
        this.sLife[i] = 1;
      }
    }
    for (let i = 0; i < SPLASH_MAX; i++) {
      if (this.sLife[i]! <= 0) continue;
      this.sLife[i] = i < this.sMax ? Math.max(0, this.sLife[i]! - dt * 2.6) : 0;
      if (this.sLife[i]! > 0) any = true;
    }
    this.splashes.visible = any;
    if (!any) return;
    (this.splashes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.splashes.geometry.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
    const u = this.splashMat.uniforms;
    u.uPix!.value = pixelRatio;
    u.uOpacity!.value = 0.35 + 0.35 * a;
    (u.uColor!.value as THREE.Color).copy(color).convertLinearToSRGB();
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.material.dispose();
    this.cover.dispose();
    this.splashes.geometry.dispose();
    this.splashMat.dispose();
  }
}

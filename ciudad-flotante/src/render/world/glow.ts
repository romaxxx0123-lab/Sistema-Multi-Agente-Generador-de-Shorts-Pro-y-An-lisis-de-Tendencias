/**
 * LUCES DEL MUNDO: material con emisión nocturna por vértice y halos de luz en puntos.
 *
 * - `litMaterial(u)`: `MeshLambertMaterial` con colores por vértice que, además, suma de noche el
 *   color del atributo `aEmit` (Kit.emit): ventanas, farolillos y linternas lucen sin pool de luces.
 *   No calcula luces puntuales (las lámparas del barco no alcanzan el decorado lejano).
 * - `GlowPoints`: halos de luz (sprites de punto) con tamaño en metros, tamaño mínimo en píxeles,
 *   parpadeo propio y niebla a mano con un suelo (una luz se ve más lejos que el casco que la lleva).
 *   Dos estilos: `halo` aditivo (las mil luces cálidas del puerto, chispas) y `star` con mezcla
 *   normal (la luz verde, que debe verse también de día sobre un cielo claro). Con `mirror` se
 *   dibuja el reflejo en el agua como una estela vertical que tiembla.
 *
 * Los colores de los halos se guardan en sRGB (el shader escribe directamente en pantalla, como la
 * cúpula del cielo).
 */
import * as THREE from 'three';
import { withoutPointLights } from './ocean';

/* ------------------------------------------------------------------ */
/* Material con emisión nocturna                                       */
/* ------------------------------------------------------------------ */

export interface LitUniforms {
  /** Fuerza de las luces (0 de día … 1 de noche). */
  uLights: { value: number };
}

export function createLitUniforms(): LitUniforms {
  return { uLights: { value: 0 } };
}

/**
 * Material Lambert con colores por vértice + emisión `aEmit × uLights`. Cada material comparte el
 * programa (misma clave) pero puede llevar sus propios uniformes (fundidos por objeto).
 */
export function litMaterial(u: LitUniforms, opts: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...opts });
  m.onBeforeCompile = (shader) => {
    shader.uniforms['uLights'] = u.uLights;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aEmit;\nvarying vec3 vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLights;\nvarying vec3 vEmit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEmit * uLights;')
      .replace('#include <lights_fragment_begin>', withoutPointLights(THREE.ShaderChunk.lights_fragment_begin));
  };
  m.customProgramCacheKey = () => 'ciudad-flotante-luces-v1';
  return m;
}

/** Fuerza de las luces del decorado según la atmósfera (encendidas al anochecer y con mal tiempo). */
export function lightsLevel(day: number, overcast: number, fog: number): number {
  const night = 1 - day;
  return THREE.MathUtils.clamp(night * 1.35 + (overcast * 0.3 + fog * 0.35) * (0.4 + 0.6 * night), 0, 1);
}

/* ------------------------------------------------------------------ */
/* Halos de luz                                                        */
/* ------------------------------------------------------------------ */

export interface GlowSpot {
  /** Posición (marco del objeto). */
  p: readonly [number, number, number];
  /** Color sRGB. */
  color: THREE.ColorRepresentation;
  /** Diámetro del halo (m). */
  size: number;
  /** Parpadeo 0 (fija) … 1 (vela/farolillo). */
  flicker?: number;
}

/** Uniformes compartidos por todos los halos (los rellena el Renderer cada frame). */
export interface GlowShared {
  uTime: { value: number };
  /** Alto del búfer de dibujo en píxeles físicos (tamaño de los puntos). */
  uViewH: { value: number };
  uPix: { value: number };
  uFogDensity: { value: number };
  /** Altura del agua para los reflejos. */
  uWaterY: { value: number };
}

export function createGlowShared(): GlowShared {
  return { uTime: { value: 0 }, uViewH: { value: 720 }, uPix: { value: 1 }, uFogDensity: { value: 0.0005 }, uWaterY: { value: 1 } };
}

const GLOW_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
attribute float aFlicker;
uniform float uTime;
uniform float uViewH;
uniform float uPix;
uniform float uFogDensity;
uniform float uFogFloor;
uniform float uIntensity;
uniform float uMinPx;
uniform float uMaxPx;
uniform float uMirror;
uniform float uWaterY;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  if (uMirror > 0.5) wp.y = 2.0 * uWaterY - wp.y;
  vec4 mv = viewMatrix * wp;
  float d = max(-mv.z, 0.1);
  float px = aSize * projectionMatrix[1][1] * 0.5 * uViewH / d;
  float a = 1.0;
  float minPx = uMinPx * uPix;
  if (px < minPx) { a = px / minPx; px = minPx; }
  px = min(px, uMaxPx * uPix);
  if (uMirror > 0.5) px *= 1.6;
  gl_PointSize = px;
  float t = uTime * (1.7 + aSeed * 2.3) + aSeed * 37.0;
  float flick = 1.0 - aFlicker * (0.22 + 0.18 * sin(t) * sin(t * 2.7 + 1.3));
  float fogF = exp(-pow(uFogDensity * d, 2.0));
  vA = uIntensity * flick * max(fogF, uFogFloor) * sqrt(a);
  vCol = aColor;
  gl_Position = projectionMatrix * mv;
}
`;

const GLOW_FRAG = /* glsl */ `
uniform float uMirror;
uniform float uTime;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a;
#ifdef STAR
  float r = length(q);
  float core = smoothstep(0.22, 0.0, r);
  float halo = exp(-r * r * 6.0) * 0.55;
  float rays = exp(-abs(q.x) * 14.0) * exp(-abs(q.y) * 1.8) + exp(-abs(q.y) * 14.0) * exp(-abs(q.x) * 1.8);
  a = clamp(core + halo + rays * 0.5, 0.0, 1.0) * vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vCol, vec3(1.0), core * 0.55), a);
#else
  if (uMirror > 0.5) {
    // Reflejo: estela vertical estrecha que tiembla con el agua.
    float wob = sin(q.y * 9.0 + uTime * 3.1) * 0.12;
    float x = (q.x + wob) * 3.2;
    a = exp(-x * x) * smoothstep(1.0, 0.1, abs(q.y)) * 0.45;
  } else {
    float r2 = dot(q, q);
    a = smoothstep(0.09, 0.0, r2) * 0.9 + exp(-r2 * 5.0) * 0.5;
  }
  a *= vA;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
#endif
}
`;

export interface GlowOptions {
  style?: 'halo' | 'star';
  /** Tamaño mínimo en píxeles CSS (una luz lejana no desaparece). */
  minPx?: number;
  maxPx?: number;
  /** Visibilidad mínima con niebla (0..1). */
  fogFloor?: number;
  /** Dibuja el reflejo en el agua. */
  mirror?: boolean;
  /** Capacidad (para halos dinámicos: chispas, farolillos). */
  capacity?: number;
}

/** Conjunto de halos de luz en un solo `THREE.Points`. */
export class GlowPoints {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  readonly geometry: THREE.BufferGeometry;
  private readonly cap: number;

  constructor(shared: GlowShared, spots: readonly GlowSpot[], opts: GlowOptions = {}) {
    const star = opts.style === 'star';
    this.cap = Math.max(spots.length, opts.capacity ?? 0);
    const n = this.cap;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const seed = new Float32Array(n);
    const flick = new Float32Array(n);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.geometry.setAttribute('aFlicker', new THREE.BufferAttribute(flick, 1));
    this.setSpots(spots);
    this.material = new THREE.ShaderMaterial({
      vertexShader: GLOW_VERT,
      fragmentShader: GLOW_FRAG,
      defines: star ? { STAR: '' } : {},
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: star ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: {
        uTime: shared.uTime,
        uViewH: shared.uViewH,
        uPix: shared.uPix,
        uFogDensity: shared.uFogDensity,
        uWaterY: shared.uWaterY,
        uFogFloor: { value: opts.fogFloor ?? 0.25 },
        uIntensity: { value: 0 },
        uMinPx: { value: opts.minPx ?? 2 },
        uMaxPx: { value: opts.maxPx ?? 96 },
        uMirror: { value: opts.mirror ? 1 : 0 },
      },
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = opts.mirror ? 'reflejos-luces' : star ? 'luz-estrella' : 'halos-luces';
    this.points.renderOrder = star ? 7 : 5;
    this.points.visible = false;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Sustituye las luces (hasta la capacidad). */
  setSpots(spots: readonly GlowSpot[]): void {
    const n = Math.min(this.cap, spots.length);
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    const size = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const seed = this.geometry.getAttribute('aSeed') as THREE.BufferAttribute;
    const flick = this.geometry.getAttribute('aFlicker') as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = spots[i]!;
      pos.setXYZ(i, s.p[0], s.p[1], s.p[2]);
      // Color sRGB tal cual (sin pasar al espacio lineal de trabajo).
      c.setStyle(typeof s.color === 'string' ? s.color : `#${new THREE.Color(s.color).getHexString()}`, THREE.NoColorSpace);
      col.setXYZ(i, c.r, c.g, c.b);
      size.setX(i, s.size);
      seed.setX(i, fract(Math.sin((i + 1) * 12.9898 + s.p[0] * 0.37 + s.p[2] * 0.71) * 43758.5453));
      flick.setX(i, s.flicker ?? 0);
    }
    for (const a of [pos, col, size, seed, flick]) a.needsUpdate = true;
    this.geometry.setDrawRange(0, n);
    this.geometry.computeBoundingSphere();
  }

  /** Mueve un halo dinámico (chispas, farolillos). Llamar a `commit` al terminar. */
  setPoint(i: number, x: number, y: number, z: number, size: number): void {
    const pos = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const sz = this.geometry.getAttribute('aSize') as THREE.BufferAttribute;
    pos.setXYZ(i, x, y, z);
    sz.setX(i, size);
  }

  setColor(i: number, r: number, g: number, b: number): void {
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).setXYZ(i, r, g, b);
  }

  /** Tras `setPoint`: cuántos halos dibujar y subir los datos. */
  commit(count: number): void {
    this.geometry.setDrawRange(0, Math.min(count, this.cap));
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    this.points.frustumCulled = false;
  }

  /** Intensidad global (0 = oculto). */
  set intensity(v: number) {
    (this.material.uniforms['uIntensity'] as { value: number }).value = v;
    this.points.visible = v > 0.004 && this.geometry.drawRange.count > 0;
  }

  get intensity(): number {
    return (this.material.uniforms['uIntensity'] as { value: number }).value;
  }

  get count(): number {
    return this.geometry.drawRange.count;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

function fract(x: number): number {
  return x - Math.floor(x);
}

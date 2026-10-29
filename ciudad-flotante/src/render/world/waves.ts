/**
 * OLEAJE: olas de Gerstner (4 trenes) + abultamiento de la estela del barco.
 *
 * La MISMA función se evalúa en la GPU (vertex shader del océano, ver `GLSL_WAVES`) y en la CPU
 * (`WaveField.heightAt`, que usan `Renderer.waterHeight`, los restos flotantes y el balanceo del
 * barco). Para que coincidan:
 *  - las fases de cada tren (`phase`) se integran en la CPU en doble precisión y se suben como
 *    uniformes (así el desplazamiento acumulado del mar no pierde precisión en float32);
 *  - las constantes de forma (atenuación con la distancia, estela) se escriben en el GLSL desde
 *    los mismos números de este archivo.
 *
 * Marco del océano = marco del mundo: el barco está en el origen y navega hacia +x; el agua se
 * desplaza hacia popa (−x). Un patrón W(p) visto en el instante con desplazamiento acumulado `s`
 * es W(p + (s, 0)).
 */
import { clamp } from '../../core/math';

/* ------------------------------------------------------------------ */
/* Trenes de olas                                                      */
/* ------------------------------------------------------------------ */

export interface WaveSpec {
  /** Longitud de onda (m). */
  length: number;
  /** Ángulo respecto a la dirección del viento (rad). */
  angle: number;
  /** Fracción de la amplitud total. */
  share: number;
  /** Factor de agudeza de Gerstner (desplazamiento horizontal / amplitud) en calma. */
  steep: number;
  /** Atenuación con la distancia al barco [inicio, fin] (m): evita el aliasing en la malla lejana. */
  fade: readonly [number, number];
}

/** Mar de fondo largo + mar de viento + marejadilla corta. */
export const WAVES: readonly WaveSpec[] = [
  { length: 68, angle: 0.0, share: 0.42, steep: 0.85, fade: [190, 340] },
  { length: 39, angle: 0.62, share: 0.27, steep: 0.95, fade: [140, 250] },
  { length: 22, angle: -0.48, share: 0.19, steep: 1.05, fade: [100, 175] },
  { length: 12.5, angle: 1.2, share: 0.12, steep: 1.15, fade: [60, 110] },
];
export const WAVE_COUNT = WAVES.length;
const G = 9.81;
/** Las olas estilizadas se mueven algo más despacio que las reales: más legibles y tranquilas. */
const OMEGA_SCALE = 0.82;
/** Altura de ola mínima (m): el mar nunca es un espejo. */
export const MIN_WAVE_HEIGHT = 0.28;

/* ------------------------------------------------------------------ */
/* Casco (para estela y máscara)                                       */
/* ------------------------------------------------------------------ */

/** Muestras de media manga del casco a lo largo de la eslora (tabla compartida con el shader). */
export const HULL_SAMPLES = 32;

export interface HullProfile {
  /** x de la popa (espejo) en la flotación. */
  xMin: number;
  /** x de la roda (punta de proa) en la flotación. */
  xMax: number;
  /** Media manga en la flotación en `HULL_SAMPLES` puntos equiespaciados de xMin a xMax. */
  hw: Float32Array;
}

/** Media manga del casco en x (interpolada), o −1 fuera de la eslora. Igual que `hullHW` en GLSL. */
export function hullHalfWidthAt(h: HullProfile, x: number): number {
  const f = ((x - h.xMin) / (h.xMax - h.xMin)) * (HULL_SAMPLES - 1);
  if (!(f >= 0) || f > HULL_SAMPLES - 1) return -1;
  const i = Math.min(HULL_SAMPLES - 2, Math.floor(f));
  const t = f - i;
  return h.hw[i]! + (h.hw[i + 1]! - h.hw[i]!) * t;
}

/* ------------------------------------------------------------------ */
/* Estela (abultamiento en y) — misma fórmula que `wakeBump` en GLSL     */
/* ------------------------------------------------------------------ */

/** tan(19,47°): semiángulo de la estela de Kelvin. */
const KELVIN = 0.354;

const sstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface WakeParams {
  /** Velocidad relativa 0..1,5 (1 = crucero). */
  sf: number;
  /** Media manga en el centro del barco. */
  hwMid: number;
  /** Media manga en el espejo de popa. */
  hwStern: number;
}

/**
 * Elevación del agua por el paso del barco en (px, pz) del marco del océano: ola de proa,
 * ligero seno a los costados, brazos de Kelvin desde los hombros de proa y de popa, y el seno de
 * la estela de la hélice.
 */
export function wakeBump(h: HullProfile, w: WakeParams, px: number, pz: number): number {
  if (w.sf <= 0.001) return 0;
  const az = Math.abs(pz);
  let y = 0;
  const hw = hullHalfWidthAt(h, px);
  if (hw >= 0) {
    const e = Math.max(0, az - hw);
    const bowZone = sstep(h.xMax - 16, h.xMax - 3, px);
    y += 0.34 * w.sf * Math.exp(-(e * e) / 5) * bowZone;
    y -= 0.12 * w.sf * Math.exp(-(e * e) / 10) * (1 - bowZone);
  } else if (px > h.xMax) {
    const d = Math.hypot(px - h.xMax, pz);
    y += 0.3 * w.sf * Math.exp(-(d * d) / 6);
  }
  // Brazos de Kelvin desde los hombros de proa.
  const dBow = h.xMax - 6 - px;
  if (dBow > 0) {
    const arm = az - (w.hwMid * 0.8 + dBow * KELVIN);
    const sg = 1.6 + dBow * 0.03;
    y += 0.2 * w.sf * Math.exp(-(arm * arm) / (2 * sg * sg)) * Math.exp(-dBow / 120);
  }
  // Popa: brazos secundarios y seno de la estela de la hélice.
  const dSt = h.xMin - px;
  if (dSt > 0) {
    const arm2 = az - (w.hwStern * 0.9 + dSt * KELVIN);
    const sg2 = 1.4 + dSt * 0.03;
    y += 0.12 * w.sf * Math.exp(-(arm2 * arm2) / (2 * sg2 * sg2)) * Math.exp(-dSt / 90);
    const wid = w.hwStern * (0.75 + dSt * 0.012);
    y -= 0.1 * w.sf * Math.exp(-(pz * pz) / (wid * wid)) * Math.exp(-dSt / 50);
  }
  return y;
}

/* ------------------------------------------------------------------ */
/* Campo de olas (CPU)                                                 */
/* ------------------------------------------------------------------ */

export class WaveField {
  /** Dirección de cada tren (x, z) normalizada. */
  readonly dir = new Float64Array(WAVE_COUNT * 2);
  /** Número de onda k = 2π/L. */
  readonly k = new Float64Array(WAVE_COUNT);
  /** Pulsación ω (rad/s reales). */
  readonly omega = new Float64Array(WAVE_COUNT);
  /** Amplitud vertical (m). */
  readonly amp = new Float64Array(WAVE_COUNT);
  /** Agudeza de Gerstner (desplazamiento horizontal / amplitud). */
  readonly q = new Float64Array(WAVE_COUNT);
  /** Fase acumulada (rad, envuelta a [0, 2π)). */
  readonly phase = new Float64Array(WAVE_COUNT);
  /** Amplitud total actual (suma de amplitudes). */
  ampTotal = 0;
  /** Dirección del viento suavizada (rad). */
  windDir = 0.6;
  /** Fuerza del viento suavizada 0..1. */
  wind = 0.3;
  /** Desplazamiento acumulado del agua hacia popa (m), envuelto para el ruido de espuma. */
  drift = 0;
  /** Tiempo real acumulado (s). */
  time = 0;
  hull: HullProfile = { xMin: -20.3, xMax: 27, hw: new Float32Array(HULL_SAMPLES).fill(8.3) };
  readonly wake: WakeParams = { sf: 1, hwMid: 8.3, hwStern: 8.3 };

  constructor() {
    for (let i = 0; i < WAVE_COUNT; i++) {
      const s = WAVES[i]!;
      this.k[i] = (2 * Math.PI) / s.length;
      this.omega[i] = Math.sqrt(G * this.k[i]!) * OMEGA_SCALE;
    }
    this.setSea(0.6, 0.3, 0.6);
  }

  /** Fija el estado del mar al instante (altura de ola característica, viento, rumbo del viento). */
  setSea(waveHeight: number, wind: number, windDir: number): void {
    const H = Math.max(MIN_WAVE_HEIGHT, Number.isFinite(waveHeight) ? waveHeight : 0.6);
    const targetAmp = 0.5 * H;
    const w = clamp(Number.isFinite(wind) ? wind : 0.3, 0, 1);
    const wd = Number.isFinite(windDir) ? windDir : 0.6;
    this.ampTotal = targetAmp;
    this.wind = w;
    this.windDir = wd;
    this.refreshShape();
  }

  private refreshShape(): void {
    for (let i = 0; i < WAVE_COUNT; i++) {
      const s = WAVES[i]!;
      const a = this.windDir + s.angle;
      this.dir[i * 2] = Math.cos(a);
      this.dir[i * 2 + 1] = Math.sin(a);
      this.amp[i] = this.ampTotal * s.share;
      // Más viento → crestas más agudas (sin llegar a formar bucles).
      const qMax = 0.9 / (this.k[i]! * Math.max(1e-4, this.amp[i]!) * WAVE_COUNT);
      this.q[i] = Math.min(qMax, s.steep * (1 + 0.9 * this.wind));
    }
  }

  /**
   * Avanza el oleaje. `dtReal` anima las olas; `ds` es lo que el agua se ha desplazado hacia popa
   * (m) en este frame. La dirección del oleaje sigue al viento muy despacio.
   */
  advance(dtReal: number, ds: number, waveHeight: number, wind: number, windDir: number): void {
    const dt = Math.max(0, dtReal);
    const H = 0.5 * Math.max(MIN_WAVE_HEIGHT, Number.isFinite(waveHeight) ? waveHeight : 0.6);
    // Suavizado propio (el clima ya suaviza, pero así una carga de partida no da un salto).
    const kA = 1 - Math.exp(-dt * 0.8);
    this.ampTotal += (H - this.ampTotal) * kA;
    this.wind += (clamp(Number.isFinite(wind) ? wind : 0.3, 0, 1) - this.wind) * kA;
    if (Number.isFinite(windDir)) {
      let d = windDir - this.windDir;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // El mar de fondo gira más despacio que el viento (si girase rápido, el mar lejano "nadaría").
      this.windDir += clamp(d, -0.005 * dt, 0.005 * dt);
    }
    this.refreshShape();
    this.time += dt;
    this.drift = (this.drift + ds) % NOISE_PERIOD_M;
    if (this.drift < 0) this.drift += NOISE_PERIOD_M;
    const TAU = Math.PI * 2;
    for (let i = 0; i < WAVE_COUNT; i++) {
      let p = this.phase[i]! + this.k[i]! * this.dir[i * 2]! * ds - this.omega[i]! * dt;
      p %= TAU;
      if (p < 0) p += TAU;
      this.phase[i] = p;
    }
  }

  /** Atenuación del tren i a una distancia r del barco (igual que en GLSL). */
  private fade(i: number, r: number): number {
    const f = WAVES[i]!.fade;
    return 1 - sstep(f[0], f[1], r);
  }

  /**
   * Desplazamiento de Gerstner del punto de la malla (gx, gz). Devuelve [dx, dy, dz] en `out`
   * (dy incluye la estela salvo que `withWake` sea false).
   */
  displacement(gx: number, gz: number, out: { x: number; y: number; z: number }, withWake = true): void {
    const r = Math.hypot(gx, gz);
    let dx = 0;
    let dy = 0;
    let dz = 0;
    for (let i = 0; i < WAVE_COUNT; i++) {
      const a = this.amp[i]! * this.fade(i, r);
      if (a <= 0) continue;
      const Dx = this.dir[i * 2]!;
      const Dz = this.dir[i * 2 + 1]!;
      const th = this.k[i]! * (Dx * gx + Dz * gz) + this.phase[i]!;
      const c = Math.cos(th);
      const qa = this.q[i]! * a;
      dx += qa * Dx * c;
      dz += qa * Dz * c;
      dy += a * Math.sin(th);
    }
    out.x = dx;
    out.y = withWake ? dy + wakeBump(this.hull, this.wake, gx, gz) : dy;
    out.z = dz;
  }

  private tmp = { x: 0, y: 0, z: 0 };

  /**
   * Altura de la superficie (relativa al nivel medio) en el punto (x, z) del océano. Como
   * Gerstner desplaza en horizontal, se busca el punto de la malla que acaba en (x, z) con unas
   * iteraciones de punto fijo. `withWake = false` da solo el oleaje (sin la ola que levanta el
   * propio barco), que es lo que mueve el casco.
   */
  heightAt(x: number, z: number, withWake = true): number {
    let gx = x;
    let gz = z;
    const d = this.tmp;
    for (let it = 0; it < 4; it++) {
      this.displacement(gx, gz, d, false);
      gx = x - d.x;
      gz = z - d.z;
    }
    this.displacement(gx, gz, d, withWake);
    return d.y;
  }

  /** Altura relativa máxima posible (para normalizar la espuma de crestas). */
  get maxHeight(): number {
    return Math.max(1e-3, this.ampTotal);
  }
}

/** Periodo (m) en que se repite el ruido de espuma: el desplazamiento se envuelve con él. */
export const NOISE_PERIOD_M = 64 * 24;

/* ------------------------------------------------------------------ */
/* GLSL (mismas fórmulas)                                              */
/* ------------------------------------------------------------------ */

const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : `${n}`);

/** Declaraciones y funciones compartidas por el vertex shader del océano. */
export const GLSL_WAVES = /* glsl */ `
uniform vec4 uWaveA[${WAVE_COUNT}]; // dir.x, dir.z, k, amplitud
uniform vec4 uWaveB[${WAVE_COUNT}]; // q, fase, -, -
uniform float uHullHW[${HULL_SAMPLES}];
uniform vec4 uHull;   // xMin, xMax, -, -
uniform vec4 uWake;   // sf, hwMid, hwStern, -

float sstep(float e0, float e1, float x) { float t = clamp((x - e0) / (e1 - e0), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }

float hullHW(float x) {
  float fi = (x - uHull.x) / (uHull.y - uHull.x) * ${f(HULL_SAMPLES - 1)};
  if (fi < 0.0 || fi > ${f(HULL_SAMPLES - 1)}) return -1.0;
  int i = min(${HULL_SAMPLES - 2}, int(floor(fi)));
  float t = fi - float(i);
  return mix(uHullHW[i], uHullHW[i + 1], t);
}

float waveFade(int i, float r) {
  ${WAVES.map((w, i) => `if (i == ${i}) return 1.0 - sstep(${f(w.fade[0])}, ${f(w.fade[1])}, r);`).join('\n  ')}
  return 0.0;
}

float wakeBump(vec2 p) {
  float sf = uWake.x;
  if (sf <= 0.001) return 0.0;
  float az = abs(p.y);
  float y = 0.0;
  float hw = hullHW(p.x);
  if (hw >= 0.0) {
    float e = max(0.0, az - hw);
    float bowZone = sstep(uHull.y - 16.0, uHull.y - 3.0, p.x);
    y += 0.34 * sf * exp(-(e * e) / 5.0) * bowZone;
    y -= 0.12 * sf * exp(-(e * e) / 10.0) * (1.0 - bowZone);
  } else if (p.x > uHull.y) {
    float d = length(vec2(p.x - uHull.y, p.y));
    y += 0.3 * sf * exp(-(d * d) / 6.0);
  }
  float dBow = uHull.y - 6.0 - p.x;
  if (dBow > 0.0) {
    float arm = az - (uWake.y * 0.8 + dBow * ${KELVIN});
    float sg = 1.6 + dBow * 0.03;
    y += 0.2 * sf * exp(-(arm * arm) / (2.0 * sg * sg)) * exp(-dBow / 120.0);
  }
  float dSt = uHull.x - p.x;
  if (dSt > 0.0) {
    float arm2 = az - (uWake.z * 0.9 + dSt * ${KELVIN});
    float sg2 = 1.4 + dSt * 0.03;
    y += 0.12 * sf * exp(-(arm2 * arm2) / (2.0 * sg2 * sg2)) * exp(-dSt / 90.0);
    float wid = uWake.z * (0.75 + dSt * 0.012);
    y -= 0.1 * sf * exp(-(p.y * p.y) / (wid * wid)) * exp(-dSt / 50.0);
  }
  return y;
}

// Desplazamiento de Gerstner del punto de malla g (marco del océano). h = altura sin estela.
vec3 gerstner(vec2 g, out float h) {
  float r = length(g);
  vec3 d = vec3(0.0);
  for (int i = 0; i < ${WAVE_COUNT}; i++) {
    vec4 A = uWaveA[i];
    vec4 B = uWaveB[i];
    float a = A.w * waveFade(i, r);
    float th = A.z * dot(A.xy, g) + B.y;
    float c = cos(th);
    d.x += B.x * a * A.x * c;
    d.z += B.x * a * A.y * c;
    d.y += a * sin(th);
  }
  h = d.y;
  return d;
}
`;

/** Rellena los uniformes de oleaje y casco a partir del campo de la CPU. */
export function writeWaveUniforms(
  w: WaveField,
  u: { uWaveA: { value: Float32Array }; uWaveB: { value: Float32Array }; uHullHW: { value: Float32Array }; uHull: { value: { set(x: number, y: number, z: number, w: number): unknown } }; uWake: { value: { set(x: number, y: number, z: number, w: number): unknown } } },
): void {
  const A = u.uWaveA.value;
  const B = u.uWaveB.value;
  for (let i = 0; i < WAVE_COUNT; i++) {
    A[i * 4] = w.dir[i * 2]!;
    A[i * 4 + 1] = w.dir[i * 2 + 1]!;
    A[i * 4 + 2] = w.k[i]!;
    A[i * 4 + 3] = w.amp[i]!;
    B[i * 4] = w.q[i]!;
    B[i * 4 + 1] = w.phase[i]!;
    B[i * 4 + 2] = 0;
    B[i * 4 + 3] = 0;
  }
  u.uHullHW.value.set(w.hull.hw);
  u.uHull.value.set(w.hull.xMin, w.hull.xMax, 0, 0);
  u.uWake.value.set(w.wake.sf, w.wake.hwMid, w.wake.hwStern, 0);
}

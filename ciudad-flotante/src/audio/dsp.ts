/**
 * [AGENTE audio] DSP puro: generadores de muestras para los búferes de audio procedural.
 *
 * Todo trabaja sobre `Float32Array` sin depender de WebAudio, así que se puede probar en Node
 * (Vitest) y reutilizar tanto en el `AudioContext` del juego como en un `OfflineAudioContext`.
 * Las funciones reciben un generador aleatorio para que las pruebas sean reproducibles.
 */

/** Generador aleatorio 0..1. */
export type RandFn = () => number;

/** PRNG pequeño y rápido (mulberry32) para pruebas y variantes reproducibles. */
export function seededRandom(seed: number): RandFn {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal aproximada (suma de uniformes) — suficiente para ruido de audio. */
function gauss(rand: RandFn): number {
  return (rand() + rand() + rand() + rand() - 2) * 1.7320508;
}

/* ------------------------------------------------------------------ */
/* Medidas                                                             */
/* ------------------------------------------------------------------ */

export function peakOf(data: ArrayLike<number>): number {
  let p = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]!);
    if (v > p) p = v;
  }
  return p;
}

export function rmsOf(data: ArrayLike<number>): number {
  if (!data.length) return 0;
  let s = 0;
  for (let i = 0; i < data.length; i++) s += data[i]! * data[i]!;
  return Math.sqrt(s / data.length);
}

/** Decibelios respecto a fondo de escala (−∞ → −200). */
export function toDb(v: number): number {
  return v > 1e-10 ? 20 * Math.log10(v) : -200;
}

export function hasNonFinite(data: ArrayLike<number>): boolean {
  for (let i = 0; i < data.length; i++) if (!Number.isFinite(data[i]!)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

/** Escala para que el RMS sea `target` y recorta suavemente picos por encima de `ceiling`. */
export function normalizeRms(data: Float32Array, target: number, ceiling = 0.95): Float32Array {
  const r = rmsOf(data);
  if (r > 1e-12) {
    const k = target / r;
    for (let i = 0; i < data.length; i++) data[i] = softClip(data[i]! * k, ceiling);
  }
  return data;
}

/** Escala para que el pico sea `target`. */
export function normalizePeak(data: Float32Array, target: number): Float32Array {
  const p = peakOf(data);
  if (p > 1e-12) {
    const k = target / p;
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * k;
  }
  return data;
}

/** Recorte suave (tanh escalado) por encima de `ceiling`. */
export function softClip(v: number, ceiling = 0.95): number {
  const a = Math.abs(v);
  if (a <= ceiling * 0.8) return v;
  const knee = ceiling * 0.8;
  const over = (a - knee) / (ceiling - knee);
  const out = knee + (ceiling - knee) * Math.tanh(over);
  return v < 0 ? -out : out;
}

/**
 * Convierte `n + fade` muestras en un bucle de `n` sin chasquido: el principio se funde
 * (potencia constante) con la continuación natural del final.
 */
export function makeLoopable(src: Float32Array, n: number): Float32Array {
  const fade = src.length - n;
  const out = new Float32Array(n);
  out.set(src.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    const a = Math.sin(w * Math.PI * 0.5);
    const b = Math.cos(w * Math.PI * 0.5);
    out[i] = src[i]! * a + src[n + i]! * b;
  }
  return out;
}

/** Filtro paso alto de un polo (quita el valor medio y retumbos). */
export function highpassInPlace(data: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / sampleRate;
  const a = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    const y = a * (prevOut + x - prevIn);
    prevIn = x;
    prevOut = y;
    data[i] = y;
  }
  return data;
}

/** Resonador de dos polos (biquad pasa banda) para síntesis física sencilla. */
class Resonator {
  private b0: number;
  private a1: number;
  private a2: number;
  private y1 = 0;
  private y2 = 0;
  private x2 = 0;
  private x1 = 0;
  constructor(sampleRate: number, freq: number, q: number) {
    const w = (2 * Math.PI * freq) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    this.b0 = alpha / a0;
    this.a1 = (-2 * Math.cos(w)) / a0;
    this.a2 = (1 - alpha) / a0;
  }
  process(x: number): number {
    // Pasa banda de ganancia de pico 0 dB: b = [alpha, 0, -alpha] / a0.
    const y = this.b0 * x - this.b0 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/* ------------------------------------------------------------------ */
/* Ruidos de color (en bucle)                                          */
/* ------------------------------------------------------------------ */

const FADE_S = 0.08;

/** Ruido blanco gaussiano en bucle, RMS 0,2. */
export function whiteNoise(sampleRate: number, seconds: number, rand: RandFn): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const f = Math.floor(sampleRate * FADE_S);
  const raw = new Float32Array(n + f);
  for (let i = 0; i < raw.length; i++) raw[i] = gauss(rand);
  return normalizeRms(makeLoopable(raw, n), 0.2);
}

/** Ruido rosa (método de Paul Kellet) en bucle, RMS 0,2. */
export function pinkNoise(sampleRate: number, seconds: number, rand: RandFn): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const f = Math.floor(sampleRate * FADE_S);
  const raw = new Float32Array(n + f);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < raw.length; i++) {
    const w = gauss(rand) * 0.5;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
  }
  highpassInPlace(raw, sampleRate, 12);
  return normalizeRms(makeLoopable(raw, n), 0.2);
}

/** Ruido marrón (integración con fuga), en bucle, RMS 0,2. Grave y profundo: mar de fondo, truenos. */
export function brownNoise(sampleRate: number, seconds: number, rand: RandFn): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const f = Math.floor(sampleRate * FADE_S);
  const raw = new Float32Array(n + f);
  let last = 0;
  // Fuga proporcional a la frecuencia de muestreo: el carácter no cambia entre 44,1 y 48 kHz.
  const leak = Math.exp((-2 * Math.PI * 8) / sampleRate);
  for (let i = 0; i < raw.length; i++) {
    last = last * leak + gauss(rand) * 0.02;
    raw[i] = last;
  }
  highpassInPlace(raw, sampleRate, 18);
  return normalizeRms(makeLoopable(raw, n), 0.2);
}

/* ------------------------------------------------------------------ */
/* Texturas: chisporroteo, gotas, crujidos                             */
/* ------------------------------------------------------------------ */

/**
 * Chisporroteo de fuego en bucle: chasquidos cortos de ruido con amplitud de cola larga
 * (muchos pequeños, pocos grandes) y algún "pop" más grave de la leña.
 * @param rate chasquidos por segundo.
 */
export function crackleLoop(sampleRate: number, seconds: number, rate: number, rand: RandFn): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(n);
  const events = Math.round(rate * seconds);
  for (let e = 0; e < events; e++) {
    const start = Math.floor(rand() * n);
    // Distribución de Pareto: la mayoría flojos, algunos muy marcados.
    const amp = Math.min(1, 0.08 / Math.pow(rand() * 0.98 + 0.02, 0.75));
    const pop = rand() < 0.08;
    const len = Math.floor(sampleRate * (pop ? 0.006 + rand() * 0.012 : 0.0006 + rand() * 0.003));
    const decay = len / 3;
    let lp = 0;
    const smooth = pop ? 0.35 : 0.85;
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / decay);
      lp += (gauss(rand) - lp) * smooth;
      const idx = (start + i) % n; // envuelve: el bucle no tiene costura
      out[idx] = out[idx]! + lp * amp * env;
    }
  }
  highpassInPlace(out, sampleRate, 300);
  return normalizePeak(out, 0.9);
}

/**
 * Gotas de lluvia en bucle: pequeños "plic" (senoide amortiguada de 1,5–6 kHz) con su clic.
 * @param rate gotas por segundo.
 */
export function dropsLoop(sampleRate: number, seconds: number, rate: number, rand: RandFn): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(n);
  const events = Math.round(rate * seconds);
  for (let e = 0; e < events; e++) {
    const start = Math.floor(rand() * n);
    const amp = 0.15 + rand() * rand() * 0.85;
    const freq = 1500 + rand() * 4500;
    const decay = sampleRate * (0.0015 + rand() * 0.006);
    const len = Math.floor(decay * 5);
    const w = (2 * Math.PI * freq) / sampleRate;
    const chirp = 1 + rand() * 0.6; // la gota sube de tono al reventar
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / decay);
      const click = i < 12 ? gauss(rand) * 0.6 * (1 - i / 12) : 0;
      const ph = w * i * (1 + (chirp - 1) * (i / len));
      const idx = (start + i) % n;
      out[idx] = out[idx]! + (Math.sin(ph) + click) * amp * env;
    }
  }
  highpassInPlace(out, sampleRate, 500);
  return normalizePeak(out, 0.9);
}

/**
 * Crujido de madera (stick-slip): tren de impulsos de ritmo variable que excita tres
 * resonancias de la tablazón. Duración 0,4–1,3 s. Cada `variant` produce otro crujido.
 */
export function creakBuffer(sampleRate: number, rand: RandFn): Float32Array {
  const dur = 0.45 + rand() * 0.85;
  const n = Math.floor(sampleRate * dur);
  const out = new Float32Array(n);
  const f1 = 260 + rand() * 380;
  const res = [new Resonator(sampleRate, f1, 9 + rand() * 6), new Resonator(sampleRate, f1 * (2.3 + rand() * 0.6), 7), new Resonator(sampleRate, f1 * (4.1 + rand() * 1.2), 5)];
  const mix = [1, 0.55, 0.25];
  // Ritmo del roce: arranca lento, acelera y vuelve a frenar (curva de tono del crujido).
  const r0 = 18 + rand() * 20;
  const r1 = 45 + rand() * 70;
  const r2 = 14 + rand() * 25;
  const attack = 0.08 + rand() * 0.15;
  const release = 0.12 + rand() * 0.25;
  let next = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const u = t / dur;
    const rate = u < 0.5 ? r0 + (r1 - r0) * Math.sin(u * Math.PI) : r2 + (r1 - r2) * Math.sin(u * Math.PI);
    let x = 0;
    if (i >= next) {
      x = (0.6 + rand() * 0.4) * (rand() < 0.1 ? 0.3 : 1);
      next = i + Math.max(1, Math.floor((sampleRate / rate) * (0.85 + rand() * 0.3)));
    }
    let y = 0;
    for (let k = 0; k < res.length; k++) y += res[k]!.process(x) * mix[k]!;
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
    out[i] = y * env;
  }
  highpassInPlace(out, sampleRate, 120);
  return normalizePeak(out, 0.85);
}

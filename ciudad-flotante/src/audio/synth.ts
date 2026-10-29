/**
 * [AGENTE audio] Kit de síntesis sobre WebAudio: búferes de ruido compartidos y bloques
 * (envolventes, osciladores, ráfagas de ruido filtrado, golpes de madera, parciales de campana,
 * notas de marimba, metal, salpicaduras…).
 *
 * Todo recibe un `BaseAudioContext`, así que funciona igual en el `AudioContext` del juego y en un
 * `OfflineAudioContext` (pruebas de síntesis). Ningún bloque deja nodos vivos tras su duración.
 */
import { brownNoise, crackleLoop, creakBuffer, dropsLoop, pinkNoise, whiteNoise, type RandFn } from './dsp';

/* ------------------------------------------------------------------ */
/* Banco de búferes                                                    */
/* ------------------------------------------------------------------ */

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Chisporroteo de fuego (bucle). */
  crackle: AudioBuffer;
  /** Gotas de lluvia (bucle). */
  drops: AudioBuffer;
  /** Variantes de crujido de madera. */
  creaks: AudioBuffer[];
}

function toBuffer(ctx: BaseAudioContext, data: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.getChannelData(0).set(data);
  return buf;
}

/**
 * Genera los búferes por pasos (un búfer por paso) para no congelar un frame: en el juego se
 * avanza un paso por frame tras el primer gesto; las pruebas lo agotan de golpe.
 */
export function* noiseBankSteps(ctx: BaseAudioContext, rand: RandFn): Generator<void, NoiseBank, void> {
  const sr = ctx.sampleRate;
  const white = toBuffer(ctx, whiteNoise(sr, 2.5, rand));
  yield;
  const pink = toBuffer(ctx, pinkNoise(sr, 3.7, rand));
  yield;
  const brown = toBuffer(ctx, brownNoise(sr, 4.3, rand));
  yield;
  const crackle = toBuffer(ctx, crackleLoop(sr, 3.1, 26, rand));
  yield;
  const drops = toBuffer(ctx, dropsLoop(sr, 2.9, 170, rand));
  yield;
  const creaks: AudioBuffer[] = [];
  for (let i = 0; i < 6; i++) {
    creaks.push(toBuffer(ctx, creakBuffer(sr, rand)));
    if (i % 2 === 1) yield;
  }
  return { white, pink, brown, crackle, drops, creaks };
}

/** Genera todos los búferes de una vez (≈ 50–120 ms de CPU). */
export function createNoiseBank(ctx: BaseAudioContext, rand: RandFn): NoiseBank {
  const it = noiseBankSteps(ctx, rand);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/* ------------------------------------------------------------------ */
/* Contexto de síntesis                                                */
/* ------------------------------------------------------------------ */

/** Lo que necesita una receta para sonar: contexto, destino, instante de inicio, ruido y azar. */
export interface Synth {
  ctx: BaseAudioContext;
  out: AudioNode;
  /** Instante base (s, reloj del contexto). */
  t: number;
  bank: NoiseBank;
  rand: RandFn;
}

export type NoiseColor = 'white' | 'pink' | 'brown';

export const midi = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Valor aleatorio en [a, b). */
export function rr(s: Synth, a: number, b: number): number {
  return a + (b - a) * s.rand();
}

/** Variación multiplicativa ±`amount` (p. ej. 0,08 = ±8 %). */
export function vary(s: Synth, amount: number): number {
  return 1 + (s.rand() * 2 - 1) * amount;
}

const EPS = 0.0001;

export interface EnvShape {
  /** Retardo desde `s.t` (s). */
  at?: number;
  attack?: number;
  hold?: number;
  decay?: number;
  /** Ganancia de pico. */
  gain?: number;
}

/**
 * Nodo de ganancia con envolvente ataque–mantenimiento–caída exponencial.
 * Devuelve el nodo y el instante final absoluto.
 */
export function envGain(s: Synth, dest: AudioNode, e: EnvShape): { node: GainNode; end: number } {
  const g = s.ctx.createGain();
  const t0 = s.t + (e.at ?? 0);
  const a = Math.max(0.001, e.attack ?? 0.005);
  const h = Math.max(0, e.hold ?? 0);
  const d = Math.max(0.005, e.decay ?? 0.2);
  const peak = Math.max(EPS * 2, e.gain ?? 1);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + a);
  if (h > 0) g.gain.setValueAtTime(peak, t0 + a + h);
  g.gain.exponentialRampToValueAtTime(EPS, t0 + a + h + d);
  g.gain.setValueAtTime(0, t0 + a + h + d + 0.01);
  g.connect(dest);
  return { node: g, end: t0 + a + h + d + 0.02 };
}

export interface FilterSpec {
  type: BiquadFilterType;
  freq: number;
  /** Barrido hasta esta frecuencia durante `sweep` s (exponencial). */
  freqTo?: number;
  sweep?: number;
  q?: number;
}

/** Cadena de filtros (en serie) hacia `dest`; devuelve la entrada. */
export function filters(s: Synth, dest: AudioNode, specs: FilterSpec[], at = 0): AudioNode {
  let next = dest;
  for (let i = specs.length - 1; i >= 0; i--) {
    const f = specs[i]!;
    const bq = s.ctx.createBiquadFilter();
    bq.type = f.type;
    const t0 = s.t + at;
    const nyq = s.ctx.sampleRate / 2 - 100;
    bq.frequency.setValueAtTime(Math.min(nyq, f.freq), t0);
    if (f.freqTo !== undefined) bq.frequency.exponentialRampToValueAtTime(Math.min(nyq, Math.max(20, f.freqTo)), t0 + Math.max(0.01, f.sweep ?? 0.2));
    if (f.q !== undefined) bq.Q.value = f.q;
    bq.connect(next);
    next = bq;
  }
  return next;
}

/* ------------------------------------------------------------------ */
/* Fuentes                                                             */
/* ------------------------------------------------------------------ */

export interface ToneSpec extends EnvShape {
  type?: OscillatorType;
  freq: number;
  /** Glissando hasta esta frecuencia en `glide` s (exponencial). */
  freqTo?: number;
  glide?: number;
  detune?: number;
  filter?: FilterSpec[];
  dest?: AudioNode;
  /** Vibrato: frecuencia (Hz) y profundidad (Hz). */
  vibrato?: [number, number];
}

/** Oscilador con envolvente. Devuelve el instante final absoluto. */
export function tone(s: Synth, p: ToneSpec): number {
  const dest = p.dest ?? s.out;
  const { node, end } = envGain(s, dest, p);
  const t0 = s.t + (p.at ?? 0);
  const o = s.ctx.createOscillator();
  o.type = p.type ?? 'sine';
  o.frequency.setValueAtTime(p.freq, t0);
  if (p.freqTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(10, p.freqTo), t0 + Math.max(0.005, p.glide ?? 0.1));
  if (p.detune) o.detune.value = p.detune;
  o.connect(p.filter?.length ? filters(s, node, p.filter, p.at ?? 0) : node);
  if (p.vibrato) {
    const lfo = s.ctx.createOscillator();
    const depth = s.ctx.createGain();
    lfo.frequency.value = p.vibrato[0];
    depth.gain.value = p.vibrato[1];
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(t0);
    lfo.stop(end);
  }
  o.start(t0);
  o.stop(end);
  return end;
}

export interface NoiseSpec extends EnvShape {
  color?: NoiseColor;
  /** Búfer propio (crackle, gotas…) en lugar de un ruido de color. */
  buffer?: AudioBuffer;
  rate?: number;
  filter?: FilterSpec[];
  dest?: AudioNode;
}

/** Ráfaga de ruido (o de un búfer en bucle) con envolvente y filtros. */
export function noise(s: Synth, p: NoiseSpec): number {
  const dest = p.dest ?? s.out;
  const { node, end } = envGain(s, dest, p);
  const t0 = s.t + (p.at ?? 0);
  const src = s.ctx.createBufferSource();
  const buf = p.buffer ?? s.bank[p.color ?? 'white'];
  src.buffer = buf;
  src.loop = true;
  if (p.rate) src.playbackRate.value = p.rate;
  src.connect(p.filter?.length ? filters(s, node, p.filter, p.at ?? 0) : node);
  src.start(t0, s.rand() * buf.duration * 0.9);
  src.stop(end);
  return end;
}

/** Reproduce un búfer (sin bucle) con ganancia y velocidad. */
export function sample(s: Synth, buf: AudioBuffer, p: { at?: number; gain?: number; rate?: number; filter?: FilterSpec[]; dest?: AudioNode; maxDur?: number }): number {
  const dest = p.dest ?? s.out;
  const t0 = s.t + (p.at ?? 0);
  const rate = p.rate ?? 1;
  const dur = Math.min(p.maxDur ?? Infinity, buf.duration / rate);
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(p.gain ?? 1, t0);
  if (p.maxDur !== undefined && p.maxDur < buf.duration / rate) {
    g.gain.setTargetAtTime(0, t0 + dur * 0.7, dur * 0.1);
  }
  g.connect(dest);
  const src = s.ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  src.connect(p.filter?.length ? filters(s, g, p.filter, p.at ?? 0) : g);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  return t0 + dur + 0.03;
}

/* ------------------------------------------------------------------ */
/* Bloques compuestos                                                  */
/* ------------------------------------------------------------------ */

/** Golpe seco de madera: senoide con caída de tono + clic de ruido en banda. */
export function knock(s: Synth, p: { at?: number; freq: number; gain?: number; decay?: number; dest?: AudioNode; bright?: number }): number {
  const g = p.gain ?? 0.5;
  const d = p.decay ?? 0.08;
  const e1 = tone(s, { at: p.at, freq: p.freq * 1.7, freqTo: p.freq, glide: 0.018, attack: 0.002, decay: d, gain: g * 0.8, dest: p.dest });
  const e2 = noise(s, {
    at: p.at,
    color: 'white',
    attack: 0.001,
    decay: d * 0.45,
    gain: g * 0.5,
    filter: [{ type: 'bandpass', freq: p.freq * (p.bright ?? 4), q: 1.6 }],
    dest: p.dest,
  });
  return Math.max(e1, e2);
}

/** Nota de marimba/vibráfono suave: fundamental + parcial 3,93× que se apaga antes. */
export function marimba(s: Synth, p: { at?: number; freq: number; gain?: number; decay?: number; dest?: AudioNode }): number {
  const g = p.gain ?? 0.3;
  const d = p.decay ?? 0.45;
  const e1 = tone(s, { at: p.at, freq: p.freq, attack: 0.004, decay: d, gain: g, dest: p.dest });
  const e2 = tone(s, { at: p.at, freq: p.freq * 3.93, attack: 0.002, decay: d * 0.22, gain: g * 0.22, dest: p.dest });
  const e3 = tone(s, { at: p.at, freq: p.freq * 2, attack: 0.003, decay: d * 0.4, gain: g * 0.08, dest: p.dest });
  return Math.max(e1, e2, e3);
}

/** Parciales inarmónicos con caídas propias (campanas, metal, monedas). */
export function partials(s: Synth, p: { at?: number; freq: number; ratios: number[]; gains: number[]; decays: number[]; gain?: number; dest?: AudioNode; attack?: number }): number {
  let end = 0;
  const g = p.gain ?? 0.3;
  for (let i = 0; i < p.ratios.length; i++) {
    const f = p.freq * p.ratios[i]!;
    if (f >= s.ctx.sampleRate / 2 - 200) continue;
    end = Math.max(end, tone(s, { at: p.at, freq: f, attack: p.attack ?? 0.002, decay: p.decays[i] ?? 0.3, gain: g * (p.gains[i] ?? 0.3), dest: p.dest }));
  }
  return end;
}

/** Campana de barco: parciales típicos de campana de bronce + golpe del badajo. */
export function bell(s: Synth, p: { at?: number; freq: number; gain?: number; dest?: AudioNode; length?: number }): number {
  const L = p.length ?? 1;
  const e1 = partials(s, {
    at: p.at,
    freq: p.freq,
    ratios: [0.5, 1, 1.19, 1.5, 2, 2.52, 2.66, 3.01, 4.17],
    gains: [0.3, 1, 0.45, 0.3, 0.5, 0.22, 0.18, 0.16, 0.08],
    decays: [3.2 * L, 2.4 * L, 1.7 * L, 1.5 * L, 1.2 * L, 0.8 * L, 0.7 * L, 0.5 * L, 0.35 * L],
    gain: p.gain ?? 0.2,
    dest: p.dest,
  });
  const e2 = noise(s, { at: p.at, color: 'white', attack: 0.001, decay: 0.015, gain: (p.gain ?? 0.2) * 0.6, filter: [{ type: 'highpass', freq: 2500 }], dest: p.dest });
  return Math.max(e1, e2);
}

/** Tintineo metálico (llaves, piezas, monedas). */
export function clink(s: Synth, p: { at?: number; freq: number; gain?: number; decay?: number; dest?: AudioNode }): number {
  const d = p.decay ?? 0.25;
  return partials(s, {
    at: p.at,
    freq: p.freq,
    ratios: [1, 2.76, 5.4, 8.93],
    gains: [1, 0.5, 0.25, 0.12],
    decays: [d, d * 0.6, d * 0.35, d * 0.2],
    gain: p.gain ?? 0.2,
    dest: p.dest,
  });
}

/** Clic seco (trinquete, carrete, interruptor). */
export function tick(s: Synth, p: { at?: number; freq?: number; gain?: number; decay?: number; dest?: AudioNode }): number {
  return noise(s, { at: p.at, color: 'white', attack: 0.0008, decay: p.decay ?? 0.008, gain: p.gain ?? 0.3, filter: [{ type: 'bandpass', freq: p.freq ?? 3000, q: 3 }], dest: p.dest });
}

/** Salpicadura: "plop" grave, rocío que se oscurece y gotas. `size` 0,2 (corcho) .. 1,5 (golpe de mar). */
export function splash(s: Synth, p: { at?: number; size?: number; gain?: number; dest?: AudioNode }): number {
  const size = p.size ?? 1;
  const g = p.gain ?? 0.5;
  const at = p.at ?? 0;
  const ends = [
    tone(s, { at, freq: rr(s, 380, 520) / Math.sqrt(size), freqTo: 120, glide: 0.07, attack: 0.002, decay: 0.08 + 0.05 * size, gain: g * 0.45 * Math.min(1, size + 0.3) }),
    noise(s, {
      at,
      color: 'white',
      attack: 0.006,
      decay: 0.25 + 0.35 * size,
      gain: g * 0.6,
      filter: [{ type: 'bandpass', freq: 3200, freqTo: 800, sweep: 0.3 + 0.25 * size, q: 0.7 }],
    }),
    noise(s, { at, color: 'pink', attack: 0.01, decay: 0.15 + 0.3 * size, gain: g * 0.5 * Math.min(1.2, size), filter: [{ type: 'lowpass', freq: 900 }] }),
    noise(s, { at: at + 0.08, buffer: s.bank.drops, attack: 0.05, hold: 0.1 * size, decay: 0.35 * size + 0.1, gain: g * 0.3 * Math.min(1, size) }),
  ];
  return Math.max(...ends);
}

/** Roce de tela o papel. */
export function rustle(s: Synth, p: { at?: number; dur?: number; freq?: number; gain?: number; dest?: AudioNode; paper?: boolean }): number {
  const dur = p.dur ?? 0.25;
  const g = p.gain ?? 0.25;
  const freq = p.freq ?? 1600;
  if (p.paper) {
    return noise(s, { at: p.at, buffer: s.bank.crackle, rate: rr(s, 0.6, 0.9), attack: dur * 0.2, hold: dur * 0.4, decay: dur * 0.4, gain: g, filter: [{ type: 'bandpass', freq, q: 0.7 }], dest: p.dest });
  }
  return noise(s, { at: p.at, color: 'pink', attack: dur * 0.35, decay: dur * 0.65, gain: g, filter: [{ type: 'bandpass', freq, q: 0.8 }], dest: p.dest });
}

/** Nota "de metal" tipo trompa (fanfarria): dos dientes de sierra desafinados con filtro que se abre. */
export function brass(s: Synth, p: { at?: number; freq: number; dur: number; gain?: number; dest?: AudioNode }): number {
  const dest = p.dest ?? s.out;
  const t0 = s.t + (p.at ?? 0);
  const g = p.gain ?? 0.12;
  const { node, end } = envGain(s, dest, { at: p.at, attack: 0.035, hold: Math.max(0, p.dur - 0.06), decay: 0.32, gain: g });
  const lp = s.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(p.freq * 1.5, t0);
  lp.frequency.exponentialRampToValueAtTime(Math.min(6000, p.freq * 6), t0 + 0.06);
  lp.frequency.exponentialRampToValueAtTime(Math.min(4000, p.freq * 3), t0 + Math.max(0.1, p.dur));
  lp.connect(node);
  for (const det of [-7, 6]) {
    const o = s.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(p.freq * 0.985, t0);
    o.frequency.exponentialRampToValueAtTime(p.freq, t0 + 0.05);
    o.detune.value = det;
    o.connect(lp);
    o.start(t0);
    o.stop(end);
  }
  return end;
}

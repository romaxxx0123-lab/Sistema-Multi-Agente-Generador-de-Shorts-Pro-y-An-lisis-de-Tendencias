/**
 * [AGENTE audio] Catálogo de efectos procedurales: una receta por nombre del bus 'sfx'
 * (más avisos, fanfarria, campanas y los sonidos puntuales del ambiente: truenos, gaviotas,
 * crujidos, golpes de ola).
 *
 * Cada receta programa nodos en un `Synth` y devuelve el instante absoluto en que termina.
 * `SFX[name]` añade la mezcla (bus, ganancia, distancia de referencia y máxima, separación
 * mínima entre repeticiones). Los nombres desconocidos se resuelven con `resolveSfx`.
 */
import { clamp } from '../core/math';
import type { Surface } from './mix';
import { bell, brass, clink, knock, marimba, midi, noise, partials, rr, rustle, sample, splash, tick, tone, vary, type Synth } from './synth';

export interface SfxOpts {
  /** Material bajo los pies (pasos). */
  surface?: Surface;
  /** 0..1 lluvia sobre la cubierta (pisadas mojadas). */
  wet?: number;
  run?: boolean;
  /** Distancia en metros (truenos). */
  distance?: number;
  /** Repeticiones (campanadas, llamadas de gaviota). */
  count?: number;
  /** 0..1 */
  intensity?: number;
}

export type SfxBus = 'ui' | 'sfx' | 'ext' | 'amb';

export interface SfxDef {
  play: (s: Synth, o: SfxOpts) => number;
  /** 'ui' sin espacializar ni apagar; 'sfx' efectos del mundo; 'ext' exterior (se apaga en interiores); 'amb' ambiente interior. */
  bus: SfxBus;
  /** Ganancia de mezcla. */
  gain: number;
  /** Distancia (m) a la que suena a pleno y a la que deja de oírse. */
  ref: number;
  max: number;
  /** Separación mínima (s) entre dos reproducciones del mismo nombre o grupo. */
  gap: number;
  /** Sin posición aunque el evento la traiga (avisos narrativos importantes). */
  global?: boolean;
  /** Grupo exclusivo: dos nombres del mismo grupo no suenan a la vez. */
  group?: string;
  /** Prioridad ante el límite de voces (0 baja … 3 alta). */
  priority: number;
}

/* ------------------------------------------------------------------ */
/* Recetas                                                             */
/* ------------------------------------------------------------------ */

const N = {
  G4: midi(67),
  A4: midi(69),
  B4: midi(71),
  C5: midi(72),
  D5: midi(74),
  E5: midi(76),
  Fs5: midi(78),
  G5: midi(79),
  A5: midi(81),
  B5: midi(83),
  C6: midi(84),
  E6: midi(88),
  G6: midi(91),
};

const max = (...v: number[]): number => Math.max(...v);

function paso(s: Synth, o: SfxOpts): number {
  const surf = o.surface ?? 'cubierta';
  const run = o.run ? 1.3 : 1;
  const v = vary(s, 0.1);
  const ends: number[] = [];
  // Golpe del talón.
  ends.push(tone(s, { freq: 105 * v, freqTo: 55 * v, glide: 0.06, attack: 0.003, decay: 0.085, gain: 0.55 * run }));
  // Cuerpo según el material.
  const body: Record<Surface, { f: number; q: number; d: number; g: number }> = {
    cubierta: { f: 640, q: 1.4, d: 0.06, g: 0.4 },
    techo: { f: 900, q: 1.1, d: 0.05, g: 0.35 },
    interior: { f: 480, q: 1.2, d: 0.05, g: 0.3 },
    bodega: { f: 300, q: 3.2, d: 0.11, g: 0.45 },
    escalera: { f: 420, q: 2.6, d: 0.09, g: 0.45 },
  };
  const b = body[surf];
  ends.push(noise(s, { color: 'pink', attack: 0.003, decay: b.d, gain: b.g * run, filter: [{ type: 'bandpass', freq: b.f * v, q: b.q }] }));
  // Roce de la suela.
  ends.push(noise(s, { at: 0.012, color: 'white', attack: 0.004, decay: 0.035, gain: 0.08 * run, filter: [{ type: 'bandpass', freq: 3200 * v, q: 0.9 }] }));
  if (surf === 'escalera' || surf === 'bodega') ends.push(knock(s, { at: 0.004, freq: 230 * v, gain: 0.18, decay: 0.07, bright: 3 }));
  // Alguna tabla cruje bajo el peso.
  if ((surf === 'cubierta' || surf === 'escalera' || surf === 'bodega') && s.rand() < 0.1) {
    const c = s.bank.creaks[Math.floor(s.rand() * s.bank.creaks.length)]!;
    ends.push(sample(s, c, { at: 0.02, rate: rr(s, 1.5, 2.1), gain: 0.12, maxDur: 0.22 }));
  }
  const wet = clamp(o.wet ?? 0, 0, 1);
  if (wet > 0.05) {
    ends.push(noise(s, { at: 0.005, color: 'white', attack: 0.004, decay: 0.09, gain: 0.3 * wet * run, filter: [{ type: 'highpass', freq: 1700 }] }));
    ends.push(noise(s, { at: 0.03, buffer: s.bank.drops, attack: 0.01, decay: 0.12, gain: 0.25 * wet }));
  }
  return max(...ends);
}

function aterrizar(s: Synth, o: SfxOpts): number {
  const k = o.intensity ?? 0.5;
  const ends = [
    tone(s, { freq: 90, freqTo: 42, glide: 0.1, attack: 0.003, decay: 0.16 + 0.08 * k, gain: 0.7 + 0.3 * k }),
    noise(s, { color: 'pink', attack: 0.003, decay: 0.1, gain: 0.45, filter: [{ type: 'lowpass', freq: 700 }] }),
    noise(s, { color: 'white', attack: 0.002, decay: 0.04, gain: 0.12, filter: [{ type: 'bandpass', freq: 2600, q: 1 }] }),
  ];
  if (k > 0.7) {
    // Tablas y objetos que vibran con el golpe.
    for (let i = 0; i < 3; i++) ends.push(knock(s, { at: 0.03 + i * rr(s, 0.03, 0.06), freq: rr(s, 160, 320), gain: 0.15, decay: 0.05 }));
  }
  return max(...ends);
}

function trueno(s: Synth, o: SfxOpts): number {
  const d = clamp(o.distance ?? 300, 20, 900);
  const near = clamp(1 - (d - 50) / 420, 0, 1);
  const delay = Math.min(2.2, d / 343);
  const t0 = s.t + delay;
  const len = 3.2 + 3 * s.rand() + 1.5 * (1 - near);
  const cutoff = 170 + 1500 * near * near;
  // Lejos suena más flojo (además de más grave y más tarde).
  const amp = 0.3 + 0.7 * near;
  const ends: number[] = [];
  // Retumbo: ruido marrón con varios "rodamientos" encadenados.
  const g = s.ctx.createGain();
  g.connect(s.out);
  const lp = s.ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(cutoff * 1.6, t0);
  lp.frequency.exponentialRampToValueAtTime(Math.max(90, cutoff * 0.6), t0 + len);
  lp.Q.value = 0.5;
  lp.connect(g);
  const src = s.ctx.createBufferSource();
  src.buffer = s.bank.brown;
  src.loop = true;
  src.playbackRate.value = rr(s, 0.75, 1.05);
  src.connect(lp);
  g.gain.setValueAtTime(0, t0);
  let t = t0;
  const rolls = 3 + Math.floor(s.rand() * 4);
  for (let i = 0; i < rolls; i++) {
    const rise = i === 0 ? 0.05 + 0.25 * (1 - near) : rr(s, 0.12, 0.35);
    const peak = amp * (i === 0 ? 1 : rr(s, 0.45, 0.95)) * Math.pow(0.85, i);
    t += rise;
    g.gain.linearRampToValueAtTime(peak, t);
    const fall = rr(s, 0.25, 0.7) * (len / 5);
    t += fall;
    g.gain.linearRampToValueAtTime(peak * rr(s, 0.35, 0.6), t);
  }
  g.gain.setTargetAtTime(0, t, Math.max(0.3, (t0 + len - t) / 3.5));
  const end = Math.max(t, t0 + len) + 1.5;
  g.gain.setValueAtTime(0, end);
  src.start(t0, s.rand() * 3);
  src.stop(end);
  ends.push(end);
  // Cerca: el rasgado del rayo, el estampido y la vibración de la tablazón.
  if (near > 0.45) {
    const dly = delay;
    ends.push(noise(s, { at: dly, color: 'white', attack: 0.002, decay: 0.18 + 0.2 * near, gain: 0.55 * near, filter: [{ type: 'highpass', freq: 900 }, { type: 'lowpass', freq: 7000 }] }));
    ends.push(noise(s, { at: dly + 0.01, buffer: s.bank.crackle, rate: 1.4, attack: 0.005, decay: 0.35, gain: 0.35 * near, filter: [{ type: 'bandpass', freq: 2500, q: 0.6 }] }));
    ends.push(tone(s, { at: dly, freq: 55, freqTo: 28, glide: 1.2, attack: 0.01, decay: 1.6, gain: 0.5 * near }));
  }
  ends.push(noise(s, { at: delay + 0.1, color: 'pink', attack: 0.3, decay: len * 0.5, gain: 0.18 * amp * (0.4 + near), filter: [{ type: 'bandpass', freq: 380, q: 0.8 }] }));
  return max(...ends);
}

function rayo(s: Synth, o: SfxOpts): number {
  return max(
    noise(s, { color: 'white', attack: 0.001, decay: 0.15, gain: 0.9, filter: [{ type: 'highpass', freq: 1200 }] }),
    noise(s, { at: 0.005, buffer: s.bank.crackle, rate: 1.7, attack: 0.002, decay: 0.45, gain: 0.6, filter: [{ type: 'bandpass', freq: 3200, q: 0.5 }] }),
    trueno(s, { ...o, distance: 30 }),
  );
}

function gaviota(s: Synth, o: SfxOpts): number {
  const calls = clamp(o.count ?? 1 + Math.floor(s.rand() * 4), 1, 6);
  const laugh = s.rand() < 0.4;
  let t = 0;
  let end = s.t;
  const base = rr(s, 950, 1350);
  for (let i = 0; i < calls; i++) {
    const dur = laugh ? rr(s, 0.09, 0.13) : rr(s, 0.2, 0.34);
    const f0 = base * vary(s, 0.05) * (laugh ? Math.pow(0.97, i) : 1);
    const t0 = s.t + t;
    const g = s.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1, t0 + 0.018);
    g.gain.setValueAtTime(1, t0 + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const bp = s.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = rr(s, 1700, 2300);
    bp.Q.value = 1.8;
    const lp = s.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    const osc = s.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f0 * (laugh ? 1.12 : 1.38), t0 + dur * 0.25);
    osc.frequency.exponentialRampToValueAtTime(f0 * (laugh ? 0.85 : 0.74), t0 + dur);
    // Aspereza de la garganta: vibrato rápido.
    const lfo = s.ctx.createOscillator();
    const depth = s.ctx.createGain();
    lfo.frequency.value = rr(s, 22, 34);
    depth.gain.value = f0 * 0.045;
    lfo.connect(depth);
    depth.connect(osc.frequency);
    osc.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    g.connect(s.out);
    osc.start(t0);
    lfo.start(t0);
    osc.stop(t0 + dur + 0.02);
    lfo.stop(t0 + dur + 0.02);
    end = t0 + dur + 0.03;
    t += dur + (laugh ? rr(s, 0.05, 0.09) : rr(s, 0.16, 0.34));
  }
  return end;
}

function crujido(s: Synth, o: SfxOpts): number {
  const c = s.bank.creaks[Math.floor(s.rand() * s.bank.creaks.length)]!;
  const deep = o.intensity ?? 0;
  return sample(s, c, { rate: rr(s, 0.85, 1.2) * (1 - 0.25 * deep), gain: 0.8, filter: [{ type: 'lowpass', freq: 3200 - 1400 * deep }] });
}

function golpeOla(s: Synth, o: SfxOpts): number {
  const k = clamp(o.intensity ?? 0.5, 0, 1.3);
  return max(
    noise(s, { color: 'pink', attack: 0.03 + 0.03 * s.rand(), decay: 0.4 + 0.4 * k, gain: 0.55, filter: [{ type: 'bandpass', freq: rr(s, 420, 650), freqTo: 260, sweep: 0.5, q: 0.9 }] }),
    noise(s, { color: 'brown', attack: 0.02, decay: 0.3 + 0.2 * k, gain: 0.6, filter: [{ type: 'lowpass', freq: 260 }] }),
    noise(s, { at: 0.03, color: 'white', attack: 0.02, decay: 0.25 + 0.2 * k, gain: 0.12 * k, filter: [{ type: 'highpass', freq: 2400 }] }),
  );
}

function golpeMar(s: Synth): number {
  return max(
    noise(s, { color: 'brown', attack: 0.03, decay: 1.2, gain: 0.8, filter: [{ type: 'lowpass', freq: 420 }] }),
    noise(s, { color: 'white', attack: 0.02, decay: 1.0, gain: 0.55, filter: [{ type: 'bandpass', freq: 1800, freqTo: 600, sweep: 0.9, q: 0.6 }] }),
    noise(s, { at: 0.15, buffer: s.bank.drops, attack: 0.1, hold: 0.3, decay: 0.8, gain: 0.4 }),
    tone(s, { freq: 70, freqTo: 40, glide: 0.4, attack: 0.01, decay: 0.6, gain: 0.45 }),
  );
}

function martillo(s: Synth): number {
  const v = vary(s, 0.06);
  return max(
    noise(s, { color: 'white', attack: 0.0008, decay: 0.012, gain: 0.55, filter: [{ type: 'highpass', freq: 2500 }] }),
    noise(s, { color: 'pink', attack: 0.001, decay: 0.07, gain: 0.7, filter: [{ type: 'bandpass', freq: 650 * v, q: 5 }] }),
    tone(s, { freq: 300 * v, freqTo: 170 * v, glide: 0.02, attack: 0.001, decay: 0.07, gain: 0.45 }),
    partials(s, { freq: 2700 * v, ratios: [1, 1.52, 2.33], gains: [1, 0.6, 0.35], decays: [0.12, 0.08, 0.05], gain: 0.12 }),
  );
}

function llave(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 5; i++) ends.push(tick(s, { at: i * 0.034 + rr(s, 0, 0.006), freq: rr(s, 2800, 3600), gain: 0.32, decay: 0.009 }));
  ends.push(clink(s, { at: 0.19, freq: rr(s, 850, 1000), gain: 0.22, decay: 0.18 }));
  ends.push(knock(s, { at: 0.19, freq: 260, gain: 0.2, decay: 0.05 }));
  return max(...ends);
}

function blandir(s: Synth): number {
  return noise(s, { color: 'pink', attack: 0.06, decay: 0.13, gain: 0.32, filter: [{ type: 'bandpass', freq: 500, freqTo: 1700, sweep: 0.18, q: 1.2 }] });
}

function blandirCubo(s: Synth): number {
  return max(
    noise(s, { color: 'pink', attack: 0.07, decay: 0.14, gain: 0.28, filter: [{ type: 'bandpass', freq: 400, freqTo: 1000, sweep: 0.2, q: 1.2 }] }),
    noise(s, { at: 0.05, color: 'brown', attack: 0.05, decay: 0.18, gain: 0.25, filter: [{ type: 'lowpass', freq: 650 }] }),
  );
}

function herramientaFalla(s: Synth): number {
  return max(knock(s, { freq: 150, gain: 0.4, decay: 0.08 }), tone(s, { type: 'triangle', at: 0.02, freq: 150, freqTo: 120, glide: 0.15, attack: 0.01, decay: 0.15, gain: 0.12 }));
}

function ganchoImpulso(s: Synth): number {
  return max(
    noise(s, { color: 'pink', attack: 0.22, decay: 0.12, gain: 0.25, filter: [{ type: 'bandpass', freq: 300, freqTo: 950, sweep: 0.3, q: 2 }] }),
    sample(s, s.bank.creaks[0]!, { rate: 1.6, gain: 0.12, maxDur: 0.3 }),
  );
}

function gancho(s: Synth): number {
  const t0 = s.t;
  // Zumbido del cabo girando: ruido modulado en amplitud por un LFO que frena.
  const am = s.ctx.createGain();
  am.gain.value = 0.5;
  const lfo = s.ctx.createOscillator();
  lfo.frequency.setValueAtTime(26, t0);
  lfo.frequency.exponentialRampToValueAtTime(9, t0 + 0.6);
  const depth = s.ctx.createGain();
  depth.gain.value = 0.5;
  lfo.connect(depth);
  depth.connect(am.gain);
  const env = s.ctx.createGain();
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(0.16, t0 + 0.04);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
  am.connect(env);
  env.connect(s.out);
  const bp = s.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900;
  bp.Q.value = 2.5;
  bp.connect(am);
  const src = s.ctx.createBufferSource();
  src.buffer = s.bank.white;
  src.loop = true;
  src.connect(bp);
  src.start(t0, s.rand());
  src.stop(t0 + 0.7);
  lfo.start(t0);
  lfo.stop(t0 + 0.7);
  return max(t0 + 0.7, noise(s, { color: 'pink', attack: 0.02, decay: 0.45, gain: 0.4, filter: [{ type: 'bandpass', freq: 1800, freqTo: 450, sweep: 0.45, q: 1.4 }] }));
}

function tirarCabo(s: Synth): number {
  const c = s.bank.creaks[Math.floor(s.rand() * s.bank.creaks.length)]!;
  return max(
    sample(s, c, { rate: rr(s, 1.25, 1.55), gain: 0.28, maxDur: 0.6 }),
    noise(s, { color: 'pink', attack: 0.1, decay: 0.4, gain: 0.16, filter: [{ type: 'bandpass', freq: 1100, q: 2 }] }),
  );
}

function picada(s: Synth): number {
  return max(
    tone(s, { freq: 900, freqTo: 1500, glide: 0.03, attack: 0.002, decay: 0.05, gain: 0.25 }),
    splash(s, { size: 0.3, gain: 0.4 }),
    tick(s, { at: 0.02, freq: 2400, gain: 0.12 }),
    tick(s, { at: 0.17, freq: 2200, gain: 0.1 }),
    splash(s, { at: 0.15, size: 0.2, gain: 0.25 }),
  );
}

function escapado(s: Synth): number {
  return max(
    splash(s, { size: 0.45, gain: 0.4 }),
    tone(s, { at: 0.05, freq: 500, freqTo: 240, glide: 0.2, attack: 0.005, decay: 0.2, gain: 0.15 }),
    tone(s, { at: 0.02, type: 'triangle', freq: 300, attack: 0.005, decay: 0.3, gain: 0.08, vibrato: [11, 25] }),
  );
}

function carrete(s: Synth, o: SfxOpts): number {
  const n = clamp(o.count ?? 22, 4, 40);
  let t = 0;
  let end = s.t;
  for (let i = 0; i < n; i++) {
    end = Math.max(end, tick(s, { at: t, freq: rr(s, 2600, 3100), gain: 0.17, decay: 0.006 }));
    t += 0.045 - (0.017 * i) / n;
  }
  return end;
}

function cana(s: Synth): number {
  return max(noise(s, { color: 'white', attack: 0.03, decay: 0.25, gain: 0.3, filter: [{ type: 'bandpass', freq: 2600, freqTo: 1100, sweep: 0.25, q: 2 }] }), carrete(s, { count: 14 }));
}

function pez(s: Synth): number {
  const ends = [splash(s, { size: 0.6, gain: 0.45 })];
  for (const at of [0.25, 0.44, 0.6]) ends.push(noise(s, { at: at + rr(s, 0, 0.04), color: 'pink', attack: 0.002, decay: 0.045, gain: 0.4, filter: [{ type: 'bandpass', freq: rr(s, 900, 1300), q: 1.2 }] }));
  ends.push(marimba(s, { at: 0.3, freq: N.C6, gain: 0.12, decay: 0.3 }), marimba(s, { at: 0.38, freq: N.E6, gain: 0.12, decay: 0.35 }));
  return max(...ends);
}

function pescaBasura(s: Synth): number {
  return max(splash(s, { size: 0.4, gain: 0.35 }), clink(s, { at: 0.2, freq: 700, gain: 0.25, decay: 0.22 }), knock(s, { at: 0.2, freq: 200, gain: 0.2 }));
}

function recoger(s: Synth): number {
  return max(knock(s, { freq: 170, gain: 0.45, decay: 0.1 }), tone(s, { at: 0.03, freq: 500, freqTo: 900, glide: 0.04, attack: 0.003, decay: 0.06, gain: 0.12 }));
}

function recogerResto(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 3; i++) ends.push(knock(s, { at: i * rr(s, 0.06, 0.09), freq: rr(s, 150, 320), gain: 0.35, decay: 0.08 }));
  ends.push(noise(s, { at: 0.12, buffer: s.bank.drops, attack: 0.02, hold: 0.15, decay: 0.3, gain: 0.25 }));
  return max(...ends);
}

function rescate(s: Synth): number {
  return max(recogerResto(s), marimba(s, { at: 0.2, freq: N.E5, gain: 0.2 }), marimba(s, { at: 0.3, freq: N.G5, gain: 0.2 }), marimba(s, { at: 0.4, freq: N.C6, gain: 0.22, decay: 0.7 }));
}

function hiss(s: Synth, dur: number, gain: number): number {
  return noise(s, { color: 'white', attack: 0.03, hold: dur * 0.3, decay: dur, gain, filter: [{ type: 'highpass', freq: 2300 }, { type: 'lowpass', freq: 9000 }] });
}

function aguaFuego(s: Synth): number {
  return max(splash(s, { size: 0.7, gain: 0.4 }), hiss(s, 1.1, 0.35), noise(s, { at: 0.05, buffer: s.bank.crackle, rate: 1.2, attack: 0.01, decay: 0.5, gain: 0.25 }));
}

function fuego(s: Synth): number {
  return max(
    noise(s, { color: 'pink', attack: 0.15, decay: 0.8, gain: 0.45, filter: [{ type: 'lowpass', freq: 200, freqTo: 2500, sweep: 0.3 }] }),
    noise(s, { at: 0.1, buffer: s.bank.crackle, attack: 0.05, hold: 0.3, decay: 0.5, gain: 0.35 }),
  );
}

function fuga(s: Synth): number {
  const t0 = s.t;
  const am = s.ctx.createGain();
  am.gain.value = 0.7;
  const lfo = s.ctx.createOscillator();
  lfo.frequency.value = 7;
  const d = s.ctx.createGain();
  d.gain.value = 0.3;
  lfo.connect(d);
  d.connect(am.gain);
  am.connect(s.out);
  lfo.start(t0);
  lfo.stop(t0 + 1.4);
  return max(
    t0 + 1.4,
    noise(s, { color: 'white', attack: 0.1, hold: 0.6, decay: 0.5, gain: 0.3, filter: [{ type: 'bandpass', freq: 3000, q: 0.8 }], dest: am }),
    noise(s, { at: 0.2, buffer: s.bank.drops, rate: 0.7, attack: 0.1, hold: 0.6, decay: 0.4, gain: 0.25 }),
  );
}

function averia(s: Synth): number {
  const t0 = s.t;
  const ends = [clink(s, { freq: 220, gain: 0.35, decay: 0.4 }), knock(s, { freq: 120, gain: 0.45, decay: 0.12 })];
  // Máquina que se para rechinando.
  const o = s.ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(75, t0 + 0.05);
  o.frequency.exponentialRampToValueAtTime(32, t0 + 1.1);
  const fm = s.ctx.createOscillator();
  fm.frequency.value = 13;
  const fmd = s.ctx.createGain();
  fmd.gain.value = 14;
  fm.connect(fmd);
  fmd.connect(o.frequency);
  const bp = s.ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420;
  bp.Q.value = 1.6;
  const g = s.ctx.createGain();
  g.gain.setValueAtTime(0, t0 + 0.05);
  g.gain.linearRampToValueAtTime(0.3, t0 + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.15);
  o.connect(bp);
  bp.connect(g);
  g.connect(s.out);
  o.start(t0 + 0.05);
  fm.start(t0 + 0.05);
  o.stop(t0 + 1.2);
  fm.stop(t0 + 1.2);
  ends.push(t0 + 1.2);
  for (const at of [0.5, 0.78, 1.05]) ends.push(knock(s, { at, freq: rr(s, 80, 110), gain: 0.3, decay: 0.07, bright: 2 }));
  return max(...ends);
}

function interruptor(s: Synth): number {
  return max(
    tick(s, { freq: 2500, gain: 0.4, decay: 0.006 }),
    knock(s, { at: 0.022, freq: 320, gain: 0.25, decay: 0.03, bright: 6 }),
    tone(s, { at: 0.03, freq: 100, attack: 0.02, decay: 0.15, gain: 0.06 }),
  );
}

function obraIniciada(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 3; i++) ends.push(knock(s, { at: i * 0.22, freq: rr(s, 170, 210), gain: 0.4, decay: 0.08 }));
  ends.push(marimba(s, { at: 0.66, freq: N.G5, gain: 0.15 }));
  return max(...ends);
}

function obraTerminada(s: Synth): number {
  const ends = [knock(s, { freq: 190, gain: 0.4, decay: 0.08 })];
  [N.C5, N.E5, N.G5, N.C6].forEach((f, i) => ends.push(marimba(s, { at: 0.18 + i * 0.075, freq: f, gain: 0.2, decay: i === 3 ? 0.9 : 0.5 })));
  return max(...ends);
}

function demoler(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 6; i++) ends.push(knock(s, { at: rr(s, 0, 0.5), freq: rr(s, 100, 380), gain: rr(s, 0.2, 0.4), decay: 0.09 }));
  ends.push(noise(s, { color: 'brown', attack: 0.02, decay: 0.6, gain: 0.55, filter: [{ type: 'lowpass', freq: 600 }] }));
  ends.push(noise(s, { at: 0.05, buffer: s.bank.crackle, rate: 0.8, attack: 0.02, decay: 0.45, gain: 0.3 }));
  return max(...ends);
}

function reparar(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 3; i++) ends.push(tick(s, { at: i * 0.04, freq: 3000, gain: 0.25 }));
  ends.push(knock(s, { at: 0.14, freq: 240, gain: 0.3, decay: 0.07 }));
  ends.push(marimba(s, { at: 0.26, freq: N.C6, gain: 0.18 }), marimba(s, { at: 0.34, freq: N.G6, gain: 0.16, decay: 0.6 }));
  return max(...ends);
}

function encargo(s: Synth): number {
  return max(knock(s, { freq: 1100, gain: 0.18, decay: 0.03, bright: 2.5 }), rustle(s, { at: 0.02, dur: 0.12, freq: 3200, gain: 0.12, paper: true }));
}

function fabricar(s: Synth): number {
  return max(
    rustle(s, { dur: 0.22, freq: 1500, gain: 0.2 }),
    knock(s, { at: 0.12, freq: 300, gain: 0.3, decay: 0.06 }),
    knock(s, { at: 0.24, freq: 420, gain: 0.25, decay: 0.05 }),
    marimba(s, { at: 0.34, freq: N.E6, gain: 0.12, decay: 0.4 }),
  );
}

function fabricado(s: Synth): number {
  return max(clink(s, { freq: 1800, gain: 0.18, decay: 0.3 }), marimba(s, { at: 0.12, freq: N.G5, gain: 0.15 }), marimba(s, { at: 0.2, freq: N.C6, gain: 0.15, decay: 0.6 }));
}

function cocinado(s: Synth): number {
  return max(
    noise(s, { buffer: s.bank.crackle, rate: 1.7, attack: 0.05, hold: 0.25, decay: 0.3, gain: 0.25, filter: [{ type: 'highpass', freq: 2500 }] }),
    hiss(s, 0.5, 0.1),
    partials(s, { at: 0.25, freq: 2100, ratios: [1, 2.48, 4.1], gains: [1, 0.4, 0.15], decays: [0.7, 0.35, 0.2], gain: 0.16 }),
  );
}

function plantar(s: Synth): number {
  return max(
    noise(s, { color: 'brown', attack: 0.004, decay: 0.06, gain: 0.45, filter: [{ type: 'lowpass', freq: 700 }] }),
    noise(s, { at: 0.18, color: 'brown', attack: 0.004, decay: 0.06, gain: 0.4, filter: [{ type: 'lowpass', freq: 650 }] }),
    rustle(s, { at: 0.05, dur: 0.15, freq: 1200, gain: 0.12 }),
  );
}

function cosechar(s: Synth): number {
  return max(rustle(s, { dur: 0.22, freq: 2800, gain: 0.25 }), tone(s, { at: 0.12, freq: 320, freqTo: 170, glide: 0.04, attack: 0.002, decay: 0.05, gain: 0.3 }));
}

function cuidar(s: Synth): number {
  return max(rustle(s, { dur: 0.3, freq: 2200, gain: 0.22 }), noise(s, { at: 0.2, color: 'brown', attack: 0.005, decay: 0.05, gain: 0.25, filter: [{ type: 'lowpass', freq: 600 }] }));
}

function comercio(s: Synth): number {
  const ends: number[] = [];
  [0, 0.06, 0.13, 0.19, 0.3].forEach((at) => ends.push(clink(s, { at: at + rr(s, 0, 0.02), freq: rr(s, 2400, 3600), gain: 0.12, decay: rr(s, 0.2, 0.35) })));
  ends.push(marimba(s, { at: 0.38, freq: N.E5, gain: 0.15 }), marimba(s, { at: 0.46, freq: N.B5, gain: 0.15, decay: 0.6 }));
  return max(...ends);
}

function comer(s: Synth): number {
  const ends: number[] = [];
  let t = 0;
  for (let i = 0; i < 4; i++) {
    ends.push(noise(s, { at: t, color: 'white', attack: 0.004, decay: rr(s, 0.04, 0.08), gain: rr(s, 0.2, 0.32), filter: [{ type: 'bandpass', freq: rr(s, 1600, 3000), q: 1.5 }] }));
    ends.push(noise(s, { at: t, color: 'pink', attack: 0.003, decay: 0.04, gain: 0.15, filter: [{ type: 'lowpass', freq: 500 }] }));
    t += rr(s, 0.14, 0.2);
  }
  return max(...ends);
}

function beber(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 3; i++) {
    const at = i * 0.3 + rr(s, 0, 0.03);
    ends.push(tone(s, { at, freq: rr(s, 240, 280), freqTo: rr(s, 480, 560), glide: 0.07, attack: 0.01, decay: 0.09, gain: 0.3, filter: [{ type: 'lowpass', freq: 1200 }] }));
    ends.push(noise(s, { at, color: 'pink', attack: 0.01, decay: 0.08, gain: 0.12, filter: [{ type: 'lowpass', freq: 700 }] }));
  }
  return max(...ends);
}

function curar(s: Synth): number {
  return max(
    rustle(s, { dur: 0.3, freq: 3000, gain: 0.2, paper: true }),
    marimba(s, { at: 0.15, freq: N.C6, gain: 0.12 }),
    marimba(s, { at: 0.25, freq: N.E6, gain: 0.12 }),
    marimba(s, { at: 0.35, freq: N.G6, gain: 0.12, decay: 0.7 }),
  );
}

function equipar(s: Synth): number {
  return max(rustle(s, { dur: 0.26, freq: 1400, gain: 0.3 }), rustle(s, { at: 0.2, dur: 0.15, freq: 1900, gain: 0.18 }), tick(s, { at: 0.3, freq: 2000, gain: 0.12, decay: 0.01 }));
}

function soltar(s: Synth): number {
  return max(
    knock(s, { freq: 130, gain: 0.5, decay: 0.12 }),
    noise(s, { color: 'pink', attack: 0.003, decay: 0.08, gain: 0.25, filter: [{ type: 'lowpass', freq: 900 }] }),
    knock(s, { at: 0.07, freq: 260, gain: 0.15, decay: 0.05 }),
  );
}

function dormir(s: Synth): number {
  return max(
    rustle(s, { dur: 0.5, freq: 900, gain: 0.2 }),
    tone(s, { at: 0.1, freq: N.E5, attack: 0.08, decay: 0.6, gain: 0.08 }),
    tone(s, { at: 0.45, freq: N.C5, attack: 0.08, decay: 0.7, gain: 0.08 }),
    tone(s, { at: 0.8, freq: N.G4, attack: 0.1, decay: 1.0, gain: 0.08 }),
  );
}

function despertar(s: Synth): number {
  return max(
    rustle(s, { dur: 0.4, freq: 1000, gain: 0.18 }),
    tone(s, { at: 0.05, freq: N.G4, attack: 0.06, decay: 0.5, gain: 0.08 }),
    tone(s, { at: 0.3, freq: N.C5, attack: 0.06, decay: 0.5, gain: 0.08 }),
    tone(s, { at: 0.55, freq: N.E5, attack: 0.06, decay: 0.8, gain: 0.08 }),
  );
}

function desmayo(s: Synth): number {
  return max(tone(s, { freq: 520, freqTo: 130, glide: 0.9, attack: 0.05, hold: 0.4, decay: 0.6, gain: 0.12, vibrato: [5, 12] }), aterrizar({ ...s, t: s.t + 0.55 }, { intensity: 0.8 }));
}

function plano(s: Synth): number {
  return max(rustle(s, { dur: 0.45, freq: 3500, gain: 0.35, paper: true }), rustle(s, { at: 0.25, dur: 0.3, freq: 2800, gain: 0.25, paper: true }));
}

function llenar(s: Synth): number {
  const ends = [noise(s, { color: 'white', attack: 0.05, hold: 0.7, decay: 0.15, gain: 0.35, filter: [{ type: 'bandpass', freq: 350, freqTo: 1500, sweep: 0.9, q: 6 }] })];
  for (let i = 0; i < 7; i++) ends.push(tone(s, { at: rr(s, 0.05, 0.8), freq: rr(s, 500, 1200), freqTo: rr(s, 900, 1800), glide: 0.02, attack: 0.002, decay: 0.025, gain: 0.07 }));
  return max(...ends);
}

function llenarCubo(s: Synth): number {
  return max(splash(s, { size: 0.8, gain: 0.45 }), noise(s, { at: 0.25, color: 'pink', attack: 0.05, decay: 0.2, gain: 0.25, filter: [{ type: 'bandpass', freq: 700, q: 1 }] }), noise(s, { at: 0.5, color: 'pink', attack: 0.05, decay: 0.2, gain: 0.18, filter: [{ type: 'bandpass', freq: 650, q: 1 }] }));
}

function muerte(s: Synth): number {
  const ends: number[] = [];
  for (const f of [110, 130.81, 164.81]) {
    ends.push(tone(s, { freq: f, type: 'triangle', attack: 0.4, hold: 1.0, decay: 1.6, gain: 0.09 }));
    ends.push(tone(s, { freq: f * 2, attack: 0.5, hold: 0.8, decay: 1.4, gain: 0.03 }));
  }
  ends.push(bell(s, { at: 0.2, freq: 330, gain: 0.08, length: 1.4 }));
  return max(...ends);
}

/* Interfaz -------------------------------------------------------- */

function uiClic(s: Synth): number {
  const v = vary(s, 0.04);
  return max(tone(s, { freq: 2200 * v, freqTo: 1400 * v, glide: 0.008, attack: 0.001, decay: 0.03, gain: 0.5 }), tick(s, { freq: 4200, gain: 0.15, decay: 0.005 }));
}

function uiAbrir(s: Synth): number {
  return max(marimba(s, { freq: N.A5, gain: 0.3, decay: 0.18 }), marimba(s, { at: 0.055, freq: N.E6, gain: 0.3, decay: 0.25 }), rustle(s, { dur: 0.08, freq: 3000, gain: 0.08 }));
}

function uiCerrar(s: Synth): number {
  return max(marimba(s, { freq: N.E6, gain: 0.26, decay: 0.15 }), marimba(s, { at: 0.055, freq: N.A5, gain: 0.26, decay: 0.2 }), rustle(s, { dur: 0.08, freq: 2400, gain: 0.07 }));
}

function uiError(s: Synth): number {
  return max(
    tone(s, { type: 'triangle', freq: 235, freqTo: 196, glide: 0.04, attack: 0.004, decay: 0.12, gain: 0.5, filter: [{ type: 'lowpass', freq: 1200 }] }),
    tone(s, { type: 'triangle', at: 0.11, freq: 220, freqTo: 175, glide: 0.04, attack: 0.004, decay: 0.15, gain: 0.45, filter: [{ type: 'lowpass', freq: 1100 }] }),
  );
}

function uiMover(s: Synth): number {
  return max(noise(s, { color: 'pink', attack: 0.01, decay: 0.06, gain: 0.3, filter: [{ type: 'bandpass', freq: 1800, q: 1.2 }] }), knock(s, { at: 0.04, freq: 900, gain: 0.12, decay: 0.03 }));
}

function avisoInfo(s: Synth): number {
  return marimba(s, { freq: N.G5, gain: 0.32, decay: 0.45 });
}

function avisoBien(s: Synth): number {
  return max(marimba(s, { freq: N.E5, gain: 0.3, decay: 0.35 }), marimba(s, { at: 0.09, freq: N.B5, gain: 0.3, decay: 0.55 }));
}

function avisoAtencion(s: Synth): number {
  return max(
    marimba(s, { freq: N.B5, gain: 0.32, decay: 0.3 }),
    marimba(s, { at: 0.13, freq: N.G5, gain: 0.32, decay: 0.45 }),
    tone(s, { type: 'triangle', freq: N.B4, attack: 0.01, decay: 0.3, gain: 0.06 }),
  );
}

function avisoPeligro(s: Synth): number {
  const ends: number[] = [];
  [N.D5, N.A4, N.D5, N.A4].forEach((f, i) => {
    ends.push(marimba(s, { at: i * 0.15, freq: f, gain: 0.32, decay: 0.28 }));
    ends.push(tone(s, { type: 'triangle', at: i * 0.15, freq: f / 2, attack: 0.01, decay: 0.2, gain: 0.08 }));
  });
  return max(...ends);
}

function tutorial(s: Synth): number {
  return max(marimba(s, { freq: N.C6, gain: 0.2, decay: 0.3 }), marimba(s, { at: 0.07, freq: N.E6, gain: 0.2, decay: 0.3 }), marimba(s, { at: 0.14, freq: N.G6, gain: 0.18, decay: 0.5 }));
}

function fanfarria(s: Synth): number {
  const ends: number[] = [];
  [N.G4, N.C5, N.E5, N.G5].forEach((f, i) => ends.push(brass(s, { at: i * 0.12, freq: f, dur: 0.13, gain: 0.13 })));
  for (const f of [N.C5, N.E5, N.G5, N.C6]) ends.push(brass(s, { at: 0.5, freq: f, dur: 0.75, gain: 0.08 }));
  ends.push(tone(s, { at: 0.5, freq: N.C5 / 2, attack: 0.05, hold: 0.6, decay: 0.5, gain: 0.12 }));
  [N.C6, N.E6, N.G6].forEach((f, i) => ends.push(marimba(s, { at: 0.55 + i * 0.06, freq: f * 2, gain: 0.06, decay: 0.5 })));
  ends.push(tone(s, { at: 0.6, freq: N.C6 * 2, attack: 0.2, hold: 0.4, decay: 0.6, gain: 0.025, vibrato: [6, 10] }));
  return max(...ends);
}

function campana(s: Synth, o: SfxOpts): number {
  const n = clamp(o.count ?? 2, 1, 8);
  const fast = n > 3;
  let end = s.t;
  for (let i = 0; i < n; i++) end = Math.max(end, bell(s, { at: i * (fast ? 0.32 : 0.62), freq: 620, gain: 0.22, length: fast ? 0.6 : 1 }));
  return end;
}

function sirena(s: Synth): number {
  const ends: number[] = [];
  for (const at of [0, 1.9]) {
    const len = at === 0 ? 1.1 : 1.5;
    for (const [f, g] of [
      [98, 0.16],
      [147, 0.1],
      [196, 0.05],
    ] as const) {
      ends.push(tone(s, { at, type: 'sawtooth', freq: f * 0.94, freqTo: f, glide: 0.18, attack: 0.18, hold: len, decay: 0.55, gain: g, filter: [{ type: 'lowpass', freq: 700, q: 0.7 }] }));
    }
  }
  return max(...ends);
}

function descubrimiento(s: Synth): number {
  return max(
    marimba(s, { freq: N.D5, gain: 0.26, decay: 0.5 }),
    marimba(s, { at: 0.13, freq: N.Fs5, gain: 0.26, decay: 0.5 }),
    marimba(s, { at: 0.26, freq: N.A5, gain: 0.28, decay: 0.9 }),
    tone(s, { at: 0.1, freq: N.D5 / 2, attack: 0.3, hold: 0.4, decay: 0.9, gain: 0.07 }),
    tone(s, { at: 0.1, freq: N.A4, attack: 0.3, hold: 0.4, decay: 0.9, gain: 0.04 }),
  );
}

function burbujas(s: Synth): number {
  const ends: number[] = [];
  for (let i = 0; i < 9; i++) ends.push(tone(s, { at: rr(s, 0, 0.7), freq: rr(s, 400, 900), freqTo: rr(s, 900, 1700), glide: 0.03, attack: 0.002, decay: 0.04, gain: 0.12 }));
  ends.push(splash(s, { at: 0.3, size: 0.35, gain: 0.25 }));
  return max(...ends);
}

/** Formantes (F1, F2) de vocales para el murmullo de los habitantes. */
const VOWELS: [number, number][] = [
  [800, 1200],
  [420, 2000],
  [310, 2250],
  [470, 850],
  [350, 720],
  [620, 1650],
];

/**
 * Murmullo de un habitante que habla (sílabas con formantes de vocal, ininteligibles).
 * `intensity` = timbre de voz 0 (grave) .. 1 (aguda); `count` = sílabas.
 */
function voz(s: Synth, o: SfxOpts): number {
  const pitch = 100 + 130 * clamp(o.intensity ?? 0.5, 0, 1);
  const n = clamp(o.count ?? 3 + Math.floor(s.rand() * 4), 1, 9);
  const question = s.rand() < 0.25;
  let t = 0;
  let end = s.t;
  for (let i = 0; i < n; i++) {
    const dur = rr(s, 0.07, 0.15);
    const [f1, f2] = VOWELS[Math.floor(s.rand() * VOWELS.length)]!;
    const t0 = s.t + t;
    const last = i === n - 1;
    const p0 = pitch * vary(s, 0.07);
    const osc = s.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(p0, t0);
    osc.frequency.linearRampToValueAtTime(p0 * (last ? (question ? 1.25 : 0.82) : vary(s, 0.08)), t0 + dur);
    const env = s.ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(1, t0 + 0.015);
    env.gain.setValueAtTime(1, t0 + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    env.connect(s.out);
    for (const [f, q, g] of [
      [f1, 5, 1],
      [f2, 7, 0.45],
    ] as const) {
      const bp = s.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * vary(s, 0.05);
      bp.Q.value = q;
      const gg = s.ctx.createGain();
      gg.gain.value = g;
      osc.connect(bp);
      bp.connect(gg);
      gg.connect(env);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
    end = t0 + dur + 0.03;
    t += dur + rr(s, 0.02, 0.06) + (s.rand() < 0.15 ? 0.14 : 0);
  }
  return end;
}

/** Latido (salud crítica): dos golpes graves. */
function latido(s: Synth): number {
  return max(
    tone(s, { freq: 62, freqTo: 44, glide: 0.08, attack: 0.008, decay: 0.12, gain: 0.8 }),
    tone(s, { at: 0.2, freq: 55, freqTo: 40, glide: 0.08, attack: 0.008, decay: 0.16, gain: 0.55 }),
  );
}

function objeto(s: Synth): number {
  return max(tone(s, { freq: 620, freqTo: 980, glide: 0.05, attack: 0.003, decay: 0.08, gain: 0.25 }), knock(s, { freq: 260, gain: 0.15, decay: 0.05 }));
}

function generico(s: Synth): number {
  return knock(s, { freq: 600, gain: 0.25, decay: 0.04, bright: 3 });
}

function salto(s: Synth): number {
  return max(
    noise(s, { color: 'pink', attack: 0.03, decay: 0.12, gain: 0.22, filter: [{ type: 'bandpass', freq: 1200, freqTo: 2200, sweep: 0.15, q: 1 }] }),
    knock(s, { freq: 110, gain: 0.25, decay: 0.06 }),
  );
}

function chapoteo(s: Synth): number {
  return splash(s, { size: 1, gain: 0.5 });
}

function chapoteoCorcho(s: Synth): number {
  return max(splash(s, { size: 0.3, gain: 0.35 }), tone(s, { freq: 1100, freqTo: 380, glide: 0.04, attack: 0.002, decay: 0.05, gain: 0.15 }));
}

function apagar(s: Synth): number {
  return hiss(s, 0.7, 0.25);
}

function expedicion(s: Synth): number {
  return max(knock(s, { freq: 140, gain: 0.4, decay: 0.12 }), knock(s, { at: 0.18, freq: 115, gain: 0.3, decay: 0.12 }), campana({ ...s, t: s.t + 0.35 }, { count: 1 }));
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

type DefIn = Omit<SfxDef, 'ref' | 'max' | 'gap' | 'priority' | 'bus'> & Partial<Pick<SfxDef, 'ref' | 'max' | 'gap' | 'priority' | 'bus'>>;

function def(d: DefIn): SfxDef {
  return { bus: 'sfx', ref: 2.5, max: 40, gap: 0.03, priority: 1, ...d };
}

const UI = { bus: 'ui' as const, global: true, gap: 0.035, priority: 2 };

export const SFX: Record<string, SfxDef> = {
  // Jugador
  paso: def({ play: paso, gain: 0.25, gap: 0.09, max: 25, priority: 0 }),
  paso_npc: def({ play: paso, gain: 0.13, gap: 0.02, ref: 2, max: 16, priority: 0 }),
  voz: def({ play: voz, gain: 0.16, gap: 0.05, ref: 2.5, max: 18, priority: 1 }),
  latido: def({ play: latido, gain: 0.2, gap: 0.3, global: true, priority: 2 }),
  salto: def({ play: salto, gain: 0.45, gap: 0.1 }),
  aterrizar: def({ play: (s) => aterrizar(s, { intensity: 0.4 }), gain: 0.18, gap: 0.12 }),
  aterrizar_fuerte: def({ play: (s) => aterrizar(s, { intensity: 1 }), gain: 0.24, gap: 0.12, group: 'aterrizar' }),
  comer: def({ play: comer, gain: 1.5, gap: 0.3 }),
  beber: def({ play: beber, gain: 0.32, gap: 0.3 }),
  curar: def({ play: curar, gain: 0.62, gap: 0.3 }),
  equipar: def({ play: equipar, gain: 0.85, gap: 0.2 }),
  soltar: def({ play: soltar, gain: 0.35, gap: 0.08 }),
  dormir: def({ play: dormir, gain: 0.77, gap: 1, global: true }),
  despertar: def({ play: despertar, gain: 0.77, gap: 1, global: true }),
  desmayo: def({ play: desmayo, gain: 0.25, gap: 1, global: true, priority: 3 }),
  plano: def({ play: plano, gain: 1.08, gap: 0.3 }),
  llenar: def({ play: llenar, gain: 1.25, gap: 0.3 }),
  llenar_cubo: def({ play: llenarCubo, gain: 0.45, gap: 0.3, max: 30 }),
  // Herramientas
  martillo: def({ play: martillo, gain: 0.42, gap: 0.06, max: 45 }),
  llave: def({ play: llave, gain: 0.43, gap: 0.08, max: 35 }),
  blandir: def({ play: blandir, gain: 1.2, gap: 0.15 }),
  blandir_cubo: def({ play: blandirCubo, gain: 0.7, gap: 0.15 }),
  herramienta_falla: def({ play: herramientaFalla, gain: 0.3, gap: 0.2 }),
  gancho_impulso: def({ play: ganchoImpulso, gain: 0.75, gap: 0.2 }),
  gancho: def({ play: gancho, gain: 1.5, gap: 0.15 }),
  tirar_cabo: def({ play: tirarCabo, gain: 0.41, gap: 0.25 }),
  chapoteo: def({ play: chapoteo, gain: 0.73, gap: 0.08, ref: 4, max: 60, bus: 'ext' }),
  chapoteo_corcho: def({ play: chapoteoCorcho, gain: 0.5, gap: 0.08, ref: 4, max: 50, bus: 'ext' }),
  picada: def({ play: picada, gain: 0.6, gap: 0.1, ref: 5, max: 50, bus: 'ext', priority: 2 }),
  escapado: def({ play: escapado, gain: 0.6, gap: 0.2, ref: 5, max: 50, bus: 'ext' }),
  carrete: def({ play: (s) => carrete(s, {}), gain: 2.7, gap: 0.2 }),
  cana: def({ play: cana, gain: 2.15, gap: 0.2 }),
  pez: def({ play: pez, gain: 0.69, gap: 0.2, priority: 2 }),
  pesca_basura: def({ play: pescaBasura, gain: 0.28, gap: 0.2 }),
  recoger: def({ play: recoger, gain: 0.29, gap: 0.1 }),
  recoger_resto: def({ play: recogerResto, gain: 0.47, gap: 0.1, ref: 5, max: 50 }),
  rescate: def({ play: rescate, gain: 0.5, gap: 0.3, ref: 6, max: 60, priority: 2 }),
  agua_fuego: def({ play: aguaFuego, gain: 0.6, gap: 0.2, group: 'apagar' }),
  apagar: def({ play: apagar, gain: 0.68, gap: 0.3, group: 'apagar' }),
  // Barco y mundo
  trueno: def({ play: trueno, gain: 0.58, gap: 0.6, bus: 'ext', global: true, priority: 3 }),
  rayo: def({ play: rayo, gain: 0.8, gap: 0.6, bus: 'ext', ref: 10, max: 200, priority: 3 }),
  golpe_mar: def({ play: golpeMar, gain: 0.48, gap: 0.4, bus: 'ext', ref: 8, max: 80, priority: 2 }),
  fuego: def({ play: fuego, gain: 0.82, gap: 0.5, ref: 5, max: 60, priority: 2 }),
  fuga: def({ play: fuga, gain: 0.55, gap: 0.5, ref: 4, max: 40 }),
  averia: def({ play: averia, gain: 0.32, gap: 0.5, ref: 5, max: 60, priority: 2 }),
  interruptor: def({ play: interruptor, gain: 0.52, gap: 0.1, max: 30 }),
  obra_iniciada: def({ play: obraIniciada, gain: 0.46, gap: 0.3, ref: 5, max: 60 }),
  obra_terminada: def({ play: obraTerminada, gain: 0.45, gap: 0.5, global: true, priority: 2 }),
  demoler: def({ play: demoler, gain: 0.58, gap: 0.3, ref: 5, max: 60 }),
  reparar: def({ play: reparar, gain: 0.65, gap: 0.3, ref: 4, max: 45 }),
  encargo: def({ play: encargo, gain: 0.53, gap: 0.1, max: 30 }),
  fabricar: def({ play: fabricar, gain: 0.45, gap: 0.2 }),
  fabricado: def({ play: fabricado, gain: 0.4, gap: 0.3, ref: 4, max: 40 }),
  cocinado: def({ play: cocinado, gain: 0.57, gap: 0.3, ref: 4, max: 40 }),
  plantar: def({ play: plantar, gain: 0.66, gap: 0.15 }),
  cosechar: def({ play: cosechar, gain: 0.37, gap: 0.15 }),
  cuidar: def({ play: cuidar, gain: 1.48, gap: 0.15 }),
  comercio: def({ play: comercio, gain: 0.6, gap: 0.3 }),
  expedicion_vuelve: def({ play: expedicion, gain: 0.27, gap: 1, global: true, priority: 2 }),
  muerte: def({ play: muerte, gain: 0.53, gap: 2, global: true, priority: 3 }),
  // Ambiente puntual
  gaviota: def({ play: gaviota, gain: 0.1, gap: 0.5, bus: 'ext', global: true, priority: 0 }),
  crujido: def({ play: crujido, gain: 0.13, gap: 0.8, bus: 'amb', global: true, priority: 0 }),
  golpe_ola: def({ play: golpeOla, gain: 0.3, gap: 0.3, bus: 'ext', global: true, priority: 0 }),
  burbujas: def({ play: burbujas, gain: 0.7, gap: 0.5, bus: 'ext', global: true }),
  // Interfaz, avisos y música
  ui_clic: def({ ...UI, play: uiClic, gain: 0.14 }),
  ui_abrir: def({ ...UI, play: uiAbrir, gain: 0.21, gap: 0.08 }),
  ui_cerrar: def({ ...UI, play: uiCerrar, gain: 0.22, gap: 0.08 }),
  ui_error: def({ ...UI, play: uiError, gain: 0.2, gap: 0.15 }),
  ui_mover: def({ ...UI, play: uiMover, gain: 0.7 }),
  aviso_info: def({ ...UI, play: avisoInfo, gain: 0.24, gap: 0.25, group: 'aviso' }),
  aviso_bien: def({ ...UI, play: avisoBien, gain: 0.28, gap: 0.25, group: 'aviso' }),
  aviso_atencion: def({ ...UI, play: avisoAtencion, gain: 0.35, gap: 0.25, group: 'aviso' }),
  aviso_peligro: def({ ...UI, play: avisoPeligro, gain: 0.45, gap: 0.4, group: 'aviso', priority: 3 }),
  tutorial: def({ ...UI, play: tutorial, gain: 0.32, gap: 0.5 }),
  objeto: def({ ...UI, play: objeto, gain: 0.25, gap: 0.12, priority: 1 }),
  fanfarria: def({ ...UI, play: fanfarria, gain: 0.5, gap: 1, priority: 3 }),
  campana: def({ ...UI, play: campana, gain: 0.24, gap: 1, priority: 2 }),
  sirena: def({ ...UI, play: sirena, gain: 0.43, gap: 3, priority: 2, bus: 'ext' }),
  descubrimiento: def({ ...UI, play: descubrimiento, gain: 0.42, gap: 1, priority: 2 }),
  generico: def({ play: generico, gain: 0.35, gap: 0.05, priority: 0 }),
};

/** Alias: nombres que otros sistemas usan para el mismo sonido. */
export const SFX_ALIASES: Record<string, string> = {
  click: 'ui_clic',
  clic: 'ui_clic',
  ui_click: 'ui_clic',
  ui_ok: 'ui_clic',
  ui_seleccion: 'ui_clic',
  aviso: 'aviso_atencion',
  alerta: 'aviso_peligro',
  peligro: 'aviso_peligro',
  exito: 'aviso_bien',
  fabricar_mano: 'fabricar',
  craft: 'fabricar',
  pescar: 'pez',
  splash: 'chapoteo',
  salpicadura: 'chapoteo',
  coger: 'recoger',
  recoger_objeto: 'recoger',
  pasos: 'paso',
  relampago: 'trueno',
  ola: 'golpe_ola',
  extinguir: 'apagar',
  incendio: 'fuego',
  romper: 'averia',
  desbloqueo: 'fanfarria',
  comprar: 'comercio',
  vender: 'comercio',
  abrir: 'ui_abrir',
  cerrar: 'ui_cerrar',
  error: 'ui_error',
};

/** Nombre canónico del catálogo (alias, prefijos conocidos o el genérico). */
export function resolveSfx(name: string): string {
  if (SFX[name]) return name;
  const alias = SFX_ALIASES[name];
  if (alias) return alias;
  const n = name.toLowerCase();
  if (SFX[n]) return n;
  if (n.startsWith('ui_')) return n.includes('error') ? 'ui_error' : n.includes('cerr') ? 'ui_cerrar' : n.includes('abr') ? 'ui_abrir' : 'ui_clic';
  if (n.includes('chapot') || n.includes('agua')) return 'chapoteo';
  if (n.includes('golpe') || n.includes('caer')) return 'soltar';
  return 'generico';
}

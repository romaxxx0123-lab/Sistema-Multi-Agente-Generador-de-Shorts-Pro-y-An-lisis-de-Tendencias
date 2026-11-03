/**
 * [AGENTE audio] Prueba de síntesis en el navegador con `OfflineAudioContext`: renderiza cada
 * receta del catálogo y varias escenas de ambiente (calma, tormenta fuera y dentro, bodega con
 * lluvia, gaviotas, máquinas y fuego, grúa, vivero y radar, sala común y ahumadero, Puerto
 * Esperanza de día y la fiesta con fuegos) por el mismo grafo de mezcla del juego, y mide pico y RMS.
 *
 * Criterios: ninguna muestra no finita, señal audible (no silenciosa) y sin saturar (pico < 0 dBFS
 * antes de cualquier recorte del navegador). Se lanza con `__game.cmd.audioTest()`.
 */
import { Ambience, type EmitterMix } from './ambience';
import { hasNonFinite, peakOf, rmsOf, seededRandom, toDb } from './dsp';
import { createMixGraph, VoicePool } from './engine';
import { ambientMix, type AmbientInput, type EmitterKind } from './mix';
import { SFX, type SfxOpts } from './sfx';
import { createNoiseBank, type NoiseBank } from './synth';

export interface SelfTestRow {
  name: string;
  seconds: number;
  peakDb: number;
  rmsDb: number;
  ok: boolean;
  reason?: string;
}

export interface SelfTestResult {
  ok: boolean;
  sampleRate: number;
  ms: number;
  recipes: SelfTestRow[];
  scenes: SelfTestRow[];
  failures: string[];
}

const SR = 44100;
/** Pico máximo admitido (−0,2 dBFS). */
const MAX_PEAK = 0.977;
/** Nivel mínimo para considerar que suena algo (−60 dBFS de pico). */
const MIN_PEAK = 0.001;
/**
 * El limitador (DynamicsCompressor) arranca con reducción de ganancia durante los primeros
 * ~100 ms de un render: se deja asentar antes de medir (en el juego el contexto ya está en marcha).
 */
const SETTLE = 0.35;

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  const g = globalThis as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return g.OfflineAudioContext ?? g.webkitOfflineAudioContext ?? null;
}

function analyse(name: string, buf: AudioBuffer, seconds: number, minPeak = MIN_PEAK): SelfTestRow {
  let peak = 0;
  let sumSq = 0;
  let n = 0;
  let bad = false;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    if (hasNonFinite(d)) bad = true;
    peak = Math.max(peak, peakOf(d));
    const r = rmsOf(d);
    sumSq += r * r * d.length;
    n += d.length;
  }
  const rms = Math.sqrt(sumSq / Math.max(1, n));
  const row: SelfTestRow = { name, seconds: Math.round(seconds * 100) / 100, peakDb: round1(toDb(peak)), rmsDb: round1(toDb(rms)), ok: true };
  if (bad) {
    row.ok = false;
    row.reason = 'muestras no finitas';
  } else if (peak < minPeak) {
    row.ok = false;
    row.reason = 'silencio';
  } else if (peak > MAX_PEAK) {
    row.ok = false;
    row.reason = 'satura';
  }
  return row;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Variantes de cada receta que merece la pena probar además de la de por defecto. */
const VARIANTS: { name: string; label: string; opts: SfxOpts }[] = [
  { name: 'paso', label: 'paso (bodega)', opts: { surface: 'bodega' } },
  { name: 'paso', label: 'paso (escalera, corriendo)', opts: { surface: 'escalera', run: true } },
  { name: 'paso', label: 'paso (cubierta mojada)', opts: { surface: 'cubierta', wet: 1, run: true } },
  { name: 'trueno', label: 'trueno (cercano)', opts: { distance: 40 } },
  { name: 'trueno', label: 'trueno (lejano)', opts: { distance: 800 } },
  { name: 'campana', label: 'campana (alarma)', opts: { count: 6 } },
  { name: 'golpe_ola', label: 'golpe_ola (temporal)', opts: { intensity: 1.3 } },
  { name: 'fuego_artificial', label: 'fuego_artificial (cercano)', opts: { distance: 60 } },
  { name: 'fuego_artificial', label: 'fuego_artificial (lejano)', opts: { distance: 700 } },
  { name: 'campana_puerto', label: 'campana_puerto (cinco)', opts: { count: 5 } },
];

async function renderRecipe(Ctor: OfflineCtor, bank: NoiseBank, name: string, opts: SfxOpts, label: string): Promise<SelfTestRow> {
  const def = SFX[name]!;
  // Primera pasada sin renderizar: averigua cuánto dura.
  const probe = new Ctor(2, SR, SR);
  const probeGraph = createMixGraph(probe, bank);
  const probeEnd = new VoicePool(probeGraph, seededRandom(7)).play(name, def, opts, { gain: def.gain, delay: SETTLE }) ?? 1;
  const seconds = Math.min(14, Math.max(0.3, probeEnd + 0.3));
  const ctx = new Ctor(2, Math.ceil(SR * seconds), SR);
  const graph = createMixGraph(ctx, bank);
  new VoicePool(graph, seededRandom(7)).play(name, def, opts, { gain: def.gain, pan: name === 'paso' ? 0.3 : 0, delay: SETTLE });
  const buf = await ctx.startRendering();
  return analyse(label, buf, seconds - SETTLE);
}

interface Scene {
  name: string;
  seconds: number;
  input: AmbientInput;
  emitters?: [EmitterKind, Partial<EmitterMix>][];
  /** Efectos (prueba de saturación de la mezcla completa); el tercer valor, retardo extra (s). */
  burst?: [string, SfxOpts, number?][];
  /** Pico mínimo exigido (escenas tranquilas). */
  minPeak?: number;
}

const OUT = { exposure: 1, roof: 0, kind: 'exterior' as const };

const SCENES: Scene[] = [
  { name: 'calma en cubierta', seconds: 6, input: { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 6, storm: false, env: OUT, gulls: 0 } },
  { name: 'fondeados junto a una isla (gaviotas)', seconds: 8, input: { waveHeight: 0.5, wind: 0.2, rain: 0, speed: 0, storm: false, env: OUT, gulls: 1 } },
  { name: 'lluvia en cubierta', seconds: 5, input: { waveHeight: 1.2, wind: 0.55, rain: 0.7, speed: 6, storm: false, env: OUT, gulls: 0 } },
  { name: 'tormenta en cubierta', seconds: 6, input: { waveHeight: 2.6, wind: 1, rain: 1, speed: 6, storm: true, env: OUT, gulls: 0 } },
  { name: 'tormenta en un camarote', seconds: 5, input: { waveHeight: 2.6, wind: 1, rain: 1, speed: 6, storm: true, env: { exposure: 0.18, roof: 1, kind: 'habitacion' }, gulls: 0 } },
  { name: 'lluvia en la bodega', seconds: 5, input: { waveHeight: 1.2, wind: 0.55, rain: 0.7, speed: 6, storm: false, env: { exposure: 0.07, roof: 0.55, kind: 'bodega' }, gulls: 0 } },
  {
    name: 'generador, torno y bomba cerca',
    seconds: 4,
    input: { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 6, storm: false, env: { exposure: 0.07, roof: 0.55, kind: 'bodega' }, gulls: 0 },
    emitters: [
      ['generador', { gain: 1, pan: -0.4 }],
      ['torno', { gain: 0.6, pan: 0.3 }],
      ['bomba', { gain: 0.5, pan: 0.6, cutoff: 1200 }],
    ],
  },
  {
    name: 'motor y fogón',
    seconds: 4,
    input: { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 9, storm: false, env: OUT, gulls: 0 },
    emitters: [
      ['motor', { gain: 1 }],
      ['fogon', { gain: 1, pan: 0.5 }],
    ],
  },
  {
    name: 'incendio en tormenta + efectos a la vez',
    seconds: 6,
    input: { waveHeight: 2.6, wind: 1, rain: 1, speed: 6, storm: true, env: OUT, gulls: 0 },
    emitters: [
      ['incendio', { gain: 1.3 }],
      ['generador', { gain: 1.2, rough: true }],
    ],
    burst: [
      ['rayo', {}],
      ['golpe_mar', {}],
      ['martillo', {}],
      ['chapoteo', {}],
      ['aviso_peligro', {}],
      ['fanfarria', {}],
      ['campana', { count: 6 }],
      ['averia', {}],
    ],
  },
  {
    name: 'grúa izando junto al vivero y el radar',
    seconds: 4,
    input: { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 6, storm: false, env: OUT, gulls: 0 },
    emitters: [
      ['grua', { gain: 1, intensity: 1, pan: -0.3 }],
      ['vivero', { gain: 0.8, intensity: 0.75, pan: 0.4 }],
      ['radar', { gain: 0.6, pan: 0.1 }],
    ],
    burst: [
      ['grua_saca', {}],
      ['grua_lanzar', {}, 1.5],
      ['radar_contacto', {}, 2],
    ],
  },
  {
    name: 'sala común con estufa, ahumadero cerca',
    seconds: 4,
    input: { waveHeight: 0.6, wind: 0.3, rain: 0.3, speed: 6, storm: false, env: { exposure: 0.17, roof: 1, kind: 'habitacion' }, gulls: 0 },
    emitters: [
      ['sala', { gain: 1, intensity: 1 }],
      ['fogon', { gain: 0.55, pan: -0.5 }],
      ['ahumadero', { gain: 0.5, cutoff: 1300, pan: 0.6 }],
    ],
    burst: [
      ['cartas', {}],
      ['radio', {}, 0.6],
    ],
  },
  {
    name: 'Puerto Esperanza de día (muelle, campanas, gaviotas)',
    seconds: 6,
    input: { waveHeight: 0.5, wind: 0.25, rain: 0, speed: 0, storm: false, env: OUT, gulls: 1, port: 1, crowd: 0.8 },
    burst: [
      ['campana_puerto', { count: 3 }],
      ['campana_boya', {}, 1.2],
      ['gaviota', {}, 0.4],
    ],
  },
  {
    name: 'llegada: música, fuegos artificiales y fiesta en el muelle',
    seconds: 10,
    input: { waveHeight: 0.5, wind: 0.25, rain: 0, speed: 0, storm: false, env: OUT, gulls: 0.5, port: 1, crowd: 1 },
    burst: [
      ['llegada', {}],
      ['fuego_artificial', { distance: 120 }, 0.3],
      ['fuego_artificial', { distance: 260 }, 0.7],
      ['fuego_artificial', { distance: 90 }, 1.1],
      ['fuego_artificial', { distance: 400 }, 1.5],
      ['fuego_artificial', { distance: 150 }, 1.8],
      ['fuego_artificial', { distance: 70 }, 2.2],
      ['campana_puerto', { count: 4 }, 3],
    ],
  },
];

async function renderScene(Ctor: OfflineCtor, bank: NoiseBank, sc: Scene): Promise<SelfTestRow> {
  const ctx = new Ctor(2, Math.ceil(SR * sc.seconds), SR);
  const graph = createMixGraph(ctx, bank);
  const env = sc.input.env;
  // Mismo cálculo que el juego para el exterior oído desde dentro.
  const mix = ambientMix(sc.input);
  graph.extFilter.frequency.value = mix.extCutoff;
  graph.extGain.gain.value = mix.extGain;
  const ambience = new Ambience(ctx, bank, graph.ext, graph.amb, graph.sfx);
  const pool = new VoicePool(graph, seededRandom(11));
  const emitters = new Map<EmitterKind, EmitterMix>();
  for (const [k, m] of sc.emitters ?? []) emitters.set(k, { gain: 1, pan: 0, cutoff: 20000, intensity: 1, rough: false, ...m });
  const step = (dt: number): void => {
    for (const shot of ambience.update(dt, mix, emitters, true)) {
      const def = SFX[shot.name]!;
      pool.play(shot.name, def, { intensity: env.kind === 'bodega' ? 1 : shot.intensity }, { gain: def.gain * shot.gain, pan: shot.pan });
    }
    pool.cleanup();
  };
  step(0.05);
  for (const [name, opts, extra] of sc.burst ?? []) pool.play(name, SFX[name]!, opts, { gain: SFX[name]!.gain, delay: SETTLE + 0.5 + (extra ?? 0) });
  const dt = 0.05;
  for (let t = dt; t < sc.seconds - dt; t += dt) {
    void ctx.suspend(t).then(() => {
      step(dt);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return analyse(sc.name, buf, sc.seconds, sc.minPeak ?? 0.003);
}

/** Renderiza todo y devuelve las medidas. Rechaza solo si no hay `OfflineAudioContext`. */
export async function runAudioSelfTest(opts: { seconds?: number; only?: string[] } = {}): Promise<SelfTestResult> {
  const Ctor = offlineCtor();
  if (!Ctor) throw new Error('Este navegador no tiene OfflineAudioContext');
  const t0 = performance.now();
  const bankCtx = new Ctor(1, 1, SR);
  const bank = createNoiseBank(bankCtx, seededRandom(1234));
  const recipes: SelfTestRow[] = [];
  const names = Object.keys(SFX).filter((n) => !opts.only || opts.only.includes(n));
  for (const name of names) recipes.push(await renderRecipe(Ctor, bank, name, {}, name));
  for (const v of VARIANTS) if (!opts.only || opts.only.includes(v.name)) recipes.push(await renderRecipe(Ctor, bank, v.name, v.opts, v.label));
  const scenes: SelfTestRow[] = [];
  if (!opts.only) for (const sc of SCENES) scenes.push(await renderScene(Ctor, bank, opts.seconds ? { ...sc, seconds: opts.seconds } : sc));
  const failures = [...recipes, ...scenes].filter((r) => !r.ok).map((r) => `${r.name}: ${r.reason} (pico ${r.peakDb} dB)`);
  return { ok: failures.length === 0, sampleRate: SR, ms: Math.round(performance.now() - t0), recipes, scenes, failures };
}

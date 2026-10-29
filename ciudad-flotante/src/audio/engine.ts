/**
 * [AGENTE audio] Motor de audio: grafo de mezcla (buses), reserva de voces con límite y
 * prioridades, y el `AudioContext` real del juego.
 *
 *   ui ─────────────────────────────────────────────┐
 *   sfx ──────────────┐                              ├─► master (volumen) ─► limitador ─► salida
 *   amb ─────────┐    ├─► world ─► muffle (dormir, ─┘
 *   ext ─► filtro ─► extGain ─┘   pausa, muerte)
 *        (interiores)
 *
 * `createMixGraph` y `VoicePool` sirven igual para un `OfflineAudioContext` (pruebas).
 */
import { clamp } from '../core/math';
import { Ambience } from './ambience';
import { seededRandom, type RandFn } from './dsp';
import { SFX, type SfxBus, type SfxDef, type SfxOpts } from './sfx';
import { noiseBankSteps, type NoiseBank, type Synth } from './synth';

export interface MixGraph {
  ctx: BaseAudioContext;
  bank: NoiseBank;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  /** Mundo: efectos + ambiente (se apaga al dormir, en pausa y al morir). */
  world: GainNode;
  muffle: BiquadFilterNode;
  sfx: GainNode;
  /** Padre del ambiente (fundidos al empezar partida, menú). */
  ambient: GainNode;
  /** Ambiente interior (techo, casco). */
  amb: GainNode;
  /** Exterior: mar, viento, lluvia, gaviotas, truenos. */
  ext: GainNode;
  extFilter: BiquadFilterNode;
  extGain: GainNode;
  ui: GainNode;
}

/** Crea el grafo de buses sobre cualquier contexto (real u offline). */
export function createMixGraph(ctx: BaseAudioContext, bank: NoiseBank, dest: AudioNode = ctx.destination): MixGraph {
  const gain = (v: number): GainNode => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const master = gain(1);
  const limiter = ctx.createDynamicsCompressor();
  // Limitador suave: solo actúa en picos (truenos cercanos con lluvia y efectos a la vez).
  limiter.threshold.value = -4;
  limiter.knee.value = 4;
  limiter.ratio.value = 16;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.2;
  master.connect(limiter);
  limiter.connect(dest);

  const ui = gain(1);
  ui.connect(master);

  const muffle = ctx.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.5;
  const world = gain(1);
  world.connect(muffle);
  muffle.connect(master);

  const sfx = gain(1);
  sfx.connect(world);
  const ambient = gain(1);
  ambient.connect(world);
  const amb = gain(1);
  amb.connect(ambient);
  const extGain = gain(1);
  extGain.connect(ambient);
  const extFilter = ctx.createBiquadFilter();
  extFilter.type = 'lowpass';
  extFilter.frequency.value = 18000;
  extFilter.Q.value = 0.5;
  extFilter.connect(extGain);
  const ext = gain(1);
  ext.connect(extFilter);
  return { ctx, bank, master, limiter, world, muffle, sfx, ambient, amb, ext, extFilter, extGain, ui };
}

export function busNode(g: MixGraph, bus: SfxBus): AudioNode {
  return g[bus];
}

/* ------------------------------------------------------------------ */
/* Voces                                                               */
/* ------------------------------------------------------------------ */

export interface VoiceParams {
  /** Ganancia final (mezcla × distancia × oclusión). */
  gain: number;
  pan?: number;
  /** Paso bajo (oclusión, espalda); ≥ 19 kHz = sin filtro. */
  cutoff?: number;
  /** Retardo (s). */
  delay?: number;
  /** Bus forzado (por defecto el del catálogo). */
  bus?: SfxBus;
}

interface Voice {
  name: string;
  input: GainNode;
  chain: AudioNode[];
  end: number;
  priority: number;
  started: number;
}

/** Reserva de voces de efectos: límite, prioridades y limpieza de nodos terminados. */
export class VoicePool {
  private voices: Voice[] = [];
  /** Reproducciones por nombre (estadística de depuración). */
  readonly played = new Map<string, number>();

  constructor(
    private readonly graph: MixGraph,
    private readonly rand: RandFn,
    readonly limit = 28,
  ) {}

  get count(): number {
    return this.voices.length;
  }

  /** Reproduce `name` del catálogo. Devuelve el instante final o null si no sonó. */
  play(name: string, def: SfxDef, opts: SfxOpts, p: VoiceParams): number | null {
    const ctx = this.graph.ctx;
    const now = ctx.currentTime;
    if (!(p.gain > 0.0005) || !Number.isFinite(p.gain)) return null;
    if (this.voices.length >= this.limit) {
      // Sacrifica la voz menos importante (y más antigua) si la nueva lo es más.
      let worst = -1;
      for (let i = 0; i < this.voices.length; i++) {
        const v = this.voices[i]!;
        if (v.end <= now + 0.05) continue;
        if (worst < 0 || v.priority < this.voices[worst]!.priority || (v.priority === this.voices[worst]!.priority && v.started < this.voices[worst]!.started)) worst = i;
      }
      if (worst < 0 || this.voices[worst]!.priority > def.priority) return null;
      this.kill(this.voices[worst]!, now);
    }
    const input = ctx.createGain();
    input.gain.value = Math.min(4, p.gain);
    const chain: AudioNode[] = [];
    let head: AudioNode = input;
    const cutoff = p.cutoff ?? 20000;
    if (cutoff < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(cutoff, 60, 20000);
      lp.Q.value = 0.5;
      head.connect(lp);
      head = lp;
      chain.push(lp);
    }
    const pan = clamp(p.pan ?? 0, -1, 1);
    if (Math.abs(pan) > 0.01 && typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner();
      sp.pan.value = pan;
      head.connect(sp);
      head = sp;
      chain.push(sp);
    }
    head.connect(busNode(this.graph, p.bus ?? def.bus));
    const s: Synth = { ctx, out: input, t: now + 0.006 + Math.max(0, p.delay ?? 0), bank: this.graph.bank, rand: this.rand };
    let end: number;
    try {
      end = def.play(s, opts);
    } catch (err) {
      input.disconnect();
      for (const n of chain) n.disconnect();
      throw err;
    }
    if (!Number.isFinite(end) || end < s.t) end = s.t + 2;
    this.voices.push({ name, input, chain, end: Math.min(end, s.t + 20), priority: def.priority, started: now });
    this.played.set(name, (this.played.get(name) ?? 0) + 1);
    return end;
  }

  private kill(v: Voice, now: number): void {
    v.input.gain.cancelScheduledValues(now);
    v.input.gain.setTargetAtTime(0, now, 0.012);
    v.end = now + 0.06;
    v.priority = -1;
  }

  /** Desconecta las voces que ya terminaron. */
  cleanup(): void {
    const now = this.graph.ctx.currentTime;
    if (!this.voices.length) return;
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.end + 0.08 < now) {
        v.input.disconnect();
        for (const n of v.chain) n.disconnect();
      } else keep.push(v);
    }
    this.voices = keep;
  }

  /** Corta todo (cambio de partida, cierre). */
  stopAll(): void {
    const now = this.graph.ctx.currentTime;
    for (const v of this.voices) this.kill(v, now);
  }

  activeNames(): string[] {
    return this.voices.map((v) => v.name);
  }
}

/* ------------------------------------------------------------------ */
/* Contexto real                                                       */
/* ------------------------------------------------------------------ */

type AudioCtor = new (opts?: AudioContextOptions) => AudioContext;

/** Constructor de `AudioContext` del navegador, o null si no hay WebAudio. */
export function audioContextCtor(): AudioCtor | null {
  const g = globalThis as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** ¿Hay ya una activación del usuario (gesto) en la página? (true si el navegador no lo sabe decir). */
export function hasUserActivation(): boolean {
  const nav = (globalThis as unknown as { navigator?: { userActivation?: { hasBeenActive: boolean } } }).navigator;
  const ua = nav?.userActivation;
  return ua ? ua.hasBeenActive : true;
}

export class AudioEngine {
  /** Disponibles cuando `ready` (los búferes de ruido se generan a lo largo de unos frames). */
  graph!: MixGraph;
  ambience!: Ambience;
  voices!: VoicePool;
  private builder: Generator<void, NoiseBank, void> | null;

  private constructor(readonly ctx: AudioContext) {
    this.builder = noiseBankSteps(ctx, seededRandom((Math.random() * 1e9) | 0));
  }

  /** Búferes generados y grafo montado. */
  get ready(): boolean {
    return this.builder === null;
  }

  /** Avanza un paso la preparación (llamar una vez por frame). Devuelve true al quedar lista. */
  pump(): boolean {
    if (!this.builder) return false;
    const r = this.builder.next();
    if (!r.done) return false;
    this.builder = null;
    const bank = r.value;
    this.graph = createMixGraph(this.ctx, bank);
    this.voices = new VoicePool(this.graph, Math.random);
    this.ambience = new Ambience(this.ctx, bank, this.graph.ext, this.graph.amb, this.graph.sfx);
    return true;
  }

  /** Crea el motor o devuelve null si WebAudio no existe o falla. */
  static create(): AudioEngine | null {
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      try {
        ctx = new Ctor();
      } catch {
        return null;
      }
    }
    try {
      return new AudioEngine(ctx);
    } catch (err) {
      void ctx.close().catch(() => undefined);
      throw err;
    }
  }

  get running(): boolean {
    return this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  resume(): void {
    if (this.ctx.state === 'closed') return;
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  suspend(): void {
    if (this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** Fija un parámetro con suavizado (sin chasquidos). */
  ramp(param: AudioParam, v: number, tau = 0.08): void {
    if (!Number.isFinite(v)) return;
    param.setTargetAtTime(v, this.ctx.currentTime, tau);
  }

  private analyser: AnalyserNode | null = null;

  /**
   * Medidor de la salida real (depuración): pico y RMS en dBFS de los últimos ~0,7 s.
   * El analizador se crea la primera vez que se pide (no cuesta nada en partida normal).
   */
  meter(): { peakDb: number; rmsDb: number } | null {
    if (!this.ready) return null;
    if (!this.analyser) {
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 32768;
      this.graph.limiter.connect(this.analyser);
    }
    const buf = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i]!;
      sum += v * v;
      if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    const db = (v: number): number => Math.round((v > 1e-10 ? 20 * Math.log10(v) : -200) * 10) / 10;
    return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / buf.length)) };
  }

  play(name: string, opts: SfxOpts, p: VoiceParams): number | null {
    const def = SFX[name];
    if (!def) return null;
    return this.voices.play(name, def, opts, p);
  }

  dispose(): void {
    this.builder = null;
    if (this.voices) this.voices.stopAll();
    if (this.ambience) this.ambience.dispose();
    this.analyser?.disconnect();
    void this.ctx.close().catch(() => undefined);
  }
}

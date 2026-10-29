/**
 * [AGENTE audio] Ambiente continuo: mar (fondo, rompiente con oleaje lento, agua junto al casco
 * y retumbo en la bodega), viento con ráfagas y silbido, lluvia (siseo, gotas, aguacero y
 * tamborileo en el techo) y fuentes del barco (generador, motor, potabilizadora, torno, fogón,
 * incendios) espacializadas.
 *
 * Las capas se crean una vez y sus fuentes se arrancan solo cuando suenan: una capa en silencio
 * más de unos segundos para su fuente (no gasta CPU). También programa los sonidos puntuales del
 * ambiente (crujidos, golpes de ola, gaviotas) a ritmo aleatorio.
 */
import { clamp, lerp } from '../core/math';
import { EMITTER_REF, type AmbientMix, type EmitterKind } from './mix';
import type { NoiseBank } from './synth';

/** Ganancias de referencia de cada capa (con nivel relativo 1). Ajustadas midiendo RMS offline. */
export const LAYER_GAIN = {
  seaDeep: 0.28,
  seaWash: 0.18,
  hullRush: 0.2,
  hullRumble: 0.2,
  windBody: 0.55,
  windWhistle: 0.05,
  windLow: 0.35,
  rainHiss: 0.18,
  rainPatter: 0.2,
  rainRoar: 0.24,
  roofWash: 0.2,
  roofDrops: 0.19,
} as const;

export type LayerName = keyof typeof LAYER_GAIN;

/** Ganancia de referencia de cada fuente del barco. */
export const EMITTER_GAIN: Record<EmitterKind, number> = { generador: 0.26, motor: 0.14, bomba: 0.24, torno: 0.77, fogon: 0.54, incendio: 0.72 };

const SILENT = 0.0005;
const STOP_AFTER = 2.5;

interface FilterInit {
  type: BiquadFilterType;
  freq: number;
  q?: number;
}

/** Capa en bucle: fuente (ruido o búfer) → filtros → ganancia → destino. La fuente se recrea al volver a sonar. */
class Loop {
  readonly gain: GainNode;
  readonly filters: BiquadFilterNode[];
  private src: AudioBufferSourceNode | null = null;
  private panner: StereoPannerNode | null = null;
  private quietFor = 0;
  level = 0;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly buffer: AudioBuffer,
    filterInit: FilterInit[],
    dest: AudioNode,
    private readonly rate = 1,
    pannable = false,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    if (pannable && typeof ctx.createStereoPanner === 'function') {
      this.panner = ctx.createStereoPanner();
      this.gain.connect(this.panner);
      this.panner.connect(dest);
    } else this.gain.connect(dest);
    this.filters = filterInit.map((f) => {
      const bq = ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.value = f.freq;
      if (f.q !== undefined) bq.Q.value = f.q;
      return bq;
    });
    let next: AudioNode = this.gain;
    for (let i = this.filters.length - 1; i >= 0; i--) {
      this.filters[i]!.connect(next);
      next = this.filters[i]!;
    }
  }

  get running(): boolean {
    return this.src !== null;
  }

  private get input(): AudioNode {
    return this.filters[0] ?? this.gain;
  }

  /** Fija el nivel objetivo (suavizado con constante `tau`). */
  set(level: number, now: number, tau: number, dt: number): void {
    const v = Number.isFinite(level) ? Math.max(0, level) : 0;
    this.level = v;
    if (v > SILENT) {
      this.quietFor = 0;
      if (!this.src) {
        const s = this.ctx.createBufferSource();
        s.buffer = this.buffer;
        s.loop = true;
        s.playbackRate.value = this.rate * (0.97 + Math.random() * 0.06);
        s.connect(this.input);
        s.start(now, Math.random() * this.buffer.duration);
        this.src = s;
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(0, now);
      }
      this.gain.gain.setTargetAtTime(v, now, tau);
    } else if (this.src) {
      this.gain.gain.setTargetAtTime(0, now, tau);
      this.quietFor += dt;
      if (this.quietFor > STOP_AFTER) this.stop();
    }
  }

  pan(v: number, now: number, tau: number): void {
    if (this.panner && Number.isFinite(v)) this.panner.pan.setTargetAtTime(clamp(v, -1, 1), now, tau);
  }

  freq(i: number, hz: number, now: number, tau: number): void {
    const f = this.filters[i];
    if (f && Number.isFinite(hz)) f.frequency.setTargetAtTime(clamp(hz, 20, 20000), now, tau);
  }

  stop(): void {
    if (!this.src) return;
    try {
      this.src.stop();
    } catch {
      /* ya parada */
    }
    this.src.disconnect();
    this.src = null;
    this.quietFor = 0;
  }

  dispose(): void {
    this.stop();
    this.gain.disconnect();
    this.panner?.disconnect();
  }
}

/** Ruido de valor 1D suave (0..1) para ráfagas y variaciones. */
class SmoothNoise {
  private a = Math.random();
  private b = Math.random();
  private t = 0;
  value = 0.5;
  step(dt: number, speed: number): number {
    this.t += dt * speed;
    while (this.t >= 1) {
      this.t -= 1;
      this.a = this.b;
      this.b = Math.random();
    }
    const u = this.t * this.t * (3 - 2 * this.t);
    this.value = this.a + (this.b - this.a) * u;
    return this.value;
  }
}

/* ------------------------------------------------------------------ */
/* Fuentes del barco                                                   */
/* ------------------------------------------------------------------ */

/** Estado espacial de una fuente para este frame. */
export interface EmitterMix {
  /** Ganancia total (distancia × oclusión × intensidad). */
  gain: number;
  pan: number;
  cutoff: number;
  intensity: number;
  rough: boolean;
}

/** Voz continua de una clase de fuente (todas las del mismo tipo se suman en una). */
class EmitterVoice {
  private out: GainNode;
  private lp: BiquadFilterNode;
  private pan: StereoPannerNode | null;
  private nodes: AudioScheduledSourceNode[] = [];
  private aux: AudioNode[] = [];
  private lfo: OscillatorNode | null = null;
  private quietFor = 0;
  private wobble = new SmoothNoise();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: NoiseBank,
    readonly kind: EmitterKind,
    dest: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    this.out.connect(this.lp);
    if (this.pan) {
      this.lp.connect(this.pan);
      this.pan.connect(dest);
    } else this.lp.connect(dest);
  }

  get running(): boolean {
    return this.nodes.length > 0;
  }

  private loopSrc(buf: AudioBuffer, rate: number, dest: AudioNode, now: number): void {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start(now, Math.random() * buf.duration);
    this.nodes.push(s);
  }

  private osc(type: OscillatorType, freq: number, dest: AudioNode, now: number, gain = 1): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    let d = dest;
    if (gain !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = gain;
      g.connect(dest);
      this.aux.push(g);
      d = g;
    }
    o.connect(d);
    o.start(now);
    this.nodes.push(o);
    return o;
  }

  private filter(type: BiquadFilterType, freq: number, dest: AudioNode, q?: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    f.connect(dest);
    this.aux.push(f);
    return f;
  }

  /** Modulación de amplitud: devuelve el nodo cuya ganancia oscila (base ± depth a `rate` Hz). */
  private am(rate: number, base: number, depth: number, dest: AudioNode, now: number, type: OscillatorType = 'sine'): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = base;
    g.connect(dest);
    const lfo = this.ctx.createOscillator();
    lfo.type = type;
    lfo.frequency.value = rate;
    const d = this.ctx.createGain();
    d.gain.value = depth;
    lfo.connect(d);
    d.connect(g.gain);
    lfo.start(now);
    this.nodes.push(lfo);
    this.aux.push(g, d);
    this.lfo = lfo;
    return g;
  }

  private build(now: number): void {
    const out = this.out;
    switch (this.kind) {
      case 'generador': {
        // Diésel: dientes de sierra graves con el "chug" de los cilindros y algo de traqueteo.
        const chug = this.am(10.5, 0.62, 0.38, out, now);
        const lp = this.filter('lowpass', 340, chug, 0.9);
        this.osc('sawtooth', 43, lp, now, 0.7);
        this.osc('square', 86.5, lp, now, 0.18);
        this.loopSrc(this.bank.brown, 1.4, this.filter('lowpass', 420, chug), now);
        this.loopSrc(this.bank.white, 1, this.filter('bandpass', 2400, this.filter('highpass', 1500, this.gainNode(0.05, chug)), 1.5), now);
        break;
      }
      case 'motor': {
        // Motor eléctrico: zumbido armónico, un silbido fino y el batir del agua de la hélice.
        const lp = this.filter('lowpass', 1800, out, 0.7);
        this.osc('sine', 118, lp, now, 0.55);
        this.osc('triangle', 236, lp, now, 0.25);
        this.osc('sine', 1180, lp, now, 0.03);
        this.loopSrc(this.bank.pink, 0.9, this.filter('bandpass', 520, this.gainNode(0.5, out), 0.7), now);
        break;
      }
      case 'bomba': {
        // Potabilizadora: bomba que bombea a golpes lentos y agua corriendo por las tuberías.
        const pump = this.am(1.3, 0.6, 0.4, out, now);
        this.osc('triangle', 98, this.filter('lowpass', 500, pump), now, 0.45);
        this.loopSrc(this.bank.white, 1, this.filter('bandpass', 1400, this.gainNode(0.6, pump), 1), now);
        break;
      }
      case 'torno': {
        // Torno del taller: zumbido de motor con la herramienta mordiendo el metal.
        const cut = this.am(2.6, 0.8, 0.2, out, now);
        this.osc('sawtooth', 165, this.filter('bandpass', 900, cut, 2), now, 0.5);
        this.loopSrc(this.bank.white, 1, this.filter('highpass', 3000, this.gainNode(0.12, cut)), now);
        break;
      }
      case 'fogon': {
        this.loopSrc(this.bank.crackle, 0.9, this.filter('highpass', 500, this.gainNode(0.7, out)), now);
        this.loopSrc(this.bank.pink, 1, this.filter('lowpass', 420, this.gainNode(0.45, out)), now);
        break;
      }
      case 'incendio': {
        this.loopSrc(this.bank.crackle, 1.25, this.filter('highpass', 400, this.gainNode(0.6, out)), now);
        this.loopSrc(this.bank.crackle, 0.7, this.filter('bandpass', 1200, this.gainNode(0.35, out), 0.8), now);
        this.loopSrc(this.bank.brown, 1, this.filter('lowpass', 700, this.gainNode(0.8, out)), now);
        break;
      }
    }
  }

  private gainNode(v: number, dest: AudioNode): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest);
    this.aux.push(g);
    return g;
  }

  update(m: EmitterMix | null, now: number, dt: number): void {
    const level = m ? m.gain * EMITTER_GAIN[this.kind] : 0;
    if (level > SILENT) {
      this.quietFor = 0;
      if (!this.running) {
        this.build(now);
        this.out.gain.cancelScheduledValues(now);
        this.out.gain.setValueAtTime(0, now);
      }
      this.out.gain.setTargetAtTime(level, now, 0.15);
      this.lp.frequency.setTargetAtTime(clamp(m!.cutoff, 60, 20000), now, 0.12);
      if (this.pan) this.pan.pan.setTargetAtTime(clamp(m!.pan, -1, 1), now, 0.12);
      // Máquina dañada: el ritmo del motor tropieza.
      if (this.lfo && this.kind === 'generador') {
        const w = this.wobble.step(dt, m!.rough ? 2.5 : 0.4);
        this.lfo.frequency.setTargetAtTime(10.5 * (m!.rough ? lerp(0.6, 1.3, w) : lerp(0.95, 1.05, w)), now, 0.1);
      }
    } else if (this.running) {
      this.out.gain.setTargetAtTime(0, now, 0.25);
      this.quietFor += dt;
      if (this.quietFor > STOP_AFTER) this.teardown();
    }
  }

  private teardown(): void {
    for (const n of this.nodes) {
      try {
        n.stop();
      } catch {
        /* ya parada */
      }
      n.disconnect();
    }
    for (const a of this.aux) a.disconnect();
    this.nodes = [];
    this.aux = [];
    this.lfo = null;
    this.quietFor = 0;
  }

  dispose(): void {
    this.teardown();
    this.out.disconnect();
    this.lp.disconnect();
    this.pan?.disconnect();
  }
}

/* ------------------------------------------------------------------ */
/* Ambiente                                                            */
/* ------------------------------------------------------------------ */

/** Sonido puntual del ambiente que `Audio` debe reproducir. */
export interface AmbientShot {
  name: 'crujido' | 'golpe_ola' | 'gaviota';
  pan: number;
  gain: number;
  intensity: number;
  /** Retardo antes de sonar (s). */
  delay?: number;
}

export class Ambience {
  private loops: Record<LayerName, Loop>;
  private voices = new Map<EmitterKind, EmitterVoice>();
  private swellPhase = Math.random() * 100;
  private gust = new SmoothNoise();
  private gust2 = new SmoothNoise();
  private flicker = new SmoothNoise();
  private timers = { crujido: 4 + Math.random() * 6, golpe_ola: 2 + Math.random() * 4, gaviota: 3 + Math.random() * 5 };
  /** Último valor del oleaje (0..1), útil para depurar. */
  swell = 0.5;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: NoiseBank,
    /** Exterior (se apaga y oscurece en interiores). */
    ext: AudioNode,
    /** Interior (techo, casco). */
    amb: AudioNode,
    /** Destino de las fuentes del barco. */
    private readonly world: AudioNode,
  ) {
    const L = (buf: AudioBuffer, f: FilterInit[], dest: AudioNode, rate = 1, pan = false): Loop => new Loop(ctx, buf, f, dest, rate, pan);
    this.loops = {
      seaDeep: L(bank.brown, [{ type: 'lowpass', freq: 520, q: 0.5 }], ext, 0.9),
      seaWash: L(bank.pink, [{ type: 'bandpass', freq: 900, q: 0.55 }], ext),
      hullRush: L(bank.pink, [{ type: 'bandpass', freq: 1700, q: 0.6 }, { type: 'lowpass', freq: 5000 }], ext),
      hullRumble: L(bank.brown, [{ type: 'lowpass', freq: 190, q: 0.7 }], amb, 0.8),
      windBody: L(bank.pink, [{ type: 'bandpass', freq: 500, q: 0.9 }], ext, 1, true),
      windWhistle: L(bank.white, [{ type: 'bandpass', freq: 1100, q: 14 }], ext, 1, true),
      windLow: L(bank.brown, [{ type: 'lowpass', freq: 160 }], ext, 1.2),
      rainHiss: L(bank.white, [{ type: 'highpass', freq: 1300 }, { type: 'lowpass', freq: 8500 }], ext),
      rainPatter: L(bank.drops, [{ type: 'highpass', freq: 700 }], ext),
      rainRoar: L(bank.pink, [{ type: 'lowpass', freq: 1600 }], ext, 1.1),
      roofWash: L(bank.pink, [{ type: 'lowpass', freq: 1500 }], amb, 0.8),
      roofDrops: L(bank.drops, [{ type: 'lowpass', freq: 2000 }], amb, 0.55),
    };
  }

  /** Nivel actual de cada capa (para depuración y pruebas). */
  levels(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, l] of Object.entries(this.loops)) out[k] = Math.round(l.level * 1000) / 1000;
    for (const [k, v] of this.voices) out[`fuente:${k}`] = v.running ? 1 : 0;
    return out;
  }

  runningLayers(): number {
    let n = 0;
    for (const l of Object.values(this.loops)) if (l.running) n++;
    for (const v of this.voices.values()) if (v.running) n++;
    return n;
  }

  /**
   * Actualiza las capas (llamar a ~20 Hz). Devuelve los sonidos puntuales que tocan ahora.
   * @param dt segundos reales desde la última llamada.
   */
  update(dt: number, mix: AmbientMix, emitters: Map<EmitterKind, EmitterMix>, events = true): AmbientShot[] {
    const now = this.ctx.currentTime;
    const tau = 0.12;
    const lp = this.loops;
    // Oleaje: suma de ondas lentas de periodos no múltiplos → olas que nunca se repiten igual.
    this.swellPhase += dt * mix.swellSpeed;
    const ph = this.swellPhase * Math.PI * 2;
    const raw = 0.5 + 0.5 * (0.55 * Math.sin(ph / 7.3) + 0.3 * Math.sin(ph / 11.7 + 1.3) + 0.15 * Math.sin(ph / 4.1 + 0.7));
    const swell = Math.pow(clamp(raw, 0, 1), 1.5);
    this.swell = swell;
    const depth = mix.swellDepth;
    lp.seaDeep.set(LAYER_GAIN.seaDeep * mix.seaDeep * lerp(1, 0.6 + 0.8 * swell, depth), now, tau, dt);
    lp.seaWash.set(LAYER_GAIN.seaWash * mix.seaWash * lerp(1, 0.2 + 1.6 * swell * swell, depth), now, tau, dt);
    lp.seaWash.freq(0, mix.seaBright * (0.7 + 0.6 * swell), now, 0.2);
    const fl = this.flicker.step(dt, 0.8);
    // El agua corre junto al casco a golpes: sube con cada ola que rompe en la proa.
    lp.hullRush.set(LAYER_GAIN.hullRush * mix.hullRush * (0.55 + 0.35 * fl + 0.5 * swell), now, tau, dt);
    lp.hullRumble.set(LAYER_GAIN.hullRumble * mix.hullRumble * lerp(1, 0.5 + swell, depth), now, tau, dt);

    // Viento con ráfagas.
    const g = this.gust.step(dt, mix.gustSpeed);
    const g2 = this.gust2.step(dt, mix.gustSpeed * 2.3);
    const gust = clamp(0.65 * g + 0.35 * g2, 0, 1);
    lp.windBody.set(LAYER_GAIN.windBody * mix.windBody * (0.5 + 0.7 * gust), now, 0.15, dt);
    lp.windBody.freq(0, 260 + 700 * gust + 250 * mix.windBody, now, 0.2);
    lp.windWhistle.set(LAYER_GAIN.windWhistle * mix.windWhistle * gust * gust, now, 0.2, dt);
    lp.windWhistle.freq(0, 650 + 1000 * gust, now, 0.25);
    lp.windLow.set(LAYER_GAIN.windLow * Math.max(0, mix.windBody - 0.3) * (0.4 + gust), now, 0.15, dt);
    // Al girar la cabeza el viento cambia de oído; las ráfagas lo mueven un poco.
    lp.windBody.pan(mix.windPan * (0.8 + 0.4 * g2), now, 0.3);
    lp.windWhistle.pan(mix.windPan * 1.3, now, 0.3);

    // Lluvia.
    lp.rainHiss.set(LAYER_GAIN.rainHiss * mix.rainHiss, now, 0.3, dt);
    lp.rainPatter.set(LAYER_GAIN.rainPatter * mix.rainPatter, now, 0.3, dt);
    lp.rainRoar.set(LAYER_GAIN.rainRoar * mix.rainRoar * (0.8 + 0.4 * gust), now, 0.3, dt);
    lp.roofWash.set(LAYER_GAIN.roofWash * mix.roofRain, now, 0.3, dt);
    lp.roofWash.freq(0, mix.roofCutoff, now, 0.3);
    lp.roofDrops.set(LAYER_GAIN.roofDrops * mix.roofRain, now, 0.3, dt);
    lp.roofDrops.freq(0, mix.roofCutoff * 1.4, now, 0.3);

    // Fuentes del barco.
    for (const kind of Object.keys(EMITTER_REF) as EmitterKind[]) {
      const m = emitters.get(kind) ?? null;
      let v = this.voices.get(kind);
      if (!v) {
        if (!m || m.gain <= SILENT) continue;
        v = new EmitterVoice(this.ctx, this.bank, kind, this.world);
        this.voices.set(kind, v);
      }
      v.update(m, now, dt);
    }

    if (!events) return [];
    // Sonidos puntuales con ritmo de Poisson.
    const shots: AmbientShot[] = [];
    const t = this.timers;
    t.crujido -= dt;
    if (t.crujido <= 0) {
      t.crujido = expo(mix.creakRate);
      shots.push({ name: 'crujido', pan: rand(-0.7, 0.7), gain: mix.creakGain * rand(0.5, 1), intensity: 0 });
    }
    t.golpe_ola -= dt;
    if (t.golpe_ola <= 0) {
      t.golpe_ola = expo(mix.slapRate);
      // Más fuerte en la cresta del oleaje.
      shots.push({ name: 'golpe_ola', pan: Math.random() < 0.5 ? rand(-0.9, -0.4) : rand(0.4, 0.9), gain: rand(0.45, 1) * (0.6 + 0.6 * swell), intensity: clamp(mix.seaWash, 0, 1.3) });
    }
    if (mix.gullRate > 0.001) {
      t.gaviota -= dt;
      if (t.gaviota <= 0) {
        t.gaviota = expo(mix.gullRate);
        const far = Math.random();
        shots.push({ name: 'gaviota', pan: rand(-0.85, 0.85), gain: lerp(1, 0.35, far), intensity: far });
      }
    } else t.gaviota = Math.max(t.gaviota, 2);
    return shots;
  }

  /** Para todas las fuentes (al perder el contexto o cambiar de partida). */
  silenceNow(): void {
    const now = this.ctx.currentTime;
    for (const l of Object.values(this.loops)) {
      l.gain.gain.cancelScheduledValues(now);
      l.gain.gain.setValueAtTime(0, now);
      l.stop();
    }
  }

  dispose(): void {
    for (const l of Object.values(this.loops)) l.dispose();
    for (const v of this.voices.values()) v.dispose();
    this.voices.clear();
  }
}

function rand(a: number, b: number): number {
  return a + (b - a) * Math.random();
}

/** Espera exponencial (s) para un proceso de Poisson de `rate` eventos/s (con mínimo y máximo). */
function expo(rate: number): number {
  if (rate <= 1e-4) return 30;
  return clamp(-Math.log(1 - Math.random() * 0.999) / rate, 0.4, 120);
}

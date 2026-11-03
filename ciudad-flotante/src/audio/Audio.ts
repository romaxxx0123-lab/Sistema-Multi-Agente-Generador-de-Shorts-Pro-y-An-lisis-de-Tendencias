/**
 * [AGENTE audio] Sonido procedural (WebAudio, sin ficheros): ambiente de mar, viento, lluvia,
 * truenos, crujidos del casco, gaviotas, máquinas y fuego del barco, efectos de juego e interfaz.
 *
 * - Escucha el bus: 'sfx' (con posición en coordenadas del barco), 'toolUsed', 'itemGained',
 *   'notify', 'unlocked', 'tutorialStep', 'newDay', 'worldEventStarted', 'playerDied', 'simReplaced'.
 * - Ronda de contenido 2: los avisos «Radio: …» suenan por el altavoz de la radio y los contactos
 *   del radar con un ping (`notifyCue`); la llegada a Puerto Esperanza (`story.arrived`) toca su
 *   música; los fuegos artificiales llegan con retardo según la distancia; la grúa lanza el gancho
 *   y saca los restos del agua; en la sala común se oyen los naipes; y el puerto tiene campanas,
 *   boyas, gaviotas y gente en el muelle (`portPresence`).
 * - El contexto de audio solo se crea tras un gesto del usuario (`unlock` o el primer clic/tecla);
 *   sin WebAudio todo es un no-op silencioso.
 * - Mezcla: el oyente es el jugador (posición y orientación); los sonidos se atenúan con la
 *   distancia, se panoramizan y se apagan tras paredes y cubiertas. El exterior se oye amortiguado
 *   en interiores según la celda del jugador en `sim.layout` (y más cerca de puertas y escaleras).
 * - Fuentes continuas del barco (generador, motor, potabilizadora, torno, fogón, incendios),
 *   pasos y murmullo de los habitantes cercanos, y latido con la salud crítica.
 * - Dormido, en pausa o muerto, el mundo suena apagado y más bajo; la interfaz no.
 *
 * Depuración: `__game.cmd.audio()` (estado), `audioMeter()` (nivel real de salida),
 * `audioPlay(nombre, x?, y?, z?)`, `audioUnlock()` y `audioTest()` (síntesis offline de todas las
 * recetas y capas, con pico y RMS).
 */
import type { NotifyKind } from '../core/EventBus';
import { clamp, lerp } from '../core/math';
import { registerDebug } from '../game/debug';
import type { GameContext } from '../game/context';
import { cellAtPoint, moduleCenter, type ShipLayout } from '../sim/ship';
import { GRUA_LIFT_MIN } from '../sim/debris';
import type { GameState, ModuleInstance } from '../sim/types';
import { AudioEngine, audioContextCtor, hasUserActivation } from './engine';
import type { AmbientShot, EmitterMix } from './ambience';
import {
  EMITTER_MAX,
  EMITTER_REF,
  GAIN_SFX,
  ambientMix,
  behindFor,
  collectEmitters,
  distanceGain,
  exteriorCutoff,
  exteriorGain,
  gullPresence,
  listenerEnv,
  loungeInfo,
  notifyCue,
  occlusion,
  panFor,
  portPresence,
  sourceLevel,
  toolFallback,
  topNotify,
  type EmitterKind,
  type Listener,
  type ListenerEnv,
} from './mix';
import { runAudioSelfTest } from './selftest';
import { SFX, resolveSfx, type SfxBus, type SfxOpts } from './sfx';

/** Avisos → sonido. */
const NOTIFY_SFX: Record<NotifyKind, string> = { info: 'aviso_info', good: 'aviso_bien', warn: 'aviso_atencion', danger: 'aviso_peligro' };

/** Señal sonora al empezar un evento del mundo (los demás solo suenan con su aviso). */
const EVENT_CUES: Record<string, [string, SfxOpts]> = {
  tormenta: ['trueno', { distance: 700 }],
  mercante: ['sirena', {}],
  naufragio: ['descubrimiento', {}],
  isla: ['descubrimiento', {}],
  estructura: ['descubrimiento', {}],
  naufragos: ['descubrimiento', {}],
  banco_peces: ['burbujas', {}],
  incendio: ['campana', { count: 6 }],
  llegada: ['llegada', {}],
};

/** Señales narrativas que ya dicen "algo bueno ha pasado" (silencian el tono de los avisos info/bien). */
const CUE_NAMES = new Set([
  'fanfarria',
  'tutorial',
  'campana',
  'obra_terminada',
  'mejora_terminada',
  'descubrimiento',
  'expedicion_vuelve',
  'muerte',
  'desmayo',
  'rescate',
  'sirena',
  'llegada',
  'radio',
  'radar_contacto',
]);

/** Velocidad del sonido (m/s): retardo de truenos y fuegos artificiales. */
export const SOUND_SPEED = 343;
/** La música de la llegada no se repite antes de este tiempo (s reales). */
const ARRIVAL_MUSIC_GAP = 30;

/** Grúa con sus campos de avance guardados (debris.ts). */
type CraneModule = ModuleInstance & { prodProgress?: number; prodTarget?: number | null };

const AMBIENT_STEP = 0.05;
const EMITTER_STEP = 0.1;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** Timbre de voz estable de un habitante (0 grave .. 1 aguda) a partir de su id. */
export function voiceOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 999;
}

/** Curva perceptiva del volumen maestro (0..1 → ganancia). */
export function volumeCurve(v: number): number {
  const x = clamp(Number.isFinite(v) ? v : 0, 0, 1);
  return Math.pow(x, 1.5);
}

interface PendingTool {
  tool: string;
  phase: 'start' | 'hit' | 'success' | 'fail';
}

export class Audio {
  private engine: AudioEngine | null = null;
  /** WebAudio no existe o falló de forma irrecuperable. */
  private disabled = false;
  private volume: number;
  private seenSettingsVolume: number;
  /** Reloj real interno (s). */
  private time = 0;
  private ambAcc = 0;
  private emAcc = EMITTER_STEP;
  private ambFade = 0;
  private env: ListenerEnv = listenerEnv(null, 0, 0, 0);
  private exposure = 1;
  private listener: Listener = { x: 0, y: 0, z: 0, yaw: 0 };
  private emitterMix = new Map<EmitterKind, EmitterMix>();
  private lastPlayed = new Map<string, number>();
  private frameSfx = new Set<string>();
  private pendingTools: PendingTool[] = [];
  private pendingGains = 0;
  private pendingNotify: NotifyKind[] = [];
  private prevLightning = 0;
  private lastThunder = -10;
  private lastCueAt = -10;
  private lastEventCueAt = -10;
  private lastPreview = -10;
  private errors = 0;
  private unknown = new Set<string>();
  /** Seguimiento de habitantes: posición anterior, zancada acumulada y último bocadillo oído. */
  private crewTrack = new Map<string, { x: number; z: number; stride: number; say: string | null }>();
  private beatTimer = 0;
  /** Seguimiento de cada grúa: resto enganchado y su última posición (chapoteo al sacarlo). */
  private craneTrack = new Map<number, { target: number | null; x: number; z: number }>();
  /** Próximo golpe de naipes en cada sala común (s). */
  private cardTimers = new Map<number, number>();
  /** `story.arrived` en el frame anterior (la música suena al pasar a true, no al cargar). */
  private prevArrived = false;
  private lastArrivalMusic = -Infinity;

  constructor(private readonly ctx: GameContext) {
    this.volume = clamp(Number.isFinite(ctx.settings?.volume) ? ctx.settings.volume : 0.7, 0, 1);
    this.seenSettingsVolume = this.volume;
    const bus = ctx.bus;
    bus.on('sfx', (e) => this.guard(() => this.onSfx(e.name, e.x, e.y, e.z)));
    bus.on('toolUsed', (e) => this.pendingTools.push({ tool: e.tool, phase: e.phase }));
    bus.on('itemGained', () => this.pendingGains++);
    bus.on('notify', (e) => {
      this.pendingNotify.push(e.kind);
      this.guard(() => this.onNotifyText(e.text));
    });
    bus.on('unlocked', () => this.guard(() => this.cue('fanfarria')));
    bus.on('tutorialStep', () => this.guard(() => this.cue('tutorial')));
    bus.on('newDay', () =>
      this.guard(() => {
        if (!this.ctx.sim.state.player.sleeping) this.cue('campana', { count: 2 });
      }),
    );
    bus.on('worldEventStarted', (e) => this.guard(() => this.onWorldEvent(e.type)));
    bus.on('playerDied', () => this.guard(() => this.cue('muerte')));
    bus.on('simReplaced', () => this.guard(() => this.onSimReplaced()));

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const gesture = (): void => this.onGesture();
      for (const t of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(t, gesture, { capture: true, passive: true });
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => this.onVisibility());
    }
    if (!audioContextCtor()) this.disabled = true;
    this.prevArrived = !!this.safeState()?.story?.arrived;
    this.registerDebug();
  }

  /* ================= API pública (contrato) ================= */

  /** Debe llamarse tras un gesto del usuario (clic en "Jugar"). */
  unlock(): void {
    if (this.disabled) return;
    if (!this.engine) {
      // Sin gesto todavía (p. ej. ?autostart): se creará con el primer clic o tecla.
      if (!hasUserActivation()) return;
      this.start();
    }
    this.engine?.resume();
  }

  setVolume(v: number): void {
    const nv = clamp(Number.isFinite(v) ? v : this.volume, 0, 1);
    const changed = Math.abs(nv - this.volume) > 0.004;
    this.volume = nv;
    if (typeof this.ctx.settings?.volume === 'number') this.seenSettingsVolume = this.ctx.settings.volume;
    const eng = this.engine;
    if (!eng || !eng.ready) return;
    eng.ramp(eng.graph.master.gain, volumeCurve(nv), 0.03);
    // Clic de muestra al mover el control de volumen (como mucho uno cada 150 ms).
    if (changed && eng.running && this.time - this.lastPreview > 0.15) {
      this.lastPreview = this.time;
      this.playAt('ui_clic', {});
    }
  }

  update(dtReal: number): void {
    const dt = Number.isFinite(dtReal) ? clamp(dtReal, 0, 0.25) : 0;
    this.time += dt;
    const sv = this.ctx.settings?.volume;
    if (typeof sv === 'number' && sv !== this.seenSettingsVolume) {
      this.seenSettingsVolume = sv;
      this.setVolume(sv);
    }
    const eng = this.engine;
    if (eng && !eng.ready) this.guard(() => this.prepare(eng));
    else if (eng && eng.running) this.guard(() => this.tick(eng, dt));
    // La llegada a Puerto Esperanza se sigue siempre (aunque el audio no esté listo) para no
    // tocar la música al cargar una partida en la que ya se llegó.
    const arrived = !!this.safeState()?.story?.arrived;
    if (arrived && !this.prevArrived) this.guard(() => this.arrivalMusic());
    this.prevArrived = arrived;
    this.frameSfx.clear();
    this.pendingTools.length = 0;
    this.pendingNotify.length = 0;
    this.pendingGains = 0;
  }

  /* ================= Arranque y estado ================= */

  private start(): void {
    if (this.engine || this.disabled) return;
    try {
      this.engine = AudioEngine.create();
    } catch (err) {
      console.error('[Audio] no se pudo iniciar el audio', err);
      this.engine = null;
    }
    if (!this.engine) {
      this.disabled = true;
      return;
    }
    // El contexto se crea y reanuda dentro del gesto; los búferes se generan en los frames siguientes.
    this.engine.resume();
  }

  /** Un paso de preparación por frame; al terminar, fija volumen y arranca el ambiente con fundido. */
  private prepare(eng: AudioEngine): void {
    if (!eng.pump()) return;
    const g = eng.graph;
    g.master.gain.value = volumeCurve(this.volume);
    g.ambient.gain.value = 0;
    this.ambFade = 0;
    this.prevLightning = this.safeState()?.weather.lightning ?? 0;
  }

  private onGesture(): void {
    if (this.disabled) return;
    if (!this.engine) this.start();
    else if (!this.engine.running && !(typeof document !== 'undefined' && document.hidden)) this.engine.resume();
  }

  private onVisibility(): void {
    const eng = this.engine;
    if (!eng || typeof document === 'undefined') return;
    if (document.hidden) eng.suspend();
    else eng.resume();
  }

  private live(): AudioEngine | null {
    const eng = this.engine;
    return eng && eng.ready && eng.running ? eng : null;
  }

  private safeState(): GameState | null {
    try {
      return this.ctx.sim?.state ?? null;
    } catch {
      return null;
    }
  }

  private safeLayout(): ShipLayout | null {
    try {
      return this.ctx.sim?.layout ?? null;
    } catch {
      return null;
    }
  }

  /** Ejecuta sin dejar que un fallo de audio rompa el juego; tras varios fallos se apaga el audio. */
  private guard(fn: () => void): void {
    if (this.disabled) return;
    try {
      fn();
    } catch (err) {
      this.errors++;
      if (this.errors === 1) console.error('[Audio] error de audio', err);
      if (this.errors >= 5) {
        console.error('[Audio] demasiados errores: se desactiva el sonido');
        this.disabled = true;
        try {
          this.engine?.dispose();
        } catch {
          /* nada */
        }
        this.engine = null;
      }
    }
  }

  /* ================= Eventos ================= */

  private onSfx(raw: string, x?: number, y?: number, z?: number): void {
    const name = resolveSfx(raw);
    this.frameSfx.add(raw);
    this.frameSfx.add(name);
    if (name === 'generico' && raw !== 'generico' && this.unknown.size < 50) this.unknown.add(raw);
    if (!this.live()) return;
    const hasPos = Number.isFinite(x) && Number.isFinite(z);
    if (name === 'trueno') {
      const l = this.listener;
      const d = hasPos ? Math.hypot(x! - l.x, z! - l.z) : 320;
      this.thunder(d, hasPos ? panFor(l, x!, z!) * 0.7 : 0);
      return;
    }
    // La música de la llegada ya celebra: la fanfarria del mismo momento sobra.
    if (name === 'fanfarria' && this.time - this.lastArrivalMusic < 3) return;
    const opts: SfxOpts = {};
    if (name === 'paso') {
      const st = this.ctx.sim.state;
      opts.surface = this.env.surface;
      opts.wet = this.env.sky ? clamp(st.weather.rain, 0, 1) : 0;
      opts.run = !!this.ctx.player?.running;
    }
    const pos = hasPos ? { x: x!, y: Number.isFinite(y) ? y! : this.listener.y + 1, z: z! } : undefined;
    if (name === 'fuego_artificial') {
      // Como el trueno: la receta retrasa el estallido según la distancia (y lo oscurece).
      const l = this.listener;
      opts.distance = pos ? Math.hypot(pos.x - l.x, pos.y - (l.y + 1.6), pos.z - l.z) : 250;
    }
    if (this.playAt(name, opts, pos) && CUE_NAMES.has(name)) this.lastCueAt = this.time;
  }

  /** Avisos de radio (por el altavoz del radar) y contactos del radar (ping). */
  private onNotifyText(text: string): void {
    const cue = notifyCue(text);
    if (!cue) return;
    this.frameSfx.add(cue);
    if (!this.live()) return;
    if (this.playAt(cue, {}, this.radarPos() ?? undefined)) this.lastCueAt = this.time;
  }

  /** Altavoz de la radio: la antena del radar que funciona (o cualquiera); null sin radar. */
  private radarPos(): { x: number; y: number; z: number } | null {
    const st = this.safeState();
    if (!st) return null;
    const radars = st.ship.modules.filter((m) => m.type === 'radar' && m.status === 'active');
    const m = radars.find((r) => r.on && r.powered && r.fire <= 0) ?? radars[0];
    if (!m) return null;
    const p = this.safeLayout()?.props.find((pp) => pp.moduleId === m.id && pp.kind === 'radar');
    if (p) return { x: p.x, y: p.y + 1.2, z: p.z };
    const c = moduleCenter(m, st.ship.width);
    return { x: c.x, y: c.y + 1.2, z: c.z };
  }

  /** Música de la llegada a Puerto Esperanza (una vez; la fanfarria del mismo momento se calla). */
  private arrivalMusic(): void {
    if (this.time - this.lastArrivalMusic < ARRIVAL_MUSIC_GAP) return;
    this.frameSfx.add('llegada');
    if (!this.live()) return;
    this.lastArrivalMusic = this.time;
    this.lastCueAt = this.time;
    this.lastEventCueAt = this.time;
    this.playAt('llegada', {});
  }

  private thunder(distance: number, pan: number): void {
    const sleeping = !!this.safeState()?.player.sleeping;
    if (this.time - this.lastThunder < (sleeping ? 2.5 : 0.7)) return;
    this.lastThunder = this.time;
    // Dormido se oye más lejano (y el filtro general ya lo apaga).
    this.playAt('trueno', { distance: sleeping ? Math.max(distance, 400) : distance }, undefined, { pan });
  }

  private cue(name: string, opts: SfxOpts = {}): void {
    if (CUE_NAMES.has(name)) this.lastCueAt = this.time;
    this.frameSfx.add(name);
    if (!this.live()) return;
    this.playAt(name, opts);
  }

  private onWorldEvent(type: string): void {
    const c = EVENT_CUES[type];
    if (!c) return;
    // El mercado del muelle abre con la llegada: su sirena taparía el comienzo de la música.
    if (type === 'mercante' && this.time - this.lastArrivalMusic < 5) return;
    this.lastEventCueAt = this.time;
    if (c[0] === 'trueno') this.thunder(c[1].distance ?? 700, (Math.random() * 2 - 1) * 0.6);
    else if (c[0] === 'llegada') this.arrivalMusic();
    else this.cue(c[0], c[1]);
  }

  private onSimReplaced(): void {
    if (this.engine?.ready) this.engine.voices.stopAll();
    this.crewTrack.clear();
    this.craneTrack.clear();
    this.cardTimers.clear();
    this.prevArrived = !!this.safeState()?.story?.arrived;
    this.ambFade = 0;
    this.prevLightning = this.safeState()?.weather.lightning ?? 0;
    this.emitterMix.clear();
    this.lastPlayed.clear();
  }

  /* ================= Reproducción ================= */

  /**
   * Reproduce un efecto del catálogo con mezcla, distancia, panorama y oclusión.
   * @param pos posición en coordenadas del barco (sin ella, sonido "en la cabeza").
   */
  private playAt(name: string, opts: SfxOpts, pos?: { x: number; y: number; z: number }, extra: { gainMul?: number; pan?: number; cutoff?: number; delay?: number } = {}): boolean {
    const eng = this.live();
    const def = SFX[name];
    if (!eng || !def) return false;
    const key = def.group ?? name;
    const last = this.lastPlayed.get(key) ?? -Infinity;
    if (this.time - last < def.gap) return false;
    let gain = def.gain * (extra.gainMul ?? 1);
    let pan = extra.pan ?? 0;
    let cutoff = extra.cutoff ?? 20000;
    let bus: SfxBus = def.bus;
    if (pos && !def.global) {
      const l = this.listener;
      const d = Math.hypot(pos.x - l.x, (pos.y - (l.y + 1.5)) * 1.2, pos.z - l.z);
      if (this.ctx.mode === 'build') {
        // Cámara exterior: se oye todo el barco, sin panorama ni paredes.
        gain *= Math.max(0.45, distanceGain(d, def.ref * 4, def.max * 2));
      } else {
        const dg = distanceGain(d, def.ref, def.max);
        if (dg <= 0.002) return false;
        const layout = this.safeLayout();
        const cell = layout ? cellAtPoint(layout, pos.x, pos.y, pos.z) : null;
        const occ = occlusion(this.env, cell, sourceLevel(cell, pos.y, this.env.level));
        gain *= dg * occ.gain;
        cutoff = Math.min(cutoff, occ.cutoff, lerp(20000, 6500, behindFor(l, pos.x, pos.z)));
        pan = panFor(l, pos.x, pos.z);
      }
      // La oclusión ya incluye el filtro de "exterior oído desde dentro".
      if (bus === 'ext') bus = 'sfx';
    }
    const end = eng.play(name, opts, { gain, pan, cutoff, bus, delay: extra.delay });
    if (end === null) return false;
    this.lastPlayed.set(key, this.time);
    return true;
  }

  private playShot(s: AmbientShot): void {
    switch (s.name) {
      case 'crujido':
        this.playAt('crujido', { intensity: this.env.kind === 'bodega' ? 1 : 0 }, undefined, { gainMul: s.gain, pan: s.pan });
        break;
      case 'golpe_ola':
        this.playAt('golpe_ola', { intensity: s.intensity }, undefined, { gainMul: s.gain, pan: s.pan });
        break;
      case 'gaviota':
        this.playAt('gaviota', {}, undefined, { gainMul: s.gain, pan: s.pan, cutoff: lerp(9000, 2800, s.intensity) });
        break;
      case 'campana_puerto':
      case 'campana_boya':
        this.playAt(s.name, {}, undefined, { gainMul: s.gain, pan: s.pan });
        break;
    }
  }

  /* ================= Frame ================= */

  private tick(eng: AudioEngine, dt: number): void {
    const st = this.ctx.sim.state;
    const layout = this.safeLayout();
    const mode = this.ctx.mode;
    const g = eng.graph;
    const p = st.player.pos;
    this.listener = { x: p.x, y: p.y, z: p.z, yaw: Number.isFinite(st.player.yaw) ? st.player.yaw : 0 };
    this.env = mode === 'build' ? listenerEnv(null, p.x, p.y, p.z) : listenerEnv(layout, p.x, p.y + 0.3, p.z);
    this.exposure += (this.env.exposure - this.exposure) * (1 - Math.exp(-dt / 0.25));

    // Estado global: dormir, pausa, muerte y menú apagan el mundo (la interfaz no).
    const sleeping = !!st.player.sleeping;
    const dead = !st.player.alive || mode === 'dead';
    let world = 1;
    let muffle = 20000;
    let ambient = mode === 'menu' ? 0.8 : 1;
    if (sleeping) {
      world = 0.6;
      muffle = 650;
    }
    if (this.ctx.paused) {
      world = 0.45;
      muffle = 1600;
    }
    if (dead) {
      world = 0.5;
      muffle = 420;
      ambient = 0.8;
    }
    eng.ramp(g.world.gain, world, 0.25);
    eng.ramp(g.muffle.frequency, muffle, 0.25);
    this.ambFade = Math.min(1, this.ambFade + dt / 1.8);
    eng.ramp(g.ambient.gain, ambient * this.ambFade * this.ambFade, 0.1);
    eng.ramp(g.extFilter.frequency, exteriorCutoff(this.exposure), 0.08);
    eng.ramp(g.extGain.gain, exteriorGain(this.exposure), 0.08);

    this.emAcc += dt;
    if (this.emAcc >= EMITTER_STEP) {
      const step = this.emAcc;
      this.emAcc = 0;
      this.updateEmitters(st, layout, mode === 'build');
      // Los sonidos puntuales de las máquinas y la sala no suenan dormido (el tiempo va ×14) ni en pausa.
      const active = !this.ctx.paused && !dead && !sleeping && mode !== 'menu';
      this.cranes(st, layout, active);
      if (active) this.lounges(st, layout, step);
    }

    this.ambAcc += dt;
    if (this.ambAcc >= AMBIENT_STEP) {
      const w = st.weather;
      const mix = ambientMix({
        waveHeight: w.waveHeight,
        wind: w.wind,
        rain: w.rain,
        speed: st.voyage.speed,
        storm: w.kind === 'tormenta',
        env: { exposure: this.exposure, roof: this.env.roof, kind: this.env.kind },
        gulls: gullPresence(st),
        windDir: w.windDir,
        yaw: this.listener.yaw,
        ...portPresence(st, this.celebrating()),
      });
      const shots = eng.ambience.update(this.ambAcc, mix, this.emitterMix, !this.ctx.paused && !dead);
      this.ambAcc = 0;
      for (const s of shots) this.playShot(s);
    }

    if (mode === 'play' && !this.ctx.paused) this.crew(st, layout, sleeping);
    this.heartbeat(st, dt, mode === 'play' && !this.ctx.paused);

    // Relámpago sin trueno anunciado por el bus (respaldo).
    const L = Number.isFinite(st.weather.lightning) ? st.weather.lightning : 0;
    if (L > 0 && this.prevLightning <= 0 && this.time - this.lastThunder > 0.4) this.thunder(260 + Math.random() * 260, (Math.random() * 2 - 1) * 0.6);
    this.prevLightning = L;

    this.flush();
    eng.voices.cleanup();
  }

  /**
   * Habitantes cercanos: pasos al caminar (uno cada ~0,7 m recorridos) y un murmullo cuando
   * aparece un bocadillo nuevo. Dormido no (el tiempo va ×14).
   */
  private crew(st: GameState, layout: ShipLayout | null, sleeping: boolean): void {
    const l = this.listener;
    const seen = new Set<string>();
    for (const n of st.npcs) {
      seen.add(n.id);
      const say = n.say && n.say.until > st.time ? n.say.text : null;
      const t = this.crewTrack.get(n.id);
      if (!t) {
        this.crewTrack.set(n.id, { x: n.pos.x, z: n.pos.z, stride: 0, say });
        continue;
      }
      const moved = Math.hypot(n.pos.x - t.x, n.pos.z - t.z);
      t.x = n.pos.x;
      t.z = n.pos.z;
      const d = Math.hypot(n.pos.x - l.x, (n.pos.y - l.y) * 1.2, n.pos.z - l.z);
      const near = !sleeping && n.activity !== 'away' && d < 16;
      // Un salto grande es un teletransporte (subir a bordo, cargar partida): no son pasos.
      if (moved > 0.6) t.stride = 0;
      else if (near) {
        t.stride += moved;
        if (t.stride >= 0.7) {
          t.stride = 0;
          const env = listenerEnv(layout, n.pos.x, n.pos.y + 0.3, n.pos.z);
          const wet = env.sky ? clamp(st.weather.rain, 0, 1) : 0;
          this.playAt('paso_npc', { surface: env.surface, wet }, { x: n.pos.x, y: n.pos.y, z: n.pos.z });
        }
      }
      if (say && say !== t.say && near) {
        const syllables = clamp(Math.round(say.length / 7), 2, 8);
        this.playAt('voz', { intensity: voiceOf(n.id), count: syllables }, { x: n.pos.x, y: n.pos.y + 1.6, z: n.pos.z });
      }
      t.say = say;
    }
    for (const id of [...this.crewTrack.keys()]) if (!seen.has(id)) this.crewTrack.delete(id);
  }

  /** ¿Hay fuegos o farolillos en el cielo? (fiesta del puerto: más gente en el muelle). */
  private celebrating(): boolean {
    try {
      return !!(this.ctx.renderer as { celebrating?: boolean } | undefined)?.celebrating;
    } catch {
      return false;
    }
  }

  /**
   * Grúas: al lanzar el gancho suena el torno en la pluma y el gancho cae al agua junto al resto;
   * al sacarlo (el resto desaparece y la grúa empieza a izar), chapoteo y chorreo donde estaba.
   */
  private cranes(st: GameState, layout: ShipLayout | null, audible: boolean): void {
    const seen = new Set<number>();
    for (const m of st.ship.modules) {
      if (m.type !== 'grua') continue;
      seen.add(m.id);
      const c = m as CraneModule;
      const target = typeof c.prodTarget === 'number' ? c.prodTarget : null;
      const d = target !== null ? st.debris.find((x) => x.id === target) : undefined;
      let t = this.craneTrack.get(m.id);
      if (!t) {
        t = { target, x: d?.pos.x ?? 0, z: d?.pos.z ?? 0 };
        this.craneTrack.set(m.id, t);
        continue;
      }
      if (audible && target !== null && target !== t.target) {
        const prop = layout?.props.find((pp) => pp.moduleId === m.id && pp.kind === 'grua');
        const tip = prop ? { x: prop.x, y: prop.y + Math.max(2, prop.height * 0.9), z: prop.z } : { ...moduleCenter(m, st.ship.width), y: moduleCenter(m, st.ship.width).y + 2.5 };
        this.playAt('grua_lanzar', {}, tip);
        if (d && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.z)) this.playAt('chapoteo_corcho', {}, { x: d.pos.x, y: 0.5, z: d.pos.z }, { delay: 0.9 });
      }
      if (audible && t.target !== null && target === null) {
        const w = Number.isFinite(c.prodProgress) ? c.prodProgress! : Infinity;
        const gone = !st.debris.some((x) => x.id === t!.target);
        if (gone && w < GRUA_LIFT_MIN) this.playAt('grua_saca', {}, { x: t.x, y: 0.5, z: t.z });
      }
      if (d && Number.isFinite(d.pos.x) && Number.isFinite(d.pos.z)) {
        t.x = d.pos.x;
        t.z = d.pos.z;
      }
      t.target = target;
    }
    for (const id of [...this.craneTrack.keys()]) if (!seen.has(id)) this.craneTrack.delete(id);
  }

  /** Naipes en la mesa de juegos de cada sala común con al menos dos jugando (cerca del oyente). */
  private lounges(st: GameState, layout: ShipLayout | null, dt: number): void {
    const l = this.listener;
    const seen = new Set<number>();
    for (const r of loungeInfo(st, layout)) {
      seen.add(r.moduleId);
      const table = r.table;
      if (r.players < 2 || !table || Math.hypot(table.x - l.x, table.y - l.y, table.z - l.z) > 16) {
        this.cardTimers.set(r.moduleId, 1 + Math.random() * 2);
        continue;
      }
      const left = (this.cardTimers.get(r.moduleId) ?? 1) - dt;
      if (left <= 0) {
        this.playAt('cartas', {}, table);
        this.cardTimers.set(r.moduleId, 2.5 + Math.random() * 4.5);
      } else this.cardTimers.set(r.moduleId, left);
    }
    for (const id of [...this.cardTimers.keys()]) if (!seen.has(id)) this.cardTimers.delete(id);
  }

  /** Latido cuando la salud es crítica (más rápido y fuerte cuanto peor). */
  private heartbeat(st: GameState, dt: number, active: boolean): void {
    const hp = st.player.needs.health;
    if (!active || !st.player.alive || !Number.isFinite(hp) || hp >= 22) {
      this.beatTimer = 0.4;
      return;
    }
    this.beatTimer -= dt;
    if (this.beatTimer > 0) return;
    const k = clamp((22 - hp) / 22, 0, 1);
    this.beatTimer = 60 / (60 + 45 * k);
    this.playAt('latido', {}, undefined, { gainMul: lerp(0.35, 1, k) });
  }

  /** Suma las fuentes de cada tipo en una voz: ganancia por potencia, panorama de la más fuerte. */
  private updateEmitters(st: GameState, layout: ShipLayout | null, build: boolean): void {
    const l = this.listener;
    const acc = new Map<EmitterKind, { sumSq: number; best: number; pan: number; cutoff: number; intensity: number; rough: boolean }>();
    for (const e of collectEmitters(st, layout)) {
      const d = Math.hypot(e.x - l.x, (e.y - (l.y + 1.5)) * 1.2, e.z - l.z);
      let gain: number;
      let pan = 0;
      let cutoff = 20000;
      if (build) gain = 0.4 * Math.max(0.3, distanceGain(d, EMITTER_REF[e.kind] * 3, EMITTER_MAX[e.kind] * 2));
      else {
        const dg = distanceGain(d, EMITTER_REF[e.kind], EMITTER_MAX[e.kind]);
        if (dg <= 0) continue;
        const cell = layout ? cellAtPoint(layout, e.x, e.y, e.z) : null;
        const occ = occlusion(this.env, cell, e.level);
        gain = dg * occ.gain;
        pan = panFor(l, e.x, e.z);
        cutoff = Math.min(occ.cutoff, lerp(20000, 7000, behindFor(l, e.x, e.z)));
      }
      gain *= e.intensity;
      const a = acc.get(e.kind) ?? { sumSq: 0, best: 0, pan: 0, cutoff: 20000, intensity: 0, rough: false };
      a.sumSq += gain * gain;
      if (gain > a.best) {
        a.best = gain;
        a.pan = pan;
        a.cutoff = cutoff;
        a.intensity = e.intensity;
      }
      a.rough ||= e.rough;
      acc.set(e.kind, a);
    }
    this.emitterMix.clear();
    for (const [kind, a] of acc) {
      this.emitterMix.set(kind, { gain: Math.min(1.3, Math.sqrt(a.sumSq)), pan: a.pan, cutoff: a.cutoff, intensity: a.intensity, rough: a.rough });
    }
  }

  /** Resuelve al final del frame lo que depende de otros eventos del mismo frame (evita duplicados). */
  private flush(): void {
    const pos = this.ctx.sim.state.player.pos;
    for (const t of this.pendingTools) {
      const n = toolFallback(t.tool, t.phase, this.frameSfx);
      if (n) this.playAt(n, {}, { x: pos.x, y: pos.y + 1.2, z: pos.z });
    }
    if (this.pendingGains > 0) {
      let covered = false;
      for (const n of this.frameSfx) if (GAIN_SFX.has(n)) covered = true;
      if (!covered) this.playAt('objeto', {});
    }
    const top = topNotify(this.pendingNotify);
    if (top) {
      const afterEvent = this.time - this.lastEventCueAt < 0.4;
      const afterCue = this.time - this.lastCueAt < 0.5;
      if (!afterEvent && !(afterCue && (top === 'info' || top === 'good'))) this.playAt(NOTIFY_SFX[top], {});
    }
  }

  /* ================= Depuración ================= */

  private registerDebug(): void {
    registerDebug('audio', (() => {
      const any = this.engine;
      const eng = any?.ready ? any : null;
      return {
        disponible: !this.disabled,
        estado: any ? (any.ready ? any.ctx.state : 'preparando') : this.disabled ? 'sin WebAudio' : 'esperando gesto',
        volumen: this.volume,
        voces: eng?.voices.count ?? 0,
        activas: eng?.voices.activeNames() ?? [],
        capas: eng?.ambience.levels() ?? {},
        capasSonando: eng?.ambience.runningLayers() ?? 0,
        mundo: eng
          ? {
              ganancia: round2(eng.graph.world.gain.value),
              filtro: Math.round(eng.graph.muffle.frequency.value),
              exterior: Math.round(eng.graph.extFilter.frequency.value),
              ambiente: round2(eng.graph.ambient.gain.value),
            }
          : null,
        entorno: { ...this.env, exposicionSuavizada: Math.round(this.exposure * 100) / 100 },
        fuentes: Object.fromEntries([...this.emitterMix].map(([k, m]) => [k, Math.round(m.gain * 1000) / 1000])),
        reproducidos: eng ? Object.fromEntries(eng.voices.played) : {},
        desconocidos: [...this.unknown],
        errores: this.errors,
      };
    }) as never);
    registerDebug('audioMeter', (() => this.engine?.meter() ?? null) as never);
    registerDebug('audioPlay', ((name: string, x?: number, y?: number, z?: number) => {
      this.ctx.bus.emit('sfx', x === undefined ? { name } : { name, x, y: y ?? 0, z: z ?? 0 });
    }) as never);
    registerDebug('audioUnlock', (() => {
      if (!this.engine) this.start();
      this.engine?.resume();
      return this.engine?.ctx.state ?? 'sin WebAudio';
    }) as never);
    // Sin import dinámico: el empaquetado en un solo HTML no admite trozos separados.
    registerDebug('audioTest', ((opts?: { seconds?: number }) => runAudioSelfTest(opts)) as never);
  }
}

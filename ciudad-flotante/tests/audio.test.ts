/**
 * Tests del audio (área audio): generadores DSP (señal no silenciosa, sin saturar, bucles sin
 * costura, reproducibles), entorno del oyente con el layout real del barco, curvas de mezcla del
 * ambiente, fuentes continuas, espacialización, catálogo de efectos y robustez sin WebAudio.
 *
 * Síntesis offline en Node: un `BaseAudioContext` falso (mismas reglas que WebAudio: parámetros
 * finitos, rampas exponenciales sin cero, start/stop válidos) programa cada receta, capa y fuente
 * del barco y comprueba que todo arranca y se para dentro de su duración, y que `Audio` reacciona
 * a la simulación (radio, radar, llegada, grúa, fuegos). La síntesis WebAudio real (pico y RMS)
 * se prueba en el navegador con `__game.cmd.audioTest()` (OfflineAudioContext) mediante
 * scripts/shot.mjs.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Audio, SOUND_SPEED, voiceOf, volumeCurve } from '../src/audio/Audio';
import { Ambience, EMITTER_GAIN, LAYER_GAIN, gruaTuning, pulseCurve } from '../src/audio/ambience';
import {
  brownNoise,
  bubblesLoop,
  crackleLoop,
  creakBuffer,
  dropsLoop,
  hasNonFinite,
  makeLoopable,
  murmurLoop,
  peakOf,
  pinkNoise,
  rmsOf,
  seededRandom,
  softClip,
  toDb,
  whiteNoise,
} from '../src/audio/dsp';
import type { AudioEngine } from '../src/audio/engine';
import {
  EMITTER_MAX,
  EMITTER_REF,
  GRUA_LEVEL,
  ambientMix,
  behindFor,
  collectEmitters,
  craneSoundPhase,
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
  toolFallback,
  topNotify,
  type AmbientInput,
  type EmitterKind,
} from '../src/audio/mix';
import { SFX, SFX_ALIASES, resolveSfx, type SfxOpts } from '../src/audio/sfx';
import { createNoiseBank, type NoiseBank, type Synth } from '../src/audio/synth';
import { FINAL_REGION } from '../src/data/story';
import { addItem } from '../src/sim/inventory';
import { GRUA_CYCLE_MIN, GRUA_HOOK_MIN, GRUA_LIFT_MIN } from '../src/sim/debris';
import { cellAtPoint, checkPlacement, instantiateModule, levelY, moduleCenter } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import type { ModuleInstance, NpcState, Rotation } from '../src/sim/types';
import type { GameContext } from '../src/game/context';
import { DEFAULT_SETTINGS } from '../src/game/types';

/** Código fuente del juego (para comprobar nombres de sonidos y textos de la simulación). */
const SOURCES = import.meta.glob('../src/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const SR = 44100;

describe('DSP: generadores de ruido y texturas', () => {
  const gens: [string, (r: () => number) => Float32Array][] = [
    ['blanco', (r) => whiteNoise(SR, 1, r)],
    ['rosa', (r) => pinkNoise(SR, 1, r)],
    ['marrón', (r) => brownNoise(SR, 1, r)],
  ];
  for (const [name, gen] of gens) {
    it(`ruido ${name}: RMS 0,2, sin saturar, finito y reproducible`, () => {
      const a = gen(seededRandom(5));
      expect(a.length).toBe(SR);
      expect(hasNonFinite(a)).toBe(false);
      expect(rmsOf(a)).toBeGreaterThan(0.17);
      expect(rmsOf(a)).toBeLessThan(0.23);
      expect(peakOf(a)).toBeLessThanOrEqual(0.95);
      const b = gen(seededRandom(5));
      expect(Array.from(a.subarray(0, 64))).toEqual(Array.from(b.subarray(0, 64)));
      const c = gen(seededRandom(6));
      expect(Array.from(a.subarray(0, 64))).not.toEqual(Array.from(c.subarray(0, 64)));
    });
  }

  it('el ruido marrón es grave: la energía de la diferencia es mucho menor que la de la señal', () => {
    const b = brownNoise(SR, 1, seededRandom(2));
    const w = whiteNoise(SR, 1, seededRandom(2));
    const diffRms = (d: Float32Array): number => {
      let s = 0;
      for (let i = 1; i < d.length; i++) s += (d[i]! - d[i - 1]!) ** 2;
      return Math.sqrt(s / (d.length - 1));
    };
    expect(diffRms(b) / rmsOf(b)).toBeLessThan(0.1);
    expect(diffRms(w) / rmsOf(w)).toBeGreaterThan(1);
  });

  it('los bucles no tienen costura (el salto final→inicio es como uno normal)', () => {
    const p = pinkNoise(SR, 1, seededRandom(3));
    const jump = Math.abs(p[0]! - p[p.length - 1]!);
    let typical = 0;
    for (let i = 1; i < p.length; i++) typical += Math.abs(p[i]! - p[i - 1]!);
    typical /= p.length - 1;
    expect(jump).toBeLessThan(typical * 6);
  });

  it('makeLoopable funde el principio con la continuación del final', () => {
    const src = new Float32Array(120).map((_, i) => i);
    const out = makeLoopable(src, 100);
    expect(out.length).toBe(100);
    expect(out[0]).toBeCloseTo(100, 5); // continuación natural de la muestra 99
    expect(out[99]).toBe(99);
  });

  it('chisporroteo, gotas y crujidos: señal audible, picos acotados', () => {
    const r = seededRandom(9);
    const bufs = { crackle: crackleLoop(SR, 1, 26, r), drops: dropsLoop(SR, 1, 170, r), creak: creakBuffer(SR, r) };
    for (const [k, d] of Object.entries(bufs)) {
      expect(hasNonFinite(d), k).toBe(false);
      expect(peakOf(d), k).toBeGreaterThan(0.5);
      expect(peakOf(d), k).toBeLessThanOrEqual(0.91);
      expect(rmsOf(d), k).toBeGreaterThan(0.005);
    }
    // El crujido dura entre 0,45 y 1,3 s y empieza y acaba en silencio (envolvente).
    const c = bufs.creak;
    expect(c.length / SR).toBeGreaterThanOrEqual(0.44);
    expect(c.length / SR).toBeLessThanOrEqual(1.31);
    expect(Math.abs(c[0]!)).toBeLessThan(0.05);
    expect(Math.abs(c[c.length - 1]!)).toBeLessThan(0.05);
  });

  it('softClip y toDb', () => {
    expect(softClip(0.3)).toBe(0.3);
    expect(Math.abs(softClip(5))).toBeLessThanOrEqual(0.95);
    expect(softClip(-5)).toBeLessThan(0);
    expect(toDb(1)).toBe(0);
    expect(toDb(0)).toBe(-200);
  });
});

describe('Entorno del oyente (layout real)', () => {
  const sim = Simulation.newGame(1);
  const layout = sim.layout;

  it('en cubierta: intemperie, exposición total, suelo de cubierta', () => {
    const e = listenerEnv(layout, 2, 3.5, -2);
    expect(e.kind).toBe('exterior');
    expect(e.exposure).toBe(1);
    expect(e.surface).toBe('cubierta');
    expect(e.sky).toBe(true);
  });

  it('en el camarote: interior apagado, techo con lluvia encima, más abierto junto a la puerta', () => {
    const lejos = listenerEnv(layout, -7.4, 3.5, -7.4);
    expect(lejos.kind).toBe('habitacion');
    expect(lejos.surface).toBe('interior');
    expect(lejos.exposure).toBeLessThan(0.25);
    expect(lejos.roof).toBe(1);
    const cerca = listenerEnv(layout, -6, 3.5, -4.5);
    expect(cerca.kind).toBe('habitacion');
    expect(cerca.exposure).toBeGreaterThan(lejos.exposure);
  });

  it('en la bodega: muy apagado, suelo hueco; bajo el puente la lluvia queda lejos', () => {
    const e = listenerEnv(layout, 6, 0.3, 2);
    expect(e.kind).toBe('bodega');
    expect(e.surface).toBe('bodega');
    expect(e.exposure).toBeLessThan(0.45);
    const dormitorio = listenerEnv(layout, -14, 3.5, -6);
    expect(dormitorio.kind).toBe('habitacion');
    expect(dormitorio.roof).toBeLessThan(0.5);
  });

  it('fuera del barco o sin layout: intemperie', () => {
    expect(listenerEnv(layout, 0, 3, 40).exposure).toBe(1);
    expect(listenerEnv(null, 0, 0, 0).kind).toBe('exterior');
  });

  it('el exterior se oye más oscuro y bajo cuanto menos expuesto', () => {
    expect(exteriorCutoff(1)).toBeGreaterThan(15000);
    expect(exteriorCutoff(0)).toBeLessThan(400);
    expect(exteriorCutoff(0.5)).toBeGreaterThan(exteriorCutoff(0.2));
    expect(exteriorGain(0)).toBeLessThan(exteriorGain(1));
    expect(exteriorGain(1)).toBe(1);
  });

  it('oclusión: mismo espacio intacto, otra habitación apagada, entre cubiertas aún más', () => {
    const camarote = listenerEnv(layout, -6, 3.5, -6);
    const mismo = occlusion(camarote, cellAtPoint(layout, -5.5, 3.5, -6.5), 1);
    expect(mismo.gain).toBe(1);
    const cocina = occlusion(camarote, cellAtPoint(layout, -9, 3.5, 7), 1);
    expect(cocina.gain).toBeLessThan(0.5);
    expect(cocina.cutoff).toBeLessThan(1500);
    const bodega = occlusion(camarote, cellAtPoint(layout, 6, 0.5, 2), 0);
    expect(bodega.gain).toBeLessThan(cocina.gain);
    const mar = occlusion(camarote, null, 1);
    expect(mar.gain).toBeCloseTo(exteriorGain(camarote.exposure));
  });
});

describe('Mezcla del ambiente', () => {
  const OUT = { exposure: 1, roof: 0, kind: 'exterior' as const };
  const calma: AmbientInput = { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 6, storm: false, env: OUT, gulls: 0 };
  const tormenta: AmbientInput = { waveHeight: 2.6, wind: 1, rain: 1, speed: 6, storm: true, env: OUT, gulls: 0 };

  it('la tormenta suena más que la calma en mar, viento y lluvia, y cruje más', () => {
    const a = ambientMix(calma);
    const b = ambientMix(tormenta);
    expect(b.seaDeep).toBeGreaterThan(a.seaDeep);
    expect(b.seaWash).toBeGreaterThan(a.seaWash);
    expect(b.windBody).toBeGreaterThan(a.windBody * 3);
    expect(b.windWhistle).toBeGreaterThan(0.9);
    expect(a.windWhistle).toBe(0);
    expect(a.rainHiss).toBe(0);
    expect(b.rainHiss).toBeCloseTo(1);
    expect(b.creakRate).toBeGreaterThan(a.creakRate * 3);
    expect(b.slapRate).toBeGreaterThan(a.slapRate);
  });

  it('el agua junto al casco depende de la velocidad (fondeado: nada)', () => {
    expect(ambientMix({ ...calma, speed: 0 }).hullRush).toBe(0);
    expect(ambientMix({ ...calma, speed: 9 }).hullRush).toBeGreaterThan(ambientMix(calma).hullRush);
  });

  it('dentro: exterior apagado, la lluvia suena en el techo; en la bodega, el retumbo del casco', () => {
    const fuera = ambientMix(tormenta);
    const dentro = ambientMix({ ...tormenta, env: { exposure: 0.15, roof: 1, kind: 'habitacion' } });
    expect(dentro.extGain).toBeLessThan(fuera.extGain);
    expect(dentro.extCutoff).toBeLessThan(2000);
    expect(fuera.roofRain).toBe(0);
    expect(dentro.roofRain).toBeGreaterThan(0.5);
    expect(dentro.hullRumble).toBe(0);
    const bodega = ambientMix({ ...tormenta, env: { exposure: 0.07, roof: 0.55, kind: 'bodega' } });
    expect(bodega.hullRumble).toBeGreaterThan(0.5);
    expect(bodega.roofCutoff).toBeLessThan(dentro.roofCutoff);
    expect(dentro.creakGain).toBeGreaterThan(fuera.creakGain);
  });

  it('el viento se oye del lado de barlovento y gira con la cabeza', () => {
    // windDir 0: el oleaje avanza hacia +x, el viento llega desde −x.
    const deFrente = ambientMix({ ...tormenta, windDir: 0, yaw: Math.PI / 2 }); // mirando a −x
    expect(Math.abs(deFrente.windPan)).toBeLessThan(1e-9);
    const izquierda = ambientMix({ ...tormenta, windDir: 0, yaw: 0 }); // mirando a −z: −x queda a la izquierda
    expect(izquierda.windPan).toBeLessThan(-0.3);
    const derecha = ambientMix({ ...tormenta, windDir: 0, yaw: Math.PI });
    expect(derecha.windPan).toBeGreaterThan(0.3);
    const dentro = ambientMix({ ...tormenta, windDir: 0, yaw: 0, env: { exposure: 0.1, roof: 1, kind: 'habitacion' } });
    expect(Math.abs(dentro.windPan)).toBeLessThan(Math.abs(izquierda.windPan));
    expect(ambientMix(tormenta).windPan).toBe(0);
  });

  it('valores corruptos no producen NaN', () => {
    const m = ambientMix({ waveHeight: NaN, wind: Infinity, rain: -3, speed: NaN, storm: false, env: OUT, gulls: NaN });
    for (const [k, v] of Object.entries(m)) expect(Number.isFinite(v), k).toBe(true);
  });
});

describe('Gaviotas', () => {
  it('de día junto a una isla sí; de noche o con tormenta, no', () => {
    const sim = Simulation.newGame(3);
    const st = sim.state;
    const day = Math.floor(st.time / 1440);
    st.time = day * 1440 + 12 * 60;
    st.weather.kind = 'despejado';
    st.weather.rain = 0;
    const base = gullPresence(st);
    st.voyage.sightings.push({ id: 999, kind: 'isla', name: 'Isla', expiresAt: st.time + 100, side: 1, distance: 120, x: 30, eventId: 0 });
    const isla = gullPresence(st);
    expect(isla).toBeGreaterThan(0.7);
    expect(isla).toBeGreaterThan(base);
    st.time = day * 1440 + 2 * 60;
    expect(gullPresence(st)).toBe(0);
    st.time = day * 1440 + 12 * 60;
    st.weather.kind = 'tormenta';
    expect(gullPresence(st)).toBe(0);
  });
});

describe('Fuentes continuas del barco', () => {
  it('generador funcionando, fogón encendido e incendios; nada si están parados', () => {
    const sim = Simulation.newGame(4);
    const st = sim.state;
    expect(collectEmitters(st, sim.layout).length).toBe(0);
    const gen = instantiateModule(500, 'generador', 1, 6, 1, 0, 'active');
    st.ship.modules.push(gen);
    sim.shipChanged();
    gen.on = true;
    gen.powered = false;
    expect(collectEmitters(st, sim.layout).some((e) => e.kind === 'generador')).toBe(false);
    gen.powered = true;
    const e = collectEmitters(st, sim.layout).find((x) => x.kind === 'generador')!;
    expect(e).toBeTruthy();
    expect(e.level).toBe(1);
    // Posición del prop del generador (dentro de su celda).
    expect(Math.abs(e.x - (6.5 * 4 - 20))).toBeLessThan(2.1);
    const cocina = st.ship.modules.find((m) => m.type === 'cocina')!;
    cocina.powered = true;
    const fogon = collectEmitters(st, sim.layout).find((x) => x.kind === 'fogon')!;
    expect(fogon.x).toBeCloseTo(-9.1, 0);
    cocina.fire = 50;
    const list = collectEmitters(st, sim.layout);
    expect(list.find((x) => x.kind === 'incendio')?.intensity).toBeCloseTo(0.5);
    // Ardiendo, la cocina no "cocina".
    expect(list.some((x) => x.kind === 'fogon')).toBe(false);
  });
});

describe('Espacialización', () => {
  const L = { x: 0, y: 0, z: 0, yaw: 0 }; // mirando a −z

  it('panorama: derecha +, izquierda −, delante centrado; gira con el oyente', () => {
    expect(panFor(L, 5, 0)).toBeGreaterThan(0.5);
    expect(panFor(L, -5, 0)).toBeLessThan(-0.5);
    expect(Math.abs(panFor(L, 0, -5))).toBeLessThan(1e-9);
    // Girado 90° (mirando a −x): lo que está en −z queda a la derecha.
    expect(panFor({ ...L, yaw: Math.PI / 2 }, 0, -5)).toBeGreaterThan(0.5);
    // Muy cerca, centrado.
    expect(Math.abs(panFor(L, 0.1, 0))).toBeLessThan(0.05);
  });

  it('detrás', () => {
    expect(behindFor(L, 0, 5)).toBeGreaterThan(0.9);
    expect(behindFor(L, 0, -5)).toBe(0);
  });

  it('atenuación por distancia: plena hasta la referencia, decreciente y nula al máximo', () => {
    expect(distanceGain(1, 2.5, 40)).toBe(1);
    expect(distanceGain(10, 2.5, 40)).toBeLessThan(distanceGain(5, 2.5, 40));
    expect(distanceGain(40, 2.5, 40)).toBe(0);
    expect(distanceGain(NaN, 2.5, 40)).toBe(0);
  });
});

describe('Avisos y herramientas', () => {
  it('se suena el aviso más importante', () => {
    expect(topNotify(['info', 'danger', 'good'])).toBe('danger');
    expect(topNotify(['info', 'warn'])).toBe('warn');
    expect(topNotify([])).toBeNull();
  });

  it('toolUsed no duplica lo que ya suena por el bus sfx', () => {
    expect(toolFallback('martillo', 'hit', new Set(['martillo']))).toBeNull();
    expect(toolFallback('martillo', 'hit', new Set())).toBe('martillo');
    expect(toolFallback('martillo', 'start', new Set())).toBe('blandir');
    expect(toolFallback('gancho', 'start', new Set(['gancho_impulso']))).toBeNull();
    expect(toolFallback('cubo', 'start', new Set())).toBe('blandir_cubo');
    expect(toolFallback('cana', 'fail', new Set(['escapado']))).toBeNull();
    expect(toolFallback('llave', 'fail', new Set())).toBe('herramienta_falla');
  });
});

describe('Catálogo de efectos', () => {
  it('cada receta tiene mezcla coherente', () => {
    for (const [name, d] of Object.entries(SFX)) {
      expect(d.gain, name).toBeGreaterThan(0);
      expect(d.gain, name).toBeLessThanOrEqual(4);
      expect(d.gap, name).toBeGreaterThanOrEqual(0);
      expect(d.ref, name).toBeLessThan(d.max);
      expect(typeof d.play, name).toBe('function');
    }
  });

  it('los alias apuntan a recetas existentes', () => {
    for (const [a, target] of Object.entries(SFX_ALIASES)) expect(SFX[target], a).toBeTruthy();
  });

  it('todos los nombres que emiten los demás sistemas tienen receta propia', () => {
    const emitted = [
      // ronda de contenido 2
      'mejora_terminada', 'pagina', 'fuego_artificial',
      // jugador, interfaz y construcción
      'paso', 'salto', 'aterrizar', 'aterrizar_fuerte', 'ui_clic', 'ui_click', 'ui_abrir', 'ui_cerrar', 'ui_error', 'ui_mover',
      // simulación
      'plano', 'equipar', 'comer', 'beber', 'curar', 'soltar', 'dormir', 'despertar', 'desmayo', 'llenar', 'llenar_cubo', 'muerte',
      'trueno', 'rayo', 'obra_iniciada', 'obra_terminada', 'averia', 'demoler', 'reparar', 'expedicion_vuelve', 'fuego', 'comercio',
      'fuga', 'golpe_mar', 'apagar', 'rescate', 'recoger_resto', 'pez', 'pesca_basura', 'interruptor', 'encargo', 'cocinado',
      'fabricado', 'fabricar', 'plantar', 'cosechar', 'cuidar',
      // herramientas
      'carrete', 'cana', 'chapoteo_corcho', 'picada', 'escapado', 'gancho_impulso', 'gancho', 'tirar_cabo', 'chapoteo', 'recoger',
      'martillo', 'llave', 'agua_fuego',
      // nombres genéricos de la especificación
      'click', 'aviso',
    ];
    for (const n of emitted) expect(resolveSfx(n), n).not.toBe('generico');
  });

  it('nombres desconocidos: prefijos de interfaz o genérico (nunca fallan)', () => {
    expect(resolveSfx('ui_lo_que_sea')).toBe('ui_clic');
    expect(resolveSfx('ui_error_raro')).toBe('ui_error');
    expect(resolveSfx('zzz')).toBe('generico');
  });
});

describe('Audio sin WebAudio (Node)', () => {
  function fakeCtx(): GameContext {
    const bus = new EventBus();
    const sim = Simulation.newGame(5, bus);
    return { sim, bus, settings: { ...DEFAULT_SETTINGS }, mode: 'play', paused: false, player: { running: false } } as unknown as GameContext;
  }

  it('constructor, unlock, setVolume, update y eventos no fallan ni hacen nada', () => {
    const ctx = fakeCtx();
    const audio = new Audio(ctx);
    expect(() => {
      audio.unlock();
      audio.setVolume(0.3);
      audio.setVolume(NaN);
      ctx.bus.emit('sfx', { name: 'martillo', x: 0, y: 3, z: 0 });
      ctx.bus.emit('sfx', { name: 'desconocido' });
      ctx.bus.emit('notify', { text: 'Hola', kind: 'warn' });
      ctx.bus.emit('toolUsed', { tool: 'martillo', phase: 'start' });
      ctx.bus.emit('itemGained', { id: 'madera', qty: 2 });
      ctx.bus.emit('unlocked', { key: 'taller', name: 'Taller' });
      ctx.bus.emit('worldEventStarted', { eventId: 1, type: 'incendio', title: 'Incendio' });
      ctx.bus.emit('simReplaced', { reason: 'new' });
      for (let i = 0; i < 10; i++) audio.update(1 / 60);
      audio.update(NaN);
    }).not.toThrow();
  });

  it('cada habitante tiene un timbre de voz estable en 0..1', () => {
    const ids = ['npc1', 'npc2', 'npc3', 'marta', 'x'];
    for (const id of ids) {
      expect(voiceOf(id)).toBeGreaterThanOrEqual(0);
      expect(voiceOf(id)).toBeLessThanOrEqual(1);
      expect(voiceOf(id)).toBe(voiceOf(id));
    }
    expect(new Set(ids.map(voiceOf)).size).toBeGreaterThan(3);
  });

  it('curva de volumen perceptiva y acotada', () => {
    expect(volumeCurve(0)).toBe(0);
    expect(volumeCurve(1)).toBe(1);
    expect(volumeCurve(0.5)).toBeLessThan(0.5);
    expect(volumeCurve(2)).toBe(1);
    expect(volumeCurve(NaN)).toBe(0);
  });
});


/* ================================================================== */
/* RONDA DE CONTENIDO 2: síntesis offline, módulos nuevos y puerto      */
/* ================================================================== */

/* ---------------- BaseAudioContext falso (reglas de WebAudio) ---------------- */

class FakeParam {
  private v: number;
  readonly events: { kind: string; v: number; t: number }[] = [];
  constructor(v: number) {
    this.v = v;
  }
  get value(): number {
    return this.v;
  }
  set value(x: number) {
    if (!Number.isFinite(x)) throw new TypeError(`AudioParam.value no finito: ${x}`);
    this.v = x;
  }
  private check(v: number, t: number): void {
    if (!Number.isFinite(v) || !Number.isFinite(t)) throw new TypeError(`automatización no finita (${v}, ${t})`);
    if (t < 0) throw new RangeError(`instante negativo ${t}`);
  }
  setValueAtTime(v: number, t: number): this {
    this.check(v, t);
    this.events.push({ kind: 'set', v, t });
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    this.events.push({ kind: 'lin', v, t });
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    this.check(v, t);
    if (v === 0) throw new RangeError('rampa exponencial hasta 0');
    this.events.push({ kind: 'exp', v, t });
    return this;
  }
  setTargetAtTime(v: number, t: number, tau: number): this {
    this.check(v, t);
    if (!Number.isFinite(tau) || tau < 0) throw new RangeError(`constante de tiempo inválida ${tau}`);
    this.events.push({ kind: 'target', v, t });
    return this;
  }
  cancelScheduledValues(t: number): this {
    this.check(0, t);
    return this;
  }
}

class FakeNode {
  outputs: unknown[] = [];
  constructor(readonly ctx: FakeContext) {
    ctx.nodes.push(this);
  }
  connect<T>(dest: T): T {
    if (!dest) throw new TypeError('connect sin destino');
    this.outputs.push(dest);
    return dest;
  }
  disconnect(): void {
    this.outputs = [];
  }
}

class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}
class FakeBiquad extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
  gain = new FakeParam(0);
  detune = new FakeParam(0);
}
class FakePanner extends FakeNode {
  pan = new FakeParam(0);
}
class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}
class FakeCompressor extends FakeNode {
  threshold = new FakeParam(-24);
  knee = new FakeParam(30);
  ratio = new FakeParam(12);
  attack = new FakeParam(0.003);
  release = new FakeParam(0.25);
  reduction = 0;
}
class FakeSource extends FakeNode {
  startAt: number | undefined;
  stopAt: number | undefined;
  start(t = 0): void {
    if (this.startAt !== undefined) throw new Error('InvalidStateError: start() dos veces');
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`start(${t})`);
    this.startAt = t;
  }
  stop(t = 0): void {
    if (this.startAt === undefined) throw new Error('InvalidStateError: stop() antes de start()');
    if (!Number.isFinite(t) || t < 0) throw new RangeError(`stop(${t})`);
    this.stopAt = t;
  }
}
class FakeOscillator extends FakeSource {
  type = 'sine';
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
}
class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null;
  loop = false;
  playbackRate = new FakeParam(1);
  override start(t = 0, offset = 0): void {
    if (!Number.isFinite(offset) || offset < 0) throw new RangeError(`offset ${offset}`);
    if (!this.buffer) throw new Error('fuente sin búfer');
    super.start(t);
  }
}
class FakeBuffer {
  private data: Float32Array[];
  readonly duration: number;
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    if (!(length > 0) || !(sampleRate > 0)) throw new RangeError('búfer vacío');
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
    this.duration = length / sampleRate;
  }
  getChannelData(c: number): Float32Array {
    return this.data[c]!;
  }
}

class FakeContext {
  readonly nodes: FakeNode[] = [];
  readonly destination: FakeNode;
  currentTime = 0;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  readonly sampleRate: number;
  constructor(opts?: { sampleRate?: number } | number) {
    this.sampleRate = typeof opts === 'number' ? opts : (opts?.sampleRate ?? 22050);
    this.destination = new FakeNode(this);
  }
  createGain(): FakeGain {
    return new FakeGain(this);
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad(this);
  }
  createStereoPanner(): FakePanner {
    return new FakePanner(this);
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper(this);
  }
  createDynamicsCompressor(): FakeCompressor {
    return new FakeCompressor(this);
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator(this);
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }
  createBuffer(ch: number, len: number, sr: number): FakeBuffer {
    return new FakeBuffer(ch, len, sr);
  }
  resume(): Promise<void> {
    if (this.state !== 'closed') this.state = 'running';
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    if (this.state !== 'closed') this.state = 'suspended';
    return Promise.resolve();
  }
  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }
  sources(): FakeSource[] {
    return this.nodes.filter((n): n is FakeSource => n instanceof FakeSource);
  }
}

const asCtx = (c: FakeContext): BaseAudioContext => c as unknown as BaseAudioContext;

/** Búferes compartidos (generarlos cuesta unos cientos de ms). */
let BANK: NoiseBank | null = null;
function bank(): NoiseBank {
  BANK ??= createNoiseBank(asCtx(new FakeContext(22050)), seededRandom(99));
  return BANK;
}

/** Programa una receta en un contexto nuevo y devuelve el contexto, el inicio y el final. */
function schedule(name: string, opts: SfxOpts = {}, seed = 3): { ctx: FakeContext; t0: number; end: number } {
  const ctx = new FakeContext(44100);
  const out = ctx.createGain();
  const t0 = 0.25;
  const s: Synth = { ctx: asCtx(ctx), out: out as unknown as AudioNode, t: t0, bank: bank(), rand: seededRandom(seed) };
  const end = SFX[name]!.play(s, opts);
  return { ctx, t0, end };
}

describe('Síntesis offline (contexto falso): todas las recetas', () => {
  const cases: [string, SfxOpts][] = Object.keys(SFX).map((n) => [n, {}]);
  cases.push(['fuego_artificial', { distance: 40 }], ['fuego_artificial', { distance: 1400 }], ['campana_puerto', { count: 8 }], ['trueno', { distance: 30 }], ['paso', { surface: 'bodega', wet: 1, run: true }]);

  it('cada receta programa nodos válidos que arrancan y se paran dentro de su duración', () => {
    for (const [name, opts] of cases) {
      for (const seed of [1, 2, 3]) {
        const { ctx, t0, end } = schedule(name, opts, seed);
        const label = `${name} ${JSON.stringify(opts)} semilla ${seed}`;
        expect(Number.isFinite(end), label).toBe(true);
        expect(end, label).toBeGreaterThan(t0);
        expect(end - t0, label).toBeLessThan(20);
        const srcs = ctx.sources();
        expect(srcs.length, label).toBeGreaterThan(0);
        for (const src of srcs) {
          expect(src.startAt, label).toBeDefined();
          expect(src.stopAt, `${label}: una fuente queda sonando`).toBeDefined();
          expect(src.startAt!, label).toBeGreaterThanOrEqual(t0 - 1e-9);
          expect(src.stopAt!, label).toBeGreaterThanOrEqual(src.startAt!);
          expect(src.stopAt!, `${label}: para después del final declarado`).toBeLessThanOrEqual(end + 0.05);
          expect(src.outputs.length, `${label}: fuente sin conectar`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('fuegos artificiales: el estallido llega con el retardo del sonido y lejos dura más', () => {
    const boomAt = (distance: number): number => {
      const { ctx, t0 } = schedule('fuego_artificial', { distance }, 5);
      // El golpe grave del estallido es el único tono programado por debajo de 120 Hz (los LFO de vibrato no se programan).
      const boom = ctx.sources().find((n) => n instanceof FakeOscillator && n.frequency.events.length > 0 && n.frequency.events[0]!.v < 120)!;
      return boom.startAt! - t0;
    };
    expect(boomAt(SOUND_SPEED)).toBeCloseTo(1, 2);
    expect(boomAt(60)).toBeCloseTo(60 / SOUND_SPEED, 2);
    // Más allá de unos 1000 m el retardo se limita a 3 s.
    expect(boomAt(1500)).toBeCloseTo(3, 2);
    expect(schedule('fuego_artificial', { distance: 900 }, 5).end).toBeGreaterThan(schedule('fuego_artificial', { distance: 50 }, 5).end);
  });

  it('la música de la llegada dura entre 8 y 14 s y la radio, de 2 a 4 s', () => {
    const m = schedule('llegada');
    expect(m.end - m.t0).toBeGreaterThan(8);
    expect(m.end - m.t0).toBeLessThan(14);
    // Acordeón, cuerdas y bajo: muchas notas, todas en sol mayor (sin notas fuera de la escala).
    const G_MAJOR = new Set([7, 9, 11, 0, 2, 4, 6]);
    const notes = m.ctx
      .sources()
      .filter((n): n is FakeOscillator => n instanceof FakeOscillator && (n.type === 'sawtooth' || n.type === 'triangle'))
      .map((o) => o.frequency.events[0]?.v ?? o.frequency.value)
      .filter((f) => f > 40 && f < 2000);
    expect(notes.length).toBeGreaterThan(60);
    for (const f of notes) expect(G_MAJOR.has(((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12), `nota ${f.toFixed(1)} Hz`).toBe(true);
    const r = schedule('radio');
    expect(r.end - r.t0).toBeGreaterThan(2);
    expect(r.end - r.t0).toBeLessThan(4);
  });

  it('la mejora terminada suena a obra terminada con un escalón más (alias y mezcla)', () => {
    expect(resolveSfx('mejora_terminada')).toBe('mejora_terminada');
    expect(SFX['mejora_terminada']!.global).toBe(true);
    expect(SFX['mejora_terminada']!.priority).toBeGreaterThanOrEqual(SFX['obra_terminada']!.priority);
    expect(resolveSfx('mejora')).toBe('mejora_terminada');
    expect(resolveSfx('leer')).toBe('pagina');
    expect(SFX['llegada']!.bus).toBe('ui');
    expect(SFX['fuego_artificial']!.bus).toBe('ext');
    expect(SFX['fuego_artificial']!.max).toBeGreaterThan(1000);
  });
});

describe('Síntesis offline: capas de ambiente y fuentes del barco', () => {
  function ambience(): { ctx: FakeContext; amb: Ambience } {
    const ctx = new FakeContext(22050);
    const ext = ctx.createGain();
    const amb = ctx.createGain();
    const world = ctx.createGain();
    const a = new Ambience(asCtx(ctx), bank(), ext as unknown as AudioNode, amb as unknown as AudioNode, world as unknown as AudioNode);
    return { ctx, amb: a };
  }
  const calm = ambientMix({ waveHeight: 0.6, wind: 0.3, rain: 0, speed: 6, storm: false, env: { exposure: 1, roof: 0, kind: 'exterior' }, gulls: 0 });
  const silent = { ...calm, seaDeep: 0, seaWash: 0, hullRush: 0, hullRumble: 0, windBody: 0, windWhistle: 0, rainHiss: 0, rainPatter: 0, rainRoar: 0, roofRain: 0, portCrowd: 0 };
  const KINDS = Object.keys(EMITTER_REF) as EmitterKind[];

  it('cada fuente nueva se construye, suena y se desmonta sin dejar nada en marcha', () => {
    for (const kind of KINDS) {
      for (const intensity of kind === 'grua' ? Object.values(GRUA_LEVEL) : [1]) {
        const { ctx, amb } = ambience();
        const on = new Map([[kind, { gain: 1, pan: 0.3, cutoff: 1500, intensity, rough: kind === 'grua' }]]);
        for (let i = 0; i < 20; i++) {
          ctx.currentTime += 0.05;
          amb.update(0.05, silent, on, false);
        }
        expect(amb.levels()[`fuente:${kind}`], kind).toBe(1);
        const started = ctx.sources().filter((n) => n.startAt !== undefined);
        expect(started.length, kind).toBeGreaterThan(0);
        for (let i = 0; i < 80; i++) {
          ctx.currentTime += 0.05;
          amb.update(0.05, silent, new Map(), false);
        }
        expect(amb.levels()[`fuente:${kind}`], kind).toBe(0);
        for (const n of started) expect(n.stopAt, `${kind}: fuente sin parar`).toBeDefined();
        expect(amb.runningLayers(), kind).toBe(0);
      }
    }
  });

  it('cada fuente tiene distancia y ganancia de referencia', () => {
    for (const kind of KINDS) {
      expect(EMITTER_REF[kind], kind).toBeGreaterThan(0);
      expect(EMITTER_MAX[kind], kind).toBeGreaterThan(EMITTER_REF[kind]);
      expect(EMITTER_GAIN[kind], kind).toBeGreaterThan(0);
      expect(EMITTER_GAIN[kind], kind).toBeLessThan(1);
    }
  });

  it('el muelle del puerto suena con gente y se para sin ella; campanas del puerto y de las boyas', () => {
    const { ctx, amb } = ambience();
    const port = ambientMix({ waveHeight: 0.8, wind: 0.3, rain: 0, speed: 0, storm: false, env: { exposure: 1, roof: 0, kind: 'exterior' }, gulls: 1, port: 1, crowd: 0.8 });
    const shots: string[] = [];
    for (let i = 0; i < 4000; i++) {
      ctx.currentTime += 0.05;
      for (const sh of amb.update(0.05, port, new Map(), true)) shots.push(sh.name);
    }
    expect(amb.levels()['portCrowd']).toBeCloseTo(LAYER_GAIN.portCrowd * port.portCrowd, 5);
    // 200 s en el puerto: algún repique (≥ 25 s entre uno y otro) y varias boyas.
    const bells = shots.filter((n) => n === 'campana_puerto').length;
    expect(bells).toBeGreaterThanOrEqual(1);
    expect(bells).toBeLessThanOrEqual(8);
    expect(shots.filter((n) => n === 'campana_boya').length).toBeGreaterThanOrEqual(3);
    expect(shots.filter((n) => n === 'gaviota').length).toBeGreaterThan(10);
    for (const n of shots) expect(SFX[n], n).toBeTruthy();
    // Fuera del puerto: ni campanas ni muelle.
    const away = ambientMix({ waveHeight: 0.8, wind: 0.3, rain: 0, speed: 6, storm: false, env: { exposure: 1, roof: 0, kind: 'exterior' }, gulls: 0 });
    const later: string[] = [];
    for (let i = 0; i < 2000; i++) {
      ctx.currentTime += 0.05;
      for (const sh of amb.update(0.05, away, new Map(), true)) later.push(sh.name);
    }
    expect(amb.levels()['portCrowd']).toBe(0);
    expect(later.some((n) => n.startsWith('campana'))).toBe(false);
  });

  it('pulsos (trinquete, ping del radar): ataque corto y caída exponencial', () => {
    const c = pulseCurve(9);
    expect(c.length).toBe(1025);
    expect(c[0]).toBe(0);
    const peak = c.indexOf(Math.max(...c));
    expect(peak).toBeLessThan(20);
    expect(c[peak]).toBeCloseTo(1, 1);
    for (let i = peak + 1; i < c.length; i++) expect(c[i]!).toBeLessThanOrEqual(c[i - 1]!);
    expect(c[c.length - 1]!).toBeLessThan(0.001);
    expect(pulseCurve(9)).toBe(c);
  });

  it('la grúa suena distinta en cada fase: con carga más grave y lenta, en rueda libre más aguda y rápida', () => {
    const [pIzar, rIzar] = gruaTuning(GRUA_LEVEL.izando);
    const [pLanzar, rLanzar] = gruaTuning(GRUA_LEVEL.enganchando);
    const [pCable, rCable] = gruaTuning(GRUA_LEVEL.recargando);
    expect(pIzar).toBeLessThan(pCable);
    expect(pLanzar).toBeGreaterThan(pCable);
    expect(rIzar).toBeLessThan(rCable);
    expect(rLanzar).toBeGreaterThan(rCable);
  });
});

describe('DSP: burbujeo del vivero y murmullo de conversación', () => {
  it('burbujeo: audible, sin saturar, finito, reproducible y con sus burbujas a ráfagas', () => {
    const a = bubblesLoop(SR, 2, 30, seededRandom(4));
    expect(a.length).toBe(SR * 2);
    expect(hasNonFinite(a)).toBe(false);
    expect(peakOf(a)).toBeLessThanOrEqual(0.91);
    expect(peakOf(a)).toBeGreaterThan(0.5);
    expect(rmsOf(a)).toBeGreaterThan(0.02);
    expect(Array.from(bubblesLoop(SR, 2, 30, seededRandom(4)).subarray(0, 256))).toEqual(Array.from(a.subarray(0, 256)));
    // Sin graves de manejo (paso alto): media casi nula.
    let mean = 0;
    for (const v of a) mean += v;
    expect(Math.abs(mean / a.length)).toBeLessThan(0.01);
    // Tono de burbuja (cruces por cero en los tramos de 10 ms donde suena): entre ~300 Hz y ~3 kHz.
    const block = Math.floor(SR * 0.01);
    let zc = 0;
    let loudBlocks = 0;
    let quietBlocks = 0;
    for (let b = 0; b + block <= a.length; b += block) {
      const seg = a.subarray(b, b + block);
      if (rmsOf(seg) < 0.05) {
        quietBlocks++;
        continue;
      }
      loudBlocks++;
      for (let i = 1; i < seg.length; i++) if (seg[i - 1]! < 0 !== seg[i]! < 0) zc++;
    }
    const hz = zc / 2 / (loudBlocks * 0.01);
    expect(loudBlocks).toBeGreaterThan(10);
    expect(hz).toBeGreaterThan(300);
    expect(hz).toBeLessThan(3000);
    // A ráfagas: hay silencios entre burbujas.
    expect(quietBlocks).toBeGreaterThan(loudBlocks * 0.2);
  });

  it('murmullo: RMS 0,2, cálido (sin agudos), finito y en bucle sin costura', () => {
    const m = murmurLoop(SR, 3, 4, seededRandom(8));
    expect(m.length).toBe(SR * 3);
    expect(hasNonFinite(m)).toBe(false);
    expect(rmsOf(m)).toBeGreaterThan(0.17);
    expect(rmsOf(m)).toBeLessThan(0.23);
    expect(peakOf(m)).toBeLessThanOrEqual(0.95);
    let d = 0;
    for (let i = 1; i < m.length; i++) d += (m[i]! - m[i - 1]!) ** 2;
    // La diferencia (agudos) es pequeña frente a la señal: voces apagadas, sin siseo.
    expect(Math.sqrt(d / (m.length - 1)) / rmsOf(m)).toBeLessThan(0.45);
    let typical = 0;
    for (let i = 1; i < m.length; i++) typical += Math.abs(m[i]! - m[i - 1]!);
    typical /= m.length - 1;
    expect(Math.abs(m[0]! - m[m.length - 1]!)).toBeLessThan(typical * 8);
  });

  it('el banco de búferes incluye el burbujeo y el murmullo', () => {
    const b = bank();
    expect(b.bubbles.duration).toBeGreaterThan(2);
    expect(b.murmur.duration).toBeGreaterThan(4);
  });
});

/* ---------------- Módulos nuevos en la simulación real ---------------- */

const UNLOCKS = ['taller', 'energia', 'agua', 'enfermeria', 'solar', 'invernadero', 'motor', 'casco', 'acuicultura', 'grua', 'radar'];

/** Coloca un módulo terminado en el primer sitio válido (con todos los planos). */
function placeAt(sim: Simulation, type: string, level: number, ok?: (x: number, z: number) => boolean): ModuleInstance {
  const ship = sim.state.ship;
  for (let x = ship.length - 1; x >= 0; x--) {
    for (let z = 0; z < ship.width; z++) {
      if (ok && !ok(x, z)) continue;
      for (const rot of [0, 1, 2, 3] as Rotation[]) {
        if (!checkPlacement(ship, UNLOCKS, type, level, x, z, rot).ok) continue;
        const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
        ship.modules.push(m);
        sim.shipChanged();
        return m;
      }
    }
  }
  throw new Error(`no cabe ${type} en el nivel ${level}`);
}

type CraneMod = ModuleInstance & { prodProgress?: number; prodTarget?: number | null };

/** Habitante despierto de pie en un punto (sin tarea). */
function standAt(n: NpcState, p: { x: number; y: number; z: number }): void {
  n.pos = { ...p };
  n.activity = 'idle';
  n.awayUntil = null;
}

describe('Fuentes nuevas del barco (estado real)', () => {
  it('grúa: suena izando, recogiendo cable y lanzando; calla parada, sin energía, con tormenta o esperando', () => {
    const sim = Simulation.newGame(21);
    const st = sim.state;
    st.weather.kind = 'despejado';
    const g = placeAt(sim, 'grua', 1) as CraneMod;
    g.on = true;
    g.powered = true;
    const grua = () => collectEmitters(st, sim.layout).find((e) => e.kind === 'grua');
    g.prodProgress = GRUA_LIFT_MIN * 0.5;
    expect(craneSoundPhase(st, g)).toBe('izando');
    expect(grua()?.intensity).toBe(GRUA_LEVEL.izando);
    // En la pluma, por encima de la cubierta.
    expect(grua()!.y).toBeGreaterThan(levelY(1) + 1);
    g.prodProgress = GRUA_CYCLE_MIN * 0.6;
    expect(grua()?.intensity).toBe(GRUA_LEVEL.recargando);
    g.prodProgress = GRUA_CYCLE_MIN + GRUA_HOOK_MIN * 0.5;
    g.prodTarget = 77;
    expect(grua()?.intensity).toBe(GRUA_LEVEL.enganchando);
    g.prodTarget = null;
    expect(grua()).toBeUndefined();
    g.prodTarget = 77;
    st.weather.kind = 'tormenta';
    expect(grua()).toBeUndefined();
    st.weather.kind = 'despejado';
    g.powered = false;
    expect(grua()).toBeUndefined();
    g.powered = true;
    g.on = false;
    expect(grua()).toBeUndefined();
    g.on = true;
    g.fire = 30;
    expect(grua()).toBeUndefined();
    expect(collectEmitters(st, sim.layout).some((e) => e.kind === 'incendio')).toBe(true);
    // Una grúa recién construida (sin avance guardado) empieza recogiendo cable.
    g.fire = 0;
    delete g.prodProgress;
    expect(craneSoundPhase(st, g)).toBe('recargando');
  });

  it('radar encendido, vivero con sitio en la bandeja (un sonido por tanque) y ahumadero con encargos', () => {
    const sim = Simulation.newGame(22);
    const st = sim.state;
    const radar = placeAt(sim, 'radar', 2);
    const viv = placeAt(sim, 'vivero', 0);
    const ahu = placeAt(sim, 'ahumadero', 1);
    const kinds = () => collectEmitters(st, sim.layout).map((e) => e.kind);
    expect(kinds()).not.toContain('radar');
    radar.on = true;
    radar.powered = true;
    const r = collectEmitters(st, sim.layout).find((e) => e.kind === 'radar')!;
    expect(r.level).toBe(2);
    viv.on = true;
    viv.powered = true;
    const tanks = collectEmitters(st, sim.layout).filter((e) => e.kind === 'vivero');
    expect(tanks.length).toBe(2);
    expect(Math.hypot(tanks[0]!.x - tanks[1]!.x, tanks[0]!.z - tanks[1]!.z)).toBeGreaterThan(2);
    // Bandeja llena: las bombas paran (no consume) y no burbujea.
    addItem(viv.inventory!, 'pescado_crudo', 999);
    expect(kinds()).not.toContain('vivero');
    expect(kinds()).not.toContain('ahumadero');
    ahu.queue.push({ recipeId: 'ahumar', progress: 0 } as never);
    expect(kinds()).toContain('ahumadero');
    ahu.status = 'broken';
    expect(kinds()).not.toContain('ahumadero');
  });

  it('sala común: murmullo con dos o más despiertos dentro (más gente, más fuerte) y estufa en el nivel 2', () => {
    const sim = Simulation.newGame(23);
    const st = sim.state;
    const sala = placeAt(sim, 'sala_comun', 1);
    const c = moduleCenter(sala, st.ship.width);
    const inside = { x: c.x, y: c.y, z: c.z };
    expect(cellAtPoint(sim.layout, inside.x, inside.y + 0.3, inside.z)?.moduleId).toBe(sala.id);
    const out = { x: c.x + 30, y: c.y, z: 0 };
    for (const n of st.npcs) standAt(n, out);
    const salaEm = () => collectEmitters(st, sim.layout).find((e) => e.kind === 'sala');
    expect(salaEm()).toBeUndefined();
    expect(st.npcs.length).toBeGreaterThanOrEqual(2);
    standAt(st.npcs[0]!, inside);
    expect(salaEm()).toBeUndefined();
    standAt(st.npcs[1]!, { ...inside, x: inside.x + 1 });
    const two = salaEm()!;
    expect(two.intensity).toBeCloseTo(0.5);
    if (st.npcs[2]) {
      standAt(st.npcs[2], { ...inside, x: inside.x - 1 });
      expect(salaEm()!.intensity).toBeGreaterThan(two.intensity);
      st.npcs[2].activity = 'sleeping';
      expect(salaEm()!.intensity).toBeCloseTo(0.5);
    }
    // Sin estufa en el nivel 1; con la mejora, la estufa arde junto a la estantería.
    const stoves = () => collectEmitters(st, sim.layout).filter((e) => e.kind === 'fogon' && e.moduleId === sala.id);
    expect(stoves().length).toBe(0);
    sala.tier = 2;
    expect(stoves().length).toBe(1);
    // Jugadores a la mesa (naipes): en su sitio y con la animación de jugar.
    for (const n of st.npcs.slice(0, 2)) n.task = { kind: 'ocio', targetModuleId: sala.id, data: { job: 'sala', game: true, anim: 'jugar' } };
    const info = loungeInfo(st, sim.layout).find((l) => l.moduleId === sala.id)!;
    expect(info.players).toBe(2);
    expect(info.table).not.toBeNull();
    expect(info.stove).not.toBeNull();
    sala.fire = 40;
    expect(loungeInfo(st, sim.layout).length).toBe(0);
  });
});

describe('Puerto Esperanza, radio y radar', () => {
  it('el puerto se oye solo en su región: lejos antes de llegar; con gente de día, poca de noche y llena en la fiesta', () => {
    const sim = Simulation.newGame(24);
    const st = sim.state;
    expect(portPresence(st)).toEqual({ port: 0, crowd: 0 });
    st.voyage.regionId = FINAL_REGION;
    st.story = { pages: [1, 2, 3, 4, 5], revealed: true, arrived: false };
    const day = Math.floor(st.time / 1440);
    st.time = day * 1440 + 12 * 60;
    const before = portPresence(st);
    expect(before.port).toBeGreaterThan(0.3);
    expect(before.port).toBeLessThan(1);
    expect(before.crowd).toBe(0);
    st.story!.arrived = true;
    const noon = portPresence(st);
    expect(noon.port).toBe(1);
    expect(noon.crowd).toBeGreaterThan(0.6);
    st.time = day * 1440 + 2 * 60;
    const night = portPresence(st);
    expect(night.crowd).toBeLessThan(0.2);
    expect(portPresence(st, true).crowd).toBe(1);
    // Gaviotas del puerto de día.
    st.time = day * 1440 + 12 * 60;
    st.weather.kind = 'despejado';
    st.weather.rain = 0;
    expect(gullPresence(st)).toBeGreaterThan(0.5);
  });

  it('mezcla del puerto: muelle (menos con lluvia), repiques y boyas (más con mar movida)', () => {
    const base: AmbientInput = { waveHeight: 0.6, wind: 0.3, rain: 0, speed: 0, storm: false, env: { exposure: 1, roof: 0, kind: 'exterior' }, gulls: 0 };
    const none = ambientMix(base);
    expect(none.portCrowd).toBe(0);
    expect(none.harborBellRate).toBe(0);
    expect(none.buoyBellRate).toBe(0);
    const port = ambientMix({ ...base, port: 1, crowd: 0.8 });
    expect(port.portCrowd).toBeCloseTo(0.8);
    expect(port.harborBellRate).toBeGreaterThan(0);
    expect(port.buoyBellRate).toBeGreaterThan(0);
    expect(ambientMix({ ...base, port: 1, crowd: 0.8, rain: 1 }).portCrowd).toBeLessThan(port.portCrowd * 0.5);
    expect(ambientMix({ ...base, port: 1, waveHeight: 2.6 }).buoyBellRate).toBeGreaterThan(port.buoyBellRate);
    const m = ambientMix({ ...base, port: NaN, crowd: Infinity });
    for (const [k, v] of Object.entries(m)) expect(Number.isFinite(v), k).toBe(true);
  });

  it('avisos: «Radio: …» suena por la radio y «El radar detecta/marca…» con un ping', () => {
    expect(notifyCue('Radio: el pesquero «Gaviota» saluda.')).toBe('radio');
    expect(notifyCue('El radar detecta un frente de tormenta y el barómetro empieza a caer')).toBe('radar_contacto');
    expect(notifyCue('¡Náufragos! El radar detecta una balsa a la deriva por babor')).toBe('radar_contacto');
    expect(notifyCue('El radar marca tierra por delante, aún lejos: Isla Verde')).toBe('radar_contacto');
    expect(notifyCue('Tierra a la vista: Isla Verde')).toBeNull();
    expect(notifyCue('Has construido el radar')).toBeNull();
    expect(notifyCue(undefined as never)).toBeNull();
  });

  it('los textos reales de la simulación con radio o radar se reconocen (events.ts, weather.ts)', () => {
    let radio = 0;
    let radar = 0;
    for (const f of ['../src/sim/events.ts', '../src/sim/weather.ts']) {
      const src = SOURCES[f]!;
      expect(src, f).toBeTruthy();
      for (const m of src.matchAll(/['`](Radio: [^'`]*)['`]/g)) {
        expect(notifyCue(m[1]!), m[1]).toBe('radio');
        radio++;
      }
      for (const m of src.matchAll(/['`]([^'`]*\bradar (?:detecta|marca)[^'`]*)['`]/gi)) {
        expect(notifyCue(m[1]!.replace(/\$\{[^}]*\}/g, 'x')), m[1]).toBe('radar_contacto');
        radar++;
      }
    }
    expect(radio).toBeGreaterThan(8);
    expect(radar).toBeGreaterThanOrEqual(4);
  });
});

describe('Catálogo: nombres emitidos en todo el código', () => {
  it('cada sfx que emiten la simulación, el juego, la interfaz y la construcción tiene receta (no el genérico)', () => {
    const names = new Set<string>();
    const quoted = (expr: string): string[] => [...expr.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    expect(Object.keys(SOURCES).length).toBeGreaterThan(40);
    for (const [f, src] of Object.entries(SOURCES)) {
      if (f.startsWith('../src/audio/')) continue;
      for (const m of src.matchAll(/emit\('sfx',\s*\{\s*name:\s*([^,}]+)/g)) for (const n of quoted(m[1]!)) names.add(n);
      for (const m of src.matchAll(/\bsfx\(\s*'([a-z_]+)'/g)) names.add(m[1]!);
      for (const m of src.matchAll(/\bsfxAt\(\s*sim,\s*(.+?),\s*m\)/g)) for (const n of quoted(m[1]!)) names.add(n);
    }
    // Nombres en variables (actions.ts: comer, beber o curar).
    for (const n of ['comer', 'beber', 'curar']) names.add(n);
    expect(names.size).toBeGreaterThan(50);
    for (const n of ['fuego_artificial', 'mejora_terminada', 'pagina', 'obra_terminada', 'ui_click', 'cocinado']) expect(names.has(n), n).toBe(true);
    for (const n of names) {
      expect(resolveSfx(n), `«${n}» no tiene receta`).not.toBe('generico');
      expect(SFX[resolveSfx(n)], n).toBeTruthy();
    }
  });
});

/* ---------------- Audio de punta a punta con el contexto falso ---------------- */

describe('Audio de punta a punta (WebAudio falso)', () => {
  const g = globalThis as unknown as { AudioContext?: unknown };
  const prev = g.AudioContext;
  beforeAll(() => {
    g.AudioContext = FakeContext;
  });
  afterAll(() => {
    g.AudioContext = prev;
  });

  interface Rig {
    audio: Audio;
    ctx: GameContext;
    sim: Simulation;
    eng: () => AudioEngine;
    fake: () => FakeContext;
    step: (n?: number, dt?: number) => void;
    played: (name: string) => number;
  }

  function rig(seed: number, prepare?: (sim: Simulation) => void): Rig {
    const bus = new EventBus();
    const sim = Simulation.newGame(seed, bus);
    prepare?.(sim);
    const ctx = { sim, bus, settings: { ...DEFAULT_SETTINGS, volume: 0.7 }, mode: 'play', paused: false, player: { running: false } } as unknown as GameContext;
    const audio = new Audio(ctx);
    audio.unlock();
    const eng = () => (audio as unknown as { engine: AudioEngine }).engine;
    const fake = () => eng().ctx as unknown as FakeContext;
    const step = (n = 1, dt = 1 / 30): void => {
      for (let i = 0; i < n; i++) {
        fake().currentTime += dt;
        audio.update(dt);
      }
    };
    // Prepara los búferes (un paso por frame) y arranca el ambiente.
    for (let i = 0; i < 40 && !eng().ready; i++) step();
    expect(eng().ready).toBe(true);
    step(10);
    return { audio, ctx, sim, eng, fake, step, played: (name) => eng().voices.played.get(name) ?? 0 };
  }

  it('arranca con el gesto, prepara los búferes y suena el ambiente del mar sin errores', () => {
    const r = rig(31);
    expect(r.fake().state).toBe('running');
    expect(r.eng().ambience.runningLayers()).toBeGreaterThan(0);
    expect((r.audio as unknown as { errors: number }).errors).toBe(0);
  });

  it('fuegos artificiales: se oyen con el retardo de su distancia', () => {
    const r = rig(32);
    const p = r.sim.state.player.pos;
    const before = r.fake().nodes.length;
    r.ctx.bus.emit('sfx', { name: 'fuego_artificial', x: p.x + 200, y: p.y + 60, z: p.z });
    expect(r.played('fuego_artificial')).toBe(1);
    const made = r.fake().nodes.slice(before);
    const boom = made.find((n): n is FakeOscillator => n instanceof FakeOscillator && n.frequency.events.length > 0 && n.frequency.events[0]!.v < 120)!;
    const d = Math.hypot(200, 60 - 1.6);
    expect(boom.startAt! - r.fake().currentTime).toBeCloseTo(d / SOUND_SPEED, 1);
  });

  it('radio y radar: suenan con su aviso (sin el tono genérico encima)', () => {
    const r = rig(33, (sim) => {
      const radar = placeAt(sim, 'radar', 2);
      radar.on = true;
      radar.powered = true;
      const prop = sim.layout.props.find((pp) => pp.moduleId === radar.id && pp.kind === 'radar')!;
      Object.assign(sim.state.player.pos, { x: prop.x + 2, y: prop.y, z: prop.z });
    });
    r.ctx.bus.emit('notify', { text: 'Radio: el pesquero «Sardina» saluda y desea buen viento a quien le escuche.', kind: 'info' });
    r.step();
    expect(r.played('radio')).toBe(1);
    expect(r.played('aviso_info')).toBe(0);
    r.step(60);
    r.ctx.bus.emit('notify', { text: 'El radar detecta un frente de tormenta y el barómetro empieza a caer', kind: 'warn' });
    r.step();
    expect(r.played('radar_contacto')).toBe(1);
    // Un aviso de peligro conserva su tono.
    expect(r.played('aviso_atencion')).toBe(1);
    r.step(60);
    r.ctx.bus.emit('notify', { text: 'Hay sitio en la bodega', kind: 'info' });
    r.step();
    expect(r.played('aviso_info')).toBe(1);
  });

  it('llegada a Puerto Esperanza: música una sola vez y sin la fanfarria del mismo momento', () => {
    const r = rig(34, (sim) => {
      sim.state.voyage.regionId = FINAL_REGION;
    });
    r.sim.state.story!.arrived = true;
    r.ctx.bus.emit('worldEventStarted', { eventId: 1, type: 'llegada', title: 'Llegada a Puerto Esperanza' });
    r.ctx.bus.emit('notify', { text: '¡Puerto Esperanza!', kind: 'good' });
    r.ctx.bus.emit('sfx', { name: 'fanfarria' });
    // El mercado del muelle abre en el mismo instante (evento 'mercante'): sin sirena encima de la música.
    r.ctx.bus.emit('worldEventStarted', { eventId: 2, type: 'mercante', title: 'Mercado de Puerto Esperanza' });
    r.step(90);
    expect(r.played('llegada')).toBe(1);
    expect(r.played('fanfarria')).toBe(0);
    expect(r.played('aviso_bien')).toBe(0);
    expect(r.played('sirena')).toBe(0);
    // Un mercante que llega más tarde sí hace sonar su sirena.
    r.step(150);
    r.ctx.bus.emit('worldEventStarted', { eventId: 3, type: 'mercante', title: 'Mercante' });
    r.step();
    expect(r.played('sirena')).toBe(1);
    // Más tarde otra fanfarria (un plano nuevo) sí suena.
    r.ctx.bus.emit('unlocked', { key: 'radar', name: 'Radar' });
    r.step();
    expect(r.played('fanfarria')).toBe(1);
  });

  it('la llegada sin evento (story.arrived pasa a true) también toca la música; cargar una partida ya llegada no', () => {
    const r = rig(35, (sim) => {
      sim.state.voyage.regionId = FINAL_REGION;
    });
    r.sim.state.story!.arrived = true;
    r.step(3);
    expect(r.played('llegada')).toBe(1);
    const loaded = rig(36, (sim) => {
      sim.state.voyage.regionId = FINAL_REGION;
      sim.state.story!.arrived = true;
    });
    loaded.step(30);
    expect(loaded.played('llegada')).toBe(0);
    // Cambiar de partida a una ya llegada tampoco.
    const fresh = Simulation.newGame(37, loaded.ctx.bus);
    fresh.state.story!.arrived = true;
    (loaded.ctx as { sim: Simulation }).sim = fresh;
    loaded.ctx.bus.emit('simReplaced', { reason: 'load' });
    loaded.step(30);
    expect(loaded.played('llegada')).toBe(0);
  });

  it('grúa: torno al lanzar el gancho, chapoteo donde cae y al sacar el resto; su motor suena trabajando', () => {
    let crane: CraneMod | null = null;
    const r = rig(38, (sim) => {
      sim.state.weather.kind = 'despejado';
      crane = placeAt(sim, 'grua', 1) as CraneMod;
      crane.on = true;
      crane.powered = true;
      crane.prodProgress = GRUA_CYCLE_MIN * 0.5;
      const prop = sim.layout.props.find((pp) => pp.moduleId === crane!.id && pp.kind === 'grua')!;
      Object.assign(sim.state.player.pos, { x: prop.x + 1, y: prop.y, z: prop.z });
    });
    const st = r.sim.state;
    const g = crane! as CraneMod;
    r.step(10);
    expect(r.eng().ambience.levels()['fuente:grua']).toBe(1);
    const side = Math.sign(moduleCenter(g, st.ship.width).z) || 1;
    st.debris.push({ id: 9001, kind: 'tablones', pos: { x: 2, z: side * 18 }, vel: { x: 0, z: 0 }, loot: [], spin: 0 });
    g.prodProgress = GRUA_CYCLE_MIN + 0.5;
    g.prodTarget = 9001;
    r.step(6);
    expect(r.played('grua_lanzar')).toBe(1);
    expect(r.played('chapoteo_corcho')).toBe(1);
    // Lo saca: el resto desaparece y la grúa empieza a izar.
    st.debris = st.debris.filter((d) => d.id !== 9001);
    g.prodTarget = null;
    g.prodProgress = 0;
    r.step(6);
    expect(r.played('grua_saca')).toBe(1);
    // Izando y recogiendo cable (en el juego, 25 s hasta el lance siguiente).
    r.step(60);
    // Si el resto se va a la deriva sin que lo saque (sigue recogiendo cable), no hay chapoteo.
    st.debris.push({ id: 9002, kind: 'barril', pos: { x: 4, z: side * 20 }, vel: { x: 0, z: 0 }, loot: [], spin: 0 });
    g.prodProgress = GRUA_CYCLE_MIN + 0.5;
    g.prodTarget = 9002;
    r.step(6);
    g.prodTarget = null;
    r.step(6);
    expect(r.played('grua_lanzar')).toBe(2);
    expect(r.played('grua_saca')).toBe(1);
    // Dormido (el tiempo va ×14) no suenan los lances (pasado el hueco mínimo entre dos).
    r.step(60);
    st.player.sleeping = { moduleId: null, bed: 0, until: null };
    g.prodProgress = GRUA_CYCLE_MIN + 0.5;
    g.prodTarget = 9002;
    r.step(6);
    expect(r.played('grua_lanzar')).toBe(2);
    // Al despertar, el lance siguiente vuelve a sonar.
    st.player.sleeping = null;
    g.prodTarget = null;
    r.step(6);
    g.prodTarget = 9002;
    r.step(6);
    expect(r.played('grua_lanzar')).toBe(3);
    expect((r.audio as unknown as { errors: number }).errors).toBe(0);
  });

  it('sala común: naipes en la mesa cuando juegan dos (cerca), nada si solo hay uno', () => {
    let sala: ModuleInstance | null = null;
    const r = rig(40, (sim) => {
      sala = placeAt(sim, 'sala_comun', 1);
      const c = moduleCenter(sala, sim.state.ship.width);
      Object.assign(sim.state.player.pos, { x: c.x, y: c.y, z: c.z });
      sim.state.npcs.forEach((n, i) => {
        standAt(n, i < 2 ? { x: c.x + (i ? 0.8 : -0.8), y: c.y, z: c.z } : { x: c.x + 30, y: c.y, z: 0 });
        n.task = i < 1 ? { kind: 'ocio', targetModuleId: sala!.id, data: { job: 'sala', game: true, anim: 'jugar' } } : null;
      });
    });
    r.step(300);
    expect(r.played('cartas')).toBe(0);
    // Dos conversando: murmullo de la sala.
    expect(r.eng().ambience.levels()['fuente:sala']).toBe(1);
    r.sim.state.npcs[1]!.task = { kind: 'ocio', targetModuleId: sala!.id, data: { job: 'sala', game: true, anim: 'jugar' } };
    r.step(300);
    // 10 s jugando: un golpe de naipes cada 2,5–7 s.
    expect(r.played('cartas')).toBeGreaterThanOrEqual(1);
    expect(r.played('cartas')).toBeLessThanOrEqual(5);
  });

  it('en Puerto Esperanza tras la llegada suena el muelle', () => {
    const r = rig(39, (sim) => {
      const st = sim.state;
      st.voyage.regionId = FINAL_REGION;
      st.story!.arrived = true;
      st.time = Math.floor(st.time / 1440) * 1440 + 12 * 60;
      st.weather.kind = 'despejado';
      st.weather.rain = 0;
    });
    r.step(30);
    expect(r.eng().ambience.levels()['portCrowd']).toBeGreaterThan(0.03);
  });
});

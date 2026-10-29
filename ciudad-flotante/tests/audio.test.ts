/**
 * Tests del audio (área audio): generadores DSP (señal no silenciosa, sin saturar, bucles sin
 * costura, reproducibles), entorno del oyente con el layout real del barco, curvas de mezcla del
 * ambiente, fuentes continuas, espacialización, catálogo de efectos y robustez sin WebAudio.
 * La síntesis WebAudio real se prueba en el navegador con `__game.cmd.audioTest()`
 * (OfflineAudioContext) mediante scripts/shot.mjs.
 */
import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/EventBus';
import { Audio, voiceOf, volumeCurve } from '../src/audio/Audio';
import { brownNoise, crackleLoop, creakBuffer, dropsLoop, hasNonFinite, makeLoopable, peakOf, pinkNoise, rmsOf, seededRandom, softClip, toDb, whiteNoise } from '../src/audio/dsp';
import {
  ambientMix,
  behindFor,
  collectEmitters,
  distanceGain,
  exteriorCutoff,
  exteriorGain,
  gullPresence,
  listenerEnv,
  occlusion,
  panFor,
  toolFallback,
  topNotify,
  type AmbientInput,
} from '../src/audio/mix';
import { SFX, SFX_ALIASES, resolveSfx } from '../src/audio/sfx';
import { cellAtPoint, instantiateModule } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import type { GameContext } from '../src/game/context';
import { DEFAULT_SETTINGS } from '../src/game/types';

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

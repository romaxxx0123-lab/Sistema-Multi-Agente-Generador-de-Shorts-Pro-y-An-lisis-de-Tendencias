/**
 * Tests de supervivencia (área sim-survival): necesidades, salud, sueño, objetos, inventarios,
 * agua, clima, viaje, tutorial y guardado.
 *
 * La mayoría de pruebas llaman directamente al sistema que prueban (`tickNeeds`, `tickWeather`,
 * `tickVoyage`) avanzando el reloj a mano, para que el azar de otros sistemas no interfiera.
 * Las pruebas de integración usan `sim.tick` con la simulación completa.
 */
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { REGION_LIST, REGIONS } from '../src/data/regions';
import { FINAL_REGION, PAGES_TO_REVEAL, STORY_PAGES, STORY_TEXTS } from '../src/data/story';
import * as actions from '../src/sim/actions';
import { ARRIVAL_HOURS } from '../src/sim/events';
import { CRUISE_SPEED, LEVEL_H, MINUTES_PER_DAY, NEED_RATES, PLAYER_SLOTS, SLEEP_TIME_SCALE, VISUAL_DRIFT } from '../src/sim/constants';
import { addItem, countItem, createInventory } from '../src/sim/inventory';
import * as needs from '../src/sim/needs';
import { createNewGame } from '../src/sim/newGame';
import { forwardOf } from '../src/sim/physics';
import { createLocalSaveStore, deserialize, exportSave, restoreState, SaveError, serialize, type StorageLike } from '../src/sim/save';
import { cellCenter, instantiateModule } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import { hourOf } from '../src/sim/time';
import * as tutorial from '../src/sim/tutorial';
import type { GameState, ModuleInstance, Vec3, WeatherKind } from '../src/sim/types';
import { SAVE_VERSION } from '../src/sim/types';
import { isRadarActive } from '../src/sim/utilities';
import * as voyage from '../src/sim/voyage';
import * as weather from '../src/sim/weather';

/* ------------------------------------------------------------------ */
/* Utilidades de prueba                                                */
/* ------------------------------------------------------------------ */

interface Note {
  text: string;
  kind: string;
}

function setup(seed = 3): { sim: Simulation; notes: Note[]; sfx: string[] } {
  const sim = new Simulation(createNewGame(seed));
  const notes: Note[] = [];
  const sfx: string[] = [];
  sim.bus.on('notify', (n) => notes.push(n));
  sim.bus.on('sfx', (s) => sfx.push(s.name));
  return { sim, notes, sfx };
}

/** Posiciones de referencia del barco inicial. */
const W = 4;
const at = (cx: number, cz: number, level: number): Vec3 => {
  const c = cellCenter(cx, cz, W);
  return { x: c.x, y: level * LEVEL_H, z: c.z };
};
/** Camarote (habitación cerrada, nivel 1). */
const INDOOR = at(3, 0, 1);
/** Cubierta a cielo abierto (nivel 1). */
const DECK = at(5, 1, 1);
/** Bodega (interior, nivel 0). */
const HOLD = at(2, 2, 0);

function place(sim: Simulation, p: Vec3): void {
  Object.assign(sim.state.player.pos, p);
}

function setNeeds(sim: Simulation, n: Partial<GameState['player']['needs']>): void {
  Object.assign(sim.state.player.needs, n);
}

/** Clima fijo con parámetros exactos. */
function setWeather(sim: Simulation, kind: WeatherKind, temperature: number, rain = 0, wind = 0): void {
  const w = sim.state.weather;
  w.kind = kind;
  w.next = kind === 'tormenta' ? 'nublado' : kind;
  w.remaining = 1e9;
  w.temperature = temperature;
  w.rain = rain;
  w.wind = wind;
}

/** Avanza `minutes` solo el sistema de necesidades (reloj incluido), en pasos de 0,5 min. */
function runNeeds(sim: Simulation, minutes: number, each?: () => void): void {
  for (let t = 0; t < minutes - 1e-9; t += 0.5) {
    each?.();
    sim.state.time += 0.5;
    needs.tickNeeds(sim, 0.5);
    if (!sim.state.player.alive) break;
  }
}

/** Lleva el reloj a la hora `h` del día actual o siguiente. */
function goToHour(sim: Simulation, h: number): void {
  const st = sim.state;
  let t = Math.floor(st.time / MINUTES_PER_DAY) * MINUTES_PER_DAY + h * 60;
  if (t < st.time) t += MINUTES_PER_DAY;
  st.time = t;
}

function mod(sim: Simulation, type: string): ModuleInstance {
  const m = sim.state.ship.modules.find((mm) => mm.type === type);
  if (!m) throw new Error(`no hay ${type}`);
  return m;
}

function addModule(sim: Simulation, type: string, level: number, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): ModuleInstance {
  const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
  sim.state.ship.modules.push(m);
  sim.shipChanged();
  return m;
}

/** Coloca al jugador delante del mueble de una cama. */
function nearBed(sim: Simulation, moduleId: number, bed: number): void {
  const b = actions.bedProp(sim, moduleId, bed)!;
  const f = forwardOf(b.prop.yaw);
  const reach = Math.abs(f.x) * b.prop.hx + Math.abs(f.z) * b.prop.hz + 0.5;
  place(sim, { x: b.prop.x + f.x * reach, y: b.prop.y, z: b.prop.z + f.z * reach });
}

/** Ranura del jugador con un objeto (añadiéndolo si hace falta). */
function slotWith(sim: Simulation, id: string, qty = 1): number {
  const inv = sim.state.player.inventory;
  if (countItem(inv, id) < qty) addItem(inv, id, qty);
  return inv.slots.findIndex((s) => s?.id === id);
}

/** Fuerza el resultado de las tiradas de probabilidad. */
function forceChance(sim: Simulation, value: boolean): void {
  sim.rng.chance = () => value;
}

/** localStorage falso en memoria (opcionalmente con un límite de tamaño). */
class FakeStorage implements StorageLike {
  private data = new Map<string, string>();
  constructor(private readonly limit = Infinity) {}
  get length(): number {
    return this.data.size;
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    let size = 0;
    for (const [kk, vv] of this.data) if (kk !== k) size += kk.length + vv.length;
    if (size + k.length + v.length > this.limit) {
      const e = new Error('Quota exceeded');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}

/* ------------------------------------------------------------------ */
/* Necesidades                                                         */
/* ------------------------------------------------------------------ */

describe('necesidades: decaimiento', () => {
  it('hambre, sed y energía bajan a su ritmo despierto', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setNeeds(sim, { hunger: 80, thirst: 75, energy: 90, health: 100, warmth: 80 });
    runNeeds(sim, 240);
    const n = sim.state.player.needs;
    expect(n.hunger).toBeCloseTo(80 + NEED_RATES.hungerPerHour * 4, 5);
    expect(n.thirst).toBeCloseTo(75 + NEED_RATES.thirstPerHour * 4, 5);
    expect(n.energy).toBeCloseTo(90 + NEED_RATES.energyPerHourAwake * 4, 5);
  });

  it('durmiendo en cama: hambre y sed a la mitad, energía +15/h', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setNeeds(sim, { hunger: 80, thirst: 80, energy: 30, health: 100, warmth: 80 });
    goToHour(sim, 22);
    const cam = mod(sim, 'camarote');
    expect(sim.sleep(cam.id, 0).ok).toBe(true);
    runNeeds(sim, 120);
    const n = sim.state.player.needs;
    expect(n.hunger).toBeCloseTo(80 + NEED_RATES.hungerPerHour, 5);
    expect(n.thirst).toBeCloseTo(80 + NEED_RATES.thirstPerHour, 5);
    expect(n.energy).toBeCloseTo(30 + NEED_RATES.energyPerHourBed * 2, 5);
  });

  it('los valores nunca salen de 0..100 ni se vuelven NaN', () => {
    const { sim } = setup();
    setNeeds(sim, { hunger: Number.NaN, thirst: 200, energy: -50, warmth: 50 });
    runNeeds(sim, 10);
    for (const v of Object.values(sim.state.player.needs)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe('calor corporal', () => {
  it('interior +12 °C y exterior con lluvia y viento según la fórmula', () => {
    const { sim } = setup();
    setWeather(sim, 'lluvia', 10, 0.5, 0.5);
    place(sim, INDOOR);
    let env = needs.warmthEnvironment(sim);
    expect(env.indoor).toBe(true);
    expect(env.effectiveTemp).toBeCloseTo(22, 6);
    expect(env.target).toBeCloseTo(22 * 3.2 + 10, 6);
    place(sim, DECK);
    env = needs.warmthEnvironment(sim);
    expect(env.indoor).toBe(false);
    expect(env.effectiveTemp).toBeCloseTo(10 - 6 * 0.5 - 4 * 0.5, 6);
    // La bodega cuenta como interior.
    place(sim, HOLD);
    expect(needs.warmthEnvironment(sim).indoor).toBe(true);
  });

  it('el abrigo solo abriga a la intemperie (+12 °C con protección 0,6)', () => {
    const { sim } = setup();
    setWeather(sim, 'despejado', 0, 0, 0);
    sim.state.player.clothing = 'abrigo';
    place(sim, DECK);
    expect(needs.warmthEnvironment(sim).effectiveTemp).toBeCloseTo(12, 6);
    place(sim, INDOOR);
    expect(needs.warmthEnvironment(sim).effectiveTemp).toBeCloseTo(12, 6); // interior +12, sin abrigo
  });

  it('la cocina encendida da +10 °C a ≤ 4 m', () => {
    const { sim } = setup();
    setWeather(sim, 'despejado', 5, 0, 0);
    const fogon = sim.layout.props.find((p) => p.kind === 'fogon')!;
    const cocina = mod(sim, 'cocina');
    place(sim, { x: fogon.x, y: fogon.y, z: fogon.z - 1.5 });
    cocina.powered = false;
    expect(needs.warmthEnvironment(sim).nearStove).toBe(false);
    cocina.powered = true;
    const env = needs.warmthEnvironment(sim);
    expect(env.nearStove).toBe(true);
    expect(env.effectiveTemp).toBeCloseTo(5 + 12 + 10, 6);
    // Lejos (en cubierta) ya no calienta.
    place(sim, DECK);
    expect(needs.warmthEnvironment(sim).nearStove).toBe(false);
  });

  it('el calor tiende al objetivo a 30/h', () => {
    const { sim } = setup();
    setWeather(sim, 'despejado', 0, 0, 0);
    place(sim, DECK); // objetivo 10
    setNeeds(sim, { warmth: 70, hunger: 100, thirst: 100, energy: 100 });
    runNeeds(sim, 60);
    expect(sim.state.player.needs.warmth).toBeCloseTo(40, 5);
    runNeeds(sim, 120);
    expect(sim.state.player.needs.warmth).toBeCloseTo(10, 5);
  });

  it('el frío hace daño fuera y no dentro; el abrigo lo evita', () => {
    const outside = setup().sim;
    setWeather(outside, 'despejado', -2, 0, 0);
    place(outside, DECK);
    setNeeds(outside, { warmth: 10, hunger: 100, thirst: 100, energy: 100, health: 80 });
    runNeeds(outside, 120);
    expect(outside.state.player.needs.health).toBeLessThan(75);

    const inside = setup().sim;
    setWeather(inside, 'despejado', -2, 0, 0);
    place(inside, INDOOR); // tEf 10 → objetivo 42
    setNeeds(inside, { warmth: 10, hunger: 100, thirst: 100, energy: 100, health: 80 });
    runNeeds(inside, 120);
    expect(inside.state.player.needs.warmth).toBeCloseTo(42 - 0.4, 0);
    expect(inside.state.player.needs.health).toBeGreaterThan(inside.state.player.needs.health - 1);

    const coat = setup().sim;
    setWeather(coat, 'despejado', -2, 0, 0);
    coat.state.player.clothing = 'abrigo';
    place(coat, DECK);
    setNeeds(coat, { warmth: 10, hunger: 100, thirst: 100, energy: 100, health: 80 });
    runNeeds(coat, 120);
    expect(coat.state.player.needs.health).toBeGreaterThan(outside.state.player.needs.health);
  });
});

describe('salud', () => {
  it('regenera +2,5/h si todo está bien', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 90, health: 50 });
    runNeeds(sim, 120);
    expect(sim.state.player.needs.health).toBeCloseTo(55, 5);
  });

  it('×3 en una camilla de enfermería con energía, que además acelera la curación', () => {
    const { sim } = setup();
    place(sim, HOLD);
    setWeather(sim, 'despejado', 22);
    const enf = addModule(sim, 'enfermeria', 0, 1, 0, 2);
    enf.on = true;
    enf.powered = true;
    nearBed(sim, enf.id, 0);
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 90, health: 20 });
    goToHour(sim, 22);
    const r = sim.sleep(enf.id, 0);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toBe('Te tumbas en una camilla de la enfermería…');
    expect(needs.sleepSpot(sim)?.kind).toBe('infirmary');
    runNeeds(sim, 60);
    expect(sim.state.player.needs.health).toBeCloseTo(20 + NEED_RATES.healthRegenPerHour * 3, 5);
    // La enfermedad se cura el doble de rápido en la camilla.
    setNeeds(sim, { hunger: 100, thirst: 100, health: 80 });
    sim.state.player.sick = 10;
    runNeeds(sim, 60);
    expect(sim.state.player.sick).toBeCloseTo(10 - needs.INFIRMARY_SICK_MULT, 5);
  });

  it('sin energía (o apagada, averiada o ardiendo) la camilla cura como una cama normal', () => {
    const variants: [string, (m: ModuleInstance) => void][] = [
      ['sin energía', (m) => ((m.on = true), (m.powered = false))],
      ['apagada', (m) => ((m.on = false), (m.powered = true))],
      ['averiada', (m) => ((m.on = true), (m.powered = true), (m.status = 'broken'))],
    ];
    for (const [name, apply] of variants) {
      const { sim } = setup();
      place(sim, HOLD);
      setWeather(sim, 'despejado', 22);
      const enf = addModule(sim, 'enfermeria', 0, 1, 0, 2);
      nearBed(sim, enf.id, 0);
      setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 90, health: 20 });
      goToHour(sim, 22);
      enf.on = true;
      enf.powered = true;
      expect(sim.sleep(enf.id, 0).ok, name).toBe(true);
      apply(enf);
      expect(needs.sleepSpot(sim)?.kind, name).toBe('bed');
      expect(needs.healthRatePerHour(sim), name).toBeCloseTo(NEED_RATES.healthRegenPerHour, 5);
      sim.state.player.sick = 10;
      setNeeds(sim, { health: 50 });
      runNeeds(sim, 60);
      expect(sim.state.player.sick, name).toBeCloseTo(9, 5);
    }
  });

  it('integración: una enfermería sin ninguna fuente de energía no cura ×3 y lo dice al tumbarse', () => {
    const { sim } = setup(4);
    sim.state.npcs = [];
    sim.state.events.nextRollAt = 1e12;
    const enf = addModule(sim, 'enfermeria', 0, 1, 0, 2);
    sim.tick(1);
    expect(enf.powered).toBe(false);
    nearBed(sim, enf.id, 0);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 50, health: 60, warmth: 80 });
    const r = sim.sleep(enf.id, 0);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toMatch(/Sin energía, cura como una cama normal/);
    sim.tick(1);
    expect(needs.healthRatePerHour(sim)).toBeCloseTo(NEED_RATES.healthRegenPerHour, 5);
  });

  it('pierde salud con hambre o sed a 0 y no regenera', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    setNeeds(sim, { hunger: 0, thirst: 100, energy: 100, warmth: 90, health: 90 });
    runNeeds(sim, 60, () => setNeeds(sim, { hunger: 0 }));
    expect(sim.state.player.needs.health).toBeCloseTo(90 - NEED_RATES.starvingDamagePerHour, 5);
    setNeeds(sim, { hunger: 100, thirst: 0, health: 90 });
    runNeeds(sim, 60, () => setNeeds(sim, { thirst: 0 }));
    expect(sim.state.player.needs.health).toBeCloseTo(90 - NEED_RATES.dehydrationDamagePerHour, 5);
  });

  it('el fuego a < 1,5 m quema (−10/h)', () => {
    const { sim } = setup();
    setWeather(sim, 'despejado', 22);
    const cocina = mod(sim, 'cocina');
    const fogon = sim.layout.props.find((p) => p.kind === 'fogon')!;
    place(sim, { x: fogon.x, y: fogon.y, z: fogon.z - 1.5 });
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 90, health: 90 });
    cocina.fire = 50;
    expect(needs.fireNear(sim, sim.state.player.pos)?.id).toBe(cocina.id);
    runNeeds(sim, 60);
    expect(sim.state.player.needs.health).toBeCloseTo(80, 5);
    place(sim, DECK);
    expect(needs.fireNear(sim, sim.state.player.pos)).toBeNull();
  });
});

describe('enfermedad', () => {
  it('la comida cruda puede enfermar; la enfermedad dura 18 h y resta salud', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    setNeeds(sim, { hunger: 50, thirst: 100, energy: 100, warmth: 90, health: 100 });
    forceChance(sim, true);
    const r = sim.useItem(slotWith(sim, 'pescado_crudo'));
    expect(r.ok).toBe(true);
    expect(r.msg).toMatch(/enfermo/);
    expect(sim.state.player.sick).toBe(needs.SICK_HOURS);
    runNeeds(sim, 60, () => setNeeds(sim, { hunger: 100, thirst: 100, energy: 100 }));
    expect(sim.state.player.needs.health).toBeCloseTo(100 - NEED_RATES.sickDamagePerHour, 5);
    runNeeds(sim, 17 * 60 + 1, () => setNeeds(sim, { hunger: 100, thirst: 100, energy: 100 }));
    expect(sim.state.player.sick).toBe(0);
    expect(notes.some((n) => /recuperado/.test(n.text))).toBe(true);
  });

  it('sin mala suerte la comida cruda no enferma', () => {
    const { sim } = setup();
    setNeeds(sim, { hunger: 50 });
    forceChance(sim, false);
    sim.useItem(slotWith(sim, 'pescado_crudo'));
    expect(sim.state.player.sick).toBe(0);
  });

  it('el botiquín cura la enfermedad', () => {
    const { sim } = setup();
    sim.state.player.sick = 10;
    setNeeds(sim, { health: 50 });
    const r = sim.useItem(slotWith(sim, 'botiquin'));
    expect(r.ok, r.msg).toBe(true);
    expect(sim.state.player.sick).toBe(0);
    expect(sim.state.player.needs.health).toBe(90);
  });
});

describe('muerte', () => {
  it('muere de sed con causa, aviso, diario y la simulación se detiene', () => {
    const { sim } = setup();
    let died: string | null = null;
    sim.bus.on('playerDied', (d) => (died = d.cause));
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    setNeeds(sim, { hunger: 100, thirst: 0, energy: 100, warmth: 90, health: 5 });
    runNeeds(sim, 120);
    const p = sim.state.player;
    expect(p.alive).toBe(false);
    expect(p.deathCause).toBe(needs.DEATH_CAUSES.thirst);
    expect(died).toBe(needs.DEATH_CAUSES.thirst);
    expect(sim.state.log.at(-1)!.text).toMatch(/Moriste de sed/);
    expect(p.needs.health).toBe(0);
    const t = sim.state.time;
    sim.tick(30);
    expect(sim.state.time).toBe(t);
  });

  it('muere de frío y la causa es la peor fuente de daño', () => {
    const { sim } = setup();
    setWeather(sim, 'tormenta', -10, 1, 1);
    place(sim, DECK);
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 0, health: 3 });
    runNeeds(sim, 240);
    expect(sim.state.player.alive).toBe(false);
    expect(sim.state.player.deathCause).toBe(needs.DEATH_CAUSES.cold);
  });

  it('damagePlayer de otros sistemas mata con su causa', () => {
    const { sim } = setup();
    setNeeds(sim, { health: 10 });
    needs.damagePlayer(sim, 4, 'Moriste aplastado');
    expect(sim.state.player.needs.health).toBe(6);
    needs.damagePlayer(sim, 10, 'Moriste aplastado');
    expect(sim.state.player.alive).toBe(false);
    expect(sim.state.player.deathCause).toBe('Moriste aplastado');
  });
});

describe('condiciones para el HUD', () => {
  it('resume peligros y ventajas del entorno', () => {
    const { sim } = setup();
    setWeather(sim, 'lluvia', 4, 0.8, 0.5);
    place(sim, DECK);
    setNeeds(sim, { hunger: 20, thirst: 0, energy: 10, warmth: 15, health: 60 });
    sim.state.player.sick = 5.2;
    const ids = needs.playerConditions(sim).map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['deshidratado', 'hambriento', 'congelado', 'enfermo', 'agotado', 'mojado']));
    expect(needs.playerConditions(sim).find((c) => c.id === 'enfermo')!.label).toBe('Enfermo (6 h)');
    place(sim, INDOOR);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 90, warmth: 80, health: 60 });
    sim.state.player.sick = 0;
    const inside = needs.playerConditions(sim).map((c) => c.id);
    expect(inside).toEqual(['cubierto', 'recuperando']);
  });
});

describe('avisos con histéresis', () => {
  it('avisa una vez al cruzar el umbral y se rearma al recuperarse', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    setNeeds(sim, { hunger: 26, thirst: 100, energy: 100, warmth: 90, health: 100 });
    runNeeds(sim, 60, () => setNeeds(sim, { thirst: 100, energy: 100 })); // cruza 25
    const hungry = () => notes.filter((n) => n.text.startsWith('Tienes hambre')).length;
    expect(hungry()).toBe(1);
    runNeeds(sim, 30, () => setNeeds(sim, { thirst: 100, energy: 100 }));
    expect(hungry()).toBe(1);
    setNeeds(sim, { hunger: 28 }); // no se rearma (umbral + 5 = 30)
    runNeeds(sim, 60, () => setNeeds(sim, { thirst: 100, energy: 100 }));
    expect(hungry()).toBe(1);
    setNeeds(sim, { hunger: 40 }); // se rearma
    runNeeds(sim, 0.5);
    setNeeds(sim, { hunger: 24 });
    runNeeds(sim, 0.5);
    expect(hungry()).toBe(2);
  });

  it('no avisa durmiendo; los avisos pendientes saltan al despertar', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { hunger: 30, thirst: 90, energy: 40, warmth: 90, health: 100 });
    expect(sim.sleep(mod(sim, 'camarote').id, 0).ok).toBe(true);
    runNeeds(sim, 180); // el hambre baja de 25 durmiendo
    expect(sim.state.player.needs.hunger).toBeLessThan(25);
    expect(notes.some((n) => n.text.startsWith('Tienes hambre'))).toBe(false);
    sim.wake();
    runNeeds(sim, 0.5);
    expect(notes.filter((n) => n.text.startsWith('Tienes hambre'))).toHaveLength(1);
  });

  it('avisa de sed, cansancio, frío y salud', () => {
    const { sim, notes } = setup();
    setWeather(sim, 'despejado', 0);
    place(sim, DECK);
    setNeeds(sim, { hunger: 100, thirst: 9, energy: 19, warmth: 29, health: 29 });
    runNeeds(sim, 0.5);
    const texts = notes.map((n) => n.text).join(' | ');
    expect(texts).toMatch(/Tienes sed/);
    expect(texts).toMatch(/deshidratando/);
    expect(texts).toMatch(/agotado/);
    expect(texts).toMatch(/frío/);
    expect(texts).toMatch(/salud es crítica/);
  });
});

/* ------------------------------------------------------------------ */
/* Sueño                                                               */
/* ------------------------------------------------------------------ */

describe('sueño', () => {
  it('solo se duerme con energía < 80 o de noche', () => {
    const { sim } = setup();
    const cam = mod(sim, 'camarote');
    nearBed(sim, cam.id, 0);
    goToHour(sim, 12);
    setNeeds(sim, { energy: 90 });
    const r = sim.sleep(cam.id, 0);
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/No tienes sueño/);
    setNeeds(sim, { energy: 70 });
    expect(sim.sleep(cam.id, 0).ok).toBe(true);
    expect(sim.state.player.sleeping).toEqual({ moduleId: cam.id, bed: 0, until: null });
    expect(sim.timeScale).toBe(SLEEP_TIME_SCALE);
    expect(sim.state.tutorial.done).toContain('dormir');
    sim.wake(); // se levanta el jugador: sin aviso
    expect(sim.state.player.sleeping).toBeNull();
    expect(sim.timeScale).toBe(1);
    goToHour(sim, 22);
    setNeeds(sim, { energy: 100 });
    expect(sim.sleep(cam.id, 0).ok).toBe(true);
  });

  it('respeta las camas de los habitantes presentes', () => {
    const { sim } = setup();
    const dorm = mod(sim, 'dormitorio');
    goToHour(sim, 23);
    nearBed(sim, dorm.id, 0);
    const r = sim.sleep(dorm.id, 0);
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('Esa cama es de Marina');
    // Una cama libre del dormitorio sí sirve.
    nearBed(sim, dorm.id, 2);
    expect(sim.sleep(dorm.id, 2).ok).toBe(true);
    sim.wake();
    // Si Marina está de expedición, puede usar su cama.
    sim.state.npcs[0]!.awayUntil = sim.state.time + 100;
    nearBed(sim, dorm.id, 0);
    expect(sim.sleep(dorm.id, 0).ok).toBe(true);
  });

  it('rechaza camas lejanas, inexistentes, obras, fuego a bordo y necesidades críticas', () => {
    const { sim } = setup();
    const cam = mod(sim, 'camarote');
    goToHour(sim, 23);
    place(sim, DECK);
    expect(sim.sleep(cam.id, 0).msg).toBe('Acércate a la cama');
    nearBed(sim, cam.id, 0);
    expect(sim.sleep(999, 0).ok).toBe(false);
    expect(sim.sleep(cam.id, 5).ok).toBe(false);
    expect(sim.sleep(mod(sim, 'almacen').id, 0).msg).toBe('Aquí no hay camas');
    cam.status = 'construction';
    expect(sim.sleep(cam.id, 0).ok).toBe(false);
    cam.status = 'active';
    mod(sim, 'cocina').fire = 20;
    expect(sim.sleep(cam.id, 0).msg).toMatch(/fuego/);
    mod(sim, 'cocina').fire = 0;
    setNeeds(sim, { thirst: 5 });
    expect(sim.sleep(cam.id, 0).msg).toMatch(/sed/);
  });

  it('duerme toda la noche y despierta descansado de día', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 22);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 40, warmth: 90, health: 100 });
    expect(sim.sleep(mod(sim, 'camarote').id, 0).ok).toBe(true);
    let wokeAt = -1;
    let energyAtWake = -1;
    runNeeds(sim, 12 * 60, () => {
      if (wokeAt < 0 && !sim.state.player.sleeping) {
        wokeAt = sim.state.time;
        energyAtWake = sim.state.player.needs.energy;
      }
    });
    expect(wokeAt).toBeGreaterThan(0);
    const h = hourOf(wokeAt);
    expect(h).toBeGreaterThanOrEqual(6);
    expect(h).toBeLessThan(6.1);
    expect(notes.some((n) => n.text === 'Te despiertas descansado')).toBe(true);
    expect(energyAtWake).toBe(100);
  });

  it('se despierta antes si no está a gusto: sed, hambre, fuego, tormenta o un evento', () => {
    const cases: [string, (sim: Simulation) => void, RegExp][] = [
      ['sed', (sim) => setNeeds(sim, { thirst: 7.9 }), /sed/],
      ['hambre', (sim) => setNeeds(sim, { hunger: 7.9 }), /hambre/],
      ['fuego', (sim) => (mod(sim, 'almacen').fire = 10), /Fuego a bordo/],
      ['tormenta', (sim) => (sim.state.weather.kind = 'tormenta'), /tormenta/],
      [
        'evento que lo pide',
        (sim) =>
          sim.state.events.active.push({ id: 900, type: 'naufragos', title: 'Náufragos a la deriva', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: { wakePlayer: true } }),
        /Te despiertan: Náufragos a la deriva/,
      ],
      ['un golpe', (sim) => needs.damagePlayer(sim, 5, 'Un golpe de mar te arrojó por la borda'), /algo te ha herido/],
    ];
    for (const [name, trigger, re] of cases) {
      const { sim, notes } = setup();
      place(sim, INDOOR);
      setWeather(sim, 'despejado', 22);
      goToHour(sim, 23);
      setNeeds(sim, { hunger: 90, thirst: 90, energy: 40, warmth: 90, health: 100 });
      expect(sim.sleep(mod(sim, 'camarote').id, 0).ok, name).toBe(true);
      runNeeds(sim, 10);
      expect(sim.state.player.sleeping, name).not.toBeNull();
      trigger(sim);
      runNeeds(sim, 0.5);
      expect(sim.state.player.sleeping, name).toBeNull();
      expect(notes.some((n) => re.test(n.text)), name).toBe(true);
    }
  });

  it('avistamientos, averías y fugas no despiertan: se resumen al despertar («Mientras dormías: …»)', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 40, warmth: 90, health: 100 });
    const cam = mod(sim, 'camarote');
    expect(sim.sleep(cam.id, 0).ok).toBe(true);
    runNeeds(sim, 5);
    const ev = (id: number, type: string, title: string, data: Record<string, unknown> = {}) => ({ id, type, title, description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data });
    const almacen = mod(sim, 'almacen');
    sim.state.events.active.push(ev(910, 'naufragio', 'Naufragio a la vista'), ev(911, 'averia', 'Avería: Almacén', { moduleId: almacen.id }), ev(912, 'fuga', 'Fuga en el depósito'));
    // Un naufragio sin bandera tampoco despierta aunque los eventos antiguos lo hicieran.
    sim.state.events.active.push(ev(913, 'naufragos', 'Náufragos a la deriva'));
    runNeeds(sim, 30);
    expect(sim.state.player.sleeping).not.toBeNull();
    // La fuga se resuelve antes de despertar; la balsa pasa de largo.
    sim.state.events.active = sim.state.events.active.filter((e) => e.id !== 912 && e.id !== 913);
    sim.state.events.history.push({ type: 'fuga', title: 'Fuga en el depósito', at: sim.state.time, success: true });
    sim.state.events.history.push({ type: 'naufragos', title: 'Náufragos a la deriva', at: sim.state.time, success: false });
    runNeeds(sim, 1);
    expect(sim.state.player.sleeping).not.toBeNull();
    expect(notes.some((n) => /Mientras dormías/.test(n.text))).toBe(false);
    const before = notes.length;
    runNeeds(sim, 10 * 60);
    expect(sim.state.player.sleeping).toBeNull();
    expect(hourOf(sim.state.time)).toBeGreaterThanOrEqual(6);
    const after = notes.slice(before);
    expect(after.some((n) => n.text === 'Te despiertas descansado')).toBe(true);
    const sum = after.find((n) => /^Mientras dormías: /.test(n.text));
    expect(sum, JSON.stringify(after)).toBeDefined();
    expect(sum!.text).toBe(
      'Mientras dormías: se avistó un naufragio, hubo una avería en el almacén, se abrió una fuga en el depósito (ya se resolvió) y apareció una balsa con náufragos (ya se perdió de vista). Los detalles están en el diario (J)',
    );
    expect(sum!.kind).toBe('warn');
    // El resumen sale una sola vez.
    runNeeds(sim, 5);
    expect(notes.filter((n) => /^Mientras dormías/.test(n.text))).toHaveLength(1);
  });

  it('el resumen de la noche sale también si le despierta otro sistema, e incluye el cambio de región', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 40, warmth: 90, health: 100 });
    expect(sim.sleep(mod(sim, 'camarote').id, 0).ok).toBe(true);
    runNeeds(sim, 5);
    sim.state.voyage.regionId = 'sargazos';
    sim.state.events.active.push({ id: 920, type: 'enfermedad', title: 'Tomás ha enfermado', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: { name: 'Tomás', wakePlayer: false } });
    // Un banco de peces que ya se fue no merece mención.
    sim.state.events.active.push({ id: 921, type: 'banco_peces', title: 'Banco de peces', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: {} });
    runNeeds(sim, 5);
    sim.state.events.active = sim.state.events.active.filter((e) => e.id !== 921);
    runNeeds(sim, 1);
    expect(sim.state.player.sleeping).not.toBeNull();
    sim.wake('Te sacuden para despertarte');
    const sum = notes.find((n) => /^Mientras dormías/.test(n.text));
    expect(sum?.text).toBe('Mientras dormías: Tomás enfermó y entramos en el Mar de los Sargazos. Los detalles están en el diario (J)');
    // Una noche sin nada que contar no deja resumen.
    const { sim: sim2, notes: notes2 } = setup();
    place(sim2, INDOOR);
    setWeather(sim2, 'despejado', 22);
    goToHour(sim2, 23);
    setNeeds(sim2, { hunger: 90, thirst: 90, energy: 40, warmth: 90, health: 100 });
    sim2.sleep(mod(sim2, 'camarote').id, 0);
    runNeeds(sim2, 10 * 60);
    expect(sim2.state.player.sleeping).toBeNull();
    expect(notes2.some((n) => /Mientras dormías/.test(n.text))).toBe(false);
  });

  it('un evento puede impedir que le despierten (data.wakePlayer = false) salvo que haya fuego de verdad', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { energy: 40 });
    sim.sleep(mod(sim, 'camarote').id, 0);
    runNeeds(sim, 1);
    expect(needs.wakesPlayer({ type: 'incendio', data: {} })).toBe(true);
    expect(needs.wakesPlayer({ type: 'tormenta' })).toBe(true);
    expect(needs.wakesPlayer({ type: 'averia', data: {} })).toBe(false);
    expect(needs.wakesPlayer({ type: 'averia', data: { wakePlayer: true } })).toBe(true);
    expect(needs.wakesPlayer({ type: 'incendio', data: { wakePlayer: false } })).toBe(false);
    sim.state.events.active.push({ id: 930, type: 'incendio', title: '¡Incendio a bordo!', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: { wakePlayer: false } });
    runNeeds(sim, 1);
    expect(sim.state.player.sleeping).not.toBeNull();
    mod(sim, 'cocina').fire = 5;
    runNeeds(sim, 0.5);
    expect(sim.state.player.sleeping).toBeNull();
  });

  it('al despertar, el hambre y la sed van en el mismo aviso y no se repiten aparte', () => {
    const { sim, notes } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { hunger: 30, thirst: 40, energy: 40, warmth: 90, health: 100 });
    sim.sleep(mod(sim, 'camarote').id, 0);
    runNeeds(sim, 10 * 60);
    expect(sim.state.player.sleeping).toBeNull();
    const n = sim.state.player.needs;
    expect(n.hunger).toBeLessThan(25);
    expect(n.thirst).toBeLessThan(25);
    expect(notes.some((x) => x.text === 'Te despiertas descansado. Tienes hambre y sed: come y bebe algo')).toBe(true);
    runNeeds(sim, 5);
    expect(notes.some((x) => /^Tienes (hambre|sed)/.test(x.text))).toBe(false);
  });

  it('un evento sin importancia (banco de peces) no despierta', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 23);
    setNeeds(sim, { energy: 40 });
    sim.sleep(mod(sim, 'camarote').id, 0);
    runNeeds(sim, 1);
    sim.state.events.active.push({ id: 901, type: 'banco_peces', title: 'Banco de peces', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [], data: {} });
    runNeeds(sim, 1);
    expect(sim.state.player.sleeping).not.toBeNull();
  });

  it('con energía a 0 se desmaya 3 h en el suelo', () => {
    const { sim, notes } = setup();
    place(sim, DECK);
    setWeather(sim, 'despejado', 22);
    goToHour(sim, 12);
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 0.01, warmth: 90, health: 100 });
    runNeeds(sim, 0.5);
    const s = sim.state.player.sleeping;
    expect(s).not.toBeNull();
    expect(s!.moduleId).toBeNull();
    expect(s!.until).toBeCloseTo(sim.state.time + needs.FAINT_MINUTES, 5);
    expect(notes.some((n) => /desmayas/.test(n.text) && n.kind === 'danger')).toBe(true);
    runNeeds(sim, needs.FAINT_MINUTES - 1);
    expect(sim.state.player.sleeping).not.toBeNull();
    runNeeds(sim, 1.5);
    expect(sim.state.player.sleeping).toBeNull();
    expect(sim.state.player.needs.energy).toBeCloseTo((NEED_RATES.energyPerHourFloor * needs.FAINT_MINUTES) / 60, 0);
    expect(notes.some((n) => /Recuperas el conocimiento/.test(n.text))).toBe(true);
  });

  it('desmayado no puede levantarse a voluntad, pero un sistema sí puede despertarle', () => {
    const { sim, notes } = setup();
    goToHour(sim, 12);
    setNeeds(sim, { energy: 0.01 });
    runNeeds(sim, 0.5);
    expect(sim.state.player.sleeping?.until).not.toBeNull();
    sim.wake();
    expect(sim.state.player.sleeping).not.toBeNull();
    sim.wake('Te sacuden para despertarte');
    expect(sim.state.player.sleeping).toBeNull();
    expect(notes.at(-1)).toEqual({ text: 'Te sacuden para despertarte', kind: 'warn' });
  });

  it('localiza el mueble de cada cama (literas con cama de arriba)', () => {
    const { sim } = setup();
    const dorm = mod(sim, 'dormitorio');
    const b0 = actions.bedProp(sim, dorm.id, 0)!;
    const b1 = actions.bedProp(sim, dorm.id, 1)!;
    const b3 = actions.bedProp(sim, dorm.id, 3)!;
    expect(b0.prop.kind).toBe('litera');
    expect(b0.upper).toBe(false);
    expect(b1.prop).toBe(b0.prop);
    expect(b1.upper).toBe(true);
    expect(b3.prop).not.toBe(b0.prop);
    expect(b3.upper).toBe(true);
    const cam = actions.bedProp(sim, mod(sim, 'camarote').id, 0)!;
    expect(cam.prop.kind).toBe('cama');
    expect(cam.upper).toBe(false);
    expect(actions.bedProp(sim, mod(sim, 'almacen').id, 0)).toBeNull();
  });

  it('integración: sim.tick a ×14 durante la noche', () => {
    const { sim } = setup(11);
    sim.state.npcs = [];
    sim.state.events.nextRollAt = 1e12;
    place(sim, INDOOR);
    goToHour(sim, 22);
    setNeeds(sim, { hunger: 95, thirst: 95, energy: 30, warmth: 90, health: 100 });
    expect(sim.sleep(mod(sim, 'camarote').id, 0).ok).toBe(true);
    const t0 = sim.state.time;
    // 40 s reales a ×14 = 560 min de juego.
    for (let i = 0; i < 40 * 60 && sim.state.player.sleeping; i++) sim.tick((1 / 60) * sim.timeScale);
    expect(sim.state.player.alive).toBe(true);
    expect(sim.state.time - t0).toBeGreaterThan(400);
    expect(sim.state.player.needs.energy).toBeGreaterThan(90);
  });
});

/* ------------------------------------------------------------------ */
/* Objetos                                                             */
/* ------------------------------------------------------------------ */

describe('usar objetos', () => {
  it('comer: aplica efectos, gasta una unidad y marca el tutorial', () => {
    const { sim } = setup();
    setNeeds(sim, { hunger: 40 });
    const slot = slotWith(sim, 'conserva');
    const before = countItem(sim.state.player.inventory, 'conserva');
    const r = sim.useItem(slot);
    expect(r).toEqual({ ok: true, msg: 'Comes una lata de conserva' });
    expect(sim.state.player.needs.hunger).toBe(75);
    expect(countItem(sim.state.player.inventory, 'conserva')).toBe(before - 1);
    expect(sim.state.tutorial.done).toContain('comer');
  });

  it('beber, sopa (calor) y guiso (energía) limitados a 100', () => {
    const { sim } = setup();
    setNeeds(sim, { thirst: 80, warmth: 50, hunger: 50, energy: 50 });
    expect(sim.useItem(slotWith(sim, 'agua_potable')).msg).toBe('Bebes una botella de agua');
    expect(sim.state.player.needs.thirst).toBe(100);
    sim.useItem(slotWith(sim, 'sopa'));
    expect(sim.state.player.needs.warmth).toBe(65);
    sim.useItem(slotWith(sim, 'guiso'));
    expect(sim.state.player.needs.energy).toBe(56);
    expect(sim.state.player.needs.hunger).toBe(100);
  });

  it('no desperdicia comida si no hace falta', () => {
    const { sim } = setup();
    setNeeds(sim, { hunger: 100, thirst: 100 });
    const slot = slotWith(sim, 'conserva');
    const n = countItem(sim.state.player.inventory, 'conserva');
    expect(sim.useItem(slot)).toEqual({ ok: false, msg: 'No tienes hambre' });
    expect(sim.useItem(slotWith(sim, 'agua_potable'))).toEqual({ ok: false, msg: 'No tienes sed' });
    expect(countItem(sim.state.player.inventory, 'conserva')).toBe(n);
    setNeeds(sim, { health: 100 });
    expect(sim.useItem(slotWith(sim, 'botiquin')).ok).toBe(false);
  });

  it('el agua de mar deja el cubo vacío en la misma ranura, da sed y puede enfermar', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    const cubo = inv.slots.findIndex((s) => s?.id === 'cubo');
    inv.slots[cubo] = { id: 'cubo_agua', qty: 1 };
    setNeeds(sim, { thirst: 50, health: 100 });
    forceChance(sim, true);
    const r = sim.useItem(cubo);
    expect(r.ok).toBe(true);
    expect(inv.slots[cubo]).toEqual({ id: 'cubo', qty: 1 });
    expect(sim.state.player.needs.thirst).toBe(42);
    expect(sim.state.player.needs.health).toBe(94);
    expect(sim.state.player.sick).toBe(needs.SICK_HOURS);
  });

  it('los planos desbloquean, se consumen y avisan', () => {
    const { sim } = setup();
    const unlocked: string[] = [];
    sim.bus.on('unlocked', (u) => unlocked.push(`${u.key}:${u.name}`));
    const slot = slotWith(sim, 'plano_taller');
    const r = sim.useItem(slot);
    expect(r.ok).toBe(true);
    expect(sim.state.unlocks).toContain('taller');
    expect(unlocked).toEqual(['taller:Taller mecánico']);
    expect(countItem(sim.state.player.inventory, 'plano_taller')).toBe(0);
    expect(sim.state.log.at(-1)!.text).toMatch(/Plano aprendido: Taller mecánico/);
    // Una segunda copia no se gasta.
    const again = slotWith(sim, 'plano_taller');
    expect(sim.useItem(again).ok).toBe(false);
    expect(countItem(sim.state.player.inventory, 'plano_taller')).toBe(1);
  });

  it('la ropa se equipa, se intercambia y se quita', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    const slot = slotWith(sim, 'abrigo');
    expect(sim.useItem(slot).msg).toBe('Te pones el abrigo de lona');
    expect(sim.state.player.clothing).toBe('abrigo');
    expect(inv.slots[slot]).toBeNull();
    // Intercambio: la prenda anterior vuelve a la ranura.
    inv.slots[slot] = { id: 'abrigo', qty: 1 };
    expect(sim.useItem(slot).ok).toBe(true);
    expect(inv.slots[slot]).toEqual({ id: 'abrigo', qty: 1 });
    expect(sim.state.player.clothing).toBe('abrigo');
    // Quitársela.
    const n = countItem(inv, 'abrigo');
    expect(sim.unequipClothing().ok).toBe(true);
    expect(sim.state.player.clothing).toBeNull();
    expect(countItem(inv, 'abrigo')).toBe(n + 1);
    expect(sim.unequipClothing().ok).toBe(false);
  });

  it('no se quita la ropa si no cabe en el inventario', () => {
    const { sim } = setup();
    sim.state.player.clothing = 'abrigo';
    const inv = sim.state.player.inventory;
    for (let i = 0; i < inv.slots.length; i++) inv.slots[i] = { id: 'madera', qty: 50 };
    expect(sim.unequipClothing().ok).toBe(false);
    expect(sim.state.player.clothing).toBe('abrigo');
  });

  it('las herramientas no se consumen: se seleccionan en la barra rápida', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    const gancho = inv.slots.findIndex((s) => s?.id === 'martillo');
    const r = sim.useItem(gancho);
    expect(r.ok).toBe(true);
    expect(sim.state.player.hotbar).toBe(gancho);
    expect(countItem(inv, 'martillo')).toBe(1);
    inv.slots[20] = { id: 'llave_inglesa', qty: 1 };
    const far = sim.useItem(20);
    expect(far.ok).toBe(false);
    expect(far.msg).toMatch(/barra rápida/);
  });

  it('concordancia: «la llave inglesa», «el martillo», «una lata de conserva» (todos los objetos tienen género)', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    for (const id of Object.keys(ITEMS)) expect(actions.ITEM_GENDER[id], `falta el género de ${id}`).toBeDefined();
    const toolMsg = (id: string): string | undefined => {
      inv.slots[0] = { id, qty: 1 };
      return sim.useItem(0).msg;
    };
    expect(toolMsg('llave_inglesa')).toBe('Llevas la llave inglesa en la mano');
    expect(toolMsg('cana')).toBe('Llevas la caña de pescar en la mano');
    expect(toolMsg('martillo')).toBe('Llevas el martillo en la mano');
    expect(toolMsg('gancho')).toBe('Llevas el gancho de rescate en la mano');
    expect(actions.itemWithArticle('tornillos')).toBe('la tornillería');
    expect(actions.itemWithArticle('componentes')).toBe('los componentes eléctricos');
    expect(actions.itemWithArticle('hortaliza')).toBe('las hortalizas');
    expect(actions.itemWithArticle('combustible')).toBe('el bidón de combustible');
    expect(actions.itemWithIndefinite('celula_solar')).toBe('una célula solar');
    expect(actions.itemAgree('tela', 'enredado')).toBe('enredada');
    expect(actions.itemAgree('componentes', 'enredado')).toBe('enredados');
    expect(actions.itemAgree('semilla_lino', 'enredado')).toBe('enredadas');
    // Objetos sin entrada: se deduce del nombre.
    expect(actions.itemGender('desconocido_llave')).toBe('m');
    setNeeds(sim, { hunger: 40, thirst: 40, health: 50 });
    sim.state.player.sick = 5;
    const eat = (id: string): string | undefined => {
      inv.slots[0] = { id, qty: 2 };
      return sim.useItem(0).msg;
    };
    expect(eat('hortaliza')).toBe('Comes unas hortalizas');
    expect(eat('sopa')).toBe('Tomas una sopa de verduras');
    expect(eat('botiquin')).toBe('Usas un botiquín. Te encuentras mucho mejor');
    // Combustible: artículo y verbo en plural cuando toca.
    const cocina = mod(sim, 'cocina');
    const fuel = { kind: 'module' as const, id: cocina.id, slot: 'fuel' as const };
    inv.slots[0] = { id: 'conserva', qty: 1 };
    expect(sim.moveItem({ kind: 'player' }, 0, fuel).msg).toBe('La lata de conserva no arde: aquí solo va madera o combustible');
    inv.slots[0] = { id: 'hortaliza', qty: 1 };
    expect(sim.moveItem({ kind: 'player' }, 0, fuel).msg).toBe('Las hortalizas no arden: aquí solo va madera o combustible');
    // Una enfermería destrozada: femenino.
    const enf = addModule(sim, 'enfermeria', 0, 1, 0, 2);
    enf.status = 'broken';
    nearBed(sim, enf.id, 0);
    expect(actions.sleepBlocker(sim, enf.id, 0)).toBe('Enfermería: está destrozada, repárala antes de dormir aquí');
  });

  it('las piezas explican para qué sirven (la célula solar no es un repuesto)', () => {
    const { sim } = setup();
    expect(sim.useItem(slotWith(sim, 'celula_solar')).msg).toBe('La célula solar sirve para construir paneles solares (modo construcción, B)');
    expect(sim.useItem(slotWith(sim, 'kit_reparacion')).msg).toMatch(/^El kit de reparación se gasta al reparar estructuras.*martillo.*R$/);
    expect(sim.useItem(slotWith(sim, 'pieza_mecanica')).msg).toMatch(/^La pieza mecánica se gasta al reparar máquinas.*llave inglesa.*R$/);
    expect(sim.useItem(slotWith(sim, 'madera')).msg).toMatch(/también arde/);
    expect(sim.useItem(slotWith(sim, 'chatarra')).msg).toBe('Es un material: sirve para fabricar y construir');
    expect(sim.useItem(slotWith(sim, 'combustible')).msg).toBe('Echa el bidón de combustible en la ranura de combustible de la cocina o del generador');
  });

  it('materiales, semillas y ranuras vacías dan un mensaje claro', () => {
    const { sim } = setup();
    expect(sim.useItem(slotWith(sim, 'madera')).ok).toBe(false);
    expect(sim.useItem(slotWith(sim, 'semilla_lino')).msg).toMatch(/huerto/);
    expect(sim.useItem(23).msg).toBe('No hay nada en esa ranura');
    expect(sim.useItem(99).ok).toBe(false);
  });

  it('no se puede usar nada durmiendo', () => {
    const { sim } = setup();
    goToHour(sim, 23);
    place(sim, INDOOR);
    sim.sleep(mod(sim, 'camarote').id, 0);
    expect(sim.useItem(slotWith(sim, 'conserva')).msg).toBe('Estás durmiendo');
  });
});

/* ------------------------------------------------------------------ */
/* Inventarios                                                         */
/* ------------------------------------------------------------------ */

describe('mover objetos', () => {
  it('la ranura de combustible solo admite lo que arde', () => {
    const { sim } = setup();
    const cocina = mod(sim, 'cocina');
    cocina.fuelInv!.slots[0] = null;
    const conserva = slotWith(sim, 'conserva');
    const r = sim.moveItem({ kind: 'player' }, conserva, { kind: 'module', id: cocina.id, slot: 'fuel' });
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/no arde/);
    const madera = slotWith(sim, 'madera', 5);
    expect(sim.moveItem({ kind: 'player' }, madera, { kind: 'module', id: cocina.id, slot: 'fuel' }).ok).toBe(true);
    expect(countItem(cocina.fuelInv, 'madera')).toBe(5);
  });

  it('un intercambio no puede meter algo que no arde en el combustible', () => {
    const { sim } = setup();
    const cocina = mod(sim, 'cocina');
    const conserva = slotWith(sim, 'conserva');
    const r = sim.moveItem({ kind: 'module', id: cocina.id, slot: 'fuel' }, 0, { kind: 'player' }, conserva);
    expect(r.ok).toBe(false);
    expect(countItem(cocina.fuelInv, 'madera')).toBe(3);
  });

  it('no se guarda nada en una obra', () => {
    const { sim } = setup();
    const alm = mod(sim, 'almacen');
    alm.status = 'construction';
    const r = sim.moveItem({ kind: 'player' }, slotWith(sim, 'conserva'), { kind: 'module', id: alm.id, slot: 'inventory' });
    expect(r.ok).toBe(false);
    expect(r.msg).toMatch(/obra/);
  });

  it('guardar en el almacén marca el tutorial y fusiona pilas', () => {
    const { sim } = setup();
    const alm = mod(sim, 'almacen');
    const before = countItem(alm.inventory, 'conserva');
    const slot = slotWith(sim, 'conserva');
    const qty = sim.state.player.inventory.slots[slot]!.qty;
    expect(sim.moveItem({ kind: 'player' }, slot, { kind: 'module', id: alm.id, slot: 'inventory' }).ok).toBe(true);
    expect(countItem(alm.inventory, 'conserva')).toBe(before + qty);
    expect(sim.state.player.inventory.slots[slot]).toBeNull();
    expect(sim.state.tutorial.done).toContain('almacen');
  });

  it('mueve, intercambia y reparte dentro del propio inventario', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    inv.slots[10] = { id: 'madera', qty: 30 };
    inv.slots[11] = { id: 'madera', qty: 40 };
    expect(sim.moveItem({ kind: 'player' }, 10, { kind: 'player' }, 11)).toEqual({ ok: true, msg: 'Solo caben 10× Madera' });
    expect(inv.slots[11]).toEqual({ id: 'madera', qty: 50 });
    expect(inv.slots[10]).toEqual({ id: 'madera', qty: 20 });
    inv.slots[12] = { id: 'tela', qty: 2 };
    expect(sim.moveItem({ kind: 'player' }, 10, { kind: 'player' }, 12).ok).toBe(true);
    expect(inv.slots[12]).toEqual({ id: 'madera', qty: 20 });
    expect(inv.slots[10]).toEqual({ id: 'tela', qty: 2 });
    expect(sim.moveItem({ kind: 'player' }, 10, { kind: 'player' }).ok).toBe(false);
  });

  it('coger todo de una caja la elimina cuando queda vacía', () => {
    const { sim } = setup();
    const r = sim.dropItem(slotWith(sim, 'tela', 3));
    expect(r.ok).toBe(true);
    expect(sim.state.crates).toHaveLength(1);
    const crate = sim.state.crates[0]!;
    expect(crate.pos).toEqual(sim.state.player.pos);
    expect(countItem(crate.inventory, 'tela')).toBe(3);
    const got: string[] = [];
    sim.bus.on('itemGained', (g) => got.push(`${g.id}:${g.qty}`));
    expect(sim.takeAll({ kind: 'crate', id: crate.id })).toEqual({ ok: true, msg: 'Lo coges todo' });
    expect(sim.state.crates).toHaveLength(0);
    expect(got).toEqual(['tela:3']);
  });

  it('coger todo con el inventario lleno deja el resto en el contenedor', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    for (let i = 0; i < PLAYER_SLOTS; i++) inv.slots[i] = { id: 'tela', qty: i === 0 ? 25 : 30 };
    const alm = mod(sim, 'almacen');
    alm.inventory = createInventory(20);
    alm.inventory.slots[0] = { id: 'tela', qty: 10 };
    alm.inventory.slots[1] = { id: 'madera', qty: 5 };
    const r = sim.takeAll({ kind: 'module', id: alm.id, slot: 'inventory' });
    expect(r.ok).toBe(true);
    expect(r.msg).toMatch(/lleno/);
    expect(alm.inventory.slots[0]).toEqual({ id: 'tela', qty: 5 });
    expect(alm.inventory.slots[1]).toEqual({ id: 'madera', qty: 5 });
  });

  it('dropItem de una ranura vacía falla', () => {
    const { sim } = setup();
    expect(sim.dropItem(23).ok).toBe(false);
    expect(sim.state.crates).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */
/* Agua                                                                */
/* ------------------------------------------------------------------ */

describe('agua del depósito', () => {
  const nearTank = (sim: Simulation) => {
    const p = sim.layout.props.find((pp) => pp.interact === 'deposito')!;
    place(sim, { x: p.x, y: p.y, z: p.z + p.hz + 0.6 });
  };

  it('beber del depósito: −1 L, sed +40, tutorial', () => {
    const { sim } = setup();
    nearTank(sim);
    setNeeds(sim, { thirst: 30 });
    const w0 = sim.state.utilities.waterL;
    const r = sim.drinkFromTank();
    expect(r.ok, r.msg).toBe(true);
    expect(sim.state.utilities.waterL).toBe(w0 - 1);
    expect(sim.state.player.needs.thirst).toBe(70);
    expect(sim.state.tutorial.done).toContain('beber');
  });

  it('llenar botellas gasta 1 L por botella', () => {
    const { sim } = setup();
    nearTank(sim);
    const n = countItem(sim.state.player.inventory, 'agua_potable');
    const w0 = sim.state.utilities.waterL;
    expect(sim.fillBottle().ok).toBe(true);
    expect(sim.fillBottle().ok).toBe(true);
    expect(countItem(sim.state.player.inventory, 'agua_potable')).toBe(n + 2);
    expect(sim.state.utilities.waterL).toBe(w0 - 2);
  });

  it('hay que estar cerca y que quede agua', () => {
    const { sim } = setup();
    setNeeds(sim, { thirst: 30 });
    place(sim, DECK);
    expect(sim.drinkFromTank().msg).toMatch(/Acércate/);
    nearTank(sim);
    sim.state.utilities.waterL = 0.5;
    expect(sim.drinkFromTank().msg).toMatch(/vacío/);
    expect(sim.fillBottle().ok).toBe(false);
    expect(sim.state.utilities.waterL).toBe(0.5);
  });
});

/* ------------------------------------------------------------------ */
/* Clima                                                               */
/* ------------------------------------------------------------------ */

/** Ejecuta el clima `minutes` minutos y registra los climas por los que pasa. */
function runWeather(sim: Simulation, minutes: number): { kind: WeatherKind; duration: number }[] {
  const seq: { kind: WeatherKind; duration: number }[] = [];
  let cur = sim.state.weather.kind;
  let started = sim.state.time;
  for (let t = 0; t < minutes; t += 0.5) {
    sim.state.time += 0.5;
    weather.tickWeather(sim, 0.5);
    const w = sim.state.weather;
    if (w.kind !== cur || w.remaining > 1e8) {
      seq.push({ kind: cur, duration: sim.state.time - started });
      cur = w.kind;
      started = sim.state.time;
    }
  }
  return seq;
}

describe('clima', () => {
  it('transiciones válidas con duraciones en rango y sin dos tormentas seguidas (varias semillas)', () => {
    for (const seed of [1, 2, 3, 42, 777, 2024]) {
      const { sim } = setup(seed);
      sim.state.voyage.regionId = 'tormentas'; // muchas tormentas para estresar la regla
      const kinds = new Set<string>();
      const errors: string[] = [];
      let storms = 0;
      let prev: WeatherKind = sim.state.weather.kind;
      for (let t = 0; t < 30 * MINUTES_PER_DAY; t += 1) {
        sim.state.time += 1;
        weather.tickWeather(sim, 1);
        const w = sim.state.weather;
        if (!weather.WEATHER_KINDS.includes(w.kind) || !weather.WEATHER_KINDS.includes(w.next)) errors.push(`clima inválido ${w.kind}/${w.next}`);
        if (w.kind === 'tormenta' && w.next === 'tormenta') errors.push(`t=${t}: tormenta prevista tras tormenta`);
        if (prev !== w.kind) {
          kinds.add(w.kind);
          if (w.kind === 'tormenta') {
            if (prev === 'tormenta') errors.push(`t=${t}: dos tormentas seguidas`);
            storms++;
          }
          const [lo, hi] = weather.WEATHER_DURATION[w.kind];
          if (w.remaining < lo - 1 || w.remaining > hi) errors.push(`t=${t}: duración ${w.remaining} fuera de [${lo}, ${hi}] para ${w.kind}`);
        }
        prev = w.kind;
        for (const v of [w.cloudiness, w.rain, w.fog, w.wind]) if (!(v >= 0 && v <= 1)) errors.push(`t=${t}: parámetro fuera de rango ${v}`);
      }
      expect(errors.slice(0, 5), `semilla ${seed}`).toEqual([]);
      expect(kinds.size, `semilla ${seed}`).toBeGreaterThanOrEqual(4);
      expect(storms, `semilla ${seed}`).toBeGreaterThan(3);
    }
  });

  it('la tormenta nunca se repite seguida aunque la región solo pese tormentas', () => {
    const { sim } = setup(5);
    const r = REGIONS['tormentas']!;
    const saved = { ...r.weather };
    try {
      Object.assign(r.weather, { despejado: 0, nublado: 0, lluvia: 0, niebla: 0.01, tormenta: 100 });
      weather.forceWeather(sim, 'tormenta', 10);
      sim.state.voyage.regionId = 'tormentas';
      const seq = runWeather(sim, 5 * MINUTES_PER_DAY);
      for (let i = 1; i < seq.length; i++) expect(seq[i - 1]!.kind === 'tormenta' && seq[i]!.kind === 'tormenta').toBe(false);
    } finally {
      Object.assign(r.weather, saved);
    }
  });

  it('las regiones cambian la frecuencia de cada clima', () => {
    const count = (region: string) => {
      const { sim } = setup(9);
      sim.state.voyage.regionId = region;
      let storm = 0;
      for (let t = 0; t < 60 * MINUTES_PER_DAY; t += 2) {
        sim.state.time += 2;
        weather.tickWeather(sim, 2);
        if (sim.state.weather.kind === 'tormenta') storm += 2;
      }
      return storm;
    };
    expect(count('tormentas')).toBeGreaterThan(count('templadas') * 2);
  });

  it('los parámetros se suavizan hacia el objetivo del clima', () => {
    const { sim } = setup();
    weather.forceWeather(sim, 'tormenta', 600);
    const w = sim.state.weather;
    expect(w.blend).toBe(0);
    const rain0 = w.rain;
    sim.state.time += 1;
    weather.tickWeather(sim, 1);
    expect(w.rain).toBeGreaterThan(rain0);
    expect(w.rain).toBeLessThan(0.1);
    for (let i = 0; i < 300; i++) {
      sim.state.time += 1;
      weather.tickWeather(sim, 1);
    }
    expect(w.rain).toBeCloseTo(1, 2);
    expect(w.wind).toBeCloseTo(1, 2);
    expect(w.waveHeight).toBeCloseTo(2.6, 1);
    expect(w.blend).toBe(1);
  });

  it('temperatura: base de la región + sol − lluvia − viento', () => {
    const { sim } = setup();
    weather.forceWeather(sim, 'despejado', 1e6, true);
    goToHour(sim, 12.25);
    weather.tickWeather(sim, 0.5);
    const w = sim.state.weather;
    expect(w.temperature).toBeCloseTo(weather.airTemperature(REGIONS['templadas']!.baseTemp, sim.state.time, w.rain, w.wind), 6);
    expect(w.temperature).toBeGreaterThan(26);
    goToHour(sim, 0.25);
    weather.tickWeather(sim, 0.5);
    expect(w.temperature).toBeLessThan(18);
  });

  it('la temperatura cambia de forma gradual al cambiar de región', () => {
    const { sim } = setup();
    weather.forceWeather(sim, 'despejado', 1e6, true);
    weather.tickWeather(sim, 0.5);
    const t0 = sim.state.weather.temperature;
    sim.state.voyage.regionId = 'boreal';
    weather.tickWeather(sim, 0.5);
    expect(t0 - sim.state.weather.temperature).toBeLessThan(1);
    for (let i = 0; i < 400; i++) weather.tickWeather(sim, 0.5);
    expect(sim.state.weather.temperature).toBeLessThan(t0 - 15);
  });

  it('el barómetro avisa una vez 60–90 min antes de la tormenta', () => {
    const { sim, notes } = setup();
    weather.forceWeather(sim, 'nublado', 300);
    sim.state.weather.next = 'tormenta';
    let warnedAt: number | null = null;
    for (let t = 0; t < 300; t += 0.5) {
      sim.state.time += 0.5;
      weather.tickWeather(sim, 0.5);
      if (warnedAt === null && notes.some((n) => /barómetro/.test(n.text))) warnedAt = sim.state.weather.remaining;
    }
    expect(warnedAt).not.toBeNull();
    expect(warnedAt!).toBeGreaterThanOrEqual(59);
    expect(warnedAt!).toBeLessThanOrEqual(90);
    expect(notes.filter((n) => /barómetro/.test(n.text))).toHaveLength(1);
    expect(sim.state.weather.kind).toBe('tormenta');
    expect(notes.some((n) => /tormenta/.test(n.text) && n.kind === 'danger')).toBe(true);
    expect(weather.barometer(sim).trend).toBe('tormenta');
  });

  it('relámpagos con trueno durante la tormenta', () => {
    const { sim, sfx } = setup(4);
    weather.forceWeather(sim, 'tormenta', 600, true);
    let flashes = 0;
    for (let t = 0; t < 120; t += 0.5) {
      sim.state.time += 0.5;
      weather.tickWeather(sim, 0.5);
      if (sim.state.weather.lightning > 0) flashes++;
    }
    const thunder = sfx.filter((s) => s === 'trueno').length;
    expect(thunder).toBeGreaterThan(5);
    expect(thunder).toBeLessThan(40);
    expect(flashes).toBeGreaterThan(0);
    // Sin tormenta no hay rayos.
    weather.forceWeather(sim, 'despejado', 600, true);
    const before = sfx.length;
    for (let t = 0; t < 120; t += 0.5) weather.tickWeather(sim, 0.5);
    expect(sfx.slice(before).filter((s) => s === 'trueno')).toHaveLength(0);
    expect(sim.state.weather.lightning).toBe(0);
  });

  it('es determinista con la misma semilla', () => {
    const a = setup(31).sim;
    const b = setup(31).sim;
    const sa = runWeather(a, 10 * MINUTES_PER_DAY).map((s) => s.kind).join(',');
    const sb = runWeather(b, 10 * MINUTES_PER_DAY).map((s) => s.kind).join(',');
    expect(sa).toBe(sb);
    expect(sa.length).toBeGreaterThan(10);
  });
});

/* ------------------------------------------------------------------ */
/* Viaje                                                               */
/* ------------------------------------------------------------------ */

function runVoyage(sim: Simulation, minutes: number): void {
  for (let t = 0; t < minutes - 1e-9; t += 0.5) {
    sim.state.time += 0.5;
    voyage.tickVoyage(sim, 0.5);
  }
}

describe('viaje', () => {
  it('navega a velocidad de crucero', () => {
    const { sim } = setup();
    runVoyage(sim, 60);
    const v = sim.state.voyage;
    expect(v.speed).toBeCloseTo(CRUISE_SPEED, 6);
    expect(v.distance).toBeCloseTo(CRUISE_SPEED, 6);
    expect(v.regionDistance).toBeCloseTo(CRUISE_SPEED, 6);
  });

  it('la región y el motor cambian la velocidad', () => {
    const { sim } = setup();
    sim.state.voyage.regionId = 'sargazos';
    expect(voyage.targetSpeed(sim)).toBeCloseTo(CRUISE_SPEED * 0.75, 6);
    const motor = addModule(sim, 'motor', 0, 2, 2);
    motor.on = true;
    motor.powered = false;
    expect(voyage.targetSpeed(sim)).toBeCloseTo(CRUISE_SPEED * 0.75, 6);
    motor.powered = true;
    expect(voyage.targetSpeed(sim)).toBeCloseTo(CRUISE_SPEED * 0.75 + 3, 6);
    motor.on = false;
    expect(voyage.motorBonus(sim)).toBe(0);
  });

  it('fondeo: se detiene poco a poco y leva anclas al acabar', () => {
    const { sim, notes } = setup();
    voyage.anchorShip(sim, 60, 'rescate');
    expect(voyage.isAnchored(sim)).toBe(true);
    runVoyage(sim, 30);
    expect(sim.state.voyage.speed).toBe(0);
    const d = sim.state.voyage.distance;
    runVoyage(sim, 20);
    expect(sim.state.voyage.distance).toBe(d);
    runVoyage(sim, 15);
    expect(sim.state.voyage.anchoredUntil).toBeNull();
    expect(notes.some((n) => /Levamos anclas/.test(n.text))).toBe(true);
    runVoyage(sim, 10);
    expect(sim.state.voyage.speed).toBeGreaterThan(3);
  });

  it('pide rumbo a 10 millas del final y entra en la región elegida', () => {
    const { sim, notes } = setup();
    const v = sim.state.voyage;
    const len = v.regionLength;
    v.regionDistance = len - 10.5;
    runVoyage(sim, 1);
    expect(v.nextChoices).toBeNull();
    runVoyage(sim, 10);
    expect(v.nextChoices).toEqual(REGIONS['templadas']!.next);
    expect(notes.some((n) => /elige rumbo en el timón/.test(n.text))).toBe(true);
    expect(sim.chooseRoute('boreal').ok).toBe(false);
    const r = sim.chooseRoute('archipielago');
    expect(r).toEqual({ ok: true, msg: 'Rumbo fijado: Archipiélago Esmeralda' });
    expect(sim.state.tutorial.done).toContain('timon');
    runVoyage(sim, 120);
    expect(v.regionId).toBe('archipielago');
    expect(v.regionLength).toBe(REGIONS['archipielago']!.length);
    expect(v.regionDistance).toBeGreaterThan(0);
    expect(v.regionDistance).toBeLessThan(10);
    expect(v.route).toEqual(['templadas', 'archipielago']);
    expect(v.nextChoices).toBeNull();
    expect(v.chosenNext).toBeNull();
    expect(sim.state.log.some((l) => /Dejamos atrás Aguas Templadas\. Entramos en el Archipiélago Esmeralda\./.test(l.text))).toBe(true);
  });

  it('sin rumbo elegido sigue la primera opción', () => {
    const { sim } = setup();
    runVoyage(sim, (REGIONS['templadas']!.length / CRUISE_SPEED) * 60 + 5);
    expect(sim.state.voyage.regionId).toBe(REGIONS['templadas']!.next[0]);
    expect(sim.state.log.some((l) => /sin rumbo fijado/.test(l.text))).toBe(true);
  });

  it('se puede fijar el rumbo antes de tiempo y se respeta', () => {
    const { sim } = setup();
    expect(sim.chooseRoute('archipielago').ok).toBe(true);
    runVoyage(sim, (REGIONS['templadas']!.length / CRUISE_SPEED) * 60 + 5);
    expect(sim.state.voyage.regionId).toBe('archipielago');
  });

  it('integración: varios días de sim.tick recorren regiones encadenadas', () => {
    const { sim } = setup(17);
    sim.state.npcs = [];
    sim.state.events.nextRollAt = 1e12;
    for (let i = 0; i < 3 * 48; i++) {
      Object.assign(sim.state.player.needs, { hunger: 100, thirst: 100, energy: 100, health: 100, warmth: 80 });
      sim.tick(30);
    }
    const v = sim.state.voyage;
    expect(v.route.length).toBeGreaterThanOrEqual(2);
    // Cada tramo une regiones vecinas en la carta (hacia delante o, los primeros días, de vuelta).
    for (let i = 1; i < v.route.length; i++) {
      const a = REGIONS[v.route[i - 1]!]!;
      const b = REGIONS[v.route[i]!]!;
      expect(a.next.includes(b.id) || b.next.includes(a.id)).toBe(true);
    }
    expect(v.distance).toBeGreaterThan(300);
  });

  it('los avistamientos derivan hacia popa y caducan', () => {
    const { sim } = setup();
    const v = sim.state.voyage;
    v.sightings.push({ id: 50, kind: 'isla', name: 'Isla', expiresAt: sim.state.time + 30, side: 1, distance: 200, x: 100, eventId: 1 });
    runVoyage(sim, 10);
    expect(v.sightings[0]!.x).toBeCloseTo(100 - ((VISUAL_DRIFT * CRUISE_SPEED) / 6) * 10, 6);
    runVoyage(sim, 21);
    expect(v.sightings).toHaveLength(0);
  });

  it('los primeros días no se ofrecen regiones de peligro ≥ 4 si hay alternativa y el piloto busca aguas tranquilas', () => {
    const { sim } = setup();
    const v = sim.state.voyage;
    expect(voyage.dangerGated(sim)).toBe(true);
    // Cementerio → Boreal (3) o Tormentas (5): solo se ofrece Boreal.
    v.regionId = 'cementerio';
    v.regionLength = REGIONS['cementerio']!.length;
    expect(voyage.nextRegions(sim)).toEqual(['boreal']);
    expect(voyage.routeOptions(sim).map((o) => o.id)).toEqual(['boreal']);
    const r = sim.chooseRoute('tormentas');
    expect(r.ok).toBe(false);
    expect(r.msg).toBe('Aún no es prudente navegar hacia el Mar de las Tormentas: el barco podrá adentrarse a partir del día 7');
    expect(voyage.gatedRoutes(sim).map((g) => g.id)).toEqual(['tormentas']);
    // Boreal → Tormentas (5) o Faro (4): sin alternativa hacia delante, se ofrece volver a aguas más tranquilas…
    v.regionId = 'boreal';
    expect(voyage.nextRegions(sim)).toEqual(['archipielago', 'cementerio']);
    for (const id of voyage.nextRegions(sim)) expect(REGIONS[id]!.danger).toBeLessThan(voyage.DANGER_GATE);
    // …salvo que falte menos de un día para el día 7: entonces se sigue adelante por lo menos peligroso.
    const t0 = sim.state.time;
    sim.state.time = t0 + voyage.DANGER_GATE_DAYS * MINUTES_PER_DAY - (voyage.BACKTRACK_MIN_HOURS - 1) * 60;
    expect(voyage.dangerGated(sim)).toBe(true);
    expect(voyage.nextRegions(sim)).toEqual(REGIONS['boreal']!.next);
    expect(voyage.autopilotTarget(sim)).toBe('faro');
    sim.state.time = t0;
    // El piloto (sin rumbo fijado) elige la menos peligrosa.
    v.regionId = 'templadas';
    expect(voyage.autopilotTarget(sim, ['archipielago', 'sargazos'])).toBe('sargazos');
    expect(voyage.routeOptions(sim).find((o) => o.autopilot)?.id).toBe('sargazos');
    v.regionDistance = v.regionLength - 0.1;
    v.regionId = 'archipielago';
    v.regionLength = REGIONS['archipielago']!.length;
    v.regionDistance = v.regionLength - 0.1;
    runVoyage(sim, 5);
    expect(v.regionId).toBe('cementerio');
    expect(sim.state.log.some((l) => /el piloto busca aguas tranquilas/.test(l.text))).toBe(true);
  });

  it('a partir del día 7 se ofrecen todas las salidas y, sin rumbo, el barco sigue la corriente', () => {
    const { sim } = setup();
    const v = sim.state.voyage;
    sim.state.time += voyage.DANGER_GATE_DAYS * MINUTES_PER_DAY;
    expect(voyage.dangerGated(sim)).toBe(false);
    v.regionId = 'cementerio';
    v.regionLength = REGIONS['cementerio']!.length;
    expect(voyage.nextRegions(sim)).toEqual(REGIONS['cementerio']!.next);
    expect(voyage.gatedRoutes(sim)).toEqual([]);
    expect(sim.chooseRoute('tormentas').ok).toBe(true);
    v.chosenNext = null;
    v.regionDistance = v.regionLength - 0.1;
    runVoyage(sim, 5);
    expect(v.regionId).toBe(REGIONS['cementerio']!.next[0]);
    expect(sim.state.log.some((l) => /seguimos la corriente/.test(l.text))).toBe(true);
  });

  it('con el piloto, las regiones de peligro ≥ 4 no llegan antes de unos 6 días jugados (varias semillas)', () => {
    for (const seed of [1, 5, 9]) {
      const { sim } = setup(seed);
      const v = sim.state.voyage;
      const first: Record<string, number> = {};
      // 7 días de navegación sin fijar rumbo.
      for (let t = 0; t < 7 * MINUTES_PER_DAY; t += 0.5) {
        sim.state.time += 0.5;
        voyage.tickVoyage(sim, 0.5);
        if (first[v.regionId] === undefined) first[v.regionId] = sim.state.time;
      }
      for (const [id, at] of Object.entries(first)) {
        const played = voyage.playedDays({ state: { time: at } } as unknown as Simulation);
        if (REGIONS[id]!.danger >= voyage.DANGER_GATE) expect(played, `${seed}: ${id}`).toBeGreaterThanOrEqual(voyage.DANGER_GATE_DAYS - voyage.BACKTRACK_MIN_HOURS / 24);
        // El frío de la Corriente Boreal no llega antes del día 5.
        if (id === 'boreal') expect(played, `${seed}: boreal`).toBeGreaterThanOrEqual(4);
      }
      // Cada región dura al menos medio día: el viaje no se recorre en cuatro días.
      expect(v.route.length, `${seed}: ${v.route.join(' → ')}`).toBeLessThanOrEqual(7);
    }
  });

  it('nombres de región con artículo para los textos', () => {
    expect(voyage.regionWithArticle('sargazos')).toBe('el Mar de los Sargazos');
    expect(voyage.regionWithArticle('boreal')).toBe('la Corriente Boreal');
    expect(voyage.regionWithArticle('templadas')).toBe('Aguas Templadas');
    expect(voyage.regionWithArticle('faro')).toBe('El Faro del Fin del Mundo');
    expect(voyage.regionWithArticle('cementerio')).toBe('el Cementerio de Barcos');
  });

  it('opciones de rumbo para el timón', () => {
    const { sim } = setup();
    sim.chooseRoute('sargazos');
    const opts = voyage.routeOptions(sim);
    expect(opts.map((o) => o.id)).toEqual(['sargazos', 'archipielago']);
    expect(opts[0]!.chosen).toBe(true);
    expect(voyage.hoursToRegionEnd(sim)).toBeCloseTo(REGIONS['templadas']!.length / CRUISE_SPEED, 6);
  });
});

/* ------------------------------------------------------------------ */
/* Tutorial                                                            */
/* ------------------------------------------------------------------ */

describe('tutorial', () => {
  it('empieza por moverse y se completa al alejarse 5 m', () => {
    const { sim } = setup();
    expect(tutorial.currentTutorial(sim)?.id).toBe('mover');
    tutorial.tickTutorial(sim, 0.5);
    sim.state.player.pos.x += 3;
    tutorial.tickTutorial(sim, 0.5);
    expect(sim.state.tutorial.done).not.toContain('mover');
    sim.state.player.pos.z += 4;
    tutorial.tickTutorial(sim, 0.5);
    expect(sim.state.tutorial.done).toContain('mover');
  });

  it('deja al menos 20 min entre pasos y salta los que no aplican', () => {
    const { sim } = setup();
    tutorial.markTutorial(sim, 'mover');
    expect(tutorial.currentTutorial(sim)).toBeNull();
    sim.state.time += 19;
    expect(tutorial.currentTutorial(sim)).toBeNull();
    sim.state.time += 1;
    // Sin restos flotando, el gancho espera y se muestra comer.
    expect(tutorial.currentTutorial(sim)?.id).toBe('comer');
    sim.state.debris.push({ id: 77, kind: 'tablones', pos: { x: 30, z: 10 }, vel: { x: -1, z: 0 }, loot: [], spin: 0 });
    const step = tutorial.currentTutorial(sim)!;
    expect(step.id).toBe('gancho');
    expect(step.index).toBe(2);
    expect(step.total).toBe(tutorial.TUTORIAL_STEPS.length);
  });

  it('los pasos hechos fuera de orden se saltan y "dormir" espera a la noche', () => {
    const { sim } = setup();
    for (const id of ['mover', 'gancho', 'comer', 'cuaderno', 'almacen', 'fabricar', 'cocinar', 'beber']) tutorial.markTutorial(sim, id);
    sim.state.time += 30;
    goToHour(sim, 12);
    setNeeds(sim, { energy: 90 });
    // 'pescar' espera a tener caña y 'dormir' a que se pueda dormir: toca construir.
    expect(tutorial.currentTutorial(sim)?.id).toBe('construir');
    goToHour(sim, 20);
    expect(tutorial.currentTutorial(sim)?.id).toBe('construir');
    addItem(sim.state.player.inventory, 'cana', 1);
    expect(tutorial.currentTutorial(sim)?.id).toBe('pescar');
    // De noche, dormir es oportuno y pasa por delante de pescar.
    goToHour(sim, 21);
    const step = tutorial.currentTutorial(sim)!;
    expect(step.id).toBe('dormir');
    expect(step.urgent).toBe(true);
  });

  it('lo oportuno pasa delante: dormir de noche aunque falte cocinar, el timón con una decisión pendiente, reparar con daños', () => {
    const { sim } = setup();
    for (const id of ['mover', 'gancho', 'comer', 'cuaderno', 'almacen', 'fabricar', 'pescar', 'beber']) tutorial.markTutorial(sim, id);
    addItem(sim.state.player.inventory, 'pescado_crudo', 1);
    sim.state.time += 30;
    goToHour(sim, 15);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 70 });
    expect(tutorial.currentTutorial(sim)?.id).toBe('cocinar');
    // Caso del informe: a las 21:17 con energía 24 seguía «Cocinar» y nunca salía «Dormir».
    goToHour(sim, 21);
    sim.state.time += 17;
    setNeeds(sim, { energy: 24 });
    expect(tutorial.currentTutorial(sim)?.id).toBe('dormir');
    goToHour(sim, 10);
    setNeeds(sim, { energy: 90 });
    expect(tutorial.currentTutorial(sim)?.id).toBe('cocinar');
    // Un avistamiento con decisión: el timón pasa delante.
    sim.state.events.active.push({ id: 940, type: 'naufragio', title: 'Naufragio a la vista', description: '', startedAt: sim.state.time, endsAt: null, stage: 0, objectives: [], choices: [{ id: 'rescatar', label: 'Rescatar', enabled: true }], data: {} });
    expect(tutorial.currentTutorial(sim)?.id).toBe('timon');
    sim.state.events.active = [];
    // Algo dañado: reparar.
    mod(sim, 'almacen').condition = 30;
    expect(tutorial.currentTutorial(sim)?.id).toBe('reparar');
    mod(sim, 'almacen').condition = 100;
    // Con sed, el depósito ya está hecho: comer y beber también. Sin pasos oportunos, el primero pendiente.
    expect(tutorial.currentTutorial(sim)?.id).toBe('cocinar');
  });

  it('moverse se da por hecho al completar pasos que exigen caminar, o al recorrer 5 m en varios pasos', () => {
    const { sim } = setup();
    tutorial.markTutorial(sim, 'almacen');
    expect(sim.state.tutorial.done).toContain('mover');
    const { sim: s2 } = setup();
    // Ir y venir dentro del camarote: nunca a 5 m del origen, pero recorre más de 5 m.
    for (let i = 0; i < 12; i++) {
      s2.state.player.pos.x += i % 2 ? -1 : 1;
      tutorial.tickTutorial(s2, 0.5);
    }
    expect(s2.state.tutorial.done).toContain('mover');
    // Quedarse quieto o dar un paso no basta.
    const { sim: s3 } = setup();
    for (let i = 0; i < 4; i++) {
      s3.state.player.pos.x += i % 2 ? -1 : 1;
      tutorial.tickTutorial(s3, 0.5);
    }
    expect(s3.state.tutorial.done).not.toContain('mover');
  });

  it('los consejos describen la acción física (teclas y muebles), no menús, y «dormir» coincide con cuándo se puede dormir', () => {
    for (const s of tutorial.TUTORIAL_STEPS) {
      expect(s.text, s.id).not.toMatch(/\b(Tab|inventario|menú)\b/i);
      expect(s.text.trim().endsWith('.'), s.id).toBe(true);
    }
    const comer = tutorial.TUTORIAL_STEPS.find((s) => s.id === 'comer')!;
    expect(comer.text).toMatch(/F o clic derecho/);
    // 'dormir' aparece justo cuando sleepBlocker deja de decir «No tienes sueño».
    const { sim } = setup();
    for (const s of tutorial.TUTORIAL_STEPS) if (s.id !== 'dormir') tutorial.markTutorial(sim, s.id);
    sim.state.time += 30;
    const cam = mod(sim, 'camarote');
    nearBed(sim, cam.id, 0);
    for (const [hour, energy] of [[12, 90], [12, 79], [20, 85], [21, 85], [4, 95], [5, 95]] as const) {
      goToHour(sim, hour);
      setNeeds(sim, { energy, hunger: 90, thirst: 90 });
      const canSleep = !/No tienes sueño/.test(actions.sleepBlocker(sim, cam.id, 0) ?? '');
      expect(tutorial.currentTutorial(sim)?.id === 'dormir', `${hour}:00 energía ${energy}`).toBe(canSleep);
    }
  });

  it('descartado, terminado o durmiendo no muestra nada', () => {
    const { sim, notes } = setup();
    tutorial.dismissTutorial(sim);
    expect(tutorial.currentTutorial(sim)).toBeNull();
    tutorial.resumeTutorial(sim);
    expect(tutorial.currentTutorial(sim)?.id).toBe('mover');
    for (const s of tutorial.TUTORIAL_STEPS) tutorial.markTutorial(sim, s.id);
    sim.state.time += 100;
    expect(tutorial.currentTutorial(sim)).toBeNull();
    const total = tutorial.TUTORIAL_STEPS.length;
    expect(total).toBe(15);
    expect(tutorial.tutorialProgress(sim)).toEqual({ done: total, total, complete: true });
    expect(notes.filter((n) => /Tutorial completado/.test(n.text))).toHaveLength(1);
  });

  it('markTutorial emite el evento una sola vez', () => {
    const { sim } = setup();
    const ids: string[] = [];
    sim.bus.on('tutorialStep', (e) => ids.push(e.id));
    tutorial.markTutorial(sim, 'comer');
    tutorial.markTutorial(sim, 'comer');
    expect(ids).toEqual(['comer']);
  });
});

/* ------------------------------------------------------------------ */
/* Guardado                                                            */
/* ------------------------------------------------------------------ */

describe('guardado', () => {
  it('ida y vuelta con localStorage falso: estado idéntico', () => {
    const storage = new FakeStorage();
    const store = createLocalSaveStore('test', storage);
    const { sim } = setup(21);
    sim.state.npcs = [];
    sim.state.events.nextRollAt = 1e12;
    for (let i = 0; i < 20; i++) sim.tick(30);
    sim.state.player.clothing = 'abrigo';
    sim.state.unlocks.push('taller');
    store.save('manual', sim.state);
    const loaded = store.load('manual')!;
    expect(loaded).toEqual(JSON.parse(serialize(sim.state)));
    // La partida cargada sigue funcionando.
    const sim2 = new Simulation(loaded);
    sim2.tick(30);
    expect(sim2.state.time).toBeCloseTo(sim.state.time + 30, 6);
  });

  it('el RNG se sincroniza antes de guardar: la partida cargada no repite tiradas hechas fuera del tick', () => {
    const { sim } = setup(21);
    sim.tick(1);
    setNeeds(sim, { hunger: 30 });
    sim.useItem(slotWith(sim, 'pescado_crudo', 2)); // tira dados (puede enfermar) fuera del tick
    sim.rng.next();
    expect(sim.rng.state).not.toBe(sim.state.rngState);
    sim.syncRng();
    expect(sim.state.rngState).toBe(sim.rng.state);
    const store = createLocalSaveStore('t-rng', new FakeStorage());
    store.save('manual', sim.state);
    const loaded = new Simulation(store.load('manual')!);
    expect(loaded.rng.next()).toBe(sim.rng.next());
  });

  it('lista ordenada por fecha con etiqueta legible', async () => {
    const storage = new FakeStorage();
    const store = createLocalSaveStore('test', storage);
    const a = createNewGame(1);
    const b = createNewGame(2);
    b.time += 2 * MINUTES_PER_DAY;
    b.voyage.regionId = 'archipielago';
    store.save('auto', a);
    await new Promise((r) => setTimeout(r, 5));
    store.save('manual2', b);
    storage.setItem('otra-cosa', '{}');
    const list = store.list();
    expect(list.map((x) => x.slot)).toEqual(['manual2', 'auto']);
    expect(list[0]!.label).toBe('Día 3 · Archipiélago Esmeralda');
    expect(list[0]!.day).toBe(3);
    expect(list[0]!.region).toBe('Archipiélago Esmeralda');
    expect(list[1]!.label).toBe('Día 1 · Aguas Templadas');
    expect(list[1]!.slotName).toBe('Guardado automático');
    await new Promise((r) => setTimeout(r, 5));
    store.save('manual', a, 'Antes de la tormenta');
    const after = store.list();
    expect(after[0]!.slot).toBe('manual');
    expect(after[0]!.label).toBe('Antes de la tormenta');
  });

  it('borrar, cargar inexistente y entradas dañadas', () => {
    const storage = new FakeStorage();
    const store = createLocalSaveStore('test', storage);
    store.save('manual', createNewGame(1));
    expect(store.load('manual3')).toBeNull();
    store.remove('manual');
    expect(store.load('manual')).toBeNull();
    expect(store.list()).toHaveLength(0);
    storage.setItem('test:save:manual2', '{roto');
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.corrupt).toBe(true);
    expect(() => store.load('manual2')).toThrow(SaveError);
    try {
      store.load('manual2');
    } catch (e) {
      expect((e as SaveError).kind).toBe('corrupt');
      expect((e as Error).message).toMatch(/dañada/);
    }
  });

  it('rellena en profundidad los campos que falten', () => {
    const s = createNewGame(5) as unknown as Record<string, any>;
    delete s.weather.fog;
    delete s.player.stats;
    delete s.player.needs.warmth;
    delete s.tutorial;
    delete s.utilities.water;
    s.voyage.speed = 'rápido';
    delete s.ship.modules[2].queue;
    delete s.ship.modules[2].fuelInv;
    delete s.ship.modules[0].beds;
    delete s.npcs[0].needs.mood;
    delete s.npcs[1].appearance;
    s.player.inventory.slots[5] = { id: 'objeto_inexistente', qty: 3 };
    s.player.inventory.slots.length = 10;
    const st = deserialize(JSON.stringify(s));
    const def = createNewGame(5);
    expect(st.weather.fog).toBe(def.weather.fog);
    expect(st.player.stats).toEqual(def.player.stats);
    expect(st.player.needs.warmth).toBe(def.player.needs.warmth);
    expect(st.tutorial).toEqual({ done: [], dismissed: false });
    expect(st.utilities.water).toEqual(def.utilities.water);
    expect(st.voyage.speed).toBe(def.voyage.speed);
    expect(st.ship.modules[2]!.queue).toEqual([]);
    expect(st.ship.modules[2]!.fuelInv!.slots).toHaveLength(1);
    expect(st.ship.modules[0]!.beds).toEqual([null, null, null, null]);
    expect(st.npcs[0]!.needs.mood).toBe(70);
    expect(st.npcs[1]!.appearance).toBeTruthy();
    expect(st.player.inventory.slots).toHaveLength(PLAYER_SLOTS);
    expect(st.player.inventory.slots[5]).toBeNull();
    // Los datos guardados se conservan.
    expect(st.ship.modules[1]!.beds).toEqual(['player']);
    expect(st.npcs[0]!.name).toBe('Marina');
    // Y la partida se puede simular.
    const sim = new Simulation(st);
    sim.tick(10);
    expect(sim.state.player.alive).toBe(true);
  });

  it('corrige ids, regiones y climas inválidos', () => {
    const s = createNewGame(5) as unknown as Record<string, any>;
    s.nextId = 1;
    s.voyage.regionId = 'atlantida';
    s.weather.kind = 'granizo';
    s.ship.modules.push({ id: 99, type: 'modulo_futuro', level: 1, x: 0, z: 0, rot: 0 });
    const st = restoreState(s);
    expect(st.nextId).toBeGreaterThan(Math.max(...st.ship.modules.map((m) => m.id)));
    expect(st.voyage.regionId).toBe('templadas');
    expect(st.weather.kind).toBe('despejado');
    expect(st.ship.modules.some((m) => m.type === 'modulo_futuro')).toBe(false);
  });

  it('migra guardados sin versión y rechaza versiones futuras o datos dañados', () => {
    const old = createNewGame(8) as unknown as Record<string, any>;
    delete old.version;
    expect(deserialize(JSON.stringify(old)).version).toBe(SAVE_VERSION);
    const future = createNewGame(8) as unknown as Record<string, any>;
    future.version = SAVE_VERSION + 1;
    expect(() => deserialize(JSON.stringify(future))).toThrow(/versión más nueva/);
    expect(() => deserialize('no es json')).toThrow(/dañada/);
    expect(() => deserialize('{"time":5}')).toThrow(/falta el barco/);
    const noPlayer = createNewGame(8) as unknown as Record<string, any>;
    delete noPlayer.player;
    expect(() => deserialize(JSON.stringify(noPlayer))).toThrow(/falta el jugador/);
  });

  it('exporta e importa una partida como archivo', () => {
    const st = createNewGame(12);
    st.time += 3 * MINUTES_PER_DAY;
    const file = exportSave(st, 'Mi partida');
    expect(JSON.parse(file).meta.label).toBe('Mi partida');
    expect(deserialize(file)).toEqual(JSON.parse(serialize(st)));
  });

  it('acepta un estado suelto (sin envoltorio meta) en el almacenamiento', () => {
    const storage = new FakeStorage();
    storage.setItem('test:save:manual', JSON.stringify(createNewGame(4)));
    const store = createLocalSaveStore('test', storage);
    expect(store.load('manual')!.seed).toBe(4);
  });

  it('error de cuota claro sin perder el guardado anterior', () => {
    const first = createNewGame(1);
    const size = JSON.stringify({ meta: {}, state: first }).length;
    const storage = new FakeStorage(size + 600);
    const store = createLocalSaveStore('test', storage);
    store.save('manual', first);
    const big = createNewGame(2);
    for (let i = 0; i < 200; i++) big.log.push({ at: i, text: 'x'.repeat(100), kind: 'info' });
    let err: unknown = null;
    try {
      store.save('manual', big);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SaveError);
    expect((err as SaveError).kind).toBe('quota');
    expect((err as Error).message).toMatch(/espacio/);
    expect(store.load('manual')!.seed).toBe(1);
  });

  it('la cuota se libera reescribiendo la misma ranura cuando hace falta', () => {
    const a = createNewGame(1);
    const size = JSON.stringify({ meta: {}, state: a }).length;
    // Cabe una partida, pero no dos a la vez: el reintento borra la vieja primero.
    const storage = new FakeStorage(size * 1.5);
    let firstTry = true;
    const orig = storage.setItem.bind(storage);
    storage.setItem = (k, v) => {
      if (firstTry && storage.getItem(k) !== null) {
        firstTry = false;
        const e = new Error('lleno');
        e.name = 'QuotaExceededError';
        throw e;
      }
      orig(k, v);
    };
    const store = createLocalSaveStore('test', storage);
    store.save('manual', a);
    const b = createNewGame(2);
    store.save('manual', b);
    expect(store.load('manual')!.seed).toBe(2);
  });

  it('sin almacenamiento disponible: lista vacía y error claro al guardar', () => {
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    delete g.localStorage;
    try {
      const store = createLocalSaveStore('test');
      expect(store.list()).toEqual([]);
      expect(store.load('manual')).toBeNull();
      expect(() => store.save('manual', createNewGame(1))).toThrow(/no permite guardar/);
    } finally {
      if (prev !== undefined) g.localStorage = prev;
    }
  });

  it('usa globalThis.localStorage por defecto', () => {
    const g = globalThis as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = new FakeStorage();
    try {
      const store = createLocalSaveStore();
      store.save('auto', createNewGame(6));
      expect(store.list()[0]!.slot).toBe('auto');
      expect((g.localStorage as FakeStorage).getItem('ciudad-flotante:save:auto')).toMatch(/^\{"meta":/);
    } finally {
      if (prev === undefined) delete g.localStorage;
      else g.localStorage = prev;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Ronda de contenido 2: el cuaderno del Albatros                       */
/* ------------------------------------------------------------------ */

/** Lee una hoja (la añade a la mochila si hace falta) y devuelve el resultado. */
function readPage(sim: Simulation, n: number): ReturnType<Simulation['useItem']> {
  return sim.useItem(slotWith(sim, `pagina_${n}`));
}

describe('cuaderno del Albatros: leer hojas', () => {
  it('la partida nueva trae la hoja 1 en la mochila; leerla la archiva en el diario con sonido y tutorial', () => {
    const { sim, sfx, notes } = setup();
    const inv = sim.state.player.inventory;
    expect(inv.slots[8]).toEqual({ id: 'pagina_1', qty: 1 });
    expect(sim.state.story).toEqual({ pages: [], revealed: false, arrived: false });
    const r = sim.useItem(8);
    expect(r).toEqual({
      ok: true,
      msg: 'Lees «A quien encuentre esto» (pág. 1) y la guardas en el diario (J). Te faltan cuatro hojas para conocer el rumbo',
    });
    // Se consume: el texto completo queda en el Cuaderno del diario.
    expect(inv.slots[8]).toBeNull();
    expect(sim.state.story!.pages).toEqual([1]);
    expect(sim.state.log.at(-1)).toMatchObject({ text: 'Leíste: «A quien encuentre esto» (cuaderno del Albatros, pág. 1)', kind: 'info' });
    expect(sfx).toContain('pagina');
    expect(sim.state.tutorial.done).toContain('cuaderno');
    // La entrada del diario no salta como aviso aparte (el mensaje de la acción ya lo dice).
    expect(notes.filter((n) => /Leíste/.test(n.text))).toHaveLength(0);
  });

  it('una copia de una hoja ya leída se archiva sin repetir la entrada del diario', () => {
    const { sim } = setup();
    sim.useItem(8);
    const inv = sim.state.player.inventory;
    inv.slots[8] = { id: 'pagina_1', qty: 1 };
    const logLen = sim.state.log.length;
    const r = sim.useItem(8);
    expect(r.ok).toBe(true);
    expect(r.msg).toBe('Ya habías leído «A quien encuentre esto»: guardas la copia en el diario (J)');
    expect(inv.slots[8]).toBeNull();
    expect(sim.state.story!.pages).toEqual([1]);
    expect(sim.state.log.length).toBe(logLen);
  });

  it(`con ${PAGES_TO_REVEAL} hojas leídas, en cualquier orden, se conoce el rumbo a Puerto Esperanza (una sola vez)`, () => {
    const { sim, notes } = setup();
    for (const n of [7, 3, 1]) expect(readPage(sim, n).ok).toBe(true);
    expect(readPage(sim, 5).msg).toMatch(/\. Te falta una hoja para conocer el rumbo$/);
    expect(sim.state.story!.revealed).toBe(false);
    const r = readPage(sim, 2);
    expect(r.msg).toBe('Lees «Lo que el mar trae» (pág. 2) y la guardas en el diario (J). ¡Ya sabes cómo llegar a Puerto Esperanza!');
    expect(sim.state.story).toEqual({ pages: [1, 2, 3, 5, 7], revealed: true, arrived: false });
    expect(notes.filter((n) => n.text === STORY_TEXTS.revealed)).toEqual([{ text: STORY_TEXTS.revealed, kind: 'good' }]);
    expect(sim.state.log.some((l) => l.text === STORY_TEXTS.revealed && l.kind === 'good')).toBe(true);
    // Las siguientes ya no repiten el aviso ni cuentan hojas que faltan.
    expect(readPage(sim, 4).msg).toBe('Lees «Los que lo intentaron antes» (pág. 4) y la guardas en el diario (J)');
    expect(notes.filter((n) => n.text === STORY_TEXTS.revealed)).toHaveLength(1);
  });

  it('se lee también desde la barra rápida; dormido no', () => {
    const { sim } = setup();
    const inv = sim.state.player.inventory;
    inv.slots[6] = { id: 'pagina_4', qty: 1 };
    expect(sim.useItem(6).ok).toBe(true);
    expect(sim.state.story!.pages).toEqual([4]);
    goToHour(sim, 23);
    place(sim, INDOOR);
    expect(sim.sleep(mod(sim, 'camarote').id, 0).ok).toBe(true);
    expect(sim.useItem(8).msg).toBe('Estás durmiendo');
    expect(inv.slots[8]).toEqual({ id: 'pagina_1', qty: 1 });
  });

  it('una partida sin `story` (anterior al hilo narrativo) puede leer igualmente', () => {
    const { sim } = setup();
    delete (sim.state as { story?: unknown }).story;
    expect(sim.useItem(8).ok).toBe(true);
    expect(sim.state.story).toEqual({ pages: [1], revealed: false, arrived: false });
  });

  it('storyStatus: hojas leídas con su texto, pistas de las que faltan y resumen', () => {
    const { sim } = setup();
    let st = actions.storyStatus(sim);
    expect(st).toMatchObject({ total: STORY_PAGES.length, needed: PAGES_TO_REVEAL, remaining: PAGES_TO_REVEAL, read: [], revealed: false, arrived: false, finalRegion: FINAL_REGION, finalRegionName: 'Puerto Esperanza' });
    expect(st.pages).toHaveLength(7);
    expect(st.pages[0]).toMatchObject({ n: 1, item: 'pagina_1', read: false, aboard: 'mochila', title: null, text: null });
    expect(st.pages[0]!.hint).toBe('La llevas en la mochila sin leer: clic derecho sobre ella, o F con ella en la barra rápida');
    expect(st.pages[2]).toMatchObject({ region: 'sargazos', regionName: 'Mar de los Sargazos', aboard: null });
    expect(st.pages[2]!.hint).toBe('Suele aparecer en el Mar de los Sargazos: en cofres de naufragio, estructuras, islas y mercantes');
    expect(st.summary).toBe('Aún no has leído ninguna hoja del cuaderno del Albatros. Con cinco sabrás cómo llegar a Puerto Esperanza.');
    // La hoja 2 está en el almacén sin leer; se lee la 1.
    addItem(mod(sim, 'almacen').inventory!, 'pagina_2', 1);
    sim.useItem(8);
    st = actions.storyStatus(sim);
    expect(st.read).toEqual([1]);
    expect(st.pages[0]).toMatchObject({ read: true, title: 'A quien encuentre esto', text: STORY_PAGES[0]!.text, hint: null, aboard: null });
    expect(st.pages[1]).toMatchObject({ read: false, aboard: 'barco', title: null });
    expect(st.pages[1]!.hint).toMatch(/^Está a bordo sin leer/);
    expect(st.missing.map((p) => p.n)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(st.remaining).toBe(4);
    expect(st.summary).toBe('Hojas leídas: 1 de 7. Con cuatro más sabrás cómo llegar a Puerto Esperanza.');
    sim.state.story!.revealed = true;
    st = actions.storyStatus(sim);
    expect(st.remaining).toBe(0);
    expect(st.summary).toBe('Conoces el rumbo a Puerto Esperanza: elígelo en el timón al final de cualquier región (el rumbo de la capitana).');
    sim.state.story!.arrived = true;
    expect(actions.storyStatus(sim).summary).toBe('Llegaste a Puerto Esperanza siguiendo el rumbo de la capitana Duarte. Hojas leídas: 1 de 7.');
  });

  it('concordancia de los objetos nuevos', () => {
    const { sim } = setup();
    expect(actions.itemWithArticle('pagina_3')).toBe('el cuaderno del Albatros, pág. 3');
    expect(actions.itemWithArticle('pescado_ahumado')).toBe('el pescado ahumado');
    expect(actions.itemIndefinite('plano_radar')).toBe('un');
    setNeeds(sim, { hunger: 40 });
    expect(sim.useItem(slotWith(sim, 'pescado_ahumado')).msg).toBe('Comes un pescado ahumado');
  });
});

describe('rumbo de la capitana: Puerto Esperanza', () => {
  it('sin el rumbo revelado no se ofrece y el timón dice cuántas hojas faltan', () => {
    const { sim } = setup();
    expect(voyage.regionWithArticle('esperanza')).toBe('Puerto Esperanza');
    expect(voyage.captainCourseOpen(sim)).toBe(false);
    expect(voyage.nextRegions(sim)).toEqual(['sargazos', 'archipielago']);
    expect(voyage.routeOptions(sim).some((o) => o.captain)).toBe(false);
    expect(sim.chooseRoute('esperanza')).toEqual({ ok: false, msg: 'Aún no sabes cómo llegar a Puerto Esperanza: te faltan cinco hojas del cuaderno del Albatros' });
    sim.state.story!.pages = [1, 2, 3, 4];
    expect(sim.chooseRoute('esperanza').msg).toBe('Aún no sabes cómo llegar a Puerto Esperanza: te falta una hoja del cuaderno del Albatros');
  });

  it('revelado: se ofrece al final de la región como rumbo de la capitana; el piloto no lo toma solo', () => {
    const { sim, notes } = setup();
    sim.state.story!.revealed = true;
    const opts = voyage.routeOptions(sim);
    expect(opts.map((o) => o.id)).toEqual(['sargazos', 'archipielago', 'esperanza']);
    expect(opts.find((o) => o.id === 'esperanza')).toMatchObject({ captain: true, autopilot: false, chosen: false, name: 'Puerto Esperanza' });
    expect(opts.filter((o) => o.captain)).toHaveLength(1);
    expect(voyage.autopilotTarget(sim)).toBe('sargazos');
    const v = sim.state.voyage;
    goToHour(sim, 10);
    v.regionDistance = v.regionLength - 10.2;
    runVoyage(sim, 5);
    expect(v.nextChoices).toEqual(['sargazos', 'archipielago', 'esperanza']);
    expect(notes.map((n) => n.text)).toContain(
      'Nos acercamos al final de Aguas Templadas: elige rumbo en el timón del puente (el Mar de los Sargazos, el Archipiélago Esmeralda o Puerto Esperanza, el rumbo de la capitana)',
    );
    // Sin fijar rumbo, el piloto sigue por la carta.
    runVoyage(sim, 120);
    expect(v.regionId).toBe('sargazos');
  });

  it('fijado: entra en Puerto Esperanza y solo anota la entrada (la llegada la cuenta el evento)', () => {
    const { sim, notes } = setup();
    sim.state.story!.revealed = true;
    const v = sim.state.voyage;
    goToHour(sim, 10);
    v.regionDistance = v.regionLength - 10.2;
    runVoyage(sim, 5);
    expect(sim.chooseRoute('esperanza')).toEqual({ ok: true, msg: 'Rumbo fijado: Puerto Esperanza, el rumbo de la capitana' });
    expect(sim.state.log.at(-1)).toMatchObject({ text: 'Fijamos el rumbo de la capitana Duarte: hacia Puerto Esperanza', kind: 'good' });
    expect(voyage.routeOptions(sim).find((o) => o.id === 'esperanza')!.chosen).toBe(true);
    notes.length = 0;
    runVoyage(sim, 120);
    expect(v.regionId).toBe('esperanza');
    expect(v.route).toEqual(['templadas', 'esperanza']);
    expect(v.regionLength).toBe(REGIONS['esperanza']!.length);
    expect(v.nextChoices).toBeNull();
    expect(v.chosenNext).toBeNull();
    const entry = sim.state.log.filter((l) => /rumbo de la capitana Duarte hacia/.test(l.text));
    expect(entry.map((l) => l.text)).toEqual(['Dejamos atrás Aguas Templadas siguiendo el rumbo de la capitana Duarte hacia Puerto Esperanza.']);
    // De día no hay aviso propio: lo da el evento de llegada. Ningún texto de story.ts sale del viaje.
    expect(notes.some((n) => /rumbo de la capitana/.test(n.text))).toBe(false);
    expect(sim.state.log.some((l) => l.text.includes(STORY_TEXTS.arrival.slice(0, 30)) || /fondeadero de la luz verde/.test(l.text))).toBe(false);
    // Allí no se ofrece a sí misma: sus salidas normales.
    expect(voyage.nextRegions(sim)).toEqual(REGIONS['esperanza']!.next);
    expect(voyage.captainCourseOpen(sim)).toBe(false);
  });

  it('de noche, la entrada se avisa y la luz verde se buscará al amanecer', () => {
    const { sim, notes } = setup();
    sim.state.story!.revealed = true;
    sim.chooseRoute('esperanza');
    goToHour(sim, 22);
    const v = sim.state.voyage;
    v.regionDistance = v.regionLength - 0.2;
    runVoyage(sim, 5);
    expect(v.regionId).toBe('esperanza');
    expect(notes).toContainEqual({ text: 'Dejamos atrás Aguas Templadas siguiendo el rumbo de la capitana Duarte hacia Puerto Esperanza. Al amanecer buscaremos la luz verde.', kind: 'good' });
    expect(voyage.ARRIVAL_DAYLIGHT).toEqual(ARRIVAL_HOURS);
  });

  it('después de llegar ya no se ofrece; si llega a revelarse o a cumplirse con las opciones ya calculadas, se actualizan', () => {
    const { sim } = setup();
    const v = sim.state.voyage;
    v.regionDistance = v.regionLength - 5;
    runVoyage(sim, 1);
    expect(v.nextChoices).toEqual(['sargazos', 'archipielago']);
    sim.state.story!.revealed = true;
    runVoyage(sim, 0.5);
    expect(v.nextChoices).toEqual(['sargazos', 'archipielago', 'esperanza']);
    expect(sim.chooseRoute('esperanza').ok).toBe(true);
    sim.state.story!.arrived = true;
    runVoyage(sim, 0.5);
    expect(v.nextChoices).toEqual(['sargazos', 'archipielago']);
    expect(v.chosenNext).toBeNull();
    expect(voyage.nextRegions(sim)).not.toContain('esperanza');
    expect(sim.chooseRoute('esperanza')).toEqual({ ok: false, msg: 'Ese rumbo no está disponible desde aquí' });
  });

  it('se ofrece al final de cualquier región, también los primeros días y al dar media vuelta', () => {
    const { sim } = setup();
    sim.state.story!.revealed = true;
    const v = sim.state.voyage;
    for (const late of [false, true]) {
      if (late) sim.state.time += voyage.DANGER_GATE_DAYS * MINUTES_PER_DAY;
      for (const r of REGION_LIST) {
        if (r.id === FINAL_REGION) continue;
        v.regionId = r.id;
        const next = voyage.nextRegions(sim);
        expect(next, `${r.id} ${late}`).toContain(FINAL_REGION);
        expect(next.at(-1), r.id).toBe(FINAL_REGION);
        expect(voyage.autopilotTarget(sim), r.id).not.toBe(FINAL_REGION);
      }
    }
  });

  it('integración: con la simulación completa, al entrar de día el evento de llegada se dispara una sola vez', () => {
    const { sim } = setup(11);
    const st = sim.state;
    st.events.nextRollAt = 1e12;
    st.story!.pages = [1, 2, 3, 4, 5];
    st.story!.revealed = true;
    sim.chooseRoute('esperanza');
    goToHour(sim, 9);
    st.voyage.regionDistance = st.voyage.regionLength - 1;
    let arrivedAt: number | null = null;
    for (let i = 0; i < 120 && arrivedAt === null; i++) {
      Object.assign(st.player.needs, { hunger: 100, thirst: 100, energy: 100, health: 100, warmth: 80 });
      sim.tick(1);
      if (st.story!.arrived) arrivedAt = st.time;
    }
    expect(st.voyage.regionId).toBe('esperanza');
    expect(arrivedAt).not.toBeNull();
    expect(st.events.history.filter((h) => h.type === 'llegada')).toHaveLength(1);
    // Ya en el puerto, el rumbo no se vuelve a ofrecer.
    expect(voyage.nextRegions(sim)).not.toContain(FINAL_REGION);
  });
});

describe('motor mejorado', () => {
  it('la hélice de paso variable da su bonificación (moduleStat)', () => {
    const { sim } = setup();
    const motor = addModule(sim, 'motor', 0, 2, 2);
    motor.on = true;
    motor.powered = true;
    expect(voyage.motorBonus(sim)).toBe(3);
    motor.tier = 2;
    expect(voyage.motorBonus(sim)).toBe(5);
    expect(voyage.targetSpeed(sim)).toBeCloseTo(CRUISE_SPEED + 5, 6);
  });
});

describe('radar: aviso de tormenta con 3 h de antelación', () => {
  function addRadar(sim: Simulation): ModuleInstance {
    const m = addModule(sim, 'radar', 2, 4, 1);
    m.on = true;
    m.powered = true;
    return m;
  }

  it('con el radar en marcha, el barómetro avisa 3 h antes, una sola vez, y la lectura dice cuánto falta', () => {
    const { sim, notes } = setup();
    addRadar(sim);
    expect(isRadarActive(sim)).toBe(true);
    weather.forceWeather(sim, 'nublado', 300);
    sim.state.weather.next = 'tormenta';
    let warnedAt: number | null = null;
    let reading = '';
    for (let t = 0; t < 300; t += 0.5) {
      sim.state.time += 0.5;
      weather.tickWeather(sim, 0.5);
      if (warnedAt === null && notes.some((n) => /frente de tormenta/.test(n.text))) warnedAt = sim.state.weather.remaining;
      if (Math.abs(sim.state.weather.remaining - 100) < 0.25) reading = weather.barometer(sim).text;
    }
    expect(warnedAt).not.toBeNull();
    expect(warnedAt!).toBeGreaterThanOrEqual(179);
    expect(warnedAt!).toBeLessThanOrEqual(180);
    const warns = notes.filter((n) => /barómetro/.test(n.text));
    expect(warns).toEqual([{ text: 'El radar detecta un frente de tormenta y el barómetro empieza a caer: llegará en unas tres horas. Prepara el barco y busca refugio', kind: 'warn' }]);
    expect(reading).toBe('Radar: frente de tormenta, llegará en unas dos horas');
    expect(sim.state.weather.kind).toBe('tormenta');
    expect(weather.barometer(sim)).toMatchObject({ trend: 'tormenta', radar: true });
  });

  it('sin energía el radar no ve nada: aviso normal 60–90 min antes', () => {
    const { sim, notes } = setup();
    const radar = addRadar(sim);
    radar.powered = false;
    expect(isRadarActive(sim)).toBe(false);
    weather.forceWeather(sim, 'nublado', 300);
    sim.state.weather.next = 'tormenta';
    let warnedAt: number | null = null;
    for (let t = 0; t < 300; t += 0.5) {
      sim.state.time += 0.5;
      weather.tickWeather(sim, 0.5);
      if (warnedAt === null && notes.some((n) => /barómetro/.test(n.text))) warnedAt = sim.state.weather.remaining;
    }
    expect(warnedAt!).toBeLessThanOrEqual(90);
    expect(notes.some((n) => /radar/i.test(n.text))).toBe(false);
    expect(weather.barometer(sim).radar).toBe(false);
  });

  it('si el radar se enciende con la tormenta ya cerca, avisa en el acto', () => {
    const { sim, notes } = setup();
    const radar = addRadar(sim);
    radar.on = false;
    weather.forceWeather(sim, 'nublado', 100);
    sim.state.weather.next = 'tormenta';
    sim.state.time += 0.5;
    weather.tickWeather(sim, 0.5);
    expect(notes.some((n) => /barómetro/.test(n.text))).toBe(false);
    radar.on = true;
    sim.state.time += 0.5;
    weather.tickWeather(sim, 0.5);
    expect(notes.filter((n) => /barómetro/.test(n.text)).map((n) => n.text)).toEqual([
      'El radar detecta un frente de tormenta y el barómetro empieza a caer: llegará en unas dos horas. Prepara el barco y busca refugio',
    ]);
  });

  it('antelación en palabras', () => {
    expect(weather.etaText(30)).toBe('menos de una hora');
    expect(weather.etaText(70)).toBe('una hora');
    expect(weather.etaText(150)).toBe('unas tres horas');
    expect(weather.etaText(179.5)).toBe('unas tres horas');
    expect(weather.etaText(Number.NaN)).toBe('menos de una hora');
  });
});

describe('confort y enfermería mejorados', () => {
  it('el camarote acogedor repone algo más de energía al dormir; el básico y el dormitorio, lo normal', () => {
    const { sim } = setup();
    place(sim, INDOOR);
    setNeeds(sim, { hunger: 80, thirst: 80, energy: 30, health: 100, warmth: 80 });
    goToHour(sim, 22);
    const cam = mod(sim, 'camarote');
    expect(needs.bedComfortBonus(cam)).toBe(0);
    cam.tier = 2;
    expect(needs.bedComfortBonus(cam)).toBe(2);
    expect(sim.sleep(cam.id, 0).msg).toBe('Te acuestas a dormir en el camarote acogedor…');
    expect(needs.sleepEnergyPerHour(sim)).toBe(NEED_RATES.energyPerHourBed + 2);
    expect(needs.playerConditions(sim).find((c) => c.id === 'acogedor')).toEqual({ id: 'acogedor', label: 'Cama acogedora', kind: 'good' });
    runNeeds(sim, 120);
    expect(sim.state.player.needs.energy).toBeCloseTo(30 + (NEED_RATES.energyPerHourBed + 2) * 2, 5);
    const dorm = mod(sim, 'dormitorio');
    dorm.tier = 2;
    expect(needs.bedComfortBonus(dorm)).toBe(0);
    expect(needs.bedComfortBonus(mod(sim, 'cocina'))).toBe(0);
    expect(needs.bedComfortBonus(null)).toBe(0);
  });

  it('la enfermería equipada cura ×1,5 más rápido (salud y enfermedad)', () => {
    const { sim } = setup();
    place(sim, HOLD);
    setWeather(sim, 'despejado', 22);
    const enf = addModule(sim, 'enfermeria', 0, 1, 0, 2);
    enf.on = true;
    enf.powered = true;
    enf.tier = 2;
    nearBed(sim, enf.id, 0);
    setNeeds(sim, { hunger: 100, thirst: 100, energy: 100, warmth: 90, health: 20 });
    goToHour(sim, 22);
    const r = sim.sleep(enf.id, 0);
    expect(r.msg).toBe('Te tumbas en una camilla de la enfermería equipada…');
    expect(needs.infirmaryMults(sim)).toEqual({ regen: needs.INFIRMARY_REGEN_MULT * 1.5, sickness: needs.INFIRMARY_SICK_MULT * 1.5 });
    expect(needs.healthRatePerHour(sim)).toBeCloseTo(NEED_RATES.healthRegenPerHour * 4.5, 5);
    runNeeds(sim, 60);
    expect(sim.state.player.needs.health).toBeCloseTo(20 + NEED_RATES.healthRegenPerHour * 4.5, 5);
    setNeeds(sim, { hunger: 100, thirst: 100, health: 80 });
    sim.state.player.sick = 10;
    runNeeds(sim, 60);
    expect(sim.state.player.sick).toBeCloseTo(10 - 3, 5);
    // Sin energía, ni la mejora la hace curar más que una cama.
    enf.powered = false;
    expect(needs.infirmaryMults(sim)).toEqual({ regen: 1, sickness: 1 });
  });
});

describe('guardado: campos de la ronda de contenido 2', () => {
  /** Partida tal como la guardaba la versión anterior a las mejoras y al hilo narrativo. */
  function oldSave(seed = 5): Record<string, any> {
    const s = JSON.parse(serialize(createNewGame(seed))) as Record<string, any>;
    delete s.story;
    s.player.inventory.slots[8] = null;
    s.log = s.log.slice(0, 1);
    for (const m of s.ship.modules) {
      delete m.tier;
      delete m.upgrade;
    }
    for (const n of s.npcs) delete n.relations;
    return s;
  }

  it('una partida antigua se migra: nivel 1, sin obras, sin relaciones, historia por defecto y la hoja 1 en la mochila', () => {
    const st = deserialize(JSON.stringify(oldSave()));
    expect(st.version).toBe(SAVE_VERSION);
    expect(st.story).toEqual({ pages: [], revealed: false, arrived: false });
    for (const m of st.ship.modules) {
      expect(m.tier, m.type).toBe(1);
      expect(m.upgrade, m.type).toBeNull();
    }
    for (const n of st.npcs) expect(n.relations).toEqual({});
    expect(st.player.inventory.slots[8]).toEqual({ id: 'pagina_1', qty: 1 });
    expect(st.log.at(-1)!.text).toBe('Ordenando las cartas náuticas del puente aparece una hoja doblada: «Cuaderno del Albatros, pág. 1». La tienes en tu mochila: habrá que leerla.');
    // Se juega con normalidad y la hoja se lee.
    const sim = new Simulation(st);
    expect(sim.useItem(8).ok).toBe(true);
    sim.tick(30);
    expect(sim.state.player.alive).toBe(true);
    expect(tutorial.currentTutorial(sim)?.id).not.toBe('cuaderno');
  });

  it('la hoja 1 nunca se pierde: barra rápida, almacén o una caja; y no se duplica si ya estaba', () => {
    const fullBag = oldSave();
    for (let i = 8; i < PLAYER_SLOTS; i++) fullBag.player.inventory.slots[i] = { id: 'madera', qty: 50 };
    const a = deserialize(JSON.stringify(fullBag));
    expect(a.player.inventory.slots.findIndex((x) => x?.id === 'pagina_1')).toBeLessThan(8);
    expect(a.log.at(-1)!.text).toMatch(/La tienes en tu barra rápida/);

    const full = oldSave();
    for (let i = 0; i < PLAYER_SLOTS; i++) full.player.inventory.slots[i] = { id: 'madera', qty: 50 };
    const b = deserialize(JSON.stringify(full));
    const alm = b.ship.modules.find((m) => m.type === 'almacen')!;
    expect(countItem(alm.inventory!, 'pagina_1')).toBe(1);
    expect(b.log.at(-1)!.text).toMatch(/La tienes en el almacén/);

    const all = oldSave();
    for (let i = 0; i < PLAYER_SLOTS; i++) all.player.inventory.slots[i] = { id: 'madera', qty: 50 };
    const almRaw = all.ship.modules.find((m: { type: string }) => m.type === 'almacen');
    almRaw.inventory.slots = almRaw.inventory.slots.map(() => ({ id: 'chatarra', qty: 50 }));
    const c = deserialize(JSON.stringify(all));
    const crate = c.crates.find((x) => x.inventory.slots.some((sl) => sl?.id === 'pagina_1'))!;
    expect(crate).toBeTruthy();
    expect(crate.pos).toEqual(c.player.pos);
    const ids = [...c.ship.modules.map((m) => m.id), ...c.crates.map((x) => x.id)];
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.nextId).toBeGreaterThan(Math.max(...ids));
    expect(c.log.at(-1)!.text).toMatch(/La tienes en una caja a tus pies/);

    const owned = oldSave();
    owned.ship.modules.find((m: { type: string }) => m.type === 'almacen').inventory.slots[19] = { id: 'pagina_1', qty: 1 };
    const d = deserialize(JSON.stringify(owned));
    expect(d.player.inventory.slots[8]).toBeNull();
    expect(d.log).toHaveLength(1);
  });

  it('partida actual con mejoras, relaciones e historia: ida y vuelta idéntica', () => {
    const { sim } = setup(21);
    const alm = mod(sim, 'almacen');
    alm.tier = 2;
    while (alm.inventory!.slots.length < 32) alm.inventory!.slots.push(null);
    alm.inventory!.slots[30] = { id: 'tela', qty: 3 };
    mod(sim, 'camarote').upgrade = { toTier: 2, progress: 0.4 };
    sim.state.npcs[0]!.relations = { npc2: 35 };
    sim.state.npcs[1]!.relations = { npc1: -12.5 };
    sim.state.story = { pages: [1, 3], revealed: false, arrived: false };
    const json = serialize(sim.state);
    const loaded = deserialize(json);
    expect(loaded).toEqual(JSON.parse(json));
    expect(loaded.ship.modules.find((m) => m.type === 'almacen')!.inventory!.slots[30]).toEqual({ id: 'tela', qty: 3 });
    // Los módulos sin nivel siguen sin él (= nivel 1): nada cambia al cargar.
    expect('tier' in loaded.ship.modules.find((m) => m.type === 'cocina')!).toBe(false);
  });

  it('valida niveles, mejoras en obras, afinidades y hojas; los huecos siguen el nivel', () => {
    const s = JSON.parse(serialize(createNewGame(5))) as Record<string, any>;
    // [dormitorio, camarote, cocina, almacen, …]
    s.ship.modules[0].tier = 'x';
    s.ship.modules[1].upgrade = { toTier: 3, progress: 0.2 };
    s.ship.modules[2].tier = 2;
    s.ship.modules[2].upgrade = { toTier: 3, progress: 0.5 };
    s.ship.modules[3].tier = 9;
    s.ship.modules[3].upgrade = 'roto';
    s.ship.modules[3].inventory.slots[5] = { id: 'tornillos', qty: 7 };
    s.ship.modules[5].upgrade = { toTier: 2, progress: 7 };
    // Avance de las máquinas automáticas (vivero, grúa).
    s.ship.modules[6].prodProgress = -4;
    s.ship.modules[6].prodTarget = 'roto';
    s.ship.modules[7].prodProgress = 'x';
    s.ship.modules[8].prodProgress = 37.5;
    s.ship.modules[8].prodTarget = 12;
    s.npcs[0].relations = { npc2: 500, npc1: 5, raro: 'x' };
    s.npcs[1].relations = 'roto';
    s.story = { pages: [3, 3, 9, 'a', 1, 2, 4, 5], revealed: false, arrived: false };
    const st = restoreState(s);
    expect(st.ship.modules[0]!.tier).toBe(1);
    expect(st.ship.modules[1]!.upgrade).toBeNull();
    expect(st.ship.modules[2]!.tier).toBe(2);
    expect(st.ship.modules[2]!.upgrade).toBeNull();
    expect(st.ship.modules[3]!.tier).toBe(3);
    expect(st.ship.modules[3]!.upgrade).toBeNull();
    expect(st.ship.modules[3]!.inventory!.slots).toHaveLength(48);
    expect(st.ship.modules[3]!.inventory!.slots[5]).toEqual({ id: 'tornillos', qty: 7 });
    // Una mejora en obras válida se conserva (progreso limitado a 1); mientras dura, el banco
    // sigue en el nivel 1 con su bandeja de 6 huecos. Terminado (nivel 2), tiene 10.
    expect(st.ship.modules[5]!.upgrade).toEqual({ toTier: 2, progress: 1 });
    expect(st.ship.modules[5]!.inventory!.slots).toHaveLength(6);
    expect(st.ship.modules[6]).toMatchObject({ prodProgress: 0, prodTarget: null });
    expect(st.ship.modules[7]!.prodProgress).toBe(0);
    expect(st.ship.modules[8]).toMatchObject({ prodProgress: 37.5, prodTarget: 12 });
    expect('prodProgress' in st.ship.modules[9]!).toBe(false);
    expect(st.npcs[0]!.relations).toEqual({ npc2: 100 });
    expect(st.npcs[1]!.relations).toEqual({});
    expect(st.story).toEqual({ pages: [1, 2, 3, 4, 5], revealed: true, arrived: false });
    const s2 = JSON.parse(serialize(createNewGame(6))) as Record<string, any>;
    s2.ship.modules[5].tier = 2;
    s2.story = { pages: [1], revealed: false, arrived: true };
    const st2 = restoreState(s2);
    expect(st2.ship.modules[5]!.inventory!.slots).toHaveLength(10);
    expect(st2.story).toEqual({ pages: [1], revealed: true, arrived: true });
  });
});

describe('tutorial: cuaderno y mejoras', () => {
  it('«cuaderno» llega tras comer si llevas una hoja sin leer, y leerla lo completa', () => {
    const { sim } = setup();
    for (const id of ['mover', 'gancho', 'comer']) tutorial.markTutorial(sim, id);
    sim.state.time += 30;
    const step = tutorial.currentTutorial(sim)!;
    expect(step.id).toBe('cuaderno');
    expect(step.text).toMatch(/clic derecho/);
    expect(step.text).toMatch(/pulsa F\.$/);
    expect(tutorial.hasUnreadPage(sim)).toBe(true);
    // Guardada en el almacén ya no está en la mochila: el consejo espera.
    const inv = sim.state.player.inventory;
    inv.slots[8] = null;
    addItem(mod(sim, 'almacen').inventory!, 'pagina_1', 1);
    expect(tutorial.currentTutorial(sim)?.id).toBe('almacen');
    // Una hoja ya leída tampoco cuenta.
    sim.state.story!.pages = [2];
    inv.slots[9] = { id: 'pagina_2', qty: 1 };
    expect(tutorial.hasUnreadPage(sim)).toBe(false);
    inv.slots[10] = { id: 'pagina_3', qty: 1 };
    expect(tutorial.currentTutorial(sim)?.id).toBe('cuaderno');
    expect(sim.useItem(10).ok).toBe(true);
    expect(sim.state.tutorial.done).toContain('cuaderno');
  });

  it('las hojas ya leídas (partida cargada) dan el paso por hecho', () => {
    const { sim } = setup();
    sim.state.story!.pages = [1];
    tutorial.tickTutorial(sim, 0.5);
    expect(sim.state.tutorial.done).toContain('cuaderno');
  });

  it('«mejorar» llega después de construir y con una mejora que se pueda pagar; con el almacén lleno es oportuno', () => {
    const { sim } = setup();
    for (const s of tutorial.TUTORIAL_STEPS) if (s.id !== 'mejorar' && s.id !== 'construir') tutorial.markTutorial(sim, s.id);
    sim.state.time += 30;
    goToHour(sim, 12);
    setNeeds(sim, { hunger: 90, thirst: 90, energy: 90 });
    expect(tutorial.currentTutorial(sim)?.id).toBe('construir');
    tutorial.markTutorial(sim, 'construir');
    sim.state.time += 30;
    // Camarote acogedor: 4 de tela y 6 de madera, que hay en el almacén inicial.
    expect(tutorial.affordableUpgrades(sim).map((m) => m.type)).toContain('camarote');
    const step = tutorial.currentTutorial(sim)!;
    expect(step.id).toBe('mejorar');
    expect(step.urgent).toBeUndefined();
    expect(step.text).toMatch(/modo construcción \(B\), la herramienta Mejorar \(U\)/);
    // Sin materiales no hay nada que mejorar: no se muestra.
    const stash = sim.state.ship.modules.map((m) => m.inventory?.slots.slice() ?? null);
    const bag = sim.state.player.inventory.slots.slice();
    for (const m of sim.state.ship.modules) if (m.inventory) m.inventory.slots.fill(null);
    sim.state.player.inventory.slots.fill(null);
    expect(tutorial.affordableUpgrades(sim)).toEqual([]);
    expect(tutorial.currentTutorial(sim)).toBeNull();
    // Almacén lleno y con lo necesario para ampliarlo (12 de madera y 6 de tornillería): oportuno.
    const alm = mod(sim, 'almacen');
    alm.inventory!.slots.fill({ id: 'chatarra', qty: 50 });
    alm.inventory!.slots[0] = { id: 'madera', qty: 12 };
    alm.inventory!.slots[1] = { id: 'tornillos', qty: 6 };
    const urgent = tutorial.currentTutorial(sim)!;
    expect(urgent.id).toBe('mejorar');
    expect(urgent.urgent).toBe(true);
    // Un módulo averiado, ardiendo o con otra mejora en obras no cuenta.
    alm.status = 'broken';
    expect(tutorial.affordableUpgrades(sim).some((m) => m.id === alm.id)).toBe(false);
    alm.status = 'active';
    sim.state.ship.modules.forEach((m, i) => m.inventory && (m.inventory.slots = stash[i] ?? m.inventory.slots));
    sim.state.player.inventory.slots = bag;
    // Encargar una mejora (aunque la encargue otro sistema) completa el paso.
    mod(sim, 'camarote').upgrade = { toTier: 2, progress: 0 };
    tutorial.tickTutorial(sim, 0.5);
    expect(sim.state.tutorial.done).toContain('mejorar');
    expect(tutorial.tutorialProgress(sim).complete).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Integración: vida a bordo                                           */
/* ------------------------------------------------------------------ */

describe('integración: varios días a bordo', () => {
  it('un jugador que come, bebe y duerme sobrevive 3 días con valores siempre válidos', () => {
    for (const seed of [1, 8, 99]) {
      const { sim } = setup(seed);
      const st = sim.state;
      addItem(st.player.inventory, 'conserva', 15);
      const cam = mod(sim, 'camarote');
      const tank = sim.layout.props.find((pp) => pp.interact === 'deposito')!;
      let slept = 0;
      let drank = 0;
      let ate = 0;
      const errors: string[] = [];
      for (let i = 0; i < 3 * 24 * 4 && st.player.alive; i++) {
        const p = st.player;
        const n = p.needs;
        if (!p.sleeping) {
          if (n.thirst < 50 && st.utilities.waterL >= 1) {
            place(sim, { x: tank.x, y: tank.y, z: tank.z + tank.hz + 0.6 });
            if (sim.drinkFromTank().ok) drank++;
          }
          if (n.hunger < 50) {
            const slot = st.player.inventory.slots.findIndex((x) => x?.id === 'conserva');
            if (slot >= 0 && sim.useItem(slot).ok) ate++;
          }
          const h = hourOf(st.time);
          if ((h >= 21 || h < 5) && !p.sleeping) {
            nearBed(sim, cam.id, 0);
            if (sim.sleep(cam.id, 0).ok) slept++;
          } else {
            place(sim, INDOOR);
          }
        }
        sim.tick(15);
        for (const [k, v] of Object.entries(st.player.needs)) if (!(v >= 0 && v <= 100)) errors.push(`${seed}/${i}: ${k}=${v}`);
        if (!Number.isFinite(st.weather.temperature) || !Number.isFinite(st.voyage.distance)) errors.push(`${seed}/${i}: mundo inválido`);
      }
      expect(errors.slice(0, 5)).toEqual([]);
      expect(st.player.alive, `semilla ${seed}: ${st.player.deathCause}`).toBe(true);
      expect(st.player.stats.daysSurvived).toBeGreaterThanOrEqual(2);
      expect(slept).toBeGreaterThanOrEqual(2);
      expect(drank).toBeGreaterThan(5);
      expect(ate).toBeGreaterThan(3);
      expect(st.voyage.route.length).toBeGreaterThanOrEqual(2);
    }
    // Tres semillas × tres días de simulación completa: con la batería en paralelo y la máquina
    // cargada puede pasar de los 5 s por defecto sin que nada vaya mal.
  }, 30_000);
});

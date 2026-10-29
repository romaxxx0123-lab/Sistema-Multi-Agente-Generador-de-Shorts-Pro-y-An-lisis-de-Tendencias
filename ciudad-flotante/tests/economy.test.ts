/**
 * Tests de la economía del barco (área sim-economy): energía, agua, fabricación, cocina, huerto,
 * construcción, demolición, ampliación del casco, reparación y desgaste.
 *
 * Usan la simulación real (`new Simulation(createNewGame(seed))` + `sim.tick`). Para que el azar
 * de otros sistemas (clima, eventos, habitantes) no interfiera, cada prueba fija el clima, aplaza
 * el director de eventos, retira a los habitantes (salvo cuando se prueban) y mantiene al jugador
 * con las necesidades cubiertas.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CROPS } from '../src/data/crops';
import { HULL_EXPANSION, moduleDef } from '../src/data/modules';
import { RECIPES, recipesFor } from '../src/data/recipes';
import { MINUTES_PER_DAY, SHIP_MAX_LENGTH, SHIP_START_LENGTH } from '../src/sim/constants';
import * as construction from '../src/sim/construction';
import * as events from '../src/sim/events';
import { addItem, countItem, createInventory } from '../src/sim/inventory';
import { AGENT_RADIUS } from '../src/sim/nav';
import { PLAYER_RADIUS } from '../src/sim/physics';
import { createNewGame, makeNpc } from '../src/sim/newGame';
import { getCell, moduleCenter } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import * as stations from '../src/sim/stations';
import { daylight } from '../src/sim/time';
import type { ModuleInstance, WeatherKind } from '../src/sim/types';
import * as utilities from '../src/sim/utilities';

/* ------------------------------------------------------------------ */
/* Utilidades de prueba                                                */
/* ------------------------------------------------------------------ */

interface TestSim {
  sim: Simulation;
  notes: { text: string; kind: string }[];
}

/** Fija el clima, aplaza los eventos aleatorios y mantiene al jugador sano. */
function freeze(sim: Simulation, weather: WeatherKind = 'despejado'): void {
  const st = sim.state;
  st.weather.kind = weather;
  st.weather.next = weather;
  st.weather.remaining = 1e9;
  st.events.nextRollAt = 1e12;
  Object.assign(st.player.needs, { hunger: 100, thirst: 100, energy: 100, health: 100, warmth: 80 });
  st.player.sick = 0;
  st.player.alive = true;
}

function setup(seed = 7, opts: { npcs?: boolean } = {}): TestSim {
  const sim = new Simulation(createNewGame(seed));
  if (!opts.npcs) sim.state.npcs = [];
  freeze(sim);
  const notes: { text: string; kind: string }[] = [];
  sim.bus.on('notify', (n) => notes.push(n));
  return { sim, notes };
}

/** Avanza `minutes` minutos en bloques (máx. 30), llamando a `each` antes de cada bloque. */
function run(sim: Simulation, minutes: number, each?: () => void, chunk = 30): void {
  let left = minutes;
  while (left > 1e-9) {
    const h = Math.min(chunk, left);
    freeze(sim, sim.state.weather.kind);
    each?.();
    sim.tick(h);
    left -= h;
  }
}

/** Lleva el reloj hacia delante hasta la hora `h` (nunca hacia atrás). */
function goToHour(sim: Simulation, h: number): void {
  const st = sim.state;
  let t = Math.floor(st.time / MINUTES_PER_DAY) * MINUTES_PER_DAY + h * 60;
  if (t < st.time) t += MINUTES_PER_DAY;
  st.time = t;
}

function give(sim: Simulation, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(sim.state.player.inventory, id, n);
}

function mod(sim: Simulation, type: string): ModuleInstance {
  const m = sim.state.ship.modules.find((mm) => mm.type === type);
  if (!m) throw new Error(`No hay ${type}`);
  return m;
}

/** Coloca un módulo (paga del jugador/almacenes) y espera a que termine la obra. */
function build(sim: Simulation, type: string, level: number, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): ModuleInstance {
  const r = sim.placeModule(type, level, x, z, rot);
  expect(r.ok, r.msg).toBe(true);
  const m = sim.state.ship.modules.find((mm) => mm.id === r.moduleId)!;
  run(sim, moduleDef(type).buildTime + 1, undefined, 10);
  expect(m.status).toBe('active');
  return m;
}

function texts(notes: { text: string }[], re: RegExp): string[] {
  return notes.map((n) => n.text).filter((t) => re.test(t));
}

const MATERIALS = { placa_metal: 30, tornillos: 60, componentes: 10, celula_solar: 4, madera: 40, tela: 10 };

afterEach(() => {
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ */
/* Red eléctrica                                                       */
/* ------------------------------------------------------------------ */

describe('red eléctrica', () => {
  it('barco inicial: sin consumo ni generación; agua con depósito + colector', () => {
    const { sim } = setup();
    sim.tick(1);
    const u = sim.state.utilities;
    expect(u.power.demand).toBe(0);
    expect(u.power.generation).toBe(0);
    expect(u.power.satisfaction).toBe(1);
    expect(u.power.capacityKWh).toBe(0);
    expect(u.water.capacityL).toBe(120 + 20);
    expect(u.waterL).toBeCloseTo(90, 5); // agua inicial
  });

  it('el generador quema combustible de su ranura y alimenta la potabilizadora', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    const u = sim.state.utilities;

    // Sin combustible: la potabilizadora pide 2 kW y nadie los da.
    run(sim, 5);
    expect(gen.powered).toBe(false);
    expect(u.power.demand).toBeCloseTo(2, 5);
    expect(u.power.satisfaction).toBe(0);
    expect(pot.powered).toBe(false);
    const w0 = u.waterL;
    run(sim, 30);
    expect(u.waterL).toBeCloseTo(w0, 5);
    expect(texts(notes, /generador se ha quedado sin combustible/)).toHaveLength(1);

    // Con 2 maderas (40 min cada una).
    addItem(gen.fuelInv!, 'madera', 2);
    sim.tick(0.5);
    expect(gen.powered).toBe(true);
    expect(u.power.generation).toBeCloseTo(5, 5);
    expect(u.power.satisfaction).toBe(1);
    expect(pot.powered).toBe(true);
    expect(countItem(gen.fuelInv, 'madera')).toBe(1);
    expect(gen.fuelBurn).toBeCloseTo(39.5, 5);

    const w1 = u.waterL;
    expect(u.water.capacityL - w1).toBeGreaterThan(moduleDef('potabilizadora').waterGen!); // hay hueco
    run(sim, 60);
    expect(u.waterL - w1).toBeCloseTo(moduleDef('potabilizadora').waterGen!, 1); // L/h a plena potencia
    expect(countItem(gen.fuelInv, 'madera')).toBe(0);
    expect(gen.fuelBurn).toBeCloseTo(80 - 60.5, 5);

    // Aviso previo de poco combustible (< 30 min) y, al acabarse a los 80 min, aviso (una vez).
    expect(texts(notes, /^Al generador le queda combustible para unos \d+ min$/)).toHaveLength(1);
    run(sim, 30);
    expect(gen.powered).toBe(false);
    expect(u.power.satisfaction).toBe(0);
    expect(texts(notes, /generador se ha quedado sin combustible/)).toHaveLength(2);
  });

  it('las baterías guardan el excedente y cubren la demanda con el generador apagado', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    build(sim, 'bateria', 0, 2, 0);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    const u = sim.state.utilities;
    sim.state.utilities.waterL = 0;
    expect(u.power.capacityKWh).toBe(25);

    addItem(gen.fuelInv!, 'combustible', 1); // 360 min
    run(sim, 60);
    // 5 kW − 2 kW de la potabilizadora = 3 kW de carga.
    expect(u.batteryKWh).toBeCloseTo(3, 1);
    expect(utilities.machineLoad(sim, mod(sim, 'bateria'))).toBeCloseTo(3 / utilities.BATTERY_MAX_KW, 3);

    expect(sim.togglePower(gen.id)).toMatchObject({ ok: true, msg: 'Generador apagado' });
    const lowWarnings = texts(notes, /Falta energía/).length;
    run(sim, 60);
    expect(gen.powered).toBe(false);
    expect(u.power.generation).toBe(0);
    expect(u.power.satisfaction).toBe(1);
    expect(pot.powered).toBe(true);
    expect(u.batteryKWh).toBeCloseTo(1, 1);

    run(sim, 45);
    expect(u.batteryKWh).toBe(0);
    expect(u.power.satisfaction).toBe(0);
    expect(pot.powered).toBe(false);
    expect(texts(notes, /Falta energía/)).toHaveLength(lowWarnings + 1);
    expect(texts(notes, /Falta energía/).at(-1)).toBe('Falta energía: la potabilizadora se detiene. Revisa generadores, paneles y baterías');

    // Al volver a encender, el generador recarga hasta llenar las baterías (no pierde el combustible).
    expect(sim.togglePower(gen.id).msg).toBe('Generador encendido');
    run(sim, 10);
    expect(gen.powered).toBe(true);
    expect(u.power.satisfaction).toBe(1);
  });

  it('sin combustible no avisa mientras las baterías cubren el déficit', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    build(sim, 'generador', 0, 1, 0);
    build(sim, 'bateria', 0, 2, 0);
    sim.state.utilities.batteryKWh = 20;
    build(sim, 'potabilizadora', 0, 3, 0);
    sim.state.utilities.waterL = 0;
    run(sim, 30);
    expect(sim.state.utilities.power.satisfaction).toBe(1);
    expect(texts(notes, /sin combustible/)).toHaveLength(0);
  });

  it('el generador no arranca si las baterías están casi llenas y no hay déficit', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    build(sim, 'bateria', 0, 2, 0);
    addItem(gen.fuelInv!, 'madera', 5);
    sim.state.utilities.batteryKWh = 24; // 96 % > 90 %
    run(sim, 30);
    expect(gen.powered).toBe(false);
    expect(countItem(gen.fuelInv, 'madera')).toBe(5);
    sim.state.utilities.batteryKWh = 10; // por debajo del 90 %: arranca y carga hasta llenar
    run(sim, 30);
    expect(gen.powered).toBe(true);
    expect(sim.state.utilities.batteryKWh).toBeGreaterThan(10);
  });

  it('el panel solar produce según la luz y las nubes, y nada de noche', () => {
    const { sim } = setup();
    sim.state.unlocks.push('solar');
    give(sim, MATERIALS);
    const panel = build(sim, 'panel_solar', 1, 9, 3);
    const u = sim.state.utilities;

    goToHour(sim, 12);
    sim.tick(0.5);
    const expected = 1.6 * daylight(sim.state.time) * (1 - utilities.SOLAR_CLOUD_LOSS * sim.state.weather.cloudiness);
    expect(expected).toBeGreaterThan(1);
    expect(u.power.generation).toBeCloseTo(expected, 6);
    expect(panel.powered).toBe(true);

    // Cielo muy nublado.
    sim.state.weather.cloudiness = 1;
    sim.state.weather.kind = 'nublado';
    sim.tick(0.5);
    const cloudy = 1.6 * daylight(sim.state.time) * (1 - utilities.SOLAR_CLOUD_LOSS * sim.state.weather.cloudiness);
    expect(u.power.generation).toBeCloseTo(cloudy, 6);
    expect(u.power.generation).toBeLessThan(expected);

    goToHour(sim, 0);
    sim.tick(0.5);
    expect(u.power.generation).toBe(0);
    expect(panel.powered).toBe(false);
  });

  it('con poca energía las máquinas van a velocidad × satisfacción', () => {
    const { sim } = setup();
    sim.state.unlocks.push('solar', 'agua');
    give(sim, MATERIALS);
    build(sim, 'panel_solar', 1, 9, 3);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    const u = sim.state.utilities;
    goToHour(sim, 12);
    sim.tick(0.5);
    const s = u.power.satisfaction;
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
    expect(pot.powered).toBe(true);
    const before = u.waterL;
    sim.tick(0.5);
    expect(u.waterL - before).toBeCloseTo((moduleDef('potabilizadora').waterGen! * u.power.satisfaction * 0.5) / 60, 6);
  });

  it('una máquina dañada (condición < 50) rinde un 30 % menos', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    build(sim, 'potabilizadora', 0, 3, 0);
    sim.state.utilities.waterL = 0;
    addItem(gen.fuelInv!, 'combustible', 1);
    gen.condition = 40;
    sim.tick(0.5);
    expect(sim.state.utilities.power.generation).toBeCloseTo(5 * utilities.DAMAGED_MACHINE_FACTOR, 6);
  });

  it('togglePower: interruptores de generadores y consumidores', () => {
    const { sim } = setup();
    sim.state.unlocks.push('agua');
    give(sim, MATERIALS);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    sim.state.utilities.waterL = 0;
    sim.tick(0.5);
    expect(sim.state.utilities.power.demand).toBeCloseTo(2, 6);
    expect(sim.togglePower(pot.id)).toEqual({ ok: true, msg: 'Potabilizadora apagada' });
    sim.tick(0.5);
    expect(sim.state.utilities.power.demand).toBe(0);
    expect(pot.powered).toBe(false);
    expect(sim.togglePower(mod(sim, 'banco_trabajo').id).ok).toBe(false);
    expect(sim.togglePower(9999).ok).toBe(false);
    const r = sim.placeModule('potabilizadora', 0, 4, 0, 0);
    expect(r.ok).toBe(true);
    expect(sim.togglePower(r.moduleId!).msg).toMatch(/obras/);
  });

  it('el motor pide energía solo navegando', () => {
    const { sim } = setup();
    sim.state.unlocks.push('motor');
    give(sim, { ...MATERIALS, pieza_mecanica: 4 });
    const motor = build(sim, 'motor', 0, 1, 1, 0);
    sim.state.voyage.anchoredUntil = null;
    sim.tick(0.5);
    expect(utilities.currentDemand(sim, motor)).toBe(4);
    sim.state.voyage.anchoredUntil = sim.state.time + 600;
    sim.tick(0.5);
    expect(utilities.currentDemand(sim, motor)).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Red de agua                                                         */
/* ------------------------------------------------------------------ */

describe('red de agua', () => {
  it('el colector recoge 10 L/h × lluvia a cielo abierto', () => {
    const { sim } = setup();
    // Los habitantes beben del depósito (SISTEMAS §11): fuera para medir solo el colector.
    sim.state.npcs = [];
    const u = sim.state.utilities;
    const w0 = u.waterL;
    for (let i = 0; i < 120; i++) {
      freeze(sim, 'lluvia');
      sim.state.weather.rain = 1;
      sim.tick(0.5);
    }
    expect(u.waterL - w0).toBeGreaterThan(9.8);
    expect(u.waterL - w0).toBeLessThanOrEqual(10.0001);
    expect(u.water.inPerHour).toBeGreaterThan(9);
    // Sin lluvia no entra nada (clima seco: con el clima real la lluvia tiende a su objetivo).
    freeze(sim, 'despejado');
    run(sim, 60, () => {
      sim.state.weather.rain = 0;
    });
    const w1 = u.waterL;
    run(sim, 60, () => {
      sim.state.weather.rain = 0;
    });
    expect(u.waterL).toBeCloseTo(w1, 6);
  });

  it('el colector no recoge si no está a cielo abierto (layout.sky)', () => {
    const { sim } = setup();
    const col = mod(sim, 'colector');
    const cell = getCell(sim.layout, col.level, col.x, col.z)!;
    expect(cell.sky).toBe(true);
    expect(utilities.moduleHasSky(sim, col)).toBe(true);
    // Un huerto en la bodega es interior (con el plano de lámparas se puede construir allí).
    sim.state.unlocks.push('invernadero');
    give(sim, MATERIALS);
    const h = build(sim, 'huerto', 0, 0, 0);
    expect(utilities.moduleHasSky(sim, h)).toBe(false);
  });

  it('los depósitos tienen tope: lo que sobra se pierde', () => {
    const { sim } = setup();
    const u = sim.state.utilities;
    u.waterL = 139.5;
    for (let i = 0; i < 20; i++) {
      freeze(sim, 'lluvia');
      sim.state.weather.rain = 1;
      sim.tick(0.5);
    }
    expect(u.waterL).toBe(140);
  });

  it('fugas (6 L/h) y depósitos dañados (1 L/h) pierden agua', () => {
    const { sim } = setup();
    const u = sim.state.utilities;
    const dep = mod(sim, 'deposito');
    dep.leak = true;
    const w0 = u.waterL;
    run(sim, 60);
    expect(w0 - u.waterL).toBeCloseTo(6, 4);
    expect(u.water.outPerHour).toBeGreaterThan(5);
    dep.leak = false;
    dep.condition = 40;
    const w1 = u.waterL;
    run(sim, 60);
    expect(w1 - u.waterL).toBeCloseTo(1, 4);
  });

  it('avisa cuando queda poca agua (una vez, se rearma al recuperarse)', () => {
    const { sim, notes } = setup();
    const u = sim.state.utilities;
    u.waterL = 30;
    mod(sim, 'deposito').leak = true;
    run(sim, 60 * 2);
    expect(texts(notes, /^Queda poca agua en los depósitos \(\d+ L\)$/)).toHaveLength(1);
    u.waterL = 100;
    run(sim, 1);
    u.waterL = 10;
    run(sim, 1);
    expect(texts(notes, /Queda poca agua/)).toHaveLength(2);
  });

  it('el agua nunca baja de 0 y se avisa al vaciarse (una vez)', () => {
    const { sim, notes } = setup();
    const u = sim.state.utilities;
    u.waterL = 1;
    mod(sim, 'deposito').leak = true;
    run(sim, 60);
    expect(u.waterL).toBe(0);
    expect(texts(notes, /depósitos de agua están vacíos/)).toHaveLength(1);
    expect(sim.state.log.some((l) => /vacíos/.test(l.text))).toBe(true);
  });

  it('avisa de depósitos vacíos aunque otro sistema gaste los últimos litros', () => {
    const { sim, notes } = setup();
    sim.tick(0.5);
    sim.state.utilities.waterL = 0.2; // p. ej. el jugador bebe lo último
    sim.tick(0.5);
    expect(texts(notes, /depósitos de agua están vacíos/)).toHaveLength(1);
    sim.tick(0.5);
    expect(texts(notes, /depósitos de agua están vacíos/)).toHaveLength(1);
    sim.state.utilities.waterL = 20; // se rearma al recuperarse
    sim.tick(0.5);
    sim.state.utilities.waterL = 0;
    sim.tick(0.5);
    expect(texts(notes, /depósitos de agua están vacíos/)).toHaveLength(2);
  });

  it('el resumen cuenta el consumo de otros sistemas (beber, huertos)', () => {
    const { sim } = setup();
    const u = sim.state.utilities;
    for (let i = 0; i < 60; i++) {
      freeze(sim);
      u.waterL -= 0.05; // alguien bebe 6 L/h
      sim.tick(0.5);
    }
    expect(u.water.outPerHour).toBeGreaterThan(5);
    expect(u.water.outPerHour).toBeLessThan(6.01);
  });

  it('desmontar un depósito reduce la capacidad y avisa del agua perdida', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    const dep2 = build(sim, 'deposito', 1, 9, 3);
    sim.tick(0.5);
    expect(sim.state.utilities.water.capacityL).toBe(260);
    sim.state.utilities.waterL = 200;
    const r = sim.demolish(dep2.id);
    expect(r.ok).toBe(true);
    expect(r.msg).toMatch(/Se pierden 60 L de agua/);
    expect(sim.state.utilities.water.capacityL).toBe(140);
    expect(sim.state.utilities.waterL).toBe(140);
  });
});

/* ------------------------------------------------------------------ */
/* Fabricación                                                         */
/* ------------------------------------------------------------------ */

describe('fabricación', () => {
  it('recetas disponibles por estación, con bloqueo y faltantes', () => {
    const { sim } = setup();
    const hand = sim.stationRecipes(null);
    expect(hand.map((r) => r.recipe.id)).toEqual(recipesFor('mano').map((r) => r.id));
    const vend = hand.find((r) => r.recipe.id === 'vendaje')!;
    expect(vend.canCraft).toBe(true); // tela del almacén
    const cuerda = hand.find((r) => r.recipe.id === 'cuerda')!;
    expect(cuerda.canCraft).toBe(false);
    expect(cuerda.missing).toEqual({ fibra: 3 });
    expect(cuerda.reason).toBe('Faltan: 3× Fibra vegetal');

    const banco = sim.stationRecipes(mod(sim, 'banco_trabajo').id);
    expect(banco.map((r) => r.recipe.id)).toEqual(recipesFor('banco').map((r) => r.id));
    expect(banco.every((r) => r.station === 'banco')).toBe(true);

    const cocina = sim.stationRecipes(mod(sim, 'cocina').id);
    expect(cocina.find((r) => r.recipe.id === 'pescado_asado')!.canCraft).toBe(true);
    expect(cocina.find((r) => r.recipe.id === 'destilar')!.missing).toEqual({ cubo_agua: 1 });

    // Módulos que no son estaciones: sin recetas.
    expect(sim.stationRecipes(mod(sim, 'almacen').id)).toEqual([]);
  });

  it('las recetas del taller están bloqueadas sin plano', () => {
    const { sim } = setup();
    sim.state.unlocks.push('taller');
    give(sim, MATERIALS);
    const t = build(sim, 'taller', 1, 8, 2, 0);
    sim.state.unlocks = sim.state.unlocks.filter((k) => k !== 'taller');
    const recs = sim.stationRecipes(t.id);
    expect(recs.find((r) => r.recipe.id === 'pieza_mecanica')!.locked).toBe(true);
    expect(recs.find((r) => r.recipe.id === 'pieza_mecanica')!.reason).toMatch(/Plano: Taller mecánico/);
    expect(sim.queueCraft(t.id, 'pieza_mecanica').ok).toBe(false);
    sim.state.unlocks.push('taller');
    expect(sim.stationRecipes(t.id).find((r) => r.recipe.id === 'pieza_mecanica')!.locked).toBe(false);
    expect(sim.stationRecipes(t.id).find((r) => r.recipe.id === 'celula_solar')!.locked).toBe(true);
  });

  it('fabricar a mano: paga con el jugador y luego con los almacenes', () => {
    const { sim } = setup();
    const almacen = mod(sim, 'almacen');
    expect(countItem(sim.state.player.inventory, 'tela')).toBe(0);
    const r = sim.craftByHand('vendaje');
    expect(r.ok, r.msg).toBe(true);
    expect(countItem(sim.state.player.inventory, 'vendaje')).toBe(2);
    expect(countItem(almacen.inventory, 'tela')).toBe(3);
    expect(sim.state.player.stats.itemsCrafted).toBe(2);
    expect(sim.state.tutorial.done).toContain('fabricar');

    // Con tela en el inventario, se paga primero con la del jugador.
    give(sim, { tela: 1 });
    sim.craftByHand('vendaje');
    expect(countItem(sim.state.player.inventory, 'tela')).toBe(0);
    expect(countItem(almacen.inventory, 'tela')).toBe(3);

    expect(sim.craftByHand('martillo').msg).toBe('Hay que fabricarlo en el banco de trabajo');
    expect(sim.craftByHand('cuerda').msg).toBe('Faltan: 3× Fibra vegetal');
    expect(sim.craftByHand('nada').ok).toBe(false);
  });

  it('cola del banco de trabajo de principio a fin', () => {
    const { sim, notes } = setup();
    const banco = mod(sim, 'banco_trabajo');
    const almacen = mod(sim, 'almacen');
    const r = sim.queueCraft(banco.id, 'tornillos', 3);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toMatch(/Tornillería ×3/);
    expect(banco.queue).toHaveLength(3);
    expect(countItem(almacen.inventory, 'chatarra')).toBe(7); // se paga al encolar

    sim.tick(3);
    expect(banco.queue[0]!.progress).toBeCloseTo(3, 6);
    const st = stations.stationStatus(sim, banco.id)!;
    expect(st.working).toBe(true);
    expect(st.status).toBe('Trabajando');
    expect(st.jobs[0]!.progress).toBeCloseTo(0.5, 6);
    expect(st.jobs[2]!.etaMin).toBeCloseTo(15, 6);

    sim.tick(3);
    expect(banco.queue).toHaveLength(2);
    expect(countItem(banco.inventory, 'tornillos')).toBe(4);
    expect(texts(notes, /^Tornillería lista en el banco de trabajo$/)).toHaveLength(1);

    run(sim, 12);
    expect(banco.queue).toHaveLength(0);
    expect(countItem(banco.inventory, 'tornillos')).toBe(12);
    expect(sim.state.player.stats.itemsCrafted).toBe(12);
    expect(sim.state.tutorial.done).toContain('fabricar');
    expect(stations.stationStatus(sim, banco.id)!.status).toBe('En espera');
  });

  it('máximo 8 trabajos; si no alcanza para todos encola los que puede', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    const r = sim.queueCraft(banco.id, 'tornillos', 20);
    expect(r.ok).toBe(true);
    expect(banco.queue).toHaveLength(8);
    expect(countItem(mod(sim, 'almacen').inventory, 'chatarra')).toBe(2);
    expect(sim.queueCraft(banco.id, 'tornillos').msg).toMatch(/cola está llena/);
    expect(sim.stationRecipes(banco.id).every((x) => !x.canCraft)).toBe(true);

    const b = setup(8).sim;
    const banco2 = mod(b, 'banco_trabajo');
    const r2 = b.queueCraft(banco2.id, 'placa_metal', 5); // 10 chatarra → 3 placas
    expect(r2.ok).toBe(true);
    expect(r2.msg).toMatch(/solo alcanzaba para 3/);
    expect(banco2.queue).toHaveLength(3);
    expect(b.queueCraft(banco2.id, 'placa_metal').msg).toMatch(/^Faltan: 2× Chatarra$/);
  });

  it('queueCraft valida estación, receta y estado', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    expect(sim.queueCraft(banco.id, 'pescado_asado').msg).toBe('Esto se fabrica en la cocina');
    expect(sim.queueCraft(banco.id, 'vendaje').msg).toBe('Esto se fabrica a mano');
    expect(sim.queueCraft(mod(sim, 'almacen').id, 'tornillos').ok).toBe(false);
    expect(sim.queueCraft(424242, 'tornillos').ok).toBe(false);
    banco.status = 'broken';
    banco.brokenReason = 'Tormenta';
    expect(sim.queueCraft(banco.id, 'tornillos').msg).toBe('El banco de trabajo está averiado (tormenta): repáralo primero');
    banco.status = 'active';
    banco.fire = 30;
    expect(sim.queueCraft(banco.id, 'tornillos').msg).toMatch(/ardiendo/);
  });

  it('cancelar devuelve los ingredientes al jugador', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    sim.queueCraft(banco.id, 'cana');
    sim.tick(2);
    expect(banco.queue[0]!.progress).toBeGreaterThan(0);
    const r = sim.cancelCraft(banco.id, 0);
    expect(r.ok).toBe(true);
    expect(r.msg).toMatch(/Cancelado: Caña de pescar/);
    expect(banco.queue).toHaveLength(0);
    expect(countItem(sim.state.player.inventory, 'madera')).toBe(2);
    expect(countItem(sim.state.player.inventory, 'cuerda')).toBe(2);
    expect(sim.cancelCraft(banco.id, 0).ok).toBe(false);
  });

  it('cancelar con el inventario lleno deja una caja a los pies', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    sim.queueCraft(banco.id, 'cana');
    const inv = sim.state.player.inventory;
    for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { id: 'conserva', qty: 20 };
    const r = sim.cancelCraft(banco.id, 0);
    expect(r.msg).toMatch(/caja a tus pies/);
    expect(sim.state.crates).toHaveLength(1);
    expect(countItem(sim.state.crates[0]!.inventory, 'madera')).toBe(2);
  });

  it('productos: bandeja → almacén → caja junto a la estación', () => {
    const { sim, notes } = setup();
    const banco = mod(sim, 'banco_trabajo');
    const almacen = mod(sim, 'almacen');
    const cocina = mod(sim, 'cocina');
    banco.inventory!.slots = banco.inventory!.slots.map(() => ({ id: 'plastico', qty: 50 }));
    sim.queueCraft(banco.id, 'tornillos');
    run(sim, 7);
    expect(countItem(almacen.inventory, 'tornillos')).toBe(4);
    expect(texts(notes, /guardado en el almacén/)).toHaveLength(1);

    for (const inv of [almacen.inventory!, cocina.inventory!]) inv.slots = inv.slots.map((s) => s ?? { id: 'conserva', qty: 20 });
    for (const inv of [almacen.inventory!, cocina.inventory!]) for (const s of inv.slots) if (s) s.qty = s.id === 'tornillos' ? 99 : (s.qty = 999);
    give(sim, { chatarra: 1 });
    sim.queueCraft(banco.id, 'tornillos');
    run(sim, 7);
    expect(sim.state.crates).toHaveLength(1);
    const crate = sim.state.crates[0]!;
    expect(countItem(crate.inventory, 'tornillos')).toBe(4);
    expect(texts(notes, /en una caja junto a la estación/)).toHaveLength(1);
    // La caja queda junto al banco (a menos de 3 m de su centro).
    const c = moduleCenter(banco, sim.state.ship.width);
    expect(Math.hypot(crate.pos.x - c.x, crate.pos.z - c.z)).toBeLessThan(3);
    expect(crate.pos.y).toBeCloseTo(c.y, 6);
  });

  it('los trabajos de habitantes se pagan con los almacenes y no cuentan para el jugador', () => {
    const { sim, notes } = setup();
    const banco = mod(sim, 'banco_trabajo');
    give(sim, { chatarra: 5 });
    sim.state.ship.modules.forEach((m) => {
      if (m.inventory && m.type !== 'banco_trabajo') m.inventory.slots = m.inventory.slots.map((s) => (s?.id === 'chatarra' ? null : s));
    });
    expect(stations.queueCraft(sim, banco.id, 'tornillos', 1, { by: 'npc' }).ok).toBe(false);
    addItem(mod(sim, 'almacen').inventory!, 'chatarra', 1);
    expect(stations.queueCraft(sim, banco.id, 'tornillos', 1, { by: 'npc' }).ok).toBe(true);
    expect(countItem(sim.state.player.inventory, 'chatarra')).toBe(5);
    run(sim, 7);
    expect(countItem(banco.inventory, 'tornillos')).toBe(4);
    expect(sim.state.player.stats.itemsCrafted).toBe(0);
    expect(texts(notes, /lista en el banco/)).toHaveLength(0);
    expect(sim.state.tutorial.done).not.toContain('fabricar');
  });
});

/* ------------------------------------------------------------------ */
/* Taller y cocina                                                     */
/* ------------------------------------------------------------------ */

describe('taller eléctrico', () => {
  it('solo trabaja con energía, a velocidad × satisfacción', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('taller', 'energia', 'solar');
    give(sim, MATERIALS);
    const taller = build(sim, 'taller', 1, 8, 2, 0);
    expect(sim.queueCraft(taller.id, 'pieza_mecanica').ok).toBe(true);
    run(sim, 30);
    expect(taller.queue[0]!.progress).toBe(0);
    expect(taller.powered).toBe(false);
    expect(texts(notes, /taller no tiene energía/)).toHaveLength(1);
    expect(stations.stationStatus(sim, taller.id)!.status).toBe('Sin energía');

    // Panel solar a mediodía: 1,6 kW × luz × nubes < 1,5 kW → trabaja a velocidad parcial.
    build(sim, 'panel_solar', 1, 9, 3);
    goToHour(sim, 12);
    const p0 = taller.queue[0]?.progress ?? 0;
    sim.tick(0.5);
    const s = sim.state.utilities.power.satisfaction;
    expect(taller.powered).toBe(true);
    expect(taller.queue[0]!.progress - p0).toBeCloseTo(0.5 * s, 6);

    // Con un generador va a plena velocidad y termina.
    const gen = build(sim, 'generador', 0, 1, 0);
    addItem(gen.fuelInv!, 'combustible', 1);
    run(sim, 40);
    expect(taller.queue).toHaveLength(0);
    expect(countItem(taller.inventory, 'pieza_mecanica')).toBe(1);
    expect(texts(notes, /Pieza mecánica lista en el taller/)).toHaveLength(1);
  });
});

describe('cocina', () => {
  it('cocina quemando la leña de su ranura', () => {
    const { sim, notes } = setup();
    const cocina = mod(sim, 'cocina');
    expect(countItem(cocina.fuelInv, 'madera')).toBe(3);
    const r = sim.queueCraft(cocina.id, 'pescado_asado', 2);
    expect(r.ok, r.msg).toBe(true);
    sim.tick(0.5);
    expect(cocina.powered).toBe(true);
    expect(stations.isStoveLit(cocina)).toBe(true);
    run(sim, 7.5);
    expect(countItem(cocina.inventory, 'pescado_asado')).toBe(1);
    expect(cocina.fuelBurn).toBeCloseTo(32, 6);
    expect(countItem(cocina.fuelInv, 'madera')).toBe(2);
    expect(texts(notes, /^Pescado asado listo en la cocina$/)).toHaveLength(1);
    expect(sim.state.tutorial.done).toContain('cocinar');
    run(sim, 8.5);
    expect(countItem(cocina.inventory, 'pescado_asado')).toBe(2);
    expect(cocina.queue).toHaveLength(0);
    expect(cocina.powered).toBe(false); // sin trabajo el fogón no arde
    expect(cocina.fuelBurn).toBeCloseTo(24, 6);
  });

  it('sin combustible se pausa y avisa una sola vez', () => {
    const { sim, notes } = setup();
    const cocina = mod(sim, 'cocina');
    cocina.fuelInv!.slots = cocina.fuelInv!.slots.map(() => null);
    cocina.fuelBurn = 0;
    sim.queueCraft(cocina.id, 'pescado_asado');
    expect(texts(notes, /no tiene combustible/)).toHaveLength(1);
    run(sim, 30);
    expect(cocina.queue[0]!.progress).toBe(0);
    expect(cocina.powered).toBe(false);
    expect(texts(notes, /combustible/)).toHaveLength(1);
    expect(stations.stationStatus(sim, cocina.id)!.status).toBe('Sin combustible');

    // Con leña termina.
    addItem(cocina.fuelInv!, 'madera', 1);
    run(sim, 8);
    expect(countItem(cocina.inventory, 'pescado_asado')).toBe(1);

    // Se acaba a mitad de un trabajo: pausa con el progreso hecho y nuevo aviso.
    cocina.fuelBurn = 3;
    cocina.fuelInv!.slots = cocina.fuelInv!.slots.map(() => null);
    addItem(cocina.inventory!, 'pescado_crudo', 1);
    sim.queueCraft(cocina.id, 'pescado_asado');
    run(sim, 10);
    expect(cocina.queue[0]!.progress).toBeCloseTo(3, 6);
    expect(texts(notes, /se ha quedado sin combustible: Pescado asado en pausa/)).toHaveLength(1);
  });

  it('destilar agua de mar devuelve el cubo', () => {
    const { sim, notes } = setup();
    const cocina = mod(sim, 'cocina');
    give(sim, { cubo_agua: 1 });
    expect(sim.queueCraft(cocina.id, 'destilar').ok).toBe(true);
    run(sim, 26);
    expect(countItem(cocina.inventory, 'agua_potable')).toBe(1);
    expect(countItem(cocina.inventory, 'cubo')).toBe(1);
    expect(texts(notes, /^Botella de agua lista en la cocina$/)).toHaveLength(1);
  });
});

/* ------------------------------------------------------------------ */
/* Huerto                                                              */
/* ------------------------------------------------------------------ */

describe('huerto', () => {
  it('plantar, crecer con agua y luz, madurar y cosechar', () => {
    const { sim, notes } = setup();
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 2 });
    const h = build(sim, 'huerto', 1, 8, 0);
    goToHour(sim, 11.5);
    const r = sim.plant(h.id, 0, 'semilla_hortaliza');
    expect(r.ok, r.msg).toBe(true);
    expect(sim.state.tutorial.done).toContain('plantar');
    expect(countItem(sim.state.player.inventory, 'semilla_hortaliza')).toBe(1);
    expect(h.plots[0]!.crop).toBe('hortaliza');
    expect(sim.plant(h.id, 0, 'semilla_hortaliza').msg).toMatch(/ya está plantada/);
    expect(sim.plant(h.id, 1, 'madera').ok).toBe(false);

    const w0 = sim.state.utilities.waterL;
    run(sim, 60);
    const crop = CROPS.hortaliza!;
    // A mediodía crece al ritmo completo: 1/28 por hora.
    expect(h.plots[0]!.growth).toBeCloseTo(1 / crop.growHours, 3);
    expect(w0 - sim.state.utilities.waterL).toBeCloseTo(crop.waterPerHour, 4);
    expect(stations.plotStatus(sim, h.id, 0)).toMatch(/^Hortalizas: 3 %$/);
    expect(sim.harvest(h.id, 0).msg).toMatch(/Aún no está maduro/);

    // Madura en menos de 28 h ÷ 0,3 (noches) y más de 28 h.
    let hours = 1;
    while (h.plots[0]!.growth < 1 && hours < 100) {
      run(sim, 60, () => {
        sim.state.utilities.waterL = Math.max(sim.state.utilities.waterL, 50);
      });
      hours++;
    }
    expect(hours).toBeGreaterThan(crop.growHours);
    expect(hours).toBeLessThan(crop.growHours / 0.3);
    expect(texts(notes, /Cosecha lista en el huerto: Hortalizas/)).toHaveLength(1);
    expect(stations.plotStatus(sim, h.id, 0)).toBe('Hortalizas: listas para cosechar');
    // Maduro no gasta agua.
    const w1 = sim.state.utilities.waterL;
    run(sim, 30);
    expect(sim.state.utilities.waterL).toBeCloseTo(w1, 6);

    const before = countItem(sim.state.player.inventory, 'hortaliza');
    const hv = sim.harvest(h.id, 0);
    expect(hv.ok, hv.msg).toBe(true);
    const got = countItem(sim.state.player.inventory, 'hortaliza') - before;
    expect(got).toBeGreaterThanOrEqual(3);
    expect(got).toBeLessThanOrEqual(5);
    expect(h.plots[0]).toEqual({ crop: null, growth: 0, dryHours: 0, dead: false, pest: false });
    expect(sim.harvest(h.id, 0).msg).toBe('No hay nada plantado');
  });

  it('sin agua acumula horas secas y muere a las dryHoursToDie', () => {
    const { sim, notes } = setup();
    give(sim, MATERIALS);
    give(sim, { semilla_lino: 2 });
    const h = build(sim, 'huerto', 1, 8, 0);
    const dry = () => {
      sim.state.utilities.waterL = 0;
    };
    dry();
    expect(sim.plant(h.id, 2, 'semilla_lino').msg).toMatch(/depósitos están vacíos/);
    const crop = CROPS.lino!;
    run(sim, (crop.dryHoursToDie - 1) * 60, dry);
    expect(h.plots[2]!.dead).toBe(false);
    expect(h.plots[2]!.growth).toBe(0);
    expect(h.plots[2]!.dryHours).toBeCloseTo(crop.dryHoursToDie - 1, 3);
    expect(texts(notes, /huerto no recibe agua/)).toHaveLength(1);
    expect(stations.plotStatus(sim, h.id, 2)).toMatch(/sin agua/);

    // Si vuelve el agua, el contador se reinicia.
    run(sim, 30, () => {
      sim.state.utilities.waterL = 50;
    });
    expect(h.plots[2]!.dryHours).toBe(0);
    run(sim, (crop.dryHoursToDie + 0.5) * 60, dry);
    expect(h.plots[2]!.dead).toBe(true);
    expect(sim.state.log.some((l) => l.text === 'El cultivo de lino se ha secado en el huerto')).toBe(true);
    expect(sim.harvest(h.id, 2).msg).toMatch(/secas/);
    expect(sim.plant(h.id, 2, 'semilla_lino').msg).toMatch(/plantas secas/);
    expect(sim.tendPlot(h.id, 2).ok).toBe(true);
    expect(h.plots[2]!.crop).toBeNull();
    expect(sim.plant(h.id, 2, 'semilla_lino').ok).toBe(true);
  });

  it('la lluvia riega los huertos a cielo abierto sin gastar los depósitos', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 1 });
    const h = build(sim, 'huerto', 1, 8, 0);
    sim.plant(h.id, 0, 'semilla_hortaliza');
    const col = mod(sim, 'colector');
    col.status = 'broken'; // que el colector no meta agua y se vea solo el consumo
    const u = sim.state.utilities;
    u.waterL = 0;
    for (let i = 0; i < 240; i++) {
      freeze(sim, 'lluvia');
      sim.state.weather.rain = 0.8;
      sim.tick(0.5);
    }
    expect(u.waterL).toBe(0);
    expect(h.plots[0]!.dryHours).toBe(0);
    expect(h.plots[0]!.growth).toBeGreaterThan(0);
  });

  it('con plaga no crece; tendPlot la retira', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 1 });
    const h = build(sim, 'huerto', 1, 8, 0);
    sim.plant(h.id, 1, 'semilla_hortaliza');
    h.plots[1]!.pest = true;
    run(sim, 120);
    expect(h.plots[1]!.growth).toBe(0);
    expect(stations.plotStatus(sim, h.id, 1)).toMatch(/plaga/);
    expect(sim.tendPlot(h.id, 1)).toEqual({ ok: true, msg: 'Retiras la plaga de la parcela' });
    expect(sim.tendPlot(h.id, 1).ok).toBe(false);
    run(sim, 60);
    expect(h.plots[1]!.growth).toBeGreaterThan(0);
  });

  it('huerto interior: necesita lámparas (plano) y energía', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia', 'invernadero');
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 4 });
    const h = build(sim, 'huerto', 0, 0, 0);
    // Huerto interior de una partida guardada sin el plano: plantar explica por qué no se puede.
    sim.state.unlocks = sim.state.unlocks.filter((k) => k !== 'invernadero');
    expect(sim.plant(h.id, 0, 'semilla_hortaliza').msg).toMatch(/no llega la luz.*Lámparas de cultivo/);
    expect(sim.togglePower(h.id).ok).toBe(false);
    sim.state.unlocks.push('invernadero');
    const first = sim.plant(h.id, 0, 'semilla_hortaliza');
    expect(first.ok).toBe(true);
    // Sin ninguna fuente de energía, avisa de que no crecerán.
    expect(first.msg).toBe('Plantas hortalizas. No crecerán: las lámparas de cultivo no tienen energía');
    expect(sim.plant(h.id, 1, 'semilla_hortaliza').ok).toBe(true);
    run(sim, 60);
    expect(sim.state.utilities.power.demand).toBeCloseTo(2 * utilities.GROW_LAMP_KW, 6);
    expect(h.plots[0]!.growth).toBe(0); // sin energía
    expect(stations.plotStatus(sim, h.id, 0)).toMatch(/sin luz: las lámparas de cultivo no tienen energía/);

    const gen = build(sim, 'generador', 0, 4, 0);
    addItem(gen.fuelInv!, 'combustible', 1);
    run(sim, 60);
    expect(h.powered).toBe(true);
    expect(h.plots[0]!.growth).toBeGreaterThan(0.9 / CROPS.hortaliza!.growHours);
    expect(sim.togglePower(h.id).msg).toBe('Lámparas de cultivo apagadas');
    const g = h.plots[0]!.growth;
    run(sim, 60);
    expect(h.plots[0]!.growth).toBeCloseTo(g, 9);
  });

  it('los habitantes plantan y cosechan con los almacenes', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    const h = build(sim, 'huerto', 1, 8, 0);
    const almacen = mod(sim, 'almacen');
    const seeds = countItem(almacen.inventory, 'semilla_hortaliza');
    expect(stations.plant(sim, h.id, 3, 'semilla_hortaliza', { by: 'npc' }).ok).toBe(true);
    expect(countItem(almacen.inventory, 'semilla_hortaliza')).toBe(seeds - 1);
    expect(sim.state.tutorial.done).not.toContain('plantar');
    h.plots[3]!.growth = 1;
    const before = countItem(almacen.inventory, 'hortaliza') + countItem(mod(sim, 'cocina').inventory, 'hortaliza');
    expect(stations.harvest(sim, h.id, 3, { by: 'npc' }).ok).toBe(true);
    const after = countItem(almacen.inventory, 'hortaliza') + countItem(mod(sim, 'cocina').inventory, 'hortaliza');
    expect(after - before).toBeGreaterThanOrEqual(3);
    expect(countItem(sim.state.player.inventory, 'hortaliza')).toBe(0);
  });

  it('la cosecha es determinista con la semilla de la partida', () => {
    const harvestWith = (seed: number) => {
      const { sim } = setup(seed);
      give(sim, MATERIALS);
      give(sim, { semilla_hortaliza: 1 });
      const h = build(sim, 'huerto', 1, 8, 0);
      sim.plant(h.id, 0, 'semilla_hortaliza');
      h.plots[0]!.growth = 1;
      return sim.harvest(h.id, 0).msg;
    };
    expect(harvestWith(31)).toBe(harvestWith(31));
  });
});

/* ------------------------------------------------------------------ */
/* Construcción                                                        */
/* ------------------------------------------------------------------ */

describe('construcción', () => {
  it('checkPlace informa de lo que falta', () => {
    const { sim } = setup();
    const almacen = mod(sim, 'almacen');
    almacen.inventory!.slots = almacen.inventory!.slots.map(() => null);
    const c = sim.checkPlace('camarote', 1, 6, 3, 0);
    expect(c.ok).toBe(false);
    expect(c.missing).toEqual({ madera: 8, tela: 2 });
    expect(c.reason).toBe('Faltan: 8× Madera, 2× Tela');
    // Los errores espaciales tienen prioridad.
    expect(sim.checkPlace('camarote', 1, 6, 0, 0).reason).not.toMatch(/Faltan/);
    expect(sim.checkPlace('camarote', 1, 6, 0, 0).missing).toEqual({ madera: 8, tela: 2 });
    expect(sim.placeModule('camarote', 1, 6, 3, 0).ok).toBe(false);
    expect(sim.state.ship.modules).toHaveLength(10);
    expect(sim.checkPlace('nada', 1, 6, 3, 0).ok).toBe(false);
    expect(sim.checkPlace('generador', 0, 1, 0, 0).reason).toBe('Necesitas el Plano: Energía');
  });

  it('construir: pago, obra, progreso, activo y aparece en el layout', () => {
    const { sim } = setup();
    const almacen = mod(sim, 'almacen');
    const revs: number[] = [];
    sim.bus.on('shipChanged', (e) => revs.push(e.revision));
    expect(sim.checkPlace('camarote', 1, 6, 3, 0).ok).toBe(true);
    const r = sim.placeModule('camarote', 1, 6, 3, 0);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toMatch(/Obra iniciada: Camarote \(40 min/);
    expect(countItem(almacen.inventory, 'madera')).toBe(24 - 8);
    expect(countItem(almacen.inventory, 'tela')).toBe(4 - 2);
    expect(sim.state.tutorial.done).toContain('construir');
    const m = sim.state.ship.modules.find((mm) => mm.id === r.moduleId)!;
    expect(m.status).toBe('construction');
    expect(sim.layout.sites.map((s) => s.moduleId)).toContain(m.id);
    expect(getCell(sim.layout, 1, 6, 3)!.kind).toBe('deck');
    expect(revs).toHaveLength(1);
    // El sitio ya está ocupado aunque esté en obras.
    expect(sim.checkPlace('almacen', 1, 6, 3, 0).ok).toBe(false);

    run(sim, 20, undefined, 5);
    expect(m.buildProgress).toBeCloseTo(0.5, 6);
    expect(m.status).toBe('construction');

    run(sim, 21, undefined, 5);
    expect(m.status).toBe('active');
    expect(m.buildProgress).toBe(1);
    expect(sim.state.player.stats.modulesBuilt).toBe(1);
    expect(sim.state.log.some((l) => l.text === 'Obra terminada: Camarote')).toBe(true);
    expect(revs).toHaveLength(2);
    const cell = getCell(sim.layout, 1, 6, 3)!;
    expect(cell.kind).toBe('room');
    expect(cell.moduleId).toBe(m.id);
    expect(sim.layout.props.some((p) => p.moduleId === m.id && p.interact === 'dormir')).toBe(true);
    expect(sim.layout.sites).toHaveLength(0);
  });

  it('los habitantes que ayudan y el jugador con martillo aceleran la obra', () => {
    const { sim } = setup();
    const r = sim.placeModule('camarote', 1, 6, 3, 0);
    const m = sim.state.ship.modules.find((mm) => mm.id === r.moduleId)!;
    const npc = makeNpc('npcT', 'Ana', 'libre', 'tranquila', { x: 0, y: 3.2, z: 0 }, 3, 1);
    npc.activity = 'building';
    npc.task = { kind: 'construir', targetModuleId: m.id };
    const other = makeNpc('npcU', 'Luis', 'libre', 'tranquilo', { x: 0, y: 3.2, z: 0 }, 5, 1);
    other.activity = 'building';
    other.task = { kind: 'construir', targetModuleId: 9999 }; // otra obra: no cuenta
    sim.state.npcs.push(npc, other);
    expect(construction.buildersOn(sim, m.id)).toBe(1);
    construction.tickConstruction(sim, 10);
    expect(m.buildProgress).toBeCloseTo((10 * 1.75) / 40, 9);

    // Martillo: ritmo ×2.
    const h = sim.helpBuild(m.id, 5);
    expect(h.ok, h.msg).toBe(true);
    expect(m.buildProgress).toBeCloseTo((10 * 1.75 + 5 * 2) / 40, 9);
    expect(h.msg).toBe('Camarote: 68 %');

    const inv = sim.state.player.inventory;
    inv.slots = inv.slots.map((s) => (s?.id === 'martillo' ? null : s));
    expect(sim.helpBuild(m.id, 5).msg).toMatch(/Necesitas un martillo/);
    give(sim, { martillo: 1 });
    expect(sim.helpBuild(m.id, 30).msg).toBe('Obra terminada: Camarote');
    expect(m.status).toBe('active');
    expect(sim.helpBuild(m.id, 5).msg).toBe('El camarote ya está terminado');
    expect(sim.helpBuild(31337, 5).ok).toBe(false);
  });

  it('constructionStatus informa del progreso, los ayudantes y el tiempo restante', () => {
    const { sim } = setup();
    const r = sim.placeModule('camarote', 1, 6, 3, 0);
    expect(construction.constructionStatus(sim, r.moduleId!)).toEqual({ progress: 0, builders: 0, etaMin: 40, name: 'Camarote' });
    const npc = makeNpc('npcC', 'Eva', 'libre', 'tranquila', { x: 0, y: 3.2, z: 0 }, 2, 1);
    npc.activity = 'building';
    npc.task = { kind: 'construir', targetModuleId: r.moduleId! };
    sim.state.npcs.push(npc);
    expect(construction.constructionStatus(sim, r.moduleId!)!.etaMin).toBeCloseTo(40 / 1.75, 9);
    expect(construction.constructionStatus(sim, mod(sim, 'almacen').id)).toBeNull();
    expect(construction.constructionStatus(sim, -1)).toBeNull();
  });

  it('demoler: contenido y reembolso del 50 % a una caja en el centro', () => {
    const { sim } = setup();
    const almacen = mod(sim, 'almacen');
    const chk = sim.checkDemolishModule(almacen.id);
    expect(chk.ok, chk.reason ?? '').toBe(true);
    expect(chk.refund).toEqual({ madera: 4 });
    const r = sim.demolish(almacen.id);
    expect(r.ok, r.msg).toBe(true);
    expect(r.msg).toBe('Desmontado: Almacén. Materiales y contenido en una caja');
    expect(sim.state.ship.modules.some((m) => m.id === almacen.id)).toBe(false);
    expect(sim.state.crates).toHaveLength(1);
    const crate = sim.state.crates[0]!;
    expect(countItem(crate.inventory, 'madera')).toBe(24 + 4);
    expect(countItem(crate.inventory, 'chatarra')).toBe(10);
    expect(countItem(crate.inventory, 'combustible')).toBe(2);
    expect(countItem(crate.inventory, 'semilla_lino')).toBe(2);
    const c = moduleCenter(almacen, sim.state.ship.width);
    expect(crate.pos).toEqual({ x: c.x, y: c.y, z: c.z });
    expect(crate.label).toBe('Restos: Almacén');
    expect(getCell(sim.layout, 1, 3, 3)!.kind).toBe('deck');
  });

  it('demoler: cola, combustible y cultivos vuelven; se liberan camas y se despierta al jugador', () => {
    const { sim } = setup(9, { npcs: true });
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 2 });
    const cam = build(sim, 'camarote', 1, 6, 3, 0);
    const npc = sim.state.npcs[0]!;
    npc.bed = { moduleId: cam.id, index: 0 };
    cam.beds[0] = npc.id;
    sim.state.player.sleeping = { moduleId: cam.id, bed: 0, until: null };
    expect(sim.demolish(cam.id).ok).toBe(true);
    expect(npc.bed).toBeNull();
    expect(sim.state.player.sleeping).toBeNull();

    // Huerto con un cultivo maduro y otro creciendo.
    const h = build(sim, 'huerto', 1, 8, 0);
    sim.plant(h.id, 0, 'semilla_hortaliza');
    sim.plant(h.id, 1, 'semilla_hortaliza');
    h.plots[0]!.growth = 1;
    const crates0 = sim.state.crates.length;
    expect(sim.demolish(h.id).ok).toBe(true);
    const crate = sim.state.crates[crates0]!;
    expect(countItem(crate.inventory, 'semilla_hortaliza')).toBe(2);
    expect(countItem(crate.inventory, 'hortaliza')).toBe(CROPS.hortaliza!.yield[0]!.min);
    expect(countItem(crate.inventory, 'madera')).toBe(5);

    // Cocina con cola pagada y leña.
    const cocina = mod(sim, 'cocina');
    sim.queueCraft(cocina.id, 'pescado_asado', 2);
    // Leña del fogón (la cocinera puede haber gastado alguna mientras tanto) + despensa + reembolso.
    const woodInside = countItem(cocina.fuelInv, 'madera') + countItem(cocina.inventory, 'madera');
    expect(woodInside).toBeGreaterThan(0);
    const n0 = sim.state.crates.length;
    expect(sim.demolish(cocina.id).ok).toBe(true);
    const cc = sim.state.crates[n0]!;
    expect(countItem(cc.inventory, 'pescado_crudo')).toBe(2);
    expect(countItem(cc.inventory, 'madera')).toBe(woodInside + Math.floor(moduleDef('cocina').cost.madera! * construction.DEMOLISH_REFUND));
    expect(countItem(cc.inventory, 'hortaliza')).toBe(2);
  });

  it('cancelar una obra devuelve el 100 %', () => {
    const { sim } = setup();
    const r = sim.placeModule('camarote', 1, 6, 3, 0);
    expect(sim.checkDemolishModule(r.moduleId!).refund).toEqual({ madera: 8, tela: 2 });
    const d = sim.demolish(r.moduleId!);
    expect(d.msg).toBe('Obra cancelada: Camarote. Materiales en una caja');
    expect(countItem(sim.state.crates[0]!.inventory, 'madera')).toBe(8);
    expect(countItem(sim.state.crates[0]!.inventory, 'tela')).toBe(2);
  });

  it('no se puede demoler lo que sostiene el puente, lo que arde ni lo inexistente', () => {
    const { sim } = setup();
    expect(sim.checkDemolishModule(mod(sim, 'dormitorio').id).ok).toBe(false);
    expect(sim.checkDemolishModule(mod(sim, 'puente').id).reason).toMatch(/no se puede retirar/);
    const banco = mod(sim, 'banco_trabajo');
    banco.fire = 20;
    expect(sim.checkDemolishModule(banco.id).reason).toBe('No se puede desmontar mientras arde');
    expect(sim.demolish(banco.id).ok).toBe(false);
    expect(sim.demolish(777).ok).toBe(false);
  });

  it('cajas sueltas dentro de un mueble nuevo se sacan al terminar la obra', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    const r = sim.placeModule('deposito', 1, 9, 3, 0);
    const m = sim.state.ship.modules.find((mm) => mm.id === r.moduleId)!;
    const c = moduleCenter(m, sim.state.ship.width);
    sim.state.crates.push({ id: sim.nextId(), pos: { x: c.x, y: c.y, z: c.z }, inventory: createInventory(4), label: 'Caja' });
    addItem(sim.state.crates[0]!.inventory, 'madera', 1);
    run(sim, 31, undefined, 5);
    const crate = sim.state.crates[0]!;
    const prop = sim.layout.props.find((p) => p.moduleId === m.id)!;
    const b = prop.collider!;
    const inside = crate.pos.x > b.minX && crate.pos.x < b.maxX && crate.pos.z > b.minZ && crate.pos.z < b.maxZ;
    expect(inside).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Ampliación del casco                                                */
/* ------------------------------------------------------------------ */

describe('ampliación del casco', () => {
  it('requiere plano y materiales; obra especial con ayuda; alarga el barco', () => {
    const { sim } = setup();
    expect(sim.checkExpandHull().reason).toMatch(/Plano: Ampliación del casco/);
    sim.state.unlocks.push('casco');
    const chk = construction.checkExpandHull(sim);
    expect(chk.ok).toBe(false);
    expect(chk.reason).toMatch(/^Faltan:/);
    // Coste base la primera vez (× (1 + 0 ampliaciones)); se paga con lo que hay en los almacenes.
    expect(chk.cost).toEqual(HULL_EXPANSION.cost);
    const stored = (id: string) => sim.state.ship.modules.reduce((n, m) => n + countItem(m.inventory, id), 0);
    expect(chk.missing).toEqual({
      madera: HULL_EXPANSION.cost.madera! - stored('madera'),
      placa_metal: HULL_EXPANSION.cost.placa_metal! - stored('placa_metal'),
      tornillos: HULL_EXPANSION.cost.tornillos! - stored('tornillos'),
    });
    give(sim, HULL_EXPANSION.cost);
    expect(sim.checkExpandHull().ok).toBe(true);
    const r = sim.expandHull();
    expect(r.ok, r.msg).toBe(true);
    expect(sim.state.ship.expansion).toEqual({ progress: 0 });
    expect(sim.expandHull().msg).toMatch(/Ya hay una ampliación/);

    const T = HULL_EXPANSION.buildTime;
    const p1 = (30 * construction.PLAYER_HELP_RATE) / T;
    expect(sim.helpBuild(-1, 30).msg).toBe(`Ampliación del casco: ${Math.floor(p1 * 100)} %`);
    const npc = makeNpc('npcB', 'Bea', 'libre', 'alegre', { x: 0, y: 3.2, z: 0 }, 1, 1);
    npc.activity = 'building';
    npc.task = { kind: 'construir', targetModuleId: -1 };
    sim.state.npcs.push(npc);
    construction.tickConstruction(sim, 40);
    expect(sim.state.ship.expansion!.progress).toBeCloseTo(p1 + (40 * 1.75) / T, 9);
    sim.state.npcs = [];

    run(sim, T, undefined, 10);
    expect(sim.state.ship.expansion).toBeNull();
    expect(sim.state.ship.length).toBe(SHIP_START_LENGTH + 2);
    expect(sim.state.ship.hullTier).toBe(1);
    expect(sim.layout.length).toBe(SHIP_START_LENGTH + 2);
    expect(getCell(sim.layout, 1, 11, 1)!.kind).toBe('deck');
    expect(getCell(sim.layout, 0, 10, 0)!.kind).toBe('hold');
    expect(sim.state.log.some((l) => /Ampliación del casco terminada/.test(l.text))).toBe(true);
    // Se puede construir en la nueva sección.
    expect(sim.checkPlace('deposito', 1, 11, 0, 0).ok).toBe(true);
    expect(sim.helpBuild(-1, 5).ok).toBe(false);

    // La segunda ampliación cuesta el doble (× (1 + 1)).
    const next = construction.checkExpandHull(sim);
    for (const [id, q] of Object.entries(HULL_EXPANSION.cost)) expect(next.cost[id]).toBe(q * 2);
    expect(construction.hullExpansionCost(sim)).toEqual(next.cost);
  });

  it('cancelar la ampliación devuelve lo pagado (con el coste escalado) en una caja transitable', () => {
    const { sim } = setup();
    sim.state.unlocks.push('casco');
    sim.state.ship.hullTier = 2; // ya se amplió dos veces (el casco no crece en esta prueba)
    const cost = construction.hullExpansionCost(sim);
    for (const [id, q] of Object.entries(HULL_EXPANSION.cost)) expect(cost[id]).toBe(q * 3);
    give(sim, cost);
    expect(sim.expandHull().ok).toBe(true);
    for (const id of Object.keys(cost)) expect(countItem(sim.state.player.inventory, id)).toBe(0);
    expect(construction.cancelExpansion(sim).ok).toBe(true);
    expect(sim.state.ship.expansion).toBeNull();
    const crate = sim.state.crates.at(-1)!;
    for (const [id, q] of Object.entries(cost)) expect(countItem(crate.inventory, id)).toBe(q);
    expect(stations.isValidDropPoint(sim, crate.pos)).toBe(true);
    expect(construction.cancelExpansion(sim).ok).toBe(false);
  });

  it('expone las celdas y el punto de trabajo de la ampliación', () => {
    const { sim } = setup();
    const cells = construction.expansionCells(sim);
    expect(cells).toHaveLength(2 * sim.state.ship.width * 2);
    expect(Math.min(...cells.map((c) => c.x))).toBe(SHIP_START_LENGTH);
    const p = construction.expansionWorkPoint(sim);
    expect(p.x).toBeCloseTo(SHIP_START_LENGTH * 4 - 20 - 0.6, 9);
    expect(sim.collision.groundAt(p.x, p.z, p.y)).not.toBeNull();
  });

  it('no supera la eslora máxima', () => {
    const { sim } = setup();
    sim.state.unlocks.push('casco');
    give(sim, HULL_EXPANSION.cost);
    sim.state.ship.length = SHIP_MAX_LENGTH;
    expect(sim.checkExpandHull().reason).toBe('El casco ya tiene la eslora máxima');
  });
});

/* ------------------------------------------------------------------ */
/* Reparación y desgaste                                               */
/* ------------------------------------------------------------------ */

describe('desgaste y reparación', () => {
  it('las máquinas funcionando pierden 1 punto cada 8 h y se averían a 0', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    const banco = mod(sim, 'banco_trabajo');
    addItem(gen.fuelInv!, 'combustible', 3);
    const empty = () => {
      sim.state.utilities.waterL = 0;
    };
    expect(construction.WEAR_HOURS_PER_POINT).toBe(8);
    run(sim, 8 * 60, empty);
    expect(gen.condition).toBeCloseTo(99, 2);
    expect(pot.condition).toBeCloseTo(99, 2);
    expect(banco.condition).toBe(100); // no es una máquina

    // Apagada no se desgasta.
    sim.togglePower(pot.id);
    run(sim, 60, empty);
    expect(pot.condition).toBeCloseTo(99, 2);
    sim.togglePower(pot.id);

    gen.condition = 50.01;
    run(sim, 30, empty);
    expect(texts(notes, /generador está muy desgastado y rinde menos/)).toHaveLength(1);

    gen.condition = 0.01;
    run(sim, 30, empty);
    expect(gen.status).toBe('broken');
    expect(gen.brokenReason).toBe('Desgaste');
    expect(gen.powered).toBe(false);
    expect(sim.state.log.some((l) => l.text === 'El generador se ha averiado por desgaste')).toBe(true);
    run(sim, 30, empty);
    expect(sim.state.utilities.power.generation).toBe(0);
  });

  it('reparar máquinas: llave inglesa + pieza mecánica (del jugador o del almacén)', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    gen.status = 'broken';
    gen.brokenReason = 'Avería';
    gen.condition = 0;
    let info = sim.repairInfo(gen.id);
    expect(info).toMatchObject({ needed: true, tool: 'llave_inglesa', part: 'pieza_mecanica', ok: false });
    expect(info.reason).toMatch(/llave inglesa/);
    give(sim, { llave_inglesa: 1 });
    info = sim.repairInfo(gen.id);
    expect(info.reason).toMatch(/pieza mecánica/);
    addItem(mod(sim, 'almacen').inventory!, 'pieza_mecanica', 1);
    expect(sim.repairInfo(gen.id).ok).toBe(true);
    const r = sim.repair(gen.id);
    expect(r).toEqual({ ok: true, msg: 'Generador reparado' });
    expect(gen.status).toBe('active');
    expect(gen.condition).toBe(100);
    expect(gen.brokenReason).toBeNull();
    expect(countItem(mod(sim, 'almacen').inventory, 'pieza_mecanica')).toBe(0);
    expect(countItem(sim.state.player.inventory, 'llave_inglesa')).toBe(1); // la herramienta no se gasta
    expect(sim.state.player.stats.repairs).toBe(1);
    expect(sim.state.tutorial.done).toContain('reparar');
    expect(sim.repairInfo(gen.id)).toMatchObject({ needed: false, ok: false });
    expect(sim.repair(gen.id).msg).toBe('No necesita reparación');
  });

  it('el desgaste leve no pide reparación hasta bajar del umbral', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    banco.condition = 97;
    expect(sim.repairInfo(banco.id).needed).toBe(false);
    banco.condition = construction.REPAIR_THRESHOLD - 1;
    expect(sim.repairInfo(banco.id).needed).toBe(true);
    banco.condition = 100;
    banco.leak = true;
    expect(sim.repairInfo(banco.id).needed).toBe(true);
  });

  it('reparar estructuras: martillo + kit; sella fugas; nunca con fuego', () => {
    const { sim } = setup();
    const dep = mod(sim, 'deposito');
    dep.leak = true;
    dep.condition = 60;
    expect(sim.repairInfo(dep.id)).toMatchObject({ needed: true, tool: 'martillo', part: 'kit_reparacion', ok: false });
    give(sim, { kit_reparacion: 1 });
    dep.fire = 10;
    expect(sim.repairInfo(dep.id).reason).toBe('Primero hay que apagar el fuego');
    expect(sim.repair(dep.id).ok).toBe(false);
    dep.fire = 0;
    const r = sim.repair(dep.id);
    expect(r).toEqual({ ok: true, msg: 'Depósito de agua reparado: fuga sellada' });
    expect(dep.leak).toBe(false);
    expect(dep.condition).toBe(100);
    expect(countItem(sim.state.player.inventory, 'kit_reparacion')).toBe(0);
    expect(sim.state.log.some((l) => l.text === 'Depósito de agua reparado: fuga sellada')).toBe(true);

    const inv = sim.state.player.inventory;
    inv.slots = inv.slots.map((s) => (s?.id === 'martillo' ? null : s));
    dep.condition = 70;
    give(sim, { kit_reparacion: 1 });
    expect(sim.repairInfo(dep.id).reason).toMatch(/martillo/);
  });

  it('los habitantes reparan con repuestos del almacén y sin contar para el jugador', () => {
    const { sim } = setup();
    const dep = mod(sim, 'deposito');
    dep.condition = 30;
    give(sim, { kit_reparacion: 1 });
    expect(construction.repair(sim, dep.id, { by: 'npc' }).ok).toBe(false);
    addItem(mod(sim, 'almacen').inventory!, 'kit_reparacion', 1);
    expect(construction.repair(sim, dep.id, { by: 'npc' }).ok).toBe(true);
    expect(dep.condition).toBe(100);
    expect(countItem(sim.state.player.inventory, 'kit_reparacion')).toBe(1);
    expect(sim.state.player.stats.repairs).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Integridad                                                          */
/* ------------------------------------------------------------------ */

describe('integridad', () => {
  it('los sistemas de economía no usan Math.random', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia', 'agua', 'taller');
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 2 });
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random en la simulación');
    });
    const r = construction.placeModule(sim, 'huerto', 1, 8, 0, 0);
    for (let i = 0; i < 200; i++) {
      utilities.tickUtilities(sim, 0.5);
      stations.tickStations(sim, 0.5);
      construction.tickConstruction(sim, 0.5);
    }
    stations.plant(sim, r.moduleId!, 0, 'semilla_hortaliza');
    sim.state.ship.modules.find((m) => m.id === r.moduleId)!.plots[0]!.growth = 1;
    expect(stations.harvest(sim, r.moduleId!, 0).ok).toBe(true);
    expect(construction.demolish(sim, r.moduleId!).ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('el estado sigue siendo serializable y la partida continúa tras recargar', () => {
    const { sim } = setup();
    sim.state.unlocks.push('energia');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    addItem(gen.fuelInv!, 'madera', 2);
    stations.queueCraft(sim, mod(sim, 'banco_trabajo').id, 'tornillos', 2, { by: 'npc' });
    sim.placeModule('camarote', 1, 6, 3, 0);
    run(sim, 3);
    const copy = new Simulation(JSON.parse(JSON.stringify(sim.state)));
    copy.state.npcs = [];
    freeze(copy);
    expect(copy.state.ship.modules.find((m) => m.type === 'banco_trabajo')!.queue[0]).toMatchObject({ recipeId: 'tornillos', by: 'npc' });
    run(copy, 60);
    expect(copy.state.ship.modules.find((m) => m.type === 'camarote' && m.x === 6)!.status).toBe('active');
    expect(countItem(copy.state.ship.modules.find((m) => m.type === 'banco_trabajo')!.inventory, 'tornillos')).toBe(8);
  });

  it('resiste valores corruptos de un guardado (NaN/undefined) sin propagarlos', () => {
    const { sim } = setup();
    const u = sim.state.utilities;
    (u as { batteryKWh: unknown }).batteryKWh = undefined;
    u.waterL = Number.NaN;
    (sim.state.weather as { cloudiness: unknown }).cloudiness = undefined;
    mod(sim, 'cocina').fuelBurn = Number.NaN;
    run(sim, 30);
    expect(Number.isFinite(u.batteryKWh)).toBe(true);
    expect(Number.isFinite(u.waterL)).toBe(true);
    expect(Number.isFinite(u.water.inPerHour)).toBe(true);
    expect(Number.isFinite(u.power.generation)).toBe(true);
    sim.queueCraft(mod(sim, 'cocina').id, 'pescado_asado');
    run(sim, 10);
    expect(countItem(mod(sim, 'cocina').inventory, 'pescado_asado')).toBe(1);
  });

  it('caos: tres días con clima, eventos y habitantes reales mantienen los invariantes', () => {
    const sim = new Simulation(createNewGame(2024));
    const st = sim.state;
    st.unlocks.push('energia', 'agua', 'taller', 'solar', 'invernadero');
    give(sim, { ...MATERIALS, semilla_hortaliza: 4, combustible: 4 });
    for (const [t, l, x, z, r] of [
      ['generador', 0, 1, 0, 0],
      ['bateria', 0, 2, 0, 0],
      ['potabilizadora', 0, 3, 0, 0],
      ['panel_solar', 1, 9, 3, 0],
      ['huerto', 1, 8, 0, 0],
      ['taller', 1, 5, 1, 0],
    ] as const) {
      expect(sim.placeModule(t, l, x, z, r).ok).toBe(true);
    }
    const keepAlive = () => {
      Object.assign(st.player.needs, { hunger: 100, thirst: 100, energy: 100, health: 100, warmth: 80 });
      st.player.sick = 0;
    };
    for (let hour = 0; hour < 72; hour++) {
      keepAlive();
      if (hour === 2) {
        const gen = mod(sim, 'generador');
        addItem(gen.fuelInv!, 'combustible', 2);
        const h = mod(sim, 'huerto');
        sim.plant(h.id, 0, 'semilla_hortaliza');
        sim.plant(h.id, 1, 'semilla_hortaliza');
        sim.queueCraft(mod(sim, 'taller').id, 'pieza_mecanica', 2);
      }
      sim.tick(30);
      keepAlive();
      sim.tick(30);
      const u = st.utilities;
      expect(u.waterL).toBeGreaterThanOrEqual(0);
      expect(u.waterL).toBeLessThanOrEqual(u.water.capacityL + 1e-9);
      expect(u.batteryKWh).toBeGreaterThanOrEqual(0);
      expect(u.batteryKWh).toBeLessThanOrEqual(u.power.capacityKWh + 1e-9);
      expect(u.power.satisfaction).toBeGreaterThanOrEqual(0);
      expect(u.power.satisfaction).toBeLessThanOrEqual(1);
      for (const v of [u.power.generation, u.power.demand, u.water.inPerHour, u.water.outPerHour]) expect(Number.isFinite(v)).toBe(true);
      for (const m of st.ship.modules) {
        expect(m.condition).toBeGreaterThanOrEqual(0);
        expect(m.condition).toBeLessThanOrEqual(100);
        expect(m.queue.length).toBeLessThanOrEqual(stations.MAX_QUEUE);
        expect(m.fuelBurn).toBeGreaterThanOrEqual(0);
        for (const p of m.plots) {
          expect(p.growth).toBeGreaterThanOrEqual(0);
          expect(p.growth).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(st.ship.modules.filter((m) => m.status === 'construction')).toHaveLength(0);
    expect(st.player.stats.modulesBuilt).toBe(6);
  });

  it('textos con concordancia de género y número', () => {
    expect(utilities.agree('Sopa de verduras', 'listo')).toBe('lista');
    expect(utilities.agree('Componentes eléctricos', 'listo')).toBe('listos');
    expect(utilities.agree('Conservas caseras', 'listo')).toBe('listas');
    expect(utilities.agree('Llave inglesa', 'listo')).toBe('lista');
    expect(utilities.agree('Kit de reparación', 'listo')).toBe('listo');
    expect(utilities.agree('Lámparas de cultivo', 'encendido')).toBe('encendidas');
    expect(utilities.withArticle('Potabilizadora')).toBe('la potabilizadora');
    expect(utilities.withArticle('Banco de baterías', true)).toBe('El banco de baterías');
    expect(utilities.toArticle('Generador')).toBe('al generador');
    expect(utilities.toArticle('Potabilizadora')).toBe('a la potabilizadora');
    expect(construction.durationText(40)).toBe('40 min');
    expect(construction.durationText(90)).toBe('1 h 30 min');
    expect(construction.durationText(240)).toBe('4 h');
    for (const r of Object.values(RECIPES)) expect(r.name.length).toBeGreaterThan(2);
  });
});

/* ------------------------------------------------------------------ */
/* Regresiones de la ronda de QA 1                                     */
/* ------------------------------------------------------------------ */

describe('regresiones QA 1 (economía)', () => {
  it('[13/32] un huerto donde no llega el sol necesita el plano de lámparas: se rechaza sin cobrar', () => {
    const { sim } = setup();
    give(sim, MATERIALS);
    const wood = countItem(sim.state.player.inventory, 'madera');
    const c = sim.checkPlace('huerto', 0, 0, 0, 0);
    expect(c.ok).toBe(false);
    expect(c.reason).toBe('Necesitas el Plano: Lámparas de cultivo (aquí no llega el sol)');
    expect(sim.placeModule('huerto', 0, 0, 0, 0)).toMatchObject({ ok: false, msg: 'Necesitas el Plano: Lámparas de cultivo (aquí no llega el sol)' });
    expect(countItem(sim.state.player.inventory, 'madera')).toBe(wood);
    expect(sim.state.ship.modules.some((m) => m.type === 'huerto')).toBe(false);
    // A cielo abierto, sin avisos.
    const deck = construction.checkPlace(sim, 'huerto', 1, 8, 0, 0);
    expect(deck.ok).toBe(true);
    expect(deck.warning).toBeNull();
    // Con el plano se puede en la bodega, avisando del consumo de las lámparas.
    sim.state.unlocks.push('invernadero');
    const hold = construction.checkPlace(sim, 'huerto', 0, 0, 0, 0);
    expect(hold.ok).toBe(true);
    expect(hold.warning).toBe('En interior crece con lámparas de cultivo: consumirán hasta 0,6 kW');
  });

  it('[13/32] plantar avisa de por qué no crecerá (lámparas apagadas o sin energía)', () => {
    const { sim } = setup();
    sim.state.unlocks.push('invernadero', 'energia');
    give(sim, MATERIALS);
    give(sim, { semilla_hortaliza: 2, semilla_lino: 1 });
    const h = build(sim, 'huerto', 0, 0, 0);
    expect(sim.togglePower(h.id).msg).toBe('Lámparas de cultivo apagadas');
    sim.tick(0.5);
    expect(sim.plant(h.id, 0, 'semilla_hortaliza').msg).toBe('Plantas hortalizas. Enciende las lámparas de cultivo para que crezcan');
    expect(sim.plant(h.id, 1, 'semilla_lino').msg).toBe('Plantas lino. Enciende las lámparas de cultivo para que crezca');
    expect(stations.plotStatus(sim, h.id, 0)).toBe('Hortalizas: 0 % · sin luz: las lámparas de cultivo están apagadas');
    sim.togglePower(h.id);
    sim.tick(0.5);
    expect(sim.plant(h.id, 2, 'semilla_hortaliza').msg).toBe('Plantas hortalizas. No crecerán: las lámparas de cultivo no tienen energía');
    // Con energía ya no hay aviso.
    const gen = build(sim, 'generador', 0, 4, 0);
    addItem(gen.fuelInv!, 'combustible', 1);
    sim.tick(0.5);
    expect(stations.plotLightIssue(sim, h)).toBeNull();
    expect(sim.plant(h.id, 3, 'semilla_hortaliza').msg).toBe('No tienes semillas de hortaliza');
  });

  it('[14] terminar una escalera con el jugador o un habitante dentro no los tira a la bodega', () => {
    const { sim } = setup(7, { npcs: true });
    sim.state.npcs = sim.state.npcs.slice(0, 1);
    const npc = sim.state.npcs[0]!;
    // Escalera de la cubierta al techo de la cocina; jugador y habitante en su mitad alta.
    const r = sim.placeModule('escalera', 1, 2, 2, 0);
    expect(r.ok, r.msg).toBe(true);
    sim.state.player.pos = { x: -10, y: 3.2, z: 3 };
    npc.pos = { x: -11, y: 3.2, z: 3.5 };
    npc.activity = 'building';
    npc.task = { kind: 'construir', targetModuleId: r.moduleId! };
    expect(sim.helpBuild(r.moduleId!, 30).msg).toBe('Obra terminada: Escalera');
    const p = sim.state.player.pos;
    expect(p.y).toBeGreaterThan(4); // sobre la rampa, no en la bodega
    expect(sim.collision.groundAt(p.x, p.z, p.y)).toBeCloseTo(p.y, 6);
    expect(stations.standsOn(sim, p, PLAYER_RADIUS)).toBe(true);
    expect(Math.hypot(p.x + 10, p.z - 3)).toBeLessThan(1);
    expect(npc.pos.y).toBeGreaterThan(4);
    expect(stations.standsOn(sim, npc.pos, AGENT_RADIUS)).toBe(true);
  });

  it('[14] una escalera nueva desde la bodega bajo el jugador lo deja en la cubierta, junto al hueco', () => {
    const { sim } = setup();
    const r = sim.placeModule('escalera', 0, 5, 1, 0);
    expect(r.ok, r.msg).toBe(true);
    sim.state.player.pos = { x: 2, y: 3.2, z: -2 }; // centro de la celda (5,1) de la cubierta
    expect(sim.helpBuild(r.moduleId!, 30).msg).toBe('Obra terminada: Escalera');
    expect(getCell(sim.layout, 1, 5, 1)!.kind).toBe('stairHigh');
    const p = sim.state.player.pos;
    expect(p.y).toBeCloseTo(3.2, 6);
    expect(sim.collision.cellOf(p)!.kind).toBe('deck');
    expect(stations.standsOn(sim, p, PLAYER_RADIUS)).toBe(true);
    expect(Math.hypot(p.x - 2, p.z + 2)).toBeLessThan(3);
    // Quien está bien donde está no se mueve.
    const r2 = sim.placeModule('camarote', 1, 6, 3, 0);
    sim.state.player.pos = { x: 5, y: 3.2, z: 1 };
    sim.helpBuild(r2.moduleId!, 30);
    expect(sim.state.player.pos).toEqual({ x: 5, y: 3.2, z: 1 });
  });

  it('[15] la confirmación de desmontar un depósito o una batería dice cuánto se perdería', () => {
    const { sim } = setup();
    const u = sim.state.utilities;
    const dep = mod(sim, 'deposito');
    u.waterL = 60;
    const chk = sim.checkDemolishModule(dep.id) as construction.DemolishCheck;
    expect(chk.ok).toBe(true);
    expect(chk.waterLossL).toBeCloseTo(40, 6);
    expect(chk.waterCapacityAfterL).toBe(20);
    expect(chk.batteryLossKWh).toBe(0);
    expect(chk.losses).toEqual(['Se perderán 40 L de agua: la capacidad baja a 20 L']);
    u.waterL = 15; // cabe en el colector: no se pierde nada
    expect(construction.checkDemolishModule(sim, dep.id)).toMatchObject({ waterLossL: 0, losses: [] });

    sim.state.unlocks.push('energia');
    give(sim, MATERIALS);
    const bat = build(sim, 'bateria', 0, 2, 0);
    u.batteryKWh = 20;
    const b = construction.checkDemolishModule(sim, bat.id);
    expect(b.batteryLossKWh).toBeCloseTo(20, 6);
    expect(b.batteryCapacityAfterKWh).toBe(0);
    expect(b.losses).toEqual(['Se perderán 20 kWh de las baterías: no quedará ninguna batería']);
    // El aviso previo coincide con lo que pasa al desmontar.
    expect(sim.demolish(bat.id).msg).toMatch(/Se pierden 20 kWh de las baterías/);
    // Una obra sin terminar no guarda nada.
    const r = sim.placeModule('deposito', 1, 9, 3, 0);
    expect(construction.checkDemolishModule(sim, r.moduleId!)).toMatchObject({ waterLossL: 0, batteryLossKWh: 0, losses: [] });
  });

  it('[31] la enfermería solo cura más rápido con energía y solo consume con alguien en una camilla', () => {
    const { sim } = setup();
    sim.state.unlocks.push('enfermeria', 'energia');
    give(sim, MATERIALS);
    const enf = build(sim, 'enfermeria', 0, 1, 3, 0);
    build(sim, 'bateria', 0, 2, 0);
    const u = sim.state.utilities;
    u.batteryKWh = 0;
    sim.tick(0.5);
    // Vacía: no consume (ni avisa de que falta energía).
    expect(u.power.demand).toBe(0);
    expect(utilities.isHealingBedPowered(sim, enf)).toBe(false);
    expect(utilities.healingBedNote(sim, enf)).toBe('Sin energía: cura como una cama normal');
    // Alguien en una camilla: pide 0,3 kW y, sin ninguna fuente, no cura más rápido.
    sim.state.player.sleeping = { moduleId: enf.id, bed: 0, until: null };
    sim.tick(0.5);
    expect(u.power.demand).toBeCloseTo(0.3, 6);
    expect(utilities.isHealingBedPowered(sim, enf)).toBe(false);
    // Con las baterías cargadas, sí.
    u.batteryKWh = 20;
    sim.tick(0.5);
    expect(enf.powered).toBe(true);
    expect(utilities.isHealingBedPowered(sim, enf)).toBe(true);
    expect(utilities.healingBedNote(sim, enf)).toBeNull();
    // Apagada con el interruptor o averiada: cama normal.
    expect(sim.togglePower(enf.id).msg).toBe('Enfermería apagada');
    sim.tick(0.5);
    expect(utilities.isHealingBedPowered(sim, enf)).toBe(false);
    expect(utilities.healingBedNote(sim, enf)).toBe('Apagada: cura como una cama normal');
    sim.togglePower(enf.id);
    enf.status = 'broken';
    sim.tick(0.5);
    expect(utilities.isHealingBedPowered(sim, enf)).toBe(false);
    expect(utilities.healingBedNote(sim, enf)).toBe('Averiada: cura como una cama normal');
    // Una cama normal nunca es «camilla con energía».
    expect(utilities.isHealingBedPowered(sim, mod(sim, 'camarote'))).toBe(false);
  });

  it('[43] una avería del banco de baterías no borra la carga: la conserva y la entrega al repararlo', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, { ...MATERIALS, llave_inglesa: 1, pieza_mecanica: 1 });
    const bat = build(sim, 'bateria', 0, 2, 0);
    const pot = build(sim, 'potabilizadora', 0, 3, 0);
    const u = sim.state.utilities;
    u.batteryKWh = 20;
    sim.togglePower(pot.id); // sin consumo para medir la carga exacta
    sim.tick(0.5);
    expect(u.batteryKWh).toBeCloseTo(20, 6);
    events.startEvent(sim, 'averia', { moduleId: bat.id, scripted: true });
    expect(bat.status).toBe('broken');
    sim.togglePower(pot.id);
    u.waterL = 0;
    run(sim, 30);
    expect(u.batteryKWh).toBeCloseTo(20, 6); // ni se pierde ni se gasta
    expect(u.power.capacityKWh).toBe(25);
    expect(bat.powered).toBe(false);
    expect(pot.powered).toBe(false); // averiada no entrega energía
    expect(texts(notes, /^El banco de baterías no funciona: conserva 20 kWh, pero no dará energía hasta repararlo$/)).toHaveLength(1);
    expect(sim.repair(bat.id)).toEqual({ ok: true, msg: 'Banco de baterías reparado' });
    sim.tick(0.5);
    expect(pot.powered).toBe(true);
    expect(u.batteryKWh).toBeGreaterThan(19.9);
    expect(u.batteryKWh).toBeLessThan(20);
  });

  it('[44] el taller apagado con el interruptor dice «Apagado», no «Sin energía»', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('taller', 'energia');
    give(sim, MATERIALS);
    const taller = build(sim, 'taller', 1, 8, 2, 0);
    build(sim, 'bateria', 0, 2, 0);
    const u = sim.state.utilities;
    u.batteryKWh = 25;
    expect(sim.queueCraft(taller.id, 'pieza_mecanica').ok).toBe(true);
    sim.tick(0.5);
    expect(stations.stationStatus(sim, taller.id)!.status).toBe('Trabajando');
    sim.togglePower(taller.id);
    sim.tick(0.5);
    expect(stations.stationStatus(sim, taller.id)!.status).toBe('Apagado');
    expect(texts(notes, /^El taller mecánico está apagado: enciéndelo para seguir trabajando$/)).toHaveLength(1);
    expect(texts(notes, /no tiene energía/)).toHaveLength(0);
    sim.togglePower(taller.id);
    sim.tick(0.5);
    expect(stations.stationStatus(sim, taller.id)!.status).toBe('Trabajando');
    // Encendido pero sin energía: ahora sí «Sin energía».
    u.batteryKWh = 0;
    sim.tick(0.5);
    sim.tick(0.5);
    expect(stations.stationStatus(sim, taller.id)!.status).toBe('Sin energía');
    expect(texts(notes, /^El taller no tiene energía/)).toHaveLength(1);
  });

  it('[20] los encargos del jugador pasan delante de los de los habitantes (que conservan su avance)', () => {
    const { sim } = setup();
    const cocina = mod(sim, 'cocina');
    addItem(cocina.inventory!, 'pescado_crudo', 4);
    addItem(cocina.inventory!, 'hortaliza', 2);
    addItem(cocina.inventory!, 'agua_potable', 2);
    expect(stations.queueCraft(sim, cocina.id, 'guiso', 1, { by: 'npc' }).ok).toBe(true);
    sim.tick(5);
    expect(cocina.queue[0]!.progress).toBeCloseTo(5, 6);
    expect(stations.queueCraft(sim, cocina.id, 'pescado_asado', 1, { by: 'npc' }).ok).toBe(true);
    expect(sim.queueCraft(cocina.id, 'pescado_asado', 2).ok).toBe(true);
    const st = stations.stationStatus(sim, cocina.id)!;
    expect(st.jobs.map((j) => `${j.recipe.id}${j.byNpc ? '*' : ''}`)).toEqual(['pescado_asado', 'pescado_asado', 'guiso*', 'pescado_asado*']);
    // El primer pescado del jugador sale en 8 min, no tras el guiso.
    run(sim, 8, undefined, 1);
    expect(countItem(cocina.inventory, 'pescado_asado')).toBe(1);
    expect(cocina.queue.find((j) => j.recipeId === 'guiso')!.progress).toBeCloseTo(5, 6);
    // Un segundo encargo del jugador va detrás del suyo, pero delante de los de habitantes.
    expect(sim.queueCraft(cocina.id, 'pescado_asado').ok).toBe(true);
    expect(stations.stationStatus(sim, cocina.id)!.jobs.map((j) => j.byNpc)).toEqual([false, false, true, true]);
  });

  it('[7/9] con el taller averiado y sin piezas, el banco improvisa la pieza y repairInfo lo dice', () => {
    const { sim } = setup();
    sim.state.unlocks.push('taller');
    give(sim, { ...MATERIALS, llave_inglesa: 1 });
    const taller = build(sim, 'taller', 1, 8, 2, 0);
    events.startEvent(sim, 'averia', { moduleId: taller.id, scripted: true });
    expect(taller.status).toBe('broken');
    expect(sim.queueCraft(taller.id, 'pieza_mecanica').ok).toBe(false);
    expect(sim.repairInfo(taller.id).reason).toBe('Necesitas una pieza mecánica: improvísala en el banco de trabajo');
    const banco = mod(sim, 'banco_trabajo');
    const q = sim.queueCraft(banco.id, 'pieza_improvisada');
    expect(q.ok, q.msg).toBe(true);
    run(sim, RECIPES.pieza_improvisada!.time + 1, undefined, 10);
    expect(countItem(banco.inventory, 'pieza_mecanica')).toBe(1);
    expect(sim.repairInfo(taller.id).ok).toBe(true);
    expect(sim.repair(taller.id).ok).toBe(true);
    expect(taller.status).toBe('active');
  });

  it('[9] con el único generador averiado, la pista no manda al taller sin energía', () => {
    const { sim } = setup();
    sim.state.unlocks.push('taller', 'energia');
    give(sim, { ...MATERIALS, llave_inglesa: 1 });
    build(sim, 'taller', 1, 8, 2, 0);
    const gen = build(sim, 'generador', 0, 1, 0);
    addItem(gen.fuelInv!, 'combustible', 1);
    sim.tick(0.5);
    expect(construction.partSourceHint(sim, 'pieza_mecanica')).toBe('fabrícala en el taller o improvísala en el banco de trabajo');
    events.startEvent(sim, 'averia', { moduleId: gen.id, scripted: true });
    sim.tick(0.5);
    expect(sim.repairInfo(gen.id).reason).toBe('Necesitas una pieza mecánica: improvísala en el banco de trabajo');
    // Sin banco ni taller útiles: pecios y mercantes.
    mod(sim, 'banco_trabajo').fire = 10;
    expect(construction.partSourceHint(sim, 'pieza_mecanica')).toBe('búscala en los pecios o cámbiala a un mercante');
  });

  it('[7] un banco de trabajo roto aún puede clavar el kit que lo repara (y nada más)', () => {
    const { sim } = setup();
    const banco = mod(sim, 'banco_trabajo');
    banco.status = 'broken';
    banco.brokenReason = 'Las juntas del suelo ceden';
    banco.condition = 0;
    expect(sim.queueCraft(banco.id, 'tornillos').msg).toBe('El banco de trabajo está averiado (las juntas del suelo ceden): repáralo primero');
    expect(sim.repairInfo(banco.id).reason).toBe('Necesitas un kit de reparación: fabrícalo en el banco de trabajo');
    give(sim, { madera: 3, tornillos: 2, cuerda: 1 });
    const recs = sim.stationRecipes(banco.id);
    expect(recs.find((r) => r.recipe.id === 'kit_reparacion')!.canCraft).toBe(true);
    expect(recs.find((r) => r.recipe.id === 'martillo')!.reason).toMatch(/repáralo primero/);
    expect(sim.queueCraft(banco.id, 'kit_reparacion').ok).toBe(true);
    expect(stations.stationStatus(sim, banco.id)!.status).toBe('Averiado: fabricando su repuesto');
    run(sim, RECIPES.kit_reparacion!.time + 1, undefined, 5);
    expect(countItem(banco.inventory, 'kit_reparacion')).toBe(1);
    expect(sim.repair(banco.id).ok).toBe(true);
    expect(banco.status).toBe('active');
  });

  it('[34] una caja nunca queda sobre el hueco de una escalera nueva ni dentro de un mueble', () => {
    const { sim } = setup();
    give(sim, { madera: 10 });
    expect(sim.demolish(mod(sim, 'almacen').id).ok).toBe(true);
    const crate = sim.state.crates[0]!;
    expect(crate.pos).toEqual({ x: -6, y: 3.2, z: 6 }); // centro de la celda (3,3)
    const r = sim.placeModule('escalera', 0, 3, 3, 3);
    expect(r.ok, r.msg).toBe(true);
    sim.helpBuild(r.moduleId!, 30);
    expect(getCell(sim.layout, 1, 3, 3)!.kind).toBe('stairHigh');
    expect(stations.isValidDropPoint(sim, crate.pos)).toBe(true);
    expect(sim.collision.cellOf(crate.pos)!.kind).toBe('deck');
    expect(sim.collision.groundAt(crate.pos.x, crate.pos.z, crate.pos.y + 0.05)).toBeCloseTo(crate.pos.y, 9);
    expect(Math.hypot(crate.pos.x + 6, crate.pos.z - 6)).toBeLessThan(4);

    // safeDropPoint respeta un punto válido y corrige uno sobre el hueco o dentro de un mueble.
    const good = { ...crate.pos };
    expect(stations.safeDropPoint(sim, good)).toEqual(good);
    const fogon = sim.layout.props.find((p) => p.kind === 'fogon')!;
    for (const bad of [{ x: -6, y: 3.2, z: 6 }, { x: fogon.x, y: 3.2, z: fogon.z }]) {
      expect(stations.isValidDropPoint(sim, bad)).toBe(false);
      const fixed = stations.safeDropPoint(sim, bad);
      expect(stations.isValidDropPoint(sim, fixed)).toBe(true);
      expect(Math.hypot(fixed.x - bad.x, fixed.z - bad.z)).toBeLessThan(4);
    }
  });

  it('[46] textos de la economía con buena concordancia', () => {
    const { sim, notes } = setup();
    sim.state.unlocks.push('energia', 'agua');
    give(sim, MATERIALS);
    const gen = build(sim, 'generador', 0, 1, 0);
    build(sim, 'potabilizadora', 0, 3, 0);
    sim.state.utilities.waterL = 0;
    gen.fuelBurn = 1.2; // poco más de un minuto y nada en la ranura
    sim.tick(0.5);
    expect(texts(notes, /^Al generador le queda combustible para un minuto$/)).toHaveLength(1);
    expect(utilities.agree('Enfermería', 'Apagado')).toBe('Apagada');
    expect(utilities.agree('Taller mecánico', 'Apagado')).toBe('Apagado');
    expect(utilities.agree('Lámparas de cultivo', 'apagado')).toBe('apagadas');
  });
});

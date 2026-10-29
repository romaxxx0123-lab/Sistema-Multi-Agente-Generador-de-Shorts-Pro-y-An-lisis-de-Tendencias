/**
 * Tests del área sim-life: habitantes (necesidades, rutas, camas, comida, trabajo, diálogo),
 * restos flotantes, pesca, cubo, incendios, los 13 tipos de evento, el guion inicial,
 * expediciones y comercio.
 *
 * `quiet(sim)` apaga el director y el guion y fija buen tiempo para que cada prueba controle
 * exactamente qué ocurre; las pruebas de integración usan la partida inicial tal cual.
 */
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { BLUEPRINT_ORDER, TRADE_OFFERS } from '../src/data/loot';
import { REGIONS } from '../src/data/regions';
import { moduleDef } from '../src/data/modules';
import { bedProp } from '../src/sim/actions';
import { DEFAULT_WAKE_HOUR } from '../src/sim/npc';
import { LEVEL_H, MINUTES_PER_DAY } from '../src/sim/constants';
import { buildersOn, repair } from '../src/sim/construction';
import * as debris from '../src/sim/debris';
import * as events from '../src/sim/events';
import { addItem, countItem, countIn } from '../src/sim/inventory';
import { createNewGame } from '../src/sim/newGame';
import * as npc from '../src/sim/npc';
import { deserialize, serialize } from '../src/sim/save';
import { checkPlacement, instantiateModule, isIndoorAt, moduleCenter } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import { plant, tendPlot } from '../src/sim/stations';
import { spawnCrate, storageModules } from '../src/sim/helpers';
import { hourOf } from '../src/sim/time';
import type { ActiveEvent, ModuleInstance, NpcState, Rotation, Vec3 } from '../src/sim/types';
import { forceWeather } from '../src/sim/weather';

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function setup(seed = 11): Simulation {
  return new Simulation(createNewGame(seed));
}

/** Sin director ni guion y con buen tiempo estable. */
function quiet(sim: Simulation): Simulation {
  sim.state.events.nextRollAt = 1e12;
  sim.state.events.scripted = events.SCRIPT.map((s) => s.id);
  const w = sim.state.weather;
  w.kind = 'despejado';
  w.next = 'nublado';
  w.remaining = 1e9;
  return sim;
}

/** Mantiene al jugador con vida (las pruebas largas no van de su supervivencia). */
function keepPlayer(sim: Simulation): void {
  const n = sim.state.player.needs;
  n.hunger = 90;
  n.thirst = 90;
  n.energy = 90;
  n.health = 100;
  n.warmth = 80;
  sim.state.player.sick = 0;
}

function run(sim: Simulation, minutes: number, each?: () => void): void {
  for (let m = 0; m < minutes; m++) {
    keepPlayer(sim);
    sim.tick(1);
    each?.();
  }
}

/** Avanza hasta un minuto absoluto de juego. */
function runUntil(sim: Simulation, time: number, each?: () => void): void {
  run(sim, Math.max(0, Math.ceil(time - sim.state.time)), each);
}

function at(day: number, hour: number): number {
  return (day - 1) * MINUTES_PER_DAY + hour * 60;
}

function mod(sim: Simulation, type: string): ModuleInstance {
  const m = sim.state.ship.modules.find((mm) => mm.type === type);
  if (!m) throw new Error(`no hay ${type}`);
  return m;
}

function npcById(sim: Simulation, id: string): NpcState {
  const n = sim.state.npcs.find((nn) => nn.id === id);
  if (!n) throw new Error(`no existe ${id}`);
  return n;
}

/** Añade un módulo terminado en el primer hueco válido de la cubierta principal (o del nivel dado). */
function addModule(sim: Simulation, type: string, level = 1): ModuleInstance {
  const ship = sim.state.ship;
  for (let x = ship.length - 1; x >= 0; x--) {
    for (let z = 0; z < ship.width; z++) {
      for (const rot of [0, 1, 2, 3] as Rotation[]) {
        if (!checkPlacement(ship, ['taller', 'energia', 'agua', 'enfermeria', 'solar', 'invernadero', 'motor'], type, level, x, z, rot).ok) continue;
        const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
        ship.modules.push(m);
        sim.shipChanged();
        return m;
      }
    }
  }
  throw new Error(`no cabe ${type}`);
}

function storageTotal(sim: Simulation, id: string): number {
  return countIn(storageModules(sim).map((m) => m.inventory), id);
}

/** Jugador junto a la borda de babor (cubierta abierta, celda (5,0)). */
const RAIL: Vec3 = { x: 2, y: LEVEL_H, z: -7.4 };

function placePlayer(sim: Simulation, p: Vec3): void {
  Object.assign(sim.state.player.pos, p);
}

function lastHistory(sim: Simulation, type: string) {
  const h = sim.state.events.history.filter((e) => e.type === type);
  return h[h.length - 1];
}

function onlyActive(sim: Simulation, type: string): ActiveEvent {
  const ev = events.activeEvent(sim, type as events.EventType);
  if (!ev) throw new Error(`no hay evento ${type}`);
  return ev;
}

/* ------------------------------------------------------------------ */
/* Integración: 3 días con la partida inicial                          */
/* ------------------------------------------------------------------ */

describe('integración: tres días a bordo', () => {
  for (const seed of [1, 2, 3]) {
    it(`semilla ${seed}: sin excepciones, posiciones siempre transitables y destinos alcanzados`, () => {
      const sim = setup(seed);
      const started: string[] = [];
      sim.bus.on('worldEventStarted', (e) => started.push(e.type));
      let checks = 0;
      let maxDebris = 0;
      const activities = new Set<string>();
      const prev = new Map<string, Vec3 | null>();
      expect(() =>
        run(sim, 3 * MINUTES_PER_DAY, () => {
          maxDebris = Math.max(maxDebris, sim.state.debris.length);
          for (const n of sim.state.npcs) {
            activities.add(n.activity);
            // Continuidad vertical: andando nunca se cambia de piso de golpe (máx. pendiente de escalera).
            const p0 = prev.get(n.id);
            const here = n.activity === 'away' || npc.isSeated(n) ? null : { ...n.pos };
            if (p0 && here) {
              const dh = Math.hypot(here.x - p0.x, here.z - p0.z);
              if (Math.abs(here.y - p0.y) > dh * 1.0 + 0.5) throw new Error(`${n.name} salta de altura ${p0.y.toFixed(2)} → ${here.y.toFixed(2)} en ${dh.toFixed(2)} m (${n.activity})`);
            }
            prev.set(n.id, here);
            expect(Number.isFinite(n.pos.x) && Number.isFinite(n.pos.y) && Number.isFinite(n.pos.z)).toBe(true);
            for (const k of ['hunger', 'thirst', 'energy', 'mood', 'health'] as const) {
              expect(n.needs[k]).toBeGreaterThanOrEqual(0);
              expect(n.needs[k]).toBeLessThanOrEqual(100);
            }
            if (n.activity === 'away') continue;
            if (npc.isSeated(n)) {
              // Sentado: justo encima de una silla.
              const chair = sim.layout.props.find((p) => p.kind === 'silla' && Math.hypot(p.x - n.pos.x, p.z - n.pos.z) < 0.05);
              if (!chair) throw new Error(`${n.name} sentado fuera de una silla`);
              continue;
            }
            checks++;
            if (!npc.isOnReachableNav(sim, n.pos)) throw new Error(`${n.name} en un punto no transitable ${JSON.stringify(n.pos)} (${n.activity})`);
          }
          // Ningún resto dentro del casco (de popa a la roda).
          const b = debris.hullBounds(sim);
          for (const d of sim.state.debris) {
            if (d.pos.x > b.sternX - 1 && d.pos.x < b.bowX + 8) expect(Math.abs(d.pos.z)).toBeGreaterThan(b.halfW + 1);
          }
        }),
      ).not.toThrow();
      const stats = npc.npcDebugStats(sim);
      expect(checks).toBeGreaterThan(1000);
      expect(stats.arrivals).toBeGreaterThan(100);
      expect(stats.aborts).toBeLessThan(stats.arrivals * 0.05);
      expect(maxDebris).toBeGreaterThan(2);
      expect(maxDebris).toBeLessThanOrEqual(debris.MAX_DEBRIS_TOTAL);
      expect(started.length).toBeGreaterThanOrEqual(5);
      // Se ha vivido de verdad: dormir, comer, andar…
      for (const a of ['sleeping', 'eating', 'walking']) expect(activities.has(a)).toBe(true);
      // La partida se puede guardar y cargar con todo lo que han creado los sistemas.
      const again = new Simulation(deserialize(serialize(sim.state)));
      expect(() => run(again, 60)).not.toThrow();
    }, 60_000);
  }
});

/* ------------------------------------------------------------------ */
/* Habitantes                                                          */
/* ------------------------------------------------------------------ */

describe('habitantes: rutina', () => {
  it('de noche duermen en sus camas', () => {
    const sim = quiet(setup());
    runUntil(sim, at(2, 2));
    for (const n of sim.state.npcs) {
      expect(n.bed).not.toBeNull();
      expect(n.activity).toBe('sleeping');
      expect(n.task?.kind).toBe('dormir');
      const bp = bedProp(sim, n.bed!.moduleId, n.bed!.index)!;
      expect(Math.hypot(bp.prop.x - n.pos.x, bp.prop.z - n.pos.z)).toBeLessThan(3);
      expect(Math.abs(bp.prop.y - n.pos.y)).toBeLessThan(0.5);
    }
    // Y se levantan por la mañana.
    runUntil(sim, at(2, DEFAULT_WAKE_HOUR + 1.5));
    for (const n of sim.state.npcs) expect(n.activity).not.toBe('sleeping');
  });

  it('comen de los almacenes (nunca del inventario del jugador) en una mesa', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    const tomas = npcById(sim, 'npc2');
    tomas.needs.hunger = 30;
    const playerConserva = countItem(sim.state.player.inventory, 'conserva');
    const foodBefore = ['conserva', 'pescado_crudo', 'hortaliza', 'guiso', 'pescado_asado', 'sopa'].reduce((a, id) => a + storageTotal(sim, id), 0);
    let ate = false;
    run(sim, 70, () => {
      if (tomas.activity === 'eating') ate = true;
    });
    expect(ate).toBe(true);
    expect(tomas.needs.hunger).toBeGreaterThan(45);
    const foodAfter = ['conserva', 'pescado_crudo', 'hortaliza', 'guiso', 'pescado_asado', 'sopa'].reduce((a, id) => a + storageTotal(sim, id), 0);
    expect(foodAfter).toBeLessThan(foodBefore + 4); // lo cocinado cuenta, pero algo se ha comido
    expect(countItem(sim.state.player.inventory, 'conserva')).toBe(playerConserva);
  });

  it('beben del depósito de la bodega', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    const marina = npcById(sim, 'npc1');
    marina.needs.thirst = 30;
    const water = sim.state.utilities.waterL;
    let drank = false;
    run(sim, 60, () => {
      if (marina.task?.kind === 'beber' && marina.activity === 'eating' && marina.pos.y < 1) drank = true;
    });
    expect(drank).toBe(true);
    expect(marina.needs.thirst).toBeGreaterThan(50);
    expect(sim.state.utilities.waterL).toBeLessThan(water);
  });

  it('el cocinero cocina pagando solo con los almacenes y aviva el fogón', () => {
    const sim = quiet(setup());
    const alm = mod(sim, 'almacen');
    // Sin conservas: hace falta cocinar.
    alm.inventory!.slots = alm.inventory!.slots.map((s) => (s?.id === 'conserva' ? null : s));
    addItem(alm.inventory!, 'pescado_crudo', 4);
    const playerBefore = JSON.stringify(sim.state.player.inventory);
    runUntil(sim, at(1, 9));
    const cocina = mod(sim, 'cocina');
    let queued = false;
    run(sim, 150, () => {
      if (cocina.queue.some((j) => (j as { by?: string }).by === 'npc')) queued = true;
    });
    expect(queued).toBe(true);
    const cooked = storageTotal(sim, 'guiso') + storageTotal(sim, 'pescado_asado') + storageTotal(sim, 'sopa');
    expect(cooked).toBeGreaterThan(0);
    expect(JSON.stringify(sim.state.player.inventory)).toBe(playerBefore);
  });

  it('el pescador deja sus capturas en el almacén', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 8.5));
    const tomas = npcById(sim, 'npc2');
    npc.setRole(sim, tomas.id, 'pescador');
    const before = storageTotal(sim, 'pescado_crudo');
    let fishing = false;
    run(sim, 6 * 60, () => {
      if (tomas.task?.kind === 'trabajar' && (tomas.task.data as { job?: string }).job === 'pescar' && tomas.activity === 'working') fishing = true;
    });
    expect(fishing).toBe(true);
    expect(storageTotal(sim, 'pescado_crudo') + storageTotal(sim, 'pescado_asado') + storageTotal(sim, 'guiso')).toBeGreaterThan(before);
  });

  it('el jardinero siembra con semillas del almacén y cosecha', () => {
    const sim = quiet(setup());
    const huerto = addModule(sim, 'huerto');
    runUntil(sim, at(1, 8.5));
    const tomas = npcById(sim, 'npc2');
    npc.setRole(sim, tomas.id, 'jardinero');
    const seeds = storageTotal(sim, 'semilla_hortaliza') + storageTotal(sim, 'semilla_lino');
    run(sim, 120);
    const planted = huerto.plots.filter((p) => p.crop).length;
    expect(planted).toBeGreaterThan(0);
    expect(storageTotal(sim, 'semilla_hortaliza') + storageTotal(sim, 'semilla_lino')).toBe(seeds - planted);
    // Maduro: lo cosecha y va al almacén.
    const p0 = huerto.plots.findIndex((p) => p.crop);
    huerto.plots[p0]!.growth = 1;
    const crop = huerto.plots[p0]!.crop!;
    const product = crop === 'lino' ? 'fibra' : 'hortaliza';
    const before = storageTotal(sim, product);
    run(sim, 90);
    expect(storageTotal(sim, product)).toBeGreaterThan(before);
  });

  it('ayudan en las obras (actividad building) y la obra avanza más rápido', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    let placed: { ok: boolean; moduleId?: number } = { ok: false };
    const ship = sim.state.ship;
    for (let x = ship.length - 1; x >= 0 && !placed.ok; x--) for (let z = 0; z < ship.width && !placed.ok; z++) placed = sim.placeModule('camarote', 1, x, z, 0);
    expect(placed.ok).toBe(true);
    let maxBuilders = 0;
    let finishedAt = -1;
    const start = sim.state.time;
    const m = sim.state.ship.modules.find((mm) => mm.id === placed.moduleId)!;
    run(sim, 40, () => {
      maxBuilders = Math.max(maxBuilders, buildersOn(sim, placed.moduleId!));
      if (finishedAt < 0 && m.status === 'active') finishedAt = sim.state.time;
    });
    expect(maxBuilders).toBeGreaterThan(0);
    // Sin ayuda tardaría 40 min: con habitantes trabajando acaba antes.
    expect(finishedAt).toBeGreaterThan(0);
    expect(finishedAt - start).toBeLessThan(moduleDef('camarote').buildTime);
    // Al terminar, nadie se queda "construyendo" una obra que ya no existe.
    expect(sim.state.npcs.some((n) => n.activity === 'building')).toBe(false);
  });

  it('se refugian de la tormenta', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 11));
    forceWeather(sim, 'tormenta', 600, true);
    run(sim, 45);
    for (const n of sim.state.npcs) {
      if (n.activity === 'firefighting' || n.task?.kind === 'apagar') continue;
      expect(isIndoorAt(sim.layout, n.pos.x, n.pos.y, n.pos.z)).toBe(true);
    }
  });

  it('sin cama duermen en el suelo de un interior, y la asignación se ajusta al construir', () => {
    const sim = quiet(setup());
    for (let i = 0; i < 3; i++) npc.spawnSurvivor(sim);
    expect(sim.state.npcs.length).toBe(5);
    const homeless = sim.state.npcs.filter((n) => !n.bed);
    expect(homeless.length).toBe(1);
    runUntil(sim, at(2, 1));
    const h = homeless[0]!;
    expect(h.activity).toBe('sleeping');
    expect((h.task?.data as { bed?: boolean }).bed).toBe(false);
    expect(isIndoorAt(sim.layout, h.pos.x, h.pos.y, h.pos.z)).toBe(true);
    // Un camarote nuevo: todo el mundo tiene cama y las asignaciones son coherentes.
    addModule(sim, 'camarote');
    run(sim, 2);
    for (const n of sim.state.npcs) {
      expect(n.bed).not.toBeNull();
      const m = sim.state.ship.modules.find((mm) => mm.id === n.bed!.moduleId)!;
      expect(m.beds[n.bed!.index]).toBe(n.id);
    }
  });

  it('mueren si se quedan sin comida ni agua: cama libre y luto', () => {
    const sim = quiet(setup());
    const marina = npcById(sim, 'npc1');
    const tomas = npcById(sim, 'npc2');
    const dorm = mod(sim, 'dormitorio');
    marina.needs.hunger = 0;
    marina.needs.thirst = 0;
    marina.needs.health = 0.01;
    const moodBefore = tomas.needs.mood;
    run(sim, 1);
    expect(sim.state.npcs.some((n) => n.id === 'npc1')).toBe(false);
    expect(dorm.beds.includes('npc1')).toBe(false);
    expect(tomas.needs.mood).toBeLessThan(moodBefore - 15);
    expect(sim.state.log.some((l) => l.text.includes('Marina') && l.kind === 'danger')).toBe(true);
  });

  it('los enfermos reposan en la enfermería y se curan antes', () => {
    const sim = quiet(setup());
    const enf = addModule(sim, 'enfermeria', 0);
    runUntil(sim, at(1, 10));
    const tomas = npcById(sim, 'npc2');
    events.startEvent(sim, 'enfermedad', { npcId: tomas.id });
    expect(tomas.sick).toBe(true);
    let rested = false;
    run(sim, 18 * 60, () => {
      if (tomas.task?.kind === 'descansar' && tomas.activity === 'sleeping' && tomas.bed?.moduleId === enf.id) rested = true;
    });
    expect(rested).toBe(true);
    expect(tomas.sick).toBe(false);
    expect(lastHistory(sim, 'enfermedad')?.success).toBe(true);
    // Tras el reposo vuelve a su cama del dormitorio.
    run(sim, 60);
    expect(tomas.bed?.moduleId).toBe(mod(sim, 'dormitorio').id);
    expect(enf.beds.every((b) => b === null)).toBe(true);
  });
});

describe('habitantes: robustez', () => {
  it('el mecánico se levanta de noche para sellar una fuga si tiene con qué', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 23.5));
    const tomas = npcById(sim, 'npc2');
    expect(tomas.activity).toBe('sleeping');
    addItem(mod(sim, 'almacen').inventory!, 'kit_reparacion', 1);
    events.startEvent(sim, 'fuga');
    run(sim, 90);
    expect(lastHistory(sim, 'fuga')?.success).toBe(true);
    expect(mod(sim, 'deposito').leak).toBe(false);
    // Y vuelve a la cama.
    run(sim, 60);
    expect(tomas.activity).toBe('sleeping');
  });

  it('se puede guardar y cargar con habitantes a medio camino', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const walking = () => sim.state.npcs.find((n) => n.activity === 'walking' && n.path.length > 1);
    for (let i = 0; i < 240 && !walking(); i++) run(sim, 1);
    const w = walking()!;
    expect(w).toBeDefined();
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    const again = npcById(loaded, w.id);
    expect(again.task?.kind).toBe(w.task?.kind);
    const before = { ...again.pos };
    run(loaded, 3);
    expect(Math.hypot(again.pos.x - before.x, again.pos.z - before.z)).toBeGreaterThan(0.5);
    expect(npc.isOnReachableNav(loaded, again.pos)).toBe(true);
  });

  it('un expedicionario que no llega a la borda a tiempo embarca igualmente', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const ev = events.startEvent(sim, 'isla')!;
    sim.eventChoice(ev.id, 'expedicion');
    const id = (ev.data as { npcIds: string[] }).npcIds[0]!;
    const n = npcById(sim, id);
    expect(n.task?.kind).toBe('partir');
    // Se le acaba el plazo antes de llegar.
    (n.task!.data as { deadline: number }).deadline = sim.state.time + 0.4;
    run(sim, 1);
    expect(n.activity).toBe('away');
    expect(n.awayUntil).toBe((ev.data as { returnAt: number }).returnAt);
  });

  it('los textos concuerdan con el género del habitante', () => {
    expect(npc.npcAdj({ name: 'Marina' }, 'agotado')).toBe('agotada');
    expect(npc.npcAdj({ name: 'Tomás' }, 'agotado')).toBe('agotado');
    expect(npc.npcAdj({ name: 'Rocío' }, 'herido')).toBe('herida');
    expect(npc.npcAdj({ name: 'Andrés' }, 'enfermo')).toBe('enfermo');
  });
});

describe('habitantes: diálogo y comandos', () => {
  it('talkTo describe su estado, quejas y opciones', () => {
    const sim = quiet(setup());
    const marina = npcById(sim, 'npc1');
    marina.needs.hunger = 10;
    const talk = sim.talkTo('npc1')!;
    expect(talk.name).toBe('Marina');
    expect(talk.roleName).toBe('Cocinera'); // concordado con el habitante (no «Cocinero/a»)
    expect(talk.trait).toBe('Optimista');
    expect(talk.lines.length).toBeGreaterThanOrEqual(2);
    expect(talk.lines.some((l) => /hambre/i.test(l))).toBe(true);
    expect(talk.options.some((o) => o.id === 'charlar')).toBe(true);
    expect(talk.options.some((o) => o.id === 'rol:pescador')).toBe(true);
    expect(sim.talkTo('nadie')).toBeNull();
  });

  it('setRole, charlar y curar', () => {
    const sim = quiet(setup());
    expect(sim.setNpcRole('npc2', 'recolector').ok).toBe(true);
    expect(npcById(sim, 'npc2').role).toBe('recolector');
    expect(sim.setNpcRole('npc2', 'recolector').ok).toBe(false);
    const tomas = npcById(sim, 'npc2');
    const mood = tomas.needs.mood;
    expect(sim.npcOption('npc2', 'charlar').ok).toBe(true);
    expect(tomas.needs.mood).toBeGreaterThan(mood);
    tomas.needs.health = 40;
    expect(sim.npcOption('npc2', 'curar').ok).toBe(false); // sin botiquín
    addItem(sim.state.player.inventory, 'botiquin', 1);
    expect(sim.npcOption('npc2', 'curar').ok).toBe(true);
    expect(tomas.needs.health).toBeGreaterThan(70);
    expect(countItem(sim.state.player.inventory, 'botiquin')).toBe(0);
    expect(sim.npcOption('npc2', 'rol:pescador').ok).toBe(true);
    expect(tomas.role).toBe('pescador');
  });

  it('giveItem: come lo que le das si lo necesita; los materiales van al almacén', () => {
    const sim = quiet(setup());
    const tomas = npcById(sim, 'npc2');
    const inv = sim.state.player.inventory;
    const slot = inv.slots.findIndex((s) => s?.id === 'conserva');
    tomas.needs.hunger = 99;
    expect(sim.giveItemToNpc('npc2', slot).ok).toBe(false); // no tiene hambre
    tomas.needs.hunger = 30;
    expect(sim.giveItemToNpc('npc2', slot).ok).toBe(true);
    expect(tomas.needs.hunger).toBeGreaterThan(60);
    expect(countItem(inv, 'conserva')).toBe(1);
    addItem(inv, 'chatarra', 5);
    const s2 = inv.slots.findIndex((s) => s?.id === 'chatarra');
    const before = storageTotal(sim, 'chatarra');
    expect(sim.giveItemToNpc('npc2', s2).ok).toBe(true);
    expect(storageTotal(sim, 'chatarra')).toBe(before + 5);
    expect(countItem(inv, 'chatarra')).toBe(0);
  });

  it('spawnSurvivor: nombre libre, rasgo, puesto que falta y cama', () => {
    const sim = quiet(setup());
    const n = npc.spawnSurvivor(sim)!;
    expect(['Marina', 'Tomás']).not.toContain(n.name);
    expect(n.role).toBe('pescador');
    expect(n.bed?.moduleId).toBe(mod(sim, 'dormitorio').id);
    expect(npc.isOnReachableNav(sim, n.pos)).toBe(true);
    expect(sim.state.log.some((l) => l.text.includes(n.name) && l.kind === 'good')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Restos, pesca y cubo                                                */
/* ------------------------------------------------------------------ */

describe('restos flotantes', () => {
  it('aparecen por delante de la proa, derivan a popa y se eliminan tras ella', () => {
    const sim = quiet(setup());
    run(sim, 120);
    expect(sim.state.debris.length).toBeGreaterThan(0);
    const d = sim.state.debris[0]!;
    const x0 = d.pos.x;
    run(sim, 5);
    expect(d.pos.x).toBeLessThan(x0 - 5);
    expect(d.loot.length).toBeGreaterThan(0);
    // Sin evento, nunca más del máximo.
    for (let i = 0; i < 40; i++) debris.spawnAmbientDebris(sim);
    expect(sim.state.debris.filter((x) => x.eventId === undefined && !x.survivors).length).toBeLessThanOrEqual(debris.MAX_DEBRIS);
    run(sim, 120);
    const b = debris.hullBounds(sim);
    for (const x of sim.state.debris) expect(x.pos.x).toBeGreaterThanOrEqual(b.sternX - debris.DEBRIS_REMOVE_BEHIND);
  });

  it('fondeados apenas se mueven', () => {
    const sim = quiet(setup());
    sim.state.voyage.anchoredUntil = sim.state.time + 600;
    run(sim, 20);
    const d = debris.spawnDebris(sim, 'caja', { x: 0, z: -15 });
    run(sim, 10);
    expect(Math.abs(d.pos.x)).toBeLessThan(2);
  });

  it('collectDebris: gancho, cubierta y alcance; botín, estadística y tutorial', () => {
    const sim = quiet(setup());
    const d = debris.spawnDebris(sim, 'caja', { x: 2, z: -16 }, { loot: [{ id: 'tela', qty: 3 }] });
    placePlayer(sim, { x: 2, y: 0, z: -2 });
    expect(sim.collectDebris(d.id).ok).toBe(false); // desde la bodega
    placePlayer(sim, RAIL);
    const inv = sim.state.player.inventory;
    const hook = inv.slots.findIndex((s) => s?.id === 'gancho');
    const saved = inv.slots[hook]!;
    inv.slots[hook] = null;
    expect(sim.collectDebris(d.id).msg).toMatch(/gancho/);
    inv.slots[hook] = saved;
    const far = debris.spawnDebris(sim, 'barril', { x: 60, z: -30 });
    expect(sim.collectDebris(far.id).ok).toBe(false);
    const r = sim.collectDebris(d.id);
    expect(r.ok).toBe(true);
    expect(countItem(inv, 'tela')).toBe(3);
    expect(sim.state.player.stats.debrisCollected).toBe(1);
    expect(sim.state.tutorial.done).toContain('gancho');
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(false);
    expect(sim.collectDebris(d.id).ok).toBe(false);
  });

  it('inventario lleno: el botín va a una caja a los pies (nunca se pierde nada)', () => {
    const sim = quiet(setup());
    placePlayer(sim, RAIL);
    const inv = sim.state.player.inventory;
    for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { id: 'madera', qty: 50 };
    const d = debris.spawnDebris(sim, 'caja', { x: 2, z: -16 }, { loot: [{ id: 'tela', qty: 2 }] });
    expect(sim.collectDebris(d.id).ok).toBe(true);
    expect(sim.state.crates.some((c) => countItem(c.inventory, 'tela') === 2)).toBe(true);
  });
});

describe('pesca y cubo', () => {
  it('fishBiteDelay según la región y el banco de peces', () => {
    const sim = quiet(setup());
    for (let i = 0; i < 50; i++) {
      const t = sim.fishBiteDelay();
      expect(t).toBeGreaterThanOrEqual(8 - 1e-9);
      expect(t).toBeLessThanOrEqual(22 + 1e-9);
    }
    events.startEvent(sim, 'banco_peces');
    for (let i = 0; i < 50; i++) expect(sim.fishBiteDelay()).toBeLessThanOrEqual(22 / debris.FISH_BANK_FACTOR + 1e-9);
  });

  it('catchFish: necesita caña y borda; reparto de capturas', () => {
    const sim = quiet(setup());
    placePlayer(sim, RAIL);
    expect(sim.catchFish().msg).toMatch(/caña/);
    addItem(sim.state.player.inventory, 'cana', 1);
    placePlayer(sim, { x: 2, y: LEVEL_H, z: 0 });
    expect(sim.catchFish().msg).toMatch(/borda/);
    placePlayer(sim, RAIL);
    const r = sim.catchFish();
    expect(r.ok).toBe(true);
    expect(sim.state.tutorial.done).toContain('pescar');
    // Distribución (con la tabla de capturas).
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const c = debris.rollCatch(sim);
      counts[c.id] = (counts[c.id] ?? 0) + 1;
    }
    expect(counts['pescado_crudo']! / 2000).toBeGreaterThan(0.8);
    expect(counts['pescado_crudo']! / 2000).toBeLessThan(0.9);
    expect(counts['chatarra']).toBeGreaterThan(0);
  });

  it('fillBucket: cubo vacío → agua de mar, solo desde la borda', () => {
    const sim = quiet(setup());
    placePlayer(sim, { x: 2, y: LEVEL_H, z: 0 });
    expect(sim.fillBucket().ok).toBe(false);
    placePlayer(sim, RAIL);
    expect(sim.fillBucket().ok).toBe(true);
    expect(countItem(sim.state.player.inventory, 'cubo_agua')).toBe(1);
    expect(countItem(sim.state.player.inventory, 'cubo')).toBe(0);
    expect(sim.fillBucket().msg).toMatch(/lleno/);
  });
});

/* ------------------------------------------------------------------ */
/* Incendios                                                           */
/* ------------------------------------------------------------------ */

describe('incendios', () => {
  it('el fuego crece, quema y se apaga a cubos', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const cocina = mod(sim, 'cocina');
    const ev = events.startEvent(sim, 'incendio', { moduleId: cocina.id })!;
    expect(ev.type).toBe('incendio');
    expect(cocina.fire).toBe(events.FIRE_START);
    run(sim, 60);
    expect(cocina.fire).toBeGreaterThan(events.FIRE_START + 4);
    expect(cocina.condition).toBeLessThan(100);
    // Lejos no se puede.
    placePlayer(sim, RAIL);
    addItem(sim.state.player.inventory, 'cubo_agua', 1);
    sim.state.player.inventory.slots = sim.state.player.inventory.slots.map((s) => (s?.id === 'cubo' ? null : s));
    expect(sim.extinguish(cocina.id).msg).toMatch(/Acércate/);
    // Dentro de la cocina (el fuego ya es fuerte: hacen falta dos cubos).
    cocina.fire = 60;
    const c = moduleCenter(cocina, sim.state.ship.width);
    placePlayer(sim, { x: c.x, y: c.y, z: c.z });
    const r1 = sim.extinguish(cocina.id);
    expect(r1.ok).toBe(true);
    expect(countItem(sim.state.player.inventory, 'cubo')).toBe(1);
    expect(sim.extinguish(cocina.id).ok).toBe(false); // el cubo está vacío
    addItem(sim.state.player.inventory, 'cubo_agua', 1);
    expect(sim.extinguish(cocina.id).ok).toBe(true);
    expect(cocina.fire).toBe(0);
    expect(sim.state.player.stats.firesPutOut).toBe(1);
    expect(events.activeEvent(sim, 'incendio')).toBeUndefined();
    expect(lastHistory(sim, 'incendio')?.success).toBe(true);
  });

  it('los habitantes acuden a apagarlo', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    const almacen = mod(sim, 'almacen');
    events.startEvent(sim, 'incendio', { moduleId: almacen.id });
    let fought = false;
    run(sim, 60, () => {
      if (sim.state.npcs.some((n) => n.activity === 'firefighting')) fought = true;
    });
    expect(fought).toBe(true);
    expect(almacen.fire).toBe(0);
    expect(lastHistory(sim, 'incendio')?.success).toBe(true);
  });

  it('sin nadie que lo apague se propaga a los vecinos y quema el contenido', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const almacen = mod(sim, 'almacen');
    const total = () => almacen.inventory!.slots.reduce((a, s) => a + (s?.qty ?? 0), 0);
    const items = total();
    events.startFire(sim, almacen, 90);
    let spread = false;
    run(sim, 14 * 60, () => {
      if (sim.state.ship.modules.some((m) => m.id !== almacen.id && m.fire > 0)) spread = true;
    });
    expect(spread).toBe(true);
    expect(total()).toBeLessThan(items);
    expect(almacen.status).toBe('broken');
    expect(almacen.brokenReason).toMatch(/fuego/);
  });
});

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

describe('eventos: cada tipo se inicia y se resuelve', () => {
  it('bus y diario: worldEventStarted/Ended e historial', () => {
    const sim = quiet(setup());
    const seen: string[] = [];
    sim.bus.on('worldEventStarted', (e) => seen.push(`+${e.type}`));
    sim.bus.on('worldEventEnded', (e) => seen.push(`-${e.type}:${e.success}`));
    const ev = events.startEvent(sim, 'banco_peces')!;
    expect(ev.title).toBe('Banco de peces');
    expect(ev.objectives.length).toBeGreaterThan(0);
    run(sim, events.FISH_BANK_MIN + 1);
    expect(seen).toEqual(['+banco_peces', '-banco_peces:false']);
    expect(lastHistory(sim, 'banco_peces')?.success).toBe(false);
  });

  it('tormenta: daña lo expuesto, despierta al jugador y exige reparar', () => {
    const sim = quiet(setup());
    sim.state.player.sleeping = { moduleId: mod(sim, 'camarote').id, bed: 0, until: null };
    forceWeather(sim, 'tormenta', 300, true);
    run(sim, 1);
    expect(sim.state.player.sleeping).toBeNull();
    const ev = onlyActive(sim, 'tormenta');
    run(sim, 240);
    const damaged = (ev.data as { damaged: number[] }).damaged;
    expect(damaged.length).toBeGreaterThan(0);
    for (const id of damaged) expect(sim.state.ship.modules.find((m) => m.id === id)!.condition).toBeLessThan(100);
    forceWeather(sim, 'despejado', 600, true);
    run(sim, 1);
    if (events.activeEvent(sim, 'tormenta')) {
      expect(ev.stage).toBe(1);
      const alm = mod(sim, 'almacen').inventory!;
      addItem(alm, 'kit_reparacion', 10);
      addItem(alm, 'pieza_mecanica', 10);
      for (const id of damaged) repair(sim, id, { by: 'npc' });
      run(sim, 1);
    }
    expect(events.activeEvent(sim, 'tormenta')).toBeUndefined();
    expect(lastHistory(sim, 'tormenta')?.success).toBe(true);
  });

  it('naufragio: fondear, restos ricos alrededor y cofre con el plano', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'naufragio', { blueprint: 'next' })!;
    expect((ev.data as { blueprint: string }).blueprint).toBe(BLUEPRINT_ORDER[0]);
    expect(sim.state.voyage.sightings.some((s) => s.eventId === ev.id && s.kind === 'naufragio')).toBe(true);
    expect(ev.choices.map((c) => c.id)).toEqual(['rescatar', 'seguir']);
    expect(sim.eventChoice(ev.id, 'rescatar').ok).toBe(true);
    expect(sim.state.voyage.anchoredUntil).toBeGreaterThan(sim.state.time);
    const wreck = sim.state.debris.filter((d) => d.eventId === ev.id);
    expect(wreck.length).toBeGreaterThanOrEqual(events.WRECK_DEBRIS_COUNT[0]);
    expect(wreck.length).toBeLessThanOrEqual(events.WRECK_DEBRIS_COUNT[1]);
    expect(wreck.some((d) => d.kind === 'cofre' && d.loot.some((l) => l.id === BLUEPRINT_ORDER[0]))).toBe(true);
    expect(sim.state.tutorial.done).toContain('timon');
    for (const d of wreck) debris.collectDebrisFor(sim, d.id, 'player', RAIL);
    expect(events.activeEvent(sim, 'naufragio')).toBeUndefined();
    expect(lastHistory(sim, 'naufragio')?.success).toBe(true);
    expect(countItem(sim.state.player.inventory, BLUEPRINT_ORDER[0]!)).toBe(1);
  });

  it('naufragio: seguir rumbo o dejarlo pasar', () => {
    const sim = quiet(setup());
    const a = events.startEvent(sim, 'naufragio')!;
    expect(sim.eventChoice(a.id, 'seguir').ok).toBe(true);
    expect(lastHistory(sim, 'naufragio')?.success).toBeNull();
    const b = events.startEvent(sim, 'naufragio')!;
    run(sim, events.SIGHTING_WINDOW + 1);
    expect(events.eventById(sim, b.id)).toBeUndefined();
    expect(lastHistory(sim, 'naufragio')?.success).toBe(false);
  });

  it('isla: expedición de ida y vuelta con botín a los almacenes', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const ev = events.startEvent(sim, 'isla')!;
    const choice = ev.choices.find((c) => c.id === 'expedicion')!;
    expect(choice.enabled).toBe(true);
    const fruit = storageTotal(sim, 'fruta');
    const wood = storageTotal(sim, 'madera');
    expect(sim.eventChoice(ev.id, 'expedicion').ok).toBe(true);
    expect(sim.state.voyage.anchoredUntil).toBeGreaterThan(sim.state.time + 170);
    const team = (ev.data as { npcIds: string[] }).npcIds.map((id) => npcById(sim, id));
    expect(team.length).toBe(1);
    const member = team[0]!;
    expect(member.task?.kind).toBe('partir');
    run(sim, 20);
    expect(member.activity).toBe('away');
    expect(member.awayUntil).not.toBeNull();
    const hunger = member.needs.hunger;
    runUntil(sim, (member.awayUntil as number) - 1);
    expect(member.needs.hunger).toBe(hunger); // fuera no se simula a bordo
    run(sim, 3);
    expect(member.awayUntil).toBeNull();
    expect(member.activity).not.toBe('away');
    expect(npc.isOnReachableNav(sim, member.pos)).toBe(true);
    expect(storageTotal(sim, 'fruta') + sim.state.crates.reduce((a, c) => a + countItem(c.inventory, 'fruta'), 0)).toBeGreaterThan(fruit);
    expect(storageTotal(sim, 'madera')).toBeGreaterThanOrEqual(wood);
    expect(lastHistory(sim, 'isla')?.success).toBe(true);
  });

  it('isla: sin nadie disponible la expedición está desactivada con motivo', () => {
    const sim = quiet(setup());
    for (const n of sim.state.npcs) n.injured = true;
    const ev = events.startEvent(sim, 'isla')!;
    const c = ev.choices.find((cc) => cc.id === 'expedicion')!;
    expect(c.enabled).toBe(false);
    expect(c.reason).toMatch(/disponible/);
    expect(sim.eventChoice(ev.id, 'expedicion').ok).toBe(false);
  });

  it('expedición: se puede guardar y cargar a mitad y vuelven igual', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const ev = events.startEvent(sim, 'estructura')!;
    sim.eventChoice(ev.id, 'expedicion');
    run(sim, 40);
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    const id = (ev.data as { npcIds: string[] }).npcIds[0]!;
    expect(npcById(loaded, id).activity).toBe('away');
    run(loaded, events.STRUCTURE_EXPEDITION_MIN);
    expect(npcById(loaded, id).awayUntil).toBeNull();
    expect(lastHistory(loaded, 'estructura')?.success).toBe(true);
    // La estructura trae componentes y, la mitad de las veces, el plano pendiente (y se dice).
    expect(storageTotal(loaded, 'componentes')).toBeGreaterThan(0);
    const bp = storageTotal(loaded, BLUEPRINT_ORDER[0]!) + loaded.state.crates.reduce((a, c) => a + countItem(c.inventory, BLUEPRINT_ORDER[0]!), 0);
    expect(bp).toBeLessThanOrEqual(1);
    const back = loaded.state.log.filter((l) => /vuelven? de la estructura/.test(l.text)).pop()!;
    expect(/sala de control/.test(back.text)).toBe(bp === 1);
  });

  it('náufragos: el gancho sube a bordo al superviviente, que se une y recibe cama', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'naufragos', { survivors: 1 })!;
    const raft = sim.state.debris.find((d) => d.eventId === ev.id)!;
    expect(raft.kind).toBe('balsa');
    expect(raft.survivors).toBe(1);
    raft.pos.x = 2; // ya está a la altura del jugador
    placePlayer(sim, RAIL);
    const r = sim.collectDebris(raft.id);
    expect(r.ok).toBe(true);
    expect(sim.state.npcs.length).toBe(3);
    const newcomer = sim.state.npcs[2]!;
    expect(newcomer.bed?.moduleId).toBe(mod(sim, 'dormitorio').id);
    expect(mod(sim, 'dormitorio').beds[newcomer.bed!.index]).toBe(newcomer.id);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
  });

  it('náufragos: si la balsa pasa de largo, fracaso', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 23)); // de noche: nadie la engancha
    events.startEvent(sim, 'naufragos', { survivors: 2 });
    run(sim, 120);
    expect(events.activeEvent(sim, 'naufragos')).toBeUndefined();
    expect(lastHistory(sim, 'naufragos')?.success).toBe(false);
    expect(sim.state.npcs.length).toBe(2);
  });

  it('náufragos: un recolector los rescata por su cuenta', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    sim.setNpcRole('npc2', 'recolector');
    events.startEvent(sim, 'naufragos', { survivors: 1 });
    run(sim, 90);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
    expect(sim.state.npcs.length).toBe(3);
  });

  it('avería de una máquina: se repara con llave inglesa y pieza mecánica', () => {
    const sim = quiet(setup());
    const gen = addModule(sim, 'generador');
    const ev = events.startEvent(sim, 'averia', { moduleId: gen.id })!;
    expect(gen.status).toBe('broken');
    expect(ev.objectives[0]!.text).toMatch(/llave inglesa/);
    expect(sim.repair(gen.id).ok).toBe(false);
    addItem(sim.state.player.inventory, 'llave_inglesa', 1);
    addItem(sim.state.player.inventory, 'pieza_mecanica', 1);
    expect(sim.repair(gen.id).ok).toBe(true);
    run(sim, 1);
    expect(lastHistory(sim, 'averia')?.success).toBe(true);
  });

  it('avería estructural: el mecánico la repara con un kit del almacén', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const alm = mod(sim, 'almacen');
    const ev = events.startEvent(sim, 'averia', { moduleId: alm.id })!;
    expect((ev.data as { structural: boolean }).structural).toBe(true);
    expect(alm.condition).toBeLessThanOrEqual(65);
    run(sim, 1);
    expect(events.activeEvent(sim, 'averia')).toBeDefined(); // sigue: hay que repararla de verdad
    addItem(alm.inventory!, 'kit_reparacion', 1);
    const playerBefore = JSON.stringify(sim.state.player.inventory);
    run(sim, 120);
    expect(lastHistory(sim, 'averia')?.success).toBe(true);
    expect(alm.condition).toBe(100);
    expect(countItem(alm.inventory, 'kit_reparacion')).toBe(0);
    expect(JSON.stringify(sim.state.player.inventory)).toBe(playerBefore);
  });

  it('avería estructural sin kits: el mecánico fabrica el kit con materiales del almacén', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const alm = mod(sim, 'almacen');
    events.startEvent(sim, 'averia', { moduleId: alm.id });
    run(sim, 4 * 60);
    expect(lastHistory(sim, 'averia')?.success).toBe(true);
  });

  it('banco de peces: pesca más rápida y éxito si se pesca', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'banco_peces')!;
    addItem(sim.state.player.inventory, 'cana', 1);
    placePlayer(sim, RAIL);
    for (let i = 0; i < 10 && sim.state.player.stats.fishCaught === 0; i++) expect(sim.catchFish().ok).toBe(true);
    expect(sim.state.player.stats.fishCaught).toBeGreaterThan(0);
    expect((ev.data as { catches: number }).catches).toBeGreaterThan(0);
    run(sim, events.FISH_BANK_MIN + 1);
    expect(lastHistory(sim, 'banco_peces')?.success).toBe(true);
  });

  it('mercante: cuatro ofertas, cada una una vez', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'mercante')!;
    const offers = events.tradeOffers(sim, ev.id);
    expect(offers.length).toBe(4);
    expect(sim.state.voyage.sightings.some((s) => s.kind === 'mercante' && s.eventId === ev.id)).toBe(true);
    const o = offers[0]!;
    const gets = Object.entries(o.get).map(([id]) => [id, countItem(sim.state.player.inventory, id)] as const);
    if (!o.canAfford) {
      // Sin lo que pide, no hay trato (y dice qué falta); con ello, sí.
      const r0 = sim.trade(ev.id, 0);
      expect(r0.ok).toBe(false);
      expect(r0.msg).toMatch(/faltan/i);
      for (const [id, q] of Object.entries(o.give)) addItem(sim.state.player.inventory, id, q);
    }
    expect(sim.trade(ev.id, 0).ok).toBe(true);
    for (const [id, before] of gets) expect(countItem(sim.state.player.inventory, id)).toBeGreaterThan(before);
    expect(sim.trade(ev.id, 0).ok).toBe(false);
    expect(sim.eventChoice(ev.id, 'despedir').ok).toBe(true);
    expect(lastHistory(sim, 'mercante')?.success).toBe(true);
    expect(sim.trade(ev.id, 1).ok).toBe(false);
  });

  it('plaga: se retira a tiempo o mata las plantas en 24 h', () => {
    const sim = quiet(setup());
    const huerto = addModule(sim, 'huerto');
    addItem(sim.state.player.inventory, 'semilla_hortaliza', 4);
    for (let i = 0; i < 4; i++) expect(plant(sim, huerto.id, i, 'semilla_hortaliza').ok).toBe(true);
    const ev = events.startEvent(sim, 'plaga')!;
    const plots = (ev.data as { plots: { plot: number }[] }).plots;
    expect(plots.length).toBeGreaterThanOrEqual(1);
    for (const p of plots) expect(tendPlot(sim, huerto.id, p.plot).ok).toBe(true);
    run(sim, 1);
    expect(lastHistory(sim, 'plaga')?.success).toBe(true);
    // Segunda plaga sin atender.
    sim.state.events.cooldowns = {};
    const ev2 = events.startEvent(sim, 'plaga')!;
    const n2 = (ev2.data as { plots: unknown[] }).plots.length;
    run(sim, events.PEST_DEADLINE_MIN + 1);
    expect(lastHistory(sim, 'plaga')?.success).toBe(false);
    expect(huerto.plots.filter((p) => p.dead).length).toBeGreaterThanOrEqual(n2);
  });

  it('fuga: el depósito pierde agua hasta sellarla', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const dep = mod(sim, 'deposito');
    events.startEvent(sim, 'fuga');
    expect(dep.leak).toBe(true);
    const w = sim.state.utilities.waterL;
    run(sim, 60);
    expect(sim.state.utilities.waterL).toBeLessThan(w - 4);
    addItem(sim.state.player.inventory, 'kit_reparacion', 1);
    expect(sim.repair(dep.id).ok).toBe(true);
    run(sim, 1);
    expect(lastHistory(sim, 'fuga')?.success).toBe(true);
  });

  it('enfermedad: un botiquín la cura', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'enfermedad', { npcId: 'npc1' })!;
    expect(ev.title).toMatch(/Marina/);
    expect(npcById(sim, 'npc1').sick).toBe(true);
    const h0 = npcById(sim, 'npc1').needs.health;
    run(sim, 120);
    expect(npcById(sim, 'npc1').needs.health).toBeLessThan(h0);
    addItem(sim.state.player.inventory, 'botiquin', 1);
    expect(sim.talkTo('npc1')!.options.find((o) => o.id === 'curar')?.enabled).toBe(true);
    expect(sim.npcOption('npc1', 'curar').ok).toBe(true);
    expect(npcById(sim, 'npc1').sick).toBe(false);
    expect(lastHistory(sim, 'enfermedad')?.success).toBe(true);
  });

  it('discusión: discuten y el jugador media', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    for (const n of sim.state.npcs) n.needs.mood = 30;
    expect(events.canStartEvent(sim, 'discusion')).toBe(true);
    const ev = events.startEvent(sim, 'discusion')!;
    run(sim, 20);
    expect(sim.state.npcs.some((n) => n.task?.kind === 'discutir')).toBe(true);
    const talk = sim.talkTo('npc1')!;
    expect(talk.options.some((o) => o.id === 'mediar' && o.enabled)).toBe(true);
    expect(sim.npcOption('npc1', 'mediar').ok).toBe(true);
    expect(events.eventById(sim, ev.id)).toBeUndefined();
    expect(lastHistory(sim, 'discusion')?.success).toBe(true);
    for (const n of sim.state.npcs) expect(n.needs.mood).toBeGreaterThanOrEqual(44);
    expect(sim.state.npcs.some((n) => n.task?.kind === 'discutir')).toBe(false);
  });

  it('discusión: sin mediar se enquista', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    for (const n of sim.state.npcs) n.needs.mood = 20;
    events.startEvent(sim, 'discusion');
    run(sim, events.DISCUSSION_MAX_MIN + 1);
    expect(lastHistory(sim, 'discusion')?.success).toBe(false);
  });

  it('estructura: expedición de 2 h', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const ev = events.startEvent(sim, 'estructura')!;
    expect(ev.choices[0]!.label).toMatch(/2 h/);
    expect(sim.eventChoice(ev.id, 'expedicion').ok).toBe(true);
    run(sim, events.STRUCTURE_EXPEDITION_MIN + 5);
    expect(lastHistory(sim, 'estructura')?.success).toBe(true);
  });

  it('todos los tipos tienen texto en español y opciones válidas', () => {
    const sim = quiet(setup());
    addModule(sim, 'huerto');
    const h = sim.state.ship.modules.find((m) => m.type === 'huerto')!;
    h.plots[0]!.crop = 'hortaliza';
    for (const n of sim.state.npcs) n.needs.mood = 30;
    for (const type of events.EVENT_TYPES) {
      // La llegada solo ocurre en Puerto Esperanza.
      if (type === 'llegada') sim.state.voyage.regionId = 'esperanza';
      const ev = events.startEvent(sim, type);
      expect(ev, type).toBeTruthy();
      expect(ev!.title.length).toBeGreaterThan(3);
      expect(ev!.description.length).toBeGreaterThan(20);
      for (const c of ev!.choices) expect(c.label.length).toBeGreaterThan(3);
    }
    expect(() => run(sim, 60)).not.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Director y guion                                                    */
/* ------------------------------------------------------------------ */

describe('director y guion inicial', () => {
  it('guion: naufragio con planos en orden, náufragos, mercante, isla y otro naufragio el día 5', () => {
    const sim = setup(5);
    sim.state.events.nextRollAt = 1e12; // solo el guion
    const log: { type: string; at: number; ev: ActiveEvent }[] = [];
    sim.bus.on('worldEventStarted', (e) => {
      const ev = events.eventById(sim, e.eventId)!;
      log.push({ type: e.type, at: sim.state.time, ev });
    });
    runUntil(sim, at(1, 13) + 1);
    const first = log.find((l) => l.type === 'naufragio')!;
    expect(first.at).toBeGreaterThanOrEqual(at(1, 13));
    expect(first.at).toBeLessThan(at(1, 13) + 1);
    expect((first.ev.data as { blueprint: string }).blueprint).toBe(BLUEPRINT_ORDER[0]);
    sim.eventChoice(first.ev.id, 'rescatar');
    for (const d of sim.state.debris.filter((x) => x.eventId === first.ev.id)) debris.collectDebrisFor(sim, d.id, 'player', RAIL);
    expect(countItem(sim.state.player.inventory, BLUEPRINT_ORDER[0]!)).toBe(1);
    runUntil(sim, at(5, 16) + 2);
    const scripted = log.filter((l) => l.type !== 'tormenta' && l.type !== 'incendio' && l.type !== 'enfermedad');
    const seq = scripted.map((l) => `${l.type}@${Math.floor(l.at)}`);
    expect(seq).toContain(`naufragos@${at(2, 10)}`);
    expect(seq).toContain(`mercante@${at(3, 11)}`);
    expect(seq).toContain(`isla@${at(4, 10)}`);
    expect(seq).toContain(`naufragio@${at(5, 16)}`);
    // El segundo plano garantizado llega el día 5 (ritmo de progresión), no el 3.
    expect(seq).not.toContain(`naufragio@${at(3, 16)}`);
    const second = scripted.find((l) => l.type === 'naufragio' && l.at >= at(5, 16))!;
    expect((second.ev.data as { blueprint: string }).blueprint).toBe(BLUEPRINT_ORDER[1]);
    expect(sim.state.events.scripted).toEqual(expect.arrayContaining(events.SCRIPT.map((s) => s.id)));
  });

  it('el director respeta enfriamientos, día mínimo y condiciones', () => {
    const sim = quiet(setup());
    let w = events.eventWeights(sim);
    // Día 1: nada de incendios, averías, plagas…
    for (const t of ['incendio', 'averia', 'plaga', 'enfermedad', 'discusion', 'isla', 'mercante']) expect(w[t as events.EventType]).toBeUndefined();
    expect(w.calma).toBeGreaterThan(0);
    sim.state.time = at(3, 12);
    sim.state.events.scripted = events.SCRIPT.map((s) => s.id);
    w = events.eventWeights(sim);
    expect(w.averia).toBeGreaterThan(0);
    expect(w.plaga).toBeUndefined(); // no hay nada plantado
    events.startEvent(sim, 'averia');
    w = events.eventWeights(sim);
    expect(w.averia).toBeUndefined(); // activo y en enfriamiento
    // De noche no hay avistamientos.
    sim.state.time = at(3, 2);
    w = events.eventWeights(sim);
    expect(w.naufragio).toBeUndefined();
    expect(w.mercante).toBeUndefined();
  });

  it('el director lanza eventos cada 150–300 min', () => {
    const sim = setup(9);
    sim.state.events.scripted = events.SCRIPT.map((s) => s.id);
    const starts: number[] = [];
    sim.bus.on('worldEventStarted', (e) => {
      if (e.type !== 'tormenta' && e.type !== 'incendio') starts.push(sim.state.time);
    });
    run(sim, 4 * MINUTES_PER_DAY);
    expect(starts.length).toBeGreaterThanOrEqual(4);
    expect(starts.length).toBeLessThanOrEqual(4 * 10);
    expect(hourOf(sim.state.time)).toBeCloseTo(7, 0);
  });
});

/* ------------------------------------------------------------------ */
/* Módulos sin uso en el resto de pruebas                              */
/* ------------------------------------------------------------------ */

describe('coherencia de datos', () => {
  it('nombres de restos y tipos', () => {
    for (const k of Object.keys(debris.DEBRIS_NAMES)) expect(debris.DEBRIS_NAMES[k as keyof typeof debris.DEBRIS_NAMES].length).toBeGreaterThan(2);
    expect(moduleDef('dormitorio').beds).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/* Subsistencia, emergencias y consecuencias reales                    */
/* ------------------------------------------------------------------ */

/** Quita toda la comida de almacenes, despensa y bandejas (y lo que haya al fuego). */
function emptyFood(sim: Simulation): void {
  for (const m of sim.state.ship.modules) {
    if (m.type === 'cocina') m.queue = [];
    if (!m.inventory) continue;
    m.inventory.slots = m.inventory.slots.map((s) => (s && ITEMS[s.id]?.category === 'comida' ? null : s));
  }
}

/** Quita un objeto de todos los inventarios de módulos. */
function removeEverywhere(sim: Simulation, id: string): void {
  for (const m of sim.state.ship.modules) if (m.inventory) m.inventory.slots = m.inventory.slots.map((s) => (s && s.id === id ? null : s));
}

describe('habitantes: subsistencia', () => {
  it('con la despensa vacía salen a pescar aunque no sea su puesto (y se les ve trabajando)', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 8.5));
    emptyFood(sim);
    const catches = new Map<object, number>();
    let workingAtRail = false;
    run(sim, 4 * 60, () => {
      for (const n of sim.state.npcs) {
        const d = n.task?.data as { job?: string; catches?: number } | undefined;
        if (n.task?.kind !== 'trabajar' || d?.job !== 'pescar') continue;
        catches.set(d, d.catches ?? 0);
        if (n.activity === 'working') workingAtRail = true;
      }
    });
    expect(sim.state.npcs.every((n) => n.role !== 'pescador')).toBe(true);
    expect(workingAtRail).toBe(true);
    let total = 0;
    for (const c of catches.values()) total += c;
    expect(total).toBeGreaterThanOrEqual(3);
  });

  it('si solo queda pescado crudo, lo asan en el fogón antes que comérselo crudo', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    sim.state.npcs = sim.state.npcs.filter((n) => n.id === 'npc2'); // sin la cocinera
    emptyFood(sim);
    const alm = mod(sim, 'almacen');
    addItem(alm.inventory!, 'pescado_crudo', 3);
    const tomas = npcById(sim, 'npc2');
    tomas.needs.hunger = 30;
    let roasted = false;
    let ateRaw = false;
    let minFish = Infinity;
    run(sim, 120, () => {
      if (mod(sim, 'cocina').queue.some((j) => j.recipeId === 'pescado_asado')) roasted = true;
      if (tomas.carry?.id === 'pescado_crudo') ateRaw = true;
      minFish = Math.min(minFish, storageTotal(sim, 'pescado_crudo'));
    });
    expect(roasted).toBe(true);
    expect(ateRaw).toBe(false);
    expect(tomas.needs.hunger).toBeGreaterThan(45);
    // El pescado del asado sale del almacén (luego puede volver a pescar y reponerlo).
    expect(minFish).toBeLessThan(3);
    // Nunca paga con el inventario del jugador.
    expect(countItem(sim.state.player.inventory, 'pescado_crudo')).toBe(0);
  });

  for (const seed of [2, 5]) {
    it(`semilla ${seed}: sin ayuda del jugador, la tripulación inicial sobrevive cinco días`, () => {
      const sim = setup(seed);
      const deaths: string[] = [];
      run(sim, 5 * MINUTES_PER_DAY, () => {
        for (const l of sim.state.log.slice(-3)) if (/ha muerto|no ha superado/.test(l.text) && !deaths.includes(l.text)) deaths.push(l.text);
      });
      expect(deaths).toEqual([]);
      for (const id of ['npc1', 'npc2']) expect(npcById(sim, id).needs.health).toBeGreaterThan(0);
    }, 60_000);
  }

  it('sin agua a bordo destilan agua de mar: cubo del almacén → borda → fogón', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    sim.state.utilities.waterL = 0;
    removeEverywhere(sim, 'agua_potable');
    addItem(mod(sim, 'almacen').inventory!, 'cubo', 1);
    for (const n of sim.state.npcs) n.needs.thirst = 18;
    const seen = new Set<string>();
    let distilled = false;
    const playerBefore = JSON.stringify(sim.state.player.inventory);
    run(sim, 3 * 60, () => {
      for (const n of sim.state.npcs) {
        const job = (n.task?.data as { job?: string } | undefined)?.job;
        if (job) seen.add(job);
      }
      if (mod(sim, 'cocina').queue.some((j) => j.recipeId === 'destilar')) distilled = true;
    });
    for (const job of ['coger_cubo', 'llenar_cubo', 'destilar']) expect(seen.has(job)).toBe(true);
    expect(distilled).toBe(true);
    // Han bebido el agua destilada (los depósitos siguen vacíos).
    expect(sim.state.utilities.waterL).toBeLessThan(1);
    for (const n of sim.state.npcs) expect(n.needs.thirst).toBeGreaterThan(30);
    // El cubo no se pierde y el jugador no ha pagado nada.
    expect(storageTotal(sim, 'cubo') + storageTotal(sim, 'cubo_agua') + sim.state.npcs.filter((n) => n.carry?.id.startsWith('cubo')).length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(sim.state.player.inventory)).toBe(playerBefore);
  });

  it('sin agua ni cubos, fabrican un cubo en el banco con materiales del almacén', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    sim.state.utilities.waterL = 0;
    removeEverywhere(sim, 'agua_potable');
    for (const n of sim.state.npcs) n.needs.thirst = 18;
    const bench = mod(sim, 'banco_trabajo');
    let crafted = false;
    run(sim, 2 * 60, () => {
      if (bench.queue.some((j) => j.recipeId === 'cubo')) crafted = true;
    });
    expect(crafted).toBe(true);
    expect(storageTotal(sim, 'cubo') + countItem(bench.inventory, 'cubo') + countItem(bench.inventory, 'cubo_agua') + storageTotal(sim, 'cubo_agua') + mod(sim, 'cocina').queue.filter((j) => j.recipeId === 'destilar').length + sim.state.npcs.filter((n) => n.carry?.id.startsWith('cubo')).length).toBeGreaterThanOrEqual(1);
  });

  it('con los almacenes llenos no pescan ni rescatan restos (y avisan de que falta sitio)', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    sim.setNpcRole('npc1', 'pescador');
    sim.setNpcRole('npc2', 'recolector');
    for (const m of storageModules(sim)) m.inventory!.slots = m.inventory!.slots.map(() => ({ id: 'placa_metal', qty: 30 }));
    debris.spawnDebris(sim, 'tablones', { x: 10, z: -14 });
    const notes: string[] = [];
    sim.bus.on('notify', (e) => notes.push(e.text));
    let gathering = false;
    run(sim, 60, () => {
      for (const n of sim.state.npcs) {
        const job = (n.task?.data as { job?: string } | undefined)?.job;
        if (job === 'gancho' || job === 'pescar') gathering = true;
      }
    });
    expect(gathering).toBe(false);
    expect(notes.some((t) => /almacenes están llenos/.test(t))).toBe(true);
    expect(sim.state.crates.map((c) => c.label)).not.toContain('Capturas');
    expect(sim.state.crates.map((c) => c.label)).not.toContain('Restos rescatados');
  });

  it('comen de las cajas sueltas de cubierta si en los almacenes no queda nada', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    emptyFood(sim);
    spawnCrate(sim, { x: 6, y: LEVEL_H, z: -2 }, [{ id: 'pescado_asado', qty: 3 }], 'Capturas');
    const marina = npcById(sim, 'npc1');
    marina.needs.hunger = 30;
    run(sim, 90);
    expect(marina.needs.hunger).toBeGreaterThan(45);
    const left = sim.state.crates.reduce((a, c) => a + countItem(c.inventory, 'pescado_asado'), 0) + storageTotal(sim, 'pescado_asado');
    expect(left).toBeLessThan(3);
  });

  it('recogen las cajas sueltas y guardan su contenido en el almacén (si cabe)', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const before = storageTotal(sim, 'madera');
    spawnCrate(sim, { x: 10, y: LEVEL_H, z: 2 }, [{ id: 'madera', qty: 7 }, { id: 'tela', qty: 2 }], 'Restos rescatados');
    let tidying = false;
    run(sim, 4 * 60, () => {
      if (sim.state.npcs.some((n) => (n.task?.data as { job?: string } | undefined)?.job === 'ordenar')) tidying = true;
    });
    expect(tidying).toBe(true);
    expect(sim.state.crates.length).toBe(0);
    expect(storageTotal(sim, 'madera')).toBeGreaterThanOrEqual(before + 7 - 6); // el fogón puede gastar algo de leña
    expect(storageTotal(sim, 'tela')).toBeGreaterThanOrEqual(6);
    for (const n of sim.state.npcs) expect(n.carry?.id === 'madera' || n.carry?.id === 'tela').toBe(false);
  });

  it('avisan en el diario cuando alguien está grave (antes de que muera)', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    emptyFood(sim);
    const marina = npcById(sim, 'npc1');
    marina.needs.hunger = 0;
    marina.needs.health = npc.GRAVE_HEALTH + 3;
    run(sim, 60);
    const warn = sim.state.log.filter((l) => l.kind === 'danger' && l.text.startsWith('Marina') && /hambre/.test(l.text));
    expect(warn.length).toBe(1);
    expect(marina.needs.health).toBeGreaterThan(0);
    // Solo una vez mientras siga grave.
    run(sim, 30);
    expect(sim.state.log.filter((l) => l.kind === 'danger' && l.text.startsWith('Marina') && /hambre/.test(l.text)).length).toBe(1);
  });

  it('guardando cama, la enfermedad se cura en un día (más rápido en la enfermería)', () => {
    let cured = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = quiet(setup(seed));
      sim.state.npcs = sim.state.npcs.filter((n) => n.id === 'npc1');
      events.startEvent(sim, 'enfermedad', { npcId: 'npc1' });
      run(sim, 40 * 60);
      if (!npcById(sim, 'npc1').sick) cured++;
    }
    // Reposan en su cama: P(curarse en 40 h) ≈ 95 %, casi todos.
    expect(cured).toBeGreaterThanOrEqual(4);
  });

  it('los factores del ánimo se explican en español y suman el objetivo', () => {
    const sim = quiet(setup());
    const marina = npcById(sim, 'npc1');
    const f = npc.npcMoodFactors(sim, marina);
    expect(f[0]).toEqual({ label: 'Ánimo de base', value: 60 });
    expect(f.some((x) => /optimista/.test(x.label) && x.value > 0)).toBe(true);
    expect(f.some((x) => /dormitorio/.test(x.label))).toBe(true);
    const sum = f.reduce((a, x) => a + x.value, 0);
    expect(npc.npcMoodTarget(sim, marina)).toBe(Math.max(0, Math.min(100, sum)));
    marina.sick = true;
    expect(npc.npcMoodFactors(sim, marina).some((x) => x.label === 'Está enferma' && x.value < 0)).toBe(true);
  });
});

describe('emergencias: balsas, tormentas y averías', () => {
  it('balsa: sin recolector nadie la rescata por el jugador, pero dan la voz de alarma', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    expect(sim.state.npcs.every((n) => n.trait !== 'valiente' && n.role !== 'recolector' && n.role !== 'libre')).toBe(true);
    events.startEvent(sim, 'naufragos', { survivors: 1 });
    let alerted = false;
    run(sim, 90, () => {
      if (sim.state.npcs.some((n) => n.say && /balsa|Náufragos/i.test(n.say.text))) alerted = true;
    });
    expect(alerted).toBe(true);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(false);
    expect(sim.state.npcs.length).toBe(2);
  });

  it('balsa: si se escapa, quien es valiente acude con el gancho (después de dar la oportunidad al jugador)', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    npcById(sim, 'npc2').trait = 'valiente';
    const ev = events.startEvent(sim, 'naufragos', { survivors: 1 })!;
    const raft = sim.state.debris.find((d) => d.eventId === ev.id)!;
    const b = debris.hullBounds(sim);
    let alerted = false;
    let tooEarly = false;
    run(sim, 90, () => {
      if (sim.state.npcs.some((n) => n.say && /balsa|Náufragos/i.test(n.say.text))) alerted = true;
      const r = sim.state.debris.find((d) => d.id === raft.id);
      const hooking = sim.state.npcs.some((n) => (n.task?.data as { debrisId?: number } | undefined)?.debrisId === raft.id);
      if (r && hooking && r.pos.x > b.bowX + 8 && sim.state.time - ev.startedAt < npc.RAFT_PLAYER_FIRST_MIN) tooEarly = true;
    });
    expect(alerted).toBe(true);
    // Primero se deja la oportunidad al jugador; solo cuando la balsa llega a la proa acuden ellos.
    expect(tooEarly).toBe(false);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
    expect(sim.state.npcs.length).toBe(3);
  });

  it('tormenta: un golpe de mar hiere a quien sigue en cubierta, no a quien está a cubierto', () => {
    const sim = quiet(setup());
    forceWeather(sim, 'tormenta', 600, true);
    placePlayer(sim, RAIL);
    const marina = npcById(sim, 'npc1');
    const tomas = npcById(sim, 'npc2');
    Object.assign(marina.pos, { x: 6, y: LEVEL_H, z: -6 }); // cubierta abierta
    const cam = moduleCenter(mod(sim, 'camarote'), sim.state.ship.width);
    Object.assign(tomas.pos, { x: cam.x, y: cam.y, z: cam.z }); // bajo techo
    expect(isIndoorAt(sim.layout, tomas.pos.x, tomas.pos.y, tomas.pos.z)).toBe(true);
    const h0 = sim.state.player.needs.health;
    events.stormWaveHits(sim, 1);
    expect(sim.state.player.needs.health).toBeLessThanOrEqual(h0 - events.STORM_WAVE_DAMAGE[0]);
    expect(marina.injured).toBe(true);
    expect(tomas.injured).toBe(false);
    expect(sim.state.log.some((l) => l.text.includes('golpe de mar') && l.text.includes('Marina'))).toBe(true);
  });

  it('tormenta: quien se queda fuera acaba recibiendo golpes de mar', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    forceWeather(sim, 'tormenta', 900, true);
    let hits = 0;
    for (let m = 0; m < 12 * 60 && hits === 0; m++) {
      keepPlayer(sim);
      placePlayer(sim, RAIL);
      const h0 = sim.state.player.needs.health;
      sim.tick(1);
      if (sim.state.player.needs.health <= h0 - events.STORM_WAVE_DAMAGE[0] + 0.5) hits++;
    }
    expect(hits).toBe(1);
  });

  it('avería estructural: sin reparar, el oleaje la sigue debilitando', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const alm = mod(sim, 'almacen');
    events.startEvent(sim, 'averia', { moduleId: alm.id });
    const c0 = alm.condition;
    run(sim, 10 * 60);
    expect(alm.condition).toBeLessThan(c0 - 2);
    expect(events.activeEvent(sim, 'averia')).toBeDefined();
  });

  it('discusión: el mal ambiente se contagia al resto de la tripulación', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    const third = npc.spawnSurvivor(sim)!;
    third.trait = 'optimista';
    third.needs.mood = 80;
    for (const id of ['npc1', 'npc2']) npcById(sim, id).needs.mood = 25;
    expect(npc.npcMoodFactors(sim, third).some((f) => /mal ambiente/.test(f.label))).toBe(false);
    const ev = events.startEvent(sim, 'discusion')!;
    expect((ev.data as { npcIds: string[] }).npcIds).not.toContain(third.id);
    const spill = npc.npcMoodFactors(sim, third).find((f) => /mal ambiente/.test(f.label));
    expect(spill?.value).toBe(-npc.DISCUSSION_MOOD_SPILL);
    // Desanimado, lo cuenta al hablar con él.
    third.needs.mood = 35;
    expect(sim.talkTo(third.id)!.lines.some((l) => /discusión a bordo/.test(l))).toBe(true);
    expect(npc.npcMoodFactors(sim, npcById(sim, 'npc1')).some((f) => /discusión/.test(f.label))).toBe(true);
  });
});

describe('mar y director: detalles', () => {
  it('fondeados, los restos nuevos llegan desde lejos y la corriente los acerca', () => {
    const sim = quiet(setup());
    sim.state.voyage.anchoredUntil = sim.state.time + 600;
    run(sim, 20); // el barco termina de frenar
    expect(sim.state.voyage.speed).toBe(0);
    sim.state.debris = [];
    const d = debris.spawnAmbientDebris(sim)!;
    const b = debris.hullBounds(sim);
    expect(Math.abs(d.pos.z) - b.halfW).toBeGreaterThanOrEqual(debris.ANCHORED_SIDE[0] - 0.01);
    expect(Math.sign(d.vel.z)).toBe(-Math.sign(d.pos.z));
    const z0 = Math.abs(d.pos.z);
    const x0 = d.pos.x;
    run(sim, 60);
    expect(Math.abs(d.pos.z)).toBeLessThan(z0 - 2);
    // Solo la corriente de fondo los mueve a lo largo del casco.
    expect(Math.abs(d.pos.x - x0)).toBeLessThan(debris.SEA_CURRENT * 60 + 1);
  });

  it('el director evita repetir el último tipo de evento', () => {
    const sim = quiet(setup());
    sim.state.time = at(3, 12);
    const ev = events.startEvent(sim, 'banco_peces')!;
    events.endEvent(sim, ev, true);
    sim.state.time += events.EVENT_COOLDOWN.banco_peces + 1;
    expect(events.lastStartedType(sim)).toBe('banco_peces');
    const region = REGIONS[sim.state.voyage.regionId]!;
    const w = events.eventWeights(sim);
    expect(w.banco_peces).toBeCloseTo(region.eventWeights['banco_peces']! * events.REPEAT_FACTOR, 5);
    expect(w.naufragio).toBeCloseTo(region.eventWeights['naufragio']!, 5);
  });
});

/* ------------------------------------------------------------------ */
/* Correcciones de la ronda de QA (fix-life)                           */
/* ------------------------------------------------------------------ */

/** Coloca un módulo terminado SIN validar (para recrear barcos que la validación ya no permite). */
function forceModule(sim: Simulation, type: string, level: number, x: number, z: number, rot: Rotation = 0): ModuleInstance {
  const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
  sim.state.ship.modules.push(m);
  sim.shipChanged();
  return m;
}

/** Un tick sin tocar las necesidades del jugador (para pruebas con el jugador dormido). */
function tickRaw(sim: Simulation, minutes: number): void {
  for (let i = 0; i < minutes; i++) {
    const n = sim.state.player.needs;
    n.hunger = Math.max(n.hunger, 80);
    n.thirst = Math.max(n.thirst, 80);
    sim.tick(1);
  }
}

describe('QA: necesidades de los habitantes', () => {
  it('[1] agotado y muerto de sed bebe antes de volver a la cama (sin bucle «Va a beber» / «Va a dormir»)', () => {
    const sim = quiet(setup(1));
    removeEverywhere(sim, 'agua_potable'); // el agua, solo en el depósito de la bodega
    runUntil(sim, at(1, 10));
    const tomas = npcById(sim, 'npc2');
    Object.assign(tomas.needs, { energy: 14, thirst: 9, hunger: 70, health: 100 });
    let drankAt = -1;
    let slept = false;
    run(sim, 120, () => {
      if (drankAt < 0 && tomas.needs.thirst > 40) drankAt = sim.state.time;
      if (drankAt > 0 && tomas.task?.kind === 'dormir') slept = true;
    });
    expect(drankAt).toBeGreaterThan(0);
    expect(drankAt - at(1, 10)).toBeLessThanOrEqual(60);
    expect(slept).toBe(true); // y después, a la cama
    expect(tomas.needs.health).toBe(100);
  });

  it('[1] agotado y hambriento come antes de dormir', () => {
    const sim = quiet(setup(1));
    runUntil(sim, at(1, 10));
    const tomas = npcById(sim, 'npc2');
    Object.assign(tomas.needs, { energy: 13, thirst: 70, hunger: 9, health: 100 });
    run(sim, 90);
    expect(tomas.needs.hunger).toBeGreaterThan(30);
  });

  it('[2] si la comida preferida está donde no se llega, comen la siguiente; si no llegan a ninguna, lo dicen', () => {
    const sim = quiet(setup(1));
    // Un depósito tapa el paso al almacén de la bodega (la validación actual ya no lo permite).
    forceModule(sim, 'deposito', 0, 7, 1, 0);
    const hold = forceModule(sim, 'almacen', 0, 0, 1, 0);
    const c = moduleCenter(hold, sim.state.ship.width);
    expect(npc.isOnReachableNav(sim, { x: c.x, y: c.y, z: c.z })).toBe(false); // precondición
    emptyFood(sim);
    const deck = mod(sim, 'almacen');
    addItem(hold.inventory!, 'conserva', 20); // preferida, pero inalcanzable
    addItem(deck.inventory!, 'fruta', 10);
    const marina = npcById(sim, 'npc1');
    marina.needs.hunger = 20;
    let low = 100;
    run(sim, 120, () => (low = Math.min(low, marina.needs.hunger)));
    expect(marina.needs.hunger).toBeGreaterThan(low + 10); // ha comido
    expect(countItem(deck.inventory, 'fruta')).toBeLessThan(10);
    expect(countItem(hold.inventory, 'conserva')).toBe(20);
    // Ahora solo queda comida donde no se llega: la queja lo dice (y no «no queda comida»).
    deck.inventory!.slots = deck.inventory!.slots.map((s) => (s?.id === 'fruta' ? null : s));
    sim.state.crates = [];
    const notes: string[] = [];
    sim.bus.on('notify', (n) => notes.push(n.text));
    for (const n of sim.state.npcs) {
      n.needs.hunger = 20;
      n.lastComplaintAt = -1e9;
      n.carry = null;
    }
    run(sim, 30);
    expect(notes.some((t) => /No llego a la comida del almacén/.test(t))).toBe(true);
    expect(notes.some((t) => /No queda comida/.test(t))).toBe(false);
    expect(sim.talkTo('npc1')!.lines.some((l) => /no llego a la comida/i.test(l))).toBe(true);
  });

  it('[29] la enfermedad no se pasa sola: sin cama ni tratamiento la salud cae y el evento fracasa', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    // Sin camas: duerme en el suelo (no es «guardar cama») y no se cura.
    sim.state.ship.modules = sim.state.ship.modules.filter((m) => m.type !== 'dormitorio' && m.type !== 'camarote');
    sim.shipChanged();
    sim.state.npcs = sim.state.npcs.filter((n) => n.id === 'npc1');
    const marina = npcById(sim, 'npc1');
    events.startEvent(sim, 'enfermedad', { npcId: 'npc1' });
    run(sim, 30 * 60);
    expect(marina.sick).toBe(true);
    expect(marina.needs.health).toBeLessThan(events.SICKNESS_WORSE_HEALTH);
    expect(lastHistory(sim, 'enfermedad')?.success).toBe(false);
    expect(sim.state.log.some((l) => /Marina ha empeorado/.test(l.text))).toBe(true);
  });

  it('[29] guardando cama se cura (éxito) y lo dice; y puede contagiar a quien tenga al lado', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const marina = npcById(sim, 'npc1');
    const tomas = npcById(sim, 'npc2');
    events.startEvent(sim, 'enfermedad', { npcId: 'npc1' });
    // Contagio: con Tomás pegado a ella durante muchas horas, acaba enfermando y abre su propio evento.
    Object.assign(tomas.pos, marina.pos);
    npc.spreadSickness(sim, marina, 500);
    expect(tomas.sick).toBe(true);
    const evs = sim.state.events.active.filter((e) => e.type === 'enfermedad');
    expect(evs.length).toBe(2);
    expect(evs.some((e) => /contagio de Marina/.test(e.description))).toBe(true);
    // Se curan con reposo: éxito «tras guardar cama».
    run(sim, 3 * MINUTES_PER_DAY);
    const cured = sim.state.log.filter((l) => /se ha recuperado de la enfermedad (tras guardar cama|tras reposar)/.test(l.text));
    expect(cured.length).toBeGreaterThanOrEqual(1);
    expect(sim.state.events.history.filter((h) => h.type === 'enfermedad').every((h) => h.success !== null)).toBe(true);
  });
});

describe('QA: director y sueño', () => {
  it('[5] el día mínimo se cuenta en horas jugadas: la primera noche no trae crisis', () => {
    const sim = quiet(setup());
    sim.state.time = at(2, 0.5); // ya es «día 2» en el calendario, pero solo van 17,5 h jugadas
    let w = events.eventWeights(sim);
    for (const t of ['averia', 'incendio', 'fuga', 'plaga', 'discusion', 'enfermedad']) expect(w[t as events.EventType], t).toBeUndefined();
    expect(events.playedHours(sim)).toBeCloseTo(17.5, 5);
    sim.state.time = at(2, 7) + 1; // 24 h jugadas
    w = events.eventWeights(sim);
    expect(w.averia).toBeGreaterThan(0);
    expect(w.estructura).toBeUndefined(); // la estructura, a partir del día 6 (120 h)
    sim.state.time = at(6, 7) + 1;
    w = events.eventWeights(sim);
    expect(w.estructura).toBeGreaterThan(0);
  });

  it('[5] mientras el jugador duerme no se avista nada y las crisis no urgentes no le despiertan', () => {
    const sim = quiet(setup());
    sim.state.time = at(3, 21);
    sim.state.player.sleeping = { moduleId: mod(sim, 'camarote').id, bed: 0, until: null };
    sim.state.player.needs.energy = 40;
    const w = events.eventWeights(sim);
    for (const t of ['naufragio', 'isla', 'mercante', 'naufragos', 'estructura']) expect(w[t as events.EventType], t).toBeUndefined();
    tickRaw(sim, 2);
    const ev = events.startEvent(sim, 'averia')!;
    expect(ev.data['wakePlayer']).toBe(false);
    tickRaw(sim, 5);
    expect(sim.state.player.sleeping).not.toBeNull();
    expect(sim.state.log.some((l) => l.text.startsWith('Avería'))).toBe(true); // queda en el diario
    // Una emergencia sí le despierta.
    events.startEvent(sim, 'incendio', { moduleId: mod(sim, 'almacen').id });
    tickRaw(sim, 1);
    expect(sim.state.player.sleeping).toBeNull();
  });

  it('[5] el guion espera a que el jugador despierte para los avistamientos', () => {
    const sim = quiet(setup());
    sim.state.events.scripted = events.SCRIPT.filter((s) => s.id !== 'dia1-naufragio').map((s) => s.id);
    runUntil(sim, at(1, 12.9));
    sim.state.player.sleeping = { moduleId: mod(sim, 'camarote').id, bed: 0, until: null };
    tickRaw(sim, 30);
    expect(events.activeEvent(sim, 'naufragio')).toBeUndefined();
    sim.state.player.sleeping = null;
    tickRaw(sim, 2);
    expect(events.activeEvent(sim, 'naufragio')).toBeDefined();
  });

  it('[8] ritmo de progresión: menos planos y restos en los naufragios', () => {
    expect(events.SCRIPT.find((s) => s.type === 'naufragio' && s.id !== 'dia1-naufragio')?.day).toBe(5);
    expect(events.WRECK_BLUEPRINT_CHANCE).toBeCloseTo(0.15);
    expect(events.STRUCTURE_BLUEPRINT_CHANCE).toBeCloseTo(0.5);
    expect(events.EVENT_MIN_DAY.estructura).toBe(6);
    expect(events.WRECK_DEBRIS_COUNT).toEqual([5, 8]);
    // En 60 naufragios al azar, el plano aparece en torno al 15 %.
    let withBp = 0;
    for (let i = 0; i < 60; i++) {
      const sim = quiet(setup(100 + i));
      const ev = events.startEvent(sim, 'naufragio')!;
      if ((ev.data as { blueprint: string | null }).blueprint) withBp++;
    }
    expect(withBp).toBeGreaterThan(1);
    expect(withBp).toBeLessThan(20);
  });

  it('[23] el daño de las tormentas escala con el tiempo jugado', () => {
    const sim = quiet(setup());
    sim.state.time = at(1, 7);
    expect(events.stormDamageFactor(sim)).toBeCloseTo(0.5, 5);
    sim.state.time = at(6, 7);
    expect(events.stormDamageFactor(sim)).toBeCloseTo(1, 5);
    sim.state.time = at(30, 7);
    expect(events.stormDamageFactor(sim)).toBeCloseTo(1.5, 5);
  });
});

describe('QA: tormentas', () => {
  function stormWithDamage(sim: Simulation, conditions: Record<string, number>): ActiveEvent {
    forceWeather(sim, 'tormenta', 300, true);
    run(sim, 1);
    const ev = onlyActive(sim, 'tormenta');
    const d = ev.data as { damaged: number[] };
    for (const [type, c] of Object.entries(conditions)) {
      const m = mod(sim, type);
      m.condition = c;
      if (!d.damaged.includes(m.id)) d.damaged.push(m.id);
    }
    return ev;
  }

  it('[11][25] la fase de daños termina a las 12 h aunque no se repare (fracaso) y el HUD no se queda en «Quedan 0 min»', () => {
    const sim = quiet(setup());
    sim.state.npcs = []; // nadie repara
    stormWithDamage(sim, { cocina: 30 });
    forceWeather(sim, 'despejado', 3000, true);
    run(sim, 2);
    const ev = onlyActive(sim, 'tormenta');
    expect(ev.stage).toBe(1);
    expect(ev.title).toBe('Daños de la tormenta');
    expect(events.eventStatusText(sim, ev)).toMatch(/Quedan 1[12] h/);
    run(sim, events.STORM_REPAIR_WINDOW);
    expect(events.activeEvent(sim, 'tormenta')).toBeUndefined();
    expect(lastHistory(sim, 'tormenta')?.success).toBe(false);
    expect(sim.state.log.some((l) => /siguen sin reparar la cocina/.test(l.text))).toBe(true);
    expect(mod(sim, 'cocina').condition).toBe(30); // los daños siguen ahí
  });

  it('[11] otra tormenta durante la fase de daños cierra la anterior y empieza una nueva (con su aviso)', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const old = stormWithDamage(sim, { cocina: 30 });
    forceWeather(sim, 'despejado', 120, true);
    run(sim, 2);
    expect(old.stage).toBe(1);
    const started: string[] = [];
    sim.bus.on('worldEventStarted', (e) => started.push(e.type));
    forceWeather(sim, 'tormenta', 300, true);
    run(sim, 2);
    expect(started).toContain('tormenta');
    const now = onlyActive(sim, 'tormenta');
    expect(now.id).not.toBe(old.id);
    expect(now.stage).toBe(0);
    expect(events.eventById(sim, old.id)).toBeUndefined();
  });

  it('[26] al amainar no anuncia «daños ya reparados» si nadie ha reparado nada', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    stormWithDamage(sim, { cocina: 55, puente: 71 });
    forceWeather(sim, 'despejado', 3000, true);
    run(sim, 2);
    expect(events.activeEvent(sim, 'tormenta')).toBeUndefined();
    const text = sim.state.log.filter((l) => /tormenta ha pasado/.test(l.text)).pop()!.text;
    expect(text).not.toMatch(/ya están reparados/);
    expect(text).toMatch(/Daños leves en la cocina \(55 %\) y el puente de mando \(71 %\): repáralos cuando puedas/);
  });

  it('[41] «Ponte a cubierto» se marca al estar en un interior', () => {
    const sim = quiet(setup());
    forceWeather(sim, 'tormenta', 300, true);
    placePlayer(sim, RAIL);
    run(sim, 2);
    const ev = onlyActive(sim, 'tormenta');
    expect(ev.objectives[0]!.done).toBe(false);
    const c = moduleCenter(mod(sim, 'camarote'), sim.state.ship.width);
    placePlayer(sim, { x: c.x, y: c.y, z: c.z });
    run(sim, 1);
    expect(ev.objectives[0]!.done).toBe(true);
  });
});

describe('QA: averías', () => {
  it('[7][9] sin piezas a bordo, el director no avería el taller ni la única fuente de energía', () => {
    const sim = quiet(setup());
    sim.state.time = at(3, 12);
    const gen = addModule(sim, 'generador');
    const taller = addModule(sim, 'taller');
    removeEverywhere(sim, 'pieza_mecanica');
    const picks = new Set<number>();
    for (let i = 0; i < 30; i++) {
      const ev = events.startEvent(sim, 'averia')!;
      const m = sim.state.ship.modules.find((mm) => mm.id === (ev.data as { moduleId: number }).moduleId)!;
      picks.add(m.id);
      events.endEvent(sim, ev, null);
      Object.assign(m, { status: 'active', condition: 100, brokenReason: null });
    }
    expect(picks.has(gen.id)).toBe(false);
    expect(picks.has(taller.id)).toBe(false);
    // Con una pieza de repuesto, sí pueden averiarse.
    addItem(mod(sim, 'almacen').inventory!, 'pieza_mecanica', 1);
    for (let i = 0; i < 30; i++) {
      const ev = events.startEvent(sim, 'averia')!;
      const m = sim.state.ship.modules.find((mm) => mm.id === (ev.data as { moduleId: number }).moduleId)!;
      picks.add(m.id);
      events.endEvent(sim, ev, null);
      Object.assign(m, { status: 'active', condition: 100, brokenReason: null });
    }
    expect(picks.has(gen.id) || picks.has(taller.id)).toBe(true);
  });

  it('[7][9] taller averiado y sin piezas: el mecánico fabrica una pieza improvisada en el banco y lo repara', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const taller = addModule(sim, 'taller');
    removeEverywhere(sim, 'pieza_mecanica');
    const alm = mod(sim, 'almacen').inventory!;
    addItem(alm, 'placa_metal', 4);
    addItem(alm, 'tornillos', 8);
    addItem(alm, 'chatarra', 4);
    const ev = events.startEvent(sim, 'averia', { moduleId: taller.id })!;
    // Objetivos por pasos: herramienta, pieza (con dónde conseguirla) y reparar.
    expect(ev.objectives.map((o) => o.text)).toEqual([
      'Consigue una llave inglesa (banco de trabajo)',
      'Consigue una pieza mecánica (taller con energía, pieza improvisada en el banco, pecios o mercantes)',
      'Repara el taller mecánico',
    ]);
    expect(ev.objectives.every((o) => !o.done)).toBe(true);
    addItem(sim.state.player.inventory, 'llave_inglesa', 1);
    let improvised = false;
    run(sim, 6 * 60, () => {
      if (mod(sim, 'banco_trabajo').queue.some((j) => j.recipeId === 'pieza_improvisada')) improvised = true;
    });
    expect(improvised).toBe(true);
    expect(taller.status).toBe('active');
    expect(lastHistory(sim, 'averia')?.success).toBe(true);
  });

  it('[9][41] los objetivos de la avería se marcan según lo conseguido', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const gen = addModule(sim, 'generador');
    removeEverywhere(sim, 'pieza_mecanica');
    const ev = events.startEvent(sim, 'averia', { moduleId: gen.id })!;
    run(sim, 1);
    expect(ev.objectives.map((o) => o.done)).toEqual([false, false, false]);
    addItem(sim.state.player.inventory, 'llave_inglesa', 1);
    run(sim, 1);
    expect(ev.objectives.map((o) => o.done)).toEqual([true, false, false]);
    addItem(mod(sim, 'almacen').inventory!, 'pieza_mecanica', 1);
    run(sim, 1);
    expect(ev.objectives.map((o) => o.done)).toEqual([true, true, false]);
    // La interfaz puede mostrar el motivo de la avería en el panel del módulo.
    expect(events.breakdownReason(sim, gen.id)).toBe((ev.data as { reason: string }).reason);
    expect(events.breakdownReason(sim, mod(sim, 'cocina').id)).toBeNull();
  });

  it('[9] si en 24 h nadie la repara, el mecánico hace un apaño: máquina al 40 % y fracaso parcial', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 9));
    const gen = addModule(sim, 'generador');
    removeEverywhere(sim, 'pieza_mecanica');
    removeEverywhere(sim, 'chatarra');
    removeEverywhere(sim, 'placa_metal');
    removeEverywhere(sim, 'tornillos');
    events.startEvent(sim, 'averia', { moduleId: gen.id });
    run(sim, events.BREAKDOWN_PATCH_MIN - 10);
    expect(gen.status).toBe('broken');
    expect(events.activeEvent(sim, 'averia')).toBeDefined();
    run(sim, 20);
    expect(events.activeEvent(sim, 'averia')).toBeUndefined();
    expect(gen.status).toBe('active');
    expect(gen.condition).toBe(events.BREAKDOWN_PATCH_CONDITION);
    expect(lastHistory(sim, 'averia')?.success).toBe(false);
    expect(sim.state.log.some((l) => /Tomás hace un apaño provisional: el generador vuelve a funcionar, pero al 40 %/.test(l.text))).toBe(true);
  });
});

describe('QA: incendios, náufragos, naufragios y expediciones', () => {
  it('[28] sin cubos, los habitantes apenas frenan el fuego: tarda y deja daños', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    const almacen = mod(sim, 'almacen');
    events.startEvent(sim, 'incendio', { moduleId: almacen.id });
    expect(almacen.fire).toBe(events.FIRE_START);
    run(sim, 12);
    expect(almacen.fire).toBeGreaterThan(20); // antes se apagaba solo en ~10 min
    expect(sim.state.npcs.filter((n) => n.task?.kind === 'apagar').length).toBeLessThanOrEqual(npc.MAX_FIREFIGHTERS);
    run(sim, 90);
    expect(almacen.fire).toBe(0);
    expect(almacen.condition).toBeLessThan(100);
  });

  it('[28] con cubos en el almacén van a por ellos, los llenan en la borda y los arrojan', () => {
    const sim = quiet(setup());
    runUntil(sim, at(1, 10));
    addItem(mod(sim, 'almacen').inventory!, 'cubo', 2);
    const cocina = mod(sim, 'cocina');
    events.startEvent(sim, 'incendio', { moduleId: cocina.id });
    const stages = new Set<string>();
    run(sim, 60, () => {
      for (const n of sim.state.npcs) {
        const st = (n.task?.data as { stage?: string } | undefined)?.stage;
        if (n.task?.kind === 'apagar' && st) stages.add(st);
      }
    });
    for (const s of ['coger', 'llenar', 'arrojar']) expect(stages.has(s), s).toBe(true);
    expect(cocina.fire).toBe(0);
    // Los cubos no se pierden: vuelven al almacén (o siguen en la mano de quien los lleva).
    run(sim, 30);
    const buckets = storageTotal(sim, 'cubo') + storageTotal(sim, 'cubo_agua') + sim.state.npcs.filter((n) => n.carry && /^cubo/.test(n.carry.id)).length;
    expect(buckets).toBe(2);
  });

  it('[27][30] fondear para esperar la balsa la deja al alcance del gancho; al rescatarla se leva el ancla', () => {
    const sim = quiet(setup());
    sim.state.npcs = [];
    const ev = events.startEvent(sim, 'naufragos', { survivors: 1 })!;
    const raft = sim.state.debris.find((d) => d.eventId === ev.id)!;
    expect(sim.eventChoice(ev.id, 'fondear').ok).toBe(true);
    const b = debris.hullBounds(sim);
    run(sim, 30);
    expect(raft.pos.x).toBeLessThanOrEqual(b.bowX);
    expect(Math.abs(raft.pos.z) - b.halfW).toBeLessThanOrEqual(15.01);
    // Desde la borda de ese costado llega el gancho.
    placePlayer(sim, { x: raft.pos.x, y: LEVEL_H, z: Math.sign(raft.pos.z) * (b.halfW - 0.4) });
    const r = sim.collectDebris(raft.id);
    expect(r.ok).toBe(true);
    expect(sim.state.voyage.anchoredUntil).toBeNull();
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
  });

  it('[42] el rescate se anuncia una vez, con rasgo y puesto concordados', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'naufragos', { survivors: 1 })!;
    const raft = sim.state.debris.find((d) => d.eventId === ev.id)!;
    raft.pos.x = 2;
    placePlayer(sim, RAIL);
    const before = sim.state.log.length;
    expect(sim.collectDebris(raft.id).ok).toBe(true);
    const fresh = sim.state.log.slice(before).map((l) => l.text);
    expect(fresh.length).toBe(1);
    const newcomer = sim.state.npcs[2]!;
    expect(fresh[0]).toContain(`${newcomer.name} se une a la tripulación ${npc.npcIntro(newcomer)}`);
    expect(fresh[0]).not.toMatch(/\//);
  });

  it('[42] rasgos y puestos concuerdan con el género del nombre', () => {
    const ines = { name: 'Inés', trait: 'hablador' } as NpcState;
    const teo = { name: 'Teo', trait: 'gloton' } as NpcState;
    expect(npc.npcTraitName(ines)).toBe('Habladora');
    expect(npc.npcTraitName(teo)).toBe('Glotón');
    expect(npc.npcRoleName(ines, 'pescador')).toBe('Pescadora');
    expect(npc.npcRoleName(teo, 'pescador')).toBe('Pescador');
    expect(npc.npcRoleName(ines, 'mecanico')).toBe('Mecánica');
    expect(npc.npcRoleName(ines, 'libre')).toBe('Sin puesto');
    for (const name of ['Marina', 'Lucía', 'Nora', 'Alma', 'Vera', 'Inés', 'Carla', 'Rocío', 'Julia', 'Sol', 'Olga', 'Aitana', 'Celia', 'Lola', 'Greta']) expect(npc.isFemaleNpc({ name }), name).toBe(true);
    for (const name of ['Tomás', 'Iker', 'Bruno', 'Darío', 'Gael', 'Teo', 'Hugo', 'Elías', 'Mateo', 'Andrés', 'Simón', 'Ramiro', 'Joaquín', 'Fermín', 'Pablo']) expect(npc.isFemaleNpc({ name }), name).toBe(false);
    const sim = quiet(setup());
    const s = npc.spawnSurvivor(sim, { name: 'Inés', role: 'pescador' })!;
    const text = sim.state.log[sim.state.log.length - 1]!.text;
    expect(text).toBe(`Inés se une a la tripulación (${npc.npcTraitName(s).toLowerCase()}, pescadora).`);
  });

  it('[40] naufragio: título de rescate, un solo aviso de fondeo y se leva el ancla al rescatarlo todo', () => {
    const sim = quiet(setup());
    const ev = events.startEvent(sim, 'naufragio', { blueprint: 'next' })!;
    const before = sim.state.log.length;
    expect(sim.eventChoice(ev.id, 'rescatar').ok).toBe(true);
    expect(sim.state.log.slice(before).filter((l) => /ancla/i.test(l.text)).length).toBe(1);
    expect(ev.title).toMatch(/^Rescate del «/);
    for (const d of sim.state.debris.filter((x) => x.eventId === ev.id)) debris.collectDebrisFor(sim, d.id, 'player', RAIL);
    expect(events.activeEvent(sim, 'naufragio')).toBeUndefined();
    expect(sim.state.voyage.anchoredUntil).toBeNull();
    expect(sim.state.log[sim.state.log.length - 1]!.text).toMatch(/Levamos anclas/);
  });

  it('[37][38][39] expediciones: «Volverá» con una persona, cuenta atrás hasta la vuelta y botín sin repetir', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const sim = quiet(setup(seed));
      runUntil(sim, at(1, 9));
      const ev = events.startEvent(sim, 'estructura')!;
      expect(ev.choices[0]!.label).toBe('Fondear y enviar una expedición (2 h)');
      expect(sim.eventChoice(ev.id, 'expedicion').ok).toBe(true);
      const d = ev.data as { returnAt: number; npcIds: string[] };
      expect(d.npcIds.length).toBe(1);
      expect(ev.endsAt).toBe(d.returnAt);
      expect(events.eventStatusText(sim, ev)).toBe('Quedan 2 h');
      expect(sim.state.log.some((l) => /Volverá hacia las/.test(l.text))).toBe(true);
      expect(sim.state.log.some((l) => /Volverán/.test(l.text))).toBe(false);
      run(sim, events.STRUCTURE_EXPEDITION_MIN + 2);
      const text = sim.state.log.filter((l) => /vuelven? de la estructura/.test(l.text)).pop()!.text;
      expect(text).not.toMatch(/!\./);
      expect(text).not.toMatch(/¡y /);
      const names = [...text.matchAll(/\d+× ([^,.(]+)/g)].map((m) => m[1]!.trim());
      expect(new Set(names).size).toBe(names.length); // cada objeto, una sola vez
      expect(names.some((n) => /^Plano/.test(n))).toBe(false); // el plano va en su propia frase
    }
  });

  it('[36] la pesca concuerda en género con lo que sale enganchado', () => {
    const sim = quiet(setup());
    addItem(sim.state.player.inventory, 'cana', 1);
    placePlayer(sim, RAIL);
    let junk = '';
    for (let i = 0; i < 300 && !junk; i++) {
      const r = sim.catchFish();
      const msg = r.msg ?? '';
      if (!/pescado|captura/i.test(msg)) junk = msg;
    }
    expect(junk).toMatch(/^Algo se ha enganchado en el anzuelo: 1× /);
    expect(junk).not.toMatch(/enredado/);
  });

  it('[47] desmontar el huerto con plaga no cuenta como plaga controlada', () => {
    const sim = quiet(setup());
    const huerto = addModule(sim, 'huerto');
    addItem(sim.state.player.inventory, 'semilla_hortaliza', 2);
    expect(plant(sim, huerto.id, 0, 'semilla_hortaliza').ok).toBe(true);
    events.startEvent(sim, 'plaga');
    sim.state.ship.modules = sim.state.ship.modules.filter((m) => m.id !== huerto.id);
    sim.shipChanged();
    run(sim, 1);
    expect(events.activeEvent(sim, 'plaga')).toBeUndefined();
    expect(lastHistory(sim, 'plaga')?.success).toBeNull();
  });
});

describe('QA: la cocinera y el fogón', () => {
  it('[20] cocina a un lado del fogón: deja libre su punto de uso, y se aparta si el jugador se acerca', () => {
    const sim = quiet(setup());
    const cocina = mod(sim, 'cocina');
    const fogon = sim.layout.props.find((p) => p.moduleId === cocina.id && p.kind === 'fogon')!;
    const use = sim.nav.standPoint(fogon)!;
    runUntil(sim, at(1, 8));
    const marina = npcById(sim, 'npc1');
    let atStove = 0;
    let onUse = 0;
    run(sim, 150, () => {
      const t = marina.task;
      if (t?.kind === 'trabajar' && (t.data as { anim?: string }).anim === 'cocinar' && (t.data as { phase: string }).phase === 'act') {
        atStove++;
        if (Math.hypot(marina.pos.x - use.x, marina.pos.z - use.z) < 0.3) onUse++;
      }
    });
    expect(atStove).toBeGreaterThan(0);
    expect(onUse).toBe(0);
    // Aunque acabe en el punto de uso (p. ej. sin hueco a los lados al llegar), si el jugador se
    // acerca, da un paso a un lado sin dejar de cocinar.
    sim.state.npcs = [marina];
    emptyFood(sim); // despensa vacía: la cocinera se pone a cocinar
    marina.needs.hunger = 90;
    addItem(mod(sim, 'almacen').inventory!, 'pescado_crudo', 2);
    addItem(mod(sim, 'almacen').inventory!, 'hortaliza', 2);
    const atTheStove = () => {
      const t = marina.task;
      return t?.kind === 'trabajar' && (t.data as { anim?: string }).anim === 'cocinar' && (t.data as { phase: string }).phase === 'act' && (t.until ?? 0) > sim.state.time + 4;
    };
    for (let i = 0; i < 90 && !atTheStove(); i++) run(sim, 1);
    expect(atTheStove()).toBe(true);
    const task = marina.task;
    Object.assign(marina.pos, use);
    placePlayer(sim, { x: use.x + 1, y: use.y, z: use.z });
    run(sim, 3);
    expect(Math.hypot(marina.pos.x - use.x, marina.pos.z - use.z)).toBeGreaterThan(0.5);
    expect(marina.task).toBe(task); // sin dejar lo que estaba haciendo
  });
});

/* ================================================================== */
/* RONDA DE CONTENIDO 2: grúa, radar, historia, relaciones, sala común */
/* ================================================================== */

const ALL_UNLOCKS = ['taller', 'energia', 'agua', 'enfermeria', 'solar', 'invernadero', 'motor', 'casco', 'acuicultura', 'grua', 'radar'];

/** Coloca un módulo terminado en el primer sitio válido que cumpla `ok` (todos los planos conocidos). */
function placeAt(sim: Simulation, type: string, level: number, ok?: (x: number, z: number) => boolean): ModuleInstance {
  const ship = sim.state.ship;
  for (let x = ship.length - 1; x >= 0; x--) {
    for (let z = 0; z < ship.width; z++) {
      if (ok && !ok(x, z)) continue;
      for (const rot of [0, 1, 2, 3] as Rotation[]) {
        if (!checkPlacement(ship, ALL_UNLOCKS, type, level, x, z, rot).ok) continue;
        const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
        ship.modules.push(m);
        sim.shipChanged();
        return m;
      }
    }
  }
  throw new Error(`no cabe ${type} en el nivel ${level}`);
}

/** Generador con combustible en la bodega: energía para grúa, radar, vivero… */
function powerUp(sim: Simulation): ModuleInstance {
  const g = placeAt(sim, 'generador', 0);
  addItem(g.fuelInv!, 'combustible', 8);
  return g;
}

/** Fondeados y casi sin corriente: los restos de la prueba se quedan donde se ponen. */
function anchorHere(sim: Simulation): void {
  sim.state.voyage.anchoredUntil = 1e9;
  sim.state.voyage.anchorReason = 'pruebas';
  sim.state.voyage.speed = 0;
}

type CraneMod = ModuleInstance & { prodProgress?: number; prodTarget?: number | null };

describe('grúa de rescate', () => {
  function craneSetup(seed = 11) {
    const sim = quiet(setup(seed));
    sim.state.npcs = [];
    sim.state.debris = [];
    anchorHere(sim);
    powerUp(sim);
    const crane = placeAt(sim, 'grua', 1, (_x, z) => z === 0) as CraneMod;
    sim.tick(1); // la red de energía ya la alimenta
    const o = debris.gruaOrigin(sim, crane);
    return { sim, crane, o };
  }

  it('rescata el resto más cercano de SU costado a ≤ 30 m cada 25 min: botín a su bandeja', () => {
    const { sim, crane, o } = craneSetup();
    expect(debris.gruaSide(sim, crane)).toBe(-1);
    expect(debris.gruaRange(crane)).toBe(30);
    const near = debris.spawnDebris(sim, 'tablones', { x: o.x, z: o.z - 12 }, { loot: [{ id: 'madera', qty: 3 }], lateral: 0 });
    const farther = debris.spawnDebris(sim, 'caja', { x: o.x + 6, z: o.z - 20 }, { loot: [{ id: 'tela', qty: 2 }], lateral: 0 });
    const otherSide = debris.spawnDebris(sim, 'barril', { x: o.x, z: -o.z + 12 }, { loot: [{ id: 'plastico', qty: 1 }], lateral: 0 });
    const tooFar = debris.spawnDebris(sim, 'restos', { x: o.x, z: o.z - 45 }, { loot: [{ id: 'chatarra', qty: 2 }], lateral: 0 });
    const alive = (d: { id: number }) => sim.state.debris.some((x) => x.id === d.id);
    expect(debris.gruaStatus(sim, crane.id)!.phase).toBe('recargando');
    expect(debris.gruaStatus(sim, crane.id)!.status).toMatch(/Recogiendo cable \(\d+ min\)/);
    run(sim, 15);
    expect(alive(near)).toBe(true); // aún recogiendo cable
    for (let i = 0; i < 15 && alive(near); i++) run(sim, 1);
    expect(alive(near)).toBe(false);
    expect(countItem(crane.inventory, 'madera')).toBe(3);
    expect(debris.gruaStatus(sim, crane.id)!.phase).toBe('izando'); // la carga sube a bordo
    // El siguiente, 25 min después: el otro de su costado (no el de estribor ni el lejano).
    run(sim, 20);
    expect(alive(farther)).toBe(true);
    run(sim, 12);
    expect(alive(farther)).toBe(false);
    expect(countItem(crane.inventory, 'tela')).toBe(2);
    // Lo de estribor y lo que queda fuera de su alcance, nunca (quitando los restos que vayan llegando).
    const keep = new Set([otherSide.id, tooFar.id]);
    run(sim, 60, () => (sim.state.debris = sim.state.debris.filter((d) => keep.has(d.id))));
    expect(alive(otherSide)).toBe(true);
    expect(alive(tooFar)).toBe(true);
    expect(debris.gruaStatus(sim, crane.id)!.phase).toBe('esperando');
    expect(debris.gruaStatus(sim, crane.id)!.status).toBe('Esperando restos a su alcance');
  });

  it('mientras engancha expone su objetivo (para animar la pluma) y lo suelta al izarlo', () => {
    const { sim, crane, o } = craneSetup();
    const d = debris.spawnDebris(sim, 'barril', { x: o.x - 3, z: o.z - 10 }, { lateral: 0 });
    let seen: debris.GruaTarget | null = null;
    for (let i = 0; i < 40 && sim.state.debris.some((x) => x.id === d.id); i++) {
      run(sim, 1);
      const t = debris.gruaTarget(sim, crane.id);
      if (t) {
        seen = t;
        expect(debris.gruaStatus(sim, crane.id)!.status).toMatch(/^Enganchando: barril/);
      }
    }
    expect(seen?.debrisId).toBe(d.id);
    expect(seen!.progress).toBeGreaterThanOrEqual(0);
    expect(seen!.progress).toBeLessThanOrEqual(1);
    expect(debris.gruaTarget(sim, crane.id)).toBeNull();
  });

  it('sin energía, apagada, averiada o con tormenta no trabaja (y lo dice)', () => {
    const { sim, crane, o } = craneSetup();
    const d = debris.spawnDebris(sim, 'tablones', { x: o.x, z: o.z - 10 }, { lateral: 0 });
    crane.on = false;
    run(sim, 45);
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(true);
    expect(debris.gruaStatus(sim, crane.id)!.status).toBe('Apagada');
    crane.on = true;
    crane.status = 'broken';
    run(sim, 30);
    expect(debris.gruaStatus(sim, crane.id)!.status).toBe('Averiada');
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(true);
    crane.status = 'active';
    forceWeather(sim, 'tormenta');
    sim.state.weather.remaining = 1e6;
    run(sim, 45);
    expect(debris.gruaStatus(sim, crane.id)!.phase).toBe('tormenta');
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(true);
  });

  it('sube a bordo a los náufragos de una balsa (el evento se resuelve gracias a la grúa)', () => {
    const { sim, crane, o } = craneSetup();
    const ev = events.startEvent(sim, 'naufragos', { survivors: 2 })!;
    const raft = sim.state.debris.find((d) => d.eventId === ev.id)!;
    raft.pos = { x: o.x + 4, z: o.z - 9 };
    const before = sim.state.npcs.length;
    run(sim, 30);
    expect(sim.state.npcs.length).toBe(before + 2);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
    expect(sim.state.log.some((l) => /gracias a la grúa/.test(l.text))).toBe(true);
  });

  it('la pluma larga (mejora) llega más lejos y trabaja más deprisa', () => {
    const { sim, crane, o } = craneSetup();
    crane.tier = 2;
    expect(debris.gruaRange(crane)).toBeCloseTo(37.5);
    const d = debris.spawnDebris(sim, 'tablones', { x: o.x, z: o.z - 35 }, { lateral: 0 });
    run(sim, 18); // (25 − 4 + 3) / 1,6 ≈ 15 min
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(false);
  });

  it('con la bandeja y los almacenes llenos solo rescata náufragos, y avisa', () => {
    const { sim, crane, o } = craneSetup();
    const fill = (inv: { slots: ({ id: string; qty: number } | null)[] }) => inv.slots.forEach((_, i) => (inv.slots[i] = { id: 'chatarra', qty: 50 }));
    fill(crane.inventory!);
    for (const m of storageModules(sim)) fill(m.inventory!);
    const notes: string[] = [];
    sim.bus.on('notify', (n) => notes.push(n.text));
    const d = debris.spawnDebris(sim, 'tablones', { x: o.x, z: o.z - 10 }, { lateral: 0 });
    run(sim, 45);
    expect(sim.state.debris.some((x) => x.id === d.id)).toBe(true);
    expect(debris.gruaStatus(sim, crane.id)!.phase).toBe('llena');
    expect(notes.some((t) => /grúa.*llenos/.test(t))).toBe(true);
    const ev = events.startEvent(sim, 'naufragos', { survivors: 1 })!;
    sim.state.debris.find((x) => x.eventId === ev.id)!.pos = { x: o.x, z: o.z - 8 };
    run(sim, 10);
    expect(lastHistory(sim, 'naufragos')?.success).toBe(true);
  });

  it('el avance del ciclo se guarda con la partida', () => {
    const { sim, crane } = craneSetup();
    run(sim, 10);
    const w = crane.prodProgress!;
    expect(w).toBeGreaterThan(4);
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    const c2 = loaded.state.ship.modules.find((m) => m.id === crane.id) as CraneMod;
    expect(c2.prodProgress).toBeCloseTo(w);
  });

  it('los restos de un naufragio que iza la grúa cuentan para el rescate', () => {
    const { sim, crane, o } = craneSetup();
    const ev = events.startEvent(sim, 'naufragio', { blueprint: null, page: null, scripted: true })!;
    sim.eventChoice(ev.id, 'rescatar');
    const mine = sim.state.debris.filter((d) => d.eventId === ev.id);
    mine[0]!.pos = { x: o.x, z: o.z - 7 };
    run(sim, 30);
    expect((ev.data as { collected: number }).collected).toBeGreaterThanOrEqual(1);
    expect(crane.inventory!.slots.some((s) => !!s)).toBe(true);
  });
});

describe('radar y radio', () => {
  function radarSetup(seed = 11) {
    const sim = quiet(setup(seed));
    powerUp(sim);
    const radar = placeAt(sim, 'radar', 2);
    sim.tick(1);
    return { sim, radar };
  }

  it('con el radar en marcha los avistamientos se anuncian antes y duran 60 min más', () => {
    const plain = quiet(setup(3));
    const wreck0 = events.startEvent(plain, 'naufragio')!;
    const s0 = plain.state.voyage.sightings.find((s) => s.eventId === wreck0.id)!;
    expect(wreck0.endsAt! - plain.state.time).toBeCloseTo(events.SIGHTING_WINDOW);

    const { sim } = radarSetup(3);
    expect(events.radarActive(sim)).toBe(true);
    const wreck = events.startEvent(sim, 'naufragio')!;
    const s = sim.state.voyage.sightings.find((x) => x.eventId === wreck.id)!;
    expect(wreck.endsAt! - sim.state.time).toBeCloseTo(events.SIGHTING_WINDOW + events.RADAR_EXTRA_MIN);
    expect(s.expiresAt - sim.state.time).toBeCloseTo(events.SIGHTING_WINDOW + events.RADAR_EXTRA_MIN);
    expect(s.x).toBeGreaterThan(s0.x + 100); // más lejos: se ve antes de tenerlo a la vista
    expect(sim.state.log.at(-1)!.text).toMatch(/El radar detecta un naufragio/);
    const isla = events.startEvent(sim, 'isla')!;
    expect(isla.endsAt! - sim.state.time).toBeCloseTo(events.SIGHTING_WINDOW + 30 + events.RADAR_EXTRA_MIN);
    const merc = events.startEvent(sim, 'mercante')!;
    expect(merc.endsAt! - sim.state.time).toBeCloseTo(events.MERCHANT_MIN + events.RADAR_EXTRA_MIN);
    expect(merc.description).toMatch(/tres horas/);
    const raftEv = events.startEvent(sim, 'naufragos')!;
    const raft = sim.state.debris.find((d) => d.eventId === raftEv.id)!;
    expect(raft.pos.x).toBeGreaterThan(debris.hullBounds(sim).bowX + 48 + events.RADAR_RAFT_AHEAD - 1);
  });

  it('apagado o sin energía, el radar no adelanta nada', () => {
    const { sim, radar } = radarSetup(3);
    radar.on = false;
    sim.tick(1);
    expect(events.radarActive(sim)).toBe(false);
    const ev = events.startEvent(sim, 'naufragio')!;
    expect(ev.endsAt! - sim.state.time).toBeCloseTo(events.SIGHTING_WINDOW);
  });

  it('cada pocas horas llega un mensaje de radio al diario (solo con el radar en marcha)', () => {
    const { sim, radar } = radarSetup(5);
    run(sim, 2 * MINUTES_PER_DAY);
    const radio = sim.state.log.filter((l) => l.text.startsWith('Radio:'));
    expect(radio.length).toBeGreaterThanOrEqual(3);
    expect(radio.length).toBeLessThanOrEqual(10);
    radar.on = false;
    const n = sim.state.log.filter((l) => l.text.startsWith('Radio:')).length;
    run(sim, MINUTES_PER_DAY);
    // (el diario guarda las últimas 120 entradas: se cuenta por texto nuevo)
    expect(sim.state.log.filter((l) => l.text.startsWith('Radio:') && l.at > sim.state.time - MINUTES_PER_DAY + 1).length).toBe(0);
    expect(n).toBeGreaterThan(0);
  });

  it('los precios que anuncia la radio los trae el próximo mercante', () => {
    const { sim } = radarSetup(8);
    let msg = '';
    for (let i = 0; i < 60 && !/mercante anuncia/.test(msg); i++) msg = events.radioMessage(sim);
    expect(msg).toMatch(/^Radio: un mercante anuncia que, por estas aguas, cambia .+ por .+\./);
    const rumoured = events.rumouredOffers(sim);
    expect(rumoured.length).toBeGreaterThan(0);
    const ev = events.startEvent(sim, 'mercante')!;
    const offers = events.tradeOffers(sim, ev.id);
    for (const i of rumoured) {
      const o = TRADE_OFFERS[i]!;
      expect(offers.some((x) => JSON.stringify(x.get) === JSON.stringify(o.get) && JSON.stringify(x.give) === JSON.stringify(o.give))).toBe(true);
    }
    expect(events.rumouredOffers(sim)).toEqual([]);
  });

  it('las pistas del cuaderno dicen la verdad: dónde aparecen las hojas o la luz verde', () => {
    const { sim } = radarSetup(9);
    const story = sim.state.story!;
    let hint = '';
    for (let i = 0; i < 80 && !/cuaderno del Albatros/.test(hint); i++) hint = events.radioMessage(sim);
    expect(hint).toMatch(/por estas aguas/); // la hoja 2 es de Aguas Templadas
    sim.state.voyage.regionId = 'sargazos';
    story.pages = [2, 3, 4, 5, 6, 7];
    hint = '';
    story.revealed = true;
    for (let i = 0; i < 80 && !/luz verde/.test(hint); i++) hint = events.radioMessage(sim);
    expect(hint).toMatch(/Puerto Esperanza existe/);
  });
});

describe('historia: hojas del cuaderno del Albatros', () => {
  it('siguiente hoja: en orden, primero la de esta región, sin repetir las leídas o a bordo', () => {
    const sim = quiet(setup());
    expect(sim.state.story).toEqual({ pages: [], revealed: false, arrived: false });
    expect(events.nextStoryPage(sim)?.n).toBe(2); // Aguas Templadas
    addItem(mod(sim, 'almacen').inventory!, 'pagina_2', 1);
    expect(events.nextStoryPage(sim)?.n).toBe(3);
    expect(events.nextStoryPage(sim, true)).toBeNull(); // aquí ya no queda ninguna
    sim.state.story!.pages.push(3);
    expect(events.nextStoryPage(sim)?.n).toBe(4);
    spawnCrate(sim, RAIL, [{ id: 'pagina_4', qty: 1 }]);
    expect(events.nextStoryPage(sim)?.n).toBe(5);
    debris.spawnDebris(sim, 'cofre', { x: 0, z: 20 }, { loot: [{ id: 'pagina_5', qty: 1 }] });
    expect(events.nextStoryPage(sim)?.n).toBe(6);
    // En el Mar de las Tormentas sale antes la suya (6) aunque falte la 2.
    const fresh = quiet(setup());
    fresh.state.voyage.regionId = 'tormentas';
    expect(events.nextStoryPage(fresh)?.n).toBe(6);
    fresh.state.story!.pages = [2, 3, 4, 5, 6, 7];
    expect(events.nextStoryPage(fresh)).toBeNull();
  });

  it('probabilidad: mayor en su región, sube con los días sin hojas y se enfría tras una', () => {
    const sim = quiet(setup());
    const p2 = events.nextStoryPage(sim)!;
    const here = events.pageChance(sim, p2, 'cofre');
    expect(here).toBeCloseTo(events.PAGE_CHANCE.cofre);
    sim.state.voyage.regionId = 'archipielago';
    expect(events.pageChance(sim, p2, 'cofre')).toBeCloseTo(events.PAGE_CHANCE.cofre * events.PAGE_OFF_REGION);
    sim.state.voyage.regionId = 'templadas';
    sim.state.time += 3 * MINUTES_PER_DAY;
    expect(events.pageChance(sim, p2, 'cofre')).toBeCloseTo(events.PAGE_CHANCE.cofre + 3 * events.PAGE_DROUGHT_PER_DAY);
    sim.state.time += 30 * MINUTES_PER_DAY;
    expect(events.pageChance(sim, p2, 'cofre')).toBeCloseTo(events.PAGE_CHANCE.cofre + events.PAGE_DROUGHT_MAX);
    sim.state.events.cooldowns['pagina'] = sim.state.time + 60;
    expect(events.pageChance(sim, p2, 'estructura')).toBe(0);
  });

  it('guion: el naufragio del día 5 guarda en el cofre el plano y la siguiente hoja', () => {
    const sim = quiet(setup());
    const step = events.SCRIPT.find((s) => s.id === 'dia5-naufragio')!;
    expect(step.opts?.page).toBe('next');
    expect(events.SCRIPT.find((s) => s.id === 'dia1-naufragio')!.opts?.page).toBeNull();
    const ev = events.startEvent(sim, 'naufragio', { ...step.opts, scripted: true })!;
    expect((ev.data as { page: string }).page).toBe('pagina_2');
    expect(events.nextStoryPage(sim)?.n).toBe(3); // la 2 ya está prometida
    sim.eventChoice(ev.id, 'rescatar');
    const chest = sim.state.debris.find((d) => d.eventId === ev.id && d.kind === 'cofre')!;
    expect(chest.loot.some((l) => l.id === 'pagina_2')).toBe(true);
    expect(chest.loot.some((l) => l.id === BLUEPRINT_ORDER[0])).toBe(true);
    expect(ev.objectives.some((o) => /plano y una hoja del cuaderno/.test(o.text))).toBe(true);
    debris.collectDebrisFor(sim, chest.id, 'player', RAIL);
    expect(countItem(sim.state.player.inventory, 'pagina_2')).toBe(1);
  });

  it('naufragios al azar: hoja en el cofre en torno al 35 % en su región (menos fuera)', () => {
    let here = 0;
    let away = 0;
    for (let i = 0; i < 80; i++) {
      const a = quiet(setup(300 + i));
      if ((events.startEvent(a, 'naufragio')!.data as { page: string | null }).page) here++;
      const b = quiet(setup(300 + i));
      b.state.voyage.regionId = 'archipielago'; // ninguna hoja es de aquí
      if ((events.startEvent(b, 'naufragio')!.data as { page: string | null }).page) away++;
    }
    expect(here).toBeGreaterThan(14);
    expect(here).toBeLessThan(44);
    expect(away).toBeLessThan(here);
  });

  it('expediciones a islas y estructuras pueden traer una hoja (a los almacenes, con su frase)', () => {
    let found = 0;
    for (let i = 0; i < 8; i++) {
      const sim = quiet(setup(40 + i));
      sim.state.time = at(3, 9);
      sim.state.events.cooldowns['pagina'] = sim.state.time - 20 * MINUTES_PER_DAY; // mucho sin hojas
      const ev = events.startEvent(sim, i % 2 ? 'estructura' : 'isla')!;
      expect(sim.eventChoice(ev.id, 'expedicion').ok).toBe(true);
      run(sim, 200);
      if (storageTotal(sim, 'pagina_2') > 0) {
        found++;
        expect(sim.state.log.some((l) => /hoja del cuaderno del Albatros \(pág\. 2\)/.test(l.text))).toBe(true);
      }
    }
    expect(found).toBeGreaterThanOrEqual(3);
  });

  it('un mercante puede ofrecer la siguiente hoja (barata) y no se repite', () => {
    let offered = 0;
    for (let i = 0; i < 12; i++) {
      const sim = quiet(setup(70 + i));
      sim.state.events.cooldowns['pagina'] = sim.state.time - 20 * MINUTES_PER_DAY;
      const ev = events.startEvent(sim, 'mercante')!;
      const offers = events.tradeOffers(sim, ev.id);
      expect(offers.length).toBe(4);
      const k = offers.findIndex((o) => o.get['pagina_2']);
      if (k < 0) continue;
      offered++;
      expect(offers[k]!.give).toEqual(events.PAGE_PRICE);
      expect(ev.description).toMatch(/hoja del cuaderno del Albatros \(pág\. 2\)/);
      expect(events.nextStoryPage(sim)?.n).toBe(3);
      addItem(sim.state.player.inventory, 'madera', 10);
      expect(sim.trade(ev.id, k).ok).toBe(true);
      expect(countItem(sim.state.player.inventory, 'pagina_2')).toBe(1);
    }
    expect(offered).toBeGreaterThanOrEqual(4);
  });

  it('un cofre a la deriva puede traer la hoja de su región (solo la de esa región)', () => {
    const sim = quiet(setup(12));
    sim.state.voyage.regionId = 'cementerio';
    let withPage = 0;
    let cofres = 0;
    for (let i = 0; i < 400 && cofres < 30; i++) {
      sim.state.debris = [];
      sim.state.events.cooldowns['pagina'] = sim.state.time - 20 * MINUTES_PER_DAY;
      const d = debris.spawnAmbientDebris(sim);
      if (d?.kind !== 'cofre') continue;
      cofres++;
      const page = d.loot.find((l) => l.id.startsWith('pagina_'));
      if (page) {
        withPage++;
        expect(page.id).toBe('pagina_4');
      }
    }
    expect(cofres).toBeGreaterThan(10);
    expect(withPage).toBeGreaterThan(0);
    // En una región sin hojas pendientes, nunca.
    sim.state.story!.pages = [4];
    for (let i = 0; i < 200; i++) {
      sim.state.debris = [];
      const d = debris.spawnAmbientDebris(sim);
      expect(d?.loot.some((l) => l.id.startsWith('pagina_')) ?? false).toBe(false);
    }
  });
});

describe('historia: llegada a Puerto Esperanza', () => {
  function arriveSetup() {
    const sim = quiet(setup(21));
    sim.state.time = at(9, 5) + 30; // de madrugada
    sim.state.voyage.regionId = 'esperanza';
    sim.state.story!.pages = [1, 2, 3, 4, 5];
    sim.state.story!.revealed = true;
    return sim;
  }

  it('al amanecer: final del cuaderno, dos vecinos se unen y abre el mercado del muelle', () => {
    const sim = arriveSetup();
    const started: string[] = [];
    sim.bus.on('worldEventStarted', (e) => started.push(e.type));
    const crew = sim.state.npcs.length;
    run(sim, 20);
    expect(sim.state.story!.arrived).toBe(false); // aún es de noche
    runUntil(sim, at(9, 6) + 2);
    expect(sim.state.story!.arrived).toBe(true);
    expect(started).toContain('llegada');
    expect(lastHistory(sim, 'llegada')?.success).toBe(true);
    // Diario: la llegada y el epílogo.
    expect(sim.state.log.some((l) => l.text.includes('Al amanecer aparece la luz verde'))).toBe(true);
    expect(sim.state.log.some((l) => l.text.includes('Tu ciudad flotante ya no está sola'))).toBe(true);
    // Dos habitantes nuevos, descansados.
    expect(sim.state.npcs.length).toBe(crew + 2);
    for (const n of sim.state.npcs.slice(-2)) expect(n.needs.health).toBe(100);
    expect(sim.state.log.some((l) => /del puerto piden un sitio a bordo\. Se unen a la tripulación/.test(l.text))).toBe(true);
    // Mercado especial: seis ofertas generosas durante 6 h, con los planos que falten.
    const market = sim.state.events.active.find((e) => e.type === 'mercante')!;
    expect(market.title).toBe('Mercado de Puerto Esperanza');
    expect(market.endsAt! - sim.state.time).toBeGreaterThan(events.ARRIVAL_MARKET_MIN - 5);
    const offers = events.tradeOffers(sim, market.id);
    expect(offers.length).toBe(events.PORT_OFFER_COUNT);
    expect(offers.some((o) => o.get[BLUEPRINT_ORDER[0]!])).toBe(true);
    // La pantalla de final tiene sus datos.
    const s = events.arrivalSummary(sim)!;
    expect(s.title).toBe('Puerto Esperanza');
    expect(s.paragraphs.length).toBe(2);
    expect(s.epilogue).toMatch(/seguir navegando/);
    expect(s.pagesRead).toBe(5);
    expect(s.pagesTotal).toBe(7);
    expect(s.newcomers.length).toBe(2);
    expect(s.crew).toEqual(expect.arrayContaining(s.newcomers));
    expect(s.marketEventId).toBe(market.id);
    expect(s.day).toBe(9);
    // No se repite y la partida sigue.
    run(sim, 120);
    expect(started.filter((t) => t === 'llegada').length).toBe(1);
  });

  it('el mercado del muelle: comercio y cierre con sus propios textos', () => {
    const sim = arriveSetup();
    runUntil(sim, at(9, 7));
    const market = sim.state.events.active.find((e) => e.type === 'mercante')!;
    const offers = events.tradeOffers(sim, market.id);
    const o = offers[0]!;
    for (const [id, q] of Object.entries(o.give)) addItem(sim.state.player.inventory, id, q);
    expect(sim.trade(market.id, 0).ok).toBe(true);
    expect(sim.state.log.some((l) => l.text.startsWith('Trato en el mercado de Puerto Esperanza'))).toBe(true);
    runUntil(sim, market.endsAt! + 2);
    expect(sim.state.log.some((l) => /El mercado del muelle recoge sus puestos tras 1 trato/.test(l.text))).toBe(true);
  });

  it('con el jugador dormido espera a que despierte; sobrevive a guardar y cargar', () => {
    const sim = arriveSetup();
    sim.state.time = at(9, 10);
    sim.state.player.sleeping = { moduleId: null, bed: 0, until: null };
    events.tickEvents(sim, 1);
    expect(sim.state.story!.arrived).toBe(false);
    sim.state.player.sleeping = null;
    events.tickEvents(sim, 1);
    expect(sim.state.story!.arrived).toBe(true);
    const loaded = new Simulation(deserialize(serialize(sim.state)));
    expect(loaded.state.story!.arrived).toBe(true);
    expect(events.arrivalSummary(loaded)?.title).toBe('Puerto Esperanza');
    expect(events.canStartEvent(loaded, 'llegada')).toBe(false);
  });

  it('fuera de Puerto Esperanza no hay llegada ni pantalla de final', () => {
    const sim = quiet(setup());
    expect(events.canStartEvent(sim, 'llegada')).toBe(false);
    expect(events.startEvent(sim, 'llegada')).toBeNull();
    expect(events.arrivalSummary(sim)).toBeNull();
    // El director nunca la saca por su cuenta.
    sim.state.voyage.regionId = 'esperanza';
    expect(events.eventWeights(sim).llegada).toBeUndefined();
  });
});

describe('relaciones entre habitantes', () => {
  function pair(seed = 11) {
    const sim = quiet(setup(seed));
    return { sim, marina: npcById(sim, 'npc1'), tomas: npcById(sim, 'npc2') };
  }

  it('afinidad simétrica y limitada; etiquetas concordadas y lista para la interfaz', () => {
    const { sim, marina, tomas } = pair();
    expect(npc.relationBetween(marina, tomas)).toBe(0);
    expect(npc.npcRelations(sim, marina)).toEqual([]);
    expect(npc.npcRelations(sim, marina, true)).toEqual([{ id: 'npc2', name: 'Tomás', value: 0, label: 'Se conocen poco' }]);
    npc.adjustRelation(sim, marina, tomas, 45);
    expect(npc.relationBetween(tomas, marina)).toBe(45);
    expect(npc.npcRelations(sim, marina)).toEqual([{ id: 'npc2', name: 'Tomás', value: 45, label: 'Amigo' }]);
    expect(npc.npcRelations(sim, tomas)[0]!.label).toBe('Amiga');
    npc.adjustRelation(sim, marina, tomas, 500);
    expect(npc.relationBetween(marina, tomas)).toBe(100);
    expect(npc.relationLabel(20, tomas)).toBe('Se llevan bien');
    expect(npc.relationLabel(0, tomas)).toBeNull();
    expect(npc.relationLabel(-20, tomas)).toBe('Roces');
    expect(npc.relationLabel(-40, tomas)).toBe('No se soportan');
    const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true })!;
    npc.adjustRelation(sim, marina, lucia, -60);
    const list = npc.npcRelations(sim, marina);
    expect(list.map((r) => r.label)).toEqual(['Amigo', 'No se soportan']); // de la mejor a la peor
  });

  it('juntos: los amigos se animan y los rivales se amargan (despiertos y cerca)', () => {
    const { sim, marina, tomas } = pair();
    Object.assign(marina.pos, { x: 0, y: LEVEL_H, z: 0 });
    Object.assign(tomas.pos, { x: 2, y: LEVEL_H, z: 0 });
    marina.activity = 'idle';
    tomas.activity = 'idle';
    npc.adjustRelation(sim, marina, tomas, 50);
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Está con su amigo Tomás', value: npc.FRIEND_MOOD });
    expect(npc.npcMoodFactors(sim, tomas)).toContainEqual({ label: 'Está con su amiga Marina', value: npc.FRIEND_MOOD });
    tomas.activity = 'sleeping';
    expect(npc.npcMoodFactors(sim, marina).some((f) => /amigo/.test(f.label))).toBe(false);
    tomas.activity = 'idle';
    tomas.pos.x = 30;
    expect(npc.npcMoodFactors(sim, marina).some((f) => /amigo/.test(f.label))).toBe(false);
    tomas.pos.x = 2;
    npc.adjustRelation(sim, marina, tomas, -110);
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Tiene cerca a Tomás, con quien no se soporta', value: npc.RIVAL_MOOD });
    const sum = npc.npcMoodFactors(sim, marina).reduce((a, f) => a + f.value, 0);
    expect(npc.npcMoodTarget(sim, marina)).toBe(Math.max(0, Math.min(100, sum)));
  });

  it('la muerte de un amigo duele más y deja luto', () => {
    const { sim, marina, tomas } = pair();
    const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true })!;
    npc.adjustRelation(sim, marina, tomas, 70);
    for (const n of sim.state.npcs) n.needs.mood = 80;
    tomas.needs.health = 0.01;
    tomas.sick = true;
    sim.tick(1);
    expect(sim.state.npcs.includes(tomas)).toBe(false);
    expect(marina.needs.mood).toBeLessThan(lucia.needs.mood - npc.FRIEND_GRIEF + 1);
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Llora la muerte de su amigo Tomás', value: npc.GRIEF_MOOD });
    expect(npc.npcMoodFactors(sim, lucia).some((f) => /Llora/.test(f.label))).toBe(false);
    expect(sim.state.log.some((l) => l.text === 'Marina llora a Tomás más que nadie: eran grandes amigos.')).toBe(true);
    expect(marina.relations?.['npc2']).toBeUndefined();
    expect(sim.talkTo('npc1')!.lines).toContain('Echo mucho de menos a Tomás…');
    sim.state.time += (npc.GRIEF_HOURS + 1) * 60;
    expect(npc.npcMoodFactors(sim, marina).some((f) => /Llora/.test(f.label))).toBe(false);
  });

  it('discutir baja la afinidad; mediar la recupera en parte; si se enquista, peor', () => {
    const { sim, marina, tomas } = pair();
    marina.needs.mood = 30;
    tomas.needs.mood = 30;
    const ev = events.startEvent(sim, 'discusion')!;
    expect(npc.relationBetween(marina, tomas)).toBe(events.ARGUE_RELATION);
    expect(sim.npcOption('npc1', 'mediar').ok).toBe(true);
    expect(npc.relationBetween(marina, tomas)).toBe(events.ARGUE_RELATION + events.MEDIATE_RELATION);
    expect(lastHistory(sim, 'discusion')?.success).toBe(true);
    sim.state.events.cooldowns['discusion'] = 0;
    marina.needs.mood = 30;
    tomas.needs.mood = 30;
    const ev2 = events.startEvent(sim, 'discusion')!;
    expect(ev2).not.toBe(ev);
    expect(npc.relationBetween(marina, tomas)).toBe(events.ARGUE_RELATION * 2 + events.MEDIATE_RELATION);
    runUntil(sim, ev2.endsAt! - 1);
    const r0 = npc.relationBetween(marina, tomas);
    run(sim, 2);
    expect(lastHistory(sim, 'discusion')?.success).toBe(false);
    expect(npc.relationBetween(marina, tomas)).toBeCloseTo(r0 + events.FESTER_RELATION, 1);
  });

  it('los rivales discuten aunque no estén tan desanimados, y el director lo saca más', () => {
    const { sim, marina, tomas } = pair();
    const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true })!;
    for (const n of sim.state.npcs) n.needs.mood = 60;
    sim.state.time = at(3, 12);
    expect(events.canStartEvent(sim, 'discusion')).toBe(false);
    const base = events.eventWeights(sim).discusion;
    npc.adjustRelation(sim, tomas, lucia, -60);
    expect(events.rivalPairs(sim).length).toBe(1);
    expect(events.canStartEvent(sim, 'discusion')).toBe(true);
    const w = events.eventWeights(sim).discusion!;
    expect(w).toBeGreaterThan(0);
    if (base) expect(w).toBeCloseTo(base * events.RIVAL_ARGUE_FACTOR);
    const ev = events.startEvent(sim, 'discusion')!;
    expect((ev.data as { npcIds: string[] }).npcIds.sort()).toEqual([tomas.id, lucia.id].sort());
    expect(ev.description).toMatch(/no se soportan/);
    expect((ev.data as { npcIds: string[] }).npcIds).not.toContain(marina.id);
  });

  it('charlar suele acercarles (a veces acaba en roce) y los amigos hablan de sus amigos', () => {
    const { sim, marina, tomas } = pair(17);
    for (const n of sim.state.npcs) n.role = 'libre';
    const said: string[] = [];
    let changed = false;
    runUntil(sim, at(1, 18));
    run(sim, 3 * MINUTES_PER_DAY, () => {
      for (const n of sim.state.npcs) {
        n.needs.hunger = Math.max(n.needs.hunger, 60);
        n.needs.thirst = Math.max(n.needs.thirst, 60);
        if (n.say && said.at(-1) !== n.say.text) said.push(n.say.text);
      }
      if (npc.relationBetween(marina, tomas) !== 0) changed = true;
    });
    expect(changed).toBe(true);
    npc.adjustRelation(sim, marina, tomas, 80);
    const before = said.length;
    run(sim, 2 * MINUTES_PER_DAY, () => {
      for (const n of sim.state.npcs) {
        n.needs.hunger = Math.max(n.needs.hunger, 60);
        n.needs.thirst = Math.max(n.needs.thirst, 60);
        if (n.say && said.at(-1) !== n.say.text) said.push(n.say.text);
      }
    });
    expect(said.slice(before).some((t) => /Tomás|Marina/.test(t))).toBe(true);
  });

  it('compartir mesa acerca un poco', () => {
    const { sim, marina, tomas } = pair();
    const now = sim.state.time;
    for (const [n, x] of [[marina, 0], [tomas, 1.2]] as const) {
      Object.assign(n.pos, { x, y: LEVEL_H, z: 4 });
      n.carry = { id: 'conserva', qty: 1 };
      n.activity = 'eating';
      n.task = { kind: 'comer', until: now + 0.5, data: { phase: 'act', prio: 45, deadline: 1e12, stage: 'mesa', seatKey: null } };
    }
    run(sim, 2);
    expect(npc.relationBetween(marina, tomas)).toBeCloseTo(npc.MEAL_RELATION, 1); // (menos lo que se enfría en 2 min)
  });

  it('sin trato, la afinidad se enfría poco a poco (también la de quien está fuera)', () => {
    const { sim, marina, tomas } = pair();
    npc.adjustRelation(sim, marina, tomas, 10);
    for (const n of [marina, tomas]) {
      n.awayUntil = 1e9;
      n.activity = 'away';
    }
    run(sim, MINUTES_PER_DAY);
    expect(npc.relationBetween(marina, tomas)).toBeCloseTo(10 - npc.RELATION_DECAY_PER_DAY, 1);
    expect(npc.relationBetween(tomas, marina)).toBeCloseTo(npc.relationBetween(marina, tomas), 5);
  });

  it('en la conversación cuentan con quién se llevan bien y con quién no', () => {
    const { sim, marina, tomas } = pair();
    const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true })!;
    npc.adjustRelation(sim, marina, tomas, 60);
    npc.adjustRelation(sim, marina, lucia, -60);
    const lines = sim.talkTo('npc1')!.lines;
    expect(lines.some((l) => /Tomás/.test(l) && /maravilla|uña y carne|no sería lo mismo/.test(l))).toBe(true);
    expect(lines.some((l) => /Lucía/.test(l) && /No soporto|no hay manera/.test(l))).toBe(true);
    expect(lines.some((l) => /mejor ni me la nombres|no hay manera/.test(l))).toBe(true);
  });
});

describe('sala común', () => {
  function salaSetup(seed = 11) {
    const sim = quiet(setup(seed));
    const sala = placeAt(sim, 'sala_comun', 1);
    for (const n of sim.state.npcs) n.role = 'libre';
    return { sim, sala };
  }
  function keepFed(sim: Simulation) {
    for (const n of sim.state.npcs) {
      n.needs.hunger = Math.max(n.needs.hunger, 70);
      n.needs.thirst = Math.max(n.needs.thirst, 70);
      n.needs.energy = Math.max(n.needs.energy, 60);
    }
  }

  it('en su rato libre prefieren ir allí: se sientan en el sofá y el confort se nota en el ánimo', () => {
    const { sim, sala } = salaSetup();
    runUntil(sim, at(1, 18));
    let seated = false;
    let inLounge = 0;
    run(sim, 200, () => {
      keepFed(sim);
      for (const n of sim.state.npcs) {
        const d = n.task?.data as { job?: string; phase?: string; seatKey?: string } | undefined;
        if (n.task?.kind === 'ocio' && d?.job === 'sala' && d.phase === 'act') {
          inLounge++;
          expect(n.task.targetModuleId).toBe(sala.id);
          if (d.seatKey && npc.isSeated(n)) {
            const seat = npc.seatPose(sim, d.seatKey)!;
            expect(seat.kind).toBe('sofa');
            expect(Math.hypot(n.pos.x - seat.x, n.pos.z - seat.z)).toBeLessThan(1e-6);
            expect(sim.npcStatus(n.id)).toMatch(/sala común/);
            seated = true;
          }
        }
      }
    });
    expect(inLounge).toBeGreaterThan(30);
    expect(seated).toBe(true);
    const comfort = moduleDef('sala_comun').comfort!;
    const someone = sim.state.npcs.find((n) => npc.npcMoodFactors(sim, n).some((f) => f.label === 'Ha pasado un rato en la sala común'))!;
    expect(npc.npcMoodFactors(sim, someone)).toContainEqual({ label: 'Ha pasado un rato en la sala común', value: npc.COMFORT_MOOD * comfort });
  });

  it('la sala mejorada (más confort) anima más', () => {
    const { sim, sala } = salaSetup();
    sala.tier = 2;
    runUntil(sim, at(1, 18));
    run(sim, 200, () => keepFed(sim));
    const f = sim.state.npcs.flatMap((n) => npc.npcMoodFactors(sim, n)).find((x) => x.label === 'Ha pasado un rato en la sala común');
    expect(f?.value).toBe(npc.COMFORT_MOOD * 6);
  });

  it('juegan juntos a la mesa de juegos y se llevan mejor', () => {
    const { sim, sala } = salaSetup(4);
    const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true, role: 'libre' })!;
    lucia.needs = { hunger: 90, thirst: 90, energy: 90, mood: 70, health: 100 };
    runUntil(sim, at(1, 18));
    let together = false;
    let status = '';
    run(sim, 6 * 60, () => {
      keepFed(sim);
      const players = sim.state.npcs.filter((n) => n.task?.kind === 'ocio' && (n.task.data as { game?: boolean; phase?: string }).game && (n.task.data as { phase?: string }).phase === 'act' && n.task.targetModuleId === sala.id);
      if (players.length >= 2) {
        together = true;
        status = sim.npcStatus(players[0]!.id);
        expect(players[0]!.activity).toBe('socializing');
      }
    });
    expect(together).toBe(true);
    expect(status).toMatch(/^Jugando a las cartas con /);
    const rels = sim.state.npcs.flatMap((a) => sim.state.npcs.filter((b) => b !== a).map((b) => npc.relationBetween(a, b)));
    expect(rels.some((v) => v > 0)).toBe(true);
  });

  it('las plazas del sofá están sobre el mueble, mirando a su frente', () => {
    const { sim, sala } = salaSetup();
    const sofa = sim.layout.props.find((p) => p.moduleId === sala.id && p.kind === 'sofa')!;
    const seats = npc.loungeSeats(sim);
    expect(seats.length).toBe(npc.SOFA_SEATS.length);
    for (const s of seats) {
      expect(s.yaw).toBeCloseTo(sofa.yaw);
      expect(Math.hypot(s.x - sofa.x, s.z - sofa.z)).toBeLessThan(sofa.hx + 0.2);
      expect(s.moduleId).toBe(sala.id);
    }
    expect(npc.seatPose(sim, `${sofa.key}@9`)).toBeNull();
    expect(npc.seatPose(sim, 'no-existe')).toBeNull();
  });
});

describe('confort de camarotes, dormitorios y comedor (con mejoras)', () => {
  it('cama: camarote 4 + 2 × confort, dormitorio 2 + 2 × confort; las mejoras suben el ánimo', () => {
    const sim = quiet(setup());
    const marina = npcById(sim, 'npc1');
    const dorm = mod(sim, 'dormitorio');
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Tiene litera en el dormitorio', value: 4 });
    dorm.tier = 2;
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Tiene litera en el dormitorio con taquillas', value: 8 });
    const cam = placeAt(sim, 'camarote', 1);
    npc.assignBeds(sim);
    expect(marina.bed?.moduleId).toBe(cam.id);
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Duerme en un camarote propio', value: 10 });
    cam.tier = 2;
    expect(npc.npcMoodFactors(sim, marina)).toContainEqual({ label: 'Duerme en un camarote acogedor', value: 14 });
  });

  it('comedor: 2 × confort − 1 tras comer allí (más con la mejora)', () => {
    for (const tier of [1, 2]) {
      const sim = quiet(setup());
      const comedor = placeAt(sim, 'comedor', 1);
      comedor.tier = tier;
      const marina = npcById(sim, 'npc1');
      sim.state.npcs = [marina];
      runUntil(sim, at(1, 13) + 50);
      marina.needs.hunger = 60;
      let f: { label: string; value: number } | undefined;
      run(sim, 90, () => (f ??= npc.npcMoodFactors(sim, marina).find((x) => x.label === 'Ha comido en el comedor')));
      expect(f?.value).toBe(tier === 1 ? 5 : 9);
    }
  });
});

describe('módulos nuevos en la IA de los habitantes', () => {
  it('el cocinero lleva el pescado crudo que sobra al ahumadero (paga con los almacenes) y el ahumado acaba en el almacén', () => {
    const sim = quiet(setup());
    const ahu = placeAt(sim, 'ahumadero', 1);
    const alm = mod(sim, 'almacen');
    addItem(alm.inventory!, 'pescado_crudo', 7);
    addItem(alm.inventory!, 'conserva', 10); // no hace falta cocinar: sobra crudo
    const player0 = countItem(sim.state.player.inventory, 'conserva');
    const fishBefore = storageTotal(sim, 'pescado_crudo');
    runUntil(sim, at(1, 9));
    let queued = false;
    run(sim, 240, () => {
      keepPlayer(sim);
      if (ahu.queue.some((j) => j.recipeId === 'ahumar' && j.by === 'npc')) queued = true;
    });
    expect(queued).toBe(true);
    expect(storageTotal(sim, 'pescado_crudo')).toBeLessThanOrEqual(fishBefore - 3);
    expect(countItem(sim.state.player.inventory, 'conserva')).toBe(player0); // nunca el inventario del jugador
    // El ahumado (de la bandeja) termina en el almacén, donde la tripulación lo come.
    expect(storageTotal(sim, 'pescado_ahumado') + countItem(ahu.inventory, 'pescado_ahumado')).toBeGreaterThanOrEqual(3);
    run(sim, 240, () => keepPlayer(sim));
    expect(countItem(ahu.inventory, 'pescado_ahumado')).toBeLessThan(3);
  });

  it('no se lleva el pescado que el fogón necesita ni la última leña', () => {
    const sim = quiet(setup());
    const ahu = placeAt(sim, 'ahumadero', 1);
    removeEverywhere(sim, 'pescado_crudo');
    addItem(mod(sim, 'almacen').inventory!, 'pescado_crudo', 4); // 3 por tanda + 2 de reserva > 4
    addItem(mod(sim, 'almacen').inventory!, 'conserva', 10);
    runUntil(sim, at(1, 9));
    run(sim, 180, () => keepPlayer(sim));
    expect(ahu.queue.length).toBe(0);
    expect(countItem(ahu.inventory, 'pescado_ahumado')).toBe(0);
  });

  it('alguien vacía las bandejas del vivero y de la grúa en el almacén', () => {
    const sim = quiet(setup());
    powerUp(sim);
    const viv = placeAt(sim, 'vivero', 0);
    const grua = placeAt(sim, 'grua', 1, (_x, z) => z === 0);
    addItem(viv.inventory!, 'pescado_crudo', 4);
    addItem(grua.inventory!, 'madera', 6);
    addItem(grua.inventory!, 'cuerda', 2);
    const pesc = npc.spawnSurvivor(sim, { name: 'Bruno', role: 'pescador', quiet: true })!;
    const rec = npc.spawnSurvivor(sim, { name: 'Inés', role: 'recolector', quiet: true })!;
    for (const n of [pesc, rec]) n.needs = { hunger: 90, thirst: 90, energy: 90, mood: 70, health: 100 };
    const fish0 = storageTotal(sim, 'pescado_crudo');
    const wood0 = storageTotal(sim, 'madera');
    runUntil(sim, at(1, 9));
    const jobs = new Set<string>();
    run(sim, 180, () => {
      keepPlayer(sim);
      for (const n of [pesc, rec]) {
        const d = n.task?.data as { job?: string } | undefined;
        if (d?.job === 'bandeja') jobs.add(`${n.name}:${sim.npcStatus(n.id)}`);
      }
    });
    expect(countItem(grua.inventory, 'madera')).toBe(0);
    expect(countItem(viv.inventory, 'pescado_crudo')).toBeLessThan(4);
    expect(storageTotal(sim, 'madera')).toBeGreaterThanOrEqual(wood0 + 6 - 3); // (algo de leña pudo ir al fogón)
    expect(storageTotal(sim, 'pescado_crudo') + countItem(viv.inventory, 'pescado_crudo')).toBeGreaterThanOrEqual(fish0);
    expect([...jobs].some((j) => /bandeja de la grúa/.test(j))).toBe(true);
    expect([...jobs].some((j) => /bandeja del vivero/.test(j))).toBe(true);
  });

  it('el mecánico repara también la grúa, el vivero y el radar', () => {
    const sim = quiet(setup());
    powerUp(sim);
    const radar = placeAt(sim, 'radar', 2);
    const viv = placeAt(sim, 'vivero', 0);
    for (const m of [radar, viv]) {
      m.status = 'broken';
      m.condition = 20;
      m.brokenReason = 'Pruebas';
    }
    addItem(mod(sim, 'almacen').inventory!, 'pieza_mecanica', 2);
    runUntil(sim, at(1, 9));
    run(sim, 300, () => keepPlayer(sim));
    expect(radar.status).toBe('active');
    expect(viv.status).toBe('active');
    expect(radar.condition).toBeGreaterThanOrEqual(95);
  });

  it('las averías de las máquinas nuevas tienen su motivo y su texto («el radar»)', () => {
    const sim = quiet(setup());
    powerUp(sim);
    const radar = placeAt(sim, 'radar', 2);
    const ev = events.startEvent(sim, 'averia', { moduleId: radar.id })!;
    expect(ev.title).toBe('Avería: Radar');
    const reason = (ev.data as { reason: string }).reason;
    expect(['La antena se ha desalineado con el viento', 'Una válvula de la radio se ha fundido']).toContain(reason);
    expect(ev.description).toMatch(/en el radar\. El radar no funcionará hasta repararlo\./);
    const grua = placeAt(sim, 'grua', 1, (_x, z) => z === 0);
    const ev2 = events.startEvent(sim, 'averia', { moduleId: grua.id, scripted: true });
    expect(ev2 ?? null).toBeNull(); // ya hay una avería activa
    sim.state.events.active = [];
    const ev3 = events.startEvent(sim, 'averia', { moduleId: grua.id })!;
    expect(ev3.description).toMatch(/la grúa de rescate\. La grúa de rescate no funcionará hasta repararla\./);
  });

  it('comen pescado ahumado (comida lista, no hace falta cocinarlo)', () => {
    const sim = quiet(setup());
    const marina = npcById(sim, 'npc1');
    sim.state.npcs = [marina];
    emptyFood(sim);
    addItem(mod(sim, 'almacen').inventory!, 'pescado_ahumado', 3);
    marina.needs.hunger = 20;
    run(sim, 60);
    expect(storageTotal(sim, 'pescado_ahumado')).toBe(2);
    expect(marina.needs.hunger).toBeGreaterThan(30);
    expect(npc.FOOD_PREFERENCE.indexOf('pescado_ahumado')).toBeLessThan(npc.FOOD_PREFERENCE.indexOf('conserva'));
  });
});

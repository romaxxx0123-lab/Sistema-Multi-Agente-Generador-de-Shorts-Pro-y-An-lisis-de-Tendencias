/**
 * Tests del hilo narrativo y el final (ronda de pruebas 2, área fix-historia): hojas del cuaderno en
 * cofres a la deriva (nunca de noche ni con el jugador dormido; una hoja perdida no gasta el
 * enfriamiento), rumbo de la capitana (la elección no se pierde durmiendo), bocana de Puerto
 * Esperanza, textos de la llegada según la hora, instantánea de la llegada, epílogo y radio
 * coherentes con lo que se puede hacer, nombres de habitantes, rumores de la radio que el próximo
 * mercante cumple, charla sin repeticiones y clima que no salta al guardar y cargar.
 */
import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/data/items';
import { TRADE_OFFERS } from '../src/data/loot';
import { NPC_NAMES } from '../src/data/names';
import { REGIONS } from '../src/data/regions';
import { arrivalText, FINAL_REGION, STORY_PAGES, STORY_TEXTS } from '../src/data/story';
import { COLLECT_RANGE, hullBounds } from '../src/sim/debris';
import * as debris from '../src/sim/debris';
import * as events from '../src/sim/events';
import { MINUTES_PER_DAY } from '../src/sim/constants';
import { createNewGame } from '../src/sim/newGame';
import { isFemaleNpc, spawnSurvivor } from '../src/sim/npc';
import { deserialize, serialize } from '../src/sim/save';
import { Simulation } from '../src/sim/Simulation';
import type { Debris, GameState } from '../src/sim/types';
import * as voyage from '../src/sim/voyage';
import * as weather from '../src/sim/weather';

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

function keepPlayer(sim: Simulation): void {
  Object.assign(sim.state.player.needs, { hunger: 90, thirst: 90, energy: 90, health: 100, warmth: 80 });
  sim.state.player.sick = 0;
}

function run(sim: Simulation, minutes: number): void {
  for (let m = 0; m < minutes; m++) {
    keepPlayer(sim);
    sim.tick(1);
  }
}

function at(day: number, hour: number): number {
  return (day - 1) * MINUTES_PER_DAY + hour * 60;
}

function sleep(sim: Simulation): void {
  sim.state.player.sleeping = { moduleId: null, bed: 0, until: null };
}

function reload(sim: Simulation): Simulation {
  sim.syncRng(); // (lo hace `tick`; aquí se llama también a los sistemas sueltos)
  return new Simulation(deserialize(serialize(sim.state)));
}

const pageItem = (d: Debris | undefined | null): string | undefined => d?.loot.find((l) => l.id.startsWith('pagina_'))?.id;

/** Región y hojas leídas para que la siguiente hoja de la región sea `n` (y lleve días sin aparecer ninguna). */
function pageSetup(n: number, region: string, time: number, seed = 12): Simulation {
  const sim = quiet(setup(seed));
  const st = sim.state;
  st.time = time;
  st.voyage.regionId = region;
  st.voyage.regionLength = REGIONS[region]!.length;
  st.voyage.regionDistance = 5;
  st.voyage.speed = 6;
  st.story!.pages = STORY_PAGES.filter((p) => p.n < n).map((p) => p.n);
  // La última hoja apareció hace diez días (sequía al máximo).
  st.events.cooldowns['pagina'] = time - 9 * MINUTES_PER_DAY;
  return sim;
}

/** Hace aparecer restos a la deriva hasta que sale un cofre (quitando los demás para no llenar el mar). */
function nextChest(sim: Simulation, tries = 3000): Debris | null {
  for (let i = 0; i < tries; i++) {
    const d = debris.spawnAmbientDebris(sim);
    if (!d) continue;
    if (d.kind === 'cofre') return d;
    sim.state.debris = sim.state.debris.filter((x) => x !== d);
  }
  return null;
}

/** Hace aparecer cofres hasta que uno trae hoja (los demás se retiran sin hoja que perder). */
function chestWithPage(sim: Simulation, tries = 400): Debris | null {
  for (let i = 0; i < tries; i++) {
    const d = nextChest(sim);
    if (!d) return null;
    if (pageItem(d)) return d;
    sim.state.debris = sim.state.debris.filter((x) => x !== d);
  }
  return null;
}

/** Deja derivar los restos hasta que `d` se pierde a popa (o se agota el tiempo). Devuelve los minutos. */
function driftUntilGone(sim: Simulation, d: Debris, max = 400): number {
  let m = 0;
  while (m < max && sim.state.debris.some((x) => x.id === d.id)) {
    debris.tickDebris(sim, 1);
    sim.state.time += 1;
    m++;
  }
  return m;
}

/* ------------------------------------------------------------------ */
/* Hojas del cuaderno en cofres a la deriva                            */
/* ------------------------------------------------------------------ */

describe('hojas a la deriva: nunca de noche ni con el jugador dormido', () => {
  it('de madrugada, al anochecer o durmiendo, ningún cofre a la deriva trae hoja ni gasta el enfriamiento', () => {
    for (const [hour, asleep] of [
      [2, false],
      [18.5, false],
      [23, false],
      [10, true],
    ] as const) {
      const sim = pageSetup(4, 'cementerio', at(4, hour));
      if (asleep) sleep(sim);
      const cd = sim.state.events.cooldowns['pagina'];
      let chests = 0;
      for (let i = 0; i < 120; i++) {
        const d = nextChest(sim);
        expect(d).not.toBeNull();
        chests++;
        expect(pageItem(d), `${hour} h ${asleep ? 'dormido' : 'despierto'}`).toBeUndefined();
        sim.state.debris = [];
      }
      expect(chests).toBe(120);
      expect(sim.state.events.cooldowns['pagina']).toBe(cd);
      expect(sim.state.story!.placed).toBeUndefined();
    }
  });

  it('de día y despierto sí puede traerla (en su región y con la sequía acumulada)', () => {
    const sim = pageSetup(4, 'cementerio', at(4, 10));
    const d = chestWithPage(sim);
    expect(pageItem(d)).toBe('pagina_4');
    expect(sim.state.story!.placed).toEqual([4]);
    expect(sim.state.events.cooldowns['pagina']).toBe(sim.state.time + events.PAGE_COOLDOWN_MIN);
  });

  it('el azar consume las mismas tiradas de día que de noche (determinismo)', () => {
    const night = pageSetup(4, 'cementerio', at(4, 2), 31);
    const day = pageSetup(4, 'cementerio', at(4, 10), 31);
    for (let i = 0; i < 300; i++) {
      const a = debris.spawnAmbientDebris(night);
      const b = debris.spawnAmbientDebris(day);
      expect(a?.kind).toBe(b?.kind);
      expect(night.state.rngState).toBe(day.state.rngState);
      night.state.debris = [];
      day.state.debris = [];
      // Sin hoja en juego en ninguna de las dos (para que ambas sigan tirando el dado de la hoja).
      day.state.story!.placed = undefined;
      day.state.events.cooldowns['pagina'] = day.state.time - 9 * MINUTES_PER_DAY;
    }
  });
});

describe('hojas a la deriva: un cofre con hoja se deja ver y dura lo bastante', () => {
  it('aparece más lejos por la proa, pegado al costado y con un aviso en el diario', () => {
    const sim = pageSetup(4, 'cementerio', at(4, 10));
    const d = chestWithPage(sim)!;
    const b = hullBounds(sim);
    expect(d.pos.x).toBeGreaterThanOrEqual(b.bowX + debris.PAGE_CHEST_AHEAD[0] - 0.01);
    const side = Math.abs(d.pos.z) - b.halfW;
    expect(side).toBeGreaterThanOrEqual(debris.PAGE_CHEST_SIDE[0] - 0.01);
    expect(side).toBeLessThanOrEqual(debris.PAGE_CHEST_SIDE[1] + 0.01);
    const note = sim.state.log.at(-1)!;
    expect(note.text).toMatch(/^Por la proa, a (babor|estribor), flota a la deriva un cofre metálico bien cerrado/);
    expect(note.text).toContain(d.pos.z < 0 ? 'babor' : 'estribor');
    // Fondeados aparece por el costado y la corriente lo acerca: el aviso lo dice así.
    const anchored = pageSetup(4, 'cementerio', at(4, 10), 13);
    anchored.state.voyage.anchoredUntil = anchored.state.time + 600;
    const a = chestWithPage(anchored)!;
    expect(anchored.state.log.at(-1)!.text).toBe(
      `Por ${a.pos.z < 0 ? 'babor' : 'estribor'}, la corriente acerca un cofre metálico bien cerrado, como los que dejó la capitana Duarte: ¡échale el gancho desde la borda!`,
    );
  });

  it('navegando, tarda más de una hora en perderse y pasa un buen rato pegado a la borda', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sim = pageSetup(7, 'faro', at(10, 9), seed);
      const d = chestWithPage(sim)!;
      expect(pageItem(d)).toBe('pagina_7');
      const b = hullBounds(sim);
      let inReach = 0;
      let close = 0;
      let minutes = 0;
      while (sim.state.debris.some((x) => x.id === d.id) && minutes < 400) {
        // Distancia al punto más cercano de la borda de su costado.
        const rx = Math.min(b.bowX, Math.max(b.sternX, d.pos.x));
        const rz = Math.sign(d.pos.z) * b.halfW;
        const dist = Math.hypot(d.pos.x - rx, d.pos.z - rz);
        if (dist <= COLLECT_RANGE) inReach++;
        if (dist <= 12) close++;
        debris.tickDebris(sim, 1);
        sim.state.time += 1;
        minutes++;
      }
      // Antes: 50–55 min y, la mitad de las veces, nunca a menos de 12 m de la borda.
      expect(minutes, `semilla ${seed}`).toBeGreaterThan(60);
      expect(inReach, `semilla ${seed}`).toBeGreaterThanOrEqual(30);
      expect(close, `semilla ${seed}`).toBeGreaterThanOrEqual(15);
    }
  });
});

describe('hojas perdidas: ni gastan el enfriamiento ni reinician la sequía', () => {
  it('un cofre con hoja que se pierde a popa devuelve el enfriamiento y la sequía de antes', () => {
    const sim = pageSetup(7, 'faro', at(10, 9));
    const p7 = STORY_PAGES[6]!;
    const cdBefore = sim.state.events.cooldowns['pagina'];
    const before = events.pageChance(sim, p7, 'estructura');
    expect(before).toBeCloseTo(events.PAGE_CHANCE.estructura + events.PAGE_DROUGHT_MAX);
    const d = chestWithPage(sim)!;
    expect(events.pageChance(sim, p7, 'estructura')).toBe(0); // en juego: enfriamiento
    expect(driftUntilGone(sim, d)).toBeLessThan(400);
    // Nada más perderse: la misma probabilidad que antes de aparecer (la sequía sigue contando).
    expect(events.pageChance(sim, p7, 'estructura')).toBeCloseTo(before, 6);
    expect(sim.state.events.cooldowns['pagina']).toBe(cdBefore);
    expect(sim.state.story!.placed).toBeUndefined();
    expect(sim.state.story!.pageCooldownBefore).toBeUndefined();
    expect(events.nextStoryPage(sim)?.n).toBe(7);
  });

  it('sin enfriamiento previo, perder la hoja lo deja como estaba (sin ninguno)', () => {
    const sim = pageSetup(4, 'cementerio', at(4, 10));
    delete sim.state.events.cooldowns['pagina'];
    const d = chestWithPage(sim)!;
    expect(sim.state.story!.pageCooldownBefore).toBeNull();
    driftUntilGone(sim, d);
    expect(events.pageChance(sim, STORY_PAGES[3]!, 'cofre')).toBeGreaterThan(0);
    expect(sim.state.events.cooldowns['pagina']).toBeUndefined();
  });

  it('una hoja que llega a bordo sí gasta el enfriamiento (y la sequía empieza de nuevo)', () => {
    const sim = pageSetup(4, 'cementerio', at(4, 10));
    const d = chestWithPage(sim)!;
    const cd = sim.state.events.cooldowns['pagina'];
    debris.collectDebrisFor(sim, d.id, 'player', { ...sim.state.player.pos });
    expect(events.pageChance(sim, STORY_PAGES[4]!, 'cofre')).toBe(0);
    expect(sim.state.story!.placed).toBeUndefined();
    expect(sim.state.story!.pageCooldownBefore).toBeUndefined();
    expect(sim.state.events.cooldowns['pagina']).toBe(cd);
  });

  it('el naufragio con hoja al que se dice «Seguir rumbo» la devuelve', () => {
    const sim = pageSetup(2, 'templadas', at(6, 10));
    const cd = sim.state.events.cooldowns['pagina'];
    const ev = events.startEvent(sim, 'naufragio', { page: 'next' })!;
    expect((ev.data as { page: string }).page).toBe('pagina_2');
    expect(events.pageChance(sim, STORY_PAGES[1]!, 'cofre')).toBe(0);
    expect(sim.eventChoice(ev.id, 'seguir').ok).toBe(true);
    expect(events.pageChance(sim, STORY_PAGES[1]!, 'cofre')).toBeGreaterThan(0);
    expect(sim.state.events.cooldowns['pagina']).toBe(cd);
  });

  it('el naufragio rescatado cuyo cofre se pierde a popa también la devuelve al acabar el rescate', () => {
    const sim = pageSetup(2, 'templadas', at(6, 10));
    const cd = sim.state.events.cooldowns['pagina'];
    const ev = events.startEvent(sim, 'naufragio', { page: 'next' })!;
    sim.eventChoice(ev.id, 'rescatar');
    const chest = sim.state.debris.find((d) => d.eventId === ev.id && d.kind === 'cofre')!;
    expect(pageItem(chest)).toBe('pagina_2');
    chest.pos.x = hullBounds(sim).sternX - 200; // a popa, fuera de alcance
    debris.tickDebris(sim, 1);
    expect(sim.state.debris.includes(chest)).toBe(false);
    sim.state.time = ev.endsAt! + 1;
    events.tickEvents(sim, 1);
    expect(events.eventById(sim, ev.id)).toBeUndefined();
    expect(events.pageChance(sim, STORY_PAGES[1]!, 'cofre')).toBeGreaterThan(0);
    expect(sim.state.events.cooldowns['pagina']).toBe(cd);
  });

  it('el mercante que se va sin vender la hoja la devuelve; si se compra, cuenta', () => {
    let tested = 0;
    for (let seed = 70; seed < 110 && tested < 2; seed++) {
      const sim = pageSetup(2, 'templadas', at(6, 10), seed);
      const cd = sim.state.events.cooldowns['pagina'];
      const ev = events.startEvent(sim, 'mercante')!;
      const k = events.tradeOffers(sim, ev.id).findIndex((o) => o.get['pagina_2']);
      if (k < 0) continue;
      tested++;
      if (tested === 1) {
        sim.eventChoice(ev.id, 'despedir');
        expect(events.pageChance(sim, STORY_PAGES[1]!, 'mercante')).toBeGreaterThan(0);
        expect(sim.state.events.cooldowns['pagina']).toBe(cd);
      } else {
        sim.state.player.inventory.slots[5] = { id: 'madera', qty: 20 };
        expect(sim.trade(ev.id, k).ok).toBe(true);
        sim.eventChoice(ev.id, 'despedir');
        expect(events.pageChance(sim, STORY_PAGES[2]!, 'mercante')).toBe(0);
        expect(sim.state.events.cooldowns['pagina']).toBeGreaterThan(sim.state.time);
      }
    }
    expect(tested).toBe(2);
  });

  it('las hojas en juego y el enfriamiento anterior sobreviven a guardar y cargar (y los datos rotos se quitan)', () => {
    const sim = pageSetup(7, 'faro', at(10, 9));
    const cdBefore = sim.state.events.cooldowns['pagina'];
    const d = chestWithPage(sim)!;
    const loaded = reload(sim);
    expect(loaded.state.story!.placed).toEqual([7]);
    expect(loaded.state.story!.pageCooldownBefore).toBe(cdBefore);
    const chest = loaded.state.debris.find((x) => x.id === d.id)!;
    driftUntilGone(loaded, chest);
    events.pageChance(loaded, STORY_PAGES[6]!, 'cofre');
    expect(loaded.state.events.cooldowns['pagina']).toBe(cdBefore);
    // Datos rotos.
    const raw = JSON.parse(serialize(sim.state)) as { state?: GameState } & GameState;
    const state = (raw.state ?? raw) as unknown as Record<string, Record<string, unknown>>;
    state['story']!['placed'] = ['x', 9, 1];
    state['story']!['pageCooldownBefore'] = 'ayer';
    const bad = deserialize(JSON.stringify(raw));
    expect(bad.story!.placed).toBeUndefined();
    expect(bad.story!.pageCooldownBefore).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Rumbo de la capitana                                                */
/* ------------------------------------------------------------------ */

describe('rumbo de la capitana: la elección no se pierde durmiendo', () => {
  function captainSetup(hour: number): Simulation {
    const sim = quiet(setup(5));
    const st = sim.state;
    st.time = at(8, hour);
    st.story!.pages = [1, 2, 3, 4, 5];
    st.story!.revealed = true;
    const v = st.voyage;
    v.regionId = 'templadas';
    v.regionLength = REGIONS['templadas']!.length;
    v.regionDistance = v.regionLength - 9;
    v.speed = 6;
    return sim;
  }

  function tickVoyage(sim: Simulation, minutes: number): void {
    for (let i = 0; i < minutes; i++) {
      voyage.tickVoyage(sim, 1);
      sim.state.time += 1;
    }
  }

  it('el texto al revelarlo dice que se puede fijar ya, no «al final de esta región»', () => {
    expect(STORY_TEXTS.revealed).not.toMatch(/al final de esta región/);
    expect(STORY_TEXTS.revealed).toMatch(/fija en el timón el rumbo de la capitana cuando quieras/);
    // Y de verdad se puede fijar en cuanto se revela, lejos del final de la región.
    const sim = captainSetup(10);
    sim.state.voyage.regionDistance = 5;
    expect(sim.chooseRoute(FINAL_REGION).ok).toBe(true);
  });

  it('dormido al final de la región: el barco sigue en ella hasta que despierta y decide', () => {
    const sim = captainSetup(23);
    sleep(sim);
    tickVoyage(sim, 300);
    const v = sim.state.voyage;
    expect(v.regionId).toBe('templadas');
    expect(v.regionDistance).toBe(v.regionLength);
    expect(v.nextChoices).toContain(FINAL_REGION);
    expect(sim.state.story!.course?.holdAt).toBeDefined();
    expect(sim.state.log.some((l) => /sin rumbo fijado/.test(l.text))).toBe(false); // dormido: aún no
    // Sobrevive a guardar y cargar.
    const loaded = reload(sim);
    expect(loaded.state.story!.course).toEqual(sim.state.story!.course);
    sim.state.player.sleeping = null;
    tickVoyage(sim, 1);
    expect(v.regionId).toBe('templadas');
    const note = sim.state.log.at(-1)!.text;
    expect(note).toMatch(/^Hemos llegado al final de Aguas Templadas sin rumbo fijado: seguimos en estas aguas para que decidas en el timón si tomamos el rumbo de la capitana hacia Puerto Esperanza\./);
    expect(sim.chooseRoute(FINAL_REGION).ok).toBe(true);
    tickVoyage(sim, 1);
    expect(v.regionId).toBe(FINAL_REGION);
    expect(sim.state.story!.course).toBeUndefined();
  });

  it('si despierto no decide en media hora, sigue el piloto (que nunca toma el rumbo de la capitana)', () => {
    const sim = captainSetup(23);
    sleep(sim);
    tickVoyage(sim, 300);
    sim.state.player.sleeping = null;
    tickVoyage(sim, voyage.CAPTAIN_DECIDE_MIN - 2);
    expect(sim.state.voyage.regionId).toBe('templadas');
    tickVoyage(sim, 3);
    expect(sim.state.voyage.regionId).not.toBe('templadas');
    expect(sim.state.voyage.regionId).not.toBe(FINAL_REGION);
  });

  it('despierto durante la ventana normal no hay espera ni aviso extra', () => {
    const sim = captainSetup(10);
    let minutes = 0;
    while (sim.state.voyage.regionId === 'templadas' && minutes < 200) {
      tickVoyage(sim, 1);
      minutes++;
    }
    expect(sim.state.voyage.regionId).not.toBe('templadas');
    expect(minutes).toBeLessThan(100); // 9 millas a 6 nudos
    expect(sim.state.log.some((l) => /sin rumbo fijado: seguimos en estas aguas/.test(l.text))).toBe(false);
  });

  it('con otro rumbo fijado no espera; y nunca más de CAPTAIN_HOLD_MAX_MIN', () => {
    const fixed = captainSetup(23);
    expect(fixed.chooseRoute('sargazos').ok).toBe(true);
    sleep(fixed);
    tickVoyage(fixed, 120);
    expect(fixed.state.voyage.regionId).toBe('sargazos');

    const sim = captainSetup(23);
    sleep(sim);
    tickVoyage(sim, 90 + voyage.CAPTAIN_HOLD_MAX_MIN + 5);
    expect(sim.state.voyage.regionId).not.toBe('templadas');
    expect(sim.state.voyage.regionId).not.toBe(FINAL_REGION);
  });
});

/* ------------------------------------------------------------------ */
/* Bocana y llegada                                                    */
/* ------------------------------------------------------------------ */

describe('llegada a Puerto Esperanza: hora, bocana y textos', () => {
  function harborSetup(hour: number, seed = 21): Simulation {
    const sim = quiet(setup(seed));
    const st = sim.state;
    st.time = at(9, hour);
    st.story!.pages = [1, 2, 3, 4, 5];
    st.story!.revealed = true;
    expect(sim.chooseRoute(FINAL_REGION).ok).toBe(true);
    st.voyage.regionDistance = st.voyage.regionLength - 0.2;
    return sim;
  }

  it('el texto de la llegada casa con la hora (y el segundo párrafo es siempre el mismo)', () => {
    const cases: [number, RegExp][] = [
      [6.2, /^Al amanecer, la luz verde deja de estar sola/],
      [10, /^A media mañana, bajo la torre de la luz verde/],
      [13, /^Con el sol en lo alto, bajo la torre de la luz verde/],
      [16, /^Por la tarde, bajo la torre de la luz verde/],
      [19, /^Al caer la tarde, bajo la torre de la luz verde se encienden/],
    ];
    for (const [h, re] of cases) {
      const [p1, p2, more] = arrivalText(h).split('\n\n');
      expect(p1, String(h)).toMatch(re);
      expect(p2).toMatch(/^Alguien grita el nombre de tu barco/);
      expect(more).toBeUndefined();
    }
    // Ningún texto dice que la luz verde «aparece» al amanecer: ya se veía desde lejos.
    expect(STORY_TEXTS.arrival).not.toMatch(/aparece la luz verde/);
  });

  it('a media mañana, el diario y la pantalla de llegada hablan de la media mañana', () => {
    const sim = harborSetup(11);
    run(sim, 5);
    expect(sim.state.voyage.regionId).toBe(FINAL_REGION);
    expect(sim.state.story!.arrived).toBe(true);
    expect(sim.state.log.some((l) => l.text.startsWith('¡Puerto Esperanza! A media mañana'))).toBe(true);
    expect(events.arrivalSummary(sim)!.paragraphs[0]).toMatch(/^A media mañana/);
    expect(voyage.isAnchored(sim)).toBe(false);
  });

  it('de noche, el barco fondea en la bocana (sin recorrer el puerto) y la llegada es al amanecer', () => {
    const sim = harborSetup(22);
    run(sim, 3);
    const v = sim.state.voyage;
    expect(v.regionId).toBe(FINAL_REGION);
    expect(sim.state.log.some((l) => l.text === 'Dejamos atrás Aguas Templadas siguiendo el rumbo de la capitana Duarte hacia Puerto Esperanza. La luz verde ya brilla muy cerca: fondeamos en la bocana hasta que amanezca.')).toBe(true);
    expect(sim.state.log.some((l) => /Al amanecer buscaremos la luz verde/.test(l.text))).toBe(false);
    expect(voyage.isAnchored(sim)).toBe(true);
    expect(v.anchorReason).toBe(voyage.HARBOR_WAIT_REASON);
    run(sim, Math.ceil(at(10, 6) - sim.state.time) - 1);
    expect(sim.state.story!.arrived).toBe(false);
    expect(v.regionDistance).toBeLessThan(0.5); // sigue en la bocana
    run(sim, 3);
    expect(sim.state.story!.arrived).toBe(true);
    expect(voyage.isAnchored(sim)).toBe(false);
    expect(sim.state.log.some((l) => l.text.startsWith('¡Puerto Esperanza! Al amanecer, la luz verde deja de estar sola'))).toBe(true);
    expect(sim.state.log.some((l) => /Levamos anclas/.test(l.text) && l.at >= at(10, 6))).toBe(false); // lo cuenta la llegada
  });

  it('de día pero con el jugador dormido, espera en la bocana hasta que despierta', () => {
    const sim = harborSetup(14);
    sleep(sim);
    for (let i = 0; i < 5; i++) {
      voyage.tickVoyage(sim, 1);
      sim.state.time += 1;
    }
    expect(sim.state.voyage.regionId).toBe(FINAL_REGION);
    expect(sim.state.log.some((l) => /fondeamos en la bocana hasta que despiertes\.$/.test(l.text))).toBe(true);
    for (let i = 0; i < 120; i++) {
      voyage.tickVoyage(sim, 1);
      sim.state.time += 1;
    }
    expect(voyage.isAnchored(sim)).toBe(true);
    sim.state.player.sleeping = null;
    voyage.tickVoyage(sim, 1);
    expect(voyage.isAnchored(sim)).toBe(false);
    events.tickEvents(sim, 1);
    expect(sim.state.story!.arrived).toBe(true);
  });
});

describe('«Volver a ver la llegada»: la pantalla repite la llegada tal como fue', () => {
  function arrive(): Simulation {
    const sim = quiet(setup(21));
    sim.state.time = at(9, 10);
    sim.state.voyage.regionId = FINAL_REGION;
    sim.state.voyage.distance = 512.4;
    sim.state.story!.pages = [1, 2, 3, 4, 5];
    sim.state.story!.revealed = true;
    events.tickEvents(sim, 1);
    expect(sim.state.story!.arrived).toBe(true);
    return sim;
  }

  it('días después, con millas, náufragos y estadísticas nuevas, el resumen es el mismo (salvo el mercado, que cerró)', () => {
    const sim = arrive();
    const s0 = events.arrivalSummary(sim)!;
    expect(s0.newcomers.length).toBe(2);
    expect(s0.miles).toBe(512);
    expect(s0.marketEventId).not.toBeNull();
    const st = sim.state;
    st.time += 3 * MINUTES_PER_DAY;
    st.voyage.distance += 367;
    st.player.stats.debrisCollected += 40;
    st.player.stats.fishCaught += 12;
    st.player.stats.itemsCrafted += 7;
    expect(spawnSurvivor(sim, { name: 'Ezequiel' })).not.toBeNull();
    events.tickEvents(sim, 1); // cierra el mercado del muelle
    const s1 = events.arrivalSummary(sim)!;
    expect(s1).toEqual({ ...s0, marketEventId: null });
    expect(s1.crew).not.toContain('Ezequiel');
    expect(s1.newcomers).toEqual(s0.newcomers); // aunque el mercado (donde se apuntaban) ya cerró
    // Y tras guardar y cargar.
    expect(events.arrivalSummary(reload(sim))).toEqual(s1);
  });

  it('una partida que llegó antes de la instantánea usa los datos actuales; una instantánea rota se quita', () => {
    const sim = arrive();
    delete sim.state.story!.arrival;
    sim.state.voyage.distance = 900;
    expect(events.arrivalSummary(sim)!.miles).toBe(900);
    const raw = JSON.parse(serialize(arrive().state)) as Record<string, unknown>;
    const state = ((raw['state'] as Record<string, unknown> | undefined) ?? raw) as Record<string, Record<string, unknown>>;
    (state['story']!['arrival'] as Record<string, unknown>)['crew'] = 'Marina';
    expect(deserialize(JSON.stringify(raw)).story!.arrival).toBeUndefined();
  });
});

describe('epílogo y radio: no prometen quedarse ni volver', () => {
  it('el epílogo habla de cruzar el fondeadero y seguir navegando, no de quedarse', () => {
    expect(STORY_TEXTS.epilogue).not.toMatch(/Puedes quedarte/);
    expect(STORY_TEXTS.epilogue).toMatch(/Mientras crucéis el fondeadero podréis comerciar en el muelle/);
    expect(STORY_TEXTS.epilogue).toMatch(/seguir navegando/);
  });

  it('tras la llegada, la radio no dice que el muelle sigue abierto; lejos del puerto, se despide', () => {
    const sim = quiet(setup(9));
    sim.state.story = { pages: [1, 2, 3, 4, 5], revealed: true, arrived: true };
    sim.state.voyage.regionId = 'templadas';
    const said = new Set<string>();
    for (let i = 0; i < 200; i++) {
      sim.state.time += 480;
      said.add(events.radioMessage(sim));
    }
    expect([...said].some((t) => /muelle sigue abierto/.test(t))).toBe(false);
    expect([...said].some((t) => /^Radio: desde Puerto Esperanza os desean buen viento/.test(t))).toBe(true);
    // En el propio puerto, ninguna despedida.
    sim.state.voyage.regionId = FINAL_REGION;
    for (let i = 0; i < 100; i++) {
      sim.state.time += 480;
      expect(events.radioMessage(sim)).not.toMatch(/os desean buen viento/);
    }
  });
});

describe('nombres de los habitantes', () => {
  it('ninguno es de alguien del cuaderno del Albatros (Joaquín muere en la pág. 5)', () => {
    expect(NPC_NAMES).not.toContain('Joaquín');
    const story = STORY_PAGES.map((p) => `${p.title} ${p.text}`).join(' ');
    for (const name of NPC_NAMES) expect(new RegExp(`\\b${name}\\b`, 'u').test(story), name).toBe(false);
    expect(new Set(NPC_NAMES).size).toBe(NPC_NAMES.length);
    expect(isFemaleNpc({ name: 'Gonzalo' })).toBe(false);
  });

  it('los vecinos del puerto nunca se llaman Joaquín', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const sim = quiet(setup(seed));
      sim.state.time = at(9, 10);
      sim.state.voyage.regionId = FINAL_REGION;
      sim.state.story!.pages = [1, 2, 3, 4, 5];
      sim.state.story!.revealed = true;
      events.tickEvents(sim, 1);
      expect(sim.state.npcs.map((n) => n.name)).not.toContain('Joaquín');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Radio                                                               */
/* ------------------------------------------------------------------ */

describe('radio: lo que anuncia lo cumple el próximo mercante', () => {
  const plainOffers = TRADE_OFFERS.map((_, i) => i).filter((i) => Object.keys(TRADE_OFFERS[i]!.get).every((id) => !ITEMS[id]?.unlocks));
  const same = (a: Record<string, number>, b: Record<string, number>) => JSON.stringify(a) === JSON.stringify(b);

  it('el rumor no caduca: el próximo mercante lo trae aunque tarde una semana', () => {
    const sim = quiet(setup(8));
    let msg = '';
    for (let i = 0; i < 60 && !/mercante anuncia/.test(msg); i++) msg = events.radioMessage(sim);
    expect(msg).toMatch(/^Radio: un mercante anuncia que, por estas aguas, cambia .+ por .+\. El próximo que veamos lo traerá\.$/);
    const rumoured = events.rumouredOffers(sim);
    expect(rumoured.length).toBe(1);
    sim.state.time += 7 * MINUTES_PER_DAY;
    expect(events.rumouredOffers(sim)).toEqual(rumoured);
    const ev = events.startEvent(sim, 'mercante')!;
    const o = TRADE_OFFERS[rumoured[0]!]!;
    expect(events.tradeOffers(sim, ev.id).some((x) => same(x.get, o.get) && same(x.give, o.give))).toBe(true);
    expect(events.rumouredOffers(sim)).toEqual([]);
  });

  it('como mucho dos rumores a la vez, y el mercante trae los dos y además la hoja del cuaderno', () => {
    const sim = quiet(setup(8));
    for (let i = 0; i < 300; i++) {
      events.radioMessage(sim);
      expect(events.rumouredOffers(sim).length).toBeLessThanOrEqual(events.RADIO_MAX_RUMOURS);
    }
    let checked = 0;
    for (let seed = 70; seed < 130 && checked < 3; seed++) {
      const s = pageSetup(2, 'templadas', at(6, 10), seed);
      const [a, b] = plainOffers;
      s.state.events.cooldowns[`oferta:${a}`] = s.state.time - 3 * MINUTES_PER_DAY;
      s.state.events.cooldowns[`oferta:${b}`] = s.state.time - MINUTES_PER_DAY;
      const ev = events.startEvent(s, 'mercante')!;
      const offers = events.tradeOffers(s, ev.id);
      if (!offers.some((o) => o.get['pagina_2'])) continue;
      checked++;
      for (const i of [a!, b!]) expect(offers.some((x) => same(x.get, TRADE_OFFERS[i]!.get) && same(x.give, TRADE_OFFERS[i]!.give))).toBe(true);
      expect(offers.length).toBe(4);
    }
    expect(checked).toBe(3);
  });
});

describe('radio: la charla no repite la misma frase en días', () => {
  it('en tres días de mensajes (uno cada 6–12 h) ninguna frase de charla se repite', () => {
    for (const seed of [1, 4, 11]) {
      const sim = quiet(setup(seed));
      const heard: { at: number; key: string }[] = [];
      for (let i = 0; i < 40; i++) {
        sim.state.time += 360 + ((i * 97) % 360);
        const text = events.radioMessage(sim);
        if (/mercante anuncia|cuaderno del Albatros|luz verde|Puerto Esperanza/.test(text)) continue;
        const key = text.replace(/«[^»]*»/g, '«»');
        for (const h of heard) {
          if (h.key === key) expect(sim.state.time - h.at, `${seed}: ${key}`).toBeGreaterThanOrEqual(events.RADIO_REPEAT_MIN);
        }
        heard.push({ at: sim.state.time, key });
      }
      expect(heard.length).toBeGreaterThan(10);
    }
  });

  it('si ya se han oído todas, repite la que más tiempo lleva sin oírse (nunca la última)', () => {
    const sim = quiet(setup(3));
    let last = '';
    for (let i = 0; i < 60; i++) {
      sim.state.time += 30; // muy seguidas: se agotan las frases
      const text = events.radioMessage(sim).replace(/«[^»]*»/g, '«»');
      if (/mercante anuncia|cuaderno del Albatros/.test(text)) continue;
      expect(text).not.toBe(last);
      last = text;
    }
  });
});

/* ------------------------------------------------------------------ */
/* Clima: guardar y cargar no hace saltar la temperatura               */
/* ------------------------------------------------------------------ */

describe('clima: la transición entre regiones sobrevive a guardar y cargar', () => {
  function weatherRun(sim: Simulation, minutes: number): void {
    for (let i = 0; i < minutes; i++) {
      weather.tickWeather(sim, 1);
      sim.state.time += 1;
    }
  }

  it('de la Corriente Boreal a Puerto Esperanza: 5 min después de entrar, cargar no salta a 25 °C', () => {
    const sim = quiet(setup(4));
    sim.state.time = at(5, 12);
    sim.state.voyage.regionId = 'boreal';
    weatherRun(sim, 200);
    sim.state.voyage.regionId = FINAL_REGION;
    weatherRun(sim, 5);
    const loaded = reload(sim);
    weatherRun(sim, 1);
    weatherRun(loaded, 1);
    expect(Math.abs(loaded.state.weather.temperature - sim.state.weather.temperature)).toBeLessThan(0.01);
    expect(loaded.state.weather.temperature).toBeLessThan(REGIONS[FINAL_REGION]!.baseTemp - 5);
  });

  it('una partida cargada a mitad de camino sigue igual que sin cargar (temperatura, viento y barómetro)', () => {
    const a = setup(6);
    const b = setup(6);
    for (const s of [a, b]) {
      s.state.time = at(3, 8);
      s.state.voyage.regionId = 'boreal';
    }
    weatherRun(a, 300);
    weatherRun(b, 300);
    for (const s of [a, b]) s.state.voyage.regionId = 'tormentas';
    weatherRun(a, 20);
    weatherRun(b, 20);
    const c = reload(b);
    for (let i = 0; i < 900; i++) {
      weatherRun(a, 1);
      weatherRun(c, 1);
      expect(c.state.weather, `minuto ${i}`).toEqual(a.state.weather);
    }
    expect(c.rng.state).toBe(a.rng.state);
  });

  it('el aviso del barómetro no se repite al cargar', () => {
    const sim = quiet(setup(7));
    const w = sim.state.weather;
    w.next = 'tormenta';
    w.remaining = 50;
    weatherRun(sim, 1);
    const warn = (s: Simulation) => s.state.log.filter((l) => /barómetro cae en picado|frente de tormenta/.test(l.text)).length;
    expect(warn(sim)).toBe(1);
    const loaded = reload(sim);
    weatherRun(loaded, 5);
    expect(warn(loaded)).toBe(1);
  });

  it('una partida sin estos datos los reconstruye; los que no son válidos se quitan', () => {
    const sim = setup(2);
    weatherRun(sim, 10);
    const raw = JSON.parse(serialize(sim.state)) as Record<string, unknown>;
    const state = ((raw['state'] as Record<string, unknown> | undefined) ?? raw) as Record<string, Record<string, unknown>>;
    state['weather']!['baseTemp'] = 'templado';
    state['weather']!['stormWarned'] = 3;
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded.weather.baseTemp).toBeUndefined();
    expect(loaded.weather.stormWarned).toBeUndefined();
    const s = new Simulation(loaded);
    weather.tickWeather(s, 1);
    expect(s.state.weather.baseTemp).toBe(REGIONS[s.state.voyage.regionId]!.baseTemp);
  });
});

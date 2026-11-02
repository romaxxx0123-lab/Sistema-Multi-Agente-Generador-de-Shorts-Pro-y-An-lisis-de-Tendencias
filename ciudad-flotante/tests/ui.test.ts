/**
 * Tests de la interfaz (área ui): iconos SVG, formato de textos, datos derivados para los paneles
 * y reconciliación del DOM virtual (con un mini-DOM, sin navegador). Lo visual y la interacción
 * real con ratón y teclado se prueban en el navegador con scripts/shot.mjs.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ITEM_IDS, ITEMS } from '../src/data/items';
import { MODULE_LIST } from '../src/data/modules';
import { RECIPE_LIST } from '../src/data/recipes';
import { REGION_LIST } from '../src/data/regions';
import { EVENT_TYPES } from '../src/sim/events';
import { addItem, countItem, createInventory, moveStack } from '../src/sim/inventory';
import { createNewGame } from '../src/sim/newGame';
import type { SaveSlotInfo } from '../src/sim/save';
import { Simulation } from '../src/sim/Simulation';
import type { ActiveEvent } from '../src/sim/types';
import { WEATHER_KINDS } from '../src/sim/weather';
import { parseRef, refKey } from '../src/ui/env';
import { agoText, dayClock, duration, num, signed, stacksText } from '../src/ui/fmt';
import { EVENT_GLYPH, glyph, GLYPH_NAMES, hasGlyph, hasItemIcon, itemIcon, MODULE_GLYPH, shade, WEATHER_GLYPH } from '../src/ui/icons';
import {
  bedSummary,
  CHART_POS,
  foodSummary,
  ingredientRows,
  itemEffects,
  latestPlayableSave,
  moduleIssues,
  recipeRows,
  sortedEvents,
  sortedSaves,
  sortInventory,
  useVerb,
} from '../src/ui/model';
import { h, patch, type VNode } from '../src/ui/vdom';
import { richKeys } from '../src/ui/widgets';
import type { UiEnv } from '../src/ui/env';
import { MAX_TOASTS, pushToast, toastShape, type ToastEntry } from '../src/ui/hud';
import { wieldFromSlot } from '../src/ui/panels/inventory';
import { addFuel, demolishLossNote, FUEL_BATCH, stationTutorial } from '../src/ui/panels/station';
import { clickMode, modeQty, playerSlotFor, quickMove, storeAll, takeAllFrom } from '../src/ui/panels/transfer';
import { HOTBAR_SLOTS } from '../src/sim/constants';
import type { InvRef } from '../src/sim/Simulation';
import { STORY_PAGES } from '../src/data/story';
import { DEFAULT_SETTINGS } from '../src/game/types';
import { storyStatus } from '../src/sim/actions';
import { startEvent } from '../src/sim/events';
import { checkPlacement, instantiateModule } from '../src/sim/ship';
import type { ModuleInstance } from '../src/sim/types';
import { CAPTAIN_COURSE_LABEL } from '../src/sim/voyage';
import { SIGHTING_GLYPH } from '../src/ui/icons';
import { Menus } from '../src/ui/menus';
import { CATEGORY_NAMES, moduleSubtitle, radioMessages, upgradeEffectsText } from '../src/ui/model';
import { finalRegionOnChart, renderHelm } from '../src/ui/panels/helm';
import { renderInventory } from '../src/ui/panels/inventory';
import { relationTone, renderNpc } from '../src/ui/panels/npc';
import { renderStation, upgradeLine } from '../src/ui/panels/station';
import { arrivalStats, arrivalView, defaultPage, listNames, newPages, PageReader, paragraphs, readingSeconds } from '../src/ui/story';

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

function newSim(seed = 7): Simulation {
  return new Simulation(createNewGame(seed));
}

/** Comprueba que las etiquetas de un SVG están bien anidadas y cerradas. */
function wellFormed(svg: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z]+)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const [, close, tag, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag!);
  }
  return stack.length === 0;
}

/* ------------------------------------------------------------------ */
/* Iconos                                                              */
/* ------------------------------------------------------------------ */

describe('iconos', () => {
  it('cada objeto tiene un dibujo propio, bien formado y distinto de los demás', () => {
    const seen = new Map<string, string>();
    for (const id of ITEM_IDS) {
      expect(hasItemIcon(id), `falta el icono de ${id}`).toBe(true);
      const svg = itemIcon(id);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 48 48"');
      expect(wellFormed(svg), `SVG mal formado: ${id}`).toBe(true);
      expect(svg).not.toMatch(/NaN|undefined/);
      expect(seen.has(svg), `${id} repite el icono de ${seen.get(svg)}`).toBe(false);
      seen.set(svg, id);
    }
  });

  it('los planos comparten silueta pero cada uno tiene su emblema', () => {
    const planos = ITEM_IDS.filter((id) => ITEMS[id]!.category === 'plano');
    expect(planos.length).toBeGreaterThan(5);
    const bodies = new Set(planos.map((id) => itemIcon(id)));
    expect(bodies.size).toBe(planos.length);
  });

  it('un objeto desconocido no rompe la interfaz', () => {
    const svg = itemIcon('objeto_que_no_existe');
    expect(wellFormed(svg)).toBe(true);
    expect(svg).toContain('<text');
  });

  it('glifos: todos bien formados y cubren módulos, eventos y climas', () => {
    for (const name of GLYPH_NAMES) {
      const svg = glyph(name);
      expect(wellFormed(svg), `glifo mal formado: ${name}`).toBe(true);
      expect(svg).toContain('viewBox="0 0 24 24"');
    }
    for (const m of MODULE_LIST) expect(hasGlyph(MODULE_GLYPH[m.id] ?? ''), `módulo sin glifo: ${m.id}`).toBe(true);
    for (const t of EVENT_TYPES) expect(hasGlyph(EVENT_GLYPH[t] ?? ''), `evento sin glifo: ${t}`).toBe(true);
    for (const w of WEATHER_KINDS) expect(hasGlyph(WEATHER_GLYPH[w] ?? ''), `clima sin glifo: ${w}`).toBe(true);
    // Glifos usados directamente por el HUD y los paneles.
    for (const g of ['hunger', 'thirst', 'energy', 'health', 'warmth', 'moon', 'sun', 'compass', 'anchor', 'helm', 'bag', 'book', 'ship', 'hammer', 'pot', 'hand', 'skull']) {
      expect(hasGlyph(g), g).toBe(true);
    }
  });

  it('shade aclara y oscurece sin salirse de rango', () => {
    expect(shade('#808080', 0.5)).toBe('#404040');
    expect(shade('#808080', 2)).toBe('#ffffff');
    expect(shade('#000000', 1.5)).toBe('#808080');
  });
});

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

describe('formato de textos', () => {
  it('reloj, duraciones y tiempo relativo', () => {
    expect(dayClock(7 * 60)).toBe('Día 1 · 07:00');
    expect(dayClock(1440 * 2 + 13 * 60 + 5)).toBe('Día 3 · 13:05');
    expect(duration(45)).toBe('45 min');
    expect(duration(90)).toBe('1 h 30 min');
    expect(duration(120)).toBe('2 h');
    expect(duration(-5)).toBe('0 min');
    expect(duration(Number.POSITIVE_INFINITY)).toBe('—');
    expect(agoText(100, 100.5)).toBe('ahora');
    expect(agoText(100, 130)).toBe('hace 30 min');
    expect(agoText(0, 1440 + 60 * 9)).toBe('ayer 00:00');
  });

  it('números en español', () => {
    expect(num(2)).toBe('2');
    expect(num(2.46)).toBe('2,5');
    expect(num(Number.NaN)).toBe('—');
    expect(signed(3)).toBe('+3');
    expect(signed(-2.25, 1)).toBe('−2,3');
    expect(signed(0)).toBe('0');
    expect(stacksText({ madera: 3, cuerda: 1 })).toBe('3× Madera, 1× Cuerda');
  });

  it('referencias de inventario ida y vuelta', () => {
    for (const ref of [{ kind: 'player' as const }, { kind: 'crate' as const, id: 12 }, { kind: 'module' as const, id: 4, slot: 'fuel' as const }, { kind: 'module' as const, id: 9, slot: 'inventory' as const }]) {
      expect(parseRef(refKey(ref))).toEqual(ref);
    }
    expect(parseRef('module:3:otra')).toBeNull();
    expect(parseRef(null)).toBeNull();
  });

  it('las teclas se resaltan en los consejos sin confundir preposiciones', () => {
    const keys = (t: string): string[] =>
      richKeys(t)
        .filter((x): x is VNode => typeof x === 'object' && x !== null && !Array.isArray(x))
        .map((x) => String(x.children[0]));
    expect(keys('WASD para moverte, Mayús para correr, Espacio para saltar.')).toEqual(['WASD', 'Mayús', 'Espacio']);
    expect(keys('Selecciona el gancho (1) y haz clic.')).toEqual(['1', 'Clic']);
    // Las acciones del ratón también se muestran como teclas (el consejo enseña el gesto, no un menú).
    expect(keys('Elige la comida en la barra rápida y pulsa F o clic derecho.')).toEqual(['F', 'Clic der.']);
    expect(keys('F1 oculta los consejos; Ctrl+clic coge una.')).toEqual(['F1', 'Ctrl', 'Clic']);
    expect(keys('Un clicado no es un clic')).toEqual(['Clic']);
    expect(keys('Pulsa B para el modo construcción')).toEqual(['B']);
    expect(keys('Guarda lo que no necesites (E sobre las estanterías).')).toEqual(['E']);
    expect(keys('A cielo abierto crecen mejor. Y de noche, menos.')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Datos derivados                                                     */
/* ------------------------------------------------------------------ */

describe('datos para los paneles', () => {
  it('despensa: cuenta la comida de almacenes, despensa e inventario', () => {
    const sim = newSim();
    const f = foodSummary(sim);
    const ids = Object.fromEntries(f.items.map((i) => [i.id, i.qty]));
    // Partida nueva: 4 latas en el almacén + 2 en el inventario; 2 pescados y 2 hortalizas en la cocina.
    expect(ids['conserva']).toBe(6);
    expect(ids['pescado_crudo']).toBe(2);
    expect(ids['hortaliza']).toBe(2);
    expect(f.crew).toBe(3);
    expect(f.hungerPoints).toBe(6 * 35 + 2 * 12 + 2 * 12);
    expect(f.days).toBeGreaterThan(0);
    expect(f.days).toBeLessThan(5);
  });

  it('camas: totales, ocupadas y habitantes sin cama', () => {
    const sim = newSim();
    const b = bedSummary(sim);
    expect(b.total).toBe(5);
    expect(b.assigned).toBe(3);
    expect(b.homeless).toEqual([]);
    sim.state.npcs[0]!.bed = null;
    expect(bedSummary(sim).homeless).toEqual([sim.state.npcs[0]!.name]);
  });

  it('módulos con problemas, de más a menos grave', () => {
    const sim = newSim();
    expect(moduleIssues(sim)).toEqual([]);
    const dep = sim.state.ship.modules.find((m) => m.type === 'deposito')!;
    const coc = sim.state.ship.modules.find((m) => m.type === 'cocina')!;
    dep.leak = true;
    coc.fire = 40;
    const issues = moduleIssues(sim);
    expect(issues[0]!.kind).toBe('fire');
    expect(issues[0]!.severity).toBe('danger');
    expect(issues.some((i) => i.kind === 'leak' && i.module === dep)).toBe(true);
  });

  it('recetas: bloqueadas con el plano que falta, ingredientes tengo/necesito', () => {
    const sim = newSim();
    const taller = recipeRows(sim, 'taller');
    expect(taller.length).toBe(RECIPE_LIST.filter((r) => r.station === 'taller').length);
    expect(taller.every((r) => r.locked && /^Necesitas el Plano: /.test(r.reason ?? ''))).toBe(true);
    expect(taller.find((r) => r.recipe.id === 'pieza_mecanica')!.reason).toContain('Taller mecánico');
    expect(taller.find((r) => r.recipe.id === 'celula_solar')!.reason).toContain('Paneles solares');
    const banco = recipeRows(sim, 'banco');
    const cana = banco.find((r) => r.recipe.id === 'cana')!;
    // 24 madera en el almacén y 6 cuerdas: la caña se puede pagar con los almacenes.
    expect(cana.affordable).toBe(true);
    const rows = ingredientRows(sim, { madera: 2, cuerda: 2 });
    expect(rows.find((r) => r.id === 'madera')).toMatchObject({ need: 2, carried: 0, have: 24 });
    addItem(sim.state.player.inventory, 'madera', 3);
    expect(ingredientRows(sim, { madera: 2 })[0]).toMatchObject({ carried: 3, have: 27 });
  });

  it('efectos y verbo de uso de los objetos', () => {
    const fx = itemEffects(ITEMS['pescado_crudo']!);
    expect(fx.find((e) => e.label === 'Hambre')).toMatchObject({ value: '+12', tone: 'good' });
    expect(fx.find((e) => e.label === 'Riesgo de enfermar')).toMatchObject({ value: '30 %', tone: 'bad' });
    const salt = itemEffects(ITEMS['cubo_agua']!);
    expect(salt.find((e) => e.label === 'Sed')).toMatchObject({ value: '−8', tone: 'bad' });
    expect(itemEffects(ITEMS['plano_taller']!, ['taller'])[0]!.label).toBe('Plano ya aprendido');
    expect(useVerb(ITEMS['agua_potable']!, 10)).toBe('Beber');
    expect(useVerb(ITEMS['abrigo']!, 10)).toBe('Ponérselo');
    expect(useVerb(ITEMS['gancho']!, 2)).toBe('Empuñar');
    // Desde la mochila también: el inventario la pasa a la barra rápida y la selecciona.
    expect(useVerb(ITEMS['gancho']!, 12)).toBe('Empuñar');
    expect(useVerb(ITEMS['madera']!, 0)).toBeNull();
  });

  it('eventos ordenados por urgencia', () => {
    const ev = (id: number, type: string): ActiveEvent => ({ id, type, title: type, description: '', startedAt: id, endsAt: null, stage: 0, objectives: [], choices: [], data: {} });
    const sorted = sortedEvents([ev(1, 'mercante'), ev(2, 'incendio'), ev(3, 'naufragio'), ev(4, 'tormenta')]);
    expect(sorted.map((e) => e.type)).toEqual(['incendio', 'tormenta', 'naufragio', 'mercante']);
  });

  it('guardados: del más reciente al más antiguo; Continuar salta los dañados y los de muerte', () => {
    const s = (slot: string, savedAt: number, extra: Partial<SaveSlotInfo> = {}): SaveSlotInfo => ({ slot, day: 1, time: 0, savedAt, region: 'X', label: slot, ...extra });
    const list = [s('a', 10), s('b', 30, { corrupt: true }), s('c', 20, { alive: false }), s('d', 5)];
    expect(sortedSaves(list).map((x) => x.slot)).toEqual(['b', 'c', 'a', 'd']);
    expect(latestPlayableSave(list)?.slot).toBe('a');
    expect(latestPlayableSave([])).toBeNull();
  });

  it('ordenar la mochila junta pilas, ordena por tipo y no pierde nada', () => {
    const inv = createInventory(12);
    inv.slots[0] = { id: 'gancho', qty: 1 }; // fuera del rango: no se toca
    inv.slots[3] = { id: 'madera', qty: 20 };
    inv.slots[5] = { id: 'conserva', qty: 2 };
    inv.slots[7] = { id: 'madera', qty: 15 };
    inv.slots[8] = { id: 'martillo', qty: 1 };
    inv.slots[10] = { id: 'conserva', qty: 3 };
    const before = { madera: countItem(inv, 'madera'), conserva: countItem(inv, 'conserva') };
    const moves = sortInventory(inv, 2, 12, (a, b) => moveStack(inv, a, inv, b));
    expect(moves).toBeGreaterThan(0);
    expect(inv.slots[0]).toEqual({ id: 'gancho', qty: 1 });
    expect(inv.slots.slice(2, 5).map((s) => s?.id)).toEqual(['martillo', 'conserva', 'madera']);
    expect(inv.slots[3]!.qty).toBe(5); // las dos latas juntas
    expect(inv.slots[4]!.qty).toBe(35); // la madera junta (límite 50)
    expect(inv.slots.slice(5).every((s) => !s)).toBe(true);
    expect({ madera: countItem(inv, 'madera'), conserva: countItem(inv, 'conserva') }).toEqual(before);
    // Ya ordenado: no hace nada.
    expect(sortInventory(inv, 2, 12, (a, b) => moveStack(inv, a, inv, b))).toBe(0);
  });

  it('la carta náutica sitúa todas las regiones dentro del dibujo', () => {
    for (const r of REGION_LIST) {
      const p = CHART_POS[r.id];
      expect(p, r.id).toBeDefined();
      expect(p!.x).toBeGreaterThan(30);
      expect(p!.x).toBeLessThan(330);
      expect(p!.y).toBeGreaterThan(20);
      expect(p!.y).toBeLessThan(190);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Paneles: mover pilas, combustible, guardar, empuñar y avisos        */
/* ------------------------------------------------------------------ */

/** Entorno de interfaz mínimo (sin DOM) sobre una simulación real: registra los avisos. */
function fakeEnv(sim: Simulation): { env: UiEnv; toasts: { text: string; kind: string }[] } {
  const toasts: { text: string; kind: string }[] = [];
  const env = {
    ctx: { sim, bus: sim.bus, settings: { tutorial: true } },
    tip: { hide: () => {}, show: () => {} },
    drag: { begin: () => {}, swallowClick: false, active: false },
    ps: {},
    hover: null,
    toast: (text: string, kind = 'info') => toasts.push({ text, kind }),
    act: (res: { ok: boolean; msg?: string } | null | undefined, okKind = 'good') => {
      if (res?.msg) toasts.push({ text: res.msg, kind: res.ok ? okKind : 'warn' });
      return !!res?.ok;
    },
    open: () => {},
    close: () => {},
    refresh: () => {},
  };
  return { env: env as unknown as UiEnv, toasts };
}

function mod(sim: Simulation, type: string) {
  return sim.state.ship.modules.find((m) => m.type === type)!;
}

const PLAYER: InvRef = { kind: 'player' };

describe('paneles: pilas, combustible, guardar y avisos', () => {
  it('esquema de clics: clic = pila, clic derecho = la mitad, Ctrl = una, Mayús = todo lo de ese tipo', () => {
    expect(clickMode({})).toBe('stack');
    expect(clickMode({ ctrlKey: true })).toBe('one');
    expect(clickMode({ metaKey: true })).toBe('one');
    expect(clickMode({ shiftKey: true, ctrlKey: true })).toBe('all');
    expect(modeQty('stack', 24)).toBeUndefined();
    expect(modeQty('half', 24)).toBe(12);
    expect(modeQty('half', 5)).toBe(3);
    expect(modeQty('one', 24)).toBe(1);
    // De una sola unidad, la mitad o una es la pila entera.
    expect(modeQty('half', 1)).toBeUndefined();
    expect(modeQty('one', 1)).toBeUndefined();
  });

  it('[18] coger del almacén la mitad o una unidad no se lleva la pila entera', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const alm = mod(sim, 'almacen');
    const ref: InvRef = { kind: 'module', id: alm.id, slot: 'inventory' };
    const i = alm.inventory!.slots.findIndex((x) => x?.id === 'madera');
    expect(alm.inventory!.slots[i]!.qty).toBe(24);
    quickMove(env, ref, i, PLAYER, 'half');
    expect(countItem(sim.state.player.inventory, 'madera')).toBe(12);
    expect(countItem(alm.inventory!, 'madera')).toBe(12);
    quickMove(env, ref, i, PLAYER, 'one');
    expect(countItem(sim.state.player.inventory, 'madera')).toBe(13);
    expect(countItem(alm.inventory!, 'madera')).toBe(11);
    // Los materiales van a la mochila, no a la barra rápida.
    const pinv = sim.state.player.inventory;
    expect(pinv.slots.slice(0, HOTBAR_SLOTS).some((x) => x?.id === 'madera')).toBe(false);
    // Y de vuelta: guardar una unidad desde tu inventario.
    const j = pinv.slots.findIndex((x) => x?.id === 'madera');
    quickMove(env, PLAYER, j, ref, 'one');
    expect(countItem(pinv, 'madera')).toBe(12);
    expect(countItem(alm.inventory!, 'madera')).toBe(12);
    // Clic normal: la pila entera.
    quickMove(env, PLAYER, j, ref, 'stack');
    expect(countItem(pinv, 'madera')).toBe(0);
    expect(countItem(alm.inventory!, 'madera')).toBe(24);
  });

  it('[18] «Echar madera» echa 1 (40 min); Mayús o ×5 echa 5; nunca la pila entera', () => {
    const sim = newSim();
    const { env, toasts } = fakeEnv(sim);
    const coc = mod(sim, 'cocina');
    const pinv = sim.state.player.inventory;
    addItem(pinv, 'madera', 22);
    const fuel0 = countItem(coc.fuelInv!, 'madera');
    expect(addFuel(env, coc, 'madera', 1)).toBe(1);
    expect(countItem(coc.fuelInv!, 'madera')).toBe(fuel0 + 1);
    expect(countItem(pinv, 'madera')).toBe(21);
    expect(toasts.at(-1)!.text).toBe('Echas 1× Madera al fogón');
    expect(addFuel(env, coc, 'madera', FUEL_BATCH)).toBe(5);
    expect(countItem(coc.fuelInv!, 'madera')).toBe(fuel0 + 6);
    expect(countItem(pinv, 'madera')).toBe(16);
    // Con varias pilas pequeñas, toma de varias sin pasarse.
    sim.state.player.inventory.slots.fill(null);
    pinv.slots[10] = { id: 'madera', qty: 2 };
    pinv.slots[12] = { id: 'madera', qty: 2 };
    expect(addFuel(env, coc, 'madera', 3)).toBe(3);
    expect(countItem(pinv, 'madera')).toBe(1);
    // Sin madera encima: aviso, nada se mueve.
    expect(addFuel(env, coc, 'combustible', 1)).toBe(0);
    expect(toasts.at(-1)!.kind).toBe('warn');
  });

  it('[17] «Guardar todo» guarda la mochila; con la barra, todo menos las herramientas', () => {
    const sim = newSim();
    const { env, toasts } = fakeEnv(sim);
    const alm = mod(sim, 'almacen');
    const ref: InvRef = { kind: 'module', id: alm.id, slot: 'inventory' };
    const pinv = sim.state.player.inventory;
    // La partida nueva lleva la hoja 1 del cuaderno en la mochila: este caso es el de la mochila vacía.
    expect(pinv.slots[8]?.id).toBe('pagina_1');
    pinv.slots[8] = null;
    // Lo de la QA: materiales en la barra rápida y la mochila vacía.
    pinv.slots[5] = { id: 'madera', qty: 4 };
    pinv.slots[6] = { id: 'tela', qty: 2 };
    pinv.slots[7] = { id: 'tornillos', qty: 2 };
    storeAll(env, ref);
    expect(toasts.at(-1)!.text).toMatch(/Mayús\+clic o «Guardar también la barra»/);
    expect(countItem(pinv, 'madera')).toBe(4);
    storeAll(env, ref, true);
    expect(pinv.slots.slice(0, HOTBAR_SLOTS).map((x) => x?.id ?? null)).toEqual(['gancho', 'martillo', 'cubo', null, null, null, null, null]);
    expect(countItem(alm.inventory!, 'tela')).toBe(6);
    expect(countItem(alm.inventory!, 'conserva')).toBe(6);
    // La mochila también se guarda.
    pinv.slots[15] = { id: 'chatarra', qty: 3 };
    storeAll(env, ref);
    expect(pinv.slots[15]).toBeNull();
    expect(toasts.at(-1)!.text).toBe('Guardas todo lo de la mochila');
  });

  it('[17] una herramienta de la bandeja va a la barra rápida aunque esté llena de materiales', () => {
    const sim = newSim();
    const { env, toasts } = fakeEnv(sim);
    const banco = mod(sim, 'banco_trabajo');
    const tray: InvRef = { kind: 'module', id: banco.id, slot: 'inventory' };
    const pinv = sim.state.player.inventory;
    pinv.slots[5] = { id: 'madera', qty: 4 };
    pinv.slots[6] = { id: 'tela', qty: 2 };
    pinv.slots[7] = { id: 'tornillos', qty: 2 };
    banco.inventory!.slots[0] = { id: 'cana', qty: 1 };
    expect(playerSlotFor(pinv, 'cana')).toBeGreaterThanOrEqual(HOTBAR_SLOTS);
    quickMove(env, tray, 0, PLAYER, 'stack');
    const k = pinv.slots.findIndex((x) => x?.id === 'cana');
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThan(HOTBAR_SLOTS);
    // Cede el sitio un material (nunca una herramienta) y no se pierde nada.
    expect(['gancho', 'martillo', 'cubo'].every((id) => pinv.slots.slice(0, HOTBAR_SLOTS).some((x) => x?.id === id))).toBe(true);
    expect(countItem(pinv, 'madera') + countItem(pinv, 'tela') + countItem(pinv, 'tornillos')).toBe(8);
    expect(toasts.at(-1)!.text).toMatch(new RegExp(`^Caña de pescar en la barra rápida \\(tecla ${k + 1}\\)\\. A la mochila: `));
    // Con hueco libre en la barra, va directa al hueco.
    const sim2 = newSim();
    const e2 = fakeEnv(sim2).env;
    const b2 = mod(sim2, 'banco_trabajo');
    b2.inventory!.slots[0] = { id: 'llave_inglesa', qty: 1 };
    quickMove(e2, { kind: 'module', id: b2.id, slot: 'inventory' }, 0, PLAYER, 'stack');
    expect(sim2.state.player.inventory.slots[5]?.id).toBe('llave_inglesa');
  });

  it('«Tomar todo» coloca herramientas y comida en la barra y los materiales en la mochila', () => {
    const sim = newSim();
    const { env, toasts } = fakeEnv(sim);
    const alm = mod(sim, 'almacen');
    const ref: InvRef = { kind: 'module', id: alm.id, slot: 'inventory' };
    takeAllFrom(env, ref);
    expect(toasts.at(-1)!.text).toBe('Lo coges todo');
    const pinv = sim.state.player.inventory;
    const hot = pinv.slots.slice(0, HOTBAR_SLOTS).map((x) => x?.id);
    expect(hot).not.toContain('madera');
    expect(hot).not.toContain('chatarra');
    expect(countItem(pinv, 'madera')).toBe(24);
    expect(alm.inventory!.slots.every((x) => !x)).toBe(true);
  });

  it('empuñar una herramienta desde la mochila la lleva a la barra y la selecciona', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const pinv = sim.state.player.inventory;
    for (let i = 5; i < HOTBAR_SLOTS; i++) pinv.slots[i] = { id: 'madera', qty: 1 };
    pinv.slots[9] = { id: 'cana', qty: 1 };
    const to = wieldFromSlot(env, 9);
    expect(to).toBeGreaterThanOrEqual(0);
    expect(to).toBeLessThan(HOTBAR_SLOTS);
    expect(pinv.slots[to]?.id).toBe('cana');
    expect(sim.state.player.hotbar).toBe(to);
    // Lo que había en esa ranura de la barra pasa a la mochila (intercambio).
    expect(pinv.slots[9]?.id).toBe('madera');
  });

  it('avisos: se agrupan por forma, como mucho 3 y un peligro no lo tapa una ráfaga', () => {
    expect(toastShape('Bebes agua del depósito (quedan 56 L)')).toBe(toastShape('Bebes agua del depósito (quedan 55 L)'));
    let list: ToastEntry[] = [];
    let id = 1;
    const push = (text: string, kind: ToastEntry['kind'], born = 0): void => {
      list = pushToast(list, { id: id++, text, kind, born, ttl: 5 });
    };
    push('Bebes agua del depósito (quedan 56 L)', 'good');
    push('Bebes agua del depósito (quedan 55 L)', 'good', 1);
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({ text: 'Bebes agua del depósito (quedan 55 L)', count: 1, born: 1 });
    // Mismo texto: contador. Solo cambian las cifras: texto nuevo y sin contador (no «5× ×2»).
    push('Echas 1× Madera al fogón', 'info', 1);
    push('Echas 1× Madera al fogón', 'info', 1);
    expect(list.at(-1)).toMatchObject({ text: 'Echas 1× Madera al fogón', count: 2 });
    push('Echas 5× Madera al fogón', 'info', 1);
    expect(list.at(-1)).toMatchObject({ text: 'Echas 5× Madera al fogón', count: 1 });
    expect(list.length).toBe(2);
    push('¡Fuego en la cocina!', 'danger', 1);
    for (let i = 0; i < 6; i++) push(`Aviso ${String.fromCharCode(65 + i)}`, 'info', 2);
    expect(list.length).toBe(MAX_TOASTS);
    expect(MAX_TOASTS).toBe(3);
    expect(list.some((t) => t.kind === 'danger')).toBe(true);
    expect(list.at(-1)!.text).toBe('Aviso F');
  });

  it('[21] el banco preselecciona la caña mientras el tutorial la pide (y la cocina, el pescado)', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    expect(stationTutorial(env, mod(sim, 'banco_trabajo'))?.recipe).toBe('cana');
    expect(stationTutorial(env, mod(sim, 'cocina'))?.recipe).toBe('pescado_asado');
    expect(stationTutorial(env, mod(sim, 'almacen'))).toBeNull();
    sim.state.tutorial.done.push('fabricar');
    expect(stationTutorial(env, mod(sim, 'banco_trabajo'))).toBeNull();
    sim.state.tutorial.dismissed = true;
    expect(stationTutorial(env, mod(sim, 'cocina'))).toBeNull();
  });

  it('[22] el panel del depósito avisa del agua que se perdería al desmontarlo', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const dep = mod(sim, 'deposito');
    const u = sim.state.utilities;
    const note = demolishLossNote(env, dep);
    expect(note).not.toBeNull();
    const text = String(note!.children.at(-1));
    expect(text).toMatch(/^Si lo desmontas ahora, se perderían \d+ L de agua \(la capacidad bajaría a \d+ L\)\.$/);
    // Sin agua de más, no hay aviso.
    u.waterL = 5;
    expect(demolishLossNote(env, dep)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* DOM virtual (con un mini-DOM)                                       */
/* ------------------------------------------------------------------ */

class FNode {
  childNodes: FNode[] = [];
  parentNode: FNode | null = null;
  constructor(readonly nodeType: number) {}
  get firstChild(): FNode | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): FNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get isConnected(): boolean {
    return true;
  }
  appendChild(n: FNode): FNode {
    return this.insertBefore(n, null);
  }
  insertBefore(n: FNode, ref: FNode | null): FNode {
    if (n.parentNode) n.parentNode.removeChild(n);
    const i = ref ? this.childNodes.indexOf(ref) : -1;
    if (i < 0) this.childNodes.push(n);
    else this.childNodes.splice(i, 0, n);
    n.parentNode = this;
    return n;
  }
  removeChild(n: FNode): FNode {
    const i = this.childNodes.indexOf(n);
    if (i >= 0) this.childNodes.splice(i, 1);
    n.parentNode = null;
    return n;
  }
}

class FText extends FNode {
  constructor(public nodeValue: string) {
    super(3);
  }
}

class FElement extends FNode {
  attrs = new Map<string, string>();
  className = '';
  html = '';
  styleProps = new Map<string, string>();
  style = {
    setProperty: (k: string, v: string) => this.styleProps.set(k, v),
    removeProperty: (k: string) => this.styleProps.delete(k),
  };
  [key: string]: unknown;
  constructor(
    readonly localName: string,
    readonly namespaceURI: string | null = null,
  ) {
    super(1);
  }
  setAttribute(k: string, v: string): void {
    this.attrs.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string): void {
    this.attrs.delete(k);
  }
  set innerHTML(v: string) {
    this.html = v;
    this.childNodes = [];
  }
  get innerHTML(): string {
    return this.html;
  }
  get textContent(): string {
    return this.childNodes.map((c) => (c instanceof FText ? c.nodeValue : (c as FElement).textContent)).join('');
  }
}

describe('DOM virtual', () => {
  const g = globalThis as unknown as { document?: unknown };
  let saved: unknown;
  beforeEach(() => {
    saved = g.document;
    g.document = {
      createElement: (t: string) => new FElement(t),
      createElementNS: (ns: string, t: string) => new FElement(t, ns),
      createTextNode: (t: string) => new FText(t),
    };
  });
  afterEach(() => {
    g.document = saved;
  });

  it('crea, actualiza texto y atributos y quita lo que sobra', () => {
    const root = new FElement('div');
    patch(root as unknown as Element, h('ul', { class: 'a', title: 'x' }, h('li', null, 'uno'), h('li', null, 'dos')));
    const ul = root.childNodes[0] as FElement;
    expect(ul.className).toBe('a');
    expect(ul.getAttribute('title')).toBe('x');
    expect(ul.textContent).toBe('unodos');
    const li0 = ul.childNodes[0];
    patch(root as unknown as Element, h('ul', { class: 'b' }, h('li', null, 'UNO')));
    expect(root.childNodes[0]).toBe(ul); // mismo elemento
    expect(ul.className).toBe('b');
    expect(ul.getAttribute('title')).toBeNull();
    expect(ul.childNodes.length).toBe(1);
    expect(ul.childNodes[0]).toBe(li0);
    expect(ul.textContent).toBe('UNO');
  });

  it('las claves conservan la identidad al reordenar', () => {
    const root = new FElement('div');
    patch(root as unknown as Element, ['a', 'b', 'c'].map((k) => h('i', { key: k }, k)));
    const [a, b, c] = root.childNodes;
    patch(root as unknown as Element, ['c', 'a', 'b'].map((k) => h('i', { key: k }, k)));
    expect(root.childNodes).toEqual([c, a, b]);
    patch(root as unknown as Element, ['b', 'd'].map((k) => h('i', { key: k }, k)));
    expect(root.childNodes[0]).toBe(b);
    expect((root.childNodes[1] as FElement).textContent).toBe('d');
    expect(root.childNodes.length).toBe(2);
  });

  it('cambia de etiqueta, aplica html, estilos, manejadores y SVG', () => {
    const root = new FElement('div');
    const clicks: string[] = [];
    patch(root as unknown as Element, h('span', { html: '<b>x</b>', style: { width: '10%' }, onclick: () => clicks.push('a') }));
    const span = root.childNodes[0] as FElement;
    expect(span.innerHTML).toBe('<b>x</b>');
    expect(span.styleProps.get('width')).toBe('10%');
    (span['onclick'] as () => void)();
    patch(root as unknown as Element, h('span', { html: '<b>x</b>', style: { opacity: '0.5' }, onclick: () => clicks.push('b') }));
    expect(root.childNodes[0]).toBe(span);
    expect(span.styleProps.has('width')).toBe(false);
    expect(span.styleProps.get('opacity')).toBe('0.5');
    (span['onclick'] as () => void)();
    expect(clicks).toEqual(['a', 'b']);
    patch(root as unknown as Element, h('svg', { viewBox: '0 0 10 10' }, h('circle', { r: 2 })));
    const svg = root.childNodes[0] as FElement;
    expect(svg.localName).toBe('svg');
    expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect((svg.childNodes[0] as FElement).namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect((svg.childNodes[0] as FElement).getAttribute('r')).toBe('2');
  });

  it('ignora nulos y aplana listas anidadas', () => {
    const root = new FElement('div');
    patch(root as unknown as Element, h('p', null, 'a', null, false, ['b', ['c', 3]], undefined));
    expect((root.childNodes[0] as FElement).textContent).toBe('abc3');
  });
});


/* ------------------------------------------------------------------ */
/* Ronda de contenido 2 (c2-ui)                                        */
/* ------------------------------------------------------------------ */

/** Texto plano de un árbol de nodos virtuales (o de un PanelView entero). */
function vtext(v: unknown): string {
  if (v === null || v === undefined || v === false || v === true) return '';
  if (typeof v === 'string' || typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(vtext).join('');
  const n = v as { tag?: string; children?: unknown[]; title?: unknown; body?: unknown };
  if (n.tag !== undefined) return vtext(n.children ?? []);
  // PanelView
  const pv = v as Record<string, unknown>;
  return ['title', 'subtitle', 'head', 'tabs', 'body', 'foot'].map((k) => vtext(pv[k])).join(' | ');
}

/** Busca nodos por clase en un árbol virtual. */
function findByClass(v: unknown, cls: string, out: VNode[] = []): VNode[] {
  if (!v || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const c of v) findByClass(c, cls, out);
    return out;
  }
  const n = v as VNode;
  if (n.tag !== undefined) {
    if (String(n.props?.['class'] ?? '').split(/\s+/).includes(cls)) out.push(n);
    for (const c of n.children) findByClass(c, cls, out);
    return out;
  }
  for (const k of ['head', 'tabs', 'body', 'foot']) findByClass((v as Record<string, unknown>)[k], cls, out);
  return out;
}

const C2_UNLOCKS = ['taller', 'energia', 'agua', 'enfermeria', 'solar', 'invernadero', 'motor', 'acuicultura', 'grua', 'radar', 'casco'];

/** Coloca un módulo terminado en el primer hueco válido del nivel dado. */
function placeModule(sim: Simulation, type: string, level: number): ModuleInstance {
  const ship = sim.state.ship;
  for (let x = ship.length - 1; x >= 0; x--) {
    for (let z = 0; z < ship.width; z++) {
      for (const rot of [0, 1, 2, 3] as const) {
        if (!checkPlacement(ship, C2_UNLOCKS, type, level, x, z, rot).ok) continue;
        const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
        ship.modules.push(m);
        sim.shipChanged();
        return m;
      }
    }
  }
  throw new Error(`no cabe ${type} en el nivel ${level}`);
}

describe('c2-ui: objetos, glifos y datos nuevos', () => {
  it('iconos propios para el pescado ahumado, los planos nuevos y las siete hojas (con su número)', () => {
    for (const id of ['pescado_ahumado', 'plano_acuicultura', 'plano_grua', 'plano_radar']) expect(hasItemIcon(id), id).toBe(true);
    const pages = [1, 2, 3, 4, 5, 6, 7].map((n) => itemIcon(`pagina_${n}`));
    expect(new Set(pages).size).toBe(7);
    pages.forEach((svg, i) => {
      expect(wellFormed(svg)).toBe(true);
      expect(svg).toContain(`>${i + 1}</text>`);
    });
    // El pescado ahumado no es el crudo ni el asado.
    expect(itemIcon('pescado_ahumado')).not.toBe(itemIcon('pescado_crudo'));
    expect(itemIcon('pescado_ahumado')).not.toBe(itemIcon('pescado_asado'));
  });

  it('glifos de los módulos nuevos, de la llegada y de las herramientas de mejora y del cuaderno', () => {
    expect(MODULE_GLYPH['sala_comun']).toBe('sofa');
    expect(MODULE_GLYPH['grua']).toBe('crane');
    expect(MODULE_GLYPH['radar']).toBe('radar');
    expect(EVENT_GLYPH['llegada']).toBe('anchor');
    for (const g of ['sofa', 'smoke', 'crane', 'radar', 'radio', 'upgrade', 'chevrons', 'page', 'quill', 'heart', 'flag', 'lighthouse']) {
      expect(hasGlyph(g), g).toBe(true);
      expect(wellFormed(glyph(g)), g).toBe(true);
    }
    for (const k of ['naufragio', 'isla', 'balsa', 'mercante', 'estructura']) expect(hasGlyph(SIGHTING_GLYPH[k] ?? ''), k).toBe(true);
  });

  it('las hojas del cuaderno se leen, tienen categoría propia y se ordenan junto a los planos', () => {
    const page = ITEMS['pagina_3']!;
    expect(useVerb(page, 10)).toBe('Leer');
    expect(CATEGORY_NAMES['documento']).toBe('Hoja del cuaderno');
    expect(itemEffects(page).some((e) => /Cuaderno del Diario/.test(e.label))).toBe(true);
    // La U de la herramienta Mejorar se resalta como tecla en los consejos.
    const rk = richKeys('Pulsa U para mejorar');
    expect(rk.some((x) => typeof x === 'object' && x !== null && (x as VNode).props?.['class'] === 'kbd' && (x as VNode).children[0] === 'U')).toBe(true);
    const inv = createInventory(6);
    inv.slots[0] = { id: 'madera', qty: 3 };
    inv.slots[1] = { id: 'pagina_2', qty: 1 };
    inv.slots[2] = { id: 'plano_grua', qty: 1 };
    inv.slots[3] = { id: 'pescado_ahumado', qty: 2 };
    sortInventory(inv, 0, 6, (a, b) => moveStack(inv, a, inv, b));
    expect(inv.slots.slice(0, 4).map((x) => x?.id)).toEqual(['pescado_ahumado', 'plano_grua', 'pagina_2', 'madera']);
  });

  it('«Guardar todo» deja contigo las hojas sin leer y lo explica', () => {
    const sim = newSim();
    const { env, toasts } = fakeEnv(sim);
    const alm = mod(sim, 'almacen');
    const ref: InvRef = { kind: 'module', id: alm.id, slot: 'inventory' };
    const pinv = sim.state.player.inventory;
    pinv.slots[12] = { id: 'chatarra', qty: 3 };
    storeAll(env, ref);
    expect(pinv.slots[8]?.id).toBe('pagina_1');
    expect(pinv.slots[12]).toBeNull();
    expect(toasts.at(-1)!.text).toBe('Guardas todo lo de la mochila (la hoja del cuaderno se queda contigo: léela con clic derecho)');
    // Solo la hoja en la mochila (y comida en la barra): no hay nada más que guardar.
    storeAll(env, ref);
    expect(toasts.at(-1)!.text).toMatch(/^En la mochila solo llevas hojas del cuaderno, que se quedan contigo\. Para guardar también la barra rápida/);
    // Con la barra, la hoja sigue sin guardarse.
    storeAll(env, ref, true);
    expect(pinv.slots[8]?.id).toBe('pagina_1');
    expect(countItem(alm.inventory!, 'pagina_1')).toBe(0);
  });

  it('la carta sitúa Puerto Esperanza más allá del faro y solo la muestra con el rumbo revelado', () => {
    expect(CHART_POS['esperanza']!.x).toBeGreaterThan(CHART_POS['faro']!.x);
    const sim = newSim();
    expect(finalRegionOnChart(sim)).toBe(false);
    let helm = vtext(renderHelm(fakeEnv(sim).env));
    expect(helm).not.toContain('Puerto Esperanza');
    expect(helm).not.toContain(CAPTAIN_COURSE_LABEL);
    sim.state.story!.pages = [1, 2, 3, 4, 5];
    sim.state.story!.revealed = true;
    expect(finalRegionOnChart(sim)).toBe(true);
    const view = renderHelm(fakeEnv(sim).env);
    helm = vtext(view);
    expect(helm).toContain('Puerto Esperanza');
    expect(helm).toContain(CAPTAIN_COURSE_LABEL);
    expect(findByClass(view, 'captain-badge').length).toBe(1);
    // El rumbo dorado de la región actual a Puerto Esperanza, en la carta.
    expect(findByClass(view, 'captain').some((n) => n.tag === 'path')).toBe(true);
  });

  it('efectos de una mejora en pocas palabras y subtítulo según el nivel', () => {
    expect(upgradeEffectsText('almacen', { storageSlots: 32 })).toBe('32 huecos');
    expect(upgradeEffectsText('generador', { powerGen: 8, fuelEfficiency: 1.3 })).toBe('8 kW, combustible ×1,3');
    expect(upgradeEffectsText('huerto', { waterUseMult: 0.6, growthMult: 1.2 })).toBe('crecimiento ×1,2, agua ×0,6');
    expect(upgradeEffectsText('grua', { workSpeed: 1.6 }, 2)).toMatch(/^velocidad ×1,6, alcance \d+ m$/);
    expect(moduleSubtitle({ type: 'almacen', tier: 1 })).toBe(MODULE_LIST.find((m) => m.id === 'almacen')!.desc);
    expect(moduleSubtitle({ type: 'almacen', tier: 2 })).toMatch(/^Un altillo y más baldas/);
  });

  it('mensajes de radio del diario, del más reciente al más antiguo', () => {
    const log = [
      { at: 10, text: 'Radio: el «Marea» saluda.', kind: 'info' as const },
      { at: 20, text: 'Cosechas hortalizas', kind: 'good' as const },
      { at: 30, text: 'Radio: se espera mar de fondo.', kind: 'info' as const },
    ];
    expect(radioMessages(log, 5)).toEqual([
      { at: 30, text: 'Se espera mar de fondo.' },
      { at: 10, text: 'El «Marea» saluda.' },
    ]);
    expect(radioMessages(log, 1).length).toBe(1);
  });
});

describe('c2-ui: paneles de estación por nivel y módulos nuevos', () => {
  it('el pie dice «Nivel N/M» y la mejora siguiente; con la mejora en obras, su progreso', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const alm = mod(sim, 'almacen');
    let t = vtext(renderStation(env, alm.id));
    expect(t).toContain('Nivel 1/3');
    expect(t).toContain('Mejorable en el modo construcción (B, herramienta Mejorar): Almacén con altillo (32 huecos)');
    // Mejora en obras: se paga y el panel enseña el progreso (el módulo sigue en uso).
    addItem(sim.state.player.inventory, 'tornillos', 10);
    addItem(sim.state.player.inventory, 'madera', 12);
    expect(sim.startUpgrade(alm.id).ok).toBe(true);
    alm.upgrade!.progress = 0.4;
    t = vtext(renderStation(env, alm.id));
    expect(t).toContain('Mejorando a «Almacén con altillo»');
    expect(t).toContain('40 %');
    expect(t).not.toContain('Mejorable en el modo construcción');
    expect(moduleIssues(sim).some((i) => i.module === alm && /Mejorando a nivel 2 · 40 %/.test(i.text))).toBe(true);
    // Terminada: el título es el del nivel y la siguiente mejora es la tercera.
    alm.tier = 2;
    alm.upgrade = null;
    const view = renderStation(env, alm.id)!;
    expect(view.title).toBe('Almacén con altillo');
    t = vtext(view);
    expect(t).toContain('Nivel 2/3');
    expect(t).toContain('Almacén reforzado (48 huecos)');
    alm.tier = 3;
    expect(vtext(renderStation(env, alm.id))).toContain('Nivel máximo');
  });

  it('los paneles leen las capacidades del nivel actual (moduleStat), no las de la definición', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const dep = mod(sim, 'deposito');
    expect(vtext(renderStation(env, dep.id))).toMatch(/aporta 120 L de capacidad/);
    dep.tier = 2;
    expect(vtext(renderStation(env, dep.id))).toMatch(/aporta 220 L de capacidad/);
    // Un módulo sin mejoras no enseña niveles.
    const esc = sim.state.ship.modules.find((m) => m.type === 'escalera');
    if (esc) expect(upgradeLine(env, esc)).toBeNull();
  });

  it('ahumadero: estación con la receta de ahumar, verbo propio y bandeja', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const m = placeModule(sim, 'ahumadero', 1);
    const view = renderStation(env, m.id)!;
    const t = vtext(view);
    expect(view.title).toBe('Ahumadero');
    expect(t).toContain('Ahumar ×1');
    expect(t).toContain('Bandeja de salida');
    expect(t).toMatch(/La leña va en la receta/);
    expect(t).toContain('Nivel 1/2');
  });

  it('vivero: estado, avance hacia el siguiente pescado, consumo e interruptor; bandeja con «Tomar todo»', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const m = placeModule(sim, 'vivero', 1);
    const t = vtext(renderStation(env, m.id));
    expect(t).toContain('Siguiente pescado');
    expect(t).toMatch(/un pescado cada \d/);
    expect(t).toContain('kW mientras cría');
    expect(t).toContain('Tomar todo');
    expect(findByClass(renderStation(env, m.id), 'switch').length).toBe(1);
  });

  it('grúa: estado, costado y alcance, objetivo y bandeja de lo rescatado', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const m = placeModule(sim, 'grua', 1);
    const gs = sim.gruaStatus(m.id)!;
    const t = vtext(renderStation(env, m.id));
    expect(t).toContain(gs.status);
    expect(t).toMatch(new RegExp(`trabaja por (babor|estribor) · alcance ${Math.round(gs.range)} m`));
    expect(t).toContain('Objetivo');
    expect(t).toContain('Restos a su alcance');
    expect(t).toContain('Tomar todo');
  });

  it('radar: estado, avistamientos y los últimos mensajes de radio', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const m = placeModule(sim, 'radar', 2);
    sim.state.voyage.sightings.push({ id: 991, kind: 'isla', name: 'Isla del Loro', expiresAt: sim.state.time + 120, side: -1, distance: 140, x: 60 } as never);
    sim.state.log.push({ at: sim.state.time - 30, text: 'Radio: el «Marea» avisa de mar de fondo.', kind: 'info' });
    const t = vtext(renderStation(env, m.id));
    expect(t).toContain('Avistamientos');
    expect(t).toContain('Isla del Loro');
    expect(t).toContain('babor · 140 m');
    expect(t).toContain('El «Marea» avisa de mar de fondo.');
    expect(t).toContain('Barómetro');
  });
});

describe('c2-ui: relaciones, cuaderno y llegada', () => {
  it('la ficha del habitante muestra sus relaciones de la mejor a la peor', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    const [a, b] = sim.state.npcs;
    expect(a && b).toBeTruthy();
    let t = vtext(renderNpc(env, a!.id));
    expect(t).toContain('Relaciones');
    expect(t).toMatch(/Aún no ha hecho amistades ni tiene roces a bordo/);
    (a!.relations ??= {})[b!.id] = 60;
    (b!.relations ??= {})[a!.id] = 60;
    const view = renderNpc(env, a!.id);
    t = vtext(view);
    const rel = sim.npcRelations(a!.id)[0]!;
    expect(rel.name).toBe(b!.name);
    expect(t).toContain(rel.label);
    expect(findByClass(view, 'rel-name').length).toBe(1);
    expect(relationTone(60).glyph).toBe('heart');
    expect(relationTone(-60).tone).toBe('danger');
  });

  it('el Cuaderno del Diario: resumen, huecos con pista y la hoja leída con su texto completo', () => {
    const sim = newSim();
    const { env } = fakeEnv(sim);
    env.ps.tab = 'diario';
    env.ps.diary = 'cuaderno';
    let t = vtext(renderInventory(env));
    expect(t).toContain('Cuaderno del Albatros');
    expect(t).toContain(storyStatus(sim).summary);
    expect(t).toContain('Pág. 1');
    expect(t).toContain('¿?');
    // La hoja 1 está en la mochila sin leer: la pista lo dice.
    expect(t).toMatch(/La llevas en la mochila sin leer/);
    // Leerla (clic derecho) la archiva: el cuaderno enseña su título y sus párrafos.
    expect(sim.useItem(8).ok).toBe(true);
    env.ps.page = 1;
    t = vtext(renderInventory(env));
    expect(t).toContain('«A quien encuentre esto»');
    for (const p of paragraphs(STORY_PAGES[0]!.text)) expect(t).toContain(p);
    expect(t).toContain('Elena Duarte, capitana del Albatros');
    // Una hoja que falta: hueco con la región donde suele aparecer.
    env.ps.page = 4;
    t = vtext(renderInventory(env));
    expect(t).toMatch(/Esta hoja falta/);
    expect(t).toContain(storyStatus(sim).pages[3]!.hint!);
    // Con el rumbo revelado, se destaca en el cuaderno.
    sim.state.story!.revealed = true;
    expect(vtext(renderInventory(env))).toMatch(new RegExp(`${CAPTAIN_COURSE_LABEL}: elígelo en el timón`));
    // El diario de a bordo sigue siendo la vista por defecto.
    env.ps.diary = undefined;
    expect(vtext(renderInventory(env))).toContain('Situaciones en curso');
  });

  it('utilidades del lector: hojas nuevas, párrafos, tiempo de lectura y hoja por defecto', () => {
    expect(newPages([1, 2], [1, 2, 4])).toEqual([4]);
    expect(newPages([], [])).toEqual([]);
    expect(paragraphs('Uno.\n\nDos.\n\n\nTres.')).toEqual(['Uno.', 'Dos.', 'Tres.']);
    const sec = readingSeconds(STORY_PAGES[0]!.text);
    expect(sec).toBeGreaterThanOrEqual(16);
    expect(sec).toBeLessThanOrEqual(50);
    expect(readingSeconds('pocas palabras')).toBe(16);
    const st = storyStatus(newSim());
    expect(defaultPage(st)).toBe(1);
    expect(defaultPage({ ...st, read: [1, 3] }, null)).toBe(3);
    expect(defaultPage(st, 6)).toBe(6);
    expect(defaultPage(st, 99)).toBe(1);
    expect(listNames(['Ana'])).toBe('Ana');
    expect(listNames(['Ana', 'Luis', 'Marta'])).toBe('Ana, Luis y Marta');
  });

  it('pantalla de llegada: textos de story.ts, estadísticas de la travesía y botones', () => {
    const sim = newSim(21);
    sim.state.voyage.regionId = 'esperanza';
    sim.state.story!.pages = [1, 2, 3, 4, 5];
    sim.state.story!.revealed = true;
    sim.state.player.stats.debrisCollected = 37;
    expect(startEvent(sim, 'llegada')).not.toBeNull();
    const sum = sim.arrivalSummary()!;
    const stats = arrivalStats(sim, sum);
    expect(stats.find((s) => s.label === 'Restos rescatados')!.value).toBe('37');
    expect(stats.find((s) => s.label === 'Hojas del cuaderno')!.value).toBe('5 de 7');
    expect(stats.find((s) => /Habitantes a bordo/.test(s.label))!.value).toBe(String(sum.crew.length));
    let cont = 0;
    let market = -1;
    const view = arrivalView(sim, sum, { onContinue: () => cont++, onMarket: (id) => (market = id) });
    const t = vtext(view);
    expect(t).toContain('Puerto Esperanza');
    for (const p of sum.paragraphs) expect(t).toContain(p);
    expect(t).toContain(sum.epilogue);
    expect(t).toContain('Seguir navegando');
    if (sum.newcomers.length) expect(t).toContain(listNames(sum.newcomers));
    // Los botones llaman a sus acciones (el del mercado, con el evento del muelle).
    const buttons = findByClass(view, 'btn');
    (buttons.find((b) => vtext(b).includes('Seguir navegando'))!.props['onclick'] as (e: unknown) => void)({ stopPropagation() {} });
    expect(cont).toBe(1);
    expect(sum.marketEventId).not.toBeNull();
    (buttons.find((b) => vtext(b).includes('Ir al mercado'))!.props['onclick'] as (e: unknown) => void)({ stopPropagation() {} });
    expect(market).toBe(sum.marketEventId);
  });
});

describe('c2-ui: lector de hojas y menús (con un mini-DOM)', () => {
  const g = globalThis as unknown as { document?: unknown };
  let saved: unknown;
  beforeEach(() => {
    saved = g.document;
    g.document = {
      createElement: (t: string) => new FElement(t),
      createElementNS: (ns: string, t: string) => new FElement(t, ns),
      createTextNode: (t: string) => new FText(t),
      head: null,
    };
  });
  afterEach(() => {
    g.document = saved;
  });

  it('el lector enseña la hoja, no corre con un menú abierto ni con el cursor encima, y se cierra solo', () => {
    const layer = new FElement('div');
    const r = new PageReader(layer as unknown as HTMLElement);
    expect(r.visible).toBe(false);
    r.show(2);
    expect(r.current).toBe(2);
    const total = r.remaining;
    expect(total).toBe(readingSeconds(`${STORY_PAGES[1]!.title} ${STORY_PAGES[1]!.text}`));
    r.update(1, { hidden: false, panelOpen: false });
    expect(r.remaining).toBeCloseTo(total - 1, 5);
    const el = layer.childNodes[0] as FElement;
    expect(el.textContent).toContain(STORY_PAGES[1]!.title);
    expect(el.textContent).toContain('abre el cuaderno');
    // Con un menú abierto el tiempo no corre.
    r.update(5, { hidden: true, panelOpen: false });
    expect(r.remaining).toBeCloseTo(total - 1, 5);
    // Con un panel abierto ofrece botones (el ratón está libre).
    let opened = -1;
    r.onOpenNotebook = (n) => (opened = n);
    r.update(0, { hidden: false, panelOpen: true });
    expect(el.textContent).toContain('Ver en el cuaderno');
    const findBtn = (n: FElement, text: string): FElement | null => {
      if (n.localName === 'button' && n.textContent.includes(text)) return n;
      for (const c of n.childNodes) if (c instanceof FElement) {
        const f = findBtn(c, text);
        if (f) return f;
      }
      return null;
    };
    (findBtn(el, 'Ver en el cuaderno')!['onclick'] as (e: unknown) => void)({ stopPropagation() {} });
    expect(opened).toBe(2);
    r.update(total, { hidden: false, panelOpen: false });
    expect(r.visible).toBe(false);
    expect(layer.childNodes[0]?.childNodes.length ?? 0).toBe(0);
  });

  it('[P3] «Valores por defecto» también aplica la perspectiva de la cámara', () => {
    const settings = { ...DEFAULT_SETTINGS, perspective: 'third' as const, fov: 90 };
    const player = { perspective: 'third' };
    let saves = 0;
    const ctx = { settings, player, saveSettings: () => saves++, renderer: { needsReloadFor: () => false } };
    const menus = new Menus(new FElement('div') as unknown as HTMLElement, ctx as never, {} as never);
    menus.resetSettings();
    expect(settings.perspective).toBe('first');
    expect(settings.fov).toBe(DEFAULT_SETTINGS.fov);
    expect(player.perspective).toBe('first');
    expect(saves).toBe(1);
  });

  it('[P6] los ajustes avisan si la calidad elegida necesita recargar para el suavizado de bordes', () => {
    let need = true;
    const ctx = { settings: { ...DEFAULT_SETTINGS }, renderer: { needsReloadFor: () => need } };
    const menus = new Menus(new FElement('div') as unknown as HTMLElement, ctx as never, {} as never);
    expect(menus.qualityNeedsReload()).toBe(true);
    need = false;
    expect(menus.qualityNeedsReload()).toBe(false);
    // Sin renderizador (pruebas) no avisa ni falla.
    const bare = new Menus(new FElement('div') as unknown as HTMLElement, { settings: { ...DEFAULT_SETTINGS } } as never, {} as never);
    expect(bare.qualityNeedsReload()).toBe(false);
  });
});

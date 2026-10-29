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

/**
 * [AGENTE sim-survival] ACCIONES DEL JUGADOR sobre objetos, inventarios, sueño y agua
 * (docs/SISTEMAS.md §1).
 *
 * - `useItem`: comer/beber/curarse (efectos, enfermedad por probabilidad, cura, objeto que queda),
 *   estudiar planos (desbloqueo), leer hojas del cuaderno del Albatros (se archivan en el diario y,
 *   con `PAGES_TO_REVEAL`, revelan el rumbo a Puerto Esperanza; ver `readDocument` y
 *   `storyStatus`), ponerse ropa (intercambia con la que hubiera) y herramientas (se seleccionan en
 *   la barra rápida, no se consumen).
 * - `moveItem` / `takeAll` / `dropItem`: mover pilas entre inventarios con reglas (la ranura de
 *   combustible solo acepta lo que arde, nada se mete en una obra) y sin perder nunca objetos.
 * - `sleep` / `wake`: dormir en una cama libre o propia; el sueño y el despertar automático los
 *   gestiona needs.ts.
 * - `drinkFromTank` / `fillBottle`: agua potable de la red (`state.utilities.waterL`).
 *
 * Los resultados llevan un `msg` en español para que la interfaz lo muestre.
 */
import { clamp } from '../core/math';
import { ITEMS, type ItemDef } from '../data/items';
import { MODULES } from '../data/modules';
import { REGIONS } from '../data/regions';
import { FINAL_REGION, PAGES_TO_REVEAL, STORY_PAGES, STORY_TEXTS, pageByItem } from '../data/story';
import { HOTBAR_SLOTS, INTERACT_RANGE, WATER_PER_DRINK } from './constants';
import { addToPlayerInventory, findModule, giveToPlayer, itemName, pruneCrates, shipCount, spawnCrate } from './helpers';
import { addItem, countItem, moveStack, spaceFor, takeFromSlot, stackLimit } from './inventory';
import { moduleDisplayName } from './moduleStats';
import { CRITICAL_HEALTH, CRITICAL_NEED, DEATH_CAUSES, SICK_HOURS, fireAboard, healthRatePerHour, killPlayer, wakePlayer } from './needs';
import type { ActionResult, InvRef, Simulation } from './Simulation';
import { hourOf } from './time';
import type { PropInstance } from './ship';
import { markTutorial } from './tutorial';
import type { Inventory, ModuleInstance, StoryState } from './types';
import { agree, isFeminineName, isHealingBedPowered, withArticle as moduleWithArticle } from './utilities';
import { regionWithArticle } from './voyage';

/* ------------------------------------------------------------------ */
/* Parámetros                                                          */
/* ------------------------------------------------------------------ */

/** Sed que quita un trago directo del depósito. */
export const TANK_DRINK_THIRST = 40;
/** Distancia (m, en planta, hasta el borde del depósito) para beber o llenar botellas. */
export const TANK_RANGE = INTERACT_RANGE + 1;
/** Se puede dormir de noche (desde esta hora hasta SLEEP_NIGHT_TO) o con energía < SLEEP_MAX_ENERGY. */
export const SLEEP_NIGHT_FROM = 21;
export const SLEEP_NIGHT_TO = 5;
export const SLEEP_MAX_ENERGY = 80;
/** Distancia (m, en planta, hasta el borde del mueble) para acostarse en una cama. */
export const BED_RANGE = INTERACT_RANGE + 1.5;
/**
 * Probabilidad de enfermar al beber agua de mar. Respaldo mientras el objeto `cubo_agua` no
 * declare su propio `sickChance` en data/items.ts (SISTEMAS.md §1: "agua salada" enferma).
 */
const SALTWATER_SICK_CHANCE = 0.5;

const fail = (msg: string): ActionResult => ({ ok: false, msg });
const ok = (msg?: string): ActionResult => (msg === undefined ? { ok: true } : { ok: true, msg });

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */

/** Género y número gramatical del nombre de un objeto: m, f, mp (masculino plural), fp. */
export type ItemGender = 'm' | 'f' | 'mp' | 'fp';

/**
 * Género y número del nombre de cada objeto de data/items.ts (según su `name`: «Tornillería» es
 * femenino aunque el id sea `tornillos`; «Bidón de combustible», masculino). Los objetos que no
 * estén aquí se deducen del nombre (`guessGender`).
 */
export const ITEM_GENDER: Readonly<Record<string, ItemGender>> = {
  madera: 'f',
  chatarra: 'f',
  placa_metal: 'f',
  tornillos: 'f',
  fibra: 'f',
  cuerda: 'f',
  tela: 'f',
  plastico: 'm',
  componentes: 'mp',
  combustible: 'm',
  pieza_mecanica: 'f',
  kit_reparacion: 'm',
  celula_solar: 'f',
  pescado_crudo: 'm',
  pescado_asado: 'm',
  hortaliza: 'fp',
  fruta: 'f',
  conserva: 'f',
  sopa: 'f',
  guiso: 'm',
  agua_potable: 'f',
  cubo_agua: 'm',
  semilla_hortaliza: 'fp',
  semilla_lino: 'fp',
  vendaje: 'm',
  botiquin: 'm',
  martillo: 'm',
  llave_inglesa: 'f',
  gancho: 'm',
  cana: 'f',
  cubo: 'm',
  abrigo: 'm',
  plano_taller: 'm',
  plano_energia: 'm',
  plano_agua: 'm',
  plano_solar: 'm',
  plano_enfermeria: 'm',
  plano_casco: 'm',
  plano_invernadero: 'm',
  plano_acuicultura: 'm',
  plano_grua: 'm',
  plano_radar: 'm',
  plano_motor: 'm',
  pescado_ahumado: 'm',
  // «Cuaderno del Albatros, pág. N»: el núcleo del nombre es «cuaderno».
  pagina_1: 'm',
  pagina_2: 'm',
  pagina_3: 'm',
  pagina_4: 'm',
  pagina_5: 'm',
  pagina_6: 'm',
  pagina_7: 'm',
};

/** Sustantivos femeninos que no acaban en -a, y masculinos que sí (para objetos sin entrada). */
const FEM_NOUNS = new Set(['llave', 'red', 'sal', 'luz', 'lona', 'pieza', 'célula', 'semilla']);
const MASC_NOUNS = new Set(['día', 'mapa', 'sistema', 'problema']);

/** Deduce el género de un nombre por su primera palabra. */
function guessGender(name: string): ItemGender {
  const first = (name.split(/\s+/)[0] ?? '').toLowerCase();
  const plural = /[^íéáóú]s$/.test(first);
  const sing = plural ? first.replace(/es$/, '').replace(/s$/, '') : first;
  const fem = FEM_NOUNS.has(sing) || FEM_NOUNS.has(first) ? true : MASC_NOUNS.has(sing) ? false : /(a|ción|sión|dad|ería)$/.test(sing);
  return plural ? (fem ? 'fp' : 'mp') : fem ? 'f' : 'm';
}

/** Género y número del nombre de un objeto. */
export function itemGender(id: string): ItemGender {
  return ITEM_GENDER[id] ?? guessGender(ITEMS[id]?.name ?? id);
}

/** Artículo determinado de un objeto: 'el', 'la', 'los' o 'las'. */
export function itemArticle(id: string): string {
  return { m: 'el', f: 'la', mp: 'los', fp: 'las' }[itemGender(id)];
}

/** Artículo indeterminado de un objeto: 'un', 'una', 'unos' o 'unas'. */
export function itemIndefinite(id: string): string {
  return { m: 'un', f: 'una', mp: 'unos', fp: 'unas' }[itemGender(id)];
}

/** Nombre del objeto en minúscula inicial. */
function lowerName(id: string): string {
  const name = ITEMS[id]?.name ?? id;
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** «la llave inglesa», «el martillo», «las hortalizas». */
export function itemWithArticle(id: string): string {
  return `${itemArticle(id)} ${lowerName(id)}`;
}

/** «La llave inglesa», «Las hortalizas»: con artículo y mayúscula inicial (para empezar una frase). */
function capItem(id: string): string {
  const t = itemWithArticle(id);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** ¿El nombre del objeto es plural? («Hortalizas», «Componentes eléctricos»). */
function pluralItem(id: string): boolean {
  const g = itemGender(id);
  return g === 'mp' || g === 'fp';
}

/** «una llave inglesa», «un martillo», «unas hortalizas». */
export function itemWithIndefinite(id: string): string {
  return `${itemIndefinite(id)} ${lowerName(id)}`;
}

/** Concuerda un adjetivo (en masculino singular acabado en -o) con el objeto: ('tela', 'enredado') → 'enredada'. */
export function itemAgree(id: string, adjMasc: string): string {
  const g = itemGender(id);
  const stem = adjMasc.replace(/o$/, '');
  return stem + (g === 'f' || g === 'fp' ? 'a' : 'o') + (g === 'mp' || g === 'fp' ? 's' : '');
}

/** Segunda persona del verbo de consumo ("Comer" → "Comes"). */
function verb2(verb: string): string {
  const v = (verb.split(/\s+/)[0] ?? '').toLowerCase();
  switch (v) {
    case 'comer':
      return 'Comes';
    case 'beber':
      return 'Bebes';
    case 'tomar':
      return 'Tomas';
    default:
      return 'Usas';
  }
}

/* ------------------------------------------------------------------ */
/* Inventarios                                                         */
/* ------------------------------------------------------------------ */

export function inventoryOf(sim: Simulation, ref: InvRef): Inventory | null {
  if (ref.kind === 'player') return sim.state.player.inventory;
  if (ref.kind === 'crate') return sim.state.crates.find((c) => c.id === ref.id)?.inventory ?? null;
  const m = sim.state.ship.modules.find((mm) => mm.id === ref.id);
  if (!m) return null;
  return ref.slot === 'fuel' ? m.fuelInv : m.inventory;
}

function refModule(sim: Simulation, ref: InvRef): ModuleInstance | null {
  return ref.kind === 'module' ? (findModule(sim, ref.id) ?? null) : null;
}

const isFuelSlot = (ref: InvRef): boolean => ref.kind === 'module' && ref.slot === 'fuel';
const burns = (id: string): boolean => (ITEMS[id]?.fuel ?? 0) > 0;

function validSlot(inv: Inventory, slot: number): boolean {
  return Number.isInteger(slot) && slot >= 0 && slot < inv.slots.length;
}

/* ------------------------------------------------------------------ */
/* Usar objetos                                                        */
/* ------------------------------------------------------------------ */

/** Comer, beber, curarse, leer un plano o equiparse una prenda desde una ranura del jugador. */
export function useItem(sim: Simulation, slot: number): ActionResult {
  const p = sim.state.player;
  if (!p.alive) return fail('No puedes hacer nada');
  if (p.sleeping) return fail('Estás durmiendo');
  const inv = p.inventory;
  if (!validSlot(inv, slot)) return fail('Ranura no válida');
  const stack = inv.slots[slot];
  if (!stack) return fail('No hay nada en esa ranura');
  const def = ITEMS[stack.id];
  if (!def) return fail('Objeto desconocido');

  if (def.category === 'plano') return readBlueprint(sim, slot, def);
  if (def.category === 'documento') return readDocument(sim, slot, def);
  if (def.category === 'ropa') return equipClothing(sim, slot, def);
  if (def.consume) return consumeItem(sim, slot, def);

  switch (def.category) {
    case 'herramienta':
      if (slot < HOTBAR_SLOTS) {
        setHotbar(sim, slot);
        return ok(`Llevas ${itemWithArticle(def.id)} en la mano`);
      }
      return fail('Para usar una herramienta, muévela a la barra rápida (las 8 primeras ranuras) y selecciónala');
    case 'semilla':
      return fail('Las semillas se plantan en un huerto: pulsa E sobre un bancal');
    case 'combustible':
      return fail(`Echa ${itemWithArticle(def.id)} en la ranura de combustible de la cocina o del generador`);
    case 'pieza':
      return fail(partUse(def.id));
    case 'material':
      return fail(def.fuel ? 'Es un material para fabricar y construir; también arde en la cocina y en el generador' : 'Es un material: sirve para fabricar y construir');
    default:
      return fail('Esto no se puede usar');
  }
}

/** Para qué sirve una pieza de repuesto (no se «usa» desde el inventario). */
function partUse(id: string): string {
  switch (id) {
    case 'kit_reparacion':
      return 'El kit de reparación se gasta al reparar estructuras: acércate a lo dañado con un martillo y pulsa R';
    case 'pieza_mecanica':
      return 'La pieza mecánica se gasta al reparar máquinas: acércate a la máquina averiada con una llave inglesa y pulsa R';
    case 'celula_solar':
      return 'La célula solar sirve para construir paneles solares (modo construcción, B)';
    default:
      return `${itemWithArticle(id).charAt(0).toUpperCase()}${itemWithArticle(id).slice(1)} es un repuesto: se gasta al reparar o construir`;
  }
}

function readBlueprint(sim: Simulation, slot: number, def: ItemDef): ActionResult {
  const st = sim.state;
  const key = def.unlocks;
  const short = def.name.replace(/^Plano:\s*/i, '');
  if (!key) return fail('Este plano está en blanco');
  if (st.unlocks.includes(key)) return fail(`Ya conoces el plano «${short}»`);
  st.unlocks.push(key);
  takeFromSlot(st.player.inventory, slot, 1);
  sim.bus.emit('unlocked', { key, name: short });
  const p = st.player.pos;
  sim.bus.emit('sfx', { name: 'plano', x: p.x, y: p.y + 1, z: p.z });
  sim.log(`Plano aprendido: ${short}. ${def.desc}`, 'good', false);
  return ok(`Has aprendido el plano «${short}». ${def.desc}`);
}

/* ------------------------------------------------------------------ */
/* Hilo narrativo: las hojas del cuaderno del Albatros (data/story.ts)  */
/* ------------------------------------------------------------------ */

/** Números en palabra (femenino: «hoja») para los textos. */
const PAGE_WORDS = ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const pageWord = (n: number): string => PAGE_WORDS[n] ?? String(n);

/** Estado del hilo narrativo (lo crea si una partida antigua no lo tenía). */
export function storyState(sim: Simulation): StoryState {
  const st = sim.state;
  if (!st.story) st.story = { pages: [], revealed: false, arrived: false };
  return st.story;
}

/**
 * Lee una hoja del cuaderno. La hoja SE CONSUME: queda archivada en el Cuaderno del Diario (J),
 * donde la interfaz muestra su texto completo (SISTEMAS.md §15: «leer una página la guarda en el
 * Cuaderno del Diario»). Así siete hojas de valor 0 no ocupan siete ranuras de la mochila para
 * siempre, no se pueden perder en una caja ni venderse, y el director de eventos sabe por
 * `story.pages` que no debe repetirlas. Una copia de una hoja ya leída también se archiva, sin
 * entrada nueva en el diario. Al llegar a `PAGES_TO_REVEAL` hojas se conoce el rumbo a Puerto
 * Esperanza (`story.revealed`), que el timón ofrecerá al final de cualquier región (voyage.ts).
 */
function readDocument(sim: Simulation, slot: number, def: ItemDef): ActionResult {
  const page = pageByItem(def.id);
  if (!page) return fail('El agua ha borrado la tinta: no se puede leer');
  const p = sim.state.player;
  const story = storyState(sim);
  takeFromSlot(p.inventory, slot, 1);
  sim.bus.emit('sfx', { name: 'pagina', x: p.pos.x, y: p.pos.y + 1.2, z: p.pos.z });
  markTutorial(sim, 'cuaderno');
  if (story.pages.includes(page.n)) {
    return ok(`Ya habías leído esta hoja («${page.title}»): la guardas con las demás en el cuaderno del diario (J)`);
  }
  story.pages.push(page.n);
  story.pages.sort((a, b) => a - b);
  sim.log(`Leíste: «${page.title}» (cuaderno del Albatros, pág. ${page.n})`, 'info', false);
  const base = `Lees «${page.title}» (cuaderno del Albatros, pág. ${page.n}). Puedes releerla en el diario (J)`;
  if (story.revealed) return ok(base);
  const left = PAGES_TO_REVEAL - story.pages.length;
  if (left > 0) return ok(`${base}. ${left === 1 ? 'Te falta una hoja' : `Te faltan ${pageWord(left)} hojas`} para conocer el rumbo a ${REGIONS[FINAL_REGION]?.name ?? 'Puerto Esperanza'}`);
  story.revealed = true;
  sim.log(STORY_TEXTS.revealed, 'good');
  return ok(`${base}. ¡Ya sabes cómo llegar a ${REGIONS[FINAL_REGION]?.name ?? 'Puerto Esperanza'}!`);
}

export interface StoryPageInfo {
  n: number;
  /** Id del objeto de la hoja. */
  item: string;
  read: boolean;
  /** Título y texto (solo de las hojas ya leídas: las demás no se conocen). */
  title: string | null;
  text: string | null;
  /** Hoja a bordo sin leer: en la mochila del jugador, en el barco (almacenes, bandejas, cajas) o null. */
  aboard: 'mochila' | 'barco' | null;
  /** Región donde suele aparecer. */
  region: string;
  regionName: string;
  /** Pista para encontrarla o leerla (null si ya está leída). */
  hint: string | null;
}

export interface StoryStatus {
  /** Las siete hojas en orden. */
  pages: StoryPageInfo[];
  /** Números de las hojas leídas (ordenados). */
  read: number[];
  /** Hojas sin leer (con pista). */
  missing: StoryPageInfo[];
  total: number;
  /** Hojas necesarias para conocer el rumbo (`PAGES_TO_REVEAL`). */
  needed: number;
  /** Hojas que aún faltan para conocerlo (0 si ya se conoce). */
  remaining: number;
  revealed: boolean;
  arrived: boolean;
  finalRegion: string;
  finalRegionName: string;
  /** Resumen de una frase para el Cuaderno del Diario. */
  summary: string;
}

/** ¿Dónde está una hoja sin leer? En la mochila, en el barco o en ningún sitio a bordo. */
function pageAboard(sim: Simulation, item: string): 'mochila' | 'barco' | null {
  const st = sim.state;
  if (countItem(st.player.inventory, item) > 0) return 'mochila';
  if (shipCount(sim, item) > 0) return 'barco';
  if (st.crates.some((c) => c.inventory.slots.some((s) => s?.id === item))) return 'barco';
  if (st.npcs.some((n) => n.carry?.id === item)) return 'barco';
  return null;
}

/**
 * Progreso del hilo narrativo para la interfaz (Cuaderno del Diario): hojas leídas con su texto,
 * las que faltan con una pista de dónde buscarlas (su región; o dónde está si ya está a bordo sin
 * leer), si ya se conoce el rumbo a Puerto Esperanza y si se ha llegado.
 */
export function storyStatus(sim: Simulation): StoryStatus {
  const story = storyState(sim);
  const read = new Set(story.pages);
  const finalName = REGIONS[FINAL_REGION]?.name ?? 'Puerto Esperanza';
  const pages = STORY_PAGES.map((pg): StoryPageInfo => {
    const isRead = read.has(pg.n);
    const aboard = isRead ? null : pageAboard(sim, pg.item);
    let hint: string | null = null;
    if (!isRead) {
      if (aboard === 'mochila') hint = 'La llevas en la mochila sin leer: clic derecho sobre ella, o F con ella en la barra rápida';
      else if (aboard === 'barco') hint = 'Está a bordo sin leer, en un almacén o en una caja: cógela y léela';
      else if (pg.n === 1) hint = 'Estaba entre las cartas náuticas del puente';
      else hint = `Suele aparecer en ${regionWithArticle(pg.region)}: en cofres de naufragio, estructuras, islas y mercantes`;
    }
    return {
      n: pg.n,
      item: pg.item,
      read: isRead,
      title: isRead ? pg.title : null,
      text: isRead ? pg.text : null,
      aboard,
      region: pg.region,
      regionName: REGIONS[pg.region]?.name ?? pg.region,
      hint,
    };
  });
  const readList = pages.filter((x) => x.read).map((x) => x.n);
  const remaining = story.revealed ? 0 : Math.max(0, PAGES_TO_REVEAL - readList.length);
  let summary: string;
  if (story.arrived) summary = `Llegaste a ${finalName} siguiendo el rumbo de la capitana Duarte. Hojas leídas: ${readList.length} de ${STORY_PAGES.length}.`;
  else if (story.revealed) summary = `Conoces el rumbo a ${finalName}: elígelo en el timón al final de cualquier región (el rumbo de la capitana).`;
  else if (!readList.length) summary = `Aún no has leído ninguna hoja del cuaderno del Albatros. Con ${pageWord(PAGES_TO_REVEAL)} sabrás cómo llegar a ${finalName}.`;
  else summary = `Hojas leídas: ${readList.length} de ${STORY_PAGES.length}. Con ${pageWord(remaining)} más sabrás cómo llegar a ${finalName}.`;
  return {
    pages,
    read: readList,
    missing: pages.filter((x) => !x.read),
    total: STORY_PAGES.length,
    needed: PAGES_TO_REVEAL,
    remaining,
    revealed: story.revealed,
    arrived: story.arrived,
    finalRegion: FINAL_REGION,
    finalRegionName: finalName,
    summary,
  };
}

function equipClothing(sim: Simulation, slot: number, def: ItemDef): ActionResult {
  const p = sim.state.player;
  const inv = p.inventory;
  const old = p.clothing;
  takeFromSlot(inv, slot, 1);
  p.clothing = def.id;
  let msg = `Te pones ${itemWithArticle(def.id)}`;
  if (old) {
    // La prenda anterior vuelve a la misma ranura (o donde quepa; si no, a una caja a los pies).
    if (!inv.slots[slot]) inv.slots[slot] = { id: old, qty: 1 };
    else giveToPlayer(sim, old, 1);
    msg += ` y guardas ${itemWithArticle(old)}`;
  }
  sim.bus.emit('sfx', { name: 'equipar', x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
  return ok(msg);
}

/** Ganancia real (tras limitar a 100) de un efecto positivo. */
function gain(current: number, delta: number | undefined): number {
  if (!delta || delta <= 0) return 0;
  return Math.min(100, current + delta) - current;
}

function consumeItem(sim: Simulation, slot: number, def: ItemDef): ActionResult {
  const p = sim.state.player;
  const n = p.needs;
  const c = def.consume!;
  const inv = p.inventory;

  // No desperdiciar: si el objeto tiene efectos buenos pero ninguno serviría ahora, no se gasta.
  const hasBenefit = [c.hunger, c.thirst, c.energy, c.health, c.warmth].some((v) => (v ?? 0) > 0) || !!c.cures;
  if (hasBenefit) {
    const useful = gain(n.hunger, c.hunger) + gain(n.thirst, c.thirst) + gain(n.energy, c.energy) + gain(n.health, c.health) + gain(n.warmth, c.warmth);
    const cures = !!c.cures && p.sick > 0;
    if (useful < 0.5 && !cures) {
      if (def.category === 'bebida') return fail('No tienes sed');
      if (def.category === 'medicina') return fail('No lo necesitas: estás sano');
      return fail('No tienes hambre');
    }
  }

  const salty = def.id === 'cubo_agua' || /salada/i.test(c.verb);
  const sickChance = c.sickChance ?? (salty ? SALTWATER_SICK_CHANCE : 0);

  // Efectos.
  n.hunger = clamp(n.hunger + (c.hunger ?? 0), 0, 100);
  n.thirst = clamp(n.thirst + (c.thirst ?? 0), 0, 100);
  n.energy = clamp(n.energy + (c.energy ?? 0), 0, 100);
  n.warmth = clamp(n.warmth + (c.warmth ?? 0), 0, 100);
  n.health = Math.min(100, n.health + (c.health ?? 0));

  // Gastar una unidad y dejar lo que sobra (cubo vacío...).
  takeFromSlot(inv, slot, 1);
  if (c.leaves) {
    if (!inv.slots[slot]) inv.slots[slot] = { id: c.leaves, qty: 1 };
    else giveToPlayer(sim, c.leaves, 1);
  }

  let msg = salty ? 'Bebes agua salada: ¡puaj! Te deja más sediento' : `${verb2(c.verb)} ${itemWithIndefinite(def.id)}`;
  if (c.cures && p.sick > 0) {
    p.sick = 0;
    msg += '. Te encuentras mucho mejor';
  }
  if (sickChance > 0 && sim.rng.chance(sickChance)) {
    const wasSick = p.sick > 0;
    p.sick = Math.max(p.sick, SICK_HOURS);
    msg += wasSick ? '. Te sienta fatal: la enfermedad empeora' : '. Te sienta mal: estás enfermo';
    sim.notify('Estás enfermo: pierdes salud poco a poco. Un botiquín o la enfermería te curarán', 'warn');
  }

  if (def.category === 'comida' || def.category === 'bebida') markTutorial(sim, 'comer');
  const sound = def.category === 'medicina' ? 'curar' : def.category === 'bebida' || salty ? 'beber' : 'comer';
  sim.bus.emit('sfx', { name: sound, x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z });

  // Lo que se toma también puede matar (agua de mar con la salud por los suelos).
  if (n.health <= 0) killPlayer(sim, salty ? 'Moriste envenenado por agua de mar' : DEATH_CAUSES.wounds);
  return ok(msg);
}

/** Se quita la prenda de abrigo y la guarda en el inventario. */
export function unequipClothing(sim: Simulation): ActionResult {
  const p = sim.state.player;
  if (!p.clothing) return fail('No llevas nada de abrigo');
  if (p.sleeping) return fail('Estás durmiendo');
  const id = p.clothing;
  if (spaceFor(p.inventory, id) < 1) {
    const g = itemGender(id);
    const pron = { m: 'lo', f: 'la', mp: 'los', fp: 'las' }[g];
    return fail(`No tienes sitio en el inventario para quitárte${pron}`);
  }
  addItem(p.inventory, id, 1);
  p.clothing = null;
  return ok(`Te quitas ${itemWithArticle(id)}`);
}

/* ------------------------------------------------------------------ */
/* Mover objetos                                                       */
/* ------------------------------------------------------------------ */

/**
 * Mueve la pila `from[fromSlot]` a `to` (a `toSlot` si se indica: fusiona o intercambia).
 * Reglas: la ranura de combustible solo admite objetos que arden; no se guarda nada en obras.
 */
export function moveItem(sim: Simulation, from: InvRef, fromSlot: number, to: InvRef, toSlot?: number, qty?: number): ActionResult {
  if (sim.state.player.sleeping) return fail('Estás durmiendo');
  const src = inventoryOf(sim, from);
  const dst = inventoryOf(sim, to);
  if (!src || !dst) return fail('Ese contenedor ya no está disponible');
  if (!validSlot(src, fromSlot)) return fail('Ranura no válida');
  const s = src.slots[fromSlot];
  if (!s) return fail('No hay nada que mover');
  if (toSlot !== undefined && !validSlot(dst, toSlot)) return fail('Ranura no válida');

  const dstModule = refModule(sim, to);
  if (dstModule && dstModule.status === 'construction') return fail('No se puede guardar nada en una obra');
  if (isFuelSlot(to) && !burns(s.id)) return fail(`${capItem(s.id)} no ${pluralItem(s.id) ? 'arden' : 'arde'}: aquí solo va madera o combustible`);

  // En un intercambio, lo que vuelve al origen también debe respetar sus reglas.
  if (toSlot !== undefined) {
    const t = dst.slots[toSlot];
    if (t && t.id !== s.id) {
      if (isFuelSlot(from) && !burns(t.id)) return fail(`${capItem(t.id)} no ${pluralItem(t.id) ? 'arden: no pueden' : 'arde: no puede'} ir a la ranura de combustible`);
      const srcModule = refModule(sim, from);
      if (srcModule && srcModule.status === 'construction') return fail('No se puede guardar nada en una obra');
    }
  }

  // Sin ranura de destino dentro del mismo inventario no hay nada que hacer (se fusionaría consigo misma).
  if (src === dst && (toSlot === undefined || toSlot === fromSlot)) return fail('Ya está ahí');

  const id = s.id;
  const before = s.qty;
  // Movimiento parcial: solo `qty` unidades (p. ej. echar 3 maderas al fogón).
  if (qty !== undefined && Number.isFinite(qty) && qty >= 1 && qty < s.qty) {
    const n = Math.floor(qty);
    let left: number;
    if (toSlot === undefined) left = to.kind === 'player' && from.kind !== 'player' ? addToPlayerInventory(sim, id, n) : addItem(dst, id, n);
    else {
      const t = dst.slots[toSlot];
      if (!t) {
        dst.slots[toSlot] = { id, qty: n };
        left = 0;
      } else if (t.id === id) {
        const add = Math.min(stackLimit(id) - t.qty, n);
        t.qty += add;
        left = n - add;
      } else left = n;
    }
    const movedPart = n - left;
    if (movedPart <= 0) return fail(toSlot === undefined ? 'No hay sitio' : 'No cabe ahí');
    s.qty -= movedPart;
    if (s.qty <= 0) src.slots[fromSlot] = null;
    if (from.kind === 'crate' || to.kind === 'crate') pruneCrates(sim);
    if (dstModule?.type === 'almacen') markTutorial(sim, 'almacen');
    return movedPart < n ? ok(`Solo caben ${movedPart}× ${itemName(id)}`) : ok();
  }
  let moved: number;
  if (toSlot === undefined && to.kind === 'player' && from.kind !== 'player') {
    // Hacia el jugador sin ranura: herramientas a la barra rápida, materiales a la mochila.
    const left = addToPlayerInventory(sim, id, s.qty);
    moved = s.qty - left;
    if (moved <= 0) return fail('No hay sitio');
    s.qty = left;
    if (s.qty <= 0) src.slots[fromSlot] = null;
  } else {
    if (!moveStack(src, fromSlot, dst, toSlot)) return fail(toSlot === undefined ? 'No hay sitio' : 'No cabe ahí');
    // `moveStack` modifica la pila en su sitio: si sigue en el origen, solo se movió una parte.
    moved = src.slots[fromSlot] === s ? before - s.qty : before;
  }

  if (from.kind === 'crate' || to.kind === 'crate') pruneCrates(sim);
  if (dstModule?.type === 'almacen' && moved > 0) markTutorial(sim, 'almacen');
  if (moved < before) return ok(`Solo caben ${moved}× ${itemName(id)}`);
  return ok();
}

/** Coge todo lo que quepa de un contenedor (almacén, caja, bandeja, combustible). */
export function takeAll(sim: Simulation, from: InvRef): ActionResult {
  const p = sim.state.player;
  if (p.sleeping) return fail('Estás durmiendo');
  if (from.kind === 'player') return fail('Ya está en tu inventario');
  const inv = inventoryOf(sim, from);
  if (!inv) return fail('Ese contenedor ya no está disponible');
  let moved = 0;
  let left = 0;
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (!s) continue;
    const rest = addToPlayerInventory(sim, s.id, s.qty);
    const got = s.qty - rest;
    if (got > 0) {
      moved += got;
      sim.bus.emit('itemGained', { id: s.id, qty: got });
    }
    if (rest <= 0) inv.slots[i] = null;
    else {
      s.qty = rest;
      left += rest;
    }
  }
  if (from.kind === 'crate') pruneCrates(sim);
  if (moved === 0) return fail(left > 0 ? 'No tienes sitio en el inventario' : 'No hay nada que coger');
  return ok(left > 0 ? 'Coges lo que cabe: tu inventario está lleno' : 'Lo coges todo');
}

/** Deja una pila del jugador en una caja a sus pies (nunca se pierde nada). */
export function dropItem(sim: Simulation, slot: number): ActionResult {
  const p = sim.state.player;
  if (p.sleeping) return fail('Estás durmiendo');
  const inv = p.inventory;
  if (!validSlot(inv, slot)) return fail('Ranura no válida');
  const taken = takeFromSlot(inv, slot);
  if (!taken) return fail('No hay nada en esa ranura');
  spawnCrate(sim, { x: p.pos.x, y: p.pos.y, z: p.pos.z }, [taken], 'Objetos');
  sim.bus.emit('sfx', { name: 'soltar', x: p.pos.x, y: p.pos.y, z: p.pos.z });
  return ok(`Dejas ${taken.qty}× ${itemName(taken.id)} en una caja a tus pies`);
}

export function setHotbar(sim: Simulation, index: number): void {
  const i = Number.isFinite(index) ? Math.floor(index) : 0;
  sim.state.player.hotbar = Math.max(0, Math.min(HOTBAR_SLOTS - 1, i));
}

/* ------------------------------------------------------------------ */
/* Sueño                                                               */
/* ------------------------------------------------------------------ */

/** ¿Es hora de dormir (noche)? */
export function isSleepTime(time: number): boolean {
  const h = hourOf(time);
  return h >= SLEEP_NIGHT_FROM || h < SLEEP_NIGHT_TO;
}

/**
 * Mueble (cama, litera o camilla) de una cama concreta de un módulo, para colocar al jugador o
 * al avatar. En las literas, cada mueble tiene dos camas: `upper` indica la de arriba.
 */
export function bedProp(sim: Simulation, moduleId: number, bed: number): { prop: PropInstance; upper: boolean } | null {
  let best: PropInstance | null = null;
  for (const p of sim.layout.props) {
    if (p.moduleId !== moduleId || p.interact !== 'dormir') continue;
    if (p.index <= bed && (!best || p.index > best.index)) best = p;
  }
  if (!best) return null;
  return { prop: best, upper: best.kind === 'litera' && bed - best.index === 1 };
}

/** Distancia en planta del jugador al mueble de una cama (o Infinity si no está en su nivel). */
function distanceToBed(sim: Simulation, moduleId: number, bed: number): number {
  const b = bedProp(sim, moduleId, bed);
  if (!b) return Infinity;
  const pos = sim.state.player.pos;
  if (Math.abs(b.prop.y - pos.y) > 1.8) return Infinity;
  const dx = Math.max(0, Math.abs(pos.x - b.prop.x) - b.prop.hx);
  const dz = Math.max(0, Math.abs(pos.z - b.prop.z) - b.prop.hz);
  return Math.hypot(dx, dz);
}

/** Motivo por el que el jugador no puede dormir en esa cama ahora (o null si puede). */
export function sleepBlocker(sim: Simulation, moduleId: number, bed: number): string | null {
  const st = sim.state;
  const p = st.player;
  if (!p.alive) return 'No puedes hacer nada';
  if (p.sleeping) return 'Ya estás durmiendo';
  const m = findModule(sim, moduleId);
  if (!m) return 'Esa cama ya no existe';
  const def = MODULES[m.type];
  if (!def?.beds) return 'Aquí no hay camas';
  if (m.status === 'construction') return `${def.name}: aún está en obras`;
  if (m.status !== 'active') return `${def.name}: está ${agree(def.name, 'destrozado')}, repára${isFeminineName(def.name) ? 'la' : 'lo'} antes de dormir aquí`;
  if (m.fire > 0) return '¡Está ardiendo!';
  if (!Number.isInteger(bed) || bed < 0 || bed >= m.beds.length) return 'Esa cama no existe';
  if (distanceToBed(sim, m.id, bed) > BED_RANGE) return 'Acércate a la cama';
  const owner = m.beds[bed];
  if (owner && owner !== 'player') {
    const npc = st.npcs.find((nn) => nn.id === owner);
    if (npc && npc.awayUntil === null) return `Esa cama es de ${npc.name}`;
  }
  const sleeper = st.npcs.find((nn) => nn.activity === 'sleeping' && nn.bed?.moduleId === m.id && nn.bed.index === bed);
  if (sleeper) return `${sleeper.name} está durmiendo ahí`;
  if (fireAboard(sim)) return 'No puedes dormir con fuego a bordo';
  const n = p.needs;
  if (n.thirst < CRITICAL_NEED) return 'Tienes demasiada sed para dormir: bebe algo antes';
  if (n.hunger < CRITICAL_NEED) return 'Tienes demasiada hambre para dormir: come algo antes';
  if (n.health < CRITICAL_HEALTH && !def.healingBeds && healthRatePerHour(sim) < 0) return 'Estás demasiado mal para dormir: atiende primero tu salud';
  if (n.energy >= SLEEP_MAX_ENERGY && !isSleepTime(st.time)) {
    return `No tienes sueño (energía ${Math.round(n.energy)} %). Podrás dormir a partir de las ${SLEEP_NIGHT_FROM}:00 o cuando estés cansado`;
  }
  return null;
}

/** Se acuesta en una cama (módulo activo con camas, cama libre o propia). */
export function sleep(sim: Simulation, moduleId: number, bed: number): ActionResult {
  const why = sleepBlocker(sim, moduleId, bed);
  if (why) return fail(why);
  const p = sim.state.player;
  const m = findModule(sim, moduleId)!;
  const def = MODULES[m.type]!;
  p.sleeping = { moduleId, bed, until: null };
  markTutorial(sim, 'dormir');
  sim.bus.emit('sfx', { name: 'dormir', x: p.pos.x, y: p.pos.y + 0.5, z: p.pos.z });
  // Nombre según el nivel de mejora: «en el camarote acogedor», «de la enfermería equipada».
  const name = moduleDisplayName(m);
  if (def.healingBeds) {
    return ok(isHealingBedPowered(sim, m) ? `Te tumbas en una camilla de ${moduleWithArticle(name)}…` : `Te tumbas en una camilla de ${moduleWithArticle(name)}. Sin energía, cura como una cama normal…`);
  }
  return ok(`Te acuestas a dormir en ${moduleWithArticle(name)}…`);
}

/**
 * Despierta al jugador (si dormía). Con motivo (un sistema le despierta: demolición, alarma...)
 * se avisa como advertencia. Sin motivo es el jugador quien decide levantarse: no hay aviso y no
 * puede hacerlo mientras está desmayado (`sleeping.until` en el futuro).
 */
export function wake(sim: Simulation, reason?: string): void {
  const s = sim.state.player.sleeping;
  if (!s) return;
  if (!reason) {
    if (s.until !== null && sim.state.time < s.until) return;
    wakePlayer(sim, null);
    return;
  }
  wakePlayer(sim, reason, 'warn');
}

/* ------------------------------------------------------------------ */
/* Agua                                                                */
/* ------------------------------------------------------------------ */

/** Depósito (módulo) más cercano al jugador al alcance, o null. */
export function tankInReach(sim: Simulation): ModuleInstance | null {
  const pos = sim.state.player.pos;
  let best: ModuleInstance | null = null;
  let bestD = Infinity;
  for (const prop of sim.layout.props) {
    if (prop.interact !== 'deposito') continue;
    if (Math.abs(prop.y - pos.y) > 1.8) continue;
    const m = findModule(sim, prop.moduleId);
    if (!m || m.status === 'construction') continue;
    const dx = Math.max(0, Math.abs(pos.x - prop.x) - prop.hx);
    const dz = Math.max(0, Math.abs(pos.z - prop.z) - prop.hz);
    const d = Math.hypot(dx, dz);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  return bestD <= TANK_RANGE ? best : null;
}

/** Comprueba que el jugador puede usar un depósito ahora (o devuelve el motivo). */
function tankBlocker(sim: Simulation): string | null {
  const p = sim.state.player;
  if (!p.alive) return 'No puedes hacer nada';
  if (p.sleeping) return 'Estás durmiendo';
  if (!sim.state.ship.modules.some((m) => m.type === 'deposito' && m.status !== 'construction')) return 'No hay ningún depósito de agua a bordo';
  if (!tankInReach(sim)) return 'Acércate a un depósito de agua';
  if (sim.state.utilities.waterL < WATER_PER_DRINK) return 'El depósito está vacío: hace falta lluvia o una potabilizadora';
  return null;
}

/** Bebe directamente del depósito (1 L → sed +40). */
export function drinkFromTank(sim: Simulation): ActionResult {
  const why = tankBlocker(sim);
  if (why) return fail(why);
  const p = sim.state.player;
  if (p.needs.thirst >= 99) return fail('No tienes sed');
  const u = sim.state.utilities;
  u.waterL = Math.max(0, u.waterL - WATER_PER_DRINK);
  p.needs.thirst = clamp(p.needs.thirst + TANK_DRINK_THIRST, 0, 100);
  markTutorial(sim, 'beber');
  sim.bus.emit('sfx', { name: 'beber', x: p.pos.x, y: p.pos.y + 1.5, z: p.pos.z });
  return ok(`Bebes agua del depósito (quedan ${Math.floor(u.waterL)} L)`);
}

/** Llena una botella en el depósito (1 L → 1 Botella de agua). */
export function fillBottle(sim: Simulation): ActionResult {
  const why = tankBlocker(sim);
  if (why) return fail(why);
  const p = sim.state.player;
  if (spaceFor(p.inventory, 'agua_potable') < 1) return fail('No tienes sitio en el inventario para otra botella');
  const u = sim.state.utilities;
  u.waterL = Math.max(0, u.waterL - WATER_PER_DRINK);
  addItem(p.inventory, 'agua_potable', 1);
  sim.bus.emit('itemGained', { id: 'agua_potable', qty: 1 });
  markTutorial(sim, 'beber');
  sim.bus.emit('sfx', { name: 'llenar', x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
  return ok(`Llenas una botella de agua (quedan ${Math.floor(u.waterL)} L)`);
}

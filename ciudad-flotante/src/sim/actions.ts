/**
 * [AGENTE sim-survival] ACCIONES DEL JUGADOR sobre objetos, inventarios, sueño y agua
 * (docs/SISTEMAS.md §1).
 *
 * - `useItem`: comer/beber/curarse (efectos, enfermedad por probabilidad, cura, objeto que queda),
 *   estudiar planos (desbloqueo), ponerse ropa (intercambia con la que hubiera) y herramientas
 *   (se seleccionan en la barra rápida, no se consumen).
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
import { HOTBAR_SLOTS, INTERACT_RANGE, WATER_PER_DRINK } from './constants';
import { findModule, giveToPlayer, itemName, pruneCrates, spawnCrate } from './helpers';
import { addItem, moveStack, spaceFor, takeFromSlot } from './inventory';
import { CRITICAL_HEALTH, CRITICAL_NEED, DEATH_CAUSES, SICK_HOURS, fireAboard, healthRatePerHour, killPlayer, wakePlayer } from './needs';
import type { ActionResult, InvRef, Simulation } from './Simulation';
import { hourOf } from './time';
import type { PropInstance } from './ship';
import { markTutorial } from './tutorial';
import type { Inventory, ModuleInstance } from './types';

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

/** Artículo determinado aproximado para nombres de objetos ("el pescado asado", "las hortalizas"). */
function withArt(name: string): string {
  const first = (name.split(/\s+/)[0] ?? '').toLowerCase();
  const plural = /[^íéáóú]s$/.test(first);
  const fem = /(a|as|ción|ciones|dad|dades)$/.test(first);
  const art = plural ? (fem ? 'las' : 'los') : fem ? 'la' : 'el';
  return `${art} ${name.charAt(0).toLowerCase()}${name.slice(1)}`;
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
  if (def.category === 'ropa') return equipClothing(sim, slot, def);
  if (def.consume) return consumeItem(sim, slot, def);

  switch (def.category) {
    case 'herramienta':
      if (slot < HOTBAR_SLOTS) {
        setHotbar(sim, slot);
        return ok(`Llevas ${withArt(def.name)} en la mano`);
      }
      return fail('Selecciónala en la barra rápida: muévela a una de las 8 primeras ranuras');
    case 'semilla':
      return fail('Las semillas se plantan en un huerto (E sobre un bancal)');
    case 'combustible':
      return fail('Échalo en la ranura de combustible de la cocina o del generador');
    case 'pieza':
      return fail('Es un repuesto: se gasta al reparar instalaciones');
    case 'material':
      return fail('Es un material: sirve para fabricar y construir');
    default:
      return fail('Esto no se puede usar');
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

function equipClothing(sim: Simulation, slot: number, def: ItemDef): ActionResult {
  const p = sim.state.player;
  const inv = p.inventory;
  const old = p.clothing;
  takeFromSlot(inv, slot, 1);
  p.clothing = def.id;
  let msg = `Te pones ${withArt(def.name)}`;
  if (old) {
    // La prenda anterior vuelve a la misma ranura (o donde quepa; si no, a una caja a los pies).
    if (!inv.slots[slot]) inv.slots[slot] = { id: old, qty: 1 };
    else giveToPlayer(sim, old, 1);
    msg += ` y guardas ${withArt(itemName(old))}`;
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

  let msg = salty ? 'Bebes agua salada: ¡puaj! Te deja más sediento' : `${verb2(c.verb)} ${withArt(def.name)}`;
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
  if (spaceFor(p.inventory, id) < 1) return fail('No tienes sitio en el inventario para quitártelo');
  addItem(p.inventory, id, 1);
  p.clothing = null;
  return ok(`Te quitas ${withArt(itemName(id))}`);
}

/* ------------------------------------------------------------------ */
/* Mover objetos                                                       */
/* ------------------------------------------------------------------ */

/**
 * Mueve la pila `from[fromSlot]` a `to` (a `toSlot` si se indica: fusiona o intercambia).
 * Reglas: la ranura de combustible solo admite objetos que arden; no se guarda nada en obras.
 */
export function moveItem(sim: Simulation, from: InvRef, fromSlot: number, to: InvRef, toSlot?: number): ActionResult {
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
  if (isFuelSlot(to) && !burns(s.id)) return fail(`${itemName(s.id)} no arde: aquí solo va madera o combustible`);

  // En un intercambio, lo que vuelve al origen también debe respetar sus reglas.
  if (toSlot !== undefined) {
    const t = dst.slots[toSlot];
    if (t && t.id !== s.id) {
      if (isFuelSlot(from) && !burns(t.id)) return fail(`${itemName(t.id)} no arde: no puede ir a la ranura de combustible`);
      const srcModule = refModule(sim, from);
      if (srcModule && srcModule.status === 'construction') return fail('No se puede guardar nada en una obra');
    }
  }

  // Sin ranura de destino dentro del mismo inventario no hay nada que hacer (se fusionaría consigo misma).
  if (src === dst && (toSlot === undefined || toSlot === fromSlot)) return fail('Ya está ahí');

  const id = s.id;
  const before = s.qty;
  if (!moveStack(src, fromSlot, dst, toSlot)) return fail(toSlot === undefined ? 'No hay sitio' : 'No cabe ahí');
  // `moveStack` modifica la pila en su sitio: si sigue en el origen, solo se movió una parte.
  const moved = src.slots[fromSlot] === s ? before - s.qty : before;

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
    const rest = addItem(p.inventory, s.id, s.qty);
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
  if (m.status !== 'active') return `${def.name}: está destrozado, repáralo antes de dormir aquí`;
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
  return ok(def.healingBeds ? 'Te tumbas en una camilla de la enfermería…' : `Te acuestas a dormir en ${withArt(def.name)}…`);
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

/**
 * [AGENTE sim-life] RESTOS FLOTANTES, PESCA Y CUBO (docs/SISTEMAS.md §9).
 *
 * - Los restos aparecen por delante de la proa (x ≈ proa + 60 m) a 3–26 m del costado, a razón de
 *   `región.debrisPerHour` (proceso de Poisson con `sim.rng`), con su botín ya tirado (`DEBRIS_LOOT`).
 *   Derivan hacia popa a `VISUAL_DRIFT × velocidad / 6` m/min más una corriente suave, de modo que con
 *   el barco fondeado quedan casi quietos (entonces aparecen lejos por el costado y la corriente los
 *   acerca despacio). Como máximo `MAX_DEBRIS` restos "normales" a la vez (los de
 *   un naufragio o una balsa de náufragos no cuentan). Se eliminan al quedar muy atrás de la popa.
 * - `collectDebris` (gancho del jugador) y `collectDebrisFor` (también lo usan los habitantes
 *   recolectores): botín al jugador (cajas a sus pies si no cabe) o a los almacenes; las balsas suben
 *   a sus náufragos a bordo (`spawnSurvivor`) y cierran el evento asociado.
 * - Pesca: `fishBiteDelay` (8–22 s ÷ región.fishMult ÷ 2,5 con banco de peces) y `catchFish`
 *   (85 % pescado —20 % dos—, 6 % chatarra, 4 % tela, 3 % conserva, 2 % cuerda).
 * - `fillBucket`: cubo vacío → cubo de agua de mar (desde la borda).
 *
 * Todo el azar sale de `sim.rng`.
 */
import { clamp } from '../core/math';
import { DEBRIS_LOOT } from '../data/loot';
import { REGIONS, START_REGION, type RegionDef } from '../data/regions';
import { CELL, HOOK_RANGE, RAIL_USE_RANGE, SHIP_ORIGIN_X, VISUAL_DRIFT } from './constants';
import { depositToStorage, giveToPlayer, itemName, spawnCrate, stacksText } from './helpers';
import { countItem } from './inventory';
import { cellAtPoint, halfWidthM, levelOfY } from './ship';
import type { ActionResult, Simulation } from './Simulation';
import { markTutorial } from './tutorial';
import type { Debris, DebrisKind, ItemId, ItemStack, Vec2, Vec3 } from './types';
import { onDebrisCollected, onDebrisLost, onFishCaught, isFishBankActive } from './events';
import { spawnSurvivor } from './npc';

/* ------------------------------------------------------------------ */
/* Parámetros de equilibrio                                            */
/* ------------------------------------------------------------------ */

/** Máximo de restos "normales" (sin evento) flotando a la vez. */
export const MAX_DEBRIS = 14;
/** Máximo absoluto (incluidos naufragios y balsas). */
export const MAX_DEBRIS_TOTAL = 32;
/** Distancia por delante de la proa a la que aparecen (m). */
export const DEBRIS_SPAWN_AHEAD: readonly [number, number] = [52, 68];
/** Distancia al costado a la que aparecen (m, desde el borde del casco). */
export const DEBRIS_SIDE: readonly [number, number] = [3, 26];
/** Se eliminan al quedar esta distancia por detrás de la popa (m). */
export const DEBRIS_REMOVE_BEHIND = 40;
/** Corriente marina (m/min) que arrastra los restos hacia popa aunque el barco esté fondeado. */
export const SEA_CURRENT = 0.12;
/** Distancia mínima al costado (m) a la que puede flotar un resto (no se mete en el casco). */
export const HULL_CLEARANCE = 1.6;
/** Ritmo de aparición con el barco fondeado (fracción del normal). */
const ANCHORED_SPAWN_FACTOR = 0.3;
/** Fondeados: distancia al costado a la que aparecen (m) y corriente lateral hacia el casco (m/min). */
export const ANCHORED_SIDE: readonly [number, number] = [18, 30];
export const ANCHORED_INFLOW: readonly [number, number] = [0.06, 0.14];
/** Alcance real del gancho (generoso, ver SISTEMAS.md §9). */
export const COLLECT_RANGE = HOOK_RANGE + 6;
/** Tiempo de picada (minutos de juego = segundos reales) sin modificadores. */
export const BITE_DELAY: readonly [number, number] = [8, 22];
/** Divisor del tiempo de picada durante un banco de peces. */
export const FISH_BANK_FACTOR = 2.5;

/** Nombres para los mensajes. */
export const DEBRIS_NAMES: Record<DebrisKind, string> = {
  tablones: 'Tablones',
  barril: 'Barril',
  caja: 'Caja flotante',
  restos: 'Restos metálicos',
  red: 'Red de pesca',
  bidon: 'Bidón',
  balsa: 'Balsa de náufragos',
  cofre: 'Cofre',
};

/** Tabla de capturas de la caña (probabilidades acumuladas en orden). */
export const CATCH_TABLE: readonly { id: ItemId; p: number }[] = [
  { id: 'pescado_crudo', p: 0.85 },
  { id: 'chatarra', p: 0.06 },
  { id: 'tela', p: 0.04 },
  { id: 'conserva', p: 0.03 },
  { id: 'cuerda', p: 0.02 },
];
/** Probabilidad de que un pez venga doble. */
export const DOUBLE_FISH_CHANCE = 0.2;

const fail = (msg: string): ActionResult => ({ ok: false, msg });

/* ------------------------------------------------------------------ */
/* Geometría del casco (borde de la cubierta)                          */
/* ------------------------------------------------------------------ */

/** Límites del casco en metros locales (popa, proa y media manga de la cuadrícula). */
export function hullBounds(sim: Simulation): { sternX: number; bowX: number; halfW: number } {
  const ship = sim.state.ship;
  return { sternX: -SHIP_ORIGIN_X, bowX: ship.length * CELL - SHIP_ORIGIN_X, halfW: halfWidthM(ship.width) };
}

/** Distancia (m, en planta) de un punto al borde exterior de la cubierta. */
export function distanceToEdge(sim: Simulation, x: number, z: number): number {
  const b = hullBounds(sim);
  return Math.min(b.halfW - Math.abs(z), b.bowX - x, x - b.sternX);
}

/** ¿El punto está al aire libre en una cubierta (nivel ≥ 1, no en una habitación)? */
export function onOpenDeck(sim: Simulation, pos: Vec3): boolean {
  if (levelOfY(pos.y) < 1) return false;
  const cell = cellAtPoint(sim.layout, pos.x, pos.y, pos.z);
  return !!cell && cell.walkable && !cell.indoor;
}

/**
 * Motivo por el que no se puede usar la borda (pescar, llenar el cubo) desde `pos`, o null si se
 * puede. La interfaz puede usarlo para el aviso en pantalla.
 */
export function railBlocker(sim: Simulation, pos: Vec3 = sim.state.player.pos): string | null {
  if (levelOfY(pos.y) < 1) return 'Sube a cubierta: desde la bodega no se alcanza el agua';
  if (!onOpenDeck(sim, pos)) return 'Sal a cubierta y acércate a la borda';
  if (distanceToEdge(sim, pos.x, pos.z) > RAIL_USE_RANGE + 0.5) return 'Acércate a la borda';
  return null;
}

/* ------------------------------------------------------------------ */
/* Botín                                                               */
/* ------------------------------------------------------------------ */

/** Tira el botín de un tipo de resto (nunca vacío). `rich` multiplica las cantidades (naufragios). */
export function rollLoot(sim: Simulation, kind: DebrisKind, rich = 1): ItemStack[] {
  const table = DEBRIS_LOOT[kind] ?? [];
  const out: ItemStack[] = [];
  for (const e of table) {
    if (!sim.rng.chance(e.chance)) continue;
    const q = Math.max(1, Math.round(sim.rng.int(e.min, e.max) * rich));
    out.push({ id: e.id, qty: q });
  }
  if (!out.length && table.length) {
    // Nunca un resto vacío: lo más probable de la tabla, con su mínimo.
    const best = [...table].sort((a, b) => b.chance - a.chance)[0]!;
    out.push({ id: best.id, qty: Math.max(1, best.min) });
  }
  return out;
}

function regionOf(sim: Simulation): RegionDef {
  return REGIONS[sim.state.voyage.regionId] ?? REGIONS[START_REGION]!;
}

function isAnchored(sim: Simulation): boolean {
  const a = sim.state.voyage.anchoredUntil;
  return a !== null && a > sim.state.time;
}

/** Velocidad de deriva (m/min) hacia popa según la velocidad del barco. */
export function driftSpeed(sim: Simulation): number {
  const knots = Math.max(0, Number.isFinite(sim.state.voyage.speed) ? sim.state.voyage.speed : 0);
  return (VISUAL_DRIFT * knots) / 6 + SEA_CURRENT;
}

/* ------------------------------------------------------------------ */
/* Aparición                                                           */
/* ------------------------------------------------------------------ */

export interface SpawnDebrisOptions {
  loot?: ItemStack[];
  survivors?: number;
  eventId?: number;
  /** Deriva lateral propia (m/min). Por defecto, aleatoria y suave. */
  lateral?: number;
}

/** Crea un resto flotante en `pos` (coordenadas del barco). Lo mantiene fuera del casco. */
export function spawnDebris(sim: Simulation, kind: DebrisKind, pos: Vec2, opts: SpawnDebrisOptions = {}): Debris {
  const b = hullBounds(sim);
  const z = Math.abs(pos.z) < b.halfW + HULL_CLEARANCE ? Math.sign(pos.z || 1) * (b.halfW + HULL_CLEARANCE) : pos.z;
  const d: Debris = {
    id: sim.nextId(),
    kind,
    pos: { x: pos.x, z },
    vel: { x: -driftSpeed(sim), z: opts.lateral ?? sim.rng.range(-0.06, 0.06) },
    loot: opts.loot ?? rollLoot(sim, kind),
    spin: sim.rng.range(0, Math.PI * 2),
  };
  if (opts.survivors !== undefined && opts.survivors > 0) d.survivors = Math.floor(opts.survivors);
  if (opts.eventId !== undefined) d.eventId = opts.eventId;
  sim.state.debris.push(d);
  return d;
}

/** Restos sin evento asociado (los que cuentan para el límite normal). */
function ambientCount(sim: Simulation): number {
  let n = 0;
  for (const d of sim.state.debris) if (d.eventId === undefined && !d.survivors) n++;
  return n;
}

/**
 * Hace aparecer un resto normal de la región por delante de la proa. Con el barco fondeado apenas
 * hay deriva longitudinal, así que aparecen lejos por el costado (18–30 m) y la corriente los
 * acerca despacio hacia el casco: llegan flotando en vez de surgir junto a la borda.
 */
export function spawnAmbientDebris(sim: Simulation): Debris | null {
  if (ambientCount(sim) >= MAX_DEBRIS || sim.state.debris.length >= MAX_DEBRIS_TOTAL) return null;
  const region = regionOf(sim);
  const kind = (sim.rng.weighted(region.debrisWeights) ?? 'tablones') as DebrisKind;
  const b = hullBounds(sim);
  const side = sim.rng.chance(0.5) ? 1 : -1;
  if (isAnchored(sim)) {
    const z = side * (b.halfW + sim.rng.range(ANCHORED_SIDE[0], ANCHORED_SIDE[1]));
    const x = sim.rng.range(b.sternX + 2, b.bowX + 30);
    return spawnDebris(sim, kind, { x, z }, { lateral: -side * sim.rng.range(ANCHORED_INFLOW[0], ANCHORED_INFLOW[1]) });
  }
  const z = side * (b.halfW + sim.rng.range(DEBRIS_SIDE[0], DEBRIS_SIDE[1]));
  const x = b.bowX + sim.rng.range(DEBRIS_SPAWN_AHEAD[0], DEBRIS_SPAWN_AHEAD[1]);
  return spawnDebris(sim, kind, { x, z });
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

export function tickDebris(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  const region = regionOf(sim);

  // Aparición (Poisson): probabilidad por paso = ritmo × dt.
  const perMin = Math.max(0, region.debrisPerHour) / 60;
  const rate = perMin * (isAnchored(sim) ? ANCHORED_SPAWN_FACTOR : 1);
  if (rate > 0 && sim.rng.chance(Math.min(1, rate * dt))) spawnAmbientDebris(sim);

  // Deriva.
  const b = hullBounds(sim);
  const drift = driftSpeed(sim);
  const minAbsZ = b.halfW + HULL_CLEARANCE;
  for (const d of st.debris) {
    if (!Number.isFinite(d.pos.x) || !Number.isFinite(d.pos.z)) {
      d.pos.x = b.sternX - DEBRIS_REMOVE_BEHIND - 1; // se eliminará abajo
      continue;
    }
    const lateral = Number.isFinite(d.vel.z) ? clamp(d.vel.z, -0.3, 0.3) : 0;
    d.vel.x = -drift;
    d.vel.z = lateral;
    d.pos.x += d.vel.x * dt;
    d.pos.z += lateral * dt;
    // Nunca dentro del casco: si la deriva lateral lo acerca, rebota hacia fuera.
    if (Math.abs(d.pos.z) < minAbsZ && d.pos.x > b.sternX - 3 && d.pos.x < b.bowX + 9) {
      const s = Math.sign(d.pos.z) || 1;
      d.pos.z = s * minAbsZ;
      d.vel.z = s * Math.abs(lateral);
    }
  }

  // Eliminación de los que quedan atrás o se alejan demasiado.
  const gone: Debris[] = [];
  st.debris = st.debris.filter((d) => {
    const keep = d.pos.x >= b.sternX - DEBRIS_REMOVE_BEHIND && Math.abs(d.pos.z) <= b.halfW + 70;
    if (!keep) gone.push(d);
    return keep;
  });
  for (const d of gone) onDebrisLost(sim, d);
}

/* ------------------------------------------------------------------ */
/* Recogida                                                            */
/* ------------------------------------------------------------------ */

export interface CollectResult extends ActionResult {
  items?: ItemStack[];
  survivors?: string[];
}

/**
 * Saca un resto del agua (sin comprobaciones de alcance: eso lo hacen los llamantes).
 * - Jugador: el botín va a su inventario (lo que no quepa, a una caja a sus pies).
 * - Habitante: el botín va a los almacenes (lo que no quepa, a una caja en `dropAt`).
 * Las balsas suben a sus náufragos (que se unen a la tripulación) cerca de `dropAt`.
 */
export function collectDebrisFor(sim: Simulation, debrisId: number, by: 'player' | 'npc', dropAt: Vec3): CollectResult {
  const st = sim.state;
  const idx = st.debris.findIndex((d) => d.id === debrisId);
  if (idx < 0) return fail('Ese resto ya no está al alcance');
  const d = st.debris[idx]!;
  st.debris.splice(idx, 1);

  const items = d.loot.filter((s) => s.qty > 0).map((s) => ({ ...s }));
  let note = '';
  if (by === 'player') {
    let allFit = true;
    for (const s of items) allFit = giveToPlayer(sim, s.id, s.qty, true) && allFit;
    if (!allFit) note = ' (no cabía todo: el resto está en una caja a tus pies)';
    st.player.stats.debrisCollected++;
    markTutorial(sim, 'gancho');
  } else {
    const left: ItemStack[] = [];
    for (const s of items) {
      const l = depositToStorage(sim, s.id, s.qty);
      if (l > 0) left.push({ id: s.id, qty: l });
    }
    if (left.length) spawnCrate(sim, dropAt, left, 'Restos rescatados');
  }

  const names: string[] = [];
  const survivors = Math.max(0, Math.floor(d.survivors ?? 0));
  for (let i = 0; i < survivors; i++) {
    const npc = spawnSurvivor(sim, { pos: dropAt, origin: 'balsa' });
    if (npc) names.push(npc.name);
  }
  onDebrisCollected(sim, d, by, names);

  sim.bus.emit('sfx', { name: survivors > 0 ? 'rescate' : 'recoger_resto', x: d.pos.x, y: 1, z: d.pos.z });
  let msg: string;
  if (names.length) {
    const who = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
    msg = `¡Subes a bordo a ${who}!`;
    if (items.length) msg += ` También recuperas ${stacksText(items)}`;
  } else {
    msg = items.length ? `Recuperas ${stacksText(items)}` : `Recuperas ${DEBRIS_NAMES[d.kind].toLowerCase()} vacío`;
  }
  return { ok: true, msg: msg + note, items, survivors: names };
}

/** El jugador recoge un resto con el gancho. */
export function collectDebris(sim: Simulation, debrisId: number): ActionResult {
  const st = sim.state;
  const p = st.player;
  if (!p.alive) return fail('No puedes hacer nada');
  if (p.sleeping) return fail('Estás durmiendo');
  const d = st.debris.find((dd) => dd.id === debrisId);
  if (!d) return fail('Ese resto ya no está al alcance');
  if (countItem(p.inventory, 'gancho') < 1) return fail('Necesitas un gancho de rescate');
  if (!onOpenDeck(sim, p.pos)) return fail('Sal a cubierta para lanzar el gancho');
  const dist = Math.hypot(d.pos.x - p.pos.x, d.pos.z - p.pos.z);
  if (dist > COLLECT_RANGE) return fail('Demasiado lejos: espera a que se acerque');
  return collectDebrisFor(sim, debrisId, 'player', { x: p.pos.x, y: p.pos.y, z: p.pos.z });
}

/* ------------------------------------------------------------------ */
/* Pesca                                                               */
/* ------------------------------------------------------------------ */

/** Multiplicador de pesca actual (región y banco de peces). */
export function fishingMultiplier(sim: Simulation): number {
  const r = regionOf(sim);
  return Math.max(0.1, r.fishMult) * (isFishBankActive(sim) ? FISH_BANK_FACTOR : 1);
}

/** Segundos reales (= minutos de juego) hasta la próxima picada. */
export function fishBiteDelay(sim: Simulation): number {
  return sim.rng.range(BITE_DELAY[0], BITE_DELAY[1]) / fishingMultiplier(sim);
}

/** Tira una captura de la caña. */
export function rollCatch(sim: Simulation): ItemStack {
  let r = sim.rng.next();
  let id: ItemId = 'pescado_crudo';
  for (const e of CATCH_TABLE) {
    if (r < e.p) {
      id = e.id;
      break;
    }
    r -= e.p;
  }
  const qty = id === 'pescado_crudo' && sim.rng.chance(DOUBLE_FISH_CHANCE) ? 2 : 1;
  return { id, qty };
}

/** El jugador recoge el sedal en el momento justo: captura (necesita caña y estar en la borda). */
export function catchFish(sim: Simulation): ActionResult {
  const p = sim.state.player;
  if (!p.alive) return fail('No puedes hacer nada');
  if (p.sleeping) return fail('Estás durmiendo');
  if (countItem(p.inventory, 'cana') < 1) return fail('Necesitas una caña de pescar');
  const why = railBlocker(sim, p.pos);
  if (why) return fail(why);
  const c = rollCatch(sim);
  const fit = giveToPlayer(sim, c.id, c.qty, true);
  const fish = c.id === 'pescado_crudo' ? c.qty : 0;
  p.stats.fishCaught += fish;
  if (fish > 0) onFishCaught(sim, fish);
  markTutorial(sim, 'pescar');
  sim.bus.emit('sfx', { name: fish > 0 ? 'pez' : 'pesca_basura', x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
  const note = fit ? '' : ' (inventario lleno: está en una caja a tus pies)';
  if (fish === 2) return { ok: true, msg: `¡Doble captura! 2× ${itemName(c.id)}${note}` };
  if (fish === 1) return { ok: true, msg: `¡Pescas un pescado!${note}` };
  return { ok: true, msg: `Sacas del agua ${c.qty}× ${itemName(c.id)} enredado en el anzuelo${note}` };
}

/* ------------------------------------------------------------------ */
/* Cubo                                                                */
/* ------------------------------------------------------------------ */

/** Ranura de un objeto en el inventario del jugador, prefiriendo la ranura activa de la barra. */
export function playerSlotOf(sim: Simulation, id: ItemId): number {
  const p = sim.state.player;
  const sel = p.inventory.slots[p.hotbar];
  if (sel && sel.id === id) return p.hotbar;
  return p.inventory.slots.findIndex((s) => !!s && s.id === id);
}

/** Llena un cubo vacío con agua de mar desde la borda. */
export function fillBucket(sim: Simulation): ActionResult {
  const p = sim.state.player;
  if (!p.alive) return fail('No puedes hacer nada');
  if (p.sleeping) return fail('Estás durmiendo');
  const slot = playerSlotOf(sim, 'cubo');
  if (slot < 0) return fail(countItem(p.inventory, 'cubo_agua') > 0 ? 'El cubo ya está lleno' : 'Necesitas un cubo vacío');
  const why = railBlocker(sim, p.pos);
  if (why) return fail(why);
  const s = p.inventory.slots[slot]!;
  if (s.qty > 1) {
    s.qty -= 1;
    giveToPlayer(sim, 'cubo_agua', 1);
  } else {
    p.inventory.slots[slot] = { id: 'cubo_agua', qty: 1 };
  }
  sim.bus.emit('sfx', { name: 'llenar_cubo', x: p.pos.x, y: p.pos.y + 1, z: p.pos.z });
  return { ok: true, msg: 'Llenas el cubo de agua de mar: sirve para apagar fuegos o destilarla en la cocina' };
}

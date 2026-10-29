/**
 * [AGENTE game-player] TEXTOS DE LOS AVISOS DE INTERACCIÓN (puro, sin three.js).
 *
 * Traduce el objetivo enfocado (mueble, habitante, caja, obra) a un aviso legible:
 * "E · Abrir el almacén — 12/20 huecos ocupados". También decide en qué cama de un mueble
 * (las literas tienen dos) se acostaría el jugador.
 *
 * Interacciones físicas: en los objetivos de uso frecuente, pulsar E hace la acción directa
 * (beber del depósito, cosechar o limpiar un bancal, coger todo lo de una caja) y mantener E
 * abre el panel con el resto de opciones (`propQuick`, `crateQuick`).
 */
import { HULL_EXPANSION, moduleDef, type InteractKind } from '../../data/modules';
import { sleepBlocker } from '../../sim/actions';
import { WATER_PER_DRINK } from '../../sim/constants';
import { findModule } from '../../sim/helpers';
import { addItem, cloneInventory } from '../../sim/inventory';
import type { PropInstance } from '../../sim/ship';
import type { Simulation } from '../../sim/Simulation';
import type { LooseCrate, ModuleInstance, NpcState } from '../../sim/types';
import type { PromptInfo } from '../types';

/** Panel o acción directa que corresponde a cada tipo de mueble interactivo. */
export type PropAction = { kind: 'station'; moduleId: number } | { kind: 'helm' } | { kind: 'sleep'; moduleId: number; bed: number };

/** Acción directa de la tecla E (pulsar); mantener E abre el panel. */
export type QuickAction =
  | { kind: 'drink'; moduleId: number }
  | { kind: 'take'; crateId: number }
  | { kind: 'harvest'; moduleId: number; plot: number }
  | { kind: 'tend'; moduleId: number; plot: number };

/** Lo que se abre al mantener E en vez de la acción directa (texto del aviso). */
const HOLD_TEXT: Record<QuickAction['kind'], string> = {
  drink: 'Ver el depósito',
  take: 'Abrir la caja',
  harvest: 'Ver el bancal',
  tend: 'Ver el bancal',
};
const HOLD_SUB: Record<QuickAction['kind'], string> = {
  drink: 'Mantén E: ver el depósito',
  take: 'Mantén E: abrir la caja',
  harvest: 'Mantén E: ver el bancal',
  tend: 'Mantén E: ver el bancal',
};

/** Acción directa de un mueble (null = E abre el panel al momento). */
export function propQuick(sim: Simulation, prop: PropInstance): QuickAction | null {
  if (prop.interact !== 'deposito' && prop.interact !== 'huerto') return null;
  const m = findModule(sim, prop.moduleId);
  if (!m || m.status === 'construction') return null;
  if (prop.interact === 'deposito') return { kind: 'drink', moduleId: m.id };
  const p = m.plots[prop.index];
  if (!p) return null;
  // Plantas secas o plaga: se limpian; cultivo maduro: se cosecha. Vacío o creciendo: el panel.
  if (p.dead || (p.pest && !(p.crop && p.growth >= 1))) return { kind: 'tend', moduleId: m.id, plot: prop.index };
  if (p.crop && p.growth >= 1) return { kind: 'harvest', moduleId: m.id, plot: prop.index };
  return null;
}

/** ¿Cabe todo el contenido de la caja en el inventario del jugador? */
export function crateFits(sim: Simulation, crate: LooseCrate): boolean {
  const inv = cloneInventory(sim.state.player.inventory);
  for (const s of crate.inventory.slots) if (s && addItem(inv, s.id, s.qty) > 0) return false;
  return true;
}

/** Caja suelta: si cabe todo, E lo coge de una vez; si no, E abre la caja para elegir. */
export function crateQuick(sim: Simulation, crate: LooseCrate): QuickAction | null {
  if (!crate.inventory.slots.some((s) => !!s)) return null;
  return crateFits(sim, crate) ? { kind: 'take', crateId: crate.id } : null;
}

/** Aviso mientras se mantiene E (anillo de progreso hasta abrir el panel). */
export function holdPrompt(q: QuickAction, progress: number): PromptInfo {
  return { key: 'Mantén E', text: HOLD_TEXT[q.kind], progress: Math.max(0, Math.min(1, progress)) };
}

/** Cama que usaría el jugador en un mueble: la suya, una libre, la de alguien ausente o la primera. */
export function chooseBed(sim: Simulation, prop: PropInstance): number {
  const m = findModule(sim, prop.moduleId);
  const beds = prop.kind === 'litera' ? [prop.index, prop.index + 1] : [prop.index];
  if (!m) return beds[0]!;
  const valid = beds.filter((b) => b >= 0 && b < m.beds.length);
  if (!valid.length) return beds[0]!;
  const mine = valid.find((b) => m.beds[b] === 'player');
  if (mine !== undefined) return mine;
  const sleeperIn = (b: number): boolean => sim.state.npcs.some((n) => n.activity === 'sleeping' && n.bed?.moduleId === m.id && n.bed.index === b);
  const free = valid.find((b) => m.beds[b] === null && !sleeperIn(b));
  if (free !== undefined) return free;
  const away = valid.find((b) => {
    const owner = m.beds[b];
    const npc = sim.state.npcs.find((n) => n.id === owner);
    return !!npc && npc.awayUntil !== null && !sleeperIn(b);
  });
  return away ?? valid[0]!;
}

/** Qué hace la tecla E sobre un mueble. */
export function propAction(sim: Simulation, prop: PropInstance): PropAction | null {
  if (!prop.interact) return null;
  if (prop.interact === 'timon') return { kind: 'helm' };
  if (prop.interact === 'dormir') return { kind: 'sleep', moduleId: prop.moduleId, bed: chooseBed(sim, prop) };
  return { kind: 'station', moduleId: prop.moduleId };
}

const VERB: Record<Exclude<InteractKind, 'dormir'>, string> = {
  cocina: 'Usar la cocina',
  almacen: 'Abrir el almacén',
  banco: 'Usar el banco de trabajo',
  taller: 'Usar el taller mecánico',
  huerto: 'Atender el bancal',
  colector: 'Ver el colector de lluvia',
  deposito: 'Beber',
  potabilizadora: 'Manejar la potabilizadora',
  generador: 'Manejar el generador',
  bateria: 'Ver las baterías',
  panel: 'Ver el panel solar',
  timon: 'Timón: rumbo y avistamientos',
  motor: 'Manejar el motor auxiliar',
  ahumadero: 'Usar el ahumadero',
  vivero: 'Ver el vivero',
  grua: 'Manejar la grúa',
  radar: 'Escuchar la radio',
};

function usedSlots(m: ModuleInstance): string {
  const inv = m.inventory;
  if (!inv) return '';
  const used = inv.slots.filter((s) => !!s).length;
  return `${used}/${inv.slots.length} huecos ocupados`;
}

function onOff(m: ModuleInstance): string {
  if (!m.on) return 'Apagado';
  return m.powered ? 'Encendido' : 'Encendido, sin energía';
}

/** Estado del módulo que conviene saber antes de usarlo (avería, fuego…). */
function moduleWarning(m: ModuleInstance): string | null {
  if (m.fire > 0) return `¡Está ardiendo! (${Math.round(m.fire)} %)`;
  if (m.status === 'broken') return `Averiado: ${m.brokenReason ?? 'necesita reparación'}`;
  if (m.leak) return 'Pierde agua: hay una fuga';
  if (m.condition < 50) return `Dañado (${Math.round(m.condition)} %): conviene repararlo`;
  return null;
}

/** Aviso de un mueble interactivo. */
export function propPrompt(sim: Simulation, prop: PropInstance): PromptInfo | null {
  const m = findModule(sim, prop.moduleId);
  if (!m || !prop.interact) return null;
  const st = sim.state;
  const def = moduleDef(m.type);
  const warn = moduleWarning(m);
  const join = (...parts: (string | null | undefined)[]): string | undefined => {
    const s = parts.filter((p) => !!p).join(' · ');
    return s || undefined;
  };
  switch (prop.interact) {
    case 'dormir': {
      const bed = chooseBed(sim, prop);
      const why = sleepBlocker(sim, m.id, bed);
      const upper = prop.kind === 'litera' ? (bed - prop.index === 1 ? ' (litera de arriba)' : ' (litera de abajo)') : '';
      const owner = m.beds[bed];
      const npc = owner && owner !== 'player' ? st.npcs.find((n) => n.id === owner) : null;
      const whose = owner === 'player' ? 'Tu cama' : npc ? `Cama de ${npc.name}` : 'Cama libre';
      return { key: 'E', text: `Dormir${upper}`, sub: why ?? join(whose, def.healingBeds ? 'Camilla: curas más rápido' : null), disabled: !!why };
    }
    case 'cocina': {
      const ss = sim.stationStatus(m.id);
      const text = prop.kind === 'despensa' ? 'Abrir la despensa' : VERB.cocina;
      const fuel = ss && ss.fuelMinutes !== null ? (ss.fuelMinutes > 0 ? `Combustible para ${ss.fuelMinutes} min` : 'Sin combustible') : null;
      return { key: 'E', text, sub: join(warn, ss?.status, prop.kind === 'despensa' ? usedSlots(m) : fuel) };
    }
    case 'banco':
    case 'taller': {
      const ss = sim.stationStatus(m.id);
      const queue = ss && ss.jobs.length ? `${ss.jobs.length} en cola` : null;
      return { key: 'E', text: VERB[prop.interact], sub: join(warn, ss?.status, queue) };
    }
    case 'almacen':
      return { key: 'E', text: VERB.almacen, sub: join(warn, usedSlots(m)) };
    case 'huerto': {
      const status = sim.plotStatus(m.id, prop.index);
      const q = propQuick(sim, prop);
      if (q?.kind === 'harvest') return { key: 'E', text: 'Cosechar', sub: join(warn, status, HOLD_SUB.harvest) };
      if (q?.kind === 'tend') {
        const dead = !!m.plots[prop.index]?.dead;
        return { key: 'E', text: dead ? 'Retirar las plantas secas' : 'Quitar la plaga', sub: join(warn, status, HOLD_SUB.tend) };
      }
      return { key: 'E', text: VERB.huerto, sub: join(warn, status) };
    }
    case 'colector': {
      const u = st.utilities;
      const water = `Agua potable: ${Math.floor(u.waterL)}/${Math.round(u.water.capacityL)} L`;
      return { key: 'E', text: VERB.colector, sub: join(warn, water) };
    }
    case 'deposito': {
      // E bebe al momento, R llena una botella y mantener E abre el panel del depósito.
      const u = st.utilities;
      const water = `Agua potable: ${Math.floor(u.waterL)}/${Math.round(u.water.capacityL)} L`;
      const empty = u.waterL < WATER_PER_DRINK;
      const note = empty ? 'Está vacío' : st.player.needs.thirst >= 99 ? 'No tienes sed' : null;
      return { key: 'E', text: 'Beber', sub: join(warn, water, note, HOLD_SUB.drink), alt: { key: 'R', text: 'Llenar una botella', disabled: empty } };
    }
    case 'potabilizadora':
    case 'generador':
    case 'motor': {
      let extra: string | null = null;
      if (m.fuelInv) {
        const fuel = m.fuelInv.slots.reduce((n, s) => n + (s ? s.qty : 0), 0);
        extra = m.fuelBurn > 0 || fuel > 0 ? `Combustible: ${fuel} ud.` : 'Sin combustible';
      }
      return { key: 'E', text: VERB[prop.interact], sub: join(warn, onOff(m), extra) };
    }
    case 'bateria': {
      const u = st.utilities;
      return { key: 'E', text: VERB.bateria, sub: join(warn, `Carga: ${u.batteryKWh.toFixed(1)}/${Math.round(u.power.capacityKWh)} kWh`) };
    }
    case 'panel':
      return { key: 'E', text: VERB.panel, sub: join(warn, onOff(m)) };
    case 'timon': {
      const text = prop.kind === 'carta_nautica' ? 'Carta náutica: rumbo y avistamientos' : VERB.timon;
      const v = st.voyage;
      let sub: string | null = null;
      if (v.nextChoices && v.nextChoices.length && !v.chosenNext) sub = '¡Hay que elegir el próximo rumbo!';
      else if (st.events.active.some((e) => e.choices.some((c) => c.enabled))) sub = 'Hay una decisión pendiente';
      else if (v.anchoredUntil !== null) sub = v.anchorReason ? `Fondeados: ${v.anchorReason}` : 'Fondeados';
      return { key: 'E', text, sub: join(warn, sub) };
    }
    default:
      return { key: 'E', text: `Usar ${def.name.toLowerCase()}`, sub: join(warn) };
  }
}

export function npcPrompt(sim: Simulation, npc: NpcState): PromptInfo {
  const status = sim.npcStatus(npc.id);
  const sleeping = npc.activity === 'sleeping';
  return { key: 'E', text: `Hablar con ${npc.name}`, sub: sleeping ? 'Está durmiendo' : status || undefined };
}

/**
 * Aviso de una caja suelta. `fits` (si se sabe): true → E coge todo de una vez; false → E abre la
 * caja porque no cabe todo en el inventario.
 */
export function cratePrompt(crate: LooseCrate, fits?: boolean): PromptInfo {
  const n = crate.inventory.slots.reduce((acc, s) => acc + (s ? 1 : 0), 0);
  const piles = n === 1 ? '1 pila de objetos' : `${n} pilas de objetos`;
  if (fits === true && n > 0) return { key: 'E', text: `Coger todo: ${crate.label}`, sub: `${piles} · ${HOLD_SUB.take}` };
  if (fits === false && n > 0) return { key: 'E', text: `Abrir: ${crate.label}`, sub: `${piles} · No te cabe todo` };
  return { key: 'E', text: `Abrir: ${crate.label}`, sub: piles };
}

/** Obra en curso (`moduleId` = -1 para la ampliación del casco). */
export function sitePrompt(sim: Simulation, moduleId: number, hasHammer: boolean, working: boolean): PromptInfo | null {
  const cs = sim.constructionStatus(moduleId);
  if (!cs) return null;
  const pct = Math.floor(cs.progress * 100);
  const name = moduleId === -1 ? HULL_EXPANSION.name : cs.name;
  const helpers = cs.builders > 0 ? (cs.builders === 1 ? '1 habitante ayudando' : `${cs.builders} habitantes ayudando`) : null;
  const sub = hasHammer
    ? working
      ? `Trabajando con el martillo… ${helpers ?? ''}`.trim()
      : ['Ayuda con el martillo para acabar antes', helpers].filter(Boolean).join(' · ')
    : 'Necesitas un martillo para ayudar en la obra';
  return { key: 'Mantén E', text: `Obra: ${name} (${pct} %)`, sub, progress: cs.progress, disabled: !hasHammer };
}

/**
 * [AGENTE sim-survival] TUTORIAL PROGRESIVO (docs/SISTEMAS.md §4).
 *
 * Consejos que se muestran de uno en uno, sin bloquear, con al menos `TUTORIAL_GAP_MIN` minutos
 * de juego (≈ 20 s reales) entre un paso completado y el siguiente. Cada paso se completa cuando
 * el sistema correspondiente llama a `markTutorial(sim, id)`; el paso 'mover' lo detecta
 * `tickTutorial` (el jugador recorre 5 m) y se da por hecho en cuanto el jugador completa un paso
 * que exige caminar hasta un mueble (almacén, banco, cocina, depósito, cama, timón...).
 *
 * No es estrictamente secuencial:
 *  - Cada paso puede declarar cuándo tiene sentido (`when`: 'pescar' solo con una caña, 'dormir'
 *    cuando ya se puede dormir...). Mientras no lo tenga, se muestra el siguiente aplicable.
 *  - Si un paso es oportuno ahora (`now`: 'dormir' de noche o agotado, 'timon' con una decisión
 *    pendiente, 'reparar' con algo dañado, 'comer'/'beber' con hambre o sed), se muestra antes que
 *    el primer pendiente aunque vaya después en la lista.
 *  - Los pasos hechos por adelantado (o fuera de orden) quedan marcados y se saltan.
 * Los textos describen la acción física (teclas y muebles), no menús, salvo donde el juego usa un
 * panel de estación.
 *
 * Ronda de contenido 2: 'cuaderno' (leer la hoja del cuaderno del Albatros que se lleva en la
 * mochila: lo marca actions.readDocument) y 'mejorar' (la herramienta Mejorar del modo
 * construcción, cuando hay una mejora que se puede pagar; oportuno con un almacén lleno). Ambos se
 * dan también por hechos en `tickTutorial` si el estado lo demuestra (hojas leídas, una mejora en
 * obras o terminada), así que no dependen de quién encargue la mejora.
 *
 * Estado transitorio (no se guarda): posición anterior y distancia recorrida para 'mover' y minuto
 * del último paso completado. Se reinicia al cargar (el primer consejo pendiente aparece de inmediato).
 */
import { ITEMS } from '../data/items';
import { pageByItem } from '../data/story';
import { hourOf } from './time';
import { countItem } from './inventory';
import { payInventories, shipCount } from './helpers';
import { moduleTier, nextUpgrade } from './moduleStats';
import type { Simulation } from './Simulation';
import type { ModuleInstance, Vec3 } from './types';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Posición del paso (1..total) en la lista de pasos. */
  index?: number;
  /** Número total de pasos. */
  total?: number;
  /** El paso se muestra antes de tiempo porque es oportuno ahora (noche, decisión pendiente...). */
  urgent?: boolean;
}

interface StepDef {
  id: string;
  title: string;
  text: string;
  /** El paso solo se muestra cuando tiene sentido (si no, se pasa al siguiente). */
  when?: (sim: Simulation) => boolean;
  /** El paso es oportuno ahora: se muestra antes que los pendientes anteriores. */
  now?: (sim: Simulation) => boolean;
}

/** Minutos de juego mínimos entre completar un paso y mostrar el siguiente. */
export const TUTORIAL_GAP_MIN = 20;
/** Metros que hay que recorrer para completar el paso 'mover'. */
export const MOVE_STEP_METERS = 5;
/** Un salto mayor que esto entre dos pasos de simulación es un teletransporte (reaparición, carga), no un paseo. */
const MOVE_JUMP_METERS = 4;
/** Pasos que obligan a caminar hasta un mueble: completarlos da por hecho 'mover'. */
const IMPLIES_MOVING = new Set(['almacen', 'fabricar', 'pescar', 'cocinar', 'beber', 'dormir', 'plantar', 'timon', 'reparar']);

/** Necesidad (hambre o sed) por debajo de la que comer o beber es oportuno. */
const NEED_LOW = 40;

/** ¿Hay que decidir algo en el timón (un avistamiento, un mercante o el rumbo)? */
function helmDecisionPending(sim: Simulation): boolean {
  const st = sim.state;
  if (st.events.active.some((e) => e.choices.length > 0)) return true;
  const v = st.voyage;
  return !!v.nextChoices && v.nextChoices.length > 1 && !v.chosenNext;
}

/** Algo del barco necesita reparación (avería, daños o fuga). */
function somethingDamaged(sim: Simulation): boolean {
  return sim.state.ship.modules.some((m) => m.status === 'broken' || (m.status === 'active' && (m.condition < 50 || m.leak)));
}

/** ¿Ya se puede dormir? (de noche o con cansancio; ver `actions.sleepBlocker`). */
function canSleepNow(sim: Simulation): boolean {
  const h = hourOf(sim.state.time);
  return h >= 21 || h < 5 || sim.state.player.needs.energy < 80;
}

/** Hay pescado crudo a mano (encima o en los almacenes). */
function hasRawFish(sim: Simulation): boolean {
  return countItem(sim.state.player.inventory, 'pescado_crudo') > 0 || shipCount(sim, 'pescado_crudo') > 0;
}

/** Hay semillas a mano o un huerto ya construido. */
function canPlant(sim: Simulation): boolean {
  const st = sim.state;
  if (st.ship.modules.some((m) => m.type === 'huerto' && m.status === 'active')) return true;
  return ['semilla_hortaliza', 'semilla_lino'].some((id) => countItem(st.player.inventory, id) > 0 || shipCount(sim, id) > 0);
}

/** ¿Lleva el jugador encima una hoja del cuaderno sin leer? */
export function hasUnreadPage(sim: Simulation): boolean {
  const read = sim.state.story?.pages ?? [];
  return sim.state.player.inventory.slots.some((s) => {
    if (!s || ITEMS[s.id]?.category !== 'documento') return false;
    const page = pageByItem(s.id);
    return !!page && !read.includes(page.n);
  });
}

/**
 * Módulos que se pueden mejorar ahora mismo: terminados, sin avería ni fuego ni otra mejora en
 * obras, con la mejora siguiente desbloqueada y su coste a mano (jugador, almacenes y bandejas,
 * como paga construction.startUpgrade).
 */
export function affordableUpgrades(sim: Simulation): ModuleInstance[] {
  const st = sim.state;
  let have: Map<string, number> | null = null;
  const out: ModuleInstance[] = [];
  for (const m of st.ship.modules) {
    if (m.status !== 'active' || m.fire > 0 || m.upgrade) continue;
    const up = nextUpgrade(m);
    if (!up || (up.unlock && !st.unlocks.includes(up.unlock))) continue;
    if (!have) {
      have = new Map();
      for (const inv of payInventories(sim)) for (const s of inv.slots) if (s) have.set(s.id, (have.get(s.id) ?? 0) + s.qty);
    }
    const stock = have;
    if (Object.entries(up.cost).every(([id, q]) => (stock.get(id) ?? 0) >= q)) out.push(m);
  }
  return out;
}

/** Un almacén está lleno y se puede ampliar ya: mejorar es oportuno. */
function storageFullAndUpgradable(sim: Simulation): boolean {
  return affordableUpgrades(sim).some((m) => m.type === 'almacen' && !!m.inventory && m.inventory.slots.every((s) => !!s));
}

const STEPS: readonly StepDef[] = [
  { id: 'mover', title: 'Moverse', text: 'WASD para moverte, Mayús para correr y Espacio para saltar. Mira alrededor con el ratón.' },
  {
    id: 'gancho',
    title: 'Rescatar restos',
    text: 'Con el gancho en la mano (1), apunta a los restos que flotan junto al barco y haz clic para lanzarlo.',
    when: (sim) => sim.state.debris.length > 0,
  },
  {
    id: 'comer',
    title: 'Comer y beber',
    text: 'Elige la comida o la botella de agua en la barra rápida (números o rueda) y pulsa F o clic derecho.',
    now: (sim) => sim.state.player.needs.hunger < NEED_LOW || sim.state.player.needs.thirst < NEED_LOW,
  },
  {
    id: 'cuaderno',
    title: 'El cuaderno del Albatros',
    text: 'Llevas en la mochila una hoja del cuaderno del Albatros: haz clic derecho sobre ella para leerla, o ponla en la barra rápida y pulsa F.',
    when: hasUnreadPage,
  },
  { id: 'almacen', title: 'Almacén', text: 'Guarda lo que no necesites en el almacén: pulsa E ante las estanterías.' },
  { id: 'fabricar', title: 'Fabricar', text: 'Pulsa E en el banco de trabajo y fabrica una caña de pescar (2 de madera y 2 de cuerda).' },
  {
    id: 'pescar',
    title: 'Pescar',
    text: 'Con la caña en la mano, asómate a la borda: clic para lanzar y otro clic cuando pique.',
    when: (sim) => countItem(sim.state.player.inventory, 'cana') > 0,
  },
  {
    id: 'cocinar',
    title: 'Cocinar',
    text: 'Pulsa E en la cocina, echa 1 de madera al fogón (arde 40 min) y pon a asar el pescado: crudo puede sentarte mal.',
    when: hasRawFish,
  },
  {
    id: 'beber',
    title: 'Agua potable',
    text: 'Baja a la bodega y pulsa E junto al depósito para beber; R llena una botella.',
    now: (sim) => sim.state.player.needs.thirst < NEED_LOW,
  },
  {
    id: 'dormir',
    title: 'Dormir',
    text: 'Pulsa E sobre la cama de tu camarote para dormir hasta el amanecer y recuperar energía.',
    when: canSleepNow,
    now: (sim) => {
      const h = hourOf(sim.state.time);
      return h >= 21 || h < 5 || sim.state.player.needs.energy < 40;
    },
  },
  { id: 'construir', title: 'Construir', text: 'Pulsa B para construir: elige una pieza, colócala con clic y gírala con R.' },
  {
    id: 'mejorar',
    title: 'Mejorar instalaciones',
    text: 'En el modo construcción (B), la herramienta Mejorar (U) mejora lo que ya tienes: almacenes más grandes, depósitos mayores, camas más cómodas, cocinas más rápidas.',
    when: (sim) => sim.state.tutorial.done.includes('construir') && affordableUpgrades(sim).length > 0,
    now: storageFullAndUpgradable,
  },
  {
    id: 'plantar',
    title: 'Cultivar',
    text: 'Construye un huerto (B) y pulsa E sobre un bancal para plantar semillas: se riegan con el agua de los depósitos.',
    when: canPlant,
  },
  {
    id: 'timon',
    title: 'El timón',
    text: 'Sube al puente y pulsa E en el timón: allí fijas el rumbo y decides qué hacer con los avistamientos.',
    now: helmDecisionPending,
  },
  {
    id: 'reparar',
    title: 'Reparar',
    text: 'Acércate a lo dañado y pulsa R: las estructuras se arreglan con martillo y kit de reparación; las máquinas, con llave inglesa y pieza mecánica.',
    when: somethingDamaged,
    now: somethingDamaged,
  },
];

/** Lista pública de pasos (para la interfaz: progreso, repaso de consejos). */
export const TUTORIAL_STEPS: readonly TutorialStep[] = STEPS.map((s, i) => ({ id: s.id, title: s.title, text: s.text, index: i + 1, total: STEPS.length }));

/* ------------------------------------------------------------------ */
/* Estado transitorio                                                  */
/* ------------------------------------------------------------------ */

interface TutorialMemo {
  /** Posición de partida para el paso 'mover'. */
  origin: Vec3 | null;
  /** Posición en el paso anterior (para sumar lo recorrido). */
  last: Vec3 | null;
  /** Metros recorridos andando (sin contar teletransportes). */
  walked: number;
  /** Minuto de juego en que se completó el último paso. */
  lastDoneAt: number;
}

const memos = new WeakMap<Simulation, TutorialMemo>();

function memoOf(sim: Simulation): TutorialMemo {
  let m = memos.get(sim);
  if (!m) memos.set(sim, (m = { origin: null, last: null, walked: 0, lastDoneAt: -Infinity }));
  return m;
}

function allDone(sim: Simulation): boolean {
  const done = sim.state.tutorial.done;
  return STEPS.every((s) => done.includes(s.id));
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export function tickTutorial(sim: Simulation, _dt: number): void {
  const st = sim.state;
  const t = st.tutorial;
  const memo = memoOf(sim);
  // Si el reloj retrocede (depuración), no bloqueamos los consejos.
  if (st.time < memo.lastDoneAt) memo.lastDoneAt = st.time - TUTORIAL_GAP_MIN;
  // Pasos que demuestra el propio estado: hojas ya leídas, una mejora encargada o terminada.
  if (!t.done.includes('cuaderno') && (st.story?.pages.length ?? 0) > 0) markTutorial(sim, 'cuaderno');
  if (!t.done.includes('mejorar') && st.ship.modules.some((m) => !!m.upgrade || moduleTier(m) > 1)) markTutorial(sim, 'mejorar');
  if (t.dismissed || t.done.includes('mover')) return;
  const p = st.player;
  if (!p.alive || p.sleeping) return;
  if (!memo.origin) memo.origin = { ...p.pos };
  if (memo.last) {
    const step = Math.hypot(p.pos.x - memo.last.x, p.pos.y - memo.last.y, p.pos.z - memo.last.z);
    if (step <= MOVE_JUMP_METERS) memo.walked += step;
  }
  memo.last = { ...p.pos };
  const d = Math.hypot(p.pos.x - memo.origin.x, p.pos.z - memo.origin.z);
  if (d >= MOVE_STEP_METERS || memo.walked >= MOVE_STEP_METERS) markTutorial(sim, 'mover');
}

/** Marca un paso del tutorial como hecho (lo llaman los sistemas al ocurrir la acción). */
export function markTutorial(sim: Simulation, id: string): void {
  const t = sim.state.tutorial;
  if (t.done.includes(id)) return;
  const wasComplete = allDone(sim);
  t.done.push(id);
  // Quien ya ha llegado andando hasta un mueble sabe moverse: el paso se da por hecho en silencio.
  if (IMPLIES_MOVING.has(id) && !t.done.includes('mover')) t.done.push('mover');
  memoOf(sim).lastDoneAt = sim.state.time;
  sim.bus.emit('tutorialStep', { id });
  if (!wasComplete && !t.dismissed && allDone(sim)) {
    sim.notify('Tutorial completado: ya conoces lo básico. ¡Buena travesía!', 'good');
  }
}

/**
 * Paso actual a mostrar (o null si el tutorial está descartado, terminado o en pausa entre pasos):
 * primero el pendiente que sea oportuno ahora (p. ej. 'dormir' de noche) y, si no hay ninguno, el
 * primer pendiente que tenga sentido.
 */
export function currentTutorial(sim: Simulation): TutorialStep | null {
  const st = sim.state;
  const t = st.tutorial;
  if (t.dismissed || !st.player.alive || st.player.sleeping) return null;
  const memo = memoOf(sim);
  if (st.time - memo.lastDoneAt < TUTORIAL_GAP_MIN) return null;
  let first = -1;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i]!;
    if (t.done.includes(s.id)) continue;
    if (s.when && !s.when(sim)) continue;
    if (s.now?.(sim)) return { id: s.id, title: s.title, text: s.text, index: i + 1, total: STEPS.length, urgent: true };
    if (first < 0) first = i;
  }
  if (first < 0) return null;
  const s = STEPS[first]!;
  return { id: s.id, title: s.title, text: s.text, index: first + 1, total: STEPS.length };
}

/** Progreso del tutorial (pasos hechos / total). */
export function tutorialProgress(sim: Simulation): { done: number; total: number; complete: boolean } {
  const done = STEPS.filter((s) => sim.state.tutorial.done.includes(s.id)).length;
  return { done, total: STEPS.length, complete: done === STEPS.length };
}

/** El jugador descarta el tutorial (no se vuelven a mostrar consejos). */
export function dismissTutorial(sim: Simulation): void {
  sim.state.tutorial.dismissed = true;
}

/** Vuelve a activar los consejos (los pasos ya hechos siguen hechos). */
export function resumeTutorial(sim: Simulation): void {
  sim.state.tutorial.dismissed = false;
  memoOf(sim).lastDoneAt = -Infinity;
}

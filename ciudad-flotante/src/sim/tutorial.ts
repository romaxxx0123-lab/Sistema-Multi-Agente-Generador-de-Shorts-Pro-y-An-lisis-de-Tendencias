/**
 * [AGENTE sim-survival] TUTORIAL PROGRESIVO (docs/SISTEMAS.md §4).
 *
 * Consejos que se muestran de uno en uno, sin bloquear, con al menos `TUTORIAL_GAP_MIN` minutos
 * de juego (≈ 20 s reales) entre un paso completado y el siguiente. Cada paso se completa cuando
 * el sistema correspondiente llama a `markTutorial(sim, id)`; el paso 'mover' lo detecta
 * `tickTutorial` (el jugador se aleja 5 m de donde empezó).
 *
 * Algunos pasos esperan a que tengan sentido (p. ej. 'pescar' solo con una caña, 'dormir' al
 * anochecer o con cansancio): mientras tanto se muestra el siguiente aplicable. Los pasos ya
 * hechos fuera de orden se saltan.
 *
 * Estado transitorio (no se guarda): posición de partida para 'mover' y minuto del último paso
 * completado. Se reinicia al cargar (el primer consejo pendiente aparece de inmediato).
 */
import { hourOf } from './time';
import { countItem } from './inventory';
import type { Simulation } from './Simulation';
import type { Vec3 } from './types';

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** Posición del paso (1..total) al devolverlo `currentTutorial`. */
  index?: number;
  /** Número total de pasos. */
  total?: number;
}

interface StepDef {
  id: string;
  title: string;
  text: string;
  /** El paso solo se muestra cuando tiene sentido (si no, se pasa al siguiente). */
  when?: (sim: Simulation) => boolean;
}

/** Minutos de juego mínimos entre completar un paso y mostrar el siguiente. */
export const TUTORIAL_GAP_MIN = 20;
/** Metros que hay que recorrer para completar el paso 'mover'. */
export const MOVE_STEP_METERS = 5;

const STEPS: readonly StepDef[] = [
  { id: 'mover', title: 'Moverse', text: 'WASD para moverte, Mayús para correr, Espacio para saltar.' },
  {
    id: 'gancho',
    title: 'Rescatar restos',
    text: 'Selecciona el gancho (1) y haz clic sobre los restos que flotan junto al barco.',
    when: (sim) => sim.state.debris.length > 0,
  },
  { id: 'comer', title: 'Comer y beber', text: 'Abre el inventario (Tab) y come o bebe algo.' },
  { id: 'almacen', title: 'Almacén', text: 'Guarda lo que no necesites en el almacén (E sobre las estanterías).' },
  { id: 'fabricar', title: 'Fabricar', text: 'En el banco de trabajo puedes fabricar herramientas: prueba con una caña.' },
  {
    id: 'pescar',
    title: 'Pescar',
    text: 'Con la caña, desde la borda: clic para lanzar y clic cuando pique.',
    when: (sim) => countItem(sim.state.player.inventory, 'cana') > 0,
  },
  { id: 'cocinar', title: 'Cocinar', text: 'Cocina el pescado en la cocina (necesita leña).' },
  { id: 'beber', title: 'Agua potable', text: 'Bebe del depósito de la bodega o rellena botellas allí.' },
  {
    id: 'dormir',
    title: 'Dormir',
    text: 'Por la noche, duerme en tu camarote para recuperar energía.',
    when: (sim) => {
      const h = hourOf(sim.state.time);
      return h >= 19 || h < 6 || sim.state.player.needs.energy < 50;
    },
  },
  { id: 'construir', title: 'Construir', text: 'Pulsa B para el modo construcción: amplía el barco.' },
  { id: 'plantar', title: 'Cultivar', text: 'Construye un huerto y planta semillas: necesitan agua de los depósitos.' },
  { id: 'timon', title: 'El timón', text: 'Sube al puente: en el timón decides el rumbo y respondes a los avistamientos.' },
  {
    id: 'reparar',
    title: 'Reparar',
    text: 'Las tormentas y averías dañan el barco: repara con martillo + kit o llave + pieza.',
    when: (sim) => sim.state.ship.modules.some((m) => m.status === 'broken' || m.condition < 50 || m.leak),
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
  /** Minuto de juego en que se completó el último paso. */
  lastDoneAt: number;
}

const memos = new WeakMap<Simulation, TutorialMemo>();

function memoOf(sim: Simulation): TutorialMemo {
  let m = memos.get(sim);
  if (!m) memos.set(sim, (m = { origin: null, lastDoneAt: -Infinity }));
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
  if (t.dismissed || t.done.includes('mover')) return;
  const p = st.player;
  if (!p.alive || p.sleeping) return;
  if (!memo.origin) memo.origin = { ...p.pos };
  const d = Math.hypot(p.pos.x - memo.origin.x, p.pos.z - memo.origin.z);
  if (d >= MOVE_STEP_METERS) markTutorial(sim, 'mover');
}

/** Marca un paso del tutorial como hecho (lo llaman los sistemas al ocurrir la acción). */
export function markTutorial(sim: Simulation, id: string): void {
  const t = sim.state.tutorial;
  if (t.done.includes(id)) return;
  const wasComplete = allDone(sim);
  t.done.push(id);
  memoOf(sim).lastDoneAt = sim.state.time;
  sim.bus.emit('tutorialStep', { id });
  if (!wasComplete && !t.dismissed && allDone(sim)) {
    sim.notify('Tutorial completado: ya conoces lo básico. ¡Buena travesía!', 'good');
  }
}

/** Paso actual a mostrar (o null si el tutorial está descartado, terminado o en pausa entre pasos). */
export function currentTutorial(sim: Simulation): TutorialStep | null {
  const st = sim.state;
  const t = st.tutorial;
  if (t.dismissed || !st.player.alive || st.player.sleeping) return null;
  const memo = memoOf(sim);
  if (st.time - memo.lastDoneAt < TUTORIAL_GAP_MIN) return null;
  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i]!;
    if (t.done.includes(s.id)) continue;
    if (s.when && !s.when(sim)) continue;
    return { id: s.id, title: s.title, text: s.text, index: i + 1, total: STEPS.length };
  }
  return null;
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

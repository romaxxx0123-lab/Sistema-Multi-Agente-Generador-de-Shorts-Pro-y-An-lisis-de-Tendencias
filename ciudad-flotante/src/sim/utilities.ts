/**
 * [AGENTE sim-economy] REDES DE ENERGÍA Y AGUA (docs/SISTEMAS.md §6).
 *
 * Cada paso de simulación:
 *  1. Capacidades: depósitos + colectores (agua) y baterías (kWh).
 *  2. Demanda de los consumidores activos y encendidos (taller con cola, potabilizadora si el agua
 *     no está llena, enfermería, motor navegando, lámparas de cultivo de huertos interiores).
 *  3. Generación: paneles solares (luz × nubes × condición) y generadores, que queman combustible
 *     de su ranura solo cuando hay déficit o batería por llenar (con histéresis para no parpadear).
 *  4. Baterías: cargan con el excedente y cubren el déficit (≤ 10 kW por batería).
 *  5. `satisfaction` y `module.powered` de cada consumidor.
 *  6. Red de agua: colectores con lluvia a cielo abierto, potabilizadora, fugas y depósitos dañados.
 *  7. Resumen suavizado para la UI en `state.utilities`.
 *
 * Significado de `ModuleInstance.powered` según el tipo de módulo:
 *  - consumidores eléctricos: recibe energía suficiente (o la recibiría si arrancase);
 *  - generador / panel solar: está produciendo ahora mismo;
 *  - banco de baterías: está conectado a la red (activo);
 *  - cocina (lo fija stations.ts): el fogón está encendido cocinando.
 *
 * Además exporta utilidades compartidas por el área de economía (combustible, avisos únicos,
 * concordancia gramatical de los textos).
 */
import { clamp } from '../core/math';
import type { NotifyKind } from '../core/EventBus';
import { ITEMS } from '../data/items';
import { moduleDef, type ModuleDef } from '../data/modules';
import { findModule } from './helpers';
import { getCell, moduleCells, moduleCenter } from './ship';
import type { ActionResult, Simulation } from './Simulation';
import { daylight } from './time';
import type { Inventory, ModuleInstance } from './types';

/* ------------------------------------------------------------------ */
/* Parámetros de equilibrio                                            */
/* ------------------------------------------------------------------ */

/** Potencia máxima de carga/descarga de cada banco de baterías (kW). */
export const BATTERY_MAX_KW = 10;
/** Pérdida de los paneles con cielo totalmente cubierto. */
export const SOLAR_CLOUD_LOSS = 0.65;
/** Rendimiento de una máquina con condición < 50. */
export const DAMAGED_MACHINE_FACTOR = 0.7;
/** Consumo de las lámparas de cultivo por parcela creciendo (kW). */
export const GROW_LAMP_KW = 0.15;
/** Pérdida de un depósito con fuga (L/h). */
export const LEAK_L_PER_HOUR = 6;
/** Pérdida de un depósito dañado (condición < 50) sin fuga declarada (L/h). */
export const DAMAGED_TANK_L_PER_HOUR = 1;
/** Fracción de batería por debajo de la cual un generador parado arranca para recargarla. */
const GEN_RESTART_FRACTION = 0.9;
/** Constante de tiempo (min) del suavizado de entradas/salidas de agua. */
const WATER_SMOOTH_MIN = 15;
/** Agua (L) por debajo de la cual el depósito se considera vacío para los avisos. */
const WATER_EMPTY_L = 0.5;
/** Fracción de la capacidad por debajo de la cual se avisa de que queda poca agua (y para rearmar). */
const WATER_LOW_FRACTION = 0.15;
const WATER_LOW_RESET = 0.3;
/** Minutos de combustible restantes de un generador en marcha para avisar (y para rearmar). */
const GEN_LOW_FUEL_MIN = 30;
const GEN_LOW_FUEL_RESET = 60;

/* ------------------------------------------------------------------ */
/* Avisos que se muestran una sola vez (no forman parte del guardado)  */
/* ------------------------------------------------------------------ */

const warnings = new WeakMap<Simulation, Set<string>>();

function warnSet(sim: Simulation): Set<string> {
  let s = warnings.get(sim);
  if (!s) warnings.set(sim, (s = new Set()));
  return s;
}

/** Notifica `text` solo la primera vez que se llama con `key` (hasta `clearWarn`). Devuelve true si avisó. */
export function warnOnce(sim: Simulation, key: string, text: string, kind: NotifyKind = 'warn', log = false): boolean {
  const s = warnSet(sim);
  if (s.has(key)) return false;
  s.add(key);
  if (log) sim.log(text, kind);
  else sim.notify(text, kind);
  return true;
}

/** Marca un aviso como ya dado sin mostrarlo (p. ej. porque el comando ya lo dijo). */
export function markWarned(sim: Simulation, key: string): void {
  warnSet(sim).add(key);
}

/** Rearma un aviso para que pueda volver a mostrarse. */
export function clearWarn(sim: Simulation, key: string): void {
  warnings.get(sim)?.delete(key);
}

/* ------------------------------------------------------------------ */
/* Concordancia gramatical para los textos ("El generador … averiado") */
/* ------------------------------------------------------------------ */

const FEM_WORDS = new Set(['llave', 'red', 'sal', 'luz', 'lona']);
const MASC_WORDS = new Set(['día', 'mapa', 'sistema', 'problema']);

function firstWord(name: string): string {
  return (name.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

/** ¿El sustantivo principal es plural? ("Hortalizas", "Componentes eléctricos"). */
export function isPluralName(name: string): boolean {
  return /s$/.test(firstWord(name));
}

/** ¿El sustantivo principal es femenino? Heurística por terminación con excepciones. */
export function isFeminineName(name: string): boolean {
  const w = firstWord(name);
  const sing = isPluralName(name) ? w.replace(/e?s$/, '') : w;
  if (FEM_WORDS.has(sing) || FEM_WORDS.has(w)) return true;
  if (MASC_WORDS.has(sing) || MASC_WORDS.has(w)) return false;
  return /(a|ción|sión|dad)$/.test(sing);
}

/** Concuerda un adjetivo terminado en -o con el nombre: agree('Sopa', 'listo') → 'lista'. */
export function agree(name: string, adjMasc: string): string {
  const stem = adjMasc.replace(/o$/, '');
  return stem + (isFeminineName(name) ? 'a' : 'o') + (isPluralName(name) ? 's' : '');
}

/** Artículo determinado + nombre en minúscula inicial: 'el generador', 'la potabilizadora'. */
export function withArticle(name: string, capital = false): string {
  const fem = isFeminineName(name);
  const pl = isPluralName(name);
  const art = fem ? (pl ? 'las' : 'la') : pl ? 'los' : 'el';
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  const a = capital ? art.charAt(0).toUpperCase() + art.slice(1) : art;
  return `${a} ${lower}`;
}

/** Primera letra en mayúscula. */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Complemento con "a" y contracción: 'al generador', 'a la potabilizadora'. */
export function toArticle(name: string): string {
  const a = withArticle(name);
  return a.startsWith('el ') ? `al ${a.slice(3)}` : `a ${a}`;
}

/* ------------------------------------------------------------------ */
/* Consultas sobre módulos                                             */
/* ------------------------------------------------------------------ */

/** Número finito o `fallback` (protege la simulación de valores corruptos de guardados antiguos). */
export function finite(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** El módulo está terminado, no averiado y no arde: puede funcionar. */
export function isOperational(m: ModuleInstance): boolean {
  return m.status === 'active' && m.fire <= 0;
}

/** Factor de rendimiento por desgaste (máquinas con condición < 50 rinden un 30 % menos). */
export function conditionFactor(m: ModuleInstance): number {
  return moduleDef(m.type).machine && m.condition < 50 ? DAMAGED_MACHINE_FACTOR : 1;
}

/** El barco navega (no está fondeado). */
export function isSailing(sim: Simulation): boolean {
  const a = sim.state.voyage.anchoredUntil;
  return a === null || a <= sim.state.time;
}

/** Alguna celda del módulo está a cielo abierto (llueve y da el sol). */
export function moduleHasSky(sim: Simulation, m: ModuleInstance): boolean {
  const layout = sim.layout;
  for (const c of moduleCells(m)) {
    if (c.level !== m.level) continue;
    const cell = getCell(layout, c.level, c.x, c.z);
    if (cell?.sky) return true;
  }
  return false;
}

/** Huerto interior que puede usar lámparas de cultivo (plano `invernadero`). */
export function hasGrowLamps(sim: Simulation, m: ModuleInstance): boolean {
  return m.plots.length > 0 && sim.state.unlocks.includes('invernadero') && !moduleHasSky(sim, m);
}

/** Parcelas con un cultivo vivo que aún no ha madurado. */
export function growingPlots(m: ModuleInstance): number {
  let n = 0;
  for (const p of m.plots) if (p.crop && !p.dead && p.growth < 1) n++;
  return n;
}

function isGenerator(def: ModuleDef): boolean {
  return !!def.powerGen && !!def.fuelSlots;
}

function isSolar(def: ModuleDef): boolean {
  return !!def.powerGen && !def.fuelSlots;
}

/** ¿Es un consumidor eléctrico (con interruptor)? */
export function isConsumer(sim: Simulation, m: ModuleInstance): boolean {
  const def = moduleDef(m.type);
  if (def.powerUse) return true;
  return m.plots.length > 0 && hasGrowLamps(sim, m);
}

/** ¿Tiene interruptor de encendido? (generadores, paneles y consumidores eléctricos). */
export function hasPowerSwitch(sim: Simulation, m: ModuleInstance): boolean {
  const def = moduleDef(m.type);
  return !!def.powerGen || isConsumer(sim, m);
}

/** Consumo nominal (kW) de un consumidor cuando trabaja a pleno. */
export function nominalDemand(sim: Simulation, m: ModuleInstance): number {
  const def = moduleDef(m.type);
  if (def.powerUse) return def.powerUse;
  if (m.plots.length && hasGrowLamps(sim, m)) return GROW_LAMP_KW * m.plots.length;
  return 0;
}

/** Hueco libre en los depósitos (L). */
function waterRoom(sim: Simulation): number {
  const u = sim.state.utilities;
  return Math.max(0, u.water.capacityL - u.waterL);
}

/**
 * Potencia (kW) que pide ahora mismo un consumidor (0 si está apagado o no puede funcionar).
 * La potabilizadora solo pide la parte de su potencia que necesita para llenar el hueco que queda
 * en `hours` horas (así no derrocha energía rellenando unos mililitros).
 */
export function currentDemand(sim: Simulation, m: ModuleInstance, hours = 1 / 60): number {
  if (!m.on || !isOperational(m)) return 0;
  const def = moduleDef(m.type);
  switch (m.type) {
    case 'taller':
      return m.queue.length > 0 ? (def.powerUse ?? 0) : 0;
    case 'potabilizadora': {
      const perStep = (def.waterGen ?? 0) * conditionFactor(m) * Math.max(hours, 1e-6);
      const room = waterRoom(sim);
      if (room <= 1e-6 || perStep <= 0) return 0;
      return (def.powerUse ?? 0) * Math.min(1, room / perStep);
    }
    case 'motor':
      return isSailing(sim) ? (def.powerUse ?? 0) : 0;
    default:
      if (m.plots.length) return hasGrowLamps(sim, m) ? GROW_LAMP_KW * growingPlots(m) : 0;
      return def.powerUse ?? 0;
  }
}

/** Carga de trabajo 0..1 de cada máquina en el último tick (no se guarda: se recalcula al cargar). */
const machineLoads = new WeakMap<Simulation, Map<number, number>>();

function loadsOf(sim: Simulation): Map<number, number> {
  let m = machineLoads.get(sim);
  if (!m) machineLoads.set(sim, (m = new Map()));
  return m;
}

/**
 * Carga de trabajo 0..1 de una máquina en el último tick (para el desgaste): generador según el
 * combustible quemado, panel produciendo = 1, baterías según su flujo respecto al máximo y
 * consumidores según la fracción de su potencia nominal que han usado.
 */
export function machineLoad(sim: Simulation, m: ModuleInstance): number {
  if (m.status !== 'active' || !moduleDef(m.type).machine) return 0;
  return loadsOf(sim).get(m.id) ?? 0;
}

/** ¿La máquina está funcionando ahora mismo? */
export function machineRunning(sim: Simulation, m: ModuleInstance): boolean {
  return machineLoad(sim, m) > 0;
}

/* ------------------------------------------------------------------ */
/* Combustible                                                         */
/* ------------------------------------------------------------------ */

function firstFuelSlot(inv: Inventory | null): number {
  if (!inv) return -1;
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s && s.qty > 0 && (ITEMS[s.id]?.fuel ?? 0) > 0) return i;
  }
  return -1;
}

/** ¿Le queda combustible (cargado o en la ranura)? */
export function hasFuel(m: ModuleInstance): boolean {
  return m.fuelBurn > 1e-6 || firstFuelSlot(m.fuelInv) >= 0;
}

/** Minutos de combustión disponibles en total (cargado + ranura). */
export function fuelMinutes(m: ModuleInstance): number {
  let t = Math.max(0, m.fuelBurn);
  for (const s of m.fuelInv?.slots ?? []) if (s) t += (ITEMS[s.id]?.fuel ?? 0) * s.qty;
  return t;
}

/** Echa una unidad de combustible de la ranura al fuego. */
function loadFuel(m: ModuleInstance): boolean {
  const i = firstFuelSlot(m.fuelInv);
  if (i < 0) return false;
  const s = m.fuelInv!.slots[i]!;
  m.fuelBurn = Math.max(0, m.fuelBurn) + (ITEMS[s.id]?.fuel ?? 0);
  s.qty -= 1;
  if (s.qty <= 0) m.fuelInv!.slots[i] = null;
  return true;
}

/**
 * Quema `minutes` minutos de combustible (cargando unidades de la ranura cuando se agota la actual).
 * Devuelve los minutos que realmente ardió (menos si se acabó el combustible).
 */
export function burnFuel(m: ModuleInstance, minutes: number): number {
  m.fuelBurn = finite(m.fuelBurn);
  let left = minutes;
  while (left > 1e-9) {
    if (m.fuelBurn <= 1e-9 && !loadFuel(m)) break;
    const take = Math.min(m.fuelBurn, left);
    m.fuelBurn -= take;
    left -= take;
  }
  if (m.fuelBurn < 1e-9) m.fuelBurn = 0;
  return minutes - left;
}

/* ------------------------------------------------------------------ */
/* Capacidades                                                         */
/* ------------------------------------------------------------------ */

/** Instantánea del agua tras el último tick (para medir lo que gastan otros sistemas). */
const waterSnapshot = new WeakMap<Simulation, { waterL: number; time: number }>();

/** Capacidad de agua (L) y de baterías (kWh) del barco tal y como está ahora. */
export function capacities(sim: Simulation): { waterL: number; batteryKWh: number; batteries: number } {
  let waterL = 0;
  let batteryKWh = 0;
  let batteries = 0;
  for (const m of sim.state.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    if (def.waterCapacity) waterL += def.waterCapacity;
    if (def.batteryKWh && m.status === 'active') {
      batteryKWh += def.batteryKWh;
      batteries++;
    }
  }
  return { waterL, batteryKWh, batteries };
}

/**
 * Recalcula las capacidades y recorta el agua y la carga almacenadas (tras demoler un depósito,
 * por ejemplo). Devuelve lo que se ha perdido.
 */
export function refreshCapacities(sim: Simulation): { lostWaterL: number; lostKWh: number } {
  const u = sim.state.utilities;
  const cap = capacities(sim);
  u.water.capacityL = cap.waterL;
  u.power.capacityKWh = cap.batteryKWh;
  const lostWaterL = Math.max(0, u.waterL - cap.waterL);
  const lostKWh = Math.max(0, u.batteryKWh - cap.batteryKWh);
  u.waterL = clamp(u.waterL, 0, cap.waterL);
  u.batteryKWh = clamp(u.batteryKWh, 0, cap.batteryKWh);
  // El agua perdida al desmontar no debe contarse como consumo en el resumen.
  const snap = waterSnapshot.get(sim);
  if (snap) snap.waterL = Math.min(snap.waterL, u.waterL);
  return { lostWaterL, lostKWh };
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

export function tickUtilities(sim: Simulation, dt: number): void {
  if (dt <= 0) return;
  const st = sim.state;
  const u = st.utilities;
  const hours = dt / 60;
  u.waterL = finite(u.waterL);
  u.batteryKWh = finite(u.batteryKWh);
  u.water.inPerHour = finite(u.water.inPerHour);
  u.water.outPerHour = finite(u.water.outPerHour);

  // Consumo/aporte de agua de otros sistemas (huertos, habitantes, jugador) desde el último tick.
  let externalOut = 0;
  let externalIn = 0;
  const snap = waterSnapshot.get(sim);
  if (snap) {
    const elapsed = st.time - snap.time;
    if (elapsed > 1e-6 && elapsed <= 60) {
      const delta = u.waterL - snap.waterL;
      if (delta < 0) externalOut = -delta / (elapsed / 60);
      else externalIn = delta / (elapsed / 60);
    }
  }

  /* 1. Capacidades */
  const cap = capacities(sim);
  u.water.capacityL = cap.waterL;
  u.power.capacityKWh = cap.batteryKWh;
  u.waterL = clamp(u.waterL, 0, cap.waterL);
  u.batteryKWh = clamp(u.batteryKWh, 0, cap.batteryKWh);
  const waterRoomL = Math.max(0, cap.waterL - u.waterL);

  const loads = loadsOf(sim);
  loads.clear();

  /* 2. Demanda */
  const consumers: { m: ModuleInstance; demand: number }[] = [];
  const generators: ModuleInstance[] = [];
  const panels: ModuleInstance[] = [];
  const batteries: ModuleInstance[] = [];
  let demand = 0;
  for (const m of st.ship.modules) {
    const def = moduleDef(m.type);
    if (isGenerator(def)) generators.push(m);
    else if (isSolar(def)) panels.push(m);
    else if (def.batteryKWh) batteries.push(m);
    else if (isConsumer(sim, m)) {
      const d = currentDemand(sim, m, hours);
      consumers.push({ m, demand: d });
      demand += d;
    } else if (def.powerUse === undefined && m.type !== 'cocina') {
      // Módulos sin electricidad: nunca están "con energía" (la cocina la gestiona stations.ts).
      m.powered = false;
    }
  }

  /* 3. Generación solar */
  const light = daylight(st.time);
  const cloud = clamp(finite(st.weather.cloudiness), 0, 1);
  let solar = 0;
  for (const m of panels) {
    const def = moduleDef(m.type);
    const p = m.on && isOperational(m) ? (def.powerGen ?? 0) * light * (1 - SOLAR_CLOUD_LOSS * cloud) * conditionFactor(m) : 0;
    m.powered = p > 0.005;
    if (m.powered) loads.set(m.id, 1);
    solar += p;
  }

  /* 4. Generadores de combustible (arrancan por déficit o para recargar baterías) */
  const maxBatteryKW = BATTERY_MAX_KW * cap.batteries;
  const batteryRoom = cap.batteryKWh - u.batteryKWh;
  let generation = solar;
  let potential = solar;
  for (const g of [...generators].sort((a, b) => a.id - b.id)) {
    const def = moduleDef(g.type);
    if (!g.on || !isOperational(g)) {
      g.powered = false;
      continue;
    }
    const kw = (def.powerGen ?? 0) * conditionFactor(g);
    if (hasFuel(g)) potential += kw;
    const wasRunning = g.powered;
    const deficit = generation < demand - 1e-6;
    const wantsCharge =
      cap.batteryKWh > 0 &&
      generation < demand + maxBatteryKW - 1e-6 &&
      (wasRunning ? batteryRoom > 0.01 : u.batteryKWh < cap.batteryKWh * GEN_RESTART_FRACTION);
    if (!deficit && !wantsCharge) {
      g.powered = false;
      continue;
    }
    const burned = burnFuel(g, dt);
    if (burned <= 1e-9) {
      g.powered = false;
      const batteryCovers = u.batteryKWh > 0.05 && demand - generation <= maxBatteryKW;
      if (deficit && !batteryCovers) {
        warnOnce(sim, `gen-fuel:${g.id}`, `${withArticle(def.name, true)} se ha quedado sin combustible`, 'warn');
      }
      continue;
    }
    clearWarn(sim, `gen-fuel:${g.id}`);
    const left = fuelMinutes(g);
    if (left < GEN_LOW_FUEL_MIN) {
      warnOnce(sim, `gen-low:${g.id}`, `${capitalize(toArticle(def.name))} le queda combustible para unos ${Math.max(1, Math.round(left))} min`, 'warn');
    } else if (left > GEN_LOW_FUEL_RESET) clearWarn(sim, `gen-low:${g.id}`);
    g.powered = true;
    loads.set(g.id, burned / dt);
    generation += kw * (burned / dt);
  }

  /* 5. Baterías */
  let discharge = 0;
  const balance = generation - demand;
  const storedBefore = u.batteryKWh;
  if (balance >= 0) {
    const charge = Math.min(balance, maxBatteryKW) * hours;
    u.batteryKWh = Math.min(cap.batteryKWh, u.batteryKWh + charge);
  } else {
    const available = Math.min(maxBatteryKW, u.batteryKWh / hours);
    discharge = Math.min(-balance, available);
    u.batteryKWh = Math.max(0, u.batteryKWh - discharge * hours);
  }
  const batteryLoad = maxBatteryKW > 0 ? clamp(Math.abs(u.batteryKWh - storedBefore) / hours / maxBatteryKW, 0, 1) : 0;
  for (const b of batteries) {
    b.powered = b.status === 'active';
    if (b.powered && batteryLoad > 0) loads.set(b.id, batteryLoad);
  }
  if (u.batteryKWh > 0.01) potential += maxBatteryKW;

  const satisfaction = demand > 1e-9 ? clamp((generation + discharge) / demand, 0, 1) : 1;

  /* 6. ¿Recibe energía cada consumidor? */
  const spare = Math.max(0, potential - demand);
  for (const { m, demand: d } of consumers) {
    if (!m.on || !isOperational(m)) m.powered = false;
    else if (d > 0) {
      m.powered = satisfaction > 0.5;
      const nominal = nominalDemand(sim, m);
      if (m.powered && nominal > 0) loads.set(m.id, clamp(d / nominal, 0, 1) * satisfaction);
    } else {
      const nominal = nominalDemand(sim, m);
      m.powered = nominal > 0 && spare >= nominal * 0.5;
    }
  }

  u.power.generation = generation;
  u.power.demand = demand;
  u.power.satisfaction = satisfaction;

  if (demand > 0 && satisfaction < 0.5) {
    const names = [...new Set(consumers.filter((c) => c.demand > 0).map((c) => (c.m.plots.length ? 'Lámparas de cultivo' : moduleDef(c.m.type).name)))];
    const list = names.map((n) => withArticle(n)).join(', ').replace(/, ([^,]*)$/, ' y $1');
    const verb = names.length > 1 || isPluralName(names[0] ?? '') ? 'se detienen' : 'se detiene';
    warnOnce(sim, 'power-low', `Falta energía: ${list} ${verb}. Revisa generadores, paneles y baterías`, 'warn');
  } else if (demand <= 0 || satisfaction >= 0.95) {
    clearWarn(sim, 'power-low');
  }

  /* 7. Agua */
  let inflow = 0;
  let outflow = 0;
  const rain = clamp(finite(st.weather.rain), 0, 1);
  for (const m of st.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    if (m.type === 'colector' || (def.waterGen && !def.powerUse)) {
      if (isOperational(m) && rain > 0 && moduleHasSky(sim, m)) inflow += (def.waterGen ?? 0) * rain;
    } else if (def.waterGen && def.powerUse) {
      // Potabilizadora: trabaja a velocidad × satisfacción mientras haya hueco y energía.
      if (m.on && isOperational(m) && m.powered && waterRoomL > 1e-6) {
        const litres = Math.min(waterRoomL, (def.waterGen ?? 0) * conditionFactor(m) * hours) * satisfaction;
        inflow += litres / hours;
      }
    }
    if (def.waterCapacity && m.type !== 'colector') {
      if (m.leak) outflow += LEAK_L_PER_HOUR;
      else if (m.condition < 50) outflow += DAMAGED_TANK_L_PER_HOUR;
    }
  }
  const raw = u.waterL + (inflow - outflow) * hours;
  let effIn = inflow;
  let effOut = outflow;
  if (raw > cap.waterL) effIn = Math.max(0, effIn - (raw - cap.waterL) / hours);
  if (raw < 0) effOut = Math.max(0, effOut + raw / hours);
  u.waterL = clamp(raw, 0, cap.waterL);

  const k = 1 - Math.exp(-dt / WATER_SMOOTH_MIN);
  u.water.inPerHour += (effIn + externalIn - u.water.inPerHour) * k;
  u.water.outPerHour += (effOut + externalOut - u.water.outPerHour) * k;
  if (u.water.inPerHour < 1e-3) u.water.inPerHour = 0;
  if (u.water.outPerHour < 1e-3) u.water.outPerHour = 0;

  if (cap.waterL > 0 && u.waterL > WATER_EMPTY_L && u.waterL < cap.waterL * WATER_LOW_FRACTION) {
    warnOnce(sim, 'water-low', `Queda poca agua en los depósitos (${Math.round(u.waterL)} L)`, 'warn');
  } else if (u.waterL > cap.waterL * WATER_LOW_RESET) {
    clearWarn(sim, 'water-low');
  }
  if (cap.waterL > 0 && u.waterL <= WATER_EMPTY_L) {
    warnOnce(sim, 'water-empty', '¡Los depósitos de agua están vacíos! Recoge lluvia, destila agua de mar o construye una potabilizadora', 'danger', true);
  } else if (u.waterL > 5) {
    clearWarn(sim, 'water-empty');
  }

  waterSnapshot.set(sim, { waterL: u.waterL, time: st.time });
}

/* ------------------------------------------------------------------ */
/* Comandos                                                            */
/* ------------------------------------------------------------------ */

/** Enciende o apaga un generador, panel o consumidor eléctrico (incluidas las lámparas de cultivo). */
export function togglePower(sim: Simulation, moduleId: number): ActionResult {
  const m = findModule(sim, moduleId);
  if (!m) return { ok: false, msg: 'Ese módulo ya no existe' };
  const def = moduleDef(m.type);
  if (m.status === 'construction') return { ok: false, msg: `${withArticle(def.name, true)} aún está en obras` };
  if (!hasPowerSwitch(sim, m)) {
    if (m.plots.length) return { ok: false, msg: 'Este huerto no tiene lámparas de cultivo' };
    return { ok: false, msg: `${withArticle(def.name, true)} no tiene interruptor` };
  }
  m.on = !m.on;
  if (!m.on) m.powered = false;
  const c = moduleCenter(m, sim.state.ship.width);
  sim.bus.emit('sfx', { name: 'interruptor', x: c.x, y: c.y + 1, z: c.z });
  const label = m.plots.length ? 'Lámparas de cultivo' : def.name;
  let msg = `${label} ${agree(label, m.on ? 'encendido' : 'apagado')}`;
  if (m.on && def.fuelSlots && !hasFuel(m)) msg += ' (sin combustible: añade madera o un bidón)';
  else if (m.on && m.status === 'broken') {
    msg += ` (está ${agree(def.name, 'averiado')}: no funcionará hasta reparar${isFeminineName(def.name) ? 'la' : 'lo'})`;
  }
  return { ok: true, msg };
}

/** Desglose de la red eléctrica para paneles de estado: quién produce y quién consume ahora. */
export function powerBreakdown(sim: Simulation): { moduleId: number; name: string; kw: number; role: 'gen' | 'use' | 'battery'; on: boolean; powered: boolean }[] {
  const out: { moduleId: number; name: string; kw: number; role: 'gen' | 'use' | 'battery'; on: boolean; powered: boolean }[] = [];
  const st = sim.state;
  const light = daylight(st.time);
  for (const m of st.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    if (def.powerGen) {
      const kw = !m.powered
        ? 0
        : isSolar(def)
          ? (def.powerGen ?? 0) * light * (1 - SOLAR_CLOUD_LOSS * clamp(st.weather.cloudiness, 0, 1)) * conditionFactor(m)
          : (def.powerGen ?? 0) * conditionFactor(m);
      out.push({ moduleId: m.id, name: def.name, kw, role: 'gen', on: m.on, powered: m.powered });
    } else if (def.batteryKWh) {
      out.push({ moduleId: m.id, name: def.name, kw: 0, role: 'battery', on: true, powered: m.powered });
    } else if (isConsumer(sim, m)) {
      out.push({ moduleId: m.id, name: m.plots.length ? 'Lámparas de cultivo' : def.name, kw: currentDemand(sim, m), role: 'use', on: m.on, powered: m.powered });
    }
  }
  return out;
}

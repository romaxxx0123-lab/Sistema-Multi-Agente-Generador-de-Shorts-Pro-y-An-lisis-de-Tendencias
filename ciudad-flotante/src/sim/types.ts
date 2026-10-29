/**
 * CONTRATO CENTRAL DEL ESTADO DE JUEGO.
 *
 * Todo lo que está en `GameState` es serializable a JSON y se guarda tal cual.
 * Unidades:
 *  - Tiempo de simulación: MINUTOS DE JUEGO (1 segundo real = 1 minuto de juego a velocidad normal).
 *  - Distancias: metros, en el sistema LOCAL DEL BARCO (x = eslora, +x hacia proa; z = manga; y = arriba).
 *  - Agua: litros. Energía: kW (potencia) y kWh (almacenamiento).
 *  - Necesidades: 0..100 (100 = perfecto).
 */

export type ItemId = string;

export interface ItemStack {
  id: ItemId;
  qty: number;
}

export interface Inventory {
  slots: (ItemStack | null)[];
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

/* ------------------------------------------------------------------ */
/* Barco y módulos                                                     */
/* ------------------------------------------------------------------ */

export type Rotation = 0 | 1 | 2 | 3;
export type ModuleStatus = 'construction' | 'active' | 'broken';

export interface CraftJob {
  recipeId: string;
  /** Minutos de juego ya trabajados. */
  progress: number;
  /** Quién lo encargó: 'npc' = un habitante (paga con almacenes, no cuenta para estadísticas, tutorial ni avisos). Ausente = jugador. */
  by?: 'player' | 'npc';
}

export interface PlotState {
  /** Id del cultivo (ver data/crops.ts) o null si está vacío. */
  crop: string | null;
  /** 0..1 */
  growth: number;
  /** Horas de juego seguidas sin agua (si supera el límite, el cultivo muere). */
  dryHours: number;
  dead: boolean;
  /** Plaga activa: el crecimiento se detiene hasta que alguien la retire. */
  pest: boolean;
}

export interface ModuleInstance {
  id: number;
  type: string;
  level: number;
  /** Celda mínima ocupada (esquina) — ver ship.ts `moduleCells`. */
  x: number;
  z: number;
  rot: Rotation;
  status: ModuleStatus;
  /** 0..1 progreso de obra cuando status === 'construction'. */
  buildProgress: number;
  /** 0..100 estado estructural/mecánico. <50 dañado, 0 roto. */
  condition: number;
  /** Motivo de la avería cuando status === 'broken'. */
  brokenReason: string | null;
  /** Almacén o bandeja de salida de una estación. */
  inventory: Inventory | null;
  /** Ranura de combustible (generador, cocina). */
  fuelInv: Inventory | null;
  /** Minutos de combustión restantes del combustible ya cargado. */
  fuelBurn: number;
  /** Cola de fabricación de la estación. */
  queue: CraftJob[];
  /** Parcelas de cultivo (huerto). */
  plots: PlotState[];
  /** Ocupante asignado de cada cama: 'player', id de habitante o null. */
  beds: (string | null)[];
  /** Interruptor manual (consumidores eléctricos). */
  on: boolean;
  /** Recalculado cada tick: el módulo recibe suficiente energía. */
  powered: boolean;
  /** 0 = sin fuego; 0..100 intensidad del incendio. */
  fire: number;
  /** Fuga de agua activa (depósitos). */
  leak: boolean;
  /** Nivel de mejora (1 = básico). Ausente en partidas antiguas = 1. */
  tier?: number;
  /** Mejora en obras (el módulo sigue funcionando con su nivel actual). */
  upgrade?: { toTier: number; progress: number } | null;
  /** Avance de una máquina automática: vivero → min hacia la pieza siguiente; grúa → min de trabajo del ciclo. Ausente = 0. */
  prodProgress?: number;
  /** Grúa: id del resto al que ha lanzado el gancho (o null). */
  prodTarget?: number | null;
}

export interface ShipState {
  /** Celdas de eslora (crece con las ampliaciones del casco). */
  length: number;
  /** Celdas de manga (fijo). */
  width: number;
  /** Número de niveles (0 bodega, 1 cubierta principal, 2 cubierta superior). */
  levels: number;
  modules: ModuleInstance[];
  /** Se incrementa con cada cambio de distribución (construir, demoler, ampliar, terminar obra). */
  revision: number;
  /** Número de ampliaciones de casco realizadas. */
  hullTier: number;
  /** Ampliación de casco en obra (null si no hay). progress 0..1. */
  expansion: { progress: number } | null;
}

/** Caja suelta en el suelo (restos de demolición, inventario lleno, botín). Nunca se pierden objetos. */
export interface LooseCrate {
  id: number;
  pos: Vec3;
  inventory: Inventory;
  label: string;
}

/* ------------------------------------------------------------------ */
/* Jugador                                                             */
/* ------------------------------------------------------------------ */

export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  health: number;
  /** Calor corporal: <25 frío peligroso. */
  warmth: number;
}

export interface PlayerStats {
  daysSurvived: number;
  itemsCrafted: number;
  debrisCollected: number;
  fishCaught: number;
  modulesBuilt: number;
  repairs: number;
  firesPutOut: number;
}

export interface PlayerState {
  pos: Vec3;
  yaw: number;
  pitch: number;
  needs: Needs;
  /** Horas de juego de enfermedad restantes (0 = sano). */
  sick: number;
  inventory: Inventory;
  /** Ranura activa de la barra rápida (0..7 = primeras 8 ranuras del inventario). */
  hotbar: number;
  /** Prenda de abrigo equipada. */
  clothing: ItemId | null;
  sleeping: null | { moduleId: number | null; bed: number; until: number | null };
  alive: boolean;
  deathCause: string | null;
  stats: PlayerStats;
}

/* ------------------------------------------------------------------ */
/* Habitantes                                                          */
/* ------------------------------------------------------------------ */

export type NpcRole = 'cocinero' | 'jardinero' | 'mecanico' | 'pescador' | 'recolector' | 'libre';

export type NpcActivity =
  | 'idle'
  | 'walking'
  | 'sleeping'
  | 'eating'
  | 'working'
  | 'socializing'
  | 'sheltering'
  | 'firefighting'
  | 'building'
  | 'injured'
  | 'away';

export interface NpcAppearance {
  skin: number;
  shirt: number;
  pants: number;
  hair: number;
  hat: boolean;
  /** Escala de altura ~0.9..1.1 */
  height: number;
}

export interface NpcTask {
  kind: string;
  targetModuleId?: number;
  targetPos?: Vec3;
  /** Minuto de juego en que termina la acción en curso. */
  until?: number;
  data?: Record<string, unknown>;
}

export interface NpcState {
  id: string;
  name: string;
  role: NpcRole;
  /** Rasgo de personalidad breve (texto). */
  trait: string;
  appearance: NpcAppearance;
  pos: Vec3;
  yaw: number;
  needs: { hunger: number; thirst: number; energy: number; mood: number; health: number };
  sick: boolean;
  injured: boolean;
  activity: NpcActivity;
  task: NpcTask | null;
  /** Puntos de ruta restantes (coordenadas locales del barco). */
  path: Vec3[];
  carry: ItemStack | null;
  bed: { moduleId: number; index: number } | null;
  say: { text: string; until: number } | null;
  joinedDay: number;
  /** Minuto de juego en que volverá (expediciones). */
  awayUntil: number | null;
  /** Memoria corta de quejas para no repetirlas. */
  lastComplaintAt: number;
  /** Afinidad con otros habitantes (-100..100) por id. Ausente = sin relaciones aún. */
  relations?: Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* Mundo: clima, viaje, eventos, restos flotantes                      */
/* ------------------------------------------------------------------ */

export type WeatherKind = 'despejado' | 'nublado' | 'lluvia' | 'tormenta' | 'niebla';

export interface WeatherState {
  kind: WeatherKind;
  /** Minutos de juego que quedan del clima actual. */
  remaining: number;
  /** Clima previsto a continuación (para avisos del barómetro). */
  next: WeatherKind;
  /** 0..1 transición visual hacia el clima actual. */
  blend: number;
  /** 0..1 */
  cloudiness: number;
  /** 0..1 */
  rain: number;
  /** 0..1 */
  fog: number;
  /** 0..1 fuerza del viento. */
  wind: number;
  windDir: number;
  /** Altura de ola característica en metros. */
  waveHeight: number;
  /** Temperatura del aire en °C. */
  temperature: number;
  /** >0 durante un relámpago (minutos de juego). */
  lightning: number;
}

export interface Sighting {
  id: number;
  kind: 'naufragio' | 'isla' | 'balsa' | 'mercante' | 'estructura';
  name: string;
  /** Minuto de juego en que se pierde de vista. */
  expiresAt: number;
  /** -1 babor, 1 estribor. */
  side: 1 | -1;
  /** Distancia lateral en metros (visual). */
  distance: number;
  /** Posición longitudinal visual (x local); avanza hacia popa con el tiempo. */
  x: number;
  /** Evento asociado. */
  eventId: number;
}

export interface VoyageState {
  /** Millas náuticas recorridas en total. */
  distance: number;
  /** Nudos actuales (0 si fondeado). */
  speed: number;
  regionId: string;
  /** Millas recorridas dentro de la región actual. */
  regionDistance: number;
  /** Millas que mide la región actual. */
  regionLength: number;
  /** Regiones visitadas en orden. */
  route: string[];
  /** Opciones para la siguiente región (se elige en el timón) o null. */
  nextChoices: string[] | null;
  /** Región elegida para continuar. */
  chosenNext: string | null;
  /** Fondeado hasta este minuto de juego (null = navegando). */
  anchoredUntil: number | null;
  anchorReason: string | null;
  sightings: Sighting[];
}

export interface EventObjective {
  text: string;
  done: boolean;
}

export interface ActiveEvent {
  id: number;
  type: string;
  title: string;
  description: string;
  startedAt: number;
  /** Minuto de juego en que caduca (null = hasta resolverse). */
  endsAt: number | null;
  stage: number;
  objectives: EventObjective[];
  /** Opciones de decisión disponibles en el timón u otro lugar. */
  choices: { id: string; label: string; enabled: boolean; reason?: string }[];
  data: Record<string, unknown>;
}

export interface EventsState {
  active: ActiveEvent[];
  /** tipo -> minuto de juego a partir del cual puede repetirse. */
  cooldowns: Record<string, number>;
  /** Próximo minuto de juego en que el director tirará dados. */
  nextRollAt: number;
  /** Pasos del guion inicial ya ejecutados. */
  scripted: string[];
  history: { type: string; title: string; at: number; success: boolean | null }[];
}

export type DebrisKind = 'tablones' | 'barril' | 'caja' | 'restos' | 'red' | 'bidon' | 'balsa' | 'cofre';

export interface Debris {
  id: number;
  kind: DebrisKind;
  /** Posición en el plano del agua (coordenadas locales del barco). */
  pos: Vec2;
  /** Velocidad de deriva (m/min de juego). */
  vel: Vec2;
  loot: ItemStack[];
  /** Rotación visual inicial. */
  spin: number;
  /** Habitantes a bordo (balsa de náufragos). */
  survivors?: number;
  /** Evento relacionado (si lo hay). */
  eventId?: number;
}

/* ------------------------------------------------------------------ */
/* Redes de energía y agua                                             */
/* ------------------------------------------------------------------ */

export interface UtilitiesState {
  /** kWh almacenados en baterías. */
  batteryKWh: number;
  /** Litros de agua potable en los depósitos. */
  waterL: number;
  /** Resumen del último tick (para la UI). */
  power: { generation: number; demand: number; satisfaction: number; capacityKWh: number };
  water: { capacityL: number; inPerHour: number; outPerHour: number };
}

/* ------------------------------------------------------------------ */
/* Raíz                                                                */
/* ------------------------------------------------------------------ */

export interface LogEntry {
  at: number;
  text: string;
  kind: 'info' | 'good' | 'warn' | 'danger';
}

/** Progreso del hilo narrativo (ver data/story.ts). */
export interface StoryState {
  /** Páginas del cuaderno leídas (números 1..7). */
  pages: number[];
  /** Ya se conoce el rumbo a Puerto Esperanza. */
  revealed: boolean;
  /** Se llegó a Puerto Esperanza (se mostró el final). */
  arrived: boolean;
}

export interface GameState {
  /** Versión del formato de guardado. */
  version: number;
  seed: number;
  /** Estado del RNG determinista. */
  rngState: number;
  /** Minutos de juego desde el inicio (día 1, 00:00 = 0). */
  time: number;
  ship: ShipState;
  crates: LooseCrate[];
  player: PlayerState;
  npcs: NpcState[];
  weather: WeatherState;
  voyage: VoyageState;
  events: EventsState;
  debris: Debris[];
  utilities: UtilitiesState;
  /** Claves de planos/tecnologías desbloqueadas. */
  unlocks: string[];
  tutorial: { done: string[]; dismissed: boolean };
  /** Diario de a bordo (últimas entradas). */
  log: LogEntry[];
  /** Hilo narrativo. Ausente en partidas antiguas. */
  story?: StoryState;
  nextId: number;
}

export const SAVE_VERSION = 1;

/** Constantes de diseño compartidas por simulación, física y render. */

/** Tamaño de una celda de la cuadrícula del barco (metros). */
export const CELL = 4;
/** Altura entre niveles (metros). Nivel 0 = bodega (suelo y=0). */
export const LEVEL_H = 3.2;
/** Altura de las paredes interiores (un poco menos que LEVEL_H: el resto es forjado). */
export const WALL_H = 3.0;
/** Altura de las barandillas. */
export const RAIL_H = 1.1;
/** Ancho de los vanos de puerta. */
export const DOOR_W = 1.5;
/** Altura de los vanos de puerta. */
export const DOOR_H = 2.3;
/** Grosor de pared para colisiones. */
export const WALL_T = 0.24;
/** Desplazamiento X de la celda 0 (popa). La celda x tiene centro en (x + 0.5) * CELL - SHIP_ORIGIN_X. */
export const SHIP_ORIGIN_X = 20;
/** Línea de flotación (y local del barco). */
export const WATERLINE_Y = 1.0;

/** Eslora inicial y máxima (celdas). Ancho fijo. */
export const SHIP_START_LENGTH = 10;
export const SHIP_MAX_LENGTH = 18;
export const SHIP_WIDTH = 4;
export const SHIP_LEVELS = 3;
/** Celdas añadidas por cada ampliación de casco. */
export const HULL_EXPANSION_CELLS = 2;

/** Minutos de juego por segundo real a velocidad normal. */
export const TIME_SCALE = 1;
/** Multiplicador de tiempo mientras se duerme. */
export const SLEEP_TIME_SCALE = 14;
export const MINUTES_PER_DAY = 24 * 60;
/** Hora de inicio de la partida (día 1). */
export const START_HOUR = 7;

/** Tamaño de inventarios. */
export const PLAYER_SLOTS = 24;
export const HOTBAR_SLOTS = 8;

/** Radio de interacción del jugador (m). */
export const INTERACT_RANGE = 2.6;
/** Alcance del gancho de rescate (m, horizontal desde el jugador). */
export const HOOK_RANGE = 24;
/** Distancia máxima al borde de la cubierta para pescar / usar el cubo (m). */
export const RAIL_USE_RANGE = 1.8;

/** Velocidad de crucero (nudos). */
export const CRUISE_SPEED = 6;
/** Velocidad visual del agua respecto al barco (m por minuto de juego = m/s reales). */
export const VISUAL_DRIFT = 2.6;

/** Necesidades: cambio por hora de juego. */
export const NEED_RATES = {
  hungerPerHour: -5.5,
  thirstPerHour: -8.5,
  energyPerHourAwake: -4.6,
  energyPerHourBed: 15,
  energyPerHourFloor: 8,
  warmthRatePerHour: 30,
  healthRegenPerHour: 2.5,
  starvingDamagePerHour: 9,
  dehydrationDamagePerHour: 12,
  coldDamagePerHour: 7,
  sickDamagePerHour: 3,
  exhaustedDamagePerHour: 2,
};

/** Agua: litros por bebida directa del depósito o botella llenada. */
export const WATER_PER_DRINK = 1;

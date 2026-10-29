import type { DebrisKind, WeatherKind } from '../sim/types';

export interface RegionDef {
  id: string;
  name: string;
  desc: string;
  /** Millas náuticas. */
  length: number;
  /** Temperatura base del aire (°C) a mediodía con cielo despejado. */
  baseTemp: number;
  /** Multiplicador de velocidad del barco (corrientes, algas). */
  speedMult: number;
  weather: Record<WeatherKind, number>;
  /** Restos flotantes por hora de juego (media). */
  debrisPerHour: number;
  debrisWeights: Partial<Record<DebrisKind, number>>;
  /** Multiplicador de probabilidad de picada al pescar. */
  fishMult: number;
  /** Pesos de eventos aleatorios en esta región (ver sim/events.ts). */
  eventWeights: Record<string, number>;
  /** Siguientes regiones posibles. */
  next: string[];
  /** Paleta visual. */
  palette: { water: string; waterDeep: string; sky: string; horizon: string; fog: string };
  /** Peligro 1..5 (UI). */
  danger: number;
}

const defs: RegionDef[] = [
  {
    id: 'templadas',
    name: 'Aguas Templadas',
    desc: 'Mar en calma y clima amable. Buen lugar para empezar a organizarse.',
    length: 60,
    baseTemp: 23,
    speedMult: 1,
    weather: { despejado: 5, nublado: 3, lluvia: 1.6, tormenta: 0.35, niebla: 0.3 },
    debrisPerHour: 7,
    debrisWeights: { tablones: 5, caja: 3, barril: 2, restos: 3, red: 1, bidon: 1 },
    fishMult: 1,
    eventWeights: { naufragio: 2, isla: 1.2, naufragos: 1.2, averia: 1, banco_peces: 1.5, mercante: 1, plaga: 0.6, fuga: 0.6, incendio: 0.5, enfermedad: 0.5, discusion: 0.6 },
    next: ['sargazos', 'archipielago'],
    palette: { water: '#2fa3c6', waterDeep: '#155e80', sky: '#7cc4e8', horizon: '#f6ecd2', fog: '#bfe0ea' },
    danger: 1,
  },
  {
    id: 'sargazos',
    name: 'Mar de los Sargazos',
    desc: 'Algas por todas partes: el barco avanza lento, pero abundan la fibra y la pesca.',
    length: 70,
    baseTemp: 26,
    speedMult: 0.75,
    weather: { despejado: 5, nublado: 2.5, lluvia: 1, tormenta: 0.3, niebla: 0.6 },
    debrisPerHour: 8,
    debrisWeights: { tablones: 3, red: 5, caja: 2, barril: 2, restos: 2, bidon: 1 },
    fishMult: 1.6,
    eventWeights: { naufragio: 1.5, isla: 0.6, naufragos: 1.2, averia: 1, banco_peces: 2.5, mercante: 1.2, plaga: 1, fuga: 0.7, incendio: 0.6, enfermedad: 0.7, discusion: 0.7 },
    next: ['archipielago', 'cementerio'],
    palette: { water: '#3aa38a', waterDeep: '#1d5c4f', sky: '#8fd0d8', horizon: '#f3eccb', fog: '#c6e3d8' },
    danger: 1,
  },
  {
    id: 'archipielago',
    name: 'Archipiélago Esmeralda',
    desc: 'Islas verdes y lluvias tropicales. Ideal para enviar expediciones y llenar los depósitos.',
    length: 80,
    baseTemp: 27,
    speedMult: 1,
    weather: { despejado: 3, nublado: 2.5, lluvia: 3, tormenta: 0.6, niebla: 0.4 },
    debrisPerHour: 6,
    debrisWeights: { tablones: 5, caja: 3, barril: 2, restos: 1, red: 2, bidon: 1 },
    fishMult: 1.2,
    eventWeights: { naufragio: 1, isla: 3.5, naufragos: 1.5, averia: 1, banco_peces: 1.5, mercante: 1.5, plaga: 1.2, fuga: 0.7, incendio: 0.6, enfermedad: 1, discusion: 0.7 },
    next: ['cementerio', 'boreal'],
    palette: { water: '#22b5b0', waterDeep: '#0f6b73', sky: '#86d1e0', horizon: '#fbf1cf', fog: '#c0e6e0' },
    danger: 2,
  },
  {
    id: 'cementerio',
    name: 'Cementerio de Barcos',
    desc: 'Cascos oxidados a la deriva y bancos de niebla. Metal y componentes en abundancia… y averías.',
    length: 80,
    baseTemp: 17,
    speedMult: 0.9,
    weather: { despejado: 1.5, nublado: 3, lluvia: 1.5, tormenta: 1, niebla: 3 },
    debrisPerHour: 9,
    debrisWeights: { restos: 6, caja: 3, barril: 2, bidon: 3, tablones: 2, cofre: 1 },
    fishMult: 0.8,
    eventWeights: { naufragio: 4, isla: 0.4, naufragos: 1.5, averia: 1.6, banco_peces: 0.6, mercante: 1, plaga: 0.5, fuga: 1, incendio: 1, enfermedad: 0.8, discusion: 0.9 },
    next: ['boreal', 'tormentas'],
    palette: { water: '#3f7f8f', waterDeep: '#1c3d4a', sky: '#9fb5be', horizon: '#d9d6c8', fog: '#a9b9bd' },
    danger: 3,
  },
  {
    id: 'boreal',
    name: 'Corriente Boreal',
    desc: 'Aguas frías y ricas en peces. Sin abrigo ni interiores calientes, el frío mata.',
    length: 90,
    baseTemp: 5,
    speedMult: 1.15,
    weather: { despejado: 2, nublado: 3, lluvia: 1.5, tormenta: 0.8, niebla: 2 },
    debrisPerHour: 6,
    debrisWeights: { tablones: 3, caja: 2, barril: 3, restos: 3, red: 2, bidon: 2 },
    fishMult: 1.8,
    eventWeights: { naufragio: 1.5, isla: 0.8, naufragos: 1, averia: 1.3, banco_peces: 2, mercante: 0.8, plaga: 0.4, fuga: 1.2, incendio: 0.8, enfermedad: 1.6, discusion: 1 },
    next: ['tormentas', 'faro'],
    palette: { water: '#3d7ea6', waterDeep: '#173a5e', sky: '#a7c7dc', horizon: '#e8eef2', fog: '#c9d6df' },
    danger: 3,
  },
  {
    id: 'tormentas',
    name: 'Mar de las Tormentas',
    desc: 'Oleaje constante y tempestades. Restos valiosos para quien sobreviva.',
    length: 90,
    baseTemp: 13,
    speedMult: 1,
    weather: { despejado: 1, nublado: 2.5, lluvia: 2.5, tormenta: 3, niebla: 0.5 },
    debrisPerHour: 8,
    debrisWeights: { restos: 4, caja: 3, barril: 2, bidon: 2, tablones: 3, cofre: 1.5 },
    fishMult: 1,
    eventWeights: { naufragio: 2.5, isla: 0.6, naufragos: 1.8, averia: 1.6, banco_peces: 0.8, mercante: 0.6, plaga: 0.5, fuga: 1.4, incendio: 1.2, enfermedad: 1, discusion: 1.2 },
    next: ['faro', 'boreal'],
    palette: { water: '#2f6f86', waterDeep: '#122f40', sky: '#7f97a8', horizon: '#c9cfd2', fog: '#8fa1ad' },
    danger: 5,
  },
  {
    id: 'faro',
    name: 'El Faro del Fin del Mundo',
    desc: 'Un faro solitario que nadie recuerda haber construido. Señales extrañas llegan por radio.',
    length: 100,
    baseTemp: 10,
    speedMult: 1,
    weather: { despejado: 2, nublado: 2, lluvia: 1.5, tormenta: 1.2, niebla: 3 },
    debrisPerHour: 7,
    debrisWeights: { restos: 3, caja: 3, barril: 2, bidon: 2, tablones: 2, cofre: 2 },
    fishMult: 1.2,
    eventWeights: { naufragio: 2, isla: 1, naufragos: 1.5, averia: 1.3, banco_peces: 1, mercante: 1.5, plaga: 0.6, fuga: 1, incendio: 1, enfermedad: 1, discusion: 1 },
    next: ['templadas', 'cementerio'],
    palette: { water: '#35698a', waterDeep: '#132c45', sky: '#8c9fc0', horizon: '#e6d9c9', fog: '#a3abc2' },
    danger: 4,
  },
];

export const REGIONS: Record<string, RegionDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const REGION_LIST = defs;
export const START_REGION = 'templadas';

export function regionDef(id: string): RegionDef {
  const r = REGIONS[id];
  if (!r) throw new Error(`Región desconocida: ${id}`);
  return r;
}

/**
 * Paleta de dirección artística (low-poly estilizado, "barco de expedición con añadidos
 * industriales y caseros"). Todas las vistas deben usar estos colores para ser coherentes.
 */
export const PALETTE = {
  // Casco y estructura
  hull: '#2f4858',
  hullDark: '#22333f',
  hullStripe: '#c8553d',
  waterline: '#e8dcc0',
  deckWood: '#c89f6c',
  deckWoodDark: '#a87f4f',
  holdFloor: '#7a6a58',
  wallOuter: '#efe3c8',
  wallInner: '#f3ead6',
  wallTrim: '#3d7a8a',
  roof: '#3d7a8a',
  roofDark: '#2f6070',
  metal: '#8a9399',
  metalDark: '#5c6770',
  rust: '#b5651d',
  rail: '#e8dcc0',
  railPost: '#5c6770',
  window: '#9ed8e6',
  windowNight: '#ffd27d',
  door: '#8b5e3c',
  // Detalles
  accent: '#e0a458',
  rope: '#d6b97b',
  canvas: '#e8dcc0',
  plant: '#6a994e',
  plantDark: '#386641',
  soil: '#5b4636',
  fire: '#ff7b25',
  // Personas
  skins: ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'],
  shirts: ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#f4a261', '#6d597a', '#457b9d', '#bc4749'],
  pants: ['#3d405b', '#5a4632', '#2b2d42', '#6b705c', '#264653'],
  hair: ['#2b2118', '#5a3825', '#a0522d', '#d4a017', '#1a1a1a', '#b0b0b0'],
  // Mar y cielo (por defecto; cada región aporta su variante)
  water: '#2fa3c6',
  waterDeep: '#155e80',
  foam: '#e8f4f2',
  skyDay: '#7cc4e8',
  horizonDay: '#f6ecd2',
  skySunset: '#f4a261',
  skyNight: '#0b1d33',
  horizonNight: '#1d3557',
} as const;

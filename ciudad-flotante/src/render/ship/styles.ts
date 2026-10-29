/**
 * Estilo interior de cada tipo de habitación: suelo, paredes y techo. Da identidad a cada
 * estancia (la cocina con azulejos, el taller con chapa, el camarote con madera cálida…).
 */
import { PALETTE } from '../palette';

export type FloorPattern = 'planks' | 'tiles' | 'metal' | 'parquet';

export interface RoomStyle {
  floor: FloorPattern;
  floorA: string;
  floorB: string;
  /** Tira inferior (zócalo alto / friso). */
  wallLower: string;
  wallUpper: string;
  /** Color del rodapié y la moldura. */
  trim: string;
  ceiling: string;
  /** Pantalla de las lámparas de techo. */
  lampShade: string;
}

const base: RoomStyle = {
  floor: 'planks',
  floorA: '#b5835a',
  floorB: '#a3744d',
  wallLower: '#9a6b45',
  wallUpper: PALETTE.wallInner,
  trim: '#6e4a2e',
  ceiling: '#efe5cf',
  lampShade: PALETTE.wallTrim,
};

export const ROOM_STYLES: Record<string, RoomStyle> = {
  camarote: { ...base, floorA: '#b5835a', floorB: '#a8774f', wallUpper: '#f3e6cc', wallLower: '#9a6b45' },
  dormitorio: { ...base, floorA: '#a8794f', floorB: '#986b44', wallUpper: '#dfe7e4', wallLower: '#7d5a3c', lampShade: '#6d597a' },
  cocina: { ...base, floor: 'tiles', floorA: '#efe6cf', floorB: '#3d7a8a', wallUpper: '#f6e7b8', wallLower: '#e9efe9', trim: '#3d7a8a', lampShade: '#bc4749' },
  comedor: { ...base, floor: 'parquet', floorA: '#b07d48', floorB: '#94653a', wallUpper: '#f0d9b5', wallLower: '#8b5e3c', lampShade: '#e0a458' },
  almacen: { ...base, floorA: '#8f7458', floorB: '#7f664c', wallUpper: '#c8ad86', wallLower: '#a98a66', trim: '#5c4632', lampShade: PALETTE.metalDark },
  taller: { ...base, floor: 'metal', floorA: '#7d8790', floorB: '#6c757d', wallUpper: '#c9d1c8', wallLower: '#5c6770', trim: '#3a4249', lampShade: '#e0a458' },
  enfermeria: { ...base, floor: 'tiles', floorA: '#e4eeeb', floorB: '#c4dcd6', wallUpper: '#f2f8f6', wallLower: '#bfe0da', trim: '#7fb5ab', lampShade: '#e8f4f2' },
  motor: { ...base, floor: 'metal', floorA: '#6c757d', floorB: '#5c6770', wallUpper: '#9aa5ad', wallLower: '#4a535b', trim: '#2f363c', lampShade: '#e0a458' },
  puente: { ...base, floor: 'parquet', floorA: '#7a4f30', floorB: '#6a4428', wallUpper: '#f3ead6', wallLower: '#6e4a2e', lampShade: PALETTE.wallTrim },
};

export function roomStyle(type: string | null | undefined): RoomStyle {
  return (type && ROOM_STYLES[type]) || base;
}

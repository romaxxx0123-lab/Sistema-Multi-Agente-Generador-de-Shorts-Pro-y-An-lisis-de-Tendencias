import type { ItemId } from '../sim/types';

export interface CropDef {
  id: string;
  name: string;
  seed: ItemId;
  /** Horas de juego para madurar con agua y luz. */
  growHours: number;
  /** Litros por hora de juego mientras crece. */
  waterPerHour: number;
  /** Horas sin agua antes de morir. */
  dryHoursToDie: number;
  yield: { id: ItemId; min: number; max: number }[];
  /** Probabilidad de devolver semillas extra y cuántas. */
  seedReturn: { chance: number; min: number; max: number };
  color: string;
}

export const CROPS: Record<string, CropDef> = {
  hortaliza: {
    id: 'hortaliza',
    name: 'Hortalizas',
    seed: 'semilla_hortaliza',
    growHours: 28,
    waterPerHour: 0.18,
    dryHoursToDie: 18,
    yield: [{ id: 'hortaliza', min: 3, max: 5 }],
    seedReturn: { chance: 0.85, min: 1, max: 2 },
    color: '#6a994e',
  },
  lino: {
    id: 'lino',
    name: 'Lino',
    seed: 'semilla_lino',
    growHours: 24,
    waterPerHour: 0.15,
    dryHoursToDie: 20,
    yield: [{ id: 'fibra', min: 4, max: 6 }],
    seedReturn: { chance: 0.85, min: 1, max: 2 },
    color: '#7fb3d5',
  },
};

export function cropForSeed(seed: ItemId): string | null {
  for (const c of Object.values(CROPS)) if (c.seed === seed) return c.id;
  return null;
}

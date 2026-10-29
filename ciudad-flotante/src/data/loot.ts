import type { DebrisKind, ItemId } from '../sim/types';

export interface LootEntry {
  id: ItemId;
  min: number;
  max: number;
  /** Probabilidad de que aparezca (0..1). */
  chance: number;
}

/** Botín de cada tipo de resto flotante. */
export const DEBRIS_LOOT: Record<DebrisKind, LootEntry[]> = {
  tablones: [
    { id: 'madera', min: 2, max: 4, chance: 1 },
    { id: 'cuerda', min: 1, max: 1, chance: 0.15 },
  ],
  barril: [
    { id: 'conserva', min: 1, max: 2, chance: 0.55 },
    { id: 'agua_potable', min: 1, max: 2, chance: 0.5 },
    { id: 'combustible', min: 1, max: 1, chance: 0.25 },
    { id: 'plastico', min: 1, max: 2, chance: 0.4 },
  ],
  caja: [
    { id: 'madera', min: 1, max: 3, chance: 0.7 },
    { id: 'tela', min: 1, max: 2, chance: 0.4 },
    { id: 'cuerda', min: 1, max: 2, chance: 0.35 },
    { id: 'conserva', min: 1, max: 1, chance: 0.3 },
    { id: 'tornillos', min: 2, max: 5, chance: 0.3 },
    { id: 'semilla_hortaliza', min: 1, max: 2, chance: 0.15 },
    { id: 'semilla_lino', min: 1, max: 2, chance: 0.12 },
  ],
  restos: [
    { id: 'chatarra', min: 2, max: 4, chance: 1 },
    { id: 'plastico', min: 1, max: 2, chance: 0.45 },
    { id: 'tornillos', min: 1, max: 4, chance: 0.4 },
    { id: 'componentes', min: 1, max: 1, chance: 0.05 },
  ],
  red: [
    { id: 'fibra', min: 2, max: 4, chance: 0.9 },
    { id: 'cuerda', min: 1, max: 2, chance: 0.5 },
    { id: 'pescado_crudo', min: 1, max: 2, chance: 0.45 },
    { id: 'plastico', min: 1, max: 1, chance: 0.3 },
  ],
  bidon: [
    { id: 'combustible', min: 1, max: 1, chance: 0.8 },
    { id: 'plastico', min: 1, max: 2, chance: 0.6 },
  ],
  cofre: [
    { id: 'componentes', min: 1, max: 2, chance: 0.9 },
    { id: 'placa_metal', min: 1, max: 3, chance: 0.6 },
    { id: 'botiquin', min: 1, max: 1, chance: 0.3 },
    { id: 'pieza_mecanica', min: 1, max: 1, chance: 0.3 },
  ],
  balsa: [
    { id: 'madera', min: 3, max: 5, chance: 1 },
    { id: 'cuerda', min: 1, max: 2, chance: 0.6 },
  ],
};

/** Planos que pueden aparecer en naufragios/islas/estructuras, en orden de prioridad de descubrimiento. */
export const BLUEPRINT_ORDER: ItemId[] = [
  'plano_taller',
  'plano_energia',
  'plano_agua',
  'plano_enfermeria',
  'plano_casco',
  'plano_solar',
  'plano_invernadero',
  'plano_motor',
];

/** Ofertas de los mercantes: se elige un subconjunto al azar. */
export const TRADE_OFFERS: { give: Record<ItemId, number>; get: Record<ItemId, number> }[] = [
  { give: { pescado_crudo: 5 }, get: { componentes: 1 } },
  { give: { madera: 15 }, get: { placa_metal: 3 } },
  { give: { hortaliza: 6 }, get: { combustible: 2 } },
  { give: { fibra: 10 }, get: { tela: 3 } },
  { give: { chatarra: 12 }, get: { componentes: 1 } },
  { give: { conserva: 3 }, get: { botiquin: 1 } },
  { give: { tela: 4 }, get: { semilla_hortaliza: 4 } },
  { give: { pescado_asado: 4 }, get: { pieza_mecanica: 1 } },
  { give: { componentes: 3 }, get: { plano_solar: 1 } },
  { give: { placa_metal: 6 }, get: { plano_casco: 1 } },
  { give: { combustible: 2 }, get: { semilla_lino: 4 } },
  { give: { madera: 10 }, get: { conserva: 3 } },
];

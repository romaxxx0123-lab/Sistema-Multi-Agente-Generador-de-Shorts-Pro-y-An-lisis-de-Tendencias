import type { ItemId } from '../sim/types';

export type StationKind = 'mano' | 'banco' | 'taller' | 'cocina';

export interface RecipeDef {
  id: string;
  name: string;
  station: StationKind;
  inputs: Record<ItemId, number>;
  outputs: Record<ItemId, number>;
  /** Minutos de juego de trabajo (0 = instantáneo, solo 'mano'). */
  time: number;
  /** Clave de desbloqueo requerida (ver ITEMS[*].unlocks). */
  unlock?: string;
  desc?: string;
}

const defs: RecipeDef[] = [
  // A mano (instantáneas)
  { id: 'cuerda', name: 'Cuerda', station: 'mano', inputs: { fibra: 3 }, outputs: { cuerda: 1 }, time: 0 },
  { id: 'vendaje', name: 'Vendajes', station: 'mano', inputs: { tela: 1 }, outputs: { vendaje: 2 }, time: 0 },
  // Banco de trabajo
  { id: 'martillo', name: 'Martillo', station: 'banco', inputs: { madera: 2, chatarra: 2 }, outputs: { martillo: 1 }, time: 10 },
  { id: 'cubo', name: 'Cubo', station: 'banco', inputs: { madera: 3, cuerda: 1 }, outputs: { cubo: 1 }, time: 10 },
  { id: 'gancho', name: 'Gancho de rescate', station: 'banco', inputs: { madera: 2, cuerda: 3, chatarra: 2 }, outputs: { gancho: 1 }, time: 15 },
  { id: 'cana', name: 'Caña de pescar', station: 'banco', inputs: { madera: 2, cuerda: 2 }, outputs: { cana: 1 }, time: 10 },
  { id: 'llave_inglesa', name: 'Llave inglesa', station: 'banco', inputs: { chatarra: 4, tornillos: 2 }, outputs: { llave_inglesa: 1 }, time: 15 },
  { id: 'placa_metal', name: 'Placa de metal', station: 'banco', inputs: { chatarra: 3 }, outputs: { placa_metal: 1 }, time: 12 },
  { id: 'tornillos', name: 'Tornillería', station: 'banco', inputs: { chatarra: 1 }, outputs: { tornillos: 4 }, time: 6 },
  { id: 'tela', name: 'Tela', station: 'banco', inputs: { fibra: 4 }, outputs: { tela: 1 }, time: 10 },
  { id: 'kit_reparacion', name: 'Kit de reparación', station: 'banco', inputs: { madera: 3, tornillos: 2, cuerda: 1 }, outputs: { kit_reparacion: 1 }, time: 15 },
  { id: 'abrigo', name: 'Abrigo de lona', station: 'banco', inputs: { tela: 4, cuerda: 1 }, outputs: { abrigo: 1 }, time: 25 },
  { id: 'pieza_improvisada', name: 'Pieza mecánica improvisada', station: 'banco', inputs: { placa_metal: 2, tornillos: 4, chatarra: 2 }, outputs: { pieza_mecanica: 1 }, time: 60, desc: 'Un apaño a martillazos: más cara que la del taller, pero sirve cuando el taller no puede.' },
  { id: 'botiquin', name: 'Botiquín', station: 'banco', inputs: { vendaje: 2, plastico: 1, agua_potable: 1 }, outputs: { botiquin: 1 }, time: 20 },
  // Taller (eléctrico)
  { id: 'pieza_mecanica', name: 'Pieza mecánica', station: 'taller', inputs: { placa_metal: 1, tornillos: 3 }, outputs: { pieza_mecanica: 1 }, time: 30, unlock: 'taller' },
  { id: 'componentes', name: 'Componentes eléctricos', station: 'taller', inputs: { chatarra: 4, plastico: 3 }, outputs: { componentes: 1 }, time: 75, unlock: 'taller' },
  { id: 'placas_lote', name: 'Lote de placas', station: 'taller', inputs: { chatarra: 6 }, outputs: { placa_metal: 3 }, time: 25, unlock: 'taller' },
  { id: 'celula_solar', name: 'Célula solar', station: 'taller', inputs: { componentes: 2, plastico: 1 }, outputs: { celula_solar: 1 }, time: 60, unlock: 'solar' },
  // Cocina (necesita combustible)
  { id: 'pescado_asado', name: 'Pescado asado', station: 'cocina', inputs: { pescado_crudo: 1 }, outputs: { pescado_asado: 1 }, time: 8 },
  { id: 'sopa', name: 'Sopa de verduras', station: 'cocina', inputs: { hortaliza: 2, agua_potable: 1 }, outputs: { sopa: 2 }, time: 20 },
  { id: 'guiso', name: 'Guiso marinero', station: 'cocina', inputs: { pescado_crudo: 1, hortaliza: 1, agua_potable: 1 }, outputs: { guiso: 2 }, time: 30 },
  { id: 'destilar', name: 'Destilar agua de mar', station: 'cocina', inputs: { cubo_agua: 1 }, outputs: { agua_potable: 1, cubo: 1 }, time: 25, desc: 'Hierve el agua salada y condensa el vapor.' },
  { id: 'conserva', name: 'Conservas caseras', station: 'cocina', inputs: { hortaliza: 3, plastico: 1 }, outputs: { conserva: 2 }, time: 40 },
];

export const RECIPES: Record<string, RecipeDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const RECIPE_LIST: RecipeDef[] = defs;

export function recipesFor(station: StationKind): RecipeDef[] {
  return defs.filter((r) => r.station === station);
}

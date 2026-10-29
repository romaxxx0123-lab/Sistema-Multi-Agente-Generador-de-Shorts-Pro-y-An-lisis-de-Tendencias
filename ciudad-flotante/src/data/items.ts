import type { ItemId } from '../sim/types';

export type ItemCategory =
  | 'material'
  | 'comida'
  | 'bebida'
  | 'herramienta'
  | 'medicina'
  | 'pieza'
  | 'semilla'
  | 'plano'
  | 'ropa'
  | 'combustible'
  | 'documento';

export type ToolKind = 'martillo' | 'llave' | 'gancho' | 'cana' | 'cubo' | 'cubo_lleno';

export interface ItemDef {
  id: ItemId;
  name: string;
  desc: string;
  category: ItemCategory;
  stack: number;
  /** Color base para el icono en la UI. */
  color: string;
  /** Efectos al consumir (comer/beber/usar). */
  consume?: {
    hunger?: number;
    thirst?: number;
    energy?: number;
    health?: number;
    warmth?: number;
    /** Probabilidad 0..1 de enfermar (comida cruda, agua salada). */
    sickChance?: number;
    /** Cura la enfermedad. */
    cures?: boolean;
    /** Texto del verbo en la UI. */
    verb: string;
    /** Objeto que queda tras consumir (p.ej. cubo vacío). */
    leaves?: ItemId;
  };
  /** Minutos de combustión en cocina/generador. */
  fuel?: number;
  tool?: ToolKind;
  /** Protección contra el frío (0..1). */
  warmthProtection?: number;
  /** Clave de desbloqueo que concede al usarlo (planos). */
  unlocks?: string;
  /** Valor relativo para comercio. */
  value: number;
}

const defs: ItemDef[] = [
  // Materiales
  { id: 'madera', name: 'Madera', desc: 'Tablones rescatados del mar. La base de casi todo lo que se construye a bordo. También arde.', category: 'material', stack: 50, color: '#b07d48', fuel: 40, value: 1 },
  { id: 'chatarra', name: 'Chatarra', desc: 'Restos metálicos oxidados. En el banco de trabajo se convierten en placas y tornillería.', category: 'material', stack: 50, color: '#8a9399', value: 1 },
  { id: 'placa_metal', name: 'Placa de metal', desc: 'Chapa aplanada y cortada. Necesaria para máquinas y estructuras resistentes.', category: 'material', stack: 30, color: '#9fb3c1', value: 4 },
  { id: 'tornillos', name: 'Tornillería', desc: 'Tornillos, tuercas y remaches. Imprescindible para reparar y montar.', category: 'material', stack: 99, color: '#c9c3b6', value: 1 },
  { id: 'fibra', name: 'Fibra vegetal', desc: 'Fibras de lino o sargazo seco. Se trenza en cuerda o se teje en tela.', category: 'material', stack: 50, color: '#a9b665', value: 1 },
  { id: 'cuerda', name: 'Cuerda', desc: 'Cuerda trenzada. Útil para herramientas, aparejos y reparaciones.', category: 'material', stack: 30, color: '#d6b97b', value: 2 },
  { id: 'tela', name: 'Tela', desc: 'Lona resistente. Para camas, abrigo, vendajes y colectores de lluvia.', category: 'material', stack: 30, color: '#e8dcc0', value: 3 },
  { id: 'plastico', name: 'Plástico', desc: 'Envases y láminas de plástico. Sirve para botiquines y componentes.', category: 'material', stack: 50, color: '#5fb3c9', value: 2 },
  { id: 'componentes', name: 'Componentes eléctricos', desc: 'Cables, placas y bobinas. Escasos: aparecen en naufragios o se fabrican en el taller.', category: 'material', stack: 20, color: '#e0a458', value: 10 },
  { id: 'combustible', name: 'Bidón de combustible', desc: 'Gasoil rescatado. Alimenta el generador y la cocina durante horas.', category: 'combustible', stack: 10, color: '#c8553d', fuel: 360, value: 8 },
  // Piezas
  { id: 'pieza_mecanica', name: 'Pieza mecánica', desc: 'Engranajes y ejes de repuesto. Repara máquinas averiadas con la llave inglesa.', category: 'pieza', stack: 10, color: '#7d8597', value: 8 },
  { id: 'kit_reparacion', name: 'Kit de reparación', desc: 'Tablones, clavos y masilla. Repara estructuras dañadas con el martillo.', category: 'pieza', stack: 10, color: '#d4a373', value: 5 },
  { id: 'celula_solar', name: 'Célula solar', desc: 'Lámina fotovoltaica montada. Se usa para construir paneles solares.', category: 'pieza', stack: 10, color: '#3d5a80', value: 14 },
  // Comida
  { id: 'pescado_crudo', name: 'Pescado crudo', desc: 'Fresco del mar. Mejor cocinarlo: crudo puede sentar mal.', category: 'comida', stack: 10, color: '#8ecae6', consume: { hunger: 12, sickChance: 0.3, verb: 'Comer' }, value: 2 },
  { id: 'pescado_asado', name: 'Pescado asado', desc: 'Pescado a la brasa. Sencillo y sabroso.', category: 'comida', stack: 10, color: '#e9a25f', consume: { hunger: 30, verb: 'Comer' }, value: 4 },
  { id: 'hortaliza', name: 'Hortalizas', desc: 'Verduras del huerto de a bordo.', category: 'comida', stack: 20, color: '#90be6d', consume: { hunger: 12, thirst: 4, verb: 'Comer' }, value: 2 },
  { id: 'fruta', name: 'Fruta tropical', desc: 'Traída de una isla. Dulce y jugosa.', category: 'comida', stack: 20, color: '#f9c74f', consume: { hunger: 14, thirst: 10, verb: 'Comer' }, value: 3 },
  { id: 'pescado_ahumado', name: 'Pescado ahumado', desc: 'Ahumado con leña: aguanta lo que haga falta y llena bastante. Algo salado.', category: 'comida', stack: 20, color: '#c97c3d', consume: { hunger: 26, thirst: -3, verb: 'Comer' }, value: 5 },
  { id: 'conserva', name: 'Lata de conserva', desc: 'Comida en lata. No caduca y llena bastante.', category: 'comida', stack: 20, color: '#adb5bd', consume: { hunger: 35, verb: 'Comer' }, value: 5 },
  { id: 'sopa', name: 'Sopa de verduras', desc: 'Caliente y reconfortante. Quita el hambre, la sed y el frío.', category: 'comida', stack: 10, color: '#f4a261', consume: { hunger: 28, thirst: 18, warmth: 15, verb: 'Tomar' }, value: 6 },
  { id: 'guiso', name: 'Guiso marinero', desc: 'Pescado con verduras a fuego lento. La mejor comida a bordo.', category: 'comida', stack: 10, color: '#bc6c25', consume: { hunger: 50, thirst: 10, warmth: 20, energy: 6, verb: 'Comer' }, value: 9 },
  // Bebida
  { id: 'agua_potable', name: 'Botella de agua', desc: 'Agua potable. Se rellena en cualquier depósito.', category: 'bebida', stack: 10, color: '#4cc9f0', consume: { thirst: 40, verb: 'Beber' }, value: 3 },
  { id: 'cubo_agua', name: 'Cubo de agua de mar', desc: 'Agua salada: no se bebe. Sirve para apagar fuegos o destilarla en la cocina.', category: 'herramienta', stack: 1, color: '#2a9d8f', tool: 'cubo_lleno', consume: { thirst: -8, health: -6, sickChance: 0.5, verb: 'Beber (salada)', leaves: 'cubo' }, value: 2 },
  // Semillas
  { id: 'semilla_hortaliza', name: 'Semillas de hortaliza', desc: 'Se plantan en un huerto. Necesitan agua de los depósitos y luz.', category: 'semilla', stack: 20, color: '#6a994e', value: 2 },
  { id: 'semilla_lino', name: 'Semillas de lino', desc: 'El lino da fibra para cuerda y tela.', category: 'semilla', stack: 20, color: '#577590', value: 2 },
  // Medicina
  { id: 'vendaje', name: 'Vendaje', desc: 'Cura heridas leves.', category: 'medicina', stack: 10, color: '#f8f9fa', consume: { health: 15, verb: 'Usar' }, value: 3 },
  { id: 'botiquin', name: 'Botiquín', desc: 'Cura heridas graves y enfermedades. También sirve para atender a los habitantes.', category: 'medicina', stack: 5, color: '#e63946', consume: { health: 40, cures: true, verb: 'Usar' }, value: 10 },
  // Herramientas
  { id: 'martillo', name: 'Martillo', desc: 'Para ayudar en las obras y reparar estructuras dañadas (con kit de reparación).', category: 'herramienta', stack: 1, color: '#9c6644', tool: 'martillo', value: 5 },
  { id: 'llave_inglesa', name: 'Llave inglesa', desc: 'Repara máquinas averiadas usando piezas mecánicas.', category: 'herramienta', stack: 1, color: '#6c757d', tool: 'llave', value: 6 },
  { id: 'gancho', name: 'Gancho de rescate', desc: 'Lánzalo desde la borda hacia los restos flotantes para recuperarlos.', category: 'herramienta', stack: 1, color: '#495057', tool: 'gancho', value: 6 },
  { id: 'cana', name: 'Caña de pescar', desc: 'Lánzala desde la borda y espera a que piquen. ¡Recoge en el momento justo!', category: 'herramienta', stack: 1, color: '#bc8a5f', tool: 'cana', value: 5 },
  { id: 'cubo', name: 'Cubo', desc: 'Llénalo de agua de mar en la borda. Apaga fuegos y se puede destilar.', category: 'herramienta', stack: 1, color: '#adb5bd', tool: 'cubo', value: 3 },
  // Ropa
  { id: 'abrigo', name: 'Abrigo de lona', desc: 'Protege del frío y la lluvia en cubierta. Se equipa desde el inventario.', category: 'ropa', stack: 1, color: '#3a5a40', warmthProtection: 0.6, value: 8 },
  // Planos
  { id: 'plano_taller', name: 'Plano: Taller mecánico', desc: 'Permite construir el taller: piezas mecánicas y componentes.', category: 'plano', stack: 1, color: '#219ebc', unlocks: 'taller', value: 15 },
  { id: 'plano_energia', name: 'Plano: Energía', desc: 'Permite construir generadores y baterías.', category: 'plano', stack: 1, color: '#ffb703', unlocks: 'energia', value: 15 },
  { id: 'plano_agua', name: 'Plano: Potabilizadora', desc: 'Permite construir una potabilizadora eléctrica de agua de mar.', category: 'plano', stack: 1, color: '#4cc9f0', unlocks: 'agua', value: 15 },
  { id: 'plano_solar', name: 'Plano: Paneles solares', desc: 'Permite fabricar células solares y montar paneles.', category: 'plano', stack: 1, color: '#fb8500', unlocks: 'solar', value: 20 },
  { id: 'plano_enfermeria', name: 'Plano: Enfermería', desc: 'Permite construir una enfermería para curar más rápido.', category: 'plano', stack: 1, color: '#e63946', unlocks: 'enfermeria', value: 15 },
  { id: 'plano_casco', name: 'Plano: Ampliación del casco', desc: 'Permite alargar el casco por la proa para ganar espacio.', category: 'plano', stack: 1, color: '#023047', unlocks: 'casco', value: 25 },
  { id: 'plano_invernadero', name: 'Plano: Lámparas de cultivo', desc: 'Permite instalar huertos en interiores con luz eléctrica.', category: 'plano', stack: 1, color: '#80b918', unlocks: 'invernadero', value: 15 },
  { id: 'plano_acuicultura', name: 'Plano: Vivero de peces', desc: 'Permite construir tanques donde criar peces a bordo.', category: 'plano', stack: 1, color: '#2a9d8f', unlocks: 'acuicultura', value: 18 },
  { id: 'plano_grua', name: 'Plano: Grúa de rescate', desc: 'Una grúa eléctrica que pesca restos flotantes por sí sola.', category: 'plano', stack: 1, color: '#f4a261', unlocks: 'grua', value: 22 },
  { id: 'plano_radar', name: 'Plano: Radar y radio', desc: 'Ve más lejos: avistamientos con antelación y avisos de tormenta tempranos.', category: 'plano', stack: 1, color: '#8ecae6', unlocks: 'radar', value: 20 },
  { id: 'plano_motor', name: 'Plano: Motor auxiliar', desc: 'Un motor eléctrico que acelera la travesía.', category: 'plano', stack: 1, color: '#6d597a', unlocks: 'motor', value: 25 },
  // Documentos (hilo narrativo, ver data/story.ts)
  { id: 'pagina_1', name: 'Cuaderno del Albatros, pág. 1', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «A quien encuentre esto». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_2', name: 'Cuaderno del Albatros, pág. 2', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «Lo que el mar trae». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_3', name: 'Cuaderno del Albatros, pág. 3', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «Nadie come solo». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_4', name: 'Cuaderno del Albatros, pág. 4', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «Los que lo intentaron antes». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_5', name: 'Cuaderno del Albatros, pág. 5', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «El frío». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_6', name: 'Cuaderno del Albatros, pág. 6', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «El barco es la gente». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
  { id: 'pagina_7', name: 'Cuaderno del Albatros, pág. 7', desc: 'Una hoja del cuaderno de la capitana Elena Duarte: «La luz verde». Léela con F o clic derecho.', category: 'documento', stack: 1, color: '#e9d8a6', value: 0 },
];

export const ITEMS: Record<ItemId, ItemDef> = Object.fromEntries(defs.map((d) => [d.id, d]));

export function itemDef(id: ItemId): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error(`Objeto desconocido: ${id}`);
  return d;
}

export function isFood(id: ItemId): boolean {
  return ITEMS[id]?.category === 'comida';
}

export function isEdible(id: ItemId): boolean {
  const d = ITEMS[id];
  return !!d?.consume && (d.category === 'comida' || d.category === 'bebida' || d.category === 'medicina');
}

/** Lista de ids en orden de declaración (útil para UI y tests). */
export const ITEM_IDS: ItemId[] = defs.map((d) => d.id);

import type { ItemId } from '../sim/types';

/**
 * DEFINICIÓN DE MÓDULOS CONSTRUIBLES.
 *
 * Coordenadas de footprint (rot = 0): `u` a lo largo de X (0..size[0]*CELL), `v` a lo largo de Z
 * (0..size[1]*CELL). Lados: S = borde v=0 (-z), N = borde v=máx (+z), W = borde u=0 (-x, popa),
 * E = borde u=máx (+x, proa). La rotación del módulo gira el footprint (ver sim/ship.ts).
 *
 * Props: posición (u, v) en metros dentro del footprint, `rot` = yaw local en radianes
 * (convención three.js rotation.y). Orientación canónica de los modelos: el "frente" (lado
 * desde el que se usa) mira hacia -v (lado S) con rot = 0; rot = PI/2 -> frente hacia W,
 * rot = PI -> hacia N, rot = -PI/2 -> hacia E. El eje largo del modelo va a lo largo de u (x local).
 * `collider` = [medio ancho en x local, medio fondo en z local, altura] (antes de rotar).
 */

export type ModuleCategory = 'vivienda' | 'produccion' | 'agua' | 'energia' | 'estructura';
export type Side = 'S' | 'E' | 'N' | 'W';

export type InteractKind =
  | 'dormir'
  | 'cocina'
  | 'almacen'
  | 'banco'
  | 'taller'
  | 'huerto'
  | 'colector'
  | 'deposito'
  | 'potabilizadora'
  | 'generador'
  | 'bateria'
  | 'panel'
  | 'timon'
  | 'motor';

export type PropKind =
  | 'cama'
  | 'mesita'
  | 'baul'
  | 'armario'
  | 'litera'
  | 'alfombra'
  | 'fogon'
  | 'despensa'
  | 'mesa'
  | 'silla'
  | 'estanteria'
  | 'cajas'
  | 'banco'
  | 'herramientas'
  | 'torno'
  | 'prensa'
  | 'bancal'
  | 'colector'
  | 'deposito'
  | 'potabilizadora'
  | 'generador'
  | 'bateria'
  | 'panel_solar'
  | 'camilla'
  | 'armario_medico'
  | 'timon'
  | 'carta_nautica'
  | 'motor'
  | 'barril';

export interface PropSpec {
  kind: PropKind;
  u: number;
  v: number;
  rot: number;
  /** [hx, hz, h] en ejes locales del prop, o null si no colisiona. */
  collider: [number, number, number] | null;
  interact?: InteractKind;
  /** Índice (cama, parcela) asociado a la interacción. */
  index?: number;
  /** Altura de apoyo (por defecto 0 = suelo). */
  y?: number;
}

export interface DoorSpec {
  side: Side;
  /** Índice de celda a lo largo del lado. */
  cell: number;
}

export interface ModuleDef {
  id: string;
  name: string;
  desc: string;
  category: ModuleCategory;
  /** [celdas a lo largo de u (x), celdas a lo largo de v (z)] con rot = 0. */
  size: [number, number];
  /** Habitación cerrada con paredes y techo. Si es false es un equipamiento abierto sobre cubierta/bodega. */
  enclosed: boolean;
  /** Niveles permitidos. */
  levels: number[];
  /** Necesita cielo abierto (cubierta principal o superior). */
  needsSky?: boolean;
  cost: Record<ItemId, number>;
  /** Minutos de juego de obra. */
  buildTime: number;
  /** Clave de desbloqueo necesaria (null = disponible desde el inicio). */
  unlock: string | null;
  /** Puertas (solo módulos cerrados). La primera es la principal. */
  doors: DoorSpec[];
  props: PropSpec[];
  /** Consumo eléctrico (kW) cuando funciona. */
  powerUse?: number;
  /** Generación eléctrica máxima (kW). */
  powerGen?: number;
  batteryKWh?: number;
  waterCapacity?: number;
  /** Litros/hora producidos (potabilizadora) o por intensidad de lluvia (colector). */
  waterGen?: number;
  storageSlots?: number;
  fuelSlots?: number;
  beds?: number;
  /** Las camas curan más rápido (enfermería). */
  healingBeds?: boolean;
  plots?: number;
  /** Puntos de confort para el ánimo de los habitantes. */
  comfort?: number;
  /** Máquina: se repara con llave inglesa + pieza mecánica. Si no, estructura: martillo + kit. */
  machine?: boolean;
  /** Se puede demoler. */
  demolishable: boolean;
  /** Se puede construir desde el modo construcción. */
  buildable: boolean;
  /** Nudos extra de velocidad (motor). */
  speedBonus?: number;
}

const P = Math.PI;

const defs: ModuleDef[] = [
  {
    id: 'camarote',
    name: 'Camarote',
    desc: 'Habitación individual con cama. Da un buen descanso y mucho confort a quien la ocupa.',
    category: 'vivienda',
    size: [1, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 8, tela: 2 },
    buildTime: 40,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'cama', u: 1.25, v: 3.35, rot: 0, collider: [1.0, 0.5, 0.55], interact: 'dormir', index: 0 },
      { kind: 'mesita', u: 2.75, v: 3.6, rot: 0, collider: [0.25, 0.25, 0.6] },
      { kind: 'baul', u: 3.5, v: 1.1, rot: P / 2, collider: [0.5, 0.3, 0.55] },
      { kind: 'alfombra', u: 2.0, v: 2.0, rot: 0, collider: null },
    ],
    beds: 1,
    comfort: 3,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'dormitorio',
    name: 'Dormitorio común',
    desc: 'Dos literas para cuatro personas. Más gente bajo un mismo techo, menos intimidad.',
    category: 'vivienda',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 14, tela: 4 },
    buildTime: 70,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'litera', u: 5.0, v: 3.35, rot: 0, collider: [1.0, 0.5, 1.9], interact: 'dormir', index: 0 },
      { kind: 'litera', u: 7.4, v: 1.6, rot: P / 2, collider: [1.0, 0.5, 1.9], interact: 'dormir', index: 2 },
      { kind: 'armario', u: 0.45, v: 3.1, rot: -P / 2, collider: [0.5, 0.3, 2.0] },
      { kind: 'alfombra', u: 4.2, v: 1.8, rot: 0, collider: null },
    ],
    beds: 4,
    comfort: 1,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'cocina',
    name: 'Cocina',
    desc: 'Fogón de leña o gasoil y despensa. Cocina comida, destila agua de mar y alimenta a la tripulación.',
    category: 'produccion',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 10, chatarra: 4 },
    buildTime: 60,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'fogon', u: 6.9, v: 3.45, rot: 0, collider: [0.8, 0.45, 1.0], interact: 'cocina' },
      { kind: 'despensa', u: 4.9, v: 3.6, rot: 0, collider: [0.7, 0.3, 2.0], interact: 'cocina' },
      { kind: 'mesa', u: 6.2, v: 1.5, rot: 0, collider: [0.9, 0.6, 0.8] },
      { kind: 'silla', u: 5.0, v: 1.5, rot: -P / 2, collider: null },
      { kind: 'silla', u: 7.4, v: 1.5, rot: P / 2, collider: null },
      { kind: 'barril', u: 0.5, v: 3.5, rot: 0, collider: [0.35, 0.35, 0.9] },
    ],
    storageSlots: 12,
    fuelSlots: 1,
    comfort: 1,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'comedor',
    name: 'Comedor',
    desc: 'Mesas largas para comer juntos. Mejora el ánimo de quien come aquí.',
    category: 'vivienda',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 12, tela: 2 },
    buildTime: 50,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'mesa', u: 4.6, v: 2.4, rot: 0, collider: [0.9, 0.6, 0.8] },
      { kind: 'mesa', u: 6.8, v: 2.4, rot: 0, collider: [0.9, 0.6, 0.8] },
      { kind: 'silla', u: 4.6, v: 1.4, rot: P, collider: null },
      { kind: 'silla', u: 4.6, v: 3.4, rot: 0, collider: null },
      { kind: 'silla', u: 6.8, v: 1.4, rot: P, collider: null },
      { kind: 'silla', u: 6.8, v: 3.4, rot: 0, collider: null },
      { kind: 'barril', u: 0.5, v: 3.5, rot: 0, collider: [0.35, 0.35, 0.9] },
    ],
    comfort: 3,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'almacen',
    name: 'Almacén',
    desc: 'Estanterías para guardar recursos. Los habitantes también toman y dejan cosas aquí.',
    category: 'estructura',
    size: [1, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 8 },
    buildTime: 35,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'estanteria', u: 2.0, v: 3.6, rot: 0, collider: [1.4, 0.35, 2.2], interact: 'almacen' },
      { kind: 'estanteria', u: 3.6, v: 1.9, rot: -P / 2, collider: [1.0, 0.35, 2.2], interact: 'almacen' },
      { kind: 'cajas', u: 0.65, v: 3.3, rot: 0, collider: [0.5, 0.5, 0.9] },
    ],
    storageSlots: 20,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'banco_trabajo',
    name: 'Banco de trabajo',
    desc: 'Mesa de herramientas al aire libre o en la bodega. Fabrica herramientas, placas, tela y kits.',
    category: 'produccion',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { madera: 6, chatarra: 2 },
    buildTime: 25,
    unlock: null,
    doors: [],
    props: [
      { kind: 'banco', u: 2.0, v: 2.4, rot: 0, collider: [1.0, 0.45, 0.95], interact: 'banco' },
      { kind: 'herramientas', u: 2.0, v: 3.2, rot: 0, collider: [0.9, 0.12, 1.8] },
    ],
    storageSlots: 6,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'taller',
    name: 'Taller mecánico',
    desc: 'Torno y prensa eléctricos. Fabrica piezas mecánicas, componentes y células solares. Consume electricidad.',
    category: 'produccion',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 10, placa_metal: 4, tornillos: 6 },
    buildTime: 90,
    unlock: 'taller',
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'torno', u: 5.0, v: 3.4, rot: 0, collider: [1.0, 0.5, 1.1], interact: 'taller' },
      { kind: 'prensa', u: 7.3, v: 1.8, rot: P / 2, collider: [0.6, 0.5, 1.6] },
      { kind: 'herramientas', u: 2.6, v: 3.85, rot: 0, collider: [0.9, 0.12, 1.8] },
    ],
    storageSlots: 6,
    powerUse: 1.5,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'huerto',
    name: 'Huerto',
    desc: 'Cuatro bancales de cultivo. Necesitan luz del sol (o lámparas de cultivo) y agua de los depósitos.',
    category: 'produccion',
    size: [2, 2],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { madera: 10, cuerda: 2 },
    buildTime: 45,
    unlock: null,
    doors: [],
    props: [
      { kind: 'bancal', u: 2.0, v: 2.0, rot: 0, collider: [1.15, 1.15, 0.5], interact: 'huerto', index: 0 },
      { kind: 'bancal', u: 6.0, v: 2.0, rot: 0, collider: [1.15, 1.15, 0.5], interact: 'huerto', index: 1 },
      { kind: 'bancal', u: 2.0, v: 6.0, rot: 0, collider: [1.15, 1.15, 0.5], interact: 'huerto', index: 2 },
      { kind: 'bancal', u: 6.0, v: 6.0, rot: 0, collider: [1.15, 1.15, 0.5], interact: 'huerto', index: 3 },
    ],
    plots: 4,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'colector',
    name: 'Colector de lluvia',
    desc: 'Una lona en embudo que recoge la lluvia hacia los depósitos. Solo funciona a cielo abierto.',
    category: 'agua',
    size: [1, 1],
    enclosed: false,
    levels: [1, 2],
    needsSky: true,
    cost: { madera: 4, tela: 2 },
    buildTime: 20,
    unlock: null,
    doors: [],
    props: [{ kind: 'colector', u: 2.0, v: 2.0, rot: 0, collider: [0.9, 0.9, 2.2], interact: 'colector' }],
    waterGen: 10,
    waterCapacity: 20,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'deposito',
    name: 'Depósito de agua',
    desc: 'Tanque de agua potable conectado a la red del barco. Se bebe y se rellenan botellas aquí.',
    category: 'agua',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { madera: 4, chatarra: 6 },
    buildTime: 30,
    unlock: null,
    doors: [],
    props: [{ kind: 'deposito', u: 2.0, v: 2.0, rot: 0, collider: [1.1, 1.1, 2.4], interact: 'deposito' }],
    waterCapacity: 120,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'potabilizadora',
    name: 'Potabilizadora',
    desc: 'Bombea agua de mar, la filtra y la envía a los depósitos. Consume electricidad.',
    category: 'agua',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { placa_metal: 3, tornillos: 4, componentes: 1 },
    buildTime: 60,
    unlock: 'agua',
    doors: [],
    props: [{ kind: 'potabilizadora', u: 2.0, v: 2.0, rot: 0, collider: [1.0, 0.7, 1.6], interact: 'potabilizadora' }],
    powerUse: 2,
    waterGen: 18,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'generador',
    name: 'Generador',
    desc: 'Quema combustible o madera para producir electricidad. Ruidoso, pero fiable.',
    category: 'energia',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { placa_metal: 4, tornillos: 4, componentes: 1 },
    buildTime: 60,
    unlock: 'energia',
    doors: [],
    props: [{ kind: 'generador', u: 2.0, v: 2.0, rot: 0, collider: [1.1, 0.8, 1.4], interact: 'generador' }],
    powerGen: 5,
    fuelSlots: 2,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'bateria',
    name: 'Banco de baterías',
    desc: 'Almacena la electricidad sobrante para la noche.',
    category: 'energia',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1, 2],
    cost: { placa_metal: 2, componentes: 2 },
    buildTime: 40,
    unlock: 'energia',
    doors: [],
    props: [{ kind: 'bateria', u: 2.0, v: 2.0, rot: 0, collider: [1.0, 0.6, 1.5], interact: 'bateria' }],
    batteryKWh: 25,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'panel_solar',
    name: 'Panel solar',
    desc: 'Produce electricidad con la luz del día. Menos con nubes, nada de noche.',
    category: 'energia',
    size: [1, 1],
    enclosed: false,
    levels: [1, 2],
    needsSky: true,
    cost: { celula_solar: 2, placa_metal: 1 },
    buildTime: 40,
    unlock: 'solar',
    doors: [],
    props: [{ kind: 'panel_solar', u: 2.0, v: 2.0, rot: 0, collider: [1.6, 1.2, 1.2], interact: 'panel' }],
    powerGen: 1.6,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'enfermeria',
    name: 'Enfermería',
    desc: 'Dos camillas donde heridos y enfermos se recuperan mucho más rápido.',
    category: 'vivienda',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 10, tela: 6, componentes: 1 },
    buildTime: 80,
    unlock: 'enfermeria',
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'camilla', u: 4.7, v: 3.35, rot: 0, collider: [1.0, 0.45, 0.7], interact: 'dormir', index: 0 },
      { kind: 'camilla', u: 7.0, v: 3.35, rot: 0, collider: [1.0, 0.45, 0.7], interact: 'dormir', index: 1 },
      { kind: 'armario_medico', u: 0.45, v: 3.1, rot: -P / 2, collider: [0.55, 0.3, 2.0] },
    ],
    beds: 2,
    healingBeds: true,
    powerUse: 0.3,
    comfort: 1,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'motor',
    name: 'Motor auxiliar',
    desc: 'Motor eléctrico conectado a la hélice. Acelera la travesía mientras tenga energía.',
    category: 'energia',
    size: [2, 1],
    enclosed: true,
    levels: [0],
    cost: { placa_metal: 8, pieza_mecanica: 4, componentes: 4 },
    buildTime: 150,
    unlock: 'motor',
    doors: [{ side: 'S', cell: 0 }],
    props: [{ kind: 'motor', u: 5.0, v: 2.3, rot: 0, collider: [1.8, 0.9, 1.6], interact: 'motor' }],
    powerUse: 4,
    speedBonus: 3,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'escalera',
    name: 'Escalera',
    desc: 'Conecta este nivel con el superior. Se entra por el lado marcado y se sale por el opuesto, un nivel más arriba.',
    category: 'estructura',
    size: [1, 1],
    enclosed: false,
    levels: [0, 1],
    cost: { madera: 6 },
    buildTime: 25,
    unlock: null,
    doors: [],
    props: [],
    demolishable: true,
    buildable: true,
  },
  {
    id: 'puente',
    name: 'Puente de mando',
    desc: 'Timón y carta náutica. Desde aquí se decide el rumbo y se responde a los avistamientos.',
    category: 'estructura',
    size: [2, 1],
    enclosed: true,
    levels: [2],
    cost: {},
    buildTime: 1,
    unlock: null,
    doors: [{ side: 'E', cell: 0 }],
    props: [
      { kind: 'timon', u: 4.4, v: 2.0, rot: P / 2, collider: [0.55, 0.45, 1.3], interact: 'timon' },
      { kind: 'carta_nautica', u: 1.3, v: 2.0, rot: P / 2, collider: [1.0, 0.7, 0.95], interact: 'timon' },
    ],
    comfort: 1,
    demolishable: false,
    buildable: false,
  },
];

export const MODULES: Record<string, ModuleDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const MODULE_LIST: ModuleDef[] = defs;

export function moduleDef(type: string): ModuleDef {
  const d = MODULES[type];
  if (!d) throw new Error(`Módulo desconocido: ${type}`);
  return d;
}

/** Ampliación de casco (acción especial del modo construcción). */
export const HULL_EXPANSION = {
  name: 'Ampliar el casco',
  desc: 'Alarga el barco dos secciones por la proa: más cubierta y más bodega.',
  cost: { madera: 30, placa_metal: 12, tornillos: 16 } as Record<ItemId, number>,
  buildTime: 240,
  unlock: 'casco',
};

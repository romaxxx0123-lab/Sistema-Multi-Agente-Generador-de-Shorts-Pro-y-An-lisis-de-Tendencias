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
  | 'motor'
  | 'ahumadero'
  | 'vivero'
  | 'grua'
  | 'radar';

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
  | 'barril'
  | 'sofa'
  | 'mesa_juegos'
  | 'estanteria_libros'
  | 'ahumadero'
  | 'tanque_peces'
  | 'grua'
  | 'radar';

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

/** Efectos de un nivel de mejora. Los valores absolutos sustituyen al de la definición base. */
export interface ModuleEffects {
  storageSlots?: number;
  fuelSlots?: number;
  waterCapacity?: number;
  waterGen?: number;
  powerGen?: number;
  powerUse?: number;
  batteryKWh?: number;
  comfort?: number;
  speedBonus?: number;
  /** Multiplicador de velocidad de fabricación/cocina/producción (1 = base). */
  workSpeed?: number;
  /** Multiplicador de duración del combustible (>1 dura más). */
  fuelEfficiency?: number;
  /** Multiplicador del crecimiento de cultivos. */
  growthMult?: number;
  /** Multiplicador del agua que beben los cultivos (<1 = menos). */
  waterUseMult?: number;
  /** Multiplicador de curación de las camillas. */
  healMult?: number;
  /** Multiplicador del desgaste (<1 = más duradero). */
  wearMult?: number;
}

export interface UpgradeDef {
  /** Nivel al que lleva (2 o 3). */
  tier: number;
  name: string;
  desc: string;
  cost: Record<ItemId, number>;
  /** Minutos de juego de obra. */
  buildTime: number;
  /** Clave de desbloqueo necesaria (opcional). */
  unlock?: string | null;
  effects: ModuleEffects;
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
  /** Mejoras disponibles, en orden de nivel. */
  upgrades?: UpgradeDef[];
  /** Debe ir en una celda junto a la borda (primera o última fila de la manga). */
  edge?: boolean;
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
    cost: { placa_metal: 3, tornillos: 4, componentes: 2 },
    buildTime: 60,
    unlock: 'agua',
    doors: [],
    props: [{ kind: 'potabilizadora', u: 2.0, v: 2.0, rot: 0, collider: [1.0, 0.7, 1.6], interact: 'potabilizadora' }],
    powerUse: 2,
    waterGen: 10,
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
    cost: { placa_metal: 4, tornillos: 4, componentes: 2 },
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
    cost: { placa_metal: 2, componentes: 3 },
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
    cost: { placa_metal: 8, pieza_mecanica: 4, componentes: 6 },
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
    id: 'sala_comun',
    name: 'Sala común',
    desc: 'Sofás, una mesa de juegos y libros. La tripulación pasa aquí sus ratos libres y se lleva mejor.',
    category: 'vivienda',
    size: [2, 1],
    enclosed: true,
    levels: [0, 1, 2],
    cost: { madera: 14, tela: 6 },
    buildTime: 70,
    unlock: null,
    doors: [{ side: 'S', cell: 0 }],
    props: [
      { kind: 'sofa', u: 5.3, v: 3.45, rot: 0, collider: [1.1, 0.45, 0.9] },
      { kind: 'mesa_juegos', u: 2.9, v: 1.9, rot: 0, collider: [0.7, 0.7, 0.8] },
      { kind: 'estanteria_libros', u: 0.45, v: 3.0, rot: -P / 2, collider: [0.9, 0.25, 2.0] },
      { kind: 'alfombra', u: 4.2, v: 2.0, rot: 0, collider: null },
    ],
    comfort: 4,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'ahumadero',
    name: 'Ahumadero',
    desc: 'Una caseta de humo a cielo abierto: convierte pescado crudo y leña en pescado ahumado que aguanta.',
    category: 'produccion',
    size: [1, 1],
    enclosed: false,
    levels: [1, 2],
    needsSky: true,
    cost: { madera: 10, chatarra: 4 },
    buildTime: 40,
    unlock: null,
    doors: [],
    props: [{ kind: 'ahumadero', u: 2.0, v: 2.2, rot: 0, collider: [1.0, 0.7, 2.0], interact: 'ahumadero' }],
    storageSlots: 6,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'vivero',
    name: 'Vivero de peces',
    desc: 'Dos tanques con agua de mar bombeada donde crían peces. Da pescado sin salir de cubierta. Consume electricidad.',
    category: 'produccion',
    size: [2, 1],
    enclosed: false,
    levels: [0, 1],
    cost: { placa_metal: 6, plastico: 8, componentes: 1, tornillos: 6 },
    buildTime: 90,
    unlock: 'acuicultura',
    doors: [],
    props: [
      { kind: 'tanque_peces', u: 2.0, v: 2.0, rot: 0, collider: [1.4, 1.0, 1.3], interact: 'vivero' },
      { kind: 'tanque_peces', u: 6.0, v: 2.0, rot: 0, collider: [1.4, 1.0, 1.3], interact: 'vivero' },
    ],
    storageSlots: 6,
    powerUse: 0.5,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'grua',
    name: 'Grúa de rescate',
    desc: 'Una pluma eléctrica junto a la borda que engancha sola los restos que pasan cerca. Consume electricidad.',
    category: 'produccion',
    size: [1, 1],
    enclosed: false,
    levels: [1],
    needsSky: true,
    edge: true,
    cost: { placa_metal: 8, pieza_mecanica: 2, cuerda: 4, componentes: 2 },
    buildTime: 100,
    unlock: 'grua',
    doors: [],
    props: [{ kind: 'grua', u: 2.0, v: 2.0, rot: 0, collider: [0.8, 0.8, 3.2], interact: 'grua' }],
    storageSlots: 12,
    powerUse: 0.4,
    machine: true,
    demolishable: true,
    buildable: true,
  },
  {
    id: 'radar',
    name: 'Radar y radio',
    desc: 'Antena giratoria y radio de onda corta en la cubierta superior: avistamientos con más antelación, avisos de tormenta tempranos y voces de otros barcos.',
    category: 'estructura',
    size: [1, 1],
    enclosed: false,
    levels: [2],
    needsSky: true,
    cost: { componentes: 4, placa_metal: 4, tornillos: 4 },
    buildTime: 60,
    unlock: 'radar',
    doors: [],
    props: [{ kind: 'radar', u: 2.0, v: 2.0, rot: 0, collider: [0.6, 0.6, 2.6], interact: 'radar' }],
    powerUse: 0.3,
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


/* ------------------------------------------------------------------ */
/* Mejoras de instalaciones (GDD §7: "mejorar instalaciones existentes") */
/* ------------------------------------------------------------------ */

const UPGRADES: Record<string, UpgradeDef[]> = {
  almacen: [
    { tier: 2, name: 'Almacén con altillo', desc: 'Un altillo y más baldas: mucho más espacio.', cost: { madera: 12, tornillos: 6 }, buildTime: 45, effects: { storageSlots: 32 } },
    { tier: 3, name: 'Almacén reforzado', desc: 'Estanterías metálicas de suelo a techo.', cost: { placa_metal: 6, tornillos: 10, madera: 10 }, buildTime: 70, effects: { storageSlots: 48 } },
  ],
  deposito: [
    { tier: 2, name: 'Depósito ampliado', desc: 'Un segundo cuerpo soldado: casi el doble de agua.', cost: { placa_metal: 4, tornillos: 6 }, buildTime: 45, effects: { waterCapacity: 220 } },
    { tier: 3, name: 'Gran depósito', desc: 'Tanque presurizado con aislamiento.', cost: { placa_metal: 8, tornillos: 8, plastico: 6 }, buildTime: 70, effects: { waterCapacity: 340 } },
  ],
  colector: [
    { tier: 2, name: 'Colector de doble lona', desc: 'Más superficie de captación y un pequeño tanque.', cost: { tela: 4, cuerda: 2, madera: 4 }, buildTime: 25, effects: { waterGen: 18, waterCapacity: 35 } },
  ],
  potabilizadora: [
    { tier: 2, name: 'Potabilizadora con prefiltro', desc: 'Filtra más rápido y se desgasta menos.', cost: { componentes: 2, placa_metal: 2, tornillos: 4 }, buildTime: 60, effects: { waterGen: 16, wearMult: 0.7 } },
  ],
  generador: [
    { tier: 2, name: 'Generador de doble cilindro', desc: 'Más potencia y mejor aprovechamiento del combustible.', cost: { pieza_mecanica: 2, placa_metal: 4, componentes: 1 }, buildTime: 80, effects: { powerGen: 8, fuelEfficiency: 1.3 } },
    { tier: 3, name: 'Generador turbo', desc: 'Turbocompresor recuperado de un pesquero: potente y eficiente.', cost: { pieza_mecanica: 3, componentes: 3, placa_metal: 6 }, buildTime: 120, effects: { powerGen: 11, fuelEfficiency: 1.6 } },
  ],
  bateria: [
    { tier: 2, name: 'Baterías de alta capacidad', desc: 'Celdas nuevas: casi el doble de carga.', cost: { componentes: 3, placa_metal: 2 }, buildTime: 50, effects: { batteryKWh: 45 } },
  ],
  panel_solar: [
    { tier: 2, name: 'Panel orientable', desc: 'Sigue al sol y rinde más.', cost: { celula_solar: 2, placa_metal: 1, tornillos: 4 }, buildTime: 45, effects: { powerGen: 2.4 } },
  ],
  banco_trabajo: [
    { tier: 2, name: 'Banco con tornillo de banco', desc: 'Herramientas mejores: se trabaja más rápido.', cost: { madera: 6, tornillos: 6, placa_metal: 2 }, buildTime: 30, effects: { workSpeed: 1.5, storageSlots: 10 } },
  ],
  taller: [
    { tier: 2, name: 'Taller con fresadora', desc: 'Fabrica más rápido y sus máquinas duran más.', cost: { pieza_mecanica: 2, componentes: 2, placa_metal: 4 }, buildTime: 90, effects: { workSpeed: 1.6, wearMult: 0.7 } },
  ],
  cocina: [
    { tier: 2, name: 'Cocina de hierro', desc: 'Fogón de hierro colado: cocina antes y gasta menos leña.', cost: { placa_metal: 4, tornillos: 6, chatarra: 6 }, buildTime: 60, effects: { workSpeed: 1.5, fuelEfficiency: 1.5, storageSlots: 18 } },
  ],
  huerto: [
    { tier: 2, name: 'Huerto con riego por goteo', desc: 'Gomas y botellas agujereadas: menos agua y plantas más sanas.', cost: { plastico: 6, cuerda: 2, tornillos: 4 }, buildTime: 40, effects: { waterUseMult: 0.6, growthMult: 1.2 } },
    { tier: 3, name: 'Huerto abonado', desc: 'Tierra nueva con compost de algas: crece mucho más.', cost: { madera: 10, plastico: 4, placa_metal: 2, fibra: 10 }, buildTime: 60, effects: { waterUseMult: 0.6, growthMult: 1.5 } },
  ],
  camarote: [
    { tier: 2, name: 'Camarote acogedor', desc: 'Colchón de verdad, cortinas y una lámpara de lectura.', cost: { tela: 4, madera: 6 }, buildTime: 30, effects: { comfort: 5 } },
  ],
  dormitorio: [
    { tier: 2, name: 'Dormitorio con taquillas', desc: 'Cada cual con su rincón: más descanso y menos roces.', cost: { tela: 6, madera: 8 }, buildTime: 45, effects: { comfort: 3 } },
  ],
  comedor: [
    { tier: 2, name: 'Comedor con despensa a la vista', desc: 'Manteles, farolillos y sitio para todos.', cost: { madera: 8, tela: 4 }, buildTime: 40, effects: { comfort: 5 } },
  ],
  enfermeria: [
    { tier: 2, name: 'Enfermería equipada', desc: 'Instrumental y medicinas ordenadas: se cura antes.', cost: { componentes: 2, tela: 4, plastico: 2 }, buildTime: 60, effects: { healMult: 1.5 } },
  ],
  sala_comun: [
    { tier: 2, name: 'Sala común con estufa', desc: 'Una estufa de hierro y cojines: el mejor sitio del barco.', cost: { madera: 6, placa_metal: 2, chatarra: 4, tela: 4 }, buildTime: 45, effects: { comfort: 6 } },
  ],
  ahumadero: [
    { tier: 2, name: 'Ahumadero de tiro doble', desc: 'Dos cámaras de humo: ahúma más rápido con la misma leña.', cost: { madera: 8, placa_metal: 2, tornillos: 4 }, buildTime: 40, effects: { workSpeed: 1.6 } },
  ],
  vivero: [
    { tier: 2, name: 'Vivero con aireadores', desc: 'Burbujeadores y sombra: los peces crecen antes.', cost: { componentes: 2, plastico: 4, tornillos: 4 }, buildTime: 60, effects: { workSpeed: 1.6 } },
  ],
  grua: [
    { tier: 2, name: 'Grúa de pluma larga', desc: 'Más alcance y un torno más rápido.', cost: { placa_metal: 4, pieza_mecanica: 2, cuerda: 4 }, buildTime: 80, effects: { workSpeed: 1.6 } },
  ],
  motor: [
    { tier: 2, name: 'Motor con hélice de paso variable', desc: 'Más velocidad con la misma energía.', cost: { pieza_mecanica: 4, componentes: 4 }, buildTime: 120, effects: { speedBonus: 5 } },
  ],
};
for (const d of defs) if (UPGRADES[d.id]) d.upgrades = UPGRADES[d.id];

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
  /** Coste base: se multiplica por (1 + ampliaciones ya hechas). */
  cost: { madera: 40, placa_metal: 16, tornillos: 24 } as Record<ItemId, number>,
  buildTime: 420,
  unlock: 'casco',
};

// Paleta: piezas y colores que usan los modelos.
//
// Colores: se escriben con el nombre de Rebrickable/BrickLink; el código LDraw
// (para dibujar) y el id Rebrickable (para buscar sets) se resuelven solos por
// nombre al cargar la paleta.
//
// Piezas: cualquier número de pieza que exista en LDraw y Rebrickable se puede
// usar directo ('3001'). Acá solo van las que necesitan algo extra:
//   ld / rb : cuando el número difiere entre LDraw y Rebrickable
//   front   : hacia dónde mira el "frente" de la pieza sin rotar, [dx, dz]
//             (en pendientes, el lado bajo). Permite usar { face: 'S' }.

export const COLOR_NAMES = [
  'Black', 'White', 'Red', 'Dark Red', 'Tan', 'Dark Tan', 'Light Bluish Gray', 'Dark Bluish Gray',
  'Reddish Brown', 'Dark Brown', 'Pearl Gold', 'Green', 'Dark Green', 'Bright Green', 'Lime', 'Sand Green',
  'Olive Green', 'Bright Pink', 'Dark Pink', 'Blue', 'Dark Blue', 'Medium Azure', 'Dark Turquoise',
  'Yellow', 'Orange', 'Bright Light Orange', 'Dark Orange', 'Medium Nougat', 'Flat Silver',
  'Trans-Clear', 'Trans-Light Blue', 'Trans-Dark Blue', 'Trans-Yellow', 'Trans-Orange', 'Trans-Red',
  'Trans-Green', 'Trans-Neon Orange', 'Lavender', 'Magenta', 'Coral', 'Light Aqua', 'Sand Blue',
  'Dark Purple', 'Trans-Dark Pink', 'Medium Blue',
];

const S = [0, -1]; // frente local hacia -z
// Piezas con hojas, garras o salientes: se colocan por la celda de su encastre.
const CELL = (h) => ({ min: [-10, 0, -10], max: [10, h, 10] });

export const PARTS = {
  // Pendientes 45°
  '3040b': { front: S }, // 2x1
  '3039': { front: S }, // 2x2
  '3038': { front: S }, // 2x3
  '3037': { front: S }, // 2x4
  // Pendientes 33°
  '4286': { front: S }, // 3x1
  '3298': { front: S }, // 3x2
  '3297': { front: S }, // 3x4
  // Pendientes chicas
  '54200': { front: S }, // "queso" 1x1x2/3
  '85984': { front: S }, // 1x2x2/3
  // Pendiente triple (remate de cumbrera): mismo molde que 3048c
  '15571': { front: S },
  // Ventana 1x2x2: el vidrio va del lado del frente
  '60592': { front: S },
  // Ladrillos con stud lateral: el frente es hacia donde apunta ese stud
  '87087': { front: S },
  '4070': { front: S },
  // Plantas y adornos
  '30176': { box: CELL(24) }, // bambú
  '2417': { box: CELL(8) }, // hojas 6x5
  '2423': { box: CELL(8) }, // hojas 4x3
  '24866': { box: CELL(8) }, // flor de 5 pétalos
  '32607': { box: CELL(8) }, // plate redondo con 3 hojas
  '33291': { box: CELL(8) }, // flor de 4 pétalos
  '15070': { box: CELL(8) }, // plate 1x1 con garra hacia abajo
  '49668': { box: CELL(8), front: S }, // plate 1x1 con diente al frente
  '2540': { box: { min: [-20, 0, -10], max: [20, 8, 10] }, front: S }, // plate 1x2 con manija al frente
  '26047': { box: CELL(8), front: S }, // plate redondo 1x1 con manija
  '30414': { front: S }, // ladrillo 1x4 con 4 studs laterales
  '33909': { front: S }, // plate 2x2 con studs solo atrás: el frente es liso
  '88930': { front: S }, // curva 2x4: baja hacia el frente
  '15068': { front: S }, // curva 2x2
  '85975': { box: CELL(16) }, // cono "fez"
  '33492': { box: CELL(16) }, // cono truncado 1.5
  '28598': { box: { min: [-20, 0, -20], max: [20, 72, 20] } }, // cono dentado 2x2x3 (pino)
  '20482': { box: CELL(8) }, // tile redondo con perno
  '32606': { box: { min: [-10, -16, -10], max: [10, 0, 10] } }, // flor de 7 pétalos
  // Set 71826 y parecidos
  '15672': { box: { min: [-10, 0, -20], max: [10, 8, 20] }, front: S }, // plate 1x2 con rampa: el frente es el lado bajo
  '11476': { box: { min: [-20, 0, -10], max: [20, 8, 10] }, front: S }, // plate 1x2 con clip al frente
  '99207': { box: { min: [-20, 0, -10], max: [20, 8, 10] }, front: S }, // escuadra 1x2 - 2x2 hacia arriba
  '15207': { front: [0, 1] }, // panel 1x4x1: el frente es la pared
  '4865b': { front: [0, 1] }, // panel 1x2x1
  '3660': { front: S }, // pendiente invertida 2x2: el frente es el voladizo
  '70681': { box: { min: [-10, 0, -50], max: [10, 16, 10] }, front: S }, // curva 1x3 de alero: encastra arriba y cuelga 1 plate hacia el frente
  '30136': { box: { min: [-20, 0, -10], max: [20, 24, 10] } }, // ladrillo tronco 1x2
  '64644': { box: CELL(40) }, // catalejo
  '87747': { verified: true }, // garra/cuchilla con barra: LDraw y Rebrickable la nombran distinto
  '11211': { front: S }, // ladrillo 1x2 con 2 studs laterales
  // Set 70751 y parecidos
  shoji: { ld: '60601', rb: '60601pr0001' }, // vidrio 1x2x2 impreso: se dibuja liso
  '3679': { box: { min: [-20, 0, -20], max: [20, 8, 20] } }, // tapa de plato giratorio 2x2
  '3839b': { box: { min: [-20, 0, -10], max: [20, 8, 10] }, front: S }, // plate 1x2 con manijas al frente
  '4738b': { box: { min: [-40, 0, -20], max: [40, 32, 20] } }, // cofre: las asas sobresalen a los lados
  '3957b': { box: { min: [-10, -88, -10], max: [10, 8, 10] } }, // antena
  '3626c': { box: CELL(24) }, // cabeza de minifigura lisa
  '2921': { box: CELL(24), front: S }, // ladrillo 1x1 con manija al frente
  '60897': { box: CELL(8), front: S }, // plate 1x1 con clip vertical al frente
  pantalla: { ld: '57895', rb: '57895pr0007' }, // vidrio 1x4x6 impreso: se dibuja liso
  '62930': { box: { min: [-30, 0, -20], max: [30, 32, 20] } }, // ladrillo de luz 2x3: la lente sobresale
  '41535': { box: { min: [-10, -56, -10], max: [10, 0, 10] } }, // dragón bebé (estatua)
  '90398': { box: { min: [-10, -38, -10], max: [10, 0, 10] } }, // estatuilla
  '3741': { box: CELL(16) }, // tallo de flor (junco)
  '93274': { box: { min: [-40, 0, -10], max: [40, 8, 10] }, front: S }, // escuadra 1x2 - 2x4: la cara con studs cuelga al frente
  '30150': { verified: true }, // cajón con manijas: mismo molde, nombres distintos
  '4218': { ld: '4218b', rb: '4218' }, // persiana de portón: LDraw la llama 4218b
  '87617': { box: { min: [-10, -90, -10], max: [10, 14, 10] }, front: S }, // columna redonda 1x1x4⅓: la manija sale al frente
  '6134': { box: { min: [-20, 0, -10], max: [20, 16, 10] } }, // tapa de bisagra 2x2: se coloca por la fila de la bisagra
  '4510': { box: { min: [-80, 0, -10], max: [80, 8, 10] }, front: S }, // plate 1x8 con riel: el riel sale al frente
  '6232': { box: { min: [-20, 0, -20], max: [20, 24, 20] }, front: [1, 0] }, // ladrillo 2x2 con perno: el frente es el perno
  '3899': { box: CELL(24) }, // taza: el asa sobresale
  '61252': { box: CELL(8), front: S }, // plate 1x1 con clip horizontal al frente
};

// Esquinas de techo (3675, 3045): rot según qué esquina del techo ocupan.
export const CORNER = { SE: 0, SW: 1, NW: 2, NE: 3 };

// Colores cuyo nombre en LDraw no coincide con el de Rebrickable: código LDraw a mano.
const LD_CODE = { 'Flat Silver': 179, 'Dark Purple': 85 };

const norm = (s) => s.toLowerCase().replace(/grey/g, 'gray').replace(/[^a-z0-9]/g, '');

// Resuelve la paleta contra la librería LDraw y el catálogo Rebrickable.
export function resolvePalette(lib, catalog) {
  const ldByName = new Map();
  for (const c of lib.colors().values()) ldByName.set(norm(c.name), c);
  const rbByName = new Map(catalog.colors.map((c) => [norm(c.name), c]));
  const colors = {};
  for (const name of COLOR_NAMES) {
    const ld = LD_CODE[name] !== undefined ? lib.colors().get(LD_CODE[name]) : ldByName.get(norm(name));
    const rb = rbByName.get(norm(name));
    if (!ld || !rb) throw new Error(`Color "${name}": ${ld ? '' : 'no está en LDraw '}${rb ? '' : 'no está en Rebrickable'}`);
    colors[name] = { ld: ld.code, rb: rb.id, rgb: `#${rb.rgb}`, trans: !!rb.is_trans, finish: ld.finish, alpha: ld.alpha };
  }
  const parts = {};
  for (const [name, def] of Object.entries(PARTS)) parts[name] = { ld: name, rb: name, ...def };
  return { colors, parts };
}

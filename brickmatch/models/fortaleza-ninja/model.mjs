// Base de Operaciones Ninja: la Base Universal convertida en cuartel.
// Atrás, el edificio con sala de operaciones, torre de control y equipo técnico;
// adelante, sobre la mesa, un patio de armas amurallado con torres, armería,
// taller y lugar para un vehículo.
// Usa la misma caja (set 70751 Temple of Airjitzu): aprovecha piezas que
// en la base quedaban sin usar (las persianas negras son los techos).
// Cada unión especial (clips, bisagras, ejes) la comprueba el validador.
import base, { watchtower } from '../base-universal/model.mjs';
import { compose } from '../../lib/ldraw.mjs';
import { rotY } from '../../lib/builder.mjs';

export const meta = {
  order: 4,
  title: 'Base de Operaciones Ninja',
  prompt: 'Que parezca una base de operaciones y no un templo: más grande, con lugares para guardar armas, lugar para el buggy de Jay y para el mecha de Cole, y con el gong; todo dentro de la estética Ninjago',
  description: 'Un cuartel amurallado de unos 49 × 54 cm armado con una sola caja. Adelante, el patio de armas: muro con dos torres en las esquinas (vigía y torreta) sobre zócalos de piedra, portón de 16 cm de ancho con estandartes de dragón, plataforma para el buggy y, del otro lado, el lugar del mecha: un podio junto al portón, como las estatuas guardianas de los templos, y un armero de ejes para su espada. A los lados, dos galerías de postes rojos con techo de persianas negras: la armería, con racks de lanzas y espadas, y el taller del vehículo. Atrás, el edificio principal de tres niveles: sala de operaciones bajo la pagoda, torre de control con radar, taller, vivienda, salón del maestro, pista de aterrizaje y jardín. Con piezas que sobraban se sumaron el gong de alarma, un carro de provisiones, un muñeco de práctica, un farol y las estatuas del torii. Solo usa piezas del set 70751 Temple of Airjitzu. Las minifiguras, el buggy y la silueta del mecha de Cole (set 71854, 19 cm) son de prueba: muestran que entran.',
  target: '70751-1',
};

const C = {
  ground: 'Dark Tan', floor: 'Tan', wood: 'Reddish Brown', dark: 'Dark Brown', wall: 'Dark Red', red: 'Red',
  roof: 'Black', stone: 'Dark Bluish Gray', pale: 'Light Bluish Gray', blue: 'Medium Blue', green: 'Sand Green',
  gold: 'Pearl Gold', glass: 'Trans-Clear', water: 'Medium Azure', reed: 'Olive Green',
};
// Orden en que conviene construirlo de verdad: lo de adentro antes de cerrar con
// el piso de arriba, los racks antes del techo. Cada parte agrupa capítulos
// (los títulos de m.step).
export const buildOrder = [
  ['El suelo y la planta baja', [
    'Suelo del patio', 'Tarima de entrenamiento y senderos', 'Jardín: estanque, puente y roca',
    'Salón del maestro: muro de fondo', 'Salón del maestro: columnas y portal', 'Taller: muros y portal', 'Vivienda: muros y portal',
    'Salón del maestro: círculo de reunión', 'Sala de reuniones', 'Armero del salón', 'Trofeos del salón',
    'Taller', 'Foso del taller y banco de trabajo', 'Vivienda: cucheta, cocina y mesa',
  ]],
  ['La planta alta y los techos', [
    'Pisos de la planta alta', 'Aleros con medallones', 'Puesto de mando',
    'Sala de operaciones: mesa de mapas, pantalla táctica y consolas', 'Techo del puesto de mando',
    'Altillo del maestro', 'Faldón del altillo', 'Techo del altillo', 'Remates dorados',
    'Pabellón de té', 'Aguja del pabellón de té', 'Torre de control', 'Torre de control: radar, antenas y banderas',
    'Pista de aterrizaje', 'Pista: círculo de aterrizaje', 'Barandas de las terrazas', 'Estatuas de la terraza',
  ]],
  ['El patio interior y el jardín', [
    'Portón torii', 'Estatuas guardianas del torii', 'Estatuas del patio', 'Muñeco de entrenamiento y faroles de la tarima',
    'Ring de combate', 'Armero de katanas', 'Fragua y yunque', 'Gong de alarma', 'Árbol de otoño', 'Nenúfares y flores',
    'Mirador de la roca', 'Juncos, senderos y bancos', 'Muros laterales',
    'Faroles de la entrada al patio interior', 'Flores a la entrada del patio interior',
  ]],
  ['El muro del frente y las torres', [
    'Sendero del portón al torii', 'Muro del frente: zapatas y tramos de cerca', 'Portón: pilares con estandarte de dragón', 'Bastones en el muro',
    'Torre de vigía: zócalo de piedra en cruz', 'Torre de vigía', 'Torre de defensa: zócalo', 'Torre de defensa con torreta',
  ]],
  ['Las galerías: armería y taller', [
    'Armería: suelo y murete', 'Armería: postes, columna y viga', 'Armería: muro que cierra el patio',
    'Armería: racks de lanzas y espadas', 'Armería: cabios con bisagra', 'Armería: techo de persianas',
    'Taller del vehículo: suelo y murete', 'Taller del vehículo: postes, columna y viga', 'Taller del vehículo: muro que cierra el patio',
    'Taller: banco de trabajo, rueda de repuesto y cajón', 'Taller del vehículo: cabios con bisagra', 'Taller del vehículo: techo de persianas',
  ]],
  ['El patio de armas', [
    'Plataforma del vehículo', 'Podio del guardián', 'Armero del mecha', 'Carro de provisiones', 'Muñeco de práctica', 'Farol de piedra',
  ]],
];

const G = 1; // nivel del patio
const U = 20; // nivel de la planta alta
const R = U + 18; // techo grande del puesto de mando

export default function build(m, helpers) {
  const { rect } = helpers;
  base(m, helpers, { fortress: true });

  const stack = (part, color, x, y, z, n, h, opts = {}) => {
    for (let i = 0; i < n; i++) m.add(part, color, x, y + i * h, z, opts);
  };

  m.step('Torre de control');
  for (let i = 0; i < 5; i++) rect('brick', C.stone, 2, U + 3 * i, 27, 2, 4);
  m.add('2454b', C.green, 5, U, 25);
  m.add('2454b', C.green, 5, U, 29);
  const K = U + 15;
  rect('plate', C.ground, 0, K, 24, 4, 8);
  rect('plate', C.ground, 4, K, 24, 4, 8);
  m.add('32532', C.pale, 1, K + 1, 24, { nest: 'control' }); // el radar va dentro del marco, sin tocarlo

  m.step('Torre de control: radar, antenas y banderas', 'Las banderas se abrochan a la antena con sus dos clips.');
  m.add('6222', C.stone, 2, K + 1, 27, { nest: 'control' });
  m.add('87580', C.stone, 3, K + 4, 28);
  m.add('15395', 'White', 3, K + 5, 28);
  const flag = (antenna, color) => m.addRaw('11055', color, [1, 0, 0, 0, 1, 0, 0, 0, 1, antenna.matrix[9], antenna.matrix[10] - 84, antenna.matrix[11]], { on: antenna });
  flag(m.add('3957b', C.roof, 1, K + 4, 31), C.pale);
  flag(m.add('3957b', C.roof, 6, K + 4, 31), C.pale);
  m.add('6141', C.red, 1, K + 4, 24);
  m.add('6141', C.red, 6, K + 4, 24);

  m.step('Pista: círculo de aterrizaje');
  m.add('11213', C.water, 9, U, 24);

  m.step('Aguja del pabellón de té');
  const T = U + 15;
  stack('4032a', C.wood, 39, T + 3, 26, 6, 1);
  m.add('87580', C.ground, 39, T + 9, 26);
  flag(m.add('3957b', C.roof, 39.5, T + 10, 26.5), 'White');

  m.step('Mirador de la roca', 'Los cuatro ladrillos verdes van en los studs de arriba de la roca del jardín.');
  for (const [x, z] of [[47, 14], [47, 17], [46, 15], [46, 16]]) m.add('3005', C.green, x, G + 18, z);
  rect('plate', C.wood, 44, G + 21, 14, 4, 4);

  // ------------------------------------------------------------------- muros
  m.step('Muros laterales');
  for (let z = 6; z < 22; z += 2) {
    m.add('32064a', C.roof, 0, G, z, { rot: 1 });
    rect('plate', C.ground, 0, G + 3, z, 2, 2);
  }
  for (const z of [6, 10, 14, 18]) m.add('3299', C.roof, 0, G + 4, z, { rot: 1 });
  for (let z = 4; z < 12; z += 2) {
    m.add('32064a', C.stone, 47, G, z, { rot: 1 });
    rect('plate', C.ground, 46, G + 3, z, 2, 2);
  }
  for (const z of [4, 8]) m.add('3299', C.roof, 46, G + 4, z, { rot: 1 });

  // ----------------------------------------------------------------- detalle
  m.step('Faldón del altillo');
  const A = R + 1;
  for (let i = 0; i < 4; i++) {
    m.add('15672', C.roof, 22 + i, A, 19, { face: 'S' });
    m.add('15672', C.ground, 22 + i, A, 27, { face: 'N' });
  }
  for (let i = 0; i < 3; i++) {
    m.add('15672', C.roof, 19, A, 22 + i, { face: 'W' });
    m.add('15672', C.roof, 27, A, 22 + i, { face: 'E' });
  }
  m.add('3040b', C.roof, 19, A, 25, { face: 'W' });
  m.add('3040b', C.roof, 27, A, 25, { face: 'E' });

  m.step('Foso del taller y banco de trabajo');
  m.add('32532', C.pale, 4, G, 23, { rot: 1 });
  m.add('15535', C.stone, 3, G + 4, 29);
  m.add('15535', C.stone, 9, G + 4, 29);

  // Estatuas: tres capítulos, porque se colocan en momentos distintos del armado.
  m.step('Estatuas del patio');
  for (const x of [18, 28]) {
    m.add('87580', C.ground, x, G, 14);
    m.add('41535', C.pale, x + 0.5, G + 1, 14.5);
  }
  m.step('Estatuas de la terraza');
  for (const x of [17, 29]) {
    m.add('15573', C.roof, x, U, 18);
    m.add('41535', C.pale, x + 0.5, U + 1, 18);
  }
  m.step('Trofeos del salón', 'Van al fondo del salón: ponelos antes de cerrar con el piso de arriba.');
  for (const x of [27, 29]) {
    m.add('87580', C.ground, x, G, 29);
    m.add('90398', C.wall, x + 0.5, G + 1, 29.5);
  }

  m.step('Juncos, senderos y bancos');
  for (const [x, z, y] of [[35, 4, G], [35, 7, G], [37, 20, G], [38, 22, G], [43, 13, G], [40, 6, G + 1], [39, 13, G + 1], [36, 15, G + 1]]) {
    m.add('3741', C.reed, x, y, z);
  }
  // Baldosas en L: camino del taller y camino a la vivienda.
  for (const [x, z, rot] of [[11, 17, 0], [11, 19, 2], [11, 21, 0], [34, 13, 0], [34, 15, 2], [34, 17, 0], [34, 19, 2], [20, 3, 0], [26, 3, 3]]) {
    m.add('14719', C.pale, x, G, z, { rot });
  }

  // Bancos: una tabla sobre dos tacos.
  const bench = (x, z) => {
    m.add('6141', C.wood, x, G, z);
    m.add('6141', C.wood, x, G, z + 3);
    rect('tile', C.dark, x, G + 1, z, 1, 4);
  };
  bench(32, 18);
  bench(12, 7);

  // ------------------------------------------------------- aleros y fachada
  m.step('Aleros con medallones', 'Cada escuadra gris cuelga del borde del piso: primero ponele los dos platos redondos en la cara de adelante, después la placa y la teja de arriba.');
  // Escuadra colgando del borde del piso: sostiene dos tejas redondas por tramo,
  // como los aleros del templo original. Arriba, la cornisa y las tejas negras.
  for (const [x0, zrow] of [[0, 22], [16, 16], [32, 22]]) {
    for (let i = 0; i < 4; i++) {
      const x = x0 + 4 * i;
      const b = m.add('93274', C.stone, x, U, zrow, { face: 'S' });
      for (const dx of [-20, 20]) {
        m.addRaw('4032a', C.wood, [1, 0, 0, 0, 0, -1, 0, 1, 0, b.matrix[9] + dx, b.matrix[10] + 20, b.matrix[11] - 22]);
      }
      rect('plate', C.stone, x, U + 1, zrow - 1, 4, 2);
      m.add('3299', C.roof, x, U + 2, zrow - 1);
    }
  }

  // ----------------------------------------------------- sala de operaciones
  m.step('Sala de operaciones: mesa de mapas, pantalla táctica y consolas', 'Va antes del techo grande. El vidrio impreso encaja dentro del marco negro de 1×4×6.');
  // Arriba, bajo la pagoda y a la vista: acá se planea todo.
  m.add('3003', C.stone, 23, U, 21);
  m.add('11213', C.water, 21, U + 3, 19);
  for (const [x, z, color] of [[23, 21, 'Trans-Light Blue'], [24, 22, C.red], [22, 22, 'White'], [25, 20, 'Blue'], [24, 20, 'White']]) {
    m.add('6141', color, x, U + 4, z);
  }
  const screen = m.add('60596', C.roof, 22, U, 27);
  m.addRaw('pantalla', C.glass, compose(screen.matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 4.5, 5]), { on: screen });
  for (const x of [19, 26]) {
    rect('brick', C.roof, x, U, 26, 3, 2);
    for (let i = 0; i < 3; i++) m.add('3040b', C.roof, x + i, U + 3, 26, { face: 'S' });
  }

  m.step('Sala de reuniones');
  m.add('92947', C.dark, 23, G + 1, 23);
  rect('plate', C.wood, 22, G + 4, 22, 4, 4);
  rect('tile', 'Sand Blue', 22, G + 5, 23, 4, 2);
  m.add('61780', C.wood, 12, G, 24);

  m.step('Armero del salón', 'Cada katana entra a presión en su clip, por la empuñadura.');
  const hilt = -8 * (G + 4) + 4;
  m.add('30137', C.wood, 16, G, 19, { rot: 1 });
  ['Black', 'Black', 'Flat Silver', 'Black'].forEach((color, i) => {
    const clip = m.add('60897', i === 3 ? C.floor : C.stone, 16, G + 3, 19 + i, { face: 'E' });
    m.addRaw('21459', color, [1, 0, 0, 0, 1, 0, 0, 0, 1, 17.5 * 20, hilt - 7, (19.5 + i) * 20], { on: clip });
  });

  // ============================================================ PATIO DE ARMAS
  // Delante de los edificios, sobre la mesa: un patio cerrado por el muro del
  // frente, dos torres en las esquinas y una galería techada a cada lado.
  const FZ = -30; // fila sur del muro del frente

  m.step('Muro del frente: zapatas y tramos de cerca', 'Son dos tramos sueltos, uno a cada lado del sendero, apoyados en la mesa. Entre los dos queda el portón, de 20 studs.');
  m.add('91988', C.stone, 0, 0, FZ);
  m.add('3020', C.stone, 34, 0, FZ);
  m.add('3832', C.stone, 38, 0, FZ);
  for (const x of [0, 4, 8, 36, 40, 44]) m.add('3701', C.wood, x, 1, FZ);
  // Albardilla trabada sobre las juntas y tejas arriba.
  for (const x0 of [2, 36]) {
    rect('plate', C.wood, x0, 4, FZ, 1, 2);
    for (let i = 0; i < 4; i++) rect('plate', C.ground, x0 + 1 + 2 * i, 4, FZ, 2, 2);
    rect('plate', C.wood, x0 + 9, 4, FZ, 1, 2);
  }
  for (const x of [0, 4, 8, 36, 40, 44]) m.add('3299', C.roof, x, 5, FZ);

  m.step('Portón: pilares con estandarte de dragón', 'El ala negra se abrocha por su barra al clip dorado y sube como un estandarte.');
  // Entre los pilares quedan 20 studs libres: pasa el buggy.
  for (const [x, rot, sx, W] of [[12, 0, 12, [0, 0, 1, -1, 0, 0, 0, -1, 0]], [34, 1, 35, [0, 0, -1, -1, 0, 0, 0, 1, 0]]]) {
    m.add('3685', C.stone, x, 1, FZ, { rot });
    m.add('3062b', C.red, sx, 10, FZ + 1);
    m.add('6141', 'White', sx, 13, FZ + 1);
    const clip = m.add('61252', C.gold, sx, 14, FZ + 1, { face: 'S' });
    m.add('85975', C.wall, sx, 15, FZ + 1);
    // El ala negra va tomada del clip por su barra y sube como un estandarte.
    m.addRaw('6133', C.roof, [...W, (sx + 0.5) * 20, -(14 * 8 + 6), (FZ + 1.5) * 20 - 20], { on: clip });
  }

  m.step('Bastones en el muro', 'Cada bastón entra a presión en su clip azul y apoya la punta en la mesa.');
  for (const x of [38, 41, 44]) {
    const clip = m.add('60897', 'Blue', x, 1, FZ + 1, { face: 'N' });
    m.addRaw('87618', C.roof, [1, 0, 0, 0, -1, 0, 0, 0, -1, (x + 0.5) * 20, -98.5, (FZ + 1.5) * 20 + 20], { on: clip });
  }

  m.step('Torre de vigía: zócalo de piedra en cruz');
  m.add('3020', C.stone, -6, 0, FZ);
  rect('plate', C.roof, -2, 0, FZ, 2, 2);
  rect('plate', C.roof, -4, 0, FZ - 2, 2, 2);
  rect('plate', C.roof, -4, 0, FZ + 2, 2, 2);
  m.add('2456', C.stone, -6, 1, FZ);
  m.add('90258', C.stone, -4, 1, FZ - 2);
  m.add('90258', C.stone, -4, 1, FZ + 2);
  m.add('2456', C.stone, -4, 4, FZ - 2, { rot: 1 });
  for (const dz of [0, 1]) m.add('15672', C.stone, -6, 4, FZ + dz, { face: 'W' });
  for (const dx of [0, 1]) {
    m.add('15672', C.stone, -4 + dx, 7, FZ - 2, { face: 'S' });
    m.add('15672', C.stone, -4 + dx, 7, FZ + 2, { face: 'N' });
  }
  // Esta placa une el zócalo con la cerca: la torre no se cae al moverla.
  m.add('3020', C.wood, -2, 4, FZ);

  m.step('Torre de vigía', 'La torre sube desde el zócalo en cruz; la placa de madera del zócalo la une al muro.');
  const P = watchtower(m, helpers, -6, 7, FZ - 2, 5);

  m.step('Torre de defensa: zócalo');
  m.add('3031', C.stone, 48, 0, FZ - 1);
  m.add('2357', C.stone, 48, 1, FZ - 1, { rot: 0 });
  m.add('2357', C.stone, 50, 1, FZ - 1, { rot: 3 });
  m.add('2357', C.stone, 48, 1, FZ + 1, { rot: 1 });
  m.add('2357', C.stone, 50, 1, FZ + 1, { rot: 2 });
  m.add('3003', C.stone, 49, 1, FZ);
  m.add('3020', C.wood, 46, 4, FZ);
  rect('plate', C.roof, 50, 4, FZ, 2, 2);
  rect('plate', C.roof, 48, 4, FZ - 1, 4, 1);
  rect('plate', C.roof, 48, 4, FZ + 2, 4, 1);
  for (const x of [48, 50]) {
    m.add('85984', C.stone, x, 5, FZ - 1, { face: 'S' });
    m.add('85984', C.stone, x, 5, FZ + 2, { face: 'N' });
  }
  m.add('85984', C.stone, 51, 5, FZ, { face: 'E' });

  m.step('Torre de defensa con torreta', 'El eje gris atraviesa el ladrillo negro con agujero en cruz y el gatillo gris; el tambor negro de seis bocas calza a presión sobre el gatillo. La tapa gris del plato giratorio entra dentro de la base azul.');
  stack('3003', C.stone, 49, 5, FZ, 5, 3);
  m.add('90258', C.stone, 49, 20, FZ);
  const D = 23;
  rect('plate', C.stone, 48, D, FZ - 1, 4, 4);
  m.add('4865b', C.ground, 49, D + 1, FZ - 1, { face: 'S' });
  m.add('4865b', C.ground, 49, D + 1, FZ + 2, { face: 'N' });
  m.add('4865b', C.ground, 48, D + 1, FZ, { face: 'W' });
  m.add('4865b', C.ground, 51, D + 1, FZ, { face: 'E' });
  // Torreta: mástil de dos ladrillos, plato giratorio y cuna con agujero de eje.
  // El cañón de seis bocas va enchufado como en los sets: un eje atraviesa la
  // cuna y el gatillo, y el tambor calza a presión sobre el gatillo.
  m.add('90258', C.stone, 49, D + 1, FZ);
  m.add('90258', C.stone, 49, D + 4, FZ);
  const swivel = m.add('3680', 'Blue', 49, D + 7, FZ);
  m.add('3679', C.pale, 49, D + 7, FZ, { on: swivel });
  const cradle = m.add('32064a', C.roof, 49, D + 8, FZ);
  m.add('98283', C.stone, 49, D + 8, FZ + 1);
  const bore = -(8 * (D + 8) + 14); // altura del agujero de eje de la cuna
  const axle = m.addRaw('4519', C.pale, [0, 0, 1, 0, 1, 0, -1, 0, 0, 50 * 20, bore, FZ * 20 - 10], { on: cradle });
  const gun = [-1, 0, 0, 0, 1, 0, 0, 0, -1, 50 * 20, bore, FZ * 20 - 20]; // boca hacia el frente
  const trigger = m.addRaw('18587', C.pale, gun, { on: axle });
  m.addRaw('18588', C.roof, gun, { on: trigger });

  // --------------------------------------------------------------- galerías
  // Galería a un agua: postes rojos y columna de madera al frente, murete atrás
  // y techo de persianas negras (las del templo original) sobre tres cabios con
  // bisagra. El techo baja hacia afuera y cierra el patio por ese lado.
  const SLATS = 8; // persianas por paño (dos paños por galería)
  const gallery = (name, E, z0, sill, stub) => {
    const OUT = E ? 54 : -6;
    const ux = (u, w = 1) => (E ? OUT - u - w : OUT + u); // x mínimo de lo que ocupa u..u+w desde el borde exterior
    const roofWood = E ? C.wood : C.ground;

    m.step(`${name}: suelo y murete`, 'Este módulo va apoyado en la mesa, a un costado del patio de armas. Los tirantes del piso unen el murete de afuera con los postes de adelante.');
    // tirantes que unen el murete con los postes
    rect('plate', C.wood, ux(0, 6), 0, z0, 6, 1);
    rect('plate', C.wood, ux(0, 6), 0, z0 + 17, 6, 1);
    rect('plate', E ? C.roof : C.wood, ux(0, 6), 0, z0 + 8, 6, 2);
    rect('plate', C.wood, ux(0), 0, z0 + 1, 1, 4);
    rect('plate', C.wood, ux(0), 0, z0 + 5, 1, 3);
    rect('plate', C.wood, ux(0), 0, z0 + 10, 1, 3);
    rect('plate', C.wood, ux(0), 0, z0 + 13, 1, 4);
    // murete
    sill(ux(0), 1, z0);
    m.add('4510', C.stone, ux(0), 4, z0, { face: E ? 'E' : 'W' });
    m.add('4510', C.stone, ux(0), 4, z0 + 8, { face: E ? 'E' : 'W' });
    rect('plate', C.pale, ux(0), 4, z0 + 16, 1, 2);

    m.step(`${name}: postes, columna y viga`, 'Cada cilindro rojo calza con su boca de abajo en el stud del plato redondo negro, y arriba encastra en la viga.');
    for (const [v, face] of [[0, 'N'], [17, 'S']]) {
      if (v) rect('plate', C.ground, ux(5), 1, z0 + v, 1, 6); // sigue hacia el norte: base del tramo de muro
      else m.add('6141', C.roof, ux(5), 1, z0 + v);
      m.add('6141', C.roof, ux(5), 2, z0 + v);
      m.add('87617', C.red, ux(5), 3, z0 + v, { face });
    }
    // La columna queda un plate más baja que la viga: por encima pasa el cabio
    // del medio. Un plate 1x2 del lado de adentro lleva la viga.
    stack('4032a', C.wood, ux(4, 2), 1, z0 + 8, 14, 1);
    rect('plate', C.wood, ux(5), 15, z0 + 8, 1, 2);
    rect('plate', C.wood, ux(5), 16, z0, 1, 10);
    rect('plate', C.dark, ux(5), 16, z0 + 10, 1, 8);
    rect('plate', C.dark, ux(5), 17, z0, 1, 8);
    rect('plate', C.wood, ux(5), 17, z0 + 8, 1, 10);

    m.step(`${name}: muro que cierra el patio`);
    rect('plate', C.roof, ux(5), 0, z0 + 18, 1, 4);
    stub(ux(5), 2, z0 + 18);
    rect('plate', C.wood, ux(5, 2), 5, z0 + 18, 2, 1);
    rect('plate', C.ground, ux(5, 2), 5, z0 + 19, 2, 2);
    rect('plate', C.wood, ux(5, 2), 5, z0 + 21, 2, 1);
    m.add('3299', C.roof, ux(5, 2), 6, z0 + 18, { rot: 1 });

    // El techo se coloca plano y después se gira sobre las bisagras.
    // Tres cabios, cada uno con su bisagra: los de las puntas son placas 2x8 y
    // el del medio, dos placas 1x8 lado a lado.
    m.step(`${name}: cabios con bisagra`, 'Encajá cada tapa negra en su base de bisagra y poné encima el cabio (en el del medio son dos placas de 1×8). Los tres cabios quedan inclinados y descansan en la viga del frente.');
    const roof = [];
    const rafters = [];
    for (const v of [0, 8, 16]) {
      const hinge = m.add('3937', v === 8 ? 'Blue' : C.stone, ux(0), 5, z0 + v, { rot: E ? 3 : 1 });
      roof.push(m.addRaw('6134', C.roof, hinge.matrix, { on: hinge }));
      const r = v === 8
        ? [0, 1].map((dz) => rect('plate', C.dark, ux(0, 8), 8, z0 + v + dz, 8, 1))
        : [rect('plate', roofWood, ux(0, 8), 8, z0 + v, 8, 2)];
      roof.push(...r);
      rafters.push(r[0]);
    }
    // Dos paños de persianas enganchadas entre sí. Van apoyadas sobre los studs
    // de los cabios (un techo que se levanta), pero no se corren: cada unión
    // entre persianas cuelga entre dos filas de studs, y los pernos de las
    // puntas quedan entre dos studs del cabio.
    m.step(`${name}: techo de persianas`, 'Enganchá las persianas de a ocho para formar dos paños y apoyalos sobre los cabios: cada unión entre persianas cae entre dos filas de studs y los pernos de las puntas, entre dos studs. El techo va apoyado, no a presión: se levanta para jugar adentro.');
    const R = E ? [0, 1, 0, 0, 0, -1, -1, 0, 0] : [0, -1, 0, 0, 0, -1, 1, 0, 0];
    [4.5, 13.5].forEach((c, k) => {
      for (let j = 1; j <= SLATS; j++) {
        roof.push(m.addRaw('4218', C.roof, [...R, (OUT + (E ? -j : j)) * 20, -78.5, (z0 + c) * 20], { on: rafters[2 * k], rest: true }));
      }
    });
    // Ángulo: el cabio queda apoyado en la arista de la viga del frente.
    const d = 90, h = 18 * 8 - 54 + 0.6;
    let lo = 0.3, hi = 1.2;
    for (let i = 0; i < 50; i++) {
      const th = (lo + hi) / 2;
      if (d * Math.tan(th) + 10 / Math.cos(th) < h) lo = th;
      else hi = th;
    }
    const ang = (E ? 1 : -1) * hi;
    const c = Math.cos(ang), s = Math.sin(ang);
    const X = (E ? OUT - 0.5 : OUT + 0.5) * 20, Y = -54;
    const T = [c, -s, 0, s, c, 0, 0, 0, 1, X - (c * X - s * Y), Y - (s * X + c * Y), 0];
    for (const p of roof) p.matrix = compose(T, p.matrix).map((v) => Math.round(v * 1000) / 1000 + 0);
  };

  gallery('Armería', true, FZ + 5, (x, y, z) => {
    for (let i = 0; i < 6; i++) rect('brick', C.roof, x, y, z + 3 * i, 1, 3);
  }, (x, y, z) => {
    m.add('32064a', C.roof, x, y, z, { rot: 1 });
    m.add('32064a', C.roof, x, y, z + 2, { rot: 1 });
  });

  m.step('Armería: racks de lanzas y espadas', 'Van antes del techo. Las lanzas y las espadas entran a presión en los clips, acostadas.');
  // Racks escalonados, como un katana-kake: cada arma descansa acostada en dos clips.
  const lay = (part, color, x, h, zmm, flip, clips) => {
    const M = flip ? [-1, 0, 0, 0, 0, -1, 0, -1, 0, x, -h, zmm] : [1, 0, 0, 0, 0, -1, 0, 1, 0, x, -h, zmm];
    const w = m.addRaw(part, color, M, { on: clips[0] });
    m.attach(w, clips[1]);
    return w;
  };
  {
    // lanzas (sur)
    rect('plate', C.ground, 51, 0, -23, 1, 6);
    rect('plate', C.ground, 50, 0, -23, 1, 6);
    rect('plate', C.wood, 50, 1, -18, 2, 2); // traba el rack con el tirante de la galería
    const tiers = [[51, 2], [50, 1]].map(([x, n]) => [-22, -19].map((z) => {
      stack('3005', C.red, x, 1, z, n, 3);
      return m.add('15712', C.wall, x, 1 + 3 * n, z);
    }));
    tiers.forEach((clips, i) => lay('93789', C.roof, [1030, 1010][i], [70, 46][i], -440, false, clips));
    // espadas doradas (norte)
    rect('plate', C.ground, 51, 0, -15, 1, 6);
    rect('plate', C.ground, 50, 0, -15, 1, 6);
    rect('plate', C.wood, 50, 1, -16, 2, 2);
    // las manijas miran hacia afuera del rack: no pisan studs vecinos
    const tiers2 = [[51, 2, 'E'], [50, 1, 'W']].map(([x, n, face]) => [-14, -12].map((z) => {
      stack('2921', C.red, x, 1, z, n, 3, { face });
      return m.add('15712', C.roof, x, 1 + 3 * n, z);
    }));
    tiers2.forEach((clips, i) => lay('11156', C.gold, [1030, 1010][i], [70, 46][i], -280, true, clips));
  }

  gallery('Taller del vehículo', false, FZ + 5, (x, y, z) => {
    rect('brick', C.roof, x, y, z, 1, 3);
    rect('brick', C.roof, x, y, z + 3, 1, 6);
    m.add('30137', C.wood, x, y, z + 9, { rot: 1 });
    rect('brick', C.wood, x, y, z + 13, 1, 4);
    m.add('4070', C.wood, x, y, z + 17, { face: 'E' });
  }, (x, y, z) => m.add('3701', C.wood, x, y, z, { rot: 1 }));

  m.step('Taller: banco de trabajo, rueda de repuesto y cajón', 'Van antes del techo. La llanta entra por el agujero del centro en el perno del ladrillo de arriba.');
  {
    m.add('3004', C.stone, -5, 0, -22);
    m.add('3004', C.stone, -5, 0, -19);
    m.add('3020', C.wood, -5, 3, -22, { rot: 1 });
    rect('tile', C.roof, -5, 4, -21, 2, 2);
    m.add('3899', C.red, -4, 4, -19);
    // tres ladrillos con perno: dos ganchos y, arriba, la llanta de repuesto
    m.add('6232', C.stone, -5, 0, -14, { face: 'S' });
    m.add('6232', C.stone, -5, 3, -14, { face: 'S' });
    const top = m.add('6232', C.stone, -5, 6, -14, { face: 'E' });
    m.addRaw('60208', C.stone, [0, 0, -1, 0, 1, 0, 1, 0, 0, top.matrix[9] + 20 + 10.5, top.matrix[10] + 10, top.matrix[11]], { on: top });
    m.add('30150', C.wood, -5, 0, -11, { rot: 1 });
  }

  m.step('Sendero del portón al torii', 'Empezá pegado al borde del patio, frente al torii, y avanzá hacia afuera: el sendero marca dónde va el muro del frente.');
  for (let i = 0; i < 13; i++) rect('plate', i % 12 ? C.ground : C.roof, 23, 0, -28 + 2 * i, 2, 2);
  for (let i = 0; i < 6; i++) m.add('87079', i % 3 === 1 ? C.stone : C.roof, 23, 1, -27 + 4 * i, { rot: 1 });
  rect('tile', C.pale, 23, 1, -28, 2, 1);
  rect('tile', C.pale, 23, 1, -3, 2, 1);

  m.step('Faroles de la entrada al patio interior');
  for (const x of [1, 45]) {
    m.add('15573', C.roof, x, G, 1);
    m.add('3062b', C.wood, x + 0.5, G + 1, 1);
    m.add('6141', 'White', x + 0.5, G + 4, 1);
    m.add('14769', C.stone, x, G + 5, 0.5);
  }

  m.step('Plataforma del vehículo', 'Un cordón en U apoyado en la mesa, abierto hacia el portón: ahí estaciona el buggy.');
  // Cordón de madera en U, abierto hacia el portón: ahí estaciona el buggy.
  for (const x of [1, 20]) {
    rect('plate', C.roof, x, 0, -27, 1, 3);
    rect('plate', C.dark, x, 0, -24, 1, 8);
    rect('plate', C.dark, x, 0, -16, 1, 8);
    rect('plate', C.roof, x, 0, -8, 1, 6);
    for (let i = 0; i < 6; i++) rect('tile', C.dark, x, 1, -25 + 4 * i, 1, 4);
    m.add('3070b', C.stone, x, 1, -27);
    m.add('3070b', C.stone, x, 1, -26);
  }
  rect('plate', C.roof, 1, 0, -2, 6, 1);
  rect('plate', C.dark, 7, 0, -2, 8, 1);
  rect('plate', C.roof, 15, 0, -2, 6, 1);
  for (let i = 0; i < 4; i++) rect('tile', C.dark, 2 + 4 * i, 1, -2, 4, 1);
  rect('tile', C.pale, 18, 1, -2, 2, 1);
  m.envelope(2.25, 0, -27.4, 17.5, 25, 34.4, { label: 'el buggy de Jay' });

  // ------------------------------------------- con lo que sobraba en la caja
  // Arma algo alrededor del origen y después lo gira k cuartos de vuelta y lo
  // lleva a (x, z): sirve para orientar módulos sueltos.
  const placed = (x, z, k, fn) => {
    const from = m.placements.length;
    fn();
    const T = [...rotY(k).slice(0, 9), x * 20, 0, z * 20];
    for (const p of m.placements.slice(from)) p.matrix = compose(T, p.matrix).map((v) => Math.round(v * 1000) / 1000 + 0);
  };

  m.step('Gong de alarma', 'El gong encastra de canto en los dos studs de arriba de la escuadra; el mazo va a presión en el clip azul.');
  // En el patio interior, mirando a la explanada: marco con postes verdes, viga
  // roja y el gong colgado de una escuadra; el mazo espera en un clip.
  {
    const gx = 8, gz = 0, y = G;
    rect('plate', C.red, gx, y, gz, 8, 1);
    rect('plate', C.red, gx, y, gz + 1, 8, 1);
    for (const x of [gx, gx + 7]) {
      m.add('3245c', C.green, x, y + 1, gz, { rot: 1 });
      m.add('3245c', C.green, x, y + 7, gz, { rot: 1 });
    }
    rect('brick', C.red, gx, y + 13, gz, 8, 1);
    rect('plate', C.stone, gx - 1, y + 13, gz + 1, 10, 1);
    rect('plate', C.roof, gx - 1, y + 16, gz, 10, 1);
    m.add('3633', C.gold, gx, y + 17, gz);
    m.add('3633', C.gold, gx + 4, y + 17, gz);
    m.add('44728', C.wood, gx + 3, y + 8, gz, { face: 'S' });
    // El gong va de canto: encastra en dos studs de la escuadra por su borde de arriba.
    m.addRaw('11833', 'Medium Nougat', [1, 0, 0, 0, 0, -1, 0, 1, 0, (gx + 4) * 20, -(y * 8 + 64), (gz + 0.5) * 20 - 14 - 8]);
    const clip = m.add('60897', 'Blue', gx + 1, y + 1, gz, { face: 'S' });
    m.addRaw('4522', C.roof, [1, 0, 0, 0, 1, 0, 0, 0, 1, (gx + 1.5) * 20, -(y * 8 + 47.5), (gz + 0.5) * 20 - 20], { on: clip });
  }

  m.step('Carro de provisiones', 'Las ruedas entran a presión en los pernos del portarruedas negro. El carro queda suelto: se puede mover.');
  // Dos ruedas de carreta, varas para tirar y un cofre. Las ruedas miden 84 LDU:
  // el eje queda a 42 y la caja, fuera de la grilla de plates.
  placed(33, -7, 1, () => {
    const Y = 4.625;
    const axle = m.add('4600', C.roof, -1, Y, -1);
    m.addRaw('4489b', C.wood, [0, 0, 1, 0, 1, 0, -1, 0, 0, 34, -42, 0], { on: axle });
    m.addRaw('4489b', C.wood, [0, 0, -1, 0, 1, 0, 1, 0, 0, -34, -42, 0], { on: axle });
    const B = Y + 1.25;
    m.add('3020', C.wood, -1, B, -3, { rot: 1 });
    rect('plate', C.wood, -1, B + 1, -3, 2, 1);
    m.add('3839b', C.stone, -1, B + 2, -3, { face: 'S' });
    const chest = m.add('4738b', C.wood, -1, B + 1, -1, { rot: 1 });
    m.add('4739a', C.wood, -1, B + 5, -1, { rot: 1, on: chest });
  });

  m.step('Muñeco de práctica');
  {
    const ox = 43, oz = -11;
    m.add('60474', C.roof, ox - 2, 0, oz - 2);
    m.add('92947', C.dark, ox - 1, 1, oz - 1);
    m.add('3839b', C.stone, ox - 1, 4, oz - 1, { face: 'S' });
    m.add('3839b', C.stone, ox - 1, 4, oz, { face: 'N' });
    m.add('92947', C.dark, ox - 1, 5, oz - 1);
    m.add('18674', C.wood, ox - 1, 8, oz - 1);
    const head = m.add('3626c', C.red, ox - 0.5, 9, oz - 0.5);
    m.addRaw('93059', 'Flat Silver', head.matrix);
  }

  m.step('Farol de piedra');
  m.add('30145', C.pale, 44, 0, -6);
  m.add('98100', C.pale, 44, 9, -6);
  m.add('6141', 'Yellow', 44.5, 12, -5.5);
  m.add('14769', C.pale, 44, 13, -6);

  // ---------------------------------------------------- lugar del guardián
  // El mecha de Cole (set 71854, 19 cm: tan alto como la pagoda) se para al
  // lado del portón, como las estatuas guardianas de los templos. No es parte
  // del modelo: va como silueta.
  m.step('Podio del guardián', 'Va apoyado en la mesa, al lado del portón. Arriba se para el mecha.');
  const podium = rect('plate', C.wood, 31, 0, -22, 10, 6);
  for (const z of [-22, -17]) {
    rect('tile', C.roof, 31, 1, z, 6, 1);
    rect('tile', C.roof, 37, 1, z, 4, 1);
  }

  m.step('Armero del mecha', 'Cada eje entra por la punta con stud en un agujero de la placa roja. En los ejes se enchufa la espada del mecha.');
  // Cuatro ejes parados sobre una placa con agujeros: la espada grande del
  // mecha (pieza 79895, con agujero de eje) se guarda enchufada ahí.
  placed(43, -15, 1, () => {
    m.add('2357', C.red, 0, 0, 0, { rot: 3 });
    m.add('2357', C.red, 6, 0, 0, { rot: 2 });
    m.add('3738', C.red, 0, 3, 0);
    // El stud de la punta del eje entra en el agujero de la placa.
    for (const dx of [1, 3, 5, 7]) m.addRaw('6587', C.ground, [0, -1, 0, 1, 0, 0, 0, 0, 1, dx * 20, -(4 * 8 + 30), 20]);
  });

  // Silueta aproximada del mecha: solo está publicado su alto (19 cm); el
  // ancho y los pies están estimados por sus piezas.
  {
    const cx = 36, cz = -19, L = { label: 'el mecha de Cole (silueta aproximada)' };
    const Y = 1.5; // parado sobre los studs del podio
    const feet = [-1, 1].map((s) => m.envelope(cx + (s < 0 ? -5 : 1), Y, cz - 2, 4, 4, 5, L));
    m.propLinks.push([feet[0], podium]);
    for (const s of [-1, 1]) {
      m.envelope(cx + (s < 0 ? -4.5 : 1.5), Y + 5, cz - 2, 3, 4, 20, L); // piernas
      m.envelope(cx + (s < 0 ? -9 : 5), Y + 16, cz - 2.5, 4, 5, 26, L); // brazos
      m.envelope(cx + (s < 0 ? -9.5 : 4.5), Y + 42, cz - 3, 5, 6, 8, L); // hombreras
    }
    m.envelope(cx - 4, Y + 24, cz - 2.5, 8, 5, 6, L); // cadera
    m.envelope(cx - 5, Y + 30, cz - 3.5, 10, 7, 20, L); // torso
    m.envelope(cx - 2, Y + 50, cz - 2, 4, 4, 9, L); // cabeza
  }

  m.step('Estatuas guardianas del torii');
  m.add('85863', C.pale, 18, G, 0);
  m.add('85863', C.pale, 29, G, 0);

  m.step('Flores a la entrada del patio interior');
  for (const x of [4, 6, 34, 37, 40, 43]) {
    m.add('6141', 'Lime', x, G, 0);
    m.add('33291', C.red, x, G + 1, 0);
  }

  // -------------------------------------------------- minifiguras de prueba
  const H = '3901', HAT = '93059', HELM = '30175';
  const figs = [
    // patio
    [7, G, 11, 'S', 'Red', H, 'Black'], [7, G, 8, 'N', 'Blue', H, 'Dark Brown'],
    [7, G, 21, 'S', 'Dark Red', HAT, 'Tan'], [3, G, 14, 'E', 'Black', HELM, 'Black'],
    [22, G + 1, 5, 'N', 'Green', H, 'Dark Brown'], [24, G + 1, 12, 'S', 'White', H, 'Black'],
    // jardín
    [39, G + 9, 11, 'S', 'Lime', H, 'Black'], [32, G, 7, 'E', 'Sand Green', H, 'Dark Brown'], [33, G, 15, 'E', 'Tan', HAT, 'Tan'],
    [45, G + 22, 15, 'W', 'Dark Green', H, 'Dark Brown'],
    // salón, taller y vivienda
    [23, G + 1, 19, 'N', 'Dark Purple', H, 'Black'], [23, G + 1, 28, 'S', 'White', HAT, 'Tan'],
    [19, G + 1, 23, 'E', 'Medium Azure', H, 'Reddish Brown'], [28, G + 1, 23, 'W', 'Red', H, 'Black'],
    [6, G, 26, 'N', 'Dark Bluish Gray', H, 'Dark Brown'], [9, G, 25, 'S', 'Red', H, 'Reddish Brown'],
    [34, G, 28, 'N', 'Blue', H, 'Black'],
    // torres
    [-4, P + 1, FZ, 'S', 'Dark Green', HELM, 'Dark Green'], [3, K + 1, 25, 'N', 'Orange', H, 'Black'],
    // planta alta
    [11, U + 1, 26, 'S', 'Black', H, 'Dark Brown'],
    [21, U, 17, 'S', 'Red', H, 'Dark Brown'], [26, U, 17, 'S', 'Blue', HELM, 'Blue'],
    [20, U, 21, 'E', 'Green', H, 'Black'], [27, U, 21, 'W', 'Black', H, 'Reddish Brown'], [23, U, 25, 'S', 'White', H, 'Dark Brown'],
    [39, U, 24, 'N', 'Dark Purple', H, 'Reddish Brown'], [33, U, 27, 'E', 'Medium Azure', H, 'Black'], [45, U, 26, 'W', 'Sand Green', HAT, 'Tan'],
    // patio de armas (sobre la mesa)
    [28, 0, -13, 'E', 'Orange', H, 'Reddish Brown'], [31, 0, -13, 'W', 'Dark Blue', H, 'Black'],
    [26, 0, -4, 'E', 'Dark Red', H, 'Black'], [47, 0, -13, 'E', 'Lime', H, 'Dark Brown'],
    [-2, 0, -22, 'W', 'Dark Blue', H, 'Black'], [26, 0, -34, 'S', 'Black', HAT, 'Tan'],
    [26, 0, -24, 'N', 'Dark Green', H, 'Dark Brown'],
  ];
  for (const [x, y, z, face, color, hat, hatColor] of figs) m.fig(x, y, z, { face, color, hat, hatColor });
}

// Templo Zen estilo Ninjago: pagoda cuadrada de dos techos sobre plataforma
// de piedra, con torii, estanque de kois, linterna de piedra, cerezo y bambú.
// Diseño libre (sin limitarse a un set): colores rojo / negro / dorado.
//
// Grilla: x 0..24 (oeste→este), z 0..24 (frente→fondo), y en plates.
import { rotY } from '../../lib/builder.mjs';

export const meta = {
  title: 'Templo Zen Ninjago',
  prompt: 'Quiero una casa Zen Ninjago',
  description: 'Pagoda de dos techos sobre plataforma de piedra, con torii, estanque de kois, linterna de piedra, cerezo en flor y bambú. Diseño libre en rojo, negro y dorado.',
};

// Colores por función (se pueden cambiar todos desde acá).
const C = {
  ground: 'Tan',
  stone: 'Light Bluish Gray',
  rock: 'Dark Bluish Gray',
  deck: 'Reddish Brown',
  column: 'Red',
  beam: 'Red',
  wall: 'White',
  sill: 'Black',
  frame: 'Black',
  paper: 'White',
  rail: 'Black',
  roof: 'Black',
  gold: 'Pearl Gold',
  lattice: 'Pearl Gold',
  lantern: 'Trans-Yellow',
  water: 'Trans-Light Blue',
  koi: 'Trans-Orange',
  wood: 'Reddish Brown',
  leaf: 'Green',
  moss: 'Lime',
  blossom: 'Bright Pink',
  canopy: 'White',
};

export default function build(m, { rect, fill, roofRing, roofCap }) {
  // ------------------------------------------------------------------ base
  m.step('Base del jardín');
  for (const x of [0, 8, 16]) {
    rect('plate', C.ground, x, 0, 8, 8, 16);
    rect('plate', C.ground, x, 0, 0, 8, 8);
  }

  // -------------------------------------------------------------- estanque
  m.step('Estanque de kois');
  const pond = { 2: [3, 5], 3: [2, 6], 4: [1, 6], 5: [1, 6], 6: [1, 6], 7: [2, 5], 8: [3, 4] }; // z → [x mín, x máx]
  const taken = new Set(['3,4', '5,6', '4,3', '2,5', '5,4', '3,7', '3,8', '4,7', '4,8']);
  const inPond = (x, z) => pond[z] && x >= pond[z][0] && x <= pond[z][1];
  m.add('3069b', C.water, 3, 1, 7, { rot: 1 }); // estas dos cruzan la unión entre placas base
  m.add('3069b', C.water, 4, 1, 7, { rot: 1 });
  fill('tile', C.water, 1, 1, 2, 6, 7, { sizes: ['1x2', '1x1'], skip: (x, z) => !inPond(x, z) || taken.has(`${x},${z}`) });
  m.add('3024', C.water, 3, 1, 4);
  m.add('24866', C.blossom, 3, 2, 4); // loto
  m.add('3024', C.water, 5, 1, 6);
  m.add('98138', C.moss, 5, 2, 6); // nenúfar
  for (const [x, z] of [[4, 3], [2, 5], [5, 4]]) m.add('98138', C.koi, x, 1, z);
  // piedras del borde
  m.add('6141', C.rock, 2, 1, 2);
  m.add('6141', C.stone, 6, 1, 2);
  m.add('3062b', C.rock, 0, 1, 4);
  m.add('6141', C.moss, 0, 4, 4);
  m.add('6141', C.stone, 0, 1, 6);
  m.add('54200', C.rock, 1, 1, 7, { face: 'S' });
  m.add('6141', C.rock, 6, 1, 8);
  m.add('54200', C.stone, 7, 1, 3, { face: 'E' });

  // ---------------------------------------------------- plataforma de piedra
  m.step('Plataforma de piedra');
  rect('brick', C.stone, 6, 1, 11, 6, 1);
  rect('brick', C.stone, 12, 1, 11, 6, 1);
  rect('brick', C.stone, 6, 1, 22, 6, 1);
  rect('brick', C.stone, 12, 1, 22, 6, 1);
  rect('brick', C.stone, 6, 1, 12, 1, 6);
  rect('brick', C.stone, 6, 1, 18, 1, 4);
  rect('brick', C.stone, 17, 1, 12, 1, 4);
  rect('brick', C.stone, 17, 1, 16, 1, 6);
  for (const [x, z] of [[8, 13], [14, 13], [8, 19], [14, 19], [11, 16]]) m.add('3003', C.stone, x, 1, z);

  m.step('Piso de madera');
  for (const [x, z] of [[6, 11], [12, 11], [6, 17], [12, 17]]) rect('plate', C.deck, x, 4, z, 6, 6);

  m.step('Escalera');
  rect('plate', C.stone, 10, 1, 9, 4, 2);
  rect('tile', C.stone, 10, 1, 8, 4, 1);
  rect('tile', C.stone, 10, 2, 9, 4, 1);
  rect('plate', C.stone, 10, 2, 10, 4, 1);
  rect('tile', C.stone, 10, 3, 10, 4, 1);

  // ------------------------------------------------------------ planta baja
  m.step('Zócalo y postes');
  for (const [x, z] of [[8, 13], [15, 13], [8, 20], [15, 20]]) m.add('2453b', C.column, x, 5, z);
  rect('brick', C.sill, 9, 5, 13, 2, 1);
  rect('brick', C.sill, 13, 5, 13, 2, 1);
  rect('brick', C.sill, 9, 5, 20, 6, 1);
  rect('brick', C.sill, 8, 5, 14, 1, 6);
  rect('brick', C.sill, 15, 5, 14, 1, 6);

  m.step('Muros y paneles shoji');
  const shoji = (x, z, face) => {
    for (const y of [8, 14]) {
      const f = m.add('60592', C.frame, x, y, z, { face });
      m.addRaw('60601', C.paper, f.matrix, { on: f });
    }
  };
  const wall = (x, z, rot) => {
    for (const y of [8, 14]) m.add('3245c', C.wall, x, y, z, { rot });
  };
  shoji(9, 13, 'S');
  shoji(13, 13, 'S');
  wall(9, 20, 0);
  shoji(11, 20, 'N');
  wall(13, 20, 0);
  for (const x of [8, 15]) {
    wall(x, 14, 1);
    shoji(x, 16, x === 8 ? 'W' : 'E');
    wall(x, 18, 1);
  }

  m.step('Columnas y barandas');
  for (const [x, z] of [[6, 11], [17, 11], [6, 22], [17, 22], [9, 11], [14, 11]]) m.add('2453b', C.column, x, 5, z);
  for (const x of [6, 17]) {
    m.add('3633', C.rail, x, 5, 13, { rot: 1 });
    m.add('3633', C.rail, x, 5, 17, { rot: 1 });
  }
  m.add('3633', C.rail, 8, 5, 22);
  m.add('3633', C.rail, 12, 5, 22);

  m.step('Vigas');
  m.add('3004', C.beam, 11, 17, 13); // dintel de la puerta (queda tomado por la viga de arriba)
  rect('plate', C.beam, 8, 20, 13, 8, 1);
  rect('plate', C.beam, 8, 20, 20, 8, 1);
  rect('plate', C.beam, 8, 20, 14, 1, 6);
  rect('plate', C.beam, 15, 20, 14, 1, 6);
  rect('plate', C.beam, 6, 20, 11, 12, 1);
  rect('plate', C.beam, 6, 20, 22, 12, 1);
  rect('plate', C.beam, 6, 20, 12, 1, 10);
  rect('plate', C.beam, 17, 20, 12, 1, 10);

  // ----------------------------------------------------------- techo inferior
  m.step('Alero inferior');
  for (const [x, z] of [[4, 9], [12, 9], [4, 17], [12, 17]]) rect('plate', C.roof, x, 21, z, 8, 8);

  m.step('Faroles');
  for (const x of [7, 16]) {
    m.add('6141', C.gold, x, 19, 11);
    m.add('3062b', C.lantern, x, 16, 11);
    m.add('6141', C.gold, x, 15, 11);
  }

  m.step('Techo inferior');
  roofRing(C.roof, 5, 22, 10, 14, 14);

  // Remate de esquina: ladrillo con stud lateral + cuerno dorado hacia afuera.
  const ornament = (x, y, z, side) => {
    const b = m.add('87087', C.roof, x, y, z, { face: side });
    m.add('6141', C.gold, x, y + 3, z);
    const tip = m.studsOf(b)[1].tip;
    const M = rotY(side === 'W' ? 3 : 1);
    M[9] = tip[0];
    M[10] = tip[1];
    M[11] = tip[2];
    m.addRaw('53451', C.gold, M, { on: b });
  };
  for (const z of [9, 24]) {
    ornament(4, 22, z, 'W');
    ornament(19, 22, z, 'E');
  }

  // ------------------------------------------------------------ segundo piso
  m.step('Segundo piso');
  const upperCourse = (y) => {
    m.add('2357', C.column, 8, y, 13, { rot: 0 });
    m.add('2357', C.column, 14, y, 13, { rot: 3 });
    m.add('2357', C.column, 14, y, 19, { rot: 2 });
    m.add('2357', C.column, 8, y, 19, { rot: 1 });
  };
  upperCourse(22);
  rect('brick', C.wall, 10, 22, 13, 4, 1);
  rect('brick', C.wall, 10, 22, 20, 4, 1);
  rect('brick', C.wall, 8, 22, 15, 1, 4);
  rect('brick', C.wall, 15, 22, 15, 1, 4);
  upperCourse(25);
  upperCourse(28);
  m.add('32932', C.lattice, 10, 25, 13);
  m.add('32932', C.lattice, 10, 25, 20);
  m.add('32932', C.lattice, 8, 25, 15, { rot: 1 });
  m.add('32932', C.lattice, 15, 25, 15, { rot: 1 });

  m.step('Alero superior');
  for (const [x, z] of [[6, 11], [12, 11], [6, 17], [12, 17]]) rect('plate', C.roof, x, 31, z, 6, 6);

  m.step('Techo superior');
  roofRing(C.roof, 7, 32, 12, 10, 10);
  for (const z of [11, 22]) {
    ornament(6, 32, z, 'W');
    ornament(17, 32, z, 'E');
  }
  roofCap(C.roof, 9, 35, 14);

  m.step('Remate dorado');
  m.add('87580', C.roof, 11, 38, 16);
  m.add('6141', C.gold, 11.5, 39, 16.5);
  m.add('6141', C.gold, 11.5, 40, 16.5);
  m.add('59900', C.gold, 11.5, 41, 16.5);
  m.add('6141', C.gold, 11.5, 44, 16.5);

  // ------------------------------------------------------------------ torii
  m.step('Torii');
  for (const x of [10, 13]) {
    for (let k = 0; k < 4; k++) m.add('3062b', C.column, x, 1 + 3 * k, 3);
  }
  rect('plate', C.column, 9, 13, 3, 6, 1);
  m.add('3062b', C.column, 10, 14, 3);
  m.add('3062b', C.column, 13, 14, 3);
  rect('plate', C.roof, 8, 17, 3, 8, 1);
  rect('tile', C.roof, 9, 18, 3, 6, 1);
  m.add('54200', C.roof, 8, 18, 3, { face: 'E' });
  m.add('54200', C.roof, 15, 18, 3, { face: 'W' });
  m.add('14769', C.stone, 11, 1, 0);
  m.add('14769', C.stone, 11, 1, 3);
  m.add('14769', C.stone, 11, 1, 6);
  m.add('3069b', C.stone, 9, 1, 7, { rot: 1 }); // losas que cruzan la unión de las placas base
  m.add('3069b', C.stone, 14, 1, 7, { rot: 1 });

  // ------------------------------------------------------- linterna de piedra
  m.step('Linterna de piedra');
  m.add('18674', C.stone, 7, 1, 5);
  m.add('3062b', C.stone, 7.5, 2, 5.5);
  m.add('3062b', C.lantern, 7.5, 5, 5.5);
  m.add('4740', C.stone, 7, 8, 5);
  m.add('6141', C.stone, 7.5, 9, 5.5);

  // ---------------------------------------------------------------- cerezo
  m.step('Cerezo en flor');
  m.add('3941', C.wood, 19, 1, 3);
  m.add('18674', C.wood, 19, 4, 3);
  m.add('3062b', C.wood, 19.5, 5, 3.5);
  m.add('3062b', C.wood, 19.5, 8, 3.5);
  const leaves = [];
  [[11, 0], [15, 2], [19, 1], [23, 3]].forEach(([y, rot], i) => {
    leaves.push(m.add('2417', C.canopy, 19.5, y, 3.5, { rot }));
    if (i < 3) m.add('3062b', C.wood, 19.5, y + 1, 3.5);
  });
  m.add('6141', C.wood, 19.5, 24, 3.5);
  m.add('24866', C.blossom, 19.5, 25, 3.5);
  for (const leaf of leaves) {
    for (const i of [0, 2, 4, 6, 9, 11, 13]) m.onStud(leaf, i, '24866', C.blossom);
  }

  // ------------------------------------------------------------ jardín seco
  m.step('Jardín de piedras');
  m.add('3040b', C.rock, 20, 1, 12, { face: 'E' });
  m.add('3040b', C.stone, 20, 1, 13, { face: 'W' });
  m.add('6141', C.moss, 20, 4, 12);
  m.add('54200', C.rock, 21, 4, 13, { face: 'N' });
  m.add('3062b', C.rock, 22, 1, 16);
  m.add('6141', C.moss, 22, 4, 16);
  m.add('6141', C.rock, 19, 1, 16);
  m.add('2412b', C.ground, 20, 1, 10);
  m.add('2412b', C.ground, 20, 1, 15);
  m.add('2412b', C.ground, 22, 1, 11, { rot: 1 });
  m.add('2412b', C.ground, 19, 1, 13, { rot: 1 });
  m.add('2412b', C.ground, 22, 1, 14);
  m.add('2412b', C.ground, 15, 1, 7); // cruza la unión entre placas base
  m.add('2412b', C.ground, 17, 1, 7, { rot: 1 });

  // ----------------------------------------------------------------- bambú
  m.step('Bambú y arbustos');
  for (let k = 0; k < 4; k++) m.add('30176', C.leaf, 21, 1 + 3 * k, 20, { rot: k % 2 ? 0 : 3 });
  for (let k = 0; k < 3; k++) m.add('30176', C.leaf, 22, 1 + 3 * k, 23, { rot: k % 2 ? 3 : 0 });
  for (let k = 0; k < 5; k++) m.add('30176', C.moss, 2, 1 + 3 * k, 21, { rot: k % 2 ? 2 : 1 });
  for (let k = 0; k < 3; k++) m.add('30176', C.leaf, 1, 1 + 3 * k, 18, { rot: k % 2 ? 1 : 2 });
  m.add('32607', C.leaf, 3, 1, 12, { rot: 1 });
  m.add('32607', C.moss, 2, 1, 14, { rot: 2 });
  m.add('32607', C.leaf, 20, 1, 8, { rot: 0 });
  m.add('24866', C.canopy, 3, 1, 15);
  m.add('24866', C.blossom, 1, 1, 12);
}

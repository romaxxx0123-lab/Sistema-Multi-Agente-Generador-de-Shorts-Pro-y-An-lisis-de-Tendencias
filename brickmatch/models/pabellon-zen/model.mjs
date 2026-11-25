// Pabellón Zen: la misma idea del templo, rediseñada para armarse casi
// entera con las piezas del set 10315 "Tranquil Garden" (Icons, 2023).
// Pagoda de dos techos con paneles shoji, torii, estanque con lotos y
// puente de tablones, cerezo en flor, bambú, pinos y linterna de piedra.
//
// Grilla: x 0..24 (oeste→este), z 0..22 (frente→fondo), y en plates.
import { STUD, PLATE } from '../../lib/builder.mjs';

export const meta = {
  title: 'Pabellón Zen',
  prompt: 'Quiero una casa Zen Ninjago, armable con un solo set',
  description: 'Pagoda de dos techos con paneles shoji, torii, estanque con lotos y puente de tablones, cerezo en flor, bambú, pinos y linterna de piedra. Rediseñada con las piezas del set 10315 Tranquil Garden.',
  target: '10315-1',
};

const C = {
  gravel: 'Light Bluish Gray',
  stone: 'Light Bluish Gray',
  rock: 'Dark Bluish Gray',
  lacquer: 'Black',
  wood: 'Reddish Brown',
  post: 'Dark Orange',
  floor: 'Tan',
  mat: 'Medium Nougat',
  paper: 'White',
  roof: 'Dark Brown',
  gold: 'Pearl Gold',
  water: 'Trans-Light Blue',
  moss: 'Green',
  pine: 'Dark Green',
  lime: 'Lime',
  sprout: 'Bright Green',
  blossom: 'Bright Pink',
  bloom: 'Dark Pink',
  sand: 'Dark Tan',
};

export default function build(m, { rect, fill, roofRing, roofCap }) {
  // Coloca una pieza redonda girada en cualquier ángulo sobre un stud.
  const spin = (part, color, x, y, z, degrees) => {
    const box = m.localBox(m.partDef(part));
    const t = (degrees * Math.PI) / 180;
    const M = [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t), 0, 0, 0];
    M[9] = x * STUD + 10;
    M[10] = -y * PLATE - box.max[1];
    M[11] = z * STUD + 10;
    return m.addRaw(part, color, M);
  };

  // ------------------------------------------------------------------ base
  m.step('Base de grava');
  rect('plate', C.gravel, 0, 0, 0, 16, 16);
  rect('plate', C.gravel, 16, 0, 0, 8, 16);
  rect('plate', C.gravel, 0, 0, 16, 12, 6);
  rect('plate', C.gravel, 12, 0, 16, 12, 6);

  // -------------------------------------------------------------- estanque
  m.step('Estanque');
  const pond = { 1: [3, 6], 2: [2, 7], 3: [1, 8], 4: [1, 8], 5: [1, 8], 6: [2, 7], 7: [3, 6] }; // z → [x mín, x máx]
  const pads = [[2, 3], [6, 5]]; // hojas de loto 2x2
  const piers = [[5, 4], [5, 7], [4, 5]]; // apoyos de los tablones dentro del agua
  const taken = new Set(piers.map(([x, z]) => `${x},${z}`));
  for (const [x, z] of pads) for (const dx of [0, 1]) for (const dz of [0, 1]) taken.add(`${x + dx},${z + dz}`);
  const inPond = (x, z) => pond[z] && x >= pond[z][0] && x <= pond[z][1];
  const underPlank = (x, z) => (x === 5 && z <= 7) || (x === 4 && z >= 4);
  const drops = [];
  fill('tile', C.water, 1, 1, 1, 8, 7, {
    sizes: ['1x2'],
    skip: (x, z) => !inPond(x, z) || taken.has(`${x},${z}`),
    single: (x, z) => {
      const p = m.add('3024', C.water, x, 1, z);
      if (!underPlank(x, z)) drops.push(p);
      return p;
    },
  });
  for (const [x, z] of piers) m.add('3024', C.water, x, 1, z);
  for (const [x, z] of pads) m.add('4032a', C.pine, x, 1, z);
  m.add('24866', C.blossom, 2, 2, 3);
  m.add('24866', C.blossom, 7, 2, 6);
  drops.forEach((p, i) => m.onStud(p, 0, i % 2 ? '98138' : '24866', i % 2 ? C.lime : C.blossom));

  m.step('Puente de tablones');
  m.add('3024', C.wood, 5, 1, 0);
  m.add('3024', C.wood, 4, 1, 8);
  m.add('3024', C.wood, 4, 1, 11);
  m.add('4162', C.floor, 5, 2, 0, { rot: 1 });
  m.add('4162', C.floor, 4, 2, 4, { rot: 1 });

  m.step('Orilla y piedras');
  m.add('13548', C.stone, 0, 1, 0, { rot: 2 });
  m.add('54200', C.sand, 2, 1, 1, { face: 'S' });
  m.add('25269', C.rock, 1, 1, 2);
  m.add('98138', C.stone, 0, 1, 3);
  m.add('54200', C.stone, 0, 1, 4, { face: 'W' });
  m.add('25269', C.rock, 1, 1, 6);
  m.add('98138', C.stone, 2, 1, 7);
  m.add('3039', C.sand, 7, 1, 7, { face: 'E' });
  m.add('54200', C.sand, 8, 1, 6, { face: 'E' });
  m.add('25269', C.rock, 8, 1, 2);
  m.add('98138', C.stone, 7, 1, 1);
  m.add('13548', C.stone, 8, 1, 0, { rot: 1 });

  // ----------------------------------------------------- plataforma lacada
  m.step('Plataforma');
  m.add('2357', C.wood, 6, 1, 9, { rot: 0 });
  m.add('2357', C.wood, 16, 1, 9, { rot: 3 });
  m.add('2357', C.wood, 16, 1, 19, { rot: 2 });
  m.add('2357', C.wood, 6, 1, 19, { rot: 1 });
  for (const x of [8, 12]) {
    m.add('30414', C.lacquer, x, 1, 9, { face: 'N' });
    m.add('30414', C.lacquer, x, 1, 20, { face: 'S' });
  }
  for (const z of [11, 15]) {
    m.add('30414', C.lacquer, 6, 1, z, { face: 'E' });
    m.add('30414', C.lacquer, 17, 1, z, { face: 'W' });
  }
  // refuerzos ocultos bajo el piso
  m.add('2456', C.moss, 8, 1, 11);
  m.add('2456', C.moss, 10, 1, 17);
  m.add('2456', C.moss, 8, 1, 13, { rot: 1 });
  m.add('2456', C.moss, 14, 1, 11, { rot: 1 });
  m.add('3002', C.moss, 11, 1, 14);

  m.step('Piso de madera');
  rect('plate', C.wood, 6, 4, 9, 10, 4);
  rect('plate', C.wood, 6, 4, 13, 10, 4);
  rect('plate', C.wood, 6, 4, 17, 6, 2);
  rect('plate', C.wood, 12, 4, 17, 4, 1);
  rect('plate', C.wood, 12, 4, 18, 4, 1);
  rect('plate', C.wood, 6, 4, 19, 10, 2);
  rect('plate', C.wood, 16, 4, 9, 2, 6);
  rect('plate', C.wood, 16, 4, 15, 2, 6);
  for (const z of [10, 13, 15]) m.add('3068b', C.mat, 11, 5, z);

  m.step('Escalera');
  rect('tile', C.wood, 10, 1, 6, 4, 1);
  rect('plate', C.wood, 10, 1, 7, 4, 1);
  rect('tile', C.wood, 10, 2, 7, 4, 1);
  rect('plate', C.wood, 10, 1, 8, 4, 1);
  rect('plate', C.wood, 10, 2, 8, 4, 1);
  rect('tile', C.wood, 10, 3, 8, 4, 1);

  // ------------------------------------------------------------ planta baja
  const shoji = (x, y, z, face) => {
    const f = m.add('60592', C.wood, x, y, z, { face });
    m.addRaw('60601', C.paper, f.matrix, { on: f });
  };

  m.step('Zócalo');
  for (const x of [9, 10, 13, 14]) m.add('3005', C.post, x, 5, 12);
  for (const z of [13, 14, 15, 16]) {
    m.add('3005', C.post, 9, 5, z);
    m.add('3005', C.post, 14, 5, z);
  }
  rect('brick', C.floor, 9, 5, 17, 6, 1);

  m.step('Paneles shoji');
  shoji(9, 8, 12, 'S');
  shoji(13, 8, 12, 'S');
  for (const z of [13, 15]) {
    shoji(9, 8, z, 'W');
    shoji(14, 8, z, 'E');
  }
  for (const x of [9, 11, 13]) shoji(x, 8, 17, 'N');

  m.step('Columnas y barandas');
  for (const [x, z] of [[7, 10], [16, 10], [7, 19], [16, 19], [10, 10], [13, 10]]) m.add('14716', C.post, x, 5, z);
  for (const x of [7, 16]) {
    m.add('32932', C.lacquer, x, 5, 11, { rot: 1 });
    m.add('32932', C.lacquer, x, 5, 15, { rot: 1 });
  }
  m.add('32932', C.lacquer, 8, 5, 19);
  m.add('32932', C.lacquer, 12, 5, 19);

  // ----------------------------------------------------------- techo inferior
  m.step('Cielorraso y alero');
  for (const z of [9, 13, 17]) rect('plate', C.sand, 6, 14, z, 12, 4);

  m.step('Techo inferior');
  roofRing(C.roof, 7, 15, 10, 10, 10);

  m.step('Adornos dorados del alero');
  for (const x of [8, 14]) {
    m.add('2540', C.gold, x, 15, 9, { face: 'S' });
    m.add('2540', C.gold, x, 15, 20, { face: 'N' });
  }
  for (const z of [11, 17]) {
    m.add('2540', C.gold, 6, 15, z, { face: 'W' });
    m.add('2540', C.gold, 17, 15, z, { face: 'E' });
  }
  spin('26047', C.gold, 6, 15, 9, 45);
  spin('26047', C.gold, 17, 15, 9, -45);
  spin('26047', C.gold, 6, 15, 20, 135);
  spin('26047', C.gold, 17, 15, 20, -135);

  // ------------------------------------------------------------ segundo piso
  m.step('Linterna del segundo piso');
  for (const [x, z] of [[10, 13], [12, 13], [10, 15], [12, 15]]) m.add('3003', C.stone, x, 15, z);
  shoji(10, 18, 13, 'S');
  shoji(12, 18, 13, 'S');
  shoji(10, 18, 16, 'N');
  shoji(12, 18, 16, 'N');
  shoji(10, 18, 14, 'W');
  shoji(13, 18, 14, 'E');

  m.step('Alero superior');
  for (const z of [11, 13, 15, 17]) rect('plate', C.floor, 8, 24, z, 8, 2);

  m.step('Techo superior');
  roofCap(C.roof, 9, 25, 12);
  m.add('2540', C.gold, 11, 25, 11, { face: 'S' });
  m.add('2540', C.gold, 11, 25, 18, { face: 'N' });
  m.add('2540', C.gold, 8, 25, 14, { face: 'W' });
  m.add('2540', C.gold, 15, 25, 14, { face: 'E' });
  for (const [x, z] of [[8, 11], [15, 11], [8, 18], [15, 18]]) m.add('20482', C.wood, x, 25, z);

  m.step('Remate dorado');
  m.add('87580', C.gold, 11, 28, 14);
  m.add('85975', C.gold, 11.5, 29, 14.5);
  m.add('85975', C.gold, 11.5, 31, 14.5);
  m.add('15470', C.gold, 11.5, 33, 14.5);

  // ------------------------------------------------------------------ torii
  m.step('Torii');
  for (const x of [10, 13]) {
    m.add('14716', C.post, x, 1, 2);
    m.add('3005', C.post, x, 11, 2);
  }
  rect('plate', C.wood, 8, 10, 2, 8, 1);
  rect('plate', C.wood, 8, 14, 2, 8, 1);
  m.add('54200', C.sand, 8, 15, 2, { face: 'E' });
  m.add('54200', C.sand, 15, 15, 2, { face: 'W' });
  for (const z of [0, 2, 4]) m.add('3068b', C.mat, 11, 1, z);

  // ------------------------------------------------------- linterna de piedra
  m.step('Linterna de piedra');
  m.add('87580', C.sand, 14, 1, 4);
  const core = m.add('4733', C.stone, 14.5, 2, 4.5);
  m.onStud(core, 2, '6141', 'Trans-Clear');
  m.onStud(core, 4, '6141', 'Trans-Clear');
  m.add('4740', C.stone, 14, 5, 4);
  m.add('59900', C.stone, 14.5, 6, 4.5);

  // ---------------------------------------------------------------- cerezo
  m.step('Cantero del cerezo');
  m.add('30357', C.moss, 20, 1, 4, { rot: 0 });
  m.add('30357', C.moss, 20, 1, 1, { rot: 1 });
  m.add('30357', C.moss, 17, 1, 1, { rot: 2 });
  m.add('30357', C.moss, 17, 1, 4, { rot: 3 });

  m.step('Cerezo en flor');
  m.add('18674', C.wood, 19, 2, 3);
  for (const y of [3, 5, 7]) m.add('85975', C.wood, 19.5, y, 3.5);
  const leaves = [];
  [[9, 0], [12, 2], [15, 1], [18, 3]].forEach(([y, rot]) => {
    leaves.push(m.add('2417', C.paper, 19.5, y, 3.5, { rot }));
    m.add('85975', C.wood, 19.5, y + 1, 3.5);
  });
  const pin = m.add('20482', C.wood, 19.5, 21, 3.5);
  m.add('32606', C.bloom, 19.5, 22, 3.5, { on: pin });
  for (const leaf of leaves) {
    for (const i of [0, 2, 4, 6, 9, 11, 13]) m.onStud(leaf, i, '24866', C.blossom);
  }

  // ----------------------------------------------------------------- bambú
  m.step('Cantero del bambú');
  m.add('30357', C.moss, 3, 1, 19, { rot: 0 });
  m.add('30357', C.moss, 3, 1, 16, { rot: 1 });
  m.add('30357', C.moss, 0, 1, 16, { rot: 2 });
  m.add('30357', C.moss, 0, 1, 19, { rot: 3 });

  m.step('Bambú');
  for (let k = 0; k < 4; k++) m.add('30176', C.lime, 1, 2 + 3 * k, 19, { rot: 2 });
  for (let k = 0; k < 3; k++) m.add('30176', C.moss, 3, 2 + 3 * k, 20, { rot: 3 });
  for (let k = 0; k < 3; k++) m.add('30176', C.moss, 3, 2 + 3 * k, 17, { rot: 0 });

  // ----------------------------------------------------------------- pinos
  m.step('Pinos y piedras');
  m.add('28598', C.pine, 20, 1, 18);
  m.add('28598', C.pine, 20, 10, 18);
  m.add('28598', C.pine, 22, 1, 15);
  m.add('68869', C.stone, 19, 1, 9);
  m.add('13548', C.stone, 22, 1, 20, { rot: 3 });
  m.add('33492', C.rock, 19, 1, 15);
  m.add('33492', C.rock, 2, 1, 13);

  m.step('Musgo y plantas');
  rect('plate', C.moss, 0, 1, 8, 2, 3);
  rect('plate', C.moss, 20, 1, 13, 3, 2);
  rect('plate', C.pine, 15, 1, 0, 2, 3);
  m.add('32607', C.lime, 0, 2, 9, { rot: 0 });
  m.add('24866', C.sprout, 1, 2, 10);
  m.add('32607', C.pine, 3, 1, 11, { rot: 1 });
  m.add('32607', C.lime, 21, 2, 14, { rot: 1 });
  m.add('24866', C.blossom, 22, 2, 13);
  m.add('32607', C.lime, 15, 2, 1, { rot: 1 });
  m.add('24866', C.sprout, 16, 2, 2);
  m.add('32607', C.pine, 18, 1, 21, { rot: 3 });
  m.add('24866', C.sprout, 9, 1, 4);
  m.add('24866', C.blossom, 1, 1, 14);
  m.add('24866', C.sprout, 23, 1, 17);
}

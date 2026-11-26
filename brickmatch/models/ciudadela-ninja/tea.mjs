// El ala oeste de la Ciudadela: la casa de té, con techo de paja hecho con los
// paneles curvos del casco del Temple Bounty.
import { compose } from '../../lib/ldraw.mjs';

const C = {
  ground: 'Dark Tan', floor: 'Tan', wood: 'Reddish Brown', dark: 'Dark Brown', wall: 'Dark Red', red: 'Red',
  roof: 'Black', stone: 'Dark Bluish Gray', pale: 'Light Bluish Gray', gold: 'Pearl Gold', log: 'Tan',
};

export const westOrder = ['El ala oeste: casa de té y fuente (piezas del Temple Bounty)', [
  'Casa de té: piedras de apoyo y tarima', 'Casa de té: pared del fondo', 'Casa de té: pared del oeste y puerta a la terraza',
  'Casa de té: frente con mostradores de cajones', 'Casa de té: tarima roja, mesa y almohadones', 'Casa de té: terraza',
  'Casa de té: solera', 'Casa de té: cabriadas del techo', 'Casa de té: techo de paja', 'Casa de té: cumbrera', 'Casa de té: baranda roja',
  'Aljibe: losa, brocal y postes', 'Aljibe: vigas y tabiques', 'Aljibe: techo de paja', 'Senderos del jardín', 'Faroles del jardín',
]];

// Farol de piedra: poste negro, cabeza celeste que hace de luz, platito negro
// de alero y remate dorado.
export function lantern(m, x, y, z, { post = '3062b', postColor = C.roof, top = '59900' } = {}) {
  m.add('6141', C.roof, x, y, z);
  const h = post === '64644' ? 5 : 3;
  // 'platos': tres platos redondos apilados hacen de poste cuando no quedan cilindros
  if (post === 'platos') for (let k = 0; k < 3; k++) m.add('6141', postColor, x, y + 1 + k, z);
  else m.add(post, postColor, x, y + 1, z);
  m.add('28621', 'Light Aqua', x, y + 1 + h, z);
  m.add('4740', C.roof, x - 0.5, y + 4 + h, z - 0.5);
  m.add(top, C.gold, x, y + 5 + h, z);
}

// Aljibe techado: una losa de piedra, el brocal de madera con el agua adentro
// y un techito de paja con los cuatro paneles que quedaban.
// (ox, oz): esquina suroeste de un cuadrado de 8 × 8 studs.
export function well(m, { rect }, ox, oz) {
  const add = (part, color, x, y, z, opts) => m.add(part, color, ox + x, y, oz + z, opts);
  const box = (kind, color, x, y, z, w, d) => rect(kind, color, ox + x, y, oz + z, w, d);

  m.step('Aljibe: losa, brocal y postes', 'El brocal son ocho esquineros en dos capas. Adentro, los platos transparentes son el agua. Los cuatro postes claros van en las esquinas de la losa, con la cara inclinada hacia afuera.');
  box('plate', C.stone, 0, 0, 1, 8, 6);
  // brocal de 4×4 con el hueco de 2×2 al medio
  [[2, 2, 0], [4, 2, 3], [4, 4, 2], [2, 4, 1]].forEach(([x, z, rot], i) => {
    add('2420', C.wood, x, 1, z, { rot, nest: 'brocal' });
    add('2420', i % 2 ? C.wood : C.dark, x, 2, z, { rot });
  });
  // el agua va en el hueco del brocal: cada plato queda en la esquina vacía de un esquinero
  ['Trans-Light Blue', 'Trans-Clear', 'Bright Green', 'Trans-Clear'].forEach((color, i) => add('6141', color, 3 + (i % 2), 1, 3 + (i >> 1), { nest: 'brocal' }));
  for (const x of [0, 7]) {
    add('4460b', C.floor, x, 1, 1, { face: 'S' });
    add('4460b', C.floor, x, 1, 5, { face: 'N' });
    add('3005', C.floor, x, 10, 2);
    add('3005', C.floor, x, 10, 5);
  }

  m.step('Aljibe: vigas y tabiques', 'Dos vigas oscuras de lado a lado, dos travesaños rojos y, sobre cada travesaño, un tabique negro que sostiene el techo.');
  for (const z of [2, 5]) box('plate', C.dark, 0, 13, z, 8, 1);
  for (const x of [0, 7]) {
    box('plate', C.red, x, 14, 2, 1, 4);
    box('brick', C.roof, x, 15, 2, 1, 4);
    box('brick', C.roof, x, 18, 2, 1, 4);
    for (const z of [2, 4]) box('plate', C.roof, x, 21, z, 1, 2);
  }
  add('64799', C.roof, 0, 22, 2);
  add('64799', C.roof, 4, 22, 2);

  m.step('Aljibe: techo de paja', 'Los últimos cuatro paneles curvos del casco, dos de cada lado. Arriba, dos placas claras tapan los huecos y llevan los rollizos.');
  for (const x of [0, 4]) {
    add('18910', C.wood, x, 23, 2);
    add('18910', C.wood, x, 23, 5, { face: 'N' });
    add('64799', C.roof, x, 24, 2);
  }
  for (const x of [1, 5]) {
    box('plate', C.floor, x, 25, 2, 2, 4);
    for (const dx of [0, 1]) add('35480', C.floor, x + dx, 26, 3, { rot: 1 });
  }
  for (const x of [0, 3, 4, 7]) box('tile', C.roof, x, 25, 2, 1, 4);
}

// Tres faroles sueltos entre la casa de té, la fuente y el paso lateral: cada
// uno va parado sobre su piedra.
export function gardenLanterns(m, { rect }, spots) {
  m.step('Faroles del jardín', 'Cada farol va sobre su piedra gris, apoyada en la mesa. Dos llevan un catalejo negro de poste y el tercero, tres platos negros apilados.');
  spots.forEach(([x, z], i) => {
    rect('plate', C.stone, x, 0, z, 2, 2);
    lantern(m, x, 1, z, i < 2 ? { post: '64644', postColor: C.roof, top: '24866' } : { post: 'platos', top: '24866' });
  });
}

// (ox, oz): esquina suroeste de la tarima, de 26 × 8 studs. El frente mira al sur.
export function teaHouse(m, { rect }, ox, oz) {
  const add = (part, color, x, y, z, opts) => m.add(part, color, ox + x, y, oz + z, opts);
  const box = (kind, color, x, y, z, w, d) => rect(kind, color, ox + x, y, oz + z, w, d);

  m.step('Casa de té: piedras de apoyo y tarima', 'Las piedras grises van sobre la mesa, justo debajo de cada junta: son las que mantienen unidas las placas de la tarima.');
  for (const [x, z] of [[0, 1], [24, 1], [0, 6], [24, 6], [9, 1], [15, 1], [9, 6], [15, 6], [11, 0], [21, 0], [4, 4], [12, 4], [20, 4]]) box('plate', C.stone, x, 0, z, 2, 2);
  box('plate', C.wood, 0, 1, 2, 10, 6);
  box('plate', C.wood, 10, 1, 2, 6, 6);
  box('plate', C.wood, 16, 1, 2, 10, 6);
  box('plate', C.wood, 0, 1, 0, 12, 2);
  box('plate', C.wood, 12, 1, 0, 10, 2);
  box('plate', C.wood, 22, 1, 0, 4, 2);

  m.step('Casa de té: pared del fondo', 'Troncos claros, dos ventanas anchas y, arriba, una faja de placas oscuras con las juntas corridas.');
  for (const x of [2, 17]) {
    for (let k = 0; k < 5; k++) add('3005', C.dark, x, 2 + 3 * k, 7);
    add('3005', C.wood, x, 17, 7);
  }
  for (let i = 0; i < 7; i++) add('30136', C.log, 3 + 2 * i, 2, 7);
  for (const y of [5, 8, 11]) for (const x of [3, 9, 15]) add('30136', C.log, x, y, 7);
  for (const x of [5, 11]) add('60594', C.dark, x, 5, 7);
  box('plate', C.dark, 3, 14, 7, 8, 1);
  box('plate', C.wood, 11, 14, 7, 6, 1);
  box('plate', C.wood, 3, 15, 7, 6, 1);
  box('plate', C.dark, 9, 15, 7, 8, 1);
  box('plate', C.dark, 3, 16, 7, 8, 1);
  box('plate', C.wood, 11, 16, 7, 6, 1);
  box('brick', C.wood, 3, 17, 7, 6, 1);
  box('brick', C.wood, 9, 17, 7, 6, 1);
  add('3005', C.wood, 15, 17, 7);
  add('3005', C.wood, 16, 17, 7);

  m.step('Casa de té: pared del oeste y puerta a la terraza', 'La ventana angosta lleva su hoja marrón adentro del marco. Del otro lado, el marco claro es la puerta a la terraza.');
  for (const x of [2, 17]) {
    add('14716', C.wood, x, 2, 2);
    for (const y of [11, 14, 17]) add('3005', C.wood, x, y, 2);
  }
  for (let z = 3; z < 7; z++) add('3005', C.floor, 2, 2, z);
  const win = add('60593', C.dark, 2, 5, 3, { face: 'W' });
  m.addRaw('60602', C.dark, win.matrix, { on: win });
  for (const y of [5, 8, 11]) add('30136', C.log, 2, y, 5, { rot: 1 });
  for (const y of [14, 15, 16]) box('plate', C.dark, 2, y, 3, 1, 4);
  box('brick', C.wood, 2, 17, 3, 1, 4);
  add('60596', C.floor, 17, 2, 3, { rot: 1 });

  m.step('Casa de té: frente con mostradores de cajones', 'Cada escuadra marrón cuelga su cara de cuatro studs hacia la galería: ahí van dos cajones (las tejuelas claras con manija).');
  add('60596', C.dark, 8, 2, 2);
  // núcleo de los mostradores: un zócalo negro y cuatro capas de placas claras
  add('78329', C.roof, 3, 2, 2);
  add('78329', C.roof, 12, 2, 2);
  for (const y of [3, 4]) add('78329', C.floor, 3, y, 2);
  for (const y of [5, 6]) { box('plate', C.floor, 3, y, 2, 4, 1); add('3024', C.floor, 7, y, 2); }
  for (const y of [3, 4, 5, 6]) { add('3024', C.floor, 12, y, 2); box('plate', C.floor, 13, y, 2, 4, 1); }
  add('3024', C.dark, 7, 7, 2);
  add('3024', C.dark, 12, 7, 2);
  for (const x of [3, 5, 13, 15]) {
    const b = add('44728', C.wood, x, 3, 2);
    m.onStud(b, 3, '2432', C.floor, { twist: 0 });
    m.onStud(b, 4, '2432', C.floor, { twist: 0 });
  }
  box('tile', C.dark, 3, 8, 2, 4, 1);
  box('tile', C.dark, 13, 8, 2, 4, 1);
  add('3070b', C.roof, 7, 8, 2);
  add('3070b', C.roof, 12, 8, 2);

  m.step('Casa de té: tarima roja, mesa y almohadones', 'Las dos placas rojas lisas hacen de tarima. La mesa va en el medio, sobre los studs donde se juntan.');
  add('6180', C.wall, 4, 2, 3);
  add('6180', C.wall, 10, 2, 3);
  add('4032a', C.stone, 9, 3, 4);
  box('plate', C.dark, 8, 4, 4, 4, 2);
  m.addRaw('23986', 'White', [1, 0, 0, 0, 1, 0, 0, 0, 1, (ox + 9.5) * 20, -(5 * 8 + 24), (oz + 4.5) * 20]);
  add('38799', 'White', 11, 5, 5);
  add('95228', 'Trans-Clear', 8, 3, 6);
  for (const x of [5, 13]) add('35480', C.floor, x, 3, 6);
  for (const x of [4, 15]) add('35480', C.floor, x, 3, 4, { rot: 1 });

  m.step('Casa de té: terraza', 'Los dos postes negros altos sostienen la punta del techo. Las tablas negras son el piso de la terraza.');
  for (const z of [2, 6]) {
    add('2454b', C.roof, 23, 2, z, { rot: 1 });
    box('brick', C.roof, 23, 17, z, 1, 2);
  }
  for (const z of [3, 4, 5]) add('41740', C.roof, 18, 2, z);
  add('61780', C.wood, 18, 2, 6);
  add('61780', C.wood, 20, 2, 6);

  m.step('Casa de té: solera', 'Dos capas de placas oscuras de 1×8 con las juntas corridas dan toda la vuelta: atan las paredes, los marcos de las puertas y los postes de la terraza.');
  for (const z of [2, 7]) {
    for (const x of [2, 10, 18]) box('plate', C.dark, x, 20, z, 8, 1);
    for (const x of [0, 8, 16]) box('plate', C.dark, x, 21, z, 8, 1);
    box('plate', C.dark, 24, 21, z, 2, 1);
  }
  for (const y of [20, 21]) {
    box('plate', C.wood, 2, y, 3, 1, 4);
    box('plate', C.wood, 17, y, 3, 1, 4);
  }
  box('plate', C.roof, 23, 20, 3, 1, 4);
  box('plate', C.roof, 23, 21, 3, 1, 4);

  m.step('Casa de té: cabriadas del techo', 'Tres tabiques y dos cabriadas sostienen la base del techo. En cada punta, el ladrillo negro con stud al costado lleva la flor dorada.');
  const crests = [];
  for (const [x, face] of [[2, 'W'], [23, 'E']]) {
    for (const z of [3, 5]) box('brick', C.wall, x, 22, z, 1, 2);
    add('3005', C.roof, x, 25, 3);
    crests.push(add('86876', C.roof, x, 25, 4, { face }));
    add('3005', C.roof, x, 25, 6);
    for (const z of [3, 5]) box('plate', C.roof, x, 28, z, 1, 2);
  }
  for (const y of [22, 25]) {
    box('brick', C.roof, 17, y, 3, 1, 3);
    add('3005', C.roof, 17, y, 6);
  }
  for (const z of [3, 5]) box('plate', C.roof, 17, 28, z, 1, 2);
  // Las cabriadas quedan un plate más bajas que los tabiques: por arriba pasa la curva del techo.
  for (const x of [10, 21]) {
    for (const z of [2, 7]) {
      add('3005', C.roof, x, 22, z);
      add('3024', C.dark, x, 25, z);
      add('3024', C.dark, x, 26, z);
    }
    box('plate', C.roof, x, 27, 2, 1, 6);
    for (const z of [3, 5]) box('plate', C.roof, x, 28, z, 1, 2);
  }
  for (const b of crests) m.onStud(b, 2, '24866', C.gold);
  box('plate', C.ground, 1, 29, 3, 12, 4);
  box('plate', C.ground, 13, 29, 3, 10, 4);
  box('plate', C.ground, 23, 29, 3, 2, 4);

  m.step('Casa de té: techo de paja', 'Son los doce paneles curvos del casco del barco: cada uno encastra por los dos studs del medio de su barra y cuelga hacia afuera. Seis miran al frente y seis al fondo.');
  for (let i = 0; i < 6; i++) {
    add('18910', C.wood, 1 + 4 * i, 30, 3);
    add('18910', C.wood, 1 + 4 * i, 30, 6, { face: 'N' });
  }

  m.step('Casa de té: cumbrera', 'Cinco placas anchas atan las barras de los paneles. Arriba, tejuelas negras a los costados y, al medio, los rollizos claros con flores doradas entre uno y otro.');
  box('plate', C.roof, 1, 31, 3, 6, 4);
  box('plate', C.wall, 7, 31, 3, 4, 4);
  box('plate', C.wood, 11, 31, 3, 4, 4);
  box('plate', C.wall, 15, 31, 3, 4, 4);
  box('plate', C.roof, 19, 31, 3, 6, 4);
  let x = 1;
  for (const len of [8, 6, 6, 4]) { box('tile', C.roof, x, 32, 3, len, 1); x += len; }
  x = 1;
  for (const len of [8, 6, 4, 4, 2]) { box('tile', C.roof, x, 32, 6, len, 1); x += len; }
  for (let cx = 1; cx < 25; cx++) {
    if (cx % 4 === 2) {
      add('35480', C.floor, cx, 32, 4, { rot: 1 });
      add('35480', C.floor, cx, 33, 4, { rot: 1 });
    } else {
      const j = add('15573', C.roof, cx, 32, 4, { rot: 1 });
      if (cx % 4 === 0 && cx < 24) m.onStud(j, 0, '24866', C.gold);
    }
  }

  m.step('Casa de té: baranda roja', 'Cada poste son tres platos negros apilados; el pasamanos rojo va de poste a poste.');
  // Solo en la terraza: delante de los mostradores hace falta lugar para abrir los cajones.
  for (const px of [18, 23]) for (const y of [2, 3, 4]) add('6141', C.roof, px, y, 0);
  box('plate', C.red, 18, 5, 0, 6, 1);
  for (const pz of [1, 6]) for (const y of [2, 3, 4]) add('6141', C.roof, 25, y, pz);
  box('plate', C.red, 25, 5, 1, 1, 6);
}

// Dos tramos de sendero con piedras para pisar: del paso lateral al aljibe y
// del aljibe a la terraza de la casa de té. Van apoyados en la mesa.
export function gardenPaths(m, { rect }) {
  m.step('Senderos del jardín', 'Las piedras redondeadas van encastradas sobre las placas del sendero, salteadas.');
  rect('plate', C.floor, -10, 0, -5, 4, 2);
  rect('plate', C.floor, -6, 0, -5, 4, 2);
  m.add('35480', C.roof, -7, 1, -5); // esta piedra une los dos tramos
  for (const [x, z] of [[-10, -4], [-4, -4]]) m.add('35480', C.roof, x, 1, z);
  rect('plate', C.stone, -18, 0, -18, 6, 6);
  for (const [x, z, rot] of [[-16, -17, 1], [-15, -15, 0], [-17, -14, 1]]) m.add('35480', C.roof, x, 1, z, { rot });
}


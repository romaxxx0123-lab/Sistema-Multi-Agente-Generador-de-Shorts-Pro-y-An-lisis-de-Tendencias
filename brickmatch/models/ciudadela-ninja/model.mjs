// Ciudadela Ninja: la Base de Operaciones ampliada con las piezas del set
// 71848 The Temple Bounty. Usa dos cajas: 70751 Temple of Airjitzu (la base) y
// 71848 (la ampliación). El frente pasa a ser una muralla de troncos con un
// portón techado; los costados del patio se cierran con portones de empalizada.
import fortress, { buildOrder as baseOrder } from '../fortaleza-ninja/model.mjs';
import { compose } from '../../lib/ldraw.mjs';
import { rotY } from '../../lib/builder.mjs';
import { teaHouse, well, gardenPaths, gardenLanterns, lantern, westOrder } from './tea.mjs';

// ARCHIVADA: se decidió dejar el Temple Bounty armado, así que esta variante no
// se arma y no aparece en la mini app (meta.archived). El código, los renders y
// las instrucciones se conservan por si se retoma.
export const meta = {
  archived: true,
  order: 5,
  title: 'Ciudadela Ninja',
  prompt: 'Sumarle a la Base de Operaciones todo lo que se pueda con las piezas del Temple Bounty, siempre que la haga ver mejor',
  description: 'La Base de Operaciones Ninja ampliada con las piezas del set 71848 The Temple Bounty. El frente pasa a ser una muralla revocada con ventanas de celosía dorada y crestería, y un portón de templo: postes de troncos, ménsulas y un techo de veinte tejas curvas con cumbrera de lingotes dorados. Se suman la explanada y la avenida con ocho faroles celestes, diez katanas doradas en la muralla y dos pasos laterales con arco. Por el paso del oeste se sale a un ala nueva: la casa de té, con techo de paja hecho con los paneles curvos del casco del barco, mostradores de cajones y terraza, un aljibe techado y un jardín con senderos y faroles. Se arma con dos cajas: 70751 Temple of Airjitzu (la base) y 71848 The Temple Bounty (la ampliación).',
  donors: ['70751-1', '71848-1'],
};

const C = {
  ground: 'Dark Tan', floor: 'Tan', wood: 'Reddish Brown', dark: 'Dark Brown', wall: 'Dark Red', red: 'Red',
  roof: 'Black', stone: 'Dark Bluish Gray', pale: 'Light Bluish Gray', gold: 'Pearl Gold', log: 'Tan',
};

const SKIP = /^Muro del frente|^Portón: pilares|^Bastones en el muro|muro que cierra el patio$/;
export const buildOrder = [
  // En la ampliación, el muro del frente de la base ya no está: esa parte son solo las torres.
  ...baseOrder.map(([part, list]) => [part === 'El muro del frente y las torres' ? 'Las torres del frente' : part, list.filter((t) => !SKIP.test(t))]),
  ['La muralla y el portón (piezas del Temple Bounty)', [
    'Muralla de troncos: primera hilada', 'Muralla de troncos: paño y albardilla', 'Muralla de troncos: crestería de celosías',
    'Portón: postes de troncos', 'Portón: viga y ménsulas', 'Portón: brazos y aleros', 'Portón: lomo del techo',
    'Portón: tejas', 'Portón: cumbrera dorada', 'Katanas doradas en la muralla',
  ]],
  ['La avenida, los faroles y los pasos laterales', [
    'Explanada y umbral del portón', 'Avenida del portón al torii', 'Faroles de la avenida', 'Faroles de la explanada',
    'Pasos laterales: postes', 'Pasos laterales: dintel y arco',
  ]],
  westOrder,
];

// ================================================================== muralla
// Dos paños de 12 studs, uno a cada lado del portón. Troncos claros trabados
// con ladrillos oscuros en las puntas (parece un muro revocado con entramado
// de madera) y albardilla negra con lingotes.
export function frontWalls(m, { rect }, FZ) {
  m.step('Muralla de troncos: primera hilada', 'Los dos paños van sobre la mesa, uno a cada lado del portón. La placa de madera de cada torre los une a su zócalo.');
  m.add('91988', C.stone, 0, 0, FZ);
  m.add('3020', C.stone, 34, 0, FZ);
  m.add('3832', C.stone, 38, 0, FZ);
  for (const x0 of [0, 36]) for (let i = 0; i < 6; i++) m.add('30136', C.log, x0 + 2 * i, 1, FZ);
  // hilada de placas: traba la primera hilada y une el paño con el poste del portón
  rect('plate', C.dark, 2, 4, FZ, 8, 1);
  rect('plate', C.wood, 10, 4, FZ, 4, 2);
  rect('plate', C.wood, 34, 4, FZ, 4, 2);
  rect('plate', C.dark, 38, 4, FZ, 8, 1);

  m.step('Muralla de troncos: paño y albardilla', 'Sobre la segunda hilada van las cuatro ventanas de cada paño, con la celosía dorada mirando hacia afuera. La placa negra larga cierra todo por arriba.');
  for (const x0 of [0, 36]) {
    m.add('3005', C.dark, x0, 5, FZ);
    for (let i = 0; i < 5; i++) m.add('30136', C.log, x0 + 1 + 2 * i, 5, FZ);
    m.add('3005', C.dark, x0 + 11, 5, FZ);
    // arriba, una franja de cuatro ventanas con celosía dorada entre dos machones
    for (const x of [x0, x0 + 10]) m.add('30136', C.log, x, 8, FZ);
    m.add('3005', C.dark, x0, 11, FZ);
    m.add('3005', C.floor, x0 + 1, 11, FZ);
    m.add('3005', C.floor, x0 + 10, 11, FZ);
    m.add('3005', C.dark, x0 + 11, 11, FZ);
    for (let i = 0; i < 4; i++) {
      const f = m.add('60592', C.dark, x0 + 2 + 2 * i, 8, FZ, { face: 'S' });
      m.addRaw('38320', C.gold, f.matrix, { on: f });
    }
    rect('plate', C.roof, x0, 14, FZ, 12, 2);
  }

  m.step('Muralla de troncos: crestería de celosías', 'Tres rejas por paño, con la dorada al medio. La placa larga de arriba las une.');
  for (const x0 of [0, 36]) {
    ['Black', C.gold, 'Black'].forEach((color, i) => m.add('32932', color, x0 + 4 * i, 15, FZ));
    for (let i = 0; i < 3; i++) m.add('41740', C.roof, x0 + 4 * i, 15, FZ + 1);
    rect('plate', C.roof, x0, 21, FZ, 12, 1);
    for (let i = 0; i < 3; i++) rect('tile', C.roof, x0 + 4 * i, 22, FZ, 4, 1);
  }
}

// =================================================================== portón
// Dos postes de troncos, viga con ménsulas y un techo de templo: las tejas
// curvas del Bounty van dadas vuelta, abrochadas por su barra al alero, y suben
// hasta la cumbrera dorada. Por abajo pasa el buggy (20 studs × 36 plates).
export function gate(m, { rect }, FZ) {
  const posts = [12, 34];
  const logs = (x, y, color, alongX) => {
    if (alongX) for (const dz of [0, 1]) m.add('30136', color, x, y, FZ + dz);
    else for (const dx of [0, 1]) m.add('30136', color, x + dx, y, FZ, { rot: 1 });
  };

  m.step('Portón: postes de troncos', 'Cada poste es de 2×2: dos troncos por hilada, cruzados respecto de la hilada de abajo.');
  for (const x of posts) {
    logs(x, 1, C.roof, true);
    logs(x, 5, C.roof, false);
    for (let k = 0; k < 8; k++) logs(x, 8 + 3 * k, C.dark, k % 2 === 0);
    logs(x, 32, C.wood, true);
    rect('plate', C.wood, x, 35, FZ - 1, 2, 4);
  }

  m.step('Portón: viga y ménsulas', 'La viga son tres capas de placas con las juntas corridas. Las ocho ménsulas negras van paradas en la placa que asoma del poste.');
  for (const x of [12, 20, 28]) rect('plate', C.wood, x, 36, FZ, 8, 2);
  rect('plate', C.wood, 12, 37, FZ, 10, 2);
  m.add('91988', C.wood, 22, 37, FZ);
  rect('plate', C.wood, 12, 38, FZ, 8, 2);
  rect('plate', C.wood, 20, 38, FZ, 8, 2);
  rect('plate', C.wood, 28, 38, FZ, 4, 2);
  rect('plate', C.wood, 32, 38, FZ, 4, 2);
  for (const x of [12, 13, 34, 35]) {
    m.add('4287c', C.roof, x, 36, FZ - 3, { face: 'S' });
    m.add('4287c', C.roof, x, 36, FZ + 2, { face: 'N' });
  }

  m.step('Portón: brazos y aleros', 'Cada brazo son dos placas de 2×16 apiladas, apoyadas en la viga y en las ménsulas. En las puntas van los aleros: dos capas de placas angostas con las juntas corridas.');
  for (const x of posts) {
    for (const y of [39, 40]) rect('plate', C.wood, x, y, FZ - 7, 2, 16);
    rect('tile', C.wood, x, 41, FZ - 6, 2, 4);
    rect('tile', C.wood, x, 41, FZ + 4, 2, 4);
    for (const dx of [0, 1]) for (const z of [FZ - 2, FZ + 2]) rect('tile', C.wood, x + dx, 41, z, 1, 2);
  }
  // Cada alero son dos capas de placas con las juntas corridas: así cruza los
  // 20 studs entre brazo y brazo sin partirse al medio.
  for (const [z, top] of [[FZ - 7, [8, 8, 8]], [FZ + 8, [10, 6, 8]]]) {
    rect('plate', C.roof, 12, 41, z, 12, 1);
    rect('plate', C.roof, 24, 41, z, 12, 1);
    let x = 12;
    for (const len of top) { rect('plate', C.roof, x, 42, z, len, 1); x += len; }
    m.add('99563', C.gold, 12, 43, z);
    m.add('99563', C.gold, 34, 43, z);
  }

  m.step('Portón: lomo del techo', 'Es la pared que queda escondida bajo las tejas: contra ella descansan las puntas.');
  for (const dz of [0, 1]) for (let i = 0; i < 10; i++) m.add('30136', C.log, 14 + 2 * i, 39, FZ + dz);
  rect('brick', C.roof, 14, 42, FZ, 12, 1);
  rect('brick', C.roof, 26, 42, FZ, 8, 1);
  rect('brick', C.roof, 14, 42, FZ + 1, 8, 1);
  rect('brick', C.roof, 22, 42, FZ + 1, 12, 1);
  rect('brick', C.roof, 14, 45, FZ, 10, 2);
  rect('brick', C.roof, 24, 45, FZ, 6, 2);
  rect('brick', C.roof, 30, 45, FZ, 4, 2);
  rect('plate', C.roof, 14, 48, FZ, 12, 2);
  rect('plate', C.roof, 26, 48, FZ, 8, 2);
  for (const x of [14, 20, 26]) rect('plate', C.roof, x, 49, FZ, 6, 2);
  rect('plate', C.roof, 32, 49, FZ, 2, 2);
  // los postes siguen por arriba de los brazos y cierran las puntas del techo
  for (const x of posts) {
    rect('brick', C.wood, x, 41, FZ, 2, 2);
    for (const dx of [0, 1]) for (const dz of [0, 1]) m.add('3005', C.dark, x + dx, 44, FZ + dz);
    rect('plate', C.dark, x, 47, FZ, 2, 2);
    rect('plate', C.dark, x, 48, FZ, 2, 2);
    for (const dz of [0, 1]) rect('plate', C.dark, x, 49, FZ + dz, 2, 1);
  }

  m.step('Portón: tejas', 'Cada teja va dada vuelta, con la canaleta para arriba: su barra se abrocha al alero y la punta descansa contra el lomo. Diez miran al frente y diez al patio. Un lingote negro tapa cada abrochadura.');
  // La barra queda a 1 stud del alero, del lado de la cumbrera.
  const FLIP = (tx) => [-1, 0, 0, 0, -1, 0, 0, 0, 1, tx, 2, -20];
  const END = (tz) => [0, 0, -1, 0, -1, 0, -1, 0, 0, 30, 2, tz];
  const tile = (i, face, kind, color) => {
    const x = 14 + 2 * i, z = face === 'N' ? FZ - 7 : FZ + 8, side = face === 'S' ? 10 : -10;
    if (kind === 'double') {
      const a = m.add('60470b', color, x, 43, z, { face });
      m.addRaw('92474', C.roof, compose(a.matrix, FLIP(0)), { on: a });
      m.add('99563', C.roof, x, 44, z);
      return;
    }
    // Dos clips sueltos lado a lado hacen lo mismo que la placa de doble clip.
    const part = kind === 'pair' ? '61252' : '63868';
    const a = m.add(part, color, x, 43, z, { face });
    const b = m.add(part, color, x + 1, 43, z, { face });
    const w = m.addRaw('92474', C.roof, compose(a.matrix, kind === 'pair' ? FLIP(side) : END(side)), { on: a });
    m.attach(w, b);
    // un lingote negro tapa los studs del alero
    if (kind === 'pair') m.add('99563', C.roof, x, 44, z);
    else for (const dx of [0, 1]) m.add('99563', C.roof, x + dx, 44, z, { rot: 1 });
  };
  for (let i = 0; i < 10; i++) {
    tile(i, 'N', i === 0 || i === 9 ? 'pair' : 'double', 'Black');
    if (i < 2 || i > 7) tile(i, 'S', 'end', 'Black');
    else if (i === 4) tile(i, 'S', 'pair', C.dark);
    else tile(i, 'S', 'double', C.stone);
  }

  m.step('Portón: cumbrera dorada', 'Dos tiras de placas negras tapan las puntas de las tejas. Arriba, la fila de lingotes dorados y un rulo dorado en cada punta.');
  m.add('91988', C.roof, 12, 50, FZ - 1);
  rect('plate', C.roof, 26, 50, FZ - 1, 10, 2);
  rect('plate', C.roof, 12, 50, FZ + 1, 6, 2);
  rect('plate', C.roof, 18, 50, FZ + 1, 4, 2);
  m.add('91988', C.roof, 22, 50, FZ + 1);
  for (let i = 0; i < 4; i++) {
    rect('tile', C.roof, 12 + 6 * i, 51, FZ - 1, 6, 1);
    rect('tile', C.roof, 12 + 6 * i, 51, FZ + 2, 6, 1);
  }
  for (let i = 0; i < 10; i++) for (const dz of [0, 1]) m.add('99563', C.gold, 14 + 2 * i, 51, FZ + dz);
  for (const [x, k] of [[12, 1], [34, 3]]) {
    m.add('18674', C.roof, x, 51, FZ);
    const base = m.add('3062b', C.roof, x + 0.5, 52, FZ + 0.5);
    // el rulo entra por su barra en el stud hueco y se abre hacia afuera
    m.addRaw('28870', C.gold, [...rotY(k).slice(0, 9), (x + 1) * 20, -(55 * 8 + 4), (FZ + 1) * 20], { on: base });
  }
}

// ================================================================== katanas
// Las diez katanas doradas del Bounty, paradas del lado de adentro de la
// muralla del este: el mango entra en un clip de la zapata y el pomo apoya en
// la mesa. (Del lado oeste estaciona el buggy.)
export function wallRacks(m, FZ) {
  m.step('Katanas doradas en la muralla', 'Diez clips en fila sobre la zapata del muro del este. Cada katana entra a presión por el mango y apoya el pomo en la mesa.');
  ['Blue', 'Tan', 'Black', 'Light Bluish Gray', 'Blue', 'Blue', 'Light Bluish Gray', 'Black', 'Tan', 'Blue'].forEach((color, i) => {
    const x = 37 + i;
    const clip = m.add('60897', color, x, 1, FZ + 1, { face: 'N' });
    m.addRaw('21459', C.gold, [1, 0, 0, 0, 1, 0, 0, 0, 1, (x + 0.5) * 20, -16, (FZ + 2.5) * 20], { on: clip });
  });
}

// ========================================================= avenida y faroles
export function avenue(m, { rect }, FZ) {
  m.step('Explanada y umbral del portón', 'Las cinco tejuelas negras largas unen la explanada de afuera con el umbral que queda entre los postes.');
  rect('plate', C.ground, 14, 0, FZ - 4, 10, 4);
  rect('plate', C.ground, 24, 0, FZ - 4, 10, 4);
  rect('plate', C.ground, 14, 0, FZ, 4, 2);
  rect('plate', C.ground, 18, 0, FZ, 8, 2);
  rect('plate', C.ground, 26, 0, FZ, 6, 2);
  rect('plate', C.stone, 32, 0, FZ, 2, 2);
  for (const x of [14, 18, 23, 28, 32]) m.add('87079', C.roof, x, 1, FZ - 2, { rot: 1 });

  m.step('Avenida del portón al torii', 'Dos franjas de piso, una a cada lado del sendero. Las placas angostas de arriba unen los tramos de cada franja.');
  let z = FZ + 2;
  for (const len of [10, 6, 6, 4]) { rect('plate', C.ground, 21, 0, z, 2, len); z += len; }
  for (const j of [-18, -12, -6]) rect('plate', C.ground, 22, 1, j - 2, 1, 4);
  z = FZ + 2;
  for (const len of [12, 6, 4, 4]) { rect('plate', C.ground, 25, 0, z, 2, len); z += len; }
  for (const j of [-16, -10]) rect('plate', C.ground, 25, 1, j - 2, 1, 4);
  rect('plate', C.ground, 25, 1, -7, 1, 2);

  m.step('Faroles de la avenida', 'Seis faroles iguales: plato redondo, cilindro negro, cabeza celeste, platito negro y cono dorado.');
  for (const zz of [-24, -15, -6]) {
    lantern(m, 21, 1, zz);
    lantern(m, 26, 1, zz);
  }

  m.step('Faroles de la explanada', 'Estos dos llevan un catalejo dorado de poste y una flor dorada de remate.');
  for (const x of [14, 33]) lantern(m, x, 1, FZ - 4, { post: '64644', postColor: C.gold, top: '24866' });
}

// ======================================================= portones laterales
// Entre cada galería y el edificio queda un paso de 4 studs. Lo enmarcan un
// poste, un pilar parado en la esquina del patio y un arco negro de techito.
export function sideGates(m, { rect }, G) {
  const gates = [[48, 47], [-1, 0]]; // x del poste (línea del muro) y x del pilar que va sobre el patio
  m.step('Pasos laterales: postes', 'El poste va sobre el umbral que sale de la galería; el pilar, parado en la esquina del patio.');
  for (const [x, px] of gates) {
    rect('plate', C.roof, x, 0, -7, 1, 4); // apoya en la mesa el umbral que sale de la galería
    for (let k = 0; k < 3; k++) m.add('14716', C.dark, x, 2 + 9 * k, -7);
    for (let k = 0; k < 9; k++) m.add('3005', C.dark, px, G + 3 * k, -2);
    m.add('6141', C.stone, px, G + 27, -2);
  }

  m.step('Pasos laterales: dintel y arco', 'El arco negro apoya solo sus dos puntas: una en cada placa del dintel. Arriba van dos tejuelas con el dragón.');
  gates.forEach((g) => {
    const lx = Math.min(...g);
    rect('plate', C.wood, lx, 29, -9, 2, 6);
    rect('plate', C.wood, lx, 29, -3, 2, 2);
    const arch = m.add('11290', C.roof, lx, 30, -9, { rot: 1 });
    for (const dz of [-10, 10]) m.addRaw('dragon', C.wall, compose(arch.matrix, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, -8, dz]));
  });
}

export default function build(m, helpers) {
  const { figs, FZ, G } = fortress(m, helpers, { bounty: true });
  frontWalls(m, helpers, FZ);
  gate(m, helpers, FZ);
  wallRacks(m, FZ);
  avenue(m, helpers, FZ);
  sideGates(m, helpers, G);
  // El ala oeste, afuera de la galería del taller: se llega por el paso lateral.
  teaHouse(m, helpers, -36, -26);
  well(m, helpers, -18, -13);
  gardenPaths(m, helpers);
  gardenLanterns(m, helpers, [[-6, -2], [-9, -22], [-23, -9]]);
  // Tres figuras del patio se corren: donde estaban ahora hay avenida o explanada.
  const moved = { '26,0,-4': [28, 0, -5], '26,0,-24': [28, 0, -24], '26,0,-34': [24, 1, -33] };
  for (const [x, y, z, face, color, hat, hatColor] of figs) {
    const [fx, fy, fz] = moved[`${x},${y},${z}`] || [x, y, z];
    m.fig(fx, fy, fz, { face, color, hat, hatColor });
  }
  // Tres más en el ala oeste: un cliente frente al mostrador, otro en la puerta de la casa de té y uno junto al aljibe.
  m.fig(-29, 0, -29, { face: 'N', color: 'Dark Blue', hat: '3901', hatColor: 'Black' });
  m.fig(-26, 2, -26, { face: 'S', color: 'Dark Red', hat: '93059', hatColor: 'Tan' });
  m.fig(-22, 0, -6, { face: 'E', color: 'Green', hat: '3901', hatColor: 'Dark Brown' });
}

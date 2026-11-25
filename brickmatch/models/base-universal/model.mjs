// Base universal Ninjago: monasterio-fortaleza para unas 30 minifiguras.
// Diseñada solo con piezas del set 70751 Temple of Airjitzu.
export const meta = {
  order: 3,
  title: 'Base Universal Ninja',
  prompt: 'Una base de operaciones más grande, con un set barato (aunque no sea original), donde entren mis 30 minifiguras y puedan hacer de todo',
  description: 'Monasterio-fortaleza de 48 × 32 studs en tres niveles: salón del maestro, taller con fragua, vivienda con cucheta y cocina, puesto de mando bajo una pagoda de dos techos, pista de aterrizaje, pabellón de té, torre de vigía, tarima y ring de entrenamiento, y jardín con estanque y puente. Diseñada solo con piezas del set 70751 Temple of Airjitzu; las minifiguras son de prueba, para ver dónde entran las tuyas.',
  target: '70751-1',
};

const C = {
  ground: 'Dark Tan', floor: 'Tan', wood: 'Reddish Brown', dark: 'Dark Brown', wall: 'Dark Red', red: 'Red',
  roof: 'Black', stone: 'Dark Bluish Gray', pale: 'Light Bluish Gray', blue: 'Medium Blue', green: 'Sand Green',
  gold: 'Pearl Gold', paper: 'Trans-Clear', water: 'Medium Azure',
};
const G = 1; // nivel del patio (arriba de las placas del suelo)
const U = 20; // nivel de la planta alta

// Torre de vigía: fuste de n ladrillos 2x2 y plataforma techada de 6x6.
// (x, z) = esquina mínima de la plataforma; y = base del fuste.
export function watchtower(m, { rect }, x, y, z, n) {
  for (let i = 0; i < n; i++) m.add('90258', C.stone, x + 2, y + 3 * i, z + 2);
  const P = y + 3 * n;
  m.add('3660', C.dark, x + 2, P - 3, z, { face: 'S' });
  m.add('3660', C.dark, x + 2, P - 3, z + 4, { face: 'N' });
  m.add('3660', C.red, x, P - 3, z + 2, { face: 'W' });
  m.add('3660', C.red, x + 4, P - 3, z + 2, { face: 'E' });
  rect('plate', C.roof, x, P, z, 6, 6);
  for (const [dx, dz] of [[0, 0], [5, 0], [0, 5], [5, 5]]) m.add('3062b', C.red, x + dx, P + 1, z + dz);
  rect('plate', C.red, x, P + 4, z, 1, 6);
  rect('plate', C.red, x + 5, P + 4, z, 1, 6);
  rect('plate', C.red, x, P + 5, z, 6, 1);
  rect('plate', C.red, x, P + 5, z + 5, 6, 1);
  m.add('2454b', C.floor, x + 1, P + 1, z + 3, { rot: 1 });
  m.add('2454b', C.floor, x + 4, P + 1, z + 3, { rot: 1 });
  rect('plate', C.roof, x, P + 16, z, 6, 6);
  m.add('30503', C.roof, x - 1, P + 17, z - 1, { rot: 1 });
  m.add('30503', C.roof, x + 3, P + 17, z - 1, { rot: 0 });
  m.add('30503', C.roof, x - 1, P + 17, z + 3, { rot: 2 });
  m.add('30503', C.roof, x + 3, P + 17, z + 3, { rot: 3 });
  return P;
}

// opts.fortress: la Fortaleza Ninja reutiliza esta base y cambia algunas cosas.
export default function build(m, { rect, row, fill }, opts = {}) {
  const F = !!opts.fortress;
  // Ventana corrediza con su papel.
  const win = (color, x, y, z, face = 'S') => {
    const f = m.add('60592', color, x, y, z, { face });
    m.addRaw('shoji', C.paper, f.matrix, { on: f });
    return f;
  };
  // Columna de n piezas iguales apiladas.
  const stack = (part, color, x, y, z, n, h, opts = {}) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(m.add(part, color, x, y + i * h, z, opts));
    return out;
  };
  // Arco 1x12x3 sobre dos postes, con los hombros rellenos hasta arriba.
  const portal = (x, y, z, posts, shoulder) => {
    posts[0](x, y, z);
    posts[1](x + 11, y, z);
    const nest = `portal${x}`;
    m.add('14707', C.wood, x, y + 9, z, { nest });
    for (const [dx, n] of [[0, 2], [1, 1], [10, 1], [11, 2]]) shoulder(x + dx, y + 18 - 3 * n, z, n, { nest });
  };
  const post = (x, y, z) => m.add('14716', C.dark, x, y, z);

  // --------------------------------------------------- suelo y planta baja
  m.step('Suelo del patio');
  for (const z of [0, 16]) for (const x of [0, 16, 32]) rect('plate', C.ground, x, 0, z, 16, 16);

  m.step('Salón del maestro: muro de fondo');
  fill('brick', C.wall, 16, G, 31, 16, 1, { sizes: ['1x4'] });
  for (const y of [G + 3, G + 9]) {
    for (const x of [16, 22, 24, 30]) stack('3004', C.wall, x, y, 31, 2, 3);
    for (const x of [18, 20, 26, 28]) win(C.red, x, y, 31);
  }
  rect('brick', C.wall, 16, G + 15, 31, 6, 1);
  rect('brick', C.wall, 22, G + 15, 31, 4, 1);
  rect('brick', C.wall, 26, G + 15, 31, 6, 1);

  m.step('Salón del maestro: columnas y portal');
  stack('92947', C.dark, 16, G, 16, 6, 3);
  stack('92947', C.dark, 30, G, 16, 6, 3);
  portal(18, G, 17, [post, post], (x, y, z, n, o) => stack('3005', C.wall, x, y, z, n, 3, o));

  m.step('Taller: muros y portal');
  rect('brick', C.stone, 0, G, 31, 10, 1);
  rect('brick', C.stone, 10, G, 31, 6, 1);
  row('98283', C.pale, 0, G + 3, 31, 8);
  for (const [i, y] of [[0, G + 6], [1, G + 9]]) {
    rect('brick', C.stone, 0, y, 31, 3, 1);
    rect('brick', C.stone, 13, y, 31, 3, 1);
    for (const x of [5, 9]) m.add('98283', i ? C.pale : C.stone, x, y, 31);
  }
  for (const x of [3, 7, 11]) m.add('60592', C.wood, x, G + 6, 31, { face: 'S' });
  rect('brick', C.stone, 0, G + 12, 31, 8, 1);
  rect('brick', C.stone, 8, G + 12, 31, 6, 1);
  rect('brick', C.stone, 14, G + 12, 31, 2, 1);
  row('30414', C.stone, 0, G + 15, 31, 4, { face: 'S' });
  stack('2357', C.stone, 0, G, 22, 6, 3, { rot: 3 });
  stack('92947', C.dark, 14, G, 22, 6, 3);
  portal(2, G, 22, [post, post], (x, y, z, n, o) => stack('4070', C.wood, x, y, z, n, 3, { face: 'S', ...o }));

  m.step('Vivienda: muros y portal');
  fill('brick', C.blue, 32, G, 31, 16, 1, { sizes: ['1x4'] });
  for (const y of [G + 3, G + 9]) {
    for (const x of [32, 38, 40, 46]) stack('3004', C.blue, x, y, 31, 2, 3);
  }
  for (const x of [34, 36, 42, 44]) win(C.red, x, G + 3, 31);
  for (const x of [34, 36, 42, 44]) stack('3245c', C.red, x, G + 9, 31, 1, 6);
  fill('brick', C.blue, 32, G + 15, 31, 16, 1, { sizes: ['1x4'] });
  stack('2357', C.blue, 46, G, 22, 6, 3, { rot: 0 });
  stack('92947', C.dark, 32, G, 22, 6, 3);
  portal(34, G, 22, [post, (x, y, z) => stack('3062b', C.dark, x, y, z, 3, 3)], (x, y, z, n, o) => stack('3005', C.blue, x, y, z, n, 3, o));

  // --------------------------------------------- interiores de planta baja
  m.step('Salón del maestro: círculo de reunión');
  m.add('89523', C.floor, 19, G, 19);
  if (!F) {
    m.add('92947', C.dark, 23, G + 1, 23);
    m.add('60474', C.roof, 22, G + 4, 22);
    m.add('2450', C.wall, 22, G + 1, 19, { rot: 0 });
    m.add('2450', C.wall, 23, G + 1, 26, { rot: 2 });
    m.add('2450', C.wall, 19, G + 1, 23, { rot: 1 });
    m.add('2450', C.wall, 26, G + 1, 22, { rot: 3 });
  }
  const chest = m.add('4738b', C.wood, 17, G, 29);
  m.add('4739a', C.wood, 17, G + 4, 29, { on: chest });

  m.step('Taller');
  m.add('3003', C.stone, 3, G, 29);
  m.add('3003', C.stone, 9, G, 29);
  rect('plate', C.dark, 3, G + 3, 29, 8, 1);
  rect('plate', C.dark, 3, G + 3, 30, 8, 1);
  rect('tile', 'Sand Blue', 5, G + 4, 29, 4, 2);
  m.add('30150', C.wood, 0, G, 25, { rot: 1 });
  m.add('2489', C.dark, 12, G, 29);

  m.step('Vivienda: cucheta, cocina y mesa');
  rect('plate', C.dark, 44, G, 24, 2, 6);
  rect('tile', 'Sand Blue', 44, G + 1, 25, 2, 4);
  for (const [x, z] of [[44, 24], [45, 24], [44, 29], [45, 29]]) stack('3062b', C.floor, x, G + 1, z, 3, 3);
  rect('plate', C.dark, 44, G + 10, 24, 2, 6);
  rect('tile', 'Sand Blue', 44, G + 11, 25, 2, 4);
  rect('tile', 'White', 44, G + 11, 24, 2, 1);
  rect('brick', C.green, 33, G, 29, 4, 2);
  rect('brick', C.green, 37, G, 29, 4, 2);
  rect('tile', C.roof, 33, G + 3, 29, 4, 2);
  m.add('87580', C.stone, 37, G + 3, 29);
  m.add('87580', C.stone, 39, G + 3, 29);
  m.add('92947', C.dark, 37, G, 25);
  rect('plate', C.wood, 36, G + 3, 24, 4, 4);
  for (const x of [34, 41]) stack('4032a', C.wood, x, G, 25, 2, 1);

  // ----------------------------------------------------------- planta alta
  m.step('Pisos de la planta alta');
  rect('plate', C.floor, 16, U - 1, 16, 16, 16);
  rect('plate', C.ground, 0, U - 1, 22, 6, 10);
  rect('plate', C.ground, 6, U - 1, 22, 6, 10);
  rect('plate', C.wood, 12, U - 1, 22, 4, 10);
  for (let i = 0; i < 8; i++) rect('plate', i === 7 ? C.roof : C.wood, 32 + 2 * i, U - 1, 22, 2, 10);

  m.step('Puesto de mando');
  for (const [x, z] of [[19, 19], [28, 19], [19, 23], [28, 23]]) m.add('43888', C.wood, x, U, z);
  for (const y of [U, U + 6, U + 12]) for (let i = 0; i < 5; i++) win(C.red, 19 + 2 * i, y, 28);

  if (!F) {
    m.step('Puesto de mando: consola y mesa de mapas');
    rect('brick', C.roof, 21, U, 26, 3, 2);
    rect('brick', C.roof, 24, U, 26, 3, 2);
    for (let i = 0; i < 6; i++) m.add('3040b', C.roof, 21 + i, U + 3, 26, { face: 'S' });
    m.add('3003', C.stone, 23, U, 21);
    rect('plate', C.wood, 22, U + 3, 20, 4, 4);
    rect('tile', 'Sand Blue', 22, U + 4, 21, 4, 2);
  }

  m.step('Techo del puesto de mando');
  const R = U + 18;
  m.add('92584', C.roof, 14, R, 14, { rot: 1 });
  m.add('92584', C.roof, 24, R, 14, { rot: 0 });
  m.add('92584', C.roof, 14, R, 24, { rot: 2 });
  m.add('92584', C.roof, 24, R, 24, { rot: 3 });
  for (const x of [14, 30]) m.add('3299', C.roof, x, R + 1, 23);
  for (const z of [14, 30]) m.add('3299', C.roof, 23, R + 1, z, { rot: 1 });

  m.step('Altillo del maestro');
  // Anillo de 6x6 con una ventana por lado; las esquinas se traban hilada por medio.
  const A = R + 1;
  const ring = (y, longSidesAlongX, piece) => {
    if (longSidesAlongX) {
      for (const z of [21, 26]) for (const x of [21, 23, 25]) piece(x, y, z, 0);
      for (const x of [21, 26]) for (const z of [22, 24]) piece(x, y, z, 1);
    } else {
      for (const x of [21, 26]) for (const z of [21, 23, 25]) piece(x, y, z, 1);
      for (const z of [21, 26]) for (const x of [22, 24]) piece(x, y, z, 0);
    }
  };
  ring(A, true, (x, y, z, rot) => m.add('3004', C.wall, x, y, z, { rot }));
  for (const y of [A + 3, A + 6]) {
    for (const z of [21, 26]) for (const x of [21, 25]) m.add(y === A + 3 ? '3004' : '4216', C.wall, x, y, z);
    for (const x of [21, 26]) for (const z of [22, 25]) m.add('3005', C.wall, x, y, z);
  }
  win(C.red, 23, A + 3, 21, 'S');
  win(C.red, 23, A + 3, 26, 'N');
  win(C.red, 21, A + 3, 23, 'W');
  win(C.red, 26, A + 3, 23, 'E');
  ring(A + 9, false, (x, y, z, rot) => m.add('4216', C.wall, x, y, z, { rot }));

  m.step('Techo del altillo');
  const R2 = A + 12;
  m.add('30503', C.roof, 20, R2, 20, { rot: 1 });
  m.add('30503', C.roof, 24, R2, 20, { rot: 0 });
  m.add('30503', C.roof, 20, R2, 24, { rot: 2 });
  m.add('30503', C.roof, 24, R2, 24, { rot: 3 });
  m.add('3045', C.roof, 24, R2 + 1, 22, { rot: 0 });
  m.add('3045', C.roof, 22, R2 + 1, 22, { rot: 1 });
  m.add('3045', C.roof, 22, R2 + 1, 24, { rot: 2 });
  m.add('3045', C.roof, 24, R2 + 1, 24, { rot: 3 });

  m.step('Remates dorados');
  m.add('87580', C.stone, 23, R2 + 4, 23);
  m.add('85975', C.gold, 23.5, R2 + 5, 23.5);
  m.add('6141', C.gold, 23.5, R2 + 7, 23.5);
  for (const [x, z] of [[14, 22], [14, 25], [33, 22], [33, 25]]) m.add('3024', C.gold, x, R + 1, z);
  for (const [x, z] of [[22, 14], [25, 14], [22, 33], [25, 33]]) m.add('6141', C.gold, x, R + 1, z);

  m.step('Pabellón de té');
  for (const [x, z] of [[36, 24], [42, 24], [36, 29], [42, 29]]) m.add('2454b', C.green, x, U, z);
  const T = U + 15;
  m.add('6106', C.ground, 34, T, 21, { rot: 1 });
  m.add('6106', C.ground, 40, T, 21, { rot: 0 });
  m.add('6106', C.ground, 34, T, 27, { rot: 2 });
  m.add('6106', C.ground, 40, T, 27, { rot: 3 });
  m.add('30503', C.roof, 36, T + 1, 23, { rot: 1 });
  m.add('30503', C.roof, 40, T + 1, 23, { rot: 0 });
  m.add('30503', C.roof, 36, T + 1, 27, { rot: 2 });
  m.add('30503', C.roof, 40, T + 1, 27, { rot: 3 });
  rect('plate', C.roof, 38, T + 2, 25, 4, 4);

  if (!F) {
    m.step('Aleros de tejas');
    for (const [x0, z0] of [[0, 21], [16, 15], [32, 21]]) {
      for (let i = 0; i < 4; i++) {
        rect('plate', C.stone, x0 + 4 * i, U, z0, 4, 2);
        m.add('3299', C.roof, x0 + 4 * i, U + 1, z0);
      }
    }
  }

  m.step('Pista de aterrizaje');
  for (const [x, z] of F ? [[8, 23], [15, 23], [8, 30], [15, 30]] : [[1, 25], [14, 25], [1, 30], [14, 30]]) m.add('6141', C.red, x, U, z);
  if (!F) {
    m.add('87580', C.stone, 11, U, 28);
    m.add('15395', 'White', 11, U + 1, 28);
  }

  m.step('Barandas de las terrazas');
  const rail = (posts, plate) => {
    for (const [x, z, face] of posts) m.add('2921', C.red, x, U, z, { face });
    plate();
  };
  rail([[0, 31, 'N'], [4, 31, 'N'], [8, 31, 'N'], [12, 31, 'N'], [15, 31, 'N']], () => {
    rect('plate', C.dark, 0, U + 3, 31, 8, 1);
    rect('plate', C.dark, 8, U + 3, 31, 8, 1);
  });
  rail([[0, 23, 'W'], [0, 27, 'W'], [0, 30, 'W']], () => rect('plate', C.dark, 0, U + 3, 23, 1, 8));
  rail([[32, 31, 'N'], [36, 31, 'N'], [40, 31, 'N'], [44, 31, 'N'], [47, 31, 'N']], () => {
    rect('plate', C.dark, 32, U + 3, 31, 8, 1);
    rect('plate', C.dark, 40, U + 3, 31, 8, 1);
  });
  rail([[47, 23, 'E'], [47, 27, 'E'], [47, 30, 'E']], () => rect('plate', C.dark, 47, U + 3, 23, 1, 8));
  for (const x of [16, 31]) {
    for (const z of [17, 22]) m.add('3005', C.wall, x, U, z);
    rect('plate', C.wood, x, U + 3, 17, 1, 6);
  }
  if (!F) m.add('3957b', C.roof, 0, U + 4, 31);

  // ----------------------------------------------------------------- patio
  m.step('Tarima de entrenamiento y senderos');
  m.add('92584', C.wood, 14, G, 4, { rot: 1 });
  m.add('92584', C.wood, 24, G, 4, { rot: 0 });
  for (const x of [20, 22, 24, 26]) rect('plate', C.wood, x, G, 14, 2, 3);
  rect('plate', C.stone, 14, G, 26, 3, 2);
  rect('plate', C.stone, 31, G, 26, 3, 2);
  rect('plate', C.stone, 5, G, 14, 2, 3);
  rect('plate', C.stone, 9, G, 14, 2, 3);

  m.step('Muñeco de entrenamiento y faroles de la tarima');
  const base = m.add('3680', 'Blue', 23, G + 1, 8);
  m.add('3679', C.pale, 23, G + 2, 8, { on: base });
  m.add('92947', C.dark, 23, G + 3, 8);
  m.add('3839b', C.roof, 23, G + 6, 8, { face: 'S' });
  m.add('3839b', C.roof, 23, G + 6, 9, { face: 'N' });
  m.add('92947', C.dark, 23, G + 7, 8);
  m.add('87580', C.stone, 23, G + 10, 8);
  m.add('3626c', C.floor, 23.5, G + 11, 8.5);
  const lantern = (x, y, z, baseColor = C.pale) => {
    m.add('87580', baseColor, x, y, z);
    m.add('3062b', C.floor, x + 0.5, y + 1, z + 0.5);
    m.add('6141', 'Yellow', x + 0.5, y + 4, z + 0.5);
    m.add('14769', C.pale, x, y + 5, z);
  };
  lantern(14, G + 1, 12);
  lantern(32, G + 1, 12);
  const climb = m.add('6083', C.stone, 13, G, 14, { rot: 1 });

  m.step('Portón torii');
  for (const x of [19, 28]) {
    stack('3245c', C.red, x, G, 1, 2, 6, { rot: 1 });
    stack('3004', C.red, x, G + 12, 1, 2, 3, { rot: 1 });
  }
  rect('brick', C.red, 20, G + 15, 1, 8, 1);
  rect('plate', C.roof, 18, G + 18, 1, 12, 1);
  rect('plate', C.roof, 18, G + 18, 2, 12, 1);
  for (const x of [18, 22, 26]) m.add('3299', C.roof, x, G + 19, 1);

  // En la fortaleza la cerca y la torre de vigía pasan al muro exterior.
  if (!F) {
    m.step('Cerca del frente');
    for (const x of [6, 10, 14, 30, 34, 38, 42]) {
      m.add('3701', C.wood, x, G, 0);
      rect('plate', C.ground, x, G + 3, 0, 2, 2);
      rect('plate', C.ground, x + 2, G + 3, 0, 2, 2);
      m.add('3299', C.roof, x, G + 4, 0);
    }

    m.step('Torre de vigía');
    watchtower(m, { rect }, 0, G, 0, 7);
  }

  m.step('Ring de combate');
  m.add('48092', 'Medium Nougat', 8, G, 6, { rot: 0 });
  m.add('48092', 'Medium Nougat', 4, G, 6, { rot: 1 });
  m.add('48092', 'Medium Nougat', 4, G, 10, { rot: 2 });
  m.add('48092', 'Medium Nougat', 8, G, 10, { rot: 3 });

  m.step('Armero de katanas');
  m.add('30137', C.wood, 8, G, 3);
  ['Black', C.gold, 'Black', C.gold].forEach((color, i) => {
    const clip = m.add('60897', C.wood, 8 + i, G + 3, 3, { face: 'N' });
    // El clip sostiene la empuñadura: la katana queda parada con el filo hacia arriba.
    m.addRaw('21459', color, [1, 0, 0, 0, 1, 0, 0, 0, 1, (8 + i + 0.5) * 20, -8 * (G + 4) + 4 - 7, 4.5 * 20], { on: clip });
  });

  m.step('Fragua y yunque');
  rect('brick', C.stone, 1, G, 17, 2, 4);
  rect('brick', C.stone, 3, G, 17, 2, 4);
  const hearth = m.add('87580', C.stone, 2, G + 3, 17);
  m.addRaw('6126b', 'Trans-Orange', [1, 0, 0, 0, 0, -1, 0, 1, 0, 60, -8 * (G + 4) - 4, 360], { on: hearth });
  m.add('3003', C.stone, 7, G, 18);
  rect('tile', C.roof, 6, G + 3, 18, 4, 2);

  // ---------------------------------------------------------------- jardín
  m.step('Jardín: estanque, puente y roca');
  m.add('30504', C.water, 36, G, 3, { rot: 1 });
  m.add('30504', C.water, 36, G, 11, { rot: 3 });
  m.add('14707', C.wood, 34, G, 11);
  const rock = m.add('6083', C.stone, 45, G, 12, { rot: 1 });
  lantern(32, G, 2, C.stone);
  if (!F) {
    m.add('30145', C.pale, 46, G, 0);
    m.add('98100', C.pale, 46, G + 9, 0);
    m.add('6141', 'Yellow', 46.5, G + 12, 0.5);
    m.add('14769', C.pale, 46, G + 13, 0);
  }

  m.step('Árbol de otoño');
  const tx = F ? 44 : 45; // en la fortaleza deja lugar al muro
  m.add('87580', C.ground, tx, G, 6);
  stack('3062b', C.wood, tx + 0.5, G + 1, 6.5, 3, 3);
  [[G + 10, 0], [G + 14, 1], [G + 18, 2], [G + 22, 3]].forEach(([y, rot], i) => {
    m.add('2417', 'Dark Orange', tx + 0.5, y, 6.5, { rot });
    if (i < 3) m.add('3062b', C.wood, tx + 0.5, y + 1, 6.5);
  });
  m.add('85975', C.wall, tx + 0.5, G + 23, 6.5);

  m.step('Nenúfares y flores');
  for (const [x, z, flower] of [[41, 8, 1], [42, 5, 0], [38, 10, 0], [37, 13, 0], [38, 15, 1], [41, 12, 0]]) {
    m.add('6141', 'Lime', x, G + 1, z);
    if (flower) m.add('33291', C.red, x, G + 2, z);
  }
  for (const [x, z] of F ? [] : [[43, 20], [41, 20], [33, 20], [44, 2]]) {
    m.add('6141', 'Lime', x, G, z);
    m.add('33291', C.red, x, G + 1, z);
  }

  // ------------------------------------------------- minifiguras de prueba
  // No son piezas del modelo: muestran dónde entran las tuyas.
  const H = '3901', HAT = '93059', HELM = '30175';
  const figs = [
    // patio
    [7, G, 11, 'S', 'Red', H, 'Black'], [7, G, 8, 'N', 'Blue', H, 'Dark Brown'],
    [7, G, 21, 'S', 'Dark Red', HAT, 'Tan'], [2, G, 14, 'E', 'Black', HELM, 'Black'],
    [22, G + 1, 5, 'N', 'Green', H, 'Dark Brown'], [24, G + 1, 12, 'S', 'White', H, 'Black'],
    [17, G + 1, 12, 'S', 'Orange', H, 'Reddish Brown'], [29, G + 1, 12, 'S', 'Dark Blue', H, 'Black'],
    [23, G, 2, 'S', 'Black', HAT, 'Tan'],
    // jardín
    [39, G + 9, 11, 'S', 'Lime', H, 'Black'], [32, G, 8, 'E', 'Sand Green', H, 'Dark Brown'], [33, G, 15, 'E', 'Tan', HAT, 'Tan'],
    // salón, taller y vivienda
    [17, G, 20, 'E', 'Dark Purple', H, 'Black'], [30, G, 20, 'W', 'Medium Azure', H, 'Reddish Brown'], [24, G, 29, 'S', 'White', HAT, 'Tan'],
    [6, G, 26, 'N', 'Dark Bluish Gray', H, 'Dark Brown'], [10, G, 24, 'S', 'Red', H, 'Reddish Brown'],
    [34, G, 28, 'N', 'Blue', H, 'Black'], [39, G, 21, 'N', 'Green', H, 'Reddish Brown'],
    // torre de vigía
    [2, G + 22, 2, 'S', 'Dark Green', HELM, 'Dark Green'],
    // planta alta
    [4, U, 26, 'S', 'Orange', H, 'Black'], [8, U, 25, 'S', 'Black', H, 'Dark Brown'], [13, U, 24, 'W', 'Dark Red', H, 'Black'],
    [21, U, 17, 'S', 'Red', H, 'Dark Brown'], [26, U, 17, 'S', 'Blue', HELM, 'Blue'],
    [20, U, 20, 'E', 'Green', H, 'Black'], [27, U, 20, 'W', 'Black', H, 'Reddish Brown'], [23, U, 24, 'N', 'White', H, 'Dark Brown'],
    [17, U, 25, 'W', 'Dark Blue', H, 'Black'], [30, U, 26, 'E', 'Lime', H, 'Dark Brown'],
    [39, U, 24, 'N', 'Dark Purple', H, 'Reddish Brown'], [33, U, 27, 'E', 'Medium Azure', H, 'Black'], [45, U, 26, 'W', 'Sand Green', HAT, 'Tan'],
  ];
  if (!F) for (const [x, y, z, face, color, hat, hatColor] of figs) m.fig(x, y, z, { face, color, hat, hatColor });
  return { rock, climb };
}

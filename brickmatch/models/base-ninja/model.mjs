// Base de operaciones Ninjago: torre-pagoda de mando con domo dorado y
// cuchillas, arena de Spinjitzu, armero con katana y sai, gong y brasero.
// Diseñada con las piezas del set 71826 "Dragon Spinjitzu Battle Pack"
// (186 piezas, USD 19,99 de lista).
//
// Grilla: x 0..12 (oeste→este), z 0..10 (frente→fondo), y en plates.
export const meta = {
  order: 2,
  title: 'Base Ninja',
  prompt: 'Hacé una base de operaciones Ninjago con un set barato',
  description: 'Torre-pagoda de mando con domo dorado y cuchillas, arena de Spinjitzu, armero con katana y sai, gong y brasero. Diseñada con las piezas del set 71826 Dragon Spinjitzu Battle Pack (186 piezas, USD 19,99 de lista en EE. UU.).',
  target: '71826-1',
};

const C = {
  sand: 'Tan',
  slate: 'Dark Blue',
  wood: 'Reddish Brown',
  red: 'Red',
  black: 'Black',
  stone: 'Dark Bluish Gray',
  gold: 'Pearl Gold',
  fire: 'Bright Light Orange',
  shadow: 'Dark Purple',
  steel: 'Light Bluish Gray',
  crystal: 'Trans-Dark Pink',
};

export default function build(m, { rect }) {
  // Pieza con barra metida en un stud hueco, girada en cualquier ángulo.
  // `lift` (LDU) la deja menos hundida cuando el hueco no es pasante.
  const plug = (part, color, host, studIndex, degrees, lift = 0) => {
    const s = m.studsOf(host)[studIndex];
    const t = (degrees * Math.PI) / 180;
    const M = [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t), s.tip[0], s.tip[1] - lift, s.tip[2]];
    return m.addRaw(part, color, M, { on: host });
  };

  // ------------------------------------------------------------------ suelo
  m.step('Suelo');
  for (const x of [0, 2, 4]) rect('plate', C.slate, x, 0, 0, 2, 8); // arena
  for (const z of [0, 2, 4, 6]) rect('plate', C.wood, 6, 0, z, 2, 2); // pasarela
  rect('plate', C.sand, 8, 0, 0, 4, 4);
  rect('plate', C.sand, 8, 0, 4, 4, 4);
  rect('plate', C.sand, 0, 0, 8, 12, 2); // fondo

  m.step('Uniones del suelo');
  rect('tile', C.fire, 6, 1, 1, 4, 2); // alfombra de entrada
  rect('tile', C.shadow, 3, 1, 7, 6, 1);
  rect('plate', C.shadow, 2, 1, 6, 1, 4);
  rect('plate', C.fire, 10, 1, 6, 1, 4);
  rect('plate', C.shadow, 11, 1, 6, 1, 4);

  // ------------------------------------------------------- arena de Spinjitzu
  m.step('Arena de Spinjitzu');
  const ring = (color, y) => {
    m.add('68568', color, 3, y, 3, { rot: 0 });
    m.add('68568', color, 3, y, 0, { rot: 1 });
    m.add('68568', color, 0, y, 0, { rot: 2 });
    m.add('68568', color, 0, y, 3, { rot: 3 });
  };
  ring(C.fire, 1);
  ring(C.shadow, 2);
  m.add('14769', C.gold, 2, 1, 2);

  m.step('Llamas de la arena');
  m.add('15672', C.fire, 1, 3, 0, { face: 'W' });
  m.add('15672', C.shadow, 3, 3, 0, { face: 'E' });
  m.add('15672', C.shadow, 1, 3, 5, { face: 'W' });
  m.add('15672', C.fire, 3, 3, 5, { face: 'E' });
  m.add('15672', C.shadow, 0, 3, 1, { face: 'S' });
  m.add('15672', C.fire, 0, 3, 3, { face: 'N' });
  m.add('15672', C.fire, 5, 3, 1, { face: 'S' });
  m.add('15672', C.shadow, 5, 3, 3, { face: 'N' });

  // ---------------------------------------------------------- torre: base
  m.step('Base de la torre');
  m.add('30145', C.wood, 6, 1, 3);
  m.add('30145', C.wood, 8, 1, 3);
  m.add('30145', C.wood, 6, 1, 5);
  for (let k = 0; k < 3; k++) m.add('3003', C.wood, 8, 1 + 3 * k, 5);

  m.step('Primer alero');
  m.add('3298', C.stone, 7, 10, 1, { face: 'S' });
  m.add('3298', C.stone, 7, 10, 6, { face: 'N' });
  m.add('3298', C.stone, 4, 10, 4, { face: 'W' });
  m.add('3298', C.stone, 9, 10, 4, { face: 'E' });
  for (const [x, z] of [[6, 3], [9, 3], [6, 6], [9, 6]]) {
    for (let k = 0; k < 3; k++) m.add('6141', C.gold, x, 10 + k, z);
  }
  m.add('3003', C.red, 7, 10, 4);

  m.step('Sala de mando');
  m.add('32324', C.black, 6, 13, 3, { nest: 'torre' });
  m.add('3003', C.red, 7, 13, 4, { nest: 'torre' });
  const top = m.add('32324', C.black, 6, 16, 3, { nest: 'torre' });
  m.add('3003', C.red, 7, 16, 4, { nest: 'torre' });

  m.step('Alero superior y cuchillas');
  m.add('70681', C.black, 7, 19, 1, { face: 'S' });
  m.add('70681', C.black, 8, 19, 1, { face: 'S' });
  m.add('70681', C.black, 7, 19, 6, { face: 'N' });
  m.add('70681', C.black, 8, 19, 6, { face: 'N' });
  m.add('85984', C.stone, 6, 19, 4, { face: 'W' });
  m.add('85984', C.stone, 9, 19, 4, { face: 'E' });
  // cuchillas en las cuatro esquinas, curvadas hacia afuera
  m.studsOf(top).forEach((s, i) => {
    const cx = Math.round((s.base[0] - 130) / 20), cz = Math.round((s.base[2] - 70) / 20);
    if ((cx === 0 || cx === 3) && (cz === 0 || cz === 3)) {
      const angle = cx === 0 ? (cz === 0 ? 225 : -45) : cz === 0 ? 135 : 45;
      plug('87747', C.black, top, i, angle);
    }
  });

  m.step('Domo dorado');
  m.add('4032a', C.shadow, 7, 19, 4);
  m.add('4032a', C.fire, 7, 20, 4);
  rect('plate', C.wood, 7, 21, 4, 2, 2);
  m.add('87580', C.red, 7, 22, 4);
  m.add('3960', C.gold, 6, 23, 3);
  m.add('64644', C.gold, 7.5, 25, 4.5);
  m.add('22388', C.crystal, 7.5, 30, 4.5);

  // ---------------------------------------------------------------- braseros
  m.step('Braseros');
  const brazier = (x, y, z, color) => {
    m.add('3660', C.red, x, y, z, { face: 'S' });
    m.add('4032a', color, x, y + 3, z);
    m.add('87580', C.red, x, y + 4, z);
    m.add('4740', C.black, x, y + 5, z);
    m.add('22388', C.crystal, x + 0.5, y + 6, z + 0.5);
  };
  brazier(10, 1, 0, C.fire);
  m.add('85984', C.stone, 6, 1, 0, { face: 'S' });
  m.add('85984', C.stone, 8, 1, 0, { face: 'S' });

  // ------------------------------------------------------------------ armero
  m.step('Armero');
  // Arma sostenida en horizontal por un clip. `grip` es la altura del mango
  // (en LDU del arma) que queda dentro del clip; `dir` es hacia dónde apunta.
  const mount = (part, color, clip, grip, dir, flat) => {
    const sx = dir === 'E' ? 1 : -1;
    const R = flat ? [0, -sx, 0, -1, 0, 0, 0, 0, -sx] : [0, -sx, 0, 0, 0, -1, sx, 0, 0];
    const M = [...R, clip.matrix[9] + sx * grip, clip.matrix[10] + 2, clip.matrix[11] - 20];
    return m.addRaw(part, color, M, { on: clip });
  };
  m.add('30136', C.wood, 3, 1, 9);
  m.add('30136', C.wood, 5, 1, 9);
  m.add('35480', C.black, 3, 4, 9);
  const lowClip = m.add('11476', C.steel, 5, 4, 9, { face: 'S' });
  m.add('30136', C.wood, 3, 5, 9);
  m.add('30136', C.wood, 5, 5, 9);
  const highClip = m.add('11476', C.steel, 3, 8, 9, { face: 'S' });
  m.add('35480', C.red, 5, 8, 9);
  m.add('85984', C.stone, 3, 9, 9, { face: 'S' });
  m.add('85984', C.stone, 5, 9, 9, { face: 'S' });
  mount('21459', C.gold, lowClip, 7, 'W', false);
  mount('98139', C.gold, highClip, -8, 'E', true);

  m.step('Gong y cuenco de fuego');
  m.add('30136', C.wood, 10, 2, 9);
  const stand = m.add('99207', C.black, 10, 5, 9, { face: 'S' });
  m.onStud(stand, 4, '14769', C.gold);
  m.add('87580', C.red, 10, 2, 6);
  m.add('4740', C.black, 10, 3, 6);
  m.add('22388', C.crystal, 10.5, 4, 6.5);

  m.step('Cuernos del dragón');
  const horns = m.add('35480', C.black, 0, 1, 7);
  plug('87747', C.black, horns, 0, 90, 4);
  plug('87747', C.black, horns, 1, -90, 4);
  m.add('4865b', C.red, 0, 1, 9, { face: 'N' });

  m.step('Farol y muros');
  m.add('64644', C.gold, 10, 1, 2);
  m.add('6141', 'Trans-Yellow', 10, 6, 2);
  m.add('15207', C.black, 11, 1, 2, { face: 'E' });
  m.add('4865b', C.red, 7, 1, 9, { face: 'N' });
  m.add('54200', 'Trans-Orange', 2, 2, 8, { face: 'S' });
  m.add('54200', 'Trans-Orange', 11, 2, 8, { face: 'E' });
}

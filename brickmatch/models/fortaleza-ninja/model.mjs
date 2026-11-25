// Base de Operaciones Ninja: la Base Universal con torres, muros, sala de
// operaciones y equipo técnico.
// Usa la misma caja (set 70751 Temple of Airjitzu): aprovecha piezas que
// en la base quedaban sin usar.
import base from '../base-universal/model.mjs';

export const meta = {
  order: 4,
  title: 'Base de Operaciones Ninja',
  prompt: 'Una más detallada: grande, con más estructuras, técnica y con torres. Que parezca de verdad una base de operaciones, con todo para planear, y que use mejor las piezas del set',
  description: 'La Base Universal ampliada con la misma caja para que funcione como cuartel: sala de operaciones bajo la pagoda (mesa de mapas, pantalla táctica y consolas), torre de control con radar y antenas, torre de defensa con torreta giratoria, torre de vigía, mirador en la roca, muros laterales, armería, sala de reuniones, taller con foso y pista de aterrizaje. Los aleros llevan las tejas redondas del templo original. Solo usa piezas del set 70751 Temple of Airjitzu; las minifiguras son de prueba.',
  target: '70751-1',
};

const C = {
  ground: 'Dark Tan', floor: 'Tan', wood: 'Reddish Brown', dark: 'Dark Brown', wall: 'Dark Red', red: 'Red',
  roof: 'Black', stone: 'Dark Bluish Gray', pale: 'Light Bluish Gray', blue: 'Medium Blue', green: 'Sand Green',
  gold: 'Pearl Gold', glass: 'Trans-Clear', water: 'Medium Azure', reed: 'Olive Green',
};
const G = 1; // nivel del patio
const U = 20; // nivel de la planta alta
const R = U + 18; // techo grande del puesto de mando

export default function build(m, helpers) {
  const { rect } = helpers;
  const { rock, climb } = base(m, helpers, { fortress: true });

  const stack = (part, color, x, y, z, n, h, opts = {}) => {
    for (let i = 0; i < n; i++) m.add(part, color, x, y + i * h, z, opts);
  };

  // ------------------------------------------------------------------ torres
  m.step('Torre de defensa con torreta');
  stack('3003', C.stone, 46, G, 0, 6, 3);
  m.add('90258', C.stone, 46, G + 18, 0);
  const D = G + 21;
  rect('plate', C.stone, 45, D, -1, 4, 4);
  m.add('4865b', C.ground, 46, D + 1, -1, { face: 'S' });
  m.add('4865b', C.ground, 46, D + 1, 2, { face: 'N' });
  m.add('4865b', C.ground, 45, D + 1, 0, { face: 'W' });
  m.add('4865b', C.ground, 48, D + 1, 0, { face: 'E' });
  const swivel = m.add('3680', 'Blue', 46, D + 1, 0);
  const mount = m.add('3679', C.pale, 46, D + 2, 0, { on: swivel });
  // Cañón de seis bocas apoyado sobre el plato giratorio, apuntando al frente.
  m.addRaw('18588', C.roof, [1, 0, 0, 0, 1, 0, 0, 0, 1, 47 * 20, -8 * (D + 3) - 4 - 29, 1 * 20], { on: mount });

  m.step('Torre de control');
  for (let i = 0; i < 5; i++) rect('brick', C.stone, 2, U + 3 * i, 27, 2, 4);
  m.add('2454b', C.green, 5, U, 25);
  m.add('2454b', C.green, 5, U, 29);
  const K = U + 15;
  rect('plate', C.ground, 0, K, 24, 4, 8);
  rect('plate', C.ground, 4, K, 24, 4, 8);
  m.add('32532', C.pale, 1, K + 1, 24, { nest: 'control' });

  m.step('Torre de control: radar, antenas y banderas');
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

  m.step('Mirador de la roca');
  for (const [x, z] of [[47, 14], [47, 17], [46, 15], [46, 16]]) m.add('3005', C.green, x, G + 18, z, { on: rock });
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

  m.step('Estatuas y trofeos');
  for (const x of [18, 28]) {
    m.add('87580', C.ground, x, G, 14);
    m.add('41535', C.pale, x + 0.5, G + 1, 14.5);
  }
  for (const x of [17, 29]) {
    m.add('15573', C.roof, x, U, 18);
    m.add('41535', C.pale, x + 0.5, U + 1, 18);
  }
  for (const x of [27, 29]) {
    m.add('87580', C.ground, x, G, 29);
    m.add('90398', C.wall, x + 0.5, G + 1, 29.5);
  }

  m.step('Juncos, senderos y bancos');
  for (const [x, z, y] of [[35, 4, G], [35, 7, G], [37, 20, G], [38, 22, G], [43, 13, G], [45, 3, G], [40, 6, G + 1], [39, 13, G + 1], [36, 15, G + 1]]) {
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
  m.step('Aleros con medallones');
  // Escuadra colgando del borde del piso: sostiene dos tejas redondas por tramo,
  // como los aleros del templo original. Arriba, la cornisa y las tejas negras.
  for (const [x0, zrow] of [[0, 22], [16, 16], [32, 22]]) {
    for (let i = 0; i < 4; i++) {
      const x = x0 + 4 * i;
      // Los tramos de las puntas pasan por delante de los hombros del portal.
      const nest = zrow === 22 && (i === 0 || i === 3) ? `portal${x0 + 2}` : null;
      const b = m.add('93274', C.stone, x, U, zrow, { face: 'S', nest });
      for (const dx of [-20, 20]) {
        const beside = x === 12 && dx === 20 ? { on: climb } : {}; // roza la roca de trepar
        m.addRaw('4032a', C.wood, [1, 0, 0, 0, 0, -1, 0, 1, 0, b.matrix[9] + dx, b.matrix[10] + 20, b.matrix[11] - 22], beside);
      }
      rect('plate', C.stone, x, U + 1, zrow - 1, 4, 2);
      m.add('3299', C.roof, x, U + 2, zrow - 1);
    }
  }

  // ----------------------------------------------------- sala de operaciones
  m.step('Sala de operaciones: mesa de mapas, pantalla táctica y consolas');
  // Arriba, bajo la pagoda y a la vista: acá se planea todo.
  m.add('3003', C.stone, 23, U, 21);
  m.add('11213', C.water, 21, U + 3, 19);
  for (const [x, z, color] of [[23, 21, 'Trans-Light Blue'], [24, 22, C.red], [22, 22, 'White'], [25, 20, 'Blue'], [24, 20, 'White']]) {
    m.add('6141', color, x, U + 4, z);
  }
  const screen = m.add('60596', C.roof, 22, U, 27);
  m.addRaw('pantalla', C.glass, screen.matrix, { on: screen });
  for (const x of [19, 26]) {
    rect('brick', C.roof, x, U, 26, 3, 2);
    for (let i = 0; i < 3; i++) m.add('3040b', C.roof, x + i, U + 3, 26, { face: 'S' });
  }

  m.step('Sala de reuniones');
  m.add('92947', C.dark, 23, G + 1, 23);
  rect('plate', C.wood, 22, G + 4, 22, 4, 4);
  rect('tile', 'Sand Blue', 22, G + 5, 23, 4, 2);
  m.add('61780', C.wood, 12, G, 24);

  m.step('Armería');
  const hilt = -8 * (G + 4) + 4;
  m.add('30137', C.wood, 16, G, 19, { rot: 1 });
  ['Black', 'Black', 'Flat Silver', 'Black'].forEach((color, i) => {
    const clip = m.add('60897', i === 3 ? C.floor : C.stone, 16, G + 3, 19 + i, { face: 'E' });
    m.addRaw('21459', color, [1, 0, 0, 0, 1, 0, 0, 0, 1, 17.5 * 20, hilt - 7, (19.5 + i) * 20], { on: clip });
  });

  // -------------------------------------------------- minifiguras de prueba
  const H = '3901', HAT = '93059', HELM = '30175';
  const figs = [
    // patio
    [7, G, 11, 'S', 'Red', H, 'Black'], [7, G, 8, 'N', 'Blue', H, 'Dark Brown'],
    [7, G, 21, 'S', 'Dark Red', HAT, 'Tan'], [3, G, 14, 'E', 'Black', HELM, 'Black'],
    [22, G + 1, 5, 'N', 'Green', H, 'Dark Brown'], [24, G + 1, 12, 'S', 'White', H, 'Black'],
    [17, G + 1, 12, 'S', 'Orange', H, 'Reddish Brown'], [29, G + 1, 12, 'S', 'Dark Blue', H, 'Black'],
    [23, G, 2, 'S', 'Black', HAT, 'Tan'],
    // jardín
    [39, G + 9, 11, 'S', 'Lime', H, 'Black'], [32, G, 7, 'E', 'Sand Green', H, 'Dark Brown'], [33, G, 15, 'E', 'Tan', HAT, 'Tan'],
    [45, G + 22, 15, 'W', 'Dark Green', H, 'Dark Brown'],
    // salón, taller y vivienda
    [23, G + 1, 19, 'N', 'Dark Purple', H, 'Black'], [23, G + 1, 28, 'S', 'White', HAT, 'Tan'],
    [19, G + 1, 23, 'E', 'Medium Azure', H, 'Reddish Brown'], [28, G + 1, 23, 'W', 'Red', H, 'Black'],
    [6, G, 26, 'N', 'Dark Bluish Gray', H, 'Dark Brown'], [9, G, 25, 'S', 'Red', H, 'Reddish Brown'],
    [34, G, 28, 'N', 'Blue', H, 'Black'],
    // torres
    [2, G + 22, 2, 'S', 'Dark Green', HELM, 'Dark Green'], [3, K + 1, 25, 'N', 'Orange', H, 'Black'],
    // planta alta
    [11, U + 1, 26, 'S', 'Black', H, 'Dark Brown'], [12, U, 23, 'S', 'Dark Red', H, 'Black'],
    [21, U, 17, 'S', 'Red', H, 'Dark Brown'], [26, U, 17, 'S', 'Blue', HELM, 'Blue'],
    [20, U, 21, 'E', 'Green', H, 'Black'], [27, U, 21, 'W', 'Black', H, 'Reddish Brown'], [23, U, 25, 'S', 'White', H, 'Dark Brown'],
    [17, U, 25, 'W', 'Dark Blue', H, 'Black'], [30, U, 26, 'E', 'Lime', H, 'Dark Brown'],
    [39, U, 24, 'N', 'Dark Purple', H, 'Reddish Brown'], [33, U, 27, 'E', 'Medium Azure', H, 'Black'], [45, U, 26, 'W', 'Sand Green', HAT, 'Tan'],
  ];
  for (const [x, y, z, face, color, hat, hatColor] of figs) m.fig(x, y, z, { face, color, hat, hatColor });
}

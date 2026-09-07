/* =========================================================
   roster.js — los 8 randoms del torneo
   Cada personaje: cabeza en pixel-grid, paleta, stats,
   un ESPECIAL (30 de barra) y un SUPER (100 de barra).
   Todos son parodias ficticias.
   ========================================================= */

/* ---------- arte de proyectiles ---------- */
const ART = {
  bill: {
    pal: { g: '#3fa14a', G: '#7ede78', k: '#123a17', y: '#f5e07a' },
    rows: [
      'gggggggg',
      'gGGGGGGg',
      'gGykkyGg',
      'gGykkyGg',
      'gGGGGGGg',
      'gggggggg'
    ]
  },
  chancla: {
    pal: { b: '#7b4bd4', B: '#4a2a8c', k: '#221037', w: '#c8a6ff' },
    rows: [
      '..kkkk..',
      '.BwwwwB.',
      'BbbbbbbB',
      'BbbkkbbB',
      '.BbbbbB.',
      '..BBBB..'
    ]
  },
  guano: {
    pal: { w: '#f2f4ee', l: '#c9cdbc', d: '#6d7160', y: '#d8d84a' },
    rows: [
      '..dwwd..',
      '.wwwwww.',
      'wwwlwwww',
      'wwwwwlww',
      '.wwwwww.',
      '..dllw..'
    ]
  },
  wifi: {
    pal: { c: '#48e0d0', C: '#a8fff4', d: '#106b64' },
    rows: [
      '..d..c..',
      '.d.c.C.c',
      'd.c.C.C.',
      'd.c.CCC.',
      'd.c.C.C.',
      '.d.c.C.c',
      '..d..c..'
    ]
  },
  maki: {
    pal: { k: '#161616', w: '#f4f2e6', p: '#f07a86', G: '#3fa14a' },
    rows: [
      '.kkkkk.',
      'kwwwwwk',
      'kwppwGk',
      'kwppppk',
      'kwGwwwk',
      'kwwwwwk',
      '.kkkkk.'
    ]
  },
  broco: {
    pal: { G: '#4ad14a', D: '#2a7d3a', l: '#9bf59b' },
    rows: [
      '.GlG.',
      'GGGGG',
      'lGGGl',
      '.DDD.',
      '.DD..'
    ]
  },
  sopa: {
    pal: { o: '#f0932b', y: '#ffd166', r: '#c0392b', w: '#ffe9c9' },
    rows: [
      '..yyyy..',
      '.yoooooy',
      'yoorrooy',
      'yooooooy',
      '.yooooy.',
      '..wwww..'
    ]
  },
  blade: {
    pal: { l: '#d7dbe6', w: '#ffffff', d: '#6b7280', p: '#f07ac0' },
    rows: [
      '.d.ll.d.',
      'd.lwwl.d',
      '.lwppwl.',
      '.lwppwl.',
      'd.lwwl.d',
      '.d.ll.d.'
    ]
  }
};

/* ---------- personajes ---------- */
const ROSTER = [
  {
    id: 'trumpo',
    name: 'TRUMPO',
    title: 'EL MAGNATE DORADO',
    bio: 'Construye muros y paga los daños en efectivo. Tremendo, la gente lo dice.',
    speed: 1.28, power: 1.05, weight: 1.1,
    pal: { s: '#f0a878', S: '#c98055', h: '#f5dc8e', H: '#cbae52', k: '#181818', m: '#8c3b3b' },
    head: [
      '....hhhh....',
      '..hhhhhhhh..',
      '.hhhhhhhhhh.',
      '.hhsssssshh.',
      '.ssssssssss.',
      '.skssskssss.',
      '.ssssssssss.',
      '.sssmmmmsss.',
      '.ssssssssss.',
      '..ssssssss..',
      '...SSSSSS...',
      '....ssss....'
    ],
    body: { style: 'suit', main: '#1e2436', dark: '#141926', light: '#f2f2ef', accent: '#c02a2a', skin: '#f0a878' },
    special: {
      name: 'MURO DE ORO', cost: 30, kind: 'wall', dmg: 8,
      say: '¡PAGA EL MURO!'
    },
    superMove: {
      name: 'LLUVIA DE BILLETES', cost: 100, kind: 'projectile', dmg: 11, count: 6, spread: 0.9,
      speed: 2.1, gravity: 0.045, art: 'bill', oy: -34, life: 130,
      say: '¡EFECTIVO, MUCHO EFECTIVO!'
    },
    quotes: ['Gané. Enorme victoria. La más grande.', 'Te mandé la factura del muro.'],
    taunt: '¡TREMENDO!'
  },

  {
    id: 'abuela',
    name: 'ABUELA CHANCLETA',
    title: 'CAMPEONA DE PUNTERÍA',
    bio: 'Chancla teledirigida calibrada con 40 años de experiencia. Nunca falla.',
    speed: 1.22, power: 1.0, weight: 1.0,
    pal: { s: '#f2c9a0', S: '#cfa17c', l: '#dfe3ea', w: '#ffffff', k: '#181818', m: '#a34b52', p: '#d874a0' },
    head: [
      '...llllll...',
      '..llllllll..',
      '.llllllllll.',
      '.llssssssll.',
      '.ssssssssss.',
      '.wkwsswkwss.',
      '.ssssssssss.',
      '..sssmmss...',
      '..ssssssss..',
      '...ssssss...',
      '...pppppp...',
      '....pppp....'
    ],
    body: { style: 'dress', main: '#c0507f', dark: '#8e3459', light: '#f6dce8', accent: '#f2c94c', skin: '#f2c9a0' },
    special: {
      name: 'CHANCLA TELEDIRIGIDA', cost: 30, kind: 'projectile', dmg: 12,
      speed: 1.9, homing: 0.14, art: 'chancla', oy: -32, life: 180,
      say: '¡TE LA MANDÉ CON CARIÑO!'
    },
    superMove: {
      name: 'SOPA HIRVIENDO', cost: 100, kind: 'projectile', dmg: 9, count: 4, spread: 0.5,
      speed: 2.4, art: 'sopa', oy: -30, life: 120, burn: true,
      say: '¡ESTÁ CALENTITA, TÓMATELA!'
    },
    quotes: ['Ahora sí te comes toda la sopa.', 'En mis tiempos ganábamos sin barra de super.'],
    taunt: '¡NO ME CONTESTES!'
  },

  {
    id: 'capi',
    name: 'CAPI',
    title: 'CAPIBARA ZEN',
    bio: 'No pelea, coexiste. Si te gana es porque te estresaste tú solo.',
    speed: 1.05, power: 1.15, weight: 1.35,
    pal: { n: '#a4794a', N: '#7a5631', k: '#181818', w: '#ffe9c9' },
    head: [
      '..n......n..',
      '.nnn....nnn.',
      '.nnnnnnnnnn.',
      'nnnnnnnnnnnn',
      'nnkknnnnkknn',
      'nnnnnnnnnnnn',
      '.nnnnnnnnnn.',
      '.nnNNNNNNnn.',
      '.nnNkkkkNnn.',
      '..NNNNNNNN..',
      '...nnnnnn...',
      '....nnnn....'
    ],
    body: { style: 'fur', main: '#a4794a', dark: '#7a5631', light: '#c9a06d', accent: '#4ad14a', skin: '#a4794a' },
    special: {
      name: 'AURA ZEN', cost: 30, kind: 'heal', heal: 18, guard: 240,
      say: '...todo bien, todo tranquilo.'
    },
    superMove: {
      name: 'ESTAMPIDA', cost: 100, kind: 'dash', dmg: 10, hits: 3, speed: 4.2, dur: 34,
      say: '¡MOMENTO NO-ZEN!'
    },
    quotes: ['Ganar, perder... el río sigue igual.', 'Te presté mi calma y no la usaste.'],
    taunt: 'mmh.'
  },

  {
    id: 'palomo',
    name: 'PALOMO 3000',
    title: 'PALOMA CIBERNÉTICA',
    bio: 'Le pusieron un ojo láser y sigue prefiriendo el pan viejo.',
    speed: 1.45, power: 0.9, weight: 0.8,
    pal: { d: '#6f7d99', D: '#4a5670', c: '#9fb6d9', o: '#f0932b', k: '#181818', r: '#ff4d4d', w: '#ffffff' },
    head: [
      '....dddd....',
      '..dddddddd..',
      '.dddddddddd.',
      '.dddddddddd.',
      '.ddwkddrrdd.',
      '.dddddddoooo',
      '.dddddddoo..',
      '.cccccccc...',
      '..cccccc....',
      '...cccc.....',
      '...dddd.....',
      '....dd......'
    ],
    body: { style: 'fur', main: '#6f7d99', dark: '#4a5670', light: '#9fb6d9', accent: '#f0932b', skin: '#6f7d99' },
    special: {
      name: 'BOMBA GUANO', cost: 30, kind: 'projectile', dmg: 10,
      speed: 2.6, gravity: 0.09, vy: -1.8, art: 'guano', oy: -38, life: 140, splash: true,
      say: '¡SORPRESA DESDE ARRIBA!'
    },
    superMove: {
      name: 'PICOTAZO SUPERSÓNICO', cost: 100, kind: 'dash', dmg: 9, hits: 4, speed: 5.0, dur: 30, air: true,
      say: '¡PAN! ¿DÓNDE ESTÁ EL PAN?'
    },
    quotes: ['Coo. Coo. (traducción: gané)', 'Te estacionaste debajo de mí. Error.'],
    taunt: '¡COO!'
  },

  {
    id: 'router',
    name: 'DON ROUTER',
    title: 'SEÑOR DE LA SEÑAL',
    bio: 'Tiene todas las barras y aún así te va lento. Reiniciarlo no sirve.',
    speed: 1.15, power: 1.0, weight: 1.2,
    pal: { d: '#3c4457', l: '#8d97ad', c: '#48e0d0', g: '#4ad14a', r: '#ff4d4d', k: '#0f131c' },
    head: [
      '..l......l..',
      '..l......l..',
      'dddddddddddd',
      'dlllllllllld',
      'dlkllllkllld',
      'dlllllllllld',
      'dlgrglllllld',
      'dddddddddddd',
      '..dddddddd..',
      '...dddddd...',
      '...cccccc...',
      '....dddd....'
    ],
    body: { style: 'machine', main: '#3c4457', dark: '#252b38', light: '#8d97ad', accent: '#48e0d0', skin: '#8d97ad' },
    special: {
      name: 'LAG', cost: 30, kind: 'projectile', dmg: 6,
      speed: 3.0, art: 'wifi', oy: -30, life: 110, effect: 'slow',
      say: '¿Y si reinicias?'
    },
    superMove: {
      name: 'DESCONEXIÓN TOTAL', cost: 100, kind: 'projectile', dmg: 14, count: 3, spread: 0.35,
      speed: 3.4, art: 'wifi', oy: -30, life: 130, effect: 'slow', big: true,
      say: '¡SIN INTERNET, SIN PIEDAD!'
    },
    quotes: ['Se cayó tu conexión. Y tú también.', 'Ping 9000. Ganaste el lag, no la pelea.'],
    taunt: 'BUFFERING...'
  },

  {
    id: 'brocoli',
    name: 'BRÓCOLI BOB',
    title: 'EL VERDE QUE NADIE PIDIÓ',
    bio: 'Nutritivo, incomprendido y sorprendentemente violento.',
    speed: 1.18, power: 1.0, weight: 1.0,
    pal: { G: '#4ad14a', D: '#2a7d3a', l: '#9bf59b', k: '#123a17', m: '#1d5c2a' },
    head: [
      '..GGG..GGG..',
      '.GGGGGGGGGG.',
      'GGGGGGGGGGGG',
      'GGGlGGGGlGGG',
      '.GGkGGGGkGG.',
      '.GGGGGGGGGG.',
      '..GGmmmmGG..',
      '..DDDDDDDD..',
      '...DDDDDD...',
      '...DDDDDD...',
      '....DDDD....',
      '....DDDD....'
    ],
    body: { style: 'veggie', main: '#2a7d3a', dark: '#1c5527', light: '#7de07d', accent: '#f2c94c', skin: '#4ad14a' },
    special: {
      name: 'FOTOSÍNTESIS', cost: 30, kind: 'heal', heal: 22, guard: 120,
      say: '¡DAME SOL Y TE DOY GUERRA!'
    },
    superMove: {
      name: 'LLUVIA DE VERDURAS', cost: 100, kind: 'rain', dmg: 8, count: 7, art: 'broco',
      say: '¡CÓMETE LOS VEGETALES!'
    },
    quotes: ['Nadie me quiere en el plato pero aquí estoy.', 'Cinco porciones al día. Cinco golpes también.'],
    taunt: '¡FIBRA!'
  },

  {
    id: 'licuadora',
    name: 'LICUADORA-MAX',
    title: 'MODO TURBO 12 VELOCIDADES',
    bio: 'Solo tiene dos botones: "pulso" y "arruinar tu día".',
    speed: 1.32, power: 1.1, weight: 1.15,
    pal: { l: '#d7dbe6', c: '#bfe6ff', d: '#4a5265', p: '#f07ac0', k: '#1a1d26' },
    head: [
      '..dddddddd..',
      '.llllllllll.',
      '.lccccccccl.',
      '.lccccccccl.',
      '.lckcccckcl.',
      '.lccccccccl.',
      '.lppppppppl.',
      '.lppppppppl.',
      '.lppppppppl.',
      '.llllllllll.',
      '...dddddd...',
      '...dddddd...'
    ],
    body: { style: 'machine', main: '#c9cfdd', dark: '#8d94a6', light: '#f07ac0', accent: '#e0343c', skin: '#d7dbe6' },
    special: {
      name: 'TURBO LICUADO', cost: 30, kind: 'dash', dmg: 8, hits: 3, speed: 4.0, dur: 30,
      say: '¡VELOCIDAD DOCE!'
    },
    superMove: {
      name: 'BATIDO MORTAL', cost: 100, kind: 'projectile', dmg: 13, count: 5, spread: 0.6,
      speed: 3.2, art: 'blade', oy: -30, life: 120,
      say: '¡SIN GRUMOS!'
    },
    quotes: ['Quedaste bien batido.', 'Te licué en dos velocidades menos de las que tengo.'],
    taunt: '¡BRRRRR!'
  },

  {
    id: 'gato',
    name: 'NINJA SUSHI GATO',
    title: 'SOMBRA CON HAMBRE',
    bio: 'Entrenó veinte años en las artes marciales y once minutos en modales.',
    speed: 1.5, power: 0.92, weight: 0.85,
    pal: { d: '#3a3f52', D: '#22263a', w: '#f2f0e6', k: '#111', r: '#c0392b', m: '#e08aa0' },
    head: [
      '..dd....dd..',
      '.dddd..dddd.',
      '.dddddddddd.',
      '.rrrrrrrrrr.',
      '.dwkddddkwd.',
      '.dddddddddd.',
      '..ddwwwwdd..',
      '..dwwmmwwd..',
      '...wwwwww...',
      '...dddddd...',
      '....dddd....',
      '....dddd....'
    ],
    body: { style: 'ninja', main: '#3a3f52', dark: '#22263a', light: '#f2f0e6', accent: '#c0392b', skin: '#3a3f52' },
    special: {
      name: 'SHURIKEN MAKI', cost: 30, kind: 'projectile', dmg: 9, count: 2, spread: 0.25,
      speed: 3.6, art: 'maki', oy: -30, life: 110,
      say: '¡PEDIDO PARA LLEVAR!'
    },
    superMove: {
      name: 'NUEVE VIDAS', cost: 100, kind: 'teleport', dmg: 22,
      say: '¡NO ME VISTE VENIR, HUMANO!'
    },
    quotes: ['Tiré tu vaso de la mesa. Y también tu récord.', 'Miau. (Es un insulto en su idioma.)'],
    taunt: '¡MIAU!'
  }
];

const byId = id => ROSTER.find(c => c.id === id);

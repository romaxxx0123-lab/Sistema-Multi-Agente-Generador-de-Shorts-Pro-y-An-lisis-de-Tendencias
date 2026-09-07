/* =========================================================
   roster.js — 8 parodias de gente real.
   El chiste sale de quiénes son: sus poderes son sus memes.
   Nombres deformados a propósito: son caricaturas, no ellos.
   ========================================================= */

/* ---------- arte de proyectiles ---------- */
const ART = {
  bill: {
    pal: { g: '#3fa14a', G: '#7ede78', k: '#123a17', y: '#f5e07a' },
    rows: ['gggggggg', 'gGGGGGGg', 'gGykkyGg', 'gGykkyGg', 'gGGGGGGg', 'gggggggg']
  },
  cohete: {
    pal: { w: '#f2f2ef', r: '#e0343c', y: '#f5c542', d: '#8d97ad' },
    rows: ['..w..', '.rwr.', '.rwr.', '.rrr.', 'd.y.d', '.y.y.']
  },
  tuit: {
    pal: { w: '#f2f2ef', k: '#101726', c: '#48e0d0' },
    rows: ['wwwwww', 'wkwwkw', 'wwkkww', 'wkwwkw', 'wwwwww', 'cc....']
  },
  balon: {
    pal: { w: '#f2f2ef', k: '#1a1a1a' },
    rows: ['..www..', '.wkwkw.', 'wwwkwww', 'wkwwwkw', 'wwwkwww', '.wkwkw.', '..www..']
  },
  grito: {
    pal: { y: '#f5c542', w: '#fff2a8' },
    rows: ['..y..', '.y.w.', 'y.w.y', 'y.w.y', '.y.w.', '..y..']
  },
  plato: {
    pal: { w: '#f2f2ef', r: '#c0392b', p: '#f07a86' },
    rows: ['.wwwww.', 'wwprpww', 'wprrrpw', 'wwprpww', '.wwwww.']
  },
  sarten: {
    pal: { k: '#22252f', r: '#e0343c', y: '#f5c542' },
    rows: ['..rr...', '.ryyr..', 'kkkkkk.', 'kkkkkkk', '.kkkk..']
  },
  arbol: {
    pal: { G: '#4ad14a', D: '#2a7d3a', n: '#6b4a2a' },
    rows: ['..G..', '.GDG.', 'GGGGG', '.GDG.', '..n..', '..n..']
  },
  mancha: {
    pal: { p: '#f07ac0', b: '#9bb7f0' },
    rows: ['..pp..', '.pbbp.', 'pbbbbp', '.pbbp.', '..pp..', '.p..p.']
  },
  ceja: {
    pal: { k: '#3a2a1a', n: '#6b4a2a' },
    rows: ['...knn', '..kn..', '.kn...', 'kn....']
  },
  captcha: {
    pal: { k: '#101726', w: '#f2f2ef', c: '#48e0d0' },
    rows: ['kkkkkk', 'k.w.wk', 'kw.c.k', 'k.w.wk', 'kkkkkk']
  },
  doc: {
    pal: { w: '#f2f2ef', k: '#5a6478' },
    rows: ['wwwww', 'wkkkw', 'wwwww', 'wkkkw', 'wwwww']
  }
};

/* ---------- el elenco ---------- */
const ROSTER = [
  {
    id: 'trumpo', name: 'TRUMPO', short: 'TRUMPO', real: 'EL MAGNATE',
    title: 'CONSTRUCTOR DE MUROS', type: 'dinero', sub: 'LADRILLO',
    bio: 'PAGA LOS DAÑOS EN EFECTIVO Y LA FACTURA TE LLEGA A TI.',
    speed: 1.28, power: 1.05,
    pal: { s: '#f0a878', S: '#c98055', h: '#f5dc8e', k: '#181818', m: '#8c3b3b' },
    head: ['....hhhh....', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssshh.',
           '.ssssssssss.', '.skssskssss.', '.ssssssssss.', '.sssmmmmsss.',
           '.ssssssssss.', '..ssssssss..', '...SSSSSS...', '....ssss....'],
    body: { style: 'suit', main: '#1e2436', dark: '#141926', light: '#f2f2ef', accent: '#c02a2a', skin: '#f0a878' },
    special: { name: 'MURO DE ORO', cost: 30, kind: 'wall', dmg: 8, say: '¡Y LO PAGAS TÚ!' },
    superMove: { name: 'LLUVIA DE BILLETES', cost: 100, kind: 'projectile', dmg: 11, count: 6, spread: 0.9,
      speed: 2.1, gravity: 0.045, art: 'bill', oy: -34, life: 130, say: '¡EFECTIVO, MUCHO EFECTIVO!' },
    quotes: ['GANÉ. ENORME VICTORIA. LA MÁS GRANDE.', 'TE MANDÉ LA FACTURA DEL MURO.',
             'NADIE CONSTRUYE MUROS COMO YO. NADIE.'],
    taunt: '¡TREMENDO!'
  },

  {
    id: 'musko', name: 'MUSKO', short: 'MUSKO', real: 'EL DE LOS COHETES',
    title: 'DIRECTOR DE TODO', type: 'cohete', sub: 'BETA PERMANENTE',
    bio: 'LANZA COHETES QUE A VECES ATERRIZAN. TUITEA A LAS 3 DE LA MAÑANA.',
    speed: 1.22, power: 1.0,
    pal: { s: '#f0c8a8', S: '#c9a17c', h: '#4a3524', k: '#181818', m: '#8c3b3b' },
    head: ['............', '...hhhhhh...', '..hhhhhhhh..', '.hhsssssshh.',
           '.ssssssssss.', '.skssskssss.', '.ssssssssss.', '.ssssmmssss.',
           '.ssssssssss.', '..ssssssss..', '...SSSSSS...', '....ssss....'],
    body: { style: 'jacket', main: '#1a1a1e', dark: '#0e0e12', light: '#2a2a34', accent: '#e0343c', skin: '#f0c8a8' },
    special: { name: 'ATERRIZAJE CONTROLADO', cost: 30, kind: 'projectile', dmg: 12,
      speed: 2.7, gravity: 0.10, vy: -2.0, art: 'cohete', oy: -38, life: 150, splash: true,
      say: 'ESTA VEZ SÍ ATERRIZA' },
    superMove: { name: 'TUIT DE MADRUGADA', cost: 100, kind: 'projectile', dmg: 12, count: 3, spread: 0.4,
      speed: 3.2, art: 'tuit', oy: -32, life: 130, effect: 'slow', say: '¡SE DESPLOMÓ LA BOLSA!' },
    quotes: ['LO ARREGLO CON UNA ACTUALIZACIÓN DE SOFTWARE.', 'COMPRÉ EL RING. AHORA SE LLAMA X.',
             'TU DERROTA ESTABA EN LA HOJA DE RUTA.'],
    taunt: '¡AL ESPACIO!'
  },

  {
    id: 'pulga', name: 'EL PULGA', short: 'PULGA', real: 'EL DE LA ZURDA',
    title: 'ZURDA REGISTRADA', type: 'futbol', sub: 'TRANQUILO',
    bio: 'CAMINA, CAMINA, CAMINA Y DE REPENTE TE ELIMINÓ DEL TORNEO.',
    speed: 1.55, power: 0.85,
    pal: { s: '#e8b98f', S: '#c2926a', h: '#8a6a44', b: '#6b4f30', k: '#181818', m: '#8c3b3b' },
    head: ['............', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssshh.',
           '.ssssssssss.', '.skssskssss.', '.ssssssssss.', '.bbbbmmbbbb.',
           '.bbbbbbbbbb.', '..bbbbbbbb..', '...bbbbbb...', '....ssss....'],
    body: { style: 'stripes', main: '#7fd0e8', dark: '#3a7f96', light: '#f2f2ef', accent: '#f5c542', skin: '#e8b98f', legs: '#e8ecf5', legsDark: '#b9c4d8' },
    special: { name: 'TIRO LIBRE', cost: 30, kind: 'projectile', dmg: 11,
      speed: 2.6, homing: 0.13, art: 'balon', oy: -20, life: 170, say: 'AL ÁNGULO' },
    superMove: { name: 'GAMBETA INFINITA', cost: 100, kind: 'dash', dmg: 9, hits: 4, speed: 4.6, dur: 36,
      say: '¡SE FUE DE CUATRO!' },
    quotes: ['Y HOY TAMPOCO FUE PENAL.', 'LA PELOTA NO SE MANCHA. TU RÉCORD SÍ.',
             'ANDÁ, TRANQUILO, NO PASA NADA.'],
    taunt: 'ANDÁ P’ALLÁ'
  },

  {
    id: 'siuuu', name: 'SIUUU', short: 'SIUUU', real: 'EL DEL SALTO',
    title: 'MÁQUINA DE SALTAR', type: 'ego', sub: 'ABDOMINALES',
    bio: 'SALTA MÁS ALTO QUE TU AUTOESTIMA Y ADEMÁS TE LO CUENTA.',
    speed: 1.42, power: 1.0,
    pal: { s: '#e0a878', S: '#b8845a', h: '#1a1410', w: '#ffffff', k: '#181818' },
    head: ['............', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhhhhhhhhh.',
           '.ssssssssss.', '.skssskssss.', '.ssssssssss.', '..sswwwwss..',
           '..sswwwwss..', '..ssssssss..', '...ssssss...', '....ssss....'],
    body: { style: 'jersey', main: '#c0392b', dark: '#8f1218', light: '#f2f2ef', accent: '#f5c542', skin: '#e0a878', legs: '#f2f2ef', legsDark: '#c9cfdd' },
    special: { name: 'CABEZAZO ORBITAL', cost: 30, kind: 'dash', dmg: 11, hits: 2, speed: 4.4, dur: 30, air: true,
      say: '¡SIGO SUBIENDO!' },
    superMove: { name: 'GRITO SIUUU', cost: 100, kind: 'projectile', dmg: 13, count: 2, spread: 0.5,
      speed: 3.0, art: 'grito', oy: -34, life: 130, big: true, effect: 'slow', say: '¡SIUUUUUU!' },
    quotes: ['SOY EL MEJOR. LO DIGO YO, QUE SÉ DE ESTO.', 'ESAS CINCO LAS GANÉ SOLO.',
             'EL TALENTO SIN TRABAJO NO ES NADA. YO TENGO LOS DOS.'],
    taunt: '¡SIUUU!'
  },

  {
    id: 'ramses', name: 'CHEF RAMSÉS', short: 'RAMSÉS', real: 'EL CHEF QUE GRITA',
    title: 'TODO ESTÁ CRUDO', type: 'cocina', sub: 'GRITO',
    bio: 'NUNCA HA VISTO UN PLATO BIEN HECHO. NI UN RIVAL BIEN COCINADO.',
    speed: 1.25, power: 1.1,
    pal: { s: '#f2c9a0', S: '#cfa17c', h: '#e8d9a0', k: '#181818' },
    head: ['.h.h..h.h...', '.hhhhhhhhh..', '.hhhhhhhhhh.', '.hhsssssshh.',
           '.ssssssssss.', '.kkssskkkss.', '.ssssssssss.', '.sskkkkkkss.',
           '.ssssssssss.', '..ssssssss..', '...ssssss...', '....ssss....'],
    body: { style: 'chef', main: '#f2f2ef', dark: '#c9cfdd', light: '#ffffff', accent: '#3a4560', skin: '#f2c9a0', legs: '#3a4560', legsDark: '#252b38' },
    special: { name: '¡ESTÁ CRUDO!', cost: 30, kind: 'projectile', dmg: 10, count: 2, spread: 0.35,
      speed: 3.2, art: 'plato', oy: -30, life: 120, say: '¡ESTO ESTÁ CRUDÍSIMO!' },
    superMove: { name: 'PESADILLA EN LA COCINA', cost: 100, kind: 'rain', dmg: 9, count: 7, art: 'sarten',
      effect: 'burn', say: '¡FUERA DE MI COCINA!' },
    quotes: ['¡ESTO ESTÁ MÁS CRUDO QUE TU DEFENSA!', 'TE DEJÉ QUEMADO POR FUERA Y TEMBLANDO POR DENTRO.',
             '¿ESTO LO HICISTE TÚ? ¿CON LAS MANOS?'],
    taunt: '¡ESTÁ CRUDO!'
  },

  {
    id: 'bob', name: 'BOB LA BROCHA', short: 'BOB', real: 'EL PINTOR AMABLE',
    title: 'ACCIDENTES FELICES', type: 'oleo', sub: 'ARBOLITO',
    bio: 'NO CREE EN LOS ERRORES. TAMPOCO EN PEGARTE, PERO AQUÍ ESTAMOS.',
    speed: 1.10, power: 0.95,
    pal: { s: '#f2c9a0', S: '#cfa17c', h: '#6b4a2a', b: '#5a3d22', k: '#181818', m: '#8c5b4b' },
    head: ['..hhhhhhhh..', '.hhhhhhhhhh.', 'hhhhhhhhhhhh', 'hhhsssssshhh',
           '.hssssssssh.', '.skssskssss.', '.ssssssssss.', '.bbbbmmbbbb.',
           '.bbbbbbbbbb.', '..bbbbbbbb..', '...bbbbbb...', '....ssss....'],
    body: { style: 'shirt', main: '#7fa8d8', dark: '#4a6f9e', light: '#e8f0fa', accent: '#f0932b', skin: '#f2c9a0' },
    special: { name: 'ARBOLITO FELIZ', cost: 30, kind: 'heal', heal: 22, guard: 200, art: 'arbol', say: 'UN AMIGUITO AQUÍ' },
    superMove: { name: 'ACCIDENTE FELIZ', cost: 100, kind: 'rain', dmg: 8, count: 8, art: 'mancha',
      effect: 'slow', say: 'NO HAY ERRORES, SOLO ACCIDENTES FELICES' },
    quotes: ['NO PERDISTE, TUVISTE UN ACCIDENTE FELIZ.', 'UN ARBOLITO AQUÍ, UN MORETÓN ALLÁ.',
             'HOY PINTAMOS UNA NUBECITA. Y TU DERROTA.'],
    taunt: 'TODO TIENE ARREGLO'
  },

  {
    id: 'roca', name: 'LA ROCA', short: 'LA ROCA', real: 'EL DE LA CEJA',
    title: '¿HUELES ESO?', type: 'roca', sub: 'CEJA',
    bio: 'DESAYUNA MÁS CALORÍAS QUE TÚ EN UNA SEMANA. Y LEVANTA UNA CEJA.',
    speed: 1.05, power: 1.30,
    pal: { s: '#b0774a', S: '#8a5a34', k: '#181818', m: '#7a3b3b' },
    head: ['............', '...ssssss...', '..ssssssss..', '.ssssssssss.',
           '.sssssskkss.', '.skksssksss.', '.ssssssssss.', '.sssmmmmsss.',
           '.ssssssssss.', '..ssssssss..', '...SSSSSS...', '....ssss....'],
    body: { style: 'tee', main: '#22252f', dark: '#141620', light: '#b0774a', accent: '#c9a06d', skin: '#b0774a', bulk: true },
    special: { name: 'CEJA LEVANTADA', cost: 30, kind: 'projectile', dmg: 8,
      speed: 2.2, art: 'ceja', oy: -34, life: 120, effect: 'slow', say: '¿HUELES LO QUE ESTOY COCINANDO?' },
    superMove: { name: 'CODAZO DEL PUEBLO', cost: 100, kind: 'dash', dmg: 14, hits: 2, speed: 4.0, dur: 32,
      say: '¡ESTO VA POR EL PUEBLO!' },
    quotes: ['¿SABES LO QUE ESTABA COCINANDO? ESTO.', 'LEVANTÉ UNA CEJA Y TE CAÍSTE SOLO.',
             'NO ERES DEMASIADO PEQUEÑO. SOY YO, QUE SOY ENORME.'],
    taunt: '¿HUELES ESO?'
  },

  {
    id: 'zuck', name: 'ZUCK-BOT', short: 'ZUCK', real: 'EL DE LA RED',
    title: 'HUMANO VERIFICADO', type: 'algoritmo', sub: 'CAPTCHA',
    bio: 'JURA QUE ES UNA PERSONA. TIENE TODOS TUS DATOS PARA DEMOSTRARLO.',
    speed: 1.18, power: 0.95,
    pal: { s: '#f0e4dc', S: '#c9bdb4', h: '#8a6a44', c: '#48e0d0', k: '#3a4560' },
    head: ['............', '..hhhhhhhh..', '.hhhhhhhhhh.', '.hhhhhhhhhh.',
           '.ssssssssss.', '.scssscssss.', '.ssssssssss.', '.sskkkkkkss.',
           '.ssssssssss.', '..ssssssss..', '...ssssss...', '....ssss....'],
    body: { style: 'tee', main: '#5a6478', dark: '#3a4560', light: '#8d97ad', accent: '#48e0d0', skin: '#f0e4dc' },
    special: { name: 'VERIFICA QUE NO ERES UN ROBOT', cost: 30, kind: 'projectile', dmg: 9, count: 2, spread: 0.3,
      speed: 3.4, art: 'captcha', oy: -30, life: 120, effect: 'slow', say: 'SELECCIONA TODOS LOS SEMÁFOROS' },
    superMove: { name: 'NUEVOS TÉRMINOS Y CONDICIONES', cost: 100, kind: 'rain', dmg: 9, count: 8, art: 'doc',
      say: 'ACEPTAR O ACEPTAR' },
    quotes: ['HE ACEPTADO LOS TÉRMINOS DE TU DERROTA.', 'TU PARTIDA SE GUARDÓ. Y SE VENDIÓ.',
             'ESTO ES LO QUE UN HUMANO NORMAL DIRÍA AHORA.'],
    taunt: 'ESTOY OPTIMIZANDO'
  }
];

const byId = id => ROSTER.find(c => c.id === id);

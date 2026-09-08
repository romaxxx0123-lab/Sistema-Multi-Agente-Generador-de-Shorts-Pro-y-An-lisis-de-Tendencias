/* =========================================================
   types.js — tipos estilo Pokémon, sacados de la vida real.
   Los iconos son pixeles propios (nada de emojis del sistema).
   ========================================================= */

const TICONS = {
  dinero: { pal: { g: '#3fa14a', G: '#7ede78', k: '#123a17' },
    rows: ['.......', 'ggggggg', 'gGGGGGg', 'gGkkkGg', 'gGGGGGg', 'ggggggg', '.......'] },
  cohete: { pal: { r: '#e0343c', w: '#f2f2ef', y: '#f5c542', d: '#8d97ad' },
    rows: ['...w...', '..wrw..', '..wrw..', '..www..', '.d.w.d.', '..y.y..', '...y...'] },
  futbol: { pal: { w: '#f2f2ef', k: '#1a1a1a' },
    rows: ['..www..', '.wkwkw.', 'wwwkwww', 'wkwwwkw', 'wwwkwww', '.wkwkw.', '..www..'] },
  ego: { pal: { y: '#f5c542', o: '#c08a10' },
    rows: ['.......', 'y.y.y.y', 'yyyyyyy', 'yyyyyyy', '.ooooo.', '.......', '.......'] },
  cocina: { pal: { r: '#e0343c', y: '#f5c542', w: '#fff2a8' },
    rows: ['...r...', '..ry...', '.ryyr..', 'ryyyyr.', 'ryywyr.', '.ryyr..', '..rr...'] },
  oleo: { pal: { b: '#8d5ad4', l: '#d7dbe6', p: '#f07ac0', d: '#6b4a2a' },
    rows: ['.....bb', '....bb.', '...dd..', '..dd...', '.ll....', 'pp.....', 'p......'] },
  roca: { pal: { d: '#5a5044', l: '#9a8c78' },
    rows: ['.......', '..ddd..', '.dllld.', 'dlllldd', 'dllddld', '.ddddd.', '.......'] },
  algoritmo: { pal: { a: '#8d97ad', c: '#48e0d0', k: '#101726' },
    rows: ['..a.a..', '.aaaaa.', 'accccca', 'ackckca', 'accccca', '.accca.', '..a.a..'] }
};

const TYPES = {
  dinero:    { name: 'DINERO',    color: '#3fa14a', tag: 'NO COMPRA LA FELICIDAD PERO SÍ EL RING' },
  cohete:    { name: 'COHETE',    color: '#e0343c', tag: 'DESPEGA. A VECES INCLUSO ATERRIZA' },
  futbol:    { name: 'FÚTBOL',    color: '#8ee0f0', tag: 'LA ZURDA ES UN ARMA REGISTRADA' },
  ego:       { name: 'EGO',       color: '#f5c542', tag: 'SE ESCUCHA DESDE EL ESPACIO' },
  cocina:    { name: 'COCINA',    color: '#f0932b', tag: 'TODO ESTÁ CRUDO. SIEMPRE' },
  oleo:      { name: 'ÓLEO',      color: '#9bb7f0', tag: 'AQUÍ NO HAY ERRORES, HAY ACCIDENTES' },
  roca:      { name: 'ROCA',      color: '#c9a06d', tag: 'PESA MÁS QUE TUS PROBLEMAS' },
  algoritmo: { name: 'ALGORITMO', color: '#48e0d0', tag: 'ACEPTA LOS TÉRMINOS Y CONDICIONES' }
};

/* fuerte x1.4 · débil x0.7 (tabla simétrica) */
const CHART = {
  dinero:    { strong: ['algoritmo', 'cocina'],          weak: ['futbol', 'oleo'] },
  cohete:    { strong: ['ego', 'roca'],                  weak: ['oleo', 'futbol'] },
  futbol:    { strong: ['dinero', 'ego', 'cohete'],      weak: ['roca', 'algoritmo'] },
  ego:       { strong: ['cocina', 'algoritmo'],          weak: ['cohete', 'futbol'] },
  cocina:    { strong: ['oleo', 'algoritmo'],            weak: ['dinero', 'ego', 'roca'] },
  oleo:      { strong: ['dinero', 'cohete', 'roca'],     weak: ['cocina', 'algoritmo'] },
  roca:      { strong: ['cocina', 'futbol'],             weak: ['cohete', 'oleo', 'algoritmo'] },
  algoritmo: { strong: ['futbol', 'oleo', 'roca'],       weak: ['dinero', 'ego', 'cocina'] }
};

/* el chiste de cada cruce */
const REASONS = {
  'dinero>algoritmo': 'COMPRÓ LA RED SOCIAL ENTERA',
  'dinero>cocina':    'COMPRÓ EL RESTAURANTE',
  'cohete>ego':       'EL EGO NO LLEGA A MARTE',
  'cohete>roca':      'DESPEGA CON TODO Y PIEDRA',
  'futbol>dinero':    'ESO NO SE COMPRA (CASI)',
  'futbol>ego':       'LOS TÍTULOS CALLAN BOCAS',
  'futbol>cohete':    'LO BAJÓ DE UN CABEZAZO',
  'ego>cocina':       'GRITÓ MÁS FUERTE QUE EL CHEF',
  'ego>algoritmo':    'NINGÚN ALGORITMO LO ENTIENDE',
  'cocina>oleo':      'EL FUEGO SE COMIÓ EL LIENZO',
  'cocina>algoritmo': 'NINGUNA IA SABE SAZONAR',
  'oleo>dinero':      'EL ARTE NO SE PAGA EN CASH',
  'oleo>cohete':      'LE PINTÓ UNA NUBECITA',
  'oleo>roca':        'LE PINTÓ UN BIGOTE',
  'roca>cocina':      'SE COMIÓ LA COCINA ENTERA',
  'roca>futbol':      'NADIE LE REGATEA A ESE SEÑOR',
  'algoritmo>futbol': 'LO ANULÓ EL VAR',
  'algoritmo>oleo':   'LA IA YA LO PINTÓ',
  'algoritmo>roca':   'LE CANCELÓ LA PELÍCULA'
};

/* excusa del que aguanta el golpe */
const RESIST = {
  dinero:    'TIENE ABOGADOS PARA ESTO',
  cohete:    'ESO LO ARREGLA UNA ACTUALIZACIÓN',
  futbol:    'SE TIRÓ, PERO NO ERA FALTA',
  ego:       'LE RESBALÓ POR EL EGO',
  cocina:    'LO DEVOLVIÓ A LA COCINA',
  oleo:      'FUE UN ACCIDENTE FELIZ',
  roca:      '¿EN SERIO LE PEGAS A ESE SEÑOR?',
  algoritmo: 'ERROR 403: GOLPE NO AUTORIZADO'
};

function typeMult(a, d) {
  const c = CHART[a];
  if (!c || !TYPES[d]) return { m: 1, kind: 'normal', msg: '' };
  if (c.strong.indexOf(d) >= 0) return { m: 1.4, kind: 'super', msg: REASONS[a + '>' + d] || '¡LE VINO FATAL!' };
  if (c.weak.indexOf(d) >= 0) return { m: 0.7, kind: 'weak', msg: RESIST[d] || 'CASI NI LO SINTIÓ' };
  return { m: 1, kind: 'normal', msg: '' };
}

function matchupParts(a, b) {
  const ta = TYPES[a], tb = TYPES[b];
  const ab = typeMult(a, b), ba = typeMult(b, a);
  if (ab.kind === 'super' && ba.kind === 'super') return { tag: 'SE PEGAN FUERTE LOS DOS', msg: ab.msg };
  if (ab.kind === 'super') return { tag: 'VENTAJA ' + ta.name, msg: ab.msg };
  if (ba.kind === 'super') return { tag: 'VENTAJA ' + tb.name, msg: ba.msg };
  if (ab.kind === 'weak' && ba.kind === 'weak') return { tag: 'SE RESISTEN', msg: 'ESTO VA PARA LARGO' };
  if (ab.kind === 'weak') return { tag: tb.name + ' AGUANTA', msg: ab.msg };
  if (ba.kind === 'weak') return { tag: ta.name + ' AGUANTA', msg: ba.msg };
  return { tag: 'SIN VENTAJAS DE TIPO', msg: 'QUE GANE EL MÁS RIDÍCULO' };
}

/* versión de una línea, para el pie de pantalla y el comentarista */
function matchupLine(a, b) {
  const p = matchupParts(a, b);
  return p.msg;
}

/* dibuja el icono del tipo (7x7) */
function drawTypeIcon(ctx, id, x, y) {
  const ic = TICONS[id];
  if (ic) Pix.grid(ctx, ic.rows, ic.pal, x, y);
}

/* icono + nombre del tipo, devuelve el ancho ocupado */
function drawTypeTag(ctx, id, x, y, scale) {
  const t = TYPES[id];
  drawTypeIcon(ctx, id, x, y - 1);
  Text.draw(ctx, t.name, x + 9, y, t.color, 'left', scale || 1);
  return 9 + Text.w(t.name, scale || 1);
}

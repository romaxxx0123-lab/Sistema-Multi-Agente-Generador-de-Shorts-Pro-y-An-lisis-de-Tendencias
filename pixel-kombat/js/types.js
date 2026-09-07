/* =========================================================
   types.js — sistema de TIPOS estilo Pokémon, pero absurdo
   Cada luchador tiene un tipo principal (que afecta al daño)
   y un subtipo que existe solo para el chiste.
   ========================================================= */

const TYPES = {
  dinero:  { name: 'DINERO',  icon: '💵', color: '#3fa14a', tag: 'no compra la felicidad, pero sí el ring' },
  chancla: { name: 'CHANCLA', icon: '🩴', color: '#8d5ad4', tag: 'arma ancestral de puntería infalible' },
  zen:     { name: 'ZEN',     icon: '🧘', color: '#48e0d0', tag: 'no pelea, deja que la pelea pase' },
  aereo:   { name: 'AÉREO',   icon: '🕊️', color: '#9fb6d9', tag: 'todo lo que vuela y ensucia autos' },
  senal:   { name: 'SEÑAL',   icon: '📶', color: '#3ba3e0', tag: 'cinco barras de nada' },
  fibra:   { name: 'FIBRA',   icon: '🥦', color: '#7ec850', tag: 'nutritivo e innecesariamente agresivo' },
  electro: { name: 'ELECTRO', icon: '🔌', color: '#c9cfdd', tag: 'con garantía de 6 meses' },
  sushi:   { name: 'SUSHI',   icon: '🍣', color: '#f07a86', tag: 'frío, crudo y con actitud' }
};

/* fuerte = x1.4 · débil = x0.7 (la tabla es simétrica) */
const CHART = {
  dinero:  { strong: ['senal', 'electro'],           weak: ['chancla', 'zen', 'fibra'] },
  chancla: { strong: ['dinero', 'sushi', 'zen'],     weak: ['aereo', 'senal'] },
  zen:     { strong: ['dinero', 'electro'],          weak: ['chancla', 'senal'] },
  aereo:   { strong: ['chancla', 'fibra'],           weak: ['sushi', 'electro'] },
  senal:   { strong: ['zen', 'chancla'],             weak: ['dinero', 'electro'] },
  fibra:   { strong: ['electro', 'dinero'],          weak: ['aereo', 'sushi'] },
  electro: { strong: ['senal', 'sushi', 'aereo'],    weak: ['fibra', 'zen', 'dinero'] },
  sushi:   { strong: ['aereo', 'fibra'],             weak: ['chancla', 'electro'] }
};

/* el chiste de por qué un tipo le gana a otro */
const REASONS = {
  'dinero>senal':   'PAGÓ EL PLAN PREMIUM',
  'dinero>electro': 'LO COMPRÓ AL CONTADO',
  'chancla>dinero': 'LA CHANCLA NO ACEPTA SOBORNOS',
  'chancla>sushi':  '¡BÁJATE DE LA MESA!',
  'chancla>zen':    'ADIÓS A LA PAZ INTERIOR',
  'zen>dinero':     'LA FELICIDAD NO SE COMPRA',
  'zen>electro':    'EL RUIDO NO LE AFECTA',
  'aereo>chancla':  'LA CHANCLA NO LLEGA TAN ALTO',
  'aereo>fibra':    'SE COMIÓ TODA LA HUERTA',
  'senal>zen':      '17 NOTIFICACIONES NUEVAS',
  'senal>chancla':  'LA ABUELA NO SABE USAR EL ROUTER',
  'fibra>electro':  'ATASCÓ LAS ASPAS',
  'fibra>dinero':   'LA SALUD NO SE COMPRA',
  'electro>senal':  'INTERFERENCIA DEL MICROONDAS',
  'electro>sushi':  'MAKI LICUADO',
  'electro>aereo':  'PLUMAS EN LAS ASPAS',
  'sushi>aereo':    'EL GATO CAZA PALOMAS',
  'sushi>fibra':    'VERDURA EN JULIANA'
};

/* por qué a un tipo le resbala el golpe */
const RESIST = {
  dinero:  'EL DINERO LO ABSORBE TODO',
  chancla: 'LA CHANCLA AGUANTA LO QUE SEA',
  zen:     'RESPIRÓ HONDO Y SE LE PASÓ',
  aereo:   'HUESOS HUECOS, NO SIENTE NADA',
  senal:   'SE PERDIÓ EL PAQUETE',
  fibra:   'ES PURA AGUA Y FIBRA',
  electro: 'GARANTÍA EXTENDIDA',
  sushi:   'LO ESQUIVÓ COMO GATO'
};

/* Devuelve {m, kind, msg} para un ataque de tipo a contra tipo d */
function typeMult(a, d) {
  const c = CHART[a];
  if (!c || !TYPES[d]) return { m: 1, kind: 'normal', msg: '' };
  if (c.strong.indexOf(d) >= 0) return { m: 1.4, kind: 'super', msg: REASONS[a + '>' + d] || '¡LE VINO FATAL!' };
  if (c.weak.indexOf(d) >= 0) return { m: 0.7, kind: 'weak', msg: RESIST[d] || 'CASI NI LO SINTIÓ' };
  return { m: 1, kind: 'normal', msg: '' };
}

/* Resumen del cruce para la pantalla VS */
function matchupLine(a, b) {
  const ta = TYPES[a], tb = TYPES[b];
  const ab = typeMult(a, b), ba = typeMult(b, a);
  if (ab.kind === 'super' && ba.kind === 'super')
    return '¡SE PEGAN FUERTE LOS DOS! ' + ab.msg + ' Y ADEMÁS ' + ba.msg;
  if (ab.kind === 'super') return 'VENTAJA ' + ta.icon + ' ' + ta.name + ': ' + ab.msg;
  if (ba.kind === 'super') return 'VENTAJA ' + tb.icon + ' ' + tb.name + ': ' + ba.msg;
  if (ab.kind === 'weak' && ba.kind === 'weak') return 'SE RESISTEN MUTUAMENTE: ESTO VA PARA LARGO';
  if (ab.kind === 'weak') return tb.icon + ' ' + tb.name + ' AGUANTA: ' + ab.msg;
  if (ba.kind === 'weak') return ta.icon + ' ' + ta.name + ' AGUANTA: ' + ba.msg;
  return 'SIN VENTAJAS DE TIPO: QUE GANE EL MÁS RIDÍCULO';
}

/* chip HTML para menus y HUD */
function typeChip(id, small) {
  const t = TYPES[id];
  if (!t) return '';
  return '<span class="chip' + (small ? ' sm' : '') + '" style="--c:' + t.color + '">' +
    t.icon + ' ' + t.name + '</span>';
}

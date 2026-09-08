/* =========================================================
   interactions.js — cruces escritos entre personajes.
   Cuando pasa algo entre dos concretos, se dicen lo suyo.
   ========================================================= */
const DUELOS = {
  /* ---- ¡NO HAY PLATA! anula lo que el otro haya lanzado ---- */
  'peluca|trumpo':   { nullify: ['¡NO HAY PLATA!', '¡ESO ES SOCIALISMO!'] },
  'peluca|musko':    { nullify: ['NO FINANCIO COHETES', 'LO PAGO YO, TRANQUILO'] },
  'peluca|bob':      { nullify: ['EL ARTE NO SE SUBVENCIONA', 'PERO SI ERA GRATIS...'] },
  'peluca|zuck':     { nullify: ['CORTAMOS LOS SERVIDORES', 'ESO VIOLA LOS TÉRMINOS'] },
  'peluca|albertito':{ nullify: ['NI UN PESO PARA CIENCIA', 'ERROR DE CÁLCULO GRAVE'] },
  'peluca|shakira':  { nullify: ['LA GIRA NO SE SUBVENCIONA', 'YO ME LA PAGO SOLA'] },

  /* ---- el Dibu ataja lo que le tiren ---- */
  'dibu|pulga':      { catch: ['PERDÓN LEO', 'DALE DIBU, SOLTALA'] },
  'dibu|trumpo':     { catch: ['ESTA PLATA ES MÍA', '¡ESO ES ROBO!'] },
  'dibu|musko':      { catch: ['ATAJÉ UN COHETE', 'IMPOSIBLE, ERA BALÍSTICO'] },
  'dibu|albertito':  { catch: ['LA FÓRMULA AL CÓRNER', 'ESTADÍSTICAMENTE IMPOSIBLE'] },
  'dibu|peluca':     { catch: ['TRANQUILO, PRESIDENTE', 'ESE SÍ ES GASTO ÚTIL'] },

  'peluca|mustang':  { nullify: ['ESO ES GASTO PÚBLICO', 'SOY PRIVADO, SEÑOR'] },
  'peluca|michael':  { nullify: ['LA CULTURA NO SE PAGA', 'PUES BAILO GRATIS'] },

  /* ---- el Dibu ataja lo que le tiren ---- */
  'dibu|michael':    { catch: ['ESA LA VEÍA VENIR', 'IBA AL COMPÁS'] },
  'dibu|chad':       { catch: ['A ESE LO ATAJO IGUAL', 'NO.'] },

  /* ---- la POSE del Chad: no bloquea, devuelve ---- */
  'chad|trumpo':     { nullify: ['ESO NO SE COMPRA', '¡TODO SE COMPRA!'] },
  'chad|musko':      { nullify: ['NO.', 'ERA UN PROTOTIPO'] },
  'chad|zuck':       { nullify: ['NO SOY UN ROBOT', 'VERIFICACIÓN FALLIDA'] },
  'chad|cresta':     { nullify: ['TE ESCUCHO', 'PUES ESCUCHA MÁS'] },
  'chad|shakira':    { nullify: ['SÍ.', '¿ESO ES UN SÍ?'] },
  'chad|michael':    { nullify: ['BUEN SOMBRERO', 'GRACIAS, HOMBRE'] },
  'chad|mustang':    { nullify: ['BONITO COCHE', 'NO ESTOY EN VENTA'] },

  /* ---- proyectiles que chocan en el aire ---- */
  'trumpo|zuck':     { clash: ['MI DINERO CONTRA TUS DATOS', 'LOS DATOS VALEN MÁS'] },
  'musko|albertito': { clash: ['LLEGO A MARTE ANTES QUE VOS', 'YO ESCRIBÍ ESAS ECUACIONES'] },
  'mustang|pulga':   { clash: ['¡CUIDADO CON LA PELOTA!', '¡ESA ERA MÍA!'] },
  'michael|shakira': { clash: ['ESTO ES UN DUELO DE BAILE', 'ENTONCES PON MÚSICA'] },
  'michael|zuck':    { clash: ['ESE PASO NO LO CLASIFICAS', 'CATEGORÍA: DESCONOCIDA'] },
  'mustang|trumpo':  { clash: ['NO ESTOY EN VENTA', 'TODO TIENE PRECIO'] },
  'chad|roca':       { clash: ['PRIMO.', 'PRIMO.'] },
  'mustang|albertito': { clash: ['ESTO ES FÍSICA APLICADA', 'ESO ES UN CHOQUE, NO FÍSICA'] }
};

/* devuelve el par de frases para un cruce concreto, si existe */
function dueloLines(a, b, ev) {
  const d = DUELOS[a.def.id + '|' + b.def.id];
  if (d && d[ev]) return d[ev];
  const r = DUELOS[b.def.id + '|' + a.def.id];
  if (r && r[ev]) return [r[ev][1], r[ev][0]];
  return null;
}

/* =========================================================
   Emotes: lo que "dice" cada uno se ve como un icono sobre
   la cabeza y se oye con su voz. Nada de bocadillos con texto.
   ========================================================= */
const EMOTES = {
  golpe:  { pal: { y: '#ffd24a', w: '#ffffff' },
    rows: ['...y....', '.y.y.y..', '..yyy...', 'yyywyyy.', '..yyy...', '.y.y.y..', '...y....', '........'] },
  dolor:  { pal: { c: '#8ee0f0', w: '#ffffff' },
    rows: ['...c....', '..ccc...', '..ccc...', '.ccccc..', '.ccwcc..', '.ccccc..', '..ccc...', '........'] },
  escudo: { pal: { b: '#5a8fd8', w: '#ffffff' },
    rows: ['.bbbbbb.', 'bbwwwwbb', 'bbwbbwbb', 'bbwwwwbb', '.bbwwbb.', '..bbbb..', '...bb...', '........'] },
  chulo:  { pal: { k: '#1a1a1a', w: '#8ee0f0' },
    rows: ['........', 'kkkkkkkk', 'kwwkkwwk', 'kwwkkwwk', '.kk..kk.', '........', '........', '........'] },
  alerta: { pal: { r: '#ff4d5a' },
    rows: ['...rr...', '...rr...', '...rr...', '...rr...', '...rr...', '........', '...rr...', '........'] },
  corona: { pal: { y: '#ffcc33' },
    rows: ['........', 'y..y..y.', 'yy.y.yy.', 'yyyyyyy.', 'yyyyyyy.', '.yyyyy..', '........', '........'] },
  anula:  { pal: { r: '#ff4d5a', w: '#ffffff' },
    rows: ['..rrrr..', '.r...wr.', 'r...ww.r', 'r..ww..r', 'r.ww...r', '.rww..r.', '..rrrr..', '........'] },
  guante: { pal: { g: '#c9f542', w: '#ffffff' },
    rows: ['.gg.gg..', 'ggggggg.', 'ggggggg.', 'ggggggg.', '.gggggg.', '..ggggg.', '..ggg...', '........'] },
  burla:  { pal: { k: '#1a1a1a', p: '#f07a86' },
    rows: ['..kk.kk.', '........', '.kkkkkk.', '.kppppk.', '..pppp..', '...pp...', '........', '........'] },
  duda:   { pal: { w: '#f2ecff' },
    rows: ['..wwww..', '.ww..ww.', '.....ww.', '...www..', '...ww...', '........', '...ww...', '........'] }
};

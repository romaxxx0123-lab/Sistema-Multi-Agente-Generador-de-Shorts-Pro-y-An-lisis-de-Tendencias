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
  'peluca|ramses':   { nullify: ['NO HAY PLATA PARA CENAR', '¡ENTONCES ESTÁ CRUDO!'] },
  'peluca|albertito':{ nullify: ['NI UN PESO PARA CIENCIA', 'ERROR DE CÁLCULO GRAVE'] },
  'peluca|shakira':  { nullify: ['LA GIRA NO SE SUBVENCIONA', 'YO ME LA PAGO SOLA'] },

  /* ---- el Dibu ataja lo que le tiren ---- */
  'dibu|pulga':      { catch: ['PERDÓN LEO', 'DALE DIBU, SOLTALA'] },
  'dibu|siuuu':      { catch: ['MIRÁ QUE TE LO ATAJO', 'ESO FUE SUERTE'] },
  'dibu|trumpo':     { catch: ['ESTA PLATA ES MÍA', '¡ESO ES ROBO!'] },
  'dibu|musko':      { catch: ['ATAJÉ UN COHETE', 'IMPOSIBLE, ERA BALÍSTICO'] },
  'dibu|ramses':     { catch: ['ESTE PLATO ES MÍO', '¡DEVUÉLVEMELO!'] },
  'dibu|albertito':  { catch: ['LA FÓRMULA AL CÓRNER', 'ESTADÍSTICAMENTE IMPOSIBLE'] },
  'dibu|peluca':     { catch: ['TRANQUILO, PRESIDENTE', 'ESE SÍ ES GASTO ÚTIL'] },

  /* ---- proyectiles que chocan en el aire ---- */
  'trumpo|zuck':     { clash: ['MI DINERO CONTRA TUS DATOS', 'LOS DATOS VALEN MÁS'] },
  'musko|albertito': { clash: ['MI COHETE ES MEJOR', 'YO ESCRIBÍ ESAS ECUACIONES'] },
  'ramses|bob':      { clash: ['¡SACA ESO DE MI COCINA!', 'LE DABA COLOR AL PLATO'] },
  'pulga|siuuu':     { clash: ['TIRÁ AL ARCO', 'MÍO ES MEJOR'] }
};

/* devuelve el par de frases para un cruce concreto, si existe */
function dueloLines(a, b, ev) {
  const d = DUELOS[a.def.id + '|' + b.def.id];
  if (d && d[ev]) return d[ev];
  const r = DUELOS[b.def.id + '|' + a.def.id];
  if (r && r[ev]) return [r[ev][1], r[ev][0]];
  return null;
}

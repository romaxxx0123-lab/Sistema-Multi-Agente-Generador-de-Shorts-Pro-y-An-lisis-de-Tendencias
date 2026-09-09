/* =========================================================
   render.js — luchadores y escenarios.
   Los cuerpos se montan por piezas, se les calca una silueta
   oscura alrededor y luego se rellenan con luz y sombra.
   ========================================================= */

const OUTLINE = '#14101e';

/* claridad de un color, para decidir si un detalle se va a ver o no */
function lum(c) {
  const n = parseInt(c.slice(1), 16);
  return ((n >> 16 & 255) * 0.30 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) / 255;
}

/* perfil del coche con contorno, calculado una sola vez */
function sideOf(def) {
  if (!def._side) {
    def._side = outlineGrid(def.side, '#');
    def._sidePal = Object.assign({ '#': OUTLINE }, def.sidePal);
  }
  return def;
}

/* rejilla de cabeza con contorno, calculada una sola vez */
function headOf(def) {
  if (!def._head) {
    def._head = outlineGrid(def.head, '#');
    def._pal = Object.assign({ '#': OUTLINE }, def.pal);
  }
  return def;
}

/* Duelo espejo: el jugador 2 pelea con otra paleta, como en las
   recreativas. La piel no cambia; sí la ropa y el pelo. */
function mirrorDef(def) {
  const sw = c => (typeof c === 'string' && c[0] === '#') ? mix(c, '#8d5ad4', 0.45) : c;
  const body = {};
  for (const k in def.body) body[k] = sw(def.body[k]);
  const pal = {};
  for (const k in def.pal) pal[k] = (k === 's' || k === 'S' || k === 'L') ? def.pal[k] : sw(def.pal[k]);
  const out = Object.assign({}, def, { body, pal });
  out._head = undefined; out._pal = undefined;
  return out;
}

/* ---------------------------------------------------------
   Piezas del cuerpo: devuelve rectángulos en coordenadas
   locales (pies en 0,0 mirando a la derecha).
   --------------------------------------------------------- */
function bodyRects(def, A) {
  const B = def.body;
  if (A.baby) return babyRects(B);
  if (B.kind === 'car') return carRects(B, A);
  const legC = B.legs || B.main, legD = B.legsDark || B.dark;
  const skin = B.skin;
  const aw = B.huge ? 11 : (B.bulk ? 8 : 6);     // grosor de brazo
  const R = [];
  const add = (x, y, w, h, c) => R.push({ x, y, w, h, c });
  /* cápsula: segmento grueso que se estrecha, con extremos redondos.
     Es lo que convierte dos ladrillos apilados en un brazo. */
  const cap = (x0, y0, x1, y1, r0, r1, c, d) => R.push({ k: 'c', x0, y0, x1, y1, r0, r1, c, d });
  const ell = (cx, cy, rx, ry, c, d) => R.push({ k: 'e', cx, cy, rx, ry, c, d });
  /* detalle: se pinta plano y sin contorno, por encima de la forma madre */
  const ellD = (cx, cy, rx, ry, c) => R.push({ k: 'e', det: 1, cx, cy, rx, ry, c });
  const addD = (x, y, w, h, c) => R.push({ det: 1, x, y, w, h, c });

  const cr = A.crouch;                          // 0..12
  const lean = A.lean || 0;                     // peso del cuerpo
  const lx = Math.round(lean);
  const sh = B.huge ? -8 : (B.short ? 4 : (B.tall ? -4 : 0));   // bajitos y armarios
  /* bw ensancha todo el esqueleto: es lo que separa a un armario del
     resto del elenco. Sin esto, "grande" era solo un par de píxeles. */
  const bw = B.huge ? 5 : 0;
  const CX = -11 - bw, CW = 22 + bw * 2;        // pecho
  const SX = -14 - bw * 2, SW = 27 + bw * 4;    // hombros
  const HX = -9 - Math.round(bw / 2), HW = 19 + bw;   // cadera, más estrecha que el pecho
  const AXB = -14 - bw * 2, AXF = 7 + bw;       // dónde nacen los brazos
  const shinH = 15 - cr * 0.5 - sh, thighH = 16 - cr * 0.6 - sh;
  const hipY = -(shinH + thighH);
  const hipH = 10;
  const chestH = 17;
  const chestY = hipY - hipH - chestH + (A.bob || 0);
  const shY = chestY - 7;
  const neckY = shY - 4;
  const boot = B.boot || tint(legD, -0.5);
  const bootF = B.boot || tint(legC, -0.42);   // el otro pie

  /* ---- piernas ---- */
  if (A.kick > 0) {
    const rM = (9 + bw) / 2, rK = (7.4 + bw) / 2, rT = (5.4 + bw) / 2;
    cap(-5.5, hipY + 1, -6, hipY + thighH, rM, rK, legD, -1);
    cap(-6, hipY + thighH - 1, -6.5, -5, rK, rT, legD, -1);
    cap(-7.5, -3, -2.5, -3, 3.2, 2.6, boot, -1);
    const ky = A.kickHigh ? chestY + 8 : hipY + 11;
    const kl = 10 + 22 * A.kick;
    cap(0, ky - 4, kl * 0.55, ky - 1, rM, rK, legC, 1);       // muslo que sube
    cap(kl * 0.55, ky - 1, kl, ky, rK, rT, legC, 1);          // gemelo estirado
    /* la bota era un pegote oscuro del tamaño de la pantorrilla: ahora
       tiene empeine claro y suela, que es lo que la hace zapato */
    cap(kl, ky - 0.5, kl + 5, ky + 0.5, 3.0, 2.4, bootF, 1);
    ellD(kl + 1.5, ky - 1.5, 2.6, 1.1, tint(bootF, 0.30));    // empeine
    addD(Math.round(kl + 1), Math.round(ky + 2), 6, 1, tint(bootF, -0.35));   // suela
  } else if (A.air) {
    const rM = (9 + bw) / 2, rK = (7.4 + bw) / 2, rT = (5.4 + bw) / 2;
    cap(-5, hipY + 6, -9, hipY + thighH + 4, rM, rK, legD, -1);
    cap(-9, hipY + thighH + 4, -11, hipY + thighH + shinH, rK, rT, legD, -1);
    cap(-13, hipY + thighH + shinH + 1, -8, hipY + thighH + shinH + 1, 3.2, 2.6, boot, -1);
    cap(6, hipY + 1, 7, hipY + thighH - 1, rM, rK, legC, 1);
    cap(7, hipY + thighH - 1, 6, hipY + thighH + shinH - 6, rK, rT, legC, 1);
    cap(4, hipY + thighH + shinH - 5, 9, hipY + thighH + shinH - 5, 3.2, 2.6, bootF, 1);
  } else {
    /* las dos piernas dejan un hueco en medio: sin él el cuerpo
       se lee como un bloque y no como alguien de pie */
    /* Piernas de verdad: muslo grueso que se afina en la rodilla,
       gemelo que se afina en el tobillo y un pie redondeado. Antes eran
       tres cajas apiladas con un escalón entre cada una. */
    const sw = Math.round(Math.sin(A.walk) * 5);
    const rM = (9 + bw) / 2, rK = (7.4 + bw) / 2, rT = (5.4 + bw) / 2;
    pierna(-5.5 - bw / 2 - sw, legD, -1);
    pierna(5.5 + bw / 2 + sw, legC, 1);
    function pierna(cx, col, d) {
      cap(cx, hipY + 1, cx + d * 0.5, hipY + thighH, rM, rK, col, d);
      cap(cx + d * 0.5, hipY + thighH - 1, cx + d * 0.8, -5, rK, rT, col, d);
      const bc = d > 0 ? bootF : boot;
      cap(cx + d * 0.8 - 1, -3, cx + d * 0.8 + 4, -3, 3.2, 2.6, bc, d);  // pie
    }
  }

  /* ---- tronco ---- */
  /* El torso no es una caja. Terminaba en escuadra justo encima de la
     cadera, y ese escalón es media parte de lo que hacía que el cuerpo
     pareciera montado a piezas. Se le redondea el bajo. */
  const pecho = (c) => {
    add(CX + lx, chestY, CW, chestH - 3, c);
    cap(CX + 3 + lx, chestY + chestH - 3, CX + CW - 3 + lx, chestY + chestH - 3, 3, 3, c, 1);
  };
  /* Y la cadera tampoco. Un rectángulo plano entre las dos piernas se lee
     como un pañal, y eso es justo lo que parecía. Ahora es una cintura
     estrecha que se abre en dos lóbulos, uno por pierna, con la
     entrepierna marcada en medio. */
  const hlx = lean * 0.4, hipW = HW / 2;
  const wW = Math.round(hipW - 2.4);           // semiancho a la altura del cinturón
  const cadera = (c0, dy) => {
    /* si el pantalón y la pierna son casi el mismo gris, la mitad de
       abajo se lee como un bloque sin forma: se separan a la fuerza */
    const c = Math.abs(lum(c0) - lum(legD)) > 0.10 ? c0
      : tint(c0, lum(c0) > 0.5 ? -0.26 : 0.30);
    const y = dy || 0, wy = hipY - hipH + 2.4 + y;
    cap(hlx - hipW + 2.4, wy, hlx + hipW - 2.4, wy, 2.4, 2.4, c, 1);
    cap(hlx - 2.2, wy, hlx - hipW + 4.7, hipY - 0.5 + y, 3.9, 4.7, c, -1);
    cap(hlx + 2.2, wy, hlx + hipW - 4.7, hipY - 0.5 + y, 3.9, 4.7, c, 1);
  };
  cadera(tint(B.main, -0.10));
  if (B.huge) {                                  // la V del culturista
    add(CX + lean * 0.7, chestY, CW, 7, B.main);
    add(CX + 3 + lean * 0.7, chestY + 7, CW - 6, 6, B.main);
    add(CX + 6 + lean * 0.7, chestY + 13, CW - 12, chestH - 13, B.main);
  } else pecho(B.main);
  /* hombros con los extremos redondos: cuadrados leen a robot */
  cap(SX + 4 + lean, shY + 4, SX + SW - 4 + lean, shY + 4, 4.2, 4.2, tint(B.main, 0.08), 1);
  add(CX + lean, shY, CW, 1, tint(B.main, 0.20));
  cap(lean, neckY + 1, lean, neckY + 5, 3.6, 4.2, tint(skin, -0.12), 1);   // cuello
  if (B.huge) {          // trapecios: suben en rampa del hombro al cuello
    add(SX + 3 + lean, shY, SW - 6, 3, tint(skin, -0.08));
    add(-13 + lean, neckY + 3, 26, 4, tint(skin, -0.03));
    add(-9 + lean, neckY, 18, 4, tint(skin, 0.05));
    add(-5 + lean, neckY, 10, 2, tint(skin, -0.14));   // hueco del cuello
  }

  const st = B.style;
  if (st === 'suit') {
    add(-6 + lx, shY + 1, 12, 6, B.light);              // cuello de la camisa
    add(-4 + lx, shY + 2, 8, 15, B.light);              // pechera, solo lo que asoma
    add(-3 + lx, shY + 4, 4, 12, B.accent);             // corbata
    add(-3 + lx, shY + 3, 4, 2, tint(B.accent, 0.3));   // nudo
    add(-2 + lx, shY + 15, 2, 3, tint(B.accent, -0.3)); // punta
    add(-6 + lx, shY + 17, 12, 6, B.main);              // la chaqueta se abrocha
    /* solapas escalonadas: una V, no dos ladrillos */
    add(-13 + lx, shY, 6, 17, B.dark);
    add(-9 + lx, shY + 1, 3, 8, B.dark);
    add(-8 + lx, shY + 1, 2, 5, tint(B.main, 0.16));
    add(7 + lx, shY, 6, 17, B.dark);
    add(6 + lx, shY + 1, 3, 8, B.dark);
    add(6 + lx, shY + 1, 2, 5, tint(B.main, 0.16));
    add(3 + lx, chestY + 11, 2, 2, tint(B.light, -0.35));  // botón
    add(-12 + lx, hipY - hipH - 1, 25, 1, tint(B.dark, -0.3));
  } else if (st === 'jacket') {
    pecho(B.main);
    add(-6 + lx, shY + 1, 12, 4, tint(skin, -0.18));    // cuello de la camiseta
    /* cazadora abierta: dos paños oscuros y la cremallera en medio */
    add(-13 + lx, shY, 7, 28, B.dark);
    add(6 + lx, shY, 7, 28, B.dark);
    add(-13 + lx, shY, 7, 2, tint(B.dark, 0.28));
    add(6 + lx, shY, 7, 2, tint(B.dark, 0.28));
    add(-1 + lx, shY + 4, 2, 24, B.light);              // cremallera
    add(-2 + lx, chestY + 9, 3, 2, tint(B.accent, -0.35));   // tirador
    add(-7 + lx, shY + 1, 1, 26, tint(B.dark, -0.4));   // costura del paño
    add(6 + lx, shY + 1, 1, 26, tint(B.dark, -0.4));
    add(6 + lx, chestY + 11, 5, 2, tint(B.dark, -0.4)); // bolsillo
    add(-12 + lx, hipY - hipH - 1, 25, 2, tint(B.dark, -0.25));
  } else if (st === 'stripes') {
    for (let i = -11; i < 11; i += 7) add(i + lx, chestY, 4, chestH - 3, B.light);
    for (let i = -wW; i <= wW - 3; i += 6) add(i + Math.round(hlx), hipY - hipH + 2, 3, hipH, B.light);
    add(-6 + lx, shY, 12, 4, B.dark);                   // cuello
    add(-5 + lx, shY + 1, 10, 2, tint(B.main, 0.25));
    add(-11 + lx, hipY - hipH - 1, 23, 1, tint(B.dark, -0.2));
  } else if (st === 'jersey') {
    add(-6 + lx, shY, 12, 4, B.light);
    add(-14 + lx, shY + 6, 27, 3, B.light);
    add(4 + lx, chestY + 5, 4, 9, B.light);
    add(2 + lx, chestY + 5, 5, 3, B.light);
  } else if (st === 'chef') {
    add(-12 + lx, shY + 1, 26, 4, B.accent);
    for (let i = 0; i < 4; i++) {
      add(-6 + lx, chestY + 1 + i * 5, 3, 3, B.accent);
      add(3 + lx, chestY + 1 + i * 5, 3, 3, B.accent);
    }
    cadera(B.dark);
  } else if (st === 'shirt') {                    // camisa abotonada y remangada
    pecho(B.main);
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.22));
    add(-7 + lx, shY, 14, 3, B.light);                  // cuello
    add(-6 + lx, shY + 3, 5, 4, B.light);               // pico izquierdo
    add(2 + lx, shY + 3, 5, 4, B.light);                // pico derecho
    add(-2 + lx, shY + 2, 4, chestH + 6, B.light);      // tapeta
    for (let i = 0; i < 4; i++)
      add(-1 + lx, shY + 6 + i * 5, 2, 2, tint(B.dark, -0.2));   // botones
    add(1 + lx, chestY + 6, 6, 6, tint(B.main, -0.14));  // bolsillo
    add(1 + lx, chestY + 6, 6, 1, tint(B.main, 0.18));
    add(-11 + lx, hipY - hipH - 1, 23, 2, tint(B.dark, -0.15));  // bajo dentro del pantalón
  } else if (st === 'stage') {                   // traje de escenario
    add(-11 + lx, chestY, 22, 10, B.main);              // top
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.28));
    add(-8 + lx, shY + 1, 4, 4, B.main);                // tirantes
    add(4 + lx, shY + 1, 4, 4, B.main);
    add(-11 + lx, chestY + 9, 22, 1, tint(B.main, -0.4));  // bajo del top
    add(-6 + lx, chestY + 10, 13, 7, tint(skin, -0.05));   // cintura
    add(-6 + lx, chestY + 10, 13, 1, tint(skin, -0.40));
    add(-6 + lx, chestY + 16, 13, 1, tint(skin, -0.34));
    cadera(B.main);
    add(Math.round(hlx) - wW, hipY - hipH, wW * 2, 3, tint(B.accent, -0.42));  // cinturón
    for (let i = -7; i <= 5; i += 5) add(i + Math.round(hlx), hipY, 3, 5, B.light);
    add(-4 + lx, chestY + 3, 8, 2, B.accent);
  } else if (st === 'labcoat') {
    /* Bata. Antes era un mandil: un rectángulo blanco colgando de los
       hombros. Lo que la hace bata es que cuerpo y mangas van del mismo
       paño, que las solapas dibujan una V y que el cruce va descentrado. */
    pecho(B.main);
    add(HX + Math.round(hlx), hipY - hipH, HW, hipH + 6, B.main);          // faldón
    cap(HX + 3 + hlx, hipY + 5, HX + HW - 3 + hlx, hipY + 5, 3, 3, B.main, 1);
    add(CX + lx, chestY, CW, 2, tint(B.main, 0.18));
    add(-6 + lx, shY, 12, 3, B.accent);                        // camisa
    add(-3 + lx, shY + 2, 5, 5, tint(B.accent, -0.32));        // corbata
    /* solapas: dos escalones hacia el cuello, una a cada lado */
    add(-10 + lx, shY + 1, 5, 11, B.light);
    add(-6 + lx, shY + 1, 3, 6, B.light);
    add(5 + lx, shY + 1, 5, 11, B.light);
    add(3 + lx, shY + 1, 3, 6, B.light);
    add(-10 + lx, shY + 1, 5, 1, tint(B.light, -0.22));
    add(5 + lx, shY + 1, 5, 1, tint(B.light, -0.22));
    /* el cruce de la bata, descentrado, con sus botones */
    add(2 + lx, shY + 9, 1, chestH + 5, tint(B.main, -0.30));
    for (let i = 0; i < 3; i++)
      add(4 + lx, chestY + 5 + i * 5, 2, 2, tint(B.dark, -0.2));
    /* bolsillo con los bolis asomando */
    add(-6 + lx, chestY + 8, 2, 5, B.dark);
    add(-3 + lx, chestY + 8, 2, 5, tint(B.accent, -0.25));
    add(-7 + lx, chestY + 11, 6, 6, tint(B.main, -0.11));
    add(-7 + lx, chestY + 10, 6, 1, tint(B.dark, -0.25));
  } else if (st === 'punk') {                    // cazadora con parches
    pecho(B.main);
    add(-5 + lx, shY + 2, 10, chestH + 5, tint(B.main, 0.22));
    add(-13 + lx, shY + 4, 5, 4, B.light);              // parches en la manga
    add(8 + lx, shY + 4, 5, 4, B.light);
    add(-13 + lx, shY + 4, 5, 1, tint(B.light, 0.3));
    add(8 + lx, shY + 4, 5, 1, tint(B.light, 0.3));
    add(-7 + lx, chestY + 4, 5, 5, B.light);
    add(1 + lx, chestY + 10, 5, 4, B.accent);
    cadera(B.dark);
    for (let i = -6; i <= 4; i += 5) add(i + Math.round(hlx), hipY - hipH + 1, 3, 3, B.accent);
  } else if (st === 'keeper') {                  // camiseta de arquero
    pecho(B.main);
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.22));
    add(-11 + lx, chestY + 6, 22, 3, B.light);           // franja del pecho
    add(-11 + lx, chestY + 9, 22, 1, tint(B.light, -0.35));
    add(-7 + lx, shY, 14, 4, B.accent);                  // cuello de pico
    add(-3 + lx, shY + 3, 6, 3, B.accent);
    add(-2 + lx, chestY + 12, 5, 6, tint(B.main, -0.3)); // dorsal
    add(-1 + lx, chestY + 13, 3, 4, B.light);
    add(-11 + lx, hipY - hipH - 2, 23, 2, tint(B.dark, -0.2));
    cadera(B.dark);
  } else if (st === 'torso') {                   // torso desnudo: pectorales y tableta
    const hw = Math.round(CW / 2) - 2;
    add(CX + lx, chestY, CW, 7, skin);           // misma V que la silueta
    add(CX + 3 + lx, chestY + 7, CW - 6, 6, skin);
    add(CX + 6 + lx, chestY + 13, CW - 12, chestH - 13, skin);
    /* menos detalle y más contraste: lo que hace el volumen es la
       silueta en V, no llenar el pecho de rayas */
    add(CX + 1 + lx, chestY + 1, CW - 2, 4, tint(skin, 0.16));   // luz del pecho
    add(CX + 2 + lx, chestY + 7, hw, 2, tint(skin, -0.40));      // bajo del pectoral
    add(2 + lx, chestY + 7, hw, 2, tint(skin, -0.40));
    add(-1 + lx, chestY + 1, 2, 7, tint(skin, -0.44));           // esternón
    for (let i = 0; i < 3; i++) {                                // tableta
      const w = 6 - i, y = chestY + 10 + i * 3;
      add(-w - 2 + lx, y, w, 1, tint(skin, -0.34));
      add(2 + lx, y, w, 1, tint(skin, -0.34));
    }
    add(-1 + lx, chestY + 9, 2, chestH - 10, tint(skin, -0.30));
    cadera(B.dark);
    add(Math.round(hlx) - wW, hipY - hipH + 1, wW * 2, 2, tint(B.dark, -0.45));  // cinturón
    add(Math.round(hlx) - 3, hipY - hipH + 1, 6, 2, tint(B.accent, -0.3));       // hebilla
  } else if (st === 'thriller') {                // cazadora roja con vivos negros
    pecho(B.main);
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.25));
    add(-14 + lx, shY, 6, 20, B.light);
    add(8 + lx, shY, 6, 20, B.light);
    add(-4 + lx, shY + 2, 8, chestH + 5, B.light);
    add(-1 + lx, shY + 3, 2, chestH + 3, B.accent);
    add(-7 + lx, chestY + 5, 4, 3, B.accent);
    add(3 + lx, chestY + 9, 4, 3, B.accent);
    cadera(B.light);
    add(Math.round(hlx) - wW, hipY - hipH + 1, wW * 2, 3, B.accent);
  } else if (st === 'tee') {
    add(-7 + lx, shY, 14, 4, B.dark);                    // cuello redondo
    add(-6 + lx, shY + 1, 12, 2, tint(B.main, 0.28));
    add(-4 + lx, chestY + 7, 8, 3, B.accent);            // estampado
    add(-4 + lx, chestY + 7, 8, 1, tint(B.accent, 0.3));
    add(-11 + lx, hipY - hipH - 2, 23, 2, tint(B.dark, -0.2));   // bajo de la camiseta
    add(-11 + lx, hipY - hipH - 3, 23, 1, tint(B.main, 0.2));
  }

  /* ---- luz de canto ----
     Un píxel claro en el borde de delante y uno oscuro en el de atrás.
     Es lo que convierte un montón de cajas apiladas en un cuerpo con
     volumen, y cuesta cuatro rectángulos. Va después de la prenda para
     que la recorte a ella también, y antes de los brazos, que van
     delante y llevan la suya. */
  const cLx = Math.round(lean * 0.7), hLx = Math.round(lean * 0.4);
  const canto = (x, y, h, c) => {
    add(x + CW - 1, y, 1, h, tint(c, 0.24));
    add(x, y, 1, h, tint(c, -0.32));
  };
  const pielArriba = (st === 'torso');
  const tonoTorso = pielArriba ? skin : B.main;
  if (B.huge) {                                  // sigue la V del pecho
    add(CX + CW - 1 + cLx, chestY, 1, 7, tint(tonoTorso, 0.24));
    add(CX + cLx, chestY, 1, 7, tint(tonoTorso, -0.32));
    add(CX + CW - 4 + cLx, chestY + 7, 1, 6, tint(tonoTorso, 0.24));
    add(CX + 3 + cLx, chestY + 7, 1, 6, tint(tonoTorso, -0.32));
    add(CX + CW - 7 + cLx, chestY + 13, 1, chestH - 13, tint(tonoTorso, 0.24));
    add(CX + 6 + cLx, chestY + 13, 1, chestH - 13, tint(tonoTorso, -0.32));
  } else canto(CX + cLx, chestY, chestH, tonoTorso);
  add(HX + HW - 1 + hLx, hipY - hipH, 1, hipH + 2, tint(B.main, 0.20));
  add(HX + hLx, hipY - hipH, 1, hipH + 2, tint(B.main, -0.30));
  add(SX + SW - 1 + Math.round(lean), shY + 1, 1, 7, tint(B.main, 0.24));
  add(SX + Math.round(lean), shY + 1, 1, 7, tint(B.main, -0.32));
  /* y una sombra donde el cuello se mete en los hombros */
  add(-5 + Math.round(lean), shY, 10, 1, tint(skin, -0.42));

  /* ---- brazos (manga corta = antebrazo de piel) ----
     La manga lleva un tono propio: si va del mismo color que el torso,
     el luchador se lee como una losa y no como alguien con brazos. */
  const shortSleeve = (st === 'tee' || st === 'jersey' || st === 'stripes' || st === 'stage' ||
    st === 'keeper' || st === 'punk' || st === 'torso' || st === 'shirt');
  /* en cazadora y traje la manga es del paño de fuera, no de la camisa
     de debajo: si no, salen brazos grises sobre una prenda negra */
  const sleeveBase = B.sleeve ||
    ((st === 'jacket' || st === 'suit' || st === 'thriller') ? mix(B.main, B.dark, 0.6) : B.main);
  const sleeveF = st === 'torso' ? tint(skin, 0.16) : tint(sleeveBase, 0.05);
  const sleeveB = st === 'torso' ? tint(skin, -0.30) : tint(B.sleeveDark || B.dark, -0.05);
  const foreC = shortSleeve ? skin : sleeveF;
  const foreD = shortSleeve ? tint(skin, -0.18) : sleeveB;
  /* el puño solo se ve si contrasta: en una bata blanca, B.light es
     blanco sobre blanco y desaparece, así que ahí se oscurece */
  const cuffC = st === 'torso' ? null : shortSleeve ? tint(B.main, -0.22)
    : (Math.abs(lum(B.light) - lum(sleeveF)) > 0.20 ? B.light
      : tint(sleeveF, lum(sleeveF) > 0.5 ? -0.30 : 0.34));
  const hand = B.gloves || skin;                 // guantazos de portero
  const handB = B.gloveOne ? skin : hand;        // Michael solo lleva uno
  const ay = shY + 2;
  const rH = aw / 2, rC = aw / 2 - 0.6, rW = aw / 2 - 1.1;   // hombro, codo, muñeca
  /* el guantazo de portero engorda el puño; el guante de lentejuelas de
     Michael es un guante, no un manopla, así que ese no */
  const rP = rW + 1.7 + (B.gloves && !B.gloveOne ? 1.4 : 0);

  /* Un puño no es un cuadrado, ni una bola del color del brazo. Lo que lo
     hace mano son los nudillos cogiendo la luz por arriba, dos surcos de
     dedos y el pulgar asomando por detrás. Todo el detalle va marcado
     como `det`: se pinta plano y sin contorno, o la mano se llena de
     anillos negros y vuelve a ser un borrón. */
  const puno = (px, py, c, d, gl) => {
    const r = rP;
    ell(px, py, r, r * 0.96, c, d);                                        // el bloque
    ellD(px - d * r * 0.58, py + r * 0.36, r * 0.40, r * 0.46, tint(c, 0.02));   // pulgar
    ellD(px + d * r * 0.10, py - r * 0.44, r * 0.80, r * 0.36, tint(c, 0.20));   // nudillos
    const gx = Math.round(px + d * r * 0.15), gy = Math.round(py - r * 0.05);
    const gh = Math.max(2, Math.round(r * 0.8));
    addD(gx, gy, 1, gh, tint(c, -0.34));                                   // surco entre dedos
    addD(gx + d * 2, gy, 1, gh - 1, tint(c, -0.34));
    /* la caña del guante va pegada al puño: a la altura del codo se leía
       como una barra blanca flotando encima de la chaqueta */
    if (gl) addD(Math.round(px - r * 0.9), Math.round(py - r * 1.25), Math.round(r * 1.8), 2, tint(c, -0.30));
  };
  /* la muñeca: un estrechamiento antes de la mano. Sin esto el puño
     parece una bola pegada a la punta del brazo */
  const muneca = (px, py, c, d) => ellD(px, py, rW * 0.95, rW * 0.62, tint(c, -0.24));

  /* un brazo entero: hombro, manga, puño de la manga, muñeca y mano */
  const arm = (x, y, front) => {
    const up = front ? sleeveF : sleeveB;
    const fo = front ? foreC : foreD;
    const hd = front ? hand : tint(handB, -0.15);
    const d = front ? 1 : -1, cx = x + aw / 2;
    cap(cx, y + 2, cx, y + 11, rH, rC, up, d);
    cap(cx, y + 10, cx, y + 20, rC, rW, fo, d);
    if (cuffC) cap(cx, shortSleeve ? y + 10 : y + 17, cx, shortSleeve ? y + 11 : y + 19,
      rC, rC - 0.2, cuffC, d);
    muneca(cx, y + 20.5, fo, d);
    puno(cx, y + 23.5, hd, d, B.gloves && (front || !B.gloveOne));
  };

  const bsx = AXB + lx + aw / 2, fsx = AXF + lx + aw / 2;   // hombros

  if (A.pose) {                                  // brazos cruzados: la POSE
    /* Los dos antebrazos se tocan, que es lo que hacen los brazos
       cruzados, pero el contorno del de delante lo borraba el relleno del
       de atrás (el contorno va en una pasada anterior). Sin ese canto los
       dos se leían como una sola masa, así que se separan más y el de
       arriba lleva su propia línea de sombra debajo. */
    const rX = rW - 0.7;                                          // antebrazos algo más finos
    const yB = ay + 12 + rX, yF = ay + 8 - rX;                    // uno debajo del otro
    cap(bsx, ay + 4, bsx + 1, yB - 2, rH, rC, sleeveB, -1);       // el hombro de atrás baja
    cap(bsx + 2, yB + 2, 9, yB, rC, rX, foreD, -1);               // y su antebrazo cruza abajo
    muneca(10.5, yB - 0.5, foreD, 1);
    puno(13, yB - 1, tint(handB, -0.15), 1, B.gloves && !B.gloveOne);
    cap(fsx, ay + 3, fsx - 1, yF + 3, rH, rC, sleeveF, 1);        // el de delante, por encima
    cap(fsx - 2, yF + 2, -9, yF, rC, rX, foreC, -1);
    addD(-9, Math.round(yF + rX), Math.round(fsx + 7), 1, OUTLINE);   // el canto de abajo
    muneca(-10.5, yF - 0.5, foreC, -1);
    puno(-13, yF - 1, hand, -1, B.gloves);
  } else if (A.cast > 0) {                       // las dos manos por delante
    /* el de atrás cruza el pecho, pero con el codo caído: recto se leía
       como una barra horizontal pintada encima de la chaqueta */
    cap(bsx, ay + 3, bsx + 4, ay + 9, rH, rC, sleeveB, -1);
    cap(bsx + 4, ay + 9, bsx + 14, ay + 5, rC, rW, foreD, -1);
    muneca(bsx + 15, ay + 4.5, foreD, 1);
    puno(bsx + 17.5, ay + 4, tint(handB, -0.15), 1, B.gloves && !B.gloveOne);
    cap(fsx, ay + 3, fsx + 5, ay - 1, rH, rC, sleeveF, 1);        // el de delante empuja
    cap(fsx + 5, ay - 1, fsx + 12, ay - 4, rC, rW, foreC, 1);
    muneca(fsx + 13, ay - 4.5, foreC, 1);
    puno(fsx + 15.5, ay - 5, hand, 1, B.gloves);
  } else if (A.punch !== 0) {
    const p = A.punch;
    const back = p < 0;
    const up = A.punchUp ? Math.round(18 * Math.max(0, p)) : 0;
    arm(AXB + lx, ay, false);
    if (back) {
      /* Brazo recogido: el codo se va atrás y el puño queda a la altura
         de las costillas. Antes se cruzaba por delante del pecho y
         parecía un bulto pegado al torso. */
      const off = 7 * -p, hx = fsx - off;
      cap(fsx, ay + 3, hx + 1, ay + 12, rH, rC, sleeveF, 1);
      cap(hx + 1, ay + 11, hx, ay + 19, rC, rW, foreC, 1);
      muneca(hx, ay + 20, foreC, 1);
      puno(hx, ay + 23, hand, 1, B.gloves);
    } else {
      /* El brazo que sale. El antebrazo va casi recto en vez de afilarse
         hasta la nada: lo que da la profundidad es que el puño sea
         claramente más gordo que la muñeca, no un cono. */
      const len = 11 + 21 * p;
      const y = ay + 9 - up;
      cap(fsx, y + 2, fsx + 6, y, rH, rC, sleeveF, 1);
      cap(fsx + 6, y, 6 + len, y, rC, rC - 0.5, foreC, 1);
      if (cuffC) cap(3 + len, y, 5 + len, y, rC - 0.1, rC - 0.4, cuffC, 1);
      muneca(7 + len, y, foreC, 1);
      puno(10 + len, y - (A.punchUp ? 4 : 0), hand, 1, B.gloves);
    }
  } else if (A.block) {                          // antebrazo cruzado delante
    arm(AXB + lx, ay, false);
    /* el codo baja y el antebrazo sube pegado delante: la guardia alta
       de toda la vida, no un brazo colgando */
    cap(fsx, ay + 3, fsx + 1, ay + 12, rH, rC, sleeveF, 1);
    cap(fsx + 2, ay + 12, fsx + 3, ay - 4, rC, rW, foreC, 1);
    if (cuffC) cap(fsx + 2.6, ay + 2, fsx + 2.8, ay + 4, rC - 0.1, rC - 0.3, cuffC, 1);
    muneca(fsx + 3, ay - 5, foreC, 1);
    puno(fsx + 3, ay - 8, hand, 1, B.gloves);
  } else {
    /* Guardia. Antes los brazos colgaban rectos y muertos: la pose en
       reposo es la firma de un juego de lucha. Ahora el antebrazo se
       adelanta y el puño queda por delante de la cadera, listo. Poco,
       pero suficiente: si se sube a la altura del pecho tapa la ropa. */
    const sw = Math.round(Math.sin(A.walk) * 4);
    const brazo = (x, y, front) => {
      const up = front ? sleeveF : sleeveB;
      const fo = front ? foreC : foreD;
      const hd = front ? hand : tint(handB, -0.15);
      const d = front ? 1 : -1;
      const cx = x + aw / 2, dx = front ? 2.5 : 1.5;   // el codo se adelanta
      cap(cx, y + 2, cx + d * dx, y + 11, rH, rC, up, d);                  // hombro a codo
      cap(cx + d * dx, y + 10, cx + d * dx * 1.4, y + 19, rC, rW, fo, d);  // codo a muñeca
      if (cuffC) {
        const cy = shortSleeve ? y + 10 : y + 17;
        cap(cx + d * dx * (shortSleeve ? 1.0 : 1.35), cy,
            cx + d * dx * (shortSleeve ? 1.05 : 1.4), cy + 2, rC, rC - 0.2, cuffC, d);
      }
      const px = cx + d * dx * 1.5;
      muneca(px, y + 19.5, fo, d);
      puno(px, y + 22.5, hd, d, B.gloves && (front || !B.gloveOne));
    };
    brazo(AXB + lx, ay + sw, false);
    brazo(AXF + lx, ay - sw, true);
  }

  return { rects: R, headY: neckY - 21, headX: -13 + Math.round(lean * 1.2) };
}

/* El Mustang es literalmente un coche: no tiene cabeza ni brazos, así que
   en vez de montarse por piezas se dibuja de una rejilla propia. Los
   rectángulos van bien para un cuerpo; para un coche hacen falta pasos de
   rueda redondos y un parabrisas inclinado, y eso pide rejilla. */
function carRects(B, A) {
  const L = Math.round(13 * Math.max(A.punch, A.kick, 0));   // el morro va primero
  const sus = Math.round(A.crouch * 0.4);                    // se hunde de suspensión
  return { rects: [], car: true, noHead: true, headX: 0, headY: 0,
    gx: L, gy: sus + (A.bob || 0) };
}

/* Cuerpo de bebé: cabeza normal sobre un cuerpecito, que es lo que
   hace gracia. Se usa en el remate BEBALIDAD. */
function babyRects(B) {
  const skin = B.skin;
  const R = [];
  const add = (x, y, w, h, c) => R.push({ x, y, w, h, c });
  add(-9, -9, 6, 9, skin);
  add(3, -9, 6, 9, skin);
  add(-10, -3, 9, 3, tint(skin, -0.3));
  add(1, -3, 9, 3, tint(skin, -0.3));
  add(-8, -20, 16, 19, '#f4eeff');
  add(-8, -20, 16, 4, '#ffffff');
  add(-8, -8, 16, 3, '#d8cfee');
  add(-13, -18, 6, 10, skin);
  add(7, -18, 6, 10, skin);
  return { rects: R, headY: -41, headX: -13 };
}

/* ---------------------------------------------------------
   Dibujo del luchador: silueta + relleno con volumen
   --------------------------------------------------------- */
function drawFighter(ctx, f) {
  const def = headOf(f.def);
  const A = f.animParams();

  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.scale(f.dir, 1);
  if (f.launched) {                        // sale volando dando vueltas
    ctx.translate(0, -16);
    ctx.rotate(f.t * 0.3);
    ctx.translate(0, 16);
  } else if (A.ko > 0) {
    ctx.translate(0, -6);
    ctx.rotate(-A.ko * Math.PI / 2);
    ctx.translate(0, 6);
  }

  if (A.spin) drawStreaks(ctx, def, A);   // estelas de la embestida, por detrás

  const parts = bodyRects(def, A);
  paintBody(ctx, def, parts, A.flash);

  /* 4) el narizón. Un palo recto no parece una nariz: esta arranca del
     puente de la cara, va afinando, cae hacia la punta y tiene ventana. */
  if (A.nose > 0 && !parts.noHead) {
    const sk = def.body.skin;
    const len = Math.round(10 + 58 * A.nose);
    const ny = parts.headY + 14;

    /* puente: la une con la nariz que ya tiene dibujada la cara */
    Pix.r(ctx, 3, ny + 1, 7, 8, OUTLINE);
    Pix.r(ctx, 4, ny + 2, 6, 6, sk);
    Pix.r(ctx, 4, ny + 2, 6, 1, tint(sk, 0.28));

    /* caño: cinco tramos que van adelgazando y bajando */
    const SEG = 5;
    let x0 = 9, y0 = ny + 2, h = 6;
    for (let i = 0; i < SEG; i++) {
      const x1 = 9 + Math.round(len * (i + 1) / SEG);
      const w = x1 - x0 + 1;
      Pix.r(ctx, x0, y0 - 1, w + 1, h + 2, OUTLINE);
      Pix.r(ctx, x0, y0, w, h, sk);
      Pix.r(ctx, x0, y0, w, 1, tint(sk, 0.28));
      Pix.r(ctx, x0, y0 + h - 1, w, 1, tint(sk, -0.28));
      x0 = x1;
      if (i % 2 === 0) { y0 += 1; h -= 1; }        // cae y adelgaza a la vez
    }

    /* punta redondeada, un poco más oscura */
    Pix.r(ctx, x0 - 1, y0 - 2, 6, h + 4, OUTLINE);
    Pix.r(ctx, x0, y0 - 1, 4, h + 2, tint(sk, -0.10));
    Pix.r(ctx, x0, y0 - 1, 4, 1, tint(sk, 0.18));

    /* ventana de la nariz, en la base: es lo que la delata */
    Pix.r(ctx, 6, ny + 6, 3, 2, tint(sk, -0.62));
  }

  ctx.restore();
}

const WHITE_PAL = new Proxy({}, { get: (o, k) => k === '#' ? OUTLINE : '#ffffff' });
/* paleta de un solo color, para las siluetas de la estela */
const GHOST_PAL = c => new Proxy({}, { get: () => c });

/* Embestida: en vez de un amasijo abstracto se dibuja al luchador de
   verdad con estelas detrás. Se reconoce quién embiste y hacia dónde. */
function drawStreaks(ctx, def, A) {
  const B = def.body;
  /* dos siluetas rezagadas: la típica estela de las recreativas */
  for (let k = 2; k >= 1; k--) {
    const dx = -k * 9;
    const gh = bodyRects(def, Object.assign({}, A, { spin: false, walk: A.walk - k * 0.9 }));
    ctx.globalAlpha = 0.30 - k * 0.08;
    if (gh.car) {
      const g = sideOf(def)._side;
      Pix.grid(ctx, g, GHOST_PAL(tint(B.main, 0.35)),
        -Math.floor(g[0].length / 2) + gh.gx + dx, -(g.length - 1) + gh.gy);
    } else {
      const gc = tint(B.main, 0.35);
      for (const p of gh.rects) {
        if (p.k === 'c') Pix.capsule(ctx, p.x0 + dx, p.y0, p.x1 + dx, p.y1, p.r0, p.r1, gc);
        else if (p.k === 'e') Pix.ellipse(ctx, p.cx + dx, p.cy, p.rx, p.ry, gc);
        else Pix.r(ctx, p.x + dx, p.y, p.w, p.h, gc);
      }
      if (!gh.noHead) Pix.r(ctx, gh.headX + dx + 4, gh.headY + 5, 18, 18, tint(B.main, 0.35));
    }
    ctx.globalAlpha = 1;
  }
  /* líneas de velocidad */
  for (let i = 0; i < 5; i++) {
    const y = -84 + ((i * 23 + Math.round(A.walk * 9)) % 78);
    const len = 16 + (i % 3) * 9;
    Pix.r(ctx, -18 - len, y, len, 2, 'rgba(255,255,255,0.5)');
  }
}

/* pinta un cuerpo ya montado: silueta oscura, relleno con volumen y cabeza */
function paintBody(ctx, def, parts, flash) {
  if (parts.car) {
    const d = sideOf(def), g = d._side;
    Pix.grid(ctx, g, flash ? WHITE_PAL : d._sidePal,
      -Math.floor(g[0].length / 2) + parts.gx, -(g.length - 1) + parts.gy);
    return;
  }
  const R = parts.rects;
  const OFF = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  /* 1) silueta: cada forma se calca un píxel más gorda en oscuro */
  ctx.fillStyle = OUTLINE;
  for (const p of R) {
    /* el detalle interior (nudillos, pulgar) no lleva contorno: si no,
       la mano se llena de anillos negros y vuelve a ser un borron */
    if (p.det) continue;
    if (p.k === 'c') Pix.capsule(ctx, p.x0, p.y0, p.x1, p.y1, p.r0 + 1, p.r1 + 1, OUTLINE);
    else if (p.k === 'e') Pix.ellipse(ctx, p.cx, p.cy, p.rx + 1, p.ry + 1, OUTLINE);
    else for (const o of OFF)
      ctx.fillRect(Math.round(p.x + o[0]), Math.round(p.y + o[1]), Math.round(p.w), Math.round(p.h));
  }

  /* 2) relleno con volumen */
  for (const p of R) {
    if (p.k === 'c') {
      if (flash) Pix.capsule(ctx, p.x0, p.y0, p.x1, p.y1, p.r0, p.r1, '#ffffff');
      else if (p.det) Pix.capsule(ctx, p.x0, p.y0, p.x1, p.y1, p.r0, p.r1, p.c);
      else Pix.capsuleVol(ctx, p.x0, p.y0, p.x1, p.y1, p.r0, p.r1, p.c, p.d);
    } else if (p.k === 'e') {
      if (flash) Pix.ellipse(ctx, p.cx, p.cy, p.rx, p.ry, '#ffffff');
      else if (p.det) Pix.ellipse(ctx, p.cx, p.cy, p.rx, p.ry, p.c);
      else Pix.ellipseVol(ctx, p.cx, p.cy, p.rx, p.ry, p.c, p.d);
    } else if (flash) Pix.r(ctx, p.x, p.y, p.w, p.h, '#ffffff');
    else if (p.h >= 4 && p.w >= 3) Pix.shade(ctx, p.x, p.y, p.w, p.h, p.c);
    else Pix.r(ctx, p.x, p.y, p.w, p.h, p.c);
  }
  if (!parts.noHead) Pix.grid(ctx, def._head, flash ? WHITE_PAL : def._pal, parts.headX, parts.headY);
}

/* pose neutra */
const IDLE_ANIM = {
  crouch: 0, punch: 0, kick: 0, cast: 0, walk: 0, air: false, ko: 0,
  bob: 0, block: false, flash: false, spin: false, kickHigh: false, punchUp: false
};

function drawPose(ctx, def, x, y, dir, scale, anim) {
  const dummy = { def, x: 0, y: 0, dir: dir || 1, animParams: () => anim || IDLE_ANIM };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (scale && scale !== 1) ctx.scale(scale, scale);
  drawFighter(ctx, dummy);
  ctx.restore();
}

/* solo la cabeza (retratos del marcador) */
function drawHeadIcon(ctx, def, x, y) {
  Pix.grid(ctx, headOf(def)._head, def._pal, x, y);
}

/* =========================================================
   ESCENARIOS — capas, tramado y detalle
   ========================================================= */
const STAGES = [
  { id: 'azotea', name: 'AZOTEA NEÓN' },
  { id: 'mercado', name: 'MERCADO CÓSMICO' },
  { id: 'salon', name: 'RING DE SALÓN' },
  { id: 'dojo', name: 'DOJO DEL SÓTANO' }
];

const FOCO = { azotea: '255,214,150', mercado: '190,160,255', salon: '255,196,120', dojo: '255,180,110' };

function drawStage(ctx, id, t) {
  switch (id) {
    case 'azotea': stageAzotea(ctx, t); break;
    case 'mercado': stageMercado(ctx, t); break;
    case 'salon': stageSalon(ctx, t); break;
    default: stageDojo(ctx, t); break;
  }
  focoSuelo(ctx, FOCO[id] || FOCO.dojo);
  vignette(ctx);
}

/* oscurecido de los bordes para centrar la mirada */
function vignette(ctx) {
  for (let i = 0; i < 10; i++) {
    const a = 0.05 * (10 - i) / 10;
    ctx.fillStyle = 'rgba(0,0,0,' + a + ')';
    ctx.fillRect(i * 2, 0, 2, H);
    ctx.fillRect(W - i * 2 - 2, 0, 2, H);
  }
  /* sombra en la parte alta: hunde el fondo y despega a los luchadores */
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = 'rgba(0,0,0,' + (0.055 * (8 - i) / 8) + ')';
    ctx.fillRect(0, i * 3, W, 3);
  }
}

/* Charco de luz en el centro del suelo: da profundidad al escenario y
   dice dónde se pelea. Sin él, el suelo es una banda plana de color. */
function focoSuelo(ctx, color) {
  for (let i = 0; i < 7; i++) {
    const w = 250 - i * 26, a = 0.035 + i * 0.020;
    ctx.fillStyle = 'rgba(' + color + ',' + a + ')';
    ctx.fillRect(Math.round((W - w) / 2), GROUND + i * 2, w, 2);
  }
  for (let i = 0; i < 3; i++) {                 // rebote de luz en la pared
    const w = 170 - i * 30;
    ctx.fillStyle = 'rgba(' + color + ',' + (0.030 - i * 0.008) + ')';
    ctx.fillRect(Math.round((W - w) / 2), GROUND - 6 - i * 5, w, 5);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.16)';           // junta pared-suelo
  ctx.fillRect(0, GROUND - 2, W, 2);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, GROUND - 5, W, 3);
}

/* cielo con transiciones tramadas */
function sky(ctx, stops) {
  let y = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    const h = Math.round(GROUND * (stops[i + 1][1] - stops[i][1]));
    Pix.ditherBand(ctx, 0, y, W, h, stops[i][0], stops[i + 1][0]);
    y += h;
  }
  if (y < GROUND) Pix.r(ctx, 0, y, W, GROUND - y, stops[stops.length - 1][0]);
}

function stars(ctx, t, n, color) {
  for (let i = 0; i < n; i++) {
    const x = (i * 71 + 13) % W, y = (i * 37) % 84;
    if (Math.sin(t / 22 + i * 1.7) > -0.35) Pix.r(ctx, x, y, 1, 1, color);
  }
}

/* público: masa oscura tras una barandilla. Casi silueta, poco contraste:
   así lee como gente al fondo y no compite con los luchadores. */
function spectator(ctx, x, base, tone, up) {
  Pix.r(ctx, x + 3, base, 2, 1, tone);          // coronilla
  Pix.r(ctx, x + 2, base + 1, 4, 3, tone);      // cabeza
  Pix.r(ctx, x + 1, base + 4, 6, 2, tone);      // cuello y hombros
  Pix.r(ctx, x, base + 6, 8, 8, tone);          // torso
  if (up) {
    Pix.r(ctx, x - 1, base + 1, 2, 6, tone);
    Pix.r(ctx, x + 7, base + 1, 2, 6, tone);
  }
}

function crowd(ctx, y, t, cols) {
  const amb = cols[0];
  Pix.r(ctx, 0, y - 20, W, 20, 'rgba(0,0,0,0.30)');

  const back = tint(amb, -0.74), front = tint(amb, -0.58);
  for (let i = 0; i < 24; i++) {                 // fila del fondo
    const seed = (i * 73) % 31;
    const x = -6 + i * 14 + (seed % 5);
    const up = Math.sin(t / 12 - i * 0.8 + 1.4) > 0.7;
    spectator(ctx, x, y - 15 + (seed % 2) - (up ? 2 : 0), back, up);
  }
  for (let i = 0; i < 19; i++) {                 // fila delantera
    const seed = (i * 137) % 29;
    const x = -4 + i * 18 + (seed % 7);
    const up = Math.sin(t / 12 - i * 0.6) > 0.62;
    spectator(ctx, x, y - 12 + (seed % 3) - (up ? 2 : 0), front, up);
  }
  /* barandilla: tapa los cuerpos y da profundidad */
  Pix.r(ctx, 0, y - 5, W, 1, tint(amb, 0.10));
  Pix.r(ctx, 0, y - 4, W, 2, tint(amb, -0.34));
  Pix.r(ctx, 0, y - 2, W, 2, tint(amb, -0.66));
  for (let x = 6; x < W; x += 26) Pix.r(ctx, x, y - 4, 2, 4, tint(amb, -0.75));
}

/* velo que empuja el fondo hacia atrás */
function haze(ctx, color) {
  Pix.r(ctx, 0, 0, W, GROUND, color);
}

/* suelo con textura y borde en primer plano */
function floor(ctx, top, mid, dark, lineC) {
  Pix.r(ctx, 0, GROUND, W, H - GROUND, mid);
  Pix.r(ctx, 0, GROUND, W, 2, top);
  Pix.r(ctx, 0, GROUND + 2, W, 1, tint(mid, -0.15));
  for (let x = 0; x < W; x += 8) Pix.r(ctx, x + ((x / 8) % 2 ? 3 : 0), GROUND + 6, 5, 1, dark);
  for (let x = 0; x < W; x += 14) Pix.r(ctx, x, GROUND + 12, 9, 1, dark);
  Pix.r(ctx, 0, H - 8, W, 8, darken(mid, 0.55));
  Pix.r(ctx, 0, H - 9, W, 1, lineC || tint(mid, 0.2));
}

/* ---------- azotea neón ---------- */
function stageAzotea(ctx, t) {
  sky(ctx, [['#150a2e', 0], ['#2d1050', 0.35], ['#5a1f52', 0.7], ['#96345a', 1]]);
  stars(ctx, t, 46, '#ffe9f5');
  Pix.circle(ctx, 268, 46, 12, '#e8dcae');
  Pix.circle(ctx, 264, 42, 4, '#cfc192');
  Pix.circle(ctx, 272, 50, 3, '#cfc192');

  /* lejanía */
  for (let i = 0; i < 12; i++) {
    const x = i * 28 - 6, h = 26 + ((i * 37) % 34);
    Pix.r(ctx, x, GROUND - 34 - h, 24, h + 34, '#1d1038');
  }
  /* edificios medios con ventanas */
  const b = [[4, 54], [40, 78], [76, 42], [112, 90], [150, 62], [188, 100], [228, 54], [264, 84]];
  b.forEach((v, i) => {
    const x = v[0], bh = v[1], base = i % 2 ? '#2a1a4e' : '#221541';
    Pix.r(ctx, x - 1, GROUND - 28 - bh - 1, 36, bh + 30, '#100a20');
    Pix.r(ctx, x, GROUND - 28 - bh, 34, bh + 28, base);
    Pix.r(ctx, x, GROUND - 28 - bh, 34, 2, tint(base, 0.25));
    for (let wy = GROUND - 24 - bh; wy < GROUND - 32; wy += 8)
      for (let wx = x + 3; wx < x + 30; wx += 7) {
        const on = ((wx * 7 + wy * 13 + i) % 5) > 2;
        Pix.r(ctx, wx, wy, 4, 4, on ? '#c99a35' : '#150d2b');
        if (on) Pix.r(ctx, wx, wy, 4, 1, '#e8c471');
      }
  });
  /* neones */
  const n1 = Math.sin(t / 11) > -0.2;
  Pix.r(ctx, 22, 40, 32, 14, '#100a20');
  Pix.r(ctx, 24, 42, 28, 10, n1 ? '#ff5a72' : '#5a1a2c');
  Pix.r(ctx, 26, 44, 24, 2, n1 ? '#ffd0d8' : '#6a2436');
  const n2 = Math.sin(t / 7) > -0.5;
  Pix.r(ctx, 196, 26, 14, 30, '#100a20');
  Pix.r(ctx, 198, 28, 10, 26, n2 ? '#48e0d0' : '#12564f');
  Pix.r(ctx, 200, 30, 6, 2, n2 ? '#c8fff8' : '#186a62');

  haze(ctx, 'rgba(24,10,48,0.38)');
  crowd(ctx, GROUND - 26, t, ['#3a2a5e', '#5a2a4e']);
  Pix.r(ctx, 0, GROUND - 26, W, 26, 'rgba(12,6,26,0.45)');
  Pix.r(ctx, 0, GROUND - 4, W, 4, '#241638');
  floor(ctx, '#6a5a8c', '#3a3050', '#2a2340', '#f5c542');
  for (let x = 4; x < W; x += 24) Pix.r(ctx, x, GROUND + 9, 12, 2, '#c9a02a');
}

/* ---------- mercado cósmico ---------- */
function stageMercado(ctx, t) {
  sky(ctx, [['#080418', 0], ['#1a0a38', 0.4], ['#361456', 0.75], ['#5a2070', 1]]);
  stars(ctx, t, 70, '#e8d8ff');
  Pix.circle(ctx, 58, 38, 17, '#7b4bd4');
  Pix.circle(ctx, 52, 32, 6, '#a87bf0');
  Pix.r(ctx, 34, 38, 48, 1, '#c9a6ff');
  Pix.r(ctx, 36, 40, 44, 1, '#8d5ad4');
  Pix.circle(ctx, 246, 24, 9, '#f0932b');
  Pix.circle(ctx, 243, 21, 3, '#ffd166');

  for (let i = 0; i < 10; i++) {                     // cúpulas lejanas
    const x = i * 34 - 8;
    Pix.circle(ctx, x + 16, GROUND - 34, 14, '#241040');
    Pix.r(ctx, x, GROUND - 34, 32, 34, '#241040');
  }
  /* puestos */
  const cols = ['#a02832', '#2f9a92', '#b8912e', '#3a9440'];
  for (let s = 0; s < 4; s++) {
    const x = 6 + s * 78, c = cols[s];
    Pix.r(ctx, x - 1, GROUND - 49, 64, 30, '#140a26');
    Pix.r(ctx, x, GROUND - 48, 62, 7, c);
    for (let i = 0; i < 62; i += 8) Pix.r(ctx, x + i, GROUND - 48, 4, 7, tint(c, -0.3));
    Pix.r(ctx, x, GROUND - 41, 62, 19, '#2a1a45');
    Pix.r(ctx, x + 1, GROUND - 41, 60, 1, '#3d2a5c');
    for (let i = 0; i < 5; i++) {
      const px = x + 10 + i * 10, pc = ['#f07ac0', '#4ad14a', '#f5c542'][i % 3];
      Pix.circle(ctx, px, GROUND - 30, 3, pc);
      Pix.r(ctx, px - 1, GROUND - 32, 2, 1, tint(pc, 0.4));
    }
    Pix.r(ctx, x + 28, GROUND - 48, 3, 26, '#3a2a5c');
  }
  /* farolillos flotantes */
  for (let i = 0; i < 6; i++) {
    const lx = 24 + i * 52, ly = 58 + Math.sin(t / 30 + i) * 6;
    Pix.r(ctx, lx - 1, ly - 1, 8, 10, '#140a26');
    Pix.r(ctx, lx, ly, 6, 8, i % 2 ? '#ffd166' : '#f07ac0');
    Pix.r(ctx, lx + 1, ly + 1, 4, 2, '#fff6d8');
    Pix.r(ctx, lx + 2, ly + 8, 2, 4, '#3a2a5c');
  }
  haze(ctx, 'rgba(14,4,36,0.36)');
  crowd(ctx, GROUND - 22, t, ['#4a2a6b', '#6b2a4a']);
  Pix.r(ctx, 0, GROUND - 22, W, 22, 'rgba(16,8,32,0.5)');
  floor(ctx, '#6a4a9c', '#33224f', '#241a3c', '#8d5ad4');
  for (let x = 0; x < W; x += 32) {                    // baldosas en perspectiva
    Pix.r(ctx, x, GROUND + 3, 1, H - GROUND - 11, '#2a1c44');
    Pix.r(ctx, x + 16, GROUND + 10, 1, H - GROUND - 18, '#2a1c44');
  }
}

/* ---------- ring de salón ---------- */
function stageSalon(ctx, t) {
  Pix.r(ctx, 0, 0, W, GROUND, '#6b4a34');
  for (let x = 0; x < W; x += 22) {                    // papel pintado
    Pix.r(ctx, x, 0, 11, GROUND, '#5e4130');
    for (let y = 6; y < GROUND; y += 18) {
      Pix.r(ctx, x + 4, y, 3, 3, '#7d5a42');
      Pix.r(ctx, x + 15, y + 9, 3, 3, '#7d5a42');
    }
  }
  Pix.r(ctx, 0, 24, W, 5, '#8a6a4a');
  Pix.r(ctx, 0, 24, W, 1, '#a88a68');

  const on = Math.sin(t / 9) > 0;                      // tele encendida
  Pix.r(ctx, 16, 42, 58, 44, '#231a14');
  Pix.r(ctx, 18, 44, 54, 40, '#100c0a');
  Pix.r(ctx, 20, 46, 50, 36, on ? '#48e0d0' : '#2f7f80');
  for (let y = 46; y < 82; y += 3) Pix.r(ctx, 20, y, 50, 1, 'rgba(0,0,0,0.25)');
  Pix.r(ctx, 26, 54, 14, 5, '#0c1420');
  Pix.r(ctx, 26, 64, 32, 4, '#0c1420');
  Pix.r(ctx, 34, 86, 22, 6, '#231a14');

  Pix.r(ctx, 214, 30, 8, 54, '#8d6a4a');               // lámpara
  Pix.circle(ctx, 218, 30, 13, '#f5e0a0');
  Pix.circle(ctx, 218, 28, 8, '#fff6d8');
  ctx.fillStyle = 'rgba(255,240,190,0.10)';
  ctx.beginPath(); ctx.moveTo(206, 40); ctx.lineTo(230, 40); ctx.lineTo(248, GROUND); ctx.lineTo(188, GROUND); ctx.fill();

  Pix.r(ctx, 118, 56, 62, 28, '#3a2a1e');              // cuadro
  Pix.r(ctx, 121, 59, 56, 22, '#a3624a');
  Pix.r(ctx, 128, 66, 42, 10, '#c98a68');

  Pix.r(ctx, 92, GROUND - 50, 136, 30, '#1f4a44');     // sofá
  Pix.r(ctx, 92, GROUND - 56, 136, 8, '#2f6a5e');
  Pix.r(ctx, 92, GROUND - 56, 136, 1, '#4d9a86');
  for (let i = 0; i < 3; i++) {
    Pix.r(ctx, 104 + i * 42, GROUND - 48, 34, 14, '#2a5f56');
    Pix.r(ctx, 104 + i * 42, GROUND - 48, 34, 1, '#4d9a86');
  }
  haze(ctx, 'rgba(34,16,8,0.30)');
  crowd(ctx, GROUND - 20, t, ['#7a4a34', '#8d5a3a']);
  floor(ctx, '#b06a4a', '#8a4d3a', '#6f3a2c', '#c98a68');
  for (let x = 0; x < W; x += 16) Pix.r(ctx, x + 4, GROUND + 16, 8, 2, '#6f3a2c');
}

/* ---------- dojo del sótano ---------- */
function stageDojo(ctx, t) {
  Pix.r(ctx, 0, 0, W, GROUND, '#2f2318');
  for (let x = 0; x < W; x += 36) {                    // tablones
    Pix.r(ctx, x, 0, 6, GROUND, '#443123');
    Pix.r(ctx, x, 0, 1, GROUND, '#584231');
    Pix.r(ctx, x + 6, 0, 30, GROUND, '#281e15');
    for (let y = 10; y < GROUND; y += 26) Pix.r(ctx, x + 10, y, 22, 1, '#33261a');
  }
  Pix.r(ctx, 0, 18, W, 6, '#54402c');
  Pix.r(ctx, 0, 18, W, 1, '#6d5439');

  for (let s = 0; s < 3; s++) {                        // paneles de papel
    const x = 26 + s * 96;
    Pix.r(ctx, x - 2, 34, 62, 60, '#3d2c1e');
    Pix.r(ctx, x, 36, 58, 56, '#e8dcc0');
    for (let i = 1; i < 3; i++) Pix.r(ctx, x + i * 19, 36, 1, 56, '#c9b993');
    Pix.r(ctx, x, 62, 58, 1, '#c9b993');
    Pix.r(ctx, x, 36, 58, 2, '#fff6e0');
  }
  Pix.r(ctx, 122, 44, 76, 44, '#4a3626');              // estandarte
  Pix.r(ctx, 125, 47, 70, 38, '#f2e8d0');
  Pix.circle(ctx, 160, 66, 14, '#c0392b');
  Pix.circle(ctx, 156, 62, 4, '#e05a4a');

  for (let i = 0; i < 4; i++) {                        // farolillos
    const x = 34 + i * 78, fl = Math.sin(t / 10 + i * 1.4) > -0.3;
    Pix.r(ctx, x, 24, 2, 8, '#1a140e');
    Pix.r(ctx, x - 7, 32, 16, 20, '#2a1410');
    Pix.r(ctx, x - 6, 33, 14, 18, fl ? '#e0343c' : '#8f1218');
    Pix.r(ctx, x - 4, 36, 10, 8, fl ? '#ff8a7a' : '#a8202a');
    Pix.r(ctx, x - 2, 38, 5, 4, fl ? '#fff2a8' : '#c06030');
  }
  haze(ctx, 'rgba(26,14,6,0.32)');
  crowd(ctx, GROUND - 18, t, ['#6b5a3a', '#7a6440']);
  Pix.r(ctx, 0, GROUND - 18, W, 18, 'rgba(20,14,8,0.45)');
  floor(ctx, '#a8895a', '#7a6038', '#5a4526', '#c9a06d');
  for (let x = 0; x < W; x += 40) Pix.r(ctx, x, GROUND + 3, 1, H - GROUND - 11, '#5a4526');
}

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

  const cr = A.crouch;                          // 0..12
  const lean = A.lean || 0;                     // peso del cuerpo
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
    cap(kl + 1, ky, kl + 6, ky, 3.4, 2.8, boot, 1);           // bota
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
  /* cadera: solo se redondean las esquinas de abajo, lo justo para que
     las piernas salgan de ella y no parezcan encajadas a presión */
  add(HX + lean * 0.4, hipY - hipH, HW, hipH, tint(B.main, -0.10));
  const hcx = HX + HW / 2 + lean * 0.4;
  cap(hcx - HW / 2 + 3, hipY - 2, hcx + HW / 2 - 3, hipY - 2, 3, 3, tint(B.main, -0.10), 1);
  add(HX + 1 + lean * 0.4, hipY + 1, HW - 2, 1, tint(legD, -0.30));   // bajo del pantalón
  if (B.huge) {                                  // la V del culturista
    add(CX + lean * 0.7, chestY, CW, 7, B.main);
    add(CX + 3 + lean * 0.7, chestY + 7, CW - 6, 6, B.main);
    add(CX + 6 + lean * 0.7, chestY + 13, CW - 12, chestH - 13, B.main);
  } else add(CX + lean * 0.7, chestY, CW, chestH, B.main);
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
  const lx = Math.round(lean);
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
    add(-11 + lx, chestY, 22, chestH, B.main);
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
    for (let i = -11; i < 11; i += 7) add(i + lx, chestY, 4, chestH, B.light);
    for (let i = -9; i < 9; i += 7) add(i + Math.round(lean * 0.4), hipY - hipH, 4, hipH + 2, B.light);
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
    add(-9 + Math.round(lean * 0.4), hipY - hipH, 19, hipH + 2, B.dark);
  } else if (st === 'shirt') {                    // camisa abotonada y remangada
    add(-11 + lx, chestY, 22, chestH, B.main);
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
    add(-10 + Math.round(lean * 0.4), hipY - hipH - 1, 21, 3, tint(B.accent, -0.42));  // cinturón
    add(-10 + Math.round(lean * 0.4), hipY - hipH + 2, 21, hipH, B.main);
    for (let i = -10; i < 11; i += 5) add(i, hipY, 4, 6, B.light);
    add(-4 + lx, chestY + 3, 8, 2, B.accent);
  } else if (st === 'labcoat') {
    /* Bata. Antes era un mandil: un rectángulo blanco colgando de los
       hombros. Lo que la hace bata es que cuerpo y mangas van del mismo
       paño, que las solapas dibujan una V y que el cruce va descentrado. */
    add(CX + lx, chestY, CW, chestH, B.main);
    add(HX + Math.round(lean * 0.4), hipY - hipH, HW, hipH + 8, B.main);   // faldón
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
    add(-11 + lx, chestY, 22, chestH, B.main);
    add(-5 + lx, shY + 2, 10, chestH + 5, tint(B.main, 0.22));
    add(-13 + lx, shY + 4, 5, 4, B.light);              // parches en la manga
    add(8 + lx, shY + 4, 5, 4, B.light);
    add(-13 + lx, shY + 4, 5, 1, tint(B.light, 0.3));
    add(8 + lx, shY + 4, 5, 1, tint(B.light, 0.3));
    add(-7 + lx, chestY + 4, 5, 5, B.light);
    add(1 + lx, chestY + 10, 5, 4, B.accent);
    add(-10 + Math.round(lean * 0.4), hipY - hipH, 21, hipH + 2, B.dark);
    for (let i = -7; i < 7; i += 5) add(i, hipY - hipH, 3, 3, B.accent);
  } else if (st === 'keeper') {                  // camiseta de arquero
    add(-11 + lx, chestY, 22, chestH, B.main);
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.22));
    add(-11 + lx, chestY + 6, 22, 3, B.light);           // franja del pecho
    add(-11 + lx, chestY + 9, 22, 1, tint(B.light, -0.35));
    add(-7 + lx, shY, 14, 4, B.accent);                  // cuello de pico
    add(-3 + lx, shY + 3, 6, 3, B.accent);
    add(-2 + lx, chestY + 12, 5, 6, tint(B.main, -0.3)); // dorsal
    add(-1 + lx, chestY + 13, 3, 4, B.light);
    add(-11 + lx, hipY - hipH - 2, 23, 2, tint(B.dark, -0.2));
    add(-10 + Math.round(lean * 0.4), hipY - hipH, 21, hipH + 2, B.dark);
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
    add(HX + Math.round(lean * 0.4), hipY - hipH, HW, hipH + 2, B.dark);
    add(HX + Math.round(lean * 0.4), hipY - hipH, HW, 2, tint(B.dark, -0.45));
    add(-3 + Math.round(lean * 0.4), hipY - hipH, 6, 2, tint(B.accent, -0.3));  // hebilla
  } else if (st === 'thriller') {                // cazadora roja con vivos negros
    add(-11 + lx, chestY, 22, chestH, B.main);
    add(-11 + lx, chestY, 22, 2, tint(B.main, 0.25));
    add(-14 + lx, shY, 6, 20, B.light);
    add(8 + lx, shY, 6, 20, B.light);
    add(-4 + lx, shY + 2, 8, chestH + 5, B.light);
    add(-1 + lx, shY + 3, 2, chestH + 3, B.accent);
    add(-7 + lx, chestY + 5, 4, 3, B.accent);
    add(3 + lx, chestY + 9, 4, 3, B.accent);
    add(-10 + Math.round(lean * 0.4), hipY - hipH, 21, hipH + 2, B.light);
    add(-10 + Math.round(lean * 0.4), hipY - hipH, 21, 3, B.accent);
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
  const hs = aw + (B.gloves ? 4 : 2);            // el puño, algo más ancho que el brazo
  const hoff = Math.floor((hs - aw) / 2);        // y centrado en él
  const ay = shY + 2;

  /* un brazo entero: hombro con luz, manga, puño y mano */
  const bare = (st === 'torso');
  const arm = (x, y, front) => {
    const up = front ? sleeveF : sleeveB;
    const fo = front ? foreC : foreD;
    const hd = front ? hand : tint(handB, -0.15);
    const d = front ? 1 : -1, cx = x + aw / 2;
    const rH = aw / 2, rC = aw / 2 - 0.6, rM = aw / 2 - 1.1;
    cap(cx, y + 2, cx, y + 11, rH, rC, up, d);
    cap(cx, y + 10, cx, y + 20, rC, rM, fo, d);
    if (cuffC) cap(cx, shortSleeve ? y + 10 : y + 17, cx, shortSleeve ? y + 11 : y + 19,
      rC, rC - 0.2, cuffC, d);
    const py = y + 23.5, rp = rM + 1.5;
    ell(cx, py, rp, rp * 0.94, hd, d);
    if (B.gloves && (front || !B.gloveOne)) {
      ell(cx, py - rp * 0.55, rp * 0.95, rp * 0.42, tint(hd, 0.26), d);
      add(cx - 2, py, 1, Math.round(rp), tint(hd, -0.34));
      add(cx + 1, py, 1, Math.round(rp), tint(hd, -0.34));
    }
  };

  if (A.pose) {                                  // brazos cruzados: la POSE
    add(AXB + lx, ay + 2, aw, 9, sleeveB);
    add(-11, ay + 13, 22, aw + 2, foreD);
    add(9 - hoff, ay + 12, hs, hs, tint(handB, -0.15));
    add(AXF + 2 + lx, ay + 2, aw, 9, sleeveF);
    add(AXF + 2 + lx, ay + 2, aw, 2, tint(sleeveF, 0.20));
    add(-9, ay + 6, 22, aw + 2, foreC);
    add(-9, ay + 6, 22, 1, tint(foreC, 0.18));
    add(-14 - hoff, ay + 5, hs, hs, hand);
  } else if (A.cast > 0) {
    add(-8, ay - 5, 15, aw, sleeveB);
    add(7, ay - 9, 9, 9, skin);
    add(5, ay - 10, 15, aw, sleeveF);
    add(5, ay - 10, 15, 2, tint(sleeveF, 0.20));
    add(20, ay - 14, 9, 9, skin);
  } else if (A.punch !== 0) {
    const p = A.punch;
    const back = p < 0;
    const up = A.punchUp ? Math.round(18 * Math.max(0, p)) : 0;
    arm(AXB + lx, ay, false);
    if (back) {
      /* brazo recogido: toma impulso */
      const off = Math.round(7 * -p);
      add(3 - off, ay + 4, aw, 10, sleeveF);
      add(3 - off, ay + 4, aw, 2, tint(sleeveF, 0.20));
      add(1 - off - hoff, ay + 12, hs, hs, hand);
    } else {
      const len = 11 + 21 * p;
      add(7, ay + 5 - up, 9, aw + 2, sleeveF);
      add(7, ay + 5 - up, 9, 2, tint(sleeveF, 0.20));
      add(16, ay + 5 - up, len - 9, aw + 2, foreC);
      if (cuffC) add(4 + len, ay + 5 - up, 4, aw + 2, cuffC);  // puño en la muñeca
      add(7 + len - hoff, ay + 1 - up - (A.punchUp ? 5 : 0), hs, hs, hand);
    }
  } else if (A.block) {
    arm(AXB + lx, ay, false);
    add(5, ay - 1, aw + 2, 25, sleeveF);
    add(5, ay - 1, aw + 2, 5, tint(sleeveF, 0.22));
    if (cuffC) add(5, ay + 17, aw + 2, 3, cuffC);
    add(6 - hoff, ay + 21, hs, hs, hand);
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
      const rH = aw / 2, rC = aw / 2 - 0.6, rM = aw / 2 - 1.1;
      cap(cx, y + 2, cx + d * dx, y + 11, rH, rC, up, d);          // hombro a codo
      cap(cx + d * dx, y + 10, cx + d * dx * 1.4, y + 19, rC, rM, fo, d);   // codo a muñeca
      if (cuffC) {
        const cy = shortSleeve ? y + 10 : y + 17;
        cap(cx + d * dx * (shortSleeve ? 1.0 : 1.35), cy,
            cx + d * dx * (shortSleeve ? 1.05 : 1.4), cy + 2, rC, rC - 0.2, cuffC, d);
      }
      /* el puño: una elipse algo más gorda que la muñeca */
      const px = cx + d * dx * 1.5, py = y + 22.5, rp = rM + 1.5;
      ell(px, py, rp, rp * 0.94, hd, d);
      if (B.gloves && (front || !B.gloveOne)) {
        ell(px, py - rp * 0.55, rp * 0.95, rp * 0.42, tint(hd, 0.26), d);   // caña
        add(px - 1, py, 1, Math.round(rp), tint(hd, -0.34));                // dedos
        add(px + 2, py, 1, Math.round(rp), tint(hd, -0.34));
      }
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
    if (p.k === 'c') Pix.capsule(ctx, p.x0, p.y0, p.x1, p.y1, p.r0 + 1, p.r1 + 1, OUTLINE);
    else if (p.k === 'e') Pix.ellipse(ctx, p.cx, p.cy, p.rx + 1, p.ry + 1, OUTLINE);
    else for (const o of OFF)
      ctx.fillRect(Math.round(p.x + o[0]), Math.round(p.y + o[1]), Math.round(p.w), Math.round(p.h));
  }

  /* 2) relleno con volumen */
  for (const p of R) {
    if (p.k === 'c') {
      if (flash) Pix.capsule(ctx, p.x0, p.y0, p.x1, p.y1, p.r0, p.r1, '#ffffff');
      else Pix.capsuleVol(ctx, p.x0, p.y0, p.x1, p.y1, p.r0, p.r1, p.c, p.d);
    } else if (p.k === 'e') {
      if (flash) Pix.ellipse(ctx, p.cx, p.cy, p.rx, p.ry, '#ffffff');
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

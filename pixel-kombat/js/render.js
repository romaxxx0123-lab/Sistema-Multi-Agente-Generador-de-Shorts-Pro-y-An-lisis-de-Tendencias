/* =========================================================
   render.js — luchadores y escenarios.
   Los cuerpos se montan por piezas, se les calca una silueta
   oscura alrededor y luego se rellenan con luz y sombra.
   ========================================================= */

const OUTLINE = '#14101e';

/* rejilla de cabeza con contorno, calculada una sola vez */
function headOf(def) {
  if (!def._head) {
    def._head = outlineGrid(def.head, '#');
    def._pal = Object.assign({ '#': OUTLINE }, def.pal);
  }
  return def;
}

/* ---------------------------------------------------------
   Piezas del cuerpo: devuelve rectángulos en coordenadas
   locales (pies en 0,0 mirando a la derecha).
   --------------------------------------------------------- */
function bodyRects(def, A) {
  const B = def.body;
  const legC = B.legs || B.main, legD = B.legsDark || B.dark;
  const skin = B.skin;
  const aw = B.bulk ? 5 : 4;
  const R = [];
  const add = (x, y, w, h, c) => R.push({ x, y, w, h, c });

  const cr = A.crouch;                       // 0..8
  const shinH = 10 - cr * 0.5, thighH = 10 - cr * 0.5;
  const hipY = -(shinH + thighH);
  const waistY = hipY - 6 + (A.bob || 0);
  const chestY = waistY - 8;
  const shoulderY = chestY - 4;
  const neckY = shoulderY - 2;

  /* ---- piernas ---- */
  if (A.kick > 0) {
    add(-6, hipY, 6, thighH, legD);
    add(-5, hipY + thighH, 5, shinH, legD);
    add(-7, -2, 7, 2, tint(legD, -0.45));
    const ky = A.kickHigh ? chestY + 2 : hipY + 4;
    const kl = 6 + 12 * A.kick;
    add(0, ky, kl, 5, legC);
    add(kl, ky - 1, 6, 6, tint(legC, -0.3));
  } else if (A.air) {
    add(-6, hipY + 3, 6, thighH, legD);
    add(-8, hipY + thighH + 2, 6, shinH - 2, legD);
    add(-9, hipY + thighH + shinH - 1, 7, 3, tint(legD, -0.45));
    add(1, hipY, 6, thighH, legC);
    add(2, hipY + thighH - 1, 6, shinH - 3, legC);
    add(2, hipY + thighH + shinH - 4, 7, 3, tint(legC, -0.3));
  } else {
    const sw = Math.round(Math.sin(A.walk) * 3);
    add(-6 - sw, hipY, 6, thighH, legD);
    add(-5 - sw, hipY + thighH, 5, shinH, legD);
    add(-7 - sw, -2, 7, 2, tint(legD, -0.45));
    add(0 + sw, hipY, 6, thighH, legC);
    add(1 + sw, hipY + thighH, 5, shinH, legC);
    add(0 + sw, -2, 7, 2, tint(legC, -0.3));
  }

  /* ---- torso: cintura, pecho y hombros ---- */
  add(-5, waistY, 11, 7, B.main);
  add(-6, chestY, 13, 8, B.main);
  add(-7, shoulderY, 15, 4, tint(B.main, 0.06));
  add(-2, neckY, 5, 3, skin);

  /* detalles según la ropa */
  const st = B.style;
  if (st === 'suit') {
    add(-3, shoulderY + 1, 6, 11, B.light);
    add(-1, shoulderY + 2, 2, 9, B.accent);
    add(-7, shoulderY, 4, 8, B.dark);
    add(3, shoulderY, 4, 8, B.dark);
  } else if (st === 'jacket') {
    add(-3, shoulderY + 1, 6, 15, B.light);
    add(-7, shoulderY, 4, 15, B.dark);
    add(3, shoulderY, 4, 15, B.dark);
    add(-1, chestY + 2, 2, 2, B.accent);
  } else if (st === 'stripes') {
    add(-6, chestY, 2, 8, B.light);
    add(-1, chestY, 2, 8, B.light);
    add(4, chestY, 2, 8, B.light);
    add(-4, waistY, 2, 7, B.light);
    add(1, waistY, 2, 7, B.light);
    add(-3, shoulderY, 6, 2, B.dark);
  } else if (st === 'jersey') {
    add(-3, shoulderY, 6, 2, B.light);
    add(-7, shoulderY + 3, 15, 1, B.light);
    add(2, chestY + 2, 2, 5, B.light);
    add(1, chestY + 2, 3, 1, B.light);
  } else if (st === 'chef') {
    add(-6, shoulderY + 1, 13, 2, B.accent);
    for (let i = 0; i < 3; i++) {
      add(-3, chestY + 1 + i * 3, 1, 1, B.accent);
      add(1, chestY + 1 + i * 3, 1, 1, B.accent);
    }
    add(-5, waistY + 2, 11, 5, B.dark);
  } else if (st === 'shirt') {
    add(-3, shoulderY + 1, 6, 3, B.light);
    add(-1, chestY + 2, 1, 10, B.dark);
    add(-5, waistY + 4, 11, 3, B.dark);
  } else if (st === 'tee') {
    add(-3, shoulderY, 6, 2, B.dark);
    add(-7, shoulderY, 3, 6, B.light);
    add(4, shoulderY, 3, 6, B.light);
    add(-2, chestY + 4, 4, 1, B.accent);
  }

  /* ---- brazos (manga corta = antebrazo de piel) ---- */
  const shortSleeve = (st === 'tee' || st === 'jersey' || st === 'stripes');
  const foreC = shortSleeve ? skin : B.main;
  const foreD = shortSleeve ? tint(skin, -0.18) : B.dark;
  if (A.cast > 0) {
    add(-4, shoulderY - 3, 9, aw, B.dark);
    add(5, shoulderY - 5, 5, 5, skin);
    add(3, shoulderY - 6, 9, aw, B.main);
    add(12, shoulderY - 8, 5, 5, skin);
  } else if (A.punch > 0) {
    const up = A.punchUp ? Math.round(11 * A.punch) : 0;
    const len = 6 + 11 * A.punch;
    add(-8, shoulderY + 2, aw, 6, B.dark);
    add(-8, shoulderY + 8, aw, 5, foreD);
    add(4, shoulderY + 2 - up, 5, aw + 1, B.main);
    add(9, shoulderY + 2 - up, len - 5, aw + 1, foreC);
    add(4 + len, shoulderY + 1 - up - (A.punchUp ? 3 : 0), 5, 5, skin);
  } else if (A.block) {
    add(-8, shoulderY + 2, aw, 11, B.dark);
    add(3, shoulderY, aw + 1, 14, B.dark);
    add(3, shoulderY, aw + 1, 3, B.light);
    add(4, shoulderY + 12, 4, 4, skin);
  } else {
    const sw = Math.round(Math.sin(A.walk) * 3);
    add(-8, shoulderY + 2 + sw, aw, 5, B.dark);
    add(-8, shoulderY + 7 + sw, aw, 5, foreD);
    add(-8, shoulderY + 11 + sw, 4, 4, tint(skin, -0.15));
    add(5, shoulderY + 2 - sw, aw, 5, B.main);
    add(5, shoulderY + 7 - sw, aw, 5, foreC);
    add(5, shoulderY + 11 - sw, 4, 4, skin);
  }

  return { rects: R, headY: neckY - 12 };
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
  if (A.ko > 0) {
    ctx.translate(0, -6);
    ctx.rotate(-A.ko * Math.PI / 2);
    ctx.translate(0, 6);
  }

  if (A.spin) { drawSpin(ctx, def, A); ctx.restore(); return; }

  const parts = bodyRects(def, A);
  const R = parts.rects;

  /* 1) silueta: se calca todo en oscuro alrededor */
  ctx.fillStyle = OUTLINE;
  const OFF = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const o of OFF)
    for (const p of R)
      ctx.fillRect(Math.round(p.x + o[0]), Math.round(p.y + o[1]), Math.round(p.w), Math.round(p.h));

  /* 2) relleno con luz arriba y sombra abajo */
  for (const p of R) {
    if (A.flash) Pix.r(ctx, p.x, p.y, p.w, p.h, '#ffffff');
    else if (p.h >= 4 && p.w >= 3) Pix.shade(ctx, p.x, p.y, p.w, p.h, p.c);
    else Pix.r(ctx, p.x, p.y, p.w, p.h, p.c);
  }

  /* 3) cabeza (ya trae su propio contorno) */
  Pix.grid(ctx, def._head, A.flash ? WHITE_PAL : def._pal, -7, parts.headY - 1);

  ctx.restore();
}

const WHITE_PAL = new Proxy({}, { get: (o, k) => k === '#' ? OUTLINE : '#ffffff' });

/* torbellino de los especiales de embestida */
function drawSpin(ctx, def, A) {
  const B = def.body;
  for (let i = 0; i < 6; i++) {
    const y = -46 + i * 8;
    const w = 24 - Math.abs(i - 2.5) * 4;
    const x = -w / 2 + Math.sin(A.walk * 2 + i) * 3;
    Pix.r(ctx, x - 1, y - 1, w + 2, 8, OUTLINE);
    Pix.shade(ctx, x, y, w, 6, i % 2 ? B.main : tint(B.main, 0.25));
  }
  Pix.grid(ctx, headOf(def)._head, def._pal, -7, -58);
  Pix.r(ctx, -16, -36, 2, 22, 'rgba(255,255,255,0.55)');
  Pix.r(ctx, 14, -42, 2, 22, 'rgba(255,255,255,0.55)');
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

function drawStage(ctx, id, t) {
  switch (id) {
    case 'azotea': stageAzotea(ctx, t); break;
    case 'mercado': stageMercado(ctx, t); break;
    case 'salon': stageSalon(ctx, t); break;
    default: stageDojo(ctx, t); break;
  }
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
  const cols = ['#e0343c', '#48e0d0', '#f5c542', '#4ad14a'];
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

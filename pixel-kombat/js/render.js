/* =========================================================
   render.js — dibujo de luchadores y escenarios
   Los cuerpos son parametricos (rectangulos chunky) y la
   cabeza es un pixel-grid por personaje.
   ========================================================= */

const WHITE_PAL = new Proxy({}, { get: () => '#ffffff' });

function drawFighter(ctx, f) {
  const def = f.def, B = def.body, A = f.animParams();
  const flash = A.flash;
  const C = c => flash ? '#ffffff' : c;

  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.scale(f.dir, 1);

  if (A.ko > 0) {
    ctx.translate(0, -5);
    ctx.rotate(-A.ko * Math.PI / 2);
    ctx.translate(0, 5);
  }

  if (A.spin) { drawSpin(ctx, def, A); ctx.restore(); return; }

  const crouch = A.crouch;
  const legLen = 16 - crouch;
  const hipY = -legLen;
  const torsoTop = hipY - 16 + A.bob;
  const shoulderY = torsoTop + 3;
  const swing = Math.round(Math.sin(A.walk) * 3);
  const foot = '#22252f';
  const legC = B.legs || B.main, legD = B.legsDark || B.dark;
  const aw = B.bulk ? 4 : 3;

  /* ---------- piernas ---------- */
  if (A.kick > 0) {
    Pix.r(ctx, -5, hipY, 4, legLen, C(legD));
    Pix.r(ctx, -6, hipY + legLen - 2, 6, 2, C(foot));
    const ky = A.kickHigh ? hipY - 7 : hipY + Math.max(0, legLen - 6);
    const kl = 5 + 11 * A.kick;
    Pix.r(ctx, 1, ky, kl, 4, C(legC));
    Pix.r(ctx, 1 + kl, ky - 1, 5, 5, C(foot));
  } else if (A.air) {
    Pix.r(ctx, -5, hipY + 2, 4, legLen - 5, C(legD));
    Pix.r(ctx, -7, hipY + legLen - 3, 6, 3, C(foot));
    Pix.r(ctx, 1, hipY, 4, legLen - 4, C(legC));
    Pix.r(ctx, 1, hipY + legLen - 4, 6, 3, C(foot));
  } else {
    Pix.r(ctx, -5 - swing, hipY, 4, legLen, C(legD));
    Pix.r(ctx, -6 - swing, hipY + legLen - 2, 6, 2, C(foot));
    Pix.r(ctx, 1 + swing, hipY, 4, legLen, C(legC));
    Pix.r(ctx, 1 + swing, hipY + legLen - 2, 6, 2, C(foot));
  }

  /* ---------- torso ---------- */
  drawTorso(ctx, B, torsoTop, C, A);

  /* ---------- brazo trasero ---------- */
  if (A.cast > 0) {
    Pix.r(ctx, -2, shoulderY - 2, 9, 3, C(B.dark));
    Pix.r(ctx, 7, shoulderY - 3, 4, 4, C(B.skin));
  } else {
    Pix.r(ctx, -8, shoulderY + swing, aw, 9, C(B.dark));
  }

  /* ---------- brazo delantero ---------- */
  if (A.punch > 0) {
    const up = A.punchUp ? Math.round(10 * A.punch) : 0;
    const len = 5 + 10 * A.punch;
    Pix.r(ctx, 4, shoulderY + 3 - up, len, 3, C(B.main));
    Pix.r(ctx, 4 + len, shoulderY + 2 - up - (A.punchUp ? 3 : 0), 4, 4, C(B.skin));
    if (A.punchUp) Pix.r(ctx, 4 + len - 2, shoulderY - up - 1, 3, 5, C(B.main));
  } else if (A.cast > 0) {
    Pix.r(ctx, 4, shoulderY - 4, 8, 3, C(B.main));
    Pix.r(ctx, 12, shoulderY - 5, 4, 4, C(B.skin));
  } else if (A.block) {
    Pix.r(ctx, 3, shoulderY - 1, 4, 12, C(B.dark));
    Pix.r(ctx, 3, shoulderY - 1, 4, 3, C(B.light));
  } else {
    Pix.r(ctx, 5, shoulderY - swing, aw, 9, C(B.main));
    Pix.r(ctx, 5, shoulderY - swing + 9, 4, 4, C(B.skin));
  }

  /* ---------- cabeza ---------- */
  const hx = A.block ? -5 : -6;
  Pix.grid(ctx, def.head, flash ? WHITE_PAL : def.pal, hx, torsoTop - 12);

  ctx.restore();
}

function drawTorso(ctx, B, top, C, A) {
  Pix.r(ctx, -6, top, 12, 16, C(B.main));
  switch (B.style) {
    case 'suit':
      Pix.r(ctx, -3, top, 6, 11, C(B.light));
      Pix.r(ctx, -1, top + 1, 2, 9, C(B.accent));
      Pix.r(ctx, -6, top, 3, 6, C(B.dark));
      Pix.r(ctx, 3, top, 3, 6, C(B.dark));
      break;
    case 'dress':
      Pix.r(ctx, -8, top + 11, 16, 8, C(B.main));
      Pix.r(ctx, -4, top + 12, 8, 7, C(B.light));
      Pix.r(ctx, -6, top, 12, 3, C(B.light));
      Pix.r(ctx, -2, top + 4, 4, 2, C(B.accent));
      break;
    case 'fur':
      Pix.r(ctx, -3, top + 4, 7, 12, C(B.light));
      Pix.r(ctx, -6, top, 12, 3, C(B.dark));
      break;
    case 'veggie':
      Pix.r(ctx, -5, top + 3, 3, 3, C(B.light));
      Pix.r(ctx, 1, top + 7, 3, 3, C(B.light));
      Pix.r(ctx, -3, top + 11, 3, 3, C(B.light));
      break;
    case 'machine':
      Pix.r(ctx, -4, top + 3, 8, 8, C(B.dark));
      Pix.r(ctx, -3, top + 5, 2, 2, C(B.accent));
      Pix.r(ctx, 0, top + 5, 2, 2, C(A.bob ? B.light : B.dark));
      Pix.r(ctx, -6, top + 13, 12, 3, C(B.light));
      break;
    case 'jacket':                                   // cazadora abierta
      Pix.r(ctx, -3, top, 6, 16, C(B.light));
      Pix.r(ctx, -6, top, 3, 14, C(B.dark));
      Pix.r(ctx, 3, top, 3, 14, C(B.dark));
      Pix.r(ctx, -1, top + 3, 2, 2, C(B.accent));
      break;
    case 'stripes':                                  // camiseta a rayas
      Pix.r(ctx, -6, top, 2, 16, C(B.light));
      Pix.r(ctx, -1, top, 2, 16, C(B.light));
      Pix.r(ctx, 4, top, 2, 16, C(B.light));
      Pix.r(ctx, -3, top, 6, 2, C(B.dark));
      Pix.r(ctx, -6, top + 13, 12, 3, C(B.light));
      break;
    case 'jersey':                                   // camiseta lisa con cuello
      Pix.r(ctx, -3, top, 6, 2, C(B.light));
      Pix.r(ctx, -6, top + 13, 12, 3, C(B.light));
      Pix.r(ctx, 2, top + 4, 2, 5, C(B.light));
      Pix.r(ctx, 1, top + 4, 3, 1, C(B.light));
      break;
    case 'chef':                                     // chaquetilla con botones
      Pix.r(ctx, -6, top, 12, 2, C(B.accent));
      Pix.r(ctx, -3, top + 3, 1, 1, C(B.accent));
      Pix.r(ctx, -3, top + 6, 1, 1, C(B.accent));
      Pix.r(ctx, -3, top + 9, 1, 1, C(B.accent));
      Pix.r(ctx, 1, top + 3, 1, 1, C(B.accent));
      Pix.r(ctx, 1, top + 6, 1, 1, C(B.accent));
      Pix.r(ctx, 1, top + 9, 1, 1, C(B.accent));
      Pix.r(ctx, -6, top + 12, 12, 4, C(B.dark));
      break;
    case 'shirt':                                    // camisa remangada
      Pix.r(ctx, -3, top, 6, 3, C(B.light));
      Pix.r(ctx, -1, top + 3, 1, 10, C(B.dark));
      Pix.r(ctx, -6, top + 12, 12, 2, C(B.dark));
      Pix.r(ctx, 4, top + 2, 2, 6, C(B.light));
      break;
    case 'tee':                                      // camiseta ajustada
      Pix.r(ctx, -3, top, 6, 2, C(B.dark));
      Pix.r(ctx, -6, top, 2, 6, C(B.light));
      Pix.r(ctx, 4, top, 2, 6, C(B.light));
      Pix.r(ctx, -2, top + 5, 4, 1, C(B.accent));
      break;
  }
}

/* torbellino para los especiales tipo 'dash' */
function drawSpin(ctx, def, A) {
  const B = def.body;
  for (let i = 0; i < 5; i++) {
    const y = -38 + i * 8;
    const w = 22 - Math.abs(i - 2) * 4;
    Pix.r(ctx, -w / 2 + Math.sin(A.walk * 2 + i) * 3, y, w, 6, i % 2 ? B.main : B.light);
  }
  Pix.grid(ctx, def.head, def.pal, -6, -50);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(-14, -30, 2, 20);
  ctx.fillRect(12, -34, 2, 20);
}

/* pose neutra para retratos */
const IDLE_ANIM = {
  crouch: 0, punch: 0, kick: 0, cast: 0, walk: 0, air: false, ko: 0,
  bob: 0, block: false, flash: false, spin: false, kickHigh: false, punchUp: false
};

/* dibuja a un personaje suelto (menus, VS, seleccion) */
function drawPose(ctx, def, x, y, dir, scale, anim) {
  const dummy = { def, x: 0, y: 0, dir: dir || 1, animParams: () => anim || IDLE_ANIM };
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (scale && scale !== 1) ctx.scale(scale, scale);
  drawFighter(ctx, dummy);
  ctx.restore();
}

/* ---------- retratos para el menu de seleccion ---------- */
function renderPortrait(canvas, def, scaleY) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, '#232c46'); g.addColorStop(1, '#0e1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  Pix.shadow(ctx, canvas.width / 2, canvas.height - 4, 22);
  const dummy = {
    def, x: canvas.width / 2, y: canvas.height - 4, dir: 1,
    animParams: () => ({ crouch: 0, punch: 0, kick: 0, cast: 0, walk: 0, air: false, ko: 0, bob: 0, block: false, flash: false, spin: false, kickHigh: false, punchUp: false })
  };
  drawFighter(ctx, dummy);
}

/* =========================================================
   ESCENARIOS
   ========================================================= */
const STAGES = [
  { id: 'azotea', name: 'AZOTEA NEÓN' },
  { id: 'mercado', name: 'MERCADO CÓSMICO' },
  { id: 'salon', name: 'RING DE SALÓN' },
  { id: 'dojo', name: 'DOJO DEL SÓTANO' }
];

function drawStage(ctx, id, t) {
  switch (id) {
    case 'azotea': return stageAzotea(ctx, t);
    case 'mercado': return stageMercado(ctx, t);
    case 'salon': return stageSalon(ctx, t);
    default: return stageDojo(ctx, t);
  }
}

function skyBands(ctx, colors) {
  const h = GROUND / colors.length;
  colors.forEach((c, i) => Pix.r(ctx, 0, i * h, W, h + 1, c));
}

function crowd(ctx, y, t, colors) {
  for (let i = 0; i < 26; i++) {
    const x = 4 + i * 12 + (i % 3) * 3;
    const bob = Math.sin(t / 14 + i) > 0.4 ? 1 : 0;
    const c = colors[i % colors.length];
    Pix.r(ctx, x, y - 5 - bob, 5, 5, c);
    Pix.r(ctx, x + 1, y - 8 - bob, 3, 3, '#e2b48c');
  }
}

function stageAzotea(ctx, t) {
  skyBands(ctx, ['#1b1035', '#2a1748', '#3d1f52', '#5a2a55']);
  Pix.circle(ctx, 258, 34, 12, '#f5efc0');
  Pix.circle(ctx, 253, 30, 4, '#dcd6a8');
  for (let i = 0; i < 40; i++) {
    const x = (i * 71) % W, y = (i * 37) % 70;
    if (Math.sin(t / 20 + i) > -0.3) Pix.r(ctx, x, y, 1, 1, '#fff');
  }
  const b = [[6, 60], [40, 84], [78, 48], [110, 96], [150, 70], [186, 110], [232, 62], [268, 92]];
  b.forEach((v, i) => {
    const bh = v[1], x = v[0];
    Pix.r(ctx, x, GROUND - 22 - bh, 34, bh + 22, i % 2 ? '#141a2e' : '#1b2340');
    for (let wy = GROUND - 20 - bh; wy < GROUND - 24; wy += 7)
      for (let wx = x + 3; wx < x + 30; wx += 7)
        Pix.r(ctx, wx, wy, 3, 3, ((wx + wy + i) % 5) ? '#2b3352' : '#f5c542');
  });
  Pix.r(ctx, 24, 40, 30, 12, '#e0343c');
  Pix.r(ctx, 26, 42, 26, 8, Math.sin(t / 12) > 0 ? '#ff6b73' : '#8f1218');
  Pix.r(ctx, 200, 30, 12, 26, '#48e0d0');
  Pix.r(ctx, 202, 32, 8, 22, Math.sin(t / 9) > -0.5 ? '#a8fff4' : '#1c9c92');
  crowd(ctx, GROUND - 22, t, ['#3d4a6b', '#5a3a5f', '#2f5a52']);
  Pix.r(ctx, 0, GROUND - 22, W, 22, '#232a3d');
  Pix.r(ctx, 0, GROUND, W, H - GROUND, '#3a4055');
  Pix.r(ctx, 0, GROUND, W, 2, '#5c637d');
  for (let x = 0; x < W; x += 16) Pix.r(ctx, x, GROUND + 8, 10, 2, '#f5c542');
  for (let x = 6; x < W; x += 24) Pix.r(ctx, x, GROUND + 18, 14, 1, '#2c3145');
}

function stageMercado(ctx, t) {
  skyBands(ctx, ['#0d0620', '#1c0c3a', '#2d1152', '#431a63']);
  Pix.circle(ctx, 60, 40, 16, '#7b4bd4');
  Pix.circle(ctx, 55, 36, 5, '#a87bf0');
  Pix.r(ctx, 40, 40, 40, 1, '#c9a6ff');
  Pix.circle(ctx, 240, 28, 8, '#f0932b');
  for (let i = 0; i < 60; i++) {
    const x = (i * 53) % W, y = (i * 29) % 90;
    Pix.r(ctx, x, y, 1, 1, i % 4 ? '#fff' : '#c9a6ff');
  }
  for (let s = 0; s < 4; s++) {
    const x = 8 + s * 80;
    Pix.r(ctx, x, GROUND - 46, 60, 6, ['#e0343c', '#48e0d0', '#f5c542', '#4ad14a'][s]);
    Pix.r(ctx, x, GROUND - 40, 60, 18, '#241a3d');
    Pix.r(ctx, x + 2, GROUND - 40, 3, 18, '#3a2a5c');
    for (let i = 0; i < 5; i++)
      Pix.circle(ctx, x + 12 + i * 9, GROUND - 30, 3, ['#f07ac0', '#4ad14a', '#f5c542'][i % 3]);
    Pix.r(ctx, x + 26, GROUND - 46, 2, 24, '#3a2a5c');
  }
  crowd(ctx, GROUND - 22, t, ['#4a2a6b', '#6b2a4a', '#2a4a6b']);
  Pix.r(ctx, 0, GROUND - 22, W, 22, 'rgba(20,10,40,0.55)');
  Pix.r(ctx, 0, GROUND, W, H - GROUND, '#2c1f47');
  Pix.r(ctx, 0, GROUND, W, 2, '#4a3670');
  for (let x = 0; x < W; x += 20) Pix.r(ctx, x, GROUND + 4, 18, 1, '#3b2a5c');
}

function stageSalon(ctx, t) {
  Pix.r(ctx, 0, 0, W, GROUND, '#5e4636');
  for (let x = 0; x < W; x += 26) Pix.r(ctx, x, 0, 2, GROUND, '#4a372a');
  Pix.r(ctx, 0, 26, W, 4, '#7a5e48');
  Pix.r(ctx, 18, 44, 52, 40, '#3b2c22');
  Pix.r(ctx, 22, 48, 44, 32, Math.sin(t / 8) > 0 ? '#48e0d0' : '#2f9fa0');
  Pix.r(ctx, 26, 56, 12, 4, '#0c1420');
  Pix.r(ctx, 26, 64, 30, 3, '#0c1420');
  Pix.r(ctx, 36, 84, 16, 6, '#2a1f18');
  Pix.r(ctx, 210, 34, 8, 50, '#8d6a4a');
  Pix.circle(ctx, 214, 32, 12, '#f5e0a0');
  Pix.r(ctx, 120, 60, 60, 26, '#7a4a3a');
  Pix.r(ctx, 124, 64, 52, 18, '#a3624a');
  Pix.r(ctx, 96, GROUND - 44, 130, 24, '#2f5a52');
  Pix.r(ctx, 96, GROUND - 50, 130, 8, '#3d7a6c');
  Pix.r(ctx, 108, GROUND - 44, 24, 10, '#4d9a86');
  Pix.r(ctx, 140, GROUND - 44, 24, 10, '#4d9a86');
  Pix.r(ctx, 172, GROUND - 44, 24, 10, '#4d9a86');
  crowd(ctx, GROUND - 20, t, ['#8d5a3a', '#5a3a8d', '#3a8d5a']);
  Pix.r(ctx, 0, GROUND, W, H - GROUND, '#8a4d3a');
  Pix.r(ctx, 0, GROUND, W, 2, '#a86a52');
  for (let x = 4; x < W; x += 18) {
    Pix.r(ctx, x, GROUND + 6, 12, 2, '#6f3a2c');
    Pix.r(ctx, x + 4, GROUND + 14, 12, 2, '#6f3a2c');
  }
}

function stageDojo(ctx, t) {
  Pix.r(ctx, 0, 0, W, GROUND, '#2a2118');
  for (let x = 0; x < W; x += 40) {
    Pix.r(ctx, x, 0, 6, GROUND, '#3d2f22');
    Pix.r(ctx, x + 6, 0, 34, GROUND, '#241c14');
  }
  Pix.r(ctx, 0, 20, W, 5, '#4a3a2a');
  for (let i = 0; i < 4; i++) {
    const x = 30 + i * 78;
    Pix.r(ctx, x, 25, 2, 10, '#1a140e');
    Pix.r(ctx, x - 6, 35, 14, 18, '#e0343c');
    Pix.r(ctx, x - 4, 37, 10, 14, Math.sin(t / 11 + i) > 0 ? '#ff8a7a' : '#c0292f');
    Pix.r(ctx, x - 2, 41, 6, 6, '#f5e0a0');
  }
  Pix.r(ctx, 118, 60, 84, 50, '#4a3a2a');
  Pix.r(ctx, 122, 64, 76, 42, '#f2e8d0');
  Pix.circle(ctx, 160, 85, 15, '#c0392b');
  crowd(ctx, GROUND - 18, t, ['#6b5a3a', '#3a4a6b', '#6b3a3a']);
  Pix.r(ctx, 0, GROUND, W, H - GROUND, '#6b5233');
  Pix.r(ctx, 0, GROUND, W, 2, '#8a6c46');
  for (let x = 0; x < W; x += 32) Pix.r(ctx, x, GROUND + 2, 2, H - GROUND, '#54401f');
}

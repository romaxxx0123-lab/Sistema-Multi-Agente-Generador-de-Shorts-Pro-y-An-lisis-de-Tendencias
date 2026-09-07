/* =========================================================
   ui.js — TODA la interfaz se dibuja dentro del lienzo.
   Ni un botón HTML, ni una tipografía del sistema.
   Resolución de trabajo: 320x180.
   ========================================================= */
const CO = {
  gold: '#f5c542', goldD: '#a8811f', goldL: '#fff2a8',
  cyan: '#48e0d0', red: '#e0343c', ink: '#0b0d16',
  panel: '#141a2b', panel2: '#1e2740', line: '#3a4560',
  white: '#e8ecf5', gray: '#8ea0c0', dim: '#5a6678'
};

const UI = {
  /* ---------- piezas ---------- */
  panel(ctx, x, y, w, h, fill, edge) {
    Pix.r(ctx, x, y, w, h, edge || CO.line);
    Pix.r(ctx, x + 1, y + 1, w - 2, h - 2, fill || CO.panel);
  },

  frame(ctx, x, y, w, h, c) {           // marco de 1px con esquinas marcadas
    Pix.r(ctx, x, y, w, 1, c); Pix.r(ctx, x, y + h - 1, w, 1, c);
    Pix.r(ctx, x, y, 1, h, c); Pix.r(ctx, x + w - 1, y, 1, h, c);
  },

  cursorBox(ctx, x, y, w, h, c, t) {    // recuadro animado de selección
    const on = (t % 30) < 20;
    if (!on) return;
    const L = 4;
    [[x, y, 1], [x + w - L, y, 1]].forEach(p => Pix.r(ctx, p[0], p[1], L, 1, c));
    [[x, y + h - 1], [x + w - L, y + h - 1]].forEach(p => Pix.r(ctx, p[0], p[1], L, 1, c));
    [[x, y], [x, y + h - L]].forEach(p => Pix.r(ctx, p[0], p[1], 1, L, c));
    [[x + w - 1, y], [x + w - 1, y + h - L]].forEach(p => Pix.r(ctx, p[0], p[1], 1, L, c));
  },

  /* barra de vida segmentada, estilo recreativa */
  lifeBar(ctx, x, y, w, h, pct, rtl) {
    Pix.r(ctx, x - 1, y - 1, w + 2, h + 2, '#000');
    Pix.r(ctx, x, y, w, h, '#3a1418');
    const fw = Math.round(w * clamp(pct, 0, 1));
    const fx = rtl ? x + w - fw : x;
    const low = pct <= 0.3;
    Pix.r(ctx, fx, y, fw, h, low ? '#e0343c' : '#e0a02a');
    Pix.r(ctx, fx, y, fw, 2, low ? '#ff8a7a' : '#ffe07a');
    Pix.r(ctx, fx, y + h - 1, fw, 1, low ? '#8f1218' : '#b76d14');
    for (let i = 10; i < w; i += 10) Pix.r(ctx, x + i, y, 1, h, 'rgba(0,0,0,0.30)');
    this.frame(ctx, x - 1, y - 1, w + 2, h + 2, '#6a7488');
  },

  meterBar(ctx, x, y, w, pct, rtl, t) {
    Pix.r(ctx, x, y, w, 3, '#101726');
    const fw = Math.round(w * clamp(pct, 0, 1));
    const full = pct >= 1;
    const c = full ? ((t % 16 < 8) ? CO.goldL : CO.gold) : CO.cyan;
    Pix.r(ctx, rtl ? x + w - fw : x, y, fw, 3, c);
    this.frame(ctx, x - 1, y - 1, w + 2, 5, '#2a3550');
  },

  pips(ctx, x, y, n, max, rtl) {
    for (let i = 0; i < max; i++) {
      const px = rtl ? x - i * 6 - 4 : x + i * 6;
      Pix.r(ctx, px, y, 4, 4, i < n ? CO.gold : '#2a3550');
      this.frame(ctx, px, y, 4, 4, '#000');
    }
  },

  /* ---------- fondo de menú ---------- */
  menuBackdrop(ctx, alpha) {
    ctx.fillStyle = 'rgba(6,7,14,' + (alpha === undefined ? 0.72 : alpha) + ')';
    ctx.fillRect(0, 0, W, H);
  },

  /* ---------- TÍTULO ---------- */
  TITLE_ITEMS: ['1 JUGADOR', '2 JUGADORES', 'CONTROLES'],
  titleItemRect(i) { return { x: 96, y: 108 + i * 14, w: 128, h: 11 }; },

  drawTitle(ctx, G) {
    this.menuBackdrop(ctx, 0.74);
    const t = G.t;
    const bob = Math.sin(t / 24) > 0 ? 0 : 1;
    Text.draw(ctx, 'PIXEL', W / 2 - 2, 18 + bob, CO.cyan, 'center', 3);
    Text.draw(ctx, 'KOMBAT', W / 2, 40 + bob, CO.gold, 'center', 4);
    Pix.r(ctx, 60, 76, 200, 1, CO.goldD);
    Text.draw(ctx, 'TORNEO DE FAMOSOS INEXPLICABLE', W / 2, 82, CO.gray, 'center', 1);

    this.TITLE_ITEMS.forEach((it, i) => {
      const r = this.titleItemRect(i);
      const sel = G.menu === i;
      if (sel) this.panel(ctx, r.x, r.y, r.w, r.h, '#242f4c', CO.gold);
      Text.draw(ctx, it, W / 2, r.y + 2, sel ? CO.goldL : CO.gray, 'center', 1);
      if (sel && (t % 30) < 20) Text.draw(ctx, '>', r.x + 6, r.y + 2, CO.gold, 'left', 1);
    });

    Text.draw(ctx, 'MOVER: W/S O FLECHAS   ELEGIR: F / J / ENTER', W / 2, 154, CO.dim, 'center', 1);
    Text.draw(ctx, 'PARODIAS FICTICIAS. NADIE FUE CONSULTADO.', W / 2, 166, CO.dim, 'center', 1);
  },

  /* ---------- CONTROLES ---------- */
  drawHowto(ctx, G) {
    this.menuBackdrop(ctx, 0.88);
    Text.draw(ctx, 'CONTROLES', W / 2, 6, CO.gold, 'center', 2);
    const rows = [
      ['', 'JUG. 1', 'JUG. 2'],
      ['MOVER', 'A / D', '< / >'],
      ['SALTAR', 'W', 'ARRIBA'],
      ['AGACHAR', 'S', 'ABAJO'],
      ['PUÑO', 'F', 'J'],
      ['PATADA', 'G', 'K'],
      ['ESPECIAL', 'H', 'L'],
      ['SUPER', 'T', 'O'],
      ['BURLA', 'R', 'P']
    ];
    rows.forEach((r, i) => {
      const y = 26 + i * 10;
      const c = i === 0 ? CO.cyan : CO.white;
      Text.draw(ctx, r[0], 16, y, i === 0 ? CO.cyan : CO.gray, 'left', 1);
      Text.draw(ctx, r[1], 78, y, c, 'left', 1);
      Text.draw(ctx, r[2], 116, y, c, 'left', 1);
    });
    Text.draw(ctx, 'BLOQUEAR: MANTÉN ATRÁS', 16, 122, CO.gold, 'left', 1);
    Text.draw(ctx, 'UPPERCUT: ABAJO+PUÑO', 16, 132, CO.gold, 'left', 1);
    Text.draw(ctx, 'BARRIDA: ABAJO+PATADA', 16, 142, CO.gold, 'left', 1);
    Text.draw(ctx, 'ESC PAUSA · M SILENCIO', 16, 152, CO.gray, 'left', 1);

    /* tabla de tipos */
    Text.draw(ctx, 'TIPOS: CADA UNO PEGA +40% A', 175, 26, CO.cyan, 'left', 1);
    Object.keys(TYPES).forEach((id, i) => {
      const y = 38 + i * 13;
      drawTypeIcon(ctx, id, 175, y - 1);
      Text.draw(ctx, TYPES[id].name, 185, y, TYPES[id].color, 'left', 1);
      CHART[id].strong.forEach((s, j) => drawTypeIcon(ctx, s, 248 + j * 9, y - 1));
    });
    Text.draw(ctx, 'PULSA ESC PARA VOLVER', W / 2, 168, CO.dim, 'center', 1);
  },

  /* ---------- SELECCIÓN ---------- */
  CELL: { w: 40, h: 60, gx: 6, gy: 6, x0: 71, y0: 12 },
  cellRect(i) {
    const c = this.CELL;
    return { x: c.x0 + (i % 4) * (c.w + c.gx), y: c.y0 + Math.floor(i / 4) * (c.h + c.gy), w: c.w, h: c.h };
  },

  drawSelect(ctx, G) {
    ctx.fillStyle = '#0a0c16'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < 140; y += 4) Pix.r(ctx, 0, y, W, 1, '#0d1020');

    const who = G.picks[0] === null ? 'JUGADOR 1' : (G.mode === '2p' ? 'JUGADOR 2' : 'LA MÁQUINA');
    Text.draw(ctx, 'ESC: VOLVER', 6, 3, CO.dim, 'left', 1);
    Text.draw(ctx, who + ': ELIGE PERSONAJE', W / 2 + 20, 3, CO.gold, 'center', 1);

    ROSTER.forEach((def, i) => {
      const r = this.cellRect(i);
      const p1 = (G.picks[0] === null ? G.cur[0] : G.picks[0]) === i;
      const p2 = (G.mode === '2p' || G.picks[0] !== null) && (G.picks[1] === null ? G.cur[1] : G.picks[1]) === i;
      this.panel(ctx, r.x, r.y, r.w, r.h, p1 || p2 ? '#1b2540' : '#121728', p1 || p2 ? CO.line : '#1c2338');
      drawTypeIcon(ctx, def.type, r.x + 2, r.y + 2);
      drawPose(ctx, def, r.x + r.w / 2 + 3, r.y + r.h - 11, 1, 1);
      Pix.r(ctx, r.x + 1, r.y + r.h - 10, r.w - 2, 9, '#0c1020');
      Text.draw(ctx, def.short, r.x + r.w / 2, r.y + r.h - 9, p1 || p2 ? CO.white : CO.gray, 'center', 1);
      if (p1) this.cursorBox(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, CO.cyan, G.t);
      if (p2) this.cursorBox(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, CO.red, G.t + 15);
      if (G.picks[0] === i) Text.draw(ctx, 'P1', r.x + 2, r.y + 11, CO.cyan, 'left', 1);
      if (G.picks[1] === i) Text.draw(ctx, 'P2', r.x + r.w - 2, r.y + 11, CO.red, 'right', 1);
    });

    /* ficha del personaje señalado */
    const hov = ROSTER[G.picks[0] === null ? G.cur[0] : (G.picks[1] === null ? G.cur[1] : G.picks[1])];
    this.panel(ctx, 4, 140, W - 8, 38, '#101728', CO.line);
    Text.draw(ctx, hov.name, 9, 143, CO.gold, 'left', 2);
    const tw = drawTypeTag(ctx, hov.type, 9, 159, 1);
    Text.draw(ctx, '/ ' + hov.sub, 9 + tw + 5, 159, CO.dim, 'left', 1);
    Text.draw(ctx, hov.title, W - 9, 143, CO.cyan, 'right', 1);
    Text.draw(ctx, 'ESP: ' + hov.special.name, W - 9, 152, CO.white, 'right', 1);
    Text.draw(ctx, 'SUP: ' + hov.superMove.name, W - 9, 161, CO.white, 'right', 1);

    let footer;
    if (G.rouletteT > 0) footer = 'LA MÁQUINA ESTÁ DECIDIENDO...';
    else if (G.picks[0] !== null) {
      const other = ROSTER[G.picks[1] !== null ? G.picks[1] : G.cur[1]];
      footer = matchupLine(ROSTER[G.picks[0]].type, other.type);
    } else footer = hov.bio;
    Text.draw(ctx, footer.length > 52 ? footer.slice(0, 51) + '.' : footer, W / 2, 170,
      G.rouletteT > 0 ? CO.red : CO.goldL, 'center', 1);
  },

  /* ---------- VS ---------- */
  drawVs(ctx, G) {
    ctx.fillStyle = '#0a0c16'; ctx.fillRect(0, 0, W, H);
    const t = G.t;
    for (let i = 0; i < 8; i++) {
      const y = (i * 23 + t * 2) % H;
      Pix.r(ctx, 0, y, W, 2, '#121a30');
    }
    const a = ROSTER[G.picks[0]], b = ROSTER[G.picks[1]];
    const slide = Math.min(1, t / 20);
    const ax = Math.round(-40 + 108 * slide), bx = Math.round(W + 40 - 108 * slide);

    drawPose(ctx, a, ax / 2, 62, 1, 2);
    drawPose(ctx, b, bx / 2, 62, -1, 2);

    Text.draw(ctx, a.name, 68, 132, CO.cyan, 'center', 1);
    Text.draw(ctx, b.name + (G.mode === '1p' ? ' (CPU)' : ''), W - 68, 132, CO.red, 'center', 1);
    drawTypeTag(ctx, a.type, 68 - Math.round((9 + Text.w(TYPES[a.type].name, 1)) / 2), 142, 1);
    drawTypeTag(ctx, b.type, W - 68 - Math.round((9 + Text.w(TYPES[b.type].name, 1)) / 2), 142, 1);

    if (t % 24 < 18) Text.draw(ctx, 'VS', W / 2, 60, CO.gold, 'center', 4);
    Pix.r(ctx, 8, 158, W - 16, 14, '#0e1424');
    this.frame(ctx, 8, 158, W - 16, 14, CO.goldD);
    const line = matchupLine(a.type, b.type);
    Text.draw(ctx, line.length > 50 ? line.slice(0, 49) + '.' : line, W / 2, 161, CO.goldL, 'center', 1);
  },

  /* ---------- HUD ---------- */
  drawHud(ctx, G) {
    const f1 = G.f1, f2 = G.f2, t = G.t;
    Pix.r(ctx, 0, 0, W, 30, 'rgba(6,8,16,0.55)');

    this.lifeBar(ctx, 6, 8, 128, 8, f1.hp / f1.maxHp, false);
    this.lifeBar(ctx, W - 134, 8, 128, 8, f2.hp / f2.maxHp, true);
    this.meterBar(ctx, 6, 19, 78, f1.meter / 100, false, t);
    this.meterBar(ctx, W - 84, 19, 78, f2.meter / 100, true, t);

    drawTypeIcon(ctx, f1.def.type, 6, 24);
    Text.draw(ctx, f1.def.short, 16, 25, CO.white, 'left', 1);
    drawTypeIcon(ctx, f2.def.type, W - 9, 24);
    Text.draw(ctx, f2.def.short + (f2.cpu ? ' CPU' : ''), W - 12, 25, CO.white, 'right', 1);

    this.pips(ctx, 88, 19, f1.wins, 2, false);
    this.pips(ctx, W - 88, 19, f2.wins, 2, true);

    const secs = Math.ceil(G.timer / 60);
    Text.draw(ctx, (secs < 10 ? '0' : '') + secs, W / 2, 4, secs <= 10 && t % 20 < 10 ? CO.red : CO.white, 'center', 2);
    Text.draw(ctx, 'ROUND ' + G.round, W / 2, 22, CO.gold, 'center', 1);

    if (f1.combo >= 2 && f1.comboT > 0) Text.draw(ctx, f1.combo + ' GOLPES', 8, 36, CO.cyan, 'left', 1);
    if (f2.combo >= 2 && f2.comboT > 0) Text.draw(ctx, f2.combo + ' GOLPES', W - 8, 36, CO.red, 'right', 1);

    const ch = G.world && G.world.chyron;
    if (ch) {
      const txt = ch.text.length > 50 ? ch.text.slice(0, 49) + '.' : ch.text;
      const w = Text.w(txt, 1) + 10;
      Pix.r(ctx, (W - w) / 2, 162, w, 11, 'rgba(6,8,16,0.8)');
      Pix.r(ctx, (W - w) / 2, 162, 2, 11, CO.gold);
      Pix.r(ctx, (W + w) / 2 - 2, 162, 2, 11, CO.gold);
      Text.draw(ctx, txt, W / 2, 165, CO.goldL, 'center', 1);
    }
  },

  /* ---------- ANUNCIOS ---------- */
  drawAnnounce(ctx, G) {
    const a = G.ann;
    if (!a) return;
    const age = G.t - a.t0;
    let sc = age < 3 ? 5 : (age < 6 ? 4 : 3);
    while (sc > 1 && Text.w(a.text, sc) > W - 12) sc--;    // que nunca se salga
    const y = 74 - sc * 4;
    Pix.r(ctx, 0, y - 3, W, Text.h(sc) + 6, 'rgba(6,8,16,0.45)');
    Text.draw(ctx, a.text, W / 2, y, a.color || CO.gold, 'center', sc);
  },

  /* ---------- PAUSA ---------- */
  PAUSE_ITEMS: ['CONTINUAR', 'SALIR AL MENÚ'],
  pauseItemRect(i) { return { x: 100, y: 92 + i * 14, w: 120, h: 11 }; },
  drawPause(ctx, G) {
    this.menuBackdrop(ctx, 0.72);
    Text.draw(ctx, 'PAUSA', W / 2, 58, CO.gold, 'center', 3);
    this.PAUSE_ITEMS.forEach((it, i) => {
      const r = this.pauseItemRect(i);
      const sel = G.menu === i;
      if (sel) this.panel(ctx, r.x, r.y, r.w, r.h, '#242f4c', CO.gold);
      Text.draw(ctx, it, W / 2, r.y + 2, sel ? CO.goldL : CO.gray, 'center', 1);
    });
  },

  /* ---------- RESULTADO ---------- */
  RESULT_ITEMS: ['REVANCHA', 'CAMBIAR PERSONAJE', 'MENÚ PRINCIPAL'],
  resultItemRect(i) { return { x: 92, y: 118 + i * 14, w: 136, h: 11 }; },
  drawResult(ctx, G) {
    this.menuBackdrop(ctx, 0.8);
    const w = G.winner;
    Text.draw(ctx, w.def.name, W / 2, 18, CO.gold, 'center', 2);
    Text.draw(ctx, 'GANA EL COMBATE', W / 2, 36, CO.white, 'center', 1);
    drawPose(ctx, w.def, W / 2, 104, 1, 1, {
      crouch: 0, punch: Math.sin(G.t / 6) > 0 ? 0.5 : 0.2, punchUp: true, kick: 0, cast: 0,
      walk: 0, air: false, ko: 0, bob: Math.sin(G.t / 6) > 0 ? 1 : 0, block: false, flash: false, spin: false, kickHigh: false
    });
    Text.wrap('"' + G.quote + '"', 46).forEach((l, i) =>
      Text.draw(ctx, l, W / 2, 108 + i * 9, CO.goldL, 'center', 1));
    this.RESULT_ITEMS.forEach((it, i) => {
      const r = this.resultItemRect(i);
      const sel = G.menu === i;
      if (sel) this.panel(ctx, r.x, r.y, r.w, r.h, '#242f4c', CO.gold);
      Text.draw(ctx, it, W / 2, r.y + 2, sel ? CO.goldL : CO.gray, 'center', 1);
    });
  }
};

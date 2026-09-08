/* =========================================================
   ui.js — chapa de recreativa. Todo dibujado en el lienzo:
   biseles, placas, retratos y marcadores. Nada de DOM.
   ========================================================= */
const CO = {
  ink: '#12081f', panel: '#241546', panel2: '#33205e', line: '#5a3d96',
  gold: '#ffcc33', goldL: '#fff2a8', goldD: '#a8681a',
  cyan: '#3ee0d0', red: '#ff4d5a', white: '#f2ecff',
  gray: '#a894d0', dim: '#6b5a99'
};

const UI = {
  /* ---------- piezas ---------- */
  plate(ctx, x, y, w, h, fill) {
    Pix.bevel(ctx, x, y, w, h, fill || CO.panel, tint(fill || CO.panel, 0.30), tint(fill || CO.panel, -0.40));
  },

  rivets(ctx, x, y, w, h, c) {
    [[x + 2, y + 2], [x + w - 3, y + 2], [x + 2, y + h - 3], [x + w - 3, y + h - 3]]
      .forEach(p => { Pix.r(ctx, p[0], p[1], 1, 1, c); });
  },

  frame(ctx, x, y, w, h, c) {
    Pix.r(ctx, x, y, w, 1, c); Pix.r(ctx, x, y + h - 1, w, 1, c);
    Pix.r(ctx, x, y, 1, h, c); Pix.r(ctx, x + w - 1, y, 1, h, c);
  },

  cursorBox(ctx, x, y, w, h, c, t) {
    const o = (t % 24) < 12 ? 0 : 1;
    const L = 5;
    const seg = [[x - o, y - o, L, 1], [x + w - L + o, y - o, L, 1],
                 [x - o, y + h - 1 + o, L, 1], [x + w - L + o, y + h - 1 + o, L, 1],
                 [x - o, y - o, 1, L], [x - o, y + h - L + o, 1, L],
                 [x + w - 1 + o, y - o, 1, L], [x + w - 1 + o, y + h - L + o, 1, L]];
    seg.forEach(s => Pix.r(ctx, s[0], s[1], s[2], s[3], c));
  },

  /* barra de vida con bisel y muescas */
  lifeBar(ctx, x, y, w, h, pct, rtl) {
    Pix.r(ctx, x - 2, y - 2, w + 4, h + 4, '#000');
    Pix.r(ctx, x - 1, y - 1, w + 2, h + 2, '#7a6aa8');
    Pix.r(ctx, x, y, w, h, '#3a0f1c');
    const fw = Math.round(w * clamp(pct, 0, 1));
    if (fw > 0) {
      const fx = rtl ? x + w - fw : x;
      const low = pct <= 0.3;
      Pix.r(ctx, fx, y, fw, h, low ? '#c02030' : '#d88a12');
      Pix.r(ctx, fx, y, fw, 2, low ? '#ff8a7a' : '#ffe07a');
      Pix.r(ctx, fx, y + 2, fw, 1, low ? '#ff4d5a' : '#ffc63a');
      Pix.r(ctx, fx, y + h - 1, fw, 1, low ? '#6a0e18' : '#8a4a08');
    }
    for (let i = 12; i < w; i += 12) Pix.r(ctx, x + i, y, 1, h, 'rgba(0,0,0,0.35)');
  },

  meterBar(ctx, x, y, w, pct, rtl, t) {
    Pix.r(ctx, x - 1, y - 1, w + 2, 6, '#000');
    Pix.r(ctx, x, y, w, 4, '#1b1030');
    const fw = Math.round(w * clamp(pct, 0, 1));
    const full = pct >= 1;
    if (fw > 0) {
      const c = full ? ((t % 14 < 7) ? CO.goldL : CO.gold) : CO.cyan;
      const fx = rtl ? x + w - fw : x;
      Pix.r(ctx, fx, y, fw, 4, c);
      Pix.r(ctx, fx, y, fw, 1, tint(c, 0.4));
    }

  },

  pips(ctx, x, y, n, max, rtl) {
    for (let i = 0; i < max; i++) {
      const px = rtl ? x - i * 7 - 5 : x + i * 7;
      Pix.r(ctx, px - 1, y - 1, 7, 7, '#000');
      Pix.r(ctx, px, y, 5, 5, i < n ? CO.gold : '#2a1a4a');
      if (i < n) Pix.r(ctx, px, y, 5, 1, CO.goldL);
    }
  },

  /* retrato con marco */
  portrait(ctx, def, x, y, ring) {
    Pix.r(ctx, x - 1, y - 1, 18, 18, '#000');
    Pix.r(ctx, x, y, 16, 16, '#1b1030');
    Pix.r(ctx, x, y, 16, 2, '#2f1d55');
    drawHeadIcon(ctx, def, x + 1, y + 1);
    this.frame(ctx, x, y, 16, 16, ring || CO.line);
  },

  menuBackdrop(ctx, alpha) {
    ctx.fillStyle = 'rgba(10,4,22,' + (alpha === undefined ? 0.74 : alpha) + ')';
    ctx.fillRect(0, 0, W, H);
  },

  /* cinta diagonal de fondo, muy de recreativa */
  stripes(ctx, y, h, t, c1, c2) {
    for (let x = -h; x < W + h; x += 8) {
      const off = (x + Math.floor(t / 2)) % (W + h * 2);
      ctx.fillStyle = ((x / 8) | 0) % 2 ? c1 : c2;
      ctx.beginPath();
      ctx.moveTo(off, y + h); ctx.lineTo(off + h, y);
      ctx.lineTo(off + h + 4, y); ctx.lineTo(off + 4, y + h);
      ctx.fill();
    }
  },

  /* ---------- TÍTULO ---------- */
  TITLE_ITEMS: ['1 JUGADOR', '2 JUGADORES', 'CONTROLES'],
  titleItemRect(i) { return { x: 100, y: 106 + i * 15, w: 120, h: 13 }; },

  drawTitle(ctx, G) {
    this.menuBackdrop(ctx, 0.7);
    const t = G.t;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 14, W, 54); ctx.clip();
    this.stripes(ctx, 14, 54, t, 'rgba(255,204,51,0.07)', 'rgba(62,224,208,0.05)');
    ctx.restore();

    const bob = Math.sin(t / 26) > 0 ? 0 : 1;
    Text.draw(ctx, 'PIXEL', W / 2 - 1, 12 + bob, CO.cyan, 'center', 3);
    Text.draw(ctx, 'KOMBAT', W / 2, 36 + bob, CO.gold, 'center', 4);
    Text.draw(ctx, 'KOMBAT', W / 2, 35 + bob, CO.goldL, 'center', 4, false);
    Pix.r(ctx, 48, 74, 224, 1, CO.goldD);
    Pix.r(ctx, 48, 76, 224, 1, 'rgba(255,204,51,0.25)');
    Text.draw(ctx, 'TORNEO DE FAMOSOS INEXPLICABLE', W / 2, 82, CO.gray, 'center', 1);

    this.TITLE_ITEMS.forEach((it, i) => {
      const r = this.titleItemRect(i);
      const sel = G.menu === i;
      if (sel) {
        this.plate(ctx, r.x, r.y, r.w, r.h, CO.panel2);
        this.rivets(ctx, r.x, r.y, r.w, r.h, CO.gold);
        if ((t % 24) < 16) {
          Text.draw(ctx, '>', r.x - 9, r.y + 3, CO.gold, 'left', 1);
          Text.draw(ctx, '<', r.x + r.w + 9, r.y + 3, CO.gold, 'right', 1);
        }
      }
      Text.draw(ctx, it, W / 2, r.y + 3, sel ? CO.goldL : CO.gray, 'center', 1);
    });

    Pix.r(ctx, 0, 152, W, 26, 'rgba(10,4,22,0.72)');
    Pix.r(ctx, 0, 152, W, 1, CO.goldD);
    Text.draw(ctx, 'W/S O FLECHAS   ·   F / J / ENTER', W / 2, 156, CO.gray, 'center', 1);
    Text.draw(ctx, 'PARODIAS FICTICIAS. NADIE FUE CONSULTADO.', W / 2, 167, CO.dim, 'center', 1);
  },

  /* ---------- CONTROLES ---------- */
  drawHowto(ctx, G) {
    this.menuBackdrop(ctx, 0.9);
    this.plate(ctx, 4, 2, W - 8, 14, CO.panel2);
    Text.draw(ctx, 'CONTROLES', W / 2, 5, CO.goldL, 'center', 1);

    this.plate(ctx, 4, 20, 150, 100, CO.panel);
    const rows = [['', 'J1', 'J2'], ['MOVER', 'A/D', '< >'], ['SALTAR', 'W', 'ARR'],
      ['AGACHAR', 'S', 'ABA'], ['PUÑO', 'F', 'J'], ['PATADA', 'G', 'K'],
      ['ESPECIAL', 'H', 'L'], ['SUPER', 'T', 'O'], ['BURLA', 'R', 'P']];
    rows.forEach((r, i) => {
      const y = 24 + i * 10;
      if (i && i % 2) Pix.r(ctx, 6, y - 1, 146, 9, 'rgba(255,255,255,0.04)');
      Text.draw(ctx, r[0], 10, y, i === 0 ? CO.cyan : CO.gray, 'left', 1);
      Text.draw(ctx, r[1], 100, y, i === 0 ? CO.cyan : CO.white, 'center', 1);
      Text.draw(ctx, r[2], 136, y, i === 0 ? CO.cyan : CO.white, 'center', 1);
    });
    Text.draw(ctx, 'BLOQUEAR: MANTÉN ATRÁS', 8, 124, CO.gold, 'left', 1);
    Text.draw(ctx, 'ABAJO+PUÑO: UPPERCUT', 8, 134, CO.gold, 'left', 1);
    Text.draw(ctx, 'ABAJO+PATADA: BARRIDA', 8, 144, CO.gold, 'left', 1);
    Text.draw(ctx, 'ESC PAUSA · M SILENCIO', 8, 158, CO.dim, 'left', 1);

    this.plate(ctx, 160, 20, W - 164, 138, CO.panel);
    Text.draw(ctx, 'TIPOS: PEGA +40% A', 166, 24, CO.cyan, 'left', 1);
    Object.keys(TYPES).forEach((id, i) => {
      const y = 36 + i * 14;
      if (i % 2) Pix.r(ctx, 162, y - 2, W - 168, 12, 'rgba(255,255,255,0.04)');
      drawTypeIcon(ctx, id, 165, y - 1);
      Text.draw(ctx, TYPES[id].name, 175, y, TYPES[id].color, 'left', 1);
      Text.draw(ctx, '>', 232, y, CO.dim, 'left', 1);
      CHART[id].strong.forEach((s, j) => drawTypeIcon(ctx, s, 240 + j * 10, y - 1));
    });
    Text.draw(ctx, 'ESC PARA VOLVER', W / 2, 166, CO.dim, 'center', 1);
  },

  /* ---------- SELECCIÓN ---------- */
  CELL: { w: 32, h: 32, gx: 4, gy: 4, x0: 168, y0: 26 },
  cellRect(i) {
    const c = this.CELL;
    return { x: c.x0 + (i % 4) * (c.w + c.gx), y: c.y0 + Math.floor(i / 4) * (c.h + c.gy), w: c.w, h: c.h };
  },

  drawSelect(ctx, G) {
    ctx.fillStyle = CO.ink; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    this.stripes(ctx, 0, H, G.t / 2, 'rgba(90,61,150,0.20)', 'rgba(36,21,70,0.35)');
    ctx.restore();

    const hovI = G.picks[0] === null ? G.cur[0] : (G.picks[1] === null ? G.cur[1] : G.picks[1]);
    const hov = ROSTER[hovI];

    /* cabecera */
    this.plate(ctx, 4, 2, W - 8, 13, CO.panel2);
    const who = G.picks[0] === null ? 'JUGADOR 1' : (G.mode === '2p' ? 'JUGADOR 2' : 'LA MÁQUINA');
    Text.draw(ctx, who + ' ELIGE', 10, 5, CO.goldL, 'left', 1);
    Text.draw(ctx, 'ESC: VOLVER', W - 10, 5, CO.dim, 'right', 1);

    /* escaparate: busto recortado del personaje señalado */
    this.plate(ctx, 4, 18, 158, 140, CO.panel);
    Text.draw(ctx, hov.name, 84, 21, CO.goldL, 'center', 2);
    Text.draw(ctx, hov.real, 84, 39, CO.cyan, 'center', 1);

    Pix.r(ctx, 7, 50, 152, 90, '#1b1030');
    for (let i = 0; i < 15; i++) Pix.r(ctx, 7, 50 + i * 6, 152, 3, 'rgba(255,255,255,0.025)');
    Pix.circle(ctx, 84, 150, 46, '#2a1a52');
    ctx.save();
    ctx.beginPath(); ctx.rect(7, 50, 152, 90); ctx.clip();
    drawPose(ctx, hov, 84, 164, 1, 2, G.t % 44 < 22 ? undefined : {
      crouch: 0, punch: 0, kick: 0, cast: 0, walk: 0, air: false, ko: 0, bob: 1,
      block: false, flash: false, spin: false, kickHigh: false, punchUp: false
    });
    ctx.restore();
    Pix.r(ctx, 7, 50, 152, 1, '#000');
    Pix.r(ctx, 7, 139, 152, 1, '#000');

    const tw = 9 + Text.w(TYPES[hov.type].name, 1);
    const subw = Text.w('/ ' + hov.sub, 1);
    Pix.r(ctx, 6, 143, 154, 13, '#1b1030');
    drawTypeTag(ctx, hov.type, 84 - Math.round((tw + subw + 5) / 2), 146, 1);
    Text.draw(ctx, '/ ' + hov.sub, 84 - Math.round((tw + subw + 5) / 2) + tw + 5, 146, CO.dim, 'left', 1);

    /* rejilla de retratos */
    this.plate(ctx, 164, 18, W - 168, 76, CO.panel);
    ROSTER.forEach((def, i) => {
      const r = this.cellRect(i);
      const p1 = (G.picks[0] === null ? G.cur[0] : G.picks[0]) === i;
      const p2 = (G.mode === '2p' || G.picks[0] !== null) && (G.picks[1] === null ? G.cur[1] : G.picks[1]) === i;
      Pix.r(ctx, r.x, r.y, r.w, r.h, p1 || p2 ? '#3d2a70' : '#1b1030');
      Pix.r(ctx, r.x, r.y, r.w, 2, p1 || p2 ? '#5a3d96' : '#241546');
      ctx.save();
      ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
      drawPose(ctx, def, r.x + r.w / 2 + 1, r.y + r.h + 12, 1, 1);
      ctx.restore();
      drawTypeIcon(ctx, def.type, r.x + 1, r.y + 1);
      this.frame(ctx, r.x, r.y, r.w, r.h, '#000');
      if (p1) this.cursorBox(ctx, r.x, r.y, r.w, r.h, CO.cyan, G.t);
      if (p2) this.cursorBox(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, CO.red, G.t + 12);
      if (G.picks[0] === i) Text.draw(ctx, 'P1', r.x + 2, r.y + r.h - 8, CO.cyan, 'left', 1);
      if (G.picks[1] === i) Text.draw(ctx, 'P2', r.x + r.w - 2, r.y + r.h - 8, CO.red, 'right', 1);
    });

    /* fichas del personaje */
    this.plate(ctx, 164, 98, W - 168, 60, CO.panel);
    Text.draw(ctx, hov.title, 170, 102, CO.cyan, 'left', 1);
    Text.wrap(hov.bio, 24).slice(0, 3).forEach((l, i) => Text.draw(ctx, l, 170, 113 + i * 9, CO.gray, 'left', 1));
    Text.draw(ctx, 'ESP: ' + hov.special.name, 170, 141, CO.white, 'left', 1);
    Text.draw(ctx, 'SUP: ' + hov.superMove.name, 170, 150, CO.white, 'left', 1);

    /* franja inferior */
    let footer;
    if (G.rouletteT > 0) footer = 'LA MÁQUINA ESTÁ DECIDIENDO...';
    else if (G.picks[0] !== null) {
      const other = ROSTER[G.picks[1] !== null ? G.picks[1] : G.cur[1]];
      footer = matchupLine(ROSTER[G.picks[0]].type, other.type);
    } else footer = TYPES[hov.type].tag;
    this.plate(ctx, 4, 162, W - 8, 14, G.rouletteT > 0 ? '#4a1030' : CO.panel2);
    Text.draw(ctx, footer.length > 50 ? footer.slice(0, 49) + '.' : footer, W / 2, 166,
      G.rouletteT > 0 ? CO.red : CO.goldL, 'center', 1);
  },

  /* ---------- VS ---------- */
  drawVs(ctx, G) {
    ctx.fillStyle = CO.ink; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    this.stripes(ctx, 0, H, G.t * 2, 'rgba(255,77,90,0.14)', 'rgba(62,224,208,0.10)');
    ctx.restore();
    const a = ROSTER[G.picks[0]], b = ROSTER[G.picks[1]];
    const t = G.t - (G.t0 || 0);
    const slide = Math.min(1, t / 18);
    const ax = Math.round(-40 + 116 * slide), bx = Math.round(W + 40 - 116 * slide);

    Pix.circle(ctx, ax, 92, 38, 'rgba(62,224,208,0.16)');
    Pix.circle(ctx, bx, 92, 38, 'rgba(255,77,90,0.16)');
    Pix.r(ctx, ax - 30, 118, 60, 3, 'rgba(0,0,0,0.35)');
    Pix.r(ctx, bx - 30, 118, 60, 3, 'rgba(0,0,0,0.35)');
    drawPose(ctx, a, ax, 120, 1, 2);
    drawPose(ctx, b, bx, 120, -1, 2);

    this.plate(ctx, 6, 126, 140, 26, CO.panel);
    this.plate(ctx, W - 146, 126, 140, 26, CO.panel);
    Text.draw(ctx, a.name, 76, 129, CO.cyan, 'center', 1);
    Text.draw(ctx, b.name + (G.mode === '1p' ? ' (CPU)' : ''), W - 76, 129, CO.red, 'center', 1);
    drawTypeTag(ctx, a.type, 76 - Math.round((9 + Text.w(TYPES[a.type].name, 1)) / 2), 140, 1);
    drawTypeTag(ctx, b.type, W - 76 - Math.round((9 + Text.w(TYPES[b.type].name, 1)) / 2), 140, 1);

    if (t % 26 < 20) {
      Text.draw(ctx, 'VS', W / 2 + 1, 71, '#000', 'center', 4, false);
      Text.draw(ctx, 'VS', W / 2, 70, CO.gold, 'center', 4);
    }
    this.plate(ctx, 6, 158, W - 12, 15, CO.panel2);
    const line = matchupLine(a.type, b.type);
    Text.draw(ctx, line.length > 48 ? line.slice(0, 47) + '.' : line, W / 2, 162, CO.goldL, 'center', 1);
  },

  /* ---------- MARCADOR DE COMBATE ---------- */
  drawHud(ctx, G) {
    const f1 = G.f1, f2 = G.f2, t = G.t;
    Pix.r(ctx, 0, 0, W, 32, 'rgba(10,4,22,0.55)');
    Pix.r(ctx, 0, 32, W, 1, 'rgba(0,0,0,0.35)');

    this.portrait(ctx, f1.def, 5, 5, CO.cyan);
    this.portrait(ctx, f2.def, W - 21, 5, CO.red);

    this.lifeBar(ctx, 26, 6, 116, 9, f1.hp / f1.maxHp, false);
    this.lifeBar(ctx, W - 142, 6, 116, 9, f2.hp / f2.maxHp, true);
    this.meterBar(ctx, 26, 19, 74, f1.meter / 100, false, t);
    this.meterBar(ctx, W - 100, 19, 74, f2.meter / 100, true, t);

    Text.draw(ctx, f1.def.short, 26, 26, CO.white, 'left', 1);
    Text.draw(ctx, f2.def.short + (f2.cpu ? ' CPU' : ''), W - 26, 26, CO.white, 'right', 1);
    if (f1.meter >= 100 && t % 24 < 16) Text.draw(ctx, '¡SUPER!', 28 + Text.w(f1.def.short, 1) + 6, 26, CO.gold, 'left', 1);
    if (f2.meter >= 100 && t % 24 < 16) Text.draw(ctx, '¡SUPER!', W - 28 - Text.w(f2.def.short + (f2.cpu ? ' CPU' : ''), 1) - 6, 26, CO.gold, 'right', 1);
    this.pips(ctx, 104, 19, f1.wins, 2, false);
    this.pips(ctx, W - 104, 19, f2.wins, 2, true);

    /* reloj */
    const secs = Math.ceil(G.timer / 60);
    this.plate(ctx, W / 2 - 17, 2, 34, 22, CO.panel2);
    Text.draw(ctx, (secs < 10 ? '0' : '') + secs, W / 2, 5,
      secs <= 10 && t % 20 < 10 ? CO.red : CO.white, 'center', 2);
    Text.draw(ctx, 'ROUND ' + G.round, W / 2, 26, CO.gold, 'center', 1);

    if (f1.combo >= 2 && f1.comboT > 0) Text.draw(ctx, f1.combo + ' GOLPES', 8, 38, CO.cyan, 'left', 1);
    if (f2.combo >= 2 && f2.comboT > 0) Text.draw(ctx, f2.combo + ' GOLPES', W - 8, 38, CO.red, 'right', 1);

    const ch = G.world && G.world.chyron;
    if (ch) {
      const txt = ch.text.length > 48 ? ch.text.slice(0, 47) + '.' : ch.text;
      const w = Text.w(txt, 1) + 14;
      this.plate(ctx, (W - w) / 2, 161, w, 13, '#1b1030');
      Pix.r(ctx, (W - w) / 2 + 2, 163, 2, 9, CO.gold);
      Pix.r(ctx, (W + w) / 2 - 4, 163, 2, 9, CO.gold);
      Text.draw(ctx, txt, W / 2, 165, CO.goldL, 'center', 1);
    }
  },

  /* ---------- ANUNCIOS ---------- */
  drawAnnounce(ctx, G) {
    const a = G.ann;
    if (!a) return;
    const age = G.t - a.t0;
    let sc = age < 3 ? 5 : (age < 6 ? 4 : 3);
    while (sc > 1 && Text.w(a.text, sc) > W - 16) sc--;
    const y = 76 - sc * 5;
    const h = Text.h(sc) + 8;
    Pix.r(ctx, 0, y - 4, W, h, 'rgba(10,4,22,0.6)');
    Pix.r(ctx, 0, y - 5, W, 1, CO.goldD);
    Pix.r(ctx, 0, y + h - 4, W, 1, CO.goldD);
    Text.draw(ctx, a.text, W / 2, y, a.color || CO.gold, 'center', sc);
  },

  /* ---------- PAUSA ---------- */
  PAUSE_ITEMS: ['CONTINUAR', 'SALIR AL MENÚ'],
  pauseItemRect(i) { return { x: 100, y: 92 + i * 15, w: 120, h: 13 }; },
  drawPause(ctx, G) {
    this.menuBackdrop(ctx, 0.74);
    Text.draw(ctx, 'PAUSA', W / 2, 58, CO.gold, 'center', 3);
    this.PAUSE_ITEMS.forEach((it, i) => {
      const r = this.pauseItemRect(i);
      const sel = G.menu === i;
      if (sel) { this.plate(ctx, r.x, r.y, r.w, r.h, CO.panel2); this.rivets(ctx, r.x, r.y, r.w, r.h, CO.gold); }
      Text.draw(ctx, it, W / 2, r.y + 3, sel ? CO.goldL : CO.gray, 'center', 1);
    });
  },

  /* ---------- RESULTADO ---------- */
  RESULT_ITEMS: ['REVANCHA', 'CAMBIAR PERSONAJE', 'MENÚ PRINCIPAL'],
  resultItemRect(i) { return { x: 92, y: 120 + i * 15, w: 136, h: 13 }; },
  drawResult(ctx, G) {
    this.menuBackdrop(ctx, 0.82);
    const w = G.winner;
    this.plate(ctx, 4, 4, W - 8, 24, CO.panel2);
    Text.draw(ctx, w.def.name, W / 2, 8, CO.goldL, 'center', 2);
    Text.draw(ctx, 'GANA EL COMBATE', W / 2, 32, CO.white, 'center', 1);

    Pix.circle(ctx, 46, 92, 26, '#2a1a52');
    drawPose(ctx, w.def, 46, 96, 1, 1, {
      crouch: 0, punch: Math.sin(G.t / 6) > 0 ? 0.6 : 0.25, punchUp: true, kick: 0, cast: 0,
      walk: 0, air: false, ko: 0, bob: Math.sin(G.t / 6) > 0 ? 1 : 0,
      block: false, flash: false, spin: false, kickHigh: false
    });

    this.plate(ctx, 76, 48, W - 84, 60, CO.panel);
    Text.wrap('"' + G.quote + '"', 36).forEach((l, i) =>
      Text.draw(ctx, l, 82, 54 + i * 10, CO.goldL, 'left', 1));

    this.RESULT_ITEMS.forEach((it, i) => {
      const r = this.resultItemRect(i);
      const sel = G.menu === i;
      if (sel) { this.plate(ctx, r.x, r.y, r.w, r.h, CO.panel2); this.rivets(ctx, r.x, r.y, r.w, r.h, CO.gold); }
      Text.draw(ctx, it, W / 2, r.y + 3, sel ? CO.goldL : CO.gray, 'center', 1);
    });
  }
};

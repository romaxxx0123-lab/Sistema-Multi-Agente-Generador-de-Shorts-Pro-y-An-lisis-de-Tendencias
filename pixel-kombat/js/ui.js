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
  /* placa metálica con esquinas cortadas y degradado vertical */
  plate(ctx, x, y, w, h, fill, cut) {
    const c = fill || CO.panel;
    cut = cut === undefined ? 2 : cut;
    for (let r = 0; r < h; r++) {
      const inset = r < cut ? (cut - r) : (r >= h - cut ? r - (h - cut) + 1 : 0);
      const t = r / Math.max(1, h - 1);
      const col = t < 0.18 ? tint(c, 0.28) : (t > 0.82 ? tint(c, -0.34) : tint(c, 0.10 - t * 0.22));
      Pix.r(ctx, x + inset, y + r, w - inset * 2, 1, col);
      Pix.r(ctx, x + inset - 1, y + r, 1, 1, '#000');
      Pix.r(ctx, x + w - inset, y + r, 1, 1, '#000');
    }
    Pix.r(ctx, x + cut, y - 1, w - cut * 2, 1, '#000');
    Pix.r(ctx, x + cut, y + h, w - cut * 2, 1, '#000');
    Pix.r(ctx, x + cut, y, w - cut * 2, 1, tint(c, 0.55));
    Pix.r(ctx, x + cut, y + h - 1, w - cut * 2, 1, tint(c, -0.5));
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

  /* Barra de vida de recreativa: extremos inclinados, rampa vertical de
     cinco tonos, barra fantasma que se vacía con retraso y trama en el hueco. */
  RAMP_OK: ['#fff2b8', '#ffd24a', '#f0a018', '#c06808', '#7d3c04'],
  RAMP_LOW: ['#ffc0b8', '#ff6a5a', '#e02030', '#8f1218', '#560a10'],

  lifeBar(ctx, x, y, w, h, pct, ghost, rtl) {
    const sk = r => (h - 1 - r) >> 1;                 // inclinación por fila
    const fw = Math.round(w * clamp(pct, 0, 1));
    const gw = Math.round(w * clamp(ghost === undefined ? pct : ghost, 0, 1));
    const ramp = pct <= 0.3 ? this.RAMP_LOW : this.RAMP_OK;

    for (let r = 0; r < h; r++) {
      const off = rtl ? -sk(r) : sk(r);
      const rx = x + off;
      /* hueco con trama diagonal */
      Pix.r(ctx, rx, y + r, w, 1, '#2b0f18');
      ctx.fillStyle = '#3d1a26';
      for (let i = (r * 2) % 4; i < w; i += 4) ctx.fillRect(rx + i, y + r, 1, 1);
      /* fantasma (daño reciente) */
      if (gw > fw) {
        const gx = rtl ? rx + w - gw : rx;
        Pix.r(ctx, gx + (rtl ? 0 : fw), y + r, gw - fw, 1, r < 2 ? '#ffffff' : (r > h - 3 ? '#9a8a90' : '#e0d0d4'));
      }
      /* relleno */
      if (fw > 0) {
        const fx = rtl ? rx + w - fw : rx;
        Pix.r(ctx, fx, y + r, fw, 1, ramp[Math.min(4, Math.floor(r / h * 5))]);
      }
      /* costados */
      Pix.r(ctx, rx - 2, y + r, 2, 1, '#000');
      Pix.r(ctx, rx + w, y + r, 2, 1, '#000');
      Pix.r(ctx, rx - 1, y + r, 1, 1, r < h / 2 ? '#8f7fc0' : '#3a2d5e');
      Pix.r(ctx, rx + w, y + r, 1, 1, r < h / 2 ? '#8f7fc0' : '#3a2d5e');
    }
    /* muescas de segmento */
    for (let i = 12; i < w; i += 12)
      for (let r = 0; r < h; r++) {
        const rx = x + (rtl ? -sk(r) : sk(r)) + i;
        Pix.r(ctx, rx, y + r, 1, 1, 'rgba(0,0,0,0.45)');
      }
    /* tapas superior e inferior */
    const t0 = x + (rtl ? -sk(0) : sk(0)), tb = x + (rtl ? -sk(h - 1) : sk(h - 1));
    Pix.r(ctx, t0 - 2, y - 2, w + 4, 1, '#000');
    Pix.r(ctx, t0 - 1, y - 1, w + 2, 1, '#9f8fd0');
    Pix.r(ctx, tb - 1, y + h, w + 2, 1, '#2a1f4a');
    Pix.r(ctx, tb - 2, y + h + 1, w + 4, 1, '#000');
  },

  meterBar(ctx, x, y, w, pct, rtl, t) {
    const h = 5;
    Pix.r(ctx, x - 2, y - 1, w + 4, h + 2, '#000');
    Pix.r(ctx, x, y, w, h, '#150c28');
    const fw = Math.round(w * clamp(pct, 0, 1));
    const full = pct >= 1;
    if (fw > 0) {
      const fx = rtl ? x + w - fw : x;
      const c = full ? ((t % 12 < 6) ? '#fff2a8' : CO.gold) : CO.cyan;
      Pix.r(ctx, fx, y, fw, h, tint(c, -0.35));
      Pix.r(ctx, fx, y, fw, 2, c);
      Pix.r(ctx, fx, y, fw, 1, tint(c, 0.45));
    }
    for (let i = 8; i < w; i += 8) Pix.r(ctx, x + i, y, 1, h, 'rgba(0,0,0,0.5)');
    Pix.r(ctx, x - 1, y - 1, w + 2, 1, '#6a5aa0');
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
  portrait(ctx, def, x, y, ring, flash) {
    this.plate(ctx, x, y, 18, 18, '#241546', 3);
    Pix.r(ctx, x + 2, y + 2, 14, 14, flash ? '#ffffff' : '#170d2c');
    for (let i = 0; i < 7; i++) Pix.r(ctx, x + 2, y + 2 + i * 2, 14, 1, 'rgba(255,255,255,0.03)');
    drawHeadIcon(ctx, def, x + 2, y + 3);
    Pix.r(ctx, x + 2, y + 2, 14, 1, ring);
    Pix.r(ctx, x + 2, y + 15, 14, 1, tint(ring, -0.45));
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
    Text.draw(ctx, 'TORNEO DE FAMOSOS RANDOM', W / 2, 82, CO.gray, 'center', 1);

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
    Text.draw(ctx, 'W/S · F / J / ENTER', W / 2, 156, CO.gray, 'center', 1);
    Text.draw(ctx, 'PARODIAS FICTICIAS. NADIE FUE CONSULTADO', W / 2, 167, CO.dim, 'center', 1);
  },

  /* ---------- CONTROLES ---------- */
  drawHowto(ctx, G) {
    this.menuBackdrop(ctx, 0.9);
    this.plate(ctx, 4, 2, W - 8, 14, CO.panel2);
    Text.draw(ctx, 'CONTROLES', W / 2, 5, CO.goldL, 'center', 1);

    this.plate(ctx, 4, 20, 150, 100, CO.panel);
    const rows = [['', 'J1', 'J2'], ['MOVER', 'A/D', '< >'], ['SALTAR', 'W', 'ARR'],
      ['AGACHAR', 'S', 'ABA'], ['PUÑO', 'F', 'J'], ['PATADA', 'G', 'K'],
      ['ESPECIAL', 'H', 'L'], ['SUPER', 'T', 'O'], ['HABLAR', 'R', 'P']];
    rows.forEach((r, i) => {
      const y = 24 + i * 10;
      if (i && i % 2) Pix.r(ctx, 6, y - 1, 146, 9, 'rgba(255,255,255,0.04)');
      Text.draw(ctx, r[0], 10, y, i === 0 ? CO.cyan : CO.gray, 'left', 1);
      Text.draw(ctx, r[1], 100, y, i === 0 ? CO.cyan : CO.white, 'center', 1);
      Text.draw(ctx, r[2], 136, y, i === 0 ? CO.cyan : CO.white, 'center', 1);
    });
    Text.draw(ctx, 'BLOQUEO: ATRÁS', 8, 124, CO.gold, 'left', 1);
    Text.draw(ctx, 'ABAJO+PUÑO: UPPER', 8, 134, CO.gold, 'left', 1);
    Text.draw(ctx, 'ABAJO+PAT: BARRIDA', 8, 144, CO.gold, 'left', 1);
    Text.draw(ctx, 'HABLAR: FRASE SEGÚN', 8, 154, CO.cyan, 'left', 1);
    Text.draw(ctx, 'CÓMO VA EL COMBATE', 8, 163, CO.cyan, 'left', 1);
    Text.draw(ctx, 'ESC PAUSA · M MUDO', 8, 172, CO.dim, 'left', 1);

    this.plate(ctx, 160, 20, W - 164, 138, CO.panel);
    Text.draw(ctx, 'TIPOS: +40% A', 166, 24, CO.cyan, 'left', 1);
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
  CELL: { w: 22, h: 28, gx: 3, gy: 4, x0: 167, y0: 24 },
  cellRect(i) {
    const c = this.CELL;
    return { x: c.x0 + (i % 6) * (c.w + c.gx), y: c.y0 + Math.floor(i / 6) * (c.h + c.gy), w: c.w, h: c.h };
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
    Text.draw(ctx, who, 10, 5, CO.goldL, 'left', 1);
    Text.draw(ctx, 'ELIGE · ESC VOLVER', W - 10, 5, CO.dim, 'right', 1);

    /* escaparate: busto recortado del personaje señalado */
    this.plate(ctx, 4, 18, 158, 140, CO.panel);
    Text.draw(ctx, hov.name, 84, 21, CO.goldL, 'center', 2);
    Text.draw(ctx, hov.real, 84, 39, CO.cyan, 'center', 1);

    Pix.r(ctx, 7, 50, 152, 90, '#1b1030');
    for (let i = 0; i < 15; i++) Pix.r(ctx, 7, 50 + i * 6, 152, 3, 'rgba(255,255,255,0.025)');
    Pix.circle(ctx, 84, 148, 44, '#2a1a52');
    ctx.save();
    ctx.beginPath(); ctx.rect(7, 50, 152, 90); ctx.clip();
    drawPose(ctx, hov, 84, 208, 1, 2, G.t % 44 < 22 ? undefined : {
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
      drawPose(ctx, def, r.x + r.w / 2 + 1, r.y + r.h + 53, 1, 1);
      ctx.restore();
      drawTypeIcon(ctx, def.type, r.x + 1, r.y + 1);
      this.frame(ctx, r.x, r.y, r.w, r.h, '#000');
      if (p1) this.cursorBox(ctx, r.x, r.y, r.w, r.h, CO.cyan, G.t);
      if (p2) this.cursorBox(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, CO.red, G.t + 12);
      if (G.picks[0] === i) Text.draw(ctx, 'P1', r.x + 1, r.y + r.h - 8, CO.cyan, 'left', 1);
      if (G.picks[1] === i) Text.draw(ctx, 'P2', r.x + r.w - 1, r.y + r.h - 8, CO.red, 'right', 1);
    });

    /* fichas del personaje */
    this.plate(ctx, 164, 98, W - 168, 60, CO.panel);
    Text.draw(ctx, hov.title, 170, 102, CO.cyan, 'left', 1);
    Text.wrap(hov.bio, 20).slice(0, 2).forEach((l, i) => Text.draw(ctx, l, 170, 112 + i * 9, CO.gray, 'left', 1));
    Pix.r(ctx, 168, 130, W - 176, 1, 'rgba(255,255,255,0.10)');
    Text.draw(ctx, hov.special.name.slice(0, 20), 170, 134, CO.white, 'left', 1);
    Text.draw(ctx, hov.superMove.name.slice(0, 20), 170, 145, CO.gold, 'left', 1);

    /* franja inferior */
    let footer;
    if (G.rouletteT > 0) footer = 'LA MÁQUINA ESTÁ DECIDIENDO...';
    else if (G.picks[0] !== null) {
      const other = ROSTER[G.picks[1] !== null ? G.picks[1] : G.cur[1]];
      footer = matchupLine(ROSTER[G.picks[0]].type, other.type);
    } else footer = TYPES[hov.type].tag;
    this.plate(ctx, 4, 162, W - 8, 14, G.rouletteT > 0 ? '#4a1030' : CO.panel2);
    Text.draw(ctx, footer.length > 41 ? footer.slice(0, 40) + '.' : footer, W / 2, 166,
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

    Pix.circle(ctx, ax, 88, 40, 'rgba(62,224,208,0.16)');
    Pix.circle(ctx, bx, 88, 40, 'rgba(255,77,90,0.16)');
    Pix.r(ctx, ax - 26, 121, 52, 3, 'rgba(0,0,0,0.4)');
    Pix.r(ctx, bx - 26, 121, 52, 3, 'rgba(0,0,0,0.4)');
    drawPose(ctx, a, ax, 122, 1, 1);
    drawPose(ctx, b, bx, 122, -1, 1);

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
    const mp = matchupParts(a.type, b.type);
    this.plate(ctx, 6, 152, W - 12, 24, CO.panel2);
    Text.draw(ctx, mp.tag, W / 2, 155, CO.gold, 'center', 1);
    Text.draw(ctx, mp.msg.length > 41 ? mp.msg.slice(0, 40) + '.' : mp.msg, W / 2, 165, CO.goldL, 'center', 1);
  },

  /* ---------- MARCADOR DE COMBATE ---------- */
  hudSide(ctx, f, rtl, t) {
    const px = rtl ? W - 24 : 2;
    this.portrait(ctx, f.def, px, 2, rtl ? CO.red : CO.cyan, f.flash > 6);

    const bx = rtl ? W - 148 : 28;
    this.lifeBar(ctx, bx, 6, 120, 10, f.hpShown / f.maxHp, f.hpGhost / f.maxHp, rtl);
    this.meterBar(ctx, rtl ? W - 106 : 28, 21, 78, f.meter / 100, rtl, t);
    this.pips(ctx, rtl ? W - 112 : 112, 21, f.wins, 2, rtl);

    const label = f.def.short + (f.cpu ? ' CPU' : '');
    const nx = rtl ? W - 38 : 38;
    drawTypeIcon(ctx, f.def.type, rtl ? W - 36 : 29, 29);
    Text.draw(ctx, label, nx, 29, CO.white, rtl ? 'right' : 'left', 1);
    if (f.meter >= 100 && t % 24 < 16)
      Text.draw(ctx, '¡SUPER!', rtl ? W - 28 : 28, 39, CO.gold, rtl ? 'right' : 'left', 1);
  },

  drawHud(ctx, G) {
    const f1 = G.f1, f2 = G.f2, t = G.t;
    this.hudSide(ctx, f1, false, t);
    this.hudSide(ctx, f2, true, t);

    /* reloj en placa achaflanada */
    const secs = Math.ceil(G.timer / 60);
    const urgent = secs <= 10;
    this.plate(ctx, W / 2 - 18, 0, 36, 27, urgent && t % 20 < 10 ? '#5a1030' : CO.panel2, 4);
    Text.draw(ctx, (secs < 10 ? '0' : '') + secs, W / 2, 4,
      urgent ? CO.red : CO.white, 'center', 2,
      { ramp: urgent ? ['#ffd0d0', '#ff5a5a', '#a01020'] : ['#ffffff', '#d8d0f0', '#8f86b8'] });
    Text.draw(ctx, 'ROUND ' + G.round, W / 2, 30, CO.gold, 'center', 1);

    if (f1.combo >= 2 && f1.comboT > 0) Text.draw(ctx, f1.combo + ' GOLPES', 8, 50, CO.cyan, 'left', 1);
    if (f2.combo >= 2 && f2.comboT > 0) Text.draw(ctx, f2.combo + ' GOLPES', W - 8, 50, CO.red, 'right', 1);

    const ch = G.world && G.world.chyron;
    if (ch) {
      const txt = ch.text.length > 41 ? ch.text.slice(0, 40) + '.' : ch.text;
      const w = Text.w(txt, 1) + 18;
      this.plate(ctx, (W - w) / 2, 160, w, 15, '#1b1030', 3);
      Pix.r(ctx, (W - w) / 2 + 3, 163, 2, 9, ch.color || CO.gold);
      Pix.r(ctx, (W + w) / 2 - 5, 163, 2, 9, ch.color || CO.gold);
      Text.draw(ctx, txt, W / 2, 164, ch.color || CO.goldL, 'center', 1);
    }
  },

  /* ---------- ANUNCIOS ---------- */
  drawAnnounce(ctx, G) {
    const a = G.ann;
    if (!a) return;
    const age = G.t - a.t0;
    let sc = age < 3 ? 5 : (age < 6 ? 4 : 3);
    while (sc > 1 && Text.w(a.text, sc) > W - 16) sc--;
    const shake = age < 8 ? irnd(-1, 1) : 0;
    const y = 76 - sc * 5 + shake;
    const h = Text.h(sc) + 10;
    const base = a.color || CO.gold;
    Pix.r(ctx, 0, y - 5, W, h, 'rgba(10,4,22,0.62)');
    Pix.r(ctx, 0, y - 6, W, 1, tint(base, -0.35));
    Pix.r(ctx, 0, y - 5, W, 1, tint(base, 0.25));
    Pix.r(ctx, 0, y + h - 6, W, 1, tint(base, 0.25));
    Pix.r(ctx, 0, y + h - 5, W, 1, tint(base, -0.35));
    Text.draw(ctx, a.text, W / 2 + shake, y, base, 'center', sc,
      { ramp: [tint(base, 0.55), tint(base, 0.15), base, tint(base, -0.35)], shadow: 1 });
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

    Pix.circle(ctx, 42, 88, 30, '#2a1a52');
    drawPose(ctx, w.def, 42, 116, 1, 1, {
      crouch: 0, punch: Math.sin(G.t / 6) > 0 ? 0.6 : 0.25, punchUp: true, kick: 0, cast: 0,
      walk: 0, air: false, ko: 0, bob: Math.sin(G.t / 6) > 0 ? 1 : 0,
      block: false, flash: false, spin: false, kickHigh: false
    });

    this.plate(ctx, 76, 48, W - 84, 60, CO.panel);
    Text.wrap('"' + G.quote + '"', 30).forEach((l, i) =>
      Text.draw(ctx, l, 82, 54 + i * 10, CO.goldL, 'left', 1));

    this.RESULT_ITEMS.forEach((it, i) => {
      const r = this.resultItemRect(i);
      const sel = G.menu === i;
      if (sel) { this.plate(ctx, r.x, r.y, r.w, r.h, CO.panel2); this.rivets(ctx, r.x, r.y, r.w, r.h, CO.gold); }
      Text.draw(ctx, it, W / 2, r.y + 3, sel ? CO.goldL : CO.gray, 'center', 1);
    });
  }
};

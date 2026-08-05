// Title screen drawn entirely on the canvas, over a live drifting world view.
import { Button, nineSlice } from './ui.js';

export class TitleScreen {
  constructor(deps) {
    Object.assign(this, deps);   // {atlas, font, onStart, onSeed}
    this.buttons = [];
    this.mode = 'main';          // main | seed
    this.seedText = '';
    this.t = 0;
    this.motes = [];
    for (let i = 0; i < 46; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(),
        s: 0.3 + Math.random() * 0.9, r: 1 + (Math.random() * 2 | 0),
        p: Math.random() * 6.28,
      });
    }
    this.build();
  }

  build() {
    const self = this;
    this.buttons = [];
    if (this.mode === 'main') {
      if (this.saved) {
        const r = this.saved;
        const km = (r.distance / 160).toFixed(1);
        this.buttons.push(new Button('CONTINUAR', 0, 0, 340, 54,
          () => self.onResume(r),
          { scale: 2, sub: `dia ${r.day} - niv ${r.level} - ${km} km` }));
      }
      this.buttons.push(new Button('NUEVA EXPEDICION', 0, 0, 340, 54,
        () => self.onStart(null), { scale: 2,
          sub: this.saved ? 'descarta la partida actual' : 'mundo aleatorio' }));
      this.buttons.push(new Button('MUNDO CON SEMILLA', 0, 0, 340, 54,
        () => { self.mode = 'seed'; self.seedText = ''; self.build(); },
        { scale: 2, sub: 'elegi tu semilla' }));
      this.buttons.push(new Button('LEGADO', 0, 0, 340, 44,
        () => { self.mode = 'legacy'; self.build(); },
        { scale: 2, sub: 'tus logros permanentes' }));
    } else if (this.mode === 'legacy') {
      this.buttons.push(new Button('VOLVER', 0, 0, 190, 36,
        () => { self.mode = 'main'; self.build(); }, { scale: 2 }));
    } else {
      this.buttons.push(new Button('COMENZAR', 0, 0, 190, 36,
        () => self.onSeed(self.seedText || 'ellswyr'), { scale: 2 }));
      this.buttons.push(new Button('VOLVER', 0, 0, 190, 36,
        () => { self.mode = 'main'; self.build(); }, { scale: 2 }));
    }
  }

  layout(w, h) {
    const cx = w / 2;
    if (this.mode === 'main') {
      let y = this.saved ? h * 0.455 : h * 0.50;
      for (const b of this.buttons) {
        b.x = cx - b.w / 2; b.y = y; y += b.h + 18;
      }
    } else if (this.mode === 'legacy') {
      const b = this.buttons[0];
      b.x = w / 2 - b.w / 2; b.y = h - 84;
    } else {
      let y = h * 0.60;
      const total = this.buttons.reduce((a, b) => a + b.w, 0) + 18;
      let x = cx - total / 2;
      for (const b of this.buttons) { b.x = x; b.y = y; x += b.w + 18; }
    }
  }

  key(e) {
    if (this.mode === 'legacy') {
      if (e.key === 'Escape') { this.mode = 'main'; this.build(); return true; }
      return false;
    }
    if (this.mode !== 'seed') return false;
    if (e.key === 'Enter') { this.onSeed(this.seedText || 'ellswyr'); return true; }
    if (e.key === 'Escape') { this.mode = 'main'; this.build(); return true; }
    if (e.key === 'Backspace') { this.seedText = this.seedText.slice(0, -1); return true; }
    if (e.key.length === 1 && this.seedText.length < 18) {
      this.seedText += e.key; return true;
    }
    return false;
  }

  move(mx, my) {
    for (const b of this.buttons) b.hover = b.hit(mx, my);
  }
  down(mx, my) {
    for (const b of this.buttons) if (b.hit(mx, my)) b.press = true;
  }
  up(mx, my) {
    for (const b of this.buttons) {
      if (b.press && b.hit(mx, my)) { b.press = false; b.onClick(); return true; }
      b.press = false;
    }
    return false;
  }

  drawLegacy(ctx, w, h) {
    const F = this.font, A = this.atlas;
    const meta = this.meta || {};
    const runs = this.runs || 0;
    const pw = Math.min(660, w - 60), ph = Math.min(430, h - 150);
    const px = Math.round(w / 2 - pw / 2), py = Math.round(h * 0.16);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(px + 5, py + 6, pw, ph);
    nineSlice(ctx, A, 'ui_panel', px, py, pw, ph, 3, 1);
    F.center(ctx, 'LEGADO', px + pw / 2, py + 14, 3, '#f7e6b0', 'rgba(0,0,0,.75)', 2);
    ctx.fillStyle = '#8a6b45'; ctx.fillRect(px + 22, py + 42, pw - 44, 2);

    // lifetime totals
    const stats = [
      ['EXPEDICIONES', String(runs)],
      ['DIAS TOTALES', String(meta.totalDays || 0)],
      ['KM TOTALES', String(meta.totalKm || 0)],
      ['BIOMAS VISTOS', `${(meta.discovered || []).length}/11`],
    ];
    let sx = px + 24;
    for (const [k, v] of stats) {
      F.draw(ctx, k, sx, py + 52, 1, '#8d8371', 2);
      F.draw(ctx, v, sx, py + 62, 2, '#e8d9ae', 2);
      sx += pw / 4;
    }
    ctx.fillStyle = '#6b5334';
    ctx.fillRect(px + 22, py + 84, pw - 44, 1);

    // unlock list
    let uy = py + 94;
    for (const u of UNLOCKS) {
      const pr = progressOf(u, meta, runs);
      const col = pr.done ? '#8fd48a' : '#b0a58a';
      F.draw(ctx, pr.done ? '*' : '-', px + 24, uy + 2, 2, pr.done ? '#f0c85a' : '#6b6350', 2);
      F.draw(ctx, u.n, px + 42, uy, 2, col, 2);
      F.draw(ctx, u.d.toUpperCase(), px + 42, uy + 16, 1, pr.done ? '#6f8a68' : '#7d7460', 2);
      // requirement bar on the right
      const bw = 150, bx = px + pw - bw - 24;
      ctx.fillStyle = '#241c2a'; ctx.fillRect(bx, uy + 6, bw, 6);
      ctx.fillStyle = pr.done ? '#6fae5f' : '#c9a227';
      ctx.fillRect(bx, uy + 6, Math.round(bw * pr.frac), 6);
      const lbl = `${Math.floor(pr.val)}/${pr.need} ${TRACK_LABEL[u.track]}`;
      const lw = F.width(lbl, 1, 2);
      F.draw(ctx, lbl, bx + bw - lw, uy - 5, 1, '#8d8371', 2);
      uy += 34;
    }
  }

  draw(ctx, w, h, dt) {
    this.t += dt * 1000;
    const F = this.font, A = this.atlas;
    this.layout(w, h);

    // ---- vignette + warm dusk wash over the live world behind
    const vg = ctx.createRadialGradient(w / 2, h * .42, Math.min(w, h) * .18,
      w / 2, h * .42, Math.max(w, h) * .78);
    vg.addColorStop(0, 'rgba(12,10,20,.30)');
    vg.addColorStop(0.55, 'rgba(10,9,18,.70)');
    vg.addColorStop(1, 'rgba(6,5,12,.93)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);

    // ---- drifting dust motes catching the light
    for (const m of this.motes) {
      const x = ((m.x + this.t / 90000 * m.s) % 1) * w;
      const y = ((m.y - this.t / 130000 * m.s) % 1 + 1) % 1 * h;
      const a = 0.16 + 0.16 * Math.sin(this.t / 700 + m.p);
      ctx.fillStyle = `rgba(255,226,168,${a.toFixed(3)})`;
      ctx.fillRect(x | 0, y | 0, m.r, m.r);
    }

    const cx = Math.round(w / 2);

    // ---- emblem
    const lf = A.idx['ui_logo'];
    if (lf) {
      const ls = 2;
      const bob = Math.sin(this.t / 900) * 2;
      const lx = cx - (lf[2] * ls) / 2;
      const ly = h * 0.10 + bob;
      ctx.save();
      ctx.shadowColor = 'rgba(240,200,90,.55)';
      ctx.shadowBlur = 18;
      ctx.drawImage(A.img, lf[0], lf[1], lf[2], lf[3],
        Math.round(lx), Math.round(ly), lf[2] * ls, lf[3] * ls);
      ctx.restore();
    }

    // ---- title with layered pixel shadow (no CSS text-shadow)
    const TS_ = Math.max(3, Math.min(7, Math.floor(w / 190)));
    const title = 'VAGABUNDO';
    const title2 = 'DE ELLSWYR';
    const ty = h * 0.10 + 96;
    for (let d = 4; d >= 1; d--) {
      const c = d > 2 ? 'rgba(30,16,8,.85)' : '#6b4a16';
      F.center(ctx, title, cx + d, ty + d, TS_, c, null, 2);
    }
    F.center(ctx, title, cx, ty, TS_, '#f7e6b0', null, 2);
    // gold shimmer sweep across the title
    const sweep = ((this.t / 24) % (w + 400)) - 200;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const gs = ctx.createLinearGradient(sweep - 90, 0, sweep + 90, 0);
    gs.addColorStop(0, 'rgba(255,240,190,0)');
    gs.addColorStop(0.5, 'rgba(255,240,190,.20)');
    gs.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = gs;
    ctx.fillRect(0, ty - 6, w, F.fh * TS_ + 12);
    ctx.restore();

    const ty2 = ty + F.fh * TS_ + 10;
    for (let d = 4; d >= 1; d--) {
      const c = d > 2 ? 'rgba(30,16,8,.85)' : '#6b4a16';
      F.center(ctx, title2, cx + d, ty2 + d, TS_, c, null, 2);
    }
    F.center(ctx, title2, cx, ty2, TS_, '#f7e6b0', null, 2);

    // ---- divider with diamond
    const dy = Math.round(ty2 + F.fh * TS_ + 22);
    const dw = Math.min(430, w * 0.62);
    const grad = ctx.createLinearGradient(cx - dw / 2, 0, cx + dw / 2, 0);
    grad.addColorStop(0, 'rgba(200,160,70,0)');
    grad.addColorStop(0.5, 'rgba(224,186,96,.95)');
    grad.addColorStop(1, 'rgba(200,160,70,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - dw / 2, dy, dw, 2);
    ctx.fillStyle = '#e8c46a';
    ctx.fillRect(cx - 4, dy - 3, 8, 8);
    ctx.fillStyle = '#3a2a10';
    ctx.fillRect(cx - 2, dy - 1, 4, 4);

    F.center(ctx, 'UN MUNDO INFINITO POR DESCUBRIR', cx, dy + 14, 2,
      '#b9a887', 'rgba(0,0,0,.8)', 2);

    // ---- personal best, if any
    if (this.best) {
      const b = this.best;
      const txt = `MEJOR: DIA ${b.days}  ${b.km} KM  ${b.biomes}/11 BIOMAS  NIV ${b.level}`;
      const bw2 = F.width(txt, 1, 2) + 24;
      const bx2 = cx - bw2 / 2, by2 = h * 0.50 - 34;
      nineSlice(ctx, A, 'ui_parch', bx2, by2, bw2, 18, 3, 1);
      F.center(ctx, txt, cx, by2 + 5, 1, '#5c4a28', null, 2);
    }

    // ---- buttons
    for (const b of this.buttons) b.draw(ctx, A, F, this.t);

    // ---- legacy page
    if (this.mode === 'legacy') {
      this.drawLegacy(ctx, w, h);
      for (const b of this.buttons) b.draw(ctx, A, F, this.t);
      return;
    }

    // ---- seed entry panel
    if (this.mode === 'seed') {
      const pw = 380, ph = 76;
      const px = cx - pw / 2, py = h * 0.60 - 108;
      nineSlice(ctx, A, 'ui_parch', px, py, pw, ph, 3, 1);
      F.center(ctx, 'ESCRIBI UNA SEMILLA', cx, py + 12, 2, '#4a3a1e', null, 2);
      // inset field
      const fx = px + 18, fy = py + 34, fw = pw - 36, fh = 26;
      ctx.fillStyle = '#2a2129'; ctx.fillRect(fx, fy, fw, fh);
      ctx.fillStyle = '#171219'; ctx.fillRect(fx, fy, fw, 2);
      ctx.fillStyle = '#6b5334'; ctx.fillRect(fx, fy + fh - 2, fw, 2);
      const shown = this.seedText || 'ellswyr';
      const col = this.seedText ? '#f2e2b4' : '#6f6552';
      F.draw(ctx, shown, fx + 8, fy + 8, 2, col, 1);
      if ((this.t / 450 | 0) % 2 === 0) {
        const cw = F.width(this.seedText, 2, 1);
        ctx.fillStyle = '#f0c85a';
        ctx.fillRect(fx + 9 + cw, fy + 7, 2, F.fh * 2);
      }
    }

    // ---- controls footer on a wooden strip
    if (this.mode === 'main') {
      const rows = [
        [['W','A','S','D'], 'moverse', ['Shift'], 'correr', ['E'], 'interactuar'],
        [['Q'], 'comer', ['M'], 'mapa', ['F'], 'farol', ['Esc'], 'pausa'],
      ];
      let fy = h - 76;
      for (const row of rows) {
        // measure
        let tw = 0;
        for (let i = 0; i < row.length; i += 2) {
          for (const k of row[i]) tw += F.width(k, 2, 1) + 12 + 4;
          tw += F.width(row[i + 1], 2, 2) + 24;
        }
        let x = cx - tw / 2;
        for (let i = 0; i < row.length; i += 2) {
          for (const k of row[i]) {
            const kw = F.width(k, 2, 1) + 12;
            nineSlice(ctx, A, 'ui_btn_idle', x, fy - 5, kw, 24, 3, 1);
            F.draw(ctx, k, x + 6, fy, 2, '#f0dcae', 1);
            x += kw + 4;
          }
          x += 6;
          F.draw(ctx, row[i + 1], x, fy, 2, '#a2977e', 2);
          x += F.width(row[i + 1], 2, 2) + 18;
        }
        fy += 30;
      }
    }
  }
}

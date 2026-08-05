// Character creator + world setup, drawn on canvas with the bitmap UI.
import { Button, nineSlice } from './ui.js';
import {
  SKIN_TONES, HAIR_COLORS, CLOAK_COLORS, TUNIC_COLORS, PANTS_COLORS,
  CLASSES, buildPlayerSheet, randomLook,
} from './charcustom.js';

const PREV_DIRN = ['s', 'w', 'n', 'e'];
const DIR_LABEL = ['FRENTE', 'IZQUIERDA', 'ESPALDA', 'DERECHA'];

/** Chunky filled ellipse so the pedestal matches the pixel-art style. */
function pixEllipse(ctx, cx, cy, rx, ry, color, step = 3) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y += step) {
    const t = y / ry;
    const w = Math.sqrt(Math.max(0, 1 - t * t)) * rx;
    if (w < 0.5) continue;
    ctx.fillRect(Math.round(cx - w), Math.round(cy + y), Math.round(w * 2), step);
  }
}

export class Creator {
  /** deps: {atlas, font, pal, onBegin(look, worldCfg), onBack} */
  constructor(deps) {
    Object.assign(this, deps);
    this.look = deps.look;
    this.page = 0;                 // 0 = look, 1 = world
    this.preview = null;
    this.previewDir = 0;
    this.autoRotate = true;
    this.t = 0;
    this.animT = 0;
    this.frame = 0;
    this.world = { size: 1, density: 1, daylen: 1, seedText: '' };
    this.rows = [];
    this.sel = 0;
    this.dirty = true;
    this.buttons = [];
    this._hits = [];
    this.hoverRow = -1;
    this.buildRows();
  }

  buildRows() {
    const L = this.look;
    if (this.page === 0) {
      this.rows = [
        { k: 'PIEL', pal: SKIN_TONES, idx: () => L.skin, set: v => L.skin = v },
        { k: 'PEINADO', opts: ['CORTO', 'LARGO', 'COLETA'],
          idx: () => L.hair, set: v => L.hair = v },
        { k: 'CABELLO', pal: HAIR_COLORS, idx: () => L.hairCol, set: v => L.hairCol = v },
        { k: 'CAPA', pal: CLOAK_COLORS, idx: () => L.cloak, set: v => L.cloak = v },
        { k: 'TUNICA', pal: TUNIC_COLORS, idx: () => L.tunic, set: v => L.tunic = v },
        { k: 'PANTALON', pal: PANTS_COLORS, idx: () => L.pants, set: v => L.pants = v },
        { k: 'OFICIO', opts: CLASSES.map(c => c.n), idx: () => L.cls, set: v => L.cls = v },
      ];
    } else {
      const W = this.world;
      this.rows = [
        { k: 'TAMANO', opts: ['ISLAS', 'NORMAL', 'VASTO'], idx: () => W.size, set: v => W.size = v },
        { k: 'VEGETACION', opts: ['RALA', 'NORMAL', 'DENSA'], idx: () => W.density, set: v => W.density = v },
        { k: 'DURACION DIA', opts: ['CORTO', 'NORMAL', 'LARGO'], idx: () => W.daylen, set: v => W.daylen = v },
      ];
    }
    for (const r of this.rows) r.n = r.pal ? r.pal.length : r.opts.length;
    this.sel = Math.min(this.sel, this.rows.length - 1);
    this.buildButtons();
  }

  buildButtons() {
    const self = this;
    this.buttons = [];
    if (this.page === 0) {
      this.buttons.push(new Button('AL AZAR', 0, 0, 160, 36, () => {
        const r = randomLook();
        Object.assign(self.look, r, { name: self.look.name });
        self.dirty = true;
      }, { scale: 2 }));
      this.buttons.push(new Button('SIGUIENTE', 0, 0, 200, 36, () => {
        self.page = 1; self.sel = 0; self.buildRows();
      }, { scale: 2 }));
      this.buttons.push(new Button('VOLVER', 0, 0, 150, 36, () => self.onBack(), { scale: 2 }));
    } else {
      this.buttons.push(new Button('COMENZAR', 0, 0, 220, 38,
        () => self.onBegin(self.look, self.world), { scale: 2 }));
      this.buttons.push(new Button('ATRAS', 0, 0, 160, 38, () => {
        self.page = 0; self.sel = 0; self.buildRows();
      }, { scale: 2 }));
    }
  }

  ensurePreview() {
    if (!this.dirty && this.preview) return;
    this.preview = buildPlayerSheet(this.atlas, this.pal, this.look);
    this.dirty = false;
  }

  cycle(row, dir) {
    row.set((row.idx() + dir + row.n) % row.n);
    this.dirty = true;
  }

  key(e) {
    const k = e.key;
    if (k === 'Escape') {
      if (this.page === 1) { this.page = 0; this.sel = 0; this.buildRows(); }
      else this.onBack();
      return true;
    }
    if (k === 'ArrowUp') { this.sel = (this.sel - 1 + this.rows.length) % this.rows.length; return true; }
    if (k === 'ArrowDown') { this.sel = (this.sel + 1) % this.rows.length; return true; }
    if (k === 'ArrowLeft') { this.cycle(this.rows[this.sel], -1); return true; }
    if (k === 'ArrowRight') { this.cycle(this.rows[this.sel], 1); return true; }
    if (k === 'Tab') { this.autoRotate = false; this.previewDir = (this.previewDir + 1) % 4; return true; }
    if (k === 'Enter') {
      if (this.page === 0) { this.page = 1; this.sel = 0; this.buildRows(); }
      else this.onBegin(this.look, this.world);
      return true;
    }
    if (this.page === 1) {
      if (k === 'Backspace') { this.world.seedText = this.world.seedText.slice(0, -1); return true; }
      if (k.length === 1 && this.world.seedText.length < 16) { this.world.seedText += k; return true; }
    } else {
      if (k === 'Backspace') { this.look.name = this.look.name.slice(0, -1); return true; }
      if (k.length === 1 && this.look.name.length < 14) { this.look.name += k; return true; }
    }
    return false;
  }

  _hitAt(mx, my) {
    // iterate backwards: the whole-row rectangle is registered first, so the
    // more specific swatches/arrows drawn on top of it must win
    for (let i = this._hits.length - 1; i >= 0; i--) {
      const h = this._hits[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) return h;
    }
    return null;
  }

  move(mx, my) {
    for (const b of this.buttons) b.hover = b.hit(mx, my);
    const h = this._hitAt(mx, my);
    this.hoverHit = h;
    this.hoverRow = h && h.row !== undefined ? h.row : -1;
  }
  down(mx, my) { for (const b of this.buttons) if (b.hit(mx, my)) b.press = true; }
  up(mx, my) {
    for (const b of this.buttons) {
      if (b.press && b.hit(mx, my)) { b.press = false; b.onClick(); return true; }
      b.press = false;
    }
    const h = this._hitAt(mx, my);
    if (!h) return false;
    if (h.type === 'swatch') {
      this.sel = h.row; this.rows[h.row].set(h.v); this.dirty = true;
    } else if (h.type === 'arrowL') {
      this.sel = h.row; this.cycle(this.rows[h.row], -1);
    } else if (h.type === 'arrowR') {
      this.sel = h.row; this.cycle(this.rows[h.row], 1);
    } else if (h.type === 'rot') {
      this.autoRotate = false;
      this.previewDir = (this.previewDir + h.v + 4) % 4;
    } else if (h.type === 'auto') {
      this.autoRotate = !this.autoRotate;
    } else if (h.type === 'row') {
      this.sel = h.row;
    }
    return true;
  }

  // ------------------------------------------------------------------ draw
  draw(ctx, w, h, dt) {
    this.t += dt * 1000;
    this.animT += dt;
    if (this.animT > 0.16) { this.animT = 0; this.frame = (this.frame + 1) % 4; }
    this.ensurePreview();
    this._hits = [];
    const F = this.font, A = this.atlas;

    ctx.fillStyle = 'rgba(8,7,14,.82)';
    ctx.fillRect(0, 0, w, h);

    const panelW = Math.min(880, w - 40);
    const panelH = Math.min(540, h - 40);
    const px = Math.round(w / 2 - panelW / 2);
    const py = Math.round(h / 2 - panelH / 2);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(px + 6, py + 7, panelW, panelH);
    nineSlice(ctx, A, 'ui_panel', px, py, panelW, panelH, 3, 1);

    const title = this.page === 0 ? 'CREA TU VAGABUNDO' : 'CONFIGURA EL MUNDO';
    F.center(ctx, title, px + panelW / 2, py + 16, 3, '#f7e6b0', 'rgba(0,0,0,.75)', 2);
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(px + 26, py + 46, panelW - 52, 2);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(px + panelW / 2 - 22, py + 46, 44, 2);

    if (this.page === 0) this.drawLookPage(ctx, px, py, panelW, panelH);
    else this.drawWorldPage(ctx, px, py, panelW, panelH);

    const bw = this.buttons.reduce((a, b) => a + b.w, 0) + (this.buttons.length - 1) * 16;
    let bx = px + panelW / 2 - bw / 2;
    const by = py + panelH - 52;
    for (const b of this.buttons) {
      b.x = bx; b.y = by; bx += b.w + 16;
      b.draw(ctx, A, F, this.t);
    }
  }

  // ---------------------------------------------------------- look page
  drawLookPage(ctx, px, py, pw, ph) {
    const F = this.font, A = this.atlas;
    const stageW = 264;
    const stageH = Math.min(330, ph - 210);
    const sx = px + 24, sy = py + 58;

    // ---- stage well
    nineSlice(ctx, A, 'ui_slot_idle', sx, sy, stageW, stageH, 3, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx + 3, sy + 3, stageW - 6, stageH - 6);
    ctx.clip();

    // sky gradient inside the well
    const bg = ctx.createLinearGradient(0, sy, 0, sy + stageH);
    bg.addColorStop(0, '#2b2440');
    bg.addColorStop(0.55, '#231d33');
    bg.addColorStop(1, '#171322');
    ctx.fillStyle = bg;
    ctx.fillRect(sx + 3, sy + 3, stageW - 6, stageH - 6);

    // overhead spotlight cone
    const cxp = sx + stageW / 2;
    const spot = ctx.createRadialGradient(cxp, sy + stageH * 0.30, 8,
      cxp, sy + stageH * 0.55, stageW * 0.62);
    spot.addColorStop(0, 'rgba(255,226,160,.26)');
    spot.addColorStop(0.5, 'rgba(255,214,140,.10)');
    spot.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(sx + 3, sy + 3, stageW - 6, stageH - 6);

    // slow dust motes in the beam
    for (let i = 0; i < 14; i++) {
      const s = (i * 97) % 100 / 100;
      const dx = cxp + Math.sin(this.t / 1400 + i * 1.7) * (30 + s * 60);
      const dy = sy + 20 + ((this.t / 45 * (0.3 + s * 0.5) + i * 37) % (stageH - 60));
      ctx.fillStyle = `rgba(255,232,180,${(0.10 + 0.14 * Math.sin(this.t / 600 + i)).toFixed(3)})`;
      ctx.fillRect(dx | 0, dy | 0, 2, 2);
    }

    // ---- stone pedestal
    const pcy = sy + stageH - 52;
    pixEllipse(ctx, cxp, pcy + 6, 52, 15, 'rgba(0,0,0,.45)', 3);
    ctx.fillStyle = '#4a4740';
    ctx.fillRect(cxp - 48, pcy, 96, 14);
    ctx.fillStyle = '#5d5850';
    ctx.fillRect(cxp - 48, pcy, 96, 5);
    pixEllipse(ctx, cxp, pcy + 14, 48, 12, '#413e38', 3);
    pixEllipse(ctx, cxp, pcy, 48, 13, '#6f6a60', 3);
    pixEllipse(ctx, cxp, pcy - 1, 44, 11, '#847e72', 3);
    pixEllipse(ctx, cxp, pcy - 2, 34, 8, '#948d80', 3);
    // carved rim notches
    ctx.fillStyle = '#565248';
    for (let a = 0; a < 12; a++) {
      const th = a / 12 * Math.PI * 2;
      ctx.fillRect(Math.round(cxp + Math.cos(th) * 44) - 1,
        Math.round(pcy + Math.sin(th) * 11) - 1, 3, 2);
    }

    // ---- character
    const dir = this.autoRotate ? Math.floor(this.t / 1500) % 4 : this.previewDir;
    const nm = `player${this.look.hair}_walk_${PREV_DIRN[dir]}_${this.frame}`;
    const fr = this.preview.index[nm];
    if (fr) {
      const S = 8;
      const dw = fr[2] * S, dh = fr[3] * S;
      const dx = Math.round(cxp - dw / 2);
      const dy = Math.round(pcy - dh + 10);
      // contact shadow on the plinth
      pixEllipse(ctx, cxp, pcy - 2, 30, 7, 'rgba(0,0,0,.38)', 2);
      ctx.drawImage(this.preview.canvas, fr[0], fr[1], fr[2], fr[3], dx, dy, dw, dh);
    }
    ctx.restore();

    // ---- rotation bar under the stage (never covers the character)
    const ry = sy + stageH + 8;
    const mkRot = (bx, label, delta) => {
      nineSlice(ctx, A, 'ui_btn_idle', bx, ry, 30, 22, 3, 1);
      F.draw(ctx, label, bx + 11, ry + 5, 2, '#f0dcae', 1);
      this._hits.push({ type: 'rot', v: delta, x: bx, y: ry, w: 30, h: 22 });
    };
    mkRot(sx, '<', -1);
    mkRot(sx + stageW - 30, '>', 1);
    const aw = stageW - 74;
    const ax = sx + 37;
    nineSlice(ctx, A, this.autoRotate ? 'ui_btn_hover' : 'ui_btn_idle', ax, ry, aw, 22, 3, 1);
    const rotTxt = this.autoRotate ? 'GIRANDO' : DIR_LABEL[dir];
    F.center(ctx, rotTxt, ax + aw / 2, ry + 6, 2,
      this.autoRotate ? '#fff4d2' : '#c9bb9a', null, 2);
    this._hits.push({ type: 'auto', x: ax, y: ry, w: aw, h: 22 });

    // ---- name field
    const ny = ry + 32;
    F.draw(ctx, 'NOMBRE', sx, ny + 2, 1, '#a2977e', 2);
    const fy = ny + 14;
    ctx.fillStyle = '#2a2129'; ctx.fillRect(sx, fy, stageW, 28);
    ctx.fillStyle = '#171219'; ctx.fillRect(sx, fy, stageW, 2);
    ctx.fillStyle = '#6b5334'; ctx.fillRect(sx, fy + 26, stageW, 2);
    const shown = this.look.name || 'sin nombre';
    F.draw(ctx, shown, sx + 8, fy + 9, 2, this.look.name ? '#f2e2b4' : '#6f6552', 1);
    if ((this.t / 450 | 0) % 2 === 0) {
      const cw = F.width(this.look.name, 2, 1);
      ctx.fillStyle = '#f0c85a';
      ctx.fillRect(sx + 9 + cw, fy + 8, 2, F.fh * 2);
    }

    // ---- option rows on the right
    const ox = sx + stageW + 24;
    const ow = px + pw - 24 - ox;
    this.drawRows(ctx, ox, py + 58, ow, 0, 6, 38);

    // ---- class card
    const cy = py + 58 + 6 * 38 + 6;
    const active = this.sel === 6;
    const cls = CLASSES[this.look.cls];
    if (active) {
      ctx.fillStyle = 'rgba(216,180,92,.13)';
      ctx.fillRect(ox - 6, cy - 6, ow + 12, 134);
    }
    nineSlice(ctx, A, 'ui_parch', ox, cy, ow, 122, 3, 1);
    F.draw(ctx, 'OFICIO', ox + 12, cy + 10, 1, '#6b5a38', 2);
    // < CLASS NAME >
    const nw = F.width(cls.n, 3, 2);
    const ncx = ox + ow / 2;
    F.draw(ctx, '<', ox + 14, cy + 22, 3, active ? '#8a6b20' : '#a89870', 1);
    F.center(ctx, cls.n, ncx, cy + 22, 3, '#4a3a1e', null, 2);
    F.draw(ctx, '>', ox + ow - 26, cy + 22, 3, active ? '#8a6b20' : '#a89870', 1);
    this._hits.push({ type: 'arrowL', row: 6, x: ox + 8, y: cy + 16, w: 26, h: 28 });
    this._hits.push({ type: 'arrowR', row: 6, x: ox + ow - 34, y: cy + 16, w: 26, h: 28 });
    this._hits.push({ type: 'row', row: 6, x: ox, y: cy, w: ow, h: 122 });
    F.center(ctx, cls.desc.toUpperCase(), ncx, cy + 48, 1, '#5c4a28', null, 2);
    let lyy = cy + 66;
    for (const p of cls.perks) {
      F.draw(ctx, '+', ox + 16, lyy, 1, '#3f7a3a', 2);
      F.draw(ctx, p.toUpperCase(), ox + 26, lyy, 1, '#5c4a28', 2);
      lyy += 13;
    }
    // dots showing which class of three
    for (let i = 0; i < CLASSES.length; i++) {
      const dx2 = ox + ow - 16 - (CLASSES.length - i) * 10;
      ctx.fillStyle = i === this.look.cls ? '#8a6b20' : '#c2b590';
      ctx.fillRect(dx2, cy + 12, 7, 5);
    }
  }

  // --------------------------------------------------------- world page
  drawWorldPage(ctx, px, py, pw, ph) {
    const F = this.font, A = this.atlas;
    const ox = px + 46, ow = pw - 92;
    this.drawRows(ctx, ox, py + 74, ow, 0, 3, 44);

    const sy = py + 74 + 3 * 44 + 18;
    F.draw(ctx, 'SEMILLA (OPCIONAL)', ox, sy, 2, '#c9b184', 2);
    const fy = sy + 22;
    ctx.fillStyle = '#2a2129'; ctx.fillRect(ox, fy, ow, 28);
    ctx.fillStyle = '#171219'; ctx.fillRect(ox, fy, ow, 2);
    ctx.fillStyle = '#6b5334'; ctx.fillRect(ox, fy + 26, ow, 2);
    const shown = this.world.seedText || 'aleatoria';
    F.draw(ctx, shown, ox + 8, fy + 9, 2, this.world.seedText ? '#f2e2b4' : '#6f6552', 1);
    if ((this.t / 450 | 0) % 2 === 0) {
      const cw = F.width(this.world.seedText, 2, 1);
      ctx.fillStyle = '#f0c85a';
      ctx.fillRect(ox + 9 + cw, fy + 8, 2, F.fh * 2);
    }

    // hero summary with a live portrait
    const cls = CLASSES[this.look.cls];
    const sumY = fy + 46;
    nineSlice(ctx, A, 'ui_parch', ox, sumY, ow, 76, 3, 1);
    const fr = this.preview.index[`player${this.look.hair}_walk_s_${this.frame}`];
    if (fr) {
      const S = 2;
      ctx.drawImage(this.preview.canvas, fr[0], fr[1], fr[2], fr[3],
        ox + 12, sumY + 8, fr[2] * S, fr[3] * S);
    }
    const tx = ox + 12 + 20 * 2 + 14;
    const nm = (this.look.name || 'VAGABUNDO').toUpperCase();
    F.draw(ctx, nm, tx, sumY + 14, 3, '#4a3a1e', 2);
    F.draw(ctx, cls.n, tx, sumY + 38, 2, '#6b5a38', 2);
    F.draw(ctx, 'ENTER PARA COMENZAR   ESC PARA VOLVER', tx, sumY + 56, 1, '#8a7a58', 2);
  }

  // --------------------------------------------------------------- rows
  drawRows(ctx, x, y, w, from, to, rowH) {
    const F = this.font;
    for (let i = from; i < to && i < this.rows.length; i++) {
      const r = this.rows[i];
      const ry = y + (i - from) * rowH;
      const active = i === this.sel;
      if (active) {
        ctx.fillStyle = 'rgba(216,180,92,.15)';
        ctx.fillRect(x - 6, ry - 4, w + 12, rowH - 4);
        ctx.fillStyle = '#d8b45c';
        ctx.fillRect(x - 6, ry - 4, 3, rowH - 4);
      }
      this._hits.push({ type: 'row', row: i, x: x - 6, y: ry - 4, w: w + 12, h: rowH - 4 });
      F.draw(ctx, r.k, x + 6, ry + 6, 2, active ? '#f7e6b0' : '#b0a58a', 2);

      const colX = x + 130;
      if (r.pal) {
        // ---- clickable colour swatches
        const SW = 22, GAP = 6;
        for (let k = 0; k < r.n; k++) {
          const bx = colX + k * (SW + GAP);
          const on = k === r.idx();
          ctx.fillStyle = on ? '#f0c85a' : '#241c2a';
          ctx.fillRect(bx - 2, ry - 2, SW + 4, SW + 4);
          ctx.fillStyle = '#120e16';
          ctx.fillRect(bx - 1, ry - 1, SW + 2, SW + 2);
          // 3-tone chip so the ramp is visible, not one flat colour
          ctx.fillStyle = '#' + r.pal[k].r[1];
          ctx.fillRect(bx, ry, SW, SW);
          ctx.fillStyle = '#' + r.pal[k].r[2];
          ctx.fillRect(bx, ry, SW, SW - 7);
          ctx.fillStyle = '#' + r.pal[k].r[3];
          ctx.fillRect(bx, ry, SW, 6);
          this._hits.push({ type: 'swatch', row: i, v: k, x: bx - 2, y: ry - 2, w: SW + 4, h: SW + 4 });
        }
        const lastX = colX + r.n * (SW + GAP) + 6;
        F.draw(ctx, r.pal[r.idx()].n.toUpperCase(), lastX, ry + 8, 1,
          active ? '#fff4d2' : '#9a8f78', 2);
      } else {
        // ---- arrow selector
        const val = r.opts[r.idx()];
        const vw = F.width(val, 2, 2);
        F.draw(ctx, '<', colX, ry + 6, 2, active ? '#f0c85a' : '#8a7d5f', 1);
        F.draw(ctx, val, colX + 24, ry + 6, 2, active ? '#fff4d2' : '#c9bb9a', 2);
        F.draw(ctx, '>', colX + 24 + vw + 12, ry + 6, 2, active ? '#f0c85a' : '#8a7d5f', 1);
        this._hits.push({ type: 'arrowL', row: i, x: colX - 6, y: ry, w: 24, h: 22 });
        this._hits.push({ type: 'arrowR', row: i, x: colX + 24 + vw + 6, y: ry, w: 24, h: 22 });
        // position dots
        for (let k = 0; k < r.n; k++) {
          const dx2 = colX + k * 9;
          ctx.fillStyle = k === r.idx() ? '#f0c85a' : '#5c5344';
          ctx.fillRect(dx2, ry + 24, 6, 4);
        }
      }
    }
  }
}

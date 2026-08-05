// Crafting panel, drawn on canvas with the same wooden UI language.
import { nineSlice } from './ui.js';
import { RECIPES, canAfford, isBuilt } from './crafting.js';

const ITEM_LABEL = {
  berry: 'BAYAS', wood: 'MADERA', stone: 'PIEDRA', mushroom: 'HONGOS',
  ore: 'MINERAL', crystal: 'CRISTAL', relic: 'RELIQUIA', flower: 'FLORES',
};

export class CraftPanel {
  constructor(atlas, font) {
    this.a = atlas; this.f = font;
    this.sel = 0;
    this.open = false;
    this.t = 0;
    this._hits = [];
    this.flash = 0;
    this.flashOk = true;
  }

  toggle() { this.open = !this.open; this._hits = []; }

  move(mx, my) {
    this.hover = -1;
    for (const h of this._hits) {
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        this.hover = h.i;
      }
    }
  }

  click(mx, my) {
    for (let i = this._hits.length - 1; i >= 0; i--) {
      const h = this._hits[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        if (h.i === this.sel) return 'craft';
        this.sel = h.i;
        return 'move';
      }
    }
    return null;
  }

  key(k) {
    if (k === 'arrowup' || k === 'w') { this.sel = (this.sel - 1 + RECIPES.length) % RECIPES.length; return 'move'; }
    if (k === 'arrowdown' || k === 's') { this.sel = (this.sel + 1) % RECIPES.length; return 'move'; }
    if (k === 'enter' || k === ' ') return 'craft';
    return null;
  }

  notify(ok) { this.flash = 0.5; this.flashOk = ok; }

  draw(ctx, w, h, state, dt) {
    this.t += dt * 1000;
    if (this.flash > 0) this.flash -= dt;
    this._hits = [];
    const F = this.f, A = this.a;

    ctx.fillStyle = 'rgba(8,7,14,.72)';
    ctx.fillRect(0, 0, w, h);

    const pw = Math.min(620, w - 60);
    const ph = Math.min(452, h - 60);
    const px = Math.round(w / 2 - pw / 2);
    const py = Math.round(h / 2 - ph / 2);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(px + 5, py + 6, pw, ph);
    nineSlice(ctx, A, 'ui_panel', px, py, pw, ph, 3, 1);

    F.center(ctx, 'TALLER', px + pw / 2, py + 14, 3, '#f7e6b0', 'rgba(0,0,0,.75)', 2);
    ctx.fillStyle = '#8a6b45';
    ctx.fillRect(px + 22, py + 42, pw - 44, 2);

    // ---- your materials, along the top
    let ix = px + 22;
    const iy = py + 50;
    for (const k of ['wood', 'stone', 'ore', 'crystal', 'flower', 'mushroom', 'berry', 'relic']) {
      const f = A.idx['item_' + k];
      if (!f) continue;
      const have = state.items[k] || 0;
      ctx.globalAlpha = have ? 1 : 0.32;
      ctx.drawImage(A.img, f[0], f[1], f[2], f[3], ix, iy, 18, 18);
      F.draw(ctx, String(have), ix + 20, iy + 6, 1, have ? '#e8d9ae' : '#6b6350', 2);
      ctx.globalAlpha = 1;
      ix += 20 + F.width(String(have), 1, 2) + 12;
    }

    // ---- recipe list
    const listX = px + 18, listY = py + 78;
    const rowH = 34;
    const listW = pw - 36;
    for (let i = 0; i < RECIPES.length; i++) {
      const r = RECIPES[i];
      const ry = listY + i * rowH;
      const built = isBuilt(state, r);
      const afford = canAfford(state, r);
      const active = i === this.sel;

      if (active) {
        ctx.fillStyle = 'rgba(216,180,92,.16)';
        ctx.fillRect(listX - 4, ry - 3, listW + 8, rowH - 4);
        ctx.fillStyle = '#d8b45c';
        ctx.fillRect(listX - 4, ry - 3, 3, rowH - 4);
      }
      this._hits.push({ i, x: listX - 4, y: ry - 3, w: listW + 8, h: rowH - 4 });

      // icon
      const f = A.idx['item_' + r.icon];
      if (f) {
        ctx.globalAlpha = built ? 0.4 : (afford ? 1 : 0.5);
        ctx.drawImage(A.img, f[0], f[1], f[2], f[3], listX + 2, ry + 2, 22, 22);
        ctx.globalAlpha = 1;
      }

      const nameCol = built ? '#6f8a68' : (afford ? (active ? '#fff4d2' : '#e0d0a6') : '#8a7f6a');
      F.draw(ctx, r.n, listX + 30, ry + 3, 2, nameCol, 2);
      F.draw(ctx, built ? 'YA CONSTRUIDO' : r.d.toUpperCase(),
        listX + 30, ry + 19, 1, built ? '#5f7a5a' : '#8d8371', 2);

      // cost chips on the right
      if (!built) {
        let cx2 = listX + listW - 8;
        const entries = Object.entries(r.cost).reverse();
        for (const [k, n] of entries) {
          const txt = String(n);
          const tw = F.width(txt, 1, 2);
          const cf = A.idx['item_' + k];
          const enough = (state.items[k] || 0) >= n;
          cx2 -= (tw + 18);
          if (cf) {
            ctx.globalAlpha = enough ? 1 : 0.42;
            ctx.drawImage(A.img, cf[0], cf[1], cf[2], cf[3], cx2, ry + 5, 14, 14);
            ctx.globalAlpha = 1;
          }
          F.draw(ctx, txt, cx2 + 15, ry + 9, 1, enough ? '#cfe0a8' : '#c07a6a', 2);
          cx2 -= 6;
        }
      } else {
        const okw = F.width('LISTO', 1, 2);
        F.draw(ctx, 'LISTO', listX + listW - okw - 8, ry + 9, 1, '#6f9e5f', 2);
      }
    }

    // ---- detail strip for the selected recipe
    const r = RECIPES[this.sel];
    const dy = py + ph - 62;
    nineSlice(ctx, A, 'ui_parch', px + 18, dy, pw - 36, 42, 3, 1);
    F.draw(ctx, r.tip.toUpperCase(), px + 28, dy + 9, 1, '#4a3a1e', 2);
    const built = isBuilt(state, r);
    const afford = canAfford(state, r);
    const hint = built ? 'YA LO TENES'
      : (afford ? '[ENTER] FABRICAR' : 'FALTAN MATERIALES');
    F.draw(ctx, hint, px + 28, dy + 24, 1,
      built ? '#6b7a58' : (afford ? '#3f6a2f' : '#9a4f3f'), 2);
    const cl = F.width('[C] CERRAR', 1, 2);
    F.draw(ctx, '[C] CERRAR', px + pw - 28 - cl, dy + 24, 1, '#6b5a38', 2);

    // craft feedback flash
    if (this.flash > 0) {
      ctx.globalAlpha = Math.max(0, this.flash / 0.5);
      const msg = this.flashOk ? 'FABRICADO' : 'FALTAN MATERIALES';
      F.center(ctx, msg, px + pw / 2, dy - 22, 2,
        this.flashOk ? '#8fd48a' : '#d08070', 'rgba(0,0,0,.8)', 2);
      ctx.globalAlpha = 1;
    }
  }
}

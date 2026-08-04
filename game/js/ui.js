// Canvas-drawn UI: bitmap font + 9-slice panels. No DOM, no system fonts.

export class BitmapFont {
  constructor(atlas, meta) {
    this.a = atlas;
    this.g = meta.glyphs;
    this.fw = meta.w;
    this.fh = meta.h;
    this.frame = atlas.idx['ui_font'];
    this.tinted = new Map();      // colour -> pre-tinted font canvas
  }

  /** Recolour the whole glyph strip once per colour (cheap + crisp). */
  sheet(color) {
    let c = this.tinted.get(color);
    if (c) return c;
    const f = this.frame;
    const cv = document.createElement('canvas');
    cv.width = f[2]; cv.height = f[3];
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(this.a.img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, f[2], f[3]);
    this.tinted.set(color, cv);
    return cv;
  }

  width(text, s = 1, tracking = 1) {
    let w = 0;
    for (const ch of text) {
      const m = this.g[ch] || this.g[' '];
      w += (m[2] + tracking) * s;
    }
    return w - tracking * s;
  }
  // metrics are [sheetX, sheetY, advance]

  draw(ctx, text, x, y, s = 1, color = '#f2e2b4', tracking = 1) {
    const sheet = this.sheet(color);
    let cx = Math.round(x);
    for (const ch of text) {
      const m = this.g[ch] || this.g[' '];
      if (ch !== ' ') {
        ctx.drawImage(sheet, m[0], m[1], this.fw, this.fh,
          cx, Math.round(y), this.fw * s, this.fh * s);
      }
      cx += (m[2] + tracking) * s;
    }
    return cx;
  }

  /** Text with a hard pixel drop-shadow (offset by whole pixels). */
  drawShadow(ctx, text, x, y, s = 1, color = '#f2e2b4',
             shadow = 'rgba(0,0,0,.75)', off = 1, tracking = 1) {
    this.draw(ctx, text, x + off * s, y + off * s, s, shadow, tracking);
    return this.draw(ctx, text, x, y, s, color, tracking);
  }

  center(ctx, text, cx, y, s = 1, color, shadow, tracking = 1) {
    const w = this.width(text, s, tracking);
    if (shadow) return this.drawShadow(ctx, text, cx - w / 2, y, s, color, shadow, 1, tracking);
    return this.draw(ctx, text, cx - w / 2, y, s, color, tracking);
  }
}

/** 9-slice: stretch a bordered source sprite to any size, keeping corners crisp. */
export function nineSlice(ctx, atlas, name, x, y, w, h, border = 3, s = 1) {
  const f = atlas.idx[name];
  if (!f) return;
  const [sx, sy, sw, sh] = f;
  const b = border, bs = border * s;
  x = Math.round(x); y = Math.round(y);
  w = Math.round(w); h = Math.round(h);
  const img = atlas.img;
  const midW = Math.max(1, w - bs * 2), midH = Math.max(1, h - bs * 2);
  const ssw = sw - b * 2, ssh = sh - b * 2;
  // corners
  ctx.drawImage(img, sx, sy, b, b, x, y, bs, bs);
  ctx.drawImage(img, sx + sw - b, sy, b, b, x + w - bs, y, bs, bs);
  ctx.drawImage(img, sx, sy + sh - b, b, b, x, y + h - bs, bs, bs);
  ctx.drawImage(img, sx + sw - b, sy + sh - b, b, b, x + w - bs, y + h - bs, bs, bs);
  // edges
  ctx.drawImage(img, sx + b, sy, ssw, b, x + bs, y, midW, bs);
  ctx.drawImage(img, sx + b, sy + sh - b, ssw, b, x + bs, y + h - bs, midW, bs);
  ctx.drawImage(img, sx, sy + b, b, ssh, x, y + bs, bs, midH);
  ctx.drawImage(img, sx + sw - b, sy + b, b, ssh, x + w - bs, y + bs, bs, midH);
  // centre
  ctx.drawImage(img, sx + b, sy + b, ssw, ssh, x + bs, y + bs, midW, midH);
}

/** Clickable button rendered from the wooden button sprite. */
export class Button {
  constructor(label, x, y, w, h, onClick, opts = {}) {
    Object.assign(this, { label, x, y, w, h, onClick });
    this.hover = false; this.press = false;
    this.scale = opts.scale || 2;
    this.icon = opts.icon || null;
    this.sub = opts.sub || null;
  }
  hit(mx, my) {
    return mx >= this.x && mx <= this.x + this.w &&
           my >= this.y && my <= this.y + this.h;
  }
  draw(ctx, atlas, font, t) {
    const st = this.press ? 'press' : (this.hover ? 'hover' : 'idle');
    const yoff = this.press ? 2 : 0;
    // drop shadow under the button
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(this.x + 3, this.y + 4, this.w, this.h);
    nineSlice(ctx, atlas, `ui_btn_${st}`, this.x, this.y + yoff, this.w, this.h, 3, 1);
    const s = this.scale;
    const col = this.hover ? '#fff4d2' : '#e8d9ae';
    const cy = this.y + yoff + (this.h - font.fh * s) / 2 - (this.sub ? 6 : 0);
    let tx = this.x + this.w / 2;
    if (this.icon) tx += 8;
    font.center(ctx, this.label, tx, cy, s, col, 'rgba(0,0,0,.7)');
    if (this.sub) {
      font.center(ctx, this.sub, tx, cy + font.fh * s + 5, 2, '#b3a382', 'rgba(0,0,0,.7)', 2);
    }
    if (this.hover) {
      // gold selection arrows either side
      const bob = Math.round(Math.sin(t / 160) * 1.5);
      font.draw(ctx, '>', this.x - 12 - bob, cy, s, '#f0c85a', 1);
      font.draw(ctx, '<', this.x + this.w + 5 + bob, cy, s, '#f0c85a', 1);
    }
  }
}

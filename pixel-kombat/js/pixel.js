/* =========================================================
   pixel.js — utilidades de dibujo pixel-art
   Todo el juego se dibuja en un lienzo interno de 320x180
   y se escala con image-rendering:pixelated.
   ========================================================= */
const W = 320, H = 180, GROUND = 150;

const Pix = {
  /* Dibuja una rejilla de pixeles.
     rows: array de strings; cada caracter es una clave de la paleta.
     '.' y ' ' son transparentes. */
  grid(ctx, rows, pal, ox, oy) {
    ox = Math.round(ox); oy = Math.round(oy);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.' || ch === ' ') continue;
        const col = pal[ch];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + c, oy + r, 1, 1);
      }
    }
  },

  r(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  },

  /* rectangulo con borde de 1px */
  box(ctx, x, y, w, h, fill, edge) {
    this.r(ctx, x, y, w, h, edge);
    this.r(ctx, x + 1, y + 1, w - 2, h - 2, fill);
  },

  circle(ctx, cx, cy, rad, c) {
    ctx.fillStyle = c;
    for (let y = -rad; y <= rad; y++) {
      const dx = Math.floor(Math.sqrt(rad * rad - y * y));
      ctx.fillRect(Math.round(cx - dx), Math.round(cy + y), dx * 2 + 1, 1);
    }
  },

  /* texto en pixeles (fuente propia); y = centro vertical */
  text(ctx, str, x, y, color, align = 'center', size = 8) {
    const sc = size >= 14 ? 2 : 1;
    Text.draw(ctx, str, x, y - 4 * sc, color, align, sc);
  },

  shadow(ctx, x, y, w) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y - 1), Math.round(w), 2);
  }
};

/* ---------- helpers generales ---------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

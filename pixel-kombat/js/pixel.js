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

/* ---------- color ---------- */
function hex2rgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgb2hex(r, g, b) {
  const c = v => ('0' + Math.round(clamp(v, 0, 255)).toString(16)).slice(-2);
  return '#' + c(r) + c(g) + c(b);
}
function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);

/* memoria para no recalcular colores cada frame */
const _tint = {};
function tint(c, t) {
  const k = c + '|' + t;
  return _tint[k] || (_tint[k] = t >= 0 ? lighten(c, t) : darken(c, -t));
}

/* ---------- añadidos de dibujo ---------- */
Pix.shade = function (ctx, x, y, w, h, base) {
  this.r(ctx, x, y, w, h, base);
  this.r(ctx, x, y, w, 1, tint(base, 0.22));           // luz arriba
  this.r(ctx, x, y + h - 1, w, 1, tint(base, -0.28));  // sombra abajo
  this.r(ctx, x + w - 1, y + 1, 1, h - 2, tint(base, -0.18));
};

/* banda con tramado: transición de color al estilo pixel art */
Pix.ditherBand = function (ctx, x, y, w, h, c1, c2) {
  this.r(ctx, x, y, w, h, c1);
  ctx.fillStyle = c2;
  for (let r = 0; r < h; r++) {
    const dens = (r + 1) / (h + 1);                    // 0..1 de arriba a abajo
    for (let c = 0; c < w; c++) {
      const v = ((c & 1) ^ (r & 1)) ? 0.35 : 0.85;     // patrón de damero
      if (dens > v) ctx.fillRect(x + c, y + r, 1, 1);
    }
  }
};

/* marco biselado de recreativa */
Pix.bevel = function (ctx, x, y, w, h, fill, light, dark) {
  this.r(ctx, x, y, w, h, fill);
  this.r(ctx, x, y, w, 1, light);
  this.r(ctx, x, y, 1, h, light);
  this.r(ctx, x, y + h - 1, w, 1, dark);
  this.r(ctx, x + w - 1, y, 1, h, dark);
  this.r(ctx, x - 1, y - 1, w + 2, 1, '#000');
  this.r(ctx, x - 1, y + h, w + 2, 1, '#000');
  this.r(ctx, x - 1, y - 1, 1, h + 2, '#000');
  this.r(ctx, x + w, y - 1, 1, h + 2, '#000');
};

/* añade contorno a una rejilla de pixeles (se calcula una sola vez) */
function outlineGrid(rows, ch) {
  ch = ch || '#';
  const h = rows.length, w = rows[0].length;
  const out = [];
  for (let r = -1; r <= h; r++) {
    let line = '';
    for (let c = -1; c <= w; c++) {
      const at = (rr, cc) => (rr >= 0 && rr < h && cc >= 0 && cc < w) ? rows[rr][cc] : '.';
      const me = at(r, c);
      if (me !== '.' && me !== ' ') { line += me; continue; }
      const near = at(r - 1, c) + at(r + 1, c) + at(r, c - 1) + at(r, c + 1);
      line += /[^. ]/.test(near) ? ch : '.';
    }
    out.push(line);
  }
  return out;
}

/* ---------- helpers generales ---------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const aabb = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

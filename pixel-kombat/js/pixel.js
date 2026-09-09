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

  /* ---------------------------------------------------------
     Formas redondeadas en píxeles enteros.
     Con rectángulos solo salen cajas: un brazo son dos ladrillos
     apilados y una mano, un cuadrado. La cápsula (segmento grueso con
     extremos redondos y radio que se estrecha) y la elipse son lo que
     hace falta para que un miembro parezca un miembro.
     --------------------------------------------------------- */
  capsule(ctx, x0, y0, x1, y1, r0, r1, c) {
    const rM = Math.max(r0, r1);
    const minX = Math.floor(Math.min(x0, x1) - rM), maxX = Math.ceil(Math.max(x0, x1) + rM);
    const minY = Math.floor(Math.min(y0, y1) - rM), maxY = Math.ceil(Math.max(y0, y1) + rM);
    const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
    ctx.fillStyle = c;
    /* el centinela va en null, no en -1: media figura vive en x negativa
       y con -1 los tramos de la izquierda no llegaban a pintarse nunca */
    for (let y = minY; y <= maxY; y++) {
      let run = null;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        let t = ((px - x0) * dx + (py - y0) * dy) / len2;
        t = t < 0 ? 0 : (t > 1 ? 1 : t);
        const qx = x0 + dx * t, qy = y0 + dy * t, r = r0 + (r1 - r0) * t;
        const on = (px - qx) * (px - qx) + (py - qy) * (py - qy) <= r * r;
        if (on) { if (run === null) run = x; }
        else if (run !== null) { ctx.fillRect(run, y, x - run, 1); run = null; }
      }
      if (run !== null) ctx.fillRect(run, y, maxX + 1 - run, 1);
    }
  },

  ellipse(ctx, cx, cy, rx, ry, c) {
    if (rx <= 0 || ry <= 0) return;
    ctx.fillStyle = c;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      const dy = (y + 0.5 - cy) / ry;
      if (dy * dy > 1) continue;
      const half = rx * Math.sqrt(1 - dy * dy);
      const a = Math.round(cx - half), b = Math.round(cx + half);
      if (b > a) ctx.fillRect(a, y, b - a, 1);
    }
  },

  /* Cilindro: base oscura y dos capas desplazadas hacia la luz, que viene
     de arriba y de delante. El desplazamiento era siempre en x, así que un
     miembro horizontal salía iluminado por la punta en vez de por encima y
     volvía a leerse como una plancha. Ahora va perpendicular al eje. */
  volDir(x0, y0, x1, y1, d) {
    let ax = x1 - x0, ay = y1 - y0;
    const len = Math.sqrt(ax * ax + ay * ay);
    if (len < 0.001) return { ux: d, uy: -0.4 };
    ax /= len; ay /= len;
    let ux = -ay, uy = ax;
    if (ux * d * 0.55 + uy * -0.84 < 0) { ux = -ux; uy = -uy; }
    return { ux, uy };
  },

  capsuleVol(ctx, x0, y0, x1, y1, r0, r1, c, dir) {
    const d = dir || 1, u = this.volDir(x0, y0, x1, y1, d);
    this.capsule(ctx, x0, y0, x1, y1, r0, r1, tint(c, -0.26));
    this.capsule(ctx, x0 + u.ux * 0.8, y0 + u.uy * 0.8, x1 + u.ux * 0.8, y1 + u.uy * 0.8,
      r0 - 0.7, r1 - 0.7, c);
    this.capsule(ctx, x0 + u.ux * 1.7, y0 + u.uy * 1.7, x1 + u.ux * 1.7, y1 + u.uy * 1.7,
      r0 - 1.8, r1 - 1.8, tint(c, 0.22));
  },

  ellipseVol(ctx, cx, cy, rx, ry, c, dir) {
    const d = dir || 1;
    this.ellipse(ctx, cx, cy, rx, ry, tint(c, -0.26));
    this.ellipse(ctx, cx + d * 0.6, cy - 0.6, rx - 0.8, ry - 0.8, c);
    this.ellipse(ctx, cx + d * 1.1, cy - 1.2, rx - 2.0, ry - 2.0, tint(c, 0.22));
  },

  /* Sombra de contacto. Era una raya de 2px que no se veía contra el
     suelo, y por eso los luchadores parecían pegados encima del fondo en
     vez de estar de pie en él. Ahora es un óvalo blando de cinco filas. */
  shadow(ctx, x, y, w) {
    const cx = Math.round(x), cy = Math.round(y);
    /* va entera por debajo de los pies: si se dibuja a su altura, las
       botas la tapan y solo asoman dos alitas que no se ven */
    const filas = [[1.00, 0.42], [0.96, 0.34], [0.82, 0.25], [0.62, 0.16], [0.38, 0.09]];
    for (let i = 0; i < filas.length; i++) {
      const ww = Math.max(2, Math.round(w * filas[i][0]));
      ctx.fillStyle = 'rgba(0,0,0,' + filas[i][1] + ')';
      ctx.fillRect(cx - Math.round(ww / 2), cy + i, ww, 1);
    }
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

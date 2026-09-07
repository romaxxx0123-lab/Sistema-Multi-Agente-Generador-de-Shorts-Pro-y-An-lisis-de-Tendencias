/* =========================================================
   font.js — fuente de mapa de bits 5x7 dibujada a mano.
   Nada de tipografias del sistema: cada letra son pixeles.
   Celda de 6x8 (1 fila superior reservada para tildes).
   ========================================================= */
const GLYPHS = {
  'A': [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'B': [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  'C': [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  'D': [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  'E': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  'F': [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  'G': [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  'H': [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  'I': [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  'J': [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  'K': [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  'L': [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  'M': [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  'N': [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  'O': [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'P': [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  'Q': [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  'R': [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  'S': [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  'T': [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  'U': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  'V': [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  'W': [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  'X': [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  'Y': [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  'Z': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '0': [0b01110, 0b10011, 0b10011, 0b10101, 0b11001, 0b11001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  '6': [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b01100, 0b00100, 0b01000],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  ';': [0, 0b01100, 0b01100, 0, 0b01100, 0b00100, 0b01000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0, 0b00100],
  '¡': [0b00100, 0, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '¿': [0b00100, 0, 0b00100, 0b01000, 0b10000, 0b10001, 0b01110],
  "'": [0b00100, 0b00100, 0, 0, 0, 0, 0],
  '"': [0b01010, 0b01010, 0, 0, 0, 0, 0],
  '-': [0, 0, 0, 0b01110, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '/': [0b00001, 0b00010, 0b00100, 0b00100, 0b01000, 0b10000, 0b10000],
  '\\': [0b10000, 0b01000, 0b00100, 0b00100, 0b00010, 0b00001, 0b00001],
  '%': [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '+': [0, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0],
  '=': [0, 0, 0b11111, 0, 0b11111, 0, 0],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '*': [0, 0b10101, 0b01110, 0b11111, 0b01110, 0b10101, 0],
  '$': [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '·': [0, 0, 0, 0b01100, 0b01100, 0, 0],
  '#': [0b01010, 0b11111, 0b01010, 0b01010, 0b01010, 0b11111, 0b01010],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10110, 0b10000, 0b01110]
};

/* letras con tilde: base + marca en la fila superior */
const ACCENTS = { acute: 0b00110, tilde: 0b01110, diaer: 0b01010 };
const ACCENTED = {
  'Á': ['A', 'acute'], 'É': ['E', 'acute'], 'Í': ['I', 'acute'],
  'Ó': ['O', 'acute'], 'Ú': ['U', 'acute'], 'Ü': ['U', 'diaer'], 'Ñ': ['N', 'tilde']
};

const Text = {
  CW: 6, CH: 8,

  w(str, sc) { sc = sc || 1; return Math.max(0, str.length * this.CW - 1) * sc; },
  h(sc) { return this.CH * (sc || 1); },

  glyph(ch) {
    if (GLYPHS[ch]) return { rows: GLYPHS[ch], acc: 0 };
    const a = ACCENTED[ch];
    if (a) return { rows: GLYPHS[a[0]], acc: ACCENTS[a[1]] };
    return { rows: GLYPHS['?'], acc: 0 };
  },

  /* x,y = esquina superior izquierda de la celda (o centro/derecha segun align) */
  draw(ctx, str, x, y, color, align, sc, shadow) {
    sc = sc || 1;
    str = String(str).toUpperCase();
    const width = this.w(str, sc);
    let ox = Math.round(x);
    if (align === 'center') ox = Math.round(x - width / 2);
    else if (align === 'right') ox = Math.round(x - width);
    const oy = Math.round(y);

    if (shadow !== false) this.paint(ctx, str, ox + sc, oy + sc, '#000', sc);
    this.paint(ctx, str, ox, oy, color, sc);
    return width;
  },

  paint(ctx, str, ox, oy, color, sc) {
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const g = this.glyph(str[i]);
      const gx = ox + i * this.CW * sc;
      if (g.acc) {
        for (let c = 0; c < 5; c++)
          if (g.acc & (1 << (4 - c))) ctx.fillRect(gx + c * sc, oy, sc, sc);
      }
      for (let r = 0; r < 7; r++) {
        const bits = g.rows[r];
        if (!bits) continue;
        for (let c = 0; c < 5; c++)
          if (bits & (1 << (4 - c))) ctx.fillRect(gx + c * sc, oy + (r + 1) * sc, sc, sc);
      }
    }
  },

  /* corta un texto en lineas de como mucho `cols` caracteres */
  wrap(str, cols) {
    const words = String(str).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      if (!cur.length) cur = w;
      else if ((cur + ' ' + w).length <= cols) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur.length) lines.push(cur);
    return lines;
  },

  /* varias lineas centradas */
  block(ctx, lines, x, y, color, align, sc, lead) {
    lines.forEach((l, i) => this.draw(ctx, l, x, y + i * ((lead || this.CH) * sc), color, align, sc));
  }
};

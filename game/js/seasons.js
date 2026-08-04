/** Estaciones.
 *
 * Todo el arte del juego está construido sobre rampas de color, y charcustom.js
 * ya recolorea al jugador intercambiando rampas y cacheando el resultado en una
 * hoja aparte. Una estación es exactamente lo mismo aplicado al terreno y al
 * follaje: no se dibuja un sprite nuevo, se rota el matiz de los pixeles que
 * caen en la banda de la vegetación. El motor ya estaba escrito.
 */

export const DAYS_PER_SEASON = 3;

// Tres grupos, porque una sola transformación para todo daba monocromo: en
// invierno el suelo y las copas terminaban del mismo gris y el bosque
// desaparecia contra la nieve.
const G_GROUND = /^(tile_(grass|meadow|forest|swamp)_|edge_(grass|meadow|forest|swamp)_)/;
const G_CONIFER = /^tree_pine_/;                       // el pino no pierde la hoja
const G_LEAF = /^(tree_|bush_|tuft_|cattail_|flower_)/;

// Dentro de esos sprites, el matiz sólo rota si cae en la banda del verde. Asi
// el tronco de un roble sigue siendo marrón en invierno y de una flor se
// recolorea el tallo pero no el pétalo. A los pixeles de fuera de banda se les
// puede igualar la saturación con satOut, que es lo que apaga el cerezo rosa
// bajo la nieve sin volverlo gris.
const HUE_LO = 55, HUE_HI = 190, SAT_MIN = 0.06;

// hue/mix: hacia qué matiz y cuánto se arrastra la vegetación.
// sat/lum:  multiplicador de saturación y suma de luminosidad.
// chill/bake: cuánto DESPLAZA la estación las curvas de frío y calor. No las
//   reemplaza: `temp()` ya tiene bandas de latitud, y si la estación pisara ese
//   valor en vez de sumarse, el invierno en la tundra quedaria injugable.
// mul/ovr: los dos colores de la gradación permanente de `draw()`.
export const SEASONS = [
  { id: 'spring', n: 'PRIMAVERA', chill: -0.4, bake: 0.0,
    mul: [190, 206, 240], ovr: [255, 180, 96],
    ground: { hue: 100, mix: 0.30, sat: 1.08, lum: 0.02 },
    leaf: { hue: 96, mix: 0.40, sat: 1.12, lum: 0.03 },
    conifer: { hue: 108, mix: 0.30, sat: 1.05, lum: 0.00 } },

  { id: 'summer', n: 'VERANO', chill: -1.2, bake: 1.3,
    mul: [202, 208, 232], ovr: [255, 190, 104],
    ground: { hue: 84, mix: 0.45, sat: 1.14, lum: 0.03 },
    leaf: { hue: 104, mix: 0.45, sat: 1.10, lum: -0.02 },
    conifer: { hue: 130, mix: 0.35, sat: 1.05, lum: -0.03 } },

  { id: 'autumn', n: 'OTONO', chill: 0.9, bake: -0.8,
    mul: [196, 200, 232], ovr: [255, 166, 80],
    // el suelo se seca hacia el amarillo-verde, las copas se van del todo al oro:
    // si van juntas al mismo tono, el árbol desaparece contra el pasto
    ground: { hue: 46, mix: 0.42, sat: 0.88, lum: -0.02 },
    leaf: { hue: 28, mix: 0.88, sat: 1.12, lum: 0.04 },
    conifer: { hue: 70, mix: 0.25, sat: 0.92, lum: -0.02 } },

  { id: 'winter', n: 'INVIERNO', chill: 2.6, bake: -3.0,
    mul: [176, 196, 248], ovr: [232, 208, 170],
    // el suelo se va casi al blanco azulado: eso ES la nieve, no hace falta un
    // tileset nuevo. El follaje conserva algo de verde para no desaparecer.
    ground: { hue: 210, mix: 0.94, sat: 0.14, lum: 0.34, satOut: 0.35, lumOut: 0.30 },
    leaf: { hue: 200, mix: 0.55, sat: 0.34, lum: 0.13, satOut: 0.45, lumOut: 0.06 },
    conifer: { hue: 168, mix: 0.28, sat: 0.72, lum: 0.04, satOut: 0.6, lumOut: 0.05 } },
];

function bucketOf(name) {
  if (G_GROUND.test(name)) return 'ground';
  if (G_CONIFER.test(name)) return 'conifer';
  if (G_LEAF.test(name)) return 'leaf';
  return null;
}

/** La estación sale del día, asi que no hay nada nuevo que guardar. */
export function seasonOf(day) {
  const i = Math.floor(Math.max(0, day - 1) / DAYS_PER_SEASON);
  return SEASONS[((i % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

export function daysLeft(day) {
  return DAYS_PER_SEASON - (Math.max(0, day - 1) % DAYS_PER_SEASON);
}

function toHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function toRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s <= 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}

/** Devuelve un canvas con el atlas recoloreado para la estación dada.
 *  Se llama una vez por cambio de estación, no por fotograma. */
export function recolorAtlas(img, idx, season) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0);
  if (!season) return c;

  const W = c.width, H = c.height;
  // Máscara de una pasada en vez de un getImageData por sprite: son ~150
  // rectángulos y las llamadas sueltas cuestan más que el bucle.
  // 0 = intacto, 1 = suelo, 2 = follaje, 3 = conífera.
  const CODE = { ground: 1, leaf: 2, conifer: 3 };
  const mask = new Uint8Array(W * H);
  for (const name in idx) {
    const b = bucketOf(name);
    if (!b) continue;
    const r = idx[name], code = CODE[b];
    for (let j = 0; j < r[3]; j++) {
      const o = (r[1] + j) * W + r[0];
      mask.fill(code, o, o + r[2]);
    }
  }
  const T = [null, season.ground, season.leaf, season.conifer];
  const d = g.getImageData(0, 0, W, H), px = d.data;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const t = T[mask[i]];
    if (!t || px[p + 3] < 8) continue;
    const hsl = toHsl(px[p], px[p + 1], px[p + 2]);
    let h = hsl[0], sa = hsl[1], lu = hsl[2];
    if (sa >= SAT_MIN && h >= HUE_LO && h <= HUE_HI) {
      h += (((t.hue - h + 540) % 360) - 180) * t.mix;    // arco más corto
      sa *= t.sat;
      lu += t.lum;
    } else if (t.satOut !== undefined) {
      sa *= t.satOut;                                     // escarcha lo que no es verde
      lu += t.lumOut || 0;
    } else continue;
    const rgb = toRgb(h, Math.max(0, Math.min(1, sa)), Math.max(0, Math.min(1, lu)));
    px[p] = rgb[0]; px[p + 1] = rgb[1]; px[p + 2] = rgb[2];
  }
  g.putImageData(d, 0, 0);
  return c;
}

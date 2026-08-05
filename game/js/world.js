// ---------------------------------------------------------------- noise
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Perlin {
  constructor(seed) {
    const rnd = mulberry32(seed);
    this.p = new Uint8Array(512);
    const perm = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  grad(h, x, y) {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; default: return -x - y;
    }
  }
  at(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y);
    const u = this.fade(xf), v = this.fade(yf);
    const p = this.p;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
    const x2 = lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v); // ~[-1,1]
  }
  fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * this.at(x * f, y * f); n += a; a *= gain; f *= lac; }
    return s / n;
  }
}
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------------------------------------------------------- biomes
export const BIOME = {
  DEEP: 0, WATER: 1, BEACH: 2, MEADOW: 3, GRASS: 4, FOREST: 5,
  SWAMP: 6, DESERT: 7, ROCK: 8, SNOW: 9, ASH: 10,
};
export const BIOME_INFO = {
  0: { name: 'Océano', tile: 'deep', water: true, solid: true },
  1: { name: 'Costa', tile: 'water', water: true, solid: true },
  2: { name: 'Playa', tile: 'sand' },
  3: { name: 'Pradera', tile: 'meadow' },
  4: { name: 'Llanura', tile: 'grass' },
  5: { name: 'Bosque', tile: 'forest' },
  6: { name: 'Pantano', tile: 'swamp' },
  7: { name: 'Desierto', tile: 'sand' },
  8: { name: 'Montaña', tile: 'rock' },
  9: { name: 'Tundra', tile: 'snow' },
  10: { name: 'Yermo Ceniciento', tile: 'ash' },
};
// draw priority for transition blending (higher paints over lower)
export const TILE_PRIO = {
  deep: 0, water: 1, swamp: 2, sand: 3, grass: 4, meadow: 5,
  forest: 6, dirt: 7, ash: 8, rock: 9, snow: 10,
};

// Decoración pura: sprites que ya eran type 'deco' (no se recolectan, no entran
// en el guardado). Sólo biomas con vegetación — la roca, la nieve, el desierto y
// el yermo tienen que seguir sintiéndose pelados.
const TSIZE = [['_s', 4], ['', 5], ['', 5], ['_l', 7]];

// Árboles por bioma y densidad OBJETIVO por tile (no la probabilidad cruda del
// sorteo: `treeSpot` compensa internamente el filtro de separación).
const TREES = {
  [BIOME.FOREST]: { d: 0.075, s: ['tree_oak_0', 'tree_oak_1', 'tree_pine_3', 'tree_pine_4', 'tree_jungle_5'] },
  [BIOME.GRASS]: { d: 0.026, s: ['tree_oak_0', 'tree_autumn_2', 'tree_oak_1'] },
  [BIOME.MEADOW]: { d: 0.013, s: ['tree_cherry_7', 'tree_oak_0'] },
  [BIOME.SWAMP]: { d: 0.042, s: ['tree_dead_6', 'tree_jungle_5'] },
  [BIOME.SNOW]: { d: 0.038, s: ['tree_pine_3', 'tree_pine_4'] },
  [BIOME.ASH]: { d: 0.030, s: ['tree_dead_6'] },
};

// Hash espacial estable, independiente del chunk que se esté generando.
function h01(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >> 13), 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

const DECO = {
  [BIOME.MEADOW]: ['tuft_0', 'tuft_1', 'tuft_2'],
  [BIOME.GRASS]: ['tuft_0', 'tuft_1', 'tuft_2'],
  [BIOME.FOREST]: ['tuft_0', 'tuft_1', 'tuft_2'],
  [BIOME.SWAMP]: ['tuft_0', 'tuft_2', 'cattail_0'],
};

// ---------------------------------------------------------------- generación
// Estos números NO salieron de tantear a ojo: son el resultado de optimizar el
// reparto de biomas contra un objetivo por descenso por coordenadas. Tocar uno
// suelto desbalancea el resto; conviene re-medir después de cambiarlos.
const GEN = {
  contW: 0.60,    // peso del campo continental frente al de detalle
  contK: 1.80,    // contraste del continental: más alto = costas más marcadas
  ridgePow: 9,    // agudeza de la cresta: más alto = cordillera más fina
  ridgeAmp: 0.14, // cuánto levanta la cresta
  bias: 0.01,
  mK: 2.00,       // ensanche de la humedad
  tK: 3.10,       // ensanche de la temperatura
  hDeep: 0.315,  // 0.30 dejaba el océano en 3.8%; con esto queda en 5.2%
  hMount: 0.67, hHigh: 0.83,
  tSnow: 0.25, tSnowHi: 0.30,
  tDesert: 0.66, mDesert: 0.38,
  tAsh: 0.74, mAsh: 0.48,
  mSwamp: 0.67, mForest: 0.55, mGrass: 0.41,
};

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// El fbm se apiña alrededor de 0.5: medido, su p5 era 0.34 y su p95 0.66. Los
// umbrales estaban escritos como si el campo fuese uniforme en [0,1], asi que
// "m < 0.34" caia justo en el percentil 5 y "t > 0.80" directamente fuera del
// rango. Por eso el Yermo Ceniciento no existia y el Desierto era el 0.08% del
// mundo. Esto estira la campana para que los extremos tengan masa de verdad.
const spread = (v, k) => clamp01(0.5 + (v - 0.5) * k);

export const CH = 24; // chunk size in tiles
const TS_PX = 16;

export class World {
  constructor(seed, cfg) {
    this.seed = seed >>> 0;
    cfg = cfg || {};
    // world size -> how quickly land gives way to ocean
    this.landBias = [-0.045, 0, 0.055][cfg.size === undefined ? 1 : cfg.size];
    // vegetation density multiplier
    this.densMul = [0.55, 1, 1.65][cfg.density === undefined ? 1 : cfg.density];
    this.hN = new Perlin(this.seed);
    this.mN = new Perlin(this.seed + 1013);
    this.tN = new Perlin(this.seed + 7717);
    this.dN = new Perlin(this.seed + 3331);
    this.rN = new Perlin(this.seed + 5153);
    this.gN = new Perlin(this.seed + 8821);   // arboledas y claros
    this.chunks = new Map();
    this.dug = new Map();  // tile overrides (paths worn by the player)
    // --- player-caused deltas, the only world state worth persisting ---
    this.consumed = new Set();   // stable ids of harvested/opened props
    this.placed = [];            // props the player built
  }

  height(x, y) {
    const d = this.hN.fbm(x * 0.012, y * 0.012, 5) * 0.5 + 0.5;   // detalle
    const c = this.hN.fbm(x * 0.0022 + 100, y * 0.0022 - 40, 2) * 0.5 + 0.5;
    // El campo continental manda sobre el de detalle: es lo que produce costas
    // y masas de tierra en vez de manchas sueltas repartidas por todos lados.
    let h = spread(c, GEN.contK) * GEN.contW + d * (1 - GEN.contW)
      + GEN.bias + this.landBias;
    // Crestas. Antes: `pow(1 - |fbm|, 3) * 0.22`. Con el rango real del fbm eso
    // sumaba +0.14 de MEDIA en TODO el mapa (mediana 0.142, mínimo 0.008): no
    // dibujaba cordilleras, levantaba el mundo entero. Se comia el océano —de
    // 3.4% a 0.1% de tiles bajo el nivel del agua— e inflaba la montaña al 42%.
    // Normalizado y con exponente alto queda ~0 salvo en la línea de cresta, y
    // sólo levanta donde ya hay tierra alta, asi que las cordilleras salen
    // sobre los continentes y no en medio del mar.
    const rn = this.rN.fbm(x * 0.006, y * 0.006, 3) * 2.6;
    const r = Math.max(0, 1 - Math.abs(rn));
    h += Math.pow(r, GEN.ridgePow) * GEN.ridgeAmp * clamp01((h - 0.46) * 2.6);
    return h;
  }
  moisture(x, y) {
    return spread(this.mN.fbm(x * 0.008, y * 0.008, 4) * 0.5 + 0.5, GEN.mK);
  }
  temp(x, y) {
    const t = spread(this.tN.fbm(x * 0.004 + 55, y * 0.004, 3) * 0.5 + 0.5, GEN.tK);
    return t * 0.7 + (0.5 + 0.5 * Math.sin(y * 0.0016)) * 0.3;  // latitude bands
  }

  biomeAt(x, y) {
    const h = this.height(x, y);
    if (h < GEN.hDeep) return BIOME.DEEP;
    if (h < 0.375) return BIOME.WATER;
    if (h < 0.408) {
      // sand only where it actually meets water, otherwise fall through to land
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const sx = x + Math.round(Math.cos(a) * 3), sy = y + Math.round(Math.sin(a) * 3);
        if (this.height(sx, sy) < 0.375) return BIOME.BEACH;
      }
    }
    const m = this.moisture(x, y), t = this.temp(x, y);
    if (h > GEN.hHigh) return t < GEN.tSnowHi ? BIOME.SNOW : BIOME.ROCK;
    if (h > GEN.hMount) {
      return t < GEN.tSnowHi - 0.04 ? BIOME.SNOW
        : (t > GEN.tAsh && m < GEN.mAsh ? BIOME.ASH : BIOME.ROCK);
    }
    if (t < GEN.tSnow) return BIOME.SNOW;
    if (t > GEN.tDesert && m < GEN.mDesert) return BIOME.DESERT;
    if (m > GEN.mSwamp && h < 0.47) return BIOME.SWAMP;
    if (m > GEN.mForest) return BIOME.FOREST;
    if (m > GEN.mGrass) return BIOME.GRASS;
    return BIOME.MEADOW;
  }

  tileName(x, y) {
    const k = x + ',' + y;
    if (this.dug.has(k)) return this.dug.get(k);
    return BIOME_INFO[this.biomeAt(x, y)].tile;
  }
  level(x, y) {
    const h = this.height(x, y);
    if (h < 0.408) return 0;
    return 1 + Math.min(4, Math.floor((h - 0.408) / 0.085));
  }

  isWater(x, y) {
    const b = this.biomeAt(x, y);
    return b === BIOME.DEEP || b === BIOME.WATER;
  }

  /** Mark a prop as harvested/opened and remember it for the save. */
  consume(p) {
    if (p.id) this.consumed.add(p.id);
  }

  /** Add a player-built prop and register it in the right chunk. */
  place(p) {
    if (!p.id) p.id = 'placed:' + this.placed.length + ':' + Math.round(p.x) + ':' + Math.round(p.y);
    this.placed.push(p);
    const cx = Math.floor(p.x / (CH * TS_PX));
    const cy = Math.floor(p.y / (CH * TS_PX));
    const key = cx + ',' + cy;
    const c = this.chunks.get(key);
    if (c) { c.props.push(p); c.props.sort((a, b) => a.y - b.y); }
    return p;
  }

  /** Restore deltas from a save before any chunk is built. */
  restore(consumed, placed) {
    this.consumed = new Set(consumed || []);
    this.placed = (placed || []).map(q => Object.assign({}, q));
    this.chunks.clear();
  }

  // ---------------------------------------------------------- chunks
  chunk(cx, cy) {
    const key = cx + ',' + cy;
    let c = this.chunks.get(key);
    if (!c) { c = this.buildChunk(cx, cy); this.chunks.set(key, c); }
    return c;
  }

  /** ¿Va un árbol en este tile?
   *
   *  Antes era un sorteo por tile: en bosque, `r < 0.26`. Eso da una alfombra
   *  uniforme de ~61 árboles en pantalla, sin claros y con la holgura mediana
   *  en un solo tile: técnicamente se camina, pero se pasa el rato esquivando.
   *  Dos reglas lo arreglan, las dos deterministas y sin depender del orden de
   *  generación ni de los límites de chunk (dentro de `buildChunk` sólo se ven
   *  los props del chunk actual, asi que consultar vecinos no era opción):
   *
   *  1. SEPARACIÓN. Un tile sólo lleva árbol si su hash es el mayor de su
   *     vecindad 3x3. Asi no hay dos troncos pegados y desaparecen los pasillos
   *     imposibles. Como efecto lateral pone un techo de 1/9 a la densidad.
   *  2. CLAROS. La densidad la modula un ruido de baja frecuencia: el bosque
   *     alterna arboledas cerradas con claros abiertos en vez de ser una malla
   *     pareja. Los claros son lo que hace que se pueda caminar y, de paso, lo
   *     que le da ritmo a la exploración: se ven desde lejos y dan a dónde ir.
   */
  treeSpot(wx, wy, base) {
    const v = h01(wx, wy);
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        if ((i || j) && h01(wx + i, wy + j) >= v) return false;
      }
    }
    // el sorteo de densidad usa OTRO hash: `v` ya está sesgado alto por haber
    // ganado la competencia de separación
    const dens = base * this.grove(wx, wy) * this.densMul * 9;
    return h01(wx + 9173, wy - 6427) < dens;
  }

  /** Factor de arboleda/claro: ~0 en los claros, hasta ~2 en lo cerrado. */
  grove(wx, wy) {
    return Math.max(0, 0.34 + this.gN.fbm(wx * 0.021, wy * 0.021, 2) * 2.0);
  }

  buildChunk(cx, cy) {
    const rnd = mulberry32((cx * 73856093) ^ (cy * 19349663) ^ this.seed);
    const props = [];   // {x,y,sprite,solid,r,type,...}
    const spawns = [];
    for (let ty = 0; ty < CH; ty++) {
      for (let tx = 0; tx < CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty;
        const b = this.biomeAt(wx, wy);
        const info = BIOME_INFO[b];
        if (info.water) continue;
        const px = wx * 16 + 2 + rnd() * 12;
        const py = wy * 16 + 2 + rnd() * 12;
        const r = rnd() / this.densMul;
        const add = (sprite, solid, rad, type, extra) =>
          props.push(Object.assign({ x: px, y: py, s: sprite, solid, r: rad, type }, extra || {}));
        // Talla del árbol, con el radio de colisión acorde. Nueve robles en
        // pantalla dejan de ser nueve calcos del mismo bitmap.
        const tree = (name) => {
          const t = pick(rnd, TSIZE);
          add(name + t[0], true, t[1], 'tree');
        };

        // Los árboles salen de la rejilla con separación, no de la cadena de
        // `r`: asi un claro puede seguir teniendo arbustos y hongos, y un tile
        // con árbol no consume el sorteo del resto.
        const gv = this.grove(wx, wy);   // <0.5 = claro, >1.2 = arboleda cerrada
        const tt = TREES[b];
        if (tt && this.treeSpot(wx, wy, tt.d)) tree(pick(rnd, tt.s));

        switch (b) {
          case BIOME.FOREST:
            if (r < 0.05) add(pick(rnd, ['bush_0', 'bush_1', 'bush_berry']), false, 0, r < 0.025 ? 'berry' : 'bush');
            else if (r < 0.066) add(pick(rnd, ['mush_red', 'mush_brown', 'mush_blue']), false, 0, 'mushroom');
            else if (r < 0.12) add(pick(rnd, ['tuft_0', 'tuft_1', 'tuft_2']), false, 0, 'deco');
            else if (r < 0.135) add('stump_0', true, 5, 'wood');
            else if (r < 0.145) add(pick(rnd, ['rock_s_0', 'rock_s_1']), false, 0, 'stone');
            // Las flores del bosque salen sólo en los claros. Un claro deja de
            // ser un hueco en el bosque y pasa a ser algo que se ve desde lejos
            // y da a dónde ir: la razón para desviarse del camino.
            else if (r < 0.21 && gv < 0.5) add(`flower_${(rnd() * 6) | 0}`, false, 0, 'flower');
            break;
          case BIOME.GRASS:
            if (r < 0.02) add(pick(rnd, ['bush_0', 'bush_berry']), false, 0, r < 0.013 ? 'berry' : 'bush');
            else if (r < 0.105) add(pick(rnd, ['tuft_0', 'tuft_1', 'tuft_2']), false, 0, 'deco');
            else if (r < 0.12) add(pick(rnd, ['rock_s_0', 'rock_s_1', 'rock_s_2']), false, 0, 'stone');
            else if (r < 0.125) add('rock_b_0', true, 6, 'stone');
            break;
          case BIOME.MEADOW:
            if (r < 0.11) add(`flower_${(rnd() * 6) | 0}`, false, 0, 'flower');
            else if (r < 0.19) add(pick(rnd, ['tuft_0', 'tuft_1', 'tuft_2']), false, 0, 'deco');
            else if (r < 0.198) add('pillar_0', true, 6, 'ruin');
            break;
          case BIOME.SWAMP:
            if (r < 0.07) add('cattail_0', false, 0, 'deco');
            else if (r < 0.09) add(pick(rnd, ['mush_brown', 'mush_blue']), false, 0, 'mushroom');
            else if (r < 0.14) add(pick(rnd, ['tuft_0', 'tuft_2']), false, 0, 'deco');
            break;
          case BIOME.DESERT:
            if (r < 0.035) add('cactus_0', true, 5, 'cactus');
            else if (r < 0.06) add(pick(rnd, ['rock_s_0', 'rock_s_2']), false, 0, 'stone');
            else if (r < 0.068) add('rock_b_1', true, 6, 'stone');
            else if (r < 0.075) add('pillar_1', true, 6, 'ruin');
            break;
          case BIOME.ROCK:
            if (r < 0.13) add(pick(rnd, ['rock_b_0', 'rock_b_1', 'rock_b_2']), true, 6, 'stone');
            else if (r < 0.175) add(pick(rnd, ['rock_s_0', 'rock_s_1']), false, 0, 'stone');
            else if (r < 0.195) add(pick(rnd, ['ore_iron', 'ore_coal']), true, 6, 'ore');
            else if (r < 0.202) add(pick(rnd, ['ore_gold', 'ore_crystal']), true, 6, 'ore');
            break;
          case BIOME.SNOW:
            if (r < 0.03) add('rock_snow_0', true, 6, 'stone');
            else if (r < 0.06) add('bush_snow', false, 0, 'bush');
            break;
          case BIOME.ASH:
            if (r < 0.05) add('rock_ash_0', true, 6, 'stone');
            else if (r < 0.07) add('ore_crystal', true, 6, 'ore');
            break;
          case BIOME.BEACH:
            if (r < 0.02) add(pick(rnd, ['rock_s_0', 'rock_s_1']), false, 0, 'stone');
            break;
        }
        // ---- capa de decoración
        // El switch de arriba es una cadena if/else sobre un solo `r`, asi que
        // un tile que sacaba árbol NO podia tener ademas pasto a los pies: por
        // eso el suelo se veia pelado justo alrededor de los árboles. Este pase
        // tiene su propio sorteo y corre siempre.
        const deco = DECO[b];
        if (deco) {
          // densidad en manchones: la naturaleza se agrupa, y la distribución
          // uniforme se lee como ruido
          const cl = this.dN.fbm(wx * 0.055, wy * 0.055, 2);
          // en los claros sube la decoración: un claro vacío es un agujero, un
          // claro con pasto alto y flores es un lugar
          const glade = Math.max(0.55, 1.9 - gv);
          if (rnd() < Math.max(0, 0.07 + cl * 0.45) * glade * this.densMul) {
            props.push({ x: wx * 16 + 2 + rnd() * 12, y: wy * 16 + 2 + rnd() * 12,
              s: pick(rnd, deco), solid: false, r: 0, type: 'deco' });
          }
        }

        // creature spawn points
        if (!info.water && rnd() < 0.0075) {
          const table = {
            [BIOME.FOREST]: ['rabbit', 'deer', 'bird', 'wolf'],
            [BIOME.GRASS]: ['rabbit', 'deer', 'bird'],
            [BIOME.MEADOW]: ['rabbit', 'bird', 'bird'],
            [BIOME.SWAMP]: ['slime', 'slime', 'bird'],
            [BIOME.DESERT]: ['slime'],
            [BIOME.ROCK]: ['wolf', 'bird'],
            [BIOME.SNOW]: ['wolf', 'rabbit'],
            [BIOME.ASH]: ['slime', 'wolf'],
            [BIOME.BEACH]: ['bird'],
          }[b];
          if (table) spawns.push({ x: px, y: py, kind: pick(rnd, table) });
        }
      }
    }

    // landmarks: one per chunk at most, deterministic
    const lr = mulberry32((cx * 374761393) ^ (cy * 668265263) ^ (this.seed + 99))();
    if (lr < 0.16) {
      const tx = cx * CH + 4 + ((lr * 1000) % (CH - 8) | 0);
      const ty = cy * CH + 4 + ((lr * 7919) % (CH - 8) | 0);
      if (!this.isWater(tx, ty)) {
        const kind = lr < 0.055 ? 'shrine' : (lr < 0.105 ? 'chest' : 'camp');
        const px = tx * 16 + 8, py = ty * 16 + 8;
        if (kind === 'shrine') {
          props.push({ x: px, y: py, s: 'shrine_0', solid: true, r: 9, type: 'shrine', id: `s${cx},${cy}` });
          for (let i = 0; i < 4; i++) {
            const a = i / 4 * Math.PI * 2 + 0.4;
            props.push({ x: px + Math.cos(a) * 34, y: py + Math.sin(a) * 30, s: 'pillar_' + (i % 2), solid: true, r: 6, type: 'ruin' });
          }
        } else if (kind === 'chest') {
          props.push({ x: px, y: py, s: 'chest_0', solid: false, r: 0, type: 'chest', id: `c${cx},${cy}` });
          props.push({ x: px - 24, y: py + 6, s: 'pillar_1', solid: true, r: 6, type: 'ruin' });
          props.push({ x: px + 26, y: py - 4, s: 'pillar_0', solid: true, r: 6, type: 'ruin' });
        } else {
          props.push({ x: px, y: py, s: 'campfire_0', solid: false, r: 0, type: 'campfire', anim: 4, id: `f${cx},${cy}` });
          props.push({ x: px - 20, y: py + 10, s: 'stump_0', solid: true, r: 5, type: 'wood' });
          props.push({ x: px + 22, y: py + 4, s: 'rock_b_2', solid: true, r: 6, type: 'stone' });
        }
      }
    }

    // stable id per prop so saves can mark exactly which ones are gone
    for (const p of props) {
      if (!p.id) p.id = `${Math.round(p.x)}:${Math.round(p.y)}:${p.s}`;
      if (this.consumed.has(p.id)) {
        if (p.type === 'chest') p.opened = true; else p.taken = true;
      }
    }
    // re-attach anything the player placed inside this chunk
    for (const q of this.placed) {
      const qcx = Math.floor(q.x / (CH * TS_PX));
      const qcy = Math.floor(q.y / (CH * TS_PX));
      if (qcx === cx && qcy === cy) props.push(q);
    }
    props.sort((a, b) => a.y - b.y);
    return { cx, cy, props, spawns };
  }
}

function pick(rnd, arr) { return arr[(rnd() * arr.length) | 0]; }

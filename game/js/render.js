import { CH, TILE_PRIO, mulberry32 } from './world.js';

export const TS = 16;

export class Atlas {
  constructor(img, index) { this.img = img; this.idx = index; }
  has(n) { return !!this.idx[n]; }
  draw(ctx, name, x, y, alpha) {
    const f = this.idx[name];
    if (!f) return;
    if (alpha !== undefined) { ctx.globalAlpha = alpha; }
    ctx.drawImage(this.img, f[0], f[1], f[2], f[3], x | 0, y | 0, f[2], f[3]);
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }
  size(name) { const f = this.idx[name]; return f ? [f[2], f[3]] : [0, 0]; }
}

const DIRS8 = [
  ['n', 0, -1], ['e', 1, 0], ['s', 0, 1], ['w', -1, 0],
  ['ne', 1, -1], ['se', 1, 1], ['sw', -1, 1], ['nw', -1, -1],
];

/** Renders (and caches) ground for one chunk into an offscreen canvas. */
export class GroundCache {
  constructor(world, atlas) {
    this.w = world; this.a = atlas;
    this.cache = new Map();
    this.waterFrame = 0;
  }
  invalidate(cx, cy) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      this.cache.delete((cx + dx) + ',' + (cy + dy));
  }
  invalidateAll() { this.cache.clear(); }
  clearWater() { for (const [k, v] of this.cache) if (v.hasWater) this.cache.delete(k); }

  get(cx, cy, wframe, fframe) {
    const key = cx + ',' + cy;
    const sig = wframe * 8 + fframe;
    let e = this.cache.get(key);
    if (e && e.wframe === sig) return e.canvas;
    if (e && !e.hasWater) return e.canvas;
    const canvas = e ? e.canvas : document.createElement('canvas');
    if (!e) { canvas.width = CH * TS; canvas.height = CH * TS; }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const hasWater = this.paint(ctx, cx, cy, wframe, fframe);
    this.cache.set(key, { canvas, wframe: sig, hasWater });
    if (this.cache.size > 60) {
      const first = this.cache.keys().next().value;
      if (first !== key) this.cache.delete(first);
    }
    return canvas;
  }

  /** Smooth shallow->deep gradient on water, sampled per 2px block so it
   *  never aligns with the tile grid (square patches were very visible). */
  depth(ctx, cx, cy) {
    const W = this.w, B = 2;
    const N = (CH * TS) / B;
    for (let by = 0; by < N; by++) {
      for (let bx = 0; bx < N; bx++) {
        const wxf = cx * CH + (bx * B) / TS, wyf = cy * CH + (by * B) / TS;
        const wx = Math.floor(wxf), wy = Math.floor(wyf);
        if (!W.isWater(wx, wy)) continue;
        // height rises toward the shore -> use it directly as a depth proxy
        const h = W.height(wxf, wyf);
        const t = Math.max(0, Math.min(1, (h - 0.245) / 0.135));
        if (t <= 0.01) continue;
        ctx.fillStyle = `rgba(126,206,222,${(t * t * 0.34).toFixed(3)})`;
        ctx.fillRect(bx * B, by * B, B, B);
      }
    }
  }

  /** Low-frequency colour modulation that hides the 16px tile grid. */
  macro(ctx, cx, cy) {
    const W = this.w, B = 4;               // 4px blocks
    const N = (CH * TS) / B;
    for (let by = 0; by < N; by++) {
      for (let bx = 0; bx < N; bx++) {
        const wx = cx * CH + (bx * B) / TS, wy = cy * CH + (by * B) / TS;
        if (W.isWater(Math.floor(wx), Math.floor(wy))) continue;
        // two octaves of very low frequency = big soft patches
        const v = W.dN.fbm(wx * 0.035, wy * 0.035, 2) * 0.62 +
                  W.mN.fbm(wx * 0.011 + 30, wy * 0.011, 2) * 0.38;
        if (v > 0.10) {
          ctx.fillStyle = `rgba(255,246,214,${Math.min(0.11, (v - 0.10) * 0.30)})`;
          ctx.fillRect(bx * B, by * B, B, B);
        } else if (v < -0.10) {
          ctx.fillStyle = `rgba(18,26,20,${Math.min(0.15, (-v - 0.10) * 0.38)})`;
          ctx.fillRect(bx * B, by * B, B, B);
        }
      }
    }
  }

  paint(ctx, cx, cy, wframe, fframe) {
    const W = this.w, A = this.a;
    ctx.clearRect(0, 0, CH * TS, CH * TS);
    let hasWater = false;
    const nameCache = new Map();
    const tn = (x, y) => {
      const k = x + ',' + y;
      let v = nameCache.get(k);
      if (v === undefined) { v = W.tileName(x, y); nameCache.set(k, v); }
      return v;
    };

    for (let ty = -1; ty <= CH; ty++) {
      for (let tx = -1; tx <= CH; tx++) {
        const wx = cx * CH + tx, wy = cy * CH + ty;
        const px = tx * TS, py = ty * TS;
        const base = tn(wx, wy);
        const isW = base === 'water' || base === 'deep';
        if (isW) hasWater = true;
        // base tile (water animates)
        if (isW) {
          // 3 noise variants x mirroring = 12 permutations, so crests never
          // line up into a visible grid across the open sea
          const wh = hash2(wx * 7 + 13, wy * 11 + 5);
          const wv = wh % 3;
          const wfx = (wh >> 2) & 1, wfy = (wh >> 3) & 1;
          const wn = `tile_${base}_${wv}_${wframe}`;
          if (wfx || wfy) {
            ctx.save();
            ctx.translate(px + (wfx ? TS : 0), py + (wfy ? TS : 0));
            ctx.scale(wfx ? -1 : 1, wfy ? -1 : 1);
            A.draw(ctx, wn, 0, 0);
            ctx.restore();
          } else {
            A.draw(ctx, wn, px, py);
          }
        } else {
          const h = hash2(wx, wy);
          const v = h % 4;
          // mirror/flip variants: 4 tiles -> 16 apparent permutations
          const fx = (h >> 3) & 1, fy = (h >> 4) & 1;
          if (fx || fy) {
            ctx.save();
            ctx.translate(px + (fx ? TS : 0), py + (fy ? TS : 0));
            ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
            A.draw(ctx, `tile_${base}_${v}`, 0, 0);
            ctx.restore();
          } else {
            A.draw(ctx, `tile_${base}_${v}`, px, py);
          }
        }
        // neighbour overlays, low->high priority
        const overlays = [];
        for (const [dir, dx, dy] of DIRS8) {
          const n = tn(wx + dx, wy + dy);
          if (n === base) continue;
          const np = TILE_PRIO[n] ?? 0, bp = TILE_PRIO[base] ?? 0;
          if (np <= bp) continue;
          if (n === 'water' || n === 'deep') continue; // water never bleeds onto land
          overlays.push([np, `edge_${n}_${dir}`]);
        }
        overlays.sort((a, b) => a[0] - b[0]);
        for (const [, nm] of overlays) A.draw(ctx, nm, px, py);

        // foam on land tiles adjacent to water (animated surge)
        if (!isW) {
          for (const [dir, dx, dy] of DIRS8) {
            const n = tn(wx + dx, wy + dy);
            if (n === 'water' || n === 'deep') {
              // offset the phase per tile so the shoreline isn't in lockstep
              const ph = (fframe + ((wx * 3 + wy * 5) & 3)) & 3;
              ctx.globalAlpha = 0.9;
              A.draw(ctx, `edge_foam_${dir}_${ph}`, px, py);
              ctx.globalAlpha = 1;
            }
          }
        }

        // cliffs
        const L = W.level(wx, wy), Ls = W.level(wx, wy + 1);
        if (L > Ls && !isW) {
          const drop = Math.min(3, L - Ls);
          for (let k = 0; k < drop; k++) {
            A.draw(ctx, `cliff_face_${(hash2(wx, wy + k) % 3)}`, px, py + TS + k * TS);
          }
          A.draw(ctx, `cliff_top_${hash2(wx, wy) % 3}`, px, py);
          ctx.fillStyle = 'rgba(12,20,16,.38)';
          ctx.fillRect(px, py + TS + drop * TS, TS, 5);
        }
      }
    }
    if (hasWater) this.depth(ctx, cx, cy);
    this.macro(ctx, cx, cy);
    return hasWater;
  }
}

export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return Math.abs(h ^ (h >> 16));
}

/** Elipses de sombra pre-rasterizadas, cacheadas por tamaño.
 *  `ctx.ellipse()` sale con antialias, y en un juego donde la fuente se
 *  recolorea con source-in para no verse borrosa eso desentona. Las dibujamos
 *  una vez y umbralamos el alfa: borde duro, mismo escalón que todo lo demás. */
export class Shadows {
  constructor(color) { this.cache = new Map(); this.c = color || 'rgb(17,29,21)'; }
  get(w, h) {
    const key = w + ',' + h;
    let cv = this.cache.get(key);
    if (cv) return cv;
    cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = this.c;
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, 7);
    g.fill();
    const d = g.getImageData(0, 0, w, h);
    for (let i = 3; i < d.data.length; i += 4) d.data[i] = d.data[i] > 110 ? 255 : 0;
    g.putImageData(d, 0, 0);
    if (this.cache.size > 120) this.cache.clear();
    this.cache.set(key, cv);
    return cv;
  }
}

/** Simple lightmap: day/night tint + radial lights, composited with 'multiply'. */
export class Lighting {
  constructor() {
    this.c = document.createElement('canvas');
    this.ctx = this.c.getContext('2d');
    this.scale = 4; // low-res lightmap for speed & soft falloff
  }
  resize(w, h) {
    const nw = Math.ceil(w / this.scale), nh = Math.ceil(h / this.scale);
    if (this.c.width !== nw || this.c.height !== nh) { this.c.width = nw; this.c.height = nh; }
  }
  render(ambient, lights, camX, camY, zoom) {
    const ctx = this.ctx, s = this.scale;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, this.c.width, this.c.height);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of lights) {
      const x = (L.x - camX) * zoom / s, y = (L.y - camY) * zoom / s;
      const r = L.r * zoom / s;
      if (x < -r || y < -r || x > this.c.width + r || y > this.c.height + r) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const c = L.c || [255, 190, 110];
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${L.i})`);
      g.addColorStop(0.55, `rgba(${c[0]},${c[1]},${c[2]},${L.i * 0.42})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    return this.c;
  }
}

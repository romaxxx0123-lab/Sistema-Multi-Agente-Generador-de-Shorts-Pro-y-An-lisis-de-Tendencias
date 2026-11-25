// Cielos fotografiados de verdad (HDR de Poly Haven, dominio público) para el día y el clima: fondo,
// luz ambiente, color de la bruma del horizonte y luz del sol. Las fotos se preparan con
// tools/sky/make_sky.py (radiancia en unidades del juego) y se cargan como archivos aparte (sky/…).
// Si no se pueden cargar (por ejemplo, abriendo el HTML con doble clic), queda el cielo procedural.
import * as THREE from 'three';
import META from '../../assets/sky/sky.json';

// Fotogramas clave del día despejado por altura del sol: mañana (sube) y tarde (baja)
const DAY_AM = ['alba', 'salida', 'dorado', 'tarde_baja', 'manana', 'cumulos_48', 'mediodia'];
const DAY_PM = ['mediodia', 'cumulos_43', 'tarde', 'tarde_baja', 'ocaso', 'puesta', 'crepusculo'];
const WEATHER_SKY = { nublado: 'nublado', lluvia: 'lluvia', tormenta: 'lluvia', niebla: 'niebla' };
const K_GAME = 0.0065; // W/m² → unidades del juego (igual que en make_sky.py)
const HZ_BINS = 48;

const smooth = (t) => t * t * (3 - 2 * t);

function airmass(el) {
  const e = Math.max(el, -0.5);
  return 1 / (Math.sin(e * Math.PI / 180) + 0.50572 * Math.pow(e + 6.07995, -1.6364));
}
/** Irradiancia directa normal de cielo despejado (Meinel), W/m². */
export function dniModel(el) {
  return el <= -0.5 ? 0 : 1353 * Math.pow(0.7, Math.pow(airmass(el), 0.678));
}
/** Irradiancia difusa horizontal (con crepúsculo bajo 2°), W/m². */
export function dhiModel(el) {
  const d = (e) => 108 * Math.pow(Math.sin(e * Math.PI / 180), 0.6);
  return el >= 2 ? d(el) : d(2) * Math.pow(10, (el - 2) / 5);
}

/** Decodifica un PNG RGBE (sky/<id>_env.png) a una textura de medio flotante, fila 0 = abajo. */
async function loadEnv(url) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const w = c.width, h = c.height;
  const f = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = y * w * 4, dst = (h - 1 - y) * w * 4;
    for (let x = 0; x < w; x++) {
      const i = src + x * 4, o = dst + x * 4;
      const e = px[i + 3];
      const s = e ? Math.pow(2, e - 136) : 0;
      f[o] = px[i] * s;
      f[o + 1] = px[i + 1] * s;
      f[o + 2] = px[i + 2] * s;
      f[o + 3] = 1;
    }
  }
  const half = new Uint16Array(f.length);
  for (let i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(f[i]);
  const tex = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  // color del horizonte (≈3° de altura) por sectores de azimut, para la bruma
  const row = Math.round((90 + 3) / 180 * h);
  const hz = [];
  for (let b = 0; b < HZ_BINS; b++) {
    let r = 0, gg = 0, bb = 0, n = 0;
    for (let x = Math.floor(b * w / HZ_BINS); x < Math.floor((b + 1) * w / HZ_BINS); x++) {
      for (let dy = -1; dy <= 1; dy++) {
        const o = ((row + dy) * w + x) * 4;
        r += f[o]; gg += f[o + 1]; bb += f[o + 2]; n++;
      }
    }
    hz.push(new THREE.Color(r / n, gg / n, bb / n));
  }
  return { tex, hz };
}

export class HdriSky {
  constructor(renderer) {
    this.renderer = renderer;
    this.ready = false;
    this.entries = {};
    this.base = 'sky/';
    this.maxW = 4096;
  }

  /** Carga los entornos (chicos) de todos los cielos y los fondos comprimidos; falla en silencio. */
  async load() {
    try {
      const ids = Object.keys(META);
      await Promise.all(ids.map(async (id) => {
        const [env, blob] = await Promise.all([
          loadEnv(this.base + id + '_env.png'),
          fetch(this.base + id + '.webp').then((r) => { if (!r.ok) throw new Error(r.status); return r.blob(); }),
        ]);
        this.entries[id] = { id, meta: META[id], env: env.tex, hz: env.hz, blob, bg: null, loading: null, lastUse: 0 };
      }));
      this.ready = true;
    } catch (e) {
      console.warn('Cielos fotografiados no disponibles; queda el cielo procedural.', e && e.message);
      this.ready = false;
    }
    return this.ready;
  }

  /** Textura del fondo de un cielo: se decodifica cuando hace falta (devuelve null mientras tanto). */
  background(id) {
    const e = this.entries[id];
    if (!e) return null;
    e.lastUse = performance.now();
    if (e.bg) return e.bg;
    if (!e.loading) {
      const opts = { imageOrientation: 'flipY' };
      e.loading = createImageBitmap(e.blob, opts).then(async (bmp) => {
        let b = bmp;
        if (bmp.width > this.maxW) b = await createImageBitmap(e.blob, { ...opts, resizeWidth: this.maxW, resizeHeight: Math.round(bmp.height * this.maxW / bmp.width), resizeQuality: 'high' });
        const t = new THREE.Texture(b);
        t.colorSpace = THREE.SRGBColorSpace;
        t.flipY = false;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.generateMipmaps = true;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.anisotropy = 4;
        t.needsUpdate = true;
        e.bg = t;
        this._evict();
      });
    }
    return null;
  }

  _evict() {
    // a lo sumo 4 fondos en la placa de video
    const live = Object.values(this.entries).filter((e) => e.bg).sort((a, b) => b.lastUse - a.lastUse);
    for (const e of live.slice(4)) {
      e.bg.dispose();
      if (e.bg.image && e.bg.image.close) e.bg.image.close();
      e.bg = null;
      e.loading = null;
    }
  }

  /**
   * Mezcla de cielos para la altura del sol (grados), si sube o baja, y el clima.
   * Devuelve [{ id, w, k }] (peso y factor de brillo para que la luz siga a la altura real del sol).
   */
  mix(el, rising, weatherK, weatherId) {
    const seq = (rising ? DAY_AM : DAY_PM).map((id) => [this.entries[id] ? this.entries[id].meta.sunElev : null, id]).filter((p) => p[0] != null);
    seq.sort((a, b) => a[0] - b[0]);
    const out = [];
    if (!seq.length) return out;
    let a = seq[0], b = seq[0], t = 0;
    if (el >= seq[seq.length - 1][0]) a = b = seq[seq.length - 1];
    else if (el > seq[0][0]) {
      for (let i = 0; i < seq.length - 1; i++) {
        if (el >= seq[i][0] && el <= seq[i + 1][0]) {
          a = seq[i];
          b = seq[i + 1];
          t = smooth((el - a[0]) / Math.max(b[0] - a[0], 1e-3));
          break;
        }
      }
    }
    const dayW = 1 - weatherK;
    const k = (id) => this.brightness(id, el);
    if (a[1] === b[1]) out.push({ id: a[1], w: dayW, k: k(a[1]) });
    else {
      out.push({ id: a[1], w: dayW * (1 - t), k: k(a[1]) });
      out.push({ id: b[1], w: dayW * t, k: k(b[1]) });
    }
    const ws = WEATHER_SKY[weatherId];
    if (ws && this.entries[ws] && weatherK > 0) out.push({ id: ws, w: weatherK, k: k(ws) });
    return out.filter((o) => o.w > 1e-4);
  }

  /** Factor de brillo: el cielo de la foto se escala a la luz difusa de la altura real del sol. */
  brightness(id, el) {
    const m = this.entries[id].meta;
    return dhiModel(el) / Math.max(dhiModel(m.sunElev), 1e-6);
  }

  /** Intensidad del sol (unidades del juego) de un cielo, a la altura real del sol. */
  sunIntensity(id, el) {
    const m = this.entries[id].meta;
    const r = dniModel(el) / Math.max(dniModel(m.sunElev), 1e-3);
    return m.sunIntensity * Math.min(r, 4);
  }

  /** Color del horizonte de un cielo en una dirección (azimut del juego) y promedio. */
  horizon(id, azGame, yaw, out, avg) {
    const e = this.entries[id];
    const az = azGame - yaw;
    const u = ((az / (Math.PI * 2) + 0.5) % 1 + 1) % 1;
    const b = Math.min(HZ_BINS - 1, Math.floor(u * HZ_BINS));
    out.copy(e.hz[b]);
    if (avg) {
      avg.setRGB(0, 0, 0);
      for (const c of e.hz) avg.add(c);
      avg.multiplyScalar(1 / HZ_BINS);
    }
    return out;
  }
}

export { META as SKY_META, K_GAME };

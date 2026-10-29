/**
 * Perfil del casco EN LA LÍNEA DE FLOTACIÓN, para la máscara del océano (que no se vea agua dentro
 * de la bodega) y para la estela. Se obtiene cortando la geometría real del casco (`buildHull`,
 * área render-ship) con el plano y = flotación: así la máscara sigue al casco aunque cambie su
 * forma o la eslora (ampliaciones). Si algo falla, se usa una aproximación prudente.
 */
import { CELL, SHIP_ORIGIN_X, WATERLINE_Y } from '../../sim/constants';
import { buildHull } from '../ship/hull';
import { HULL_SAMPLES, type HullProfile } from './waves';

/** Cortes (x0, z0, x1, z1) de los triángulos de una geometría no indexada con el plano y = Y. */
function sliceSegments(pos: ArrayLike<number>, index: ArrayLike<number> | null, Y: number): number[] {
  const seg: number[] = [];
  const n = index ? index.length : pos.length / 3;
  const P = (k: number): [number, number, number] => {
    const i = (index ? index[k]! : k) * 3;
    return [pos[i]!, pos[i + 1]!, pos[i + 2]!];
  };
  for (let t = 0; t + 2 < n; t += 3) {
    const v = [P(t), P(t + 1), P(t + 2)];
    const pts: number[] = [];
    for (let e = 0; e < 3; e++) {
      const a = v[e]!;
      const b = v[(e + 1) % 3]!;
      const da = a[1] - Y;
      const db = b[1] - Y;
      if ((da < 0 && db >= 0) || (da >= 0 && db < 0)) {
        const s = da / (da - db);
        pts.push(a[0] + (b[0] - a[0]) * s, a[2] + (b[2] - a[2]) * s);
      }
    }
    if (pts.length >= 4) seg.push(pts[0]!, pts[1]!, pts[2]!, pts[3]!);
  }
  return seg;
}

/** Aproximación sin geometría: rectángulo de la cuadrícula + proa en cuña. */
export function fallbackProfile(length: number, width: number): HullProfile {
  const xMin = -SHIP_ORIGIN_X - 0.3;
  const bow0 = length * CELL - SHIP_ORIGIN_X;
  const xMax = bow0 + 7;
  const hwMax = (width * CELL) / 2 + 0.3;
  const hw = new Float32Array(HULL_SAMPLES);
  for (let i = 0; i < HULL_SAMPLES; i++) {
    const x = xMin + ((xMax - xMin) * i) / (HULL_SAMPLES - 1);
    const t = Math.max(0, (x - bow0) / (xMax - bow0));
    hw[i] = hwMax * (1 - t ** 1.5);
  }
  return { xMin, xMax, hw };
}

/**
 * Perfil a la altura `y` (por defecto la flotación) con un margen hacia dentro `inset` (m): la
 * máscara queda unos centímetros dentro del forro para que nunca asome un hueco por fuera.
 */
export function waterlineProfile(length: number, width: number, y = WATERLINE_Y, inset = 0.1): HullProfile {
  let geos: ReturnType<typeof buildHull> | null = null;
  try {
    geos = buildHull({ length, width });
    const g = geos.hull;
    const pos = g.getAttribute('position').array as ArrayLike<number>;
    const idx = g.getIndex()?.array ?? null;
    const seg = sliceSegments(pos, idx, y);
    if (seg.length < 8) return fallbackProfile(length, width);
    let xMin = Infinity;
    let xMax = -Infinity;
    for (let i = 0; i < seg.length; i += 2) {
      xMin = Math.min(xMin, seg[i]!);
      xMax = Math.max(xMax, seg[i]!);
    }
    if (!(xMax - xMin > 4)) return fallbackProfile(length, width);
    const hw = new Float32Array(HULL_SAMPLES);
    for (let s = 0; s < HULL_SAMPLES; s++) {
      const x = Math.min(xMax - 1e-3, Math.max(xMin + 1e-3, xMin + ((xMax - xMin) * s) / (HULL_SAMPLES - 1)));
      let best = 0;
      for (let i = 0; i < seg.length; i += 4) {
        const x0 = seg[i]!;
        const z0 = seg[i + 1]!;
        const x1 = seg[i + 2]!;
        const z1 = seg[i + 3]!;
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        if (x < lo || x > hi) continue;
        const t = hi - lo < 1e-6 ? 0 : (x - x0) / (x1 - x0);
        const z = Math.abs(z0 + (z1 - z0) * t);
        if (z > best) best = z;
      }
      hw[s] = Math.max(0, best - inset);
    }
    hw[HULL_SAMPLES - 1] = 0;
    return { xMin: xMin + inset, xMax: xMax - inset, hw };
  } catch (err) {
    console.warn('[Renderer] no se pudo cortar el casco; se usa un perfil aproximado', err);
    return fallbackProfile(length, width);
  } finally {
    if (geos) {
      for (const v of Object.values(geos)) {
        if (v && typeof v === 'object' && 'dispose' in v && typeof (v as { dispose: unknown }).dispose === 'function') {
          (v as { dispose(): void }).dispose();
        }
      }
    }
  }
}

/**
 * APAREJO EXTERIOR DEL BARCO (ronda de arte con Blender: scripts/blender/models/cubierta.py y
 * aparejos.py). Da carácter al barco visto desde fuera —barco de expedición con añadidos
 * industriales y caseros— sin tocar la jugabilidad: todo va donde no se camina ni se construye.
 *
 *  - Costados y espejo de popa: imbornales con chorreones de óxido, costuras de planchas que
 *    rezuman, parches soldados (uno pintado de minio) y una escalerilla de gato por banda. Todo
 *    entre la línea blanca y el filete de la regala, apartado de ojos de buey, neumáticos, aros,
 *    pescantes y rótulo del casco procedural (ship/hull.ts).
 *  - Castillo de proa (por fuera de la barandilla de la cuadrícula): barriles, cajas, bidón y cabo
 *    estibados entre la escotilla y las bitas.
 *  - Techos sin acceso (losas 'top'): manguerotes, antenas de látigo, bocina, bidones, barriles y
 *    rollos de cabo, apartados de la chimenea y del mástil del radar del puente; faroles colgados de
 *    escuadras bajo el alero de las paredes que dan al vacío y faroles en postes en la regala de popa.
 *
 * Se calcula de forma determinista a partir del layout (`planOutfit`) y se rehace solo cuando cambia
 * lo que lee (`outfitKey`: eslora, manga, niveles, techos y puente). Todo va fusionado en tres
 * mallas como mucho (tres llamadas de dibujo): sólido del casco y la proa, sólido de los techos y
 * faroles, y cristal de los faroles (material de farol, que brilla de noche). Las de los techos se
 * ocultan con la vista en corte del modo construcción, como los techos.
 *
 * Respaldo: si falta un modelo (modelGeometry devuelve null) esa pieza no se dibuja; sin ningún
 * modelo no hay mallas y el barco queda exactamente como antes de la ronda de arte.
 */
import * as THREE from 'three';
import { registerDebug } from '../../game/debug';
import { CELL, SHIP_ORIGIN_X, WALL_H } from '../../sim/constants';
import { cellMin, levelY, moduleCells, type ShipLayout } from '../../sim/ship';
import type { ModuleInstance } from '../../sim/types';
import { modelGeometry } from '../assets';
import type { ShipMaterials } from './materials';
import { BULWARK_H, BULWARK_T, DECK_Y, bowStartX, hullHalfWidth, sternX } from './hull';
import { GeoBuilder, hash01 } from './geo';
import { WALL_VIS_T } from './structure';

/** Capa de una pieza: 'casco' (costados y proa) o 'techo' (techos, faroles; se oculta con el corte). */
export type OutfitLayer = 'casco' | 'techo';

/** Una pieza colocada: modelo de Blender, posición de su origen (base) y giro en Y (marco del barco). */
export interface OutfitItem {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  layer: OutfitLayer;
  /** Radio aproximado en planta (para separar piezas y para las pruebas). */
  r: number;
}

/* Medidas compartidas con scripts/blender/models/cubierta.py (si cambian allí, cámbialas aquí). */
/** Altura de la escalerilla de gato (de la flotación a la tapa de regala). */
export const ESC_H = 2.7;
/** Distancia de la cara de la pared al eje del farol de escuadra. */
export const FAROL_PARED = 0.36;
/** Vuelo del brazo del farol de poste. */
export const POSTE_BRAZO = 0.42;
/** Separación de las calcomanías respecto al casco (evita parpadeos de profundidad). */
export const DECAL_OFF = 0.008;
/** Altura de la boca de los imbornales (justo por encima de la cubierta, en la regala). */
const SCUPPER_Y = DECK_Y + 0.12;
/** Altura de las costuras de planchas (entre los ojos de buey y la cubierta). */
const SEAM_Y = DECK_Y - 0.1;
/** Franja azul del casco donde pueden ir las calcomanías (entre la línea blanca y el filete de la regala). */
export const NAVY_Y0 = 1.42;
export const NAVY_Y1 = DECK_Y + BULWARK_H - 0.13;

/** Modelos que llevan cristal aparte (`<modelo>_luz`, dibujado con el material de farol). */
const GLASS: Record<string, string> = { farol: 'farol_luz', farol_poste: 'farol_poste_luz' };

/** Giro en Y que lleva el frente de un modelo (−z local) hacia la dirección (dx, dz). */
export function yawToward(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

/** Altura (y máxima) de un modelo, o null si no está cargado. */
function modelTop(name: string): number | null {
  const g = modelGeometry(name);
  return g?.boundingBox ? g.boundingBox.max.y : null;
}

/* ================================================================== */
/* Plan: qué va dónde                                                   */
/* ================================================================== */

/** Rectángulo ocupado en un costado (x a lo largo del casco, y de altura). */
interface SideRect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Lo que el casco procedural ya tiene en los costados (ship/hull.ts, mismas fórmulas): ojos de buey
 * con su chorreón, neumáticos, aros salvavidas, pescantes del bote, rótulo y las curvas de proa y popa.
 */
export function hullReserved(length: number): SideRect[] {
  const x0 = bowStartX(length);
  const xs = sternX();
  const boatX = (-SHIP_ORIGIN_X + x0) / 2 + 1.5;
  const nameW = Math.min(6.2, Math.max(3.5, length * CELL * 0.16));
  const top = DECK_Y + BULWARK_H;
  const r: SideRect[] = [
    { x0: -Infinity, x1: xs + 0.7, y0: -Infinity, y1: Infinity },
    { x0: x0 - 0.9 - nameW - 0.25, x1: Infinity, y0: -Infinity, y1: Infinity },
  ];
  for (let cx = 0; cx < length; cx++) {
    const x = -SHIP_ORIGIN_X + (cx + 0.5) * CELL;
    r.push({ x0: x - 0.36, x1: x + 0.36, y0: 1.0, y1: 2.4 });
  }
  for (const fx of [-SHIP_ORIGIN_X + 8, x0 - 14, x0 - 8]) if (fx >= -SHIP_ORIGIN_X + 2 && fx <= x0 - 1) r.push({ x0: fx - 0.5, x1: fx + 0.5, y0: 1.2, y1: top });
  for (const rx of [-SHIP_ORIGIN_X + 3.2, boatX - 5.5, x0 - 3.5]) r.push({ x0: rx - 0.45, x1: rx + 0.45, y0: top - 0.9, y1: top });
  for (const dx of [-1.7, 1.7]) r.push({ x0: boatX + dx - 0.25, x1: boatX + dx + 0.25, y0: top - 0.75, y1: top });
  return r;
}

const overlaps = (a: SideRect, b: SideRect, gap: number): boolean => a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;

/** Media anchura y altura de un modelo (con valores por defecto si no está cargado). */
function modelSize(name: string, half: number, h: number): { half: number; h: number } {
  const b = modelGeometry(name)?.boundingBox;
  return b ? { half: Math.max(-b.min.x, b.max.x), h: b.max.y } : { half, h };
}

/** Piezas de los costados, el espejo de popa y el castillo de proa (capa 'casco'). */
function planHull(layout: ShipLayout, out: OutfitItem[]): void {
  const { length, width } = layout;
  const x0 = bowStartX(length);
  const xs = sternX();
  const hw = hullHalfWidth(width);
  const top = DECK_Y + BULWARK_H;
  const boatX = (-SHIP_ORIGIN_X + x0) / 2 + 1.5;
  const bounds: number[] = [];
  for (let k = 1; k < length; k++) bounds.push(-SHIP_ORIGIN_X + k * CELL);

  for (const s of [-1, 1]) {
    const z = s * (hw + DECAL_OFF);
    const yaw = yawToward(0, s);
    const taken = hullReserved(length);
    /** Coloca una pieza si su rectángulo no pisa nada (las calcomanías nunca se solapan). */
    const put = (model: string, x: number, y: number, size: { half: number; h: number }, gap: number, zz = z): boolean => {
      const rect = { x0: x - size.half, x1: x + size.half, y0: y, y1: y + size.h };
      if (rect.y0 < 1.0 || taken.some((t) => overlaps(t, rect, gap))) return false;
      taken.push(rect);
      out.push({ model, x, y, z: zz, yaw, layer: 'casco', r: size.half });
      return true;
    };
    // escalerilla de gato: babor a proa del bote, estribor a popa (cuelga de la regala hasta la flotación)
    const target = s < 0 ? boatX + 6.5 : boatX - 9.5;
    const esc = modelSize('escalerilla', 0.46, ESC_H + 0.1);
    for (const x of [...bounds].sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)) if (put('escalerilla', x, top - ESC_H, esc, 0.3, s * hw)) break;
    // parches soldados (más en un casco ampliado), bajos, entre ojos de buey
    let patches = 1 + Math.floor(Math.max(0, length - 10) / 4);
    for (const x of [...bounds].sort((a, b) => hash01(a, s, 21) - hash01(b, s, 21))) {
      if (patches <= 0) break;
      const model = `parche_${hash01(x, s, 23) < 0.6 ? 0 : 1}`;
      if (put(model, x + (hash01(x, s, 24) - 0.5) * 0.4, 1.62, modelSize(model, 0.5, 0.95), 0.25)) patches--;
    }
    // costuras de planchas que rezuman, justo bajo la cubierta (encima de los ojos de buey)
    let seams = Math.max(1, Math.round(length / 5));
    for (let i = 0; i < length && seams > 0; i++) {
      const cx = [...Array(length).keys()].sort((a, b) => hash01(a, s, 31) - hash01(b, s, 31))[i]!;
      const x = -SHIP_ORIGIN_X + (cx + 0.5) * CELL + (hash01(cx, s, 33) - 0.5) * 0.6;
      const model = `costura_${hash01(cx, s, 32) < 0.5 ? 0 : 1}`;
      const size = modelSize(model, 1.1, 0.6);
      if (put(model, x, SEAM_Y - size.h, size, 0.04)) seams--;
    }
    // imbornales con su chorreón: en las juntas de celda y, más espaciados, entre ojos de buey
    const spots: { x: number; p: number }[] = [];
    for (const b of bounds) {
      spots.push({ x: b, p: 0.9 });
      spots.push({ x: b + 1.05, p: 0.45 }, { x: b - 1.05, p: 0.45 });
    }
    for (const { x, p } of spots) {
      if (hash01(x, s, 25) > p) continue;
      const v = Math.floor(hash01(x, s, 26) * 3);
      const size = modelSize(`imbornal_${v}`, 0.22, 1.0);
      put(`imbornal_${v}`, x + (hash01(x, s, 27) - 0.5) * 0.4, SCUPPER_Y - size.h, size, 0.35);
    }
  }

  // Espejo de popa: dos imbornales con chorreón a los lados del rótulo.
  for (const s of [-1, 1]) {
    const v = s < 0 ? 0 : 2;
    const h = modelTop(`imbornal_${v}`) ?? 1;
    out.push({ model: `imbornal_${v}`, x: xs - DECAL_OFF, y: SCUPPER_Y - h, z: s * (hw - 1.45), yaw: yawToward(-1, 0), layer: 'casco', r: 0.25 });
  }

  // Castillo de proa, por fuera de la barandilla: carga estibada entre la escotilla y las bitas.
  const d = DECK_Y;
  out.push(
    { model: 'caja_madera', x: x0 + 0.85, y: d, z: 2.55, yaw: 0.12, layer: 'casco', r: 0.46 },
    { model: 'caja_madera', x: x0 + 0.9, y: d + 0.62, z: 2.5, yaw: -0.3, layer: 'casco', r: 0.46 },
    { model: 'bidon_rojo', x: x0 + 1.5, y: d, z: 3.3, yaw: 0.7, layer: 'casco', r: 0.3 },
    { model: 'rollo_cuerda', x: x0 + 0.75, y: d, z: 3.45, yaw: 1.1, layer: 'casco', r: 0.3 },
    { model: 'barril', x: x0 + 0.75, y: d, z: -2.35, yaw: 0.4, layer: 'casco', r: 0.33 },
    { model: 'barril', x: x0 + 0.8, y: d, z: -3.05, yaw: 1.9, layer: 'casco', r: 0.33 },
    { model: 'bidon', x: x0 + 1.45, y: d, z: -2.7, yaw: 0.2, layer: 'casco', r: 0.3 },
    { model: 'rollo_cuerda', x: x0 + 1.5, y: d, z: -3.55, yaw: 2.6, layer: 'casco', r: 0.3 },
  );
}

/** Zonas de los techos ocupadas por la chimenea y el mástil del radar del puente (ShipView). */
function bridgeKeepout(layout: ShipLayout, modules: ModuleInstance[]): { x: number; z: number; r: number }[] {
  const bridge = modules.find((m) => m.type === 'puente' && m.status !== 'construction');
  if (!bridge) return [];
  const cells = moduleCells(bridge).filter((c) => c.level === bridge.level);
  if (!cells.length) return [];
  cells.sort((a, b) => a.x - b.x);
  const aft = cells[0]!;
  const fwd = cells[cells.length - 1]!;
  const a = cellMin(aft.x, aft.z, layout.width);
  const f = cellMin(fwd.x, fwd.z, layout.width);
  const rx = f.x + CELL / 2 + (fwd.x === aft.x ? 0 : 0.5);
  return [
    { x: a.x + CELL / 2, z: a.z + CELL / 2, r: 1.05 },
    { x: rx, z: f.z + CELL / 2, r: 0.85 },
  ];
}

interface Slot {
  x: number;
  z: number;
  /** Distancia al borde del techo de la habitación. */
  edge: number;
  /** -1 popa … +1 proa dentro del techo. */
  fore: number;
  /** -1 hacia el centro del barco … +1 hacia la banda más cercana (0 si no da a ninguna). */
  out: number;
  corner: boolean;
}

/** Piezas de los techos sin acceso, faroles y aros (capa 'techo'). */
function planRoofs(layout: ShipLayout, modules: ModuleInstance[], out: OutfitItem[]): void {
  const { width, levels } = layout;
  const tops = new Map<number, { x: number; z: number; y: number }[]>();
  for (const s of layout.slabs) {
    if (s.kind !== 'top' || s.moduleId === null) continue;
    let a = tops.get(s.moduleId);
    if (!a) tops.set(s.moduleId, (a = []));
    a.push({ x: s.x, z: s.z, y: s.y });
  }
  const keep = bridgeKeepout(layout, modules);
  const byId = new Map(modules.map((m) => [m.id, m]));
  for (const id of [...tops.keys()].sort((a, b) => a - b)) {
    const cells = tops.get(id)!;
    const mod = byId.get(id);
    const isBridge = mod?.type === 'puente';
    const y = cells[0]!.y + 0.07;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const c of cells) {
      const mn = cellMin(c.x, c.z, width);
      minX = Math.min(minX, mn.x);
      maxX = Math.max(maxX, mn.x + CELL);
      minZ = Math.min(minZ, mn.z);
      maxZ = Math.max(maxZ, mn.z + CELL);
    }
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const side = cells.some((c) => c.z === 0) ? -1 : cells.some((c) => c.z === width - 1) ? 1 : 0;
    // huecos posibles: esquinas y mitades de los lados de cada celda, a 0,55 m del borde
    const slots: Slot[] = [];
    const inset = 0.55;
    for (const c of cells) {
      const mn = cellMin(c.x, c.z, width);
      for (const u of [inset, CELL / 2, CELL - inset])
        for (const v of [inset, CELL / 2, CELL - inset]) {
          if (u === CELL / 2 && v === CELL / 2) continue;
          const x = mn.x + u;
          const z = mn.z + v;
          if (keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r + 0.45)) continue;
          const ex = Math.min(x - minX, maxX - x);
          const ez = Math.min(z - minZ, maxZ - z);
          slots.push({ x, z, edge: Math.min(ex, ez), fore: (x - cx) / Math.max(1, (maxX - minX) / 2), out: side === 0 ? 0 : (side * (z - cz)) / Math.max(1, (maxZ - minZ) / 2), corner: ex < 1 && ez < 1 });
        }
    }
    const taken: { x: number; z: number; r: number }[] = [];
    const take = (score: (s: Slot) => number, r: number): Slot | null => {
      let best: Slot | null = null;
      let bestScore = -Infinity;
      for (const s of slots) {
        if (taken.some((t) => Math.hypot(t.x - s.x, t.z - s.z) < t.r + r + 0.35)) continue;
        const v = score(s) + hash01(s.x, s.z, id, 41) * 0.05;
        if (v > bestScore) {
          bestScore = v;
          best = s;
        }
      }
      if (best) taken.push({ x: best.x, z: best.z, r });
      return best;
    };
    const roofItem = (model: string, s: Slot, yaw: number, r: number, dy = 0): void => void out.push({ model, x: s.x, y: y + dy, z: s.z, yaw, layer: 'techo', r });
    const nCells = cells.length;
    // ventilación: manguerotes en las esquinas (uno mira a proa y el siguiente a popa)
    const vents = isBridge ? 2 : Math.max(1, Math.round(nCells / 2));
    for (let i = 0; i < vents; i++) {
      const s = take((q) => (q.corner ? 2 : 0) - q.fore * (isBridge ? 1.5 : 0.5) - q.out * 0.6 * (i % 2 ? -1 : 1), 0.3);
      if (s) roofItem('manguerote', s, yawToward(i % 2 ? -1 : 1, 0), 0.3);
    }
    // antenas de látigo: el puente lleva dos, a la banda; otros techos, a veces una
    const antennas = isBridge ? 2 : hash01(id, 43) < 0.5 ? 1 : 0;
    for (let i = 0; i < antennas; i++) {
      const s = take((q) => (q.corner ? 1.5 : 0) + q.out * 2 + (i ? -q.fore : q.fore), 0.12);
      if (s) roofItem('antena', s, 0, 0.12);
    }
    // bocina del puente mirando a proa, en el borde de proa
    if (isBridge) {
      const s = take((q) => q.fore * 3 - q.edge - Math.abs(q.out) * 0.5, 0.3);
      if (s) roofItem('bocina', s, yawToward(1, 0), 0.3);
    }
    // estiba: un rincón con barriles, bidones o una caja con su rollo de cabo por cada celda
    for (let i = 0; i < nCells; i++) {
      const kind = Math.floor(hash01(id, i, 47) * 3);
      const s = take((q) => -q.edge * 1.5 - q.out * 0.8 + (q.corner ? 0.5 : 0), 0.75);
      if (!s) break;
      // a lo largo del borde más cercano
      const alongX = Math.min(s.z - minZ, maxZ - s.z) < Math.min(s.x - minX, maxX - s.x);
      const ax = alongX ? 0.36 : 0;
      const az = alongX ? 0 : 0.36;
      const rot = hash01(s.x, s.z, 48) * Math.PI * 2;
      const at = (k: number): Slot => ({ ...s, x: s.x + ax * k, z: s.z + az * k });
      if (kind === 0) {
        roofItem('barril', at(-1), rot, 0.33);
        roofItem('rollo_cuerda', at(1), rot + 1, 0.3);
      } else if (kind === 1) {
        roofItem('bidon', at(-1), rot, 0.3);
        roofItem('bidon_rojo', at(1), rot + 2, 0.3);
      } else {
        roofItem('caja_madera', at(-0.2), alongX ? 0 : Math.PI / 2, 0.46);
        roofItem('rollo_cuerda', at(-0.2), rot, 0.3, 0.62);
      }
    }
  }

  // Faroles de escuadra bajo el alero de las paredes que dan al vacío (dos por habitación de arriba,
  // en los extremos del tramo que mira a la banda o, si no da a ninguna, a popa o a proa).
  const top = levels - 1;
  for (const id of [...tops.keys()].sort((a, b) => a - b)) {
    const walls = layout.walls.filter((w) => w.level === top && w.kind === 'wall' && w.exterior && w.moduleId === id);
    if (!walls.length) continue;
    const pick = (fn: (w: (typeof walls)[number]) => boolean): typeof walls => walls.filter(fn);
    let run = pick((w) => w.z0 === w.z1 && Math.abs(Math.abs(w.z0) - (width * CELL) / 2) < 1e-6);
    if (!run.length) run = pick((w) => w.x0 === w.x1);
    if (!run.length) continue;
    // tramo en una sola línea (la primera por orden) y sus dos extremos
    const line = run[0]!;
    const same = run.filter((w) => (line.z0 === line.z1 ? w.z0 === w.z1 && w.z0 === line.z0 : w.x0 === w.x1 && w.x0 === line.x0));
    const alongX = line.z0 === line.z1;
    const lo = Math.min(...same.map((w) => (alongX ? Math.min(w.x0, w.x1) : Math.min(w.z0, w.z1))));
    const hi = Math.max(...same.map((w) => (alongX ? Math.max(w.x0, w.x1) : Math.max(w.z0, w.z1))));
    const ox = -line.nx;
    const oz = -line.nz;
    const off = WALL_VIS_T / 2 + FAROL_PARED;
    const yb = levelY(top) + WALL_H - 0.9;
    for (const u of [lo + 0.32, hi - 0.32]) {
      const x = alongX ? u : line.x0 + ox * off;
      const z = alongX ? line.z0 + oz * off : u;
      out.push({ model: 'farol', x, y: yb, z, yaw: yawToward(ox, oz), layer: 'techo', r: 0.15 });
    }
  }

  // Faroles en poste en las esquinas de la regala de popa (el farol cuelga por fuera del espejo).
  const hw = hullHalfWidth(width);
  for (const s of [-1, 1]) out.push({ model: 'farol_poste', x: sternX() + BULWARK_T / 2, y: DECK_Y + BULWARK_H, z: s * (hw - 0.42), yaw: yawToward(-1, 0), layer: 'techo', r: 0.1 });
}

/**
 * Piezas del aparejo exterior para este barco: determinista (solo depende del layout y de la posición
 * del puente) y nunca sobre celdas transitables ni construibles.
 */
export function planOutfit(layout: ShipLayout, modules: ModuleInstance[]): OutfitItem[] {
  const out: OutfitItem[] = [];
  planHull(layout, out);
  planRoofs(layout, modules, out);
  return out;
}

/** Firma de lo que lee `planOutfit` (si no cambia, el aparejo no se rehace). */
export function outfitKey(layout: ShipLayout, modules: ModuleInstance[]): string {
  let k = `${layout.length}x${layout.width}x${layout.levels}|`;
  for (const s of layout.slabs) if (s.kind === 'top') k += `${s.x},${s.z},${s.moduleId};`;
  const top = layout.levels - 1;
  for (const w of layout.walls) if (w.level === top && w.kind === 'wall' && w.exterior) k += `w${w.x0},${w.z0},${w.x1},${w.z1},${w.moduleId};`;
  const b = modules.find((m) => m.type === 'puente' && m.status !== 'construction');
  k += b ? `|b${b.id}:${b.level},${b.x},${b.z},${b.rot}` : '|b-';
  return k;
}

/* ================================================================== */
/* Mallas                                                              */
/* ================================================================== */

let enabled = true;

/** Activa o quita el aparejo exterior (comparaciones antes/después y pruebas). */
export function setOutfitEnabled(on: boolean): void {
  enabled = on;
}

export function outfitEnabled(): boolean {
  return enabled;
}

// __game.cmd.aparejo(false) quita el aparejo exterior (y aparejo() lo vuelve a poner) sin recargar.
registerDebug('aparejo', ((on = true) => {
  setOutfitEnabled(!!on);
  return !!on;
}) as never);

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);
const _up = new THREE.Vector3(0, 1, 0);

/** Geometrías fusionadas de un plan: sólido del casco, sólido de los techos y cristal de faroles. */
export function bakeOutfit(items: OutfitItem[]): { casco: THREE.BufferGeometry | null; techo: THREE.BufferGeometry | null; luz: THREE.BufferGeometry | null; placed: number } {
  const b = { casco: new GeoBuilder(), techo: new GeoBuilder(), luz: new GeoBuilder() };
  let placed = 0;
  for (const it of items) {
    const geo = modelGeometry(it.model);
    if (!geo) continue;
    _q.setFromAxisAngle(_up, it.yaw);
    _m.compose(_p.set(it.x, it.y, it.z), _q, _one);
    b[it.layer].appendGeometry(geo, _m);
    const glass = GLASS[it.model];
    const gg = glass ? modelGeometry(glass) : null;
    if (gg) b.luz.appendGeometry(gg, _m);
    placed++;
  }
  const done = (g: GeoBuilder): THREE.BufferGeometry | null => (g.isEmpty() ? null : g.build());
  return { casco: done(b.casco), techo: done(b.techo), luz: done(b.luz), placed };
}

/**
 * Grupo del aparejo exterior en ShipView: se rehace cuando cambia `outfitKey` y se oculta por capas
 * con la vista en corte (`setVisibleLevel`).
 */
export class ShipOutfit {
  readonly group = new THREE.Group();
  private casco: THREE.Mesh | null = null;
  private techo: THREE.Mesh | null = null;
  private luz: THREE.Mesh | null = null;
  private key: string | null = null;
  /** Depuración y pruebas: reconstrucciones, piezas colocadas, triángulos, mallas y coste de la última. */
  readonly stats = { rebuilds: 0, items: 0, triangles: 0, meshes: 0, lastMs: 0 };

  constructor(private readonly mats: ShipMaterials) {
    this.group.name = 'aparejo';
  }

  /** Rehace el aparejo si ha cambiado lo que lee. Devuelve true si lo ha rehecho. */
  sync(layout: ShipLayout, modules: ModuleInstance[]): boolean {
    const key = enabled ? outfitKey(layout, modules) : 'off';
    if (key === this.key) return false;
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.key = key;
    this.clear();
    const baked = enabled ? bakeOutfit(planOutfit(layout, modules)) : { casco: null, techo: null, luz: null, placed: 0 };
    const add = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, shadow: boolean): THREE.Mesh | null => {
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      return mesh;
    };
    this.casco = add(baked.casco, this.mats.solid, 'aparejo-casco', true);
    this.techo = add(baked.techo, this.mats.solid, 'aparejo-techos', true);
    this.luz = add(baked.luz, this.mats.lantern, 'aparejo-faroles', false);
    this.stats.rebuilds++;
    this.stats.items = baked.placed;
    this.stats.meshes = this.group.children.length;
    this.stats.triangles = [baked.casco, baked.techo, baked.luz].reduce((a, g) => a + (g ? g.getAttribute('position').count / 3 : 0), 0);
    this.stats.lastMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return true;
  }

  /** Visibilidad según el nivel visible máximo (modo construcción): la proa y los costados con la cubierta; los techos y faroles, con los techos. */
  setVisibleLevel(maxLevel: number, levels: number): void {
    if (this.casco) this.casco.visible = maxLevel >= 1;
    const roofs = maxLevel >= levels;
    if (this.techo) this.techo.visible = roofs;
    if (this.luz) this.luz.visible = roofs;
  }

  /** Fuerza la reconstrucción en el siguiente `sync` (partida nueva, carga, modelos cambiados). */
  reset(): void {
    this.key = null;
  }

  private clear(): void {
    for (const m of [this.casco, this.techo, this.luz]) {
      if (!m) continue;
      m.removeFromParent();
      m.geometry.dispose();
    }
    this.casco = this.techo = this.luz = null;
  }

  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}

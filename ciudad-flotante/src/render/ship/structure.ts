/**
 * ESTRUCTURA DEL BARCO a partir del layout (sim/ship.ts → computeLayout):
 * losas (cubierta de tablones, suelos de habitación, techos de chapa), paredes con su cara
 * interior/exterior y ventanas, forro de la bodega con cuadernas y tuberías, barandillas,
 * laterales y peldaños de escalera, puertas (marco + hoja abierta), lámparas de techo y faroles.
 *
 * Todo se escribe en constructores por nivel (`LevelBuilders`) que ShipView fusiona en
 * pocas mallas. Devuelve los puntos de luz para el pool de luces dinámicas.
 */
import * as THREE from 'three';
import { CELL, DOOR_H, LEVEL_H, RAIL_H, WALL_H } from '../../sim/constants';
import { cellMin, getCell, levelY, pointToCell, type DoorInfo, type LayoutCell, type PropInstance, type Ramp, type ShipLayout, type WallSeg } from '../../sim/ship';
import type { ModuleInstance } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, shade, type ColorLike } from './geo';
import { roomStyle, type RoomStyle } from './styles';

/** Grosor visual de las paredes. */
export const WALL_VIS_T = 0.2;
/** Grosor de los forjados. */
export const SLAB_T = LEVEL_H - WALL_H;

export interface LevelBuilders {
  solid: GeoBuilder;
  glassOut: GeoBuilder;
  glassIn: GeoBuilder;
  lamps: GeoBuilder;
  lanterns: GeoBuilder;
}

export function makeLevelBuilders(): LevelBuilders {
  return { solid: new GeoBuilder(), glassOut: new GeoBuilder(), glassIn: new GeoBuilder(), lamps: new GeoBuilder(), lanterns: new GeoBuilder() };
}

export interface LightSpot {
  x: number;
  y: number;
  z: number;
  level: number;
  /** 'room' lámpara de techo, 'hold' farol de bodega, 'deck' aplique exterior (solo de noche). */
  kind: 'room' | 'hold' | 'deck';
  moduleId: number | null;
}

export interface StructureInput {
  layout: ShipLayout;
  modules: Map<number, ModuleInstance>;
  /** Multiplicador de color por módulo (dañado → más oscuro). */
  tintOf: (moduleId: number | null) => number;
  /** Constructores por nivel: índices 0..layout.levels (el último son los techos 'top'). */
  levels: LevelBuilders[];
}

interface Band {
  y0: number;
  y1: number;
  c: ColorLike;
}

interface Opening {
  u0: number;
  u1: number;
  y0: number;
  y1: number;
}

const T = WALL_VIS_T;

function interiorBands(s: RoomStyle): Band[] {
  return [
    { y0: 0, y1: 0.12, c: s.trim },
    { y0: 0.12, y1: 0.95, c: s.wallLower },
    { y0: 0.95, y1: 1.02, c: s.trim },
    { y0: 1.02, y1: WALL_H - 0.08, c: s.wallUpper },
    { y0: WALL_H - 0.08, y1: WALL_H, c: s.trim },
  ];
}

const OUTDOOR_BANDS: Band[] = [
  { y0: 0, y1: 0.2, c: PALETTE.wallTrim },
  { y0: 0.2, y1: WALL_H - 0.26, c: PALETTE.wallOuter },
  { y0: WALL_H - 0.26, y1: WALL_H, c: PALETTE.wallTrim },
];

/** Tabiques de madera (habitaciones en la bodega vistas desde la bodega, laterales de escalera). */
function plankBands(base: ColorLike, h = WALL_H, w = 0.3): Band[] {
  const out: Band[] = [];
  let i = 0;
  for (let y = 0; y < h - 1e-6; y += w, i++) out.push({ y0: y, y1: Math.min(h, y + w), c: shade(base, i % 2 ? 0.92 : 1.02 - (i % 3) * 0.03) });
  return out;
}

function bandAt(bands: Band[], y: number): ColorLike {
  for (const b of bands) if (y >= b.y0 - 1e-6 && y <= b.y1 + 1e-6) return b.c;
  return bands[bands.length - 1]!.c;
}

/**
 * Panel de pared en el marco local (u a lo largo, y arriba, z = normal hacia el lado "propio").
 * Cara +z con `inBands`, cara -z con `outBands`, con huecos (`openings`) y tapas.
 */
function panel(
  g: GeoBuilder,
  u0: number,
  u1: number,
  yb: number,
  yt: number,
  t: number,
  inBands: Band[] | null,
  outBands: Band[] | null,
  openings: Opening[],
  topC: ColorLike | null,
  cap0: ColorLike | null,
  cap1: ColorLike | null,
): void {
  const h2 = t / 2;
  const faces: [Band[] | null, number][] = [
    [inBands, 1],
    [outBands, -1],
  ];
  for (const [bands, side] of faces) {
    if (!bands) continue;
    const ys = new Set<number>([yb, yt]);
    for (const b of bands) {
      if (b.y0 > yb && b.y0 < yt) ys.add(b.y0);
      if (b.y1 > yb && b.y1 < yt) ys.add(b.y1);
    }
    for (const o of openings) {
      if (o.y0 > yb && o.y0 < yt) ys.add(o.y0);
      if (o.y1 > yb && o.y1 < yt) ys.add(o.y1);
    }
    const yl = [...ys].sort((a, b) => a - b);
    for (let i = 0; i + 1 < yl.length; i++) {
      const ya = yl[i]!;
      const yc = yl[i + 1]!;
      if (yc - ya < 1e-5) continue;
      const c = bandAt(bands, (ya + yc) / 2);
      // Intervalos u libres de huecos
      let segs: [number, number][] = [[u0, u1]];
      for (const o of openings) {
        if (o.y0 <= ya + 1e-6 && o.y1 >= yc - 1e-6) {
          const next: [number, number][] = [];
          for (const [a, b] of segs) {
            if (o.u1 <= a || o.u0 >= b) next.push([a, b]);
            else {
              if (o.u0 > a) next.push([a, o.u0]);
              if (o.u1 < b) next.push([o.u1, b]);
            }
          }
          segs = next;
        }
      }
      for (const [a, b] of segs) {
        if (b - a < 1e-5) continue;
        if (side > 0) g.quadN(a, ya, h2, b, ya, h2, b, yc, h2, a, yc, h2, c);
        else g.quadN(b, ya, -h2, a, ya, -h2, a, yc, -h2, b, yc, -h2, c);
      }
    }
  }
  if (topC) g.quadN(u0, yt, h2, u1, yt, h2, u1, yt, -h2, u0, yt, -h2, topC);
  if (cap0) g.quadN(u0, yb, -h2, u0, yb, h2, u0, yt, h2, u0, yt, -h2, cap0);
  if (cap1) g.quadN(u1, yb, h2, u1, yb, -h2, u1, yt, -h2, u1, yt, h2, cap1);
  for (const o of openings) {
    const rc = topC ?? (inBands ? bandAt(inBands, o.y0) : PALETTE.wallOuter);
    g.quadN(o.u0, o.y0, h2, o.u1, o.y0, h2, o.u1, o.y0, -h2, o.u0, o.y0, -h2, rc);
    g.quadN(o.u0, o.y1, -h2, o.u1, o.y1, -h2, o.u1, o.y1, h2, o.u0, o.y1, h2, rc);
    g.quadN(o.u0, o.y0, h2, o.u0, o.y0, -h2, o.u0, o.y1, -h2, o.u0, o.y1, h2, rc);
    g.quadN(o.u1, o.y0, -h2, o.u1, o.y0, h2, o.u1, o.y1, h2, o.u1, o.y1, -h2, rc);
  }
}

/** Aplica la misma transformación a varios constructores, ejecuta `fn` y la deshace. */
function inFrame(builders: GeoBuilder[], x: number, y: number, z: number, yaw: number, fn: () => void): void {
  for (const b of builders) {
    b.push();
    b.translate(x, y, z);
    b.rotateY(yaw);
  }
  fn();
  for (const b of builders) b.pop();
}

/** Marco local de un segmento: origen en el punto medio, z local = normal (nx, nz). */
function wallFrame(w: { x0: number; z0: number; x1: number; z1: number; nx: number; nz: number }): { mx: number; mz: number; yaw: number; len: number; ex: number; ez: number } {
  const mx = (w.x0 + w.x1) / 2;
  const mz = (w.z0 + w.z1) / 2;
  const len = Math.abs(w.x1 - w.x0) + Math.abs(w.z1 - w.z0);
  const yaw = Math.atan2(w.nx, w.nz);
  // eje u local en el mundo
  const ex = Math.cos(yaw);
  const ez = -Math.sin(yaw);
  return { mx, mz, yaw, len, ex, ez };
}

function key(l: number, x: number, z: number): string {
  return `${l},${x},${z}`;
}

function ptKey(l: number, x: number, z: number): string {
  return `${l}|${Math.round(x * 100)}|${Math.round(z * 100)}`;
}

/* ================================================================== */

export function buildStructure(inp: StructureInput): { lights: LightSpot[] } {
  const { layout, modules, tintOf } = inp;
  const lights: LightSpot[] = [];
  const W = layout.width;
  const moduleType = (id: number | null): string | null => (id === null ? null : (modules.get(id)?.type ?? null));
  const cellAt = (l: number, x: number, z: number): LayoutCell | null => getCell(layout, l, x, z);

  /* ---------------- Losas ---------------- */
  const slabSet = new Set<string>();
  const topSet = new Set<string>();
  interface SlabLike {
    level: number;
    x: number;
    z: number;
    y: number;
    kind: 'hold' | 'deck' | 'roof' | 'roomFloor' | 'top';
    moduleId: number | null;
  }
  const slabs: SlabLike[] = [];
  for (const s of layout.slabs) {
    slabs.push(s);
    (s.kind === 'top' ? topSet : slabSet).add(key(s.level, s.x, s.z));
  }
  // Bajo cada escalera (tramo inferior) ponemos suelo para que no quede un hueco al nivel de abajo.
  for (let l = 0; l < layout.levels; l++) {
    for (let x = 0; x < layout.length; x++) {
      for (let z = 0; z < W; z++) {
        const c = layout.cells[l]![x]![z]!;
        if (c.kind !== 'stairLow') continue;
        const kind: SlabLike['kind'] = l === 0 ? 'hold' : l === 1 ? 'deck' : 'roof';
        slabs.push({ level: l, x, z, y: levelY(l), kind, moduleId: null });
        slabSet.add(key(l, x, z));
      }
    }
  }

  for (const s of slabs) {
    const isTop = s.kind === 'top';
    const lb = inp.levels[Math.min(s.level, inp.levels.length - 1)]!;
    const g = lb.solid;
    const mn = cellMin(s.x, s.z, W);
    const set = isTop ? topSet : slabSet;
    const has = (dx: number, dz: number): boolean => set.has(key(s.level, s.x + dx, s.z + dz));
    const inGrid = (dx: number, dz: number): boolean => s.x + dx >= 0 && s.x + dx < layout.length && s.z + dz >= 0 && s.z + dz < W;
    // Alero de los techos superiores
    const ov = isTop ? 0.18 : 0;
    const x0 = mn.x - (isTop && !has(-1, 0) ? ov : 0);
    const x1 = mn.x + CELL + (isTop && !has(1, 0) ? ov : 0);
    const z0 = mn.z - (isTop && !has(0, -1) ? ov : 0);
    const z1 = mn.z + CELL + (isTop && !has(0, 1) ? ov : 0);
    const yTop = s.y + (isTop ? 0.04 : 0);
    const yBot = s.y - SLAB_T;
    const modType = moduleType(s.moduleId);
    // Solo las habitaciones oscurecen su suelo al dañarse (el equipamiento ya se ve en el prop).
    g.tint = s.kind === 'roomFloor' || s.kind === 'top' ? tintOf(s.moduleId) : 1;
    const seed = s.level * 1000 + s.x * 37 + s.z * 11;
    // Superficie superior
    if (isTop) corrugated(g, x0, z0, x1, z1, yTop);
    else if (s.kind === 'roomFloor') roomFloor(g, mn.x, mn.z, mn.x + CELL, mn.z + CELL, s.y, roomStyle(modType), seed);
    else if (s.kind === 'hold') planks(g, mn.x, mn.z, mn.x + CELL, mn.z + CELL, s.y, 'x', 8, PALETTE.holdFloor, seed, 0.05);
    else if (s.kind === 'roof') planks(g, mn.x, mn.z, mn.x + CELL, mn.z + CELL, s.y, 'x', 12, shade(PALETTE.deckWood, 1.04), seed, 0.04);
    else planks(g, mn.x, mn.z, mn.x + CELL, mn.z + CELL, s.y, 'x', 13, PALETTE.deckWood, seed, 0.05);
    // Cara inferior: techo de lo que haya debajo
    const below = s.level > 0 ? cellAt(s.level - 1, s.x, s.z) : null;
    if (s.level > 0) {
      let under: ColorLike = shade(PALETTE.deckWoodDark, 0.95);
      if (below?.kind === 'room') under = roomStyle(moduleType(below.moduleId)).ceiling;
      g.quadN(x0, yBot, z0, x1, yBot, z0, x1, yBot, z1, x0, yBot, z1, under);
      if (below?.kind === 'room') {
        // vigas de madera en el techo de las habitaciones
        const bc = roomStyle(moduleType(below.moduleId)).trim;
        for (const bx of [mn.x + 1.33, mn.x + 2.67]) g.box(bx - 0.07, yBot - 0.12, mn.z, bx + 0.07, yBot, mn.z + CELL, bc, { py: true });
      } else if (below?.kind === 'hold') {
        // baos de la bodega
        const bc = shade(PALETTE.deckWoodDark, 0.72);
        for (const bx of [mn.x + 1.0, mn.x + 3.0]) g.box(bx - 0.1, yBot - 0.24, mn.z, bx + 0.1, yBot, mn.z + CELL, bc, { py: true });
      }
    }
    // Cantos donde no hay losa vecina
    const edgeC: ColorLike = isTop ? PALETTE.roofDark : s.level >= 2 ? PALETTE.wallTrim : shade(PALETTE.deckWoodDark, 0.85);
    const skipGridEdge = s.level <= 1;
    const yE0 = isTop ? s.y - 0.12 : yBot;
    if (s.level > 0) {
      if (!has(1, 0) && !(skipGridEdge && !inGrid(1, 0))) g.quadN(x1, yE0, z1, x1, yE0, z0, x1, yTop, z0, x1, yTop, z1, edgeC);
      if (!has(-1, 0) && !(skipGridEdge && !inGrid(-1, 0))) g.quadN(x0, yE0, z0, x0, yE0, z1, x0, yTop, z1, x0, yTop, z0, edgeC);
      if (!has(0, 1) && !(skipGridEdge && !inGrid(0, 1))) g.quadN(x0, yE0, z1, x1, yE0, z1, x1, yTop, z1, x0, yTop, z1, edgeC);
      if (!has(0, -1) && !(skipGridEdge && !inGrid(0, -1))) g.quadN(x1, yE0, z0, x0, yE0, z0, x0, yTop, z0, x1, yTop, z0, edgeC);
    }
    if (isTop) {
      // bajo el alero
      if (ov > 0) {
        const uc = roomStyle(modType).ceiling;
        g.quadN(x0, s.y - 0.12, z0, x1, s.y - 0.12, z0, x1, s.y - 0.12, z1, x0, s.y - 0.12, z1, shade(uc, 0.9));
      }
    }
    g.tint = 1;
  }

  /* ---------------- Paredes ---------------- */
  const ends = new Map<string, WallSeg[]>();
  for (const w of layout.walls) {
    for (const [x, z] of [
      [w.x0, w.z0],
      [w.x1, w.z1],
    ] as const) {
      const k = ptKey(w.level, x, z);
      let a = ends.get(k);
      if (!a) ends.set(k, (a = []));
      a.push(w);
    }
  }
  const doorEdges = new Set<string>();
  for (const d of layout.doors) {
    const h = d.width / 2;
    if (d.axis === 'x') {
      doorEdges.add(ptKey(d.level, d.x - h, d.z));
      doorEdges.add(ptKey(d.level, d.x + h, d.z));
    } else {
      doorEdges.add(ptKey(d.level, d.x, d.z - h));
      doorEdges.add(ptKey(d.level, d.x, d.z + h));
    }
  }
  const axisOf = (w: WallSeg): 'x' | 'z' => (Math.abs(w.z0 - w.z1) < 1e-6 ? 'x' : 'z');
  /** Qué hacer en un extremo: prolongar (esquina), tapar o nada (continúa en línea). */
  const endMode = (w: WallSeg, x: number, z: number): 'extend' | 'cap' | 'none' => {
    const k = ptKey(w.level, x, z);
    if (doorEdges.has(k)) return 'cap';
    const others = (ends.get(k) ?? []).filter((o) => o !== w);
    const colinear = others.filter((o) => axisOf(o) === axisOf(w));
    if (colinear.some((o) => o.kind === 'wall' || o.kind === 'hull')) return 'none';
    if (colinear.length) return 'cap';
    return others.some((o) => o.kind === 'wall' || o.kind === 'hull') ? 'extend' : 'cap';
  };

  const cellAcross = (w: WallSeg): LayoutCell | null => {
    const mx = (w.x0 + w.x1) / 2 - w.nx * 0.5;
    const mz = (w.z0 + w.z1) / 2 - w.nz * 0.5;
    const c = pointToCell(mx, mz, W);
    return cellAt(w.level, c.x, c.z);
  };
  const cellOwn = (w: WallSeg): LayoutCell | null => {
    const mx = (w.x0 + w.x1) / 2 + w.nx * 0.5;
    const mz = (w.z0 + w.z1) / 2 + w.nz * 0.5;
    const c = pointToCell(mx, mz, W);
    return cellAt(w.level, c.x, c.z);
  };

  const propsByLevel = new Map<number, PropInstance[]>();
  for (const p of layout.props) {
    const l = Math.round(p.y / LEVEL_H - 0.01);
    let a = propsByLevel.get(l);
    if (!a) propsByLevel.set(l, (a = []));
    a.push(p);
  }
  /** ¿Algún mueble alto tapa la ventana? (u0..u1 en el mundo a lo largo de la pared) */
  const windowBlocked = (w: WallSeg, wx0: number, wz0: number, wx1: number, wz1: number, sill: number): boolean => {
    const ax = axisOf(w);
    for (const p of propsByLevel.get(w.level) ?? []) {
      const tall = p.kind === 'fogon' ? WALL_H : p.y - levelY(w.level) + p.height;
      if (tall <= sill + 0.05) continue;
      if (ax === 'x') {
        const wz = w.z0;
        const d = Math.max(p.z - p.hz - wz, wz - (p.z + p.hz), 0);
        if (d < 0.9 && p.x + p.hx > Math.min(wx0, wx1) - 0.15 && p.x - p.hx < Math.max(wx0, wx1) + 0.15) return true;
      } else {
        const wx = w.x0;
        const d = Math.max(p.x - p.hx - wx, wx - (p.x + p.hx), 0);
        if (d < 0.9 && p.z + p.hz > Math.min(wz0, wz1) - 0.15 && p.z - p.hz < Math.max(wz0, wz1) + 0.15) return true;
      }
    }
    return false;
  };

  const postSet = new Set<string>();
  const rampByModule = new Map<number, Ramp>(layout.ramps.map((r) => [r.moduleId, r]));

  for (const w of layout.walls) {
    const lb = inp.levels[w.level]!;
    const fr = wallFrame(w);
    const e0 = endMode(w, w.x0, w.z0);
    const e1 = endMode(w, w.x1, w.z1);
    // extremos en coordenadas u (el punto (x0,z0) puede caer en -len/2 o +len/2 según la normal)
    const uOf = (x: number, z: number): number => (x - fr.mx) * fr.ex + (z - fr.mz) * fr.ez;
    const ua = uOf(w.x0, w.z0);
    const ub = uOf(w.x1, w.z1);
    const [uLo, modeLo, uHi, modeHi] = ua < ub ? [ua, e0, ub, e1] : [ub, e1, ua, e0];

    if (w.kind === 'wall') {
      const mod = w.moduleId !== null ? modules.get(w.moduleId) : undefined;
      const own = roomStyle(mod?.type);
      const other = cellAcross(w);
      const otherRoom = other?.kind === 'room';
      const inBands = interiorBands(own);
      const outBands = otherRoom ? interiorBands(roomStyle(moduleType(other!.moduleId))) : w.level === 0 ? plankBands(PALETTE.deckWoodDark) : OUTDOOR_BANDS;
      const outdoor = !otherRoom;
      const u0 = uLo - (modeLo === 'extend' ? T / 2 : 0);
      const u1 = uHi + (modeHi === 'extend' ? T / 2 : 0);
      const openings: Opening[] = [];
      const wins: { uc: number; w: number; y0: number; y1: number; mull: number }[] = [];
      if (outdoor && w.level >= 1 && fr.len >= 2.6) {
        const bridge = mod?.type === 'puente';
        const ww = bridge ? fr.len - 1.0 : 1.2;
        const wy0 = bridge ? 1.0 : 1.05;
        const wy1 = bridge ? 2.4 : 2.1;
        const ucW = (uLo + uHi) / 2;
        const wx0 = fr.mx + fr.ex * (ucW - ww / 2);
        const wz0 = fr.mz + fr.ez * (ucW - ww / 2);
        const wx1 = fr.mx + fr.ex * (ucW + ww / 2);
        const wz1 = fr.mz + fr.ez * (ucW + ww / 2);
        if (!windowBlocked(w, wx0, wz0, wx1, wz1, wy0)) {
          openings.push({ u0: ucW - ww / 2, u1: ucW + ww / 2, y0: wy0, y1: wy1 });
          wins.push({ uc: ucW, w: ww, y0: wy0, y1: wy1, mull: bridge ? 3 : 1 });
        }
      }
      inFrame([lb.solid, lb.glassOut, lb.glassIn], fr.mx, w.y0, fr.mz, fr.yaw, () => {
        const g = lb.solid;
        g.tint = tintOf(w.moduleId);
        const capC = outdoor ? PALETTE.wallTrim : own.trim;
        // en las esquinas (extremos prolongados) la tapa quedaría coplanaria con la otra pared
        panel(g, u0, u1, 0, WALL_H, T, inBands, outBands, openings, null, modeLo === 'cap' ? capC : null, modeHi === 'cap' ? capC : null);
        // canto superior: asoma 10 cm bajo el forjado por fuera, así que lleva el color del remate
        g.quadN(u0, WALL_H, T / 2, u1, WALL_H, T / 2, u1, WALL_H, -T / 2, u0, WALL_H, -T / 2, outdoor ? PALETTE.wallTrim : shade(own.trim, 0.9));
        for (const win of wins) {
          windowParts(g, lb.glassOut, lb.glassIn, win.uc, win.w, win.y0, win.y1, own, win.mull);
          const outside = other;
          const walkOut = !outside || outside.kind === 'deck' || outside.kind === 'roof';
          if (win.mull === 1 && walkOut && hash01(w.x0, w.z0, w.level, 3) < 0.55) flowerBox(g, win.uc, win.w, win.y0, hash01(w.x0, w.z0, 9));
          else if (win.mull === 1 && hash01(w.x0, w.z0, w.level, 5) < 0.6) curtains(g, win.uc, win.w, win.y0, win.y1, hash01(w.z0, w.x0));
        }
        // decoración en las paredes interiores sin ventana (cuadros, reloj, barómetro, cazos…)
        if (!wins.length && mod && fr.len >= 2.6) {
          const ucD = (uLo + uHi) / 2 + (hash01(w.x0, w.z0, 11) - 0.5) * 0.8;
          const dx0 = fr.mx + fr.ex * (ucD - 0.6);
          const dz0 = fr.mz + fr.ez * (ucD - 0.6);
          const dx1 = fr.mx + fr.ex * (ucD + 0.6);
          const dz1 = fr.mz + fr.ez * (ucD + 0.6);
          if (!windowBlocked(w, dx0, dz0, dx1, dz1, 1.15)) wallDecor(g, mod.type, ucD, hash01(w.x0, w.z0, w.level, 13));
        }
        g.tint = 1;
      });
    } else if (w.kind === 'hull') {
      const own = cellOwn(w);
      inFrame([lb.solid], fr.mx, w.y0, fr.mz, fr.yaw, () => {
        const g = lb.solid;
        const u0 = uLo - (modeLo === 'extend' ? T / 2 : 0);
        const u1 = uHi + (modeHi === 'extend' ? T / 2 : 0);
        const lining = plankBands(PALETTE.deckWoodDark, WALL_H, 0.32);
        panel(g, u0, u1, 0, WALL_H, 0.16, lining, null, [], null, null, null);
        // cuadernas
        const ribC = shade(PALETTE.deckWoodDark, 0.6);
        const n = Math.max(1, Math.round(fr.len / 1.33));
        for (let i = 0; i <= n; i++) {
          const u = uLo + (i / n) * (uHi - uLo);
          if (u < uLo + 0.25 || u > uHi - 0.25) continue;
          g.box(u - 0.08, 0, 0.08, u + 0.08, WALL_H, 0.24, ribC, { ny: true, py: true });
          // cartela bajo el bao
          g.box(u - 0.06, WALL_H - 0.55, 0.24, u + 0.06, WALL_H - 0.22, 0.48, ribC, { ny: true });
        }
        // tuberías a lo largo de los costados (no junto a escaleras)
        const stairNear = own && (own.kind === 'stairLow' || own.kind === 'stairHigh');
        if (!stairNear && axisOf(w) === 'x') {
          const pc = PALETTE.metal;
          const rc = PALETTE.rust;
          g.cylinderX((u0 + u1) / 2, 2.62, 0.34, 0.06, u1 - u0, 6, pc);
          g.cylinderX((u0 + u1) / 2, 2.42, 0.32, 0.045, u1 - u0, 6, rc);
          for (let u = uLo + 1; u < uHi; u += 2) g.box(u - 0.04, 2.35, 0.24, u + 0.04, 2.7, 0.42, PALETTE.metalDark);
        }
      });
    } else if (w.kind === 'rail') {
      const shipEdge = w.exterior && w.level === 1;
      const toe = !shipEdge;
      inFrame([lb.solid], fr.mx, w.y0, fr.mz, fr.yaw, () => {
        rail(lb.solid, w, uLo, uHi, fr, postSet, toe);
      });
    } else if (w.kind === 'stair') {
      const r = w.moduleId !== null ? rampByModule.get(w.moduleId) : undefined;
      inFrame([lb.solid], fr.mx, w.y0, fr.mz, fr.yaw, () => {
        stairSide(lb.solid, w, r ?? null, uLo, uHi, fr, (x, z) => uOf(x, z));
      });
    }
  }

  /* ---------------- Puertas ---------------- */
  for (const d of layout.doors) {
    door(inp, d, cellAt, moduleType, propsByLevel.get(d.level) ?? [], (x, y, z) => lights.push({ x, y, z, level: d.level, kind: 'deck', moduleId: d.moduleId }));
  }

  /* ---------------- Escaleras ---------------- */
  for (const r of layout.ramps) {
    const lb = inp.levels[r.level]!;
    stairs(lb.solid, r);
  }

  /* ---------------- Lámparas de techo ---------------- */
  for (let l = 0; l < layout.levels; l++) {
    const lb = inp.levels[l]!;
    for (let x = 0; x < layout.length; x++) {
      for (let z = 0; z < W; z++) {
        const c = layout.cells[l]![x]![z]!;
        if (c.kind !== 'room') continue;
        const mn = cellMin(x, z, W);
        const cx = mn.x + CELL / 2;
        const cz = mn.z + CELL / 2;
        const yC = levelY(l) + WALL_H;
        const st = roomStyle(moduleType(c.moduleId));
        ceilingLamp(lb.solid, lb.lamps, cx, yC, cz, st.lampShade);
        lights.push({ x: cx, y: yC - 0.55, z: cz, level: l, kind: 'room', moduleId: c.moduleId });
      }
    }
  }

  /* ---------------- Faroles de la bodega ---------------- */
  if (layout.levels > 0) {
    const lb = inp.levels[0]!;
    const holdProps = propsByLevel.get(0) ?? [];
    const zMid = 0;
    for (let x = 0; x < layout.length; x++) {
      if (x % 2 === 0) continue;
      const mn = cellMin(x, 0, W);
      const lx = mn.x + 3.0; // bajo un bao
      const zCells = [Math.floor(W / 2) - 1, Math.floor(W / 2)];
      const cells = zCells.map((zz) => cellAt(0, x, zz));
      if (cells.some((c) => !c || c.kind !== 'hold')) continue;
      if (cells.some((c, i) => cellAt(1, x, zCells[i]!)?.kind === 'stairHigh' || !c)) continue;
      const hit = holdProps.some((p) => Math.abs(p.x - lx) < p.hx + 0.45 && Math.abs(p.z - zMid) < p.hz + 0.45);
      if (hit) continue;
      lantern(lb.solid, lb.lanterns, lx, WALL_H - 0.24, zMid);
      lights.push({ x: lx, y: 2.25, z: zMid, level: 0, kind: 'hold', moduleId: null });
    }
  }

  return { lights };
}

/* ================================================================== */
/* Suelos                                                              */
/* ================================================================== */

/** Tablones a lo largo de `axis`, con juntas desplazadas y ligeras variaciones de tono. */
function planks(g: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number, axis: 'x' | 'z', n: number, base: ColorLike, seed: number, vari: number): void {
  const across0 = axis === 'x' ? z0 : x0;
  const across1 = axis === 'x' ? z1 : x1;
  const along0 = axis === 'x' ? x0 : z0;
  const along1 = axis === 'x' ? x1 : z1;
  const w = (across1 - across0) / n;
  for (let i = 0; i < n; i++) {
    const a = across0 + i * w;
    const b = a + w;
    const cut = along0 + (0.2 + 0.6 * hash01(seed, i)) * (along1 - along0);
    for (const [p, q, k] of [
      [along0, cut, 0],
      [cut, along1, 1],
    ] as const) {
      const f = 1 - vari + hash01(seed, i, k) * vari * 2 - (i % 2) * 0.03;
      const c = shade(base, f);
      if (axis === 'x') g.quadN(p, y, b, q, y, b, q, y, a, p, y, a, c);
      else g.quadN(a, y, q, b, y, q, b, y, p, a, y, p, c);
    }
  }
}

function roomFloor(g: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number, s: RoomStyle, seed: number): void {
  if (s.floor === 'planks') {
    planks(g, x0, z0, x1, z1, y, 'z', 10, s.floorA, seed, 0.05);
    return;
  }
  if (s.floor === 'tiles') {
    const n = 8;
    const sx = (x1 - x0) / n;
    const sz = (z1 - z0) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const c = (i + j) % 2 === 0 ? s.floorA : s.floorB;
        const a = x0 + i * sx;
        const b = z0 + j * sz;
        g.quadN(a, y, b + sz, a + sx, y, b + sz, a + sx, y, b, a, y, b, c);
      }
    return;
  }
  if (s.floor === 'metal') {
    const n = 2;
    const sx = (x1 - x0) / n;
    const sz = (z1 - z0) / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const c = shade(s.floorA, 0.94 + hash01(seed, i, j) * 0.1);
        const a = x0 + i * sx;
        const b = z0 + j * sz;
        g.quadN(a, y, b + sz, a + sx, y, b + sz, a + sx, y, b, a, y, b, c);
        // relieve de chapa estriada
        for (let k = 1; k < 6; k++) {
          const zz = b + (k / 6) * sz;
          g.box(a + 0.15, y, zz - 0.02, a + sx - 0.15, y + 0.012, zz + 0.02, s.floorB, { ny: true });
        }
      }
    return;
  }
  // parqué en damero de tablillas
  const n = 4;
  const sx = (x1 - x0) / n;
  const sz = (z1 - z0) / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const a = x0 + i * sx;
      const b = z0 + j * sz;
      for (let k = 0; k < 3; k++) {
        const c = shade(k % 2 ? s.floorB : s.floorA, 0.96 + hash01(seed, i, j, k) * 0.08);
        if ((i + j) % 2 === 0) {
          const zz = b + (k * sz) / 3;
          g.quadN(a, y, zz + sz / 3, a + sx, y, zz + sz / 3, a + sx, y, zz, a, y, zz, c);
        } else {
          const xx = a + (k * sx) / 3;
          g.quadN(xx, y, b + sz, xx + sx / 3, y, b + sz, xx + sx / 3, y, b, xx, y, b, c);
        }
      }
    }
}

/** Chapa ondulada teal (techos no transitables). */
function corrugated(g: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number): void {
  const n = Math.max(2, Math.round((z1 - z0) / 0.26));
  const w = (z1 - z0) / n;
  const h = 0.05;
  for (let i = 0; i < n; i++) {
    const a = z0 + i * w;
    const m = a + w / 2;
    const b = a + w;
    g.quadN(x0, y, m, x1, y, m, x1, y + h, a, x0, y + h, a, PALETTE.roof);
    g.quadN(x0, y + h, b, x1, y + h, b, x1, y, m, x0, y, m, shade(PALETTE.roof, 0.9));
  }
  // remate de cumbrera
  g.box(x0, y + h, (z0 + z1) / 2 - 0.08, x1, y + h + 0.03, (z0 + z1) / 2 + 0.08, PALETTE.roofDark, { ny: true });
}

/* ================================================================== */
/* Ventanas y detalles de pared                                        */
/* ================================================================== */

function windowParts(g: GeoBuilder, gOut: GeoBuilder, gIn: GeoBuilder, uc: number, w: number, y0: number, y1: number, style: RoomStyle, mull: number): void {
  const a = uc - w / 2;
  const b = uc + w / 2;
  const fIn = style.trim;
  const fOut = PALETTE.wallTrim;
  const fr = 0.06;
  const zt = T / 2 + 0.03;
  // marco (atraviesa el grosor)
  g.box(a, y0, -zt, a + fr, y1, zt, fIn);
  g.box(b - fr, y0, -zt, b, y1, zt, fIn);
  g.box(a, y1 - fr, -zt, b, y1, zt, fIn);
  g.box(a, y0, -zt, b, y0 + fr, zt, fIn);
  for (let k = 1; k <= mull; k++) {
    const u = a + (k / (mull + 1)) * w;
    g.box(u - 0.025, y0, -0.04, u + 0.025, y1, 0.04, fIn);
  }
  if (mull === 1) g.box(a, y0 + (y1 - y0) * 0.62 - 0.02, -0.04, b, y0 + (y1 - y0) * 0.62 + 0.02, 0.04, fIn);
  // moldura exterior
  const zo = -T / 2;
  g.box(a - 0.1, y0 - 0.1, zo - 0.04, a, y1 + 0.1, zo, fOut);
  g.box(b, y0 - 0.1, zo - 0.04, b + 0.1, y1 + 0.1, zo, fOut);
  g.box(a, y1, zo - 0.04, b, y1 + 0.1, zo, fOut);
  g.box(a - 0.14, y0 - 0.08, zo - 0.14, b + 0.14, y0, zo, shade(fOut, 0.8));
  // alféizar interior
  g.box(a - 0.08, y0 - 0.05, T / 2, b + 0.08, y0, T / 2 + 0.12, style.trim);
  // cristal: cara exterior y cara interior
  gOut.quadN(b, y0, -0.006, a, y0, -0.006, a, y1, -0.006, b, y1, -0.006, '#ffffff');
  gIn.quadN(a, y0, 0.006, b, y0, 0.006, b, y1, 0.006, a, y1, 0.006, '#ffffff');
}

/** Jardinera bajo una ventana (lado exterior, -z local). */
function flowerBox(g: GeoBuilder, uc: number, w: number, y0: number, h: number): void {
  const a = uc - w / 2 + 0.05;
  const b = uc + w / 2 - 0.05;
  const zo = -T / 2;
  g.box(a, y0 - 0.42, zo - 0.3, b, y0 - 0.14, zo, PALETTE.deckWoodDark);
  g.box(a + 0.04, y0 - 0.16, zo - 0.26, b - 0.04, y0 - 0.13, zo - 0.04, PALETTE.soil);
  const n = 4;
  const flowers = ['#e76f51', '#f4d35e', '#f3ead6', '#c86b98'];
  for (let i = 0; i < n; i++) {
    const u = a + ((i + 0.5) / n) * (b - a);
    const s = 0.12 + hash01(h, i) * 0.06;
    g.sphere(u, y0 - 0.08, zo - 0.15, s, i % 2 ? PALETTE.plant : PALETTE.plantDark, 0, 0.8);
    if (hash01(h, i, 2) < 0.7) g.boxC(u + 0.03, y0 + 0.02, zo - 0.18, 0.07, 0.07, 0.07, flowers[Math.floor(hash01(h, i, 3) * flowers.length)]!);
  }
}

/** Cortinas recogidas a los lados de una ventana (lado interior, +z local). */
function curtains(g: GeoBuilder, uc: number, w: number, y0: number, y1: number, h: number): void {
  const cols = ['#bc4749', '#e9c46a', '#6d597a', '#2a9d8f', '#f4a261'];
  const c = cols[Math.floor(h * cols.length)]!;
  const zi = T / 2 + 0.05;
  g.box(uc - w / 2 - 0.25, y1 + 0.12, zi - 0.02, uc + w / 2 + 0.25, y1 + 0.16, zi + 0.02, PALETTE.metalDark);
  for (const s of [-1, 1]) {
    const u = uc + s * (w / 2 + 0.08);
    g.frustum(u, y0 - 0.15, zi + 0.02, 0.2, 0.08, 0.32, 0.06, y1 + 0.12 - (y0 - 0.15), c);
  }
}

/**
 * Decoración plana de pared (lado interior, +z local) según el tipo de habitación. Nada
 * sobresale más de 0,25 m, así que no estorba al caminar (las paredes ya tienen colisión).
 */
function wallDecor(g: GeoBuilder, type: string, uc: number, h: number): void {
  const z = T / 2;
  const frame = '#6e4a2e';
  const picture = (u: number, y: number, w: number, hh: number, seed: number): void => {
    g.box(u - w / 2, y - hh / 2, z, u + w / 2, y + hh / 2, z + 0.04, frame);
    // marina pintada: cielo, mar, barco o isla
    const sky = seed < 0.5 ? '#f4d6a0' : '#9ed8e6';
    const sea = seed < 0.5 ? '#2f6070' : '#2a9d8f';
    const iw = w - 0.1;
    const ih = hh - 0.1;
    g.box(u - iw / 2, y - ih / 2 + ih * 0.42, z + 0.04, u + iw / 2, y + ih / 2, z + 0.045, sky);
    g.box(u - iw / 2, y - ih / 2, z + 0.04, u + iw / 2, y - ih / 2 + ih * 0.42, z + 0.045, sea);
    if (seed < 0.5) g.box(u + iw * 0.15, y + ih * 0.05, z + 0.045, u + iw * 0.3, y + ih * 0.2, z + 0.05, '#e76f51');
    else g.box(u - iw * 0.3, y - ih * 0.08, z + 0.045, u - iw * 0.05, y + ih * 0.05, z + 0.05, '#6a994e');
  };
  const clock = (u: number, y: number, r: number, face: string, rim: string): void => {
    g.push();
    g.translate(u, y, z + 0.03);
    g.cylinderZ(0, 0, 0, r + 0.03, 0.05, 12, rim);
    g.pop();
    g.push();
    g.translate(u, y, z + 0.056);
    g.disc(0, 0, 0, r, 12, face);
    g.box(-0.008, 0, 0.002, 0.008, r * 0.7, 0.008, '#2b2d42');
    g.box(0, -0.008, 0.002, r * 0.5, 0.008, 0.008, '#2b2d42');
    g.pop();
  };
  const paper = (u: number, y: number, w: number, hh: number, base: string, lines: string): void => {
    g.box(u - w / 2, y - hh / 2, z, u + w / 2, y + hh / 2, z + 0.012, base);
    for (let k = 0; k < 5; k++) g.box(u - w * 0.35, y + hh * 0.3 - k * hh * 0.14, z + 0.012, u + w * (0.15 + 0.2 * ((k * 7) % 3) / 2), y + hh * 0.3 - k * hh * 0.14 + 0.02, z + 0.016, lines);
  };
  switch (type) {
    case 'camarote':
    case 'comedor':
      picture(uc - 0.45, 1.75, 0.62, 0.46, h);
      if (type === 'comedor') picture(uc + 0.45, 1.75, 0.5, 0.4, 1 - h);
      else {
        // repisa con libros
        g.box(uc + 0.2, 1.38, z, uc + 0.95, 1.42, z + 0.2, frame);
        const books = ['#bc4749', '#457b9d', '#e9c46a', '#2a9d8f', '#6d597a'];
        let x = uc + 0.24;
        books.forEach((c, i) => {
          const bw = 0.06 + ((i * 3) % 4) * 0.012;
          g.box(x, 1.42, z + 0.03, x + bw, 1.42 + 0.18 + (i % 2) * 0.04, z + 0.18, c);
          x += bw + 0.01;
        });
      }
      break;
    case 'dormitorio':
      paper(uc, 1.7, 0.7, 0.5, '#efe0b9', '#8b5e3c');
      // perchero con chaqueta
      g.box(uc - 0.9, 1.75, z, uc - 0.5, 1.8, z + 0.05, frame);
      g.frustum(uc - 0.7, 1.1, z + 0.08, 0.3, 0.1, 0.36, 0.12, 0.62, '#3a5a40');
      break;
    case 'cocina':
      g.box(uc - 0.7, 1.95, z, uc + 0.7, 1.98, z + 0.06, '#5c6770');
      for (let k = 0; k < 3; k++) {
        const u = uc - 0.45 + k * 0.45;
        g.box(u - 0.006, 1.7, z + 0.04, u + 0.006, 1.95, z + 0.05, '#5c6770');
        g.push();
        g.translate(u, 1.55 - k * 0.04, z + 0.05);
        g.cylinderZ(0, 0, 0, 0.13 + k * 0.02, 0.04, 8, k === 1 ? '#c8553d' : '#5c6770');
        g.pop();
      }
      clock(uc + 1.0, 2.35, 0.15, '#f3ead6', '#c8553d');
      break;
    case 'puente':
      clock(uc - 0.35, 1.9, 0.16, '#f3ead6', '#c9a35a');
      clock(uc + 0.35, 1.9, 0.16, '#f6efe0', '#c9a35a');
      paper(uc, 1.35, 0.9, 0.35, '#efe0b9', '#3d7a8a');
      break;
    case 'taller':
    case 'motor':
      paper(uc - 0.4, 1.75, 0.5, 0.65, '#e9c46a', '#2b2d42');
      clock(uc + 0.45, 1.9, 0.13, '#f3ead6', '#2b2d42');
      break;
    case 'enfermeria':
      g.box(uc - 0.3, 1.45, z, uc + 0.3, 2.05, z + 0.012, '#f8f9fa');
      g.box(uc - 0.04, 1.62, z + 0.012, uc + 0.04, 1.88, z + 0.018, '#e63946');
      g.box(uc - 0.13, 1.71, z + 0.012, uc + 0.13, 1.79, z + 0.018, '#e63946');
      break;
    case 'almacen':
      paper(uc, 1.6, 0.42, 0.55, '#f3ead6', '#5c6770');
      g.box(uc - 0.08, 1.85, z + 0.012, uc + 0.08, 1.89, z + 0.03, '#8a9399');
      break;
    default:
      break;
  }
}

/* ================================================================== */
/* Barandillas y escaleras                                             */
/* ================================================================== */

function rail(g: GeoBuilder, w: WallSeg, uLo: number, uHi: number, fr: { mx: number; mz: number; ex: number; ez: number }, postSet: Set<string>, toe: boolean): void {
  const len = uHi - uLo;
  const n = Math.max(1, Math.ceil(len / 1.35));
  const postC = PALETTE.railPost;
  for (let i = 0; i <= n; i++) {
    const u = uLo + (i / n) * len;
    const wx = fr.mx + fr.ex * u;
    const wz = fr.mz + fr.ez * u;
    const k = `${w.level}|${Math.round(wx * 20)}|${Math.round(wz * 20)}`;
    if (postSet.has(k)) continue;
    postSet.add(k);
    g.box(u - 0.04, 0, -0.04, u + 0.04, RAIL_H, 0.04, postC);
  }
  g.box(uLo - 0.05, RAIL_H - 0.03, -0.055, uHi + 0.05, RAIL_H + 0.05, 0.055, PALETTE.rail);
  g.box(uLo, 0.55, -0.02, uHi, 0.59, 0.02, postC);
  if (toe) g.box(uLo, 0, -0.025, uHi, 0.1, 0.025, shade(PALETTE.railPost, 0.85));
}

/** Lateral de escalera: zanca con balaustrada (paralelo a la subida) o panel bajo el rellano. */
function stairSide(g: GeoBuilder, w: WallSeg, r: Ramp | null, uLo: number, uHi: number, fr: { mx: number; mz: number; ex: number; ez: number }, _uOf: (x: number, z: number) => number): void {
  const wood = shade(PALETTE.deckWood, 0.82);
  const along = Math.abs(w.z0 - w.z1) < 1e-6 ? 'x' : 'z';
  const parallel = r ? (along === 'x' ? r.dx !== 0 : r.dz !== 0) : false;
  if (!r || !parallel) {
    panel(g, uLo, uHi, 0, WALL_H, 0.14, plankBands(PALETTE.deckWoodDark), plankBands(PALETTE.deckWoodDark), [], wood, wood, wood);
    return;
  }
  // ¿Qué extremo u es la entrada (abajo)? Proyectamos sobre la dirección de subida.
  const rise = r.y1 - r.y0;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  const sAt = (u: number): number => {
    const wx = fr.mx + fr.ex * u;
    const wz = fr.mz + fr.ez * u;
    return (wx - cx) * r.dx + (wz - cz) * r.dz + CELL / 2; // 0 en la entrada, CELL en la salida
  };
  const hAt = (u: number): number => THREE.MathUtils.clamp(sAt(u) / CELL, 0, 1) * rise;
  const t = 0.12;
  const h0 = hAt(uLo) + 0.18;
  const h1 = hAt(uHi) + 0.18;
  // zanca: trapecio (caras laterales, superior inclinada y extremos)
  g.quadN(uLo, 0, t / 2, uHi, 0, t / 2, uHi, h1, t / 2, uLo, h0, t / 2, wood);
  g.quadN(uHi, 0, -t / 2, uLo, 0, -t / 2, uLo, h0, -t / 2, uHi, h1, -t / 2, wood);
  g.quadN(uLo, h0, t / 2, uHi, h1, t / 2, uHi, h1, -t / 2, uLo, h0, -t / 2, shade(wood, 1.15));
  g.quadN(uLo, 0, -t / 2, uLo, 0, t / 2, uLo, h0, t / 2, uLo, h0, -t / 2, wood);
  g.quadN(uHi, 0, t / 2, uHi, 0, -t / 2, uHi, h1, -t / 2, uHi, h1, t / 2, wood);
  // balaustrada
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const u = uLo + 0.12 + (i / n) * (uHi - uLo - 0.24);
    const hb = hAt(u) + 0.15;
    g.box(u - 0.035, hb, -0.035, u + 0.035, hb + 0.92, 0.035, PALETTE.railPost);
  }
  g.cylinderBetween(uLo + 0.1, hAt(uLo + 0.1) + 1.08, 0, uHi - 0.1, hAt(uHi - 0.1) + 1.08, 0, 0.045, 6, PALETTE.rail);
}

/** Peldaños macizos que siguen la rampa de la física. */
function stairs(g: GeoBuilder, r: Ramp): void {
  const n = 16;
  const run = CELL / n;
  const rise = (r.y1 - r.y0) / n;
  const yaw = Math.atan2(r.dx, r.dz);
  const cx = (r.minX + r.maxX) / 2 - (r.dx * CELL) / 2;
  const cz = (r.minZ + r.maxZ) / 2 - (r.dz * CELL) / 2;
  const tread = PALETTE.deckWood;
  const riser = shade(PALETTE.deckWoodDark, 0.92);
  const side = shade(PALETTE.deckWoodDark, 0.75);
  const nose = PALETTE.metalDark;
  g.push();
  g.translate(cx, r.y0, cz);
  g.rotateY(yaw);
  const hw = CELL / 2 - 0.02;
  let prev = 0;
  for (let k = 0; k < n; k++) {
    const z0 = k * run;
    const z1 = z0 + run;
    const top = k === n - 1 ? r.y1 - r.y0 - 0.01 : (k + 0.6) * rise;
    // huella
    g.quadN(-hw, top, z1, hw, top, z1, hw, top, z0, -hw, top, z0, k % 2 ? tread : shade(tread, 0.95));
    // tabica (solo la parte que asoma sobre el peldaño anterior)
    g.quadN(hw, prev, z0, -hw, prev, z0, -hw, top, z0, hw, top, z0, riser);
    // mamperlán
    g.box(-hw, top - 0.03, z0 - 0.01, hw, top + 0.005, z0 + 0.05, nose, { ny: true });
    // laterales
    g.quadN(hw, 0, z1, hw, 0, z0, hw, top, z0, hw, top, z1, side);
    g.quadN(-hw, 0, z0, -hw, 0, z1, -hw, top, z1, -hw, top, z0, side);
    if (k === n - 1) g.quadN(-hw, 0, z1, hw, 0, z1, hw, top, z1, -hw, top, z1, side);
    prev = top;
  }
  g.pop();
}

/* ================================================================== */
/* Puertas                                                             */
/* ================================================================== */

function door(
  inp: StructureInput,
  d: DoorInfo,
  cellAt: (l: number, x: number, z: number) => LayoutCell | null,
  moduleType: (id: number | null) => string | null,
  props: PropInstance[],
  addLight: (x: number, y: number, z: number) => void,
): void {
  const W = inp.layout.width;
  const lb = inp.levels[d.level]!;
  const g = lb.solid;
  // Normal hacia el interior de la habitación dueña de la puerta.
  const sides: [number, number][] = d.axis === 'x' ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
  let n: [number, number] = sides[0]!;
  let otherCell: LayoutCell | null = null;
  for (const s of sides) {
    const c = pointToCell(d.x + s[0] * 0.5, d.z + s[1] * 0.5, W);
    const cell = cellAt(d.level, c.x, c.z);
    if (cell && cell.kind === 'room' && cell.moduleId === d.moduleId) {
      n = s;
      const oc = pointToCell(d.x - s[0] * 0.5, d.z - s[1] * 0.5, W);
      otherCell = cellAt(d.level, oc.x, oc.z);
      break;
    }
  }
  const yaw = Math.atan2(n[0], n[1]);
  const ex = Math.cos(yaw);
  const ez = -Math.sin(yaw);
  const own = roomStyle(moduleType(d.moduleId));
  const otherRoom = otherCell?.kind === 'room';
  const outBands = otherRoom ? interiorBands(roomStyle(moduleType(otherCell!.moduleId))) : d.level === 0 ? plankBands(PALETTE.deckWoodDark) : OUTDOOR_BANDS;
  const hw = d.width / 2;
  // Lado de las bisagras: el que deja la hoja abierta sin chocar con muebles.
  const leafLen = d.width - 0.12;
  const theta = (105 * Math.PI) / 180;
  const leafHits = (hs: number): number => {
    const hu = hs * (hw - 0.06);
    const du = -hs * Math.cos(theta);
    const dz = Math.sin(theta);
    let hits = 0;
    for (let i = 1; i <= 5; i++) {
      const t = (i / 5) * leafLen;
      const lu = hu + du * t;
      const lz = 0.12 + dz * t;
      const wx = d.x + ex * lu + n[0] * lz;
      const wz = d.z + ez * lu + n[1] * lz;
      for (const p of props) if (Math.abs(p.x - wx) < p.hx + 0.12 && Math.abs(p.z - wz) < p.hz + 0.12) hits++;
    }
    return hits;
  };
  const prefer = hash01(d.x, d.z) < 0.5 ? 1 : -1;
  const hs = leafHits(prefer) <= leafHits(-prefer) ? prefer : -prefer;

  inFrame([g, lb.glassIn], d.x, d.y, d.z, yaw, () => {
    g.tint = inp.tintOf(d.moduleId);
    // dintel de pared sobre el hueco
    panel(g, -hw, hw, DOOR_H, WALL_H, T, interiorBands(own), outBands, [], null, null, null);
    // marco
    const fc = shade(PALETTE.door, 0.75);
    const zt = T / 2 + 0.04;
    g.box(-hw, 0, -zt, -hw + 0.09, DOOR_H + 0.08, zt, fc);
    g.box(hw - 0.09, 0, -zt, hw, DOOR_H + 0.08, zt, fc);
    g.box(-hw, DOOR_H, -zt, hw, DOOR_H + 0.1, zt, fc);
    g.box(-hw + 0.09, 0, -T / 2, hw - 0.09, 0.03, T / 2, shade(PALETTE.door, 0.6));
    // hoja abierta
    const hu = hs * (hw - 0.06);
    const beta = Math.atan2(-Math.sin(theta), -hs * Math.cos(theta));
    for (const b of [g, lb.glassIn]) {
      b.push();
      b.translate(hu, 0.02, T / 2 + 0.03);
      b.rotateY(beta);
    }
    const lc = PALETTE.door;
    const lh = DOOR_H - 0.06;
    g.box(0, 0, -0.03, leafLen, lh, 0.03, { all: lc, px: shade(lc, 0.8), nx: shade(lc, 0.8) });
    // cuarterones en ambas caras
    for (const s of [1, -1]) {
      const z = s * 0.03;
      const z2 = s * 0.045;
      g.box(0.15, 0.2, Math.min(z, z2), leafLen - 0.15, 1.0, Math.max(z, z2), shade(lc, 0.86));
      // ojo de buey de la puerta
      g.push();
      g.translate(leafLen / 2, 1.65, z2);
      if (s < 0) g.rotateY(Math.PI);
      g.ring(0, 0, 0, 0.2, 0.04, 10, '#c9a35a', 4);
      g.pop();
      // tirador
      g.boxC(leafLen - 0.14, 1.0, s * 0.07, 0.05, 0.05, 0.08, '#c9a35a');
    }
    lb.glassIn.disc(leafLen / 2, 1.65, 0.0, 0.18, 10, '#ffffff');
    lb.glassIn.disc(leafLen / 2, 1.65, 0.0, 0.18, 10, '#ffffff', true);
    for (const b of [g, lb.glassIn]) b.pop();
    // toldo de lona y aplique con rejilla junto a las puertas que dan al exterior
    if (!otherRoom && d.level >= 1) {
      awning(g, hw);
      bulkheadLamp(g, lb.lamps, hw + 0.28, DOOR_H + 0.05, -T / 2);
    }
    g.tint = 1;
  });
  if (!otherRoom && d.level >= 1) {
    const u = hw + 0.28;
    addLight(d.x + ex * u - n[0] * 0.5, d.y + DOOR_H - 0.1, d.z + ez * u - n[1] * 0.5);
  }
}

/** Aplique estanco de pared (lado -z local) con rejilla. */
function bulkheadLamp(g: GeoBuilder, gl: GeoBuilder, u: number, y: number, z: number): void {
  g.box(u - 0.11, y - 0.14, z - 0.04, u + 0.11, y + 0.14, z, PALETTE.metalDark);
  gl.box(u - 0.075, y - 0.1, z - 0.13, u + 0.075, y + 0.1, z - 0.04, '#ffffff');
  for (const k of [-0.05, 0, 0.05]) g.box(u + k - 0.008, y - 0.11, z - 0.145, u + k + 0.008, y + 0.11, z - 0.125, PALETTE.metalDark);
  g.box(u - 0.09, y - 0.012, z - 0.145, u + 0.09, y + 0.012, z - 0.125, PALETTE.metalDark);
}

/** Toldo a rayas sobre una puerta exterior (lado -z local). */
function awning(g: GeoBuilder, hw: number): void {
  const a = -hw - 0.35;
  const b = hw + 0.35;
  const yIn = DOOR_H + 0.45;
  const yOut = DOOR_H + 0.12;
  const zIn = -T / 2;
  const zOut = -T / 2 - 0.95;
  const n = 6;
  const w = (b - a) / n;
  for (let i = 0; i < n; i++) {
    const c = i % 2 ? PALETTE.canvas : PALETTE.hullStripe;
    const u0 = a + i * w;
    const u1 = u0 + w;
    g.quadN(u0, yIn, zIn, u1, yIn, zIn, u1, yOut, zOut, u0, yOut, zOut, c);
    g.quadN(u0, yOut, zOut, u1, yOut, zOut, u1, yIn, zIn, u0, yIn, zIn, shade(c, 0.8));
    // faldón
    g.quadN(u0, yOut, zOut, u1, yOut, zOut, u1, yOut - 0.16, zOut, u0, yOut - 0.16, zOut, c);
    g.quadN(u1, yOut, zOut, u0, yOut, zOut, u0, yOut - 0.16, zOut, u1, yOut - 0.16, zOut, shade(c, 0.8));
  }
  for (const u of [a + 0.05, b - 0.05]) g.cylinderBetween(u, yOut, zOut + 0.02, u, yIn - 0.45, zIn, 0.02, 4, PALETTE.metalDark);
}

/* ================================================================== */
/* Iluminación fija                                                    */
/* ================================================================== */

function ceilingLamp(g: GeoBuilder, gl: GeoBuilder, x: number, yC: number, z: number, shadeC: ColorLike): void {
  g.cylinder(x, yC - 0.04, z, 0.09, 0.09, 0.04, 6, PALETTE.metalDark);
  g.cylinder(x, yC - 0.32, z, 0.012, 0.012, 0.28, 4, '#2b2d42');
  g.cylinder(x, yC - 0.5, z, 0.3, 0.1, 0.2, 8, shadeC, { capBottom: false });
  g.cylinder(x, yC - 0.5, z, 0.29, 0.09, 0.19, 8, shade(shadeC, 0.6), { capTop: false, capBottom: false });
  gl.sphere(x, yC - 0.47, z, 0.085, '#ffffff', 1, 0.9);
}

function lantern(g: GeoBuilder, gl: GeoBuilder, x: number, yHook: number, z: number): void {
  const y = yHook - 0.62;
  g.cylinder(x, yHook - 0.25, z, 0.012, 0.012, 0.25, 4, PALETTE.rope);
  g.cylinder(x, y + 0.36, z, 0.17, 0.05, 0.12, 6, PALETTE.metalDark);
  g.ring(x, yHook - 0.22, z, 0.05, 0.012, 6, PALETTE.metalDark, 3);
  g.cylinder(x, y, z, 0.15, 0.15, 0.05, 6, PALETTE.metalDark);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    g.box(x + Math.cos(a) * 0.13 - 0.012, y + 0.05, z + Math.sin(a) * 0.13 - 0.012, x + Math.cos(a) * 0.13 + 0.012, y + 0.36, z + Math.sin(a) * 0.13 + 0.012, PALETTE.metalDark);
  }
  gl.cylinder(x, y + 0.05, z, 0.11, 0.11, 0.31, 6, '#ffffff');
}

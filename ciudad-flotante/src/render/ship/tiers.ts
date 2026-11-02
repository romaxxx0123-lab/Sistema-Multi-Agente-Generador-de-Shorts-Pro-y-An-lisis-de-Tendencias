/**
 * NIVELES DE MEJORA a escala de módulo (docs/SISTEMAS.md §13). Se escriben en el constructor del
 * nivel y se fusionan con su geometría estática:
 *  - placa de latón con el número romano del nivel (II, III): junto a la puerta principal, por
 *    fuera, en las habitaciones; en el frente del mueble principal (`anchors.plaque`) en los
 *    módulos abiertos;
 *  - almacén con altillo (nivel 2 y 3): plataforma de tablones sobre escuadras en una esquina
 *    libre de muebles altos y lejos de la puerta, con su barandilla, una escala y género encima.
 * Los detalles de cada mueble (más baldas, depósito más alto, generador turbo…) están en props.ts.
 */
import * as THREE from 'three';
import { moduleDef } from '../../data/modules';
import { CELL, WALL_H } from '../../sim/constants';
import { moduleTier } from '../../sim/moduleStats';
import { cellMin, getCell, levelY, moduleCells, pointToCell, type DoorInfo, type PropInstance, type ShipLayout } from '../../sim/ship';
import type { ModuleInstance } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, shade } from './geo';
import { crate, type PropModel } from './props';
import { WALL_VIS_T } from './structure';

const BRASS = '#c9a35a';
const BRASS_DARK = '#8a6a32';
const ENGRAVE = '#3a2a1a';

/** Número romano de un nivel (1..3). */
export function romanNumeral(tier: number): string {
  return ['I', 'II', 'III'][Math.max(1, Math.min(3, Math.floor(tier))) - 1]!;
}

/**
 * Placa de latón atornillada con el número romano grabado, centrada en el origen y mirando a -z
 * (su cara trasera queda en z = 0). Ancho 0,24 m, alto 0,14 m.
 */
export function brassPlaque(g: GeoBuilder, tier: number): void {
  const w = 0.12;
  const h = 0.07;
  g.box(-w, -h, -0.012, w, h, 0, BRASS_DARK);
  g.box(-w + 0.012, -h + 0.012, -0.016, w - 0.012, h - 0.012, -0.012, BRASS);
  // trazos verticales del número y remates arriba y abajo (como en «II» y «III» grabados)
  const n = romanNumeral(tier).length;
  const sw = 0.018;
  const gap = 0.022;
  const total = n * sw + (n - 1) * gap;
  const x0 = -total / 2;
  for (let i = 0; i < n; i++) g.box(x0 + i * (sw + gap), -0.035, -0.019, x0 + i * (sw + gap) + sw, 0.035, -0.016, ENGRAVE);
  g.box(x0 - 0.012, 0.03, -0.019, x0 + total + 0.012, 0.042, -0.016, ENGRAVE);
  g.box(x0 - 0.012, -0.042, -0.019, x0 + total + 0.012, -0.03, -0.016, ENGRAVE);
  // tornillos
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) g.boxC(sx * (w - 0.02), sy * (h - 0.02), -0.018, 0.012, 0.012, 0.006, BRASS_DARK);
}

/** Puerta principal de un módulo cerrado y su normal hacia FUERA de la habitación. */
export function mainDoor(m: ModuleInstance, layout: ShipLayout): { door: DoorInfo; nx: number; nz: number } | null {
  for (const d of layout.doors) {
    if (d.moduleId !== m.id) continue;
    const sides: [number, number][] = d.axis === 'x' ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    for (const [sx, sz] of sides) {
      const c = pointToCell(d.x + sx * 0.5, d.z + sz * 0.5, layout.width);
      const cell = getCell(layout, d.level, c.x, c.z);
      if (cell && cell.kind === 'room' && cell.moduleId === m.id) return { door: d, nx: -sx, nz: -sz };
    }
  }
  return null;
}

/** Prop principal de un módulo (el de interacción; si no, el primero). */
export function mainProp(m: ModuleInstance, props: readonly PropInstance[]): PropInstance | null {
  let first: PropInstance | null = null;
  for (const p of props) {
    if (p.moduleId !== m.id) continue;
    if (p.interact) return p;
    first ??= p;
  }
  return first;
}

/** Placa del nivel de un módulo mejorado (nada si está en nivel 1). */
export function tierPlaque(g: GeoBuilder, m: ModuleInstance, layout: ShipLayout, props: readonly PropInstance[], modelOf: (p: PropInstance) => PropModel): boolean {
  const tier = moduleTier(m);
  if (tier < 2 || m.status === 'construction') return false;
  const def = moduleDef(m.type);
  if (def.enclosed) {
    const md = mainDoor(m, layout);
    if (!md) return false;
    const { door: d, nx, nz } = md;
    const yaw = Math.atan2(-nx, -nz);
    g.push();
    g.translate(d.x, d.y, d.z);
    g.rotateY(yaw);
    // en el marco local la cara exterior queda en -z; la placa, al otro lado del aplique
    g.translate(-(d.width / 2 + 0.34), 1.55, -WALL_VIS_T / 2);
    brassPlaque(g, tier);
    g.pop();
    return true;
  }
  const p = mainProp(m, props);
  if (!p) return false;
  const a = modelOf(p).anchors.plaque;
  if (!a) return false;
  g.push();
  g.translate(p.x, p.y, p.z);
  g.rotateY(p.yaw);
  g.translate(a.x, a.y, a.z);
  brassPlaque(g, tier);
  g.pop();
  return true;
}

/** ¿Un rectángulo en planta pisa el hueco de una puerta (con un pequeño margen)? */
function overDoor(doors: readonly DoorInfo[], ax: number, az: number, bx: number, bz: number): boolean {
  return doors.some((d) => {
    const hw = d.width / 2 + 0.05;
    const dx0 = d.axis === 'x' ? d.x - hw : d.x - 0.3;
    const dx1 = d.axis === 'x' ? d.x + hw : d.x + 0.3;
    const dz0 = d.axis === 'z' ? d.z - hw : d.z - 0.3;
    const dz1 = d.axis === 'z' ? d.z + hw : d.z + 0.3;
    return dx1 > ax && dx0 < bx && dz1 > az && dz0 < bz;
  });
}

/** Esquina libre de un módulo cerrado para un altillo de `size` m: sin muebles altos ni la puerta debajo. */
export function freeCorner(m: ModuleInstance, layout: ShipLayout, props: readonly PropInstance[], size: number, clearH: number): { x: number; z: number; sx: number; sz: number } | null {
  const cells = moduleCells(m).filter((c) => c.level === m.level);
  if (!cells.length) return null;
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of cells) {
    const mn = cellMin(c.x, c.z, layout.width);
    x0 = Math.min(x0, mn.x);
    z0 = Math.min(z0, mn.z);
    x1 = Math.max(x1, mn.x + CELL);
    z1 = Math.max(z1, mn.z + CELL);
  }
  const t = WALL_VIS_T / 2;
  const doors = layout.doors.filter((d) => d.level === m.level && d.x >= x0 - 0.3 && d.x <= x1 + 0.3 && d.z >= z0 - 0.3 && d.z <= z1 + 0.3);
  const corners: [number, number, number, number][] = [
    [x0 + t, z0 + t, 1, 1],
    [x1 - t, z0 + t, -1, 1],
    [x0 + t, z1 - t, 1, -1],
    [x1 - t, z1 - t, -1, -1],
  ];
  for (const [cx, cz, sx, sz] of corners) {
    const ax = Math.min(cx, cx + sx * size);
    const bx = Math.max(cx, cx + sx * size);
    const az = Math.min(cz, cz + sz * size);
    const bz = Math.max(cz, cz + sz * size);
    const tallHit = props.some((p) => p.moduleId === m.id && p.y - levelY(m.level) + p.height > clearH && p.x + p.hx > ax && p.x - p.hx < bx && p.z + p.hz > az && p.z - p.hz < bz);
    if (tallHit || overDoor(doors, ax, az, bx, bz)) continue;
    return { x: cx, z: cz, sx, sz };
  }
  return null;
}

/** Altillo del almacén mejorado: plataforma sobre escuadras, barandilla, escala y género. */
export function storeLoft(g: GeoBuilder, m: ModuleInstance, layout: ShipLayout, props: readonly PropInstance[]): boolean {
  if (m.type !== 'almacen' || moduleTier(m) < 2 || m.status === 'construction') return false;
  const y = levelY(m.level) + 2.2;
  let size = 1.3;
  let c = freeCorner(m, layout, props, size, 2.05);
  if (!c) c = freeCorner(m, layout, props, (size = 1.05), 2.05);
  if (!c) return false;
  const { x, z, sx, sz } = c;
  const X = (u: number): number => x + sx * u;
  const Z = (v: number): number => z + sz * v;
  const box = (u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, col: THREE.ColorRepresentation): void =>
    g.box(Math.min(X(u0), X(u1)), y0, Math.min(Z(v0), Z(v1)), Math.max(X(u0), X(u1)), y1, Math.max(Z(v0), Z(v1)), col);
  const plank = PALETTE.deckWood;
  const dark = shade(PALETTE.deckWoodDark, 0.85);
  const metal = moduleTier(m) >= 3;
  // tablones del suelo del altillo y vigas de canto
  for (let i = 0; i < 6; i++) box(0, y, (i / 6) * size, size, y + 0.05, ((i + 1) / 6) * size - 0.01, shade(plank, 0.92 + (i % 3) * 0.05));
  box(0, y - 0.14, size - 0.08, size, y, size, dark);
  box(size - 0.08, y - 0.14, 0, size, y, size, dark);
  // escuadras contra las dos paredes (diagonales) y tirante al techo en la esquina abierta
  const yw = y - 0.75;
  for (const u of [0.3, size - 0.3]) {
    g.cylinderBetween(X(u), yw, Z(0.03), X(u), y - 0.02, Z(0.7), 0.03, 4, metal ? '#3d5a80' : dark);
    g.cylinderBetween(X(0.03), yw, Z(u), X(0.7), y - 0.02, Z(u), 0.03, 4, metal ? '#3d5a80' : dark);
  }
  g.cylinder(X(size - 0.04), y, Z(size - 0.04), 0.015, 0.015, levelY(m.level) + WALL_H - y, 4, PALETTE.metalDark);
  // barandilla en los dos lados abiertos
  const rh = Math.min(0.55, levelY(m.level) + WALL_H - y - 0.12);
  for (const u of [0.05, size * 0.5, size - 0.04]) box(u - 0.025, y + 0.05, size - 0.06, u + 0.025, y + rh, size - 0.01, dark);
  for (const v of [0.05, size * 0.5]) box(size - 0.06, y + 0.05, v - 0.025, size - 0.01, y + rh, v + 0.025, dark);
  box(0, y + rh - 0.05, size - 0.06, size, y + rh, size - 0.01, plank);
  box(size - 0.06, y + rh - 0.05, 0, size - 0.01, y + rh, size, plank);
  // escala pegada a una de las dos paredes, junto al altillo (la que no tiene la puerta al lado)
  const lu = size + 0.2;
  const doors = layout.doors.filter((d) => d.level === m.level);
  const y0 = levelY(m.level);
  // swap = false: contra la pared v = 0 (a lo largo de u); true: contra la pared u = 0
  const ladderOn = [false, true].find((swap) => {
    const [u0, v0] = swap ? [0, lu - 0.25] : [lu - 0.25, 0];
    const [u1, v1] = swap ? [0.12, lu + 0.25] : [lu + 0.25, 0.12];
    const ax = Math.min(X(u0), X(u1));
    const bx = Math.max(X(u0), X(u1));
    const az = Math.min(Z(v0), Z(v1));
    const bz = Math.max(Z(v0), Z(v1));
    const blocked = props.some((p) => p.moduleId === m.id && p.x + p.hx > ax && p.x - p.hx < bx && p.z + p.hz > az && p.z - p.hz < bz);
    return !blocked && !overDoor(doors, ax, az, bx, bz);
  });
  if (ladderOn !== undefined) {
    const lbox = (a: number, yy0: number, b: number, a1: number, yy1: number, b1: number): void => (ladderOn ? box(b, yy0, a, b1, yy1, a1, plank) : box(a, yy0, b, a1, yy1, b1, plank));
    for (const du of [-0.17, 0.17]) lbox(lu + du - 0.025, y0, 0.02, lu + du + 0.025, y + 0.6, 0.07);
    for (let k = 1; k * 0.3 < y - y0 + 0.5; k++) lbox(lu - 0.17, y0 + k * 0.3, 0.03, lu + 0.17, y0 + k * 0.3 + 0.035, 0.08);
  }
  // género almacenado arriba
  crate(g, X(0.35), y + 0.05, Z(0.35), 0.42, 0.34, 0.42, '#c8995f', 0.1);
  crate(g, X(0.8), y + 0.05, Z(0.3), 0.36, 0.3, 0.36, '#b8895a', -0.2);
  g.cylinder(X(0.35), y + 0.05, Z(0.85), 0.16, 0.16, 0.14, 9, PALETTE.rope);
  return true;
}

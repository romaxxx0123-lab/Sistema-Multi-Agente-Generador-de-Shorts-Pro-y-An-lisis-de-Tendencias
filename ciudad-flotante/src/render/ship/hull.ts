/**
 * CASCO PROCEDURAL del barco y detalles exteriores fijos.
 *
 * El casco se genera como un "loft" de secciones transversales a lo largo de X:
 *  - popa con espejo plano (y la obra viva que sube hacia la hélice),
 *  - cuerpo central recto alrededor de la cuadrícula (manga = width·CELL + forro),
 *  - proa afilada que sobresale BOW_LENGTH m por delante de la última celda, con roda lanzada
 *    y arrufo (la regala sube hacia la proa).
 * Franjas por altura: obra viva roja hasta la flotación, línea blanca, casco azul oscuro y
 * filete crema bajo la tapa de regala. Se reconstruye cuando cambia la eslora (ampliación).
 *
 * Detalles exteriores (nivel 1): castillo de proa con molinete, bitas y cadenas, anclas, palo
 * con cofa, pluma de carga, botes salvavidas en pescantes, aros salvavidas, asta de bandera,
 * luces de navegación. Ojos de buey (nivel 0). La chimenea va sobre el puente (ver ShipView).
 */
import * as THREE from 'three';
import { CELL, LEVEL_H, SHIP_ORIGIN_X, WATERLINE_Y } from '../../sim/constants';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, mix, shade, type ColorLike } from './geo';

export const KEEL_Y = -1.6;
export const DECK_Y = LEVEL_H;
export const BOW_LENGTH = 8;
export const BULWARK_H = 0.5;
/** Grosor del casco por fuera de la cuadrícula (m). */
export const SKIN = 0.3;
/** Espesor de la regala (borda) hacia dentro. */
export const BULWARK_T = 0.16;
/** Altura de los ojos de buey. */
export const PORTHOLE_Y = 2.05;

export const bowStartX = (length: number): number => length * CELL - SHIP_ORIGIN_X;
export const sternX = (): number => -SHIP_ORIGIN_X - SKIN;
export const hullHalfWidth = (width: number): number => (width * CELL) / 2 + SKIN;

/** Filas del perfil de la sección maestra: [fracción de media manga, y]. */
interface Row {
  zf: number;
  y: number;
  /** Fila por encima de la cubierta (sufre el arrufo de proa). */
  above: boolean;
}

const RED_TOP = WATERLINE_Y + 0.25;
const WHITE_TOP = WATERLINE_Y + 0.42;

function profileRows(): Row[] {
  const top = DECK_Y + BULWARK_H;
  const r = (zf: number, y: number, above = false): Row => ({ zf, y, above });
  return [
    r(0, KEEL_Y),
    r(0.31, KEEL_Y),
    r(0.62, KEEL_Y + 0.1),
    r(0.83, KEEL_Y + 0.36),
    r(0.945, KEEL_Y + 0.86),
    r(0.988, -0.1),
    r(0.997, 0.55),
    r(1, RED_TOP),
    r(1, WHITE_TOP),
    r(1, DECK_Y - 0.6),
    r(1, DECK_Y),
    r(1, top - 0.13, true),
    r(1, top, true),
  ];
}

/** Color de la franja entre dos filas (según la altura base). */
function bandColor(y0: number, y1: number, top: number): ColorLike {
  const ym = (y0 + y1) / 2;
  if (ym < RED_TOP) return ym < WATERLINE_Y - 0.6 ? shade(PALETTE.hullStripe, 0.82) : PALETTE.hullStripe;
  if (ym < WHITE_TOP) return PALETTE.waterline;
  if (ym > top - 0.13) return PALETTE.waterline;
  return PALETTE.hull;
}

export interface HullGeometry {
  /** Casco bajo cubierta + espejo + quilla (nivel 0, material del casco). */
  hull: THREE.BufferGeometry;
  /** Regala, castillo de proa, trancanil y detalles exteriores (nivel 1, material sólido). */
  upper: THREE.BufferGeometry;
  /** Marcos de ojos de buey (nivel 0, sólido). */
  portFrames: THREE.BufferGeometry;
  /** Cristales exteriores de ojos de buey (nivel 0, cristal exterior). */
  portGlass: THREE.BufferGeometry;
  /** Cristales interiores (bodega). */
  portGlassIn: THREE.BufferGeometry;
  /** Luces de navegación (emisivas, nivel 1). */
  beacons: THREE.BufferGeometry;
  /** Cristales de los focos de cubierta (emisivos de noche, material de lámpara). */
  floodGlass: THREE.BufferGeometry;
  /** Puntos de anclaje para elementos dinámicos. */
  anchors: {
    flagPole: THREE.Vector3;
    mastTop: THREE.Vector3;
    boomTip: THREE.Vector3;
    bowTip: THREE.Vector3;
    /** Focos de cubierta en el palo (iluminan la cubierta de noche). */
    floodlight: THREE.Vector3;
  };
  /** Rótulos con el nombre del barco: posición, orientación y tamaño. */
  nameplates: { pos: THREE.Vector3; yaw: number; w: number; h: number; text: string; sub: string }[];
}

/** Datos que el casco necesita de la distribución (para no tapar cosas). */
export interface HullContext {
  length: number;
  width: number;
}

/**
 * Punto del casco (cara exterior) en la estación de proa `t` (0 = inicio de proa, 1 = roda)
 * para una fila del perfil. `x0` = inicio de proa, `hw` = media manga exterior.
 */
function bowPoint(t: number, row: Row, x0: number, hw: number): THREE.Vector3 {
  const s = THREE.MathUtils.clamp((row.y - KEEL_Y) / (DECK_Y - KEEL_Y), 0, 1);
  let L = BOW_LENGTH * (0.42 + 0.58 * (1 - (1 - s) ** 2.2));
  if (row.above) L += (row.y - DECK_Y) * 0.7;
  const p = 1.2 + 0.55 * s;
  const x = x0 + t * L;
  const z = row.zf * hw * (1 - t ** p);
  const y = row.above ? row.y + 0.95 * t ** 1.7 : row.y;
  return new THREE.Vector3(x, y, z);
}

/** Punto de la popa (espejo): la obra viva sube hacia el codaste. */
function sternPoint(row: Row, xs: number, hw: number): THREE.Vector3 {
  const y = row.y < -0.05 ? -0.48 + (row.y - KEEL_Y) * 0.31 : row.y;
  const zf = row.y < -0.05 ? row.zf * 0.96 : row.zf;
  return new THREE.Vector3(xs, y, zf * hw);
}

/** Media manga exterior a la altura de cubierta en una x dada (para colocar detalles). */
export function deckHalfWidthAt(x: number, length: number, width: number): number {
  const x0 = bowStartX(length);
  const hw = hullHalfWidth(width);
  if (x <= x0) return hw;
  const row: Row = { zf: 1, y: DECK_Y, above: false };
  // Búsqueda de t tal que bowPoint.x = x
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (bowPoint(mid, row, x0, hw).x < x) lo = mid;
    else hi = mid;
  }
  return bowPoint((lo + hi) / 2, row, x0, hw).z;
}

/**
 * ¿Está el punto (x, z) dentro del casco a la altura de la flotación? Útil para que el océano
 * no se dibuje dentro de la bodega (la bodega está por debajo de la línea de flotación).
 */
export function insideHull(x: number, z: number, length: number, width: number): boolean {
  if (x < sternX() || x > bowStartX(length) + BOW_LENGTH) return false;
  return Math.abs(z) < deckHalfWidthAt(x, length, width) - 0.02;
}

/** Polígono (x, z) del casco a la altura de cubierta, en sentido antihorario visto desde arriba. */
export function hullOutline(length: number, width: number, steps = 12): [number, number][] {
  const x0 = bowStartX(length);
  const xs = sternX();
  const pts: [number, number][] = [];
  const hw = hullHalfWidth(width);
  pts.push([xs, -hw]);
  for (let i = 0; i <= steps; i++) {
    const x = x0 + (i / steps) * BOW_LENGTH * 0.999;
    pts.push([x, -deckHalfWidthAt(x, length, width)]);
  }
  for (let i = steps; i >= 0; i--) {
    const x = x0 + (i / steps) * BOW_LENGTH * 0.999;
    pts.push([x, deckHalfWidthAt(x, length, width)]);
  }
  pts.push([xs, hw]);
  return pts;
}

const BOW_STATIONS = 10;

export function buildHull(ctx: HullContext): HullGeometry {
  const { length, width } = ctx;
  const rows = profileRows();
  const hw = hullHalfWidth(width);
  const x0 = bowStartX(length);
  const xs = sternX();
  const top = DECK_Y + BULWARK_H;

  // Estaciones: espejo, inicio del cuerpo central, inicio de proa, proa…
  const stations: THREE.Vector3[][] = [];
  stations.push(rows.map((r) => sternPoint(r, xs, hw)));
  stations.push(rows.map((r) => new THREE.Vector3(-SHIP_ORIGIN_X + 6, r.y, r.zf * hw)));
  for (let j = 0; j <= BOW_STATIONS; j++) {
    const t = j / BOW_STATIONS;
    stations.push(rows.map((r) => bowPoint(t, r, x0, hw)));
  }

  const g = new GeoBuilder();
  // Costados (estribor +z y babor -z).
  for (let j = 0; j + 1 < stations.length; j++) {
    const A = stations[j]!;
    const B = stations[j + 1]!;
    for (let i = 0; i + 1 < rows.length; i++) {
      const c = bandColor(rows[i]!.y, rows[i + 1]!.y, top);
      const a = A[i]!;
      const b = B[i]!;
      const cc = B[i + 1]!;
      const d = A[i + 1]!;
      // estribor
      g.quadN(a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z, d.x, d.y, d.z, c);
      // babor (espejo: orden inverso)
      g.quadN(a.x, a.y, -a.z, d.x, d.y, -d.z, cc.x, cc.y, -cc.z, b.x, b.y, -b.z, c);
    }
  }
  // Espejo de popa (franjas horizontales).
  const S = stations[0]!;
  for (let i = 0; i + 1 < rows.length; i++) {
    const c = bandColor(rows[i]!.y, rows[i + 1]!.y, top);
    const a = S[i]!;
    const d = S[i + 1]!;
    g.quadN(a.x, a.y, -a.z, a.x, a.y, a.z, d.x, d.y, d.z, d.x, d.y, -d.z, c);
  }
  // Quilla, codaste, timón y hélice.
  const keelC = shade(PALETTE.hullDark, 0.9);
  g.box(-SHIP_ORIGIN_X + 4, KEEL_Y - 0.28, -0.14, x0 + 2.6, KEEL_Y + 0.02, 0.14, keelC);
  g.box(xs + 0.35, -1.25, -0.08, xs + 0.55, -0.3, 0.08, keelC);
  g.box(xs - 0.75, -1.45, -0.07, xs + 0.3, 0.1, 0.07, shade(PALETTE.hullStripe, 0.75));
  g.cylinderX(xs + 1.05, -0.95, 0, 0.12, 0.7, 6, PALETTE.metalDark);
  for (let k = 0; k < 3; k++) {
    g.push();
    g.translate(xs + 0.75, -0.95, 0);
    g.rotateX((k / 3) * Math.PI * 2);
    g.box(-0.04, 0, -0.12, 0.04, 0.5, 0.12, PALETTE.accent);
    g.pop();
  }
  const hullGeo = g.build();

  /* ---------------- Regala, castillo de proa y trancanil (nivel 1) ---------------- */
  const u = new GeoBuilder();
  const deckRow = rows.findIndex((r) => r.y === DECK_Y);
  const topRow = rows.length - 1;
  // Línea exterior de cubierta en planta (estribor) por estación.
  const outer = stations.map((st) => ({ x: st[deckRow]!.x, z: st[deckRow]!.z, top: st[topRow]!.y, xt: st[topRow]!.x, zt: st[topRow]!.z }));
  // Línea interior: desplazamiento hacia dentro (perpendicular a la línea en planta).
  const inner = outer.map((p, j) => {
    const prev = outer[Math.max(0, j - 1)]!;
    const next = outer[Math.min(outer.length - 1, j + 1)]!;
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    // normal hacia dentro (hacia z menor en estribor)
    let nx = tz;
    let nz = -tx;
    if (nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    let x = p.x + nx * BULWARK_T;
    let z = p.z + nz * BULWARK_T;
    if (j === 0) x = p.x + BULWARK_T;
    if (z < 0) z = 0;
    if (j === outer.length - 1) {
      x = p.x - 0.42;
      z = 0;
    }
    return { x, z, top: p.top };
  });
  const capC = PALETTE.deckWoodDark;
  const innerC = shade(PALETTE.wallOuter, 0.93);
  const plankDark = shade(PALETTE.deckWoodDark, 0.85);
  for (let j = 0; j + 1 < outer.length; j++) {
    const a = inner[j]!;
    const b = inner[j + 1]!;
    const oa = outer[j]!;
    const ob = outer[j + 1]!;
    for (const s of [1, -1]) {
      // cara interior de la regala
      if (s === 1) {
        u.quadN(a.x, DECK_Y, a.z, a.x, a.top, a.z, b.x, b.top, b.z, b.x, DECK_Y, b.z, innerC);
        u.quadN(oa.xt, oa.top, oa.zt, ob.xt, ob.top, ob.zt, b.x, b.top, b.z, a.x, a.top, a.z, capC);
      } else {
        u.quadN(a.x, DECK_Y, -a.z, b.x, DECK_Y, -b.z, b.x, b.top, -b.z, a.x, a.top, -a.z, innerC);
        u.quadN(oa.xt, oa.top, -oa.zt, a.x, a.top, -a.z, b.x, b.top, -b.z, ob.xt, ob.top, -ob.zt, capC);
      }
    }
  }
  // Regala de popa (cara interior y tapa).
  {
    const a = inner[0]!;
    const o = outer[0]!;
    u.quadN(a.x, DECK_Y, a.z, a.x, DECK_Y, -a.z, a.x, a.top, -a.z, a.x, a.top, a.z, innerC);
    u.quadN(o.xt, o.top, -o.zt, o.xt, o.top, o.zt, a.x, a.top, a.z, a.x, a.top, -a.z, capC);
  }
  // Trancanil: franjas de cubierta entre la cuadrícula y la regala (costados y popa).
  const hwGrid = (width * CELL) / 2;
  u.box(inner[0]!.x, DECK_Y - 0.2, -hwGrid, -SHIP_ORIGIN_X, DECK_Y, hwGrid, plankDark, { ny: true });
  for (const s of [1, -1]) {
    const z0 = s * hwGrid;
    const z1 = s * (hw - BULWARK_T + 0.01);
    u.box(inner[0]!.x, DECK_Y - 0.2, Math.min(z0, z1), x0, DECK_Y, Math.max(z0, z1), plankDark, { ny: true });
  }
  // Castillo de proa: base oscura con el contorno exacto + tablones encima.
  const bowStart = 2; // índice de la estación x0
  const poly: [number, number][] = [];
  for (let j = bowStart; j < inner.length; j++) poly.push([inner[j]!.x, inner[j]!.z]);
  for (let j = inner.length - 2; j >= bowStart; j--) poly.push([inner[j]!.x, -inner[j]!.z]);
  u.prism(poly, DECK_Y - 0.22, DECK_Y - 0.01, plankDark, plankDark);
  const innerAt = (x: number): number => {
    for (let j = bowStart; j + 1 < inner.length; j++) {
      const a = inner[j]!;
      const b = inner[j + 1]!;
      if (x >= a.x && x <= b.x) return a.z + ((x - a.x) / Math.max(1e-6, b.x - a.x)) * (b.z - a.z);
    }
    return 0;
  };
  const xEndFor = (zAbs: number): number => {
    let lo = x0;
    let hi = inner[inner.length - 1]!.x;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (innerAt(mid) > zAbs) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const plankW = 0.3;
  const nPl = Math.ceil((hw - BULWARK_T) / plankW);
  for (let k = -nPl; k < nPl; k++) {
    const za = k * plankW;
    const zb = za + plankW;
    const xe = xEndFor(Math.max(Math.abs(za), Math.abs(zb)));
    if (xe <= x0 + 0.05) continue;
    const c = shade(PALETTE.deckWood, 0.92 + ((k * 7919) % 13) / 100);
    u.box(x0, DECK_Y - 0.05, za + 0.012, xe, DECK_Y, zb - 0.012, c, { ny: true });
  }

  /* ---------------- Detalles exteriores ---------------- */
  const tipX = outer[outer.length - 1]!.x;
  const metal = PALETTE.metal;
  const metalDark = PALETTE.metalDark;
  const rope = PALETTE.rope;

  // Palo de proa con cofa y crucetas.
  const mastX = x0 + 2.3;
  const mastTop = DECK_Y + 10.5;
  u.cylinder(mastX, DECK_Y, 0, 0.36, 0.36, 0.5, 8, metalDark);
  u.cylinder(mastX, DECK_Y + 0.5, 0, 0.19, 0.12, mastTop - DECK_Y - 0.5, 8, PALETTE.wallOuter);
  u.cylinder(mastX, DECK_Y + 2.6, 0, 0.22, 0.22, 0.25, 8, PALETTE.hullStripe);
  // cofa
  u.cylinder(mastX, DECK_Y + 7.6, 0, 0.75, 0.75, 0.12, 10, metalDark);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    u.cylinderBetween(mastX + Math.cos(a) * 0.72, DECK_Y + 7.72, Math.sin(a) * 0.72, mastX + Math.cos(a) * 0.72, DECK_Y + 8.45, Math.sin(a) * 0.72, 0.025, 4, metal);
  }
  u.cylinder(mastX, DECK_Y + 8.35, 0, 0.74, 0.74, 0.08, 10, PALETTE.rail, { capBottom: false, capTop: false });
  u.cylinder(mastX, DECK_Y + 8.4, 0, 0.74, 0.74, 0.06, 10, PALETTE.rail);
  // crucetas
  u.box(mastX - 0.05, DECK_Y + 9.1, -1.3, mastX + 0.05, DECK_Y + 9.2, 1.3, metalDark);
  // focos de cubierta bajo la cofa, apuntando a popa y hacia abajo
  const fl = new GeoBuilder();
  const floodY = DECK_Y + 7.15;
  for (const fz of [-0.32, 0.32]) {
    u.push();
    u.translate(mastX - 0.3, floodY, fz);
    u.rotateZ(0.55);
    u.box(-0.12, -0.14, -0.14, 0.14, 0.14, 0.14, metalDark);
    u.pop();
    fl.push();
    fl.translate(mastX - 0.3, floodY, fz);
    fl.rotateZ(0.55);
    fl.box(-0.135, -0.11, -0.11, -0.12, 0.11, 0.11, '#ffffff');
    fl.pop();
  }
  u.box(mastX - 0.32, floodY - 0.03, -0.45, mastX - 0.12, floodY + 0.03, 0.45, metalDark);
  // obenques y estays
  const stayR = 0.022;
  u.cylinderBetween(mastX, mastTop - 0.3, 0, tipX - 0.15, top + 0.95, 0, stayR, 4, metalDark);
  for (const s of [1, -1]) {
    u.cylinderBetween(mastX, DECK_Y + 9.15, s * 1.25, mastX - 0.6, DECK_Y + 0.5, s * (deckHalfWidthAt(mastX - 0.6, length, width) - 0.3), stayR, 4, metalDark);
    u.cylinderBetween(mastX, DECK_Y + 9.15, s * 1.25, mastX + 1.4, DECK_Y + 0.6, s * (deckHalfWidthAt(mastX + 1.4, length, width) - 0.35), stayR, 4, metalDark);
  }
  // Pluma de carga hacia estribor, sobre el agua (para izar restos).
  const pivot = new THREE.Vector3(mastX, DECK_Y + 1.7, 0.2);
  const boomDir = new THREE.Vector3(0.12, 0.42, 1).normalize();
  const boomLen = 10.2;
  const boomTip = pivot.clone().addScaledVector(boomDir, boomLen);
  u.cylinderBetween(pivot.x, pivot.y, pivot.z, boomTip.x, boomTip.y, boomTip.z, 0.11, 6, PALETTE.accent);
  u.cylinder(pivot.x, pivot.y - 0.25, pivot.z, 0.18, 0.18, 0.4, 6, metalDark);
  // amantillo (del tope de la pluma al palo)
  u.cylinderBetween(boomTip.x, boomTip.y, boomTip.z, mastX, DECK_Y + 7.4, 0, stayR, 4, metalDark);
  // gancho colgando con una red de carga
  const hookY = boomTip.y - 2.1;
  u.cylinderBetween(boomTip.x, boomTip.y, boomTip.z, boomTip.x, hookY + 0.25, boomTip.z, 0.02, 4, rope);
  u.box(boomTip.x - 0.12, hookY + 0.05, boomTip.z - 0.05, boomTip.x + 0.12, hookY + 0.3, boomTip.z + 0.05, metalDark);
  u.sphere(boomTip.x, hookY - 0.35, boomTip.z, 0.42, shade(rope, 0.8), 0, 0.85);
  u.boxB(boomTip.x - 0.05, hookY - 0.62, boomTip.z + 0.02, 0.36, 0.3, 0.36, PALETTE.deckWoodDark);

  // Molinete del ancla con cadenas hacia los escobenes.
  const windX = x0 + 4.6;
  u.box(windX - 0.45, DECK_Y, -0.75, windX + 0.45, DECK_Y + 0.35, 0.75, metalDark);
  u.cylinderZ(windX, DECK_Y + 0.65, 0, 0.32, 1.1, 8, PALETTE.hullStripe);
  u.cylinderZ(windX, DECK_Y + 0.65, 0, 0.12, 1.7, 6, metal);
  for (const s of [1, -1]) {
    u.cylinder(windX, DECK_Y + 0.35, s * 0.62, 0.38, 0.38, 0.12, 8, metal);
    // cadena: eslabones hasta el escobén
    const hx = x0 + 2.0;
    const hz = s * (deckHalfWidthAt(hx, length, width) - 0.45);
    const n = Math.ceil(Math.hypot(hx - windX, hz - s * 0.55) / 0.15);
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const cx = windX + (hx - windX) * t;
      const cz = s * 0.55 + (hz - s * 0.55) * t;
      u.push();
      u.translate(cx, DECK_Y + 0.05 + (k % 2) * 0.03, cz);
      u.rotateY(Math.atan2(hx - windX, hz - s * 0.55));
      if (k % 2) u.box(-0.012, 0, -0.1, 0.012, 0.07, 0.1, metalDark);
      else u.box(-0.045, 0, -0.1, 0.045, 0.025, 0.1, metalDark);
      u.pop();
    }
    u.cylinder(hx, DECK_Y - 0.02, hz, 0.2, 0.2, 0.1, 8, metalDark);
  }
  // Bitas de amarre en el castillo.
  for (const s of [1, -1]) {
    const bx = x0 + 0.9;
    const bz = s * (hw - BULWARK_T - 0.55);
    u.box(bx - 0.4, DECK_Y, bz - 0.18, bx + 0.4, DECK_Y + 0.08, bz + 0.18, metalDark);
    u.cylinder(bx - 0.22, DECK_Y + 0.08, bz, 0.12, 0.12, 0.42, 8, metal);
    u.cylinder(bx + 0.22, DECK_Y + 0.08, bz, 0.12, 0.12, 0.42, 8, metal);
    // cabo en ocho
    u.cylinderBetween(bx - 0.22, DECK_Y + 0.3, bz - 0.13, bx + 0.22, DECK_Y + 0.38, bz + 0.13, 0.04, 4, rope);
    u.cylinderBetween(bx - 0.22, DECK_Y + 0.38, bz + 0.13, bx + 0.22, DECK_Y + 0.3, bz - 0.13, 0.04, 4, rope);
    // aduja de cabo
    u.cylinder(bx + 1.2, DECK_Y, bz * 0.82, 0.38, 0.36, 0.12, 9, rope);
    u.cylinder(bx + 1.2, DECK_Y + 0.12, bz * 0.82, 0.2, 0.2, 0.01, 7, shade(rope, 0.7));
  }
  // Escotilla con lona sobre el castillo (lona casera atada).
  {
    const hx0 = x0 + 0.35;
    const hx1 = x0 + 1.55;
    u.box(hx0, DECK_Y, -1.0, hx1, DECK_Y + 0.35, 1.0, PALETTE.deckWoodDark);
    u.frustum((hx0 + hx1) / 2, DECK_Y + 0.35, 0, hx1 - hx0 + 0.12, 2.12, hx1 - hx0 - 0.3, 1.5, 0.22, PALETTE.canvas);
    for (const zz of [-0.6, 0, 0.6]) u.box(hx0 - 0.08, DECK_Y + 0.1, zz - 0.03, hx1 + 0.08, DECK_Y + 0.6, zz + 0.03, rope);
  }

  // Anclas en las amuras (marco local: x a lo largo del casco, z hacia fuera).
  for (const s of [1, -1]) {
    const ax = x0 + 3.9;
    const az = deckHalfWidthAt(ax, length, width);
    const az2 = deckHalfWidthAt(ax + 0.5, length, width);
    const l = Math.hypot(0.5, az2 - az);
    const tx = 0.5 / l;
    const tz = (az2 - az) / l;
    const nx = -tz;
    const nz = s * tx;
    u.push();
    u.translate(ax, DECK_Y - 0.35, s * az + nz * 0.03);
    u.rotateY(Math.atan2(nx, nz));
    u.cylinderZ(0, 0, 0.0, 0.26, 0.12, 8, metalDark);
    u.quadN(-0.07, -1.45, 0.005, 0.07, -1.45, 0.005, 0.12, -0.2, 0.005, -0.12, -0.2, 0.005, mix(PALETTE.hull, PALETTE.rust, 0.55));
    u.box(-0.06, -1.25, 0.03, 0.06, -0.05, 0.1, metalDark);
    u.box(-0.32, -0.32, 0.03, 0.32, -0.24, 0.1, metalDark);
    u.box(-0.55, -1.3, 0.03, 0.55, -1.2, 0.1, metalDark);
    u.box(-0.62, -1.27, 0.03, -0.46, -0.98, 0.1, metalDark);
    u.box(0.46, -1.27, 0.03, 0.62, -0.98, 0.1, metalDark);
    u.pop();
  }

  // Botes salvavidas en pescantes.
  const boatX = (-SHIP_ORIGIN_X + x0) / 2 + 1.5;
  for (const s of [1, -1]) {
    const bz = s * (hw + 0.95);
    const by = top + 0.55;
    lifeboat(u, boatX, by, bz, 4.4, 1.55);
    for (const dxs of [-1.7, 1.7]) {
      const px = boatX + dxs;
      const base = new THREE.Vector3(px, top, s * (hw - 0.05));
      const mid = new THREE.Vector3(px, top + 2.0, s * (hw + 0.15));
      const tip = new THREE.Vector3(px, top + 2.35, bz);
      u.cylinderBetween(base.x, base.y - 0.6, base.z, mid.x, mid.y, mid.z, 0.08, 6, PALETTE.wallOuter);
      u.cylinderBetween(mid.x, mid.y, mid.z, tip.x, tip.y, tip.z, 0.07, 6, PALETTE.wallOuter);
      u.cylinderBetween(tip.x, tip.y, tip.z, tip.x, by + 0.75, tip.z, 0.02, 4, rope);
      u.box(px - 0.12, top - 0.65, s * (hw - 0.02) - 0.08, px + 0.12, top - 0.1, s * (hw - 0.02) + 0.08, metalDark);
    }
  }

  // Aros salvavidas en la cara exterior de la regala.
  const ringXs = [-SHIP_ORIGIN_X + 3.2, boatX - 5.5, x0 - 3.5];
  for (const s of [1, -1]) {
    for (const rx of ringXs) {
      u.push();
      u.translate(rx, top - 0.42, s * (hw + 0.05));
      lifeRing(u, 0.32, 0.075);
      u.pop();
    }
  }

  // Neumáticos viejos colgados como defensas (toque casero), entre ojos de buey.
  for (const s of [1, -1]) {
    for (const fx of [-SHIP_ORIGIN_X + 8, x0 - 14, x0 - 8]) {
      if (fx < -SHIP_ORIGIN_X + 2 || fx > x0 - 1) continue;
      u.push();
      u.translate(fx, 1.75, s * (hw + 0.12));
      u.ring(0, 0, 0, 0.3, 0.11, 10, '#22262a', 5);
      u.pop();
      u.cylinderBetween(fx, 2.02, s * (hw + 0.14), fx, top, s * (hw - 0.05), 0.02, 4, rope);
    }
  }

  // Asta de bandera en la popa (la bandera se anima aparte).
  const poleBase = new THREE.Vector3(xs + 0.25, top, 0);
  const poleTop = new THREE.Vector3(xs - 0.65, top + 3.3, 0);
  u.cylinderBetween(poleBase.x, poleBase.y, poleBase.z, poleTop.x, poleTop.y, poleTop.z, 0.05, 6, PALETTE.deckWoodDark);
  u.sphere(poleTop.x, poleTop.y + 0.05, poleTop.z, 0.08, PALETTE.accent);
  u.box(xs + 0.1, top - 0.1, -0.2, xs + 0.45, top + 0.2, 0.2, metalDark);

  // Cornamusas sobre la tapa de regala.
  for (let x = -SHIP_ORIGIN_X + 2; x < x0 - 1; x += 8) {
    for (const s of [1, -1]) {
      const z = s * (hw - BULWARK_T / 2);
      u.box(x - 0.18, top, z - 0.04, x + 0.18, top + 0.07, z + 0.04, metalDark);
      u.box(x - 0.05, top, z - 0.04, x + 0.05, top + 0.12, z + 0.04, metalDark);
    }
  }

  // Luces de navegación (verde estribor, roja babor, blanca de tope y de popa).
  const b = new GeoBuilder();
  const navX = x0 - 0.3;
  u.box(navX - 0.15, top, hw - 0.12 - 0.12, navX + 0.15, top + 0.32, hw - 0.12 + 0.12, metalDark);
  u.box(navX - 0.15, top, -hw + 0.12 - 0.12, navX + 0.15, top + 0.32, -hw + 0.12 + 0.12, metalDark);
  b.boxC(navX, top + 0.45, hw - 0.12, 0.2, 0.22, 0.2, '#5dff7a');
  b.boxC(navX, top + 0.45, -hw + 0.12, 0.2, 0.22, 0.2, '#ff4a3d');
  b.sphere(mastX, mastTop + 0.12, 0, 0.13, '#fff6d8');
  b.sphere(xs + 0.3, top + 0.45, 0.32, 0.1, '#fff6d8');
  u.cylinder(mastX, mastTop, 0, 0.06, 0.06, 0.06, 6, metalDark);

  /* ---------------- Ojos de buey ---------------- */
  const pf = new GeoBuilder();
  const pg = new GeoBuilder();
  const pin = new GeoBuilder();
  const brass = '#c9a35a';
  const holdInner = (width * CELL) / 2 - 0.08;
  for (let cx = 0; cx < length; cx++) {
    const x = cx * CELL - SHIP_ORIGIN_X + CELL / 2;
    for (const s of [1, -1]) {
      // exterior
      pf.push();
      pf.translate(x, PORTHOLE_Y, s * (hw + 0.005));
      if (s < 0) pf.rotateY(Math.PI);
      pf.ring(0, 0, 0, 0.27, 0.055, 10, brass, 4);
      pf.pop();
      pg.push();
      pg.translate(x, PORTHOLE_Y, s * (hw + 0.012));
      if (s < 0) pg.rotateY(Math.PI);
      pg.disc(0, 0, 0, 0.24, 10, '#ffffff');
      pg.pop();
      // chorretón de óxido bajo algunos ojos de buey (barco con vida)
      if (hash01(cx, s, length) < 0.45) {
        const len = 0.3 + hash01(cx, s, 3) * 0.35;
        pf.push();
        pf.translate(x + (hash01(cx, s, 5) - 0.5) * 0.1, PORTHOLE_Y - 0.31, s * (hw + 0.004));
        if (s < 0) pf.rotateY(Math.PI);
        // mancha que se difumina: tramo superior más intenso y punta más tenue
        pf.quadN(-0.11, -len * 0.45, 0, 0.11, -len * 0.45, 0, 0.14, 0, 0, -0.14, 0, 0, mix(PALETTE.hull, PALETTE.rust, 0.32));
        pf.quadN(-0.04, -len, 0, 0.04, -len, 0, 0.11, -len * 0.45, 0, -0.11, -len * 0.45, 0, mix(PALETTE.hull, PALETTE.rust, 0.18));
        pf.pop();
      }
      // interior (sobre el forro de la bodega)
      pf.push();
      pf.translate(x, PORTHOLE_Y, s * (holdInner - 0.02));
      if (s > 0) pf.rotateY(Math.PI);
      pf.ring(0, 0, 0, 0.27, 0.06, 10, shade(brass, 0.85), 4);
      pf.pop();
      pin.push();
      pin.translate(x, PORTHOLE_Y, s * (holdInner - 0.03));
      if (s > 0) pin.rotateY(Math.PI);
      pin.disc(0, 0, 0, 0.23, 10, '#ffffff');
      pin.pop();
    }
  }

  // Nombre pintado a ambos costados, en la parte recta cerca de la proa (sobre los ojos de buey).
  const nameplates: HullGeometry['nameplates'] = [];
  const nameW = Math.min(6.2, Math.max(3.5, length * CELL * 0.16));
  for (const s of [1, -1]) {
    nameplates.push({
      pos: new THREE.Vector3(x0 - 0.9 - nameW / 2, 2.72, s * (hw + 0.012)),
      yaw: s > 0 ? 0 : Math.PI,
      w: nameW,
      h: 0.5,
      text: 'CIUDAD FLOTANTE',
      sub: '',
    });
  }
  nameplates.push({ pos: new THREE.Vector3(xs - 0.012, 2.25, 0), yaw: -Math.PI / 2, w: 6.2, h: 1.2, text: 'CIUDAD FLOTANTE', sub: 'PUERTO LIBRE' });

  return {
    hull: hullGeo,
    upper: u.build(),
    portFrames: pf.build(),
    portGlass: pg.build(),
    portGlassIn: pin.build(),
    beacons: b.build(),
    floodGlass: fl.build(),
    anchors: {
      flagPole: poleTop,
      mastTop: new THREE.Vector3(mastX, mastTop, 0),
      boomTip,
      bowTip: new THREE.Vector3(tipX, top + 0.95, 0),
      floodlight: new THREE.Vector3(mastX - 1.2, floodY - 0.6, 0),
    },
    nameplates,
  };
}

/** Bote salvavidas (casco naranja con toldo blanco) centrado en (x, y, z), eslora en X. */
export function lifeboat(g: GeoBuilder, x: number, y: number, z: number, len: number, beam: number): void {
  const hullC = '#e8722c';
  const topC = PALETTE.wallOuter;
  const h = 0.75;
  const st = 8;
  const sec = (t: number): { hw: number; kb: number; k: number } => {
    const k = Math.sin(t * Math.PI) ** 0.6;
    return { hw: (beam / 2) * k, kb: 0.2 * (1 - k), k };
  };
  g.push();
  g.translate(x, y, z);
  for (let i = 0; i < st; i++) {
    const t0 = i / st;
    const t1 = (i + 1) / st;
    const a = sec(t0);
    const b = sec(t1);
    const xa = -len / 2 + t0 * len;
    const xb = -len / 2 + t1 * len;
    // costados: de la quilla (z = 0) a la borda
    g.quadN(xa, a.kb, 0, xb, b.kb, 0, xb, h, b.hw, xa, h, a.hw, hullC);
    g.quadN(xa, a.kb, 0, xa, h, -a.hw, xb, h, -b.hw, xb, b.kb, 0, hullC);
    // toldo a dos aguas
    const ra = h + 0.38 * a.k;
    const rb = h + 0.38 * b.k;
    g.quadN(xa, h, a.hw, xb, h, b.hw, xb, rb, 0, xa, ra, 0, topC);
    g.quadN(xa, h, -a.hw, xa, ra, 0, xb, rb, 0, xb, h, -b.hw, topC);
  }
  // cintón blanco y número
  g.box(-len * 0.32, h - 0.12, beam / 2 - 0.02, len * 0.32, h - 0.04, beam / 2 + 0.01, topC);
  g.box(-len * 0.32, h - 0.12, -beam / 2 - 0.01, len * 0.32, h - 0.04, -beam / 2 + 0.02, topC);
  g.pop();
}

/** Aro salvavidas en el plano XY local (mirando a ±z), naranja y blanco. */
export function lifeRing(g: GeoBuilder, R: number, r: number): void {
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const c = Math.floor(i / 3) % 2 === 0 ? '#e8722c' : '#f3ead6';
    for (let j = 0; j < 4; j++) {
      const b0 = (j / 4) * Math.PI * 2;
      const b1 = ((j + 1) / 4) * Math.PI * 2;
      const p = (a: number, b: number): [number, number, number] => {
        const rr = R + r * Math.cos(b);
        return [rr * Math.cos(a), rr * Math.sin(a), r * Math.sin(b)];
      };
      g.quadN(...p(a0, b0), ...p(a1, b0), ...p(a1, b1), ...p(a0, b1), c);
    }
  }
}

/** Chimenea (sobre el techo del puente) con franja roja y boca negra. Base en (x, y, z). */
export function funnel(g: GeoBuilder, x: number, y: number, z: number): THREE.Vector3 {
  const h = 2.7;
  g.push();
  g.translate(x, y, z);
  g.rotateZ(0.12); // inclinada hacia popa
  g.cylinder(0, 0, 0, 0.72, 0.62, 0.25, 8, PALETTE.metalDark, { phase: Math.PI / 8 });
  g.cylinder(0, 0.25, 0, 0.6, 0.56, h - 0.9, 8, PALETTE.wallOuter, { phase: Math.PI / 8, capTop: false });
  g.cylinder(0, 0.25 + h - 0.9, 0, 0.56, 0.55, 0.45, 8, PALETTE.hullStripe, { phase: Math.PI / 8, capTop: false });
  g.cylinder(0, h - 0.2, 0, 0.55, 0.55, 0.22, 8, '#22262a', { phase: Math.PI / 8, capTop: false });
  g.cylinder(0, h - 0.2, 0, 0.42, 0.42, 0.21, 8, '#141618', { phase: Math.PI / 8, capBottom: false });
  // aros de refuerzo
  g.cylinder(0, 0.9, 0, 0.62, 0.62, 0.06, 8, PALETTE.metal, { phase: Math.PI / 8 });
  g.pop();
  // bocina y escalerilla
  g.box(x + 0.55, y + 1.0, z - 0.06, x + 0.62, y + 2.1, z + 0.06, PALETTE.metalDark);
  const topPos = new THREE.Vector3(x - Math.sin(0.12) * h, y + Math.cos(0.12) * h, z);
  return topPos;
}

/** Mástil de radar y antena sobre el puente. Base en (x, y, z). Devuelve la posición del radar. */
export function radarMast(g: GeoBuilder, x: number, y: number, z: number): THREE.Vector3 {
  g.cylinder(x, y, z, 0.1, 0.07, 1.9, 6, PALETTE.wallOuter);
  g.box(x - 0.4, y + 1.2, z - 0.04, x + 0.4, y + 1.26, z + 0.04, PALETTE.metalDark);
  g.cylinder(x + 0.35, y + 1.26, z, 0.015, 0.015, 1.1, 4, PALETTE.metalDark);
  // foco
  g.cylinderX(x - 0.3, y + 0.9, z + 0.3, 0.13, 0.25, 8, PALETTE.metalDark);
  return new THREE.Vector3(x, y + 1.95, z);
}


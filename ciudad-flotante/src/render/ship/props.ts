/**
 * MODELOS LOW-POLY DE LOS PROPS (un modelo reconocible para cada PropKind de data/modules.ts).
 *
 * Convención (igual que data/modules.ts): origen en el centro de la planta a ras de suelo,
 * el "frente" (desde donde se usa) mira a -z local y el eje largo va a lo largo de x local.
 * Las medidas (hx, hz, altura) son las del colisionador ANTES de rotar.
 *
 * Cada modelo devuelve:
 *  - `solid`: geometría estática (se fusiona con el nivel),
 *  - `glass` / `glow`: partes de cristal o luminosas estáticas,
 *  - `moving`: partes que se animan (generador que vibra, timón que gira, motor),
 *  - `contents`: contenido por niveles de llenado (estanterías y despensa) con `tiers`
 *    = número de vértices al completar cada cuarto; se muestra con drawRange,
 *  - `anchors`: puntos para efectos dinámicos (fuego del fogón, humo, LEDs, nivel de agua…).
 * Los modelos se cachean por tipo + medidas.
 */
import * as THREE from 'three';
import type { PropKind } from '../../data/modules';
import type { PropInstance } from '../../sim/ship';
import { WALL_H } from '../../sim/constants';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, shade, type ColorLike } from './geo';

export interface PropDims {
  hx: number;
  hz: number;
  h: number;
}

export interface PropAnchors {
  [name: string]: THREE.Vector3;
}

export interface PropModel {
  solid: THREE.BufferGeometry;
  glass: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
  moving: THREE.BufferGeometry | null;
  /** Pivote local de la parte móvil (el timón gira alrededor de su cubo). */
  movingPivot: THREE.Vector3 | null;
  contents: THREE.BufferGeometry | null;
  tiers: number[];
  anchors: PropAnchors;
}

/** Medidas locales (sin rotar) de un prop del layout. */
export function localDims(p: PropInstance): PropDims {
  const swap = Math.abs(Math.cos(p.yaw)) < 0.5;
  return { hx: swap ? p.hz : p.hx, hz: swap ? p.hx : p.hz, h: p.height };
}

const WOOD = '#9c6b43';
const WOOD_DARK = '#6e4a2e';
const WOOD_LIGHT = '#c8995f';
const IRON = '#3a3f44';
const STEEL = PALETTE.metal;
const STEEL_DARK = PALETTE.metalDark;
const BRASS = '#c9a35a';
const CLOTH_WHITE = '#f1ece0';
const BLANKETS = ['#2a9d8f', '#bc4749', '#457b9d', '#e9c46a', '#6d597a', '#f4a261'];

interface Ctx {
  g: GeoBuilder;
  glass: GeoBuilder;
  glow: GeoBuilder;
  moving: GeoBuilder;
  contents: GeoBuilder;
  tiers: number[];
  anchors: PropAnchors;
}

type Builder = (c: Ctx, d: PropDims) => void;

/* ------------------------------------------------------------------ */
/* Piezas reutilizables                                                */
/* ------------------------------------------------------------------ */

/** Caja de madera con listones. */
export function crate(g: GeoBuilder, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, base: ColorLike = WOOD_LIGHT, yaw = 0): void {
  g.push();
  g.translate(cx, y0, cz);
  if (yaw) g.rotateY(yaw);
  g.box(-sx / 2, 0, -sz / 2, sx / 2, sy, sz / 2, base);
  const band = shade(base, 0.72);
  const t = 0.02;
  // listones horizontales arriba y abajo en las cuatro caras
  for (const y of [0.02, sy - 0.1]) {
    g.box(-sx / 2 - t, y, -sz / 2 - t, sx / 2 + t, y + 0.08, sz / 2 + t, band, { py: y < 0.05, ny: y > 0.05 });
  }
  // cruz en el frente y laterales
  g.box(-0.04, 0.1, -sz / 2 - t, 0.04, sy - 0.1, -sz / 2, band);
  g.box(-0.04, 0.1, sz / 2, 0.04, sy - 0.1, sz / 2 + t, band);
  g.pop();
}

/** Saco de arpillera. */
function sack(g: GeoBuilder, cx: number, y0: number, cz: number, s: number, color: ColorLike = '#b89b6a'): void {
  g.frustum(cx, y0, cz, s, s * 0.8, s * 0.75, s * 0.6, s * 0.95, color);
  g.frustum(cx, y0 + s * 0.95, cz, s * 0.75, s * 0.6, s * 0.25, s * 0.2, s * 0.22, shade(color, 0.9));
  g.box(cx - s * 0.14, y0 + s * 1.1, cz - s * 0.12, cx + s * 0.14, y0 + s * 1.18, cz + s * 0.12, shade(color, 0.7));
}

/** Tarro con tapa. */
function jar(g: GeoBuilder, cx: number, y0: number, cz: number, r: number, h: number, color: ColorLike): void {
  g.cylinder(cx, y0, cz, r, r, h, 6, color);
  g.cylinder(cx, y0 + h, cz, r * 0.85, r * 0.85, h * 0.18, 6, '#c8553d');
}

/** Lata. */
function can(g: GeoBuilder, cx: number, y0: number, cz: number, r: number, h: number, label: ColorLike): void {
  g.cylinder(cx, y0, cz, r, r, h * 0.15, 6, '#adb5bd', { capTop: false });
  g.cylinder(cx, y0 + h * 0.15, cz, r, r, h * 0.7, 6, label, { capTop: false, capBottom: false });
  g.cylinder(cx, y0 + h * 0.85, cz, r, r, h * 0.15, 6, '#adb5bd', { capBottom: false });
}

/** Botella. */
function bottle(g: GeoBuilder, cx: number, y0: number, cz: number, h: number, color: ColorLike): void {
  g.cylinder(cx, y0, cz, 0.045, 0.045, h * 0.62, 6, color);
  g.cylinder(cx, y0 + h * 0.62, cz, 0.045, 0.018, h * 0.18, 6, color, { capBottom: false });
  g.cylinder(cx, y0 + h * 0.8, cz, 0.018, 0.018, h * 0.2, 4, shade(color, 0.7));
}

/** Patas de mueble en las esquinas. */
function legs(g: GeoBuilder, hx: number, hz: number, h: number, s: number, color: ColorLike, inset = 0.03): void {
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) g.box(sx * (hx - inset) - s / 2, 0, sz * (hz - inset) - s / 2, sx * (hx - inset) + s / 2, h, sz * (hz - inset) + s / 2, color);
}

/** Martillo tumbado o colgado (en el plano XY si `hang`). */
function hammer(g: GeoBuilder, x: number, y: number, z: number, hang: boolean): void {
  g.push();
  g.translate(x, y, z);
  if (!hang) g.rotateX(-Math.PI / 2);
  g.box(-0.025, -0.18, -0.02, 0.025, 0.12, 0.02, WOOD);
  g.box(-0.1, 0.12, -0.03, 0.1, 0.19, 0.03, STEEL_DARK);
  g.pop();
}

function wrench(g: GeoBuilder, x: number, y: number, z: number): void {
  g.box(x - 0.025, y - 0.2, z - 0.012, x + 0.025, y + 0.12, z + 0.012, STEEL);
  g.box(x - 0.06, y + 0.12, z - 0.012, x + 0.06, y + 0.17, z + 0.012, STEEL);
  g.box(x - 0.06, y + 0.17, z - 0.012, x - 0.03, y + 0.22, z + 0.012, STEEL);
  g.box(x + 0.03, y + 0.17, z - 0.012, x + 0.06, y + 0.22, z + 0.012, STEEL);
}

function saw(g: GeoBuilder, x: number, y: number, z: number): void {
  g.prism([[x - 0.3, z - 0.01], [x + 0.18, z - 0.01], [x + 0.18, z + 0.01], [x - 0.3, z + 0.01]], y - 0.05, y + 0.08, '#c0c7cc');
  g.box(x + 0.18, y - 0.06, z - 0.015, x + 0.32, y + 0.1, z + 0.015, '#b5651d');
}

/* ------------------------------------------------------------------ */
/* Modelos                                                             */
/* ------------------------------------------------------------------ */

const bed = (g: GeoBuilder, hx: number, hz: number, y0: number, blanket: ColorLike, frame: ColorLike, withHead: boolean): void => {
  g.box(-hx + 0.04, y0, -hz + 0.02, hx - 0.04, y0 + 0.12, hz - 0.02, frame);
  g.box(-hx + 0.08, y0 + 0.12, -hz + 0.05, hx - 0.06, y0 + 0.27, hz - 0.05, PALETTE.canvas);
  // manta (cubre 2/3 hacia los pies) con embozo
  g.box(-hx * 0.25, y0 + 0.27, -hz + 0.03, hx - 0.04, y0 + 0.31, hz - 0.03, blanket);
  g.box(-hx * 0.25 - 0.12, y0 + 0.27, -hz + 0.03, -hx * 0.25, y0 + 0.33, hz - 0.03, CLOTH_WHITE);
  g.box(-hx * 0.25, y0 + 0.02, -hz + 0.02, hx - 0.04, y0 + 0.31, -hz + 0.03, shade(blanket, 0.85));
  // almohada
  g.box(-hx + 0.12, y0 + 0.27, -hz * 0.6, -hx + 0.48, y0 + 0.38, hz * 0.6, CLOTH_WHITE);
  if (withHead) g.box(-hx - 0.02, 0, -hz, -hx + 0.06, y0 + 0.62, hz, frame);
};

const BUILDERS: Record<PropKind, Builder> = {
  cama: ({ g }, d) => {
    const { hx, hz } = d;
    legs(g, hx, hz, 0.14, 0.09, WOOD_DARK);
    bed(g, hx, hz, 0.14, BLANKETS[0]!, WOOD, true);
    // cabecero alto con remate y pie bajo
    g.box(-hx - 0.04, 0.72, -hz - 0.02, -hx + 0.08, 0.98, hz + 0.02, WOOD_DARK);
    g.box(hx - 0.06, 0, -hz, hx + 0.02, 0.6, hz, WOOD_DARK);
  },

  litera: ({ g }, d) => {
    const { hx, hz, h } = d;
    const post = 0.08;
    legs(g, hx, hz, h, post, WOOD_DARK, 0.04);
    bed(g, hx, hz, 0.22, BLANKETS[2]!, WOOD, false);
    bed(g, hx, hz, 1.22, BLANKETS[1]!, WOOD, false);
    // cabeceros entre postes
    for (const y of [0.5, 1.55]) g.box(-hx, y, -hz + 0.04, -hx + 0.06, y + 0.25, hz - 0.04, WOOD_DARK);
    g.box(hx - 0.06, 1.55, -hz + 0.04, hx, 1.8, hz - 0.04, WOOD_DARK);
    // barandilla de la cama alta
    g.box(-hx + 0.1, 1.66, -hz - 0.01, hx * 0.35, 1.72, -hz + 0.04, WOOD_DARK);
    // escalerilla en el pie, por el frente
    const lx0 = hx - 0.42;
    const lx1 = hx - 0.08;
    for (const x of [lx0, lx1]) g.box(x - 0.025, 0, -hz - 0.08, x + 0.025, h - 0.1, -hz - 0.03, WOOD_LIGHT);
    for (let k = 1; k <= 5; k++) g.box(lx0, k * 0.3, -hz - 0.075, lx1, k * 0.3 + 0.04, -hz - 0.035, WOOD_LIGHT);
  },

  mesita: ({ g, glow }, d) => {
    const { hx, hz, h } = d;
    const top = Math.min(h, 0.58);
    g.box(-hx, 0.05, -hz, hx, top - 0.03, hz, WOOD);
    g.box(-hx - 0.01, top - 0.03, -hz - 0.01, hx + 0.01, top, hz + 0.01, WOOD_DARK);
    g.box(-hx + 0.03, 0.25, -hz - 0.012, hx - 0.03, 0.47, -hz, shade(WOOD, 0.85));
    g.boxC(0, 0.36, -hz - 0.02, 0.05, 0.04, 0.03, BRASS);
    legs(g, hx, hz, 0.05, 0.05, WOOD_DARK, 0.02);
    // lámpara de aceite y libro
    g.cylinder(-0.06, top, 0.02, 0.06, 0.05, 0.05, 6, BRASS);
    glow.cylinder(-0.06, top + 0.05, 0.02, 0.045, 0.05, 0.11, 6, '#ffffff');
    g.cylinder(-0.06, top + 0.16, 0.02, 0.03, 0.02, 0.03, 6, BRASS);
    g.box(0.02, top, -0.12, 0.2, top + 0.04, 0.02, '#457b9d');
    g.box(0.03, top + 0.04, -0.1, 0.18, top + 0.065, 0.0, '#bc4749');
  },

  baul: ({ g }, d) => {
    const { hx, hz, h } = d;
    const body = h * 0.66;
    g.box(-hx, 0, -hz, hx, body, hz, WOOD);
    // tapa abombada (dos faldones)
    g.prism([[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]], body, body + 0.04, WOOD_DARK);
    g.push();
    g.translate(0, body + 0.04, 0);
    g.quadN(-hx, 0, -hz, hx, 0, -hz, hx, h - body - 0.04, -hz * 0.3, -hx, h - body - 0.04, -hz * 0.3, WOOD);
    g.quadN(-hx, h - body - 0.04, hz * 0.3, hx, h - body - 0.04, hz * 0.3, hx, 0, hz, -hx, 0, hz, WOOD);
    g.quadN(-hx, h - body - 0.04, -hz * 0.3, hx, h - body - 0.04, -hz * 0.3, hx, h - body - 0.04, hz * 0.3, -hx, h - body - 0.04, hz * 0.3, shade(WOOD, 1.08));
    g.quadN(-hx, 0, hz, -hx, 0, -hz, -hx, h - body - 0.04, -hz * 0.3, -hx, h - body - 0.04, hz * 0.3, WOOD_DARK);
    g.quadN(hx, 0, -hz, hx, 0, hz, hx, h - body - 0.04, hz * 0.3, hx, h - body - 0.04, -hz * 0.3, WOOD_DARK);
    g.pop();
    // flejes y cerradura
    for (const x of [-hx * 0.6, hx * 0.6]) g.box(x - 0.04, 0, -hz - 0.012, x + 0.04, body + 0.04, hz + 0.012, STEEL_DARK);
    g.box(-0.07, body - 0.14, -hz - 0.025, 0.07, body + 0.02, -hz, BRASS);
  },

  armario: ({ g }, d) => {
    const { hx, hz, h } = d;
    g.box(-hx, 0.08, -hz, hx, h - 0.1, hz, WOOD);
    g.box(-hx - 0.03, h - 0.1, -hz - 0.04, hx + 0.03, h, hz + 0.02, WOOD_DARK);
    g.box(-hx, 0, -hz + 0.02, hx, 0.08, hz, WOOD_DARK);
    // dos puertas con cuarterones
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -hx + 0.04 : 0.015;
      const x1 = s < 0 ? -0.015 : hx - 0.04;
      g.box(x0, 0.14, -hz - 0.015, x1, h - 0.16, -hz, shade(WOOD, 0.9));
      g.box(x0 + 0.06, 0.3, -hz - 0.025, x1 - 0.06, h * 0.5, -hz - 0.015, shade(WOOD, 0.8));
      g.box(x0 + 0.06, h * 0.55, -hz - 0.025, x1 - 0.06, h - 0.3, -hz - 0.015, shade(WOOD, 0.8));
      g.boxC(s * 0.06, h * 0.52, -hz - 0.04, 0.03, 0.12, 0.03, BRASS);
    }
    // una maleta encima
    g.box(-hx * 0.6, h, -hz * 0.7, hx * 0.3, h + 0.2, hz * 0.7, '#7f5539');
  },

  alfombra: ({ g }, d) => {
    const hx = d.hx > 0.45 ? d.hx : 0.95;
    const hz = d.hz > 0.45 ? d.hz : 0.65;
    const y = 0.012;
    g.box(-hx, 0, -hz, hx, y, hz, '#9b2f2f', { ny: true });
    g.box(-hx + 0.12, y, -hz + 0.12, hx - 0.12, y + 0.004, hz - 0.12, '#e0a458', { ny: true });
    g.box(-hx + 0.2, y + 0.004, -hz + 0.2, hx - 0.2, y + 0.008, hz - 0.2, '#b23a3a', { ny: true });
    for (let i = -2; i <= 2; i++) g.box(i * 0.3 - 0.05, y + 0.008, -hz + 0.28, i * 0.3 + 0.05, y + 0.011, hz - 0.28, '#2a9d8f', { ny: true });
    // flecos
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
      const z = -hz + 0.1 + (k / 6) * (2 * hz - 0.2);
      g.box(s * hx - 0.06 * (s < 0 ? 1 : 0), 0, z - 0.012, s * hx + 0.06 * (s > 0 ? 1 : 0), 0.006, z + 0.012, '#f3ead6', { ny: true });
    }
  },

  fogon: ({ g, anchors }, d) => {
    const { hx, hz } = d;
    const top = 0.9;
    legs(g, hx, hz, 0.12, 0.08, IRON);
    g.box(-hx, 0.12, -hz, hx, top, hz, IRON);
    g.box(-hx - 0.04, top, -hz - 0.04, hx + 0.04, top + 0.06, hz + 0.02, '#23272b');
    // hornillas
    for (const x of [-hx * 0.5, hx * 0.15]) g.cylinder(x, top + 0.06, -0.02, 0.2, 0.2, 0.015, 8, '#4a4f55');
    // puerta del hogar (izquierda) con rejilla y puerta del horno (derecha)
    const fx = -hx * 0.48;
    g.box(fx - 0.28, 0.28, -hz - 0.02, fx + 0.28, 0.66, -hz, '#2b2f33');
    for (let k = 0; k < 4; k++) g.box(fx - 0.22 + k * 0.13, 0.33, -hz - 0.035, fx - 0.17 + k * 0.13, 0.42, -hz - 0.02, '#16181a');
    g.box(hx * 0.12, 0.24, -hz - 0.02, hx - 0.08, 0.74, -hz, '#2b2f33');
    g.box(hx * 0.12 + 0.05, 0.77, -hz - 0.06, hx - 0.13, 0.8, -hz - 0.03, BRASS);
    // barra de trapos y utensilios
    g.box(-hx, top - 0.06, -hz - 0.1, hx, top - 0.03, -hz - 0.07, BRASS);
    g.box(-0.1, top - 0.32, -hz - 0.11, 0.12, top - 0.05, -hz - 0.09, '#e9c46a');
    // olla y tetera
    g.cylinder(-hx * 0.5, top + 0.075, -0.02, 0.19, 0.2, 0.24, 8, '#5c6770');
    g.cylinder(-hx * 0.5, top + 0.315, -0.02, 0.2, 0.2, 0.02, 8, '#6c757d');
    g.boxC(-hx * 0.5, top + 0.36, -0.02, 0.07, 0.03, 0.03, IRON);
    g.cylinder(hx * 0.15, top + 0.075, -0.02, 0.12, 0.1, 0.16, 7, '#c8553d');
    g.cylinderBetween(hx * 0.15 + 0.1, top + 0.15, -0.02, hx * 0.15 + 0.22, top + 0.22, -0.02, 0.018, 4, '#c8553d');
    // tubo de humos hasta el techo
    const px = hx - 0.22;
    const pz = hz - 0.12;
    g.cylinder(px, top + 0.06, pz, 0.1, 0.1, WALL_H - top - 0.06, 8, '#2b2f33');
    g.cylinder(px, top + 0.7, pz, 0.12, 0.12, 0.05, 8, BRASS);
    anchors.firebox = new THREE.Vector3(fx, 0.47, -hz - 0.04);
    anchors.pot = new THREE.Vector3(-hx * 0.5, top + 0.36, -0.02);
    anchors.kettle = new THREE.Vector3(hx * 0.15 + 0.24, top + 0.24, -0.02);
  },

  despensa: ({ g, contents, tiers }, d) => {
    const { hx, hz, h } = d;
    const shelves = [0.08, 0.55, 1.02, 1.49, 1.95];
    g.box(-hx, 0, -hz, -hx + 0.05, h, hz, WOOD);
    g.box(hx - 0.05, 0, -hz, hx, h, hz, WOOD);
    g.box(-hx, 0, hz - 0.03, hx, h, hz, shade(WOOD, 0.8));
    for (const y of shelves) g.box(-hx + 0.05, y - 0.03, -hz, hx - 0.05, y, hz - 0.03, WOOD_LIGHT);
    g.box(-hx - 0.02, h - 0.02, -hz - 0.02, hx + 0.02, h + 0.05, hz, WOOD_DARK);
    // contenido escalonado: tarros, latas, sacos, botellas
    const items: (() => void)[] = [];
    const jarCols = ['#e9c46a', '#f4a261', '#90be6d', '#bc4749', '#f1ece0'];
    for (let s = 0; s < 4; s++) {
      const y = shelves[s]!;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const x = -hx + 0.16 + (i / (n - 1)) * (2 * hx - 0.32);
        const k = s * 10 + i;
        items.push(() => {
          if (s === 0) sack(contents, x, y, -0.02, 0.26, i % 2 ? '#b89b6a' : '#a3875a');
          else if (s === 3) bottle(contents, x, y, -0.04, 0.32, i % 2 ? '#3d7a5a' : '#7a3d3d');
          else if ((k + s) % 3 === 0) can(contents, x, y, -0.05, 0.07, 0.16, i % 2 ? '#c8553d' : '#2a9d8f');
          else jar(contents, x, y, -0.04, 0.08, 0.2, jarCols[k % jarCols.length]!);
        });
      }
    }
    fillTiers(contents, tiers, items);
  },

  mesa: ({ g }, d) => {
    const { hx, hz, h } = d;
    const top = h;
    g.box(-hx, top - 0.06, -hz, hx, top, hz, WOOD_LIGHT);
    g.box(-hx + 0.06, top - 0.16, -hz + 0.06, hx - 0.06, top - 0.06, hz - 0.06, WOOD);
    legs(g, hx, hz, top - 0.06, 0.09, WOOD_DARK, 0.1);
    // camino de mesa, jarra y vasos
    g.box(-hx * 0.7, top, -0.16, hx * 0.7, top + 0.006, 0.16, '#e9c46a');
    g.cylinder(0, top, 0, 0.08, 0.07, 0.2, 7, '#3d7a8a');
    g.cylinderBetween(0.07, top + 0.16, 0, 0.12, top + 0.08, 0, 0.015, 4, '#3d7a8a');
    for (const [x, z] of [[-hx * 0.45, -hz * 0.4], [hx * 0.45, hz * 0.4]] as const) g.cylinder(x, top, z, 0.04, 0.035, 0.1, 6, CLOTH_WHITE);
  },

  silla: ({ g }) => {
    const hx = 0.22;
    const hz = 0.22;
    const seat = 0.45;
    legs(g, hx, hz, seat - 0.04, 0.05, WOOD_DARK, 0.03);
    g.box(-hx, seat - 0.05, -hz, hx, seat, hz, WOOD);
    // respaldo en +z (quien se sienta mira a -z)
    for (const x of [-hx + 0.03, hx - 0.03]) g.box(x - 0.025, seat, hz - 0.05, x + 0.025, seat + 0.5, hz - 0.0, WOOD_DARK);
    g.box(-hx, seat + 0.36, hz - 0.05, hx, seat + 0.5, hz - 0.01, WOOD);
    g.box(-hx + 0.05, seat + 0.16, hz - 0.045, hx - 0.05, seat + 0.24, hz - 0.015, WOOD);
    // cojín
    g.box(-hx + 0.03, seat, -hz + 0.03, hx - 0.03, seat + 0.04, hz - 0.06, '#bc4749');
  },

  estanteria: ({ g, contents, tiers }, d) => {
    const { hx, hz, h } = d;
    const shelves = [0.12, 0.66, 1.2, 1.74];
    const post = 0.06;
    for (const x of [-hx + post / 2, 0, hx - post / 2])
      for (const z of [-hz + post / 2, hz - post / 2]) g.box(x - post / 2, 0, z - post / 2, x + post / 2, h - 0.05, z + post / 2, STEEL_DARK);
    for (const y of shelves) g.box(-hx, y - 0.04, -hz, hx, y, hz, WOOD_LIGHT);
    g.box(-hx, h - 0.08, -hz, hx, h - 0.04, hz, WOOD_LIGHT);
    // tirantes en X por detrás
    g.cylinderBetween(-hx + 0.05, 0.15, hz - 0.03, -0.05, h - 0.15, hz - 0.03, 0.012, 4, STEEL_DARK);
    g.cylinderBetween(-0.05, 0.15, hz - 0.03, -hx + 0.05, h - 0.15, hz - 0.03, 0.012, 4, STEEL_DARK);
    // contenido escalonado
    const items: (() => void)[] = [];
    const avail = [...shelves, h - 0.04];
    for (let s = 0; s < 4; s++) {
      const y = avail[s]!;
      const span = 2 * hx - 0.12;
      const n = Math.max(2, Math.floor(span / 0.42));
      for (let i = 0; i < n; i++) {
        const x = -hx + 0.06 + ((i + 0.5) / n) * span;
        const k = hash01(s, i, hx);
        items.push(() => {
          const sz = Math.min(0.42, 2 * hz - 0.08);
          if (k < 0.45) crate(contents, x, y, -0.01, Math.min(0.38, span / n - 0.04), 0.3 + k * 0.1, sz, k < 0.2 ? WOOD_LIGHT : '#b8895a', (k - 0.2) * 0.3);
          else if (k < 0.65) sack(contents, x, y, 0, 0.3);
          else if (k < 0.82) {
            contents.cylinder(x, y, 0, 0.14, 0.14, 0.38, 8, k < 0.73 ? '#3d5a80' : '#c8553d');
            contents.cylinder(x, y + 0.38, 0, 0.05, 0.05, 0.04, 6, '#22262a');
          } else {
            // rollo de cuerda y tablones
            contents.cylinder(x, y, 0, 0.16, 0.16, 0.12, 9, PALETTE.rope);
            contents.box(x - 0.18, y + 0.12, -0.12, x + 0.18, y + 0.17, 0.12, WOOD);
          }
        });
      }
    }
    fillTiers(contents, tiers, items);
  },

  cajas: ({ g }, d) => {
    const { hx, hz, h } = d;
    const s = Math.min(hx, hz) * 2;
    crate(g, -hx * 0.08, 0, 0, s, h * 0.5, s, WOOD_LIGHT, 0.05);
    crate(g, hx * 0.05, h * 0.5, -0.02, s * 0.85, h * 0.45, s * 0.85, '#b8895a', -0.2);
    g.box(-hx * 0.4, h * 0.95, -hz * 0.35, hx * 0.4, h * 0.95 + 0.04, hz * 0.35, PALETTE.canvas);
  },

  banco: ({ g }, d) => {
    const { hx, hz, h } = d;
    g.box(-hx, h - 0.09, -hz, hx, h, hz, WOOD_LIGHT);
    g.box(-hx, h - 0.09, -hz - 0.01, hx, h - 0.03, -hz, shade(WOOD_LIGHT, 0.8));
    legs(g, hx, hz, h - 0.09, 0.1, WOOD_DARK, 0.06);
    g.box(-hx + 0.08, 0.2, -hz + 0.08, hx - 0.08, 0.25, hz - 0.08, WOOD);
    // tablones y caja de clavos en la balda
    g.box(-hx + 0.15, 0.25, -hz + 0.12, hx - 0.3, 0.3, -hz + 0.32, WOOD_LIGHT);
    g.box(-hx + 0.15, 0.3, -hz + 0.14, hx - 0.4, 0.35, -hz + 0.3, '#b8895a');
    crate(g, hx - 0.28, 0.25, 0.1, 0.3, 0.22, 0.3, '#b8895a');
    // tornillo de banco
    g.box(hx - 0.32, h, -hz - 0.04, hx - 0.06, h + 0.14, -hz + 0.12, '#3d7a8a');
    g.box(hx - 0.3, h - 0.12, -hz - 0.12, hx - 0.08, h + 0.12, -hz - 0.04, '#3d7a8a');
    g.cylinderZ(hx - 0.19, h - 0.02, -hz - 0.22, 0.015, 0.22, 4, STEEL);
    // herramientas sobre el banco
    hammer(g, -hx * 0.5, h + 0.02, -0.05, false);
    saw(g, hx * 0.1, h + 0.01, 0.1);
    g.box(-hx * 0.15, h, -hz + 0.12, hx * 0.25, h + 0.05, -hz + 0.28, WOOD);
    g.box(-hx * 0.9, h, 0.15, -hx * 0.6, h + 0.1, 0.35, '#8a9399');
    // virutas
    for (let k = 0; k < 5; k++) g.boxC(hx * 0.3 + k * 0.06, h + 0.008, -0.15 + (k % 2) * 0.05, 0.05, 0.016, 0.02, '#e8cf9c');
  },

  herramientas: ({ g }, d) => {
    const { hx, hz, h } = d;
    const zb = hz;
    // mueble bajo con cajones
    g.box(-hx, 0, zb - 0.45, hx, 0.85, zb, shade(WOOD, 0.95));
    g.box(-hx - 0.02, 0.85, zb - 0.48, hx + 0.02, 0.9, zb, WOOD_DARK);
    for (let k = 0; k < 3; k++) {
      g.box(-hx + 0.06, 0.08 + k * 0.26, zb - 0.465, hx - 0.06, 0.3 + k * 0.26, zb - 0.45, shade(WOOD, 0.8));
      g.boxC(0, 0.19 + k * 0.26, zb - 0.48, 0.18, 0.03, 0.03, STEEL);
    }
    // tablero perforado
    const bz = zb - 0.06;
    g.box(-hx, 0.95, bz, hx, h, zb, '#c9a36b');
    g.box(-hx - 0.03, h - 0.04, bz - 0.02, hx + 0.03, h, zb, WOOD_DARK);
    g.box(-hx - 0.03, 0.92, bz - 0.02, -hx, h, zb, WOOD_DARK);
    g.box(hx, 0.92, bz - 0.02, hx + 0.03, h, zb, WOOD_DARK);
    // siluetas de herramientas colgadas
    const zf = bz - 0.02;
    hammer(g, -hx * 0.75, 1.35, zf, true);
    wrench(g, -hx * 0.45, 1.4, zf);
    saw(g, 0.0, 1.55, zf);
    g.box(hx * 0.45 - 0.015, 1.15, zf - 0.015, hx * 0.45 + 0.015, 1.45, zf + 0.01, '#e0a458');
    g.box(hx * 0.45 - 0.03, 1.45, zf - 0.02, hx * 0.45 + 0.03, 1.6, zf + 0.01, '#bc4749');
    g.push();
    g.translate(hx * 0.75, 1.42, zf);
    g.ring(0, 0, 0, 0.13, 0.035, 8, PALETTE.rope, 4);
    g.pop();
    g.box(-hx * 0.2, 1.05, zf - 0.08, hx * 0.2, 1.08, zf, WOOD_DARK);
    for (let k = 0; k < 4; k++) can(g, -hx * 0.15 + k * 0.1, 1.08, zf - 0.04, 0.035, 0.09, ['#c8553d', '#2a9d8f', '#e9c46a', '#adb5bd'][k]!);
  },

  torno: ({ g, anchors }, d) => {
    const { hx, hz } = d;
    const paint = '#4f7f72';
    const paintDark = '#3b5f55';
    // dos pies tipo armario
    g.box(-hx + 0.05, 0, -hz + 0.1, -hx + 0.5, 0.78, hz - 0.08, paintDark);
    g.box(hx - 0.45, 0, -hz + 0.1, hx - 0.05, 0.78, hz - 0.08, paintDark);
    g.box(-hx, 0.78, -hz + 0.02, hx, 0.84, hz, IRON);
    // bancada
    g.box(-hx + 0.1, 0.84, -0.2, hx - 0.05, 0.96, 0.2, paint);
    g.box(-hx + 0.1, 0.96, -0.16, hx - 0.05, 0.99, -0.1, STEEL);
    g.box(-hx + 0.1, 0.96, 0.1, hx - 0.05, 0.99, 0.16, STEEL);
    // cabezal
    g.box(-hx + 0.05, 0.84, -0.28, -hx + 0.48, 1.32, 0.3, paint);
    g.box(-hx + 0.1, 1.32, -0.22, -hx + 0.42, 1.36, 0.24, paintDark);
    g.cylinderX(-hx + 0.56, 1.1, 0, 0.12, 0.16, 8, STEEL);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.boxC(-hx + 0.6, 1.1 + Math.sin(a) * 0.11, Math.cos(a) * 0.11, 0.06, 0.04, 0.04, STEEL_DARK);
    }
    // pieza trabajándose y contrapunto
    g.cylinderX(-hx + 0.95, 1.1, 0, 0.05, 0.62, 8, BRASS);
    g.box(hx - 0.42, 0.99, -0.16, hx - 0.12, 1.22, 0.16, paint);
    g.cylinderX(hx - 0.48, 1.1, 0, 0.04, 0.14, 6, STEEL);
    g.cylinderX(hx - 0.05, 1.1, 0, 0.012, 0.18, 4, STEEL);
    g.ring(hx + 0.02, 1.1, 0, 0.06, 0.012, 8, STEEL_DARK, 3);
    // carro
    g.box(-0.1, 0.99, -0.26, 0.18, 1.06, 0.18, paintDark);
    g.box(0.0, 1.06, -0.14, 0.12, 1.14, -0.02, STEEL_DARK);
    g.box(-0.06, 1.0, -0.36, 0.02, 1.08, -0.26, STEEL);
    // bandeja de virutas
    g.box(-hx + 0.5, 0.84, -hz + 0.02, hx - 0.45, 0.88, -0.2, '#2b2f33');
    // caja de mando con LED
    g.box(-hx + 0.08, 0.95, -hz - 0.02, -hx + 0.32, 1.18, -hz + 0.12, '#e0a458');
    g.boxC(-hx + 0.25, 1.02, -hz - 0.03, 0.05, 0.05, 0.02, '#bc4749');
    anchors.led = new THREE.Vector3(-hx + 0.15, 1.12, -hz - 0.035);
  },

  prensa: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    const paint = '#e0a458';
    g.box(-hx, 0, -hz, hx, 0.14, hz, IRON);
    for (const x of [-hx + 0.12, hx - 0.12]) g.cylinder(x, 0.14, 0, 0.07, 0.07, h - 0.3, 8, STEEL);
    g.box(-hx, h - 0.2, -hz * 0.6, hx, h, hz * 0.6, paint);
    g.box(-hx + 0.22, 0.6, -hz * 0.65, hx - 0.22, 0.78, hz * 0.65, paint);
    g.box(-hx * 0.5, 0.78, -hz * 0.55, hx * 0.5, 0.82, hz * 0.55, STEEL_DARK);
    // pisón y husillo con volante
    g.box(-0.18, 1.0, -0.18, 0.18, 1.18, 0.18, STEEL_DARK);
    g.cylinder(0, 1.18, 0, 0.05, 0.05, h - 1.18 + 0.15, 6, STEEL);
    g.push();
    g.translate(0, h + 0.18, 0);
    g.rotateX(Math.PI / 2);
    g.ring(0, 0, 0, 0.32, 0.03, 10, '#bc4749', 4);
    g.pop();
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      g.cylinderBetween(0, h + 0.18, 0, Math.cos(a) * 0.32, h + 0.18, Math.sin(a) * 0.32, 0.02, 4, STEEL);
    }
    // chapas apiladas al pie
    g.box(-hx + 0.05, 0.14, -hz + 0.02, -hx + 0.45, 0.24, -hz + 0.35, '#9fb3c1');
    anchors.led = new THREE.Vector3(hx - 0.05, 0.7, -hz * 0.65 - 0.01);
  },

  bancal: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    const t = 0.09;
    const wc = WOOD;
    g.box(-hx, 0, -hz, hx, h, -hz + t, wc);
    g.box(-hx, 0, hz - t, hx, h, hz, wc);
    g.box(-hx, 0, -hz + t, -hx + t, h, hz - t, wc);
    g.box(hx - t, 0, -hz + t, hx, h, hz - t, wc);
    // tablas horizontales marcadas
    for (const y of [h * 0.33, h * 0.66]) {
      g.box(-hx - 0.005, y - 0.01, -hz - 0.005, hx + 0.005, y + 0.01, -hz + 0.01, WOOD_DARK);
      g.box(-hx - 0.005, y - 0.01, hz - 0.01, hx + 0.005, y + 0.01, hz + 0.005, WOOD_DARK);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * hx - 0.06, 0, sz * hz - 0.06, sx * hx + 0.06, h + 0.05, sz * hz + 0.06, WOOD_DARK);
    g.box(-hx + t, h - 0.1, -hz + t, hx - t, h - 0.07, hz - t, PALETTE.soil);
    // surcos
    for (let k = -2; k <= 2; k++) g.box(-hx + t + 0.05, h - 0.07, k * 0.4 - 0.05, hx - t - 0.05, h - 0.05, k * 0.4 + 0.05, shade(PALETTE.soil, 1.15), { ny: true });
    // estaca con cartel
    g.box(hx - 0.2, h, -hz + 0.12, hx - 0.17, h + 0.3, -hz + 0.15, WOOD_LIGHT);
    g.box(hx - 0.3, h + 0.2, -hz + 0.1, hx - 0.07, h + 0.32, -hz + 0.12, '#f3ead6');
    anchors.soil = new THREE.Vector3(0, h - 0.07, 0);
    anchors.size = new THREE.Vector3(hx - t, 0, hz - t);
  },

  colector: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    const post = 0.07;
    const topY = h - 0.1;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (hx - 0.05) - post / 2, 0, sz * (hz - 0.05) - post / 2, sx * (hx - 0.05) + post / 2, h, sz * (hz - 0.05) + post / 2, WOOD);
    // lona en embudo: pirámide invertida desde las esquinas al sumidero
    const sumpY = topY - 0.7;
    const r = 0.1;
    const corners: [number, number][] = [
      [-hx, -hz],
      [hx, -hz],
      [hx, hz],
      [-hx, hz],
    ];
    const sump: [number, number][] = [
      [-r, -r],
      [r, -r],
      [r, r],
      [-r, r],
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i]!;
      const b = corners[(i + 1) % 4]!;
      const sa = sump[i]!;
      const sb = sump[(i + 1) % 4]!;
      // cara superior (visible desde arriba) y su reverso
      const ca = i % 2 ? PALETTE.canvas : shade(PALETTE.canvas, 0.94);
      g.quadN(a[0], topY, a[1], sa[0], sumpY, sa[1], sb[0], sumpY, sb[1], b[0], topY, b[1], ca);
      g.quadN(b[0], topY, b[1], sb[0], sumpY, sb[1], sa[0], sumpY, sa[1], a[0], topY, a[1], shade(PALETTE.canvas, 0.75));
      // vaina de la lona (borde)
      g.cylinderBetween(a[0], topY, a[1], b[0], topY, b[1], 0.03, 4, shade(PALETTE.canvas, 0.85));
    }
    // cabos de las esquinas a los postes
    for (const [x, z] of corners) g.cylinderBetween(x, topY, z, x * 0.95, h, z * 0.95, 0.015, 4, PALETTE.rope);
    anchors.sump = new THREE.Vector3(0, sumpY + 0.02, 0);
    anchors.barrelTop = new THREE.Vector3(0.18, 0.96, 0.12);
    // bajante y bidón colector
    g.cylinder(0, 0.95, 0, 0.06, 0.06, sumpY - 0.95, 6, STEEL_DARK);
    g.cylinder(0, 0, 0, 0.4, 0.42, 0.95, 10, '#3d5a80');
    g.cylinder(0, 0.3, 0, 0.43, 0.43, 0.05, 10, '#2f4858', { capTop: false, capBottom: false });
    g.cylinder(0, 0.7, 0, 0.42, 0.42, 0.05, 10, '#2f4858', { capTop: false, capBottom: false });
    g.cylinderBetween(0.35, 0.15, 0, hx - 0.05, 0.05, 0, 0.04, 5, STEEL_DARK);
  },

  deposito: ({ g, anchors }, d) => {
    const { hx, h } = d;
    const r = Math.min(hx, d.hz) - 0.08;
    const tankC = '#8fa9b8';
    g.cylinder(0, 0, 0, r + 0.05, r + 0.05, 0.18, 10, IRON);
    g.cylinder(0, 0.18, 0, r, r, h - 0.55, 10, tankC, { phase: Math.PI / 10 });
    g.cylinder(0, h - 0.37, 0, r, r * 0.55, 0.3, 10, shade(tankC, 1.06), { phase: Math.PI / 10 });
    g.cylinder(0, h - 0.07, 0, 0.26, 0.26, 0.07, 8, STEEL_DARK);
    for (const y of [0.45, 1.05, 1.65]) g.cylinder(0, y, 0, r + 0.025, r + 0.025, 0.07, 10, STEEL_DARK, { phase: Math.PI / 10 });
    // escalerilla lateral (+x)
    for (const z of [-0.18, 0.18]) g.box(r + 0.05, 0.18, z - 0.02, r + 0.09, h - 0.2, z + 0.02, STEEL_DARK);
    for (let y = 0.4; y < h - 0.3; y += 0.3) g.box(r + 0.05, y, -0.18, r + 0.09, y + 0.03, 0.18, STEEL);
    // indicador de nivel (tubo de cristal con marco) en el frente
    const gz = -r - 0.07;
    g.box(-0.1, 0.3, gz - 0.03, -0.06, 2.0, gz + 0.06, BRASS);
    g.box(0.06, 0.3, gz - 0.03, 0.1, 2.0, gz + 0.06, BRASS);
    g.box(-0.1, 0.26, gz - 0.03, 0.1, 0.32, gz + 0.06, BRASS);
    g.box(-0.1, 1.98, gz - 0.03, 0.1, 2.04, gz + 0.06, BRASS);
    for (let k = 1; k < 5; k++) g.box(0.1, 0.32 + k * 0.336, gz - 0.035, 0.15, 0.33 + k * 0.336, gz + 0.0, '#2b2d42');
    // grifo
    g.cylinderZ(0.4, 0.45, -r - 0.08, 0.05, 0.2, 6, BRASS);
    g.cylinder(0.4, 0.36, -r - 0.17, 0.035, 0.035, 0.1, 6, BRASS);
    g.box(0.36, 0.53, -r - 0.12, 0.44, 0.57, -r - 0.04, '#bc4749');
    // tubería hacia el techo
    g.cylinder(-0.45, h - 0.2, 0.3, 0.06, 0.06, WALL_H - h + 0.2, 6, STEEL);
    g.cylinderBetween(-0.45, h - 0.2, 0.3, -0.2, h - 0.12, 0.1, 0.06, 6, STEEL);
    // placa
    g.box(-0.35, 1.2, gz + 0.02, -0.15, 1.36, gz + 0.04, '#f3ead6');
    anchors.gaugeBottom = new THREE.Vector3(0, 0.33, gz + 0.015);
    anchors.gaugeTop = new THREE.Vector3(0, 1.97, gz + 0.015);
    anchors.tap = new THREE.Vector3(0.4, 0.34, -r - 0.17);
    anchors.leak = new THREE.Vector3(r * 0.7, 0.6, -r * 0.7);
  },

  potabilizadora: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    g.box(-hx, 0, -hz, hx, 0.1, hz, IRON);
    // armario de control
    g.box(0.0, 0.1, -hz + 0.25, hx - 0.03, h - 0.05, hz - 0.05, '#dfe6e9');
    g.box(0.05, 0.4, -hz + 0.23, hx - 0.08, h - 0.15, -hz + 0.25, shade('#dfe6e9', 0.9));
    g.boxC(hx * 0.5, h - 0.4, -hz + 0.22, 0.24, 0.16, 0.02, '#2b2d42');
    // manómetro
    g.push();
    g.translate(hx * 0.25, h - 0.7, -hz + 0.22);
    g.disc(0, 0, 0, 0.09, 10, '#f3ead6', true);
    g.ring(0, 0, 0, 0.09, 0.015, 10, BRASS, 3);
    g.pop();
    g.box(hx * 0.25 - 0.005, h - 0.7, -hz + 0.205, hx * 0.25 + 0.06, h - 0.69, -hz + 0.2, '#bc4749');
    // filtros
    for (let k = 0; k < 3; k++) {
      const x = -hx + 0.2 + k * 0.28;
      g.cylinder(x, 0.1, -hz + 0.25, 0.12, 0.12, 1.05, 8, k === 1 ? '#3d5a80' : '#4cc9f0');
      g.cylinder(x, 1.15, -hz + 0.25, 0.13, 0.1, 0.1, 8, STEEL_DARK);
      g.cylinder(x, 1.25, -hz + 0.25, 0.03, 0.03, 0.12, 6, STEEL);
    }
    g.cylinderX(-hx + 0.48, 1.37, -hz + 0.25, 0.04, 0.68, 6, STEEL);
    g.cylinderBetween(-0.1, 1.37, -hz + 0.25, 0.05, 1.37, -hz + 0.25, 0.04, 6, STEEL);
    // bomba y motor
    g.cylinderX(-hx * 0.45, 0.32, hz * 0.45, 0.17, 0.55, 8, '#457b9d');
    g.cylinderX(-hx * 0.45 - 0.4, 0.32, hz * 0.45, 0.12, 0.25, 8, STEEL_DARK);
    g.cylinderBetween(-hx + 0.2, 0.32, hz * 0.45, -hx + 0.2, 0.1, hz * 0.45, 0.05, 6, STEEL);
    anchors.led = new THREE.Vector3(hx * 0.78, h - 0.4, -hz + 0.21);
  },

  generador: ({ g, moving, anchors }, d) => {
    const { hx, hz } = d;
    // bancada (fija)
    g.box(-hx, 0, -hz, hx, 0.1, hz, IRON);
    for (const x of [-hx + 0.15, hx - 0.15]) g.box(x - 0.08, 0.1, -hz + 0.05, x + 0.08, 0.16, hz - 0.05, '#2b2f33');
    const m = moving;
    const red = '#c8553d';
    // bloque motor
    m.box(-hx + 0.25, 0.16, -0.45, 0.25, 0.85, 0.42, red);
    for (let k = 0; k < 3; k++) m.box(-hx + 0.32 + k * 0.3, 0.85, -0.3, -hx + 0.55 + k * 0.3, 1.0, 0.3, shade(red, 0.85));
    m.box(-hx + 0.3, 1.0, -0.12, 0.2, 1.05, 0.12, STEEL_DARK);
    // radiador con rejilla
    m.box(-hx + 0.05, 0.16, -0.5, -hx + 0.25, 1.0, 0.5, '#2b2f33');
    for (let k = 0; k < 6; k++) m.box(-hx + 0.03, 0.25 + k * 0.12, -0.42, -hx + 0.05, 0.3 + k * 0.12, 0.42, STEEL);
    // alternador
    m.cylinderX(0.62, 0.55, 0, 0.38, 0.75, 10, '#457b9d');
    m.cylinderX(1.02, 0.55, 0, 0.2, 0.06, 8, STEEL_DARK);
    // depósito de combustible
    m.box(-hx + 0.4, 0.16, 0.45, 0.2, 0.62, hz - 0.05, '#e0a458');
    m.cylinder(-0.1, 0.62, 0.6, 0.06, 0.06, 0.06, 6, IRON);
    // escape con silenciador
    m.cylinder(-0.55, 1.05, 0.15, 0.06, 0.06, 0.2, 6, STEEL_DARK);
    m.cylinderX(-0.35, 1.32, 0.15, 0.12, 0.5, 8, '#6c757d');
    m.cylinder(-0.12, 1.32, 0.15, 0.05, 0.05, 0.2, 6, STEEL_DARK);
    // cuadro de mando
    m.box(0.3, 0.75, -hz + 0.05, 0.85, 1.12, -hz + 0.18, '#2b2d42');
    m.push();
    m.translate(0.45, 0.95, -hz + 0.045);
    m.disc(0, 0, 0, 0.06, 8, '#f3ead6', true);
    m.pop();
    anchors.exhaust = new THREE.Vector3(-0.12, 1.55, 0.15);
    anchors.led = new THREE.Vector3(0.7, 0.98, -hz + 0.04);
  },

  bateria: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    const shelves = [0.08, 0.55, 1.02];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (hx - 0.03) - 0.03, 0, sz * (hz - 0.03) - 0.03, sx * (hx - 0.03) + 0.03, h - 0.02, sz * (hz - 0.03) + 0.03, STEEL_DARK);
    for (const y of shelves) g.box(-hx, y - 0.04, -hz, hx, y, hz, STEEL);
    g.box(-hx, h - 0.06, -hz, hx, h - 0.02, hz, STEEL);
    for (const y of shelves) {
      const n = 4;
      for (let k = 0; k < n; k++) {
        const x = -hx + 0.1 + ((k + 0.5) / n) * (2 * hx - 0.2);
        const w = (2 * hx - 0.2) / n - 0.06;
        g.box(x - w / 2, y, -hz + 0.08, x + w / 2, y + 0.34, hz - 0.08, '#2b2d42');
        g.box(x - w / 2, y + 0.34, -hz + 0.08, x + w / 2, y + 0.37, hz - 0.08, '#3a3f44');
        g.boxC(x - w * 0.25, y + 0.4, -hz + 0.2, 0.05, 0.05, 0.05, '#bc4749');
        g.boxC(x + w * 0.25, y + 0.4, -hz + 0.2, 0.05, 0.05, 0.05, '#22262a');
        g.box(x - w / 2 + 0.02, y + 0.12, -hz + 0.075, x + w / 2 - 0.02, y + 0.2, -hz + 0.08, '#e9c46a');
      }
      g.cylinderX(0, y + 0.43, -hz + 0.2, 0.015, 2 * hx - 0.2, 4, '#bc4749');
    }
    // cuadro con barra de carga (se ilumina por tramos según la carga)
    g.box(-0.25, h - 0.42, -hz - 0.06, 0.25, h - 0.12, -hz + 0.02, '#2b2d42');
    anchors.gauge = new THREE.Vector3(-0.2, h - 0.27, -hz - 0.065);
    anchors.led = new THREE.Vector3(0.19, h - 0.2, -hz - 0.065);
  },

  panel_solar: ({ g, anchors }, d) => {
    const { hx, hz, h } = d;
    const tilt = 0.42;
    const yC = h * 0.62;
    // patas en A
    for (const x of [-hx + 0.25, hx - 0.25]) {
      g.cylinderBetween(x, 0, -hz + 0.25, x, yC - 0.25, -0.1, 0.04, 5, STEEL);
      g.cylinderBetween(x, 0, hz - 0.2, x, yC + 0.2, 0.25, 0.04, 5, STEEL);
      g.box(x - 0.06, 0, -hz + 0.15, x + 0.06, 0.04, hz - 0.1, STEEL_DARK);
    }
    g.push();
    g.translate(0, yC, 0.05);
    g.rotateX(-tilt);
    const pw = hx;
    const pd = hz - 0.05;
    g.box(-pw, -0.05, -pd, pw, 0.0, pd, '#c0c7cc');
    g.box(-pw + 0.03, 0.0, -pd + 0.03, pw - 0.03, 0.012, pd - 0.03, '#23395b');
    const nx = 6;
    const nz = 4;
    for (let i = 1; i < nx; i++) {
      const x = -pw + 0.03 + (i / nx) * (2 * pw - 0.06);
      g.box(x - 0.01, 0.012, -pd + 0.03, x + 0.01, 0.016, pd - 0.03, '#9fb3c1');
    }
    for (let j = 1; j < nz; j++) {
      const z = -pd + 0.03 + (j / nz) * (2 * pd - 0.06);
      g.box(-pw + 0.03, 0.012, z - 0.01, pw - 0.03, 0.016, z + 0.01, '#9fb3c1');
    }
    g.pop();
    // inversor con LED
    g.box(hx - 0.55, 0.2, hz - 0.35, hx - 0.25, 0.55, hz - 0.2, '#dfe6e9');
    anchors.led = new THREE.Vector3(hx - 0.4, 0.47, hz - 0.355);
  },

  camilla: ({ g, glass }, d) => {
    const { hx, hz } = d;
    const top = 0.55;
    // ruedas y patas tubulares
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        g.cylinder(sx * (hx - 0.1), 0.06, sz * (hz - 0.08), 0.025, 0.025, top - 0.06, 6, '#c0c7cc');
        g.sphere(sx * (hx - 0.1), 0.05, sz * (hz - 0.08), 0.05, '#2b2d42');
      }
    g.box(-hx + 0.05, top - 0.05, -hz + 0.02, hx - 0.05, top, hz - 0.02, '#c0c7cc');
    // colchón con cabecera levantada
    g.box(-hx * 0.35, top, -hz + 0.05, hx - 0.06, top + 0.12, hz - 0.05, '#bfe0da');
    g.push();
    g.translate(-hx * 0.35, top + 0.02, 0);
    g.rotateZ(-0.45);
    g.box(-hx * 0.62, 0, -hz + 0.05, 0, 0.12, hz - 0.05, '#bfe0da');
    g.box(-hx * 0.55, 0.12, -hz * 0.55, -hx * 0.2, 0.22, hz * 0.55, CLOTH_WHITE);
    g.pop();
    g.box(-hx * 0.3, top + 0.12, -hz + 0.04, hx - 0.08, top + 0.15, hz - 0.04, CLOTH_WHITE);
    // barandilla lateral
    g.box(-hx * 0.2, top + 0.15, -hz - 0.01, hx * 0.6, top + 0.19, -hz + 0.02, '#c0c7cc');
    // gotero
    const ix = -hx + 0.05;
    const iz = hz + 0.05;
    g.cylinder(ix, 0, iz, 0.12, 0.12, 0.03, 5, '#c0c7cc');
    g.cylinder(ix, 0.03, iz, 0.018, 0.018, 1.75, 4, '#c0c7cc');
    g.box(ix - 0.12, 1.75, iz - 0.01, ix + 0.12, 1.77, iz + 0.01, '#c0c7cc');
    glass.box(ix + 0.04, 1.42, iz - 0.04, ix + 0.14, 1.68, iz + 0.04, '#ffffff');
    g.cylinderBetween(ix + 0.09, 1.42, iz, -hx * 0.4, top + 0.25, 0, 0.006, 3, '#f3ead6');
  },

  armario_medico: ({ g, glass }, d) => {
    const { hx, hz, h } = d;
    const white = '#eef3f2';
    g.box(-hx, 0.06, -hz + 0.02, hx, h, hz, white);
    g.box(-hx, 0, -hz + 0.05, hx, 0.06, hz, '#8a9399');
    // puertas bajas
    for (const s of [-1, 1]) {
      g.box(s < 0 ? -hx + 0.03 : 0.01, 0.1, -hz, s < 0 ? -0.01 : hx - 0.03, 0.9, -hz + 0.02, shade(white, 0.93));
      g.boxC(s * 0.06, 0.8, -hz - 0.01, 0.025, 0.1, 0.02, '#8a9399');
    }
    // vitrina con baldas y frascos
    const y0 = 0.98;
    const y1 = h - 0.15;
    g.box(-hx + 0.03, y0, -hz + 0.04, hx - 0.03, y1, -hz + 0.05, shade(white, 0.85));
    for (const y of [y0 + 0.02, (y0 + y1) / 2]) {
      g.box(-hx + 0.04, y, -hz + 0.05, hx - 0.04, y + 0.02, hz - 0.03, '#c0c7cc');
      for (let k = 0; k < 4; k++) bottle(g, -hx + 0.14 + k * ((2 * hx - 0.28) / 3), y + 0.02, -hz + 0.2, 0.22, ['#e63946', '#f4a261', '#90be6d', '#4cc9f0'][k]!);
    }
    // marcos de las puertas de cristal
    g.box(-hx + 0.02, y0 - 0.03, -hz - 0.01, hx - 0.02, y0, -hz + 0.02, white);
    g.box(-hx + 0.02, y1, -hz - 0.01, hx - 0.02, y1 + 0.03, -hz + 0.02, white);
    g.box(-0.015, y0, -hz - 0.01, 0.015, y1, -hz + 0.02, white);
    glass.quadN(hx - 0.02, y0, -hz + 0.005, -hx + 0.02, y0, -hz + 0.005, -hx + 0.02, y1, -hz + 0.005, hx - 0.02, y1, -hz + 0.005, '#ffffff');
    // cruz roja
    g.box(-0.05, h - 0.13, -hz - 0.012, 0.05, h - 0.02, -hz + 0.02, '#e63946');
    g.box(-0.1, h - 0.1, -hz - 0.012, 0.1, h - 0.05, -hz + 0.02, '#e63946');
    // botiquín encima
    g.box(-0.2, h, -0.1, 0.2, h + 0.15, 0.15, '#e63946');
    g.box(-0.05, h + 0.15, -0.0, 0.05, h + 0.155, 0.05, white);
  },

  timon: ({ g, glass, moving, anchors }, d) => {
    const { hx, hz } = d;
    // pedestal de madera
    g.frustum(0, 0, 0.05, hx * 1.5, hz * 1.6, hx * 1.1, hz * 1.1, 0.95, WOOD);
    g.box(-hx * 0.6, 0.95, -hz * 0.6 + 0.05, hx * 0.6, 1.0, hz * 0.6 + 0.05, WOOD_DARK);
    g.box(-hx * 0.75, 0, -hz * 0.85 + 0.05, hx * 0.75, 0.06, hz * 0.85 + 0.05, WOOD_DARK);
    // bitácora (compás) con cúpula
    g.cylinder(0, 1.0, 0.12, 0.17, 0.17, 0.12, 8, BRASS);
    glass.sphere(0, 1.14, 0.12, 0.14, '#ffffff', 0, 0.6);
    g.ring(0, 1.08, 0.12, 0.17, 0.02, 8, BRASS, 3);
    // telégrafo de órdenes
    g.cylinder(hx * 0.62, 0.95, 0.15, 0.06, 0.06, 0.25, 6, BRASS);
    g.push();
    g.translate(hx * 0.62, 1.28, 0.15);
    g.disc(0, 0, -0.06, 0.12, 10, '#f3ead6', true);
    g.ring(0, 0, -0.06, 0.12, 0.025, 10, BRASS, 3);
    g.pop();
    // eje del timón
    const wy = 0.98;
    const wz = -hz * 0.6;
    g.cylinderZ(0, wy, wz + 0.06, 0.05, 0.22, 6, BRASS);
    // rueda (parte móvil: gira levemente con el oleaje)
    const m = moving;
    m.ring(0, 0, 0, 0.42, 0.035, 14, WOOD_DARK, 4);
    m.cylinderZ(0, 0, 0, 0.08, 0.1, 8, BRASS);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      m.cylinderBetween(Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0, Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0, 0.022, 4, WOOD);
      m.cylinderBetween(Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0, Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0, 0.03, 5, WOOD_LIGHT);
    }
    anchors.wheel = new THREE.Vector3(0, wy, wz - 0.06);
  },

  carta_nautica: ({ g, glow }, d) => {
    const { hx, hz, h } = d;
    const top = h - 0.05;
    g.box(-hx + 0.05, 0, -hz + 0.1, hx - 0.05, top - 0.04, hz - 0.05, WOOD);
    for (let k = 0; k < 3; k++) {
      g.box(-hx + 0.12, 0.12 + k * 0.26, -hz + 0.085, hx - 0.12, 0.33 + k * 0.26, -hz + 0.1, shade(WOOD, 0.85));
      g.boxC(0, 0.22 + k * 0.26, -hz + 0.075, 0.2, 0.03, 0.03, BRASS);
    }
    g.box(-hx, top - 0.04, -hz, hx, top, hz, WOOD_DARK);
    g.box(-hx, top, -hz, hx, top + 0.05, -hz + 0.04, WOOD_DARK);
    // carta náutica con costas y rumbo
    const cy = top + 0.004;
    g.box(-hx + 0.12, top, -hz + 0.1, hx - 0.12, cy, hz - 0.1, '#efe0b9', { ny: true });
    g.prism([[-hx + 0.3, -hz + 0.2], [-hx + 0.8, -hz + 0.3], [-hx + 0.9, -0.1], [-hx + 0.4, 0.25], [-hx + 0.2, 0.0]], cy, cy + 0.003, '#b9c98f', '#b9c98f');
    g.prism([[hx - 0.6, hz - 0.15], [hx - 0.2, hz - 0.3], [hx - 0.25, hz - 0.6], [hx - 0.55, hz - 0.5]], cy, cy + 0.003, '#b9c98f', '#b9c98f');
    for (let k = 0; k < 6; k++) {
      const t = k / 6;
      const x0 = -hx + 0.5 + t * (2 * hx - 1.0);
      g.box(x0, cy, -0.25 + t * 0.4 - 0.008, x0 + 0.12, cy + 0.004, -0.25 + t * 0.4 + 0.008, '#bc4749');
    }
    g.cylinder(hx * 0.25, cy, hz * 0.3, 0.12, 0.12, 0.003, 10, '#f3ead6');
    g.box(hx * 0.25 - 0.005, cy, hz * 0.3 - 0.11, hx * 0.25 + 0.005, cy + 0.006, hz * 0.3 + 0.11, '#2b2d42');
    // compás de puntas, taza y flexo de latón
    g.cylinderBetween(-0.1, cy + 0.01, 0.1, 0.12, cy + 0.01, 0.2, 0.008, 3, STEEL);
    g.cylinderBetween(-0.1, cy + 0.01, 0.1, 0.1, cy + 0.01, 0.0, 0.008, 3, STEEL);
    g.cylinder(hx - 0.25, cy, -hz + 0.25, 0.05, 0.045, 0.1, 6, '#f3ead6');
    g.cylinder(-hx + 0.2, cy, hz - 0.2, 0.07, 0.07, 0.03, 6, BRASS);
    g.cylinderBetween(-hx + 0.2, cy + 0.03, hz - 0.2, -hx + 0.3, cy + 0.42, hz - 0.3, 0.015, 4, BRASS);
    g.cylinder(-hx + 0.32, cy + 0.32, hz - 0.32, 0.11, 0.04, 0.1, 7, '#2a9d8f');
    glow.sphere(-hx + 0.32, cy + 0.3, hz - 0.32, 0.04, '#ffffff');
  },

  motor: ({ g, moving, anchors }, d) => {
    const { hx, hz } = d;
    g.box(-hx, 0, -hz, hx, 0.18, hz, IRON);
    for (const z of [-hz + 0.15, hz - 0.15]) g.box(-hx + 0.1, 0.18, z - 0.08, hx - 0.1, 0.26, z + 0.08, '#2b2f33');
    const m = moving;
    const body = '#4f6d5e';
    m.box(-hx + 0.4, 0.26, -0.55, hx - 0.5, 1.1, 0.55, body);
    for (let k = 0; k < 4; k++) {
      const x = -hx + 0.55 + k * ((2 * hx - 1.2) / 4);
      m.box(x, 1.1, -0.38, x + (2 * hx - 1.2) / 4 - 0.08, 1.32, 0.38, shade(body, 0.85));
      m.box(x + 0.04, 1.32, -0.3, x + (2 * hx - 1.2) / 4 - 0.12, 1.42, 0.3, '#c8553d');
    }
    // colector de escape y tuberías
    m.cylinderX(-0.1, 0.95, 0.66, 0.09, 2 * hx - 1.2, 8, PALETTE.rust);
    for (let k = 0; k < 4; k++) m.cylinderBetween(-hx + 0.7 + k * 0.6, 0.95, 0.55, -hx + 0.7 + k * 0.6, 0.95, 0.66, 0.06, 6, PALETTE.rust);
    m.cylinderX(-0.1, 0.5, -0.65, 0.05, 2 * hx - 1.4, 6, STEEL);
    // volante y acoplamiento al eje
    m.cylinderX(hx - 0.3, 0.75, 0, 0.55, 0.16, 12, STEEL_DARK);
    m.cylinderX(hx - 0.1, 0.75, 0, 0.12, 0.3, 8, STEEL);
    m.cylinderX(-hx + 0.25, 0.75, 0, 0.22, 0.3, 8, '#2b2f33');
    m.cylinderX(-hx + 0.05, 0.75, 0, 0.09, 0.4, 8, STEEL);
    // cuadro
    g.box(-hx + 0.05, 0.18, -hz + 0.02, -hx + 0.35, 1.2, -hz + 0.22, '#2b2d42');
    anchors.led = new THREE.Vector3(-hx + 0.2, 1.05, -hz + 0.015);
  },

  barril: ({ g }, d) => {
    const r = Math.min(d.hx, d.hz) - 0.02;
    const h = d.h;
    const seg = 10;
    g.cylinder(0, 0, 0, r * 0.84, r, h / 2, seg, WOOD, { capTop: false });
    g.cylinder(0, h / 2, 0, r, r * 0.84, h / 2, seg, WOOD, { capBottom: false, capColor: WOOD_DARK });
    for (const [y, rr] of [[0.12, 0.9], [0.42, 1.0], [0.52, 1.0], [0.82, 0.9]] as const) g.cylinder(0, h * y - 0.02, 0, r * rr + 0.012, r * rr + 0.012, 0.05, seg, STEEL_DARK, { capTop: false, capBottom: false });
    g.cylinder(0, h - 0.005, 0, r * 0.8, r * 0.8, 0.01, seg, WOOD_DARK);
    g.cylinder(r * 0.4, h, 0, 0.04, 0.04, 0.03, 6, WOOD_DARK);
  },
};

/** Reparte los objetos en 4 tramos de llenado (orden intercalado para que se llenen todas las baldas). */
function fillTiers(contents: GeoBuilder, tiers: number[], items: (() => void)[]): void {
  const n = items.length;
  const order = items.map((_, i) => i).sort((a, b) => hash01(a, 7) - hash01(b, 7));
  for (let t = 0; t < 4; t++) {
    const from = Math.floor((t / 4) * n);
    const to = Math.floor(((t + 1) / 4) * n);
    for (let i = from; i < to; i++) items[order[i]!]!();
    tiers.push(contents.vertexCount);
  }
}

const cache = new Map<string, PropModel>();

/** Modelo (cacheado) de un tipo de prop con unas medidas. */
export function propModel(kind: PropKind, d: PropDims): PropModel {
  const k = `${kind}|${d.hx.toFixed(3)}|${d.hz.toFixed(3)}|${d.h.toFixed(3)}`;
  let m = cache.get(k);
  if (m) return m;
  const ctx: Ctx = {
    g: new GeoBuilder(),
    glass: new GeoBuilder(),
    glow: new GeoBuilder(),
    moving: new GeoBuilder(),
    contents: new GeoBuilder(),
    tiers: [],
    anchors: {},
  };
  const b = BUILDERS[kind];
  b(ctx, d);
  const anchors = ctx.anchors;
  let movingPivot: THREE.Vector3 | null = null;
  if (kind === 'timon' && anchors.wheel) movingPivot = anchors.wheel.clone();
  m = {
    solid: ctx.g.build(),
    glass: ctx.glass.isEmpty() ? null : ctx.glass.build(),
    glow: ctx.glow.isEmpty() ? null : ctx.glow.build(),
    moving: ctx.moving.isEmpty() ? null : ctx.moving.build(),
    movingPivot,
    contents: ctx.contents.isEmpty() ? null : ctx.contents.build(),
    tiers: ctx.tiers,
    anchors,
  };
  cache.set(k, m);
  return m;
}

/** Todas las clases de prop con modelo (para tests). */
export const MODELLED_KINDS = Object.keys(BUILDERS) as PropKind[];

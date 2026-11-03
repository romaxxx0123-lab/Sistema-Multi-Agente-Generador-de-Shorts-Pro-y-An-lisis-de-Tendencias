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
 *  - `anchors`: puntos para efectos dinámicos (fuego del fogón, humo, LEDs, nivel de agua…) y
 *    `plaque`: dónde va la placa de latón con el nivel de mejora en los módulos abiertos.
 *
 * NIVELES DE MEJORA (docs/SISTEMAS.md §13): `propModel(kind, dims, tier, moduleType)` añade los
 * detalles del nivel 2 y 3 de su módulo (almacén con más baldas y luego estanterías metálicas,
 * depósito más alto y luego aislado, generador de doble cilindro y luego turbo, huerto con gomas
 * de riego y luego tierra abonada, camarote con cortinas y lámpara, cocina de hierro…). Solo
 * cambia el modelo de los props de los módulos que tienen esa mejora (`propTier`).
 * Los modelos se cachean por tipo + medidas + variante.
 *
 * MODELOS DE BLENDER (scripts/blender/models/muebles.py y maquinas.py; docs/ARQUITECTURA.md §8):
 * - `prop_<kind>` sustituye SOLO la geometría sólida «base» del procedimental, ajustada a las
 *   medidas del layout (`fitToDims`: se modela con las del colisionador de data/modules.ts).
 *   Anclajes, cristal, luces, contenido, piezas y placa siguen saliendo del procedimental, que se
 *   construye siempre. Lo que el builder añade después de `extras()` (detalles de los niveles de
 *   mejora, objetos sueltos encima) se conserva y se pinta sobre el modelo.
 * - `prop_<kind>@<nivel>` (opcional) sustituye toda la geometría sólida de ese nivel de mejora.
 *   Sin él, un nivel > 1 usa `prop_<kind>` + sus extras solo si el builder marca `extras()` (el
 *   nivel no cambia la base); si no, ese nivel sigue siendo procedimental.
 * - Piezas móviles: `prop_<kind>_<pieza>` (la parte `moving` se llama como en `MOVING_PIECE`, p.
 *   ej. `prop_timon_rueda`; las de `parts`, por su nombre: `prop_radar_antenna`), exportadas con su
 *   pivote en (0, PIECE_LIFT, 0) para que queden apoyadas en y ≥ 0 como todo modelo.
 * Si un modelo falta (o `setBlenderProps(false)`), todo es procedimental como antes.
 */
import * as THREE from 'three';
import { MODULE_LIST, type PropKind } from '../../data/modules';
import { registerDebug } from '../../game/debug';
import type { PropInstance } from '../../sim/ship';
import { WALL_H } from '../../sim/constants';
import { GAME_REACH } from '../../sim/npc';
import { hasModel, modelGeometry } from '../assets';
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
  /** Piezas articuladas con su propio origen (torreta, pluma y gancho de la grúa, antena del radar). */
  parts: Record<string, THREE.BufferGeometry>;
  /** Nivel de mejora con el que se construyó el modelo. */
  tier: number;
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
  /** Nivel de mejora efectivo para este prop (1 si su módulo no cambia el modelo). */
  tier: number;
  /** Constructor de una pieza articulada (ver `PropModel.parts`). */
  part: (name: string) => GeoBuilder;
  /**
   * Marca el final de la geometría «base» de `g` y `moving`: lo que se añada después (detalles de
   * los niveles de mejora, objetos sueltos encima) se conserva sobre un modelo de Blender.
   */
  extras: () => void;
}

/**
 * Módulos cuyas mejoras cambian el modelo de cada prop. El mismo mueble en otro módulo (la mesa
 * de la cocina, las herramientas del banco…) no cambia salvo que figure aquí.
 */
const TIER_KINDS: Partial<Record<PropKind, readonly string[]>> = {
  estanteria: ['almacen'],
  cajas: ['almacen'],
  deposito: ['deposito'],
  colector: ['colector'],
  potabilizadora: ['potabilizadora'],
  generador: ['generador'],
  bateria: ['bateria'],
  panel_solar: ['panel_solar'],
  banco: ['banco_trabajo'],
  herramientas: ['banco_trabajo', 'taller'],
  torno: ['taller'],
  prensa: ['taller'],
  fogon: ['cocina'],
  despensa: ['cocina'],
  bancal: ['huerto'],
  cama: ['camarote'],
  mesita: ['camarote'],
  litera: ['dormitorio'],
  armario: ['dormitorio'],
  mesa: ['comedor'],
  camilla: ['enfermeria'],
  armario_medico: ['enfermeria'],
  sofa: ['sala_comun'],
  estanteria_libros: ['sala_comun'],
  mesa_juegos: ['sala_comun'],
  ahumadero: ['ahumadero'],
  tanque_peces: ['vivero'],
  grua: ['grua'],
  motor: ['motor'],
};

/** Nivel de mejora que se ve en el modelo de un prop (1..3; 1 si su módulo no lo cambia). */
export function propTier(kind: PropKind, moduleType: string, tier: number): number {
  if (!TIER_KINDS[kind]?.includes(moduleType)) return 1;
  const t = Math.floor(Number(tier));
  return Number.isFinite(t) ? Math.max(1, Math.min(3, t)) : 1;
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

/** Fila de taquillas metálicas (dormitorio mejorado): rejillas, tarjetero y candado. */
function lockers(g: GeoBuilder, hx: number, hz: number, h: number): void {
  const paint = '#4f7f72';
  const n = Math.max(2, Math.round((2 * hx) / 0.45));
  const w = (2 * hx) / n;
  g.box(-hx, 0, -hz + 0.04, hx, 0.1, hz, '#2b2f33');
  g.box(-hx - 0.02, h - 0.12, -hz - 0.02, hx + 0.02, h - 0.08, hz, shade(paint, 0.8));
  for (let i = 0; i < n; i++) {
    const x0 = -hx + i * w;
    const x1 = x0 + w;
    g.box(x0 + 0.005, 0.1, -hz, x1 - 0.005, h - 0.12, hz, i % 2 ? paint : shade(paint, 1.06));
    g.box(x0 + 0.03, 0.14, -hz - 0.012, x1 - 0.03, h - 0.16, -hz, shade(paint, 0.92));
    for (let k = 0; k < 4; k++) g.box(x0 + 0.08, h - 0.4 + k * 0.05, -hz - 0.02, x1 - 0.08, h - 0.38 + k * 0.05, -hz - 0.012, '#2b2f33');
    g.box(x0 + 0.1, h - 0.6, -hz - 0.016, x1 - 0.1, h - 0.52, -hz - 0.012, '#f3ead6');
    g.box(x1 - 0.1, h * 0.48, -hz - 0.035, x1 - 0.06, h * 0.48 + 0.12, -hz - 0.012, STEEL);
    g.boxC(x1 - 0.08, h * 0.48 - 0.04, -hz - 0.04, 0.04, 0.05, 0.02, BRASS);
  }
}

/** Placa de latón por defecto: en el frente del prop, a media altura. */
function defaultPlaque(anchors: PropAnchors, d: PropDims, y = Math.min(1.3, d.h * 0.55)): void {
  if (!anchors.plaque) anchors.plaque = new THREE.Vector3(0, y, -d.hz - 0.02);
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
  cama: ({ g, glow, tier, extras }, d) => {
    const { hx, hz } = d;
    legs(g, hx, hz, 0.14, 0.09, WOOD_DARK);
    bed(g, hx, hz, 0.14, BLANKETS[0]!, WOOD, true);
    // cabecero alto con remate y pie bajo
    g.box(-hx - 0.04, 0.72, -hz - 0.02, -hx + 0.08, 0.98, hz + 0.02, WOOD_DARK);
    g.box(hx - 0.06, 0, -hz, hx + 0.02, 0.6, hz, WOOD_DARK);
    extras();
    if (tier >= 2) {
      // Camarote acogedor: dosel con cortinas recogidas, colcha de cuadros y lámpara de lectura.
      const top = 2.05;
      for (const x of [-hx + 0.02, hx - 0.02]) g.box(x - 0.03, 0.6, -hz - 0.03, x + 0.03, top, -hz + 0.03, WOOD_DARK);
      g.box(-hx - 0.01, top - 0.05, -hz - 0.04, hx + 0.01, top, -hz + 0.04, WOOD_DARK);
      g.box(-hx - 0.01, top - 0.05, -hz, -hx + 0.05, top, hz, WOOD_DARK);
      for (const sx of [-1, 1]) {
        const x = sx < 0 ? -hx + 0.1 : hx - 0.1;
        // cortina recogida con su alzapaños
        g.frustum(x, 0.62, -hz - 0.04, 0.26, 0.08, 0.12, 0.05, top - 0.68, '#c8553d');
        g.box(x - 0.13, top - 0.06, -hz - 0.07, x + 0.13, top - 0.02, -hz - 0.01, shade('#c8553d', 0.85));
        g.box(x - 0.08, 1.15, -hz - 0.085, x + 0.08, 1.2, -hz - 0.0, '#e9c46a');
      }
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) g.box(-hx * 0.25 + i * ((hx * 1.25 - 0.04) / 4), 0.452, -hz + 0.03 + j * (hz - 0.03), -hx * 0.25 + (i + 1) * ((hx * 1.25 - 0.04) / 4), 0.456, -hz + 0.03 + (j + 1) * (hz - 0.03), '#e9c46a', { ny: true });
      // aplique de latón sobre el cabecero
      g.box(-hx - 0.03, 1.32, -0.05, -hx + 0.0, 1.46, 0.05, BRASS);
      g.cylinderBetween(-hx, 1.4, 0, -hx + 0.22, 1.5, 0, 0.012, 4, BRASS);
      g.cylinder(-hx + 0.24, 1.38, 0, 0.1, 0.05, 0.12, 7, '#f1d9a8', { capBottom: false });
      glow.sphere(-hx + 0.24, 1.42, 0, 0.04, '#ffffff');
    }
  },

  litera: ({ g, glow, tier, extras }, d) => {
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
    extras();
    if (tier >= 2) {
      // Dormitorio con taquillas: cortinilla y lamparita de lectura en cada litera.
      for (const [y0, y1, c] of [[0.36, 1.12, '#6d597a'], [1.36, 2.1, '#457b9d']] as const) {
        g.box(-hx + 0.08, y1 - 0.03, -hz - 0.03, hx * 0.45, y1, -hz + 0.0, WOOD_DARK);
        g.frustum(-hx + 0.22, y0, -hz - 0.03, 0.24, 0.05, 0.14, 0.04, y1 - y0 - 0.03, c);
        g.box(-hx + 0.08, y1 - 0.06, -hz - 0.05, -hx + 0.36, y1 - 0.02, -hz - 0.01, shade(c, 0.85));
        g.box(-hx + 0.06, y1 - 0.22, hz - 0.06, -hx + 0.14, y1 - 0.12, hz - 0.02, BRASS);
        glow.sphere(-hx + 0.16, y1 - 0.2, hz - 0.08, 0.035, '#ffffff');
      }
    }
  },

  mesita: ({ g, glow, tier }, d) => {
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
    if (tier >= 2) {
      // jarrón con flores
      g.cylinder(0.12, top, 0.12, 0.04, 0.05, 0.14, 6, '#3d7a8a');
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1;
        g.cylinderBetween(0.12, top + 0.14, 0.12, 0.12 + Math.cos(a) * 0.05, top + 0.26, 0.12 + Math.sin(a) * 0.05, 0.006, 3, PALETTE.plantDark);
        g.sphere(0.12 + Math.cos(a) * 0.05, top + 0.27, 0.12 + Math.sin(a) * 0.05, 0.028, ['#e63946', '#f4a261', '#f1ece0'][k]!);
      }
    }
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

  armario: ({ g, tier }, d) => {
    const { hx, hz, h } = d;
    if (tier >= 2) {
      lockers(g, hx, hz, h);
      return;
    }
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

  fogon: ({ g, anchors, tier, extras }, d) => {
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
    extras();
    if (tier >= 2) {
      // Cocina de hierro colado: copete alto con estante calientaplatos, remates de latón,
      // termómetro en el horno y batería de cazos colgada.
      const cast = '#23272b';
      g.box(-hx - 0.04, top + 0.06, hz - 0.08, hx + 0.04, top + 0.62, hz + 0.02, cast);
      g.box(-hx - 0.06, top + 0.6, hz - 0.3, hx + 0.06, top + 0.65, hz + 0.02, cast);
      g.box(-hx - 0.06, top + 0.645, hz - 0.3, hx + 0.06, top + 0.66, hz - 0.28, BRASS);
      for (const sx of [-1, 1]) g.box(sx * (hx + 0.02) - 0.02, top + 0.4, hz - 0.3, sx * (hx + 0.02) + 0.02, top + 0.6, hz - 0.26, cast);
      for (let k = 0; k < 4; k++) g.cylinder(-hx + 0.25 + k * 0.18, top + 0.66, hz - 0.17, 0.08, 0.08, 0.02 + (k % 2) * 0.01, 8, k % 2 ? '#f3ead6' : '#e9efe9');
      g.box(-hx - 0.045, top - 0.02, -hz - 0.045, hx + 0.045, top + 0.0, -hz - 0.035, BRASS);
      g.push();
      g.translate((hx * 0.12 + hx - 0.08) / 2, 0.62, -hz - 0.025);
      g.disc(0, 0, 0, 0.055, 10, '#f3ead6', true);
      g.ring(0, 0, 0, 0.055, 0.01, 10, BRASS, 3);
      g.pop();
      for (let k = 0; k < 3; k++) {
        const x = -hx + 0.3 + k * 0.32;
        g.cylinder(x, top + 0.28 - k * 0.03, hz - 0.12, 0.012, 0.012, 0.3 + k * 0.03, 4, STEEL_DARK);
        g.push();
        g.translate(x, top + 0.2 - k * 0.04, hz - 0.13);
        g.cylinderZ(0, 0, 0, 0.11 + k * 0.015, 0.035, 8, k === 1 ? '#b87333' : '#5c6770');
        g.pop();
      }
    }
  },

  despensa: ({ g, contents, tiers, tier }, d) => {
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
    if (tier >= 2) {
      // cestas de mimbre y ristras de ajos y guindillas en el remate
      for (const x of [-hx * 0.5, hx * 0.45]) {
        g.cylinder(x, h + 0.05, 0, 0.2, 0.24, 0.2, 8, '#c9a36b');
        g.cylinder(x, h + 0.23, 0, 0.245, 0.245, 0.03, 8, shade('#c9a36b', 0.8), { capTop: false, capBottom: false });
      }
      for (const [x, c] of [[-hx + 0.12, '#f1ece0'], [hx - 0.12, '#c8553d']] as const) {
        g.cylinder(x, h - 0.75, -hz - 0.04, 0.008, 0.008, 0.72, 3, PALETTE.rope);
        for (let k = 0; k < 6; k++) g.sphere(x + (k % 2 ? 0.03 : -0.03), h - 0.7 + k * 0.1, -hz - 0.05, 0.04, c);
      }
    }
  },

  mesa: ({ g, glow, tier, extras }, d) => {
    const { hx, hz, h } = d;
    const top = h;
    g.box(-hx, top - 0.06, -hz, hx, top, hz, WOOD_LIGHT);
    g.box(-hx + 0.06, top - 0.16, -hz + 0.06, hx - 0.06, top - 0.06, hz - 0.06, WOOD);
    legs(g, hx, hz, top - 0.06, 0.09, WOOD_DARK, 0.1);
    extras();
    if (tier >= 2) {
      // Comedor mejorado: mantel de cuadros con caída, farolillo encendido y servicio para cuatro.
      const cloth = '#f1ece0';
      const check = '#bc4749';
      g.box(-hx - 0.03, top, -hz - 0.03, hx + 0.03, top + 0.008, hz + 0.03, cloth);
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 4; j++) {
          if ((i + j) % 2) continue;
          const x0 = -hx - 0.03 + (i / 6) * (2 * hx + 0.06);
          const z0 = -hz - 0.03 + (j / 4) * (2 * hz + 0.06);
          g.box(x0, top + 0.008, z0, x0 + (2 * hx + 0.06) / 6, top + 0.01, z0 + (2 * hz + 0.06) / 4, check, { ny: true });
        }
      for (const sz of [-1, 1]) g.box(-hx - 0.03, top - 0.22, sz * (hz + 0.03) - 0.006, hx + 0.03, top + 0.004, sz * (hz + 0.03) + 0.006, cloth);
      for (const sx of [-1, 1]) g.box(sx * (hx + 0.03) - 0.006, top - 0.22, -hz - 0.03, sx * (hx + 0.03) + 0.006, top + 0.004, hz + 0.03, cloth);
      // farolillo
      g.box(-0.07, top + 0.01, -0.07, 0.07, top + 0.03, 0.07, '#2b2f33');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * 0.06 - 0.008, top + 0.03, sz * 0.06 - 0.008, sx * 0.06 + 0.008, top + 0.24, sz * 0.06 + 0.008, '#2b2f33');
      g.frustum(0, top + 0.24, 0, 0.16, 0.16, 0.04, 0.04, 0.06, '#2b2f33');
      g.ring(0, top + 0.33, 0, 0.03, 0.008, 6, '#2b2f33', 3);
      glow.box(-0.05, top + 0.04, -0.05, 0.05, top + 0.22, 0.05, '#ffffff');
      // platos, vasos y cubiertos para cuatro
      for (const [x, z] of [[-hx * 0.5, -hz * 0.55], [hx * 0.5, -hz * 0.55], [-hx * 0.5, hz * 0.55], [hx * 0.5, hz * 0.55]] as const) {
        g.cylinder(x, top + 0.01, z, 0.12, 0.13, 0.015, 9, '#ffffff');
        g.cylinder(x, top + 0.025, z, 0.08, 0.08, 0.004, 9, '#e9efe9');
        g.cylinder(x + 0.17, top + 0.01, z, 0.03, 0.035, 0.09, 6, '#cfeef5');
        g.box(x - 0.18, top + 0.01, z - 0.07, x - 0.16, top + 0.016, z + 0.07, STEEL);
      }
      return;
    }
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

  estanteria: ({ g, contents, tiers, tier }, d) => {
    const { hx, hz } = d;
    // Nivel 2 (almacén con altillo): más alta, con una balda más y etiquetas. Nivel 3 (almacén
    // reforzado): estanterías metálicas de suelo a techo, con escuadras, cartelas y travesaños.
    const metal = tier >= 3;
    const h = tier >= 2 ? Math.min(WALL_H - 0.18, d.h + 0.6) : d.h;
    const shelves = tier >= 2 ? [0.12, 0.62, 1.12, 1.62, 2.12] : [0.12, 0.66, 1.2, 1.74];
    const post = metal ? 0.07 : 0.06;
    const postC = metal ? '#3d5a80' : STEEL_DARK;
    const shelfC = metal ? '#aab4bb' : WOOD_LIGHT;
    for (const x of [-hx + post / 2, 0, hx - post / 2])
      for (const z of [-hz + post / 2, hz - post / 2]) g.box(x - post / 2, 0, z - post / 2, x + post / 2, h - 0.05, z + post / 2, postC);
    for (const y of shelves) {
      g.box(-hx, y - 0.04, -hz, hx, y, hz, shelfC);
      if (metal) {
        // canto de chapa doblada (naranja de seguridad) y portaetiquetas
        g.box(-hx, y - 0.07, -hz - 0.012, hx, y, -hz, '#e0a458');
        for (const x of [-hx * 0.55, hx * 0.45]) g.box(x - 0.07, y - 0.065, -hz - 0.018, x + 0.07, y - 0.025, -hz - 0.012, '#f3ead6');
      } else if (tier >= 2) {
        for (const x of [-hx * 0.5, hx * 0.5]) g.box(x - 0.06, y - 0.035, -hz - 0.008, x + 0.06, y - 0.005, -hz, '#f3ead6');
      }
    }
    g.box(-hx, h - 0.08, -hz, hx, h - 0.04, hz, shelfC);
    // tirantes en X por detrás (y en los costados en la metálica)
    g.cylinderBetween(-hx + 0.05, 0.15, hz - 0.03, -0.05, h - 0.15, hz - 0.03, 0.012, 4, postC);
    g.cylinderBetween(-0.05, 0.15, hz - 0.03, -hx + 0.05, h - 0.15, hz - 0.03, 0.012, 4, postC);
    if (metal) {
      g.cylinderBetween(0.05, 0.15, hz - 0.03, hx - 0.05, h - 0.15, hz - 0.03, 0.012, 4, postC);
      g.cylinderBetween(hx - 0.05, 0.15, hz - 0.03, 0.05, h - 0.15, hz - 0.03, 0.012, 4, postC);
      for (const sx of [-1, 1]) {
        for (let y = 0.3; y < h - 0.3; y += 0.6) g.cylinderBetween(sx * (hx - post / 2), y, -hz + 0.04, sx * (hx - post / 2), y + 0.55, hz - 0.04, 0.01, 3, postC);
        // placas de anclaje al suelo
        for (const z of [-hz + post / 2, hz - post / 2]) g.box(sx * (hx - post / 2) - 0.07, 0, z - 0.07, sx * (hx - post / 2) + 0.07, 0.015, z + 0.07, '#2b2f33');
      }
    }
    // contenido escalonado
    const items: (() => void)[] = [];
    const avail = [...shelves, h - 0.04];
    const levels = shelves.length;
    for (let s = 0; s < levels; s++) {
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

  cajas: ({ g, tier }, d) => {
    const { hx, hz, h } = d;
    const s = Math.min(hx, hz) * 2;
    crate(g, -hx * 0.08, 0, 0, s, h * 0.5, s, WOOD_LIGHT, 0.05);
    crate(g, hx * 0.05, h * 0.5, -0.02, s * 0.85, h * 0.45, s * 0.85, '#b8895a', -0.2);
    if (tier >= 2) {
      // una caja más arriba y un saco apoyado
      crate(g, -hx * 0.05, h * 0.95, 0.02, s * 0.65, h * 0.38, s * 0.65, WOOD_LIGHT, 0.35);
      sack(g, hx + 0.12, 0, -hz * 0.4, 0.3);
    } else g.box(-hx * 0.4, h * 0.95, -hz * 0.35, hx * 0.4, h * 0.95 + 0.04, hz * 0.35, PALETTE.canvas);
  },

  banco: ({ g, glow, anchors, tier }, d) => {
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
    if (tier >= 2) {
      // Banco mejorado: tornillo de banco de hierro colado, flexo articulado y portaherramientas.
      const cast = '#3d5a80';
      g.box(-hx + 0.04, h, -hz - 0.02, -hx + 0.34, h + 0.12, -hz + 0.2, cast);
      g.box(-hx + 0.06, h + 0.12, -hz - 0.02, -hx + 0.32, h + 0.26, -hz + 0.05, cast);
      g.box(-hx + 0.06, h + 0.12, -hz + 0.09, -hx + 0.32, h + 0.26, -hz + 0.16, cast);
      g.cylinderZ(-hx + 0.19, h + 0.18, -hz - 0.12, 0.018, 0.24, 5, STEEL);
      g.cylinderX(-hx + 0.19, h + 0.18, -hz - 0.24, 0.012, 0.22, 4, STEEL);
      g.box(hx - 0.12, h, hz - 0.2, hx - 0.02, h + 0.05, hz - 0.1, '#2b2f33');
      g.cylinderBetween(hx - 0.07, h + 0.05, hz - 0.15, hx - 0.15, h + 0.55, hz - 0.12, 0.014, 4, '#2b2f33');
      g.cylinderBetween(hx - 0.15, h + 0.55, hz - 0.12, hx - 0.38, h + 0.62, hz - 0.2, 0.014, 4, '#2b2f33');
      g.cylinder(hx - 0.42, h + 0.5, hz - 0.22, 0.1, 0.04, 0.12, 7, '#2a9d8f', { capBottom: false });
      glow.sphere(hx - 0.42, h + 0.52, hz - 0.22, 0.035, '#ffffff');
      g.box(-0.2, h, hz - 0.14, 0.2, h + 0.1, hz - 0.04, WOOD_DARK);
      for (let k = 0; k < 7; k++) g.cylinder(-0.17 + k * 0.057, h + 0.1, hz - 0.09, 0.012, 0.012, 0.12 + (k % 3) * 0.03, 4, ['#bc4749', '#e9c46a', '#2a9d8f'][k % 3]!);
    }
    anchors.plaque = new THREE.Vector3(0, h - 0.06, -hz - 0.02);
  },

  herramientas: ({ g, tier }, d) => {
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
    if (tier >= 2) {
      // fila de destornilladores, nivel de burbuja y taladro colgado
      for (let k = 0; k < 6; k++) {
        const x = -hx * 0.85 + k * 0.08;
        g.box(x - 0.015, 1.7, zf - 0.015, x + 0.015, 1.8, zf + 0.005, ['#bc4749', '#e9c46a', '#2a9d8f'][k % 3]!);
        g.box(x - 0.005, 1.58, zf - 0.01, x + 0.005, 1.7, zf, STEEL);
      }
      g.box(hx * 0.1, 1.82, zf - 0.03, hx * 0.75, 1.88, zf, '#e9c46a');
      g.box(hx * 0.4, 1.83, zf - 0.035, hx * 0.46, 1.87, zf - 0.03, '#90be6d');
      g.box(hx * 0.62, 1.2, zf - 0.08, hx * 0.82, 1.32, zf, '#c8553d');
      g.box(hx * 0.64, 1.02, zf - 0.07, hx * 0.7, 1.2, zf - 0.01, '#2b2d42');
      g.cylinderX(hx * 0.56, 1.27, zf - 0.04, 0.012, 0.1, 4, STEEL);
    }
  },

  torno: ({ g, glow, anchors, tier }, d) => {
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
    if (tier >= 2) {
      // Taller con fresadora: columna con cabezal fresador junto al torno y foco de trabajo.
      const fx = hx - 0.25;
      const fz = hz - 0.2;
      g.box(fx - 0.15, 0.84, fz - 0.15, fx + 0.15, 0.96, fz + 0.15, paintDark);
      g.cylinder(fx, 0.96, fz + 0.05, 0.07, 0.07, 1.0, 8, STEEL);
      g.box(fx - 0.14, 1.55, fz - 0.2, fx + 0.14, 1.85, fz + 0.12, paint);
      g.cylinder(fx, 1.4, fz - 0.1, 0.05, 0.06, 0.15, 8, STEEL_DARK);
      g.cylinder(fx, 1.3, fz - 0.1, 0.015, 0.015, 0.1, 5, STEEL);
      g.cylinderX(fx + 0.18, 1.7, fz - 0.05, 0.05, 0.08, 6, '#bc4749');
      g.cylinderBetween(-hx + 0.3, 1.36, 0.25, -hx + 0.5, 1.9, 0.1, 0.014, 4, '#2b2f33');
      g.cylinder(-hx + 0.55, 1.78, 0.05, 0.11, 0.05, 0.14, 7, '#e0a458', { capBottom: false });
      glow.sphere(-hx + 0.55, 1.8, 0.05, 0.04, '#ffffff');
    }
  },

  prensa: ({ g, anchors, tier }, d) => {
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
    if (tier >= 2) {
      // grupo hidráulico con manómetro y latiguillo hasta la cabeza
      g.box(hx - 0.42, 0.14, hz - 0.36, hx - 0.05, 0.5, hz - 0.05, '#bc4749');
      g.cylinder(hx - 0.24, 0.5, hz - 0.2, 0.08, 0.08, 0.1, 8, STEEL_DARK);
      g.push();
      g.translate(hx - 0.24, 0.38, hz - 0.37);
      g.disc(0, 0, 0, 0.05, 8, '#f3ead6', true);
      g.pop();
      g.cylinderBetween(hx - 0.1, 0.5, hz - 0.1, hx - 0.15, h - 0.1, hz * 0.4, 0.02, 4, '#22262a');
    }
  },

  bancal: ({ g, anchors, tier, extras }, d) => {
    const { hx, hz, h } = d;
    const t = 0.09;
    const wc = WOOD;
    // Nivel 3 (huerto abonado): tierra nueva, oscura, con compost de algas.
    const soil = tier >= 3 ? '#3b2a1e' : PALETTE.soil;
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
    // la tierra, los surcos y el riego cambian con la mejora: van encima del cajón de Blender
    extras();
    g.box(-hx + t, h - 0.1, -hz + t, hx - t, h - 0.07, hz - t, soil);
    // surcos
    for (let k = -2; k <= 2; k++) g.box(-hx + t + 0.05, h - 0.07, k * 0.4 - 0.05, hx - t - 0.05, h - 0.05, k * 0.4 + 0.05, shade(soil, 1.15), { ny: true });
    if (tier >= 3) {
      // briznas de alga y mantillo claro sobre la tierra oscura
      for (let k = 0; k < 18; k++) {
        const x = -hx + t + 0.1 + hash01(k, 11) * (2 * (hx - t) - 0.2);
        const z = -hz + t + 0.1 + hash01(k, 12) * (2 * (hz - t) - 0.2);
        g.boxC(x, h - 0.045, z, 0.08, 0.012, 0.025, k % 3 ? '#5a7a3a' : '#8d7a5a');
      }
    }
    if (tier >= 2) {
      // Riego por goteo: gomas negras a lo largo de los surcos con goteros, y botella de reserva.
      for (let k = -2; k <= 2; k++) {
        const z = k * 0.4 + 0.07;
        g.cylinderX(0, h - 0.04, z, 0.014, 2 * (hx - t) - 0.12, 4, '#1d1f22');
        for (let i = 0; i < 5; i++) g.boxC(-hx + t + 0.25 + i * ((2 * (hx - t) - 0.5) / 4), h - 0.035, z, 0.03, 0.03, 0.03, '#2a9d8f');
      }
      g.cylinderZ(-hx + t + 0.04, h - 0.04, 0.07, 0.016, 1.75, 4, '#1d1f22');
      const px = -hx - 0.02;
      const pz = hz - 0.2;
      g.box(px - 0.03, 0, pz - 0.03, px + 0.03, h + 0.75, pz + 0.03, WOOD_DARK);
      g.box(px - 0.1, h + 0.45, pz - 0.1, px + 0.1, h + 0.48, pz + 0.1, WOOD_DARK);
      g.cylinder(px, h + 0.48, pz, 0.08, 0.08, 0.24, 7, '#7fc4d6');
      g.cylinder(px, h + 0.72, pz, 0.08, 0.03, 0.06, 7, '#7fc4d6');
      g.cylinderBetween(px, h + 0.45, pz, -hx + t + 0.04, h - 0.03, 0.75, 0.012, 3, '#1d1f22');
    }
    // estaca con cartel
    g.box(hx - 0.2, h, -hz + 0.12, hx - 0.17, h + 0.3, -hz + 0.15, WOOD_LIGHT);
    g.box(hx - 0.3, h + 0.2, -hz + 0.1, hx - 0.07, h + 0.32, -hz + 0.12, '#f3ead6');
    anchors.soil = new THREE.Vector3(0, h - 0.07, 0);
    anchors.size = new THREE.Vector3(hx - t, 0, hz - t);
    anchors.plaque = new THREE.Vector3(-hx * 0.5, h * 0.5, -hz - 0.02);
  },

  colector: ({ g, anchors, tier }, d) => {
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
    anchors.plaque = new THREE.Vector3(0, 0.5, -0.45);
    if (tier >= 2) {
      // Doble lona: un faldón exterior que recoge más lluvia y un pequeño tanque de reserva.
      const lip = topY + 0.25;
      for (let i = 0; i < 4; i++) {
        const a = corners[i]!;
        const b = corners[(i + 1) % 4]!;
        const k = 1.12;
        const ca = i % 2 ? '#2a9d8f' : shade('#2a9d8f', 0.92);
        g.quadN(a[0] * k, lip, a[1] * k, a[0], topY, a[1], b[0], topY, b[1], b[0] * k, lip, b[1] * k, ca);
        g.quadN(b[0] * k, lip, b[1] * k, b[0], topY, b[1], a[0], topY, a[1], a[0] * k, lip, a[1] * k, shade(ca, 0.75));
        g.cylinderBetween(a[0] * k, lip, a[1] * k, b[0] * k, lip, b[1] * k, 0.025, 4, shade('#2a9d8f', 0.8));
      }
      for (const [x, z] of corners) g.cylinderBetween(x * 0.95, h, z * 0.95, x * 1.1, lip, z * 1.1, 0.03, 4, WOOD);
      g.box(-hx + 0.08, 0, hz - 0.62, -hx + 0.62, 0.7, hz - 0.08, '#3d5a80');
      g.box(-hx + 0.06, 0.7, hz - 0.64, -hx + 0.64, 0.74, hz - 0.06, '#2f4858');
      g.cylinderBetween(-0.3, 0.55, 0.25, -hx + 0.35, 0.55, hz - 0.4, 0.035, 5, STEEL_DARK);
    }
  },

  deposito: ({ g, anchors, tier }, d) => {
    const { hx } = d;
    const r = Math.min(hx, d.hz) - 0.08;
    const tankC = '#8fa9b8';
    // Nivel 2: un segundo cuerpo soldado encima (más alto). Nivel 3: forro aislante y presión.
    const h = tier >= 2 ? Math.min(WALL_H - 0.12, d.h + 0.45) : d.h;
    const clad = tier >= 3;
    const out = clad ? 0.045 : 0;
    g.cylinder(0, 0, 0, r + 0.05 + out, r + 0.05 + out, 0.18, 10, IRON);
    g.cylinder(0, 0.18, 0, r, r, h - 0.55, 10, tankC, { phase: Math.PI / 10 });
    g.cylinder(0, h - 0.37, 0, r, r * 0.55, 0.3, 10, shade(tankC, 1.06), { phase: Math.PI / 10 });
    g.cylinder(0, h - 0.07, 0, 0.26, 0.26, 0.07, 8, STEEL_DARK);
    const bands = [0.45, 1.05, 1.65];
    if (tier >= 2) bands.push(2.1);
    for (const y of bands) g.cylinder(0, y, 0, r + 0.025, r + 0.025, 0.07, 10, STEEL_DARK, { phase: Math.PI / 10 });
    if (tier >= 2 && !clad) {
      // cordón de soldadura y remaches en la junta de los dos cuerpos
      const yj = d.h - 0.55;
      g.cylinder(0, yj - 0.02, 0, r + 0.015, r + 0.015, 0.04, 10, '#5c6770', { phase: Math.PI / 10 });
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        g.boxC(Math.cos(a) * (r + 0.02), yj + 0.06, Math.sin(a) * (r + 0.02), 0.03, 0.03, 0.03, STEEL_DARK);
      }
    }
    if (clad) {
      // forro aislante con flejes, cúpula, válvula de seguridad y manómetro
      const cc = '#d9dfe2';
      g.cylinder(0, 0.2, 0, r + out, r + out, h - 0.6, 12, cc, { phase: Math.PI / 12 });
      g.cylinder(0, h - 0.4, 0, r + out, r * 0.5, 0.32, 12, shade(cc, 1.04), { phase: Math.PI / 12 });
      for (const y of [0.5, 1.1, 1.7, 2.3]) if (y < h - 0.5) g.cylinder(0, y, 0, r + out + 0.015, r + out + 0.015, 0.05, 12, '#8a9399', { phase: Math.PI / 12 });
      g.cylinder(0.25, h - 0.08, 0.1, 0.04, 0.04, 0.18, 6, '#bc4749');
      g.cylinder(0.25, h + 0.1, 0.1, 0.06, 0.03, 0.06, 6, '#bc4749');
      g.push();
      g.translate(-0.42, h - 0.75, -r - out - 0.03);
      g.disc(0, 0, 0, 0.1, 10, '#f3ead6', true);
      g.ring(0, 0, 0, 0.1, 0.018, 10, BRASS, 3);
      g.box(-0.005, 0, -0.008, 0.07, 0.01, -0.004, '#bc4749');
      g.pop();
      g.push();
      g.translate(r + out + 0.05, 0.45, 0.25);
      g.rotateY(Math.PI / 2);
      g.ring(0, 0, 0, 0.12, 0.018, 10, '#bc4749', 3);
      g.pop();
    }
    // escalerilla lateral (+x)
    const lx = r + 0.05 + out;
    for (const z of [-0.18, 0.18]) g.box(lx, 0.18, z - 0.02, lx + 0.04, h - 0.2, z + 0.02, STEEL_DARK);
    for (let y = 0.4; y < h - 0.3; y += 0.3) g.box(lx, y, -0.18, lx + 0.04, y + 0.03, 0.18, STEEL);
    // indicador de nivel (tubo de cristal con marco) en el frente
    const gz = -r - 0.07 - out;
    const gTop = h - 0.4;
    g.box(-0.1, 0.3, gz - 0.03, -0.06, gTop, gz + 0.06, BRASS);
    g.box(0.06, 0.3, gz - 0.03, 0.1, gTop, gz + 0.06, BRASS);
    g.box(-0.1, 0.26, gz - 0.03, 0.1, 0.32, gz + 0.06, BRASS);
    g.box(-0.1, gTop - 0.02, gz - 0.03, 0.1, gTop + 0.04, gz + 0.06, BRASS);
    for (let k = 1; k < 5; k++) g.box(0.1, 0.32 + k * ((gTop - 0.32) / 5), gz - 0.035, 0.15, 0.33 + k * ((gTop - 0.32) / 5), gz + 0.0, '#2b2d42');
    // grifo
    g.cylinderZ(0.4, 0.45, -r - 0.08 - out, 0.05, 0.2, 6, BRASS);
    g.cylinder(0.4, 0.36, -r - 0.17 - out, 0.035, 0.035, 0.1, 6, BRASS);
    g.box(0.36, 0.53, -r - 0.12 - out, 0.44, 0.57, -r - 0.04 - out, '#bc4749');
    // tubería hacia el techo
    g.cylinder(-0.45, h - 0.2, 0.3, 0.06, 0.06, WALL_H - h + 0.2, 6, STEEL);
    g.cylinderBetween(-0.45, h - 0.2, 0.3, -0.2, h - 0.12, 0.1, 0.06, 6, STEEL);
    // placa
    g.box(-0.35, 1.2, gz + 0.02, -0.15, 1.36, gz + 0.04, '#f3ead6');
    anchors.gaugeBottom = new THREE.Vector3(0, 0.33, gz + 0.015);
    anchors.gaugeTop = new THREE.Vector3(0, gTop - 0.03, gz + 0.015);
    anchors.tap = new THREE.Vector3(0.4, 0.34, -r - 0.17 - out);
    anchors.leak = new THREE.Vector3(r * 0.7, 0.6, -r * 0.7);
    anchors.plaque = new THREE.Vector3(0.35, 1.28, gz + 0.025);
  },

  potabilizadora: ({ g, anchors, tier }, d) => {
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
    anchors.plaque = new THREE.Vector3(hx * 0.5, 0.75, -hz + 0.215);
    if (tier >= 2) {
      // prefiltro de arena sobre el armario, con su manómetro y la tubería de entrada
      const px = hx * 0.5;
      const pz = 0.0;
      g.cylinder(px, h - 0.05, pz, 0.2, 0.2, 0.08, 10, STEEL_DARK);
      g.cylinder(px, h + 0.03, pz, 0.18, 0.18, 0.45, 10, '#c9a36b');
      g.cylinder(px, h + 0.48, pz, 0.18, 0.06, 0.12, 10, shade('#c9a36b', 0.9));
      for (const y of [h + 0.12, h + 0.38]) g.cylinder(px, y, pz, 0.19, 0.19, 0.03, 10, STEEL_DARK, { capTop: false, capBottom: false });
      g.cylinderBetween(px, h + 0.6, pz, -0.1, h + 0.6, -hz + 0.25, 0.035, 6, STEEL);
      g.cylinderBetween(-0.1, h + 0.6, -hz + 0.25, -0.1, 1.37, -hz + 0.25, 0.035, 6, STEEL);
      g.push();
      g.translate(px, h + 0.3, pz - 0.19);
      g.disc(0, 0, 0, 0.06, 8, '#f3ead6', true);
      g.pop();
    }
  },

  generador: ({ g, moving, anchors, tier }, d) => {
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
    anchors.plaque = new THREE.Vector3(-0.35, 0.55, -0.485);
    if (tier >= 2) {
      // Doble cilindro: segundo cilindro con aletas de refrigeración y su colector.
      for (const [x, z] of [[-hx + 0.55, -0.22], [-hx + 0.55, 0.2]] as const) {
        m.cylinder(x, 1.0, z, 0.15, 0.15, 0.3, 10, '#c0c7cc');
        for (let k = 0; k < 5; k++) m.cylinder(x, 1.02 + k * 0.06, z, 0.19, 0.19, 0.02, 10, '#9aa5ad');
        m.cylinder(x, 1.3, z, 0.12, 0.1, 0.06, 10, shade(red, 0.8));
      }
      m.cylinderBetween(-hx + 0.55, 1.33, -0.22, -hx + 0.55, 1.33, 0.2, 0.03, 5, STEEL_DARK);
    }
    if (tier >= 3) {
      // Turbo: caracol del turbocompresor en el escape, intercooler y tubos pulidos.
      m.cylinderZ(-0.12, 1.18, -0.28, 0.16, 0.14, 12, '#9aa5ad');
      m.cylinderZ(-0.12, 1.18, -0.4, 0.09, 0.1, 10, '#d9dee2');
      m.cylinderBetween(-0.12, 1.18, -0.45, 0.25, 1.18, -0.55, 0.05, 6, '#d9dee2');
      m.box(0.25, 0.9, -0.62, 0.5, 1.25, -0.5, '#2b2f33');
      for (let k = 0; k < 6; k++) m.box(0.27, 0.93 + k * 0.05, -0.625, 0.48, 0.95 + k * 0.05, -0.62, STEEL);
      m.cylinderBetween(0.37, 0.9, -0.56, 0.0, 0.7, -0.46, 0.04, 6, '#d9dee2');
      m.box(-hx + 0.25, 0.5, -0.455, 0.25, 0.56, -0.448, '#e9c46a');
    }
  },

  bateria: ({ g, anchors, tier }, d) => {
    const { hx, hz, h } = d;
    // Nivel 2: celdas nuevas de alta capacidad (azules, con ventana de carga) y ventilador.
    const hi = tier >= 2;
    const shelves = [0.08, 0.55, 1.02];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * (hx - 0.03) - 0.03, 0, sz * (hz - 0.03) - 0.03, sx * (hx - 0.03) + 0.03, h - 0.02, sz * (hz - 0.03) + 0.03, STEEL_DARK);
    for (const y of shelves) g.box(-hx, y - 0.04, -hz, hx, y, hz, STEEL);
    g.box(-hx, h - 0.06, -hz, hx, h - 0.02, hz, STEEL);
    for (const y of shelves) {
      const n = 4;
      for (let k = 0; k < n; k++) {
        const x = -hx + 0.1 + ((k + 0.5) / n) * (2 * hx - 0.2);
        const w = (2 * hx - 0.2) / n - 0.06;
        g.box(x - w / 2, y, -hz + 0.08, x + w / 2, y + 0.34, hz - 0.08, hi ? '#1f4e79' : '#2b2d42');
        g.box(x - w / 2, y + 0.34, -hz + 0.08, x + w / 2, y + 0.37, hz - 0.08, hi ? '#d9dee2' : '#3a3f44');
        g.boxC(x - w * 0.25, y + 0.4, -hz + 0.2, 0.05, 0.05, 0.05, '#bc4749');
        g.boxC(x + w * 0.25, y + 0.4, -hz + 0.2, 0.05, 0.05, 0.05, '#22262a');
        g.box(x - w / 2 + 0.02, y + 0.12, -hz + 0.075, x + w / 2 - 0.02, y + 0.2, -hz + 0.08, hi ? '#5dd67a' : '#e9c46a');
        if (hi) g.box(x - w / 2 + 0.03, y + 0.24, -hz + 0.075, x - w / 2 + 0.09, y + 0.3, -hz + 0.08, '#f3ead6');
      }
      g.cylinderX(0, y + 0.43, -hz + 0.2, 0.015, 2 * hx - 0.2, 4, '#bc4749');
    }
    // cuadro con barra de carga (se ilumina por tramos según la carga)
    g.box(-0.25, h - 0.42, -hz - 0.06, 0.25, h - 0.12, -hz + 0.02, '#2b2d42');
    anchors.gauge = new THREE.Vector3(-0.2, h - 0.27, -hz - 0.065);
    anchors.led = new THREE.Vector3(0.19, h - 0.2, -hz - 0.065);
    // portaplacas bajo la balda de arriba, a la derecha del cuadro
    g.box(0.38, h - 0.32, -hz - 0.015, 0.72, h - 0.06, -hz - 0.005, STEEL_DARK);
    anchors.plaque = new THREE.Vector3(0.55, h - 0.19, -hz - 0.02);
    if (hi) {
      g.box(-hx + 0.05, h - 0.02, -0.25, -hx + 0.45, h + 0.14, 0.25, '#3a3f44');
      g.cylinderZ(-hx + 0.25, h + 0.06, -0.255, 0.065, 0.01, 8, '#22262a');
      for (let k = 0; k < 3; k++) g.box(-hx + 0.25 - 0.06 + k * 0.05, h + 0.0, -0.262, -hx + 0.25 - 0.05 + k * 0.05, h + 0.12, -0.258, STEEL);
    }
  },

  panel_solar: ({ g, anchors, tier }, d) => {
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
    anchors.plaque = new THREE.Vector3(hx - 0.4, 0.3, hz - 0.36);
    if (tier >= 2) {
      // Panel orientable: eje con motorreductor en el centro y sensor de sol en el canto alto.
      g.cylinderX(0, yC, 0.05, 0.05, 2 * hx - 0.3, 8, STEEL_DARK);
      g.box(-0.18, yC - 0.3, -0.05, 0.18, yC - 0.05, 0.2, '#e0a458');
      g.cylinderX(0.24, yC - 0.17, 0.08, 0.08, 0.12, 8, '#3a3f44');
      g.cylinder(0, 0, 0.08, 0.06, 0.06, yC - 0.3, 6, STEEL);
      g.push();
      g.translate(0, yC, 0.05);
      g.rotateX(-tilt);
      g.box(-0.05, 0.016, hz - 0.12, 0.05, 0.12, hz - 0.06, '#2b2d42');
      g.box(-0.012, 0.12, hz - 0.1, 0.012, 0.16, hz - 0.08, '#e9c46a');
      g.pop();
    }
  },

  camilla: ({ g, glass, glow, tier }, d) => {
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
    if (tier >= 2) {
      // Enfermería equipada: monitor en su pie junto a la cabecera y bandeja de instrumental.
      const mx = -hx - 0.05;
      const mz = -hz + 0.1;
      g.cylinder(mx, 0, mz, 0.16, 0.16, 0.03, 6, '#c0c7cc');
      g.cylinder(mx, 0.03, mz, 0.025, 0.025, 1.25, 5, '#c0c7cc');
      g.box(mx - 0.17, 1.22, mz - 0.06, mx + 0.17, 1.48, mz + 0.06, '#e9efe9');
      g.box(mx - 0.14, 1.25, mz - 0.065, mx + 0.14, 1.45, mz - 0.06, '#14233a');
      glow.box(mx - 0.12, 1.33, mz - 0.07, mx + 0.12, 1.345, mz - 0.065, '#ffffff');
      glow.box(mx - 0.12, 1.38, mz - 0.07, mx - 0.02, 1.39, mz - 0.065, '#ffffff');
      g.cylinderBetween(mx + 0.1, 1.22, mz, -hx * 0.4, top + 0.2, -hz * 0.3, 0.008, 3, '#2b2d42');
      g.box(hx - 0.42, top + 0.19, -hz + 0.06, hx - 0.12, top + 0.21, -hz + 0.28, '#c0c7cc');
      for (let k = 0; k < 4; k++) g.box(hx - 0.38 + k * 0.06, top + 0.21, -hz + 0.1, hx - 0.37 + k * 0.06, top + 0.22, -hz + 0.25, STEEL);
    }
  },

  armario_medico: ({ g, glass, tier }, d) => {
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
    if (tier >= 2) {
      // cajas de medicinas etiquetadas y botella de oxígeno al lado
      for (let k = 0; k < 3; k++) {
        const x = -hx + 0.1 + k * 0.32;
        g.box(x, h, -0.05, x + 0.26, h + 0.18 - k * 0.03, 0.2, ['#f8f9fa', '#bfe0da', '#f8f9fa'][k]!);
        g.box(x + 0.05, h + 0.05, -0.055, x + 0.21, h + 0.1, -0.05, '#e63946');
      }
      g.cylinder(hx + 0.14, 0, -hz + 0.18, 0.11, 0.11, 0.95, 8, '#2a9d8f');
      g.cylinder(hx + 0.14, 0.95, -hz + 0.18, 0.11, 0.05, 0.1, 8, '#2a9d8f');
      g.cylinder(hx + 0.14, 1.05, -hz + 0.18, 0.03, 0.03, 0.08, 6, STEEL);
      g.box(hx + 0.1, 1.08, -hz + 0.1, hx + 0.18, 1.14, -hz + 0.18, '#2b2d42');
    }
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

  motor: ({ g, moving, anchors, tier }, d) => {
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
    anchors.plaque = new THREE.Vector3(-hx + 0.2, 0.62, -hz + 0.005);
    if (tier >= 2) {
      // Hélice de paso variable: grupo hidráulico de mando del paso sobre el eje, con palanca.
      m.box(hx - 0.75, 1.1, -0.25, hx - 0.35, 1.45, 0.25, '#457b9d');
      m.cylinderX(hx - 0.2, 1.25, 0, 0.09, 0.3, 8, '#d9dee2');
      m.cylinderBetween(hx - 0.55, 1.45, 0.1, hx - 0.45, 1.8, 0.1, 0.02, 4, STEEL);
      m.sphere(hx - 0.45, 1.82, 0.1, 0.04, '#bc4749');
      m.cylinderBetween(hx - 0.55, 1.1, -0.2, hx - 0.1, 0.75, -0.2, 0.025, 5, '#22262a');
      m.cylinderBetween(hx - 0.55, 1.1, 0.2, hx - 0.1, 0.75, 0.2, 0.025, 5, '#22262a');
    }
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
  /* ---------------- Ronda de contenido 2: módulos especializados ---------------- */

  sofa: ({ g, tier, extras }, d) => {
    const { hx, hz } = d;
    const fabric = '#9b4a3c';
    const fabricDark = shade(fabric, 0.78);
    const seat = 0.44;
    // patas torneadas y bastidor
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cylinder(sx * (hx - 0.1), 0, sz * (hz - 0.1), 0.035, 0.025, 0.1, 6, WOOD_DARK);
    g.box(-hx + 0.02, 0.1, -hz + 0.04, hx - 0.02, 0.26, hz, fabricDark);
    // dos cojines de asiento (una plaza cada uno: SOFA_SEATS = ±0,55)
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -hx + 0.2 : 0.01;
      const x1 = sx < 0 ? -0.01 : hx - 0.2;
      g.box(x0, 0.26, -hz + 0.02, x1, seat, hz - 0.18, fabric);
      g.box(x0 + 0.03, seat, -hz + 0.05, x1 - 0.03, seat + 0.025, hz - 0.21, shade(fabric, 1.08));
    }
    // respaldo (en +z: quien se sienta mira a -z) con dos cojines
    g.box(-hx + 0.02, 0.26, hz - 0.2, hx - 0.02, 0.86, hz, fabricDark);
    g.box(-hx + 0.04, 0.84, hz - 0.18, hx - 0.04, 0.9, hz - 0.02, shade(fabricDark, 0.9));
    for (const sx of [-1, 1]) g.box(sx < 0 ? -hx + 0.22 : 0.02, seat, hz - 0.32, sx < 0 ? -0.02 : hx - 0.22, 0.8, hz - 0.18, shade(fabric, 0.94));
    // brazos acolchados
    for (const sx of [-1, 1]) {
      g.box(sx * hx - (sx > 0 ? 0.2 : 0), 0.26, -hz + 0.02, sx * hx + (sx < 0 ? 0.2 : 0), 0.62, hz - 0.02, fabricDark);
      g.box(sx * hx - (sx > 0 ? 0.21 : -0.01), 0.62, -hz + 0.01, sx * hx + (sx < 0 ? 0.21 : -0.01), 0.68, hz - 0.01, fabric);
    }
    // botones del capitoné
    for (let k = 0; k < 5; k++) g.boxC(-hx + 0.35 + k * ((2 * hx - 0.7) / 4), 0.68, hz - 0.205, 0.03, 0.03, 0.012, shade(fabric, 0.6));
    extras();
    if (tier >= 2) {
      // cojines sueltos y una manta de ganchillo sobre el respaldo
      const pillows: [number, string][] = [[-hx + 0.32, '#e9c46a'], [hx - 0.34, '#2a9d8f'], [0.18, '#f1ece0']];
      for (const [x, c] of pillows) {
        g.push();
        g.translate(x, seat + 0.02, hz - 0.3);
        g.rotateX(-0.3);
        g.rotateZ(x < 0 ? 0.12 : -0.1);
        g.box(-0.17, 0, -0.06, 0.17, 0.3, 0.06, c);
        g.box(-0.04, 0.12, -0.065, 0.04, 0.18, -0.06, shade(c, 0.7));
        g.pop();
      }
      const throwC = ['#f4a261', '#e9c46a', '#bc4749', '#2a9d8f'];
      for (let k = 0; k < 4; k++) {
        const x0 = -hx * 0.55 + k * 0.16;
        g.box(x0, 0.4, hz - 0.215, x0 + 0.16, 0.9, hz - 0.2, throwC[k]!);
        g.box(x0, 0.9, hz - 0.215, x0 + 0.16, 0.915, hz - 0.03, throwC[k]!);
      }
    }
  },

  mesa_juegos: ({ g, glow, anchors, tier }, d) => {
    const { h } = d;
    const r = Math.min(d.hx, d.hz) - 0.02;
    const top = h;
    // pie central de columna y pata en cruz
    g.cylinder(0, 0, 0, 0.12, 0.08, 0.06, 8, WOOD_DARK);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      g.cylinderBetween(0, 0.05, 0, Math.cos(a) * r * 0.7, 0.02, Math.sin(a) * r * 0.7, 0.035, 4, WOOD_DARK);
    }
    g.cylinder(0, 0.06, 0, 0.07, 0.07, top - 0.12, 8, WOOD);
    g.cylinder(0, top - 0.12, 0, 0.07, 0.22, 0.06, 8, WOOD_DARK);
    // tablero octogonal con canto y tapete verde
    g.cylinder(0, top - 0.06, 0, r, r, 0.06, 8, WOOD_LIGHT, { phase: Math.PI / 8 });
    g.cylinder(0, top, 0, r - 0.07, r - 0.07, 0.006, 8, '#2f6b4f', { phase: Math.PI / 8 });
    // damero 8×8 (casillas oscuras sobre fondo claro) con marco
    const s = 0.05;
    const y = top + 0.006;
    g.box(-4 * s - 0.03, y, -4 * s - 0.03, 4 * s + 0.03, y + 0.012, 4 * s + 0.03, WOOD_DARK);
    g.box(-4 * s, y + 0.012, -4 * s, 4 * s, y + 0.016, 4 * s, '#efe0b9', { ny: true });
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 8; j++) {
        if ((i + j) % 2 === 0) continue;
        const x0 = -4 * s + i * s;
        const z0 = -4 * s + j * s;
        g.quadN(x0, y + 0.017, z0 + s, x0 + s, y + 0.017, z0 + s, x0 + s, y + 0.017, z0, x0, y + 0.017, z0, '#5a3b26');
      }
    // fichas a medio partida (rojas y negras) y unas cuantas comidas junto al tablero
    const pieces: [number, number, string][] = [
      [0, 1, '#bc4749'], [2, 1, '#bc4749'], [1, 2, '#bc4749'], [5, 0, '#bc4749'], [3, 2, '#bc4749'],
      [2, 5, '#22262a'], [4, 5, '#22262a'], [6, 7, '#22262a'], [5, 6, '#22262a'], [3, 4, '#22262a'],
    ];
    for (const [i, j, c] of pieces) g.cylinder(-4 * s + (i + 0.5) * s, y + 0.017, -4 * s + (j + 0.5) * s, 0.019, 0.019, 0.012, 7, c);
    for (let k = 0; k < 3; k++) g.cylinder(0.32, top + 0.006 + k * 0.012, -0.12 + (k % 2) * 0.01, 0.019, 0.019, 0.012, 7, k === 1 ? '#22262a' : '#bc4749');
    // baraja abierta en abanico, mazo y un dado
    for (let k = 0; k < 5; k++) {
      g.push();
      g.translate(-0.3, top + 0.008 + k * 0.002, 0.22);
      g.rotateY(-0.5 + k * 0.22);
      g.box(-0.03, 0, -0.045, 0.03, 0.002, 0.045, k % 2 ? '#f3ead6' : '#ffffff');
      g.box(-0.012, 0.002, -0.02, 0.012, 0.003, 0.0, k % 3 ? '#bc4749' : '#22262a');
      g.pop();
    }
    g.box(-0.36, top + 0.006, -0.28, -0.29, top + 0.04, -0.18, '#457b9d');
    g.boxC(0.25, top + 0.024, 0.28, 0.036, 0.036, 0.036, '#f3ead6');
    // quinqué (luz cálida de la sala)
    const lx = 0.3;
    const lz = -0.3;
    g.cylinder(lx, top + 0.006, lz, 0.06, 0.05, 0.04, 7, BRASS);
    glow.cylinder(lx, top + 0.046, lz, 0.045, 0.055, 0.1, 7, '#ffffff');
    g.cylinder(lx, top + 0.146, lz, 0.035, 0.025, 0.04, 7, BRASS);
    anchors.lamp = new THREE.Vector3(lx, top + 0.12, lz);
    // taburetes en los cuatro puestos de juego (a GAME_REACH del centro, sin colisión como las sillas)
    for (const [x, z] of stoolOffsets()) {
      const sc = tier >= 2 ? '#bc4749' : WOOD;
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.3;
        g.cylinderBetween(x + Math.cos(a) * 0.13, 0, z + Math.sin(a) * 0.13, x + Math.cos(a) * 0.08, 0.42, z + Math.sin(a) * 0.08, 0.022, 4, WOOD_DARK);
      }
      g.cylinder(x, 0.18, z, 0.105, 0.105, 0.02, 6, WOOD_DARK, { capTop: false, capBottom: false });
      g.cylinder(x, 0.41, z, 0.17, 0.17, 0.04, 8, WOOD_LIGHT);
      g.cylinder(x, 0.45, z, 0.15, 0.13, tier >= 2 ? 0.05 : 0.012, 8, tier >= 2 ? sc : shade(WOOD_LIGHT, 0.9));
    }
  },

  estanteria_libros: ({ g, glass, glow, anchors, tier }, d) => {
    const { hx, hz, h } = d;
    const side = 0.05;
    const back = WOOD_DARK;
    const frame = '#7a4f30';
    g.box(-hx, 0, hz - 0.03, hx, h, hz, back);
    g.box(-hx, 0, -hz, -hx + side, h, hz, frame);
    g.box(hx - side, 0, -hz, hx, h, hz, frame);
    g.box(-hx - 0.02, h - 0.05, -hz - 0.03, hx + 0.02, h + 0.02, hz, shade(frame, 0.85));
    g.box(-hx, 0, -hz + 0.02, hx, 0.1, hz, shade(frame, 0.8));
    const shelves = [0.1, 0.48, 0.86, 1.24, 1.62];
    // Con la estufa (nivel 2): hogar de ladrillo en el centro abajo y chimenea que sube por detrás.
    const stove = tier >= 2;
    const cx0 = -0.36;
    const cx1 = 0.36;
    const bookColors = ['#bc4749', '#457b9d', '#e9c46a', '#2a9d8f', '#6d597a', '#f4a261', '#3d5a80', '#8a5a44', '#4f7f72', '#c8553d'];
    for (let si = 0; si < shelves.length; si++) {
      const y = shelves[si]!;
      const blocked = stove && y < 1.0;
      // balda
      if (si > 0) {
        if (blocked) {
          g.box(-hx + side, y - 0.03, -hz + 0.02, cx0, y, hz - 0.03, WOOD);
          g.box(cx1, y - 0.03, -hz + 0.02, hx - side, y, hz - 0.03, WOOD);
        } else g.box(-hx + side, y - 0.03, -hz + 0.02, hx - side, y, hz - 0.03, WOOD);
      }
      // libros de pie, alguno inclinado y pilas tumbadas
      const spans: [number, number][] = blocked ? [[-hx + side + 0.02, cx0 - 0.02], [cx1 + 0.02, hx - side - 0.02]] : [[-hx + side + 0.02, hx - side - 0.02]];
      for (const [a, b] of spans) {
        let x = a;
        let k = 0;
        while (x < b - 0.04) {
          const r = hash01(si, k, Math.round(a * 10));
          const c = bookColors[Math.floor(r * bookColors.length)]!;
          if (r > 0.9 && x < b - 0.25) {
            // pila de libros tumbados
            for (let j = 0; j < 3; j++) g.box(x, y + j * 0.045, -hz + 0.06 + j * 0.01, x + 0.2 - j * 0.02, y + 0.04 + j * 0.045, hz - 0.06, bookColors[(k + j * 3) % bookColors.length]!);
            x += 0.23;
          } else if (r > 0.82 && x > a + 0.1) {
            g.push();
            g.translate(x + 0.02, y, 0);
            g.rotateZ(-0.35);
            g.box(0, 0, -hz + 0.07, 0.045, 0.28, hz - 0.06, c);
            g.pop();
            x += 0.14;
          } else {
            const bw = 0.035 + r * 0.03;
            const bh = 0.22 + ((k * 7) % 5) * 0.025;
            g.box(x, y, -hz + 0.05 + (k % 3) * 0.012, x + bw, y + bh, hz - 0.05, c);
            g.box(x + 0.005, y + bh * 0.7, -hz + 0.045 + (k % 3) * 0.012, x + bw - 0.005, y + bh * 0.76, -hz + 0.05 + (k % 3) * 0.012, '#e9c46a');
            x += bw + 0.004;
          }
          k++;
        }
      }
    }
    // remate: globo terráqueo, barco en botella y una planta
    g.cylinder(-hx + 0.3, h + 0.02, 0, 0.08, 0.06, 0.04, 6, BRASS);
    g.cylinder(-hx + 0.3, h + 0.06, 0, 0.012, 0.012, 0.08, 4, BRASS);
    g.sphere(-hx + 0.3, h + 0.24, 0, 0.12, '#3d7a8a', 1);
    g.sphere(-hx + 0.27, h + 0.28, -0.05, 0.06, '#90be6d', 0, 0.7);
    glassBottle(g, glass, 0.1, h + 0.02, 0);
    g.cylinder(hx - 0.25, h + 0.02, 0, 0.09, 0.11, 0.16, 7, '#c8553d');
    g.sphere(hx - 0.25, h + 0.25, 0, 0.14, PALETTE.plant, 0, 0.8);
    g.sphere(hx - 0.18, h + 0.21, -0.06, 0.09, PALETTE.plantDark, 0, 0.8);
    if (stove) {
      // hogar de ladrillo con estufa de hierro colado; la chimenea sube por la pared hasta el techo
      const brick = '#a4523a';
      g.box(cx0, 0.1, -hz + 0.02, cx1, 1.0, hz - 0.03, brick);
      for (let row = 0; row < 6; row++) g.box(cx0 - 0.005, 0.18 + row * 0.14, -hz + 0.015, cx1 + 0.005, 0.19 + row * 0.14, hz - 0.03, '#d9c3a5');
      g.box(cx0 - 0.04, 1.0, -hz - 0.02, cx1 + 0.04, 1.06, hz, '#4a3326');
      g.box(-0.24, 0.1, -hz - 0.04, 0.24, 0.16, -hz + 0.12, '#2b2f33');
      g.box(-0.2, 0.16, -hz - 0.02, 0.2, 0.66, hz - 0.08, '#2b2f33');
      g.box(-0.22, 0.64, -hz - 0.04, 0.22, 0.7, hz - 0.06, '#3a3f44');
      g.box(-0.13, 0.25, -hz - 0.05, 0.13, 0.52, -hz - 0.02, '#1b1d20');
      glow.box(-0.1, 0.28, -hz - 0.055, 0.1, 0.48, -hz - 0.05, '#ffffff');
      g.box(0.14, 0.38, -hz - 0.08, 0.17, 0.42, -hz - 0.04, BRASS);
      // tubo de humos corto: entra en el ladrillo y sale por la pared, detrás de la estantería
      g.cylinder(0, 0.7, -hz + 0.12, 0.06, 0.06, 0.24, 8, '#2b2f33');
      g.cylinder(0, 0.8, -hz + 0.12, 0.075, 0.075, 0.04, 8, BRASS);
      // leñero a un lado
      for (let k = 0; k < 4; k++) g.cylinderX(0.0, 0.12 + 0.07 * (k % 2), -hz + 0.12 + k * 0.08, 0.035, 0.3, 6, k % 2 ? '#8a5a44' : '#a47148');
      anchors.fire = new THREE.Vector3(0, 0.38, -hz - 0.06);
    }
  },

  ahumadero: ({ g, anchors, tier }, d) => {
    const { hx, hz } = d;
    const plank = '#8a6142';
    const plankDark = shade(plank, 0.75);
    const roofC = '#5c6770';
    const double = tier >= 2;
    const wallH = 1.55;
    // zócalo de piedra con el hogar
    g.box(-hx, 0, -hz, hx, 0.32, hz, '#8d8478');
    for (let k = 0; k < 6; k++) g.box(-hx - 0.005, 0.1 + (k % 2) * 0.1, -hz - 0.005 + (k % 3) * 0.002, -hx + 0.25 + k * 0.3, 0.11 + (k % 2) * 0.1, -hz, '#6f675d');
    const fires = double ? [-hx * 0.48, hx * 0.48] : [-hx * 0.45];
    for (const fx of fires) {
      g.box(fx - 0.2, 0.06, -hz - 0.02, fx + 0.2, 0.28, -hz, '#2b2f33');
      g.box(fx - 0.15, 0.1, -hz - 0.03, fx + 0.15, 0.24, -hz - 0.02, '#1b1d20');
    }
    anchors.firebox = new THREE.Vector3(fires[0]!, 0.17, -hz - 0.04);
    if (double) anchors.firebox2 = new THREE.Vector3(fires[1]!, 0.17, -hz - 0.04);
    // caseta de tablones con rendijas (verticales) y su armazón
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x0 = -hx + 0.04 + (i / n) * (2 * hx - 0.08);
      const x1 = x0 + (2 * hx - 0.08) / n - 0.025;
      const c = shade(plank, 0.9 + hash01(i, 3) * 0.18);
      g.box(x0, 0.32, -hz + 0.02, x1, wallH, -hz + 0.06, c);
      g.box(x0, 0.32, hz - 0.06, x1, wallH, hz - 0.02, c);
    }
    for (let i = 0; i < 6; i++) {
      const z0 = -hz + 0.06 + (i / 6) * (2 * hz - 0.12);
      const z1 = z0 + (2 * hz - 0.12) / 6 - 0.025;
      for (const sx of [-1, 1]) {
        const c = shade(plank, 0.95 + hash01(i, sx) * 0.1);
        const xa = sx < 0 ? -hx + 0.02 : hx - 0.06;
        const xb = xa + 0.04;
        // hueco de la rejilla de ventilación en la parte alta
        const open = z1 > -0.32 && z0 < 0.32;
        if (open) {
          g.box(xa, 0.32, z0, xb, wallH - 0.62, z1, c);
          g.box(xa, wallH - 0.16, z0, xb, wallH, z1, c);
        } else g.box(xa, 0.32, z0, xb, wallH, z1, c);
      }
    }
    g.box(-hx + 0.06, 0.32, -hz + 0.06, hx - 0.06, 0.36, hz - 0.06, '#3a2a20');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * hx - 0.06, 0.32, sz * hz - 0.06, sx * hx + 0.02 * sx, wallH + 0.05, sz * hz + 0.02 * sz, plankDark);
    for (const sz of [-1, 1]) g.box(-hx, wallH - 0.08, sz * hz - 0.06, hx, wallH, sz * hz + 0.02 * sz, plankDark);
    // puerta(s) con travesaños y pasador; mirilla con rejilla
    const doors = double ? [-hx * 0.48, hx * 0.48] : [0];
    for (const dx of doors) {
      const w = double ? 0.36 : 0.42;
      g.box(dx - w, 0.4, -hz - 0.01, dx + w, wallH - 0.12, -hz + 0.02, shade(plank, 0.82));
      for (const y of [0.55, wallH - 0.3]) g.box(dx - w + 0.03, y, -hz - 0.03, dx + w - 0.03, y + 0.07, -hz - 0.01, plankDark);
      g.cylinderBetween(dx - w + 0.05, 0.62, -hz - 0.035, dx + w - 0.05, wallH - 0.32, -hz - 0.035, 0.022, 4, plankDark);
      g.box(dx + w - 0.12, 0.85, -hz - 0.06, dx + w - 0.04, 0.9, -hz - 0.01, STEEL_DARK);
      g.box(dx - 0.13, wallH - 0.42, -hz - 0.02, dx + 0.13, wallH - 0.22, -hz - 0.01, '#1b1d20');
      for (let k = 0; k < 3; k++) g.box(dx - 0.12 + k * 0.1, wallH - 0.42, -hz - 0.03, dx - 0.1 + k * 0.1, wallH - 0.22, -hz - 0.02, STEEL_DARK);
    }
    // tejado a dos aguas de chapa
    const ridge = d.h - 0.05;
    const ov = 0.12;
    g.quadN(-hx - ov, wallH - 0.04, -hz - ov, hx + ov, wallH - 0.04, -hz - ov, hx + ov, ridge, 0, -hx - ov, ridge, 0, roofC);
    g.quadN(hx + ov, wallH - 0.04, hz + ov, -hx - ov, wallH - 0.04, hz + ov, -hx - ov, ridge, 0, hx + ov, ridge, 0, shade(roofC, 0.9));
    g.quadN(hx + ov, wallH - 0.04, -hz - ov, -hx - ov, wallH - 0.04, -hz - ov, -hx - ov, ridge, 0, hx + ov, ridge, 0, shade(roofC, 0.7));
    g.quadN(-hx - ov, wallH - 0.04, hz + ov, hx + ov, wallH - 0.04, hz + ov, hx + ov, ridge, 0, -hx - ov, ridge, 0, shade(roofC, 0.7));
    for (const sx of [-1, 1]) {
      g.tri(sx * hx, wallH, -hz, sx * hx, wallH, hz, sx * hx, ridge - 0.04, 0, plankDark);
      g.tri(sx * hx, wallH, hz, sx * hx, wallH, -hz, sx * hx, ridge - 0.04, 0, plankDark);
    }
    g.cylinderX(0, ridge, 0, 0.03, 2 * hx + 2 * ov, 4, shade(roofC, 0.8));
    // chimenea(s) con sombrerete
    const chim = double ? [-hx * 0.5, hx * 0.5] : [hx * 0.35];
    chim.forEach((cx, i) => {
      const top = ridge + 0.55 + i * 0.12;
      g.cylinder(cx, wallH - 0.1, 0.05, 0.08, 0.08, top - wallH + 0.1, 8, '#3a3f44');
      g.cylinder(cx, top - 0.02, 0.05, 0.12, 0.02, 0.1, 8, '#2b2f33');
      g.cylinder(cx, top - 0.1, 0.05, 0.1, 0.1, 0.04, 8, PALETTE.rust);
      anchors[i === 0 ? 'chimney' : 'chimney2'] = new THREE.Vector3(cx, top + 0.05, 0.05);
    });
    // rejillas de ventilación en los costados (por ellas se ve el pescado colgado)
    for (const sx of [-1, 1]) {
      const x = sx * (hx + 0.005);
      g.box(x - 0.012, wallH - 0.62, -0.32, x + 0.012, wallH - 0.58, 0.32, plankDark);
      g.box(x - 0.012, wallH - 0.2, -0.32, x + 0.012, wallH - 0.16, 0.32, plankDark);
      for (let k = 0; k < 5; k++) g.box(x - 0.012, wallH - 0.58, -0.3 + k * 0.15, x + 0.012, wallH - 0.2, -0.28 + k * 0.15, STEEL_DARK);
    }
    // leña apilada contra el costado derecho
    for (let k = 0; k < 7; k++) {
      const row = Math.floor(k / 3);
      const col = k % 3;
      g.cylinderZ(hx + 0.08 + col * 0.09 - row * 0.04, 0.05 + row * 0.085, 0, 0.045, 2 * hz - 0.3, 6, col % 2 ? '#8a5a44' : '#a47148');
    }
    anchors.plaque = new THREE.Vector3(double ? 0 : hx * 0.62, 1.2, -hz - 0.025);
    anchors.racks = new THREE.Vector3(0, wallH - 0.25, 0);
  },

  tanque_peces: ({ g, glass, anchors, tier }, d) => {
    const { hx, hz, h } = d;
    const frame = '#4a6670';
    const y0 = 0.36;
    const y1 = h - 0.04;
    const tx = hx - 0.05;
    const tz = hz - 0.05;
    // bancada de acero con faldón delantero
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * tx - 0.05, 0, sz * tz - 0.05, sx * tx + 0.05, y0, sz * tz + 0.05, STEEL_DARK);
    for (const sz of [-1, 1]) g.box(-tx, y0 - 0.08, sz * tz - 0.04, tx, y0, sz * tz + 0.04, STEEL_DARK);
    for (const sx of [-1, 1]) g.box(sx * tx - 0.04, y0 - 0.08, -tz, sx * tx + 0.04, y0, tz, STEEL_DARK);
    g.box(-tx + 0.05, 0.06, -tz - 0.02, tx - 0.05, y0 - 0.08, -tz + 0.0, shade(frame, 0.85));
    g.box(-tx + 0.05, 0.06, -tz + 0.0, tx - 0.05, 0.1, tz, STEEL_DARK);
    // bomba de circulación bajo el tanque, con mangueras que suben al borde
    g.box(-tx + 0.15, 0.1, -0.2, -tx + 0.6, 0.3, 0.25, '#2f4858');
    g.cylinderX(-tx + 0.72, 0.2, 0.02, 0.09, 0.24, 8, '#457b9d');
    g.cylinderBetween(-tx + 0.3, 0.3, 0.25, -tx + 0.1, y1 + 0.05, tz - 0.12, 0.025, 5, '#22262a');
    g.cylinderBetween(-tx + 0.1, y1 + 0.05, tz - 0.12, -tx + 0.35, y1 - 0.05, tz - 0.12, 0.025, 5, '#22262a');
    // fondo de grava, rocas y algas
    g.box(-tx + 0.03, y0, -tz + 0.03, tx - 0.03, y0 + 0.05, tz - 0.03, '#2f4858');
    for (let k = 0; k < 26; k++) {
      const x = -tx + 0.1 + hash01(k, 1) * (2 * tx - 0.2);
      const z = -tz + 0.1 + hash01(k, 2) * (2 * tz - 0.2);
      g.boxC(x, y0 + 0.06, z, 0.07, 0.035, 0.06, ['#c9b79c', '#8d8478', '#e9dcc0'][k % 3]!);
    }
    g.sphere(tx * 0.45, y0 + 0.1, tz * 0.3, 0.16, '#6f675d', 0, 0.7);
    g.sphere(-tx * 0.5, y0 + 0.08, -tz * 0.25, 0.12, '#8d8478', 0, 0.6);
    for (let k = 0; k < 7; k++) {
      const x = -tx * 0.7 + hash01(k, 5) * tx * 1.4;
      const z = tz * 0.15 + hash01(k, 6) * tz * 0.6;
      const hh = 0.25 + hash01(k, 7) * 0.35;
      g.cylinderBetween(x, y0 + 0.05, z, x + (hash01(k, 8) - 0.5) * 0.15, y0 + 0.05 + hh, z + 0.03, 0.022, 3, k % 2 ? '#3a7d44' : '#5b9b4a');
    }
    // cantoneras y marco superior
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.box(sx * tx - 0.035, y0, sz * tz - 0.035, sx * tx + 0.035, y1 + 0.04, sz * tz + 0.035, frame);
    for (const sz of [-1, 1]) g.box(-tx - 0.035, y1, sz * tz - 0.035, tx + 0.035, y1 + 0.05, sz * tz + 0.035, frame);
    for (const sx of [-1, 1]) g.box(sx * tx - 0.035, y1, -tz, sx * tx + 0.035, y1 + 0.05, tz, frame);
    g.box(-0.04, y1, -tz, 0.04, y1 + 0.05, tz, frame);
    // cristales (las cuatro caras, hacia fuera)
    glass.quadN(tx, y0, -tz, -tx, y0, -tz, -tx, y1, -tz, tx, y1, -tz, '#ffffff');
    glass.quadN(-tx, y0, tz, tx, y0, tz, tx, y1, tz, -tx, y1, tz, '#ffffff');
    glass.quadN(-tx, y0, -tz, -tx, y0, tz, -tx, y1, tz, -tx, y1, -tz, '#ffffff');
    glass.quadN(tx, y0, tz, tx, y0, -tz, tx, y1, -tz, tx, y1, tz, '#ffffff');
    if (tier >= 2) {
      // aireadores: compresor de aire con tubos a dos piedras difusoras
      g.box(tx - 0.55, 0.1, -0.15, tx - 0.15, 0.28, 0.2, '#dfe6e9');
      g.box(tx - 0.5, 0.28, -0.1, tx - 0.2, 0.3, 0.15, STEEL);
      for (const x of [-tx * 0.4, tx * 0.35]) {
        g.cylinderBetween(tx - 0.2, 0.28, 0.2, tx - 0.05, y1 + 0.06, tz - 0.06, 0.012, 3, '#e9efe9');
        g.cylinderBetween(tx - 0.05, y1 + 0.06, tz - 0.06, x, y1 + 0.06, tz - 0.06, 0.012, 3, '#e9efe9');
        g.cylinderBetween(x, y1 + 0.06, tz - 0.06, x, y0 + 0.08, tz - 0.12, 0.012, 3, '#e9efe9');
        g.cylinder(x, y0 + 0.05, tz - 0.12, 0.05, 0.05, 0.05, 6, '#bfc8cc');
      }
      anchors.bubbles = new THREE.Vector3(-tx * 0.4, 0, tz - 0.12);
      anchors.bubbles2 = new THREE.Vector3(tx * 0.35, 0, tz - 0.12);
      // toldo de sombra sobre cuatro postes
      const sh = 2.15;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cylinder(sx * (tx + 0.02), y1 + 0.05, sz * (tz + 0.02), 0.025, 0.025, sh - y1 - 0.05, 5, STEEL);
      for (let i = 0; i < 6; i++) {
        const x0 = -tx - 0.1 + (i / 6) * (2 * tx + 0.2);
        const x1 = x0 + (2 * tx + 0.2) / 6;
        const c = i % 2 ? PALETTE.canvas : '#2a9d8f';
        g.quadN(x0, sh, tz + 0.12, x1, sh, tz + 0.12, x1, sh + 0.12, -tz - 0.12, x0, sh + 0.12, -tz - 0.12, c);
        g.quadN(x1, sh, tz + 0.12, x0, sh, tz + 0.12, x0, sh + 0.12, -tz - 0.12, x1, sh + 0.12, -tz - 0.12, shade(c, 0.8));
      }
    }
    anchors.water = new THREE.Vector3(0, y0 + 0.05, 0);
    anchors.tank = new THREE.Vector3(tx - 0.03, y1 - 0.1 - (y0 + 0.05), tz - 0.03);
    anchors.led = new THREE.Vector3(-tx + 0.3, 0.22, -tz - 0.03);
    anchors.plaque = new THREE.Vector3(tx - 0.4, 0.22, -tz - 0.03);
  },

  grua: ({ g, part, anchors, tier }, d) => {
    const { hx, hz } = d;
    const yellow = '#e0a458';
    const yellowDark = shade(yellow, 0.8);
    const long = tier >= 2;
    // placa de anclaje atornillada, pedestal troncocónico y corona de giro
    g.box(-hx + 0.05, 0, -hz + 0.05, hx - 0.05, 0.06, hz - 0.05, STEEL_DARK);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.cylinder(sx * (hx - 0.15), 0.06, sz * (hz - 0.15), 0.04, 0.04, 0.04, 6, STEEL);
    g.frustum(0, 0.06, 0, 0.78, 0.78, 0.5, 0.5, 0.84, yellow);
    g.cylinder(0, 0.9, 0, 0.42, 0.42, 0.08, 12, '#2b2f33');
    // caja de mando con LED y placa
    g.box(-0.2, 0.32, -0.46, 0.2, 0.66, -0.3, '#2b2d42');
    g.box(-0.16, 0.36, -0.465, 0.16, 0.6, -0.46, '#3a3f44');
    anchors.led = new THREE.Vector3(0.11, 0.56, -0.47);
    anchors.plaque = new THREE.Vector3(-0.04, 0.44, -0.475);
    anchors.turret = new THREE.Vector3(0, 0.98, 0);
    // --- Torreta (gira): plataforma, caseta del cabrestante y contrapeso ---
    const t = part('turret');
    t.cylinder(0, 0, 0, 0.48, 0.48, 0.06, 12, STEEL_DARK);
    t.box(-0.32, 0.06, 0.0, 0.32, 0.6, 0.6, yellow);
    t.box(-0.34, 0.6, -0.02, 0.34, 0.65, 0.62, yellowDark);
    for (let k = 0; k < 4; k++) t.box(0.322, 0.2 + k * 0.08, 0.15, 0.326, 0.24 + k * 0.08, 0.45, '#2b2f33');
    t.box(-0.36, 0.06, 0.6, 0.36, 0.5, 0.78, '#3a3f44');
    for (let k = 0; k < 4; k++) {
      t.push();
      t.translate(-0.27 + k * 0.18, 0.28, 0.785);
      t.rotateZ(0.6);
      t.box(-0.03, -0.16, -0.005, 0.03, 0.16, 0.0, '#e9c46a');
      t.pop();
    }
    // horquillas del pivote de la pluma y del cilindro hidráulico
    for (const sx of [-1, 1]) {
      t.box(sx * 0.13 - 0.02, 0.6, -0.3, sx * 0.13 + 0.02, 0.95, -0.06, yellowDark);
      t.box(sx * 0.07 - 0.015, 0.06, -0.46, sx * 0.07 + 0.015, 0.22, -0.3, yellowDark);
    }
    t.cylinderX(0, 0.85, -0.18, 0.04, 0.32, 6, STEEL);
    anchors.boomPivot = new THREE.Vector3(0, 0.85, -0.18);
    anchors.ramBase = new THREE.Vector3(0, 0.15, -0.38);
    anchors.drum = new THREE.Vector3(0, 0.34, -0.1);
    // tambor del cabrestante (gira al recoger cable)
    const dr = part('drum');
    dr.cylinderX(0, 0, 0, 0.13, 0.42, 10, '#3a3f44');
    dr.cylinderX(0, 0, 0, 0.11, 0.36, 10, PALETTE.rope);
    for (const x of [-0.19, 0.19]) dr.cylinderX(x, 0, 0, 0.16, 0.03, 10, yellowDark);
    for (let k = 0; k < 5; k++) dr.cylinderX(-0.14 + k * 0.07, 0, 0, 0.118, 0.02, 10, shade(PALETTE.rope, 0.8));
    // --- Pluma principal (sale hacia -z desde el pivote) ---
    const L1 = long ? 2.9 : 2.2;
    const b = part('boom');
    b.box(-0.09, -0.11, 0.08, 0.09, 0.11, -L1, yellow);
    b.box(-0.095, 0.09, 0.0, 0.095, 0.115, -L1 + 0.05, yellowDark);
    for (let k = 0; k < 3; k++) b.box(-0.096, -0.11, -L1 + 0.12 + k * 0.16, 0.096, 0.11, -L1 + 0.2 + k * 0.16, k % 2 ? '#2b2f33' : yellow);
    if (long) {
      // tramo telescópico de la pluma larga
      b.box(-0.1, -0.12, -L1 + 0.75, 0.1, 0.12, -L1 + 0.65, STEEL_DARK);
      b.box(-0.075, -0.085, -L1 + 0.7, 0.075, 0.085, -L1 - 0.02, '#c8553d');
    }
    for (const sx of [-1, 1]) b.box(sx * 0.1 - 0.012, -0.16, -0.95, sx * 0.1 + 0.012, -0.06, -0.8, yellowDark);
    b.cylinderX(0, 0, -L1, 0.06, 0.24, 8, STEEL);
    anchors.boomTip = new THREE.Vector3(0, 0, -L1);
    anchors.ramLug = new THREE.Vector3(0, -0.13, -0.88);
    // --- Brazo articulado (desde la punta de la pluma) ---
    const L2 = long ? 1.6 : 1.25;
    const j = part('jib');
    j.box(-0.065, -0.08, 0.05, 0.065, 0.08, -L2, yellow);
    j.box(-0.07, -0.085, -L2 + 0.12, 0.07, 0.085, -L2 + 0.22, '#2b2f33');
    j.cylinderX(0, -0.06, -L2 - 0.02, 0.09, 0.08, 10, '#2b2f33');
    j.cylinderX(0, -0.06, -L2 - 0.02, 0.03, 0.18, 6, STEEL);
    anchors.jibTip = new THREE.Vector3(0, -0.15, -L2 - 0.02);
    // --- Cilindro hidráulico (eje +y, longitud 1: se estira entre sus dos apoyos) ---
    const r = part('ram');
    r.cylinder(0, 0, 0, 0.055, 0.055, 0.62, 8, '#2b2f33');
    r.cylinder(0, 0.62, 0, 0.032, 0.032, 0.38, 8, '#d9dee2');
    // --- Gancho con su motón (cuelga hacia -y desde el cable) ---
    const hk = part('hook');
    hk.box(-0.08, -0.22, -0.05, 0.08, 0.0, 0.05, yellow);
    hk.cylinderZ(0, -0.1, 0, 0.055, 0.11, 8, '#2b2f33');
    hk.cylinder(0, -0.32, 0, 0.02, 0.02, 0.1, 5, STEEL_DARK);
    hk.cylinderBetween(0, -0.32, 0, 0.0, -0.44, 0.06, 0.02, 4, STEEL_DARK);
    hk.cylinderBetween(0, -0.44, 0.06, 0.0, -0.46, 0.14, 0.02, 4, STEEL_DARK);
    hk.cylinderBetween(0, -0.46, 0.14, 0.0, -0.38, 0.17, 0.02, 4, STEEL_DARK);
    // --- Carga izada: red con lo rescatado ---
    const ld = part('load');
    ld.sphere(0, -0.42, 0, 0.36, '#8a6142', 0, 0.85);
    ld.box(-0.2, -0.5, -0.24, 0.16, -0.22, 0.12, WOOD_LIGHT);
    for (let k = 0; k < 3; k++) {
      ld.push();
      ld.translate(0, -0.42, 0);
      ld.rotateY((k / 3) * Math.PI);
      ld.ring(0, 0, 0, 0.37, 0.018, 10, PALETTE.rope, 3);
      ld.pop();
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      ld.cylinderBetween(0, 0, 0, Math.cos(a) * 0.3, -0.25, Math.sin(a) * 0.3, 0.012, 3, PALETTE.rope);
    }
  },

  radar: ({ g, glow, part, anchors }, d) => {
    const { hx, hz, h } = d;
    const cab = '#55707a';
    // zócalo y armario de la radio, con diales, altavoz y el micrófono colgado
    g.box(-hx + 0.02, 0, -hz + 0.02, hx - 0.02, 0.08, hz - 0.02, STEEL_DARK);
    g.box(-0.48, 0.08, -hz + 0.04, 0.48, 1.05, -0.08, cab);
    g.box(-0.5, 1.05, -hz + 0.02, 0.5, 1.1, -0.06, shade(cab, 0.8));
    g.box(-0.42, 0.62, -hz + 0.03, 0.42, 0.98, -hz + 0.04, '#2b2d42');
    glow.box(-0.36, 0.86, -hz + 0.022, 0.06, 0.94, -hz + 0.03, '#ffffff');
    g.box(-0.36, 0.895, -hz + 0.018, 0.06, 0.9, -hz + 0.022, '#bc4749');
    for (let k = 0; k < 3; k++) {
      g.push();
      g.translate(-0.3 + k * 0.17, 0.72, -hz + 0.025);
      g.disc(0, 0, 0, 0.045, 8, '#d9dee2', true);
      g.box(-0.006, 0, -0.008, 0.006, 0.04, -0.004, '#2b2d42');
      g.pop();
    }
    for (let k = 0; k < 6; k++) g.box(0.12, 0.66 + k * 0.05, -hz + 0.025, 0.36, 0.68 + k * 0.05, -hz + 0.03, '#3a3f44');
    g.box(-0.42, 0.12, -hz + 0.03, 0.42, 0.56, -hz + 0.04, shade(cab, 0.9));
    g.boxC(0.3, 0.42, -hz + 0.02, 0.1, 0.03, 0.02, STEEL);
    // micrófono con su cable rizado
    g.box(-0.46, 0.58, -hz - 0.0, -0.4, 0.62, -hz + 0.04, STEEL_DARK);
    g.box(-0.5, 0.42, -hz - 0.04, -0.4, 0.58, -hz + 0.0, '#22262a');
    g.cylinderBetween(-0.45, 0.42, -hz - 0.02, -0.3, 0.3, -hz + 0.02, 0.01, 3, '#22262a');
    // torre de celosía de tres patas detrás del armario
    const top = h - 0.42;
    const tz = 0.18;
    const legs: [number, number][] = [
      [-hx + 0.1, hz - 0.08],
      [hx - 0.1, hz - 0.08],
      [0, -0.02],
    ];
    for (const [x, z] of legs) g.cylinderBetween(x, 0.08, z, x * 0.25, top, tz + (z - tz) * 0.25, 0.035, 5, STEEL);
    for (let y = 0.4; y < top - 0.1; y += 0.45) {
      const f = (y - 0.08) / (top - 0.08);
      const pts = legs.map(([x, z]) => [x + (x * 0.25 - x) * f, z + (tz + (z - tz) * 0.25 - z) * f] as const);
      for (let i = 0; i < 3; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % 3]!;
        g.cylinderBetween(a[0], y, a[1], b[0], y, b[1], 0.015, 3, STEEL);
      }
    }
    g.cylinder(0, top, tz, 0.26, 0.26, 0.05, 10, STEEL_DARK);
    g.cylinder(0, top + 0.05, tz, 0.12, 0.09, 0.2, 8, '#dfe6e9');
    anchors.antenna = new THREE.Vector3(0, top + 0.25, tz);
    // antena de látigo de la radio
    g.cylinder(0.42, 1.1, -0.2, 0.025, 0.025, 0.08, 6, STEEL_DARK);
    g.cylinder(0.42, 1.18, -0.2, 0.008, 0.004, 1.9, 3, '#d9dee2');
    g.sphere(0.42, 3.08, -0.2, 0.025, '#bc4749');
    // antena del radar (gira alrededor de su eje)
    const a = part('antenna');
    a.cylinder(0, 0, 0, 0.05, 0.05, 0.12, 6, STEEL_DARK);
    a.box(-0.68, 0.12, -0.06, 0.68, 0.22, 0.06, '#2b2d42');
    a.box(-0.66, 0.135, -0.065, 0.66, 0.205, -0.06, '#9aa5ad');
    for (let k = 0; k < 12; k++) a.box(-0.6 + k * 0.11, 0.14, -0.068, -0.56 + k * 0.11, 0.2, -0.064, '#22262a');
    a.box(-0.7, 0.1, -0.08, -0.66, 0.24, 0.08, '#2b2d42');
    a.box(0.66, 0.1, -0.08, 0.7, 0.24, 0.08, '#2b2d42');
    anchors.led = new THREE.Vector3(0.32, 0.94, -hz + 0.02);
    anchors.plaque = new THREE.Vector3(-0.2, 0.34, -hz + 0.025);
  },
};

/** Posiciones locales de los cuatro taburetes de la mesa de juegos (los puestos de los lados). */
export function stoolOffsets(): [number, number][] {
  return [
    [0, -GAME_REACH],
    [-GAME_REACH, 0],
    [0, GAME_REACH],
    [GAME_REACH, 0],
  ];
}

/** Barco dentro de una botella tumbada sobre su soporte. */
function glassBottle(g: GeoBuilder, glass: GeoBuilder, x: number, y: number, z: number): void {
  g.box(x - 0.14, y, z - 0.05, x + 0.14, y + 0.03, z + 0.05, WOOD_DARK);
  glass.cylinderX(x, y + 0.09, z, 0.06, 0.26, 7, '#ffffff');
  glass.cylinderX(x + 0.17, y + 0.09, z, 0.025, 0.08, 6, '#ffffff');
  g.cylinderX(x + 0.225, y + 0.09, z, 0.02, 0.03, 6, '#8a5a44');
  g.box(x - 0.08, y + 0.05, z - 0.02, x + 0.08, y + 0.07, z + 0.02, '#8a5a44');
  g.box(x - 0.005, y + 0.07, z - 0.003, x + 0.005, y + 0.14, z + 0.003, WOOD_DARK);
  g.box(x - 0.04, y + 0.08, z - 0.002, x + 0.0, y + 0.13, z + 0.002, '#f3ead6');
}

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

/* ------------------------------------------------------------------ */
/* Modelos de Blender                                                  */
/* ------------------------------------------------------------------ */

/**
 * Altura a la que se exportan las piezas móviles de Blender (`prop_<kind>_<pieza>`): su pivote
 * queda en (0, PIECE_LIFT, 0) y aquí se vuelve a bajar (todo modelo queda apoyado en y ≥ 0).
 */
export const PIECE_LIFT = 1;

/** Nombre de la pieza `moving` de cada prop en Blender (`prop_<kind>_<nombre>`; por defecto «movil»). */
const MOVING_PIECE: Partial<Record<PropKind, string>> = { timon: 'rueda' };

let blenderProps = true;

/** Usa (o no) los modelos de Blender de los props; vacía la caché para que se reconstruyan. */
export function setBlenderProps(on: boolean): void {
  blenderProps = on;
  cache.clear();
}

/** Hay algún modelo de Blender para este prop y nivel (base, del nivel o pieza móvil). */
export function hasBlenderProp(kind: PropKind, tier = 1): boolean {
  if (!blenderProps) return false;
  return hasModel(`prop_${kind}`) || hasModel(`prop_${kind}@${tier}`) || hasModel(`prop_${kind}_${MOVING_PIECE[kind] ?? 'movil'}`);
}

// Comparar en el juego: mueblesBlender(false) / mueblesBlender(true) (rehace el barco).
registerDebug('mueblesBlender', ((on = true) => {
  setBlenderProps(!!on);
  (globalThis as { __game?: { sim?: { shipChanged?: () => void } } }).__game?.sim?.shipChanged?.();
  return !!on;
}) as never);

let authored: Map<PropKind, PropDims | null> | null = null;

/** Medidas con las que se modeló cada prop en Blender: su colisionador en data/modules.ts (null: tamaño fijo). */
function authoredDims(kind: PropKind): PropDims | null {
  if (!authored) {
    authored = new Map();
    for (const m of MODULE_LIST)
      for (const p of m.props) if (!authored.has(p.kind)) authored.set(p.kind, p.collider ? { hx: p.collider[0], hz: p.collider[1], h: p.collider[2] } : null);
  }
  return authored.get(kind) ?? null;
}

/**
 * Reparte un cambio de medida sin deformar los bordes: la franja exterior (`m`) se desplaza
 * entera (postes, cantos, herrajes) y solo se estira o encoge el centro.
 */
function slice(v: number, from: number, to: number, lo = false): number {
  if (Math.abs(from - to) < 1e-4) return v;
  const m = Math.min(0.15, from * 0.25);
  if (lo) return v <= from - m ? (v * (to - m)) / (from - m) : v - from + to;
  const a = Math.abs(v);
  return Math.sign(v) * (a <= from - m ? (a * (to - m)) / (from - m) : a - from + to);
}

/** Geometría de un modelo ajustada de sus medidas de modelado a las del layout. */
export function fitToDims(geo: THREE.BufferGeometry, from: PropDims | null, to: PropDims): THREE.BufferGeometry {
  if (!from || (Math.abs(from.hx - to.hx) < 1e-4 && Math.abs(from.hz - to.hz) < 1e-4 && Math.abs(from.h - to.h) < 1e-4)) return geo;
  const out = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = out.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, slice(p.getX(i), from.hx, to.hx), slice(p.getY(i), from.h, to.h, true), slice(p.getZ(i), from.hz, to.hz));
  return out;
}

/** Los vértices de `geo` a partir de `from` (lo que el builder añadió tras `extras()`). */
function tail(geo: THREE.BufferGeometry, from: number): THREE.BufferGeometry | null {
  const p = geo.getAttribute('position');
  if (from >= p.count) return null;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'color'] as const) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    out.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(from * 3), 3));
  }
  return out;
}

/** Modelo base + extras procedimentales en una sola geometría (posición, normal plana y color). */
function merge(base: THREE.BufferGeometry, rest: THREE.BufferGeometry | null, lift = 0): THREE.BufferGeometry {
  const b = new GeoBuilder();
  b.appendGeometry(base, lift ? new THREE.Matrix4().makeTranslation(0, -lift, 0) : null);
  if (rest) b.appendGeometry(rest);
  return b.build();
}

interface Built {
  solid: THREE.BufferGeometry;
  moving: THREE.BufferGeometry | null;
  /** Vértices de `solid` y `moving` al llamar a `extras()` (null si el builder no lo marca). */
  mark: { solid: number; moving: number } | null;
}

/**
 * Sustituye la geometría sólida (y la pieza móvil) del procedimental por la de Blender si existe
 * (ver la cabecera). Devuelve null si este prop y nivel siguen siendo procedimentales.
 */
function blenderGeometry(kind: PropKind, t: number, d: PropDims, built: Built): { solid: THREE.BufferGeometry | null; moving: THREE.BufferGeometry | null } {
  const res = { solid: null as THREE.BufferGeometry | null, moving: null as THREE.BufferGeometry | null };
  if (!blenderProps) return res;
  // Sin modelo del nivel, la base solo vale si el nivel no la cambia (marca de extras o nivel 1).
  const baseOk = t === 1 || built.mark !== null;
  const whole = modelGeometry(`prop_${kind}@${t}`);
  const base = whole ? null : baseOk ? modelGeometry(`prop_${kind}`) : null;
  if (whole) res.solid = merge(fitToDims(whole, authoredDims(kind), d), null);
  else if (base) res.solid = merge(fitToDims(base, authoredDims(kind), d), built.mark ? tail(built.solid, built.mark.solid) : null);
  const piece = baseOk ? modelGeometry(`prop_${kind}_${MOVING_PIECE[kind] ?? 'movil'}`) : null;
  if (piece && built.moving) res.moving = merge(piece, built.mark ? tail(built.moving, built.mark.moving) : null, PIECE_LIFT);
  return res;
}

/**
 * Modelo (cacheado) de un tipo de prop con unas medidas. `tier` y `moduleType` eligen la variante
 * de la mejora (ver `propTier`); sin ellos, el modelo básico. Con modelos de Blender cargados, la
 * geometría sólida y las piezas salen de ellos (ver la cabecera); lo demás, del procedimental.
 */
export function propModel(kind: PropKind, d: PropDims, tier = 1, moduleType = ''): PropModel {
  const t = propTier(kind, moduleType, tier);
  const k = `${kind}|${d.hx.toFixed(3)}|${d.hz.toFixed(3)}|${d.h.toFixed(3)}|${t}|${hasBlenderProp(kind, t) ? 'b' : 'p'}`;
  let m = cache.get(k);
  if (m) return m;
  const parts = new Map<string, GeoBuilder>();
  let mark: Built['mark'] = null;
  const ctx: Ctx = {
    g: new GeoBuilder(),
    glass: new GeoBuilder(),
    glow: new GeoBuilder(),
    moving: new GeoBuilder(),
    contents: new GeoBuilder(),
    tiers: [],
    anchors: {},
    tier: t,
    part: (name) => {
      let b = parts.get(name);
      if (!b) parts.set(name, (b = new GeoBuilder()));
      return b;
    },
    extras: () => {
      mark = { solid: ctx.g.vertexCount, moving: ctx.moving.vertexCount };
    },
  };
  const b = BUILDERS[kind];
  b(ctx, d);
  const anchors = ctx.anchors;
  let movingPivot: THREE.Vector3 | null = null;
  if (kind === 'timon' && anchors.wheel) movingPivot = anchors.wheel.clone();
  defaultPlaque(anchors, d);
  const builtParts: Record<string, THREE.BufferGeometry> = {};
  for (const [name, pb] of parts) {
    const piece = blenderProps ? modelGeometry(`prop_${kind}_${name}`) : null;
    builtParts[name] = piece ? merge(piece, null, PIECE_LIFT) : pb.build();
  }
  const solid = ctx.g.build();
  const moving = ctx.moving.isEmpty() ? null : ctx.moving.build();
  const bl = blenderGeometry(kind, t, d, { solid, moving, mark });
  m = {
    solid: bl.solid ?? solid,
    glass: ctx.glass.isEmpty() ? null : ctx.glass.build(),
    glow: ctx.glow.isEmpty() ? null : ctx.glow.build(),
    moving: bl.moving ?? moving,
    movingPivot,
    contents: ctx.contents.isEmpty() ? null : ctx.contents.build(),
    tiers: ctx.tiers,
    anchors,
    parts: builtParts,
    tier: t,
  };
  cache.set(k, m);
  return m;
}

/** Todas las clases de prop con modelo (para tests). */
export const MODELLED_KINDS = Object.keys(BUILDERS) as PropKind[];

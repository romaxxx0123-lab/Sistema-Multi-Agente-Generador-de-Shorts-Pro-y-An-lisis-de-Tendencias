/**
 * MODELOS DE PUERTO ESPERANZA (low-poly, colores por vértice + emisión nocturna `aEmit`):
 *
 * - `houseboatClusterModel`: grupo de barcos-hogar amarrados unos a otros, con pasarelas entre
 *   las bordas, casitas de colores, huertos colgantes, ristras de farolillos, farolas, ropa
 *   tendida, placas solares y un pantalán con un bote amarrado.
 * - `greenTowerModel`: el islote del puerto con la torre de la gran luz verde, la plaza, casitas,
 *   el muelle principal con farolas y el viejo Albatros amarrado (y su placa).
 * - `harborBoatModel`: botes que van y vienen (bote de remos, lancha, velero pequeño).
 * - `channelBuoyModel`: boyas de la bocana (roja a babor y verde a estribor al entrar).
 *
 * Convención (como models.ts): el agua es y = 0, +x es la eslora. Cada modelo devuelve una sola
 * geometría con `color` y `aEmit` (para `litMaterial`) y la lista de luces para los halos.
 *
 * Los tres modelos grandes (grupo, pantalán y torre: 10–170 ms cada uno) tienen también su versión
 * por pasos (`…Steps`, un generador que cede el control entre partes): HarborView los construye
 * repartidos entre frames con un presupuesto de tiempo. El resultado es idéntico (misma secuencia
 * aleatoria).
 */
import * as THREE from 'three';
import type { GlowSpot } from './glow';
import { Kit, type V3 } from './kit';
import { loftHull } from './models';

export interface HarborModel {
  geo: THREE.BufferGeometry;
  lights: GlowSpot[];
  /** Radio aproximado en planta (m). */
  radius: number;
  /** Altura de la luz verde (solo la torre). */
  starY: number | null;
}

/* ------------------------------------------------------------------ */
/* Colores                                                             */
/* ------------------------------------------------------------------ */

export const HARBOR_COL = {
  glass: '#2b3a44',
  glassGreen: '#4fae86',
  window: '#ffcf7a',
  windowWarm: '#ffb45e',
  lamp: '#ffe2a8',
  wood: '#8b5e3c',
  woodDark: '#5e3f28',
  woodLight: '#b08a5a',
  deck: '#b8935f',
  rope: '#d6b97b',
  stone: '#cfc6b4',
  stoneDark: '#9a9284',
  paving: '#d9cdb0',
  white: '#efe9dc',
  teal: '#2a9d8f',
  leaf: '#4f9a3e',
  leafDark: '#386f2e',
  leafLight: '#79b54f',
  soil: '#5b4636',
  steel: '#8a9399',
  steelDark: '#4c5559',
  solar: '#1d3557',
  copper: '#4f8f7a',
  green: '#3dff8a',
  red: '#d64933',
  buoyRed: '#d23a2a',
  buoyGreen: '#2f9e57',
  antifoul: '#7a2f26',
  foam: '#eef6f4',
} as const;

/** Paredes de las casitas: colores vivos y alegres. */
export const HOUSE_COLORS = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#8ecae6', '#f28482', '#b5838d', '#90be6d', '#ffd6a5', '#cdb4db', '#ff9f80', '#6ec6c0'];
const ROOF_COLORS = ['#a23e2a', '#2f6070', '#3d405b', '#7a4a33', '#386641', '#9c6644'];
const HULL_COLORS = ['#22333f', '#1d4e5f', '#c8553d', '#efe3c8', '#386641', '#264653', '#6d597a', '#3d7a8a', '#b5651d'];
/** Farolillos de papel: de día, su color; de noche, la luz cálida que llevan dentro. */
const LANTERN_PAPER = ['#e63946', '#f4a261', '#e9c46a', '#ff8fab', '#f77f00', '#ffb703'];
const LANTERN_GLOW = ['#ff6b4a', '#ffa64d', '#ffd36b', '#ff9ac2', '#ff8a2a', '#ffc94d'];
const FLOWERS = ['#e63946', '#ffb703', '#ff8fab', '#ffffff', '#c77dff'];

const pick = <T>(arr: readonly T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length]!;

/** Construcción por pasos de un modelo: cada `next()` hace una parte; el valor final es el modelo. */
export type ModelSteps = Generator<void, HarborModel, void>;

/** Ejecuta todos los pasos de una construcción de una vez. */
export function runSteps(it: ModelSteps): HarborModel {
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}

/** Añade una luz (halo) en la posición local actual del kit (se guarda en coordenadas del modelo). */
function light(kit: Kit, lights: GlowSpot[], p: V3, color: string, size: number, flicker: number): void {
  lights.push({ p: kit.toModel(p), color, size, flicker });
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

/** Tejado a dos aguas con la cumbrera a lo largo de x. */
function gableRoof(kit: Kit, x0: number, x1: number, y: number, d: number, rise: number, roof: string, wall: string, over = 0.25): void {
  const hz = d / 2 + over;
  const a: V3 = [x0 - over, y, -hz];
  const b: V3 = [x1 + over, y, -hz];
  const c: V3 = [x1 + over, y + rise, 0];
  const e: V3 = [x0 - over, y + rise, 0];
  kit.poly([a, b, c, e], roof);
  kit.poly([[x0 - over, y, hz], [x0 - over, y + rise, 0], [x1 + over, y + rise, 0], [x1 + over, y, hz]], roof);
  kit.poly([[x0, y, -d / 2], [x0, y, d / 2], [x0, y + rise - over * 0.5, 0]], wall);
  kit.poly([[x1, y, -d / 2], [x1, y + rise - over * 0.5, 0], [x1, y, d / 2]], wall);
}

/**
 * Casita: paredes, tejado, puerta y ventanas que lucen de noche. Centrada en (x, y, z), largo en x.
 * Devuelve la altura del alero.
 */
function house(kit: Kit, lights: GlowSpot[], x: number, y: number, z: number, len: number, d: number, h: number, wall: string, roof: string, rnd: () => number, opts: { door?: 1 | -1 | 0; flat?: boolean } = {}): number {
  kit.box(len, h, d, wall, { p: [x, y + h / 2, z] });
  // Zócalo y esquineros
  kit.box(len + 0.08, 0.14, d + 0.08, HARBOR_COL.white, { p: [x, y + 0.07, z] });
  if (opts.flat) {
    kit.box(len + 0.4, 0.18, d + 0.4, roof, { p: [x, y + h + 0.09, z] });
  } else {
    gableRoof(kit, x - len / 2, x + len / 2, y + h, d, Math.min(1.3, d * 0.42), roof, wall);
  }
  // Ventanas en los costados
  const nWin = Math.max(1, Math.floor(len / 1.7));
  for (const side of [-1, 1]) {
    for (let i = 0; i < nWin; i++) {
      if (rnd() < 0.15) continue;
      const wx = x - len / 2 + ((i + 0.5) * len) / nWin;
      const wz = z + side * (d / 2 + 0.03);
      kit.emit(rnd() < 0.3 ? HARBOR_COL.windowWarm : HARBOR_COL.window);
      kit.box(0.62, 0.55, 0.06, HARBOR_COL.glass, { p: [wx, y + h * 0.58, wz] });
      kit.emit(null);
      // Marco y jardinera bajo la ventana
      kit.box(0.74, 0.08, 0.1, HARBOR_COL.white, { p: [wx, y + h * 0.58 - 0.32, wz] });
      if (rnd() < 0.55) {
        kit.box(0.7, 0.18, 0.22, HARBOR_COL.woodDark, { p: [wx, y + h * 0.58 - 0.45, wz + side * 0.12] });
        kit.rock(0.2, 0, rnd() < 0.5 ? HARBOR_COL.leaf : HARBOR_COL.leafLight, { p: [wx - 0.15, y + h * 0.58 - 0.32, wz + side * 0.14] }, 0.2);
        kit.rock(0.08, 0, pick(FLOWERS, rnd()), { p: [wx + 0.15, y + h * 0.58 - 0.28, wz + side * 0.16] }, 0);
      }
      light(kit, lights, [wx, y + h * 0.58, wz + side * 0.15], '#ffc874', 2.6, 0.08);
    }
  }
  // Ventana en el testero de proa
  kit.emit(HARBOR_COL.window);
  kit.box(0.06, 0.5, 0.55, HARBOR_COL.glass, { p: [x + len / 2 + 0.03, y + h * 0.6, z] });
  kit.emit(null);
  light(kit, lights, [x + len / 2 + 0.2, y + h * 0.6, z], '#ffc874', 2.2, 0.08);
  // Puerta en popa
  if (opts.door !== 0) {
    kit.box(0.06, 1.55, 0.8, HARBOR_COL.wood, { p: [x - len / 2 - 0.03, y + 0.8, z + (opts.door ?? 0) * d * 0.2] });
  }
  return y + h;
}

/** Ristra de farolillos colgando entre dos puntos (catenaria). */
function lanternString(kit: Kit, lights: GlowSpot[], a: V3, b: V3, n: number, sag: number, rnd: () => number): void {
  let prev: V3 = a;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    segment(kit, prev, p, 0.025, HARBOR_COL.woodDark);
    const k = Math.floor(rnd() * LANTERN_PAPER.length);
    kit.emit(LANTERN_GLOW[k]!);
    kit.add(new THREE.OctahedronGeometry(0.17, 0), LANTERN_PAPER[k]!, { p: [p[0], p[1] - 0.2, p[2]], s: [1, 1.35, 1] });
    kit.emit(null);
    light(kit, lights, [p[0], p[1] - 0.2, p[2]], LANTERN_GLOW[k]!, 1.9, 0.55);
    prev = p;
  }
  segment(kit, prev, b, 0.025, HARBOR_COL.woodDark);
}

/** Barra fina entre dos puntos (cabos, cables, varas). */
function segment(kit: Kit, a: V3, b: V3, r: number, color: string): void {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return;
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  kit.box(r * 2, len, r * 2, color, { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [e.x, e.y, e.z] });
}

/** Farola: poste y farol (luce de noche). */
function lampPost(kit: Kit, lights: GlowSpot[], x: number, y: number, z: number, h = 2.6): void {
  kit.cyl(0.05, 0.07, h, 5, HARBOR_COL.steelDark, { p: [x, y + h / 2, z] });
  kit.box(0.34, 0.06, 0.34, HARBOR_COL.steelDark, { p: [x, y + h + 0.34, z] });
  kit.emit(HARBOR_COL.lamp);
  kit.box(0.26, 0.32, 0.26, '#f1e3b5', { p: [x, y + h + 0.15, z] });
  kit.emit(null);
  light(kit, lights, [x, y + h + 0.15, z], '#ffe3a6', 3.8, 0.04);
}

/** Huerto colgante: jardinera con matas, flores y enredaderas que caen por el costado. */
function hangingGarden(kit: Kit, x: number, y: number, z: number, len: number, side: 1 | -1, rnd: () => number): void {
  kit.box(len, 0.3, 0.42, HARBOR_COL.woodDark, { p: [x, y, z] });
  kit.box(len - 0.1, 0.06, 0.34, HARBOR_COL.soil, { p: [x, y + 0.16, z] });
  const n = Math.max(2, Math.round(len / 0.55));
  for (let i = 0; i < n; i++) {
    const px = x - len / 2 + ((i + 0.5) * len) / n;
    const s = 0.22 + rnd() * 0.16;
    kit.rock(s, 0, rnd() < 0.5 ? HARBOR_COL.leaf : rnd() < 0.5 ? HARBOR_COL.leafDark : HARBOR_COL.leafLight, { p: [px, y + 0.2 + s * 0.5, z] }, 0.25);
    if (rnd() < 0.5) kit.rock(0.07, 0, pick(FLOWERS, rnd()), { p: [px + 0.08, y + 0.36 + s * 0.6, z + side * 0.1] }, 0);
    if (rnd() < 0.6) {
      // Enredadera que cuelga por fuera
      const l = 0.5 + rnd() * 1.1;
      kit.box(0.1, l, 0.06, rnd() < 0.5 ? HARBOR_COL.leafDark : HARBOR_COL.leaf, { p: [px, y - l / 2, z + side * 0.24] });
    }
  }
}

/** Ropa tendida entre dos puntos. */
function laundry(kit: Kit, a: V3, b: V3, rnd: () => number): void {
  segment(kit, a, b, 0.012, HARBOR_COL.rope);
  const n = 3 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.7) / (n + 0.6);
    const x = a[0] + (b[0] - a[0]) * t;
    const y = a[1] + (b[1] - a[1]) * t - 0.08;
    const z = a[2] + (b[2] - a[2]) * t;
    const w = 0.35 + rnd() * 0.25;
    const h = 0.4 + rnd() * 0.35;
    const dirx = b[0] - a[0];
    const dirz = b[2] - a[2];
    const L = Math.hypot(dirx, dirz) || 1;
    const ux = (dirx / L) * w * 0.5;
    const uz = (dirz / L) * w * 0.5;
    kit.poly([[x - ux, y, z - uz], [x + ux, y, z + uz], [x + ux, y - h, z + uz], [x - ux, y - h, z - uz]], pick(HOUSE_COLORS, rnd()));
  }
}

/** Boya de amarre con su cabo. */
function mooringBuoy(kit: Kit, x: number, z: number, to: V3): void {
  kit.add(new THREE.SphereGeometry(0.45, 6, 4), '#e0e0d8', { p: [x, 0.15, z] });
  kit.cyl(0.47, 0.47, 0.18, 6, HARBOR_COL.red, { p: [x, 0.2, z] });
  segment(kit, [x, 0.5, z], to, 0.03, HARBOR_COL.rope);
}

/* ------------------------------------------------------------------ */
/* Barco-hogar                                                         */
/* ------------------------------------------------------------------ */

type BoatKind = 'casa' | 'doble' | 'huerto' | 'taller';

interface BoatSpec {
  x: number;
  z: number;
  len: number;
  hw: number;
  kind: BoatKind;
}

interface BoatInfo {
  deckY: number;
  /** Postes con farolillos (arriba). */
  posts: V3[];
}

/** Barco-hogar por pasos (casco; casitas y cubierta; detalles). */
function* houseboat(kit: Kit, lights: GlowSpot[], o: BoatSpec, rnd: () => number): Generator<void, BoatInfo, void> {
  const freeboard = 1.15;
  const hullCol = pick(HULL_COLORS, rnd());
  kit.push({ p: [o.x, 0, o.z] });
  loftHull(kit, {
    length: o.len,
    halfWidth: o.hw,
    draft: 0.9,
    freeboard,
    bowFrac: 0.26,
    bottom: HARBOR_COL.antifoul,
    top: hullCol,
    stripe: hullCol === '#efe3c8' ? '#3d7a8a' : HARBOR_COL.white,
    deck: HARBOR_COL.deck,
    sheer: 0.45,
    stations: 6,
  });
  yield;
  const deckY = freeboard;
  const wall = pick(HOUSE_COLORS, rnd());
  const roof = pick(ROOF_COLORS, rnd());
  const hx = -o.len * 0.12;
  const hlen = o.len * 0.5;
  const hd = o.hw * 1.45;
  const posts: V3[] = [];
  // Defensas colgando por los costados
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) kit.cyl(0.14, 0.14, 0.5, 5, '#2b2f33', { p: [-o.len * 0.3 + i * o.len * 0.25, 0.55, side * (o.hw * 1.03 + 0.1)] });
  }
  switch (o.kind) {
    case 'doble': {
      const top = house(kit, lights, hx, deckY, 0, hlen, hd, 2.1, wall, roof, rnd, { flat: true, door: 1 });
      // Segundo piso más pequeño con balcón
      const wall2 = pick(HOUSE_COLORS, rnd());
      house(kit, lights, hx - hlen * 0.12, top + 0.18, 0, hlen * 0.62, hd * 0.82, 1.9, wall2, roof, rnd, { door: 0 });
      kit.box(hlen * 0.3, 0.08, hd * 0.9, HARBOR_COL.wood, { p: [hx + hlen * 0.32, top + 0.25, 0] });
      for (const s of [-1, 1]) kit.box(hlen * 0.3, 0.5, 0.04, HARBOR_COL.white, { p: [hx + hlen * 0.32, top + 0.52, s * hd * 0.45] });
      hangingGarden(kit, hx + hlen * 0.32, top + 0.45, hd * 0.47, hlen * 0.28, 1, rnd);
      posts.push([hx + hlen * 0.46, top + 1.3, 0]);
      break;
    }
    case 'huerto': {
      // Invernadero de cristal y bancales
      const gl = o.len * 0.4;
      kit.box(gl, 1.9, hd * 0.95, '#bfe3d6', { p: [hx, deckY + 0.95, 0] });
      for (let i = 0; i <= 4; i++) kit.box(0.06, 2.0, hd * 0.97, HARBOR_COL.white, { p: [hx - gl / 2 + (i * gl) / 4, deckY + 1.0, 0] });
      gableRoof(kit, hx - gl / 2, hx + gl / 2, deckY + 1.9, hd * 0.95, 0.7, '#d6efe6', '#bfe3d6', 0.05);
      for (let i = 0; i < 4; i++) kit.rock(0.45, 0, i % 2 ? HARBOR_COL.leaf : HARBOR_COL.leafLight, { p: [hx - gl * 0.35 + i * gl * 0.23, deckY + 0.6, 0] }, 0.25);
      kit.emit('#bfffd8');
      kit.box(0.3, 0.12, 0.3, '#e8fff0', { p: [hx, deckY + 1.75, 0] });
      kit.emit(null);
      light(kit, lights, [hx, deckY + 1.6, 0], '#d8ffd0', 2.6, 0.02);
      for (const s of [-1, 1]) hangingGarden(kit, o.len * 0.2, deckY + 0.2, s * o.hw * 0.75, o.len * 0.3, s as 1 | -1, rnd);
      // Depósito de agua
      kit.cyl(0.45, 0.45, 0.9, 7, '#3d7a8a', { p: [-o.len * 0.38, deckY + 0.45, 0] });
      posts.push([o.len * 0.3, deckY + 2.6, 0]);
      break;
    }
    case 'taller': {
      house(kit, lights, hx - 0.5, deckY, 0, hlen * 0.8, hd, 2.0, wall, roof, rnd, { door: -1 });
      // Pluma de carga y cajas
      kit.cyl(0.08, 0.1, 4.2, 5, HARBOR_COL.steel, { p: [o.len * 0.22, deckY + 2.1, 0] });
      segment(kit, [o.len * 0.22, deckY + 3.6, 0], [o.len * 0.42, deckY + 2.5, o.hw * 0.4], 0.06, HARBOR_COL.steel);
      for (let i = 0; i < 3; i++) kit.box(0.6, 0.5, 0.6, i % 2 ? HARBOR_COL.woodLight : HARBOR_COL.wood, { p: [o.len * 0.25 + (i - 1) * 0.65, deckY + 0.25, -o.hw * 0.4 + (i % 2) * 0.3] });
      kit.cyl(0.3, 0.3, 0.8, 7, '#c8553d', { p: [o.len * 0.32, deckY + 0.4, o.hw * 0.45] });
      posts.push([o.len * 0.22, deckY + 3.9, 0]);
      break;
    }
    case 'casa':
    default: {
      const top = house(kit, lights, hx, deckY, 0, hlen, hd, 2.2, wall, roof, rnd, { door: rnd() < 0.5 ? 1 : -1 });
      // Placas solares o tejado verde
      if (rnd() < 0.5) kit.box(hlen * 0.4, 0.06, hd * 0.35, HARBOR_COL.solar, { p: [hx - hlen * 0.15, top + 0.75, -hd * 0.22], r: [0.5, 0, 0] });
      else for (let i = 0; i < 3; i++) kit.rock(0.28, 0, HARBOR_COL.leafLight, { p: [hx - hlen * 0.3 + i * hlen * 0.3, top + 0.45, hd * 0.3] }, 0.3);
      // Terraza de proa con mesa y sombrilla
      kit.box(0.8, 0.06, 0.8, HARBOR_COL.white, { p: [o.len * 0.24, deckY + 0.75, 0] });
      kit.cyl(0.05, 0.05, 0.75, 4, HARBOR_COL.steelDark, { p: [o.len * 0.24, deckY + 0.37, 0] });
      kit.cyl(0.03, 0.03, 2.1, 4, HARBOR_COL.white, { p: [o.len * 0.24, deckY + 1.05, 0] });
      kit.cone(1.1, 0.45, 6, pick(HOUSE_COLORS, rnd()), { p: [o.len * 0.24, deckY + 2.1, 0] });
      posts.push([o.len * 0.36, deckY + 2.5, 0]);
      break;
    }
  }
  yield;
  // Huerto colgante en la borda (a uno u otro costado)
  if (rnd() < 0.8) {
    const side: 1 | -1 = rnd() < 0.5 ? 1 : -1;
    hangingGarden(kit, -o.len * 0.36, deckY + 0.25, side * o.hw * 0.92, o.len * 0.18, side, rnd);
  }
  // Poste de popa con farol
  const sternX = -o.len * 0.44;
  kit.cyl(0.05, 0.06, 2.4, 5, HARBOR_COL.woodDark, { p: [sternX, deckY + 1.2, 0] });
  posts.push([sternX, deckY + 2.4, 0]);
  // Banderín
  kit.poly([[sternX, deckY + 2.35, 0], [sternX - 0.8, deckY + 2.2, 0.02], [sternX, deckY + 2.0, 0]], pick(HOUSE_COLORS, rnd()));
  // Mástil de proa con poste para los farolillos
  for (const p of posts) {
    if (p[1] > deckY + 2.45 && p[0] > 0) kit.cyl(0.05, 0.06, p[1] - deckY, 5, HARBOR_COL.woodDark, { p: [p[0], deckY + (p[1] - deckY) / 2, p[2]] });
  }
  const modelPosts = posts.map((p) => kit.toModel(p));
  kit.pop();
  return { deckY, posts: modelPosts };
}

/* ------------------------------------------------------------------ */
/* Grupo de barcos-hogar                                               */
/* ------------------------------------------------------------------ */

/** Grupo de 3–5 barcos-hogar abarloados, con pasarelas, farolillos y un pantalán. */
export function houseboatClusterModel(seed: number): HarborModel {
  return runSteps(houseboatClusterSteps(seed));
}

/** `houseboatClusterModel` por pasos (un barco o una pasarela por paso). */
export function* houseboatClusterSteps(seed: number): ModelSteps {
  const kit = new Kit(seed, 0.06);
  const rnd = (): number => kit.random();
  const lights: GlowSpot[] = [];
  const n = 3 + Math.floor(rnd() * 3);
  const kinds: BoatKind[] = ['casa', 'doble', 'huerto', 'taller', 'casa', 'doble'];
  const specs: BoatSpec[] = [];
  let z = 0;
  for (let i = 0; i < n; i++) {
    const hw = 2.1 + rnd() * 0.9;
    const len = 10 + rnd() * 6;
    if (i > 0) z += specs[i - 1]!.hw * 1.03 + 1.3 + hw * 1.03;
    specs.push({ x: (rnd() - 0.5) * 3, z, len, hw, kind: kinds[Math.floor(rnd() * kinds.length)]! });
  }
  // Centrado en z
  const zMid = z / 2;
  for (const s of specs) s.z -= zMid;
  const infos: BoatInfo[] = [];
  for (const s of specs) {
    infos.push(yield* houseboat(kit, lights, s, rnd));
    yield;
  }
  // Pasarelas entre bordas (con barandilla de cabo) y farolillos de mástil a mástil
  for (let i = 0; i + 1 < specs.length; i++) {
    const a = specs[i]!;
    const b = specs[i + 1]!;
    const za = a.z + a.hw * 1.03;
    const zb = b.z - b.hw * 1.03;
    const px = (Math.max(a.x - a.len * 0.3, b.x - b.len * 0.3) + Math.min(a.x + a.len * 0.1, b.x + b.len * 0.1)) / 2;
    const y = infos[i]!.deckY + 0.08;
    kit.box(1.1, 0.1, zb - za + 0.9, HARBOR_COL.woodLight, { p: [px, y, (za + zb) / 2] });
    for (const s of [-0.55, 0.55]) {
      segment(kit, [px + s, y + 0.9, za - 0.2], [px + s, y + 0.9, zb + 0.2], 0.02, HARBOR_COL.rope);
      kit.cyl(0.03, 0.03, 0.9, 4, HARBOR_COL.woodDark, { p: [px + s, y + 0.45, za - 0.2] });
      kit.cyl(0.03, 0.03, 0.9, 4, HARBOR_COL.woodDark, { p: [px + s, y + 0.45, zb + 0.2] });
    }
    const pa = infos[i]!.posts[0]!;
    const pb = infos[i + 1]!.posts[0]!;
    lanternString(kit, lights, pa, pb, 5 + Math.floor(rnd() * 3), 0.6, rnd);
    if (rnd() < 0.5) {
      const qa = infos[i]!.posts.at(-1)!;
      const qb = infos[i + 1]!.posts.at(-1)!;
      laundry(kit, [qa[0], qa[1] - 0.3, qa[2]], [qb[0], qb[1] - 0.3, qb[2]], rnd);
    }
    yield;
  }
  // Pantalán flotante en un extremo con farolas, bolardos y un bote amarrado
  const end = rnd() < 0.5 ? 0 : specs.length - 1;
  const es = specs[end]!;
  const side = end === 0 ? -1 : 1;
  const dz = es.z + side * (es.hw * 1.03 + 2.2);
  const dlen = 10 + rnd() * 5;
  kit.box(dlen, 0.35, 2.6, HARBOR_COL.woodLight, { p: [es.x, 0.22, dz] });
  for (let i = 0; i < 4; i++) kit.box(dlen / 4 - 0.15, 0.3, 2.4, '#d9d6cf', { p: [es.x - dlen / 2 + (i + 0.5) * (dlen / 4), 0.02, dz] });
  for (const bx of [-dlen * 0.4, dlen * 0.4]) {
    kit.cyl(0.14, 0.18, 0.4, 6, HARBOR_COL.steelDark, { p: [es.x + bx, 0.6, dz + side * 1.0] });
    lampPost(kit, lights, es.x + bx * 0.6, 0.4, dz - side * 0.9);
  }
  // Bote de remos amarrado
  kit.push({ p: [es.x + 1, 0, dz + side * 2.6], r: [0, 0.08, 0] });
  loftHull(kit, { length: 4, halfWidth: 0.8, draft: 0.3, freeboard: 0.45, bowFrac: 0.35, bottom: HARBOR_COL.white, top: pick(HOUSE_COLORS, rnd()), deck: HARBOR_COL.woodLight, stations: 4 });
  kit.box(0.2, 0.06, 1.3, HARBOR_COL.wood, { p: [0, 0.4, 0] });
  kit.pop();
  // Boyas de amarre a proa y popa
  const first = specs[0]!;
  const last = specs[specs.length - 1]!;
  mooringBuoy(kit, first.x + first.len * 0.5 + 6, first.z - 3, [first.x + first.len * 0.48, 1.2, first.z]);
  mooringBuoy(kit, last.x - last.len * 0.5 - 6, last.z + 3, [last.x - last.len * 0.48, 1.2, last.z]);
  yield;
  const geo = kit.build(true);
  geo.computeBoundingSphere();
  return { geo, lights, radius: Math.max(14, geo.boundingSphere!.radius), starY: null };
}

/* ------------------------------------------------------------------ */
/* Pantalán del canal                                                  */
/* ------------------------------------------------------------------ */

/** Largo de un tramo de pantalán (m). */
export const PROMENADE_LEN = 240;

/**
 * Tramo de los pantalanes flotantes que bordean el canal por ambos lados (a ±`z`): tablones sobre
 * flotadores, farolas del lado del canal con ristras de farolillos entre ellas, bolardos, bancos y
 * macetas. Algunos huecos dejan pasar a los botes. Centrado en x = 0.
 */
export function promenadeModel(seed: number, z: number): HarborModel {
  return runSteps(promenadeSteps(seed, z));
}

/** `promenadeModel` por pasos (un tramo de 40 m por paso). */
export function* promenadeSteps(seed: number, z: number): ModelSteps {
  const kit = new Kit(seed, 0.05);
  const rnd = (): number => kit.random();
  const lights: GlowSpot[] = [];
  const L = PROMENADE_LEN;
  const w = 3;
  for (const side of [-1, 1] as const) {
    const zc = side * z;
    const edge = zc - side * (w / 2 - 0.25); // lado del canal
    // Tramos de 40 m; alguno falta (bocana para los botes).
    const n = L / 40;
    let prevLamp: V3 | null = null;
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + i * 40;
      if (i > 0 && i < n - 1 && rnd() < 0.18) {
        prevLamp = null;
        continue;
      }
      kit.box(39.6, 0.22, w, i % 2 ? HARBOR_COL.woodLight : '#c09a66', { p: [x0 + 20, 0.45, zc] });
      for (let f = 0; f < 5; f++) kit.box(6.5, 0.45, w - 0.3, '#d9d6cf', { p: [x0 + 4 + f * 8, 0.12, zc] });
      // Bordillo y bolardos
      kit.box(39.6, 0.14, 0.18, HARBOR_COL.woodDark, { p: [x0 + 20, 0.62, edge] });
      for (const bx of [6, 26]) kit.cyl(0.13, 0.17, 0.42, 6, HARBOR_COL.steelDark, { p: [x0 + bx, 0.75, edge + side * 0.25] });
      // Farolas cada 20 m con farolillos colgando entre ellas
      for (const lx of [10, 30]) {
        const lamp: V3 = [x0 + lx, 0.56, zc + side * 0.6];
        lampPost(kit, lights, lamp[0], lamp[1], lamp[2], 2.8);
        const top: V3 = [lamp[0], lamp[1] + 2.75, lamp[2]];
        if (prevLamp && rnd() < 0.85) lanternString(kit, lights, prevLamp, top, 6, 0.9, rnd);
        prevLamp = top;
      }
      // Banco o maceta con flores
      if (rnd() < 0.6) {
        const bx = x0 + 20 + (rnd() - 0.5) * 8;
        kit.box(1.6, 0.12, 0.5, HARBOR_COL.wood, { p: [bx, 0.95, zc + side * 0.9] });
        kit.box(1.6, 0.5, 0.08, HARBOR_COL.wood, { p: [bx, 1.2, zc + side * 1.18] });
        kit.box(0.1, 0.4, 0.45, HARBOR_COL.steelDark, { p: [bx - 0.7, 0.75, zc + side * 0.9] });
        kit.box(0.1, 0.4, 0.45, HARBOR_COL.steelDark, { p: [bx + 0.7, 0.75, zc + side * 0.9] });
      } else {
        const bx = x0 + 20;
        kit.cyl(0.4, 0.3, 0.55, 6, '#b5651d', { p: [bx, 0.83, zc + side * 0.9] });
        kit.rock(0.42, 0, HARBOR_COL.leaf, { p: [bx, 1.25, zc + side * 0.9] }, 0.25);
        kit.rock(0.1, 0, pick(FLOWERS, rnd()), { p: [bx + 0.2, 1.5, zc + side * 0.8] }, 0);
      }
      yield;
    }
  }
  const geo = kit.build(true);
  geo.computeBoundingSphere();
  return { geo, lights, radius: geo.boundingSphere!.radius, starY: null };
}

/* ------------------------------------------------------------------ */
/* La torre de la luz verde                                            */
/* ------------------------------------------------------------------ */

const PLAZA_Y = 2.2;
const TOWER_H = 38;
/** Altura de la linterna verde sobre el agua. */
export const TOWER_LIGHT_Y = PLAZA_Y + TOWER_H + 3.1;

/** Islote del puerto con la torre de la gran luz verde, la plaza, el muelle y el Albatros. */
export function greenTowerModel(seed: number): HarborModel {
  return runSteps(greenTowerSteps(seed));
}

/** `greenTowerModel` por pasos (unas pocas piezas por paso). */
export function* greenTowerSteps(seed: number): ModelSteps {
  const kit = new Kit(seed, 0.06);
  const rnd = (): number => kit.random();
  const lights: GlowSpot[] = [];
  const plazaY = PLAZA_Y;
  // --- Islote: rocas, escollera y plaza ---
  kit.rock(26, 1, '#7d7f7c', { p: [0, -6, 0], s: [1.25, 0.42, 1.1] }, 0.18);
  yield;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd() * 0.2;
    const r = 22 + rnd() * 4;
    kit.rock(2.5 + rnd() * 2.2, 0, i % 2 ? '#7d7f7c' : '#5d605e', { p: [Math.cos(a) * r, 0.4, Math.sin(a) * r * 0.9], r: [rnd(), rnd() * 3, rnd()] }, 0.25);
    if (i % 4 === 3) yield;
  }
  kit.cyl(20, 21.5, plazaY + 0.6, 16, HARBOR_COL.stoneDark, { p: [0, plazaY / 2 - 0.3, 0] });
  kit.cyl(19.6, 19.6, 0.2, 16, HARBOR_COL.paving, { p: [0, plazaY, 0] });
  // Pretil de la plaza
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    kit.box(4.9, 0.6, 0.35, HARBOR_COL.stone, { p: [Math.cos(a) * 19.3, plazaY + 0.3, Math.sin(a) * 19.3], r: [0, -a + Math.PI / 2, 0] });
  }
  yield;
  // --- La torre: fuste octogonal de franjas blancas y verde azulado ---
  const H = TOWER_H;
  const bands = 7;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = 4.6 - t0 * 1.6;
    const r1 = 4.6 - t1 * 1.6;
    kit.cyl(r1, r0, H / bands, 8, i % 2 ? HARBOR_COL.teal : HARBOR_COL.white, { p: [0, plazaY + (H * (t0 + t1)) / 2, 0], r: [0, Math.PI / 8, 0] });
  }
  // Ventanucos encendidos a lo largo del fuste (en espiral)
  for (let i = 0; i < 7; i++) {
    const y = plazaY + 3 + i * 4.8;
    const a = i * 1.9;
    const r = 4.6 - ((y - plazaY) / H) * 1.6 + 0.04;
    kit.emit(HARBOR_COL.window);
    kit.box(0.08, 0.9, 0.5, HARBOR_COL.glass, { p: [Math.cos(a) * r, y, Math.sin(a) * r], r: [0, -a, 0] });
    kit.emit(null);
    light(kit, lights, [Math.cos(a) * (r + 0.2), y, Math.sin(a) * (r + 0.2)], '#ffc874', 1.8, 0.05);
  }
  // Puerta
  kit.box(0.2, 2.6, 1.6, HARBOR_COL.wood, { p: [4.55, plazaY + 1.3, 0] });
  yield;
  const top = plazaY + H;
  // Galería con barandilla
  kit.cyl(4.3, 3.4, 0.6, 12, HARBOR_COL.steelDark, { p: [0, top + 0.3, 0] });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    kit.box(0.08, 1.0, 0.08, HARBOR_COL.white, { p: [Math.cos(a) * 4.1, top + 1.1, Math.sin(a) * 4.1] });
  }
  kit.add(new THREE.TorusGeometry(4.1, 0.06, 3, 16), HARBOR_COL.white, { p: [0, top + 1.6, 0], r: [Math.PI / 2, 0, 0] });
  // Linterna verde
  kit.cyl(2.6, 2.6, 0.5, 10, HARBOR_COL.steelDark, { p: [0, top + 0.85, 0] });
  kit.emit(HARBOR_COL.green);
  kit.cyl(2.3, 2.3, 4.0, 10, HARBOR_COL.glassGreen, { p: [0, top + 3.1, 0] });
  kit.emit(null);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    kit.box(0.1, 4.0, 0.1, HARBOR_COL.steelDark, { p: [Math.cos(a) * 2.34, top + 3.1, Math.sin(a) * 2.34] });
  }
  yield;
  // Cúpula de cobre y veleta
  kit.add(new THREE.SphereGeometry(2.7, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), HARBOR_COL.copper, { p: [0, top + 5.1, 0] });
  kit.cyl(0.06, 0.1, 2.2, 5, HARBOR_COL.steelDark, { p: [0, top + 8.6, 0] });
  kit.add(new THREE.SphereGeometry(0.3, 6, 4), '#e9c46a', { p: [0, top + 9.7, 0] });
  // Guirnaldas de banderines desde la galería hasta la plaza (fiesta permanente)
  const flagCols = ['#e63946', '#ffb703', '#2a9d8f', '#ffffff', '#ff8fab', '#8ecae6'];
  for (let g = 0; g < 6; g++) {
    const a = (g / 6) * Math.PI * 2 + 0.3;
    const p0: V3 = [Math.cos(a) * 4.0, top + 1.5, Math.sin(a) * 4.0];
    const p1: V3 = [Math.cos(a) * 17.5, plazaY + 3.2, Math.sin(a) * 17.5];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const at = (t: number): V3 => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t - 3 * t * (1 - t), p0[2] + (p1[2] - p0[2]) * t];
      const A = at(t0);
      const B = at(t1);
      segment(kit, A, B, 0.02, HARBOR_COL.rope);
      kit.poly([A, B, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 0.9, (A[2] + B[2]) / 2]], flagCols[(g + i) % flagCols.length]!);
    }
    // Mástil de la guirnalda
    kit.cyl(0.08, 0.1, 3.4, 5, HARBOR_COL.woodDark, { p: [p1[0], plazaY + 1.7, p1[2]] });
    yield;
  }
  // --- Casitas de colores en la plaza ---
  const housesAt = [
    [-11, -9, 0.5],
    [-13, 5, -0.3],
    [-4, 13, 1.2],
    [8, -13, -1.0],
    [12, 8, 2.1],
  ] as const;
  for (const [x, z, yaw] of housesAt) {
    kit.push({ p: [x, 0, z], r: [0, yaw, 0] });
    const w = pick(HOUSE_COLORS, rnd());
    const top2 = house(kit, lights, 0, plazaY + 0.1, 0, 4.5 + rnd() * 1.5, 3.4, 2.6 + rnd() * 1.2, w, pick(ROOF_COLORS, rnd()), rnd, { door: 1 });
    if (rnd() < 0.6) hangingGarden(kit, 0, top2 - 0.6, 1.95, 2.6, 1, rnd);
    kit.pop();
    yield;
  }
  // Árboles de la plaza
  for (let i = 0; i < 7; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 8 + rnd() * 8;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (Math.abs(z) < 3 && x > 0) continue;
    kit.cyl(0.18, 0.25, 2.4, 5, '#8b6b4a', { p: [x, plazaY + 1.2, z] });
    kit.rock(1.6 + rnd() * 0.6, 0, rnd() < 0.5 ? HARBOR_COL.leaf : HARBOR_COL.leafLight, { p: [x, plazaY + 3.2, z] }, 0.25);
  }
  yield;
  // Farolas de la plaza
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    lampPost(kit, lights, Math.cos(a) * 16.5, plazaY + 0.1, Math.sin(a) * 16.5, 3.2);
  }
  yield;
  // --- Muelle principal (hacia +x) con el Albatros amarrado ---
  const pierY = 1.6;
  const pierL = 54;
  const px0 = 19;
  kit.box(pierL, 0.3, 4.4, HARBOR_COL.woodLight, { p: [px0 + pierL / 2, pierY, 0] });
  for (let i = 0; i <= 9; i++) {
    for (const s of [-2, 2]) kit.cyl(0.22, 0.22, pierY + 2.4, 5, HARBOR_COL.woodDark, { p: [px0 + 1 + (i * (pierL - 2)) / 9, (pierY - 2.4) / 2 + 0.2, s] });
  }
  for (let i = 0; i < 6; i++) lampPost(kit, lights, px0 + 5 + i * 9.4, pierY + 0.15, i % 2 ? 1.9 : -1.9, 3.0);
  // La placa: «Albatros — llegamos»
  kit.cyl(0.08, 0.08, 1.4, 4, HARBOR_COL.woodDark, { p: [px0 + 1.5, pierY + 0.7, -1.2] });
  kit.cyl(0.08, 0.08, 1.4, 4, HARBOR_COL.woodDark, { p: [px0 + 1.5, pierY + 0.7, 1.2] });
  kit.box(0.12, 0.7, 2.7, '#a0784a', { p: [px0 + 1.5, pierY + 1.5, 0] });
  yield;
  // El Albatros: viejo casco de la primera ciudad flotante, amarrado de costado
  kit.push({ p: [px0 + pierL / 2 + 2, 0, 9.4] });
  loftHull(kit, { length: 40, halfWidth: 5.2, draft: 2.2, freeboard: 3.0, bowFrac: 0.28, bottom: '#5a3324', top: '#d9d4c3', stripe: '#3d7a8a', deck: '#a88a5c', sheer: 1.2, stations: 9 });
  yield;
  // Casas sobre su cubierta (la primera ciudad)
  let hx = -15;
  for (let i = 0; i < 4; i++) {
    const len = 5 + rnd() * 2;
    house(kit, lights, hx + len / 2, 3.0, (i % 2 ? -1 : 1) * 1.2, len, 5.2, 2.4 + (i % 2) * 0.6, pick(HOUSE_COLORS, rnd()), pick(ROOF_COLORS, rnd()), rnd, { door: 0 });
    hx += len + 1.2;
    yield;
  }
  // Mástil viejo con la vela recogida y ristra de farolillos hasta el muelle
  kit.cyl(0.25, 0.32, 14, 6, HARBOR_COL.woodDark, { p: [12, 3 + 7, 0] });
  kit.box(0.6, 0.6, 7.5, HARBOR_COL.white, { p: [12, 3 + 9, 0], r: [0.04, 0, 0] });
  lanternString(kit, lights, [12, 3 + 13.5, 0], [-2, pierY + 3.4 - 0.0, -9.4 + 1.9], 9, 1.4, rnd);
  lanternString(kit, lights, [12, 3 + 13.5, 0], [-17, 3 + 3.2, 0], 8, 1.0, rnd);
  kit.pop();
  // Barcos-hogar amarrados al otro lado del muelle
  for (let i = 0; i < 3; i++) {
    const len = 11 + rnd() * 4;
    yield* houseboat(kit, lights, { x: px0 + 10 + i * 15, z: -8.5, len, hw: 2.4 + rnd() * 0.6, kind: i === 1 ? 'huerto' : i === 2 ? 'doble' : 'casa' }, rnd);
    yield;
  }
  const geo = kit.build(true);
  geo.computeBoundingSphere();
  return { geo, lights, radius: Math.max(60, geo.boundingSphere!.radius), starY: TOWER_LIGHT_Y };
}

/* ------------------------------------------------------------------ */
/* Botes que van y vienen                                              */
/* ------------------------------------------------------------------ */

export type HarborBoatKind = 'bote' | 'lancha' | 'velero';
export const HARBOR_BOAT_KINDS: readonly HarborBoatKind[] = ['bote', 'lancha', 'velero'];

export function harborBoatModel(kind: HarborBoatKind, seed: number): HarborModel {
  const kit = new Kit(seed, 0.05);
  const rnd = (): number => kit.random();
  const lights: GlowSpot[] = [];
  const col = pick(HOUSE_COLORS, rnd());
  const skin = pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524'], rnd());
  const person = (x: number, y: number, z: number, shirt: string): void => {
    kit.box(0.42, 0.62, 0.3, shirt, { p: [x, y + 0.31, z] });
    kit.box(0.24, 0.26, 0.24, skin, { p: [x, y + 0.78, z] });
    kit.box(0.27, 0.08, 0.27, pick(['#2b2118', '#5a3825', '#e9c46a', '#1a1a1a'], rnd()), { p: [x, y + 0.93, z] });
  };
  let radius = 3;
  if (kind === 'bote') {
    loftHull(kit, { length: 4.2, halfWidth: 0.85, draft: 0.3, freeboard: 0.5, bowFrac: 0.35, bottom: HARBOR_COL.white, top: col, deck: HARBOR_COL.woodLight, stations: 4 });
    person(-0.2, 0.35, 0, pick(HOUSE_COLORS, rnd()));
    for (const s of [-1, 1]) segment(kit, [-0.1, 0.75, s * 0.25], [0.3, 0.05, s * 1.9], 0.04, HARBOR_COL.woodLight);
    kit.cyl(0.03, 0.03, 1.4, 4, HARBOR_COL.woodDark, { p: [-1.75, 1.0, 0] });
    kit.emit('#ffc36b');
    kit.box(0.2, 0.26, 0.2, '#f1e3b5', { p: [-1.75, 1.75, 0] });
    kit.emit(null);
    light(kit, lights, [-1.75, 1.75, 0], '#ffd08a', 1.6, 0.5);
  } else if (kind === 'lancha') {
    loftHull(kit, { length: 6.8, halfWidth: 1.3, draft: 0.5, freeboard: 0.85, bowFrac: 0.38, bottom: HARBOR_COL.antifoul, top: col, stripe: HARBOR_COL.white, deck: HARBOR_COL.woodLight, stations: 5 });
    kit.box(2.2, 1.2, 1.9, HARBOR_COL.white, { p: [-0.6, 1.45, 0] });
    kit.emit(HARBOR_COL.window);
    for (const s of [-1, 1]) kit.box(1.6, 0.45, 0.05, HARBOR_COL.glass, { p: [-0.6, 1.65, s * 0.97] });
    kit.box(0.05, 0.45, 1.5, HARBOR_COL.glass, { p: [0.52, 1.65, 0] });
    kit.emit(null);
    kit.box(2.6, 0.08, 2.2, pick(ROOF_COLORS, rnd()), { p: [-0.6, 2.1, 0] });
    person(-2.2, 0.85, 0.3, pick(HOUSE_COLORS, rnd()));
    kit.box(0.4, 0.5, 0.3, HARBOR_COL.steelDark, { p: [-3.35, 0.75, 0] });
    // Estela de espuma
    for (const s of [-1, 1]) kit.poly([[-3.4, 0.06, 0], [-6.5, 0.04, s * 1.6], [-7.6, 0.03, s * 0.9]], HARBOR_COL.foam);
    kit.poly([[-3.4, 0.07, 0.4], [-8.5, 0.05, 0.3], [-8.5, 0.05, -0.3], [-3.4, 0.07, -0.4]], HARBOR_COL.foam);
    for (const s of [-1, 1]) light(kit, lights, [-0.6, 1.65, s * 1.1], '#ffc874', 1.4, 0.05);
    light(kit, lights, [-0.6, 2.4, 0], '#fff1d0', 1.8, 0);
    kit.emit('#fff1d0');
    kit.box(0.14, 0.14, 0.14, '#fff6e0', { p: [-0.6, 2.25, 0] });
    kit.emit(null);
    radius = 5;
  } else {
    loftHull(kit, { length: 5.2, halfWidth: 1.0, draft: 0.4, freeboard: 0.55, bowFrac: 0.4, bottom: HARBOR_COL.white, top: col, deck: HARBOR_COL.woodLight, stations: 4 });
    kit.cyl(0.05, 0.06, 6, 5, HARBOR_COL.white, { p: [0.6, 3.4, 0] });
    kit.poly([[0.65, 6.2, 0], [0.65, 0.9, 0], [-2.2, 0.95, 0]], pick(['#f2ede0', '#e76f51', '#e9c46a', '#8ecae6'], rnd()));
    kit.poly([[0.55, 5.8, 0], [2.5, 0.8, 0], [0.55, 0.85, 0]], '#f6f1e3');
    person(-1.5, 0.45, 0.2, pick(HOUSE_COLORS, rnd()));
    kit.emit('#fff1d0');
    kit.box(0.12, 0.12, 0.12, '#fff6e0', { p: [0.6, 6.45, 0] });
    kit.emit(null);
    light(kit, lights, [0.6, 6.45, 0], '#fff1d0', 1.4, 0);
    radius = 4;
  }
  const geo = kit.build(true);
  return { geo, lights, radius, starY: null };
}

/* ------------------------------------------------------------------ */
/* Boyas de la bocana                                                  */
/* ------------------------------------------------------------------ */

/** Boya lateral: `red` (tope cilíndrico) o `green` (tope cónico), con luz arriba. */
export function channelBuoyModel(color: 'red' | 'green'): HarborModel {
  const kit = new Kit(color === 'red' ? 5 : 7, 0.04);
  const body = color === 'red' ? HARBOR_COL.buoyRed : HARBOR_COL.buoyGreen;
  const glow = color === 'red' ? '#ff4a3a' : '#4dff7a';
  kit.cyl(1.3, 1.1, 1.2, 8, body, { p: [0, 0.1, 0] });
  kit.cyl(1.35, 1.35, 0.2, 8, HARBOR_COL.white, { p: [0, 0.65, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    segment(kit, [Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9], [Math.cos(a) * 0.3, 3.4, Math.sin(a) * 0.3], 0.06, body);
  }
  if (color === 'red') kit.cyl(0.45, 0.45, 0.8, 8, body, { p: [0, 3.8, 0] });
  else kit.cone(0.55, 0.9, 8, body, { p: [0, 3.85, 0] });
  kit.emit(glow);
  kit.cyl(0.18, 0.18, 0.35, 6, '#f6f6ee', { p: [0, 4.5, 0] });
  kit.emit(null);
  const lights: GlowSpot[] = [{ p: [0, 4.5, 0], color: glow, size: 3.2, flicker: 0 }];
  return { geo: kit.build(true), lights, radius: 2, starY: null };
}

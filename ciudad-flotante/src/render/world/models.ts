/**
 * MODELOS DEL MUNDO (low-poly, colores por vértice): naufragio, isla, mercante, estructura
 * (plataforma abandonada o faro), balsa lejana y decorado de región (islas grandes, icebergs,
 * cascos oxidados, farallones, veleros).
 *
 * Convención: el nivel del agua es y = 0 en el modelo; +x es la proa; un modelo se coloca en el
 * marco del océano con `position.y = WATERLINE_Y`. Cada constructor devuelve la geometría sólida
 * y, si tiene luces nocturnas, la geometría "luminosa" aparte (ventanas, faroles, linternas).
 */
import * as THREE from 'three';
import { Kit, type V3 } from './kit';

export interface WorldModel {
  solid: THREE.BufferGeometry;
  /** Partes que se encienden de noche (ventanas, luces de navegación, linterna del faro). */
  glow: THREE.BufferGeometry | null;
  /** Altura del haz giratorio del faro (si lo tiene). */
  beamY: number | null;
  /** Radio aproximado en planta (m). */
  radius: number;
}

const COL = {
  rust: '#8c4a2f',
  rustLight: '#b5651d',
  rustDark: '#5a3324',
  hullDark: '#2f3e46',
  hullNavy: '#22333f',
  antifoul: '#9e3b2c',
  wood: '#8b5e3c',
  woodDark: '#5e3f28',
  woodLight: '#b08a5a',
  canvas: '#ddd2b4',
  canvasDirty: '#b9ab88',
  sand: '#e6d29f',
  sandWet: '#c9b27a',
  grass: '#6a994e',
  grassDark: '#4f7c3a',
  jungle: '#3f7d3a',
  rock: '#7d7f7c',
  rockDark: '#5d605e',
  trunk: '#8b6b4a',
  leaf: '#3f8a3a',
  leafLight: '#5aa04a',
  white: '#efe9dc',
  red: '#c8553d',
  yellow: '#e9c46a',
  steel: '#8a9399',
  steelDark: '#5c6770',
  glass: '#2b3a44',
  foam: '#eef6f4',
  ice: '#e9f4f7',
  iceBlue: '#a9d8e6',
  iceDeep: '#6fb8d0',
  sail: '#f2ede0',
  windowLit: '#ffd27d',
  lampWhite: '#fff4d6',
  lampRed: '#ff5a4a',
  lampGreen: '#5dff7a',
};

const CONTAINER_COLORS = ['#c8553d', '#2a9d8f', '#e9c46a', '#457b9d', '#6d597a', '#e76f51', '#3d7a8a', '#b5651d'];

/* ------------------------------------------------------------------ */
/* Casco genérico                                                      */
/* ------------------------------------------------------------------ */

interface HullOpts {
  length: number;
  halfWidth: number;
  /** Calado (por debajo de y=0). */
  draft: number;
  /** Francobordo (por encima de y=0). */
  freeboard: number;
  /** Fracción de eslora que ocupa la proa afilada. */
  bowFrac: number;
  bottom: string;
  top: string;
  stripe?: string;
  deck: string;
  /** Arrufo extra en proa (m). */
  sheer?: number;
  stations?: number;
}

/** Casco cerrado (costados, espejo y cubierta) centrado en x = 0, con caras orientadas hacia fuera. */
export function loftHull(kit: Kit, o: HullOpts): void {
  const N = o.stations ?? 9;
  const x0 = -o.length / 2;
  const bowStart = o.length / 2 - o.length * o.bowFrac;
  const sheer = o.sheer ?? o.freeboard * 0.25;
  // Filas del perfil: [fracción de media manga, y]
  const rows: [number, number][] = [
    [0, -o.draft],
    [0.62, -o.draft * 0.9],
    [0.95, -o.draft * 0.3],
    [1, 0.25],
    [1.02, o.freeboard * 0.62],
    [1.03, o.freeboard],
  ];
  const bandColor = (i: number): string => {
    if (i <= 1) return o.bottom;
    if (i === 2) return o.bottom;
    if (i === rows.length - 2 && o.stripe) return o.stripe;
    return o.top;
  };
  const stations: V3[][] = [];
  for (let s = 0; s <= N; s++) {
    const x = x0 + (o.length * s) / N;
    const t = x > bowStart ? (x - bowStart) / (o.length / 2 - bowStart) : 0;
    const taper = 1 - Math.pow(Math.min(1, t), 1.7);
    const sternTaper = s === 0 ? 0.9 : 1;
    const hw = o.halfWidth * taper * sternTaper;
    const rise = t * t * sheer;
    stations.push(
      rows.map(([zf, y], i) => {
        // La quilla sube en la proa (pie de roda).
        const yy = i <= 1 ? y + t * t * o.draft * 0.85 : i === rows.length - 1 ? y + rise : y + rise * (i / rows.length);
        return [x, yy, zf * hw] as V3;
      }),
    );
  }
  const mir = (p: V3): V3 => [p[0], p[1], -p[2]];
  for (let s = 0; s < N; s++) {
    const A = stations[s]!;
    const B = stations[s + 1]!;
    for (let i = 0; i + 1 < rows.length; i++) {
      const a = A[i]!;
      const b = B[i]!;
      const c = B[i + 1]!;
      const d = A[i + 1]!;
      const col = bandColor(i);
      kit.poly([a, b, c, d], col, undefined, false);
      kit.poly([mir(a), mir(d), mir(c), mir(b)], col, undefined, false);
    }
    // Cubierta
    const ta = A[rows.length - 1]!;
    const tb = B[rows.length - 1]!;
    kit.poly([ta, tb, mir(tb), mir(ta)], o.deck, undefined, false);
  }
  // Espejo de popa
  const S = stations[0]!;
  for (let i = 0; i + 1 < rows.length; i++) {
    kit.poly([S[i]!, S[i + 1]!, mir(S[i + 1]!), mir(S[i]!)], bandColor(i), undefined, false);
  }
}

/* ------------------------------------------------------------------ */
/* Palmeras, rocas, cabañas                                             */
/* ------------------------------------------------------------------ */

function palm(kit: Kit, x: number, y: number, z: number, h: number, lean: number, yaw: number): void {
  kit.push({ p: [x, y, z], r: [0, yaw, 0] });
  const segs = 5;
  let px = 0;
  let py = 0;
  const segH = h / segs;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const dx = lean * (0.3 + t) * segH * 0.5;
    const r0 = 0.32 - t * 0.12;
    kit.cyl(r0 - 0.04, r0, segH * 1.04, 6, i % 2 ? COL.trunk : '#7a5c3e', { p: [px + dx / 2, py + segH / 2, 0], r: [0, 0, -Math.atan2(dx, segH)] });
    px += dx;
    py += segH;
  }
  // Copa: hojas colgantes y cocos.
  const nLeaves = 7;
  for (let i = 0; i < nLeaves; i++) {
    const a = (i / nLeaves) * Math.PI * 2 + kit.random() * 0.4;
    const len = 2.6 + kit.random() * 0.9;
    kit.push({ p: [px, py, 0], r: [0, a, 0] });
    kit.poly(
      [
        [0, 0.1, 0],
        [len * 0.45, 0.55, 0.42],
        [len, -0.75, 0.05],
        [len * 0.45, 0.55, -0.42],
      ],
      i % 2 ? COL.leaf : COL.leafLight,
    );
    kit.pop();
  }
  for (let i = 0; i < 3; i++) kit.rock(0.2, 0, '#6b4f2a', { p: [px + Math.cos(i * 2.1) * 0.3, py - 0.25, Math.sin(i * 2.1) * 0.3] }, 0.1);
  kit.pop();
}

function rockCluster(kit: Kit, x: number, z: number, r: number, n: number, y = 0, color = COL.rock): void {
  for (let i = 0; i < n; i++) {
    const a = kit.random() * Math.PI * 2;
    const d = kit.random() * r * 0.6;
    const s = r * (0.35 + kit.random() * 0.5);
    kit.rock(1, 0, i % 2 ? color : COL.rockDark, { p: [x + Math.cos(a) * d, y + s * 0.15, z + Math.sin(a) * d], r: [kit.random(), kit.random() * 3, kit.random()], s: [s, s * (0.6 + kit.random() * 0.5), s] }, 0.22);
  }
}

/* ------------------------------------------------------------------ */
/* Avistamientos                                                       */
/* ------------------------------------------------------------------ */

/** Naufragio: casco semihundido y escorado, mástil roto, vela rasgada y restos. */
export function wreckModel(seed: number, scale = 1): WorldModel {
  const kit = new Kit(seed, 0.09);
  kit.push({ s: scale });
  // Casco: inclinado (escora y proa al aire) y hundido de popa.
  kit.push({ p: [0, -2.1, 0], r: [0.4, 0, 0.27] });
  loftHull(kit, { length: 24, halfWidth: 3.6, draft: 2.4, freeboard: 2.6, bowFrac: 0.32, bottom: COL.rustDark, top: COL.rust, stripe: COL.rustLight, deck: COL.woodDark, sheer: 1.1 });
  // Caseta destrozada
  kit.box(5, 2.2, 4.6, '#6e5a48', { p: [-5, 3.6, 0], r: [0, 0, 0.06] });
  kit.box(5.4, 0.25, 5, COL.rustDark, { p: [-5, 4.8, 0.2], r: [0.12, 0, -0.1] });
  kit.box(1.2, 0.9, 0.12, '#1f2a30', { p: [-3.3, 3.9, 2.32] });
  // Mástil roto y su trozo caído
  kit.cyl(0.28, 0.34, 7, 7, COL.woodDark, { p: [3, 5.9, 0] });
  kit.cone(0.32, 1.1, 6, COL.woodDark, { p: [3.1, 9.7, 0.05], r: [0.4, 0, 0.5] });
  kit.cyl(0.24, 0.28, 9, 7, COL.woodDark, { p: [7.5, 3.4, -3.4], r: [0.9, 0.3, 1.0] });
  // Vela rasgada colgando de la verga
  kit.box(5.5, 0.18, 0.18, COL.woodDark, { p: [3, 8.4, 0], r: [0, 0, 0.12] });
  kit.poly(
    [
      [0.5, 8.3, 0.05],
      [5.4, 8.9, 0.05],
      [4.9, 6.2, 0.2],
      [3.4, 5.1, 0.4],
      [1.9, 6.8, 0.15],
      [0.9, 5.9, 0.2],
    ],
    COL.canvasDirty,
  );
  // Cabos colgando
  kit.box(0.06, 5.5, 0.06, COL.canvasDirty, { p: [0.2, 6.4, 3.2], r: [0.5, 0, 0] });
  kit.pop();
  // Restos flotando alrededor
  for (let i = 0; i < 7; i++) {
    const a = kit.random() * Math.PI * 2;
    const d = 9 + kit.random() * 7;
    const t = kit.random();
    if (t < 0.4) kit.box(1.1, 0.55, 1.1, i % 2 ? COL.woodLight : COL.wood, { p: [Math.cos(a) * d, 0.1, Math.sin(a) * d], r: [0.2, a, 0.1] });
    else if (t < 0.7) kit.cyl(0.4, 0.4, 1.1, 8, COL.rustLight, { p: [Math.cos(a) * d, 0.15, Math.sin(a) * d], r: [Math.PI / 2, a, 0] });
    else kit.box(3.2, 0.2, 0.5, COL.wood, { p: [Math.cos(a) * d, 0.05, Math.sin(a) * d], r: [0, a, 0.05] });
  }
  kit.pop();
  return { solid: kit.build(), glow: null, beamY: null, radius: 16 * scale };
}

/** Isla tropical: playa, colinas verdes, rocas, palmeras, cabaña y rompiente. */
export function islandModel(seed: number, scale = 1, hut = true): WorldModel {
  const kit = new Kit(seed, 0.08);
  kit.push({ s: scale });
  // Base sumergida y playa
  kit.cyl(30, 40, 6, 18, COL.sandWet, { p: [0, -3.4, 0] });
  kit.cyl(25, 30.5, 1.6, 18, COL.sand, { p: [0, 0.6, 0] });
  // Rompiente: anillo de espuma a ras de agua
  kit.add(new THREE.TorusGeometry(31.5, 0.7, 4, 28), COL.foam, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 0.45] }, 0.02);
  // Colinas
  kit.rock(16, 1, COL.grass, { p: [-3, 1.2, -2], s: [1.25, 0.62, 1.05] }, 0.2);
  kit.rock(11, 1, COL.grassDark, { p: [7, 2.5, 4], s: [1.1, 0.95, 1] }, 0.22);
  kit.rock(7, 1, COL.jungle, { p: [-10, 2, 7], s: [1, 0.8, 1] }, 0.2);
  // Cumbre rocosa
  kit.rock(4.5, 0, COL.rock, { p: [7.5, 11.5, 4], s: [1, 1.3, 1] }, 0.25);
  // Rocas en la orilla
  rockCluster(kit, 24, -10, 6, 4);
  rockCluster(kit, -22, 14, 5, 3);
  rockCluster(kit, -8, -26, 4, 3);
  // Palmeras repartidas por la playa
  const palms = 9;
  for (let i = 0; i < palms; i++) {
    const a = (i / palms) * Math.PI * 2 + kit.random() * 0.5;
    const d = 18 + kit.random() * 6;
    palm(kit, Math.cos(a) * d, 1.2, Math.sin(a) * d, 6 + kit.random() * 3.5, 0.6 + kit.random() * 0.8, a + Math.PI / 2 + (kit.random() - 0.5));
  }
  // Arbustos
  for (let i = 0; i < 8; i++) {
    const a = kit.random() * Math.PI * 2;
    const d = 8 + kit.random() * 10;
    kit.rock(1.6 + kit.random() * 1.2, 0, i % 2 ? COL.leaf : COL.grassDark, { p: [Math.cos(a) * d, 2.5 + kit.random() * 2, Math.sin(a) * d] }, 0.25);
  }
  if (hut) {
    // Cabaña de náufrago con techo de hojas
    kit.push({ p: [16, 1.4, 11], r: [0, -0.7, 0] });
    for (const [px, pz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]] as const) kit.cyl(0.12, 0.14, 2.4, 5, COL.woodDark, { p: [px, 1.2, pz] });
    kit.box(3.0, 0.15, 2.6, COL.woodLight, { p: [0, 0.5, 0] });
    kit.box(2.8, 1.3, 0.1, COL.wood, { p: [0, 1.2, -1.15] });
    kit.cone(2.6, 1.6, 4, '#c9a75a', { p: [0, 3.1, 0], r: [0, Math.PI / 4, 0] });
    kit.pop();
  }
  kit.pop();
  return { solid: kit.build(), glow: null, beamY: null, radius: 36 * scale };
}

/** Pequeño carguero con contenedores (navega a la par para comerciar). */
export function merchantModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.05);
  const glow = new Kit(seed + 1, 0);
  loftHull(kit, { length: 42, halfWidth: 4.8, draft: 2.6, freeboard: 3.6, bowFrac: 0.3, bottom: COL.antifoul, top: '#1d4e5f', stripe: COL.white, deck: '#6b7a80', sheer: 1.4, stations: 10 });
  // Bodega de contenedores (proa y centro)
  const bays = [-3.5, 2.8, 9.1];
  let k = 0;
  for (const bx of bays) {
    for (const bz of [-2.7, 0, 2.7]) {
      const tiers = 1 + ((seed + k) % 3 === 0 ? 0 : 1) + ((seed + k * 7) % 5 === 0 ? 1 : 0);
      for (let t = 0; t < tiers; t++) {
        const c = CONTAINER_COLORS[(seed * 3 + k * 5 + t * 3) % CONTAINER_COLORS.length]!;
        kit.box(6, 2.5, 2.55, c, { p: [bx, 3.6 + 1.27 + t * 2.52, bz] });
        // Marcos de los extremos del contenedor
        for (const ex of [-2.95, 2.95]) kit.box(0.14, 2.52, 2.6, '#2b2f33', { p: [bx + ex, 3.6 + 1.27 + t * 2.52, bz] });
      }
      k++;
    }
  }
  // Superestructura a popa
  kit.box(7, 7.5, 8.4, COL.white, { p: [-14.5, 3.6 + 3.75, 0] });
  kit.box(7.4, 0.3, 11.5, COL.white, { p: [-14.2, 3.6 + 7.4, 0] }); // alerones del puente
  kit.box(5.8, 2.2, 7.6, COL.white, { p: [-14.8, 3.6 + 8.65, 0] });
  kit.box(5.9, 0.9, 7.7, COL.glass, { p: [-14.8, 3.6 + 9.0, 0] });
  kit.box(6.2, 0.25, 8.0, COL.white, { p: [-14.8, 3.6 + 9.85, 0] }); // techo del puente
  // Chimenea
  kit.box(2.4, 3.6, 2.4, '#2f3e46', { p: [-17.4, 3.6 + 10.6, 0] });
  kit.box(2.5, 0.8, 2.5, COL.red, { p: [-17.4, 3.6 + 11.6, 0] });
  // Mástiles y grúa
  kit.cyl(0.18, 0.22, 6, 6, COL.steel, { p: [-14.8, 3.6 + 12.8, 0] });
  kit.cyl(0.2, 0.25, 8, 6, COL.yellow, { p: [14.5, 3.6 + 4, 0] });
  kit.cyl(0.14, 0.16, 9, 6, COL.yellow, { p: [10.8, 3.6 + 6.4, 1.4], r: [0.25, 0, 0.95] });
  // Castillo de proa
  kit.box(4, 1.2, 6.5, '#1d4e5f', { p: [17.4, 3.6 + 0.6, 0] });
  // Botes salvavidas
  kit.box(3.2, 1.1, 1.3, '#ff7b25', { p: [-14.5, 3.6 + 4.6, 4.9] });
  kit.box(3.2, 1.1, 1.3, '#ff7b25', { p: [-14.5, 3.6 + 4.6, -4.9] });
  // Ventanas del alojamiento (se encienden de noche)
  for (const lvl of [5.0, 7.0]) {
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) glow.box(0.9, 0.6, 0.06, COL.windowLit, { p: [-16.8 + i * 1.6, 3.6 + lvl - 1, side * 4.24] });
    }
  }
  // Cristalera del puente: paneles delante, detrás y a los lados (sin tapa).
  glow.box(0.06, 0.55, 7.2, COL.windowLit, { p: [-11.86, 3.6 + 9.0, 0] });
  glow.box(0.06, 0.55, 7.2, COL.windowLit, { p: [-17.74, 3.6 + 9.0, 0] });
  for (const side of [-1, 1]) glow.box(5.4, 0.55, 0.06, COL.windowLit, { p: [-14.8, 3.6 + 9.0, side * 3.86] });
  // Luces de navegación: tope blanco, babor roja, estribor verde
  glow.rock(0.32, 0, COL.lampWhite, { p: [-14.8, 3.6 + 15.9, 0] }, 0);
  glow.rock(0.3, 0, COL.lampWhite, { p: [14.5, 3.6 + 8.2, 0] }, 0);
  glow.box(0.4, 0.4, 0.4, COL.lampRed, { p: [-14.2, 3.6 + 7.75, -5.6] });
  glow.box(0.4, 0.4, 0.4, COL.lampGreen, { p: [-14.2, 3.6 + 7.75, 5.6] });
  // Ola de proa (espuma a ras de agua)
  for (const side of [-1, 1]) {
    kit.poly(
      [
        [21.2, 0.25, 0],
        [14, 0.35, side * 5.6],
        [8, 0.12, side * 6.4],
        [16, 0.05, side * 4.6],
      ],
      COL.foam,
      undefined,
      true,
    );
  }
  return { solid: kit.build(), glow: glow.build(), beamY: null, radius: 22 };
}

/** Plataforma petrolífera abandonada y oxidada. */
export function platformModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.1);
  const glow = new Kit(seed + 1, 0);
  const legs: [number, number][] = [
    [-8, -8],
    [8, -8],
    [-8, 8],
    [8, 8],
  ];
  for (const [x, z] of legs) {
    kit.cyl(1.0, 1.2, 17, 8, COL.rust, { p: [x, 4.5, z] });
    kit.cyl(1.5, 1.6, 1.2, 8, COL.rustDark, { p: [x, 0.2, z] });
  }
  // Riostras
  for (const [ax, az, bx, bz] of [
    [-8, -8, 8, -8],
    [-8, 8, 8, 8],
    [-8, -8, -8, 8],
    [8, -8, 8, 8],
  ] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = -Math.atan2(bz - az, bx - ax);
    kit.box(len, 0.45, 0.45, COL.rustDark, { p: [(ax + bx) / 2, 6, (az + bz) / 2], r: [0, yaw, 0] });
    kit.box(len * 1.08, 0.35, 0.35, COL.rustDark, { p: [(ax + bx) / 2, 3.5, (az + bz) / 2], r: [0, yaw, 0.5] });
  }
  // Cubierta principal
  kit.box(24, 1.6, 24, '#6e5446', { p: [0, 13.6, 0] });
  kit.box(24.4, 0.3, 24.4, COL.rustLight, { p: [0, 14.5, 0] });
  // Barandillas amarillas
  for (const s of [-1, 1]) {
    kit.box(24, 0.12, 0.12, COL.yellow, { p: [0, 15.6, s * 12] });
    kit.box(0.12, 0.12, 24, COL.yellow, { p: [s * 12, 15.6, 0] });
  }
  // Torre de perforación (pirámide de celosía)
  const h = 18;
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    kit.box(0.35, h * 1.02, 0.35, COL.rustLight, { p: [x * 0.6, 14.6 + h / 2, z * 0.6], r: [-z * 0.035, 0, x * 0.035] });
  }
  for (let i = 1; i < 6; i++) {
    const y = 14.6 + (h * i) / 6;
    const w = 3.6 * (1 - i / 7.5);
    kit.box(w * 2, 0.2, 0.2, COL.rustLight, { p: [0, y, w] });
    kit.box(w * 2, 0.2, 0.2, COL.rustLight, { p: [0, y, -w] });
    kit.box(0.2, 0.2, w * 2, COL.rustLight, { p: [w, y, 0] });
    kit.box(0.2, 0.2, w * 2, COL.rustLight, { p: [-w, y, 0] });
  }
  // Módulo habitable y helipuerto
  kit.box(8, 4, 6, '#9aa3a8', { p: [-6, 16.6, -6] });
  kit.box(8.2, 0.4, 6.2, COL.rustDark, { p: [-6, 18.8, -6] });
  kit.cyl(5.5, 5.5, 0.4, 12, '#4c5559', { p: [7, 19.4, 6] });
  kit.box(0.6, 0.06, 3, COL.yellow, { p: [6, 19.62, 6] });
  kit.box(0.6, 0.06, 3, COL.yellow, { p: [8, 19.62, 6] });
  kit.box(2, 0.06, 0.6, COL.yellow, { p: [7, 19.62, 6] });
  for (const [x, z] of [[4, 3], [10, 3], [4, 9], [10, 9]] as const) kit.box(0.4, 4.6, 0.4, COL.rust, { p: [x, 17.2, z] });
  // Grúa caída
  kit.box(0.6, 0.6, 14, COL.yellow, { p: [5, 17, -8], r: [0.4, 0.5, 0] });
  // Contenedores oxidados
  kit.box(6, 2.5, 2.5, '#7a4a33', { p: [-5, 15.7, 7] });
  kit.box(6, 2.5, 2.5, '#5d6b5c', { p: [-5, 15.7, 9.8], r: [0, 0.1, 0] });
  // Luz de baliza parpadeante (se enciende de noche)
  glow.rock(0.5, 0, COL.lampRed, { p: [0, 14.6 + h + 0.6, 0] }, 0);
  glow.box(1.2, 0.8, 0.08, COL.windowLit, { p: [-4, 16.8, -2.95] });
  return { solid: kit.build(), glow: glow.build(), beamY: null, radius: 17 };
}

/** Faro sobre un islote rocoso, con casa del farero. El haz gira de noche. */
export function lighthouseModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.08);
  const glow = new Kit(seed + 1, 0);
  rockCluster(kit, 0, 0, 16, 7, -1.5);
  rockCluster(kit, 9, 6, 8, 4, -1);
  kit.rock(10, 1, COL.rockDark, { p: [0, -2, 0], s: [1.5, 0.5, 1.3] }, 0.2);
  // Torre de franjas rojas y blancas
  const base = 3;
  const bands = 6;
  const H = 19;
  for (let i = 0; i < bands; i++) {
    const t0 = i / bands;
    const t1 = (i + 1) / bands;
    const r0 = 2.4 - t0 * 0.85;
    const r1 = 2.4 - t1 * 0.85;
    kit.cyl(r1, r0, H / bands, 10, i % 2 ? COL.red : COL.white, { p: [0, base + (H * (t0 + t1)) / 2, 0] });
  }
  const top = base + H;
  kit.cyl(2.25, 2.0, 0.35, 10, COL.steelDark, { p: [0, top + 0.17, 0] });
  kit.cyl(2.25, 2.25, 0.8, 10, COL.steelDark, { p: [0, top + 0.75, 0] }, true);
  kit.cyl(1.25, 1.25, 2.1, 10, COL.glass, { p: [0, top + 1.4, 0] });
  kit.cone(1.7, 1.6, 10, COL.red, { p: [0, top + 3.25, 0] });
  kit.rock(0.25, 0, COL.steelDark, { p: [0, top + 4.15, 0] }, 0);
  // Casa del farero
  kit.box(6, 3.2, 4.5, COL.white, { p: [-6.5, base + 0.4, 3] });
  kit.add(new THREE.CylinderGeometry(0, 3.9, 2, 4, 1), COL.red, { p: [-6.5, base + 3, 3], r: [0, Math.PI / 4, 0], s: [1.15, 1, 0.85] });
  glow.box(0.9, 0.9, 0.08, COL.windowLit, { p: [-5.2, base + 0.6, 5.28] });
  glow.box(0.9, 0.9, 0.08, COL.windowLit, { p: [-7.8, base + 0.6, 5.28] });
  // Linterna
  glow.cyl(1.0, 1.0, 1.4, 10, COL.lampWhite, { p: [0, top + 1.4, 0] });
  return { solid: kit.build(), glow: glow.build(), beamY: top + 1.4, radius: 16 };
}

/** Torre de señales oxidada sobre un cajón de hormigón, con antenas y balizas. */
export function signalTowerModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.1);
  const glow = new Kit(seed + 1, 0);
  // Cajón de hormigón con defensas
  kit.box(14, 6, 14, '#8f9496', { p: [0, -1, 0] });
  kit.box(14.4, 0.4, 14.4, '#6f7476', { p: [0, 2.2, 0] });
  for (const [x, z] of [[-7.3, -7.3], [7.3, -7.3], [-7.3, 7.3], [7.3, 7.3]] as const) kit.cyl(0.5, 0.5, 2.5, 6, '#2b2f33', { p: [x, 0.6, z] });
  // Caseta
  kit.box(5, 3, 4, '#c9c2b0', { p: [-3, 3.9, -3] });
  kit.box(5.3, 0.3, 4.3, COL.rustDark, { p: [-3, 5.5, -3] });
  glow.box(1, 0.8, 0.06, COL.windowLit, { p: [-3, 4.2, -0.97] });
  // Torre de celosía (cuatro patas que convergen)
  const H = 34;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    kit.box(0.3, H, 0.3, i(x, z) ? COL.rust : COL.rustLight, { p: [x * 1.6, 2.4 + H / 2, z * 1.6], r: [-z * 0.045, 0, x * 0.045] });
  }
  for (let k = 1; k < 9; k++) {
    const y = 2.4 + (H * k) / 9;
    const w = 3.2 * (1 - k / 11);
    kit.box(w, 0.15, 0.15, COL.rustLight, { p: [0, y, w / 2] });
    kit.box(w, 0.15, 0.15, COL.rustLight, { p: [0, y, -w / 2] });
    kit.box(0.15, 0.15, w, COL.rustLight, { p: [w / 2, y, 0] });
    kit.box(0.15, 0.15, w, COL.rustLight, { p: [-w / 2, y, 0] });
  }
  // Antenas y parábola
  kit.cyl(0.08, 0.1, 6, 5, COL.steel, { p: [0, 2.4 + H + 3, 0] });
  kit.add(new THREE.CylinderGeometry(1.4, 0.2, 0.6, 10, 1, true), COL.white, { p: [0.9, 2.4 + H * 0.7, 0.9], r: [0, 0, Math.PI / 2] });
  kit.box(0.1, 3, 1.4, COL.steel, { p: [-1.2, 2.4 + H * 0.85, 0] });
  glow.rock(0.4, 0, COL.lampRed, { p: [0, 2.4 + H + 6.2, 0] }, 0);
  glow.rock(0.3, 0, COL.lampRed, { p: [1.0, 2.4 + H * 0.5, 1.0] }, 0);
  return { solid: kit.build(), glow: glow.build(), beamY: null, radius: 10 };
  function i(x: number, z: number): boolean {
    return (x + z) % 2 === 0;
  }
}

/** Estación meteorológica flotante a la deriva: boya con mástil de instrumentos y paneles. */
export function weatherStationModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.07);
  const glow = new Kit(seed + 1, 0);
  // Flotador
  kit.cyl(6, 5, 2.2, 12, COL.yellow, { p: [0, 0, 0] });
  kit.cyl(6.2, 6.2, 0.4, 12, '#2b2f33', { p: [0, 0.6, 0] });
  kit.cyl(5.6, 5.6, 0.3, 12, '#9aa3a8', { p: [0, 1.2, 0] });
  // Caseta de instrumentos
  kit.box(3.2, 2.4, 2.6, COL.white, { p: [-1.2, 2.5, 0] });
  kit.box(3.4, 0.25, 2.8, COL.red, { p: [-1.2, 3.8, 0] });
  glow.box(0.8, 0.6, 0.06, COL.windowLit, { p: [-1.2, 2.7, 1.32] });
  // Paneles solares
  kit.box(2.6, 0.08, 1.6, '#1d3557', { p: [2.4, 2.4, 1.6], r: [0.45, 0, 0] });
  kit.box(2.6, 0.08, 1.6, '#1d3557', { p: [2.4, 2.4, -1.6], r: [-0.45, 0, 0] });
  kit.box(0.12, 1.1, 0.12, COL.steel, { p: [2.4, 1.8, 0] });
  // Mástil con anemómetro y veleta
  kit.cyl(0.12, 0.15, 9, 6, COL.steel, { p: [1, 5.7, -0.5] });
  kit.cyl(0.05, 0.05, 1.6, 4, COL.steel, { p: [1, 10.2, -0.5], r: [0, 0, Math.PI / 2] });
  for (const sx of [-0.8, 0.8]) kit.add(new THREE.SphereGeometry(0.22, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), COL.white, { p: [1 + sx, 10.2, -0.5], r: [Math.PI / 2, 0, 0] });
  kit.poly(
    [
      [1, 9.4, -0.5],
      [-0.4, 9.6, -0.5],
      [-0.4, 9.0, -0.5],
    ],
    COL.red,
  );
  glow.rock(0.3, 0, COL.lampWhite, { p: [1, 10.7, -0.5] }, 0);
  return { solid: kit.build(), glow: glow.build(), beamY: null, radius: 7 };
}

/** Balsa lejana con bandera de socorro. */
export function raftModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.08);
  for (let i = 0; i < 5; i++) kit.cyl(0.28, 0.28, 3.6, 6, i % 2 ? COL.wood : COL.woodLight, { p: [0, 0.12, -1.1 + i * 0.55], r: [0, 0, Math.PI / 2] });
  kit.cyl(0.07, 0.08, 3.4, 5, COL.woodDark, { p: [0.6, 1.8, 0] });
  kit.poly(
    [
      [0.65, 3.4, 0],
      [2.1, 3.2, 0.1],
      [1.9, 2.6, 0.05],
      [0.65, 2.7, 0],
    ],
    '#ff7b25',
  );
  kit.cyl(0.4, 0.4, 0.9, 8, COL.rustLight, { p: [-1.1, 0.55, 0.5] });
  return { solid: kit.build(), glow: null, beamY: null, radius: 3 };
}

/* ------------------------------------------------------------------ */
/* Decorado lejano por región                                          */
/* ------------------------------------------------------------------ */

/** Isla grande del archipiélago: acantilados, selva y una cumbre. */
export function bigIslandModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.1);
  const R = 70 + kit.random() * 60;
  const H = 30 + kit.random() * 45;
  kit.cyl(R * 0.95, R * 1.15, 6, 14, COL.sand, { p: [0, -2.4, 0] });
  kit.rock(R * 0.8, 1, COL.jungle, { p: [0, H * 0.15, 0], s: [1, (H / R) * 1.1, 0.85] }, 0.25);
  kit.rock(R * 0.45, 1, COL.grassDark, { p: [R * 0.25, H * 0.45, -R * 0.1], s: [1, (H / R) * 1.6, 1] }, 0.3);
  kit.rock(R * 0.18, 0, COL.rock, { p: [R * 0.28, H * 1.05, -R * 0.1], s: [1, 1.4, 1] }, 0.3);
  for (let i = 0; i < 6; i++) {
    const a = kit.random() * Math.PI * 2;
    rockCluster(kit, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.85, R * 0.12, 2, 0);
  }
  for (let i = 0; i < 14; i++) {
    const a = kit.random() * Math.PI * 2;
    const d = R * (0.3 + kit.random() * 0.5);
    kit.rock(R * 0.08 + kit.random() * 4, 0, i % 2 ? COL.leaf : COL.jungle, { p: [Math.cos(a) * d, H * 0.35 + kit.random() * H * 0.3, Math.sin(a) * d * 0.85] }, 0.25);
  }
  return { solid: kit.build(), glow: null, beamY: null, radius: R * 1.1 };
}

/** Iceberg facetado. */
export function icebergModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.07);
  const R = 12 + kit.random() * 22;
  const H = R * (0.7 + kit.random() * 0.9);
  kit.rock(R, 1, COL.ice, { p: [0, H * 0.25, 0], s: [1, H / R, 0.8 + kit.random() * 0.4] }, 0.3);
  kit.rock(R * 0.55, 0, COL.iceBlue, { p: [R * 0.5, H * 0.55, R * 0.2], s: [1, 1.3, 1] }, 0.3);
  kit.rock(R * 1.15, 0, COL.iceDeep, { p: [0, -R * 0.35, 0], s: [1, 0.35, 1] }, 0.2);
  return { solid: kit.build(), glow: null, beamY: null, radius: R * 1.2 };
}

/** Farallón rocoso (región del faro). */
export function seaStackModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.1);
  const n = 2 + Math.floor(kit.random() * 3);
  for (let i = 0; i < n; i++) {
    const r = 6 + kit.random() * 10;
    const h = 14 + kit.random() * 30;
    kit.rock(r, 0, i % 2 ? COL.rock : COL.rockDark, { p: [(kit.random() - 0.5) * 30, h * 0.4, (kit.random() - 0.5) * 24], s: [1, h / r, 0.9] }, 0.25);
  }
  rockCluster(kit, 0, 0, 22, 5, -1);
  return { solid: kit.build(), glow: null, beamY: null, radius: 30 };
}

/** Velero lejano (vida en el mar en aguas tranquilas). */
export function sailboatModel(seed: number): WorldModel {
  const kit = new Kit(seed, 0.05);
  loftHull(kit, { length: 11, halfWidth: 1.8, draft: 1, freeboard: 1.1, bowFrac: 0.4, bottom: COL.white, top: '#2a9d8f', deck: COL.woodLight, stations: 6 });
  kit.cyl(0.1, 0.12, 12, 5, COL.steel, { p: [0.8, 7, 0] });
  kit.poly(
    [
      [0.9, 12.5, 0],
      [0.9, 1.8, 0],
      [-3.8, 1.9, 0],
    ],
    COL.sail,
  );
  kit.poly(
    [
      [0.7, 12, 0],
      [5.3, 1.6, 0],
      [0.7, 1.7, 0],
    ],
    '#f6f1e3',
  );
  return { solid: kit.build(), glow: null, beamY: null, radius: 6 };
}

// Generación del mundo de Puerto Índigo: datos puros (sin Three.js).
// Coordenadas: X = este, Z = sur (norte = -Z), Y = arriba. Unidades en metros.
import { RNG, clamp, MinHeap } from '../core/utils.js';

export const CELL = 80;
export const RH = 8; // media calzada
export const SIDEWALK = 4;
export const ORIGIN = -480;
export const GRID_N = 12;
export const CURB_H = 0.18;
export const WATER_LEVEL = -0.6;
export const LANES = [2.1, 5.9];
export const LAMP_OFF = 9.5;
export const LAMP_H = 7.6;

export const MAIN = { minX: -560, maxX: 560, minZ: -560, maxZ: 560 };
export const ISLAND = {
  minX: 760, maxX: 1080, minZ: -360, maxZ: -40,
  xs: [800, 880, 960, 1040], zs: [-320, -240, -160, -80],
};
export const BRIDGE = { x0: 560, x1: 760, z: -160, halfW: 10.5, rise: 6.5 };
export const CAYO = { x: 760, z: 560, r: 34 };
export const PIERS_X = [-200, -40, 120, 280, 420];
export const PIER = { z0: 556, z1: 640, halfW: 6, y: 0.25 };

const MAIN_LINES = Array.from({ length: GRID_N + 1 }, (_, i) => ORIGIN + i * CELL);

export const STREETS_V = [
  'Av. del Astillero', 'Av. Fundidores', 'Av. Los Olivos', 'Av. Libertad', 'Av. Mirador', 'Av. Neptuno',
  'Av. Central', 'Av. Coral', 'Av. Gaviotas', 'Av. Faro', 'Av. Sol Naciente', 'Av. Marea', 'Av. Costanera',
];
export const STREETS_H = [
  'Calle Brisa', 'Calle Alta', 'Calle Jacarandá', 'Calle Palmar', 'Calle Esmeralda', 'Calle Bandoneón',
  'Calle Mayor', 'Calle Luna', 'Calle Mercado', 'Calle Sirena', 'Calle Ancla', 'Calle Muelle', 'Calle Puerto',
];
const ISLAND_V = ['Paseo Las Garzas', 'Paseo Mangle', 'Paseo Caracola', 'Paseo Arrecife'];
const ISLAND_H = ['Vía Perla', 'Vía Coral Alto', 'Vía Esmeralda', 'Vía Nácar'];

export const DISTRICTS = {
  centro: { name: 'Centro Financiero' },
  playa: { name: 'Playa Coral' },
  puerto: { name: 'Los Muelles' },
  industrial: { name: 'Zona Industrial' },
  residencial: { name: 'Barrio Alto' },
  mercado: { name: 'El Mercado' },
  isla: { name: 'Isla Esmeralda' },
};

// Paletas
const PAL = {
  glass: [0x5d7f99, 0x4b7a80, 0x86765a, 0x93a2b4, 0x3c587c, 0x60707e, 0x2f4f5f, 0x7d8f86],
  office: [0xd6cdbd, 0xbcb3a5, 0xa8a299, 0xe4ddd0, 0x8e8983, 0xc8b69b, 0xb9a48a, 0x9fa7ad],
  brick: [0x9a5b45, 0x8a4f3c, 0xa8664c, 0x7b4a3a, 0xb07a5e],
  pastel: [0xf0b4a5, 0x9cd6c8, 0xf3d49d, 0xa5c4e4, 0xf3efe4, 0xd6b6e6, 0xffc796, 0xb8e0d2],
  shop: [0xe6d6b3, 0xc45a48, 0x5a8c87, 0xd69e5a, 0x7a6d9c, 0xe3e3e3, 0x998a69, 0x6f8fa8],
  house: [0xf1e7d0, 0xe6ceae, 0xcde1de, 0xeec6b2, 0xd8d2ea, 0xfafafa, 0xc2d4a6, 0xe9dcc4],
  roofs: [0x8c4b3a, 0x6e6f73, 0x5b4637, 0x9a5a3f, 0x4d5560, 0x7a3f33],
  warehouse: [0x8a97a4, 0x998e7f, 0x6e7e73, 0xa48b69, 0x7a8693, 0xafa38e, 0x5f6e7d],
  villa: [0xfbfaf6, 0xf1ece2, 0xe9efe8, 0xf6efe6],
  container: [0xb5402f, 0x2f6fa8, 0x3f8a52, 0xd9a032, 0x7b7f86, 0xe0e0dc, 0x8e3f7a, 0x2e9aa0, 0xc4632a],
};

const NEON_TEXTS = [
  'BAR', 'HOTEL', '24 HS', 'CLUB', 'CAFÉ', 'PIZZA', 'MOTEL', 'TACOS', 'BOLICHE', 'FARMACIA', 'KIOSCO',
  'EMPANADAS', 'KARAOKE', 'SUSHI', 'BURGER', 'CERVECERÍA', 'TATTOO', 'GYM', 'ARCADE', 'HELADOS', 'DISCO',
  'PARRILLA', 'BOWLING', 'CINE', 'JAZZ', 'RAMEN', 'LAVANDERÍA', 'DINER',
];
const NEON_COLORS = [0x33e1ff, 0xff4fa3, 0xffb547, 0x4dffa6, 0xb18cff, 0xff5a5f, 0xfff07a];

export const POI_DEFS = [
  { id: 'safehouse', name: 'Departamento', icon: 'safehouse', block: [8, 7], side: 's', kind: 'safehouse' },
  { id: 'taller', name: 'Taller Neón', icon: 'taller', block: [3, 8], side: 'e', kind: 'taller', sign: 'TALLER NEÓN', signColor: 0x33e1ff },
  { id: 'armeria', name: 'Armería Calibre', icon: 'gun_shop', block: [8, 9], side: 'w', kind: 'armeria', sign: 'ARMERÍA', signColor: 0xff5a5f },
  { id: 'armeria2', name: 'Armería del Norte', icon: 'gun_shop', block: [2, 2], side: 's', kind: 'armeria', sign: 'ARMERÍA', signColor: 0xff5a5f },
  { id: 'ropa', name: 'Moda Índigo', icon: 'clothes', block: [7, 6], side: 's', kind: 'ropa', sign: 'MODA ÍNDIGO', signColor: 0xb18cff },
  { id: 'hospital', name: 'Hospital San Rafael', icon: 'hospital', block: [3, 5], side: 'e', kind: 'hospital', sign: 'HOSPITAL', signColor: 0xff4040 },
  { id: 'policia', name: 'Comisaría Central', icon: 'police', block: [5, 6], side: 's', kind: 'policia', sign: 'POLICÍA', signColor: 0x4f8dff },
  { id: 'banco', name: 'Banco Índigo', icon: 'bank_blip', block: [6, 3], side: 's', kind: 'banco', sign: 'BANCO ÍNDIGO', signColor: 0xffd27a },
  { id: 'club', name: 'Club Órbita', icon: 'club', block: [9, 5], side: 'w', kind: 'club', sign: 'CLUB ÓRBITA', signColor: 0xff4fa3 },
  { id: 'lavadero', name: 'Lavadero Burbujas', icon: 'property', block: [2, 9], side: 'n', kind: 'lavadero', sign: 'LAVADERO', signColor: 0x33e1ff },
  { id: 'bar', name: 'Bar La Ola', icon: 'property', block: [10, 6], side: 'e', kind: 'bar', sign: 'BAR LA OLA', signColor: 0xffb547 },
  { id: 'concesionaria', name: 'Autos Sol', icon: 'dealer', block: [4, 9], side: 'n', kind: 'concesionaria', sign: 'AUTOS SOL', signColor: 0xffb547 },
];

const SPECIAL_BLOCKS = {
  '6,8': { type: 'parque', name: 'Parque Central' },
  '2,6': { type: 'parque', name: 'Plaza de los Olivos' },
  '8,1': { type: 'parque', name: 'Parque Brisa' },
  '6,4': { type: 'plaza', name: 'Plaza Mayor' },
  '5,4': { type: 'landmark', name: 'Torre Índigo' },
  '7,3': { type: 'round', name: 'Torre Marea' },
};

export function mainDistrict(i, j) {
  if (i >= 10) return 'playa';
  if (j >= 10) return 'puerto';
  if (i <= 1) return 'industrial';
  if (i >= 4 && i <= 8 && j >= 2 && j <= 6) return 'centro';
  if (j <= 1 || (i <= 3 && j <= 6)) return 'residencial';
  return 'mercado';
}

// ---------------------------------------------------------------------------
// Alturas de terreno y superficies
function beachProfile(d) {
  if (d <= 0) return 0;
  if (d < 16) return -0.0375 * d;
  return Math.max(-7, -0.6 - (d - 16) * 0.085);
}
function rectOut(x, z, minX, maxX, minZ, maxZ) {
  const dx = Math.max(minX - x, 0, x - maxX);
  const dz = Math.max(minZ - z, 0, z - maxZ);
  return Math.hypot(dx, dz);
}

/** Altura del terreno natural (playas, fondo marino); 0 en tierra firme. */
export function terrainHeight(x, z) {
  if (x >= MAIN.minX && x <= MAIN.maxX && z >= MAIN.minZ && z <= MAIN.maxZ) return 0;
  let h = -7;
  if (x > MAIN.maxX) {
    const dz = Math.max(0, MAIN.minZ - z, z - MAIN.maxZ);
    h = Math.max(h, beachProfile(Math.hypot(x - MAIN.maxX, dz * 1.6)));
  } else {
    // Muros de contención: caída abrupta
    const d = rectOut(x, z, MAIN.minX, MAIN.maxX, MAIN.minZ, MAIN.maxZ);
    if (d < 3) h = Math.max(h, -4.5);
  }
  const di = rectOut(x, z, ISLAND.minX, ISLAND.maxX, ISLAND.minZ, ISLAND.maxZ);
  if (di === 0) return 0;
  h = Math.max(h, beachProfile(di));
  const dc = Math.hypot(x - CAYO.x, z - CAYO.z) - CAYO.r;
  if (dc <= 0) return 0.6;
  h = Math.max(h, dc < 10 ? 0.6 - dc * 0.18 : beachProfile(dc - 8) - 1.2);
  return h;
}

export function bridgeDeckY(x) {
  const t = clamp((x - BRIDGE.x0) / (BRIDGE.x1 - BRIDGE.x0), 0, 1);
  return BRIDGE.rise * Math.sin(Math.PI * t);
}
export function onBridge(x, z) {
  return x >= BRIDGE.x0 - 0.5 && x <= BRIDGE.x1 + 0.5 && Math.abs(z - BRIDGE.z) <= BRIDGE.halfW;
}
export function onPier(x, z) {
  if (z < PIER.z0 || z > PIER.z1) return false;
  for (const px of PIERS_X) if (Math.abs(x - px) <= PIER.halfW) return true;
  return false;
}

/** ¿El punto está sobre una calzada asfaltada (no vereda)? */
export function isRoad(x, z) {
  // Continente
  if (x >= -488 && x <= 488 && z >= -488 && z <= 488) {
    const gx = (x - ORIGIN) / CELL, gz = (z - ORIGIN) / CELL;
    const dx = Math.abs(x - (Math.round(gx) * CELL + ORIGIN));
    const dz = Math.abs(z - (Math.round(gz) * CELL + ORIGIN));
    return dx < RH || dz < RH;
  }
  // Acceso al puente por la playa y puente
  if (Math.abs(z - BRIDGE.z) < RH && x > 488 && x < 800) return true;
  // Isla
  if (x >= ISLAND.xs[0] - RH && x <= ISLAND.xs[3] + RH && z >= ISLAND.zs[0] - RH && z <= ISLAND.zs[3] + RH) {
    for (const lx of ISLAND.xs) if (Math.abs(x - lx) < RH) return true;
    for (const lz of ISLAND.zs) if (Math.abs(z - lz) < RH) return true;
  }
  return false;
}

/** Altura de losas elevadas (veredas, manzanas, malecón). */
function slabHeight(x, z) {
  // Continente dentro de la grilla
  if (x >= -488 && x <= 488 && z >= -488 && z <= 488) return isRoad(x, z) ? 0 : CURB_H;
  if (x > 488) {
    if (Math.abs(z - BRIDGE.z) < RH) return 0;
    return x <= 496 ? CURB_H : 0; // paseo costero / arena
  }
  if (x >= MAIN.minX && x <= MAIN.maxX && z >= MAIN.minZ && z <= MAIN.maxZ) return CURB_H; // bordes norte/oeste/sur
  // Isla
  if (x >= ISLAND.minX && x <= ISLAND.maxX && z >= ISLAND.minZ && z <= ISLAND.maxZ) {
    const inGrid = x >= 792 && x <= 1048 && z >= -328 && z <= -72;
    if (!inGrid) return 0; // playa de la isla (acceso al puente incluido)
    return isRoad(x, z) ? 0 : CURB_H;
  }
  return 0;
}

// ---------------------------------------------------------------------------
export class World {
  constructor(seed = 20261124) {
    this.seed = seed;
    this.buildings = [];
    this.colliders = [];
    this.trees = [];
    this.lamps = [];
    this.tlights = [];
    this.signs = [];
    this.billboards = [];
    this.pools = [];
    this.ramps = [];
    this.helipads = [];
    this.pois = [];
    this.blocks = [];
    this.nodes = [];
    this.parking = [];
    this.driveways = [];
    this.cassettes = [];
    this.races = [];
    this.pedZones = [];
    this.props = {
      benches: [], bins: [], hydrants: [], shelters: [], containers: [], cranes: [], tanks: [], chimneys: [],
      umbrellas: [], loungers: [], lifeguards: [], rocks: [], planters: [], bollards: [], fountains: [],
      screens: [], roofBoxes: [], roofTanks: [], antennas: [], fences: [], hedges: [], kiosks: [],
      edgeLights: [], aviation: [], awnings: [],
    };
    this.ship = null;
    this.lighthouse = null;
    this.rng = new RNG(seed);
    this._genRoadGraph();
    this._genBlocks();
    this._genStreetFurniture();
    this._genBorders();
    this._genIslandAndCayo();
    this._genRamps();
    this._genCassettes();
    this._genRaces();
  }

  // ------------------------------------------------------------- red vial
  _genRoadGraph() {
    const nodes = this.nodes;
    this.mainNode = [];
    for (let i = 0; i <= GRID_N; i++) {
      this.mainNode[i] = [];
      for (let j = 0; j <= GRID_N; j++) {
        const n = { id: nodes.length, x: MAIN_LINES[i], z: MAIN_LINES[j], grid: 'main', i, j, nb: [], light: false, phase: ((i + j) % 4) * 5.5 };
        nodes.push(n);
        this.mainNode[i][j] = n;
      }
    }
    this.islandNode = [];
    for (let i = 0; i < 4; i++) {
      this.islandNode[i] = [];
      for (let j = 0; j < 4; j++) {
        const n = { id: nodes.length, x: ISLAND.xs[i], z: ISLAND.zs[j], grid: 'isla', i, j, nb: [], light: false, phase: 0 };
        nodes.push(n);
        this.islandNode[i][j] = n;
      }
    }
    const link = (a, b, name) => {
      a.nb.push({ node: b.id, name });
      b.nb.push({ node: a.id, name });
    };
    for (let i = 0; i <= GRID_N; i++)
      for (let j = 0; j <= GRID_N; j++) {
        if (i < GRID_N) link(this.mainNode[i][j], this.mainNode[i + 1][j], STREETS_H[j]);
        if (j < GRID_N) link(this.mainNode[i][j], this.mainNode[i][j + 1], STREETS_V[i]);
      }
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        if (i < 3) link(this.islandNode[i][j], this.islandNode[i + 1][j], ISLAND_H[j]);
        if (j < 3) link(this.islandNode[i][j], this.islandNode[i][j + 1], ISLAND_V[i]);
      }
    link(this.mainNode[12][4], this.islandNode[0][2], 'Puente Esmeralda');
    for (const n of nodes) n.light = n.grid === 'main' && n.nb.length >= 3;
  }

  /** Estado del semáforo para un eje ('ns' o 'ew') en un nodo: 'g','y','r'. */
  lightState(node, axis, t) {
    if (!node.light) return 'g';
    const c = (t + node.phase) % 22;
    // 0-9 NS verde, 9-11 NS amarillo, 11-20 EW verde, 20-22 EW amarillo
    if (axis === 'ns') return c < 9 ? 'g' : c < 11 ? 'y' : 'r';
    return c >= 11 && c < 20 ? 'g' : c >= 20 ? 'y' : 'r';
  }

  nearestNode(x, z, maxDist = Infinity) {
    let best = null, bd = maxDist * maxDist;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  /** Punto más cercano sobre el eje de una calle (continente/isla/puente). */
  nearestRoadPoint(x, z) {
    let best = null, bd = Infinity;
    for (const a of this.nodes)
      for (const e of a.nb) {
        if (e.node < a.id) continue;
        const b = this.nodes[e.node];
        const vx = b.x - a.x, vz = b.z - a.z;
        const len2 = vx * vx + vz * vz;
        const t = clamp(((x - a.x) * vx + (z - a.z) * vz) / len2, 0, 1);
        const px = a.x + vx * t, pz = a.z + vz * t;
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) {
          bd = d;
          best = { x: px, z: pz, a, b, t, dirX: vx / Math.sqrt(len2), dirZ: vz / Math.sqrt(len2), dist: Math.sqrt(d) };
        }
      }
    return best;
  }

  /** A* sobre la red de nodos. Devuelve lista de nodos. */
  findPath(startId, goalId) {
    if (startId === goalId) return [this.nodes[startId]];
    const N = this.nodes;
    const g = new Map([[startId, 0]]);
    const came = new Map();
    const open = new MinHeap();
    const h = (id) => Math.hypot(N[id].x - N[goalId].x, N[id].z - N[goalId].z);
    open.push(startId, h(startId));
    const closed = new Set();
    while (open.size) {
      const cur = open.pop();
      if (cur === goalId) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cn = N[cur];
      for (const e of cn.nb) {
        const nn = N[e.node];
        const ng = g.get(cur) + Math.hypot(nn.x - cn.x, nn.z - cn.z);
        if (ng < (g.get(e.node) ?? Infinity)) {
          g.set(e.node, ng);
          came.set(e.node, cur);
          open.push(e.node, ng + h(e.node));
        }
      }
    }
    if (!came.has(goalId)) return null;
    const path = [N[goalId]];
    let c = goalId;
    while (came.has(c)) {
      c = came.get(c);
      path.push(N[c]);
    }
    return path.reverse();
  }

  // ------------------------------------------------------------- manzanas
  _addBld(x, z, w, d, h, style, color, opts = {}) {
    const b = {
      x, z, w, d, h, y0: opts.y0 || 0, style, color, seed: this.rng.next(),
      roof: opts.roof || 0, roofColor: opts.roofColor || 0x555a60, name: opts.name || null, crown: opts.crown || 0,
    };
    this.buildings.push(b);
    this.colliders.push({
      kind: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2,
      minY: b.y0 + (opts.y0 ? 0 : -2), maxY: b.y0 + h, type: 'building', ref: b,
    });
    if (!opts.roof && h > 9 && w > 10 && d > 10 && !opts.noRoofProps) this._roofProps(b);
    return b;
  }

  _roofProps(b) {
    const r = this.rng;
    const top = b.y0 + b.h;
    const n = r.int(1, Math.min(5, Math.floor((b.w * b.d) / 180) + 1));
    for (let k = 0; k < n; k++) {
      const w = r.range(1.6, 4), d = r.range(1.6, 3.5), h = r.range(1, 2.4);
      const x = b.x + r.range(-b.w / 2 + w, b.w / 2 - w) * 0.8;
      const z = b.z + r.range(-b.d / 2 + d, b.d / 2 - d) * 0.8;
      this.props.roofBoxes.push({ x, y: top, z, w, d, h, c: r.pick([0x9aa0a6, 0xb8bcc0, 0x7d8388, 0xc9c4b8]) });
    }
    if (r.chance(0.45)) {
      this.props.roofTanks.push({
        x: b.x + r.range(-0.3, 0.3) * b.w, y: top, z: b.z + r.range(-0.3, 0.3) * b.d,
        r: r.range(1.1, 1.8), h: r.range(2.2, 3.6),
      });
    }
    if (b.h > 40 && r.chance(0.5)) {
      this.props.antennas.push({ x: b.x + r.range(-0.25, 0.25) * b.w, y: top, z: b.z + r.range(-0.25, 0.25) * b.d, h: r.range(6, 18) });
    }
    if (b.h > 70) this.props.aviation.push({ x: b.x, y: top + 0.6, z: b.z, phase: r.next() * 6 });
  }

  _addSign(x, y, z, yaw, text, color, size = 1) {
    const w = Math.max(2.2, text.length * 0.62) * size;
    this.signs.push({ x, y, z, yaw, text, color, w, h: 1.25 * size });
  }

  /** Cartel en la fachada de un edificio mirando hacia el lado indicado. */
  _facadeSign(b, side, text, color, y, size = 1) {
    const o = 0.12;
    if (side === 's') this._addSign(b.x, y, b.z + b.d / 2 + o, 0, text, color, size);
    else if (side === 'n') this._addSign(b.x, y, b.z - b.d / 2 - o, Math.PI, text, color, size);
    else if (side === 'e') this._addSign(b.x + b.w / 2 + o, y, b.z, Math.PI / 2, text, color, size);
    else this._addSign(b.x - b.w / 2 - o, y, b.z, -Math.PI / 2, text, color, size);
  }

  _genBlocks() {
    for (let i = 0; i < GRID_N; i++)
      for (let j = 0; j < GRID_N; j++) {
        const minX = MAIN_LINES[i] + RH, maxX = MAIN_LINES[i + 1] - RH;
        const minZ = MAIN_LINES[j] + RH, maxZ = MAIN_LINES[j + 1] - RH;
        const sp = SPECIAL_BLOCKS[i + ',' + j];
        const blk = {
          id: this.blocks.length, grid: 'main', i, j, minX, maxX, minZ, maxZ,
          cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
          district: mainDistrict(i, j), type: sp ? sp.type : 'normal', name: sp ? sp.name : null,
          ground: 0, // 0 plaza/hormigón,1 pasto,2 arena,3 tierra,4 estacionamiento
        };
        this.blocks.push(blk);
      }
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const minX = ISLAND.xs[i] + RH, maxX = ISLAND.xs[i + 1] - RH;
        const minZ = ISLAND.zs[j] + RH, maxZ = ISLAND.zs[j + 1] - RH;
        this.blocks.push({
          id: this.blocks.length, grid: 'isla', i, j, minX, maxX, minZ, maxZ,
          cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, district: 'isla',
          type: i === 1 && j === 1 ? 'mansion' : 'villas', name: i === 1 && j === 1 ? 'Mansión Esmeralda' : null, ground: 1,
        });
      }
    const poiByBlock = new Map(POI_DEFS.map((p) => [p.block.join(','), p]));
    for (const b of this.blocks) {
      this.rng = new RNG(this.seed + b.id * 7919);
      const poi = b.grid === 'main' ? poiByBlock.get(b.i + ',' + b.j) : null;
      if (poi) this._genPoiBlock(b, poi);
      else this._genBlock(b);
      // zona peatonal: anillo de vereda
      this.pedZones.push({ kind: 'ring', minX: b.minX + 2, maxX: b.maxX - 2, minZ: b.minZ + 2, maxZ: b.maxZ - 2, block: b.id });
    }
    this.rng = new RNG(this.seed + 99991);
  }

  _inner(b) {
    return { x0: b.minX + SIDEWALK, x1: b.maxX - SIDEWALK, z0: b.minZ + SIDEWALK, z1: b.maxZ - SIDEWALK };
  }

  _genBlock(b) {
    const r = this.rng;
    const I = this._inner(b);
    const cx = b.cx, cz = b.cz;
    switch (b.type) {
      case 'parque':
        b.ground = 5;
        this._genPark(b);
        return;
      case 'plaza':
        b.ground = 0;
        this._genPlaza(b);
        return;
      case 'landmark': {
        b.ground = 0;
        const t = this._addBld(cx, cz, 38, 38, 228, 'glass', 0x4a6f8f, { name: 'Torre Índigo', crown: 2, noRoofProps: true });
        this.props.antennas.push({ x: cx, y: t.h, z: cz, h: 34, spire: true });
        this.props.aviation.push({ x: cx, y: t.h + 34, z: cz, phase: 0 });
        this.props.edgeLights.push({ b: t, color: 0x33e1ff });
        this._addBld(cx, cz, 52, 52, 14, 'office', 0xd9d3c7, { noRoofProps: true });
        return;
      }
      case 'round': {
        b.ground = 0;
        const t = this._addBld(cx, cz, 36, 36, 150, 'round', 0x7aa0b8, { name: 'Torre Marea', crown: 1 });
        t.radius = 18;
        this.colliders[this.colliders.length - 1].kind = 'cyl';
        this.colliders[this.colliders.length - 1].r = 18;
        this.colliders[this.colliders.length - 1].x = cx;
        this.colliders[this.colliders.length - 1].z = cz;
        this.props.edgeLights.push({ b: t, color: 0xffb547 });
        return;
      }
    }
    switch (b.district) {
      case 'centro': return this._genCentro(b, I);
      case 'mercado': return this._genMercado(b, I);
      case 'playa': return this._genPlaya(b, I);
      case 'residencial': return this._genResidencial(b, I);
      case 'industrial': return this._genIndustrial(b, I);
      case 'puerto': return this._genPuerto(b, I);
      case 'isla': return this._genIsla(b, I);
    }
  }

  _genCentro(b, I) {
    const r = this.rng;
    b.ground = 0;
    const cf = clamp(1 - Math.hypot(b.i - 6, b.j - 4) / 4.6, 0.12, 1);
    const layout = r.pick(['single', 'single', 'pair', 'quad', 'podium', 'podium']);
    const W = I.x1 - I.x0, cx = b.cx, cz = b.cz;
    const glassOrOffice = () => (r.chance(0.65) ? 'glass' : 'office');
    const colorFor = (s) => r.pick(PAL[s === 'glass' ? 'glass' : 'office']);
    if (layout === 'single') {
      const w = r.range(30, 44), d = r.range(30, 44), h = 55 + 135 * cf * r.range(0.7, 1.1);
      const s = glassOrOffice();
      const bl = this._addBld(cx + r.range(-3, 3), cz + r.range(-3, 3), w, d, h, s, colorFor(s), { roof: h > 110 && r.chance(0.35) ? 2 : 0, crown: r.chance(0.3) ? 1 : 0 });
      if (bl.roof === 2) this.helipads.push({ x: bl.x, y: bl.h, z: bl.z });
      if (r.chance(0.35)) this.props.edgeLights.push({ b: bl, color: r.pick([0x33e1ff, 0xffb547, 0xff4fa3, 0xffffff]) });
    } else if (layout === 'pair') {
      const alongX = r.chance(0.5);
      for (const k of [-1, 1]) {
        const s = glassOrOffice();
        const w = alongX ? r.range(22, 25) : r.range(40, 48);
        const d = alongX ? r.range(40, 48) : r.range(22, 25);
        const h = 40 + 110 * cf * r.range(0.55, 1.05);
        this._addBld(cx + (alongX ? k * W / 4 : 0), cz + (alongX ? 0 : k * W / 4), w, d, h, s, colorFor(s));
      }
    } else if (layout === 'quad') {
      for (const kx of [-1, 1])
        for (const kz of [-1, 1]) {
          const s = glassOrOffice();
          const w = r.range(19, 24), d = r.range(19, 24), h = 28 + 95 * cf * r.range(0.4, 1.0);
          this._addBld(cx + kx * W / 4, cz + kz * W / 4, w, d, h, s, colorFor(s));
        }
    } else {
      const ph = r.range(10, 18);
      this._addBld(cx, cz, W - 2, W - 2, ph, 'office', r.pick(PAL.office), { noRoofProps: true });
      const s = 'glass';
      const tw = r.range(24, 32), td = r.range(24, 32), th = 50 + 130 * cf * r.range(0.7, 1.1);
      const t = this._addBld(cx + r.range(-6, 6), cz + r.range(-6, 6), tw, td, th, s, colorFor(s), { y0: ph, crown: r.chance(0.4) ? 1 : 0 });
      if (r.chance(0.3)) this.props.edgeLights.push({ b: t, color: r.pick([0x33e1ff, 0xffb547, 0xffffff]) });
    }
    // Planteros y palmeras en vereda del centro
    this._sidewalkPlanters(b);
  }

  _genMercado(b, I) {
    const r = this.rng;
    const L = (I.x1 - I.x0) / 3;
    b.ground = r.chance(0.5) ? 4 : 0;
    const taken = new Set();
    const lots = [];
    for (let a = 0; a < 3; a++)
      for (let c = 0; c < 3; c++) {
        if (a === 1 && c === 1) continue;
        lots.push([a, c]);
      }
    for (const [a, c] of lots) {
      if (taken.has(a + ',' + c)) continue;
      let w = L, d = L, ox = I.x0 + (a + 0.5) * L, oz = I.z0 + (c + 0.5) * L;
      // fusionar con vecino del mismo lado
      if (r.chance(0.3)) {
        if ((c === 0 || c === 2) && a < 2 && !taken.has(a + 1 + ',' + c)) {
          taken.add(a + 1 + ',' + c);
          w = L * 2;
          ox += L / 2;
        } else if ((a === 0 || a === 2) && c < 2 && !taken.has(a + ',' + (c + 1)) && !(a === 1 && c + 1 === 1)) {
          taken.add(a + ',' + (c + 1));
          d = L * 2;
          oz += L / 2;
        }
      }
      taken.add(a + ',' + c);
      const tall = r.chance(0.3);
      const style = tall ? 'office' : r.chance(0.45) ? 'brick' : 'shop';
      const h = tall ? r.range(20, 42) : r.range(7.5, 17);
      const bw = w - r.range(0.6, 2.2), bd = d - r.range(0.6, 2.2);
      const bl = this._addBld(ox, oz, bw, bd, h, style, r.pick(PAL[style === 'office' ? 'office' : style]));
      // carteles de neón hacia la calle
      const sides = [];
      if (c === 0) sides.push('n');
      if (c === 2) sides.push('s');
      if (a === 0) sides.push('w');
      if (a === 2) sides.push('e');
      if (sides.length && r.chance(0.75)) {
        const side = r.pick(sides);
        this._facadeSign(bl, side, r.pick(NEON_TEXTS), r.pick(NEON_COLORS), r.range(3.6, 4.6), r.range(0.8, 1.1));
        this._awning(bl, side);
      }
    }
    if (b.ground === 4) {
      // estacionamiento en el patio central
      const x0 = I.x0 + L + 2, z0 = I.z0 + L + 3;
      for (let k = 0; k < 4; k++) this.parking.push({ x: x0 + 2.2 + k * 3.2, z: z0 + 2.5, yaw: 0 });
      for (let k = 0; k < 4; k++) this.parking.push({ x: x0 + 2.2 + k * 3.2, z: z0 + L - 8.5, yaw: Math.PI });
    } else {
      this.trees.push({ x: b.cx, z: b.cz, type: 'round', s: r.range(0.9, 1.2), r: r.next() * 6 });
    }
    this._sidewalkPlanters(b, 0.35);
  }

  _awning(bl, side) {
    const r = this.rng;
    const c = r.pick([0xb83b3b, 0x2f6d6b, 0xd9a441, 0x34495e, 0x8a3c6e, 0xe8e2d0]);
    const len = Math.min(side === 'n' || side === 's' ? bl.w : bl.d, 10) * 0.8;
    const y = 3.1;
    if (side === 's') this.props.awnings.push({ x: bl.x, y, z: bl.z + bl.d / 2 + 0.9, yaw: 0, w: len, c });
    else if (side === 'n') this.props.awnings.push({ x: bl.x, y, z: bl.z - bl.d / 2 - 0.9, yaw: Math.PI, w: len, c });
    else if (side === 'e') this.props.awnings.push({ x: bl.x + bl.w / 2 + 0.9, y, z: bl.z, yaw: Math.PI / 2, w: len, c });
    else this.props.awnings.push({ x: bl.x - bl.w / 2 - 0.9, y, z: bl.z, yaw: -Math.PI / 2, w: len, c });
  }

  _genPlaya(b, I) {
    const r = this.rng;
    b.ground = 0;
    const W = I.x1 - I.x0;
    if (r.chance(0.5)) {
      const w = r.range(38, 46), d = r.range(24, 32), h = r.range(20, 52);
      const bl = this._addBld(b.cx - (W - w) / 2 + 2, b.cz - 6, w, d, h, 'pastel', r.pick(PAL.pastel), { crown: r.chance(0.5) ? 1 : 0 });
      this._facadeSign(bl, 's', r.pick(['HOTEL', 'HOTEL CORAL', 'MAR AZUL', 'SUITES', 'HOTEL BRISA', 'RESORT']), r.pick([0x33e1ff, 0xff4fa3, 0xffb547]), Math.min(h - 3, 12), 1.4);
      this.pools.push({ x: b.cx + 6, z: b.cz + 18, w: 18, d: 8 });
      for (let k = 0; k < 4; k++) this.trees.push({ x: b.cx - 18 + k * 12, z: b.cz + 24, type: 'palm', s: r.range(0.85, 1.15), r: r.next() * 6 });
    } else {
      for (const k of [-1, 1]) {
        const w = r.range(36, 44), d = r.range(18, 22), h = r.range(14, 40);
        const bl = this._addBld(b.cx, b.cz + k * 14, w, d, h, 'pastel', r.pick(PAL.pastel));
        if (r.chance(0.6)) this._facadeSign(bl, k > 0 ? 's' : 'n', r.pick(['HOTEL', 'APART', 'SUITES', 'HOSTEL']), r.pick(NEON_COLORS), Math.min(h - 3, 9), 1.1);
      }
    }
    this._sidewalkPalms(b, 0.6);
  }

  _genResidencial(b, I) {
    const r = this.rng;
    b.ground = 1;
    if (r.chance(0.15)) {
      const s = r.chance(0.5) ? 'office' : 'pastel';
      this._addBld(b.cx, b.cz, r.range(36, 44), r.range(22, 28), r.range(14, 28), s, r.pick(PAL[s]));
      for (let k = 0; k < 3; k++) this.trees.push({ x: b.cx - 16 + k * 16, z: b.cz + 20, type: 'round', s: r.range(0.8, 1.2), r: r.next() * 6 });
      return;
    }
    const L = (I.x1 - I.x0) / 3;
    for (let a = 0; a < 3; a++)
      for (let c = 0; c < 3; c++) {
        const ox = I.x0 + (a + 0.5) * L, oz = I.z0 + (c + 0.5) * L;
        if (a === 1 && c === 1) {
          if (r.chance(0.5)) this.pools.push({ x: ox, z: oz, w: 9, d: 5 });
          this.trees.push({ x: ox + 5, z: oz - 4, type: 'round', s: r.range(0.9, 1.3), r: r.next() * 6 });
          continue;
        }
        const w = r.range(9, 12.5), d = r.range(9, 12), h = r.chance(0.55) ? r.range(6, 7.4) : r.range(3.6, 4.4);
        this._addBld(ox + r.range(-1.5, 1.5), oz + r.range(-1.5, 1.5), w, d, h, 'house', r.pick(PAL.house), {
          roof: 1, roofColor: r.pick(PAL.roofs), noRoofProps: true,
        });
        if (r.chance(0.55)) this.trees.push({ x: ox + r.sign() * 6.5, z: oz + r.sign() * 6.5, type: r.chance(0.2) ? 'palm' : 'round', s: r.range(0.7, 1.1), r: r.next() * 6 });
        if (r.chance(0.3)) this.props.hedges.push({ x: ox, z: oz + (c === 0 ? -L / 2 + 1 : L / 2 - 1), w: L - 3, d: 1, h: 1.1 });
      }
    this._sidewalkTrees(b, 0.5);
  }

  _genIndustrial(b, I) {
    const r = this.rng;
    b.ground = 3;
    const W = I.x1 - I.x0;
    const w1 = r.range(42, 50), d1 = r.range(22, 27);
    this._addBld(b.cx, I.z0 + d1 / 2 + 1, w1, d1, r.range(8, 13), 'warehouse', r.pick(PAL.warehouse), { noRoofProps: false });
    const kind = r.pick(['tanks', 'containers', 'shed', 'chimney']);
    const zb = I.z0 + d1 + 4, zl = I.z1 - zb;
    if (kind === 'tanks') {
      for (let k = 0; k < 3; k++) {
        const rr = r.range(4, 6);
        const x = I.x0 + 9 + k * 18, z = zb + zl / 2;
        this.props.tanks.push({ x, z, r: rr, h: r.range(8, 13) });
        this.colliders.push({ kind: 'cyl', x, z, r: rr, minY: -1, maxY: 13, type: 'prop' });
      }
    } else if (kind === 'containers') {
      this._containerYard(I.x0 + 4, zb + 2, W - 8, zl - 4, r);
    } else if (kind === 'shed') {
      this._addBld(b.cx, zb + zl / 2, r.range(26, 34), zl - 4, r.range(6, 9), 'warehouse', r.pick(PAL.warehouse));
    } else {
      const x = I.x0 + 10, z = zb + zl / 2;
      this.props.chimneys.push({ x, z, r: 1.6, h: r.range(26, 38) });
      this.colliders.push({ kind: 'cyl', x, z, r: 1.8, minY: -1, maxY: 40, type: 'prop' });
      this._addBld(b.cx + 10, z, 30, zl - 6, 7, 'warehouse', r.pick(PAL.warehouse));
    }
  }

  _genPuerto(b, I) {
    const r = this.rng;
    b.ground = 3;
    const W = I.x1 - I.x0;
    if (r.chance(0.55)) {
      this._addBld(b.cx, b.cz - 8, W - 4, r.range(26, 32), r.range(9, 13), 'warehouse', r.pick(PAL.warehouse));
      this._containerYard(I.x0 + 2, I.z1 - 14, W - 4, 12, r);
    } else {
      this._containerYard(I.x0 + 2, I.z0 + 2, W - 4, W - 4, r);
    }
  }

  _containerYard(x0, z0, w, d, r) {
    const rows = Math.max(1, Math.floor(d / 6.5));
    const cols = Math.max(1, Math.floor(w / 13.5));
    for (let a = 0; a < cols; a++)
      for (let c = 0; c < rows; c++) {
        if (r.chance(0.18)) continue;
        const stack = r.int(1, 3);
        const x = x0 + 6.6 + a * 13.5, z = z0 + 3.2 + c * 6.5;
        for (let s = 0; s < stack; s++) {
          this.props.containers.push({ x, y: s * 2.6, z, yaw: 0, len: 12.2, c: r.pick(PAL.container) });
        }
        this.colliders.push({ kind: 'box', minX: x - 6.1, maxX: x + 6.1, minZ: z - 1.25, maxZ: z + 1.25, minY: -1, maxY: stack * 2.6, type: 'prop' });
      }
  }

  _genPark(b) {
    const r = this.rng;
    const I = this._inner(b);
    // fuente central
    this.props.fountains.push({ x: b.cx, z: b.cz, r: 6 });
    this.colliders.push({ kind: 'cyl', x: b.cx, z: b.cz, r: 6.3, minY: -1, maxY: 0.9, type: 'prop' });
    for (let k = 0; k < 26; k++) {
      const x = r.range(I.x0 + 2, I.x1 - 2), z = r.range(I.z0 + 2, I.z1 - 2);
      if (Math.hypot(x - b.cx, z - b.cz) < 11) continue;
      if (Math.abs(x - b.cx) < 2.5 || Math.abs(z - b.cz) < 2.5) continue; // senderos en cruz
      this.trees.push({ x, z, type: r.chance(0.25) ? 'palm' : 'round', s: r.range(0.8, 1.35), r: r.next() * 6 });
    }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      this.props.benches.push({ x: b.cx + Math.cos(a) * 9.5, z: b.cz + Math.sin(a) * 9.5, yaw: -a + Math.PI / 2 });
    }
    for (const s of [-1, 1]) {
      this.props.bins.push({ x: b.cx + s * 3.5, z: b.cz + 14 });
      this.props.benches.push({ x: b.cx + s * 3.6, z: b.cz - 18, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
    }
    this.pedZones.push({ kind: 'area', minX: I.x0 + 2, maxX: I.x1 - 2, minZ: I.z0 + 2, maxZ: I.z1 - 2, block: b.id });
  }

  _genPlaza(b) {
    const r = this.rng;
    this.props.fountains.push({ x: b.cx, z: b.cz + 6, r: 8 });
    this.colliders.push({ kind: 'cyl', x: b.cx, z: b.cz + 6, r: 8.3, minY: -1, maxY: 1, type: 'prop' });
    // Pantalla LED gigante
    this.props.screens.push({ x: b.cx, y: 0, z: b.cz - 18, yaw: 0, w: 16, h: 9 });
    this.colliders.push({ kind: 'box', minX: b.cx - 8.5, maxX: b.cx + 8.5, minZ: b.cz - 18.8, maxZ: b.cz - 17.2, minY: -1, maxY: 14, type: 'prop' });
    for (let k = 0; k < 8; k++) {
      const x = b.cx - 21 + (k % 4) * 14, z = k < 4 ? b.cz - 6 : b.cz + 22;
      this.trees.push({ x, z, type: 'palm', s: r.range(0.95, 1.2), r: r.next() * 6 });
    }
    for (let k = 0; k < 6; k++) this.props.benches.push({ x: b.cx - 15 + k * 6, z: b.cz + 18, yaw: 0 });
    this.props.kiosks.push({ x: b.cx + 20, z: b.cz + 10, yaw: -Math.PI / 2 });
    this.colliders.push({ kind: 'box', minX: b.cx + 18.2, maxX: b.cx + 21.8, minZ: b.cz + 8.2, maxZ: b.cz + 11.8, minY: -1, maxY: 3, type: 'prop' });
    const I = this._inner(b);
    this.pedZones.push({ kind: 'area', minX: I.x0 + 2, maxX: I.x1 - 2, minZ: I.z0 + 2, maxZ: I.z1 - 2, block: b.id });
  }

  _genIsla(b, I) {
    const r = this.rng;
    if (b.type === 'mansion') {
      const m = this._addBld(b.cx, b.cz - 4, 30, 22, 10.5, 'house', 0xfbfaf6, { roof: 2, name: 'Mansión Esmeralda', noRoofProps: true });
      this.helipads.push({ x: m.x, y: m.h, z: m.z, mansion: true });
      this.pools.push({ x: b.cx, z: b.cz + 16, w: 20, d: 7 });
      for (let k = 0; k < 6; k++) this.trees.push({ x: b.cx - 24 + k * 9.6, z: b.cz + 24, type: 'palm', s: r.range(1, 1.25), r: r.next() * 6 });
      this.props.hedges.push({ x: b.cx, z: I.z1 - 0.5, w: 54, d: 1.2, h: 1.6 });
      return;
    }
    for (const k of [-1, 1]) {
      const w = r.range(16, 21), d = r.range(14, 17), h = r.range(6.5, 9.5);
      const x = b.cx + k * 13, z = b.cz + r.range(-6, 2);
      this._addBld(x, z, w, d, h, 'house', r.pick(PAL.villa), { noRoofProps: true });
      this.pools.push({ x, z: z + d / 2 + 6, w: w * 0.6, d: 4.5 });
      this.trees.push({ x: x + r.sign() * (w / 2 + 3), z: z + 10, type: 'palm', s: r.range(0.9, 1.2), r: r.next() * 6 });
    }
    this._sidewalkPalms(b, 0.5);
  }

  _genPoiBlock(b, poi) {
    const r = this.rng;
    const I = this._inner(b);
    b.ground = poi.kind === 'concesionaria' || poi.kind === 'policia' ? 4 : 0;
    const dims = {
      safehouse: [30, 20, 30, 'office', 0xcfc6b6],
      taller: [34, 22, 9, 'warehouse', 0x5d6b78],
      armeria: [22, 16, 8, 'shop', 0x6a6f63],
      ropa: [32, 20, 12, 'shop', 0xe8e3dc],
      hospital: [46, 26, 24, 'office', 0xf2f2ee],
      policia: [42, 24, 16, 'office', 0x9fb0c0],
      banco: [38, 30, 112, 'glass', 0x9a8a62],
      club: [32, 24, 12, 'shop', 0x2a2833],
      lavadero: [24, 14, 6.5, 'warehouse', 0x7fb7c9],
      bar: [22, 14, 8, 'pastel', 0xffc796],
      concesionaria: [36, 18, 9, 'glass', 0xa9c3d1],
    }[poi.kind];
    let [w, d, h, style, color] = dims;
    const setback = 3;
    let bx = b.cx, bz = b.cz, ex = b.cx, ez = b.cz, faceYaw = 0;
    // El edificio se apoya del lado de la entrada; (ex,ez) = punto sobre la vereda
    if (poi.side === 's') {
      bz = I.z1 - setback - d / 2; ez = b.maxZ - 2; faceYaw = 0;
    } else if (poi.side === 'n') {
      bz = I.z0 + setback + d / 2; ez = b.minZ + 2; faceYaw = Math.PI;
    } else if (poi.side === 'e') {
      [w, d] = [d, w];
      bx = I.x1 - setback - w / 2; ex = b.maxX - 2; faceYaw = Math.PI / 2;
    } else {
      [w, d] = [d, w];
      bx = I.x0 + setback + w / 2; ex = b.minX + 2; faceYaw = -Math.PI / 2;
    }
    const opts = { name: poi.name };
    if (poi.kind === 'policia' || poi.kind === 'hospital') opts.roof = 2;
    if (poi.kind === 'banco') opts.crown = 1;
    const bl = this._addBld(bx, bz, w, d, h, style, color, opts);
    if (opts.roof === 2) this.helipads.push({ x: bl.x, y: bl.h, z: bl.z, poi: poi.id });
    if (poi.kind === 'banco') {
      this._addBld(bx, bz, w + 10, d + 6, 9, 'office', 0xe7e1d3, { noRoofProps: true });
      this.props.edgeLights.push({ b: bl, color: 0xffd27a });
    }
    if (poi.sign) this._facadeSign(bl, poi.side, poi.sign, poi.signColor, Math.min(h - 2, poi.kind === 'banco' ? 13 : h > 12 ? 9 : h - 1.6), poi.kind === 'banco' ? 1.6 : 1.15);
    // Punto de interacción. Para el taller el auto entra al frente del portón.
    const p = {
      ...poi, x: ex, z: ez, yaw: faceYaw, building: bl, blockId: b.id,
      door: { x: bx + Math.sin(faceYaw) * ((poi.side === 'e' || poi.side === 'w' ? w : d) / 2), z: bz + Math.cos(faceYaw) * ((poi.side === 'e' || poi.side === 'w' ? w : d) / 2) },
    };
    if (poi.kind === 'taller' || poi.kind === 'safehouse' || poi.kind === 'lavadero') {
      // zona de ingreso vehicular sobre la calle adyacente
      p.drive = { x: ex + Math.sin(faceYaw) * 7, z: ez + Math.cos(faceYaw) * 7 };
    }
    if (poi.kind === 'safehouse') {
      // Cochera lateral: el auto personal queda junto al edificio con la trompa hacia la calle.
      // A 24,5 m del centro de la cuadra cae entre el farol de los 20 m y la esquina.
      const fx = Math.sin(faceYaw), fz = Math.cos(faceYaw);
      const sx = Math.cos(faceYaw), sz = -Math.sin(faceYaw);
      const inset = SIDEWALK - 2 + 2.7;
      p.garage = { x: ex + sx * 24.5 - fx * inset, z: ez + sz * 24.5 - fz * inset, yaw: faceYaw };
      this.driveways.push({ x: p.garage.x, z: p.garage.z, fx, fz });
    }
    this.pois.push(p);
    // Relleno del resto de la manzana
    const back = { ...I };
    if (poi.side === 's') back.z1 = bz - d / 2 - 4;
    else if (poi.side === 'n') back.z0 = bz + d / 2 + 4;
    else if (poi.side === 'e') back.x1 = bx - w / 2 - 4;
    else back.x0 = bx + w / 2 + 4;
    const bw = back.x1 - back.x0, bd = back.z1 - back.z0;
    if (poi.kind === 'concesionaria' || poi.kind === 'policia') {
      // estacionamiento al fondo/frente
      const n = Math.floor((bw - 4) / 3.4);
      for (let k = 0; k < n; k++) this.parking.push({ x: back.x0 + 3 + k * 3.4, z: back.z0 + bd / 2, yaw: poi.side === 's' ? 0 : Math.PI, poi: poi.id });
    } else if (bw > 12 && bd > 10) {
      const dist = b.district;
      const s = dist === 'centro' ? 'office' : dist === 'residencial' ? 'house' : dist === 'playa' ? 'pastel' : 'brick';
      const hh = dist === 'centro' ? r.range(30, 70) : dist === 'residencial' ? r.range(5, 7) : r.range(9, 20);
      this._addBld((back.x0 + back.x1) / 2, (back.z0 + back.z1) / 2, bw - 2, bd - 2, hh, s, r.pick(PAL[s === 'house' ? 'house' : s]), s === 'house' ? { roof: 1, roofColor: r.pick(PAL.roofs), noRoofProps: true } : {});
    }
    if (b.district === 'playa') this._sidewalkPalms(b, 0.5);
    else if (b.district === 'residencial') this._sidewalkTrees(b, 0.4);
  }

  _sidewalkPlanters(b, p = 0.5) {
    const r = this.rng;
    for (const [x, z] of [[b.minX + 2, b.cz - 14], [b.maxX - 2, b.cz + 14], [b.cx - 14, b.minZ + 2], [b.cx + 14, b.maxZ - 2]]) {
      if (r.chance(p)) {
        this.props.planters.push({ x, z });
        this.trees.push({ x, z, type: r.chance(0.5) ? 'palm' : 'round', s: r.range(0.55, 0.75), r: r.next() * 6, planter: true });
      }
    }
  }
  _sidewalkPalms(b, p) {
    const r = this.rng;
    for (let k = -2; k <= 2; k++) {
      if (r.chance(p)) this.trees.push({ x: b.minX + 1.4, z: b.cz + k * 12 + 6, type: 'palm', s: r.range(0.85, 1.15), r: r.next() * 6 });
      if (r.chance(p)) this.trees.push({ x: b.maxX - 1.4, z: b.cz + k * 12 - 6, type: 'palm', s: r.range(0.85, 1.15), r: r.next() * 6 });
    }
  }
  _sidewalkTrees(b, p) {
    const r = this.rng;
    for (let k = -2; k <= 2; k++) {
      if (r.chance(p)) this.trees.push({ x: b.cx + k * 12 + 6, z: b.minZ + 1.4, type: 'round', s: r.range(0.65, 0.9), r: r.next() * 6 });
      if (r.chance(p)) this.trees.push({ x: b.cx + k * 12 - 6, z: b.maxZ - 1.4, type: 'round', s: r.range(0.65, 0.9), r: r.next() * 6 });
    }
  }

  // ------------------------------------------------------------- mobiliario
  _roadExists(axis, line, along) {
    // axis 'v' => calle N-S en x=line; 'h' => calle E-O en z=line
    if (axis === 'v') {
      if (line >= -480 && line <= 480 && along >= -480 && along <= 480) return true;
      if (ISLAND.xs.includes(line) && along >= -320 && along <= -80) return true;
      return false;
    }
    if (line >= -480 && line <= 480 && along >= -480 && along <= 480) return true;
    if (ISLAND.zs.includes(line) && along >= 800 && along <= 1040) return true;
    if (line === BRIDGE.z && along >= 480 && along <= 800) return true;
    return false;
  }

  _genStreetFurniture() {
    const r = new RNG(this.seed + 4242);
    // Faroles sobre cada tramo de calle, a ambos lados, cada 20 m
    const segs = [];
    for (const a of this.nodes)
      for (const e of a.nb) {
        if (e.node < a.id) continue;
        segs.push([a, this.nodes[e.node], e.name]);
      }
    const boulevards = new Set(['Av. Central', 'Calle Mayor', 'Av. Costanera', 'Vía Esmeralda']);
    for (const [a, b, name] of segs) {
      const vertical = a.x === b.x;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const isBridge = name === 'Puente Esmeralda';
      for (let s = 20; s < len - 10; s += 20) {
        const px = a.x + dx * s, pz = a.z + dz * s;
        if (s % 80 === 0) continue; // coincide con el patrón analítico del shader (sin faroles en múltiplos de 80)
        for (const side of [-1, 1]) {
          const ox = vertical ? side * LAMP_OFF : 0, oz = vertical ? 0 : side * LAMP_OFF;
          const lx = px + ox, lz = pz + oz;
          if (!isBridge && !isRoad(px, pz)) continue;
          if (lx > 488 && lx < 560 && !isBridge && !(vertical)) {
            /* tramo del acceso al puente por la playa: ok */
          }
          if (this.inDriveway(lx, lz)) continue;
          // Costanera: del lado este sólo hay paseo
          this.lamps.push({ x: lx, z: lz, yaw: vertical ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0, bridge: isBridge, id: this.lamps.length });
          // hidrantes y cestos ocasionales
          if (!isBridge && r.chance(0.08)) this.props.hydrants.push({ x: lx + (vertical ? side * 0.9 : 3), z: lz + (vertical ? 3 : side * 0.9) });
          if (!isBridge && r.chance(0.06)) this.props.bins.push({ x: lx + (vertical ? side * 0.6 : -2.5), z: lz + (vertical ? -2.5 : side * 0.6) });
        }
        // Palmeras de bulevar entre faroles
        if (boulevards.has(name) && s + 10 < len - 12) {
          const tx = a.x + dx * (s + 10), tz = a.z + dz * (s + 10);
          for (const side of [-1, 1]) {
            if (name === 'Av. Costanera' && side < 0) continue;
            const ox = vertical ? side * 10.6 : 0, oz = vertical ? 0 : side * 10.6;
            if (name === 'Av. Costanera') {
              this.trees.push({ x: tx + 11.2, z: tz, type: 'palm', s: r.range(1.0, 1.25), r: r.next() * 6 });
            } else if (isRoad(tx, tz)) this.trees.push({ x: tx + ox, z: tz + oz, type: 'palm', s: r.range(0.95, 1.2), r: r.next() * 6 });
          }
        }
        // Refugios de colectivo a mitad de cuadra en bulevares
        if (boulevards.has(name) && Math.abs(s - 40) < 1 && !isBridge && r.chance(0.5)) {
          const side = r.sign();
          const ox = vertical ? side * 10.8 : 0, oz = vertical ? 0 : side * 10.8;
          this.props.shelters.push({ x: px + ox, z: pz + oz, yaw: vertical ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0 });
        }
      }
    }
    // Semáforos: postes con brazo en esquinas opuestas
    for (const n of this.nodes) {
      if (!n.light) continue;
      const hasN = n.nb.some((e) => this.nodes[e.node].z < n.z);
      const hasS = n.nb.some((e) => this.nodes[e.node].z > n.z);
      const hasE = n.nb.some((e) => this.nodes[e.node].x > n.x);
      const hasW = n.nb.some((e) => this.nodes[e.node].x < n.x);
      // Cada poste controla el tráfico que llega desde una dirección (lado derecho del conductor)
      // Llega desde el norte (va al sur, +Z): su derecha es -X → poste en esquina (-X, -Z)
      if (hasN) this.tlights.push({ x: n.x - 9.6, z: n.z - 9.6, node: n.id, axis: 'ns', yaw: Math.PI, armDir: 'x+' });
      if (hasS) this.tlights.push({ x: n.x + 9.6, z: n.z + 9.6, node: n.id, axis: 'ns', yaw: 0, armDir: 'x-' });
      if (hasE) this.tlights.push({ x: n.x + 9.6, z: n.z - 9.6, node: n.id, axis: 'ew', yaw: Math.PI / 2, armDir: 'z+' });
      if (hasW) this.tlights.push({ x: n.x - 9.6, z: n.z + 9.6, node: n.id, axis: 'ew', yaw: -Math.PI / 2, armDir: 'z-' });
    }
    for (const t of this.tlights) this.colliders.push({ kind: 'cyl', x: t.x, z: t.z, r: 0.22, minY: -1, maxY: 7, type: 'pole' });
    // La salida de las cocheras queda libre (árboles, cestos, hidrantes, bancos)
    const clear = (o) => !this.inDriveway(o.x, o.z);
    this.trees = this.trees.filter(clear);
    for (const k of ['hydrants', 'bins', 'benches', 'planters', 'bollards']) this.props[k] = this.props[k].filter(clear);
    for (const p of this.props.shelters) {
      const along = Math.abs(Math.sin(p.yaw)) > 0.5; // refugio alineado a calle N-S
      const hw = along ? 0.8 : 2.2, hd = along ? 2.2 : 0.8;
      this.colliders.push({ kind: 'box', minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd, minY: -1, maxY: 2.6, type: 'prop' });
    }
  }

  // ------------------------------------------------------------- bordes
  _genBorders() {
    const r = new RNG(this.seed + 777);
    // Malecón Norte: z ∈ [-560,-488]
    for (let x = -548; x <= 480; x += 14) {
      this.trees.push({ x: x + r.range(-1, 1), z: -526 + r.range(-2, 2), type: 'palm', s: r.range(0.95, 1.25), r: r.next() * 6 });
      if (r.chance(0.5)) this.props.benches.push({ x: x + 7, z: -540, yaw: Math.PI });
      this.props.bollards.push({ x: x + 3, z: -553 });
    }
    for (let x = -550; x <= 480; x += 20) this.lamps.push({ x, z: -549, yaw: 0, promenade: true, id: this.lamps.length });
    this.props.fences.push({ x0: -560, z0: -558.6, x1: 488, z1: -558.6, h: 1.05, kind: 'rail' });
    this.pedZones.push({ kind: 'area', minX: -550, maxX: 480, minZ: -550, maxZ: -500, name: 'Malecón Norte' });
    // Paseo costero este y playa
    for (let z = -548; z <= 548; z += 20) {
      if (Math.abs(z - BRIDGE.z) < 14) continue;
      this.lamps.push({ x: 494.5, z, yaw: Math.PI / 2, promenade: true, id: this.lamps.length });
    }
    this.props.fences.push({ x0: 496, z0: -560, x1: 496, z1: BRIDGE.z - RH - 1, h: 0.9, kind: 'rail' });
    this.props.fences.push({ x0: 496, z0: BRIDGE.z + RH + 1, x1: 496, z1: 560, h: 0.9, kind: 'rail' });
    for (let z = -540; z <= 540; z += r.range(9, 16)) {
      if (Math.abs(z - BRIDGE.z) < 16) continue;
      this.trees.push({ x: r.range(500, 512), z, type: 'palm', s: r.range(0.9, 1.35), r: r.next() * 6 });
      if (r.chance(0.55)) {
        const ux = r.range(522, 556), uz = z + r.range(-4, 4);
        this.props.umbrellas.push({ x: ux, z: uz, c: r.pick([0xff5a5f, 0x33a1ff, 0xffd166, 0xffffff, 0x4dd9a6, 0xff8c42]) });
        if (r.chance(0.8)) this.props.loungers.push({ x: ux + 1.6, z: uz + 0.6, yaw: Math.PI / 2 });
        if (r.chance(0.5)) this.props.loungers.push({ x: ux + 1.6, z: uz - 0.9, yaw: Math.PI / 2 });
      }
    }
    for (const z of [-430, -250, -40, 160, 360]) {
      this.props.lifeguards.push({ x: 552, z, yaw: Math.PI / 2 });
      this.colliders.push({ kind: 'box', minX: 550.8, maxX: 553.2, minZ: z - 1.2, maxZ: z + 1.2, minY: -1, maxY: 4, type: 'prop' });
    }
    for (let k = 0; k < 14; k++) {
      const z = k < 7 ? r.range(-575, -540) : r.range(540, 575);
      this.props.rocks.push({ x: r.range(540, 590), z, s: r.range(1.2, 3.4), r: r.next() * 6, y: -0.6 });
    }
    this.pedZones.push({ kind: 'area', minX: 500, maxX: 556, minZ: -540, maxZ: BRIDGE.z - 14, name: 'Playa Coral' });
    this.pedZones.push({ kind: 'area', minX: 500, maxX: 556, minZ: BRIDGE.z + 14, maxZ: 540, name: 'Playa Coral' });
    // Zona industrial oeste: x ∈ [-560,-488]
    this._containerYard(-556, -470, 60, 140, r);
    this._containerYard(-556, 120, 60, 200, r);
    for (let k = 0; k < 4; k++) {
      const x = -530, z = -200 + k * 34;
      this.props.tanks.push({ x, z, r: 9, h: 12 });
      this.colliders.push({ kind: 'cyl', x, z, r: 9.2, minY: -1, maxY: 12, type: 'prop' });
    }
    this.props.fences.push({ x0: -558.6, z0: -488, x1: -558.6, z1: 488, h: 2.2, kind: 'mesh' });
    // Muelles sur: z ∈ [488,560]
    this._containerYard(-470, 494, 240, 40, r);
    this._containerYard(-140, 494, 120, 24, r);
    for (const x of [-430, -380, -330]) {
      this.props.cranes.push({ x, z: 546, yaw: 0 });
      for (const [ox, oz] of [[-7, -5], [7, -5], [-7, 5], [7, 5]])
        this.colliders.push({ kind: 'cyl', x: x + ox, z: 546 + oz, r: 0.7, minY: -1, maxY: 60, type: 'prop' });
    }
    for (let x = -540; x <= 480; x += 9) this.props.bollards.push({ x, z: 557.6, dock: true });
    // Barco de carga amarrado
    this.ship = { x: -400, z: 584, len: 150, wid: 24, yaw: 0 };
    this.colliders.push({ kind: 'box', minX: -475, maxX: -325, minZ: 572, maxZ: 596, minY: -8, maxY: 14, type: 'ship' });
    // Muelles (piers)
    for (const px of PIERS_X) {
      this.colliders.push({ kind: 'box', minX: px - PIER.halfW, maxX: px + PIER.halfW, minZ: PIER.z0, maxZ: PIER.z1, minY: -6, maxY: PIER.y - 0.05, type: 'pier', boatOnly: true });
      for (let z = PIER.z0 + 12; z < PIER.z1; z += 18) {
        this.lamps.push({ x: px + PIER.halfW - 0.6, z, yaw: Math.PI / 2, pier: true, id: this.lamps.length, y: PIER.y });
      }
    }
    this.marina = { x: 420, z: 600, name: 'Marina Índigo' };
    this.pedZones.push({ kind: 'area', minX: -100, maxX: 480, minZ: 500, maxZ: 552, name: 'Los Muelles' });
  }

  _genIslandAndCayo() {
    const r = new RNG(this.seed + 5150);
    // Playa alrededor de la isla
    const ring = [];
    for (let x = 768; x <= 1072; x += r.range(10, 16)) {
      ring.push([x, r.range(-356, -336)]);
      ring.push([x, r.range(-64, -44)]);
    }
    for (let z = -330; z <= -70; z += r.range(10, 16)) {
      if (Math.abs(z - BRIDGE.z) > 14) ring.push([r.range(764, 784), z]);
      ring.push([r.range(1056, 1076), z]);
    }
    for (const [x, z] of ring) {
      if (r.chance(0.6)) this.trees.push({ x, z, type: 'palm', s: r.range(0.9, 1.3), r: r.next() * 6 });
      else if (r.chance(0.4)) this.props.umbrellas.push({ x, z, c: r.pick([0xff5a5f, 0xffffff, 0x33a1ff, 0xffd166]) });
    }
    this.pedZones.push({ kind: 'area', minX: 1052, maxX: 1076, minZ: -330, maxZ: -70, name: 'Isla Esmeralda' });
    // Cayo Faro
    this.lighthouse = { x: CAYO.x, z: CAYO.z, h: 30 };
    this.colliders.push({ kind: 'cyl', x: CAYO.x, z: CAYO.z, r: 3.6, minY: -2, maxY: 34, type: 'building' });
    this._addBld(CAYO.x + 9, CAYO.z + 2, 7, 6, 3.6, 'house', 0xf4f1ea, { roof: 1, roofColor: 0xa13d2d, noRoofProps: true });
    for (let k = 0; k < 18; k++) {
      const a = r.next() * Math.PI * 2, d = CAYO.r + r.range(-4, 10);
      this.props.rocks.push({ x: CAYO.x + Math.cos(a) * d, z: CAYO.z + Math.sin(a) * d, s: r.range(1.4, 3.6), r: r.next() * 6, y: -0.4 });
    }
    // Pilonos del puente (colisiones para lanchas y vehículos)
    for (const px of [610, 710]) {
      for (const s of [-1, 1]) this.colliders.push({ kind: 'box', minX: px - 1.6, maxX: px + 1.6, minZ: BRIDGE.z + s * 12.2 - 1.4, maxZ: BRIDGE.z + s * 12.2 + 1.4, minY: -8, maxY: 46, type: 'building' });
    }
    for (let x = 575; x < 760; x += 37) {
      this.colliders.push({ kind: 'box', minX: x - 1.2, maxX: x + 1.2, minZ: BRIDGE.z - 6, maxZ: BRIDGE.z + 6, minY: -8, maxY: bridgeDeckY(x) - 1.2, type: 'pier', boatOnly: true });
    }
  }

  _genRamps() {
    const defs = [
      { x: 528, z: -400, yaw: 0, name: 'Salto de la Playa Norte' },
      { x: 528, z: 400, yaw: Math.PI, name: 'Salto de la Playa Sur' },
      { x: -260, z: -522, yaw: Math.PI / 2, name: 'Salto del Malecón' },
      { x: 60, z: 520, yaw: -Math.PI / 2, name: 'Salto de los Contenedores' },
      { x: -524, z: 20, yaw: 0, name: 'Salto Industrial' },
      { x: 40, z: 178, yaw: 0, name: 'Salto del Parque Central' },
      { x: 1064, z: -230, yaw: Math.PI, name: 'Salto de la Isla' },
      { x: -150, z: 286, yaw: Math.PI / 2, name: 'Salto de Autos Sol' },
    ];
    for (const d of defs) this.ramps.push({ ...d, len: 11, wid: 6, h: 2.7, id: this.ramps.length });
  }

  rampHeightAt(x, z) {
    let best = -Infinity;
    for (const rp of this.ramps) {
      const fx = Math.sin(rp.yaw), fz = Math.cos(rp.yaw);
      const dx = x - rp.x, dz = z - rp.z;
      const along = dx * fx + dz * fz;
      const lat = dx * fz - dz * fx;
      if (along >= 0 && along <= rp.len && Math.abs(lat) <= rp.wid / 2) {
        best = Math.max(best, (along / rp.len) * rp.h);
      }
    }
    return best;
  }

  _genCassettes() {
    const pts = [
      [40, 200], [-200, -470], [400, -520], [553, -10], [540, 520], [420, 636], [-40, 636], [-470, 540],
      [-540, -300], [-520, 400], [760, 545], [1070, -350], [1000, -50], [920, -200], [-300, 90], [200, -300],
      [-120, -120], [120, 360], [300, 120], [-380, -380], [0, -40], [-440, 200], [470, 470], [640, -150], [-250, 300],
    ];
    const r = new RNG(this.seed + 31337);
    for (let k = 0; k < pts.length; k++) {
      let [x, z] = pts[k];
      // Ajustar a una posición accesible (no dentro de un edificio)
      for (let tries = 0; tries < 30 && this._insideCollider(x, z, 1.2); tries++) {
        x += r.range(-8, 8);
        z += r.range(-8, 8);
      }
      const y = k === 23 ? bridgeDeckY(x) + 0.9 : this.groundAt(x, z) + 0.9;
      this.cassettes.push({ id: k, x, y, z });
    }
  }

  _genRaces() {
    const M = (i, j) => this.mainNode[i][j];
    const I = (i, j) => this.islandNode[i][j];
    const toCp = (list) => list.map((n) => ({ x: n.x, z: n.z, node: n.id }));
    this.races = [
      { id: 'costanera', name: 'Circuito Costanera', laps: 2, fee: 500, prize: 4000, cps: toCp([M(12, 10), M(12, 6), M(12, 2), M(9, 2), M(9, 6), M(6, 6), M(6, 10), M(9, 10)]), loop: true },
      { id: 'muelles', name: 'Muelles a Fondo', laps: 1, fee: 300, prize: 2500, cps: toCp([M(1, 12), M(1, 7), M(3, 7), M(3, 11), M(7, 11), M(7, 12), M(1, 12)]), loop: false },
      { id: 'isla', name: 'Vuelta a la Isla', laps: 1, fee: 800, prize: 6000, cps: toCp([M(9, 4), M(12, 4), I(0, 2), I(0, 0), I(3, 0), I(3, 3), I(0, 3), I(0, 2), M(12, 4), M(9, 4)]), loop: false },
    ];
  }

  _insideCollider(x, z, pad = 0) {
    for (const c of this.colliders) {
      if (c.boatOnly) continue;
      if (c.kind === 'box') {
        if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- consultas
  /** Altura de la superficie transitable (sin edificios). */
  groundAt(x, z) {
    if (onBridge(x, z)) return bridgeDeckY(x);
    if (onPier(x, z)) return PIER.y;
    const t = terrainHeight(x, z);
    let h = t < 0 ? t : slabHeight(x, z) + (t > 0 ? t : 0);
    if (this.ramps.length && (x > 500 || x < -480 || z < -480 || z > 480 || Math.abs(x) < 520)) {
      const rh = this.rampHeightAt(x, z);
      if (rh > h) h = rh;
    }
    return h;
  }

  /** ¿Hay agua navegable en (x,z)? */
  isWater(x, z) {
    if (onBridge(x, z) || onPier(x, z)) return false;
    return terrainHeight(x, z) < WATER_LEVEL - 0.25;
  }

  waterDepth(x, z) {
    return Math.max(0, WATER_LEVEL - terrainHeight(x, z));
  }

  blockAt(x, z) {
    if (x >= -472 && x <= 472 && z >= -472 && z <= 472) {
      const i = Math.floor((x - ORIGIN) / CELL), j = Math.floor((z - ORIGIN) / CELL);
      const b = this.blocks[i * GRID_N + j];
      if (b && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b;
      return null;
    }
    for (let k = GRID_N * GRID_N; k < this.blocks.length; k++) {
      const b = this.blocks[k];
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return b;
    }
    return null;
  }

  zoneName(x, z) {
    if (onBridge(x, z)) return 'Puente Esmeralda';
    if (Math.hypot(x - CAYO.x, z - CAYO.z) < CAYO.r + 30) return 'Cayo Faro';
    if (x >= ISLAND.minX - 40 && x <= ISLAND.maxX + 40 && z >= ISLAND.minZ - 40 && z <= ISLAND.maxZ + 40) return 'Isla Esmeralda';
    if (x > 488 && x < 600 && z > -600 && z < 600) return 'Playa Coral';
    if (z < -488 && z > -600 && x > -600 && x < 600) return 'Malecón Norte';
    if (z > 488 && z < 660 && x > -600 && x < 600) return 'Los Muelles';
    if (x < -488 && x > -600) return 'Zona Industrial';
    if (Math.abs(x) <= 488 && Math.abs(z) <= 488) {
      const i = clamp(Math.floor((x - ORIGIN) / CELL), 0, GRID_N - 1);
      const j = clamp(Math.floor((z - ORIGIN) / CELL), 0, GRID_N - 1);
      const b = this.blocks[i * GRID_N + j];
      if (b.name && b.type !== 'landmark' && b.type !== 'round') return b.name;
      return DISTRICTS[b.district].name;
    }
    return 'Bahía Índigo';
  }

  streetName(x, z) {
    if (onBridge(x, z)) return 'Puente Esmeralda';
    const rp = this.nearestRoadPoint(x, z);
    if (!rp || rp.dist > 26) return '';
    const e = rp.a.nb.find((n) => n.node === rp.b.id);
    return e ? e.name : '';
  }

  /** ¿(x,z) obstruye la salida de una cochera (desde el auto hasta la calle)? */
  inDriveway(x, z) {
    for (const d of this.driveways) {
      const dx = x - d.x, dz = z - d.z;
      const a = dx * d.fx + dz * d.fz;
      const l = Math.abs(dx * d.fz - dz * d.fx);
      if (a > -3 && a < 9 && l < 3.2) return true;
    }
    return false;
  }

  /** ¿Calzada asfaltada en (x,z)? */
  isRoad(x, z) {
    return isRoad(x, z);
  }

  /** Posición de un punto de interés por id. */
  poi(id) {
    return this.pois.find((p) => p.id === id) || null;
  }

  /** Posición segura para aparecer en la vereda más cercana a (x,z). */
  sidewalkSpawn(x, z) {
    const b = this.blockAt(x, z) || this.blocks.reduce((best, bb) => (Math.hypot(bb.cx - x, bb.cz - z) < Math.hypot(best.cx - x, best.cz - z) ? bb : best), this.blocks[0]);
    const px = clamp(x, b.minX + 1.5, b.maxX - 1.5), pz = clamp(z, b.minZ + 1.5, b.maxZ - 1.5);
    // proyectar al anillo de vereda
    const d = [px - b.minX, b.maxX - px, pz - b.minZ, b.maxZ - pz];
    const m = Math.min(...d);
    if (m === d[0]) return { x: b.minX + 2, z: pz };
    if (m === d[1]) return { x: b.maxX - 2, z: pz };
    if (m === d[2]) return { x: px, z: b.minZ + 2 };
    return { x: px, z: b.maxZ - 2 };
  }
}

export function createWorld(seed) {
  return new World(seed);
}

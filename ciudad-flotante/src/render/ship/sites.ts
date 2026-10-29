/**
 * OBRAS EN CURSO: andamios alrededor del módulo en construcción, material acopiado y un
 * "fantasma" translúcido de lo que se está levantando que sube con el progreso de la obra.
 * También el andamiaje de la ampliación del casco (proa) mientras dura.
 */
import * as THREE from 'three';
import { moduleDef } from '../../data/modules';
import { CELL, LEVEL_H, WALL_H } from '../../sim/constants';
import { cellMin, levelY, localToShip, localYaw, type ConstructionSite, type ShipLayout } from '../../sim/ship';
import type { GameState, ModuleInstance } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, shade } from './geo';
import { BOW_LENGTH, DECK_Y, bowStartX, deckHalfWidthAt } from './hull';
import type { ShipMaterials } from './materials';
import { crate } from './props';

export interface SiteEntry {
  moduleId: number;
  level: number;
  group: THREE.Group;
  ghost: THREE.Group;
  /** Caja que abarca la obra (para resaltarla). */
  bounds: THREE.Box3;
  /** Barras de progreso del cartel (escala x = progreso). */
  bars: THREE.Mesh[];
}

const BAR_MAT = new THREE.MeshBasicMaterial({ color: '#5dd67a' });
const BAR_GEO = new THREE.BoxGeometry(1, 0.064, 0.012).translate(0.5, 0, 0);

/** Barra de progreso (se escala en x entre 0 y `len`). */
function progressBar(x: number, y: number, z: number, len: number): THREE.Mesh {
  const m = new THREE.Mesh(BAR_GEO, BAR_MAT);
  m.position.set(x, y, z);
  m.userData.len = len;
  m.scale.x = 0.001;
  m.name = 'progreso-obra';
  return m;
}

/** Ajusta las barras de progreso (0..1). */
export function setProgress(bars: THREE.Mesh[], p: number): void {
  for (const b of bars) b.scale.x = Math.max(0.001, THREE.MathUtils.clamp(p, 0, 1) * (b.userData.len as number));
}

const POLE = '#c0c7cc';
const PLANK = '#d4a373';

/** Andamio rectangular alrededor de [x0,x1]×[z0,z1] desde y0, de altura h. */
export function scaffold(g: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, seed: number, platformSides: ('n' | 's' | 'e' | 'w')[] = ['s']): void {
  const off = 0.3;
  const X0 = x0 - off;
  const X1 = x1 + off;
  const Z0 = z0 - off;
  const Z1 = z1 + off;
  const r = 0.035;
  const posts: [number, number][] = [];
  const along = (a: number, b: number): number[] => {
    const n = Math.max(1, Math.round((b - a) / 2));
    return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  };
  for (const x of along(X0, X1)) posts.push([x, Z0], [x, Z1]);
  for (const z of along(Z0, Z1).slice(1, -1)) posts.push([X0, z], [X1, z]);
  for (const [x, z] of posts) {
    g.cylinder(x, y0, z, r, r, h, 5, POLE);
    g.box(x - 0.09, y0, z - 0.09, x + 0.09, y0 + 0.03, z + 0.09, shade(POLE, 0.7));
  }
  const levels: number[] = [];
  for (let y = 1.0; y < h - 0.1; y += 1.0) levels.push(y);
  levels.push(h - 0.05);
  for (const y of levels) {
    g.cylinderBetween(X0, y0 + y, Z0, X1, y0 + y, Z0, r * 0.9, 4, POLE);
    g.cylinderBetween(X0, y0 + y, Z1, X1, y0 + y, Z1, r * 0.9, 4, POLE);
    g.cylinderBetween(X0, y0 + y, Z0, X0, y0 + y, Z1, r * 0.9, 4, POLE);
    g.cylinderBetween(X1, y0 + y, Z0, X1, y0 + y, Z1, r * 0.9, 4, POLE);
  }
  // diagonales
  const xs = along(X0, X1);
  for (let i = 0; i + 1 < xs.length; i += 2) {
    g.cylinderBetween(xs[i]!, y0 + 0.1, Z0, xs[i + 1]!, y0 + Math.min(h, 2.0), Z0, r * 0.8, 4, POLE);
    g.cylinderBetween(xs[i]!, y0 + 0.1, Z1, xs[i + 1]!, y0 + Math.min(h, 2.0), Z1, r * 0.8, 4, POLE);
  }
  // plataformas de tablones
  const py = y0 + Math.min(2.0, h - 0.2);
  for (const side of platformSides) {
    const n = 3;
    for (let k = 0; k < n; k++) {
      const c = shade(PLANK, 0.9 + hash01(seed, k) * 0.15);
      if (side === 's' || side === 'n') {
        const zc = side === 's' ? Z0 : Z1;
        const zz = zc + (side === 's' ? -0.15 : 0.15) + (k - 1) * 0.12;
        g.box(X0, py, zz - 0.055, X1, py + 0.04, zz + 0.055, c);
      } else {
        const xc = side === 'w' ? X0 : X1;
        const xx = xc + (side === 'w' ? -0.15 : 0.15) + (k - 1) * 0.12;
        g.box(xx - 0.055, py, Z0, xx + 0.055, py + 0.04, Z1, c);
      }
    }
  }
}

/** Material acopiado: tablones, caja y una lona. */
function materialPile(g: GeoBuilder, x: number, y: number, z: number, seed: number): void {
  for (let k = 0; k < 4; k++) {
    const c = shade(PLANK, 0.85 + hash01(seed, k) * 0.2);
    g.box(x - 0.9, y + k * 0.06, z - 0.12 + (k % 2) * 0.05, x + 0.9, y + k * 0.06 + 0.05, z + 0.12 + (k % 2) * 0.05, c);
  }
  crate(g, x + 0.2, y, z + 0.55, 0.5, 0.4, 0.5, PALETTE.deckWood, 0.3);
  g.cylinder(x - 0.6, y, z + 0.55, 0.18, 0.18, 0.3, 8, '#9fb3c1');
  // caballete
  g.cylinderBetween(x - 0.4, y, z - 0.6, x - 0.4, y + 0.6, z - 0.45, 0.025, 4, PALETTE.deckWoodDark);
  g.cylinderBetween(x + 0.4, y, z - 0.6, x + 0.4, y + 0.6, z - 0.45, 0.025, 4, PALETTE.deckWoodDark);
  g.box(x - 0.5, y + 0.58, z - 0.5, x + 0.5, y + 0.64, z - 0.4, PALETTE.deckWoodDark);
}

/** Construye la vista de una obra. */
export function buildSite(site: ConstructionSite, m: ModuleInstance | undefined, layout: ShipLayout, mats: ShipMaterials): SiteEntry {
  const W = layout.width;
  const level = m?.level ?? Math.min(...site.cells.map((c) => c.level));
  const base = site.cells.filter((c) => c.level === level);
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const c of base) {
    const mn = cellMin(c.x, c.z, W);
    x0 = Math.min(x0, mn.x);
    z0 = Math.min(z0, mn.z);
    x1 = Math.max(x1, mn.x + CELL);
    z1 = Math.max(z1, mn.z + CELL);
  }
  const y0 = levelY(level);
  const def = moduleDef(site.type);
  const group = new THREE.Group();
  group.name = `obra-${site.moduleId}`;
  const sg = new GeoBuilder();
  const stairs = def.id === 'escalera';
  const h = def.enclosed ? WALL_H + 0.7 : stairs ? LEVEL_H + 1.2 : 2.2;
  scaffold(sg, x0 + 0.35, z0 + 0.35, x1 - 0.35, z1 - 0.35, y0, h, site.moduleId, ['s', 'e']);
  materialPile(sg, x0 + 1.4, y0, z0 + 1.1, site.moduleId);
  // cartel de obra con barra de progreso a ambas caras
  sg.box(x1 - 0.95, y0, z0 + 0.22, x1 - 0.9, y0 + 1.25, z0 + 0.27, PALETTE.deckWoodDark);
  sg.box(x1 - 1.3, y0 + 0.9, z0 + 0.18, x1 - 0.55, y0 + 1.3, z0 + 0.31, '#e9c46a');
  sg.box(x1 - 1.25, y0 + 1.0, z0 + 0.175, x1 - 0.6, y0 + 1.08, z0 + 0.18, '#2b2d42');
  sg.box(x1 - 1.25, y0 + 1.0, z0 + 0.31, x1 - 0.6, y0 + 1.08, z0 + 0.315, '#2b2d42');
  // franjas de aviso
  for (let k = 0; k < 3; k++) sg.box(x1 - 1.22 + k * 0.22, y0 + 1.15, z0 + 0.175, x1 - 1.12 + k * 0.22, y0 + 1.25, z0 + 0.18, '#2b2d42');
  const scaf = new THREE.Mesh(sg.build(), mats.solid);
  scaf.castShadow = true;
  scaf.receiveShadow = true;
  scaf.userData.ownGeometry = true;
  group.add(scaf);

  // Fantasma (escala vertical = progreso)
  const gg = new GeoBuilder();
  if (def.enclosed) {
    const t = 0.18;
    gg.box(x0, 0, z0, x1, 0.05, z1, '#ffffff');
    gg.box(x0, 0, z0, x1, WALL_H, z0 + t, '#ffffff');
    gg.box(x0, 0, z1 - t, x1, WALL_H, z1, '#ffffff');
    gg.box(x0, 0, z0 + t, x0 + t, WALL_H, z1 - t, '#ffffff');
    gg.box(x1 - t, 0, z0 + t, x1, WALL_H, z1 - t, '#ffffff');
    gg.box(x0, WALL_H, z0, x1, LEVEL_H, z1, '#ffffff');
  } else if (stairs && m) {
    // cuña de la escalera en la dirección de subida
    const dirs = [
      [0, 1],
      [-1, 0],
      [0, -1],
      [1, 0],
    ];
    const d = dirs[m.rot]!;
    const mn = cellMin(m.x, m.z, W);
    const n = 8;
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * CELL;
      const s1 = ((k + 1) / n) * CELL;
      const top = ((k + 1) / n) * LEVEL_H;
      const ax = d[0]!;
      const az = d[1]!;
      const bx0 = ax === 0 ? mn.x : ax > 0 ? mn.x + s0 : mn.x + CELL - s1;
      const bx1 = ax === 0 ? mn.x + CELL : ax > 0 ? mn.x + s1 : mn.x + CELL - s0;
      const bz0 = az === 0 ? mn.z : az > 0 ? mn.z + s0 : mn.z + CELL - s1;
      const bz1 = az === 0 ? mn.z + CELL : az > 0 ? mn.z + s1 : mn.z + CELL - s0;
      gg.box(bx0, 0, bz0, bx1, top, bz1, '#ffffff');
    }
  } else if (m) {
    for (const p of def.props) {
      const pos = localToShip(m, p.u, p.v, W);
      const yaw = localYaw(m.rot, p.rot);
      const [hx, hz, ph] = p.collider ?? [0.4, 0.4, 0.5];
      gg.push();
      gg.translate(pos.x, p.y ?? 0, pos.z);
      gg.rotateY(yaw);
      gg.box(-hx, 0, -hz, hx, ph, hz, '#ffffff');
      gg.pop();
    }
  }
  const bars = [progressBar(x1 - 1.245, y0 + 1.04, z0 + 0.168, 0.64), progressBar(x1 - 1.245, y0 + 1.04, z0 + 0.322, 0.64)];
  bars[1]!.rotation.y = Math.PI;
  bars[1]!.position.x = x1 - 0.605;
  group.add(...bars);
  const ghostMesh = new THREE.Mesh(gg.build(), mats.ghost);
  ghostMesh.userData.ownGeometry = true;
  ghostMesh.renderOrder = 3;
  const ghost = new THREE.Group();
  ghost.position.y = y0;
  ghost.add(ghostMesh);
  ghost.name = 'fantasma';
  group.add(ghost);
  const top = y0 + h;
  const bounds = new THREE.Box3(new THREE.Vector3(x0 - 0.4, y0, z0 - 0.4), new THREE.Vector3(x1 + 0.4, top, z1 + 0.4));
  return { moduleId: site.moduleId, level, group, ghost, bounds, bars };
}

/** Andamiaje de la ampliación del casco (proa), con material acopiado en el castillo. */
export function buildExpansionScaffold(length: number, width: number, mats: ShipMaterials): { object: THREE.Group; bars: THREE.Mesh[] } {
  const g = new GeoBuilder();
  const x0 = bowStartX(length);
  for (const s of [1, -1]) {
    // andamio colgado por fuera del costado de proa
    const xa = x0 - 1.5;
    const xb = x0 + BOW_LENGTH * 0.55;
    const zA = s * (deckHalfWidthAt(xa, length, width) + 0.5);
    const zB = s * (deckHalfWidthAt(xb, length, width) + 0.5);
    const n = 5;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = xa + (xb - xa) * t;
      const z = zA + (zB - zA) * t;
      g.cylinder(x, 0.6, z, 0.035, 0.035, DECK_Y + 1.6 - 0.6, 5, POLE);
    }
    for (const y of [1.6, 2.6, DECK_Y + 0.9, DECK_Y + 1.5]) g.cylinderBetween(xa, y, zA, xb, y, zB, 0.03, 4, POLE);
    // pasarela de tablones a lo largo del costado (cajas giradas según la línea del casco)
    const len = Math.hypot(xb - xa, zB - zA);
    const yaw = Math.atan2(-(zB - zA), xb - xa);
    for (let k = 0; k < 3; k++) {
      g.push();
      g.translate((xa + xb) / 2, 2.0, (zA + zB) / 2);
      g.rotateY(yaw);
      const off = s * (0.06 + 0.13 * k);
      g.box(-len / 2, 0, off - 0.06, len / 2, 0.04, off + 0.06, shade(PLANK, 0.9 + k * 0.05));
      g.pop();
    }
    // diagonales
    for (let k = 0; k < n; k += 2) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      g.cylinderBetween(xa + (xb - xa) * t0, 0.8, zA + (zB - zA) * t0, xa + (xb - xa) * t1, 2.6, zA + (zB - zA) * t1, 0.025, 4, POLE);
    }
  }
  materialPile(g, x0 + 2.2, DECK_Y, 3.0, 7);
  materialPile(g, x0 + 2.2, DECK_Y, -3.2, 9);
  // cartel de la ampliación, mirando a popa, con barra de progreso
  const sx = x0 + 0.6;
  g.box(sx - 0.03, DECK_Y, -0.03, sx + 0.03, DECK_Y + 1.5, 0.03, PALETTE.deckWoodDark);
  g.box(sx - 0.06, DECK_Y + 1.1, -0.5, sx, DECK_Y + 1.55, 0.5, '#e9c46a');
  g.box(sx - 0.065, DECK_Y + 1.2, -0.42, sx - 0.06, DECK_Y + 1.28, 0.42, '#2b2d42');
  const mesh = new THREE.Mesh(g.build(), mats.solid);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ownGeometry = true;
  const object = new THREE.Group();
  object.name = 'ampliacion-casco';
  // vista desde popa (mirando a +x) la derecha es +z: la barra crece de izquierda a derecha
  const bar = progressBar(sx - 0.072, DECK_Y + 1.24, -0.415, 0.83);
  bar.rotation.y = -Math.PI / 2;
  object.add(mesh, bar);
  return { object, bars: [bar] };
}

/** Progreso visible de una obra (0..1). */
export function siteProgress(state: GameState, moduleId: number): number {
  const m = state.ship.modules.find((mm) => mm.id === moduleId);
  return m ? THREE.MathUtils.clamp(m.buildProgress, 0, 1) : 0;
}

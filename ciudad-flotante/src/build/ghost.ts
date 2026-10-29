/**
 * Elementos 3D del modo construcción. Todos cuelgan de `shipRoot` (coordenadas locales del
 * barco), así se mecen con él y coinciden con el rayo transformado de `picking.ts`.
 *
 *  - `GhostView`: fantasma translúcido del módulo a colocar (verde válido / rojo inválido):
 *    suelo, paredes a la altura real si es una habitación cerrada (con huecos de puerta y
 *    flechas de entrada), muebles como volúmenes y peldaños con flecha de subida en escaleras.
 *  - `GridView`: rejilla de celdas del nivel seleccionado dentro del casco (celdas libres, sin
 *    suelo en la cubierta superior) y la celda bajo el cursor.
 *  - `BoxMarker`: caja translúcida (demolición, ampliación del casco).
 *  - `Pulse`: destello al colocar una obra.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { moduleDef, type Side } from '../data/modules';
import { CELL, DOOR_H, DOOR_W, LEVEL_H, WALL_H } from '../sim/constants';
import { cellMin, doorCell, footprintSize, levelY, localToShip, localYaw, moduleCells, previewModule, SIDE_DIR, stairSides, type ShipLayout } from '../sim/ship';
import type { Rotation, ShipState } from '../sim/types';

export const GHOST_COLORS = {
  ok: new THREE.Color('#7ee08a'),
  bad: new THREE.Color('#ff6b57'),
  marker: new THREE.Color('#ffd166'),
  demolish: new THREE.Color('#ff5a4a'),
  blocked: new THREE.Color('#f2a541'),
};

const WHITE = new THREE.Color('#ffffff');
const GRID_DAY = new THREE.Color('#16324a');
const GRID_NIGHT = new THREE.Color('#bfe6ff');

/** Altura sobre el suelo de las marcas planas (evita parpadeo con la cubierta). */
const FLOOR_EPS = 0.1;
const WALL_T = 0.16;

/* ------------------------------------------------------------------ */
/* Utilidades de geometría                                             */
/* ------------------------------------------------------------------ */

function boxMinMax(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(0.01, maxX - minX), Math.max(0.01, maxY - minY), Math.max(0.01, maxZ - minZ));
  g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
  return g;
}

function orientedBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.rotateY(yaw);
  g.translate(cx, cy, cz);
  return g;
}

/** Flecha plana (en el plano XZ, normal +y) que apunta en la dirección (dx, dz). */
function arrowGeometry(cx: number, y: number, cz: number, dx: number, dz: number, len: number, wid: number, tilt = 0): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hl = len / 2;
  const head = len * 0.45;
  const stem = wid * 0.36;
  s.moveTo(-hl, -stem / 2);
  s.lineTo(hl - head, -stem / 2);
  s.lineTo(hl - head, -wid / 2);
  s.lineTo(hl, 0);
  s.lineTo(hl - head, wid / 2);
  s.lineTo(hl - head, stem / 2);
  s.lineTo(-hl, stem / 2);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  // Inclinación: levanta la punta (para seguir la pendiente de una escalera).
  if (tilt) g.rotateZ(tilt);
  g.rotateY(Math.atan2(-dz, dx));
  g.translate(cx, y, cz);
  return g;
}

/** Galón (chevron) plano que apunta en (dx, dz). */
function chevronGeometry(cx: number, y: number, cz: number, dx: number, dz: number, size: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const a = size / 2;
  const t = size * 0.28;
  s.moveTo(-a, -a);
  s.lineTo(-a + t, -a);
  s.lineTo(a * 0.55, 0);
  s.lineTo(-a + t, a);
  s.lineTo(-a, a);
  s.lineTo(a * 0.55 - t, 0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.atan2(-dz, dx));
  g.translate(cx, y, cz);
  return g;
}

/** Fusiona geometrías (descarta atributos no comunes). Devuelve una geometría vacía si no hay nada. */
function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (!list.length) return new THREE.BufferGeometry();
  const norm = list.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(out.attributes)) if (name !== 'position' && name !== 'normal') out.deleteAttribute(name);
    if (!out.getAttribute('normal')) out.computeVertexNormals();
    return out;
  });
  const merged = mergeGeometries(norm, false) ?? new THREE.BufferGeometry();
  for (const g of list) g.dispose();
  for (const g of norm) g.dispose();
  return merged;
}

function edgesOf(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const edges = list.map((g) => new THREE.EdgesGeometry(g, 25));
  const merged = edges.length ? (mergeGeometries(edges, false) ?? new THREE.BufferGeometry()) : new THREE.BufferGeometry();
  for (const e of edges) e.dispose();
  return merged;
}

/** Rectángulo (LineSegments) en el plano y. */
function rectLines(minX: number, minZ: number, maxX: number, maxZ: number, y: number): THREE.BufferGeometry {
  const p = [minX, y, minZ, maxX, y, minZ, maxX, y, minZ, maxX, y, maxZ, maxX, y, maxZ, minX, y, maxZ, minX, y, maxZ, minX, y, minZ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  return g;
}

/* ------------------------------------------------------------------ */
/* Geometría del fantasma                                              */
/* ------------------------------------------------------------------ */

export interface GhostGeometry {
  /** Volúmenes translúcidos (suelo, paredes, muebles, peldaños). */
  fill: THREE.BufferGeometry;
  /** Aristas de los volúmenes. */
  edges: THREE.BufferGeometry;
  /** Flechas de puerta y de escalera (siempre de color de aviso). */
  markers: THREE.BufferGeometry;
  /** Contorno del footprint (se dibuja también a través de paredes). */
  outline: THREE.BufferGeometry;
}

/**
 * Geometría del fantasma de un módulo colocado en la celda (0, 0) del nivel 0. Para colocarlo
 * en (x, z, nivel) basta con trasladarlo (x·CELL, nivel·LEVEL_H, z·CELL): `cellMin` es lineal.
 */
export function buildGhostGeometry(type: string, rot: Rotation, width: number): GhostGeometry {
  const def = moduleDef(type);
  const preview = previewModule(type, 0, 0, 0, rot);
  const [fw, fd] = footprintSize(def, rot);
  const o = cellMin(0, 0, width);
  const W = fw * CELL;
  const D = fd * CELL;
  const solids: THREE.BufferGeometry[] = [];
  const markers: THREE.BufferGeometry[] = [];

  // Base: una losa fina que marca las celdas ocupadas.
  solids.push(boxMinMax(o.x + 0.08, 0.02, o.z + 0.08, o.x + W - 0.08, 0.12, o.z + D - 0.08));

  if (def.id === 'escalera') {
    const s = stairSides(rot);
    const dir = SIDE_DIR[s.exit];
    const c = { x: o.x + CELL / 2, z: o.z + CELL / 2 };
    const steps = 8;
    const across = CELL * 0.72;
    for (let i = 0; i < steps; i++) {
      const t0 = (i / steps) * CELL - CELL / 2;
      const t1 = ((i + 1) / steps) * CELL - CELL / 2;
      const mid = (t0 + t1) / 2;
      const h = ((i + 1) / steps) * LEVEL_H;
      const cx = c.x + dir.dx * mid;
      const cz = c.z + dir.dz * mid;
      const sx = dir.dx !== 0 ? CELL / steps : across;
      const sz = dir.dx !== 0 ? across : CELL / steps;
      solids.push(orientedBox(cx, h / 2, cz, sx * 0.98, h, sz, 0));
    }
    // Entrada: galones en la celda vecina del lado de entrada (abajo), apuntando hacia la escalera.
    const e = SIDE_DIR[s.entry];
    for (const k of [2.55, 3.4]) {
      markers.push(chevronGeometry(c.x + e.dx * k, FLOOR_EPS, c.z + e.dz * k, -e.dx, -e.dz, 0.9));
    }
    // Subida: flecha inclinada sobre los peldaños y otra en el rellano superior.
    markers.push(arrowGeometry(c.x, LEVEL_H / 2 + 0.6, c.z, dir.dx, dir.dz, 2.6, 1.3, Math.atan2(LEVEL_H, CELL)));
    markers.push(arrowGeometry(c.x + dir.dx * CELL * 0.85, LEVEL_H + FLOOR_EPS, c.z + dir.dz * CELL * 0.85, dir.dx, dir.dz, 1.6, 1.1));
  } else if (def.enclosed) {
    // Paredes del perímetro con hueco de puerta y dintel.
    const doors = def.doors.map((d) => doorCell(preview, d, width));
    const cells = moduleCells(preview).filter((cc) => cc.level === 0);
    const inside = (x: number, z: number) => cells.some((cc) => cc.x === x && cc.z === z);
    const t = WALL_T;
    for (const cc of cells) {
      const mn = cellMin(cc.x, cc.z, width);
      for (const side of ['S', 'E', 'N', 'W'] as Side[]) {
        const d = SIDE_DIR[side];
        if (inside(cc.x + d.dx, cc.z + d.dz)) continue;
        const door = doors.find((dd) => dd.x === cc.x && dd.z === cc.z && dd.side === side);
        // Segmento a lo largo de la arista, metido medio grosor hacia dentro.
        const alongX = d.dz !== 0;
        const fixed = alongX ? (d.dz < 0 ? mn.z + t / 2 : mn.z + CELL - t / 2) : d.dx < 0 ? mn.x + t / 2 : mn.x + CELL - t / 2;
        const a0 = alongX ? mn.x : mn.z;
        const piece = (from: number, to: number, y0: number, y1: number) => {
          if (to - from < 0.02) return;
          if (alongX) solids.push(boxMinMax(a0 + from, y0, fixed - t / 2, a0 + to, y1, fixed + t / 2));
          else solids.push(boxMinMax(fixed - t / 2, y0, a0 + from, fixed + t / 2, y1, a0 + to));
        };
        if (!door) {
          piece(0, CELL, 0, WALL_H);
          continue;
        }
        const m0 = CELL / 2 - DOOR_W / 2;
        const m1 = CELL / 2 + DOOR_W / 2;
        piece(0, m0, 0, WALL_H);
        piece(m1, CELL, 0, WALL_H);
        piece(m0, m1, DOOR_H, WALL_H);
        // Marco de la puerta (jambas) y flecha de entrada en el suelo exterior.
        const mid = a0 + CELL / 2;
        const out = 0.95;
        const px = alongX ? mid : fixed + d.dx * out;
        const pz = alongX ? fixed + d.dz * out : mid;
        markers.push(arrowGeometry(px, FLOOR_EPS, pz, -d.dx, -d.dz, 1.25, 1.0));
        for (const jamb of [m0, m1]) {
          const jx = alongX ? a0 + jamb : fixed;
          const jz = alongX ? fixed : a0 + jamb;
          markers.push(orientedBox(jx, DOOR_H / 2, jz, 0.12, DOOR_H, 0.12, 0));
        }
        markers.push(alongX ? boxMinMax(a0 + m0, DOOR_H - 0.06, fixed - 0.06, a0 + m1, DOOR_H + 0.06, fixed + 0.06) : boxMinMax(fixed - 0.06, DOOR_H - 0.06, a0 + m0, fixed + 0.06, DOOR_H + 0.06, a0 + m1));
      }
    }
  }

  // Muebles y máquinas como volúmenes (con su giro real).
  for (const p of def.props) {
    if (!p.collider) continue;
    const pos = localToShip(preview, p.u, p.v, width);
    const yaw = localYaw(rot, p.rot);
    const [hx, hz, h] = p.collider;
    const y0 = p.y ?? 0;
    solids.push(orientedBox(pos.x, y0 + h / 2, pos.z, hx * 2 * 0.96, h, hz * 2 * 0.96, yaw));
  }

  const edges = edgesOf(solids);
  const fill = merge(solids);
  const markerGeo = merge(markers);
  const outline = rectLines(o.x + 0.04, o.z + 0.04, o.x + W - 0.04, o.z + D - 0.04, FLOOR_EPS);
  return { fill, edges, markers: markerGeo, outline };
}

/* ------------------------------------------------------------------ */
/* Fantasma                                                            */
/* ------------------------------------------------------------------ */

export class GhostView {
  readonly group = new THREE.Group();
  private readonly fillMat = new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide });
  private readonly edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false });
  private readonly markerMat = new THREE.MeshBasicMaterial({ color: GHOST_COLORS.marker, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide });
  private readonly outlineMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, depthTest: false, depthWrite: false });
  private readonly fill = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMat);
  private readonly edges = new THREE.LineSegments(new THREE.BufferGeometry(), this.edgeMat);
  private readonly markers = new THREE.Mesh(new THREE.BufferGeometry(), this.markerMat);
  private readonly outline = new THREE.LineSegments(new THREE.BufferGeometry(), this.outlineMat);
  private key = '';
  private t = 0;
  private valid = true;

  constructor() {
    this.group.name = 'construccion-fantasma';
    this.fill.renderOrder = 20;
    this.edges.renderOrder = 21;
    this.markers.renderOrder = 22;
    this.outline.renderOrder = 23;
    this.group.add(this.fill, this.edges, this.markers, this.outline);
    this.group.visible = false;
    this.setState('ok');
  }

  /** Prepara la geometría (solo se regenera si cambia el tipo, la rotación o la manga). */
  setShape(type: string, rot: Rotation, width: number): void {
    const key = `${type}|${rot}|${width}`;
    if (key === this.key) return;
    this.key = key;
    const g = buildGhostGeometry(type, rot, width);
    this.fill.geometry.dispose();
    this.edges.geometry.dispose();
    this.markers.geometry.dispose();
    this.outline.geometry.dispose();
    this.fill.geometry = g.fill;
    this.edges.geometry = g.edges;
    this.markers.geometry = g.markers;
    this.outline.geometry = g.outline;
  }

  /** Coloca el fantasma en la celda mínima (x, z) del nivel. */
  place(level: number, x: number, z: number): void {
    this.group.position.set(x * CELL, levelY(level), z * CELL);
  }

  /** Color según la validez: verde (se puede), ámbar (solo faltan materiales), rojo (no cabe). */
  setState(state: 'ok' | 'cost' | 'bad'): void {
    this.valid = state === 'ok';
    const c = state === 'ok' ? GHOST_COLORS.ok : state === 'cost' ? GHOST_COLORS.blocked : GHOST_COLORS.bad;
    this.fillMat.color.copy(c);
    this.fillMat.emissive.copy(c).multiplyScalar(0.55);
    this.edgeMat.color.copy(c).lerp(WHITE, 0.35);
    this.outlineMat.color.copy(c);
  }

  update(dt: number): void {
    this.t += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    this.fillMat.opacity = this.valid ? 0.3 + 0.1 * pulse : 0.34 + 0.14 * pulse;
    this.markerMat.opacity = 0.75 + 0.25 * pulse;
  }

  dispose(): void {
    for (const o of [this.fill, this.edges, this.markers, this.outline]) o.geometry.dispose();
    this.fillMat.dispose();
    this.edgeMat.dispose();
    this.markerMat.dispose();
    this.outlineMat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Rejilla                                                             */
/* ------------------------------------------------------------------ */

export class GridView {
  readonly group = new THREE.Group();
  /** Líneas oscuras: se leen sobre la cubierta clara y sobre el suelo oscuro de la bodega. */
  private readonly lineMat = new THREE.LineBasicMaterial({ color: '#16324a', transparent: true, opacity: 0.5, depthWrite: false });
  private readonly fillMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  private readonly cursorMat = new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
  private readonly cursorFillMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  private readonly lines = new THREE.LineSegments(new THREE.BufferGeometry(), this.lineMat);
  private readonly fills = new THREE.Mesh(new THREE.BufferGeometry(), this.fillMat);
  private readonly cursor = new THREE.LineSegments(rectLines(0.1, 0.1, CELL - 0.1, CELL - 0.1, 0), this.cursorMat);
  private readonly cursorFill = new THREE.Mesh(new THREE.PlaneGeometry(CELL - 0.2, CELL - 0.2).rotateX(-Math.PI / 2).translate(CELL / 2, 0, CELL / 2), this.cursorFillMat);
  private key = '';
  private t = 0;

  constructor() {
    this.group.name = 'construccion-rejilla';
    this.lines.renderOrder = 15;
    this.fills.renderOrder = 14;
    this.cursor.renderOrder = 24;
    this.cursorFill.renderOrder = 16;
    this.cursor.visible = false;
    this.cursorFill.visible = false;
    this.group.add(this.fills, this.lines, this.cursor, this.cursorFill);
  }

  /** Reconstruye la rejilla si cambió el barco o el nivel. */
  sync(layout: ShipLayout, ship: ShipState, level: number): void {
    const constructionKey = ship.modules
      .filter((m) => m.status === 'construction')
      .map((m) => m.id)
      .join(',');
    const key = `${layout.revision}|${layout.length}|${layout.width}|${level}|${constructionKey}`;
    if (key === this.key) return;
    this.key = key;
    const y = levelY(level) + 0.085;
    const L = layout.length;
    const Wc = layout.width;
    const o = cellMin(0, 0, Wc);
    const maxX = o.x + L * CELL;
    const maxZ = o.z + Wc * CELL;

    // Celdas ocupadas en este nivel (también obras y la parte alta de escaleras).
    const occupied = new Set<string>();
    for (const m of ship.modules) for (const c of moduleCells(m)) if (c.level === level) occupied.add(`${c.x},${c.z}`);

    const lp: number[] = [];
    for (let x = 0; x <= L; x++) lp.push(o.x + x * CELL, y, o.z, o.x + x * CELL, y, maxZ);
    for (let z = 0; z <= Wc; z++) lp.push(o.x, y, o.z + z * CELL, maxX, y, o.z + z * CELL);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    this.lines.geometry.dispose();
    this.lines.geometry = lg;

    const pos: number[] = [];
    const col: number[] = [];
    const inset = 0.12;
    for (let x = 0; x < L; x++) {
      for (let z = 0; z < Wc; z++) {
        const cell = layout.cells[level]?.[x]?.[z];
        if (!cell || occupied.has(`${x},${z}`)) continue;
        // Solo se rellenan las celdas libres con suelo (donde se puede construir); las celdas sin
        // suelo de la cubierta superior quedan vacías y se ve a través de ellas.
        if (cell.kind === 'void') continue;
        const rgba = [0.42, 0.86, 1, 0.16];
        const mn = cellMin(x, z, Wc);
        const x0 = mn.x + inset;
        const z0 = mn.z + inset;
        const x1 = mn.x + CELL - inset;
        const z1 = mn.z + CELL - inset;
        pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
        for (let i = 0; i < 6; i++) col.push(...rgba);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    this.fills.geometry.dispose();
    this.fills.geometry = fg;
  }

  /** Marca la celda bajo el cursor (null = ninguna). */
  setCursor(level: number, cell: { x: number; z: number } | null, width: number): void {
    const on = !!cell;
    this.cursor.visible = on;
    this.cursorFill.visible = on;
    if (!cell) return;
    const mn = cellMin(cell.x, cell.z, width);
    const y = levelY(level) + 0.1;
    this.cursor.position.set(mn.x, y, mn.z);
    this.cursorFill.position.set(mn.x, y, mn.z);
  }

  /** `night` 0..1: de noche las líneas pasan de oscuras a claras para seguir leyéndose. */
  update(dt: number, night = 0): void {
    this.t += dt;
    this.cursorFillMat.opacity = 0.09 + 0.06 * Math.sin(this.t * 4);
    this.lineMat.color.copy(GRID_DAY).lerp(GRID_NIGHT, night);
    this.lineMat.opacity = 0.5 - 0.12 * night;
  }

  /** Fuerza la reconstrucción (partida nueva o cargada). */
  invalidate(): void {
    this.key = '';
  }

  dispose(): void {
    for (const o of [this.lines, this.fills, this.cursor, this.cursorFill]) o.geometry.dispose();
    this.lineMat.dispose();
    this.fillMat.dispose();
    this.cursorMat.dispose();
    this.cursorFillMat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Caja translúcida (demolición, ampliación)                           */
/* ------------------------------------------------------------------ */

export class BoxMarker {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  private readonly edgeMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false });
  private readonly mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.mat);
  private readonly edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), this.edgeMat);
  private t = 0;
  private base = 0.22;

  constructor(name: string) {
    this.group.name = name;
    this.mesh.renderOrder = 25;
    this.edges.renderOrder = 26;
    this.group.add(this.mesh, this.edges);
    this.group.visible = false;
  }

  show(box: THREE.Box3, color: THREE.Color, opacity = 0.22): void {
    const size = box.getSize(new THREE.Vector3());
    box.getCenter(this.group.position);
    this.mesh.scale.copy(size);
    this.edges.scale.copy(size);
    this.mat.color.copy(color);
    this.edgeMat.color.copy(color).lerp(new THREE.Color('#ffffff'), 0.25);
    this.base = opacity;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  update(dt: number): void {
    this.t += dt;
    this.mat.opacity = this.base * (0.75 + 0.25 * Math.sin(this.t * 6));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.edges.geometry.dispose();
    this.mat.dispose();
    this.edgeMat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Destello al colocar                                                 */
/* ------------------------------------------------------------------ */

export class Pulse {
  readonly group = new THREE.Group();
  private readonly mat = new THREE.LineBasicMaterial({ color: '#c9ffd0', transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private readonly lines = new THREE.LineSegments(rectLines(-0.5, -0.5, 0.5, 0.5, 0), this.mat);
  private life = 0;
  private w = 1;
  private d = 1;

  constructor() {
    this.group.name = 'construccion-destello';
    this.lines.renderOrder = 30;
    this.group.add(this.lines);
    this.group.visible = false;
  }

  /** Lanza el destello sobre un rectángulo (metros locales). */
  fire(minX: number, minZ: number, maxX: number, maxZ: number, y: number): void {
    this.w = maxX - minX;
    this.d = maxZ - minZ;
    this.group.position.set((minX + maxX) / 2, y + 0.08, (minZ + maxZ) / 2);
    this.life = 1;
    this.group.visible = true;
  }

  update(dt: number): void {
    if (this.life <= 0) return;
    this.life = Math.max(0, this.life - dt / 0.55);
    const k = 1 - this.life;
    const grow = 1 + k * 0.35;
    this.lines.scale.set(this.w * grow, 1, this.d * grow);
    this.mat.opacity = this.life;
    if (this.life <= 0) this.group.visible = false;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.mat.dispose();
  }
}

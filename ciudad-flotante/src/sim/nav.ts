/**
 * NAVEGACIÓN FINA para habitantes: cuadrícula de NAV_RES metros por nivel, construida a
 * partir del layout (paredes, props, rampas). A* con enlaces entre niveles por escaleras
 * y suavizado de ruta por línea de visión.
 */
import { CELL, LEVEL_H, SHIP_ORIGIN_X } from './constants';
import { rampHeight } from './physics';
import { halfWidthM, type PropInstance, type ShipLayout } from './ship';
import type { Vec3 } from './types';
import type { Rng } from '../core/Rng';

export const NAV_RES = 0.5;
export const AGENT_RADIUS = 0.3;

export interface NavPoint {
  level: number;
  i: number;
  j: number;
}

export class NavGrid {
  readonly nx: number;
  readonly nz: number;
  readonly levels: number;
  /** walk[level][i * nz + j] = 1 si transitable. */
  readonly walk: Uint8Array[];
  /** Altura del suelo de cada nodo. */
  readonly height: Float32Array[];
  /** Enlaces extra entre niveles (índice global -> índices globales). */
  readonly links = new Map<number, number[]>();
  private readonly hw: number;

  constructor(public readonly layout: ShipLayout) {
    this.levels = layout.levels;
    this.nx = Math.round((layout.length * CELL) / NAV_RES);
    this.nz = Math.round((layout.width * CELL) / NAV_RES);
    this.hw = halfWidthM(layout.width);
    this.walk = [];
    this.height = [];
    const per = CELL / NAV_RES;
    for (let l = 0; l < this.levels; l++) {
      const w = new Uint8Array(this.nx * this.nz);
      const hgt = new Float32Array(this.nx * this.nz);
      for (let i = 0; i < this.nx; i++) {
        for (let j = 0; j < this.nz; j++) {
          const cx = Math.floor(i / per);
          const cz = Math.floor(j / per);
          const cell = layout.cells[l]![cx]![cz]!;
          if (!cell.walkable || cell.kind === 'stairHigh') continue;
          const { x, z } = this.worldXZ(i, j);
          let y = l * LEVEL_H;
          if (cell.kind === 'stairLow') {
            const r = layout.ramps.find((rr) => rr.level === l && rr.x === cx && rr.z === cz);
            if (r) y = rampHeight(r, x, z);
          }
          hgt[i * this.nz + j] = y;
          if (this.blocked(x, z, y)) continue;
          w[i * this.nz + j] = 1;
        }
      }
      this.walk.push(w);
      this.height.push(hgt);
    }
    // Enlaces de escalera: fila superior de la rampa <-> primera fila tras la salida.
    for (const r of layout.ramps) {
      const i0 = cxToI(r.x);
      const j0 = cxToI(r.z);
      for (let k = 0; k < per; k++) {
        let ti: number, tj: number, ui: number, uj: number;
        if (r.dx === 1) {
          ti = i0 + per - 1; tj = j0 + k; ui = ti + 1; uj = tj;
        } else if (r.dx === -1) {
          ti = i0; tj = j0 + k; ui = ti - 1; uj = tj;
        } else if (r.dz === 1) {
          ti = i0 + k; tj = j0 + per - 1; ui = ti; uj = tj + 1;
        } else {
          ti = i0 + k; tj = j0; ui = ti; uj = tj - 1;
        }
        if (!this.inside(ui, uj)) continue;
        if (!this.isWalk(r.level, ti, tj) || !this.isWalk(r.level + 1, ui, uj)) continue;
        const a = this.gid(r.level, ti, tj);
        const b = this.gid(r.level + 1, ui, uj);
        this.addLink(a, b);
        this.addLink(b, a);
      }
    }
    function cxToI(c: number): number {
      return c * per;
    }
  }

  private addLink(a: number, b: number): void {
    let arr = this.links.get(a);
    if (!arr) this.links.set(a, (arr = []));
    arr.push(b);
  }

  private blocked(x: number, z: number, y: number): boolean {
    const r = AGENT_RADIUS;
    const y0 = y + 0.12;
    const y1 = y + 1.6;
    for (const c of this.layout.colliders) {
      if (c.maxY <= y0 || c.minY >= y1) continue;
      if (x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r) return true;
    }
    return false;
  }

  inside(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz;
  }

  isWalk(level: number, i: number, j: number): boolean {
    return level >= 0 && level < this.levels && this.inside(i, j) && this.walk[level]![i * this.nz + j] === 1;
  }

  gid(level: number, i: number, j: number): number {
    return (level * this.nx + i) * this.nz + j;
  }

  fromGid(g: number): NavPoint {
    const j = g % this.nz;
    const rest = (g - j) / this.nz;
    const i = rest % this.nx;
    const level = (rest - i) / this.nx;
    return { level, i, j };
  }

  worldXZ(i: number, j: number): { x: number; z: number } {
    return { x: i * NAV_RES - SHIP_ORIGIN_X + NAV_RES / 2, z: j * NAV_RES - this.hw + NAV_RES / 2 };
  }

  worldOf(p: NavPoint): Vec3 {
    const { x, z } = this.worldXZ(p.i, p.j);
    return { x, y: this.height[p.level]![p.i * this.nz + p.j]!, z };
  }

  /** Nodo de la cuadrícula para un punto 3D (elige el nivel cuya superficie está más cerca). */
  locate(pos: Vec3): NavPoint | null {
    const i = Math.floor((pos.x + SHIP_ORIGIN_X) / NAV_RES);
    const j = Math.floor((pos.z + this.hw) / NAV_RES);
    if (!this.inside(i, j)) return null;
    let best: NavPoint | null = null;
    let bestD = Infinity;
    for (let l = 0; l < this.levels; l++) {
      const h = this.height[l]![i * this.nz + j]!;
      const cell = this.layout.cells[l]![Math.floor((i * NAV_RES) / CELL)]![Math.floor((j * NAV_RES) / CELL)]!;
      if (!cell.walkable || cell.kind === 'stairHigh') continue;
      const d = Math.abs(h - pos.y);
      if (d < bestD) {
        bestD = d;
        best = { level: l, i, j };
      }
    }
    if (!best || bestD > 1.2) return null;
    return best;
  }

  /** Nodo transitable más cercano (búsqueda en espiral) en el mismo nivel. */
  nearestWalkable(pos: Vec3, maxRadius = 12): NavPoint | null {
    const start = this.locate(pos) ?? this.locateLoose(pos);
    if (!start) return null;
    if (this.isWalk(start.level, start.i, start.j)) return start;
    const maxR = Math.ceil(maxRadius / NAV_RES);
    for (let r = 1; r <= maxR; r++) {
      let best: NavPoint | null = null;
      let bestD = Infinity;
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = start.i + di;
          const j = start.j + dj;
          if (!this.isWalk(start.level, i, j)) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            best = { level: start.level, i, j };
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private locateLoose(pos: Vec3): NavPoint | null {
    const i = Math.min(this.nx - 1, Math.max(0, Math.floor((pos.x + SHIP_ORIGIN_X) / NAV_RES)));
    const j = Math.min(this.nz - 1, Math.max(0, Math.floor((pos.z + this.hw) / NAV_RES)));
    const level = Math.max(0, Math.min(this.levels - 1, Math.floor((pos.y + 0.6) / LEVEL_H)));
    return { level, i, j };
  }

  /** ¿Hay línea de visión transitable entre dos nodos del mismo nivel? */
  lineOfSight(a: NavPoint, b: NavPoint): boolean {
    if (a.level !== b.level) return false;
    const steps = Math.max(Math.abs(b.i - a.i), Math.abs(b.j - a.j)) * 2;
    if (steps === 0) return true;
    const h0 = this.height[a.level]![a.i * this.nz + a.j]!;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const fi = a.i + (b.i - a.i) * t;
      const fj = a.j + (b.j - a.j) * t;
      // Comprobar las celdas que toca el punto (con margen) para no rozar esquinas.
      const cands = [
        [Math.floor(fi + 0.5 - 0.35), Math.floor(fj + 0.5 - 0.35)],
        [Math.floor(fi + 0.5 + 0.35), Math.floor(fj + 0.5 - 0.35)],
        [Math.floor(fi + 0.5 - 0.35), Math.floor(fj + 0.5 + 0.35)],
        [Math.floor(fi + 0.5 + 0.35), Math.floor(fj + 0.5 + 0.35)],
      ];
      for (const [ci, cj] of cands) {
        if (!this.isWalk(a.level, ci!, cj!)) return false;
        const h = this.height[a.level]![ci! * this.nz + cj!]!;
        if (Math.abs(h - h0) > 0.6 && Math.abs(h - h0) > Math.abs(t * 3.3)) return false;
      }
    }
    return true;
  }

  /**
   * Ruta A* entre dos puntos. Devuelve puntos de paso (incluye el destino ajustado)
   * o null si no hay camino.
   */
  findPath(from: Vec3, to: Vec3, maxExpanded = 30000): Vec3[] | null {
    const a = this.nearestWalkable(from, 3);
    const b = this.nearestWalkable(to, 4);
    if (!a || !b) return null;
    const start = this.gid(a.level, a.i, a.j);
    const goal = this.gid(b.level, b.i, b.j);
    if (start === goal) return [this.worldOf(b)];
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const heap = new MinHeap();
    const hfun = (p: NavPoint) => {
      const di = Math.abs(p.i - b.i);
      const dj = Math.abs(p.j - b.j);
      return (Math.max(di, dj) + 0.414 * Math.min(di, dj)) * NAV_RES + Math.abs(p.level - b.level) * 4;
    };
    heap.push(start, hfun(a));
    const closed = new Set<number>();
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop()!;
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxExpanded) return null;
      const p = this.fromGid(cur);
      const gc = g.get(cur)!;
      const visit = (n: number, cost: number) => {
        if (closed.has(n)) return;
        const ng = gc + cost;
        const old = g.get(n);
        if (old === undefined || ng < old) {
          g.set(n, ng);
          came.set(n, cur);
          heap.push(n, ng + hfun(this.fromGid(n)));
        }
      };
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ni = p.i + di;
          const nj = p.j + dj;
          if (!this.isWalk(p.level, ni, nj)) continue;
          if (di && dj && (!this.isWalk(p.level, p.i + di, p.j) || !this.isWalk(p.level, p.i, p.j + dj))) continue;
          const dh = Math.abs(this.height[p.level]![ni * this.nz + nj]! - this.height[p.level]![p.i * this.nz + p.j]!);
          if (dh > 0.6) continue;
          visit(this.gid(p.level, ni, nj), (di && dj ? 1.414 : 1) * NAV_RES);
        }
      }
      for (const n of this.links.get(cur) ?? []) visit(n, NAV_RES);
    }
    if (!came.has(goal)) return null;
    const raw: NavPoint[] = [];
    let c: number | undefined = goal;
    while (c !== undefined) {
      raw.push(this.fromGid(c));
      if (c === start) break;
      c = came.get(c);
    }
    raw.reverse();
    // Suavizado: saltar nodos mientras haya línea de visión en el mismo nivel.
    const out: NavPoint[] = [raw[0]!];
    let anchor = 0;
    for (let k = 2; k < raw.length; k++) {
      if (!this.lineOfSight(raw[anchor]!, raw[k]!)) {
        out.push(raw[k - 1]!);
        anchor = k - 1;
      }
    }
    out.push(raw[raw.length - 1]!);
    const pts = out.slice(1).map((p) => this.worldOf(p));
    // Puntos intermedios a lo largo de rampas para que la altura sea suave.
    return densifyRamps(pts, this, this.worldOf(a));
  }

  /** Punto transitable frente a un prop para usarlo. */
  standPoint(prop: PropInstance): Vec3 | null {
    const fx = -Math.sin(prop.yaw);
    const fz = -Math.cos(prop.yaw);
    const depth = Math.abs(fx) > 0.5 ? prop.hx : prop.hz;
    const tries = [depth + 0.55, depth + 0.85, depth + 1.2];
    for (const d of tries) {
      const p = { x: prop.x + fx * d, y: prop.y, z: prop.z + fz * d };
      const n = this.locate(p);
      if (n && this.isWalk(n.level, n.i, n.j)) return this.worldOf(n);
    }
    const n = this.nearestWalkable({ x: prop.x, y: prop.y, z: prop.z }, 3);
    return n ? this.worldOf(n) : null;
  }

  /** Punto aleatorio transitable en celdas que cumplan el filtro. */
  randomPoint(rng: Rng, filter: (level: number, cellKind: string, sky: boolean) => boolean): Vec3 | null {
    for (let t = 0; t < 60; t++) {
      const level = rng.int(0, this.levels - 1);
      const i = rng.int(0, this.nx - 1);
      const j = rng.int(0, this.nz - 1);
      if (!this.isWalk(level, i, j)) continue;
      const cell = this.layout.cells[level]![Math.floor((i * NAV_RES) / CELL)]![Math.floor((j * NAV_RES) / CELL)]!;
      if (!filter(level, cell.kind, cell.sky)) continue;
      return this.worldOf({ level, i, j });
    }
    return null;
  }
}

function densifyRamps(pts: Vec3[], nav: NavGrid, start: Vec3 | null = null): Vec3[] {
  const out: Vec3[] = [];
  let prev: Vec3 | null = start;
  for (const p of pts) {
    if (prev && Math.abs(p.y - prev.y) > 0.3) {
      const n = Math.ceil(Math.hypot(p.x - prev.x, p.z - prev.z) / 0.8);
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const q = { x: prev.x + (p.x - prev.x) * t, y: 0, z: prev.z + (p.z - prev.z) * t };
        const loc = nav.locate({ x: q.x, y: prev.y + (p.y - prev.y) * t, z: q.z });
        q.y = loc ? nav.worldOf(loc).y : prev.y + (p.y - prev.y) * t;
        out.push(q);
      }
    }
    out.push(p);
    prev = p;
  }
  return out;
}

class MinHeap {
  private ids: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, p: number): void {
    this.ids.push(id);
    this.pri.push(p);
    let i = this.ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.pri[parent]! <= this.pri[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number | undefined {
    if (!this.ids.length) return undefined;
    const top = this.ids[0];
    const lastId = this.ids.pop()!;
    const lastP = this.pri.pop()!;
    if (this.ids.length) {
      this.ids[0] = lastId;
      this.pri[0] = lastP;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.pri[l]! < this.pri[m]!) m = l;
        if (r < this.ids.length && this.pri[r]! < this.pri[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    [this.ids[a], this.ids[b]] = [this.ids[b]!, this.ids[a]!];
    [this.pri[a], this.pri[b]] = [this.pri[b]!, this.pri[a]!];
  }
}

/**
 * MODELO ESPACIAL DEL BARCO.
 *
 * - Cuadrícula de celdas (CELL m) por nivel. Celda (x, z): x = 0 popa ... length-1 proa.
 * - `computeLayout` traduce los módulos a geometría jugable: tipos de celda, paredes,
 *   barandillas, puertas, rampas de escalera, props colocados y colisionadores.
 * - `checkPlacement` / `checkDemolish` aplican las reglas de construcción del GDD.
 *
 * Todo es puro (sin three.js) para poder testearlo y reutilizarlo en física, IA y render.
 */
import { MODULES, moduleDef, type DoorSpec, type InteractKind, type ModuleDef, type PropKind, type Side } from '../data/modules';
import { CELL, LEVEL_H, RAIL_H, SHIP_ORIGIN_X, WALL_H, WALL_T } from './constants';
import type { ModuleInstance, Rotation, ShipState } from './types';

/* ------------------------------------------------------------------ */
/* Coordenadas                                                         */
/* ------------------------------------------------------------------ */

export const SIDES: Side[] = ['S', 'E', 'N', 'W'];
export const SIDE_DIR: Record<Side, { dx: number; dz: number }> = {
  S: { dx: 0, dz: -1 },
  E: { dx: 1, dz: 0 },
  N: { dx: 0, dz: 1 },
  W: { dx: -1, dz: 0 },
};
export const OPPOSITE: Record<Side, Side> = { S: 'N', N: 'S', E: 'W', W: 'E' };

export function rotateSide(side: Side, rot: Rotation): Side {
  return SIDES[(SIDES.indexOf(side) + rot) % 4]!;
}

export function halfWidthM(width: number): number {
  return (width * CELL) / 2;
}

/** Esquina mínima (x, z) en metros de la celda. */
export function cellMin(x: number, z: number, width: number): { x: number; z: number } {
  return { x: x * CELL - SHIP_ORIGIN_X, z: z * CELL - halfWidthM(width) };
}

export function cellCenter(x: number, z: number, width: number): { x: number; z: number } {
  const m = cellMin(x, z, width);
  return { x: m.x + CELL / 2, z: m.z + CELL / 2 };
}

export function levelY(level: number): number {
  return level * LEVEL_H;
}

/** Celda que contiene el punto (metros locales). Puede quedar fuera de la cuadrícula. */
export function pointToCell(px: number, pz: number, width: number): { x: number; z: number } {
  return {
    x: Math.floor((px + SHIP_ORIGIN_X) / CELL),
    z: Math.floor((pz + halfWidthM(width)) / CELL),
  };
}

/** Tamaño en celdas del footprint ya rotado: [a lo largo de x, a lo largo de z]. */
export function footprintSize(def: ModuleDef, rot: Rotation): [number, number] {
  const [w, d] = def.size;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

/** Convierte coordenadas de footprint (u, v en metros, rot 0) a metros locales del barco. */
export function localToShip(
  m: Pick<ModuleInstance, 'type' | 'x' | 'z' | 'rot'>,
  u: number,
  v: number,
  width: number,
): { x: number; z: number } {
  const def = moduleDef(m.type);
  const W = def.size[0] * CELL;
  const D = def.size[1] * CELL;
  const o = cellMin(m.x, m.z, width);
  switch (m.rot) {
    case 0:
      return { x: o.x + u, z: o.z + v };
    case 1:
      return { x: o.x + D - v, z: o.z + u };
    case 2:
      return { x: o.x + W - u, z: o.z + D - v };
    default:
      return { x: o.x + v, z: o.z + W - u };
  }
}

/** Yaw (rotation.y de three.js) en el barco para un yaw local del footprint. */
export function localYaw(rot: Rotation, yaw: number): number {
  return yaw - (rot * Math.PI) / 2;
}

export interface CellRef {
  level: number;
  x: number;
  z: number;
}

/** Celdas ocupadas por un módulo (la escalera ocupa también la celda del nivel superior). */
export function moduleCells(m: Pick<ModuleInstance, 'type' | 'level' | 'x' | 'z' | 'rot'>): CellRef[] {
  const def = moduleDef(m.type);
  const [fw, fd] = footprintSize(def, m.rot);
  const out: CellRef[] = [];
  for (let i = 0; i < fw; i++) for (let j = 0; j < fd; j++) out.push({ level: m.level, x: m.x + i, z: m.z + j });
  if (def.id === 'escalera') out.push({ level: m.level + 1, x: m.x, z: m.z });
  return out;
}

/** Centro del módulo en metros locales (y = suelo del nivel). */
export function moduleCenter(m: Pick<ModuleInstance, 'type' | 'level' | 'x' | 'z' | 'rot'>, width: number): { x: number; y: number; z: number } {
  const def = moduleDef(m.type);
  const [fw, fd] = footprintSize(def, m.rot);
  const o = cellMin(m.x, m.z, width);
  return { x: o.x + (fw * CELL) / 2, y: levelY(m.level), z: o.z + (fd * CELL) / 2 };
}

/** Puerta de un módulo en coordenadas de barco: celda interior y lado (ya rotado). */
export function doorCell(m: Pick<ModuleInstance, 'type' | 'x' | 'z' | 'rot'>, door: DoorSpec, width: number): { x: number; z: number; side: Side } {
  const def = moduleDef(m.type);
  let u: number;
  let v: number;
  const inset = 0.25;
  switch (door.side) {
    case 'S':
      u = door.cell * CELL + CELL / 2;
      v = inset;
      break;
    case 'N':
      u = door.cell * CELL + CELL / 2;
      v = def.size[1] * CELL - inset;
      break;
    case 'W':
      u = inset;
      v = door.cell * CELL + CELL / 2;
      break;
    default:
      u = def.size[0] * CELL - inset;
      v = door.cell * CELL + CELL / 2;
  }
  const p = localToShip(m, u, v, width);
  const c = pointToCell(p.x, p.z, width);
  return { x: c.x, z: c.z, side: rotateSide(door.side, m.rot) };
}

/** Escalera: lado de entrada (nivel inferior) y de salida (nivel superior), ya rotados. */
export function stairSides(rot: Rotation): { entry: Side; exit: Side } {
  return { entry: rotateSide('S', rot), exit: rotateSide('N', rot) };
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export type CellKind = 'void' | 'hold' | 'deck' | 'roof' | 'room' | 'stairLow' | 'stairHigh';

export interface LayoutCell {
  level: number;
  x: number;
  z: number;
  kind: CellKind;
  walkable: boolean;
  /** Módulo que ocupa la celda en este nivel (habitación, equipamiento o escalera). */
  moduleId: number | null;
  /** Cielo abierto encima (llueve, hace frío, da el sol). */
  sky: boolean;
  /** Interior cerrado (habitación). */
  indoor: boolean;
}

export type WallKind = 'wall' | 'hull' | 'rail' | 'stair';

export interface WallSeg {
  level: number;
  /** Segmento alineado con un eje, en metros locales. */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** Rango vertical visual. */
  y0: number;
  y1: number;
  /** Altura superior a efectos de colisión (las barandillas bloquean más alto de lo que se ven). */
  colY1: number;
  kind: WallKind;
  /** Da al exterior (ventanas en habitaciones de niveles >= 1). */
  exterior: boolean;
  /** Módulo dueño (para colores/demolición) o null. */
  moduleId: number | null;
  /** Lado interior: normal apuntando hacia la celda dueña (dx, dz). */
  nx: number;
  nz: number;
}

export interface DoorInfo {
  level: number;
  x: number;
  y: number;
  z: number;
  /** 'x' si el hueco se extiende a lo largo del eje X (pared paralela a X). */
  axis: 'x' | 'z';
  width: number;
  height: number;
  moduleId: number | null;
}

export interface Ramp {
  moduleId: number;
  /** Nivel inferior. */
  level: number;
  x: number;
  z: number;
  /** Límites de la celda en metros. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  y0: number;
  y1: number;
  /** Dirección de subida. */
  dx: number;
  dz: number;
  entry: Side;
  exit: Side;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface PropInstance {
  /** `${moduleId}:${index}` estable mientras el módulo exista. */
  key: string;
  moduleId: number;
  moduleType: string;
  kind: PropKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  collider: AABB | null;
  interact: InteractKind | null;
  index: number;
  /** Media extensión en planta (para resaltar y elegir punto de uso). */
  hx: number;
  hz: number;
  height: number;
}

export interface Slab {
  level: number;
  x: number;
  z: number;
  /** y del suelo. */
  y: number;
  kind: 'hold' | 'deck' | 'roof' | 'roomFloor' | 'top';
  moduleId: number | null;
}

export interface ConstructionSite {
  moduleId: number;
  type: string;
  cells: CellRef[];
  progress: number;
}

export interface ShipLayout {
  revision: number;
  length: number;
  width: number;
  levels: number;
  /** cells[level][x][z] */
  cells: LayoutCell[][][];
  walls: WallSeg[];
  doors: DoorInfo[];
  ramps: Ramp[];
  props: PropInstance[];
  /** Losas: suelos de cada nivel y techos superiores (kind 'top', no transitables). */
  slabs: Slab[];
  sites: ConstructionSite[];
  /** Colisionadores para física (paredes y props). */
  colliders: AABB[];
}

export function getCell(layout: ShipLayout, level: number, x: number, z: number): LayoutCell | null {
  if (level < 0 || level >= layout.levels || x < 0 || z < 0 || x >= layout.length || z >= layout.width) return null;
  return layout.cells[level]![x]![z]!;
}

function isBuilt(m: ModuleInstance): boolean {
  return m.status !== 'construction';
}

/**
 * Calcula la geometría jugable.
 * @param includeConstruction  trata las obras como terminadas (para validar construcciones).
 */
export function computeLayout(ship: ShipState, includeConstruction = false, extra: ModuleInstance[] = []): ShipLayout {
  const { length, width, levels } = ship;
  const mods = [...ship.modules, ...extra];
  const built = mods.filter((m) => includeConstruction || isBuilt(m));

  // Ocupación por nivel.
  const occ: (ModuleInstance | null)[][][] = [];
  for (let l = 0; l < levels; l++) {
    occ.push(Array.from({ length }, () => Array.from({ length: width }, () => null as ModuleInstance | null)));
  }
  for (const m of built) {
    for (const c of moduleCells(m)) {
      if (c.level < levels && c.x >= 0 && c.x < length && c.z >= 0 && c.z < width) occ[c.level]![c.x]![c.z] = m;
    }
  }

  // Tipos de celda.
  const cells: LayoutCell[][][] = [];
  for (let l = 0; l < levels; l++) {
    const lv: LayoutCell[][] = [];
    for (let x = 0; x < length; x++) {
      const col: LayoutCell[] = [];
      for (let z = 0; z < width; z++) {
        const m = occ[l]![x]![z];
        let kind: CellKind;
        if (m && m.type === 'escalera') {
          kind = m.level === l ? 'stairLow' : 'stairHigh';
        } else if (m && moduleDef(m.type).enclosed) {
          kind = 'room';
        } else if (l === 0) {
          kind = 'hold';
        } else if (l === 1) {
          kind = 'deck';
        } else {
          // Nivel 2+: hay suelo si debajo hay una habitación (techo transitable).
          const below = occ[l - 1]![x]![z];
          const supported = !!below && moduleDef(below.type).enclosed && below.type !== 'escalera';
          kind = supported || m ? 'roof' : 'void';
        }
        const walkable = kind !== 'void';
        const indoor = kind === 'room' || l === 0;
        const sky = !indoor && kind !== 'void' && l >= 1;
        col.push({ level: l, x, z, kind, walkable, moduleId: m ? m.id : null, sky, indoor });
      }
      lv.push(col);
    }
    cells.push(lv);
  }

  const cellAt = (l: number, x: number, z: number): LayoutCell | null =>
    l < 0 || l >= levels || x < 0 || z < 0 || x >= length || z >= width ? null : cells[l]![x]![z]!;
  const modById = new Map<number, ModuleInstance>(built.map((m) => [m.id, m]));

  // Puertas declaradas -> mapa "l,x,z,side" -> moduleId
  const doorMap = new Map<string, number>();
  for (const m of built) {
    const def = moduleDef(m.type);
    if (!def.enclosed) continue;
    for (const d of def.doors) {
      const dc = doorCell(m, d, width);
      doorMap.set(`${m.level},${dc.x},${dc.z},${dc.side}`, m.id);
    }
  }
  const hasDoor = (l: number, x: number, z: number, side: Side): number | undefined => doorMap.get(`${l},${x},${z},${side}`);

  /** ¿Se puede salir de la celda por ese lado (según su propio tipo)? */
  const allowSide = (c: LayoutCell, side: Side, other: LayoutCell | null): boolean => {
    if (c.kind === 'stairLow' || c.kind === 'stairHigh') {
      const m = modById.get(c.moduleId!)!;
      const s = stairSides(m.rot);
      return c.kind === 'stairLow' ? side === s.entry : side === s.exit;
    }
    if (c.kind === 'room') {
      if (other && other.moduleId === c.moduleId && other.kind === 'room') return true;
      return hasDoor(c.level, c.x, c.z, side) !== undefined;
    }
    return true;
  };

  const passable = (a: LayoutCell, side: Side, b: LayoutCell | null): boolean => {
    if (!b || !a.walkable || !b.walkable) return false;
    if (a.kind === 'room' && b.kind === 'room' && a.moduleId !== b.moduleId) {
      return hasDoor(a.level, a.x, a.z, side) !== undefined || hasDoor(b.level, b.x, b.z, OPPOSITE[side]) !== undefined;
    }
    return allowSide(a, side, b) && allowSide(b, OPPOSITE[side], a);
  };

  const walls: WallSeg[] = [];
  const doors: DoorInfo[] = [];
  const hw = halfWidthM(width);

  const pushWall = (
    l: number,
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    kind: WallKind,
    exterior: boolean,
    moduleId: number | null,
    nx: number,
    nz: number,
    withDoor: boolean,
    doorModule: number | null,
  ) => {
    const y0 = levelY(l);
    const visH = kind === 'rail' ? RAIL_H : WALL_H;
    const colH = kind === 'rail' ? 2.2 : WALL_H;
    const base = { level: l, y0, y1: y0 + visH, colY1: y0 + colH, kind, exterior, moduleId, nx, nz };
    if (!withDoor) {
      walls.push({ ...base, x0, z0, x1, z1 });
      return;
    }
    const alongX = z0 === z1;
    const len = alongX ? x1 - x0 : z1 - z0;
    const mid = len / 2;
    const a = mid - DOOR_HALF;
    const b = mid + DOOR_HALF;
    if (alongX) {
      walls.push({ ...base, x0, z0, x1: x0 + a, z1 });
      walls.push({ ...base, x0: x0 + b, z0, x1, z1 });
      doors.push({ level: l, x: x0 + mid, y: y0, z: z0, axis: 'x', width: DOOR_HALF * 2, height: DOOR_H_LOCAL, moduleId: doorModule });
    } else {
      walls.push({ ...base, x0, z0, x1, z1: z0 + a });
      walls.push({ ...base, x0, z0: z0 + b, x1, z1 });
      doors.push({ level: l, x: x0, y: y0, z: z0 + mid, axis: 'z', width: DOOR_HALF * 2, height: DOOR_H_LOCAL, moduleId: doorModule });
    }
  };

  /** Evalúa una arista entre `a` y su vecino por `side` (b puede ser null = fuera de la cuadrícula). */
  const evalEdge = (a: LayoutCell | null, side: Side, b: LayoutCell | null, l: number, seg: [number, number, number, number]) => {
    const aw = !!a && a.walkable;
    const bw = !!b && b.walkable;
    if (!aw && !bw) return;
    // Orientamos para que `own` sea la celda transitable (o la habitación si ambas lo son).
    let own = a!;
    let other = b;
    let ownSide = side;
    if (!aw || (bw && b!.kind === 'room' && a!.kind !== 'room')) {
      own = b!;
      other = a;
      ownSide = OPPOSITE[side];
    }
    const d = SIDE_DIR[ownSide];
    const nx = -d.dx;
    const nz = -d.dz;
    const [x0, z0, x1, z1] = seg;
    const otherWalk = !!other && other.walkable;
    if (!otherWalk) {
      // Borde hacia el vacío / exterior.
      if (l === 0) pushWall(l, x0, z0, x1, z1, 'hull', true, own.moduleId, nx, nz, false, null);
      else if (own.kind === 'room') pushWall(l, x0, z0, x1, z1, 'wall', true, own.moduleId, nx, nz, false, null);
      else if (own.kind === 'stairLow') pushWall(l, x0, z0, x1, z1, 'stair', true, own.moduleId, nx, nz, false, null);
      else pushWall(l, x0, z0, x1, z1, 'rail', true, own.moduleId, nx, nz, false, null);
      return;
    }
    const o = other!;
    if (own.kind === 'room' && o.kind === 'room' && own.moduleId === o.moduleId) return;
    const pass = passable(own, ownSide, o);
    if (own.kind === 'room' || o.kind === 'room') {
      const room = own.kind === 'room' ? own : o;
      let doorModule: number | null = null;
      if (pass) {
        doorModule =
          hasDoor(own.level, own.x, own.z, ownSide) ?? hasDoor(o.level, o.x, o.z, OPPOSITE[ownSide]) ?? room.moduleId;
      }
      pushWall(l, x0, z0, x1, z1, 'wall', false, room.moduleId, nx, nz, pass, doorModule);
      return;
    }
    if (pass) return;
    // Escaleras: laterales cerrados abajo, barandilla arriba.
    const stairCell = own.kind === 'stairLow' || own.kind === 'stairHigh' ? own : o;
    const kind: WallKind = stairCell.kind === 'stairLow' ? 'stair' : 'rail';
    pushWall(l, x0, z0, x1, z1, kind, false, stairCell.moduleId, nx, nz, false, null);
  };

  for (let l = 0; l < levels; l++) {
    for (let x = 0; x < length; x++) {
      for (let z = 0; z < width; z++) {
        const a = cellAt(l, x, z);
        const mn = cellMin(x, z, width);
        // Lado E (x+1) y N (z+1) para aristas internas; W y S solo en el borde.
        evalEdge(a, 'E', cellAt(l, x + 1, z), l, [mn.x + CELL, mn.z, mn.x + CELL, mn.z + CELL]);
        evalEdge(a, 'N', cellAt(l, x, z + 1), l, [mn.x, mn.z + CELL, mn.x + CELL, mn.z + CELL]);
        if (x === 0) evalEdge(a, 'W', null, l, [mn.x, mn.z, mn.x, mn.z + CELL]);
        if (z === 0) evalEdge(a, 'S', null, l, [mn.x, mn.z, mn.x + CELL, mn.z]);
      }
    }
  }
  void hw;

  // Rampas.
  const ramps: Ramp[] = [];
  for (const m of built) {
    if (m.type !== 'escalera') continue;
    const s = stairSides(m.rot);
    const mn = cellMin(m.x, m.z, width);
    const dir = SIDE_DIR[s.exit];
    ramps.push({
      moduleId: m.id,
      level: m.level,
      x: m.x,
      z: m.z,
      minX: mn.x,
      minZ: mn.z,
      maxX: mn.x + CELL,
      maxZ: mn.z + CELL,
      y0: levelY(m.level),
      y1: levelY(m.level + 1),
      dx: dir.dx,
      dz: dir.dz,
      entry: s.entry,
      exit: s.exit,
    });
  }

  // Losas.
  const slabs: Slab[] = [];
  for (let l = 0; l < levels; l++) {
    for (let x = 0; x < length; x++) {
      for (let z = 0; z < width; z++) {
        const c = cells[l]![x]![z]!;
        if (c.kind === 'void' || c.kind === 'stairHigh' || c.kind === 'stairLow') continue;
        const kind: Slab['kind'] = c.kind === 'room' ? 'roomFloor' : c.kind === 'hold' ? 'hold' : c.kind === 'deck' ? 'deck' : 'roof';
        slabs.push({ level: l, x, z, y: levelY(l), kind, moduleId: c.moduleId });
        // Techo superior de habitaciones en el último nivel (no transitable).
        if (c.kind === 'room' && l === levels - 1) slabs.push({ level: l + 1, x, z, y: levelY(l + 1), kind: 'top', moduleId: c.moduleId });
      }
    }
  }

  // Props.
  const props: PropInstance[] = [];
  const colliders: AABB[] = [];
  for (const m of built) {
    const def = moduleDef(m.type);
    def.props.forEach((p, i) => {
      const pos = localToShip(m, p.u, p.v, width);
      const yaw = localYaw(m.rot, p.rot);
      const c = Math.abs(Math.cos(yaw));
      const swap = c < 0.5;
      const hx = p.collider ? (swap ? p.collider[1] : p.collider[0]) : 0.4;
      const hz = p.collider ? (swap ? p.collider[0] : p.collider[1]) : 0.4;
      const height = p.collider ? p.collider[2] : 0.5;
      const y = levelY(m.level) + (p.y ?? 0);
      const collider: AABB | null = p.collider
        ? { minX: pos.x - hx, maxX: pos.x + hx, minZ: pos.z - hz, maxZ: pos.z + hz, minY: y, maxY: y + height }
        : null;
      if (collider) colliders.push(collider);
      props.push({
        key: `${m.id}:${i}`,
        moduleId: m.id,
        moduleType: m.type,
        kind: p.kind,
        x: pos.x,
        y,
        z: pos.z,
        yaw,
        collider,
        interact: p.interact ?? null,
        index: p.index ?? 0,
        hx,
        hz,
        height,
      });
    });
  }

  // Colisionadores de paredes.
  const ht = WALL_T / 2;
  for (const w of walls) {
    colliders.push({
      minX: Math.min(w.x0, w.x1) - ht,
      maxX: Math.max(w.x0, w.x1) + ht,
      minZ: Math.min(w.z0, w.z1) - ht,
      maxZ: Math.max(w.z0, w.z1) + ht,
      minY: w.y0,
      maxY: w.colY1,
    });
  }

  // Obras en curso (andamios), solo si no se incluyen como terminadas.
  const sites: ConstructionSite[] = [];
  for (const m of mods) {
    if (m.status === 'construction' && !includeConstruction) {
      sites.push({ moduleId: m.id, type: m.type, cells: moduleCells(m), progress: m.buildProgress });
    }
  }

  return { revision: ship.revision, length, width, levels, cells, walls, doors, ramps, props, slabs, sites, colliders };
}

const DOOR_HALF = 0.75;
const DOOR_H_LOCAL = 2.3;

/* ------------------------------------------------------------------ */
/* Grafo de celdas (conectividad gruesa)                               */
/* ------------------------------------------------------------------ */

export interface CellGraph {
  /** Vecinos por clave "l,x,z". */
  adj: Map<string, string[]>;
}

export const cellKey = (l: number, x: number, z: number): string => `${l},${x},${z}`;

export function buildCellGraph(layout: ShipLayout, ship: ShipState, includeConstruction = false, extra: ModuleInstance[] = []): CellGraph {
  const mods = [...ship.modules, ...extra].filter((m) => includeConstruction || m.status !== 'construction');
  const modById = new Map(mods.map((m) => [m.id, m]));
  const adj = new Map<string, string[]>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };
  // Reutilizamos la lógica de paredes: dos celdas transitables vecinas están conectadas
  // si no hay pared/barandilla entre ellas, o si hay una puerta.
  const blocked = new Set<string>();
  const doorAt = new Set<string>();
  const edgeKey = (l: number, x0: number, z0: number, x1: number, z1: number) =>
    `${l}|${Math.round(Math.min(x0, x1) * 10)}|${Math.round(Math.min(z0, z1) * 10)}|${Math.round(Math.max(x0, x1) * 10)}|${Math.round(Math.max(z0, z1) * 10)}`;
  for (const w of layout.walls) {
    // Las paredes partidas por puertas forman dos trozos: reconstruimos la arista completa.
    const alongX = Math.abs(w.z0 - w.z1) < 1e-6;
    const fixed = alongX ? w.z0 : w.x0;
    const lo = alongX ? Math.min(w.x0, w.x1) : Math.min(w.z0, w.z1);
    const origin = alongX ? -SHIP_ORIGIN_X : -halfWidthM(layout.width);
    const idx = Math.floor((lo - origin + 1e-6) / CELL);
    const s = origin + idx * CELL;
    const k = alongX ? edgeKey(w.level, s, fixed, s + CELL, fixed) : edgeKey(w.level, fixed, s, fixed, s + CELL);
    blocked.add(k);
  }
  for (const d of layout.doors) {
    const alongX = d.axis === 'x';
    const origin = alongX ? -SHIP_ORIGIN_X : -halfWidthM(layout.width);
    const coord = alongX ? d.x : d.z;
    const idx = Math.floor((coord - origin) / CELL);
    const s = origin + idx * CELL;
    const k = alongX ? edgeKey(d.level, s, d.z, s + CELL, d.z) : edgeKey(d.level, d.x, s, d.x, s + CELL);
    doorAt.add(k);
  }
  for (let l = 0; l < layout.levels; l++) {
    for (let x = 0; x < layout.length; x++) {
      for (let z = 0; z < layout.width; z++) {
        const c = layout.cells[l]![x]![z]!;
        if (!c.walkable) continue;
        const k = cellKey(l, x, z);
        if (!adj.has(k)) adj.set(k, []);
        const mn = cellMin(x, z, layout.width);
        const nE = getCell(layout, l, x + 1, z);
        if (nE && nE.walkable) {
          const ek = edgeKey(l, mn.x + CELL, mn.z, mn.x + CELL, mn.z + CELL);
          if (!blocked.has(ek) || doorAt.has(ek)) add(k, cellKey(l, x + 1, z));
        }
        const nN = getCell(layout, l, x, z + 1);
        if (nN && nN.walkable) {
          const ek = edgeKey(l, mn.x, mn.z + CELL, mn.x + CELL, mn.z + CELL);
          if (!blocked.has(ek) || doorAt.has(ek)) add(k, cellKey(l, x, z + 1));
        }
      }
    }
  }
  // Escaleras: celda inferior <-> celda superior.
  for (const r of layout.ramps) {
    const m = modById.get(r.moduleId);
    if (!m) continue;
    add(cellKey(r.level, r.x, r.z), cellKey(r.level + 1, r.x, r.z));
  }
  return { adj };
}

export function reachableFrom(graph: CellGraph, start: string): Set<string> {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of graph.adj.get(k) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** Celda de referencia: la cubierta principal más cercana al centro que sea transitable y abierta. */
export function referenceCell(layout: ShipLayout): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  const cx = (layout.length - 1) / 2;
  const cz = (layout.width - 1) / 2;
  for (let x = 0; x < layout.length; x++) {
    for (let z = 0; z < layout.width; z++) {
      const c = layout.cells[1]?.[x]?.[z];
      if (!c || c.kind !== 'deck') continue;
      const d = Math.abs(x - cx) + Math.abs(z - cz);
      if (d < bestD) {
        bestD = d;
        best = cellKey(1, x, z);
      }
    }
  }
  return best;
}

/** Módulos (ids) sin acceso desde la cubierta principal. */
export function unreachableModules(ship: ShipState, includeConstruction: boolean, extra: ModuleInstance[] = [], excludeIds: number[] = []): number[] {
  const tmp: ShipState = { ...ship, modules: ship.modules.filter((m) => !excludeIds.includes(m.id)) };
  const layout = computeLayout(tmp, includeConstruction, extra);
  const graph = buildCellGraph(layout, tmp, includeConstruction, extra);
  const ref = referenceCell(layout);
  const mods = [...tmp.modules, ...extra].filter((m) => includeConstruction || m.status !== 'construction');
  if (!ref) return mods.map((m) => m.id);
  const reach = reachableFrom(graph, ref);
  const out: number[] = [];
  for (const m of mods) {
    const cells = moduleCells(m);
    if (!cells.some((c) => reach.has(cellKey(c.level, c.x, c.z)))) out.push(m.id);
  }
  return out;
}

/** Celdas de cubierta principal sin acceso (tras una construcción podrían quedar aisladas). */
function unreachableDeckCells(ship: ShipState, extra: ModuleInstance[], excludeIds: number[] = []): number {
  const tmp: ShipState = { ...ship, modules: ship.modules.filter((m) => !excludeIds.includes(m.id)) };
  const layout = computeLayout(tmp, true, extra);
  const graph = buildCellGraph(layout, tmp, true, extra);
  const ref = referenceCell(layout);
  if (!ref) return 0;
  const reach = reachableFrom(graph, ref);
  let n = 0;
  for (let x = 0; x < layout.length; x++)
    for (let z = 0; z < layout.width; z++) {
      const c = layout.cells[1]![x]![z]!;
      if (c.kind === 'deck' && !reach.has(cellKey(1, x, z))) n++;
    }
  return n;
}

/* ------------------------------------------------------------------ */
/* Validación de construcción                                          */
/* ------------------------------------------------------------------ */

export interface PlaceCheck {
  ok: boolean;
  reason: string | null;
  cells: CellRef[];
}

/** Módulo provisional para validaciones (id negativo). */
export function previewModule(type: string, level: number, x: number, z: number, rot: Rotation): ModuleInstance {
  return {
    id: -1,
    type,
    level,
    x,
    z,
    rot,
    status: 'construction',
    buildProgress: 0,
    condition: 100,
    brokenReason: null,
    inventory: null,
    fuelInv: null,
    fuelBurn: 0,
    queue: [],
    plots: [],
    beds: [],
    on: true,
    powered: false,
    fire: 0,
    leak: false,
    tier: 1,
    upgrade: null,
  };
}

/**
 * Comprueba si se puede colocar un módulo (sin mirar el coste: ver inventory.missingFor).
 * `unlocks` = claves desbloqueadas.
 */
export function checkPlacement(ship: ShipState, unlocks: string[], type: string, level: number, x: number, z: number, rot: Rotation): PlaceCheck {
  const def = MODULES[type];
  const fail = (reason: string, cells: CellRef[] = []): PlaceCheck => ({ ok: false, reason, cells });
  if (!def) return fail('Módulo desconocido');
  if (!def.buildable) return fail('Este módulo no se puede construir');
  if (def.unlock && !unlocks.includes(def.unlock)) return fail('Necesitas el plano correspondiente');
  if (!def.levels.includes(level)) {
    const where = ['la bodega', 'la cubierta principal', 'la cubierta superior'];
    const ls = [...def.levels].sort((a, b) => a - b).map((l) => where[l] ?? `el nivel ${l}`);
    const list = ls.length > 1 ? `${ls.slice(0, -1).join(', ')} o ${ls[ls.length - 1]}` : ls[0];
    return fail(`Solo se construye en ${list}`);
  }
  const preview = previewModule(type, level, x, z, rot);
  const cells = moduleCells(preview);
  for (const c of cells) {
    if (c.level >= ship.levels) return fail('No hay nivel superior', cells);
    if (c.x < 0 || c.z < 0 || c.x >= ship.length || c.z >= ship.width) return fail('Fuera del casco', cells);
  }
  // Ocupación.
  for (const m of ship.modules) {
    for (const mc of moduleCells(m)) {
      if (cells.some((c) => c.level === mc.level && c.x === mc.x && c.z === mc.z)) return fail('El espacio ya está ocupado', cells);
    }
  }
  const planned = computeLayout(ship, true);
  // Soporte estructural en niveles superiores.
  if (level >= 2) {
    for (const c of cells.filter((cc) => cc.level === level)) {
      const below = planned.cells[level - 1]![c.x]![c.z]!;
      if (below.kind !== 'room') return fail('Sin soporte: debe apoyarse sobre una habitación cerrada', cells);
    }
  }
  if (def.needsSky && level < 1) return fail('Necesita estar a cielo abierto', cells);
  if (def.edge && !cells.some((c) => c.z === 0 || c.z === ship.width - 1)) return fail('Debe ir junto a la borda (en el borde de la cubierta)', cells);
  if (type === 'escalera') {
    const upper = planned.cells[level + 1]![x]![z]!;
    if (level + 1 === 2 && planned.cells[1]![x]![z]!.kind === 'room') return fail('No se puede atravesar una habitación', cells);
    void upper;
    const s = stairSides(rot);
    const e = SIDE_DIR[s.entry];
    const o = SIDE_DIR[s.exit];
    const entryCell = getCell(planned, level, x + e.dx, z + e.dz);
    if (!entryCell || !entryCell.walkable || entryCell.kind === 'stairLow' || entryCell.kind === 'stairHigh')
      return fail('La entrada de la escalera debe dar a una zona transitable', cells);
    if (entryCell.kind === 'room') return fail('La entrada no puede dar a una pared de habitación', cells);
    // Nivel superior: la salida debe tener suelo (cubierta, techo transitable).
    const after = computeLayout(ship, true, [preview]);
    const exitCell = getCell(after, level + 1, x + o.dx, z + o.dz);
    if (!exitCell || !exitCell.walkable || exitCell.kind === 'stairLow' || exitCell.kind === 'stairHigh')
      return fail('La salida superior debe dar a una cubierta transitable', cells);
    if (exitCell.kind === 'room') return fail('La salida no puede dar a una pared de habitación', cells);
  }
  // Conectividad: el nuevo módulo debe tener acceso y no puede aislar a otros.
  const before = unreachableModules(ship, true);
  const after = unreachableModules(ship, true, [preview]);
  if (after.includes(-1)) {
    return fail(def.enclosed ? 'Sin acceso: la puerta debe dar a una zona transitable' : 'Sin acceso desde la cubierta', cells);
  }
  const lost = after.filter((id) => id !== -1 && !before.includes(id));
  if (lost.length) {
    const names = [...new Set(lost.map((id) => ship.modules.find((m) => m.id === id)).filter((m): m is ModuleInstance => !!m).map((m) => theModule(m.type)))];
    return fail(names.length ? `Dejaría sin acceso ${names.slice(0, 2).join(' y ')}` : 'Dejaría otra zona del barco sin acceso', cells);
  }
  if (unreachableDeckCells(ship, [preview]) > unreachableDeckCells(ship, [])) return fail('Partiría la cubierta en zonas aisladas', cells);
  // Comprobación fina (muebles y colisionadores): que nada quede tapado.
  const fine = fineReachCheck(ship, preview);
  if (fine) return fail(fine, cells);
  return { ok: true, reason: null, cells };
}

/* Caché del informe "antes" por estado del barco (no depende de la pieza que se prueba). */
let reachCache: { key: string; report: ReachReport } | null = null;

function shipKey(ship: ShipState): string {
  return `${ship.revision}|${ship.length}|${ship.modules.map((m) => `${m.id}:${m.type}:${m.level}:${m.x}:${m.z}:${m.rot}`).join(',')}`;
}

/**
 * Compara lo alcanzable antes y después de añadir la pieza. Devuelve un motivo de rechazo o null.
 * Solo culpa a la pieza nueva de lo que ELLA rompe (lo que ya era inaccesible no cuenta).
 */
function fineReachCheck(ship: ShipState, preview: ModuleInstance): string | null {
  const key = shipKey(ship);
  let before: ReachReport;
  if (reachCache && reachCache.key === key) before = reachCache.report;
  else {
    before = reachReport(computeLayout(ship, true));
    reachCache = { key, report: before };
  }
  const afterLayout = computeLayout(ship, true, [preview]);
  const after = reachReport(afterLayout);
  const typeOf = (id: number): string => (id === -1 ? preview.type : ship.modules.find((m) => m.id === id)?.type ?? '');
  // La propia pieza.
  if (after.rooms.has(-1) && !after.rooms.get(-1)) return 'Su puerta quedaría tapada: no se podría entrar';
  if (after.stairs.has(-1) && !after.stairs.get(-1)) return 'No se podría llegar a la escalera';
  for (const p of afterLayout.props) {
    if (p.moduleId !== -1 || !p.interact) continue;
    if (!after.props.get(p.key)) return `No quedaría sitio para usar ${propLabel(p.interact)}`;
  }
  // Lo que ya existía.
  for (const [id, ok] of before.rooms) {
    if (ok && after.rooms.get(id) === false) return `Taparía el acceso ${toModule(typeOf(id))}`;
  }
  for (const [id, ok] of before.stairs) {
    if (ok && after.stairs.get(id) === false) return 'Bloquearía el paso por una escalera';
  }
  for (const p of afterLayout.props) {
    if (p.moduleId === -1 || !p.interact) continue;
    if (before.props.get(p.key) && after.props.get(p.key) === false) {
      return `Dejaría ${propWithModule(p.interact, p.moduleType)} fuera de alcance`;
    }
  }
  return null;
}

/** Comprueba si un módulo se puede demoler. */
export function checkDemolish(ship: ShipState, moduleId: number): { ok: boolean; reason: string | null } {
  const m = ship.modules.find((mm) => mm.id === moduleId);
  if (!m) return { ok: false, reason: 'No existe' };
  const def = moduleDef(m.type);
  if (!def.demolishable) return { ok: false, reason: 'Esta estructura no se puede retirar' };
  // ¿Sostiene algo arriba?
  if (def.enclosed) {
    const cells = moduleCells(m);
    for (const other of ship.modules) {
      if (other.id === m.id || other.level !== m.level + 1) continue;
      for (const oc of moduleCells(other)) {
        if (oc.level === m.level + 1 && cells.some((c) => c.x === oc.x && c.z === oc.z)) {
          return { ok: false, reason: 'Sostiene una estructura del nivel superior' };
        }
      }
    }
    // Escaleras que salen sobre su techo.
    for (const other of ship.modules) {
      if (other.type !== 'escalera' || other.level !== m.level) continue;
      const s = stairSides(other.rot);
      const o = SIDE_DIR[s.exit];
      if (cells.some((c) => c.x === other.x + o.dx && c.z === other.z + o.dz)) {
        return { ok: false, reason: 'Una escalera desembarca sobre su techo' };
      }
    }
  }
  const before = unreachableModules(ship, true);
  const after = unreachableModules(ship, true, [], [moduleId]);
  if (after.some((id) => !before.includes(id))) return { ok: false, reason: 'Dejaría otra zona del barco sin acceso' };
  return { ok: true, reason: null };
}

/* ------------------------------------------------------------------ */
/* Consultas útiles                                                    */
/* ------------------------------------------------------------------ */

/** Nivel en el que está un punto (según su altura). */
export function levelOfY(y: number): number {
  return Math.max(0, Math.floor((y + 0.6) / LEVEL_H));
}

/** Celda del layout bajo un punto 3D. */
export function cellAtPoint(layout: ShipLayout, x: number, y: number, z: number): LayoutCell | null {
  const c = pointToCell(x, z, layout.width);
  return getCell(layout, levelOfY(y), c.x, c.z);
}

/** Módulos que dan cobijo (habitación cerrada) en un punto. */
export function isIndoorAt(layout: ShipLayout, x: number, y: number, z: number): boolean {
  const c = cellAtPoint(layout, x, y, z);
  return !!c && c.indoor;
}

export { WALL_T };

/* ------------------------------------------------------------------ */
/* Instancias                                                          */
/* ------------------------------------------------------------------ */

import { createInventory } from './inventory';
import { propLabel, propWithModule, reachReport, theModule, toModule, type ReachReport } from './reach';

/** Crea una instancia de módulo con sus inventarios, camas y parcelas inicializados. */
export function instantiateModule(
  id: number,
  type: string,
  level: number,
  x: number,
  z: number,
  rot: Rotation,
  status: ModuleInstance['status'] = 'construction',
): ModuleInstance {
  const def = moduleDef(type);
  return {
    id,
    type,
    level,
    x,
    z,
    rot,
    status,
    buildProgress: status === 'construction' ? 0 : 1,
    condition: 100,
    brokenReason: null,
    inventory: def.storageSlots ? createInventory(def.storageSlots) : null,
    fuelInv: def.fuelSlots ? createInventory(def.fuelSlots) : null,
    fuelBurn: 0,
    queue: [],
    plots: Array.from({ length: def.plots ?? 0 }, () => ({ crop: null, growth: 0, dryHours: 0, dead: false, pest: false })),
    beds: Array.from({ length: def.beds ?? 0 }, () => null),
    on: true,
    powered: false,
    fire: 0,
    leak: false,
  };
}

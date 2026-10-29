/**
 * ALCANZABILIDAD FINA para validar construcciones.
 *
 * La conectividad por celdas (ship.ts) no ve los muebles: una pieza puede dejar una puerta tapada
 * por una litera o un rellano de escalera ocupado por un panel solar. Aquí se recorre la rejilla de
 * navegación con el radio del jugador y se comprueba qué habitaciones, muebles interactivos y
 * escaleras son realmente alcanzables desde la cubierta.
 */
import type { InteractKind } from '../data/modules';
import { moduleDef } from '../data/modules';
import { CELL, LEVEL_H } from './constants';
import { NAV_RES, NavGrid } from './nav';
import { cellCenter, cellMin, referenceCell, type PropInstance, type ShipLayout, type WallSeg } from './ship';

/** Radio de comprobación: algo mayor que el del jugador (0,32) para que también quepan los habitantes (0,3). */
export const REACH_RADIUS = 0.33;
/** Distancia máxima (m) desde el borde de un mueble a la que hay que poder ponerse para usarlo. */
const USE_DISTANCE = 0.95;

export interface ReachReport {
  /** Habitación (moduleId) -> se puede entrar. */
  rooms: Map<number, boolean>;
  /** Mueble interactivo (prop.key) -> se puede usar. */
  props: Map<string, boolean>;
  /** Escalera (moduleId) -> se puede subir. */
  stairs: Map<number, boolean>;
}

/** Calcula qué es alcanzable en un layout. */
export function reachReport(layout: ShipLayout): ReachReport {
  const nav = new NavGrid(layout, REACH_RADIUS);
  const rooms = new Map<number, boolean>();
  const props = new Map<string, boolean>();
  const stairs = new Map<number, boolean>();
  const ref = referenceCell(layout);
  let seen: Uint8Array | null = null;
  if (ref) {
    const [, x, z] = ref.split(',').map(Number) as [number, number, number];
    const c = cellCenter(x, z, layout.width);
    const start = nav.nearestWalkable({ x: c.x, y: LEVEL_H, z: c.z }, 6);
    if (start) seen = nav.reachableFrom(start);
  }
  const per = CELL / NAV_RES;
  const reachableIn = (level: number, cx: number, cz: number): boolean => {
    if (!seen) return false;
    for (let a = 0; a < per; a++) {
      for (let b = 0; b < per; b++) {
        const i = cx * per + a;
        const j = cz * per + b;
        if (seen[nav.gid(level, i, j)]) return true;
      }
    }
    return false;
  };

  // Habitaciones: algún nodo alcanzable dentro de alguna de sus celdas.
  for (let l = 0; l < layout.levels; l++) {
    for (let x = 0; x < layout.length; x++) {
      for (let z = 0; z < layout.width; z++) {
        const cell = layout.cells[l]![x]![z]!;
        if (cell.kind !== 'room' || cell.moduleId === null) continue;
        if (rooms.get(cell.moduleId)) continue;
        rooms.set(cell.moduleId, reachableIn(l, x, z));
      }
    }
  }

  // Escaleras: algún nodo alcanzable sobre la rampa.
  for (const r of layout.ramps) stairs.set(r.moduleId, reachableIn(r.level, r.x, r.z));

  // Muebles interactivos: un nodo alcanzable a ≤ USE_DISTANCE del borde, en su nivel y sin pared en medio.
  const wallsByLevel = new Map<number, WallSeg[]>();
  for (const w of layout.walls) {
    let arr = wallsByLevel.get(w.level);
    if (!arr) wallsByLevel.set(w.level, (arr = []));
    arr.push(w);
  }
  for (const p of layout.props) {
    if (!p.interact) continue;
    props.set(p.key, seen ? propReachable(nav, seen, p, wallsByLevel.get(Math.round(p.y / LEVEL_H)) ?? []) : false);
  }
  return { rooms, props, stairs };
}

function propReachable(nav: NavGrid, seen: Uint8Array, p: PropInstance, walls: WallSeg[]): boolean {
  const level = Math.max(0, Math.min(nav.levels - 1, Math.round(p.y / LEVEL_H)));
  const reachR = Math.max(p.hx, p.hz) + USE_DISTANCE + NAV_RES;
  const lo = nav.locate({ x: p.x - reachR, y: p.y, z: p.z - reachR });
  const hi = nav.locate({ x: p.x + reachR, y: p.y, z: p.z + reachR });
  const i0 = lo ? lo.i : 0;
  const j0 = lo ? lo.j : 0;
  const i1 = hi ? hi.i : nav.nx - 1;
  const j1 = hi ? hi.j : nav.nz - 1;
  for (let i = Math.max(0, i0 - 2); i <= Math.min(nav.nx - 1, i1 + 2); i++) {
    for (let j = Math.max(0, j0 - 2); j <= Math.min(nav.nz - 1, j1 + 2); j++) {
      if (!seen[nav.gid(level, i, j)]) continue;
      const w = nav.worldOf({ level, i, j });
      if (Math.abs(w.y - p.y) > 0.7) continue;
      // Distancia al borde del mueble (caja en planta).
      const dx = Math.max(0, Math.abs(w.x - p.x) - p.hx);
      const dz = Math.max(0, Math.abs(w.z - p.z) - p.hz);
      if (Math.hypot(dx, dz) > USE_DISTANCE) continue;
      if (crossesWall(w.x, w.z, p.x, p.z, walls)) continue;
      return true;
    }
  }
  return false;
}

/** ¿El segmento a-b cruza alguna pared/barandilla (segmentos alineados con los ejes)? */
function crossesWall(ax: number, az: number, bx: number, bz: number, walls: WallSeg[]): boolean {
  for (const w of walls) {
    if (w.kind === 'rail') continue;
    if (Math.abs(w.z0 - w.z1) < 1e-6) {
      // Pared paralela a X en z = w.z0.
      const z = w.z0;
      if ((az - z) * (bz - z) > 0) continue;
      if (Math.abs(bz - az) < 1e-9) continue;
      const t = (z - az) / (bz - az);
      const x = ax + (bx - ax) * t;
      if (x > Math.min(w.x0, w.x1) && x < Math.max(w.x0, w.x1)) return true;
    } else {
      const x = w.x0;
      if ((ax - x) * (bx - x) > 0) continue;
      if (Math.abs(bx - ax) < 1e-9) continue;
      const t = (x - ax) / (bx - ax);
      const z = az + (bz - az) * t;
      if (z > Math.min(w.z0, w.z1) && z < Math.max(w.z0, w.z1)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */

const FEMININE_MODULES = new Set(['cocina', 'enfermeria', 'escalera', 'potabilizadora', 'bateria', 'sala_comun', 'grua']);

/** "al camarote" / "a la cocina". */
export function toModule(type: string): string {
  const name = moduleDef(type).name.toLowerCase();
  return FEMININE_MODULES.has(type) ? `a la ${name}` : `al ${name}`;
}

/** "el camarote" / "la cocina". */
export function theModule(type: string): string {
  const name = moduleDef(type).name.toLowerCase();
  return FEMININE_MODULES.has(type) ? `la ${name}` : `el ${name}`;
}

/**
 * "el timón del puente de mando", pero "el depósito de agua" (no "el depósito del depósito de agua"):
 * si el mueble ya da nombre al módulo, basta con el módulo.
 */
export function propWithModule(kind: InteractKind, type: string): string {
  const label = propLabel(kind);
  const noun = label.split(' ').pop()!;
  const modName = moduleDef(type).name.toLowerCase();
  if (modName.split(' ').includes(noun)) return theModule(type);
  return `${label} ${ofModule(type)}`;
}

/** "del camarote" / "de la cocina". */
export function ofModule(type: string): string {
  const name = moduleDef(type).name.toLowerCase();
  return FEMININE_MODULES.has(type) ? `de la ${name}` : `del ${name}`;
}

const PROP_LABEL: Record<InteractKind, string> = {
  dormir: 'una cama',
  cocina: 'el fogón',
  almacen: 'las estanterías',
  banco: 'el banco de trabajo',
  taller: 'el torno',
  huerto: 'un bancal',
  colector: 'el colector',
  deposito: 'el depósito',
  potabilizadora: 'la potabilizadora',
  generador: 'el generador',
  bateria: 'las baterías',
  panel: 'el panel solar',
  timon: 'el timón',
  motor: 'el motor',
  ahumadero: 'el ahumadero',
  vivero: 'los tanques del vivero',
  grua: 'la grúa',
  radar: 'el radar',
};

export function propLabel(kind: InteractKind): string {
  return PROP_LABEL[kind] ?? 'un mueble';
}

/** Celda mínima para depuración. */
export function debugCellMin(x: number, z: number, width: number): { x: number; z: number } {
  return cellMin(x, z, width);
}

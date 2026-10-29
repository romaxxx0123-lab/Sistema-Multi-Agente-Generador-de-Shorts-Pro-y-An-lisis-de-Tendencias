/**
 * Selección con el ratón en el modo construcción (matemática pura, sin DOM).
 *
 * El barco se balancea: `shipRoot` tiene cabeceo, balanceo y arfada. Por eso el rayo de la
 * cámara (en coordenadas del mundo) se transforma al espacio LOCAL del barco antes de cortar
 * con el plano del nivel (y = nivel × LEVEL_H) o con las cajas de los módulos. Así la celda bajo
 * el cursor coincide con la que se ve en pantalla aunque el barco esté escorado.
 */
import * as THREE from 'three';
import { moduleDef, type ModuleDef } from '../data/modules';
import { CELL, LEVEL_H, SHIP_ORIGIN_X, WALL_H } from '../sim/constants';
import { cellMin, footprintSize, halfWidthM, levelY, moduleCells } from '../sim/ship';
import type { ModuleInstance, Rotation, ShipState } from '../sim/types';

const _inv = new THREE.Matrix4();
const _plane = new THREE.Plane();
const _hit = new THREE.Vector3();
const _box = new THREE.Box3();

/** Copia `ray` (mundo) en `out` expresado en el espacio local del barco. */
export function toShipLocalRay(ray: THREE.Ray, shipMatrixWorld: THREE.Matrix4, out: THREE.Ray): THREE.Ray {
  _inv.copy(shipMatrixWorld).invert();
  out.copy(ray).applyMatrix4(_inv);
  out.direction.normalize();
  return out;
}

/** Punto (metros locales) donde el rayo local corta el suelo de un nivel, o null. */
export function intersectLevel(localRay: THREE.Ray, level: number): { x: number; z: number; dist: number } | null {
  _plane.set(new THREE.Vector3(0, 1, 0), -levelY(level));
  const p = localRay.intersectPlane(_plane, _hit);
  if (!p) return null;
  return { x: p.x, z: p.z, dist: localRay.origin.distanceTo(p) };
}

/** Coordenadas de celda continuas (la celda 2 va de 2,0 a 3,0). */
export function continuousCell(px: number, pz: number, width: number): { fx: number; fz: number } {
  return { fx: (px + SHIP_ORIGIN_X) / CELL, fz: (pz + halfWidthM(width)) / CELL };
}

/**
 * Esquina mínima del footprint para que quede centrado bajo el cursor. Si el cursor está cerca
 * del casco (a menos de `slack` celdas) el footprint se encaja dentro; más lejos devuelve null.
 */
export function anchorFor(
  def: ModuleDef,
  rot: Rotation,
  fx: number,
  fz: number,
  ship: Pick<ShipState, 'length' | 'width'>,
  slack = 1.25,
): { x: number; z: number } | null {
  if (!Number.isFinite(fx) || !Number.isFinite(fz)) return null;
  if (fx < -slack || fz < -slack || fx > ship.length + slack || fz > ship.width + slack) return null;
  const [fw, fd] = footprintSize(def, rot);
  const x = Math.round(fx - fw / 2);
  const z = Math.round(fz - fd / 2);
  return {
    x: Math.max(0, Math.min(ship.length - fw, x)),
    z: Math.max(0, Math.min(ship.width - fd, z)),
  };
}

/** Altura visual aproximada de un módulo (para elegirlo con el ratón y resaltarlo). */
export function moduleHeight(def: ModuleDef): number {
  if (def.id === 'escalera') return LEVEL_H;
  if (def.enclosed) return WALL_H;
  let h = 0.6;
  for (const p of def.props) if (p.collider) h = Math.max(h, (p.y ?? 0) + p.collider[2]);
  return h;
}

/** Caja (metros locales) que ocupa un módulo en su nivel. */
export function moduleBox(m: Pick<ModuleInstance, 'type' | 'level' | 'x' | 'z' | 'rot'>, width: number, out: THREE.Box3): THREE.Box3 {
  const def = moduleDef(m.type);
  const [fw, fd] = footprintSize(def, m.rot);
  const o = cellMin(m.x, m.z, width);
  const y0 = levelY(m.level);
  out.min.set(o.x, y0, o.z);
  out.max.set(o.x + fw * CELL, y0 + moduleHeight(def), o.z + fd * CELL);
  return out;
}

/** Módulo que ocupa una celda de un nivel (incluye la parte alta de las escaleras y las obras). */
export function moduleAtCell(ship: ShipState, level: number, x: number, z: number): ModuleInstance | null {
  for (const m of ship.modules) {
    for (const c of moduleCells(m)) if (c.level === level && c.x === x && c.z === z) return m;
  }
  return null;
}

/**
 * Módulo bajo el rayo (local) en el nivel seleccionado: primero por sus cajas (paredes,
 * muebles altos), luego por la celda del suelo. Considera los módulos del nivel y las escaleras
 * que suben desde el nivel inferior.
 */
export function pickModule(localRay: THREE.Ray, ship: ShipState, level: number): ModuleInstance | null {
  let best: ModuleInstance | null = null;
  let bestD = Infinity;
  for (const m of ship.modules) {
    const relevant = m.level === level || (m.type === 'escalera' && m.level === level - 1);
    if (!relevant) continue;
    moduleBox(m, ship.width, _box);
    if (m.level !== level) _box.max.y = levelY(level) + 0.2;
    const p = localRay.intersectBox(_box, _hit);
    if (!p) continue;
    const d = localRay.origin.distanceTo(p);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (best) return best;
  const hit = intersectLevel(localRay, level);
  if (!hit) return null;
  const { fx, fz } = continuousCell(hit.x, hit.z, ship.width);
  return moduleAtCell(ship, level, Math.floor(fx), Math.floor(fz));
}

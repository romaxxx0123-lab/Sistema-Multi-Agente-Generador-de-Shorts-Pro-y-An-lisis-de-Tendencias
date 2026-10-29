/**
 * Consultas de mobiliario para colocar personajes: dónde está cada cama (y a qué altura queda
 * el colchón) y dónde están las sillas. Se calculan a partir de los módulos con las mismas
 * funciones que usa `computeLayout`, así que coinciden exactamente con lo que se dibuja.
 */
import { moduleDef, type PropKind } from '../../data/modules';
import { levelY, localToShip, localYaw } from '../../sim/ship';
import type { GameState, ShipState } from '../../sim/types';

/** Altura del colchón sobre el suelo del nivel (coincide con los modelos de props.ts). */
export const MATTRESS_TOP = { cama: 0.41, litera: [0.49, 1.49], camilla: 0.67 } as const;
/** Color de la manta de cada cama (coincide con los modelos de props.ts). */
export const BLANKET_COLOR = { cama: '#2a9d8f', litera: ['#457b9d', '#bc4749'], camilla: '#f1ece0' } as const;

export interface BedPose {
  /** Punto de los pies (raíz del personaje tumbado). */
  x: number;
  y: number;
  z: number;
  /** Yaw de la raíz del personaje (cabeza hacia la cabecera). */
  yaw: number;
  kind: PropKind;
  blanket: string;
}

/**
 * Pose para dormir en la cama `bedIndex` de un módulo (cama, litera con dos alturas o camilla).
 * Devuelve null si el módulo no existe o no tiene esa cama.
 */
export function bedPose(ship: ShipState, moduleId: number, bedIndex: number): BedPose | null {
  const m = ship.modules.find((mm) => mm.id === moduleId);
  if (!m || m.status === 'construction') return null;
  const def = moduleDef(m.type);
  for (const p of def.props) {
    if (p.interact !== 'dormir') continue;
    const base = p.index ?? 0;
    let upper = 0;
    if (p.kind === 'litera') {
      if (bedIndex !== base && bedIndex !== base + 1) continue;
      upper = bedIndex - base;
    } else if (base !== bedIndex) continue;
    const pos = localToShip(m, p.u, p.v, ship.width);
    const yaw = localYaw(m.rot, p.rot);
    const hx = p.collider ? p.collider[0] : 1;
    // pies hacia +x local del prop (la cabecera está en -x)
    const fx = pos.x + Math.cos(yaw) * (hx - 0.14);
    const fz = pos.z - Math.sin(yaw) * (hx - 0.14);
    const top = p.kind === 'litera' ? MATTRESS_TOP.litera[upper]! : p.kind === 'camilla' ? MATTRESS_TOP.camilla : MATTRESS_TOP.cama;
    const blanket = p.kind === 'litera' ? BLANKET_COLOR.litera[upper]! : p.kind === 'camilla' ? BLANKET_COLOR.camilla : BLANKET_COLOR.cama;
    return { x: fx, y: levelY(m.level) + (p.y ?? 0) + top, z: fz, yaw: yaw - Math.PI / 2, kind: p.kind, blanket };
  }
  return null;
}

export interface Seat {
  x: number;
  y: number;
  z: number;
  /** Hacia dónde mira quien se sienta (yaw de three.js). */
  yaw: number;
  moduleId: number;
}

/** Sillas de los módulos activos. */
export function seatsOf(state: GameState): Seat[] {
  const out: Seat[] = [];
  for (const m of state.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    for (const p of def.props) {
      if (p.kind !== 'silla') continue;
      const pos = localToShip(m, p.u, p.v, state.ship.width);
      out.push({ x: pos.x, y: levelY(m.level) + (p.y ?? 0), z: pos.z, yaw: localYaw(m.rot, p.rot), moduleId: m.id });
    }
  }
  return out;
}

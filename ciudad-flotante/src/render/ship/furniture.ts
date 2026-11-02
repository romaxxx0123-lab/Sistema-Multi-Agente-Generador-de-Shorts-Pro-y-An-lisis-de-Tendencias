/**
 * Consultas de mobiliario para colocar personajes: dónde está cada cama (y a qué altura queda
 * el colchón), dónde están las sillas y las plazas de los sofás, y los taburetes de la mesa de
 * juegos. Se calculan a partir de los módulos con las mismas funciones que usa `computeLayout`
 * (y las mismas plazas que la IA, `SOFA_SEATS`), así que coinciden con lo que se dibuja.
 */
import { moduleDef, type PropKind } from '../../data/modules';
import { GAME_REACH, SOFA_SEAT_FORWARD, SOFA_SEATS } from '../../sim/npc';
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
  /** Silla, plaza de sofá o taburete de la mesa de juegos. */
  kind: 'silla' | 'sofa' | 'taburete';
}

/** Sillas y plazas de los sofás de los módulos terminados (donde se sientan a comer o a descansar). */
export function seatsOf(state: GameState): Seat[] {
  const out: Seat[] = [];
  for (const m of state.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    for (const p of def.props) {
      const y = levelY(m.level) + (p.y ?? 0);
      if (p.kind === 'silla') {
        const pos = localToShip(m, p.u, p.v, state.ship.width);
        out.push({ x: pos.x, y, z: pos.z, yaw: localYaw(m.rot, p.rot), moduleId: m.id, kind: 'silla' });
      } else if (p.kind === 'sofa') {
        // plazas a lo largo del eje largo, un poco adelantadas (como seatPose en sim/npc.ts)
        const F = SOFA_SEAT_FORWARD;
        for (const off of SOFA_SEATS) {
          const u = p.u + off * Math.cos(p.rot) - F * Math.sin(p.rot);
          const v = p.v - off * Math.sin(p.rot) - F * Math.cos(p.rot);
          const pos = localToShip(m, u, v, state.ship.width);
          out.push({ x: pos.x, y, z: pos.z, yaw: localYaw(m.rot, p.rot), moduleId: m.id, kind: 'sofa' });
        }
      }
    }
  }
  return out;
}

/**
 * Taburetes alrededor de las mesas de juegos (los cuatro puestos de los lados, a `GAME_REACH` del
 * centro, como dibuja props.ts). Cada uno mira a la mesa.
 */
export function gameStools(state: GameState): Seat[] {
  const out: Seat[] = [];
  for (const m of state.ship.modules) {
    if (m.status === 'construction') continue;
    const def = moduleDef(m.type);
    for (const p of def.props) {
      if (p.kind !== 'mesa_juegos') continue;
      const y = levelY(m.level) + (p.y ?? 0);
      const c = localToShip(m, p.u, p.v, state.ship.width);
      for (let i = 0; i < 4; i++) {
        const a = p.rot + (i * Math.PI) / 2;
        const pos = localToShip(m, p.u - Math.sin(a) * GAME_REACH, p.v - Math.cos(a) * GAME_REACH, state.ship.width);
        out.push({ x: pos.x, y, z: pos.z, yaw: Math.atan2(-(c.x - pos.x), -(c.z - pos.z)), moduleId: m.id, kind: 'taburete' });
      }
    }
  }
  return out;
}

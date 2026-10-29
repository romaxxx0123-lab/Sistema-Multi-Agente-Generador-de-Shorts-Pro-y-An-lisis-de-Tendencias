/**
 * [AGENTE game-player] CÁMARA EN TERCERA PERSONA (cálculo puro, sin three.js).
 *
 * Brazo de cámara detrás y por encima del hombro derecho del personaje. El brazo se acorta
 * cuando choca con paredes, barandillas o muebles altos (`cameraBoxes`), y nunca atraviesa el
 * techo de una habitación/bodega ni el suelo del nivel en el que está el jugador.
 *
 * Coordenadas: metros locales del barco (la cámara es hija de `shipRoot`).
 */
import { LEVEL_H, WALL_H } from '../../sim/constants';
import { cellAtPoint, levelOfY, levelY, type AABB, type ShipLayout } from '../../sim/ship';
import { inflate, lookDir, rayAabb, type V3 } from './aim';
import { cameraBoxes } from './targets';

/** Largo del brazo de cámara en tercera persona (m). */
export const ARM_LENGTH = 3.3;
/** Desplazamiento lateral hacia el hombro derecho (m). */
export const ARM_SHOULDER = 0.55;
/** Altura del pivote (cabeza) sobre los pies (m). */
export const ARM_PIVOT_Y = 1.58;
/** Radio de la "esfera" de la cámara para no rozar las paredes (m). */
export const CAMERA_RADIUS = 0.22;
/** Límites de cabeceo de la cámara en tercera persona (rad). */
export const THIRD_PITCH_MIN = -1.05;
export const THIRD_PITCH_MAX = 1.2;

export interface ArmInput {
  layout: ShipLayout;
  /** Pies del jugador. */
  feet: V3;
  yaw: number;
  pitch: number;
  /** Largo deseado del brazo (0 = primera persona). */
  length: number;
  /** Lado del hombro (1 derecho, -1 izquierdo, 0 centrado). */
  shoulder?: number;
}

export interface ArmResult {
  /** Posición final de la cámara. */
  pos: V3;
  /** Pivote (cabeza del personaje). */
  pivot: V3;
  /** Largo efectivo tras las colisiones (≤ length). */
  length: number;
  /** El brazo chocó con algo. */
  blocked: boolean;
}

/** Primer impacto (fracción 0..1 del segmento) contra cualquiera de las cajas; 1 si no hay. */
export function sweep(from: V3, to: V3, boxes: readonly AABB[], radius: number): number {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  let best = 1;
  for (const b of boxes) {
    const box = inflate(b, radius);
    // El pivote dentro de una caja (pegado a una pared) no debe anular el brazo entero.
    if (from.x > box.minX && from.x < box.maxX && from.y > box.minY && from.y < box.maxY && from.z > box.minZ && from.z < box.maxZ) continue;
    const t = rayAabb(from, d, box, best);
    if (t !== null && t < best) best = t;
  }
  return best;
}

/**
 * Techo y suelo útiles para la cámara en la posición del jugador: bajo cubierta o dentro de
 * una habitación la cámara no puede subir por encima del forjado.
 */
export function verticalLimits(layout: ShipLayout, feet: V3): { floor: number; ceil: number } {
  const level = Math.min(layout.levels - 1, levelOfY(feet.y));
  const floor = levelY(level);
  const cell = cellAtPoint(layout, feet.x, feet.y, feet.z);
  let ceil = Infinity;
  if (cell && cell.indoor) ceil = floor + (level === 0 ? LEVEL_H : WALL_H) - 0.18;
  return { floor: floor + 0.25, ceil };
}

/** Calcula la posición de la cámara en tercera persona con colisiones. */
export function computeArm(inp: ArmInput): ArmResult {
  const { layout, feet, yaw } = inp;
  const pitch = Math.max(THIRD_PITCH_MIN, Math.min(THIRD_PITCH_MAX, inp.pitch));
  const shoulder = (inp.shoulder ?? 1) * ARM_SHOULDER * Math.min(1, inp.length / 1.2);
  const lim = verticalLimits(layout, feet);
  const pivot: V3 = { x: feet.x, y: Math.min(feet.y + ARM_PIVOT_Y, lim.ceil - 0.05), z: feet.z };
  if (inp.length <= 1e-3) return { pos: { ...pivot }, pivot, length: 0, blocked: false };
  const boxes = cameraBoxes(layout);
  // 1) Del pivote al hombro (lateral).
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const sh: V3 = { x: pivot.x + rx * shoulder, y: pivot.y + 0.12, z: pivot.z + rz * shoulder };
  const ts = sweep(pivot, sh, boxes, CAMERA_RADIUS);
  const shoulderPt: V3 = { x: pivot.x + (sh.x - pivot.x) * ts, y: pivot.y + (sh.y - pivot.y) * ts, z: pivot.z + (sh.z - pivot.z) * ts };
  // 2) Del hombro hacia atrás, en sentido contrario a la mirada.
  const f = lookDir(yaw, pitch);
  const want: V3 = { x: shoulderPt.x - f.x * inp.length, y: shoulderPt.y - f.y * inp.length, z: shoulderPt.z - f.z * inp.length };
  const t = sweep(shoulderPt, want, boxes, CAMERA_RADIUS);
  let len = inp.length * t;
  // Margen para no quedar pegado a la superficie del choque.
  if (t < 1) len = Math.max(0, len - 0.05);
  const pos: V3 = { x: shoulderPt.x - f.x * len, y: shoulderPt.y - f.y * len, z: shoulderPt.z - f.z * len };
  // 3) Techo y suelo.
  if (pos.y > lim.ceil) pos.y = lim.ceil;
  if (pos.y < lim.floor) pos.y = lim.floor;
  return { pos, pivot, length: len, blocked: t < 1 || ts < 1 };
}

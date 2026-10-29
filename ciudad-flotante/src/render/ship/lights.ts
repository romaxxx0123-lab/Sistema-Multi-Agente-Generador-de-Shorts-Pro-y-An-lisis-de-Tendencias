/**
 * POOL DE LUCES PUNTUALES: un número fijo de PointLights (para no recompilar shaders) que se
 * asignan cada frame a las fuentes de luz más cercanas a la cámara (lámparas de habitaciones,
 * faroles de la bodega, fogón encendido, incendios). Las luces entran y salen con un fundido
 * para que no "salten" al reasignarse.
 */
import * as THREE from 'three';

export interface LightCandidate {
  /** Identificador estable (para no reasignar la misma fuente a otra luz). */
  id: string;
  x: number;
  y: number;
  z: number;
  level: number;
  /** Intensidad objetivo (candelas, luces físicas de three.js). */
  intensity: number;
  color: THREE.Color;
  distance: number;
  /** Metros "de ventaja" al ordenar (los incendios se ven desde más lejos). */
  priority: number;
}

interface Slot {
  light: THREE.PointLight;
  id: string | null;
  target: number;
  current: number;
}

export const LIGHT_POOL_SIZE = 6;

export class LightPool {
  private slots: Slot[] = [];

  constructor(parent: THREE.Object3D, size = LIGHT_POOL_SIZE) {
    for (let i = 0; i < size; i++) {
      const light = new THREE.PointLight('#ffcf8a', 0, 9, 2);
      light.castShadow = false;
      light.name = `luz-interior-${i}`;
      parent.add(light);
      this.slots.push({ light, id: null, target: 0, current: 0 });
    }
  }

  get lights(): THREE.PointLight[] {
    return this.slots.map((s) => s.light);
  }

  /** Asigna las luces a las mejores fuentes visibles y aplica el fundido. */
  update(cands: LightCandidate[], cam: THREE.Vector3, maxLevel: number, dt: number): void {
    const visible = cands.filter((c) => c.level <= maxLevel && c.intensity > 0.01);
    const scored = visible
      .map((c) => ({ c, d: Math.hypot(c.x - cam.x, (c.y - cam.y) * 1.6, c.z - cam.z) - c.priority }))
      .sort((a, b) => a.d - b.d)
      .slice(0, this.slots.length);
    const chosen = new Map(scored.map((s) => [s.c.id, s.c]));
    // Las luces que siguen eligidas mantienen su fuente.
    for (const s of this.slots) {
      if (s.id && chosen.has(s.id)) {
        const c = chosen.get(s.id)!;
        s.target = c.intensity;
        s.light.position.set(c.x, c.y, c.z);
        s.light.color.copy(c.color);
        s.light.distance = c.distance;
        chosen.delete(s.id);
      } else {
        s.target = 0;
      }
    }
    // Fuentes nuevas → luces libres (apagadas o casi).
    for (const c of chosen.values()) {
      const free = this.slots.find((s) => s.target === 0 && s.current < 0.05);
      if (!free) break;
      free.id = c.id;
      free.target = c.intensity;
      free.light.position.set(c.x, c.y, c.z);
      free.light.color.copy(c.color);
      free.light.distance = c.distance;
    }
    const rate = Math.min(1, dt * 5);
    for (const s of this.slots) {
      s.current += (s.target - s.current) * rate;
      if (s.target === 0 && s.current < 0.02) {
        s.current = 0;
        s.id = null;
      }
      s.light.intensity = s.current;
    }
  }

  dispose(): void {
    for (const s of this.slots) {
      s.light.removeFromParent();
      s.light.dispose();
    }
    this.slots = [];
  }
}

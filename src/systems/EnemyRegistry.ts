import { RapierRigidBody } from '@react-three/rapier';
import { Vector3 } from 'three';

/**
 * ENEMY REGISTRY
 * A non-reactive singleton to track enemy physics bodies and positions.
 * This avoids triggering React re-renders for 100+ moving entities.
 */

interface RegisteredEnemy {
  id: string;
  rb: RapierRigidBody;
  position: Vector3; // Cached position for performance
}

class EnemyRegistry {
  private enemies: Map<string, RegisteredEnemy> = new Map();
  private _tempVec = new Vector3();

  /**
   * Registers an enemy's physics body.
   */
  register(id: string, rb: RapierRigidBody) {
    const { x, y, z } = rb.translation();
    this.enemies.set(id, {
      id,
      rb,
      position: new Vector3(x, y, z)
    });
  }

  /**
   * Removes an enemy from the registry.
   */
  unregister(id: string) {
    this.enemies.delete(id);
  }

  /**
   * Updates the cached positions of all registered enemies.
   * Call this once per frame in the main loop.
   */
  updateAll() {
    this.enemies.forEach((enemy) => {
      const trans = enemy.rb.translation();
      enemy.position.set(trans.x, trans.y, trans.z);
    });
  }

  /**
   * Returns an array of all active enemies with their current positions.
   */
  getAll() {
    return Array.from(this.enemies.values());
  }

  /**
   * Returns a specific enemy by ID.
   */
  get(id: string) {
    return this.enemies.get(id);
  }

  /**
   * Finds the closest enemy to a given position within a range.
   */
  getClosest(pos: Vector3, range: number): RegisteredEnemy | null {
    let closest: RegisteredEnemy | null = null;
    let minDistSq = range * range;

    this.enemies.forEach((enemy) => {
      const dSq = pos.distanceToSquared(enemy.position);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        closest = enemy;
      }
    });

    return closest;
  }
}

export const enemyRegistry = new EnemyRegistry();

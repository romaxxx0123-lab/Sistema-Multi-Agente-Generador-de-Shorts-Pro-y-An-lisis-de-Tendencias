import { useMemo } from 'react';
import { ObjectPool } from '../systems/ObjectPool';

/**
 * REACT HOOK FOR OBJECT POOLING
 * Facilitates the use of the pooling system within React components.
 * Example:
 * const enemyPool = useObjectPool(
 *   () => createEnemy(),
 *   (enemy) => resetEnemy(enemy),
 *   50
 * );
 */
export function useObjectPool<T>(
  factory: () => T,
  reset: (obj: T) => void,
  initialSize: number = 10
) {
  return useMemo(
    () => new ObjectPool(factory, reset, initialSize),
    [] // Only create once per lifetime
  );
}

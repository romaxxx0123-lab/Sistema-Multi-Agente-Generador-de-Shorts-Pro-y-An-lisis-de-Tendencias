import { useEffect, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, EnemyEntity } from '../store/useGameStore';
import { Vector3 } from 'three';
import { CONFIG } from '../config';

/**
 * ENEMY SPAWNER SYSTEM
 * Automatically spawns enemies based on game time and difficulty.
 * Positions them in a ring around the player.
 */

const SPAWN_RADIUS = 15;
const INITIAL_SPAWN_RATE = 2.0; // Seconds between spawns

export function EnemySpawner() {
  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);
  const run = useGameStore((state) => state.run);

  const lastSpawnTime = useRef(0);
  const playerPos = useMemo(() => new Vector3(), []);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    lastSpawnTime.current += delta;

    // Scale spawn rate with level (gets faster)
    const spawnRate = Math.max(0.5, INITIAL_SPAWN_RATE - (run.level * 0.1));

    if (lastSpawnTime.current >= spawnRate) {
      lastSpawnTime.current = 0;

      // Get player world position
      playerRef.getWorldPosition(playerPos);

      // Calculate random spawn point on a circle
      const angle = Math.random() * Math.PI * 2;
      const x = playerPos.x + Math.cos(angle) * SPAWN_RADIUS;
      const z = playerPos.z + Math.sin(angle) * SPAWN_RADIUS;

      // Boundary check
      const halfSize = CONFIG.ARENA.SIZE / 2 - 2;
      const clampedX = Math.max(-halfSize, Math.min(halfSize, x));
      const clampedZ = Math.max(-halfSize, Math.min(halfSize, z));

      // Choose enemy type based on level
      let type: EnemyEntity['type'] = 'skeleton';
      const rand = Math.random();

      if (run.level >= 5 && rand > 0.7) type = 'oni';
      else if (run.level >= 3 && rand > 0.4) type = 'ninja';

      const hp = type === 'oni' ? 100 : (type === 'ninja' ? 40 : 20);

      spawnEnemy({
        id: Math.random().toString(36).substr(2, 9),
        type,
        position: [clampedX, 0.5, clampedZ],
        hp,
        maxHp: hp
      });
    }
  });

  return null;
}

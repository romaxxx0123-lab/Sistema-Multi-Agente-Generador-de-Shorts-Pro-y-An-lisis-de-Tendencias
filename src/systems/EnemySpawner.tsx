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

const SPAWN_RADIUS = 18;
const INITIAL_SPAWN_RATE = 2.5;

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

    // 1. Dynamic Spawn Rate (faster as time/level goes on)
    // Decreases 0.1s per level, minimum 0.4s
    const spawnRate = Math.max(0.4, INITIAL_SPAWN_RATE - (run.level * 0.15));

    if (lastSpawnTime.current >= spawnRate) {
      lastSpawnTime.current = 0;

      // 2. Spawn Multiplier (spawn more enemies at once at higher levels)
      const count = Math.floor(1 + (run.level / 4));

      playerRef.getWorldPosition(playerPos);

      for (let i = 0; i < count; i++) {
        // Calculate random spawn point on a circle with slight variation
        const angle = (Math.random() * Math.PI * 2);
        const distance = SPAWN_RADIUS + (Math.random() * 4 - 2);
        const x = playerPos.x + Math.cos(angle) * distance;
        const z = playerPos.z + Math.sin(angle) * distance;

        // Boundary check (keep inside arena)
        const halfSize = CONFIG.ARENA.SIZE / 2 - 2;
        const clampedX = Math.max(-halfSize, Math.min(halfSize, x));
        const clampedZ = Math.max(-halfSize, Math.min(halfSize, z));

        // 3. Enemy Type Logic (Tiered System)
        let type: EnemyEntity['type'] = 'skeleton';
        const tierRoll = Math.random() + (run.level * 0.05); // Bonus roll per level

        if (tierRoll > 1.8) {
          type = 'oni';
        } else if (tierRoll > 1.2) {
          type = 'ninja';
        }

        // 4. HP Scaling (Base + 10% per level)
        const baseHp = type === 'oni' ? 120 : (type === 'ninja' ? 50 : 25);
        const scaledHp = Math.round(baseHp * (1 + (run.level - 1) * 0.15));

        spawnEnemy({
          id: `enemy-${Math.random().toString(36).substring(2, 9)}`,
          type,
          position: [clampedX, 0.5, clampedZ],
          hp: scaledHp,
          maxHp: scaledHp
        });
      }
    }
  });

  return null;
}

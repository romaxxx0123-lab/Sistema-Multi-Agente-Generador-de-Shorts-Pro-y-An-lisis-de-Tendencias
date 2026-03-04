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

// WAVE DEFINITIONS
// Each wave is 60 seconds.
const WAVES = [
  { id: 1, name: "The Swarm", types: ['skeleton'], eliteChance: 0, spawnRate: 2.5, groupSize: [2, 4] },
  { id: 2, name: "The Assassins", types: ['skeleton', 'ninja'], eliteChance: 0.05, spawnRate: 1.8, groupSize: [1, 3] },
  { id: 3, name: "The Heavy Guard", types: ['oni', 'skeleton'], eliteChance: 0.1, spawnRate: 3.0, groupSize: [1, 2] },
  { id: 4, name: "Royal Guard", types: ['samurai', 'ninja'], eliteChance: 0.15, spawnRate: 2.2, groupSize: [1, 2] },
  { id: 5, name: "Total War", types: ['skeleton', 'ninja', 'oni', 'samurai'], eliteChance: 0.2, spawnRate: 1.2, groupSize: [2, 5] },
];

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

    // 1. Determine Wave
    const waveIndex = Math.min(WAVES.length - 1, Math.floor(run.time / 60));
    const currentWave = WAVES[waveIndex];

    // 2. Wave Progression & Scaling
    // Waves get 10% faster and 10% stronger per loop (post Wave 5)
    const cycle = Math.floor(run.time / 300); // 5 min cycle
    const difficultyMultiplier = 1 + (cycle * 0.1);
    const spawnRate = currentWave.spawnRate / (difficultyMultiplier);

    if (lastSpawnTime.current >= spawnRate) {
      lastSpawnTime.current = 0;

      // 3. Spawn Count (Randomized per wave def)
      const [min, max] = currentWave.groupSize;
      const count = Math.floor(min + Math.random() * (max - min + 1));

      playerRef.getWorldPosition(playerPos);

      for (let i = 0; i < count; i++) {
        const angle = (Math.random() * Math.PI * 2);
        const distance = SPAWN_RADIUS + (Math.random() * 4 - 2);
        const x = playerPos.x + Math.cos(angle) * distance;
        const z = playerPos.z + Math.sin(angle) * distance;

        const halfSize = CONFIG.ARENA.SIZE / 2 - 2;
        const clampedX = Math.max(-halfSize, Math.min(halfSize, x));
        const clampedZ = Math.max(-halfSize, Math.min(halfSize, z));

        // 4. Randomized Enemy from Wave Pool
        const typeIndex = Math.floor(Math.random() * currentWave.types.length);
        const type = currentWave.types[typeIndex] as EnemyEntity['type'];

        // 5. Elite Calculation
        const isElite = Math.random() < currentWave.eliteChance;

        // 6. Final HP Scaling (Wave Base + Level Scaling + Cycle Scaling)
        const waveBaseHp = 25 * (waveIndex + 1); // Progression based on wave
        const typeMultiplier = type === 'oni' ? 4 : (type === 'samurai' ? 3 : (type === 'ninja' ? 1.5 : 1));
        const levelScaling = 1 + (run.level - 1) * 0.1;

        let finalHp = Math.round(waveBaseHp * typeMultiplier * levelScaling * difficultyMultiplier);
        if (isElite) finalHp *= 2;

        spawnEnemy({
          id: `enemy-${Math.random().toString(36).substring(2, 9)}`,
          type,
          position: [clampedX, 0.5, clampedZ],
          hp: finalHp,
          maxHp: finalHp,
          isElite
        });
      }
    }
  });

  return null;
}

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, EnemyEntity, PickupEntity } from '../store/useGameStore';
import { Vector3 } from 'three';
import { CONFIG } from '../config';
import { TIMELINE } from '../data/waves';
import { ObjectPool } from './ObjectPool';

const SPAWN_RADIUS = 20;

export function EnemySpawner() {
  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);
  const spawnPickup = useGameStore((state) => state.spawnPickup);
  const run = useGameStore((state) => state.run);

  const lastSpawnTime = useRef(0);
  const playerPos = useMemo(() => new Vector3(), []);
  const spawnedBoss = useRef<string | null>(null);

  // 1. Initialize Object Pool for Enemy Data objects
  // Note: We still use the store for the 'enemies' array to trigger rendering,
  // but we reuse the object instances to reduce GC pressure.
  const pool = useMemo(() => new ObjectPool<EnemyEntity>(
    () => ({
        id: '',
        type: 'skeleton',
        position: [0, 0, 0],
        hp: 0,
        maxHp: 0
    }),
    (e) => {
        e.id = '';
        e.isElite = false;
        e.isBoss = false;
    },
    100
  ), []);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    lastSpawnTime.current += delta;
    playerRef.getWorldPosition(playerPos);

    // 1. Get current wave segment
    const segment = TIMELINE.find(s => run.time >= s.tStart && run.time < s.tEnd);
    if (!segment) return;

    // 2. Boss Logic
    if (segment.boss && spawnedBoss.current !== segment.waveName) {
        spawnedBoss.current = segment.waveName!;

        const angle = Math.random() * Math.PI * 2;
        const boss = pool.get();
        boss.id = `boss-${segment.waveName}`;
        boss.type = segment.boss.type;
        boss.position = [playerPos.x + Math.cos(angle) * 10, 0.5, playerPos.z + Math.sin(angle) * 10];
        boss.hp = 500 * segment.boss.hpMultiplier;
        boss.maxHp = 500 * segment.boss.hpMultiplier;
        boss.isBoss = true;

        spawnEnemy(boss);
    }

    // 3. Chest Logic
    if (segment.chestEvent && Math.floor(run.time) % 60 === 0 && Math.random() < 0.01) {
        const angle = Math.random() * Math.PI * 2;
        spawnPickup({
            id: `chest-${run.time}`,
            type: 'chest',
            position: [playerPos.x + Math.cos(angle) * 5, 0.5, playerPos.z + Math.sin(angle) * 5],
            value: 1
        });
    }

    // 4. Regular Spawning
    if (lastSpawnTime.current >= segment.spawnRate) {
      lastSpawnTime.current = 0;

      const angle = (Math.random() * Math.PI * 2);
      const x = playerPos.x + Math.cos(angle) * SPAWN_RADIUS;
      const z = playerPos.z + Math.sin(angle) * SPAWN_RADIUS;

      const halfSize = CONFIG.ARENA.SIZE / 2 - 2;
      const clampedX = Math.max(-halfSize, Math.min(halfSize, x));
      const clampedZ = Math.max(-halfSize, Math.min(halfSize, z));

      // Weighted random type selection
      const rand = Math.random();
      let cumulativeWeight = 0;
      let type: EnemyEntity['type'] = 'skeleton';

      for (const mix of segment.enemyMix) {
          cumulativeWeight += mix.weight;
          if (rand < cumulativeWeight) {
              type = mix.type;
              break;
          }
      }

      const isElite = Math.random() < segment.eliteChance;
      const hp = (isElite ? 200 : 50) * (1 + (run.time / 300));

      const enemy = pool.get();
      enemy.id = `enemy-${Math.random().toString(36).substring(2, 9)}`;
      enemy.type = type;
      enemy.position = [clampedX, 0.5, clampedZ];
      enemy.hp = hp;
      enemy.maxHp = hp;
      enemy.isElite = isElite;

      spawnEnemy(enemy);
    }
  });

  return null;
}

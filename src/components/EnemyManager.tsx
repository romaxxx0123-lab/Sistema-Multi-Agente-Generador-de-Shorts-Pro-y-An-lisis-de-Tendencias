import { useState, useRef, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';
import { Enemy } from './Enemy';
import { ExperienceGem } from './ExperienceGem';

interface EnemyData {
  id: string;
  type: 'slime' | 'skeleton';
  position: [number, number, number];
}

interface GemData {
  id: string;
  position: Vector3;
  amount: number;
}

export const EnemyManager = () => {
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const [gems, setGems] = useState<GemData[]>([]);
  const spawnTimer = useRef(0);
  const difficultyTimer = useRef(0);
  const enemyIdCounter = useRef(0);
  const gemIdCounter = useRef(0);

  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);

  const spawnWave = useCallback(() => {
    if (!playerRef) return;

    const timeElapsed = difficultyTimer.current;
    const waveSize = GAME_CONFIG.SPAWN.INITIAL_COUNT +
      Math.floor(timeElapsed / GAME_CONFIG.SPAWN.INCREASE_INTERVAL) * GAME_CONFIG.SPAWN.INCREASE_RATE;

    const newEnemies: EnemyData[] = [];
    for (let i = 0; i < waveSize; i++) {
      // Find a random point on the arena edge
      const side = Math.floor(Math.random() * 4);
      const halfSize = GAME_CONFIG.ARENA.SIZE / 2;
      let x = 0, z = 0;

      switch (side) {
        case 0: // North
          x = (Math.random() - 0.5) * GAME_CONFIG.ARENA.SIZE;
          z = -halfSize;
          break;
        case 1: // South
          x = (Math.random() - 0.5) * GAME_CONFIG.ARENA.SIZE;
          z = halfSize;
          break;
        case 2: // East
          x = halfSize;
          z = (Math.random() - 0.5) * GAME_CONFIG.ARENA.SIZE;
          break;
        case 3: // West
          x = -halfSize;
          z = (Math.random() - 0.5) * GAME_CONFIG.ARENA.SIZE;
          break;
      }

      const type = Math.random() < GAME_CONFIG.SPAWN.SLIME_RATIO ? 'slime' : 'skeleton';
      newEnemies.push({
        id: `enemy-${enemyIdCounter.current++}`,
        type,
        position: [x, 1, z],
      });
    }

    setEnemies((prev) => [...prev, ...newEnemies]);
  }, [playerRef]);

  const handleEnemyDeath = useCallback((id: string, position: Vector3, xp: number) => {
    setEnemies((prev) => prev.filter((e) => e.id !== id));
    setGems((prev) => [...prev, {
      id: `gem-${gemIdCounter.current++}`,
      position,
      amount: xp,
    }]);
  }, []);

  const handleGemCollect = useCallback((id: string) => {
    setGems((prev) => prev.filter((g) => g.id !== id));
  }, []);

  useFrame((_state, delta) => {
    if (status !== 'playing') return;

    difficultyTimer.current += delta;
    spawnTimer.current += delta;

    if (spawnTimer.current >= GAME_CONFIG.SPAWN.INTERVAL) {
      spawnWave();
      spawnTimer.current = 0;
    }
  });

  return (
    <>
      {enemies.map((enemy) => (
        <Enemy
          key={enemy.id}
          id={enemy.id}
          type={enemy.type}
          initialPosition={enemy.position}
          onDeath={handleEnemyDeath}
        />
      ))}
      {gems.map((gem) => (
        <ExperienceGem
          key={gem.id}
          id={gem.id}
          position={gem.position}
          amount={gem.amount}
          onCollect={handleGemCollect}
        />
      ))}
    </>
  );
};

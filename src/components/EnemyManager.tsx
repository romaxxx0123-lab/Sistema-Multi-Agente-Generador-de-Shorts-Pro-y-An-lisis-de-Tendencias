import { useState, useRef, useCallback, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';
import { Enemy } from './Enemy';
import { BossOni } from './BossOni';
import { BossShogun } from './BossShogun';
import { ExperienceGem } from './ExperienceGem';
import { Coin } from './Coin';

interface EnemyData {
  id: string;
  type: 'slime' | 'skeleton' | 'bat' | 'ogre' | 'ninja' | 'mage' | 'mini_oni';
  position: [number, number, number];
}

interface GemData {
  id: string;
  position: Vector3;
  amount: number;
}

interface CoinData {
  id: string;
  position: Vector3;
  amount: number;
}

interface ProjectileData {
  id: string;
  position: Vector3;
  direction: Vector3;
  damage: number;
  speed: number;
}

export const EnemyManager = () => {
  const [enemies, setEnemies] = useState<EnemyData[]>([]);
  const [gems, setGems] = useState<GemData[]>([]);
  const [coins, setCoins] = useState<CoinData[]>([]);
  const [projectiles, setProjectiles] = useState<ProjectileData[]>([]);
  const spawnTimer = useRef(0);
  const difficultyTimer = useRef(0);
  const enemyIdCounter = useRef(0);
  const gemIdCounter = useRef(0);
  const coinIdCounter = useRef(0);
  const projIdCounter = useRef(0);

  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const gameTime = useGameStore((state) => state.gameTime);
  const setGameTime = useGameStore((state) => state.setGameTime);
  const spawnBossAction = useGameStore((state) => state.spawnBoss);
  const bossActive = useGameStore((state) => state.bossActive);

  // Listen for enemy targets (Lightning)
  useEffect(() => {
    const handleLightningTarget = (e: any) => {
      if (enemies.length === 0) return;
      const { position, range, callback } = e.detail;
      const nearby = enemies.filter(eData => {
         const dist = new Vector3(...eData.position).distanceTo(position);
         return dist <= range;
      });
      if (nearby.length > 0) {
        // Find closest
        nearby.sort((a,b) => new Vector3(...a.position).distanceTo(position) - new Vector3(...b.position).distanceTo(position));
        const closest = nearby[0];
        // Dispatch event specifically for THIS enemy
        window.dispatchEvent(new CustomEvent('lightning-hit', {
          detail: {
            enemyId: closest.id,
            damage: e.detail.damage,
            position: new Vector3(...closest.position)
          }
        }));
        // Provide feedback to the ability component
        callback(new Vector3(...closest.position));
      }
    };

    const handleSpawnRequest = (e: any) => {
      const { count, type, position } = e.detail;
      const newEnemies: EnemyData[] = [];
      for (let i = 0; i < count; i++) {
        newEnemies.push({
          id: `enemy-${enemyIdCounter.current++}`,
          type,
          position: [position.x + (Math.random()-0.5)*5, 1, position.z + (Math.random()-0.5)*5],
        });
      }
      setEnemies(prev => [...prev, ...newEnemies]);
    };

    const handleProjectile = (e: any) => {
        setProjectiles(prev => [...prev, { id: `proj-${projIdCounter.current++}`, ...e.detail }]);
    };

    const handleNearestEnemy = (e: any) => {
        if (enemies.length === 0) return;
        const { position, callback } = e.detail;
        const sorted = [...enemies].sort((a,b) => new Vector3(...a.position).distanceTo(position) - new Vector3(...b.position).distanceTo(position));
        callback(new Vector3(...sorted[0].position));
    };

    window.addEventListener('request-lightning-target', handleLightningTarget);
    window.addEventListener('request-spawn-enemies', handleSpawnRequest);
    window.addEventListener('enemy-projectile', handleProjectile);
    window.addEventListener('request-nearest-enemy', handleNearestEnemy);
    return () => {
      window.removeEventListener('request-lightning-target', handleLightningTarget);
      window.removeEventListener('request-spawn-enemies', handleSpawnRequest);
      window.removeEventListener('enemy-projectile', handleProjectile);
      window.removeEventListener('request-nearest-enemy', handleNearestEnemy);
    };
  }, [enemies]);

  const spawnWave = useCallback(() => {
    if (!playerRef) return;

    const timeElapsed = difficultyTimer.current;
    const diffCfg = (GAME_CONFIG.DIFFICULTIES as any)[useGameStore.getState().difficulty.toUpperCase()];
    const baseWave = GAME_CONFIG.SPAWN.INITIAL_COUNT +
      Math.floor(timeElapsed / GAME_CONFIG.SPAWN.INCREASE_INTERVAL) * GAME_CONFIG.SPAWN.INCREASE_RATE;
    const waveSize = Math.floor(baseWave * diffCfg.spawnMult);

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

      const rand = Math.random();
      let type: EnemyData['type'] = 'slime';
      const ratios = GAME_CONFIG.SPAWN.RATIOS;

      if (rand < ratios.MINI_ONI) type = 'mini_oni';
      else if (rand < ratios.MINI_ONI + ratios.OGRE) type = 'ogre';
      else if (rand < ratios.MINI_ONI + ratios.OGRE + ratios.MAGE) type = 'mage';
      else if (rand < ratios.MINI_ONI + ratios.OGRE + ratios.MAGE + ratios.NINJA) type = 'ninja';
      else if (rand < ratios.MINI_ONI + ratios.OGRE + ratios.MAGE + ratios.NINJA + ratios.BAT) type = 'bat';
      else if (rand < ratios.MINI_ONI + ratios.OGRE + ratios.MAGE + ratios.NINJA + ratios.BAT + ratios.SKELETON) type = 'skeleton';
      newEnemies.push({
        id: `enemy-${enemyIdCounter.current++}`,
        type,
        position: [x, 1, z],
      });
    }

    setEnemies((prev) => [...prev, ...newEnemies]);
  }, [playerRef]);

  const handleEnemyDeath = useCallback((id: string, position: Vector3, xp: number, coinsIn: number) => {
    setEnemies((prev) => prev.filter((e) => e.id !== id));
    setGems((prev) => [...prev, {
      id: `gem-${gemIdCounter.current++}`,
      position,
      amount: xp,
    }]);
    if (coinsIn > 0) {
        setCoins(prev => [...prev, {
            id: `coin-${coinIdCounter.current++}`,
            position,
            amount: coinsIn
        }]);
    }
  }, []);

  const handleGemCollect = useCallback((id: string) => {
    setGems((prev) => prev.filter((g) => g.id !== id));
  }, []);

  useFrame((_state, delta) => {
    if (status !== 'playing') return;

    setGameTime(prev => prev + delta);

    // Projectile Movement
    setProjectiles(prev => {
        const next = [];
        for (const p of prev) {
            const move = p.direction.clone().multiplyScalar(p.speed * delta);
            const newPos = p.position.clone().add(move);

            // Hit check
            if (playerRef && newPos.distanceTo(playerRef.position) < 1.0) {
                useGameStore.getState().takeDamage(p.damage);
                continue; // Destroy
            }
            if (newPos.length() > 60) continue; // Cleanup
            next.push({ ...p, position: newPos });
        }
        return next;
    });
    difficultyTimer.current += delta;
    spawnTimer.current += delta;

    if (spawnTimer.current >= GAME_CONFIG.SPAWN.INTERVAL) {
      if (enemies.length < GAME_CONFIG.SPAWN.MAX_SIMULTANEOUS) {
        spawnWave();
      }
      spawnTimer.current = 0;
    }

    // Trigger Boss
    if (!bossActive) {
        if (difficultyTimer.current >= GAME_CONFIG.BOSS.SHOGUN.SPAWN_TIME && bossesDefeated === 1) {
            spawnBossAction('SHOGUN');
        } else if (difficultyTimer.current >= GAME_CONFIG.BOSS.ONI.SPAWN_TIME && bossesDefeated === 0) {
            spawnBossAction('ONI');
        }
    }
  });

  const bossesDefeated = useGameStore(s => s.bossesDefeated);

  return (
    <>
      {bossActive && (bossesDefeated === 0 ? <BossOni /> : <BossShogun />)}
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
      {coins.map((c) => (
          <Coin key={c.id} id={c.id} position={c.position} amount={c.amount} onCollect={(id) => setCoins(prev => prev.filter(x => x.id !== id))} />
      ))}
      {projectiles.map(p => (
          <mesh key={p.id} position={[p.position.x, 1, p.position.z]}>
              <sphereGeometry args={[0.2, 8, 8]} />
              <meshBasicMaterial color="#ef4444" />
          </mesh>
      ))}
    </>
  );
};

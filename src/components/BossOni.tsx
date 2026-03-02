import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

type BossState = 'idle' | 'charging' | 'slamming' | 'summoning' | 'jumping';

export const BossOni = () => {
  const [state, setState] = useState<BossState>('idle');
  const [hp, setHp] = useState(GAME_CONFIG.BOSS.ONI.HP);
  const [isHit, setIsHit] = useState(false);
  const hitFlashTimer = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageBossAction = useGameStore((state) => state.damageBoss);

  const timer = useRef(0);
  const cooldowns = useRef({
    charge: 0,
    slam: 0,
    summon: 0,
    jump: 0
  });

  const config = GAME_CONFIG.BOSS.ONI;

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 100,
    position: [0, 2, 0],
    args: [config.SCALE / 2],
    fixedRotation: true,
  }));

  const isF2 = hp < config.HP / 2;

  const takeDamage = useCallback((amount: number) => {
    setHp((prev: number) => Math.max(0, prev - amount));
    damageBossAction(amount);
    setIsHit(true);
    hitFlashTimer.current = 0.1;
  }, [damageBossAction]);

  useEffect(() => {
    const handleAttack = (e: any) => {
      if (!ref.current || hp <= 0) return;
      const { position, range, damage } = e.detail;
      const bossPos = ref.current.position;
      const distance = new Vector3().subVectors(bossPos, position).length();
      if (distance <= range + config.SCALE / 2) {
         takeDamage(damage);
      }
    };
    window.addEventListener('player-attack', handleAttack);
    return () => window.removeEventListener('player-attack', handleAttack);
  }, [hp, takeDamage, config.SCALE]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || hp <= 0 || !playerRef || !ref.current) return;

    const bossPos = ref.current.position;
    const playerPos = playerRef.position;
    const toPlayer = new Vector3().subVectors(playerPos, bossPos);
    const distance = toPlayer.length();

    // 1. Cooldown Management
    Object.keys(cooldowns.current).forEach(k => {
      cooldowns.current[k as keyof typeof cooldowns.current] -= delta;
    });

    // 2. State Machine
    if (state === 'idle') {
      // Rotate to face player
      api.velocity.set(0, 0, 0);

      // Choose next move
      // Note: In Part 4 config, Boss stats are nested under ONI/SHOGUN
      // To keep BossOni simple, we'll hardcode the Part 3 attack params or pass them
      // Since I changed the config, I need to update these references
      const atk = (GAME_CONFIG.BOSS as any).ONI_ATTACKS || { // Fallback or use local constants
         CHARGE: { COOLDOWN_F1: 8, COOLDOWN_F2: 5, SPEED: 8, DURATION: 2, DAMAGE: 30 },
         SLAM: { COOLDOWN_F1: 10, COOLDOWN_F2: 5, RADIUS: 5, DAMAGE: 40, WARNING_TIME: 1 },
         SUMMON: { COOLDOWN_F1: 15, COOLDOWN_F2: 12, COUNT_F1: 5, COUNT_F2: 10 },
         JUMP: { COOLDOWN_F2: 20, HEIGHT: 3, RADIUS: 8, DAMAGE: 50 }
      };

      if (isF2 && cooldowns.current.jump <= 0) {
        startJump();
      } else if (cooldowns.current.charge <= 0) {
        startCharge();
      } else if (cooldowns.current.slam <= 0) {
        startSlam();
      } else if (cooldowns.current.summon <= 0) {
        startSummon();
      } else {
        // Move slowly towards player
        const dir = toPlayer.clone().normalize();
        api.velocity.set(dir.x * config.SPEED, 0, dir.z * config.SPEED);
      }
    } else if (state === 'charging') {
      timer.current -= delta;
      if (timer.current <= 0) {
        setState('idle');
        cooldowns.current.charge = isF2 ? 5 : 8;
      }
    } else if (state === 'slamming') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeSlam();
        setState('idle');
        cooldowns.current.slam = isF2 ? 5 : 10;
      }
    } else if (state === 'summoning') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeSummon();
        setState('idle');
        cooldowns.current.summon = isF2 ? 12 : 15;
      }
    } else if (state === 'jumping') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeJumpLand();
        setState('idle');
        cooldowns.current.jump = 20;
      }
    }

    if (hitFlashTimer.current > 0) {
      hitFlashTimer.current -= delta;
      if (hitFlashTimer.current <= 0) setIsHit(false);
    }
  });

  const startCharge = () => {
    setState('charging');
    timer.current = 2; // duration
    const dir = new Vector3().subVectors(playerRef!.position, ref.current!.position).normalize();
    api.velocity.set(dir.x * 8, 0, dir.z * 8);
  };

  const startSlam = () => {
    setState('slamming');
    timer.current = 1; // warning time
    api.velocity.set(0, 0, 0);
  };

  const executeSlam = () => {
    const dist = new Vector3().subVectors(playerRef!.position, ref.current!.position).length();
    if (dist < 5 + config.SCALE / 2) {
      useGameStore.getState().takeDamage(40);
      window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 10 } }));
    }
  };

  const startSummon = () => {
    setState('summoning');
    timer.current = 1.0;
    api.velocity.set(0, 0, 0);
  };

  const executeSummon = () => {
    const count = isF2 ? 10 : 5;
    window.dispatchEvent(new CustomEvent('request-spawn-enemies', { detail: { count, type: 'slime', position: ref.current!.position.clone() } }));
  };

  const startJump = () => {
    setState('jumping');
    timer.current = 2.0;
    api.velocity.set(0, 10, 0);
  };

  const executeJumpLand = () => {
    const dist = new Vector3().subVectors(playerRef!.position, ref.current!.position).length();
    if (dist < 8 + config.SCALE / 2) {
      useGameStore.getState().takeDamage(50);
      window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 15 } }));
    }
    api.position.set(playerRef!.position.x, 2, playerRef!.position.z);
  };

  if (hp <= 0) return null;

  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[config.SCALE, config.SCALE, config.SCALE]} />
      <meshStandardMaterial color={isHit ? "white" : (isF2 ? "#991b1b" : config.COLOR)} />

      {/* Visual Indicator for AOE Slam/Jump */}
      {(state === 'slamming' || state === 'jumping') && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -config.SCALE / 2 + 0.1, 0]}>
          <ringGeometry args={[0, state === 'slamming' ? 5 : 8, 32]} />
          <meshBasicMaterial color="red" transparent opacity={0.3} />
        </mesh>
      )}
    </mesh>
  );
};

import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

type BossState = 'idle' | 'charging' | 'slamming' | 'summoning' | 'jumping';

export const BossOni = () => {
  const [state, setState] = useState<BossState>('idle');
  const [hp, setHp] = useState(GAME_CONFIG.BOSS.HP);
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

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 100,
    position: [0, 2, 0],
    args: [GAME_CONFIG.BOSS.SCALE / 2],
    fixedRotation: true,
  }));

  const isF2 = hp < GAME_CONFIG.BOSS.HP / 2;
  const config = GAME_CONFIG.BOSS;

  const takeDamage = useCallback((amount: number) => {
    setHp((prev) => Math.max(0, prev - amount));
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
        cooldowns.current.charge = isF2 ? config.ATTACKS.CHARGE.COOLDOWN_F2 : config.ATTACKS.CHARGE.COOLDOWN_F1;
      }
      // Physics handled by impulse/velocity set once or continuous
    } else if (state === 'slamming') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeSlam();
        setState('idle');
        cooldowns.current.slam = isF2 ? config.ATTACKS.SLAM.COOLDOWN_F2 : config.ATTACKS.SLAM.COOLDOWN_F1;
      }
    } else if (state === 'summoning') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeSummon();
        setState('idle');
        cooldowns.current.summon = isF2 ? config.ATTACKS.SUMMON.COOLDOWN_F2 : config.ATTACKS.SUMMON.COOLDOWN_F1;
      }
    } else if (state === 'jumping') {
      timer.current -= delta;
      if (timer.current <= 0) {
        executeJumpLand();
        setState('idle');
        cooldowns.current.jump = config.ATTACKS.JUMP.COOLDOWN_F2;
      }
    }

    if (hitFlashTimer.current > 0) {
      hitFlashTimer.current -= delta;
      if (hitFlashTimer.current <= 0) setIsHit(false);
    }
  });

  const startCharge = () => {
    setState('charging');
    timer.current = config.ATTACKS.CHARGE.DURATION;
    const dir = new Vector3().subVectors(playerRef!.position, ref.current!.position).normalize();
    api.velocity.set(dir.x * config.ATTACKS.CHARGE.SPEED, 0, dir.z * config.ATTACKS.CHARGE.SPEED);
  };

  const startSlam = () => {
    setState('slamming');
    timer.current = config.ATTACKS.SLAM.WARNING_TIME;
    api.velocity.set(0, 0, 0);
  };

  const executeSlam = () => {
    const dist = new Vector3().subVectors(playerRef!.position, ref.current!.position).length();
    if (dist < config.ATTACKS.SLAM.RADIUS + config.SCALE / 2) {
      useGameStore.getState().takeDamage(config.ATTACKS.SLAM.DAMAGE);
      window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 10 } }));
    }
  };

  const startSummon = () => {
    setState('summoning');
    timer.current = 1.0;
    api.velocity.set(0, 0, 0);
  };

  const executeSummon = () => {
    const count = isF2 ? config.ATTACKS.SUMMON.COUNT_F2 : config.ATTACKS.SUMMON.COUNT_F1;
    window.dispatchEvent(new CustomEvent('request-spawn-enemies', { detail: { count, type: 'slime', position: ref.current!.position.clone() } }));
  };

  const startJump = () => {
    setState('jumping');
    timer.current = 2.0;
    api.velocity.set(0, 10, 0);
  };

  const executeJumpLand = () => {
    const dist = new Vector3().subVectors(playerRef!.position, ref.current!.position).length();
    if (dist < config.ATTACKS.JUMP.RADIUS + config.SCALE / 2) {
      useGameStore.getState().takeDamage(config.ATTACKS.JUMP.DAMAGE);
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
          <ringGeometry args={[0, state === 'slamming' ? config.ATTACKS.SLAM.RADIUS : config.ATTACKS.JUMP.RADIUS, 32]} />
          <meshBasicMaterial color="red" transparent opacity={0.3} />
        </mesh>
      )}
    </mesh>
  );
};

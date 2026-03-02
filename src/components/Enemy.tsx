import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

interface EnemyProps {
  id: string;
  type: 'slime' | 'skeleton' | 'bat' | 'ogre';
  initialPosition: [number, number, number];
  onDeath: (id: string, position: Vector3, xp: number) => void;
}

export const Enemy = ({ id, type, initialPosition, onDeath }: EnemyProps) => {
  const config = (GAME_CONFIG.ENEMIES as any)[type.toUpperCase()];
  const [hp, setHp] = useState(config.HP);
  const [isHit, setIsHit] = useState(false);
  const hitFlashTimer = useRef(0);
  const damageTimer = useRef(0);
  const zigzagTimer = useRef(0);
  const zigzagDir = useRef(1);
  const knockbackTimer = useRef(0);
  const burnTimer = useRef(0);
  const burnDamageTimer = useRef(0);
  const burnDamage = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const takeDamageAction = useGameStore((state) => state.takeDamage);
  const addKill = useGameStore((state) => state.addKill);

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 1,
    position: initialPosition,
    args: [config.RADIUS],
    fixedRotation: true,
  }));

  const takeDamage = useCallback((amount: number) => {
    setHp((prev: number) => {
      const newHp = prev - amount;
      return Math.max(0, newHp);
    });
    setIsHit(true);
    hitFlashTimer.current = GAME_CONFIG.COMBAT.HIT_FLASH_DURATION;

    // Ogre Knockback
    if (type === 'ogre' && amount >= (config as any).KNOCKBACK_THRESHOLD) {
      knockbackTimer.current = 0.5;
    }
  }, [type, config]);

  const applyBurn = useCallback((damage: number, duration: number) => {
    burnTimer.current = duration;
    burnDamage.current = damage;
    burnDamageTimer.current = 0;
  }, []);

  // Listen for player attacks and lightning strikes
  useEffect(() => {
    const handleAttack = (e: any) => {
      if (!ref.current || hp <= 0) return;

      const { position, forward, range, damage, angle, burn } = e.detail;
      const enemyPos = (ref.current as any).position;

      const toEnemy = new Vector3().subVectors(enemyPos, position);
      const distance = toEnemy.length();

      if (distance <= range) {
        if (!forward) {
          // AOE attack (Flame Aura)
          takeDamage(damage);
          if (burn) applyBurn(burn.damage, burn.duration);
        } else {
          toEnemy.normalize();
          const dot = toEnemy.dot(forward);
          if (dot >= Math.cos(angle / 2)) {
            takeDamage(damage);
            if (burn) applyBurn(burn.damage, burn.duration);
          }
        }
      }
    };

    const handleLightningHit = (e: any) => {
      if (e.detail.enemyId === id) {
        takeDamage(e.detail.damage);
      }
    };

    window.addEventListener('player-attack', handleAttack);
    window.addEventListener('lightning-hit', handleLightningHit);
    return () => {
      window.removeEventListener('player-attack', handleAttack);
      window.removeEventListener('lightning-hit', handleLightningHit);
    };
  }, [hp, id, takeDamage, applyBurn, ref]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || hp <= 0 || !playerRef || !ref.current) return;

    const enemyPos = ref.current.position;
    const playerPos = playerRef.position;

    // 1. Calculate direction to player
    const direction = new Vector3().subVectors(playerPos, enemyPos);
    const distance = direction.length();
    direction.y = 0;
    direction.normalize();

    // 2. Specialized movement
    let velocity = direction.clone().multiplyScalar(config.SPEED);

    if (type === 'bat') {
      // Zigzag movement
      zigzagTimer.current += delta;
      if (zigzagTimer.current >= 0.5) {
        zigzagDir.current *= -1;
        zigzagTimer.current = 0;
      }
      const side = new Vector3(-direction.z, 0, direction.x).multiplyScalar(zigzagDir.current * 4);
      velocity.add(side);
    }

    if (knockbackTimer.current > 0) {
      knockbackTimer.current -= delta;
      velocity = direction.clone().multiplyScalar(-config.KNOCKBACK_DISTANCE * 2);
    }

    // Apply velocity
    api.velocity.set(velocity.x, 0, velocity.z);

    // Bat height (flying)
    if (type === 'bat') {
    api.position.set(enemyPos.x, (config as any).HEIGHT, enemyPos.z);
    }

    // Handle Burn
    if (burnTimer.current > 0) {
      burnTimer.current -= delta;
      burnDamageTimer.current += delta;
      if (burnDamageTimer.current >= 1.0) {
        takeDamage(burnDamage.current);
        burnDamageTimer.current = 0;
      }
    }

    // 3. Damage player on touch
    if (distance < config.RADIUS + GAME_CONFIG.PLAYER.CAPSULE_RADIUS) {
      damageTimer.current -= delta;
      if (damageTimer.current <= 0) {
        takeDamageAction(config.DAMAGE);
        damageTimer.current = 1.0;
      }
    }

    // 4. Handle hit flash
    if (hitFlashTimer.current > 0) {
      hitFlashTimer.current -= delta;
      if (hitFlashTimer.current <= 0) {
        setIsHit(false);
      }
    }
  });

  // Handle Death
  useEffect(() => {
    if (hp <= 0 && ref.current) {
      const pos = ref.current.position.clone();
      const xp = Math.floor(Math.random() * (config.XP_DROP.max - config.XP_DROP.min + 1)) + config.XP_DROP.min;
      addKill();
      onDeath(id, pos, xp);
    }
  }, [hp, id, onDeath, config.XP_DROP, addKill, config.RADIUS]);

  if (hp <= 0) return null;

  return (
    <mesh ref={ref} castShadow>
      {type === 'slime' ? (
        <sphereGeometry args={[config.RADIUS, 16, 16]} />
      ) : type === 'bat' ? (
        <sphereGeometry args={[config.RADIUS, 8, 8]} />
      ) : type === 'ogre' ? (
        <boxGeometry args={[config.RADIUS * 2, config.HEIGHT, config.RADIUS * 2]} />
      ) : (
        <capsuleGeometry args={[config.RADIUS, config.HEIGHT || 1.5, 4, 16]} />
      )}
      <meshStandardMaterial color={isHit ? "white" : config.COLOR} />
    </mesh>
  );
};

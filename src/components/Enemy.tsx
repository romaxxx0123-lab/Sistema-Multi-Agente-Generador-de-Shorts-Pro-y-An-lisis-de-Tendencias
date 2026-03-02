import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

interface EnemyProps {
  id: string;
  type: 'slime' | 'skeleton';
  initialPosition: [number, number, number];
  onDeath: (id: string, position: Vector3, xp: number) => void;
}

export const Enemy = ({ id, type, initialPosition, onDeath }: EnemyProps) => {
  const config = type === 'slime' ? GAME_CONFIG.ENEMIES.SLIME : GAME_CONFIG.ENEMIES.SKELETON;
  const [hp, setHp] = useState(config.HP);
  const [isHit, setIsHit] = useState(false);
  const hitFlashTimer = useRef(0);
  const damageTimer = useRef(0);

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
    setHp((prev) => {
      const newHp = prev - amount;
      if (newHp <= 0) return 0;
      return newHp;
    });
    setIsHit(true);
    hitFlashTimer.current = GAME_CONFIG.COMBAT.HIT_FLASH_DURATION;
  }, []);

  // Listen for player attacks
  useEffect(() => {
    const handleAttack = (e: any) => {
      if (!ref.current || hp <= 0) return;

      const { position, forward, range, damage, angle } = e.detail;
      const enemyPos = ref.current.position;

      const toEnemy = new Vector3().subVectors(enemyPos, position);
      const distance = toEnemy.length();

      if (distance <= range) {
        toEnemy.normalize();
        const dot = toEnemy.dot(forward);
        // Check if enemy is within the attack cone
        if (dot >= Math.cos(angle / 2)) {
          takeDamage(damage);
        }
      }
    };

    window.addEventListener('player-attack', handleAttack);
    return () => window.removeEventListener('player-attack', handleAttack);
  }, [hp, takeDamage, ref]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || hp <= 0 || !playerRef || !ref.current) return;

    const enemyPos = ref.current.position;
    const playerPos = playerRef.position;

    // 1. Move towards player
    const direction = new Vector3().subVectors(playerPos, enemyPos);
    const distance = direction.length();
    direction.y = 0; // Keep on ground
    direction.normalize();

    api.velocity.set(
      direction.x * config.SPEED,
      0,
      direction.z * config.SPEED
    );

    // 2. Damage player on touch
    if (distance < config.RADIUS + GAME_CONFIG.PLAYER.CAPSULE_RADIUS) {
      damageTimer.current -= delta;
      if (damageTimer.current <= 0) {
        takeDamageAction(config.DAMAGE);
        damageTimer.current = 1.0; // 1 second interval
      }
    }

    // 3. Handle hit flash
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
  }, [hp, id, onDeath, config.XP_DROP, addKill]);

  if (hp <= 0) return null;

  return (
    <mesh ref={ref} castShadow>
      {type === 'slime' ? (
        <sphereGeometry args={[config.RADIUS, 16, 16]} />
      ) : (
        <capsuleGeometry args={[config.RADIUS, (config as any).HEIGHT || 1.5, 4, 16]} />
      )}
      <meshStandardMaterial color={isHit ? "white" : config.COLOR} />
    </mesh>
  );
};

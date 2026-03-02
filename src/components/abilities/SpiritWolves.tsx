import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

const Wolf = ({ damage }: { damage: number }) => {
  const meshRef = useRef<Mesh>(null);
  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const targetPos = useRef<Vector3 | null>(null);
  const attackTimer = useRef(0);
  const [hp, setHp] = useState(GAME_CONFIG.ABILITIES.WOLVES.HP);
  const respawnTimer = useRef(0);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    if (hp <= 0) {
        respawnTimer.current += delta;
        if (respawnTimer.current >= 5) {
            setHp(GAME_CONFIG.ABILITIES.WOLVES.HP);
            respawnTimer.current = 0;
            if (meshRef.current) meshRef.current.position.copy(playerRef.position);
        }
        return;
    }

    if (!meshRef.current) return;

    // 1. Move logic
    // Request nearest enemy target
    if (!targetPos.current) {
        window.dispatchEvent(new CustomEvent('request-nearest-enemy', {
            detail: { position: meshRef.current.position.clone(), callback: (pos: Vector3) => targetPos.current = pos }
        }));
    }

    const moveTarget = targetPos.current || playerRef.position;
    const dir = new Vector3().subVectors(moveTarget, meshRef.current.position);
    const dist = dir.length();

    if (dist > 1.0) {
        dir.normalize();
        meshRef.current.position.add(dir.multiplyScalar(GAME_CONFIG.ABILITIES.WOLVES.SPEED * delta));
        meshRef.current.lookAt(moveTarget.x, meshRef.current.position.y, moveTarget.z);
    } else if (targetPos.current) {
        // Attack
        attackTimer.current += delta;
        if (attackTimer.current >= 1.0) {
            window.dispatchEvent(new CustomEvent('player-attack', {
                detail: { position: meshRef.current.position.clone(), range: 1.5, damage, angle: Math.PI * 2, isAuto: true }
            }));
            attackTimer.current = 0;
            targetPos.current = null; // Find next
        }
    }

    // 2. Simple damage logic: Wolf takes damage while near enemies
    if (targetPos.current && dist < 2.0) {
        setHp(prev => Math.max(0, prev - (20 * delta)));
    }
  });

  if (hp <= 0) return null;

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[0.4, 0.4, 0.8]} />
      <meshStandardMaterial color="#94a3b8" />
    </mesh>
  );
};

export const SpiritWolves = ({ level }: { level: number }) => {
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  const damage = GAME_CONFIG.ABILITIES.WOLVES.DAMAGE * damageMultiplier;

  return (
    <group>
      {Array.from({ length: level }).map((_, i) => (
        <Wolf key={i} damage={damage} />
      ))}
    </group>
  );
};

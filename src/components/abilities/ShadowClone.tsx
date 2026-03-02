import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

interface CloneProps {
  delay: number;
  damageMultiplier: number;
}

const Clone = ({ delay, damageMultiplier }: CloneProps) => {
  const meshRef = useRef<Mesh>(null);
  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const [isAttacking, setIsAttacking] = useState(false);
  const trail = useRef<{ pos: Vector3; quat: Quaternion; time: number }[]>([]);

  useEffect(() => {
    const handleAttack = (e: any) => {
      if (e.detail.isAuto) return;

      // Delay attack logic
      setTimeout(() => {
        if (status !== 'playing') return;
        setIsAttacking(true);
        setTimeout(() => setIsAttacking(false), 100);

        // Actual attack logic
        const clonePos = meshRef.current?.position.clone();
        const cloneForward = new Vector3(0, 0, -1).applyQuaternion(meshRef.current?.quaternion || new Quaternion());

        const event = new CustomEvent('player-attack', {
          detail: {
            ...e.detail,
            position: clonePos,
            forward: cloneForward,
            damage: e.detail.damage * GAME_CONFIG.ABILITIES.CLONE.DAMAGE_PERCENT,
            isAuto: true,
          }
        });
        window.dispatchEvent(event);
      }, GAME_CONFIG.ABILITIES.CLONE.DELAY * 1000);
    };

    window.addEventListener('player-attack', handleAttack);
    return () => window.removeEventListener('player-attack', handleAttack);
  }, [status, damageMultiplier]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !meshRef.current) return;

    // Record player's path
    trail.current.unshift({
      pos: playerRef.position.clone(),
      quat: playerRef.quaternion.clone(),
      time: Date.now()
    });

    // Extract position from X seconds ago
    const targetTime = Date.now() - (delay * 1000);
    while (trail.current.length > 0 && trail.current[trail.current.length - 1].time < targetTime - 1000) {
      trail.current.pop();
    }

    const state = trail.current.find(s => s.time <= targetTime);
    if (state) {
      // 2m behind behavior: if player is moving, the time delay works as trail.
      // If player is stationary, the trail will eventually all be at the same point.
      // Requirement: "2m behind".
      const behindPos = state.pos.clone();

      // If stationary, explicitly offset
      const playerVelocity = (playerRef as any).velocity;
      const isStationary = playerVelocity ? (Math.abs(playerVelocity.x) < 0.1 && Math.abs(playerVelocity.z) < 0.1) : true;

      if (isStationary) {
        const offset = new Vector3(0, 0, GAME_CONFIG.ABILITIES.CLONE.DISTANCE).applyQuaternion(state.quat);
        behindPos.add(offset);
      }

      meshRef.current.position.copy(behindPos);
      meshRef.current.quaternion.copy(state.quat);
    }
  });

  return (
    <mesh ref={meshRef}>
      <capsuleGeometry args={[0.5, 1, 4, 16]} />
      <meshStandardMaterial
        color={isAttacking ? "yellow" : "#60a5fa"}
        transparent
        opacity={0.3}
      />
    </mesh>
  );
};

export const ShadowClone = ({ level }: { level: number }) => {
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  return (
    <group>
      {Array.from({ length: level }).map((_, i) => (
        <Clone key={i} delay={0.5 * (i + 1)} damageMultiplier={damageMultiplier} />
      ))}
    </group>
  );
};

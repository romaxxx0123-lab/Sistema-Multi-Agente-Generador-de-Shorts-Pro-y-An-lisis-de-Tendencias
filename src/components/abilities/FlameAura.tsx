import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

export const FlameAura = ({ level }: { level: number }) => {
  const meshRef = useRef(null);
  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  const timer = useRef(0);

  const radius = GAME_CONFIG.ABILITIES.FLAME.BASE_RADIUS + (level - 1) * GAME_CONFIG.ABILITIES.FLAME.RADIUS_INCREASE;
  const damagePerSec = GAME_CONFIG.ABILITIES.FLAME.BASE_DAMAGE_SEC * damageMultiplier;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !meshRef.current) return;

    // Follow player
    (meshRef.current as any).position.copy(playerRef.position);
    (meshRef.current as any).position.y = 0.1; // Slightly above ground

    timer.current += delta;
    if (timer.current >= 1.0) {
      // Periodic AOE damage
      const event = new CustomEvent('player-attack', {
        detail: {
          position: playerRef.position.clone(),
          forward: null, // null forward means AOE
          range: radius,
          damage: damagePerSec,
          angle: Math.PI * 2,
          isAuto: true,
        }
      });
      window.dispatchEvent(event);
      timer.current = 0;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius - 0.1, radius, 32]} />
      <meshBasicMaterial color="#ef4444" transparent opacity={0.5} />
    </mesh>
  );
};

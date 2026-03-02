import { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

interface BoltProps {
  position: Vector3;
  onEnd: () => void;
}

const Bolt = ({ position, onEnd }: BoltProps) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onEnd();
    }, 300);
    return () => clearTimeout(timer);
  }, [onEnd]);

  if (!visible) return null;

  return (
    <mesh position={[position.x, 5, position.z]}>
      <cylinderGeometry args={[0.05, 0.2, 10, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={5} />
    </mesh>
  );
};

export const LightningStrike = ({ level }: { level: number }) => {
  const [bolts, setBolts] = useState<{ id: number; position: Vector3 }[]>([]);
  const boltId = useRef(0);
  const timer = useRef(0);
  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);

  const cooldown = Math.max(0.1, GAME_CONFIG.ABILITIES.LIGHTNING.BASE_COOLDOWN - (level - 1) * GAME_CONFIG.ABILITIES.LIGHTNING.CD_REDUCTION);
  const damage = GAME_CONFIG.ABILITIES.LIGHTNING.BASE_DAMAGE * damageMultiplier;
  const range = GAME_CONFIG.ABILITIES.LIGHTNING.RANGE;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= cooldown) {
      // Dispatch a request to target the CLOSEST nearby enemy
      const event = new CustomEvent('request-lightning-target', {
        detail: {
          position: playerRef.position.clone(),
          range: range,
          damage: damage,
          callback: (pos: Vector3) => {
            setBolts((prev) => [...prev, { id: boltId.current++, position: pos }]);
          }
        }
      });
      window.dispatchEvent(event);
      timer.current = 0;
    }
  });

  return (
    <group>
      {bolts.map((bolt) => (
        <Bolt
          key={bolt.id}
          position={bolt.position}
          onEnd={() => setBolts((prev) => prev.filter((b) => b.id !== bolt.id))}
        />
      ))}
    </group>
  );
};

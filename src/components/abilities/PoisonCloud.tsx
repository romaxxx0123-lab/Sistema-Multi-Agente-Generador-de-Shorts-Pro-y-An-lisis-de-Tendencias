import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

const Cloud = ({ position, radius, duration, damage }: any) => {
  const [active, setActive] = useState(true);
  const timer = useRef(0);
  const damageTimer = useRef(0);

  useFrame((_state, delta) => {
    if (!active) return;

    timer.current += delta;
    if (timer.current >= duration) {
      setActive(false);
      return;
    }

    damageTimer.current += delta;
    if (damageTimer.current >= 1.0) {
      const event = new CustomEvent('player-attack', {
        detail: {
          position: position,
          range: radius,
          damage: damage,
          angle: Math.PI * 2,
          isAuto: true,
          poison: true // Custom property for poison VFX/tags if needed
        }
      });
      window.dispatchEvent(event);
      damageTimer.current = 0;
    }
  });

  if (!active) return null;

  return (
    <mesh position={[position.x, 0.1, position.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <circleGeometry args={[radius, 32]} />
      <meshBasicMaterial color="#16a34a" transparent opacity={0.3} />
    </mesh>
  );
};

export const PoisonCloud = ({ level }: { level: number }) => {
  const [clouds, setClouds] = useState<{ id: number; pos: Vector3 }[]>([]);
  const nextId = useRef(0);
  const timer = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);

  const config = GAME_CONFIG.ABILITIES.POISON;
  const duration = config.BASE_DURATION + (level - 1);
  const damage = config.DAMAGE_SEC * damageMultiplier;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= config.COOLDOWN) {
      setClouds(prev => [...prev, { id: nextId.current++, pos: playerRef.position.clone() }]);
      timer.current = 0;
    }
  });

  return (
    <group>
      {clouds.map(c => (
        <Cloud key={c.id} position={c.pos} radius={config.RADIUS} duration={duration} damage={damage} />
      ))}
    </group>
  );
};

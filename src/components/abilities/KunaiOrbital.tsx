import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

interface KunaiProps {
  index: number;
  total: number;
  level: number;
  isFire?: boolean;
}

const Kunai = ({ index, total, level, isFire = false }: KunaiProps) => {
  const meshRef = useRef<Mesh>(null);
  const playerRef = useGameStore((state) => state.playerRef);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  const status = useGameStore((state) => state.status);

  const config: any = isFire ? GAME_CONFIG.ABILITIES.FIRE_SPIRAL : GAME_CONFIG.ABILITIES.KUNAI;
  const damage = (isFire ? config.DAMAGE : config.BASE_DAMAGE!) * damageMultiplier;
  const radius = config.RADIUS;
  const rotationSpeed = isFire ? (GAME_CONFIG.ABILITIES.KUNAI.ROTATION_SPEED * 1.5) : GAME_CONFIG.ABILITIES.KUNAI.ROTATION_SPEED;

  const initialAngle = (Math.PI * 2 / total) * index;
  const currentAngle = useRef(initialAngle);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !meshRef.current) return;

    // Update angle
    currentAngle.current += rotationSpeed * delta;

    // Position around player
    const playerPos = playerRef.position;
    meshRef.current.position.set(
      playerPos.x + Math.cos(currentAngle.current) * radius,
      playerPos.y,
      playerPos.z + Math.sin(currentAngle.current) * radius
    );

    // Rotate to face movement direction (tangent)
    meshRef.current.rotation.y = -currentAngle.current;

    // Hit detection (simple distance check for simplicity in this demo)
    // In a real game, use a trigger or Raycast
    const event = new CustomEvent('player-attack', {
      detail: {
        position: meshRef.current.position.clone(),
        forward: new Vector3(Math.cos(currentAngle.current + Math.PI/2), 0, Math.sin(currentAngle.current + Math.PI/2)),
        range: 1.0,
        damage: damage,
        angle: Math.PI * 2, // 360 degree circle hit
        isAuto: true,
        burn: isFire ? { damage: GAME_CONFIG.ABILITIES.FIRE_SPIRAL.BURN_DAMAGE, duration: GAME_CONFIG.ABILITIES.FIRE_SPIRAL.BURN_DURATION } : null
      }
    });
    window.dispatchEvent(event);
  });

  return (
    <mesh ref={meshRef}>
      <cylinderGeometry args={[0.1, 0.1, 0.8, 8]} />
      <meshStandardMaterial
        color={isFire ? "#f97316" : "#cbd5e1"}
        emissive={isFire ? "#ea580c" : "#000000"}
        emissiveIntensity={isFire ? 2 : 0}
      />
    </mesh>
  );
};

export const KunaiOrbital = ({ level }: { level: number }) => {
  const count = level + 1; // Level 1 = 2 kunais, Level 5 = 6
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <Kunai key={i} index={i} total={count} level={level} />
      ))}
    </group>
  );
};

export const FireSpiral = ({ level }: { level: number }) => {
  const count = 6;
  return (
    <group>
      {Array.from({ length: count }).map((_, i) => (
        <Kunai key={i} index={i} total={count} level={level} isFire={true} />
      ))}
    </group>
  );
};

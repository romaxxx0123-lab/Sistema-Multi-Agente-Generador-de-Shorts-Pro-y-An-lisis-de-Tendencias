import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';

interface ExperienceGemProps {
  id: string;
  position: Vector3;
  amount: number;
  onCollect: (id: string, amount: number) => void;
}

export const ExperienceGem = ({ id, position, amount, onCollect }: ExperienceGemProps) => {
  const playerRef = useGameStore((state) => state.playerRef);
  const addXP = useGameStore((state) => state.addXP);
  const status = useGameStore((state) => state.status);

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 0,
    position: [position.x, 0.5, position.z],
    args: [0.2],
    isTrigger: true,
  }));

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !ref.current) return;

    const gemPos = ref.current.position;
    const playerPos = playerRef.position;
    const toPlayer = new Vector3().subVectors(playerPos, gemPos);
    const distance = toPlayer.length();

    // Magnetic effect
    if (distance < 5) {
      toPlayer.normalize();
      const speed = 10 * (1 - distance / 5) + 2;
      api.position.set(
        gemPos.x + toPlayer.x * speed * delta,
        0.5,
        gemPos.z + toPlayer.z * speed * delta
      );
    }

    // Collect
    if (distance < 0.8) {
      addXP(amount);
      onCollect(id, amount);
    }
  });

  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={2} />
    </mesh>
  );
};

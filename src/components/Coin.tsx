import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';

interface CoinProps {
  id: string;
  position: Vector3;
  amount: number;
  onCollect: (id: string) => void;
}

export const Coin = ({ id, position, amount, onCollect }: CoinProps) => {
  const playerRef = useGameStore((state) => state.playerRef);
  const addCoins = useGameStore((state) => state.addCoins);
  const status = useGameStore((state) => state.status);

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 0,
    position: [position.x, 0.5, position.z],
    args: [0.2],
    isTrigger: true,
  }));

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !ref.current) return;

    const coinPos = ref.current.position;
    const playerPos = playerRef.position;
    const toPlayer = new Vector3().subVectors(playerPos, coinPos);
    const distance = toPlayer.length();

    // Magnetic effect
    if (distance < 5) {
      toPlayer.normalize();
      const speed = 12;
      api.position.set(
        coinPos.x + toPlayer.x * speed * delta,
        0.5,
        coinPos.z + toPlayer.z * speed * delta
      );
    }

    // Collect
    if (distance < 0.8) {
      addCoins(amount);
      onCollect(id);
      window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'coin' } }));
    }
  });

  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.2, 0.2, 0.05, 8]} />
      <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
    </mesh>
  );
};

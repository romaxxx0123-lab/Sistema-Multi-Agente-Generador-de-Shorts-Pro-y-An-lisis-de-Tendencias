import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

interface ShurikenProps {
  id: number;
  position: Vector3;
  direction: Vector3;
  damage: number;
  onEnd: (id: number) => void;
}

const Shuriken = ({ id, position, direction, damage, onEnd }: ShurikenProps) => {
  const meshRef = useRef<Mesh>(null);
  const distanceTravelled = useRef(0);
  const speed = 15;

  useFrame((_state, delta) => {
    if (!meshRef.current) return;

    const move = direction.clone().multiplyScalar(speed * delta);
    meshRef.current.position.add(move);
    meshRef.current.rotation.y += 20 * delta;

    distanceTravelled.current += speed * delta;
    if (distanceTravelled.current > 30) onEnd(id);

    // Hit detection
    const event = new CustomEvent('player-attack', {
      detail: {
        position: meshRef.current.position.clone(),
        range: 1.0,
        damage: damage,
        angle: Math.PI * 2,
        isAuto: true
      }
    });
    window.dispatchEvent(event);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <cylinderGeometry args={[0.3, 0.3, 0.05, 3]} />
      <meshStandardMaterial color="#64748b" />
    </mesh>
  );
};

export const ShurikenStorm = ({ level }: { level: number }) => {
  const [shurikens, setShurikens] = useState<{ id: number; pos: Vector3; dir: Vector3 }[]>([]);
  const nextId = useRef(0);
  const timer = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  const status = useGameStore((state) => state.status);

  const config = GAME_CONFIG.ABILITIES.SHURIKEN;
  const count = level;
  const damage = config.DAMAGE * damageMultiplier;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= config.COOLDOWN) {
      const newShurikens: any[] = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        newShurikens.push({
          id: nextId.current++,
          pos: playerRef.position.clone(),
          dir: new Vector3(Math.cos(angle), 0, Math.sin(angle))
        });
      }
      setShurikens(prev => [...prev, ...newShurikens]);
      timer.current = 0;
    }
  });

  return (
    <group>
      {shurikens.map(s => (
        <Shuriken
          key={s.id}
          id={s.id}
          position={s.pos}
          direction={s.dir}
          damage={damage}
          onEnd={(id) => setShurikens(prev => prev.filter(x => x.id !== id))}
        />
      ))}
    </group>
  );
};

import { useState, useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { Html } from '@react-three/drei';

interface DamageNumber {
  id: number;
  value: number;
  position: Vector3;
  time: number;
}

export const DamageNumbers = () => {
  const [numbers, setNumbers] = useState<DamageNumber[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    const handleHit = (e: any) => {
      if (e.detail.damage === undefined || !e.detail.position) return;

      setNumbers(prev => [...prev, {
        id: nextId.current++,
        value: Math.floor(e.detail.damage),
        position: e.detail.position.clone(),
        time: Date.now()
      }]);
    };

    const handleLightning = (e: any) => {
      setNumbers(prev => [...prev, {
        id: nextId.current++,
        value: Math.floor(e.detail.damage),
        position: e.detail.position.clone(),
        time: Date.now()
      }]);
    };

    window.addEventListener('player-attack', handleHit);
    window.addEventListener('lightning-hit', handleLightning);
    return () => {
      window.removeEventListener('player-attack', handleHit);
      window.removeEventListener('lightning-hit', handleLightning);
    };
  }, []);

  useFrame((_state) => {
    const now = Date.now();
    setNumbers(prev => prev.filter(n => now - n.time < 1000));
  });

  return (
    <group>
      {numbers.map(n => {
        const elapsed = Date.now() - n.time;
        const offset = elapsed / 1000 * 2; // Move up
        const opacity = 1 - elapsed / 1000;

        return (
          <Html
            key={n.id}
            position={[n.position.x, n.position.y + 1 + offset, n.position.z]}
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              color: 'white',
              fontSize: '18px',
              fontWeight: 'bold',
              textShadow: '0 0 2px black',
              opacity,
              transition: 'opacity 0.1s'
            }}
          >
            {n.value}
          </Html>
        );
      })}
    </group>
  );
};

import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

const Spike = ({ position, damage, onEnd }: any) => {
  const timer = useRef(0);
  const [stage, setStage] = useState<'warn' | 'active' | 'retract'>('warn');

  useFrame((_state, delta) => {
    timer.current += delta;
    if (stage === 'warn' && timer.current >= 0.5) {
      setStage('active');
      window.dispatchEvent(new CustomEvent('player-attack', {
        detail: { position, range: 1.0, damage, angle: Math.PI * 2, isAuto: true }
      }));
    } else if (stage === 'active' && timer.current >= 1.0) {
      setStage('retract');
    } else if (stage === 'retract' && timer.current >= 1.2) {
      onEnd();
    }
  });

  return (
    <mesh position={[position.x, stage === 'active' ? 0.5 : -1, position.z]}>
      <coneGeometry args={[0.3, 1, 4]} />
      <meshStandardMaterial color={stage === 'warn' ? "#991b1b" : "#4b5563"} transparent opacity={stage === 'warn' ? 0.5 : 1} />
    </mesh>
  );
};

export const GroundSpikes = ({ level }: { level: number }) => {
  const [spikes, setSpikes] = useState<{ id: number; pos: Vector3 }[]>([]);
  const nextId = useRef(0);
  const timer = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);

  const config = GAME_CONFIG.ABILITIES.GROUND_SPIKES;
  const count = 3 + (level - 1) * 2;
  const damage = config.DAMAGE * damageMultiplier;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= config.COOLDOWN) {
      const newSpikes: any[] = [];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * config.RADIUS;
        newSpikes.push({
          id: nextId.current++,
          pos: new Vector3(
            playerRef.position.x + Math.cos(angle) * dist,
            0,
            playerRef.position.z + Math.sin(angle) * dist
          )
        });
      }
      setSpikes(prev => [...prev, ...newSpikes]);
      timer.current = 0;
    }
  });

  return (
    <group>
      {spikes.map(s => (
        <Spike key={s.id} position={s.pos} damage={damage} onEnd={() => setSpikes(prev => prev.filter(x => x.id !== s.id))} />
      ))}
    </group>
  );
};

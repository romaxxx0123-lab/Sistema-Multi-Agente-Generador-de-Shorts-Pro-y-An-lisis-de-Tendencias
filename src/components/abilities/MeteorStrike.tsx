import { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Mesh } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

const Meteor = ({ position, impactDamage, aoeDamage, aoeRadius, onEnd }: any) => {
  const [stage, setStage] = useState<'falling' | 'impact' | 'lingering'>('falling');
  const meshRef = useRef<Mesh>(null);
  const timer = useRef(0);
  const height = useRef(15);

  useFrame((_state, delta) => {
    timer.current += delta;

    if (stage === 'falling') {
      height.current -= 20 * delta;
      if (height.current <= 0.5) {
        setStage('impact');
        window.dispatchEvent(new CustomEvent('player-attack', {
          detail: { position, range: aoeRadius, damage: impactDamage, angle: Math.PI * 2, isAuto: true }
        }));
        window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 10 } }));
      }
    } else if (stage === 'impact') {
      if (timer.current >= 1.5) setStage('lingering');
    } else if (stage === 'lingering') {
      if (timer.current >= 3.5) onEnd();
      // AOE Burn
      if (Math.floor(timer.current * 10) % 10 === 0) {
        window.dispatchEvent(new CustomEvent('player-attack', {
            detail: { position, range: aoeRadius, damage: aoeDamage, angle: Math.PI * 2, isAuto: true, burn: { damage: 5, duration: 2 } }
        }));
      }
    }
  });

  return (
    <group position={position}>
      {stage === 'falling' && (
        <mesh position={[0, height.current, 0]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#f97316" />
        </mesh>
      )}
      {(stage === 'impact' || stage === 'lingering') && (
        <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[aoeRadius, 32]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
};

export const MeteorStrike = ({ level }: { level: number }) => {
  const [meteors, setMeteors] = useState<{ id: number; pos: Vector3 }[]>([]);
  const nextId = useRef(0);
  const timer = useRef(0);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);

  const config = GAME_CONFIG.ABILITIES.METEOR;
  const cooldown = config.COOLDOWN - (level - 1);
  const impactDamage = config.IMPACT_DAMAGE * damageMultiplier;
  const aoeDamage = config.AOE_DAMAGE * damageMultiplier;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= cooldown) {
      // Find a nearby enemy position
      window.dispatchEvent(new CustomEvent('request-nearest-enemy', {
          detail: {
            position: playerRef.position.clone(),
            callback: (pos: Vector3) => {
                setMeteors(prev => [...prev, { id: nextId.current++, pos: pos.clone() }]);
            }
          }
      }));
      timer.current = 0;
    }
  });

  return (
    <group>
      {meteors.map(m => (
        <Meteor
            key={m.id}
            position={m.pos}
            impactDamage={impactDamage}
            aoeDamage={aoeDamage}
            aoeRadius={config.AOE_RADIUS}
            onEnd={() => setMeteors(prev => prev.filter(x => x.id !== m.id))}
        />
      ))}
    </group>
  );
};

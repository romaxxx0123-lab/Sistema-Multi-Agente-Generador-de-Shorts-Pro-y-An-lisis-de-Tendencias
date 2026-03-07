import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import { Vector3, Quaternion, Mesh } from 'three';
import { useGameStore, EnemyEntity } from '../../store/useGameStore';
import { enemyRegistry } from '../../systems/EnemyRegistry';
import { Oni } from '../models/Oni';
import { TUNING } from '../../data/tuning';

/**
 * BOSS ENTITY
 * Featuring Telegraphs and Patterns.
 */

interface BossProps {
  data: EnemyEntity;
}

export function Boss({ data }: BossProps) {
  const rbRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<Mesh>(null);
  const telegraphRef = useRef<Mesh>(null);

  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const damageEnemy = useGameStore((state) => state.damageEnemy);
  const removeEnemy = useGameStore((state) => state.removeEnemy);
  const takeDamage = useGameStore((state) => state.takeDamage);

  const [phase, setPhase] = useState<'follow' | 'telegraph' | 'charge'>('follow');
  const timer = useRef(0);
  const chargeDir = useMemo(() => new Vector3(), []);
  const _playerPos = new Vector3();

  useFrame((state, delta) => {
    if (status !== 'playing' || !playerRef || !rbRef.current) return;

    timer.current += delta;
    playerRef.getWorldPosition(_playerPos);
    const pos = rbRef.current.translation();
    const enemyPos = new Vector3(pos.x, pos.y, pos.z);

    if (phase === 'follow') {
        const dir = _playerPos.clone().sub(enemyPos).normalize();
        rbRef.current.setLinvel({ x: dir.x * 3, y: 0, z: dir.z * 3 }, true);

        if (timer.current > 5) {
            setPhase('telegraph');
            timer.current = 0;
            chargeDir.copy(dir);
        }
    } else if (phase === 'telegraph') {
        rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        if (telegraphRef.current) {
            telegraphRef.current.visible = true;
            telegraphRef.current.scale.z = timer.current * 10;
        }

        if (timer.current > 1.5) {
            setPhase('charge');
            timer.current = 0;
            if (telegraphRef.current) telegraphRef.current.visible = false;
        }
    } else if (phase === 'charge') {
        rbRef.current.setLinvel({ x: chargeDir.x * 20, y: 0, z: chargeDir.z * 20 }, true);
        if (timer.current > 0.8) {
            setPhase('follow');
            timer.current = 0;
        }
    }

    // Death Check
    if (data.hp <= 0) {
      if ((window as any).triggerShake) (window as any).triggerShake(0.5);
        removeEnemy(data.id);
        useGameStore.getState().finishRun(true); // Boss kill = Victory in 1A
    }
  });

  return (
    <RigidBody
      ref={rbRef}
      colliders={false}
      position={data.position}
      name={`boss-${data.id}`}
      onCollisionEnter={(e) => {
          if (e.other.rigidBodyObject?.name === 'player') {
              takeDamage(20);
              if ((window as any).triggerShake) (window as any).triggerShake(0.3);
          }
      }}
    >
      <CapsuleCollider args={[1, 1]} position={[0, 1, 0]} />

      <group>
          {/* Visuals */}
          <group scale={2}>
            <Oni />
          </group>

          {/* Telegraph (Charge Line) */}
          <mesh ref={telegraphRef} visible={false} position={[0, 0.1, 5]} rotation={[-Math.PI/2, 0, 0]}>
              <planeGeometry args={[2, 10]} />
              <meshBasicMaterial color="#ff0000" transparent opacity={0.3} />
          </mesh>

          {/* HP Bar */}
          <group position={[0, 4, 0]}>
              <mesh>
                  <planeGeometry args={[4, 0.2]} />
                  <meshBasicMaterial color="black" />
              </mesh>
              <mesh position={[-(1 - (data.hp/data.maxHp)) * 2, 0, 0.01]} scale={[data.hp/data.maxHp, 1, 1]}>
                  <planeGeometry args={[4, 0.15]} />
                  <meshBasicMaterial color="#e74c3c" />
              </mesh>
          </group>
      </group>
    </RigidBody>
  );
}

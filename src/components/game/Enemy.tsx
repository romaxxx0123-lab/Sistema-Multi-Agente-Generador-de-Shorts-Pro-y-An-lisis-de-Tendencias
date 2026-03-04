import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RigidBodyApi, CapsuleCollider } from '@react-three/rapier';
import { Vector3, Euler, Quaternion } from 'three';
import { useGameStore, EnemyEntity } from '../../store/useGameStore';
import { Skeleton } from '../models/Skeleton';
import { Ninja } from '../models/Ninja';
import { Oni } from '../models/Oni';

/**
 * ENEMY COMPONENT
 * Handles physics-based movement, AI (simple follow), and visuals.
 */

interface EnemyProps {
  data: EnemyEntity;
}

export function Enemy({ data }: EnemyProps) {
  const rbRef = useRef<RigidBodyApi>(null);
  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const removeEnemy = useGameStore((state) => state.removeEnemy);
  const takeDamage = useGameStore((state) => state.takeDamage);
  const addXp = useGameStore((state) => state.addXp);
  const addKill = useGameStore((state) => state.addKill);

  // Pre-allocated vectors for performance
  const moveDir = useMemo(() => new Vector3(), []);
  const playerPos = useMemo(() => new Vector3(), []);
  const enemyPos = useMemo(() => new Vector3(), []);
  const targetQuat = useMemo(() => new Quaternion(), []);
  const lookAtMat = useMemo(() => new Vector3(), []);

  const stats = {
      speed: data.type === 'ninja' ? 4 : (data.type === 'oni' ? 2 : 2.5),
      damage: data.type === 'oni' ? 25 : (data.type === 'ninja' ? 10 : 5),
      xp: data.type === 'oni' ? 50 : (data.type === 'ninja' ? 20 : 10)
  };

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !rbRef.current) return;

    // 1. Get positions
    playerRef.getWorldPosition(playerPos);
    const { x, y, z } = rbRef.current.translation();
    enemyPos.set(x, y, z);

    // 2. Simple Follow Logic
    moveDir.subVectors(playerPos, enemyPos).normalize();
    moveDir.y = 0; // Lock to ground

    // 3. Move via physics velocity
    const velocity = moveDir.clone().multiplyScalar(stats.speed);
    rbRef.current.setLinvel({ x: velocity.x, y: 0, z: velocity.z }, true);

    // 4. Smooth Rotation towards player
    if (moveDir.lengthSq() > 0.1) {
      lookAtMat.copy(enemyPos).add(moveDir);
      const targetRotation = Math.atan2(moveDir.x, moveDir.z);
      const currentRot = rbRef.current.rotation();
      const currentQuat = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);

      const newRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), targetRotation);
      currentQuat.slerp(newRotation, 10 * delta);
      rbRef.current.setRotation(currentQuat, true);
    }

    // 5. Cleanup if dead (logic happens in store)
    if (data.hp <= 0) {
        addXp(stats.xp);
        addKill();
        removeEnemy(data.id);
    }
  });

  const handleCollision = (e: any) => {
      // Check if hit player
      if (e.other.rigidBodyObject?.name === 'player') {
          takeDamage(stats.damage);
          // Apply knockback
          const knockbackDir = moveDir.clone().negate().multiplyScalar(5);
          rbRef.current?.applyImpulse({ x: knockbackDir.x, y: 2, z: knockbackDir.z }, true);
      }
  };

  return (
    <RigidBody
      ref={rbRef}
      colliders={false}
      position={data.position}
      enabledRotations={[false, true, false]}
      onCollisionEnter={handleCollision}
      userData={{ type: 'enemy', id: data.id }}
      name={`enemy-${data.id}`}
    >
      <CapsuleCollider args={[0.5, 0.5]} position={[0, 0.5, 0]} />

      {/* Dynamic Model based on type */}
      <group>
          {data.type === 'skeleton' && <Skeleton scale={0.5} />}
          {data.type === 'ninja' && <Ninja scale={0.6} />}
          {data.type === 'oni' && <Oni scale={0.8} />}

          {/* Simple HP Bar (Floating) */}
          <mesh position={[0, 2, 0]}>
              <planeGeometry args={[0.8, 0.1]} />
              <meshBasicMaterial color="#333" transparent opacity={0.5} />
          </mesh>
          <mesh position={[0, 2, 0.01]}>
              <planeGeometry args={[(data.hp / data.maxHp) * 0.8, 0.1]} />
              <meshBasicMaterial color="#e74c3c" />
          </mesh>
      </group>
    </RigidBody>
  );
}

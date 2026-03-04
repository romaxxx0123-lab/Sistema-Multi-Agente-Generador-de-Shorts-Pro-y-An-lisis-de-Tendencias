import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import { Vector3, Quaternion, Color } from 'three';
import { useGameStore, EnemyEntity } from '../../store/useGameStore';
import { Skeleton } from '../models/Skeleton';
import { Ninja } from '../models/Ninja';
import { Oni } from '../models/Oni';
import { Samurai } from '../models/Samurai';

/**
 * ENEMY COMPONENT
 * Handles physics-based movement, AI (simple follow), and visuals.
 */

interface EnemyProps {
  data: EnemyEntity;
}

export function Enemy({ data }: EnemyProps) {
  const rbRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<any>(null);
  const [hitFlash, setHitFlash] = useState(0);

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

  const stats = useMemo(() => {
    let s = {
      speed: data.type === 'ninja' ? 4 : (data.type === 'oni' ? 1.8 : (data.type === 'samurai' ? 3.2 : 2.5)),
      damage: data.type === 'oni' ? 25 : (data.type === 'samurai' ? 15 : (data.type === 'ninja' ? 10 : 5)),
      xp: data.type === 'oni' ? 50 : (data.type === 'samurai' ? 40 : (data.type === 'ninja' ? 20 : 10)),
      scale: data.type === 'oni' ? 0.9 : (data.type === 'samurai' ? 0.8 : (data.type === 'ninja' ? 0.6 : 0.5))
    };

    if (data.isElite) {
      s.speed *= 1.2;
      s.damage *= 2;
      s.xp *= 3;
      s.scale *= 1.3;
    }
    return s;
  }, [data.type, data.isElite]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !rbRef.current) return;

    // Hit flash cooldown
    if (hitFlash > 0) setHitFlash(prev => Math.max(0, prev - delta * 5));

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

    // 4. Smooth Rotation & Visual Feedback
    if (moveDir.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(moveDir.x, moveDir.z);
      const currentRot = rbRef.current.rotation();
      const currentQuat = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);

      const newRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), targetRotation);
      currentQuat.slerp(newRotation, 10 * delta);
      rbRef.current.setRotation(currentQuat, true);

      // Procedural "Bobbing/Walking" animation
      if (visualRef.current) {
        const t = _state.clock.getElapsedTime();
        visualRef.current.position.y = Math.sin(t * stats.speed * 3) * 0.05;
        visualRef.current.rotation.z = Math.sin(t * stats.speed * 3) * 0.05;
      }
    }

    // 5. Cleanup if dead (logic happens in store)
    if (data.hp <= 0) {
        addXp(stats.xp);
        addKill();
        removeEnemy(data.id);
    }
  });

  const handleCollision = (e: any) => {
      if (e.other.rigidBodyObject?.name === 'player') {
          takeDamage(stats.damage);
          setHitFlash(1);
          const knockbackDir = moveDir.clone().negate().multiplyScalar(5);
          rbRef.current?.applyImpulse({ x: knockbackDir.x, y: 2, z: knockbackDir.z }, true);
      }
  };

  const hpPercent = data.hp / data.maxHp;

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
      <CapsuleCollider args={[0.4, 0.5]} position={[0, 0.5, 0]} />

      <group ref={visualRef}>
          {/* Hit Flash Overlay */}
          <mesh visible={hitFlash > 0.1} position={[0, 0.8, 0]}>
            <sphereGeometry args={[stats.scale + 0.2]} />
            <meshBasicMaterial color="white" transparent opacity={hitFlash * 0.5} />
          </mesh>

          <group scale={stats.scale}>
            {data.type === 'skeleton' && <Skeleton />}
            {data.type === 'ninja' && <Ninja />}
            {data.type === 'oni' && <Oni />}
            {data.type === 'samurai' && <Samurai />}

            {/* Elite Aura */}
            {data.isElite && (
              <mesh position={[0, 0.5, 0]}>
                <sphereGeometry args={[1.2]} />
                <meshStandardMaterial
                  color="#f1c40f"
                  transparent
                  opacity={0.15}
                  emissive="#f1c40f"
                  emissiveIntensity={2}
                  wireframe
                />
              </mesh>
            )}
          </group>

          {/* PRO HP BAR */}
          <group position={[0, 2.2, 0]}>
              <mesh>
                  <planeGeometry args={[1, 0.15]} />
                  <meshBasicMaterial color="#1a1a1a" transparent opacity={0.8} />
              </mesh>
              <mesh position={[-(1 - hpPercent) / 2, 0, 0.01]}>
                  <planeGeometry args={[hpPercent, 0.1]} />
                  <meshBasicMaterial color={hpPercent > 0.5 ? "#2ecc71" : (hpPercent > 0.25 ? "#f1c40f" : "#e74c3c")} />
              </mesh>
          </group>
      </group>
    </RigidBody>
  );
}

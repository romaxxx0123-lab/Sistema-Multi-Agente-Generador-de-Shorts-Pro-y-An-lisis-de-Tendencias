import { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, RapierRigidBody, CapsuleCollider } from '@react-three/rapier';
import { Vector3, Quaternion } from 'three';
import { useGameStore, EnemyEntity } from '../../store/useGameStore';
import { enemyRegistry } from '../../systems/EnemyRegistry';
import { Skeleton } from '../models/Skeleton';
import { Ninja } from '../models/Ninja';
import { Oni } from '../models/Oni';
import { Samurai } from '../models/Samurai';

/**
 * ENEMY COMPONENT
 * Handles physics-based movement, AI (simple follow), and visuals.
 * FIXED: Increased base scale and improved follow physics.
 */

interface EnemyProps {
  data: EnemyEntity;
}

export function Enemy({ data }: EnemyProps) {
  const rbRef = useRef<RapierRigidBody>(null);
  const visualRef = useRef<any>(null);
  const hitFlashRef = useRef<any>(null);
  const contentRef = useRef<any>(null);
  const hpBarRef = useRef<any>(null);

  const prevHp = useRef(data.hp);
  const hitFlashVal = useRef(0);
  const isDead = useRef(false);
  const dissolveProgress = useRef(0);
  const hitStop = useRef(0);

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

  // Registry & Physics Setup
  useEffect(() => {
    if (rbRef.current) {
      enemyRegistry.register(data.id, rbRef.current);
    }
    return () => enemyRegistry.unregister(data.id);
  }, [data.id]);

  // Hit Detection & Knockback Feedback
  useEffect(() => {
    if (data.hp < prevHp.current) {
      hitFlashVal.current = 1;
      hitStop.current = 0.1;
      if ((window as any).triggerShake) (window as any).triggerShake(0.1);

      if (rbRef.current && playerRef) {
        const pPos = new Vector3();
        playerRef.getWorldPosition(pPos);
        const { x, y, z } = rbRef.current.translation();
        const kbDir = new Vector3(x - pPos.x, 0, z - pPos.z).normalize();
        rbRef.current.applyImpulse({ x: kbDir.x * 15, y: 5, z: kbDir.z * 15 }, true);
      }
    }
    prevHp.current = data.hp;
  }, [data.hp, playerRef]);

  const stats = useMemo(() => {
    // SCALES INCREASED FOR BETTER VISIBILITY
    let s = {
      speed: data.type === 'ninja' ? 4 : (data.type === 'oni' ? 1.8 : (data.type === 'samurai' ? 3.2 : 2.5)),
      damage: data.type === 'oni' ? 25 : (data.type === 'samurai' ? 15 : (data.type === 'ninja' ? 10 : 5)),
      xp: data.type === 'oni' ? 50 : (data.type === 'samurai' ? 40 : (data.type === 'ninja' ? 20 : 10)),
      scale: data.type === 'oni' ? 1.4 : (data.type === 'samurai' ? 1.2 : (data.type === 'ninja' ? 1.0 : 0.8))
    };

    if (data.isElite) {
      s.speed *= 1.2;
      s.damage *= 2;
      s.xp *= 3;
      s.scale *= 1.4;
    }
    return s;
  }, [data.type, data.isElite]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef || !rbRef.current) return;

    if (hitStop.current > 0) {
      hitStop.current = Math.max(0, hitStop.current - delta);
      return;
    }

    if (data.hp <= 0 && !isDead.current) {
      isDead.current = true;
      rbRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }

    if (isDead.current) {
      dissolveProgress.current = Math.min(1, dissolveProgress.current + delta * 1.5);
      if (contentRef.current) {
        const s = stats.scale * (1 - dissolveProgress.current);
        contentRef.current.scale.set(s, s, s);
      }
      if (dissolveProgress.current >= 1) {
        addXp(stats.xp);
        addKill();
        removeEnemy(data.id);
      }
      return;
    }

    // Hit flash cooldown
    if (hitFlashVal.current > 0) {
      hitFlashVal.current = Math.max(0, hitFlashVal.current - delta * 5);
      if (hitFlashRef.current) {
        hitFlashRef.current.visible = hitFlashVal.current > 0.1;
        hitFlashRef.current.material.opacity = hitFlashVal.current * 0.5;
      }
    }

    // Update HP Bar
    if (hpBarRef.current) {
      const hpPercent = data.hp / data.maxHp;
      hpBarRef.current.scale.x = hpPercent;
      hpBarRef.current.position.x = -(1 - hpPercent) / 2;
    }

    playerRef.getWorldPosition(playerPos);
    const { x, y, z } = rbRef.current.translation();
    enemyPos.set(x, y, z);

    moveDir.subVectors(playerPos, enemyPos).normalize();
    moveDir.y = 0;

    // PHYSICS-SMOOTHED VELOCITY
    const currentVel = rbRef.current.linvel();
    const targetVelX = moveDir.x * stats.speed;
    const targetVelZ = moveDir.z * stats.speed;

    rbRef.current.setLinvel({
        x: THREE.MathUtils.lerp(currentVel.x, targetVelX, 0.1),
        y: currentVel.y,
        z: THREE.MathUtils.lerp(currentVel.z, targetVelZ, 0.1)
    }, true);

    // Smooth Rotation
    if (moveDir.lengthSq() > 0.1) {
      const targetRotation = Math.atan2(moveDir.x, moveDir.z);
      const currentRot = rbRef.current.rotation();
      const currentQuat = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);
      const newRotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), targetRotation);
      currentQuat.slerp(newRotation, 10 * delta);
      rbRef.current.setRotation(currentQuat, true);

      if (visualRef.current) {
        const t = _state.clock.getElapsedTime();
        visualRef.current.position.y = Math.sin(t * stats.speed * 3) * 0.05;
        visualRef.current.rotation.z = Math.sin(t * stats.speed * 3) * 0.05;
      }
    }
  });

  const handleCollision = (e: any) => {
    if (isDead.current) return;
    if (e.other.rigidBodyObject?.name === 'player') {
        takeDamage(stats.damage);
        hitFlashVal.current = 1;
        const knockbackDir = moveDir.clone().negate().multiplyScalar(8);
        rbRef.current?.applyImpulse({ x: knockbackDir.x, y: 3, z: knockbackDir.z }, true);
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
      mass={5}
    >
      <CapsuleCollider args={[0.5, stats.scale * 0.8]} position={[0, stats.scale, 0]} />

      <group ref={visualRef}>
          <mesh ref={hitFlashRef} visible={false} position={[0, stats.scale, 0]}>
            <sphereGeometry args={[stats.scale + 0.3]} />
            <meshBasicMaterial color="white" transparent opacity={0} />
          </mesh>

          <group ref={contentRef} scale={stats.scale}>
            {data.type === 'skeleton' && <Skeleton />}
            {data.type === 'ninja' && <Ninja />}
            {data.type === 'oni' && <Oni />}
            {data.type === 'samurai' && <Samurai />}

            {data.isElite && (
              <mesh position={[0, 0.5, 0]}>
                <sphereGeometry args={[1.5]} />
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

          <group position={[0, stats.scale * 2.5, 0]}>
              <mesh>
                  <planeGeometry args={[1.2, 0.18]} />
                  <meshBasicMaterial color="#1a1a1a" transparent opacity={0.8} />
              </mesh>
              <mesh ref={hpBarRef} position={[-(1.2 - hpPercent * 1.2) / 2, 0, 0.01]} scale={[hpPercent, 1, 1]}>
                  <planeGeometry args={[1.2, 0.12]} />
                  <meshBasicMaterial color={hpPercent > 0.5 ? "#2ecc71" : (hpPercent > 0.25 ? "#f1c40f" : "#e74c3c")} />
              </mesh>
          </group>
      </group>
    </RigidBody>
  );
}

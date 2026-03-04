import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, RapierRigidBody } from "@react-three/rapier";
import { Mesh } from "three";
import { useControls } from "../hooks/useControls";
import { usePlayerMovement } from "../hooks/usePlayerMovement";
import { useGameStore } from "../store/useGameStore";
import { CONFIG } from "../config";
import { RoninV2 } from "./models/RoninV2";

/**
 * OPTIMIZED PLAYER COMPONENT
 * Implements a physics-driven character using Rapier.
 */
export const Player = () => {
  const { camera } = useThree();
  const setPlayerRef = useGameStore((state) => state.setPlayerRef);
  const attackNearbyEnemies = useGameStore((state) => state.attackNearbyEnemies);

  const controls = useControls();
  const rb = useRef<RapierRigidBody>(null);
  const meshRef = useRef<Mesh>(null);
  const lastAttackTime = useRef(0);

  const { move } = usePlayerMovement(
    rb,
    CONFIG.PLAYER.MOVE_SPEED,
    CONFIG.PLAYER.ROTATION_SPEED
  );

  useEffect(() => {
    if (meshRef.current) setPlayerRef(meshRef.current);
  }, [setPlayerRef]);

  useFrame((_state, delta) => {
    if (!rb.current || !meshRef.current) return;

    move(
      controls.forward,
      controls.backward,
      controls.left,
      controls.right,
      delta,
      meshRef as any,
      camera
    );

    // Attack logic
    if (controls.attack && _state.clock.elapsedTime - lastAttackTime.current > 0.5) {
      lastAttackTime.current = _state.clock.elapsedTime;
      const pos = rb.current.translation();
      attackNearbyEnemies([pos.x, pos.y, pos.z], 3, 20);

      // Visual feedback (swing)
      if (meshRef.current) {
          // Simple visual punch/shake or call an animation trigger on RoninV2
      }
    }
  });

  return (
    <RigidBody
      ref={rb}
      position={[0, 2, 0]}
      enabledRotations={[false, false, false]}
      colliders={false}
      mass={CONFIG.PLAYER.MASS}
      friction={0}
      name="player"
      userData={{ type: 'player' }}
    >
      <CapsuleCollider args={[CONFIG.PLAYER.COLLIDER_HEIGHT / 2 - CONFIG.PLAYER.COLLIDER_RADIUS, CONFIG.PLAYER.COLLIDER_RADIUS]} />

      <group ref={meshRef}>
        <RoninV2
          velocity={rb.current?.linvel() || { x: 0, y: 0, z: 0 }}
          isAttacking={controls.attack}
        />
      </group>
    </RigidBody>
  );
};

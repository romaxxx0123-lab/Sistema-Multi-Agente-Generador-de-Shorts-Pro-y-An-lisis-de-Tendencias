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
 * Performance optimized for scaling in Part 2.
 */
export const Player = () => {
  const { camera } = useThree();
  const setPlayerRef = useGameStore((state) => state.setPlayerRef);

  // Controls & Movement state
  const controls = useControls();
  const rb = useRef<RapierRigidBody>(null);
  const meshRef = useRef<Mesh>(null);

  const { move } = usePlayerMovement(
    rb,
    CONFIG.PLAYER.MOVE_SPEED,
    CONFIG.PLAYER.ROTATION_SPEED
  );

  // Sync mesh reference with store for camera following
  useEffect(() => {
    if (meshRef.current) setPlayerRef(meshRef.current);
  }, [setPlayerRef]);

  useFrame((_state, delta) => {
    if (!rb.current || !meshRef.current) return;

    // Execute physics movement logic
    move(
      controls.forward,
      controls.backward,
      controls.left,
      controls.right,
      delta,
      meshRef as any, // Visual rotation on mesh only
      camera
    );
  });

  return (
    <RigidBody
      ref={rb}
      position={[0, 2, 0]}
      enabledRotations={[false, false, false]} // Physics doesn't rotate, we rotate mesh
      colliders={false}
      mass={CONFIG.PLAYER.MASS}
      friction={0} // Smooth movement without sticking
    >
      {/* Physics Collider */}
      <CapsuleCollider args={[CONFIG.PLAYER.COLLIDER_HEIGHT / 2 - CONFIG.PLAYER.COLLIDER_RADIUS, CONFIG.PLAYER.COLLIDER_RADIUS]} />

      {/* Visual Mesh Group */}
      <group ref={meshRef}>
        <RoninV2 velocity={rb.current?.linvel() || { x: 0, y: 0, z: 0 }} />
      </group>
    </RigidBody>
  );
};

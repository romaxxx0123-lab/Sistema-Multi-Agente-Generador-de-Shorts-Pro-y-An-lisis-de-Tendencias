import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody, CapsuleCollider, RapierRigidBody } from "@react-three/rapier";
import { Mesh } from "three";
import { useControls } from "../hooks/useControls";
import { usePlayerMovement } from "../hooks/usePlayerMovement";
import { useGameStore } from "../store/useGameStore";
import { CONFIG } from "../config";

/**
 * OPTIMIZED PLAYER COMPONENT - PART 1A
 * Implements a physics-driven character using Rapier with a placeholder model.
 */
export const Player = () => {
  const { camera } = useThree();
  const setPlayerRef = useGameStore((state) => state.setPlayerRef);
  const passives = useGameStore((state) => state.passives);
  const talents = useGameStore((state) => state.talents);

  const controls = useControls();
  const rb = useRef<RapierRigidBody>(null);
  const meshRef = useRef<Mesh>(null);

  // Calculate speed multiplier from passives and talents
  const moveSpeedLevel = passives.get('movespeed') || 0;
  const talentMoveSpeed = talents.speed || 0;
  const speedMultiplier = (1 + moveSpeedLevel * 0.1) * (1 + talentMoveSpeed * 0.05);

  const { move } = usePlayerMovement(
    rb,
    CONFIG.PLAYER.MOVE_SPEED,
    CONFIG.PLAYER.ROTATION_SPEED,
    speedMultiplier
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
        {/* Placeholder Model for Part 1A */}
        <mesh castShadow>
          <capsuleGeometry args={[CONFIG.PLAYER.COLLIDER_RADIUS, CONFIG.PLAYER.COLLIDER_HEIGHT - CONFIG.PLAYER.COLLIDER_RADIUS * 2, 4, 8]} />
          <meshStandardMaterial color="#3b82f6" />
        </mesh>

        {/* Direction Indicator (Forward) */}
        <mesh position={[0, 0, 0.5]}>
            <boxGeometry args={[0.2, 0.2, 0.5]} />
            <meshStandardMaterial color="#ffffff" />
        </mesh>
      </group>
    </RigidBody>
  );
};

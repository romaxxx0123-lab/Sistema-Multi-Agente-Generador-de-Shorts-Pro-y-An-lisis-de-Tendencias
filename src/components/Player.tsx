import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useSphere } from "@react-three/cannon";
import { Mesh, Vector3 } from "three";
import { useControls } from "../hooks/useControls";
import { usePlayerMovement } from "../hooks/usePlayerMovement";
import { useGameStore } from "../store/useGameStore";
import { GAME_CONFIG } from "../config";

export const Player = () => {
  const { camera } = useThree();
  const setPlayerRef = useGameStore((state) => state.setPlayerRef);

  // Controls & Movement hooks
  const controls = useControls();

  // Physics body (using sphere for simpler survivor-like collisions)
  const [ref, api] = useSphere<Mesh>(() => ({
    mass: GAME_CONFIG.PHYSICS.PLAYER_MASS,
    position: [0, 1, 0],
    args: [GAME_CONFIG.PLAYER.RADIUS],
    fixedRotation: true, // We handle rotation manually for visual mesh
  }));

  const { move } = usePlayerMovement(
    api,
    GAME_CONFIG.PLAYER.MOVE_SPEED,
    GAME_CONFIG.PLAYER.ROTATION_SPEED
  );

  // Sync ref with store
  useEffect(() => {
    if (ref.current) setPlayerRef(ref.current);
  }, [ref, setPlayerRef]);

  useFrame((_state, delta) => {
    if (!ref.current) return;

    // Execute movement logic
    move(
      controls.forward,
      controls.backward,
      controls.left,
      controls.right,
      delta,
      ref,
      camera
    );
  });

  return (
    <mesh ref={ref} castShadow>
      {/* Simple Capsule Placeholder */}
      <capsuleGeometry args={[GAME_CONFIG.PLAYER.RADIUS, GAME_CONFIG.PLAYER.HEIGHT, 4, 8]} />
      <meshStandardMaterial color={GAME_CONFIG.PLAYER.COLOR} />

      {/* Forward indicator (eyes/nose) */}
      <mesh position={[0, 0.4, -0.4]}>
        <boxGeometry args={[0.6, 0.2, 0.2]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </mesh>
  );
};

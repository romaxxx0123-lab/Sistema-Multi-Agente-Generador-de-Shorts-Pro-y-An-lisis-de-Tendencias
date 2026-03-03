import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../store/useGameStore";
import { CONFIG } from "../config";

/**
 * OPTIMIZED CAMERA FOLLOW
 * Implements a stable third-person perspective with fixed offset.
 * Position updated every frame based on player mesh transform.
 */
const _targetPos = new Vector3();
const _offset = new Vector3(
  CONFIG.CAMERA.OFFSET.x,
  CONFIG.CAMERA.OFFSET.y,
  CONFIG.CAMERA.OFFSET.z
);

export const CameraFollow = () => {
  const playerRef = useGameStore((state) => state.playerRef);

  useFrame((state) => {
    if (!playerRef) return;

    // Calculate fixed target camera position relative to player mesh
    _targetPos.copy(playerRef.position).add(_offset);

    // Immediate camera snap (Smooth Lerp planned for Part 1B)
    state.camera.position.copy(_targetPos);

    // Always look slightly ahead of the player center
    state.camera.lookAt(playerRef.position.x, playerRef.position.y + 1, playerRef.position.z);
  });

  return null;
};

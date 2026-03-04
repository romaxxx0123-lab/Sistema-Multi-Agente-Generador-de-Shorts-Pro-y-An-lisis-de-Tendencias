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

    // 1. Transform the offset by the player's current rotation (Yaw)
    // This ensures the camera is always "behind" the player as they rotate
    const rotatedOffset = _offset.clone().applyQuaternion(playerRef.quaternion);

    // 2. Calculate target camera position relative to player
    _targetPos.copy(playerRef.position).add(rotatedOffset);

    // 3. Update camera position (Immediate snap for Part 1A)
    state.camera.position.copy(_targetPos);

    // 4. Always look at the player's upper body
    state.camera.lookAt(playerRef.position.x, playerRef.position.y + 1, playerRef.position.z);
  });

  return null;
};

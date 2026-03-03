import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { useGameStore } from "../store/useGameStore";
import { GAME_CONFIG } from "../config";

export const CameraFollow = () => {
  const playerRef = useGameStore((state) => state.playerRef);
  const offset = new Vector3(
    GAME_CONFIG.CAMERA.OFFSET.x,
    GAME_CONFIG.CAMERA.OFFSET.y,
    GAME_CONFIG.CAMERA.OFFSET.z
  );

  useFrame((state) => {
    if (!playerRef) return;

    // Fixed camera position relative to player
    const targetPosition = new Vector3().copy(playerRef.position).add(offset);

    // Set camera position
    state.camera.position.copy(targetPosition);

    // Look at player (with a slight vertical offset for better view)
    state.camera.lookAt(playerRef.position.x, playerRef.position.y + 1, playerRef.position.z);
  });

  return null;
};

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

export const CameraFollow = () => {
  const playerRef = useGameStore((state) => state.playerRef);
  const bossActive = useGameStore((state) => state.bossActive);
  const { camera } = useThree();

  // Follow parameters from config
  const normalOffset = new Vector3(
    GAME_CONFIG.CAMERA.OFFSET.x,
    GAME_CONFIG.CAMERA.OFFSET.y,
    GAME_CONFIG.CAMERA.OFFSET.z
  );

  const bossOffset = new Vector3(
    GAME_CONFIG.CAMERA.BOSS_OFFSET.x,
    GAME_CONFIG.CAMERA.BOSS_OFFSET.y,
    GAME_CONFIG.CAMERA.BOSS_OFFSET.z
  );
  const smoothTime = GAME_CONFIG.CAMERA.SMOOTH_TIME;

  const targetPosition = useRef(new Vector3());
  const currentLookAt = useRef(new Vector3());
  const targetLookAt = useRef(new Vector3());

  useFrame((_state, delta) => {
    if (!playerRef) return;

    // 1. Get player's current position and rotation
    const playerPos = playerRef.position;
    const playerQuat = playerRef.quaternion;

    // 2. Calculate the desired position in world space
    // Standard survival style: Camera is at a fixed offset from the player (not rotating with them)
    const currentOffset = bossActive ? bossOffset : normalOffset;
    targetPosition.current.copy(playerPos).add(currentOffset);

    // 3. Smoothly move camera towards target position
    camera.position.lerp(targetPosition.current, delta / smoothTime);

    // 4. Always look at the player
    targetLookAt.current.copy(playerPos);

    // Smoothly interpolate the lookAt point
    currentLookAt.current.lerp(targetLookAt.current, delta / smoothTime);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

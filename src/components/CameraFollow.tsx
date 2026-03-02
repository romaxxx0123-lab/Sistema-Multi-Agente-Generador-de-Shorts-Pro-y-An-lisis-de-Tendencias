import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, Quaternion } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

export const CameraFollow = () => {
  const playerRef = useGameStore((state) => state.playerRef);
  const { camera } = useThree();

  // Follow parameters from config
  const offset = new Vector3(
    GAME_CONFIG.CAMERA.OFFSET.x,
    GAME_CONFIG.CAMERA.OFFSET.y,
    GAME_CONFIG.CAMERA.OFFSET.z
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
    // We apply the player's rotation to the offset to stay behind them
    const relativeOffset = offset.clone().applyQuaternion(playerQuat);
    targetPosition.current.copy(playerPos).add(relativeOffset);

    // 3. Smoothly move camera towards target position
    // Lerp is fine for now, we'll refine damping if needed in Part 2
    camera.position.lerp(targetPosition.current, delta / smoothTime);

    // 4. Look slightly ahead of the player
    const lookAheadOffset = new Vector3(0, 0, -GAME_CONFIG.CAMERA.LOOK_AHEAD).applyQuaternion(playerQuat);
    targetLookAt.current.copy(playerPos).add(lookAheadOffset);

    // Smoothly interpolate the lookAt point
    currentLookAt.current.lerp(targetLookAt.current, delta / smoothTime);
    camera.lookAt(currentLookAt.current);
  });

  return null;
};

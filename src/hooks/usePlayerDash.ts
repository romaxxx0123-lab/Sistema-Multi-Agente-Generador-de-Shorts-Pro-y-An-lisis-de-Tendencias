import { useState, useRef, useCallback } from 'react';
import { Vector3, Quaternion, Camera } from 'three';
import { PublicApi } from '@react-three/cannon';
import { useFrame } from '@react-three/fiber';
import { GAME_CONFIG } from '../config';

export const usePlayerDash = (api: PublicApi) => {
  const [isDashing, setIsDashing] = useState(false);
  const [canDash, setCanDash] = useState(true);

  const dashTimer = useRef(0);
  const cooldownTimer = useRef(0);
  const currentDashDirection = useRef(new Vector3());

  // Trigger dash from input
  const performDash = useCallback((
      forward: boolean,
      backward: boolean,
      left: boolean,
      right: boolean,
      playerRef: any,
      camera?: Camera
  ) => {
    if (!canDash || isDashing) return;

    // 1. Calculate direction from movement input
    const input = new Vector3();
    if (forward) input.z -= 1;
    if (backward) input.z += 1;
    if (left) input.x -= 1;
    if (right) input.x += 1;

    if (input.length() === 0) {
      // 2. Stationary Dash: Use character's current forward facing
      const forwardDir = new Vector3(0, 0, -1);
      if (playerRef.current) {
        forwardDir.applyQuaternion(playerRef.current.quaternion);
      }
      currentDashDirection.current.copy(forwardDir).normalize();
    } else {
      input.normalize();

      if (camera) {
          const camForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          camForward.y = 0;
          camForward.normalize();

          const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          camRight.y = 0;
          camRight.normalize();

          currentDashDirection.current.set(0,0,0)
            .add(camRight.multiplyScalar(input.x))
            .add(camForward.multiplyScalar(input.z));
          currentDashDirection.current.normalize();
      } else {
          currentDashDirection.current.copy(input);
      }
    }

    // 3. Initiate dash state
    setIsDashing(true);
    setCanDash(false);
    dashTimer.current = GAME_CONFIG.DASH.DURATION;
    cooldownTimer.current = GAME_CONFIG.DASH.COOLDOWN;

    // SFX Hook
    window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'dash' } }));

    // Apply high initial velocity
    const dashSpeed = GAME_CONFIG.DASH.DISTANCE / GAME_CONFIG.DASH.DURATION;
    api.velocity.set(
      currentDashDirection.current.x * dashSpeed,
      0, // Keep dash on the horizontal plane
      currentDashDirection.current.z * dashSpeed
    );
  }, [api, canDash, isDashing]);

  // Handle frame-based timing for physics consistency
  useFrame((_state, delta) => {
    if (isDashing) {
      dashTimer.current -= delta;
      if (dashTimer.current <= 0) {
        setIsDashing(false);
        // Let movement logic resume velocity control
      } else {
        // Maintain velocity throughout dash duration
        const dashSpeed = GAME_CONFIG.DASH.DISTANCE / GAME_CONFIG.DASH.DURATION;
        api.velocity.set(
          currentDashDirection.current.x * dashSpeed,
          0,
          currentDashDirection.current.z * dashSpeed
        );
      }
    }

    if (!canDash) {
      cooldownTimer.current -= delta;
      if (cooldownTimer.current <= 0) {
        setCanDash(true);
      }
    }
  });

  return { performDash, isDashing, canDash };
};

import { useState, useRef, useCallback } from 'react';
import { Vector3, Quaternion } from 'three';
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
  const performDash = useCallback((forward: boolean, backward: boolean, left: boolean, right: boolean, playerRef: any) => {
    if (!canDash || isDashing) return;

    // 1. Calculate direction from movement input
    const inputDir = new Vector3();
    if (forward) inputDir.z -= 1;
    if (backward) inputDir.z += 1;
    if (left) inputDir.x -= 1;
    if (right) inputDir.x += 1;

    if (inputDir.length() === 0) {
      // 2. Stationary Dash: Use character's current forward facing
      // We get it from the player's world orientation
      const forwardDir = new Vector3(0, 0, -1);
      if (playerRef.current) {
        forwardDir.applyQuaternion(playerRef.current.quaternion);
      }
      currentDashDirection.current.copy(forwardDir).normalize();
    } else {
      // Use movement direction
      currentDashDirection.current.copy(inputDir).normalize();
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

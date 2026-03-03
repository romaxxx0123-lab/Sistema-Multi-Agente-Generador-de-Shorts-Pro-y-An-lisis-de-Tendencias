import { useRef } from 'react';
import { Vector3, Quaternion } from 'three';
import { RapierRigidBody } from '@react-three/rapier';
import { Camera } from 'three';

/**
 * OPTIMIZED PLAYER MOVEMENT HOOK
 * Handles camera-relative movement and smooth rotation using Rapier physics.
 */
export const usePlayerMovement = (
  rb: React.RefObject<RapierRigidBody>,
  speed: number,
  rotationSpeed: number
) => {
  const direction = new Vector3();
  const targetRotation = new Quaternion();

  const move = (
      forward: boolean,
      backward: boolean,
      left: boolean,
      right: boolean,
      delta: number,
      meshRef: React.MutableRefObject<any>,
      camera?: Camera
  ) => {
    if (!rb.current) return;

    direction.set(0, 0, 0);

    // 1. Get Normalized Input vector
    // W/Forward should be negative Z in world space (away from camera)
    const input = new Vector3();
    if (forward) input.z -= 1;
    if (backward) input.z += 1;
    if (left) input.x -= 1;
    if (right) input.x += 1;

    if (input.length() > 0) {
      input.normalize();

      // 2. Transform input relative to camera view
      if (camera) {
          // Camera forward/right are world space directions
          const camForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          camForward.y = 0;
          camForward.normalize();

          const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          camRight.y = 0;
          camRight.normalize();

          // Move relative to camera
          direction.set(0,0,0)
            .add(camRight.multiplyScalar(input.x))
            .add(camForward.multiplyScalar(input.z));
          direction.normalize();
      } else {
          direction.copy(input);
      }

      // 3. Apply Linear Velocity via Rapier
      const currentVel = rb.current.linvel();
      rb.current.setLinvel({
        x: direction.x * speed,
        y: currentVel.y, // Maintain gravity
        z: direction.z * speed
      }, true);

      // 4. Smooth visual rotation towards movement direction
      //atan2(x, z) points towards movement
      const angle = Math.atan2(direction.x, direction.z) + Math.PI; // Adjust for capsule orientation
      targetRotation.setFromAxisAngle(new Vector3(0, 1, 0), angle);

      if (meshRef.current) {
        meshRef.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
      }
    } else {
      // Immediate stop of horizontal movement if no input
      const currentVel = rb.current.linvel();
      rb.current.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
    }
  };

  return { move };
};

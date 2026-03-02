import { useRef } from 'react';
import { Vector3, Quaternion } from 'three';
import { PublicApi } from '@react-three/cannon';

import { Camera } from 'three';

export const usePlayerMovement = (api: PublicApi, speed: number, rotationSpeed: number) => {
  const direction = new Vector3();
  const targetRotation = new Quaternion();
  const velocity = useRef([0, 0, 0]);

  // Subscribe to velocity once
  api.velocity.subscribe((v) => (velocity.current = v));

  const move = (
      forward: boolean,
      backward: boolean,
      left: boolean,
      right: boolean,
      delta: number,
      ref: React.MutableRefObject<any>,
      camera?: Camera
  ) => {
    direction.set(0, 0, 0);

    // 1. Get Input vector
    const input = new Vector3();
    if (forward) input.z -= 1;
    if (backward) input.z += 1;
    if (left) input.x -= 1;
    if (right) input.x += 1;

    if (input.length() > 0) {
      input.normalize();

      // 2. Transform input relative to camera if provided
      if (camera) {
          const camForward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
          camForward.y = 0;
          camForward.normalize();

          const camRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          camRight.y = 0;
          camRight.normalize();

          direction.set(0,0,0)
            .add(camRight.multiplyScalar(input.x))
            .add(camForward.multiplyScalar(input.z));
          direction.normalize();
      } else {
          direction.copy(input);
      }

      // 3. Apply velocity
      api.velocity.set(direction.x * speed, velocity.current[1], direction.z * speed);

      // 4. Smooth rotation towards movement direction
      const angle = Math.atan2(direction.x, direction.z);
      targetRotation.setFromAxisAngle(new Vector3(0, 1, 0), angle);

      if (ref.current) {
        ref.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
      }
    } else {
      // Stop horizontal movement if no input
      api.velocity.set(0, velocity.current[1], 0);
    }
  };

  return { move, velocity };
};

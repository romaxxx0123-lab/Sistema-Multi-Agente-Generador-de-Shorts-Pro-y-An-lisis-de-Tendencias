import { useRef } from 'react';
import { Vector3, Quaternion } from 'three';
import { PublicApi } from '@react-three/cannon';

export const usePlayerMovement = (api: PublicApi, speed: number, rotationSpeed: number) => {
  const direction = new Vector3();
  const targetRotation = new Quaternion();
  const velocity = useRef([0, 0, 0]);

  // Subscribe to velocity once
  api.velocity.subscribe((v) => (velocity.current = v));

  const move = (forward: boolean, backward: boolean, left: boolean, right: boolean, delta: number, ref: React.MutableRefObject<any>) => {
    direction.set(0, 0, 0);
    if (forward) direction.z -= 1;
    if (backward) direction.z += 1;
    if (left) direction.x -= 1;
    if (right) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize();

      // Apply movement relative to the player's world direction (standard WASD)
      api.velocity.set(direction.x * speed, velocity.current[1], direction.z * speed);

      // Smooth rotation towards movement direction
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

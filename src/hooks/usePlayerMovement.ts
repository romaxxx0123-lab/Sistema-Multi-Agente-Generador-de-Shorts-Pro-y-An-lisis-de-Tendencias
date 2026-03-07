import { useRef } from 'react';
import { Vector3, Quaternion, MathUtils } from 'three';
import { RapierRigidBody } from '@react-three/rapier';
import { Camera } from 'three';

/**
 * OPTIMIZED PLAYER MOVEMENT HOOK - PART 2
 * Handles camera-relative movement and smooth rotation using Rapier physics.
 * FIXED: Uses lerped velocity to prevent jitter against walls and smooths rotation.
 */
const _direction = new Vector3();
const _targetRotation = new Quaternion();
const _input = new Vector3();
const _camForward = new Vector3();
const _camRight = new Vector3();
const _up = new Vector3(0, 1, 0);

export const usePlayerMovement = (
  rb: React.RefObject<RapierRigidBody>,
  speed: number,
  rotationSpeed: number,
  speedMultiplier: number = 1.0
) => {
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

    _direction.set(0, 0, 0);
    _input.set(0, 0, 0);

    if (forward) _input.z += 1;
    if (backward) _input.z -= 1;
    if (left) _input.x -= 1;
    if (right) _input.x += 1;

    const currentVel = rb.current.linvel();
    const finalSpeed = speed * speedMultiplier;

    if (_input.lengthSq() > 0) {
      _input.normalize();

      if (camera) {
          _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
          _camForward.y = 0;
          _camForward.normalize();

          _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
          _camRight.y = 0;
          _camRight.normalize();

          _direction.set(0, 0, 0)
            .add(_camRight.multiplyScalar(_input.x))
            .add(_camForward.multiplyScalar(_input.z))
            .normalize();
      } else {
          _direction.copy(_input);
      }

      // PHYSICS SMOOTHING: Lerp velocity to avoid "jitter" when hitting walls
      const targetVelX = _direction.x * finalSpeed;
      const targetVelZ = _direction.z * finalSpeed;

      rb.current.setLinvel({
        x: MathUtils.lerp(currentVel.x, targetVelX, 0.2),
        y: currentVel.y,
        z: MathUtils.lerp(currentVel.z, targetVelZ, 0.2)
      }, true);

      // Smooth visual rotation
      const angle = Math.atan2(_direction.x, _direction.z);
      _targetRotation.setFromAxisAngle(_up, angle);

      if (meshRef.current) {
        meshRef.current.quaternion.slerp(_targetRotation, rotationSpeed * delta);
      }
    } else {
      // Smooth deceleration
      rb.current.setLinvel({
          x: MathUtils.lerp(currentVel.x, 0, 0.3),
          y: currentVel.y,
          z: MathUtils.lerp(currentVel.z, 0, 0.3)
      }, true);
    }
  };

  return { move };
};

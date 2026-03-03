import { useRef } from 'react';
import { Vector3, Quaternion } from 'three';
import { RapierRigidBody } from '@react-three/rapier';
import { Camera } from 'three';

/**
 * OPTIMIZED PLAYER MOVEMENT HOOK
 * Handles camera-relative movement and smooth rotation using Rapier physics.
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
  rotationSpeed: number
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

    // 1. Get Normalized Input vector
    if (forward) _input.z -= 1;
    if (backward) _input.z += 1;
    if (left) _input.x -= 1;
    if (right) _input.x += 1;

    if (_input.lengthSq() > 0) {
      _input.normalize();

      // 2. Transform input relative to camera view
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

      // 3. Apply Linear Velocity via Rapier
      const currentVel = rb.current.linvel();
      rb.current.setLinvel({
        x: _direction.x * speed,
        y: currentVel.y,
        z: _direction.z * speed
      }, true);

      // 4. Smooth visual rotation
      const angle = Math.atan2(_direction.x, _direction.z);
      _targetRotation.setFromAxisAngle(_up, angle);

      if (meshRef.current) {
        meshRef.current.quaternion.slerp(_targetRotation, rotationSpeed * delta);
      }
    } else {
      const currentVel = rb.current.linvel();
      rb.current.setLinvel({ x: 0, y: currentVel.y, z: 0 }, true);
    }
  };

  return { move };
};

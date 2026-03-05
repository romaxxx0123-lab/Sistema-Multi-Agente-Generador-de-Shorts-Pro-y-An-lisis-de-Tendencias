import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { CONFIG } from '../config';

/**
 * RONIN SURVIVOR - STABLE CAMERA RIG
 * Follows the player position smoothly while ignoring their rotation.
 */
interface CameraRigProps {
  target: any; // Support RefObject, Mesh, or Rapier Body
}

const _playerWorldPos = new Vector3();
const _targetCameraPos = new Vector3();
const _lookAtPoint = new Vector3();

export function CameraRig({ target }: CameraRigProps) {
  const { camera } = useThree();

  // Smooth position tracking
  const smoothPosition = useRef(new Vector3());
  const initialized = useRef(false);

  useFrame((_state, delta) => {
    const obj = target?.current || target;
    if (!obj) return;

    // 1. Get world position (Robustly)
    if (obj.getWorldPosition) {
      obj.getWorldPosition(_playerWorldPos);
    } else if (obj.translation) {
      const t = obj.translation();
      _playerWorldPos.set(t.x, t.y, t.z);
    } else {
      _playerWorldPos.copy(obj.position || {x:0, y:0, z:0});
    }

    // 2. Calculate ideal world-space position
    // We want the camera at -8m (CONFIG.CAMERA.OFFSET_Z) from the player in world Z.
    // playerPos.z - 8 = behind the player in world space.
    _targetCameraPos.set(
      _playerWorldPos.x + CONFIG.CAMERA.OFFSET_X,
      _playerWorldPos.y + CONFIG.CAMERA.OFFSET_Y,
      _playerWorldPos.z + CONFIG.CAMERA.OFFSET_Z
    );

    // 3. Initialize or Lerp
    if (!initialized.current) {
      smoothPosition.current.copy(_targetCameraPos);
      initialized.current = true;
    }

    // Use a fixed alpha if delta is weird, but CONFIG.CAMERA.SMOOTH_SPEED * delta is standard
    smoothPosition.current.lerp(_targetCameraPos, Math.min(1, CONFIG.CAMERA.SMOOTH_SPEED * delta));

    // 4. Apply to camera
    camera.position.copy(smoothPosition.current);

    // 5. Look at player's torso
    _lookAtPoint.set(
      _playerWorldPos.x,
      _playerWorldPos.y + CONFIG.CAMERA.LOOK_AT_HEIGHT,
      _playerWorldPos.z
    );
    camera.lookAt(_lookAtPoint);

    // 6. Fix Z-roll
    camera.up.set(0, 1, 0);
  });

  return null;
}

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Mesh, Vector3, Quaternion } from 'three';
import { useControls } from '../hooks/useControls';

export const Player = () => {
  const { forward, backward, left, right } = useControls();
  const speed = 5;
  const rotationSpeed = 12.56; // 720 degrees in radians per second

  // Physics body - using a sphere for stable movement
  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 1,
    position: [0, 1, 0],
    fixedRotation: true, // Prevent the sphere from rolling
    args: [0.5], // 0.5m radius
  }));

  const velocity = useRef([0, 0, 0]);
  useEffect(() => {
    const unsubscribe = api.velocity.subscribe((v) => (velocity.current = v));
    return unsubscribe;
  }, [api.velocity]);

  const direction = new Vector3();
  const targetRotation = new Quaternion();

  useFrame((_state, delta) => {
    // 1. Calculate direction based on input
    // Camera is at [0, 4, 8] looking at [0, 0, 0]
    // So forward is -Z, backward is +Z, left is -X, right is +X
    direction.set(0, 0, 0);
    if (forward) direction.z -= 1;
    if (backward) direction.z += 1;
    if (left) direction.x -= 1;
    if (right) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize();

      // 2. Movement
      api.velocity.set(direction.x * speed, velocity.current[1], direction.z * speed);

      // 3. Rotation
      // Rotate mesh towards movement direction
      const angle = Math.atan2(direction.x, direction.z);
      targetRotation.setFromAxisAngle(new Vector3(0, 1, 0), angle);

      if (ref.current) {
        ref.current.quaternion.slerp(targetRotation, rotationSpeed * delta);
      }
    } else {
      // Stop horizontal movement if no input
      api.velocity.set(0, velocity.current[1], 0);
    }
  });

  return (
    <mesh ref={ref} castShadow>
      {/* Visual representation: A Capsule */}
      <capsuleGeometry args={[0.5, 1, 4, 16]} />
      <meshStandardMaterial color="#1cb0f6" />
    </mesh>
  );
};

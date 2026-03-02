
import React, { useRef, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Sphere, Box, Cylinder } from '@react-three/drei';
import * as THREE from 'three';

interface PlayerProps {
  isNight: boolean;
}

export const Player: React.FC<PlayerProps> = ({ isNight }) => {
  const meshRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const { camera } = useThree();
  const [keys, setKeys] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => setKeys(s => ({ ...s, [e.code]: true }));
    const handleKeyUp = (e: KeyboardEvent) => setKeys(s => ({ ...s, [e.code]: false }));
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const speed = 8 * delta;
    const direction = new THREE.Vector3();

    if (keys['KeyW']) direction.z -= 1;
    if (keys['KeyS']) direction.z += 1;
    if (keys['KeyA']) direction.x -= 1;
    if (keys['KeyD']) direction.x += 1;

    if (direction.length() > 0) {
      direction.normalize();
      meshRef.current.position.add(direction.multiplyScalar(speed));

      // Rotate towards movement
      const targetRotation = Math.atan2(direction.x, direction.z);
      meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation, 0.15);

      // Animation
      const t = state.clock.getElapsedTime();
      if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(t * 15) * 0.7;
      if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(t * 15 + Math.PI) * 0.7;
      if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(t * 15 + Math.PI) * 0.6;
      if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(t * 15) * 0.6;
    } else {
      // Idle reset
      if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
      if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
      if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
      if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
    }

    // Smooth Camera Follow
    const cameraOffset = new THREE.Vector3(0, 15, 20);
    const playerPos = meshRef.current.position.clone();
    const targetCameraPos = playerPos.add(cameraOffset);
    camera.position.lerp(targetCameraPos, 0.1);
    camera.lookAt(meshRef.current.position);
  });

  return (
    <group ref={meshRef} position={[0, 0.5, 0]}>
      {/* Body */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.3]} />
        <meshStandardMaterial color="#1cb0f6" />
      </mesh>

      {/* Head */}
      <Sphere args={[0.22]} position={[0, 0.9, 0]} castShadow>
        <meshStandardMaterial color="#ffdbac" />
      </Sphere>

      {/* Backpack */}
      <Box args={[0.4, 0.5, 0.15]} position={[0, 0.5, -0.2]} castShadow>
        <meshStandardMaterial color="#0c4a6e" />
      </Box>

      {/* Legs */}
      <mesh ref={leftLegRef} position={[-0.15, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.06, 0.45]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh ref={rightLegRef} position={[0.15, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.06, 0.45]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[-0.35, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.45]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>
      <mesh ref={rightArmRef} position={[0.35, 0.7, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.45]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>

      {/* Flashlight at night */}
      {isNight && (
          <group position={[0.3, 0.5, 0.2]}>
              <Cylinder args={[0.05, 0.05, 0.2]} rotation={[Math.PI/2, 0, 0]}>
                  <meshStandardMaterial color="#222" />
              </Cylinder>
              <spotLight
                position={[0, 0, 0.1]}
                angle={0.4}
                penumbra={0.5}
                intensity={5}
                distance={25}
                castShadow
              />
          </group>
      )}
    </group>
  );
};

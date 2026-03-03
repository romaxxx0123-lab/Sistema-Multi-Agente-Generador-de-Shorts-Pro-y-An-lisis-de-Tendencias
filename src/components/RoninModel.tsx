import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh, Group } from 'three';

/**
 * STYLIZED RONIN PROCEDURAL MODEL
 * A high-fidelity character built with primitives.
 * Features: Torso, Head with Visor, Arms, and a Katana.
 * Includes "idle" bobbing animation.
 */
export const RoninModel = () => {
  const groupRef = useRef<Group>(null);
  const leftArmRef = useRef<Mesh>(null);
  const rightArmRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    // Subtle idle animation
    groupRef.current.position.y = Math.sin(t * 2) * 0.05;

    // Arm movement simulation
    if (leftArmRef.current && rightArmRef.current) {
        leftArmRef.current.rotation.x = Math.sin(t * 2) * 0.1;
        rightArmRef.current.rotation.x = -Math.sin(t * 2) * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* TORSO / KIMONO */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[0.6, 0.8, 0.4]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* BELT (OBI) */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.65, 0.1, 0.45]} />
        <meshStandardMaterial color="#882222" />
      </mesh>

      {/* HEAD */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#333333" />

        {/* VISOR/EYES */}
        <mesh position={[0, 0.05, 0.21]}>
          <boxGeometry args={[0.3, 0.1, 0.05]} />
          <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={2} />
        </mesh>
      </mesh>

      {/* ARMS */}
      {/* Left */}
      <mesh ref={leftArmRef} position={[-0.4, 0.9, 0]} castShadow>
        <boxGeometry args={[0.15, 0.5, 0.15]} />
        <meshStandardMaterial color="#222222" />
      </mesh>

      {/* Right (Holding Katana) */}
      <group position={[0.4, 0.9, 0]}>
        <mesh ref={rightArmRef} castShadow>
          <boxGeometry args={[0.15, 0.5, 0.15]} />
          <meshStandardMaterial color="#222222" />
        </mesh>

        {/* KATANA */}
        <group position={[0, -0.2, 0.2]} rotation={[Math.PI / 4, 0, 0]}>
          {/* Handle */}
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.05, 0.2, 0.05]} />
            <meshStandardMaterial color="#442222" />
          </mesh>
          {/* Blade */}
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.02, 1.0, 0.08]} />
            <meshStandardMaterial color="#cccccc" metalness={1} roughness={0.2} />
          </mesh>
        </group>
      </group>

      {/* LEGS */}
      <mesh position={[-0.2, 0.2, 0]} castShadow>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
      <mesh position={[0.2, 0.2, 0]} castShadow>
        <boxGeometry args={[0.2, 0.4, 0.2]} />
        <meshStandardMaterial color="#111111" />
      </mesh>
    </group>
  );
};

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * NINJA ENEMY - FAST TYPE
 * Lean, dark clothing, glowing purple eyes.
 */
export const Ninja = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.position.y = Math.sin(t * 6) * 0.05 + 0.8;
  });

  return (
    <group {...props} ref={groupRef} scale={0.9}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.35, 0.7, 0.2]} />
        <meshStandardMaterial color="#2d3436" roughness={1} />
      </mesh>

      {/* Head with Scarf */}
      <group position={[0, 0.5, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial color="#111" />
        </mesh>

        {/* Scarf Tail */}
        <mesh position={[0.1, 0, -0.15]} rotation={[0.5, 0.2, 0]}>
          <boxGeometry args={[0.05, 0.1, 0.4]} />
          <meshStandardMaterial color="#b33939" />
        </mesh>

        {/* Glowing Eyes */}
        <mesh position={[0.07, 0.05, 0.13]}>
          <planeGeometry args={[0.08, 0.02]} />
          <meshStandardMaterial color="#8e44ad" emissive="#8e44ad" emissiveIntensity={4} />
        </mesh>
        <mesh position={[-0.07, 0.05, 0.13]}>
          <planeGeometry args={[0.08, 0.02]} />
          <meshStandardMaterial color="#8e44ad" emissive="#8e44ad" emissiveIntensity={4} />
        </mesh>
      </group>

      {/* Scarf Wrap */}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.3, 0.08, 0.3]} />
        <meshStandardMaterial color="#b33939" />
      </mesh>
    </group>
  );
};

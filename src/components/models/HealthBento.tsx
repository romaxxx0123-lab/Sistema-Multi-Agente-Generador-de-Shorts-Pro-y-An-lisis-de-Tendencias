import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * HEALTH BENTO - TRADITIONAL FOOD BOX
 */
export const HealthBento = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += 0.02;
  });

  return (
    <group {...props} ref={groupRef} position={[0, 0.2, 0]}>
      {/* Box */}
      <mesh castShadow>
        <boxGeometry args={[0.4, 0.15, 0.3]} />
        <meshStandardMaterial color="#d63031" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Interior Rice (White) */}
      <mesh position={[0, 0.05, 0]}>
        <boxGeometry args={[0.35, 0.08, 0.25]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>

      {/* Umeboshi (Red Plum) */}
      <mesh position={[0, 0.1, 0]}>
        <sphereGeometry args={[0.04]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
    </group>
  );
};

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * POWERUP SCROLL (MAKIMONO)
 */
export const PowerupScroll = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 2) * 0.1 + 0.5;
  });

  return (
    <group {...props} ref={groupRef} rotation={[0, 0, Math.PI / 4]}>
      {/* Scroll Paper */}
      <mesh castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.4, 12]} />
        <meshStandardMaterial color="#ecf0f1" roughness={0.8} />
      </mesh>

      {/* End Caps (Wood) */}
      <mesh position={[0, 0.22, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
        <meshStandardMaterial color="#4b3621" />
      </mesh>
      <mesh position={[0, -0.22, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.05, 12]} />
        <meshStandardMaterial color="#4b3621" />
      </mesh>

      {/* Ribbon */}
      <mesh position={[0, 0, 0.08]}>
        <boxGeometry args={[0.02, 0.05, 0.02]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>
    </group>
  );
};

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";

/**
 * XP SHARD - CRYSTAL MAGATAMA STYLE
 */
export const XPShard = (props: any) => {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.y += 0.05;
    meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 4) * 0.1 + 0.5;
  });

  return (
    <mesh {...props} ref={meshRef} castShadow>
      <octahedronGeometry args={[0.2, 0]} />
      <meshStandardMaterial
        color="#00d2ff"
        emissive="#00d2ff"
        emissiveIntensity={2}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
};

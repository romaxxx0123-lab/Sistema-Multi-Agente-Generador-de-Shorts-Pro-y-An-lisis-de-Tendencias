import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";

/**
 * GOLD KOBAN - TRADITIONAL COIN
 */
export const GoldKoban = (props: any) => {
  const meshRef = useRef<Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    meshRef.current.rotation.z += 0.05;
  });

  return (
    <mesh {...props} ref={meshRef} rotation={[Math.PI / 2, 0, 0]} castShadow>
      <capsuleGeometry args={[0.1, 0.2, 4, 8]} />
      <meshStandardMaterial color="#f1c40f" metalness={1} roughness={0.1} />
    </mesh>
  );
};

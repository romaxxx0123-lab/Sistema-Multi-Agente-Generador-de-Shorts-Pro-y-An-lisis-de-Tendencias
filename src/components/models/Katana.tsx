import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";

export const Katana = (props: any) => {
  const bladeRef = useRef<Mesh>(null);

  return (
    <group {...props} rotation={[0, 0, Math.PI / 4]}>
      {/* Blade */}
      <mesh ref={bladeRef} position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.02, 0.8, 0.05]} />
        <meshStandardMaterial color="#dfe6e9" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* Tsuba (Guard) */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.08, 0.02, 0.08]} />
        <meshStandardMaterial color="#2d3436" metalness={0.8} />
      </mesh>

      {/* Tsuka (Handle) */}
      <mesh position={[0, -0.15, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        <meshStandardMaterial color="#d63031" roughness={0.8} />
      </mesh>
    </group>
  );
};

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface SlashTrailProps {
  active: boolean;
  progress: number;
}

export const SlashTrail = ({ active, progress }: SlashTrailProps) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.visible = active;
    if (active) {
      // Scale and fade based on progress
      meshRef.current.scale.setScalar(0.8 + progress * 0.4);
      if (meshRef.current.material instanceof THREE.MeshStandardMaterial) {
        meshRef.current.material.opacity = Math.sin(progress * Math.PI) * 0.8;
      }
    }
  });

  return (
    <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.5]}>
      <torusGeometry args={[1.5, 0.05, 16, 32, Math.PI * 0.8]} />
      <meshStandardMaterial
        color="#00d2ff"
        emissive="#00d2ff"
        emissiveIntensity={4}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
};

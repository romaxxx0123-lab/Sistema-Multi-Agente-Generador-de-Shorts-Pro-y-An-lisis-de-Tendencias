import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * ONI ENEMY - TANK TYPE
 * Large, muscular, with horns and a kanabo club.
 */
export const Oni = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.position.y = Math.sin(t * 3) * 0.03 + 1;
    groupRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
  });

  return (
    <group {...props} ref={groupRef} scale={1.2}>
      {/* Body */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.7, 0.8, 0.5]} />
        <meshStandardMaterial color="#c0392b" roughness={0.6} />
      </mesh>

      {/* Head */}
      <group position={[0, 0.6, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
          <meshStandardMaterial color="#c0392b" />
        </mesh>

        {/* Horns */}
        <mesh position={[0.15, 0.25, 0]} rotation={[0, 0, -0.3]}>
          <coneGeometry args={[0.05, 0.2, 8]} />
          <meshStandardMaterial color="#ecf0f1" />
        </mesh>
        <mesh position={[-0.15, 0.25, 0]} rotation={[0, 0, 0.3]}>
          <coneGeometry args={[0.05, 0.2, 8]} />
          <meshStandardMaterial color="#ecf0f1" />
        </mesh>

        {/* Glowing Eyes */}
        <mesh position={[0.1, 0.1, 0.21]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={3} />
        </mesh>
        <mesh position={[-0.1, 0.1, 0.21]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={3} />
        </mesh>
      </group>

      {/* Kanabo Club */}
      <group position={[0.5, 0, 0.2]} rotation={[0.5, 0, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.08, 0.05, 1.2, 8]} />
          <meshStandardMaterial color="#2c3e50" metalness={0.5} />
        </mesh>
        {/* Spikes */}
        {[...Array(8)].map((_, i) => (
           <mesh key={i} position={[0, i * 0.1 - 0.4, 0.08]} rotation={[0, 0, 0]}>
             <sphereGeometry args={[0.03]} />
             <meshStandardMaterial color="#7f8c8d" metalness={0.9} />
           </mesh>
        ))}
      </group>
    </group>
  );
};

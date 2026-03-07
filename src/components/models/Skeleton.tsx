import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * SKELETON ENEMY - SWARM TYPE
 * Exposed bones, ragged armor, glowing red eyes.
 */
export const Skeleton = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    groupRef.current.rotation.z = Math.sin(t * 4) * 0.1;
  });

  return (
    <group {...props} ref={groupRef} scale={1.0}>
      {/* Spine */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
        <meshStandardMaterial color="#ecf0f1" roughness={0.9} />
      </mesh>

      {/* Ribs */}
      {[...Array(3)].map((_, i) => (
        <mesh key={i} position={[0, i * 0.15 - 0.1, 0]} castShadow>
          <torusGeometry args={[0.15, 0.03, 8, 12]} />
          <meshStandardMaterial color="#ecf0f1" />
        </mesh>
      ))}

      {/* Head (Skull) */}
      <group position={[0, 0.45, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.22, 0.25, 0.22]} />
          <meshStandardMaterial color="#ecf0f1" />
        </mesh>

        {/* Eye Sockets */}
        <mesh position={[0.06, 0.05, 0.11]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#c0392b" emissive="#ff0000" emissiveIntensity={5} />
        </mesh>
        <mesh position={[-0.06, 0.05, 0.11]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#c0392b" emissive="#ff0000" emissiveIntensity={5} />
        </mesh>
      </group>

      {/* Rags (Armor) */}
      <mesh position={[0, 0.2, 0]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.4, 0.2, 0.2]} />
        <meshStandardMaterial color="#57606f" transparent opacity={0.8} />
      </mesh>
    </group>
  );
};

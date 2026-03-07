import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";

/**
 * SAMURAI ENEMY - ELITE TYPE
 * Full traditional armor, kabuto helmet, and a master's katana.
 * Larger and more imposing than other enemies.
 */
export const Samurai = (props: any) => {
  const groupRef = useRef<Group>(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    // Intimidating slow breathing/bobbing
    groupRef.current.position.y = Math.sin(t * 2) * 0.04 + 1.2;
    groupRef.current.rotation.y = Math.sin(t * 0.3) * 0.05;
  });

  return (
    <group {...props} ref={groupRef} scale={1.4}>
      {/* Body Armor (Do) */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.5, 0.7, 0.35]} />
        <meshStandardMaterial color="#2c3e50" roughness={0.3} metalness={0.6} />
      </mesh>

      {/* Shoulder Guards (Sode) */}
      <mesh position={[0.3, 0.2, 0]} rotation={[0, 0, -0.2]} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.3]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <mesh position={[-0.3, 0.2, 0]} rotation={[0, 0, 0.2]} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.3]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>

      {/* Head with Kabuto Helmet */}
      <group position={[0, 0.55, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.35, 0.35, 0.35]} />
          <meshStandardMaterial color="#2c3e50" />
        </mesh>

        {/* Helmet Crest (Maedate) */}
        <mesh position={[0, 0.25, 0.15]} rotation={[0.5, 0, 0]}>
          <boxGeometry args={[0.05, 0.3, 0.05]} />
          <meshStandardMaterial color="#f1c40f" metalness={0.9} />
        </mesh>

        {/* Mask (Menpo) - Glowing Eyes */}
        <mesh position={[0.08, 0, 0.18]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#3498db" emissive="#3498db" emissiveIntensity={5} />
        </mesh>
        <mesh position={[-0.08, 0, 0.18]}>
          <sphereGeometry args={[0.04]} />
          <meshStandardMaterial color="#3498db" emissive="#3498db" emissiveIntensity={5} />
        </mesh>
      </group>

      {/* Katana - Held in ready position */}
      <group position={[0.4, -0.1, 0.3]} rotation={[1.2, 0, 0.5]}>
        {/* Blade */}
        <mesh position={[0, 0.6, 0]} castShadow>
          <boxGeometry args={[0.01, 1.2, 0.06]} />
          <meshStandardMaterial color="#ecf0f1" metalness={1} roughness={0} />
        </mesh>
        {/* Guard (Tsuba) */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[0.08, 0.08, 0.02, 16]} />
          <meshStandardMaterial color="#f1c40f" metalness={0.8} />
        </mesh>
        {/* Handle (Tsuka) */}
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
    </group>
  );
};

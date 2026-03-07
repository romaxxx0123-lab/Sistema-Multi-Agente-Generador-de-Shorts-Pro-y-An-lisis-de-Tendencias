/**
 * STONE LANTERN (TŌRŌ)
 */
export const StoneLantern = ({  scale = 1 , ...props }: any) => {
  return (
    <group {...props} scale={scale}>
      {/* Base */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color="#7f8c8d" roughness={0.9} />
      </mesh>

      {/* Pillar */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.2, 0.8, 6]} />
        <meshStandardMaterial color="#7f8c8d" />
      </mesh>

      {/* Light Chamber */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[0.45, 0.4, 0.45]} />
        <meshStandardMaterial color="#7f8c8d" />
      </mesh>

      {/* The Light */}
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[0.3, 0.3, 0.3]} />
        <meshStandardMaterial color="#f1c40f" emissive="#f1c40f" emissiveIntensity={2} />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 1.7, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.6, 0.3, 4]} />
        <meshStandardMaterial color="#2c3e50" />
      </mesh>
    </group>
  );
};

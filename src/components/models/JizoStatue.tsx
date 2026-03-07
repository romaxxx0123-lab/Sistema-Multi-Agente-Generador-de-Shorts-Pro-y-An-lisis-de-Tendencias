/**
 * JIZO STATUE - PROTECTOR OF TRAVELERS
 */
export const JizoStatue = ({  scale = 1 , ...props }: any) => {
  return (
    <group {...props} scale={scale}>
      {/* Base Stone */}
      <mesh position={[0, 0.1, 0]} castShadow>
        <boxGeometry args={[0.4, 0.2, 0.4]} />
        <meshStandardMaterial color="#95a5a6" />
      </mesh>

      {/* Body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.18, 0.6, 8]} />
        <meshStandardMaterial color="#7f8c8d" />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.9, 0]} castShadow>
        <sphereGeometry args={[0.12, 8, 8]} />
        <meshStandardMaterial color="#7f8c8d" />
      </mesh>

      {/* Red Bib (Procedural accessory) */}
      <mesh position={[0, 0.75, 0.08]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.15, 0.15, 0.02]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>
    </group>
  );
};

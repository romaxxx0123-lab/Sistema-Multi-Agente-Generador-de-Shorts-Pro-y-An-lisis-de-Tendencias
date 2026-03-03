/**
 * ZEN ROCK - STYLIZED
 */
export const ZenRock = ({  scale = 1 , ...props }: any) => {
  return (
    <group {...props} scale={scale}>
      <mesh castShadow receiveShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#636e72" roughness={0.9} />
      </mesh>
      <mesh position={[0.8, -0.2, 0.5]} scale={0.5} castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#2d3436" roughness={1} />
      </mesh>
    </group>
  );
};

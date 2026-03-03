/**
 * STYLIZED ENVIRONMENT PROPS
 * Procedural low-poly props to enrich the arena.
 */

export const StylizedRock = ({ position, scale = 1, rotation = [0, 0, 0] }: any) => (
  <mesh position={position} scale={scale} rotation={rotation} castShadow receiveShadow>
    <dodecahedronGeometry args={[1, 0]} />
    <meshStandardMaterial color="#555555" flatShading />
  </mesh>
);

export const StylizedTree = ({ position, scale = 1 }: any) => (
  <group position={position} scale={scale}>
    {/* Trunk */}
    <mesh position={[0, 1, 0]} castShadow>
      <cylinderGeometry args={[0.2, 0.3, 2, 6]} />
      <meshStandardMaterial color="#442211" />
    </mesh>
    {/* Foliage */}
    <mesh position={[0, 2.5, 0]} castShadow>
      <coneGeometry args={[1, 2, 6]} />
      <meshStandardMaterial color="#113311" flatShading />
    </mesh>
    <mesh position={[0, 3.5, 0]} castShadow>
      <coneGeometry args={[0.8, 1.5, 6]} />
      <meshStandardMaterial color="#114411" flatShading />
    </mesh>
  </group>
);

export const EnvironmentProps = () => {
  return (
    <group>
      {/* Scattering some rocks */}
      <StylizedRock position={[-10, 0.5, -15]} scale={1.2} rotation={[0.4, 0.2, 0.5]} />
      <StylizedRock position={[12, 0.4, -8]} scale={0.8} rotation={[0.1, 0.8, 0.2]} />
      <StylizedRock position={[-15, 0.6, 12]} scale={1.5} rotation={[0.5, 0.1, 0.9]} />
      <StylizedRock position={[8, 0.3, 18]} scale={1.0} rotation={[0.9, 0.4, 0.1]} />

      {/* Scattering some trees near boundaries */}
      <StylizedTree position={[-20, 0, -20]} scale={1.5} />
      <StylizedTree position={[20, 0, -20]} scale={1.2} />
      <StylizedTree position={[-22, 0, 22]} scale={1.8} />
      <StylizedTree position={[22, 0, 18]} scale={1.3} />
    </group>
  );
};

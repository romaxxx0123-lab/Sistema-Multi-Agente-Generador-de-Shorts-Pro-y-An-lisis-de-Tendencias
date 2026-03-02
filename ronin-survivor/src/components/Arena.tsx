import { usePlane, useBox } from '@react-three/cannon';
import { Mesh } from 'three';

export const Arena = () => {
  // Main floor
  const [floorRef] = usePlane<Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
  }));

  // Walls
  const wallThickness = 1;
  const wallHeight = 10;
  const arenaSize = 50;
  const halfSize = arenaSize / 2;

  // North wall
  useBox(() => ({
    position: [0, wallHeight / 2, -halfSize],
    args: [arenaSize, wallHeight, wallThickness],
  }));

  // South wall
  useBox(() => ({
    position: [0, wallHeight / 2, halfSize],
    args: [arenaSize, wallHeight, wallThickness],
  }));

  // West wall
  useBox(() => ({
    position: [-halfSize, wallHeight / 2, 0],
    args: [wallThickness, wallHeight, arenaSize],
  }));

  // East wall
  useBox(() => ({
    position: [halfSize, wallHeight / 2, 0],
    args: [wallThickness, wallHeight, arenaSize],
  }));

  return (
    <group>
      {/* Floor Visual */}
      <mesh ref={floorRef} receiveShadow>
        <planeGeometry args={[arenaSize, arenaSize]} />
        <meshStandardMaterial color="#333333" />
      </mesh>

      {/* Grid helper for better perspective */}
      <gridHelper args={[arenaSize, 50, "#444444", "#222222"]} rotation={[0, 0, 0]} position={[0, 0.01, 0]} />
    </group>
  );
};

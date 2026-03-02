import { usePlane, useBox } from '@react-three/cannon';
import { Mesh } from 'three';
import { GAME_CONFIG } from '../config';

export const Arena = () => {
  // Config
  const { SIZE, WALL_HEIGHT, WALL_THICKNESS, COLOR, GRID_COLOR } = GAME_CONFIG.ARENA;
  const halfSize = SIZE / 2;

  // Main floor
  const [floorRef] = usePlane<Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
  }));

  // Walls
  // North wall
  useBox(() => ({
    position: [0, WALL_HEIGHT / 2, -halfSize],
    args: [SIZE, WALL_HEIGHT, WALL_THICKNESS],
  }));

  // South wall
  useBox(() => ({
    position: [0, WALL_HEIGHT / 2, halfSize],
    args: [SIZE, WALL_HEIGHT, WALL_THICKNESS],
  }));

  // West wall
  useBox(() => ({
    position: [-halfSize, WALL_HEIGHT / 2, 0],
    args: [WALL_THICKNESS, WALL_HEIGHT, SIZE],
  }));

  // East wall
  useBox(() => ({
    position: [halfSize, WALL_HEIGHT / 2, 0],
    args: [WALL_THICKNESS, WALL_HEIGHT, SIZE],
  }));

  return (
    <group>
      {/* Floor Visual */}
      <mesh ref={floorRef} receiveShadow>
        <planeGeometry args={[SIZE, SIZE]} />
        <meshStandardMaterial color={COLOR} />
      </mesh>

      {/* Grid helper for better perspective */}
      <gridHelper args={[SIZE, SIZE, GRID_COLOR, "#222222"]} rotation={[0, 0, 0]} position={[0, 0.01, 0]} />
    </group>
  );
};

import { usePlane, useBox } from "@react-three/cannon";
import { Grid } from "@react-three/drei";
import { Mesh } from "three";
import { GAME_CONFIG } from "../config";

export const Arena = () => {
  const size = GAME_CONFIG.ARENA.SIZE;
  const halfSize = size / 2;
  const wallHeight = GAME_CONFIG.ARENA.WALL_HEIGHT;

  // Ground physical body
  const [groundRef] = usePlane<Mesh>(() => ({
    rotation: [-Math.PI / 2, 0, 0],
    position: [0, 0, 0],
  }));

  // Invisible Walls
  // North
  useBox(() => ({
    position: [0, wallHeight / 2, -halfSize],
    args: [size, wallHeight, 1],
  }));
  // South
  useBox(() => ({
    position: [0, wallHeight / 2, halfSize],
    args: [size, wallHeight, 1],
  }));
  // East
  useBox(() => ({
    position: [halfSize, wallHeight / 2, 0],
    args: [1, wallHeight, size],
  }));
  // West
  useBox(() => ({
    position: [-halfSize, wallHeight / 2, 0],
    args: [1, wallHeight, size],
  }));

  return (
    <>
      {/* Visual Ground */}
      <mesh ref={groundRef} receiveShadow>
        <planeGeometry args={[size, size]} />
        <meshStandardMaterial color={GAME_CONFIG.ARENA.COLOR} />
      </mesh>

      {/* Helper Grid */}
      <Grid
        args={[size, size]}
        sectionColor={GAME_CONFIG.ARENA.GRID_COLOR}
        cellColor={GAME_CONFIG.ARENA.GRID_COLOR}
        infiniteGrid
        fadeDistance={50}
        fadeStrength={5}
      />

      {/* Decorative center marker */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
      </mesh>
    </>
  );
};

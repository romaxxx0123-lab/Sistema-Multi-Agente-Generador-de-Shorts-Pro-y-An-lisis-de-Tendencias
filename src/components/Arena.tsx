import { useMemo } from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Grid } from "@react-three/drei";
import { CONFIG } from "../config";
import { EnvironmentProps } from "./EnvironmentProps";
import { TextureGenerator } from "../utils/textures";

/**
 * OPTIMIZED ARENA COMPONENT - PART 2 (EXPANDED)
 * 200m x 200m Arena with high-quality tiled textures.
 */
export const Arena = () => {
  const size = CONFIG.ARENA.SIZE;
  const halfSize = size / 2;
  const wallHeight = CONFIG.ARENA.WALL_HEIGHT;

  // Generate high-quality floor texture with corrected tiling for 200m
  const floorTextures = useMemo(() => {
    const texs = TextureGenerator.createCobblestone(1024);
    // Tiling: 40 repetitions over 200m = 5m per tile
    Object.values(texs).forEach(t => {
        t.wrapS = t.wrapT = 1000; // RepeatWrapping
        t.repeat.set(40, 40);
    });
    return texs;
  }, []);

  return (
    <>
      {/* Physical Ground & Boundaries Group */}
      <RigidBody type="fixed" colliders={false} name="ground">
        {/* Visual Ground Plane */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial
            {...floorTextures}
            metalness={0.2}
            roughness={0.8}
          />
        </mesh>

        {/* Physical Ground Collider */}
        <CuboidCollider args={[halfSize, 0.5, halfSize]} position={[0, -0.5, 0]} />

        {/* Boundary Colliders (Physical Walls) */}
        {/* North */}
        <CuboidCollider args={[halfSize, wallHeight, 1]} position={[0, wallHeight/2, -halfSize - 0.5]} />
        {/* South */}
        <CuboidCollider args={[halfSize, wallHeight, 1]} position={[0, wallHeight/2, halfSize + 0.5]} />
        {/* East */}
        <CuboidCollider args={[1, wallHeight, halfSize]} position={[halfSize + 0.5, wallHeight/2, 0]} />
        {/* West */}
        <CuboidCollider args={[1, wallHeight, halfSize]} position={[-halfSize - 0.5, wallHeight/2, 0]} />
      </RigidBody>

      {/* Visual Helper Grid (Faded for Large Scale) */}
      <Grid
        args={[size, size]}
        sectionColor="#222222"
        cellColor="#111111"
        sectionSize={20}
        cellSize={5}
        infiniteGrid
        fadeDistance={150}
        fadeStrength={10}
      />

      {/* Atmospheric Decorations */}
      <EnvironmentProps />

      {/* Global Ambient Fog handled in App.tsx */}
    </>
  );
};

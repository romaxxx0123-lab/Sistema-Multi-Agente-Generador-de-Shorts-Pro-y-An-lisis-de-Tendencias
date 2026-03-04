import { useMemo } from "react";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { Grid } from "@react-three/drei";
import { CONFIG } from "../config";
import { EnvironmentProps } from "./EnvironmentProps";
import { TextureGenerator } from "../utils/textures";

/**
 * OPTIMIZED ARENA COMPONENT
 * Implements a static physical floor and four physical boundaries using Rapier.
 * Performance optimized for Part 2.
 */
export const Arena = () => {
  const size = CONFIG.ARENA.SIZE;
  const halfSize = size / 2;
  const wallHeight = CONFIG.ARENA.WALL_HEIGHT;

  // Generate high-quality floor texture
  const floorTextures = useMemo(() => {
    const texs = TextureGenerator.createCobblestone(1024);
    Object.values(texs).forEach(t => t.repeat.set(10, 10));
    return texs;
  }, []);

  return (
    <>
      {/* Physical Ground & Boundaries Group */}
      <RigidBody type="fixed" colliders={false}>
        {/* Visual Ground Plane */}
        <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[size, size]} />
          <meshStandardMaterial
            {...floorTextures}
            metalness={0.1}
          />
        </mesh>

        {/* Physical Ground Collider */}
        <CuboidCollider args={[halfSize, 0.1, halfSize]} position={[0, -0.1, 0]} />

        {/* Boundary Colliders (Physical Walls) */}
        {/* North */}
        <CuboidCollider args={[halfSize, wallHeight / 2, 0.5]} position={[0, wallHeight / 2, -halfSize]} />
        {/* South */}
        <CuboidCollider args={[halfSize, wallHeight / 2, 0.5]} position={[0, wallHeight / 2, halfSize]} />
        {/* East */}
        <CuboidCollider args={[0.5, wallHeight / 2, halfSize]} position={[halfSize, wallHeight / 2, 0]} />
        {/* West */}
        <CuboidCollider args={[0.5, wallHeight / 2, halfSize]} position={[-halfSize, wallHeight / 2, 0]} />
      </RigidBody>

      {/* Visual Helper Grid */}
      <Grid
        args={[size, size]}
        sectionColor="#444444"
        cellColor="#444444"
        infiniteGrid
        fadeDistance={50}
        fadeStrength={5}
      />

      {/* Visual Center Marker */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 32]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
      </mesh>

      {/* Stylized Props */}
      <EnvironmentProps />
    </>
  );
};

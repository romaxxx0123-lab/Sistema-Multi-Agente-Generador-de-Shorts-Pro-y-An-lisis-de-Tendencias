import { useMemo } from 'react';
import { TextureGenerator } from '../../utils/textures';

/**
 * WOODEN FENCE (YARAI)
 */
export const WoodenFence = ({  scale = 1 , ...props }: any) => {
  const woodTexture = useMemo(() => {
    const tex = TextureGenerator.createWoodGrain('#4b3621', '#2d1b0d', 256);
    return tex;
  }, []);

  return (
    <group {...props} scale={scale}>
      {/* Vertical Posts */}
      <mesh position={[-0.9, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial map={woodTexture} />
      </mesh>
      <mesh position={[0.9, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial map={woodTexture} />
      </mesh>

      {/* Horizontal Rails */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[2, 0.08, 0.08]} />
        <meshStandardMaterial map={woodTexture} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[2, 0.08, 0.08]} />
        <meshStandardMaterial map={woodTexture} />
      </mesh>

      {/* Vertical Slats */}
      {[...Array(6)].map((_, i) => (
        <mesh key={i} position={[i * 0.3 - 0.75, 0.5, 0]} castShadow>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
          <meshStandardMaterial map={woodTexture} />
        </mesh>
      ))}
    </group>
  );
};

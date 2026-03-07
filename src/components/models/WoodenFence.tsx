import { useMemo } from 'react';
import { TextureGenerator } from '../../utils/textures';

/**
 * WOODEN FENCE (YARAI)
 */
export const WoodenFence = ({  scale = 1 , ...props }: any) => {
  const woodTextures = useMemo(() => {
    const texs = TextureGenerator.createWoodGrain('#4b3621', '#2d1b0d', 256);
    return texs;
  }, []);

  return (
    <group {...props} scale={scale}>
      {/* Vertical Posts */}
      <mesh position={[-0.9, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>
      <mesh position={[0.9, 0.5, 0]} castShadow>
        <boxGeometry args={[0.1, 1, 0.1]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>

      {/* Horizontal Rails */}
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[2, 0.08, 0.08]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[2, 0.08, 0.08]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>

      {/* Vertical Slats */}
      {[...Array(6)].map((_, i) => (
        <mesh key={i} position={[i * 0.3 - 0.75, 0.5, 0]} castShadow>
          <boxGeometry args={[0.05, 0.9, 0.05]} />
          <meshStandardMaterial {...woodTextures} />
        </mesh>
      ))}
    </group>
  );
};

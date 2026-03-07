import { useMemo } from 'react';
import { TextureGenerator } from '../../utils/textures';

/**
 * SAKURA TREE - STYLIZED
 */
export const SakuraTree = ({  scale = 1 , ...props }: any) => {
  const trunkTextures = useMemo(() => {
    const texs = TextureGenerator.createWoodGrain('#4b3621', '#2d1b0d', 512);
    Object.values(texs).forEach(t => t.repeat.set(1, 2));
    return texs;
  }, []);

  return (
    <group {...props} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.5, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.4, 3, 6]} />
        <meshStandardMaterial {...trunkTextures} />
      </mesh>

      {/* Foliage (Sakura Blooms) */}
      <group position={[0, 3, 0]}>
        <mesh position={[0, 0.5, 0]} castShadow>
          <sphereGeometry args={[1.2, 8, 8]} />
          <meshStandardMaterial color="#fd79a8" roughness={0.8} />
        </mesh>
        <mesh position={[0.8, -0.2, 0.5]} castShadow>
          <sphereGeometry args={[0.8, 8, 8]} />
          <meshStandardMaterial color="#fab1a0" roughness={0.8} />
        </mesh>
        <mesh position={[-0.7, 0, -0.6]} castShadow>
          <sphereGeometry args={[0.9, 8, 8]} />
          <meshStandardMaterial color="#fd79a8" roughness={0.8} />
        </mesh>
      </group>
    </group>
  );
};

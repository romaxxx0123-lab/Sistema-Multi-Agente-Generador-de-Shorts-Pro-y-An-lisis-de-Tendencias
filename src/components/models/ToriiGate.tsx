import { useMemo } from 'react';
import { TextureGenerator } from '../../utils/textures';

/**
 * TORII GATE - JAPANESE ICONIC ARCHITECTURE
 */
export const ToriiGate = ({  scale = 1 , ...props }: any) => {
  const woodTextures = useMemo(() => {
    const texs = TextureGenerator.createWoodGrain('#d63031', '#a52a2a', 512);
    Object.values(texs).forEach(t => t.repeat.set(1, 4));
    return texs;
  }, []);

  const blackWoodTextures = useMemo(() => {
    const texs = TextureGenerator.createWoodGrain('#2d3436', '#000000', 512);
    return texs;
  }, []);

  return (
    <group {...props} scale={scale}>
      {/* Main Pillars */}
      <mesh position={[1.5, 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.25, 4, 8]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>
      <mesh position={[-1.5, 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.2, 0.25, 4, 8]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>

      {/* Top Beam (Kasagi) */}
      <mesh position={[0, 4.2, 0]} castShadow>
        <boxGeometry args={[4.5, 0.3, 0.4]} />
        <meshStandardMaterial {...blackWoodTextures} />
      </mesh>

      {/* Secondary Beam (Nuki) */}
      <mesh position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[3.8, 0.2, 0.3]} />
        <meshStandardMaterial {...woodTextures} />
      </mesh>

      {/* Pillar Bases */}
      <mesh position={[1.5, 0.1, 0]}>
        <boxGeometry args={[0.6, 0.2, 0.6]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
      <mesh position={[-1.5, 0.1, 0]}>
        <boxGeometry args={[0.6, 0.2, 0.6]} />
        <meshStandardMaterial color="#2d3436" />
      </mesh>
    </group>
  );
};

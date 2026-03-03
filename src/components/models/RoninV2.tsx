import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Group, MeshStandardMaterial } from "three";
import { TextureGenerator } from "../../utils/textures";

/**
 * RONIN V2 - HIGH QUALITY STYLIZED PLAYER
 * Features: Kasa (Hat), Kimono with Obi, Sode (Armor), and detailed proportions.
 */
export const RoninV2 = (props: any) => {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);

  const kimonoTexture = useMemo(() => TextureGenerator.createFabric('#2d3436'), []);
  const hakamaTexture = useMemo(() => TextureGenerator.createFabric('#1a1a1a'), []);
  const hatTexture = useMemo(() => {
    const tex = TextureGenerator.createWoodGrain('#4b3621', '#2d1b0d', 256);
    tex.repeat.set(4, 1);
    return tex;
  }, []);

  // Procedural idle animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    // Breathing/Idle bobbing
    groupRef.current.position.y = Math.sin(t * 2) * 0.05 + 0.9;

    // Head slight tilt
    if (headRef.current) {
      headRef.current.rotation.z = Math.sin(t * 1.5) * 0.05;
    }
  });

  return (
    <group {...props} ref={groupRef}>
      {/* 1. LOWER BODY (Hakama) */}
      <mesh position={[0, -0.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 0.8, 8]} />
        <meshStandardMaterial map={hakamaTexture} roughness={0.8} />
      </mesh>

      {/* 2. TORSO (Kimono) */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial map={kimonoTexture} roughness={0.7} />
      </mesh>

      {/* Obi (Belt) */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.52, 0.1, 0.32]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>

      {/* 3. ARMS & SODE (Shoulder Armor) */}
      {/* Right Arm */}
      <group position={[0.35, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
        {/* Sode Armor */}
        <mesh position={[0.05, 0.1, 0]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.1, 0.25, 0.2]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* Left Arm */}
      <group position={[-0.35, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
        {/* Sode Armor */}
        <mesh position={[-0.05, 0.1, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.1, 0.25, 0.2]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* 4. HEAD & KASA (Hat) */}
      <group ref={headRef} position={[0, 0.65, 0]}>
        {/* Face/Mask */}
        <mesh castShadow>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        {/* Glowing Visor */}
        <mesh position={[0, 0.05, 0.13]}>
          <planeGeometry args={[0.2, 0.05]} />
          <meshStandardMaterial color="#00d2ff" emissive="#00d2ff" emissiveIntensity={2} />
        </mesh>

        {/* KASA (Traditional Hat) */}
        <mesh position={[0, 0.15, 0]} rotation={[0.1, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.6, 0.15, 12]} />
          <meshStandardMaterial map={hatTexture} roughness={1} />
        </mesh>
      </group>

      {/* Shadow Blob */}
      <mesh position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.8, 0.8]} />
        <meshStandardMaterial color="#000" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

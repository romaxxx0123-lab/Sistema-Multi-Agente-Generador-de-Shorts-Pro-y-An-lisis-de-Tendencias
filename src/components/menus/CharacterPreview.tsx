import { Canvas, useFrame } from "@react-three/fiber";
import { Stage, OrbitControls, PerspectiveCamera, ContactShadows, Float } from "@react-three/drei";
import { RoninV2 } from "../models/RoninV2";
import { Ninja } from "../models/Ninja";
import { Oni } from "../models/Oni";
import { Suspense, useRef } from "react";
import * as THREE from "three";

/**
 * CHARACTER PREVIEW COMPONENT (THE ALTAR)
 * Renders a premium 3D preview on a stylized obsidian pedestal.
 */

interface CharacterPreviewProps {
  characterId: string;
}

const CharacterModel = ({ id }: { id: string }) => {
  switch (id) {
    case "ronin":
      return <RoninV2 scale={1.6} position={[0, -0.85, 0]} />;
    case "ninja":
      return <Ninja scale={1.6} position={[0, -0.75, 0]} />;
    case "oni":
      return <Oni scale={1.3} position={[0, -0.95, 0]} />;
    default:
      return <RoninV2 scale={1.6} position={[0, -0.85, 0]} />;
  }
};

const Altar = () => {
    return (
        <group position={[0, -1, 0]}>
            {/* Main Base - Obsidian / Metal */}
            <mesh receiveShadow>
                <cylinderGeometry args={[1.5, 1.8, 0.15, 64]} />
                <meshStandardMaterial color="#050505" metalness={0.9} roughness={0.1} />
            </mesh>

            {/* Inner Ring Glow */}
            <mesh position={[0, 0.08, 0]}>
                <cylinderGeometry args={[1.4, 1.4, 0.05, 64]} />
                <meshStandardMaterial color="#F1C40F" emissive="#F1C40F" emissiveIntensity={1} transparent opacity={0.2} />
            </mesh>

            {/* Decorative Edge */}
            <mesh position={[0, 0.02, 0]}>
                <torusGeometry args={[1.5, 0.02, 16, 100]} rotation={[Math.PI / 2, 0, 0]} />
                <meshStandardMaterial color="#333" metalness={1} roughness={0.1} />
            </mesh>
        </group>
    );
};

export function CharacterPreview({ characterId }: CharacterPreviewProps) {
  return (
    <div className="w-full h-full relative cursor-grab active:cursor-grabbing">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 1.8, 6]} fov={30} />

        <ambientLight intensity={0.3} />

        {/* Main Key Light */}
        <spotLight position={[5, 10, 10]} angle={0.15} penumbra={1} intensity={2} castShadow />

        {/* Rim Light (Pop effect) */}
        <spotLight position={[-5, 5, -5]} angle={0.3} penumbra={1} intensity={3} color="#fff" />

        {/* Fill Light */}
        <pointLight position={[-10, 2, 5]} intensity={0.5} />

        <Suspense fallback={null}>
          <Float speed={1.5} rotationIntensity={0.2} floatIntensity={0.2}>
            <CharacterModel id={characterId} />
          </Float>

          <Altar />

          <ContactShadows
            position={[0, -1, 0]}
            opacity={0.6}
            scale={10}
            blur={2}
            far={1.5}
          />
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 3}
          maxPolarAngle={Math.PI / 2.1}
          enableDamping={true}
          dampingFactor={0.05}
          autoRotate={true}
          autoRotateSpeed={0.5}
          makeDefault
        />
      </Canvas>

      {/* Atmospheric vignette directly in overlay if needed, or via post-processing */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.5)_100%)]" />
    </div>
  );
}

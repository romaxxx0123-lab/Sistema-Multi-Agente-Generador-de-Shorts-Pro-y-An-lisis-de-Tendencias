import { Canvas } from "@react-three/fiber";
import { Stage, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { RoninV2 } from "../models/RoninV2";
import { Ninja } from "../models/Ninja";
import { Oni } from "../models/Oni";
import { Suspense } from "react";

/**
 * CHARACTER PREVIEW COMPONENT
 * Renders a high-fidelity 3D preview of a character on a pedestal.
 */

interface CharacterPreviewProps {
  characterId: string;
}

const CharacterModel = ({ id }: { id: string }) => {
  switch (id) {
    case "ronin":
      return <RoninV2 scale={1.5} position={[0, -0.9, 0]} />;
    case "ninja":
      return <Ninja scale={1.5} position={[0, -0.8, 0]} />;
    case "oni":
      return <Oni scale={1.2} position={[0, -1, 0]} />;
    default:
      return <RoninV2 scale={1.5} position={[0, -0.9, 0]} />;
  }
};

export function CharacterPreview({ characterId }: CharacterPreviewProps) {
  return (
    <div className="w-full h-[400px] relative cursor-grab active:cursor-grabbing">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[0, 1.5, 5]} fov={35} />

        <Suspense fallback={null}>
          <Stage
            environment="city"
            intensity={0.5}
            shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
            adjustCamera={false}
          >
            <group>
              {/* Pedestal */}
              <mesh position={[0, -1.05, 0]} receiveShadow>
                <cylinderGeometry args={[1.2, 1.4, 0.2, 32]} />
                <meshStandardMaterial color="#222" metalness={0.8} roughness={0.2} />
              </mesh>

              {/* Character */}
              <CharacterModel id={characterId} />
            </group>
          </Stage>
        </Suspense>

        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 2.5}
          maxPolarAngle={Math.PI / 2}
          autoRotate
          autoRotateSpeed={2}
        />
      </Canvas>

      {/* Lighting / Glow Overlay */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-transparent" />
    </div>
  );
}

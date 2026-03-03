import { SakuraTree } from "./models/SakuraTree";
import { ZenRock } from "./models/ZenRock";
import { StoneLantern } from "./models/StoneLantern";
import { JizoStatue } from "./models/JizoStatue";
import { ToriiGate } from "./models/ToriiGate";
import { WoodenFence } from "./models/WoodenFence";

/**
 * HIGH QUALITY ENVIRONMENT PROPS
 * Uses stylized Japanese-themed assets to enrich the arena.
 */

export const EnvironmentProps = () => {
  return (
    <group>
      {/* 1. Landmark: Torii Gate at the spawn */}
      <group position={[0, 0, -12]}>
        <ToriiGate scale={1.8} />
      </group>

      {/* 2. Sakura Trees scattered around (clearing center) */}
      <SakuraTree position={[-20, 0, -20]} scale={1.5} />
      <SakuraTree position={[20, 0, -22]} scale={1.8} />
      <SakuraTree position={[-22, 0, 18]} scale={1.6} />
      <SakuraTree position={[24, 0, 15]} scale={1.7} />

      {/* 3. Zen Rocks */}
      <ZenRock position={[-15, 0.5, -12]} scale={0.8} />
      <ZenRock position={[18, 0.5, 12]} scale={1.2} />
      <ZenRock position={[-12, 0.5, 20]} scale={1.0} />

      {/* 4. Stone Lanterns (Light sources) */}
      <StoneLantern position={[-8, 0, -15]} scale={0.8} />
      <StoneLantern position={[8, 0, -15]} scale={0.8} />
      <StoneLantern position={[18, 0, 0]} scale={0.9} />
      <StoneLantern position={[-18, 0, 0]} scale={0.9} />

      {/* 5. Jizo Statues */}
      <JizoStatue position={[10, 0, 20]} scale={0.8} />
      <JizoStatue position={[-20, 0, -8]} scale={0.7} />

      {/* 6. Boundary Fences (Visual only, collision is in Arena.tsx) */}
      {/* North */}
      {[...Array(25)].map((_, i) => (
        <WoodenFence key={`n-${i}`} position={[i * 2 - 24, 0, -25]} />
      ))}
      {/* South */}
      {[...Array(25)].map((_, i) => (
        <WoodenFence key={`s-${i}`} position={[i * 2 - 24, 0, 25]} />
      ))}
      {/* East */}
      {[...Array(25)].map((_, i) => (
        <WoodenFence key={`e-${i}`} position={[25, 0, i * 2 - 24]} rotation={[0, Math.PI / 2, 0]} />
      ))}
      {/* West */}
      {[...Array(25)].map((_, i) => (
        <WoodenFence key={`w-${i}`} position={[-25, 0, i * 2 - 24]} rotation={[0, Math.PI / 2, 0]} />
      ))}
    </group>
  );
};

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stage, PerspectiveCamera } from "@react-three/drei";
import { RoninV2 } from "./models/RoninV2";
import { Katana } from "./models/Katana";
import { Oni } from "./models/Oni";
import { Ninja } from "./models/Ninja";
import { Skeleton } from "./models/Skeleton";
import { ToriiGate } from "./models/ToriiGate";
import { SakuraTree } from "./models/SakuraTree";
import { StoneLantern } from "./models/StoneLantern";
import { JizoStatue } from "./models/JizoStatue";
import { ZenRock } from "./models/ZenRock";
import { WoodenFence } from "./models/WoodenFence";
import { XPShard } from "./models/XPShard";
import { HealthBento } from "./models/HealthBento";
import { GoldKoban } from "./models/GoldKoban";
import { PowerupScroll } from "./models/PowerupScroll";
import { useGameStore } from "../store/useGameStore";

const models = [
  { name: "Ronin V2", Component: RoninV2 },
  { name: "Katana", Component: Katana },
  { name: "Oni (Enemy)", Component: Oni },
  { name: "Ninja (Enemy)", Component: Ninja },
  { name: "Skeleton (Enemy)", Component: Skeleton },
  { name: "Torii Gate", Component: ToriiGate },
  { name: "Sakura Tree", Component: SakuraTree },
  { name: "Stone Lantern", Component: StoneLantern },
  { name: "Jizo Statue", Component: JizoStatue },
  { name: "Zen Rock", Component: ZenRock },
  { name: "Wooden Fence", Component: WoodenFence },
  { name: "XP Shard", Component: XPShard },
  { name: "Health Bento", Component: HealthBento },
  { name: "Gold Koban", Component: GoldKoban },
  { name: "Powerup Scroll", Component: PowerupScroll },
];

export const AssetGallery = () => {
  const setView = useGameStore((state) => state.setView);

  return (
    <div className="fixed inset-0 bg-gray-900 z-[100] flex flex-col">
      <div className="p-4 bg-black/50 flex justify-between items-center text-white">
        <h1 className="text-2xl font-bold font-mono">ASSET GALLERY (15+ MODELS)</h1>
        <button
          onClick={() => setView('menu')}
          className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold transition-colors"
        >
          VOLVER AL MENÚ
        </button>
      </div>

      <div className="flex-1 grid grid-cols-3 md:grid-cols-5 gap-4 p-4 overflow-y-auto bg-slate-800">
        {models.map(({ name, Component }, idx) => (
          <div key={idx} className="bg-black/40 rounded-xl flex flex-col aspect-square border border-white/10 hover:border-blue-400 transition-colors">
            <div className="flex-1">
              <Canvas shadows camera={{ position: [0, 2, 5], fov: 45 }}>
                <Suspense fallback={null}>
                  <Stage environment="city" intensity={0.6} shadows={{ type: 'contact', opacity: 0.5, blur: 2 }}>
                    <Component />
                  </Stage>
                </Suspense>
                <OrbitControls autoRotate autoRotateSpeed={2} enableZoom={false} />
              </Canvas>
            </div>
            <div className="bg-black/60 p-2 text-center text-xs font-mono text-blue-300 border-t border-white/5">
              {name}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

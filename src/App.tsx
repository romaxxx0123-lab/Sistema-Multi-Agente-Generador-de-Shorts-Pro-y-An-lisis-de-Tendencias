import { Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Environment } from '@react-three/drei';

import { Arena } from './components/Arena';
import { Player } from './components/Player';
import { CameraRig } from './components/CameraRig';
import { SakuraParticles } from './components/Particles';
import { Effects } from './components/Effects';
import { DebugPanel } from './components/DebugPanel';

// UI Components
import { MenuRoot } from './components/menus/MenuRoot';
import { HUD } from './components/HUD';
import { LevelUpOverlay } from './components/LevelUpOverlay';
import { ChestOverlay } from './components/overlays/ChestOverlay';
import { PauseOverlay } from './components/overlays/PauseOverlay';
import { EndRunOverlay } from './components/overlays/EndRunOverlay';

// Systems
import { EnemySpawner } from './systems/EnemySpawner';
import { enemyRegistry } from './systems/EnemyRegistry';
import { Enemy } from './components/game/Enemy';
import { Boss } from './components/game/Boss';
import { AbilityManager } from './components/game/AbilityManager';
import { PickupManager } from './components/game/PickupManager';

import { useGameStore } from './store/useGameStore';
import { CONFIG } from './config';

/**
 * OPTIMIZED RONIN SURVIVOR ENTRY POINT
 * Integrated with Wave System, Pickups, and Hub.
 */
export const RoninGame = () => {
  const view = useGameStore((state) => state.view);
  const status = useGameStore((state) => state.status);
  const setStatus = useGameStore((state) => state.setStatus);
  const updateTime = useGameStore((state) => state.updateTime);
  const enemies = useGameStore((state) => state.enemies);
  const playerRef = useGameStore((state) => state.playerRef);
  const settings = useGameStore((state) => state.settings);

  // Global Key Listener (ESC for Pause/Back)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (view === 'game') {
          // Priority: Close levelup/chest first if we wanted (but rules say ignore)
          if (status === 'playing') setStatus('paused');
          else if (status === 'paused') setStatus('playing');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, status, setStatus]);

  return (
    <div className="w-screen h-screen bg-[#0a0a0a] overflow-hidden relative font-sans text-white">

      {/* 3D GAME LAYER */}
      {view === 'game' && (
        <Canvas
          shadows={settings.qualityHigh}
          camera={{ fov: CONFIG.CAMERA.FOV, near: CONFIG.CAMERA.NEAR, far: CONFIG.CAMERA.FAR }}
        >
          <Suspense fallback={null}>
            <CameraRig target={playerRef as any} />

            <ambientLight intensity={0.5} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1}
              castShadow={settings.qualityHigh}
            />

            <Physics
              gravity={CONFIG.PHYSICS.GRAVITY}
              timeStep={status === 'playing' ? CONFIG.PHYSICS.TIME_STEP : 0}
            >
              <Arena />
              <Player />

              <AbilityManager />
              <EnemySpawner />
              <PickupManager />

              {enemies.map((enemy) => (
                enemy.isBoss ? <Boss key={enemy.id} data={enemy} /> : <Enemy key={enemy.id} data={enemy} />
              ))}
            </Physics>

            <SakuraParticles count={settings.qualityHigh ? 200 : 50} />
            <fog attach="fog" args={['#0a0a0a', 10, 50]} />
            <Environment preset="city" />
            <Effects enabled={settings.qualityHigh} />
            <GameLogicLoop updateTime={updateTime} status={status} />
          </Suspense>
        </Canvas>
      )}

      {/* UI LAYERS */}
      {view === 'menu' ? (
        <MenuRoot />
      ) : (
          <div className="game-ui-overlay">
            <HUD />
            <LevelUpOverlay />
            <ChestOverlay />
            <PauseOverlay />
            <EndRunOverlay />
          </div>
      )}

      {/* Performance Monitor (Always available but toggled by F3) */}
      <DebugPanel />
    </div>
  );
};

function GameLogicLoop({ updateTime, status }: { updateTime: (d: number) => void, status: string }) {
    useFrame((_state, delta) => {
        if (status === 'playing') {
            updateTime(delta);
            enemyRegistry.updateAll();
        }
    });
    return null;
}

export default RoninGame;

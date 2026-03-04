import { Suspense, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { Environment } from '@react-three/drei';

import { Arena } from './components/Arena';
import { Player } from './components/Player';
import { CameraFollow } from './components/CameraFollow';
import { SakuraParticles } from './components/Particles';
import { Effects } from './components/Effects';
import { DebugPanel } from './components/DebugPanel';

// UI Components
import { MainMenu } from './components/menus/MainMenu';
import { CharacterSelector } from './components/menus/CharacterSelector';
import { AssetGallery } from './components/AssetGallery';
import { HUD } from './components/HUD';
import { LevelUpOverlay } from './components/LevelUpOverlay';
import { PauseOverlay } from './components/overlays/PauseOverlay';
import { EndRunOverlay } from './components/overlays/EndRunOverlay';

// Systems
import { EnemySpawner } from './systems/EnemySpawner';
import { Enemy } from './components/game/Enemy';

import { useGameStore } from './store/useGameStore';
import { CONFIG } from './config';

/**
 * OPTIMIZED RONIN SURVIVOR ENTRY POINT
 * Migrated to Rapier physics for Part 2 scalability.
 * Unified UI System integration.
 */
export const RoninGame = () => {
  const view = useGameStore((state) => state.view);
  const status = useGameStore((state) => state.status);
  const setStatus = useGameStore((state) => state.setStatus);
  const updateTime = useGameStore((state) => state.updateTime);
  const enemies = useGameStore((state) => state.enemies);

  // Global Key Listener (ESC for Pause, etc.)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view === 'game') {
        // Only toggle pause if we're not in a terminal state (gameover/victory/levelup)
        if (status === 'playing') {
          setStatus('paused');
        } else if (status === 'paused') {
          setStatus('playing');
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, status, setStatus]);

  return (
    <div className="w-screen h-screen bg-[#111111] overflow-hidden relative font-sans text-white">

      {/* 3D GAME LAYER */}
      {view === 'game' && (
        <Canvas
          shadows={CONFIG.PERFORMANCE.ENABLE_SHADOWS}
          camera={{ fov: CONFIG.CAMERA.FOV, near: CONFIG.CAMERA.NEAR, far: CONFIG.CAMERA.FAR }}
        >
          <Suspense fallback={null}>
            {/* Follow Camera Logic */}
            <CameraFollow />

            <ambientLight intensity={0.5} />
            <directionalLight
              position={[10, 10, 5]}
              intensity={1}
              castShadow={CONFIG.PERFORMANCE.ENABLE_SHADOWS}
            />

            <Physics
              gravity={CONFIG.PHYSICS.GRAVITY}
              timeStep={status === 'playing' ? CONFIG.PHYSICS.TIME_STEP : 0}
            >
              <Arena />
              <Player />

              {/* SPAWNER SYSTEM */}
              <EnemySpawner />

              {/* ACTIVE ENEMIES */}
              {enemies.map((enemy) => (
                <Enemy key={enemy.id} data={enemy} />
              ))}
            </Physics>

            <SakuraParticles count={200} />
            <fog attach="fog" args={['#111111', 10, 50]} />
            <Environment preset="city" />
            <Effects />
            <GameLogicLoop updateTime={updateTime} status={status} />
          </Suspense>
        </Canvas>
      )}

      {/* UI LAYERS */}
      {view === 'menu' && <MainMenu />}
      {view === 'characters' && <CharacterSelector />}
      {view === 'gallery' && <AssetGallery />}

      {view === 'game' && (
          <>
            <HUD />
            <LevelUpOverlay />
            <PauseOverlay />
            <EndRunOverlay />
          </>
      )}

      {/* Performance Monitor (Always available but toggled by F3) */}
      <DebugPanel />
    </div>
  );
};

// Helper to handle frame-based logic
function GameLogicLoop({ updateTime, status }: { updateTime: (d: number) => void, status: string }) {
    useFrame((_state, delta) => {
        if (status === 'playing') {
            updateTime(delta);
        }
    });
    return null;
}

export default RoninGame;

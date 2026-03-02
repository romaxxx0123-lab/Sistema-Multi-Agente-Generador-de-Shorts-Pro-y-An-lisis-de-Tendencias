import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { Arena } from './components/Arena';
import { Player } from './components/Player';
import { CameraFollow } from './components/CameraFollow';
import { EnemyManager } from './components/EnemyManager';
import { AbilityManager } from './components/abilities/AbilityManager';
import { HUD } from './components/HUD';
import { LevelUpOverlay } from './components/LevelUpOverlay';
import { GameOverOverlay } from './components/GameOverOverlay';
import { GlobalVFX } from './components/GlobalVFX';
import { DamageNumbers } from './components/DamageNumbers';
import { useGameStore } from './store/useGameStore';

export const RoninGame = () => {
  const status = useGameStore((state) => state.status);
  const togglePause = useGameStore((state) => state.togglePause);

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#111111', overflow: 'hidden', position: 'relative' }}>
      <Canvas shadows>
        {/* New Smooth Camera Follow */}
        <CameraFollow />

        {/* Basic Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        <GlobalVFX />
        <Physics gravity={[0, -9.81, 0]}>
          <Arena />
          <Player />
          <EnemyManager />
          <AbilityManager />
          <DamageNumbers />
        </Physics>

        {/* Visual environment */}
        <Environment preset="city" />
      </Canvas>

      {/* UI Layer */}
      <HUD />
      <LevelUpOverlay />
      <GameOverOverlay />

      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        color: 'white',
        fontFamily: 'sans-serif'
      }}>
        <button
          onClick={togglePause}
          style={{
            padding: '10px 20px',
            backgroundColor: '#1cb0f6',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}
        >
          {status === 'playing' ? 'Pausar' : 'Reanudar'}
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: '40px',
        left: '50%',
        transform: 'translateX(-50%)',
        color: 'white',
        textAlign: 'center',
        pointerEvents: 'none',
        userSelect: 'none',
        fontFamily: 'sans-serif'
      }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Ronin Survivor - Demo Parte 2</h2>
        <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.6, fontWeight: 'bold', textTransform: 'uppercase' }}>WASD: Mover | SHIFT: Dash | CLICK: Atacar</p>
      </div>

      {status === 'paused' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          fontSize: '48px',
          fontWeight: 'black',
          textTransform: 'uppercase',
          fontFamily: 'sans-serif'
        }}>
          Pausa
        </div>
      )}
    </div>
  );
};

export default RoninGame;

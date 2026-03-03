import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { Environment } from '@react-three/drei';
import { Arena } from './components/Arena';
import { Player } from './components/Player';
import { CameraFollow } from './components/CameraFollow';
import { GAME_CONFIG } from './config';

export const RoninGame = () => {
  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      backgroundColor: '#111111',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <Canvas shadows camera={{ fov: GAME_CONFIG.CAMERA.FOV }}>
        {/* Camera system */}
        <CameraFollow />

        {/* Basic Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        {/* Physics World */}
        <Physics gravity={[0, GAME_CONFIG.PHYSICS.GRAVITY, 0]}>
          <Arena />
          <Player />
        </Physics>

        {/* Visual environment */}
        <Environment preset="city" />
      </Canvas>

      {/* Basic HUD Overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        color: 'white',
        fontFamily: 'sans-serif',
        pointerEvents: 'none'
      }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, textTransform: 'uppercase' }}>
          Ronin Survivor - Part 1A
        </h1>
        <p style={{ margin: '5px 0', fontSize: '14px', opacity: 0.8 }}>
          Demo Mínima: Movimiento y Arena
        </p>
      </div>

      {/* Controls Help */}
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
        <p style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          backgroundColor: 'rgba(0,0,0,0.5)',
          padding: '10px 20px',
          borderRadius: '20px'
        }}>
          WASD o Flechas para Moverse
        </p>
      </div>
    </div>
  );
};

export default RoninGame;

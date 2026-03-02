import { Canvas } from '@react-three/fiber';
import { Physics } from '@react-three/cannon';
import { PerspectiveCamera, Environment } from '@react-three/drei';
import { Arena } from './components/Arena';
import { Player } from './components/Player';

export const RoninGame = () => {
  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#111111', overflow: 'hidden', position: 'relative' }}>
      <Canvas shadows>
        {/* Fixed Camera: 8m back, 4m up */}
        <PerspectiveCamera
          makeDefault
          position={[0, 4, 8]}
          fov={50}
          onUpdate={(self) => self.lookAt(0, 0, 0)}
        />

        {/* Basic Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />

        <Physics gravity={[0, -9.81, 0]}>
          <Arena />
          <Player />
        </Physics>

        {/* Visual environment */}
        <Environment preset="city" />
      </Canvas>

      {/* Overlay Instructions */}
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
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em' }}>Ronin Survivor - Demo 1A</h2>
        <p style={{ margin: '8px 0 0 0', fontSize: '14px', opacity: 0.6, fontWeight: 'bold', textTransform: 'uppercase' }}>Mover: WASD / Flechas</p>
      </div>
    </div>
  );
};

export default RoninGame;

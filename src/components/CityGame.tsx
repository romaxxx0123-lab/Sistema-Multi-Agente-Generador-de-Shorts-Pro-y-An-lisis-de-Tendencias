
import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Plane, Box, Text } from '@react-three/drei';
import { POIS, createNPC } from '../utils/cityLogic';
import { NPC } from './NPC';

export const CityGame: React.FC = () => {
  const [npcs] = useState(() => Array.from({ length: 12 }, (_, i) => createNPC(i.toString())));
  const [selectedNPC, setSelectedNPC] = useState<any>(null);

  return (
    <div className="w-full h-full bg-slate-900 relative">
      <Canvas shadows camera={{ position: [15, 15, 15], fov: 50 }}>
        <Sky sunPosition={[100, 10, 100]} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} castShadow />

        {/* Floor */}
        <Plane args={[100, 100]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#1e293b" />
        </Plane>

        {/* Grid and Roads */}
        <gridHelper args={[50, 50, '#334155', '#1e293b']} position={[0, 0.01, 0]} />

        {/* POIs - Buildings */}
        {POIS.map((poi) => (
          <group key={poi.id} position={poi.position}>
            <Box args={[3, poi.type === 'home' ? 8 : 4, 3]} position={[0, poi.type === 'home' ? 4 : 2, 0]} castShadow receiveShadow>
              <meshStandardMaterial color={poi.type === 'work' ? '#334155' : poi.type === 'cafe' ? '#b45309' : '#475569'} />
            </Box>
            <Text
              position={[0, poi.type === 'home' ? 9 : 5, 0]}
              fontSize={0.8}
              color="white"
              anchorX="center"
              anchorY="middle"
            >
              {poi.name}
            </Text>
          </group>
        ))}

        {/* NPCs */}
        <Suspense fallback={null}>
          {npcs.map((npc) => (
            <NPC key={npc.id} npc={npc} onSelect={setSelectedNPC} />
          ))}
        </Suspense>

        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 2.1} />
      </Canvas>

      {/* UI Overlay */}
      {selectedNPC && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur p-6 rounded-3xl shadow-2xl border-4 border-duo-blue w-80">
          <div className="flex items-center gap-4 mb-3">
             <div className="w-12 h-12 rounded-full border-4" style={{ backgroundColor: selectedNPC.color, borderColor: '#fff' }} />
             <div>
                <h3 className="font-black text-xl text-duo-gray-dark">{selectedNPC.name}</h3>
                <p className="text-xs font-bold text-duo-blue uppercase tracking-wider">Vida Dinámica</p>
             </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
               <span className="font-bold text-duo-gray">Estado:</span>
               <span className="font-medium text-duo-gray-dark capitalize">{selectedNPC.status}</span>
            </div>
            <div className="flex justify-between text-sm">
               <span className="font-bold text-duo-gray">Actividad:</span>
               <span className="font-medium text-duo-gray-dark">{selectedNPC.activity}</span>
            </div>
          </div>
          <button
            onClick={() => setSelectedNPC(null)}
            className="mt-4 w-full py-2 bg-duo-blue text-white font-bold rounded-xl border-b-4 border-blue-600 active:border-b-0 active:translate-y-1 transition-all"
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="absolute top-6 left-6 pointer-events-none">
         <h2 className="text-white text-3xl font-black italic tracking-tighter">METRÓPOLIS 3D</h2>
         <p className="text-duo-blue font-bold uppercase tracking-widest text-sm">Simulación de Vida Autónoma</p>
      </div>
    </div>
  );
};

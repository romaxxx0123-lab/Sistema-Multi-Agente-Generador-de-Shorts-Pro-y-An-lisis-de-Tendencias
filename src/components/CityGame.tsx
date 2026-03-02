
import React, { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Plane, Box, Text, Cone, Cylinder } from '@react-three/drei';
import { POIS, createNPC } from '../utils/cityLogic';
import { NPC } from './NPC';
import { Heart, Zap, Utensils, Box as BoxIcon } from 'lucide-react';

const Tree = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.2, 0.2, 1]} position={[0, 0.5, 0]} castShadow>
      <meshStandardMaterial color="#5d4037" />
    </Cylinder>
    <Cone args={[1, 2, 8]} position={[0, 1.8, 0]} castShadow>
      <meshStandardMaterial color="#2e7d32" />
    </Cone>
    <Cone args={[0.8, 1.5, 8]} position={[0, 2.5, 0]} castShadow>
      <meshStandardMaterial color="#388e3c" />
    </Cone>
  </group>
);

const LampPost = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.1, 0.1, 4]} position={[0, 2, 0]} castShadow>
      <meshStandardMaterial color="#455a64" />
    </Cylinder>
    <Box args={[0.6, 0.3, 0.6]} position={[0, 4, 0]}>
      <meshStandardMaterial color="#eceff1" emissive="#fff9c4" emissiveIntensity={2} />
    </Box>
    <pointLight position={[0, 3.8, 0]} intensity={0.5} distance={10} color="#fff9c4" />
  </group>
);

export const CityGame: React.FC = () => {
  const [npcs] = useState(() => Array.from({ length: 15 }, (_, i) => createNPC(i.toString())));
  const [selectedNPC, setSelectedNPC] = useState<any>(null);

  const scenery = useMemo(() => {
    const items = [];
    // Central Park Trees
    for (let i = 0; i < 8; i++) {
        items.push(<Tree key={`tree-p-${i}`} position={[Math.sin(i) * 3, 0, 8 + Math.cos(i) * 3]} />);
    }
    // Boulevard Trees
    for (let x = -20; x <= 20; x += 10) {
        if (Math.abs(x) > 2) {
            items.push(<Tree key={`tree-b1-${x}`} position={[x, 0, 4]} />);
            items.push(<Tree key={`tree-b2-${x}`} position={[x, 0, -4]} />);
        }
    }
    // Lamp posts
    items.push(<LampPost key="lp1" position={[5, 0, 5]} />);
    items.push(<LampPost key="lp2" position={[-5, 0, 5]} />);
    items.push(<LampPost key="lp3" position={[5, 0, -5]} />);
    items.push(<LampPost key="lp4" position={[-5, 0, -5]} />);

    return items;
  }, []);

  return (
    <div className="w-full h-full bg-slate-900 relative font-['DIN_Next_Rounded_OT']">
      <Canvas shadows camera={{ position: [25, 25, 25], fov: 45 }}>
        <Sky sunPosition={[100, 20, 100]} inclination={0.6} azimuth={0.1} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.4} />
        <directionalLight
            position={[10, 20, 10]}
            intensity={1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
        />

        {/* Ground */}
        <Plane args={[100, 100]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color="#2d3748" />
        </Plane>

        {/* Roads and Sidewalks */}
        <group position={[0, 0.01, 0]}>
            {/* Main Axis X */}
            <Plane args={[100, 6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#1a202c" />
            </Plane>
            {/* Main Axis Z */}
            <Plane args={[6, 100]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#1a202c" />
            </Plane>
            {/* Road Markings */}
            <gridHelper args={[100, 20, '#4a5568', '#4a5568']} />
        </group>

        {/* Scenery */}
        {scenery}

        {/* POIs - Enhanced Buildings */}
        {POIS.map((poi) => (
          <group key={poi.id} position={poi.position}>
            {/* Building Geometry based on type */}
            {poi.type === 'home' && (
                <group>
                    <Box args={[5, 12, 5]} position={[0, 6, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#4a5568" />
                    </Box>
                    <Box args={[5.2, 0.5, 5.2]} position={[0, 12, 0]}>
                        <meshStandardMaterial color="#2d3748" />
                    </Box>
                    {[...Array(5)].map((_, i) => (
                        <Box key={i} args={[4, 1, 0.1]} position={[0, 2 + i * 2, 2.5]}>
                            <meshStandardMaterial color="#cbd5e0" emissive="#fff9c4" emissiveIntensity={0.2} />
                        </Box>
                    ))}
                </group>
            )}
            {poi.type === 'work' && (
                <group>
                    <Box args={[6, 15, 6]} position={[0, 7.5, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#2c5282" />
                    </Box>
                    <Box args={[2, 4, 2]} position={[0, 17, 0]} castShadow>
                        <meshStandardMaterial color="#2b6cb0" />
                    </Box>
                </group>
            )}
            {poi.type === 'cafe' && (
                <group>
                    <Box args={[6, 4, 8]} position={[0, 2, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#744210" />
                    </Box>
                    <Cylinder args={[4, 4, 0.5]} position={[0, 4.25, 0]}>
                        <meshStandardMaterial color="#975a16" />
                    </Cylinder>
                </group>
            )}
            {poi.type === 'park' && (
                <group>
                    <Cylinder args={[6, 6, 0.2]} position={[0, 0.1, 0]} receiveShadow>
                        <meshStandardMaterial color="#2f855a" />
                    </Cylinder>
                </group>
            )}

            <Text
              position={[0, poi.type === 'work' ? 20 : poi.type === 'home' ? 14 : 6, 0]}
              fontSize={1}
              color="white"
              font="/fonts/DINNextRoundedLTPro-Bold.ttf"
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
            <NPC key={npc.id} npc={npc} onSelect={setSelectedNPC} allNpcs={npcs} />
          ))}
        </Suspense>

        <OrbitControls
            makeDefault
            minPolarAngle={Math.PI / 6}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={10}
            maxDistance={60}
        />
      </Canvas>

      {/* UI Overlay */}
      {selectedNPC && (
        <div className="absolute bottom-10 left-10 bg-white/95 backdrop-blur-md p-6 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-4 border-duo-blue w-85 transform transition-all animate-in slide-in-from-bottom-10">
          <div className="flex items-center gap-5 mb-5">
             <div className="w-16 h-16 rounded-3xl border-4 shadow-inner" style={{ backgroundColor: selectedNPC.color, borderColor: '#fff' }} />
             <div>
                <h3 className="font-black text-2xl text-duo-gray-dark leading-tight">{selectedNPC.name}</h3>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <p className="text-xs font-black text-duo-blue uppercase tracking-widest">Simulación Activa</p>
                </div>
             </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded-2xl">
                <p className="text-[10px] font-black text-duo-gray uppercase mb-1">Actividad Actual</p>
                <p className="font-bold text-duo-gray-dark text-lg italic">"{selectedNPC.activity}"</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center p-2 bg-orange-50 rounded-xl border border-orange-100">
                    <Utensils size={18} className="text-orange-500 mb-1" />
                    <div className="w-full h-1.5 bg-orange-200 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${selectedNPC.needs.hunger}%` }} />
                    </div>
                </div>
                <div className="flex flex-col items-center p-2 bg-blue-50 rounded-xl border border-blue-100">
                    <Zap size={18} className="text-blue-500 mb-1" />
                    <div className="w-full h-1.5 bg-blue-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${selectedNPC.needs.energy}%` }} />
                    </div>
                </div>
                <div className="flex flex-col items-center p-2 bg-pink-50 rounded-xl border border-pink-100">
                    <Heart size={18} className="text-pink-500 mb-1" />
                    <div className="w-full h-1.5 bg-pink-200 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 transition-all duration-500" style={{ width: `${selectedNPC.needs.social}%` }} />
                    </div>
                </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedNPC(null)}
            className="mt-6 w-full py-3 bg-duo-blue text-white font-black rounded-2xl border-b-6 border-blue-600 active:border-b-0 active:translate-y-1.5 transition-all uppercase tracking-wider"
          >
            Cerrar Perfil
          </button>
        </div>
      )}

      <div className="absolute top-8 left-8 pointer-events-none">
         <div className="flex items-center gap-3 mb-1">
            <div className="bg-duo-blue p-2 rounded-xl shadow-lg">
                <BoxIcon className="text-white" size={24} />
            </div>
            <h2 className="text-white text-4xl font-black italic tracking-tighter drop-shadow-lg">METRÓPOLIS</h2>
         </div>
         <p className="text-duo-blue font-black uppercase tracking-[0.3em] text-xs ml-12 opacity-90">Simulación de Vida v2.0</p>
      </div>

      <div className="absolute top-8 right-8 flex flex-col gap-2">
          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              15 NPCs Autónomos
          </div>
          <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Ciclo de Necesidades Real
          </div>
      </div>
    </div>
  );
};

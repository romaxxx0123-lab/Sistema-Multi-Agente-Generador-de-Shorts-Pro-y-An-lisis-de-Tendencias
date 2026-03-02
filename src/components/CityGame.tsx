
import React, { Suspense, useState, useMemo, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Plane, Box, Text, Cone, Cylinder } from '@react-three/drei';
import { POIS, createNPC } from '../utils/cityLogic';
import { NPC } from './NPC';
import { Player } from './Player';
import { Heart, Zap, Utensils, Dumbbell, Sun, Moon, Box as BoxIcon } from 'lucide-react';

const Tree = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.25, 0.25, 1.2]} position={[0, 0.6, 0]} castShadow>
      <meshStandardMaterial color="#3d2b1f" />
    </Cylinder>
    <Cone args={[1.2, 2.5, 8]} position={[0, 2.2, 0]} castShadow>
      <meshStandardMaterial color="#1b5e20" />
    </Cone>
    <Cone args={[1, 1.8, 8]} position={[0, 3.2, 0]} castShadow>
      <meshStandardMaterial color="#2e7d32" />
    </Cone>
  </group>
);

const LampPost = ({ position, isNight }: { position: [number, number, number], isNight: boolean }) => (
  <group position={position}>
    <Cylinder args={[0.12, 0.12, 5]} position={[0, 2.5, 0]} castShadow>
      <meshStandardMaterial color="#263238" />
    </Cylinder>
    <Box args={[0.8, 0.4, 0.8]} position={[0, 5, 0]}>
      <meshStandardMaterial
        color={isNight ? "#fff9c4" : "#eceff1"}
        emissive={isNight ? "#fffde7" : "#000"}
        emissiveIntensity={isNight ? 5 : 0}
      />
    </Box>
    {isNight && <pointLight position={[0, 4.5, 0]} intensity={2.5} distance={15} color="#fffde7" />}
  </group>
);

export const CityGame: React.FC = () => {
  const [npcs] = useState(() => Array.from({ length: 18 }, (_, i) => createNPC(i.toString())));
  const [selectedNPC, setSelectedNPC] = useState<any>(null);
  const [hour, setHour] = useState(12);

  useEffect(() => {
    const timer = setInterval(() => {
        setHour(h => (h + 0.1) % 24);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isNight = hour >= 20 || hour <= 6;
  const sunPos = useMemo(() => {
      const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(angle) * 100, Math.sin(angle) * 100, 50] as [number, number, number];
  }, [hour]);

  const scenery = useMemo(() => {
    const items = [];
    // Parks and Boulevards
    for (let i = 0; i < 12; i++) {
        const x = Math.sin(i) * 5;
        const z = 10 + Math.cos(i) * 5;
        items.push(<Tree key={`tree-p-${i}`} position={[x, 0, z]} />);
    }
    // Perimeter lamp posts
    const postPositions: [number, number, number][] = [
        [8, 0, 8], [-8, 0, 8], [8, 0, -8], [-8, 0, -8],
        [20, 0, 0], [-20, 0, 0], [0, 0, 20], [0, 0, -20]
    ];
    postPositions.forEach((pos, idx) => {
        items.push(<LampPost key={`lp-${idx}`} position={pos} isNight={isNight} />);
    });

    return items;
  }, [isNight]);

  return (
    <div className="w-full h-full bg-slate-900 relative font-['DIN_Next_Rounded_OT'] overflow-hidden">
      <Canvas shadows camera={{ position: [30, 30, 30], fov: 45 }}>
        <Sky sunPosition={sunPos} inclination={hour / 24} azimuth={0.25} />
        <Stars radius={150} depth={50} count={isNight ? 7000 : 0} factor={4} saturation={0} fade speed={1} />

        <ambientLight intensity={isNight ? 0.05 : 0.4} />
        <directionalLight
            position={sunPos}
            intensity={isNight ? 0 : 1.5}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-50}
            shadow-camera-right={50}
            shadow-camera-top={50}
            shadow-camera-bottom={-50}
        />

        {/* Ground */}
        <Plane args={[120, 120]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color={isNight ? "#0d1117" : "#1e293b"} />
        </Plane>

        {/* Detailed Road Grid */}
        <group position={[0, 0.02, 0]}>
            <Plane args={[120, 8]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#111" />
            </Plane>
            <Plane args={[8, 120]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#111" />
            </Plane>
            <gridHelper args={[120, 30, isNight ? '#333' : '#444', isNight ? '#111' : '#222']} />
        </group>

        {/* Scenery */}
        {scenery}

        {/* Buildings with Interior Lights */}
        {POIS.map((poi) => (
          <group key={poi.id} position={poi.position}>
            {poi.type === 'home' && (
                <group>
                    <Box args={[6, 16, 6]} position={[0, 8, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#334155" />
                    </Box>
                    <Box args={[6.2, 0.6, 6.2]} position={[0, 16, 0]}>
                        <meshStandardMaterial color="#1e293b" />
                    </Box>
                    {/* Apartment Windows */}
                    {[...Array(6)].map((_, i) => (
                        <group key={i}>
                            <Box args={[4.5, 1.2, 0.1]} position={[0, 2.5 + i * 2.5, 3.01]}>
                                <meshStandardMaterial
                                    color="#111"
                                    emissive={isNight && Math.random() > 0.4 ? "#fff9c4" : "#000"}
                                    emissiveIntensity={1.5}
                                />
                            </Box>
                            <Box args={[4.5, 1.2, 0.1]} position={[0, 2.5 + i * 2.5, -3.01]}>
                                <meshStandardMaterial
                                    color="#111"
                                    emissive={isNight && Math.random() > 0.4 ? "#fff9c4" : "#000"}
                                    emissiveIntensity={1.5}
                                />
                            </Box>
                        </group>
                    ))}
                </group>
            )}
            {poi.type === 'work' && (
                <group>
                    <Box args={[8, 22, 8]} position={[0, 11, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#0f172a" />
                    </Box>
                    <Box args={[8.2, 1, 8.2]} position={[0, 22, 0]}>
                        <meshStandardMaterial color="#1e293b" />
                    </Box>
                    {/* Glass Panels */}
                    {[...Array(8)].map((_, i) => (
                        <Box key={i} args={[6, 1.5, 8.1]} position={[0, 3 + i * 2.5, 0]}>
                            <meshStandardMaterial
                                color="#1e293b"
                                transparent
                                opacity={0.8}
                                emissive={isNight ? "#81e6d9" : "#000"}
                                emissiveIntensity={0.5}
                            />
                        </Box>
                    ))}
                </group>
            )}
            {poi.type === 'cafe' && (
                <group>
                    <Box args={[8, 5, 10]} position={[0, 2.5, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#5d4037" />
                    </Box>
                    <Cylinder args={[5, 5, 0.8, 32]} position={[0, 5.4, 0]}>
                        <meshStandardMaterial color="#3e2723" />
                    </Cylinder>
                    {/* Cafe Sign */}
                    <Box args={[4, 1.5, 0.2]} position={[0, 3.5, 5.1]}>
                        <meshStandardMaterial color="#ffc800" emissive="#ffc800" emissiveIntensity={isNight ? 2 : 0} />
                    </Box>
                </group>
            )}
            {poi.type === 'gym' && (
                <group>
                    <Box args={[10, 6, 10]} position={[0, 3, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#2d3748" />
                    </Box>
                    <Box args={[10.2, 0.5, 10.2]} position={[0, 6, 0]}>
                        <meshStandardMaterial color="#718096" />
                    </Box>
                </group>
            )}
            {poi.type === 'theater' && (
                <group>
                    <Box args={[12, 10, 12]} position={[0, 5, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#702459" />
                    </Box>
                    <Cylinder args={[7, 7, 2, 4]} rotation={[0, Math.PI/4, 0]} position={[0, 11, 0]} castShadow>
                        <meshStandardMaterial color="#4a1539" />
                    </Cylinder>
                </group>
            )}
            {poi.type === 'park' && (
                <group>
                    <Cylinder args={[8, 8, 0.3, 32]} position={[0, 0.15, 0]} receiveShadow>
                        <meshStandardMaterial color="#2e7d32" />
                    </Cylinder>
                </group>
            )}

            <Text
              position={[0, poi.type === 'work' ? 24 : poi.type === 'home' ? 18 : 8, 0]}
              fontSize={1.2}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.1}
              outlineColor="black"
            >
              {poi.name}
            </Text>
          </group>
        ))}

        {/* NPCs */}
        <Suspense fallback={null}>
          {npcs.map((npc) => (
            <NPC key={npc.id} npc={npc} onSelect={setSelectedNPC} hour={hour} />
          ))}
        </Suspense>

        {/* Playable Character */}
        <Player isNight={isNight} />

        <OrbitControls
            makeDefault
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={15}
            maxDistance={80}
        />
      </Canvas>

      {/* Real-time Clock HUD */}
      <div className="absolute top-8 right-8 flex flex-col gap-3 items-end">
          <div className="bg-black/80 backdrop-blur-xl px-6 py-3 rounded-3xl border-2 border-white/20 text-white flex items-center gap-4 shadow-2xl">
              {hour >= 6 && hour < 19 ? <Sun className="text-yellow-400" /> : <Moon className="text-blue-300" />}
              <div className="flex flex-col">
                  <span className="text-2xl font-black tabular-nums tracking-tighter">
                      {Math.floor(hour).toString().padStart(2, '0')}:
                      {Math.floor((hour % 1) * 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Tiempo en Metrópolis</span>
              </div>
          </div>
          <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-3">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              18 NPCs Dinámicos
          </div>
      </div>

      {/* UI Overlay */}
      {selectedNPC && (
        <div className="absolute bottom-10 left-10 bg-white/95 backdrop-blur-lg p-7 rounded-[2.5rem] shadow-[0_30px_60px_rgba(0,0,0,0.4)] border-4 border-duo-blue w-90 animate-in slide-in-from-bottom-20 duration-500">
          <div className="flex items-center gap-6 mb-6">
             <div className="w-20 h-20 rounded-3xl border-4 shadow-xl flex-shrink-0" style={{ backgroundColor: selectedNPC.color, borderColor: '#fff' }} />
             <div className="overflow-hidden">
                <h3 className="font-black text-3xl text-duo-gray-dark truncate">{selectedNPC.name}</h3>
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]" />
                    <p className="text-xs font-black text-duo-blue uppercase tracking-widest">Vida Autónoma</p>
                </div>
             </div>
          </div>

          <div className="space-y-5">
            <div className="bg-slate-100/80 p-4 rounded-2xl border-2 border-white">
                <p className="text-[10px] font-black text-duo-gray uppercase mb-1 tracking-wider">Actividad en Curso</p>
                <p className="font-black text-duo-gray-dark text-xl italic leading-tight">"{selectedNPC.activity}"</p>
            </div>

            <div className="grid grid-cols-4 gap-3">
                <div className="flex flex-col items-center gap-2 p-2.5 bg-orange-50 rounded-2xl border border-orange-100 shadow-sm">
                    <Utensils size={20} className="text-orange-500" />
                    <div className="w-full h-2 bg-orange-200 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-700 ease-out" style={{ width: `${selectedNPC.needs.hunger}%` }} />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-2 p-2.5 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
                    <Zap size={20} className="text-blue-500" />
                    <div className="w-full h-2 bg-blue-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all duration-700 ease-out" style={{ width: `${selectedNPC.needs.energy}%` }} />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-2 p-2.5 bg-pink-50 rounded-2xl border border-pink-100 shadow-sm">
                    <Heart size={20} className="text-pink-500" />
                    <div className="w-full h-2 bg-pink-200 rounded-full overflow-hidden">
                        <div className="h-full bg-pink-500 transition-all duration-700 ease-out" style={{ width: `${selectedNPC.needs.social}%` }} />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-2 p-2.5 bg-emerald-50 rounded-2xl border border-emerald-100 shadow-sm">
                    <Dumbbell size={20} className="text-emerald-500" />
                    <div className="w-full h-2 bg-emerald-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${selectedNPC.needs.fitness}%` }} />
                    </div>
                </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedNPC(null)}
            className="mt-8 w-full py-4 bg-duo-blue text-white font-black rounded-[1.25rem] border-b-8 border-blue-600 active:border-b-0 active:translate-y-2 transition-all uppercase tracking-widest text-sm shadow-lg hover:brightness-110"
          >
            Cerrar Perfil
          </button>
        </div>
      )}

      <div className="absolute top-8 left-8 pointer-events-none group">
         <div className="flex items-center gap-4 mb-2">
            <div className="bg-duo-blue p-3 rounded-[1.25rem] shadow-2xl border-4 border-white/20 transform group-hover:rotate-12 transition-transform duration-500">
                <BoxIcon className="text-white" size={32} />
            </div>
            <h2 className="text-white text-5xl font-black italic tracking-tighter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]">METRÓPOLIS</h2>
         </div>
         <p className="text-duo-blue font-black uppercase tracking-[0.4em] text-sm ml-20 opacity-90 drop-shadow-md">High Fidelity Simulation</p>
      </div>

      <div className="absolute bottom-8 right-8 bg-black/80 backdrop-blur-xl p-4 rounded-3xl border-2 border-white/20 text-white flex items-center gap-4 shadow-2xl">
          <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-widest opacity-60">Controles</span>
              <span className="text-sm font-bold flex items-center gap-2">
                  <kbd className="bg-white/10 px-2 py-0.5 rounded border border-white/20">WASD</kbd> para caminar
              </span>
          </div>
      </div>
    </div>
  );
};

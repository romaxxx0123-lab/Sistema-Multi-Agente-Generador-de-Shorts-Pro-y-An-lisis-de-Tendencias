
import React, { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Plane, Box, Text, Cone, Cylinder, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, createNPC } from '../utils/cityLogic';
import { NPC } from './NPC';
import { Player } from './Player';
import { Utensils, Zap, Sun, Moon, Info, Wallet, Star, Users, CloudRain } from 'lucide-react';

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

const TrafficLight = ({ position, rotation = 0, state = 'green' }: { position: [number, number, number], rotation?: number, state?: 'red' | 'yellow' | 'green' }) => (
    <group position={position} rotation={[0, rotation, 0]}>
        <Cylinder args={[0.15, 0.15, 6]} position={[0, 3, 0]}>
            <meshStandardMaterial color="#222" />
        </Cylinder>
        <Box args={[0.6, 1.5, 0.6]} position={[0, 5.5, 0]}>
            <meshStandardMaterial color="#333" />
        </Box>
        <Sphere args={[0.15]} position={[0, 6, 0.31]}>
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={state === 'red' ? 5 : 0.2} />
        </Sphere>
        <Sphere args={[0.15]} position={[0, 5.5, 0.31]}>
            <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={state === 'yellow' ? 5 : 0.2} />
        </Sphere>
        <Sphere args={[0.15]} position={[0, 5, 0.31]}>
            <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={state === 'green' ? 5 : 0.2} />
        </Sphere>
    </group>
);

const Car = ({ initialPos, direction }: { initialPos: [number, number, number], direction: 'x' | 'z' }) => {
    const meshRef = useRef<THREE.Group>(null);
    const speed = direction === 'x' ? 0.15 : -0.15;
    const color = useMemo(() => ['#ff4b4b', '#1cb0f6', '#ffffff', '#333'][Math.floor(Math.random() * 4)], []);

    useFrame(() => {
        if (meshRef.current) {
            if (direction === 'x') {
                meshRef.current.position.x += speed;
                if (meshRef.current.position.x > 120) meshRef.current.position.x = -120;
            } else {
                meshRef.current.position.z += speed;
                if (meshRef.current.position.z < -120) meshRef.current.position.z = 120;
            }
        }
    });

    return (
        <group ref={meshRef} position={initialPos} rotation={[0, direction === 'x' ? Math.PI / 2 : 0, 0]}>
            <Box args={[2, 1, 4]} position={[0, 0.6, 0]} castShadow>
                <meshStandardMaterial color={color} />
            </Box>
            <Box args={[1.8, 0.8, 2]} position={[0, 1.4, -0.2]}>
                <meshStandardMaterial color="#333" transparent opacity={0.7} />
            </Box>
        </group>
    );
};

const Traffic = () => (
    <group>
        {[...Array(8)].map((_, i) => (
            <Car key={`car-x-${i}`} initialPos={[-100 + i * 25, 0, 3]} direction="x" />
        ))}
        {[...Array(8)].map((_, i) => (
            <Car key={`car-z-${i}`} initialPos={[3, 0, 100 - i * 25]} direction="z" />
        ))}
    </group>
);

const RoadInfrastructure = ({ trafficState }: { trafficState: 'red' | 'green' }) => (
    <group position={[0, 0.05, 0]}>
        {[...Array(50)].map((_, i) => (
            <group key={i}>
                <Plane args={[1, 0.2]} position={[0, 0, -125 + i * 5]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
                    <meshStandardMaterial color="white" />
                </Plane>
                <Plane args={[1, 0.2]} position={[-125 + i * 5, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <meshStandardMaterial color="white" />
                </Plane>
            </group>
        ))}
        {/* Sidewalks */}
        <Plane args={[250, 4]} position={[0, 0, 8]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color="#475569" />
        </Plane>
        <Plane args={[250, 4]} position={[0, 0, -8]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color="#475569" />
        </Plane>
        <Plane args={[4, 250]} position={[8, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color="#475569" />
        </Plane>
        <Plane args={[4, 250]} position={[-8, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <meshStandardMaterial color="#475569" />
        </Plane>

        <group position={[0, 0, 0]}>
            {[...Array(6)].map((_, i) => (
                <Plane key={i} args={[0.5, 3]} position={[-3.5 + i * 1.4, 0, 6.5]} rotation={[-Math.PI / 2, 0, 0]}>
                    <meshStandardMaterial color="white" />
                </Plane>
            ))}
            {[...Array(6)].map((_, i) => (
                <Plane key={i} args={[0.5, 3]} position={[-3.5 + i * 1.4, 0, -6.5]} rotation={[-Math.PI / 2, 0, 0]}>
                    <meshStandardMaterial color="white" />
                </Plane>
            ))}
        </group>
        <TrafficLight position={[6, 0, 6]} rotation={-Math.PI / 4} state={trafficState} />
        <TrafficLight position={[-6, 0, -6]} rotation={3 * Math.PI / 4} state={trafficState} />
    </group>
);

const Bench = ({ position, rotation = 0 }: { position: [number, number, number], rotation?: number }) => (
    <group position={position} rotation={[0, rotation, 0]}>
        <Box args={[2, 0.1, 0.8]} position={[0, 0.5, 0]}>
            <meshStandardMaterial color="#5d4037" />
        </Box>
        <Box args={[0.1, 0.5, 0.8]} position={[-0.9, 0.25, 0]}>
            <meshStandardMaterial color="#333" />
        </Box>
        <Box args={[0.1, 0.5, 0.8]} position={[0.9, 0.25, 0]}>
            <meshStandardMaterial color="#333" />
        </Box>
        <Box args={[2, 0.6, 0.1]} position={[0, 0.8, -0.35]}>
            <meshStandardMaterial color="#5d4037" />
        </Box>
    </group>
);

const Rain = ({ active }: { active: boolean }) => {
    const count = 1000;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 150;
            pos[i * 3 + 1] = Math.random() * 50;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 150;
        }
        return pos;
    }, []);

    const rainRef = useRef<THREE.Points>(null);
    useFrame(() => {
        if (rainRef.current && active) {
            const attr = rainRef.current.geometry.attributes.position;
            for (let i = 0; i < count; i++) {
                attr.setY(i, attr.getY(i) - 0.8);
                if (attr.getY(i) < 0) attr.setY(i, 50);
            }
            attr.needsUpdate = true;
        }
    });

    if (!active) return null;

    return (
        <points ref={rainRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={0.15} color="#60a5fa" transparent opacity={0.6} />
        </points>
    );
};

export const CityGame: React.FC = () => {
  const [npcs] = useState(() => Array.from({ length: 40 }, (_, i) => createNPC(i.toString())));
  const [selectedNPC, setSelectedNPC] = useState<any>(null);
  const [hour, setHour] = useState(12);
  const [trafficState, setTrafficState] = useState<'red' | 'green'>('green');
  const [isRaining, setIsRaining] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
        setHour(h => (h + 0.1) % 24);
    }, 1000);
    const trafficTimer = setInterval(() => {
        setTrafficState(s => s === 'green' ? 'red' : 'green');
    }, 10000);
    const rainTimer = setInterval(() => {
        setIsRaining(Math.random() > 0.8);
    }, 30000);
    return () => {
        clearInterval(timer);
        clearInterval(trafficTimer);
        clearInterval(rainTimer);
    };
  }, []);

  const isNight = hour >= 20 || hour <= 6;
  const sunPos = useMemo(() => {
      const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(angle) * 100, Math.sin(angle) * 100, 50] as [number, number, number];
  }, [hour]);

  const scenery = useMemo(() => {
    const items = [];
    for (let i = 0; i < 35; i++) {
        const angle = (i / 35) * Math.PI * 2;
        const x = Math.cos(angle) * 14;
        const z = 10 + Math.sin(angle) * 14;
        items.push(<Tree key={`tree-p-${i}`} position={[x, 0, z]} />);
    }
    items.push(<Bench key="bench-1" position={[6, 0, 20]} rotation={Math.PI / 2} />);
    items.push(<Bench key="bench-2" position={[-6, 0, 20]} rotation={-Math.PI / 2} />);

    const postPositions: [number, number, number][] = [
        [10, 0, 10], [-10, 0, 10], [10, 0, -10], [-10, 0, -10],
        [40, 0, 0], [-40, 0, 0], [0, 0, 40], [0, 0, -40],
        [25, 0, 25], [-25, 0, 25], [25, 0, -25], [-25, 0, -25]
    ];
    postPositions.forEach((pos, idx) => {
        items.push(<LampPost key={`lp-${idx}`} position={pos} isNight={isNight} />);
    });

    return items;
  }, [isNight]);

  return (
    <div className="w-full h-full bg-slate-900 relative font-['DIN_Next_Rounded_OT'] overflow-hidden">
      <Canvas shadows camera={{ position: [55, 55, 55], fov: 45 }}>
        <fog attach="fog" args={[isNight ? '#050510' : (isRaining ? '#475569' : '#cbd5e1'), 40, 200]} />
        <Sky sunPosition={sunPos} inclination={hour / 24} azimuth={0.25} />
        <Stars radius={150} depth={50} count={isNight ? 9000 : 500} factor={4} saturation={0} fade speed={1} />

        <ambientLight intensity={isNight ? 0.1 : (isRaining ? 0.3 : 0.6)} />
        <directionalLight
            position={sunPos}
            intensity={isNight ? 0.1 : (isRaining ? 0.5 : 2.0)}
            castShadow
            shadow-mapSize={[4096, 4096]}
            shadow-camera-left={-100}
            shadow-camera-right={100}
            shadow-camera-top={100}
            shadow-camera-bottom={-100}
        />

        <Plane args={[300, 300]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color={isNight ? "#0d1117" : (isRaining ? "#1e293b" : "#1e293b")} />
        </Plane>

        <group position={[0, 0.02, 0]}>
            <Plane args={[300, 12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#111" />
            </Plane>
            <Plane args={[12, 300]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <meshStandardMaterial color="#111" />
            </Plane>
            <gridHelper args={[300, 60, isNight ? '#222' : '#333', isNight ? '#050505' : '#111']} />
        </group>

        <RoadInfrastructure trafficState={trafficState} />
        <Traffic />
        <Rain active={isRaining} />

        {scenery}

        {POIS.map((poi) => (
          <group key={poi.id} position={poi.position}>
            {poi.type === 'home' && (
                <group>
                    <Box args={[12, 22, 12]} position={[0, 11, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#475569" />
                    </Box>
                    {[...Array(7)].map((_, i) => (
                        <Box key={i} args={[10, 2, 0.2]} position={[0, 4 + i * 3, 6.01]}>
                            <meshStandardMaterial
                                color="#111"
                                emissive={isNight && Math.random() > 0.3 ? "#fff9c4" : "#000"}
                                emissiveIntensity={2.5}
                            />
                        </Box>
                    ))}
                </group>
            )}
            {poi.type === 'work' && (
                <group>
                    <Box args={[14, 55, 14]} position={[0, 27.5, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#0f172a" />
                    </Box>
                    {[...Array(18)].map((_, i) => (
                        <Box key={i} args={[12, 1, 14.1]} position={[0, 6 + i * 3, 0]}>
                            <meshStandardMaterial
                                color="#1e293b"
                                transparent
                                opacity={0.9}
                                emissive={isNight ? "#81e6d9" : "#000"}
                                emissiveIntensity={1.5}
                            />
                        </Box>
                    ))}
                </group>
            )}
            {poi.type === 'cafe' && (
                <group>
                    <Box args={[16, 8, 16]} position={[0, 4, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#5d4037" />
                    </Box>
                    <Box args={[10, 3, 0.5]} position={[0, 5.5, 8.1]}>
                        <meshStandardMaterial color="#ffc800" emissive="#ffc800" emissiveIntensity={isNight ? 4 : 1} />
                    </Box>
                </group>
            )}
            {poi.type === 'gym' && (
                <group>
                    <Box args={[18, 12, 18]} position={[0, 6, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#334155" />
                    </Box>
                    <Box args={[16, 8, 18.1]} position={[0, 6, 0]}>
                        <meshStandardMaterial color="#94a3b8" transparent opacity={0.6} emissive={isNight ? "#fff" : "#000"} emissiveIntensity={0.8} />
                    </Box>
                </group>
            )}
            {poi.type === 'theater' && (
                <group>
                    <Box args={[24, 18, 24]} position={[0, 9, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#881337" />
                    </Box>
                    <Sphere args={[10, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} position={[0, 18, 0]}>
                        <meshStandardMaterial color="#be123c" />
                    </Sphere>
                </group>
            )}
            {poi.type === 'park' && (
                <group>
                    <Cylinder args={[25, 25, 0.6, 64]} position={[0, 0.3, 0]} receiveShadow>
                        <meshStandardMaterial color="#166534" />
                    </Cylinder>
                    <group position={[0, 0.6, 0]}>
                        <Cylinder args={[5, 5, 0.8, 32]}>
                            <meshStandardMaterial color="#94a3b8" />
                        </Cylinder>
                        <Sphere args={[1.2]} position={[0, 3, 0]}>
                            <meshStandardMaterial color="#60a5fa" transparent opacity={0.8} emissive="#60a5fa" emissiveIntensity={1} />
                        </Sphere>
                    </group>
                </group>
            )}

            <Text
              position={[0, poi.type === 'work' ? 65 : poi.type === 'home' ? 30 : 24, 0]}
              fontSize={2.2}
              color="white"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.25}
              outlineColor="black"
            >
              {poi.name}
            </Text>
          </group>
        ))}

        <Suspense fallback={null}>
          {npcs.map((npc) => (
            <NPC key={npc.id} npc={npc} onSelect={setSelectedNPC} hour={hour} />
          ))}
        </Suspense>

        <Player isNight={isNight} />

        <OrbitControls
            makeDefault
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.1}
            minDistance={40}
            maxDistance={200}
        />
      </Canvas>

      <div className="absolute top-8 right-8 flex flex-col gap-4 items-end">
          <div className="bg-black/95 backdrop-blur-3xl px-10 py-6 rounded-[3rem] border-2 border-white/20 text-white flex items-center gap-10 shadow-[0_40px_80px_rgba(0,0,0,0.7)]">
              <div className="bg-white/10 p-5 rounded-3xl relative">
                {isRaining && <CloudRain className="absolute -top-2 -right-2 text-blue-400 animate-bounce" size={24} />}
                {hour >= 6 && hour < 19 ? <Sun className="text-yellow-400 animate-spin-slow" size={48} /> : <Moon className="text-blue-300" size={48} />}
              </div>
              <div className="flex flex-col">
                  <span className="text-6xl font-black tabular-nums tracking-tighter leading-none">
                      {Math.floor(hour).toString().padStart(2, '0')}:
                      {Math.floor((hour % 1) * 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-sm font-black uppercase tracking-[0.3em] opacity-60 mt-3">Metrópolis en Tiempo Real</span>
              </div>
          </div>
          {isRaining && (
              <div className="bg-blue-600/90 backdrop-blur-xl px-6 py-3 rounded-2xl border-2 border-blue-400 text-white text-xs font-black uppercase tracking-widest animate-pulse flex items-center gap-3">
                  <CloudRain size={16} /> Clima: Lluvia Intensa
              </div>
          )}
      </div>

      {selectedNPC && (
        <div className="absolute bottom-10 left-10 bg-white/99 backdrop-blur-3xl p-12 rounded-[4rem] shadow-[0_60px_120px_rgba(0,0,0,0.7)] border-4 border-duo-blue w-120 animate-in fade-in zoom-in slide-in-from-left-32 duration-700">
          <div className="flex items-center gap-12 mb-12">
             <div className="relative">
                <div className="w-32 h-32 rounded-[3rem] border-4 shadow-2xl flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ backgroundColor: selectedNPC.color, borderColor: '#fff' }}>
                    <div className="w-24 h-24 rounded-full bg-white/40" />
                </div>
                <div className="absolute -bottom-4 -right-4 bg-duo-blue text-white px-5 py-2 rounded-full shadow-2xl border-2 border-white font-black text-xs uppercase tracking-widest">
                    {selectedNPC.specialty}
                </div>
             </div>
             <div className="overflow-hidden flex-1">
                <h3 className="font-black text-6xl text-duo-gray-dark truncate mb-3 tracking-tighter">{selectedNPC.name}</h3>
                <div className="flex items-center gap-4">
                    <div className="px-5 py-2 bg-green-100 rounded-full flex items-center gap-3 border-2 border-green-200">
                        <span className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_15px_#22c55e]" />
                        <p className="text-xs font-black text-green-700 uppercase tracking-widest">{selectedNPC.mood}</p>
                    </div>
                    <div className="px-5 py-2 bg-orange-100 rounded-full flex items-center gap-3 border-2 border-orange-200">
                        <Wallet size={20} className="text-orange-600" />
                        <span className="text-sm font-black text-orange-700">{Math.floor(selectedNPC.money)}$</span>
                    </div>
                </div>
             </div>
          </div>

          <div className="space-y-10">
            <div className="bg-slate-50 p-8 rounded-[2.5rem] border-2 border-slate-100 relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-3 h-full bg-duo-blue" />
                <p className="text-xs font-black text-duo-gray uppercase mb-3 tracking-[0.2em] opacity-60">Actividad del Ciudadano</p>
                <p className="font-black text-duo-gray-dark text-4xl italic leading-tight">"{selectedNPC.activity}"</p>
            </div>

            <div className="grid grid-cols-2 gap-8">
                <div className="bg-orange-50/80 p-6 rounded-[2.5rem] border-2 border-orange-100 flex flex-col gap-5">
                    <div className="flex justify-between items-center">
                        <Utensils size={32} className="text-orange-500" />
                        <span className="font-black text-orange-600 text-base">{Math.floor(selectedNPC.needs.hunger)}%</span>
                    </div>
                    <div className="w-full h-5 bg-orange-200 rounded-full overflow-hidden border-2 border-orange-300/30">
                        <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${selectedNPC.needs.hunger}%` }} />
                    </div>
                </div>
                <div className="bg-blue-50/80 p-6 rounded-[2.5rem] border-2 border-blue-100 flex flex-col gap-5">
                    <div className="flex justify-between items-center">
                        <Zap size={32} className="text-blue-500" />
                        <span className="font-black text-blue-600 text-base">{Math.floor(selectedNPC.needs.energy)}%</span>
                    </div>
                    <div className="w-full h-5 bg-blue-200 rounded-full overflow-hidden border-2 border-blue-300/30">
                        <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${selectedNPC.needs.energy}%` }} />
                    </div>
                </div>
            </div>
          </div>

          <button
            onClick={() => setSelectedNPC(null)}
            className="mt-14 w-full py-8 bg-duo-blue text-white font-black rounded-[2.5rem] border-b-8 border-blue-800 active:border-b-0 active:translate-y-2 transition-all uppercase tracking-[0.4em] text-base shadow-[0_20px_40px_rgba(28,176,246,0.3)] hover:brightness-110 flex items-center justify-center gap-5"
          >
            Actualizar Registro
          </button>
        </div>
      )}

      <div className="absolute bottom-8 left-8 flex items-center gap-8">
          <div className="bg-duo-blue p-6 rounded-[2.5rem] shadow-3xl border-2 border-white/20">
              <Info className="text-white" size={40} />
          </div>
          <div className="bg-black/80 backdrop-blur-3xl px-10 py-6 rounded-[2.5rem] border-2 border-white/10 text-white shadow-3xl flex gap-10 items-center">
              <div className="flex flex-col">
                <h4 className="font-black text-xl uppercase tracking-widest leading-none mb-2">Simulador Ultra Real</h4>
                <p className="text-xs font-bold opacity-70 tracking-tight">Economía de Mercado y Clima Dinámico</p>
              </div>
              <div className="flex gap-6">
                  <div className="flex flex-col items-center">
                      <Users size={24} className="text-duo-blue mb-2" />
                      <span className="text-xs font-black">Pob: 40</span>
                  </div>
                  <div className="flex flex-col items-center">
                      <Star size={24} className="text-yellow-400 mb-2" />
                      <span className="text-xs font-black">9 POIS</span>
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

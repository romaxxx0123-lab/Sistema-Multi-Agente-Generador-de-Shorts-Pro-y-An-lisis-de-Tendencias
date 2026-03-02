
import React, { Suspense, useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sky, Stars, Plane, Box, Text, Cone, Cylinder, Sphere } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, createNPC } from '../utils/cityLogic';
import { NPC } from './NPC';
import { Player } from './Player';
import { Sun, Moon, Info, Wallet, Star, Users } from 'lucide-react';

const Tree = ({ position }: { position: [number, number, number] }) => (
  <group position={position}>
    <Cylinder args={[0.3, 0.3, 1.5]} position={[0, 0.75, 0]} castShadow>
      <meshStandardMaterial color="#3d2b1f" roughness={0.9} />
    </Cylinder>
    <Cone args={[1.5, 3.5, 8]} position={[0, 3, 0]} castShadow>
      <meshStandardMaterial color="#064e3b" roughness={0.8} />
    </Cone>
    <Cone args={[1.2, 2.5, 8]} position={[0, 4.5, 0]} castShadow>
      <meshStandardMaterial color="#065f46" roughness={0.8} />
    </Cone>
  </group>
);

const LampPost = ({ position, isNight }: { position: [number, number, number], isNight: boolean }) => (
  <group position={position}>
    <Cylinder args={[0.15, 0.15, 7]} position={[0, 3.5, 0]} castShadow>
      <meshStandardMaterial color="#334155" metalness={0.8} roughness={0.2} />
    </Cylinder>
    <Box args={[1.2, 0.6, 1.2]} position={[0, 7, 0]}>
      <meshStandardMaterial
        color={isNight ? "#fff9c4" : "#cbd5e1"}
        emissive={isNight ? "#fffde7" : "#000"}
        emissiveIntensity={isNight ? 8 : 0}
      />
    </Box>
    {isNight && <pointLight position={[0, 6.5, 0]} intensity={3} distance={20} color="#fffde7" />}
  </group>
);

const TrafficLightModel = ({ position, rotation = 0, state = 'green' }: { position: [number, number, number], rotation?: number, state?: 'red' | 'yellow' | 'green' }) => (
    <group position={position} rotation={[0, rotation, 0]}>
        <Cylinder args={[0.2, 0.2, 8]} position={[0, 4, 0]}>
            <meshStandardMaterial color="#1e293b" metalness={0.5} />
        </Cylinder>
        <Box args={[0.8, 2.5, 0.8]} position={[0, 7.5, 0]}>
            <meshStandardMaterial color="#0f172a" />
        </Box>
        <Sphere args={[0.2]} position={[0, 8.2, 0.41]}>
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={state === 'red' ? 10 : 0.2} />
        </Sphere>
        <Sphere args={[0.2]} position={[0, 7.5, 0.41]}>
            <meshStandardMaterial color="#ffaa00" emissive="#ffaa00" emissiveIntensity={state === 'yellow' ? 10 : 0.2} />
        </Sphere>
        <Sphere args={[0.2]} position={[0, 6.8, 0.41]}>
            <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={state === 'green' ? 10 : 0.2} />
        </Sphere>
    </group>
);

const Car = ({ initialPos, direction }: { initialPos: [number, number, number], direction: 'x' | 'z' }) => {
    const meshRef = useRef<THREE.Group>(null);
    const speed = direction === 'x' ? 0.2 : -0.2;
    const color = useMemo(() => ['#ff4b4b', '#1cb0f6', '#f1f5f9', '#0f172a', '#ff9f43'][Math.floor(Math.random() * 5)], []);

    useFrame(() => {
        if (meshRef.current) {
            if (direction === 'x') {
                meshRef.current.position.x += speed;
                if (meshRef.current.position.x > 300) meshRef.current.position.x = -300;
            } else {
                meshRef.current.position.z += speed;
                if (meshRef.current.position.z < -300) meshRef.current.position.z = 300;
            }
        }
    });

    return (
        <group ref={meshRef} position={initialPos} rotation={[0, direction === 'x' ? Math.PI / 2 : 0, 0]}>
            <Box args={[2.5, 1.2, 5]} position={[0, 0.7, 0]} castShadow>
                <meshStandardMaterial color={color} metalness={0.6} roughness={0.3} />
            </Box>
            <Box args={[2.2, 0.9, 2.5]} position={[0, 1.6, -0.2]}>
                <meshStandardMaterial color="#334155" transparent opacity={0.8} />
            </Box>
            <Sphere args={[0.2]} position={[0.9, 0.6, 2.51]}>
                <meshStandardMaterial color="white" emissive="white" emissiveIntensity={3} />
            </Sphere>
            <Sphere args={[0.2]} position={[-0.9, 0.6, 2.51]}>
                <meshStandardMaterial color="white" emissive="white" emissiveIntensity={3} />
            </Sphere>
            <Box args={[1.8, 0.2, 0.1]} position={[0, 0.6, -2.51]}>
                <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2} />
            </Box>
        </group>
    );
};

const Traffic = () => (
    <group>
        {[...Array(15)].map((_, i) => (
            <Car key={`car-x-${i}`} initialPos={[-250 + i * 40, 0, 4.5]} direction="x" />
        ))}
        {[...Array(15)].map((_, i) => (
            <Car key={`car-z-${i}`} initialPos={[4.5, 0, 250 - i * 40]} direction="z" />
        ))}
    </group>
);

const Sidewalk = () => (
    <group position={[0, 0.04, 0]}>
        <Plane args={[600, 8]} position={[0, 0, 12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#64748b" roughness={0.8} />
        </Plane>
        <Plane args={[600, 8]} position={[0, 0, -12]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#64748b" roughness={0.8} />
        </Plane>
        <Plane args={[8, 600]} position={[12, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#64748b" roughness={0.8} />
        </Plane>
        <Plane args={[8, 600]} position={[-12, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <meshStandardMaterial color="#64748b" roughness={0.8} />
        </Plane>
    </group>
);

const RoadInfrastructureModel = ({ trafficState }: { trafficState: 'red' | 'green' }) => (
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
        <TrafficLightModel position={[6, 0, 6]} rotation={-Math.PI / 4} state={trafficState} />
        <TrafficLightModel position={[-6, 0, -6]} rotation={3 * Math.PI / 4} state={trafficState} />
    </group>
);

const Rain = ({ active }: { active: boolean }) => {
    const count = 3000;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 600;
            pos[i * 3 + 1] = Math.random() * 80;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 600;
        }
        return pos;
    }, []);

    const rainRef = useRef<THREE.Points>(null);
    useFrame(() => {
        if (rainRef.current && active) {
            const attr = rainRef.current.geometry.attributes.position;
            for (let i = 0; i < count; i++) {
                attr.setY(i, attr.getY(i) - 1.2);
                if (attr.getY(i) < 0) attr.setY(i, 80);
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
            <pointsMaterial size={0.12} color="#94a3b8" transparent opacity={0.4} />
        </points>
    );
};

export const CityGame: React.FC = () => {
  const [npcs] = useState(() => Array.from({ length: 80 }, (_, i) => createNPC(i.toString())));
  const [selectedNPC, setSelectedNPC] = useState<any>(null);
  const [hour, setHour] = useState(12);
  const [trafficState, setTrafficState] = useState<'red' | 'green'>('green');
  const [isRaining, setIsRaining] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setHour(h => (h + 0.1) % 24), 1000);
    const trafficTimer = setInterval(() => setTrafficState(s => s === 'green' ? 'red' : 'green'), 8000);
    const rainTimer = setInterval(() => setIsRaining(Math.random() > 0.85), 45000);
    return () => { clearInterval(timer); clearInterval(trafficTimer); clearInterval(rainTimer); };
  }, []);

  const isNight = hour >= 20 || hour <= 6;
  const sunPos = useMemo(() => {
      const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
      return [Math.cos(angle) * 200, Math.sin(angle) * 200, 100] as [number, number, number];
  }, [hour]);

  const scenery = useMemo(() => {
    const items = [];
    for (let i = 0; i < 60; i++) {
        const dist = 40 + Math.random() * 150;
        const angle = (i / 60) * Math.PI * 2;
        items.push(<Tree key={`tree-${i}`} position={[Math.cos(angle) * dist, 0, Math.sin(angle) * dist]} />);
    }
    const positions = [[25, 25], [-25, 25], [25, -25], [-25, -25], [80, 0], [-80, 0], [0, 80], [0, -80], [120, 120], [-120, -120]];
    positions.forEach((pos, idx) => {
        items.push(<LampPost key={`lp-${idx}`} position={[pos[0], 0, pos[1]]} isNight={isNight} />);
    });
    return items;
  }, [isNight]);

  return (
    <div className="w-full h-full bg-slate-950 relative font-['DIN_Next_Rounded_OT'] overflow-hidden">
      <Canvas shadows camera={{ position: [100, 100, 100], fov: 45 }}>
        <fog attach="fog" args={[isNight ? '#020617' : (isRaining ? '#334155' : '#cbd5e1'), 50, 300]} />
        <Sky sunPosition={sunPos} inclination={hour / 24} azimuth={0.25} />
        <Stars radius={200} depth={60} count={isNight ? 12000 : 800} factor={6} saturation={0} fade speed={1} />
        <ambientLight intensity={isNight ? 0.05 : (isRaining ? 0.2 : 0.5)} />
        <directionalLight
            position={sunPos} intensity={isNight ? 0.1 : (isRaining ? 0.4 : 2.5)} castShadow
            shadow-mapSize={[4096, 4096]} shadow-camera-left={-250} shadow-camera-right={250} shadow-camera-top={250} shadow-camera-bottom={-250}
        />
        <Plane args={[1000, 1000]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <meshStandardMaterial color={isNight ? "#0d1117" : "#1e293b"} roughness={0.9} />
        </Plane>
        <group position={[0, 0.02, 0]}>
            <Plane args={[1000, 18]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.2} /></Plane>
            <Plane args={[18, 1000]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><meshStandardMaterial color="#0a0a0a" roughness={0.6} metalness={0.2} /></Plane>
            <gridHelper args={[1000, 100, isNight ? '#1e293b' : '#334155', isNight ? '#020617' : '#0f172a']} />
        </group>
        <Sidewalk />
        <Traffic />
        <Rain active={isRaining} />
        <RoadInfrastructureModel trafficState={trafficState} />
        {scenery}
        {POIS.map((poi) => (
          <group key={poi.id} position={poi.position}>
            {poi.type === 'home' && (
                <group>
                    <Box args={[16, 28, 16]} position={[0, 14, 0]} castShadow receiveShadow><meshStandardMaterial color="#475569" metalness={0.1} /></Box>
                    {[...Array(10)].map((_, i) => (
                        <Box key={i} args={[14, 1.8, 0.3]} position={[0, 4 + i * 2.5, 8.01]}>
                            <meshStandardMaterial color="#0f172a" emissive={isNight && Math.random() > 0.3 ? "#fef08a" : "#000"} emissiveIntensity={3} />
                        </Box>
                    ))}
                    <Box args={[18, 1, 18]} position={[0, 28, 0]}><meshStandardMaterial color="#1e293b" /></Box>
                </group>
            )}
            {poi.type === 'work' && (
                <group>
                    <Box args={[20, 80, 20]} position={[0, 40, 0]} castShadow receiveShadow><meshStandardMaterial color="#0f172a" metalness={0.8} roughness={0.1} /></Box>
                    {[...Array(25)].map((_, i) => (
                        <Box key={i} args={[18, 1.2, 20.1]} position={[0, 8 + i * 2.8, 0]}>
                            <meshStandardMaterial color="#1e293b" transparent opacity={0.9} emissive={isNight ? "#2dd4bf" : "#000"} emissiveIntensity={1.8} />
                        </Box>
                    ))}
                </group>
            )}
            {poi.type === 'hospital' && (
                <group>
                    <Box args={[30, 20, 30]} position={[0, 10, 0]} castShadow receiveShadow><meshStandardMaterial color="#f8fafc" roughness={0.2} /></Box>
                    <Box args={[15, 2, 15]} position={[0, 21, 0]} castShadow><meshStandardMaterial color="#ef4444" /></Box>
                    <Cylinder args={[6, 6, 0.2, 32]} position={[0, 22.1, 0]}><meshStandardMaterial color="#334155" /></Cylinder>
                    <Text position={[0, 22.3, 0]} rotation={[-Math.PI/2, 0, 0]} fontSize={4} color="white">H</Text>
                </group>
            )}
            {poi.type === 'police' && (
                <group>
                    <Box args={[24, 40, 24]} position={[0, 20, 0]} castShadow><meshStandardMaterial color="#1e3a8a" /></Box>
                    <Sphere args={[1]} position={[0, 42, 0]}><meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={isNight ? 20 : 0.5} /></Sphere>
                </group>
            )}
            {poi.type === 'school' && (
                <Box args={[40, 15, 60]} position={[0, 7.5, 0]} castShadow receiveShadow><meshStandardMaterial color="#92400e" roughness={0.9} /></Box>
            )}
            {poi.type === 'stadium' && (
                <group>
                    <Cylinder args={[50, 60, 25, 32, 1, true]} position={[0, 12.5, 0]}><meshStandardMaterial color="#475569" side={THREE.DoubleSide} /></Cylinder>
                    <Cylinder args={[45, 45, 0.5, 32]} position={[0, 1, 0]}><meshStandardMaterial color="#15803d" /></Cylinder>
                </group>
            )}
            {poi.type === 'mall' && (
                <group>
                    <Box args={[80, 15, 80]} position={[0, 7.5, 0]} castShadow receiveShadow><meshStandardMaterial color="#f1f5f9" /></Box>
                    <Sphere args={[20, 32, 16, 0, Math.PI*2, 0, Math.PI/2]} position={[0, 15, 0]}><meshStandardMaterial color="#38bdf8" transparent opacity={0.6} metalness={1} roughness={0} /></Sphere>
                </group>
            )}
            <Text position={[0, 100, 0]} fontSize={3} color="white" anchorX="center" anchorY="middle" outlineWidth={0.4} outlineColor="black">{poi.name}</Text>
          </group>
        ))}
        <Suspense fallback={null}>{npcs.map((npc) => (<NPC key={npc.id} npc={npc} onSelect={setSelectedNPC} hour={hour} />))}</Suspense>
        <Player isNight={isNight} />
        <OrbitControls makeDefault minPolarAngle={Math.PI / 10} maxPolarAngle={Math.PI / 2.1} minDistance={50} maxDistance={400} />
      </Canvas>

      <div className="absolute top-8 right-8 flex flex-col gap-5 items-end">
          <div className="bg-black/95 backdrop-blur-3xl px-12 py-8 rounded-[4rem] border-4 border-white/10 text-white flex items-center gap-12 shadow-2xl">
              <div className="bg-white/10 p-6 rounded-[2.5rem]">
                {hour >= 6 && hour < 19 ? <Sun className="text-yellow-400 animate-spin-slow" size={64} /> : <Moon className="text-blue-300" size={64} />}
              </div>
              <div className="flex flex-col">
                  <span className="text-7xl font-black tabular-nums tracking-tighter leading-none text-white">{Math.floor(hour).toString().padStart(2, '0')}:{Math.floor((hour % 1) * 60).toString().padStart(2, '0')}</span>
                  <span className="text-sm font-black uppercase tracking-[0.4em] opacity-60 mt-4">Metrópolis Pro Active</span>
              </div>
          </div>
          <div className="bg-blue-600/90 backdrop-blur-2xl px-8 py-4 rounded-[2rem] border-2 border-blue-400 text-white text-sm font-black uppercase tracking-widest shadow-2xl flex items-center gap-4 animate-in slide-in-from-right-10 duration-1000">
              <Info size={20} /> Canal de Noticias: {isRaining ? "Frente de tormenta sobre el Estadio" : "Día despejado en el Distrito Financiero"}
          </div>
      </div>

      {selectedNPC && (
        <div className="absolute bottom-10 left-10 bg-white/99 backdrop-blur-3xl p-14 rounded-[5rem] shadow-2xl border-4 border-duo-blue w-140">
          <div className="flex items-center gap-14 mb-14">
             <div className="w-36 h-36 rounded-[3.5rem] border-4 shadow-3xl flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ backgroundColor: selectedNPC.color, borderColor: '#fff' }}>
                 <div className="w-28 h-28 rounded-full bg-white/40" />
             </div>
             <div className="flex-1">
                <h3 className="font-black text-7xl text-duo-gray-dark truncate mb-4">{selectedNPC.name}</h3>
                <div className="flex flex-wrap gap-4">
                    <div className="px-6 py-2.5 bg-green-100 rounded-full flex items-center gap-3 border-2 border-green-200"><span className="w-4 h-4 rounded-full bg-green-500 shadow-[0_0_15px_#22c55e]" /><p className="text-xs font-black text-green-700 uppercase tracking-widest">{selectedNPC.mood}</p></div>
                    <div className="px-6 py-2.5 bg-orange-100 rounded-full flex items-center gap-3 border-2 border-orange-200"><Wallet size={24} className="text-orange-600" /><span className="text-lg font-black text-orange-700">{Math.floor(selectedNPC.money)}$</span></div>
                </div>
             </div>
          </div>
          <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 relative overflow-hidden group mb-10"><div className="absolute top-0 left-0 w-4 h-full bg-duo-blue" /><p className="text-sm font-black text-duo-gray uppercase mb-4 tracking-[0.3em] opacity-60">Actividad del Ciudadano</p><p className="font-black text-duo-gray-dark text-5xl italic">"{selectedNPC.activity}"</p></div>
          <button onClick={() => setSelectedNPC(null)} className="w-full py-10 bg-duo-blue text-white font-black rounded-[3rem] border-b-12 border-blue-800 active:border-b-0 active:translate-y-4 transition-all uppercase tracking-[0.5em] text-lg">Cerrar Perfil</button>
        </div>
      )}

      <div className="absolute bottom-12 left-12 flex items-center gap-10">
          <div className="bg-duo-blue p-8 rounded-[3rem] shadow-4xl border-4 border-white/20"><Info className="text-white" size={48} /></div>
          <div className="bg-black/85 backdrop-blur-3xl px-12 py-8 rounded-[3.5rem] border-4 border-white/10 text-white shadow-4xl flex gap-14 items-center">
              <div className="flex flex-col"><h4 className="font-black text-3xl uppercase leading-none mb-3 italic">METRÓPOLIS PRO</h4><p className="text-xs font-bold opacity-60 tracking-widest">ECOSISTEMA DE SIMULACIÓN AVANZADA v4.0</p></div>
              <div className="flex gap-8">
                  <div className="flex flex-col items-center bg-white/5 p-4 rounded-3xl border border-white/10"><Users size={32} className="text-duo-blue mb-2" /><span className="text-xs font-black">POB: 80</span></div>
                  <div className="flex flex-col items-center bg-white/5 p-4 rounded-3xl border border-white/10"><Star size={32} className="text-yellow-400 mb-2" /><span className="text-xs font-black">30 POIS</span></div>
              </div>
          </div>
      </div>
    </div>
  );
};

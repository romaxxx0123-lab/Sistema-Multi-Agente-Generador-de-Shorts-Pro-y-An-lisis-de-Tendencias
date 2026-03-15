
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Html, Box, Cylinder } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, decideNextAction, updateNeeds } from '../utils/cityLogic';
import type { NPCState, POIType } from '../utils/cityLogic';
import { Coffee, Home, Briefcase, Trees, Utensils, Moon, Users, Dumbbell, Ticket, Brain, DollarSign } from 'lucide-react';
import { getFabricTexture } from '../utils/textures';

interface NPCProps {
  npc: NPCState;
  onSelect: (npc: NPCState) => void;
  hour: number;
}

export const NPC: React.FC<NPCProps> = ({ npc, onSelect, hour }) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Group>(null);
  const rightLegRef = useRef<THREE.Group>(null);
  const leftArmRef = useRef<THREE.Group>(null);
  const rightArmRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);

  const [state, setState] = useState<NPCState>(npc);
  const [isGreeting, setIsGreeting] = useState(false);
  const [path, setPath] = useState<THREE.Vector3[]>([]);
  const [moneyDiff, setMoneyDiff] = useState(0);

  // Random clothing colors based on NPC base color
  const clothes = useMemo(() => {
    const c = new THREE.Color(state.color);
    return {
      shirt: state.color,
      shirtTex: getFabricTexture(state.color),
      pants: `#${c.clone().multiplyScalar(0.4).getHexString()}`,
      pantsTex: getFabricTexture(`#${c.clone().multiplyScalar(0.4).getHexString()}`),
      shoes: '#111',
      hasGlasses: Math.random() > 0.7,
      hasHat: Math.random() > 0.8
    };
  }, [state.color]);

  useEffect(() => {
    const needTimer = setInterval(() => {
      setState(s => {
          const newState = updateNeeds(s, 1);
          const diff = newState.money - s.money;
          if (Math.abs(diff) > 0.1) {
              setMoneyDiff(diff);
              setTimeout(() => setMoneyDiff(0), 1000);
          }
          return newState;
      });
    }, 3000);
    return () => clearInterval(needTimer);
  }, []);

  useEffect(() => {
    const aiLoop = () => {
      if (state.status === 'idle') {
        const waitTime = Math.random() * 4000 + 3000;
        setTimeout(() => {
          const targetType = decideNextAction(state, hour);
          const potentialTargets = POIS.filter(p => p.type === targetType);
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

          if (target.id === state.currentPOI) {
              setState(s => ({ ...s, status: 'thinking', activity: 'Analizando mi próximo paso' }));
              setTimeout(() => setState(s => ({ ...s, status: 'idle' })), 2000);
              return;
          }

          const start = new THREE.Vector3(...POIS.find(p => p.id === state.currentPOI)!.position);
          const end = new THREE.Vector3(...target.position);

          // Manhattan pathfinding
          const midPoint = new THREE.Vector3(end.x, 0, start.z);
          setPath([midPoint, end]);

          setState(s => ({
            ...s,
            status: 'moving',
            targetPOI: target.id,
            activity: `Yendo a ${target.name}`
          }));
        }, waitTime);
      }
    };
    aiLoop();
  }, [state.status, state.currentPOI, hour]);

  useFrame((state_scene) => {
    const time = state_scene.clock.getElapsedTime();

    if (state.status === 'moving' && groupRef.current && path.length > 0) {
      const currentPos = groupRef.current.position;
      const nextWaypoint = path[0];

      // Sprinting logic: faster if urgent
      const isUrgent = state.needs.hunger < 15 || state.needs.energy < 15;
      const speed = isUrgent ? 0.15 : 0.08;

      const direction = nextWaypoint.clone().sub(currentPos).normalize();
      const distance = currentPos.distanceTo(nextWaypoint);

      if (distance > 0.15) {
        groupRef.current.position.add(direction.multiplyScalar(speed));
        const targetRotation = Math.atan2(direction.x, direction.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation, 0.12);

        // Walking/Sprinting animation
        const walkSpeed = isUrgent ? 20 : 14;
        const limbSwing = Math.sin(time * walkSpeed);
        if (leftLegRef.current) leftLegRef.current.rotation.x = limbSwing * 0.7;
        if (rightLegRef.current) rightLegRef.current.rotation.x = -limbSwing * 0.7;
        if (leftArmRef.current) leftArmRef.current.rotation.x = -limbSwing * 0.6;
        if (rightArmRef.current) rightArmRef.current.rotation.x = limbSwing * 0.6;
        if (headRef.current) headRef.current.rotation.y = Math.sin(time * 8) * 0.15;
      } else {
        const remainingPath = path.slice(1);
        setPath(remainingPath);

        if (remainingPath.length === 0) {
            const arrivedAt = POIS.find(p => p.id === state.targetPOI)!;

            let newNeeds = { ...state.needs };
            let newStatus: NPCState['status'] = 'idle';
            let activity = '';

            if (arrivedAt.type === 'home') {
                newNeeds.energy = 100;
                newStatus = hour > 22 || hour < 6 ? 'sleeping' : 'idle';
                activity = newStatus === 'sleeping' ? 'Durmiendo profundamente' : 'Relajándome en casa';
            } else if (arrivedAt.type === 'cafe') {
                newNeeds.hunger = 100;
                newStatus = 'eating';
                activity = 'Disfrutando de un Espresso';
            } else if (arrivedAt.type === 'park') {
                newNeeds.social = 100;
                newStatus = 'socializing';
                activity = 'Caminando por el parque';
            } else if (arrivedAt.type === 'gym') {
                newNeeds.fitness = 100;
                newStatus = 'exercising';
                activity = 'Entrenando intensamente';
            } else if (arrivedAt.type === 'work') {
                newStatus = 'working';
                activity = 'En jornada laboral';
            } else if (arrivedAt.type === 'theater') {
                newStatus = 'entertaining';
                activity = 'Viendo una función especial';
            } else if (arrivedAt.type === 'hospital') {
                newNeeds.stress = Math.max(0, newNeeds.stress - 40);
                newStatus = state.profession === 'Surgeon' ? 'working' : 'healing';
                activity = state.profession === 'Surgeon' ? 'Realizando cirugía' : 'En consulta médica';
            } else if (arrivedAt.type === 'police') {
                newStatus = state.profession === 'Police Officer' ? 'patrolling' : 'idle';
                activity = state.profession === 'Police Officer' ? 'De guardia en central' : 'Trámite administrativo';
            } else if (arrivedAt.type === 'school') {
                newStatus = 'studying';
                activity = state.profession === 'Professor' ? 'Dando clases' : 'Estudiando para exámenes';
            } else if (arrivedAt.type === 'stadium') {
                newNeeds.fitness = 100;
                newNeeds.social = Math.min(100, newNeeds.social + 30);
                newStatus = 'exercising';
                activity = state.profession === 'Pro Athlete' ? 'Entrenamiento profesional' : 'Viendo el partido';
            } else if (arrivedAt.type === 'mall') {
                newNeeds.social = Math.min(100, newNeeds.social + 20);
                newStatus = 'entertaining';
                activity = 'De compras por el mall';
            } else if (arrivedAt.type === 'library') {
                newNeeds.stress = Math.max(0, newNeeds.stress - 20);
                newStatus = 'studying';
                activity = 'Leyendo en silencio';
            }

            setState(s => ({
              ...s,
              status: newStatus,
              currentPOI: s.targetPOI,
              needs: newNeeds,
              activity: activity || getActivityForPOI(arrivedAt.type, arrivedAt.name)
            }));

            [leftLegRef, rightLegRef, leftArmRef, rightArmRef].forEach(ref => {
                if (ref.current) ref.current.rotation.x = 0;
            });

            // Auto-exit internal states after a while
            if (['eating', 'working', 'exercising', 'entertaining', 'socializing'].includes(newStatus)) {
                setTimeout(() => setState(s => ({ ...s, status: 'idle' })), 8000 + Math.random() * 5000);
            }
        }
      }
    }

    if (groupRef.current) {
      if (state.status === 'idle') {
        groupRef.current.position.y = (0.5 * state.scale) + Math.sin(time * 2.5) * 0.02;
        if (Math.random() < 0.003 && !isGreeting) {
           setIsGreeting(true);
           setTimeout(() => setIsGreeting(false), 3000);
        }
      } else if (state.status === 'thinking' || state.status === 'chatting') {
          groupRef.current.position.y = 0.5 * state.scale;
          if (headRef.current) headRef.current.rotation.y = Math.sin(time * 4) * 0.3;
      } else if (state.status === 'moving') {
        groupRef.current.position.y = (0.5 * state.scale) + Math.abs(Math.sin(time * (state.needs.hunger < 15 ? 20 : 14))) * 0.12;
      }
    }
  });

  const getActivityForPOI = (type: POIType, _name: string): string => {
    switch(type) {
      case 'home': return hour > 22 || hour < 7 ? 'Durmiendo' : 'Descansando';
      case 'work': return 'Trabajando';
      case 'cafe': return 'Comiendo';
      case 'park': return 'Paseando';
      case 'gym': return 'Entrenando';
      case 'theater': return 'Viendo una obra';
      case 'hospital': return 'En el médico';
      case 'police': return 'En la comisaría';
      case 'school': return 'En clase';
      case 'stadium': return 'En el estadio';
      case 'mall': return 'De compras';
      case 'library': return 'En la biblioteca';
      default: return 'Relajándose';
    }
  };

  const getThoughtIcon = () => {
    if (moneyDiff !== 0) return <span className={`text-xs font-black ${moneyDiff > 0 ? 'text-green-500' : 'text-red-500'}`}>{moneyDiff > 0 ? '+' : ''}{Math.floor(moneyDiff)}$</span>;
    if (isGreeting) return <span className="text-xs">👋</span>;
    if (state.status === 'thinking') return <Brain size={14} className="text-blue-500" />;
    if (state.status === 'working') return <DollarSign size={14} className="text-green-600" />;
    if (state.needs.energy < 25) return <Moon size={14} className="text-indigo-400" />;
    if (state.needs.hunger < 30) return <Utensils size={14} className="text-orange-400" />;
    if (state.needs.social < 30) return <Users size={14} className="text-pink-400" />;
    if (state.needs.fitness < 30) return <Dumbbell size={14} className="text-green-400" />;

    if (state.status === 'moving') {
        const target = POIS.find(p => p.id === state.targetPOI)?.type;
        if (target === 'home') return <Home size={14} className="text-blue-400" />;
        if (target === 'work') return <Briefcase size={14} className="text-slate-400" />;
        if (target === 'cafe') return <Coffee size={14} className="text-amber-600" />;
        if (target === 'park') return <Trees size={14} className="text-green-600" />;
        if (target === 'gym') return <Dumbbell size={14} className="text-emerald-500" />;
        if (target === 'theater') return <Ticket size={14} className="text-purple-400" />;
    }
    return null;
  };

  return (
    <group
      ref={groupRef}
      scale={[state.scale, state.scale, state.scale]}
      position={[...POIS.find(p => p.id === npc.currentPOI)!.position]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(state);
      }}
    >
      <Box args={[0.4, 0.6, 0.25]} position={[0, 0.45, 0]} castShadow>
        <meshStandardMaterial color={clothes.shirt} map={clothes.shirtTex} />
      </Box>

      <group ref={headRef} position={[0, 0.85, 0]}>
        <Sphere args={[0.22]} castShadow>
            <meshStandardMaterial color={state.skinColor} />
        </Sphere>
        {clothes.hasGlasses && (
            <group position={[0, 0, 0.15]}>
                <Box args={[0.1, 0.02, 0.1]} position={[-0.1, 0, 0]}><meshStandardMaterial color="#222" /></Box>
                <Box args={[0.1, 0.02, 0.1]} position={[0.1, 0, 0]}><meshStandardMaterial color="#222" /></Box>
                <Box args={[0.15, 0.02, 0.01]} position={[0, 0, 0]}><meshStandardMaterial color="#222" /></Box>
            </group>
        )}
        {clothes.hasHat && (
            <group position={[0, 0.2, 0]}>
                <Cylinder args={[0.25, 0.25, 0.1]}><meshStandardMaterial color={clothes.shirt} /></Cylinder>
                <Box args={[0.5, 0.02, 0.4]} position={[0, -0.05, 0.1]}><meshStandardMaterial color={clothes.shirt} /></Box>
            </group>
        )}
        {state.hairStyle === 'short' && (
            <Sphere args={[0.23]} position={[0, 0.05, 0]} scale={[1, 0.4, 1.1]}>
                <meshStandardMaterial color={state.hairColor} />
            </Sphere>
        )}
        {state.hairStyle === 'long' && (
            <group>
                <Sphere args={[0.23]} position={[0, 0.05, 0]} scale={[1, 0.4, 1.1]}>
                    <meshStandardMaterial color={state.hairColor} />
                </Sphere>
                <Box args={[0.45, 0.35, 0.15]} position={[0, -0.1, -0.15]}>
                    <meshStandardMaterial color={state.hairColor} />
                </Box>
            </group>
        )}
      </group>

      <group ref={leftLegRef} position={[-0.12, 0.2, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.06, 0.5]} />
            <meshStandardMaterial color={clothes.pants} map={clothes.pantsTex} />
        </mesh>
        <Box args={[0.15, 0.08, 0.25]} position={[0, -0.4, 0.05]} castShadow>
            <meshStandardMaterial color={clothes.shoes} />
        </Box>
      </group>
      <group ref={rightLegRef} position={[0.12, 0.2, 0]}>
        <mesh position={[0, -0.15, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.06, 0.5]} />
            <meshStandardMaterial color={clothes.pants} map={clothes.pantsTex} />
        </mesh>
        <Box args={[0.15, 0.08, 0.25]} position={[0, -0.4, 0.05]} castShadow>
            <meshStandardMaterial color={clothes.shoes} />
        </Box>
      </group>

      <group ref={leftArmRef} position={[-0.28, 0.7, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.45]} />
            <meshStandardMaterial color={state.skinColor} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.28, 0.7, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.06, 0.06, 0.45]} />
            <meshStandardMaterial color={state.skinColor} />
        </mesh>
      </group>

      <Html position={[0, 1.8, 0]} center distanceFactor={12}>
        <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
          {getThoughtIcon() && (
             <div className="bg-white/95 p-1.5 rounded-full shadow-xl border-2 border-slate-200 animate-bounce">
                {getThoughtIcon()}
             </div>
          )}
          <div className="bg-black/75 backdrop-blur-md text-white px-3 py-1.5 rounded-2xl text-[12px] font-black whitespace-nowrap border-2 border-white/25 shadow-2xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: state.color }} />
            {state.name}
            <span className="opacity-60 text-[8px] border border-white/20 px-1 rounded uppercase">{state.mood}</span>
          </div>
        </div>
      </Html>
    </group>
  );
};

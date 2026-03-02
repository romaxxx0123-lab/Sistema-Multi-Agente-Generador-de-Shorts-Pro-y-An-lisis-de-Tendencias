
import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Html, Box } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, decideNextAction } from '../utils/cityLogic';
import type { NPCState, POIType } from '../utils/cityLogic';
import { Coffee, Home, Briefcase, Trees, Utensils, Moon, Users, Dumbbell, Ticket } from 'lucide-react';

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
  const [targetPos, setTargetPos] = useState<THREE.Vector3>(new THREE.Vector3(...POIS.find(p => p.id === npc.currentPOI)!.position));
  const [isGreeting, setIsGreeting] = useState(false);

  useEffect(() => {
    const updateNeeds = setInterval(() => {
      setState(s => ({
        ...s,
        needs: {
          hunger: Math.max(0, s.needs.hunger - 0.4),
          energy: Math.max(0, s.needs.energy - 0.2),
          social: Math.max(0, s.needs.social - 0.3),
          fitness: Math.max(0, s.needs.fitness - 0.2),
        }
      }));
    }, 2500);
    return () => clearInterval(updateNeeds);
  }, []);

  useEffect(() => {
    const aiLoop = () => {
      if (state.status === 'idle') {
        const waitTime = Math.random() * 5000 + 4000;
        setTimeout(() => {
          const targetType = decideNextAction(state, hour);
          const potentialTargets = POIS.filter(p => p.type === targetType);
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

          setState(s => ({
            ...s,
            status: 'moving',
            targetPOI: target.id,
            activity: `Yendo a ${target.name}`
          }));
          setTargetPos(new THREE.Vector3(...target.position));
        }, waitTime);
      }
    };
    aiLoop();
  }, [state.status, state.currentPOI, hour]);

  useFrame((state_scene) => {
    const time = state_scene.clock.getElapsedTime();

    if (state.status === 'moving' && groupRef.current) {
      const currentPos = groupRef.current.position;
      const speed = 0.07;
      const direction = targetPos.clone().sub(currentPos).normalize();
      const distance = currentPos.distanceTo(targetPos);

      if (distance > 0.15) {
        groupRef.current.position.add(direction.multiplyScalar(speed));
        const targetRotation = Math.atan2(direction.x, direction.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation, 0.1);

        // Realistic walking animation
        const walkSpeed = 12;
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(time * walkSpeed) * 0.6;
        if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(time * walkSpeed + Math.PI) * 0.6;
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(time * walkSpeed + Math.PI) * 0.5;
        if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(time * walkSpeed) * 0.5;
        if (headRef.current) headRef.current.rotation.y = Math.sin(time * 6) * 0.1;
      } else {
        const arrivedAt = POIS.find(p => p.id === state.targetPOI)!;

        // Refill needs upon arrival
        let newNeeds = { ...state.needs };
        if (arrivedAt.type === 'home') newNeeds.energy = 100;
        if (arrivedAt.type === 'cafe') newNeeds.hunger = 100;
        if (arrivedAt.type === 'park') newNeeds.social = 100;
        if (arrivedAt.type === 'gym') newNeeds.fitness = 100;

        setState(s => ({
          ...s,
          status: 'idle',
          currentPOI: s.targetPOI,
          needs: newNeeds,
          activity: getActivityForPOI(arrivedAt.type, arrivedAt.name)
        }));

        // Reset pose
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      }
    }

    if (groupRef.current) {
      // Idle bobbing
      if (state.status === 'idle') {
        groupRef.current.position.y = 0.5 + Math.sin(time * 2) * 0.03;
        if (Math.random() < 0.005 && !isGreeting) {
           setIsGreeting(true);
           setTimeout(() => setIsGreeting(false), 2000);
        }
      } else {
        groupRef.current.position.y = 0.5 + Math.abs(Math.sin(time * 12)) * 0.1;
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
      case 'theater': return 'En el teatro';
      default: return 'Caminando';
    }
  };

  const getThoughtIcon = () => {
    if (isGreeting) return <span className="text-xs">👋</span>;
    if (state.needs.energy < 30) return <Moon size={14} className="text-indigo-400" />;
    if (state.needs.hunger < 40) return <Utensils size={14} className="text-orange-400" />;
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
      position={[...POIS.find(p => p.id === npc.currentPOI)!.position]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(state);
      }}
    >
      {/* Torso */}
      <Box args={[0.4, 0.6, 0.2]} position={[0, 0.45, 0]} castShadow>
        <meshStandardMaterial color={state.color} />
      </Box>

      {/* Head Group */}
      <group ref={headRef} position={[0, 0.85, 0]}>
        <Sphere args={[0.2]} castShadow>
            <meshStandardMaterial color={state.skinColor} />
        </Sphere>
        {/* Hair Styles */}
        {state.hairStyle === 'short' && (
            <Sphere args={[0.21]} position={[0, 0.05, 0]} scale={[1, 0.5, 1]}>
                <meshStandardMaterial color={state.hairColor} />
            </Sphere>
        )}
        {state.hairStyle === 'long' && (
            <group>
                <Sphere args={[0.21]} position={[0, 0.05, 0]} scale={[1, 0.5, 1]}>
                    <meshStandardMaterial color={state.hairColor} />
                </Sphere>
                <Box args={[0.4, 0.3, 0.1]} position={[0, -0.1, -0.15]}>
                    <meshStandardMaterial color={state.hairColor} />
                </Box>
            </group>
        )}
      </group>

      {/* Legs */}
      <group ref={leftLegRef} position={[-0.12, 0.2, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.05, 0.4]} />
            <meshStandardMaterial color="#333" />
        </mesh>
      </group>
      <group ref={rightLegRef} position={[0.12, 0.2, 0]}>
        <mesh position={[0, -0.1, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.05, 0.4]} />
            <meshStandardMaterial color="#333" />
        </mesh>
      </group>

      {/* Arms */}
      <group ref={leftArmRef} position={[-0.28, 0.7, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4]} />
            <meshStandardMaterial color={state.skinColor} />
        </mesh>
      </group>
      <group ref={rightArmRef} position={[0.28, 0.7, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.4]} />
            <meshStandardMaterial color={state.skinColor} />
        </mesh>
      </group>

      <Html position={[0, 1.5, 0]} center distanceFactor={12}>
        <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
          {getThoughtIcon() && (
             <div className="bg-white/95 p-1.5 rounded-full shadow-xl border-2 border-slate-200 animate-bounce">
                {getThoughtIcon()}
             </div>
          )}
          <div className="bg-black/70 backdrop-blur-md text-white px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap border-2 border-white/20 shadow-lg">
            {state.name}
          </div>
        </div>
      </Html>
    </group>
  );
};

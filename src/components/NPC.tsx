
import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Html } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, decideNextAction } from '../utils/cityLogic';
import type { NPCState, POIType } from '../utils/cityLogic';
import { Coffee, Home, Briefcase, Trees, Utensils, Moon, Users } from 'lucide-react';

interface NPCProps {
  npc: NPCState;
  onSelect: (npc: NPCState) => void;
  allNpcs?: NPCState[];
}

export const NPC: React.FC<NPCProps> = ({ npc, onSelect }) => {
  const groupRef = useRef<THREE.Group>(null);
  const leftLegRef = useRef<THREE.Mesh>(null);
  const rightLegRef = useRef<THREE.Mesh>(null);
  const leftArmRef = useRef<THREE.Mesh>(null);
  const rightArmRef = useRef<THREE.Mesh>(null);

  const [state, setState] = useState<NPCState>(npc);
  const [targetPos, setTargetPos] = useState<THREE.Vector3>(new THREE.Vector3(...POIS.find(p => p.id === npc.currentPOI)!.position));
  const [isGreeting, setIsGreeting] = useState(false);

  useEffect(() => {
    const updateNeeds = setInterval(() => {
      setState(s => ({
        ...s,
        needs: {
          hunger: Math.max(0, s.needs.hunger - 0.5),
          energy: Math.max(0, s.needs.energy - 0.3),
          social: Math.max(0, s.needs.social - 0.4),
        }
      }));
    }, 2000);

    return () => clearInterval(updateNeeds);
  }, []);

  useEffect(() => {
    const aiLoop = () => {
      if (state.status === 'idle') {
        const waitTime = Math.random() * 5000 + 4000;
        setTimeout(() => {
          const targetType = decideNextAction(state);
          const potentialTargets = POIS.filter(p => p.type === targetType);
          const target = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];

          setState(s => ({
            ...s,
            status: 'moving',
            targetPOI: target.id,
            activity: `Caminando hacia ${target.name}`
          }));
          setTargetPos(new THREE.Vector3(...target.position));
        }, waitTime);
      }
    };
    aiLoop();
  }, [state.status, state.currentPOI]);

  useFrame((state_scene) => {
    const time = state_scene.clock.getElapsedTime();

    if (state.status === 'moving' && groupRef.current) {
      const currentPos = groupRef.current.position;
      const speed = 0.06;
      const direction = targetPos.clone().sub(currentPos).normalize();
      const distance = currentPos.distanceTo(targetPos);

      if (distance > 0.15) {
        groupRef.current.position.add(direction.multiplyScalar(speed));
        const targetRotation = Math.atan2(direction.x, direction.z);
        groupRef.current.rotation.y = THREE.MathUtils.lerp(groupRef.current.rotation.y, targetRotation, 0.1);

        // Walking animation
        if (leftLegRef.current) leftLegRef.current.rotation.x = Math.sin(time * 10) * 0.5;
        if (rightLegRef.current) rightLegRef.current.rotation.x = Math.sin(time * 10 + Math.PI) * 0.5;
        if (leftArmRef.current) leftArmRef.current.rotation.x = Math.sin(time * 10 + Math.PI) * 0.5;
        if (rightArmRef.current) rightArmRef.current.rotation.x = Math.sin(time * 10) * 0.5;
      } else {
        const arrivedAt = POIS.find(p => p.id === state.targetPOI)!;

        // Refill needs upon arrival
        let newNeeds = { ...state.needs };
        if (arrivedAt.type === 'home') newNeeds.energy = 100;
        if (arrivedAt.type === 'cafe') newNeeds.hunger = 100;
        if (arrivedAt.type === 'park') newNeeds.social = 100;

        setState(s => ({
          ...s,
          status: 'idle',
          currentPOI: s.targetPOI,
          needs: newNeeds,
          activity: getActivityForPOI(arrivedAt.type, arrivedAt.name)
        }));

        // Reset limbs
        if (leftLegRef.current) leftLegRef.current.rotation.x = 0;
        if (rightLegRef.current) rightLegRef.current.rotation.x = 0;
        if (leftArmRef.current) leftArmRef.current.rotation.x = 0;
        if (rightArmRef.current) rightArmRef.current.rotation.x = 0;
      }
    }

    if (groupRef.current) {
      groupRef.current.position.y = state.status === 'moving'
        ? 0.5 + Math.abs(Math.sin(time * 10)) * 0.1
        : 0.5 + Math.sin(time * 2) * 0.05;

      // Proximity greeting logic (simple check)
      if (state.status === 'idle' && !isGreeting && Math.random() < 0.01) {
          setIsGreeting(true);
          setTimeout(() => setIsGreeting(false), 2000);
      }
    }
  });

  const getActivityForPOI = (type: POIType, name: string): string => {
    switch(type) {
      case 'home': return `Durmiendo en ${name}`;
      case 'work': return `Trabajando en ${name}`;
      case 'cafe': return `Almorzando en ${name}`;
      case 'park': return `Paseando por ${name}`;
      default: return 'Caminando';
    }
  };

  const getThoughtIcon = () => {
    if (isGreeting) return <span className="text-xs">👋</span>;
    if (state.needs.energy < 40) return <Moon size={14} className="text-indigo-400" />;
    if (state.needs.hunger < 50) return <Utensils size={14} className="text-orange-400" />;
    if (state.needs.social < 40) return <Users size={14} className="text-pink-400" />;
    if (state.status === 'moving') {
        const target = POIS.find(p => p.id === state.targetPOI)?.type;
        if (target === 'home') return <Home size={14} className="text-duo-blue" />;
        if (target === 'work') return <Briefcase size={14} className="text-slate-400" />;
        if (target === 'cafe') return <Coffee size={14} className="text-amber-600" />;
        if (target === 'park') return <Trees size={14} className="text-duo-green" />;
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
      {/* Body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <capsuleGeometry args={[0.25, 0.5, 4, 8]} />
        <meshStandardMaterial color={state.color} />
      </mesh>

      {/* Head */}
      <Sphere args={[0.2]} position={[0, 0.85, 0]} castShadow>
        <meshStandardMaterial color="#ffdbac" />
      </Sphere>

      {/* Legs */}
      <mesh ref={leftLegRef} position={[-0.12, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.4]} />
        <meshStandardMaterial color={state.color} />
      </mesh>
      <mesh ref={rightLegRef} position={[0.12, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.4]} />
        <meshStandardMaterial color={state.color} />
      </mesh>

      {/* Arms */}
      <mesh ref={leftArmRef} position={[-0.3, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.4]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>
      <mesh ref={rightArmRef} position={[0.3, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.05, 0.4]} />
        <meshStandardMaterial color="#ffdbac" />
      </mesh>

      <Html position={[0, 1.4, 0]} center distanceFactor={12}>
        <div className="flex flex-col items-center gap-1 pointer-events-none select-none">
          {getThoughtIcon() && (
             <div className="bg-white/90 p-1.5 rounded-full shadow-lg border-2 border-slate-100 animate-bounce">
                {getThoughtIcon()}
             </div>
          )}
          <div className="bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap border border-white/20">
            {state.name}
          </div>
        </div>
      </Html>
    </group>
  );
};

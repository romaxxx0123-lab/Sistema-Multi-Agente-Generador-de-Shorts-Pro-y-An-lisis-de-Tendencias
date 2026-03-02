
import React, { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Cylinder, Html } from '@react-three/drei';
import * as THREE from 'three';
import { POIS, getNextTarget } from '../utils/cityLogic';
import type { NPCState, POIType } from '../utils/cityLogic';

interface NPCProps {
  npc: NPCState;
  onSelect: (npc: NPCState) => void;
}

export const NPC: React.FC<NPCProps> = ({ npc, onSelect }) => {
  const meshRef = useRef<THREE.Group>(null);
  const [state, setState] = useState<NPCState>(npc);
  const [targetPos, setTargetPos] = useState<THREE.Vector3>(new THREE.Vector3(...POIS.find(p => p.id === npc.currentPOI)!.position));

  useEffect(() => {
    const decideNextAction = () => {
      if (state.status === 'idle') {
        const waitTime = Math.random() * 5000 + 3000;
        setTimeout(() => {
          const currentType = POIS.find(p => p.id === state.currentPOI)!.type;
          const targetType = getNextTarget(currentType);
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
    decideNextAction();
  }, [state.status, state.currentPOI]);

  useFrame(() => {
    if (state.status === 'moving' && meshRef.current) {
      const currentPos = meshRef.current.position;
      const speed = 0.05;
      const direction = targetPos.clone().sub(currentPos).normalize();
      const distance = currentPos.distanceTo(targetPos);

      if (distance > 0.1) {
        meshRef.current.position.add(direction.multiplyScalar(speed));
        // Rotate towards direction
        const targetRotation = Math.atan2(direction.x, direction.z);
        meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation, 0.1);
      } else {
        const arrivedAt = POIS.find(p => p.id === state.targetPOI)!;
        setState(s => ({
          ...s,
          status: 'idle',
          currentPOI: s.targetPOI,
          activity: getActivityForPOI(arrivedAt.type, arrivedAt.name)
        }));
      }
    }

    // Simple bobbing animation
    if (meshRef.current) {
      meshRef.current.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.1;
    }
  });

  const getActivityForPOI = (type: POIType, name: string): string => {
    switch(type) {
      case 'home': return `Descansando en ${name}`;
      case 'work': return `Trabajando duro en ${name}`;
      case 'cafe': return `Tomando café en ${name}`;
      case 'park': return `Relajándose en el ${name}`;
      default: return 'Caminando';
    }
  };

  return (
    <group
      ref={meshRef}
      position={[...POIS.find(p => p.id === npc.currentPOI)!.position]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(state);
      }}
    >
      {/* Simple Abstract NPC Body */}
      <Cylinder args={[0.3, 0.3, 0.8]} position={[0, 0, 0]}>
        <meshStandardMaterial color={state.color} />
      </Cylinder>
      <Sphere args={[0.25]} position={[0, 0.5, 0]}>
        <meshStandardMaterial color="#ffffff" />
      </Sphere>
      {/* Small marker above head */}
      <Sphere args={[0.05]} position={[0, 0.9, 0]}>
        <meshStandardMaterial color={state.status === 'moving' ? '#1cb0f6' : '#2be335'} emissive={state.status === 'moving' ? '#1cb0f6' : '#2be335'} />
      </Sphere>

      <Html position={[0, 1.2, 0]} center distanceFactor={10}>
        <div className="bg-black/60 backdrop-blur text-white px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap pointer-events-none select-none border border-white/20">
          {state.name}
        </div>
      </Html>
    </group>
  );
};

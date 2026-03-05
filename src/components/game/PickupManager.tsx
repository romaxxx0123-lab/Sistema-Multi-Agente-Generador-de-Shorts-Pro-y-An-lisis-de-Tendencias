import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, PickupEntity } from '../../store/useGameStore';
import { Vector3, Group, Mesh } from 'three';
import { Sparkles } from '@react-three/drei';

/**
 * PICKUP MANAGER
 * Renders and handles collection logic for XP gems, Gold, and Chests.
 */
export const PickupManager = () => {
    const pickups = useGameStore(state => state.pickups);
    const collectPickup = useGameStore(state => state.collectPickup);
    const playerRef = useGameStore(state => state.playerRef);
    const talents = useGameStore(state => state.talents);

    const _playerPos = new Vector3();
    const _pickupPos = new Vector3();

    useFrame(() => {
        if (!playerRef) return;
        playerRef.getWorldPosition(_playerPos);

        // Talent: Pickup Range (+10% per level)
        const baseRange = 2.0;
        const totalRange = baseRange * (1 + (talents.pickupRange * 0.1));

        pickups.forEach(p => {
            _pickupPos.set(...p.position);
            const distSq = _playerPos.distanceToSquared(_pickupPos);

            // Collect logic
            if (distSq < totalRange * totalRange) {
                collectPickup(p.id);
            }
        });
    });

    return (
        <group>
            {pickups.map(p => (
                <PickupItem key={p.id} data={p} />
            ))}
        </group>
    );
};

const PickupItem = ({ data }: { data: PickupEntity }) => {
    const meshRef = useRef<Mesh>(null);

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.02;
            meshRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        }
    });

    if (data.type === 'xp') {
        return (
            <mesh ref={meshRef} position={data.position}>
                <octahedronGeometry args={[0.15]} />
                <meshStandardMaterial color="#3498DB" emissive="#3498DB" emissiveIntensity={2} />
            </mesh>
        );
    }

    if (data.type === 'gold') {
        return (
            <mesh ref={meshRef} position={data.position}>
                <cylinderGeometry args={[0.15, 0.15, 0.05, 12]} />
                <meshStandardMaterial color="#F1C40F" metalness={0.8} roughness={0.2} />
            </mesh>
        );
    }

    if (data.type === 'chest') {
        return (
            <group position={data.position}>
                <mesh ref={meshRef}>
                    <boxGeometry args={[0.5, 0.4, 0.3]} />
                    <meshStandardMaterial color="#9B59B6" />
                </mesh>
                <Sparkles count={10} scale={1} size={2} color="#F1C40F" />
            </group>
        );
    }

    return null;
};

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { Vector3, Group } from 'three';

/**
 * KUNAI ORBITAL COMPONENT
 * Rotates kunais around the player and deals damage on contact.
 */

const _enemyPos = new Vector3();
const _playerPos = new Vector3();

export const KunaiOrbital = () => {
    const groupRef = useRef<Group>(null);
    const stats = useGameStore(state => state.abilities.get('orbital')?.stats);
    const enemies = useGameStore(state => state.enemies);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    useFrame((state, delta) => {
        if (!groupRef.current || !stats || !playerRef) return;

        // Follow player
        playerRef.getWorldPosition(_playerPos);
        groupRef.current.position.copy(_playerPos);

        // 1. Rotation Logic
        groupRef.current.rotation.y += (stats.speed * (Math.PI / 180)) * delta;

        // 2. Damage Logic (Simplified: Check distance to each kunai)
        // In a production game, we'd use physics triggers.
        const kunaiCount = stats.count;
        const radius = stats.range;
        const damage = stats.damage;

        for (let i = 0; i < kunaiCount; i++) {
            const angle = (i / kunaiCount) * Math.PI * 2 + groupRef.current.rotation.y;
            const kx = _playerPos.x + Math.cos(angle) * radius;
            const kz = _playerPos.z + Math.sin(angle) * radius;

            // Check against enemies
            for (const enemy of enemies) {
                _enemyPos.set(...enemy.position);
                const distSq = (kx - _enemyPos.x) ** 2 + (kz - _enemyPos.z) ** 2;

                if (distSq < 1.0) { // Hit radius 1m
                    damageEnemy(enemy.id, damage * delta * 5); // Constant damage while touching
                }
            }
        }
    });

    if (!stats) return null;

    return (
        <group ref={groupRef}>
            {Array.from({ length: stats.count }).map((_, i) => {
                const angle = (i / stats.count) * Math.PI * 2;
                return (
                    <group
                        key={i}
                        position={[Math.cos(angle) * stats.range, 0.5, Math.sin(angle) * stats.range]}
                    >
                        {/* Kunai Mesh (Stylized primitive) */}
                        <mesh rotation={[Math.PI / 2, 0, angle + Math.PI / 2]}>
                            <coneGeometry args={[0.1, 0.4, 4]} />
                            <meshStandardMaterial color="#3498DB" emissive="#3498DB" emissiveIntensity={2} />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
};

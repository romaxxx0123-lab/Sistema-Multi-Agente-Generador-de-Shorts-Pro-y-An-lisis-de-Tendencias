import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { Vector3, Group } from 'three';

/**
 * FLAME AURA COMPONENT
 * A circular field around the player that burns enemies.
 */

const _pos = new Vector3();

export const FlameAura = () => {
    const stats = useGameStore(state => state.abilities.get('aura')?.stats);
    const enemies = useGameStore(state => state.enemies);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    const damageTimer = useRef(0);
    const pulseTimer = useRef(0);

    useFrame((_state, delta) => {
        if (!stats || !playerRef) return;

        damageTimer.current += delta;
        pulseTimer.current += delta;

        // Apply damage periodically
        if (damageTimer.current >= stats.cooldown) {
            damageTimer.current = 0;

            playerRef.getWorldPosition(_pos);
            const px = _pos.x;
            const pz = _pos.z;
            const rSq = stats.range * stats.range;

            enemies.forEach(enemy => {
                const [ex, ey, ez] = enemy.position;
                const dSq = (px - ex) ** 2 + (pz - ez) ** 2;
                if (dSq < rSq) {
                    damageEnemy(enemy.id, stats.damage);
                }
            });
        }
    });

    const groupRef = useRef<Group>(null);
    useFrame(() => {
        if (groupRef.current && playerRef) {
            playerRef.getWorldPosition(_pos);
            groupRef.current.position.copy(_pos);
        }
    });

    if (!stats) return null;

    return (
        <group ref={groupRef}>
            {/* Visual indicator for the aura */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
                <ringGeometry args={[stats.range - 0.2, stats.range, 32]} />
                <meshStandardMaterial
                    color="#E67E22"
                    emissive="#D35400"
                    emissiveIntensity={2}
                    transparent
                    opacity={0.4}
                />
            </mesh>

            {/* Inner glow effect */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
                <circleGeometry args={[stats.range, 32]} />
                <meshStandardMaterial
                    color="#E67E22"
                    transparent
                    opacity={0.05}
                />
            </mesh>
        </group>
    );
};

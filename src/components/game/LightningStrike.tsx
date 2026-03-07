import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { enemyRegistry } from '../../systems/EnemyRegistry';
import { Vector3 } from 'three';

/**
 * LIGHTNING STRIKE COMPONENT
 * Spawns vertical lightning bolts on random enemies or near player.
 */

const _pos = new Vector3();

export const LightningStrike = () => {
    const stats = useGameStore(state => state.abilities.get('lightning')?.stats);
    const enemies = useGameStore(state => state.enemies);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    const [strikePos, setStrikePos] = useState<[number, number, number] | null>(null);
    const timer = useRef(0);

    useFrame((_state, delta) => {
        if (!stats) return;

        timer.current += delta;

        if (timer.current >= stats.cooldown) {
            timer.current = 0;

            // Target search
            if (!playerRef) return;
            playerRef.getWorldPosition(_pos);

            // Find closest enemy within range via Registry
            const closest = enemyRegistry.getClosest(_pos, stats.range);

            if (closest) {
                const { x, y, z } = closest.rb.translation();
                setStrikePos([x, y, z]);
                damageEnemy(closest.id, stats.damage);

                // Clear VFX after a brief delay
                setTimeout(() => setStrikePos(null), 150);
            }
        }
    });

    if (!stats || !strikePos) return null;

    return (
        <group position={strikePos}>
            {/* Lightning VFX (Stylized vertical beam) */}
            <mesh position={[0, 10, 0]}>
                <cylinderGeometry args={[0.2, 0.05, 20, 4]} />
                <meshStandardMaterial
                    color="#F1C40F"
                    emissive="#F1C40F"
                    emissiveIntensity={4}
                    transparent
                    opacity={0.8}
                />
            </mesh>
            <pointLight intensity={10} distance={5} color="#F1C40F" />
        </group>
    );
};

import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { Vector3, Group } from 'three';

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
            const px = _pos.x;
            const pz = _pos.z;

            // Find closest enemy within range
            let targetId = '';
            let minDistSq = stats.range * stats.range;

            for (const enemy of enemies) {
                const [ex, ey, ez] = enemy.position;
                const dSq = (px - ex) ** 2 + (pz - ez) ** 2;
                if (dSq < minDistSq) {
                    minDistSq = dSq;
                    targetId = enemy.id;
                }
            }

            if (targetId) {
                const target = enemies.find(e => e.id === targetId);
                if (target) {
                    setStrikePos(target.position);
                    damageEnemy(targetId, stats.damage);

                    // Clear VFX after a brief delay
                    setTimeout(() => setStrikePos(null), 150);
                }
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

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { enemyRegistry } from '../../systems/EnemyRegistry';
import { Vector3, Group, Quaternion, Mesh, Color } from 'three';

/**
 * IAI SLASH COMPONENT
 * A frontal cone attack with high impact.
 * Visualized as a quick sharp trail.
 */

const _playerPos = new Vector3();
const _playerDir = new Vector3();
const _enemyPos = new Vector3();

export const IaiSlash = () => {
    const stats = useGameStore(state => state.abilities.get('iai_slash')?.stats);
    const passives = useGameStore(state => state.passives);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    const timer = useRef(0);
    const meshRef = useRef<Mesh>(null);
    const vfxTimer = useRef(0);

    // Calculate effective CDR from passives
    const cdrLevel = passives.get('cdr') || 0;
    const cdrMult = 1 - (cdrLevel * 0.08);

    useFrame((_state, delta) => {
        if (!stats || !playerRef) return;

        timer.current += delta;

        // VFX Fade
        if (vfxTimer.current > 0) {
            vfxTimer.current -= delta * 8;
            if (meshRef.current) {
                meshRef.current.visible = true;
                meshRef.current.scale.x = 1 + (1 - vfxTimer.current) * 0.5;
                (meshRef.current.material as any).opacity = vfxTimer.current;
            }
        } else if (meshRef.current) {
            meshRef.current.visible = false;
        }

        const effectiveCooldown = stats.cooldown * cdrMult;

        if (timer.current >= effectiveCooldown) {
            timer.current = 0;
            vfxTimer.current = 1.0;

            playerRef.getWorldPosition(_playerPos);
            _playerDir.set(0, 0, 1).applyQuaternion(playerRef.quaternion).normalize();

            // Slash Logic
            const enemies = enemyRegistry.getAll();
            const damageMult = (1 + (passives.get('damage') || 0) * 0.1) * (stats.isEvolved ? 2 : 1);

            enemies.forEach(enemy => {
                _enemyPos.copy(enemy.position);
                const toEnemy = _enemyPos.clone().sub(_playerPos);
                const distSq = toEnemy.lengthSq();

                if (distSq < stats.range * stats.range) {
                    toEnemy.normalize();
                    const dot = _playerDir.dot(toEnemy);
                    const angle = Math.acos(clampedDot(dot));

                    if (angle < (stats.angle || Math.PI / 3) / 2) {
                        damageEnemy(enemy.id, stats.damage * damageMult);

                        // Hit Stop hook could go here
                    }
                }
            });

            // Update VFX Mesh Orientation
            if (meshRef.current) {
                meshRef.current.position.copy(_playerPos).add(_playerDir.clone().multiplyScalar(stats.range * 0.5));
                meshRef.current.position.y = 0.8;
                meshRef.current.quaternion.copy(playerRef.quaternion);
            }
        }
    });

    if (!stats) return null;

    return (
        <mesh ref={meshRef} visible={false}>
            <ringGeometry args={[stats.range * 0.3, stats.range, 32, 1, 0, stats.angle || Math.PI / 3]} />
            <meshBasicMaterial
                color={stats.isEvolved ? "#ff0000" : "#ffffff"}
                transparent
                opacity={0}
                side={2}
                depthWrite={false}
            />
        </mesh>
    );
};

function clampedDot(dot: number) {
    return Math.max(-1, Math.min(1, dot));
}

import { useRef, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { Vector3, Euler } from 'three';

/**
 * PROJECTILE BARRAGE COMPONENT
 * Fires multiple fast-moving projectiles in the direction the player is facing.
 */

interface Projectile {
    id: number;
    position: Vector3;
    velocity: Vector3;
    distanceTraveled: number;
}

const _playerPos = new Vector3();
const _playerDir = new Vector3();

export const ProjectileBarrage = () => {
    const stats = useGameStore(state => state.abilities.get('barrage')?.stats);
    const enemies = useGameStore(state => state.enemies);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    const [projectiles, setProjectiles] = useState<Projectile[]>([]);
    const timer = useRef(0);
    const nextId = useRef(0);

    useFrame((_state, delta) => {
        if (!stats || !playerRef) return;

        timer.current += delta;

        // Firing logic
        if (timer.current >= stats.cooldown) {
            timer.current = 0;

            playerRef.getWorldPosition(_playerPos);
            // Assume player is facing the direction they move
            // We can get forward direction from playerRef.matrix
            _playerDir.set(0, 0, 1).applyQuaternion(playerRef.quaternion).normalize();

            const newProjectiles: Projectile[] = [];
            const spread = 0.3; // Angle spread in radians

            for (let i = 0; i < stats.count; i++) {
                // Calculate direction with spread
                const angleOffset = (i - (stats.count - 1) / 2) * spread;
                const dir = _playerDir.clone().applyAxisAngle(new Vector3(0, 1, 0), angleOffset);

                newProjectiles.push({
                    id: nextId.current++,
                    position: _playerPos.clone().add(new Vector3(0, 0.5, 0)),
                    velocity: dir.multiplyScalar(15), // Speed 15m/s
                    distanceTraveled: 0
                });
            }

            setProjectiles(prev => [...prev, ...newProjectiles]);
        }

        // Movement & Collision logic
        setProjectiles(prev => {
            const updated: Projectile[] = [];

            for (const p of prev) {
                const moveDist = p.velocity.length() * delta;
                p.position.add(p.velocity.clone().multiplyScalar(delta));
                p.distanceTraveled += moveDist;

                // Check distance limit
                if (p.distanceTraveled > stats.range) continue;

                // Check collision with enemies
                let hit = false;
                for (const enemy of enemies) {
                    const [ex, ey, ez] = enemy.position;
                    const dSq = (p.position.x - ex) ** 2 + (p.position.z - ez) ** 2;
                    if (dSq < 1.0) { // Hit radius
                        damageEnemy(enemy.id, stats.damage);
                        hit = true;
                        break;
                    }
                }

                if (!hit) {
                    updated.push(p);
                }
            }

            return updated;
        });
    });

    if (!stats) return null;

    return (
        <group>
            {projectiles.map(p => (
                <mesh key={p.id} position={p.position}>
                    <sphereGeometry args={[0.15, 8, 8]} />
                    <meshStandardMaterial
                        color="#3498DB"
                        emissive="#2980B9"
                        emissiveIntensity={2}
                    />
                </mesh>
            ))}
        </group>
    );
};

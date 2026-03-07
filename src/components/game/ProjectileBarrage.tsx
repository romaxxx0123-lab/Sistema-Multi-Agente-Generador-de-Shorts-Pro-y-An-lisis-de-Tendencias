import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../../store/useGameStore';
import { enemyRegistry } from '../../systems/EnemyRegistry';
import { Vector3, InstancedMesh, Object3D, DynamicDrawUsage } from 'three';
import { ObjectPool } from '../../systems/ObjectPool';

/**
 * OPTIMIZED PROJECTILE BARRAGE
 * Uses InstancedMesh for rendering and ObjectPool for data reuse.
 * Performs collision via EnemyRegistry.
 */

class Projectile {
    position = new Vector3();
    velocity = new Vector3();
    distanceTraveled = 0;
    active = false;
}

const _playerPos = new Vector3();
const _playerDir = new Vector3();
const _tempObj = new Object3D();

export const ProjectileBarrage = () => {
    const stats = useGameStore(state => state.abilities.get('barrage')?.stats);
    const damageEnemy = useGameStore(state => state.damageEnemy);
    const playerRef = useGameStore(state => state.playerRef);

    const instancedMeshRef = useRef<InstancedMesh>(null);
    const timer = useRef(0);

    // 1. Initialize Object Pool for Projectile Data
    const pool = useMemo(() => new ObjectPool<Projectile>(
        () => new Projectile(),
        (p) => {
            p.active = false;
            p.distanceTraveled = 0;
        },
        50
    ), []);

    const activeProjectiles = useRef<Projectile[]>([]);

    useFrame((_state, delta) => {
        if (!stats || !playerRef || !instancedMeshRef.current) return;

        timer.current += delta;

        // Firing logic
        if (timer.current >= stats.cooldown) {
            timer.current = 0;

            playerRef.getWorldPosition(_playerPos);
            _playerDir.set(0, 0, 1).applyQuaternion(playerRef.quaternion).normalize();

            const spread = 0.3;

            for (let i = 0; i < stats.count; i++) {
                const angleOffset = (i - (stats.count - 1) / 2) * spread;
                const dir = _playerDir.clone().applyAxisAngle(new Vector3(0, 1, 0), angleOffset);

                const p = pool.get();
                p.active = true;
                p.position.copy(_playerPos).add(new Vector3(0, 0.5, 0));
                p.velocity.copy(dir).multiplyScalar(15);
                p.distanceTraveled = 0;
                activeProjectiles.current.push(p);
            }
        }

        // Movement & Collision & Visual Update
        const enemies = enemyRegistry.getAll();
        const mesh = instancedMeshRef.current;
        let visibleCount = 0;

        for (let i = activeProjectiles.current.length - 1; i >= 0; i--) {
            const p = activeProjectiles.current[i];

            const moveStep = p.velocity.clone().multiplyScalar(delta);
            p.position.add(moveStep);
            p.distanceTraveled += moveStep.length();

            let expired = p.distanceTraveled > stats.range;

            if (!expired) {
                // Collision check
                for (const enemy of enemies) {
                    const dSq = p.position.distanceToSquared(enemy.position);
                    if (dSq < 1.0) {
                        damageEnemy(enemy.id, stats.damage);
                        expired = true;
                        break;
                    }
                }
            }

            if (expired) {
                p.active = false;
                pool.release(p);
                activeProjectiles.current.splice(i, 1);
            } else {
                // Update Instance Matrix
                _tempObj.position.copy(p.position);
                _tempObj.updateMatrix();
                mesh.setMatrixAt(visibleCount, _tempObj.matrix);
                visibleCount++;
            }
        }

        mesh.count = visibleCount;
        mesh.instanceMatrix.needsUpdate = true;
    });

    if (!stats) return null;

    return (
        <instancedMesh
            ref={instancedMeshRef}
            args={[undefined, undefined, 200]}
            usage={DynamicDrawUsage}
        >
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial
                color="#3498DB"
                emissive="#2980B9"
                emissiveIntensity={2}
            />
        </instancedMesh>
    );
};

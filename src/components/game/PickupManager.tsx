import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore, PickupEntity } from '../../store/useGameStore';
import { Vector3, Group, Mesh, InstancedMesh, Object3D, DynamicDrawUsage } from 'three';
import { Sparkles } from '@react-three/drei';
import { TUNING } from '../../data/tuning';

/**
 * PICKUP MANAGER
 * Renders and handles collection logic for XP gems, Gold, and Chests.
 * Optimized with InstancedMesh for XP Gems.
 */
const _tempObj = new Object3D();

export const PickupManager = () => {
    const pickups = useGameStore(state => state.pickups);
    const collectPickup = useGameStore(state => state.collectPickup);
    const playerRef = useGameStore(state => state.playerRef);
    const talents = useGameStore(state => state.talents);
    const passives = useGameStore(state => state.passives);

    const xpMeshRef = useRef<InstancedMesh>(null);
    const goldMeshRef = useRef<InstancedMesh>(null);

    const _playerPos = new Vector3();
    const _pickupPos = new Vector3();

    useFrame((state) => {
        if (!playerRef) return;
        playerRef.getWorldPosition(_playerPos);

        // Magnet Range from Passives
        const magnetPassive = passives.get('magnet') || 0;
        const totalRange = TUNING.PICKUPS.MAGNET_START_RANGE * (1 + (magnetPassive * 0.5));

        let xpCount = 0;
        let goldCount = 0;

        pickups.forEach(p => {
            _pickupPos.set(...p.position);
            const distSq = _playerPos.distanceToSquared(_pickupPos);

            // Collect logic (Instant if close)
            if (distSq < 1.0) {
                collectPickup(p.id);
                return;
            }

            // Magnet logic
            if (distSq < totalRange * totalRange) {
                const dir = _playerPos.clone().sub(_pickupPos).normalize();
                const move = dir.multiplyScalar(TUNING.PICKUPS.MAGNET_SPEED * state.delta);
                p.position[0] += move.x;
                p.position[1] += move.y;
                p.position[2] += move.z;
            }

            // Update instances
            if (p.type === 'xp' && xpMeshRef.current) {
                _tempObj.position.set(...p.position);
                _tempObj.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 3 + xpCount) * 0.1;
                _tempObj.rotation.y = state.clock.elapsedTime * 2;
                _tempObj.updateMatrix();
                xpMeshRef.current.setMatrixAt(xpCount++, _tempObj.matrix);
            } else if (p.type === 'gold' && goldMeshRef.current) {
                _tempObj.position.set(...p.position);
                _tempObj.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 4 + goldCount) * 0.05;
                _tempObj.rotation.y = state.clock.elapsedTime * 5;
                _tempObj.updateMatrix();
                goldMeshRef.current.setMatrixAt(goldCount++, _tempObj.matrix);
            }
        });

        if (xpMeshRef.current) {
            xpMeshRef.current.count = xpCount;
            xpMeshRef.current.instanceMatrix.needsUpdate = true;
        }
        if (goldMeshRef.current) {
            goldMeshRef.current.count = goldCount;
            goldMeshRef.current.instanceMatrix.needsUpdate = true;
        }
    });

    const chests = useMemo(() => pickups.filter(p => p.type === 'chest'), [pickups]);

    return (
        <group>
            <instancedMesh ref={xpMeshRef} args={[undefined, undefined, TUNING.PICKUPS.MAX_COUNT]} usage={DynamicDrawUsage}>
                <octahedronGeometry args={[0.15]} />
                <meshStandardMaterial color="#3498DB" emissive="#3498DB" emissiveIntensity={2} />
            </instancedMesh>

            <instancedMesh ref={goldMeshRef} args={[undefined, undefined, 100]} usage={DynamicDrawUsage}>
                <cylinderGeometry args={[0.15, 0.15, 0.05, 12]} />
                <meshStandardMaterial color="#F1C40F" metalness={0.8} roughness={0.2} />
            </instancedMesh>

            {chests.map(p => (
                <ChestItem key={p.id} data={p} />
            ))}
        </group>
    );
};

const ChestItem = ({ data }: { data: PickupEntity }) => {
    const meshRef = useRef<Mesh>(null);

    useFrame((state) => {
        if (meshRef.current) {
            meshRef.current.rotation.y += 0.02;
            meshRef.current.position.y = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.1;
        }
    });

    return (
        <group position={data.position}>
            <mesh ref={meshRef}>
                <boxGeometry args={[0.5, 0.4, 0.3]} />
                <meshStandardMaterial color="#9B59B6" />
            </mesh>
            <Sparkles count={10} scale={1} size={2} color="#F1C40F" />
        </group>
    );
};

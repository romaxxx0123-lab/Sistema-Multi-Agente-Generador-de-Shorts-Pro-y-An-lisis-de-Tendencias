import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { InstancedMesh, Object3D } from 'three';

/**
 * INSTANCED ENEMIES SYSTEM
 * Renders 100+ enemies in a single draw call.
 * Essential for maintaining 60 FPS in Part 2.
 */
interface InstancedEnemiesProps {
  count: number; // Max enemies of this type
  positions: Array<[number, number, number]>; // Current active positions
  color?: string;
}

export function InstancedEnemies({
  count,
  positions,
  color = "#ff0000"
}: InstancedEnemiesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const tempObject = useMemo(() => new Object3D(), []);

  useFrame(() => {
    if (!meshRef.current) return;

    // Update active instances
    positions.forEach((pos, i) => {
      tempObject.position.set(pos[0], pos[1], pos[2]);
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    });

    // Hide unused instances (move them far away)
    for (let i = positions.length; i < count; i++) {
      tempObject.position.set(0, -1000, 0); // Out of view
      tempObject.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObject.matrix);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
      <capsuleGeometry args={[0.5, 1, 8, 16]} />
      <meshStandardMaterial color={color} />
    </instancedMesh>
  );
}

/**
 * FUTURE USAGE (Part 2):
 *
 * const [enemies, setEnemies] = useState([]);
 *
 * <InstancedEnemies
 *   count={100}
 *   positions={enemies.map(e => e.position)}
 * />
 */

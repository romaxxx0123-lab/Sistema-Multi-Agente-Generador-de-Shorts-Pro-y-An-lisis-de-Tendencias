import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * SAKURA PARTICLES
 * High-performance instanced particle system for falling cherry blossom petals.
 */
export const SakuraParticles = ({ count = 100 }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Create dummy object for matrix calculations
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Particle metadata
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      temp.push({
        x: (Math.random() - 0.5) * 60,
        y: Math.random() * 20,
        z: (Math.random() - 0.5) * 60,
        speed: 0.02 + Math.random() * 0.05,
        rotation: Math.random() * Math.PI,
        rotationSpeed: (Math.random() - 0.5) * 0.02,
        wobble: Math.random() * 10
      });
    }
    return temp;
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();

    particles.forEach((p, i) => {
      // Update position
      p.y -= p.speed;
      p.rotation += p.rotationSpeed;

      // Reset if below floor
      if (p.y < 0) {
        p.y = 20;
        p.x = (Math.random() - 0.5) * 60;
        p.z = (Math.random() - 0.5) * 60;
      }

      // Sine wobble for organic "floating" feel
      const xOffset = Math.sin(t + p.wobble) * 0.1;

      dummy.position.set(p.x + xOffset, p.y, p.z);
      dummy.rotation.set(p.rotation, p.rotation, p.rotation);
      dummy.scale.set(0.1, 0.1, 0.1);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[1, 1]} />
      <meshStandardMaterial
        color="#fd79a8"
        side={THREE.DoubleSide}
        transparent
        opacity={0.6}
        roughness={1}
      />
    </instancedMesh>
  );
};

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Mesh, Vector3, Quaternion } from 'three';
import { useControls } from '../hooks/useControls';
import { useGameStore } from '../store/useGameStore';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import { usePlayerDash } from '../hooks/usePlayerDash';
import { usePlayerCombat } from '../hooks/usePlayerCombat';
import { GAME_CONFIG } from '../config';

export const Player = () => {
  const { forward, backward, left, right, dash, attack: attackInput } = useControls();
  const setPlayerRef = useGameStore((state) => state.setPlayerRef);
  const status = useGameStore((state) => state.status);

  // Constants
  const moveSpeed = GAME_CONFIG.PLAYER.MOVE_SPEED;
  const rotationSpeed = GAME_CONFIG.PLAYER.ROTATION_SPEED;

  // Physics body
  const [ref, api] = useSphere<Mesh>(() => ({
    mass: GAME_CONFIG.PHYSICS.PLAYER_MASS,
    position: [0, 1, 0],
    fixedRotation: true,
    args: [GAME_CONFIG.PLAYER.CAPSULE_RADIUS],
  }));

  // Update global ref for camera follow
  useEffect(() => {
    if (ref.current) {
      setPlayerRef(ref.current);
    }
  }, [ref, setPlayerRef]);

  // Hook modules
  const { move } = usePlayerMovement(api, moveSpeed, rotationSpeed);
  const { performDash, isDashing, canDash } = usePlayerDash(api);
  const { attack, isAttacking } = usePlayerCombat(ref.current);

  const [trail, setTrail] = useState<{ id: number; position: [number, number, number] }[]>([]);
  const trailId = useRef(0);

  useFrame((_state, delta) => {
    if (status !== 'playing') return;

    // Handle Dash Trigger
    if (dash && canDash && !isDashing) {
      performDash(forward, backward, left, right, ref);
    }

    if (isDashing) {
      const pos = ref.current!.position.toArray();
      setTrail((prev: any[]) => [...prev.slice(-10), { id: trailId.current++, position: pos }]);
    } else if (trail.length > 0) {
      setTrail([]);
    }

    // Handle Attack Trigger
    if (attackInput) {
      attack();
    }

    // Only allow movement if not currently dashing
    if (!isDashing) {
      move(forward, backward, left, right, delta, ref);
    }
  });

  return (
    <group>
      {trail.map((t: any, i: number) => (
        <mesh key={t.id} position={t.position}>
          <capsuleGeometry args={[GAME_CONFIG.PLAYER.CAPSULE_RADIUS, GAME_CONFIG.PLAYER.CAPSULE_HEIGHT, 4, 16]} />
          <meshBasicMaterial color={GAME_CONFIG.PLAYER.DASH_COLOR} transparent opacity={0.3 * (i / trail.length)} />
        </mesh>
      ))}
    <mesh ref={ref} castShadow>
      {/* Visual representation: A Capsule */}
      <capsuleGeometry args={[GAME_CONFIG.PLAYER.CAPSULE_RADIUS, GAME_CONFIG.PLAYER.CAPSULE_HEIGHT, 4, 16]} />
      <meshStandardMaterial
        color={
          isAttacking ? "yellow" :
          (isDashing ? GAME_CONFIG.PLAYER.DASH_COLOR : GAME_CONFIG.PLAYER.COLOR)
        }
      />

      {/* Visual feedback for dash availability (simple marker) */}
      {!canDash && (
        <mesh position={[0, 1.2, 0]}>
          <boxGeometry args={[0.2, 0.1, 0.2]} />
          <meshBasicMaterial color="red" />
        </mesh>
      )}
    </mesh>
    </group>
  );
};

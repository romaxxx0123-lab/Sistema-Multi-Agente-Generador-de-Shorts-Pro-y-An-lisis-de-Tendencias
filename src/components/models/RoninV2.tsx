import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Group } from "three";
import { TextureGenerator } from "../../utils/textures";
import { SlashTrail } from "../game/SlashTrail";

/**
 * RONIN V2 - HIGH QUALITY STYLIZED PLAYER
 * Features: Kasa (Hat), Kimono with Obi, Sode (Armor), and detailed proportions.
 */
export const RoninV2 = ({ velocity = { x: 0, y: 0, z: 0 }, isAttacking = false, ...props }: any) => {
  const groupRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const tiltRef = useRef<Group>(null);
  const swordRef = useRef<Group>(null);
  const rightArmRef = useRef<Group>(null);
  const bodyGroupRef = useRef<Group>(null);

  // Animation state
  const attackTime = useRef(0);
  const wasAttacking = useRef(false);
  const [slashActive, setSlashActive] = useState(false);
  const [slashProgress, setSlashProgress] = useState(0);

  const kimonoTextures = useMemo(() => TextureGenerator.createFabric('#2d3436'), []);
  const hakamaTextures = useMemo(() => TextureGenerator.createFabric('#1a1a1a'), []);
  const hatTextures = useMemo(() => {
    const texs = TextureGenerator.createWoodGrain('#4b3621', '#2d1b0d', 256);
    Object.values(texs).forEach(t => t.repeat.set(4, 1));
    return texs;
  }, []);

  // Procedural idle animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    // --- RESPONSIVE LOCOMOTION ---
    const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
    const isMoving = speed > 0.1;

    // 1. Dynamic Bobbing (Idle vs Walk)
    const bobFreq = isMoving ? speed * 2 : 2;
    const bobAmp = isMoving ? 0.08 : 0.05;
    groupRef.current.position.y = Math.sin(t * bobFreq) * bobAmp + 0.9;

    // 2. Head Look/Tilt
    if (headRef.current) {
      headRef.current.rotation.z = Math.sin(t * (isMoving ? bobFreq : 1.5)) * (isMoving ? 0.1 : 0.05);
      // Look slightly in movement direction
      headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, velocity.x * 0.1, 0.1);
    }

    // 3. Kinetic Lean (Refined)
    if (tiltRef.current) {
      // Lean into the movement direction
      const targetTiltZ = -velocity.x * 0.03;
      const targetTiltX = velocity.z * 0.03;
      tiltRef.current.rotation.z = THREE.MathUtils.lerp(tiltRef.current.rotation.z, targetTiltZ, 0.15);
      tiltRef.current.rotation.x = THREE.MathUtils.lerp(tiltRef.current.rotation.x, targetTiltX, 0.15);

      // Walk Sway
      if (isMoving) {
        tiltRef.current.rotation.y = Math.sin(t * bobFreq) * 0.05;
      }
    }

    // --- ADVANCED ATTACK SYSTEM ---
    const attackDuration = 0.5;
    const anticipationTime = 0.1;
    const strikeTime = 0.25;

    if (isAttacking && !wasAttacking.current) {
      attackTime.current = state.clock.getElapsedTime();
    }
    wasAttacking.current = isAttacking;

    const timeSinceAttack = state.clock.getElapsedTime() - attackTime.current;
    const isInsideAttackWindow = timeSinceAttack < attackDuration;

    // Slash trail trigger
    const slashIn = anticipationTime;
    const slashOut = strikeTime;
    if (timeSinceAttack >= slashIn && timeSinceAttack <= slashOut) {
      setSlashActive(true);
      setSlashProgress((timeSinceAttack - slashIn) / (slashOut - slashIn));
    } else {
      setSlashActive(false);
    }

    if (swordRef.current && rightArmRef.current && bodyGroupRef.current) {
      if (isInsideAttackWindow) {
        if (timeSinceAttack < anticipationTime) {
          // 1. ANTICIPATION: Pull back
          const p = timeSinceAttack / anticipationTime;
          swordRef.current.rotation.x = THREE.MathUtils.lerp(0, Math.PI / 4, p);
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(0, -Math.PI / 6, p);
          bodyGroupRef.current.rotation.y = THREE.MathUtils.lerp(0, -Math.PI / 8, p);
          bodyGroupRef.current.position.z = THREE.MathUtils.lerp(0, -0.1, p);
        } else if (timeSinceAttack < strikeTime) {
          // 2. STRIKE: Fast swing + Lunge
          const p = (timeSinceAttack - anticipationTime) / (strikeTime - anticipationTime);
          swordRef.current.rotation.x = THREE.MathUtils.lerp(Math.PI / 4, -Math.PI * 0.8, p);
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(-Math.PI / 6, Math.PI / 3, p);
          bodyGroupRef.current.rotation.y = THREE.MathUtils.lerp(-Math.PI / 8, Math.PI / 4, p);
          bodyGroupRef.current.position.z = THREE.MathUtils.lerp(-0.1, 0.3, p);
          // Shoulder twist
          rightArmRef.current.position.z = THREE.MathUtils.lerp(0, 0.1, p);
        } else {
          // 3. RECOVERY: Return to idle
          const p = (timeSinceAttack - strikeTime) / (attackDuration - strikeTime);
          swordRef.current.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.8, 0, p);
          rightArmRef.current.rotation.x = THREE.MathUtils.lerp(Math.PI / 3, 0, p);
          bodyGroupRef.current.rotation.y = THREE.MathUtils.lerp(Math.PI / 4, 0, p);
          bodyGroupRef.current.position.z = THREE.MathUtils.lerp(0.3, 0, p);
          rightArmRef.current.position.z = THREE.MathUtils.lerp(0.1, 0, p);
        }
      } else {
        // IDLE STATE FOR SWORD/ARM
        swordRef.current.rotation.x = THREE.MathUtils.lerp(swordRef.current.rotation.x, 0, 0.1);
        rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, 0, 0.1);
        bodyGroupRef.current.rotation.y = THREE.MathUtils.lerp(bodyGroupRef.current.rotation.y, 0, 0.1);
      }
    }
  });

  return (
    <group {...props} ref={groupRef}>
      <group ref={tiltRef}>
      <group ref={bodyGroupRef}>
      {/* 1. LOWER BODY (Hakama) */}
      <mesh position={[0, -0.4, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.4, 0.8, 8]} />
        <meshStandardMaterial {...hakamaTextures} />
      </mesh>

      {/* 2. TORSO (Kimono) */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial {...kimonoTextures} />
      </mesh>

      {/* Obi (Belt) */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.52, 0.1, 0.32]} />
        <meshStandardMaterial color="#d63031" />
      </mesh>

      {/* 3. ARMS & SODE (Shoulder Armor) */}
      {/* Right Arm */}
      <group ref={rightArmRef} position={[0.35, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
        {/* Sode Armor */}
        <mesh position={[0.05, 0.1, 0]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.1, 0.25, 0.2]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
        </mesh>

        {/* SWORD (Katana) */}
        <group ref={swordRef} position={[0, -0.1, 0.1]}>
          <mesh rotation={[0, 0, 0]}>
            <boxGeometry args={[0.03, 0.8, 0.01]} />
            <meshStandardMaterial color="#ddd" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[0, -0.4, 0]}>
            <boxGeometry args={[0.04, 0.2, 0.02]} />
            <meshStandardMaterial color="#111" />
          </mesh>
        </group>
      </group>

      {/* Left Arm */}
      <group position={[-0.35, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.15, 0.4, 0.15]} />
          <meshStandardMaterial color="#2d3436" />
        </mesh>
        {/* Sode Armor */}
        <mesh position={[-0.05, 0.1, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.1, 0.25, 0.2]} />
          <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* 4. HEAD & KASA (Hat) */}
      <group ref={headRef} position={[0, 0.65, 0]}>
        {/* Face/Mask */}
        <mesh castShadow>
          <boxGeometry args={[0.25, 0.25, 0.25]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        {/* Glowing Visor */}
        <mesh position={[0, 0.05, 0.13]}>
          <planeGeometry args={[0.2, 0.05]} />
          <meshStandardMaterial color="#00d2ff" emissive="#00d2ff" emissiveIntensity={2} />
        </mesh>

        {/* KASA (Traditional Hat) */}
        <mesh position={[0, 0.15, 0]} rotation={[0.1, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.6, 0.15, 12]} />
          <meshStandardMaterial {...hatTextures} />
        </mesh>
      </group>

      </group>
      </group>

      {/* SLASH EFFECT */}
      <SlashTrail active={slashActive} progress={slashProgress} />

      {/* Shadow Blob */}
      <mesh position={[0, -0.85, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.8, 0.8]} />
        <meshStandardMaterial color="#000" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

import { useState, useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion, Mesh } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

export const usePlayerCombat = (playerRef: Mesh | null) => {
  const [canAttack, setCanAttack] = useState(true);
  const [isAttacking, setIsAttacking] = useState(false);
  const cooldownTimer = useRef(0);
  const attackDurationTimer = useRef(0);

  const status = useGameStore((state) => state.status);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);
  const attackCooldownModifier = useGameStore((state) => state.attackCooldownModifier);

  // We'll need a way to get all enemies. For now, we'll assume they are tracked globally or via a specific event.
  // In Part 2, we can use a custom event or a store-based registry.
  // Let's use a simple event-based approach for now, or assume we'll add them to the store.

  const attack = useCallback(() => {
    if (!canAttack || status !== 'playing' || !playerRef) return;

    setIsAttacking(true);
    setCanAttack(false);

    // Reset timers
    const baseCooldown = GAME_CONFIG.COMBAT.ATTACK_COOLDOWN;
    const actualCooldown = Math.max(0.1, baseCooldown - attackCooldownModifier);
    cooldownTimer.current = actualCooldown;
    attackDurationTimer.current = 0.1; // Visual attack duration

    // 1. Calculate attack range and direction
    const playerPos = playerRef.position;
    const playerForward = new Vector3(0, 0, -1).applyQuaternion(playerRef.quaternion);
    const damage = GAME_CONFIG.COMBAT.BASE_DAMAGE * damageMultiplier;
    const range = GAME_CONFIG.COMBAT.ATTACK_RANGE;

    // 2. Dispatch a 'player-attack' event that enemies can listen to
    // They will check if they are within range and angle
    const event = new CustomEvent('player-attack', {
      detail: {
        position: playerPos.clone(),
        forward: playerForward.clone(),
        range: range,
        damage: damage,
        angle: Math.PI / 2, // 90 degree cone
      }
    });
    window.dispatchEvent(event);

  }, [canAttack, status, playerRef, damageMultiplier, attackCooldownModifier]);

  useFrame((_state, delta) => {
    if (status !== 'playing') return;

    if (cooldownTimer.current > 0) {
      cooldownTimer.current -= delta;
      if (cooldownTimer.current <= 0) {
        setCanAttack(true);
      }
    }

    if (attackDurationTimer.current > 0) {
      attackDurationTimer.current -= delta;
      if (attackDurationTimer.current <= 0) {
        setIsAttacking(false);
      }
    }
  });

  return { attack, isAttacking, canAttack };
};

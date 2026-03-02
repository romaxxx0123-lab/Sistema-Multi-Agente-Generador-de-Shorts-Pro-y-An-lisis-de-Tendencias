import { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useGameStore } from '../../store/useGameStore';
import { GAME_CONFIG } from '../../config';

export const ChainLightning = ({ level }: { level: number }) => {
  const timer = useRef(0);
  const status = useGameStore((state) => state.status);
  const playerRef = useGameStore((state) => state.playerRef);
  const damageMultiplier = useGameStore((state) => state.damageMultiplier);

  const config = GAME_CONFIG.ABILITIES.CHAIN_LIGHTNING;
  const cooldown = 3;
  const damage = config.DAMAGE * damageMultiplier;
  const bounces = level + 1;

  useFrame((_state, delta) => {
    if (status !== 'playing' || !playerRef) return;

    timer.current += delta;
    if (timer.current >= cooldown) {
      window.dispatchEvent(new CustomEvent('request-chain-lightning', {
        detail: {
          position: playerRef.position.clone(),
          range: config.RANGE,
          damage: damage,
          bounces: bounces,
          bounceRange: config.BOUNCE_RANGE
        }
      }));
      timer.current = 0;
    }
  });

  return null;
};

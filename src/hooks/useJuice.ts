import { useState, useCallback, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Euler } from 'three';
import { TUNING } from '../data/tuning';

/**
 * JUICE SYSTEM: SHAKE & HITSTOP
 */

export const useJuice = () => {
    const [shakeOffset, setShakeOffset] = useState(new Vector3());
    const intensity = useRef(0);
    const hitStopTimer = useRef(0);

    const triggerShake = useCallback((amount = TUNING.JUICE.SHAKE_INTENSITY) => {
        intensity.current = amount;
    }, []);

    const triggerHitStop = useCallback((duration = TUNING.JUICE.HIT_STOP) => {
        hitStopTimer.current = duration;
    }, []);

    useFrame((state, delta) => {
        // Handle Hitstop (Artificial lag)
        if (hitStopTimer.current > 0) {
            hitStopTimer.current -= delta;
            // We can't easily pause R3F's clock from here without global state,
            // but we can signal components to skip their updates.
        }

        // Handle Shake
        if (intensity.current > 0) {
            intensity.current *= 1 - (delta * TUNING.JUICE.SHAKE_DECAY);
            if (intensity.current < 0.01) intensity.current = 0;

            const x = (Math.random() - 0.5) * intensity.current;
            const y = (Math.random() - 0.5) * intensity.current;
            const z = (Math.random() - 0.5) * intensity.current;
            setShakeOffset(new Vector3(x, y, z));
        } else {
            setShakeOffset(new Vector3(0, 0, 0));
        }
    });

    return { shakeOffset, triggerShake, triggerHitStop, hitStopActive: hitStopTimer.current > 0 };
};

import { useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '../store/useGameStore';

export const GlobalVFX = () => {
  const [shake, setShake] = useState(0);
  const status = useGameStore((state) => state.status);

  useEffect(() => {
    const handleShake = (e: any) => setShake(e.detail.intensity);
    window.addEventListener('screen-shake', handleShake);
    return () => window.removeEventListener('screen-shake', handleShake);
  }, []);

  useFrame((state) => {
    if (shake > 0) {
      const s = shake * 0.01;
      state.camera.position.x += (Math.random() - 0.5) * s;
      state.camera.position.y += (Math.random() - 0.5) * s;
      setShake(prev => Math.max(0, prev - 1));
    }
  });

  // Slow motion and visual feedback on level up
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  useEffect(() => {
    if (status === 'levelup') {
       setLevelUpFlash(true);
       setTimeout(() => setLevelUpFlash(false), 500);

       // Slow motion effect:
       // In a real project, we'd scale 'delta'.
       // For this demo, we can use a visual indicator or a small pause.
    }
  }, [status]);

  useEffect(() => {
    const handleSfx = (e: any) => {
      console.log(`[SFX HOOK]: Playing ${e.detail.type}`);
    };
    window.addEventListener('play-sfx', handleSfx);
    return () => window.removeEventListener('play-sfx', handleSfx);
  }, []);

  return (
    <>
      {levelUpFlash && (
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'white',
          opacity: 0.3,
          pointerEvents: 'none',
          zIndex: 50
        }} />
      )}
    </>
  );
};

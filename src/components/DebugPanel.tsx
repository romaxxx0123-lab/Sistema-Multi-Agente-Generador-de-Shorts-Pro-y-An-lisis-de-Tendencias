import { useFrame } from '@react-three/fiber';
import { useRef, useState, useEffect } from 'react';

/**
 * DEBUG PANEL - PERFORMANCE MONITORING
 * Real-time monitoring of FPS and performance status.
 * Toggle visibility with F3 key.
 */
export function DebugPanel() {
  const [fps, setFps] = useState(60);
  const [visible, setVisible] = useState(false);
  const lastTime = useRef(performance.now());
  const frameCount = useRef(0);

  // Custom frame loop for FPS calculation even outside Canvas if needed
  // or just use RequestAnimationFrame
  useEffect(() => {
    let handle: number;
    const loop = () => {
      const now = performance.now();
      frameCount.current++;

      if (now - lastTime.current >= 500) {
        const currentFps = Math.round((frameCount.current * 1000) / (now - lastTime.current));
        setFps(currentFps);
        lastTime.current = now;
        frameCount.current = 0;
      }
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    // Toggle with F3
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        setVisible(v => !v);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <div
      id="debug-panel"
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        background: 'rgba(0,0,0,0.8)',
        color: '#0f0',
        padding: '10px',
        fontFamily: 'monospace',
        fontSize: '12px',
        borderRadius: '5px',
        zIndex: 1000,
        pointerEvents: 'none',
        display: visible ? 'block' : 'none'
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>PERFORMANCE MONITOR</div>
      <div>FPS: {fps} {fps < 30 ? '❌' : fps < 50 ? '⚠️' : '✅'}</div>
      <div>Press F3 to toggle</div>
      <hr style={{ border: 'none', borderTop: '1px solid #0f0', margin: '5px 0' }} />
      <div style={{ fontSize: '10px', color: '#888' }}>
        Performance targets:
        <br />✅ 60+ FPS = Excellent
        <br />⚠️ 30-60 FPS = Playable
        <br />❌ &lt;30 FPS = Unplayable
      </div>
    </div>
  );
}

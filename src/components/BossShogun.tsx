import { useRef, useState, useEffect, useCallback } from 'react';
import { useFrame } from '@react-three/fiber';
import { useSphere } from '@react-three/cannon';
import { Vector3, Mesh, Quaternion } from 'three';
import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

type ShogunState = 'idle' | 'combo' | 'dash' | 'tornado' | 'summon' | 'projs' | 'teleport';

export const BossShogun = () => {
  const [state, setState] = useState<ShogunState>('idle');
  const [hp, setHp] = useState(GAME_CONFIG.BOSS.SHOGUN.HP);
  const [isHit, setIsHit] = useState(false);

  const playerRef = useGameStore((state) => state.playerRef);
  const status = useGameStore((state) => state.status);
  const damageBossAction = useGameStore((state) => state.damageBoss);

  const timer = useRef(0);
  const cooldowns = useRef<Record<string, number>>({
    combo: 0, dash: 0, tornado: 0, summon: 0, projs: 0, teleport: 0
  });

  const [ref, api] = useSphere<Mesh>(() => ({
    mass: 200,
    position: [0, 2, 0],
    args: [GAME_CONFIG.BOSS.SHOGUN.SCALE / 2],
    fixedRotation: true,
  }));

  const hpPercent = hp / GAME_CONFIG.BOSS.SHOGUN.HP;
  const phase = hpPercent > 0.66 ? 1 : (hpPercent > 0.33 ? 2 : 3);
  const config = GAME_CONFIG.BOSS.SHOGUN;
  const attacks = (GAME_CONFIG.BOSS as any).SHOGUN_ATTACKS;

  const takeDamage = useCallback((amount: number) => {
    setHp((prev) => Math.max(0, prev - amount));
    damageBossAction(amount);
    setIsHit(true);
    setTimeout(() => setIsHit(false), 100);
  }, [damageBossAction]);

  useEffect(() => {
    const handleAttack = (e: any) => {
      if (!ref.current || hp <= 0) return;
      const distance = new Vector3().subVectors(ref.current.position, e.detail.position).length();
      if (distance <= e.detail.range + config.SCALE) takeDamage(e.detail.damage);
    };
    window.addEventListener('player-attack', handleAttack);
    return () => window.removeEventListener('player-attack', handleAttack);
  }, [hp, takeDamage, config.SCALE]);

  useFrame((_state, delta) => {
    if (status !== 'playing' || hp <= 0 || !playerRef || !ref.current) return;

    const bossPos = ref.current.position;
    const playerPos = playerRef.position;
    const toPlayer = new Vector3().subVectors(playerPos, bossPos);
    const distance = toPlayer.length();

    // Cooldowns
    Object.keys(cooldowns.current).forEach(k => cooldowns.current[k] -= delta);

    if (state === 'idle') {
      api.velocity.set(0, 0, 0);

      if (cooldowns.current.teleport <= 0 && phase === 3) startTeleport();
      else if (cooldowns.current.dash <= 0) startDash();
      else if (cooldowns.current.tornado <= 0 && phase >= 2) startTornado();
      else if (cooldowns.current.projs <= 0 && phase === 3) startProjs();
      else if (cooldowns.current.combo <= 0) startCombo();
      else {
        const dir = toPlayer.clone().normalize();
        api.velocity.set(dir.x * config.SPEED, 0, dir.z * config.SPEED);
      }
    } else if (state === 'combo') {
        timer.current -= delta;
        if (timer.current <= 0) { setState('idle'); cooldowns.current.combo = attacks.COMBO.COOLDOWN; }
        if (distance < 3) useGameStore.getState().takeDamage(attacks.COMBO.DAMAGE); // Tick damage during combo
    } else if (state === 'dash') {
        timer.current -= delta;
        if (timer.current <= 0) { setState('idle'); cooldowns.current.dash = attacks.DASH.COOLDOWN; }
    } else if (state === 'tornado') {
        timer.current -= delta;
        const dir = toPlayer.clone().normalize();
        api.velocity.set(dir.x * attacks.TORNADO.SPEED, 0, dir.z * attacks.TORNADO.SPEED);
        if (distance < attacks.TORNADO.RADIUS) useGameStore.getState().takeDamage(attacks.TORNADO.DAMAGE);
        if (timer.current <= 0) { setState('idle'); cooldowns.current.tornado = attacks.TORNADO.COOLDOWN; }
    } else if (state === 'teleport') {
        timer.current -= delta;
        if (timer.current <= 0) {
            const behind = new Vector3(0, 0, 2).applyQuaternion(playerRef.quaternion).add(playerPos);
            api.position.set(behind.x, 2, behind.z);
            setState('idle');
            cooldowns.current.teleport = attacks.TELEPORT.COOLDOWN;
        }
    } else if (state === 'projs') {
        timer.current -= delta;
        if (Math.floor(timer.current * 10) % 5 === 0) {
            window.dispatchEvent(new CustomEvent('enemy-projectile', {
                detail: { position: bossPos.clone(), direction: new Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize(), damage: attacks.PROJS.DAMAGE, speed: attacks.PROJS.SPEED }
            }));
        }
        if (timer.current <= 0) { setState('idle'); cooldowns.current.projs = attacks.PROJS.COOLDOWN; }
    }
  });

  const startCombo = () => { setState('combo'); timer.current = attacks.COMBO.DURATION; api.velocity.set(0,0,0); };
  const startDash = () => {
    setState('dash'); timer.current = attacks.DASH.DURATION;
    const dir = new Vector3().subVectors(playerRef!.position, ref.current!.position).normalize();
    api.velocity.set(dir.x * attacks.DASH.SPEED, 0, dir.z * attacks.DASH.SPEED);
  };
  const startTornado = () => { setState('tornado'); timer.current = attacks.TORNADO.DURATION; };
  const startTeleport = () => { setState('teleport'); timer.current = attacks.TELEPORT.DELAY; api.velocity.set(0,0,0); };
  const startProjs = () => { setState('projs'); timer.current = attacks.PROJS.DURATION; api.velocity.set(0,0,0); };

  if (hp <= 0) return null;

  return (
    <mesh ref={ref} castShadow>
      <boxGeometry args={[config.SCALE, config.SCALE, config.SCALE]} />
      <meshStandardMaterial color={isHit ? "white" : (phase === 3 ? "#7f1d1d" : config.COLOR)} />
      {state === 'tornado' && (
          <mesh rotation={[-Math.PI/2, 0, 0]}>
              <ringGeometry args={[0, 4, 32]} />
              <meshBasicMaterial color="gray" transparent opacity={0.3} />
          </mesh>
      )}
    </mesh>
  );
};

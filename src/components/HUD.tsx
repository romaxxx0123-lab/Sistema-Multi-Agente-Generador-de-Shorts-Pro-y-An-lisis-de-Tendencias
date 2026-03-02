import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

export const HUD = () => {
  const { hp, maxHp, xp, level, kills, gameTime, bossActive, bossHp, bossMaxHp, bossesDefeated } = useGameStore();

  const xpNeeded = level * 10;
  const hpPercent = Math.max(0, (hp / maxHp) * 100);
  const xpPercent = Math.min(100, (xp / xpNeeded) * 100);
  const bossHpPercent = Math.max(0, (bossHp / bossMaxHp) * 100);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '20px',
      color: 'white',
      fontFamily: 'sans-serif',
      width: '300px',
      pointerEvents: 'none',
      userSelect: 'none'
    }}>
      {/* Level and Kills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontWeight: 'bold', textTransform: 'uppercase' }}>
        <span>Nivel {level}</span>
        <span>Kills: {kills}</span>
      </div>

      {/* HP Bar */}
      <div style={{ height: '24px', width: '100%', backgroundColor: '#333', borderRadius: '12px', overflow: 'hidden', marginBottom: '8px', border: '2px solid #000' }}>
        <div style={{
          height: '100%',
          width: `${hpPercent}%`,
          backgroundColor: '#ef4444',
          transition: 'width 0.3s ease-out'
        }} />
        <div style={{ position: 'absolute', width: '100%', textAlign: 'center', fontSize: '12px', lineHeight: '24px', fontWeight: 'bold' }}>
          {Math.ceil(hp)} / {maxHp} HP
        </div>
      </div>

      {/* XP Bar */}
      <div style={{ height: '12px', width: '100%', backgroundColor: '#333', borderRadius: '6px', overflow: 'hidden', border: '2px solid #000' }}>
        <div style={{
          height: '100%',
          width: `${xpPercent}%`,
          backgroundColor: '#22c55e',
          transition: 'width 0.3s ease-out'
        }} />
      </div>
    </div>

    {/* Timer Center Top */}
    <div style={{
      position: 'absolute',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      color: 'white',
      fontFamily: 'sans-serif',
      fontSize: '24px',
      fontWeight: 'bold',
      pointerEvents: 'none'
    }}>
      {formatTime(gameTime)}
    </div>

    {/* Boss HP Bar Bottom */}
    {bossActive && (
      <div style={{
        position: 'absolute',
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        fontFamily: 'sans-serif',
        pointerEvents: 'none'
      }}>
        <div style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', marginBottom: '5px' }}>
          {bossesDefeated === 0 ? GAME_CONFIG.BOSS.ONI.NAME : GAME_CONFIG.BOSS.SHOGUN.NAME}
        </div>
        <div style={{ height: '20px', width: '100%', backgroundColor: '#333', borderRadius: '10px', overflow: 'hidden', border: '2px solid #000' }}>
          <div style={{
            height: '100%',
            width: `${bossHpPercent}%`,
            backgroundColor: '#ef4444',
            transition: 'width 0.1s linear'
          }} />
        </div>
      </div>
    )}
    </>
  );
};

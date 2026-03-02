import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';
import { useState } from 'react';

export const CharacterSelector = () => {
  const { metaData, startRun, unlockCharacter, setView } = useGameStore();
  const [difficulty, setDifficulty] = useState<'normal' | 'hard' | 'nightmare'>('normal');

  return (
    <div style={{
      width: '100vw', height: '100vh', backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      color: 'white', fontFamily: 'sans-serif', padding: '40px'
    }}>
      <h2 style={{ fontSize: '32px', fontWeight: 900, marginBottom: '40px', textTransform: 'uppercase' }}>Elige tu Guerrero</h2>

      <div style={{ display: 'flex', gap: '30px', marginBottom: '60px' }}>
        {Object.entries(GAME_CONFIG.CHARACTERS).map(([id, char]: [string, any]) => {
          const isUnlocked = metaData.unlockedCharacters.includes(id.toLowerCase());
          return (
            <div key={id} style={{
              width: '220px', padding: '20px', backgroundColor: '#1e293b', borderRadius: '16px',
              border: '2px solid #334155', display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <div style={{ width: '100px', height: '100px', backgroundColor: '#334155', borderRadius: '50%', marginBottom: '15px' }} />
              <span style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '5px' }}>{char.name}</span>
              <span style={{ fontSize: '14px', opacity: 0.8, textAlign: 'center', height: '40px' }}>{char.description}</span>

              <div style={{ margin: '15px 0', fontSize: '12px' }}>
                HP: {char.hp} | Vel: {char.speed}
              </div>

              {isUnlocked ? (
                <button onClick={() => startRun(id.toLowerCase(), difficulty)} style={actionButtonStyle}>Seleccionar</button>
              ) : (
                <button
                  onClick={() => unlockCharacter(id.toLowerCase())}
                  disabled={metaData.metaXp < (char.unlockCost || 0)}
                  style={{...actionButtonStyle, backgroundColor: '#475569'}}
                >
                  Desbloquear ({char.unlockCost} XP)
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        {(['normal', 'hard', 'nightmare'] as const).map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold',
              backgroundColor: difficulty === d ? '#ef4444' : '#334155', color: 'white', textTransform: 'uppercase'
            }}
          >
            {d}
          </button>
        ))}
      </div>

      <button onClick={() => setView('menu')} style={{ backgroundColor: 'transparent', color: 'white', border: 'none', cursor: 'pointer' }}>Volver</button>
    </div>
  );
};

const actionButtonStyle = {
  width: '100%', padding: '10px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', textTransform: 'uppercase' as const
};

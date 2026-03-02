import { useGameStore } from '../store/useGameStore';
import { GAME_CONFIG } from '../config';

export const MetaUpgrades = () => {
  const { metaData, buyMetaUpgrade, unlockAbility, setView } = useGameStore();

  return (
    <div style={{
      width: '100vw', minHeight: '100vh', backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      color: 'white', fontFamily: 'sans-serif', padding: '40px',
      overflowY: 'auto'
    }}>
      <h2 style={{ fontSize: '32px', fontWeight: 900, marginBottom: '10px', textTransform: 'uppercase' }}>Meta-Progresión</h2>
      <p style={{ marginBottom: '40px' }}>Meta-XP Disponible: <strong style={{ color: '#fbbf24' }}>{metaData.metaXp}</strong></p>

      <h3 style={{ textTransform: 'uppercase', marginBottom: '20px', opacity: 0.6 }}>Mejoras Permanentes</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', width: '800px', marginBottom: '60px' }}>
        {Object.entries(metaData.upgrades).map(([key, level]) => {
          const cost = (GAME_CONFIG.META.COSTS as any)[key.toUpperCase()];
          return (
            <div key={key} style={{
              padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', border: '2px solid #334155',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{key}</span>
                <div style={{ fontSize: '12px', opacity: 0.7 }}>Nivel: {level} / 10</div>
              </div>
              <button
                onClick={() => buyMetaUpgrade(key as any)}
                disabled={metaData.metaXp < cost || level >= 10}
                style={{
                  padding: '10px 20px', backgroundColor: '#fbbf24', color: '#1e293b', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
                }}
              >
                {level >= 10 ? 'MAX' : `Mejorar (${cost})`}
              </button>
            </div>
          );
        })}
      </div>

      <h3 style={{ textTransform: 'uppercase', marginBottom: '20px', opacity: 0.6 }}>Desbloquear Habilidades</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', width: '800px', marginBottom: '40px' }}>
        {Object.entries(GAME_CONFIG.META.UNLOCKS).map(([key, cost]) => {
          const id = key.toLowerCase();
          const isUnlocked = metaData.unlockedAbilities.includes(id);
          const name = (GAME_CONFIG.ABILITIES as any)[key.toUpperCase()]?.NAME || key;

          return (
            <div key={key} style={{
              padding: '20px', backgroundColor: '#1e293b', borderRadius: '12px', border: '2px solid #334155',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{name}</span>
                <div style={{ fontSize: '12px', opacity: 0.7 }}>{isUnlocked ? 'DESBLOQUEADO' : 'BLOQUEADO'}</div>
              </div>
              {!isUnlocked && (
                <button
                  onClick={() => unlockAbility(id)}
                  disabled={metaData.metaXp < (cost as number)}
                  style={{
                    padding: '10px 20px', backgroundColor: '#22c55e', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  {cost} XP
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={() => setView('menu')} style={{ backgroundColor: 'transparent', color: 'white', border: 'none', cursor: 'pointer', marginBottom: '40px' }}>Volver</button>
    </div>
  );
};

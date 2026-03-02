import { useGameStore, UpgradeOption } from '../store/useGameStore';

export const LevelUpOverlay = () => {
  const { status, upgradeOptions, applyUpgrade } = useGameStore();

  if (status !== 'levelup') return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontFamily: 'sans-serif',
      zIndex: 100
    }}>
      <h1 style={{ marginBottom: '40px', fontSize: '48px', fontWeight: 900, textTransform: 'uppercase' }}>¡Nivel Alcanzado!</h1>
      <p style={{ marginBottom: '20px', fontSize: '18px', opacity: 0.8 }}>Elige una mejora para continuar:</p>

      <div style={{ display: 'flex', gap: '20px' }}>
        {upgradeOptions.map((upgrade, index) => (
          <button
            key={`${upgrade.type}-${index}`}
            onClick={() => applyUpgrade(upgrade)}
            style={{
              width: '200px',
              padding: '20px',
              backgroundColor: '#1cb0f6',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              transition: 'transform 0.1s',
              boxShadow: '0 8px 0 #1899d6'
            }}
            onMouseDown={(e) => (e.currentTarget.style.transform = 'translateY(4px)')}
            onMouseUp={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
          >
            <span style={{ fontWeight: 'bold', fontSize: '18px', marginBottom: '8px' }}>{upgrade.label}</span>
            <span style={{ fontSize: '14px', opacity: 0.9 }}>{upgrade.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

import { useGameStore } from '../store/useGameStore';

export const ShopOverlay = () => {
  const { status, coins, shopOptions, buyFromShop, setStatus } = useGameStore();

  if (status !== 'shop') return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.85)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontFamily: 'sans-serif',
      zIndex: 150
    }}>
      <h1 style={{ marginBottom: '10px', fontSize: '48px', fontWeight: 900, textTransform: 'uppercase', color: '#fbbf24' }}>💰 TIENDA 💰</h1>
      <p style={{ marginBottom: '30px', fontSize: '20px' }}>Monedas: <strong>{Math.floor(coins)}</strong></p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', marginBottom: '40px' }}>
        {shopOptions.map((item, index) => (
          <div
            key={`${item.type}-${index}`}
            style={{
              width: '300px',
              padding: '20px',
              backgroundColor: '#1e293b',
              borderRadius: '12px',
              border: '2px solid #334155',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center'
            }}
          >
            <span style={{ fontWeight: 'bold', fontSize: '20px', marginBottom: '5px' }}>{item.label}</span>
            <span style={{ fontSize: '14px', opacity: 0.8, marginBottom: '15px' }}>{item.description}</span>

            <button
              onClick={() => buyFromShop(item)}
              disabled={coins < (item.cost || 0)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: coins >= (item.cost || 0) ? '#22c55e' : '#475569',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: coins >= (item.cost || 0) ? 'pointer' : 'not-allowed',
                fontWeight: 'bold'
              }}
            >
              {item.cost} 💰
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => setStatus('playing')}
        style={{
          padding: '15px 60px',
          backgroundColor: '#ef4444',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '18px',
          textTransform: 'uppercase'
        }}
      >
        Continuar Run
      </button>
    </div>
  );
};

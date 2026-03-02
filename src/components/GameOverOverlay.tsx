import { useGameStore } from '../store/useGameStore';

export const GameOverOverlay = () => {
  const { status, kills, level, resetGame } = useGameStore();

  if (status !== 'gameover') return null;

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.9)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      color: 'white',
      fontFamily: 'sans-serif',
      zIndex: 200
    }}>
      <h1 style={{ marginBottom: '10px', fontSize: '64px', fontWeight: 900, textTransform: 'uppercase', color: '#ef4444' }}>FIN DEL JUEGO</h1>
      <p style={{ marginBottom: '40px', fontSize: '24px', opacity: 0.8 }}>Has caído en combate.</p>

      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <p style={{ margin: '5px 0' }}>Nivel Alcanzado: <strong>{level}</strong></p>
        <p style={{ margin: '5px 0' }}>Enemigos Derrotados: <strong>{kills}</strong></p>
      </div>

      <button
        onClick={resetGame}
        style={{
          padding: '15px 40px',
          backgroundColor: '#22c55e',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '20px',
          textTransform: 'uppercase',
          boxShadow: '0 8px 0 #16a34a'
        }}
      >
        Reintentar
      </button>
    </div>
  );
};

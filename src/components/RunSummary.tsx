import { useGameStore } from '../store/useGameStore';

export const RunSummary = () => {
  const { kills, level, bossesDefeated, coins, gameTime, metaData, resetGame } = useGameStore();

  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      color: 'white', fontFamily: 'sans-serif', zIndex: 300
    }}>
      <h1 style={{ fontSize: '48px', fontWeight: 900, marginBottom: '40px', textTransform: 'uppercase' }}>Run Completada</h1>

      <div style={{ width: '400px', backgroundColor: '#1e293b', padding: '30px', borderRadius: '16px', marginBottom: '40px', border: '2px solid #334155' }}>
        <div style={rowStyle}><span>Nivel Alcanzado:</span> <span>{level}</span></div>
        <div style={rowStyle}><span>Enemigos Batidos:</span> <span>{kills}</span></div>
        <div style={rowStyle}><span>Jefes Derrotados:</span> <span>{bossesDefeated}/2</span></div>
        <div style={rowStyle}><span>Monedas Run:</span> <span>{Math.floor(coins)}</span></div>
        <hr style={{ border: 'none', borderTop: '1px solid #334155', margin: '15px 0' }} />
        <div style={{...rowStyle, color: '#fbbf24', fontWeight: 'bold'}}>
          <span>Meta-XP Ganado:</span>
          <span>+{(level * 10) + kills + (bossesDefeated * 50)}</span>
        </div>
      </div>

      <button onClick={resetGame} style={{
        padding: '15px 60px', backgroundColor: '#1cb0f6', color: 'white', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer'
      }}>Menú Principal</button>
    </div>
  );
};

const rowStyle = { display: 'flex', justifyContent: 'space-between', marginBottom: '10px' };

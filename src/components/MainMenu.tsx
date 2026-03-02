import { useGameStore } from '../store/useGameStore';

export const MainMenu = () => {
  const { setView, metaData } = useGameStore();

  return (
    <div style={{
      width: '100vw', height: '100vh', backgroundColor: '#0f172a',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      color: 'white', fontFamily: 'sans-serif'
    }}>
      <h1 style={{ fontSize: '72px', fontWeight: 900, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '-0.05em' }}>RONIN SURVIVOR</h1>
      <p style={{ fontSize: '20px', opacity: 0.6, marginBottom: '60px' }}>ROGUE-LITE SURVIVAL ACTION</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', width: '300px' }}>
        <button onClick={() => setView('characters')} style={buttonStyle}>Nueva Run</button>
        <button onClick={() => setView('meta')} style={buttonStyle}>Meta-Progresión</button>
        <button style={buttonStyle} disabled>Opciones</button>
      </div>

      <div style={{ position: 'absolute', bottom: '40px', textAlign: 'center', opacity: 0.8 }}>
        <p>Meta-XP: <strong>{metaData.metaXp}</strong> | Runs: <strong>{metaData.totalRuns}</strong></p>
      </div>
    </div>
  );
};

const buttonStyle = {
  padding: '15px',
  backgroundColor: '#1cb0f6',
  color: 'white',
  border: 'none',
  borderRadius: '12px',
  fontSize: '18px',
  fontWeight: 'bold',
  cursor: 'pointer',
  textTransform: 'uppercase' as const,
  boxShadow: '0 6px 0 #1899d6'
};

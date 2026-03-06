export const TOKENS = {
  colors: {
    bg: '#0A0B10',          // Obsidiana base
    surface: '#16181D',     // Tarjetas y paneles
    surfaceLight: '#23262D',
    steel: '#95A5A6',       // Gris neutro
    steelLight: '#D5D8DC',
    gold: '#D4AF37',        // Dorado premium
    goldBright: '#F1C40F',  // Acento brillante
    crimson: '#922B21',     // Rojo Ronin
    crimsonLight: '#C0392B',
    white: '#ECF0F1',
    black: '#050505',
    overlay: 'rgba(0,0,0,0.85)',
    divider: 'rgba(255,255,255,0.08)'
  },
  animations: {
    base: { type: 'spring', stiffness: 300, damping: 30 },
    gentle: { type: 'spring', stiffness: 100, damping: 20 },
    fast: { duration: 0.2, ease: 'easeOut' }
  },
  shadows: {
    glow: '0 0 20px rgba(241, 196, 15, 0.2)',
    crimsonGlow: '0 0 20px rgba(146, 43, 33, 0.3)',
    heavy: '0 10px 30px rgba(0,0,0,0.5)'
  },
  radius: {
    sm: '4px',
    md: '12px',
    lg: '24px',
    full: '9999px'
  }
};

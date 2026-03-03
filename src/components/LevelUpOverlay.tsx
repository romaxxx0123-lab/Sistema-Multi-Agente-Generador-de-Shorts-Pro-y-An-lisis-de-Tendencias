import { motion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore';
import { UIButton } from './ui/UIButton';

/**
 * LEVEL UP OVERLAY
 * Pauses gameplay and presents 3 upgrade options.
 */

interface UpgradeOption {
    id: string;
    title: string;
    description: string;
    stats: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    icon: string;
    level: string;
}

const RARITY_COLORS = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F39C12'
};

const MOCK_OPTIONS: UpgradeOption[] = [
    {
        id: 'kunai',
        title: 'KUNAI ORBITAL',
        description: '3 kunais girando a tu alrededor',
        stats: 'Daño: 15',
        level: 'Nivel 1/5',
        rarity: 'rare',
        icon: '🔵'
    },
    {
        id: 'speed',
        title: '+15% VELOCIDAD',
        description: 'Muévete más rápido por la arena',
        stats: 'Actual: 5.0 m/s\nNuevo: 5.75 m/s',
        level: 'Mejora Pasiva',
        rarity: 'uncommon',
        icon: '🟢'
    },
    {
        id: 'flame',
        title: 'FLAME AURA',
        description: 'Aura de fuego que daña enemigos cercanos',
        stats: 'Radio: 3m\nDaño: 5/s',
        level: 'Nivel 1/5',
        rarity: 'epic',
        icon: '🔴'
    }
];

export function LevelUpOverlay() {
  const status = useGameStore((state) => state.status);
  const run = useGameStore((state) => state.run);
  const setStatus = useGameStore((state) => state.setStatus);

  if (status !== 'levelup') return null;

  const handleSelect = () => {
    setStatus('playing');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-[#34495E]/90 p-8 rounded-2xl border-4 border-[#F1C40F] w-[900px] h-[650px] relative overflow-hidden"
      >
        <div className="text-center mb-10">
            <motion.h2
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="text-4xl font-black text-[#F1C40F] uppercase tracking-tighter"
            >
                ✨ ¡NIVEL {run.level}! ✨
            </motion.h2>
            <p className="text-white/60 font-bold uppercase text-sm mt-1">Elige una mejora para tu Ronin</p>
        </div>

        <div className="flex justify-center gap-6">
            {MOCK_OPTIONS.map((opt, i) => (
                <motion.div
                    key={opt.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 * (i + 1), type: 'spring', damping: 15 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={handleSelect}
                    className="w-[240px] h-[350px] bg-black/40 rounded-xl p-5 border-4 cursor-pointer flex flex-col justify-between"
                    style={{ borderColor: RARITY_COLORS[opt.rarity] }}
                >
                    <div className="text-center">
                        <div className="text-5xl mb-4">{opt.icon}</div>
                        <h3 className="font-black text-white text-xl leading-none mb-1">{opt.title}</h3>
                        <p className="text-white/70 text-xs font-bold uppercase">{opt.rarity}</p>
                    </div>

                    <div className="flex-1 mt-4 space-y-2">
                        <p className="text-white/90 text-sm font-medium">{opt.description}</p>
                        <div className="bg-white/5 p-2 rounded text-[10px] text-white/50 whitespace-pre-wrap font-mono">
                            {opt.stats}
                        </div>
                    </div>

                    <div className="text-center mt-4">
                        <span className="text-[#F1C40F] text-xs font-black uppercase">{opt.level}</span>
                        <div className="mt-2 py-2 bg-white/10 rounded uppercase font-black text-white text-xs">
                            Elegir [{i+1}]
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>

        <div className="absolute bottom-8 right-8 flex gap-4">
            <UIButton variant="secondary" className="!min-w-[150px]">🔄 Reroll (2)</UIButton>
            <UIButton variant="ghost" className="!min-w-[100px] opacity-30 hover:opacity-100" onClick={handleSelect}>⏭️ Skip</UIButton>
        </div>

      </motion.div>
    </div>
  );
}

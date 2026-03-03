import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * END RUN OVERLAY (VICTORY/DEFEAT)
 * Displays detailed run results and rewards.
 */
export function EndRunOverlay() {
  const status = useGameStore((state) => state.status);
  const run = useGameStore((state) => state.run);
  const resetGame = useGameStore((state) => state.resetGame);
  const startRun = useGameStore((state) => state.startRun);

  if (status !== 'victory' && status !== 'gameover') return null;

  const isVictory = status === 'victory';

  // Format time
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const containerVariants = {
      initial: { scale: 0.8, opacity: 0 },
      animate: {
          scale: 1,
          opacity: 1,
          transition: { delay: 0.5, duration: 0.4 }
      }
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-10 backdrop-blur-xl ${isVictory ? 'bg-white/10' : 'bg-red-900/20'}`}>

      {/* Background Flash */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`absolute inset-0 ${isVictory ? 'bg-white' : 'bg-red-600'}`}
        transition={{ duration: 0.5 }}
      />

      <motion.div
        variants={containerVariants}
        initial="initial"
        animate="animate"
        className="relative bg-[#1a1a1a] p-10 rounded-2xl border-4 border-white/20 w-full max-w-2xl shadow-[0_0_100px_rgba(0,0,0,0.5)]"
      >
        <div className="text-center mb-10">
            <h2 className={`text-6xl font-black italic tracking-tighter ${isVictory ? 'text-[#F1C40F]' : 'text-[#E74C3C]'}`}>
                {isVictory ? '🏆 ¡VICTORIA! 🏆' : '☠️ CAÍSTE ☠️'}
            </h2>
            <p className="text-white/60 font-black uppercase tracking-widest mt-2">
                {isVictory ? 'Has derrotado al Emperador' : `Sobreviviste ${timeString} minutos`}
            </p>
        </div>

        <div className="bg-black/40 rounded-xl p-8 border-2 border-white/5 mb-10">
            <h3 className="text-white/40 font-black uppercase text-xs mb-4 tracking-widest">Estadísticas de la Run</h3>

            <div className="grid grid-cols-2 gap-y-4 text-white font-bold">
                <div className="flex items-center gap-3">
                    <span className="text-xl">⏱️</span>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none">Tiempo</span>
                        <span>{timeString}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xl">⚡</span>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none">Nivel Alcanzado</span>
                        <span>{run.level}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xl">💀</span>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none">Eliminaciones</span>
                        <span>{run.kills}</span>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xl">💰</span>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none">Monedas Ganadas</span>
                        <span>{run.coins}</span>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
                <h4 className="text-white/30 font-black uppercase text-[10px] mb-3 tracking-widest">Build Final</h4>
                <div className="flex gap-2 opacity-50 grayscale">
                    <div className="w-8 h-8 rounded bg-[#3498DB] flex items-center justify-center text-xs">🔵</div>
                    <div className="w-8 h-8 rounded bg-[#2ECC71] flex items-center justify-center text-xs">🟢</div>
                    <div className="w-8 h-8 rounded bg-[#E74C3C] flex items-center justify-center text-xs">🔴</div>
                </div>
            </div>
        </div>

        <div className="text-center mb-10">
            <div className="text-[#F1C40F] font-black text-xl flex items-center justify-center gap-2">
                ⭐ META-XP GANADO: +{isVictory ? 345 : 120}
            </div>
            <p className="text-white/30 text-xs font-bold uppercase mt-1">Total acumulado: 795</p>
        </div>

        <div className="flex justify-center gap-4">
            <UIButton onClick={startRun}>{isVictory ? '🔄 Nueva Run' : '🔄 Reintentar'}</UIButton>
            <UIButton variant="secondary" onClick={resetGame}>🏠 Menú Principal</UIButton>
        </div>

      </motion.div>
    </div>
  );
}

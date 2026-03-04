import { motion } from 'framer-motion';
import { Trophy, Skull, Timer, Zap, Sword, CircleDollarSign, Star, RotateCcw, Home } from 'lucide-react';
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
            <h2 className={`text-6xl font-black italic tracking-tighter flex flex-col items-center gap-4 ${isVictory ? 'text-[#F1C40F]' : 'text-[#E74C3C]'}`}>
                {isVictory ? <Trophy size={64} /> : <Skull size={64} />}
                {isVictory ? '¡VICTORIA!' : 'CAÍSTE'}
            </h2>
            <p className="text-white/60 font-black uppercase tracking-widest mt-4">
                {isVictory ? 'Has derrotado al Emperador' : `Sobreviviste ${timeString} minutos`}
            </p>
        </div>

        <div className="bg-black/40 rounded-xl p-8 border-2 border-white/5 mb-10">
            <h3 className="text-white/40 font-black uppercase text-xs mb-4 tracking-widest">Estadísticas de la Run</h3>

            <div className="grid grid-cols-2 gap-y-6 text-white font-bold">
                <div className="flex items-center gap-4">
                    <Timer className="text-white/20" size={24} />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none font-black tracking-widest">Tiempo</span>
                        <span className="text-xl font-black">{timeString}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Zap className="text-white/20" size={24} />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none font-black tracking-widest">Nivel Alcanzado</span>
                        <span className="text-xl font-black">{run.level}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <Sword className="text-white/20" size={24} />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none font-black tracking-widest">Eliminaciones</span>
                        <span className="text-xl font-black">{run.kills}</span>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <CircleDollarSign className="text-white/20" size={24} />
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-white/30 leading-none font-black tracking-widest">Monedas Ganadas</span>
                        <span className="text-xl font-black">{run.coins}</span>
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5">
                <h4 className="text-white/30 font-black uppercase text-[10px] mb-3 tracking-widest">Build Final</h4>
                <div className="flex gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#3498DB]/20 border border-[#3498DB]/40 flex items-center justify-center shadow-[0_0_10px_rgba(52,152,219,0.2)]" />
                    <div className="w-8 h-8 rounded-lg bg-[#2ECC71]/20 border border-[#2ECC71]/40 flex items-center justify-center shadow-[0_0_10px_rgba(46,204,113,0.2)]" />
                    <div className="w-8 h-8 rounded-lg bg-[#E74C3C]/20 border border-[#E74C3C]/40 flex items-center justify-center shadow-[0_0_10px_rgba(231,76,60,0.2)]" />
                </div>
            </div>
        </div>

        <div className="text-center mb-10">
            <div className="text-[#F1C40F] font-black text-xl flex items-center justify-center gap-3">
                <Star size={20} fill="#F1C40F" /> META-XP GANADO: +{isVictory ? 345 : 120}
            </div>
            <p className="text-white/30 text-xs font-bold uppercase mt-1">Total acumulado: {useGameStore.getState().metaXp}</p>
        </div>

        <div className="flex justify-center gap-4">
            <UIButton onClick={startRun} className="flex items-center justify-center gap-3">
                <RotateCcw size={18} /> {isVictory ? 'Nueva Run' : 'Reintentar'}
            </UIButton>
            <UIButton variant="secondary" onClick={resetGame} className="flex items-center justify-center gap-3">
                <Home size={18} /> Menú Principal
            </UIButton>
        </div>

      </motion.div>
    </div>
  );
}

import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * PAUSE OVERLAY
 * Pauses game simulation and provides options to resume or quit.
 */
export function PauseOverlay() {
  const status = useGameStore((state) => state.status);
  const run = useGameStore((state) => state.run);
  const setStatus = useGameStore((state) => state.setStatus);
  const resetGame = useGameStore((state) => state.resetGame);

  if (status !== 'paused') return null;

  // Format time
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-[#2C3E50]/95 p-10 rounded-2xl border-2 border-white/20 w-[400px] text-center shadow-2xl"
      >
        <h2 className="text-3xl font-black text-white uppercase italic mb-8 flex items-center justify-center gap-2">
            <span>⏸️</span> PAUSA
        </h2>

        <div className="flex flex-col gap-3 mb-10">
            <UIButton onClick={() => setStatus('playing')}>▶️ Continuar</UIButton>
            <UIButton variant="secondary">⚙️ Opciones</UIButton>
            <UIButton variant="secondary" onClick={resetGame}>🏠 Menú Principal</UIButton>
            <UIButton variant="danger">🚪 Salir</UIButton>
        </div>

        <div className="pt-6 border-t border-white/10 flex justify-between text-white/50 text-[10px] font-black uppercase tracking-widest">
            <div className="flex flex-col gap-1">
                <span>Tiempo</span>
                <span className="text-white text-sm">{timeString}</span>
            </div>
            <div className="flex flex-col gap-1">
                <span>Nivel</span>
                <span className="text-white text-sm">{run.level}</span>
            </div>
            <div className="flex flex-col gap-1">
                <span>Kills</span>
                <span className="text-white text-sm">{run.kills}</span>
            </div>
        </div>
      </motion.div>
    </div>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { Pause, Play, Settings, Home, LogOut, AlertTriangle } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { useState } from 'react';

/**
 * PRO PAUSE OVERLAY
 * Pauses game simulation and provides structured navigation.
 */
export function PauseOverlay() {
  const { status, run, setStatus, resetGame, setMenuScreen } = useGameStore();
  const [showConfirmQuit, setShowConfirmQuit] = useState(false);

  if (status !== 'paused') return null;

  // Format time
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const handleResume = () => setStatus('playing');

  const handleQuit = () => {
    resetGame();
    setShowConfirmQuit(false);
  };

  const handleSettings = () => {
      // In a real implementation, we might show settings overlay in-game
      // For now, let's keep it simple or allow going to menu settings
      setMenuScreen('settings');
      resetGame();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <AnimatePresence mode="wait">
          {!showConfirmQuit ? (
              <motion.div
                key="pause-main"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1A1A1A]/95 p-10 rounded-3xl border-2 border-white/10 w-[420px] text-center shadow-2xl relative overflow-hidden"
              >
                {/* Decorative background */}
                <div className="absolute top-0 left-0 w-full h-1 bg-cyan-500" />

                <h2 className="text-4xl font-black text-white uppercase italic mb-8 flex items-center justify-center gap-4 tracking-tighter">
                    <Pause size={32} className="text-cyan-500" /> EN PAUSA
                </h2>

                <div className="flex flex-col gap-3 mb-10">
                    <UIButton onClick={handleResume} className="!bg-cyan-600 !text-white flex items-center justify-center gap-3 !py-5 border-none">
                        <Play size={18} fill="currentColor" /> CONTINUAR
                    </UIButton>
                    <UIButton variant="secondary" onClick={handleSettings} className="flex items-center justify-center gap-3">
                        <Settings size={18} /> AJUSTES
                    </UIButton>
                    <div className="h-[1px] bg-white/5 my-2" />
                    <UIButton variant="danger" onClick={() => setShowConfirmQuit(true)} className="flex items-center justify-center gap-3">
                        <LogOut size={18} /> ABANDONAR RUN
                    </UIButton>
                </div>

                <div className="pt-6 border-t border-white/10 flex justify-between">
                    <StatBox label="Tiempo" value={timeString} />
                    <StatBox label="Nivel" value={run.level} />
                    <StatBox label="Bajas" value={run.kills} />
                </div>
              </motion.div>
          ) : (
              <motion.div
                key="confirm-quit"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#1A1A1A] p-10 rounded-3xl border-2 border-red-500/20 w-[400px] text-center shadow-2xl"
              >
                  <AlertTriangle size={48} className="mx-auto text-red-500 mb-6" />
                  <h3 className="text-2xl font-black text-white uppercase italic mb-2">¿ABANDONAR?</h3>
                  <p className="text-white/40 text-sm mb-8 uppercase font-bold tracking-tight">Perderás todo el progreso de esta run.</p>

                  <div className="flex flex-col gap-3">
                      <UIButton variant="danger" onClick={handleQuit} className="!py-4">SÍ, ABANDONAR</UIButton>
                      <UIButton variant="secondary" onClick={() => setShowConfirmQuit(false)} className="!py-4">CANCELAR</UIButton>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
}

function StatBox({ label, value }: any) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-[8px] font-black text-white/30 uppercase tracking-[0.2em]">{label}</span>
            <span className="text-white text-lg font-black italic">{value}</span>
        </div>
    );
}

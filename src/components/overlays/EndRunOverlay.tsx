import { motion } from 'framer-motion';
import { Trophy, Skull, Timer, Zap, Sword, CircleDollarSign, Star, RotateCcw, Home, ArrowRight } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * PRO END RUN OVERLAY (VICTORY/DEFEAT)
 * Displays results and provides direct path to meta-progression.
 */
export function EndRunOverlay() {
  const { status, run, resetGame, startRun, metaXp, setMenuScreen } = useGameStore();

  if (status !== 'victory' && status !== 'gameover') return null;

  const isVictory = status === 'victory';

  // Format time
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const xpGained = isVictory ? 500 : 150 + (run.goldRun * 2);

  const handleToTalents = () => {
      setMenuScreen('talents');
      resetGame();
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-10 backdrop-blur-xl ${isVictory ? 'bg-white/5' : 'bg-red-900/10'}`}>

      {/* Background Flash Effect */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`absolute inset-0 ${isVictory ? 'bg-white/10' : 'bg-red-600/10'}`}
        transition={{ duration: 0.5 }}
      />

      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative bg-[#0F0F0F] p-10 rounded-3xl border-2 border-white/10 w-full max-w-2xl shadow-[0_0_80px_rgba(0,0,0,0.8)] overflow-hidden"
      >
        {/* Glow header */}
        <div className={`absolute top-0 left-0 w-full h-1 ${isVictory ? 'bg-[#F1C40F]' : 'bg-[#E74C3C]'}`} />

        <div className="text-center mb-10">
            <h2 className={`text-6xl font-black italic tracking-tighter flex flex-col items-center gap-4 ${isVictory ? 'text-[#F1C40F]' : 'text-[#E74C3C]'}`}>
                {isVictory ? <Trophy size={64} /> : <Skull size={64} />}
                {isVictory ? 'MISIÓN CUMPLIDA' : 'RONIN CAÍDO'}
            </h2>
            <p className="text-white/40 font-black uppercase tracking-[0.4em] text-[10px] mt-4">
                Resultados del Combate Espiritual
            </p>
        </div>

        {/* Stats Grid */}
        <div className="bg-white/5 rounded-2xl p-8 border border-white/5 mb-8">
            <div className="grid grid-cols-2 gap-y-8">
                <StatResult icon={<Timer size={18} />} label="TIEMPO" value={timeString} />
                <StatResult icon={<Zap size={18} />} label="NIVEL" value={run.level} />
                <StatResult icon={<Sword size={18} />} label="BAJAS" value={run.kills} />
                <StatResult icon={<CircleDollarSign size={18} />} label="KOBANS" value={run.goldRun} />
            </div>
        </div>

        {/* Reward Section */}
        <div className="text-center mb-10 p-6 bg-[#F1C40F]/5 rounded-2xl border border-[#F1C40F]/10">
            <div className="text-[#F1C40F] font-black text-2xl flex items-center justify-center gap-3 italic">
                <Star size={24} fill="#F1C40F" /> +{xpGained} META-XP
            </div>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mt-2">TOTAL ACUMULADO: {metaXp + xpGained}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-4">
            <div className="flex gap-4">
                <UIButton onClick={startRun} className="flex-1 !py-5 flex items-center justify-center gap-3">
                    <RotateCcw size={18} /> {isVictory ? 'OTRA RUN' : 'REINTENTAR'}
                </UIButton>
                <UIButton variant="secondary" onClick={resetGame} className="flex-1 !py-5 flex items-center justify-center gap-3">
                    <Home size={18} /> HUB
                </UIButton>
            </div>
            <UIButton
                variant="ghost"
                onClick={handleToTalents}
                className="!py-4 flex items-center justify-center gap-3 text-cyan-400 hover:text-cyan-300 border border-cyan-400/20 rounded-2xl bg-cyan-400/5"
            >
                IR A TALENTOS PARA MEJORAR <ArrowRight size={18} />
            </UIButton>
        </div>

      </motion.div>
    </div>
  );
}

function StatResult({ icon, label, value }: any) {
    return (
        <div className="flex items-center gap-4">
            <div className="text-white/20">{icon}</div>
            <div className="flex flex-col">
                <span className="text-[9px] uppercase text-white/30 leading-none font-black tracking-widest mb-1">{label}</span>
                <span className="text-xl font-black text-white italic">{value}</span>
            </div>
        </div>
    );
}

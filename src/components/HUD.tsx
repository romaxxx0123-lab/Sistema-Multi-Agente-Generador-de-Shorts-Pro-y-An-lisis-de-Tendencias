import { useGameStore } from '../store/useGameStore';
import { UIProgressBar } from './ui/UIProgressBar';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * GAME HUD
 * Top-Left: Vital info (HP, XP, Coins)
 * Bottom-Right: Statistics (Kills, Timer)
 * Bottom-Left: Combat (Dash, Abilities)
 */
export function HUD() {
  const run = useGameStore((state) => state.run);
  const status = useGameStore((state) => state.status);

  if (status === 'paused' || status === 'levelup') return null;

  // Format time (MM:SS)
  const minutes = Math.floor(run.time / 60);
  const seconds = Math.floor(run.time % 60);
  const timeString = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  const timerColor = minutes < 5 ? '#FFFFFF' : (minutes < 10 ? '#F39C12' : '#E74C3C');

  return (
    <div className="fixed inset-0 pointer-events-none select-none p-8 font-mono">

      {/* TOP: XP Progress - Full Width Minimalist */}
      <div className="absolute top-0 left-0 right-0 p-1 flex justify-center">
          <UIProgressBar
            value={run.xp}
            max={run.xpToLevel}
            color="#F1C40F"
            height={6}
            width="80%"
          />
      </div>

      {/* TOP LEFT: Vital Info */}
      <div className="absolute top-8 left-8 space-y-4">
        {/* HP Bar */}
        <div className="space-y-1">
          <div className="flex justify-between items-end px-1">
             <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Vitality</span>
             <span className="text-xs font-bold text-white">{Math.round(run.hp)}%</span>
          </div>
          <UIProgressBar
            value={run.hp}
            max={run.maxHp}
            color={run.hp > run.maxHp * 0.5 ? '#2ECC71' : '#E74C3C'}
            height={8}
            width={220}
            pulse={run.hp < run.maxHp * 0.3}
          />
        </div>

        {/* Level & Coins */}
        <div className="flex gap-6 items-center">
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Rank</span>
                <span className="text-xl font-black italic text-white">LV.{run.level}</span>
            </div>
            <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Koban</span>
                <span className="text-xl font-black text-[#F1C40F]">× {run.coins}</span>
            </div>
        </div>
      </div>

      {/* BOTTOM RIGHT: Stats */}
      <div className="absolute bottom-12 right-12 text-right space-y-4">
        <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Execution</span>
            <span className="text-3xl font-black text-white italic">{run.kills}</span>
        </div>
        <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Time Elapsed</span>
            <span className="text-xl font-black font-mono tracking-tighter" style={{ color: timerColor }}>{timeString}</span>
        </div>
      </div>

      {/* BOTTOM LEFT: Abilities */}
      <div className="absolute bottom-12 left-12 space-y-6">
        {/* Dash Charges */}
        <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/40">Mobility</span>
            <div className="flex gap-3 items-center">
                {Array.from({ length: run.maxDashCharges }).map((_, i) => (
                    <motion.div
                      key={i}
                      initial={false}
                      animate={{
                        scale: i < run.dashCharges ? 1 : 0.8,
                        backgroundColor: i < run.dashCharges ? '#3498DB' : 'rgba(255,255,255,0.05)',
                        boxShadow: i < run.dashCharges ? '0 0 15px rgba(52, 152, 219, 0.4)' : 'none'
                      }}
                      className="w-10 h-2 rounded-full border border-white/10"
                    />
                ))}
            </div>
        </div>

        {/* Active Skills Placeholders */}
        <div className="flex gap-3">
            {[ '#3498DB', '#2ECC71', '#E74C3C' ].map((c, i) => (
                <div key={i} className="w-12 h-12 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center relative group">
                    <div className="w-8 h-8 rounded-full blur-[10px] opacity-20 absolute" style={{ backgroundColor: c }} />
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                </div>
            ))}
        </div>
      </div>

      {/* Damage Overlay Effect */}
      <AnimatePresence>
          {run.hp < run.maxHp * 0.3 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.3 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-[#E74C3C] pointer-events-none"
                style={{ mixBlendMode: 'overlay' }}
              />
          )}
      </AnimatePresence>

    </div>
  );
}

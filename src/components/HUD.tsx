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
    <div className="fixed inset-0 pointer-events-none select-none p-5 font-sans">

      {/* TOP LEFT: Vital Info */}
      <div className="absolute top-5 left-5 space-y-2">
        {/* HP Bar */}
        <div className="flex flex-col gap-1">
          <UIProgressBar
            value={run.hp}
            max={run.maxHp}
            color={run.hp > run.maxHp * 0.5 ? '#27AE60' : '#E74C3C'}
            showText
            text={`HP ${Math.round(run.hp)}/${run.maxHp}`}
            pulse={run.hp < run.maxHp * 0.3}
          />
        </div>

        {/* XP Bar & Level */}
        <div className="flex items-center gap-3">
          <UIProgressBar
            value={run.xp}
            max={run.xpToLevel}
            color="#F39C12"
            height={20}
            width={250}
          />
          <span className="text-white font-black text-2xl italic drop-shadow-lg">
            LV.{run.level}
          </span>
        </div>

        {/* Coins */}
        <div className="text-[#F1C40F] font-black text-xl flex items-center gap-2 drop-shadow-md">
           <span>💰</span> {run.coins}
        </div>
      </div>

      {/* BOTTOM RIGHT: Stats */}
      <div className="absolute bottom-12 right-12 text-right space-y-1">
        <div className="text-white font-black text-2xl drop-shadow-lg flex items-center justify-end gap-2">
           <span className="text-[#3498DB]">⚡</span> Kills: {run.kills}
        </div>
        <div className="text-2xl font-black drop-shadow-lg flex items-center justify-end gap-2" style={{ color: timerColor }}>
           <span>⏱️</span> {timeString}
        </div>
      </div>

      {/* BOTTOM LEFT: Abilities */}
      <div className="absolute bottom-10 left-10 space-y-4">
        {/* Dash Charges */}
        <div className="flex gap-2 items-center">
            {Array.from({ length: run.maxDashCharges }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-full border-2 border-black transition-colors ${i < run.dashCharges ? 'bg-[#3498DB]' : 'bg-[#7F8C8D]'}`}
                />
            ))}
            <span className="text-white font-black ml-2 uppercase text-sm">Dash Ready</span>
        </div>

        {/* Active Skills Placeholders */}
        <div className="flex gap-2">
            <div className="w-10 h-10 rounded-md bg-[#3498DB] border-2 border-black flex items-center justify-center text-white text-xl">🔵</div>
            <div className="w-10 h-10 rounded-md bg-[#2ECC71] border-2 border-black flex items-center justify-center text-white text-xl">🟢</div>
            <div className="w-10 h-10 rounded-md bg-[#E74C3C] border-2 border-black flex items-center justify-center text-white text-xl">🔴</div>
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

import { motion } from 'framer-motion';
import { useGameStore, SyncStatus } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { CharacterPreview } from './CharacterPreview';
import { useMemo } from 'react';
import { TOKENS } from '../../styles/tokens';
import {
  IconSoul,
  IconOban,
  IconSync,
  IconGear,
  IconKatana,
  IconScroll
} from '../ui/ronin-atlas';

/**
 * PREMIUM HERO HUB
 * Survivor.io quality, Ronin soul.
 */
export function HomeScreen() {
  const {
    metaXp, totalRuns, setMenuScreen, selectedCharacter,
    selectedChapterId, unlockedChapters, syncStatus, startRun
  } = useGameStore();

  // Derive progress
  const level = useMemo(() => Math.floor(metaXp / 1000) + 1, [metaXp]);
  const xpInLevel = metaXp % 1000;
  const xpPercent = (xpInLevel / 1000) * 100;

  // Chapter info
  const chapterName = selectedChapterId.replace('_', ' ').toUpperCase();
  const isHard = unlockedChapters.length > 2;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 md:p-10 pb-32 overflow-hidden font-sans select-none">

      {/* TOP BAR - Global Navigation & Status */}
      <div className="w-full flex justify-between items-start z-30">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
            <ResourceChip
                icon={<IconSoul size={14} color={TOKENS.colors.goldBright} />}
                value={metaXp}
                color={TOKENS.colors.goldBright}
                label="SOUL XP"
            />
            <ResourceChip
                icon={<IconOban size={14} color="#22D3EE" />}
                value={totalRuns}
                color="#22D3EE"
                label="RUNS"
            />
        </div>

        <div className="flex items-center gap-4">
            <SyncIndicator status={syncStatus} />
            <motion.button
                whileHover={{ rotate: 90, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setMenuScreen('settings')}
                className="p-3 bg-white/5 rounded-2xl border border-white/10 transition-colors backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1C40F]"
                aria-label="Settings"
            >
                <IconGear size={20} color="rgba(255,255,255,0.6)" />
            </motion.button>
        </div>
      </div>

      {/* CENTER - Dojo Altar */}
      <div className="absolute inset-0 z-10">
        <CharacterPreview characterId={selectedCharacter} />
      </div>

      {/* IDENTITY & PROGRESS (Bottom-Centerish) */}
      <div className="relative z-20 w-full flex flex-col items-center pointer-events-none mt-[20vh]">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-4"
          >
              <div className="bg-black/60 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 shadow-2xl flex items-center gap-4 pointer-events-auto">
                  <div className="flex flex-col items-center">
                      <span className="text-[10px] font-black tracking-[0.3em] text-white/40 uppercase">Rango</span>
                      <span className="text-2xl font-black text-white italic leading-none">Lv. {level}</span>
                  </div>
                  <div className="w-[1px] h-8 bg-white/10" />
                  <div className="w-48 h-2 bg-white/5 rounded-full overflow-hidden relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${xpPercent}%` }}
                        className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400"
                      />
                      <motion.div
                        animate={{ x: ['-100%', '200%'] }}
                        transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent w-20"
                      />
                  </div>
              </div>

              <div className="text-center">
                  <h2 className="text-6xl font-black italic text-white tracking-tighter uppercase drop-shadow-lg">
                      {selectedCharacter}
                  </h2>
                  <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold text-[10px] tracking-[0.4em] uppercase">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22D3EE]" />
                      DOJO SINCRONIZADO
                  </div>
              </div>
          </motion.div>
      </div>

      {/* BOTTOM ACTIONS (CTA) */}
      <div className="w-full max-w-md flex flex-col items-center gap-8 z-30">

        {/* Main CTA */}
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full flex flex-col items-center"
        >
            <div className="absolute -top-12 px-6 py-2 bg-black/80 backdrop-blur-md rounded-2xl border border-white/5 shadow-xl flex items-center gap-3">
                <IconScroll size={16} color="rgba(255,255,255,0.4)" />
                <div className="flex flex-col">
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Misión Actual</span>
                    <span className="text-xs font-black text-white italic">{chapterName}</span>
                </div>
                <div className="w-[1px] h-4 bg-white/10" />
                <span className={`text-[10px] font-bold ${isHard ? 'text-orange-500' : 'text-green-500'}`}>
                    {isHard ? 'DIFÍCIL' : 'NORMAL'}
                </span>
            </div>

            <UIButton
                onClick={startRun}
                className="!w-full !py-7 !text-2xl !bg-[#F1C40F] !text-black shadow-[0_15px_40px_-10px_rgba(241,196,15,0.4)] border-none relative group overflow-hidden"
            >
                <div className="relative z-10 flex items-center justify-center gap-4 font-black italic">
                    <IconKatana size={28} color="black" className="group-hover:rotate-12 transition-transform" />
                    JUGAR AHORA
                </div>
                {/* Shinobi Pulse */}
                <motion.div
                    animate={{ opacity: [0, 0.4, 0], scale: [1, 1.2, 1.4] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-white pointer-events-none"
                />
            </UIButton>
        </motion.div>
      </div>

    </div>
  );
}

interface ResourceChipProps {
  icon: React.ReactNode;
  value: number;
  color: string;
  label: string;
}

function ResourceChip({ icon, value, color, label }: ResourceChipProps) {
    return (
        <div className="group flex flex-col">
            <span className="text-[7px] font-black text-white/20 tracking-[0.3em] uppercase ml-2 mb-1">{label}</span>
            <div className="flex items-center gap-3 bg-black/60 backdrop-blur-xl px-4 py-2.5 rounded-2xl border border-white/5 shadow-xl hover:border-white/10 transition-colors">
                {icon}
                <span className="text-sm font-black text-white tracking-tight" style={{ color }}>{value.toLocaleString()}</span>
            </div>
        </div>
    );
}

function SyncIndicator({ status }: { status: SyncStatus }) {
    const config = {
        ok: { icon: <IconSync size={12} color="#4ADE80" />, label: 'Dojo Conectado' },
        syncing: { icon: <IconSync size={12} color="#FACC15" className="animate-spin" />, label: 'Guardando...' },
        offline: { icon: <IconSync size={12} color="rgba(255,255,255,0.2)" />, label: 'Sin Conexión' },
        error: { icon: <IconSync size={12} color="#F87171" />, label: 'Error Sync' },
    };
    const { icon, label } = config[status];
    return (
        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/5">
            {icon}
            <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">{label}</span>
        </div>
    );
}

interface NavTabProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}

function NavTab({ icon, label, onClick, active, disabled, className }: NavTabProps) {
    return (
        <motion.button
            whileHover={!disabled ? { y: -4 } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            onClick={onClick}
            disabled={disabled}
            className={`
                group flex flex-col items-center gap-2 px-2 py-4 rounded-2xl transition-all relative
                focus-visible:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F1C40F]/50
                ${active ? 'bg-white/10' : 'hover:bg-white/5'}
                ${disabled ? 'opacity-20 grayscale' : 'cursor-pointer'}
                ${className}
            `}
        >
            <div className={`transition-colors ${active ? 'text-[#F1C40F]' : 'text-white/40 group-hover:text-white/80'}`}>
                {icon}
            </div>
            <span className={`text-[8px] font-black tracking-widest uppercase transition-colors ${active ? 'text-white' : 'text-white/20 group-hover:text-white/40'}`}>
                {label}
            </span>
            {active && (
                <motion.div
                    layoutId="active-nav"
                    className="absolute inset-0 rounded-2xl border-b-2 border-[#F1C40F] pointer-events-none"
                />
            )}
        </motion.button>
    );
}

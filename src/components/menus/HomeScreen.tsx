import { motion } from 'framer-motion';
import { Play, Users, LayoutGrid, Award, BookOpen, Settings as SettingsIcon, Zap, Coins, Skull, Target } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { CharacterPreview } from './CharacterPreview';

/**
 * HUB HOME SCREEN
 * The main "Survivor-style" landing page.
 */
export function HomeScreen() {
  const { metaXp, totalRuns, setMenuScreen, selectedCharacter, run } = useGameStore();

  // Find character name (simplified for demo)
  const charName = selectedCharacter.toUpperCase();

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-between p-6 overflow-hidden">

      {/* TOP BAR - Resources */}
      <div className="w-full flex justify-between items-start z-20">
        <div className="flex gap-4">
            <ResourceItem icon={<Zap size={14} className="text-[#F1C40F]" />} label="META-XP" value={metaXp} color="#F1C40F" />
            <ResourceItem icon={<Target size={14} className="text-cyan-400" />} label="RUNS" value={totalRuns} color="#22D3EE" />
        </div>

        {/* Game Logo/Title */}
        <div className="absolute left-1/2 -translate-x-1/2 top-6 pointer-events-none">
            <h1 className="text-2xl font-black italic text-white tracking-tighter opacity-80">
                RONIN <span className="text-[#F1C40F]">SURVIVOR</span>
            </h1>
        </div>

        <motion.button
            whileHover={{ rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setMenuScreen('settings')}
            className="p-3 bg-white/5 rounded-full border border-white/10 hover:bg-white/10 transition-colors"
        >
            <SettingsIcon size={24} className="text-white/60" />
        </motion.button>
      </div>

      {/* CENTER - Character Preview & Info */}
      <div className="relative flex-1 w-full flex flex-col items-center justify-center">
        {/* Character Visual */}
        <div className="w-full h-[400px] mb-8 relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(52,152,219,0.1)_0%,transparent_70%)]" />
            <CharacterPreview characterId={selectedCharacter} />

            {/* Level/Rank Display */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 shadow-xl">
                <span className="text-[10px] font-black tracking-[0.3em] text-white/40 block text-center">CURRENT RANK</span>
                <span className="text-2xl font-black text-white italic">RONIN LEVEL 12</span>
            </div>
        </div>

        {/* Character Identity */}
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center z-10"
        >
            <h2 className="text-5xl font-black italic text-white tracking-tighter mb-1 uppercase">{charName}</h2>
            <div className="flex items-center justify-center gap-2 text-cyan-400 font-bold text-xs tracking-widest uppercase">
                <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                Sincronizado y Listo
            </div>
        </motion.div>
      </div>

      {/* BOTTOM - CTA & Navigation */}
      <div className="w-full max-w-4xl flex flex-col items-center gap-8 z-20 pb-10">

        {/* Main CTA */}
        <div className="relative group">
            <div className="absolute inset-0 bg-[#F1C40F]/20 blur-2xl group-hover:bg-[#F1C40F]/40 transition-all rounded-full" />
            <UIButton
                onClick={() => setMenuScreen('chapters')}
                className="!w-[400px] !py-6 !text-2xl !bg-[#F1C40F] !text-black shadow-[0_10px_40px_-10px_rgba(241,196,15,0.5)] border-none"
            >
                <div className="flex items-center justify-center gap-4">
                    <Play size={28} fill="currentColor" /> JUGAR
                </div>
            </UIButton>
        </div>

        {/* Quick Access Menu */}
        <div className="flex justify-center gap-4 w-full">
            <NavIconBtn icon={<BookOpen size={20} />} label="CAPÍTULOS" onClick={() => setMenuScreen('chapters')} />
            <NavIconBtn icon={<Users size={20} />} label="LOADOUT" onClick={() => setMenuScreen('loadout')} />
            <NavIconBtn icon={<Zap size={20} />} label="TALENTOS" onClick={() => setMenuScreen('talents')} />
            <NavIconBtn icon={<Award size={20} />} label="MISIONES" onClick={() => {}} disabled />
            <NavIconBtn icon={<LayoutGrid size={20} />} label="GALERÍA" onClick={() => setMenuScreen('gallery')} />
        </div>
      </div>

    </div>
  );
}

function ResourceItem({ icon, label, value, color }: any) {
    return (
        <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/5 shadow-lg">
            {icon}
            <div className="flex flex-col">
                <span className="text-[8px] font-black text-white/30 tracking-widest uppercase leading-none mb-1">{label}</span>
                <span className="text-sm font-black text-white leading-none" style={{ color }}>{value.toLocaleString()}</span>
            </div>
        </div>
    );
}

function NavIconBtn({ icon, label, onClick, disabled }: any) {
    return (
        <motion.button
            whileHover={!disabled ? { y: -5, backgroundColor: 'rgba(255,255,255,0.1)' } : {}}
            whileTap={!disabled ? { scale: 0.95 } : {}}
            onClick={onClick}
            disabled={disabled}
            className={`
                flex flex-col items-center gap-2 px-6 py-4 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-md transition-all
                ${disabled ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer hover:border-white/20'}
            `}
        >
            <div className="text-white/60 group-hover:text-white">{icon}</div>
            <span className="text-[9px] font-black text-white/40 tracking-widest uppercase">{label}</span>
        </motion.button>
    );
}

import { motion } from 'framer-motion';
import { Play, Users, LayoutGrid, Settings, LogOut } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * MAIN MENU SCREEN
 * Entry point with arcade buttons and metadata footer.
 */
export function MainMenu() {
  const metaXp = useGameStore((state) => state.metaXp);
  const totalRuns = useGameStore((state) => state.totalRuns);
  const startRun = useGameStore((state) => state.startRun);
  const setView = useGameStore((state) => state.setView);

  return (
    <div className="fixed inset-0 bg-[#111111] flex flex-col items-center justify-center p-10 overflow-hidden">

      {/* Background Decorative Elements */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-900 rounded-full blur-[100px]" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900 rounded-full blur-[100px]" />
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, letterSpacing: '0.5em' }}
        animate={{ opacity: 1, letterSpacing: '0.1em' }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
        className="relative mb-24 text-center"
      >
        <h1 className="text-6xl font-black italic text-white drop-shadow-2xl font-mono">
          RONIN <span className="text-[#F1C40F]">SURVIVOR</span>
        </h1>
        <div className="w-32 h-[1px] bg-white/20 mx-auto mt-6" />
      </motion.div>

      {/* Button List */}
      <div className="flex flex-col gap-4 z-10">
        <UIButton onClick={startRun} className="!w-[350px] flex items-center justify-center gap-3">
          <Play size={18} fill="currentColor" /> Nueva Run
        </UIButton>
        <UIButton onClick={() => setView('characters')} variant="secondary" className="!w-[350px] flex items-center justify-center gap-3">
          <Users size={18} /> Personajes
        </UIButton>
        <UIButton onClick={() => setView('gallery')} variant="secondary" className="!w-[350px] flex items-center justify-center gap-3">
          <LayoutGrid size={18} /> Galería Assets
        </UIButton>
        <UIButton variant="secondary" className="!w-[350px] flex items-center justify-center gap-3">
          <Settings size={18} /> Opciones
        </UIButton>
        <UIButton variant="danger" className="!w-[350px] flex items-center justify-center gap-3">
          <LogOut size={18} /> Salir
        </UIButton>
      </div>

      {/* Footer Metadata */}
      <div className="absolute bottom-10 w-full px-20 flex justify-between text-white/40 font-bold uppercase text-xs tracking-widest">
        <div>Meta-XP: <span className="text-[#F1C40F]">{metaXp}</span></div>
        <div>Runs Completadas: {totalRuns}</div>
        <div>Versión: 0.5.0-ALPHA</div>
      </div>

    </div>
  );
}

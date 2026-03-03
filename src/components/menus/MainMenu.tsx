import { motion } from 'framer-motion';
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
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative mb-20 text-center"
      >
        <h1 className="text-7xl font-black italic tracking-tighter text-white drop-shadow-2xl">
          ⚔️ <span className="bg-gradient-to-b from-[#F39C12] to-[#FFFFFF] bg-clip-text text-transparent">RONIN SURVIVOR</span> ⚔️
        </h1>
        <div className="w-full h-1 bg-[#F39C12] mt-2 scale-x-110" />
      </motion.div>

      {/* Button List */}
      <div className="flex flex-col gap-4 z-10">
        <UIButton onClick={startRun} className="!w-[350px]">▶️ Nueva Run</UIButton>
        <UIButton onClick={() => setView('characters')} variant="secondary" className="!w-[350px]">👤 Personajes</UIButton>
        <UIButton onClick={() => setView('gallery')} variant="secondary" className="!w-[350px]">🏛️ Galería Assets</UIButton>
        <UIButton variant="secondary" className="!w-[350px]">⚙️ Opciones</UIButton>
        <UIButton variant="danger" className="!w-[350px]">🚪 Salir</UIButton>
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

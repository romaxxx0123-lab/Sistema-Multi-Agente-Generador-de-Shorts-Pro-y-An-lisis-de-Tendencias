import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { CharacterPreview } from './CharacterPreview';
import { Heart, Sword, Zap, ChevronLeft, ChevronRight, ArrowLeft, Play } from 'lucide-react';
import { useState, useMemo } from 'react';

/**
 * CHARACTER SELECTOR SCREEN
 * Shows character stats and high-fidelity 3D previews.
 */

interface Character {
    id: string;
    name: string;
    title: string;
    hp: number;
    damage: number;
    speed: number;
    special: string;
}

const CHARACTERS: Character[] = [
    {
        id: 'ronin',
        name: 'RONIN',
        title: 'El Errante',
        hp: 100,
        damage: 100,
        speed: 100,
        special: '"Wanderer" - +10% XP de todas las fuentes',
    },
    {
        id: 'ninja',
        name: 'NINJA',
        title: 'Sombra Silenciosa',
        hp: 80,
        damage: 150,
        speed: 130,
        special: '"Swift Strike" - Mayor probabilidad de crítico',
    },
    {
        id: 'oni',
        name: 'ONI',
        title: 'Guardián del Templo',
        hp: 200,
        damage: 120,
        speed: 60,
        special: '"Iron Will" - Reduce el daño recibido un 15%',
    }
];

export function CharacterSelector() {
  const setView = useGameStore((state) => state.setView);
  const startRun = useGameStore((state) => state.startRun);
  const [index, setIndex] = useState(0);
  const character = useMemo(() => CHARACTERS[index], [index]);

  const nextCharacter = () => setIndex((prev) => (prev + 1) % CHARACTERS.length);
  const prevCharacter = () => setIndex((prev) => (prev - 1 + CHARACTERS.length) % CHARACTERS.length);

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center p-8 overflow-hidden">

      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.03)_0%,transparent_100%)] pointer-events-none" />

      {/* Header */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 mb-6 flex flex-col items-center"
      >
        <span className="text-[10px] uppercase font-black tracking-[0.5em] text-white/30 mb-2">Escuadrón de Almas</span>
        <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter flex items-center gap-4">
            ELIGE TU LEYENDA
        </h2>
      </motion.div>

      {/* Main Container */}
      <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 w-full max-w-7xl relative z-10">

        {/* Navigation - Left */}
        <div className="absolute left-10 hidden md:block">
            <UIButton variant="ghost" onClick={prevCharacter} className="!p-4 hover:scale-125 transition-transform">
                <ChevronLeft size={48} className="text-white/40 hover:text-white" />
            </UIButton>
        </div>

        {/* 3D Visual Section */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center relative">
            <AnimatePresence mode="wait">
                <motion.div
                    key={character.id}
                    initial={{ scale: 0.8, opacity: 0, x: -50 }}
                    animate={{ scale: 1, opacity: 1, x: 0 }}
                    exit={{ scale: 0.9, opacity: 0, x: 50 }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    className="w-full"
                >
                    <CharacterPreview characterId={character.id} />
                </motion.div>
            </AnimatePresence>

            {/* Visual Pedestal Name */}
            <div className="absolute bottom-10 text-center pointer-events-none">
                <h3 className="text-7xl font-black text-white/5 uppercase italic tracking-tighter select-none">
                    {character.name}
                </h3>
            </div>
        </div>

        {/* Stats Section */}
        <motion.div
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="w-full md:w-1/3 flex flex-col gap-6 bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl"
        >
            <div className="space-y-1">
                <h3 className="text-5xl font-black text-white uppercase italic">{character.name}</h3>
                <p className="text-cyan-400 font-bold italic uppercase tracking-widest text-sm">"{character.title}"</p>
            </div>

            <div className="space-y-6 mt-4">
                {/* HP BAR */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                            <Heart size={12} className="text-rose-500" /> Vitalidad
                        </span>
                        <span className="text-sm font-black text-white/80 tracking-tighter">{character.hp}</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(character.hp/200)*100}%` }}
                            className="h-full bg-rose-600 shadow-[0_0_10px_rgba(225,29,72,0.5)]"
                        />
                    </div>
                </div>

                {/* DAMAGE BAR */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                            <Sword size={12} className="text-orange-400" /> Potencia
                        </span>
                        <span className="text-sm font-black text-white/80 tracking-tighter">{character.damage}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${character.damage/1.5}%` }}
                            className="h-full bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                        />
                    </div>
                </div>

                {/* SPEED BAR */}
                <div className="space-y-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest flex items-center gap-2">
                            <Zap size={12} className="text-cyan-400" /> Agilidad
                        </span>
                        <span className="text-sm font-black text-white/80 tracking-tighter">{character.speed}%</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${character.speed/1.5}%` }}
                            className="h-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
                        />
                    </div>
                </div>
            </div>

            <div className="mt-6 pt-6 border-t border-white/5">
                <p className="text-[9px] text-white/20 uppercase font-black mb-2 tracking-widest">Habilidad Única</p>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 italic text-sm text-white/90 leading-relaxed">
                    {character.special}
                </div>
            </div>
        </motion.div>

        {/* Navigation - Right */}
        <div className="absolute right-10 hidden md:block">
            <UIButton variant="ghost" onClick={nextCharacter} className="!p-4 hover:scale-125 transition-transform">
                <ChevronRight size={48} className="text-white/40 hover:text-white" />
            </UIButton>
        </div>
      </div>

      {/* Bottom Actions */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="mt-8 flex gap-6 relative z-10"
      >
        <UIButton variant="secondary" onClick={() => setView('menu')} className="flex items-center gap-2 px-8">
            <ArrowLeft size={18} /> Volver
        </UIButton>
        <UIButton onClick={startRun} className="flex items-center gap-3 px-10 bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_20px_rgba(8,145,178,0.3)]">
            <Play size={18} fill="currentColor" /> SELECCIONAR
        </UIButton>
      </motion.div>

    </div>
  );
}

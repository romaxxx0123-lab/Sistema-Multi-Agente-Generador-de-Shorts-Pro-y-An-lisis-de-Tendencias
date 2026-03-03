import { motion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * CHARACTER SELECTOR SCREEN
 * Shows character stats and 3D previews.
 */

interface Character {
    id: string;
    name: string;
    title: string;
    hp: number;
    damage: number;
    speed: number;
    special: string;
    icon: string;
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
        icon: '🥷'
    },
    {
        id: 'samurai',
        name: 'SAMURAI',
        title: 'Guardián del Templo',
        hp: 150,
        damage: 120,
        speed: 80,
        special: '"Iron Will" - Reduce el daño recibido un 15%',
        icon: '🛡️'
    }
];

export function CharacterSelector() {
  const setView = useGameStore((state) => state.setView);
  const startRun = useGameStore((state) => state.startRun);

  return (
    <div className="fixed inset-0 bg-[#111111] flex flex-col items-center p-10 overflow-hidden">

      <div className="mb-10 text-center">
        <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter">
            👤 Elige tu Personaje
        </h2>
      </div>

      <div className="flex-1 flex items-center justify-center gap-20 w-full max-w-6xl">
        {/* Previous Button Placeholder */}
        <UIButton variant="ghost" className="!min-w-[50px] text-4xl">◀️</UIButton>

        {/* Selected Character Preview */}
        <div className="flex flex-col items-center">
            <motion.div
                animate={{ rotateY: 360 }}
                transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
                className="w-64 h-64 bg-white/5 rounded-full flex items-center justify-center text-[120px] shadow-[0_0_50px_rgba(243,156,18,0.2)] mb-8"
            >
                {CHARACTERS[0].icon}
            </motion.div>

            <h3 className="text-5xl font-black text-white">{CHARACTERS[0].name}</h3>
            <p className="text-[#F1C40F] font-bold italic uppercase tracking-widest">"{CHARACTERS[0].title}"</p>

            <div className="mt-10 w-[400px] bg-black/40 p-6 rounded-xl border-2 border-white/10 space-y-4">
                <div className="space-y-1">
                    <div className="flex justify-between text-xs font-black text-white/60 uppercase">
                        <span>❤️ HP</span>
                        <span>{CHARACTERS[0].hp}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-red-600" style={{ width: `${(CHARACTERS[0].hp/200)*100}%` }} />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs font-black text-white/60 uppercase">
                        <span>⚔️ Daño</span>
                        <span>{CHARACTERS[0].damage}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500" style={{ width: `${CHARACTERS[0].damage}%` }} />
                    </div>
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between text-xs font-black text-white/60 uppercase">
                        <span>🏃 Velocidad</span>
                        <span>{CHARACTERS[0].speed}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${CHARACTERS[0].speed}%` }} />
                    </div>
                </div>

                <div className="pt-4 border-t border-white/5">
                    <p className="text-center text-[10px] text-white/40 uppercase font-black mb-1">Habilidad Especial</p>
                    <p className="text-center text-xs text-white/90 font-medium italic">{CHARACTERS[0].special}</p>
                </div>
            </div>
        </div>

        {/* Next Button Placeholder */}
        <UIButton variant="ghost" className="!min-w-[50px] text-4xl">▶️</UIButton>
      </div>

      <div className="mt-10 flex gap-4">
        <UIButton variant="secondary" onClick={() => setView('menu')}>Volver</UIButton>
        <UIButton onClick={startRun}>Seleccionar</UIButton>
      </div>

    </div>
  );
}

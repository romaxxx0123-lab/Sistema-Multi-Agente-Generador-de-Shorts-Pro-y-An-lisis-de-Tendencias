import { useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RotateCcw, FastForward } from 'lucide-react';
import { useGameStore } from '../store/useGameStore';
import { UIButton } from './ui/UIButton';
import { ABILITY_METADATA } from '../data/abilities';
import { AbilityType, PassiveType } from '../types/abilities';
import { TUNING } from '../data/tuning';

/**
 * LEVEL UP OVERLAY
 * Pauses gameplay and presents 3 upgrade options.
 * Improved with rarity gradients, glow effects, and keyboard shortcuts.
 */

interface DisplayUpgrade {
    id: AbilityType | PassiveType;
    type: 'skill' | 'passive';
    title: string;
    description: string;
    stats: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    icon: React.ReactNode;
    levelInfo: string;
    isNew: boolean;
}

const RARITY_COLORS: Record<string, string> = {
    common: '#95A5A6',
    uncommon: '#2ECC71',
    rare: '#3498DB',
    epic: '#9B59B6',
    legendary: '#F39C12'
};

const RARITY_GRADIENTS: Record<string, string> = {
    common: 'linear-gradient(180deg, rgba(149, 165, 166, 0.1) 0%, rgba(149, 165, 166, 0.05) 100%)',
    uncommon: 'linear-gradient(180deg, rgba(46, 204, 113, 0.15) 0%, rgba(46, 204, 113, 0.05) 100%)',
    rare: 'linear-gradient(180deg, rgba(52, 152, 219, 0.15) 0%, rgba(52, 152, 219, 0.05) 100%)',
    epic: 'linear-gradient(180deg, rgba(155, 89, 182, 0.2) 0%, rgba(155, 89, 182, 0.05) 100%)',
    legendary: 'linear-gradient(180deg, rgba(243, 156, 18, 0.25) 0%, rgba(243, 156, 18, 0.05) 100%)'
};

export function LevelUpOverlay() {
  const status = useGameStore((state) => state.status);
  const run = useGameStore((state) => state.run);
  const setStatus = useGameStore((state) => state.setStatus);
  const runGold = useGameStore((state) => state.run.goldRun);
  const addCoin = useGameStore((state) => state.addCoin);
  const popPendingOverlay = useGameStore((state) => state.popPendingOverlay);
  const abilities = useGameStore((state) => state.abilities);
  const passives = useGameStore((state) => state.passives);
  const upgradeAbility = useGameStore((state) => state.upgradeAbility);

  const [options, setOptions] = useState<DisplayUpgrade[]>([]);
  const [rerollCount, setRerollCount] = useState(0);

  const generateOptions = useCallback(() => {
        // Build Pool
        const skills: AbilityType[] = ['orbital', 'lightning', 'aura', 'barrage', 'iai_slash'];
        const passList: PassiveType[] = ['damage', 'cdr', 'movespeed', 'magnet', 'maxhp', 'gold', 'crit'];

        // Filter out maxed
        const availableSkills = skills.filter(s => (abilities.get(s)?.level || 0) < 8);
        const availablePassives = passList.filter(p => (passives.get(p) || 0) < 5);

        // Early game bias: if < 2 skills, force more skill options
        const skillCount = abilities.size;
        let selected: { id: string, type: 'skill' | 'passive' }[] = [];

        const weightTable = TUNING.LEVEL_UP.WEIGHTS;

        const getRandomId = (list: string[]) => list[Math.floor(Math.random() * list.length)];

        while (selected.length < 3 && (availableSkills.length > 0 || availablePassives.length > 0)) {
            const isSkill = Math.random() < (skillCount < 2 ? 0.7 : 0.4);
            let choiceId: string;
            let choiceType: 'skill' | 'passive';

            if (isSkill && availableSkills.length > 0) {
                choiceId = getRandomId(availableSkills);
                choiceType = 'skill';
            } else if (availablePassives.length > 0) {
                choiceId = getRandomId(availablePassives);
                choiceType = 'passive';
            } else {
                choiceId = getRandomId(availableSkills);
                choiceType = 'skill';
            }

            if (!selected.find(s => s.id === choiceId)) {
                selected.push({ id: choiceId, type: choiceType });
            }
        }

        const displayOptions: DisplayUpgrade[] = selected.map(opt => {
            const meta = ABILITY_METADATA[opt.id];
            const currentLevel = opt.type === 'skill' ? (abilities.get(opt.id as AbilityType)?.level || 0) : (passives.get(opt.id as PassiveType) || 0);
            const nextLevel = currentLevel + 1;

            return {
                id: opt.id as any,
                type: opt.type,
                title: meta.title,
                description: meta.description,
                stats: meta.upgrades[nextLevel - 1] || 'Mejora de estadísticas',
                rarity: meta.rarity as any,
                icon: meta.icon,
                levelInfo: currentLevel > 0 ? `Nivel ${currentLevel}/${opt.type === 'skill' ? 8 : 5}` : 'NUEVO',
                isNew: currentLevel === 0
            };
        });

        setOptions(displayOptions);
  }, [abilities, passives]);

  // Generate initial options
  useEffect(() => {
    if (status === 'levelup') {
        generateOptions();
        setRerollCount(0);
    }
  }, [status, generateOptions]);

  const handleSelect = useCallback((id: AbilityType | PassiveType, type: 'skill' | 'passive') => {
    upgradeAbility(id, type);
  }, [upgradeAbility]);

  const handleReroll = () => {
      const cost = rerollCount === 0 ? 0 : TUNING.LEVEL_UP.REROLL_COST;
      if (runGold >= cost) {
          addCoin(-cost);
          generateOptions();
          setRerollCount(prev => prev + 1);
      }
  };

  // Keyboard shortcuts (1, 2, 3)
  useEffect(() => {
    if (status !== 'levelup' || options.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1') handleSelect(options[0].id, options[0].type);
      if (e.key === '2' && options[1]) handleSelect(options[1].id, options[1].type);
      if (e.key === '3' && options[2]) handleSelect(options[2].id, options[2].type);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, options, handleSelect]);

  if (status !== 'levelup') return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 50, opacity: 0 }}
        className="bg-[#1A1A1A]/90 p-10 rounded-3xl border-2 border-white/10 w-[1000px] h-[700px] relative overflow-hidden shadow-2xl"
      >
        {/* Background glow effect */}
        <div className="absolute top-[-200px] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#F1C40F]/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="text-center mb-12 relative">
            <motion.h2
                animate={{ y: [0, -5, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="text-5xl font-black text-[#F1C40F] uppercase tracking-tighter flex items-center justify-center gap-6"
            >
                <Sparkles size={48} className="text-[#F1C40F]" />
                NIVEL {run.level} ALCANZADO
                <Sparkles size={48} className="text-[#F1C40F]" />
            </motion.h2>
            <p className="text-white/40 font-bold uppercase tracking-[0.3em] text-xs mt-3">Sincronización de Habilidades Completa</p>
        </div>

        <div className="flex justify-center gap-8 px-4">
            <AnimatePresence mode="wait">
                {options.map((opt: DisplayUpgrade, i: number) => (
                    <motion.div
                        key={opt.id}
                        initial={{ y: 40, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.15 * i, type: 'spring', stiffness: 100 }}
                        whileHover={{
                            y: -10,
                            boxShadow: `0 20px 40px -10px ${RARITY_COLORS[opt.rarity]}33`,
                            borderColor: RARITY_COLORS[opt.rarity]
                        }}
                        onClick={() => handleSelect(opt.id, opt.type)}
                        className="w-[280px] h-[400px] bg-white/[0.03] rounded-2xl p-6 border-2 border-white/10 cursor-pointer flex flex-col justify-between group relative overflow-hidden transition-colors"
                        style={{
                            background: RARITY_GRADIENTS[opt.rarity]
                        }}
                    >
                        {/* Animated Shimmer for high rarity */}
                        {(opt.rarity === 'epic' || opt.rarity === 'legendary') && (
                            <motion.div
                                animate={{ x: ['-200%', '200%'] }}
                                transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none -rotate-45"
                            />
                        )}
                        {/* Rarity Tag */}
                        <div className="absolute top-4 right-4 flex items-center gap-2">
                             {opt.isNew && (
                                <span className="bg-[#F1C40F] text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow-[0_0_10px_#F1C40F66]">
                                    NUEVO!
                                </span>
                             )}
                            <div className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full border border-current opacity-50" style={{ color: RARITY_COLORS[opt.rarity] }}>
                                {opt.rarity}
                            </div>
                        </div>

                        <div className="text-center">
                            <motion.div
                                whileHover={{ rotate: 10, scale: 1.1 }}
                                className="text-6xl mb-6 flex justify-center py-6 drop-shadow-lg"
                            >
                                {opt.icon}
                            </motion.div>
                            <h3 className="font-black text-white text-2xl leading-tight mb-1 group-hover:text-[#F1C40F] transition-colors uppercase italic">{opt.title}</h3>
                        </div>

                        <div className="flex-1 mt-6 space-y-4">
                            <p className="text-white/80 text-sm font-medium leading-relaxed">{opt.description}</p>
                            <div className="bg-black/40 p-3 rounded-lg text-[11px] text-[#2ECC71] whitespace-pre-wrap font-mono border border-white/5">
                                {opt.stats}
                            </div>
                        </div>

                        <div className="text-center mt-6">
                            <span className="text-[#F1C40F] text-[10px] font-black uppercase tracking-widest">{opt.levelInfo}</span>
                            <div className="mt-3 py-3 bg-white/5 group-hover:bg-[#F1C40F] rounded-xl uppercase font-black text-white group-hover:text-black text-xs transition-all border border-white/10 group-hover:border-transparent">
                                ELEGIR [{i+1}]
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>

        <div className="absolute bottom-10 left-0 right-0 flex justify-center gap-6">
            <UIButton
                variant="secondary"
                onClick={handleReroll}
                disabled={runGold < (rerollCount === 0 ? 0 : TUNING.LEVEL_UP.REROLL_COST)}
                className="!min-w-[200px] !py-3 flex items-center justify-center gap-3 !text-xs border-white/5 hover:border-[#F1C40F]/30"
            >
                <RotateCcw size={14} /> {rerollCount === 0 ? 'REROLL GRATIS' : `REROLL (${TUNING.LEVEL_UP.REROLL_COST} KOBAN)`}
            </UIButton>
            <UIButton variant="ghost" className="!min-w-[140px] !py-3 opacity-20 hover:opacity-100 flex items-center justify-center gap-3 !text-xs transition-opacity" onClick={() => popPendingOverlay()}>
                <FastForward size={14} /> OMITIR MEJORA
            </UIButton>
        </div>

      </motion.div>
    </div>
  );
}

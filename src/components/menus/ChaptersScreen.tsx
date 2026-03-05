import { motion } from 'framer-motion';
import { ChevronLeft, Lock, Trophy, Play, Star } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

const CHAPTERS = [
  {
    id: 'chapter_1',
    title: 'VALLE DE LAS SOMBRAS',
    description: 'Enfréntate a los primeros guardianes en el bosque ancestral.',
    reward: '500 XP',
    difficulty: 'Normal',
    color: '#2ECC71'
  },
  {
    id: 'chapter_2',
    title: 'TEMPLO DEL TRUENO',
    description: 'Domina las tormentas mientras hordas de ninjas te acechan.',
    reward: '1200 XP',
    difficulty: 'Difícil',
    color: '#3498DB'
  },
  {
    id: 'chapter_3',
    title: 'FORJA DE FUEGO',
    description: 'El volcán ruge. Solo los más fuertes sobrevivirán al calor.',
    reward: '2500 XP',
    difficulty: 'Élite',
    color: '#E67E22'
  }
];

export function ChaptersScreen() {
  const { unlockedChapters, selectedChapterId, selectChapter, goBack, startRun } = useGameStore();

  return (
    <div className="w-full h-full flex flex-col p-10">

      {/* Header */}
      <div className="flex justify-between items-center mb-12">
        <div className="flex items-center gap-6">
            <motion.button
                whileHover={{ x: -5 }}
                onClick={goBack}
                className="p-3 bg-white/5 rounded-full border border-white/10"
            >
                <ChevronLeft size={24} />
            </motion.button>
            <h2 className="text-4xl font-black italic text-white uppercase tracking-tighter">CAPÍTULOS</h2>
        </div>
        <div className="flex items-center gap-3 text-white/40 font-bold uppercase text-[10px] tracking-widest">
            Progreso: {unlockedChapters.length} / {CHAPTERS.length}
        </div>
      </div>

      {/* Chapter List */}
      <div className="flex-1 flex gap-6 overflow-x-auto pb-8 snap-x">
          {CHAPTERS.map((chap) => {
              const isLocked = !unlockedChapters.includes(chap.id);
              const isSelected = selectedChapterId === chap.id;

              return (
                  <motion.div
                    key={chap.id}
                    whileHover={!isLocked ? { y: -10 } : {}}
                    onClick={() => !isLocked && selectChapter(chap.id)}
                    className={`
                        min-w-[320px] h-[450px] rounded-3xl p-8 flex flex-col justify-between transition-all snap-center cursor-pointer
                        ${isLocked ? 'bg-black/40 grayscale border border-white/5' : (isSelected ? 'bg-white/10 border-2 border-white/30 shadow-2xl' : 'bg-white/5 border border-white/10 hover:border-white/20')}
                    `}
                  >
                      <div>
                          <div className="flex justify-between items-start mb-6">
                              <div className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-white/5 rounded-full border border-white/10" style={{ color: isLocked ? 'inherit' : chap.color }}>
                                  {chap.difficulty}
                              </div>
                              {isLocked ? <Lock size={20} className="text-white/20" /> : (isSelected && <Trophy size={20} className="text-[#F1C40F]" />)}
                          </div>

                          <h3 className={`text-2xl font-black italic mb-2 ${isLocked ? 'text-white/20' : 'text-white'}`}>{chap.title}</h3>
                          <p className={`text-sm font-medium leading-relaxed ${isLocked ? 'text-white/10' : 'text-white/60'}`}>{chap.description}</p>
                      </div>

                      <div className="space-y-4">
                          <div className="flex items-center gap-3 text-white/40 text-[10px] font-black uppercase tracking-widest">
                              <Star size={12} className="text-[#F1C40F]" /> Recompensa: <span className="text-white/80">{chap.reward}</span>
                          </div>

                          <UIButton
                            disabled={isLocked}
                            onClick={(e: any) => {
                                e.stopPropagation();
                                selectChapter(chap.id);
                                startRun();
                            }}
                            className={`!min-w-0 !w-full !py-3 !text-sm ${isSelected ? '!bg-white !text-black' : '!bg-white/5 !text-white'}`}
                          >
                              {isSelected ? 'INICIAR' : 'SELECCIONAR'}
                          </UIButton>
                      </div>
                  </motion.div>
              );
          })}
      </div>

      {/* Footer Info */}
      <div className="mt-8 text-center">
          <p className="text-white/20 font-black uppercase text-[10px] tracking-widest animate-pulse">
              Completa un capítulo para desbloquear el siguiente desafío
          </p>
      </div>

    </div>
  );
}

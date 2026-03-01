import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { UnitSection } from './components/UnitSection';
import { LessonScreen } from './components/LessonScreen';
import { SECTIONS } from './data/course';
import { useStore } from './store/useStore';
import { Heart, Trophy, Zap, Flame, ChevronDown, ListChecks } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const activeLesson = useStore(state => state.activeLesson);
  const hearts = useStore(state => state.hearts);
  const xp = useStore(state => state.xp);
  const streak = useStore(state => state.streak);

  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [showSectionSelector, setShowSectionSelector] = useState(false);

  useEffect(() => {
    // Sync currentSectionIndex with scroll position if needed
  }, []);

  if (activeLesson) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[#f0f0f0] opacity-30"
             style={{
               backgroundImage: 'linear-gradient(#ccc 1px, transparent 1px), linear-gradient(90deg, #ccc 1px, transparent 1px)',
               backgroundSize: '40px 40px',
               transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-100px)',
               transformOrigin: 'top'
             }}
        />
        <LessonScreen />
      </div>
    );
  }

  const currentSection = SECTIONS[currentSectionIndex];

  return (
    <div className="min-h-screen bg-white font-['DIN_Next_Rounded_OT']">
      <Sidebar />

      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b-2 border-duo-gray-light z-40 flex items-center justify-between px-6 md:left-64">
        <div className="flex items-center gap-2 md:gap-4">
          <button
            onClick={() => setShowSectionSelector(!showSectionSelector)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-duo-gray-light transition-colors group"
          >
            <span className="font-black text-duo-gray-dark text-sm uppercase tracking-wider">
              {currentSection.title.split(':')[0]}
            </span>
            <ChevronDown size={18} className={`text-duo-gray transition-transform ${showSectionSelector ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-4 md:gap-6">
          <div className="flex items-center gap-1.5 font-bold text-duo-orange">
            <Flame size={22} fill="currentColor" />
            <span>{streak}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-duo-blue">
            <Zap size={22} fill="currentColor" />
            <span>{xp}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-duo-red">
            <Heart size={22} fill="currentColor" />
            <span>{hearts}</span>
          </div>
          <div className="flex items-center gap-1.5 font-bold text-duo-yellow">
            <Trophy size={22} fill="currentColor" />
            <span>500</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-duo-purple flex items-center justify-center text-white font-bold border-2 border-white shadow-sm shrink-0">
            J
          </div>
        </div>
      </header>

      <AnimatePresence>
        {showSectionSelector && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSectionSelector(false)}
              className="fixed inset-0 bg-black/20 z-40 md:left-64"
            />
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="fixed top-16 left-0 right-0 bg-white border-b-2 border-duo-gray-light z-40 shadow-xl md:left-64 p-4"
            >
              <div className="max-w-xl mx-auto grid gap-2">
                {SECTIONS.map((section, idx) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setCurrentSectionIndex(idx);
                      setShowSectionSelector(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`
                      flex items-center justify-between p-4 rounded-2xl border-2 transition-all
                      ${idx === currentSectionIndex
                        ? 'border-duo-blue bg-duo-blue/5 text-duo-blue'
                        : 'border-duo-gray-light hover:border-duo-gray text-duo-gray-dark'}
                    `}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${idx === currentSectionIndex ? 'bg-duo-blue text-white' : 'bg-duo-gray-light'}`}>
                        <ListChecks size={20} />
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-black uppercase opacity-60">Sección {idx + 1}</div>
                        <div className="font-bold">{section.title}</div>
                      </div>
                    </div>
                    {idx === currentSectionIndex && (
                       <div className="w-2 h-2 rounded-full bg-duo-blue shadow-[0_0_8px_rgba(28,176,246,0.6)]" />
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="pt-24 pb-20 px-4 md:ml-64 min-h-screen">
        <div className="max-w-2xl mx-auto relative">
          <motion.div
            key={currentSection.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
          >
             {currentSection.units.map((unit) => (
                <UnitSection key={unit.id} unit={unit} />
             ))}
          </motion.div>

          {/* Infinite-like scroll footer */}
          <div className="py-20 flex flex-col items-center opacity-20 pointer-events-none">
             <div className="w-1 h-20 bg-gradient-to-b from-duo-gray to-transparent rounded-full" />
             <Trophy size={48} className="mt-4 text-duo-gray" />
             <p className="mt-4 font-bold text-duo-gray uppercase tracking-widest">Fin de la sección</p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;

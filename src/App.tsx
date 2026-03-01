import React from 'react';
import { Sidebar } from './components/Sidebar';
import { UnitSection } from './components/UnitSection';
import { LessonScreen } from './components/LessonScreen';
import { SECTIONS } from './data/course';
import { useStore } from './store/useStore';
import { Heart, Trophy, Zap, ChevronLeft, ChevronRight, Flame } from 'lucide-react';

function App() {
  const activeLesson = useStore(state => state.activeLesson);
  const hearts = useStore(state => state.hearts);
  const xp = useStore(state => state.xp);
  const streak = useStore(state => state.streak);
  const [currentSectionIndex, setCurrentSectionIndex] = React.useState(0);

  // Licenses: 0, B, A, S
  const licenses = ['ETAPA 0', 'LICENCIA B', 'LICENCIA A', 'LICENCIA S-PRO'];
  const currentLicense = licenses[currentSectionIndex] || 'LICENCIA PRO';

  if (activeLesson) {
    return (
      <div className="fixed inset-0 overflow-hidden">
        {/* Retro Grid Background for Lessons */}
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

  return (
    <div className="min-h-screen bg-white font-['DIN_Next_Rounded_OT']">
      <Sidebar />

      {/* Top Header for Mobile & Stats */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b-2 border-duo-gray-light z-40 flex items-center justify-between px-6 md:left-64">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-duo-orange">
            <Flame fill="currentColor" />
            <span>{streak}</span>
          </div>
          <div className="flex items-center gap-2 font-bold text-duo-blue">
            <Zap fill="currentColor" />
            <span>{xp}</span>
          </div>
          <div className="flex items-center gap-2 font-bold text-duo-red">
            <Heart fill="currentColor" />
            <span>{hearts}</span>
          </div>
          <div className="flex items-center gap-2 font-bold text-duo-yellow">
            <Trophy fill="currentColor" />
            <span>500</span>
          </div>
        </div>

        <div className="w-10 h-10 rounded-full bg-duo-purple flex items-center justify-center text-white font-bold border-2 border-white shadow-md">
          J
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 md:ml-64">
        <div className="max-w-4xl mx-auto">
          {SECTIONS.map((section, idx) => (
            <div key={section.id} className={idx === currentSectionIndex ? 'block' : 'hidden'}>
              <div className="bg-gradient-to-br from-duo-green-dark to-emerald-700 text-white p-6 rounded-2xl mb-8 flex items-center justify-between shadow-xl border-b-4 border-emerald-900">
                <div>
                   <div className="text-xs font-black opacity-80 mb-1 tracking-widest">{currentLicense}</div>
                   <h1 className="text-2xl font-black uppercase tracking-tight">{section.title}</h1>
                   <p className="opacity-90 font-medium italic">{section.description}</p>
                </div>
                <div className="flex gap-2">
                   <button
                    onClick={() => setCurrentSectionIndex(Math.max(0, idx - 1))}
                    disabled={idx === 0}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 bg-black/20"
                   >
                    <ChevronLeft />
                   </button>
                   <button
                    onClick={() => setCurrentSectionIndex(Math.min(SECTIONS.length - 1, idx + 1))}
                    disabled={idx === SECTIONS.length - 1}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30 bg-black/20"
                   >
                    <ChevronRight />
                   </button>
                </div>
              </div>

              {section.units.map(unit => (
                <UnitSection key={unit.id} unit={unit} />
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;

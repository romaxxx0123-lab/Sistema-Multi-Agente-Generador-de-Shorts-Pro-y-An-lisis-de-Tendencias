import React from 'react';
import { Sidebar } from './components/Sidebar';
import { UnitSection } from './components/UnitSection';
import { LessonScreen } from './components/LessonScreen';
import { SECTIONS } from './data/course';
import { useStore } from './store/useStore';
import { Heart, Trophy, Zap, ChevronLeft, ChevronRight } from 'lucide-react';

function App() {
  const activeLesson = useStore(state => state.activeLesson);
  const hearts = useStore(state => state.hearts);
  const [currentSectionIndex, setCurrentSectionIndex] = React.useState(0);

  if (activeLesson) {
    return <LessonScreen />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Sidebar />

      {/* Top Header for Mobile & Stats */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b-2 border-duo-gray-light z-40 flex items-center justify-between px-6 md:left-64">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-duo-orange">
            <Zap fill="currentColor" />
            <span>12</span>
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

        <div className="w-10 h-10 rounded-full bg-duo-purple flex items-center justify-center text-white font-bold">
          J
        </div>
      </header>

      <main className="pt-24 pb-12 px-4 md:ml-64">
        <div className="max-w-4xl mx-auto">
          {SECTIONS.map((section, idx) => (
            <div key={section.id} className={idx === currentSectionIndex ? 'block' : 'hidden'}>
              <div className="bg-duo-green-dark text-white p-6 rounded-2xl mb-8 flex items-center justify-between shadow-lg">
                <div>
                   <h1 className="text-2xl font-bold uppercase tracking-tight">{section.title}</h1>
                   <p className="opacity-90 font-medium">{section.description}</p>
                </div>
                <div className="flex gap-2">
                   <button
                    onClick={() => setCurrentSectionIndex(Math.max(0, idx - 1))}
                    disabled={idx === 0}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
                   >
                    <ChevronLeft />
                   </button>
                   <button
                    onClick={() => setCurrentSectionIndex(Math.min(SECTIONS.length - 1, idx + 1))}
                    disabled={idx === SECTIONS.length - 1}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-30"
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

import { Sidebar } from './components/Sidebar';
import { UnitSection } from './components/UnitSection';
import { LessonScreen } from './components/LessonScreen';
import { UNITS } from './data/course';
import { useStore } from './store/useStore';
import { Heart, Trophy, Zap } from 'lucide-react';

function App() {
  const activeLesson = useStore(state => state.activeLesson);
  const hearts = useStore(state => state.hearts);

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
          {UNITS.map(unit => (
            <UnitSection key={unit.id} unit={unit} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default App;

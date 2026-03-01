import React from 'react';
import type { Unit } from '../types';
import { LessonButton } from './LessonButton';
import { useStore } from '../store/useStore';
import { getLessonStatus } from '../data/course';

interface UnitSectionProps {
  unit: Unit;
}

export const UnitSection: React.FC<UnitSectionProps> = ({ unit }) => {
  const completedLessons = useStore(state => state.completedLessons);

  const unitCompletedCount = unit.lessons.filter(l => completedLessons.includes(l.id)).length;
  const unitProgress = (unitCompletedCount / unit.lessons.length) * 100;

  return (
    <div className="w-full max-w-2xl mx-auto mb-16">
      <div className={`${unit.color} p-6 rounded-2xl text-white mb-12 shadow-lg`}>
        <div className="flex justify-between items-start mb-2">
           <div>
              <h2 className="text-2xl font-bold uppercase tracking-tight">{unit.title}</h2>
              <p className="opacity-90 font-medium">{unit.description}</p>
           </div>
           <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">
              GUÍA
           </div>
        </div>

        {/* Unit Progress Bar */}
        <div className="mt-4 bg-black/10 rounded-full h-3 w-full overflow-hidden border border-white/20">
           <div
             className="bg-white h-full transition-all duration-500 ease-out"
             style={{ width: `${unitProgress}%` }}
           />
        </div>
      </div>

      <div className="flex flex-col items-center">
        {unit.lessons.map((lesson, index) => {
          const { isLocked, isCompleted } = getLessonStatus(lesson.id, completedLessons);

          return (
            <LessonButton
              key={lesson.id}
              lesson={lesson}
              index={index}
              total={unit.lessons.length}
              isCompleted={isCompleted}
              isLocked={isLocked}
            />
          );
        })}
      </div>
    </div>
  );
};

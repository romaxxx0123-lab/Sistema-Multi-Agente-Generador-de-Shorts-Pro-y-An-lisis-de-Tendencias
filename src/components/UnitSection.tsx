import React from 'react';
import type { Unit } from '../types';
import { LessonButton } from './LessonButton';
import { useStore } from '../store/useStore';

interface UnitSectionProps {
  unit: Unit;
}

export const UnitSection: React.FC<UnitSectionProps> = ({ unit }) => {
  const completedLessons = useStore(state => state.completedLessons);

  return (
    <div className="w-full max-w-2xl mx-auto mb-16">
      <div className={`${unit.color} p-6 rounded-2xl text-white mb-12 shadow-lg`}>
        <h2 className="text-2xl font-bold mb-1 uppercase tracking-tight">{unit.title}</h2>
        <p className="opacity-90 font-medium">{unit.description}</p>
      </div>

      <div className="flex flex-col items-center">
        {unit.lessons.map((lesson, index) => {
          const isCompleted = completedLessons.includes(lesson.id);
          const isLocked = index > 0 && !completedLessons.includes(unit.lessons[index-1].id) && !isCompleted;

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

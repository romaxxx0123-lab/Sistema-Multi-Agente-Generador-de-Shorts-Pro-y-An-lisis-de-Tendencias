import React from 'react';
import type { Unit } from '../types';
import { LessonButton } from './LessonButton';
import { useStore } from '../store/useStore';
import { getLessonStatus } from '../data/course';
import { Lock } from 'lucide-react';

interface UnitSectionProps {
  unit: Unit;
}

export const UnitSection: React.FC<UnitSectionProps> = ({ unit }) => {
  const completedLessons = useStore(state => state.completedLessons);

  // Progress based on completing at least level 1 of each lesson
  const unitCompletedCount = unit.lessons.filter(l => (completedLessons[l.id] || 0) > 0).length;
  const unitProgress = (unitCompletedCount / unit.lessons.length) * 100;

  // A unit is locked if its first lesson is locked
  const { isLocked: unitIsLocked } = getLessonStatus(unit.lessons[0].id, completedLessons);

  return (
    <div className={`w-full max-w-2xl mx-auto mb-20 relative transition-all duration-500 ${unitIsLocked ? 'grayscale-[0.8] opacity-60' : ''}`}>
      <div className={`
        ${unit.color} p-8 rounded-3xl text-white mb-16 shadow-xl border-b-[12px] border-black/20 relative
        ${unitIsLocked ? 'bg-duo-gray border-duo-gray-dark' : ''}
      `}>
        {unitIsLocked && (
           <div className="absolute -top-4 -right-4 bg-duo-gray-dark p-3 rounded-2xl shadow-xl rotate-12 border-2 border-white/20">
              <Lock size={24} className="text-white" fill="currentColor" />
           </div>
        )}

        <div className="flex justify-between items-start mb-4">
           <div>
              <div className="text-xs font-black uppercase tracking-[0.2em] opacity-80 mb-1">Unidad Automotriz</div>
              <h2 className="text-3xl font-black uppercase tracking-tight leading-none mb-2">{unit.title}</h2>
              <p className="opacity-90 font-bold text-lg">{unit.description}</p>
           </div>
           {!unitIsLocked && (
             <div className="bg-white/20 px-5 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.15em] border border-white/30 backdrop-blur-sm shadow-inner cursor-pointer hover:bg-white/30 transition-all">
                GUÍA
             </div>
           )}
        </div>

        {!unitIsLocked && (
           <div className="mt-8 bg-black/20 rounded-full h-5 w-full overflow-hidden border-2 border-white/10 relative shadow-inner">
              <div
                className="bg-white h-full transition-all duration-[1500ms] cubic-bezier(0.65, 0, 0.35, 1)"
                style={{ width: `${unitProgress}%` }}
              />
              {unitProgress > 0 && unitProgress < 100 && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              )}
           </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 relative">
        {/* Connection lines between lessons */}
        <div className="absolute top-0 bottom-0 w-1.5 bg-duo-gray-light left-1/2 -translate-x-1/2 -z-10 opacity-40 rounded-full" />

        {unit.lessons.map((lesson, index) => {
          const { isLocked, level } = getLessonStatus(lesson.id, completedLessons);

          return (
            <LessonButton
              key={lesson.id}
              lesson={lesson}
              index={index}
              total={unit.lessons.length}
              level={level}
              isLocked={isLocked || unitIsLocked}
            />
          );
        })}
      </div>
    </div>
  );
};

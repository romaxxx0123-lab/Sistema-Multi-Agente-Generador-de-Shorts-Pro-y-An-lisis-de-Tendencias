import React from 'react';
import { Star, Check } from 'lucide-react';
import type { Lesson } from '../types';
import { useStore } from '../store/useStore';

interface LessonButtonProps {
  lesson: Lesson;
  index: number;
  total: number;
  isCompleted: boolean;
  isLocked: boolean;
}

export const LessonButton: React.FC<LessonButtonProps> = ({
  lesson,
  index,
  isCompleted,
  isLocked
}) => {
  const startLesson = useStore(state => state.startLesson);

  // Calculate horizontal offset for the "zig-zag" path
  const offset = Math.sin(index * 1.5) * 60;

  return (
    <div
      className="flex flex-col items-center mb-8 relative"
      style={{ transform: `translateX(${offset}px)` }}
    >
      <button
        onClick={() => !isLocked && startLesson(lesson)}
        disabled={isLocked}
        className={`
          relative w-20 h-20 rounded-full flex items-center justify-center transition-all active:translate-y-1
          ${isCompleted
            ? 'bg-duo-yellow border-b-8 border-duo-yellow-dark shadow-duo-yellow-dark'
            : isLocked
              ? 'bg-duo-gray-light border-b-8 border-duo-gray shadow-duo-gray'
              : 'bg-duo-green border-b-8 border-duo-green-dark shadow-duo-green-dark'}
        `}
      >
        {isCompleted ? (
          <Check size={36} className="text-white" strokeWidth={4} />
        ) : isLocked ? (
          <Star size={36} className="text-duo-gray" fill="currentColor" />
        ) : (
          <Star size={36} className="text-white" fill="currentColor" />
        )}
      </button>

      <div className="mt-2 bg-white border-2 border-duo-gray-light px-3 py-1 rounded-xl font-bold text-sm uppercase">
        {lesson.title}
      </div>
    </div>
  );
};

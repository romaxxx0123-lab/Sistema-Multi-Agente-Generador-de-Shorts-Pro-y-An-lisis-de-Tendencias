import React from 'react';
import { motion } from 'framer-motion';
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
  const hearts = useStore(state => state.hearts);

  // Calculate horizontal offset for the "zig-zag" path
  const offset = Math.sin(index * 1.5) * 60;

  return (
    <motion.div
      className="flex flex-col items-center mb-8 relative"
      style={{ x: offset }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
    >
      <div className="relative">
        {/* Progress Circle (SVG) */}
        {!isLocked && !isCompleted && (
           <svg className="absolute -inset-2 w-24 h-24 -rotate-90">
             <circle
               cx="48" cy="48" r="42"
               fill="transparent"
               stroke="#e5e5e5"
               strokeWidth="8"
             />
             {/* This could be per-lesson progress if we tracked it, but for now we show 0 */}
             <circle
               cx="48" cy="48" r="42"
               fill="transparent"
               stroke="#58cc02"
               strokeWidth="8"
               strokeDasharray={2 * Math.PI * 42}
               strokeDashoffset={2 * Math.PI * 42} // 0% progress
               strokeLinecap="round"
             />
           </svg>
        )}

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ y: 8, transition: { duration: 0.1 } }}
          onClick={() => !isLocked && startLesson(lesson)}
          disabled={isLocked}
          className={`
            relative w-20 h-20 rounded-full flex items-center justify-center transition-all z-10
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
        </motion.button>
      </div>

      <div className="mt-2 bg-white border-2 border-duo-gray-light px-3 py-1 rounded-xl font-bold text-sm uppercase">
        {lesson.title}
      </div>
    </motion.div>
  );
};

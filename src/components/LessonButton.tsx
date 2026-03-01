import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Check, Crown, Lock } from 'lucide-react';
import type { Lesson } from '../types';
import { useStore } from '../store/useStore';

interface LessonButtonProps {
  lesson: Lesson;
  index: number;
  total: number;
  level: number; // 0 to 3
  isLocked: boolean;
}

export const LessonButton: React.FC<LessonButtonProps> = ({
  lesson,
  index,
  level,
  isLocked
}) => {
  const startLesson = useStore(state => state.startLesson);
  const offset = Math.sin(index * 1.5) * 80;

  const isCompleted = level >= 3;
  const progress = (level / 3) * 100;

  // Official Duolingo Colors for levels
  const levelColors = [
    'bg-duo-green border-duo-green-dark shadow-duo-green-dark', // Level 0
    'bg-blue-400 border-blue-600 shadow-blue-600',              // Level 1
    'bg-orange-400 border-orange-600 shadow-orange-600',       // Level 2
    'bg-duo-yellow border-duo-yellow-dark shadow-duo-yellow-dark' // Level 3 (Max)
  ];

  return (
    <motion.div
      className="flex flex-col items-center mb-16 relative"
      style={{ x: offset }}
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ delay: index * 0.1, type: "spring", damping: 12 }}
    >
      <div className="relative group">
        {!isLocked && !isCompleted && (
           <svg className="absolute -inset-3 w-28 h-28 -rotate-90 pointer-events-none z-0">
             <circle
               cx="56" cy="56" r="48"
               fill="transparent"
               stroke="#e5e5e5"
               strokeWidth="8"
             />
             <circle
               cx="56" cy="56" r="48"
               fill="transparent"
               stroke={level === 0 ? "#58cc02" : level === 1 ? "#1cb0f6" : "#ff9600"}
               strokeWidth="8"
               strokeDasharray={2 * Math.PI * 48}
               strokeDashoffset={2 * Math.PI * 48 * (1 - progress / 100)}
               strokeLinecap="round"
               className="transition-all duration-700"
             />
           </svg>
        )}

        <motion.button
          whileHover={!isLocked ? { scale: 1.1 } : {}}
          whileTap={!isLocked ? { y: 4, transition: { duration: 0.1 } } : {}}
          onClick={() => !isLocked && startLesson(lesson)}
          disabled={isLocked}
          className={`
            relative w-22 h-22 rounded-full flex items-center justify-center transition-all z-10
            border-b-8 active:border-b-0
            ${isLocked
              ? 'bg-duo-gray-light border-duo-gray shadow-none grayscale opacity-60'
              : levelColors[level]}
          `}
        >
          <AnimatePresence mode="wait">
            {isLocked ? (
              <Lock key="lock" size={40} className="text-duo-gray" fill="currentColor" />
            ) : isCompleted ? (
              <Check key="check" size={44} className="text-white" strokeWidth={5} />
            ) : level > 0 ? (
              <motion.div
                key="crown"
                initial={{ scale: 0.5, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
              >
                <Crown size={44} className="text-white" fill="currentColor" />
              </motion.div>
            ) : (
              <Star key="star" size={44} className="text-white" fill="currentColor" />
            )}
          </AnimatePresence>

          {/* Level Badge */}
          {!isLocked && !isCompleted && (
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-white border-2 border-duo-gray-light flex items-center justify-center font-black text-xs text-duo-gray-dark shadow-sm">
              {level}
            </div>
          )}
        </motion.button>

        {/* Hover Tooltip */}
        {!isLocked && (
           <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 bg-duo-gray-dark text-white px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-white/10">
              Nivel {level} • Empezar
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-duo-gray-dark" />
           </div>
        )}
      </div>

      <div className={`
        mt-4 bg-white border-2 border-duo-gray-light px-4 py-1.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all
        ${isLocked ? 'opacity-40 grayscale' : 'text-duo-gray-dark shadow-sm group-hover:bg-duo-gray-light'}
      `}>
        {lesson.title}
      </div>
    </motion.div>
  );
};

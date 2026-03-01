import React from 'react';
import { motion } from 'framer-motion';
import type { Option } from '../../types';

interface ImageSelectionExerciseProps {
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  status: 'idle' | 'correct' | 'incorrect';
}

export const ImageSelectionExercise: React.FC<ImageSelectionExerciseProps> = ({
  options,
  selectedId,
  onSelect,
  status
}) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
      {options.map((option) => (
        <motion.button
          whileTap={{ y: 4 }}
          key={option.id}
          onClick={() => status === 'idle' && onSelect(option.id)}
          className={`
            p-2 border-2 rounded-2xl flex flex-col items-center gap-4 transition-all
            ${selectedId === option.id
              ? 'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]'
              : 'border-duo-gray-light hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
            active:translate-y-1 active:shadow-none h-full
          `}
        >
          <div className="w-full aspect-square bg-gray-100 rounded-xl overflow-hidden flex items-center justify-center p-2 relative">
             {option.image ? (
               <img src={option.image} alt={option.text} className="w-full h-full object-contain" />
             ) : (
               <div className="text-4xl text-duo-gray">🚗</div>
             )}

             <div className={`
               absolute top-2 left-2 w-6 h-6 border-2 rounded-md flex items-center justify-center text-xs font-bold
               ${selectedId === option.id ? 'border-duo-blue text-duo-blue' : 'border-duo-gray-light text-duo-gray-light'}
             `}>
               {option.id.slice(-1)}
             </div>
          </div>
          <span className="font-bold text-base mb-2">{option.text}</span>
        </motion.button>
      ))}
    </div>
  );
};

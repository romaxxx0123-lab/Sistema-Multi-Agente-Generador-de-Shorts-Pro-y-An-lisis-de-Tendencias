import React from 'react';
import { motion } from 'framer-motion';
import type { Option } from '../../types';

interface MultipleChoiceExerciseProps {
  options: Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  status: 'idle' | 'correct' | 'incorrect';
}

export const MultipleChoiceExercise: React.FC<MultipleChoiceExerciseProps> = ({
  options,
  selectedId,
  onSelect,
  status
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
      {options.map((option, index) => (
        <motion.button
          whileTap={{ y: 4 }}
          key={option.id}
          onClick={() => status === 'idle' && onSelect(option.id)}
          className={`
            p-4 border-2 rounded-2xl text-left font-bold text-lg transition-all flex items-center
            ${selectedId === option.id
              ? 'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]'
              : 'border-duo-gray-light hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
            active:translate-y-1 active:shadow-none
          `}
        >
          <span className="inline-block w-8 h-8 border-2 rounded-lg mr-4 text-center leading-7 text-sm shrink-0">
            {index + 1}
          </span>
          <span className="flex-1">{option.text}</span>
        </motion.button>
      ))}
    </div>
  );
};

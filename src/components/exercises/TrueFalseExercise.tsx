import React from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';

interface TrueFalseProps {
  isTrue: boolean;
  onSelect: (isTrue: boolean) => void;
  status: 'idle' | 'correct' | 'incorrect';
}

export const TrueFalseExercise: React.FC<TrueFalseProps> = ({
  isTrue,
  onSelect,
  status
}) => {
  return (
    <div className="flex flex-col gap-12 w-full max-w-xl mx-auto py-8">
      <div className="grid grid-cols-2 gap-6 w-full">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ y: 8 }}
          onClick={() => status === 'idle' && onSelect(true)}
          disabled={status !== 'idle'}
          className={`
            flex flex-col items-center gap-4 p-8 border-b-8 rounded-3xl transition-all
            ${status === 'idle'
              ? 'bg-white border-duo-gray-light hover:bg-gray-50'
              : isTrue === true
                ? 'bg-duo-green border-duo-green-dark text-white'
                : 'bg-duo-red border-duo-red-dark text-white opacity-50'}
          `}
        >
          <div className={`
             w-16 h-16 rounded-full flex items-center justify-center border-4
             ${status === 'idle' ? 'border-duo-green text-duo-green' : 'border-white text-white'}
          `}>
             <Check size={40} strokeWidth={4} />
          </div>
          <span className="font-black text-2xl uppercase">VERDADERO</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ y: 8 }}
          onClick={() => status === 'idle' && onSelect(false)}
          disabled={status !== 'idle'}
          className={`
            flex flex-col items-center gap-4 p-8 border-b-8 rounded-3xl transition-all
            ${status === 'idle'
              ? 'bg-white border-duo-gray-light hover:bg-gray-50'
              : isTrue === false
                ? 'bg-duo-green border-duo-green-dark text-white'
                : 'bg-duo-red border-duo-red-dark text-white opacity-50'}
          `}
        >
          <div className={`
             w-16 h-16 rounded-full flex items-center justify-center border-4
             ${status === 'idle' ? 'border-duo-red text-duo-red' : 'border-white text-white'}
          `}>
             <X size={40} strokeWidth={4} />
          </div>
          <span className="font-black text-2xl uppercase">FALSO</span>
        </motion.button>
      </div>
    </div>
  );
};

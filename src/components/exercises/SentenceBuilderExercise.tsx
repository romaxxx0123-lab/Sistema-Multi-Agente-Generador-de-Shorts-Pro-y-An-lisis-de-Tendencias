import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SentenceBuilderProps {
  sentence: string[];
  correctOrder: string[];
  onCorrect: (isCorrect: boolean) => void;
  status: 'idle' | 'correct' | 'incorrect';
}

export const SentenceBuilderExercise: React.FC<SentenceBuilderProps> = ({
  sentence,
  correctOrder,
  onCorrect,
  status
}) => {
  const [availableWords, setAvailableWords] = useState<string[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);

  useEffect(() => {
    setAvailableWords([...sentence].sort(() => Math.random() - 0.5));
    setSelectedWords([]);
  }, [sentence]);

  const handleWordSelect = (word: string, index: number) => {
    if (status !== 'idle') return;
    setAvailableWords(prev => prev.filter((_, i) => i !== index));
    setSelectedWords(prev => [...prev, word]);
  };

  const handleWordRemove = (word: string, index: number) => {
    if (status !== 'idle') return;
    setSelectedWords(prev => prev.filter((_, i) => i !== index));
    setAvailableWords(prev => [...prev, word]);
  };

  // Check correctness when selectedWords length equals correctOrder length
  useEffect(() => {
    if (selectedWords.length === correctOrder.length && selectedWords.length > 0) {
      const isCorrect = selectedWords.every((word, i) => word === correctOrder[i]);
      onCorrect(isCorrect);
    }
  }, [selectedWords, correctOrder, onCorrect]);

  return (
    <div className="flex flex-col gap-12 w-full max-w-2xl mx-auto py-8">
      {/* Selected Words Area */}
      <div className="min-h-[100px] border-b-2 border-duo-gray-light flex flex-wrap gap-2 p-2 items-center justify-center">
        <AnimatePresence>
          {selectedWords.map((word, i) => (
            <motion.button
              key={`selected-${word}-${i}`}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              whileTap={{ y: 4 }}
              onClick={() => handleWordRemove(word, i)}
              className="bg-white border-2 border-duo-gray-light px-4 py-2 rounded-xl font-bold text-lg shadow-[0_4px_0_0_#e5e5e5] hover:bg-gray-50 transition-colors"
            >
              {word}
            </motion.button>
          ))}
        </AnimatePresence>
        {selectedWords.length === 0 && (
          <div className="text-duo-gray opacity-30 font-bold text-xl uppercase tracking-widest">
            Ordena los pasos
          </div>
        )}
      </div>

      {/* Available Words Area */}
      <div className="flex flex-wrap gap-2 justify-center">
        {availableWords.map((word, i) => (
          <motion.button
            key={`available-${word}-${i}`}
            whileHover={{ scale: 1.05 }}
            whileTap={{ y: 4 }}
            onClick={() => handleWordSelect(word, i)}
            className="bg-white border-2 border-duo-gray-light px-4 py-2 rounded-xl font-bold text-lg shadow-[0_4px_0_0_#e5e5e5] hover:bg-gray-50 transition-colors"
          >
            {word}
          </motion.button>
        ))}
      </div>
    </div>
  );
};

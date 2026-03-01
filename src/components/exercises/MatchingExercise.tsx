import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface PairItem {
  id: string;
  text: string;
  side: 'left' | 'right';
}

interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

interface MatchingExerciseProps {
  pairs: MatchingPair[];
  onComplete: () => void;
  onIncorrect: () => void;
}

export const MatchingExercise: React.FC<MatchingExerciseProps> = ({ pairs, onComplete, onIncorrect }) => {
  const [leftItems, setLeftItems] = useState<PairItem[]>([]);
  const [rightItems, setRightItems] = useState<PairItem[]>([]);

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [matchedIds, setMatchedIds] = useState<Set<string>>(new Set());
  const [mismatched, setMismatched] = useState<boolean>(false);

  useEffect(() => {
    // Shuffle items
    const lefts = pairs.map(p => ({ id: p.id, text: p.left, side: 'left' as const }));
    const rights = pairs.map(p => ({ id: p.id, text: p.right, side: 'right' as const }));

    setLeftItems([...lefts].sort(() => Math.random() - 0.5));
    setRightItems([...rights].sort(() => Math.random() - 0.5));
  }, [pairs]);

  useEffect(() => {
    if (selectedLeft && selectedRight) {
      if (selectedLeft === selectedRight) {
        setMatchedIds(prev => new Set([...prev, selectedLeft]));
        setSelectedLeft(null);
        setSelectedRight(null);

        // Play success sound logic here if we had one
      } else {
        setMismatched(true);
        onIncorrect();
        setTimeout(() => {
          setMismatched(false);
          setSelectedLeft(null);
          setSelectedRight(null);
        }, 1000);
      }
    }
  }, [selectedLeft, selectedRight]);

  useEffect(() => {
    if (matchedIds.size === pairs.length && pairs.length > 0) {
      onComplete();
    }
  }, [matchedIds, pairs.length, onComplete]);

  const handleSelect = (id: string, side: 'left' | 'right') => {
    if (matchedIds.has(id)) return;
    if (mismatched) return;

    if (side === 'left') {
      setSelectedLeft(id === selectedLeft ? null : id);
    } else {
      setSelectedRight(id === selectedRight ? null : id);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-4 w-full max-w-xl mx-auto py-8">
      <div className="space-y-4">
        {leftItems.map((item) => {
          const isMatched = matchedIds.has(item.id);
          const isSelected = selectedLeft === item.id;

          return (
              <motion.button
              key={`left-${item.id}`}
              onClick={() => handleSelect(item.id, 'left')}
              disabled={isMatched}
              className={`
                w-full p-4 rounded-2xl border-2 font-bold text-lg transition-all text-center
                ${isMatched ? 'opacity-0 scale-95 pointer-events-none' :
                  isSelected ? (mismatched ? 'border-red-500 bg-red-50 text-red-500 shadow-[0_4px_0_0_#ef4444]' : 'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]') :
                  'border-duo-gray-light bg-white hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
                active:translate-y-1 active:shadow-none duration-300
              `}
              whileTap={{ y: 4 }}
            >
              {item.text}
              </motion.button>
          );
        })}
      </div>

      <div className="space-y-4">
        {rightItems.map((item) => {
          const isMatched = matchedIds.has(item.id);
          const isSelected = selectedRight === item.id;

          return (
              <motion.button
              key={`right-${item.id}`}
              onClick={() => handleSelect(item.id, 'right')}
              disabled={isMatched}
              className={`
                w-full p-4 rounded-2xl border-2 font-bold text-lg transition-all text-center
                ${isMatched ? 'opacity-0 scale-95 pointer-events-none' :
                  isSelected ? (mismatched ? 'border-red-500 bg-red-50 text-red-500 shadow-[0_4px_0_0_#ef4444]' : 'border-duo-blue bg-blue-50 text-duo-blue shadow-[0_4px_0_0_#1cb0f6]') :
                  'border-duo-gray-light bg-white hover:bg-gray-50 shadow-[0_4px_0_0_#e5e5e5]'}
                active:translate-y-1 active:shadow-none duration-300
              `}
              whileTap={{ y: 4 }}
            >
              {item.text}
              </motion.button>
          );
        })}
      </div>
    </div>
  );
};

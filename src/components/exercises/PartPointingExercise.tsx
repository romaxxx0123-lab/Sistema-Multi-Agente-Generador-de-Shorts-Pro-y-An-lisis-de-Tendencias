import React from 'react';
import { motion } from 'framer-motion';
import type { Hotspot } from '../../types';

interface PartPointingProps {
  image: string;
  hotspots: Hotspot[];
  onSelect: (id: string) => void;
  status: 'idle' | 'correct' | 'incorrect';
  selectedId: string | null;
}

export const PartPointingExercise: React.FC<PartPointingProps> = ({
  image,
  hotspots,
  onSelect,
  status,
  selectedId
}) => {
  return (
    <div className="relative w-full max-w-2xl mx-auto aspect-video bg-gray-100 rounded-3xl overflow-hidden border-4 border-duo-gray-light shadow-xl">
      {/* Background Diagram */}
      <img src={image} alt="Diagram" className="w-full h-full object-cover opacity-80" />

      {/* Semi-transparent overlay to make hotspots pop */}
      <div className="absolute inset-0 bg-black/5 pointer-events-none" />

      {/* Hotspots */}
      {hotspots.map((spot) => {
        const isSelected = selectedId === spot.id;

        return (
          <motion.button
            key={spot.id}
            whileHover={{ scale: 1.2 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => status === 'idle' && onSelect(spot.id)}
            disabled={status !== 'idle'}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${spot.x}%`, top: `${spot.y}%` }}
          >
            {/* Pulsing indicator */}
            <div className={`
              w-8 h-8 rounded-full border-4 flex items-center justify-center transition-all duration-300
              ${status === 'idle'
                ? (isSelected ? 'bg-duo-blue border-white scale-110 shadow-lg' : 'bg-white/50 border-duo-blue animate-pulse')
                : spot.isCorrect
                  ? 'bg-duo-green border-white scale-110 shadow-lg'
                  : isSelected ? 'bg-duo-red border-white scale-110 shadow-lg' : 'bg-white/20 border-duo-gray'
              }
            `}>
              {status !== 'idle' && spot.isCorrect && (
                <div className="text-white font-bold text-xs">✓</div>
              )}
            </div>

            {/* Label Tooltip */}
            <div className={`
              absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-duo-gray-dark text-white text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none
            `}>
              {spot.label}
            </div>
          </motion.button>
        );
      })}

      {status === 'idle' && !selectedId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/90 px-4 py-2 rounded-full font-bold text-duo-gray-dark text-sm shadow-sm border border-duo-gray-light">
          Toca la pieza correcta
        </div>
      )}
    </div>
  );
};

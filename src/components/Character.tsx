import React from 'react';
import { motion } from 'framer-motion';

interface CharacterProps {
  expression?: 'happy' | 'sad' | 'neutral' | 'wink';
  className?: string;
  size?: number;
}

export const Character: React.FC<CharacterProps> = ({
  expression = 'neutral',
  className = '',
  size = 150
}) => {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size * 1.1 }}>
      <svg
        viewBox="0 0 100 110"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* Body */}
        <ellipse cx="50" cy="60" rx="35" ry="45" fill="#1e293b" />
        <ellipse cx="50" cy="65" rx="25" ry="35" fill="white" />

        {/* Wings */}
        <motion.path
          d="M15 60C10 70 5 80 10 90"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
          animate={expression === 'happy' ? { rotate: [0, -20, 0] } : {}}
        />
        <motion.path
          d="M85 60C90 70 95 80 90 90"
          stroke="#1e293b"
          strokeWidth="10"
          strokeLinecap="round"
          animate={expression === 'happy' ? { rotate: [0, 20, 0] } : {}}
        />

        {/* Eyes */}
        <g>
          {expression === 'wink' ? (
             <>
               <path d="M35 45L45 45" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
               <circle cx="65" cy="45" r="4" fill="#1e293b" />
             </>
          ) : expression === 'sad' ? (
            <>
              <path d="M35 48Q40 43 45 48" stroke="#1e293b" strokeWidth="3" fill="none" />
              <path d="M55 48Q60 43 65 48" stroke="#1e293b" strokeWidth="3" fill="none" />
            </>
          ) : (
            <>
              <circle cx="40" cy="45" r="4" fill="#1e293b" />
              <circle cx="60" cy="45" r="4" fill="#1e293b" />
            </>
          )}
        </g>

        {/* Beak */}
        <path
          d="M45 52L55 52L50 60Z"
          fill="#fbbf24"
        />

        {/* Feet */}
        <path d="M35 100Q30 105 25 100" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
        <path d="M65 100Q70 105 75 100" stroke="#fbbf24" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  );
};

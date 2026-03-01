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
    <motion.div
      className={`relative ${className}`}
      style={{ width: size, height: size * 1.2 }}
      animate={{
        y: [0, -6, 0],
        scale: expression === 'happy' ? [1, 1.05, 1] : 1
      }}
      transition={{
        y: { duration: 2, repeat: Infinity, ease: "easeInOut" },
        scale: { duration: 0.3, repeat: expression === 'happy' ? Infinity : 0 }
      }}
    >
      <svg
        viewBox="0 0 100 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-2xl"
      >
        {/* Racing Suit Body */}
        <ellipse cx="50" cy="70" rx="38" ry="48" fill="#e11d48" /> {/* Red Suit */}
        <path d="M30 30 Q50 20 70 30 L70 110 Q50 120 30 110 Z" fill="#e11d48" />

        {/* Racing Stripes */}
        <rect x="42" y="35" width="6" height="80" fill="white" opacity="0.9" />
        <rect x="52" y="35" width="6" height="80" fill="white" opacity="0.9" />

        {/* Penguin Belly (Suit Opening) */}
        <ellipse cx="50" cy="75" rx="22" ry="32" fill="white" />

        {/* Pro Racing Helmet */}
        <circle cx="50" cy="40" r="32" fill="#1e293b" /> {/* Dark Helmet */}
        <rect x="25" y="35" width="50" height="20" rx="10" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" /> {/* Visor */}

        {/* Visor Reflection */}
        <rect x="30" y="38" width="15" height="4" rx="2" fill="white" opacity="0.3" />

        {/* Eyes (Visible through visor) */}
        <g>
          {expression === 'wink' ? (
             <>
               <path d="M40 45L45 45" stroke="white" strokeWidth="2" strokeLinecap="round" />
               <circle cx="60" cy="45" r="3" fill="white" />
             </>
          ) : expression === 'sad' ? (
            <>
              <path d="M38 47Q41 44 44 47" stroke="white" strokeWidth="2" fill="none" />
              <path d="M56 47Q59 44 62 47" stroke="white" strokeWidth="2" fill="none" />
            </>
          ) : (
            <>
              <circle cx="42" cy="45" r="3" fill="white" />
              <circle cx="58" cy="45" r="3" fill="white" />
            </>
          )}
        </g>

        {/* Beak (Outside visor) */}
        <path d="M46 54L54 54L50 62Z" fill="#fbbf24" />

        {/* Racing Gloves/Wings */}
        <motion.path
          d="M15 70C5 80 0 95 10 105"
          stroke="#1e293b"
          strokeWidth="12"
          strokeLinecap="round"
          animate={expression === 'happy' ? { rotate: [0, -30, 0] } : {}}
        />
        <motion.path
          d="M85 70C95 80 100 95 90 105"
          stroke="#1e293b"
          strokeWidth="12"
          strokeLinecap="round"
          animate={expression === 'happy' ? { rotate: [0, 30, 0] } : {}}
        />

        {/* Steering Wheel (Epic Accessory) */}
        <motion.g
          animate={{ rotate: [-5, 5, -5] }}
          transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: '50px 85px' }}
        >
          <circle cx="50" cy="85" r="18" fill="none" stroke="#334155" strokeWidth="5" />
          <rect x="48" y="70" width="4" height="30" fill="#334155" />
          <rect x="35" y="83" width="30" height="4" fill="#334155" />
          {/* Shift Paddles */}
          <rect x="32" y="75" width="4" height="10" rx="1" fill="#ef4444" />
          <rect x="64" y="75" width="4" height="10" rx="1" fill="#ef4444" />
        </motion.g>

        {/* Boots */}
        <path d="M35 110Q30 115 25 110" stroke="#0f172a" strokeWidth="6" strokeLinecap="round" />
        <path d="M65 110Q70 115 75 110" stroke="#0f172a" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </motion.div>
  );
};

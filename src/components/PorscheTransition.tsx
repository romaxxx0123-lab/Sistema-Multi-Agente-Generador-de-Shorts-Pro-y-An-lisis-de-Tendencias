import React from 'react';
import { motion } from 'framer-motion';

interface PorscheTransitionProps {
  onComplete: () => void;
}

export const PorscheTransition: React.FC<PorscheTransitionProps> = ({ onComplete }) => {
  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-white flex items-center justify-center overflow-hidden"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="absolute inset-0 bg-linear-to-r from-slate-50 to-white opacity-50" />

      {/* Speed lines in background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-[1px] bg-slate-200"
            style={{
              top: `${10 + i * 8}%`,
              width: `${(i % 4 + 1) * 80}px`,
              left: '-300px'
            }}
            animate={{ left: '150%' }}
            transition={{
              duration: 0.4,
              repeat: 4,
              delay: i * 0.05,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <motion.div
        className="relative w-full flex items-center"
        initial={{ x: '-100%' }}
        animate={{ x: '150%' }}
        transition={{
          duration: 1.2,
          ease: [0.45, 0, 0.55, 1], // Porsche Acceleration Curve
        }}
        onAnimationComplete={onComplete}
      >
        {/* Porsche GT3 RS SVG - Profile View */}
        <div className="relative">
          <svg
            viewBox="0 0 600 200"
            className="w-[500px] h-auto drop-shadow-2xl filter brightness-110"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Body Shadow */}
            <ellipse cx="300" cy="175" rx="250" ry="15" fill="black" opacity="0.1" />

            {/* Main Chassis */}
            <path
              d="M50 160 C50 150 70 140 100 135 L150 90 C200 70 350 70 450 100 L550 145 C570 155 570 165 550 170 L50 170 Z"
              fill="#27272a" // Guards Red or Shark Blue? Let's go with Shark Blue / Deep Black for sophistication
              className="fill-slate-900"
            />

            {/* Upper Cockpit / Roof line */}
            <path
              d="M180 95 C220 75 350 75 420 100"
              stroke="#cbd5e1"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Windows */}
            <path
              d="M200 100 C240 85 340 85 400 105 L380 130 H220 L200 100 Z"
              fill="#0f172a"
              stroke="#334155"
              strokeWidth="2"
            />

            {/* GT3 RS Wing */}
            <path
              d="M480 105 L510 50 H570 L550 105 Z"
              fill="#0f172a"
              stroke="#1e293b"
              strokeWidth="2"
            />
            <rect x="500" y="45" width="85" height="6" rx="3" fill="#0f172a" />

            {/* Wheels */}
            <g className="wheels">
              {/* Front Wheel */}
              <circle cx="150" cy="165" r="32" fill="#020617" stroke="#334155" strokeWidth="4" />
              <circle cx="150" cy="165" r="24" fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="150" cy="165" r="8" fill="#1e293b" />

              {/* Rear Wheel */}
              <circle cx="480" cy="165" r="35" fill="#020617" stroke="#334155" strokeWidth="4" />
              <circle cx="480" cy="165" r="26" fill="none" stroke="#64748b" strokeWidth="1" strokeDasharray="4 4" />
              <circle cx="480" cy="165" r="8" fill="#1e293b" />
            </g>

            {/* Headlight Glow */}
            <ellipse cx="80" cy="145" rx="15" ry="8" fill="#f8fafc" opacity="0.6" />

            {/* Side Intake */}
            <path d="M420 130 H460 L450 150 H430 Z" fill="#020617" />
          </svg>

          {/* Exhaust Blur/Heat */}
          <motion.div
            className="absolute left-[-20px] bottom-[25px] w-24 h-12 bg-linear-to-r from-blue-400 to-transparent opacity-30 blur-xl"
            animate={{ width: [24, 60, 24] }}
            transition={{ duration: 0.1, repeat: Infinity }}
          />
        </div>
      </motion.div>

      {/* Epic Text Reveal */}
      <motion.div
        className="absolute bottom-20 text-slate-900 font-black italic text-4xl tracking-tighter uppercase"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: 1, times: [0, 0.5, 1], delay: 0.2 }}
      >
        GT3 RS // ACCELERATING
      </motion.div>
    </motion.div>
  );
};

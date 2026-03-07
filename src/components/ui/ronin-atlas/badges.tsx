import React from 'react';

interface BadgeProps {
  size?: number;
  className?: string;
}

export const SelloComun = ({ size = 48, className }: BadgeProps) => (
  <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
      <rect x="10" y="10" width="80" height="80" rx="10" fill="#95A5A6" fillOpacity="0.1" stroke="#95A5A6" strokeWidth="4" />
      <path d="M30 50L45 65L70 35" stroke="#95A5A6" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

export const SelloRaro = ({ size = 48, className }: BadgeProps) => (
  <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
      <rect x="10" y="10" width="80" height="80" rx="10" fill="#3498DB" fillOpacity="0.1" stroke="#3498DB" strokeWidth="4" />
      <path d="M50 20L80 50L50 80L20 50Z" stroke="#3498DB" strokeWidth="4" />
    </svg>
  </div>
);

export const SelloEpico = ({ size = 48, className }: BadgeProps) => (
  <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
      <rect x="10" y="10" width="80" height="80" rx="10" fill="#9B59B6" fillOpacity="0.1" stroke="#9B59B6" strokeWidth="4" />
      <circle cx="50" cy="50" r="25" stroke="#9B59B6" strokeWidth="4" strokeDasharray="10 5" />
    </svg>
  </div>
);

export const SelloReliquia = ({ size = 48, className }: BadgeProps) => (
  <div className={`relative flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full animate-pulse">
      <rect x="10" y="10" width="80" height="80" rx="10" fill="#F1C40F" fillOpacity="0.1" stroke="#F1C40F" strokeWidth="4" />
      <path d="M50 15L65 40H90L70 55L80 80L50 65L20 80L30 55L10 40H35L50 15Z" fill="#F1C40F" />
    </svg>
  </div>
);

export const BadgeForged = ({ className }: { className?: string }) => (
  <div className={`bg-gradient-to-r from-red-600 to-orange-500 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest ${className}`}>
    FORGED
  </div>
);

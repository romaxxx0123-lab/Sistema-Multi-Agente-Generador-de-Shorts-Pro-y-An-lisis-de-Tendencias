import React from 'react';

/**
 * KATANA SLICE DIVIDER
 */
export const KatanaDivider = ({ className }: { className?: string }) => (
  <div className={`relative h-[2px] w-full overflow-hidden ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    <div className="absolute inset-0 bg-white/40 blur-[1px] transform -skew-x-[45deg]" />
  </div>
);

/**
 * PREMIUM CARD FRAME
 */
export const CardFrame = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={`relative p-[1px] rounded-2xl overflow-hidden ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5" />
    <div className="relative bg-[#16181D] rounded-2xl h-full w-full">
      {children}
    </div>
  </div>
);

/**
 * CTA GLOW DECORATION
 */
export const CTAGlow = ({ color = '#F1C40F', className }: { color?: string, className?: string }) => (
  <div className={`absolute pointer-events-none blur-[40px] opacity-20 ${className}`}
       style={{ backgroundColor: color, width: '150%', height: '150%', top: '-25%', left: '-25%' }} />
);

/**
 * TOOLTIP BUBBLE SHAPE
 */
export const TooltipShape = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 40" className={`fill-black/80 backdrop-blur-md ${className}`}>
    <path d="M0 10C0 4.47715 4.47715 0 10 0H90C95.5228 0 100 4.47715 100 10V30C100 35.5228 95.5228 40 90 40H55L50 45L45 40H10C4.47715 40 0 35.5228 0 30V10Z" />
  </svg>
);

/**
 * SHIMMER MASK
 */
export const ShimmerMask = ({ className }: { className?: string }) => (
  <div className={`absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full animate-[shimmer_2s_infinite] ${className}`} />
);

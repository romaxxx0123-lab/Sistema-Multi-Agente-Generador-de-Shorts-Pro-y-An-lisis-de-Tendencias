import { motion } from 'framer-motion';

/**
 * REUSABLE PROGRESS BAR
 * Smoothly interpolates values and supports dynamic colors (HP/XP).
 */
interface UIProgressBarProps {
  value: number;
  max: number;
  color: string;
  bgColor?: string;
  height?: number;
  width?: number | string;
  showText?: boolean;
  text?: string;
  pulse?: boolean;
}

export function UIProgressBar({
  value,
  max,
  color,
  bgColor = 'rgba(0,0,0,0.5)',
  height = 10,
  width = 300,
  showText = false,
  text = '',
  pulse = false
}: UIProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className="relative rounded-full overflow-hidden backdrop-blur-md border border-white/10"
      style={{
        backgroundColor: bgColor,
        height,
        width,
      }}
    >
      {/* Fill */}
      <motion.div
        initial={{ width: 0 }}
        animate={{
            width: `${percentage}%`,
            transition: { type: 'spring', damping: 20, stiffness: 100 }
        }}
        className={`h-full ${pulse ? 'animate-pulse' : ''}`}
        style={{
          backgroundColor: color,
        }}
      />

      {/* Internal Text */}
      {showText && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-white font-black text-xs uppercase drop-shadow-md">
            {text || `${Math.round(value)}/${max}`}
          </span>
        </div>
      )}
    </div>
  );
}

import { motion } from 'framer-motion';

/**
 * REUSABLE UI BUTTON
 * Implements hover/active scales, golden borders, and arcade styles.
 */
interface UIButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function UIButton({
  children,
  onClick,
  disabled,
  className,
  variant = 'primary'
}: UIButtonProps) {

  const variants = {
    primary: {
      bg: '#F1C40F',
      border: 'none',
      color: '#000000'
    },
    secondary: {
      bg: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      color: '#FFFFFF'
    },
    danger: {
      bg: 'rgba(231, 76, 60, 0.1)',
      border: '1px solid rgba(231, 76, 60, 0.2)',
      color: '#E74C3C'
    },
    ghost: {
        bg: 'transparent',
        border: 'none',
        color: '#FFFFFF'
    }
  };

  const currentVariant = variants[variant];

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.05, filter: 'brightness(1.1)' } : {}}
      whileTap={!disabled ? { scale: 0.95 } : {}}
      onClick={onClick}
      disabled={disabled}
      className={`
        relative px-8 py-4 rounded-xl font-bold uppercase tracking-[0.2em] transition-all backdrop-blur-md
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F1C40F] focus-visible:ring-offset-2 focus-visible:ring-offset-black
        ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        background: currentVariant.bg,
        border: currentVariant.border,
        color: currentVariant.color,
        fontFamily: 'Inter, system-ui, sans-serif',
        minWidth: '160px'
      }}
    >
      {children}
    </motion.button>
  );
}

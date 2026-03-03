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
      bg: 'linear-gradient(to bottom, #2C3E50, #34495E)',
      border: '2px solid #F39C12',
      color: '#FFFFFF'
    },
    secondary: {
      bg: 'linear-gradient(to bottom, #7F8C8D, #95A5A6)',
      border: '2px solid #BDC3C7',
      color: '#FFFFFF'
    },
    danger: {
      bg: 'linear-gradient(to bottom, #C0392B, #E74C3C)',
      border: '2px solid #922B21',
      color: '#FFFFFF'
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
        relative px-6 py-3 rounded-lg font-black uppercase transition-all
        ${disabled ? 'opacity-50 cursor-not-allowed grayscale' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        background: currentVariant.bg,
        border: currentVariant.border,
        color: currentVariant.color,
        boxShadow: !disabled ? '0 4px 0 rgba(0,0,0,0.3)' : 'none',
        fontFamily: 'sans-serif',
        textShadow: '1px 1px 0 rgba(0,0,0,0.5)',
        minWidth: '200px'
      }}
    >
      {children}
    </motion.button>
  );
}

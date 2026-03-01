import React from 'react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'locked';
  size?: 'sm' | 'md' | 'lg' | 'full';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}) => {
  const baseStyles = "relative font-bold uppercase tracking-wide transition-all active:translate-y-[2px] active:shadow-none disabled:active:translate-y-0 disabled:opacity-50";

  const variants = {
    primary: "bg-duo-green text-white border-b-4 border-duo-green-dark hover:brightness-110",
    secondary: "bg-duo-blue text-white border-b-4 border-duo-blue-dark hover:brightness-110",
    danger: "bg-duo-red text-white border-b-4 border-duo-red-dark hover:brightness-110",
    ghost: "bg-transparent text-duo-gray hover:bg-duo-gray-light border-transparent",
    locked: "bg-duo-gray-light text-duo-gray border-b-4 border-duo-gray hover:brightness-100 cursor-not-allowed",
  };

  const sizes = {
    sm: "px-4 py-2 text-sm rounded-xl",
    md: "px-6 py-3 text-base rounded-2xl",
    lg: "px-10 py-4 text-lg rounded-2xl",
    full: "w-full py-4 text-lg rounded-2xl",
  };

  return (
    <motion.button
      whileTap={{ y: 4 }}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      onClick={props.onClick}
      disabled={props.disabled}
      type={props.type}
    >
      {children}
    </motion.button>
  );
};

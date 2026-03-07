import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  color?: string;
}

/**
 * RONIN ICON: TORII (Home)
 */
export const IconTorii = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M2 7H22M4 7V20M20 7V20M7 7V11H17V7M2 4C8 2 16 2 22 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: KATANA (Play)
 */
export const IconKatana = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M4 20L20 4M18 6L19 7M5 19L3 21" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M7 17L5 15M9 19L7 17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/**
 * RONIN ICON: SCROLL (Chapters)
 */
export const IconScroll = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M7 4H19V18C19 19.1046 18.1046 20 17 20H5C3.89543 20 3 19.1046 3 18V6C3 4.89543 3.89543 4 5 4H7ZM7 4V20M7 8H15M7 12H13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: SELLO / SEAL (Talents)
 */
export const IconSeal = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth="2"/>
    <path d="M9 9H15V15H9V9Z" fill={color} opacity="0.5"/>
    <path d="M12 7V17M7 12H17" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/**
 * RONIN ICON: MASK (Loadout)
 */
export const IconMask = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 21C16.9706 21 21 16.9706 21 12V8C21 5.79086 19.2091 4 17 4H7C4.79086 4 3 5.79086 3 8V12C3 16.9706 7.02944 21 12 21Z" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M8 10H9M15 10H16M10 15H14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 4V7" stroke={color} strokeWidth="1.5"/>
  </svg>
);

/**
 * RONIN ICON: OBAN (Gold)
 */
export const IconOban = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <ellipse cx="12" cy="12" rx="7" ry="10" stroke={color} strokeWidth="2"/>
    <path d="M10 9H14M10 12H14M10 15H14" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/**
 * RONIN ICON: SOUL (XP)
 */
export const IconSoul = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2C12 2 5 7 5 13C5 16.866 8.13401 20 12 20C15.866 20 19 16.866 19 13C19 7 12 2 12 2Z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    <path d="M12 8V14M9 11H15" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/**
 * RONIN ICON: GEAR (Settings)
 */
export const IconGear = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: HEART (Health)
 */
export const IconHeart = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: SYNC (Status)
 */
export const IconSync = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2V5M12 19V22M2 12H5M19 12H22" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    <circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2"/>
    <path d="M12 8C14.2091 8 16 9.79086 16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8Z" fill={color} opacity="0.2"/>
  </svg>
);

/**
 * RONIN ICON: CHEST
 */
export const IconChest = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M3 10H21V20C21 21.1046 20.1046 22 19 22H5C3.89543 22 3 21.1046 3 20V10Z" stroke={color} strokeWidth="2"/>
    <path d="M3 10V6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V10H3Z" stroke={color} strokeWidth="2"/>
    <path d="M10 10V14H14V10" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/**
 * RONIN ICON: TIMER
 */
export const IconTimer = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M6 2H18M6 22H18M7 2V8L12 12L17 8V2M7 22V16L12 12L17 16V22" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: EYE (Pickup Range)
 */
export const IconEye = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z" stroke={color} strokeWidth="2"/>
    <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
  </svg>
);

/**
 * RONIN ICON: LIGHTNING
 */
export const IconLightning = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: KUNAI
 */
export const IconKunai = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2L9 8L12 14L15 8L12 2Z" stroke={color} strokeWidth="2"/>
    <path d="M12 14V22" stroke={color} strokeWidth="2"/>
    <circle cx="12" cy="22" r="1" fill={color}/>
  </svg>
);

/**
 * RONIN ICON: SHURIKEN
 */
export const IconShuriken = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="2" stroke={color} strokeWidth="1.5"/>
  </svg>
);

/**
 * RONIN ICON: WARNING
 */
export const IconWarning = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M12 9V14M12 18H12.01M3 20H21L12 4L3 20Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/**
 * RONIN ICON: RANK (Crown)
 */
export const IconRank = ({ size = 24, color = 'currentColor', ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M5 20H19" stroke={color} strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

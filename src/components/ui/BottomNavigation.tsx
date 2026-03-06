import { motion } from 'framer-motion';
import { useGameStore, MenuScreen } from '../../store/useGameStore';
import { TOKENS } from '../../styles/tokens';
import {
  IconTorii,
  IconScroll,
  IconMask,
  IconSeal,
  IconGear
} from './ronin-atlas';

interface NavItem {
  id: MenuScreen;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'chapters', label: 'MISIÓN', icon: IconScroll },
  { id: 'loadout', label: 'EQUIPO', icon: IconMask },
  { id: 'home', label: 'DOJO', icon: IconTorii },
  { id: 'talents', label: 'SENDA', icon: IconSeal },
  { id: 'settings', label: 'HONOR', icon: IconGear },
];

const COMING_SOON_TABS: string[] = ['settings']; // Honor is currently mapped to settings, but we want it as Coming Soon per prompt

export function BottomNavigation() {
  const currentScreen = useGameStore((state) => state.menuScreen);
  const setMenuScreen = useGameStore((state) => state.setMenuScreen);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-8 pt-4 pointer-events-none">
      <div className="max-w-md mx-auto relative flex justify-around items-end bg-black/40 backdrop-blur-xl border-t border-white/10 rounded-t-[32px] pointer-events-auto shadow-2xl overflow-hidden">

        {/* Katana Edge Decoration */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

        {NAV_ITEMS.map((item) => {
          const isActive = currentScreen === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                if (COMING_SOON_TABS.includes(item.id)) {
                    (window as any).triggerComingSoon();
                } else {
                    setMenuScreen(item.id, false);
                }
              }}
              className={`relative flex flex-col items-center justify-center py-4 flex-1 group transition-all duration-300 focus:outline-none focus-visible:ring-2 ring-white/20 rounded-xl ${
                isActive ? 'opacity-100' : 'opacity-40 hover:opacity-60'
              }`}
              aria-label={item.label}
            >
              {/* Active Glow/Pill */}
              {isActive && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 bg-white/[0.03] rounded-xl"
                  transition={TOKENS.animations.base}
                />
              )}

              <div className="relative mb-1">
                <Icon
                  size={isActive ? 28 : 24}
                  color={isActive ? TOKENS.colors.goldBright : TOKENS.colors.white}
                  className="transition-transform duration-300 group-active:scale-90"
                />

                {isActive && (
                  <motion.div
                    layoutId="nav-dot"
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-gold shadow-[0_0_8px_#F1C40F]"
                    style={{ backgroundColor: TOKENS.colors.goldBright }}
                  />
                )}
              </div>

              <span className={`text-[10px] font-black tracking-[0.2em] transition-all duration-300 ${
                isActive ? 'text-white' : 'text-white/40'
              }`}>
                {item.label}
              </span>

              {/* Katana Slice Visual on Active */}
              {isActive && (
                <motion.div
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 5 }}
                  className="absolute bottom-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-gold to-transparent opacity-50"
                  style={{ backgroundColor: TOKENS.colors.gold }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, MenuScreen } from '../../store/useGameStore';
import { HomeScreen } from './HomeScreen';
import { ChaptersScreen } from './ChaptersScreen';
import { LoadoutScreen } from './LoadoutScreen';
import { TalentsScreen } from './TalentsScreen';
import { SettingsScreen } from './SettingsScreen';
import { AssetGallery } from '../AssetGallery';
import { CharacterSelector } from './CharacterSelector';
import { useEffect } from 'react';

/**
 * MENU ROOT
 * Orchestrates navigation between Hub screens with transitions.
 */
export function MenuRoot() {
  const { menuScreen, goBack, view } = useGameStore();

  // Global Escape Listener
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && view === 'menu') {
        goBack();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [view, goBack]);

  const renderScreen = () => {
    switch (menuScreen) {
      case 'home': return <HomeScreen />;
      case 'chapters': return <ChaptersScreen />;
      case 'loadout': return <LoadoutScreen />;
      case 'talents': return <TalentsScreen />;
      case 'settings': return <SettingsScreen />;
      case 'gallery': return <AssetGallery />;
      case 'characters': return <CharacterSelector />;
      default: return <HomeScreen />;
    }
  };

  return (
    <div className="fixed inset-0 z-10 w-full h-full bg-[#0a0a0a] overflow-hidden">
        {/* Background Decorative Gradient */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-red-900 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-blue-900 rounded-full blur-[150px]" />
        </div>

        <AnimatePresence mode="wait">
            <motion.div
                key={menuScreen}
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -20, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full h-full"
            >
                {renderScreen()}
            </motion.div>
        </AnimatePresence>
    </div>
  );
}

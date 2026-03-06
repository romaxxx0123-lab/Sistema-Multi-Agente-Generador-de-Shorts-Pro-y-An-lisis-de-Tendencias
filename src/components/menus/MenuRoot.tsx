import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore, MenuScreen } from '../../store/useGameStore';
import { HomeScreen } from './HomeScreen';
import { ChaptersScreen } from './ChaptersScreen';
import { LoadoutScreen } from './LoadoutScreen';
import { TalentsScreen } from './TalentsScreen';
import { SettingsScreen } from './SettingsScreen';
import { AssetGallery } from '../AssetGallery';
import { CharacterSelector } from './CharacterSelector';
import { BottomNavigation } from '../ui/BottomNavigation';
import { useState, useEffect } from 'react';
import { TOKENS } from '../../styles/tokens';
import { UIButton } from '../ui/UIButton';
import { IconSeal } from '../ui/ronin-atlas';

/**
 * MENU ROOT
 * Orchestrates navigation between Hub screens with transitions.
 */
export function MenuRoot() {
  const { menuScreen, goBack, view, setMenuScreen } = useGameStore();
  const [showComingSoon, setShowComingSoon] = useState(false);

  // Expose coming soon globally for HomeScreen
  useEffect(() => {
    (window as any).triggerComingSoon = () => setShowComingSoon(true);
  }, []);

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
        <div className="absolute inset-0 opacity-25 pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-red-950 rounded-full blur-[180px] animate-pulse" style={{ animationDuration: '8s' }} />
            <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-blue-950 rounded-full blur-[180px] animate-pulse" style={{ animationDuration: '12s' }} />
        </div>

        {/* Procedural Fog / Noise Overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full scale-150">
                <filter id="noiseFilter">
                    <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#noiseFilter)" />
            </svg>
        </div>

        {/* Global Menu Vignette */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.8)_100%)] z-10" />

        {/* Persistent Bottom Navigation */}
        {menuScreen !== 'characters' && <BottomNavigation />}

        {/* Coming Soon Modal */}
        <AnimatePresence>
            {showComingSoon && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-10 backdrop-blur-md bg-black/40">
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-[#0A0A0A] p-10 rounded-[32px] border-2 border-white/10 w-[400px] text-center shadow-[0_0_60px_rgba(0,0,0,0.8)]"
                    >
                        <div className="w-20 h-20 bg-white/5 rounded-3xl mx-auto flex items-center justify-center mb-6 border border-white/10">
                            <IconSeal size={40} color={TOKENS.colors.gold} opacity={0.2} />
                        </div>
                        <h3 className="text-2xl font-black italic text-white uppercase tracking-tighter mb-2">PRÓXIMAMENTE</h3>
                        <p className="text-white/40 text-xs font-bold uppercase tracking-widest leading-relaxed mb-8">
                            Este sistema está bajo forja mística. Llegará en la próxima actualización del Dojo.
                        </p>
                        <UIButton onClick={() => setShowComingSoon(false)} className="!w-full !py-4 !bg-white/10 !text-white !text-sm">ENTENDIDO</UIButton>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

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

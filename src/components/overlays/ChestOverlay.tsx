import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Sparkles, TrendingUp, Coins } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';

/**
 * CHEST OVERLAY
 * Professional reward screen for opening chests.
 */
export function ChestOverlay() {
  const status = useGameStore((state) => state.status);
  const setStatus = useGameStore((state) => state.setStatus);
  const addCoin = useGameStore((state) => state.addCoin);
  const metaXp = useGameStore((state) => state.metaXp);

  const [reward, setReward] = useState<{ gold: number, xp: number } | null>(null);

  useEffect(() => {
    if (status === 'chest') {
        const gold = Math.floor(Math.random() * 200) + 100;
        const xp = Math.floor(Math.random() * 500) + 250;
        setReward({ gold, xp });
    } else {
        setReward(null);
    }
  }, [status]);

  if (status !== 'chest' || !reward) return null;

  const handleCollect = () => {
      addCoin(reward.gold);
      // Meta XP is handled at end run usually, but we could add it here too
      setStatus('playing');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-[#1A1A1A] p-12 rounded-[40px] border-2 border-[#9B59B6]/30 w-[500px] text-center shadow-[0_0_100px_rgba(155,89,182,0.2)]"
      >
        <div className="relative mb-12">
            <motion.div
                animate={{
                    rotate: [0, -10, 10, -10, 0],
                    scale: [1, 1.1, 1, 1.1, 1]
                }}
                transition={{ repeat: Infinity, duration: 4 }}
                className="w-32 h-32 bg-[#9B59B6] rounded-3xl mx-auto flex items-center justify-center shadow-[0_0_40px_rgba(155,89,182,0.4)]"
            >
                <Gift size={64} className="text-white" />
            </motion.div>
            <Sparkles className="absolute -top-4 -right-4 text-[#F1C40F]" size={48} />
        </div>

        <h2 className="text-4xl font-black italic text-white mb-2 tracking-tighter uppercase">¡COFRE MÍSTICO!</h2>
        <p className="text-[#9B59B6] font-bold uppercase tracking-[0.3em] text-xs mb-10">Recompensas Ancestrales Encontradas</p>

        <div className="space-y-4 mb-12">
            <RewardItem
                icon={<Coins className="text-[#F1C40F]" size={20} />}
                label="KOBANS"
                value={`+${reward.gold}`}
                color="#F1C40F"
            />
            <RewardItem
                icon={<TrendingUp className="text-cyan-400" size={20} />}
                label="BONDAD ESPIRITUAL"
                value={`+${reward.xp} XP`}
                color="#22D3EE"
            />
        </div>

        <UIButton
            onClick={handleCollect}
            className="!w-full !py-6 !text-xl !bg-[#9B59B6] !text-white border-none shadow-[0_10px_30px_rgba(155,89,182,0.3)] hover:!scale-105"
        >
            RECLAMAR TODO
        </UIButton>
      </motion.div>
    </div>
  );
}

function RewardItem({ icon, label, value, color }: any) {
    return (
        <div className="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center">
                    {icon}
                </div>
                <span className="text-xs font-black text-white/40 tracking-widest uppercase">{label}</span>
            </div>
            <span className="text-xl font-black italic" style={{ color }}>{value}</span>
        </div>
    );
}

import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore';
import { UIButton } from '../ui/UIButton';
import { TUNING } from '../../data/tuning';
import { AbilityType, PassiveType } from '../../types/abilities';
import { ABILITY_METADATA } from '../../data/abilities';
import { IconChest, IconOban, BadgeForged, SelloComun, SelloRaro, SelloEpico, SelloReliquia } from '../ui/ronin-atlas';

/**
 * CHEST OVERLAY
 * Professional reward screen for opening chests.
 */
export function ChestOverlay() {
  const status = useGameStore((state) => state.status);
  const setStatus = useGameStore((state) => state.setStatus);
  const popPendingOverlay = useGameStore((state) => state.popPendingOverlay);
  const addCoin = useGameStore((state) => state.addCoin);
  const abilities = useGameStore((state) => state.abilities);
  const passives = useGameStore((state) => state.passives);
  const upgradeAbility = useGameStore((state) => state.upgradeAbility);

  const [reward, setReward] = useState<any>(null);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (status === 'chest') {
        // Roll rarity
        const rand = Math.random();
        let rarity: 'COMMON' | 'RARE' | 'EPIC' | 'RELIC' = 'COMMON';
        if (rand < TUNING.CHESTS.RELIC.weight) rarity = 'RELIC';
        else if (rand < TUNING.CHESTS.EPIC.weight + TUNING.CHESTS.RELIC.weight) rarity = 'EPIC';
        else if (rand < TUNING.CHESTS.RARE.weight + TUNING.CHESTS.EPIC.weight + TUNING.CHESTS.RELIC.weight) rarity = 'RARE';

        const config = TUNING.CHESTS[rarity];

        // Generate Rewards
        const rewards = [];

        // Always gold
        rewards.push({ type: 'gold', value: config.gold, label: 'KOBANS', icon: <Coins size={20} /> });

        // Upgrades
        for (let i = 0; i < config.rewards; i++) {
            // Pick a random available upgrade (skill or passive)
            const skills: AbilityType[] = ['orbital', 'lightning', 'aura', 'barrage', 'iai_slash'];
            const passList: PassiveType[] = ['damage', 'cdr', 'movespeed', 'magnet', 'maxhp', 'gold', 'crit'];

            const availableSkills = skills.filter(s => (abilities.get(s)?.level || 0) < 8);
            const availablePassives = passList.filter(p => (passives.get(p) || 0) < 5);
            const pool = [...availableSkills.map(s => ({id: s, type: 'skill'})), ...availablePassives.map(p => ({id: p, type: 'passive'}))];

            if (pool.length > 0) {
                const choice = pool[Math.floor(Math.random() * pool.length)];
                const meta = ABILITY_METADATA[choice.id];
                rewards.push({
                    type: 'upgrade',
                    id: choice.id,
                    upgradeType: choice.type,
                    label: meta.title,
                    icon: meta.icon,
                    rarity: meta.rarity
                });
            }
        }

        setReward({ rarity, rewards });
        setRevealed(0);
    } else {
        setReward(null);
    }
  }, [status, abilities, passives]);

  if (status !== 'chest' || !reward) return null;

  const handleCollect = () => {
      reward.rewards.forEach((r: any) => {
          if (r.type === 'gold') addCoin(r.value);
          if (r.type === 'upgrade') {
              // Evolution Check
              const current = abilities.get(r.id as AbilityType);
              if (current && current.level === 8 && !current.stats.isEvolved) {
                  // Check Evolution pairing
                  const pairs: Record<string, string> = { iai_slash: 'cdr', orbital: 'magnet' };
                  if (passives.get(pairs[r.id] as PassiveType) === 5) {
                      useGameStore.getState().evolveAbility(r.id as AbilityType);
                  } else {
                      upgradeAbility(r.id, r.upgradeType);
                  }
              } else {
                  upgradeAbility(r.id, r.upgradeType);
              }
          }
      });
      popPendingOverlay();
  };

  const currentRarityColor = reward.rarity === 'RELIC' ? '#F1C40F' : (reward.rarity === 'EPIC' ? '#9B59B6' : (reward.rarity === 'RARE' ? '#3498DB' : '#95A5A6'));
  const RaritySeal = reward.rarity === 'RELIC' ? SelloReliquia : (reward.rarity === 'EPIC' ? SelloEpico : (reward.rarity === 'RARE' ? SelloRaro : SelloComun));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6">
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="bg-[#1A1A1A] p-8 md:p-12 rounded-[40px] border-2 border-[#9B59B6]/30 w-full max-w-[500px] text-center shadow-[0_0_100px_rgba(155,89,182,0.2)]"
      >
        <div className="relative mb-8 md:mb-12">
            <motion.div
                animate={{
                    rotate: [0, -10, 10, -10, 0],
                    scale: [1, 1.05, 1, 1.05, 1]
                }}
                transition={{ repeat: Infinity, duration: 4 }}
                className="w-32 h-32 mx-auto flex items-center justify-center relative"
            >
                <RaritySeal size={128} />
                <div className="absolute inset-0 flex items-center justify-center">
                    <IconChest size={64} color="#fff" />
                </div>
            </motion.div>
        </div>

        <h2 className="text-4xl font-black italic text-white mb-2 tracking-tighter uppercase" style={{ color: currentRarityColor }}>
            {reward.rarity === 'RELIC' ? '¡RELICARIO SAGRADO!' : `¡SELLO ${reward.rarity}!`}
        </h2>
        <p className="text-white/40 font-bold uppercase tracking-[0.3em] text-[10px] mb-10">Recompensas Ancestrales Encontradas</p>

        <div className="space-y-3 mb-12">
            <AnimatePresence>
                {reward.rewards.map((r: any, i: number) => (
                    <motion.div
                        key={i}
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: i * 0.2 }}
                    >
                        <RewardItem
                            icon={r.icon}
                            label={r.label}
                            value={r.type === 'gold' ? `+${r.value}` : 'MEJORA'}
                            color={r.type === 'gold' ? '#F1C40F' : '#2ECC71'}
                        />
                    </motion.div>
                ))}
            </AnimatePresence>
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

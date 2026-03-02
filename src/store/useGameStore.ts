import { create } from 'zustand';
import { Mesh } from 'three';
import { GAME_CONFIG } from '../config';

export type UpgradeType = 'damage' | 'speed' | 'hp' | 'attack_cd' | 'dash_cd';

export interface UpgradeOption {
  type: UpgradeType;
  label: string;
  description: string;
}

const UPGRADE_POOL: UpgradeOption[] = [
  { type: 'damage', label: '+20% Daño', description: 'Aumenta el daño de tus ataques.' },
  { type: 'speed', label: '+15% Velocidad', description: 'Aumenta tu velocidad de movimiento.' },
  { type: 'hp', label: '+30 Vida Máx', description: 'Aumenta tu vida máxima y te cura.' },
  { type: 'attack_cd', label: '-0.2s Recarga Ataque', description: 'Ataca con más frecuencia.' },
  { type: 'dash_cd', label: '-0.5s Recarga Dash', description: 'Usa el dash más seguido.' },
];

interface GameState {
  status: 'playing' | 'paused' | 'gameover' | 'levelup';
  playerRef: Mesh | null;

  // Stats
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  kills: number;

  // Modifiers
  damageMultiplier: number;
  speedMultiplier: number;
  attackCooldownModifier: number;
  dashCooldownModifier: number;

  // Level Up
  upgradeOptions: UpgradeOption[];

  // Actions
  setStatus: (status: 'playing' | 'paused' | 'gameover' | 'levelup') => void;
  setPlayerRef: (ref: Mesh | null) => void;
  togglePause: () => void;

  takeDamage: (amount: number) => void;
  addXP: (amount: number) => void;
  addKill: () => void;
  applyUpgrade: (upgrade: UpgradeOption) => void;
  resetGame: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  status: 'playing',
  playerRef: null,

  hp: GAME_CONFIG.PLAYER.INITIAL_HP,
  maxHp: GAME_CONFIG.PLAYER.INITIAL_HP,
  xp: 0,
  level: 1,
  kills: 0,

  damageMultiplier: 1,
  speedMultiplier: 1,
  attackCooldownModifier: 0,
  dashCooldownModifier: 0,

  upgradeOptions: [],

  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),

  togglePause: () => set((state) => {
    if (state.status === 'levelup') return state; // Can't unpause from levelup via toggle
    return {
      status: state.status === 'playing' ? 'paused' : (state.status === 'paused' ? 'playing' : state.status)
    };
  }),

  takeDamage: (amount) => set((state) => {
    const newHp = Math.max(0, state.hp - amount);
    if (newHp <= 0) {
      return { hp: 0, status: 'gameover' };
    }
    return { hp: newHp };
  }),

  addXP: (amount) => {
    const state = get();
    let newXp = state.xp + amount;
    let newLevel = state.level;
    let xpNeeded = newLevel * GAME_CONFIG.PROGRESSION.XP_BASE;
    let leveledUp = false;

    while (newXp >= xpNeeded) {
      newXp -= xpNeeded;
      newLevel += 1;
      xpNeeded = newLevel * GAME_CONFIG.PROGRESSION.XP_BASE;
      leveledUp = true;
    }

    if (leveledUp) {
      // Select 3 random unique upgrades
      const shuffled = [...UPGRADE_POOL].sort(() => 0.5 - Math.random());
      const options = shuffled.slice(0, 3);

      set({
        xp: newXp,
        level: newLevel,
        status: 'levelup',
        upgradeOptions: options
      });
    } else {
      set({ xp: newXp });
    }
  },

  addKill: () => set((state) => ({ kills: state.kills + 1 })),

  applyUpgrade: (upgrade) => set((state) => {
    const changes: Partial<GameState> = { status: 'playing' };

    switch (upgrade.type) {
      case 'damage':
        changes.damageMultiplier = state.damageMultiplier + GAME_CONFIG.UPGRADES.DAMAGE_BOOST;
        break;
      case 'speed':
        changes.speedMultiplier = state.speedMultiplier + GAME_CONFIG.UPGRADES.SPEED_BOOST;
        break;
      case 'hp':
        changes.maxHp = state.maxHp + GAME_CONFIG.UPGRADES.HP_BOOST;
        changes.hp = state.hp + GAME_CONFIG.UPGRADES.HP_BOOST; // Also heal the amount
        break;
      case 'attack_cd':
        changes.attackCooldownModifier = state.attackCooldownModifier + GAME_CONFIG.UPGRADES.ATTACK_CD_REDUCTION;
        break;
      case 'dash_cd':
        changes.dashCooldownModifier = state.dashCooldownModifier + GAME_CONFIG.UPGRADES.DASH_CD_REDUCTION;
        break;
    }

    return changes;
  }),

  resetGame: () => set({
    status: 'playing',
    hp: GAME_CONFIG.PLAYER.INITIAL_HP,
    maxHp: GAME_CONFIG.PLAYER.INITIAL_HP,
    xp: 0,
    level: 1,
    kills: 0,
    damageMultiplier: 1,
    speedMultiplier: 1,
    attackCooldownModifier: 0,
    dashCooldownModifier: 0,
    upgradeOptions: [],
  }),
}));

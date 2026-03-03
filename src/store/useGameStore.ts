import { create } from 'zustand';
import { Mesh } from 'three';

/**
 * GAME STORE - GLOBAL STATE MANAGEMENT
 * Expanded to handle UI, Stats, Run Metadata, and Settings.
 */

export interface RunStats {
  hp: number;
  maxHp: number;
  xp: number;
  xpToLevel: number;
  level: number;
  coins: number;
  kills: number;
  time: number;
  dashCharges: number;
  maxDashCharges: number;
}

interface GameState {
  // Navigation & Status
  view: 'menu' | 'characters' | 'game';
  status: 'playing' | 'paused' | 'levelup' | 'gameover' | 'victory';

  // Player Reference (for camera/physics)
  playerRef: Mesh | null;

  // Run Data
  run: RunStats;
  metaXp: number;
  totalRuns: number;

  // Selection
  selectedCharacter: string;

  // Actions
  setView: (view: GameState['view']) => void;
  setStatus: (status: GameState['status']) => void;
  setPlayerRef: (ref: Mesh | null) => void;

  // Run Actions
  takeDamage: (amount: number) => void;
  addXp: (amount: number) => void;
  addCoin: (amount: number) => void;
  addKill: () => void;
  updateTime: (delta: number) => void;
  useDash: () => void;
  rechargeDash: () => void;

  // Lifecycle
  startRun: () => void;
  finishRun: (victory: boolean) => void;
  resetGame: () => void;
}

const INITIAL_RUN: RunStats = {
  hp: 100,
  maxHp: 100,
  xp: 0,
  xpToLevel: 100,
  level: 1,
  coins: 0,
  kills: 0,
  time: 0,
  dashCharges: 2,
  maxDashCharges: 2
};

export const useGameStore = create<GameState>((set) => ({
  view: 'menu',
  status: 'paused',
  playerRef: null,
  run: { ...INITIAL_RUN },
  metaXp: 450, // Mock initial progress
  totalRuns: 12,
  selectedCharacter: 'ronin',

  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),

  takeDamage: (amount) => set((state) => {
    const newHp = Math.max(0, state.run.hp - amount);
    if (newHp === 0) return { run: { ...state.run, hp: 0 }, status: 'gameover' };
    return { run: { ...state.run, hp: newHp } };
  }),

  addXp: (amount) => set((state) => {
    let { xp, level, xpToLevel } = state.run;
    xp += amount;

    if (xp >= xpToLevel) {
      xp -= xpToLevel;
      level += 1;
      xpToLevel = Math.round(xpToLevel * 1.5);
      // Trigger levelup status
      return {
        run: { ...state.run, xp, level, xpToLevel },
        status: 'levelup'
      };
    }

    return { run: { ...state.run, xp } };
  }),

  addCoin: (amount) => set((state) => ({
    run: { ...state.run, coins: state.run.coins + amount }
  })),

  addKill: () => set((state) => ({
    run: { ...state.run, kills: state.run.kills + 1 }
  })),

  updateTime: (delta) => set((state) => ({
    run: { ...state.run, time: state.run.time + delta }
  })),

  useDash: () => set((state) => ({
    run: { ...state.run, dashCharges: Math.max(0, state.run.dashCharges - 1) }
  })),

  rechargeDash: () => set((state) => ({
    run: { ...state.run, dashCharges: Math.min(state.run.maxDashCharges, state.run.dashCharges + 1) }
  })),

  startRun: () => set({
    view: 'game',
    status: 'playing',
    run: { ...INITIAL_RUN }
  }),

  finishRun: (victory) => set((state) => ({
    status: victory ? 'victory' : 'gameover',
    metaXp: state.metaXp + (victory ? 345 : 120),
    totalRuns: state.totalRuns + 1
  })),

  resetGame: () => set({
    view: 'menu',
    status: 'paused',
    run: { ...INITIAL_RUN }
  })
}));

import { create } from 'zustand';
import { Mesh } from 'three';
import { saveSystem } from '../utils/saveSystem';

/**
 * GAME STORE - GLOBAL STATE MANAGEMENT
 * Handles UI, Stats, Run Metadata, and Enemy Entities.
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

export interface EnemyEntity {
  id: string;
  type: 'oni' | 'ninja' | 'skeleton';
  position: [number, number, number];
  hp: number;
  maxHp: number;
}

interface GameState {
  // Navigation & Status
  view: 'menu' | 'characters' | 'game' | 'gallery';
  status: 'playing' | 'paused' | 'levelup' | 'gameover' | 'victory';

  // Player Reference (for camera/physics)
  playerRef: Mesh | null;

  // Run Data
  run: RunStats;
  metaXp: number;
  totalRuns: number;

  // Selection
  selectedCharacter: string;

  // Enemies
  enemies: EnemyEntity[];

  // Actions
  setView: (view: GameState['view']) => void;
  setSelectedCharacter: (id: string) => void;
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

  // Enemy Actions
  spawnEnemy: (enemy: EnemyEntity) => void;
  damageEnemy: (id: string, amount: number) => void;
  removeEnemy: (id: string) => void;

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

const savedData = saveSystem.load();

export const useGameStore = create<GameState>((set) => ({
  view: 'menu',
  status: 'paused',
  playerRef: null,
  run: { ...INITIAL_RUN },
  metaXp: savedData.metaXp,
  totalRuns: savedData.totalRuns,
  selectedCharacter: 'ronin',
  enemies: [],

  setView: (view) => set({ view }),
  setSelectedCharacter: (selectedCharacter) => set({ selectedCharacter }),
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

  spawnEnemy: (enemy) => set((state) => ({
      enemies: [...state.enemies, enemy]
  })),

  damageEnemy: (id, amount) => set((state) => ({
      enemies: state.enemies.map(e => e.id === id ? { ...e, hp: Math.max(0, e.hp - amount) } : e)
  })),

  removeEnemy: (id) => set((state) => ({
      enemies: state.enemies.filter(e => e.id !== id)
  })),

  startRun: () => set({
    view: 'game',
    status: 'playing',
    run: { ...INITIAL_RUN },
    enemies: []
  }),

  finishRun: (victory) => set((state) => {
    const nextMetaXp = state.metaXp + (victory ? 345 : 120);
    const nextTotalRuns = state.totalRuns + 1;

    saveSystem.save({
      ...saveSystem.load(),
      metaXp: nextMetaXp,
      totalRuns: nextTotalRuns
    });

    return {
      status: victory ? 'victory' : 'gameover',
      metaXp: nextMetaXp,
      totalRuns: nextTotalRuns,
      enemies: []
    };
  }),

  resetGame: () => set({
    view: 'menu',
    status: 'paused',
    run: { ...INITIAL_RUN },
    enemies: []
  })
}));

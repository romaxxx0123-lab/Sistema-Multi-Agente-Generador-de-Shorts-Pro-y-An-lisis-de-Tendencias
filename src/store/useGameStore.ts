import { create } from 'zustand';
import { Mesh } from 'three';
import { saveSystem } from '../utils/saveSystem';
import { AbilityType, AbilityStats } from '../types/abilities';

/**
 * GAME STORE - GLOBAL STATE MANAGEMENT
 * Handles UI, Stats, Run Metadata, Enemy Entities, and Auto-Abilities.
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
  type: 'oni' | 'ninja' | 'skeleton' | 'samurai';
  position: [number, number, number];
  hp: number;
  maxHp: number;
  isElite?: boolean;
}

export interface ActiveAbility {
  id: AbilityType;
  level: number;
  stats: AbilityStats;
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

  // Auto-Abilities
  abilities: Map<AbilityType, ActiveAbility>;

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

  // Ability Actions
  upgradeAbility: (id: AbilityType) => void;

  // Enemy Actions
  spawnEnemy: (enemy: EnemyEntity) => void;
  updateEnemyPosition: (id: string, position: [number, number, number]) => void;
  damageEnemy: (id: string, amount: number) => void;
  attackNearbyEnemies: (playerPos: [number, number, number], range: number, damage: number) => void;
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

// Initial Stats for Abilities (Level 1)
const DEFAULT_ABILITY_STATS: Record<AbilityType, AbilityStats> = {
  orbital: { level: 1, damage: 15, range: 2, cooldown: 0, count: 2, speed: 180 },
  lightning: { level: 1, damage: 40, range: 10, cooldown: 3, count: 1, speed: 0 },
  aura: { level: 1, damage: 5, range: 3, cooldown: 1, count: 1, speed: 0 },
  barrage: { level: 1, damage: 20, range: 15, cooldown: 2, count: 1, speed: 10 }
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
  abilities: new Map(),
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

  upgradeAbility: (id) => set((state) => {
    const nextAbilities = new Map(state.abilities);
    const current = nextAbilities.get(id);

    if (!current) {
        // Unlock Level 1
        nextAbilities.set(id, { id, level: 1, stats: { ...DEFAULT_ABILITY_STATS[id] } });
    } else {
        // Level Up (scaling)
        const nextLevel = Math.min(5, current.level + 1);
        const nextStats = { ...current.stats, level: nextLevel };

        if (id === 'orbital') nextStats.count += 1;
        if (id === 'lightning') nextStats.cooldown = Math.max(1.4, nextStats.cooldown - 0.4);
        if (id === 'aura') nextStats.range += 0.5;
        if (id === 'barrage') nextStats.count += 1;

        nextAbilities.set(id, { id, level: nextLevel, stats: nextStats });
    }

    return { abilities: nextAbilities, status: 'playing' };
  }),

  spawnEnemy: (enemy) => set((state) => ({
      enemies: [...state.enemies, enemy]
  })),

  updateEnemyPosition: (id, position) => set((state) => ({
    enemies: state.enemies.map(e => e.id === id ? { ...e, position } : e)
  })),

  damageEnemy: (id, amount) => set((state) => ({
      enemies: state.enemies.map(e => e.id === id ? { ...e, hp: Math.max(0, e.hp - amount) } : e)
  })),

  attackNearbyEnemies: (playerPos, range, damage) => set((state) => {
    const [px, py, pz] = playerPos;
    return {
      enemies: state.enemies.map(e => {
        const [ex, ey, ez] = e.position;
        const distSq = (px - ex) ** 2 + (py - ey) ** 2 + (pz - ez) ** 2;
        if (distSq <= range * range) {
          return { ...e, hp: Math.max(0, e.hp - damage) };
        }
        return e;
      })
    };
  }),

  removeEnemy: (id) => set((state) => ({
      enemies: state.enemies.filter(e => e.id !== id)
  })),

  startRun: () => {
    const initialAbilities = new Map<AbilityType, ActiveAbility>();
    // Start with level 1 orbital for free in this demo
    initialAbilities.set('orbital', { id: 'orbital', level: 1, stats: { ...DEFAULT_ABILITY_STATS['orbital'] } });

    set({
        view: 'game',
        status: 'playing',
        run: { ...INITIAL_RUN },
        enemies: [],
        abilities: initialAbilities
    });
  },

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
    enemies: [],
    abilities: new Map()
  })
}));

// Expose store for testing
if (typeof window !== 'undefined') {
  (window as any).useGameStore = useGameStore;
}

import { create } from 'zustand';
import { Mesh } from 'three';
import { saveSystem, MetaSaveData } from '../utils/saveSystem';
import { AbilityType, AbilityStats } from '../types/abilities';

/**
 * GAME STORE - GLOBAL STATE MANAGEMENT
 * Handles UI, Hub Navigation, Stats, Run Metadata, Enemy Entities, and Auto-Abilities.
 */

export type MenuScreen = 'home' | 'chapters' | 'loadout' | 'talents' | 'settings' | 'gallery' | 'characters';

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
  goldRun: number;
}

export interface EnemyEntity {
  id: string;
  type: 'oni' | 'ninja' | 'skeleton' | 'samurai';
  position: [number, number, number];
  hp: number;
  maxHp: number;
  isElite?: boolean;
  isBoss?: boolean;
}

export interface PickupEntity {
  id: string;
  type: 'xp' | 'gold' | 'chest';
  position: [number, number, number];
  value: number;
}

export interface ActiveAbility {
  id: AbilityType;
  level: number;
  stats: AbilityStats;
}

interface GameState {
  // Navigation & Status
  view: 'menu' | 'game';
  menuScreen: MenuScreen;
  menuHistory: MenuScreen[];
  status: 'playing' | 'paused' | 'levelup' | 'chest' | 'gameover' | 'victory';

  // Player Reference (for camera/physics)
  playerRef: Mesh | null;

  // Run Data
  run: RunStats;
  metaXp: number;
  totalRuns: number;

  // Hub / Meta State
  unlockedChapters: string[];
  selectedChapterId: string;
  selectedCharacter: string;
  loadoutPerk: string | null;
  talents: MetaSaveData['talents'];
  settings: MetaSaveData['settings'];

  // Auto-Abilities
  abilities: Map<AbilityType, ActiveAbility>;

  // Entities
  enemies: EnemyEntity[];
  pickups: PickupEntity[];

  // Actions
  setView: (view: GameState['view']) => void;
  setMenuScreen: (screen: MenuScreen, push?: boolean) => void;
  goBack: () => void;
  setSelectedCharacter: (id: string) => void;
  setStatus: (status: GameState['status']) => void;
  setPlayerRef: (ref: Mesh | null) => void;

  // Meta Actions
  buyTalent: (talent: keyof MetaSaveData['talents']) => void;
  updateSettings: (settings: Partial<MetaSaveData['settings']>) => void;
  selectChapter: (id: string) => void;
  selectPerk: (id: string | null) => void;

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

  // Entity Actions
  spawnEnemy: (enemy: EnemyEntity) => void;
  updateEnemyPosition: (id: string, position: [number, number, number]) => void;
  damageEnemy: (id: string, amount: number) => void;
  attackNearbyEnemies: (playerPos: [number, number, number], range: number, damage: number) => void;
  removeEnemy: (id: string) => void;

  spawnPickup: (pickup: PickupEntity) => void;
  collectPickup: (id: string) => void;

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
  maxDashCharges: 2,
  goldRun: 0
};

const DEFAULT_ABILITY_STATS: Record<AbilityType, AbilityStats> = {
  orbital: { level: 1, damage: 15, range: 2, cooldown: 0, count: 2, speed: 180 },
  lightning: { level: 1, damage: 40, range: 10, cooldown: 3, count: 1, speed: 0 },
  aura: { level: 1, damage: 5, range: 3, cooldown: 1, count: 1, speed: 0 },
  barrage: { level: 1, damage: 20, range: 15, cooldown: 2, count: 1, speed: 10 }
};

const savedData = saveSystem.load();

export const useGameStore = create<GameState>((set, get) => ({
  view: 'menu',
  menuScreen: 'home',
  menuHistory: [],
  status: 'paused',
  playerRef: null,
  run: { ...INITIAL_RUN },
  metaXp: savedData.metaXp,
  totalRuns: savedData.totalRuns,
  unlockedChapters: savedData.unlockedChapters,
  selectedChapterId: savedData.selectedChapterId,
  selectedCharacter: savedData.unlockedCharacters[0] || 'ronin',
  loadoutPerk: savedData.loadoutPerk,
  talents: savedData.talents,
  settings: savedData.settings,
  abilities: new Map(),
  enemies: [],
  pickups: [],

  setView: (view) => set({ view }),

  setMenuScreen: (screen, push = true) => set((state) => {
    if (screen === state.menuScreen) return state;
    const history = push ? [...state.menuHistory, state.menuScreen] : state.menuHistory;
    return { menuScreen: screen, menuHistory: history };
  }),

  goBack: () => set((state) => {
    if (state.menuHistory.length === 0) return state;
    const newHistory = [...state.menuHistory];
    const prevScreen = newHistory.pop()!;
    return { menuScreen: prevScreen, menuHistory: newHistory };
  }),

  setSelectedCharacter: (selectedCharacter) => {
    set({ selectedCharacter });
    saveSystem.save({
      ...saveSystem.load(),
      unlockedCharacters: Array.from(new Set([...saveSystem.load().unlockedCharacters, selectedCharacter]))
    });
  },

  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),

  updateSettings: (newSettings) => set((state) => {
    const updated = { ...state.settings, ...newSettings };
    saveSystem.save({ ...saveSystem.load(), settings: updated });
    return { settings: updated };
  }),

  buyTalent: (talent) => set((state) => {
    const currentLevel = state.talents[talent];
    const cost = (currentLevel + 1) * 500;

    if (state.metaXp >= cost) {
      const updatedTalents = { ...state.talents, [talent]: currentLevel + 1 };
      const nextMetaXp = state.metaXp - cost;

      saveSystem.save({
        ...saveSystem.load(),
        talents: updatedTalents,
        metaXp: nextMetaXp
      });

      return { talents: updatedTalents, metaXp: nextMetaXp };
    }
    return state;
  }),

  selectChapter: (selectedChapterId) => set((state) => {
    saveSystem.save({ ...saveSystem.load(), selectedChapterId });
    return { selectedChapterId };
  }),

  selectPerk: (loadoutPerk) => set((state) => {
    saveSystem.save({ ...saveSystem.load(), loadoutPerk });
    return { loadoutPerk };
  }),

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
    run: { ...state.run, goldRun: state.run.goldRun + amount }
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
        nextAbilities.set(id, { id, level: 1, stats: { ...DEFAULT_ABILITY_STATS[id] } });
    } else {
        const nextLevel = Math.min(8, current.level + 1);
        const nextStats = { ...current.stats, level: nextLevel };

        if (id === 'orbital') {
            if (nextLevel === 2) nextStats.damage *= 1.2;
            if (nextLevel === 3) nextStats.count += 1;
            if (nextLevel === 4) nextStats.damage *= 1.3;
            if (nextLevel === 5) nextStats.count += 2;
            if (nextLevel === 6) nextStats.speed *= 1.5;
            if (nextLevel === 7) nextStats.damage *= 1.5;
            if (nextLevel === 8) { nextStats.range *= 1.5; nextStats.damage *= 2; }
        }
        if (id === 'lightning') {
            if (nextLevel === 2) nextStats.range *= 1.25;
            if (nextLevel === 3) nextStats.count += 1;
            if (nextLevel === 4) nextStats.cooldown *= 0.8;
            if (nextLevel === 5) nextStats.count += 2;
            if (nextLevel === 6) nextStats.damage *= 1.4;
            if (nextLevel === 7) nextStats.cooldown *= 0.7;
            if (nextLevel === 8) { nextStats.cooldown = 0.5; nextStats.damage *= 2; }
        }
        if (id === 'aura') {
            if (nextLevel === 2) nextStats.range *= 1.2;
            if (nextLevel === 3) nextStats.damage *= 1.25;
            if (nextLevel === 4) nextStats.range *= 1.2;
            if (nextLevel === 5) nextStats.damage *= 1.25;
            if (nextLevel === 6) nextStats.damage *= 1.5;
            if (nextLevel === 7) nextStats.range *= 1.3;
            if (nextLevel === 8) { nextStats.damage *= 2; nextStats.range *= 1.5; }
        }
        if (id === 'barrage') {
            if (nextLevel === 2) nextStats.damage *= 1.2;
            if (nextLevel === 3) nextStats.count += 2;
            if (nextLevel === 4) nextStats.speed *= 1.3;
            if (nextLevel === 5) nextStats.count += 3;
            if (nextLevel === 6) nextStats.damage *= 1.3;
            if (nextLevel === 7) nextStats.count += 2;
            if (nextLevel === 8) { nextStats.cooldown *= 0.2; nextStats.damage *= 1.5; }
        }
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

  damageEnemy: (id, amount) => set((state) => {
      const enemy = state.enemies.find(e => e.id === id);
      if (!enemy) return state;

      const newHp = Math.max(0, enemy.hp - amount);
      if (newHp === 0) {
          // Drop Logic
          const dropRoll = Math.random();
          let pickup: PickupEntity | null = null;

          if (enemy.isBoss) {
              pickup = { id: `chest-${id}`, type: 'chest', position: enemy.position, value: 1 };
          } else if (enemy.isElite) {
              pickup = { id: `chest-${id}`, type: 'chest', position: enemy.position, value: 1 };
          } else if (dropRoll < 0.3) {
              pickup = { id: `xp-${id}`, type: 'xp', position: enemy.position, value: 1 };
          } else if (dropRoll < 0.4) {
              pickup = { id: `gold-${id}`, type: 'gold', position: enemy.position, value: 5 };
          }

          const nextPickups = pickup ? [...state.pickups, pickup].slice(-300) : state.pickups;

          return {
              enemies: state.enemies.filter(e => e.id !== id),
              pickups: nextPickups,
              run: { ...state.run, kills: state.run.kills + 1 }
          };
      }

      return {
          enemies: state.enemies.map(e => e.id === id ? { ...e, hp: newHp } : e)
      };
  }),

  attackNearbyEnemies: (playerPos, range, damage) => {
    const state = get();
    const [px, py, pz] = playerPos;
    state.enemies.forEach(e => {
        const [ex, ey, ez] = e.position;
        const distSq = (px - ex) ** 2 + (py - ey) ** 2 + (pz - ez) ** 2;
        if (distSq <= range * range) {
            get().damageEnemy(e.id, damage);
        }
    });
  },

  removeEnemy: (id) => set((state) => ({
      enemies: state.enemies.filter(e => e.id !== id)
  })),

  spawnPickup: (pickup) => set((state) => ({
      pickups: [...state.pickups, pickup].slice(-300)
  })),

  collectPickup: (id) => set((state) => {
      const pickup = state.pickups.find(p => p.id === id);
      if (!pickup) return state;

      if (pickup.type === 'xp') {
          get().addXp(pickup.value);
      } else if (pickup.type === 'gold') {
          get().addCoin(pickup.value);
      } else if (pickup.type === 'chest') {
          return { pickups: state.pickups.filter(p => p.id !== id), status: 'chest' };
      }

      return {
          pickups: state.pickups.filter(p => p.id !== id)
      };
  }),

  startRun: () => {
    const { talents, loadoutPerk } = get();
    const initialAbilities = new Map<AbilityType, ActiveAbility>();
    initialAbilities.set('orbital', { id: 'orbital', level: 1, stats: { ...DEFAULT_ABILITY_STATS['orbital'] } });

    const modifiedRun = { ...INITIAL_RUN };
    modifiedRun.maxHp += talents.hp * 20;
    modifiedRun.hp = modifiedRun.maxHp;

    if (loadoutPerk === 'perk_hp') {
        modifiedRun.maxHp *= 1.2;
        modifiedRun.hp = modifiedRun.maxHp;
    }

    set({
        view: 'game',
        status: 'playing',
        run: modifiedRun,
        enemies: [],
        pickups: [],
        abilities: initialAbilities
    });
  },

  finishRun: (victory) => set((state) => {
    const nextMetaXp = state.metaXp + (victory ? 500 : 150) + (state.run.goldRun * 2);
    const nextTotalRuns = state.totalRuns + 1;

    let unlockedChapters = [...state.unlockedChapters];
    if (victory) {
        if (state.selectedChapterId === 'chapter_1' && !unlockedChapters.includes('chapter_2')) {
            unlockedChapters.push('chapter_2');
        }
    }

    saveSystem.save({
      ...saveSystem.load(),
      metaXp: nextMetaXp,
      totalRuns: nextTotalRuns,
      unlockedChapters
    });

    return {
      status: victory ? 'victory' : 'gameover',
      metaXp: nextMetaXp,
      totalRuns: nextTotalRuns,
      unlockedChapters,
      enemies: [],
      pickups: []
    };
  }),

  resetGame: () => set({
    view: 'menu',
    menuScreen: 'home',
    menuHistory: [],
    status: 'paused',
    run: { ...INITIAL_RUN },
    enemies: [],
    pickups: [],
    abilities: new Map()
  })
}));

if (typeof window !== 'undefined') {
  (window as any).useGameStore = useGameStore;
}

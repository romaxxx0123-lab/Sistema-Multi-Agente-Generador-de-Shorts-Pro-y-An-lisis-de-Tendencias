import { create } from 'zustand';
import { Mesh } from 'three';
import { saveSystem, MetaSaveData } from '../utils/saveSystem';
import { AbilityType, AbilityStats, PassiveType, PendingOverlay, UpgradeOption } from '../types/abilities';
import { TUNING } from '../data/tuning';

/**
 * GAME STORE - GLOBAL STATE MANAGEMENT
 * Handles UI, Hub Navigation, Stats, Run Metadata, Enemy Entities, and Auto-Abilities.
 */

export type MenuScreen = 'home' | 'chapters' | 'loadout' | 'talents' | 'missions' | 'settings' | 'gallery' | 'characters';
export type SyncStatus = 'ok' | 'syncing' | 'offline' | 'error';

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
  isDying?: boolean;
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
  syncStatus: SyncStatus;

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

  // Auto-Abilities & Passives
  abilities: Map<AbilityType, ActiveAbility>;
  passives: Map<PassiveType, number>;
  pendingOverlays: PendingOverlay[];

  // Entities
  enemies: EnemyEntity[];
  pickups: PickupEntity[];

  // Actions
  setView: (view: GameState['view']) => void;
  setMenuScreen: (screen: MenuScreen, push?: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
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
  addPendingOverlay: (overlay: PendingOverlay) => void;
  popPendingOverlay: () => void;
  updateTime: (delta: number) => void;
  useDash: () => void;
  rechargeDash: () => void;

  // Ability Actions
  upgradeAbility: (id: AbilityType | PassiveType, type: 'skill' | 'passive') => void;
  evolveAbility: (id: AbilityType) => void;

  // Entity Actions
  spawnEnemy: (enemy: EnemyEntity) => void;
  damageEnemy: (id: string, amount: number) => void;
  attackNearbyEnemies: (playerPos: [number, number, number], range: number, damage: number) => void;
  removeEnemy: (id: string) => void;

  spawnPickup: (pickup: PickupEntity) => void;
  collectPickup: (id: string) => void;
  mergePickups: () => void;

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
  barrage: { level: 1, damage: 20, range: 15, cooldown: 2, count: 1, speed: 10 },
  iai_slash: { level: 1, damage: 60, range: 4, cooldown: 1.5, count: 1, speed: 0, angle: Math.PI / 3 }
};

const savedData = saveSystem.load();

export const useGameStore = create<GameState>((set, get) => ({
  view: 'menu',
  menuScreen: 'home',
  menuHistory: [],
  status: 'paused',
  syncStatus: 'ok',
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
  passives: new Map(),
  pendingOverlays: [],
  enemies: [],
  pickups: [],

  setView: (view) => set({ view }),

  setMenuScreen: (screen, push = true) => set((state) => {
    if (screen === state.menuScreen) return state;
    const history = push ? [...state.menuHistory, state.menuScreen] : state.menuHistory;
    return { menuScreen: screen, menuHistory: history };
  }),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

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
    get().setSyncStatus('syncing');
    setTimeout(() => {
        saveSystem.save({ ...saveSystem.load(), settings: updated });
        get().setSyncStatus('ok');
    }, 500);
    return { settings: updated };
  }),

  buyTalent: (talent) => set((state) => {
    const currentLevel = state.talents[talent];
    const cost = (currentLevel + 1) * 500;

    if (state.metaXp >= cost) {
      const updatedTalents = { ...state.talents, [talent]: currentLevel + 1 };
      const nextMetaXp = state.metaXp - cost;

      get().setSyncStatus('syncing');
      setTimeout(() => {
          saveSystem.save({
            ...saveSystem.load(),
            talents: updatedTalents,
            metaXp: nextMetaXp
          });
          get().setSyncStatus('ok');
      }, 500);

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
      // xpToNext = base * (growth^(level-1)) + additiveCurve
      xpToLevel = Math.round(TUNING.XP.BASE * Math.pow(TUNING.XP.GROWTH, level - 1) + (level * TUNING.XP.ADDITIVE));

      const nextStatus = state.status === 'playing' ? 'levelup' : state.status;
      if (state.status !== 'playing') {
          // Queue it
          const nextPending = [...state.pendingOverlays, { type: 'levelup', payload: { level } }];
          return { run: { ...state.run, xp, level, xpToLevel }, pendingOverlays: nextPending };
      }

      return {
        run: { ...state.run, xp, level, xpToLevel },
        status: nextStatus
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

  addPendingOverlay: (overlay) => set((state) => ({
      pendingOverlays: [...state.pendingOverlays, overlay]
  })),

  popPendingOverlay: () => set((state) => {
      if (state.pendingOverlays.length === 0) return { status: 'playing' };
      const next = state.pendingOverlays[0];
      const remaining = state.pendingOverlays.slice(1);
      return { status: next.type, pendingOverlays: remaining };
  }),

  updateTime: (delta) => set((state) => ({
    run: { ...state.run, time: state.run.time + delta }
  })),

  useDash: () => set((state) => ({
    run: { ...state.run, dashCharges: Math.max(0, state.run.dashCharges - 1) }
  })),

  rechargeDash: () => set((state) => ({
    run: { ...state.run, dashCharges: Math.min(state.run.maxDashCharges, state.run.dashCharges + 1) }
  })),

  upgradeAbility: (id, type) => set((state) => {
    if (type === 'passive') {
        const nextPassives = new Map(state.passives);
        const level = (nextPassives.get(id as PassiveType) || 0) + 1;
        nextPassives.set(id as PassiveType, level);

        // Re-calculate active status via pop
        if (state.pendingOverlays.length > 0) {
            const next = state.pendingOverlays[0];
            const remaining = state.pendingOverlays.slice(1);
            return { passives: nextPassives, status: next.type, pendingOverlays: remaining };
        }
        return { passives: nextPassives, status: 'playing' };
    }

    const nextAbilities = new Map(state.abilities);
    const current = nextAbilities.get(id as AbilityType);

    if (!current) {
        nextAbilities.set(id as AbilityType, { id: id as AbilityType, level: 1, stats: { ...DEFAULT_ABILITY_STATS[id as AbilityType] } });
    } else {
        const nextLevel = Math.min(8, current.level + 1);
        const nextStats = { ...current.stats, level: nextLevel };

        const abilityId = id as AbilityType;
        if (abilityId === 'orbital') {
            if (nextLevel === 2) nextStats.damage *= 1.2;
            if (nextLevel === 3) nextStats.count += 1;
            if (nextLevel === 4) nextStats.damage *= 1.3;
            if (nextLevel === 5) nextStats.count += 2;
            if (nextLevel === 6) nextStats.speed *= 1.5;
            if (nextLevel === 7) nextStats.damage *= 1.5;
            if (nextLevel === 8) { nextStats.range *= 1.5; nextStats.damage *= 2; }
        }
        if (abilityId === 'lightning') {
            if (nextLevel === 2) nextStats.range *= 1.25;
            if (nextLevel === 3) nextStats.count += 1;
            if (nextLevel === 4) nextStats.cooldown *= 0.8;
            if (nextLevel === 5) nextStats.count += 2;
            if (nextLevel === 6) nextStats.damage *= 1.4;
            if (nextLevel === 7) nextStats.cooldown *= 0.7;
            if (nextLevel === 8) { nextStats.cooldown = 0.5; nextStats.damage *= 2; }
        }
        if (abilityId === 'aura') {
            if (nextLevel === 2) nextStats.range *= 1.2;
            if (nextLevel === 3) nextStats.damage *= 1.25;
            if (nextLevel === 4) nextStats.range *= 1.2;
            if (nextLevel === 5) nextStats.damage *= 1.25;
            if (nextLevel === 6) nextStats.damage *= 1.5;
            if (nextLevel === 7) nextStats.range *= 1.3;
            if (nextLevel === 8) { nextStats.damage *= 2; nextStats.range *= 1.5; }
        }
        if (abilityId === 'barrage') {
            if (nextLevel === 2) nextStats.damage *= 1.2;
            if (nextLevel === 3) nextStats.count += 2;
            if (nextLevel === 4) nextStats.speed *= 1.3;
            if (nextLevel === 5) nextStats.count += 3;
            if (nextLevel === 6) nextStats.damage *= 1.3;
            if (nextLevel === 7) nextStats.count += 2;
            if (nextLevel === 8) { nextStats.cooldown *= 0.2; nextStats.damage *= 1.5; }
        }
        if (abilityId === 'iai_slash') {
            if (nextLevel === 2) nextStats.damage *= 1.3;
            if (nextLevel === 3) nextStats.angle! *= 1.5;
            if (nextLevel === 4) nextStats.cooldown *= 0.8;
            if (nextLevel === 5) nextStats.count += 1;
            if (nextLevel === 6) nextStats.range *= 1.5;
            if (nextLevel === 7) nextStats.damage *= 1.5;
            if (nextLevel === 8) { nextStats.cooldown *= 0.5; nextStats.damage *= 2; }
        }
        nextAbilities.set(id as AbilityType, { id: id as AbilityType, level: nextLevel, stats: nextStats });
    }

    if (state.pendingOverlays.length > 0) {
        const next = state.pendingOverlays[0];
        const remaining = state.pendingOverlays.slice(1);
        return { abilities: nextAbilities, status: next.type, pendingOverlays: remaining };
    }

    return { abilities: nextAbilities, status: 'playing' };
  }),

  evolveAbility: (id) => set((state) => {
      const nextAbilities = new Map(state.abilities);
      const current = nextAbilities.get(id);
      if (!current || current.level < 8) return state;

      const nextStats = { ...current.stats, isEvolved: true };

      if (id === 'iai_slash') {
          nextStats.damage *= 2.0;
          nextStats.range *= 1.2;
          nextStats.count = 2; // Double strike
      }
      if (id === 'orbital') {
          nextStats.count += 4;
          nextStats.range *= 1.5;
          nextStats.speed *= 1.5;
      }

      nextAbilities.set(id, { ...current, stats: nextStats });
      return { abilities: nextAbilities };
  }),

  spawnEnemy: (enemy) => set((state) => ({
      enemies: [...state.enemies, enemy]
  })),

  damageEnemy: (id, amount) => set((state) => {
      const enemy = state.enemies.find(e => e.id === id);
      if (!enemy || enemy.isDying) return state;

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
              enemies: state.enemies.map(e => e.id === id ? { ...e, hp: 0, isDying: true } : e),
              pickups: nextPickups
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
        if (e.isDying) return;
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

  spawnPickup: (pickup) => set((state) => {
    const nextPickups = [...state.pickups, pickup];
    if (nextPickups.length > TUNING.PICKUPS.MAX_COUNT) {
        // Trigger merge logic if over cap
        get().mergePickups();
        return { pickups: get().pickups };
    }
    return { pickups: nextPickups };
  }),

  mergePickups: () => set((state) => {
    // Simple spatial merge: find pairs of same type within MERGE_RADIUS
    const items = [...state.pickups];
    const merged: PickupEntity[] = [];
    const processed = new Set<string>();

    for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (processed.has(a.id)) continue;

        let combined = false;
        for (let j = i + 1; j < items.length; j++) {
            const b = items[j];
            if (processed.has(b.id) || a.type !== b.type || a.type === 'chest') continue;

            const distSq = (a.position[0]-b.position[0])**2 + (a.position[2]-b.position[2])**2;
            if (distSq < TUNING.PICKUPS.MERGE_RADIUS * TUNING.PICKUPS.MERGE_RADIUS) {
                // Merge B into A
                a.value += b.value;
                // Average position
                a.position[0] = (a.position[0] + b.position[0]) / 2;
                a.position[2] = (a.position[2] + b.position[2]) / 2;
                processed.add(b.id);
                combined = true;
                break; // Only merge one pair at a time for performance or could continue
            }
        }
        processed.add(a.id);
        merged.push(a);
    }

    return { pickups: merged };
  }),

  collectPickup: (id) => set((state) => {
      const pickup = state.pickups.find(p => p.id === id);
      if (!pickup) return state;

      if (pickup.type === 'xp') {
          get().addXp(pickup.value);
      } else if (pickup.type === 'gold') {
          get().addCoin(pickup.value);
      } else if (pickup.type === 'chest') {
          const nextStatus = state.status === 'playing' ? 'chest' : state.status;
          if (state.status !== 'playing') {
              const nextPending = [...state.pendingOverlays, { type: 'chest', payload: { id: pickup.id } }];
              return {
                  pickups: state.pickups.filter(p => p.id !== id),
                  pendingOverlays: nextPending
              };
          }
          return { pickups: state.pickups.filter(p => p.id !== id), status: 'chest' };
      }

      return {
          pickups: state.pickups.filter(p => p.id !== id)
      };
  }),

  startRun: () => {
    const { talents, loadoutPerk } = get();
    const initialAbilities = new Map<AbilityType, ActiveAbility>();
    initialAbilities.set('iai_slash', { id: 'iai_slash', level: 1, stats: { ...DEFAULT_ABILITY_STATS['iai_slash'] } });

    const initialPassives = new Map<PassiveType, number>();

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
        abilities: initialAbilities,
        passives: initialPassives,
        pendingOverlays: []
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
    abilities: new Map(),
    passives: new Map(),
    pendingOverlays: []
  })
}));

if (typeof window !== 'undefined') {
  (window as any).useGameStore = useGameStore;
}

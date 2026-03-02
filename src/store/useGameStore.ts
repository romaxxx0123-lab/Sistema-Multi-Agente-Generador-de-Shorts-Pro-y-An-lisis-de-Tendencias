import { create } from 'zustand';
import { Mesh } from 'three';
import { GAME_CONFIG } from '../config';

export type AbilityType = 'kunai' | 'lightning' | 'flame' | 'clone' | 'fire_spiral';
export type UpgradeType = 'damage' | 'speed' | 'hp' | 'attack_cd' | 'dash_cd' | AbilityType;

export interface UpgradeOption {
  type: UpgradeType;
  label: string;
  description: string;
  isAbility?: boolean;
}

const PASSIVE_UPGRADES: UpgradeOption[] = [
  { type: 'damage', label: '+20% Daño', description: 'Aumenta el daño de tus ataques.' },
  { type: 'speed', label: '+15% Velocidad', description: 'Aumenta tu velocidad de movimiento.' },
  { type: 'hp', label: '+30 Vida Máx', description: 'Aumenta tu vida máxima y te cura.' },
  { type: 'attack_cd', label: '-0.2s Recarga Ataque', description: 'Ataca con más frecuencia.' },
  { type: 'dash_cd', label: '-0.5s Recarga Dash', description: 'Usa el dash más seguido.' },
];

const ABILITY_UPGRADES: Record<AbilityType, UpgradeOption> = {
  kunai: { type: 'kunai', label: 'Kunai Orbital', description: 'Kunais giran alrededor de ti.', isAbility: true },
  lightning: { type: 'lightning', label: 'Lightning Strike', description: 'Rayos caen sobre enemigos.', isAbility: true },
  flame: { type: 'flame', label: 'Flame Aura', description: 'Quema a enemigos cercanos.', isAbility: true },
  clone: { type: 'clone', label: 'Shadow Clone', description: 'Un clon repite tus ataques.', isAbility: true },
  fire_spiral: { type: 'fire_spiral', label: 'FIRE SPIRAL', description: 'EVOLUCIÓN: Kunais de fuego.', isAbility: true },
};

interface GameState {
  status: 'playing' | 'paused' | 'gameover' | 'levelup';
  playerRef: Mesh | null;
  gameTime: number;

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

  // Abilities
  abilities: Record<string, number>; // type -> level

  // Boss
  bossActive: boolean;
  bossHp: number;
  bossMaxHp: number;

  // Level Up
  upgradeOptions: UpgradeOption[];

  // Actions
  setStatus: (status: 'playing' | 'paused' | 'gameover' | 'levelup') => void;
  setPlayerRef: (ref: Mesh | null) => void;
  setGameTime: (time: number | ((prev: number) => number)) => void;
  togglePause: () => void;

  takeDamage: (amount: number) => void;
  addXP: (amount: number) => void;
  addKill: () => void;
  applyUpgrade: (upgrade: UpgradeOption) => void;
  resetGame: () => void;

  // Boss Actions
  spawnBoss: () => void;
  damageBoss: (amount: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  status: 'playing',
  playerRef: null,
  gameTime: 0,

  hp: GAME_CONFIG.PLAYER.INITIAL_HP,
  maxHp: GAME_CONFIG.PLAYER.INITIAL_HP,
  xp: 0,
  level: 1,
  kills: 0,

  damageMultiplier: 1,
  speedMultiplier: 1,
  attackCooldownModifier: 0,
  dashCooldownModifier: 0,

  abilities: {},

  bossActive: false,
  bossHp: 0,
  bossMaxHp: 0,

  upgradeOptions: [],

  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  setGameTime: (time) => set((state) => ({
    gameTime: typeof time === 'function' ? time(state.gameTime) : time
  })),

  togglePause: () => set((state) => {
    if (state.status === 'levelup') return state;
    return {
      status: state.status === 'playing' ? 'paused' : (state.status === 'paused' ? 'playing' : state.status)
    };
  }),

  takeDamage: (amount) => set((state) => {
    const newHp = Math.max(0, state.hp - amount);

    // Screen Shake on damage
    window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 5 } }));

    // SFX Hook
    window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'player-hit' } }));

    if (newHp <= 0) return { hp: 0, status: 'gameover' };
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
      // SFX Hook
      window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'level-up' } }));

      // 1. Check for Evolutions before generating options
      const abilities = state.abilities;
      let evolutionOption: UpgradeOption | null = null;

      if (abilities['kunai'] === 5 && abilities['flame'] === 5 && !abilities['fire_spiral']) {
        evolutionOption = ABILITY_UPGRADES.fire_spiral;
      }

      // 2. Generate Options based on weights
      const options: UpgradeOption[] = [];
      if (evolutionOption) options.push(evolutionOption);

      const availableAbilities = (['kunai', 'lightning', 'flame', 'clone'] as AbilityType[]).filter(type => {
        // If evolved, don't show base components
        if (state.abilities['fire_spiral'] && (type === 'kunai' || type === 'flame')) return false;
        // If max level, don't show
        const max = (GAME_CONFIG.ABILITIES as any)[type.toUpperCase()]?.MAX_LEVEL || 5;
        return (state.abilities[type] || 0) < max;
      });

      while (options.length < 3) {
        const rand = Math.random();
        let selected: UpgradeOption;

        if (rand < 0.4 && availableAbilities.length > 0) {
          // New/Existing Ability
          const type = availableAbilities[Math.floor(Math.random() * availableAbilities.length)];
          selected = { ...ABILITY_UPGRADES[type] };
          const currentLevel = state.abilities[type] || 0;
          selected.label = `${selected.label} Lv.${currentLevel + 1}`;
        } else if (rand < 0.7 || availableAbilities.length === 0) {
          // Passive Upgrade
          selected = PASSIVE_UPGRADES[Math.floor(Math.random() * PASSIVE_UPGRADES.length)];
        } else {
          // Subir nivel habilidad (re-randomize to find one we have)
          const currentAbilities = Object.keys(state.abilities).filter(type => {
             const max = (GAME_CONFIG.ABILITIES as any)[type.toUpperCase()]?.MAX_LEVEL || 5;
             return state.abilities[type] < max;
          });
          if (currentAbilities.length > 0) {
             const type = currentAbilities[Math.floor(Math.random() * currentAbilities.length)] as AbilityType;
             selected = { ...ABILITY_UPGRADES[type] };
             selected.label = `${selected.label} Lv.${state.abilities[type] + 1}`;
          } else {
             selected = PASSIVE_UPGRADES[Math.floor(Math.random() * PASSIVE_UPGRADES.length)];
          }
        }

        if (!options.find(o => o.type === selected.type)) {
          options.push(selected);
        }

        // Safety exit if we can't find 3 unique options (rare)
        if (options.length >= 3) break;
      }

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

  addKill: () => {
    set((state) => ({ kills: state.kills + 1 }));
    window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'enemy-death' } }));
  },

  applyUpgrade: (upgrade) => set((state) => {
    const changes: Partial<GameState> = { status: 'playing' };

    if (upgrade.isAbility) {
      const type = upgrade.type as AbilityType;
      const newAbilities = { ...state.abilities };

      if (type === 'fire_spiral') {
        delete newAbilities['kunai'];
        delete newAbilities['flame'];
        newAbilities['fire_spiral'] = 1;
      } else {
        newAbilities[type] = (newAbilities[type] || 0) + 1;
      }
      changes.abilities = newAbilities;
    } else {
      switch (upgrade.type) {
        case 'damage':
          changes.damageMultiplier = state.damageMultiplier + GAME_CONFIG.UPGRADES.DAMAGE_BOOST;
          break;
        case 'speed':
          changes.speedMultiplier = state.speedMultiplier + GAME_CONFIG.UPGRADES.SPEED_BOOST;
          break;
        case 'hp':
          changes.maxHp = state.maxHp + GAME_CONFIG.UPGRADES.HP_BOOST;
          changes.hp = state.hp + GAME_CONFIG.UPGRADES.HP_BOOST;
          break;
        case 'attack_cd':
          changes.attackCooldownModifier = state.attackCooldownModifier + GAME_CONFIG.UPGRADES.ATTACK_CD_REDUCTION;
          break;
        case 'dash_cd':
          changes.dashCooldownModifier = state.dashCooldownModifier + GAME_CONFIG.UPGRADES.DASH_CD_REDUCTION;
          break;
      }
    }

    return changes;
  }),

  spawnBoss: () => set({
    bossActive: true,
    bossHp: GAME_CONFIG.BOSS.HP,
    bossMaxHp: GAME_CONFIG.BOSS.HP,
  }),

  damageBoss: (amount) => {
    const state = get();
    if (!state.bossActive) return;

    const newHp = Math.max(0, state.bossHp - amount);
    if (newHp <= 0) {
      set({ bossHp: 0, bossActive: false });
      state.addXP(GAME_CONFIG.BOSS.REWARD_XP);
      // levels are handled by addXP implicitly or we can force them
      // let's just add enough XP to trigger levels or manually add them
      set((s) => ({ level: s.level + GAME_CONFIG.BOSS.REWARD_LEVELS }));
      window.dispatchEvent(new CustomEvent('boss-defeated'));
    } else {
      set({ bossHp: newHp });
    }
  },

  resetGame: () => set({
    status: 'playing',
    gameTime: 0,
    hp: GAME_CONFIG.PLAYER.INITIAL_HP,
    maxHp: GAME_CONFIG.PLAYER.INITIAL_HP,
    xp: 0,
    level: 1,
    kills: 0,
    damageMultiplier: 1,
    speedMultiplier: 1,
    attackCooldownModifier: 0,
    dashCooldownModifier: 0,
    abilities: {},
    bossActive: false,
    upgradeOptions: [],
  }),
}));

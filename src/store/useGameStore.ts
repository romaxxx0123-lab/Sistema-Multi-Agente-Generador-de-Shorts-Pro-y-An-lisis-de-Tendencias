import { create } from 'zustand';
import { Mesh } from 'three';
import { GAME_CONFIG } from '../config';
import { saveSystem, MetaSaveData } from '../utils/saveSystem';

export type AbilityType = 'kunai' | 'lightning' | 'flame' | 'clone' | 'shuriken' | 'poison' | 'chain_lightning' | 'ground_spikes' | 'wolves' | 'meteor' |
                          'fire_spiral' | 'thunder_god' | 'legion' | 'toxic_inferno' | 'blade_storm' | 'celestial_pack';

export type UpgradeType = 'damage' | 'speed' | 'hp' | 'attack_cd' | 'dash_cd' | AbilityType | 'reroll' | 'lifesteal' | 'crit' | 'xp';

export interface UpgradeOption {
  type: UpgradeType;
  label: string;
  description: string;
  isAbility?: boolean;
  isEvolution?: boolean;
  cost?: number; // For shop
}

const PASSIVE_UPGRADES: UpgradeOption[] = [
  { type: 'damage', label: '+20% Daño', description: 'Aumenta el daño de tus ataques.' },
  { type: 'speed', label: '+15% Velocidad', description: 'Aumenta tu velocidad de movimiento.' },
  { type: 'hp', label: '+30 Vida Máx', description: 'Aumenta tu vida máxima y te cura.' },
  { type: 'attack_cd', label: '-0.2s Recarga Ataque', description: 'Ataca con más frecuencia.' },
  { type: 'dash_cd', label: '-0.5s Recarga Dash', description: 'Usa el dash más seguido.' },
];

const ABILITY_UPGRADES: Record<string, UpgradeOption> = {
  kunai: { type: 'kunai', label: 'Kunai Orbital', description: 'Kunais giran alrededor de ti.', isAbility: true },
  lightning: { type: 'lightning', label: 'Lightning Strike', description: 'Rayos caen sobre enemigos.', isAbility: true },
  flame: { type: 'flame', label: 'Flame Aura', description: 'Quema a enemigos cercanos.', isAbility: true },
  clone: { type: 'clone', label: 'Shadow Clone', description: 'Un clon repite tus ataques.', isAbility: true },
  shuriken: { type: 'shuriken', label: 'Shuriken Storm', description: 'Lanza shurikens aleatorios.', isAbility: true },
  poison: { type: 'poison', label: 'Poison Cloud', description: 'Nube tóxica sobre ti.', isAbility: true },
  chain_lightning: { type: 'chain_lightning', label: 'Chain Lightning', description: 'Rayo que rebota.', isAbility: true },
  ground_spikes: { type: 'ground_spikes', label: 'Ground Spikes', description: 'Pinchos salen del suelo.', isAbility: true },
  wolves: { type: 'wolves', label: 'Spirit Wolves', description: 'Lobos cazadores.', isAbility: true },
  meteor: { type: 'meteor', label: 'Meteor Strike', description: 'Meteoros caen del cielo.', isAbility: true },

  fire_spiral: { type: 'fire_spiral', label: 'FIRE SPIRAL', description: 'Kunais de fuego.', isAbility: true, isEvolution: true },
  thunder_god: { type: 'thunder_god', label: 'THUNDER GOD', description: 'Súper cadena de rayos.', isAbility: true, isEvolution: true },
  legion: { type: 'legion', label: 'LEGION', description: 'Clones con kunais.', isAbility: true, isEvolution: true },
  toxic_inferno: { type: 'toxic_inferno', label: 'TOXIC INFERNO', description: 'Aura de veneno y fuego.', isAbility: true, isEvolution: true },
  blade_storm: { type: 'blade_storm', label: 'BLADE STORM', description: 'Lluvia de shurikens y pinchos.', isAbility: true, isEvolution: true },
  celestial_pack: { type: 'celestial_pack', label: 'CELESTIAL PACK', description: 'Lobos y meteoros.', isAbility: true, isEvolution: true },
};

const SHOP_ITEMS_POOL: UpgradeOption[] = [
  { type: 'damage', label: 'Katana Mejorada', description: '+50% Daño', cost: 150 },
  { type: 'attack_cd', label: 'Arco Rápido', description: '+30% Vel. Ataque', cost: 100 },
  { type: 'lifesteal', label: 'Garras Vampíricas', description: '+10% Lifesteal', cost: 200 },
  { type: 'hp', label: 'Poción HP', description: '+50% HP Actual', cost: 50 },
  { type: 'xp', label: 'Poción XP', description: '+50 XP inmediatos', cost: 80 },
  { type: 'reroll', label: 'Token Reroll', description: '+1 Reroll en niveles', cost: 100 },
  { type: 'crit', label: 'Amuleto Crítico', description: '+15% Crit Chance', cost: 150 },
  { type: 'speed', label: 'Botas Veloces', description: '+20% Velocidad', cost: 120 },
  { type: 'hp', label: 'Escudo', description: '+50 HP Máx', cost: 100 },
];

interface GameState {
  view: 'menu' | 'characters' | 'meta' | 'game';
  status: 'playing' | 'paused' | 'gameover' | 'levelup' | 'shop' | 'run_summary';
  playerRef: Mesh | null;
  gameTime: number;

  // Persistence
  metaData: MetaSaveData;

  // Run Stats
  coins: number;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  kills: number;
  difficulty: 'normal' | 'hard' | 'nightmare';
  characterId: string;

  // Modifiers (Run only)
  damageMultiplier: number;
  speedMultiplier: number;
  attackCooldownModifier: number;
  dashCooldownModifier: number;
  rerolls: number;
  lifesteal: number;
  critChance: number;

  // Active Content
  abilities: Record<string, number>;
  bossesDefeated: number;
  bossActive: boolean;
  bossHp: number;
  bossMaxHp: number;

  // Overlays
  upgradeOptions: UpgradeOption[];
  shopOptions: UpgradeOption[];

  // Actions
  setView: (view: GameState['view']) => void;
  setStatus: (status: GameState['status']) => void;
  setPlayerRef: (ref: Mesh | null) => void;
  setGameTime: (time: number | ((prev: number) => number)) => void;
  togglePause: () => void;

  takeDamage: (amount: number) => void;
  addXP: (amount: number) => void;
  addCoins: (amount: number) => void;
  addKill: () => void;
  applyUpgrade: (upgrade: UpgradeOption) => void;
  buyFromShop: (item: UpgradeOption) => void;
  rerollUpgrades: () => void;

  startRun: (charId: string, diff: GameState['difficulty']) => void;
  finishRun: () => void;
  resetGame: () => void;

  // Meta Actions
  unlockCharacter: (id: string) => void;
  unlockAbility: (id: string) => void;
  buyMetaUpgrade: (type: keyof MetaSaveData['upgrades']) => void;

  // Boss Actions
  spawnBoss: (type: 'ONI' | 'SHOGUN') => void;
  damageBoss: (amount: number) => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  view: 'menu',
  status: 'paused',
  playerRef: null,
  gameTime: 0,

  metaData: saveSystem.load(),

  coins: 0,
  hp: 100,
  maxHp: 100,
  xp: 0,
  level: 1,
  kills: 0,
  difficulty: 'normal',
  characterId: 'ronin',

  damageMultiplier: 1,
  speedMultiplier: 1,
  attackCooldownModifier: 0,
  dashCooldownModifier: 0,
  rerolls: 0,
  lifesteal: 0,
  critChance: 0,

  abilities: {},
  bossesDefeated: 0,
  bossActive: false,
  bossHp: 0,
  bossMaxHp: 0,

  upgradeOptions: [],
  shopOptions: [],

  setView: (view) => set({ view }),
  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  setGameTime: (time) => set((state) => ({
    gameTime: typeof time === 'function' ? time(state.gameTime) : time
  })),

  togglePause: () => set((state) => {
    if (['levelup', 'shop', 'run_summary'].includes(state.status)) return state;
    return {
      status: state.status === 'playing' ? 'paused' : (state.status === 'paused' ? 'playing' : state.status)
    };
  }),

  takeDamage: (amount) => set((state) => {
    const diffCfg = (GAME_CONFIG.DIFFICULTIES as any)[state.difficulty.toUpperCase()];
    const actualDamage = amount * diffCfg.damageMult;
    const newHp = Math.max(0, state.hp - actualDamage);

    window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 5 } }));
    window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'player-hit' } }));

    if (newHp <= 0) return { hp: 0, status: 'gameover' };
    return { hp: newHp };
  }),

  addXP: (amount) => {
    const state = get();
    const diffCfg = (GAME_CONFIG.DIFFICULTIES as any)[state.difficulty.toUpperCase()];
    const metaBonus = 1 + (state.metaData.upgrades.xp * 0.1);

    let newXp = state.xp + (amount * diffCfg.rewardMult * metaBonus);
    let newLevel = state.level;
    let xpNeeded = newLevel * 10;
    let leveledUp = false;

    while (newXp >= xpNeeded) {
      newXp -= xpNeeded;
      newLevel += 1;
      xpNeeded = newLevel * 10;
      leveledUp = true;
    }

    if (leveledUp) {
      window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'level-up' } }));

      // Check Shop trigger (every 5 levels)
      if (newLevel % 5 === 0) {
        const shuffled = [...SHOP_ITEMS_POOL].sort(() => 0.5 - Math.random());
        set({ xp: newXp, level: newLevel, status: 'shop', shopOptions: shuffled.slice(0, 4) });
      } else {
        const options = generateLevelUpOptions(get());
        set({ xp: newXp, level: newLevel, status: 'levelup', upgradeOptions: options });
      }
    } else {
      set({ xp: newXp });
    }
  },

  addCoins: (amount) => {
    const state = get();
    const diffCfg = (GAME_CONFIG.DIFFICULTIES as any)[state.difficulty.toUpperCase()];
    set({ coins: state.coins + (amount * diffCfg.rewardMult) });
  },

  addKill: () => {
    set((state) => ({ kills: state.kills + 1 }));
    window.dispatchEvent(new CustomEvent('play-sfx', { detail: { type: 'enemy-death' } }));
  },

  rerollUpgrades: () => {
    const state = get();
    if (state.rerolls > 0) {
      const options = generateLevelUpOptions(state);
      set({ rerolls: state.rerolls - 1, upgradeOptions: options });
    }
  },

  applyUpgrade: (upgrade) => set((state) => {
    const changes: any = { status: 'playing' };

    if (upgrade.isAbility) {
      const type = upgrade.type as AbilityType;
      const newAbilities = { ...state.abilities };

      if (upgrade.isEvolution) {
        // Handle specific evolution removals
        if (type === 'fire_spiral') { delete newAbilities['kunai']; delete newAbilities['flame']; }
        if (type === 'thunder_god') { delete newAbilities['lightning']; delete newAbilities['chain_lightning']; }
        if (type === 'legion') { delete newAbilities['clone']; delete newAbilities['kunai']; }
        if (type === 'toxic_inferno') { delete newAbilities['poison']; delete newAbilities['flame']; }
        if (type === 'blade_storm') { delete newAbilities['shuriken']; delete newAbilities['ground_spikes']; }
        if (type === 'celestial_pack') { delete newAbilities['wolves']; delete newAbilities['meteor']; }
        newAbilities[type] = 1;
      } else {
        newAbilities[type] = (newAbilities[type] || 0) + 1;
      }
      changes.abilities = newAbilities;
    } else {
      applyPassiveEffect(upgrade, state, changes);
    }

    return changes;
  }),

  buyFromShop: (item) => {
    const state = get();
    if (state.coins >= (item.cost || 0)) {
      const changes: any = { coins: state.coins - (item.cost || 0) };
      applyPassiveEffect(item, state, changes);
      // Don't close shop, allow multiple buys
      set(changes);
    }
  },

  startRun: (charId, diff) => {
    const meta = get().metaData;
    const char = (GAME_CONFIG.CHARACTERS as any)[charId.toUpperCase()];

    // Apply Meta Bonuses
    const baseHp = char.hp * (1 + (meta.upgrades.hp || 0) * 0.05);
    const baseDamage = char.damage * (1 + (meta.upgrades.damage || 0) * 0.03);
    const baseSpeed = char.speed * (1 + (meta.upgrades.speed || 0) * 0.05);

    set({
      view: 'game',
      status: 'playing',
      characterId: charId,
      difficulty: diff,
      hp: baseHp,
      maxHp: baseHp,
      damageMultiplier: baseDamage,
      speedMultiplier: baseSpeed,
      rerolls: meta.upgrades.reroll,

      // Reset other run stats
      gameTime: 0,
      coins: 0,
      xp: 0,
      level: 1,
      kills: 0,
      abilities: {},
      bossesDefeated: 0,
      bossActive: false,
      lifesteal: 0,
      critChance: 0,
      attackCooldownModifier: 0,
      dashCooldownModifier: 0,
    });
  },

  finishRun: () => {
    const state = get();
    const metaXpGained = (state.level * 10) + (state.kills * 1) + (state.bossesDefeated * 50);
    const finalMetaXp = metaXpGained * (state.status === 'playing' ? 2 : 1); // Mock victory condition

    const newMetaData = {
      ...state.metaData,
      metaXp: state.metaData.metaXp + finalMetaXp,
      totalRuns: state.metaData.totalRuns + 1
    };

    saveSystem.save(newMetaData);
    set({ metaData: newMetaData, status: 'run_summary' });
  },

  unlockCharacter: (id) => {
    const state = get();
    const char = (GAME_CONFIG.CHARACTERS as any)[id.toUpperCase()];
    if (state.metaData.metaXp >= (char.unlockCost || 0) && !state.metaData.unlockedCharacters.includes(id)) {
      const newData = {
        ...state.metaData,
        metaXp: state.metaData.metaXp - (char.unlockCost || 0),
        unlockedCharacters: [...state.metaData.unlockedCharacters, id]
      };
      saveSystem.save(newData);
      set({ metaData: newData });
    }
  },

  unlockAbility: (id) => {
    const state = get();
    const cost = (GAME_CONFIG.META.UNLOCKS as any)[id.toUpperCase()];
    if (state.metaData.metaXp >= cost && !state.metaData.unlockedAbilities.includes(id.toLowerCase())) {
        const newData = {
            ...state.metaData,
            metaXp: state.metaData.metaXp - cost,
            unlockedAbilities: [...state.metaData.unlockedAbilities, id.toLowerCase()]
        };
        saveSystem.save(newData);
        set({ metaData: newData });
    }
  },

  buyMetaUpgrade: (type) => {
    const state = get();
    const cost = (GAME_CONFIG.META.COSTS as any)[type.toUpperCase()];
    if (state.metaData.metaXp >= cost && state.metaData.upgrades[type] < 10) {
      const newData = {
        ...state.metaData,
        metaXp: state.metaData.metaXp - cost,
        upgrades: {
          ...state.metaData.upgrades,
          [type]: state.metaData.upgrades[type] + 1
        }
      };
      saveSystem.save(newData);
      set({ metaData: newData });
    }
  },

  spawnBoss: (type) => {
    const cfg = (GAME_CONFIG.BOSS as any)[type];
    set({
      bossActive: true,
      bossHp: cfg.HP,
      bossMaxHp: cfg.HP,
    });
  },

  damageBoss: (amount) => {
    const state = get();
    if (!state.bossActive) return;

    const newHp = Math.max(0, state.bossHp - amount);
    if (newHp <= 0) {
      const bossType = state.gameTime < 500 ? 'ONI' : 'SHOGUN';
      const cfg = (GAME_CONFIG.BOSS as any)[bossType];

      set({ bossHp: 0, bossActive: false, bossesDefeated: state.bossesDefeated + 1 });
      state.addXP(cfg.REWARD_XP);
      state.addCoins(cfg.REWARD_COINS);
      set((s) => ({ level: s.level + cfg.REWARD_LEVELS }));
      window.dispatchEvent(new CustomEvent('boss-defeated'));
    } else {
      set({ bossHp: newHp });
    }
  },

  resetGame: () => {
    set({ view: 'menu', status: 'paused' });
  }
}));

function generateLevelUpOptions(state: GameState): UpgradeOption[] {
  const options: UpgradeOption[] = [];

  // 1. Check for Evolutions
  const abs = state.abilities;
  const evos: AbilityType[] = [];
  if (abs['lightning'] === 5 && abs['chain_lightning'] === 5 && !abs['thunder_god']) evos.push('thunder_god');
  if (abs['clone'] === 3 && abs['kunai'] === 5 && !abs['legion']) evos.push('legion');
  if (abs['poison'] === 5 && abs['flame'] === 5 && !abs['toxic_inferno']) evos.push('toxic_inferno');
  if (abs['shuriken'] === 5 && abs['ground_spikes'] === 5 && !abs['blade_storm']) evos.push('blade_storm');
  if (abs['wolves'] === 3 && abs['meteor'] === 5 && !abs['celestial_pack']) evos.push('celestial_pack');
  if (abs['kunai'] === 5 && abs['flame'] === 5 && !abs['fire_spiral']) evos.push('fire_spiral');

  if (evos.length > 0) {
    const type = evos[0];
    options.push({ ...ABILITY_UPGRADES[type] });
  }

  // 2. Filter available abilities by Meta-Unlock
  const unlocked = state.metaData.unlockedAbilities;
  const availableAbilities = (Object.keys(ABILITY_UPGRADES) as AbilityType[]).filter(type => {
    if (ABILITY_UPGRADES[type].isEvolution) return false;
    if (!unlocked.includes(type)) return false;
    const max = (GAME_CONFIG.ABILITIES as any)[type.toUpperCase()]?.MAX_LEVEL || 5;
    return (state.abilities[type] || 0) < max;
  });

  while (options.length < 3) {
    const rand = Math.random();
    let selected: UpgradeOption;

    if (rand < 0.4 && availableAbilities.length > 0) {
      const type = availableAbilities[Math.floor(Math.random() * availableAbilities.length)];
      selected = { ...ABILITY_UPGRADES[type] };
      selected.label = `${selected.label} Lv.${(state.abilities[type] || 0) + 1}`;
    } else if (rand < 0.7 || availableAbilities.length === 0) {
      selected = PASSIVE_UPGRADES[Math.floor(Math.random() * PASSIVE_UPGRADES.length)];
    } else {
      const currentAbilities = Object.keys(state.abilities).filter(type => {
         const max = (GAME_CONFIG.ABILITIES as any)[type.toUpperCase()]?.MAX_LEVEL || 5;
         return state.abilities[type] < max && !ABILITY_UPGRADES[type].isEvolution;
      });
      if (currentAbilities.length > 0) {
         const type = currentAbilities[Math.floor(Math.random() * currentAbilities.length)] as AbilityType;
         selected = { ...ABILITY_UPGRADES[type] };
         selected.label = `${selected.label} Lv.${state.abilities[type] + 1}`;
      } else {
         selected = PASSIVE_UPGRADES[Math.floor(Math.random() * PASSIVE_UPGRADES.length)];
      }
    }

    if (!options.find(o => o.type === selected.type)) options.push(selected);
    if (options.length >= 3) break;
  }
  return options;
}

function applyPassiveEffect(upgrade: UpgradeOption, state: GameState, changes: any) {
  switch (upgrade.type) {
      case 'damage': changes.damageMultiplier = state.damageMultiplier + (upgrade.cost ? 0.5 : 0.2); break;
      case 'speed': changes.speedMultiplier = state.speedMultiplier + (upgrade.cost ? 0.2 : 0.15); break;
    case 'hp':
      if (upgrade.label.includes('Poción')) changes.hp = Math.min(state.maxHp, state.hp + state.maxHp * 0.5);
      else {
          changes.maxHp = state.maxHp + (upgrade.cost ? 50 : 30);
          changes.hp = state.hp + (upgrade.cost ? 50 : 30);
      }
      break;
      case 'attack_cd': changes.attackCooldownModifier = state.attackCooldownModifier + (upgrade.cost ? 0.3 : 0.2); break;
      case 'dash_cd': changes.dashCooldownModifier = state.dashCooldownModifier + 0.5; break;
    case 'lifesteal': changes.lifesteal = state.lifesteal + 0.1; break;
    case 'crit': changes.critChance = state.critChance + 0.15; break;
    case 'xp': changes.xp = state.xp + 50; break;
    case 'reroll': changes.rerolls = state.rerolls + 1; break;
  }
}

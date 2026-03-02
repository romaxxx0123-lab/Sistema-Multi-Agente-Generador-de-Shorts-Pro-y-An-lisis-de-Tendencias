/**
 * Adjustable parameters for Ronin Survivor - Part 4
 * These values can be tuned to change the game's feel and balance.
 */
export const GAME_CONFIG = {
  // Arena
  ARENA: {
    SIZE: 50,
    WALL_HEIGHT: 10,
    WALL_THICKNESS: 1,
    COLOR: "#333333",
    GRID_COLOR: "#444444",
  },

  // Player Stats & Movement
  PLAYER: {
    INITIAL_HP: 100,
    MOVE_SPEED: 5,
    ROTATION_SPEED: 12.56, // 720 degrees in radians per second
    CAPSULE_RADIUS: 0.5,
    CAPSULE_HEIGHT: 1,
    COLOR: "#1cb0f6",
    DASH_COLOR: "#84d8ff",
  },

  // Characters
  CHARACTERS: {
    RONIN: { id: 'ronin', name: 'Ronin', description: 'Equilibrado.', hp: 100, speed: 5, damage: 1 },
    SAMURAI: { id: 'samurai', name: 'Samurai', description: '+20% HP, -10% Velocidad.', hp: 120, speed: 4.5, damage: 1, unlockCost: 100 },
    KUNOICHI: { id: 'kunoichi', name: 'Kunoichi', description: '+30% Velocidad, -20% HP.', hp: 80, speed: 6.5, damage: 1, unlockCost: 250 },
    MONJE: { id: 'monje', name: 'Monje', description: 'Regenera 1 HP/seg, -10% Daño.', hp: 100, speed: 5, damage: 0.9, unlockCost: 500, regen: 1 },
  },

  // Combat System
  COMBAT: {
    BASE_DAMAGE: 25,
    ATTACK_RANGE: 2.0,
    ATTACK_COOLDOWN: 0.5, // seconds
    HIT_FLASH_DURATION: 0.1, // seconds
  },

  // Dash System
  DASH: {
    DISTANCE: 5,
    DURATION: 0.3, // seconds
    COOLDOWN: 2.0, // seconds
  },

  // Enemies
  ENEMIES: {
    SLIME: { TYPE: 'slime', HP: 50, SPEED: 2.0, DAMAGE: 10, XP_DROP: { min: 3, max: 5 }, COLOR: "#a855f7", RADIUS: 0.4 },
    SKELETON: { TYPE: 'skeleton', HP: 80, SPEED: 2.5, DAMAGE: 15, XP_DROP: { min: 5, max: 8 }, COLOR: "#f8fafc", RADIUS: 0.5, HEIGHT: 1.5 },
    BAT: { TYPE: 'bat', HP: 30, SPEED: 4.0, DAMAGE: 8, XP_DROP: { min: 2, max: 4 }, COLOR: "#1e293b", RADIUS: 0.3, HEIGHT: 2.0 },
    OGRE: { TYPE: 'ogre', HP: 150, SPEED: 1.5, DAMAGE: 25, XP_DROP: { min: 10, max: 15 }, COLOR: "#166534", RADIUS: 0.7, HEIGHT: 1.5, KNOCKBACK_THRESHOLD: 20, KNOCKBACK_DISTANCE: 2 },
    NINJA: { TYPE: 'ninja', HP: 60, SPEED: 3.5, DAMAGE: 18, XP_DROP: { min: 6, max: 9 }, COLOR: "#312e81", RADIUS: 0.4, DASH_COOLDOWN: 3 },
    MAGE: { TYPE: 'mage', HP: 40, SPEED: 1.8, DAMAGE: 12, PROJ_DAMAGE: 20, XP_DROP: { min: 7, max: 10 }, COLOR: "#4338ca", RADIUS: 0.4, RANGE: 12 },
    MINI_ONI: { TYPE: 'mini_oni', HP: 100, SPEED: 2.0, DAMAGE: 25, XP_DROP: { min: 12, max: 18 }, COLOR: "#991b1b", RADIUS: 0.6, AOE_RADIUS: 3, AOE_COOLDOWN: 6 },
  },

  // Bosses
  BOSS: {
    ONI: {
      NAME: "Oni Rojo",
      SPAWN_TIME: 300,
      HP: 500,
      SPEED: 1.5,
      SCALE: 3,
      COLOR: "#ef4444",
      REWARD_XP: 200,
      REWARD_COINS: 100,
      REWARD_LEVELS: 2,
    },
    SHOGUN: {
      NAME: "Shogun Corrompido",
      SPAWN_TIME: 600,
      HP: 1200,
      SPEED: 2.5,
      SCALE: 2,
      COLOR: "#111111",
      REWARD_XP: 500,
      REWARD_COINS: 300,
      REWARD_LEVELS: 3,
    },
    ONI_ATTACKS: {
      CHARGE: { COOLDOWN_F1: 8, COOLDOWN_F2: 5, SPEED: 8, DURATION: 2, DAMAGE: 30 },
      SLAM: { COOLDOWN_F1: 10, COOLDOWN_F2: 5, RADIUS: 5, DAMAGE: 40, WARNING_TIME: 1 },
      SUMMON: { COOLDOWN_F1: 15, COOLDOWN_F2: 12, COUNT_F1: 5, COUNT_F2: 10 },
      JUMP: { COOLDOWN_F2: 20, HEIGHT: 3, RADIUS: 8, DAMAGE: 50 }
    },
    SHOGUN_ATTACKS: {
      COMBO: { COOLDOWN: 6, DURATION: 2, DAMAGE: 2 },
      DASH: { COOLDOWN: 8, SPEED: 15, DURATION: 1 },
      TORNADO: { COOLDOWN: 10, SPEED: 5, DURATION: 3, DAMAGE: 1, RADIUS: 4 },
      TELEPORT: { COOLDOWN: 5, DELAY: 0.5 },
      PROJS: { COOLDOWN: 7, DURATION: 2, DAMAGE: 30, SPEED: 10 }
    }
  },

  // Automatic Abilities
  ABILITIES: {
    KUNAI: { NAME: "Kunai Orbital", BASE_DAMAGE: 15, RADIUS: 2, ROTATION_SPEED: 3.1415, MAX_LEVEL: 5 },
    LIGHTNING: { NAME: "Lightning Strike", BASE_DAMAGE: 40, RANGE: 15, BASE_COOLDOWN: 3, CD_REDUCTION: 0.4, MAX_LEVEL: 5 },
    FLAME: { NAME: "Flame Aura", BASE_DAMAGE_SEC: 5, BASE_RADIUS: 3, RADIUS_INCREASE: 0.5, MAX_LEVEL: 5 },
    CLONE: { NAME: "Shadow Clone", DELAY: 0.5, DISTANCE: 2, DAMAGE_PERCENT: 0.5, MAX_LEVEL: 3 },

    SHURIKEN: { NAME: "Shuriken Storm", DAMAGE: 20, COOLDOWN: 2, MAX_LEVEL: 5 },
    POISON: { NAME: "Poison Cloud", DAMAGE_SEC: 8, BASE_DURATION: 3, RADIUS: 4, COOLDOWN: 5, MAX_LEVEL: 5 },
    CHAIN_LIGHTNING: { NAME: "Chain Lightning", DAMAGE: 30, RANGE: 10, BOUNCE_RANGE: 5, MAX_LEVEL: 5 },
    GROUND_SPIKES: { NAME: "Ground Spikes", DAMAGE: 35, COOLDOWN: 4, RADIUS: 10, MAX_LEVEL: 5 },
    WOLVES: { NAME: "Spirit Wolves", DAMAGE: 15, SPEED: 6, HP: 50, MAX_LEVEL: 3 },
    METEOR: { NAME: "Meteor Strike", IMPACT_DAMAGE: 80, AOE_DAMAGE: 20, AOE_RADIUS: 3, COOLDOWN: 8, MAX_LEVEL: 5 },

    // Evolutions
    FIRE_SPIRAL: { NAME: "Fire Spiral", DAMAGE: 25, BURN_DAMAGE: 5, BURN_DURATION: 2, RADIUS: 3 },
    THUNDER_GOD: { NAME: "Thunder God", DAMAGE: 50, BOUNCES: 10 },
    LEGION: { NAME: "Legion", CLONES: 3, KUNAIS_PER_CLONE: 3 },
    TOXIC_INFERNO: { NAME: "Toxic Inferno", RADIUS: 6, POISON_DAMAGE: 10, BURN_DAMAGE: 15 },
    BLADE_STORM: { NAME: "Blade Storm", SHURIKENS: 10, SPIKES: 15, COOLDOWN: 3 },
    CELESTIAL_PACK: { NAME: "Celestial Pack", WOLVES: 3, METEOR_TRIGGER: true },
  },

  // Spawning System
  SPAWN: {
    INTERVAL: 3.0,
    INITIAL_COUNT: 5,
    INCREASE_RATE: 2,
    INCREASE_INTERVAL: 30,
    MAX_SIMULTANEOUS: 50,
    RATIOS: { SLIME: 0.40, SKELETON: 0.20, BAT: 0.15, NINJA: 0.10, MAGE: 0.08, OGRE: 0.05, MINI_ONI: 0.02 },
    SAFE_DISTANCE: 15,
  },

  // Meta Progression
  META: {
    COSTS: {
      HP: 50,
      DAMAGE: 50,
      SPEED: 80,
      XP: 100,
      REROLL: 200,
    },
    UNLOCKS: {
      SHURIKEN: 150,
      POISON: 200,
      CHAIN: 250,
      SPIKES: 300,
      WOLVES: 350,
      METEOR: 400,
    }
  },

  // Difficulties
  DIFFICULTIES: {
    NORMAL: { id: 'normal', name: 'Normal', hpMult: 1, damageMult: 1, spawnMult: 1, rewardMult: 1 },
    HARD: { id: 'hard', name: 'Difícil', hpMult: 1.5, damageMult: 1.3, spawnMult: 1.3, rewardMult: 2 },
    NIGHTMARE: { id: 'nightmare', name: 'Pesadilla', hpMult: 2.5, damageMult: 1.8, spawnMult: 1.8, rewardMult: 3, earlyEnemies: true },
  },

  // Camera Follow
  CAMERA: {
    OFFSET: { x: 0, y: 4, z: 8 },
    BOSS_OFFSET: { x: 0, y: 6, z: 12 },
    SMOOTH_TIME: 0.3,
    LOOK_AHEAD: 2,
    FOV: 50,
  },

  // Physics
  PHYSICS: {
    GRAVITY: -9.81,
    PLAYER_MASS: 1,
  }
};

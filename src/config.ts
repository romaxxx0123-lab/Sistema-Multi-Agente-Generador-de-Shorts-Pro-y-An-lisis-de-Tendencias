/**
 * Adjustable parameters for Ronin Survivor - Part 3
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
    SLIME: {
      TYPE: 'slime',
      HP: 50,
      SPEED: 2.0,
      DAMAGE: 10,
      XP_DROP: { min: 3, max: 5 },
      COLOR: "#a855f7", // Purple
      RADIUS: 0.4,
    },
    SKELETON: {
      TYPE: 'skeleton',
      HP: 80,
      SPEED: 2.5,
      DAMAGE: 15,
      XP_DROP: { min: 5, max: 8 },
      COLOR: "#f8fafc", // White
      RADIUS: 0.5,
      HEIGHT: 1.5,
    },
    BAT: {
      TYPE: 'bat',
      HP: 30,
      SPEED: 4.0,
      DAMAGE: 8,
      XP_DROP: { min: 2, max: 4 },
      COLOR: "#1e293b", // Dark/Black
      RADIUS: 0.3,
      HEIGHT: 2.0, // Flying height
    },
    OGRE: {
      TYPE: 'ogre',
      HP: 150,
      SPEED: 1.5,
      DAMAGE: 25,
      XP_DROP: { min: 10, max: 15 },
      COLOR: "#166534", // Dark Green
      RADIUS: 0.7,
      HEIGHT: 1.5,
      KNOCKBACK_THRESHOLD: 20,
      KNOCKBACK_DISTANCE: 2,
    }
  },

  // Boss Oni Rojo
  BOSS: {
    NAME: "Oni Rojo",
    SPAWN_TIME: 300, // seconds (5 minutes)
    HP: 500,
    SPEED: 1.5,
    SCALE: 3,
    COLOR: "#ef4444",
    REWARD_XP: 200,
    REWARD_LEVELS: 2,
    ATTACKS: {
      CHARGE: {
        COOLDOWN_F1: 8,
        COOLDOWN_F2: 5,
        SPEED: 8,
        DURATION: 2,
        DAMAGE: 30,
      },
      SLAM: {
        COOLDOWN_F1: 10,
        COOLDOWN_F2: 5, // double slam effectively reduces cooldown or double hits
        RADIUS: 5,
        DAMAGE: 40,
        WARNING_TIME: 1,
      },
      SUMMON: {
        COOLDOWN_F1: 15,
        COOLDOWN_F2: 12,
        COUNT_F1: 5,
        COUNT_F2: 10,
      },
      JUMP: {
        COOLDOWN_F2: 20,
        HEIGHT: 3,
        RADIUS: 8,
        DAMAGE: 50,
      }
    }
  },

  // Automatic Abilities
  ABILITIES: {
    KUNAI: {
      NAME: "Kunai Orbital",
      BASE_DAMAGE: 15,
      RADIUS: 2,
      ROTATION_SPEED: 3.1415, // 180 deg/s in radians
      MAX_LEVEL: 5,
    },
    LIGHTNING: {
      NAME: "Lightning Strike",
      BASE_DAMAGE: 40,
      RANGE: 15,
      BASE_COOLDOWN: 3,
      CD_REDUCTION: 0.4,
      MAX_LEVEL: 5,
    },
    FLAME: {
      NAME: "Flame Aura",
      BASE_DAMAGE_SEC: 5,
      BASE_RADIUS: 3,
      RADIUS_INCREASE: 0.5,
      MAX_LEVEL: 5,
    },
    CLONE: {
      NAME: "Shadow Clone",
      DELAY: 0.5,
      DISTANCE: 2,
      DAMAGE_PERCENT: 0.5,
      MAX_LEVEL: 3,
    },
    FIRE_SPIRAL: {
      NAME: "Fire Spiral",
      DAMAGE: 25,
      BURN_DAMAGE: 5,
      BURN_DURATION: 2,
      RADIUS: 3,
    }
  },

  // Spawning System
  SPAWN: {
    INTERVAL: 3.0, // seconds
    INITIAL_COUNT: 5,
    INCREASE_RATE: 2, // +2 enemies
    INCREASE_INTERVAL: 30, // every 30 seconds
    MAX_SIMULTANEOUS: 50,
    RATIOS: {
      SLIME: 0.55,
      SKELETON: 0.25,
      BAT: 0.15,
      OGRE: 0.05,
    },
    SAFE_DISTANCE: 15, // minimum distance from player
  },

  // Progression
  PROGRESSION: {
    XP_BASE: 10, // XP for level 2
  },

  // Upgrades (Passive)
  UPGRADES: {
    DAMAGE_BOOST: 0.20, // +20%
    SPEED_BOOST: 0.15, // +15%
    HP_BOOST: 30,      // +30 flat
    ATTACK_CD_REDUCTION: 0.2, // -0.2s
    DASH_CD_REDUCTION: 0.5,   // -0.5s
  },

  // Camera Follow
  CAMERA: {
    OFFSET: { x: 0, y: 4, z: 8 },
    BOSS_OFFSET: { x: 0, y: 6, z: 12 }, // Zoom out for boss
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

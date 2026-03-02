/**
 * Adjustable parameters for Ronin Survivor - Part 2
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
    }
  },

  // Spawning System
  SPAWN: {
    INTERVAL: 3.0, // seconds
    INITIAL_COUNT: 5,
    INCREASE_RATE: 2, // +2 enemies
    INCREASE_INTERVAL: 30, // every 30 seconds
    SLIME_RATIO: 0.7, // 70% Slimes
    SAFE_DISTANCE: 15, // minimum distance from player
  },

  // Progression
  PROGRESSION: {
    XP_BASE: 10, // XP for level 2
    // XP_NEEDED = Level * 10
  },

  // Upgrades
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

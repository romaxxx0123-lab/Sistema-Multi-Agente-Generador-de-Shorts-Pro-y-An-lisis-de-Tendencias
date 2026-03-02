/**
 * Adjustable parameters for Ronin Survivor - Part 1B
 * These values can be tuned to change the game's feel.
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

  // Player Movement
  PLAYER: {
    MOVE_SPEED: 5,
    ROTATION_SPEED: 12.56, // 720 degrees in radians per second
    CAPSULE_RADIUS: 0.5,
    CAPSULE_HEIGHT: 1,
    COLOR: "#1cb0f6",
    DASH_COLOR: "#84d8ff",
  },

  // Dash System
  DASH: {
    DISTANCE: 5,
    DURATION: 0.3, // seconds
    COOLDOWN: 2.0, // seconds
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

/**
 * RONIN SURVIVOR - CONFIGURATION (Part 1A)
 * Adjustable parameters for the core game loop.
 */
export const GAME_CONFIG = {
  // Arena Settings
  ARENA: {
    SIZE: 50,
    WALL_HEIGHT: 5,
    COLOR: "#333333",
    GRID_COLOR: "#444444",
  },

  // Player Stats
  PLAYER: {
    MOVE_SPEED: 5,         // meters/second
    ROTATION_SPEED: 12.56, // ~720 degrees in radians per second
    RADIUS: 0.5,
    HEIGHT: 1.0,
    COLOR: "#1cb0f6",
  },

  // Camera Settings
  CAMERA: {
    OFFSET: { x: 0, y: 4, z: 8 }, // 4m up, 8m behind
    FOV: 50,
  },

  // Physics
  PHYSICS: {
    GRAVITY: -9.81,
    PLAYER_MASS: 1,
  }
};

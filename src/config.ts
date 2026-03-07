/**
 * RONIN SURVIVOR - OPTIMIZED CONFIGURATION
 * Centralized parameters for performance, physics, and gameplay.
 */
export const CONFIG = {
  // Performance & Rendering
  PERFORMANCE: {
    TARGET_FPS: 60,
    MAX_DELTA: 0.1,
    ENABLE_SHADOWS: true,
  },

  // Physics (Rapier Specific)
  PHYSICS: {
    GRAVITY: [0, -20.0, 0] as [number, number, number], // Stronger gravity for tactile feel
    TIME_STEP: 1/60,
    MAX_SUBSTEPS: 1,
  },

  // Player Stats & Physical Properties
  PLAYER: {
    MOVE_SPEED: 7.0, // Increased for larger map
    ROTATION_SPEED: 15.0,
    COLLIDER_RADIUS: 0.5,
    COLLIDER_HEIGHT: 2.0,
    MASS: 1.0,
  },

  // Arena Dimensions - EXPANDED FOR FULL GAMEPLAY
  ARENA: {
    SIZE: 200,
    WALL_HEIGHT: 10,
  },

  // Camera Perspective
  CAMERA: {
    OFFSET_X: 0,
    OFFSET_Y: 10, // Higher for better visibility on large map
    OFFSET_Z: -12,
    SMOOTH_SPEED: 4.0,
    LOOK_AT_HEIGHT: 1.0,
    FOV: 60, // Lower FOV for more cinematic feel
    NEAR: 0.1,
    FAR: 2000,
  },

  POOLS: {
    ENEMY_ONCE: 100,
    PROJECTILES: 200,
    PICKUPS: 300,
  },
} as const;

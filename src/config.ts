/**
 * RONIN SURVIVOR - OPTIMIZED CONFIGURATION
 * Centralized parameters for performance, physics, and gameplay.
 */
export const CONFIG = {
  // Performance & Rendering
  PERFORMANCE: {
    TARGET_FPS: 60,
    MAX_DELTA: 0.1, // Limit physics step to avoid tunneling
    ENABLE_SHADOWS: true, // Enabled for the visual upgrade
  },

  // Physics (Rapier Specific)
  PHYSICS: {
    GRAVITY: [0, -9.81, 0] as [number, number, number],
    TIME_STEP: 1/60,
    MAX_SUBSTEPS: 1, // Minimize sub-steps for maximum performance
  },

  // Player Stats & Physical Properties
  PLAYER: {
    MOVE_SPEED: 5.0,
    ROTATION_SPEED: 12.5, // ~720 deg/s
    COLLIDER_RADIUS: 0.5,
    COLLIDER_HEIGHT: 2.0,
    MASS: 1.0,
  },

  // Arena Dimensions
  ARENA: {
    SIZE: 50,
    WALL_HEIGHT: 5,
  },

  // Camera Perspective
  CAMERA: {
    OFFSET_X: 0,
    OFFSET_Y: 4,
    OFFSET_Z: -8, // Negative = Behind in World Space
    SMOOTH_SPEED: 5.0,
    LOOK_AT_HEIGHT: 1.5,
    FOV: 75,
    NEAR: 0.1,
    FAR: 1000,
  },

  // Future: Object Pooling Sizes (Part 2 Preparation)
  POOLS: {
    ENEMY_SLIME: 50,
    ENEMY_SKELETON: 30,
    PROJECTILES: 100,
    PARTICLES: 200,
  },
} as const;

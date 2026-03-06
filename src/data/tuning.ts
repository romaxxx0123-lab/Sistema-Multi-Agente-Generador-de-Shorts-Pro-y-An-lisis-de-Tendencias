/**
 * RONIN SURVIVOR - TUNING CENTRAL
 * All balance knobs and constants in one place.
 */

export const TUNING = {
    // XP CURVE
    XP: {
        BASE: 100,
        GROWTH: 1.25, // Multiplier per level
        ADDITIVE: 50,
        GEM_VALUES: {
            xp_small: 1,
            xp_medium: 10,
            xp_large: 50,
            xp_mega: 250
        }
    },

    // PICKUPS & MAGNET
    PICKUPS: {
        MAX_COUNT: 400,
        MERGE_RADIUS: 1.5,
        MAGNET_START_RANGE: 4, // Multiplied by player pickup pasive
        MAGNET_SPEED: 12,
        MERGE_COOLDOWN: 2.0
    },

    // CHEST RARITIES
    CHESTS: {
        COMMON: { weight: 0.70, rewards: 1, gold: 50 },
        RARE:   { weight: 0.20, rewards: 2, gold: 150 },
        EPIC:   { weight: 0.08, rewards: 3, gold: 500 },
        RELIC:  { weight: 0.02, rewards: 1, gold: 1000 } // Relic is special for Boss
    },

    // RARITY WEIGHTS (Level Up)
    LEVEL_UP: {
        WEIGHTS: {
            common: 0.80,
            rare: 0.15,
            epic: 0.05
        },
        REROLL_COST: 100 // Base gold cost
    },

    // JUICE & FEEDBACK
    JUICE: {
        HIT_STOP: 0.05, // Seconds
        SHAKE_INTENSITY: 0.2,
        SHAKE_DECAY: 5.0
    },

    // BOSS & ELITES
    BOSS: {
        WARNING_TIME: 5.0,
        HEALTH_MULTIPLIER: 10.0,
        DAMAGE_MULTIPLIER: 3.0
    },

    // GAMEPLAY
    PLAYER: {
        BASE_SPEED: 6.0,
        BASE_HP: 100,
        BASE_PICKUP_RANGE: 2.5
    }
};

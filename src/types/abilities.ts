/**
 * ABILITY TYPES & INTERFACES
 * Defines the auto-attack abilities and their level-scaling properties.
 */

export type AbilityType = 'orbital' | 'lightning' | 'aura' | 'barrage';

export interface AbilityStats {
    level: number;
    damage: number;
    range: number;
    cooldown: number;
    count: number;
    speed: number;
}

export interface AbilityDefinition {
    id: AbilityType;
    title: string;
    description: string;
    icon: string;
    stats: AbilityStats;
    maxLevel: number;
}

export interface UpgradeOption {
    id: AbilityType;
    title: string;
    description: string;
    levelInfo: string;
    isNew: boolean;
}

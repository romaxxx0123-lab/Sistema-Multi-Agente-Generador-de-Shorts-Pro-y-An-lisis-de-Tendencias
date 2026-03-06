/**
 * ABILITY TYPES & INTERFACES
 * Defines the auto-attack abilities and their level-scaling properties.
 */

export type AbilityType = 'orbital' | 'lightning' | 'aura' | 'barrage' | 'iai_slash';
export type PassiveType = 'damage' | 'cdr' | 'movespeed' | 'magnet' | 'maxhp' | 'gold' | 'crit';

export interface AbilityStats {
    level: number;
    damage: number;
    range: number;
    cooldown: number;
    count: number;
    speed: number;
    angle?: number; // For frontal cones
    isEvolved?: boolean;
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
    id: AbilityType | PassiveType;
    type: 'skill' | 'passive' | 'evolution';
    title: string;
    description: string;
    levelInfo: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    isNew: boolean;
}

export interface PendingOverlay {
    type: 'levelup' | 'chest';
    payload: any;
}

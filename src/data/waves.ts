import { AbilityType } from '../types/abilities';

export interface WaveSegment {
    tStart: number;
    tEnd: number;
    spawnRate: number;
    enemyMix: Array<{ type: 'skeleton' | 'ninja' | 'oni' | 'samurai', weight: number }>;
    eliteChance: number;
    boss?: {
        type: 'oni' | 'samurai';
        hpMultiplier: number;
    };
    waveName?: string;
    chestEvent?: boolean;
}

export const TIMELINE: WaveSegment[] = [
    {
        tStart: 0,
        tEnd: 60,
        spawnRate: 2.0,
        enemyMix: [{ type: 'skeleton', weight: 1 }],
        eliteChance: 0.01,
        waveName: "EL DESPERTAR"
    },
    {
        tStart: 60,
        tEnd: 120,
        spawnRate: 1.5,
        enemyMix: [
            { type: 'skeleton', weight: 0.7 },
            { type: 'ninja', weight: 0.3 }
        ],
        eliteChance: 0.03,
        waveName: "SOMBRAS ACECHANTES"
    },
    {
        tStart: 120,
        tEnd: 180,
        spawnRate: 1.2,
        enemyMix: [
            { type: 'skeleton', weight: 0.5 },
            { type: 'ninja', weight: 0.4 },
            { type: 'oni', weight: 0.1 }
        ],
        eliteChance: 0.05,
        waveName: "LA GUARDIA PESADA"
    },
    {
        tStart: 180,
        tEnd: 240,
        spawnRate: 1.0,
        enemyMix: [
            { type: 'ninja', weight: 0.5 },
            { type: 'oni', weight: 0.3 },
            { type: 'samurai', weight: 0.2 }
        ],
        eliteChance: 0.1,
        waveName: "DUELO DE HONOR",
        chestEvent: true
    },
    {
        tStart: 240,
        tEnd: 300,
        spawnRate: 0.8,
        enemyMix: [
            { type: 'skeleton', weight: 0.2 },
            { type: 'ninja', weight: 0.3 },
            { type: 'oni', weight: 0.3 },
            { type: 'samurai', weight: 0.2 }
        ],
        eliteChance: 0.15,
        waveName: "TORMENTA DE ACERO"
    },
    {
        tStart: 300,
        tEnd: 360,
        spawnRate: 3.0, // Slow down for boss
        enemyMix: [{ type: 'skeleton', weight: 1 }],
        eliteChance: 0,
        boss: { type: 'samurai', hpMultiplier: 10 },
        waveName: "EL GRAN MAESTRO"
    }
];

import { AbilityType } from '../types/abilities';
import { Sword, Zap, Flame, Target } from 'lucide-react';
import React from 'react';

export interface AbilityMeta {
    id: AbilityType;
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    upgrades: string[];
}

export const ABILITY_METADATA: Record<AbilityType, AbilityMeta> = {
    orbital: {
        id: 'orbital',
        title: 'KUNAI ORBITAL',
        description: 'Cuchillas místicas que giran protegiéndote.',
        icon: React.createElement(Sword, { className: "text-blue-400" }),
        color: '#3498DB',
        rarity: 'rare',
        upgrades: [
            'Desbloquea 2 kunais giratorios.',
            'Daño +20%',
            '+1 Kunai adicional',
            'Daño +30%',
            '+2 Kunais adicionales',
            'Velocidad de rotación +50%',
            'Daño +50%',
            'MAESTRÍA: Kunais gigantes con área extendida'
        ]
    },
    lightning: {
        id: 'lightning',
        title: 'RAYO DIVINO',
        description: 'Fulmina a los enemigos con rayos del cielo.',
        icon: React.createElement(Zap, { className: "text-yellow-400" }),
        color: '#F1C40F',
        rarity: 'epic',
        upgrades: [
            'Lanza un rayo al enemigo más cercano.',
            'Rango +25%',
            '+1 Rayo simultáneo',
            'Enfriamiento -20%',
            '+2 Rayos simultáneos',
            'Daño +40%',
            'Enfriamiento -30%',
            'MAESTRÍA: Tormenta eléctrica continua'
        ]
    },
    aura: {
        id: 'aura',
        title: 'AURA DE FUEGO',
        description: 'Quema a todo aquel que se acerque demasiado.',
        icon: React.createElement(Flame, { className: "text-red-500" }),
        color: '#E67E22',
        rarity: 'uncommon',
        upgrades: [
            'Genera un anillo de fuego dañino.',
            'Radio del aura +20%',
            'Daño por segundo +25%',
            'Radio del aura +20%',
            'Daño por segundo +25%',
            'Empuje (Knockback) aumentado',
            'Radio del aura +30%',
            'MAESTRÍA: Aura de magma que ralentiza enemigos'
        ]
    },
    barrage: {
        id: 'barrage',
        title: 'RÁFAGA DE KUNAI',
        description: 'Lanza múltiples proyectiles hacia adelante.',
        icon: React.createElement(Target, { className: "text-cyan-400" }),
        color: '#1ABC9C',
        rarity: 'rare',
        upgrades: [
            'Dispara 3 kunais en abanico.',
            'Daño +20%',
            '+2 Proyectiles',
            'Velocidad de proyectil +30%',
            '+3 Proyectiles',
            'Daño +30%',
            'Atraviesa 1 enemigo extra',
            'MAESTRÍA: Lluvia infinita de acero'
        ]
    }
};

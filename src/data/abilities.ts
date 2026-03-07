import { AbilityType, PassiveType } from '../types/abilities';
import { Sword, Zap, Flame, Target, Wind, Shield, Coins, Activity, Crosshair, Magnet } from 'lucide-react';
import React from 'react';

export interface AbilityMeta {
    id: AbilityType | PassiveType;
    title: string;
    description: string;
    icon: React.ReactNode;
    color: string;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    upgrades: string[];
}

export const ABILITY_METADATA: Record<string, AbilityMeta> = {
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
            'MAESTRÍA: Órbita Sellada (Evolución disponible)'
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
    },
    iai_slash: {
        id: 'iai_slash',
        title: 'CORTE IAI',
        description: 'Un tajo frontal devastador de acero puro.',
        icon: React.createElement(Wind, { className: "text-red-400" }),
        color: '#E74C3C',
        rarity: 'common',
        upgrades: [
            'Tajo rápido en cono frontal.',
            'Daño +30%',
            'Ángulo de corte +50%',
            'Enfriamiento -20%',
            'Un tajo extra (doble golpe)',
            'Rango de alcance +50%',
            'Daño +50%',
            'MAESTRÍA: Corte Fantasma (Evolución disponible)'
        ]
    },
    // PASSIVES
    damage: {
        id: 'damage',
        title: 'ACERO TEMPLADO',
        description: 'Aumenta el daño de todos tus ataques.',
        icon: React.createElement(Activity, { className: "text-red-600" }),
        color: '#C0392B',
        rarity: 'common',
        upgrades: ['Daño global +10%', 'Daño global +20%', 'Daño global +30%', 'Daño global +40%', 'Daño global +50%']
    },
    cdr: {
        id: 'cdr',
        title: 'RESPIRACIÓN ZEN',
        description: 'Reduce el enfriamiento de tus habilidades.',
        icon: React.createElement(Wind, { className: "text-green-400" }),
        color: '#27AE60',
        rarity: 'rare',
        upgrades: ['Enfriamiento -8%', 'Enfriamiento -16%', 'Enfriamiento -24%', 'Enfriamiento -32%', 'Enfriamiento -40%']
    },
    movespeed: {
        id: 'movespeed',
        title: 'PASO LIGERO',
        description: 'Te mueves más rápido por el campo de batalla.',
        icon: React.createElement(Wind, { className: "text-blue-200" }),
        color: '#ECF0F1',
        rarity: 'common',
        upgrades: ['Velocidad +10%', 'Velocidad +20%', 'Velocidad +30%', 'Velocidad +40%', 'Velocidad +50%']
    },
    magnet: {
        id: 'magnet',
        title: 'OJO DEL RONIN',
        description: 'Atrae objetos desde una distancia mayor.',
        icon: React.createElement(Magnet, { className: "text-purple-400" }),
        color: '#9B59B6',
        rarity: 'common',
        upgrades: ['Rango de recogida +25%', 'Rango de recogida +50%', 'Rango de recogida +75%', 'Rango de recogida +100%', 'Rango de recogida +150%']
    },
    maxhp: {
        id: 'maxhp',
        title: 'ARMADURA DE OBSIDIANA',
        description: 'Aumenta tu salud máxima considerablemente.',
        icon: React.createElement(Shield, { className: "text-gray-400" }),
        color: '#2C3E50',
        rarity: 'common',
        upgrades: ['Vida Máxima +20%', 'Vida Máxima +40%', 'Vida Máxima +60%', 'Vida Máxima +80%', 'Vida Máxima +100%']
    },
    gold: {
        id: 'gold',
        title: 'SELLO DORADO',
        description: 'Encuentras más oro y mejores cofres.',
        icon: React.createElement(Coins, { className: "text-yellow-600" }),
        color: '#D4AC0D',
        rarity: 'rare',
        upgrades: ['Oro obtenido +20%', 'Oro obtenido +40%', 'Oro obtenido +60%', 'Suerte en cofres +20%', 'MAESTRÍA: Bonus Meta-XP']
    },
    crit: {
        id: 'crit',
        title: 'TINTA DE GUERRA',
        description: 'Aumenta la probabilidad de golpes críticos.',
        icon: React.createElement(Crosshair, { className: "text-orange-500" }),
        color: '#E67E22',
        rarity: 'epic',
        upgrades: ['Crit Chance +5%', 'Crit Chance +10%', 'Crit Chance +15%', 'Crit Damage +50%', 'MAESTRÍA: Los críticos explotan']
    }
};

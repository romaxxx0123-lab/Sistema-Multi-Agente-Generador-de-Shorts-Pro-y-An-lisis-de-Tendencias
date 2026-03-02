export interface MetaSaveData {
  metaXp: number;
  totalRuns: number;
  unlockedCharacters: string[];
  unlockedAbilities: string[];
  upgrades: {
    hp: number;
    damage: number;
    speed: number;
    xp: number;
    reroll: number;
  };
}

const SAVE_KEY = 'ronin_survivor_meta';

export const saveSystem = {
  save: (data: MetaSaveData) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  },

  load: (): MetaSaveData => {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
    return {
      metaXp: 0,
      totalRuns: 0,
      unlockedCharacters: ['ronin'],
      unlockedAbilities: [
        'kunai', 'lightning', 'flame', 'clone'
      ],
      upgrades: {
        hp: 0,
        damage: 0,
        speed: 0,
        xp: 0,
        reroll: 0
      }
    };
  }
};

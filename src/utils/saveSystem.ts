export interface MetaSaveData {
  version: number;
  metaXp: number;
  totalRuns: number;
  unlockedCharacters: string[];
  unlockedChapters: string[];
  selectedChapterId: string;
  loadoutPerk: string | null;
  talents: {
    hp: number;
    damage: number;
    speed: number;
    pickupRange: number;
    cooldown: number;
  };
  settings: {
    volumeMusic: number;
    volumeSFX: number;
    qualityHigh: boolean;
  };
}

const SAVE_KEY = 'ronin_survivor_meta_v2';

export const DEFAULT_SAVE: MetaSaveData = {
  version: 2,
  metaXp: 0,
  totalRuns: 0,
  unlockedCharacters: ['ronin'],
  unlockedChapters: ['chapter_1'],
  selectedChapterId: 'chapter_1',
  loadoutPerk: null,
  talents: {
    hp: 0,
    damage: 0,
    speed: 0,
    pickupRange: 0,
    cooldown: 0
  },
  settings: {
    volumeMusic: 80,
    volumeSFX: 80,
    qualityHigh: true
  }
};

export const saveSystem = {
  save: (data: MetaSaveData) => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save game data:', e);
    }
  },

  load: (): MetaSaveData => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Basic migration/validation
        return { ...DEFAULT_SAVE, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load game data:', e);
    }
    return DEFAULT_SAVE;
  }
};

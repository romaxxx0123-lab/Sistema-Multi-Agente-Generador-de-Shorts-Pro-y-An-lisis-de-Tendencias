import { create } from 'zustand';
import { Mesh } from 'three';

interface GameState {
  playerRef: Mesh | null;
  setPlayerRef: (ref: Mesh | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  playerRef: null,
  setPlayerRef: (ref) => set({ playerRef: ref }),
}));

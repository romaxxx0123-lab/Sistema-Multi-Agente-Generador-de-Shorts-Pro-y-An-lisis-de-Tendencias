import { create } from 'zustand';
import { Mesh } from 'three';

interface GameState {
  status: 'playing' | 'paused' | 'gameover';
  playerRef: Mesh | null;

  setStatus: (status: 'playing' | 'paused' | 'gameover') => void;
  setPlayerRef: (ref: Mesh | null) => void;
  togglePause: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  status: 'playing',
  playerRef: null,

  setStatus: (status) => set({ status }),
  setPlayerRef: (ref) => set({ playerRef: ref }),
  togglePause: () => set((state) => ({
    status: state.status === 'playing' ? 'paused' : (state.status === 'paused' ? 'playing' : state.status)
  })),
}));

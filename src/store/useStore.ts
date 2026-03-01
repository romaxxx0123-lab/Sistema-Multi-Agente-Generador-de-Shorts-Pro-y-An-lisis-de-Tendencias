import { create } from 'zustand';
import type { Lesson } from '../types';

interface GameState {
  completedLessons: string[];
  hearts: number;
  activeLesson: Lesson | null;
  currentQuestionIndex: number;

  startLesson: (lesson: Lesson) => void;
  finishLesson: () => void;
  loseHeart: () => void;
  nextQuestion: () => void;
  resetHearts: () => void;
  exitLesson: () => void;
}

export const useStore = create<GameState>((set) => ({
  completedLessons: [],
  hearts: 5,
  activeLesson: null,
  currentQuestionIndex: 0,

  startLesson: (lesson) => set({
    activeLesson: lesson,
    currentQuestionIndex: 0,
  }),

  finishLesson: () => set((state) => ({
    completedLessons: state.activeLesson && !state.completedLessons.includes(state.activeLesson.id)
      ? [...state.completedLessons, state.activeLesson.id]
      : state.completedLessons,
    activeLesson: null,
    currentQuestionIndex: 0,
  })),

  loseHeart: () => set((state) => ({
    hearts: Math.max(0, state.hearts - 1)
  })),

  nextQuestion: () => set((state) => ({
    currentQuestionIndex: state.currentQuestionIndex + 1
  })),

  resetHearts: () => set({ hearts: 5 }),

  exitLesson: () => set({ activeLesson: null, currentQuestionIndex: 0 }),
}));

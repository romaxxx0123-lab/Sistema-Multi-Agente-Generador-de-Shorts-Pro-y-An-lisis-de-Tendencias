import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Lesson } from '../types';

interface GameState {
  completedLessons: Record<string, number>; // lessonId -> level (0 to 3)
  hearts: number;
  xp: number;
  streak: number;
  lastCompletedDate: string | null;
  activeLesson: Lesson | null;
  currentQuestionIndex: number;
  missedQuestionIndices: number[];
  isReviewPhase: boolean;

  startLesson: (lesson: Lesson) => void;
  finishLesson: () => void;
  loseHeart: (questionIndex: number) => void;
  nextQuestion: () => void;
  resetHearts: () => void;
  exitLesson: () => void;
  addXP: (amount: number) => void;
}

export const useStore = create<GameState>()(
  persist(
    (set) => ({
      completedLessons: {},
      hearts: 5,
      xp: 0,
      streak: 0,
      lastCompletedDate: null,
      activeLesson: null,
      currentQuestionIndex: 0,
      missedQuestionIndices: [],
      isReviewPhase: false,

      startLesson: (lesson) => set({
        activeLesson: lesson,
        currentQuestionIndex: 0,
        missedQuestionIndices: [],
        isReviewPhase: false,
      }),

      finishLesson: () => set((state) => {
        const today = new Date().toISOString().split('T')[0];
        const lessonId = state.activeLesson?.id;

        let newStreak = state.streak;
        if (state.lastCompletedDate !== today) {
           newStreak += 1;
        }

        const currentLevel = (lessonId && state.completedLessons[lessonId]) || 0;
        const newLevel = Math.min(3, currentLevel + 1);

        return {
          completedLessons: lessonId
            ? { ...state.completedLessons, [lessonId]: newLevel }
            : state.completedLessons,
          xp: state.xp + 25,
          streak: newStreak,
          lastCompletedDate: today,
          activeLesson: null,
          currentQuestionIndex: 0,
          missedQuestionIndices: [],
          isReviewPhase: false,
        };
      }),

      loseHeart: (questionIndex) => set((state) => ({
        hearts: Math.max(0, state.hearts - 1),
        missedQuestionIndices: state.missedQuestionIndices.includes(questionIndex)
          ? state.missedQuestionIndices
          : [...state.missedQuestionIndices, questionIndex]
      })),

      nextQuestion: () => set((state) => {
        const nextIndex = state.currentQuestionIndex + 1;
        const totalQuestions = state.activeLesson?.questions.length || 0;

        if (!state.isReviewPhase && nextIndex >= totalQuestions) {
          if (state.missedQuestionIndices.length > 0) {
            return {
              isReviewPhase: true,
              currentQuestionIndex: 0
            };
          }
        }

        return {
          currentQuestionIndex: nextIndex
        };
      }),

      resetHearts: () => set({ hearts: 5 }),

      exitLesson: () => set({
        activeLesson: null,
        currentQuestionIndex: 0,
        missedQuestionIndices: [],
        isReviewPhase: false
      }),

      addXP: (amount) => set((state) => ({ xp: state.xp + amount })),
    }),
    {
      name: 'autolingo-storage',
      partialize: (state) => ({
        completedLessons: state.completedLessons,
        hearts: state.hearts,
        xp: state.xp,
        streak: state.streak,
        lastCompletedDate: state.lastCompletedDate
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  (window as any).useStore = useStore;
}

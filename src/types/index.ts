export type QuestionType = 'multiple-choice' | 'image-selection' | 'translation' | 'matching' | 'sentence-builder' | 'true-false';

export interface Option {
  id: string;
  text: string;
  image?: string;
  isCorrect: boolean;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  options?: Option[];
  pairs?: MatchingPair[];
  sentence?: string[]; // For sentence-builder
  correctOrder?: string[]; // For sentence-builder
  isTrue?: boolean; // For true-false
  explanation?: string;
}

export interface Lesson {
  id: string;
  title: string;
  questions: Question[];
}

export interface Unit {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
  color: string;
}

export interface Section {
  id: string;
  title: string;
  description: string;
  units: Unit[];
}

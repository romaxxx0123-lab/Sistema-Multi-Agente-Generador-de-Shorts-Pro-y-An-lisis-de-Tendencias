export type QuestionType = 'multiple-choice' | 'image-selection' | 'translation' | 'matching' | 'sentence-builder' | 'true-false' | 'part-pointing' | 'diagnostic';

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

export interface Hotspot {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  label: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  scenario?: string; // For diagnostic
  symptoms?: string[]; // For diagnostic
  options?: Option[];
  pairs?: MatchingPair[];
  sentence?: string[]; // For sentence-builder
  correctOrder?: string[]; // For sentence-builder
  isTrue?: boolean; // For true-false
  hotspots?: Hotspot[]; // For part-pointing
  diagramImage?: string; // For part-pointing
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

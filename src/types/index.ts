export type QuestionType = 'multiple-choice' | 'image-selection' | 'translation' | 'matching';

export interface Option {
  id: string;
  text: string;
  image?: string;
  isCorrect: boolean;
}

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  options: Option[];
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

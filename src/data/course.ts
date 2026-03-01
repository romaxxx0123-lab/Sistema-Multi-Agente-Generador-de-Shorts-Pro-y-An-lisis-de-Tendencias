import type { Section, Lesson } from '../types';

export const SECTIONS: Section[] = [
  {
    id: 'etapa-0',
    title: 'ETAPA 0: INTRODUCCIÓN Y MARCAS',
    description: 'Tus primeros pasos en el mundo del automóvil.',
    units: [
      {
        id: 'unit-intro',
        title: 'Lo Básico del Auto',
        description: 'Identifica las partes fundamentales que ves todos los días',
        color: 'bg-duo-green',
        lessons: [
          {
            id: 'lesson-0-0-1',
            title: '¿Qué es esto?',
            questions: [
              {
                id: 'q0-0-1-1',
                type: 'image-selection',
                prompt: 'Selecciona el volante (Timón)',
                options: [
                  { id: 'o1', text: 'Volante', image: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=300&auto=format&fit=crop', isCorrect: true },
                  { id: 'o2', text: 'Rueda', image: 'https://images.unsplash.com/photo-1590674899484-d5640e854abe?q=80&w=300&auto=format&fit=crop', isCorrect: false },
                  { id: 'o3', text: 'Asiento', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=300&auto=format&fit=crop', isCorrect: false },
                ],
                explanation: 'El volante permite controlar la dirección del vehículo.'
              },
              {
                id: 'q0-0-1-2',
                type: 'multiple-choice',
                prompt: '¿Cuántas ruedas tiene normalmente un auto?',
                options: [
                  { id: 'o1', text: '2', isCorrect: false },
                  { id: 'o2', text: '4', isCorrect: true },
                  { id: 'o3', text: '6', isCorrect: false },
                ],
                explanation: 'La mayoría de los autos tienen 4 ruedas.'
              }
            ]
          },
          {
            id: 'lesson-0-0-2',
            title: 'Ruedas y Neumáticos',
            questions: [
              {
                id: 'q0-0-2-1',
                type: 'multiple-choice',
                prompt: '¿De qué material están hechos principalmente los neumáticos?',
                options: [
                  { id: 'o1', text: 'Metal', isCorrect: false },
                  { id: 'o2', text: 'Caucho (Goma)', isCorrect: true },
                  { id: 'o3', text: 'Plástico rígido', isCorrect: false },
                ],
                explanation: 'El caucho permite que el neumático se adhiera al pavimento.'
              },
              {
                id: 'q0-0-2-2',
                type: 'true-false',
                prompt: '¿Es importante revisar la presión de aire de las ruedas?',
                isTrue: true,
                explanation: 'Una presión correcta mejora la seguridad y ahorra combustible.'
              }
            ]
          },
          {
            id: 'lesson-0-0-3',
            title: 'Entrando al Auto',
            questions: [
              {
                id: 'q0-0-3-1',
                type: 'part-pointing',
                prompt: 'Toca la manilla para abrir la puerta',
                diagramImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=1000&auto=format&fit=crop',
                hotspots: [
                  { id: 'h1', x: 45, y: 53, label: 'Manilla', isCorrect: true },
                  { id: 'h2', x: 50, y: 30, label: 'Espejo', isCorrect: false },
                ],
                explanation: 'La manilla permite accionar el mecanismo de apertura.'
              },
              {
                id: 'q0-0-3-2',
                type: 'multiple-choice',
                prompt: '¿Qué elemento de seguridad debemos abrocharnos siempre al entrar?',
                options: [
                  { id: 'o1', text: 'El casco', isCorrect: false },
                  { id: 'o2', text: 'El cinturón de seguridad', isCorrect: true },
                  { id: 'o3', text: 'Los guantes', isCorrect: false },
                ],
                explanation: 'El cinturón es el elemento que más vidas salva en el mundo.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-0',
        title: 'Cultura Automotriz 101',
        description: 'Conoce los logos y las leyendas del asfalto',
        color: 'bg-duo-blue',
        lessons: [
          {
            id: 'lesson-0-1',
            title: 'Marcas Emblemáticas',
            questions: [
              {
                id: 'q0-1',
                type: 'multiple-choice',
                prompt: '¿Qué animal aparece en el logo de Ferrari?',
                options: [
                  { id: 'o1', text: 'Un caballo rampante', isCorrect: true },
                  { id: 'o2', text: 'Un toro bravo', isCorrect: false },
                ],
                explanation: 'El "Cavallino Rampante" es el símbolo de Ferrari.'
              }
            ]
          },
          {
            id: 'lesson-0-2',
            title: 'Tipos de Carrocería',
            questions: [
              {
                id: 'q0-2-1',
                type: 'image-selection',
                prompt: '¿Cuál de estos es un auto "SUV"?',
                options: [
                  { id: 'o1', text: 'Sedán', image: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=300&auto=format&fit=crop', isCorrect: false },
                  { id: 'o2', text: 'SUV', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=300&auto=format&fit=crop', isCorrect: true },
                ],
                explanation: 'Un SUV es un vehículo utilitario deportivo con mayor despeje del suelo.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'licencia-b',
    title: 'LICENCIA B: MANEJO BÁSICO',
    description: 'Aprende las reglas de tránsito y control del vehículo.',
    units: [
      {
        id: 'unit-handling',
        title: 'Dominio del Vehículo',
        description: 'Física y control dinámico',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-1-1',
            title: 'Transferencia de Peso',
            questions: [
              {
                id: 'q1-1-1',
                type: 'multiple-choice',
                prompt: 'Al frenar bruscamente, ¿hacia dónde se desplaza el peso?',
                options: [
                  { id: 'o1', text: 'Hacia adelante', isCorrect: true },
                  { id: 'o2', text: 'Hacia atrás', isCorrect: false },
                ],
                explanation: 'La inercia empuja el peso del vehículo hacia el eje delantero al frenar.'
              }
            ]
          }
        ]
      }
    ]
  }
];

export const getAllLessons = (): Lesson[] => {
  const lessons: Lesson[] = [];
  SECTIONS.forEach(section => {
    section.units.forEach(unit => {
      lessons.push(...unit.lessons);
    });
  });
  return lessons;
};

export const getLessonStatus = (lessonId: string, completedLessons: Record<string, number>) => {
  const allLessons = getAllLessons();
  const lessonIndex = allLessons.findIndex(l => l.id === lessonId);
  const currentLevel = completedLessons[lessonId] || 0;

  if (lessonIndex <= 0) return {
    isLocked: false,
    isCompleted: currentLevel >= 3,
    level: currentLevel
  };

  const prevLesson = allLessons[lessonIndex - 1];
  const isLocked = (completedLessons[prevLesson.id] || 0) === 0;

  return {
    isLocked,
    isCompleted: currentLevel >= 3,
    level: currentLevel
  };
};

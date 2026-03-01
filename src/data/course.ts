import type { Unit } from '../types';

export const UNITS: Unit[] = [
  {
    id: 'unit-1',
    title: 'Fundamentos de los Autos',
    description: 'Aprende las partes básicas y cómo funciona un motor',
    color: 'bg-duo-green',
    lessons: [
      {
        id: 'lesson-1-1',
        title: 'Partes Exteriores',
        questions: [
          {
            id: 'q1',
            type: 'multiple-choice',
            prompt: '¿Cómo se llama la parte que cubre el motor?',
            options: [
              { id: 'o1', text: 'Capó', isCorrect: true },
              { id: 'o2', text: 'Maletero', isCorrect: false },
              { id: 'o3', text: 'Parabrisas', isCorrect: false },
              { id: 'o4', text: 'Chasis', isCorrect: false },
            ],
            explanation: 'El capó es la cubierta con bisagras que protege el motor del vehículo.'
          },
          {
            id: 'q2',
            type: 'multiple-choice',
            prompt: '¿Cuál es la función principal del radiador?',
            options: [
              { id: 'o21', text: 'Enfriar el motor', isCorrect: true },
              { id: 'o22', text: 'Dar energía a las luces', isCorrect: false },
              { id: 'o23', text: 'Filtrar el aceite', isCorrect: false },
              { id: 'o24', text: 'Limpiar el parabrisas', isCorrect: false },
            ],
            explanation: 'El radiador es una pieza clave del sistema de refrigeración del motor.'
          }
        ]
      },
      {
        id: 'lesson-1-2',
        title: 'El Motor',
        questions: []
      }
    ]
  },
  {
    id: 'unit-2',
    title: 'Mantenimiento Básico',
    description: 'Cambio de aceite, llantas y fluidos',
    color: 'bg-duo-blue',
    lessons: []
  }
];

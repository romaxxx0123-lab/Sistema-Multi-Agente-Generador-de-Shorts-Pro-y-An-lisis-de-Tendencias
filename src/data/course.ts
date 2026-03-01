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
            explanation: 'El radiador disipa el calor del líquido refrigerante para que el motor no se sobrecaliente.'
          },
          {
            id: 'q3',
            type: 'multiple-choice',
            prompt: '¿Qué componente limpia el agua del parabrisas?',
            options: [
              { id: 'o31', text: 'Limpiaparabrisas', isCorrect: true },
              { id: 'o32', text: 'Antena', isCorrect: false },
              { id: 'o33', text: 'Espejo retrovisor', isCorrect: false },
              { id: 'o34', text: 'Guardabarros', isCorrect: false },
            ],
            explanation: 'Las escobillas del limpiaparabrisas son esenciales para la visibilidad en lluvia.'
          }
        ]
      },
      {
        id: 'lesson-1-2',
        title: 'El Motor',
        questions: [
          {
            id: 'q4',
            type: 'multiple-choice',
            prompt: '¿Qué mezcla explota dentro de los cilindros?',
            options: [
              { id: 'o41', text: 'Aire y combustible', isCorrect: true },
              { id: 'o42', text: 'Agua y aceite', isCorrect: false },
              { id: 'o43', text: 'Solo gasolina', isCorrect: false },
              { id: 'o44', text: 'Aire y refrigerante', isCorrect: false },
            ],
            explanation: 'La combustión requiere una mezcla precisa de oxígeno y combustible.'
          },
          {
            id: 'q5',
            type: 'multiple-choice',
            prompt: '¿Cuál es la función de las bujías?',
            options: [
              { id: 'o51', text: 'Generar la chispa', isCorrect: true },
              { id: 'o52', text: 'Bombear gasolina', isCorrect: false },
              { id: 'o53', text: 'Enfriar los pistones', isCorrect: false },
              { id: 'o54', text: 'Girar las ruedas', isCorrect: false },
            ],
            explanation: 'En los motores de gasolina, la bujía inicia la explosión mediante una chispa eléctrica.'
          }
        ]
      }
    ]
  },
  {
    id: 'unit-2',
    title: 'Mantenimiento Básico',
    description: 'Cambio de aceite, llantas y fluidos',
    color: 'bg-duo-blue',
    lessons: [
      {
        id: 'lesson-2-1',
        title: 'Aceite y Fluidos',
        questions: [
          {
            id: 'q6',
            type: 'multiple-choice',
            prompt: '¿Cada cuánto se recomienda generalmente cambiar el aceite?',
            options: [
              { id: 'o61', text: 'Cada 5,000 - 10,000 km', isCorrect: true },
              { id: 'o62', text: 'Cada 50,000 km', isCorrect: false },
              { id: 'o63', text: 'Una vez al mes', isCorrect: false },
              { id: 'o64', text: 'Nunca, solo se rellena', isCorrect: false },
            ],
            explanation: 'El intervalo depende del tipo de aceite y del fabricante del auto.'
          }
        ]
      }
    ]
  },
  {
    id: 'unit-3',
    title: 'Seguridad y Frenos',
    description: 'Sistemas de frenado y seguridad activa',
    color: 'bg-duo-orange',
    lessons: [
      {
        id: 'lesson-3-1',
        title: 'Sistema de Frenos',
        questions: [
          {
            id: 'q7',
            type: 'multiple-choice',
            prompt: '¿Qué significa el sistema ABS?',
            options: [
              { id: 'o71', text: 'Sistema antibloqueo', isCorrect: true },
              { id: 'o72', text: 'Aceleración bajo suelo', isCorrect: false },
              { id: 'o73', text: 'Aire bajo suspensión', isCorrect: false },
              { id: 'o74', text: 'Arranque básico suave', isCorrect: false },
            ],
            explanation: 'El ABS evita que las ruedas se bloqueen durante una frenada de emergencia.'
          }
        ]
      }
    ]
  }
];

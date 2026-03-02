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
                prompt: '¿Cuál es el componente principal que da flexibilidad al neumático?',
                options: [
                  { id: 'o1', text: 'Acero trenzado', isCorrect: false },
                  { id: 'o2', text: 'Caucho vulcanizado', isCorrect: true },
                  { id: 'o3', text: 'Fibra de carbono', isCorrect: false },
                ],
                explanation: 'La vulcanización del caucho permite que sea elástico pero resistente al calor.'
              },
              {
                id: 'q0-0-2-2',
                type: 'true-false',
                prompt: '¿Los neumáticos tienen fecha de vencimiento?',
                isTrue: true,
                explanation: 'Sí, el caucho se degrada con el tiempo (desecación) y pierde agarre.'
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
          },
          {
            id: 'lesson-0-0-4',
            title: 'Bajo el Capó',
            questions: [
              {
                id: 'q0-0-4-1',
                type: 'multiple-choice',
                prompt: '¿Cuál es la función principal de la batería?',
                options: [
                  { id: 'o1', text: 'Enfriar el motor', isCorrect: false },
                  { id: 'o2', text: 'Dar energía para el arranque', isCorrect: true },
                  { id: 'o3', text: 'Almacenar gasolina', isCorrect: false },
                ],
                explanation: 'La batería proporciona la chispa inicial y energía a los sistemas eléctricos.'
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
          },
          {
            id: 'lesson-0-3',
            title: 'La Leyenda de Le Mans',
            questions: [
              {
                id: 'q0-3-1',
                type: 'multiple-choice',
                prompt: '¿Cuánto tiempo dura la carrera principal de Le Mans?',
                options: [
                  { id: 'o1', text: '12 horas', isCorrect: false },
                  { id: 'o2', text: '24 horas', isCorrect: true },
                  { id: 'o3', text: '500 millas', isCorrect: false },
                ],
                explanation: 'Es la carrera de resistencia más famosa del mundo: 24 Horas de Le Mans.'
              },
              {
                id: 'q0-3-2',
                type: 'multiple-choice',
                prompt: '¿Qué marca americana venció a Ferrari en 1966 con el GT40?',
                options: [
                  { id: 'o1', text: 'Chevrolet', isCorrect: false },
                  { id: 'o2', text: 'Ford', isCorrect: true },
                  { id: 'o3', text: 'Dodge', isCorrect: false },
                ],
                explanation: 'Ford logró el histórico 1-2-3 en 1966, rompiendo la racha de Ferrari.'
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
          },
          {
            id: 'lesson-1-2',
            title: 'El Apex Ideal',
            questions: [
              {
                id: 'q1-2-1',
                type: 'multiple-choice',
                prompt: '¿Qué es el "Apex" de una curva?',
                options: [
                  { id: 'o1', text: 'El punto de inicio del frenado', isCorrect: false },
                  { id: 'o2', text: 'El punto más interno de la trayectoria', isCorrect: true },
                  { id: 'o3', text: 'La salida de la curva', isCorrect: false },
                ],
                explanation: 'El Apex (o vértice) es el punto donde el auto está más cerca del interior de la curva.'
              }
            ]
          },
          {
            id: 'lesson-1-3',
            title: 'Sobre vs Subviraje',
            questions: [
              {
                id: 'q1-3-1',
                type: 'multiple-choice',
                prompt: '¿Qué sucede durante el "Subviraje" (Understeer)?',
                options: [
                  { id: 'o1', text: 'La parte trasera patina', isCorrect: false },
                  { id: 'o2', text: 'El auto gira menos de lo que indica el volante', isCorrect: true },
                ],
                explanation: 'En el subviraje, las ruedas delanteras pierden agarre y el auto tiende a seguir recto.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'licencia-a',
    title: 'LICENCIA A: INGENIERÍA Y PERFORMANCE',
    description: 'Conceptos avanzados de mecánica y aerodinámica.',
    units: [
      {
        id: 'unit-aero',
        title: 'Aerodinámica Avanzada',
        description: 'Vencer la resistencia del viento',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-2-1',
            title: 'Downforce y Drag',
            questions: [
              {
                id: 'q2-1-1',
                type: 'multiple-choice',
                prompt: '¿Cuál es el objetivo principal del alerón trasero?',
                options: [
                  { id: 'o1', text: 'Que el auto sea más ligero', isCorrect: false },
                  { id: 'o2', text: 'Generar carga aerodinámica (Downforce)', isCorrect: true },
                ],
                explanation: 'El alerón empuja el auto contra el suelo para aumentar el agarre en curvas.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-brakes',
        title: 'Sistemas Críticos',
        description: 'Frenado y Seguridad Activa',
        color: 'bg-duo-red',
        lessons: [
          {
            id: 'lesson-2-2',
            title: 'Frenos de Disco',
            questions: [
              {
                id: 'q2-2-1',
                type: 'multiple-choice',
                prompt: '¿Por qué los discos de freno deportivos suelen estar perforados?',
                options: [
                  { id: 'o1', text: 'Para ser más bonitos', isCorrect: false },
                  { id: 'o2', text: 'Para disipar el calor y evacuar gases', isCorrect: true },
                ],
                explanation: 'Las perforaciones ayudan a mantener los discos frescos durante frenadas intensas.'
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

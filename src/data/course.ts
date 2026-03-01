import type { Section } from '../types';

export const SECTIONS: Section[] = [
  {
    id: 'section-1',
    title: 'Sección 1: Principiante',
    description: 'Los primeros pasos en el mundo de los autos',
    units: [
      {
        id: 'unit-1',
        title: 'Fundamentos: Las Bases',
        description: 'Aprende las partes esenciales que todo conductor debe conocer',
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
            title: 'Interior y Control',
            questions: [
              {
                id: 'q10',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el pedal que se usa para cambiar de marcha en autos manuales?',
                options: [
                  { id: 'o101', text: 'Embrague', isCorrect: true },
                  { id: 'o102', text: 'Acelerador', isCorrect: false },
                  { id: 'o103', text: 'Freno de mano', isCorrect: false },
                  { id: 'o104', text: 'Diferencial', isCorrect: false },
                ],
                explanation: 'El embrague desconecta el motor de la transmisión para permitir el cambio de marcha.'
              },
              {
                id: 'q10-2',
                type: 'multiple-choice',
                prompt: '¿Qué instrumento indica la velocidad del vehículo?',
                options: [
                  { id: 'o1021', text: 'Velocímetro', isCorrect: true },
                  { id: 'o1022', text: 'Tacómetro', isCorrect: false },
                  { id: 'o1023', text: 'Odómetro', isCorrect: false },
                  { id: 'o1024', text: 'Manómetro', isCorrect: false },
                ],
                explanation: 'El velocímetro muestra la velocidad actual de desplazamiento en km/h o mph.'
              }
            ]
          },
          {
            id: 'lesson-1-3',
            title: 'Iluminación Básica',
            questions: [
              {
                id: 'q10-3',
                type: 'multiple-choice',
                prompt: '¿Qué luces se usan para indicar un giro?',
                options: [
                  { id: 'o1031', text: 'Intermitentes / Direccionales', isCorrect: true },
                  { id: 'o1032', text: 'Luces largas', isCorrect: false },
                  { id: 'o1033', text: 'Antiniebla', isCorrect: false },
                  { id: 'o1034', text: 'Luz de marcha atrás', isCorrect: false },
                ],
                explanation: 'Es vital usarlas para comunicar tus maniobras a otros conductores.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-2',
        title: 'Cabina y Mandos',
        description: 'Domina el tablero y los controles principales',
        color: 'bg-duo-blue',
        lessons: [
          {
            id: 'lesson-2-1',
            title: 'El Tablero',
            questions: [
              {
                id: 'q21',
                type: 'multiple-choice',
                prompt: '¿Qué indica el tacómetro?',
                options: [
                  { id: 'o211', text: 'Las revoluciones del motor (RPM)', isCorrect: true },
                  { id: 'o212', text: 'La temperatura del aceite', isCorrect: false },
                  { id: 'o213', text: 'La presión de las llantas', isCorrect: false },
                  { id: 'o214', text: 'La distancia recorrida', isCorrect: false },
                ],
                explanation: 'El tacómetro mide la velocidad de rotación del motor en revoluciones por minuto.'
              }
            ]
          },
          {
            id: 'lesson-2-2',
            title: 'Testigos de Advertencia',
            questions: [
              {
                id: 'q22',
                type: 'multiple-choice',
                prompt: 'Si ves una aceitera roja en el tablero, ¿qué significa?',
                options: [
                  { id: 'o221', text: 'Baja presión de aceite', isCorrect: true },
                  { id: 'o222', text: 'Nivel de gasolina bajo', isCorrect: false },
                  { id: 'o223', text: 'Puerta abierta', isCorrect: false },
                  { id: 'o224', text: 'Luces encendidas', isCorrect: false },
                ],
                explanation: 'Es una advertencia crítica; debes detener el motor de inmediato para evitar daños.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-3',
        title: 'Marcas y Emblemas',
        description: 'Identifica los fabricantes más famosos del mundo',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-3-1',
            title: 'Gigantes Alemanes',
            questions: [
              {
                id: 'q11',
                type: 'multiple-choice',
                prompt: '¿Qué marca tiene un logo con cuatro anillos entrelazados?',
                options: [
                  { id: 'o111', text: 'Audi', isCorrect: true },
                  { id: 'o112', text: 'BMW', isCorrect: false },
                  { id: 'o113', text: 'Mercedes-Benz', isCorrect: false },
                  { id: 'o114', text: 'Volkswagen', isCorrect: false },
                ],
                explanation: 'Los cuatro anillos representan la unión de cuatro fabricantes independientes en 1932.'
              }
            ]
          },
          {
            id: 'lesson-3-2',
            title: 'Marcas de Lujo',
            questions: [
              {
                id: 'q12',
                type: 'multiple-choice',
                prompt: '¿Cuál es el animal que aparece en el logo de Ferrari?',
                options: [
                  { id: 'o121', text: 'Un caballo (Cavallino Rampante)', isCorrect: true },
                  { id: 'o122', text: 'Un toro', isCorrect: false },
                  { id: 'o123', text: 'Un jaguar', isCorrect: false },
                  { id: 'o124', text: 'Un león', isCorrect: false },
                ],
                explanation: 'El "Cavallino Rampante" era originalmente el símbolo de un as de la aviación italiana.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-4',
        title: 'Tipos de Vehículos',
        description: 'SUV, Sedan, Hatchback... ¿Cuál es cuál?',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-4-1',
            title: 'Carrocerías Comunes',
            questions: [
              {
                id: 'q41',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el auto con maletero separado del habitáculo?',
                options: [
                  { id: 'o411', text: 'Sedán', isCorrect: true },
                  { id: 'o412', text: 'Hatchback', isCorrect: false },
                  { id: 'o413', text: 'SUV', isCorrect: false },
                  { id: 'o414', text: 'Pick-up', isCorrect: false },
                ],
                explanation: 'El sedán tiene tres volúmenes claramente definidos: motor, habitáculo y maletero.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'section-2',
    title: 'Sección 2: Intermedio',
    description: 'Bajo el capó y mantenimiento',
    units: [
      {
        id: 'unit-5',
        title: '¿Cómo Funciona?',
        description: 'Sumérgete en la mecánica y el corazón del auto',
        color: 'bg-duo-red',
        lessons: [
          {
            id: 'lesson-5-1',
            title: 'Ciclo del Motor',
            questions: [
              {
                id: 'q51',
                type: 'multiple-choice',
                prompt: '¿Qué mezcla explota dentro de los cilindros?',
                options: [
                  { id: 'o511', text: 'Aire y combustible', isCorrect: true },
                  { id: 'o512', text: 'Agua y aceite', isCorrect: false },
                  { id: 'o513', text: 'Solo gasolina', isCorrect: false },
                  { id: 'o514', text: 'Aire y refrigerante', isCorrect: false },
                ],
                explanation: 'La combustión requiere una mezcla precisa de oxígeno y combustible.'
              }
            ]
          }
        ]
      }
    ]
  }
];

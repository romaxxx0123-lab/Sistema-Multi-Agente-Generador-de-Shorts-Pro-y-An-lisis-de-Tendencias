import type { Unit } from '../types';

export const UNITS: Unit[] = [
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
          }
        ]
      }
    ]
  },
  {
    id: 'unit-2',
    title: 'Marcas y Emblemas',
    description: 'Identifica los fabricantes más famosos del mundo',
    color: 'bg-duo-blue',
    lessons: [
      {
        id: 'lesson-2-1',
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
        id: 'lesson-2-2',
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
    id: 'unit-3',
    title: '¿Cómo Funciona?',
    description: 'Sumérgete en la mecánica y el corazón del auto',
    color: 'bg-duo-purple',
    lessons: [
      {
        id: 'lesson-3-1',
        title: 'Ciclo del Motor',
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
    id: 'unit-4',
    title: 'Mantenimiento Experto',
    description: 'Cuida tu auto como un profesional',
    color: 'bg-duo-orange',
    lessons: [
      {
        id: 'lesson-4-1',
        title: 'Líquidos Vitales',
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
    id: 'unit-5',
    title: 'Autos Icónicos',
    description: 'Historias de leyendas sobre ruedas',
    color: 'bg-duo-red',
    lessons: [
      {
        id: 'lesson-5-1',
        title: 'El Auto del Pueblo',
        questions: [
          {
            id: 'q20',
            type: 'multiple-choice',
            prompt: '¿Qué modelo de Volkswagen es conocido como "Escarabajo" o "Vocho"?',
            options: [
              { id: 'o201', text: 'Beetle / Type 1', isCorrect: true },
              { id: 'o202', text: 'Golf', isCorrect: false },
              { id: 'o203', text: 'Passat', isCorrect: false },
              { id: 'o204', text: 'Jetta', isCorrect: false },
            ],
            explanation: 'Fue diseñado en los años 30 y se convirtió en uno de los autos más vendidos de la historia.'
          }
        ]
      },
      {
        id: 'lesson-5-2',
        title: 'Muscle Cars',
        questions: [
          {
            id: 'q21',
            type: 'multiple-choice',
            prompt: '¿Cuál de estos es un famoso "Muscle Car" americano?',
            options: [
              { id: 'o211', text: 'Ford Mustang', isCorrect: true },
              { id: 'o212', text: 'Fiat 500', isCorrect: false },
              { id: 'o213', text: 'Mini Cooper', isCorrect: false },
              { id: 'o214', text: 'Toyota Prius', isCorrect: false },
            ],
            explanation: 'El Mustang popularizó la categoría de autos deportivos americanos con motores potentes.'
          }
        ]
      }
    ]
  },
  {
    id: 'unit-6',
    title: 'El Futuro Eléctrico',
    description: 'La nueva era de la movilidad',
    color: 'bg-duo-yellow',
    lessons: [
      {
        id: 'lesson-6-1',
        title: 'Baterías y Voltaje',
        questions: [
          {
            id: 'q30',
            type: 'multiple-choice',
            prompt: '¿Qué unidad mide la capacidad de la batería de un auto eléctrico?',
            options: [
              { id: 'o301', text: 'kWh (Kilovatios-hora)', isCorrect: true },
              { id: 'o302', text: 'Caballos de fuerza', isCorrect: false },
              { id: 'o303', text: 'Litros', isCorrect: false },
              { id: 'o304', text: 'Octanaje', isCorrect: false },
            ],
            explanation: 'Los kWh determinan cuánta energía puede almacenar la batería y cuánta autonomía tendrá el auto.'
          }
        ]
      }
    ]
  }
];

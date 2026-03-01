import type { Section, Lesson } from '../types';

export const SECTIONS: Section[] = [
  {
    id: 'etapa-0',
    title: 'ETAPA 0: MARCAS Y COMPETICIÓN',
    description: 'Conceptos básicos, marcas icónicas y la historia de las carreras.',
    units: [
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
                  { id: 'o3', text: 'Un jaguar', isCorrect: false },
                  { id: 'o4', text: 'Un león', isCorrect: false },
                ],
                explanation: 'El "Cavallino Rampante" es el símbolo icónico de Ferrari desde sus inicios.'
              },
              {
                id: 'q0-1-2',
                type: 'image-selection',
                prompt: 'Selecciona el logo de Toyota',
                options: [
                  { id: 'o1', text: 'Toyota', image: 'https://www.car-logos.org/wp-content/uploads/2011/09/toyota.png', isCorrect: true },
                  { id: 'o2', text: 'Honda', image: 'https://www.car-logos.org/wp-content/uploads/2011/09/honda.png', isCorrect: false },
                  { id: 'o3', text: 'Mazda', image: 'https://www.car-logos.org/wp-content/uploads/2011/09/mazda.png', isCorrect: false },
                ],
                explanation: 'El logo de Toyota representa tres elipses entrelazadas que forman una "T".'
              },
              {
                id: 'q0-1-3',
                type: 'matching',
                prompt: 'Une la marca con su país de origen',
                pairs: [
                  { id: 'p1', left: 'Toyota', right: 'Japón' },
                  { id: 'p2', left: 'BMW', right: 'Alemania' },
                  { id: 'p3', left: 'Ferrari', right: 'Italia' },
                ],
                explanation: 'Cada marca tiene raíces profundas en la ingeniería de su país de origen.'
              }
            ]
          },
          {
            id: 'lesson-0-2',
            title: 'Historia y Carreras',
            questions: [
              {
                id: 'q0-2-1',
                type: 'multiple-choice',
                prompt: '¿Cuánto dura la carrera de resistencia más famosa del mundo?',
                options: [
                  { id: 'o1', text: '24 horas', isCorrect: true },
                  { id: 'o2', text: '12 horas', isCorrect: false },
                  { id: 'o3', text: '500 millas', isCorrect: false },
                  { id: 'o4', text: '1000 kilómetros', isCorrect: false },
                ],
                explanation: 'Le Mans es la prueba definitiva de resistencia durante un día completo.'
              },
              {
                id: 'q0-2-2',
                type: 'true-false',
                prompt: '¿La Fórmula 1 es la categoría más rápida de autos de circuito?',
                isTrue: true,
                explanation: 'La F1 es considerada la "categoría reina" por su avanzada tecnología y velocidad en curvas.'
              },
              {
                id: 'q0-2-3',
                type: 'multiple-choice',
                prompt: '¿De qué color es tradicionalmente un Ferrari de carreras?',
                options: [
                  { id: 'o1', text: 'Rojo', isCorrect: true },
                  { id: 'o2', text: 'Azul', isCorrect: false },
                  { id: 'o3', text: 'Verde', isCorrect: false },
                  { id: 'o4', text: 'Plateado', isCorrect: false },
                ],
                explanation: 'El color "Rosso Corsa" es el color nacional de carreras de Italia y el sello de Ferrari.'
              }
            ]
          },
          {
            id: 'lesson-0-3',
            title: 'Anatomía del Auto',
            questions: [
              {
                id: 'q0-3-1',
                type: 'part-pointing',
                prompt: '¿Dónde se encuentran los faros delanteros?',
                diagramImage: 'https://images.unsplash.com/photo-1494976388531-d1058494cdd8?q=80&w=1000&auto=format&fit=crop',
                hotspots: [
                  { id: 'h1', x: 20, y: 60, label: 'Faro Izquierdo', isCorrect: true },
                  { id: 'h2', x: 80, y: 60, label: 'Faro Derecho', isCorrect: true },
                  { id: 'h3', x: 50, y: 40, label: 'Parabrisas', isCorrect: false },
                  { id: 'h4', x: 50, y: 80, label: 'Parachoques', isCorrect: false },
                ],
                explanation: 'Los faros delanteros iluminan el camino y permiten que otros te vean.'
              },
              {
                id: 'q0-3-2',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama la pieza que cubre el motor en la parte delantera?',
                options: [
                  { id: 'o1', text: 'Capó (Bonnet)', isCorrect: true },
                  { id: 'o2', text: 'Maletero (Trunk)', isCorrect: false },
                  { id: 'o3', text: 'Chasis', isCorrect: false },
                  { id: 'o4', text: 'Guardabarros', isCorrect: false },
                ],
                explanation: 'El capó protege el motor y permite el acceso para mantenimiento.'
              }
            ]
          },
          {
            id: 'lesson-0-4',
            title: 'Los Mandos',
            questions: [
              {
                id: 'q0-4-1',
                type: 'matching',
                prompt: 'Une el pedal con su función principal',
                pairs: [
                  { id: 'p1', left: 'Acelerador', right: 'Aumentar velocidad' },
                  { id: 'p2', left: 'Freno', right: 'Reducir velocidad' },
                  { id: 'p3', left: 'Embrague (Clutch)', right: 'Cambiar de marcha' },
                ],
                explanation: 'Dominar los tres pedales es esencial para conducir un auto manual.'
              },
              {
                id: 'q0-4-2',
                type: 'true-false',
                prompt: '¿El pedal del freno suele ser el más ancho en un auto automático?',
                isTrue: true,
                explanation: 'En los automáticos, el pedal de freno es más grande para facilitar su uso con el pie derecho.'
              }
            ]
          },
          {
            id: 'lesson-0-5',
            title: 'Siluetas',
            questions: [
              {
                id: 'q0-5-1',
                type: 'multiple-choice',
                prompt: '¿Qué tipo de auto tiene 4 puertas y un maletero separado?',
                options: [
                  { id: 'o1', text: 'Sedán', isCorrect: true },
                  { id: 'o2', text: 'Coupé', isCorrect: false },
                  { id: 'o3', text: 'Hatchback', isCorrect: false },
                  { id: 'o4', text: 'Convertible', isCorrect: false },
                ],
                explanation: 'El sedán es la forma más clásica de automóvil familiar.'
              },
              {
                id: 'q0-5-2',
                type: 'image-selection',
                prompt: 'Selecciona el vehículo tipo SUV',
                options: [
                  { id: 'o1', text: 'SUV', image: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?q=80&w=500&auto=format&fit=crop', isCorrect: true },
                  { id: 'o2', text: 'Deportivo', image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=500&auto=format&fit=crop', isCorrect: false },
                  { id: 'o3', text: 'Compacto', image: 'https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?q=80&w=500&auto=format&fit=crop', isCorrect: false },
                ],
                explanation: 'Un SUV (Sport Utility Vehicle) destaca por su mayor altura y espacio.'
              }
            ]
          },
          {
            id: 'lesson-0-6',
            title: 'El Tablero',
            questions: [
              {
                id: 'q0-6-1',
                type: 'multiple-choice',
                prompt: '¿Qué significa esta luz roja: 🛢️?',
                options: [
                  { id: 'o1', text: 'Baja presión de aceite', isCorrect: true },
                  { id: 'o2', text: 'Falta de combustible', isCorrect: false },
                  { id: 'o3', text: 'Puerta abierta', isCorrect: false },
                  { id: 'o4', text: 'Freno de mano puesto', isCorrect: false },
                ],
                explanation: '¡Peligro! Si esta luz se enciende, debes apagar el motor inmediatamente para evitar daños graves.'
              },
              {
                id: 'q0-6-2',
                type: 'true-false',
                prompt: '¿La luz "Check Engine" siempre significa que el auto va a explotar?',
                isTrue: false,
                explanation: 'Indica un problema en el sistema de emisiones o motor, pero no siempre es una emergencia inmediata (aunque debe revisarse pronto).'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'licencia-b',
    title: 'LICENCIA B: FUNDAMENTOS DINÁMICOS',
    description: 'Control de masas, transferencia de peso y física básica de conducción.',
    units: [
      {
        id: 'unit-1',
        title: 'Dinámica de Vehículo 101',
        description: 'Domina las fuerzas que actúan sobre el chasis',
        color: 'bg-duo-green',
        lessons: [
          {
            id: 'lesson-1-1',
            title: 'Transferencia de Peso',
            questions: [
              {
                id: 'q1-1',
                type: 'multiple-choice',
                prompt: '¿Qué sucede con el parche de contacto delantero durante una frenada fuerte?',
                options: [
                  { id: 'o1', text: 'Aumenta debido a la transferencia de peso longitudinal', isCorrect: true },
                  { id: 'o2', text: 'Disminuye por la inercia del motor', isCorrect: false },
                  { id: 'o3', text: 'Se mantiene constante en neumáticos radiales', isCorrect: false },
                  { id: 'o4', text: 'Se desplaza hacia los flancos exteriores', isCorrect: false },
                ],
                explanation: 'Al frenar, el peso se desplaza hacia adelante, comprimiendo la suspensión frontal y aumentando la tracción disponible en ese eje.'
              },
              {
                id: 'q1-2',
                type: 'true-false',
                prompt: '¿El subviraje (understeer) ocurre cuando el eje trasero pierde adherencia antes que el delantero?',
                isTrue: false,
                explanation: 'El subviraje ocurre cuando el eje delantero pierde adherencia y el auto no gira tanto como indica el volante.'
              }
            ]
          },
          {
            id: 'lesson-1-2',
            title: 'La Línea de Carrera (Apex)',
            questions: [
              {
                id: 'q12-1',
                type: 'multiple-choice',
                prompt: '¿Cuál es el beneficio de un "Apex Tardío" (Late Apex) en una curva que precede a una recta larga?',
                options: [
                  { id: 'o1', text: 'Permite enderezar el auto antes y acelerar más temprano', isCorrect: true },
                  { id: 'o2', text: 'Maximiza la velocidad de entrada a la curva', isCorrect: false },
                  { id: 'o3', text: 'Reduce el desgaste de los frenos cerámicos', isCorrect: false },
                  { id: 'o4', text: 'Aumenta la fuerza G lateral en el centro de la curva', isCorrect: false },
                ],
                explanation: 'Un apex tardío sacrifica velocidad de entrada para obtener una salida más recta y veloz.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'licencia-a',
    title: 'LICENCIA A: INGENIERÍA DE PERFORMANCE',
    description: 'Sistemas de propulsión avanzada, telemetría y aerodinámica activa.',
    units: [
      {
        id: 'unit-2',
        title: 'Aerodinámica y Fluidos',
        description: 'Downforce, Drag y el efecto Venturi',
        color: 'bg-duo-blue',
        lessons: [
          {
            id: 'lesson-2-1',
            title: 'Sistemas DRS',
            questions: [
              {
                id: 'q21-1',
                type: 'multiple-choice',
                prompt: '¿Cómo reduce el DRS (Drag Reduction System) la resistencia al avance?',
                options: [
                  { id: 'o1', text: 'Abriendo un flap en el alerón para reducir el ángulo de ataque', isCorrect: true },
                  { id: 'o2', text: 'Cerrando las tomas de aire laterales', isCorrect: false },
                  { id: 'o3', text: 'Aumentando la altura de la suspensión trasera', isCorrect: false },
                  { id: 'o4', text: 'Inyectando aire comprimido en el difusor', isCorrect: false },
                ],
                explanation: 'Al reducir el ángulo del alerón, se disminuye la resistencia (drag) a cambio de perder carga aerodinámica.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-3',
        title: 'Gestión de Motor Avanzada',
        description: 'Mapas de inyección y sobrealimentación inteligente',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-3-1',
            title: 'Eficiencia Volumétrica (VE)',
            questions: [
              {
                id: 'q31-1',
                type: 'multiple-choice',
                prompt: '¿Qué mide la Eficiencia Volumétrica en un motor de combustión?',
                options: [
                  { id: 'o1', text: 'La masa de aire que entra comparada con la capacidad teórica', isCorrect: true },
                  { id: 'o2', text: 'La relación entre el diámetro y la carrera del pistón', isCorrect: false },
                  { id: 'o3', text: 'La velocidad de la chispa en la cámara de combustión', isCorrect: false },
                  { id: 'o4', text: 'El consumo de combustible por cada HP generado', isCorrect: false },
                ],
                explanation: 'La VE indica qué tan bien "respira" el motor. Un motor atmosférico rara vez supera el 100%, mientras que uno turbo lo hace fácilmente.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'licencia-s',
    title: 'LICENCIA S: ALTA COMPETICIÓN Y EV',
    description: 'Torque vectoring, gestión de energía y límites de adherencia mecánica.',
    units: [
      {
        id: 'unit-4',
        title: 'Propulsión Eléctrica de Alto Giro',
        description: 'Inversores de carburo de silicio y motores de flujo axial',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-4-1',
            title: 'Torque Vectoring Dinámico',
            questions: [
              {
                id: 'q41-1',
                type: 'multiple-choice',
                prompt: '¿Cómo ayuda el Torque Vectoring a eliminar el subviraje en un EV con motores independientes?',
                options: [
                  { id: 'o1', text: 'Enviando más torque a la rueda exterior trasera para crear un momento de rotación', isCorrect: true },
                  { id: 'o2', text: 'Reduciendo el voltaje total del sistema de baterías', isCorrect: false },
                  { id: 'o3', text: 'Bloqueando el diferencial mecánico central', isCorrect: false },
                  { id: 'o4', text: 'Aumentando la recuperación de energía en las ruedas delanteras', isCorrect: false },
                ],
                explanation: 'Al dar más potencia a la rueda exterior, se fuerza al vehículo a rotar hacia el interior de la curva.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-5',
        title: 'Telemetría y Análisis de Datos',
        description: 'Interpretación de logs y comportamiento dinámico',
        color: 'bg-duo-red',
        lessons: [
          {
            id: 'lesson-5-1',
            title: 'Análisis de G-G Diagram',
            questions: [
              {
                id: 'q51-1',
                type: 'multiple-choice',
                prompt: 'En un diagrama G-G, ¿qué indica un círculo perfecto?',
                options: [
                  { id: 'o1', text: 'Que el piloto está utilizando el 100% de la adherencia disponible en toda dirección', isCorrect: true },
                  { id: 'o2', text: 'Que el auto tiene un reparto de pesos de 50/50', isCorrect: false },
                  { id: 'o3', text: 'Que los neumáticos están sobrecalentados', isCorrect: false },
                  { id: 'o4', text: 'Que el sistema de control de tracción está desactivado', isCorrect: false },
                ],
                explanation: 'El "Círculo de Adherencia" muestra el límite de fricción combinado (longitudinal y lateral) del neumático.'
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

export const getLessonStatus = (lessonId: string, completedLessons: string[]) => {
  const allLessons = getAllLessons();
  const lessonIndex = allLessons.findIndex(l => l.id === lessonId);

  if (lessonIndex <= 0) return { isLocked: false, isCompleted: completedLessons.includes(lessonId) };

  const prevLesson = allLessons[lessonIndex - 1];
  const isLocked = !completedLessons.includes(prevLesson.id);
  const isCompleted = completedLessons.includes(lessonId);

  return { isLocked, isCompleted };
};

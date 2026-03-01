import type { Section, Lesson } from '../types';

export const SECTIONS: Section[] = [
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

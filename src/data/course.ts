import type { Section, Lesson } from '../types';

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
                id: 'q1-1-img',
                type: 'image-selection',
                prompt: 'Selecciona el "Capó"',
                options: [
                  { id: 'o1-1', text: 'Capó', isCorrect: true },
                  { id: 'o1-2', text: 'Maletero', isCorrect: false },
                  { id: 'o1-3', text: 'Puerta', isCorrect: false },
                  { id: 'o1-4', text: 'Rueda', isCorrect: false },
                ],
                explanation: 'El capó es la cubierta que protege el motor.'
              },
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
                id: 'q1-match',
                type: 'matching',
                prompt: 'Une las partes con su ubicación',
                pairs: [
                  { id: 'p1', left: 'Capó', right: 'Frente' },
                  { id: 'p2', left: 'Maletero', right: 'Atrás' },
                  { id: 'p3', left: 'Volante', right: 'Interior' },
                  { id: 'p4', left: 'Neumático', right: 'Suelo' },
                ]
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
                id: 'q10-match',
                type: 'matching',
                prompt: 'Combina el control con su función',
                pairs: [
                  { id: 'pm1', left: 'Volante', right: 'Dirección' },
                  { id: 'pm2', left: 'Pedal Derecho', right: 'Aceleración' },
                  { id: 'pm3', left: 'Pedal Central', right: 'Frenado' },
                  { id: 'pm4', left: 'Palanca', right: 'Marchas' },
                ]
              },
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
                id: 'q10-img',
                type: 'image-selection',
                prompt: '¿Cuál indica las RPM del motor?',
                options: [
                  { id: 'o1021-i', text: 'Tacómetro', isCorrect: true },
                  { id: 'o1022-i', text: 'Velocímetro', isCorrect: false },
                  { id: 'o1023-i', text: 'Odómetro', isCorrect: false },
                  { id: 'o1024-i', text: 'Manómetro', isCorrect: false },
                ],
                explanation: 'El tacómetro mide las revoluciones por minuto (RPM) del motor.'
              }
            ]
          },
          {
            id: 'lesson-1-3',
            title: 'Iluminación Básica',
            questions: [
              {
                id: 'q10-3-tf',
                type: 'true-false',
                prompt: '¿Es obligatorio usar las luces intermitentes para cambiar de carril?',
                isTrue: true,
                explanation: 'Las luces intermitentes son obligatorias para comunicar tus maniobras y mejorar la seguridad.'
              },
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
          },
          {
            id: 'lesson-1-4',
            title: 'Ruedas y Neumáticos',
            questions: [
              {
                id: 'q14',
                type: 'multiple-choice',
                prompt: '¿Qué parte del auto es la única que toca el suelo?',
                options: [
                  { id: 'o141', text: 'Neumáticos', isCorrect: true },
                  { id: 'o142', text: 'Llantas', isCorrect: false },
                  { id: 'o143', text: 'Suspensión', isCorrect: false },
                  { id: 'o144', text: 'Chasis', isCorrect: false },
                ],
                explanation: 'Los neumáticos proporcionan tracción y amortiguación sobre la carretera.'
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
          },
          {
            id: 'lesson-2-3',
            title: 'Mandos del Volante',
            questions: [
              {
                id: 'q23',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el dispositivo para alertar a otros conductores?',
                options: [
                  { id: 'o231', text: 'Claxon / Bocina', isCorrect: true },
                  { id: 'o232', text: 'Radio', isCorrect: false },
                  { id: 'o233', text: 'Palanca de cambios', isCorrect: false },
                  { id: 'o234', text: 'Freno', isCorrect: false },
                ],
                explanation: 'La bocina se encuentra usualmente en el centro del volante.'
              }
            ]
          },
          {
            id: 'lesson-2-4',
            title: 'Pedales y Marchas',
            questions: [
              {
                id: 'q24',
                type: 'multiple-choice',
                prompt: '¿Qué pedal está siempre a la derecha?',
                options: [
                  { id: 'o241', text: 'Acelerador', isCorrect: true },
                  { id: 'o242', text: 'Freno', isCorrect: false },
                  { id: 'o243', text: 'Embrague', isCorrect: false },
                  { id: 'o244', text: 'Reposapiés', isCorrect: false },
                ],
                explanation: 'El acelerador es el pedal que controla la entrada de combustible y aire al motor.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-3',
        title: 'Marcas y Logos',
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
          },
          {
            id: 'lesson-3-3',
            title: 'Marcas Americanas',
            questions: [
              {
                id: 'q33',
                type: 'multiple-choice',
                prompt: '¿Qué marca fue la primera en usar la línea de montaje en serie?',
                options: [
                  { id: 'o331', text: 'Ford', isCorrect: true },
                  { id: 'o332', text: 'Chevrolet', isCorrect: false },
                  { id: 'o333', text: 'Tesla', isCorrect: false },
                  { id: 'o334', text: 'Jeep', isCorrect: false },
                ],
                explanation: 'Henry Ford revolucionó la industria con el Modelo T y la producción en cadena.'
              }
            ]
          },
          {
            id: 'lesson-3-4',
            title: 'Marcas Asiáticas',
            questions: [
              {
                id: 'q34',
                type: 'multiple-choice',
                prompt: '¿Cuál de estas marcas es japonesa?',
                options: [
                  { id: 'o341', text: 'Toyota', isCorrect: true },
                  { id: 'o342', text: 'Hyundai', isCorrect: false },
                  { id: 'o343', text: 'Kia', isCorrect: false },
                  { id: 'o344', text: 'BYD', isCorrect: false },
                ],
                explanation: 'Toyota es uno de los mayores fabricantes del mundo y tiene su sede en Japón.'
              }
            ]
          },
          {
            id: 'lesson-3-5',
            title: 'Logos con Historia',
            questions: [
              {
                id: 'q35',
                type: 'multiple-choice',
                prompt: '¿Qué representan los colores azul y blanco en el logo de BMW?',
                options: [
                  { id: 'o351', text: 'Una hélice de avión', isCorrect: false },
                  { id: 'o352', text: 'La bandera de Baviera', isCorrect: true },
                  { id: 'o353', text: 'El cielo y las nubes', isCorrect: false },
                  { id: 'o354', text: 'La velocidad y pureza', isCorrect: false },
                ],
                explanation: 'Aunque se cree que es una hélice, los colores representan al estado de Baviera, Alemania.'
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
          },
          {
            id: 'lesson-4-2',
            title: 'SUV y Todoterrenos',
            questions: [
              {
                id: 'q42',
                type: 'multiple-choice',
                prompt: '¿Qué significa SUV?',
                options: [
                  { id: 'o421', text: 'Vehículo Utilitario Deportivo', isCorrect: true },
                  { id: 'o422', text: 'Sistema Urbano Veloz', isCorrect: false },
                  { id: 'o423', text: 'Super Unidad de Vapor', isCorrect: false },
                  { id: 'o424', text: 'Solo Usar en Vía', isCorrect: false },
                ],
                explanation: 'SUV son las siglas de Sport Utility Vehicle.'
              }
            ]
          },
          {
            id: 'lesson-4-3',
            title: 'Autos Deportivos',
            questions: [
              {
                id: 'q43',
                type: 'multiple-choice',
                prompt: '¿Cómo se llaman los autos con techo que se puede abrir o quitar?',
                options: [
                  { id: 'o431', text: 'Descapotables / Convertibles', isCorrect: true },
                  { id: 'o432', text: 'Coupes', isCorrect: false },
                  { id: 'o433', text: 'Station Wagon', isCorrect: false },
                  { id: 'o434', text: 'Monovolumen', isCorrect: false },
                ],
                explanation: 'Los descapotables permiten conducir al aire libre.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-5',
        title: 'Seguridad Básica',
        description: 'Aprende a protegerte a ti y a los demás',
        color: 'bg-duo-red',
        lessons: [
          {
            id: 'lesson-5-1',
            title: 'Cinturón y Airbags',
            questions: [
              {
                id: 'q51',
                type: 'multiple-choice',
                prompt: '¿Cuál es el elemento de seguridad más importante en un auto?',
                options: [
                  { id: 'o511', text: 'Cinturón de seguridad', isCorrect: true },
                  { id: 'o512', text: 'Airbag', isCorrect: false },
                  { id: 'o513', text: 'ABS', isCorrect: false },
                  { id: 'o514', text: 'Sensor de aparcamiento', isCorrect: false },
                ],
                explanation: 'El cinturón de seguridad es la principal defensa en caso de colisión.'
              }
            ]
          },
          {
            id: 'lesson-5-2',
            title: 'Espejos y Visibilidad',
            questions: [
              {
                id: 'q52',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama la zona que no se puede ver por los espejos?',
                options: [
                  { id: 'o521', text: 'Punto ciego', isCorrect: true },
                  { id: 'o522', text: 'Área oscura', isCorrect: false },
                  { id: 'o523', text: 'Zona de riesgo', isCorrect: false },
                  { id: 'o524', text: 'Cuadro muerto', isCorrect: false },
                ],
                explanation: 'El punto ciego es el área alrededor del vehículo que no es visible directamente.'
              }
            ]
          },
          {
            id: 'lesson-5-3',
            title: 'Visión Nocturna',
            questions: [
              {
                id: 'q53',
                type: 'multiple-choice',
                prompt: '¿Qué posición del espejo retrovisor evita el deslumbramiento nocturno?',
                options: [
                  { id: 'o531', text: 'Modo día', isCorrect: false },
                  { id: 'o532', text: 'Modo noche / Anti-reflejo', isCorrect: true },
                  { id: 'o533', text: 'Modo parking', isCorrect: false },
                  { id: 'o534', text: 'Modo cerrado', isCorrect: false },
                ],
                explanation: 'La palanca inferior del espejo retrovisor desvía la luz intensa de los autos que vienen detrás.'
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
        id: 'unit-6',
        title: 'El Corazón del Auto',
        description: 'Cómo funciona el motor y sus componentes principales',
        color: 'bg-duo-green',
        lessons: [
          {
            id: 'lesson-6-1',
            title: 'El Ciclo del Motor',
            questions: [
              {
                id: 'q611',
                type: 'multiple-choice',
                prompt: '¿Cuántos "tiempos" tiene el ciclo de combustión más común?',
                options: [
                  { id: 'o6111', text: '4 tiempos', isCorrect: true },
                  { id: 'o6112', text: '2 tiempos', isCorrect: false },
                  { id: 'o6113', text: '6 tiempos', isCorrect: false },
                  { id: 'o6114', text: '8 tiempos', isCorrect: false },
                ],
                explanation: 'El ciclo de Otto (Admisión, Compresión, Explosión y Escape) es el estándar en la industria.'
              },
              {
                id: 'q612',
                type: 'multiple-choice',
                prompt: '¿En qué tiempo se genera la chispa de la bujía?',
                options: [
                  { id: 'o6121', text: 'Admisión', isCorrect: false },
                  { id: 'o6122', text: 'Compresión / Explosión', isCorrect: true },
                  { id: 'o6123', text: 'Escape', isCorrect: false },
                  { id: 'o6124', text: 'Reposo', isCorrect: false },
                ],
                explanation: 'Justo antes de que el pistón llegue arriba en la compresión, la chispa inicia la explosión.'
              },
              {
                id: 'q613',
                type: 'multiple-choice',
                prompt: '¿Qué sucede durante el tiempo de "Admisión"?',
                options: [
                  { id: 'o6131', text: 'Entra aire y combustible', isCorrect: true },
                  { id: 'o6132', text: 'Salen los humos', isCorrect: false },
                  { id: 'o6133', text: 'El auto frena', isCorrect: false },
                  { id: 'o6134', text: 'Se carga la batería', isCorrect: false },
                ],
                explanation: 'El motor aspira la mezcla necesaria para la combustión.'
              }
            ]
          },
          {
            id: 'lesson-6-2',
            title: 'Pistones y Cilindros',
            questions: [
              {
                id: 'q621',
                type: 'multiple-choice',
                prompt: '¿Qué pieza se mueve arriba y abajo dentro del cilindro?',
                options: [
                  { id: 'o6211', text: 'Pistón', isCorrect: true },
                  { id: 'o6212', text: 'Biela', isCorrect: false },
                  { id: 'o6213', text: 'Cigüeñal', isCorrect: false },
                  { id: 'o6214', text: 'Válvula', isCorrect: false },
                ],
                explanation: 'El pistón comprime la mezcla y recibe la fuerza de la explosión.'
              },
              {
                id: 'q622',
                type: 'multiple-choice',
                prompt: '¿Qué pieza une el pistón con el cigüeñal?',
                options: [
                  { id: 'o6221', text: 'Biela', isCorrect: true },
                  { id: 'o6222', text: 'Correa', isCorrect: false },
                  { id: 'o6223', text: 'Eje', isCorrect: false },
                  { id: 'o6224', text: 'Bujía', isCorrect: false },
                ],
                explanation: 'La biela transmite el movimiento lineal del pistón al movimiento rotativo del cigüeñal.'
              }
            ]
          },
          {
            id: 'lesson-6-4',
            title: 'Válvulas y Respiración',
            questions: [
              {
                id: 'q641',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el eje que abre y cierra las válvulas?',
                options: [
                  { id: 'o6411', text: 'Árbol de levas', isCorrect: true },
                  { id: 'o6412', text: 'Cigüeñal', isCorrect: false },
                  { id: 'o6413', text: 'Cardán', isCorrect: false },
                  { id: 'o6414', text: 'Semieje', isCorrect: false },
                ],
                explanation: 'El árbol de levas está sincronizado con el cigüeñal para que el motor "respire" a tiempo.'
              }
            ]
          },
          {
            id: 'lesson-6-3',
            title: 'Configuraciones de Motor',
            questions: [
              {
                id: 'q631',
                type: 'multiple-choice',
                prompt: '¿Qué configuración de motor es famosa en los Porsche 911 y Subaru?',
                options: [
                  { id: 'o6311', text: 'Motor en V', isCorrect: false },
                  { id: 'o6312', text: 'Motor Bóxer (Plano)', isCorrect: true },
                  { id: 'o6313', text: 'Motor en Línea', isCorrect: false },
                  { id: 'o6314', text: 'Motor Rotativo', isCorrect: false },
                ],
                explanation: 'El motor Bóxer tiene cilindros opuestos horizontalmente, bajando el centro de gravedad.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-7',
        title: 'Líquidos Vitales',
        description: 'Aceite, refrigerante y frenos',
        color: 'bg-duo-blue',
        lessons: [
          {
            id: 'lesson-7-1',
            title: 'Lubricación',
            questions: [
              {
                id: 'q711',
                type: 'multiple-choice',
                prompt: '¿Cuál es la función principal del aceite del motor?',
                options: [
                  { id: 'o7111', text: 'Reducir la fricción', isCorrect: true },
                  { id: 'o7112', text: 'Dar más potencia', isCorrect: false },
                  { id: 'o7113', text: 'Limpiar los inyectores', isCorrect: false },
                  { id: 'o7114', text: 'Enfriar el aire', isCorrect: false },
                ],
                explanation: 'El aceite crea una película protectora entre las piezas móviles del motor.'
              },
              {
                id: 'q711-sb',
                type: 'sentence-builder',
                prompt: 'Ordena los pasos para revisar el nivel de aceite:',
                sentence: ['Limpiar varilla', 'Sacar varilla', 'Insertar varilla', 'Ver nivel'],
                correctOrder: ['Sacar varilla', 'Limpiar varilla', 'Insertar varilla', 'Ver nivel'],
                explanation: 'Para una lectura precisa, primero debes limpiar la varilla y volverla a insertar.'
              }
            ]
          },
          {
            id: 'lesson-7-2',
            title: 'Sistema de Enfriamiento',
            questions: [
              {
                id: 'q721',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el componente que enfría el líquido del motor?',
                options: [
                  { id: 'o7211', text: 'Radiador', isCorrect: true },
                  { id: 'o7212', text: 'Alternador', isCorrect: false },
                  { id: 'o7213', text: 'Condensador', isCorrect: false },
                  { id: 'o7214', text: 'Carburador', isCorrect: false },
                ],
                explanation: 'El radiador usa el aire exterior para bajar la temperatura del líquido refrigerante.'
              }
            ]
          },
          {
            id: 'lesson-7-3',
            title: 'Mantenimiento Preventivo',
            questions: [
              {
                id: 'q731',
                type: 'multiple-choice',
                prompt: '¿Cada cuánto tiempo se recomienda generalmente cambiar el aceite sintético?',
                options: [
                  { id: 'o7311', text: 'Cada 1,000 km', isCorrect: false },
                  { id: 'o7312', text: 'Entre 10,000 y 15,000 km', isCorrect: true },
                  { id: 'o7313', text: 'Cada 50,000 km', isCorrect: false },
                  { id: 'o7314', text: 'Nunca se cambia', isCorrect: false },
                ],
                explanation: 'Un mantenimiento regular es la clave para que un motor dure cientos de miles de kilómetros.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-8',
        title: 'Transmisión y Fuerza',
        description: 'Llevando la potencia a las ruedas',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-8-1',
            title: 'Caja de Cambios',
            questions: [
              {
                id: 'q811',
                type: 'multiple-choice',
                prompt: '¿Qué componente permite desconectar el motor de la caja en autos manuales?',
                options: [
                  { id: 'o8111', text: 'Embrague / Clutch', isCorrect: true },
                  { id: 'o8112', text: 'Convertidor de par', isCorrect: false },
                  { id: 'o8113', text: 'Sincronizador', isCorrect: false },
                  { id: 'o8114', text: 'Diferencial', isCorrect: false },
                ],
                explanation: 'El embrague es fundamental para realizar cambios de marcha sin dañar los engranajes.'
              }
            ]
          },
          {
            id: 'lesson-8-2',
            title: 'Tracción',
            questions: [
              {
                id: 'q821',
                type: 'multiple-choice',
                prompt: '¿Qué significa AWD?',
                options: [
                  { id: 'o8211', text: 'Tracción en las 4 ruedas', isCorrect: true },
                  { id: 'o8212', text: 'Tracción Delantera', isCorrect: false },
                  { id: 'o8213', text: 'Tracción Trasera', isCorrect: false },
                  { id: 'o8214', text: 'Tracción Asistida', isCorrect: false },
                ],
                explanation: 'All Wheel Drive distribuye la potencia a todas las ruedas según sea necesario.'
              }
            ]
          },
          {
            id: 'lesson-8-3',
            title: 'El Diferencial',
            questions: [
              {
                id: 'q831',
                type: 'multiple-choice',
                prompt: '¿Qué componente permite que las ruedas de un mismo eje giren a diferentes velocidades en una curva?',
                options: [
                  { id: 'o8311', text: 'Diferencial', isCorrect: true },
                  { id: 'o8312', text: 'Caja de cambios', isCorrect: false },
                  { id: 'o8313', text: 'Semieje', isCorrect: false },
                  { id: 'o8314', text: 'Volante motor', isCorrect: false },
                ],
                explanation: 'Sin el diferencial, las ruedas chirriarían y el auto sería muy difícil de controlar al girar.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-9',
        title: 'Frenos y Suspensión',
        description: 'Control y confort en la marcha',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-9-1',
            title: 'Sistema de Frenado',
            questions: [
              {
                id: 'q911',
                type: 'multiple-choice',
                prompt: '¿Qué pieza presiona el disco de freno para detener el auto?',
                options: [
                  { id: 'o9111', text: 'Pastillas de freno', isCorrect: true },
                  { id: 'o9112', text: 'Tambores', isCorrect: false },
                  { id: 'o9113', text: 'Amortiguadores', isCorrect: false },
                  { id: 'o9114', text: 'Bujías', isCorrect: false },
                ],
                explanation: 'Las pastillas generan la fricción necesaria contra el disco para detener el giro.'
              }
            ]
          },
          {
            id: 'lesson-9-2',
            title: 'Amortiguación',
            questions: [
              {
                id: 'q921',
                type: 'multiple-choice',
                prompt: '¿Cuál es la función principal de la suspensión?',
                options: [
                  { id: 'o9211', text: 'Absorber irregularidades del terreno', isCorrect: true },
                  { id: 'o9212', text: 'Enfriar el motor', isCorrect: false },
                  { id: 'o9213', text: 'Cambiar de dirección', isCorrect: false },
                  { id: 'o9214', text: 'Acelerar más rápido', isCorrect: false },
                ],
                explanation: 'La suspensión mantiene las ruedas pegadas al suelo y brinda confort a los pasajeros.'
              }
            ]
          },
          {
            id: 'lesson-9-3',
            title: 'Geometría y Estabilidad',
            questions: [
              {
                id: 'q931',
                type: 'multiple-choice',
                prompt: '¿Qué pieza del sistema de dirección permite que el auto mantenga su trayectoria recta?',
                options: [
                  { id: 'o9311', text: 'Alineación (Camber/Toe)', isCorrect: true },
                  { id: 'o9312', text: 'Frenos ABS', isCorrect: false },
                  { id: 'o9313', text: 'Caja de cambios', isCorrect: false },
                  { id: 'o9314', text: 'Radiador', isCorrect: false },
                ],
                explanation: 'Una correcta alineación evita el desgaste irregular de neumáticos y mejora la seguridad.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-10',
        title: 'Sistema Eléctrico',
        description: 'La energía que mueve los sistemas auxiliares',
        color: 'bg-duo-yellow',
        lessons: [
          {
            id: 'lesson-10-1',
            title: 'La Batería',
            questions: [
              {
                id: 'q1011',
                type: 'multiple-choice',
                prompt: '¿Qué componente carga la batería mientras el motor está encendido?',
                options: [
                  { id: 'o10111', text: 'Alternador', isCorrect: true },
                  { id: 'o10112', text: 'Motor de arranque', isCorrect: false },
                  { id: 'o10113', text: 'Bujía', isCorrect: false },
                  { id: 'o10114', text: 'Bobina', isCorrect: false },
                ],
                explanation: 'El alternador convierte la energía mecánica del motor en energía eléctrica.'
              }
            ]
          },
          {
            id: 'lesson-10-2',
            title: 'Encendido',
            questions: [
              {
                id: 'q1021',
                type: 'multiple-choice',
                prompt: '¿Qué pieza genera la chispa inicial en motores de gasolina?',
                options: [
                  { id: 'o10211', text: 'Bujía', isCorrect: true },
                  { id: 'o10212', text: 'Inyector', isCorrect: false },
                  { id: 'o10213', text: 'Fusible', isCorrect: false },
                  { id: 'o10214', text: 'Cables de alta', isCorrect: false },
                ],
                explanation: 'La bujía crea el arco eléctrico que detona la mezcla de aire y combustible.'
              }
            ]
          },
          {
            id: 'lesson-10-3',
            title: 'Sensores y Computadora',
            questions: [
              {
                id: 'q1031',
                type: 'multiple-choice',
                prompt: '¿Cómo se llama el puerto estándar para diagnosticar fallas en autos modernos?',
                options: [
                  { id: 'o10311', text: 'Puerto OBD-II', isCorrect: true },
                  { id: 'o10312', text: 'Puerto USB-C', isCorrect: false },
                  { id: 'o10313', text: 'HDMI', isCorrect: false },
                  { id: 'o10314', text: 'VGA', isCorrect: false },
                ],
                explanation: 'El puerto OBD-II permite a los mecánicos leer códigos de falla directamente de la computadora del auto.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'section-3',
    title: 'Sección 3: Entusiasta',
    description: 'Cultura, performance y leyendas',
    units: [
      {
        id: 'unit-11',
        title: 'Leyendas del Asfalto',
        description: 'Conoce los autos que definieron la historia',
        color: 'bg-duo-green',
        lessons: [
          {
            id: 'lesson-11-1',
            title: 'BMW M: La Letra más Poderosa',
            questions: [
              {
                id: 'q1111',
                type: 'multiple-choice',
                prompt: '¿Cuál fue el primer auto de calle desarrollado completamente por BMW M?',
                options: [
                  { id: 'o11111', text: 'BMW M1', isCorrect: true },
                  { id: 'o11112', text: 'BMW M3 E30', isCorrect: false },
                  { id: 'o11113', text: 'BMW M5 E28', isCorrect: false },
                  { id: 'o11114', text: 'BMW 2002 Turbo', isCorrect: false },
                ],
                explanation: 'El M1 es un superdeportivo con motor central que lanzó la leyenda de la división M.'
              }
            ]
          },
          {
            id: 'lesson-11-2',
            title: 'Porsche 911: Evolución Pura',
            questions: [
              {
                id: 'q1121',
                type: 'multiple-choice',
                prompt: '¿Dónde se ubica el motor en un Porsche 911?',
                options: [
                  { id: 'o11211', text: 'Delantero', isCorrect: false },
                  { id: 'o11212', text: 'Central', isCorrect: false },
                  { id: 'o11213', text: 'Trasero (detrás del eje)', isCorrect: true },
                  { id: 'o11214', text: 'En el maletero delantero', isCorrect: false },
                ],
                explanation: 'La disposición del motor trasero es la firma característica que define al 911 desde 1963.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-12',
        title: 'Performance y Potencia',
        description: 'Turbo, Nitro y Aerodinámica',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-12-1',
            title: 'Sobrealimentación',
            questions: [
              {
                id: 'q1211',
                type: 'multiple-choice',
                prompt: '¿Qué utiliza un turbocompresor para generar más potencia?',
                options: [
                  { id: 'o12111', text: 'Gases de escape', isCorrect: true },
                  { id: 'o12112', text: 'Una correa conectada al motor', isCorrect: false },
                  { id: 'o12113', text: 'Electricidad de la batería', isCorrect: false },
                  { id: 'o12114', text: 'Inyección de agua', isCorrect: false },
                ],
                explanation: 'El turbo aprovecha la energía de los gases de escape para comprimir el aire de admisión.'
              }
            ]
          },
          {
            id: 'lesson-12-2',
            title: 'Aerodinámica',
            questions: [
              {
                id: 'q1221',
                type: 'multiple-choice',
                prompt: '¿Cuál es la función principal de un alerón trasero en un auto deportivo?',
                options: [
                  { id: 'o12211', text: 'Hacer que el auto sea más ligero', isCorrect: false },
                  { id: 'o12212', text: 'Generar carga aerodinámica (Downforce)', isCorrect: true },
                  { id: 'o12213', text: 'Enfriar el motor', isCorrect: false },
                  { id: 'o12214', text: 'Reducir el consumo de combustible', isCorrect: false },
                ],
                explanation: 'El alerón empuja el auto contra el suelo para mejorar la tracción a altas velocidades.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-13',
        title: 'Cultura Automotriz',
        description: 'JDM, Muscle Cars y más',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-13-1',
            title: 'JDM: El Sol Naciente',
            questions: [
              {
                id: 'q1311',
                type: 'multiple-choice',
                prompt: '¿Qué significan las siglas JDM?',
                options: [
                  { id: 'o13111', text: 'Japanese Domestic Market', isCorrect: true },
                  { id: 'o13112', text: 'Just Drift More', isCorrect: false },
                  { id: 'o13113', text: 'Joint Design Motor', isCorrect: false },
                  { id: 'o13114', text: 'Junior Dragster Modified', isCorrect: false },
                ],
                explanation: 'Se refiere a vehículos fabricados específicamente para el mercado interno japonés.'
              }
            ]
          },
          {
            id: 'lesson-13-2',
            title: 'Muscle Cars Americanos',
            questions: [
              {
                id: 'q1321',
                type: 'multiple-choice',
                prompt: '¿Cuál de estos es considerado el primer "Muscle Car" de la historia?',
                options: [
                  { id: 'o13211', text: 'Ford Mustang', isCorrect: false },
                  { id: 'o13212', text: 'Pontiac GTO', isCorrect: true },
                  { id: 'o13213', text: 'Dodge Challenger', isCorrect: false },
                  { id: 'o13214', text: 'Chevrolet Camaro', isCorrect: false },
                ],
                explanation: 'Aunque el Mustang es más famoso, el GTO de 1964 definió la fórmula del Muscle Car.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-14',
        title: 'Superdeportivos Modernos',
        description: 'La cima de la ingeniería actual',
        color: 'bg-duo-green',
        lessons: [
          {
            id: 'lesson-14-1',
            title: 'La Trilogía Sagrada',
            questions: [
              {
                id: 'q1411',
                type: 'multiple-choice',
                prompt: '¿Cuál de estos NO forma parte de la "Trilogía Sagrada" de 2013?',
                options: [
                  { id: 'o14111', text: 'Bugatti Veyron', isCorrect: true },
                  { id: 'o14112', text: 'Ferrari LaFerrari', isCorrect: false },
                  { id: 'o14113', text: 'McLaren P1', isCorrect: false },
                  { id: 'o14114', text: 'Porsche 918 Spyder', isCorrect: false },
                ],
                explanation: 'La trilogía se refiere a los tres hiperdeportivos híbridos que revolucionaron la industria en 2013.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'section-4',
    title: 'Sección 4: Avanzado',
    description: 'Tuning, Geometría y Competición',
    units: [
      {
        id: 'unit-15',
        title: 'Geometría de Suspensión',
        description: 'Camber, Toe y Caster',
        color: 'bg-duo-blue',
        lessons: [
          {
            id: 'lesson-15-1',
            title: 'Camber (Caída)',
            questions: [
              {
                id: 'q1511',
                type: 'multiple-choice',
                prompt: '¿Qué es el "Camber Negativo"?',
                options: [
                  { id: 'o15111', text: 'La parte superior de la rueda se inclina hacia adentro', isCorrect: true },
                  { id: 'o15112', text: 'La parte delantera de las ruedas se cierra', isCorrect: false },
                  { id: 'o15113', text: 'El auto está demasiado bajo', isCorrect: false },
                  { id: 'o15114', text: 'Las ruedas están desalineadas', isCorrect: false },
                ],
                explanation: 'El camber negativo mejora el apoyo de la rueda exterior en curvas de alta velocidad.'
              }
            ]
          }
        ]
      },
      {
        id: 'unit-16',
        title: 'Tuning de Motor',
        description: 'Reprogramaciones y Mezcla',
        color: 'bg-duo-orange',
        lessons: [
          {
            id: 'lesson-16-1',
            title: 'La ECU',
            questions: [
              {
                id: 'q1611',
                type: 'multiple-choice',
                prompt: '¿Qué significa "Reprogramación Stage 1"?',
                options: [
                  { id: 'o16111', text: 'Optimización de software sin cambiar piezas', isCorrect: true },
                  { id: 'o16112', text: 'Cambiar el turbo por uno más grande', isCorrect: false },
                  { id: 'o16113', text: 'Cambiar los pistones', isCorrect: false },
                  { id: 'o16114', text: 'Pintar el motor de rojo', isCorrect: false },
                ],
                explanation: 'La Stage 1 ajusta parámetros como presión de turbo e inyección mediante software.'
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'section-5',
    title: 'Sección 5: Experto',
    description: 'Diagnóstico Forense y Motores Exóticos',
    units: [
      {
        id: 'unit-17',
        title: 'Motores Poco Comunes',
        description: 'Wankel, W16 y Camless',
        color: 'bg-duo-purple',
        lessons: [
          {
            id: 'lesson-17-1',
            title: 'El Motor Rotativo Wankel',
            questions: [
              {
                id: 'q1711',
                type: 'multiple-choice',
                prompt: '¿Qué marca es famosa por perfeccionar el motor rotativo en el RX-7?',
                options: [
                  { id: 'o17111', text: 'Mazda', isCorrect: true },
                  { id: 'o17112', text: 'Toyota', isCorrect: false },
                  { id: 'o17113', text: 'Nissan', isCorrect: false },
                  { id: 'o17114', text: 'Honda', isCorrect: false },
                ],
                explanation: 'Mazda utilizó rotores triangulares en lugar de pistones para generar potencia.'
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

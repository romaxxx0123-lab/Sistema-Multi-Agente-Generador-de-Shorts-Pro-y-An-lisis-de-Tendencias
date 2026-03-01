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
                id: 'q1-2',
                type: 'multiple-choice',
                prompt: '¿Dónde se guarda normalmente el equipaje?',
                options: [
                  { id: 'o121', text: 'Maletero / Cajuela', isCorrect: true },
                  { id: 'o122', text: 'Guantera', isCorrect: false },
                  { id: 'o123', text: 'Radiador', isCorrect: false },
                  { id: 'o124', text: 'Techo', isCorrect: false },
                ],
                explanation: 'El maletero es el compartimento principal para carga en un vehículo.'
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
          }
        ]
      }
    ]
  }
];

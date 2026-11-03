/**
 * HILO NARRATIVO: «El cuaderno del Albatros».
 *
 * La capitana Elena Duarte zarpó hace treinta años en el Albatros, la primera ciudad flotante,
 * en busca de Puerto Esperanza: un fondeadero legendario donde se reúnen los barcos-hogar.
 * Dejó copias de su cuaderno en botellas y cofres a lo largo de la ruta. Reunir las páginas
 * revela el rumbo a Puerto Esperanza (región final). El juego continúa después del final: el barco
 * cruza el fondeadero (unas 140 millas, cerca de un día) y sigue navegando.
 */

export interface StoryPage {
  /** Número de página (1..7). */
  n: number;
  /** Id del objeto que la representa en el inventario. */
  item: string;
  title: string;
  /** Texto en primera persona de la capitana. Párrafos separados por \n\n. */
  text: string;
  /** Región donde es más probable encontrarla (pista para el director de eventos). */
  region: string;
}

export const STORY_PAGES: StoryPage[] = [
  {
    n: 1,
    item: 'pagina_1',
    region: 'templadas',
    title: 'A quien encuentre esto',
    text:
      'Si estás leyendo esto, vives en un barco que es tu casa, como nosotros. Me llamo Elena Duarte y fui capitana del Albatros, la primera ciudad que se atrevió a no volver nunca a puerto.\n\n' +
      'Buscamos Puerto Esperanza. Dicen que más allá del faro que nadie construyó hay un fondeadero donde los barcos-hogar se amarran unos a otros y el mar ya no da miedo. Voy dejando copias de este cuaderno por la ruta, en botellas y en cofres. Reúnelas y sabrás llegar.',
  },
  {
    n: 2,
    item: 'pagina_2',
    region: 'templadas',
    title: 'Lo que el mar trae',
    text:
      'Los primeros meses aprendimos lo esencial: el mar da lo que necesitas si sabes esperarlo junto a la borda. Tablones, barriles, redes, la vida que otros perdieron.\n\n' +
      'Pusimos una norma que todavía me parece la más importante: nada se tira. Todo lo que sube a bordo sirve para algo, aunque aún no sepamos para qué.',
  },
  {
    n: 3,
    item: 'pagina_3',
    region: 'sargazos',
    title: 'Nadie come solo',
    text:
      'Entre las algas el barco apenas avanza y los días se hacen largos. Fue ahí donde la tripulación dejó de ser tripulación y empezó a ser vecindario.\n\n' +
      'Segunda norma del Albatros: nadie come solo. Una mesa larga arregla más discusiones que cualquier capitana. Si tu gente está triste, mira primero sus platos y sus camas.',
  },
  {
    n: 4,
    item: 'pagina_4',
    region: 'cementerio',
    title: 'Los que lo intentaron antes',
    text:
      'El cementerio de barcos no es un lugar maldito. Son los que intentaron llegar antes que nosotros. En el puente de un carguero hundido encontré una carta náutica con una marca a lápiz, más allá del faro.\n\n' +
      'Sus cascos nos dieron metal para un año. Se lo agradecí en voz alta. Tú haz lo mismo.',
  },
  {
    n: 5,
    item: 'pagina_5',
    region: 'boreal',
    title: 'El frío',
    text:
      'En la Corriente Boreal perdimos a Joaquín. No fue el hambre ni las olas: fue el frío de una noche en cubierta, cuidando un generador que no quería arrancar.\n\n' +
      'Si vas al norte, que nadie duerma fuera y que siempre haya un fogón encendido. Las máquinas se pueden arreglar mañana. La gente, no.',
  },
  {
    n: 6,
    item: 'pagina_6',
    region: 'tormentas',
    title: 'El barco es la gente',
    text:
      'La tormenta duró tres días. Arrancó el colector, partió dos vigas y nos dejó sin luz. Al tercer amanecer seguíamos todos vivos, achicando agua y cantando muy mal.\n\n' +
      'Entonces lo entendí: el barco no son las tablas. El barco es la gente que las vuelve a clavar.',
  },
  {
    n: 7,
    item: 'pagina_7',
    region: 'faro',
    title: 'La luz verde',
    text:
      'El farero existe. Es un viejo que no recuerda cuándo llegó ni quién encendió la luz por primera vez. Nos dio agua, escuchó nuestra historia y señaló al norte.\n\n' +
      '«Cuando el faro quede a popa, buscad la luz verde. No es una estrella: es el puerto.» Mañana zarpamos hacia ella. Si no vuelvo a escribir, es que hemos llegado.',
  },
];

/** Páginas necesarias para conocer el rumbo a Puerto Esperanza. */
export const PAGES_TO_REVEAL = 5;

/** Región final que se desbloquea con el cuaderno. */
export const FINAL_REGION = 'esperanza';

/** Segundo párrafo de la llegada (el mismo a cualquier hora). */
const ARRIVAL_WELCOME =
  'Alguien grita el nombre de tu barco como si lo hubiera estado esperando. En el muelle principal, una placa de madera: «Albatros — llegamos».';

/** Lo que se ve del puerto a pleno día (la luz verde ya se veía desde lejos: aquí asoma todo lo demás). */
const PORT_VIEW =
  'bajo la torre de la luz verde, el horizonte se llena de barcos: decenas de barcos-hogar amarrados unos a otros, pasarelas, huertos colgantes y gente que saluda desde las bordas.';

export const STORY_TEXTS = {
  revealed:
    'Con las páginas del cuaderno de Elena Duarte sabes cómo llegar a Puerto Esperanza: fija en el timón el rumbo de la capitana cuando quieras y el barco pondrá proa hacia allí al salir de estas aguas.',
  arrivalTitle: 'Puerto Esperanza',
  /** Texto de la llegada al amanecer (la más habitual: de noche se espera en la bocana). Ver `arrivalText`. */
  arrival:
    'Al amanecer, la luz verde deja de estar sola: con la claridad aparecen decenas de barcos-hogar amarrados unos a otros, pasarelas, huertos colgantes y gente que saluda desde las bordas.\n\n' +
    ARRIVAL_WELCOME,
  epilogue:
    'Tu ciudad flotante ya no está sola. Mientras crucéis el fondeadero podréis comerciar en el muelle y conocer a otros; después tocará seguir navegando: el mar todavía tiene mucho que traer.',
};

/**
 * Texto de la llegada a Puerto Esperanza según la hora a la que ocurre (párrafos separados por
 * \n\n). La llegada es siempre de día (de 6 a 20 h): al amanecer, a media mañana, a mediodía, por
 * la tarde o al caer la tarde, cuando se encienden las luces del puerto.
 */
export function arrivalText(hour: number): string {
  let first: string;
  if (hour < 9) return STORY_TEXTS.arrival;
  if (hour < 12) first = `A media mañana, ${PORT_VIEW}`;
  else if (hour < 15) first = `Con el sol en lo alto, ${PORT_VIEW}`;
  else if (hour < 18) first = `Por la tarde, ${PORT_VIEW}`;
  else
    first =
      'Al caer la tarde, bajo la torre de la luz verde se encienden decenas de luces más: barcos-hogar amarrados unos a otros, pasarelas, huertos colgantes y gente que saluda desde las bordas.';
  return `${first}\n\n${ARRIVAL_WELCOME}`;
}

export function pageByItem(item: string): StoryPage | undefined {
  return STORY_PAGES.find((p) => p.item === item);
}

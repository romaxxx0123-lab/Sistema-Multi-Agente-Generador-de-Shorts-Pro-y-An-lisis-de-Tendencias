
export type POIType = 'home' | 'work' | 'cafe' | 'park' | 'gym' | 'theater';

export interface POI {
  id: string;
  type: POIType;
  position: [number, number, number];
  name: string;
}

export const POIS: POI[] = [
  { id: 'h1', type: 'home', position: [-15, 0, -15], name: 'Apartamentos Norte' },
  { id: 'h2', type: 'home', position: [15, 0, -15], name: 'Residencial Este' },
  { id: 'w1', type: 'work', position: [-15, 0, 15], name: 'Distrito Financiero' },
  { id: 'w2', type: 'work', position: [15, 0, 15], name: 'Zona Industrial' },
  { id: 'c1', type: 'cafe', position: [0, 0, 0], name: 'Gran Café Central' },
  { id: 'p1', type: 'park', position: [0, 0, 10], name: 'Jardines del Prado' },
  { id: 'g1', type: 'gym', position: [-5, 0, -5], name: 'Gimnasio Iron' },
  { id: 't1', type: 'theater', position: [5, 0, -5], name: 'Teatro Real' },
];

export interface NPCNeeds {
  hunger: number; // 0-100
  energy: number; // 0-100
  social: number; // 0-100
  fitness: number; // 0-100
}

export interface NPCState {
  id: string;
  name: string;
  currentPOI: string;
  targetPOI: string;
  status: 'idle' | 'moving' | 'working' | 'sleeping' | 'eating' | 'socializing' | 'exercising' | 'entertaining';
  activity: string;
  color: string;
  needs: NPCNeeds;
  skinColor: string;
  hairColor: string;
  hairStyle: 'short' | 'long' | 'bald';
}

const NPC_NAMES = ['Carlos', 'Ana', 'Luis', 'Sofía', 'Elena', 'Pedro', 'Marta', 'Javier', 'Lucía', 'Diego', 'Raúl', 'Beatriz', 'Mario', 'Carla', 'Tomás'];
const COLORS = ['#ff4b4b', '#1cb0f6', '#2be335', '#ffc800', '#ce82ff', '#ff84d8', '#ff9f43', '#00d2d3'];
const SKIN_COLORS = ['#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#c68642'];
const HAIR_COLORS = ['#090806', '#2c222b', '#71635a', '#b7a69e', '#d6c4c2', '#cabfb1', '#fff5e1', '#a5673f'];

export const createNPC = (id: string): NPCState => {
  const home = POIS[Math.floor(Math.random() * 2)];
  return {
    id,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)],
    currentPOI: home.id,
    targetPOI: home.id,
    status: 'idle',
    activity: 'Descansando en casa',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
    hairStyle: ['short', 'long', 'bald'][Math.floor(Math.random() * 3)] as 'short' | 'long' | 'bald',
    needs: {
      hunger: 60 + Math.random() * 40,
      energy: 70 + Math.random() * 30,
      social: 50 + Math.random() * 50,
      fitness: 40 + Math.random() * 60,
    }
  };
};

export const decideNextAction = (state: NPCState, hour: number): POIType => {
  // Night behavior: NPCs go home to sleep
  if (hour >= 22 || hour <= 6) return 'home';

  // Urgent needs
  if (state.needs.energy < 25) return 'home';
  if (state.needs.hunger < 35) return 'cafe';

  // Work hours
  if (hour >= 9 && hour <= 17 && Math.random() > 0.3) return 'work';

  // Leisure
  if (state.needs.social < 30) return 'park';
  if (state.needs.fitness < 30) return 'gym';
  if (Math.random() < 0.1) return 'theater';

  const currentType = POIS.find(p => p.id === state.currentPOI)!.type;
  const schedule: Record<POIType, POIType[]> = {
    home: ['work', 'cafe', 'gym'],
    work: ['cafe', 'park', 'home', 'theater'],
    cafe: ['work', 'home', 'park', 'gym'],
    park: ['home', 'cafe', 'theater'],
    gym: ['home', 'cafe', 'work'],
    theater: ['home', 'cafe', 'park'],
  };
  const options = schedule[currentType];
  return options[Math.floor(Math.random() * options.length)];
};

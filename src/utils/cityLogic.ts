
export type POIType = 'home' | 'work' | 'cafe' | 'park';

export interface POI {
  id: string;
  type: POIType;
  position: [number, number, number];
  name: string;
}

export const POIS: POI[] = [
  { id: 'h1', type: 'home', position: [-12, 0, -12], name: 'Apartamentos Norte' },
  { id: 'h2', type: 'home', position: [12, 0, -12], name: 'Residencial Este' },
  { id: 'w1', type: 'work', position: [-12, 0, 12], name: 'Distrito Financiero' },
  { id: 'w2', type: 'work', position: [12, 0, 12], name: 'Zona Industrial' },
  { id: 'c1', type: 'cafe', position: [0, 0, 0], name: 'Gran Café Central' },
  { id: 'p1', type: 'park', position: [0, 0, 8], name: 'Jardines del Prado' },
];

export interface NPCNeeds {
  hunger: number; // 0-100, 100 is full
  energy: number; // 0-100, 100 is rested
  social: number; // 0-100, 100 is satisfied
}

export interface NPCState {
  id: string;
  name: string;
  currentPOI: string;
  targetPOI: string;
  status: 'idle' | 'moving';
  activity: string;
  color: string;
  needs: NPCNeeds;
}

const NPC_NAMES = ['Carlos', 'Ana', 'Luis', 'Sofía', 'Elena', 'Pedro', 'Marta', 'Javier', 'Lucía', 'Diego'];
const COLORS = ['#ff4b4b', '#1cb0f6', '#2be335', '#ffc800', '#ce82ff', '#ff84d8'];

export const createNPC = (id: string): NPCState => {
  const home = POIS[Math.floor(Math.random() * 2)]; // Start at a home
  return {
    id,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)],
    currentPOI: home.id,
    targetPOI: home.id,
    status: 'idle',
    activity: 'Descansando en casa',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    needs: {
      hunger: 60 + Math.random() * 40,
      energy: 70 + Math.random() * 30,
      social: 50 + Math.random() * 50,
    }
  };
};

export const decideNextAction = (state: NPCState): POIType => {
  // Logic based on needs
  if (state.needs.energy < 30) return 'home';
  if (state.needs.hunger < 40) return 'cafe';
  if (state.needs.social < 30) return 'park';

  // Default behavior if needs are met
  const currentType = POIS.find(p => p.id === state.currentPOI)!.type;
  const schedule: Record<POIType, POIType[]> = {
    home: ['work', 'cafe'],
    work: ['cafe', 'park', 'home'],
    cafe: ['work', 'home', 'park'],
    park: ['home', 'cafe'],
  };
  const options = schedule[currentType];
  return options[Math.floor(Math.random() * options.length)];
};

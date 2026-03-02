
export type POIType = 'home' | 'work' | 'cafe' | 'park';

export interface POI {
  id: string;
  type: POIType;
  position: [number, number, number];
  name: string;
}

export const POIS: POI[] = [
  { id: 'h1', type: 'home', position: [-8, 0, -8], name: 'Apartamentos Norte' },
  { id: 'h2', type: 'home', position: [8, 0, -8], name: 'Residencial Este' },
  { id: 'w1', type: 'work', position: [-8, 0, 8], name: 'Oficinas Tech' },
  { id: 'w2', type: 'work', position: [8, 0, 8], name: 'Fábrica Central' },
  { id: 'c1', type: 'cafe', position: [0, 0, 0], name: 'Cafetería El Faro' },
  { id: 'p1', type: 'park', position: [0, 0, 5], name: 'Parque Central' },
];

export interface NPCState {
  id: string;
  name: string;
  currentPOI: string;
  targetPOI: string;
  status: 'idle' | 'moving';
  activity: string;
  color: string;
}

const NPC_NAMES = ['Carlos', 'Ana', 'Luis', 'Sofía', 'Elena', 'Pedro'];
const COLORS = ['#ff4b4b', '#1cb0f6', '#2be335', '#ffc800', '#ce82ff'];

export const createNPC = (id: string): NPCState => {
  const home = POIS.find(p => p.type === 'home')!;
  return {
    id,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)] + ' ' + (parseInt(id) + 1),
    currentPOI: home.id,
    targetPOI: home.id,
    status: 'idle',
    activity: 'Descansando en casa',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  };
};

export const getNextTarget = (currentType: POIType): POIType => {
  const schedule: Record<POIType, POIType[]> = {
    home: ['work', 'cafe'],
    work: ['cafe', 'park', 'home'],
    cafe: ['work', 'home', 'park'],
    park: ['home', 'cafe'],
  };
  const options = schedule[currentType];
  return options[Math.floor(Math.random() * options.length)];
};

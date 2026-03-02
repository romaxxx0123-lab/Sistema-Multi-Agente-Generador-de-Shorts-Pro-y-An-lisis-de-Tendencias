
export type POIType = 'home' | 'work' | 'cafe' | 'park' | 'gym' | 'theater' | 'hospital' | 'police' | 'school' | 'stadium' | 'mall' | 'library';
export type PersonalityType = 'Workaholic' | 'Athlete' | 'Socialite' | 'Loner' | 'Foodie' | 'Chill';
export type NPCSpecialty = 'Coffee Lover' | 'Gym Rat' | 'Art Enthusiast' | 'Work Bee' | 'Party Animal' | 'Couch Potato' | 'Scholar' | 'Gamer';
export type Profession = 'Surgeon' | 'Police Officer' | 'Professor' | 'Pro Athlete' | 'Barista' | 'Office Clerk' | 'Artist' | 'Student' | 'Unemployed';

export interface POI {
  id: string;
  type: POIType;
  position: [number, number, number];
  name: string;
}

export const POIS: POI[] = [
  // Residential (Homes)
  { id: 'h1', type: 'home', position: [-80, 0, -80], name: 'Residencial Skyview' },
  { id: 'h2', type: 'home', position: [80, 0, -80], name: 'Villas del Lago' },
  { id: 'h3', type: 'home', position: [-80, 0, 80], name: 'Apartamentos Central' },
  { id: 'h4', type: 'home', position: [80, 0, 80], name: 'Barrio Antiguo' },
  { id: 'h5', type: 'home', position: [0, 0, -120], name: 'Condominios Norte' },
  { id: 'h6', type: 'home', position: [0, 0, 120], name: 'Urbanización Sur' },

  // Workplaces
  { id: 'w1', type: 'work', position: [-40, 0, 40], name: 'Corporación Global' },
  { id: 'w2', type: 'work', position: [40, 0, 40], name: 'Tech Hub Metrópolis' },
  { id: 'w3', type: 'work', position: [0, 0, 40], name: 'Distrito Financiero' },

  // Leisure & Services
  { id: 'c1', type: 'cafe', position: [0, 0, 0], name: 'Gran Café Central' },
  { id: 'c2', type: 'cafe', position: [-30, 0, -30], name: 'Bistro del Prado' },
  { id: 'p1', type: 'park', position: [30, 0, -30], name: 'Plaza Mayor' },
  { id: 'p2', type: 'park', position: [0, 0, 80], name: 'Parque de la Libertad' },
  { id: 'g1', type: 'gym', position: [-50, 0, -50], name: 'Gimnasio Titán' },
  { id: 'g2', type: 'gym', position: [50, 0, -50], name: 'Zen Yoga Studio' },
  { id: 't1', type: 'theater', position: [60, 0, 10], name: 'Teatro Imperial' },

  // New Sectors
  { id: 'med1', type: 'hospital', position: [-60, 0, 10], name: 'Hospital General' },
  { id: 'pol1', type: 'police', position: [-10, 0, -60], name: 'Comisaría Central' },
  { id: 'edu1', type: 'school', position: [60, 0, -60], name: 'Universidad de Metrópolis' },
  { id: 'std1', type: 'stadium', position: [-100, 0, 0], name: 'Estadio Olímpico' },
  { id: 'mall1', type: 'mall', position: [100, 0, 0], name: 'Mega Mall Metrópolis' },
  { id: 'lib1', type: 'library', position: [10, 0, 60], name: 'Biblioteca Nacional' },

  // More scatter
  { id: 'c3', type: 'cafe', position: [80, 0, 20], name: 'The Roasted Bean' },
  { id: 'w4', type: 'work', position: [-120, 0, -40], name: 'Parque Industrial' },
  { id: 'h7', type: 'home', position: [-140, 0, -140], name: 'Mansiones del Oeste' },
  { id: 'h8', type: 'home', position: [140, 0, 140], name: 'Penthouse Heights' },
  { id: 'mall2', type: 'mall', position: [-60, 0, -100], name: 'Centro Comercial Norte' },
  { id: 'p3', type: 'park', position: [120, 0, -120], name: 'Jardines Botánicos' },
  { id: 'med2', type: 'hospital', position: [20, 0, 140], name: 'Clínica San Lucas' },
  { id: 'edu2', type: 'school', position: [-140, 0, 20], name: 'Academia de Artes' },
];

export interface NPCNeeds {
  hunger: number;
  energy: number;
  social: number;
  fitness: number;
  stress: number;
}

export interface NPCState {
  id: string;
  name: string;
  personality: PersonalityType;
  specialty: NPCSpecialty;
  profession: Profession;
  wealthTier: 'Poor' | 'Middle' | 'Rich';
  mood: 'Happy' | 'Neutral' | 'Stressed' | 'Tired' | 'Hungry';
  money: number;
  friends: string[];
  socialCooldown: number;
  currentPOI: string;
  targetPOI: string;
  status: 'idle' | 'moving' | 'working' | 'sleeping' | 'eating' | 'socializing' | 'exercising' | 'entertaining' | 'thinking' | 'chatting' | 'healing' | 'studying' | 'patrolling';
  activity: string;
  color: string;
  needs: NPCNeeds;
  skinColor: string;
  hairColor: string;
  hairStyle: 'short' | 'long' | 'bald';
  scale: number;
}

const NPC_NAMES = ['Carlos', 'Ana', 'Luis', 'Sofía', 'Elena', 'Pedro', 'Marta', 'Javier', 'Lucía', 'Diego', 'Raúl', 'Beatriz', 'Mario', 'Carla', 'Tomás', 'Hugo', 'Julia', 'Roberto', 'Inés', 'Víctor', 'Luciano', 'Griselda', 'Fernando', 'Esther', 'Santiago', 'Mónica', 'Pablo', 'Lorena', 'Felipe', 'Adriana', 'Cristian', 'Patricia', 'Andrés', 'Isabel', 'Ricardo', 'Elena', 'Manuel', 'Sara', 'Jorge', 'Silvia'];
const COLORS = ['#ff4b4b', '#1cb0f6', '#2be335', '#ffc800', '#ce82ff', '#ff84d8', '#ff9f43', '#00d2d3'];
const SKIN_COLORS = ['#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#c68642'];
const HAIR_COLORS = ['#090806', '#2c222b', '#71635a', '#b7a69e', '#d6c4c2', '#cabfb1', '#fff5e1', '#a5673f'];
const PERSONALITIES: PersonalityType[] = ['Workaholic', 'Athlete', 'Socialite', 'Loner', 'Foodie', 'Chill'];
const SPECIALTIES: NPCSpecialty[] = ['Coffee Lover', 'Gym Rat', 'Art Enthusiast', 'Work Bee', 'Party Animal', 'Couch Potato', 'Scholar', 'Gamer'];
const PROFESSIONS: Profession[] = ['Surgeon', 'Police Officer', 'Professor', 'Pro Athlete', 'Barista', 'Office Clerk', 'Artist', 'Student', 'Unemployed'];

export const createNPC = (id: string): NPCState => {
  const homePOIs = POIS.filter(p => p.type === 'home');
  const home = homePOIs[Math.floor(Math.random() * homePOIs.length)];
  const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
  const specialty = SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];
  const profession = PROFESSIONS[Math.floor(Math.random() * PROFESSIONS.length)];

  let wealthTier: NPCState['wealthTier'] = 'Middle';
  if (['Surgeon', 'Pro Athlete'].includes(profession)) wealthTier = 'Rich';
  if (['Student', 'Unemployed'].includes(profession)) wealthTier = 'Poor';

  const initialMoney = wealthTier === 'Rich' ? 500 + Math.random() * 500 : (wealthTier === 'Middle' ? 100 + Math.random() * 200 : 20 + Math.random() * 50);

  return {
    id,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length) % NPC_NAMES.length],
    personality,
    specialty,
    profession,
    wealthTier,
    mood: 'Neutral',
    money: initialMoney,
    friends: [],
    socialCooldown: 0,
    currentPOI: home.id,
    targetPOI: home.id,
    status: 'idle',
    activity: 'Descansando en casa',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    skinColor: SKIN_COLORS[Math.floor(Math.random() * SKIN_COLORS.length)],
    hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
    hairStyle: ['short', 'long', 'bald'][Math.floor(Math.random() * 3)] as 'short' | 'long' | 'bald',
    scale: 0.85 + Math.random() * 0.3,
    needs: {
      hunger: 70 + Math.random() * 30,
      energy: 80 + Math.random() * 20,
      social: 40 + Math.random() * 60,
      fitness: 40 + Math.random() * 60,
      stress: Math.random() * 30,
    }
  };
};

export const updateNeeds = (state: NPCState, delta: number): NPCState => {
  const rates = {
    hunger: state.personality === 'Foodie' ? 1.8 : 1.2,
    energy: state.personality === 'Workaholic' ? 1.5 : 1.0,
    social: state.personality === 'Socialite' ? 1.7 : (state.personality === 'Loner' ? 0.4 : 0.9),
    fitness: state.personality === 'Athlete' ? 1.6 : 0.8,
    stress: state.personality === 'Workaholic' ? 1.4 : 1.0,
  };

  const newNeeds = {
    hunger: Math.max(0, state.needs.hunger - rates.hunger * delta * 0.5),
    energy: Math.max(0, state.needs.energy - rates.energy * delta * 0.3),
    social: Math.max(0, state.needs.social - rates.social * delta * 0.4),
    fitness: Math.max(0, state.needs.fitness - rates.fitness * delta * 0.2),
    stress: Math.max(0, state.needs.stress + (state.status === 'working' ? 0.5 : -0.3) * rates.stress * delta),
  };

  let moneyChange = 0;
  if (state.status === 'working') {
      const salary = state.wealthTier === 'Rich' ? 10 : (state.wealthTier === 'Middle' ? 5 : 2);
      moneyChange = salary * delta;
  }
  if (state.status === 'eating') moneyChange = -4 * delta;
  if (state.status === 'exercising') moneyChange = -2 * delta;
  if (state.status === 'entertaining') moneyChange = -12 * delta;
  if (state.status === 'healing') moneyChange = -15 * delta;

  let mood: NPCState['mood'] = 'Neutral';
  if (newNeeds.energy < 20) mood = 'Tired';
  else if (newNeeds.hunger < 25) mood = 'Hungry';
  else if (newNeeds.stress > 70) mood = 'Stressed';
  else if (Object.values(newNeeds).every(v => v > 60) && state.money > 50) mood = 'Happy';

  return { ...state, needs: newNeeds, mood, money: Math.max(0, state.money + moneyChange), socialCooldown: Math.max(0, state.socialCooldown - delta) };
};

export const decideNextAction = (state: NPCState, hour: number): POIType => {
  if (hour >= 23 || hour <= 5) return 'home';
  if (state.needs.energy < 15) return 'home';
  if (state.needs.hunger < 20) return 'cafe';
  if (state.needs.stress > 85) return 'park';

  if (hour >= 8 && hour < 18) {
      if (state.profession === 'Surgeon') return 'hospital';
      if (state.profession === 'Police Officer') return Math.random() > 0.3 ? 'police' : 'park';
      if (state.profession === 'Professor' || state.profession === 'Student') return 'school';
      if (state.profession === 'Pro Athlete') return 'stadium';
      if (state.profession === 'Barista') return 'cafe';
      if (state.profession === 'Office Clerk') return 'work';
      if (state.money < 30) return 'work';
  }
  if (hour >= 18 && hour < 22) {
      if (state.specialty === 'Scholar' || state.specialty === 'Gamer') return 'library';
      if (state.specialty === 'Gym Rat') return 'gym';
      if (state.wealthTier === 'Rich' && Math.random() > 0.5) return 'theater';
      if (state.needs.social < 50) return 'park';
      if (Math.random() > 0.7) return 'mall';
  }
  return 'home';
};


export type POIType = 'home' | 'work' | 'cafe' | 'park' | 'gym' | 'theater';
export type PersonalityType = 'Workaholic' | 'Athlete' | 'Socialite' | 'Loner' | 'Foodie' | 'Chill';
export type NPCSpecialty = 'Coffee Lover' | 'Gym Rat' | 'Art Enthusiast' | 'Work Bee' | 'Party Animal' | 'Couch Potato';

export interface POI {
  id: string;
  type: POIType;
  position: [number, number, number];
  name: string;
}

export const POIS: POI[] = [
  { id: 'h1', type: 'home', position: [-25, 0, -25], name: 'Apartamentos Norte' },
  { id: 'h2', type: 'home', position: [25, 0, -25], name: 'Residencial Este' },
  { id: 'h3', type: 'home', position: [-25, 0, 25], name: 'Villas del Sur' },
  { id: 'w1', type: 'work', position: [-15, 0, 15], name: 'Torre Corporativa' },
  { id: 'w2', type: 'work', position: [15, 0, 15], name: 'Centro de Innovación' },
  { id: 'c1', type: 'cafe', position: [0, 0, 0], name: 'Gran Café Central' },
  { id: 'p1', type: 'park', position: [0, 0, 10], name: 'Plaza Mayor' },
  { id: 'g1', type: 'gym', position: [-8, 0, -8], name: 'Gimnasio Iron' },
  { id: 't1', type: 'theater', position: [8, 0, -8], name: 'Teatro Real' },
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
  personality: PersonalityType;
  specialty: NPCSpecialty;
  mood: 'Happy' | 'Neutral' | 'Stressed' | 'Tired' | 'Hungry';
  money: number;
  friends: string[];
  socialCooldown: number;
  currentPOI: string;
  targetPOI: string;
  status: 'idle' | 'moving' | 'working' | 'sleeping' | 'eating' | 'socializing' | 'exercising' | 'entertaining' | 'thinking' | 'chatting';
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
const SPECIALTIES: NPCSpecialty[] = ['Coffee Lover', 'Gym Rat', 'Art Enthusiast', 'Work Bee', 'Party Animal', 'Couch Potato'];

export const createNPC = (id: string): NPCState => {
  const homePOIs = POIS.filter(p => p.type === 'home');
  const home = homePOIs[Math.floor(Math.random() * homePOIs.length)];
  const personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
  const specialty = SPECIALTIES[Math.floor(Math.random() * SPECIALTIES.length)];

  return {
    id,
    name: NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length) % NPC_NAMES.length],
    personality,
    specialty,
    mood: 'Neutral',
    money: 100 + Math.random() * 200,
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
    scale: 0.9 + Math.random() * 0.2,
    needs: {
      hunger: 70 + Math.random() * 30,
      energy: 80 + Math.random() * 20,
      social: 40 + Math.random() * 60,
      fitness: 40 + Math.random() * 60,
    }
  };
};

export const updateNeeds = (state: NPCState, delta: number): NPCState => {
  const rates = {
    hunger: state.personality === 'Foodie' ? 1.5 : 1.0,
    energy: state.personality === 'Workaholic' ? 1.3 : 1.0,
    social: state.personality === 'Socialite' ? 1.5 : (state.personality === 'Loner' ? 0.3 : 0.8),
    fitness: state.personality === 'Athlete' ? 1.5 : 0.7,
  };

  const newNeeds = {
    hunger: Math.max(0, state.needs.hunger - rates.hunger * delta * 0.5),
    energy: Math.max(0, state.needs.energy - rates.energy * delta * 0.3),
    social: Math.max(0, state.needs.social - rates.social * delta * 0.4),
    fitness: Math.max(0, state.needs.fitness - rates.fitness * delta * 0.2),
  };

  // Money logic based on status
  let moneyChange = 0;
  if (state.status === 'working') moneyChange = 5 * delta;
  if (state.status === 'eating') moneyChange = -3 * delta;
  if (state.status === 'exercising') moneyChange = -2 * delta;
  if (state.status === 'entertaining') moneyChange = -10 * delta;

  // Determine Mood
  let mood: NPCState['mood'] = 'Neutral';
  if (newNeeds.energy < 20) mood = 'Tired';
  else if (newNeeds.hunger < 25) mood = 'Hungry';
  else if (newNeeds.energy < 40 && state.personality === 'Workaholic') mood = 'Stressed';
  else if (Object.values(newNeeds).every(v => v > 60) && state.money > 50) mood = 'Happy';

  return {
    ...state,
    needs: newNeeds,
    mood,
    money: Math.max(0, state.money + moneyChange),
    socialCooldown: Math.max(0, state.socialCooldown - delta)
  };
};

export const decideNextAction = (state: NPCState, hour: number): POIType => {
  // Night behavior (23:00 - 05:00)
  if (hour >= 23 || hour <= 5) return 'home';

  // Money constraints
  const canAffordLuxury = state.money > 50;
  const isBroke = state.money < 20;

  // Urgent needs first
  if (state.needs.energy < 15) return 'home';
  if (state.needs.hunger < 20) return 'cafe';

  // Broke? Go to work immediately if it's daytime
  if (isBroke && hour >= 8 && hour < 20) return 'work';

  // Morning routine (06:00 - 08:00)
  if (hour >= 6 && hour < 8) {
      if (state.needs.hunger < 70) return 'cafe';
      if (state.personality === 'Athlete' && state.money > 10) return 'gym';
      return 'home';
  }

  // Work/Primary activity hours (08:00 - 17:00)
  if (hour >= 8 && hour < 17) {
      if (state.needs.hunger < 30) return 'cafe';
      if (state.personality === 'Workaholic' || isBroke) return 'work';
      if (state.personality === 'Athlete' && Math.random() > 0.6 && state.money > 20) return 'gym';
      if (state.personality === 'Loner') return Math.random() > 0.5 ? 'home' : 'work';
      return Math.random() > 0.3 ? 'work' : 'cafe';
  }

  // Post-work / Evening (17:00 - 21:00)
  if (hour >= 17 && hour < 21) {
      if (state.personality === 'Socialite' || state.needs.social < 50) return 'park';
      if ((state.personality === 'Athlete' || state.needs.fitness < 50) && state.money > 20) return 'gym';
      if (state.personality === 'Foodie' || state.needs.hunger < 50) return 'cafe';
      if (Math.random() < 0.2 && canAffordLuxury) return 'theater';
      return 'park';
  }

  // Late night (21:00 - 23:00)
  if (hour >= 21 && hour < 23) {
      if (Math.random() > 0.5 && canAffordLuxury) return 'theater';
      return 'home';
  }

  return 'home';
};

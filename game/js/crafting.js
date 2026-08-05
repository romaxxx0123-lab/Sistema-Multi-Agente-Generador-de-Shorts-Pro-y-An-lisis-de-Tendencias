// Crafting + equipment: gives every gathered resource a purpose.

export const RECIPES = [
  {
    id: 'torch', n: 'ANTORCHA', icon: 'wood',
    cost: { wood: 2, stone: 1 },
    d: 'Luz mas amplia y calida',
    tip: 'El farol alumbra +60%',
    once: true, kind: 'gear',
    apply: s => { s.gear.torch = true; },
  },
  {
    id: 'pack', n: 'MORRAL REFORZADO', icon: 'wood',
    cost: { wood: 6, stone: 2 },
    d: 'Recolectas mas de cada nodo',
    tip: '+1 recurso por recoleccion',
    once: true, kind: 'gear',
    apply: s => { s.gatherBonus += 1; },
  },
  {
    id: 'boots', n: 'BOTAS DE CUERO', icon: 'wood',
    cost: { wood: 3, ore: 2 },
    d: 'Caminas mas rapido y cansas menos',
    tip: '+12% velocidad, -25% vigor',
    once: true, kind: 'gear',
    apply: (s, p) => { p.speed *= 1.12; s.gear.boots = true; },
  },
  {
    id: 'cloak', n: 'MANTO TERMICO', icon: 'flower',
    cost: { wood: 2, flower: 4, ore: 1 },
    d: 'Resistes el frio y el calor',
    tip: '-55% perdida de temperatura',
    once: true, kind: 'gear',
    apply: s => { s.gear.thermal = true; },
  },
  {
    id: 'spear', n: 'LANZA DE PIEDRA', icon: 'stone',
    cost: { wood: 4, stone: 3 },
    d: 'Ahuyenta depredadores',
    tip: 'Golpea con [F] a las bestias',
    once: true, kind: 'gear',
    apply: s => { s.gear.spear = true; },
  },
  {
    id: 'charm', n: 'AMULETO RUNICO', icon: 'crystal',
    cost: { crystal: 2, ore: 3, relic: 1 },
    d: 'Los santuarios brillan en el mapa',
    tip: 'Revela santuarios cercanos',
    once: true, kind: 'gear',
    apply: s => { s.gear.charm = true; },
  },
  // --- shelter (repeatable placeables) ---
  {
    id: 'bedroll', n: 'PETATE', icon: 'wood',
    cost: { wood: 4, flower: 3 },
    d: 'Duerme para pasar la noche',
    tip: 'Colocalo con [G] y descansa con [E]',
    kind: 'place',
  },
  {
    id: 'wall', n: 'MURO DE TRONCOS', icon: 'wood',
    cost: { wood: 3 },
    d: 'Bloquea el paso de las bestias',
    tip: 'Colocalo con [G]',
    kind: 'place',
  },
  {
    id: 'door', n: 'PUERTA', icon: 'wood',
    cost: { wood: 4, ore: 1 },
    d: 'Se abre y cierra con [E]',
    tip: 'Colocala con [G]',
    kind: 'place',
  },
  // --- consumables (repeatable) ---
  {
    id: 'campfire', n: 'HOGUERA PORTATIL', icon: 'wood',
    cost: { wood: 5, stone: 3 },
    d: 'Colocala donde estes',
    tip: 'Calor y descanso en el acto',
    kind: 'place',
  },
  {
    id: 'poultice', n: 'CATAPLASMA', icon: 'mushroom',
    cost: { mushroom: 2, flower: 2 },
    d: 'Restaura 45 de vida',
    tip: 'Se guarda para usar con [R]',
    kind: 'item',
  },
  {
    id: 'ration', n: 'RACION SECA', icon: 'berry',
    cost: { berry: 4, mushroom: 1 },
    d: 'Restaura 60 de hambre',
    tip: 'Se guarda para usar con [Q]',
    kind: 'item',
  },
];

export function canAfford(state, r) {
  for (const k in r.cost) if ((state.items[k] || 0) < r.cost[k]) return false;
  return true;
}

export function isBuilt(state, r) {
  return !!(r.once && state.built.has(r.id));
}

export function craft(state, player, r) {
  if (!canAfford(state, r) || isBuilt(state, r)) return false;
  for (const k in r.cost) state.items[k] -= r.cost[k];
  if (r.once) state.built.add(r.id);
  if (r.kind === 'gear') r.apply(state, player);
  else if (r.kind === 'item') state.pouch[r.id] = (state.pouch[r.id] || 0) + 1;
  else if (r.kind === 'place') state.pouch[r.id] = (state.pouch[r.id] || 0) + 1;
  return true;
}

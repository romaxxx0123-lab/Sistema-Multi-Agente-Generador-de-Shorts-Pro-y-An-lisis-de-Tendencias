import type { NpcRole } from '../sim/types';

export const NPC_NAMES = [
  'Marina', 'Tomás', 'Lucía', 'Iker', 'Nora', 'Bruno', 'Alma', 'Darío', 'Vera', 'Gael',
  'Inés', 'Teo', 'Carla', 'Hugo', 'Rocío', 'Elías', 'Julia', 'Mateo', 'Sol', 'Andrés',
  'Olga', 'Simón', 'Aitana', 'Ramiro', 'Celia', 'Joaquín', 'Lola', 'Fermín', 'Greta', 'Pablo',
];

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  hungerMult?: number;
  energyMult?: number;
  workMult?: number;
  moodBias?: number;
  stormFear?: number;
  braveryMult?: number;
  wakeHour?: number;
}

export const TRAITS: Record<string, TraitDef> = {
  optimista: { id: 'optimista', name: 'Optimista', desc: 'Ve el lado bueno de todo.', moodBias: 8 },
  grunon: { id: 'grunon', name: 'Gruñón', desc: 'Siempre encuentra algo de qué quejarse.', moodBias: -8 },
  madrugador: { id: 'madrugador', name: 'Madrugador', desc: 'Se levanta antes que nadie.', wakeHour: 5 },
  dormilon: { id: 'dormilon', name: 'Dormilón', desc: 'Se cansa antes y duerme más.', energyMult: 1.25 },
  gloton: { id: 'gloton', name: 'Glotón', desc: 'Come más que los demás.', hungerMult: 1.3 },
  trabajador: { id: 'trabajador', name: 'Trabajador', desc: 'Rinde más en su puesto.', workMult: 1.3 },
  hablador: { id: 'hablador', name: 'Hablador', desc: 'Le encanta charlar con todo el mundo.', moodBias: 3 },
  miedoso: { id: 'miedoso', name: 'Miedoso', desc: 'Las tormentas le aterran.', stormFear: 2 },
  valiente: { id: 'valiente', name: 'Valiente', desc: 'El primero en ayudar en una emergencia.', braveryMult: 1.6 },
};

export const ROLES: Record<NpcRole, { name: string; desc: string }> = {
  cocinero: { name: 'Cocinero/a', desc: 'Cocina con lo que hay en los almacenes y mantiene el fogón encendido.' },
  jardinero: { name: 'Jardinero/a', desc: 'Siembra, cuida y cosecha los huertos.' },
  mecanico: { name: 'Mecánico/a', desc: 'Repara daños y averías con los repuestos almacenados y alimenta el generador.' },
  pescador: { name: 'Pescador/a', desc: 'Pesca desde la borda y deja las capturas en el almacén.' },
  recolector: { name: 'Recolector/a', desc: 'Rescata restos flotantes con el gancho.' },
  libre: { name: 'Sin puesto', desc: 'Ayuda en las obras y donde haga falta.' },
};

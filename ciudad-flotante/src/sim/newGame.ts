import { START_REGION, regionDef } from '../data/regions';
import { CELL, LEVEL_H, MINUTES_PER_DAY, PLAYER_SLOTS, SHIP_LEVELS, SHIP_START_LENGTH, SHIP_WIDTH, START_HOUR } from './constants';
import { addItem, createInventory } from './inventory';
import { cellCenter, instantiateModule } from './ship';
import type { GameState, ModuleInstance, NpcState, Rotation } from './types';
import { SAVE_VERSION } from './types';

/** Crea un habitante con valores por defecto. */
export function makeNpc(
  id: string,
  name: string,
  role: NpcState['role'],
  trait: string,
  pos: { x: number; y: number; z: number },
  appearanceSeed: number,
  day: number,
): NpcState {
  const a = appearanceSeed;
  return {
    id,
    name,
    role,
    trait,
    appearance: {
      skin: a % 5,
      shirt: (a * 7) % 8,
      pants: (a * 3) % 5,
      hair: (a * 11) % 6,
      hat: a % 3 === 0,
      height: 0.92 + ((a * 13) % 17) / 100,
    },
    pos: { ...pos },
    yaw: 0,
    needs: { hunger: 85, thirst: 85, energy: 85, mood: 70, health: 100 },
    sick: false,
    injured: false,
    activity: 'idle',
    task: null,
    path: [],
    carry: null,
    bed: null,
    say: null,
    joinedDay: day,
    awayUntil: null,
    lastComplaintAt: -9999,
  };
}

/** Estado inicial de una partida nueva. */
export function createNewGame(seed = 12345): GameState {
  let nextId = 1;
  const mk = (type: string, level: number, x: number, z: number, rot: Rotation): ModuleInstance =>
    instantiateModule(nextId++, type, level, x, z, rot, 'active');

  const dormitorio = mk('dormitorio', 1, 1, 0, 2);
  const camarote = mk('camarote', 1, 3, 0, 2);
  const cocina = mk('cocina', 1, 1, 3, 0);
  const almacen = mk('almacen', 1, 3, 3, 0);
  const escaleraSup = mk('escalera', 1, 4, 0, 1);
  const banco = mk('banco_trabajo', 1, 5, 3, 0);
  const colector = mk('colector', 1, 7, 0, 0);
  const escaleraBodega = mk('escalera', 0, 7, 2, 0);
  const deposito = mk('deposito', 0, 8, 0, 0);
  const puente = mk('puente', 2, 1, 0, 0);

  // Despensa y almacén iniciales.
  const a = almacen.inventory!;
  addItem(a, 'madera', 24);
  addItem(a, 'chatarra', 10);
  addItem(a, 'tela', 4);
  addItem(a, 'cuerda', 6);
  addItem(a, 'conserva', 4);
  addItem(a, 'agua_potable', 4);
  addItem(a, 'semilla_hortaliza', 4);
  addItem(a, 'semilla_lino', 2);
  addItem(a, 'combustible', 2);
  addItem(a, 'plastico', 2);
  addItem(cocina.inventory!, 'pescado_crudo', 2);
  addItem(cocina.inventory!, 'hortaliza', 2);
  addItem(cocina.fuelInv!, 'madera', 3);

  camarote.beds[0] = 'player';

  const player = createInventory(PLAYER_SLOTS);
  addItem(player, 'gancho', 1);
  addItem(player, 'martillo', 1);
  addItem(player, 'cubo', 1);
  addItem(player, 'agua_potable', 2);
  addItem(player, 'conserva', 2);

  const deckY = LEVEL_H;
  const start = cellCenter(5, 1, SHIP_WIDTH);

  const marina = makeNpc('npc1', 'Marina', 'cocinero', 'optimista', { x: cellCenter(2, 2, SHIP_WIDTH).x, y: deckY, z: cellCenter(2, 2, SHIP_WIDTH).z }, 4, 1);
  const tomas = makeNpc('npc2', 'Tomás', 'mecanico', 'grunon', { x: cellCenter(6, 2, SHIP_WIDTH).x, y: deckY, z: cellCenter(6, 2, SHIP_WIDTH).z }, 9, 1);
  marina.bed = { moduleId: dormitorio.id, index: 0 };
  tomas.bed = { moduleId: dormitorio.id, index: 1 };
  dormitorio.beds[0] = marina.id;
  dormitorio.beds[1] = tomas.id;

  const region = regionDef(START_REGION);
  const time = START_HOUR * 60;

  const state: GameState = {
    version: SAVE_VERSION,
    seed,
    rngState: seed >>> 0,
    time,
    ship: {
      length: SHIP_START_LENGTH,
      width: SHIP_WIDTH,
      levels: SHIP_LEVELS,
      modules: [dormitorio, camarote, cocina, almacen, escaleraSup, banco, colector, escaleraBodega, deposito, puente],
      revision: 1,
      hullTier: 0,
      expansion: null,
    },
    crates: [],
    player: {
      pos: { x: start.x, y: deckY, z: start.z },
      yaw: -Math.PI / 2,
      pitch: 0,
      needs: { hunger: 80, thirst: 75, energy: 90, health: 100, warmth: 70 },
      sick: 0,
      inventory: player,
      hotbar: 0,
      clothing: null,
      sleeping: null,
      alive: true,
      deathCause: null,
      stats: { daysSurvived: 0, itemsCrafted: 0, debrisCollected: 0, fishCaught: 0, modulesBuilt: 0, repairs: 0, firesPutOut: 0 },
    },
    npcs: [marina, tomas],
    weather: {
      kind: 'despejado',
      remaining: 360,
      next: 'nublado',
      blend: 1,
      cloudiness: 0.15,
      rain: 0,
      fog: 0,
      wind: 0.3,
      windDir: 0.6,
      waveHeight: 0.6,
      temperature: region.baseTemp,
      lightning: 0,
    },
    voyage: {
      distance: 0,
      speed: 6,
      regionId: region.id,
      regionDistance: 0,
      regionLength: region.length,
      route: [region.id],
      nextChoices: null,
      chosenNext: null,
      anchoredUntil: null,
      anchorReason: null,
      sightings: [],
    },
    events: { active: [], cooldowns: {}, nextRollAt: time + 90, scripted: [], history: [] },
    debris: [],
    utilities: {
      batteryKWh: 0,
      waterL: 90,
      power: { generation: 0, demand: 0, satisfaction: 1, capacityKWh: 0 },
      water: { capacityL: 120, inPerHour: 0, outPerHour: 0 },
    },
    unlocks: [],
    tutorial: { done: [], dismissed: false },
    log: [{ at: time, text: 'Día 1. Zarpamos de puerto con lo justo. El barco será nuestro hogar.', kind: 'info' }],
    nextId,
  };
  void CELL;
  void MINUTES_PER_DAY;
  return state;
}

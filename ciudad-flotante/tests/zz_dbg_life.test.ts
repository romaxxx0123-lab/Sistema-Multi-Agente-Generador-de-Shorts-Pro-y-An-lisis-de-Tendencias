import { it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { createNewGame } from '../src/sim/newGame';
import * as events from '../src/sim/events';
import * as npc from '../src/sim/npc';
import { checkPlacement, instantiateModule } from '../src/sim/ship';
import type { Rotation } from '../src/sim/types';
it('dbg juego', () => {
  const sim = new Simulation(createNewGame(4));
  sim.state.events.nextRollAt = 1e12;
  sim.state.events.scripted = events.SCRIPT.map((s) => s.id);
  sim.state.weather.kind = 'despejado'; sim.state.weather.remaining = 1e9;
  const ship = sim.state.ship;
  let sala: any;
  outer: for (let x = ship.length - 1; x >= 0; x--) for (let z = 0; z < ship.width; z++) for (const rot of [0,1,2,3] as Rotation[]) {
    if (!checkPlacement(ship, [], 'sala_comun', 1, x, z, rot).ok) continue;
    sala = instantiateModule(sim.nextId(), 'sala_comun', 1, x, z, rot, 'active'); ship.modules.push(sala); sim.shipChanged(); break outer;
  }
  for (const n of sim.state.npcs) n.role = 'libre';
  const lucia = npc.spawnSurvivor(sim, { name: 'Lucía', quiet: true, role: 'libre' })!;
  lucia.needs = { hunger: 90, thirst: 90, energy: 90, mood: 70, health: 100 };
  while (sim.state.time < 18 * 60) sim.tick(1);
  const seen: Record<string, number> = {};
  for (let i = 0; i < 360; i++) {
    for (const n of sim.state.npcs) { n.needs.hunger = Math.max(n.needs.hunger, 70); n.needs.thirst = Math.max(n.needs.thirst, 70); n.needs.energy = Math.max(n.needs.energy, 60); }
    sim.tick(1);
    if (i % 10 === 0) console.log(Math.floor(sim.state.time/60)+':'+Math.floor(sim.state.time%60), sim.state.npcs.map((n) => `${n.name}:${sim.npcStatus(n.id)}`).join(' | '));
  }
  console.log(JSON.stringify(npc.npcDebugStats(sim).abortsBy));
});

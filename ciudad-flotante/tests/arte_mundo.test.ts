import { describe, it } from 'vitest';
import { debrisGeometry } from '../src/render/ship/debrisModels';
import * as M from '../src/render/world/models';

describe('sonda', () => {
  it('cuenta', () => {
    const kinds = ['tablones', 'barril', 'caja', 'restos', 'red', 'bidon', 'cofre', 'balsa'] as const;
    for (const k of kinds) {
      const g = [0, 1, 2].map((v) => debrisGeometry(k, v));
      console.log(k, g.map((x) => x.getAttribute('position').count / 3).join(','), JSON.stringify(g[0]!.boundingBox ?? (g[0]!.computeBoundingBox(), g[0]!.boundingBox)));
    }
    const w: [string, M.WorldModel][] = [
      ['wreck', M.wreckModel(11)], ['wreck2', M.wreckModel(401, 2)], ['island', M.islandModel(23)], ['islita', M.islandModel(201, 1, false)], ['merchant', M.merchantModel(5)], ['market', M.marketBargeModel(7)],
      ['platform', M.platformModel(29)], ['lighthouse', M.lighthouseModel(41)], ['tower', M.signalTowerModel(53)], ['station', M.weatherStationModel(61)], ['raft', M.raftModel(3)],
      ['bigIsland', M.bigIslandModel(101)], ['iceberg', M.icebergModel(301)], ['stack', M.seaStackModel(501)], ['sailboat', M.sailboatModel(601)],
    ];
    for (const [n, m] of w) { m.solid.computeBoundingBox(); const b = m.solid.boundingBox!; console.log(n, m.solid.getAttribute('position').count / 3, m.glow ? m.glow.getAttribute('position').count / 3 : 0, b.min.toArray().map((x) => x.toFixed(1)).join(' '), '|', b.max.toArray().map((x) => x.toFixed(1)).join(' ')); }
  });
});

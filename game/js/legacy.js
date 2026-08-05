// Meta-progression: milestones that persist across every run.
//
// Long-term design: this is the layer that gives death meaning. Each run
// feeds lifetime counters; crossing a threshold unlocks a permanent boon
// that applies to *every future expedition*. Adding a new unlock later is
// just one entry in this table — no other file has to change.

export const UNLOCKS = [
  {
    id: 'veteran', n: 'VETERANO', track: 'runs', need: 3,
    d: 'Empiezas con 20 de vigor extra',
    apply: s => { s.maxStamina += 20; },
  },
  {
    id: 'forager', n: 'OJO ENTRENADO', track: 'totalKm', need: 15,
    d: 'Empiezas con 3 bayas y 2 hongos',
    apply: s => { s.items.berry += 3; s.items.mushroom += 2; },
  },
  {
    id: 'pathfinder', n: 'RASTREADOR', track: 'discovered', need: 5,
    d: 'El mapa nace revelado mas lejos',
    apply: s => { s.mapBonus += 1; },
  },
  {
    id: 'survivor', n: 'CURTIDO', track: 'totalDays', need: 12,
    d: 'Empiezas con 25 de vida extra',
    apply: s => { s.maxHp += 25; },
  },
  {
    id: 'artisan', n: 'ARTESANO', track: 'totalKm', need: 40,
    d: 'Empiezas con madera y piedra',
    apply: s => { s.items.wood += 6; s.items.stone += 4; },
  },
  {
    id: 'warden', n: 'GUARDIAN', track: 'discovered', need: 9,
    d: 'Las bestias te temen mas',
    apply: s => { s.shyBonus = (s.shyBonus || 0) + 30; },
  },
  {
    id: 'legend', n: 'LEYENDA', track: 'totalDays', need: 40,
    d: 'Empiezas con el manto termico puesto',
    apply: s => { s.gear.thermal = true; s.built.add('cloak'); },
  },
];

/** How far along each unlock is, given the lifetime meta record. */
export function progressOf(u, meta, runs) {
  const val = u.track === 'runs' ? (runs || 0)
    : u.track === 'discovered' ? ((meta.discovered || []).length)
    : (meta[u.track] || 0);
  return { val, need: u.need, done: val >= u.need, frac: Math.min(1, val / u.need) };
}

export function earned(meta, runs) {
  return UNLOCKS.filter(u => progressOf(u, meta, runs).done);
}

/** Apply every earned boon to a fresh run. */
export function applyUnlocks(state, meta, runs) {
  const got = earned(meta, runs);
  for (const u of got) u.apply(state);
  return got;
}

export const TRACK_LABEL = {
  runs: 'EXPEDICIONES', totalKm: 'KM TOTALES',
  totalDays: 'DIAS TOTALES', discovered: 'BIOMAS VISTOS',
};

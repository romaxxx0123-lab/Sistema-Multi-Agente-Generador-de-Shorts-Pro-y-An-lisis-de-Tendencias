// Save system: versioned, migratable, forward-compatible.
//
// Design notes for future work:
//  * SCHEMA is bumped whenever the shape changes; `migrate()` upgrades old
//    saves instead of throwing them away.
//  * Unknown fields are preserved on load, so a save written by a newer build
//    is not silently destroyed by an older one.
//  * The world itself is never serialised (it is regenerated from the seed).
//    Only *player-caused deltas* are stored: harvested nodes, opened chests,
//    placed objects. That keeps saves tiny no matter how far you explore.

export const SCHEMA = 4;
const KEY = 'ellswyr.save.v1';

export function readRaw() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

export function writeRaw(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); return true; }
  catch (e) { return false; }
}

/** Bring any older save up to the current schema. */
export function migrate(data) {
  const d = Object.assign({}, data);
  const v = d.schema || 1;
  if (v < 2) {
    // v1 stored only `best` + `runs`; nothing to move, just tag it
    d.meta = d.meta || {};
  }
  if (v < 3) {
    // v3 introduces persistent runs and unlock tracking
    d.run = d.run || null;
    d.meta = Object.assign({ totalDays: 0, totalKm: 0, discovered: [] }, d.meta);
  }
  if (v < 4) {
    // v4 recalibra la generación del mundo. Como el mundo no se serializa sino
    // que se regenera desde la semilla (ver nota de arriba), una partida
    // guardada con la generación anterior reaparece en un mundo distinto: el
    // jugador puede quedar dentro de una montaña o en medio del mar, y sus ids
    // de props consumidos ya no corresponden a nada. Se descarta la partida en
    // curso; el meta-progreso —récords, desbloqueos, biomas vistos— se conserva.
    d.run = null;
  }
  d.schema = SCHEMA;
  return d;
}

export function load() { return migrate(readRaw()); }

// ---------------------------------------------------------------- helpers
const setToArr = s => (s instanceof Set ? [...s] : (s || []));

/** Serialise a live run into a compact object. */
export function snapshotRun(state, player, world) {
  return {
    seed: state.seed,
    cfg: state.worldCfg,
    look: state.look,
    time: +state.time.toFixed(3),
    day: state.day,
    px: Math.round(player.x), py: Math.round(player.y),
    dir: player.dir,
    hp: Math.round(state.hp), maxHp: state.maxHp,
    stamina: Math.round(state.stamina), maxStamina: state.maxStamina,
    food: Math.round(state.food), warm: Math.round(state.warm),
    heat: Math.round(state.heat),
    items: Object.assign({}, state.items),
    pouch: Object.assign({}, state.pouch),
    gear: Object.assign({}, state.gear),
    built: setToArr(state.built),
    biomes: setToArr(state.biomesSeen),
    discovered: setToArr(state.discovered),
    distance: Math.round(state.distance),
    xp: state.prog ? state.prog.xp : 0,
    level: state.prog ? state.prog.level : 1,
    counters: state.prog ? Object.assign({}, state.prog.counters) : {},
    doneQuests: state.prog ? setToArr(state.prog.done) : [],
    // world deltas only — never the world itself
    consumed: [...world.consumed],
    placed: world.placed.map(p => ({
      x: Math.round(p.x), y: Math.round(p.y), s: p.s, type: p.type,
      solid: !!p.solid, r: p.r || 0, anim: p.anim || 0,
    })),
  };
}

export function saveRun(state, player, world) {
  const d = load();
  d.run = snapshotRun(state, player, world);
  d.meta = d.meta || {};
  return writeRaw(d);
}

export function clearRun() {
  const d = load();
  d.run = null;
  return writeRaw(d);
}

/** Fold a finished run into the lifetime records. */
export function recordResult(state, died) {
  const d = load();
  const b = d.best || {};
  const km = +(state.distance / 160).toFixed(1);
  d.best = {
    days: Math.max(b.days || 0, state.day),
    km: Math.max(b.km || 0, km),
    biomes: Math.max(b.biomes || 0, state.biomesSeen.size),
    level: Math.max(b.level || 0, state.prog ? state.prog.level : 1),
    quests: Math.max(b.quests || 0, state.prog ? state.prog.done.size : 0),
  };
  d.runs = (d.runs || 0) + 1;
  if (died) d.deaths = (d.deaths || 0) + 1;
  d.meta = d.meta || {};
  d.meta.totalDays = (d.meta.totalDays || 0) + state.day;
  d.meta.totalKm = +((d.meta.totalKm || 0) + km).toFixed(1);
  // union of every biome ever seen, across all runs
  const seen = new Set(d.meta.discovered || []);
  for (const b2 of state.biomesSeen) seen.add(b2);
  d.meta.discovered = [...seen];
  d.look = state.look;
  d.run = null;
  writeRaw(d);
  return d;
}

export function saveSettings(audio) {
  const d = load();
  d.settings = { sound: audio.enabled, music: audio.musicOn };
  writeRaw(d);
}

export function saveLook(look) {
  const d = load();
  d.look = look;
  writeRaw(d);
}

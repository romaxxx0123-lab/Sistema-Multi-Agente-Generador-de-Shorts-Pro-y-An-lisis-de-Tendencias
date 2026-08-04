// Objectives + progression: gives the run structure beyond "walk around".

export const QUEST_DEFS = [
  { id: 'firstSteps', n: 'PRIMEROS PASOS', d: 'Recorre 500 metros', goal: 50,
    track: 'distance', xp: 30 },
  { id: 'gather', n: 'RECOLECTOR', d: 'Reune 10 recursos', goal: 10,
    track: 'gathered', xp: 40 },
  { id: 'biomes3', n: 'CARTOGRAFO', d: 'Descubre 3 biomas', goal: 3,
    track: 'biomes', xp: 60 },
  { id: 'shrine', n: 'DESPERTAR', d: 'Activa un santuario', goal: 1,
    track: 'shrines', xp: 80 },
  { id: 'chest', n: 'BUSCATESOROS', d: 'Abre 2 cofres', goal: 2,
    track: 'chests', xp: 70 },
  { id: 'night', n: 'VIGILIA', d: 'Sobrevive una noche entera', goal: 1,
    track: 'nights', xp: 90 },
  { id: 'biomes6', n: 'TRASHUMANTE', d: 'Descubre 6 biomas', goal: 6,
    track: 'biomes', xp: 120 },
  { id: 'far', n: 'HORIZONTE', d: 'Recorre 5 kilometros', goal: 500,
    track: 'distance', xp: 150 },
  { id: 'relics', n: 'ANTICUARIO', d: 'Consigue 5 reliquias', goal: 5,
    track: 'relics', xp: 160 },
  { id: 'biomes11', n: 'LEYENDA DE ELLSWYR', d: 'Descubre los 11 biomas', goal: 11,
    track: 'biomes', xp: 400 },
];

export const XP_PER_LEVEL = 100;

export class Progress {
  constructor() {
    this.xp = 0;
    this.level = 1;
    this.counters = {
      distance: 0, gathered: 0, biomes: 0, shrines: 0,
      chests: 0, nights: 0, relics: 0,
    };
    this.done = new Set();
    this.active = [];
    this.pending = [];      // toasts to show
    this.refresh();
  }

  refresh() {
    // keep up to 3 active objectives, in definition order
    this.active = QUEST_DEFS
      .filter(q => !this.done.has(q.id))
      .slice(0, 3);
  }

  bump(track, amount = 1) {
    if (!(track in this.counters)) return;
    this.counters[track] += amount;
    this.check();
  }
  set(track, value) {
    if (!(track in this.counters)) return;
    if (value > this.counters[track]) { this.counters[track] = value; this.check(); }
  }

  check() {
    for (const q of this.active.slice()) {
      if (this.counters[q.track] >= q.goal && !this.done.has(q.id)) {
        this.done.add(q.id);
        this.addXP(q.xp);
        this.pending.push({ type: 'quest', title: q.n, sub: `+${q.xp} EXP` });
      }
    }
    this.refresh();
  }

  addXP(n) {
    this.xp += n;
    while (this.xp >= this.level * XP_PER_LEVEL) {
      this.xp -= this.level * XP_PER_LEVEL;
      this.level++;
      this.pending.push({ type: 'level', title: `NIVEL ${this.level}`, sub: 'vigor +10' });
    }
  }

  get need() { return this.level * XP_PER_LEVEL; }
  get frac() { return Math.max(0, Math.min(1, this.xp / this.need)); }

  progressOf(q) {
    return Math.min(1, this.counters[q.track] / q.goal);
  }
  textOf(q) {
    const c = Math.min(this.counters[q.track], q.goal);
    return `${Math.floor(c)}/${q.goal}`;
  }
}

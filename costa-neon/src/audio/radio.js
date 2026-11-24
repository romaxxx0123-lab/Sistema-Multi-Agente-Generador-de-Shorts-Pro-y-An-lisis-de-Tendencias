// Radio procedural: 6 estaciones con canciones estructuradas generadas por semilla.
import { RNG, hash2 } from '../core/utils.js';

export const STATIONS = [
  { id: 'indigo', name: 'ÍNDIGO FM', freq: '104.7', genre: 'Synthwave', color: '#33e1ff' },
  { id: 'calle', name: 'CALLE 88', freq: '88.3', genre: 'Urbano', color: '#ff5a8a' },
  { id: 'lofi', name: 'LOFI PALMERAS', freq: '93.1', genre: 'Lo-fi', color: '#b18cff' },
  { id: 'muelle', name: 'MUELLE TECHNO', freq: '99.9', genre: 'Techno', color: '#4dffa6' },
  { id: 'cumbia', name: 'CUMBIA NEÓN', freq: '101.5', genre: 'Cumbia', color: '#ffb547' },
  { id: 'casete', name: 'CASETE PERDIDO', freq: '107.7', genre: 'Chiptune', color: '#ff8c42' },
];

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Patrones de 16 pasos: x = golpe, o = acento/abierto, g = fantasma
const GENRES = {
  indigo: {
    bpm: [100, 118], scales: ['minor'], swing: 0, gain: 0.99,
    progs: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 6, 0, 0], [0, 6, 5, 6], [0, 5, 3, 4]],
    drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ohat: '..............o.' },
    bass: 'pump8', chords: 'pad', arp: true, lead: 'saw', key: [38, 45],
  },
  calle: {
    bpm: [88, 96], scales: ['minor'], swing: 0, gain: 0.68,
    progs: [[0, 5, 2, 6], [0, 6, 5, 4], [0, 3, 6, 5], [5, 3, 0, 6]],
    drums: { kick: 'x...x...x...x...', snare: '...x..x....x..x.', hat: 'x.x.x.xxx.x.x.xx', rim: '......x.......x.' },
    bass: 'dembow', chords: 'pluck', arp: false, lead: 'pluck', key: [36, 43],
  },
  lofi: {
    bpm: [72, 86], scales: ['major', 'dorian'], swing: 0.62, gain: 0.8,
    progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 4, 2, 5], [0, 3, 1, 4]],
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', ghost: '.......g.....g..' },
    bass: 'soft', chords: 'epiano', arp: false, lead: 'soft', sevenths: true, crackle: true, key: [38, 46],
  },
  muelle: {
    bpm: [124, 130], scales: ['minor', 'phrygian'], swing: 0, gain: 1.09,
    progs: [[0, 0, 0, 0], [0, 0, 5, 5], [0, 0, 3, 3], [0, 0, 6, 6]],
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..o...o...o...o.', shaker: 'xxxxxxxxxxxxxxxx' },
    bass: 'acid', chords: 'stab', arp: false, lead: null, key: [36, 42],
  },
  cumbia: {
    bpm: [90, 100], scales: ['major', 'minor'], swing: 0.08, gain: 1.04,
    progs: [[0, 4, 4, 0], [0, 3, 4, 0], [5, 3, 4, 0], [0, 0, 4, 4]],
    drums: { guach: 'x.xxx.xxx.xxx.xx', conga: '..s...o...s...o.', kick: 'x.......x.......', bell: 'x...x...x...x...' },
    bass: 'cumbia', chords: 'chuck', arp: false, lead: 'accordion', key: [40, 47],
  },
  casete: {
    bpm: [140, 160], scales: ['major'], swing: 0, gain: 1.44,
    progs: [[0, 5, 3, 4], [0, 4, 5, 3], [3, 4, 0, 0], [0, 3, 4, 4]],
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' },
    bass: 'tri8', chords: null, arp: true, lead: 'pulse', key: [40, 47],
  },
};

const STRUCTURE = [
  ['intro', 4, 0.3], ['verse', 8, 0.7], ['chorus', 8, 1], ['verse', 8, 0.7], ['chorus', 8, 1], ['break', 4, 0.4], ['chorus', 8, 1], ['outro', 4, 0.3],
];

// Títulos con concordancia de género: sustantivo + complemento o adjetivo concordante
const NOUNS = [
  ['Noche', 'f'], ['Luces', 'fp'], ['Marea', 'f'], ['Faro', 'm'], ['Brisa', 'f'], ['Neón', 'm'], ['Ruta', 'f'], ['Calor', 'm'],
  ['Asfalto', 'm'], ['Luna', 'f'], ['Fuego', 'm'], ['Verano', 'm'], ['Sombra', 'f'], ['Puerto', 'm'], ['Cielo', 'm'], ['Bahía', 'f'],
  ['Ritmo', 'm'], ['Corazón', 'm'], ['Medianoche', 'f'], ['Palmeras', 'fp'], ['Olas', 'fp'], ['Recuerdos', 'mp'], ['Avenida', 'f'], ['Señales', 'fp'],
];
const COMPLEMENTS = ['en la Costanera', 'de Bahía', 'sin Frenos', 'del Muelle', 'de Neón', 'al Amanecer', 'de Cristal', 'del Sur', 'en Llamas', 'bajo la Lluvia', 'sobre el Puente', 'a Toda Velocidad', 'en el Malecón', 'de Medianoche', 'en Cámara Lenta'];
const ADJ = [
  ['Eléctrico', 'Eléctrica'], ['Infinito', 'Infinita'], ['Prohibido', 'Prohibida'], ['Perdido', 'Perdida'], ['Salvaje', 'Salvaje'],
  ['Dorado', 'Dorada'], ['Turquesa', 'Turquesa'], ['Lento', 'Lenta'], ['Alto', 'Alta'], ['Roto', 'Rota'], ['Tropical', 'Tropical'], ['Nocturno', 'Nocturna'],
];
const ARTISTS = [
  'Los Faros Rotos', 'La Sirena Eléctrica', 'DJ Gaviota', 'Turbo Cocodrilo', 'Palmera Negra', 'Marea Roja', 'Delfín Láser', 'MC Astronauta',
  'Los Cumbiamberos del Puerto', 'Ola Púrpura', 'Bandoneón Digital', 'Chico Neón', 'Mariposa Atómica', 'Contenedor 9', 'Grúa Azul',
  'Cangrejo Dorado', 'Las Gaviotas', 'Lola Casete', 'Malecón Club', 'Sonido Bahía', 'Los Pibes del Faro', 'Nube de Sal', 'Valeria Voltio',
  'El Tano Synth', 'Coral Beat', 'Rayo Cortázar', 'Sintonía Sur', 'Cometa Tropical', 'Brisa FM Allstars', 'Los Tiburones de Neón',
];
function makeTitle(r) {
  const [n, gn] = r.pick(NOUNS);
  if (r.chance(0.55)) return n + ' ' + r.pick(COMPLEMENTS);
  const [m, f] = r.pick(ADJ);
  let a = gn[0] === 'f' ? f : m;
  if (gn.endsWith('p')) a = a.endsWith('e') || a.endsWith('a') || a.endsWith('o') ? a + 's' : a + 'es';
  return n + ' ' + a;
}

class Song {
  constructor(stationIdx, songIdx) {
    const st = STATIONS[stationIdx];
    const g = GENRES[st.id];
    const r = new RNG(Math.floor(hash2(stationIdx * 131 + 7, songIdx * 977 + 3) * 4294967296) || 1);
    this.r = r;
    this.g = g;
    this.station = stationIdx;
    this.bpm = Math.round(r.range(g.bpm[0], g.bpm[1]));
    this.root = r.int(g.key[0], g.key[1]);
    this.scale = SCALES[r.pick(g.scales)];
    this.prog = r.pick(g.progs);
    this.prog2 = r.pick(g.progs);
    this.sections = [];
    let bar = 0;
    for (const [name, bars, inten] of STRUCTURE) {
      this.sections.push({ name, start: bar, bars, inten });
      bar += bars;
    }
    this.bars = bar;
    this.stepDur = 60 / this.bpm / 4;
    this.barDur = this.stepDur * 16;
    this.duration = this.bars * this.barDur;
    this.title = makeTitle(r);
    this.artist = r.pick(ARTISTS);
    this.motif = this._motif(r, 32);
    this.motifB = this._motif(r, 32);
    this.acidPattern = Array.from({ length: 16 }, () => ({ on: r.chance(0.78), oct: r.chance(0.25) ? 12 : r.chance(0.12) ? 7 : 0, acc: r.chance(0.3), slide: r.chance(0.2) }));
    this.acidPattern[0].on = true;
  }
  _motif(r, steps) {
    const notes = [];
    let s = 0;
    let deg = r.pick([0, 2, 4, 7]);
    while (s < steps) {
      const strong = s % 4 === 0;
      const len = r.pick(strong ? [2, 2, 3, 4] : [1, 2, 2]);
      if (r.chance(strong ? 0.88 : 0.55)) {
        notes.push({ step: s, len: Math.min(len, steps - s), deg });
        const move = r.pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
        deg = Math.max(-2, Math.min(11, deg + move));
      }
      s += len;
    }
    // terminar en tónica o quinta
    if (notes.length) notes[notes.length - 1].deg = r.pick([0, 4, 7]);
    return notes;
  }
  sectionAt(bar) {
    for (const s of this.sections) if (bar >= s.start && bar < s.start + s.bars) return s;
    return this.sections[this.sections.length - 1];
  }
  chordDegree(bar) {
    const sec = this.sectionAt(bar);
    const p = sec.name === 'chorus' ? this.prog : sec.name === 'break' ? this.prog2 : this.prog;
    return p[bar % p.length];
  }
  /** Notas MIDI de un acorde sobre un grado de la escala. */
  chord(deg, base, n = 3) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = deg + i * 2;
      out.push(base + this.scale[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7));
    }
    return out;
  }
  degToMidi(deg, base) {
    return base + this.scale[((deg % 7) + 7) % 7] + 12 * Math.floor(deg / 7);
  }
}

class Radio {
  constructor(A) {
    this.A = A;
    this.stations = STATIONS;
    this.current = -1;
    this.mode = 'car';
    this.onTrack = null;
    this.song = null;
    this.timer = null;
    this.locked = new Set(); // estaciones bloqueadas (p.ej. casete hasta desbloquear)
  }

  _init() {
    const A = this.A, ctx = A.ctx;
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.2;
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.5;
    this.mix.connect(this.comp);
    this.comp.connect(this.filter);
    this.filter.connect(this.out);
    this.out.connect(A.musicBus);
    this.rev = ctx.createConvolver();
    this.rev.buffer = A._impulse(2.4, 3.2);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.5;
    this.revSend.connect(this.rev);
    this.rev.connect(this.comp);
    this.delay = ctx.createDelay(1.5);
    this.delayFb = ctx.createGain();
    this.delayFb.gain.value = 0.32;
    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.3;
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFb);
    this.delayFb.connect(this.delay);
    this.delay.connect(this.comp);
    this.stationFilter = ctx.createBiquadFilter();
    this.stationFilter.type = 'lowpass';
    this.stationFilter.frequency.value = 20000;
    this.stationFilter.connect(this.mix);
    this.bus = ctx.createGain();
    this.bus.connect(this.stationFilter);
    // Ondas de pulso para chiptune
    const pulse = (duty) => {
      const n = 32, re = new Float32Array(n), im = new Float32Array(n);
      for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      return ctx.createPeriodicWave(re, im);
    };
    this.pulse125 = pulse(0.125);
    this.pulse25 = pulse(0.25);
    this.setMode(this.mode);
    if (this.current >= 0) this._startStation(this.current, true);
  }

  setMode(mode) {
    this.mode = mode;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (mode === 'outside') {
      this.filter.frequency.setTargetAtTime(700, t, 0.15);
      this.out.gain.setTargetAtTime(this.current >= 0 ? 0.3 : 0, t, 0.15);
    } else {
      this.filter.frequency.setTargetAtTime(mode === 'phone' ? 12000 : 20000, t, 0.15);
      this.out.gain.setTargetAtTime(this.current >= 0 ? 1 : 0, t, 0.15);
    }
  }

  available() {
    return this.stations.map((s, i) => i).filter((i) => !this.locked.has(this.stations[i].id));
  }

  play(index) {
    if (index === this.current) return;
    if (index >= 0 && this.locked.has(this.stations[index].id)) return;
    this.current = index;
    if (!this.ctx) return;
    this._static();
    if (index < 0) {
      this._stopScheduler();
      this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    this._startStation(index, false);
  }

  next() {
    const av = this.available();
    const list = [...av, -1];
    const i = list.indexOf(this.current);
    this.play(list[(i + 1) % list.length]);
  }
  prev() {
    const av = this.available();
    const list = [...av, -1];
    const i = list.indexOf(this.current);
    this.play(list[(i - 1 + list.length) % list.length]);
  }
  stop() {
    this.play(-1);
  }

  getNowPlaying() {
    if (this.current < 0 || !this.song || !this.ctx) return null;
    const p = Math.min(1, Math.max(0, (this.ctx.currentTime - this.songStart) / this.song.duration));
    return { stationIndex: this.current, station: this.stations[this.current], title: this.song.title, artist: this.song.artist, progress: p };
  }

  _static() {
    if (!this.ctx) return;
    const A = this.A, t = this.ctx.currentTime;
    A._noiseBurst(t, 0.38, A.musicBus, { gain: 0.12, type: 'bandpass', f: 1800 + Math.random() * 1500, q: 0.8, attack: 0.01 });
  }

  _startStation(index, silentStatic) {
    const ctx = this.ctx;
    // La estación "transmite" siempre: posición derivada del reloj
    const clock = Date.now() / 1000 + index * 977.3;
    const approx = 150;
    const songIdx = Math.floor(clock / approx);
    const song = new Song(index, songIdx);
    const into = (clock % approx) / approx;
    let bar = Math.floor(into * song.bars);
    if (bar > song.bars - 6) bar = 0;
    if (this._forceBar != null) bar = this._forceBar;
    bar = Math.max(0, bar - (bar % 4));
    this.song = song;
    this.songIdx = songIdx;
    this.step = bar * 16;
    this.nextTime = ctx.currentTime + (silentStatic ? 0.05 : 0.35);
    this.songStart = this.nextTime - bar * song.barDur;
    this.identUntil = 0;
    this.stationFilter.frequency.setTargetAtTime(GENRES[STATIONS[index].id].crackle ? 3600 : 20000, ctx.currentTime, 0.05);
    this.bus.gain.setTargetAtTime(GENRES[STATIONS[index].id].gain, ctx.currentTime, 0.05);
    this.delay.delayTime.value = Math.min(1.4, song.stepDur * 3);
    const t = ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(this.mode === 'outside' ? 0.3 : 1, t + 0.8);
    this._startScheduler();
    if (this.onTrack) this.onTrack({ stationIndex: index, station: STATIONS[index], title: song.title, artist: song.artist });
  }

  _startScheduler() {
    this._stopScheduler();
    this.timer = setInterval(() => this._tick(), 25);
  }
  _stopScheduler() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _tick() {
    const ctx = this.ctx;
    if (!ctx || this.current < 0 || !this.song) return;
    const ahead = ctx.currentTime + 0.16;
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.05; // la pestaña estuvo en segundo plano
    let guard = 0;
    while (this.nextTime < ahead && guard++ < 64) {
      const song = this.song;
      if (this.identUntil > 0) {
        if (this.nextTime >= this.identUntil) {
          this.identUntil = 0;
          this.songIdx++;
          this.song = new Song(this.current, this.songIdx);
          this.step = 0;
          this.songStart = this.nextTime;
          this.delay.delayTime.value = Math.min(1.4, this.song.stepDur * 3);
          if (this.onTrack) this.onTrack({ stationIndex: this.current, station: STATIONS[this.current], title: this.song.title, artist: this.song.artist });
        } else {
          this.nextTime = this.identUntil;
        }
        continue;
      }
      if (this.step >= song.bars * 16) {
        this._ident(this.nextTime, song);
        this.identUntil = this.nextTime + 3.2;
        continue;
      }
      const s = this.step % 16;
      let t = this.nextTime;
      if (song.g.swing && s % 2 === 1) t += song.stepDur * song.g.swing * 0.5;
      this._playStep(song, this.step, t);
      this.step++;
      this.nextTime += song.stepDur;
    }
  }

  // ------------------------------------------------------------ arreglo
  _playStep(song, step, t) {
    const g = song.g;
    const bar = Math.floor(step / 16), s = step % 16;
    const sec = song.sectionAt(bar);
    const inten = sec.inten;
    const id = STATIONS[song.station].id;
    const deg = song.chordDegree(bar);
    const r = song.r;
    const D = g.drums;
    const hit = (pat) => pat && pat[s] && pat[s] !== '.' ? pat[s] : null;
    const fill = bar % 8 === 7 && s >= 12;
    const drumsOn = sec.name !== 'intro' || bar >= sec.start + 2;
    const kickOn = sec.name !== 'break' && sec.name !== 'intro';
    // Batería
    if (drumsOn) {
      if (kickOn && hit(D.kick)) this.kick(t, id === 'casete' ? 0.5 : 0.9, id);
      if (kickOn && hit(D.snare)) this.snare(t, 0.7, id);
      if (D.hat && hit(D.hat)) this.hat(t, hit(D.hat) === 'o' ? 0.35 : 0.18 * (0.6 + inten * 0.4), hit(D.hat) === 'o', id);
      if (D.ohat && inten > 0.9 && hit(D.ohat)) this.hat(t, 0.25, true, id);
      if (D.rim && hit(D.rim) && inten > 0.6) this.rim(t, 0.3);
      if (D.ghost && hit(D.ghost)) this.snare(t, 0.15, id);
      if (D.shaker && hit(D.shaker) && inten > 0.6) this.shaker(t, s % 4 === 2 ? 0.12 : 0.06);
      if (D.guach && hit(D.guach)) this.guacharaca(t, s % 4 === 0 ? 0.32 : 0.16, s % 4 === 0);
      if (D.conga && hit(D.conga)) this.conga(t, hit(D.conga) === 'o' ? 0.5 : 0.35, hit(D.conga) === 'o');
      if (D.bell && hit(D.bell) && inten > 0.6) this.bell(t, 0.12);
      if (fill && kickOn && s % 2 === 0) this.snare(t, 0.35 + (s - 12) * 0.08, id);
    }
    if (g.crackle && s % 4 === 0) this.crackle(t, song.stepDur * 4);
    // Bajo
    const bassBase = song.root;
    const rootM = song.degToMidi(deg, bassBase);
    if (sec.name !== 'intro' || id === 'lofi') {
      switch (g.bass) {
        case 'pump8':
          if (s % 2 === 0) this.bassSaw(t, song.stepDur * 1.6, mtof(rootM + (s % 4 === 2 ? 12 : 0)), 0.32, 900);
          break;
        case 'dembow':
          if ([0, 3, 6, 8, 11, 14].includes(s)) this.bassSub(t, song.stepDur * (s === 0 || s === 8 ? 3 : 2.5), mtof(rootM - 12 + 12), 0.55);
          break;
        case 'soft':
          if (s === 0 || s === 10 || (s === 7 && r.chance(0.4))) this.bassSub(t, song.stepDur * 5, mtof(rootM), 0.42);
          break;
        case 'acid': {
          const a = song.acidPattern[s];
          if (a.on) {
            const cut = 400 + 1800 * (0.5 + 0.5 * Math.sin((bar * 16 + s) / 64 * Math.PI)) * (0.5 + inten * 0.5);
            this.bassAcid(t, song.stepDur * (a.slide ? 1.6 : 0.85), mtof(rootM + a.oct), a.acc ? 0.36 : 0.26, cut);
          }
          break;
        }
        case 'cumbia': {
          const fifth = song.degToMidi(deg + 4, bassBase) - 12;
          if (s === 0 || s === 8) this.bassSaw(t, song.stepDur * 3.2, mtof(rootM), 0.34, 650);
          if (s === 6 || s === 14) this.bassSaw(t, song.stepDur * 1.6, mtof(fifth), 0.28, 650);
          break;
        }
        case 'tri8':
          if (s % 2 === 0) this.bassTri(t, song.stepDur * 1.7, mtof(rootM + (s % 4 === 2 ? 12 : 0)), 0.34);
          break;
      }
    }
    // Acordes
    const chordBase = song.root + 12;
    const nChord = g.sevenths ? 4 : 3;
    const chordM = song.chord(deg, chordBase, nChord).map((m) => (m < chordBase + 2 ? m + 12 : m));
    switch (g.chords) {
      case 'pad':
        if (s === 0) this.pad(t, song.barDur * 0.98, chordM.map(mtof), 0.09 * (0.5 + inten * 0.5));
        break;
      case 'epiano':
        if (s === 0) this.epiano(t, song.barDur * 0.95, chordM.map(mtof), 0.11);
        if (s === 10 && r.chance(0.4)) this.epiano(t, song.stepDur * 6, chordM.slice(1).map(mtof), 0.06);
        break;
      case 'pluck':
        if ([0, 3, 6, 10].includes(s) && sec.name !== 'intro') this.pluck(t, song.stepDur * 1.5, mtof(chordM[(s / 3) % chordM.length | 0] + 12), 0.1);
        if (s === 0) this.pad(t, song.barDur * 0.98, chordM.map(mtof), 0.04);
        break;
      case 'stab':
        if (inten > 0.6 && bar % 2 === 1 && (s === 2 || s === 10)) this.stab(t, song.stepDur * 1.2, chordM.map(mtof), 0.1);
        if (sec.name === 'break' && s === 0) this.pad(t, song.barDur, chordM.map(mtof), 0.06);
        break;
      case 'chuck':
        if (s % 4 === 2) this.accordionChord(t, song.stepDur * 1.3, chordM.map(mtof), 0.07);
        break;
    }
    // Arpegio
    if (g.arp && (sec.name === 'verse' || sec.name === 'chorus' || (id === 'casete' && sec.name !== 'intro'))) {
      const seq = [0, 1, 2, 1, 0, 1, 2, 3];
      const note = chordM[seq[s % 8] % chordM.length] + (seq[s % 8] === 3 ? 12 : 0) + 12;
      if (id === 'casete') this.pulseNote(t, song.stepDur * 0.8, mtof(note), 0.06, this.pulse25);
      else this.arp(t, song.stepDur * 0.8, mtof(note), 0.05 * (0.6 + inten * 0.4));
    }
    // Melodía
    if (g.lead && (sec.name === 'chorus' || (sec.name === 'verse' && bar % 4 >= 2) || (id === 'cumbia' && sec.name === 'verse'))) {
      const motif = sec.name === 'chorus' ? song.motif : song.motifB;
      const local = (bar % 2) * 16 + s;
      const leadBase = song.root + 24 + (id === 'casete' ? 12 : 0);
      for (const n of motif) {
        if (n.step !== local) continue;
        let m = song.degToMidi(n.deg, leadBase);
        // en tiempos fuertes, ajustar a una nota del acorde
        if (s % 8 === 0) {
          const chordPcs = song.chord(deg, leadBase, 3);
          let best = m, bd = 99;
          for (const c of chordPcs) for (const o of [-12, 0, 12]) {
            const d = Math.abs(c + o - m);
            if (d < bd) {
              bd = d;
              best = c + o;
            }
          }
          m = best;
        }
        const dur = n.len * song.stepDur * 0.92;
        const f = mtof(m);
        switch (g.lead) {
          case 'saw': this.leadSaw(t, dur, f, 0.07); break;
          case 'pluck': this.pluck(t, dur * 0.8, f, 0.11); break;
          case 'soft': if (sec.name === 'chorus') this.softLead(t, dur, f, 0.06); break;
          case 'accordion': this.accordion(t, dur, f, 0.09); break;
          case 'pulse': this.pulseNote(t, dur, f, 0.07, this.pulse125, true); break;
        }
      }
    }
  }

  _ident(t, song) {
    const base = song.root + 24;
    const ch = song.chord(0, base, 3);
    [...ch, ch[0] + 12].forEach((m, i) => {
      this._tone('triangle', mtof(m), t + i * 0.12, 0.9, 0.08, this.bus, { attack: 0.005, rev: 0.6 });
      this._tone('sine', mtof(m + 12), t + i * 0.12, 0.6, 0.04, this.bus, { attack: 0.005, rev: 0.6 });
    });
    this.A._noiseBurst(t, 1.2, this.bus, { gain: 0.05, type: 'bandpass', f: 400, f1: 5000, q: 0.8, attack: 0.3 });
    this.pad(t + 0.5, 2.2, ch.map((m) => mtof(m - 12)), 0.06);
  }

  // ------------------------------------------------------------ instrumentos
  _tone(type, f, t, dur, vol, dest, { attack = 0.005, release = 0.08, detune = 0, rev = 0, delay = 0, wave = null, vib = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
    g.gain.exponentialRampToValueAtTime(0.0006, t + dur + release);
    o.connect(g);
    g.connect(dest);
    let lfo = null;
    if (vib) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const lg = ctx.createGain();
      lg.gain.value = f * vib;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + release + 0.05);
    }
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s).connect(this.revSend);
    }
    if (delay) {
      const s = ctx.createGain();
      s.gain.value = delay;
      g.connect(s).connect(this.delaySend);
    }
    o.start(t);
    o.stop(t + dur + release + 0.05);
    return { o, g };
  }

  kick(t, v, id) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const hi = id === 'muelle' ? 130 : id === 'calle' ? 110 : 150;
    o.frequency.setValueAtTime(hi, t);
    o.frequency.exponentialRampToValueAtTime(id === 'calle' ? 42 : 48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (id === 'calle' ? 0.45 : 0.32));
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.5);
    this.A._noiseBurst(t, 0.015, this.bus, { gain: v * 0.3, type: 'highpass', f: 3000 });
  }
  snare(t, v, id) {
    const A = this.A;
    const rev = id === 'indigo' ? 0.8 : id === 'lofi' ? 0.2 : 0.3;
    if (id === 'calle' || id === 'muelle') {
      // palmas
      for (let i = 0; i < 3; i++) A._noiseBurst(t + i * 0.011, 0.09, this.bus, { gain: v * 0.45, type: 'bandpass', f: 1200, q: 1.2 });
      const s = this.ctx.createGain();
      s.gain.value = rev;
      s.connect(this.revSend);
      A._noiseBurst(t, 0.15, s, { gain: v * 0.3, type: 'bandpass', f: 1200, q: 1 });
      return;
    }
    if (id === 'casete') {
      A._noiseBurst(t, 0.1, this.bus, { gain: v * 0.35, type: 'highpass', f: 1500 });
      return;
    }
    A._noiseBurst(t, id === 'lofi' ? 0.12 : 0.2, this.bus, { gain: v * 0.42, type: 'bandpass', f: id === 'lofi' ? 1600 : 1900, q: 0.7 });
    this._tone('triangle', 190, t, 0.06, v * 0.25, this.bus, { attack: 0.001, release: 0.06 });
    const s = this.ctx.createGain();
    s.gain.value = rev;
    s.connect(this.revSend);
    A._noiseBurst(t, 0.25, s, { gain: v * 0.35, type: 'bandpass', f: 1900, q: 0.7 });
  }
  hat(t, v, open, id) {
    this.A._noiseBurst(t, open ? 0.22 : 0.04, this.bus, { gain: v * (id === 'lofi' ? 0.5 : 0.7), type: 'highpass', f: id === 'casete' ? 6000 : 7500, q: 0.5 });
  }
  rim(t, v) {
    this._tone('square', 1700, t, 0.02, v * 0.2, this.bus, { attack: 0.0005, release: 0.03 });
  }
  shaker(t, v) {
    this.A._noiseBurst(t, 0.05, this.bus, { gain: v, type: 'bandpass', f: 6500, q: 1 });
  }
  guacharaca(t, v, long) {
    // raspado: ráfagas rápidas de ruido filtrado
    const n = long ? 5 : 2;
    for (let i = 0; i < n; i++) this.A._noiseBurst(t + i * 0.018, 0.03, this.bus, { gain: v * (0.6 + i * 0.1), type: 'bandpass', f: 4200 + i * 300, q: 2.5 });
  }
  conga(t, v, open) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f = open ? 220 : 330;
    o.frequency.setValueAtTime(f * 1.4, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.28 : 0.12));
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.3);
    if (!open) this.A._noiseBurst(t, 0.03, this.bus, { gain: v * 0.2, type: 'bandpass', f: 2000 });
  }
  bell(t, v) {
    this._tone('square', 560, t, 0.06, v * 0.3, this.bus, { attack: 0.001, release: 0.08 });
    this._tone('square', 845, t, 0.05, v * 0.2, this.bus, { attack: 0.001, release: 0.06 });
  }
  crackle(t, dur) {
    const n = 3;
    for (let i = 0; i < n; i++) if (Math.random() < 0.7) this.A._noiseBurst(t + Math.random() * dur, 0.004, this.bus, { gain: 0.05 + Math.random() * 0.06, type: 'highpass', f: 2000 });
    this.A._noiseBurst(t, dur, this.bus, { gain: 0.012, type: 'bandpass', f: 3000, q: 0.5, attack: 0.05 });
  }
  bassSaw(t, dur, f, v, cut) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut * 2, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.6, t + dur);
    lp.Q.value = 2;
    lp.connect(this.bus);
    this._tone('sawtooth', f, t, dur, v * 0.5, lp, { attack: 0.004, release: 0.05 });
    this._tone('square', f / 2, t, dur, v * 0.25, lp, { attack: 0.004, release: 0.05 });
  }
  bassSub(t, dur, f, v) {
    this._tone('sine', f, t, dur, v * 0.75, this.bus, { attack: 0.006, release: 0.08 });
    this._tone('triangle', f * 2, t, dur * 0.5, v * 0.12, this.bus, { attack: 0.004, release: 0.05 });
  }
  bassAcid(t, dur, f, v, cut) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 11;
    lp.frequency.setValueAtTime(cut * 2.2, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, cut * 0.4), t + dur);
    lp.connect(this.bus);
    this._tone('sawtooth', f, t, dur, v * 0.32, lp, { attack: 0.003, release: 0.03 });
  }
  bassTri(t, dur, f, v) {
    this._tone('triangle', f, t, dur, v * 0.6, this.bus, { attack: 0.002, release: 0.02 });
  }
  pad(t, dur, freqs, v) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(1800, t + dur * 0.5);
    lp.frequency.linearRampToValueAtTime(1100, t + dur);
    lp.connect(this.bus);
    const s = ctx.createGain();
    s.gain.value = 0.5;
    lp.connect(s).connect(this.revSend);
    for (const f of freqs) {
      this._tone('sawtooth', f, t, dur, v * 0.5, lp, { attack: Math.min(0.5, dur * 0.3), release: 0.4, detune: -8 });
      this._tone('sawtooth', f, t, dur, v * 0.5, lp, { attack: Math.min(0.5, dur * 0.3), release: 0.4, detune: 8 });
    }
  }
  epiano(t, dur, freqs, v) {
    const ctx = this.ctx;
    for (const f of freqs) {
      const car = ctx.createOscillator();
      car.type = 'sine';
      car.frequency.value = f;
      car.detune.value = (Math.random() - 0.5) * 12;
      const mod = ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = f * 2;
      const mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.4, t);
      mg.gain.exponentialRampToValueAtTime(f * 0.08, t + 0.6);
      mod.connect(mg).connect(car.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.35, t + 0.01);
      g.gain.exponentialRampToValueAtTime(v * 0.12, t + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0006, t + dur + 0.3);
      car.connect(g).connect(this.bus);
      const s = ctx.createGain();
      s.gain.value = 0.25;
      g.connect(s).connect(this.revSend);
      car.start(t);
      mod.start(t);
      car.stop(t + dur + 0.35);
      mod.stop(t + dur + 0.35);
    }
  }
  pluck(t, dur, f, v) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + Math.min(0.3, dur));
    lp.connect(this.bus);
    const s = ctx.createGain();
    s.gain.value = 0.3;
    lp.connect(s).connect(this.delaySend);
    this._tone('sawtooth', f, t, dur, v * 0.6, lp, { attack: 0.002, release: 0.1 });
    this._tone('square', f * 1.005, t, dur, v * 0.3, lp, { attack: 0.002, release: 0.1 });
  }
  stab(t, dur, freqs, v) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(600, t + dur);
    lp.connect(this.bus);
    const s = ctx.createGain();
    s.gain.value = 0.6;
    lp.connect(s).connect(this.delaySend);
    for (const f of freqs) this._tone('sawtooth', f, t, dur, v * 0.45, lp, { attack: 0.002, release: 0.06 });
  }
  arp(t, dur, f, v) {
    this._tone('square', f, t, dur, v * 0.5, this.bus, { attack: 0.002, release: 0.04, delay: 0.35, rev: 0.2 });
  }
  leadSaw(t, dur, f, v) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    lp.connect(this.bus);
    this._tone('sawtooth', f, t, dur, v * 0.55, lp, { attack: 0.01, release: 0.12, vib: 0.006, delay: 0.45, rev: 0.35 });
    this._tone('sawtooth', f, t, dur, v * 0.4, lp, { attack: 0.01, release: 0.12, detune: 12 });
  }
  softLead(t, dur, f, v) {
    this._tone('triangle', f, t, dur, v * 0.6, this.bus, { attack: 0.03, release: 0.2, vib: 0.004, rev: 0.4 });
  }
  accordion(t, dur, f, v) {
    const ctx = this.ctx;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 2800;
    bp.connect(this.bus);
    this._tone('square', f, t, dur, v * 0.35, bp, { attack: 0.02, release: 0.06, vib: 0.008, rev: 0.25 });
    this._tone('sawtooth', f, t, dur, v * 0.25, bp, { attack: 0.02, release: 0.06, detune: 14 });
    this._tone('square', f * 2, t, dur, v * 0.08, bp, { attack: 0.02, release: 0.06, detune: -7 });
  }
  accordionChord(t, dur, freqs, v) {
    for (const f of freqs) this.accordion(t, dur, f, v * 0.55);
  }
  pulseNote(t, dur, f, v, wave, vib = false) {
    this._tone('square', f, t, dur, v * 0.55, this.bus, { attack: 0.002, release: 0.03, wave, vib: vib ? 0.01 : 0 });
  }
}

export function createRadio(A) {
  return new Radio(A);
}

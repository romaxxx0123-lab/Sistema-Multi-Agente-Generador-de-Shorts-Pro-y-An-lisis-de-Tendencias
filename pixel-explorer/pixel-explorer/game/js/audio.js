// Procedural audio: every sound is synthesised with WebAudio at runtime.
// No sample files, so the single-file build stays self-contained.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.enabled = true;
    this.musicOn = true;
    this.started = false;
    this.noiseBuf = null;
    this._musicTimer = 0;
    this._step = 0;
    this._ambTimer = 0;
  }

  /** Must be called from a user gesture (browsers block autoplay). */
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.34;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.85;
    this.sfxGain.connect(this.master);

    // shared white-noise buffer for wind, steps, water
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startAmbience();
    this.started = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  // ------------------------------------------------------------ helpers
  _env(g, t0, a, d, peak = 1) {
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  tone(freq, { type = 'sine', dur = 0.2, atk = 0.008, vol = 0.3,
               slide = 0, dest = null, detune = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    if (detune) o.detune.value = detune;
    this._env(g, t0, atk, dur, vol);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t0); o.stop(t0 + dur + atk + 0.05);
  }

  noise({ dur = 0.15, vol = 0.25, type = 'bandpass', freq = 900, q = 1,
          sweep = 0 } = {}) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this.t;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq + sweep), t0 + dur);
    const g = this.ctx.createGain();
    this._env(g, t0, 0.005, dur, vol);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t0); s.stop(t0 + dur + 0.08);
  }

  // ------------------------------------------------------------- ambience
  startAmbience() {
    // continuous low wind bed
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 0.6;
    const g = this.ctx.createGain();
    g.gain.value = 0.055;
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start();
    this.windGain = g;
    this.windFilter = f;

    // slow LFO so the wind breathes
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(g.gain);
    lfo.start();
  }

  /** Wind intensity follows biome + weather. */
  setAmbience(kind, night) {
    if (!this.windGain) return;
    const t0 = this.t;
    const map = { rock: [700, .10], snow: [520, .12], ash: [380, .09],
                  desert: [640, .08], forest: [300, .05], swamp: [260, .05],
                  water: [340, .07], default: [420, .055] };
    const [fq, vol] = map[kind] || map.default;
    this.windFilter.frequency.linearRampToValueAtTime(fq, t0 + 1.2);
    this.windGain.gain.linearRampToValueAtTime(night ? vol * 1.4 : vol, t0 + 1.2);
  }

  /** Occasional one-shot nature sounds. */
  tickAmbience(dt, biome, night) {
    if (!this.ctx || !this.enabled) return;
    this._ambTimer -= dt;
    if (this._ambTimer > 0) return;
    this._ambTimer = 5 + Math.random() * 11;
    const r = Math.random();
    if (night) {
      if (r < 0.4) {                                   // owl
        this.tone(420, { type: 'sine', dur: 0.20, vol: 0.09, slide: -80 });
        setTimeout(() => this.tone(360, { type: 'sine', dur: 0.28, vol: 0.08, slide: -60 }), 260);
      } else if (r < 0.6) {                            // distant howl
        this.tone(300, { type: 'sawtooth', dur: 1.1, vol: 0.05, slide: 90 });
      } else if (r < 0.8) {                            // crickets
        for (let i = 0; i < 5; i++)
          setTimeout(() => this.noise({ dur: 0.03, vol: 0.05, freq: 5200, q: 22 }), i * 130);
      }
    } else {
      if (r < 0.55) {                                  // birdsong
        const base = 1500 + Math.random() * 900;
        const n = 2 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) {
          setTimeout(() => this.tone(base * (1 + i * 0.12), {
            type: 'sine', dur: 0.09, vol: 0.07, slide: 260,
          }), i * 110);
        }
      } else if (r < 0.75) {                           // rustle
        this.noise({ dur: 0.4, vol: 0.05, freq: 1800, q: 0.8, sweep: -900 });
      }
    }
  }

  // ---------------------------------------------------------------- SFX
  step(surface) {
    if (!this.ctx || !this.enabled) return;
    this._step = (this._step + 1) % 2;
    const v = this._step ? 1 : 0.82;
    const s = {
      grass:  { freq: 2100, q: 1.2, dur: 0.075, vol: 0.085 },
      sand:   { freq: 1500, q: 0.8, dur: 0.09,  vol: 0.075 },
      rock:   { freq: 3200, q: 2.5, dur: 0.055, vol: 0.095 },
      snow:   { freq: 1100, q: 1.6, dur: 0.10,  vol: 0.075 },
      water:  { freq: 900,  q: 0.7, dur: 0.16,  vol: 0.11  },
      wood:   { freq: 800,  q: 3.0, dur: 0.07,  vol: 0.09  },
    }[surface] || { freq: 2000, q: 1.2, dur: 0.08, vol: 0.08 };
    this.noise({ dur: s.dur, vol: s.vol * v, freq: s.freq, q: s.q, sweep: -s.freq * 0.45 });
  }

  pickup(kind) {
    const base = { berry: 720, mushroom: 620, wood: 380, stone: 300,
                   flower: 820, ore: 460, crystal: 1000 }[kind] || 640;
    this.tone(base, { type: 'triangle', dur: 0.09, vol: 0.16 });
    setTimeout(() => this.tone(base * 1.5, { type: 'triangle', dur: 0.11, vol: 0.12 }), 70);
  }

  chop()  { this.noise({ dur: 0.12, vol: 0.2, freq: 420, q: 1.4, sweep: -200 });
            this.tone(150, { type: 'square', dur: 0.09, vol: 0.1, slide: -60 }); }
  mine()  { this.noise({ dur: 0.10, vol: 0.22, freq: 2600, q: 3.5, sweep: -1800 });
            this.tone(240, { type: 'square', dur: 0.07, vol: 0.09, slide: -90 }); }

  chest() {
    this.noise({ dur: 0.2, vol: 0.14, freq: 700, q: 1.2, sweep: 500 });
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() =>
      this.tone(n, { type: 'triangle', dur: 0.22, vol: 0.15 }), i * 85));
  }

  shrine() {
    const notes = [392, 523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => {
      this.tone(n, { type: 'sine', dur: 0.9, vol: 0.13 });
      this.tone(n * 2, { type: 'sine', dur: 0.7, vol: 0.05 });
    }, i * 120));
  }

  quest() {
    const notes = [659, 784, 988];
    notes.forEach((n, i) => setTimeout(() =>
      this.tone(n, { type: 'triangle', dur: 0.3, vol: 0.16 }), i * 100));
  }

  levelUp() {
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((n, i) => setTimeout(() => {
      this.tone(n, { type: 'triangle', dur: 0.35, vol: 0.17 });
      this.tone(n * 1.5, { type: 'sine', dur: 0.3, vol: 0.07 });
    }, i * 90));
  }

  discover() {
    [440, 587, 740].forEach((n, i) => setTimeout(() =>
      this.tone(n, { type: 'sine', dur: 0.5, vol: 0.12 }), i * 130));
  }

  hurt() {
    this.tone(220, { type: 'sawtooth', dur: 0.18, vol: 0.2, slide: -120 });
    this.noise({ dur: 0.12, vol: 0.14, freq: 700, q: 1, sweep: -400 });
  }

  growl() {
    this.tone(90, { type: 'sawtooth', dur: 0.5, vol: 0.11, slide: 30 });
    this.noise({ dur: 0.5, vol: 0.06, freq: 300, q: 2, sweep: -120 });
  }

  heal() {
    [523, 659, 784].forEach((n, i) => setTimeout(() =>
      this.tone(n, { type: 'sine', dur: 0.4, vol: 0.11 }), i * 110));
  }

  ui(kind) {
    if (kind === 'move') this.tone(660, { type: 'square', dur: 0.03, vol: 0.05 });
    else if (kind === 'select') { this.tone(880, { type: 'square', dur: 0.05, vol: 0.08 });
      setTimeout(() => this.tone(1320, { type: 'square', dur: 0.06, vol: 0.06 }), 40); }
    else if (kind === 'back') this.tone(400, { type: 'square', dur: 0.06, vol: 0.06, slide: -120 });
    else if (kind === 'tick') this.tone(1200, { type: 'square', dur: 0.02, vol: 0.04 });
  }

  // -------------------------------------------------------------- music
  /** Sparse generative score: a slow pad plus a wandering pentatonic melody. */
  tickMusic(dt, night, danger) {
    if (!this.ctx || !this.enabled || !this.musicOn) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = danger ? 1.6 : (night ? 5.0 : 3.6);

    const SCALE_DAY = [0, 2, 4, 7, 9];            // major pentatonic
    const SCALE_NIGHT = [0, 3, 5, 7, 10];         // minor pentatonic
    const scale = night || danger ? SCALE_NIGHT : SCALE_DAY;
    const root = danger ? 146.83 : (night ? 174.61 : 196.00);

    // pad chord
    const t0 = this.t;
    for (const semi of [0, scale[2], scale[4]]) {
      const f = root * Math.pow(2, semi / 12);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = danger ? 700 : 1200;
      o.type = 'triangle'; o.frequency.value = f;
      o.detune.value = (Math.random() - 0.5) * 12;
      const dur = danger ? 1.5 : 3.4;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.8);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(lp); lp.connect(g); g.connect(this.musicGain);
      o.start(t0); o.stop(t0 + dur + 0.1);
    }

    // melody note, sometimes
    if (Math.random() < (danger ? 0.35 : 0.62)) {
      const semi = scale[(Math.random() * scale.length) | 0];
      const oct = Math.random() < 0.35 ? 4 : 2;
      const f = root * oct * Math.pow(2, semi / 12);
      setTimeout(() => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const tt = this.t;
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(0.075, tt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 1.5);
        o.connect(g); g.connect(this.musicGain);
        o.start(tt); o.stop(tt + 1.6);
      }, 400 + Math.random() * 900);
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicGain)
      this.musicGain.gain.linearRampToValueAtTime(on ? 0.34 : 0.0001, this.t + 0.4);
  }
  setEnabled(on) {
    this.enabled = on;
    if (this.master)
      this.master.gain.linearRampToValueAtTime(on ? 0.55 : 0.0001, this.t + 0.3);
  }
}

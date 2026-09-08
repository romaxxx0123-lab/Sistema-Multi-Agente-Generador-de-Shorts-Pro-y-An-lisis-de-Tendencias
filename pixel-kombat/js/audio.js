/* =========================================================
   audio.js — efectos de sonido sintetizados (sin archivos)
   ========================================================= */
const Sfx = {
  ctx: null,
  muted: false,
  quiet: false,   // silencio temporal (menus / demo de fondo)

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.28;
    this.master.connect(this.ctx.destination);
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.28;
    return this.muted;
  },

  tone(freq, dur, type = 'square', vol = 1, slide = 0) {
    if (!this.ctx || this.muted || this.quiet) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 1, hp = 800) {
    if (!this.ctx || this.muted || this.quiet) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = hp;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },

  /* --- sonidos del juego --- */
  whiff()   { this.noise(0.10, 0.25, 1600); },
  hit()     { this.noise(0.13, 0.8, 500); this.tone(150, 0.09, 'square', 0.5, -80); },
  bigHit()  { this.noise(0.22, 1.0, 260); this.tone(90, 0.20, 'sawtooth', 0.6, -50); },
  block()   { this.noise(0.08, 0.5, 2600); this.tone(700, 0.05, 'square', 0.25); },
  jump()    { this.tone(320, 0.12, 'square', 0.28, 260); },
  shoot()   { this.tone(520, 0.14, 'sawtooth', 0.3, -300); },
  wall()    { this.noise(0.3, 0.7, 180); this.tone(70, 0.3, 'square', 0.4); },
  heal()    { this.tone(520, 0.10, 'triangle', 0.3); setTimeout(() => this.tone(780, 0.14, 'triangle', 0.3), 90); },
  select()  { this.tone(660, 0.07, 'square', 0.3); },
  confirm() { this.tone(520, 0.07, 'square', 0.3); setTimeout(() => this.tone(880, 0.12, 'square', 0.3), 70); },
  super()   { this.tone(180, 0.5, 'sawtooth', 0.4, 700); this.noise(0.5, 0.4, 900); },
  ko()      { [330, 262, 196, 131].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'square', 0.42), i * 130)); },
  win()     { [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.38), i * 110)); },
  bell()    { this.tone(880, 0.18, 'square', 0.35); setTimeout(() => this.tone(1180, 0.22, 'square', 0.35), 120); },
  superEff() { [523, 659, 880, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.32), i * 55)); this.noise(0.18, 0.5, 1800); },
  /* Voz sintética: balbuceo con el timbre y el tono de cada personaje.
     No dice palabras, se entiende por el tono (como en las consolas viejas). */
  speak(v, syllables) {
    if (!this.ctx || this.muted || this.quiet) return;
    v = v || { f: 380, type: 'square', wob: 0.22, rate: 62 };
    const n = clamp(syllables || 3, 2, 6);
    for (let i = 0; i < n; i++) {
      const up = (i === n - 1 && v.up) ? 1.35 : 1;
      const f = v.f * up * (1 - v.wob / 2 + Math.random() * v.wob);
      setTimeout(() => {
        this.tone(f, 0.05 + Math.random() * 0.03, v.type, 0.17, v.slide || 0);
        if (v.growl) this.noise(0.05, 0.10, f * 2);
      }, i * (v.rate || 62));
    }
  },
  voice()   { this.speak(null, 3); },
  baby()    { [880, 990, 780, 990].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.3, 120), i * 190)); },
  punt()    { this.noise(0.18, 0.9, 400); this.tone(140, 0.25, 'sawtooth', 0.5, 900); },
  taunt()   { [440, 392, 440, 523].forEach((f, i) => setTimeout(() => this.tone(f, 0.10, 'triangle', 0.3), i * 90)); }
};

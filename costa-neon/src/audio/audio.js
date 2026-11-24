// Motor de audio 100% sintetizado (Web Audio): SFX posicionales, motores, sirenas, ambiente, truenos y radio procedural.
import { createRadio } from './radio.js';

const DUMMY = { update() {}, stop() {}, setRate() {} };

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.9, sfx: 0.9, music: 0.7, ambience: 0.7 };
    this.voices = [];
    this.maxVoices = 32;
    this.paused = false;
    this.loops = new Set();
    this.listener = { x: 0, y: 0, z: 0 };
    this.radio = createRadio(this);
    this._ambTargets = { city: 0, ocean: 0, rain: 0, wind: 0, night: 0 };
    this._ambEventT = 0;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      const g = (v) => {
        const n = ctx.createGain();
        n.gain.value = v;
        return n;
      };
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -6;
      this.limiter.knee.value = 6;
      this.limiter.ratio.value = 12;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.15;
      this.master = g(this.vol.master);
      this.master.connect(this.limiter);
      this.limiter.connect(ctx.destination);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.limiter.connect(this.analyser);
      this.sfxBus = g(this.vol.sfx);
      this.sfxBus.connect(this.master);
      this.worldBus = g(1);
      this.worldBus.connect(this.sfxBus);
      this.uiBus = g(0.8);
      this.uiBus.connect(this.sfxBus);
      this.ambBus = g(this.vol.ambience);
      this.ambBus.connect(this.worldBus);
      this.musicBus = g(this.vol.music);
      this.musicBus.connect(this.master);
      // Reverb urbana compartida
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.2, 2.6);
      this.reverbSend = g(0.32);
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.worldBus);
      // Buffers de ruido
      this.white = this._noise('white', 2);
      this.pink = this._noise('pink', 3);
      this.brown = this._noise('brown', 4);
      this._setupAmbience();
      this.radio._init();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      this.ctx = null;
    }
  }

  _noise(type, seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w;
        else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        }
      }
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 80 ? i / 80 : 1);
    }
    return buf;
  }

  setPaused(p) {
    this.paused = p;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.worldBus.gain.setTargetAtTime(p ? 0 : 1, t, 0.08);
    this.musicBus.gain.setTargetAtTime(this.vol.music * (p ? 0.5 : 1), t, 0.1);
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * (this.paused ? 0.5 : 1), t, 0.05);
    this.ambBus.gain.setTargetAtTime(this.vol.ambience, t, 0.05);
  }

  setListener(pos, fwd) {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const t = this.ctx.currentTime;
    try {
      if (L.positionX) {
        L.positionX.setTargetAtTime(pos.x, t, 0.02);
        L.positionY.setTargetAtTime(pos.y, t, 0.02);
        L.positionZ.setTargetAtTime(pos.z, t, 0.02);
        L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
        L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
        L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      } else {
        L.setPosition(pos.x, pos.y, pos.z);
        L.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
      }
    } catch (e) { /* listener no soportado */ }
  }

  _panner(pos, ref = 6, roll = 1, max = 400) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = max;
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    } else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  _dist(pos) {
    const l = this.listener;
    return Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z);
  }

  /** Crea la cadena de salida de un one-shot. Devuelve el nodo de entrada. */
  _out(opts, ref, roll, maxAudible, reverb = 0) {
    const ctx = this.ctx;
    const vol = opts.volume ?? 1;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (opts.pos) {
      if (this._dist(opts.pos) > maxAudible) return null;
      const p = this._panner(opts.pos, ref, roll);
      g.connect(p);
      p.connect(this.worldBus);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        p.connect(s);
        s.connect(this.reverbSend);
      }
    } else {
      g.connect(this.uiBus);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb * 0.5;
        g.connect(s);
        s.connect(this.reverbSend);
      }
    }
    return g;
  }

  _track(endTime, nodes) {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= this.maxVoices) {
      const old = this.voices.shift();
      for (const n of old.nodes) {
        try { n.stop && n.stop(); } catch (e) { /* ya detenido */ }
      }
    }
    this.voices.push({ end: endTime, nodes });
  }

  // ------------------------------------------------------------ primitivas
  _osc(type, f, t0, dur, dest, { gain = 0.3, attack = 0.004, decay = null, f1 = null, fTime = null, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + (fTime || dur));
    if (detune) o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + (decay || dur));
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + (decay || dur) + 0.05);
    return o;
  }

  _noiseBurst(t0, dur, dest, { gain = 0.5, type = 'bandpass', f = 1000, q = 0.8, f1 = null, attack = 0.002, buf = null, rate = 1 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.white;
    s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.setValueAtTime(f, t0);
    if (f1 != null) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    s.connect(fl);
    fl.connect(g);
    g.connect(dest);
    const off = Math.random() * 1.5;
    s.start(t0, off, dur + 0.1);
    return s;
  }

  // ------------------------------------------------------------ one-shots
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const fn = SFX[name];
    if (!fn) return;
    try {
      const t = this.ctx.currentTime + 0.005;
      const rate = (opts.rate || 1) * (1 + (Math.random() - 0.5) * 0.06);
      fn(this, t, opts, rate);
    } catch (e) { /* ignorar errores de síntesis */ }
  }

  // ------------------------------------------------------------ continuos
  createEngine(type = 'car') {
    if (!this.ctx) return { ...DUMMY };
    const ctx = this.ctx;
    const P = {
      car: { base: 36, range: 120, sub: 0.5, noise: 0.08, bright: 1, gain: 0.32 },
      sports: { base: 52, range: 230, sub: 0.5, noise: 0.06, bright: 1.6, gain: 0.34 },
      truck: { base: 24, range: 66, sub: 0.5, noise: 0.22, bright: 0.6, gain: 0.4 },
      bike: { base: 58, range: 270, sub: 0.5, noise: 0.08, bright: 1.8, gain: 0.3 },
      boat: { base: 42, range: 120, sub: 0.5, noise: 0.3, bright: 0.8, gain: 0.34 },
      heli: { base: 30, range: 40, sub: 0.5, noise: 0.6, bright: 0.5, gain: 0.5 },
    }[type] || {};
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = this._panner({ x: 0, y: 0, z: 0 }, 5, 1.1, 300);
    out.connect(pan);
    pan.connect(this.worldBus);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    shaper.connect(filter);
    filter.connect(out);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const o3 = ctx.createOscillator();
    o3.type = 'sawtooth';
    o3.detune.value = 9;
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    g1.gain.value = 0.35;
    g2.gain.value = 0.22 * P.sub;
    g3.gain.value = 0.18;
    o1.connect(g1).connect(shaper);
    o2.connect(g2).connect(shaper);
    o3.connect(g3).connect(shaper);
    const nz = ctx.createBufferSource();
    nz.buffer = type === 'truck' ? this.brown : this.pink;
    nz.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = type === 'heli' ? 380 : 700;
    nf.Q.value = type === 'heli' ? 1.6 : 0.6;
    const ng = ctx.createGain();
    ng.gain.value = P.noise;
    nz.connect(nf).connect(ng).connect(out);
    // Modulación de amplitud (rotor del helicóptero / golpeteo diésel)
    let am = null, amDepth = null;
    if (type === 'heli' || type === 'truck' || type === 'boat') {
      am = ctx.createOscillator();
      am.type = type === 'heli' ? 'sawtooth' : 'sine';
      am.frequency.value = type === 'heli' ? 14 : 18;
      amDepth = ctx.createGain();
      amDepth.gain.value = type === 'heli' ? 0.5 : 0.15;
      am.connect(amDepth).connect(ng.gain);
      am.start();
    }
    let turbine = null;
    if (type === 'heli') {
      turbine = ctx.createOscillator();
      turbine.type = 'sine';
      turbine.frequency.value = 2200;
      const tg = ctx.createGain();
      tg.gain.value = 0.02;
      turbine.connect(tg).connect(out);
      turbine.start();
    }
    const t0 = ctx.currentTime;
    for (const o of [o1, o2, o3]) o.start(t0);
    nz.start(t0);
    const self = this;
    let stopped = false;
    const h = {
      update({ rpm = 0, throttle = 0, pos = null, volume = 1 }) {
        if (stopped) return;
        const t = ctx.currentTime;
        const f = P.base + P.range * Math.max(0, Math.min(1.2, rpm));
        o1.frequency.setTargetAtTime(f, t, 0.03);
        o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
        o3.frequency.setTargetAtTime(f * 1.003, t, 0.03);
        filter.frequency.setTargetAtTime((350 + throttle * 1800 + rpm * 1400) * P.bright, t, 0.05);
        const vol = (0.2 + throttle * 0.45 + rpm * 0.35) * P.gain * volume;
        out.gain.setTargetAtTime(self.paused ? 0 : vol, t, 0.05);
        if (am) am.frequency.setTargetAtTime(type === 'heli' ? 9 + rpm * 10 : 10 + rpm * 30, t, 0.1);
        if (turbine) turbine.frequency.setTargetAtTime(1600 + rpm * 1200, t, 0.2);
        if (pos) {
          if (pan.positionX) {
            pan.positionX.setTargetAtTime(pos.x, t, 0.02);
            pan.positionY.setTargetAtTime(pos.y, t, 0.02);
            pan.positionZ.setTargetAtTime(pos.z, t, 0.02);
          } else pan.setPosition(pos.x, pos.y, pos.z);
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(0, t, 0.08);
        const end = t + 0.5;
        for (const n of [o1, o2, o3, nz, am, turbine]) {
          if (n) try { n.stop(end); } catch (e) { /* */ }
        }
        setTimeout(() => {
          try { out.disconnect(); pan.disconnect(); } catch (e) { /* */ }
        }, 800);
        self.loops.delete(h);
      },
    };
    this.loops.add(h);
    return h;
  }

  createSiren() {
    if (!this.ctx) return { ...DUMMY };
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = this._panner({ x: 0, y: 0, z: 0 }, 9, 0.9, 500);
    out.connect(pan);
    pan.connect(this.worldBus);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 1000;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.25;
    const depth = ctx.createGain();
    depth.gain.value = 400;
    lfo.connect(depth).connect(o.frequency);
    o.connect(lp).connect(out);
    o.start();
    lfo.start();
    let stopped = false;
    const self = this;
    const h = {
      update({ pos, mode = 'wail' }) {
        if (stopped) return;
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(mode === 'off' || self.paused ? 0 : 0.16, t, 0.05);
        lfo.frequency.setTargetAtTime(mode === 'yelp' ? 3.2 : 0.24, t, 0.05);
        o.frequency.setTargetAtTime(mode === 'yelp' ? 1100 : 1050, t, 0.05);
        if (pos) {
          if (pan.positionX) {
            pan.positionX.setTargetAtTime(pos.x, t, 0.02);
            pan.positionY.setTargetAtTime(pos.y, t, 0.02);
            pan.positionZ.setTargetAtTime(pos.z, t, 0.02);
          } else pan.setPosition(pos.x, pos.y, pos.z);
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        try { o.stop(ctx.currentTime + 0.3); lfo.stop(ctx.currentTime + 0.3); } catch (e) { /* */ }
        self.loops.delete(h);
      },
    };
    this.loops.add(h);
    return h;
  }

  createLoop(name) {
    if (!this.ctx) return { ...DUMMY };
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    let dest = this.worldBus;
    const pan = this._panner({ x: 0, y: 0, z: 0 }, 6, 1, 250);
    out.connect(pan);
    pan.connect(dest);
    const nodes = [];
    const src = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.start(0, Math.random() * 1.5);
      nodes.push(s);
      return s;
    };
    const filt = (type, f, q = 1) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    let base = 0.3;
    if (name === 'skid') {
      src(this.white).connect(filt('bandpass', 1400, 2.5)).connect(out);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 520;
      const og = ctx.createGain();
      og.gain.value = 0.05;
      o.connect(og).connect(out);
      o.start();
      nodes.push(o);
      base = 0.35;
    } else if (name === 'fire') {
      src(this.brown).connect(filt('lowpass', 700)).connect(out);
      const cr = src(this.white);
      const cg = ctx.createGain();
      cg.gain.value = 0.15;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 13;
      lfo.type = 'square';
      const lg = ctx.createGain();
      lg.gain.value = 0.12;
      lfo.connect(lg).connect(cg.gain);
      lfo.start();
      nodes.push(lfo);
      cr.connect(filt('highpass', 2500)).connect(cg).connect(out);
      base = 0.5;
    } else if (name === 'horn') {
      for (const f of [415, 520]) {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = 0.12;
        o.connect(og).connect(filt('lowpass', 1800)).connect(out);
        o.start();
        nodes.push(o);
      }
      base = 0.5;
    } else if (name === 'alarm') {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 950;
      const lfo = ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 2.2;
      const d = ctx.createGain();
      d.gain.value = 250;
      lfo.connect(d).connect(o.frequency);
      o.connect(filt('lowpass', 2500)).connect(out);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
      base = 0.18;
    } else if (name === 'wake') {
      src(this.pink).connect(filt('lowpass', 900)).connect(out);
      base = 0.6;
    } else if (name === 'wind') {
      out.disconnect();
      out.connect(this.worldBus);
      src(this.pink).connect(filt('bandpass', 600, 0.4)).connect(out);
      base = 0.5;
    } else return { ...DUMMY };
    let stopped = false;
    const self = this;
    const h = {
      update({ pos = null, volume = 1, rate = 1 }) {
        if (stopped) return;
        const t = ctx.currentTime;
        out.gain.setTargetAtTime(self.paused ? 0 : base * volume, t, 0.06);
        for (const n of nodes) if (n.playbackRate) n.playbackRate.setTargetAtTime(rate, t, 0.1);
        if (pos && pan.positionX) {
          pan.positionX.setTargetAtTime(pos.x, t, 0.02);
          pan.positionY.setTargetAtTime(pos.y, t, 0.02);
          pan.positionZ.setTargetAtTime(pos.z, t, 0.02);
        } else if (!pos && name !== 'wind' && pan.positionX) {
          const l = self.listener;
          pan.positionX.setTargetAtTime(l.x, t, 0.02);
          pan.positionY.setTargetAtTime(l.y, t, 0.02);
          pan.positionZ.setTargetAtTime(l.z, t, 0.02);
        }
      },
      stop() {
        if (stopped) return;
        stopped = true;
        out.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        for (const n of nodes) try { n.stop(ctx.currentTime + 0.4); } catch (e) { /* */ }
        self.loops.delete(h);
      },
    };
    this.loops.add(h);
    return h;
  }

  // ------------------------------------------------------------ ambiente
  _setupAmbience() {
    const ctx = this.ctx;
    const bed = (buf, type, f, q = 0.7) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      s.connect(fl).connect(g).connect(this.ambBus);
      s.start(0, Math.random() * 2);
      return { s, fl, g };
    };
    this.amb = {
      city: bed(this.brown, 'lowpass', 320),
      cityHi: bed(this.pink, 'bandpass', 1100, 0.4),
      ocean: bed(this.pink, 'lowpass', 520),
      rain: bed(this.white, 'bandpass', 3200, 0.35),
      rainLow: bed(this.pink, 'lowpass', 900),
      wind: bed(this.pink, 'bandpass', 420, 0.6),
    };
    // Oleaje: modulación lenta
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.12;
    const lg = ctx.createGain();
    lg.gain.value = 0;
    lfo.connect(lg).connect(this.amb.ocean.g.gain);
    lfo.start();
    this.oceanLfo = lg;
    const wl = ctx.createOscillator();
    wl.frequency.value = 0.07;
    const wg = ctx.createGain();
    wg.gain.value = 180;
    wl.connect(wg).connect(this.amb.wind.fl.frequency);
    wl.start();
  }

  setAmbience(a) {
    Object.assign(this._ambTargets, a);
    if (!this.ctx || !this.amb) return;
    const t = this.ctx.currentTime;
    const T = this._ambTargets;
    const night = T.night || 0;
    const set = (node, v) => node.g.gain.setTargetAtTime(v, t, 1.2);
    set(this.amb.city, T.city * (0.55 - night * 0.25));
    set(this.amb.cityHi, T.city * (0.05 - night * 0.03));
    set(this.amb.ocean, T.ocean * 0.32);
    this.oceanLfo.gain.setTargetAtTime(T.ocean * 0.22, t, 1.2);
    set(this.amb.rain, T.rain * 0.22);
    set(this.amb.rainLow, T.rain * 0.3);
    set(this.amb.wind, T.wind * 0.18);
  }

  /** Eventos ambientales esporádicos (pájaros, bocinas lejanas, grillos, gotas). Llamar cada frame. */
  update(dt) {
    if (!this.ready || this.paused) return;
    this._ambEventT -= dt;
    const T = this._ambTargets;
    if (this._ambEventT <= 0) {
      this._ambEventT = 0.6 + Math.random() * 2.2;
      const l = this.listener;
      const r = Math.random();
      const pos = { x: l.x + (Math.random() - 0.5) * 120, y: l.y + 8, z: l.z + (Math.random() - 0.5) * 120 };
      if (T.night > 0.5) {
        if (T.city > 0.1 && r < 0.6) SFX._crickets(this, this.ctx.currentTime, { pos, volume: 0.25 + T.city * 0.2 });
        else if (T.city > 0.3 && r < 0.68) SFX._distantHorn(this, this.ctx.currentTime, { pos, volume: 0.12 });
        else if (T.city > 0.3 && r < 0.72) SFX._distantSiren(this, this.ctx.currentTime, { pos, volume: 0.1 });
      } else {
        if (T.city > 0.1 && r < 0.45 && T.rain < 0.3) SFX._bird(this, this.ctx.currentTime, { pos, volume: 0.2 });
        else if (T.city > 0.3 && r < 0.6) SFX._distantHorn(this, this.ctx.currentTime, { pos, volume: 0.14 });
        else if (T.ocean > 0.3 && r < 0.8 && T.rain < 0.3) SFX._gull(this, this.ctx.currentTime, { pos, volume: 0.2 });
      }
      if (T.rain > 0.3) for (let i = 0; i < 4; i++) SFX._drop(this, this.ctx.currentTime + Math.random() * 0.5, { volume: 0.06 * T.rain });
    }
  }

  thunder(distance01 = 0.5) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const delay = 0.4 + distance01 * 4;
    const t = ctx.currentTime + delay;
    const g = ctx.createGain();
    g.gain.value = 0.9 - distance01 * 0.55;
    g.connect(this.worldBus);
    if (distance01 < 0.4) this._noiseBurst(t, 0.35, g, { gain: 0.6, type: 'highpass', f: 1200, attack: 0.001 });
    const dur = 3 + Math.random() * 3;
    const s = ctx.createBufferSource();
    s.buffer = this.brown;
    s.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180 + (1 - distance01) * 250;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(1, t + 0.08 + distance01 * 0.3);
    for (let k = 1; k < 8; k++) env.gain.linearRampToValueAtTime(0.4 + Math.random() * 0.6, t + (dur * k) / 8);
    env.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(lp).connect(env).connect(g);
    s.start(t);
    s.stop(t + dur + 0.1);
    const r = ctx.createGain();
    r.gain.value = 0.5;
    env.connect(r).connect(this.reverbSend);
  }

  /** Nivel de salida para diagnóstico. */
  meter() {
    if (!this.analyser) return { peak: 0, rms: 0 };
    const a = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(a);
    let peak = 0, sum = 0;
    for (const v of a) {
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / a.length) };
  }
}

// ---------------------------------------------------------------------------- recetas
const SFX = {
  pistol(A, t, o, r) {
    const out = A._out(o, 8, 0.9, 260, 0.5);
    if (!out) return;
    A._noiseBurst(t, 0.12, out, { gain: 0.9, type: 'bandpass', f: 1500 * r, q: 0.6, attack: 0.0008 });
    A._noiseBurst(t, 0.05, out, { gain: 0.6, type: 'highpass', f: 3500, attack: 0.0005 });
    A._osc('sine', 150 * r, t, 0.1, out, { gain: 0.8, f1: 45, attack: 0.001 });
    A._track(t + 0.6, []);
  },
  smg(A, t, o, r) {
    const out = A._out(o, 8, 0.9, 240, 0.35);
    if (!out) return;
    A._noiseBurst(t, 0.07, out, { gain: 0.8, type: 'bandpass', f: 1900 * r, q: 0.7, attack: 0.0006 });
    A._osc('sine', 170 * r, t, 0.06, out, { gain: 0.6, f1: 60, attack: 0.001 });
    A._track(t + 0.3, []);
  },
  shotgun(A, t, o, r) {
    const out = A._out(o, 9, 0.85, 300, 0.7);
    if (!out) return;
    A._noiseBurst(t, 0.3, out, { gain: 1, type: 'lowpass', f: 3000 * r, f1: 500, q: 0.5, attack: 0.0008 });
    A._osc('sine', 110 * r, t, 0.18, out, { gain: 0.9, f1: 35, attack: 0.001 });
    A._noiseBurst(t + 0.42, 0.06, out, { gain: 0.25, type: 'bandpass', f: 2600, q: 3 });
    A._noiseBurst(t + 0.52, 0.05, out, { gain: 0.25, type: 'bandpass', f: 1900, q: 3 });
    A._track(t + 0.8, []);
  },
  rifle(A, t, o, r) {
    const out = A._out(o, 9, 0.85, 320, 0.55);
    if (!out) return;
    A._noiseBurst(t, 0.1, out, { gain: 0.9, type: 'highpass', f: 900 * r, q: 0.5, attack: 0.0005 });
    A._noiseBurst(t, 0.16, out, { gain: 0.5, type: 'bandpass', f: 600, q: 0.7 });
    A._osc('sine', 130 * r, t, 0.09, out, { gain: 0.8, f1: 50, attack: 0.001 });
    A._track(t + 0.5, []);
  },
  sniper(A, t, o, r) {
    const out = A._out(o, 10, 0.7, 450, 0.9);
    if (!out) return;
    A._noiseBurst(t, 0.18, out, { gain: 1, type: 'highpass', f: 700 * r, attack: 0.0005 });
    A._noiseBurst(t, 0.9, out, { gain: 0.35, type: 'lowpass', f: 900, f1: 200 });
    A._osc('sine', 100, t, 0.2, out, { gain: 0.9, f1: 35 });
    A._track(t + 1.2, []);
  },
  rocket(A, t, o, r) {
    const out = A._out(o, 8, 0.9, 300, 0.3);
    if (!out) return;
    A._noiseBurst(t, 0.9, out, { gain: 0.7, type: 'bandpass', f: 400, f1: 2200, q: 1.2, attack: 0.02 });
    A._osc('sine', 90, t, 0.2, out, { gain: 0.6, f1: 40 });
    A._track(t + 1, []);
  },
  explosion(A, t, o, r) {
    const out = A._out(o, 14, 0.7, 700, 1.1);
    if (!out) return;
    A._noiseBurst(t, 2.6, out, { gain: 1, type: 'lowpass', f: 900 * r, f1: 90, q: 0.6, attack: 0.003, buf: A.brown });
    A._noiseBurst(t, 0.5, out, { gain: 0.8, type: 'lowpass', f: 3500, f1: 300, attack: 0.001 });
    A._osc('sine', 70 * r, t, 1.2, out, { gain: 1, f1: 25, attack: 0.002 });
    for (let i = 0; i < 6; i++) A._noiseBurst(t + 0.2 + Math.random() * 1.2, 0.08, out, { gain: 0.2, type: 'highpass', f: 2500 });
    A._track(t + 2.8, []);
  },
  grenade_bounce(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 60);
    if (!out) return;
    A._osc('triangle', 900 * r, t, 0.08, out, { gain: 0.4, f1: 500 });
  },
  punch(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 50);
    if (!out) return;
    A._osc('sine', 130 * r, t, 0.12, out, { gain: 0.9, f1: 55 });
    A._noiseBurst(t, 0.05, out, { gain: 0.5, type: 'lowpass', f: 1800 });
  },
  swing(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 40);
    if (!out) return;
    A._noiseBurst(t, 0.22, out, { gain: 0.35, type: 'bandpass', f: 500 * r, f1: 1600, q: 1.5, attack: 0.04 });
  },
  reload(A, t, o, r) {
    const out = A._out(o, 3, 1.4, 30);
    if (!out) return;
    A._noiseBurst(t, 0.04, out, { gain: 0.5, type: 'bandpass', f: 3200 * r, q: 4 });
    A._osc('square', 1400, t, 0.03, out, { gain: 0.08 });
    A._noiseBurst(t + 0.35, 0.05, out, { gain: 0.6, type: 'bandpass', f: 2200 * r, q: 4 });
    A._osc('square', 900, t + 0.35, 0.03, out, { gain: 0.08 });
  },
  empty(A, t, o, r) {
    const out = A._out(o, 3, 1.4, 25);
    if (!out) return;
    A._noiseBurst(t, 0.02, out, { gain: 0.5, type: 'bandpass', f: 4200 * r, q: 6 });
  },
  impact(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 80);
    if (!out) return;
    A._noiseBurst(t, 0.06, out, { gain: 0.5, type: 'bandpass', f: 2600 * r, q: 1.2 });
  },
  impact_metal(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 90);
    if (!out) return;
    A._noiseBurst(t, 0.03, out, { gain: 0.5, type: 'highpass', f: 3000 });
    A._osc('sine', 2200 * r, t, 0.25, out, { gain: 0.15, f1: 900 });
    A._osc('sine', 3100 * r, t, 0.15, out, { gain: 0.08, f1: 1500 });
  },
  impact_body(A, t, o, r) {
    const out = A._out(o, 4, 1.2, 50);
    if (!out) return;
    A._osc('sine', 90 * r, t, 0.12, out, { gain: 0.7, f1: 45 });
    A._noiseBurst(t, 0.06, out, { gain: 0.3, type: 'lowpass', f: 900 });
  },
  glass(A, t, o, r) {
    const out = A._out(o, 5, 1.1, 90, 0.3);
    if (!out) return;
    A._noiseBurst(t, 0.35, out, { gain: 0.4, type: 'highpass', f: 4000 });
    for (let i = 0; i < 9; i++) A._osc('sine', 2500 + Math.random() * 4000, t + Math.random() * 0.25, 0.12, out, { gain: 0.07 });
  },
  crash_light(A, t, o, r) {
    const out = A._out(o, 6, 1, 150, 0.2);
    if (!out) return;
    A._noiseBurst(t, 0.2, out, { gain: 0.7, type: 'lowpass', f: 2000 * r, f1: 400 });
    A._osc('sine', 120, t, 0.12, out, { gain: 0.6, f1: 60 });
    for (let i = 0; i < 3; i++) A._osc('triangle', 300 + Math.random() * 500, t, 0.25, out, { gain: 0.08 });
  },
  crash_heavy(A, t, o, r) {
    const out = A._out(o, 8, 0.9, 250, 0.5);
    if (!out) return;
    A._noiseBurst(t, 0.6, out, { gain: 1, type: 'lowpass', f: 2600 * r, f1: 300, buf: A.pink });
    A._osc('sine', 90, t, 0.25, out, { gain: 0.9, f1: 40 });
    for (let i = 0; i < 6; i++) A._osc('triangle', 250 + Math.random() * 900, t + Math.random() * 0.1, 0.5, out, { gain: 0.06 });
    A._noiseBurst(t + 0.15, 0.4, out, { gain: 0.25, type: 'highpass', f: 3500 });
    A._track(t + 0.8, []);
  },
  door(A, t, o, r) {
    const out = A._out(o, 4, 1.3, 40);
    if (!out) return;
    A._osc('sine', 110 * r, t, 0.1, out, { gain: 0.6, f1: 60 });
    A._noiseBurst(t, 0.05, out, { gain: 0.3, type: 'bandpass', f: 2200, q: 3 });
  },
  engine_start(A, t, o, r) {
    const out = A._out(o, 5, 1.1, 60);
    if (!out) return;
    A._osc('sawtooth', 70, t, 0.7, out, { gain: 0.15, f1: 120 });
    A._noiseBurst(t, 0.6, out, { gain: 0.15, type: 'bandpass', f: 600, q: 1 });
    A._osc('sawtooth', 45, t + 0.55, 0.5, out, { gain: 0.2, f1: 38 });
  },
  horn(A, t, o, r) {
    const out = A._out(o, 7, 1, 150);
    if (!out) return;
    A._osc('square', 415, t, 0.35, out, { gain: 0.12, attack: 0.01 });
    A._osc('square', 520, t, 0.35, out, { gain: 0.1, attack: 0.01 });
  },
  splash(A, t, o, r) {
    const out = A._out(o, 6, 1, 120, 0.2);
    if (!out) return;
    A._noiseBurst(t, 0.9, out, { gain: 0.8, type: 'lowpass', f: 3500 * r, f1: 400, attack: 0.01 });
    A._noiseBurst(t + 0.05, 0.5, out, { gain: 0.3, type: 'highpass', f: 2000 });
  },
  tire_pop(A, t, o, r) {
    const out = A._out(o, 6, 1, 120);
    if (!out) return;
    A._noiseBurst(t, 0.15, out, { gain: 0.9, type: 'lowpass', f: 2500, attack: 0.0005 });
  },
  nitro(A, t, o, r) {
    const out = A._out(o, 5, 1, 80);
    if (!out) return;
    A._noiseBurst(t, 0.8, out, { gain: 0.5, type: 'bandpass', f: 800, f1: 3000, q: 1, attack: 0.03 });
  },
  step(A, t, o, r) {
    const out = A._out(o, 2, 1.6, 22);
    if (!out) return;
    A._noiseBurst(t, 0.06, out, { gain: 0.22 * (o.volume ?? 1), type: 'lowpass', f: 700 * r, attack: 0.002, buf: A.pink });
    A._osc('sine', 80 * r, t, 0.04, out, { gain: 0.12 });
  },
  jump(A, t, o, r) {
    const out = A._out(o, 2, 1.6, 22);
    if (!out) return;
    A._noiseBurst(t, 0.08, out, { gain: 0.15, type: 'lowpass', f: 900, buf: A.pink });
  },
  land(A, t, o, r) {
    const out = A._out(o, 2, 1.6, 26);
    if (!out) return;
    A._osc('sine', 70 * r, t, 0.1, out, { gain: 0.4, f1: 40 });
    A._noiseBurst(t, 0.1, out, { gain: 0.25, type: 'lowpass', f: 800, buf: A.pink });
  },
  hurt(A, t, o, r) {
    const out = A._out(o, 3, 1.4, 40);
    if (!out) return;
    const f = 130 * r;
    const voice = A.ctx.createBiquadFilter();
    voice.type = 'bandpass';
    voice.frequency.value = 700;
    voice.Q.value = 2;
    voice.connect(out);
    A._osc('sawtooth', f, t, 0.2, voice, { gain: 0.35, f1: f * 0.8, attack: 0.01 });
  },
  swim(A, t, o, r) {
    const out = A._out(o, 3, 1.4, 30);
    if (!out) return;
    A._noiseBurst(t, 0.3, out, { gain: 0.25, type: 'lowpass', f: 1500 * r, f1: 500, attack: 0.03 });
  },
  ui_move(A, t) {
    A._osc('sine', 1700, t, 0.04, A.uiBus, { gain: 0.06 });
  },
  ui_select(A, t) {
    A._osc('sine', 880, t, 0.08, A.uiBus, { gain: 0.1 });
    A._osc('sine', 1320, t + 0.06, 0.12, A.uiBus, { gain: 0.1 });
  },
  ui_back(A, t) {
    A._osc('sine', 990, t, 0.07, A.uiBus, { gain: 0.09 });
    A._osc('sine', 660, t + 0.06, 0.1, A.uiBus, { gain: 0.09 });
  },
  ui_error(A, t) {
    A._osc('square', 180, t, 0.18, A.uiBus, { gain: 0.06 });
  },
  notify(A, t) {
    A._osc('sine', 1318, t, 0.15, A.uiBus, { gain: 0.12 });
    A._osc('sine', 1760, t + 0.1, 0.25, A.uiBus, { gain: 0.12 });
  },
  phone_ring(A, t) {
    const notes = [1318, 1568, 1976, 1568, 1318, 1568, 1976, 2349];
    notes.forEach((f, i) => A._osc('triangle', f, t + i * 0.1, 0.12, A.uiBus, { gain: 0.1 }));
    notes.forEach((f, i) => A._osc('triangle', f, t + 0.9 + i * 0.08, 0.1, A.uiBus, { gain: 0.08 }));
  },
  phone_open(A, t) {
    A._noiseBurst(t, 0.18, A.uiBus, { gain: 0.08, type: 'bandpass', f: 800, f1: 2400, q: 1, attack: 0.02 });
    A._osc('sine', 1046, t + 0.05, 0.1, A.uiBus, { gain: 0.06 });
  },
  phone_close(A, t) {
    A._noiseBurst(t, 0.16, A.uiBus, { gain: 0.08, type: 'bandpass', f: 2400, f1: 700, q: 1, attack: 0.02 });
  },
  shutter(A, t) {
    A._noiseBurst(t, 0.05, A.uiBus, { gain: 0.3, type: 'highpass', f: 2500 });
    A._noiseBurst(t + 0.08, 0.06, A.uiBus, { gain: 0.2, type: 'highpass', f: 2000 });
  },
  type(A, t) {
    A._osc('square', 2400, t, 0.012, A.uiBus, { gain: 0.03 });
  },
  pickup(A, t) {
    [880, 1109, 1319].forEach((f, i) => A._osc('triangle', f, t + i * 0.05, 0.15, A.uiBus, { gain: 0.12 }));
  },
  money(A, t) {
    A._osc('sine', 1568, t, 0.12, A.uiBus, { gain: 0.12 });
    A._osc('sine', 2093, t + 0.07, 0.3, A.uiBus, { gain: 0.12 });
  },
  health(A, t) {
    [523, 659, 784].forEach((f, i) => A._osc('sine', f, t + i * 0.07, 0.25, A.uiBus, { gain: 0.1 }));
  },
  armor(A, t) {
    for (let i = 0; i < 5; i++) A._osc('triangle', 1200 + i * 230, t + i * 0.03, 0.2, A.uiBus, { gain: 0.05 });
  },
  checkpoint(A, t) {
    A._osc('sine', 1046, t, 0.15, A.uiBus, { gain: 0.14 });
    A._osc('sine', 1568, t + 0.08, 0.3, A.uiBus, { gain: 0.12 });
  },
  mission_start(A, t) {
    for (let i = 0; i < 4; i++) A._osc('sawtooth', 110, t + i * 0.25, 0.2, A.uiBus, { gain: 0.08, attack: 0.01 });
    A._osc('sawtooth', 220, t + 1, 0.9, A.uiBus, { gain: 0.06, f1: 330, attack: 0.3 });
  },
  mission_pass(A, t) {
    const chords = [[523, 659, 784], [587, 740, 880], [659, 831, 988], [784, 988, 1175, 1568]];
    chords.forEach((ch, i) => ch.forEach((f) => {
      A._osc('sawtooth', f, t + i * 0.55, 0.6, A.uiBus, { gain: 0.035, attack: 0.03 });
      A._osc('triangle', f, t + i * 0.55, 0.65, A.uiBus, { gain: 0.05, attack: 0.02 });
    }));
    A._osc('sine', 1568, t + 1.65, 1.4, A.uiBus, { gain: 0.06, attack: 0.05 });
  },
  mission_fail(A, t) {
    [440, 415, 392, 330].forEach((f, i) => A._osc('triangle', f, t + i * 0.28, 0.4, A.uiBus, { gain: 0.1 }));
    A._osc('sawtooth', 110, t + 1.1, 0.9, A.uiBus, { gain: 0.05 });
  },
  wasted(A, t) {
    A._osc('sine', 120, t, 2.2, A.uiBus, { gain: 0.5, f1: 30, attack: 0.01 });
    A._noiseBurst(t, 2.2, A.uiBus, { gain: 0.4, type: 'lowpass', f: 600, f1: 60, buf: A.brown });
    const s = A.ctx.createGain();
    s.gain.value = 0.5;
    s.connect(A.reverbSend);
    A._osc('sawtooth', 220, t + 0.1, 1.8, s, { gain: 0.08, f1: 110 });
  },
  busted(A, t) {
    A._osc('square', 880, t, 0.15, A.uiBus, { gain: 0.06, f1: 1200 });
    A._osc('square', 1200, t + 0.16, 0.15, A.uiBus, { gain: 0.06, f1: 880 });
    [392, 311, 262].forEach((f, i) => A._osc('triangle', f, t + 0.4 + i * 0.25, 0.4, A.uiBus, { gain: 0.1 }));
  },
  wanted_up(A, t) {
    A._osc('sine', 98, t, 0.2, A.uiBus, { gain: 0.35, f1: 70 });
    A._osc('sine', 98, t + 0.22, 0.25, A.uiBus, { gain: 0.35, f1: 70 });
  },
  wanted_lost(A, t) {
    [523, 659, 784, 1046].forEach((f, i) => A._osc('sine', f, t + i * 0.09, 0.35, A.uiBus, { gain: 0.08 }));
  },
  level_up(A, t) {
    [523, 784, 1046, 1568].forEach((f, i) => A._osc('triangle', f, t + i * 0.08, 0.3, A.uiBus, { gain: 0.1 }));
  },
  purchase(A, t) {
    A._osc('sine', 2637, t, 0.5, A.uiBus, { gain: 0.1 });
    A._osc('sine', 3520, t + 0.05, 0.5, A.uiBus, { gain: 0.06 });
    A._noiseBurst(t + 0.12, 0.2, A.uiBus, { gain: 0.15, type: 'bandpass', f: 1500, q: 2 });
  },
  cassette(A, t) {
    for (let i = 0; i < 6; i++) A._osc('square', [1046, 1318, 1568, 2093, 1568, 2637][i], t + i * 0.06, 0.12, A.uiBus, { gain: 0.05 });
  },
  stunt(A, t) {
    [392, 523, 659, 784].forEach((f, i) => A._osc('sawtooth', f, t + i * 0.1, 0.5, A.uiBus, { gain: 0.05, attack: 0.02 }));
    A._osc('triangle', 1046, t + 0.4, 0.8, A.uiBus, { gain: 0.08 });
  },
  countdown(A, t) {
    A._osc('square', 880, t, 0.15, A.uiBus, { gain: 0.08 });
  },
  countdown_go(A, t) {
    A._osc('square', 1320, t, 0.45, A.uiBus, { gain: 0.09 });
  },
  achievement(A, t) {
    [1046, 1318, 1568, 2093].forEach((f, i) => A._osc('sine', f, t + i * 0.05, 0.9, A.uiBus, { gain: 0.06 }));
  },
  heartbeat(A, t) {
    A._osc('sine', 60, t, 0.15, A.uiBus, { gain: 0.5, f1: 40 });
    A._osc('sine', 55, t + 0.22, 0.15, A.uiBus, { gain: 0.35, f1: 38 });
  },
  // Ambientales internos
  _bird(A, t, o) {
    const out = A._out(o, 10, 1, 200);
    if (!out) return;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2800 + Math.random() * 1800;
    for (let i = 0; i < n; i++) A._osc('sine', base * (1 + Math.random() * 0.2), t + i * 0.12, 0.08, out, { gain: 0.12, f1: base * 1.25 });
  },
  _gull(A, t, o) {
    const out = A._out(o, 10, 1, 250);
    if (!out) return;
    for (let i = 0; i < 3; i++) A._osc('sawtooth', 1300, t + i * 0.28, 0.24, out, { gain: 0.03, f1: 900, attack: 0.03 });
  },
  _crickets(A, t, o) {
    const out = A._out(o, 10, 1, 200);
    if (!out) return;
    for (let i = 0; i < 8; i++) A._osc('sine', 4600, t + i * 0.055, 0.025, out, { gain: 0.04 });
  },
  _distantHorn(A, t, o) {
    const out = A._out(o, 40, 1, 400, 0.5);
    if (!out) return;
    A._osc('square', 380 + Math.random() * 80, t, 0.3 + Math.random() * 0.4, out, { gain: 0.05, attack: 0.02 });
  },
  _distantSiren(A, t, o) {
    const out = A._out(o, 40, 1, 500, 0.6);
    if (!out) return;
    A._osc('sawtooth', 700, t, 1.8, out, { gain: 0.03, f1: 1300, attack: 0.3 });
  },
  _drop(A, t, o) {
    A._osc('sine', 1800 + Math.random() * 2400, t, 0.03, A.ambBus, { gain: o.volume || 0.05 });
  },
};

export const SFX_NAMES = Object.keys(SFX).filter((k) => !k.startsWith('_'));

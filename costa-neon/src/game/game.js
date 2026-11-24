// Orquestador del juego: sistemas, estado y bucle principal.
import * as THREE from 'three';
import { Emitter, clamp } from '../core/utils.js';
import { Input } from '../core/input.js';
import { CameraRig } from '../core/camera.js';
import { HumanFactory, randomAppearance } from '../entities/human.js';
import { Player } from '../entities/player.js';
import { U } from '../world/shaders.js';
import { AudioSystem } from '../audio/audio.js';
import { WATER_LEVEL } from '../world/map.js';

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx);
    this.events = new Emitter();
    this.input = new Input(this.engine.canvas);
    this.camRig = new CameraRig(this.engine, this.collision, this.world);
    this.humanFactory = new HumanFactory(this.lib);
    this.state = 'playing';
    this.time = 0;
    this.realTime = 0;
    this.timeScale = 1;
    this.slowmo = 1;
    this.systems = [];
    this.settings = ctx.settings || {};
    this.player = new Player(this, ctx.appearance || { ...randomAppearance(), body: 0, hair: 'corto', shirt: 0x2e6f95, pants: 0x2d3e5e, shoes: 0xf0f0ee, sleeve: 0.45, legs: 1 });
    const home = this.world.poi('safehouse');
    this.player.teleport(home.x, home.z, Math.PI);
    this.camRig.yaw = Math.PI;
    this.audio = new AudioSystem();
    const unlock = () => this.audio.init();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    this.sky.on((ev) => { if (ev.type === 'lightning') this.audio.thunder(ev.distance); });
    this.player.on((ev) => this._playerSound(ev));
    this._overlay();
    this._last = performance.now();
    this._frame = this._frame.bind(this);
  }

  addSystem(sys) {
    this.systems.push(sys);
    return sys;
  }

  _overlay() {
    const ui = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'click-play';
    el.innerHTML = '<div class="click-play-card"><div class="cp-title">Pausa</div><div class="cp-sub">Hacé clic para jugar</div><div class="cp-hint">WASD mover · Mouse mirar · Shift correr · Espacio saltar · C agacharse · V cámara</div></div>';
    el.hidden = true;
    el.addEventListener('click', () => this.resume());
    ui.appendChild(el);
    this.overlayEl = el;
    this.engine.canvas.addEventListener('click', () => {
      if (this.state === 'playing') this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && !this.input.lockFailed && this.autoPauseOnUnlock !== false) this.pause();
    });
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.overlayEl.hidden = false;
    this.audio.setPaused(true);
    this.events.emit('pause');
  }

  resume() {
    this.state = 'playing';
    this.overlayEl.hidden = true;
    this.audio.init();
    this.audio.setPaused(false);
    this.input.requestLock();
    this._last = performance.now();
    this.events.emit('resume');
  }

  start() {
    requestAnimationFrame(this._frame);
  }

  _frame(now) {
    const rawDt = Math.min(0.1, Math.max(0, (now - this._last) / 1000));
    this._last = now;
    this.frameMs = rawDt * 1000;
    this.realTime += rawDt;
    const input = this.input;
    input.update();
    if (input.pressed('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    const playing = this.state === 'playing';
    const dt = playing ? rawDt * this.timeScale * this.slowmo : 0;
    this.time += dt;
    U.uTime.value += playing ? rawDt * this.slowmo : rawDt * 0.25;
    if (playing) {
      if (input.pressed('camera')) this.camRig.cycleZoom();
      this.player.update(dt, input, this.camRig);
      for (const s of this.systems) if (s.update) s.update(dt, this);
    }
    // Cámara
    const p = this.player;
    if (!p.vehicle) {
      this.camRig.mode = this.camRig.mode === 'free' ? 'free' : 'foot';
      this.camRig.update(rawDt, playing ? input : null, { target: p.pos, aiming: p.aiming, sprint: p.sprinting, swimming: p.swimming });
    }
    this.updateWorld(playing ? rawDt * this.slowmo : 0, rawDt);
    // Audio: oyente en la cámara
    const cam = this.engine.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, fwd);
    this.audio.update(rawDt);
    this._ambT = (this._ambT || 0) - rawDt;
    if (this._ambT <= 0) {
      this._ambT = 0.5;
      this._ambience(rawDt);
    }
    this.engine.render(rawDt);
    input.endFrame();
    requestAnimationFrame(this._frame);
  }

  _playerSound(ev) {
    const a = this.audio, p = this.player.pos;
    const pos = { x: p.x, y: p.y + 0.1, z: p.z };
    if (ev.type === 'step') a.play(ev.wading ? 'swim' : 'step', { pos, volume: Math.min(1, 0.35 + ev.speed * 0.1) });
    else if (ev.type === 'jump') a.play('jump', { pos });
    else if (ev.type === 'land') a.play('land', { pos, volume: ev.hard ? 1 : 0.5 });
    else if (ev.type === 'damage' && ev.amount > 4) a.play('hurt', { pos });
  }

  /** Mezcla de ambiente según la zona, el clima y la hora. */
  _ambience(dt) {
    const cam = this.engine.camera.position;
    const w = this.world;
    // cercanía al agua: muestreo grueso alrededor de la cámara
    let water = 0;
    for (const [dx, dz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [120, 0], [-120, 0], [0, 120], [0, -120]]) if (w.isWater(cam.x + dx, cam.z + dz)) water++;
    const ocean = Math.min(1, water / 4);
    const inCity = Math.abs(cam.x) < 520 && Math.abs(cam.z) < 520 ? 1 : 0.35;
    const alt = Math.max(0, cam.y - 20) / 120;
    this.audio.setAmbience({
      city: Math.max(0, inCity * (1 - ocean * 0.6) * (1 - alt)),
      ocean,
      rain: this.sky.w.rain,
      wind: Math.min(1, this.sky.w.wind * 0.6 + alt),
      night: this.sky.nightK,
    });
  }

  /** Sistemas del mundo (cielo, agua, mobiliario) que dependen de la cámara. */
  updateWorld(dt, rawDt) {
    const cam = this.engine.camera;
    const sky = this.sky;
    sky.update(dt);
    this.engine.setMainLight(sky.light.dir, sky.light.color, sky.light.intensity);
    sky.follow(cam);
    this.ocean.update(cam, sky.w.wind);
    const t = U.uTime.value;
    this.props.update(rawDt, t, sky.nightK, U.uLamps.value, cam.position);
    this.vegetation.update(cam.position);
    this.landmarks.update(rawDt, t, sky.nightK);
    this.weather.update(rawDt, cam, sky);
    const p = cam.position;
    const nearWater = (p.x > 380 || p.z > 400 || p.z < -400 || p.x < -420) && p.y < 160;
    this.reflection.enabled = !!this.engine.q.reflections;
    this.reflection.wanted = U.uWet.value > 0.12 || nearWater;
  }
}

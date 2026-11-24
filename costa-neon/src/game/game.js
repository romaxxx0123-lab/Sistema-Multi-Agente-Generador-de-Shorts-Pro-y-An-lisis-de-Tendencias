// Orquestador del juego: sistemas, estado y bucle principal.
import * as THREE from 'three';
import { Emitter, clamp } from '../core/utils.js';
import { Input } from '../core/input.js';
import { CameraRig } from '../core/camera.js';
import { HumanFactory, randomAppearance } from '../entities/human.js';
import { Player } from '../entities/player.js';
import { U } from '../world/shaders.js';

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
    this.events.emit('pause');
  }

  resume() {
    this.state = 'playing';
    this.overlayEl.hidden = true;
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
    this.engine.render(rawDt);
    input.endFrame();
    requestAnimationFrame(this._frame);
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

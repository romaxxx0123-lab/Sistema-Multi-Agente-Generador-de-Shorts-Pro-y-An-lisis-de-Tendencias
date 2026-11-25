// Orquestador del juego: sistemas, estado y bucle principal.
import * as THREE from 'three';
import { Emitter, clamp, damp, dampAngle, angleDiff, wrapAngle } from '../core/utils.js';
import { Input } from '../core/input.js';
import { CameraRig } from '../core/camera.js';
import { HumanFactory, randomAppearance } from '../entities/human.js';
import { Player } from '../entities/player.js';
import { Effects } from '../entities/effects.js';
import { VehicleManager } from '../entities/vehicles.js';
import { TrafficManager } from '../entities/traffic.js';
import { VehicleHud } from '../ui/vehicleHud.js';
import { ContactShadows } from '../entities/contactShadows.js';
import { ReflectionProbe } from '../world/reflectionProbe.js';
import { U } from '../world/shaders.js';
import { AudioSystem } from '../audio/audio.js';
import { STATIONS } from '../audio/radio.js';
import { WATER_LEVEL } from '../world/map.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _eul = new THREE.Euler();
const _probePos = new THREE.Vector3();
const _obj = new THREE.Object3D();
const _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const EXIT_BAIL_SPEED = 7; // m/s: por encima se salta del vehículo en marcha
const RADIO_OUTSIDE_RANGE = 22;

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
    // Inicio: en la vereda del departamento, mirando en diagonal hacia la calle y la cochera
    const home = this.world.poi('safehouse');
    const hs = { x: Math.cos(home.yaw), z: -Math.sin(home.yaw) }, hf = { x: Math.sin(home.yaw), z: Math.cos(home.yaw) };
    const startYaw = wrapAngle(home.yaw + 0.75);
    this.player.teleport(home.x + hs.x * 16.5 - hf.x * 0.5, home.z + hs.z * 16.5 - hf.z * 0.5, startYaw);
    this.camRig.yaw = startYaw;
    this.audio = new AudioSystem();
    const unlock = () => this.audio.init();
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
    this.sky.on((ev) => { if (ev.type === 'lightning') this.audio.thunder(ev.distance); });
    // Vehículos y tránsito (sus luces se crean ahora para no recompilar shaders después)
    this.effects = new Effects(this);
    this.vehicles = new VehicleManager(this);
    this.traffic = new TrafficManager(this);
    this.vehicleHud = new VehicleHud(this);
    this.contactShadows = new ContactShadows(this.engine);
    this.probe = new ReflectionProbe(this.engine, 128);
    this._probeOn = null;
    this.engine.onQualityChange(() => this._syncProbe());
    this.enterState = null;
    this.exitState = null;
    this.deathState = null;
    this.radioCar = null;
    this.lastCar = null;
    this.hornT = 0;
    this.hurtFx = 0;
    this._speedFx = 0;
    this._heartT = 0;
    this._eye = new THREE.Vector3();
    this._carQ = new THREE.Quaternion();
    this._spawnPersonalCar();
    this.audio.radio.onTrack = (info) => { if (this.player.vehicle) this.vehicleHud.showRadio(info); };
    this.player.on((ev) => this._onPlayerEvent(ev));
    this.events.on('explosion', (e) => this._onExplosion(e));
    this._overlay();
    this._deathOverlay();
    this.engine.enableLightLayers(); // faros, destellos y sol iluminan también la capa dinámica
    this._last = performance.now();
    this._frame = this._frame.bind(this);
  }

  addSystem(sys) {
    this.systems.push(sys);
    return sys;
  }

  /** Auto propio estacionado en la cochera del departamento. */
  _spawnPersonalCar() {
    const home = this.world.poi('safehouse');
    const g = home && home.garage;
    if (!g) return;
    const v = this.vehicles.spawn('muscle', g.x, g.z, g.yaw, {
      color: 0x14306e, persistent: true, parked: true, engineOn: false, station: 0, dirt: 0.04,
      rimColor: 0x3a3d42, caliperColor: 0xc4161c,
      upgrades: { engine: 1, brakes: 1, armor: 0, turbo: 0, nitro: 1 },
    });
    if (v) {
      v.personal = true;
      v.locked = false;
      this.personalCar = v;
    }
  }

  _overlay() {
    const ui = document.getElementById('ui');
    const el = document.createElement('div');
    el.className = 'click-play';
    el.innerHTML = '<div class="click-play-card"><div class="cp-title">Pausa</div><div class="cp-sub">Hacé clic para jugar</div><div class="cp-hint">WASD mover · Mouse mirar · Shift correr · Espacio saltar · C agacharse · V cámara<br>F subir/bajar · Espacio freno de mano · Shift nitro · H bocina/sirena · Q/E radio · C mirar atrás</div></div>';
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

  _deathOverlay() {
    const el = document.createElement('div');
    el.className = 'death-screen';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="ds-title">FUERA DE COMBATE</div><div class="ds-sub"></div>';
    document.getElementById('ui').appendChild(el);
    this.deathEl = el;
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
    const p = this.player;
    if (input.context !== 'menu') input.context = p.vehicle ? 'vehicle' : 'foot';
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
      this._vehicleControl(dt, input);
      if (this.enterState) this._updateEntering(dt, input);
      else if (this.exitState) this._updateExiting(dt);
      else p.update(dt, input, this.camRig);
      this.traffic.update(dt);
      this.vehicles.update(dt);
      this._syncDriver(dt);
      this.vehicles.collideHumans(this.humans());
      for (const s of this.systems) if (s.update) s.update(dt, this);
      this.effects.update(dt);
      if (this.deathState) this._updateDeath(rawDt);
    }
    // Cámara
    if (p.vehicle) {
      const v = p.vehicle;
      this.camRig.mode = 'vehicle';
      this.camRig.update(rawDt, playing ? input : null, {
        vehicle: { pos: v.pos, yaw: v.yaw, speed: v.speed, length: v.length, height: v.height, nitro: v.nitroOn, reverse: v.speed < -1 && input.brake > 0.1, air: !v.onGround, noHood: v.geoInfo.noHood, eye: this._eye, quat: this._carQ },
        lookBack: playing && input.down('lookBack'),
      });
    } else {
      if (this.camRig.mode === 'vehicle') this.camRig.mode = 'foot';
      this.camRig.update(rawDt, playing && !this.deathState ? input : null, { target: p.pos, aiming: p.aiming, sprint: p.sprinting, swimming: p.swimming });
    }
    this.updateWorld(playing ? rawDt * this.slowmo : 0, rawDt);
    this._radioOutside();
    this.vehicleHud.update(rawDt);
    this._feedback(rawDt, playing);
    // Audio: oyente en la cámara
    const cam = this.engine.camera;
    _fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, _fwd);
    this.audio.update(rawDt);
    this._ambT = (this._ambT || 0) - rawDt;
    if (this._ambT <= 0) {
      this._ambT = 0.5;
      this._ambience(rawDt);
    }
    this.vehicles.render();
    this._contactShadows();
    this._updateProbe();
    this.engine.render(rawDt);
    input.endFrame();
    requestAnimationFrame(this._frame);
  }

  /** Sonda de reflejos: se activa en calidad alta/ultra y sigue al auto del jugador (o a la cámara). */
  _syncProbe() {
    this.probe.enabled = !!this.engine.q.reflections;
    if (!this.probe.enabled) this.probe.ready = false;
  }

  _updateProbe() {
    if (this._probeOn === null) this._syncProbe();
    const probe = this.probe;
    if (probe.enabled) {
      const v = this.player.vehicle;
      const c = this.engine.camera.position;
      if (v) _probePos.set(v.pos.x, v.pos.y + v.height + 0.5, v.pos.z);
      else _probePos.set((this.player.pos.x + c.x) / 2, Math.max(this.player.pos.y + 1.4, 0.8), (this.player.pos.z + c.z) / 2);
      probe.update(_probePos);
    }
    const on = probe.enabled && probe.ready;
    if (on !== this._probeOn) {
      this._probeOn = on;
      this.vehicles.renderer.setEnvMap(on ? probe.texture : null);
    }
  }

  /** Sombras de contacto de vehículos y personas (reemplazan a la SSAO en la capa dinámica). */
  _contactShadows() {
    const cs = this.contactShadows;
    const cam = this.engine.camera.position;
    cs.begin();
    for (const v of this.vehicles.list) {
      if (v.sunk || !v.render) continue;
      const dx = v.pos.x - cam.x, dz = v.pos.z - cam.z;
      if (dx * dx + dz * dz > 170 * 170) continue;
      const h = Math.max(0, v.pos.y - v.groundY);
      if (v.spec.bike) cs.add(v.pos.x, v.groundY, v.pos.z, v.yaw, v.fallen ? 1.2 : 0.62, v.length * 1.05, 0.62, 0, h);
      else cs.add(v.pos.x, v.groundY, v.pos.z, v.yaw, v.width + 0.32, v.length + 0.22, 0.8, 0, h);
    }
    const addHuman = (pos, yaw, onGround, lying, deadPose) => {
      const gy = onGround ? pos.y : this.collision.surfaceBelow(pos.x, pos.z, pos.y + 0.5);
      const h = Math.max(0, pos.y - gy);
      if (lying) {
        const s = deadPose < 0.5 ? -1 : 1; // boca arriba: la cabeza queda hacia atrás
        cs.add(pos.x + Math.sin(yaw) * 0.85 * s, gy, pos.z + Math.cos(yaw) * 0.85 * s, yaw, 0.75, 1.95, 0.5, 1, h);
      } else cs.add(pos.x, gy, pos.z, yaw, 0.72, 0.72, 0.5, 1, h);
    };
    const p = this.player;
    if (!p.vehicle && !this.enterState && !this.exitState) {
      const st = p.human.anim.state;
      addHuman(p.pos, p.yaw, p.onGround && !p.swimming, st === 'dead' || st === 'down', p.human.anim.deadPose);
    }
    if (this.peds && this.peds.contactShadows) this.peds.contactShadows(addHuman);
    cs.end();
  }

  /** Personas con las que chocan los vehículos (jugador y peatones). */
  humans() {
    const scripted = this.enterState || this.exitState; // el jugador está en una animación guiada
    const list = this.peds ? this.peds.list : [];
    return scripted ? list : [this.player, ...list];
  }

  // ---------------------------------------------------------------- vehículos
  _vehicleControl(dt, input) {
    const p = this.player;
    if (p.dead || this.enterState || this.exitState) return;
    if (!p.vehicle) {
      if (input.pressed('enter') && !p.knock && !p.swimming) this._tryEnter();
      return;
    }
    const v = p.vehicle;
    // hundido o bajo el agua: se sale nadando
    if (v.sunk || (v.inWater && v.pos.y < WATER_LEVEL - 0.7)) {
      this._exitVehicle({ force: true, swim: true });
      return;
    }
    if (input.pressed('enter')) {
      this._exitVehicle();
      return;
    }
    const c = v.controls;
    c.throttle = input.throttle;
    c.brake = input.brake;
    c.steer = input.steer;
    c.handbrake = input.down('handbrake');
    c.nitro = input.down('nitro');
    if (c.nitro && v.nitroOn && !this._nitroWas) this.audio.play('nitro', { pos: v.pos });
    this._nitroWas = v.nitroOn;
    // Bocina; en patrulleros un toque corto alterna la sirena
    if (input.down('horn')) {
      this.hornT += dt;
      v.horn = !v.isPolice || this.hornT > 0.3;
    } else {
      if (v.isPolice && this.hornT > 0 && this.hornT <= 0.3) v.siren = !v.siren;
      this.hornT = 0;
      v.horn = v.alarmT > 0 && Math.floor(v.alarmT * 2.2) % 2 === 0;
    }
    if (input.pressed('radioNext')) this._radioStep(1);
    else if (input.pressed('radioPrev')) this._radioStep(-1);
  }

  _tryEnter() {
    const p = this.player;
    const v = this.vehicles.nearestEnterable(p.pos, 3.2);
    if (!v || v === p.vehicle) return false;
    if (v.driver === 'npc' && Math.abs(v.speed) > 4.5) return false; // demasiado rápido para abrir la puerta
    if (v.driver === 'npc') {
      // el conductor frena en seco cuando le abren la puerta
      this.traffic.release(v);
      v.ai = null;
      v.mode = 'physics';
      Object.assign(v.controls, { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false });
    }
    if (v.locked === undefined) v.locked = v.parked && !v.personal && Math.random() < 0.5;
    this.enterState = { v, t: 0, phase: 'walk', wp: this._doorRoute(v), jack: v.driver === 'npc' };
    p.aiming = false;
    p.sprinting = false;
    p.crouch = false;
    return true;
  }

  /** Puntos de paso hasta la puerta del conductor, rodeando el auto si el jugador está del otro lado. */
  _doorRoute(v) {
    const p = this.player;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z;
    const along = dx * fx + dz * fz, lat = dx * lx + dz * lz;
    const route = [];
    if (lat < 0.2 && !v.spec.bike) {
      // por la trompa o la cola, la que quede más cerca
      const a = (along >= 0 ? 1 : -1) * (v.length / 2 + 0.8);
      if (lat < -0.5) route.push({ a, b: -(v.width / 2 + 0.6) });
      route.push({ a, b: v.width / 2 + 0.6 });
    }
    route.push({ door: true });
    return route;
  }

  _waypoint(v, w) {
    if (w.door) return this.vehicles.doorPoint(v);
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    return { x: v.pos.x + fx * w.a + lx * w.b, z: v.pos.z + fz * w.a + lz * w.b };
  }

  _updateEntering(dt, input) {
    const s = this.enterState;
    const p = this.player, h = p.human, v = s.v;
    s.t += dt;
    const abort = () => {
      this.enterState = null;
      h.anim.state = 'idle';
    };
    if (p.dead || p.knock || v.destroyed || v.onFire || v.sunk || !this.vehicles.list.includes(v) || (v.driver === 'player' && v !== p.vehicle)) return abort();
    const col = this.collision;
    if (s.phase === 'walk') {
      // cancelar con salto o volviendo a pulsar subir
      if (s.t > 0.2 && (input.pressed('jump') || input.pressed('enter'))) return abort();
      const w = this._waypoint(v, s.wp[0]);
      const dx = w.x - p.pos.x, dz = w.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < (s.wp.length > 1 ? 0.35 : 0.12)) {
        s.wp.shift();
        if (!s.wp.length) {
          s.phase = v.locked ? 'smash' : 'open';
          s.t = 0;
          s.from = p.pos.clone();
          s.fromYaw = p.yaw;
          if (!v.locked) this._openDoor(v, s);
        }
      } else if (s.t > 3.2) return abort();
      else {
        const speed = d > 1.5 ? 4.4 : 2.4;
        const step = Math.min(d, speed * dt);
        const res = col.resolveCircle(p.pos.x + (dx / d) * step, p.pos.z + (dz / d) * step, 0.3, p.pos.y + 0.35, p.pos.y + 1.75);
        if (s.wp[0].door) this.pushOutOfDynamic(res, 0.3, p, v);
        else this.pushOutOfDynamic(res, 0.3, p);
        p.pos.x = res.x;
        p.pos.z = res.z;
        p.pos.y = col.surfaceBelow(p.pos.x, p.pos.z, p.pos.y + 0.6);
        p.yaw = dampAngle(p.yaw, Math.atan2(dx, dz), 14, dt);
        h.anim.state = speed > 3 ? 'run' : 'walk';
        h.anim.speed = speed;
      }
      if (s.phase === 'walk') {
        h.object.position.copy(p.pos);
        h.object.rotation.set(0, p.yaw, 0);
        h.animate(dt);
        return;
      }
    }
    if (s.phase === 'smash') {
      // auto cerrado: rompe la ventanilla del conductor
      const face = wrapAngle(v.yaw - Math.PI / 2);
      p.yaw = dampAngle(p.yaw, face, 12, dt);
      h.anim.state = 'idle';
      if (s.t > 0.15 && !s.punched) {
        s.punched = true;
        h.anim.punchT = 0.35;
      }
      if (s.t > 0.38 && !s.broke) {
        s.broke = true;
        v.glassBroken = true;
        v.alarmT = 9;
        const door = this.vehicles.doorPoint(v);
        this.audio.play('glass', { pos: door });
        for (let i = 0; i < 10; i++) this.effects.emit('debris', { x: door.x, y: v.pos.y + 1.1, z: door.z }, { floor: v.groundY, color: 0.75 });
        this.events.emit('carBreakIn', { vehicle: v, pos: v.pos.clone() });
      }
      if (s.t > 0.75) {
        s.phase = 'open';
        s.t = 0;
        this._openDoor(v, s);
      }
      h.object.position.copy(p.pos);
      h.object.rotation.set(0, p.yaw, 0);
      h.animate(dt);
      return;
    }
    if (s.phase === 'open') {
      // se desliza hasta el asiento
      const dur = v.spec.bike ? 0.4 : 0.55;
      const k = clamp(s.t / dur, 0, 1);
      const e = k * k * (3 - 2 * k);
      this.vehicles.seatTransform(v, h, _obj);
      const door = this.vehicles.doorPoint(v);
      const from = k < 0.35 ? s.from.clone().lerp(door, k / 0.35) : door;
      h.object.position.lerpVectors(from, _obj.position, clamp((k - 0.2) / 0.8, 0, 1));
      h.object.position.y = THREE.MathUtils.lerp(from.y, _obj.position.y, e);
      _q.setFromAxisAngle(UP, wrapAngle(v.yaw - Math.PI / 2));
      _q2.copy(_obj.quaternion);
      h.object.quaternion.copy(_q).slerp(_q2, e);
      h.anim.state = k < 0.3 ? 'idle' : v.spec.bike ? 'ride' : 'drive';
      h.anim.steer = 0;
      h.animate(dt);
      p.pos.copy(h.object.position);
      if (k >= 1) this._finishEnter(v);
    }
  }

  _openDoor(v, s) {
    const door = this.vehicles.doorPoint(v);
    if (!v.spec.bike) this.audio.play('door', { pos: door });
    if (s.jack) this._carjack(v, door);
  }

  /** Saca al conductor de IA del auto (lo arroja al piso si hay peatones; si no, sólo libera el auto). */
  _carjack(v, door) {
    v.driver = null;
    v.npcDriver = false;
    if (this.peds && this.peds.ejectDriver) this.peds.ejectDriver(v, door);
    this.events.emit('carjack', { vehicle: v, pos: v.pos.clone() });
  }

  _finishEnter(v) {
    const p = this.player;
    this.enterState = null;
    if (this.lastCar && this.lastCar !== v && !this.lastCar.personal && this.vehicles.list.includes(this.lastCar)) this.lastCar.persistent = false;
    p.vehicle = v;
    this.lastCar = v;
    v.driver = 'player';
    v.mode = 'physics';
    v.parked = false;
    v.ai = null;
    v.fallen = false;
    v.persistent = true;
    this.traffic.release(v);
    Object.assign(v.controls, { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false });
    if (!v.engineOn && !v.destroyed) {
      v.engineOn = true;
      this.audio.play('engine_start', { pos: v.pos });
    }
    this.camRig.mode = 'vehicle';
    const radio = this.audio.radio;
    radio.setMode('car');
    this.radioCar = null;
    const st = v.station ?? -1;
    if (radio.current === st) this._showRadioNow();
    else {
      radio.play(st);
      if (st < 0 || !radio.ctx) this._showRadioNow();
    }
    this.vehicleHud.showVehicle(v);
    this.events.emit('enterVehicle', { vehicle: v, stolen: !v.personal && !v.owned });
  }

  _showRadioNow() {
    const radio = this.audio.radio;
    if (radio.current < 0) return this.vehicleHud.showRadio(null);
    const np = radio.getNowPlaying();
    this.vehicleHud.showRadio(np || { station: STATIONS[radio.current] });
  }

  _radioStep(dir) {
    const p = this.player, v = p.vehicle;
    const radio = this.audio.radio;
    if (dir > 0) radio.next();
    else radio.prev();
    if (v) v.station = radio.current;
    if (radio.current < 0 || !radio.ctx) this._showRadioNow();
  }

  /** Radio del auto que siguió sonando con el jugador afuera: se apaga al alejarse. */
  _radioOutside() {
    const radio = this.audio.radio;
    if (this.player.vehicle) return;
    const v = this.radioCar;
    if (!v) return;
    const d = v.pos.distanceTo(this.player.pos);
    if (!this.vehicles.list.includes(v) || v.destroyed || !v.engineOn || v.driver || d > RADIO_OUTSIDE_RANGE) {
      radio.stop();
      radio.setMode('car');
      this.radioCar = null;
      return;
    }
    radio.setOutsideLevel(1 - d / RADIO_OUTSIDE_RANGE);
  }

  /**
   * Bajarse del vehículo. Lento: por la puerta del conductor (o la otra si está bloqueada).
   * Rápido: salta en marcha y rueda por el piso. force: sin animación (explosión, agua).
   */
  _exitVehicle({ force = false, swim = false } = {}) {
    const p = this.player, v = p.vehicle;
    if (!v) return;
    const spd = Math.abs(v.speed);
    const bail = !force && spd > EXIT_BAIL_SPEED;
    Object.assign(v.controls, { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: !bail && !force });
    v.horn = false;
    v.driver = null;
    v.station = this.audio.radio.current;
    p.vehicle = null;
    const h = p.human;
    h.object.visible = true;
    // radio: sigue sonando hacia afuera si el motor queda encendido
    const radio = this.audio.radio;
    if (v.engineOn && !v.destroyed && !swim) {
      radio.setMode('outside');
      this.radioCar = v;
    } else {
      radio.stop();
      radio.setMode('car');
      this.radioCar = null;
    }
    const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
    const door = this.vehicles.doorPoint(v);
    let spot = this._exitSpot(v, door);
    if (!spot) {
      // puerta bloqueada: por el lado del acompañante
      const other = { x: v.pos.x - (door.x - v.pos.x), z: v.pos.z - (door.z - v.pos.z) };
      spot = this._exitSpot(v, other);
    }
    if (!spot) spot = { x: door.x, z: door.z };
    const y = Math.max(this.collision.surfaceBelow(spot.x, spot.z, v.pos.y + 1.5), v.pos.y - 0.5);
    h.anim.steer = 0;
    this.camRig.mode = 'foot';
    if (swim) {
      p.pos.set(spot.x, WATER_LEVEL - 0.6, spot.z);
      p.vel.set(0, 0, 0);
      p.swimming = true;
      p.yaw = v.yaw;
      h.object.rotation.set(0, p.yaw, 0);
      h.anim.state = 'swim';
    } else if (bail || force) {
      p.pos.set(spot.x, Math.max(y, v.pos.y + 0.2), spot.z);
      p.yaw = v.yaw;
      const side = (spot.x - v.pos.x) * lx + (spot.z - v.pos.z) * lz >= 0 ? 1 : -1;
      p.knockdown(v.vel.x * 0.8 + lx * side * 2.2, 2.6, v.vel.z * 0.8 + lz * side * 2.2);
      if (bail) p.takeDamage(Math.max(0, (spd - EXIT_BAIL_SPEED) * 1.4), 'salto');
      if (v.spec.bike) v.fallen = true;
    } else {
      this.vehicles.seatTransform(v, h, _obj);
      this.exitState = { v, t: 0, from: _obj.position.clone(), fromQ: _obj.quaternion.clone(), to: new THREE.Vector3(spot.x, y, spot.z), yaw: wrapAngle(v.yaw + (v.spec.bike ? 0 : Math.PI / 2 * ((spot.x - v.pos.x) * lx + (spot.z - v.pos.z) * lz >= 0 ? 1 : -1))) };
      if (!v.spec.bike) this.audio.play('door', { pos: door });
    }
    this.events.emit('exitVehicle', { vehicle: v, bail });
  }

  _exitSpot(v, pt) {
    const col = this.collision;
    const y0 = v.pos.y + 0.3, y1 = v.pos.y + 1.8;
    if (col.overlapsCircle(pt.x, pt.z, 0.34, y0, y1)) return null;
    const g = col.surfaceBelow(pt.x, pt.z, v.pos.y + 1.5);
    if (Math.abs(g - v.pos.y) > 1.2) return null; // borde del puente o muelle
    return { x: pt.x, z: pt.z };
  }

  _updateExiting(dt) {
    const s = this.exitState;
    const p = this.player, h = p.human;
    s.t += dt;
    const k = clamp(s.t / 0.5, 0, 1);
    const e = k * k * (3 - 2 * k);
    h.object.position.lerpVectors(s.from, s.to, e);
    _q.setFromAxisAngle(UP, s.yaw);
    h.object.quaternion.copy(s.fromQ).slerp(_q, e);
    h.anim.state = k < 0.5 ? (s.v.spec.bike ? 'ride' : 'drive') : 'idle';
    h.animate(dt);
    p.pos.copy(h.object.position);
    if (k >= 1) {
      this.exitState = null;
      p.pos.copy(s.to);
      p.vel.set(0, 0, 0);
      p.yaw = s.yaw;
      p.onGround = true;
      h.object.rotation.set(0, p.yaw, 0);
    }
  }

  /** Choque fuerte en moto: el jugador sale despedido hacia adelante. */
  throwPlayerFromVehicle(v, impact) {
    const p = this.player;
    if (p.vehicle !== v) return;
    const vel = v.vel.clone();
    Object.assign(v.controls, { throttle: 0, brake: 0, steer: 0, nitro: false, handbrake: false });
    v.driver = null;
    v.station = this.audio.radio.current;
    p.vehicle = null;
    p.human.object.visible = true;
    this.audio.radio.stop();
    this.camRig.mode = 'foot';
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    p.pos.set(v.pos.x + fx * 0.8, v.pos.y + 1.1, v.pos.z + fz * 0.8);
    p.yaw = v.yaw;
    const sp = Math.max(impact, Math.hypot(vel.x, vel.z) * 0.6);
    p.knockdown(fx * sp * 0.7 + vel.x * 0.3, 3.5 + sp * 0.15, fz * sp * 0.7 + vel.z * 0.3);
    p.takeDamage(impact * 2.2, 'choque');
    this.events.emit('exitVehicle', { vehicle: v, bail: true, thrown: true });
  }

  /** Conductor sentado: transformación del asiento, animación y posición lógica del jugador. */
  _syncDriver(dt) {
    const p = this.player, v = p.vehicle;
    if (!v) return;
    const h = p.human;
    this.vehicles.seatTransform(v, h, h.object);
    p.pos.copy(v.pos);
    p.vel.copy(v.vel);
    p.yaw = v.yaw;
    const a = h.anim;
    a.state = v.spec.bike ? 'ride' : 'drive';
    a.steer = damp(a.steer || 0, -v.controls.steer, 8, dt);
    a.aim = 0;
    h.animate(dt);
    // ojos del conductor para la cámara interior (el cuerpo se oculta en esa vista)
    const seat = v.geoInfo.seat;
    this._carQ.setFromEuler(_eul.set(v.pitch, v.yaw, v.roll, 'YXZ'));
    this._eye.set(seat.x, seat.hip + 0.74, seat.z - 0.04).applyQuaternion(this._carQ).add(v.pos);
    this._eye.y += v.bob;
    h.object.visible = !(this.camRig.vehZoom === 2 && !v.geoInfo.noHood);
  }

  /**
   * Empuja un círculo (jugador o peatón) fuera de los vehículos (cajas orientadas).
   * ignore: vehículo a ignorar (p. ej. al acercarse a su puerta).
   */
  pushOutOfDynamic(res, radius, who, ignore = null) {
    const list = this.vehicles.list;
    const y = who.pos.y;
    for (let i = 0; i < list.length; i++) {
      const v = list[i];
      if (v === ignore || v === who.vehicle || v.sunk) continue;
      const dx = res.x - v.pos.x, dz = res.z - v.pos.z;
      if (dx * dx + dz * dz > 49) continue;
      if (y > v.pos.y + v.height - 0.15 || y + 1.7 < v.pos.y) continue;
      const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      const lx = Math.cos(v.yaw), lz = -Math.sin(v.yaw);
      let a = dx * fx + dz * fz, b = dx * lx + dz * lz;
      const hl = v.length / 2 + radius, hw = v.width / 2 + radius;
      if (Math.abs(a) >= hl || Math.abs(b) >= hw) continue;
      if (hw - Math.abs(b) < hl - Math.abs(a)) b = Math.sign(b || 1) * hw;
      else a = Math.sign(a || 1) * hl;
      res.x = v.pos.x + fx * a + lx * b;
      res.z = v.pos.z + fz * a + lz * b;
      res.hit = true;
    }
  }

  /** Onda expansiva: daña y empuja vehículos y personas (reacciones en cadena incluidas). */
  _onExplosion(e) {
    const pos = e.pos;
    const R = e.radius || 9;
    const dmg = e.damage || 150;
    for (const v of this.vehicles.list) {
      if (v === e.vehicle || v.sunk) continue;
      const dx = v.pos.x - pos.x, dz = v.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > R * 1.5 || Math.abs(v.pos.y - pos.y) > 6) continue;
      const k = 1 - d / (R * 1.5);
      v.damage(dmg * 5 * k * k, e.source, pos);
      const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
      v.vel.x += nx * 9 * k * (1600 / v.mass);
      v.vel.z += nz * 9 * k * (1600 / v.mass);
      v.vy = Math.max(v.vy, 5 * k * (1600 / v.mass));
      v.onGround = false;
      v.spin += (Math.random() - 0.5) * 4 * k;
      if (v.ai && v.ai.onHit) v.ai.onHit(null, 10 * k);
    }
    const p = this.player;
    if (p.vehicle && p.vehicle === e.vehicle) {
      this._exitVehicle({ force: true });
      p.takeDamage(1000, e.source || 'explosión');
      return;
    }
    if (p.vehicle) {
      const d = p.vehicle.pos.distanceTo(pos);
      if (d < R) p.takeDamage(dmg * 0.35 * (1 - d / R), e.source || 'explosión');
      return;
    }
    const dx = p.pos.x - pos.x, dz = p.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < R && Math.abs(p.pos.y - pos.y) < 5) {
      const k = 1 - d / R;
      const nx = d > 0.01 ? dx / d : 1, nz = d > 0.01 ? dz / d : 0;
      if (k > 0.25) p.knockdown(nx * 11 * k, 3 + 5 * k, nz * 11 * k);
      p.takeDamage(dmg * k * k + 8 * k, e.source || 'explosión');
    }
  }

  // ---------------------------------------------------------------- jugador
  _onPlayerEvent(ev) {
    const a = this.audio, pp = this.player.pos;
    const pos = { x: pp.x, y: pp.y + 0.1, z: pp.z };
    if (ev.type === 'step') a.play(ev.wading ? 'swim' : 'step', { pos, volume: Math.min(1, 0.35 + ev.speed * 0.1) });
    else if (ev.type === 'jump') a.play('jump', { pos });
    else if (ev.type === 'land') a.play('land', { pos, volume: ev.hard ? 1 : 0.5 });
    else if (ev.type === 'splash') a.play('splash', { pos });
    else if (ev.type === 'damage') {
      if (ev.amount > 4) a.play('hurt', { pos });
      this.hurtFx = Math.min(1, this.hurtFx + ev.amount / 45);
      if (ev.amount > 10) this.input.rumble(Math.min(1, ev.amount / 60), 0.5, 140);
    } else if (ev.type === 'hit') this.camRig.shake(Math.min(0.7, ev.speed * 0.03));
    else if (ev.type === 'death') this._onDeath(ev);
  }

  // ---------------------------------------------------------------- muerte y reaparición
  _onDeath(ev) {
    if (this.deathState) return;
    const p = this.player;
    if (p.vehicle) {
      this._exitVehicle({ force: true });
      p.die(ev.source);
    }
    this.enterState = null;
    this.exitState = null;
    const hosp = this.world.poi('hospital');
    this.deathState = { t: 0, phase: 'slow', hosp };
    this.slowmo = 0.3;
    this.audio.play('wasted');
    this.deathEl.querySelector('.ds-sub').textContent = hosp ? `Despertás en el ${hosp.name}` : '';
    this.deathEl.hidden = false;
    this.deathEl.classList.remove('show');
    void this.deathEl.offsetWidth;
    this.deathEl.classList.add('show');
    // cámara que se eleva sobre el cuerpo
    const cam = this.engine.camera.position;
    const body = p.pos.clone().add(new THREE.Vector3(0, 0.4, 0));
    const away = cam.clone().sub(body).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    const to = body.clone().addScaledVector(away, 5).add(new THREE.Vector3(0, 7.5, 0));
    this.camRig.startCinematic(cam.clone(), to, body.clone().add(new THREE.Vector3(0, 0.8, 0)), body, 4.2);
    this.events.emit('playerDied', { source: ev.source });
  }

  _updateDeath(rawDt) {
    const s = this.deathState;
    const post = this.engine.post;
    s.t += rawDt;
    post.desat = Math.min(0.85, s.t / 1.2);
    if (s.phase === 'slow' && s.t > 5.2) s.phase = 'fade';
    if (s.phase === 'fade') {
      const k = clamp((s.t - 5.2) / 0.9, 0, 1);
      post.black = k;
      if (k >= 1) this._respawn();
    } else if (s.phase === 'in') {
      const k = clamp((s.t - s.inAt) / 1.1, 0, 1);
      post.black = 1 - k;
      if (k >= 1) {
        post.black = 0;
        this.deathState = null;
      }
    }
  }

  _respawn() {
    const s = this.deathState;
    const p = this.player;
    const hosp = s.hosp || this.world.poi('safehouse');
    p.revive(hosp.x, hosp.z, hosp.yaw ?? 0);
    this.camRig.stopCinematic();
    this.camRig.yaw = hosp.yaw ?? 0;
    this.camRig.pitch = 0.2;
    this.camRig.initialized = false;
    this.slowmo = 1;
    this.engine.post.desat = 0;
    this.hurtFx = 0;
    this.deathEl.hidden = true;
    this.deathEl.classList.remove('show');
    this.sky.setTime(this.sky.time + 2.5);
    s.phase = 'in';
    s.inAt = s.t;
    this.events.emit('respawn', { at: hosp.id });
  }

  // ---------------------------------------------------------------- sensación
  /** Desenfoque de velocidad, viñeta de daño y latido con poca salud. */
  _feedback(rawDt, playing) {
    const post = this.engine.post;
    const p = this.player, v = p.vehicle;
    let sp = 0;
    if (v && playing) sp = clamp((Math.abs(v.speed) - 26) / 32, 0, 0.7) + (v.nitroOn ? 0.5 : 0);
    this._speedFx = damp(this._speedFx, sp, 3.5, rawDt);
    post.speed = this._speedFx < 0.002 ? 0 : this._speedFx;
    this.hurtFx = Math.max(0, this.hurtFx - rawDt * 1.4);
    const lowHp = !p.dead && p.health < 25;
    const low = lowHp ? 0.32 + 0.22 * Math.sin(this.realTime * 5.2) : 0;
    post.damage = p.dead ? 0 : Math.min(1, Math.max(this.hurtFx, low));
    if (lowHp && playing) {
      this._heartT -= rawDt;
      if (this._heartT <= 0) {
        this._heartT = 0.85;
        this.audio.play('heartbeat', { volume: 0.7 });
      }
    }
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
    const inCar = this.player.vehicle && !this.player.vehicle.spec.bike ? 0.55 : 1; // cabina: ambiente atenuado
    this.audio.setAmbience({
      city: Math.max(0, inCity * (1 - ocean * 0.6) * (1 - alt)) * inCar,
      ocean: ocean * inCar,
      rain: this.sky.w.rain * (inCar < 1 ? 0.8 : 1),
      wind: Math.min(1, this.sky.w.wind * 0.6 + alt) * inCar,
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
    this.props.update(rawDt, t, sky.nightK, U.uLamps.value, cam.position, this.time);
    this.vegetation.update(cam.position);
    this.landmarks.update(rawDt, t, sky.nightK);
    this.weather.update(rawDt, cam, sky);
    const p = cam.position;
    const nearWater = (p.x > 380 || p.z > 400 || p.z < -400 || p.x < -420) && p.y < 160;
    this.reflection.enabled = !!this.engine.q.reflections;
    this.reflection.wanted = U.uWet.value > 0.12 || nearWater;
  }
}

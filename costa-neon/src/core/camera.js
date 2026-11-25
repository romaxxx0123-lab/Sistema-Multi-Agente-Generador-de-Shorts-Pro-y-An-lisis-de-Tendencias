// Cámara en tercera persona: a pie, vehículo, apuntado sobre el hombro, libre (modo foto) y cinemática.
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, angleDiff, valueNoise2 } from './utils.js';
import { WATER_LEVEL } from '../world/map.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _pivot = new THREE.Vector3(), _desired = new THREE.Vector3(), _look = new THREE.Vector3();
const _e2 = new THREE.Euler(), _qa = new THREE.Quaternion();

export class CameraRig {
  constructor(engine, collision, world) {
    this.engine = engine;
    this.cam = engine.camera;
    this.collision = collision;
    this.world = world;
    this.yaw = 0;
    this.pitch = 0.22;
    this.dist = 4.2;
    this.mode = 'foot';
    this.footZoom = 0; // 0 normal, 1 lejos
    this.vehZoom = 0; // 0 cerca, 1 lejos, 2 capó
    this.fov = 62;
    this.baseFov = 62;
    this.trauma = 0;
    this.t = 0;
    this.lastLook = 0;
    this.smoothPos = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.initialized = false;
    this.cine = null;
    this.free = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, center: new THREE.Vector3(), radius: 20 };
    this.aimBlend = 0;
    this.sens = 1;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** Dirección horizontal de la cámara. */
  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  right(out = new THREE.Vector3()) {
    return out.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
  }

  cycleZoom() {
    if (this.mode === 'vehicle') this.vehZoom = (this.vehZoom + 1) % 3;
    else this.footZoom = (this.footZoom + 1) % 2;
  }

  startCinematic(from, to, lookFrom, lookTo, duration, onDone) {
    this.cine = { from: from.clone(), to: to.clone(), lookFrom: lookFrom.clone(), lookTo: lookTo.clone(), t: 0, d: duration, onDone };
  }
  stopCinematic() {
    this.cine = null;
  }

  enterFree(center) {
    this.mode = 'free';
    this.free.center.copy(center);
    this.free.pos.copy(this.cam.position);
    this.free.yaw = this.yaw;
    this.free.pitch = -this.pitch;
  }

  _collide(pivot, desired, radius = 0.25) {
    const dx = desired.x - pivot.x, dy = desired.y - pivot.y, dz = desired.z - pivot.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return desired;
    const hit = this.collision.raycast(pivot.x, pivot.y, pivot.z, dx, dy, dz, len + radius, { ignoreSmall: true, water: false });
    if (hit && !hit.ground) {
      const t = Math.max(0.35, hit.t - radius);
      desired.set(pivot.x + (dx / len) * t, pivot.y + (dy / len) * t, pivot.z + (dz / len) * t);
    }
    // nunca bajo el suelo ni bajo el agua
    const g = this.world.groundAt(desired.x, desired.z);
    const minY = Math.max(g, WATER_LEVEL) + 0.3;
    if (desired.y < minY) desired.y = minY;
    return desired;
  }

  /**
   * ctx a pie: { target: Vector3 (cuerpo), aiming, sprint, swimming }
   * ctx vehículo: { vehicle: { pos, yaw, speed, length, height, nitro, reverse } , lookBack }
   */
  update(dt, input, ctx) {
    this.t += dt;
    const cam = this.cam;
    const lookX = input ? input.look.x : 0, lookY = input ? input.look.y : 0;
    if (Math.abs(lookX) + Math.abs(lookY) > 0.01) this.lastLook = this.t;
    if (this.cine) {
      const c = this.cine;
      c.t += dt;
      const k = clamp(c.t / c.d, 0, 1);
      const s = k * k * (3 - 2 * k);
      cam.position.lerpVectors(c.from, c.to, s);
      _look.lerpVectors(c.lookFrom, c.lookTo, s);
      cam.lookAt(_look);
      this.engine.setFov(lerp(cam.fov, 50, 1 - Math.exp(-dt * 3)));
      if (k >= 1 && c.onDone) {
        const fn = c.onDone;
        c.onDone = null;
        fn();
      }
      return;
    }
    if (this.mode === 'free') return this._updateFree(dt, input);
    const sensK = 0.0042 * this.sens;
    if (this.mode === 'foot') {
      const aiming = !!ctx.aiming;
      this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 12, dt);
      const aimSens = lerp(1, 0.55, this.aimBlend);
      this.yaw -= lookX * sensK * aimSens;
      this.pitch = clamp(this.pitch + lookY * sensK * 0.85 * aimSens, -1.05, 1.15);
      const baseDist = (this.footZoom ? 6.2 : 4.0) + (ctx.swimming ? 0.6 : 0);
      const dist = lerp(baseDist, 1.75, this.aimBlend);
      this.dist = damp(this.dist, dist, 8, dt);
      const shoulder = lerp(0.18, 0.62, this.aimBlend);
      const height = lerp(1.55, 1.6, this.aimBlend);
      this.forward(_f);
      this.right(_r);
      _pivot.copy(ctx.target).add(new THREE.Vector3(0, height, 0)).addScaledVector(_r, shoulder);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      _desired.copy(_pivot).addScaledVector(_f, -this.dist * cp).add(new THREE.Vector3(0, this.dist * sp + 0.1, 0));
      if (!this.initialized) {
        this.smoothPivot = _pivot.clone();
        this.initialized = true;
      }
      this.smoothPivot.x = damp(this.smoothPivot.x, _pivot.x, 30, dt);
      this.smoothPivot.z = damp(this.smoothPivot.z, _pivot.z, 30, dt);
      this.smoothPivot.y = damp(this.smoothPivot.y, _pivot.y, 14, dt);
      const offset = _desired.clone().sub(_pivot);
      _desired.copy(this.smoothPivot).add(offset);
      this._collide(this.smoothPivot, _desired, 0.3);
      cam.position.copy(_desired);
      _look.copy(this.smoothPivot).addScaledVector(_f, 3).add(new THREE.Vector3(0, -this.dist * sp * 0.35, 0));
      cam.lookAt(_look);
      const fov = lerp(this.baseFov + (ctx.sprint ? 5 : 0), this.baseFov - 16, this.aimBlend);
      this.fov = damp(this.fov, ctx.zoomFov || fov, 8, dt);
    } else if (this.mode === 'vehicle') {
      const v = ctx.vehicle;
      this.yaw -= lookX * sensK;
      this.pitch = clamp(this.pitch + lookY * sensK * 0.85, -0.4, 1.1);
      const idle = this.t - this.lastLook > 1.1;
      const moving = Math.abs(v.speed) > 2.5;
      let behind = v.yaw;
      if (v.reverse && v.speed < -3) behind = v.yaw + Math.PI;
      if (ctx.lookBack) behind += Math.PI;
      if ((idle && moving) || ctx.lookBack) {
        this.yaw = dampAngle(this.yaw, behind, ctx.lookBack ? 20 : 2.6, dt);
        this.pitch = damp(this.pitch, v.air ? 0.3 : 0.18, 1.5, dt);
      }
      const L = v.length || 4.5, Hh = v.height || 1.5;
      if (this.vehZoom === 2 && !v.noHood && v.eye && v.quat) {
        // cámara interior: ojos del conductor, sigue cabeceo y rolido del auto
        cam.position.copy(v.eye);
        const yawRel = angleDiff(v.yaw, this.yaw);
        _e2.set(-this.pitch * 0.5 + 0.02, Math.PI + yawRel, 0, 'YXZ');
        cam.quaternion.copy(v.quat).multiply(_qa.setFromEuler(_e2));
      } else {
        const dist = (this.vehZoom === 1 ? 1.45 : 1) * (4.6 + L * 0.55) + (v.extraDist || 0);
        this.dist = damp(this.dist, dist, 4, dt);
        this.forward(_f);
        _pivot.set(v.pos.x, v.pos.y + Hh * 0.9 + 0.55, v.pos.z);
        if (!this.initialized) {
          this.smoothPivot = _pivot.clone();
          this.initialized = true;
        }
        // retraso suave (sensación de inercia)
        this.smoothPivot.x = damp(this.smoothPivot.x, _pivot.x, 12, dt);
        this.smoothPivot.z = damp(this.smoothPivot.z, _pivot.z, 12, dt);
        this.smoothPivot.y = damp(this.smoothPivot.y, _pivot.y, 6, dt);
        const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
        _desired.copy(this.smoothPivot).addScaledVector(_f, -this.dist * cp).add(new THREE.Vector3(0, this.dist * sp, 0));
        this._collide(this.smoothPivot, _desired, 0.4);
        cam.position.copy(_desired);
        _look.copy(this.smoothPivot).add(new THREE.Vector3(0, 0.2, 0)).addScaledVector(_f, 2);
        cam.lookAt(_look);
      }
      const spd = Math.abs(v.speed);
      const interior = this.vehZoom === 2 && !v.noHood && v.eye;
      this.fov = damp(this.fov, (interior ? 70 : this.baseFov) + Math.min(interior ? 8 : 16, spd * 0.22) + (v.nitro ? 9 : 0), 3, dt);
    }
    // Temblor
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const n1 = valueNoise2(this.t * 18, 1.7) - 0.5, n2 = valueNoise2(this.t * 18, 9.3) - 0.5, n3 = valueNoise2(this.t * 14, 4.1) - 0.5;
      cam.position.x += n1 * s * 0.5;
      cam.position.y += n2 * s * 0.4;
      cam.rotation.z += n3 * s * 0.06;
      this.trauma = Math.max(0, this.trauma - dt * 1.4);
    }
    this.engine.setFov(this.fov);
  }

  _updateFree(dt, input) {
    const f = this.free;
    if (input) {
      f.yaw -= input.look.x * 0.004;
      f.pitch = clamp(f.pitch - input.look.y * 0.004, -1.4, 1.4);
      const sp = (input.down('sprint') ? 9 : 3.5) * dt;
      const fwd = new THREE.Vector3(Math.sin(f.yaw) * Math.cos(f.pitch), Math.sin(f.pitch), Math.cos(f.yaw) * Math.cos(f.pitch));
      const right = new THREE.Vector3(-Math.cos(f.yaw), 0, Math.sin(f.yaw));
      f.pos.addScaledVector(fwd, input.move.y * sp).addScaledVector(right, input.move.x * sp);
      if (input.down('jump')) f.pos.y += sp;
      if (input.down('crouch')) f.pos.y -= sp;
      const off = f.pos.clone().sub(f.center);
      if (off.length() > f.radius) f.pos.copy(f.center).addScaledVector(off.normalize(), f.radius);
      const g = this.world.groundAt(f.pos.x, f.pos.z);
      f.pos.y = Math.max(f.pos.y, Math.max(g, WATER_LEVEL) + 0.2);
      this.cam.position.copy(f.pos);
      this.cam.lookAt(f.pos.clone().add(fwd));
    }
    this.engine.setFov(this.fov);
  }
}

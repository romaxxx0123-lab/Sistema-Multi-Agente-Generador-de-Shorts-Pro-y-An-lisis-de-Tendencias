// Jugador a pie: movimiento, salto, sprint con estamina, natación, colisiones y salud.
import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff, wrapAngle } from '../core/utils.js';
import { WATER_LEVEL } from '../world/map.js';
import { Human, BONES } from './human.js';

const GRAVITY = 24;
const RADIUS = 0.32;

export class Player {
  constructor(game, appearance) {
    this.game = game;
    this.human = new Human(game.humanFactory, appearance);
    this.human.object.rotation.order = 'YXZ';
    game.engine.scene.add(this.human.object);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.onGround = true;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.stamina = 100;
    this.staminaMax = 100;
    this.staminaLock = false;
    this.lastDamage = -99;
    this.swimming = false;
    this.wading = false;
    this.crouch = false;
    this.sprinting = false;
    this.aiming = false;
    this.dead = false;
    this.airTime = 0;
    this.time = 0;
    this.vehicle = null;
    this.frozen = false;
    this.knock = null; // derribo: { phase: 'fly'|'down'|'getup', t, tumble, tumbleV, bounces }
    this.stepPhase = 0;
    this.stats = { walked: 0, swum: 0, jumps: 0, falls: 0 };
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(ev) {
    for (const fn of this.listeners) fn(ev);
  }

  teleport(x, z, yaw = this.yaw, y = null) {
    const col = this.game.collision;
    const spot = col.findFreeSpot(x, z, RADIUS + 0.1, 0.1, 1.8);
    this.pos.set(spot.x, y != null ? y : col.surfaceBelow(spot.x, spot.z, 50), spot.z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.onGround = true;
    this.human.object.position.copy(this.pos);
    this.human.object.rotation.set(0, yaw, 0);
  }

  heal(amount) {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  addArmor(amount) {
    this.armor = Math.min(100, this.armor + amount);
  }

  takeDamage(amount, source = null) {
    if (this.dead || this.game.godMode) return 0;
    const mult = this.game.difficultyDamage || 1;
    amount *= mult;
    let toArmor = Math.min(this.armor, amount * 0.66);
    this.armor -= toArmor;
    const toHealth = amount - toArmor;
    this.health -= toHealth;
    this.lastDamage = this.time;
    this.emit({ type: 'damage', amount, source });
    if (this.health <= 0) {
      this.health = 0;
      this.die(source);
    }
    return amount;
  }

  die(source) {
    if (this.dead) return;
    this.dead = true;
    this.aiming = false;
    this.sprinting = false;
    // en el aire sigue volando; la pose final se fija al tocar el suelo
    if (!this.knock || this.knock.phase !== 'fly') {
      this.human.anim.state = 'dead';
      this.human.anim.deadPose = Math.random();
    }
    this.emit({ type: 'death', source });
  }

  revive(x, z, yaw = 0) {
    this.dead = false;
    this.knock = null;
    this.health = this.maxHealth;
    this.stamina = this.staminaMax;
    this.swimming = false;
    this.crouch = false;
    this.human.anim.state = 'idle';
    this.teleport(x, z, yaw);
  }

  /** Atropello: sale despedido según la velocidad del vehículo, cae y se levanta si sigue vivo. */
  onVehicleHit(v, speed, dir) {
    if (this.vehicle) return;
    if (this.knock && this.knock.phase === 'fly' && this.knock.t < 0.5) return; // mismo impacto
    const d = dir && dir.lengthSq() > 1e-6 ? dir.clone().normalize() : new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
    this.knockdown(d.x * speed * 0.72, Math.min(10.5, 2.4 + speed * 0.32), d.z * speed * 0.72);
    const dmg = Math.max(0, (speed - 3) * 4.4) + Math.max(0, speed - 14) * 4;
    this.emit({ type: 'hit', vehicle: v, speed });
    this.takeDamage(dmg, v.driver === 'player' ? 'player' : 'atropello');
  }

  /** Derribo genérico (atropello, salto desde un vehículo en marcha, onda expansiva). */
  knockdown(vx, vy, vz) {
    if (this.vehicle) return;
    this.vel.set(vx, vy, vz);
    this.onGround = false;
    this.swimming = false;
    this.crouch = false;
    this.aiming = false;
    this.sprinting = false;
    const hs = Math.hypot(vx, vz);
    // la dirección del giro sigue al empuje relativo a hacia dónde mira
    const facing = Math.sin(this.yaw) * vx + Math.cos(this.yaw) * vz;
    this.knock = { phase: 'fly', t: 0, tumble: 0, tumbleV: (hs * 0.75 + 2.5) * (facing >= 0 ? 1 : -1), bounces: 0, downT: 0 };
    this.human.anim.state = 'ragdoll';
  }

  /** Física del cuerpo derribado (también la del cuerpo sin vida). */
  _updateKnock(dt) {
    const k = this.knock;
    const h = this.human;
    const col = this.game.collision;
    k.t += dt;
    if (!this.onGround) this.vel.y -= GRAVITY * dt;
    const res = col.resolveCircle(this.pos.x + this.vel.x * dt, this.pos.z + this.vel.z * dt, RADIUS, this.pos.y + 0.25, this.pos.y + 1.3);
    if (res.hit) {
      const vn = this.vel.x * res.nx + this.vel.z * res.nz;
      if (vn < 0) {
        if (vn < -7) this.takeDamage((-vn - 7) * 3.2, 'golpe');
        this.vel.x = (this.vel.x - 1.5 * vn * res.nx) * 0.45;
        this.vel.z = (this.vel.z - 1.5 * vn * res.nz) * 0.45;
        k.tumbleV *= -0.5;
      }
    }
    if (this.game.pushOutOfDynamic) this.game.pushOutOfDynamic(res, RADIUS, this);
    this.pos.x = res.x;
    this.pos.z = res.z;
    this.pos.y += this.vel.y * dt;
    const gy = col.surfaceBelow(this.pos.x, this.pos.z, this.pos.y + 0.6);
    // al agua: se recupera nadando
    if (!this.dead && WATER_LEVEL - gy > 1.35 && this.pos.y < WATER_LEVEL - 0.3) {
      this.knock = null;
      this.swimming = true;
      this.vel.set(this.vel.x * 0.25, 0, this.vel.z * 0.25);
      h.object.rotation.set(0, this.yaw, 0);
      this.emit({ type: 'splash' });
      return;
    }
    if (this.pos.y <= gy) {
      const impact = -this.vel.y;
      this.pos.y = gy;
      if (!this.onGround) {
        if (impact > 3) this.emit({ type: 'land', hard: impact > 9 });
        if (impact > 14) this.takeDamage((impact - 14) * 6, 'caída');
        if (impact > 5 && k.bounces < 1) {
          this.vel.y = impact * 0.22;
          k.bounces++;
        } else {
          this.vel.y = 0;
          this.onGround = true;
        }
      }
      const f = Math.exp(-dt * (k.phase === 'fly' ? 3.5 : 7));
      this.vel.x *= f;
      this.vel.z *= f;
    } else if (this.pos.y - gy > 0.05) this.onGround = false;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (k.phase === 'fly') {
      k.tumble += k.tumbleV * dt;
      if (this.onGround && (k.t > 0.25 || hs < 2)) {
        // pose final según cómo quedó el cuerpo (boca arriba / boca abajo)
        const a = wrapAngle(k.tumble);
        const faceDown = a > 0;
        h.anim.deadPose = faceDown ? 0.5 + Math.random() * 0.5 : Math.random() * 0.5;
        h.anim.state = this.dead ? 'dead' : 'down';
        const r = faceDown ? Math.PI / 2 : -Math.PI / 2;
        h.bones[BONES.root].quaternion.setFromEuler(new THREE.Euler(r, 0, 0, 'YXZ'));
        k.tumble = wrapAngle(a - r);
        k.phase = 'down';
        k.downT = 0;
      }
    } else {
      k.tumble = damp(k.tumble, 0, 9, dt);
      if (k.phase === 'down' && this.onGround && hs < 0.6) {
        k.downT += dt;
        if (!this.dead && k.downT > 1.4) {
          k.phase = 'getup';
          k.t = 0;
          h.anim.state = 'getup';
          this.emit({ type: 'getup' });
        }
      } else if (k.phase === 'getup' && k.t > 0.9) {
        this.knock = null;
        h.anim.state = 'idle';
      }
    }
    if (this.vel.x * this.vel.x + this.vel.z * this.vel.z > 4 && k.phase === 'fly') this.yaw = dampAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 3, dt);
    h.object.position.copy(this.pos);
    h.object.rotation.set(this.knock ? k.tumble : 0, this.yaw, 0);
    h.animate(dt);
  }

  /** Avance del jugador a pie. cam = CameraRig. */
  update(dt, input, cam) {
    this.time += dt;
    const h = this.human;
    if (this.vehicle) return;
    if (this.knock) return this._updateKnock(dt);
    if (this.dead) {
      // cuerpo sin vida: cae hasta el suelo
      if (!this.onGround || this.pos.y > this.game.collision.surfaceBelow(this.pos.x, this.pos.z, this.pos.y + 0.6) + 0.02) {
        this.knock = { phase: 'down', t: 0, tumble: 0, tumbleV: 0, bounces: 1, downT: 0 };
        this.onGround = false;
        return this._updateKnock(dt);
      }
      h.animate(dt);
      return;
    }
    const col = this.game.collision;
    const world = this.game.world;
    const canAct = !this.frozen && input && input.enabled;
    // Intención de movimiento relativa a la cámara
    let mx = canAct ? input.move.x : 0, my = canAct ? input.move.y : 0;
    const fwd = cam.forward(new THREE.Vector3());
    const right = cam.right(new THREE.Vector3());
    const wish = new THREE.Vector3().addScaledVector(fwd, my).addScaledVector(right, mx);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.001) wish.normalize();
    // Estados
    this.aiming = canAct && input.down('aim') && !this.swimming;
    if (canAct && input.pressed('crouch') && !this.swimming) this.crouch = !this.crouch;
    const wantSprint = canAct && input.down('sprint') && wishLen > 0.3 && !this.crouch;
    if (this.stamina < 4) this.staminaLock = true;
    if (this.stamina > 25) this.staminaLock = false;
    this.sprinting = wantSprint && !this.staminaLock && !this.aiming;
    if (this.sprinting) this.crouch = false;
    // Agua
    const ground = col.surfaceBelow(this.pos.x, this.pos.z, this.pos.y + 0.6);
    const depth = WATER_LEVEL - ground;
    this.swimming = depth > 1.35 && (this.swimming || this.pos.y <= WATER_LEVEL - 0.25);
    this.wading = !this.swimming && depth > 0.35;
    // Velocidad objetivo
    let speed;
    if (this.swimming) speed = this.sprinting ? 3.3 : 1.9;
    else if (this.crouch) speed = 1.9;
    else if (this.aiming) speed = 2.6;
    else if (this.sprinting) speed = 7.1;
    else speed = wishLen < 0.55 ? 1.7 : 4.6;
    if (this.wading) speed *= 0.6;
    speed *= wishLen > 0.001 ? Math.max(0.35, wishLen) : 0;
    // Estamina y regeneración
    if (this.sprinting && wishLen > 0.3) this.stamina = Math.max(0, this.stamina - dt * (this.swimming ? 18 : 13) * (this.game.staminaDrain || 1));
    else if (this.time - (this._lastSprint || 0) > 0.8) this.stamina = Math.min(this.staminaMax, this.stamina + dt * 20);
    if (this.sprinting) this._lastSprint = this.time;
    if (this.time - this.lastDamage > 7 && this.health < 60) this.health = Math.min(60, this.health + dt * 2.5);
    // Aceleración horizontal
    const accel = this.onGround || this.swimming ? (speed > 0.1 ? 15 : 18) : 3.5;
    const tvx = wish.x * speed, tvz = wish.z * speed;
    this.vel.x = damp(this.vel.x, tvx, accel * 0.6, dt);
    this.vel.z = damp(this.vel.z, tvz, accel * 0.6, dt);
    // Orientación
    if (this.aiming) this.yaw = dampAngle(this.yaw, cam.yaw, 22, dt);
    else if (wishLen > 0.05 && (this.onGround || this.swimming)) this.yaw = dampAngle(this.yaw, Math.atan2(wish.x, wish.z), this.sprinting ? 9 : 12, dt);
    // Salto y gravedad
    if (this.swimming) {
      this.vel.y = 0;
      this.pos.y = damp(this.pos.y, WATER_LEVEL - 0.6 + Math.sin(this.time * 1.7) * 0.04, 6, dt);
      this.onGround = false;
    } else {
      if (canAct && input.pressed('jump') && this.onGround && !this.crouch) {
        this.vel.y = 6.3;
        this.onGround = false;
        this.stats.jumps++;
        this.emit({ type: 'jump' });
      }
      this.vel.y -= GRAVITY * dt;
    }
    // Integración horizontal con colisiones
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const res = col.resolveCircle(nx, nz, RADIUS, this.pos.y + 0.35, this.pos.y + 1.75);
    if (res.hit) {
      const vn = this.vel.x * res.nx + this.vel.z * res.nz;
      if (vn < 0) {
        this.vel.x -= vn * res.nx;
        this.vel.z -= vn * res.nz;
      }
    }
    // Empuje de vehículos y personas (resuelto por el juego)
    if (this.game.pushOutOfDynamic) this.game.pushOutOfDynamic(res, RADIUS, this);
    const moved = Math.hypot(res.x - this.pos.x, res.z - this.pos.z);
    this.pos.x = res.x;
    this.pos.z = res.z;
    if (this.swimming) this.stats.swum += moved;
    else this.stats.walked += moved;
    // Vertical
    if (!this.swimming) {
      this.pos.y += this.vel.y * dt;
      const gy = col.surfaceBelow(this.pos.x, this.pos.z, this.pos.y + 0.55);
      if (this.pos.y <= gy) {
        if (!this.onGround && this.vel.y < -15) {
          const dmg = (-this.vel.y - 15) * 7;
          this.takeDamage(dmg, 'caída');
          this.stats.falls++;
          this.emit({ type: 'land', hard: true });
        } else if (!this.onGround && this.airTime > 0.25) this.emit({ type: 'land', hard: false });
        this.pos.y = gy;
        this.vel.y = 0;
        this.onGround = true;
        this.airTime = 0;
      } else if (this.pos.y - gy < 0.25 && this.vel.y <= 0 && this.onGround) {
        // pegado al suelo al bajar escalones/cordones
        this.pos.y = gy;
        this.vel.y = 0;
      } else {
        this.onGround = false;
        this.airTime += dt;
      }
      // agua poco profunda: no hundirse por debajo del fondo
      if (this.pos.y < gy) this.pos.y = gy;
    }
    // Animación
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const a = h.anim;
    if (this.swimming) a.state = 'swim';
    else if (!this.onGround && this.airTime > 0.12) a.state = this.vel.y > 0 ? 'jump' : this.airTime > 0.6 ? 'fall' : 'jump';
    else if (this.crouch) a.state = 'crouch';
    else a.state = hs > 0.2 ? (hs > 5.6 ? 'sprint' : hs > 2.4 ? 'run' : 'walk') : 'idle';
    a.speed = hs;
    a.lean = clamp(angleDiff(this.yaw, Math.atan2(this.vel.x, this.vel.z)) * hs * 0.05, -0.3, 0.3);
    a.aim = this.aiming ? 1 : 0;
    a.aimPitch = -cam.pitch + 0.15;
    a.aimYaw = angleDiff(this.yaw, cam.yaw);
    // pasos
    if (this.onGround && hs > 0.5) {
      const prev = Math.floor(this.stepPhase / Math.PI);
      this.stepPhase = a.phase;
      if (Math.floor(this.stepPhase / Math.PI) !== prev) this.emit({ type: 'step', speed: hs, wading: this.wading });
    }
    h.object.position.copy(this.pos);
    h.object.rotation.set(0, this.yaw, 0);
    h.animate(dt);
  }

  get forwardVec() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  serialize() {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, health: this.health, armor: this.armor, app: this.human.app };
  }
}

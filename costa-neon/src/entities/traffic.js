// Tránsito: autos por carriles con semáforos, giros, distancia de seguimiento y reacciones; conductor por ruta reutilizable.
import * as THREE from 'three';
import { LANES } from '../world/map.js';
import { clamp, damp, moveToward, angleDiff, wrapAngle, rand } from '../core/utils.js';

const TRAFFIC_MIX = [['sedan', 24], ['rural', 12], ['compacto', 23], ['suv', 15], ['taxi', 10], ['furgon', 7], ['pickup', 6], ['muscle', 3], ['deportivo', 2], ['moto', 2]];

function pickModel() {
  let tot = TRAFFIC_MIX.reduce((s, m) => s + m[1], 0), r = Math.random() * tot;
  for (const [id, w] of TRAFFIC_MIX) if ((r -= w) <= 0) return id;
  return 'sedan';
}

/** Geometría de un carril dirigido a→b. */
function laneGeom(a, b, lane) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const d = { x: dx / len, z: dz / len };
  const r = { x: -d.z, z: d.x };
  const off = LANES[lane];
  const start = { x: a.x + d.x * 9 + r.x * off, z: a.z + d.z * 9 + r.z * off };
  const end = { x: b.x - d.x * 9 + r.x * off, z: b.z - d.z * 9 + r.z * off };
  return { d, r, off, start, end, len: Math.max(1, len - 18) };
}

function bezier(p0, p1, p2, t, out) {
  const u = 1 - t;
  out.x = u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x;
  out.z = u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z;
  return out;
}
function bezierTangent(p0, p1, p2, t) {
  const x = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
  const z = 2 * (1 - t) * (p1.z - p0.z) + 2 * t * (p2.z - p1.z);
  return Math.atan2(x, z);
}

// ------------------------------------------------------------------ conductor de carril (cinemático)
export class LaneDriver {
  constructor(tm, v, a, b, lane, s) {
    this.tm = tm;
    this.v = v;
    this.setEdge(a, b, lane);
    this.s = s;
    this.phase = 'lane';
    this.speed = 0;
    this.personality = rand.range(0.85, 1.15);
    this.desired = rand.range(12, 15) * this.personality;
    this.honkT = 0;
    this.waitT = 0;
    this.state = 'driving';
    this.disturbedT = 0;
  }

  setEdge(a, b, lane) {
    this.a = a;
    this.b = b;
    this.lane = lane;
    this.g = laneGeom(a, b, lane);
  }

  axis() {
    return Math.abs(this.g.d.x) > 0.5 ? 'ew' : 'ns';
  }

  _chooseNext() {
    const W = this.tm.game.world;
    const b = this.b;
    const options = b.nb.map((e) => W.nodes[e.node]).filter((n) => n !== this.a);
    if (!options.length) return { next: this.a, lane: this.lane, kind: 'uturn' };
    const d = this.g.d;
    const scored = options.map((n) => {
      const dx = n.x - b.x, dz = n.z - b.z, l = Math.hypot(dx, dz);
      const cross = d.x * (dz / l) - d.z * (dx / l);
      const dot = d.x * (dx / l) + d.z * (dz / l);
      const kind = dot > 0.7 ? 'straight' : cross > 0 ? 'right' : 'left';
      const w = kind === 'straight' ? 55 : kind === 'right' ? 25 : 20;
      return { n, kind, w };
    });
    let tot = scored.reduce((s, x) => s + x.w, 0), r = Math.random() * tot;
    let pick = scored[0];
    for (const x of scored) if ((r -= x.w) <= 0) {
      pick = x;
      break;
    }
    const lane = pick.kind === 'right' ? 1 : pick.kind === 'left' ? 0 : Math.random() < 0.12 ? 1 - this.lane : this.lane;
    return { next: pick.n, lane, kind: pick.kind };
  }

  /** Distancia libre por delante (vehículos, jugador, peatones en el camino). */
  _gapAhead(px, pz, heading) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    let gap = Infinity;
    const game = this.tm.game;
    const check = (x, z, halfLen, w = 1.6) => {
      const dx = x - px, dz = z - pz;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 38) return;
      const lat = Math.abs(dx * fz - dz * fx);
      if (lat > w) return;
      gap = Math.min(gap, along - halfLen - this.v.length / 2);
    };
    for (const o of game.vehicles.list) {
      if (o === this.v || o.sunk) continue;
      check(o.pos.x, o.pos.z, o.length / 2, 1.7);
    }
    const p = game.player;
    if (!p.vehicle && !p.dead) check(p.pos.x, p.pos.z, 0.4, 1.4);
    if (game.peds) for (const h of game.peds.list) if (!h.dead) check(h.pos.x, h.pos.z, 0.3, 1.3);
    return gap;
  }

  onHit(other, impact) {
    if (impact < 1.5) return;
    const v = this.v;
    v.mode = 'physics';
    this.state = 'disturbed';
    this.disturbedT = 0;
    this.angry = impact > 6 && (other && other.driver === 'player');
  }

  update(dt) {
    const v = this.v;
    const game = this.tm.game;
    if (this.state === 'disturbed') return this._disturbed(dt);
    if (this.state === 'parkedAfter') return this._parkedAfter(dt);
    if ((this.state === 'flee' || this.state === 'resume') && this.path) return this._offLane(dt);
    if (v.destroyed || !v.engineOn) {
      v.mode = 'physics';
      this.state = 'disturbed';
      return;
    }
    const W = game.world;
    let x, z, heading, remaining;
    if (this.phase === 'lane') {
      x = this.g.start.x + this.g.d.x * this.s;
      z = this.g.start.z + this.g.d.z * this.s;
      heading = Math.atan2(this.g.d.x, this.g.d.z);
      remaining = this.g.len - this.s;
    } else {
      const t = this.turn;
      const p = bezier(t.p0, t.p1, t.p2, t.t, { x: 0, z: 0 });
      x = p.x;
      z = p.z;
      heading = bezierTangent(t.p0, t.p1, t.p2, t.t);
      remaining = (1 - t.t) * t.len;
    }
    // velocidad objetivo
    let target = this.desired;
    if (this.phase === 'turn' && this.turn.kind !== 'straight') target = 6.5;
    if (this.phase === 'lane') {
      // semáforo / cruce
      const b = this.b;
      const distToEnd = remaining;
      if (distToEnd < 28) {
        if (b.light) {
          const st = W.lightState(b, this.axis(), game.time + 0);
          if (st === 'r' || (st === 'y' && distToEnd > 7)) target = Math.min(target, Math.max(0, (distToEnd - 1.5) * 0.7));
        } else if (b.grid === 'isla') {
          target = Math.min(target, 4 + distToEnd * 0.4);
        }
        // giro a la izquierda: ceder ante tránsito de frente
        if (!this.nextChoice) this.nextChoice = this._chooseNext();
        if (distToEnd < 10 && this.nextChoice.kind === 'left' && this._oncoming()) target = Math.min(target, Math.max(0, (distToEnd - 1.5) * 0.6));
        if (distToEnd < 10 && b.grid === 'isla' && this._intersectionBusy()) target = Math.min(target, Math.max(0, (distToEnd - 1) * 0.5));
      }
    }
    const gap = this._gapAhead(x, z, heading);
    if (gap < 30) target = Math.min(target, Math.max(0, (gap - 2.5) * 0.85));
    // bocina si espera bloqueado por el jugador
    if (gap < 4 && this.speed < 0.5) {
      this.waitT += dt;
      if (this.waitT > 2.5 && this.honkT <= 0 && v.pos.distanceTo(game.engine.camera.position) < 60) {
        game.audio.play('horn', { pos: v.pos, volume: 0.6 });
        this.honkT = rand.range(2, 4);
      }
    } else this.waitT = 0;
    this.honkT -= dt;
    const acc = target > this.speed ? 2.6 : 7.5;
    const prevSpeed = this.speed;
    this.speed = moveToward(this.speed, target, acc * dt);
    // avanzar
    if (this.phase === 'lane') {
      this.s += this.speed * dt;
      if (this.s >= this.g.len) {
        const over = this.s - this.g.len;
        const ch = this.nextChoice || this._chooseNext();
        this.nextChoice = ch;
        this._beginTurnWith(ch);
        this.turn.t = Math.min(1, over / this.turn.len);
      }
    } else {
      const t = this.turn;
      t.t += (this.speed * dt) / t.len;
      if (t.t >= 1) {
        const over = (t.t - 1) * t.len;
        this.setEdge(this.b, t.next, t.lane);
        this.phase = 'lane';
        this.s = over;
        this.nextChoice = null;
      }
    }
    // intermitente: anuncia el giro ~35 m antes y lo mantiene durante la curva
    if (this.phase === 'turn') v.blink = this.turn.kind === 'left' ? 'left' : this.turn.kind === 'right' ? 'right' : null;
    else if (this.nextChoice && remaining < 35) v.blink = this.nextChoice.kind === 'left' ? 'left' : this.nextChoice.kind === 'right' ? 'right' : null;
    else v.blink = null;
    // aplicar al vehículo (con la transición suave al reincorporarse al carril)
    if (this.offX || this.offZ || this.offYaw) {
      const k = Math.exp(-dt * 1.6);
      this.offX *= k;
      this.offZ *= k;
      this.offYaw *= k;
      if (Math.abs(this.offX) + Math.abs(this.offZ) + Math.abs(this.offYaw) < 0.01) this.offX = this.offZ = this.offYaw = 0;
      x += this.offX;
      z += this.offZ;
      heading = wrapAngle(heading + this.offYaw);
    }
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const dyaw = angleDiff(v.yaw, heading);
    v.pos.x = x;
    v.pos.z = z;
    v.yawRate = dyaw / Math.max(dt, 1e-3);
    v.yaw = heading;
    v.vel.set(fx * this.speed, 0, fz * this.speed);
    v.speed = this.speed;
    v.braking = this.speed < prevSpeed - 0.01 && this.speed > 0.1 || target < 0.5;
    v.controls.throttle = this.speed > prevSpeed ? 0.5 : 0.1;
    v.steerAngle = damp(v.steerAngle, clamp(-dyaw * 8, -0.5, 0.5), 6, dt);
  }

  _beginTurnWith(ch) {
    const g2 = laneGeom(this.b, ch.next, ch.lane);
    const p0 = { ...this.g.end }, p2 = { ...g2.start };
    let p1;
    if (ch.kind === 'straight' || ch.kind === 'uturn') p1 = { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 };
    else p1 = { x: this.b.x + this.g.r.x * this.g.off + g2.r.x * g2.off, z: this.b.z + this.g.r.z * this.g.off + g2.r.z * g2.off };
    let len = 0;
    const tmp = { x: 0, z: 0 };
    let prev = { ...p0 };
    for (let i = 1; i <= 10; i++) {
      bezier(p0, p1, p2, i / 10, tmp);
      len += Math.hypot(tmp.x - prev.x, tmp.z - prev.z);
      prev = { ...tmp };
    }
    this.turn = { p0, p1, p2, len: Math.max(1, len), t: 0, next: ch.next, lane: ch.lane, kind: ch.kind };
    this.phase = 'turn';
  }

  _oncoming() {
    for (const c of this.tm.cars) {
      const ai = c.ai;
      if (!ai || ai === this || ai.phase !== 'lane') continue;
      if (ai.b === this.b && ai.a !== this.a && ai.g.d.x * this.g.d.x + ai.g.d.z * this.g.d.z < -0.7 && ai.g.len - ai.s < 30 && ai.speed > 2) return true;
    }
    return false;
  }

  _intersectionBusy() {
    for (const c of this.tm.cars) {
      if (c === this.v || !c.ai) continue;
      if (Math.hypot(c.pos.x - this.b.x, c.pos.z - this.b.z) < 10 && c.ai.speed > 1) return true;
    }
    return false;
  }

  _disturbed(dt) {
    const v = this.v;
    this.disturbedT += dt;
    v.controls.throttle = 0;
    v.controls.brake = 1;
    v.controls.steer = 0;
    v.controls.handbrake = false;
    if (this.disturbedT > 2.5 && Math.abs(v.speed) < 0.6 && !v.destroyed && v.engineOn) {
      if (this.angry || Math.random() < 0.5) {
        // escapa por la red vial
        this.state = 'flee';
        this.path = new PathDriver(this.tm.game, v, { aggressive: true, speed: 30, careful: true });
        this._routeAway();
      } else {
        this.state = 'parkedAfter';
        this.waitT = 0;
      }
    }
  }

  /** Se queda detenido un rato (susto, choque leve) y después retoma la marcha con calma. */
  _parkedAfter(dt) {
    const v = this.v;
    const c = v.controls;
    c.throttle = 0;
    c.brake = 1;
    c.steer = 0;
    c.handbrake = false;
    this.waitT += dt;
    if (this.waitT > rand.range(4, 7) && !v.destroyed && v.engineOn) {
      this.state = 'resume';
      this.path = new PathDriver(this.tm.game, v, { speed: 12, careful: true });
      this._routeAway();
    }
  }

  /** Destino lejano en la dirección general del auto (evita dar media vuelta). */
  _routeAway() {
    const v = this.v;
    const W = this.tm.game.world;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let best = null, bs = -Infinity;
    for (let i = 0; i < 14; i++) {
      const n = W.nodes[(Math.random() * W.nodes.length) | 0];
      const dx = n.x - v.pos.x, dz = n.z - v.pos.z, d = Math.hypot(dx, dz);
      if (d < 120) continue;
      const score = (dx * fx + dz * fz) / d + Math.min(1, d / 400) * 0.3;
      if (score > bs) {
        bs = score;
        best = n;
      }
    }
    if (!best) best = W.nodes[(Math.random() * W.nodes.length) | 0];
    this.path.routeTo(best.x, best.z);
  }

  /** Conducción física fuera del carril (huida o regreso) hasta poder reincorporarse al tránsito. */
  _offLane(dt) {
    const v = this.v;
    if (v.destroyed || !v.engineOn) {
      v.controls.throttle = 0;
      v.controls.brake = 1;
      return;
    }
    this.path.update(dt);
    this.rejoinT = (this.rejoinT || 0) - dt;
    if (this.rejoinT > 0) return;
    this.rejoinT = 0.35;
    // la huida dura al menos unos segundos antes de calmarse
    this.offT = (this.offT || 0) + 0.35;
    if (this.state === 'flee' && this.offT < 12) return;
    if (this._tryRejoin()) return;
    if (this.path.done) this._routeAway();
  }

  /** Busca un carril alineado con el auto y vuelve al modo cinemático sin saltos visibles. */
  _tryRejoin() {
    const v = this.v;
    if (v.speed < 3 || !v.onGround) return false;
    const W = this.tm.game.world;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    for (const a of W.nodes) {
      if (Math.abs(a.x - v.pos.x) > 100 || Math.abs(a.z - v.pos.z) > 100) continue;
      for (const e of a.nb) {
        const b = W.nodes[e.node];
        for (const lane of [0, 1]) {
          const g = laneGeom(a, b, lane);
          if (g.d.x * fx + g.d.z * fz < 0.94) break;
          const px = v.pos.x - g.start.x, pz = v.pos.z - g.start.z;
          const sAlong = px * g.d.x + pz * g.d.z;
          const lat = px * g.r.x + pz * g.r.z;
          if (sAlong < 3 || sAlong > g.len - 8 || Math.abs(lat) > 1.3) continue;
          const lx = g.start.x + g.d.x * sAlong, lz = g.start.z + g.d.z * sAlong;
          this.setEdge(a, b, lane);
          this.s = sAlong;
          this.phase = 'lane';
          this.state = 'driving';
          this.nextChoice = null;
          this.path = null;
          this.offT = 0;
          this.speed = Math.min(v.speed, this.desired);
          this.offX = v.pos.x - lx;
          this.offZ = v.pos.z - lz;
          this.offYaw = angleDiff(Math.atan2(g.d.x, g.d.z), v.yaw);
          v.mode = 'kinematic';
          v.controls.brake = 0;
          v.controls.handbrake = false;
          v.spin = 0;
          return true;
        }
      }
    }
    return false;
  }
}

// ------------------------------------------------------------------ conductor por ruta (física)
export class PathDriver {
  constructor(game, v, opts = {}) {
    this.game = game;
    this.v = v;
    this.waypoints = [];
    this.wi = 0;
    this.aggressive = !!opts.aggressive;
    this.maxSpeed = opts.speed || 26;
    this.stuckT = 0;
    this.reverseT = 0;
    this.lane = opts.lane ?? 2.6;
    this.careful = !!opts.careful;
  }

  /** Distancia al vehículo más cercano por delante en el propio carril. */
  _gapAhead() {
    const v = this.v;
    const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
    let gap = Infinity;
    for (const o of this.game.vehicles.list) {
      if (o === v || o.sunk) continue;
      const dx = o.pos.x - v.pos.x, dz = o.pos.z - v.pos.z;
      const along = dx * fx + dz * fz;
      if (along <= 0 || along > 30) continue;
      if (Math.abs(dx * fz - dz * fx) > 1.9) continue;
      gap = Math.min(gap, along - (o.length + v.length) / 2);
    }
    return gap;
  }

  /** Ruta por la red vial hasta (x,z), circulando por la derecha. */
  routeTo(x, z) {
    const W = this.game.world;
    const v = this.v;
    const a = W.nearestNode(v.pos.x, v.pos.z), b = W.nearestNode(x, z);
    const path = W.findPath(a.id, b.id) || [a];
    const pts = [];
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      const prev = path[i - 1], next = path[i + 1];
      let ox = 0, oz = 0;
      const dir = next ? { x: next.x - n.x, z: next.z - n.z } : prev ? { x: n.x - prev.x, z: n.z - prev.z } : { x: 0, z: 1 };
      const l = Math.hypot(dir.x, dir.z) || 1;
      ox = (-dir.z / l) * this.lane;
      oz = (dir.x / l) * this.lane;
      pts.push({ x: n.x + ox, z: n.z + oz });
    }
    pts.push({ x, z });
    this.waypoints = pts;
    this.wi = 0;
    // saltar puntos que quedan detrás
    if (pts.length > 1) {
      const p0 = pts[0], p1 = pts[1];
      const dx = p1.x - p0.x, dz = p1.z - p0.z;
      if ((v.pos.x - p0.x) * dx + (v.pos.z - p0.z) * dz > 0) this.wi = 1;
    }
  }

  setTargetDirect(x, z) {
    this.waypoints = [{ x, z }];
    this.wi = 0;
  }

  get done() {
    return this.wi >= this.waypoints.length;
  }

  update(dt, override = null) {
    const v = this.v;
    const c = v.controls;
    if (v.destroyed || !v.engineOn) {
      c.throttle = 0;
      c.brake = 1;
      return;
    }
    let tgt = override || this.waypoints[this.wi];
    if (!tgt) {
      c.throttle = 0;
      c.brake = 1;
      return;
    }
    const dx = tgt.x - v.pos.x, dz = tgt.z - v.pos.z;
    const dist = Math.hypot(dx, dz);
    if (!override && dist < (this.wi < this.waypoints.length - 1 ? 9 : 4)) {
      this.wi++;
      tgt = this.waypoints[this.wi];
      if (!tgt) return;
    }
    const want = Math.atan2(dx, dz);
    const err = angleDiff(v.yaw, want);
    // evitar obstáculos con antenas
    let avoid = 0;
    const col = this.game.collision;
    for (const side of [-1, 1]) {
      const a = v.yaw + side * 0.35;
      const h = col.raycast(v.pos.x, v.pos.y + 0.8, v.pos.z, Math.sin(a), 0, Math.cos(a), 9 + Math.abs(v.speed) * 0.5, { ignoreSmall: true, ignoreGround: true });
      if (h) avoid -= side * (1 - h.t / (9 + Math.abs(v.speed) * 0.5));
    }
    const steer = clamp(-err * 2.4 + avoid * 0.9, -1, 1);
    // velocidad según curva próxima
    let target = this.maxSpeed;
    const next = this.waypoints[this.wi + 1];
    if (next && !override) {
      const a2 = Math.atan2(next.x - tgt.x, next.z - tgt.z);
      const corner = Math.abs(angleDiff(want, a2));
      if (dist < 35) target = Math.min(target, this.maxSpeed * (1 - corner / Math.PI) + 7);
    }
    if (Math.abs(err) > 1.2) target = Math.min(target, 7);
    if (this.careful) {
      const gap = this._gapAhead();
      if (gap < 26) target = Math.min(target, Math.max(0, (gap - 3) * (this.aggressive ? 1.4 : 0.9)));
    }
    const spd = v.speed;
    c.steer = steer;
    c.handbrake = this.aggressive && Math.abs(err) > 0.9 && spd > 14;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      c.throttle = 0;
      c.brake = 1;
      c.steer = -steer;
      return;
    }
    if (target < 0.5) {
      c.throttle = 0;
      c.brake = 1;
    } else if (spd < target - 1) {
      c.throttle = 1;
      c.brake = 0;
    } else if (spd > target + 2) {
      c.throttle = 0;
      c.brake = 0.7;
    } else {
      c.throttle = 0.35;
      c.brake = 0;
    }
    // atascado
    if (Math.abs(spd) < 1 && c.throttle > 0.5) {
      this.stuckT += dt;
      if (this.stuckT > 1.6) {
        this.reverseT = 1.3;
        this.stuckT = 0;
      }
    } else this.stuckT = 0;
  }
}

// ------------------------------------------------------------------ gestor de tránsito
export class TrafficManager {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.spawnT = 0;
    this.enabled = true;
  }

  get target() {
    return Math.round(36 * this.game.engine.q.density * (this.game.trafficMul ?? 1));
  }

  /**
   * Agrega un auto en un carril cercano. hidden=false permite aparecer a la vista (sólo al
   * poblar la ciudad al inicio o tras un teletransporte, con la pantalla cubierta).
   */
  _spawnOne(hidden = true) {
    const game = this.game;
    const W = game.world;
    const ref = game.player.vehicle ? game.player.vehicle.pos : game.player.pos;
    const cam = game.engine.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const minD = hidden ? 55 : 18, maxD = hidden ? 230 : 200;
    for (let tries = 0; tries < 16; tries++) {
      const n = W.nodes[(Math.random() * W.nodes.length) | 0];
      const d = Math.hypot(n.x - ref.x, n.z - ref.z);
      if (d < minD - 60 || d > maxD + 40) continue;
      const e = n.nb[(Math.random() * n.nb.length) | 0];
      const b = W.nodes[e.node];
      const lane = Math.random() < 0.5 ? 0 : 1;
      const g = laneGeom(n, b, lane);
      const s = Math.random() * g.len;
      const x = g.start.x + g.d.x * s, z = g.start.z + g.d.z * s;
      const pd = Math.hypot(x - ref.x, z - ref.z);
      if (pd < minD || pd > maxD) continue;
      const dx = x - cam.position.x, dz = z - cam.position.z;
      const dd = Math.hypot(dx, dz);
      const inFront = (dx * fwd.x + dz * fwd.z) / dd > 0.3;
      // no aparecer a la vista: detrás de la cámara, o lejos (la bruma y el tamaño lo disimulan)
      if (hidden && inFront && dd < 120 && game.collision.lineOfSight(cam.position.x, cam.position.y, cam.position.z, x, 1, z)) continue;
      if (this.cars.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 16)) continue;
      if (game.vehicles.list.some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 10)) continue;
      const v = game.vehicles.spawn(pickModel(), x, z, Math.atan2(g.d.x, g.d.z), { mode: 'kinematic', engineOn: true, driver: 'npc' });
      if (!v) return;
      v.ai = new LaneDriver(this, v, n, b, lane, s);
      v.ai.speed = v.ai.desired * 0.8;
      v.npcDriver = true;
      if (game.peds) game.peds.assignDriver(v);
      this.cars.push(v);
      return;
    }
  }

  release(v) {
    this.cars = this.cars.filter((c) => c !== v);
    if (v.ai instanceof LaneDriver) v.ai = null;
  }

  /** Llena la ciudad alrededor del jugador (inicio de partida o tras un salto lejano). */
  populate() {
    let guard = 0;
    while (this.cars.length < this.target && guard++ < this.target * 3) this._spawnOne(false);
  }

  update(dt) {
    const game = this.game;
    // limpiar
    this.cars = this.cars.filter((c) => game.vehicles.list.includes(c) && c.driver === 'npc');
    const ref = game.player.vehicle ? game.player.vehicle.pos : game.player.pos;
    if (this.enabled && (!this._lastRef || Math.hypot(ref.x - this._lastRef.x, ref.z - this._lastRef.z) > 150)) {
      // primer cuadro o teletransporte: poblar de golpe
      this.populate();
    }
    this._lastRef = { x: ref.x, z: ref.z };
    if (this.enabled) {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.cars.length < this.target) {
        this._spawnOne();
        this.spawnT = 0.25;
      }
    }
    for (const v of [...this.cars]) {
      if (v.ai) v.ai.update(dt);
      const d = Math.hypot(v.pos.x - ref.x, v.pos.z - ref.z);
      if (d > 300 && !v.persistent) game.vehicles.remove(v);
    }
  }
}

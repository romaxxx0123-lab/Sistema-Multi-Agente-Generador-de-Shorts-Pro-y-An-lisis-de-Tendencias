// Efectos: partículas (billboards instanciados), marcas de derrape, calcomanías, luces dinámicas y restos.
import * as THREE from 'three';
import { U, FOG_PARS_VERTEX, FOG_VERTEX, FOG_PARS_FRAGMENT } from '../world/shaders.js';
import { rand, clamp } from '../core/utils.js';
import { setDynamic } from '../core/layers.js';

const MAX_P = 2400;

function particleMaterial(additive) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uFogDensity: U.uFogDensity, uFogFalloff: U.uFogFalloff, uFogColor: U.uFogColor, uFogSunColor: U.uFogSunColor, uSunDir: U.uSunDir,
      uLight: { value: new THREE.Color(1, 1, 1) },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aPS;   // xyz posición, w tamaño
      attribute vec4 aCol;  // rgb, alfa
      attribute vec2 aRot;  // rotación, tipo
      varying vec4 vCol; varying vec2 vUv; varying float vType;
      ${FOG_PARS_VERTEX}
      void main(){
        vCol = aCol; vUv = uv; vType = aRot.y;
        vec4 mvPosition = viewMatrix * vec4(aPS.xyz, 1.0);
        float c = cos(aRot.x), s = sin(aRot.x);
        vec2 q = (position.xy) * aPS.w;
        mvPosition.xy += vec2(q.x * c - q.y * s, q.x * s + q.y * c);
        gl_Position = projectionMatrix * mvPosition;
        ${FOG_VERTEX}
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLight; uniform vec3 uSunDir;
      varying vec4 vCol; varying vec2 vUv; varying float vType;
      ${FOG_PARS_FRAGMENT}
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
      void main(){
        vec2 p = vUv * 2. - 1.;
        float r = length(p);
        float a;
        if (vType < .5) { // humo/polvo: bordes irregulares
          float n = n2(vUv * 4. + vCol.rg * 13.) * .5 + n2(vUv * 9. - vCol.b * 7.) * .3;
          a = smoothstep(1., .25, r + n * .45 - .2);
        } else if (vType < 1.5) { // fuego/fogonazo
          float n = n2(vUv * 5. + vCol.a * 9.);
          a = smoothstep(1., .0, r + n * .5 - .15);
        } else { // chispa: punto brillante
          a = smoothstep(1., .0, r);
          a *= a;
        }
        a *= vCol.a;
        if (a < .004) discard;
        vec3 col = vCol.rgb;
        #if ${additive ? 0 : 1}
          col *= uLight;
        #endif
        gl_FragColor = vec4(col, a);
        #ifdef USE_FOG
          vec3 fogRd; float fogF = heightFog(cameraPosition, vFogWP, fogRd);
          #if ${additive ? 1 : 0}
            gl_FragColor.rgb *= 1. - fogF;
          #else
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogTint(fogRd), fogF);
          #endif
        #endif
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: true,
  });
}

class ParticlePool {
  constructor(scene, additive) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    this.ps = new Float32Array(MAX_P * 4);
    this.col = new Float32Array(MAX_P * 4);
    this.rot = new Float32Array(MAX_P * 2);
    this.aPS = new THREE.InstancedBufferAttribute(this.ps, 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(this.rot, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPS', this.aPS);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aRot', this.aRot);
    geo.instanceCount = 0;
    this.mat = particleMaterial(additive);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 7;
    scene.add(setDynamic(this.mesh)); // humo/fuego por delante de autos y personas
    this.parts = [];
    this.additive = additive;
  }
  add(p) {
    if (this.parts.length >= MAX_P) this.parts.shift();
    this.parts.push(p);
  }
  update(dt) {
    const alive = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vx *= Math.exp(-p.drag * dt);
      p.vz *= Math.exp(-p.drag * dt);
      p.vy = p.vy * Math.exp(-p.drag * dt) + (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.floor != null && p.y < p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      p.rot += p.spin * dt;
      alive.push(p);
    }
    this.parts = alive;
    const n = alive.length;
    for (let i = 0; i < n; i++) {
      const p = alive[i];
      const t = p.life / p.max;
      const size = p.s0 + (p.s1 - p.s0) * t;
      let a = p.a0 * (t < p.fadeIn ? t / p.fadeIn : 1) * (1 - Math.pow(t, p.fadePow || 1.5));
      this.ps[i * 4] = p.x;
      this.ps[i * 4 + 1] = p.y;
      this.ps[i * 4 + 2] = p.z;
      this.ps[i * 4 + 3] = size;
      let r = p.r, g = p.g, b = p.b;
      if (p.cool) {
        // fuego: blanco-amarillo -> naranja -> rojo oscuro
        const k = Math.min(1, t * 1.6);
        r = p.r * (1 - k * 0.2);
        g = p.g * (1 - k * 0.75);
        b = p.b * (1 - k * 0.95);
      }
      this.col[i * 4] = r;
      this.col[i * 4 + 1] = g;
      this.col[i * 4 + 2] = b;
      this.col[i * 4 + 3] = a;
      this.rot[i * 2] = p.rot;
      this.rot[i * 2 + 1] = p.type;
    }
    this.mesh.geometry.instanceCount = n;
    if (n) {
      this.aPS.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aRot.needsUpdate = true;
    }
  }
}

// ------------------------------------------------------------ marcas de derrape y calcomanías
class SkidMarks {
  constructor(scene, max = 900) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: 0x0b0b0b, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, zero);
    this.alpha = new Float32Array(max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
    this.i = 0;
    this.last = new Map();
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
  }
  /** Agrega un tramo para la rueda `id` hasta el punto p (y = altura del suelo). */
  add(id, p, width = 0.24, strength = 1) {
    const prev = this.last.get(id);
    this.last.set(id, { x: p.x, y: p.y, z: p.z, t: performance.now() });
    if (!prev || performance.now() - prev.t > 200) return;
    const dx = p.x - prev.x, dz = p.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.05 || len > 3) return;
    const yaw = Math.atan2(dx, dz);
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this._m.compose(new THREE.Vector3((p.x + prev.x) / 2, Math.max(p.y, prev.y) + 0.015, (p.z + prev.z) / 2), this._q, new THREE.Vector3(width, 1, len + 0.02));
    this.mesh.setMatrixAt(this.i, this._m);
    const s = 0.35 + 0.65 * clamp(strength, 0, 1);
    this.mesh.instanceColor.setXYZ(this.i, s, s, s);
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.min(this.max, Math.max(this.mesh.count, this.i));
    if (this.mesh.count < this.max && this.i === 0) this.mesh.count = this.max;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
  break(id) {
    this.last.delete(id);
  }
}

class Decals {
  constructor(scene, max = 300) {
    this.max = max;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grd.addColorStop(0, 'rgba(10,10,10,1)');
    grd.addColorStop(0.35, 'rgba(25,22,20,0.9)');
    grd.addColorStop(1, 'rgba(30,28,25,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, color: 0xffffff });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.i = 0;
    scene.add(this.mesh);
  }
  add(pos, normal, size = 0.15) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const rq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * 6.28);
    q.multiply(rq);
    m.compose(new THREE.Vector3().copy(pos).addScaledVector(normal, 0.02), q, new THREE.Vector3(size, size, size));
    this.mesh.setMatrixAt(this.i, m);
    this.i = (this.i + 1) % this.max;
    this.mesh.count = Math.max(this.mesh.count, this.i === 0 ? this.max : this.i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------ luces dinámicas (cantidad fija)
class LightPool {
  constructor(scene, n = 6) {
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 20, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ light: l, t: 0, dur: 0, i0: 0, prio: 0, follow: null, flicker: 0 });
    }
  }
  /** Luz temporal. dur = Infinity para luces persistentes controladas por follow(). */
  flash(pos, color, intensity, range = 18, dur = 0.12, prio = 1, flicker = 0) {
    let best = null;
    for (const s of this.lights) {
      const remaining = s.dur - s.t;
      if (!best || remaining < best.dur - best.t || (s.prio < prio && best.prio >= prio)) best = s;
    }
    best.light.position.copy(pos);
    best.light.color.set(color);
    best.light.distance = range;
    best.i0 = intensity;
    best.t = 0;
    best.dur = dur;
    best.prio = prio;
    best.flicker = flicker;
    best.follow = null;
    best.light.intensity = intensity;
    return best;
  }
  update(dt) {
    for (const s of this.lights) {
      if (s.dur <= 0) continue;
      s.t += dt;
      if (s.t >= s.dur) {
        s.light.intensity = 0;
        s.dur = 0;
        s.prio = 0;
        continue;
      }
      if (s.follow) s.follow(s);
      const k = s.dur === Infinity ? 1 : 1 - s.t / s.dur;
      s.light.intensity = s.i0 * k * (s.flicker ? 0.75 + Math.random() * s.flicker : 1);
    }
  }
}

// ------------------------------------------------------------ sistema principal
export class Effects {
  constructor(game) {
    this.game = game;
    const scene = game.engine.scene;
    this.smoke = new ParticlePool(scene, false);
    this.glow = new ParticlePool(scene, true);
    this.skids = new SkidMarks(scene);
    this.decals = new Decals(scene);
    this.lights = new LightPool(scene, 6);
    this.debris = [];
    this.sprays = [];
    this.burners = [];
  }

  /** Emite partículas de un tipo en una posición. */
  emit(type, pos, opts = {}) {
    const n = opts.count ?? 1;
    const vx0 = opts.vel ? opts.vel.x : 0, vy0 = opts.vel ? opts.vel.y : 0, vz0 = opts.vel ? opts.vel.z : 0;
    const light = this.game.sky ? 0.25 + (1 - this.game.sky.nightK) * 0.75 : 1;
    for (let i = 0; i < n; i++) {
      const base = { x: pos.x, y: pos.y, z: pos.z, vx: vx0, vy: vy0, vz: vz0, life: 0, rot: rand.range(0, 6.28), spin: rand.range(-1, 1), drag: 1, fadeIn: 0.1, type: 0 };
      switch (type) {
        case 'smoke': {
          const d = opts.dark ?? 0.25;
          const c = (0.3 + (1 - d) * 0.45) * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-0.4, 0.4), vy: vy0 + rand.range(0.8, 1.8), vz: vz0 + rand.range(-0.4, 0.4), max: rand.range(1.8, 3.2) * (opts.life || 1), s0: opts.size || 0.5, s1: (opts.size || 0.5) * 4.5, r: c, g: c, b: c * 1.02, a0: opts.alpha ?? 0.45, drag: 1.2, grav: 0.4 });
          break;
        }
        case 'tire': {
          const c = 0.78 * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-0.6, 0.6), vy: rand.range(0.2, 0.7), vz: vz0 + rand.range(-0.6, 0.6), max: rand.range(1.2, 2.2), s0: 0.6, s1: 3.2, r: c, g: c, b: c, a0: 0.28, drag: 2.2, grav: 0.15 });
          break;
        }
        case 'dust': {
          const c = 0.62 * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-1.5, 1.5), vy: rand.range(0.3, 1.2), vz: vz0 + rand.range(-1.5, 1.5), max: rand.range(0.6, 1.2), s0: 0.25, s1: 1.3, r: c * 1.05, g: c, b: c * 0.9, a0: 0.4, drag: 2.5 });
          break;
        }
        case 'splash': {
          const c = 0.9 * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-2.5, 2.5), vy: rand.range(2, 5.5), vz: vz0 + rand.range(-2.5, 2.5), max: rand.range(0.6, 1.1), s0: 0.25, s1: 0.9, r: c, g: c, b: c, a0: 0.6, drag: 0.6, grav: -9.8, floor: opts.floor });
          break;
        }
        case 'water': {
          const c = 0.92 * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-0.6, 0.6), vy: rand.range(7, 10), vz: vz0 + rand.range(-0.6, 0.6), max: rand.range(1, 1.5), s0: 0.15, s1: 0.6, r: c, g: c, b: c, a0: 0.55, drag: 0.3, grav: -9.8, floor: opts.floor });
          break;
        }
        case 'fire': {
          this.glow.add({ ...base, vx: vx0 + rand.range(-0.3, 0.3), vy: vy0 + rand.range(1.5, 3), vz: vz0 + rand.range(-0.3, 0.3), max: rand.range(0.45, 0.9), s0: opts.size || 0.7, s1: (opts.size || 0.7) * 0.25, r: 2.6, g: 1.4, b: 0.5, a0: 0.9, type: 1, cool: true, drag: 1, fadeIn: 0.05 });
          break;
        }
        case 'flash': {
          this.glow.add({ ...base, max: opts.life || 0.06, s0: opts.size || 0.6, s1: (opts.size || 0.6) * 1.4, r: 3.2, g: 2.4, b: 1.2, a0: 1, type: 1, fadeIn: 0.01, fadePow: 1, spin: 0 });
          break;
        }
        case 'spark': {
          const sp = opts.speed || 6;
          this.glow.add({ ...base, vx: vx0 + rand.range(-sp, sp), vy: rand.range(0.5, sp), vz: vz0 + rand.range(-sp, sp), max: rand.range(0.25, 0.6), s0: 0.07, s1: 0.03, r: 3, g: 2.1, b: 0.8, a0: 1, type: 2, drag: 0.5, grav: -12, floor: opts.floor, fadeIn: 0.01 });
          break;
        }
        case 'debris': {
          const c = (opts.color ?? 0.35) * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-5, 5), vy: rand.range(2, 9), vz: vz0 + rand.range(-5, 5), max: rand.range(0.8, 1.6), s0: 0.12, s1: 0.1, r: c, g: c * 0.95, b: c * 0.9, a0: 0.95, type: 2, drag: 0.4, grav: -14, floor: opts.floor, fadeIn: 0.01, fadePow: 4 });
          break;
        }
        case 'hit': {
          const c = 0.7 * light;
          this.smoke.add({ ...base, vx: vx0 + rand.range(-0.8, 0.8), vy: rand.range(0.2, 1.2), vz: vz0 + rand.range(-0.8, 0.8), max: rand.range(0.3, 0.6), s0: 0.08, s1: 0.5, r: c, g: c * 0.95, b: c * 0.9, a0: 0.55, drag: 3 });
          break;
        }
      }
    }
  }

  /** Explosión completa: destello, bola de fuego, humo, escombros, luz y onda de choque. */
  explosion(pos, scale = 1) {
    const g = this.game;
    const floor = g.collision ? g.collision.surfaceBelow(pos.x, pos.z, pos.y + 1) : pos.y - 1;
    this.emit('flash', pos, { size: 5 * scale, life: 0.18 });
    for (let i = 0; i < 26 * scale; i++) this.emit('fire', { x: pos.x + rand.range(-1, 1), y: pos.y + rand.range(0, 1.5), z: pos.z + rand.range(-1, 1) }, { size: rand.range(1.5, 3.2) * scale, vel: { x: rand.range(-3, 3), y: rand.range(1, 5), z: rand.range(-3, 3) } });
    for (let i = 0; i < 18 * scale; i++) this.emit('smoke', { x: pos.x + rand.range(-1.5, 1.5), y: pos.y + rand.range(0.5, 2.5), z: pos.z + rand.range(-1.5, 1.5) }, { size: 1.6 * scale, dark: 0.85, alpha: 0.6, life: 1.8, vel: { x: rand.range(-1.5, 1.5), y: rand.range(1, 3), z: rand.range(-1.5, 1.5) } });
    for (let i = 0; i < 30; i++) this.emit('spark', pos, { speed: 12, floor });
    for (let i = 0; i < 16; i++) this.emit('debris', pos, { floor, color: 0.2 });
    this.lights.flash(new THREE.Vector3(pos.x, pos.y + 2, pos.z), 0xffa040, 900 * scale, 45, 0.9, 5, 0.5);
    this.decals.add(new THREE.Vector3(pos.x, floor + 0.01, pos.z), new THREE.Vector3(0, 1, 0), 4.5 * scale);
  }

  /** Fuego persistente que sigue a un objeto (auto en llamas). */
  burn(getPos, duration = 12, size = 1) {
    const b = { getPos, t: 0, dur: duration, size, acc: 0, light: null };
    b.light = this.lights.flash(getPos(), 0xff7a2a, 120 * size, 16, duration, 3, 0.6);
    b.light.follow = (s) => s.light.position.copy(getPos()).add(new THREE.Vector3(0, 1.2, 0));
    this.burners.push(b);
    return b;
  }

  /** Chorro de agua (hidrante roto). */
  spray(pos, duration = 14) {
    this.sprays.push({ pos: { ...pos }, t: 0, dur: duration, acc: 0 });
  }

  /** Objeto que cae (farol, banco) con física simple. */
  topple(mesh, pivot, dir, speed) {
    const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
    this.debris.push({ mesh, pivot: pivot.clone(), axis, ang: 0, w: Math.min(3, 0.6 + speed * 0.12), t: 0, max: 25, vel: new THREE.Vector3(dir.x * speed * 0.3, 0, dir.z * speed * 0.3), baseQ: mesh.quaternion.clone() });
    this.game.engine.scene.add(setDynamic(mesh));
  }

  update(dt) {
    const nightLight = this.game.sky ? 0.25 + (1 - this.game.sky.nightK) * 0.75 : 1;
    this.smoke.mat.uniforms.uLight.value.setScalar(1);
    this.smoke.update(dt);
    this.glow.update(dt);
    this.lights.update(dt);
    for (const b of this.burners) {
      b.t += dt;
      b.acc += dt;
      const p = b.getPos();
      while (b.acc > 0.035) {
        b.acc -= 0.035;
        this.emit('fire', { x: p.x + rand.range(-0.5, 0.5) * b.size, y: p.y + 0.6, z: p.z + rand.range(-0.8, 0.8) * b.size }, { size: rand.range(0.6, 1.3) * b.size });
        if (Math.random() < 0.35) this.emit('smoke', { x: p.x, y: p.y + 1.6, z: p.z }, { size: 0.9 * b.size, dark: 0.9, alpha: 0.5 });
      }
    }
    this.burners = this.burners.filter((b) => b.t < b.dur);
    for (const s of this.sprays) {
      s.t += dt;
      s.acc += dt;
      while (s.acc > 0.03) {
        s.acc -= 0.03;
        this.emit('water', { x: s.pos.x, y: s.pos.y + 0.6, z: s.pos.z }, { floor: s.pos.y });
      }
    }
    this.sprays = this.sprays.filter((s) => s.t < s.dur);
    for (const d of this.debris) {
      d.t += dt;
      if (d.ang < Math.PI / 2 - 0.05) {
        d.w += dt * 3.5;
        d.ang = Math.min(Math.PI / 2 - 0.05, d.ang + d.w * dt);
      }
      d.pivot.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(Math.exp(-dt * 3));
      d.mesh.position.copy(d.pivot);
      d.mesh.quaternion.setFromAxisAngle(d.axis, d.ang).multiply(d.baseQ);
      if (d.t > d.max - 2) d.mesh.scale.multiplyScalar(Math.max(0.0001, 1 - dt));
    }
    for (const d of this.debris.filter((d) => d.t >= d.max)) this.game.engine.scene.remove(d.mesh);
    this.debris = this.debris.filter((d) => d.t < d.max);
  }
}

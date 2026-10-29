/**
 * Partes DINÁMICAS de los props: lo que cambia con el estado de la simulación sin que cambie
 * la distribución del barco (no requiere reconstruir la geometría estática).
 *
 *  - fogón: brasas y llamas en el hogar + vapor de la olla cuando la cocina quema combustible
 *    y tiene cola; luz cálida parpadeante.
 *  - bancal: plantas según la parcela (brote → mata → maduro con frutos; seca/muerta marrón;
 *    plaga con manchas).
 *  - depósito: nivel en el tubo de cristal (agua de la red / capacidad) y goteo si hay fuga.
 *  - generador y motor: vibran y echan humo si funcionan; LED de estado.
 *  - potabilizadora, batería, panel, torno, prensa: LED (y barra de carga en la batería).
 *  - timón: la rueda oscila con el oleaje.
 *  - estanterías y despensa: el contenido visible sigue al llenado del almacén.
 */
import * as THREE from 'three';
import { CROPS } from '../../data/crops';
import type { PropInstance } from '../../sim/ship';
import type { GameState, ModuleInstance, PlotState } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, mix, type ColorLike } from './geo';
import type { LightCandidate } from './lights';
import type { ShipMaterials } from './materials';
import type { Particles } from './particles';
import type { PropModel } from './props';

export interface DynContext {
  state: GameState;
  module: ModuleInstance | undefined;
  /** Tiempo real acumulado (s). */
  t: number;
  dt: number;
  night: number;
  particles: Particles;
  lights: LightCandidate[];
  mats: ShipMaterials;
  /** Nivel visible máximo (para no emitir partículas invisibles). */
  maxLevel: number;
}

export abstract class PropDynamic {
  /** El prop está bajo techo (habitación o bodega): el humo no lo arrastra el viento. */
  indoor = false;
  constructor(
    readonly prop: PropInstance,
    readonly proxy: THREE.Group,
    readonly model: PropModel,
    readonly level: number,
  ) {}
  abstract update(ctx: DynContext): void;
  dispose(): void {
    this.proxy.traverse((o) => {
      if (o instanceof THREE.Mesh && o.userData.ownGeometry) o.geometry.dispose();
    });
  }
  /** Punto local del prop → coordenadas del barco. */
  protected toShip(v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    this.proxy.updateMatrix();
    return out.copy(v).applyMatrix4(this.proxy.matrix);
  }
}

/** Geometría compartida de una llama (tronco de pirámide en tres franjas de color). */
let flameGeo: THREE.BufferGeometry | null = null;
export function flameGeometry(): THREE.BufferGeometry {
  if (flameGeo) return flameGeo;
  const g = new GeoBuilder();
  g.cylinder(0, 0, 0, 1, 0.72, 0.35, 5, '#ff5a1f', { capTop: false });
  g.cylinder(0, 0.35, 0, 0.72, 0.38, 0.35, 5, '#ff9a2e', { capTop: false, capBottom: false });
  g.cylinder(0, 0.7, 0, 0.38, 0, 0.3, 5, '#ffe27a', { capBottom: false });
  flameGeo = g.build();
  return flameGeo;
}

function ledMaterial(m: ShipMaterials, state: 'on' | 'idle' | 'fault' | 'off'): THREE.Material {
  return state === 'on' ? m.ledGreen : state === 'idle' ? m.ledAmber : state === 'fault' ? m.ledRed : m.ledOff;
}

/** Estado del LED de una máquina eléctrica. */
export function machineLed(m: ModuleInstance | undefined): 'on' | 'idle' | 'fault' | 'off' {
  if (!m) return 'off';
  if (m.status === 'broken' || m.fire > 0) return 'fault';
  if (m.status !== 'active' || !m.on) return 'off';
  return m.powered ? 'on' : 'idle';
}

function ledMesh(pos: THREE.Vector3, mats: ShipMaterials): THREE.Mesh {
  const mesh = new THREE.Mesh(ledGeo(), mats.ledOff);
  mesh.position.copy(pos);
  mesh.name = 'led';
  return mesh;
}

let _ledGeo: THREE.BufferGeometry | null = null;
function ledGeo(): THREE.BufferGeometry {
  if (!_ledGeo) _ledGeo = new THREE.BoxGeometry(0.045, 0.045, 0.02);
  return _ledGeo;
}

/* ------------------------------------------------------------------ */

const STOVE_COLOR = new THREE.Color('#ff9a4a');

class StoveDyn extends PropDynamic {
  private flames: THREE.Mesh[] = [];
  private glow: THREE.Mesh;
  private steamAcc = 0;
  private lit = 0;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    const fb = model.anchors.firebox ?? new THREE.Vector3();
    this.glow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.01), new THREE.MeshBasicMaterial({ color: '#ff7b25', transparent: true, opacity: 0 }));
    this.glow.userData.ownGeometry = true;
    this.glow.position.set(fb.x, fb.y - 0.05, fb.z + 0.03);
    proxy.add(this.glow);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(flameGeometry(), mats.fire);
      f.position.set(fb.x - 0.14 + i * 0.14, fb.y - 0.14, fb.z + 0.06);
      f.scale.setScalar(0.001);
      proxy.add(f);
      this.flames.push(f);
    }
  }
  update(c: DynContext): void {
    const m = c.module;
    const on = !!m && m.status === 'active' && m.fire <= 0 && (m.powered || (m.fuelBurn > 0 && m.queue.length > 0));
    this.lit += ((on ? 1 : 0) - this.lit) * Math.min(1, c.dt * 3);
    const mat = this.glow.material as THREE.MeshBasicMaterial;
    mat.opacity = this.lit * (0.75 + 0.2 * Math.sin(c.t * 13) * Math.sin(c.t * 7.7));
    this.glow.visible = this.lit > 0.02;
    this.flames.forEach((f, i) => {
      const k = this.lit * (0.75 + 0.25 * Math.sin(c.t * (9 + i * 2.3) + i));
      f.visible = k > 0.03;
      f.scale.set(0.07 * k, 0.24 * k * (0.85 + 0.3 * Math.sin(c.t * 11 + i * 1.7)), 0.07 * k);
    });
    if (this.lit > 0.3) {
      const fb = this.model.anchors.firebox ?? new THREE.Vector3();
      const p = this.toShip(new THREE.Vector3(fb.x, fb.y + 0.1, fb.z - 0.3));
      const flick = 0.8 + 0.2 * Math.sin(c.t * 17) * Math.sin(c.t * 5.3);
      c.lights.push({ id: `fogon:${this.prop.key}`, x: p.x, y: p.y, z: p.z, level: this.level, intensity: 2.6 * this.lit * flick, color: STOVE_COLOR, distance: 6, priority: 1.5 });
      this.steamAcc += c.dt;
      if (this.steamAcc > 0.28 && this.level <= c.maxLevel) {
        this.steamAcc = 0;
        const pot = this.model.anchors.pot;
        if (pot) {
          const q = this.toShip(pot);
          c.particles.emitPuff('steam', q.x, q.y + 0.05, q.z, this.level, 0.6, 0.5, this.indoor);
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ */

/** Construye la geometría de las plantas de una parcela (en coordenadas locales del bancal). */
export function buildPlantGeometry(plot: PlotState, size: { x: number; z: number }, seed: number): THREE.BufferGeometry | null {
  if (!plot.crop) return null;
  const crop = CROPS[plot.crop];
  const g = new GeoBuilder();
  const growth = THREE.MathUtils.clamp(plot.growth, 0, 1);
  const ripe = growth >= 1;
  const dead = plot.dead;
  const dry = !dead && plot.dryHours > 2;
  const leaf: ColorLike = dead ? '#7a5a3a' : dry ? mix(crop?.color ?? PALETTE.plant, '#c9b458', 0.55) : (crop?.color ?? PALETTE.plant);
  const leafDark: ColorLike = dead ? '#5b4636' : dry ? mix(PALETTE.plantDark, '#a08a3a', 0.5) : PALETTE.plantDark;
  const n = 3;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const h = hash01(seed, i, j);
      const px = (-1 + (2 * (i + 0.5)) / n) * size.x * 0.82 + (h - 0.5) * 0.12;
      const pz = (-1 + (2 * (j + 0.5)) / n) * size.z * 0.82 + (hash01(seed, j, i) - 0.5) * 0.12;
      const s = 0.85 + h * 0.3;
      g.push();
      g.translate(px, 0, pz);
      g.rotateY(h * 6.28);
      if (dead) g.rotateZ(0.5 + h * 0.4);
      if (growth < 0.15) {
        // brote: tallito con dos hojitas
        const k = 0.5 + growth * 4;
        g.cylinder(0, 0, 0, 0.012, 0.01, 0.08 * k, 3, leafDark);
        g.push();
        g.translate(0, 0.08 * k, 0);
        g.box(-0.06 * k, -0.005, -0.02, 0, 0.01, 0.02, leaf);
        g.box(0, -0.005, -0.02, 0.06 * k, 0.01, 0.02, leaf);
        g.pop();
      } else if (plot.crop === 'lino') {
        const hgt = (0.15 + 0.6 * growth) * s;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * 6.28 + h;
          const ox = Math.cos(a) * 0.05;
          const oz = Math.sin(a) * 0.05;
          const lean = dead ? 0.6 : 0.12;
          g.cylinderBetween(ox * 0.3, 0, oz * 0.3, ox + Math.cos(a) * lean * hgt * 0.3, hgt, oz + Math.sin(a) * lean * hgt * 0.3, 0.012, 3, ripe ? mix(leaf, '#c9b458', 0.6) : leaf);
          const tx = ox + Math.cos(a) * lean * hgt * 0.3;
          const tz = oz + Math.sin(a) * lean * hgt * 0.3;
          if (!dead && growth >= 0.55 && !ripe) g.sphere(tx, hgt + 0.02, tz, 0.035, '#5b8bd9');
          if (ripe && !dead) g.sphere(tx, hgt + 0.02, tz, 0.03, '#d4a017');
          g.box(tx - 0.04, hgt * 0.5 - 0.005, tz - 0.01, tx + 0.04, hgt * 0.5 + 0.005, tz + 0.01, leafDark);
        }
      } else {
        // hortaliza: mata frondosa
        const r = (0.07 + 0.2 * growth) * s;
        g.cylinder(0, 0, 0, 0.02, 0.015, r * 0.9, 4, leafDark);
        g.sphere(0, r * 0.95, 0, r, leaf, 0, dead ? 0.35 : 0.8);
        g.sphere(r * 0.55, r * 0.7, r * 0.2, r * 0.7, leafDark, 0, dead ? 0.35 : 0.75);
        g.sphere(-r * 0.45, r * 0.75, -r * 0.35, r * 0.65, leaf, 0, dead ? 0.35 : 0.75);
        if (growth > 0.6 && !dead) {
          const fruits = ripe ? 4 : 2;
          for (let k = 0; k < fruits; k++) {
            const a = (k / fruits) * 6.28 + h * 3;
            const fc = ripe ? (k % 2 ? '#e63946' : '#f4a261') : '#90be6d';
            g.sphere(Math.cos(a) * r * 0.85, r * (0.55 + 0.25 * (k % 2)), Math.sin(a) * r * 0.85, 0.045 + (ripe ? 0.02 : 0), fc);
          }
        }
      }
      if (plot.pest && !dead) {
        // manchas y bichos
        for (let k = 0; k < 4; k++) {
          const a = k * 1.7 + h;
          const rr = 0.04 + 0.08 * growth;
          g.boxC(Math.cos(a) * rr, 0.06 + growth * 0.18 + (k % 2) * 0.04, Math.sin(a) * rr, 0.035, 0.012, 0.035, k % 2 ? '#2b2118' : '#e8e3c9');
        }
      }
      g.pop();
    }
  return g.build();
}

class PlanterDyn extends PropDynamic {
  private mesh: THREE.Mesh;
  private key = '';
  /** Lámpara de cultivo (solo en huertos bajo techo con el plano de invernadero). */
  private lamp: THREE.Group | null = null;
  private lampMat: THREE.MeshBasicMaterial | null = null;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mats.solid);
    this.mesh.userData.ownGeometry = true;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const soil = model.anchors.soil ?? new THREE.Vector3(0, 0.43, 0);
    this.mesh.position.copy(soil);
    proxy.add(this.mesh);
  }
  private ensureLamp(mats: ShipMaterials): void {
    if (this.lamp) return;
    const size = this.model.anchors.size ?? new THREE.Vector3(1, 0, 1);
    const g = new GeoBuilder();
    const y = 2.05;
    const w = size.x * 1.6;
    g.box(-w / 2, y, -0.14, w / 2, y + 0.07, 0.14, '#3a3f44');
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) g.cylinderBetween(x, y + 0.07, 0, x, 3.0, 0, 0.012, 3, '#2b2d42');
    const frame = new THREE.Mesh(g.build(), mats.solid);
    frame.userData.ownGeometry = true;
    frame.castShadow = true;
    const stripGeo = new THREE.BoxGeometry(w - 0.1, 0.02, 0.2);
    stripGeo.translate(0, y - 0.01, 0);
    this.lampMat = new THREE.MeshBasicMaterial({ color: '#3a2f40' });
    const strip = new THREE.Mesh(stripGeo, this.lampMat);
    strip.userData.ownGeometry = true;
    this.lamp = new THREE.Group();
    this.lamp.name = 'lampara-cultivo';
    this.lamp.add(frame, strip);
    this.proxy.add(this.lamp);
  }
  update(c: DynContext): void {
    const plot = c.module?.plots[this.prop.index];
    // lámparas de cultivo: huerto bajo techo + plano de invernadero (como en utilities.ts)
    if (this.indoor && c.state.unlocks.includes('invernadero')) {
      this.ensureLamp(c.mats);
      const m = c.module;
      const growing = !!plot && !!plot.crop && !plot.dead && plot.growth < 1;
      const lit = !!m && m.status === 'active' && m.on && m.powered && growing;
      this.lampMat!.color.set(lit ? '#ee9cff' : '#3a2f40');
      if (lit) {
        const p = this.toShip(new THREE.Vector3(0, 1.7, 0));
        c.lights.push({ id: `cultivo:${this.prop.key}`, x: p.x, y: p.y, z: p.z, level: this.level, intensity: 2.4, color: GROW_COLOR, distance: 5, priority: 0.5 });
      }
    } else if (this.lamp) {
      this.lamp.visible = false;
    }
    const stage = plot ? Math.min(20, Math.floor(plot.growth * 20)) : -1;
    const key = plot ? `${plot.crop}|${stage}|${plot.dead}|${plot.pest}|${plot.dryHours > 2}` : 'vacio';
    if (key === this.key) return;
    this.key = key;
    const size = this.model.anchors.size ?? new THREE.Vector3(1, 0, 1);
    const geo = plot ? buildPlantGeometry(plot, { x: size.x, z: size.z }, this.prop.moduleId * 10 + this.prop.index) : null;
    this.mesh.geometry.dispose();
    this.mesh.geometry = geo ?? new THREE.BufferGeometry();
    this.mesh.visible = !!geo;
  }
  override dispose(): void {
    super.dispose();
    this.lampMat?.dispose();
  }
}

const GROW_COLOR = new THREE.Color('#d58bff');

/** Colector de lluvia: cuando llueve, el agua gotea del embudo al bidón. */
class CollectorDyn extends PropDynamic {
  private acc = 0;
  update(c: DynContext): void {
    const rain = c.state.weather.rain;
    if (rain < 0.05 || this.level > c.maxLevel || c.module?.status !== 'active') return;
    const sump = this.model.anchors.sump;
    const top = this.model.anchors.barrelTop;
    if (!sump || !top) return;
    this.acc += c.dt * (4 + rain * 14);
    while (this.acc > 1) {
      this.acc -= 1;
      const p = this.toShip(sump);
      c.particles.emitSpark('drip', p.x, p.y, p.z, this.level, this.prop.y + top.y);
    }
  }
}

/* ------------------------------------------------------------------ */

class TankDyn extends PropDynamic {
  private water: THREE.Mesh;
  private h0: number;
  private h1: number;
  private dripAcc = 0;
  private puddle: THREE.Mesh;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    const b = model.anchors.gaugeBottom ?? new THREE.Vector3(0, 0.33, -1);
    const t = model.anchors.gaugeTop ?? new THREE.Vector3(0, 1.97, -1);
    this.h0 = b.y;
    this.h1 = t.y;
    const geo = new THREE.BoxGeometry(0.075, 1, 0.05);
    geo.translate(0, 0.5, 0);
    this.water = new THREE.Mesh(geo, mats.water);
    this.water.userData.ownGeometry = true;
    this.water.position.set(b.x, b.y, b.z);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(0.1, t.y - b.y, 0.07), mats.glassIn);
    tube.userData.ownGeometry = true;
    tube.position.set(b.x, (b.y + t.y) / 2, b.z);
    proxy.add(this.water, tube);
    const pg = new THREE.CircleGeometry(0.55, 9);
    pg.rotateX(-Math.PI / 2);
    this.puddle = new THREE.Mesh(pg, mats.water);
    this.puddle.userData.ownGeometry = true;
    const lk = model.anchors.leak ?? new THREE.Vector3(0.6, 0.6, -0.6);
    this.puddle.position.set(lk.x * 1.25, 0.012, lk.z * 1.25);
    this.puddle.visible = false;
    proxy.add(this.puddle);
  }
  update(c: DynContext): void {
    const u = c.state.utilities;
    const cap = Math.max(1, u.water.capacityL);
    const fill = THREE.MathUtils.clamp(u.waterL / cap, 0, 1);
    const target = Math.max(0.001, fill * (this.h1 - this.h0));
    this.water.scale.y += (target - this.water.scale.y) * Math.min(1, c.dt * 2);
    this.water.visible = fill > 0.002;
    const m = c.module;
    const leaking = !!m && (m.leak || m.condition < 50) && u.waterL > 0.5;
    this.puddle.visible = leaking;
    if (leaking) {
      const s = 0.85 + 0.15 * Math.sin(c.t * 0.7);
      this.puddle.scale.set(s, 1, s);
      this.dripAcc += c.dt * (m!.leak ? 5 : 1.5);
      while (this.dripAcc > 1) {
        this.dripAcc -= 1;
        if (this.level > c.maxLevel) continue;
        const lk = this.model.anchors.leak ?? new THREE.Vector3(0.6, 0.6, -0.6);
        const p = this.toShip(lk);
        c.particles.emitSpark('drip', p.x, p.y, p.z, this.level, this.prop.y + 0.02);
      }
    }
  }
}

/* ------------------------------------------------------------------ */

class MachineDyn extends PropDynamic {
  private body: THREE.Mesh | null = null;
  private led: THREE.Mesh | null = null;
  private smokeAcc = 0;
  private gauge: THREE.Mesh[] = [];
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    if (model.moving) {
      this.body = new THREE.Mesh(model.moving, mats.solid);
      this.body.castShadow = true;
      this.body.receiveShadow = true;
      if (model.movingPivot) this.body.position.copy(model.movingPivot);
      this.body.name = 'parte-movil';
      proxy.add(this.body);
    }
    if (model.anchors.led) {
      this.led = ledMesh(model.anchors.led, mats);
      proxy.add(this.led);
    }
    if (prop.kind === 'bateria' && model.anchors.gauge) {
      const gp = model.anchors.gauge;
      const geo = new THREE.BoxGeometry(0.05, 0.1, 0.012);
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(geo, mats.ledOff);
        seg.position.set(gp.x + i * 0.065, gp.y, gp.z);
        proxy.add(seg);
        this.gauge.push(seg);
      }
    }
  }
  /** ¿La máquina está funcionando ahora mismo? */
  private running(c: DynContext): boolean {
    const m = c.module;
    if (!m || m.status !== 'active' || !m.on || m.fire > 0) return false;
    if (this.prop.kind === 'generador') return m.powered;
    if (this.prop.kind === 'motor') return m.powered && c.state.voyage.speed > 0 && c.state.voyage.anchoredUntil === null;
    if (this.prop.kind === 'torno' || this.prop.kind === 'prensa') return m.powered && m.queue.length > 0;
    return m.powered;
  }
  update(c: DynContext): void {
    const m = c.module;
    const run = this.running(c);
    if (this.body) {
      if (this.prop.kind === 'timon') {
        this.body.rotation.z = Math.sin(c.t * 0.35) * 0.5 + Math.sin(c.t * 0.13) * 0.3;
      } else if (run) {
        const a = this.prop.kind === 'motor' ? 0.006 : 0.012;
        this.body.position.set(Math.sin(c.t * 61) * a, Math.abs(Math.sin(c.t * 47)) * a, Math.sin(c.t * 53) * a * 0.6);
        this.body.rotation.z = Math.sin(c.t * 37) * a * 0.5;
      } else {
        this.body.position.set(0, 0, 0);
        this.body.rotation.z = 0;
      }
    }
    if (this.led) {
      let st = machineLed(m);
      if (this.prop.kind === 'panel_solar' || this.prop.kind === 'generador') st = st === 'idle' ? 'off' : st;
      if ((this.prop.kind === 'torno' || this.prop.kind === 'prensa') && st === 'on' && !run) st = 'idle';
      // parpadeo de avería
      if (st === 'fault' && Math.sin(c.t * 8) < 0) st = 'off';
      this.led.material = ledMaterial(c.mats, st);
    }
    if (this.gauge.length) {
      const cap = Math.max(1, c.state.utilities.power.capacityKWh);
      const frac = THREE.MathUtils.clamp(c.state.utilities.batteryKWh / cap, 0, 1);
      const lit = Math.round(frac * 5);
      this.gauge.forEach((s, i) => {
        s.material = i < lit && m?.status === 'active' ? (lit <= 1 ? c.mats.ledRed : lit <= 2 ? c.mats.ledAmber : c.mats.ledGreen) : c.mats.ledOff;
      });
    }
    if (run && this.model.anchors.exhaust && this.level <= c.maxLevel) {
      // Bajo techo el escape va entubado al exterior: solo se escapa algo de humo por la junta.
      this.smokeAcc += c.dt * (this.indoor ? 1.2 : 7);
      while (this.smokeAcc > 1) {
        this.smokeAcc -= 1;
        const p = this.toShip(this.model.anchors.exhaust);
        c.particles.emitPuff('exhaust', p.x, p.y, p.z, this.level, this.indoor ? 0.45 : 0.8, this.indoor ? 0.5 : 1.2, this.indoor);
      }
    }
  }
}

/* ------------------------------------------------------------------ */

class ShelfDyn extends PropDynamic {
  private mesh: THREE.Mesh | null = null;
  private shown = -1;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    if (model.contents) {
      const geo = model.contents.clone();
      this.mesh = new THREE.Mesh(geo, mats.solid);
      this.mesh.userData.ownGeometry = true;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.mesh.name = 'contenido';
      proxy.add(this.mesh);
    }
  }
  update(c: DynContext): void {
    if (!this.mesh) return;
    const inv = c.module?.inventory;
    let fill = 0;
    if (inv && inv.slots.length) fill = inv.slots.filter((s) => !!s && s.qty > 0).length / inv.slots.length;
    const k = fill <= 0 ? 0 : Math.min(4, Math.ceil(fill * 4));
    if (k === this.shown) return;
    this.shown = k;
    const count = k === 0 ? 0 : this.model.tiers[k - 1] ?? 0;
    this.mesh.geometry.setDrawRange(0, count);
    this.mesh.visible = count > 0;
  }
}

/**
 * Crea el comportamiento dinámico de un prop (o null si es completamente estático).
 * `ceiling` = altura (sobre el suelo del prop) del techo si está bajo techo, o null a cielo abierto.
 */
export function createDynamic(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials, ceiling: number | null = null): PropDynamic | null {
  const d = makeDynamic(prop, proxy, model, level, mats);
  if (d) d.indoor = ceiling !== null;
  // Escape entubado hasta el techo para los generadores bajo cubierta.
  if (d && ceiling !== null && prop.kind === 'generador' && model.anchors.exhaust) {
    const e = model.anchors.exhaust;
    const len = ceiling - (e.y - 0.12);
    if (len > 0.1) {
      const geo = new THREE.CylinderGeometry(0.06, 0.06, len, 6);
      geo.translate(e.x, e.y - 0.12 + len / 2, e.z);
      const pipe = new THREE.Mesh(geo, mats.solid);
      pipe.userData.ownGeometry = true;
      pipe.castShadow = true;
      const colors = new Float32Array(geo.getAttribute('position').count * 3);
      const c = new THREE.Color('#6c757d');
      for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      pipe.name = 'escape-entubado';
      proxy.add(pipe);
    }
  }
  return d;
}

function makeDynamic(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials): PropDynamic | null {
  switch (prop.kind) {
    case 'fogon':
      return new StoveDyn(prop, proxy, model, level, mats);
    case 'bancal':
      return new PlanterDyn(prop, proxy, model, level, mats);
    case 'colector':
      return new CollectorDyn(prop, proxy, model, level);
    case 'deposito':
      return new TankDyn(prop, proxy, model, level, mats);
    case 'estanteria':
    case 'despensa':
      return new ShelfDyn(prop, proxy, model, level, mats);
    case 'generador':
    case 'motor':
    case 'potabilizadora':
    case 'bateria':
    case 'panel_solar':
    case 'torno':
    case 'prensa':
    case 'timon':
      return new MachineDyn(prop, proxy, model, level, mats);
    default:
      return null;
  }
}


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
 *  - ahumadero: brasas en el hogar, humo por la(s) chimenea(s) mientras ahúma y pescado colgado.
 *  - vivero: agua translúcida con peces que nadan; burbujas de los aireadores con energía.
 *  - grúa: la torreta gira hacia el resto que engancha (`craneView`, igual que `gruaTarget`), el
 *    cable vuela hasta él, iza la red hasta la pluma y, sin trabajo, oscila vigilando su costado.
 *  - radar: la antena gira mientras está en marcha.
 *  - sala común: quinqué de la mesa de juegos y estufa del nivel 2 (luz cálida).
 */
import * as THREE from 'three';
import { wrapAngle } from '../../core/math';
import { CROPS } from '../../data/crops';
import { WATERLINE_Y } from '../../sim/constants';
import { GRUA_CYCLE_MIN, GRUA_HOOK_MIN, GRUA_LIFT_MIN } from '../../sim/debris';
import { getCell, levelY, pointToCell, type PropInstance, type ShipLayout } from '../../sim/ship';
import type { DebrisKind, GameState, ModuleInstance, PlotState } from '../../sim/types';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, mix, shade, type ColorLike } from './geo';
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
  /** Distribución actual (la grúa evita girar la pluma contra habitaciones y muebles altos). */
  layout?: ShipLayout;
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

/* ------------------------------------------------------------------ */
/* Ahumadero                                                           */
/* ------------------------------------------------------------------ */

const EMBER_COLOR = new THREE.Color('#ff8a3d');

/** ¿El ahumadero está ahumando ahora? (terminado, sin fuego ni avería y con trabajo en cola). */
export function smokerWorking(m: ModuleInstance | undefined): boolean {
  return !!m && m.status === 'active' && m.fire <= 0 && m.queue.length > 0;
}

class SmokerDyn extends PropDynamic {
  private embers: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  private racks: THREE.Mesh;
  private acc = 0;
  private lit = 0;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    for (const a of [model.anchors.firebox, model.anchors.firebox2]) {
      if (!a) continue;
      const mat = new THREE.MeshBasicMaterial({ color: '#ff6a1f', transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.01), mat);
      mesh.userData.ownGeometry = true;
      mesh.position.copy(a);
      mesh.name = 'brasas';
      proxy.add(mesh);
      this.embers.push({ mesh, mat });
    }
    // varales con pescado colgado dentro de la caseta (se ve por las rejillas)
    const g = new GeoBuilder();
    const r = model.anchors.racks ?? new THREE.Vector3(0, 1.3, 0);
    const span = Math.max(0.4, prop.hx - 0.15);
    for (const z of [-0.18, 0.18]) {
      g.cylinderX(r.x, r.y, z, 0.015, span * 2, 4, '#6e4a2e');
      for (let i = 0; i < 6; i++) {
        const x = r.x - span + 0.1 + (i / 5) * (span * 2 - 0.2);
        g.cylinder(x, r.y - 0.12, z, 0.006, 0.006, 0.12, 3, PALETTE.rope);
        g.push();
        g.translate(x, r.y - 0.12, z);
        g.box(-0.035, -0.32, -0.012, 0.035, 0.0, 0.012, '#b5652b');
        g.box(-0.05, -0.38, -0.008, 0.05, -0.31, 0.008, '#8a4a22');
        g.pop();
      }
    }
    this.racks = new THREE.Mesh(g.build(), mats.solid);
    this.racks.userData.ownGeometry = true;
    this.racks.name = 'pescado-colgado';
    this.racks.visible = false;
    proxy.add(this.racks);
  }
  update(c: DynContext): void {
    const m = c.module;
    const on = smokerWorking(m);
    this.lit += ((on ? 1 : 0) - this.lit) * Math.min(1, c.dt * 2);
    for (const [i, e] of this.embers.entries()) {
      e.mat.opacity = this.lit * (0.7 + 0.25 * Math.sin(c.t * (11 + i * 3)) * Math.sin(c.t * 4.3 + i));
      e.mesh.visible = this.lit > 0.02;
    }
    const stocked = !!m?.inventory?.slots.some((s) => !!s && s.qty > 0);
    this.racks.visible = on || stocked;
    if (this.lit > 0.3) {
      const fb = this.model.anchors.firebox;
      if (fb) {
        const p = this.toShip(new THREE.Vector3(fb.x, fb.y + 0.2, fb.z - 0.4));
        c.lights.push({ id: `ahumadero:${this.prop.key}`, x: p.x, y: p.y, z: p.z, level: this.level, intensity: 1.6 * this.lit, color: EMBER_COLOR, distance: 4.5, priority: 0.8 });
      }
      if (this.level <= c.maxLevel) {
        this.acc += c.dt * 6 * this.lit;
        while (this.acc > 1) {
          this.acc -= 1;
          for (const a of [this.model.anchors.chimney, this.model.anchors.chimney2]) {
            if (!a) continue;
            const q = this.toShip(a);
            c.particles.emitPuff('smoke', q.x, q.y, q.z, this.level, 0.75, 0.9, this.indoor);
          }
        }
      }
    }
  }
  override dispose(): void {
    super.dispose();
    for (const e of this.embers) e.mat.dispose();
  }
}

/* ------------------------------------------------------------------ */
/* Vivero de peces                                                     */
/* ------------------------------------------------------------------ */

let fishGeos: THREE.BufferGeometry[] | null = null;
/** Peces low-poly (morro hacia -z) en tres colores. */
function fishGeometries(): THREE.BufferGeometry[] {
  if (fishGeos) return fishGeos;
  fishGeos = ['#f4a261', '#c0c7cc', '#5c8a9a'].map((c) => {
    const g = new GeoBuilder();
    g.frustum(0, -0.035, -0.02, 0.05, 0.16, 0.03, 0.1, 0.07, c, 0, 0);
    g.push();
    g.rotateX(Math.PI / 2);
    g.cylinder(0, -0.1, 0, 0.0, 0.035, 0.06, 5, shade(c, 1.1));
    g.pop();
    g.box(-0.004, -0.045, 0.06, 0.004, 0.045, 0.11, shade(c, 0.8));
    g.boxC(-0.022, 0.012, -0.08, 0.01, 0.012, 0.012, '#1b1d20');
    g.boxC(0.022, 0.012, -0.08, 0.01, 0.012, 0.012, '#1b1d20');
    return g.build();
  });
  return fishGeos;
}

let bubbleGeo: THREE.BufferGeometry | null = null;

/** ¿El vivero tiene los tanques en marcha? (bomba y aireadores con energía). */
export function viveroRunning(m: ModuleInstance | undefined): boolean {
  return !!m && m.status === 'active' && m.fire <= 0 && m.on && m.powered;
}

class FishTankDyn extends PropDynamic {
  private fish: { mesh: THREE.Mesh; r: number; speed: number; phase: number; y: number; dir: number }[] = [];
  private bubbles: { mesh: THREE.Mesh; x: number; z: number; t: number }[] = [];
  private led: THREE.Mesh | null = null;
  private y0: number;
  private top: number;
  private tankX: number;
  private tankZ: number;
  private swim = 0;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    const w = model.anchors.water ?? new THREE.Vector3(0, 0.4, 0);
    const t = model.anchors.tank ?? new THREE.Vector3(1, 0.8, 0.8);
    this.y0 = w.y;
    this.top = w.y + t.y;
    const geo = new THREE.BoxGeometry(t.x * 2, t.y, t.z * 2);
    geo.translate(w.x, w.y + t.y / 2, w.z);
    const water = new THREE.Mesh(geo, mats.aquarium);
    water.userData.ownGeometry = true;
    water.name = 'agua-vivero';
    water.renderOrder = 3;
    proxy.add(water);
    const n = model.tier >= 2 ? 6 : 4;
    const geos = fishGeometries();
    for (let i = 0; i < n; i++) {
      const h = hash01(prop.moduleId, prop.index, i);
      const mesh = new THREE.Mesh(geos[i % geos.length]!, mats.solid);
      mesh.name = 'pez';
      const s = 1.3 + h * 0.7;
      mesh.scale.setScalar(s);
      proxy.add(mesh);
      this.fish.push({ mesh, r: 0.35 + h * 0.5, speed: 0.35 + hash01(i, prop.moduleId, 3) * 0.35, phase: h * 6.28, y: this.y0 + 0.12 + hash01(i, 9, prop.index) * (t.y - 0.3), dir: i % 2 ? 1 : -1 });
    }
    for (const a of [model.anchors.bubbles, model.anchors.bubbles2]) {
      if (!a) continue;
      if (!bubbleGeo) bubbleGeo = new THREE.IcosahedronGeometry(0.022, 0);
      for (let k = 0; k < 6; k++) {
        const mesh = new THREE.Mesh(bubbleGeo, mats.bubble);
        mesh.name = 'burbuja';
        mesh.visible = false;
        proxy.add(mesh);
        this.bubbles.push({ mesh, x: a.x, z: a.z, t: k / 6 });
      }
    }
    if (model.anchors.led) {
      this.led = ledMesh(model.anchors.led, mats);
      proxy.add(this.led);
    }
    this.tankX = t.x;
    this.tankZ = t.z;
  }
  update(c: DynContext): void {
    const m = c.module;
    const run = viveroRunning(m);
    // Los peces nadan siempre (más despacio sin bomba); en el agua parada se quedan quietos casi.
    this.swim += c.dt * (run ? 1 : 0.45);
    for (const f of this.fish) {
      const a = f.phase + this.swim * f.speed * f.dir;
      // el pez mide hasta ~0,35 m: que no asome por el cristal en los extremos
      const ax = Math.min(this.tankX - 0.3, f.r * 1.6);
      const az = Math.min(this.tankZ - 0.25, f.r);
      const x = Math.cos(a) * ax;
      const z = Math.sin(a) * az;
      // dirección de avance (derivada de la elipse)
      const vx = -Math.sin(a) * ax * f.dir;
      const vz = Math.cos(a) * az * f.dir;
      f.mesh.position.set(x, f.y + Math.sin(this.swim * 1.3 + f.phase) * 0.04, z);
      f.mesh.rotation.set(0, Math.atan2(-vx, -vz), Math.sin(this.swim * 9 + f.phase) * 0.12);
    }
    for (const b of this.bubbles) {
      b.mesh.visible = run && this.level <= c.maxLevel;
      if (!b.mesh.visible) continue;
      b.t = (b.t + c.dt * 0.7) % 1;
      b.mesh.position.set(b.x + Math.sin(b.t * 12 + b.z * 7) * 0.02, this.y0 + 0.08 + b.t * (this.top - this.y0 - 0.1), b.z + Math.cos(b.t * 10) * 0.015);
    }
    if (this.led) {
      let st = machineLed(m);
      if (st === 'fault' && Math.sin(c.t * 8) < 0) st = 'off';
      this.led.material = ledMaterial(c.mats, st);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Grúa de rescate                                                     */
/* ------------------------------------------------------------------ */

export type CranePhase = 'parada' | 'tormenta' | 'izando' | 'recargando' | 'esperando' | 'enganchando';

export interface CraneView {
  phase: CranePhase;
  /** 0..1 de la fase (lance del gancho, izado, recogida del cable). */
  progress: number;
  /** Resto enganchado (coordenadas del barco, en planta) mientras engancha. */
  target: { id: number; kind: DebrisKind; x: number; z: number } | null;
}

/**
 * Lo que hace la grúa, leído del estado guardado en el módulo con las mismas reglas que
 * `gruaStatus` / `gruaTarget` (sim/debris.ts): parada sin energía, recogida con tormenta, izando
 * la carga al principio del ciclo, recogiendo cable y, al final, enganchando el resto `prodTarget`.
 */
export function craneView(m: ModuleInstance | undefined, state: GameState): CraneView {
  const none: CraneView = { phase: 'parada', progress: 0, target: null };
  if (!m || m.type !== 'grua') return none;
  // como gruaWorkRate: una satisfacción no numérica cuenta como plena (nunca para la grúa)
  const ready = m.status === 'active' && m.fire <= 0 && m.on && m.powered && !(state.utilities.power.satisfaction <= 0);
  if (!ready) return none;
  if (state.weather.kind === 'tormenta') return { phase: 'tormenta', progress: 0, target: null };
  const w = Number.isFinite(m.prodProgress) ? Math.max(0, m.prodProgress!) : GRUA_LIFT_MIN;
  if (w < GRUA_LIFT_MIN && w < GRUA_CYCLE_MIN) return { phase: 'izando', progress: w / GRUA_LIFT_MIN, target: null };
  if (w < GRUA_CYCLE_MIN) return { phase: 'recargando', progress: w / GRUA_CYCLE_MIN, target: null };
  if (typeof m.prodTarget === 'number') {
    const d = state.debris.find((x) => x.id === m.prodTarget);
    if (d) return { phase: 'enganchando', progress: THREE.MathUtils.clamp((w - GRUA_CYCLE_MIN) / GRUA_HOOK_MIN, 0, 1), target: { id: d.id, kind: d.kind, x: d.pos.x, z: d.pos.z } };
  }
  return { phase: 'esperando', progress: 1, target: null };
}

const _tip = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const CABLE_POINTS = 12;

class CraneDyn extends PropDynamic {
  private turret = new THREE.Group();
  private boom = new THREE.Group();
  private jib = new THREE.Group();
  private drum: THREE.Mesh | null = null;
  private ram: THREE.Mesh | null = null;
  private hook: THREE.Mesh | null = null;
  private load: THREE.Mesh | null = null;
  private cable: THREE.Line;
  private led: THREE.Mesh | null = null;
  /** Ángulos actuales (suavizados). */
  yaw: number;
  private pitch = 0.35;
  private fold = -1.5;
  private lastTargetYaw: number | null = null;
  private outYaw: number;
  /** Ángulos (cuantizados) por los que la pluma choca con algo, por revisión del layout. */
  private blocked = new Map<number, boolean>();
  private blockedRev = -1;
  /** Fase que se está mostrando (para pruebas y depuración). */
  phase: CranePhase = 'parada';
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    const a = model.anchors;
    const mk = (geo: THREE.BufferGeometry | undefined, name: string, parent: THREE.Object3D): THREE.Mesh | null => {
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, mats.solid);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    this.turret.name = 'torreta';
    this.turret.position.copy(a.turret ?? new THREE.Vector3(0, 1, 0));
    proxy.add(this.turret);
    mk(model.parts.turret, 'torreta-cuerpo', this.turret);
    this.drum = mk(model.parts.drum, 'tambor', this.turret);
    this.drum?.position.copy(a.drum ?? new THREE.Vector3());
    this.boom.name = 'pluma';
    this.boom.position.copy(a.boomPivot ?? new THREE.Vector3(0, 0.85, -0.18));
    this.turret.add(this.boom);
    mk(model.parts.boom, 'pluma-cuerpo', this.boom);
    this.jib.name = 'brazo';
    this.jib.position.copy(a.boomTip ?? new THREE.Vector3(0, 0, -2));
    this.boom.add(this.jib);
    mk(model.parts.jib, 'brazo-cuerpo', this.jib);
    this.ram = mk(model.parts.ram, 'cilindro', this.turret);
    this.hook = mk(model.parts.hook, 'gancho', proxy);
    this.load = mk(model.parts.load, 'carga', proxy);
    if (this.load) this.load.visible = false;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(CABLE_POINTS * 3), 3));
    this.cable = new THREE.Line(cg, CABLE_MAT);
    this.cable.name = 'cable';
    this.cable.frustumCulled = false;
    this.cable.userData.ownGeometry = true;
    proxy.add(this.cable);
    if (a.led) {
      this.led = ledMesh(a.led, mats);
      proxy.add(this.led);
    }
    // Costado de trabajo: el de la borda junto a la que está (como gruaSide en la simulación).
    const side = prop.z < 0 ? -1 : 1;
    this.outYaw = this.localYawTo(prop.x, prop.z + side * 10);
    this.yaw = this.outYaw;
    this.turret.rotation.y = this.yaw;
  }
  /** Yaw local de la torreta (pluma hacia -z) para apuntar a un punto del barco. */
  private localYawTo(x: number, z: number): number {
    const dx = x - this.prop.x;
    const dz = z - this.prop.z;
    // dirección en el marco del prop (deshacer su giro)
    const c = Math.cos(-this.prop.yaw);
    const s = Math.sin(-this.prop.yaw);
    const lx = dx * c + dz * s;
    const lz = -dx * s + dz * c;
    return Math.atan2(-lx, -lz);
  }
  /** ¿La pluma, girada a `yaw`, atraviesa una habitación, una escalera o un mueble alto? */
  private hits(yaw: number, layout: ShipLayout): boolean {
    const q = Math.round(yaw / 0.05);
    if (layout.revision !== this.blockedRev) {
      this.blocked.clear();
      this.blockedRev = layout.revision;
    }
    const cached = this.blocked.get(q);
    if (cached !== undefined) return cached;
    const a = this.prop.yaw + q * 0.05;
    const dx = -Math.sin(a);
    const dz = -Math.cos(a);
    const reach = -(this.model.anchors.boomTip?.z ?? -2.2) - (this.model.anchors.jibTip?.z ?? -1.25) + 0.3;
    const floor = levelY(this.level);
    let hit = false;
    // a lo largo de la pluma y a ambos lados de su eje (ancho de la pluma y del brazo con margen)
    for (let r = 0.7; r <= reach && !hit; r += 0.3) {
      for (const side of [-0.3, 0, 0.3]) {
        const x = this.prop.x + dx * r - dz * side;
        const z = this.prop.z + dz * r + dx * side;
        const cell = pointToCell(x, z, layout.width);
        for (const l of [this.level, this.level + 1]) {
          const k = getCell(layout, l, cell.x, cell.z)?.kind;
          if (k === 'room' || k === 'stairLow' || k === 'stairHigh') hit = true;
        }
        for (const p of layout.props) {
          if (p.key === this.prop.key || p.y - floor + p.height < 1.9 || Math.abs(p.y - floor) > 1) continue;
          if (Math.abs(p.x - x) < p.hx + 0.2 && Math.abs(p.z - z) < p.hz + 0.2) hit = true;
        }
      }
    }
    this.blocked.set(q, hit);
    return hit;
  }

  /** El ángulo más cercano a `want` por el que la pluma pasa libre, buscando desde fuera de la borda. */
  private freeYaw(want: number, layout: ShipLayout | undefined): number {
    if (!layout || !this.hits(want, layout)) return want;
    const span = wrapAngle(want - this.outYaw);
    const n = Math.ceil(Math.abs(span) / 0.05);
    let best = this.outYaw;
    for (let i = 0; i <= n; i++) {
      const y = this.outYaw + (span * i) / Math.max(1, n);
      if (this.hits(y, layout)) break;
      best = y;
    }
    return best;
  }

  update(c: DynContext): void {
    const m = c.module;
    const v = craneView(m, c.state);
    this.phase = v.phase;
    let wantYaw = this.outYaw;
    let wantPitch = 0.55;
    let wantFold = -0.55;
    if (v.phase === 'parada' || v.phase === 'tormenta') {
      wantPitch = 0.3;
      wantFold = -1.55;
    } else if (v.phase === 'enganchando' && v.target) {
      wantYaw = this.localYawTo(v.target.x, v.target.z);
      this.lastTargetYaw = wantYaw;
      wantPitch = 0.42;
      wantFold = -0.15;
    } else if (v.phase === 'izando') {
      wantYaw = this.lastTargetYaw ?? this.outYaw;
      wantPitch = 0.72;
      wantFold = -0.75;
    } else if (v.phase === 'esperando') {
      // vigila su costado: barre despacio a un lado y a otro
      wantYaw = this.outYaw + Math.sin(c.t * 0.35 + this.prop.moduleId) * 0.55;
      this.lastTargetYaw = null;
    } else this.lastTargetYaw = null;
    // la pluma no atraviesa habitaciones ni muebles altos: se queda en el ángulo libre más cercano
    wantYaw = this.freeYaw(wantYaw, c.layout);
    const turn = Math.min(1, c.dt * 1.4);
    this.yaw += wrapAngle(wantYaw - this.yaw) * turn;
    this.pitch += (wantPitch - this.pitch) * Math.min(1, c.dt * 1.2);
    this.fold += (wantFold - this.fold) * Math.min(1, c.dt * 1.2);
    this.turret.rotation.y = this.yaw;
    this.boom.rotation.x = this.pitch;
    this.jib.rotation.x = this.fold - this.pitch * 0.4;
    if (this.drum) this.drum.rotation.x += c.dt * (v.phase === 'recargando' ? 2.5 : v.phase === 'izando' ? 3.5 : 0);
    // Cilindro hidráulico entre la torreta y la pluma.
    if (this.ram) {
      const base = this.model.anchors.ramBase ?? new THREE.Vector3(0, 0.15, -0.38);
      const lug = this.model.anchors.ramLug ?? new THREE.Vector3(0, -0.13, -0.9);
      this.boom.updateMatrix();
      _b.copy(lug).applyMatrix4(this.boom.matrix);
      _a.subVectors(_b, base);
      const len = _a.length();
      this.ram.position.copy(base);
      this.ram.quaternion.setFromUnitVectors(UP, _a.normalize());
      this.ram.scale.set(1, len, 1);
    }
    // Punta del brazo en el marco del prop (el cable cuelga en vertical del barco).
    this.proxy.updateMatrix();
    this.turret.updateMatrix();
    this.boom.updateMatrix();
    this.jib.updateMatrix();
    _tip.copy(this.model.anchors.jibTip ?? new THREE.Vector3(0, 0, -1)).applyMatrix4(this.jib.matrix).applyMatrix4(this.boom.matrix).applyMatrix4(this.turret.matrix);
    const pos = this.cable.geometry.getAttribute('position') as THREE.BufferAttribute;
    const waterY = WATERLINE_Y - this.prop.y;
    let end: THREE.Vector3;
    let sag = 0;
    if (v.phase === 'enganchando' && v.target) {
      _inv.copy(this.proxy.matrix).invert();
      const tgt = _a.set(v.target.x, WATERLINE_Y + 0.1, v.target.z).applyMatrix4(_inv);
      const k = 1 - Math.pow(1 - v.progress, 2);
      end = _b.copy(_tip).lerp(tgt, k);
      end.y = THREE.MathUtils.lerp(_tip.y, tgt.y, Math.min(1, k * 1.15)) + Math.sin(k * Math.PI) * 1.2;
      sag = 0.6 * k;
    } else if (v.phase === 'izando') {
      const y = THREE.MathUtils.lerp(waterY, _tip.y - 0.9, 1 - Math.pow(1 - v.progress, 1.5));
      end = _b.set(_tip.x + Math.sin(c.t * 1.7) * 0.06, y, _tip.z + Math.cos(c.t * 1.3) * 0.06);
    } else {
      const drop = v.phase === 'parada' || v.phase === 'tormenta' ? 0.35 : 0.9;
      end = _b.set(_tip.x + Math.sin(c.t * 1.1 + this.prop.index) * 0.03, _tip.y - drop, _tip.z + Math.cos(c.t * 0.9) * 0.03);
    }
    for (let i = 0; i < CABLE_POINTS; i++) {
      const t = i / (CABLE_POINTS - 1);
      pos.setXYZ(i, THREE.MathUtils.lerp(_tip.x, end.x, t), THREE.MathUtils.lerp(_tip.y, end.y, t) - Math.sin(t * Math.PI) * sag, THREE.MathUtils.lerp(_tip.z, end.z, t));
    }
    pos.needsUpdate = true;
    if (this.hook) this.hook.position.copy(end);
    if (this.load) {
      this.load.visible = v.phase === 'izando';
      if (this.load.visible) {
        this.load.position.set(end.x, end.y - 0.4, end.z);
        this.load.rotation.y = c.t * 0.4;
      }
    }
    if (this.led) {
      let st = machineLed(m);
      if (st === 'on' && (v.phase === 'tormenta' || v.phase === 'parada')) st = 'idle';
      if (st === 'fault' && Math.sin(c.t * 8) < 0) st = 'off';
      this.led.material = ledMaterial(c.mats, st);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const CABLE_MAT = new THREE.LineBasicMaterial({ color: '#2b2118' });

/* ------------------------------------------------------------------ */
/* Radar y radio                                                       */
/* ------------------------------------------------------------------ */

/** ¿El radar está funcionando? (como `isRadarActive` de la simulación). */
export function radarActive(m: ModuleInstance | undefined): boolean {
  return !!m && m.type === 'radar' && m.status === 'active' && m.fire <= 0 && m.on && m.powered;
}

class RadarDyn extends PropDynamic {
  readonly antenna: THREE.Mesh | null = null;
  private led: THREE.Mesh | null = null;
  private spin = 0;
  constructor(prop: PropInstance, proxy: THREE.Group, model: PropModel, level: number, mats: ShipMaterials) {
    super(prop, proxy, model, level);
    if (model.parts.antenna) {
      this.antenna = new THREE.Mesh(model.parts.antenna, mats.solid);
      this.antenna.castShadow = true;
      this.antenna.name = 'antena-radar';
      this.antenna.position.copy(model.anchors.antenna ?? new THREE.Vector3(0, 2.2, 0));
      proxy.add(this.antenna);
    }
    if (model.anchors.led) {
      this.led = ledMesh(model.anchors.led, mats);
      proxy.add(this.led);
    }
  }
  update(c: DynContext): void {
    const on = radarActive(c.module);
    // arranca y se detiene con inercia
    this.spin += ((on ? 2.2 : 0) - this.spin) * Math.min(1, c.dt * 0.8);
    if (this.antenna) this.antenna.rotation.y += this.spin * c.dt;
    if (this.led) {
      let st = machineLed(c.module);
      if (st === 'fault' && Math.sin(c.t * 8) < 0) st = 'off';
      // la luz de la radio parpadea al recibir
      if (st === 'on' && Math.sin(c.t * 1.3) > 0.92) st = 'idle';
      this.led.material = ledMaterial(c.mats, st);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Sala común: quinqué de la mesa de juegos y estufa                   */
/* ------------------------------------------------------------------ */

const LOUNGE_LAMP = new THREE.Color('#ffb46b');
const LOUNGE_FIRE = new THREE.Color('#ff9a4a');

class LoungeDyn extends PropDynamic {
  private flames: THREE.Mesh[] = [];
  update(c: DynContext): void {
    const m = c.module;
    const open = !!m && m.status === 'active' && m.fire <= 0;
    const lamp = this.model.anchors.lamp;
    if (open && lamp) {
      const p = this.toShip(lamp);
      c.lights.push({ id: `quinque:${this.prop.key}`, x: p.x, y: p.y + 0.3, z: p.z, level: this.level, intensity: 1.2 + 2.2 * c.night, color: LOUNGE_LAMP, distance: 5.5, priority: 1 });
    }
    const fire = this.model.anchors.fire;
    if (fire) {
      if (!this.flames.length) {
        for (let i = 0; i < 2; i++) {
          const f = new THREE.Mesh(flameGeometry(), c.mats.fire);
          f.position.set(fire.x - 0.05 + i * 0.1, fire.y - 0.08, fire.z + 0.08);
          f.name = 'llama-estufa';
          this.proxy.add(f);
          this.flames.push(f);
        }
      }
      const k = open ? 0.65 + 0.35 * c.night : 0;
      this.flames.forEach((f, i) => {
        const s = k * (0.75 + 0.25 * Math.sin(c.t * (8 + i * 2.7) + i));
        f.visible = s > 0.05;
        f.scale.set(0.05 * s, 0.14 * s, 0.05 * s);
      });
      if (k > 0) {
        const p = this.toShip(new THREE.Vector3(fire.x, fire.y + 0.2, fire.z - 0.5));
        const flick = 0.85 + 0.15 * Math.sin(c.t * 13) * Math.sin(c.t * 4.1);
        c.lights.push({ id: `estufa:${this.prop.key}`, x: p.x, y: p.y, z: p.z, level: this.level, intensity: 2.4 * k * flick, color: LOUNGE_FIRE, distance: 6.5, priority: 1.2 });
      }
    }
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
    case 'ahumadero':
      return new SmokerDyn(prop, proxy, model, level, mats);
    case 'tanque_peces':
      return new FishTankDyn(prop, proxy, model, level, mats);
    case 'grua':
      return new CraneDyn(prop, proxy, model, level, mats);
    case 'radar':
      return new RadarDyn(prop, proxy, model, level, mats);
    case 'mesa_juegos':
    case 'estanteria_libros':
      return model.anchors.lamp || model.anchors.fire ? new LoungeDyn(prop, proxy, model, level) : null;
    default:
      return null;
  }
}


/**
 * PUERTO ESPERANZA (región final del hilo narrativo, data/story.ts) en el marco del océano.
 *
 * Todo el puerto vive en "coordenadas de puerto": metros de agua desde la bocana de entrada. Como el
 * agua pasa junto al barco a `DRIFT_PER_MILE` metros por milla (el mismo ritmo con el que se
 * desplaza el mar, `VISUAL_DRIFT`), la x de cada pieza sale directamente del estado del viaje y es
 * coherente con el oleaje, determinista y estable al cargar partida:
 *
 *  - Aproximación (rumbo elegido 'esperanza' y menos de `APPROACH_MILES` millas para acabar la
 *    región): la gran luz verde asoma en el horizonte, casi por la proa, y crece al acercarse.
 *    En la bocana esperan dos boyas (roja a babor, verde a estribor) entre las que pasa el barco
 *    al entrar en la región.
 *  - Puerto (región 'esperanza'): grupos de barcos-hogar amarrados con pasarelas, casitas de
 *    colores, huertos colgantes y farolillos a ambos lados de un canal libre; la torre de la luz
 *    verde en su islote con el muelle principal y el viejo Albatros; botes que van y vienen entre
 *    los pantalanes y gaviotas sobre la torre. De noche, mil luces cálidas con su reflejo en el agua.
 *  - Salida (la región anterior fue 'esperanza'): el puerto queda a popa y se desvanece.
 *
 * La torre, enorme y lejana, se desplaza más despacio que el agua (`TOWER_PARALLAX`): así sigue a
 * la vista durante toda la estancia. Ningún grupo de barcos se amarra en su franja lateral.
 */
import * as THREE from 'three';
import { REGIONS } from '../../data/regions';
import { FINAL_REGION } from '../../data/story';
import type { Quality } from '../../game/types';
import { VISUAL_DRIFT, WATERLINE_Y } from '../../sim/constants';
import type { GameState } from '../../sim/types';
import type { Atmosphere } from './atmosphere';
import { Birds } from './birds';
import { MERCHANT_STATION_X } from './sightings';
import { createLitUniforms, GlowPoints, glowGeometry, lightsLevel, litMaterial, type GlowShared, type LitUniforms } from './glow';
import {
  channelBuoyModel,
  greenTowerModel,
  HARBOR_BOAT_KINDS,
  harborBoatModel,
  houseboatClusterModel,
  PROMENADE_LEN,
  promenadeModel,
  TOWER_LIGHT_Y,
  type HarborBoatKind,
  type HarborModel,
} from './harborModels';

type WaterFn = (x: number, z: number) => number;

/* ------------------------------------------------------------------ */
/* Geografía del puerto (pura, probada)                                */
/* ------------------------------------------------------------------ */

/** Metros de agua que pasan junto al barco por cada milla navegada (ritmo del mar). */
export const DRIFT_PER_MILE = VISUAL_DRIFT * 10;
/** Millas antes del final de la región anterior en que la luz verde asoma en el horizonte. */
export const APPROACH_MILES = 40;
/** x de la torre al cruzar la bocana y al asomar en el horizonte. */
export const TOWER_ENTRY_X = 700;
export const TOWER_HORIZON_X = 2500;
/** Distancia lateral de la torre (a estribor). */
export const TOWER_Z = 300;
/** Fracción del ritmo del agua con que se desplaza la torre (paralaje de lo grande y lejano). */
export const TOWER_PARALLAX = 0.45;
/** Media anchura de la franja lateral reservada a la torre y su muelle. */
export const TOWER_BAND = 130;
/** Separación entre amarres a lo largo del puerto (m). */
export const SLOT_SPACING = 80;
/** Media anchura del canal libre por el que navega el barco (m). */
export const CHANNEL_HALF = 45;
/** Distancia lateral de las boyas de la bocana. */
export const BUOY_Z = 38;
/** Eje de los pantalanes que bordean el canal (a ambos lados). */
export const PROMENADE_Z = CHANNEL_HALF + 4;
/** Distancia mínima del centro de un grupo al eje del canal (amarrado por fuera del pantalán). */
export const MOOR_MIN_Z = PROMENADE_Z + 22;
/** Primer tramo de pantalán tras la bocana (m) y variantes de tramo. */
export const PROMENADE_START = 60;
const PROMENADE_VARIANTS = 4;
/** Millas tras dejar el puerto en que aún se ve a popa. */
const LEAVE_MILES = 75;

export type HarborMode = 'approach' | 'port' | 'leaving';

export interface HarborSpan {
  mode: HarborMode;
  /** Millas dentro del puerto (negativas durante la aproximación). */
  s: number;
  /** x (marco del océano) de la bocana de entrada y de la de salida. */
  start: number;
  end: number;
}

const fin = (v: number, d = 0): number => (Number.isFinite(v) ? v : d);

/** Dónde está el puerto respecto al barco (null si no se ve). */
export function harborSpan(st: GameState): HarborSpan | null {
  const v = st.voyage;
  const port = REGIONS[FINAL_REGION];
  if (!port) return null;
  const D = DRIFT_PER_MILE;
  const rd = Math.max(0, fin(v.regionDistance));
  if (v.regionId === FINAL_REGION) {
    const len = v.regionLength > 0 ? v.regionLength : port.length;
    return { mode: 'port', s: rd, start: -rd * D, end: (len - rd) * D };
  }
  if (v.chosenNext === FINAL_REGION) {
    const len = v.regionLength > 0 ? v.regionLength : (REGIONS[v.regionId]?.length ?? 100);
    const R = Math.max(0, len - rd);
    if (R <= APPROACH_MILES) return { mode: 'approach', s: -R, start: R * D, end: (R + port.length) * D };
    return null;
  }
  const r = v.route;
  if (r.length >= 2 && r[r.length - 2] === FINAL_REGION && r[r.length - 1] === v.regionId && rd < LEAVE_MILES) {
    return { mode: 'leaving', s: port.length + rd, start: -(port.length + rd) * D, end: -rd * D };
  }
  return null;
}

/** x de la torre de la luz verde (marco del océano) según las millas dentro del puerto. */
export function towerX(s: number): number {
  if (s < 0) return TOWER_ENTRY_X + (Math.min(APPROACH_MILES, -s) / APPROACH_MILES) * (TOWER_HORIZON_X - TOWER_ENTRY_X);
  return TOWER_ENTRY_X - TOWER_PARALLAX * DRIFT_PER_MILE * s;
}

/** Visibilidad de la torre (asoma en el horizonte al empezar la aproximación; se pierde a popa). */
export function towerVisibility(span: HarborSpan): number {
  const x = towerX(span.s);
  const appear = 1 - THREE.MathUtils.smoothstep(-span.s, APPROACH_MILES - 3, APPROACH_MILES);
  const behind = THREE.MathUtils.smoothstep(x, -1750, -1400);
  return span.s < 0 ? appear : behind;
}

/** Ruido determinista 0..1. */
export function hash01(a: number, b: number, c = 0): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
}

export interface HarborSlot {
  /** Clave estable (amarre y lado). */
  key: string;
  /** Posición en el puerto (m desde la bocana). */
  p: number;
  z: number;
  variant: number;
  yaw: number;
}

/** Número de variantes de grupos de barcos-hogar. */
export const CLUSTER_VARIANTS = 8;

/**
 * Grupos de barcos-hogar del amarre `k` (de 0 a 3, deterministas por semilla): uno junto al canal
 * casi siempre, a menudo otro enfrente y, más allá, alguno en segunda fila. La franja de la torre
 * (a estribor) queda libre.
 */
export function harborSlots(seed: number, k: number): HarborSlot[] {
  const out: HarborSlot[] = [];
  const p = 120 + k * SLOT_SPACING + (hash01(k, seed, 1) - 0.5) * 30;
  const side = hash01(k, seed, 2) < 0.5 ? 1 : -1;
  const variant = (salt: number): number => Math.floor(hash01(k, seed, salt) * CLUSTER_VARIANTS);
  const yaw = (salt: number): number => (hash01(k, seed, salt) - 0.5) * 0.9 + (hash01(k, seed, salt + 1) < 0.3 ? Math.PI / 2 : 0);
  // Primera fila, junto al canal
  if (hash01(k, seed, 3) < 0.9) out.push({ key: `${k}a`, p, z: side * (MOOR_MIN_Z + hash01(k, seed, 4) * 45), variant: variant(5), yaw: yaw(6) });
  if (hash01(k, seed, 8) < 0.7) out.push({ key: `${k}b`, p: p + (hash01(k, seed, 9) - 0.5) * 40, z: -side * (MOOR_MIN_Z + hash01(k, seed, 10) * 45), variant: variant(11), yaw: yaw(12) });
  // Segunda fila
  if (hash01(k, seed, 14) < 0.55) {
    const sd = hash01(k, seed, 15) < 0.5 ? 1 : -1;
    const h = hash01(k, seed, 16);
    // A estribor, más allá de la franja de la torre; a babor, entre 190 y 450 m.
    const z = sd > 0 ? TOWER_Z + TOWER_BAND + 10 + h * 160 : 160 + h * 260;
    out.push({ key: `${k}c`, p: p + (hash01(k, seed, 17) - 0.5) * 50, z: sd * z, variant: variant(18), yaw: yaw(19) });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */

/** Ventana del puerto que se dibuja (m por delante y por detrás) según la calidad. */
const WINDOW: Record<Quality, [number, number]> = { baja: [-650, 950], media: [-900, 1300], alta: [-1000, 1450] };
/** Los reflejos de las luces solo se dibujan cerca (m). */
const MIRROR_DIST = 480;
const FADE_S = 3;

interface Entry {
  key: string;
  group: THREE.Group;
  mat: THREE.MeshLambertMaterial;
  lit: LitUniforms;
  halos: GlowPoints;
  mirror: GlowPoints | null;
  fade: number;
  leaving: boolean;
  x: number;
  z: number;
  pitch: number;
  roll: number;
  bob: number;
  radius: number;
}

interface Variant {
  model: HarborModel;
  halos: THREE.BufferGeometry;
}

interface Boat {
  kind: HarborBoatKind;
  entry: Entry;
  speed: number;
  heading: number;
  tx: number;
  tz: number;
  wait: number;
  wake: number;
}

const BEAM_COLOR = '#55ff8c';

export class HarborView {
  readonly root = new THREE.Group();
  private readonly variants = new Map<string, Variant>();
  private clusters = new Map<string, Entry>();
  private buoys = new Map<string, Entry>();
  private piers = new Map<string, Entry>();
  private tower: (Entry & { star: GlowPoints; beam: THREE.Mesh; birds: Birds }) | null = null;
  private boats: Boat[] = [];
  private boatSeed = 1;
  private time = 0;
  private quality: Quality = 'media';
  private span: HarborSpan | null = null;
  private level = 0;
  /** Obstáculos para los botes (el mercado del muelle y los mercantes que navegan a la par). */
  private obstacles: { x: number; z: number; r: number }[] = [];

  constructor(
    private readonly shared: GlowShared,
    quality: Quality = 'media',
  ) {
    this.root.name = 'puerto-esperanza';
    this.quality = quality;
  }

  setQuality(q: Quality): void {
    this.quality = q;
  }

  get mode(): HarborMode | null {
    return this.span?.mode ?? null;
  }

  get clusterCount(): number {
    return this.clusters.size;
  }

  get boatCount(): number {
    return this.boats.length;
  }

  /** Posición de la torre (o null si no se ve). */
  get towerPosition(): THREE.Vector3 | null {
    return this.tower && !this.tower.leaving ? this.tower.group.position : null;
  }

  /* ---------------- Modelos ---------------- */

  private variant(key: string, build: () => HarborModel): Variant {
    let v = this.variants.get(key);
    if (!v) {
      const model = build();
      v = { model, halos: glowGeometry(model.lights) };
      this.variants.set(key, v);
    }
    return v;
  }

  private makeEntry(key: string, v: Variant, x: number, z: number, yaw: number, instant: boolean, withMirror: boolean): Entry {
    const group = new THREE.Group();
    group.name = `puerto-${key}`;
    group.userData = { harbor: key };
    const lit = createLitUniforms();
    const mat = litMaterial(lit);
    const mesh = new THREE.Mesh(v.model.geo, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
    const halos = new GlowPoints(this.shared, v.halos, { minPx: 3, maxPx: 64, fogFloor: 0.22 });
    group.add(halos.points);
    let mirror: GlowPoints | null = null;
    if (withMirror && this.quality !== 'baja' && v.model.lights.length) {
      mirror = new GlowPoints(this.shared, v.halos, { mirror: true, minPx: 3, maxPx: 80, fogFloor: 0.15 });
      group.add(mirror.points);
    }
    group.rotation.y = yaw;
    group.position.set(x, WATERLINE_Y, z);
    this.root.add(group);
    return { key, group, mat, lit, halos, mirror, fade: instant ? 1 : 0, leaving: false, x, z, pitch: 0, roll: 0, bob: 0.25, radius: v.model.radius };
  }

  private disposeEntry(e: Entry): void {
    e.group.removeFromParent();
    e.mat.dispose();
    e.halos.dispose();
    e.mirror?.dispose();
  }

  private makeTower(x: number, instant: boolean): NonNullable<HarborView['tower']> {
    const v = this.variant('torre', () => greenTowerModel(77));
    const e = this.makeEntry('torre', v, x, TOWER_Z, -0.35, instant, true);
    e.bob = 0;
    const star = new GlowPoints(this.shared, [{ p: [0, TOWER_LIGHT_Y, 0], color: '#22e86a', size: 36 }], { style: 'star', minPx: 15, maxPx: 140, fogFloor: 0.85, dimSmall: false });
    star.points.name = 'luz-verde';
    e.group.add(star.points);
    const beam = greenBeam(320, 18);
    beam.position.y = TOWER_LIGHT_Y;
    e.group.add(beam);
    const birds = new Birds();
    birds.mesh.name = 'gaviotas-torre';
    birds.mesh.castShadow = false;
    birds.mesh.position.set(0, TOWER_LIGHT_Y - 10, 0);
    e.group.add(birds.mesh);
    return Object.assign(e, { star, beam, birds });
  }

  /* ---------------- Actualización ---------------- */

  update(st: GameState, dt: number, ds: number, water: WaterFn, atm: Atmosphere, newSim: boolean, hull: { xMin: number; xMax: number; halfWidth: number }): void {
    this.time += dt;
    const span = harborSpan(st);
    this.span = span;
    this.level = lightsLevel(atm.day, atm.overcast, atm.fogAmount);
    const seed = (Math.abs(Math.floor(fin(st.seed, 1))) % 9973) + 1;
    const [REMOVE_X, SPAWN_X] = WINDOW[this.quality];

    // --- Grupos de barcos-hogar ---
    const want = new Set<string>();
    if (span) {
      const Lm = (span.end - span.start) - 120;
      const kMin = Math.max(0, Math.floor((REMOVE_X - span.start - 120) / SLOT_SPACING) - 1);
      const kMax = Math.floor((SPAWN_X - span.start - 120) / SLOT_SPACING) + 1;
      for (let k = kMin; k <= kMax; k++) {
        for (const s of harborSlots(seed, k)) {
          if (s.p < 120 || s.p > Lm) continue;
          const x = span.start + s.p;
          if (x < REMOVE_X || x > SPAWN_X) continue;
          want.add(s.key);
          let e = this.clusters.get(s.key);
          if (!e) {
            const v = this.variant(`grupo:${s.variant}`, () => houseboatClusterModel(1000 + s.variant * 37));
            e = this.makeEntry(s.key, v, x, s.z, s.yaw, newSim, true);
            this.clusters.set(s.key, e);
          }
          e.leaving = false;
          e.x = x;
          e.z = s.z;
        }
      }
    }
    for (const [k, e] of this.clusters) {
      if (!want.has(k)) {
        e.leaving = true;
        e.x -= ds;
      }
    }

    // --- Pantalanes a ambos lados del canal (tramos largos: pocas llamadas de dibujo) ---
    const pierWant = new Set<string>();
    if (span) {
      const Lm = span.end - span.start - PROMENADE_START;
      const jMin = Math.max(0, Math.floor((REMOVE_X - span.start - PROMENADE_START) / PROMENADE_LEN) - 1);
      const jMax = Math.floor((SPAWN_X - span.start - PROMENADE_START) / PROMENADE_LEN) + 1;
      for (let j = jMin; j <= jMax; j++) {
        const p0 = PROMENADE_START + j * PROMENADE_LEN;
        if (p0 + PROMENADE_LEN > Lm) break;
        const x = span.start + p0 + PROMENADE_LEN / 2;
        if (x + PROMENADE_LEN / 2 < REMOVE_X || x - PROMENADE_LEN / 2 > SPAWN_X) continue;
        const key = `pantalan-${j}`;
        pierWant.add(key);
        let e = this.piers.get(key);
        if (!e) {
          const vi = Math.floor(hash01(j, seed, 61) * PROMENADE_VARIANTS);
          const v = this.variant(`pantalan:${vi}`, () => promenadeModel(500 + vi * 17, PROMENADE_Z));
          e = this.makeEntry(key, v, x, 0, 0, newSim, true);
          e.bob = 0.12;
          this.piers.set(key, e);
        }
        e.leaving = false;
        e.x = x;
      }
    }
    for (const [k, e] of this.piers) {
      if (!pierWant.has(k)) {
        e.leaving = true;
        e.x -= ds;
      }
    }

    // --- Boyas de la bocana (entrada y salida) ---
    const buoyWant = new Set<string>();
    if (span) {
      for (const [which, x] of [['in', span.start], ['out', span.end]] as const) {
        if (x < REMOVE_X || x > SPAWN_X) continue;
        for (const side of [-1, 1] as const) {
          // Al entrar: roja a babor (−z) y verde a estribor; al salir, al revés.
          const color = (which === 'in') === (side < 0) ? 'red' : 'green';
          const key = `boya-${which}-${side}`;
          buoyWant.add(key);
          let e = this.buoys.get(key);
          if (!e) {
            const v = this.variant(`boya:${color}`, () => channelBuoyModel(color));
            e = this.makeEntry(key, v, x, side * BUOY_Z, 0, newSim, true);
            e.bob = 0.8;
            e.group.userData['flash'] = color === 'red' ? 4 : 3;
            this.buoys.set(key, e);
          }
          e.leaving = false;
          e.x = x;
        }
      }
    }
    for (const [k, e] of this.buoys) {
      if (!buoyWant.has(k)) {
        e.leaving = true;
        e.x -= ds;
      }
    }

    // --- Torre de la luz verde ---
    if (span) {
      const x = towerX(span.s);
      if (!this.tower) this.tower = this.makeTower(x, newSim);
      this.tower.leaving = false;
      this.tower.x = x;
      this.tower.z = TOWER_Z;
    } else if (this.tower) {
      this.tower.leaving = true;
    }

    // --- Botes que van y vienen ---
    this.obstacles = st.voyage.sightings.filter((x) => x.kind === 'mercante').map((x) => ({ x: Math.max(x.x, MERCHANT_STATION_X), z: (x.side < 0 ? -1 : 1) * Math.max(25, x.distance), r: 20 }));
    this.updateBoats(span, dt, ds, newSim, hull);
    this.animateBoats(water, dt);

    // --- Animación común ---
    const vis = span ? towerVisibility(span) : 0;
    const keep = (e: Entry, extra = 1): boolean => {
      if (e.leaving) e.fade -= dt / FADE_S;
      else e.fade = Math.min(1, e.fade + dt / FADE_S);
      if (e.fade <= 0 && e.leaving) return false;
      const op = THREE.MathUtils.clamp(e.fade, 0, 1) * extra;
      const transparent = op < 0.999;
      if (e.mat.transparent !== transparent) {
        e.mat.transparent = transparent;
        e.mat.depthWrite = !transparent;
        e.mat.needsUpdate = true;
      }
      e.mat.opacity = op;
      e.group.visible = op > 0.002;
      // Flotación suave (amarrados)
      let y = WATERLINE_Y;
      if (e.bob > 0) {
        const h = water(e.x, e.z) - WATERLINE_Y;
        const r = Math.max(3, Math.min(10, e.radius * 0.4));
        const sx = (water(e.x + r, e.z) - water(e.x - r, e.z)) / (2 * r);
        const sz = (water(e.x, e.z + r) - water(e.x, e.z - r)) / (2 * r);
        const kk = Math.min(1, dt * 2);
        e.pitch += (Math.atan(sx) * e.bob - e.pitch) * kk;
        e.roll += (-Math.atan(sz) * e.bob - e.roll) * kk;
        y += h * e.bob;
      }
      e.group.position.set(e.x, y, e.z);
      e.group.rotation.x = e.roll;
      e.group.rotation.z = e.pitch;
      e.lit.uLights.value = this.level * op;
      e.halos.intensity = this.level * op;
      if (e.mirror) e.mirror.intensity = Math.hypot(e.x, e.z) < MIRROR_DIST + e.radius ? this.level * op * 0.75 * (1 - 0.6 * atm.storm) : 0;
      return true;
    };
    const sweep = (m: Map<string, Entry>): void => {
      for (const [k, e] of m) {
        if (!keep(e)) {
          this.disposeEntry(e);
          m.delete(k);
        }
      }
    };
    sweep(this.clusters);
    sweep(this.piers);
    sweep(this.buoys);
    // Destellos de las boyas: un segundo encendidas cada 3–4 s, de día y de noche.
    for (const e of this.buoys.values()) {
      const period = (e.group.userData['flash'] as number) ?? 3;
      const on = (this.time % period) < 0.9 ? 1 : 0.08;
      const op = THREE.MathUtils.clamp(e.fade, 0, 1);
      e.lit.uLights.value = Math.max(0.35, this.level) * on * op;
      e.halos.intensity = (0.35 + 0.65 * this.level) * on * op;
      if (e.mirror) e.mirror.intensity = this.level * on * op * 0.8;
    }
    // Torre
    const t = this.tower;
    if (t) {
      if (!keep(t, vis)) {
        this.disposeTower();
      } else {
        const op = THREE.MathUtils.clamp(t.fade, 0, 1) * vis;
        // La luz verde se ve de día y de noche (late despacio); con niebla espesa apenas.
        const pulse = 0.88 + 0.12 * Math.sin(this.time * 1.3);
        t.star.intensity = op * pulse * (1 - 0.7 * atm.fogAmount);
        t.star.fogFloor = 0.85 * (1 - 0.8 * atm.fogAmount);
        t.star.coreWhite = this.level;
        // La linterna siempre luce algo (también de día).
        t.lit.uLights.value = Math.max(this.level, 0.45) * op;
        const beamK = THREE.MathUtils.clamp((1 - atm.day) * 1.25 + atm.fogAmount * 0.4, 0, 1) * op;
        t.beam.visible = beamK > 0.03;
        t.beam.rotation.y = this.time * 0.55;
        const bm = t.beam.material as THREE.MeshBasicMaterial;
        const dist = Math.hypot(t.x, t.z);
        bm.opacity = 0.15 * beamK * Math.max(0.25, Math.exp(-((atm.fogDensity * dist) ** 2)));
        // Gaviotas sobre la torre (de día, en el puerto)
        const gulls = span?.mode === 'port' ? THREE.MathUtils.smoothstep(atm.day, 0.35, 0.8) * (1 - atm.storm) * op : 0;
        t.birds.update(dt, gulls * 0.75, 0);
        t.birds.mesh.visible = gulls > 0.01 || t.birds.mesh.count > 0;
      }
    }
  }

  private disposeTower(): void {
    const t = this.tower;
    if (!t) return;
    this.disposeEntry(t);
    t.star.dispose();
    (t.beam.material as THREE.Material).dispose();
    t.birds.dispose();
    this.tower = null;
  }

  /* ---------------- Botes ---------------- */

  private boatTarget(b: Boat, hull: { xMin: number; xMax: number; halfWidth: number }, first: boolean): void {
    // Destino: el pantalán frente a algún grupo de primera fila o un punto del canal (los botes
    // no salen del canal: los pantalanes lo cierran a ambos lados).
    const docks: [number, number][] = [];
    for (const e of this.clusters.values()) {
      if (e.leaving || e.x < -350 || e.x > 950 || Math.abs(e.z) > MOOR_MIN_Z + 60) continue;
      docks.push([e.x + (hash01(b.tx, e.x, 3) - 0.5) * 20, Math.sign(e.z) * (PROMENADE_Z - 5)]);
    }
    for (let tries = 0; tries < 8; tries++) {
      const r = hash01(this.boatSeed++, tries, 13);
      let tx: number;
      let tz: number;
      if (docks.length && r < 0.75) {
        const d = docks[Math.floor(hash01(this.boatSeed, tries, 17) * docks.length)]!;
        tx = d[0];
        tz = d[1];
      } else {
        // Por el canal, entre el barco y los pantalanes de primera fila.
        tx = -200 + hash01(this.boatSeed, tries, 19) * 1000;
        tz = (hash01(this.boatSeed, tries, 23) < 0.5 ? -1 : 1) * (18 + hash01(this.boatSeed, tries, 29) * 22);
      }
      const bx = b.entry.x;
      const bz = b.entry.z;
      if (Math.hypot(tx - bx, tz - bz) < 40 && !first) continue;
      // Cruzar el canal solo lejos de la proa o ya a popa (el barco avanza hacia ellos).
      const crosses = Math.sign(tz) !== Math.sign(bz);
      if (crosses && !(Math.min(bx, tx) > 220 || Math.max(bx, tx) < hull.xMin - 40)) continue;
      // Nunca a través del casco ni del mercado.
      if (segmentHitsBox(bx, bz, tx, tz, hull.xMin - 15, hull.xMax + 25, hull.halfWidth + 14)) continue;
      if (this.obstacles.some((o) => segmentHitsBox(bx - o.x, bz - o.z, tx - o.x, tz - o.z, -o.r, o.r, o.r * 0.6))) continue;
      b.tx = tx;
      b.tz = tz;
      return;
    }
    // Sin destino válido: esperar un poco.
    b.tx = b.entry.x;
    b.tz = b.entry.z;
    b.wait = 3;
  }

  private spawnBoat(i: number, x: number, z: number, instant: boolean): Boat {
    const kind = HARBOR_BOAT_KINDS[i % HARBOR_BOAT_KINDS.length]!;
    const v = this.variant(`bote:${kind}:${i % 2}`, () => harborBoatModel(kind, 900 + i * 13));
    const e = this.makeEntry(`bote-${i}`, v, x, z, 0, instant, false);
    e.bob = 0.9;
    const speed = kind === 'lancha' ? 3.6 : kind === 'velero' ? 2.3 : 1.3;
    return { kind, entry: e, speed, heading: hash01(i, x, 5) * Math.PI * 2, tx: x, tz: z, wait: hash01(i, z, 7) * 4, wake: 0 };
  }

  private updateBoats(span: HarborSpan | null, dt: number, ds: number, newSim: boolean, hull: { xMin: number; xMax: number; halfWidth: number }): void {
    const active = span !== null && span.mode !== 'approach';
    const want = active ? (this.quality === 'baja' ? 4 : 7) : 0;
    if (newSim) {
      for (const b of this.boats) this.disposeEntry(b.entry);
      this.boats = [];
    }
    // Crear los que falten junto al pantalán de un grupo cercano o en el canal (dentro del puerto).
    const near = [...this.clusters.values()].filter((e) => !e.leaving && e.x > -150 && e.x < 750 && Math.abs(e.z) < MOOR_MIN_Z + 60);
    for (let tries = 0; this.boats.length < want && tries < 24; tries++) {
      const i = this.boats.length;
      let x = -150 + hash01(i, this.boatSeed++, 31) * 900;
      let z = (hash01(i, this.boatSeed, 37) < 0.5 ? -1 : 1) * (18 + hash01(i, this.boatSeed, 41) * 22);
      if (near.length && hash01(i, this.boatSeed, 43) < 0.7) {
        const c = near[Math.floor(hash01(i, this.boatSeed, 47) * near.length)]!;
        x = c.x + (hash01(i, this.boatSeed, 53) - 0.5) * 20;
        z = Math.sign(c.z) * (PROMENADE_Z - 5);
      }
      if (span && (x < span.start + 60 || x > span.end - 60)) continue;
      if (x > hull.xMin - 30 && x < hull.xMax + 60 && Math.abs(z) < hull.halfWidth + 25) continue;
      const b = this.spawnBoat(i, x, z, newSim);
      this.boatTarget(b, hull, true);
      this.boats.push(b);
    }
    this.boats = this.boats.filter((b) => {
      const e = b.entry;
      if (!active) e.leaving = true;
      // El agua (y el bote con ella) pasa hacia popa; el destino también.
      e.x -= ds;
      b.tx -= ds;
      if (!e.leaving) {
        if (e.x < -700 || e.x > 1700) {
          // Se pierde a popa: reaparece más adelante, junto a otro pantalán.
          e.fade = 0;
          e.x = 250 + hash01(this.boatSeed++, e.z, 43) * 700;
          e.z = (hash01(this.boatSeed, e.x, 47) < 0.5 ? -1 : 1) * (18 + hash01(this.boatSeed, e.x, 53) * 22);
          this.boatTarget(b, hull, true);
        }
        if (b.wait > 0) {
          b.wait -= dt;
          b.wake = Math.max(0, b.wake - dt);
        } else {
          const dx = b.tx - e.x;
          const dz = b.tz - e.z;
          const d = Math.hypot(dx, dz);
          if (d < 4) {
            b.wait = 3 + hash01(this.boatSeed++, d, 59) * 9;
            this.boatTarget(b, hull, false);
          } else {
            // Gira poco a poco hacia el destino y avanza (más despacio al acercarse).
            const want = Math.atan2(-dz, dx);
            let dh = want - b.heading;
            dh = Math.atan2(Math.sin(dh), Math.cos(dh));
            b.heading += THREE.MathUtils.clamp(dh, -0.7 * dt, 0.7 * dt);
            const sp = b.speed * THREE.MathUtils.clamp(d / 12, 0.3, 1) * (Math.abs(dh) > 1.2 ? 0.4 : 1);
            e.x += Math.cos(b.heading) * sp * dt;
            e.z -= Math.sin(b.heading) * sp * dt;
            b.wake = Math.min(1, b.wake + dt);
          }
        }
        // Apartarse si el barco se les echa encima.
        const inX = e.x > hull.xMin - 12 && e.x < hull.xMax + 45;
        const lim = hull.halfWidth + 12;
        if (inX && Math.abs(e.z) < lim) e.z += Math.sign(e.z || 1) * Math.min(lim - Math.abs(e.z), 4 * dt);
        for (const o of this.obstacles) {
          const dx = e.x - o.x;
          const dz = e.z - o.z;
          if (Math.abs(dx) < o.r && Math.abs(dz) < o.r * 0.6) e.z += Math.sign(dz || 1) * Math.min(o.r * 0.6 - Math.abs(dz), 4 * dt);
        }
        // Los pantalanes cierran el canal: un bote que se abre al virar no los atraviesa.
        const wall = PROMENADE_Z - 3;
        if (Math.abs(e.z) > wall) e.z = Math.sign(e.z) * wall;
      }
      return true;
    });
    // Fundidos y flotación (como los grupos); los que se van, desaparecen.
    this.boats = this.boats.filter((b) => {
      const e = b.entry;
      if (e.leaving) e.fade -= dt / FADE_S;
      else e.fade = Math.min(1, e.fade + dt / FADE_S);
      if (e.fade <= 0 && e.leaving) {
        this.disposeEntry(e);
        return false;
      }
      return true;
    });
  }

  /** Flotación y luces de los botes (tras moverlos). */
  private animateBoats(water: WaterFn, dt: number): void {
    for (const b of this.boats) {
      const e = b.entry;
      const op = THREE.MathUtils.clamp(e.fade, 0, 1);
      const transparent = op < 0.999;
      if (e.mat.transparent !== transparent) {
        e.mat.transparent = transparent;
        e.mat.depthWrite = !transparent;
        e.mat.needsUpdate = true;
      }
      e.mat.opacity = op;
      e.group.visible = op > 0.002;
      const h = water(e.x, e.z);
      const r = 2;
      const sx = (water(e.x + r, e.z) - water(e.x - r, e.z)) / (2 * r);
      const sz = (water(e.x, e.z + r) - water(e.x, e.z - r)) / (2 * r);
      const kk = Math.min(1, dt * 3);
      e.pitch += (Math.atan(sx) - e.pitch) * kk;
      e.roll += (-Math.atan(sz) - e.roll) * kk;
      e.group.position.set(e.x, h, e.z);
      e.group.rotation.set(e.roll * 0.8, b.heading, e.pitch * 0.8, 'YXZ');
      e.lit.uLights.value = this.level * op;
      e.halos.intensity = this.level * op;
    }
  }

  /**
   * Puntos desde los que lanzar farolillos y fuegos (marco del océano): pantalanes de los grupos
   * cercanos y la plaza de la torre.
   */
  launchSpots(maxDist = 600): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const e of this.clusters.values()) {
      if (e.leaving || e.fade < 0.5) continue;
      if (Math.hypot(e.x, e.z) <= maxDist) out.push(new THREE.Vector3(e.x, WATERLINE_Y + 2, e.z));
    }
    const t = this.tower;
    if (t && !t.leaving && Math.hypot(t.x, t.z) <= maxDist + 300) out.push(new THREE.Vector3(t.x, WATERLINE_Y + 4, t.z));
    return out;
  }

  debugInfo(): Record<string, unknown> {
    const t = this.tower;
    return {
      modo: this.span?.mode ?? null,
      millas: this.span ? +this.span.s.toFixed(2) : null,
      torre: t ? [+t.x.toFixed(1), +t.z.toFixed(1)] : null,
      grupos: this.clusters.size,
      pantalanes: this.piers.size,
      boyas: this.buoys.size,
      botes: this.boats.length,
      luces: +this.level.toFixed(2),
    };
  }

  dispose(): void {
    for (const e of this.clusters.values()) this.disposeEntry(e);
    for (const e of this.piers.values()) this.disposeEntry(e);
    for (const e of this.buoys.values()) this.disposeEntry(e);
    for (const b of this.boats) this.disposeEntry(b.entry);
    this.disposeTower();
    this.clusters.clear();
    this.piers.clear();
    this.buoys.clear();
    this.boats = [];
    for (const v of this.variants.values()) {
      v.model.geo.dispose();
      v.halos.dispose();
    }
    this.variants.clear();
    this.root.removeFromParent();
  }
}

/** ¿Corta el segmento (ax,az)→(bx,bz) la caja |z| < hz, x ∈ [x0, x1]? */
export function segmentHitsBox(ax: number, az: number, bx: number, bz: number, x0: number, x1: number, hz: number): boolean {
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (x > x0 && x < x1 && Math.abs(z) < hz) return true;
  }
  return false;
}

/** Haz giratorio de la luz verde: dos conos aditivos opuestos, más claros junto a la linterna. */
function greenBeam(L: number, r: number): THREE.Mesh {
  const parts: number[] = [];
  const col: number[] = [];
  const seg = 10;
  const rings: [number, number][] = [
    [0, 1],
    [0.35, 0.3],
    [1, 0],
  ];
  for (const dir of [1, -1]) {
    for (let k = 0; k + 1 < rings.length; k++) {
      const [t0, b0] = rings[k]!;
      const [t1, b1] = rings[k + 1]!;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const p = (t: number, a: number): number[] => [dir * L * t, Math.cos(a) * r * t, Math.sin(a) * r * t];
        parts.push(...p(t0, a0), ...p(t1, a0), ...p(t1, a1), ...p(t0, a0), ...p(t1, a1), ...p(t0, a1));
        col.push(b0, b0, b0, b1, b1, b1, b1, b1, b1, b0, b0, b0, b1, b1, b1, b0, b0, b0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({
    color: BEAM_COLOR,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'haz-luz-verde';
  m.renderOrder = 6;
  m.frustumCulled = false;
  m.visible = false;
  // La geometría es propia del haz: se libera con su material.
  mat.addEventListener('dispose', () => g.dispose());
  return m;
}

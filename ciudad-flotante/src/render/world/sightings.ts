/**
 * AVISTAMIENTOS Y DECORADO LEJANO en el marco del océano (`worldRoot`).
 *
 * - Avistamientos (`state.voyage.sightings`, los crea la simulación): un modelo por tipo en
 *   (s.x, agua, s.side·s.distance). Aparecen y desaparecen fundiéndose. El naufragio y la balsa
 *   flotan con las olas; el mercante navega a la par (se mantiene por el través mientras dura el
 *   comercio y al final acelera y se aleja); islas y estructuras están fijas. El faro y el
 *   mercante encienden sus luces de noche y el faro barre el mar con su haz.
 * - Decorado lejano de la región (solo visual): islas grandes en el archipiélago, icebergs en la
 *   corriente boreal, cascos oxidados en el cementerio, farallones junto al faro y algún velero en
 *   aguas templadas. Viajan hacia popa con el agua y se renuevan por delante.
 */
import * as THREE from 'three';
import { WATERLINE_Y } from '../../sim/constants';
import type { GameState, Sighting } from '../../sim/types';
import type { Atmosphere } from './atmosphere';
import { makeRng } from './kit';
import {
  bigIslandModel,
  icebergModel,
  islandModel,
  lighthouseModel,
  merchantModel,
  platformModel,
  raftModel,
  sailboatModel,
  seaStackModel,
  signalTowerModel,
  weatherStationModel,
  wreckModel,
  type WorldModel,
} from './models';

type WaterFn = (x: number, z: number) => number;

/** x (m) en la que el mercante se mantiene por el través. */
export const MERCHANT_STATION_X = 2;
/** Segundos de fundido de entrada / salida. */
const FADE_IN = 2.5;
const FADE_OUT = 2.5;

interface Entry {
  id: number;
  kind: string;
  group: THREE.Group;
  solidMat: THREE.MeshLambertMaterial;
  glowMat: THREE.MeshBasicMaterial | null;
  beam: THREE.Mesh | null;
  model: WorldModel;
  fade: number;
  leaving: boolean;
  x: number;
  z: number;
  /** Inclinaciones suavizadas (flotación). */
  pitch: number;
  roll: number;
  /** Flota con las olas (0 = fijo). */
  floats: number;
  seed: number;
  yaw: number;
  /** Velocidad propia respecto al agua (m/s, veleros). */
  vx: number;
}

/* ------------------------------------------------------------------ */
/* Decorado por región                                                 */
/* ------------------------------------------------------------------ */

interface DecorRule {
  kind: 'bigIsland' | 'smallIsland' | 'iceberg' | 'hulk' | 'stack' | 'sailboat' | 'lighthouse';
  /** Separación entre apariciones (m de agua recorrida). */
  spacing: [number, number];
  /** Distancia lateral (m). */
  side: [number, number];
  weight: number;
}

const DECOR: Record<string, DecorRule[]> = {
  templadas: [{ kind: 'sailboat', spacing: [900, 1700], side: [260, 700], weight: 1 }],
  sargazos: [{ kind: 'sailboat', spacing: [1600, 2600], side: [300, 800], weight: 1 }],
  archipielago: [
    { kind: 'bigIsland', spacing: [420, 820], side: [380, 1100], weight: 2 },
    { kind: 'smallIsland', spacing: [420, 820], side: [220, 600], weight: 1.4 },
  ],
  cementerio: [{ kind: 'hulk', spacing: [320, 640], side: [200, 800], weight: 1 }],
  boreal: [{ kind: 'iceberg', spacing: [150, 320], side: [130, 800], weight: 1 }],
  tormentas: [{ kind: 'hulk', spacing: [1400, 2400], side: [300, 900], weight: 1 }],
  faro: [
    { kind: 'stack', spacing: [360, 720], side: [240, 900], weight: 1 },
    // Faros lejanos encendidos: de noche su haz barre el horizonte.
    { kind: 'lighthouse', spacing: [360, 720], side: [500, 1100], weight: 0.35 },
  ],
};

const DECOR_SPAWN_X = 1500;
const DECOR_REMOVE_X = -1550;

/* ------------------------------------------------------------------ */

export class SightingsView {
  private entries = new Map<number, Entry>();
  private decor: Entry[] = [];
  private cache = new Map<string, WorldModel>();
  private decorDist = 0;
  private decorRng = makeRng(4242);
  private decorSeed = 1;
  private time = 0;
  private beamGeo: THREE.BufferGeometry | null = null;

  constructor(readonly worldRoot: THREE.Group) {}

  get count(): number {
    return this.entries.size;
  }

  get decorCount(): number {
    return this.decor.length;
  }

  /* ---------------- Modelos ---------------- */

  private model(key: string, build: () => WorldModel): WorldModel {
    let m = this.cache.get(key);
    if (!m) {
      m = build();
      this.cache.set(key, m);
    }
    return m;
  }

  private sightingModel(s: Sighting, regionId: string): { model: WorldModel; kind: string; floats: number } {
    const v = Math.abs(s.id) % 3;
    switch (s.kind) {
      case 'naufragio':
        return { model: this.model(`naufragio:${v}`, () => wreckModel(11 + v * 17)), kind: 'naufragio', floats: 0.35 };
      case 'isla':
        return { model: this.model(`isla:${v}`, () => islandModel(23 + v * 31)), kind: 'isla', floats: 0 };
      case 'mercante':
        return { model: this.model(`mercante:${v}`, () => merchantModel(5 + v * 13)), kind: 'mercante', floats: 0.6 };
      case 'balsa':
        return { model: this.model('balsa', () => raftModel(3)), kind: 'balsa', floats: 1 };
      case 'estructura':
      default: {
        // El tipo de estructura sale del nombre que le da la simulación (events.ts).
        const n = s.name.toLowerCase();
        if (/faro/.test(n) || (regionId === 'faro' && !/plataforma|torre|estaci/.test(n))) {
          const dark = /sin luz|apagad/.test(n);
          return { model: this.model('faro', () => lighthouseModel(41)), kind: dark ? 'faro-apagado' : 'faro', floats: 0 };
        }
        if (/torre|señal|antena/.test(n)) return { model: this.model('torre', () => signalTowerModel(53)), kind: 'torre', floats: 0 };
        if (/meteorol|estaci|boya/.test(n)) return { model: this.model('estacion', () => weatherStationModel(61)), kind: 'estacion', floats: 0.7 };
        return { model: this.model('plataforma', () => platformModel(29)), kind: 'plataforma', floats: 0 };
      }
    }
  }

  private decorModel(kind: DecorRule['kind'], seed: number): { model: WorldModel; floats: number; vx: number } {
    const v = seed % 4;
    switch (kind) {
      case 'bigIsland':
        return { model: this.model(`d-isla:${v}`, () => bigIslandModel(101 + v * 37)), floats: 0, vx: 0 };
      case 'smallIsland':
        return { model: this.model(`d-islita:${v}`, () => islandModel(201 + v * 29, 1, false)), floats: 0, vx: 0 };
      case 'iceberg':
        return { model: this.model(`d-iceberg:${v}`, () => icebergModel(301 + v * 23)), floats: 0.15, vx: 0 };
      case 'hulk':
        return { model: this.model(`d-casco:${v}`, () => wreckModel(401 + v * 19, 2)), floats: 0.1, vx: 0 };
      case 'stack':
        return { model: this.model(`d-farallon:${v}`, () => seaStackModel(501 + v * 41)), floats: 0, vx: 0 };
      case 'lighthouse':
        return { model: this.model('faro', () => lighthouseModel(41)), floats: 0, vx: 0 };
      case 'sailboat':
      default:
        return { model: this.model(`d-velero:${v % 2}`, () => sailboatModel(601 + (v % 2) * 7)), floats: 0.8, vx: 1.2 + (seed % 5) * 0.3 };
    }
  }

  private makeEntry(id: number, kind: string, model: WorldModel, floats: number, x: number, z: number, seed: number, scale = 1): Entry {
    const group = new THREE.Group();
    group.name = `avistamiento-${kind}-${id}`;
    group.userData = { sightingId: id, kind };
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const solid = new THREE.Mesh(model.solid, solidMat);
    solid.castShadow = false;
    solid.receiveShadow = false;
    group.add(solid);
    let glowMat: THREE.MeshBasicMaterial | null = null;
    if (model.glow) {
      glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
      group.add(new THREE.Mesh(model.glow, glowMat));
    }
    let beam: THREE.Mesh | null = null;
    if (model.beamY !== null) {
      beam = this.makeBeam();
      beam.position.y = model.beamY;
      group.add(beam);
    }
    group.scale.setScalar(scale);
    const yaw = kind === 'mercante' || kind === 'velero' ? 0 : makeRng(seed)() * Math.PI * 2;
    group.rotation.y = yaw;
    group.position.set(x, WATERLINE_Y, z);
    this.worldRoot.add(group);
    return { id, kind, group, solidMat, glowMat, beam, model, fade: 0, leaving: false, x, z, pitch: 0, roll: 0, floats, seed, yaw, vx: 0 };
  }

  /** Haz del faro: dos conos opuestos aditivos, más claros cerca de la linterna. */
  private makeBeam(): THREE.Mesh {
    if (!this.beamGeo) {
      const parts: number[] = [];
      const col: number[] = [];
      const L = 140;
      const r = 9;
      const seg = 10;
      // Cono en dos tramos: el brillo cae deprisa y el extremo se apaga sin dibujar un "disco".
      const rings: [number, number][] = [
        [0, 1],
        [0.4, 0.3],
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
      this.beamGeo = new THREE.BufferGeometry();
      this.beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
      this.beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    }
    const mat = new THREE.MeshBasicMaterial({
      color: '#fff1c4',
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const m = new THREE.Mesh(this.beamGeo, mat);
    m.name = 'haz-faro';
    m.renderOrder = 6;
    m.frustumCulled = false;
    return m;
  }

  private disposeEntry(e: Entry): void {
    e.group.removeFromParent();
    e.solidMat.dispose();
    e.glowMat?.dispose();
    if (e.beam) (e.beam.material as THREE.Material).dispose();
  }

  /* ---------------- Decorado ---------------- */

  private spawnDecor(regionId: string, x: number, instant: boolean): void {
    const rules = DECOR[regionId];
    if (!rules || !rules.length) return;
    const total = rules.reduce((a, r) => a + r.weight, 0);
    let pick = this.decorRng() * total;
    let rule = rules[0]!;
    for (const r of rules) {
      pick -= r.weight;
      if (pick <= 0) {
        rule = r;
        break;
      }
    }
    const seed = this.decorSeed++;
    const side = this.decorRng() < 0.5 ? -1 : 1;
    const z = side * (rule.side[0] + this.decorRng() * (rule.side[1] - rule.side[0]));
    const { model, floats, vx } = this.decorModel(rule.kind, seed);
    // No solapar con otro decorado cercano.
    for (const d of this.decor) {
      if (Math.hypot(d.x - x, d.z - z) < d.model.radius + model.radius + 40) return;
    }
    const scale = rule.kind === 'smallIsland' ? 1 + this.decorRng() * 0.7 : 1;
    const kind = rule.kind === 'sailboat' ? 'velero' : rule.kind === 'lighthouse' ? 'faro' : rule.kind;
    const e = this.makeEntry(-seed, kind, model, floats, x, z, seed * 7 + 3, scale);
    e.vx = vx * (this.decorRng() < 0.3 ? -1 : 1);
    if (e.kind === 'velero') e.yaw = e.vx < 0 ? Math.PI : 0;
    e.fade = instant ? 1 : 0;
    this.decor.push(e);
  }

  private nextSpacing(regionId: string): number {
    const rules = DECOR[regionId];
    if (!rules || !rules.length) return 400;
    const r = rules[0]!;
    return r.spacing[0] + this.decorRng() * (r.spacing[1] - r.spacing[0]);
  }

  /** Puebla todo el campo de decorado al empezar (sin fundidos). */
  populate(regionId: string): void {
    for (const d of this.decor) this.disposeEntry(d);
    this.decor = [];
    let x = DECOR_SPAWN_X;
    while (x > DECOR_REMOVE_X + 50) {
      this.spawnDecor(regionId, x, true);
      x -= this.nextSpacing(regionId);
    }
    this.decorDist = this.nextSpacing(regionId) * this.decorRng();
  }

  /* ---------------- Actualización ---------------- */

  update(state: GameState, dt: number, ds: number, water: WaterFn, atm: Atmosphere, newSim: boolean): void {
    this.time += dt;
    const regionId = state.voyage.regionId;
    const night = 1 - atm.day;
    const dGame = ds;

    // --- Avistamientos ---
    const alive = new Set<number>();
    for (const s of state.voyage.sightings) {
      if (!Number.isFinite(s.x) || !Number.isFinite(s.distance)) continue;
      alive.add(s.id);
      let e = this.entries.get(s.id);
      const tz = (s.side < 0 ? -1 : 1) * Math.max(25, s.distance);
      let tx = s.x;
      let leaveF = 0;
      if (s.kind === 'mercante') {
        // Navega a la par por el través; en los últimos minutos acelera y se aleja.
        tx = Math.max(s.x, MERCHANT_STATION_X);
        const remaining = s.expiresAt - state.time;
        leaveF = THREE.MathUtils.clamp(1 - remaining / 5, 0, 1);
        tx += leaveF * leaveF * 160;
      }
      if (!e) {
        const m = this.sightingModel(s, regionId);
        e = this.makeEntry(s.id, m.kind, m.model, m.floats, tx, tz, s.id * 13 + 1);
        if (newSim) e.fade = 1;
        if (m.kind === 'mercante') e.yaw = 0;
        this.entries.set(s.id, e);
      }
      e.leaving = false;
      // Suaviza los cambios (el mercante se acerca y se coloca).
      const k = 1 - Math.exp(-dt * 1.5);
      e.x += (tx - e.x) * k;
      e.z += (tz - e.z) * k;
      if (s.kind === 'mercante' && leaveF > 0.55) e.fade = Math.min(e.fade, 1 - (leaveF - 0.55) / 0.45);
    }
    for (const [id, e] of this.entries) {
      if (!alive.has(id)) {
        e.leaving = true;
        if (e.kind === 'mercante') e.x += dt * 12;
      }
    }

    // --- Decorado de región ---
    if (newSim) this.populate(regionId);
    this.decorDist -= dGame;
    if (this.decorDist <= 0) {
      this.spawnDecor(regionId, DECOR_SPAWN_X, false);
      this.decorDist = this.nextSpacing(regionId);
    }
    for (const d of this.decor) {
      d.x += -dGame + d.vx * dt;
      if (d.x < DECOR_REMOVE_X || d.x > DECOR_SPAWN_X + 300) d.leaving = true;
    }

    // --- Animación común ---
    const animate = (e: Entry): boolean => {
      if (e.leaving) e.fade -= dt / FADE_OUT;
      else e.fade = Math.min(1, e.fade + dt / FADE_IN);
      if (e.fade <= 0 && e.leaving) return false;
      const op = THREE.MathUtils.clamp(e.fade, 0, 1);
      const transparent = op < 0.999;
      if (e.solidMat.transparent !== transparent) {
        e.solidMat.transparent = transparent;
        e.solidMat.depthWrite = !transparent;
      }
      e.solidMat.opacity = op;
      // Flotación
      let y = WATERLINE_Y;
      if (e.floats > 0) {
        const h = water(e.x, e.z) - WATERLINE_Y;
        const r = Math.max(2, Math.min(12, e.model.radius * 0.5));
        const sx = (water(e.x + r, e.z) - water(e.x - r, e.z)) / (2 * r);
        const sz = (water(e.x, e.z + r) - water(e.x, e.z - r)) / (2 * r);
        const kk = Math.min(1, dt * 2);
        e.pitch += (Math.atan(sx) * e.floats - e.pitch) * kk;
        e.roll += (-Math.atan(sz) * e.floats - e.roll) * kk;
        y += h * e.floats;
      }
      e.group.position.set(e.x, y, e.z);
      e.group.rotation.set(e.roll, e.yaw, e.pitch, 'YXZ');
      // Luces nocturnas
      if (e.glowMat) {
        const k = THREE.MathUtils.clamp(night * 1.3 + atm.overcast * 0.25 * night, 0, 1);
        e.glowMat.color.setRGB(0.32 + 0.68 * k, 0.32 + 0.68 * k, 0.34 + 0.66 * k);
        if (e.kind === 'plataforma' || e.kind === 'torre') {
          // baliza parpadeante: todo el conjunto luminoso late suavemente
          const blink = 0.75 + 0.25 * Math.sin(this.time * 3 + e.seed);
          e.glowMat.color.multiplyScalar(blink);
        }
        e.glowMat.transparent = transparent;
        e.glowMat.opacity = op;
      }
      if (e.kind === 'faro-apagado' && e.glowMat) e.glowMat.color.setRGB(0.3, 0.3, 0.32);
      if (e.beam) {
        const k = e.kind === 'faro-apagado' ? 0 : THREE.MathUtils.clamp(night * 1.2 + atm.fogAmount * 0.5, 0, 1);
        e.beam.visible = k > 0.03;
        e.beam.rotation.y = this.time * 0.9;
        const bm = e.beam.material as THREE.MeshBasicMaterial;
        // El haz no lleva la niebla de la escena: se atenúa a mano con la distancia.
        const dist = Math.hypot(e.x, e.z);
        const seen = Math.max(0.12, Math.exp(-((atm.fogDensity * dist) ** 2)));
        bm.opacity = 0.22 * k * op * seen;
      }
      return true;
    };

    for (const [id, e] of this.entries) {
      if (!animate(e)) {
        this.disposeEntry(e);
        this.entries.delete(id);
      }
    }
    this.decor = this.decor.filter((d) => {
      if (animate(d)) return true;
      this.disposeEntry(d);
      return false;
    });
  }

  dispose(): void {
    for (const e of this.entries.values()) this.disposeEntry(e);
    for (const d of this.decor) this.disposeEntry(d);
    this.entries.clear();
    this.decor = [];
    for (const m of this.cache.values()) {
      m.solid.dispose();
      m.glow?.dispose();
    }
    this.cache.clear();
    this.beamGeo?.dispose();
  }
}

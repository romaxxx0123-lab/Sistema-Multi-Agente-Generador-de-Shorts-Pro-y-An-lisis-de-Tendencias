/**
 * RONDA DE ARTE (arte-mundo): restos flotantes, avistamientos, islas y fauna hechos con Blender
 * (scripts/blender/models/restos.py y mundo.py). Comprueba que los modelos existen y se usan, que
 * conservan medidas, origen, cubierta de la balsa y presupuestos, que no añaden llamadas de dibujo y
 * que, sin ellos, todo vuelve al procedimental de siempre.
 */
import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/models/manifest.json';
import { DebrisView } from '../src/render/DebrisView';
import { hasModel, modelGeometry, preloadModels } from '../src/render/assets';
import { DEBRIS_LIFT, DEBRIS_RADIUS, debrisGeometry, debrisModelName, setBlenderDebrisModels } from '../src/render/ship/debrisModels';
import { DOLPHIN_AXIS, FISH_AXIS, MarineLife } from '../src/render/world/marine';
import {
  bigIslandModel,
  islandModel,
  lighthouseModel,
  raftModel,
  seaStackModel,
  setBlenderWorldModels,
  WORLD_LIFT,
  wreckModel,
  type WorldModel,
} from '../src/render/world/models';
import { SightingsView } from '../src/render/world/sightings';
import { createAtmosphere } from '../src/render/world/atmosphere';
import { createNewGame } from '../src/sim/newGame';
import type { DebrisKind, Sighting } from '../src/sim/types';

const KINDS = Object.keys(DEBRIS_RADIUS) as DebrisKind[];
const tris = (g: THREE.BufferGeometry): number => (g.getIndex()?.count ?? g.getAttribute('position').count) / 3;
const box = (g: THREE.BufferGeometry): THREE.Box3 => {
  g.computeBoundingBox();
  return g.boundingBox!;
};
const hasNaN = (g: THREE.BufferGeometry): boolean => Array.from(g.getAttribute('position').array as Float32Array).some((v) => !Number.isFinite(v));
const manifest = manifestJson as unknown as Record<string, { models: Record<string, { tris: number }> }>;

/** Triángulos del procedimental (los mismos que antes de la ronda de arte). */
const PROC_DEBRIS_TRIS: Record<DebrisKind, number> = { tablones: 108, barril: 160, caja: 68, restos: 232, red: 344, bidon: 72, cofre: 222, balsa: 334 };

describe('sin modelos cargados: todo procedimental', () => {
  it('los restos usan su versión procedimental de siempre', () => {
    for (const k of KINDS) for (let v = 0; v < 3; v++) expect(tris(debrisGeometry(k, v)), `${k}/${v}`).toBe(PROC_DEBRIS_TRIS[k]);
  });

  it('naufragio, isla, faro y balsa lejana son los procedimentales', () => {
    expect(tris(wreckModel(11).solid)).toBe(448);
    expect(tris(islandModel(23).solid)).toBe(2972);
    expect(tris(lighthouseModel(41).solid)).toBe(700);
    expect(tris(raftModel(3).solid)).toBe(176);
  });

  it('la fauna usa sus geometrías procedimentales', () => {
    const m = new MarineLife();
    expect(m.dolphinMesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    expect(m.fishMesh.geometry.getAttribute('position').count).toBeGreaterThan(0);
    m.dispose();
  });
});

describe('restos de Blender', () => {
  beforeAll(async () => {
    await preloadModels();
  });
  afterAll(() => setBlenderDebrisModels(true));

  it('hay tres variantes por tipo y cada una respeta el presupuesto', () => {
    const restos = manifest['restos']!.models;
    for (const k of KINDS) {
      for (let v = 0; v < 3; v++) {
        const name = debrisModelName(k, v);
        expect(hasModel(name), name).toBe(true);
        expect(restos[name]!.tris, name).toBeLessThanOrEqual(2500);
        expect(restos[name]!.tris, name).toBeLessThanOrEqual(1200);
      }
    }
    expect(debrisModelName('barril', 7)).toBe('resto_barril_1');
  });

  it('debrisGeometry usa el modelo, bajado a ras del agua, con el mismo radio en planta', () => {
    const footprint = (b: THREE.Box3): number => Math.max(Math.abs(b.min.x), Math.abs(b.max.x), Math.abs(b.min.z), Math.abs(b.max.z));
    setBlenderDebrisModels(false);
    const proc = Object.fromEntries(KINDS.map((k) => [k, Math.max(...[0, 1, 2].map((v) => footprint(box(debrisGeometry(k, v)))))])) as Record<DebrisKind, number>;
    setBlenderDebrisModels(true);
    for (const k of KINDS) {
      for (let v = 0; v < 3; v++) {
        const g = debrisGeometry(k, v);
        const src = modelGeometry(debrisModelName(k, v))!;
        expect(tris(g), `${k}/${v}`).toBe(tris(src));
        expect(hasNaN(g)).toBe(false);
        const b = box(g);
        // La superficie del agua vuelve a y = 0: hay algo por encima y algo hundido, nada más hondo que DEBRIS_LIFT.
        expect(b.max.y, `${k}/${v} asoma`).toBeGreaterThan(0.05);
        expect(b.min.y, `${k}/${v} toca el agua`).toBeLessThan(0.02);
        expect(b.min.y, `${k}/${v} no baja de DEBRIS_LIFT`).toBeGreaterThanOrEqual(-DEBRIS_LIFT - 0.01);
        // Huella parecida a la del procedimental (aro del gancho y colisión no cambian).
        const r = footprint(b);
        expect(r, `${k}/${v} radio`).toBeLessThanOrEqual(Math.max(DEBRIS_RADIUS[k], proc[k]) * 1.15);
        expect(r, `${k}/${v} radio`).toBeGreaterThan(DEBRIS_RADIUS[k] * 0.45);
        const pos = g.getAttribute('position');
        const col = g.getAttribute('color');
        expect(col.count).toBe(pos.count);
        expect(g.getAttribute('normal').count).toBe(pos.count);
      }
    }
  });

  it('la balsa tiene cubierta a +0.2 m donde se sientan los náufragos', () => {
    const ray = new THREE.Raycaster();
    for (let v = 0; v < 3; v++) {
      const mesh = new THREE.Mesh(debrisGeometry('balsa', v), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      for (const [x, z] of [
        [-0.6, -0.25],
        [0.15, 0.35],
        [0.9, -0.25],
      ] as const) {
        ray.set(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(mesh).filter((h) => h.point.y < 0.5);
        expect(hits.length, `balsa ${v} (${x}, ${z})`).toBeGreaterThan(0);
        expect(hits[0]!.point.y, `balsa ${v} (${x}, ${z})`).toBeGreaterThan(0.1);
        expect(hits[0]!.point.y, `balsa ${v} (${x}, ${z})`).toBeLessThan(0.32);
      }
    }
  });

  it('sin Blender (o si falta el modelo) se vuelve al procedimental', () => {
    setBlenderDebrisModels(false);
    for (const k of KINDS) expect(tris(debrisGeometry(k, 4)), k).toBe(PROC_DEBRIS_TRIS[k]);
    setBlenderDebrisModels(true);
    expect(tris(debrisGeometry('red', 4))).toBe(tris(modelGeometry('resto_red_1')!));
  });

  it('un resto sigue siendo una sola malla (sin llamadas de dibujo extra)', () => {
    const root = new THREE.Group();
    const view = new DebrisView(root);
    const st = createNewGame(3);
    st.debris = KINDS.map((kind, i) => ({ id: 30 + i, kind, pos: { x: i * 4, z: 12 }, vel: { x: 0, z: 0 }, loot: [], spin: 0 }));
    view.sync(st, 0.016, () => 0);
    const groups = root.children.filter((c) => c.userData['debrisId'] !== undefined);
    expect(groups.length).toBe(KINDS.length);
    for (const g of groups) expect(g.children.filter((c) => (c as THREE.Mesh).isMesh).length).toBe(1);
    // Cambiar a procedimental rehace las geometrías sin crear mallas.
    setBlenderDebrisModels(false);
    view.refreshModels();
    const barrel = groups.find((g) => g.userData['kind'] === 'barril')!.children[0] as THREE.Mesh;
    expect(tris(barrel.geometry)).toBe(PROC_DEBRIS_TRIS.barril);
    setBlenderDebrisModels(true);
    view.refreshModels();
    expect(tris(barrel.geometry)).toBeGreaterThan(PROC_DEBRIS_TRIS.barril);
    view.reset();
  });
});

describe('mundo de Blender', () => {
  beforeAll(async () => {
    await preloadModels();
  });
  afterAll(() => setBlenderWorldModels(true));

  const check = (m: WorldModel, name: string, maxTris: number, minY: number): void => {
    expect(hasNaN(m.solid), name).toBe(false);
    expect(m.solid.getAttribute('color').count, name).toBe(m.solid.getAttribute('position').count);
    expect(m.solid.getAttribute('normal').count, name).toBe(m.solid.getAttribute('position').count);
    expect(tris(m.solid), name).toBeLessThanOrEqual(maxTris);
    expect(box(m.solid).min.y, name).toBeGreaterThan(minY);
  };

  it('existen las piezas y respetan MAX_TRIS', () => {
    const mundo = manifest['mundo']!.models;
    for (const n of ['mundo_naufragio', 'mundo_palmera_0', 'mundo_palmera_1', 'mundo_palmera_2', 'mundo_roca_0', 'mundo_roca_1', 'mundo_roca_2', 'mundo_cabana', 'mundo_colinas_0', 'mundo_colinas_1', 'mundo_delfin', 'mundo_pez']) {
      expect(hasModel(n), n).toBe(true);
      expect(mundo[n]!.tris, n).toBeLessThanOrEqual(2500);
    }
  });

  it('el naufragio es el casco partido de Blender, con el agua a y = 0 y el mismo radio', () => {
    const m = wreckModel(11);
    check(m, 'naufragio', 4000, -WORLD_LIFT - 0.1);
    expect(tris(m.solid)).toBeGreaterThan(1400);
    const b = box(m.solid);
    expect(b.max.y).toBeGreaterThan(5); // proa y tocón del mástil al aire
    expect(Math.max(-b.min.x, b.max.x, -b.min.z, b.max.z)).toBeLessThanOrEqual(m.radius + 2);
    // Los cascos lejanos del decorado (escala 2) no llevan restos de Blender: menos triángulos.
    const hulk = wreckModel(401, 2);
    check(hulk, 'casco lejano', 2000, -WORLD_LIFT * 2 - 0.1);
    expect(hulk.radius).toBe(32);
  });

  it('las islas usan colinas, palmeras, rocas y cabaña de Blender dentro de su presupuesto', () => {
    const isla = islandModel(23);
    check(isla, 'isla', 6000, -8.1);
    expect(isla.radius).toBe(36);
    const islita = islandModel(201, 1.5, false);
    check(islita, 'islita', 6000 * 1, -8.1 * 1.5);
    expect(tris(islita.solid)).toBeLessThan(tris(isla.solid));
    check(bigIslandModel(101), 'isla grande', 2000, -40);
    check(seaStackModel(501), 'farallón', 1000, -20);
  });

  it('el faro deja ver la torre: islote más bajo, misma linterna y haz', () => {
    const m = lighthouseModel(41);
    check(m, 'faro', 1500, -13);
    expect(m.beamY).toBeGreaterThan(15);
    expect(m.glow).not.toBeNull();
    // Nada del islote (salvo la torre y la casa) por encima de la base de la torre (y = 3).
    const pos = m.solid.getAttribute('position');
    let high = 0;
    for (let i = 0; i < pos.count; i++) if (Math.hypot(pos.getX(i), pos.getZ(i)) > 3 && pos.getY(i) > 9) high++;
    expect(high).toBe(0);
  });

  it('la balsa lejana es la misma balsa de troncos que se rescata', () => {
    const m = raftModel(3);
    check(m, 'balsa', 900, -DEBRIS_LIFT * 1.2);
    expect(tris(m.solid)).toBe(tris(modelGeometry('resto_balsa_1')!));
  });

  it('sin Blender vuelven los procedimentales', () => {
    setBlenderWorldModels(false);
    expect(tris(wreckModel(11).solid)).toBe(448);
    expect(tris(islandModel(23).solid)).toBe(2972);
    expect(tris(lighthouseModel(41).solid)).toBe(700);
    expect(tris(raftModel(3).solid)).toBe(176);
    setBlenderWorldModels(true);
  });

  it('cada avistamiento sigue siendo una malla sólida (y la luminosa si la tenía)', () => {
    const counts = (on: boolean): number[] => {
      setBlenderWorldModels(on);
      const root = new THREE.Group();
      const v = new SightingsView(root);
      const st = createNewGame(3);
      const kinds: [Sighting['kind'], string][] = [
        ['naufragio', 'Pecio'],
        ['isla', 'Isla'],
        ['balsa', 'Balsa'],
        ['estructura', 'Faro del cabo'],
      ];
      st.voyage.sightings = kinds.map(([kind, name], i) => ({ id: 100 + i, kind, name, expiresAt: 1e6, side: 1, distance: 80, x: 40 * i, eventId: -1 }));
      v.update(st, 0.1, 0, () => 1, createAtmosphere(), true);
      const out = kinds.map((_, i) => root.children.find((c) => c.userData['sightingId'] === 100 + i)!.children.length);
      v.dispose();
      return out;
    };
    expect(counts(true)).toEqual(counts(false));
    setBlenderWorldModels(true);
  });

  it('delfines y peces usan los modelos con el eje del cuerpo en el origen', () => {
    const m = new MarineLife();
    const d = m.dolphinMesh.geometry;
    const f = m.fishMesh.geometry;
    expect(tris(d)).toBe(tris(modelGeometry('mundo_delfin')!));
    expect(tris(f)).toBe(tris(modelGeometry('mundo_pez')!));
    const bd = box(d);
    expect(bd.min.x).toBeLessThan(-2);
    expect(bd.max.x).toBeGreaterThan(1.3);
    expect(Math.abs((bd.min.y + bd.max.y) / 2)).toBeLessThan(0.3);
    const bf = box(f);
    expect(Math.abs((bf.min.y + bf.max.y) / 2)).toBeLessThan(0.08);
    expect(DOLPHIN_AXIS).toBeGreaterThan(FISH_AXIS);
    // La geometría compartida del modelo no se toca (se usa una copia bajada).
    expect(box(modelGeometry('mundo_delfin')!).min.y).toBeGreaterThan(-0.02);
    // Volver al procedimental cambia la geometría sin crear mallas nuevas.
    setBlenderWorldModels(false);
    m.refreshModels();
    expect(tris(m.dolphinMesh.geometry)).not.toBe(tris(modelGeometry('mundo_delfin')!));
    setBlenderWorldModels(true);
    m.refreshModels();
    expect(tris(m.dolphinMesh.geometry)).toBe(tris(modelGeometry('mundo_delfin')!));
    m.dispose();
  });
});

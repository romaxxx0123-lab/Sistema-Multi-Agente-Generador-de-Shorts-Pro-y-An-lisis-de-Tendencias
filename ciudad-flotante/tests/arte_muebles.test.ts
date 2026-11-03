/**
 * [arte-muebles] Muebles y máquinas hechos con Blender (scripts/blender/models/muebles.py y
 * maquinas.py) enganchados en propModel: sustituyen solo la geometría sólida (y la rueda del
 * timón), con las mismas medidas, alturas de uso, anclajes, cristal, luces, contenido, piezas y
 * placa; conservan los detalles de los niveles de mejora; caben en su colisionador y bajo el
 * techo; no añaden llamadas de dibujo; y sin los modelos todo es procedimental como antes.
 */
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/models/manifest.json';
import { MODULE_LIST, type PropKind } from '../src/data/modules';
import { hasModel, modelGeometry, preloadModels } from '../src/render/assets';
import { ShipView } from '../src/render/ShipView';
import { MATTRESS_TOP } from '../src/render/ship/furniture';
import { PIECE_LIFT, fitToDims, hasBlenderProp, propModel, propTier, setBlenderProps, type PropDims, type PropModel } from '../src/render/ship/props';
import { WALL_H } from '../src/sim/constants';
import { createNewGame } from '../src/sim/newGame';
import { computeLayout, instantiateModule } from '../src/sim/ship';
import { SOFA_SEATS } from '../src/sim/npc';

interface ManifestModel {
  tris: number;
  min: [number, number, number];
  max: [number, number, number];
}
const manifest = manifestJson as unknown as Record<string, { models: Record<string, ManifestModel> }>;
const FILES = ['muebles', 'maquinas'];
const MODELS = FILES.flatMap((f) => Object.keys(manifest[f]?.models ?? {}));
/** Props con modelo base de Blender. */
const KINDS = MODELS.filter((n) => /^prop_[a-z_]+$/.test(n) && !MODELS.some((o) => o !== n && n.startsWith(o + '_'))).map((n) => n.slice(5) as PropKind);

const tris = (g: THREE.BufferGeometry | null): number => (g ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0);

/** Colisionador (medidas locales) y módulo de cada tipo de prop. */
function specOf(kind: PropKind): { d: PropDims; module: string; maxTier: number; enclosed: boolean } {
  for (const m of MODULE_LIST)
    for (const p of m.props)
      if (p.kind === kind) {
        const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
        return { d: { hx, hz, h }, module: m.id, maxTier: Math.max(1, ...(m.upgrades ?? []).map((u) => u.tier)), enclosed: m.enclosed };
      }
  throw new Error(kind);
}

function both(kind: PropKind, tier = 1, d = specOf(kind).d): { bl: PropModel; pr: PropModel } {
  const module = specOf(kind).module;
  setBlenderProps(true);
  const bl = propModel(kind, d, tier, module);
  setBlenderProps(false);
  const pr = propModel(kind, d, tier, module);
  setBlenderProps(true);
  return { bl, pr };
}

/** Altura de la primera superficie bajo (x, z) en una geometría (rayo desde arriba). */
function topAt(geo: THREE.BufferGeometry, x: number, z: number): number | null {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const hits = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh);
  return hits.length ? hits[0]!.point.y : null;
}

describe('arte-muebles: modelos de Blender de los props', () => {
  beforeAll(async () => {
    await preloadModels();
  });
  afterEach(() => setBlenderProps(true));

  it('están en el manifiesto, cargados, dentro del presupuesto y con nombre de prop válido', () => {
    expect(KINDS.length).toBeGreaterThanOrEqual(8);
    const all = new Set(MODULE_LIST.flatMap((m) => m.props.map((p) => p.kind)));
    for (const k of KINDS) expect(all.has(k), k).toBe(true);
    for (const f of FILES)
      for (const [name, m] of Object.entries(manifest[f]!.models)) {
        expect(hasModel(name), name).toBe(true);
        expect(m.tris, name).toBeLessThanOrEqual(2500);
        expect(name.startsWith('prop_'), name).toBe(true);
      }
    // la rueda del timón es una pieza aparte, exportada con su pivote a PIECE_LIFT
    const wheel = manifest.maquinas!.models.prop_timon_rueda!;
    expect((wheel.min[1] + wheel.max[1]) / 2).toBeCloseTo(PIECE_LIFT, 2);
  });

  it('sustituyen la geometría sólida y conservan anclajes, cristal, luces, contenido, piezas y placa', () => {
    for (const k of KINDS) {
      const { bl, pr } = both(k);
      expect(hasBlenderProp(k), k).toBe(true);
      expect(bl.solid, k).not.toBe(pr.solid);
      expect(tris(bl.solid), k).toBeGreaterThan(tris(pr.solid));
      expect(Object.keys(bl.anchors).sort(), k).toEqual(Object.keys(pr.anchors).sort());
      for (const [a, v] of Object.entries(pr.anchors)) expect(bl.anchors[a]!.distanceTo(v), `${k}.${a}`).toBeLessThan(1e-9);
      expect(bl.anchors.plaque, k).toBeDefined();
      for (const key of ['glass', 'glow', 'contents'] as const) expect(tris(bl[key]), `${k} ${key}`).toBe(tris(pr[key]));
      expect(bl.tiers, k).toEqual(pr.tiers);
      expect(Object.keys(bl.parts), k).toEqual(Object.keys(pr.parts));
      expect(bl.movingPivot?.toArray() ?? null, k).toEqual(pr.movingPivot?.toArray() ?? null);
      expect(bl.solid.getAttribute('color'), k).toBeDefined();
      expect(bl.solid.getAttribute('normal'), k).toBeDefined();
    }
  });

  it('la rueda del timón es de Blender y gira sobre el mismo pivote (centrada en su cubo)', () => {
    const { bl, pr } = both('timon');
    expect(bl.moving).not.toBe(pr.moving);
    bl.moving!.computeBoundingBox();
    const c = bl.moving!.boundingBox!.getCenter(new THREE.Vector3());
    expect(c.length()).toBeLessThan(0.03);
    expect(bl.moving!.boundingBox!.max.x).toBeCloseTo(0.62, 1);
  });

  it('mantienen alturas de uso: colchones, mantas, asientos y encimeras', () => {
    const near = (k: PropKind, x: number, z: number, tol = 0.04): void => {
      const { bl, pr } = both(k);
      const a = topAt(bl.solid, x, z);
      const b = topAt(pr.solid, x, z);
      expect(a, `${k} (${x}, ${z})`).not.toBeNull();
      expect(Math.abs(a! - b!), `${k} (${x}, ${z}): ${a} vs ${b}`).toBeLessThan(tol);
    };
    // manta sobre el colchón (la persona dormida se tumba en MATTRESS_TOP)
    near('cama', 0.3, 0);
    expect(topAt(both('cama').bl.solid, 0.3, 0)! - MATTRESS_TOP.cama).toBeLessThan(0.06);
    near('litera', 0.3, 0);
    // asiento del sofá en cada plaza, de la silla y tablero de la mesa (lo de encima se apoya ahí)
    for (const x of SOFA_SEATS) near('sofa', x, -0.15);
    near('silla', 0, -0.05);
    near('mesa', 0.2, 0.1, 0.005);
    near('baul', 0, 0, 0.05);
    near('barril', 0, 0.1, 0.03);
    near('bancal', 1.1, 0, 0.06);
  });

  it('cada nivel de mejora sigue viéndose distinto y conserva sus detalles sobre el modelo', () => {
    for (const k of KINDS) {
      const { maxTier } = specOf(k);
      if (propTier(k, specOf(k).module, 3) === 1) continue;
      const one = both(k, 1);
      for (let t = 2; t <= maxTier; t++) {
        const cur = both(k, t);
        // con modelo base: los extras del nivel se añaden encima (misma diferencia que en el procedimental)
        if (hasModel(`prop_${k}@${t}`)) continue;
        if (tris(cur.bl.solid) === tris(cur.pr.solid)) continue; // nivel que cambia la base: procedimental
        expect(tris(cur.bl.solid) - tris(one.bl.solid), `${k} nivel ${t}`).toBe(tris(cur.pr.solid) - tris(one.pr.solid));
        expect(tris(cur.bl.solid), `${k} nivel ${t}`).toBeGreaterThan(tris(one.bl.solid));
      }
    }
    // el depósito más alto (nivel 2) o forrado (3) cambia la base: sigue siendo procedimental
    expect(both('deposito', 2).bl.solid.getAttribute('position').count).toBe(both('deposito', 2).pr.solid.getAttribute('position').count);
  });

  it('caben en su colisionador (con el margen del procedimental) y nada atraviesa el techo, en todos los niveles', () => {
    for (const def of MODULE_LIST) {
      const maxTier = Math.max(1, ...(def.upgrades ?? []).map((u) => u.tier));
      for (const p of def.props) {
        if (!KINDS.includes(p.kind)) continue;
        const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
        for (let tier = 1; tier <= maxTier; tier++) {
          const m = propModel(p.kind, { hx, hz, h }, tier, def.id);
          m.solid.computeBoundingBox();
          const bb = m.solid.boundingBox!;
          const tag = `${def.id} ${p.kind} ${tier}`;
          expect(bb.min.y, tag).toBeGreaterThan(-0.05);
          if (def.enclosed) expect(bb.max.y, tag).toBeLessThanOrEqual(WALL_H + 1e-3);
          if (p.kind !== 'silla') {
            expect(bb.max.x, tag).toBeLessThan(hx + 0.45);
            expect(bb.min.x, tag).toBeGreaterThan(-hx - 0.45);
            expect(bb.max.z, tag).toBeLessThan(hz + 0.45);
            expect(bb.min.z, tag).toBeGreaterThan(-hz - 0.45);
          }
          for (const g of [m.solid, m.moving]) {
            if (!g) continue;
            const a = g.getAttribute('position').array as ArrayLike<number>;
            let finite = true;
            for (let i = 0; i < a.length; i++) finite &&= Number.isFinite(a[i]!);
            expect(finite, tag).toBe(true);
          }
        }
      }
    }
  }, 30000);

  it('se ajustan a otras medidas sin deformar los bordes (y sin tocar la geometría compartida)', () => {
    const base = modelGeometry('prop_cama')!;
    const before = (base.getAttribute('position').array as Float32Array).slice();
    const d = { hx: 1.3, hz: 0.6, h: 0.55 };
    const m = propModel('cama', d);
    m.solid.computeBoundingBox();
    const bb = m.solid.boundingBox!;
    expect(bb.max.x).toBeLessThan(d.hx + 0.1);
    expect(bb.max.x).toBeGreaterThan(d.hx - 0.1);
    expect(bb.min.z).toBeGreaterThan(-d.hz - 0.1);
    expect(bb.min.z).toBeLessThan(-d.hz + 0.05);
    expect(base.getAttribute('position').array).toEqual(before);
    // misma medida: la misma geometría (sin copia); otra: copia
    expect(fitToDims(base, { hx: 1, hz: 0.5, h: 0.55 }, { hx: 1, hz: 0.5, h: 0.55 })).toBe(base);
    expect(fitToDims(base, { hx: 1, hz: 0.5, h: 0.55 }, d)).not.toBe(base);
  });

  it('sin los modelos (o con setBlenderProps(false)) todo es el procedimental de siempre', () => {
    setBlenderProps(false);
    for (const k of KINDS) expect(hasBlenderProp(k), k).toBe(false);
    for (const m of MODULE_LIST)
      for (const p of m.props) {
        const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
        const pr = propModel(p.kind, { hx, hz, h }, 1, m.id);
        // un prop sin modelo de Blender es idéntico con o sin ellos
        setBlenderProps(true);
        const bl = propModel(p.kind, { hx, hz, h }, 1, m.id);
        setBlenderProps(false);
        if (!KINDS.includes(p.kind)) expect(tris(bl.solid), p.kind).toBe(tris(pr.solid));
        else expect(tris(bl.solid), p.kind).not.toBe(tris(pr.solid));
      }
  });

  it('no añaden llamadas de dibujo al barco (se fusionan con el resto) y miden sus triángulos', { timeout: 30000 }, () => {
    const st = createNewGame(1);
    const add = (type: string, level: number, x: number, z: number): void => {
      st.ship.modules.push(instantiateModule(st.nextId++, type, level, x, z, 0, 'active'));
    };
    add('motor', 0, 2, 0);
    add('comedor', 0, 4, 3);
    add('sala_comun', 0, 1, 3);
    add('huerto', 1, 8, 2);
    const layout = computeLayout(st.ship);
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
    cam.position.set(0, 5, 0);
    const measure = (on: boolean): { meshes: number; tris: number } => {
      setBlenderProps(on);
      const view = new ShipView(new THREE.Group());
      view.rebuildBudgetMs = Infinity;
      view.sync(st, layout, { hideAboveLevel: null, cutaway: false, highlight: null }, 1 / 60, cam);
      return { meshes: view.stats.staticMeshes, tris: view.stats.triangles };
    };
    const pr = measure(false);
    const bl = measure(true);
    expect(bl.meshes).toBe(pr.meshes);
    expect(bl.tris).toBeGreaterThan(pr.tris);
    // presupuesto: unos 20 000 triángulos más en un barco con todos estos muebles (la escena entera
    // ronda los 180 000 por frame), sin ninguna malla más
    expect(bl.tris - pr.tris).toBeLessThan(22000);
    console.log(`[arte-muebles] barco de muestra: ${pr.meshes} mallas estáticas en ambos; ${pr.tris} → ${bl.tris} triángulos (+${(((bl.tris - pr.tris) / pr.tris) * 100).toFixed(1)} %)`);
  });
});

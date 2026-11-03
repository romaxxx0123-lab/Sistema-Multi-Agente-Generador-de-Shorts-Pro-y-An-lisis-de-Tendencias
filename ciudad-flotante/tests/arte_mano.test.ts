/**
 * [arte-mano] Modelos de Blender del modelo en mano (brazo, herramientas y objetos) y de las
 * piezas que vuelan (garfio, corcho, pez): mismo marco, pivotes, anclajes, poses y escala que el
 * procedimental; nada atraviesa la cámara en las animaciones; no hay más llamadas de dibujo; y si
 * los modelos faltan, todo se construye como antes.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import manifestJson from '../src/assets/models/manifest.json';
import { ITEMS } from '../src/data/items';
import {
  appendHandModel,
  buildArm,
  buildBobber,
  buildFish,
  buildGrapnel,
  buildItemModel,
  FISH_GRILLED,
  FISH_RAW,
  FISH_SMOKED,
  hasHandModels,
  setBlenderHandModels,
  VM_LIFT,
  type ItemModel,
} from '../src/game/tools/models';
import { ViewModel, type VmActionName } from '../src/game/tools/viewmodel';
import { modelGeometry, preloadModels } from '../src/render/assets';
import { GeoBuilder } from '../src/render/ship/geo';

interface ManifestModel {
  tris: number;
  min: [number, number, number];
  max: [number, number, number];
}
const manifest = manifestJson as unknown as Record<string, { models: Record<string, ManifestModel> }>;
const HAND_FILES = ['mano', 'herramientas'];
const HAND_MODELS = HAND_FILES.flatMap((f) => Object.keys(manifest[f]?.models ?? {}));

const IDS = Object.keys(ITEMS);
const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lineMat = new THREE.LineBasicMaterial();

/** Triángulos y mallas (llamadas de dibujo) de un modelo en mano con su brazo. */
function stats(model: ItemModel, arm: THREE.Group): { tris: number; meshes: number } {
  let tris = 0;
  let meshes = 0;
  for (const root of [model.group, arm]) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      tris += m.geometry.getAttribute('position').count / 3;
    });
  }
  return { tris, meshes };
}

function build(id: string): { model: ItemModel; arm: THREE.Group } {
  return { model: buildItemModel(id, mat, lineMat), arm: buildArm(mat) };
}

function geoOf(fn: (b: GeoBuilder) => void): THREE.BufferGeometry {
  const b = new GeoBuilder();
  fn(b);
  return b.build();
}

/** Recorre los vértices visibles del modelo en mano en espacio de cámara (cámara en el origen). */
function forVisibleVertices(vm: ViewModel, fn: (v: THREE.Vector3) => void): void {
  vm.camera.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name !== 'limpia-profundidad') {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) fn(v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld));
    }
    for (const c of o.children) visit(c);
  };
  visit(vm.root);
}

const FOV = 72;
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const ASPECT = 16 / 9;
const NEAR = 0.05;

/**
 * Encuadre: distancia a la cámara de lo que se ve en pantalla (un vértice fuera del encuadre
 * puede pasar el plano cercano sin que se note; dentro, se vería cortado), lo más alto y lo más a
 * la izquierda (NDC).
 */
function framing(vm: ViewModel): { depth: number; top: number; left: number } {
  let depth = Infinity;
  let top = -Infinity;
  let left = Infinity;
  forVisibleVertices(vm, (p) => {
    const d = Math.max(-p.z, NEAR);
    const nx = p.x / d / (TAN * ASPECT);
    const ny = p.y / d / TAN;
    if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) depth = Math.min(depth, -p.z);
    if (p.z < -NEAR) {
      top = Math.max(top, ny);
      left = Math.min(left, nx);
    }
  });
  return { depth, top, left };
}

const MOTION = { bobPhase: 0, bobAmount: 0, yaw: 0, pitch: 0, landKick: 0, light: 1 };

function equipped(id: string): ViewModel {
  const cam = new THREE.PerspectiveCamera(FOV, ASPECT, NEAR, 100);
  const vm = new ViewModel(cam);
  vm.show(id);
  for (let i = 0; i < 40; i++) vm.update(1 / 60, MOTION, false);
  return vm;
}

/** Acciones que el juego lanza con cada objeto (Interaction, hook.ts, fishing.ts). */
function actionsFor(id: string): VmActionName[] {
  switch (ITEMS[id]?.tool) {
    case 'martillo':
      return ['swing', 'use'];
    case 'llave':
      return ['wrench', 'use'];
    case 'gancho':
      return ['aim', 'throw', 'pull'];
    case 'cana':
      return ['cast', 'wait', 'reel'];
    case 'cubo':
    case 'cubo_lleno':
      return ['dip', 'pour', 'eat'];
    default:
      return ITEMS[id]?.consume ? ['eat', 'use'] : ['use'];
  }
}

/* ---------------------------------------------------------------------- */

/** Resultados sin ningún modelo cargado (lo que se ve si faltan los .glb): la referencia. */
const missing = new Map<string, { tris: number; meshes: number; parts: string[]; anchors: [string, number[]][] }>();

describe('[arte-mano] respaldo: sin modelos de Blender se construye el procedimental', () => {
  it('sin cargar los .glb, ningún modelo vm_* existe y cada objeto se construye entero', () => {
    for (const name of HAND_MODELS) expect(modelGeometry(name), name).toBeNull();
    expect(hasHandModels('vm_brazo')).toBe(false);
    const b = new GeoBuilder();
    expect(appendHandModel(b, 'vm_brazo')).toBe(false);
    expect(b.build().getAttribute('position').count).toBe(0);
    for (const id of IDS) {
      const { model, arm } = build(id);
      const s = stats(model, arm);
      expect(s.tris, id).toBeGreaterThan(0);
      missing.set(id, {
        ...s,
        parts: [...model.parts.keys()].sort(),
        anchors: [...model.anchors].map(([k, a]) => [k, a.position.toArray()] as [string, number[]]).sort(),
      });
    }
  });
});

describe('[arte-mano] modelos de Blender del modelo en mano', () => {
  beforeAll(async () => {
    await preloadModels();
    setBlenderHandModels(true);
  });

  it('existen todos, respetan el presupuesto y la convención de base (puño a VM_LIFT)', () => {
    expect(HAND_MODELS).toContain('vm_brazo');
    for (const name of HAND_MODELS) {
      const geo = modelGeometry(name);
      expect(geo, name).not.toBeNull();
      expect(manifest.mano?.models[name] ?? manifest.herramientas?.models[name], name).toBeTruthy();
      const m = (manifest.mano?.models[name] ?? manifest.herramientas!.models[name])!;
      expect(m.tris, name).toBeLessThanOrEqual(2500);
      expect(m.min[1], `${name} apoyado`).toBeGreaterThanOrEqual(-0.001);
    }
    // El puño queda a VM_LIFT del suelo: el brazo rodea ese punto.
    const arm = modelGeometry('vm_brazo')!;
    const box = arm.boundingBox!;
    expect(box.containsPoint(new THREE.Vector3(0, VM_LIFT, 0))).toBe(true);
  });

  it('cada objeto conserva piezas, anclajes, pose, escala y número de mallas (sin más llamadas de dibujo)', () => {
    for (const id of IDS) {
      const ref = missing.get(id)!;
      const { model, arm } = build(id);
      const s = stats(model, arm);
      expect(s.meshes, `${id}: mallas`).toBe(ref.meshes);
      expect([...model.parts.keys()].sort(), id).toEqual(ref.parts);
      const anchors = [...model.anchors].map(([k, a]) => [k, a.position.toArray()] as [string, number[]]).sort();
      expect(anchors, id).toEqual(ref.anchors);
      setBlenderHandModels(false);
      const proc = buildItemModel(id, mat, lineMat);
      setBlenderHandModels(true);
      expect(model.pose, id).toEqual(proc.pose);
      expect(model.armRot, id).toEqual(proc.armRot);
      expect(model.scale, id).toBe(proc.scale);
      expect(model.group.scale.toArray(), id).toEqual(proc.group.scale.toArray());
    }
  });

  it('desactivados, los modelos de Blender dan exactamente el resultado de cuando faltan', () => {
    setBlenderHandModels(false);
    try {
      for (const id of IDS) {
        const { model, arm } = build(id);
        expect(stats(model, arm), id).toEqual({ tris: missing.get(id)!.tris, meshes: missing.get(id)!.meshes });
      }
    } finally {
      setBlenderHandModels(true);
    }
  });

  it('el brazo y los objetos usan su modelo de Blender (más detalle que los bloques)', () => {
    const withModel = IDS.filter((id) => !ITEMS[id]!.category.startsWith('documento'));
    let improved = 0;
    for (const id of withModel) {
      const { model, arm } = build(id);
      if (stats(model, arm).tris > missing.get(id)!.tris * 1.5) improved++;
    }
    // Todos menos las hojas del cuaderno (que siguen siendo procedimentales).
    expect(improved).toBe(withModel.length);
    const arm = buildArm(mat);
    let armTris = 0;
    arm.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) armTris += (o as THREE.Mesh).geometry.getAttribute('position').count / 3;
    });
    expect(armTris).toBeGreaterThan(400);
    expect(armTris).toBeLessThan(1500);
  });

  it('los objetos siguen en la mano: alguna parte pasa por el puño (nada flota)', () => {
    /** Distancia del centro del puño a la superficie más cercana del objeto. */
    const gap = (model: ItemModel): number => {
      model.group.updateMatrixWorld(true);
      let best = Infinity;
      const tri = new THREE.Triangle();
      const q = new THREE.Vector3();
      const origin = new THREE.Vector3();
      model.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'agua') return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i + 2 < p.count; i += 3) {
          tri.a.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          tri.b.fromBufferAttribute(p, i + 1).applyMatrix4(m.matrixWorld);
          tri.c.fromBufferAttribute(p, i + 2).applyMatrix4(m.matrixWorld);
          best = Math.min(best, tri.closestPointToPoint(origin, q).length());
        }
      });
      return best;
    };
    for (const id of IDS) {
      const blend = gap(build(id).model);
      setBlenderHandModels(false);
      const proc = gap(buildItemModel(id, mat, lineMat));
      setBlenderHandModels(true);
      // El puño mide ~10 cm: el objeto toca el puño (a menos de 5 cm de su centro) y no se
      // separa de él más que el procedimental.
      expect(blend, id).toBeLessThan(Math.max(0.05, proc + 0.005));
    }
  });

  it('las piezas clave coinciden con sus anclajes (boca del martillo, punta de la caña, boca del cubo, argolla)', () => {
    const extent = (id: string, part: string): THREE.Box3 => {
      const m = build(id).model.parts.get(part) as THREE.Mesh;
      m.geometry.computeBoundingBox();
      return m.geometry.boundingBox!;
    };
    const hammer = build('martillo').model;
    expect(extent('martillo', 'martillo').min.z).toBeCloseTo(hammer.anchors.get('cabeza')!.position.z, 1);
    const rod = build('cana').model;
    const tip = rod.anchors.get('punta')!.position;
    const rodBox = extent('cana', 'cana');
    expect(rodBox.max.y).toBeGreaterThan(tip.y - 0.01);
    expect(rodBox.max.y).toBeLessThan(tip.y + 0.02);
    expect(rodBox.min.z).toBeGreaterThan(tip.z - 0.02);
    const bucket = build('cubo').model;
    const rim = bucket.anchors.get('boca')!.position.y;
    const bucketBox = extent('cubo', 'cubo');
    expect(bucketBox.min.y).toBeCloseTo(-0.38, 1);
    expect(Math.abs(rim - -0.14)).toBeLessThan(0.03);
    const water = extent('cubo', 'agua');
    expect(Math.abs(water.max.y - rim)).toBeLessThan(0.02);
  });

  it('encuadre: en reposo nada sube más ni se acerca más a la mira que el procedimental', () => {
    for (const id of IDS) {
      setBlenderHandModels(false);
      const proc = framing(equipped(id));
      setBlenderHandModels(true);
      const blend = framing(equipped(id));
      expect(blend.depth, `${id}: delante de la cámara`).toBeGreaterThan(NEAR + 0.01);
      expect(blend.top, `${id}: no sube`).toBeLessThan(proc.top + 0.05);
      expect(blend.left, `${id}: no tapa la mira`).toBeGreaterThan(Math.min(proc.left - 0.05, 0.05));
    }
  });

  it('ninguna animación de uso mete el brazo o el objeto dentro de la cámara (en pantalla)', () => {
    const closest = (id: string, action: VmActionName): number => {
      const vm = equipped(id);
      vm.play(action);
      let c = Infinity;
      for (let t = 0; t < 1.3; t += 1 / 30) {
        vm.update(1 / 30, MOTION, false);
        c = Math.min(c, framing(vm).depth);
      }
      vm.dispose();
      return c;
    };
    for (const id of IDS) {
      for (const action of actionsFor(id)) {
        setBlenderHandModels(false);
        const proc = closest(id, action);
        setBlenderHandModels(true);
        const blend = closest(id, action);
        // Nunca cortado por el plano cercano, y nunca más cerca que el procedimental.
        expect(blend, `${id} · ${action}`).toBeGreaterThan(NEAR + 0.005);
        expect(blend, `${id} · ${action} (procedimental ${proc.toFixed(3)})`).toBeGreaterThan(Math.min(proc, 0.12) - 0.01);
      }
    }
  });

  it('el garfio lanzado, el corcho y el pez capturado (efectos) también usan Blender, con el mismo tamaño', () => {
    const cases: [string, (b: GeoBuilder) => void][] = [
      ['garfio', (b) => buildGrapnel(b, 2.2)],
      ['corcho', (b) => buildBobber(b, 2.4)],
      ['pez', (b) => buildFish(b, FISH_RAW.color, FISH_RAW.belly, 2.2)],
      ['asado', (b) => buildFish(b, FISH_GRILLED.color, FISH_GRILLED.belly, 1, true)],
      ['ahumado', (b) => buildFish(b, FISH_SMOKED.color, FISH_SMOKED.belly, 1, true)],
    ];
    for (const [name, fn] of cases) {
      setBlenderHandModels(false);
      const proc = geoOf(fn);
      setBlenderHandModels(true);
      const blend = geoOf(fn);
      expect(blend.getAttribute('position').count, name).toBeGreaterThan(proc.getAttribute('position').count);
      const a = proc.boundingBox!.getSize(new THREE.Vector3());
      const b = blend.boundingBox!.getSize(new THREE.Vector3());
      // Mismo largo y alto (±25 %); el pez de Blender es más fino (de canto) que el procedimental.
      for (const k of name === 'garfio' || name === 'corcho' ? [0, 1, 2] : [0, 1]) {
        expect(b.getComponent(k) / a.getComponent(k), `${name}[${k}]`).toBeGreaterThan(0.7);
        expect(b.getComponent(k) / a.getComponent(k), `${name}[${k}]`).toBeLessThan(1.6);
      }
      // Mismo origen: la argolla del garfio y la línea de flotación del corcho siguen en 0.
      const c = blend.boundingBox!.getCenter(new THREE.Vector3());
      const c0 = proc.boundingBox!.getCenter(new THREE.Vector3());
      expect(c.distanceTo(c0), name).toBeLessThan(0.05 * (name === 'garfio' || name === 'pez' ? 2.2 : name === 'corcho' ? 2.4 : 1));
    }
  });

  it('el brazo mantiene la dirección del antebrazo del procedimental (el encuadre no cambia)', () => {
    const farthest = (g: THREE.Group): THREE.Vector3 => {
      const out = new THREE.Vector3();
      const v = new THREE.Vector3();
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) if (v.fromBufferAttribute(p, i).length() > out.length()) out.copy(v);
      });
      return out;
    };
    setBlenderHandModels(false);
    const a = farthest(buildArm(mat));
    setBlenderHandModels(true);
    const b = farthest(buildArm(mat));
    expect(a.clone().normalize().dot(b.clone().normalize())).toBeGreaterThan(0.97);
    expect(b.length()).toBeGreaterThan(a.length() * 0.9);
  });
});

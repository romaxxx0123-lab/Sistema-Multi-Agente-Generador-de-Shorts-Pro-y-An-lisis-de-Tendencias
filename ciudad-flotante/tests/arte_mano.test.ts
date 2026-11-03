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
const ASPECT = 16 / 9;
const NEAR = 0.05;

/**
 * Encuadre: distancia a la cámara de lo que se ve en pantalla (un vértice fuera del encuadre
 * puede pasar el plano cercano sin que se note; dentro, se vería cortado), lo más alto y lo más a
 * la izquierda (NDC) de lo que está en pantalla.
 */
function framing(vm: ViewModel, fov = FOV): { depth: number; top: number; left: number } {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  let depth = Infinity;
  let top = -Infinity;
  let left = Infinity;
  forVisibleVertices(vm, (p) => {
    const d = Math.max(-p.z, NEAR);
    const nx = p.x / d / (tan * ASPECT);
    const ny = p.y / d / tan;
    if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) depth = Math.min(depth, -p.z);
    // Lo más alto y lo más a la izquierda de lo que cae dentro de la pantalla (un vértice muy por
    // debajo del borde, como el final de la manga, no tapa la mira aunque su x sea pequeña).
    if (p.z < -NEAR) {
      if (Math.abs(nx) <= 1) top = Math.max(top, ny);
      if (Math.abs(ny) <= 1) left = Math.min(left, nx);
    }
  });
  return { depth, top, left };
}

/** FOV extremos del menú de opciones y el de por defecto. */
const FOVS = [55, 72, 100];
/** Dirección del antebrazo (de la muñeca al codo) en el marco del puño, la del procedimental. */
const ARM_DIR = new THREE.Vector3(0.095, -0.385, 0.31).normalize();

/**
 * Vértices del extremo cortado de la manga (los más alejados del puño a lo largo del antebrazo)
 * que caen dentro de la pantalla con este FOV. Tiene que ser 0: la boca de la manga flotando en
 * mitad de la pantalla delata que el brazo es un tubo cortado.
 */
function sleeveEndOnScreen(vm: ViewModel, fov: number): number {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  vm.camera.updateMatrixWorld(true);
  let n = 0;
  vm.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.name !== 'puño' || !m.visible) return;
    const p = m.geometry.getAttribute('position');
    const v = new THREE.Vector3();
    let far = -Infinity;
    for (let i = 0; i < p.count; i++) far = Math.max(far, v.fromBufferAttribute(p, i).dot(ARM_DIR));
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      if (v.dot(ARM_DIR) < far - 0.004) continue;
      v.applyMatrix4(m.matrixWorld);
      if (v.z > -NEAR) continue;
      const nx = v.x / -v.z / (tan * ASPECT);
      const ny = v.y / -v.z / tan;
      if (Math.abs(nx) <= 1 && Math.abs(ny) <= 1) n++;
    }
  });
  return n;
}

/**
 * Aristas del modelo en mano que el plano cercano corta DENTRO de la pantalla (se vería la pieza
 * abierta). Mira las aristas y no solo los vértices: la manga es un tubo largo cuyos vértices
 * quedan lejos, delante y detrás de la cámara, pero cuyas caras cruzan el plano cercano.
 */
function nearPlaneCuts(vm: ViewModel, fov: number): number {
  const tan = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const zc = -NEAR;
  vm.camera.updateMatrixWorld(true);
  let n = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const pts: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name !== 'limpia-profundidad') {
      const p = m.geometry.getAttribute('position');
      for (let i = 0; i + 2 < p.count; i += 3) {
        for (let k = 0; k < 3; k++) pts[k]!.fromBufferAttribute(p, i + k).applyMatrix4(m.matrixWorld);
        for (let k = 0; k < 3; k++) {
          a.copy(pts[k]!);
          b.copy(pts[(k + 1) % 3]!);
          if ((a.z - zc) * (b.z - zc) >= 0) continue;
          const t = (zc - a.z) / (b.z - a.z);
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          if (Math.abs(x / NEAR / (tan * ASPECT)) <= 1 && Math.abs(y / NEAR / tan) <= 1) n++;
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(vm.root);
  return n;
}

const MOTION = { bobPhase: 0, bobAmount: 0, yaw: 0, pitch: 0, landKick: 0, light: 1 };

function equipped(id: string, fov = FOV): ViewModel {
  const cam = new THREE.PerspectiveCamera(fov, ASPECT, NEAR, 100);
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

  it('los objetos siguen en la mano: tocan los dedos o la palma (nada flota)', () => {
    /** Hueco entre la superficie del objeto y la de la mano (puño a menos de 9 cm del origen). */
    const gap = (id: string): number => {
      const { model, arm } = build(id);
      arm.rotation.set(model.armRot.x, model.armRot.y, model.armRot.z);
      const g = new THREE.Group();
      g.add(arm, model.group);
      g.updateMatrixWorld(true);
      const hand: THREE.Vector3[] = [];
      arm.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          if (v.length() < 0.09) hand.push(v);
        }
      });
      let best = Infinity;
      const tri = new THREE.Triangle();
      const q = new THREE.Vector3();
      model.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || m.name === 'agua') return;
        const p = m.geometry.getAttribute('position');
        for (let i = 0; i + 2 < p.count; i += 3) {
          tri.a.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
          tri.b.fromBufferAttribute(p, i + 1).applyMatrix4(m.matrixWorld);
          tri.c.fromBufferAttribute(p, i + 2).applyMatrix4(m.matrixWorld);
          for (const v of hand) best = Math.min(best, tri.closestPointToPoint(v, q).distanceTo(v));
        }
      });
      return best;
    };
    for (const id of IDS) expect(gap(id), id).toBeLessThan(0.006);
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

  /**
   * Recorre reposo y todas las acciones de cada objeto con un FOV y devuelve, por objeto y acción,
   * la menor distancia a la cámara de lo que se ve en pantalla y los vértices del extremo de la
   * manga que llegan a verse.
   */
  const sweep = (id: string, fov: number): { action: string; depth: number; sleeveEnd: number; cuts: number }[] => {
    const out: { action: string; depth: number; sleeveEnd: number; cuts: number }[] = [];
    for (const action of [null, ...actionsFor(id)]) {
      const vm = equipped(id, fov);
      let depth = framing(vm, fov).depth;
      let sleeveEnd = sleeveEndOnScreen(vm, fov);
      let cuts = nearPlaneCuts(vm, fov);
      if (action) {
        vm.play(action);
        for (let t = 0; t < 1.3; t += 1 / 30) {
          vm.update(1 / 30, MOTION, false);
          depth = Math.min(depth, framing(vm, fov).depth);
          sleeveEnd = Math.max(sleeveEnd, sleeveEndOnScreen(vm, fov));
          cuts = Math.max(cuts, nearPlaneCuts(vm, fov));
        }
      }
      vm.dispose();
      out.push({ action: action ?? 'reposo', depth, sleeveEnd, cuts });
    }
    return out;
  };

  /** Barrido de los dos (procedimental y Blender) con los tres FOV; se calcula una vez. */
  type Sweep = { fov: number; id: string; proc: ReturnType<typeof sweep>; blend: ReturnType<typeof sweep> };
  let sweeps: Sweep[] | null = null;
  const allSweeps = (): Sweep[] => {
    if (sweeps) return sweeps;
    sweeps = [];
    for (const fov of FOVS) {
      for (const id of IDS) {
        setBlenderHandModels(false);
        const proc = sweep(id, fov);
        setBlenderHandModels(true);
        sweeps.push({ fov, id, proc, blend: sweep(id, fov) });
      }
    }
    return sweeps;
  };

  it('con FOV 55, 72 y 100, ninguna animación corta el modelo con el plano cercano ni lo acerca de más', () => {
    const rows: string[] = [];
    for (const { fov, id, proc, blend } of allSweeps()) {
      {
        blend.forEach((b, i) => {
          const pr = proc[i]!;
          if (b.depth < pr.depth - 0.01) rows.push(`FOV ${fov} ${id} · ${b.action}: ${pr.depth.toFixed(3)} → ${b.depth.toFixed(3)} m`);
          // Nunca cortado por el plano cercano: ni un vértice cerca ni una cara que lo cruce en pantalla.
          expect(b.depth, `FOV ${fov} ${id} · ${b.action}`).toBeGreaterThan(NEAR + 0.02);
          expect(b.cuts, `FOV ${fov} ${id} · ${b.action}: caras cortadas en pantalla`).toBe(0);
          // Nunca más cerca que el procedimental, salvo que siga a más de 18 cm de la cámara
          // (más de tres veces el plano cercano: algo más grande en pantalla, sin recorte).
          expect(b.depth, `FOV ${fov} ${id} · ${b.action} (procedimental ${pr.depth.toFixed(3)})`).toBeGreaterThan(Math.min(pr.depth - 0.01, 0.18));
        });
      }
    }
    if (process.env.MEDIR) console.log(rows.join('\n'));
  }, 120_000);

  it('el extremo cortado de la manga no se ve nunca (FOV 55–100, reposo y todas las acciones)', () => {
    const seen: string[] = [];
    const procSeen: string[] = [];
    for (const { fov, id, proc, blend } of allSweeps()) {
      for (const r of proc) if (r.sleeveEnd > 0) procSeen.push(`FOV ${fov} ${id} · ${r.action}`);
      for (const r of blend) if (r.sleeveEnd > 0) seen.push(`FOV ${fov} ${id} · ${r.action} (${r.sleeveEnd})`);
    }
    if (process.env.MEDIR) console.log(`procedimental: ${procSeen.length} casos (${procSeen.slice(0, 8).join('; ')}…)`);
    // El procedimental sí lo enseña (cubo al volcar, FOV 100); el brazo de Blender, nunca.
    expect(procSeen.length).toBeGreaterThan(0);
    expect(seen).toEqual([]);
  }, 120_000);

  it('el garfio lanzado y el pez capturado (efectos) también usan Blender, con el mismo tamaño', () => {
    const cases: [string, (b: GeoBuilder) => void][] = [
      ['garfio', (b) => buildGrapnel(b, 2.2)],
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
      for (const k of name === 'garfio' ? [0, 1, 2] : [0, 1]) {
        expect(b.getComponent(k) / a.getComponent(k), `${name}[${k}]`).toBeGreaterThan(0.7);
        expect(b.getComponent(k) / a.getComponent(k), `${name}[${k}]`).toBeLessThan(1.6);
      }
      // Mismo origen: la argolla del garfio sigue en 0 y el pez, centrado.
      const c = blend.boundingBox!.getCenter(new THREE.Vector3());
      const c0 = proc.boundingBox!.getCenter(new THREE.Vector3());
      expect(c.distanceTo(c0), name).toBeLessThan(0.05 * (name === 'garfio' || name === 'pez' ? 2.2 : 1));
    }
  });

  it('el corcho sigue siendo el procedimental (el de Blender no lo mejoraba)', () => {
    expect(modelGeometry('vm_corcho')).toBeNull();
    const a = geoOf((b) => buildBobber(b, 2.4));
    setBlenderHandModels(false);
    const b = geoOf((g) => buildBobber(g, 2.4));
    setBlenderHandModels(true);
    expect(a.getAttribute('position').count).toBe(b.getAttribute('position').count);
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

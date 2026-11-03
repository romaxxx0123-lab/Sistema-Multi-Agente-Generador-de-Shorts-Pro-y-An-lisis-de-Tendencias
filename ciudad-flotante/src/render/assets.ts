/**
 * MODELOS HECHOS CON BLENDER (src/assets/models/*.glb, generados con `npm run models`).
 *
 * Los .glb van incrustados en el paquete (data URL) para que la página de un solo archivo los
 * lleve dentro. `preloadModels()` los decodifica una vez al arrancar (meshopt + cuantización);
 * después todo es síncrono:
 *
 * - `modelGeometry(nombre)`: geometría de un modelo estático (posición y color por vértice, con
 *   las transformaciones de sus nodos aplicadas), lista para `GeoBuilder.appendGeometry` o para
 *   una malla propia. Compartida y cacheada: no la modifiques ni la liberes.
 * - `modelObject(nombre)`: copia independiente del nodo (con esqueleto si lo tiene) para modelos
 *   animados o con materiales; `modelAnimations(nombre)` da sus clips.
 *
 * Si un modelo falta o no carga, estas funciones devuelven null y la vista usa su versión
 * procedimental: el juego nunca depende de que un .glb exista.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const SOURCES = import.meta.glob('../assets/models/*.glb', { query: '?inline', import: 'default', eager: true });

interface Entry {
  node: THREE.Object3D;
  file: string;
  clips: THREE.AnimationClip[];
  /** El archivo trae materiales propios (personajes); si no, solo color por vértice. */
  materials: boolean;
  geometry?: THREE.BufferGeometry | null;
}

/** Material de los modelos de color por vértice (el mismo sombreado mate que el resto del barco). */
let vertexColorMaterial: THREE.MeshLambertMaterial | null = null;
function sharedMaterial(): THREE.MeshLambertMaterial {
  vertexColorMaterial ??= new THREE.MeshLambertMaterial({ vertexColors: true });
  return vertexColorMaterial;
}

const models = new Map<string, Entry>();
let loading: Promise<void> | null = null;
const failures: string[] = [];

function dataUrlToBuffer(url: string): ArrayBuffer {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function parse(loader: GLTFLoader, data: ArrayBuffer): Promise<GLTF> {
  return new Promise((resolve, reject) => loader.parse(data, '', resolve, reject));
}

/** Decodifica todos los modelos incrustados (una sola vez; las llamadas siguientes esperan a la primera). */
export function preloadModels(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      await MeshoptDecoder.ready;
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      for (const [path, url] of Object.entries(SOURCES) as [string, string][]) {
        const file = path.slice(path.lastIndexOf('/') + 1, -4);
        try {
          const gltf = await parse(loader, dataUrlToBuffer(url));
          gltf.scene.updateMatrixWorld(true);
          const materials = (gltf.parser.json as { materials?: unknown[] }).materials?.length ?? 0;
          for (const node of gltf.scene.children) {
            if (models.has(node.name)) console.warn(`Modelo «${node.name}» repetido en ${file}.glb`);
            const clips = gltf.animations.filter((clip) => clip.tracks.some((t) => node.getObjectByName(t.name.split('.')[0]!)));
            models.set(node.name, { node, file, clips, materials: materials > 0 });
          }
        } catch (err) {
          failures.push(file);
          console.warn(`No se pudo cargar ${file}.glb; se usan los modelos procedimentales`, err);
        }
      }
    })();
  }
  return loading;
}

/** Nombres de los modelos cargados. */
export function modelNames(): string[] {
  return [...models.keys()];
}

/** Archivos .glb que no se pudieron decodificar. */
export function modelFailures(): readonly string[] {
  return failures;
}

export function hasModel(name: string): boolean {
  return models.has(name);
}

/**
 * Geometría fusionada de un modelo estático: position y color (RGB lineal; blanco si no tiene),
 * indexada o no. Coordenadas del modelo: origen en su base, frente hacia −z.
 */
export function modelGeometry(name: string): THREE.BufferGeometry | null {
  const e = models.get(name);
  if (!e) return null;
  if (e.geometry !== undefined) return e.geometry;
  const pos: number[] = [];
  const clr: number[] = [];
  const v = new THREE.Vector3();
  // Las raíces se exportan en el origen (cf.finish lleva su transformación a los vértices); la
  // matriz de cada malla solo trae la descuantización y las piezas hijas.
  e.node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    const p = g.getAttribute('position');
    const c = g.getAttribute('color');
    const index = g.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) {
      const vi = index ? index.getX(i) : i;
      // Posición de reposo: en una malla con esqueleto (personas.glb) pasa por los huesos, porque la
      // cuantización de una malla con piel va en sus matrices de enlace y no en el nodo.
      mesh.getVertexPosition(vi, v).applyMatrix4(mesh.matrixWorld);
      pos.push(v.x, v.y, v.z);
      if (c) clr.push(c.getX(vi), c.getY(vi), c.getZ(vi));
      else clr.push(1, 1, 1);
    }
  });
  if (pos.length === 0) {
    e.geometry = null;
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(clr, 3));
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  e.geometry = geo;
  return geo;
}

/**
 * Copia independiente del modelo (con su esqueleto si lo tiene) dentro de un grupo con el origen
 * en su base. Las mallas sin normales reciben normales planas; las de solo color por vértice, el
 * material mate compartido (el material por defecto de glTF es metálico y se vería negro).
 */
export function modelObject(name: string): THREE.Group | null {
  const e = models.get(name);
  if (!e) return null;
  const copy = cloneSkinned(e.node);
  const group = new THREE.Group();
  group.name = name;
  group.add(copy);
  copy.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!mesh.geometry.getAttribute('normal')) {
      mesh.geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      mesh.geometry.computeVertexNormals();
    }
    if (!e.materials) mesh.material = sharedMaterial();
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return group;
}

/** Clips de animación del modelo (por nombre de acción de Blender). */
export function modelAnimations(name: string): THREE.AnimationClip[] {
  return models.get(name)?.clips ?? [];
}

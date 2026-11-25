// Modelos de autos hechos en Blender (tools/blender/car_gen.py): glTF comprimido con meshopt,
// separados por rol (pintura, molduras, vidrio, cromo, ópticas, intermitentes) + metadatos.
// Se cargan antes de crear el juego; el renderizador de vehículos los prefiere a los procedurales.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import sedanGlb from '../../assets/cars/sedan.glb';
import sedanMeta from '../../assets/cars/sedan.json';
import taxiGlb from '../../assets/cars/taxi.glb';
import compactoGlb from '../../assets/cars/compacto.glb';
import compactoMeta from '../../assets/cars/compacto.json';
import patrullaGlb from '../../assets/cars/patrulla.glb';

// base: el modelo comparte la carrocería de otro y el glb sólo trae los agregados (cartel, barra de luces…)
const SOURCES = {
  sedan: { glb: sedanGlb, meta: sedanMeta },
  compacto: { glb: compactoGlb, meta: compactoMeta },
  taxi: { glb: taxiGlb, meta: sedanMeta, base: 'sedan' },
  patrulla: { glb: patrullaGlb, meta: sedanMeta, base: 'sedan' },
};

/** id de modelo → { geo: { paint, trim, glass, lens, chrome, head, tail, blinkL, blinkR, lo: {...} }, meta } */
export const CAR_ASSETS = {};

const ROLES = ['paint', 'trim', 'glass', 'lens', 'chrome', 'head', 'tail', 'blinkL', 'blinkR', 'extra'];

/** Copia los atributos útiles a Float32 (sin cuantización) y gira el modelo al sistema del juego. */
function normalizeGeometry(src, matrix) {
  const g = new THREE.BufferGeometry();
  const pos = src.attributes.position;
  const n = pos.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
  const C = src.attributes.color ? new Float32Array(n * 3) : null;
  // oclusión horneada en Blender: canal alfa del color de vértice
  const A = src.attributes.color && src.attributes.color.itemSize === 4 ? new Float32Array(n) : null;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3().getNormalMatrix(matrix);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    P.set([v.x, v.y, v.z], i * 3);
    if (src.attributes.normal) {
      v.fromBufferAttribute(src.attributes.normal, i).applyMatrix3(nm).normalize();
      N.set([v.x, v.y, v.z], i * 3);
    }
    if (C) {
      const c = src.attributes.color;
      C.set([c.getX(i), c.getY(i), c.getZ(i)], i * 3);
      if (A) A[i] = c.getW(i);
    }
  }
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  if (A) g.setAttribute('aAO', new THREE.BufferAttribute(A, 1));
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  if (!src.attributes.normal) g.computeVertexNormals();
  return g;
}

export async function loadCarAssets(onProgress) {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  // Blender: +Y adelante, +X derecha → juego: +Z adelante, +X izquierda (giro de 180° en Y)
  const toGame = new THREE.Matrix4().makeRotationY(Math.PI);
  // primero los modelos base, después las variantes
  const ids = Object.keys(SOURCES).sort((a, b) => (SOURCES[a].base ? 1 : 0) - (SOURCES[b].base ? 1 : 0));
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    const { glb: bin, meta, base } = SOURCES[id];
    try {
      const buf = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
      const gltf = await loader.parseAsync(buf, '');
      gltf.scene.updateMatrixWorld(true);
      const geo = {};
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        // el rol está en el nombre del nodo o de su ancestro nombrado más cercano (gltfpack con
        // cuantización deja la malla en un hijo sin nombre); "<rol>_lo" = nivel de detalle lejano
        // (GLTFLoader los llama "mesh_N")
        let role = null, lo = false;
        for (let p = o; p && !role; p = p.parent) {
          let name = p.name || '';
          lo = /_lo($|[_.])/.test(name);
          if (lo) name = name.replace(/_lo($|[_.].*)/, '');
          role = ROLES.find((r) => name === r || name.startsWith(r + '.')) || null;
        }
        if (!role) return;
        const m = toGame.clone().multiply(o.matrixWorld);
        const g = normalizeGeometry(o.geometry, m);
        const tgt = lo ? (geo.lo = geo.lo || {}) : geo;
        tgt[role] = tgt[role] ? mergeTwo(tgt[role], g) : g;
      });
      if (base && CAR_ASSETS[base]) {
        // copia de la carrocería base (cada modelo agrega sus propios atributos por instancia) + agregados
        const merged = cloneSet(CAR_ASSETS[base].geo);
        for (const [role, g] of Object.entries(geo)) {
          if (role === 'lo') continue;
          merged[role] = merged[role] ? mergeTwo(merged[role], g) : g;
        }
        if (geo.lo && merged.lo) {
          for (const [role, g] of Object.entries(geo.lo)) merged.lo[role] = merged.lo[role] ? mergeTwo(merged.lo[role], g) : g;
        }
        CAR_ASSETS[id] = { geo: merged, meta };
      } else CAR_ASSETS[id] = { geo, meta };
    } catch (e) {
      console.warn('[autos] no se pudo cargar', id, e);
    }
    if (onProgress) onProgress((k + 1) / ids.length);
  }
  return CAR_ASSETS;
}

function cloneSet(set) {
  const out = {};
  for (const [role, g] of Object.entries(set)) {
    if (role === 'lo') out.lo = cloneSet(g);
    else if (g) out[role] = g.clone();
  }
  return out;
}

function mergeTwo(a, b) {
  const out = new THREE.BufferGeometry();
  for (const key of Object.keys(a.attributes)) {
    if (!b.attributes[key]) continue;
    const A = a.attributes[key], B = b.attributes[key];
    const arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array, 0);
    arr.set(B.array, A.array.length);
    out.setAttribute(key, new THREE.BufferAttribute(arr, A.itemSize));
  }
  if (a.index && b.index) {
    const off = a.attributes.position.count;
    const idx = new Uint32Array(a.index.count + b.index.count);
    idx.set(a.index.array, 0);
    for (let i = 0; i < b.index.count; i++) idx[a.index.count + i] = b.index.array[i] + off;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return out;
}

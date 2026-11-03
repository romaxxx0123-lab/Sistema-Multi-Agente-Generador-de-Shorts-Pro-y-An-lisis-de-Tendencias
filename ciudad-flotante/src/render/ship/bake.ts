/**
 * FUSIÓN RÁPIDA DE GEOMETRÍA ESTÁTICA (ShipView).
 *
 * Junta en una sola geometría no indexada (position, normal, color) piezas colocadas con un giro en
 * y y una traslación, escribiendo cada vértice ya transformado directamente en el búfer final. Hace
 * el trabajo de `clone() + applyMatrix4() + mergeGeometries()` sin copias intermedias ni cálculos de
 * cajas por pieza: al terminar una mejora en un barco grande, rehacer los muebles de un nivel
 * costaba 20–50 ms solo en eso (ronda de QA 2), y así cuesta unas décimas de milisegundo.
 *
 * También devuelve, si se pide, el módulo dueño de cada vértice (tinte de daños de ShipView) y la
 * caja envolvente exacta, de la que sale la esfera (contiene todos los vértices: recorte correcto).
 */
import * as THREE from 'three';

export interface BakePart {
  /** Geometría de origen (no indexada; si lo es, se desindexa). Se lee, nunca se modifica. */
  geo: THREE.BufferGeometry;
  /** Giro en y (rad) y posición de la pieza; sin ellos la geometría ya está en su sitio. */
  yaw?: number;
  x?: number;
  y?: number;
  z?: number;
  /** Módulo dueño de todos sus vértices (-1 o sin dar: ninguno), si no se dan `tags`. */
  tag?: number;
  /** Módulo dueño de cada vértice (mismo orden que la geometría). */
  tags?: Int32Array;
}

export interface Baked {
  /** null si no había ningún vértice. */
  geo: THREE.BufferGeometry | null;
  /** Etiqueta por vértice (solo con `withTags`). */
  tags: Int32Array | null;
  vertices: number;
}

function floats(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): Float32Array | null {
  if (!a || (a as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute || a.itemSize !== 3 || a.normalized) return null;
  return a.array instanceof Float32Array ? a.array : null;
}

/** Vértices de una pieza (0 si no tiene posiciones). */
function countOf(g: THREE.BufferGeometry): number {
  const p = g.getAttribute('position');
  if (!p) return 0;
  return g.index ? g.index.count : p.count;
}

/**
 * Fusiona las piezas. `withTags` devuelve además la etiqueta de módulo de cada vértice (las piezas
 * sin `tag` ni `tags` quedan con -1).
 */
export function bakeParts(parts: readonly BakePart[], withTags = false): Baked {
  let n = 0;
  for (const p of parts) n += countOf(p.geo);
  if (n === 0) return { geo: null, tags: withTags ? new Int32Array(0) : null, vertices: 0 };
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tags = withTags ? new Int32Array(n).fill(-1) : null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let o = 0;
  for (const part of parts) {
    let g = part.geo;
    const cnt = countOf(g);
    if (!cnt) continue;
    if (g.index) g = g.toNonIndexed();
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    const ca = g.getAttribute('color');
    const yaw = part.yaw ?? 0;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const tx = part.x ?? 0;
    const ty = part.y ?? 0;
    const tz = part.z ?? 0;
    const o3 = o * 3;
    const sp = floats(pa);
    // Posiciones: x' = c·x + s·z + tx, z' = −s·x + c·z + tz (como Matrix4.makeRotationY(yaw).setPosition).
    for (let i = 0; i < cnt; i++) {
      const i3 = i * 3;
      const x = sp ? sp[i3]! : pa.getX(i);
      const y = sp ? sp[i3 + 1]! : pa.getY(i);
      const z = sp ? sp[i3 + 2]! : pa.getZ(i);
      const X = c * x + s * z + tx;
      const Y = y + ty;
      const Z = -s * x + c * z + tz;
      const j = o3 + i3;
      pos[j] = X;
      pos[j + 1] = Y;
      pos[j + 2] = Z;
      if (X < minX) minX = X;
      if (X > maxX) maxX = X;
      if (Y < minY) minY = Y;
      if (Y > maxY) maxY = Y;
      if (Z < minZ) minZ = Z;
      if (Z > maxZ) maxZ = Z;
    }
    // Normales: solo el giro (una rotación conserva su longitud).
    if (na) {
      const sn = floats(na);
      for (let i = 0; i < cnt; i++) {
        const i3 = i * 3;
        const x = sn ? sn[i3]! : na.getX(i);
        const y = sn ? sn[i3 + 1]! : na.getY(i);
        const z = sn ? sn[i3 + 2]! : na.getZ(i);
        const j = o3 + i3;
        nrm[j] = c * x + s * z;
        nrm[j + 1] = y;
        nrm[j + 2] = -s * x + c * z;
      }
    } else for (let i = 0; i < cnt; i++) nrm[o3 + i * 3 + 1] = 1;
    // Colores: tal cual (blanco si la pieza no tiene).
    if (ca) {
      const sc = floats(ca);
      if (sc) col.set(sc.subarray(0, cnt * 3), o3);
      else for (let i = 0; i < cnt; i++) col.set([ca.getX(i), ca.getY(i), ca.getZ(i)], o3 + i * 3);
    } else col.fill(1, o3, o3 + cnt * 3);
    if (tags) {
      if (part.tags) tags.set(part.tags.subarray(0, cnt), o);
      else if (part.tag !== undefined && part.tag >= 0) tags.fill(part.tag, o, o + cnt);
    }
    o += cnt;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
  geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
  return { geo, tags, vertices: n };
}

// Instancias divididas en sectores espaciales: descarte por frustum y por distancia (también en sombras).
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class ChunkedInstances {
  /** Escala global de distancia de dibujo (según calidad). */
  static distScale = 1;

  /**
   * @param {THREE.Object3D} parent
   * @param {THREE.BufferGeometry} geo
   * @param {THREE.Material|THREE.Material[]} mat
   * @param {object} opts { chunk, maxDist, cast, receive, name }
   */
  constructor(parent, geo, mat, opts = {}) {
    this.parent = parent;
    this.geo = geo;
    this.mat = mat;
    this.size = opts.chunk || 200;
    this.maxDist = opts.maxDist ?? Infinity;
    this.shadowDist = opts.shadowDist ?? 240;
    this.cast = opts.cast ?? true;
    this.receive = opts.receive ?? true;
    this.name = opts.name || 'chunked';
    this.renderOrder = opts.renderOrder || 0;
    this.items = [];
    this.chunks = [];
    this.lookup = [];
    this.dirtyColors = new Set();
    this.isChunked = true;
  }

  add(matrix, color = null) {
    const e = matrix.elements;
    this.items.push({ m: matrix.clone(), x: e[12], y: e[13], z: e[14], c: color ? color.clone() : null });
    return this.items.length - 1;
  }

  build() {
    const groups = new Map();
    this.items.forEach((it, i) => {
      const k = Math.floor(it.x / this.size) + ',' + Math.floor(it.z / this.size);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    });
    for (const idx of groups.values()) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, idx.length);
      let cx = 0, cz = 0;
      idx.forEach((ii, local) => {
        const it = this.items[ii];
        mesh.setMatrixAt(local, it.m);
        if (it.c) mesh.setColorAt(local, it.c);
        cx += it.x;
        cz += it.z;
        this.lookup[ii] = { chunk: this.chunks.length, local };
      });
      cx /= idx.length;
      cz /= idx.length;
      let r = 0;
      for (const ii of idx) r = Math.max(r, Math.hypot(this.items[ii].x - cx, this.items[ii].z - cz));
      mesh.computeBoundingSphere();
      mesh.castShadow = this.cast;
      mesh.receiveShadow = this.receive;
      mesh.renderOrder = this.renderOrder;
      mesh.name = this.name;
      this.parent.add(mesh);
      this.chunks.push({ mesh, cx, cz, r, idx });
    }
    return this;
  }

  /** Visibilidad por distancia al punto de vista. */
  update(camPos) {
    for (const c of this.chunks) {
      const d = Math.hypot(camPos.x - c.cx, camPos.z - c.cz) - c.r;
      const k = ChunkedInstances.distScale;
      c.mesh.visible = d < this.maxDist * k;
      c.mesh.castShadow = this.cast && d < this.shadowDist * k;
    }
  }

  get meshes() {
    return this.chunks.map((c) => c.mesh);
  }

  hide(i) {
    const l = this.lookup[i];
    if (!l) return;
    const mesh = this.chunks[l.chunk].mesh;
    const m = new THREE.Matrix4().copy(this.items[i].m);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    m.decompose(p, q, s);
    m.compose(p, q, s.set(0, 0, 0));
    mesh.setMatrixAt(l.local, m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  show(i) {
    const l = this.lookup[i];
    if (!l) return;
    const mesh = this.chunks[l.chunk].mesh;
    mesh.setMatrixAt(l.local, this.items[i].m);
    mesh.instanceMatrix.needsUpdate = true;
  }

  setColor(i, color) {
    const l = this.lookup[i];
    if (!l) return;
    const mesh = this.chunks[l.chunk].mesh;
    mesh.setColorAt(l.local, color);
    this.dirtyColors.add(mesh);
  }

  flushColors() {
    for (const m of this.dirtyColors) if (m.instanceColor) m.instanceColor.needsUpdate = true;
    this.dirtyColors.clear();
  }

  position(i, out = _v) {
    const it = this.items[i];
    return out.set(it.x, it.y, it.z);
  }
}

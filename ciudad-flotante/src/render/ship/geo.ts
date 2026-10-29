/**
 * Constructor de geometría low-poly con colores por vértice.
 *
 * Toda la geometría estática del barco (casco, estructura y props) se genera con este
 * constructor: triángulos no indexados con normal plana por cara y color por vértice, de modo
 * que un único material (`vertexColors`) sirve para casi todo y las mallas se fusionan por
 * material y nivel con muy pocas llamadas de dibujo.
 *
 * Convenciones: coordenadas locales del barco (x proa, y arriba, z manga). Las caras se emiten
 * en sentido antihorario vistas desde fuera (normal = (b-a)×(c-a)).
 */
import * as THREE from 'three';

export type ColorLike = THREE.ColorRepresentation;

const colorCache = new Map<string, THREE.Color>();

/** Color (espacio lineal) cacheado a partir de '#rrggbb', número o Color. */
export function col(c: ColorLike): THREE.Color {
  if (c instanceof THREE.Color) return c;
  const key = String(c);
  let v = colorCache.get(key);
  if (!v) {
    v = new THREE.Color(c);
    colorCache.set(key, v);
  }
  return v;
}

/** Variante más clara (f > 1) u oscura (f < 1) de un color, cacheada. */
export function shade(c: ColorLike, f: number): THREE.Color {
  const base = col(c);
  const key = `${base.getHexString()}*${f.toFixed(3)}`;
  let v = colorCache.get(key);
  if (!v) {
    v = base.clone().multiplyScalar(f);
    colorCache.set(key, v);
  }
  return v;
}

/** Mezcla de dos colores (t = 0 → a, 1 → b), cacheada. */
export function mix(a: ColorLike, b: ColorLike, t: number): THREE.Color {
  const ca = col(a);
  const cb = col(b);
  const key = `${ca.getHexString()}~${cb.getHexString()}~${t.toFixed(3)}`;
  let v = colorCache.get(key);
  if (!v) {
    v = ca.clone().lerp(cb, t);
    colorCache.set(key, v);
  }
  return v;
}

/** Hash determinista 0..1 (variaciones de color y colocación sin Math.random). */
export function hash01(...n: number[]): number {
  let h = 2166136261;
  for (const v of n) {
    h ^= Math.floor(v * 1000) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

/** Colores por cara de una caja. */
export interface FaceColors {
  px?: ColorLike;
  nx?: ColorLike;
  py?: ColorLike;
  ny?: ColorLike;
  pz?: ColorLike;
  nz?: ColorLike;
  /** Color de las caras no especificadas. */
  all: ColorLike;
}

export interface CylinderOpts {
  capTop?: boolean;
  capBottom?: boolean;
  /** Color de las tapas (por defecto el del lateral). */
  capColor?: ColorLike;
  /** Giro inicial de los segmentos (radianes). */
  phase?: number;
}

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _n = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();

export class GeoBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private clr: number[] = [];
  private mat = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  private flip = false;
  /** Multiplicador de brillo aplicado a todos los colores (módulos dañados más oscuros). */
  tint = 1;

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  get triangleCount(): number {
    return this.pos.length / 9;
  }

  isEmpty(): boolean {
    return this.pos.length === 0;
  }

  /* ---------------- Transformaciones ---------------- */

  push(): this {
    this.stack.push(this.mat.clone());
    return this;
  }

  pop(): this {
    const m = this.stack.pop();
    if (m) this.mat.copy(m);
    this.updateFlip();
    return this;
  }

  identity(): this {
    this.mat.identity();
    this.flip = false;
    return this;
  }

  translate(x: number, y: number, z: number): this {
    this.mat.multiply(_m.makeTranslation(x, y, z));
    return this;
  }

  rotateX(a: number): this {
    this.mat.multiply(_m.makeRotationX(a));
    return this;
  }

  rotateY(a: number): this {
    this.mat.multiply(_m.makeRotationY(a));
    return this;
  }

  rotateZ(a: number): this {
    this.mat.multiply(_m.makeRotationZ(a));
    return this;
  }

  scale(x: number, y: number, z: number): this {
    this.mat.multiply(_m.makeScale(x, y, z));
    this.updateFlip();
    return this;
  }

  apply(m: THREE.Matrix4): this {
    this.mat.multiply(m);
    this.updateFlip();
    return this;
  }

  private updateFlip(): void {
    this.flip = this.mat.determinant() < 0;
  }

  /* ---------------- Primitivas básicas ---------------- */

  /** Triángulo en coordenadas locales (antihorario visto desde fuera). */
  tri(ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, color: ColorLike): void {
    _a.set(ax, ay, az).applyMatrix4(this.mat);
    _b.set(bx, by, bz).applyMatrix4(this.mat);
    _c.set(cx, cy, cz).applyMatrix4(this.mat);
    if (this.flip) this.emit(_a, _c, _b, color);
    else this.emit(_a, _b, _c, color);
  }

  /** Emite un triángulo ya transformado. */
  private emit(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: ColorLike): void {
    _ab.subVectors(b, a);
    _ac.subVectors(c, a);
    _n.crossVectors(_ab, _ac);
    const len = _n.length();
    if (len < 1e-12) return; // triángulo degenerado
    _n.multiplyScalar(1 / len);
    const k = col(color);
    const t = this.tint;
    const r = k.r * t;
    const g = k.g * t;
    const bl = k.b * t;
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.nrm.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
    this.clr.push(r, g, bl, r, g, bl, r, g, bl);
  }

  triV(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: ColorLike): void {
    this.tri(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, color);
  }

  /** Cuadrilátero a-b-c-d (antihorario visto desde fuera). */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: ColorLike): void {
    this.tri(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, color);
    this.tri(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z, color);
  }

  /** Cuadrilátero a partir de 12 números. */
  quadN(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number,
    color: ColorLike,
  ): void {
    this.tri(ax, ay, az, bx, by, bz, cx, cy, cz, color);
    this.tri(ax, ay, az, cx, cy, cz, dx, dy, dz, color);
  }

  /** Caja por esquinas mínima y máxima. `color` puede ser un color o colores por cara. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: ColorLike | FaceColors, skip?: { py?: boolean; ny?: boolean; px?: boolean; nx?: boolean; pz?: boolean; nz?: boolean }): void {
    const fc: FaceColors = typeof color === 'object' && color !== null && 'all' in color ? color : { all: color as ColorLike };
    const c = (k: keyof Omit<FaceColors, 'all'>): ColorLike => fc[k] ?? fc.all;
    if (!skip?.px) this.quadN(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, c('px'));
    if (!skip?.nx) this.quadN(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, c('nx'));
    if (!skip?.py) this.quadN(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, c('py'));
    if (!skip?.ny) this.quadN(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, c('ny'));
    if (!skip?.pz) this.quadN(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, c('pz'));
    if (!skip?.nz) this.quadN(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, c('nz'));
  }

  /** Caja centrada en (cx, cy, cz) con tamaños (sx, sy, sz). */
  boxC(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: ColorLike | FaceColors): void {
    this.box(cx - sx / 2, cy - sy / 2, cz - sz / 2, cx + sx / 2, cy + sy / 2, cz + sz / 2, color);
  }

  /** Caja apoyada: centrada en x/z, desde y0 hasta y0 + sy. */
  boxB(cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, color: ColorLike | FaceColors): void {
    this.box(cx - sx / 2, y0, cz - sz / 2, cx + sx / 2, y0 + sy, cz + sz / 2, color);
  }

  /**
   * Tronco de pirámide: base (bw × bd) en y0 y tapa (tw × td) en y0 + h, centrados en (cx, cz)
   * (la tapa puede desplazarse con `dz`/`dx`).
   */
  frustum(cx: number, y0: number, cz: number, bw: number, bd: number, tw: number, td: number, h: number, color: ColorLike | FaceColors, dx = 0, dz = 0): void {
    const fc: FaceColors = typeof color === 'object' && color !== null && 'all' in color ? color : { all: color as ColorLike };
    const c = (k: keyof Omit<FaceColors, 'all'>): ColorLike => fc[k] ?? fc.all;
    const y1 = y0 + h;
    const b = [
      [cx - bw / 2, cz - bd / 2],
      [cx + bw / 2, cz - bd / 2],
      [cx + bw / 2, cz + bd / 2],
      [cx - bw / 2, cz + bd / 2],
    ];
    const t = [
      [cx + dx - tw / 2, cz + dz - td / 2],
      [cx + dx + tw / 2, cz + dz - td / 2],
      [cx + dx + tw / 2, cz + dz + td / 2],
      [cx + dx - tw / 2, cz + dz + td / 2],
    ];
    // -z
    this.quadN(b[1]![0]!, y0, b[1]![1]!, b[0]![0]!, y0, b[0]![1]!, t[0]![0]!, y1, t[0]![1]!, t[1]![0]!, y1, t[1]![1]!, c('nz'));
    // +x
    this.quadN(b[2]![0]!, y0, b[2]![1]!, b[1]![0]!, y0, b[1]![1]!, t[1]![0]!, y1, t[1]![1]!, t[2]![0]!, y1, t[2]![1]!, c('px'));
    // +z
    this.quadN(b[3]![0]!, y0, b[3]![1]!, b[2]![0]!, y0, b[2]![1]!, t[2]![0]!, y1, t[2]![1]!, t[3]![0]!, y1, t[3]![1]!, c('pz'));
    // -x
    this.quadN(b[0]![0]!, y0, b[0]![1]!, b[3]![0]!, y0, b[3]![1]!, t[3]![0]!, y1, t[3]![1]!, t[0]![0]!, y1, t[0]![1]!, c('nx'));
    // tapa
    if (tw > 1e-4 || td > 1e-4) this.quadN(t[3]![0]!, y1, t[3]![1]!, t[2]![0]!, y1, t[2]![1]!, t[1]![0]!, y1, t[1]![1]!, t[0]![0]!, y1, t[0]![1]!, c('py'));
    // base
    this.quadN(b[0]![0]!, y0, b[0]![1]!, b[1]![0]!, y0, b[1]![1]!, b[2]![0]!, y0, b[2]![1]!, b[3]![0]!, y0, b[3]![1]!, c('ny'));
  }

  /** Cilindro vertical de `seg` lados: base en y0, radios inferior/superior, altura h. */
  cylinder(cx: number, y0: number, cz: number, rBottom: number, rTop: number, h: number, seg: number, color: ColorLike, opts: CylinderOpts = {}): void {
    const capTop = opts.capTop ?? true;
    const capBottom = opts.capBottom ?? true;
    const capColor = opts.capColor ?? color;
    const ph = opts.phase ?? 0;
    const y1 = y0 + h;
    for (let i = 0; i < seg; i++) {
      const a0 = ph + (i / seg) * Math.PI * 2;
      const a1 = ph + ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      // lateral (orden que da normal hacia fuera)
      this.quadN(
        cx + c1 * rBottom, y0, cz + s1 * rBottom,
        cx + c0 * rBottom, y0, cz + s0 * rBottom,
        cx + c0 * rTop, y1, cz + s0 * rTop,
        cx + c1 * rTop, y1, cz + s1 * rTop,
        color,
      );
      if (capTop && rTop > 1e-4) this.tri(cx, y1, cz, cx + c1 * rTop, y1, cz + s1 * rTop, cx + c0 * rTop, y1, cz + s0 * rTop, capColor);
      if (capBottom && rBottom > 1e-4) this.tri(cx, y0, cz, cx + c0 * rBottom, y0, cz + s0 * rBottom, cx + c1 * rBottom, y0, cz + s1 * rBottom, capColor);
    }
  }

  /** Cilindro entre dos puntos (cabos, tuberías, varillas). */
  cylinderBetween(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, seg: number, color: ColorLike, opts: CylinderOpts = {}): void {
    _a.set(ax, ay, az);
    _b.set(bx, by, bz);
    _ab.subVectors(_b, _a);
    const len = _ab.length();
    if (len < 1e-5) return;
    _ab.multiplyScalar(1 / len);
    _q.setFromUnitVectors(_up, _ab);
    this.push();
    this.apply(_m.makeRotationFromQuaternion(_q).setPosition(_a));
    this.cylinder(0, 0, 0, r, r, len, seg, color, opts);
    this.pop();
  }

  /** Cilindro horizontal a lo largo del eje X local (centrado en cx). */
  cylinderX(cx: number, cy: number, cz: number, r: number, len: number, seg: number, color: ColorLike, opts: CylinderOpts = {}): void {
    this.cylinderBetween(cx - len / 2, cy, cz, cx + len / 2, cy, cz, r, seg, color, opts);
  }

  /** Cilindro horizontal a lo largo del eje Z local (centrado en cz). */
  cylinderZ(cx: number, cy: number, cz: number, r: number, len: number, seg: number, color: ColorLike, opts: CylinderOpts = {}): void {
    this.cylinderBetween(cx, cy, cz - len / 2, cx, cy, cz + len / 2, r, seg, color, opts);
  }

  /** Esfera low-poly (icosaedro). */
  sphere(cx: number, cy: number, cz: number, r: number, color: ColorLike, detail = 0, sy = 1): void {
    const g = icoCache(detail);
    this.push();
    this.translate(cx, cy, cz);
    this.scale(r, r * sy, r);
    this.appendGeometry(g, null, color);
    this.pop();
  }

  /** Anillo (toro low-poly) en el plano XY local, eje Z. */
  ring(cx: number, cy: number, cz: number, R: number, r: number, seg: number, color: ColorLike, tubeSeg = 4): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      for (let j = 0; j < tubeSeg; j++) {
        const b0 = (j / tubeSeg) * Math.PI * 2;
        const b1 = ((j + 1) / tubeSeg) * Math.PI * 2;
        const p = (a: number, b: number): [number, number, number] => {
          const rr = R + r * Math.cos(b);
          return [cx + rr * Math.cos(a), cy + rr * Math.sin(a), cz + r * Math.sin(b)];
        };
        const p00 = p(a0, b0);
        const p10 = p(a1, b0);
        const p11 = p(a1, b1);
        const p01 = p(a0, b1);
        this.quadN(...p00, ...p10, ...p11, ...p01, color);
      }
    }
  }

  /** Disco (polígono regular) en el plano XY local mirando a +z (o -z si `back`). */
  disc(cx: number, cy: number, cz: number, r: number, seg: number, color: ColorLike, back = false): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r;
      const y0 = cy + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r;
      const y1 = cy + Math.sin(a1) * r;
      if (back) this.tri(cx, cy, cz, x1, y1, cz, x0, y0, cz, color);
      else this.tri(cx, cy, cz, x0, y0, cz, x1, y1, cz, color);
    }
  }

  /** Prisma: polígono (x, z) extruido de y0 a y1. Polígono en orden antihorario visto desde arriba (+y). */
  prism(points: [number, number][], y0: number, y1: number, sideColor: ColorLike, topColor: ColorLike = sideColor, bottom = false): void {
    const n = points.length;
    if (n < 3) return;
    // Orientación: queremos el polígono antihorario visto desde +y, es decir, área con signo
    // en el plano (x, -z) positiva. Corregimos si viene al revés.
    let area = 0;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = points[i]!;
      const [x1, z1] = points[(i + 1) % n]!;
      area += x0 * -z1 - x1 * -z0;
    }
    const pts = area < 0 ? [...points].reverse() : points;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = pts[i]!;
      const [x1, z1] = pts[(i + 1) % n]!;
      this.quadN(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0, sideColor);
    }
    const contour = pts.map(([x, z]) => new THREE.Vector2(x, -z));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of tris) {
      const a = pts[i]!;
      let b = pts[j]!;
      let c = pts[k]!;
      // Normal hacia +y: (b-a)×(c-a).y > 0
      if ((b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) < 0) [b, c] = [c, b];
      this.tri(a[0], y1, a[1], b[0], y1, b[1], c[0], y1, c[1], topColor);
      if (bottom) this.tri(a[0], y0, a[1], c[0], y0, c[1], b[0], y0, b[1], topColor);
    }
  }

  /**
   * Añade una geometría (indexada o no) transformada por la matriz actual (y opcionalmente
   * `matrix`). Si `color` es null se usan los colores de la geometría (atributo color) o blanco.
   */
  appendGeometry(geo: THREE.BufferGeometry, matrix: THREE.Matrix4 | null = null, color: ColorLike | null = null, tint = 1): void {
    const posAttr = geo.getAttribute('position');
    if (!posAttr) return;
    const colAttr = geo.getAttribute('color');
    const index = geo.getIndex();
    const count = index ? index.count : posAttr.count;
    const m = matrix ? new THREE.Matrix4().multiplyMatrices(this.mat, matrix) : this.mat;
    const flip = m.determinant() < 0;
    const fixed = color !== null ? col(color) : null;
    const tmpCol = new THREE.Color();
    const t = this.tint * tint;
    for (let i = 0; i + 2 < count; i += 3) {
      const ia = index ? index.getX(i) : i;
      const ib = index ? index.getX(i + 1) : i + 1;
      const ic = index ? index.getX(i + 2) : i + 2;
      _a.fromBufferAttribute(posAttr, ia).applyMatrix4(m);
      _b.fromBufferAttribute(posAttr, flip ? ic : ib).applyMatrix4(m);
      _c.fromBufferAttribute(posAttr, flip ? ib : ic).applyMatrix4(m);
      _ab.subVectors(_b, _a);
      _ac.subVectors(_c, _a);
      _n.crossVectors(_ab, _ac);
      const len = _n.length();
      if (len < 1e-12) continue;
      _n.multiplyScalar(1 / len);
      this.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
      this.nrm.push(_n.x, _n.y, _n.z, _n.x, _n.y, _n.z, _n.x, _n.y, _n.z);
      for (const vi of [ia, flip ? ic : ib, flip ? ib : ic]) {
        if (fixed) tmpCol.copy(fixed);
        else if (colAttr) tmpCol.setRGB(colAttr.getX(vi), colAttr.getY(vi), colAttr.getZ(vi));
        else tmpCol.setRGB(1, 1, 1);
        this.clr.push(tmpCol.r * t, tmpCol.g * t, tmpCol.b * t);
      }
    }
  }

  /** Geometría resultante (no indexada: position, normal, color). */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.clr, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  /** Vacía el constructor para reutilizarlo. */
  clear(): void {
    this.pos = [];
    this.nrm = [];
    this.clr = [];
    this.mat.identity();
    this.stack = [];
    this.flip = false;
    this.tint = 1;
  }
}

const icoGeos = new Map<number, THREE.BufferGeometry>();
function icoCache(detail: number): THREE.BufferGeometry {
  let g = icoGeos.get(detail);
  if (!g) {
    g = new THREE.IcosahedronGeometry(1, detail);
    icoGeos.set(detail, g);
  }
  return g;
}

/** Copia una geometría multiplicando sus colores de vértice por `f` (módulos dañados). */
export function tintGeometry(geo: THREE.BufferGeometry, f: number): THREE.BufferGeometry {
  const out = geo.clone();
  if (f === 1) return out;
  const c = out.getAttribute('color') as THREE.BufferAttribute | undefined;
  if (c) {
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * f, c.getY(i) * f, c.getZ(i) * f);
    c.needsUpdate = true;
  }
  return out;
}

/**
 * Kit de modelado low-poly para el mundo (avistamientos, decorado lejano, aves): acumula
 * primitivas transformadas con un color por cara (con una ligera variación aleatoria para dar
 * riqueza al sombreado plano) y las funde en una sola geometría no indexada con colores por
 * vértice. Un modelo = una geometría = una llamada de dibujo.
 */
import * as THREE from 'three';

export type V3 = readonly [number, number, number];

export interface Place {
  /** Posición. */
  p?: V3;
  /** Rotación Euler XYZ (rad). */
  r?: V3;
  /** Escala (uniforme o por eje). */
  s?: V3 | number;
}

/** Generador pseudoaleatorio pequeño y determinista (Park–Miller). */
export function makeRng(seed: number): () => number {
  let s = Math.floor(Math.abs(seed)) % 2147483646;
  if (s <= 0) s += 2147483645;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function placeMatrix(t: Place | undefined, out = new THREE.Matrix4()): THREE.Matrix4 {
  if (!t) return out.identity();
  const p = t.p ?? [0, 0, 0];
  const r = t.r ?? [0, 0, 0];
  const s = t.s ?? 1;
  _p.set(p[0], p[1], p[2]);
  _q.setFromEuler(_e.set(r[0], r[1], r[2]));
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  return out.compose(_p, _q, _s);
}

export class Kit {
  private pos: number[] = [];
  private col: number[] = [];
  private readonly rnd: () => number;
  /** Transformación de grupo aplicada a todo lo que se añade (pila sencilla). */
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];

  constructor(
    seed = 1,
    /** Variación de brillo por cara (0..1). */
    readonly jitter = 0.07,
  ) {
    this.rnd = makeRng(seed);
  }

  random(): number {
    return this.rnd();
  }

  /** Añade una transformación de grupo (hasta `pop`). */
  push(t: Place): this {
    const top = this.stack[this.stack.length - 1]!;
    this.stack.push(top.clone().multiply(placeMatrix(t)));
    return this;
  }

  pop(): this {
    if (this.stack.length > 1) this.stack.pop();
    return this;
  }

  /** Añade una geometría de three.js (se transforma una copia; la original no se toca). */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, t?: Place, jitter = this.jitter): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const src = g.getAttribute('position') as THREE.BufferAttribute;
    const m = _m.copy(this.stack[this.stack.length - 1]!).multiply(placeMatrix(t));
    _c.set(color);
    const v = new THREE.Vector3();
    for (let i = 0; i < src.count; i++) {
      v.fromBufferAttribute(src, i).applyMatrix4(m);
      this.pos.push(v.x, v.y, v.z);
    }
    for (let f = 0; f < src.count; f += 3) {
      const k = 1 + (this.rnd() * 2 - 1) * jitter;
      for (let j = 0; j < 3; j++) this.col.push(_c.r * k, _c.g * k, _c.b * k);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, t?: Place): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, t);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, color: THREE.ColorRepresentation, t?: Place, open = false): this {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color, t);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, t?: Place): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, t);
  }

  /** Icosaedro con los vértices desplazados al azar (rocas, copas, colinas). */
  rock(r: number, detail: number, color: THREE.ColorRepresentation, t?: Place, rough = 0.18): this {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const a = g.getAttribute('position') as THREE.BufferAttribute;
    // Desplazamiento coherente: mismos vértices compartidos → misma perturbación.
    const seen = new Map<string, number>();
    for (let i = 0; i < a.count; i++) {
      const key = `${a.getX(i).toFixed(3)},${a.getY(i).toFixed(3)},${a.getZ(i).toFixed(3)}`;
      let k = seen.get(key);
      if (k === undefined) {
        k = 1 + (this.rnd() * 2 - 1) * rough;
        seen.set(key, k);
      }
      a.setXYZ(i, a.getX(i) * k, a.getY(i) * k, a.getZ(i) * k);
    }
    return this.add(g, color, t);
  }

  /** Cuadrilátero/triángulos sueltos (velas, banderas, hojas). Puntos en orden. */
  poly(points: V3[], color: THREE.ColorRepresentation, t?: Place, doubleSided = true): this {
    const pos: number[] = [];
    for (let i = 1; i + 1 < points.length; i++) {
      const a = points[0]!;
      const b = points[i]!;
      const c = points[i + 1]!;
      pos.push(...a, ...b, ...c);
      if (doubleSided) pos.push(...a, ...c, ...b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return this.add(g, color, t);
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Funde todo en una geometría con normales planas y colores por vértice. */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.pos = [];
    this.col = [];
    return g;
  }
}

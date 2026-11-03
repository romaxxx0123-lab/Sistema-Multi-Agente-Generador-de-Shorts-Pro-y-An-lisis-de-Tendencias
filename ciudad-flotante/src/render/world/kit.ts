/**
 * Kit de modelado low-poly para el mundo (avistamientos, decorado lejano, aves): acumula
 * primitivas transformadas con un color por cara (con una ligera variación aleatoria para dar
 * riqueza al sombreado plano) y las funde en una sola geometría no indexada con colores por
 * vértice. Un modelo = una geometría = una llamada de dibujo.
 *
 * Canal luminoso opcional (`emit`): lo que se añade mientras hay un color de emisión fijado
 * guarda ese color en el atributo `aEmit` (ventanas, farolillos, linternas). El material del
 * puerto (`litMaterial`, glow.ts) lo enciende de noche; los modelos que no lo usan no lo llevan.
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
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Colores ya interpretados y posiciones (no indexadas) de las primitivas ya construidas: los
 * modelos repiten mucho los mismos colores y piezas (postes, bolardos, farolas…) y crear una
 * geometría de three.js por pieza era lo que más costaba (la torre del puerto, ~70–170 ms).
 */
const colorCache = new Map<THREE.ColorRepresentation, THREE.Color>();
const primCache = new Map<string, Float32Array>();
const PRIM_CACHE_MAX = 4000;

function colorOf(c: THREE.ColorRepresentation): THREE.Color {
  if (c instanceof THREE.Color) return c;
  let v = colorCache.get(c);
  if (!v) {
    v = new THREE.Color(c);
    if (colorCache.size > PRIM_CACHE_MAX) colorCache.clear();
    colorCache.set(c, v);
  }
  return v;
}

/** Posiciones no indexadas de una primitiva (se construye la primera vez que se pide). */
function primitive(key: string, make: () => THREE.BufferGeometry): Float32Array {
  let a = primCache.get(key);
  if (!a) {
    const g = make();
    const n = g.index ? g.toNonIndexed() : g;
    a = Float32Array.from(n.getAttribute('position').array as ArrayLike<number>);
    if (n !== g) n.dispose();
    g.dispose();
    if (primCache.size > PRIM_CACHE_MAX) primCache.clear();
    primCache.set(key, a);
  }
  return a;
}

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
  /** Color de emisión por vértice (solo si alguna pieza luce). */
  private emi: number[] = [];
  private emitCol: THREE.Color | null = null;
  private emitUsed = false;
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

  /** Un punto en coordenadas del modelo (aplica la transformación de grupo actual). */
  toModel(p: V3): V3 {
    const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(this.stack[this.stack.length - 1]!);
    return [v.x, v.y, v.z];
  }

  /**
   * Color con el que lucirá de noche todo lo que se añada a continuación (`null` = no luce).
   * El color de día sigue siendo el de cada pieza (cristal oscuro, papel del farolillo…).
   */
  emit(color: THREE.ColorRepresentation | null): this {
    this.emitCol = color === null ? null : new THREE.Color(color);
    return this;
  }

  /** Añade una geometría de three.js (se transforma una copia y la original se libera). */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, t?: Place, jitter = this.jitter): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const src = g.getAttribute('position') as THREE.BufferAttribute;
    this.addPositions(src.array as ArrayLike<number>, src.count, color, _m.copy(this.stack[this.stack.length - 1]!).multiply(placeMatrix(t)), jitter);
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  /**
   * Añade `count` vértices (posiciones x, y, z seguidas, en triángulos) transformados por `m`, con
   * el color de la pieza variado por cara y el de emisión actual.
   */
  private addPositions(src: ArrayLike<number>, count: number, color: THREE.ColorRepresentation, m: THREE.Matrix4, jitter: number): void {
    const e = m.elements;
    const pos = this.pos;
    // Como Vector3.applyMatrix4 con una transformación afín (w = 1).
    for (let i = 0; i < count; i++) {
      const x = src[i * 3]!;
      const y = src[i * 3 + 1]!;
      const z = src[i * 3 + 2]!;
      pos.push(e[0]! * x + e[4]! * y + e[8]! * z + e[12]!, e[1]! * x + e[5]! * y + e[9]! * z + e[13]!, e[2]! * x + e[6]! * y + e[10]! * z + e[14]!);
    }
    const c = colorOf(color);
    const col = this.col;
    for (let f = 0; f < count; f += 3) {
      const k = 1 + (this.rnd() * 2 - 1) * jitter;
      const r = c.r * k;
      const g = c.g * k;
      const b = c.b * k;
      col.push(r, g, b, r, g, b, r, g, b);
    }
    const em = this.emitCol;
    if (em) this.emitUsed = true;
    // El canal de emisión se rellena siempre (con ceros) para que vaya alineado con las posiciones.
    const er = em ? em.r : 0;
    const eg = em ? em.g : 0;
    const eb = em ? em.b : 0;
    const emi = this.emi;
    for (let i = 0; i < count; i++) emi.push(er, eg, eb);
  }

  /** Primitiva guardada (por su clave) añadida con la transformación de grupo, `t` y `scale`. */
  private addPrimitive(key: string, make: () => THREE.BufferGeometry, color: THREE.ColorRepresentation, t: Place | undefined, scale: V3 | null = null): this {
    const a = primitive(key, make);
    const m = _m.copy(this.stack[this.stack.length - 1]!).multiply(placeMatrix(t));
    if (scale) m.multiply(_m2.makeScale(scale[0], scale[1], scale[2]));
    this.addPositions(a, a.length / 3, color, m, this.jitter);
    return this;
  }

  box(w: number, h: number, d: number, color: THREE.ColorRepresentation, t?: Place): this {
    // Caja unidad escalada (mismos vértices y en el mismo orden que BoxGeometry(w, h, d)).
    return this.addPrimitive('caja', () => new THREE.BoxGeometry(1, 1, 1), color, t, [w, h, d]);
  }

  cyl(rTop: number, rBot: number, h: number, seg: number, color: THREE.ColorRepresentation, t?: Place, open = false): this {
    return this.addPrimitive(`cil:${rTop}:${rBot}:${h}:${seg}:${open ? 1 : 0}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), color, t);
  }

  cone(r: number, h: number, seg: number, color: THREE.ColorRepresentation, t?: Place): this {
    return this.addPrimitive(`cono:${r}:${h}:${seg}`, () => new THREE.ConeGeometry(r, h, seg), color, t);
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
    // Redondeados a float32, como si pasaran por una geometría (mismo resultado que antes).
    const f = Float32Array.from(pos);
    this.addPositions(f, f.length / 3, color, _m.copy(this.stack[this.stack.length - 1]!).multiply(placeMatrix(t)), this.jitter);
    return this;
  }

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /**
   * Funde todo en una geometría con normales planas y colores por vértice (y `aEmit` si alguna
   * pieza luce, o siempre con `withEmit`).
   */
  build(withEmit = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.emitUsed || withEmit) g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.emi, 3));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    this.pos = [];
    this.col = [];
    this.emi = [];
    this.emitUsed = false;
    this.emitCol = null;
    return g;
  }
}

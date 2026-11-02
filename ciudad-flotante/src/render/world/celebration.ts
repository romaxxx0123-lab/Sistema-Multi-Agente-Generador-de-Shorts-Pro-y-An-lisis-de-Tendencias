/**
 * CELEBRACIÓN DE LA LLEGADA A PUERTO ESPERANZA: fuegos artificiales low-poly y farolillos de papel
 * que suben al cielo desde los pantalanes del puerto.
 *
 * - `start('llegada')`: al llegar (story.arrived pasa a true) hay unos 80 s de fuegos (más
 *   seguidos al principio) y una suelta de farolillos.
 * - `fiestaLevel(state)`: la primera noche tras la llegada (21:00–23:00 del día de la llegada) el
 *   puerto repite la fiesta mientras el barco siga en Puerto Esperanza.
 *
 * Chispas y farolillos son mallas instanciadas (octaedros y linternas de seis caras) con color por
 * instancia, más halos aditivos de noche (`GlowPoints`). Viven en el marco del océano: el aire, como
 * el agua, pasa hacia popa a la velocidad del barco.
 */
import * as THREE from 'three';
import { MINUTES_PER_DAY } from '../../sim/constants';
import { FINAL_REGION } from '../../data/story';
import { hourOf } from '../../sim/time';
import type { GameState } from '../../sim/types';
import type { Atmosphere } from './atmosphere';
import { GlowPoints, srgb, type GlowShared } from './glow';
import { Kit, makeRng } from './kit';

export const MAX_SPARKS = 900;
export const MAX_LANTERNS = 120;
/** Duración de los fuegos de la llegada (s reales). */
export const ARRIVAL_SHOW_S = 80;
/** Horas de la fiesta de la primera noche en el puerto. */
export const FIESTA_HOURS: readonly [number, number] = [21, 23];

const GRAVITY = 9.8;
const SPARK_SIZE = 2.2;

/** Colores de los fuegos (sRGB, saturados para verse también de día). */
const FIRE_COLORS = ['#ff3b3b', '#ffd23f', '#3dff8a', '#4dc9ff', '#ff6bd6', '#ffffff', '#ff9a3c', '#b388ff'];
const PAPER = ['#ff8a3d', '#ffb347', '#ff6f59', '#ffd166', '#ff9f80'];

type SparkKind = 0 | 1 | 2 | 3;
const ROCKET: SparkKind = 0;
const STAR: SparkKind = 1;
const TRAIL: SparkKind = 2;
const WILLOW: SparkKind = 3;

/**
 * Intensidad de la fiesta nocturna del puerto (0..1): la noche del día de la llegada, mientras se
 * siga en Puerto Esperanza. La hora de llegada es la del evento 'llegada' (su enfriamiento es 0).
 */
export function fiestaLevel(st: GameState): number {
  if (!st.story?.arrived || st.voyage.regionId !== FINAL_REGION) return 0;
  const at = st.events.cooldowns['llegada'];
  if (at === undefined || !Number.isFinite(at)) return 0;
  const day = Math.floor(at / MINUTES_PER_DAY);
  if (Math.floor(st.time / MINUTES_PER_DAY) !== day) return 0;
  const h = hourOf(st.time);
  const [a, b] = FIESTA_HOURS;
  return THREE.MathUtils.smoothstep(h, a, a + 0.25) * (1 - THREE.MathUtils.smoothstep(h, b - 0.25, b));
}

/**
 * ¿Empieza ahora la celebración de la llegada? Solo cuando `story.arrived` pasa de false a true
 * en la misma partida y en Puerto Esperanza (cargar una partida ya llegada no la repite).
 */
export function arrivalJustHappened(prevArrived: boolean, st: GameState, newSim: boolean): boolean {
  return !newSim && !prevArrived && !!st.story?.arrived && st.voyage.regionId === FINAL_REGION;
}

function sparkGeometry(): THREE.BufferGeometry {
  const g = new THREE.OctahedronGeometry(0.5, 0);
  return g;
}

/** Farolillo volador: linterna de papel de seis caras, más ancha arriba, con la llama abajo. */
function lanternGeometry(): THREE.BufferGeometry {
  const k = new Kit(3, 0.05);
  k.cyl(0.46, 0.34, 0.95, 6, '#ffffff', { p: [0, 0.48, 0] });
  k.cyl(0.47, 0.47, 0.06, 6, '#f2e6cf', { p: [0, 0.96, 0] });
  k.add(new THREE.OctahedronGeometry(0.1, 0), '#fff2b0', { p: [0, 0.08, 0], s: [1, 1.6, 1] });
  return k.build();
}

export class Celebration {
  readonly group = new THREE.Group();
  /** Destello de las explosiones (color lineal, decae) para teñir la luz ambiente de noche. */
  readonly flash = new THREE.Color(0, 0, 0);
  /** Avisa de cada explosión (posición en el marco del océano) para el audio, si alguien lo engancha. */
  onBurst: ((x: number, y: number, z: number) => void) | null = null;

  private readonly sparks: THREE.InstancedMesh;
  private readonly sparkMat: THREE.MeshBasicMaterial;
  private readonly sparkHalos: GlowPoints;
  private readonly lanterns: THREE.InstancedMesh;
  private readonly lanternMat: THREE.MeshBasicMaterial;
  private readonly lanternHalos: GlowPoints;
  // Chispas (estructura de arrays)
  private n = 0;
  private readonly sp = new Float32Array(MAX_SPARKS * 3);
  private readonly sv = new Float32Array(MAX_SPARKS * 3);
  private readonly sAge = new Float32Array(MAX_SPARKS);
  private readonly sLife = new Float32Array(MAX_SPARKS);
  private readonly sCol = new Float32Array(MAX_SPARKS * 3);
  private readonly sKind = new Uint8Array(MAX_SPARKS);
  private readonly sDrag = new Float32Array(MAX_SPARKS);
  private readonly sSize = new Float32Array(MAX_SPARKS);
  private readonly sTrail = new Float32Array(MAX_SPARKS);
  // Farolillos
  private ln = 0;
  private readonly lp = new Float32Array(MAX_LANTERNS * 3);
  private readonly lAge = new Float32Array(MAX_LANTERNS);
  private readonly lLife = new Float32Array(MAX_LANTERNS);
  private readonly lRise = new Float32Array(MAX_LANTERNS);
  private readonly lSeed = new Float32Array(MAX_LANTERNS);
  // Programa
  private show = 0;
  private showT = 0;
  private burstAcc = 0;
  private lanternAcc = 0;
  private lanternBudget = 0;
  private readonly rnd = makeRng(2024);
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private fiesta = 0;

  constructor(shared: GlowShared) {
    this.group.name = 'celebracion';
    this.sparkMat = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false });
    this.sparks = new THREE.InstancedMesh(sparkGeometry(), this.sparkMat, MAX_SPARKS);
    this.sparks.name = 'fuegos-artificiales';
    this.sparks.frustumCulled = false;
    this.sparks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.sparks.setColorAt(0, new THREE.Color(1, 1, 1));
    this.sparks.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.sparks.count = 0;
    this.sparkHalos = new GlowPoints(shared, [], { capacity: MAX_SPARKS, minPx: 2.5, maxPx: 40, fogFloor: 0.5 });
    this.sparkHalos.points.name = 'halos-fuegos';
    this.lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.lanterns = new THREE.InstancedMesh(lanternGeometry(), this.lanternMat, MAX_LANTERNS);
    this.lanterns.name = 'farolillos-volando';
    this.lanterns.frustumCulled = false;
    this.lanterns.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lanterns.setColorAt(0, new THREE.Color(1, 1, 1));
    this.lanterns.count = 0;
    this.lanternHalos = new GlowPoints(shared, [], { capacity: MAX_LANTERNS, minPx: 2, maxPx: 50, fogFloor: 0.4 });
    this.lanternHalos.points.name = 'halos-farolillos';
    // La llama de cada farolillo tiembla a su aire.
    const fl = this.lanternHalos.geometry.getAttribute('aFlicker') as THREE.BufferAttribute;
    const sd = this.lanternHalos.geometry.getAttribute('aSeed') as THREE.BufferAttribute;
    for (let i = 0; i < MAX_LANTERNS; i++) {
      fl.setX(i, 0.5);
      sd.setX(i, ((i * 0.618034) % 1 + 1) % 1);
    }
    this.group.add(this.sparks, this.sparkHalos.points, this.lanterns, this.lanternHalos.points);
  }

  /** Chispas vivas (pruebas y depuración). */
  get sparkCount(): number {
    return this.n;
  }

  get lanternCount(): number {
    return this.ln;
  }

  /** ¿Hay fuegos o farolillos en marcha? */
  get active(): boolean {
    return this.show > 0 || this.fiesta > 0 || this.n > 0 || this.ln > 0;
  }

  /** Empieza la celebración de la llegada. */
  start(): void {
    this.show = ARRIVAL_SHOW_S;
    this.showT = 0;
    this.burstAcc = 0.8;
    this.lanternBudget = 90;
  }

  /** Quita todo al instante (cambio de partida). */
  clear(): void {
    this.n = 0;
    this.ln = 0;
    this.show = 0;
    this.fiesta = 0;
    this.lanternBudget = 0;
    this.flash.setRGB(0, 0, 0);
    this.sparks.count = 0;
    this.lanterns.count = 0;
    this.sparkHalos.commit(0);
    this.lanternHalos.commit(0);
    this.sparkHalos.intensity = 0;
    this.lanternHalos.intensity = 0;
  }

  /* ---------------- Emisión ---------------- */

  private addSpark(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, kind: SparkKind, col: THREE.Color, drag: number, size: number, trail = 0): void {
    if (this.n >= MAX_SPARKS) return;
    const i = this.n++;
    this.sp[i * 3] = x;
    this.sp[i * 3 + 1] = y;
    this.sp[i * 3 + 2] = z;
    this.sv[i * 3] = vx;
    this.sv[i * 3 + 1] = vy;
    this.sv[i * 3 + 2] = vz;
    this.sAge[i] = 0;
    this.sLife[i] = life;
    this.sKind[i] = kind;
    this.sCol[i * 3] = col.r;
    this.sCol[i * 3 + 1] = col.g;
    this.sCol[i * 3 + 2] = col.b;
    this.sDrag[i] = drag;
    this.sSize[i] = size;
    this.sTrail[i] = trail;
  }

  private removeSpark(i: number): void {
    const j = --this.n;
    if (i === j) return;
    for (let k = 0; k < 3; k++) {
      this.sp[i * 3 + k] = this.sp[j * 3 + k]!;
      this.sv[i * 3 + k] = this.sv[j * 3 + k]!;
      this.sCol[i * 3 + k] = this.sCol[j * 3 + k]!;
    }
    this.sAge[i] = this.sAge[j]!;
    this.sLife[i] = this.sLife[j]!;
    this.sKind[i] = this.sKind[j]!;
    this.sDrag[i] = this.sDrag[j]!;
    this.sSize[i] = this.sSize[j]!;
    this.sTrail[i] = this.sTrail[j]!;
  }

  /** Lanza un cohete desde (x, y, z) que estallará a unos 70–130 m. */
  launch(x: number, y: number, z: number): void {
    const r = this.rnd;
    const vy = 34 + r() * 12;
    const col = srgbToLinear(FIRE_COLORS[Math.floor(r() * FIRE_COLORS.length)]!, this.c);
    // El color del estallido viaja en el cohete (que se ve dorado).
    const rocket = this.n;
    this.addSpark(x, y, z, (r() - 0.5) * 4, vy, (r() - 0.5) * 4, 2.2 + r() * 0.8, ROCKET, col, 0.15, 0.8, 0);
    if (rocket < this.n) this.sTrail[rocket] = Math.floor(r() * 3);
  }

  private burst(i: number): void {
    const r = this.rnd;
    const x = this.sp[i * 3]!;
    const y = this.sp[i * 3 + 1]!;
    const z = this.sp[i * 3 + 2]!;
    const type = this.sTrail[i]!;
    const main = this.c.setRGB(this.sCol[i * 3]!, this.sCol[i * 3 + 1]!, this.sCol[i * 3 + 2]!).clone();
    const second = srgbToLinear(FIRE_COLORS[Math.floor(r() * FIRE_COLORS.length)]!, new THREE.Color());
    if (type === 2) {
      // Sauce: chispas doradas que caen despacio dejando estela
      const gold = srgbToLinear('#ffcf6b', new THREE.Color());
      for (let k = 0; k < 64; k++) {
        this.v.randomDirection().multiplyScalar(10 + r() * 3);
        this.addSpark(x, y, z, this.v.x, this.v.y + 2, this.v.z, 3 + r() * 0.8, WILLOW, gold, 0.55, SPARK_SIZE * 0.85);
      }
    } else if (type === 1) {
      // Anillo inclinado
      const ax = r() * Math.PI;
      const az = r() * Math.PI;
      this.e.set(ax, 0, az);
      this.q.setFromEuler(this.e);
      for (let k = 0; k < 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        this.v.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(this.q).multiplyScalar(19 + r() * 1.5);
        this.addSpark(x, y, z, this.v.x, this.v.y, this.v.z, 1.8 + r() * 0.4, STAR, k % 2 ? main : second, 1.3, SPARK_SIZE);
      }
      for (let k = 0; k < 18; k++) {
        this.v.randomDirection().multiplyScalar(6 + r() * 3);
        this.addSpark(x, y, z, this.v.x, this.v.y, this.v.z, 1.4 + r() * 0.4, STAR, second, 1.4, SPARK_SIZE * 0.8);
      }
    } else {
      // Peonía: esfera de estrellas de un color con algún toque del segundo
      for (let k = 0; k < 72; k++) {
        this.v.randomDirection().multiplyScalar(15 + r() * 5);
        this.addSpark(x, y, z, this.v.x, this.v.y, this.v.z, 1.9 + r() * 0.6, STAR, r() < 0.8 ? main : second, 1.35, SPARK_SIZE);
      }
    }
    // Destello: el color del estallido ilumina un instante el puerto
    this.flash.r += main.r * 0.35;
    this.flash.g += main.g * 0.35;
    this.flash.b += main.b * 0.35;
    this.onBurst?.(x, y, z);
  }

  private releaseLantern(x: number, y: number, z: number): void {
    if (this.ln >= MAX_LANTERNS) return;
    const i = this.ln++;
    const r = this.rnd;
    this.lp[i * 3] = x + (r() - 0.5) * 24;
    this.lp[i * 3 + 1] = y;
    this.lp[i * 3 + 2] = z + (r() - 0.5) * 24;
    this.lAge[i] = 0;
    this.lLife[i] = 110 + r() * 60;
    this.lRise[i] = 1.0 + r() * 0.8;
    this.lSeed[i] = r() * 100;
    const c = srgbToLinear(PAPER[Math.floor(r() * PAPER.length)]!, this.c);
    this.lanterns.setColorAt(i, c);
    const h = srgb(PAPER[Math.floor(r() * PAPER.length)]!, new THREE.Color());
    this.lanternHalos.setColor(i, Math.min(1, h.r * 1.1), h.g * 0.85, h.b * 0.6);
  }

  private removeLantern(i: number): void {
    const j = --this.ln;
    if (i === j) return;
    for (let k = 0; k < 3; k++) this.lp[i * 3 + k] = this.lp[j * 3 + k]!;
    this.lAge[i] = this.lAge[j]!;
    this.lLife[i] = this.lLife[j]!;
    this.lRise[i] = this.lRise[j]!;
    this.lSeed[i] = this.lSeed[j]!;
    this.lanterns.getColorAt(j, this.c);
    this.lanterns.setColorAt(i, this.c);
    const col = this.lanternHalos.geometry.getAttribute('aColor') as THREE.BufferAttribute;
    col.setXYZ(i, col.getX(j), col.getY(j), col.getZ(j));
  }

  /* ---------------- Actualización ---------------- */

  /**
   * @param ds metros que el agua (y el aire) pasan hacia popa en este frame
   * @param spotsFn puntos de lanzamiento (pantalanes del puerto, marco del océano); solo se pide
   *   si hay que lanzar algo
   * @param fiesta intensidad de la fiesta nocturna (`fiestaLevel`)
   */
  update(dt: number, ds: number, atm: Atmosphere, spotsFn: () => readonly THREE.Vector3[], wind: { x: number; z: number }, fiesta: number): void {
    const r = this.rnd;
    this.fiesta = fiesta;
    let spots: readonly THREE.Vector3[] | null = null;
    // --- Programa: ritmo de cohetes y farolillos ---
    let rate = 0;
    let lanternRate = 0;
    if (this.show > 0) {
      this.showT += dt;
      this.show -= dt;
      // Una andanada al principio, luego un ritmo que se va calmando, y una traca final.
      const t = this.showT;
      rate = t < 8 ? 2.2 : 1.1 * (1 - t / ARRIVAL_SHOW_S) + 0.35;
      if (this.show < 6) rate = 3;
      lanternRate = t < 50 ? 1.6 : 0;
    }
    if (fiesta > 0) {
      rate = Math.max(rate, 0.9 * fiesta);
      lanternRate = Math.max(lanternRate, 0.5 * fiesta);
      if (this.lanternBudget < 1) this.lanternBudget = 1;
    }
    const pickSpot = (out: THREE.Vector3): THREE.Vector3 => {
      spots ??= spotsFn();
      if (spots.length) {
        const s = spots[Math.floor(r() * spots.length)]!;
        return out.set(s.x + (r() - 0.5) * 16, s.y, s.z + (r() - 0.5) * 16);
      }
      // Sin puerto a la vista: alrededor del barco, sobre todo por delante.
      const a = (r() - 0.5) * Math.PI * 1.4;
      const d = 180 + r() * 240;
      return out.set(Math.cos(a) * d, 2, Math.sin(a) * d);
    };
    this.burstAcc += rate * dt;
    while (this.burstAcc >= 1) {
      this.burstAcc -= 1 + (r() - 0.5) * 0.6;
      const p = pickSpot(this.s);
      this.launch(p.x, p.y, p.z);
    }
    if (lanternRate > 0 && (this.lanternBudget > 0 || fiesta > 0)) {
      this.lanternAcc += lanternRate * dt;
      while (this.lanternAcc >= 1) {
        this.lanternAcc -= 1;
        if (this.lanternBudget > 0) this.lanternBudget--;
        const p = pickSpot(this.s);
        this.releaseLantern(p.x, p.y + 1, p.z);
      }
    }

    // --- Chispas ---
    for (let i = this.n - 1; i >= 0; i--) {
      this.sAge[i]! += dt;
      const kind = this.sKind[i]!;
      const drag = Math.exp(-this.sDrag[i]! * dt);
      const g = kind === WILLOW ? GRAVITY * 0.55 : kind === STAR ? GRAVITY * 0.35 : kind === TRAIL ? GRAVITY * 0.2 : GRAVITY;
      this.sv[i * 3]! *= drag;
      this.sv[i * 3 + 1] = this.sv[i * 3 + 1]! * drag - g * dt;
      this.sv[i * 3 + 2]! *= drag;
      this.sp[i * 3] = this.sp[i * 3]! + this.sv[i * 3]! * dt - ds;
      this.sp[i * 3 + 1]! += this.sv[i * 3 + 1]! * dt;
      this.sp[i * 3 + 2] = this.sp[i * 3 + 2]! + this.sv[i * 3 + 2]! * dt;
      if (kind === ROCKET) {
        // Estela dorada; estalla al frenarse o al agotarse la mecha.
        if (r() < dt * 40) this.addSpark(this.sp[i * 3]!, this.sp[i * 3 + 1]!, this.sp[i * 3 + 2]!, (r() - 0.5) * 2, -2, (r() - 0.5) * 2, 0.45 + r() * 0.3, TRAIL, srgbToLinear('#ffd38a', this.c), 2, 0.9);
        if (this.sv[i * 3 + 1]! < 7 || this.sAge[i]! > this.sLife[i]!) {
          this.burst(i);
          this.removeSpark(i);
        }
        continue;
      }
      if (kind === WILLOW && r() < dt * 6) this.addSpark(this.sp[i * 3]!, this.sp[i * 3 + 1]!, this.sp[i * 3 + 2]!, 0, -1, 0, 0.6, TRAIL, srgbToLinear('#ffb54a', this.c), 2, 0.9);
      if (this.sAge[i]! >= this.sLife[i]!) this.removeSpark(i);
    }
    const night = THREE.MathUtils.clamp((1 - atm.day) * 1.3, 0, 1);
    let k = 0;
    for (let i = 0; i < this.n; i++) {
      const t = this.sAge[i]! / this.sLife[i]!;
      const kind = this.sKind[i]!;
      // Se encogen al apagarse (las estrellas chisporrotean al final).
      let sc = this.sSize[i]! * (kind === ROCKET ? 1 : 1 - t * t);
      if (kind === STAR && t > 0.7 && r() < 0.3) sc *= 0.3;
      const x = this.sp[i * 3]!;
      const y = this.sp[i * 3 + 1]!;
      const z = this.sp[i * 3 + 2]!;
      this.v.set(x, y, z);
      const vx = this.sv[i * 3]!;
      const vy = this.sv[i * 3 + 1]!;
      const vz = this.sv[i * 3 + 2]!;
      const sp = Math.hypot(vx, vy, vz);
      // Alargadas en la dirección del movimiento (trazos de luz).
      if (sp > 0.5) this.q.setFromUnitVectors(UP, this.s.set(vx / sp, vy / sp, vz / sp));
      else this.q.identity();
      const stretch = 1 + Math.min(2.5, sp * 0.08);
      this.s.set(sc, sc * stretch, sc);
      this.m.compose(this.v, this.q, this.s);
      this.sparks.setMatrixAt(k, this.m);
      const isRocket = kind === ROCKET || kind === TRAIL;
      if (isRocket) this.c.setRGB(1, 0.78, 0.45);
      else this.c.setRGB(this.sCol[i * 3]!, this.sCol[i * 3 + 1]!, this.sCol[i * 3 + 2]!);
      // De día, un poco más oscuras para destacar sobre el cielo claro.
      const gain = 0.75 + 0.6 * night;
      this.sparks.setColorAt(k, this.c.multiplyScalar(gain));
      this.sparkHalos.setPoint(k, x, y, z, Math.max(0.1, sc * 3.4));
      this.c.convertLinearToSRGB();
      this.sparkHalos.setColor(k, this.c.r, this.c.g, this.c.b);
      k++;
    }
    this.sparks.count = k;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
    this.sparkHalos.commit(k);
    this.sparkHalos.intensity = k > 0 ? 0.25 + 0.75 * night : 0;
    this.flash.multiplyScalar(Math.exp(-dt * 5));

    // --- Farolillos ---
    for (let i = this.ln - 1; i >= 0; i--) {
      this.lAge[i]! += dt;
      const seed = this.lSeed[i]!;
      const a = this.lAge[i]!;
      const rise = this.lRise[i]! * THREE.MathUtils.smoothstep(a, 0, 4);
      this.lp[i * 3] = this.lp[i * 3]! + (wind.x * 0.35 + Math.sin(a * 0.5 + seed) * 0.4) * dt - ds;
      this.lp[i * 3 + 1]! += rise * dt;
      this.lp[i * 3 + 2] = this.lp[i * 3 + 2]! + (wind.z * 0.35 + Math.cos(a * 0.4 + seed) * 0.4) * dt;
      if (a > this.lLife[i]! || this.lp[i * 3 + 1]! > 260) this.removeLantern(i);
    }
    for (let i = 0; i < this.ln; i++) {
      const a = this.lAge[i]!;
      const life = this.lLife[i]!;
      const sc = 1.7 * THREE.MathUtils.smoothstep(a, 0, 1.5) * (1 - THREE.MathUtils.smoothstep(a, life - 12, life));
      this.v.set(this.lp[i * 3]!, this.lp[i * 3 + 1]!, this.lp[i * 3 + 2]!);
      this.e.set(Math.sin(a * 0.9 + this.lSeed[i]!) * 0.12, a * 0.2, Math.cos(a * 0.7 + this.lSeed[i]!) * 0.12);
      this.q.setFromEuler(this.e);
      this.s.setScalar(Math.max(0.0001, sc));
      this.m.compose(this.v, this.q, this.s);
      this.lanterns.setMatrixAt(i, this.m);
      this.lanternHalos.setPoint(i, this.v.x, this.v.y + 0.7 * sc, this.v.z, 3.6 * sc);
    }
    this.lanterns.count = this.ln;
    this.lanterns.instanceMatrix.needsUpdate = true;
    if (this.lanterns.instanceColor) this.lanterns.instanceColor.needsUpdate = true;
    this.lanternHalos.commit(this.ln);
    this.lanternHalos.intensity = this.ln > 0 ? 0.15 + 0.85 * night : 0;
    this.group.visible = this.n > 0 || this.ln > 0;
  }

  dispose(): void {
    this.sparks.geometry.dispose();
    this.sparkMat.dispose();
    this.sparks.dispose();
    this.lanterns.geometry.dispose();
    this.lanternMat.dispose();
    this.lanterns.dispose();
    this.sparkHalos.dispose();
    this.lanternHalos.dispose();
    this.group.removeFromParent();
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** Color sRGB → espacio lineal de trabajo. */
function srgbToLinear(hex: string, out: THREE.Color): THREE.Color {
  return out.set(hex);
}

/**
 * PERSONAJE LOW-POLY ARTICULADO (habitantes, jugador y náufragos).
 *
 * Jerarquía: root (pies, yaw) → body (desplazamientos para tumbarse/sentarse) → hips →
 * torso → cuello/cabeza, hombros → codos → manos (con herramienta en la derecha) y
 * caderas → rodillas → pies. El frente mira a -z (convención three.js: adelante = -z con yaw 0).
 *
 * `animate()` recibe una pose (andar, sentarse, dormir, trabajar, martillear, lanzar, charlar,
 * a cubierto, herido, cargar, pescar, recoger, saludar…) y la velocidad real, y mezcla
 * suavemente los ángulos de las articulaciones hacia la pose objetivo.
 */
import * as THREE from 'three';
import { PALETTE } from '../palette';
import { GeoBuilder, hash01, shade } from './geo';

export type RigPose =
  | 'stand'
  | 'walk'
  | 'sit'
  | 'sitFloor'
  | 'lie'
  | 'work'
  | 'stir'
  | 'kneel'
  | 'hammer'
  | 'throw'
  | 'talk'
  | 'shelter'
  | 'injured'
  | 'eat'
  | 'cast'
  | 'reel'
  | 'use'
  | 'wave'
  | 'drink'
  | 'jump';

export type RigTool = 'martillo' | 'llave' | 'gancho' | 'cana' | 'cubo' | 'cubo_lleno' | 'cucharon' | 'regadera' | 'cuenco' | null;

export interface CharacterLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  /** 'none' | 'beanie' (gorro de lana) | 'cap' (gorra de marinero). */
  hat: 'none' | 'beanie' | 'cap';
  hatColor: string;
  /** 0 corto, 1 media melena, 2 rapado, 3 moño. */
  hairStyle: number;
  height: number;
  /** Color del abrigo (null = sin abrigo). */
  coat: string | null;
}

export interface RigState {
  pose: RigPose;
  /** Velocidad horizontal real (m/s) para el ciclo de paso. */
  speed: number;
  limp?: boolean;
  tool?: RigTool;
  carry?: boolean;
  /** Color de la manta si duerme en una cama (null = sin manta). */
  blanket?: string | null;
}

/** Aspecto a partir de los índices de NpcAppearance. */
export function lookFromAppearance(a: { skin: number; shirt: number; pants: number; hair: number; hat: boolean; height: number }, seed: number): CharacterLook {
  const pick = <T>(arr: readonly T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length]!;
  const h = hash01(seed, 5);
  return {
    skin: pick(PALETTE.skins, a.skin),
    shirt: pick(PALETTE.shirts, a.shirt),
    pants: pick(PALETTE.pants, a.pants),
    hair: pick(PALETTE.hair, a.hair),
    hat: a.hat ? (h < 0.5 ? 'beanie' : 'cap') : 'none',
    hatColor: a.hat ? (h < 0.5 ? pick(['#bc4749', '#e9c46a', '#264653', '#e76f51'], a.shirt + 1) : '#f3ead6') : '#000000',
    hairStyle: Math.floor(hash01(seed, 9) * 4),
    height: THREE.MathUtils.clamp(a.height || 1, 0.85, 1.15),
    coat: null,
  };
}

/* ------------------------------------------------------------------ */
/* Geometrías compartidas                                              */
/* ------------------------------------------------------------------ */

const geoCache = new Map<string, THREE.BufferGeometry>();
function boxGeo(w: number, h: number, d: number, y0 = -h / 2, z0 = 0): THREE.BufferGeometry {
  const k = `b${w}|${h}|${d}|${y0}|${z0}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, y0 + h / 2, z0);
    geoCache.set(k, g);
  }
  return g;
}

const toolCache = new Map<string, THREE.BufferGeometry>();

/** Geometría (colores por vértice) de una herramienta: empuñadura en el origen, mango hacia -y. */
export function toolGeometry(tool: Exclude<RigTool, null>): THREE.BufferGeometry {
  let g = toolCache.get(tool);
  if (g) return g;
  const b = new GeoBuilder();
  const wood = '#9c6644';
  const steel = PALETTE.metal;
  switch (tool) {
    case 'martillo':
      b.box(-0.02, -0.3, -0.02, 0.02, 0.06, 0.02, wood);
      b.box(-0.03, -0.34, -0.12, 0.03, -0.26, 0.06, PALETTE.metalDark);
      break;
    case 'llave':
      b.box(-0.018, -0.3, -0.01, 0.018, 0.04, 0.01, steel);
      b.box(-0.05, -0.36, -0.012, 0.05, -0.3, 0.012, steel);
      b.box(-0.05, -0.4, -0.012, -0.025, -0.36, 0.012, steel);
      b.box(0.025, -0.4, -0.012, 0.05, -0.36, 0.012, steel);
      break;
    case 'gancho':
      // rollo de cabo en la mano y garfio de tres puntas
      b.push();
      b.rotateY(Math.PI / 2);
      b.ring(0, -0.05, 0, 0.11, 0.03, 8, PALETTE.rope, 4);
      b.pop();
      b.cylinderBetween(0, -0.05, 0, 0, -0.3, -0.05, 0.012, 4, PALETTE.rope);
      b.box(-0.015, -0.42, -0.065, 0.015, -0.3, -0.035, PALETTE.metalDark);
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2;
        b.cylinderBetween(0, -0.42, -0.05, Math.cos(a) * 0.08, -0.36, -0.05 + Math.sin(a) * 0.08, 0.012, 4, PALETTE.metalDark);
      }
      break;
    case 'cana':
      b.cylinderBetween(0, -0.05, 0.15, 0, 0.1, -1.6, 0.018, 5, '#bc8a5f');
      b.cylinderBetween(0, 0.1, -1.6, 0, 0.13, -1.95, 0.008, 4, '#6e4a2e');
      b.cylinder(0.04, -0.03, 0.0, 0.035, 0.035, 0.05, 6, PALETTE.metalDark);
      break;
    case 'cubo':
    case 'cubo_lleno':
      b.cylinderBetween(-0.12, -0.02, 0, 0.12, -0.02, 0, 0.008, 3, PALETTE.metalDark);
      b.cylinder(0, -0.3, 0, 0.11, 0.14, 0.24, 8, '#adb5bd', { capTop: false });
      if (tool === 'cubo_lleno') b.cylinder(0, -0.1, 0, 0.13, 0.13, 0.01, 8, '#2a9d8f');
      break;
    case 'cucharon':
      b.cylinderBetween(0, 0.02, 0, 0, -0.32, -0.04, 0.012, 4, wood);
      b.sphere(0, -0.36, -0.05, 0.05, steel, 0, 0.6);
      break;
    case 'regadera':
      b.cylinder(0, -0.32, 0, 0.1, 0.1, 0.2, 7, '#2a9d8f');
      b.cylinderBetween(0, -0.18, -0.08, 0, -0.08, -0.3, 0.02, 4, '#2a9d8f');
      b.cylinderBetween(0, -0.02, 0.05, 0, -0.12, 0.09, 0.012, 3, PALETTE.metalDark);
      break;
    case 'cuenco':
      b.cylinder(0, -0.05, -0.05, 0.05, 0.09, 0.07, 8, '#f3ead6');
      b.cylinder(0, 0.005, -0.05, 0.075, 0.075, 0.01, 8, '#e9a25f');
      break;
  }
  g = b.build();
  toolCache.set(tool, g);
  return g;
}

let crateGeoCache: THREE.BufferGeometry | null = null;
function carryCrateGeo(): THREE.BufferGeometry {
  if (crateGeoCache) return crateGeoCache;
  const b = new GeoBuilder();
  b.box(-0.18, -0.14, -0.14, 0.18, 0.14, 0.14, '#c8995f');
  b.box(-0.19, 0.06, -0.15, 0.19, 0.1, 0.15, '#8b5e3c');
  b.box(-0.19, -0.1, -0.15, 0.19, -0.06, 0.15, '#8b5e3c');
  crateGeoCache = b.build();
  return crateGeoCache;
}

/* ------------------------------------------------------------------ */

interface Joints {
  bodyY: number;
  bodyZ: number;
  torsoX: number;
  torsoY: number;
  torsoZ: number;
  headX: number;
  headY: number;
  shLX: number;
  shLZ: number;
  shRX: number;
  shRZ: number;
  elL: number;
  elR: number;
  hipLX: number;
  hipLZ: number;
  hipRX: number;
  hipRZ: number;
  knL: number;
  knR: number;
}

const ZERO: Joints = { bodyY: 0, bodyZ: 0, torsoX: 0, torsoY: 0, torsoZ: 0, headX: 0, headY: 0, shLX: 0, shLZ: 0, shRX: 0, shRZ: 0, elL: 0, elR: 0, hipLX: 0, hipLZ: 0, hipRX: 0, hipRZ: 0, knL: 0, knR: 0 };

const HIP_Y = 0.9;
const THIGH = 0.42;
const SHIN = 0.4;

type SegName = 'hips' | 'torso' | 'head' | 'armL' | 'armR' | 'foreL' | 'foreR' | 'thighL' | 'thighR' | 'shinL' | 'shinR';

export class CharacterRig {
  /** Raíz en los pies; `rotation.y` = yaw; `scale` = altura. */
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private shL = new THREE.Group();
  private shR = new THREE.Group();
  private elLg = new THREE.Group();
  private elRg = new THREE.Group();
  private handR = new THREE.Group();
  private hipLg = new THREE.Group();
  private hipRg = new THREE.Group();
  private knLg = new THREE.Group();
  private knRg = new THREE.Group();
  /** Una malla por segmento (colores por vértice): 11 llamadas de dibujo por personaje. */
  private segs = {} as Record<SegName, THREE.Mesh>;
  private blanket: THREE.Mesh;
  private toolMesh: THREE.Mesh;
  private carryMesh: THREE.Mesh;
  /** Material propio del personaje (para el brillo de resaltado). */
  private mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  private blanketMat = new THREE.MeshLambertMaterial({ color: '#2a9d8f' });
  private cur: Joints = { ...ZERO };
  private phase = 0;
  private time = 0;
  private currentTool: RigTool = null;
  private highlighted = false;
  look: CharacterLook;

  constructor(look: CharacterLook, readonly seed = 0) {
    this.look = look;
    const seg = (name: SegName, parent: THREE.Object3D): void => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      parent.add(m);
      this.segs[name] = m;
    };
    this.root.add(this.body);
    this.body.add(this.hips);
    this.hips.position.y = HIP_Y;
    seg('hips', this.hips);
    this.hips.add(this.torso);
    this.torso.position.y = 0.04;
    seg('torso', this.torso);
    this.torso.add(this.head);
    this.head.position.y = 0.5;
    seg('head', this.head);
    for (const [sh, el, sx, arm, fore] of [
      [this.shL, this.elLg, -1, 'armL', 'foreL'],
      [this.shR, this.elRg, 1, 'armR', 'foreR'],
    ] as const) {
      this.torso.add(sh);
      sh.position.set(sx * 0.245, 0.4, 0);
      seg(arm, sh);
      sh.add(el);
      el.position.y = -0.29;
      seg(fore, el);
    }
    this.elRg.add(this.handR);
    this.handR.position.y = -0.27;
    for (const [hip, kn, sx, th, sh] of [
      [this.hipLg, this.knLg, -1, 'thighL', 'shinL'],
      [this.hipRg, this.knRg, 1, 'thighR', 'shinR'],
    ] as const) {
      this.hips.add(hip);
      hip.position.set(sx * 0.09, -0.08, 0);
      seg(th, hip);
      hip.add(kn);
      kn.position.y = -THIGH;
      seg(sh, kn);
    }
    // manta (solo al dormir en una cama)
    this.blanket = new THREE.Mesh(boxGeo(0.62, 1.22, 0.26, 0.02, -0.06), this.blanketMat);
    this.blanket.visible = false;
    this.blanket.castShadow = true;
    this.body.add(this.blanket);
    // herramienta y caja
    this.toolMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.toolMesh.castShadow = true;
    this.toolMesh.position.set(0, -0.07, 0);
    this.handR.add(this.toolMesh);
    this.carryMesh = new THREE.Mesh(carryCrateGeo(), this.mat);
    this.carryMesh.castShadow = true;
    this.carryMesh.visible = false;
    this.torso.add(this.carryMesh);
    this.carryMesh.position.set(0, 0.16, -0.36);
    this.applyLook(look);
  }

  /** Cambia el aspecto (colores, pelo, gorro, abrigo, altura): regenera las mallas de los segmentos. */
  applyLook(look: CharacterLook): void {
    this.look = look;
    this.root.scale.setScalar(look.height);
    const coat = look.coat;
    const shirt = coat ?? look.shirt;
    const dark = '#1d1d1d';
    const shoe = '#3b2a1e';
    const skin = look.skin;
    const build = (name: SegName, fn: (g: GeoBuilder) => void): void => {
      const g = new GeoBuilder();
      fn(g);
      const mesh = this.segs[name];
      mesh.geometry.dispose();
      mesh.geometry = g.build();
    };
    build('hips', (g) => {
      g.box(-0.165, -0.1, -0.1, 0.165, 0.06, 0.1, look.pants);
      g.box(-0.1725, 0.02, -0.1075, 0.1725, 0.07, 0.1075, dark);
      g.boxC(0, 0.045, -0.11, 0.06, 0.045, 0.01, '#c9a35a');
      if (coat) g.frustum(0, -0.3, 0, 0.42, 0.27, 0.37, 0.25, 0.32, coat);
    });
    build('torso', (g) => {
      if (coat) {
        g.frustum(0, -0.005, 0, 0.37, 0.24, 0.45, 0.26, 0.47, coat);
        g.box(-0.15, 0.44, -0.08, 0.15, 0.52, 0.12, shade(coat, 0.85));
        // botones
        for (const y of [0.12, 0.24, 0.36]) g.boxC(0, y, -0.128, 0.03, 0.03, 0.01, '#c9a35a');
      } else {
        g.frustum(0, 0, 0, 0.33, 0.2, 0.42, 0.23, 0.46, shirt);
        // bolsillo y cuello de la camisa
        g.box(-0.15, 0.27, -0.118, -0.05, 0.36, -0.105, shade(shirt, 0.82));
        g.box(-0.08, 0.4, -0.12, 0.08, 0.46, -0.1, shade(shirt, 0.9));
      }
      g.box(-0.05, 0.44, -0.05, 0.05, 0.52, 0.05, skin);
    });
    build('head', (g) => {
      g.frustum(0, 0, 0, 0.22, 0.23, 0.25, 0.26, 0.27, skin);
      // cara: ojos, cejas, nariz, boca y orejas
      for (const x of [-0.06, 0.06]) {
        g.box(x - 0.0175, 0.14, -0.137, x + 0.0175, 0.18, -0.125, dark);
        g.box(x - 0.03, 0.195, -0.136, x + 0.03, 0.212, -0.124, shade(look.hair, 0.9));
      }
      g.box(-0.0225, 0.07, -0.165, 0.0225, 0.13, -0.115, shade(skin, 0.93));
      g.box(-0.04, 0.04, -0.127, 0.04, 0.052, -0.115, shade(skin, 0.6));
      for (const x of [-0.13, 0.13]) g.box(x - 0.015, 0.08, -0.03, x + 0.015, 0.16, 0.03, shade(skin, 0.95));
      // pelo
      const hair = look.hair;
      const style = look.hairStyle;
      if (style !== 2) g.box(-0.135, 0.245, -0.14, 0.135, 0.325, 0.14, hair);
      else g.box(-0.129, 0.255, -0.134, 0.129, 0.285, 0.134, hair);
      if (style === 0 || style === 3) g.box(-0.135, 0.12, 0.085, 0.135, 0.28, 0.145, hair);
      if (style === 1) {
        g.box(-0.14, -0.02, 0.08, 0.14, 0.28, 0.15, hair);
        for (const x of [-0.135, 0.135]) g.box(x - 0.02, 0.08, -0.08, x + 0.02, 0.28, 0.12, hair);
      }
      if (style === 3) g.box(-0.055, 0.2, 0.12, 0.055, 0.31, 0.22, hair);
      if (style !== 1) for (const x of [-0.13, 0.13]) g.box(x - 0.01, 0.15, -0.05, x + 0.01, 0.25, 0.13, hair);
      // gorro
      if (look.hat === 'beanie') {
        g.frustum(0, 0.21, 0, 0.29, 0.3, 0.2, 0.21, 0.15, look.hatColor);
        g.box(-0.15, 0.2, -0.155, 0.15, 0.26, 0.155, shade(look.hatColor, 0.78));
        g.sphere(0, 0.38, 0, 0.045, shade(look.hatColor, 1.15));
      } else if (look.hat === 'cap') {
        g.box(-0.14, 0.25, -0.145, 0.14, 0.33, 0.145, look.hatColor);
        g.box(-0.13, 0.25, -0.25, 0.13, 0.27, -0.11, dark);
        g.box(-0.1425, 0.27, -0.1475, 0.1425, 0.3, 0.1475, dark);
      }
    });
    for (const name of ['armL', 'armR'] as const) {
      build(name, (g) => {
        if (coat) g.box(-0.06, -0.31, -0.065, 0.06, 0.01, 0.065, coat);
        else g.box(-0.05, -0.3, -0.055, 0.05, 0, 0.055, shirt);
      });
    }
    for (const name of ['foreL', 'foreR'] as const) {
      build(name, (g) => {
        g.box(-0.0425, -0.25, -0.0475, 0.0425, 0, 0.0475, skin);
        if (coat) g.box(-0.0525, -0.16, -0.0575, 0.0525, 0, 0.0575, coat);
        g.box(-0.04, -0.34, -0.045, 0.04, -0.25, 0.045, skin);
      });
    }
    for (const name of ['thighL', 'thighR'] as const) build(name, (g) => g.box(-0.07, -THIGH, -0.08, 0.07, 0, 0.08, look.pants));
    for (const name of ['shinL', 'shinR'] as const) {
      build(name, (g) => {
        g.box(-0.06, -(SHIN - 0.08), -0.065, 0.06, 0, 0.065, look.pants);
        g.box(-0.065, -SHIN, -0.165, 0.065, -(SHIN - 0.08), 0.085, shoe);
      });
    }
  }

  /** Brillo suave de resaltado (objetivo de interacción). */
  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.mat.emissive.set(on ? '#5a4520' : '#000000');
    this.blanketMat.emissive.set(on ? '#5a4520' : '#000000');
  }

  private setTool(tool: RigTool): void {
    if (tool === this.currentTool) return;
    this.currentTool = tool;
    if (tool) {
      this.toolMesh.geometry = toolGeometry(tool);
      this.toolMesh.visible = true;
    } else this.toolMesh.visible = false;
  }

  /** Avanza la animación. `dt` en segundos reales. */
  animate(st: RigState, dt: number): void {
    this.time += dt;
    const t = this.time;
    const tg: Joints = { ...ZERO };
    const sp = Math.max(0, st.speed);
    this.setTool(st.tool ?? null);
    this.carryMesh.visible = !!st.carry && (st.pose === 'walk' || st.pose === 'stand');
    this.blanket.visible = st.pose === 'lie' && !!st.blanket;
    if (st.blanket) this.blanketMat.color.set(st.blanket);
    const breathe = Math.sin(t * 2.1) * 0.015;
    let lieDown = false;
    let sitting = 0;
    switch (st.pose) {
      case 'walk':
      case 'stand': {
        if (sp > 0.15) {
          const stride = sp > 3 ? 2.2 : 1.35;
          this.phase += (sp / stride) * Math.PI * 2 * dt;
          const run = THREE.MathUtils.clamp((sp - 2.2) / 2, 0, 1);
          const A = THREE.MathUtils.clamp(0.3 + sp * 0.14, 0.3, 0.85);
          const ph = this.phase;
          const limpK = st.limp ? 0.35 : 1;
          tg.hipLX = Math.sin(ph) * A;
          tg.hipRX = -Math.sin(ph) * A * limpK;
          tg.knL = -Math.max(0, Math.cos(ph)) * A * 1.4;
          tg.knR = -Math.max(0, -Math.cos(ph)) * A * 1.4 * limpK;
          tg.shLX = -Math.sin(ph) * A * 0.8;
          tg.shRX = Math.sin(ph) * A * 0.8;
          tg.elL = 0.2 + run * 1.1;
          tg.elR = 0.2 + run * 1.1;
          tg.shLZ = -0.06;
          tg.shRZ = 0.06;
          tg.bodyY = (1 - Math.cos(ph * 2)) * 0.018 * (0.5 + A) - run * 0.03;
          tg.torsoX = -0.05 - run * 0.22;
          tg.torsoY = Math.sin(ph) * 0.07;
          if (st.limp) {
            tg.torsoZ = Math.sin(ph) * 0.09;
            tg.bodyY -= Math.max(0, Math.sin(ph)) * 0.04;
          }
        } else {
          tg.shLZ = -0.08;
          tg.shRZ = 0.08;
          tg.elL = 0.12;
          tg.elR = 0.12;
          tg.torsoX = breathe;
          tg.headY = Math.sin(t * 0.37 + this.seed) * 0.35;
          tg.headX = Math.sin(t * 0.23 + this.seed * 2) * 0.08;
          if (st.limp) {
            tg.hipRX = 0.15;
            tg.knR = -0.25;
            tg.torsoZ = -0.05;
          }
        }
        if (st.carry) {
          tg.shLX = 0.95;
          tg.shRX = 0.95;
          tg.elL = 0.75;
          tg.elR = 0.75;
          tg.shLZ = 0.12;
          tg.shRZ = -0.12;
        }
        break;
      }
      case 'drink': {
        // de pie, llevándose la mano a la boca a sorbos
        const k = Math.max(0, Math.sin(t * 1.8));
        tg.shRX = 0.4 + k * 0.5;
        tg.elR = 1.3 + k * 0.9;
        tg.shRZ = -0.2 * k;
        tg.headX = -0.1 * k;
        tg.shLZ = -0.08;
        tg.elL = 0.15;
        tg.torsoX = breathe;
        break;
      }
      case 'jump':
        tg.hipLX = 0.6;
        tg.hipRX = 0.2;
        tg.knL = -1.0;
        tg.knR = -0.6;
        tg.shLX = -0.4;
        tg.shRX = -0.4;
        tg.shLZ = -0.5;
        tg.shRZ = 0.5;
        break;
      case 'sit':
      case 'eat':
        sitting = 1;
        tg.hipLX = 1.5;
        tg.hipRX = 1.5;
        tg.knL = -1.5;
        tg.knR = -1.5;
        tg.hipLZ = -0.05;
        tg.hipRZ = 0.05;
        tg.torsoX = 0.05 + breathe;
        tg.elL = 0.6;
        tg.elR = 0.6;
        tg.shLX = 0.25;
        tg.shRX = 0.25;
        if (st.pose === 'eat') {
          const k = Math.max(0, Math.sin(t * 2.2));
          tg.shRX = 0.5 + k * 0.6;
          tg.elR = 1.2 + k * 0.9;
          tg.shRZ = -0.25 * k;
          tg.shLX = 0.7;
          tg.elL = 1.2;
          tg.headX = 0.15 - k * 0.1;
        } else {
          tg.headY = Math.sin(t * 0.3 + this.seed) * 0.3;
        }
        break;
      case 'sitFloor':
        sitting = 2;
        tg.hipLX = 1.35;
        tg.hipRX = 1.35;
        tg.hipLZ = -0.25;
        tg.hipRZ = 0.25;
        tg.knL = -0.9;
        tg.knR = -0.9;
        tg.shLX = 0.3;
        tg.shRX = 0.3;
        tg.elL = 0.9;
        tg.elR = 0.9;
        tg.torsoX = 0.1 + breathe;
        break;
      case 'lie':
        lieDown = true;
        tg.shLZ = -0.12;
        tg.shRZ = 0.12;
        tg.elL = 0.25;
        tg.elR = 0.25;
        tg.torsoX = breathe * 0.5;
        tg.headY = 0.25 * Math.sin(this.seed * 3);
        tg.knL = -0.15;
        tg.hipLX = 0.15;
        break;
      case 'work':
      case 'stir': {
        const f = st.pose === 'stir' ? 3.2 : 5.5;
        tg.torsoX = -0.2;
        tg.shRX = 1.05 + Math.sin(t * f) * 0.25;
        tg.shLX = 1.0 + Math.sin(t * f + 1.7) * 0.2;
        tg.elR = 0.7 + Math.sin(t * f) * 0.2;
        tg.elL = 0.8;
        tg.shRZ = st.pose === 'stir' ? -0.25 + Math.sin(t * f) * 0.2 : 0;
        tg.shLZ = 0.1;
        tg.headX = 0.3;
        tg.bodyY = -0.02;
        break;
      }
      case 'kneel':
        tg.bodyY = -0.42;
        tg.hipLX = 1.4;
        tg.knL = -2.4;
        tg.hipRX = -0.1;
        tg.knR = -1.5;
        tg.torsoX = -0.35;
        tg.shRX = 1.2 + Math.sin(t * 4) * 0.2;
        tg.shLX = 0.9 + Math.sin(t * 4 + 2) * 0.15;
        tg.elR = 0.4;
        tg.elL = 0.6;
        tg.headX = 0.35;
        break;
      case 'hammer': {
        const k = Math.max(0, Math.sin(t * 6.5));
        const strike = Math.pow(1 - k, 3);
        tg.torsoX = -0.25;
        tg.shRX = 0.7 + k * 1.4;
        tg.elR = 0.4 + k * 0.9 - strike * 0.2;
        tg.shLX = 0.95;
        tg.elL = 0.5;
        tg.shLZ = 0.15;
        tg.headX = 0.35;
        tg.bodyY = -0.04;
        tg.knL = -0.2;
        tg.knR = -0.2;
        tg.hipLX = 0.1;
        tg.hipRX = 0.1;
        break;
      }
      case 'throw': {
        const c = (t * 0.8) % 1;
        const swing = c < 0.6 ? -0.5 + (c / 0.6) * 0.3 : -0.2 + ((c - 0.6) / 0.4) * 2.0;
        tg.shRX = swing;
        tg.shLX = swing;
        tg.elR = 0.4;
        tg.elL = 0.4;
        tg.shRZ = -0.15;
        tg.shLZ = 0.15;
        tg.torsoX = c < 0.6 ? 0.1 : -0.35;
        tg.hipLX = 0.35;
        tg.knL = -0.3;
        tg.knR = -0.15;
        break;
      }
      case 'cast': {
        const c = (t * 0.9) % 1;
        tg.shRX = c < 0.5 ? -0.6 : 1.3;
        tg.elR = c < 0.5 ? 1.4 : 0.3;
        tg.shLX = 0.6;
        tg.elL = 0.8;
        tg.torsoX = c < 0.5 ? 0.15 : -0.15;
        break;
      }
      case 'reel':
        tg.shRX = 0.9 + Math.sin(t * 2) * 0.1;
        tg.elR = 0.5;
        tg.shLX = 0.8;
        tg.elL = 0.9 + Math.sin(t * 9) * 0.35;
        tg.shLZ = 0.2;
        tg.torsoX = 0.08;
        tg.headX = 0.1;
        break;
      case 'use':
        tg.torsoX = -0.75;
        tg.shRX = 1.3;
        tg.shLX = 1.2;
        tg.elR = 0.1;
        tg.elL = 0.15;
        tg.hipLX = 0.55;
        tg.hipRX = 0.55;
        tg.knL = -0.7;
        tg.knR = -0.7;
        tg.bodyY = -0.1;
        tg.headX = 0.3;
        break;
      case 'talk':
        tg.shRX = 0.45 + Math.sin(t * 2.6) * 0.3;
        tg.elR = 1.1 + Math.sin(t * 3.3) * 0.3;
        tg.shRZ = 0.15 + Math.sin(t * 1.9) * 0.15;
        tg.shLX = 0.15 + Math.max(0, Math.sin(t * 1.3 + 2)) * 0.6;
        tg.elL = 0.5 + Math.max(0, Math.sin(t * 1.3 + 2)) * 0.8;
        tg.shLZ = -0.12;
        tg.headX = Math.sin(t * 3.7) * 0.07;
        tg.headY = Math.sin(t * 0.9) * 0.15;
        tg.torsoY = Math.sin(t * 0.7) * 0.08;
        break;
      case 'shelter':
        tg.torsoX = -0.3;
        tg.shLX = 0.75;
        tg.shRX = 0.75;
        tg.shLZ = 0.55;
        tg.shRZ = -0.55;
        tg.elL = 1.9;
        tg.elR = 1.9;
        tg.headX = 0.35;
        tg.torsoZ = Math.sin(t * 31) * 0.02;
        tg.knL = -0.15;
        tg.knR = -0.15;
        tg.hipLX = 0.08;
        tg.hipRX = 0.08;
        break;
      case 'injured':
        tg.torsoX = -0.2;
        tg.torsoZ = -0.08;
        tg.shLX = 0.35;
        tg.shLZ = 0.45;
        tg.elL = 1.6;
        tg.shRZ = 0.12;
        tg.elR = 0.2;
        tg.headX = 0.3;
        tg.hipRX = 0.12;
        tg.knR = -0.3;
        break;
      case 'wave': {
        tg.shRZ = 2.5;
        tg.shRX = 0.2;
        tg.elR = 0.3 + Math.sin(t * 8) * 0.45;
        tg.shLX = 0.2;
        if (st.speed < 0.01) {
          sitting = 2;
          tg.hipLX = 1.35;
          tg.hipRX = 1.35;
          tg.knL = -0.9;
          tg.knR = -0.9;
          tg.hipLZ = -0.2;
          tg.hipRZ = 0.2;
        }
        break;
      }
    }
    // Mezcla suave hacia el objetivo
    const k = Math.min(1, dt * 9);
    for (const key of Object.keys(tg) as (keyof Joints)[]) this.cur[key] += (tg[key] - this.cur[key]) * k;
    const c = this.cur;
    // Cuerpo: tumbado (sobre la espalda, cabeza hacia +z local) o sentado
    this.body.rotation.x = lieDown ? Math.PI / 2 : 0;
    if (lieDown) this.body.position.set(0, 0.13, 0);
    else if (sitting === 1) this.body.position.set(0, -(HIP_Y - 0.52) + c.bodyY * 0.2, 0.05);
    else if (sitting === 2) this.body.position.set(0, -(HIP_Y - 0.12), 0);
    else this.body.position.set(0, c.bodyY, c.bodyZ);
    this.torso.rotation.set(c.torsoX, c.torsoY, c.torsoZ);
    this.head.rotation.set(c.headX, c.headY, 0);
    this.shL.rotation.set(c.shLX, 0, c.shLZ);
    this.shR.rotation.set(c.shRX, 0, c.shRZ);
    this.elLg.rotation.x = c.elL;
    this.elRg.rotation.x = c.elR;
    this.hipLg.rotation.set(c.hipLX, 0, c.hipLZ);
    this.hipRg.rotation.set(c.hipRX, 0, c.hipRZ);
    this.knLg.rotation.x = c.knL;
    this.knRg.rotation.x = c.knR;
    // La herramienta se orienta según la pose (caña hacia delante, cubo colgando)
    const tool = this.currentTool;
    const armPitch = c.shRX + c.elR + c.torsoX;
    if (tool === 'cana') this.toolMesh.rotation.set(0.55 - armPitch, 0, 0);
    else if (tool === 'cubo' || tool === 'cubo_lleno' || tool === 'regadera' || tool === 'cuenco') this.toolMesh.rotation.set(-armPitch * 0.95, 0, 0);
    else this.toolMesh.rotation.set(1.1, 0, 0);
  }

  /**
   * Punta de la caña (coordenadas de mundo) si lleva la caña en la mano, o null.
   * Llamar después de `animate` (actualiza las matrices del personaje).
   */
  rodTip(out: THREE.Vector3): THREE.Vector3 | null {
    if (this.currentTool !== 'cana' || !this.toolMesh.visible) return null;
    this.root.updateWorldMatrix(true, true);
    return this.toolMesh.localToWorld(out.set(0, 0.13, -1.95));
  }

  dispose(): void {
    for (const m of Object.values(this.segs)) m.geometry.dispose();
    this.mat.dispose();
    this.blanketMat.dispose();
    this.root.removeFromParent();
  }
}

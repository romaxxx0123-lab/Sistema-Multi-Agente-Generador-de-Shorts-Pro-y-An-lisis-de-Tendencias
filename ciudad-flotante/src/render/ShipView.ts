/**
 * [AGENTE render-ship] VISTA 3D DEL BARCO.
 *
 * Geometría estática POR NIVEL. Cuando cambia el barco (`state.ship.revision`, la eslora, el nivel
 * de mejora o el estado de daños de algún módulo, o tras `reset()`) se calcula la firma de cada
 * nivel (celdas, paredes, puertas, escaleras, losas, props y módulos que lo tocan) y solo se
 * reconstruyen los niveles cuya firma ha cambiado (QA P4: antes cada cambio rehacía todo el barco,
 * ~70 ms de tirón). Dentro de un nivel solo se rehace lo que cambia: columnas de estructura y grupos
 * de columnas de muebles y de estructura (`GROUP_COLS`). Las columnas de estructura nuevas se
 * construyen antes, repartidas entre frames con un presupuesto (`rebuildBudgetMs`), sin tocar la
 * escena; cuando están todas, los niveles cambiados se sustituyen a la vez en un mismo frame (con
 * las obras y andamios que desaparecen), así que no hay parpadeos ni huecos (QA ronda 2: terminar
 * una mejora u obra en un barco grande costaba 40–90 ms).
 *  - casco procedural con proa, popa, regala, castillo, palo, pluma, botes, anclas, ojos de buey;
 *  - estructura del layout: losas, paredes con ventanas, puertas, barandillas, escaleras,
 *    lámparas, forro y cuadernas de la bodega;
 *  - todos los props, fusionados con la estructura POR MATERIAL Y NIVEL (ship/bake.ts)
 *    para tener muy pocas llamadas de dibujo, con los detalles de su nivel de mejora;
 *  - placas de latón con el nivel (II, III) y el altillo del almacén mejorado (ship/tiers.ts).
 * Elementos dinámicos (cada frame): fuego del fogón, plantas, nivel de agua, máquinas que
 * vibran y humean, LEDs, contenido de almacenes, obras con andamios y fantasma, incendios,
 * cajas sueltas, humo de chimenea y averías, banderas, radar, pool de luces interiores,
 * mejoras en obras (andamio ligero y cartel con la barra de progreso de `module.upgrade`),
 * ahumadero, vivero, grúa y radar de los módulos especializados, luz cálida de la sala común,
 * resaltado del objetivo, ocultación por nivel y vista en corte.
 *
 * `getPropObject(key)` devuelve un Object3D por prop (posición/rotación del prop, con
 * `userData` {key, kind, moduleId, interact, index}) que contiene sus partes animadas y una
 * caja invisible para rayos (los Raycaster de three.js no comprueban `visible`).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { moduleDef } from '../data/modules';
import type { HighlightTarget } from '../game/types';
import { CELL, LEVEL_H, SHIP_ORIGIN_X, VISUAL_DRIFT, WALL_H } from '../sim/constants';
import { moduleTier } from '../sim/moduleStats';
import { cellMin, getCell, levelOfY, levelY, moduleCells, type CellKind, type PropInstance, type ShipLayout } from '../sim/ship';
import { daylight } from '../sim/time';
import type { GameState, ModuleInstance } from '../sim/types';
import { bakeParts, type BakePart, type Baked } from './ship/bake';
import { createDynamic, radarActive, type DynContext, type PropDynamic } from './ship/dynamic';
import { Flag, nameTexture } from './ship/decor';
import { FireView } from './ship/fire';
import { GeoBuilder, hash01 } from './ship/geo';
import { buildHull, funnel, radarMast, type HullGeometry } from './ship/hull';
import { LightPool, type LightCandidate } from './ship/lights';
import { ShipMaterials } from './ship/materials';
import { Particles } from './ship/particles';
import { crate as crateModel, localDims, propModel, propTier, type PropModel } from './ship/props';
import { buildExpansionScaffold, buildSite, buildUpgradeSite, setProgress, siteProgress, type SiteEntry, type UpgradeSiteEntry } from './ship/sites';
import { buildStructure, chunkOfX, makeLevelBuilders, type LevelBuilders, type LightSpot } from './ship/structure';
import { storeLoft, tierPlaque } from './ship/tiers';

export interface ShipViewOptions {
  /** Oculta todo lo que esté por encima de este nivel (modo construcción). null = nada oculto. */
  hideAboveLevel: number | null;
  /** Oculta techos/losas superiores del nivel indicado (vista en corte). */
  cutaway: boolean;
  highlight: HighlightTarget | null;
}

interface PropEntry {
  inst: PropInstance;
  model: PropModel;
  proxy: THREE.Group;
  level: number;
  dyn: PropDynamic | null;
}

/** Geometría de la estructura de una columna de celdas de un nivel (se reutiliza si su firma no cambia). */
interface StructCache {
  key: string;
  solid: THREE.BufferGeometry;
  /** Módulo dueño de cada vértice de `solid` (-1 = ninguno) y los módulos que aparecen. */
  tags: Int32Array;
  tagIds: number[];
  glassOut: THREE.BufferGeometry;
  glassIn: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  lanterns: THREE.BufferGeometry;
  lights: LightSpot[];
}

/** Malla sólida con sus colores sin oscurecer y el módulo de cada vértice (tinte de daños). */
interface TintMesh {
  mesh: THREE.Mesh;
  base: Float32Array;
  tags: Int32Array;
  /** Tinte aplicado ahora a cada módulo que aparece en la malla. */
  tints: Map<number, number>;
}

/**
 * Columnas de celdas (4 m) por grupo de mallas fusionadas (sólido de la estructura y muebles). Una
 * mejora solo vuelve a fusionar y a subir a la GPU su grupo de muebles, y una obra terminada los
 * grupos de estructura de sus columnas (en el barco ampliado, una cuarta parte del nivel), a cambio
 * de unas pocas llamadas de dibujo más; además, los grupos fuera de cámara no se dibujan.
 */
export const GROUP_COLS = 4;

/** Malla fusionada de un grupo de columnas de un nivel (se conserva mientras su contenido no cambie). */
interface BakedGroup {
  /**
   * Muebles: firma (modelo y colocación de cada prop del grupo, y lo que leen sus placas y
   * altillos). Estructura: vacía (se comparan las columnas de `chunks`).
   */
  key: string;
  /** Columnas de estructura del grupo (se reutilizan tal cual si su firma no cambia). */
  chunks: StructCache[];
  mesh: THREE.Mesh | null;
  tint: TintMesh | null;
  tris: number;
}

/** Geometría ya fusionada de un grupo, preparada antes de mostrarla (aún sin malla). */
interface Prebaked {
  /** Estructura: columnas de las que sale. Muebles: firma del grupo. */
  chunks: StructCache[];
  key: string;
  baked: Baked;
  ids: Map<number, number>;
}

/** Lo que va en un grupo de muebles al rehacer un nivel. */
interface FurnPlan {
  index: number;
  parts: BakePart[];
  sig: string[];
  ids: Map<number, number>;
  /** Módulos mejorados del grupo (placa de latón, altillo). */
  decor: ModuleInstance[];
}

/**
 * Lo construido en un nivel: firma, mallas y puntos de luz. Las mallas de la ESTRUCTURA (suelos,
 * paredes, cristal exterior, faroles) y las de los MUEBLES (props, placas y altillo, por grupos de
 * columnas; cristal y luces de los props con los de la estructura) van por separado: si solo
 * cambian los muebles (una mejora, una máquina nueva en cubierta) la estructura no se vuelve a
 * fusionar ni a subir a la GPU, y de los muebles solo el grupo que cambia.
 */
interface LevelBuild {
  key: string;
  lights: LightSpot[];
  /** Estructura por columnas de celdas (una sola en el nivel de los techos). */
  struct: StructCache[];
  /** Cristal exterior, faroles y radar (el sólido va por grupos en `solid`). */
  structObjs: THREE.Object3D[];
  /** Sólido de la estructura por grupo de `GROUP_COLS` columnas. */
  solid: Map<number, BakedGroup>;
  /** Cristal interior y lámparas (estructura y props). */
  propObjs: THREE.Object3D[];
  /** Muebles por grupo de `GROUP_COLS` columnas. */
  furn: Map<number, BakedGroup>;
  structTris: number;
  structMeshes: number;
  propTris: number;
  propMeshes: number;
  tinted: TintMesh[];
}

const KIND_CODE: Record<CellKind, number> = { void: 0, hold: 1, deck: 2, roof: 3, room: 4, stairLow: 5, stairHigh: 6 };
const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Nivel de un prop según su altura. */
function propLevel(p: PropInstance, layout: ShipLayout): number {
  return Math.max(0, Math.min(layout.levels - 1, Math.round(p.y / LEVEL_H - 0.01)));
}

/**
 * ¿Influye un mueble en la estructura de su nivel? Solo los que están junto a una pared de
 * habitación (pueden tapar una ventana o la decoración), cerca de una puerta (hacia dónde abre la
 * hoja) o en el eje de la bodega (faroles). Los demás pueden cambiar sin rehacer la estructura.
 */
function affectsStructure(p: PropInstance, layout: ShipLayout, l: number): boolean {
  if (l === 0 && Math.abs(p.z) < p.hz + 0.6) return true;
  for (const d of layout.doors) {
    if (d.level !== l) continue;
    const r = d.width / 2 + 1.6;
    if (Math.abs(d.x - p.x) < p.hx + r && Math.abs(d.z - p.z) < p.hz + r) return true;
  }
  for (const w of layout.walls) {
    if (w.level !== l || w.kind !== 'wall') continue;
    if (p.x + p.hx > Math.min(w.x0, w.x1) - 1 && p.x - p.hx < Math.max(w.x0, w.x1) + 1 && p.z + p.hz > Math.min(w.z0, w.z1) - 1 && p.z - p.hz < Math.max(w.z0, w.z1) + 1) return true;
  }
  return false;
}

/** ¿Un prop sigue en el mismo sitio y con las mismas medidas? (su objeto se puede conservar). */
function samePlacement(a: PropInstance, b: PropInstance): boolean {
  return a.kind === b.kind && a.moduleId === b.moduleId && a.index === b.index && a.interact === b.interact && a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.hx === b.hx && a.hz === b.hz && a.height === b.height;
}

const LAMP_COLOR = new THREE.Color('#ffd59a');
/** Luz de la sala común: más cálida (pantallas de tela) y algo más intensa. */
const LOUNGE_COLOR = new THREE.Color('#ffbf7a');
const LANTERN_COLOR = new THREE.Color('#ffb35c');
const FLOOD_COLOR = new THREE.Color('#fff1d6');
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/** Multiplicador de color de un módulo según su estado (dañado → más oscuro). */
export function moduleTint(m: ModuleInstance | undefined): number {
  if (!m) return 1;
  if (m.status === 'broken') return 0.62;
  if (m.condition < 50) return 0.78;
  return 1;
}

export class ShipView {
  private group = new THREE.Group();
  readonly mats = new ShipMaterials();
  private levelGroups: THREE.Group[] = [];
  private levelBuilds: LevelBuild[] = [];
  /** Niveles pendientes de reconstruir → firma que tendrán (y las de su estructura por columnas). */
  private planned = new Map<number, string>();
  private plannedStruct = new Map<number, string[]>();
  /** Columnas de estructura ya construidas para los niveles pendientes (aún sin mostrar). */
  private staged = new Map<number, Map<number, StructCache>>();
  /** Grupos de estructura y de muebles ya fusionados para los niveles pendientes (aún sin mostrar). */
  private prebaked = new Map<number, { solid: Map<number, Prebaked>; furn: Map<number, Prebaked> }>();
  /** Reconstruir todo de una vez (partida nueva, carga, casco nuevo). */
  private forceFull = true;
  private upgrades = new Map<number, UpgradeSiteEntry>();
  /** Modelos que conviene tener ya construidos (variantes de las mejoras en obras). */
  private warmQueue: (() => void)[] = [];
  /** Constructores reutilizados entre reconstrucciones (un nivel cada vez). */
  private pool: LevelBuilders = makeLevelBuilders();
  private decorPool = new GeoBuilder().trackTags();
  private upgradeKey = '';
  private hullObjs: THREE.Object3D[] = [];
  private props = new Map<string, PropEntry>();
  private dyns: PropDynamic[] = [];
  private lightSpots: LightSpot[] = [];
  private lightPool: LightPool;
  private particles: Particles;
  private fires: FireView;
  private sites = new Map<number, SiteEntry>();
  private crates = new Map<number, THREE.Mesh>();
  private crateGeo: THREE.BufferGeometry;
  private expansion: { object: THREE.Group; bars: THREE.Mesh[] } | null = null;
  private flags: Flag[] = [];
  private radar: THREE.Mesh | null = null;
  private radarSpin = 0;
  private chimneyTop: THREE.Vector3 | null = null;
  private hull: HullGeometry | null = null;
  private hlOverlay: THREE.Mesh;
  private hlOutline: THREE.Mesh;
  private hlBox: THREE.Mesh;
  private hlFill: THREE.Mesh;
  private hlKey = '';
  private hlBoxKey = '';
  private hullKey = '';
  private structKey = '';
  private tintKey = '';
  private siteKey = '';
  private levels = 0;
  private t = 0;
  private emitAcc = new Map<string, number>();
  private hlGeoCache = new WeakMap<PropModel, THREE.BufferGeometry>();
  private modelIds = new WeakMap<PropModel, number>();
  private modelSeq = 0;
  private bakedVertices = 0;
  /** Coste medio (ms) de construir una columna de estructura y de fusionar un grupo, para el presupuesto. */
  private unitMs = { chunk: 2, bake: 1 };
  /** Este frame ya ha calculado las firmas (planLevels): no se adelanta trabajo hasta el siguiente. */
  private plannedNow = false;
  /** El frame anterior se saltó por eso (nunca dos seguidos: si el barco cambiara en cada frame). */
  private skippedLast = false;
  private pickGeo = new THREE.BoxGeometry(1, 1, 1);
  private pickMat = new THREE.MeshBasicMaterial({ visible: false });
  /** Sustituye opciones de vista (pruebas y depuración: p. ej. `{ cutaway: false }`). */
  debugOptions: Partial<ShipViewOptions> | null = null;
  /**
   * Milisegundos por frame para construir por adelantado las columnas de estructura de un cambio
   * (siempre al menos una por frame); los niveles cambiados se muestran todos juntos cuando están.
   * Infinity = todo en el mismo frame.
   */
  rebuildBudgetMs = 6;
  /**
   * Estadísticas para depuración y pruebas: `rebuilds` = cambios del barco que han obligado a
   * rehacer algún nivel; `levelRebuilds` = niveles rehechos en total; `lastRebuildMs` y
   * `lastRebuildLevels` = coste y niveles del último frame que sustituyó niveles; `structRebuilds`,
   * `solidBakes`, `furnitureBakes` y `siteBuilds` = columnas de estructura, grupos de estructura y
   * de muebles fusionados (`prebakes`: los fusionados por adelantado), y obras construidas;
   * `stagedFrames` = frames dedicados a adelantar trabajo; `lastBakedVertices` = vértices
   * fusionados para el último cambio.
   */
  readonly stats = { rebuilds: 0, levelRebuilds: 0, lastRebuildLevels: 0, structRebuilds: 0, solidBakes: 0, furnitureBakes: 0, prebakes: 0, siteBuilds: 0, stagedFrames: 0, lastBakedVertices: 0, lastStructMs: 0, tintPasses: 0, hullRebuilds: 0, lastRebuildMs: 0, staticMeshes: 0, triangles: 0 };

  constructor(readonly root: THREE.Group) {
    this.group.name = 'barco';
    root.add(this.group);
    this.lightPool = new LightPool(this.group);
    this.particles = new Particles(this.group);
    this.fires = new FireView(this.group, this.mats);
    const cg = new GeoBuilder();
    crateModel(cg, 0, 0, 0, 0.62, 0.5, 0.62, '#c8995f');
    cg.box(-0.33, 0.18, -0.06, 0.33, 0.22, 0.06, '#d6b97b');
    cg.box(-0.06, 0.18, -0.33, 0.06, 0.22, 0.33, '#d6b97b');
    cg.box(-0.12, 0.5, -0.12, 0.12, 0.53, 0.04, '#f3ead6');
    this.crateGeo = cg.build();
    this.hlOverlay = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.highlight);
    this.hlOutline = new THREE.Mesh(new THREE.BufferGeometry(), this.mats.outline);
    for (const m of [this.hlOverlay, this.hlOutline]) {
      m.matrixAutoUpdate = false;
      m.visible = false;
      m.renderOrder = 10;
      this.group.add(m);
    }
    this.hlBox = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#ffd27d', transparent: true, depthWrite: false }));
    this.hlFill = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending }));
    for (const m of [this.hlBox, this.hlFill]) {
      m.visible = false;
      m.renderOrder = 10;
      this.group.add(m);
    }
  }

  /** Fuerza reconstrucción (nueva partida / carga). */
  reset(): void {
    this.hullKey = '';
    this.structKey = '';
    this.tintKey = '';
    this.siteKey = '';
    this.upgradeKey = '';
    this.hlKey = '';
    for (const b of this.levelBuilds) if (b) b.key = '';
    this.planned.clear();
    this.plannedStruct.clear();
    this.clearStaged();
    this.forceFull = true;
    for (const c of this.crates.values()) c.removeFromParent();
    this.crates.clear();
    this.particles.clear();
    this.emitAcc.clear();
  }

  /* ================================================================== */
  /* Sincronización por frame                                            */
  /* ================================================================== */

  sync(state: GameState, layout: ShipLayout, optsIn: ShipViewOptions, dtReal: number, camera: THREE.Camera): void {
    const opts: ShipViewOptions = this.debugOptions ? { ...optsIn, ...this.debugOptions } : optsIn;
    const dt = Math.min(0.1, Math.max(0, dtReal));
    this.t += dt;
    this.ensureLevels(layout.levels);

    // --- Reconstrucciones ---
    const hullKey = `${layout.length}|${layout.width}|${layout.levels}`;
    if (hullKey !== this.hullKey) {
      this.rebuildHull(layout);
      this.hullKey = hullKey;
      this.structKey = '';
    }
    let tiers = '';
    let dmg = '';
    for (const m of state.ship.modules) {
      if (m.status === 'construction') continue;
      const tint = moduleTint(m);
      const tier = moduleTier(m);
      if (tint !== 1) dmg += `${m.id}${m.status === 'broken' ? 'b' : 'd'},`;
      if (tier !== 1) tiers += `${m.id}t${tier},`;
    }
    const structKey = `${state.ship.revision}|${layout.revision}|${tiers}`;
    this.plannedNow = false;
    if (structKey !== this.structKey) {
      this.planLevels(state, layout);
      this.structKey = structKey;
      this.plannedNow = true;
    }
    if (this.planned.size) this.flushLevels(state, layout);
    // En los frames tranquilos se adelantan los modelos de las mejoras en obras (uno por frame):
    // así, al terminar la mejora, el cambio de nivel no tiene que construirlos.
    else if (this.warmQueue.length) this.warmQueue.shift()!();
    if (dmg !== this.tintKey) {
      this.applyTints(new Map(state.ship.modules.map((m) => [m.id, m])));
      this.tintKey = dmg;
    }
    // Obras y andamios de mejora: mientras haya niveles por sustituir se quedan como están, para que
    // la obra terminada desaparezca en el mismo frame en que aparece lo construido.
    const siteKey = `${layout.revision}|${layout.sites.map((s) => s.moduleId).join(',')}`;
    if (siteKey !== this.siteKey && !this.planned.size) {
      this.rebuildSites(state, layout);
      this.siteKey = siteKey;
    }
    let upKey = `${layout.revision}|`;
    for (const m of state.ship.modules) if (m.upgrade && m.status !== 'construction') upKey += `${m.id}:${m.upgrade.toTier},`;
    if (upKey !== this.upgradeKey && !this.planned.size) {
      this.rebuildUpgrades(state, layout);
      this.upgradeKey = upKey;
    }
    this.syncExpansion(state, layout);
    this.syncCrates(state);

    // --- Visibilidad por nivel / corte ---
    const maxLevel = this.maxVisibleLevel(layout, opts);
    this.levelGroups.forEach((g, l) => (g.visible = l <= maxLevel));

    // --- Luz del día y materiales ---
    const day = daylight(state.time);
    const gloom = Math.min(1, state.weather.cloudiness * 0.35 + state.weather.rain * 0.25 + state.weather.fog * 0.2);
    const night = THREE.MathUtils.clamp(1 - day * (1 - gloom), 0, 1);
    this.mats.update(night, this.t);

    // --- Dinámicos ---
    const lights: LightCandidate[] = [];
    const modById = new Map(state.ship.modules.map((m) => [m.id, m]));
    const ctx: DynContext = { state, module: undefined, t: this.t, dt, night, particles: this.particles, lights, mats: this.mats, maxLevel, layout };
    for (const d of this.dyns) {
      ctx.module = modById.get(d.prop.moduleId);
      d.update(ctx);
    }
    for (const s of this.sites.values()) {
      const p = siteProgress(state, s.moduleId);
      s.ghost.scale.y = Math.max(0.03, p);
      setProgress(s.bars, p);
    }
    for (const u of this.upgrades.values()) {
      const m = modById.get(u.moduleId);
      if (m?.upgrade) setProgress(u.bars, m.upgrade.progress);
    }
    this.fires.update(state, layout, this.t, dt, maxLevel, this.particles, lights);
    this.emitAmbient(state, layout, dt, maxLevel);
    const wind = this.apparentWind(state);
    this.particles.update(dt, wind, maxLevel);
    const windStrength = Math.min(1, wind.length() / 6);
    const windYaw = Math.atan2(-wind.z, wind.x);
    for (const f of this.flags) f.update(this.t, windStrength, windYaw);
    // La antena del mástil del puente solo gira con un radar y radio en marcha (como el módulo).
    if (this.radar) {
      const on = state.ship.modules.some((m) => radarActive(m));
      this.radarSpin += ((on ? 1.6 : 0) - this.radarSpin) * Math.min(1, dt * 0.8);
      this.radar.rotation.y += this.radarSpin * dt;
    }

    // --- Luces interiores ---
    for (const s of this.lightSpots) {
      const mod = s.moduleId !== null ? modById.get(s.moduleId) : undefined;
      const dim = mod && mod.status === 'broken' ? 0.4 : 1;
      const lounge = s.kind === 'room' && mod?.type === 'sala_comun';
      const intensity = s.kind === 'room' ? (3.2 + 4.5 * night) * (lounge ? 1.12 : 1) : s.kind === 'hold' ? 4.0 + 3.0 * night : night > 0.35 ? 4.5 * night : 0;
      lights.push({
        id: `${s.kind}:${s.x.toFixed(1)}:${s.y.toFixed(1)}:${s.z.toFixed(1)}`,
        x: s.x,
        y: s.y,
        z: s.z,
        level: s.level,
        intensity: intensity * dim,
        color: s.kind === 'hold' ? LANTERN_COLOR : lounge ? LOUNGE_COLOR : LAMP_COLOR,
        distance: s.kind === 'room' ? 8 : s.kind === 'hold' ? 10 : 9,
        priority: 0,
      });
    }
    // focos del palo: alumbran la cubierta de noche (alcance largo, prioridad alta)
    if (this.hull && night > 0.3) {
      const f = this.hull.anchors.floodlight;
      lights.push({ id: 'focos-cubierta', x: f.x, y: f.y, z: f.z, level: 1, intensity: 60 * night, color: FLOOD_COLOR, distance: 28, priority: 6 });
    }
    camera.getWorldPosition(_v);
    this.group.worldToLocal(_v);
    this.lightPool.update(lights, _v, maxLevel, dt);

    // --- Resaltado ---
    this.updateHighlight(state, layout, opts.highlight, maxLevel);
  }

  /** Nivel visible máximo según las opciones (corte y ocultación). */
  private maxVisibleLevel(layout: ShipLayout, opts: ShipViewOptions): number {
    let max = opts.hideAboveLevel ?? Infinity;
    if (opts.cutaway) max = Math.min(max, layout.levels - 1);
    return max;
  }

  private ensureLevels(levels: number): void {
    if (this.levels === levels && this.levelGroups.length) return;
    for (const b of this.levelBuilds) if (b) this.disposeLevel(b);
    this.levelBuilds = [];
    this.planned.clear();
    this.plannedStruct.clear();
    this.clearStaged();
    this.forceFull = true;
    for (const s of this.sites.values()) disposeObject(s.group);
    this.sites.clear();
    for (const e of this.props.values()) {
      e.dyn?.dispose();
      e.proxy.removeFromParent();
    }
    this.props.clear();
    this.dyns = [];
    this.lightSpots = [];
    this.radar = null;
    this.chimneyTop = null;
    for (const u of this.upgrades.values()) disposeObject(u.group);
    this.upgrades.clear();
    this.upgradeKey = '';
    for (const g of this.levelGroups) g.removeFromParent();
    this.levelGroups = [];
    for (let l = 0; l <= levels; l++) {
      const g = new THREE.Group();
      g.name = `nivel-${l}`;
      this.group.add(g);
      this.levelGroups.push(g);
    }
    this.levels = levels;
    // todo lo que colgaba de los grupos anteriores se reconstruye en los nuevos
    this.hullKey = '';
    this.structKey = '';
    this.siteKey = '';
    if (this.expansion) {
      disposeObject(this.expansion.object);
      this.expansion = null;
    }
  }

  private levelGroup(l: number): THREE.Group {
    return this.levelGroups[THREE.MathUtils.clamp(l, 0, this.levelGroups.length - 1)]!;
  }

  /* ================================================================== */
  /* Casco                                                               */
  /* ================================================================== */

  private rebuildHull(layout: ShipLayout): void {
    for (const o of this.hullObjs) disposeObject(o);
    this.hullObjs = [];
    for (const f of this.flags) f.dispose();
    this.flags = [];
    const h = buildHull({ length: layout.length, width: layout.width });
    this.hull = h;
    this.forceFull = true;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, level: number, shadow: boolean, name: string): THREE.Mesh | null => {
      if (!geo.getAttribute('position') || geo.getAttribute('position').count === 0) {
        geo.dispose();
        return null;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      this.levelGroup(level).add(mesh);
      this.hullObjs.push(mesh);
      return mesh;
    };
    add(h.hull, this.mats.hull, 0, true, 'casco');
    add(h.upper, this.mats.solid, 1, true, 'casco-cubierta');
    add(h.portFrames, this.mats.solid, 0, false, 'ojos-de-buey');
    add(h.portGlass, this.mats.glassOut, 0, false, 'ojos-de-buey-cristal');
    add(h.portGlassIn, this.mats.portIn, 0, false, 'ojos-de-buey-interior');
    add(h.beacons, this.mats.beacon, 1, false, 'luces-navegacion');
    add(h.floodGlass, this.mats.lamp, 1, false, 'focos-cubierta');
    // rótulos con el nombre
    for (const np of h.nameplates) {
      const tex = nameTexture(np.text, np.sub, np.w / np.h);
      if (!tex) continue;
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(np.w, np.h), mat);
      mesh.position.copy(np.pos);
      mesh.rotation.y = np.yaw;
      mesh.name = 'rotulo';
      mesh.userData.ownMaterial = true;
      this.levelGroup(0).add(mesh);
      this.hullObjs.push(mesh);
    }
    // banderas
    const stern = new Flag(1.3, 0.85, ['#2a9d8f', '#f3ead6', '#c8553d', '#f3ead6', '#2a9d8f']);
    stern.mesh.position.copy(h.anchors.flagPole).add(new THREE.Vector3(0, -0.05, 0));
    stern.mesh.rotation.y = Math.PI;
    this.levelGroup(1).add(stern.mesh);
    const mast = new Flag(1.6, 0.42, ['#e0a458', '#c8553d'], true);
    mast.mesh.position.copy(h.anchors.mastTop).add(new THREE.Vector3(0, -0.2, 0));
    mast.mesh.rotation.y = Math.PI;
    this.levelGroup(1).add(mast.mesh);
    this.flags.push(stern, mast);
    this.hullObjs.push(stern.mesh, mast.mesh);
    this.stats.hullRebuilds++;
  }

  /* ================================================================== */
  /* Estructura y props                                                  */
  /* ================================================================== */

  /**
   * Firmas de la ESTRUCTURA de un nivel, una por columna de celdas (`chunkOfX`; una sola en el nivel
   * de los techos): lo que lee buildStructure de esa columna y de sus dos vecinas (celdas del nivel
   * y del de abajo, paredes, puertas, escaleras, losas, la planta de los muebles que tocan paredes,
   * puertas o faroles, y el tipo de las habitaciones). No incluye daños: el tinte va aparte.
   */
  structSignatures(l: number, state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>): string[] {
    const top = l === layout.levels;
    const n = top ? 1 : layout.length;
    const buckets: string[][] = Array.from({ length: n }, () => []);
    const add = (cx: number, item: string): void => void buckets[top ? 0 : Math.max(0, Math.min(n - 1, cx))]!.push(item);
    const type = (id: number | null): string => (id === null ? '' : (modules.get(id)?.type ?? '-'));
    const cells = (lv: number, ids: boolean): void => {
      if (lv < 0 || lv >= layout.levels) return;
      for (let x = 0; x < layout.length; x++) {
        let s = `c${lv}:`;
        for (let z = 0; z < layout.width; z++) {
          const c = layout.cells[lv]![x]![z]!;
          s += KIND_CODE[c.kind];
          // de las habitaciones importa su tipo (estilo) y, en el propio nivel, su id (luces)
          if (c.kind === 'room') s += `${type(c.moduleId)}${ids ? `#${c.moduleId}` : ''}`;
          s += ',';
        }
        add(x, s);
      }
    };
    cells(l, true);
    cells(l - 1, false);
    if (l === 0 && layout.levels > 1) {
      // los faroles de la bodega se apartan de las escaleras que bajan del nivel 1
      for (let x = 0; x < layout.length; x++) for (let z = 0; z < layout.width; z++) if (layout.cells[1]![x]![z]!.kind === 'stairHigh') add(x, `e${z}`);
    }
    for (const sl of layout.slabs) if (sl.level === l) add(sl.x, `s${sl.kind}${sl.x},${sl.z},${sl.kind === 'roomFloor' || sl.kind === 'top' ? `${sl.moduleId}${type(sl.moduleId)}` : ''}`);
    for (const w of layout.walls) if (w.level === l) add(chunkOfX(layout.length, (w.x0 + w.x1) / 2), `w${w.kind}${w.x0},${w.z0},${w.x1},${w.z1},${w.nx},${w.nz},${w.y0},${w.y1},${w.exterior ? 1 : 0},${w.moduleId ?? ''}${type(w.moduleId)}`);
    for (const d of layout.doors) if (d.level === l) add(chunkOfX(layout.length, d.x), `d${d.axis}${d.x},${d.z},${d.width},${d.moduleId ?? ''}${type(d.moduleId)}`);
    for (const r of layout.ramps) if (r.level === l) add(r.x, `r${r.moduleId},${r.x},${r.z},${r.dx},${r.dz}`);
    for (const p of layout.props) if (propLevel(p, layout) === l && affectsStructure(p, layout, l)) add(chunkOfX(layout.length, p.x), `f${p.kind}${p.x.toFixed(2)},${p.z.toFixed(2)},${p.y.toFixed(2)},${p.hx},${p.hz},${p.height}`);
    if (top) {
      const b = state.ship.modules.find((m) => m.type === 'puente' && m.status !== 'construction');
      add(0, b ? `b${b.id}:${b.level},${b.x},${b.z},${b.rot}` : 'b-');
    }
    const joined = buckets.map((b) => b.join(';'));
    const dims = `${layout.length}x${layout.width}x${layout.levels}`;
    return joined.map((_, c) => `${dims}#${joined[c - 1] ?? ''}#${joined[c]}#${joined[c + 1] ?? ''}`);
  }

  /**
   * Firma completa de un nivel: la estructura más sus props (con la variante de su nivel de mejora)
   * y los módulos mejorados (placa de latón, altillo). Si no cambia, el nivel no se toca.
   */
  levelSignature(l: number, state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>, structSigs = this.structSignatures(l, state, layout, modules)): string {
    const parts = [...structSigs];
    for (const p of layout.props) {
      if (propLevel(p, layout) !== l) continue;
      const m = modules.get(p.moduleId);
      parts.push(`p${p.key}:${p.kind}:${p.moduleType}:${m ? propTier(p.kind, p.moduleType, moduleTier(m)) : 1}:${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)},${p.yaw.toFixed(4)},${p.interact ?? ''},${p.index}`);
    }
    for (const m of state.ship.modules) if (m.level === l && m.status !== 'construction' && moduleTier(m) > 1) parts.push(`t${m.id}:${m.type}:${moduleTier(m)}`);
    return parts.join('|');
  }

  /** Marca los niveles cuya firma ha cambiado. */
  private planLevels(state: GameState, layout: ShipLayout): void {
    const modules = new Map(state.ship.modules.map((m) => [m.id, m]));
    this.planned.clear();
    this.plannedStruct.clear();
    for (let l = 0; l <= layout.levels; l++) {
      const ss = this.structSignatures(l, state, layout, modules);
      const sig = this.levelSignature(l, state, layout, modules, ss);
      if (sig !== this.levelBuilds[l]?.key) {
        this.planned.set(l, sig);
        this.plannedStruct.set(l, ss);
      }
    }
    for (const [l, st] of this.staged) {
      if (this.planned.has(l)) continue;
      for (const c of st.values()) disposeChunk(c);
      this.staged.delete(l);
    }
    for (const l of [...this.prebaked.keys()]) if (!this.planned.has(l)) this.clearPrebaked(l);
    if (this.planned.size) this.stats.rebuilds++;
  }

  /**
   * Adelanta las columnas de estructura de los niveles pendientes dentro del presupuesto del frame
   * (al menos una) y, cuando están todas, sustituye todos esos niveles a la vez.
   */
  private flushLevels(state: GameState, layout: ShipLayout): void {
    const t0 = now();
    const instant = this.forceFull || this.rebuildBudgetMs === Infinity;
    // El frame del cambio ya carga con la simulación que lo produce y con el cálculo de firmas: el
    // trabajo adelantado empieza en el siguiente.
    if (!instant && this.plannedNow && !this.skippedLast) {
      this.skippedLast = true;
      this.stats.stagedFrames++;
      return;
    }
    this.skippedLast = false;
    const modules = new Map(state.ship.modules.map((m) => [m.id, m]));
    const levels = [...this.planned.keys()].sort((a, b) => a - b);
    const deadline = instant ? Infinity : t0 + this.rebuildBudgetMs;
    const frame = { built: 0 };
    for (const l of levels) {
      if (this.stageStructure(l, this.plannedStruct.get(l) ?? this.structSignatures(l, state, layout, modules), state, layout, modules, deadline, frame)) continue;
      this.stats.stagedFrames++;
      return;
    }
    const bakes = this.stats.solidBakes + this.stats.furnitureBakes;
    this.bakedVertices = 0;
    for (const l of levels) this.rebuildLevel(l, this.planned.get(l)!, state, layout, modules);
    this.planned.clear();
    this.plannedStruct.clear();
    this.forceFull = false;
    this.dyns = [];
    for (const e of this.props.values()) if (e.dyn) this.dyns.push(e.dyn);
    this.lightSpots = this.levelBuilds.flatMap((b) => b?.lights ?? []);
    this.stats.triangles = this.levelBuilds.reduce((a, b) => a + (b ? b.structTris + b.propTris : 0), 0);
    this.stats.staticMeshes = this.levelBuilds.reduce((a, b) => a + (b ? b.structMeshes + b.propMeshes : 0), 0);
    this.stats.levelRebuilds += levels.length;
    this.stats.lastRebuildLevels = levels.length;
    this.stats.lastRebuildMs = now() - t0;
    this.stats.lastBakedVertices = this.stats.solidBakes + this.stats.furnitureBakes > bakes ? this.bakedVertices : 0;
    this.hlKey = '';
  }

  /**
   * Prepara (sin tocar la escena) lo que le falta al nivel `l` mientras quede presupuesto en el
   * frame: primero sus columnas de estructura nuevas y después la fusión de los grupos de estructura
   * y de muebles que cambian. Devuelve si ya está todo. El nivel de los techos, una sola columna que
   * además pone la chimenea y el radar en la escena, se construye al sustituirlo.
   */
  private stageStructure(l: number, keys: string[], state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>, deadline: number, frame: { built: number }): boolean {
    if (l === layout.levels) return true;
    // ¿No cabe otra unidad de trabajo en el presupuesto? (siempre se hace al menos una por frame)
    const out = (unit: number): boolean => frame.built > 0 && now() + unit > deadline;
    /** Cronometra una unidad y actualiza su coste medio. */
    const timed = <T>(kind: 'chunk' | 'bake', fn: () => T): T => {
      const t = now();
      const r = fn();
      this.unitMs[kind] += (now() - t - this.unitMs[kind]) * 0.3;
      frame.built++;
      return r;
    };
    const build = this.levelBuilds[l];
    const prev = build?.struct ?? [];
    let st = this.staged.get(l);
    if (!st) this.staged.set(l, (st = new Map()));
    const chunks: StructCache[] = [];
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c]!;
      let chunk = prev[c]?.key === key ? prev[c]! : st.get(c)?.key === key ? st.get(c)! : null;
      if (!chunk) {
        if (out(this.unitMs.chunk)) return false;
        const old = st.get(c);
        if (old) disposeChunk(old);
        st.set(c, (chunk = timed('chunk', () => this.buildStructChunk(l, c, key, state, layout, modules))));
      }
      chunks.push(chunk);
    }
    let pre = this.prebaked.get(l);
    if (!pre) this.prebaked.set(l, (pre = { solid: new Map(), furn: new Map() }));
    for (const [g, group] of groupChunks(chunks)) {
      const cur = build?.solid.get(g);
      if (cur && sameChunks(cur.chunks, group)) continue;
      const ready = pre.solid.get(g);
      if (ready && sameChunks(ready.chunks, group)) continue;
      if (out(this.unitMs.bake)) return false;
      ready?.baked.geo?.dispose();
      pre.solid.set(g, { chunks: group, key: '', ...timed('bake', () => bakeSolid(group)) });
      this.stats.prebakes++;
    }
    const modelOf = this.modelGetter(modules);
    for (const plan of this.furniturePlans(l, state, layout, modelOf).groups.values()) {
      const key = plan.sig.join('|');
      if (build?.furn.get(plan.index)?.key === key) continue;
      const ready = pre.furn.get(plan.index);
      if (ready?.key === key) continue;
      if (out(this.unitMs.bake)) return false;
      ready?.baked.geo?.dispose();
      pre.furn.set(plan.index, { chunks: [], key, baked: timed('bake', () => this.bakeFurniture(plan, layout, modelOf)), ids: plan.ids });
      this.stats.prebakes++;
    }
    return true;
  }

  /** Libera lo preparado por adelantado para un nivel (o para todos) que no se ha llegado a usar. */
  private clearPrebaked(l?: number): void {
    for (const [k, pre] of this.prebaked) {
      if (l !== undefined && k !== l) continue;
      for (const e of [...pre.solid.values(), ...pre.furn.values()]) e.baked.geo?.dispose();
      this.prebaked.delete(k);
    }
  }

  /** Libera las columnas y fusiones adelantadas que no se han llegado a mostrar. */
  private clearStaged(): void {
    for (const st of this.staged.values()) for (const c of st.values()) disposeChunk(c);
    this.staged.clear();
    this.clearPrebaked();
  }

  /**
   * Oscurece los módulos dañados cambiando solo los colores de la malla sólida de cada nivel
   * (con la etiqueta de módulo de cada vértice): una tormenta que daña módulos no reconstruye nada.
   */
  private applyTints(modules: Map<number, ModuleInstance>, only?: TintMesh): void {
    for (const b of only ? [only] : this.levelBuilds.flatMap((lb) => lb?.tinted ?? [])) {
      let changed = false;
      const want = new Map<number, number>();
      for (const id of b.tints.keys()) {
        const t = moduleTint(modules.get(id));
        want.set(id, t);
        if (t !== b.tints.get(id)) changed = true;
      }
      if (!changed) continue;
      const col = b.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
      const out = col.array as Float32Array;
      const base = b.base;
      const tags = b.tags;
      for (let v = 0; v < tags.length; v++) {
        const id = tags[v]!;
        if (id < 0) continue;
        const t = want.get(id) ?? 1;
        const i = v * 3;
        out[i] = base[i]! * t;
        out[i + 1] = base[i + 1]! * t;
        out[i + 2] = base[i + 2]! * t;
      }
      col.needsUpdate = true;
      b.tints = want;
      this.stats.tintPasses++;
    }
  }

  /**
   * Estructura de un nivel por columnas de celdas: las columnas cuya firma no ha cambiado se
   * reutilizan tal cual; solo se construyen las que cambian (y su chimenea y radar en el techo).
   */
  private levelStructure(l: number, keys: string[], state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>): { chunks: StructCache[]; changed: boolean } {
    const prev = this.levelBuilds[l]?.struct ?? [];
    const top = layout.levels;
    const out: StructCache[] = [];
    const reused = new Set<StructCache>();
    const staged = this.staged.get(l);
    keys.forEach((key, c) => {
      const cached = prev[c];
      if (cached && cached.key === key) {
        reused.add(cached);
        out.push(cached);
        return;
      }
      const ready = staged?.get(c);
      if (ready && ready.key === key) {
        staged!.delete(c);
        out.push(ready);
        return;
      }
      out.push(this.buildStructChunk(l, top === l ? undefined : c, key, state, layout, modules));
    });
    if (staged) for (const c of staged.values()) disposeChunk(c);
    this.staged.delete(l);
    for (const p of prev) if (!reused.has(p)) disposeChunk(p);
    return { chunks: out, changed: reused.size !== out.length || prev.length !== out.length };
  }

  /** Construye la estructura de una columna (o del nivel de los techos entero, con el puente). */
  private buildStructChunk(l: number, chunk: number | undefined, key: string, state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>): StructCache {
    this.stats.structRebuilds++;
    const top = layout.levels;
    // Constructores reutilizados (conservan su capacidad: sin crecer ni basura en cada cambio).
    const lb = this.pool;
    for (const b of [lb.solid, lb.glassOut, lb.glassIn, lb.lamps, lb.lanterns]) b.clear();
    const builders: LevelBuilders[] = new Array<LevelBuilders>(layout.levels + 1).fill(lb);
    // sin tinte: los daños se aplican después sobre los colores (applyTints)
    const { lights } = buildStructure({ layout, modules, tintOf: () => 1, levels: builders, only: l, chunk });
    if (l === top) {
      if (this.radar) disposeObject(this.radar);
      this.radar = null;
      this.chimneyTop = null;
      // Chimenea y radar sobre el puente (techo superior).
      const bridge = state.ship.modules.find((m) => m.type === 'puente' && m.status !== 'construction');
      if (bridge) {
        const cells = moduleCells(bridge).filter((c) => c.level === bridge.level);
        cells.sort((a, b) => a.x - b.x);
        const aft = cells[0]!;
        const fwd = cells[cells.length - 1]!;
        const yTop = levelY(bridge.level + 1) + 0.05;
        const a = cellMin(aft.x, aft.z, layout.width);
        const f = cellMin(fwd.x, fwd.z, layout.width);
        if (layout.cells[layout.levels - 1]?.[aft.x]?.[aft.z]?.kind === 'room' && bridge.level === layout.levels - 1) {
          this.chimneyTop = funnel(lb.solid, a.x + CELL / 2, yTop, a.z + CELL / 2);
          const rp = radarMast(lb.solid, f.x + CELL / 2 + (fwd.x === aft.x ? 0 : 0.5), yTop, f.z + CELL / 2);
          const rg = new GeoBuilder();
          rg.box(-0.6, 0, -0.06, 0.6, 0.08, 0.06, '#2b2d42');
          rg.box(-0.05, -0.08, -0.05, 0.05, 0.0, 0.05, '#5c6770');
          this.radar = new THREE.Mesh(rg.build(), this.mats.solid);
          this.radar.position.copy(rp);
          this.radar.castShadow = true;
          this.radar.userData.ownGeometry = true;
          this.radar.name = 'radar';
          this.levelGroup(top).add(this.radar);
        }
      }
    }
    const tags = lb.solid.tags();
    const ids = new Set<number>();
    const geos = [lb.solid, lb.glassOut, lb.glassIn, lb.lamps, lb.lanterns].map((b) => {
      const g = b.build(false);
      if (g.getAttribute('position').count) g.computeBoundingBox();
      return g;
    });
    let last = -1;
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i]!;
      if (t !== last) {
        if (t >= 0) ids.add(t);
        last = t;
      }
    }
    return { key, solid: geos[0]!, tags, tagIds: [...ids], glassOut: geos[1]!, glassIn: geos[2]!, lamps: geos[3]!, lanterns: geos[4]!, lights };
  }

  /**
   * Rehace un nivel: estructura (de la caché si no ha cambiado), props con su nivel de mejora y
   * detalles de módulo, y lo fusiona por material. Los objetos de los props que no han cambiado
   * (con sus partes animadas) se conservan. El sólido de la estructura y los muebles van en grupos
   * de `GROUP_COLS` columnas: solo se vuelven a fusionar (y a subir a la GPU) los grupos que han
   * cambiado; una mejora toca un grupo de muebles y una obra los de sus columnas. Las fusiones
   * escriben cada vértice ya colocado en su búfer final (ship/bake.ts).
   */
  private rebuildLevel(l: number, key: string, state: GameState, layout: ShipLayout, modules: Map<number, ModuleInstance>): void {
    const old = this.levelBuilds[l];
    const ts = now();
    const { chunks: struct, changed: structChanged } = this.levelStructure(l, this.plannedStruct.get(l) ?? this.structSignatures(l, state, layout, modules), state, layout, modules);
    this.stats.lastStructMs = now() - ts;
    const newStruct = !old || structChanged || !old.structObjs.length;
    if (old) {
      for (const o of old.propObjs) disposeObject(o);
      if (newStruct) for (const o of old.structObjs) if (o !== this.radar) disposeObject(o);
    }

    // Objetos de los props (con sus partes animadas): se reutilizan si no cambian.
    const modelOf = this.modelGetter(modules);
    const seen = new Set<string>();
    for (const p of layout.props) {
      if (propLevel(p, layout) !== l) continue;
      const model = modelOf(p);
      seen.add(p.key);
      const prev = this.props.get(p.key);
      if (prev && prev.level === l && prev.model === model && samePlacement(prev.inst, p)) {
        prev.inst = p;
        continue;
      }
      if (prev) {
        prev.dyn?.dispose();
        prev.proxy.removeFromParent();
      }
      const proxy = new THREE.Group();
      proxy.name = `prop-${p.key}`;
      proxy.position.set(p.x, p.y, p.z);
      proxy.rotation.y = p.yaw;
      proxy.userData = { key: p.key, kind: p.kind, moduleId: p.moduleId, interact: p.interact, index: p.index };
      const d = localDims(p);
      const pick = new THREE.Mesh(this.pickGeo, this.pickMat);
      pick.name = 'seleccion';
      pick.scale.set(Math.max(0.2, d.hx * 2), Math.max(0.1, d.h), Math.max(0.2, d.hz * 2));
      pick.position.y = Math.max(0.1, d.h) / 2;
      pick.userData = proxy.userData;
      proxy.add(pick);
      const cell = getCell(layout, l, Math.floor((p.x + SHIP_ORIGIN_X) / CELL), Math.floor((p.z + (layout.width * CELL) / 2) / CELL));
      const ceiling = cell?.indoor ? WALL_H : null;
      const dyn = createDynamic(p, proxy, model, l, this.mats, ceiling);
      this.levelGroup(l).add(proxy);
      this.props.set(p.key, { inst: p, model, proxy, level: l, dyn });
    }
    for (const [k, e] of this.props) {
      if (e.level !== l || seen.has(k)) continue;
      e.dyn?.dispose();
      e.proxy.removeFromParent();
      this.props.delete(k);
    }

    // Mallas fusionadas por material: estructura (reutilizada si no ha cambiado) y muebles.
    const mk = (geo: THREE.BufferGeometry | null, mat: THREE.Material, shadow: boolean, name: string, into: THREE.Object3D[] | null): THREE.Mesh | null => {
      if (!geo) return null;
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.userData.ownGeometry = true;
      this.levelGroup(l).add(mesh);
      into?.push(mesh);
      return mesh;
    };
    const count = (objs: THREE.Object3D[]): [number, number] => {
      let tris = 0;
      for (const o of objs) if (o instanceof THREE.Mesh && o !== this.radar) tris += o.geometry.getAttribute('position').count / 3;
      return [tris, objs.filter((o) => o !== this.radar).length];
    };
    /** Tinte de daños de una malla sólida: sus colores sin oscurecer y el módulo de cada vértice. */
    const tintable = (mesh: THREE.Mesh | null, tags: Int32Array | null, ids: Map<number, number>): TintMesh | null =>
      mesh && tags ? { mesh, base: (mesh.geometry.getAttribute('color').array as Float32Array).slice(), tags, tints: ids } : null;
    const tinted: TintMesh[] = [];
    const fresh: TintMesh[] = [];
    const pre = this.prebaked.get(l);
    /** Malla nueva de un grupo (de lo fusionado por adelantado, si lo hay). */
    const place = (made: { baked: Baked; ids: Map<number, number> }, name: string, key: string, chunks: StructCache[]): BakedGroup => {
      const mesh = mk(made.baked.geo, this.mats.solid, true, name, null);
      const tint = tintable(mesh, made.baked.tags, made.ids);
      if (tint) fresh.push(tint);
      this.bakedVertices += made.baked.vertices;
      return { key, chunks, mesh, tint, tris: made.baked.vertices / 3 };
    };

    // Estructura: el sólido por grupos de columnas (solo se fusionan de nuevo los grupos con alguna
    // columna nueva); el cristal exterior y los faroles, pocas piezas, enteros si cambia alguna.
    const solid = new Map<number, BakedGroup>();
    const beforeSolid = old?.solid ?? new Map<number, BakedGroup>();
    for (const [g, chunks] of groupChunks(struct)) {
      const prev = beforeSolid.get(g);
      if (prev && sameChunks(prev.chunks, chunks)) {
        solid.set(g, prev);
        if (prev.tint) tinted.push(prev.tint);
        continue;
      }
      const ready = pre?.solid.get(g);
      const made = ready && sameChunks(ready.chunks, chunks) ? ready : bakeSolid(chunks);
      pre?.solid.delete(g);
      if (made !== ready) ready?.baked.geo?.dispose();
      solid.set(g, place(made, `nivel-${l}-solido-${g}`, '', chunks));
      this.stats.solidBakes++;
    }
    for (const [g, prev] of beforeSolid) if (solid.get(g) !== prev && prev.mesh) disposeObject(prev.mesh);
    let structObjs: THREE.Object3D[];
    if (newStruct) {
      structObjs = [];
      mk(bakeParts(struct.map((c) => ({ geo: c.glassOut }))).geo, this.mats.glassOut, false, `nivel-${l}-cristal-ext`, structObjs);
      mk(bakeParts(struct.map((c) => ({ geo: c.lanterns }))).geo, this.mats.lantern, false, `nivel-${l}-faroles`, structObjs);
      if (l === layout.levels && this.radar) structObjs.push(this.radar);
    } else structObjs = old!.structObjs;

    // Muebles por grupos: los que no han cambiado se conservan tal cual (malla y tinte).
    const { groups, glass, glow } = this.furniturePlans(l, state, layout, modelOf);
    const furn = new Map<number, BakedGroup>();
    const before = old?.furn ?? new Map<number, BakedGroup>();
    for (const plan of groups.values()) {
      const gk = plan.sig.join('|');
      const prev = before.get(plan.index);
      if (prev && prev.key === gk) {
        furn.set(plan.index, prev);
        if (prev.tint) tinted.push(prev.tint);
        continue;
      }
      const ready = pre?.furn.get(plan.index);
      const made = ready?.key === gk ? ready : { baked: this.bakeFurniture(plan, layout, modelOf), ids: plan.ids };
      pre?.furn.delete(plan.index);
      if (made !== ready) ready?.baked.geo?.dispose();
      furn.set(plan.index, place(made, `nivel-${l}-muebles-${plan.index}`, gk, []));
      this.stats.furnitureBakes++;
    }
    for (const [g, prev] of before) if (furn.get(g) !== prev && prev.mesh) disposeObject(prev.mesh);
    this.clearPrebaked(l);
    // cristal interior y lámparas (estructura y props, en la misma malla): pocas piezas, siempre
    const propObjs: THREE.Object3D[] = [];
    mk(bakeParts([...struct.map((c) => ({ geo: c.glassIn })), ...glass]).geo, this.mats.glassIn, false, `nivel-${l}-cristal-int`, propObjs);
    mk(bakeParts([...struct.map((c) => ({ geo: c.lamps })), ...glow]).geo, this.mats.lamp, false, `nivel-${l}-lamparas`, propObjs);

    let [structTris, structMeshes] = count(structObjs);
    for (const f of solid.values()) {
      if (!f.mesh) continue;
      structTris += f.tris;
      structMeshes++;
    }
    let [propTris, propMeshes] = count(propObjs);
    for (const f of furn.values()) {
      if (!f.mesh) continue;
      propTris += f.tris;
      propMeshes++;
    }
    tinted.push(...fresh);
    const build: LevelBuild = { key, lights: struct.flatMap((c) => c.lights), struct, structObjs, solid, propObjs, furn, structTris, structMeshes, propTris, propMeshes, tinted };
    this.levelBuilds[l] = build;
    for (const t of fresh) this.applyTints(modules, t);
  }

  /** Modelo de cada prop con el nivel de mejora de su módulo (memorizado mientras dure la llamada). */
  private modelGetter(modules: Map<number, ModuleInstance>): (p: PropInstance) => PropModel {
    const models = new Map<PropInstance, PropModel>();
    return (p) => {
      let mm = models.get(p);
      if (!mm) {
        const mod = modules.get(p.moduleId);
        mm = propModel(p.kind, localDims(p), mod ? moduleTier(mod) : 1, p.moduleType);
        models.set(p, mm);
      }
      return mm;
    };
  }

  /**
   * Muebles de un nivel por grupos de columnas: piezas colocadas, firma (modelo y colocación de
   * cada prop; de los módulos mejorados, todo lo que leen su placa de latón y su altillo) y módulos
   * mejorados de cada grupo; y el cristal y las luces de los props.
   */
  private furniturePlans(l: number, state: GameState, layout: ShipLayout, modelOf: (p: PropInstance) => PropModel): { groups: Map<number, FurnPlan>; glass: BakePart[]; glow: BakePart[] } {
    const groups = new Map<number, FurnPlan>();
    const groupAt = (x: number): FurnPlan => {
      const g = Math.floor(chunkOfX(layout.length, x) / GROUP_COLS);
      let e = groups.get(g);
      if (!e) groups.set(g, (e = { index: g, parts: [], sig: [], ids: new Map(), decor: [] }));
      return e;
    };
    const glass: BakePart[] = [];
    const glow: BakePart[] = [];
    for (const p of layout.props) {
      if (propLevel(p, layout) !== l) continue;
      const model = modelOf(p);
      const fg = groupAt(p.x);
      fg.parts.push({ geo: model.solid, yaw: p.yaw, x: p.x, y: p.y, z: p.z, tag: p.moduleId });
      fg.sig.push(`${p.key}@${p.moduleId}@${this.modelId(model)}@${p.x},${p.y},${p.z},${p.yaw}`);
      fg.ids.set(p.moduleId, 1);
      if (model.glass) glass.push({ geo: model.glass, yaw: p.yaw, x: p.x, y: p.y, z: p.z });
      if (model.glow) glow.push({ geo: model.glow, yaw: p.yaw, x: p.x, y: p.y, z: p.z });
    }
    // Detalles del nivel de mejora a escala de módulo (placa de latón, altillo del almacén), en el
    // grupo de su módulo; su firma recoge todo lo que leen (módulo, sus muebles y las puertas).
    let doorSig: string | null = null;
    for (const m of state.ship.modules) {
      if (m.level !== l || m.status === 'construction' || moduleTier(m) < 2) continue;
      const cells = moduleCells(m).filter((c) => c.level === m.level);
      let cx = 0;
      for (const c of cells) cx += cellMin(c.x, c.z, layout.width).x + CELL / 2;
      const fg = groupAt(cells.length ? cx / cells.length : 0);
      doorSig ??= layout.doors.filter((d) => d.level === l).map((d) => `${d.axis}${d.x},${d.z},${d.width},${d.moduleId ?? ''}`).join(';');
      let sig = `t${m.id}:${m.type}:${moduleTier(m)}:${m.level},${m.x},${m.z},${m.rot}:`;
      for (const p of layout.props) if (p.moduleId === m.id) sig += `${p.key}@${this.modelId(modelOf(p))}@${p.x},${p.y},${p.z},${p.yaw},${p.hx},${p.hz},${p.height},${p.interact ?? ''};`;
      fg.sig.push(`${sig}|${doorSig}`);
      fg.decor.push(m);
      fg.ids.set(m.id, 1);
    }
    return { groups, glass, glow };
  }

  /** Fusiona un grupo de muebles: placas y altillos de sus módulos mejorados delante, y sus props. */
  private bakeFurniture(plan: FurnPlan, layout: ShipLayout, modelOf: (p: PropInstance) => PropModel): Baked {
    const parts = plan.parts;
    if (plan.decor.length) {
      const decor = this.decorPool;
      decor.clear();
      for (const m of plan.decor) {
        decor.tag = m.id;
        tierPlaque(decor, m, layout, layout.props, modelOf);
        storeLoft(decor, m, layout, layout.props);
      }
      if (!decor.isEmpty()) {
        const dg = decor.build(false);
        const baked = bakeParts([{ geo: dg, tags: decor.tags() }, ...parts], true);
        dg.dispose();
        return baked;
      }
    }
    return bakeParts(parts, true);
  }

  /** Número estable de cada modelo de prop (firma de los grupos de muebles). */
  private modelId(m: PropModel): number {
    let id = this.modelIds.get(m);
    if (id === undefined) this.modelIds.set(m, (id = ++this.modelSeq));
    return id;
  }

  /* ================================================================== */
  /* Obras, ampliación y cajas                                           */
  /* ================================================================== */

  /**
   * Obras de los módulos en construcción: solo se crean las nuevas y se retiran las terminadas o
   * canceladas; las demás se conservan mientras no cambie lo que dibujan (empezar una obra en un
   * barco con varias en marcha las rehacía todas, ~8 ms).
   */
  private rebuildSites(state: GameState, layout: ShipLayout): void {
    const modules = new Map(state.ship.modules.map((m) => [m.id, m]));
    const keep = new Set<number>();
    for (const site of layout.sites) {
      const m = modules.get(site.moduleId);
      const key = `${site.type}|${layout.width}|${m ? `${m.level},${m.x},${m.z},${m.rot}` : '-'}|${site.cells.map((c) => `${c.level},${c.x},${c.z}`).join(';')}`;
      keep.add(site.moduleId);
      const old = this.sites.get(site.moduleId);
      if (old && old.group.userData.siteKey === key) continue;
      if (old) disposeObject(old.group);
      const e = buildSite(site, m, layout, this.mats);
      e.group.userData.siteKey = key;
      this.levelGroup(e.level).add(e.group);
      this.sites.set(site.moduleId, e);
      this.stats.siteBuilds++;
    }
    for (const [id, e] of this.sites) {
      if (keep.has(id)) continue;
      disposeObject(e.group);
      this.sites.delete(id);
    }
  }

  /** Obras de mejora (`module.upgrade`): andamio ligero y cartel con la barra de progreso. */
  private rebuildUpgrades(state: GameState, layout: ShipLayout): void {
    for (const u of this.upgrades.values()) disposeObject(u.group);
    this.upgrades.clear();
    for (const m of state.ship.modules) {
      if (!m.upgrade || m.status === 'construction') continue;
      const e = buildUpgradeSite(m, layout, layout.props, this.mats);
      const toTier = m.upgrade.toTier;
      for (const p of layout.props) if (p.moduleId === m.id) this.warmQueue.push(() => void propModel(p.kind, localDims(p), toTier, p.moduleType));
      if (!e) continue;
      this.levelGroup(e.level).add(e.group);
      this.upgrades.set(m.id, e);
    }
  }

  private syncExpansion(state: GameState, layout: ShipLayout): void {
    const want = !!state.ship.expansion;
    const key = `${layout.length}`;
    if (want && (!this.expansion || this.expansion.object.userData.key !== key)) {
      if (this.expansion) disposeObject(this.expansion.object);
      this.expansion = buildExpansionScaffold(layout.length, layout.width, this.mats);
      this.expansion.object.userData.key = key;
      this.levelGroup(1).add(this.expansion.object);
    } else if (!want && this.expansion) {
      disposeObject(this.expansion.object);
      this.expansion = null;
    }
    if (this.expansion && state.ship.expansion) setProgress(this.expansion.bars, state.ship.expansion.progress);
  }

  private syncCrates(state: GameState): void {
    const alive = new Set<number>();
    for (const c of state.crates) {
      alive.add(c.id);
      let mesh = this.crates.get(c.id);
      const level = levelOfY(c.pos.y);
      if (!mesh) {
        mesh = new THREE.Mesh(this.crateGeo, this.mats.solid);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = `caja-${c.id}`;
        mesh.userData = { crateId: c.id };
        mesh.rotation.y = hash01(c.id, 3) * Math.PI;
        this.crates.set(c.id, mesh);
      }
      if (mesh.parent !== this.levelGroup(level)) this.levelGroup(level).add(mesh);
      mesh.position.set(c.pos.x, c.pos.y, c.pos.z);
    }
    for (const [id, mesh] of this.crates) {
      if (!alive.has(id)) {
        mesh.removeFromParent();
        this.crates.delete(id);
      }
    }
  }

  /* ================================================================== */
  /* Humo de chimenea y averías                                          */
  /* ================================================================== */

  private apparentWind(state: GameState): THREE.Vector3 {
    const v = state.voyage;
    const moving = v.anchoredUntil === null ? (VISUAL_DRIFT * v.speed) / 6 : 0;
    const w = state.weather;
    return new THREE.Vector3(-moving + Math.cos(w.windDir) * w.wind * 4, 0, Math.sin(w.windDir) * w.wind * 4);
  }

  private emitAmbient(state: GameState, layout: ShipLayout, dt: number, maxLevel: number): void {
    const acc = (k: string, rate: number): number => {
      const v = (this.emitAcc.get(k) ?? 0) + dt * rate;
      const n = Math.floor(v);
      this.emitAcc.set(k, v - n);
      return n;
    };
    // Chimenea: humo continuo al navegar, más tenue fondeados.
    if (this.chimneyTop && layout.levels <= maxLevel) {
      const moving = state.voyage.anchoredUntil === null && state.voyage.speed > 0;
      const n = acc('chimenea', moving ? 7 : 1.5);
      for (let i = 0; i < n; i++) this.particles.emitPuff('smoke', this.chimneyTop.x, this.chimneyTop.y, this.chimneyTop.z, layout.levels, 1.1, 1.4);
    }
    // Averías: humo negro y chispas en las máquinas averiadas; humo leve si están dañadas.
    for (const m of state.ship.modules) {
      if (m.status === 'construction' || m.level > maxLevel) continue;
      const broken = m.status === 'broken';
      const damaged = m.condition < 50;
      if (!broken && !damaged) continue;
      const def = moduleDef(m.type);
      const src = this.emitPoint(m, layout);
      if (!src) continue;
      const cellIn = getCell(layout, m.level, Math.floor((src.x + SHIP_ORIGIN_X) / CELL), Math.floor((src.z + (layout.width * CELL) / 2) / CELL));
      const indoor = !!cellIn?.indoor;
      if (broken) {
        for (let i = acc(`humo:${m.id}`, def.machine ? 3 : 1.2); i > 0; i--) this.particles.emitPuff('darkSmoke', src.x, src.y, src.z, m.level, 0.6, 0.9, indoor);
        if (def.machine) {
          // chispazos a ráfagas
          const burst = Math.sin(this.t * 2.3 + m.id) > 0.6 ? 14 : 0;
          for (let i = acc(`chispa:${m.id}`, burst); i > 0; i--) this.particles.emitSpark('spark', src.x, src.y - 0.2, src.z, m.level, levelY(m.level) + 0.02);
        }
      } else if (def.machine) {
        for (let i = acc(`humo:${m.id}`, 0.6); i > 0; i--) this.particles.emitPuff('smoke', src.x, src.y, src.z, m.level, 0.45, 0.7, indoor);
      }
    }
  }

  /** Punto de emisión de efectos de un módulo: encima de su prop principal o en su centro. */
  private emitPoint(m: ModuleInstance, layout: ShipLayout): THREE.Vector3 | null {
    let best: PropEntry | null = null;
    for (const e of this.props.values()) {
      if (e.inst.moduleId !== m.id) continue;
      if (!best || (e.inst.interact && !best.inst.interact) || e.inst.height > best.inst.height) best = e;
    }
    if (best) return new THREE.Vector3(best.inst.x, best.inst.y + best.inst.height + 0.1, best.inst.z);
    const cells = moduleCells(m).filter((c) => c.level === m.level);
    if (!cells.length) return null;
    const mn = cellMin(cells[0]!.x, cells[0]!.z, layout.width);
    return new THREE.Vector3(mn.x + CELL / 2, levelY(m.level) + WALL_H * 0.7, mn.z + CELL / 2);
  }

  /* ================================================================== */
  /* Resaltado                                                           */
  /* ================================================================== */

  private highlightGeometry(model: PropModel): THREE.BufferGeometry {
    let g = this.hlGeoCache.get(model);
    if (!g) {
      const parts = [model.solid, model.moving].filter((x): x is THREE.BufferGeometry => !!x && x.getAttribute('position').count > 0);
      const moving = model.moving && model.movingPivot ? model.moving.clone().translate(model.movingPivot.x, model.movingPivot.y, model.movingPivot.z) : null;
      const list = moving ? [model.solid, moving] : parts;
      g = list.length > 1 ? (mergeGeometries(list, false) ?? model.solid) : model.solid;
      g.computeBoundingBox();
      this.hlGeoCache.set(model, g);
    }
    return g;
  }

  private updateHighlight(state: GameState, layout: ShipLayout, hl: HighlightTarget | null, maxLevel: number): void {
    const pulse = 0.17 + 0.07 * Math.sin(this.t * 4.5);
    this.mats.highlight.opacity = pulse;
    (this.hlBox.material as THREE.MeshBasicMaterial).opacity = 0.65 + 0.3 * Math.sin(this.t * 4.5);
    const key = hl ? JSON.stringify(hl) : '';
    if (key === this.hlKey && !hl) return;
    this.hlKey = key;
    this.hlOverlay.visible = false;
    this.hlOutline.visible = false;
    this.hlBox.visible = false;
    this.hlFill.visible = false;
    if (!hl) return;
    if (hl.kind === 'prop') {
      const e = this.props.get(hl.key);
      if (!e || e.level > maxLevel) return;
      this.showMeshHighlight(this.highlightGeometry(e.model), e.proxy);
    } else if (hl.kind === 'crate') {
      const mesh = this.crates.get(hl.id);
      if (!mesh || !mesh.parent?.visible) return;
      this.showMeshHighlight(this.crateGeo, mesh);
    } else if (hl.kind === 'module') {
      const site = this.sites.get(hl.id);
      let box: THREE.Box3 | null = null;
      let level = 0;
      if (site) {
        box = site.bounds;
        level = site.level;
      } else {
        const m = state.ship.modules.find((mm) => mm.id === hl.id);
        if (!m) return;
        level = m.level;
        box = new THREE.Box3();
        for (const c of moduleCells(m)) {
          if (c.level !== m.level) continue;
          const mn = cellMin(c.x, c.z, layout.width);
          box.expandByPoint(_v.set(mn.x, levelY(c.level), mn.z));
          box.expandByPoint(_v.set(mn.x + CELL, levelY(c.level) + (moduleDef(m.type).enclosed ? WALL_H : 2.0), mn.z + CELL));
        }
        box.expandByScalar(0.08);
      }
      if (!box || level > maxLevel) return;
      box.getCenter(_v);
      box.getSize(_v2);
      const bk = `${_v2.x.toFixed(2)}|${_v2.y.toFixed(2)}|${_v2.z.toFixed(2)}`;
      if (bk !== this.hlBoxKey) {
        this.hlBox.geometry.dispose();
        this.hlBox.geometry = cornerBrackets(_v2);
        this.hlBoxKey = bk;
      }
      this.hlBox.position.copy(_v);
      this.hlFill.position.copy(_v);
      this.hlFill.scale.copy(_v2).multiplyScalar(0.995);
      this.hlBox.visible = true;
      this.hlFill.visible = true;
    }
  }

  private showMeshHighlight(geo: THREE.BufferGeometry, obj: THREE.Object3D): void {
    obj.updateMatrix();
    this.hlOverlay.geometry = geo;
    this.hlOverlay.matrix.copy(obj.matrix);
    this.hlOverlay.matrixWorldNeedsUpdate = true;
    if (!geo.boundingBox) geo.computeBoundingBox();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    const s = geo.boundingBox!.getSize(new THREE.Vector3());
    const grow = 1 + 0.05 / Math.max(0.3, Math.min(s.x, s.y, s.z));
    this.hlOutline.geometry = geo;
    this.hlOutline.matrix
      .copy(obj.matrix)
      .multiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z))
      .multiply(new THREE.Matrix4().makeScale(grow, 1 + 0.04, grow))
      .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    this.hlOutline.matrixWorldNeedsUpdate = true;
    this.hlOverlay.visible = true;
    this.hlOutline.visible = true;
  }

  /* ================================================================== */
  /* API pública                                                         */
  /* ================================================================== */

  /**
   * Objeto 3D de un prop (`${moduleId}:${index}`) o null. Se recrea al reconstruir el barco:
   * pídelo cada vez en lugar de guardar la referencia. Contiene una caja invisible ('seleccion')
   * con el mismo `userData`, útil para `Raycaster.intersectObject(obj, true)`.
   */
  getPropObject(key: string): THREE.Object3D | null {
    return this.props.get(key)?.proxy ?? null;
  }

  /** Objeto 3D de una caja suelta. */
  getCrateObject(id: number): THREE.Object3D | null {
    return this.crates.get(id) ?? null;
  }

  /** Grupo de una obra en curso (andamios + fantasma). */
  getSiteObject(moduleId: number): THREE.Object3D | null {
    return this.sites.get(moduleId)?.group ?? null;
  }

  /** Grupo de una mejora en obras (andamio ligero o caballete y cartel con su barra). */
  getUpgradeObject(moduleId: number): THREE.Object3D | null {
    return this.upgrades.get(moduleId)?.group ?? null;
  }

  /** Comportamiento animado de un prop (grúa, radar, vivero…), para pruebas y depuración. */
  getPropDynamic(key: string): PropDynamic | null {
    return this.props.get(key)?.dyn ?? null;
  }

  /** Niveles que faltan por reconstruir (se reparten entre frames). */
  get pendingLevels(): number {
    return this.planned.size;
  }

  /** Puntos de referencia del casco (punta de la pluma de carga, tope del palo, roda…). */
  get hullAnchors(): HullGeometry['anchors'] | null {
    return this.hull?.anchors ?? null;
  }

  /** Luces puntuales del pool (para depuración / calidad). */
  get interiorLights(): THREE.PointLight[] {
    return this.lightPool.lights;
  }

  /** Libera todo lo construido en un nivel (mallas y caché de estructura). */
  private disposeLevel(b: LevelBuild): void {
    for (const o of [...b.structObjs, ...b.propObjs]) disposeObject(o);
    for (const f of [...b.solid.values(), ...b.furn.values()]) if (f.mesh) disposeObject(f.mesh);
    b.solid.clear();
    b.furn.clear();
    for (const c of b.struct) disposeChunk(c);
    b.struct = [];
  }

  dispose(): void {
    for (const b of this.levelBuilds) if (b) this.disposeLevel(b);
    this.clearStaged();
    for (const o of this.hullObjs) disposeObject(o);
    for (const e of this.props.values()) e.dyn?.dispose();
    for (const s of this.sites.values()) disposeObject(s.group);
    for (const u of this.upgrades.values()) disposeObject(u.group);
    for (const f of this.flags) f.dispose();
    this.particles.dispose();
    this.fires.dispose();
    this.lightPool.dispose();
    this.crateGeo.dispose();
    this.pickGeo.dispose();
    this.pickMat.dispose();
    this.mats.dispose();
    this.group.removeFromParent();
  }
}

/** Esquinas de una caja de selección (barras de grosor constante), centradas en el origen. */
function cornerBrackets(size: THREE.Vector3): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const t = 0.06;
  const hx = size.x / 2;
  const hy = size.y / 2;
  const hz = size.z / 2;
  const lx = Math.min(0.8, size.x * 0.3);
  const ly = Math.min(0.8, size.y * 0.3);
  const lz = Math.min(0.8, size.z * 0.3);
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * hx;
        const y = sy * hy;
        const z = sz * hz;
        g.box(Math.min(x, x - sx * lx), y - t, z - t, Math.max(x, x - sx * lx), y + t, z + t, '#ffffff');
        g.box(x - t, Math.min(y, y - sy * ly), z - t, x + t, Math.max(y, y - sy * ly), z + t, '#ffffff');
        g.box(x - t, y - t, Math.min(z, z - sz * lz), x + t, y + t, Math.max(z, z - sz * lz), '#ffffff');
      }
  return g.build();
}

/** Columnas de estructura por grupo de `GROUP_COLS` (en el orden de las columnas). */
function groupChunks(chunks: StructCache[]): Map<number, StructCache[]> {
  const out = new Map<number, StructCache[]>();
  chunks.forEach((c, i) => {
    const g = Math.floor(i / GROUP_COLS);
    let a = out.get(g);
    if (!a) out.set(g, (a = []));
    a.push(c);
  });
  return out;
}

function sameChunks(a: StructCache[], b: StructCache[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}

/** Sólido de un grupo de columnas de estructura, con el módulo de cada vértice. */
function bakeSolid(chunks: StructCache[]): { baked: Baked; ids: Map<number, number> } {
  const baked = bakeParts(
    chunks.map((c) => ({ geo: c.solid, tags: c.tags })),
    true,
  );
  const ids = new Map<number, number>();
  for (const c of chunks) for (const id of c.tagIds) ids.set(id, 1);
  return { baked, ids };
}

/** Libera la geometría de una columna de estructura. */
function disposeChunk(c: StructCache): void {
  for (const g of [c.solid, c.glassOut, c.glassIn, c.lamps, c.lanterns]) g.dispose();
}

/** Retira un objeto y libera sus geometrías propias (y materiales propios). */
function disposeObject(o: THREE.Object3D): void {
  o.removeFromParent();
  o.traverse((c) => {
    if (c instanceof THREE.Mesh || c instanceof THREE.LineSegments) {
      if (c.userData.ownGeometry || c.name.startsWith('nivel-') || c.name.startsWith('casco') || c.name.startsWith('ojos') || c.name === 'luces-navegacion' || c.name === 'focos-cubierta' || c.name === 'rotulo') c.geometry.dispose();
      if (c.userData.ownMaterial) {
        const m = c.material as THREE.MeshLambertMaterial;
        m.map?.dispose();
        m.dispose();
      }
    }
  });
}

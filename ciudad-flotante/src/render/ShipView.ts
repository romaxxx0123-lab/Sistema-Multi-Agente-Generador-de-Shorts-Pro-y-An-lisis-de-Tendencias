/**
 * [AGENTE render-ship] VISTA 3D DEL BARCO.
 *
 * Geometría estática (se reconstruye solo cuando cambia `state.ship.revision`, la eslora o el
 * estado de daños de algún módulo, o tras `reset()`):
 *  - casco procedural con proa, popa, regala, castillo, palo, pluma, botes, anclas, ojos de buey;
 *  - estructura del layout: losas, paredes con ventanas, puertas, barandillas, escaleras,
 *    lámparas, forro y cuadernas de la bodega;
 *  - todos los props, fusionados con la estructura POR MATERIAL Y NIVEL (mergeGeometries)
 *    para tener muy pocas llamadas de dibujo.
 * Elementos dinámicos (cada frame): fuego del fogón, plantas, nivel de agua, máquinas que
 * vibran y humean, LEDs, contenido de almacenes, obras con andamios y fantasma, incendios,
 * cajas sueltas, humo de chimenea y averías, banderas, radar, pool de luces interiores,
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
import { cellMin, getCell, levelOfY, levelY, moduleCells, type PropInstance, type ShipLayout } from '../sim/ship';
import { daylight } from '../sim/time';
import type { GameState, ModuleInstance } from '../sim/types';
import { createDynamic, type DynContext, type PropDynamic } from './ship/dynamic';
import { Flag, nameTexture } from './ship/decor';
import { FireView } from './ship/fire';
import { GeoBuilder, hash01, tintGeometry } from './ship/geo';
import { buildHull, funnel, radarMast, type HullGeometry } from './ship/hull';
import { LightPool, type LightCandidate } from './ship/lights';
import { ShipMaterials } from './ship/materials';
import { Particles } from './ship/particles';
import { crate as crateModel, localDims, propModel, type PropModel } from './ship/props';
import { buildExpansionScaffold, buildSite, setProgress, siteProgress, type SiteEntry } from './ship/sites';
import { buildStructure, makeLevelBuilders, type LevelBuilders, type LightSpot } from './ship/structure';

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

const LAMP_COLOR = new THREE.Color('#ffd59a');
const LANTERN_COLOR = new THREE.Color('#ffb35c');
const FLOOD_COLOR = new THREE.Color('#fff1d6');
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m4 = new THREE.Matrix4();

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
  private staticObjs: THREE.Object3D[] = [];
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
  private siteKey = '';
  private levels = 0;
  private t = 0;
  private emitAcc = new Map<string, number>();
  private hlGeoCache = new WeakMap<PropModel, THREE.BufferGeometry>();
  private pickGeo = new THREE.BoxGeometry(1, 1, 1);
  private pickMat = new THREE.MeshBasicMaterial({ visible: false });
  /** Sustituye opciones de vista (pruebas y depuración: p. ej. `{ cutaway: false }`). */
  debugOptions: Partial<ShipViewOptions> | null = null;
  /** Estadísticas para depuración y pruebas. */
  readonly stats = { rebuilds: 0, hullRebuilds: 0, lastRebuildMs: 0, staticMeshes: 0, triangles: 0 };

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
    this.siteKey = '';
    this.hlKey = '';
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
    const dmg = state.ship.modules
      .filter((m) => m.status !== 'construction' && moduleTint(m) !== 1)
      .map((m) => `${m.id}${m.status === 'broken' ? 'b' : 'd'}`)
      .join(',');
    const structKey = `${state.ship.revision}|${layout.revision}|${dmg}`;
    if (structKey !== this.structKey) {
      this.rebuildStructure(state, layout);
      this.structKey = structKey;
    }
    const siteKey = `${layout.revision}|${layout.sites.map((s) => s.moduleId).join(',')}`;
    if (siteKey !== this.siteKey) {
      this.rebuildSites(state, layout);
      this.siteKey = siteKey;
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
    const ctx: DynContext = { state, module: undefined, t: this.t, dt, night, particles: this.particles, lights, mats: this.mats, maxLevel };
    for (const d of this.dyns) {
      ctx.module = modById.get(d.prop.moduleId);
      d.update(ctx);
    }
    for (const s of this.sites.values()) {
      const p = siteProgress(state, s.moduleId);
      s.ghost.scale.y = Math.max(0.03, p);
      setProgress(s.bars, p);
    }
    this.fires.update(state, layout, this.t, dt, maxLevel, this.particles, lights);
    this.emitAmbient(state, layout, dt, maxLevel);
    const wind = this.apparentWind(state);
    this.particles.update(dt, wind, maxLevel);
    const windStrength = Math.min(1, wind.length() / 6);
    const windYaw = Math.atan2(-wind.z, wind.x);
    for (const f of this.flags) f.update(this.t, windStrength, windYaw);
    if (this.radar) this.radar.rotation.y = this.t * 1.6;

    // --- Luces interiores ---
    for (const s of this.lightSpots) {
      const mod = s.moduleId !== null ? modById.get(s.moduleId) : undefined;
      const dim = mod && mod.status === 'broken' ? 0.4 : 1;
      const intensity = s.kind === 'room' ? 3.2 + 4.5 * night : s.kind === 'hold' ? 4.0 + 3.0 * night : night > 0.35 ? 4.5 * night : 0;
      lights.push({
        id: `${s.kind}:${s.x.toFixed(1)}:${s.y.toFixed(1)}:${s.z.toFixed(1)}`,
        x: s.x,
        y: s.y,
        z: s.z,
        level: s.level,
        intensity: intensity * dim,
        color: s.kind === 'hold' ? LANTERN_COLOR : LAMP_COLOR,
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

  private rebuildStructure(state: GameState, layout: ShipLayout): void {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    for (const o of this.staticObjs) disposeObject(o);
    this.staticObjs = [];
    for (const e of this.props.values()) {
      e.dyn?.dispose();
      e.proxy.removeFromParent();
    }
    this.props.clear();
    this.dyns = [];
    this.radar = null;
    this.chimneyTop = null;

    const modules = new Map(state.ship.modules.map((m) => [m.id, m]));
    const tintOf = (id: number | null): number => (id === null ? 1 : moduleTint(modules.get(id)));
    const builders: LevelBuilders[] = [];
    for (let l = 0; l <= layout.levels; l++) builders.push(makeLevelBuilders());
    const { lights } = buildStructure({ layout, modules, tintOf, levels: builders });
    this.lightSpots = lights;

    // Chimenea y radar sobre el puente (techo superior).
    const top = layout.levels;
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
        this.chimneyTop = funnel(builders[top]!.solid, a.x + CELL / 2, yTop, a.z + CELL / 2);
        const rp = radarMast(builders[top]!.solid, f.x + CELL / 2 + (fwd.x === aft.x ? 0 : 0.5), yTop, f.z + CELL / 2);
        const rg = new GeoBuilder();
        rg.box(-0.6, 0, -0.06, 0.6, 0.08, 0.06, '#2b2d42');
        rg.box(-0.05, -0.08, -0.05, 0.05, 0.0, 0.05, '#5c6770');
        this.radar = new THREE.Mesh(rg.build(), this.mats.solid);
        this.radar.position.copy(rp);
        this.radar.castShadow = true;
        this.radar.userData.ownGeometry = true;
        this.radar.name = 'radar';
        this.levelGroup(top).add(this.radar);
        this.staticObjs.push(this.radar);
      }
    }

    // Props: geometrías transformadas por nivel, fusionadas con la estructura.
    const propGeos: { solid: THREE.BufferGeometry[]; glass: THREE.BufferGeometry[]; glow: THREE.BufferGeometry[] }[] = builders.map(() => ({ solid: [], glass: [], glow: [] }));
    for (const p of layout.props) {
      const level = Math.max(0, Math.min(layout.levels - 1, Math.round(p.y / LEVEL_H - 0.01)));
      const model = propModel(p.kind, localDims(p));
      const tint = tintOf(p.moduleId);
      _m4.makeRotationY(p.yaw).setPosition(p.x, p.y, p.z);
      const bucket = propGeos[level]!;
      bucket.solid.push(tintGeometry(model.solid, tint).applyMatrix4(_m4));
      if (model.glass) bucket.glass.push(model.glass.clone().applyMatrix4(_m4));
      if (model.glow) bucket.glow.push(model.glow.clone().applyMatrix4(_m4));
      // Objeto proxy (posición del prop, partes animadas, caja para rayos)
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
      const cell = getCell(layout, level, Math.floor((p.x + SHIP_ORIGIN_X) / CELL), Math.floor((p.z + (layout.width * CELL) / 2) / CELL));
      const ceiling = cell?.indoor ? WALL_H : null;
      const dyn = createDynamic(p, proxy, model, level, this.mats, ceiling);
      if (dyn) this.dyns.push(dyn);
      this.levelGroup(level).add(proxy);
      this.props.set(p.key, { inst: p, model, proxy, level, dyn });
    }

    // Mallas fusionadas por nivel y material.
    let tris = 0;
    let meshes = 0;
    const mk = (parts: THREE.BufferGeometry[], mat: THREE.Material, level: number, shadow: boolean, name: string): void => {
      const valid = parts.filter((g) => (g.getAttribute('position')?.count ?? 0) > 0);
      if (!valid.length) {
        for (const g of parts) g.dispose();
        return;
      }
      const geo = valid.length === 1 ? valid[0]! : mergeGeometries(valid, false);
      for (const g of parts) if (g !== geo) g.dispose();
      if (!geo) return;
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = shadow;
      mesh.receiveShadow = shadow;
      mesh.userData.ownGeometry = true;
      this.levelGroup(level).add(mesh);
      this.staticObjs.push(mesh);
      tris += geo.getAttribute('position').count / 3;
      meshes++;
    };
    builders.forEach((b, l) => {
      const pg = propGeos[l]!;
      mk([b.solid.build(), ...pg.solid], this.mats.solid, l, true, `nivel-${l}-solido`);
      mk([b.glassOut.build()], this.mats.glassOut, l, false, `nivel-${l}-cristal-ext`);
      mk([b.glassIn.build(), ...pg.glass], this.mats.glassIn, l, false, `nivel-${l}-cristal-int`);
      mk([b.lamps.build(), ...pg.glow], this.mats.lamp, l, false, `nivel-${l}-lamparas`);
      mk([b.lanterns.build()], this.mats.lantern, l, false, `nivel-${l}-faroles`);
    });
    this.stats.rebuilds++;
    this.stats.staticMeshes = meshes;
    this.stats.triangles = tris;
    this.stats.lastRebuildMs = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
    this.hlKey = '';
  }

  /* ================================================================== */
  /* Obras, ampliación y cajas                                           */
  /* ================================================================== */

  private rebuildSites(state: GameState, layout: ShipLayout): void {
    for (const s of this.sites.values()) disposeObject(s.group);
    this.sites.clear();
    const modules = new Map(state.ship.modules.map((m) => [m.id, m]));
    for (const site of layout.sites) {
      const e = buildSite(site, modules.get(site.moduleId), layout, this.mats);
      this.levelGroup(e.level).add(e.group);
      this.sites.set(site.moduleId, e);
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

  /** Puntos de referencia del casco (punta de la pluma de carga, tope del palo, roda…). */
  get hullAnchors(): HullGeometry['anchors'] | null {
    return this.hull?.anchors ?? null;
  }

  /** Luces puntuales del pool (para depuración / calidad). */
  get interiorLights(): THREE.PointLight[] {
    return this.lightPool.lights;
  }

  dispose(): void {
    for (const o of [...this.staticObjs, ...this.hullObjs]) disposeObject(o);
    for (const s of this.sites.values()) disposeObject(s.group);
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

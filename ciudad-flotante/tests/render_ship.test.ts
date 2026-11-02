/**
 * Pruebas de la vista del barco (área render-ship). three.js funciona en Node sin WebGL para
 * construir geometría, así que comprobamos la geometría generada, las reglas de visibilidad,
 * la colocación de personajes y los resaltados sin necesidad de navegador.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODULE_LIST, moduleDef, type PropKind } from '../src/data/modules';
import { DebrisView } from '../src/render/DebrisView';
import { NpcView, decideNpcPose } from '../src/render/NpcView';
import { PlayerAvatar } from '../src/render/PlayerAvatar';
import { ShipView, moduleTint } from '../src/render/ShipView';
import { wrapText } from '../src/render/ship/bubble';
import { CharacterRig, lookFromAppearance, type RigPose } from '../src/render/ship/character';
import { buildPlantGeometry, craneView, createDynamic, radarActive, smokerWorking, viveroRunning, type DynContext } from '../src/render/ship/dynamic';
import { bedPose, gameStools, seatsOf } from '../src/render/ship/furniture';
import { GeoBuilder } from '../src/render/ship/geo';
import { BOW_LENGTH, KEEL_Y, bowStartX, buildHull, hullOutline, insideHull, sternX } from '../src/render/ship/hull';
import { ShipMaterials } from '../src/render/ship/materials';
import { Particles } from '../src/render/ship/particles';
import { MODELLED_KINDS, localDims, propModel, propTier, stoolOffsets, type PropModel } from '../src/render/ship/props';
import { buildStructure, makeLevelBuilders } from '../src/render/ship/structure';
import { brassPlaque, freeCorner, mainDoor, romanNumeral, storeLoft, tierPlaque } from '../src/render/ship/tiers';
import { CELL, LEVEL_H, WATERLINE_Y } from '../src/sim/constants';
import { GRUA_CYCLE_MIN, GRUA_HOOK_MIN, gruaOrigin, gruaStatus, gruaTarget, spawnDebris } from '../src/sim/debris';
import { SCRIPT } from '../src/sim/events';
import { addItem } from '../src/sim/inventory';
import { createNewGame } from '../src/sim/newGame';
import { GAME_REACH, SOFA_SEATS, seatPose } from '../src/sim/npc';
import { checkPlacement, computeLayout, instantiateModule, pointToCell, type PropInstance, type ShipLayout } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import type { GameState, ModuleInstance } from '../src/sim/types';

function hasNaN(g: THREE.BufferGeometry): boolean {
  const a = g.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return true;
  return false;
}

function triCount(g: THREE.BufferGeometry | null): number {
  if (!g) return 0;
  return (g.index ? g.index.count : g.getAttribute('position').count) / 3;
}

const camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 1000);
camera.position.set(0, 5, 0);

function newView(): { view: ShipView; root: THREE.Group; state: GameState } {
  const root = new THREE.Group();
  const view = new ShipView(root);
  // en las pruebas, cada cambio se aplica entero en el mismo frame (salvo donde se prueba el reparto)
  view.rebuildBudgetMs = Infinity;
  const state = createNewGame(3);
  return { view, root, state };
}

const OPTS = { hideAboveLevel: null, cutaway: false, highlight: null };

/** Añade un módulo terminado al barco y devuelve el módulo y el layout nuevo. */
function addModule(state: GameState, type: string, level: number, x: number, z: number, rot: 0 | 1 | 2 | 3 = 0): { m: ModuleInstance; layout: ShipLayout } {
  const m = instantiateModule(state.nextId++, type, level, x, z, rot, 'active');
  state.ship.modules.push(m);
  state.ship.revision++;
  return { m, layout: computeLayout(state.ship) };
}

/** Malla sólida fusionada de un nivel. */
function levelSolid(root: THREE.Object3D, l: number): THREE.Mesh {
  return root.getObjectByName(`nivel-${l}-solido`) as THREE.Mesh;
}

function sumAttr(mesh: THREE.Mesh, name: string): number {
  const a = mesh.geometry.getAttribute(name).array as ArrayLike<number>;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]!;
  return s;
}

/** Contexto de animación suelto para probar un comportamiento dinámico fuera de ShipView. */
function dynCtx(state: GameState, module: ModuleInstance | undefined, t: number, mats: ShipMaterials, particles: Particles): DynContext {
  return { state, module, t, dt: 1 / 30, night: 0.8, particles, lights: [], mats, maxLevel: 9 };
}

describe('constructor de geometría', () => {
  it('las caras de una caja miran hacia fuera', () => {
    const g = new GeoBuilder();
    g.box(-1, -1, -1, 1, 1, 1, '#ffffff');
    const geo = g.build();
    const pos = geo.getAttribute('position');
    const nrm = geo.getAttribute('normal');
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      expect(cx * nrm.getX(i) + cy * nrm.getY(i) + cz * nrm.getZ(i)).toBeGreaterThan(0);
    }
    expect(triCount(geo)).toBe(12);
  });

  it('los cilindros y prismas también miran hacia fuera', () => {
    const check = (fill: (g: GeoBuilder) => void, center: THREE.Vector3): void => {
      const g = new GeoBuilder();
      fill(g);
      const geo = g.build();
      const pos = geo.getAttribute('position');
      const nrm = geo.getAttribute('normal');
      for (let i = 0; i < pos.count; i += 3) {
        const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3 - center.x;
        const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3 - center.y;
        const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3 - center.z;
        expect(cx * nrm.getX(i) + cy * nrm.getY(i) + cz * nrm.getZ(i)).toBeGreaterThan(0);
      }
    };
    check((g) => g.cylinder(0, -0.5, 0, 1, 1, 1, 8, '#fff'), new THREE.Vector3(0, 0, 0));
    check((g) => g.prism([[-1, -1], [1, -1], [1, 1], [-1, 1]], 2, 3, '#fff', '#fff', true), new THREE.Vector3(0, 2.5, 0));
    check((g) => g.frustum(0, 0, 0, 1, 1, 0.5, 0.5, 1, '#fff'), new THREE.Vector3(0, 0.4, 0));
    check((g) => g.cylinderBetween(-1, 0, 0, 1, 0, 0, 0.3, 6, '#fff'), new THREE.Vector3(0, 0, 0));
  });
});

describe('modelos de props', () => {
  const kinds = new Set<PropKind>();
  for (const m of MODULE_LIST) for (const p of m.props) kinds.add(p.kind);

  it('hay un modelo para cada PropKind usado en los módulos', () => {
    for (const k of kinds) expect(MODELLED_KINDS).toContain(k);
  });

  it('cada modelo es geometría válida y cabe (aprox.) en su colisionador', () => {
    for (const m of MODULE_LIST) {
      for (const p of m.props) {
        const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
        const model = propModel(p.kind, { hx, hz, h });
        expect(triCount(model.solid), `${p.kind}`).toBeGreaterThan(10);
        expect(hasNaN(model.solid), `${p.kind}`).toBe(false);
        model.solid.computeBoundingBox();
        const bb = model.solid.boundingBox!;
        // Margen: tubo del fogón, gotero de la camilla, flecos de la alfombra…
        const tol = 0.45;
        // La alfombra y la silla no colisionan; la mesa de juegos lleva sus taburetes alrededor (tampoco).
        if (p.kind !== 'alfombra' && p.kind !== 'silla' && p.kind !== 'mesa_juegos') {
          expect(bb.max.x, p.kind).toBeLessThan(hx + tol);
          expect(bb.min.x, p.kind).toBeGreaterThan(-hx - tol);
          expect(bb.max.z, p.kind).toBeLessThan(hz + tol);
          expect(bb.min.z, p.kind).toBeGreaterThan(-hz - tol);
        }
        expect(bb.min.y, p.kind).toBeGreaterThan(-0.05);
      }
    }
  });

  it('las estanterías y la despensa tienen contenido por tramos de llenado', () => {
    for (const k of ['estanteria', 'despensa'] as const) {
      const m = propModel(k, { hx: 1.4, hz: 0.35, h: 2.2 });
      expect(m.contents).not.toBeNull();
      expect(m.tiers.length).toBe(4);
      for (let i = 1; i < 4; i++) expect(m.tiers[i]!).toBeGreaterThan(m.tiers[i - 1]!);
    }
  });

  it('los puntos de anclaje de efectos existen donde hacen falta', () => {
    expect(propModel('fogon', { hx: 0.8, hz: 0.45, h: 1 }).anchors.firebox).toBeDefined();
    expect(propModel('generador', { hx: 1.1, hz: 0.8, h: 1.4 }).anchors.exhaust).toBeDefined();
    expect(propModel('generador', { hx: 1.1, hz: 0.8, h: 1.4 }).moving).not.toBeNull();
    expect(propModel('deposito', { hx: 1.1, hz: 1.1, h: 2.4 }).anchors.gaugeTop).toBeDefined();
    expect(propModel('timon', { hx: 0.55, hz: 0.45, h: 1.3 }).movingPivot).not.toBeNull();
  });
});

describe('casco', () => {
  it('rodea la cuadrícula, con proa afilada y quilla bajo la bodega', () => {
    const h = buildHull({ length: 10, width: 4 });
    for (const g of [h.hull, h.upper, h.portFrames, h.portGlass]) expect(hasNaN(g)).toBe(false);
    h.hull.computeBoundingBox();
    const bb = h.hull.boundingBox!;
    expect(bb.max.x).toBeGreaterThan(bowStartX(10) + BOW_LENGTH - 0.5);
    expect(bb.min.x).toBeLessThan(sternX() + 0.01);
    expect(bb.min.y).toBeLessThan(KEEL_Y + 0.01);
    expect(bb.max.z).toBeGreaterThan(8);
    // la proa termina en punta
    expect(insideHull(bowStartX(10) + BOW_LENGTH - 0.3, 0, 10, 4)).toBe(true);
    expect(insideHull(bowStartX(10) + BOW_LENGTH - 0.3, 1.5, 10, 4)).toBe(false);
    expect(insideHull(0, 7.9, 10, 4)).toBe(true);
    expect(insideHull(0, 8.6, 10, 4)).toBe(false);
    expect(hullOutline(10, 4).length).toBeGreaterThan(10);
  });

  it('se alarga con la ampliación del casco', () => {
    const a = buildHull({ length: 10, width: 4 });
    const b = buildHull({ length: 12, width: 4 });
    a.hull.computeBoundingBox();
    b.hull.computeBoundingBox();
    expect(b.hull.boundingBox!.max.x - a.hull.boundingBox!.max.x).toBeCloseTo(2 * CELL, 1);
    expect(b.anchors.mastTop.x - a.anchors.mastTop.x).toBeCloseTo(2 * CELL, 1);
  });
});

describe('estructura', () => {
  it('genera geometría por nivel y una lámpara por celda de habitación', () => {
    const s = createNewGame(1);
    const layout = computeLayout(s.ship);
    const modules = new Map(s.ship.modules.map((m) => [m.id, m]));
    const levels = Array.from({ length: layout.levels + 1 }, () => makeLevelBuilders());
    const { lights } = buildStructure({ layout, modules, tintOf: () => 1, levels });
    let rooms = 0;
    for (let l = 0; l < layout.levels; l++) for (const col of layout.cells[l]!) for (const c of col) if (c.kind === 'room') rooms++;
    expect(lights.filter((l) => l.kind === 'room').length).toBe(rooms);
    expect(lights.filter((l) => l.kind === 'hold').length).toBeGreaterThan(0);
    for (let l = 0; l <= layout.levels; l++) expect(levels[l]!.solid.triangleCount, `nivel ${l}`).toBeGreaterThan(0);
    // ventanas (cristal) en las habitaciones de cubierta y del puente
    expect(levels[1]!.glassOut.triangleCount).toBeGreaterThan(0);
    expect(levels[2]!.glassOut.triangleCount).toBeGreaterThan(0);
  });
});

describe('ShipView', () => {
  it('construye pocas mallas fusionadas y solo reconstruye cuando cambia el barco', () => {
    const { view, state } = newView();
    const layout = computeLayout(state.ship);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(1);
    expect(view.stats.levelRebuilds).toBe(layout.levels + 1);
    expect(view.stats.staticMeshes).toBeLessThanOrEqual(5 * (layout.levels + 1));
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(1);
    // subir la revisión sin cambiar nada de lo que se dibuja no rehace ningún nivel
    state.ship.revision++;
    const l2 = computeLayout(state.ship);
    view.sync(state, l2, OPTS, 1 / 60, camera);
    expect(view.stats.levelRebuilds).toBe(layout.levels + 1);
    // un módulo nuevo rehace su nivel
    addModule(state, 'deposito', 0, 1, 0);
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(2);
    expect(view.stats.lastRebuildLevels).toBe(1);
    // un módulo dañado se ve más oscuro, pero sin reconstruir (ver «reconstrucción por niveles»)
    state.ship.modules[0]!.condition = 30;
    expect(moduleTint(state.ship.modules[0])).toBeLessThan(1);
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(2);
    view.reset();
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(3);
    expect(view.stats.lastRebuildLevels).toBe(layout.levels + 1);
  });

  it('expone el objeto 3D de cada prop con sus datos', () => {
    const { view, state } = newView();
    const layout = computeLayout(state.ship);
    view.sync(state, layout, { hideAboveLevel: null, cutaway: false, highlight: null }, 1 / 60, camera);
    for (const p of layout.props) {
      const o = view.getPropObject(p.key);
      expect(o, p.key).not.toBeNull();
      expect(o!.userData.key).toBe(p.key);
      expect(o!.position.x).toBeCloseTo(p.x, 5);
      expect(o!.position.z).toBeCloseTo(p.z, 5);
    }
    expect(view.getPropObject('999:0')).toBeNull();
  });

  it('oculta niveles superiores y techos en la vista en corte', () => {
    const { view, root, state } = newView();
    const layout = computeLayout(state.ship);
    const lvl = (n: number): THREE.Object3D => root.getObjectByName(`nivel-${n}`)!;
    view.sync(state, layout, { hideAboveLevel: null, cutaway: false, highlight: null }, 1 / 60, camera);
    expect(lvl(3).visible).toBe(true);
    view.sync(state, layout, { hideAboveLevel: null, cutaway: true, highlight: null }, 1 / 60, camera);
    expect(lvl(3).visible).toBe(false);
    expect(lvl(2).visible).toBe(true);
    view.sync(state, layout, { hideAboveLevel: 0, cutaway: true, highlight: null }, 1 / 60, camera);
    expect(lvl(1).visible).toBe(false);
    expect(lvl(0).visible).toBe(true);
  });

  it('muestra obras, cajas sueltas y resaltados', () => {
    const { view, root, state } = newView();
    state.ship.modules.push(instantiateModule(state.nextId++, 'camarote', 1, 6, 3, 0, 'construction'));
    state.ship.modules[state.ship.modules.length - 1]!.buildProgress = 0.5;
    state.ship.revision++;
    state.crates.push({ id: 77, pos: { x: 2, y: LEVEL_H, z: 1 }, inventory: { slots: [{ id: 'madera', qty: 2 }] }, label: 'Caja' });
    const layout = computeLayout(state.ship);
    expect(layout.sites.length).toBe(1);
    view.sync(state, layout, { hideAboveLevel: null, cutaway: false, highlight: { kind: 'prop', key: '7:0' } }, 1 / 60, camera);
    const site = view.getSiteObject(layout.sites[0]!.moduleId)!;
    expect(site).not.toBeNull();
    expect(site.getObjectByName('fantasma')!.scale.y).toBeCloseTo(0.5, 2);
    expect(view.getCrateObject(77)).not.toBeNull();
    const overlays = root.children.find((c) => c.name === 'barco')!.children.filter((c) => c instanceof THREE.Mesh && (c as THREE.Mesh).material === view.mats.highlight && c.visible);
    expect(overlays.length).toBeGreaterThan(0);
    state.crates = [];
    view.sync(state, layout, { hideAboveLevel: null, cutaway: false, highlight: { kind: 'module', id: layout.sites[0]!.moduleId } }, 1 / 60, camera);
    expect(view.getCrateObject(77)).toBeNull();
  });

  it('un incendio añade una luz prioritaria y las máquinas en marcha vibran', () => {
    const { view, state } = newView();
    const gen = instantiateModule(state.nextId++, 'generador', 0, 1, 0, 0, 'active');
    gen.powered = true;
    state.ship.modules.push(gen);
    state.ship.revision++;
    state.ship.modules.find((m) => m.type === 'almacen')!.fire = 80;
    const layout = computeLayout(state.ship);
    for (let i = 0; i < 30; i++) view.sync(state, layout, { hideAboveLevel: null, cutaway: false, highlight: null }, 1 / 30, camera);
    expect(view.interiorLights.some((l) => l.intensity > 3)).toBe(true);
    const genProp = layout.props.find((p) => p.kind === 'generador')!;
    const body = view.getPropObject(genProp.key)!.getObjectByName('parte-movil')!;
    expect(body.position.length()).toBeGreaterThan(0);
  });
});

describe('lámparas de cultivo', () => {
  it('un huerto bajo techo con el plano de invernadero tiene lámparas que se encienden con energía', () => {
    const { view, state } = newView();
    const hu = instantiateModule(state.nextId++, 'huerto', 0, 2, 1, 0, 'active');
    hu.plots[0] = { crop: 'hortaliza', growth: 0.4, dryHours: 0, dead: false, pest: false };
    state.ship.modules.push(hu);
    state.unlocks.push('invernadero');
    state.ship.revision++;
    const layout = computeLayout(state.ship);
    const opts = { hideAboveLevel: null, cutaway: false, highlight: null };
    hu.powered = false;
    view.sync(state, layout, opts, 1 / 60, camera);
    const prop = layout.props.find((p) => p.moduleId === hu.id && p.index === 0)!;
    const lamp = view.getPropObject(prop.key)!.getObjectByName('lampara-cultivo')!;
    expect(lamp).toBeDefined();
    const strip = lamp.children[1] as THREE.Mesh;
    const off = (strip.material as THREE.MeshBasicMaterial).color.getHexString();
    hu.powered = true;
    view.sync(state, layout, opts, 1 / 60, camera);
    expect((strip.material as THREE.MeshBasicMaterial).color.getHexString()).not.toBe(off);
  });
});

describe('plantas', () => {
  it('parcela vacía sin geometría; brote, mata, madura, seca y con plaga sí', () => {
    const base = { crop: null as string | null, growth: 0, dryHours: 0, dead: false, pest: false };
    expect(buildPlantGeometry(base, { x: 1, z: 1 }, 1)).toBeNull();
    const sizes = [0.05, 0.5, 1].map((g) => triCount(buildPlantGeometry({ ...base, crop: 'hortaliza', growth: g }, { x: 1, z: 1 }, 1)));
    expect(sizes[0]!).toBeGreaterThan(0);
    expect(sizes[2]!).toBeGreaterThan(sizes[1]!); // frutos maduros
    expect(triCount(buildPlantGeometry({ ...base, crop: 'lino', growth: 0.7, pest: true }, { x: 1, z: 1 }, 1))).toBeGreaterThan(0);
    expect(triCount(buildPlantGeometry({ ...base, crop: 'hortaliza', growth: 0.7, dead: true }, { x: 1, z: 1 }, 1))).toBeGreaterThan(0);
  });
});

describe('personajes', () => {
  const s = createNewGame(1);
  it('cada habitante duerme en su cama (literas a dos alturas)', () => {
    const lower = bedPose(s.ship, s.npcs[0]!.bed!.moduleId, s.npcs[0]!.bed!.index)!;
    const upper = bedPose(s.ship, s.npcs[1]!.bed!.moduleId, s.npcs[1]!.bed!.index)!;
    expect(lower.kind).toBe('litera');
    expect(upper.y - lower.y).toBeCloseTo(1.0, 2);
    expect(lower.y).toBeCloseTo(LEVEL_H + 0.49, 2);
    const cam = s.ship.modules.find((m) => m.type === 'camarote')!;
    expect(bedPose(s.ship, cam.id, 0)!.kind).toBe('cama');
    expect(bedPose(s.ship, cam.id, 3)).toBeNull();
  });

  it('decide poses según la actividad', () => {
    const st = createNewGame(1);
    const n = st.npcs[0]!;
    n.activity = 'sleeping';
    n.pos = { x: -13, y: LEVEL_H, z: -7 };
    expect(decideNpcPose(n, st, 0, []).pose).toBe('lie');
    expect(decideNpcPose(n, st, 0, []).blanket).not.toBeNull();
    n.activity = 'eating';
    const seats = seatsOf(st);
    expect(seats.length).toBeGreaterThan(0);
    n.pos = { x: seats[0]!.x + 0.4, y: seats[0]!.y, z: seats[0]!.z };
    const eat = decideNpcPose(n, st, 0, seats);
    expect(eat.pose).toBe('eat');
    expect(eat.x).toBeCloseTo(seats[0]!.x);
    n.activity = 'working';
    n.role = 'cocinero';
    expect(decideNpcPose(n, st, 0, seats).pose).toBe('stir');
    expect(decideNpcPose(n, st, 1.4, seats).pose).toBe('walk');
    n.activity = 'socializing';
    const o = st.npcs[1]!;
    n.pos = { x: 0, y: LEVEL_H, z: 0 };
    o.pos = { x: 2, y: LEVEL_H, z: 0 };
    st.player.pos = { x: 30, y: LEVEL_H, z: 0 };
    const talk = decideNpcPose(n, st, 0, seats);
    // mirar a +x: adelante = (-sin yaw, -cos yaw) → yaw = -PI/2
    expect(talk.yaw).toBeCloseTo(-Math.PI / 2, 3);
  });

  it('NpcView crea, oculta y resalta habitantes', () => {
    const st = createNewGame(1);
    const root = new THREE.Group();
    const v = new NpcView(root);
    v.sync(st, 1 / 60, null);
    expect(v.objectOf('npc1')).not.toBeNull();
    st.npcs[0]!.activity = 'away';
    v.sync(st, 1 / 60, null);
    expect(v.objectOf('npc1')!.visible).toBe(false);
    st.npcs[1]!.pos.y = LEVEL_H;
    v.sync(st, 1 / 60, 0);
    expect(v.objectOf('npc2')!.visible).toBe(false);
    v.setHighlight('npc2');
    st.npcs.pop();
    v.sync(st, 1 / 60, null);
    expect(v.objectOf('npc2')).toBeNull();
  });

  it('el avatar del jugador se tumba en su cama y lleva la herramienta', () => {
    const root = new THREE.Group();
    const av = new PlayerAvatar(root);
    av.update({ x: 0, y: LEVEL_H, z: 0, yaw: 0, speed: 0, onGround: true, sleeping: true, tool: null, action: 'idle', clothing: 'abrigo', bed: { x: 1, y: 3.6, z: 2, yaw: 0.5 } }, 1 / 60, true);
    expect(av.object.position.y).toBeCloseTo(3.6);
    av.update({ x: 0, y: LEVEL_H, z: 0, yaw: 0, speed: 2, onGround: true, sleeping: false, tool: 'martillo', action: 'hammer', clothing: null }, 1 / 60, true);
    expect(av.object.position.y).toBeCloseTo(LEVEL_H);
  });

  it('parte los bocadillos largos en líneas', () => {
    const lines = wrapText('Esto es una frase bastante larga para un bocadillo de texto en pantalla', 20, 3);
    expect(lines.length).toBeLessThanOrEqual(3);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(21);
  });
});

describe('restos flotantes', () => {
  it('flotan a la altura del agua y se resaltan', () => {
    const st = createNewGame(1);
    st.debris.push({ id: 5, kind: 'balsa', pos: { x: 10, z: 14 }, vel: { x: 0, z: 0 }, loot: [], spin: 0, survivors: 2 });
    st.debris.push({ id: 6, kind: 'barril', pos: { x: -4, z: -12 }, vel: { x: 0, z: 0 }, loot: [], spin: 1 });
    const root = new THREE.Group();
    const v = new DebrisView(root);
    for (let i = 0; i < 90; i++) v.sync(st, 1 / 30, () => 1.2);
    const o = v.objectOf(5)!;
    expect(o.position.x).toBeCloseTo(10);
    expect(Math.abs(o.position.y - 1.2)).toBeLessThan(0.2);
    v.setHighlight(5);
    v.sync(st, 1 / 30, () => 1.2);
    expect(root.getObjectByName('aro-resaltado')!.visible).toBe(true);
    st.debris = st.debris.filter((d) => d.id !== 5);
    v.sync(st, 1 / 30, () => 1.2);
    expect(v.objectOf(5)).toBeNull();
    expect(root.getObjectByName('aro-resaltado')!.visible).toBe(false);
  });
});

/* ================================================================== */
/* Ronda de contenido 2                                                */
/* ================================================================== */

/** Triángulos de todo lo que dibuja un modelo (sólido, cristal, luz, partes móviles y articuladas). */
function modelTris(m: PropModel): number {
  return triCount(m.solid) + triCount(m.glass) + triCount(m.glow) + triCount(m.moving) + triCount(m.contents) + Object.values(m.parts).reduce((a, g) => a + triCount(g), 0);
}

describe('módulos especializados: modelos', () => {
  const NEW_KINDS: PropKind[] = ['sofa', 'mesa_juegos', 'estanteria_libros', 'ahumadero', 'tanque_peces', 'grua', 'radar'];

  it('los siete muebles nuevos tienen un modelo propio y detallado (no una caja)', () => {
    for (const k of NEW_KINDS) {
      const spec = MODULE_LIST.flatMap((m) => m.props).find((p) => p.kind === k)!;
      const [hx, hz, h] = spec.collider!;
      const m = propModel(k, { hx, hz, h });
      expect(modelTris(m), k).toBeGreaterThan(150);
      expect(hasNaN(m.solid), k).toBe(false);
      for (const g of Object.values(m.parts)) expect(hasNaN(g), k).toBe(false);
    }
  });

  it('ahumadero con chimenea, vivero con agua y peces, grúa articulada y radar con antena giratoria', () => {
    const sm = propModel('ahumadero', { hx: 1, hz: 0.7, h: 2 });
    expect(sm.anchors.chimney).toBeDefined();
    expect(sm.anchors.firebox).toBeDefined();
    expect(sm.anchors.chimney2).toBeUndefined();
    // el de tiro doble tiene dos chimeneas y dos hogares
    const sm2 = propModel('ahumadero', { hx: 1, hz: 0.7, h: 2 }, 2, 'ahumadero');
    expect(sm2.anchors.chimney2).toBeDefined();
    expect(sm2.anchors.firebox2).toBeDefined();
    const tank = propModel('tanque_peces', { hx: 1.4, hz: 1, h: 1.3 });
    expect(tank.glass).not.toBeNull();
    expect(tank.anchors.water).toBeDefined();
    expect(tank.anchors.tank!.y).toBeGreaterThan(0.5);
    const crane = propModel('grua', { hx: 0.8, hz: 0.8, h: 3.2 });
    for (const p of ['turret', 'boom', 'jib', 'hook', 'ram', 'drum', 'load']) expect(crane.parts[p], p).toBeDefined();
    for (const a of ['turret', 'boomPivot', 'boomTip', 'jibTip']) expect(crane.anchors[a], a).toBeDefined();
    // la pluma larga de la mejora es más larga
    const crane2 = propModel('grua', { hx: 0.8, hz: 0.8, h: 3.2 }, 2, 'grua');
    expect(-crane2.anchors.boomTip!.z).toBeGreaterThan(-crane.anchors.boomTip!.z + 0.4);
    const radar = propModel('radar', { hx: 0.6, hz: 0.6, h: 2.6 });
    expect(radar.parts.antenna).toBeDefined();
    expect(radar.anchors.antenna!.y).toBeGreaterThan(2);
  });

  it('la mesa de juegos tiene tablero, fichas y un taburete en cada puesto de los lados', () => {
    const offs = stoolOffsets();
    expect(offs).toHaveLength(4);
    for (const [x, z] of offs) expect(Math.hypot(x, z)).toBeCloseTo(GAME_REACH, 5);
    const m = propModel('mesa_juegos', { hx: 0.7, hz: 0.7, h: 0.8 });
    m.solid.computeBoundingBox();
    expect(m.solid.boundingBox!.max.x).toBeGreaterThan(GAME_REACH);
    expect(m.anchors.lamp).toBeDefined();
  });
});

describe('niveles de mejora', () => {
  const upgradable = MODULE_LIST.filter((d) => d.upgrades?.length);

  it('cada nivel de cada módulo mejorable cambia el aspecto de sus muebles, sin romper su geometría', () => {
    for (const def of upgradable) {
      let prev = -1;
      for (let tier = 1; tier <= Math.max(...def.upgrades!.map((u) => u.tier)); tier++) {
        let total = 0;
        for (const p of def.props) {
          const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
          const m = propModel(p.kind, { hx, hz, h }, tier, def.id);
          expect(hasNaN(m.solid), `${def.id} ${p.kind} ${tier}`).toBe(false);
          m.solid.computeBoundingBox();
          const bb = m.solid.boundingBox!;
          expect(bb.min.y, `${def.id} ${p.kind} ${tier}`).toBeGreaterThan(-0.05);
          // nada atraviesa el techo de una habitación (3 m) salvo las tuberías que ya llegaban a él
          if (def.enclosed) expect(bb.max.y, `${def.id} ${p.kind} ${tier}`).toBeLessThanOrEqual(3.0 + 1e-3);
          if (p.kind !== 'alfombra' && p.kind !== 'silla' && p.kind !== 'mesa_juegos') {
            expect(bb.max.x, `${def.id} ${p.kind} ${tier}`).toBeLessThan(hx + 0.45);
            expect(bb.min.x, `${def.id} ${p.kind} ${tier}`).toBeGreaterThan(-hx - 0.45);
            expect(bb.max.z, `${def.id} ${p.kind} ${tier}`).toBeLessThan(hz + 0.45);
            expect(bb.min.z, `${def.id} ${p.kind} ${tier}`).toBeGreaterThan(-hz - 0.45);
          }
          total += modelTris(m);
        }
        if (tier > 1) expect(total, `${def.id}: el nivel ${tier} se ve distinto del ${tier - 1}`).not.toBe(prev);
        prev = total;
      }
    }
  });

  it('la variante solo se aplica a los muebles de su módulo (la mesa de la cocina no lleva mantel)', () => {
    expect(propTier('mesa', 'comedor', 2)).toBe(2);
    expect(propTier('mesa', 'cocina', 2)).toBe(1);
    expect(propTier('estanteria', 'almacen', 7)).toBe(3);
    expect(propTier('timon', 'puente', 2)).toBe(1);
    const a = propModel('mesa', { hx: 0.9, hz: 0.6, h: 0.8 }, 2, 'cocina');
    const b = propModel('mesa', { hx: 0.9, hz: 0.6, h: 0.8 }, 1, 'cocina');
    expect(a).toBe(b);
    expect(propModel('mesa', { hx: 0.9, hz: 0.6, h: 0.8 }, 2, 'comedor')).not.toBe(b);
  });

  it('placa de latón con el número romano: junto a la puerta (fuera) o en el frente del mueble principal', () => {
    expect(romanNumeral(2)).toBe('II');
    expect(romanNumeral(3)).toBe('III');
    const g2 = new GeoBuilder();
    brassPlaque(g2, 2);
    const g3 = new GeoBuilder();
    brassPlaque(g3, 3);
    expect(g3.triangleCount).toBeGreaterThan(g2.triangleCount);
    const st = createNewGame(1);
    const { m: dep, layout } = addModule(st, 'deposito', 0, 1, 0);
    const modelOf = (p: PropInstance): PropModel => propModel(p.kind, localDims(p), 2, p.moduleType);
    const cam = st.ship.modules.find((m) => m.type === 'camarote')!;
    const g = new GeoBuilder();
    // nivel 1: sin placa
    expect(tierPlaque(g, cam, layout, layout.props, modelOf)).toBe(false);
    cam.tier = 2;
    expect(tierPlaque(g, cam, layout, layout.props, modelOf)).toBe(true);
    const geo = g.build();
    const c = geo.boundingBox!.getCenter(new THREE.Vector3());
    // fuera de la habitación, a la altura de los ojos, junto a la puerta principal
    const cell = pointToCell(c.x, c.z, layout.width);
    expect(layout.cells[cam.level]![cell.x]![cell.z]!.moduleId).not.toBe(cam.id);
    expect(c.y - LEVEL_H * cam.level).toBeCloseTo(1.55, 1);
    const door = mainDoor(cam, layout)!.door;
    expect(Math.hypot(c.x - door.x, c.z - door.z)).toBeLessThan(1.3);
    // módulo abierto: en su mueble principal
    dep.tier = 3;
    const gd = new GeoBuilder();
    expect(tierPlaque(gd, dep, layout, layout.props, modelOf)).toBe(true);
    const cd = gd.build().boundingBox!.getCenter(new THREE.Vector3());
    const prop = layout.props.find((p) => p.moduleId === dep.id)!;
    expect(Math.hypot(cd.x - prop.x, cd.z - prop.z)).toBeLessThan(1.4);
  });

  it('el almacén mejorado tiene un altillo en una esquina sin muebles altos ni la puerta debajo', () => {
    const st = createNewGame(1);
    const layout = computeLayout(st.ship);
    const alm = st.ship.modules.find((m) => m.type === 'almacen')!;
    const g = new GeoBuilder();
    expect(storeLoft(g, alm, layout, layout.props)).toBe(false);
    alm.tier = 2;
    expect(storeLoft(g, alm, layout, layout.props)).toBe(true);
    const size = freeCorner(alm, layout, layout.props, 1.3, 2.05) ? 1.3 : 1.05;
    const corner = freeCorner(alm, layout, layout.props, size, 2.05)!;
    expect(corner).not.toBeNull();
    const x0 = Math.min(corner.x, corner.x + corner.sx * size);
    const x1 = Math.max(corner.x, corner.x + corner.sx * size);
    const z0 = Math.min(corner.z, corner.z + corner.sz * size);
    const z1 = Math.max(corner.z, corner.z + corner.sz * size);
    for (const p of layout.props) {
      if (p.moduleId !== alm.id || p.height <= 2.05) continue;
      const overlap = p.x + p.hx > x0 && p.x - p.hx < x1 && p.z + p.hz > z0 && p.z - p.hz < z1;
      expect(overlap, p.kind).toBe(false);
    }
    const door = mainDoor(alm, layout)!.door;
    const overlapX = door.axis === 'x' ? door.x + door.width / 2 > x0 && door.x - door.width / 2 < x1 : door.x > x0 - 0.2 && door.x < x1 + 0.2;
    const overlapZ = door.axis === 'z' ? door.z + door.width / 2 > z0 && door.z - door.width / 2 < z1 : door.z > z0 - 0.2 && door.z < z1 + 0.2;
    expect(overlapX && overlapZ).toBe(false);
    // el altillo queda por encima de la cabeza
    const bb = g.build().boundingBox!;
    expect(bb.max.y - LEVEL_H * alm.level).toBeGreaterThan(2.2);
  });

  it('ShipView: al subir de nivel cambia el mueble y aparece la placa sin rehacer la estructura', () => {
    const { view, root, state } = newView();
    let layout = computeLayout(state.ship);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    const alm = state.ship.modules.find((m) => m.type === 'almacen')!;
    const shelf = layout.props.find((p) => p.moduleId === alm.id && p.kind === 'estanteria')!;
    expect(view.getPropDynamic(shelf.key)!.model.tier).toBe(1);
    const tris0 = view.stats.triangles;
    const struct0 = view.stats.structRebuilds;
    const other = levelSolid(root, 0);
    const walls = levelSolid(root, alm.level);
    const furniture0 = root.getObjectByName(`nivel-${alm.level}-muebles`);
    alm.tier = 2;
    state.ship.revision++;
    layout = computeLayout(state.ship);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.getPropDynamic(shelf.key)!.model.tier).toBe(2);
    expect(view.stats.triangles).toBeGreaterThan(tris0);
    expect(view.stats.lastRebuildLevels).toBe(1);
    expect(view.stats.structRebuilds).toBe(struct0);
    expect(levelSolid(root, 0)).toBe(other);
    // la estructura del nivel ni se reconstruye ni se vuelve a fusionar: solo cambian los muebles
    expect(levelSolid(root, alm.level)).toBe(walls);
    expect(root.getObjectByName(`nivel-${alm.level}-muebles`)).not.toBe(furniture0);
  });

  it('una mejora en obras muestra andamio o caballete y un cartel con su barra de progreso', () => {
    const { view, state } = newView();
    const alm = state.ship.modules.find((m) => m.type === 'almacen')!;
    const { m: dep, layout } = addModule(state, 'deposito', 0, 1, 0);
    alm.upgrade = { toTier: 2, progress: 0.25 };
    dep.upgrade = { toTier: 2, progress: 0.6 };
    view.sync(state, layout, OPTS, 1 / 60, camera);
    for (const [m, p] of [[alm, 0.25], [dep, 0.6]] as const) {
      const o = view.getUpgradeObject(m.id)!;
      expect(o, m.type).not.toBeNull();
      const bar = o.getObjectByName('progreso-obra') as THREE.Mesh;
      expect(bar.scale.x).toBeCloseTo(p * (bar.userData.len as number), 3);
      // el módulo sigue en uso: sus muebles siguen ahí
      expect(view.getPropObject(layout.props.find((pp) => pp.moduleId === m.id)!.key)).not.toBeNull();
    }
    // el andamio del depósito rodea su mueble; el almacén lleva caballete dentro y cartel fuera
    const depBox = new THREE.Box3().setFromObject(view.getUpgradeObject(dep.id)!);
    const prop = layout.props.find((pp) => pp.moduleId === dep.id)!;
    expect(depBox.containsPoint(new THREE.Vector3(prop.x, prop.y + 1, prop.z))).toBe(true);
    dep.upgrade.progress = 0.9;
    view.sync(state, layout, OPTS, 1 / 60, camera);
    const bar = view.getUpgradeObject(dep.id)!.getObjectByName('progreso-obra') as THREE.Mesh;
    expect(bar.scale.x).toBeCloseTo(0.9 * (bar.userData.len as number), 3);
    alm.upgrade = null;
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.getUpgradeObject(alm.id)).toBeNull();
    expect(view.getUpgradeObject(dep.id)).not.toBeNull();
  });
});

describe('reconstrucción por niveles (QA P4)', () => {
  it('los daños oscurecen el módulo cambiando solo los colores, sin reconstruir', () => {
    const { view, root, state } = newView();
    const layout = computeLayout(state.ship);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    const alm = state.ship.modules.find((m) => m.type === 'almacen')!;
    const mesh = levelSolid(root, alm.level);
    const before = sumAttr(mesh, 'color');
    const lr = view.stats.levelRebuilds;
    alm.condition = 30;
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.levelRebuilds).toBe(lr);
    expect(levelSolid(root, alm.level)).toBe(mesh);
    const dark = sumAttr(mesh, 'color');
    expect(dark).toBeLessThan(before - 1);
    alm.status = 'broken';
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(sumAttr(mesh, 'color')).toBeLessThan(dark - 1);
    alm.status = 'active';
    alm.condition = 100;
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(sumAttr(mesh, 'color')).toBeCloseTo(before, 2);
    // y coincide con una vista nueva del mismo barco dañado
    alm.condition = 30;
    view.sync(state, layout, OPTS, 1 / 60, camera);
    const fresh = newView();
    fresh.view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(sumAttr(levelSolid(fresh.root, alm.level), 'color')).toBeCloseTo(sumAttr(mesh, 'color'), 2);
  });

  it('una obra nueva no rehace nada; al terminarla solo cambia su nivel y el resultado es idéntico a reconstruir', () => {
    const { view, root, state } = newView();
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    const lr = view.stats.levelRebuilds;
    const sr = view.stats.structRebuilds;
    const m = instantiateModule(state.nextId++, 'generador', 1, 6, 0, 0, 'construction');
    state.ship.modules.push(m);
    state.ship.revision++;
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    expect(view.stats.levelRebuilds).toBe(lr);
    expect(view.getSiteObject(m.id)).not.toBeNull();
    const l0 = levelSolid(root, 0);
    const l2 = levelSolid(root, 2);
    m.status = 'active';
    state.ship.revision++;
    const layout = computeLayout(state.ship);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.lastRebuildLevels).toBe(1);
    expect(levelSolid(root, 0)).toBe(l0);
    expect(levelSolid(root, 2)).toBe(l2);
    expect(view.getPropObject(layout.props.find((p) => p.moduleId === m.id)!.key)).not.toBeNull();
    // estructura reconstruida solo en su columna y las vecinas
    expect(view.stats.structRebuilds - sr).toBeLessThanOrEqual(3);
    const fresh = newView();
    fresh.view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.triangles).toBe(fresh.view.stats.triangles);
    for (let l = 0; l <= layout.levels; l++) {
      for (const name of [`nivel-${l}-solido`, `nivel-${l}-muebles`, `nivel-${l}-cristal-int`, `nivel-${l}-lamparas`]) {
        const a = root.getObjectByName(name) as THREE.Mesh | undefined;
        const b = fresh.root.getObjectByName(name) as THREE.Mesh | undefined;
        expect(!!a, name).toBe(!!b);
        if (!a || !b) continue;
        expect(a.geometry.getAttribute('position').count, name).toBe(b.geometry.getAttribute('position').count);
        expect(sumAttr(a, 'position'), name).toBeCloseTo(sumAttr(b, 'position'), 1);
        expect(sumAttr(a, 'color'), name).toBeCloseTo(sumAttr(b, 'color'), 1);
      }
    }
  });

  it('con poco presupuesto por frame reparte los niveles entre frames sin dejar ninguno a medias', () => {
    const { view, root, state } = newView();
    view.sync(state, computeLayout(state.ship), OPTS, 1 / 60, camera);
    view.rebuildBudgetMs = 0;
    // una habitación en cubierta cambia su nivel y el techo de abajo del nivel superior
    const { layout } = addModule(state, 'camarote', 1, 6, 0);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.lastRebuildLevels).toBe(1);
    const pending = view.pendingLevels;
    expect(pending).toBeGreaterThan(0);
    for (let i = 0; i < 5 && view.pendingLevels; i++) view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.pendingLevels).toBe(0);
    const fresh = newView();
    fresh.view.sync(state, layout, OPTS, 1 / 60, camera);
    expect(view.stats.triangles).toBe(fresh.view.stats.triangles);
    for (let l = 0; l <= layout.levels; l++) expect(levelSolid(root, l).geometry.getAttribute('position').count).toBe(levelSolid(fresh.root, l).geometry.getAttribute('position').count);
  });

  it('las esferas envolventes de las mallas fusionadas contienen todos sus vértices (recorte correcto)', () => {
    const { view, root, state } = newView();
    addModule(state, 'grua', 1, 6, 0);
    const { layout } = addModule(state, 'sala_comun', 0, 1, 0);
    view.sync(state, layout, OPTS, 1 / 60, camera);
    let meshes = 0;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.name.startsWith('nivel-')) return;
      meshes++;
      const sph = o.geometry.boundingSphere!;
      const pos = o.geometry.getAttribute('position');
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) expect(v.fromBufferAttribute(pos, i).distanceTo(sph.center), o.name).toBeLessThanOrEqual(sph.radius + 1e-3);
    });
    expect(meshes).toBeGreaterThan(8);
  });

  it('la firma de cada nivel solo cambia con lo que dibuja', () => {
    const { view, state } = newView();
    const layout = computeLayout(state.ship);
    const mods = new Map(state.ship.modules.map((m) => [m.id, m]));
    const sigs = [0, 1, 2, 3].map((l) => view.levelSignature(l, state, layout, mods));
    // dañar un módulo no cambia ninguna firma (va por colores)
    state.ship.modules[0]!.condition = 10;
    expect([0, 1, 2, 3].map((l) => view.levelSignature(l, state, layout, mods))).toEqual(sigs);
    // mejorar el almacén solo cambia su nivel
    const alm = state.ship.modules.find((m) => m.type === 'almacen')!;
    alm.tier = 2;
    const after = [0, 1, 2, 3].map((l) => view.levelSignature(l, state, layout, mods));
    for (let l = 0; l < 4; l++) expect(after[l] === sigs[l], `nivel ${l}`).toBe(l !== alm.level);
  });
});

describe('módulos especializados: animación', () => {
  it('grúa: sigue el estado guardado en el módulo como gruaStatus/gruaTarget', () => {
    const st = createNewGame(1);
    const { m } = addModule(st, 'grua', 1, 6, 0);
    expect(craneView(m, st).phase).toBe('parada');
    m.powered = true;
    m.on = true;
    m.prodProgress = 1;
    expect(craneView(m, st).phase).toBe('izando');
    m.prodProgress = 10;
    expect(craneView(m, st).phase).toBe('recargando');
    m.prodProgress = GRUA_CYCLE_MIN;
    expect(craneView(m, st).phase).toBe('esperando');
    st.debris.push({ id: 9, kind: 'barril', pos: { x: 12, z: -20 }, vel: { x: 0, z: 0 }, loot: [], spin: 0 });
    m.prodTarget = 9;
    m.prodProgress = GRUA_CYCLE_MIN + GRUA_HOOK_MIN / 2;
    const v = craneView(m, st);
    expect(v.phase).toBe('enganchando');
    expect(v.progress).toBeCloseTo(0.5, 5);
    expect(v.target).toMatchObject({ id: 9, x: 12, z: -20 });
    st.weather.kind = 'tormenta';
    expect(craneView(m, st).phase).toBe('tormenta');
  });

  it('grúa: en una partida real, la vista coincide minuto a minuto con gruaStatus y gruaTarget', () => {
    const unlocks = ['energia', 'grua'];
    const sim = new Simulation(createNewGame(11));
    const st = sim.state;
    st.events.nextRollAt = 1e12;
    st.events.scripted = SCRIPT.map((s) => s.id);
    st.weather.kind = 'despejado';
    st.weather.remaining = 1e9;
    st.npcs = [];
    st.debris = [];
    st.voyage.anchoredUntil = 1e9;
    st.voyage.anchorReason = 'pruebas';
    st.voyage.speed = 0;
    const place = (type: string, level: number, ok: (z: number) => boolean): ModuleInstance => {
      for (let x = st.ship.length - 1; x >= 0; x--)
        for (let z = 0; z < st.ship.width; z++) {
          if (!ok(z)) continue;
          for (const rot of [0, 1, 2, 3] as const) {
            if (!checkPlacement(st.ship, unlocks, type, level, x, z, rot).ok) continue;
            const m = instantiateModule(sim.nextId(), type, level, x, z, rot, 'active');
            st.ship.modules.push(m);
            sim.shipChanged();
            return m;
          }
        }
      throw new Error(`no cabe ${type}`);
    };
    addItem(place('generador', 0, () => true).fuelInv!, 'combustible', 8);
    const crane = place('grua', 1, (z) => z === 0);
    const keep = () => {
      const n = st.player.needs;
      n.hunger = n.thirst = n.energy = 90;
      n.health = 100;
    };
    keep();
    sim.tick(1);
    const o = gruaOrigin(sim, crane);
    const seen = new Set<string>();
    const check = () => {
      const s = gruaStatus(sim, crane.id)!;
      const t = gruaTarget(sim, crane.id);
      const v = craneView(crane, st);
      const want = s.phase === 'llena' ? 'esperando' : s.phase;
      expect(v.phase).toBe(want);
      seen.add(v.phase);
      if (want === 'izando' || want === 'recargando' || want === 'enganchando') expect(v.progress).toBeCloseTo(s.progress, 6);
      if (t) expect(v.target).toMatchObject({ id: t.debrisId, kind: t.kind, x: t.pos.x, z: t.pos.z });
      else expect(v.target).toBeNull();
    };
    const run = (min: number) => {
      for (let i = 0; i < min; i++) {
        keep();
        sim.tick(1);
        check();
      }
    };
    check();
    spawnDebris(sim, 'tablones', { x: o.x, z: o.z - 12 }, { loot: [{ id: 'madera', qty: 3 }], lateral: 0 });
    spawnDebris(sim, 'barril', { x: o.x + 5, z: o.z - 18 }, { loot: [{ id: 'tela', qty: 1 }], lateral: 0 });
    run(70);
    crane.on = false;
    run(3);
    crane.on = true;
    st.weather.kind = 'tormenta';
    run(3);
    expect([...seen].sort()).toEqual(['enganchando', 'esperando', 'izando', 'parada', 'recargando', 'tormenta']);
  });

  it('grúa: la torreta gira hacia el resto, el gancho llega a él e iza la red; sin trabajo vigila su costado', () => {
    const { view, state } = newView();
    const { m, layout } = addModule(state, 'grua', 1, 6, 0);
    m.on = true;
    m.powered = true;
    const prop = layout.props.find((p) => p.moduleId === m.id)!;
    const side = prop.z < 0 ? -1 : 1;
    const target = { x: prop.x + 12, z: prop.z + side * 10 };
    state.debris.push({ id: 31, kind: 'caja', pos: target, vel: { x: 0, z: 0 }, loot: [], spin: 0 });
    m.prodTarget = 31;
    m.prodProgress = GRUA_CYCLE_MIN + GRUA_HOOK_MIN * 0.999;
    for (let i = 0; i < 150; i++) view.sync(state, layout, OPTS, 1 / 30, camera);
    const dyn = view.getPropDynamic(prop.key) as unknown as { yaw: number; phase: string };
    expect(dyn.phase).toBe('enganchando');
    const dirYaw = prop.yaw + dyn.yaw;
    const fwd = new THREE.Vector2(-Math.sin(dirYaw), -Math.cos(dirYaw));
    const want = new THREE.Vector2(target.x - prop.x, target.z - prop.z).normalize();
    expect(fwd.dot(want)).toBeGreaterThan(Math.cos(0.12));
    const proxy = view.getPropObject(prop.key)!;
    proxy.updateMatrix();
    const hook = proxy.getObjectByName('gancho')!.position.clone().applyMatrix4(proxy.matrix);
    expect(Math.hypot(hook.x - target.x, hook.z - target.z)).toBeLessThan(0.3);
    expect(hook.y).toBeLessThan(WATERLINE_Y + 0.6);
    // izando: la red sube junto al costado
    state.debris = [];
    m.prodTarget = null;
    m.prodProgress = 2;
    view.sync(state, layout, OPTS, 1 / 30, camera);
    expect(proxy.getObjectByName('carga')!.visible).toBe(true);
    // esperando: la pluma apunta hacia fuera de la borda
    m.prodProgress = GRUA_CYCLE_MIN;
    for (let i = 0; i < 200; i++) view.sync(state, layout, OPTS, 1 / 30, camera);
    expect(proxy.getObjectByName('carga')!.visible).toBe(false);
    expect(-Math.cos(prop.yaw + dyn.yaw) * side).toBeGreaterThan(0.6);
  });

  it('grúa: la pluma no atraviesa habitaciones, escaleras ni muebles altos aunque el resto esté detrás', () => {
    const { view, state } = newView();
    const { m, layout } = addModule(state, 'grua', 1, 5, 0);
    m.on = true;
    m.powered = true;
    const prop = layout.props.find((p) => p.moduleId === m.id)!;
    const side = prop.z < 0 ? -1 : 1;
    // resto hacia popa y un poco hacia fuera: el camino directo pasa por encima de la escalera de al lado (x=4)
    const target = { x: prop.x - 16, z: prop.z + side * 3 };
    state.debris.push({ id: 41, kind: 'barril', pos: target, vel: { x: 0, z: 0 }, loot: [], spin: 0 });
    m.prodTarget = 41;
    m.prodProgress = GRUA_CYCLE_MIN + 1;
    for (let i = 0; i < 200; i++) view.sync(state, layout, OPTS, 1 / 30, camera);
    const dyn = view.getPropDynamic(prop.key) as unknown as { yaw: number };
    const a = prop.yaw + dyn.yaw;
    const direct = Math.atan2(-(target.x - prop.x), -(target.z - prop.z));
    expect(Math.abs(Math.atan2(Math.sin(a - direct), Math.cos(a - direct)))).toBeGreaterThan(0.2);
    // ningún punto de la pluma queda sobre una habitación o una escalera
    for (let r = 0.7; r < 3.6; r += 0.3) {
      const c = pointToCell(prop.x - Math.sin(a) * r, prop.z - Math.cos(a) * r, layout.width);
      const k = layout.cells[1]![c.x]?.[c.z]?.kind;
      expect(k === 'room' || k === 'stairLow' || k === 'stairHigh', `r=${r.toFixed(1)} ${k}`).toBe(false);
    }
    // el cable sí llega al resto
    const proxy = view.getPropObject(prop.key)!;
    proxy.updateMatrix();
    const hook = proxy.getObjectByName('gancho')!.position.clone().applyMatrix4(proxy.matrix);
    m.prodProgress = GRUA_CYCLE_MIN + GRUA_HOOK_MIN * 0.999;
    view.sync(state, layout, OPTS, 1 / 30, camera);
    hook.copy(proxy.getObjectByName('gancho')!.position).applyMatrix4(proxy.matrix);
    expect(Math.hypot(hook.x - target.x, hook.z - target.z)).toBeLessThan(0.3);
  });

  it('radar: la antena gira solo con el radar en marcha (y la del mástil del puente, también)', () => {
    const { view, root, state } = newView();
    const { m, layout } = addModule(state, 'radar', 1, 6, 0);
    const prop = layout.props.find((p) => p.moduleId === m.id)!;
    const ant = (): number => view.getPropObject(prop.key)!.getObjectByName('antena-radar')!.rotation.y;
    const bridge = (): number => root.getObjectByName('radar')!.rotation.y;
    expect(radarActive(m)).toBe(false);
    for (let i = 0; i < 30; i++) view.sync(state, layout, OPTS, 1 / 30, camera);
    expect(ant()).toBeCloseTo(0, 3);
    expect(bridge()).toBeCloseTo(0, 3);
    m.on = true;
    m.powered = true;
    for (let i = 0; i < 60; i++) view.sync(state, layout, OPTS, 1 / 30, camera);
    const a = ant();
    const b = bridge();
    view.sync(state, layout, OPTS, 1 / 30, camera);
    expect(Math.abs(ant() - a)).toBeGreaterThan(0.02);
    expect(Math.abs(bridge() - b)).toBeGreaterThan(0.02);
  });

  it('ahumadero: humo por la chimenea, brasas y pescado colgado mientras ahúma', () => {
    const st = createNewGame(1);
    const { m, layout } = addModule(st, 'ahumadero', 1, 6, 0);
    const prop = layout.props.find((p) => p.moduleId === m.id)!;
    const model = propModel(prop.kind, localDims(prop), 1, prop.moduleType);
    const proxy = new THREE.Group();
    const mats = new ShipMaterials();
    const parts = new Particles(new THREE.Group());
    const dyn = createDynamic(prop, proxy, model, 1, mats, null)!;
    for (let i = 0; i < 60; i++) dyn.update(dynCtx(st, m, i / 30, mats, parts));
    expect(parts.puffCount).toBe(0);
    expect(smokerWorking(m)).toBe(false);
    m.queue.push({ recipeId: 'ahumar', progress: 0 });
    const lights: DynContext['lights'] = [];
    for (let i = 0; i < 90; i++) {
      const c = dynCtx(st, m, 2 + i / 30, mats, parts);
      dyn.update(c);
      if (i === 89) lights.push(...c.lights);
    }
    expect(parts.puffCount).toBeGreaterThan(5);
    expect(proxy.getObjectByName('pescado-colgado')!.visible).toBe(true);
    expect(proxy.getObjectByName('brasas')!.visible).toBe(true);
    expect(lights.some((l) => l.id.startsWith('ahumadero:'))).toBe(true);
  });

  it('vivero: los peces nadan siempre y los aireadores burbujean con energía', () => {
    const st = createNewGame(1);
    const { m, layout } = addModule(st, 'vivero', 0, 1, 0);
    m.tier = 2;
    const prop = layout.props.find((p) => p.moduleId === m.id)!;
    const model = propModel(prop.kind, localDims(prop), 2, prop.moduleType);
    const proxy = new THREE.Group();
    const mats = new ShipMaterials();
    const parts = new Particles(new THREE.Group());
    const dyn = createDynamic(prop, proxy, model, 0, mats, null)!;
    const fish = proxy.children.filter((c) => c.name === 'pez');
    expect(fish.length).toBeGreaterThanOrEqual(5);
    dyn.update(dynCtx(st, m, 0, mats, parts));
    const p0 = fish[0]!.position.clone();
    for (let i = 0; i < 20; i++) dyn.update(dynCtx(st, m, i / 30, mats, parts));
    expect(fish[0]!.position.distanceTo(p0)).toBeGreaterThan(0.01);
    // dentro del tanque
    const w = model.anchors.water!;
    const t = model.anchors.tank!;
    for (const f of fish) {
      expect(Math.abs(f.position.x)).toBeLessThan(t.x);
      expect(Math.abs(f.position.z)).toBeLessThan(t.z);
      expect(f.position.y).toBeGreaterThan(w.y);
      expect(f.position.y).toBeLessThan(w.y + t.y);
    }
    const bubbles = proxy.children.filter((c) => c.name === 'burbuja');
    expect(bubbles.length).toBeGreaterThan(0);
    expect(bubbles.every((b) => !b.visible)).toBe(true);
    m.on = true;
    m.powered = true;
    expect(viveroRunning(m)).toBe(true);
    dyn.update(dynCtx(st, m, 2, mats, parts));
    expect(bubbles.every((b) => b.visible)).toBe(true);
  });

  it('sala común: luz cálida del quinqué y, con la estufa, llamas y su resplandor', () => {
    const st = createNewGame(1);
    const { m, layout } = addModule(st, 'sala_comun', 0, 1, 0);
    const mats = new ShipMaterials();
    const parts = new Particles(new THREE.Group());
    const table = layout.props.find((p) => p.moduleId === m.id && p.kind === 'mesa_juegos')!;
    const tdyn = createDynamic(table, new THREE.Group(), propModel(table.kind, localDims(table), 1, table.moduleType), 0, mats, 3)!;
    const c = dynCtx(st, m, 0, mats, parts);
    tdyn.update(c);
    expect(c.lights.some((l) => l.id.startsWith('quinque:'))).toBe(true);
    const books = layout.props.find((p) => p.moduleId === m.id && p.kind === 'estanteria_libros')!;
    expect(createDynamic(books, new THREE.Group(), propModel(books.kind, localDims(books), 1, books.moduleType), 0, mats, 3)).toBeNull();
    const proxy = new THREE.Group();
    const sdyn = createDynamic(books, proxy, propModel(books.kind, localDims(books), 2, books.moduleType), 0, mats, 3)!;
    const c2 = dynCtx(st, m, 1, mats, parts);
    sdyn.update(c2);
    expect(c2.lights.some((l) => l.id.startsWith('estufa:'))).toBe(true);
    expect(proxy.getObjectByName('llama-estufa')!.visible).toBe(true);
  });
});

describe('habitantes en la sala común', () => {
  it('las plazas del sofá coinciden con las de la IA y los taburetes rodean la mesa mirándola', () => {
    const st = createNewGame(1);
    const { m, layout } = addModule(st, 'sala_comun', 0, 1, 0);
    const fakeSim = { layout } as unknown as Simulation;
    const sofa = layout.props.find((p) => p.moduleId === m.id && p.kind === 'sofa')!;
    const seats = seatsOf(st).filter((s) => s.kind === 'sofa' && s.moduleId === m.id);
    expect(seats).toHaveLength(SOFA_SEATS.length);
    SOFA_SEATS.forEach((_, i) => {
      const ai = seatPose(fakeSim, `${sofa.key}@${i}`)!;
      expect(seats[i]!.x).toBeCloseTo(ai.x, 5);
      expect(seats[i]!.z).toBeCloseTo(ai.z, 5);
      expect(seats[i]!.yaw).toBeCloseTo(ai.yaw, 5);
    });
    const table = layout.props.find((p) => p.moduleId === m.id && p.kind === 'mesa_juegos')!;
    const stools = gameStools(st).filter((s) => s.moduleId === m.id);
    expect(stools).toHaveLength(4);
    for (const s of stools) {
      expect(Math.hypot(s.x - table.x, s.z - table.z)).toBeCloseTo(GAME_REACH, 5);
      const fx = -Math.sin(s.yaw);
      const fz = -Math.cos(s.yaw);
      expect(fx * (table.x - s.x) + fz * (table.z - s.z)).toBeCloseTo(GAME_REACH, 4);
    }
  });

  it('juegan a las cartas sentados en su taburete (o de pie si no hay) y leen en el sofá', () => {
    const st = createNewGame(1);
    addModule(st, 'sala_comun', 0, 1, 0);
    const n = st.npcs[0]!;
    const stools = gameStools(st);
    const seats = seatsOf(st);
    n.activity = 'socializing';
    n.task = { kind: 'ocio', prio: 1, target: null, targetModuleId: null, data: { job: 'sala', game: true, anim: 'jugar', faceYaw: 1.2 } } as unknown as NonNullable<typeof n.task>;
    n.pos = { x: stools[0]!.x + 0.2, y: stools[0]!.y, z: stools[0]!.z };
    const sit = decideNpcPose(n, st, 0, seats, stools);
    expect(sit.pose).toBe('cards');
    expect(sit.tool).toBe('cartas');
    expect(sit.x).toBeCloseTo(stools[0]!.x);
    expect(sit.yaw).toBeCloseTo(stools[0]!.yaw);
    n.pos = { x: stools[0]!.x + 3, y: stools[0]!.y, z: stools[0]!.z };
    const stand = decideNpcPose(n, st, 0, seats, stools);
    expect(stand.pose).toBe('cardsStand');
    expect(stand.yaw).toBeCloseTo(1.2);
    expect(decideNpcPose(n, st, 1.5, seats, stools).pose).toBe('walk');
    const sofaSeat = seats.find((s) => s.kind === 'sofa')!;
    n.activity = 'idle';
    n.task = { kind: 'ocio', prio: 1, target: null, targetModuleId: null, data: { job: 'sala', read: true, seated: true } } as unknown as NonNullable<typeof n.task>;
    n.pos = { x: sofaSeat.x, y: sofaSeat.y, z: sofaSeat.z };
    const read = decideNpcPose(n, st, 0, seats, stools);
    expect(read.pose).toBe('read');
    expect(read.tool).toBe('libro');
    (n.task!.data as { read: boolean }).read = false;
    expect(decideNpcPose(n, st, 0, seats, stools).pose).toBe('sit');
  });

  it('las poses nuevas del personaje son estables y llevan su objeto en la mano', () => {
    for (const pose of ['cards', 'cardsStand', 'read'] as RigPose[]) {
      const rig = new CharacterRig(lookFromAppearance({ skin: 1, shirt: 2, pants: 1, hair: 0, hat: false, height: 1 }, 4), 4);
      for (let i = 0; i < 40; i++) rig.animate({ pose, speed: 0, tool: pose === 'read' ? 'libro' : 'cartas' }, 1 / 30);
      rig.root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rig.root);
      expect(Number.isFinite(box.min.y) && Number.isFinite(box.max.y), pose).toBe(true);
      // sentado: la cabeza más baja que de pie
      expect(box.max.y, pose).toBeLessThan(pose === 'cardsStand' ? 1.95 : 1.55);
      const tool = rig.root.getObjectByProperty('visible', true);
      expect(tool).toBeDefined();
    }
  });
});

describe('definiciones usadas por la vista', () => {
  it('cada módulo mejorable abierto tiene dónde poner su placa', () => {
    for (const def of MODULE_LIST) {
      if (!def.upgrades?.length || def.enclosed) continue;
      const p = def.props.find((pp) => pp.interact) ?? def.props[0]!;
      const [hx, hz, h] = p.collider ?? [0.4, 0.4, 0.5];
      expect(propModel(p.kind, { hx, hz, h }, 2, def.id).anchors.plaque, def.id).toBeDefined();
    }
    expect(moduleDef('grua').edge).toBe(true);
  });
});

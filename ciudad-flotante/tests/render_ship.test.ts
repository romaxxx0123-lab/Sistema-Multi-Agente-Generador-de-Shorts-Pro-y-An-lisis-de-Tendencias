/**
 * Pruebas de la vista del barco (área render-ship). three.js funciona en Node sin WebGL para
 * construir geometría, así que comprobamos la geometría generada, las reglas de visibilidad,
 * la colocación de personajes y los resaltados sin necesidad de navegador.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODULE_LIST, type PropKind } from '../src/data/modules';
import { DebrisView } from '../src/render/DebrisView';
import { NpcView, decideNpcPose } from '../src/render/NpcView';
import { PlayerAvatar } from '../src/render/PlayerAvatar';
import { ShipView, moduleTint } from '../src/render/ShipView';
import { wrapText } from '../src/render/ship/bubble';
import { buildPlantGeometry } from '../src/render/ship/dynamic';
import { bedPose, seatsOf } from '../src/render/ship/furniture';
import { GeoBuilder } from '../src/render/ship/geo';
import { BOW_LENGTH, KEEL_Y, bowStartX, buildHull, hullOutline, insideHull, sternX } from '../src/render/ship/hull';
import { MODELLED_KINDS, propModel } from '../src/render/ship/props';
import { buildStructure, makeLevelBuilders } from '../src/render/ship/structure';
import { CELL, LEVEL_H } from '../src/sim/constants';
import { createNewGame } from '../src/sim/newGame';
import { computeLayout, instantiateModule } from '../src/sim/ship';
import type { GameState } from '../src/sim/types';

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
  const state = createNewGame(3);
  return { view, root, state };
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
        if (p.kind !== 'alfombra' && p.kind !== 'silla') {
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
    const opts = { hideAboveLevel: null, cutaway: false, highlight: null };
    view.sync(state, layout, opts, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(1);
    expect(view.stats.staticMeshes).toBeLessThanOrEqual(5 * (layout.levels + 1));
    view.sync(state, layout, opts, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(1);
    // un módulo dañado se ve más oscuro → reconstrucción
    state.ship.modules[0]!.condition = 30;
    view.sync(state, layout, opts, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(2);
    expect(moduleTint(state.ship.modules[0])).toBeLessThan(1);
    // nueva distribución → reconstrucción
    state.ship.revision++;
    const l2 = computeLayout(state.ship);
    view.sync(state, l2, opts, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(3);
    view.reset();
    view.sync(state, l2, opts, 1 / 60, camera);
    expect(view.stats.rebuilds).toBe(4);
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

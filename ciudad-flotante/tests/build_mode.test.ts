import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MODULE_LIST, moduleDef } from '../src/data/modules';
import { CELL, LEVEL_H } from '../src/sim/constants';
import { Simulation } from '../src/sim/Simulation';
import { cellMin, footprintSize, levelY } from '../src/sim/ship';
import { addItem } from '../src/sim/inventory';
import type { Rotation } from '../src/sim/types';
import {
  CATEGORIES,
  cardInfo,
  demolishPreview,
  expansionInfo,
  fmtNum,
  levelsText,
  moduleInfo,
  moduleStats,
  paletteModules,
  shipSummary,
  stock,
} from '../src/build/catalog';
import { buildGhostGeometry } from '../src/build/ghost';
import { HUD_GLYPHS } from '../src/build/hud';
import { hasGlyph, MODULE_GLYPH } from '../src/ui/icons';
import { fitDistance, ORBIT_LIMITS, OrbitRig } from '../src/build/orbit';
import { anchorFor, continuousCell, intersectLevel, moduleAtCell, pickModule, toShipLocalRay } from '../src/build/picking';

/* ------------------------------------------------------------------ */

describe('cámara orbital', () => {
  it('respeta los límites de distancia, inclinación y desplazamiento', () => {
    const rig = new OrbitRig();
    rig.setBounds(-20, 20, -8, 8);
    rig.zoom(100);
    expect(rig.goal.dist).toBe(ORBIT_LIMITS.maxDist);
    rig.zoom(-200);
    expect(rig.goal.dist).toBe(ORBIT_LIMITS.minDist);
    rig.orbit(0, 10);
    expect(rig.goal.pitch).toBe(ORBIT_LIMITS.maxPitch);
    rig.orbit(0, -10);
    expect(rig.goal.pitch).toBe(ORBIT_LIMITS.minPitch);
    rig.pan(1000, 0);
    expect(rig.goal.tx).toBeLessThanOrEqual(20 + ORBIT_LIMITS.panMargin + 1e-9);
  });

  it('adelante es hacia donde mira la cámara', () => {
    const rig = new OrbitRig();
    rig.setBounds(-100, 100, -100, 100);
    rig.snap({ yaw: 0, tx: 0, tz: 0 });
    // Con yaw 0 la cámara está en +z mirando a -z.
    rig.pan(0, 5);
    expect(rig.goal.tz).toBeCloseTo(-5);
    expect(rig.goal.tx).toBeCloseTo(0);
    rig.pan(3, 0);
    expect(rig.goal.tx).toBeCloseTo(3);
    const off = OrbitRig.offset({ yaw: 0, pitch: 0.5, dist: 10 }, new THREE.Vector3());
    expect(off.z).toBeGreaterThan(0);
    expect(off.length()).toBeCloseTo(10);
  });

  it('la amortiguación converge sin pasarse', () => {
    const rig = new OrbitRig();
    rig.snap({ dist: 20, yaw: 0 });
    rig.set({ dist: 60, yaw: 1 });
    for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(rig.cur.dist).toBeCloseTo(60, 1);
    expect(rig.cur.yaw).toBeCloseTo(1, 2);
    expect(rig.settling).toBe(false);
  });

  it('encuadra barcos más largos desde más lejos, dentro de los límites', () => {
    const a = fitDistance(40, 50, 16 / 9);
    const b = fitDistance(72, 50, 16 / 9);
    expect(b).toBeGreaterThan(a);
    for (const d of [a, b, fitDistance(40, 50, 0.6)]) {
      expect(d).toBeGreaterThanOrEqual(ORBIT_LIMITS.minDist);
      expect(d).toBeLessThanOrEqual(ORBIT_LIMITS.maxDist);
    }
  });
});

/* ------------------------------------------------------------------ */

describe('selección con el ratón', () => {
  it('el rayo se transforma al espacio local del barco aunque esté escorado', () => {
    // Barco con balanceo, cabeceo y arfada.
    const ship = new THREE.Object3D();
    ship.position.set(0.3, 0.6, -0.2);
    ship.rotation.set(0.06, 0, -0.08);
    ship.updateMatrixWorld(true);
    const local = new THREE.Vector3(5.5, levelY(1), -3.2);
    const world = local.clone().applyMatrix4(ship.matrixWorld);
    const origin = new THREE.Vector3(-20, 40, 30);
    const ray = new THREE.Ray(origin, world.clone().sub(origin).normalize());
    const lray = toShipLocalRay(ray, ship.matrixWorld, new THREE.Ray());
    const hit = intersectLevel(lray, 1)!;
    expect(hit.x).toBeCloseTo(local.x, 4);
    expect(hit.z).toBeCloseTo(local.z, 4);
  });

  it('el footprint se centra bajo el cursor y se encaja en el casco', () => {
    const ship = { length: 10, width: 4 };
    const cam = moduleDef('camarote');
    expect(anchorFor(cam, 0, 6.4, 1.7, ship)).toEqual({ x: 6, z: 1 });
    const dorm = moduleDef('dormitorio');
    // 2×1: el cursor cerca del borde entre las celdas 5 y 6 → ocupa 5 y 6.
    expect(anchorFor(dorm, 0, 6.1, 2.5, ship)).toEqual({ x: 5, z: 2 });
    // Girado 90°: 1×2 en planta.
    expect(anchorFor(dorm, 1, 6.5, 2.1, ship)).toEqual({ x: 6, z: 1 });
    // Junto al casco se encaja dentro; lejos, no hay fantasma.
    expect(anchorFor(cam, 0, -0.5, 4.6, ship)).toEqual({ x: 0, z: 3 });
    expect(anchorFor(cam, 0, 30, 2, ship)).toBeNull();
    const huerto = moduleDef('huerto');
    expect(anchorFor(huerto, 0, 9.9, 3.9, ship)).toEqual({ x: 8, z: 2 });
  });

  it('coordenadas continuas de celda', () => {
    const c = cellMin(3, 2, 4);
    const r = continuousCell(c.x + CELL / 2, c.z + CELL / 4, 4);
    expect(r.fx).toBeCloseTo(3.5);
    expect(r.fz).toBeCloseTo(2.25);
  });

  it('elige el módulo bajo el rayo (paredes y suelo) en el nivel seleccionado', () => {
    const sim = Simulation.newGame(3);
    const ship = sim.state.ship;
    const down = (x: number, z: number, level: number): THREE.Ray => {
      const c = cellMin(x, z, ship.width);
      return new THREE.Ray(new THREE.Vector3(c.x + CELL / 2, levelY(level) + 30, c.z + CELL / 2), new THREE.Vector3(0, -1, 0));
    };
    const camarote = ship.modules.find((m) => m.type === 'camarote')!;
    expect(pickModule(down(camarote.x, camarote.z, 1), ship, 1)?.id).toBe(camarote.id);
    // Cubierta libre: nada.
    expect(pickModule(down(8, 1, 1), ship, 1)).toBeNull();
    // En la bodega se ve el depósito.
    const dep = ship.modules.find((m) => m.type === 'deposito')!;
    expect(pickModule(down(dep.x, dep.z, 0), ship, 0)?.id).toBe(dep.id);
    // La parte alta de la escalera de la bodega pertenece a la escalera.
    const esc = ship.modules.find((m) => m.type === 'escalera' && m.level === 0)!;
    expect(moduleAtCell(ship, 1, esc.x, esc.z)?.id).toBe(esc.id);
    expect(pickModule(down(esc.x, esc.z, 1), ship, 1)?.id).toBe(esc.id);
    // Rayo rasante que entra por la pared de una habitación.
    const c = cellMin(camarote.x, camarote.z, ship.width);
    const side = new THREE.Ray(new THREE.Vector3(c.x + CELL / 2, levelY(1) + 1.5, 30), new THREE.Vector3(0, 0, -1));
    expect(pickModule(side, ship, 1)).not.toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe('catálogo de la paleta', () => {
  it('todas las piezas construibles están en alguna categoría (y el puente no)', () => {
    const all = CATEGORIES.flatMap((c) => paletteModules(c.id).map((d) => d.id));
    const buildable = MODULE_LIST.filter((d) => d.buildable).map((d) => d.id);
    expect(new Set(all)).toEqual(new Set(buildable));
    expect(all).not.toContain('puente');
    for (const c of CATEGORIES) expect(paletteModules(c.id).length).toBeGreaterThan(0);
  });

  it('coste con "tengo/necesito" según el barco y bloqueo por plano', () => {
    const sim = Simulation.newGame(4);
    const have = stock(sim);
    const cam = cardInfo(sim, moduleDef('camarote'), have);
    expect(cam.locked).toBe(false);
    const madera = cam.cost.find((c) => c.id === 'madera')!;
    expect(madera.need).toBe(8);
    expect(madera.have).toBe(24);
    expect(cam.affordable).toBe(true);
    const taller = cardInfo(sim, moduleDef('taller'), have);
    expect(taller.locked).toBe(true);
    expect(taller.lockReason).toMatch(/Plano/);
    expect(taller.affordable).toBe(false);
    expect(taller.cost.find((c) => c.id === 'placa_metal')!.ok).toBe(false);
  });

  it('estadísticas de energía y agua en las fichas', () => {
    const txt = (id: string) => moduleStats(moduleDef(id)).map((s) => s.text).join(' | ');
    expect(txt('generador')).toContain('+5 kW');
    expect(txt('panel_solar')).toContain('+1,6 kW de día');
    expect(txt('potabilizadora')).toContain('−2 kW');
    expect(txt('potabilizadora')).toContain('+18 L/h');
    expect(txt('colector')).toContain('con lluvia');
    expect(txt('deposito')).toContain('+120 L');
    expect(txt('bateria')).toContain('25 kWh');
    expect(txt('enfermeria')).toContain('2 camillas');
    expect(txt('camarote')).toContain('1 cama');
    expect(txt('camarote')).toContain('40 min');
  });

  it('todos los glifos que usa el modo construcción existen en el juego de iconos', () => {
    const names = new Set<string>([...HUD_GLYPHS, ...CATEGORIES.map((c) => c.glyph)]);
    for (const def of MODULE_LIST) for (const st of moduleStats(def)) names.add(st.glyph);
    for (const n of names) expect(hasGlyph(n), n).toBe(true);
    for (const def of MODULE_LIST.filter((d) => d.buildable)) expect(hasGlyph(MODULE_GLYPH[def.id] ?? ''), def.id).toBe(true);
  });

  it('formato de números y niveles', () => {
    expect(fmtNum(1.5)).toBe('1,5');
    expect(fmtNum(2)).toBe('2');
    expect(fmtNum(0.04)).toBe('0');
    expect(fmtNum(-0.01)).toBe('0');
    expect(fmtNum(120, 0)).toBe('120');
    expect(levelsText([0, 1, 2])).toBe('Todos los niveles');
    expect(levelsText([0])).toBe('Solo bodega');
    expect(levelsText([1, 2])).toBe('Cubierta y superior');
  });

  it('resumen del barco inicial', () => {
    const sim = Simulation.newGame(5);
    const s = shipSummary(sim);
    expect(s.beds).toBe(5);
    expect(s.inhabitants).toBe(3);
    expect(s.lengthM).toBe(40);
    expect(s.works).toBe(0);
    expect(s.expansion).toBeNull();
  });

  it('información de una obra y de un módulo terminado', () => {
    const sim = Simulation.newGame(6);
    const res = sim.placeModule('camarote', 1, 6, 0, 2);
    expect(res.ok).toBe(true);
    sim.tick(10);
    const obra = sim.state.ship.modules.find((m) => m.id === res.moduleId)!;
    const i = moduleInfo(sim, obra);
    expect(i.state).toMatch(/En obras/);
    expect(i.progress).toBeGreaterThan(0);
    expect(i.lines.join(' ')).toMatch(/Faltan/);
    const alm = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    const j = moduleInfo(sim, alm);
    expect(j.condition).toBe(100);
    expect(j.lines.join(' ')).toMatch(/huecos/);
  });

  it('vista previa de demolición: motivo, reembolso y contenido', () => {
    const sim = Simulation.newGame(7);
    const ship = sim.state.ship;
    const camarote = ship.modules.find((m) => m.type === 'camarote')!;
    const p = demolishPreview(sim, camarote);
    expect(p.ok).toBe(false);
    expect(p.reason).toMatch(/escalera/i);
    const alm = ship.modules.find((m) => m.type === 'almacen')!;
    const q = demolishPreview(sim, alm);
    expect(q.ok).toBe(true);
    expect(q.refund).toEqual([{ id: 'madera', name: 'Madera', qty: 4 }]);
    expect(q.contents).toBeGreaterThan(0);
    const puente = ship.modules.find((m) => m.type === 'puente')!;
    expect(demolishPreview(sim, puente).ok).toBe(false);
  });

  it('ampliación del casco: bloqueo, coste y eslora resultante', () => {
    const sim = Simulation.newGame(8);
    let x = expansionInfo(sim, stock(sim));
    expect(x.locked).toBe(true);
    expect(x.ok).toBe(false);
    expect(x.lengthAfterM).toBe(48);
    sim.state.unlocks.push('casco');
    const inv = sim.state.player.inventory;
    addItem(inv, 'madera', 30);
    addItem(inv, 'placa_metal', 12);
    addItem(inv, 'tornillos', 16);
    x = expansionInfo(sim, stock(sim));
    expect(x.locked).toBe(false);
    expect(x.ok).toBe(true);
    expect(x.cost.every((c) => c.ok)).toBe(true);
    expect(sim.expandHull().ok).toBe(true);
    x = expansionInfo(sim, stock(sim));
    expect(x.progress).not.toBeNull();
    expect(x.ok).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

describe('geometría del fantasma', () => {
  const width = 4;
  const finite = (g: THREE.BufferGeometry): boolean => {
    const a = g.getAttribute('position');
    if (!a) return true;
    for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i]!)) return false;
    return true;
  };

  it('todas las piezas y giros generan volúmenes dentro de su footprint', () => {
    for (const def of MODULE_LIST.filter((d) => d.buildable)) {
      for (const rot of [0, 1, 2, 3] as Rotation[]) {
        const g = buildGhostGeometry(def.id, rot, width);
        expect(g.fill.getAttribute('position').count, `${def.id} r${rot}`).toBeGreaterThan(0);
        expect(g.edges.getAttribute('position').count).toBeGreaterThan(0);
        expect(finite(g.fill) && finite(g.edges) && finite(g.markers)).toBe(true);
        g.fill.computeBoundingBox();
        const b = g.fill.boundingBox!;
        const [fw, fd] = footprintSize(def, rot);
        const o = cellMin(0, 0, width);
        const tol = 0.25;
        expect(b.min.x).toBeGreaterThanOrEqual(o.x - tol);
        expect(b.min.z).toBeGreaterThanOrEqual(o.z - tol);
        expect(b.max.x).toBeLessThanOrEqual(o.x + fw * CELL + tol);
        expect(b.max.z).toBeLessThanOrEqual(o.z + fd * CELL + tol);
        expect(b.min.y).toBeGreaterThanOrEqual(-1e-4);
        expect(b.max.y).toBeLessThanOrEqual(LEVEL_H + 0.01);
      }
    }
  });

  it('las habitaciones marcan sus puertas y las escaleras su subida', () => {
    for (const id of ['camarote', 'cocina', 'escalera']) {
      const g = buildGhostGeometry(id, 0, width);
      expect(g.markers.getAttribute('position').count, id).toBeGreaterThan(0);
    }
    // Equipamiento abierto sin puertas: sin marcas.
    expect(buildGhostGeometry('deposito', 0, width).markers.getAttribute('position')?.count ?? 0).toBe(0);
  });
});

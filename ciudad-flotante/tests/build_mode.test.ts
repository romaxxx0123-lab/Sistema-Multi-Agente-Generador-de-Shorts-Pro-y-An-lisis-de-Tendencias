import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HULL_EXPANSION, MODULE_LIST, moduleDef } from '../src/data/modules';
import { CELL, LEVEL_H } from '../src/sim/constants';
import { Simulation } from '../src/sim/Simulation';
import { cellMin, footprintSize, levelY } from '../src/sim/ship';
import { addItem } from '../src/sim/inventory';
import type { Rotation } from '../src/sim/types';
import {
  CATEGORIES,
  cardInfo,
  demolishPreview,
  estimateLosses,
  expansionInfo,
  fmtNum,
  levelsText,
  moduleInfo,
  moduleStats,
  paletteModules,
  shipSummary,
  bedRestBonus,
  stock,
  upgradeEffects,
  upgradeList,
  upgradePreview,
  upgradeStall,
} from '../src/build/catalog';
import { cancelUpgradeConfirmModel, demolishConfirmModel, expandConfirmModel, refreshConfirm, upgradeConfirmModel } from '../src/build/confirm';
import { buildGhostGeometry, dashedRibbon, GridView, reachArcPoints } from '../src/build/ghost';
import { HUD_GLYPHS, tooltipPos, upgradeProgressText } from '../src/build/hud';
import { hasGlyph, MODULE_GLYPH } from '../src/ui/icons';
import { fitDistance, ORBIT_LIMITS, OrbitRig, rescaleDistance } from '../src/build/orbit';
import { GRUA_RANGE } from '../src/sim/debris';
import { moduleStat } from '../src/sim/moduleStats';
import { anchorFor, continuousCell, intersectLevel, moduleAtCell, pickModule, toShipLocalRay } from '../src/build/picking';
import {
  explainPlacement,
  fallbackHint,
  levelHint,
  levelReason,
  levelsPhrase,
  placeHint,
  rotateHintText,
  stairSteps,
  type PlaceSpot,
} from '../src/build/advice';

/**
 * Pruebas exhaustivas (cada caso valida la colocación completa con `sim.checkPlace`): ~1-3 s a solas,
 * pero la batería corre en paralelo con otras y no deben fallar por el límite de 5 s.
 */
const HEAVY_TIMEOUT = 30_000;

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
    expect(txt('panel_solar')).toContain('+1,2 kW de día');
    expect(txt('potabilizadora')).toContain('−2 kW');
    expect(txt('potabilizadora')).toContain('+4 L/h');
    expect(txt('colector')).toContain('con lluvia');
    expect(txt('deposito')).toContain('+120 L');
    expect(txt('bateria')).toContain('20 kWh');
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
    expect(s.upgrades).toBe(0);
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
    expect(p.hint).toBe('Desmonta antes la escalera que sube a su techo');
    // Nombra lo que sostiene y lo que quedaría aislado (no "otra zona del barco").
    const dorm = ship.modules.find((m) => m.type === 'dormitorio')!;
    expect(demolishPreview(sim, dorm).reason).toBe('Sostiene el puente de mando');
    expect(demolishPreview(sim, dorm).hint).toBeNull();
    const escHold = ship.modules.find((m) => m.type === 'escalera' && m.level === 0)!;
    const e = demolishPreview(sim, escHold);
    expect(e.ok).toBe(false);
    expect(e.reason).toBe('Dejaría sin acceso el depósito de agua');
    expect(e.hint).toMatch(/otro acceso/);
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
    // Lo que falte para el coste base (40 madera, 16 placas, 24 tornillos), cuente lo que ya haya.
    const have0 = stock(sim);
    for (const [id, q] of Object.entries(HULL_EXPANSION.cost)) addItem(inv, id, Math.max(0, q - (have0[id] ?? 0)));
    x = expansionInfo(sim, stock(sim));
    expect(x.locked).toBe(false);
    expect(x.ok).toBe(true);
    expect(x.done).toBe(0);
    expect(Object.fromEntries(x.cost.map((c) => [c.id, c.need]))).toEqual(HULL_EXPANSION.cost);
    expect(x.cost.every((c) => c.ok)).toBe(true);
    expect(sim.expandHull().ok).toBe(true);
    x = expansionInfo(sim, stock(sim));
    expect(x.progress).not.toBeNull();
    expect(x.ok).toBe(false);
  });

  it('la ficha de ampliación muestra el coste escalado por las ampliaciones hechas', () => {
    const sim = Simulation.newGame(8);
    sim.state.unlocks.push('casco');
    sim.state.ship.hullTier = 1;
    const have0 = stock(sim);
    // Material justo para el coste base: con una ampliación hecha ya no basta (cuesta el doble).
    for (const [id, q] of Object.entries(HULL_EXPANSION.cost)) addItem(sim.state.player.inventory, id, Math.max(0, q - (have0[id] ?? 0)));
    const x = expansionInfo(sim, stock(sim));
    const chk = sim.checkExpandHull();
    expect(x.done).toBe(1);
    for (const c of x.cost) {
      expect(c.need, c.id).toBe(HULL_EXPANSION.cost[c.id as keyof typeof HULL_EXPANSION.cost] * 2);
      expect(c.need, c.id).toBe(chk.cost[c.id]);
      expect(c.ok, c.id).toBe(false);
    }
    expect(x.ok).toBe(false);
    expect(x.reason).toMatch(/^Faltan/);
  });

  it('desmontar un depósito avisa antes del agua que se perderá (ficha y confirmación)', () => {
    const sim = Simulation.newGame(7);
    sim.tick(1);
    const dep = sim.state.ship.modules.find((m) => m.type === 'deposito')!;
    const u = sim.state.utilities;
    const cap = moduleDef('deposito').waterCapacity!;
    expect(u.waterL).toBeGreaterThan(u.water.capacityL - cap);
    const p = demolishPreview(sim, dep);
    expect(p.ok).toBe(true);
    const expected = u.waterL - (u.water.capacityL - cap);
    expect(p.waterLossL).toBeCloseTo(expected, 0);
    expect(p.losses.join(' ')).toMatch(new RegExp(`Se perderán ${Math.round(expected)} L de agua: la capacidad baja a ${Math.round(u.water.capacityL - cap)} L`));
    // La estimación propia (si la simulación no lo dijera) coincide.
    const est = estimateLosses(sim, dep);
    expect(est.waterLossL).toBeCloseTo(p.waterLossL, 0);
    expect(est.losses).toEqual(p.losses);
    // Con poca agua no se pierde nada ni se avisa.
    u.waterL = 5;
    const q = demolishPreview(sim, dep);
    expect(q.waterLossL).toBe(0);
    expect(q.losses).toEqual([]);
    // Un módulo sin agua ni baterías no avisa de pérdidas.
    const alm = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    expect(demolishPreview(sim, alm).losses).toEqual([]);
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

/* ------------------------------------------------------------------ */

describe('motivos y pistas de colocación', () => {
  /** Sitio con el cursor centrado en la pieza (como lo dejaría el fantasma). */
  const spotAt = (id: string, level: number, x: number, z: number, rot: Rotation): PlaceSpot => {
    const def = moduleDef(id);
    const [fw, fd] = footprintSize(def, rot);
    return { def, level, x, z, rot, fx: x + fw / 2, fz: z + fd / 2 };
  };
  const explain = (sim: Simulation, s: PlaceSpot) => {
    const chk = sim.checkPlace(s.def.id, s.level, s.x, s.z, s.rot);
    const ex = explainPlacement(sim, s, chk.reason);
    return { chk, ex, hint: placeHint(sim, s, chk.reason, ex) };
  };

  it('el motivo de nivel dice qué niveles admite la pieza (escalera en la cubierta superior)', () => {
    const sim = Simulation.newGame(1);
    const { chk, ex, hint } = explain(sim, spotAt('escalera', 2, 3, 1, 0));
    expect(chk.ok).toBe(false);
    expect(ex.reason).toBe('La escalera solo se construye en la bodega o en la cubierta principal');
    expect(ex.reason).not.toMatch(/Solo se puede construir en la bodega/);
    expect(hint).toBe('Baja a la cubierta principal con Av Pág');
    expect(levelReason(moduleDef('motor'))).toBe('El motor auxiliar solo se construye en la bodega');
    expect(levelReason(moduleDef('colector'))).toBe('El colector de lluvia solo se construye en la cubierta principal o en la superior');
    expect(levelHint(moduleDef('colector'), 0)).toBe('Sube a la cubierta principal con Re Pág');
    expect(levelsPhrase([0, 1, 2])).toBe('en la bodega, en la cubierta principal o en la superior');
  });

  it('nombra lo que quedaría sin acceso (escalera ante la puerta del almacén)', () => {
    const sim = Simulation.newGame(1);
    const { chk, ex, hint } = explain(sim, spotAt('escalera', 1, 3, 2, 0));
    expect(chk.ok).toBe(false);
    expect(ex.reason).toMatch(/almacén/);
    expect(ex.reason).not.toBe('Dejaría otra zona del barco sin acceso');
    expect(hint).toBeTruthy();
  });

  it('en un techo sin escalera propone construirla y dónde (y el sitio propuesto vale)', () => {
    const sim = Simulation.newGame(1);
    const cocina = sim.state.ship.modules.find((m) => m.type === 'cocina')!;
    const s = spotAt('colector', 2, cocina.x, cocina.z, 0);
    const { chk, ex, hint } = explain(sim, s);
    expect(chk.ok).toBe(false);
    expect(ex.reason).toBe('No se puede subir a este techo');
    expect(ex.hint).toBe('Construye una escalera que suba a este techo');
    expect(hint).toBe('Construye una escalera junto a la cocina que suba a este techo');
    // La escalera propuesta se puede construir y, con ella, el techo de la cocina ya sirve.
    const it = stairSteps(sim, ex.area!);
    let r = it.next();
    while (!r.done) r = it.next();
    const stair = r.value!;
    expect(stair).not.toBeNull();
    const have = stock(sim);
    for (const [id, q] of Object.entries(moduleDef('escalera').cost)) addItem(sim.state.player.inventory, id, Math.max(0, q - (have[id] ?? 0)));
    expect(sim.placeModule('escalera', 1, stair.x, stair.z, stair.rot).ok).toBe(true);
    const roof = ex.area!.cells;
    const okSomewhere = roof.some((c) => [0, 1, 2, 3].some((rot) => {
      const k = sim.checkPlace('colector', 2, c.x, c.z, rot as Rotation);
      return k.ok || !!k.reason?.startsWith('Faltan');
    }));
    expect(okSomewhere).toBe(true);
  });

  it('"Pulsa R" solo propone giros que pasan la validación completa (con la pieza re-centrada)', () => {
    const sim = Simulation.newGame(1);
    const ship = sim.state.ship;
    let proposals = 0;
    for (const id of ['camarote', 'banco_trabajo']) {
      for (let x = 0; x < ship.length; x++) {
        for (let z = 0; z < ship.width; z++) {
          const s = spotAt(id, 1, x, z, 0);
          if (anchorFor(s.def, 0, s.fx, s.fz, ship)?.x !== x || anchorFor(s.def, 0, s.fx, s.fz, ship)?.z !== z) continue;
          const { chk, hint } = explain(sim, s);
          if (chk.ok || !hint?.startsWith('Pulsa R')) continue;
          proposals++;
          const k = hint === rotateHintText(1) ? 1 : hint === rotateHintText(2) ? 2 : 3;
          const rot = ((s.rot + k) % 4) as Rotation;
          const a = anchorFor(s.def, rot, s.fx, s.fz, ship)!;
          const c = sim.checkPlace(id, 1, a.x, a.z, rot);
          expect(c.ok || !!c.reason?.startsWith('Faltan'), `${id} ${x},${z} → R×${k}: ${c.reason}`).toBe(true);
          // Los giros intermedios no valían (si no, se habría propuesto menos pulsaciones).
          for (let j = 1; j < k; j++) {
            const r2 = ((s.rot + j) % 4) as Rotation;
            const b = anchorFor(s.def, r2, s.fx, s.fz, ship)!;
            const c2 = sim.checkPlace(id, 1, b.x, b.z, r2);
            expect(c2.ok || !!c2.reason?.startsWith('Faltan')).toBe(false);
          }
        }
      }
    }
    expect(proposals).toBeGreaterThan(0);
  }, HEAVY_TIMEOUT);

  it('todo motivo espacial de rechazo trae una pista de qué hacer', () => {
    const sim = Simulation.newGame(1);
    const ship = sim.state.ship;
    const seen = new Set<string>();
    for (const id of ['camarote', 'banco_trabajo', 'escalera', 'deposito', 'colector']) {
      // (Los niveles no admitidos los explica `levelReason`, probado aparte.)
      for (const l of moduleDef(id).levels)
        for (let x = 0; x < ship.length; x++)
          for (let z = 0; z < ship.width; z++)
            for (const rot of [0, 1] as Rotation[]) {
              const r = sim.checkPlace(id, l, x, z, rot).reason;
              if (r) seen.add(r);
            }
    }
    const spatial = [...seen].filter((r) => !r.startsWith('Faltan') && !r.startsWith('Necesitas'));
    expect(spatial.length).toBeGreaterThan(5);
    for (const r of spatial) expect(fallbackHint(r), r).toBeTruthy();
    // Motivos de la validación fina (muebles que tapan puertas): también orientan.
    for (const r of ['Taparía la puerta de la cocina', 'Dejaría la cama del camarote sin acceso', 'Bloquearía el paso por una escalera', 'Su puerta quedaría tapada: no se podría entrar', 'No quedaría sitio para usar el fogón'])
      expect(fallbackHint(r), r).toBeTruthy();
  }, HEAVY_TIMEOUT);
});

/* ------------------------------------------------------------------ */
/* Ronda de contenido 2: herramienta Mejorar, módulos nuevos, grúa y P5  */
/* ------------------------------------------------------------------ */

/** Pone en la mochila lo que falte para pagar `cost` (cuentan también los almacenes). */
function giveFor(sim: Simulation, cost: Record<string, number>): void {
  const have = stock(sim);
  for (const [id, q] of Object.entries(cost)) addItem(sim.state.player.inventory, id, Math.max(0, q - (have[id] ?? 0)));
}

describe('herramienta Mejorar: efectos legibles', () => {
  const texts = (type: string, a: number, b: number) => upgradeEffects(type, a, b).map((e) => e.text);

  it('capacidades, producciones y confort como diferencias ("+12 huecos", "+100 L")', () => {
    expect(texts('almacen', 1, 2)).toEqual(['+12 huecos']);
    expect(texts('almacen', 2, 3)).toEqual(['+16 huecos']);
    expect(texts('deposito', 1, 2)).toEqual(['+100 L']);
    expect(texts('colector', 1, 2)).toEqual(['+15 L', '+4 L/h con lluvia']);
    expect(texts('bateria', 1, 2)).toEqual(['+20 kWh']);
    expect(texts('panel_solar', 1, 2)).toEqual(['+0,6 kW de día']);
    expect(texts('camarote', 1, 2)).toEqual(['Confort +2']);
    expect(texts('motor', 1, 2)).toEqual(['+2 nudos']);
  });

  it('multiplicadores: "×1,5 velocidad", "−40 % agua", "−33 % combustible"; si ya estaba mejorado, de → a', () => {
    expect(texts('cocina', 1, 2)).toEqual(['+6 huecos', '×1,5 velocidad', '−33 % combustible']);
    expect(texts('huerto', 1, 2)).toEqual(['×1,2 crecimiento', '−40 % agua']);
    // El agua no cambia del nivel 2 al 3: no se anuncia.
    expect(texts('huerto', 2, 3)).toEqual(['Crecimiento ×1,2 → ×1,5']);
    expect(texts('generador', 1, 2)).toEqual(['+3 kW', '−23 % combustible']);
    expect(texts('generador', 2, 3)).toEqual(['+3 kW', 'Combustible −23 % → −38 %']);
    expect(texts('taller', 1, 2)).toEqual(['×1,6 velocidad', '−30 % desgaste']);
    expect(texts('enfermeria', 1, 2)).toEqual(['×1,5 curación']);
    expect(texts('potabilizadora', 1, 2)).toEqual(['+3 L/h', '−30 % desgaste']);
  });

  it('módulos nuevos: grúa con su alcance, vivero con su ritmo', () => {
    expect(texts('grua', 1, 2)).toEqual(['×1,6 velocidad', 'Alcance 30 → 37,5 m']);
    const viv = upgradeEffects('vivero', 1, 2);
    expect(viv.map((e) => e.text)).toEqual(['×1,6 velocidad']);
    expect(viv[0]!.title).toMatch(/Un pescado cada 1 h 34 min \(ahora cada 2 h 30 min\)/);
    expect(texts('sala_comun', 1, 2)).toEqual(['Confort +2']);
    expect(texts('ahumadero', 1, 2)).toEqual(['×1,6 velocidad']);
  });

  it('toda mejora definida anuncia algún efecto y sus glifos existen', () => {
    for (const def of MODULE_LIST) {
      for (const u of def.upgrades ?? []) {
        const fx = upgradeEffects(def.id, u.tier - 1, u.tier);
        expect(fx.length, `${def.id} → ${u.tier}`).toBeGreaterThan(0);
        for (const e of fx) expect(hasGlyph(e.glyph), `${def.id}: ${e.glyph}`).toBe(true);
      }
    }
  });
});

describe('herramienta Mejorar: estado de cada módulo', () => {
  it('encargar, ver la obra, cancelarla (se recupera todo) y terminarla', () => {
    const sim = Simulation.newGame(11);
    const alm = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    giveFor(sim, moduleDef('almacen').upgrades![0]!.cost);
    let u = upgradePreview(sim, alm);
    expect(u.state).toBe('ok');
    expect(u.name).toBe('Almacén');
    expect([u.tier, u.maxTier, u.toTier]).toEqual([1, 3, 2]);
    expect(u.nextName).toBe('Almacén con altillo');
    expect(u.timeText).toBe('1 h');
    expect(u.effects.map((e) => e.text)).toEqual(['+12 huecos']);
    expect(u.cost.every((c) => c.ok)).toBe(true);
    const before = stock(sim);

    expect(sim.startUpgrade(alm.id).ok).toBe(true);
    sim.tick(5);
    expect(shipSummary(sim).upgrades).toBe(1);
    expect(shipSummary(sim).works).toBe(0);
    u = upgradePreview(sim, alm);
    expect(u.state).toBe('busy');
    expect(u.progress).toBeGreaterThan(0);
    expect(u.etaMin).toBeGreaterThan(0);
    expect(u.cost.map((c) => [c.id, c.need])).toEqual(Object.entries(moduleDef('almacen').upgrades![0]!.cost));
    // La ficha general también cuenta la obra de mejora.
    const info = moduleInfo(sim, alm);
    expect(info.upgrade?.name).toBe('Almacén con altillo');
    expect(info.upgrade?.toTier).toBe(2);

    expect(sim.cancelUpgrade(alm.id).ok).toBe(true);
    expect(upgradePreview(sim, alm).state).toBe('ok');
    const after = stock(sim);
    for (const id of Object.keys(moduleDef('almacen').upgrades![0]!.cost)) expect(after[id], id).toBe(before[id]);

    expect(sim.startUpgrade(alm.id).ok).toBe(true);
    for (let i = 0; i < 60 && alm.upgrade; i++) sim.tick(1);
    expect(alm.tier).toBe(2);
    u = upgradePreview(sim, alm);
    expect(u.name).toBe('Almacén con altillo');
    expect(u.nextName).toBe('Almacén reforzado');
    expect(moduleInfo(sim, alm).name).toBe('Almacén con altillo');
    expect(moduleInfo(sim, alm).lines.join(' ')).toMatch(/\/32 huecos/);
  });

  it('motivos: faltan materiales, al máximo, no admite mejoras, averiado y ardiendo', () => {
    const sim = Simulation.newGame(12);
    const ship = sim.state.ship;
    const dep = ship.modules.find((m) => m.type === 'deposito')!;
    // Sin material suficiente: solo falta el coste (ámbar), con pista.
    for (const inv of [sim.state.player.inventory]) inv.slots.fill(null);
    for (const m of ship.modules) if (m.inventory) m.inventory.slots.fill(null);
    let u = upgradePreview(sim, dep);
    expect(u.state).toBe('cost');
    expect(u.reason).toMatch(/^Faltan/);
    expect(u.hint).toMatch(/materiales/);
    expect(u.cost.some((c) => !c.ok)).toBe(true);

    dep.tier = 3;
    u = upgradePreview(sim, dep);
    expect(u.state).toBe('max');
    expect(u.reason).toBe('Nivel máximo (3 de 3)');

    const esc = ship.modules.find((m) => m.type === 'escalera')!;
    expect(upgradePreview(sim, esc).state).toBe('none');
    expect(upgradePreview(sim, esc).reason).toBe('La escalera no admite mejoras');

    const coc = ship.modules.find((m) => m.type === 'cocina')!;
    coc.fire = 0.5;
    u = upgradePreview(sim, coc);
    expect(u.state).toBe('blocked');
    expect(u.reason).toMatch(/arde/);
    expect(u.hint).toMatch(/cubo/);
    coc.fire = 0;

    coc.status = 'broken';
    u = upgradePreview(sim, coc);
    expect(u.state).toBe('blocked');
    expect(u.reason).toMatch(/averiada: repárala primero/);
    expect(u.hint).toBe('Repárala con el martillo y un kit de reparación');
    // Aun bloqueada, la ficha enseña qué daría la mejora y cuánto cuesta.
    expect(u.nextName).toBe('Cocina de hierro');
    expect(u.cost.length).toBeGreaterThan(0);
  });

  it('la lista de mejoras: solo lo mejorable y construido, primero lo que se puede hacer ya', () => {
    const sim = Simulation.newGame(13);
    const ship = sim.state.ship;
    const alm = ship.modules.find((m) => m.type === 'almacen')!;
    giveFor(sim, moduleDef('almacen').upgrades![0]!.cost);
    ship.modules.find((m) => m.type === 'camarote')!.tier = 2;
    // Una obra nueva no sale en la lista (aún no se puede mejorar).
    giveFor(sim, moduleDef('camarote').cost);
    const res = sim.placeModule('camarote', 1, 6, 0, 2);
    expect(res.ok).toBe(true);
    const list = upgradeList(sim);
    expect(list.some((u) => u.id === res.moduleId)).toBe(false);
    expect(list.some((u) => u.type === 'escalera' || u.type === 'puente')).toBe(false);
    const order = { ok: 0, cost: 1, busy: 2, blocked: 3, max: 4, none: 5 } as const;
    for (let i = 1; i < list.length; i++) expect(order[list[i - 1]!.state]).toBeLessThanOrEqual(order[list[i]!.state]);
    expect(list.find((u) => u.id === alm.id)?.state).toBe('ok');
    expect(list[list.length - 1]!.state).toBe('max');
    expect(list[list.length - 1]!.type).toBe('camarote');
  });

  it('diálogos de mejorar y de cancelar la mejora: efectos, coste, tiempo y reembolso', () => {
    const sim = Simulation.newGame(17);
    const alm = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    giveFor(sim, moduleDef('almacen').upgrades![0]!.cost);
    const c = upgradeConfirmModel(upgradePreview(sim, alm));
    expect(c.kind).toBe('upgrade');
    expect(c.title).toBe('¿Mejorar el almacén?');
    expect(c.lines[0]).toMatch(/^Nivel 2: Almacén con altillo\. /);
    // Sin «unas 45 min» (minuto es masculino): la duración va sin artículo.
    expect(c.lines[1]).toMatch(/^La obra dura 1 h y el almacén se sigue usando mientras tanto\./);
    expect(c.chips?.map((e) => e.text)).toEqual(['+12 huecos']);
    expect(c.items.every((i) => i.have !== undefined && i.have >= i.qty)).toBe(true);
    expect(c.danger).toBe(false);

    expect(sim.startUpgrade(alm.id).ok).toBe(true);
    sim.tick(5);
    const k = cancelUpgradeConfirmModel(upgradePreview(sim, alm));
    expect(k.kind).toBe('cancelUpgrade');
    expect(k.title).toBe('¿Cancelar la mejora: Almacén con altillo?');
    expect(k.lines[0]).toMatch(/^La obra va por el \d+ % y le faltan \d+ min\. Si la cancelas, el almacén se queda en el nivel 1\.$/);
    expect(k.lines.join(' ')).not.toMatch(/\bunas\b/);
    expect(k.progress).toBeGreaterThan(0);
    expect(k.items.map((i) => [i.id, i.qty])).toEqual(Object.entries(moduleDef('almacen').upgrades![0]!.cost));
    expect(k.itemsLabel).toBe('Recuperas');
    expect(k.danger).toBe(true);
  });

  it('diálogos de desmontar (pérdidas, mejoras) y de ampliar (coste escalado)', () => {
    const sim = Simulation.newGame(18);
    sim.tick(1);
    const dep = sim.state.ship.modules.find((m) => m.type === 'deposito')!;
    dep.tier = 2;
    sim.tick(1);
    const u = sim.state.utilities;
    u.waterL = u.water.capacityL;
    const d = demolishConfirmModel(demolishPreview(sim, dep));
    expect(d.title).toBe('¿Desmontar el depósito ampliado?');
    expect(d.lines[0]).toMatch(/también de sus mejoras/);
    expect(d.warnings?.[0]).toMatch(/^Se perderán \d+ L de agua: la capacidad baja a \d+ L$/);
    expect(d.confirmLabel).toBe('Desmontar');

    sim.state.unlocks.push(HULL_EXPANSION.unlock);
    sim.state.ship.hullTier = 1;
    giveFor(sim, sim.checkExpandHull().cost);
    const info = expansionInfo(sim, stock(sim));
    const x = expandConfirmModel(info);
    expect(x.lines[1]).toBe(`La obra dura ${info.timeText}; puedes ayudar con el martillo en la proa.`);
    expect(x.lines[2]).toBe('Cada ampliación cuesta más que la anterior: esta es la 2.ª.');
    // El coste del diálogo es el escalado de la simulación, no el base de los datos.
    expect(Object.fromEntries(x.items.map((i) => [i.id, i.qty]))).toEqual(sim.checkExpandHull().cost);
  });

  it('desmontar: nombre con su nivel, mejora en obras y pérdidas con la capacidad mejorada', () => {
    const sim = Simulation.newGame(14);
    sim.tick(1);
    const dep = sim.state.ship.modules.find((m) => m.type === 'deposito')!;
    dep.tier = 2;
    const u = sim.state.utilities;
    // La red reconoce la capacidad mejorada; se llena para que algo se pierda.
    sim.tick(1);
    u.waterL = u.water.capacityL;
    const cap = moduleStat(dep, 'waterCapacity');
    expect(cap).toBe(220);
    const est = estimateLosses(sim, dep);
    expect(est.waterLossL).toBeCloseTo(u.waterL - (u.water.capacityL - cap), 0);
    const p = demolishPreview(sim, dep);
    expect(p.name).toBe('Depósito ampliado');
    expect(p.tier).toBe(2);
    expect(p.waterLossL).toBeCloseTo(est.waterLossL, 0);
    expect(p.upgradeInProgress).toBeNull();
    giveFor(sim, moduleDef('deposito').upgrades![1]!.cost);
    sim.state.unlocks.push('agua'); // el gran depósito (nivel 3) pide el plano de la potabilizadora
    expect(sim.startUpgrade(dep.id).ok).toBe(true);
    expect(demolishPreview(sim, dep).upgradeInProgress).toBe('Gran depósito');
  });
});

describe('paleta: módulos especializados de la ronda 2', () => {
  const txt = (id: string) => moduleStats(moduleDef(id)).map((s) => s.text);

  it('cada módulo nuevo está en su categoría', () => {
    expect(paletteModules('vivienda').map((d) => d.id)).toContain('sala_comun');
    for (const id of ['ahumadero', 'vivero', 'grua']) expect(paletteModules('produccion').map((d) => d.id)).toContain(id);
    expect(paletteModules('estructura').map((d) => d.id)).toContain('radar');
    // Atajos 1-9: ninguna categoría tiene más piezas que teclas.
    for (const c of CATEGORIES) expect(paletteModules(c.id).length + (c.id === 'estructura' ? 1 : 0)).toBeLessThanOrEqual(9);
  });

  it('estadísticas de lo que hace cada uno', () => {
    expect(txt('sala_comun')).toEqual(expect.arrayContaining(['Confort +4', 'Ocio y relaciones']));
    expect(txt('ahumadero')).toEqual(expect.arrayContaining(['3 en 1 h', '6 huecos', 'Cielo abierto']));
    expect(txt('vivero')).toEqual(expect.arrayContaining(['1 cada 2 h 30 min', '−0,5 kW']));
    expect(txt('grua')).toEqual(expect.arrayContaining([`Rescata a ${GRUA_RANGE} m`, 'Junto a la borda', '−0,4 kW']));
    // La grúa (solo cubierta) no repite "Cielo abierto": lo dice su regla de la borda.
    expect(txt('grua')).not.toContain('Cielo abierto');
    expect(txt('radar')).toEqual(expect.arrayContaining(['Tormentas 3 h antes', '−0,3 kW']));
    const ahum = moduleStats(moduleDef('ahumadero')).find((s) => s.text.startsWith('3 en'))!;
    expect(ahum.title).toMatch(/3× Pescado crudo \+ 1× Madera → 3× Pescado ahumado/);
  });

  it('las fichas dicen hasta qué nivel se mejora cada pieza', () => {
    const sim = Simulation.newGame(4);
    const have = stock(sim);
    const alm = cardInfo(sim, moduleDef('almacen'), have);
    expect(alm.maxTier).toBe(3);
    expect(alm.upgradesText).toMatch(/Nivel 2: Almacén con altillo · Nivel 3: Almacén reforzado/);
    expect(cardInfo(sim, moduleDef('escalera'), have).maxTier).toBe(1);
    expect(cardInfo(sim, moduleDef('escalera'), have).upgradesText).toBeNull();
    expect(cardInfo(sim, moduleDef('radar'), have).maxTier).toBe(1);
  });

  it('ficha de una grúa y de un vivero construidos: su estado automático', () => {
    const sim = Simulation.newGame(15);
    sim.state.unlocks.push('grua', 'acuicultura');
    giveFor(sim, moduleDef('grua').cost);
    const g = sim.placeModule('grua', 1, 7, 3, 0);
    expect(g.ok, g.msg).toBe(true);
    const grua = sim.state.ship.modules.find((m) => m.id === g.moduleId)!;
    grua.status = 'active';
    grua.buildProgress = 1;
    sim.shipChanged();
    sim.tick(1);
    const lines = moduleInfo(sim, grua).lines.join(' | ');
    expect(lines).toMatch(/Alcance 30 m por estribor · \d+ restos? a su alcance/);
  });

  it('el estado automático no repite lo que ya dice la ficha y los adjetivos concuerdan', () => {
    const sim = Simulation.newGame(16);
    sim.state.unlocks.push('grua', 'acuicultura');
    const build = (type: string, x: number, z: number) => {
      giveFor(sim, moduleDef(type).cost);
      const r = sim.placeModule(type, 1, x, z, 0);
      expect(r.ok, `${type}: ${r.msg}`).toBe(true);
      const m = sim.state.ship.modules.find((mm) => mm.id === r.moduleId)!;
      m.status = 'active';
      m.buildProgress = 1;
      return m;
    };
    const grua = build('grua', 7, 3);
    const viv = build('vivero', 8, 0);
    sim.shipChanged();
    // El barco inicial no genera electricidad: los dos están parados por falta de energía.
    for (const p of sim.state.ship.modules) if (moduleDef(p.type).powerGen) p.on = false;
    sim.tick(1);
    const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
    let g = moduleInfo(sim, grua).lines.join(' | ');
    expect(grua.powered).toBe(false);
    expect(count(g, /Sin energía/g), g).toBe(1);
    let v = moduleInfo(sim, viv).lines.join(' | ');
    expect(count(v, /Sin energía/g), v).toBe(1);
    expect(v).toMatch(/0\/\d+ pescados en la bandeja/);

    // Apagados: «Apagada» la grúa, «Apagado» el vivero, una sola vez cada uno.
    grua.on = false;
    viv.on = false;
    sim.tick(1);
    g = moduleInfo(sim, grua).lines.join(' | ');
    v = moduleInfo(sim, viv).lines.join(' | ');
    expect(count(g, /Apagad[ao]/g), g).toBe(1);
    expect(g).toContain('Apagada');
    expect(count(v, /Apagad[ao]/g), v).toBe(1);
    expect(v).toContain('Apagado');

    // Averiada (con el nombre femenino de la grúa); el estado de la ficha ya lo dice.
    grua.on = true;
    grua.status = 'broken';
    grua.brokenReason = 'cable roto';
    const info = moduleInfo(sim, grua);
    expect(info.state).toBe('Averiada: cable roto');
    expect(info.lines.join(' | ')).not.toMatch(/Averiad/);
    const coc = sim.state.ship.modules.find((m) => m.type === 'cocina')!;
    coc.condition = 30;
    expect(moduleInfo(sim, coc).state).toBe('Dañada');
  });
});

describe('grúa: junto a la borda', () => {
  const spotAt = (id: string, level: number, x: number, z: number): PlaceSpot => ({ def: moduleDef(id), level, x, z, rot: 0, fx: x + 0.5, fz: z + 0.5 });

  it('en el centro de la cubierta explica la regla y dónde va; en el borde vale', () => {
    const sim = Simulation.newGame(1);
    sim.state.unlocks.push('grua');
    giveFor(sim, moduleDef('grua').cost);
    const inner = spotAt('grua', 1, 7, 1);
    const chk = sim.checkPlace('grua', 1, 7, 1, 0);
    expect(chk.ok).toBe(false);
    const ex = explainPlacement(sim, inner, chk.reason);
    expect(ex.reason).toBe('La grúa de rescate debe ir junto a la borda');
    expect(ex.hint).toBe('Colócala en una celda del borde de la cubierta (en verde en la rejilla)');
    expect(placeHint(sim, inner, chk.reason, ex)).toBe(ex.hint);
    expect(fallbackHint(chk.reason)).toMatch(/borde/);
    // Borde de estribor y de babor.
    expect(sim.checkPlace('grua', 1, 7, 3, 0).ok).toBe(true);
    expect(sim.checkPlace('grua', 1, 8, 0, 0).ok).toBe(true);
  });

  it('la rejilla marca en verde las celdas libres del borde', () => {
    const sim = Simulation.newGame(1);
    const ship = sim.state.ship;
    const alpha = (edgeOnly: boolean) => {
      const grid = new GridView();
      grid.sync(sim.layout, ship, 1, edgeOnly);
      const fills = grid.group.children.find((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.getAttribute('color')) as THREE.Mesh;
      const pos = fills.geometry.getAttribute('position');
      const col = fills.geometry.getAttribute('color');
      const out: { edge: boolean; a: number; g: number }[] = [];
      const hw = (ship.width * CELL) / 2;
      for (let i = 0; i < pos.count; i += 6) {
        // Centro del cuadro (dos triángulos).
        let z = 0;
        for (let k = 0; k < 6; k++) z += pos.getZ(i + k) / 6;
        out.push({ edge: Math.abs(z) > hw - CELL, a: col.getW(i), g: col.getY(i) });
      }
      return out;
    };
    const normal = alpha(false);
    for (const c of normal) expect(c.a).toBeCloseTo(0.16, 5);
    const edge = alpha(true);
    expect(edge.some((c) => c.edge)).toBe(true);
    for (const c of edge) expect(c.a).toBeCloseTo(c.edge ? 0.42 : 0.05, 5);
  });

  it('el arco de alcance cubre solo su costado y tiene el radio de la pluma', () => {
    for (const side of [1, -1] as const) {
      const cz = side * 6;
      const pts = reachArcPoints(2, cz, GRUA_RANGE, side);
      expect(pts.length).toBeGreaterThan(10);
      for (const q of pts) {
        expect(q.z * side).toBeGreaterThanOrEqual(-1e-6);
        expect(Math.hypot(q.x - 2, q.z - cz)).toBeCloseTo(GRUA_RANGE, 6);
      }
      // Empieza y acaba en el eje del barco (z = 0) y pasa por el punto más alejado del costado.
      expect(pts[0]!.z).toBeCloseTo(0, 6);
      expect(pts[pts.length - 1]!.z).toBeCloseTo(0, 6);
      expect(Math.max(...pts.map((q) => q.z * side))).toBeCloseTo(6 + GRUA_RANGE, 1);
    }
    expect(reachArcPoints(0, 0, 0, 1)).toEqual([]);
    // Se dibuja como cinta discontinua (visible de lejos): trazos de 2,2 m y huecos de 1,4 m.
    const straight = dashedRibbon([{ x: 0, z: 0 }, { x: 10, z: 0 }], 1, 0.5, 2, 1);
    const pos = straight.getAttribute('position');
    expect(pos.count).toBe(4 * 6); // trazos en 0-2, 3-5, 6-8 y 9-10
    for (let i = 0; i < pos.count; i++) {
      expect(pos.getY(i)).toBe(1);
      expect(Math.abs(pos.getZ(i))).toBeCloseTo(0.25, 5);
    }
    const arc = dashedRibbon(reachArcPoints(2, 6, GRUA_RANGE, 1), 1.25, 0.55, 2.2, 1.4);
    expect(arc.getAttribute('position').count).toBeGreaterThan(100);
  });
});

describe('rótulos junto al cursor', () => {
  const base = { scale: 1, viewW: 1280, viewH: 720, paletteTop: 470 };
  it('a la derecha y debajo; a la izquierda o encima si no cabe', () => {
    expect(tooltipPos({ ...base, x: 300, y: 100, w: 240, h: 80 })).toEqual({ left: 318, top: 120 });
    expect(tooltipPos({ ...base, x: 1200, y: 100, w: 240, h: 80 }).left).toBe(1200 - 240 - 14);
    // Debajo pisaría la paleta: encima del cursor.
    expect(tooltipPos({ ...base, x: 300, y: 420, w: 240, h: 80 }).top).toBe(420 - 80 - 12);
  });

  it('una ficha alta que no cabe ni encima ni debajo queda sobre la paleta, no pegada a los avisos de arriba', () => {
    // Ficha de 300 px con el cursor a 230 px: debajo acabaría en 550 (> 464) y encima empezaría en −82.
    const p = tooltipPos({ ...base, x: 640, y: 230, w: 292, h: 300 });
    expect(p.top).toBe(470 - 6 - 300);
    expect(p.top + 300).toBeLessThanOrEqual(470 - 6);
    expect(p.left).toBe(658);
    // Más alta que el hueco: se queda en el margen superior.
    expect(tooltipPos({ ...base, x: 640, y: 230, w: 292, h: 600 }).top).toBe(6);
    // Con el cursor sobre la paleta (o sin paleta), el límite es el borde de la ventana.
    expect(tooltipPos({ ...base, paletteTop: null, x: 640, y: 230, w: 292, h: 300 }).top).toBe(250);
  });
});

describe('P5: reencuadre de la cámara al redimensionar', () => {
  it('conserva el zoom relativo y encuadra el casco en una ventana vertical', () => {
    const wide = fitDistance(40, 50, 16 / 9);
    const tall = fitDistance(40, 50, 700 / 900);
    expect(tall).toBeGreaterThan(wide);
    // En vertical ya no topa con el límite: el casco entero cabe.
    expect(tall).toBeLessThan(ORBIT_LIMITS.maxDist - 5);
    // Sin zoom propio: pasa justo al nuevo encuadre; con zoom ×0,5, sigue a la mitad.
    expect(rescaleDistance(wide, wide, tall)).toBeCloseTo(tall);
    expect(rescaleDistance(wide * 0.5, wide, tall)).toBeCloseTo(tall * 0.5);
    // Límites y valores no válidos.
    expect(rescaleDistance(ORBIT_LIMITS.maxDist, 20, 80)).toBe(ORBIT_LIMITS.maxDist);
    expect(rescaleDistance(30, 0, 50)).toBe(50);
    expect(rescaleDistance(Number.NaN, 40, 50)).toBe(50);
  });
});

/* ------------------------------------------------------------------ */
/* Ronda de pruebas 2 (fix-ui): mejoras paradas, textos y diálogos al día */
/* ------------------------------------------------------------------ */

describe('fix-ui: mejora parada por el fuego', () => {
  it('ni cuenta atrás, ni «se sigue usando», ni el martillo: dice que está parada y qué hacer', () => {
    const sim = Simulation.newGame(11);
    const alm = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    giveFor(sim, moduleDef('almacen').upgrades![0]!.cost);
    expect(sim.startUpgrade(alm.id).ok).toBe(true);
    sim.tick(5);
    let u = upgradePreview(sim, alm);
    expect(u.paused).toBeNull();
    expect(u.inUse).toBe(true);
    expect(upgradeProgressText(u)).toMatch(/^\d+ % · faltan \d+ min$/);

    alm.fire = 40;
    const frozen = alm.upgrade!.progress;
    sim.tick(10);
    expect(alm.upgrade!.progress).toBe(frozen); // la simulación la pausa de verdad
    expect(upgradeStall(alm)).toBe('fuego');
    u = upgradePreview(sim, alm);
    expect(u.state).toBe('busy');
    expect(u.paused).toBe('fuego');
    expect(u.etaMin).toBeNull();
    expect(u.inUse).toBe(false);
    expect(u.hint).toMatch(/cubo/);
    expect(upgradeProgressText(u)).toMatch(/^\d+ % · obra parada mientras arde$/);
    expect(upgradeProgressText(u, true)).toMatch(/parada por el fuego$/);
    // Ficha general: sin «faltan».
    const info = moduleInfo(sim, alm);
    expect(info.upgrade?.paused).toBe('fuego');
    expect(info.upgrade?.etaMin).toBeNull();
    // Diálogo de cancelar: dice que está parada, no los minutos que faltan.
    const k = cancelUpgradeConfirmModel(u);
    expect(k.lines.join(' ')).not.toMatch(/faltan/);
    expect(k.lines[0]).toMatch(/^La obra va por el \d+ % y está parada mientras arde: si apagas el fuego, seguirá donde se quedó\. Si la cancelas, el almacén se queda en el nivel 1\.$/);
    expect(k.progressTone).toBe('bad');
    // Y el martillo no ayuda (por eso no se aconseja).
    addItem(sim.state.player.inventory, 'martillo', 1);
    expect(sim.helpBuild(alm.id, 5).ok).toBe(false);

    // Apagado: vuelve la cuenta atrás.
    alm.fire = 0;
    u = upgradePreview(sim, alm);
    expect(u.paused).toBeNull();
    expect(u.etaMin).toBeGreaterThan(0);
    expect(moduleInfo(sim, alm).upgrade?.etaMin).toBeGreaterThan(0);
    expect(cancelUpgradeConfirmModel(u).lines[0]).toMatch(/y le faltan \d+ min/);
    // Averiado: la obra sigue, pero el módulo no se usa.
    alm.status = 'broken';
    expect(upgradePreview(sim, alm).inUse).toBe(false);
    expect(upgradePreview(sim, alm).paused).toBeNull();
  });
});

describe('fix-ui: efectos de confort de las mejoras', () => {
  it('el dormitorio con taquillas no promete descanso; el camarote acogedor sí, con su número', () => {
    const conf = (type: string) => upgradeEffects(type, 1, 2).find((e) => e.glyph === 'smile')!;
    expect(bedRestBonus('dormitorio', 2) - bedRestBonus('dormitorio', 1)).toBe(0);
    expect(conf('dormitorio').title).not.toMatch(/descans/i);
    expect(conf('dormitorio').title).toMatch(/mejor ánimo de quien duerme aquí/);
    expect(bedRestBonus('camarote', 2)).toBeGreaterThan(bedRestBonus('camarote', 1));
    expect(conf('camarote').title).toMatch(/mejor descanso en sus camas: \+2 de energía por hora durmiendo/);
  });

  it('ninguna mejora con camas promete descanso que no da (ni lo calla si lo da)', () => {
    for (const def of MODULE_LIST) {
      for (const up of def.upgrades ?? []) {
        const chip = upgradeEffects(def.id, up.tier - 1, up.tier).find((e) => e.glyph === 'smile');
        if (!chip) continue;
        const gain = bedRestBonus(def.id, up.tier) - bedRestBonus(def.id, up.tier - 1);
        if (gain > 0) expect(chip.title, `${def.id} → ${up.tier}`).toMatch(/descanso/);
        else expect(chip.title, `${def.id} → ${up.tier}`).not.toMatch(/descans/i);
      }
    }
  });
});

describe('fix-ui: los diálogos de confirmación siguen a la simulación', () => {
  it('cancelar la mejora: el progreso avanza, se para si arde y, si termina, el diálogo se cierra', () => {
    const sim = Simulation.newGame(17);
    const cam = sim.state.ship.modules.find((m) => m.type === 'camarote')!;
    giveFor(sim, moduleDef('camarote').upgrades![0]!.cost);
    expect(sim.startUpgrade(cam.id).ok).toBe(true);
    sim.tick(2);
    const target = { kind: 'cancelUpgrade' as const, moduleId: cam.id };
    const r1 = refreshConfirm(sim, target);
    expect('model' in r1).toBe(true);
    const p1 = 'model' in r1 ? r1.model.progress! : 0;
    sim.tick(10);
    const r2 = refreshConfirm(sim, target);
    expect('model' in r2 && r2.model.progress! > p1).toBe(true);
    expect('model' in r2 && r2.model.title).toBe(cancelUpgradeConfirmModel(upgradePreview(sim, cam)).title);
    cam.fire = 30;
    const r3 = refreshConfirm(sim, target);
    expect('model' in r3 && r3.model.lines[0]).toMatch(/parada mientras arde/);
    cam.fire = 0;
    cam.upgrade!.progress = 0.9999;
    sim.tick(1);
    expect(cam.tier).toBe(2);
    const r4 = refreshConfirm(sim, target);
    expect('close' in r4 && r4.close).toBe('La mejora ya ha terminado (ahora es el camarote acogedor): no hay nada que cancelar');
  });

  it('cancelar una obra que termina, desmontar algo que ya no está y mejorar sin poder pagarlo: se cierran', () => {
    const sim = Simulation.newGame(18);
    giveFor(sim, moduleDef('camarote').cost);
    const res = sim.placeModule('camarote', 1, 6, 0, 2);
    expect(res.ok).toBe(true);
    const id = res.moduleId!;
    const obra = { kind: 'demolish' as const, moduleId: id, obra: true };
    const r1 = refreshConfirm(sim, obra);
    expect('model' in r1 && r1.model.title).toMatch(/^¿Cancelar la obra/);
    sim.state.ship.modules.find((m) => m.id === id)!.buildProgress = 0.9999;
    sim.tick(1);
    // Ya no es «cancelar la obra» (todo de vuelta) sino «desmontar» (la mitad): no se confirma a ciegas.
    const r2 = refreshConfirm(sim, obra);
    expect('close' in r2 && r2.close).toMatch(/La obra ya ha terminado/);
    expect('model' in refreshConfirm(sim, { kind: 'demolish', moduleId: id, obra: false })).toBe(true);
    expect(sim.demolish(id).ok).toBe(true);
    const r3 = refreshConfirm(sim, { kind: 'demolish', moduleId: id, obra: false });
    expect('close' in r3 && r3.close).toBe('Ese módulo ya no está en el barco');

    const dep = sim.state.ship.modules.find((m) => m.type === 'deposito')!;
    giveFor(sim, moduleDef('deposito').upgrades![0]!.cost);
    const up = { kind: 'upgrade' as const, moduleId: dep.id };
    expect('model' in refreshConfirm(sim, up)).toBe(true);
    sim.state.player.inventory.slots.fill(null);
    for (const m of sim.state.ship.modules) if (m.inventory) m.inventory.slots.fill(null);
    const r4 = refreshConfirm(sim, up);
    expect('close' in r4 && r4.close).toMatch(/^Depósito de agua: Faltan/);
  });
});

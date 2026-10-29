/**
 * Pruebas del área game-player: puntería, selección de objetivos, borda, cámara en tercera
 * persona, locomoción (incluidas las escaleras) y textos de los avisos.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { CELL, HOOK_RANGE, INTERACT_RANGE, LEVEL_H } from '../src/sim/constants';
import { spawnDebris } from '../src/sim/debris';
import { startFire } from '../src/sim/events';
import { addItem } from '../src/sim/inventory';
import { createNewGame } from '../src/sim/newGame';
import { EYE_HEIGHT, type Body } from '../src/sim/physics';
import { cellCenter } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import { angleTo, lookDir, rayAabb, segmentBlocked, wrapAngle, yawPitchTo, type V3 } from '../src/game/tools/aim';
import { ARM_LENGTH, computeArm, verticalLimits } from '../src/game/tools/cameraRig';
import { approachVelocity, stepAssist } from '../src/game/tools/locomotion';
import { chooseBed, cratePrompt, npcPrompt, propAction, propPrompt, sitePrompt } from '../src/game/tools/prompts';
import { canHookFrom, railFacing, scanDebris, scanFire, scanFocus, scanRepair, type Aim } from '../src/game/tools/targets';
import { samplePose } from '../src/game/tools/viewmodel';

function aimAt(sim: Simulation, feet: V3, target: V3): Aim {
  const eye = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
  const yp = yawPitchTo(eye, target);
  return { sim, pos: feet, eye, dir: lookDir(yp.yaw, yp.pitch) };
}

function aimDir(sim: Simulation, feet: V3, yaw: number, pitch: number): Aim {
  return { sim, pos: feet, eye: { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z }, dir: lookDir(yaw, pitch) };
}

/** Simula al jugador avanzando con velocidad constante (con la ayuda de escalones). */
function walk(sim: Simulation, body: Body, vx: number, vz: number, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    const { x, y, z } = body.pos;
    const grounded = body.onGround;
    sim.collision.move(body, vx, vz, dt, false);
    if (grounded) stepAssist(sim.collision, body, x, y, z, vx, vz, dt);
  }
}

describe('aim (geometría de puntería)', () => {
  const box = { minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -1, maxZ: 1 };

  it('rayAabb: impacto, fallo y origen dentro', () => {
    expect(rayAabb({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, box)).toBeCloseTo(4);
    expect(rayAabb({ x: -5, y: 3, z: 0 }, { x: 1, y: 0, z: 0 }, box)).toBeNull();
    expect(rayAabb({ x: -5, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }, box)).toBeNull();
    expect(rayAabb({ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, box)).toBe(0);
    expect(rayAabb({ x: -5, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, box, 3)).toBeNull();
  });

  it('segmentBlocked: una caja entre medias tapa; las que contienen los extremos no', () => {
    expect(segmentBlocked({ x: -5, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, [box])).toBe(true);
    expect(segmentBlocked({ x: -5, y: 1, z: 3 }, { x: 5, y: 1, z: 3 }, [box])).toBe(false);
    expect(segmentBlocked({ x: 0, y: 1, z: 0 }, { x: 5, y: 1, z: 0 }, [box])).toBe(false);
  });

  it('lookDir y yawPitchTo son inversas; wrapAngle normaliza', () => {
    const d = lookDir(0.7, -0.3);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1);
    const yp = yawPitchTo({ x: 0, y: 0, z: 0 }, d);
    expect(yp.yaw).toBeCloseTo(0.7);
    expect(yp.pitch).toBeCloseTo(-0.3);
    // yaw 0 mira hacia -z (convención three.js)
    expect(lookDir(0, 0).z).toBeCloseTo(-1);
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2);
    expect(angleTo({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 5 })).toBeCloseTo(Math.PI / 2);
  });
});

describe('locomoción', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  it('acelera y frena de forma progresiva', () => {
    const v = { x: 0, z: 0 };
    approachVelocity(v, 3.4, 0, 26, 1 / 60);
    expect(v.x).toBeGreaterThan(0.3);
    expect(v.x).toBeLessThan(0.6);
    for (let i = 0; i < 30; i++) approachVelocity(v, 3.4, 0, 26, 1 / 60);
    expect(v.x).toBeCloseTo(3.4);
    approachVelocity(v, 0, 0, 32, 1 / 60);
    expect(v.x).toBeGreaterThan(2.5);
  });

  it('baja a la bodega y vuelve a subir a cubierta por la escalera', () => {
    const top = cellCenter(7, 3, sim.state.ship.width);
    const body: Body = { pos: { x: top.x, y: LEVEL_H, z: top.z + 1 }, vy: 0, onGround: true };
    walk(sim, body, 0, -3.4, 3.5);
    expect(body.pos.y).toBeLessThan(0.05);
    const bottomZ = body.pos.z;
    walk(sim, body, 0, 3.4, 4);
    expect(body.pos.y).toBeCloseTo(LEVEL_H, 2);
    expect(body.pos.z).toBeGreaterThan(top.z - CELL / 2);
    expect(bottomZ).toBeLessThan(top.z - CELL);
  });

  it('sube al puente: rampa hasta el techo del camarote y entra por la puerta', () => {
    const body: Body = { pos: { x: 2.5, y: LEVEL_H, z: -6 }, vy: 0, onGround: true };
    walk(sim, body, -3.4, 0, 5);
    expect(body.pos.y).toBeCloseTo(2 * LEVEL_H, 2);
    // Puerta del puente en x = -8: ya dentro del puente.
    expect(body.pos.x).toBeLessThan(-8.5);
    // Y vuelve a bajar.
    walk(sim, body, 3.4, 0, 5);
    expect(body.pos.y).toBeCloseTo(LEVEL_H, 2);
  });

  it('la ayuda de escalón no sirve para atravesar paredes ni barandillas', () => {
    // Contra la barandilla de babor.
    const b: Body = { pos: { x: 4, y: LEVEL_H, z: -6 }, vy: 0, onGround: true };
    walk(sim, b, 0, -4, 2);
    expect(b.pos.z).toBeGreaterThan(-8);
    // Contra la pared del almacén (sin puerta en ese tramo).
    const c = cellCenter(4, 3, sim.state.ship.width);
    const w: Body = { pos: { x: c.x, y: LEVEL_H, z: c.z }, vy: 0, onGround: true };
    walk(sim, w, -4, 0, 2);
    expect(w.pos.x).toBeGreaterThan(cellCenter(3, 3, sim.state.ship.width).x + 2);
  });
});

describe('selección de objetivos', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  it('enfoca la estantería del almacén desde la puerta y propone abrirlo', () => {
    const shelf = sim.layout.props.find((p) => p.interact === 'almacen')!;
    const feet = { x: -6, y: LEVEL_H, z: 5.3 };
    const f = scanFocus(aimAt(sim, feet, { x: shelf.x, y: shelf.y + 1, z: shelf.z }));
    expect(f?.kind).toBe('prop');
    expect(f?.prop?.interact).toBe('almacen');
    expect(propAction(sim, f!.prop!)).toEqual({ kind: 'station', moduleId: shelf.moduleId });
    expect(propPrompt(sim, f!.prop!)?.text).toBe('Abrir el almacén');
  });

  it('no enfoca nada a través de una pared ni fuera de alcance', () => {
    const shelf = sim.layout.props.find((p) => p.interact === 'almacen' && p.kind === 'estanteria')!;
    // Desde la cubierta, al otro lado de la pared lateral del almacén.
    const feet = { x: -2.5, y: LEVEL_H, z: 6 };
    const f = scanFocus(aimAt(sim, feet, { x: shelf.x, y: shelf.y + 1, z: shelf.z }));
    expect(f?.prop?.moduleId === shelf.moduleId).toBe(false);
    // Muy lejos.
    const far = scanFocus(aimAt(sim, { x: 10, y: LEVEL_H, z: 0 }, { x: shelf.x, y: shelf.y + 1, z: shelf.z }));
    expect(far).toBeNull();
  });

  it('prefiere al habitante al que se mira y no ve objetos de otro nivel', () => {
    const npc = sim.state.npcs[0]!;
    const feet = { x: npc.pos.x + 2, y: LEVEL_H, z: npc.pos.z };
    const f = scanFocus(aimAt(sim, feet, { x: npc.pos.x, y: npc.pos.y + 1.4, z: npc.pos.z }));
    expect(f?.kind).toBe('npc');
    expect(f?.npc?.id).toBe(npc.id);
    // Desde la bodega, justo debajo, no se le puede hablar.
    const below = scanFocus(aimAt(sim, { x: npc.pos.x + 2, y: 0, z: npc.pos.z }, { x: npc.pos.x, y: 1.4, z: npc.pos.z }));
    expect(below?.npc?.id === npc.id).toBe(false);
  });

  it('las cajas sueltas y las obras se pueden enfocar', () => {
    sim.state.crates.push({ id: 900, pos: { x: 6, y: LEVEL_H, z: -2 }, inventory: { slots: [{ id: 'madera', qty: 3 }] }, label: 'Caja de prueba' });
    const f = scanFocus(aimAt(sim, { x: 4.2, y: LEVEL_H, z: -2 }, { x: 6, y: LEVEL_H + 0.3, z: -2 }));
    expect(f?.kind).toBe('crate');
    const r = sim.placeModule('colector', 1, 9, 2, 0);
    expect(r.ok).toBe(true);
    const c = cellCenter(9, 2, sim.state.ship.width);
    const site = scanFocus(aimAt(sim, { x: c.x - 3.2, y: LEVEL_H, z: c.z }, { x: c.x, y: LEVEL_H + 1, z: c.z }));
    expect(site?.kind).toBe('site');
    expect(site?.moduleId).toBe(r.moduleId);
    const p = sitePrompt(sim, r.moduleId!, true, false)!;
    expect(p.key).toBe('Mantén E');
    expect(p.text).toContain('Colector de lluvia');
    expect(sitePrompt(sim, r.moduleId!, false, false)?.disabled).toBe(true);
  });

  it('elige la cama propia y explica por qué no se puede dormir de día', () => {
    const bed = sim.layout.props.find((p) => p.moduleType === 'camarote' && p.interact === 'dormir')!;
    sim.state.player.pos = { x: bed.x, y: LEVEL_H, z: bed.z + 1.6 };
    expect(chooseBed(sim, bed)).toBe(0);
    const pr = propPrompt(sim, bed)!;
    expect(pr.text).toBe('Dormir');
    // A las 7:00 con energía 90 no tiene sueño.
    expect(pr.disabled).toBe(true);
    expect(pr.sub).toMatch(/sueño/);
    // Literas del dormitorio: son de Marina y Tomás.
    const litera = sim.layout.props.find((p) => p.kind === 'litera' && p.index === 0)!;
    sim.state.player.pos = { x: litera.x, y: LEVEL_H, z: litera.z + 1.6 };
    expect(propPrompt(sim, litera)?.sub).toMatch(/Marina|Tomás/);
  });

  it('detecta módulos dañados para reparar y fuegos al alcance del cubo', () => {
    const almacen = sim.state.ship.modules.find((m) => m.type === 'almacen')!;
    almacen.condition = 30;
    const feet = { x: -6, y: LEVEL_H, z: 2.6 };
    const aim = aimDir(sim, feet, Math.PI, -0.1);
    const r = scanRepair(aim, scanFocus(aim));
    expect(r?.module.id).toBe(almacen.id);
    expect(r?.info.tool).toBe('martillo');
    expect(r?.info.ok).toBe(false); // falta el kit
    addItem(sim.state.player.inventory, 'kit_reparacion', 1);
    expect(scanRepair(aim, null)?.info.ok).toBe(true);
    // Fuego en la cocina, visto desde su puerta.
    const cocina = sim.state.ship.modules.find((m) => m.type === 'cocina')!;
    startFire(sim, cocina, 40);
    const fire = scanFire(aimAt(sim, { x: -14, y: LEVEL_H, z: 2.3 }, { x: -11, y: LEVEL_H + 1.1, z: 6.5 }));
    expect(fire?.module.id).toBe(cocina.id);
    // Lejos del fuego, nada.
    expect(scanFire(aimDir(sim, { x: 10, y: LEVEL_H, z: 0 }, 0, 0))).toBeNull();
  });
});

describe('avisos y acciones de la tecla E', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  it('el timón y la carta abren el panel del timón; las camas acuestan; el resto abre su estación', () => {
    const timon = sim.layout.props.find((p) => p.kind === 'timon')!;
    const carta = sim.layout.props.find((p) => p.kind === 'carta_nautica')!;
    expect(propAction(sim, timon)).toEqual({ kind: 'helm' });
    expect(propAction(sim, carta)).toEqual({ kind: 'helm' });
    expect(propPrompt(sim, timon)?.text).toMatch(/Timón/);
    const cama = sim.layout.props.find((p) => p.moduleType === 'camarote' && p.interact === 'dormir')!;
    expect(propAction(sim, cama)).toEqual({ kind: 'sleep', moduleId: cama.moduleId, bed: 0 });
    for (const kind of ['fogon', 'despensa', 'banco', 'colector', 'deposito'] as const) {
      const prop = sim.layout.props.find((p) => p.kind === kind)!;
      expect(propAction(sim, prop)).toEqual({ kind: 'station', moduleId: prop.moduleId });
      expect(propPrompt(sim, prop)?.key).toBe('E');
    }
    expect(propPrompt(sim, sim.layout.props.find((p) => p.kind === 'deposito')!)?.sub).toMatch(/Agua potable/);
  });

  it('avisa del estado del módulo (avería, fuego) en el texto secundario', () => {
    const banco = sim.layout.props.find((p) => p.kind === 'banco')!;
    const m = sim.state.ship.modules.find((mm) => mm.id === banco.moduleId)!;
    m.condition = 20;
    expect(propPrompt(sim, banco)?.sub).toMatch(/Dañado/);
    m.status = 'broken';
    m.brokenReason = 'Desgaste';
    expect(propPrompt(sim, banco)?.sub).toMatch(/Averiado: Desgaste/);
  });

  it('habitantes y cajas', () => {
    const npc = sim.state.npcs[0]!;
    const p = npcPrompt(sim, npc);
    expect(p.text).toBe(`Hablar con ${npc.name}`);
    const c = cratePrompt({ id: 1, pos: { x: 0, y: 0, z: 0 }, label: 'Restos', inventory: { slots: [{ id: 'madera', qty: 2 }, null, { id: 'cuerda', qty: 1 }] } });
    expect(c.text).toBe('Abrir: Restos');
    expect(c.sub).toBe('2 pilas de objetos');
  });
});

describe('borda, gancho y restos', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  it('railFacing: junto a la borda mirando al agua sí; mirando hacia dentro o lejos, no', () => {
    const feet = { x: 6, y: LEVEL_H, z: -6.6 };
    expect(railFacing(sim, feet, lookDir(0, -0.3)).ok).toBe(true);
    const inward = railFacing(sim, feet, lookDir(Math.PI, -0.3));
    expect(inward.ok).toBe(false);
    expect(inward.posOk).toBe(true);
    const far = railFacing(sim, { x: 6, y: LEVEL_H, z: -2 }, lookDir(0, -0.3));
    expect(far.ok).toBe(false);
    expect(far.posOk).toBe(false);
    expect(railFacing(sim, { x: 10, y: 0, z: -6.6 }, lookDir(0, -0.3)).reason).toMatch(/cubierta/);
  });

  it('el gancho solo se lanza desde cubierta a cielo abierto', () => {
    expect(canHookFrom(sim, { x: 4, y: LEVEL_H, z: -6 })).toBeNull();
    expect(canHookFrom(sim, { x: 10, y: 0, z: -2 })).toMatch(/cubierta/);
    expect(canHookFrom(sim, { x: -6, y: LEVEL_H, z: 6 })).toMatch(/cubierta/);
  });

  it('scanDebris elige el resto cercano al rayo de la cámara y respeta el alcance', () => {
    const near = spawnDebris(sim, 'caja', { x: 6, z: -17 });
    const other = spawnDebris(sim, 'barril', { x: -10, z: -15 });
    const feet = { x: 4, y: LEVEL_H, z: -6.4 };
    const eye = { x: feet.x, y: feet.y + EYE_HEIGHT, z: feet.z };
    const yp = yawPitchTo(eye, { x: near.pos.x, y: 1.2, z: near.pos.z });
    const t = scanDebris(sim.state.debris, eye, lookDir(yp.yaw, yp.pitch), feet, () => 1, () => 0.6, HOOK_RANGE + 10);
    expect(t?.debris.id).toBe(near.id);
    expect(t!.dist).toBeLessThan(HOOK_RANGE);
    // Mirando al otro, el otro.
    const yp2 = yawPitchTo(eye, { x: other.pos.x, y: 1.2, z: other.pos.z });
    expect(scanDebris(sim.state.debris, eye, lookDir(yp2.yaw, yp2.pitch), feet, () => 1, () => 0.6, HOOK_RANGE + 10)?.debris.id).toBe(other.id);
    // Mirando al cielo, ninguno.
    expect(scanDebris(sim.state.debris, eye, lookDir(yp.yaw, 0.9), feet, () => 1, () => 0.6, HOOK_RANGE + 10)).toBeNull();
  });
});

describe('cámara en tercera persona', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  it('en cubierta abierta el brazo queda completo', () => {
    const r = computeArm({ layout: sim.layout, feet: { x: 6, y: LEVEL_H, z: 0 }, yaw: -Math.PI / 2, pitch: -0.2, length: ARM_LENGTH });
    expect(r.blocked).toBe(false);
    expect(r.length).toBeCloseTo(ARM_LENGTH, 3);
    // Detrás del jugador (mira hacia +x, la cámara queda en -x).
    expect(r.pos.x).toBeLessThan(6);
  });

  it('se acorta contra una pared y no atraviesa el techo de una habitación', () => {
    // Dentro del almacén mirando hacia su puerta: detrás está la pared del fondo.
    const feet = { x: -6, y: LEVEL_H, z: 5.2 };
    const r = computeArm({ layout: sim.layout, feet, yaw: Math.PI * 0 + Math.PI, pitch: 0.9, length: ARM_LENGTH });
    expect(r.length).toBeLessThan(ARM_LENGTH);
    const lim = verticalLimits(sim.layout, feet);
    expect(r.pos.y).toBeLessThanOrEqual(lim.ceil + 1e-6);
    expect(lim.ceil).toBeLessThan(2 * LEVEL_H);
    // En la bodega el techo es la cubierta.
    expect(verticalLimits(sim.layout, { x: 10, y: 0, z: -2 }).ceil).toBeLessThan(LEVEL_H);
  });

  it('el pivote está a la altura de la cabeza del personaje', () => {
    const r = computeArm({ layout: sim.layout, feet: { x: 6, y: LEVEL_H, z: 0 }, yaw: 0, pitch: 0, length: 0 });
    expect(r.pivot.y).toBeGreaterThan(LEVEL_H + 1.4);
    expect(r.pos).toEqual(r.pivot);
  });
});

describe('animaciones del modelo en mano', () => {
  it('samplePose interpola entre fotogramas clave', () => {
    const def = { dur: 1, keys: [{ t: 0, p: {} }, { t: 1, p: { rx: 1, y: -0.5 } }] };
    const out = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    samplePose(def, 0, out);
    expect(out.rx).toBe(0);
    samplePose(def, 0.5, out);
    expect(out.rx).toBeCloseTo(0.5);
    samplePose(def, 2, out);
    expect(out.rx).toBe(1);
    expect(out.y).toBe(-0.5);
  });
});

describe('alcances', () => {
  it('el alcance de interacción es razonable para el tamaño de las celdas', () => {
    expect(INTERACT_RANGE).toBeLessThan(CELL);
  });
});

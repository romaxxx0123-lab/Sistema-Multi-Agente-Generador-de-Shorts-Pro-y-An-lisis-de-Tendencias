/**
 * Pruebas del área game-player: puntería, selección de objetivos, borda, cámara en tercera
 * persona, locomoción (incluidas las escaleras) y textos de los avisos.
 */
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { GameContext } from '../src/game/context';
import { HOLD_PANEL, Interaction } from '../src/game/Interaction';
import { LOOK_GRACE_FRAMES, LOOK_GRACE_TIME, PlayerController } from '../src/game/PlayerController';
import type { PanelRequest, PromptInfo } from '../src/game/types';
import type { PlayerAvatar } from '../src/render/PlayerAvatar';
import { CELL, HOOK_RANGE, INTERACT_RANGE, LEVEL_H } from '../src/sim/constants';
import { spawnDebris } from '../src/sim/debris';
import { startFire } from '../src/sim/events';
import { addItem, countItem } from '../src/sim/inventory';
import { createNewGame } from '../src/sim/newGame';
import { EYE_HEIGHT, PLAYER_RADIUS, type Body } from '../src/sim/physics';
import { cellCenter } from '../src/sim/ship';
import { Simulation } from '../src/sim/Simulation';
import type { ModuleInstance } from '../src/sim/types';
import { angleTo, boxAt, lookDir, rayAabb, segmentBlocked, wrapAngle, yawPitchTo, type V3 } from '../src/game/tools/aim';
import { ARM_LENGTH, computeArm, verticalLimits } from '../src/game/tools/cameraRig';
import { Rope, ToolEffects } from '../src/game/tools/effects';
import type { ToolEnv } from '../src/game/tools/env';
import { HookTool } from '../src/game/tools/hook';
import { approachVelocity, NPC_RADIUS, NPC_SQUEEZE_TIME, NpcCollider, pushOutOfObstacles, steerAround, stepAssist, type Obstacle } from '../src/game/tools/locomotion';
import { chooseBed, cratePrompt, crateQuick, holdPrompt, npcPrompt, propAction, propPrompt, propQuick, sitePrompt } from '../src/game/tools/prompts';
import { canHookFrom, railFacing, scanDebris, scanFire, scanFocus, scanRepair, type Aim } from '../src/game/tools/targets';
import { samplePose, ViewModel } from '../src/game/tools/viewmodel';

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

/* ====================================================================== */
/* Regresiones de la ronda de QA 1                                         */
/* ====================================================================== */

const finite3 = (v: { x: number; y: number; z: number }): boolean => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe('[0] sin NaN en el modelo en mano ni en las cuerdas', () => {
  it('la inercia del modelo en mano es estable a 10 fps (antes divergía hasta NaN)', () => {
    const cam = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 3000);
    const vm = new ViewModel(cam);
    vm.show('gancho');
    const mo = { bobPhase: 0, bobAmount: 0, yaw: 0, pitch: 0, landKick: 0, light: 1 };
    const out = new THREE.Vector3();
    // 3000 frames a dt = 0,1 s (render por software): con la integración explícita del muelle
    // la oscilación crecía ×1,5 por frame y a los ~1700 frames el garfio estaba en NaN.
    for (let i = 0; i < 3000; i++) {
      mo.yaw = Math.sin(i * 0.7) * 0.08;
      mo.pitch = Math.cos(i * 0.5) * 0.05;
      vm.update(0.1, mo, false);
      expect(Math.abs(vm.sway.x)).toBeLessThanOrEqual(0.1);
      expect(Math.abs(vm.sway.y)).toBeLessThanOrEqual(0.1);
    }
    const a = vm.anchorWorld('garfio', out);
    expect(a).not.toBeNull();
    expect(finite3(out)).toBe(true);
    // El garfio sigue delante de la cámara, en la mano (a menos de un metro).
    expect(out.length()).toBeLessThan(1);
    // Una mirada corrupta (NaN) no contamina el modelo.
    mo.yaw = Number.NaN;
    vm.update(0.016, mo, false);
    expect(finite3(vm.handOffset)).toBe(true);
  });

  it('la cuerda ignora extremos no finitos y mantiene su esfera envolvente a mano', () => {
    const scene = new THREE.Scene();
    const rope = new Rope(scene, '#ffffff', 8);
    rope.visible = true;
    // Sin tender todavía no se dibuja (three.js calcularía la esfera con lo que hubiera).
    expect(rope.line.visible).toBe(false);
    expect(rope.set(new THREE.Vector3(0, 1, 0), new THREE.Vector3(4, 0, 3), 0.3, 0.05, 0.016)).toBe(true);
    expect(rope.line.visible).toBe(true);
    const geo = rope.line.geometry;
    const r0 = geo.boundingSphere!.radius;
    expect(Number.isFinite(r0)).toBe(true);
    expect(r0).toBeGreaterThan(2);
    expect(rope.set(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Vector3(1, 1, 1), 0.2)).toBe(false);
    expect(rope.line.visible).toBe(false);
    const pos = geo.getAttribute('position').array as Float32Array;
    expect(Array.from(pos).every(Number.isFinite)).toBe(true);
    // three.js no tiene que calcular nada: la esfera ya existe y es finita.
    expect(geo.boundingSphere).not.toBeNull();
    expect(Number.isFinite(geo.boundingSphere!.radius)).toBe(true);
  });

  it('un lanzamiento con la mano o el punto de caída en NaN no deja NaN en la cuerda', () => {
    const sim = new Simulation(createNewGame(1));
    const scene = new THREE.Scene();
    const fx = new ToolEffects(scene);
    let handNaN = false;
    const vmStub = { play() {}, stop() {}, setPart() {}, kick() {} };
    const env: ToolEnv = {
      ctx: { sim, renderer: { worldRoot: new THREE.Group() } } as unknown as GameContext,
      vm: vmStub as unknown as ViewModel,
      fx,
      handWorld: (_a, out) => (handNaN ? out.set(Number.NaN, Number.NaN, Number.NaN) : out.set(1, 4.5, -2)),
      shipToWorld: (x, y, z, out) => out.set(x, y, z),
      waterHeight: () => 0,
      sfx() {},
      toast() {},
      toolUsed() {},
    };
    const hook = new HookTool(env);
    const ropePos = () => Array.from(fx.hookRope.line.geometry.getAttribute('position').array as Float32Array);
    // 1) Punto de caída no finito: se corrige a un punto del agua junto al costado.
    hook.throwMiss(new THREE.Vector3(Number.NaN, 0, Number.NaN));
    for (let i = 0; i < 200 && hook.busy; i++) {
      hook.update(1 / 30);
      hook.late(1 / 30);
      expect(ropePos().every(Number.isFinite)).toBe(true);
    }
    expect(hook.busy).toBe(false);
    // 2) La mano devuelve NaN (modelo en mano corrupto): no se lanza nada y la cuerda no se toca.
    handNaN = true;
    hook.throwMiss(new THREE.Vector3(3, 0, -12));
    for (let i = 0; i < 60 && hook.busy; i++) {
      hook.update(1 / 30);
      hook.late(1 / 30);
    }
    expect(hook.busy).toBe(false);
    expect(fx.hookRope.visible).toBe(false);
    expect(ropePos().every(Number.isFinite)).toBe(true);
    expect(finite3(fx.grapnel.position)).toBe(true);
  });

  it('las partículas descartan ráfagas con origen no finito', () => {
    const fx = new ToolEffects(new THREE.Scene());
    fx.particles.burst(new THREE.Vector3(Number.NaN, 0, 0), { count: 10, color: '#fff', speed: 1 });
    expect(fx.particles.active).toBe(0);
    fx.particles.burst(new THREE.Vector3(0, 1, 0), { count: 10, color: '#fff', speed: 1, life: Number.NaN });
    fx.particles.update(0.016);
    expect(fx.particles.active).toBe(10);
    expect(fx.particles.mesh.boundingSphere).not.toBeNull();
  });
});

/* ---------------------------------------------------------------------- */
/* Contexto de juego mínimo para PlayerController / Interaction             */
/* ---------------------------------------------------------------------- */

class FakeInput {
  enabled = true;
  locked = false;
  mouseX = 0;
  mouseY = 0;
  private held = new Set<string>();
  private justDown = new Set<string>();
  dx = 0;
  dy = 0;
  key(code: string, down: boolean): void {
    if (down) {
      if (!this.held.has(code)) this.justDown.add(code);
      this.held.add(code);
    } else this.held.delete(code);
  }
  pressed(c: string): boolean {
    return this.justDown.has(c);
  }
  down(c: string): boolean {
    return this.held.has(c);
  }
  released(): boolean {
    return false;
  }
  consume(c: string): void {
    this.justDown.delete(c);
  }
  mouseDelta(): { dx: number; dy: number } {
    return { dx: this.dx, dy: this.dy };
  }
  wheel(): number {
    return 0;
  }
  endFrame(): void {
    this.justDown.clear();
    this.dx = 0;
    this.dy = 0;
  }
}

interface Harness {
  sim: Simulation;
  input: FakeInput;
  ui: { panelOpen: boolean; opened: PanelRequest | null; prompt: PromptInfo | null; toasts: string[]; setPrompt(p: PromptInfo | null): void; toast(t: string): void; openPanel(r: PanelRequest): void; closePanel(): void };
  ctx: GameContext;
  ia: Interaction;
  frame(n?: number): void;
  tap(code: string): void;
}

function harness(): Harness {
  const sim = new Simulation(createNewGame(1));
  const st = sim.state.player;
  const input = new FakeInput();
  const ui = {
    panelOpen: false,
    opened: null as PanelRequest | null,
    prompt: null as PromptInfo | null,
    toasts: [] as string[],
    setPrompt(p: PromptInfo | null) {
      this.prompt = p;
    },
    toast(t: string) {
      this.toasts.push(t);
    },
    openPanel(r: PanelRequest) {
      this.panelOpen = true;
      this.opened = r;
    },
    closePanel() {
      this.panelOpen = false;
    },
  };
  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.05, 3000);
  const shipRoot = new THREE.Group();
  shipRoot.add(camera);
  const player = {
    camera,
    firstPersonView: true,
    bobPhase: 0,
    bobAmount: 0,
    landKick: 0,
    eye: () => ({ x: st.pos.x, y: st.pos.y + EYE_HEIGHT, z: st.pos.z }),
    lookDirection: () => lookDir(st.yaw, st.pitch),
    isIndoor: () => false,
    handWorld: (out: THREE.Vector3) => out.set(st.pos.x, st.pos.y + 1.2, st.pos.z),
  };
  const ctx = {
    sim,
    bus: sim.bus,
    renderer: { scene: new THREE.Scene(), shipRoot, worldRoot: new THREE.Group(), waterHeight: () => 0, renderer: { shadowMap: { enabled: false } } },
    input,
    ui,
    player,
    mode: 'play',
    highlight: null,
    settings: { fov: 72, perspective: 'first', sensitivity: 2.2, invertY: false },
  } as unknown as GameContext;
  const ia = new Interaction(ctx);
  const frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      camera.position.set(st.pos.x, st.pos.y + EYE_HEIGHT, st.pos.z);
      camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');
      ia.update(1 / 60);
      input.endFrame();
    }
  };
  const tap = (code: string) => {
    input.key(code, true);
    frame();
    input.key(code, false);
    frame();
  };
  // El primer frame con control no usa clics (recuperar el control): se consume aquí.
  frame();
  return { sim, input, ui, ctx, ia, frame, tap };
}

/** Coloca al jugador delante de un mueble interactivo, mirándolo. */
function faceProp(h: Harness, interact: string): { moduleId: number } {
  const sim = h.sim;
  const prop = sim.layout.props.find((p) => p.interact === interact)!;
  const st = sim.state.player;
  for (const [ox, oz] of [
    [prop.hx + 0.8, 0],
    [-(prop.hx + 0.8), 0],
    [0, prop.hz + 0.8],
    [0, -(prop.hz + 0.8)],
  ] as const) {
    const x = prop.x + ox;
    const z = prop.z + oz;
    if (!sim.collision.isFree(x, z, prop.y)) continue;
    st.pos = { x, y: prop.y, z };
    const yp = yawPitchTo({ x, y: prop.y + EYE_HEIGHT, z }, { x: prop.x, y: prop.y + 1, z: prop.z });
    st.yaw = yp.yaw;
    st.pitch = yp.pitch;
    h.frame();
    if (h.ia.focus?.prop?.interact === interact) return { moduleId: prop.moduleId };
  }
  throw new Error(`No se pudo mirar a ${interact}`);
}

describe('[22] E física en el depósito, las cajas y los bancales', () => {
  it('E bebe al momento del depósito; R llena una botella; mantener E abre el panel', () => {
    const h = harness();
    const st = h.sim.state.player;
    const { moduleId } = faceProp(h, 'deposito');
    expect(h.ui.prompt?.text).toBe('Beber');
    expect(h.ui.prompt?.sub).toMatch(/Agua potable: \d+\/\d+ L/);
    expect(h.ui.prompt?.sub).toMatch(/Mantén E: ver el depósito/);
    expect(h.ui.prompt?.alt).toEqual({ key: 'R', text: 'Llenar una botella', disabled: false });
    st.needs.thirst = 40;
    const water0 = h.sim.state.utilities.waterL;
    h.tap('KeyE');
    expect(h.ui.panelOpen).toBe(false);
    expect(st.needs.thirst).toBeCloseTo(80, 5);
    expect(h.sim.state.utilities.waterL).toBeCloseTo(water0 - 1, 5);
    // R: una botella más en el inventario.
    h.frame(60);
    const bottles = countItem(st.inventory, 'agua_potable');
    h.tap('KeyR');
    expect(countItem(st.inventory, 'agua_potable')).toBe(bottles + 1);
    // Mantener E: anillo de progreso y, al llegar, el panel del depósito (sin beber).
    const thirst = st.needs.thirst;
    h.input.key('KeyE', true);
    h.frame(15);
    expect(h.ui.prompt?.key).toBe('Mantén E');
    expect(h.ui.prompt?.progress).toBeGreaterThan(0);
    expect(h.ui.panelOpen).toBe(false);
    h.frame(Math.ceil(HOLD_PANEL * 60));
    expect(h.ui.panelOpen).toBe(true);
    expect(h.ui.opened).toEqual({ kind: 'station', moduleId });
    h.input.key('KeyE', false);
    h.frame();
    expect(st.needs.thirst).toBe(thirst);
  });

  it('si el depósito necesita reparación, R repara en vez de llenar la botella', () => {
    const h = harness();
    const { moduleId } = faceProp(h, 'deposito');
    const m = h.sim.state.ship.modules.find((mm) => mm.id === moduleId)!;
    m.condition = 30;
    h.frame();
    expect(h.ui.prompt?.alt?.text).toMatch(/^Reparar/);
  });

  it('E en una caja suelta lo coge todo si cabe; si no cabe, la abre', () => {
    const h = harness();
    const sim = h.sim;
    const st = sim.state.player;
    st.pos = { x: 4.2, y: LEVEL_H, z: -2 };
    const yp = yawPitchTo({ x: 4.2, y: LEVEL_H + EYE_HEIGHT, z: -2 }, { x: 6, y: LEVEL_H + 0.3, z: -2 });
    st.yaw = yp.yaw;
    st.pitch = yp.pitch;
    sim.state.crates.push({ id: 900, pos: { x: 6, y: LEVEL_H, z: -2 }, inventory: { slots: [{ id: 'madera', qty: 3 }, { id: 'cuerda', qty: 1 }] }, label: 'Restos' });
    h.frame();
    expect(h.ia.focus?.kind).toBe('crate');
    expect(h.ui.prompt?.text).toBe('Coger todo: Restos');
    const wood = countItem(st.inventory, 'madera');
    h.tap('KeyE');
    expect(h.ui.panelOpen).toBe(false);
    expect(countItem(st.inventory, 'madera')).toBe(wood + 3);
    expect(sim.state.crates.some((c) => c.id === 900)).toBe(false);
    // Inventario lleno: la caja se abre para elegir.
    for (let i = 0; i < st.inventory.slots.length; i++) if (!st.inventory.slots[i]) st.inventory.slots[i] = { id: 'chatarra', qty: 1 };
    for (const s of st.inventory.slots) if (s && s.id !== 'chatarra') s.qty = Math.max(s.qty, 99);
    sim.state.crates.push({ id: 901, pos: { x: 6, y: LEVEL_H, z: -2 }, inventory: { slots: [{ id: 'plano_taller', qty: 1 }] }, label: 'Cofre' });
    h.frame();
    expect(h.ui.prompt?.text).toBe('Abrir: Cofre');
    expect(h.ui.prompt?.sub).toMatch(/No te cabe todo/);
    h.tap('KeyE');
    expect(h.ui.opened).toEqual({ kind: 'crate', crateId: 901 });
  });

  it('bancales: E cosecha lo maduro y limpia lo seco; vacío o creciendo abre el panel', () => {
    const sim = new Simulation(createNewGame(1));
    const base = sim.state.ship.modules[0]!;
    const plot = (crop: string | null, growth: number, dead = false, pest = false) => ({ crop, growth, dryHours: 0, dead, pest });
    const m = { ...structuredClone(base), id: 999, type: 'huerto', status: 'active', inventory: null, plots: [plot('hortaliza', 1), plot('hortaliza', 0.5, true), plot('hortaliza', 0.4, false, true), plot(null, 0)] } as unknown as ModuleInstance;
    sim.state.ship.modules.push(m);
    const prop = (index: number) => ({ ...sim.layout.props[0]!, key: `999:${index}`, moduleId: 999, moduleType: 'huerto', kind: 'bancal' as const, interact: 'huerto' as const, index });
    expect(propQuick(sim, prop(0))).toEqual({ kind: 'harvest', moduleId: 999, plot: 0 });
    expect(propPrompt(sim, prop(0))?.text).toBe('Cosechar');
    expect(propPrompt(sim, prop(0))?.sub).toMatch(/Hortalizas: listas para cosechar · Mantén E: ver el bancal/);
    expect(propQuick(sim, prop(1))).toEqual({ kind: 'tend', moduleId: 999, plot: 1 });
    expect(propPrompt(sim, prop(1))?.text).toBe('Retirar las plantas secas');
    expect(propQuick(sim, prop(2))).toEqual({ kind: 'tend', moduleId: 999, plot: 2 });
    expect(propPrompt(sim, prop(2))?.text).toBe('Quitar la plaga');
    expect(propQuick(sim, prop(3))).toBeNull();
    expect(propPrompt(sim, prop(3))?.text).toBe('Atender el bancal');
    // Obra en curso: nada directo.
    m.status = 'construction';
    expect(propQuick(sim, prop(0))).toBeNull();
  });

  it('textos de las cajas y del anillo de «Mantén E»', () => {
    const sim = new Simulation(createNewGame(1));
    const crate = { id: 5, pos: { x: 0, y: 0, z: 0 }, label: 'Restos', inventory: { slots: [{ id: 'madera', qty: 2 }, null] } };
    expect(crateQuick(sim, crate)).toEqual({ kind: 'take', crateId: 5 });
    expect(cratePrompt(crate, true)).toEqual({ key: 'E', text: 'Coger todo: Restos', sub: '1 pila de objetos · Mantén E: abrir la caja' });
    expect(cratePrompt(crate, false).sub).toBe('1 pila de objetos · No te cabe todo');
    expect(crateQuick(sim, { ...crate, inventory: { slots: [null] } })).toBeNull();
    expect(holdPrompt({ kind: 'drink', moduleId: 1 }, 0.5)).toEqual({ key: 'Mantén E', text: 'Ver el depósito', progress: 0.5 });
    expect(holdPrompt({ kind: 'take', crateId: 1 }, 2).progress).toBe(1);
  });
});

describe('[35] el clic que devuelve el control no usa la herramienta', () => {
  it('al cerrar un panel, el clic de ese frame no lanza el gancho; el siguiente sí', () => {
    const h = harness();
    const st = h.sim.state.player;
    st.pos = { x: 4, y: LEVEL_H, z: -6 };
    st.yaw = 0;
    st.pitch = -0.3;
    h.frame();
    h.ui.panelOpen = true;
    h.frame(3);
    h.ui.panelOpen = false;
    h.input.key('Mouse0', true);
    h.frame();
    h.input.key('Mouse0', false);
    h.frame();
    expect(h.ia.toolState.hook).toBe('idle');
    h.tap('Mouse0');
    expect(h.ia.toolState.hook).not.toBe('idle');
  });
});

describe('[16] la vista no salta al capturar el ratón', () => {
  function controller(input: FakeInput): PlayerController {
    const ctx = { settings: { fov: 72, perspective: 'first', sensitivity: 2.2, invertY: false }, input } as unknown as GameContext;
    return new PlayerController(ctx, {} as PlayerAvatar);
  }

  it('descarta los deltas al recuperar el control y al capturar el puntero', () => {
    const input = new FakeInput();
    const pc = controller(input);
    /** Frames descartados (con `dt` por frame) hasta que pasa un delta. */
    const drained = (dt: number): number => {
      let n = 0;
      input.dx = 5;
      input.dy = -3;
      while (pc.lookDelta(true, dt) === null && n < 100) n++;
      return n;
    };
    // Menú: sin control.
    expect(pc.lookDelta(false)).toBeNull();
    // Primer frame de juego con el salto del navegador (−posición del cursor).
    input.dx = -246;
    input.dy = -378;
    expect(pc.lookDelta(true, 1 / 60)).toBeNull();
    // A 60 fps se descartan ~0,15 s (9–10 frames); luego el ratón gira la vista con normalidad.
    const frames60 = drained(1 / 60) + 1;
    expect(frames60).toBeGreaterThanOrEqual(Math.round(LOOK_GRACE_TIME * 60));
    expect(frames60).toBeLessThanOrEqual(Math.round(LOOK_GRACE_TIME * 60) + 1);
    expect(pc.lookDelta(true, 1 / 60)).toEqual({ dx: 5, dy: -3 });
    // La captura llega unos frames después: también se descarta (a 10 fps, LOOK_GRACE_FRAMES).
    input.locked = true;
    expect(drained(0.1)).toBe(LOOK_GRACE_FRAMES);
    // Saltos absurdos o no finitos nunca giran la vista.
    input.dx = 5000;
    expect(pc.lookDelta(true)).toBeNull();
    input.dx = Number.NaN;
    expect(pc.lookDelta(true)).toBeNull();
    // Salto de Chromium con el puntero capturado: exactamente menos la posición del cursor.
    input.mouseX = 640;
    input.mouseY = 360;
    input.dx = -640;
    input.dy = -360;
    expect(pc.lookDelta(true)).toBeNull();
    input.dx = -639;
    expect(pc.lookDelta(true)).toEqual({ dx: -639, dy: -360 });
    input.dx = 12;
    input.dy = 4;
    expect(pc.lookDelta(true)).toEqual({ dx: 12, dy: 4 });
    // Abrir y cerrar un panel vuelve a descartar.
    expect(pc.lookDelta(false)).toBeNull();
    expect(pc.lookDelta(true)).toBeNull();
  });
});

describe('[19] los habitantes son sólidos', () => {
  let sim: Simulation;
  beforeEach(() => {
    sim = new Simulation(createNewGame(1));
  });

  const step = (body: Body, vx: number, vz: number, obstacles: Obstacle[], seconds: number) => {
    const dt = 1 / 60;
    let minD = Infinity;
    for (let t = 0; t < seconds; t += dt) {
      sim.collision.move(body, vx, vz, dt, false);
      pushOutOfObstacles(sim.collision, body, obstacles, { x: -1, z: 0 });
      for (const o of obstacles) minD = Math.min(minD, Math.hypot(body.pos.x - o.x, body.pos.z - o.z));
    }
    return minD;
  };

  it('caminar contra un habitante no lo atraviesa y se rodea deslizando', () => {
    const npc: Obstacle = { x: 6, y: LEVEL_H, z: 0, r: NPC_RADIUS, h: 1.8 };
    const body: Body = { pos: { x: 3, y: LEVEL_H, z: 0 }, vy: 0, onGround: true };
    const minD = step(body, 3.4, 0, [npc], 2);
    expect(minD).toBeGreaterThanOrEqual(NPC_RADIUS + PLAYER_RADIUS - 0.02);
    expect(body.pos.x).toBeLessThan(npc.x);
    // Un poco de ángulo: lo rodea y sigue adelante.
    const b2: Body = { pos: { x: 3, y: LEVEL_H, z: 0.1 }, vy: 0, onGround: true };
    const minD2 = step(b2, 3.4, 0, [npc], 3);
    expect(minD2).toBeGreaterThanOrEqual(NPC_RADIUS + PLAYER_RADIUS - 0.02);
    expect(b2.pos.x).toBeGreaterThan(npc.x + 0.5);
  });

  it('el empuje nunca mete al jugador en una pared; centros coincidentes y otro nivel', () => {
    // Pegado a la barandilla de babor (z ≈ -7,7) con un habitante encima: no sale por la borda.
    const body: Body = { pos: { x: 4, y: LEVEL_H, z: -6 }, vy: 0, onGround: true };
    step(body, 0, -4, [], 1);
    const railZ = body.pos.z;
    const npc: Obstacle = { x: body.pos.x, y: LEVEL_H, z: railZ + 0.2, r: NPC_RADIUS, h: 1.8 };
    pushOutOfObstacles(sim.collision, body, [npc], { x: 0, z: -1 });
    expect(body.pos.z).toBeGreaterThanOrEqual(railZ - 1e-6);
    expect(sim.collision.isFree(body.pos.x, body.pos.z, body.pos.y)).toBe(true);
    // Centros coincidentes: sale hacia la dirección de escape.
    const b2: Body = { pos: { x: 6, y: LEVEL_H, z: 0 }, vy: 0, onGround: true };
    expect(pushOutOfObstacles(sim.collision, b2, [{ x: 6, y: LEVEL_H, z: 0, r: NPC_RADIUS, h: 1.8 }], { x: -1, z: 0 })).toBe(true);
    expect(b2.pos.x).toBeCloseTo(6 - NPC_RADIUS - PLAYER_RADIUS, 2);
    // Un habitante en la bodega, justo debajo, no empuja.
    const b3: Body = { pos: { x: 6, y: LEVEL_H, z: 0 }, vy: 0, onGround: true };
    expect(pushOutOfObstacles(sim.collision, b3, [{ x: 6, y: 0, z: 0, r: NPC_RADIUS, h: 1.8 }], { x: -1, z: 0 })).toBe(false);
  });

  it('de frente contra un habitante en cubierta abierta, se le rodea sin tocarlo ni esperar', () => {
    const npc: Obstacle = { x: 6, y: LEVEL_H, z: 0, r: NPC_RADIUS, h: 1.8 };
    const body: Body = { pos: { x: 3, y: LEVEL_H, z: 0 }, vy: 0, onGround: true };
    const nc = new NpcCollider();
    const dt = 1 / 60;
    let minD = Infinity;
    let t = 0;
    for (; t < 4 && body.pos.x < npc.x + 1; t += dt) {
      const from = { x: body.pos.x, z: body.pos.z };
      const mv = steerAround(body.pos, 3.4, 0, [npc]);
      sim.collision.move(body, mv.x, mv.z, dt, false);
      nc.resolve(sim.collision, body, [npc], { x: -1, z: 0 }, from, true, dt);
      minD = Math.min(minD, Math.hypot(body.pos.x - npc.x, body.pos.z - npc.z));
    }
    expect(body.pos.x).toBeGreaterThan(npc.x + 1);
    expect(minD).toBeGreaterThanOrEqual(NPC_RADIUS + PLAYER_RADIUS - 0.02);
    // Sin la espera de emergencia: lo ha rodeado mucho antes.
    expect(t).toBeLessThan(NPC_SQUEEZE_TIME);
    expect(nc.ghost).toBe(false);
    // Alejándose o sin tocarlo, la velocidad no cambia.
    expect(steerAround({ x: 3, y: LEVEL_H, z: 0 }, 3.4, 0, [npc])).toEqual({ x: 3.4, z: 0 });
    expect(steerAround({ x: 5.4, y: LEVEL_H, z: 0 }, -3.4, 0, [npc])).toEqual({ x: -3.4, z: 0 });
  });

  it('un habitante quieto no deja encerrado al jugador: tras empujar 2,5 s sin avanzar, se pasa', () => {
    const npc: Obstacle = { x: 6, y: LEVEL_H, z: 0, r: NPC_RADIUS, h: 1.8 };
    const body: Body = { pos: { x: 4, y: LEVEL_H, z: 0 }, vy: 0, onGround: true };
    const nc = new NpcCollider();
    const dt = 1 / 60;
    let t = 0;
    let firstInside = -1;
    for (; t < NPC_SQUEEZE_TIME + 3; t += dt) {
      const from = { x: body.pos.x, z: body.pos.z };
      sim.collision.move(body, 3.4, 0, dt, false);
      nc.resolve(sim.collision, body, [npc], { x: -1, z: 0 }, from, true, dt);
      const d = Math.hypot(body.pos.x - npc.x, body.pos.z - npc.z);
      if (d < NPC_RADIUS + PLAYER_RADIUS - 0.05 && firstInside < 0) firstInside = t;
      if (body.pos.x > npc.x + 1.5) break;
    }
    // Primero choca (no lo atraviesa enseguida) y, pasado el tiempo de espera, pasa al otro lado.
    expect(firstInside).toBeGreaterThan(NPC_SQUEEZE_TIME - 0.1);
    expect(body.pos.x).toBeGreaterThan(npc.x + 1.5);
    // Separado del habitante, vuelve a ser sólido.
    nc.resolve(sim.collision, body, [npc], { x: -1, z: 0 }, { x: body.pos.x, z: body.pos.z }, false, dt);
    expect(nc.ghost).toBe(false);
  });

  it('la cámara en tercera persona se acorta antes de meterse en un habitante', () => {
    const feet = { x: 6, y: LEVEL_H, z: 0 };
    // Mira hacia +x: la cámara queda en -x, donde está el habitante.
    const free = computeArm({ layout: sim.layout, feet, yaw: -Math.PI / 2, pitch: -0.2, length: ARM_LENGTH });
    const npcBox = boxAt(feet.x - 1.6, LEVEL_H, feet.z + 0.3, NPC_RADIUS, NPC_RADIUS, 1.8);
    const r = computeArm({ layout: sim.layout, feet, yaw: -Math.PI / 2, pitch: -0.2, length: ARM_LENGTH, obstacles: [npcBox] });
    expect(r.length).toBeLessThan(free.length);
    expect(r.blocked).toBe(true);
    // La cámara queda fuera de la caja del habitante.
    const inside = r.pos.x > npcBox.minX && r.pos.x < npcBox.maxX && r.pos.z > npcBox.minZ && r.pos.z < npcBox.maxZ && r.pos.y < npcBox.maxY;
    expect(inside).toBe(false);
  });
});

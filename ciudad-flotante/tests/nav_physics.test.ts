import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/sim/newGame';
import { NavGrid } from '../src/sim/nav';
import { ShipCollision, type Body } from '../src/sim/physics';
import { cellCenter, computeLayout } from '../src/sim/ship';
import { LEVEL_H } from '../src/sim/constants';

const s = createNewGame(3);
const layout = computeLayout(s.ship);

describe('navegación', () => {
  const nav = new NavGrid(layout);

  it('encuentra ruta de cubierta a la bodega por la escalera', () => {
    const from = { ...s.player.pos };
    const c = cellCenter(2, 2, s.ship.width);
    const path = nav.findPath(from, { x: c.x, y: 0, z: c.z });
    expect(path).not.toBeNull();
    expect(path!.at(-1)!.y).toBeCloseTo(0, 1);
    expect(path!.some((p) => p.y > 0.5 && p.y < LEVEL_H - 0.5)).toBe(true);
  });

  it('encuentra ruta al puente (nivel 2)', () => {
    const puente = layout.props.find((p) => p.kind === 'timon')!;
    const stand = nav.standPoint(puente)!;
    expect(stand.y).toBeCloseTo(2 * LEVEL_H, 1);
    const path = nav.findPath(s.player.pos, stand);
    expect(path).not.toBeNull();
  });

  it('entra en el dormitorio por la puerta', () => {
    const cama = layout.props.find((p) => p.kind === 'litera')!;
    const stand = nav.standPoint(cama)!;
    const path = nav.findPath(s.player.pos, stand);
    expect(path).not.toBeNull();
  });
});

describe('física', () => {
  const col = new ShipCollision(layout);
  const body = (x: number, y: number, z: number): Body => ({ pos: { x, y, z }, vy: 0, onGround: true });

  it('apoya al jugador en la cubierta', () => {
    const b = body(s.player.pos.x, s.player.pos.y + 0.3, s.player.pos.z);
    b.onGround = false;
    for (let i = 0; i < 60; i++) col.move(b, 0, 0, 1 / 60, false);
    expect(b.pos.y).toBeCloseTo(LEVEL_H, 2);
    expect(b.onGround).toBe(true);
  });

  it('las barandillas impiden caer al mar', () => {
    const b = body(s.player.pos.x, LEVEL_H, s.player.pos.z);
    for (let i = 0; i < 300; i++) col.move(b, 0, -5, 1 / 60, false);
    expect(b.pos.z).toBeGreaterThan(-8);
    expect(b.pos.y).toBeCloseTo(LEVEL_H, 2);
  });

  it('baja a la bodega por la escalera', () => {
    // Escalera de bodega en celda (7,2), sale al norte (7,3) en cubierta.
    const top = cellCenter(7, 3, s.ship.width);
    const b = body(top.x, LEVEL_H, top.z);
    for (let i = 0; i < 240; i++) col.move(b, 0, -3, 1 / 60, false);
    expect(b.pos.y).toBeLessThan(0.6);
  });

  it('las paredes bloquean', () => {
    // Desde cubierta hacia el almacén (celda 3,3) por un lado sin puerta: x=3 celda, pared sur con puerta en el centro.
    const c = cellCenter(4, 3, s.ship.width);
    const b = body(c.x, LEVEL_H, c.z);
    for (let i = 0; i < 200; i++) col.move(b, -4, 0, 1 / 60, false);
    const wallX = cellCenter(3, 3, s.ship.width).x + 2;
    expect(b.pos.x).toBeGreaterThan(wallX);
  });
});

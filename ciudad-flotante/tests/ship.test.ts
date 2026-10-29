import { describe, expect, it } from 'vitest';
import { createNewGame } from '../src/sim/newGame';
import { buildCellGraph, checkDemolish, checkPlacement, computeLayout, referenceCell, reachableFrom, unreachableModules, cellKey } from '../src/sim/ship';

describe('barco inicial', () => {
  const s = createNewGame(1);
  const layout = computeLayout(s.ship);

  it('todas las instalaciones son accesibles', () => {
    expect(unreachableModules(s.ship, false)).toEqual([]);
  });

  it('tiene cubierta, bodega y techo transitable', () => {
    expect(layout.cells[1]![5]![1]!.kind).toBe('deck');
    expect(layout.cells[0]![5]![1]!.kind).toBe('hold');
    expect(layout.cells[2]![3]![0]!.kind).toBe('roof');
    expect(layout.cells[2]![1]![0]!.kind).toBe('room');
    expect(layout.cells[2]![5]![2]!.kind).toBe('void');
    expect(layout.cells[0]![7]![2]!.kind).toBe('stairLow');
    expect(layout.cells[1]![7]![2]!.kind).toBe('stairHigh');
  });

  it('genera puertas para cada habitación', () => {
    // dormitorio, camarote, cocina, almacén (nivel 1) y puente (nivel 2)
    expect(layout.doors.filter((d) => d.level === 1).length).toBeGreaterThanOrEqual(4);
    expect(layout.doors.filter((d) => d.level === 2).length).toBe(1);
  });

  it('las escaleras conectan los tres niveles', () => {
    const g = buildCellGraph(layout, s.ship);
    const reach = reachableFrom(g, referenceCell(layout)!);
    expect(reach.has(cellKey(0, 2, 2))).toBe(true); // bodega
    expect(reach.has(cellKey(2, 3, 0))).toBe(true); // techo junto al puente
    expect(reach.has(cellKey(2, 1, 0))).toBe(true); // puente
  });

  it('tiene props interactivos', () => {
    const kinds = new Set(layout.props.map((p) => p.interact).filter(Boolean));
    for (const k of ['dormir', 'cocina', 'almacen', 'banco', 'colector', 'deposito', 'timon']) expect(kinds.has(k as never)).toBe(true);
  });
});

describe('reglas de construcción', () => {
  const s = createNewGame(2);

  it('permite un camarote en cubierta con la puerta hacia la cubierta', () => {
    const r = checkPlacement(s.ship, s.unlocks, 'camarote', 1, 6, 3, 0);
    expect(r.ok, r.reason ?? '').toBe(true);
  });

  it('rechaza una habitación con la puerta contra el casco', () => {
    // rot 0 => puerta al sur (z-), en z=0 da al exterior.
    const r = checkPlacement(s.ship, s.unlocks, 'camarote', 1, 6, 0, 0);
    expect(r.ok).toBe(false);
  });

  it('rechaza espacios ocupados y fuera del casco', () => {
    expect(checkPlacement(s.ship, s.unlocks, 'almacen', 1, 1, 0, 0).ok).toBe(false);
    expect(checkPlacement(s.ship, s.unlocks, 'almacen', 1, 12, 1, 0).reason).toBe('Fuera del casco');
  });

  it('exige soporte en la cubierta superior', () => {
    expect(checkPlacement(s.ship, s.unlocks, 'colector', 2, 6, 1, 0).ok).toBe(false);
    // Techo sobre el almacén: tiene soporte pero no tiene acceso.
    expect(checkPlacement(s.ship, s.unlocks, 'colector', 2, 3, 3, 0).reason).toMatch(/acceso/);
    // Techo sobre el camarote, junto al puente: válido.
    expect(checkPlacement(s.ship, s.unlocks, 'colector', 2, 3, 0, 0).ok).toBe(true);
  });

  it('exige planos para módulos avanzados', () => {
    expect(checkPlacement(s.ship, s.unlocks, 'generador', 0, 2, 2, 0).reason).toMatch(/plano/);
    expect(checkPlacement(s.ship, ['energia'], 'generador', 0, 2, 2, 0).ok).toBe(true);
  });

  it('valida la entrada y la salida de las escaleras', () => {
    // Escalera de bodega a cubierta en (5,1): entra desde (5,0) en bodega, sale a (5,2) en cubierta.
    expect(checkPlacement(s.ship, s.unlocks, 'escalera', 0, 5, 1, 0).ok).toBe(true);
    // En (2,1) taparía la puerta del dormitorio.
    expect(checkPlacement(s.ship, s.unlocks, 'escalera', 0, 2, 1, 0).ok).toBe(false);
    // Saliendo contra la pared del dormitorio no vale.
    expect(checkPlacement(s.ship, s.unlocks, 'escalera', 0, 1, 1, 2).reason).toMatch(/pared/);
  });

  it('no deja demoler lo que sostiene el puente', () => {
    const dorm = s.ship.modules.find((m) => m.type === 'dormitorio')!;
    expect(checkDemolish(s.ship, dorm.id).ok).toBe(false);
    const puente = s.ship.modules.find((m) => m.type === 'puente')!;
    expect(checkDemolish(s.ship, puente.id).ok).toBe(false);
    const banco = s.ship.modules.find((m) => m.type === 'banco_trabajo')!;
    expect(checkDemolish(s.ship, banco.id).ok).toBe(true);
  });

  it('no deja aislar módulos', () => {
    // La escalera de la bodega es el único acceso al depósito.
    const esc = s.ship.modules.find((m) => m.type === 'escalera' && m.level === 0)!;
    expect(checkDemolish(s.ship, esc.id).ok).toBe(false);
  });
});

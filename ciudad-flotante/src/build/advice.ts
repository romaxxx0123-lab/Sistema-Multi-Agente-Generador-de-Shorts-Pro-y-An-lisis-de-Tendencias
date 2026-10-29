/**
 * Motivos y pistas del rótulo de colocación del modo construcción (lógica sobre la simulación,
 * sin DOM). Convierte el motivo técnico de `sim.checkPlace` en un texto que diga QUÉ pasa y QUÉ
 * hacer:
 *
 *  - Nivel no permitido: "La escalera solo se construye en la bodega o en la cubierta principal"
 *    y la tecla para llegar al nivel bueno (el motivo y la pista dicen lo mismo).
 *  - "Dejaría otra zona del barco sin acceso" → nombra lo que quedaría aislado ("Taparía la puerta
 *    del almacén", "Dejaría sin acceso la cocina").
 *  - Techo al que no sube ninguna escalera → "No se puede subir a este techo" + "Construye una
 *    escalera junto a la cocina que suba a este techo" (buscando un sitio donde quepa).
 *  - Giros: solo se propone "Pulsa R" si ese giro pasa `sim.checkPlace` completo (reglas
 *    espaciales y validación fina de muebles), con el footprint re-centrado bajo el cursor igual
 *    que hará el fantasma al girar.
 *  - Si nada de lo anterior sirve, una pista genérica según el motivo.
 *
 * La pista cara (giros y escaleras: cada prueba es una validación completa, varios ms) se calcula
 * como generador: el modo construcción la avanza con un presupuesto de tiempo por frame.
 */
import { moduleDef, type ModuleDef } from '../data/modules';
import {
  buildCellGraph,
  cellKey,
  computeLayout,
  doorCell,
  getCell,
  moduleCells,
  previewModule,
  reachableFrom,
  referenceCell,
  SIDE_DIR,
  stairSides,
  unreachableModules,
  type CellRef,
} from '../sim/ship';
import type { Simulation } from '../sim/Simulation';
import type { Rotation } from '../sim/types';
import { toArticle, withArticle } from '../sim/utilities';
import { anchorFor } from './picking';

/* ------------------------------------------------------------------ */
/* Niveles                                                             */
/* ------------------------------------------------------------------ */

/** Nombre de cada nivel con artículo, para frases ("en la cubierta principal"). */
export const LEVEL_PLACE = ['la bodega', 'la cubierta principal', 'la cubierta superior'] as const;

function levelPlace(l: number): string {
  return LEVEL_PLACE[l] ?? `el nivel ${l}`;
}

/** "en la bodega o en la cubierta principal", "en la bodega, en la cubierta principal o en…". */
export function levelsPhrase(levels: readonly number[]): string {
  const ls = [...levels].sort((a, b) => a - b).map((l) => `en ${levelPlace(l)}`);
  if (ls.length <= 1) return ls[0] ?? '';
  return `${ls.slice(0, -1).join(', ')} o ${ls[ls.length - 1]}`;
}

/** Motivo para una pieza en un nivel que no admite: "La escalera solo se construye en la bodega o en la cubierta principal". */
export function levelReason(def: ModuleDef): string {
  return `${withArticle(def.name, true)} solo se construye ${levelsPhrase(def.levels)}`;
}

/** Nivel permitido más cercano (a igual distancia, el de abajo). */
export function nearestLevel(def: ModuleDef, level: number): number {
  return [...def.levels].sort((a, b) => Math.abs(a - level) - Math.abs(b - level) || a - b)[0] ?? level;
}

/** Tecla para llegar al nivel permitido más cercano: "Baja a la cubierta principal con Av Pág". */
export function levelHint(def: ModuleDef, level: number): string {
  const to = nearestLevel(def, level);
  if (to === level) return '';
  return to > level ? `Sube a ${levelPlace(to)} con Re Pág` : `Baja a ${levelPlace(to)} con Av Pág`;
}

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */

/** "el almacén", "el almacén y la cocina", "el almacén, la cocina y el comedor". */
export function listWithArticles(names: string[]): string {
  const ns = [...new Set(names)].map((n) => withArticle(n));
  if (ns.length <= 1) return ns[0] ?? '';
  return `${ns.slice(0, -1).join(', ')} y ${ns[ns.length - 1]}`;
}

/** "del almacén", "de la cocina". */
function ofArticle(name: string): string {
  const a = withArticle(name);
  return a.startsWith('el ') ? `del ${a.slice(3)}` : `de ${a}`;
}

const GENERIC_ISOLATION = 'Dejaría otra zona del barco sin acceso';

/** Texto de la pista "gira la pieza" según cuántas veces hay que pulsar R. */
export function rotateHintText(times: number): string {
  if (times <= 1) return 'Pulsa R para girarla: así sí cabe';
  return `Pulsa R ${times === 2 ? 'dos' : 'tres'} veces para girarla: así sí cabe`;
}

/** Pista genérica según el motivo, cuando ni girar ni una escalera lo arreglan. */
export function fallbackHint(reason: string | null): string | null {
  if (!reason) return null;
  if (reason.startsWith('Faltan') || reason.startsWith('Necesitas')) return null;
  if (reason.startsWith('Sin soporte')) return 'Arriba solo se construye sobre el techo de una habitación';
  if (reason.startsWith('El espacio ya está ocupado')) return 'Busca un hueco libre o desmonta lo que estorba (X)';
  if (reason.startsWith('Necesita estar a cielo abierto')) return 'Sube a la cubierta principal con Re Pág';
  if (reason.startsWith('No hay nivel superior')) return 'Baja de nivel con Av Pág';
  if (reason.startsWith('Fuera del casco')) return 'Acerca la pieza al barco';
  if (reason.startsWith('Sin acceso: la puerta')) return 'Su puerta (la marca del fantasma) debe dar a cubierta libre';
  if (reason.startsWith('Sin acceso')) return 'Colócala junto a una zona por la que se pueda pasar';
  if (reason.startsWith('Su puerta quedaría tapada')) return 'Busca un sitio donde su puerta dé a un espacio despejado';
  if (reason.startsWith('No quedaría sitio')) return 'Déjale espacio delante: muévela a otra celda';
  if (reason.startsWith('La entrada')) return 'Abajo necesita espacio libre para entrar (la flecha marca la subida)';
  if (reason.startsWith('La salida')) return 'Arriba debe salir a cubierta libre o al techo de una habitación';
  if (reason.startsWith('No se puede atravesar')) return 'Colócala en la cubierta, fuera de las habitaciones';
  if (reason.startsWith('Partiría la cubierta')) return 'Déjale paso alrededor o arrímala a la borda';
  if (/^(Taparía|Dejaría|Bloquearía|No se podría)/.test(reason)) return 'Muévela a otra celda para dejar libre el paso';
  return null;
}

/* ------------------------------------------------------------------ */
/* Accesos                                                             */
/* ------------------------------------------------------------------ */

export interface PlaceSpot {
  def: ModuleDef;
  level: number;
  x: number;
  z: number;
  rot: Rotation;
  /** Posición continua del cursor en celdas (para re-centrar la pieza al girarla). */
  fx: number;
  fz: number;
}

/**
 * Lo que la pieza dejaría aislado (comparando la conectividad de celdas con y sin ella):
 * "Taparía la puerta del almacén" si ocupa la celda ante su puerta, o "Dejaría sin acceso …".
 */
export function isolationReason(sim: Simulation, spot: PlaceSpot): string | null {
  const ship = sim.state.ship;
  const preview = previewModule(spot.def.id, spot.level, spot.x, spot.z, spot.rot);
  const before = new Set(unreachableModules(ship, true));
  const lost = unreachableModules(ship, true, [preview]).filter((id) => id !== -1 && !before.has(id));
  const mods = lost.map((id) => ship.modules.find((m) => m.id === id)).filter((m): m is NonNullable<typeof m> => !!m);
  if (!mods.length) return null;
  const cells = moduleCells(preview);
  const covers = (l: number, x: number, z: number): boolean => cells.some((c) => c.level === l && c.x === x && c.z === z);
  const doorsCovered = mods.filter((m) =>
    moduleDef(m.type).doors.some((d) => {
      const dc = doorCell(m, d, ship.width);
      const o = SIDE_DIR[dc.side];
      return covers(m.level, dc.x + o.dx, dc.z + o.dz);
    }),
  );
  if (doorsCovered.length === 1 && mods.length === 1) return `Taparía la puerta ${ofArticle(moduleDef(doorsCovered[0]!.type).name)}`;
  return `Dejaría sin acceso ${listWithArticles(mods.map((m) => moduleDef(m.type).name))}`;
}

/** Zona (celdas transitables conectadas del mismo nivel) bajo la pieza, sin acceso desde la cubierta. */
export interface IsolatedArea {
  level: number;
  cells: CellRef[];
  /** Habitaciones (del nivel inferior) cuyos techos forman la zona, si es un techo. */
  roomsBelow: string[];
}

/**
 * Si la pieza está sobre una zona a la que hoy no se llega (p. ej. el techo de la cocina sin
 * escalera), devuelve esa zona; si la zona es accesible (el problema es otro), null.
 */
export function isolatedArea(sim: Simulation, spot: PlaceSpot): IsolatedArea | null {
  const ship = sim.state.ship;
  const layout = computeLayout(ship, true);
  const graph = buildCellGraph(layout, ship, true);
  const ref = referenceCell(layout);
  if (!ref) return null;
  const reach = reachableFrom(graph, ref);
  const preview = previewModule(spot.def.id, spot.level, spot.x, spot.z, spot.rot);
  const own = moduleCells(preview).filter((c) => c.level === spot.level && !!getCell(layout, c.level, c.x, c.z)?.walkable);
  if (!own.length || own.some((c) => reach.has(cellKey(c.level, c.x, c.z)))) return null;
  // Zona conectada en el mismo nivel.
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const c of own) {
    const k = cellKey(c.level, c.x, c.z);
    if (!seen.has(k)) {
      seen.add(k);
      queue.push(k);
    }
  }
  while (queue.length) {
    const k = queue.shift()!;
    for (const n of graph.adj.get(k) ?? []) {
      if (seen.has(n) || Number(n.split(',')[0]) !== spot.level) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  const cells = [...seen].map((k) => {
    const [l, x, z] = k.split(',').map(Number) as [number, number, number];
    return { level: l, x, z };
  });
  const rooms: string[] = [];
  for (const c of cells) {
    if (getCell(layout, c.level, c.x, c.z)?.kind !== 'roof') continue;
    const id = getCell(layout, c.level - 1, c.x, c.z)?.moduleId;
    const m = id !== null && id !== undefined ? ship.modules.find((mm) => mm.id === id) : undefined;
    if (m) rooms.push(moduleDef(m.type).name);
  }
  return { level: spot.level, cells, roomsBelow: [...new Set(rooms)] };
}

/** "No se puede subir a este techo" / "No se llega a esta zona". */
export function isolatedReason(area: IsolatedArea): string {
  return area.roomsBelow.length ? 'No se puede subir a este techo' : 'No se puede llegar a esta zona';
}

/** Pista inmediata (antes de buscar sitio para la escalera). */
export function isolatedHint(area: IsolatedArea): string {
  if (area.roomsBelow.length) return 'Construye una escalera que suba a este techo';
  return area.level < 1 ? 'Construye una escalera que baje hasta aquí' : 'Construye una escalera que llegue hasta aquí';
}

/** Escaleras candidatas (nivel inferior) cuya salida desemboca en la zona. */
export function stairCandidates(area: IsolatedArea): { level: number; x: number; z: number; rot: Rotation }[] {
  const out: { level: number; x: number; z: number; rot: Rotation }[] = [];
  if (area.level < 1) return out;
  for (const c of area.cells) {
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const o = SIDE_DIR[stairSides(rot).exit];
      out.push({ level: area.level - 1, x: c.x - o.dx, z: c.z - o.dz, rot });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Motivo inmediato y pista por pasos                                  */
/* ------------------------------------------------------------------ */

export interface PlaceExplanation {
  /** Motivo para el rótulo (más claro que el de la simulación). */
  reason: string | null;
  /** Pista inmediata (puede mejorarla `placeHintSteps`). */
  hint: string | null;
  /** Zona sin acceso bajo la pieza (techo sin escalera...). */
  area: IsolatedArea | null;
}

/**
 * Motivo legible para una colocación inválida (barato: como mucho una distribución y un grafo
 * de celdas). `reason` es el motivo de `sim.checkPlace`.
 */
export function explainPlacement(sim: Simulation, spot: PlaceSpot, reason: string | null): PlaceExplanation {
  const def = spot.def;
  if (!def.levels.includes(spot.level)) return { reason: levelReason(def), hint: levelHint(def, spot.level), area: null };
  if (!reason) return { reason: null, hint: null, area: null };
  if (reason.startsWith('Faltan')) return { reason, hint: 'El sitio es bueno: consigue los materiales (cuentan los almacenes)', area: null };
  if (reason.startsWith('Necesitas')) return { reason, hint: null, area: null };
  if (reason.startsWith('Sin acceso')) {
    const area = isolatedArea(sim, spot);
    if (area) return { reason: isolatedReason(area), hint: isolatedHint(area), area };
  }
  if (reason === GENERIC_ISOLATION) {
    const named = isolationReason(sim, spot);
    if (named) return { reason: named, hint: null, area: null };
  }
  return { reason, hint: null, area: null };
}

/** ¿La colocación es buena salvo, quizá, por los materiales? */
function spatiallyOk(sim: Simulation, type: string, level: number, x: number, z: number, rot: Rotation): boolean {
  const c = sim.checkPlace(type, level, x, z, rot);
  return c.ok || !!c.reason?.startsWith('Faltan');
}

/** Sitio de escalera que lleve a la zona (cada candidato, una validación completa). */
export function* stairSteps(sim: Simulation, area: IsolatedArea): Generator<void, { x: number; z: number; rot: Rotation; nextTo: string | null } | null> {
  const ship = sim.state.ship;
  for (const s of stairCandidates(area)) {
    if (s.x < 0 || s.z < 0 || s.x >= ship.length || s.z >= ship.width) continue;
    yield;
    if (!spatiallyOk(sim, 'escalera', s.level, s.x, s.z, s.rot)) continue;
    // ¿Junto a qué habitación sube? (la de debajo de la celda de salida)
    const o = SIDE_DIR[stairSides(s.rot).exit];
    const layout = computeLayout(ship, true);
    const id = getCell(layout, s.level, s.x + o.dx, s.z + o.dz)?.moduleId;
    const m = id !== null && id !== undefined ? ship.modules.find((mm) => mm.id === id) : undefined;
    return { x: s.x, z: s.z, rot: s.rot, nextTo: m ? moduleDef(m.type).name : null };
  }
  return null;
}

/**
 * Pista para arreglar una colocación inválida, por pasos (cada `yield` precede a una validación
 * completa): 1) girar, si algún giro pasa `sim.checkPlace`; 2) en una zona sin acceso, dónde
 * construir la escalera; 3) una pista genérica según el motivo.
 */
export function* placeHintSteps(sim: Simulation, spot: PlaceSpot, reason: string | null, ex: PlaceExplanation): Generator<void, string | null> {
  const def = spot.def;
  if (!def.levels.includes(spot.level)) return ex.hint;
  if (reason && (reason.startsWith('Faltan') || reason.startsWith('Necesitas'))) return ex.hint;
  const ship = sim.state.ship;
  // 1) ¿Con otro giro? El fantasma se re-centra bajo el cursor al girar: se prueba ese mismo sitio.
  for (let k = 1; k < 4; k++) {
    const r = ((spot.rot + k) % 4) as Rotation;
    const a = anchorFor(def, r, spot.fx, spot.fz, ship);
    if (!a) continue;
    yield;
    if (spatiallyOk(sim, def.id, spot.level, a.x, a.z, r)) return rotateHintText(k);
  }
  // 2) Zona sin acceso: ¿dónde cabe una escalera que llegue?
  if (ex.area) {
    const stair = yield* stairSteps(sim, ex.area);
    if (stair) {
      const where = stair.nextTo ? ` junto ${toArticle(stair.nextTo)}` : '';
      return ex.area.roomsBelow.length ? `Construye una escalera${where} que suba a este techo` : `Construye una escalera${where} que llegue hasta aquí`;
    }
    return ex.area.roomsBelow.length
      ? 'Ninguna escalera cabe junto a este techo: prueba en otro techo con acceso'
      : 'Ninguna escalera cabe hasta aquí: prueba en otra zona';
  }
  return ex.hint ?? fallbackHint(ex.reason ?? reason);
}

/** Ejecuta la pista de golpe (pruebas y depuración). */
export function placeHint(sim: Simulation, spot: PlaceSpot, reason: string | null, ex: PlaceExplanation = explainPlacement(sim, spot, reason)): string | null {
  const it = placeHintSteps(sim, spot, reason, ex);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

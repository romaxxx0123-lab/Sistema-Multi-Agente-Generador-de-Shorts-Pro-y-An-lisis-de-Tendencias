// Constructor de modelos: coloca piezas reales en una grilla de studs y
// genera LDraw. Coordenadas del constructor:
//   x → este (studs), z → norte/fondo (studs), y → arriba (plates; 1 ladrillo = 3)
// El frente del modelo mira al sur (-z). En LDraw: X = 20x, Y = -8y, Z = 20z.
import { compose, applyPoint, applyDir } from './ldraw.mjs';

export const STUD = 20;
export const PLATE = 8;

// Rotación de k cuartos de vuelta alrededor del eje vertical.
// k=1 lleva el +X local al sur (-Z) y el +Z local al este (+X).
export function rotY(k) {
  const q = ((k % 4) + 4) % 4;
  const c = [1, 0, -1, 0][q], s = [0, 1, 0, -1][q];
  return [c, 0, s, 0, 1, 0, -s, 0, c, 0, 0, 0];
}

const DIRS = { E: [1, 0], W: [-1, 0], N: [0, 1], S: [0, -1] };

// Matriz que lleva el "arriba" local (0,-1,0) a un eje dado (alineado a los ejes).
function upTo(axis) {
  const [ax, ay, az] = axis.map(Math.round);
  if (ay === -1) return rotY(0);
  if (ay === 1) return [1, 0, 0, 0, -1, 0, 0, 0, -1, 0, 0, 0];
  if (az === -1) return [1, 0, 0, 0, 0, -1, 0, 1, 0, 0, 0, 0];
  if (az === 1) return [1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0];
  if (ax === 1) return [0, -1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0];
  if (ax === -1) return [0, 1, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0];
  throw new Error(`Eje de stud no alineado: ${axis}`);
}

function boxOfMatrix(M, box) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) {
        const p = applyPoint(M, x, y, z);
        for (let k = 0; k < 3; k++) {
          if (p[k] < min[k]) min[k] = p[k];
          if (p[k] > max[k]) max[k] = p[k];
        }
      }
    }
  }
  return { min, max };
}

export class Model {
  constructor({ id, title, description = '', lib, palette }) {
    this.id = id;
    this.title = title;
    this.description = description;
    this.lib = lib;
    this.palette = palette;
    this.placements = [];
    this.steps = [];
    this.links = []; // conexiones declaradas a mano (clips, barras, encastres)
    this.props = []; // minifiguras de prueba: no son piezas del modelo
    this.propLinks = [];
    this.figs = 0;
    this.envelopes = [];
    this.step('Inicio');
  }

  // Empieza un paso de armado nuevo; todo lo que se agregue va en ese paso.
  step(title) {
    if (this.steps.length && !this.placements.some((p) => p.step === this.steps.length - 1)) {
      this.steps[this.steps.length - 1] = title;
    } else {
      this.steps.push(title);
    }
    return this;
  }

  partDef(name) {
    const def = this.palette.parts[name];
    const d = def ? { name, ...def } : { name, ld: name, rb: name };
    if (!this.lib.has(`${d.ld}.dat`)) throw new Error(`La pieza "${name}" (${d.ld}) no existe en la librería LDraw`);
    return d;
  }

  colorDef(name) {
    const c = this.palette.colors[name];
    if (!c) throw new Error(`Color desconocido: "${name}". Agrégalo a lib/palette.mjs`);
    return { name, ...c };
  }

  // Caja del cuerpo de la pieza (sin studs) en coordenadas locales.
  localBox(def) {
    if (def.box) return def.box;
    return this.lib.geometry(`${def.ld}.dat`).bbox;
  }

  // Coloca una pieza. (x, z) = esquina mínima de su huella ya rotada, en studs;
  // y = altura de su base en plates. Opciones:
  //   rot: cuartos de vuelta (0-3)        face: 'N'|'E'|'S'|'W' hacia dónde mira su frente
  //   note: comentario                   on: pieza a la que se engancha sin studs
  add(part, color, x, y, z, opts = {}) {
    const def = this.partDef(part);
    let rot = opts.rot ?? 0;
    if (opts.face) {
      if (!def.front) throw new Error(`La pieza "${part}" no define frente; usa rot`);
      const want = DIRS[opts.face];
      rot = [0, 1, 2, 3].find((k) => {
        const d = applyDir(rotY(k), def.front[0], 0, def.front[1]);
        return Math.round(d[0]) === want[0] && Math.round(d[2]) === want[1];
      });
    }
    const R = rotY(rot);
    const rb = boxOfMatrix(R, this.localBox(def));
    const M = R.slice();
    M[9] = x * STUD - rb.min[0];
    M[10] = -y * PLATE - rb.max[1];
    M[11] = z * STUD - rb.min[2];
    return this._push(def, color, M, opts);
  }

  // Coloca una pieza con una matriz LDraw explícita (para piezas sueltas o inclinadas).
  addRaw(part, color, matrix, opts = {}) {
    return this._push(this.partDef(part), color, matrix.slice(), opts);
  }

  // Encastra una pieza sobre un stud concreto de otra (sirve para studs laterales).
  //   cell: qué celda de la base de la pieza nueva recibe el stud, [i, j]
  //   twist: cuartos de vuelta alrededor del eje del stud
  onStud(parent, studIndex, part, color, opts = {}) {
    const def = this.partDef(part);
    const stud = this.studsOf(parent)[studIndex];
    if (!stud) throw new Error(`La pieza ${parent.def.name} no tiene stud #${studIndex}`);
    const box = this.localBox(def);
    const [ci, cj] = opts.cell ?? [0, 0];
    const anti = [box.min[0] + 10 + 20 * ci, box.max[1], box.min[2] + 10 + 20 * cj];
    const R = compose(upTo(stud.axis), rotY(opts.twist ?? 0));
    const a = applyPoint(R, anti[0], anti[1], anti[2]);
    const M = R.slice();
    M[9] = stud.base[0] - a[0];
    M[10] = stud.base[1] - a[1];
    M[11] = stud.base[2] - a[2];
    return this._push(def, color, M, opts);
  }

  _push(def, color, M, opts) {
    const col = this.colorDef(color);
    for (let i = 0; i < 12; i++) M[i] = Math.round(M[i] * 1000) / 1000 + 0;
    const p = {
      index: this.placements.length,
      def,
      color: col,
      matrix: M,
      step: this.steps.length - 1,
      note: opts.note || '',
      nest: opts.nest || null,
    };
    this.placements.push(p);
    if (opts.on) this.links.push([p.index, opts.on.index]);
    return p;
  }

  // Minifigura de prueba parada sobre 2 studs. No entra en la lista de piezas ni
  // en la búsqueda de sets: sirve para comprobar cuántas entran y verlas en el visor.
  //   (x, z) = esquina mínima de su huella (2 studs de ancho hacia donde mira)
  //   y = altura del piso en plates     face: hacia dónde mira ('S' por defecto)
  //   color: torso y piernas            legs, head, hat, hatColor: opcionales
  fig(x, y, z, opts = {}) {
    const { face = 'S', color = 'Red', legs = color, head = 'Yellow', hat = null, hatColor = color } = opts;
    const R = rotY({ S: 0, W: 1, N: 2, E: 3 }[face]);
    const side = face === 'E' || face === 'W';
    const cx = (x + (side ? 0.5 : 1)) * STUD, cz = (z + (side ? 1 : 0.5)) * STUD;
    const feet = -y * PLATE;
    const id = this.figs++;
    const put = (part, col, up) => {
      const M = R.slice();
      M[9] = cx; M[10] = feet - up; M[11] = cz;
      const p = { index: -1, def: this.partDef(part), color: this.colorDef(col), matrix: M, step: 0, note: '', nest: `fig${id}`, fig: id };
      this.props.push(p);
      return p;
    };
    const parts = [put('3815c01', legs, 40), put('973c01', color, 72), put('3626cp01', head, 96)];
    if (hat) parts.push(put(hat, hatColor, 96));
    for (let i = 1; i < parts.length; i++) this.propLinks.push([parts[i], parts[i - 1]]);
    return parts;
  }

  // Volumen de prueba: una caja del tamaño de algo que el modelo tiene que
  // alojar (un vehículo, un mecha). Va con las minifiguras: se comprueba que no
  // choque, pero no es una pieza. (x, z) esquina mínima en studs, y base en
  // plates; w, d en studs y h en plates. Varias cajas con la misma etiqueta
  // forman una sola silueta (pueden tocarse entre sí).
  envelope(x, y, z, w, d, h, { color = 'Trans-Light Blue', label = 'vehículo de prueba' } = {}) {
    // box.dat es un cubo de lado 2 centrado en el origen.
    const M = [w * STUD / 2, 0, 0, 0, h * PLATE / 2, 0, 0, 0, d * STUD / 2, (x + w / 2) * STUD, -(y + h / 2) * PLATE, (z + d / 2) * STUD];
    let g = this.envelopes.find((e) => e.label === label);
    if (!g) this.envelopes.push((g = { label, min: [x, y, z], max: [x + w, y + h, z + d] }));
    const lo = [x, y, z], hi = [x + w, y + h, z + d];
    for (let k = 0; k < 3; k++) {
      g.min[k] = Math.min(g.min[k], lo[k]);
      g.max[k] = Math.max(g.max[k], hi[k]);
    }
    g.w = g.max[0] - g.min[0];
    g.h = g.max[1] - g.min[1];
    g.d = g.max[2] - g.min[2];
    const p = { index: -1, def: this.partDef('box'), color: this.colorDef(color), matrix: M, step: 0, note: '', nest: `vol:${label}`, fig: 1000 + this.envelopes.indexOf(g), label };
    this.props.push(p);
    // Las cajas de una misma silueta van unidas entre sí: basta con que una toque el piso.
    if (g.first) this.propLinks.push([p, g.first]);
    else g.first = p;
    return p;
  }

  // Declara una unión que no es stud-con-encastre (clip, barra, puerta en marco…).
  attach(child, parent) {
    this.links.push([child.index, parent.index]);
    return this;
  }

  // Studs de una pieza ya colocada, en coordenadas LDraw del modelo.
  studsOf(p) {
    if (p._studs) return p._studs;
    const g = this.lib.geometry(`${p.def.ld}.dat`);
    p._studs = g.studs.map((s) => {
      const m = compose(p.matrix, s.m);
      const tip = applyPoint(m, 0, -4, 0);
      const d = applyDir(m, 0, -1, 0);
      const len = Math.hypot(d[0], d[1], d[2]);
      const axis = d.map((v) => v / len);
      return { kind: s.kind, tip, axis, base: tip.map((v, k) => v - 4 * axis[k]) };
    });
    return p._studs;
  }

  // Caja del cuerpo de una pieza colocada (LDraw, sin studs).
  boxOf(p) {
    if (!p._box) p._box = boxOfMatrix(p.matrix, this.lib.geometry(`${p.def.ld}.dat`).bbox);
    return p._box;
  }

  // Líneas LDraw del modelo, con un "0 STEP" entre pasos.
  toLDrawLines() {
    const lines = [];
    let step = -1;
    for (const p of this.placements) {
      if (p.step !== step) {
        if (step !== -1) lines.push('0 STEP');
        step = p.step;
        lines.push(`0 // Paso ${step + 1}: ${this.steps[step]}`);
      }
      lines.push(`1 ${p.color.ld} ${[9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => p.matrix[i]).join(' ')} ${p.def.ld}.dat`);
    }
    return lines;
  }

  // Lista de piezas agrupada por pieza+color (ids Rebrickable).
  bom() {
    const map = new Map();
    for (const p of this.placements) {
      const key = `${p.def.rb}|${p.color.rb}`;
      let e = map.get(key);
      if (!e) map.set(key, (e = { part: p.def.rb, ld: p.def.ld, color: p.color.rb, ldColor: p.color.ld, colorName: p.color.name, qty: 0 }));
      e.qty++;
    }
    return [...map.values()];
  }
}

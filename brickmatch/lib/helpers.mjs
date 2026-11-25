// Atajos para escribir modelos: filas, relleno de superficies y simetrías.
import { STUD } from './builder.mjs';
import { CORNER } from './palette.mjs';

// Medidas estándar → número de pieza (el lado largo va segundo: '2x4').
export const SIZES = {
  plate: {
    '1x1': '3024', '1x2': '3023', '1x3': '3623', '1x4': '3710', '1x6': '3666', '1x8': '3460', '1x10': '4477', '1x12': '60479',
    '2x2': '3022', '2x3': '3021', '2x4': '3020', '2x6': '3795', '2x8': '3034', '2x10': '3832', '2x12': '2445', '2x16': '4282',
    '4x4': '3031', '4x6': '3032', '4x8': '3035', '4x10': '3030', '4x12': '3029',
    '6x6': '3958', '6x8': '3036', '6x10': '3033', '6x12': '3028', '6x14': '3456', '6x16': '3027',
    '8x8': '41539', '8x16': '92438', '16x16': '91405',
  },
  tile: {
    '1x1': '3070b', '1x2': '3069b', '1x3': '63864', '1x4': '2431', '1x6': '6636', '1x8': '4162',
    '2x2': '3068b', '2x3': '26603', '2x4': '87079',
  },
  brick: {
    '1x1': '3005', '1x2': '3004', '1x3': '3622', '1x4': '3010', '1x6': '3009', '1x8': '3008', '1x10': '6111', '1x12': '6112', '1x16': '2465',
    '2x2': '3003', '2x3': '3002', '2x4': '3001', '2x6': '2456', '2x8': '3007', '2x10': '3006',
  },
};

export function helpers(m) {
  // Huella (ancho x, fondo z) de una pieza sin rotar, en studs.
  const footprint = (part) => {
    const def = m.partDef(part);
    const b = m.localBox(def);
    return [Math.round((b.max[0] - b.min[0]) / STUD * 2) / 2, Math.round((b.max[2] - b.min[2]) / STUD * 2) / 2];
  };

  // Pieza de catálogo por medida: piece('plate', 2, 4) → '3020'
  const piece = (kind, a, b) => {
    const key = `${Math.min(a, b)}x${Math.max(a, b)}`;
    const id = SIZES[kind][key];
    if (!id) throw new Error(`No hay ${kind} de ${key}`);
    return id;
  };

  // Coloca una pieza rectangular ocupando exactamente w (x) por d (z) studs.
  const rect = (kind, color, x, y, z, w, d, opts = {}) => {
    const id = piece(kind, w, d);
    const [fw] = footprint(id);
    return m.add(id, color, x, y, z, { ...opts, rot: fw === w ? 0 : 1 });
  };

  // Fila de n piezas iguales a lo largo de x o z.
  const row = (part, color, x, y, z, n, opts = {}) => {
    const { dir = 'x', ...rest } = opts;
    const [fw, fd] = footprint(part);
    const turned = (rest.rot ?? 0) % 2 === 1;
    const len = dir === 'x' ? (turned ? fd : fw) : turned ? fw : fd;
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(m.add(part, color, dir === 'x' ? x + i * len : x, y, dir === 'z' ? z + i * len : z, rest));
    }
    return out;
  };

  // Rellena un rectángulo de w × d studs con piezas de las medidas permitidas
  // (de la más grande a la más chica). `skip(x, z)` deja celdas libres y
  // `single(x, z)` coloca otra cosa donde no entra ninguna de las medidas.
  const fill = (kind, color, x0, y, z0, w, d, opts = {}) => {
    const { sizes = ['2x4', '2x3', '2x2', '1x4', '1x3', '1x2', '1x1'], skip = null, single = null, ...rest } = opts;
    const used = Array.from({ length: d }, () => new Array(w).fill(false));
    if (skip) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) if (skip(x0 + i, z0 + j)) used[j][i] = true;
    const order = sizes
      .map((s) => s.split('x').map(Number))
      .sort((a, b) => b[0] * b[1] - a[0] * a[1]);
    const out = [];
    for (let j = 0; j < d; j++) {
      for (let i = 0; i < w; i++) {
        if (used[j][i]) continue;
        let placed = false;
        for (const [a, b] of order) {
          for (const [pw, pd] of a === b ? [[a, b]] : [[b, a], [a, b]]) {
            if (i + pw > w || j + pd > d) continue;
            let free = true;
            for (let jj = j; jj < j + pd && free; jj++) for (let ii = i; ii < i + pw; ii++) if (used[jj][ii]) { free = false; break; }
            if (!free) continue;
            for (let jj = j; jj < j + pd; jj++) for (let ii = i; ii < i + pw; ii++) used[jj][ii] = true;
            out.push(rect(kind, color, x0 + i, y, z0 + j, pw, pd, rest));
            placed = true;
            break;
          }
          if (placed) break;
        }
        if (!placed && single) {
          used[j][i] = true;
          out.push(single(x0 + i, z0 + j));
          placed = true;
        }
        if (!placed) throw new Error(`fill: no entra ninguna pieza en (${x0 + i}, ${z0 + j}) con medidas ${sizes.join(', ')}`);
      }
    }
    return out;
  };

  // Faldón de techo a 33°: anillo de 3 studs de ancho sobre el rectángulo
  // exterior (x0, z0, w, d). Esquinas 3675 y tramos rectos 3297/3298/4286.
  const roofRing = (color, x0, y, z0, w, d) => {
    const out = [
      m.add('3675', color, x0 + w - 3, y, z0, { rot: CORNER.SE }),
      m.add('3675', color, x0, y, z0, { rot: CORNER.SW }),
      m.add('3675', color, x0, y, z0 + d - 3, { rot: CORNER.NW }),
      m.add('3675', color, x0 + w - 3, y, z0 + d - 3, { rot: CORNER.NE }),
    ];
    const run = (len) => {
      const parts = [];
      let rest = len;
      for (const [n, id] of [[4, '3297'], [2, '3298'], [1, '4286']]) {
        while (rest >= n) {
          parts.push([n, id]);
          rest -= n;
        }
      }
      return parts;
    };
    let x = x0 + 3;
    for (const [n, id] of run(w - 6)) {
      out.push(m.add(id, color, x, y, z0, { face: 'S' }), m.add(id, color, x, y, z0 + d - 3, { face: 'N' }));
      x += n;
    }
    let z = z0 + 3;
    for (const [n, id] of run(d - 6)) {
      out.push(m.add(id, color, x0, y, z, { face: 'W' }), m.add(id, color, x0 + w - 3, y, z, { face: 'E' }));
      z += n;
    }
    return out;
  };

  // Remate de techo: cuatro esquinas 3675 formando una pirámide de 6x6.
  const roofCap = (color, x0, y, z0) => [
    m.add('3675', color, x0 + 3, y, z0, { rot: CORNER.SE }),
    m.add('3675', color, x0, y, z0, { rot: CORNER.SW }),
    m.add('3675', color, x0, y, z0 + 3, { rot: CORNER.NW }),
    m.add('3675', color, x0 + 3, y, z0 + 3, { rot: CORNER.NE }),
  ];

  return { footprint, piece, rect, row, fill, roofRing, roofCap };
}

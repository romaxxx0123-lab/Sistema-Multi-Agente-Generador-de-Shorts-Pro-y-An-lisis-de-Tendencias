// Ranking de sets para un modelo: recorre TODOS los sets del catálogo y mide
// cuántas piezas del modelo trae cada uno.
//   exact : misma pieza (o variante de molde) en el mismo color
//   spare : piezas extra que se cubren gracias a los repuestos de la caja
//   shape : misma forma en cualquier color (incluye versiones impresas)
//   copies: el modelo está pensado para comprar esa cantidad de cajas iguales
export function matchSets(catalog, bom, { top = 400, topShape = 150, complementsFor = 12, complementsEach = 6, copies = 1 } = {}) {
  const prep = catalog.prepare(bom.map((b) => ({ part: b.part, color: b.color, qty: b.qty })));
  if (prep.lines.length !== bom.length) {
    throw new Error('El modelo usa dos variantes de molde de la misma pieza en el mismo color; unifícalas en la paleta.');
  }
  const need = Uint32Array.from(prep.lines.map((l) => l.need));
  const score = catalog.score(prep, null, copies);
  const n = catalog.sets.length;
  const sizeOf = (i) => Math.max(catalog.sets[i][4], catalog.sets[i][5]);

  const byExact = [];
  for (let i = 0; i < n; i++) if (score.shape[i] > 0) byExact.push(i);
  byExact.sort((a, b) => score.exact[b] - score.exact[a] || score.shape[b] - score.shape[a] || sizeOf(a) - sizeOf(b));
  const byShape = byExact.slice().sort((a, b) => score.shape[b] - score.shape[a] || score.exact[b] - score.exact[a] || sizeOf(a) - sizeOf(b));

  const chosen = new Map(); // índice de set → entrada
  const entry = (i) => {
    let e = chosen.get(i);
    if (e) return e;
    const s = catalog.setInfo(i);
    const h = catalog.have(prep, i, copies);
    const x = [], sp = [], g = [];
    let exact = 0, spare = 0, shape = 0;
    for (let l = 0; l < need.length; l++) {
      const a = Math.min(need[l], h.exact[l]);
      const b = Math.min(need[l] - a, h.spare[l]);
      if (a) x.push(l, a);
      if (b) sp.push(l, b);
      exact += a;
      spare += b;
    }
    for (let k = 0; k < prep.groups.length; k++) {
      const a = Math.min(prep.groups[k].need, h.shape[k]);
      if (a) g.push(k, a);
      shape += a;
    }
    e = { num: s.num, name: s.name, year: s.year, theme: s.theme, parts: sizeOf(i), exact, spare, shape, x, sp, g };
    chosen.set(i, e);
    return e;
  };

  for (const i of byExact.slice(0, top)) entry(i);
  for (const i of byShape.slice(0, topShape)) entry(i);

  // Mejor segundo set para completar lo que le falta a cada uno de los primeros.
  for (const i of byExact.slice(0, complementsFor)) {
    const e = entry(i);
    const h = catalog.have(prep, i, copies);
    const residual = new Uint32Array(need.length);
    let missing = 0;
    for (let l = 0; l < need.length; l++) {
      residual[l] = need[l] - Math.min(need[l], h.exact[l]);
      missing += residual[l];
    }
    if (!missing) continue;
    const rs = catalog.score(prep, residual, copies);
    const order = [];
    for (let j = 0; j < n; j++) if (j !== i && rs.exact[j] > 0) order.push(j);
    order.sort((a, b) => rs.exact[b] - rs.exact[a] || sizeOf(a) - sizeOf(b));
    e.comp = order.slice(0, complementsEach).map((j) => [entry(j).num, rs.exact[j]]);
  }

  const list = [...chosen.values()].sort((a, b) => b.exact - a.exact || b.shape - a.shape || a.parts - b.parts);
  return {
    searched: n,
    copies,
    total: prep.total,
    groups: prep.groups.map((gr) => gr.lines),
    list,
  };
}

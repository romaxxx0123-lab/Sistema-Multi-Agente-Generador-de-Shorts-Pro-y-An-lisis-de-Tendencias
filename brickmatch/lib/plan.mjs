// Plan de armado: convierte el modelo ya validado en instrucciones que se
// pueden seguir con las manos.
//   1. Capítulos: los pasos con nombre del modelo, en el orden en que conviene
//      construirlos (`order`; sin él, el orden en que se escribieron).
//   2. Sub-pasos: cada capítulo se parte en tandas chicas (como un manual de
//      Lego: de 3 a 6 piezas), de abajo hacia arriba. Una pieza solo entra
//      cuando ya tiene dónde encastrar: en ningún sub-paso queda algo flotando.
// Reordena model.placements (y sus uniones) y deja un título por sub-paso.
export function planBuild(model, edges, { order = null, max = 6, target = 4, maxSame = 8, ground = 0 } = {}) {
  const P = model.placements;
  const n = P.length;
  const adj = P.map(() => []);
  for (const key of edges.keys()) {
    const [a, b] = key.split('-').map(Number);
    if (a < n && b < n) {
      adj[a].push(b);
      adj[b].push(a);
    }
  }
  // Lo que se une a mano (vidrio en su marco, katana en su clip) se arma junto.
  const kids = P.map(() => []);
  for (const [child, parent] of model.links) if (child < n && parent < n) kids[parent].push(child);

  const box = P.map((p) => model.boxOf(p));
  const bottom = box.map((b) => -b.max[1]);
  const onTable = box.map((b) => Math.abs(b.max[1] - ground) < 0.6);
  const lot = P.map((p) => `${p.def.rb}|${p.color.rb}`);
  const titles = model.steps.slice();
  const notes = model.notes || [];
  const issues = [];

  let seq = titles.map((_, s) => s).filter((s) => P.some((p) => p.step === s));
  if (order) {
    const pos = new Map(order.map((t, i) => [t, i]));
    for (const t of order) if (!titles.includes(t)) issues.push(`El orden de armado nombra un paso que no existe: «${t}»`);
    for (const s of seq) if (!pos.has(titles[s])) issues.push(`El paso «${titles[s]}» no figura en el orden de armado: queda al final`);
    seq = seq.slice().sort((a, b) => (pos.get(titles[a]) ?? 1e6 + a) - (pos.get(titles[b]) ?? 1e6 + b));
  }

  const placed = new Uint8Array(n);
  const chapters = [], subs = [], sequence = [];
  // Piezas que todavía no tienen dónde encastrar (las sostiene algo de un
  // capítulo posterior): esperan y entran en cuanto aparece su apoyo.
  let waiting = [];
  seq.forEach((s, at) => {
    const own = new Set();
    for (const p of P) if (p.step === s) own.add(p.index);
    let rest = [...waiting, ...own];
    waiting = [];
    const chapter = { title: titles[s], note: notes[s] || '', first: subs.length, count: 0, pieces: 0 };
    while (rest.length) {
      let ready = rest.filter((i) => onTable[i] || adj[i].some((j) => placed[j]));
      if (!ready.length) {
        if (at < seq.length - 1) {
          waiting = rest;
          break;
        }
        const i = rest.reduce((a, b) => (bottom[a] <= bottom[b] ? a : b));
        issues.push(`En «${titles[s]}», ${P[i].def.name} ${P[i].color.name} no tiene dónde encastrar en ningún momento del armado`);
        ready = [i];
      }
      ready.sort((a, b) => bottom[a] - bottom[b] || (lot[a] < lot[b] ? -1 : lot[a] > lot[b] ? 1 : 0) || box[a].min[2] - box[b].min[2] || box[a].min[0] - box[b].min[0]);
      // Cuánto ocupa una pieza en la tanda: ella más lo que lleva unido a mano.
      const weight = (i) => 1 + kids[i].filter((c) => !placed[c] && rest.includes(c)).length;
      const fit = (list, limit) => {
        const out = [];
        let w = 0;
        for (const i of list) {
          if (out.length && w + weight(i) > limit) break;
          out.push(i);
          w += weight(i);
        }
        return out;
      };
      let take;
      if (ready.every((i) => lot[i] === lot[ready[0]])) {
        // Todas iguales (una fila de tejas, un paño de persianas): van juntas,
        // de a grupos vecinos: se ordenan a lo largo de donde más se extienden.
        const spread = [0, 2, 1].map((k) => Math.max(...ready.map((i) => box[i].min[k])) - Math.min(...ready.map((i) => box[i].min[k])));
        const axis = [0, 2, 1][spread.indexOf(Math.max(...spread))];
        const other = axis === 0 ? 2 : 0;
        ready.sort((a, b) => box[a].min[axis] - box[b].min[axis] || box[a].min[other] - box[b].min[other] || bottom[a] - bottom[b]);
        take = fit(ready, maxSame);
      } else {
        // La capa más baja; si son muy pocas, se suma la que sigue.
        const y0 = bottom[ready[0]];
        let layer = ready.filter((i) => bottom[i] <= y0 + 0.5);
        if (layer.length < 3) layer = ready.filter((i) => bottom[i] <= y0 + 24.5);
        take = fit(layer, max);
        if (take.every((i) => lot[i] === lot[take[0]])) take = fit(layer.filter((i) => lot[i] === lot[layer[0]]), maxSame);
      }
      const load = () => take.reduce((w, i) => w + weight(i), 0);
      // Una pieza suelta al final del capítulo se suma a esta tanda.
      {
        const set = new Set(take);
        const tail = rest.filter((i) => !set.has(i));
        if (tail.length === 1 && weight(tail[0]) === 1 && (onTable[tail[0]] || adj[tail[0]].some((j) => placed[j]))) take.push(tail[0]);
      }
      // Si la tanda quedó chica, crece hacia arriba con lo que apoya en ella: una
      // pila de piezas iguales va entera, y un farol o un poste, de una vez.
      const inTake = new Set(take);
      for (;;) {
        const cand = rest.filter((i) => !inTake.has(i) && (onTable[i] || adj[i].some((j) => placed[j] || inTake.has(j))));
        if (!cand.length) break;
        cand.sort((a, b) => bottom[a] - bottom[b] || (lot[a] < lot[b] ? -1 : lot[a] > lot[b] ? 1 : 0));
        const uniform = take.every((i) => lot[i] === lot[take[0]]);
        const twins = cand.filter((i) => lot[i] === lot[take[0]]);
        let add;
        if (uniform && twins.length && load() < maxSame) add = fit(twins, maxSame - load());
        else if (load() < target) add = fit(cand.filter((i) => bottom[i] <= bottom[cand[0]] + 0.5), max - load());
        else break;
        if (!add.length) break;
        for (const i of add) {
          inTake.add(i);
          take.push(i);
        }
      }
      // Sub-conjuntos: lo que va unido a mano a una pieza de esta tanda.
      for (let k = 0; k < take.length; k++) {
        for (const c of kids[take[k]]) {
          if (!inTake.has(c) && !placed[c] && rest.includes(c)) {
            inTake.add(c);
            take.push(c);
          }
        }
      }
      for (const i of take) placed[i] = 1;
      rest = rest.filter((i) => !placed[i]);
      subs.push({ chapter: chapters.length, table: take.some((i) => onTable[i]), parts: take.length });
      for (const i of take) sequence.push([i, subs.length - 1]);
      chapter.pieces += take.length;
    }
    chapter.count = subs.length - chapter.first;
    if (chapter.count) chapters.push(chapter);
  });

  const newIndex = new Int32Array(n);
  sequence.forEach(([old], k) => { newIndex[old] = k; });
  model.placements = sequence.map(([old, sub], k) => {
    const p = P[old];
    p.index = k;
    p.step = sub;
    delete p._box;
    return p;
  });
  model.links = model.links.map(([a, b]) => [newIndex[a], newIndex[b]]);
  model.steps = subs.map((sub) => chapters[sub.chapter].title);
  model.chapters = chapters;
  return { chapters, subs, issues };
}

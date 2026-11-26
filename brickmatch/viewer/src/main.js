// Mini app: visor 3D + ranking de sets + inventario + pasos de armado.
import { Stage, Thumbnailer } from './stage.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => n.toLocaleString('es-AR');
const pct = (a, b) => (b ? `${(Math.floor((a / b) * 1000) / 10).toLocaleString('es-AR')}%` : '0%');
const width = (a, b) => `${b ? Math.min(100, (a / b) * 100).toFixed(1) : 0}%`;
const date = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

const api = (window.brickmatch = { status: 'loading' });
const state = {
  models: [],
  id: null,
  report: null,
  setByNum: new Map(),
  tab: 'sets',
  selected: [],
  showMissing: true,
  showFigs: true,
  showVolumes: true,
  spares: false,
  sort: 'exact',
  maxSize: 0,
  minYear: 0,
  query: '',
  shown: 25,
  step: 0,
  follow: true, // la cámara sigue las piezas nuevas de cada paso
  refocus: false,
  playing: null,
  focusLot: null,
  onlyMissing: false,
  thumbs: new Map(),
  thumbRun: 0,
};
let stage = null;
let thumbnailer = null;

// ------------------------------------------------------------- cobertura
function cover(nums) {
  const { bom, sets } = state.report;
  const have = new Array(bom.length).fill(0);
  const groupHave = new Array(sets.groups.length).fill(0);
  for (const n of nums) {
    const s = state.setByNum.get(n);
    if (!s) continue;
    for (let i = 0; i < s.x.length; i += 2) have[s.x[i]] += s.x[i + 1];
    if (state.spares) for (let i = 0; i < s.sp.length; i += 2) have[s.sp[i]] += s.sp[i + 1];
    for (let i = 0; i < s.g.length; i += 2) groupHave[s.g[i]] += s.g[i + 1];
  }
  let exact = 0, shape = 0;
  bom.forEach((b, l) => {
    have[l] = Math.min(have[l], b.qty);
    exact += have[l];
  });
  sets.groups.forEach((lines, k) => {
    shape += Math.min(lines.reduce((a, l) => a + bom[l].qty, 0), groupHave[k]);
  });
  return { have, exact, shape };
}
const setExact = (s) => s.exact + (state.spares ? s.spare : 0);

function filteredSets() {
  const { sets, counts } = state.report;
  const q = state.query.trim().toLowerCase();
  let list = sets.list.filter(
    (s) => (!state.maxSize || s.parts <= state.maxSize) && s.year >= state.minYear && (!q || `${s.num} ${s.name} ${s.theme}`.toLowerCase().includes(q)),
  );
  if (state.sort === 'shape') list.sort((a, b) => b.shape - a.shape || setExact(b) - setExact(a) || a.parts - b.parts);
  else if (state.sort === 'value') {
    const value = (s) => setExact(s) / Math.max(s.parts, counts.pieces);
    list = list.filter((s) => setExact(s) >= counts.pieces * 0.2).sort((a, b) => value(b) - value(a));
  } else list.sort((a, b) => setExact(b) - setExact(a) || b.shape - a.shape || a.parts - b.parts);
  return list;
}

// ------------------------------------------------------------ estado 3D
function applyStates() {
  if (!stage || !state.report || stage.parts.length !== state.report.placements.length) return;
  const P = state.report.placements;
  const states = new Array(P.length).fill('normal');
  let flag = '', miss = false;
  if (state.tab === 'steps') {
    P.forEach(([, s], i) => {
      states[i] = s < state.step ? 'past' : s === state.step ? 'new' : 'hidden';
    });
  } else if (state.tab === 'lots' && state.focusLot !== null) {
    P.forEach(([lot], i) => {
      states[i] = lot === state.focusLot ? 'new' : 'dim';
    });
    const b = state.report.bom[state.focusLot];
    flag = `Resaltado: <b>${b.qty}× ${esc(b.part)}</b> ${esc(b.colorName)}`;
  } else if (state.selected.length && state.showMissing) {
    const have = cover(state.selected).have.slice();
    let missing = 0;
    P.forEach(([lot], i) => {
      if (have[lot] > 0) have[lot]--;
      else {
        states[i] = 'ghost';
        missing++;
      }
    });
    miss = missing > 0;
    flag = missing
      ? `En rojo: <b>${num(missing)} pieza${missing === 1 ? '' : 's'}</b> que no trae ${esc(state.selected.join(' + '))}`
      : `Con <b>${esc(state.selected.join(' + '))}</b> armás el modelo completo`;
  }
  stage.setStates(states, { highlight: state.tab === 'steps' });
  // Las minifiguras de prueba se ven con el modelo terminado, no durante el armado.
  const building = state.tab === 'steps';
  stage.setFigs(state.showFigs && !building);
  stage.setVolumes(state.showVolumes && !building);
  if (building && state.refocus) {
    // sticky: si las piezas nuevas ya se ven bien, la cámara no se mueve.
    renderStageSteps(); // primero el recuadro: su alto define cuánto visor queda libre
    if (state.follow) stage.focusParts(stepParts(state.step), { sticky: state.refocus !== 'force', context: stepContext(state.step), padTop: coveredTop() });
    state.refocus = false;
  }
  renderStageSteps();
  $('stage-flag').hidden = !flag;
  $('stage-flag').classList.toggle('miss', miss);
  $('stage-flag').innerHTML = flag;
}

// ---------------------------------------------------------------- armado
const stepParts = (k) => {
  const out = [];
  state.report.placements.forEach(([, s], i) => {
    if (s === k) out.push(i);
  });
  return out;
};
// Piezas del mismo capítulo que quedan cerca de las del paso (aunque todavía
// no estén puestas): la cámara encuadra esa zona de trabajo, y así los pasos
// seguidos se ven desde el mismo lugar.
function stepContext(k) {
  const r = state.report;
  const fp = r.footprints;
  if (!fp || !r.stepChapter) return null;
  const mine = stepParts(k);
  let cx = 0, cz = 0;
  for (const i of mine) {
    cx += (fp[i][0] + fp[i][2]) / 2;
    cz += (fp[i][1] + fp[i][3]) / 2;
  }
  cx /= mine.length || 1;
  cz /= mine.length || 1;
  const ci = r.stepChapter[k];
  const out = [];
  r.placements.forEach(([, s], i) => {
    if (r.stepChapter[s] !== ci) return;
    if (Math.hypot((fp[i][0] + fp[i][2]) / 2 - cx, (fp[i][1] + fp[i][3]) / 2 - cz) <= 9) out.push(i);
  });
  return out;
}
// Fracción de arriba del visor que tapan la barra de pasos y el recuadro de piezas.
function coveredTop() {
  const bar = $('stage-steps'), box = $('stage-canvas').getBoundingClientRect();
  if (bar.hidden || !box.height) return 0;
  return Math.min(0.45, Math.max(0, bar.getBoundingClientRect().bottom - box.top) / box.height);
}
// El paso donde quedó cada modelo se recuerda en este navegador.
const memory = {
  key: () => `brickmatch.paso.${state.id}.${state.report.steps.length}`,
  load() {
    try {
      const v = Number(localStorage.getItem(this.key()));
      return Number.isInteger(v) && v > 0 && v < state.report.steps.length ? v : 0;
    } catch {
      return 0;
    }
  },
  save(step) {
    try {
      localStorage.setItem(this.key(), String(step));
    } catch {
      // sin almacenamiento (ventana privada): se arranca del paso 1
    }
  },
};
// Capítulo y parte de un paso (los modelos viejos no traen capítulos).
function stepInfo(k) {
  const r = state.report;
  const ci = r.stepChapter ? r.stepChapter[k] : k;
  const ch = r.chapters ? r.chapters[ci] : { title: r.steps[k], note: '', first: k, count: 1, part: 0 };
  return { ci, ch, part: r.parts && r.parts.length ? r.parts[ch.part] : '', table: !!(r.stepTable && r.stepTable[k]) };
}
// Plano visto desde arriba (el frente abajo): la huella del modelo en gris y las
// piezas del paso en color. Sirve para ubicar el paso en un modelo grande.
function minimap(k) {
  const r = state.report;
  const fp = r.footprints;
  if (!fp || !fp.length) return '';
  if (!state.plan || state.plan.id !== state.id) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const [a, b, c, d] of fp) {
      x0 = Math.min(x0, a); z0 = Math.min(z0, b); x1 = Math.max(x1, c); z1 = Math.max(z1, d);
    }
    x0 = Math.floor(x0); z0 = Math.floor(z0);
    const W = Math.ceil(x1) - x0, H = Math.ceil(z1) - z0;
    const grid = new Uint8Array(W * H);
    for (const [a, b, c, d] of fp) {
      for (let z = Math.floor(b - z0 + 0.01); z < Math.ceil(d - z0 - 0.01); z++) {
        for (let x = Math.floor(a - x0 + 0.01); x < Math.ceil(c - x0 - 0.01); x++) grid[z * W + x] = 1;
      }
    }
    let path = '';
    for (let z = 0; z < H; z++) {
      for (let x = 0; x < W; x++) {
        if (!grid[z * W + x]) continue;
        let e = x;
        while (e < W && grid[z * W + e]) e++;
        path += `M${x} ${H - 1 - z}h${e - x}v1h${x - e}z`;
        x = e;
      }
    }
    state.plan = { id: state.id, x0, z0, W, H, path };
  }
  const { x0, z0, W, H, path } = state.plan;
  let now = '', bx0 = Infinity, bz0 = Infinity, bx1 = -Infinity, bz1 = -Infinity;
  for (const i of stepParts(k)) {
    const [a, b, c, d] = fp[i];
    now += `M${(a - x0).toFixed(1)} ${(H - (d - z0)).toFixed(1)}h${(c - a).toFixed(1)}v${(d - b).toFixed(1)}h${(a - c).toFixed(1)}z`;
    bx0 = Math.min(bx0, a); bz0 = Math.min(bz0, b); bx1 = Math.max(bx1, c); bz1 = Math.max(bz1, d);
  }
  // Un aro alrededor de lo nuevo, para encontrarlo aunque sea una sola pieza.
  const cx = (bx0 + bx1) / 2 - x0, cy = H - ((bz0 + bz1) / 2 - z0);
  const rad = Math.max(Math.hypot(bx1 - bx0, bz1 - bz0) / 2 + 2, Math.max(W, H) * 0.06);
  return `<svg class="minimap" viewBox="-2 -2 ${W + 4} ${H + 4}" role="img" aria-label="Plano del modelo visto desde arriba, con el frente abajo: en color, dónde van las piezas de este paso">
    <path class="mm-all" d="${path}"/><path class="mm-now" d="${now}"/><circle class="mm-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad.toFixed(1)}"/></svg>`;
}
// Barra de pasos encima del visor: en el teléfono se avanza sin dejar de ver el modelo.
function renderStageSteps() {
  const bar = $('stage-steps');
  const on = state.tab === 'steps' && !!state.report;
  bar.hidden = !on;
  // Botonera: durante el armado quedan solo los botones que sirven.
  const build = $('tool-build');
  build.setAttribute('aria-pressed', String(on));
  build.textContent = on ? 'Cerrar instrucciones' : state.step > 0 ? `Instrucciones · paso ${state.step + 1}` : 'Instrucciones';
  $('tool-fit').textContent = on ? 'Centrar el paso' : 'Reencuadrar';
  for (const id of ['tool-spin', 'tool-figs', 'tool-vol']) $(id).classList.toggle('off', on);
  if (!on) return;
  const r = state.report;
  const n = r.steps.length;
  const k = state.step;
  const { ch, table } = stepInfo(k);
  $('stage-prev').disabled = k === 0;
  $('stage-next').disabled = k === n - 1;
  $('stage-step').innerHTML = `<b>Paso ${k + 1}</b> de ${n} · ${esc(ch.title)}`;
  // Recuadro de piezas del paso, como en un manual: imagen y cantidad.
  const lots = new Map();
  r.placements.forEach(([lot, s]) => {
    if (s === k) lots.set(lot, (lots.get(lot) || 0) + 1);
  });
  const first = k === ch.first;
  $('stage-callout').innerHTML = `<div class="need">${[...lots].map(([l, q]) => `<span class="chip" title="${esc(r.bom[l].part)} · ${esc(r.bom[l].colorName)}">${thumbHtml(l)}<b>${q}×</b></span>`).join('')}</div>
    ${table ? `<p class="tag">Sobre la mesa</p>` : ''}${first && ch.note ? `<p class="how">${esc(ch.note)}</p>` : ''}`;
}

// ------------------------------------------------------------ miniaturas
function thumbHtml(lot) {
  const url = state.thumbs.get(lot);
  return url ? `<img alt="" src="${url}" data-thumb="${lot}">` : `<span class="ph" data-thumb="${lot}"></span>`;
}
function startThumbs() {
  const run = ++state.thumbRun;
  const first = new Map();
  state.report.placements.forEach(([lot], i) => {
    if (!first.has(lot)) first.set(lot, i);
  });
  const queue = [...first.entries()];
  const work = () => {
    if (run !== state.thumbRun) return;
    try {
      if (!thumbnailer) thumbnailer = new Thumbnailer(120);
      for (let k = 0; k < 4 && queue.length; k++) {
        const [lot, i] = queue.shift();
        const url = thumbnailer.shot(stage.parts[i]);
        state.thumbs.set(lot, url);
        for (const el of document.querySelectorAll(`[data-thumb="${lot}"]`)) {
          if (el.tagName === 'IMG') el.src = url;
          else el.outerHTML = `<img alt="" src="${url}" data-thumb="${lot}">`;
        }
      }
    } catch (e) {
      console.warn('No se pudieron generar las miniaturas', e);
      return;
    }
    if (queue.length) setTimeout(work, 30);
  };
  setTimeout(work, 200);
}

// --------------------------------------------------------------- render
function lotCard(l, { status = '', pressed = null, qty = null } = {}) {
  const b = state.report.bom[l];
  const tag = pressed === null ? 'div' : 'button';
  const attrs = pressed === null ? '' : ` type="button" data-lot="${l}" aria-pressed="${pressed}"`;
  return `<${tag} class="lot"${attrs}>
    ${thumbHtml(l)}${status}
    <span class="qty">${qty ?? b.qty}×</span>
    <span class="pn">${esc(b.part)}</span>
    <span class="col"><i class="sw" style="background:${b.rgb}${b.trans ? ';opacity:.6' : ''}"></i>${esc(b.colorName)}</span>
    <span class="nm">${esc(b.name)}</span>
  </${tag}>`;
}

function renderModels() {
  $('models').innerHTML = state.models
    .map((m) => `<button type="button" data-model="${esc(m.id)}" aria-pressed="${m.id === state.id}">${esc(m.title)}</button>`)
    .join('');
}

function renderBrief() {
  const r = state.report;
  const v = r.validation;
  const check = v.ok
    ? `<span class="fact ok">Armable: sin choques y ${v.stats.components > 1 ? 'cada módulo bien encastrado' : 'todo encastrado'}</span>`
    : `<span class="fact err">${v.errors.length} problema${v.errors.length === 1 ? '' : 's'} de armado</span>`;
  $('brief').innerHTML = `
    ${r.prompt ? `<span class="eyebrow">Pedido: «${esc(r.prompt)}»</span>` : ''}
    <h1>${esc(r.title)}</h1>
    <p>${esc(r.description)}</p>
    <div class="facts">
      <span class="fact"><b>${num(r.counts.pieces)}</b> piezas</span>
      <span class="fact"><b>${num(r.counts.lots)}</b> lotes distintos</span>
      <span class="fact"><b>${num(r.counts.steps)}</b> pasos de armado</span>
      ${r.size ? `<span class="fact">Mide <b>${r.size.join(' × ')} cm</b></span>` : ''}
      ${check}
      ${v.ok && v.stats.components > 1 ? `<span class="fact">Va en <b>${v.stats.components}</b> módulos apoyados en la mesa</span>` : ''}
      ${v.ok && v.stats.linksChecked ? `<span class="fact ok"><b>${num(v.stats.linksChecked)}</b> uniones especiales comprobadas (clips, bisagras, ejes)</span>` : ''}
      ${v.resting && v.resting.length ? `<span class="fact">Van apoyadas, sin presión: ${v.resting.map((x) => `<b>${x.qty}</b> × ${esc(x.name || x.part)}`).join(', ')}</span>` : ''}
      ${r.figs ? `<span class="fact ${r.figs.ok ? 'ok' : 'err'}">${r.figs.ok ? `Entran <b>${num(r.figs.count)}</b> minifiguras sin chocar` : `${r.figs.errors.length} problema(s) con las minifiguras o el vehículo`}</span>` : ''}
      ${r.figs && r.figs.ok ? (r.figs.volumes || []).map((v) => `<span class="fact ok">Entra ${esc(v.label)}: <b>${v.cm.map((n) => String(n).replace('.', ',')).join(' × ')} cm</b></span>`).join('') : ''}
    </div>`;
}

function renderSets() {
  const r = state.report;
  if (!r.sets) return `<p class="note">Este modelo todavía no tiene búsqueda de sets.</p>`;
  const total = r.counts.pieces;
  const list = filteredSets();
  const best = list[0];
  const filtered = state.maxSize || state.minYear || state.query.trim();
  const copies = r.sets.copies || 1;
  let html = copies > 1 ? `<p class="note">Este modelo está pensado para armarse con <b>${copies} cajas iguales</b> del mismo set: los porcentajes de la lista cuentan esa cantidad de cada set.</p>` : '';

  if (best) {
    const e = setExact(best);
    html += `<section class="lead">
      <span class="eyebrow">${filtered ? 'Mejor set con estos filtros' : 'El set que más piezas trae'}${copies > 1 ? ` · comprando ${copies} cajas iguales` : ''}</span>
      <h2>${copies > 1 ? `${copies} × ` : ''}${esc(best.name)}</h2>
      <span class="meta"><span class="num" style="font-family:var(--font-mono)">${esc(best.num)}</span> · ${best.year} · ${esc(best.theme)} · ${num(best.parts)} piezas${copies > 1 ? ' por caja' : ''}</span>
      <div class="big"><b>${pct(e, total)}</b><span>${num(e)} de ${num(total)} piezas, en el color exacto</span></div>
      <div class="meter"><i class="shape" style="width:${width(best.shape, total)}"></i><i class="exact" style="width:${width(e, total)}"></i></div>
      <div class="row-actions">
        <button type="button" class="btn" data-pick="${esc(best.num)}">${state.selected.includes(best.num) ? 'Quitar de la comparación' : 'Ver qué me falta en 3D'}</button>
        <a class="link" href="https://rebrickable.com/sets/${encodeURIComponent(best.num)}/" target="_blank" rel="noopener">Rebrickable ↗</a>
        <a class="link" href="https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(best.num)}" target="_blank" rel="noopener">BrickLink ↗</a>
      </div>
    </section>`;
  }

  if (state.selected.length) {
    const c = cover(state.selected);
    const missing = r.bom.map((b, l) => [l, b.qty - c.have[l]]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
    const names = state.selected.map((n) => state.setByNum.get(n)).filter(Boolean);
    let comp = '';
    if (names.length === 1 && names[0].comp && missing.length) {
      comp = `<p class="note">Para completar lo que falta:</p><div class="row-actions">${names[0].comp
        .slice(0, 4)
        .map(([n, add]) => {
          const s = state.setByNum.get(n);
          return s ? `<button type="button" class="btn ghost" data-pick="${esc(n)}">+ ${esc(n)} ${esc(s.name)} (+${num(add)})</button>` : '';
        })
        .join('')}</div>`;
    }
    html += `<section class="lead missing">
      <span class="eyebrow">Tu comparación: ${esc(state.selected.join(' + '))}</span>
      <div class="big"><b>${pct(c.exact, total)}</b><span>${num(c.exact)} de ${num(total)} piezas${missing.length ? ` · faltan ${num(total - c.exact)}` : ''}</span></div>
      <div class="meter"><i class="shape" style="width:${width(c.shape, total)}"></i><i class="exact" style="width:${width(c.exact, total)}"></i></div>
      <label class="check"><input type="checkbox" id="show-missing" ${state.showMissing ? 'checked' : ''}> Marcar en el modelo 3D lo que falta</label>
      ${missing.length ? `<h3>Piezas que tendrías que conseguir aparte</h3><div class="lots">${missing.map(([l, m]) => lotCard(l, { qty: m })).join('')}</div>` : `<p class="note">No falta ninguna pieza: se arma entero con esta compra.</p>`}
      ${comp}
      <div class="row-actions"><button type="button" class="btn ghost" id="clear-sel">Quitar comparación</button></div>
    </section>`;
  }

  html += `<div class="filters">
      <label class="wide">Buscar por nombre, número o tema<input type="search" id="set-search" value="${esc(state.query)}" placeholder="Ej: Ninjago, 10315, jardín"></label>
      <label>Ordenar por<select id="set-sort">
        <option value="exact" ${state.sort === 'exact' ? 'selected' : ''}>Piezas cubiertas</option>
        <option value="shape" ${state.sort === 'shape' ? 'selected' : ''}>Misma forma, otro color</option>
        <option value="value" ${state.sort === 'value' ? 'selected' : ''}>Mejor aprovechado</option>
      </select></label>
      <label>Tamaño del set<select id="set-size">
        ${[[0, 'Cualquiera'], [1000, 'Hasta 1.000 piezas'], [2000, 'Hasta 2.000 piezas'], [4000, 'Hasta 4.000 piezas']].map(([v, t]) => `<option value="${v}" ${state.maxSize === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label>Año<select id="set-year">
        ${[[0, 'Todos'], [2015, 'Desde 2015'], [2020, 'Desde 2020'], [2023, 'Desde 2023']].map(([v, t]) => `<option value="${v}" ${state.minYear === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select></label>
      <label class="check"><input type="checkbox" id="set-spares" ${state.spares ? 'checked' : ''}> Contar repuestos de la caja</label>
    </div>`;

  html += `<ol class="sets">${list
    .slice(0, state.shown)
    .map((s) => {
      const e = setExact(s);
      return `<li><button type="button" class="set" data-pick="${esc(s.num)}" aria-pressed="${state.selected.includes(s.num)}">
        <span class="name"><span class="num">${esc(s.num)}</span>${esc(s.name)}</span>
        <span class="pct"><b>${pct(e, total)}</b><span>${num(e)}/${num(total)}</span></span>
        <span class="sub">${s.year} · ${esc(s.theme)} · ${num(s.parts)} piezas</span>
        <span class="meter"><i class="shape" style="width:${width(s.shape, total)}"></i><i class="exact" style="width:${width(e, total)}"></i></span>
      </button></li>`;
    })
    .join('')}</ol>`;
  if (!list.length) html += `<p class="note">Ningún set coincide con esos filtros.</p>`;
  if (list.length > state.shown) html += `<button type="button" class="btn ghost more" id="more-sets">Mostrar más sets</button>`;
  html += `<p class="foot">Barra verde: misma pieza y mismo color. Barra azul: la misma forma en otro color. Se revisaron ${num(r.data.setsSearched)} sets con inventario (${esc(r.data.source)}, datos al ${date(r.data.date)}). Tocá un set para compararlo; podés sumar varios.</p>`;
  return html;
}

function renderLots() {
  const r = state.report;
  const c = state.selected.length ? cover(state.selected) : null;
  let lots = r.bom.map((_, l) => l);
  if (c && state.onlyMissing) lots = lots.filter((l) => c.have[l] < r.bom[l].qty);
  let head = '';
  if (state.focusLot !== null) {
    const b = r.bom[state.focusLot];
    head = `<section class="lead">
      <span class="eyebrow">Pieza resaltada en el modelo</span>
      <h2>${esc(b.name)}</h2>
      <span class="meta">${b.qty}× · pieza <span style="font-family:var(--font-mono)">${esc(b.part)}</span> · ${esc(b.colorName)} · salió en ${num(b.sets)} set${b.sets === 1 ? '' : 's'}${b.lastYear ? ` (último: ${b.lastYear})` : ''}</span>
      <div class="row-actions">
        <a class="link" href="https://rebrickable.com/parts/${encodeURIComponent(b.part)}/" target="_blank" rel="noopener">Ver la pieza en Rebrickable ↗</a>
        <button type="button" class="btn ghost" id="clear-focus">Quitar resaltado</button>
      </div>
    </section>`;
  }
  const filter = c
    ? `<label class="check"><input type="checkbox" id="only-missing" ${state.onlyMissing ? 'checked' : ''}> Solo las que faltan con ${esc(state.selected.join(' + '))}</label>`
    : `<p class="note">Tocá una pieza para verla resaltada en el modelo. Elegí un set en la pestaña Sets para ver cuáles ya tendrías.</p>`;
  return `${head}${filter}
    <div class="lots">${lots
      .map((l) => {
        const b = r.bom[l];
        const status = c ? `<span class="st ${c.have[l] >= b.qty ? 'ok' : 'no'}">${c.have[l]}/${b.qty}</span>` : '';
        return lotCard(l, { status, pressed: state.focusLot === l });
      })
      .join('')}</div>
    <p class="foot">Los números de pieza y los nombres de color son los de Rebrickable/BrickLink, para buscarlas tal cual.</p>`;
}

function renderSteps() {
  const r = state.report;
  const n = r.steps.length;
  const k = state.step;
  const { ci, ch, part, table } = stepInfo(k);
  const lots = new Map();
  let pieces = 0;
  r.placements.forEach(([lot, s]) => {
    if (s !== k) return;
    lots.set(lot, (lots.get(lot) || 0) + 1);
    pieces++;
  });
  const chapters = r.chapters || [];
  const groups = r.parts && r.parts.length ? r.parts.map((t, p) => [t, chapters.map((c, i) => [c, i]).filter(([c]) => c.part === p)]) : [['', chapters.map((c, i) => [c, i])]];
  const option = ([c, i]) => `<option value="${c.first}" ${i === ci ? 'selected' : ''}>${esc(c.title)}</option>`;
  const jump = chapters.length > 1
    ? `<label class="jump">Ir a un capítulo<select id="step-jump">${groups.map(([t, list], p) => (t ? `<optgroup label="${p + 1} · ${esc(t)}">${list.map(option).join('')}</optgroup>` : list.map(option).join(''))).join('')}</select></label>`
    : '';
  return `<section class="stepper">
      <span class="eyebrow">${part ? `Parte ${ch.part + 1} de ${r.parts.length} · ${esc(part)}` : `Capítulo ${ci + 1} de ${chapters.length || n}`}</span>
      <div class="count"><b>${k + 1}</b><span>de ${n} pasos</span></div>
      <h2>${esc(ch.title)}${ch.count > 1 ? ` <small>· ${k - ch.first + 1} de ${ch.count}</small>` : ''}</h2>
      ${table ? `<p class="tag">Sobre la mesa: estas piezas no encastran en lo anterior, van apoyadas en su lugar.</p>` : ''}
      ${ch.note ? `<p class="how">${esc(ch.note)}</p>` : ''}
      <input type="range" id="step-range" min="0" max="${n - 1}" value="${k}" aria-label="Paso de armado">
      <div class="row-actions">
        <button type="button" class="btn ghost" id="step-prev" ${k === 0 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="btn" id="step-next" ${k === n - 1 ? 'disabled' : ''}>Siguiente</button>
        <button type="button" class="btn ghost" id="step-play">${state.playing ? 'Pausar' : 'Reproducir'}</button>
      </div>
      ${jump}
      <label class="check"><input type="checkbox" id="step-follow" ${state.follow ? 'checked' : ''}> La cámara acompaña cada paso</label>
    </section>
    <div class="step-now">
      ${minimap(k)}
      <div>
        <h3 class="section-title">Piezas de este paso · ${pieces}</h3>
        <p class="note">En el modelo, una flecha roja señala cada pieza nueva, que se ve en su color; lo ya armado queda apagado. En el plano, dónde van (el frente del modelo está abajo).</p>
      </div>
    </div>
    <div class="lots">${[...lots].map(([l, q]) => lotCard(l, { qty: q })).join('')}</div>
    <p class="foot">Los pasos siguen el orden en que conviene construir: cada pieza entra cuando ya tiene dónde encastrar. El paso donde quedaste se recuerda en este navegador. El archivo model.ldr del proyecto abre estos mismos pasos en BrickLink Studio o LeoCAD.</p>`;
}

function renderTab() {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  // En el teléfono, mientras se arma, el cuaderno queda pegado al visor.
  document.querySelector('.work').classList.toggle('building', state.tab === 'steps');
  const body = $('tab-body');
  body.setAttribute('aria-labelledby', `tab-${state.tab}`);
  const keep = document.activeElement && document.activeElement.id;
  const caret = keep === 'set-search' ? document.activeElement.selectionStart : null;
  body.innerHTML = state.tab === 'sets' ? renderSets() : state.tab === 'lots' ? renderLots() : renderSteps();
  if (keep && $(keep)) {
    $(keep).focus();
    if (caret !== null) $(keep).setSelectionRange(caret, caret);
  }
}

function refresh() {
  renderTab();
  applyStates();
}

// --------------------------------------------------------------- eventos
function togglePick(n) {
  const i = state.selected.indexOf(n);
  if (i >= 0) state.selected.splice(i, 1);
  else state.selected.push(n);
  state.showMissing = true;
  refresh();
}
function setStep(s) {
  state.step = Math.max(0, Math.min(state.report.steps.length - 1, s));
  state.refocus = true;
  memory.save(state.step);
  refresh();
}
// Abre o cierra las instrucciones desde el botón del visor.
function toggleBuild() {
  stopPlay();
  const open = state.tab !== 'steps';
  state.tab = open ? 'steps' : 'sets';
  state.refocus = open ? 'force' : false;
  refresh();
  if (!open) frame();
}
function stopPlay() {
  if (state.playing) clearInterval(state.playing);
  state.playing = null;
}

function wire() {
  $('models').addEventListener('click', (e) => {
    const b = e.target.closest('[data-model]');
    if (b && b.dataset.model !== state.id) location.hash = b.dataset.model;
  });
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    stopPlay();
    const was = state.tab;
    state.tab = b.dataset.tab;
    state.refocus = state.tab === 'steps' ? 'force' : false;
    refresh();
    if (was === 'steps' && state.tab !== 'steps') frame();
  });
  $('stage-prev').addEventListener('click', () => {
    stopPlay();
    setStep(state.step - 1);
  });
  $('stage-next').addEventListener('click', () => {
    stopPlay();
    setStep(state.step + 1);
  });
  window.addEventListener('keydown', (e) => {
    if (state.tab !== 'steps' || e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight') setStep(state.step + 1);
    else if (e.key === 'ArrowLeft') setStep(state.step - 1);
  });
  const body = $('tab-body');
  body.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) return togglePick(pick.dataset.pick);
    const lot = e.target.closest('button[data-lot]');
    if (lot) {
      const l = Number(lot.dataset.lot);
      state.focusLot = state.focusLot === l ? null : l;
      return refresh();
    }
    const id = e.target.id;
    if (id === 'clear-sel') {
      state.selected = [];
      state.onlyMissing = false;
      refresh();
    } else if (id === 'clear-focus') {
      state.focusLot = null;
      refresh();
    } else if (id === 'more-sets') {
      state.shown += 25;
      renderTab();
    } else if (id === 'step-prev') {
      stopPlay();
      setStep(state.step - 1);
    } else if (id === 'step-next') {
      stopPlay();
      setStep(state.step + 1);
    } else if (id === 'step-play') {
      if (state.playing) stopPlay();
      else {
        if (state.step >= state.report.steps.length - 1) state.step = 0;
        state.playing = setInterval(() => {
          if (state.step >= state.report.steps.length - 1) stopPlay();
          else state.step++;
          state.refocus = true;
          refresh();
        }, 1800);
      }
      refresh();
    }
  });
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'set-search') {
      state.query = t.value;
      state.shown = 25;
      renderTab();
    } else if (t.id === 'step-range') {
      stopPlay();
      setStep(Number(t.value));
    }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'set-sort') state.sort = t.value;
    else if (t.id === 'set-size') state.maxSize = Number(t.value);
    else if (t.id === 'set-year') state.minYear = Number(t.value);
    else if (t.id === 'set-spares') state.spares = t.checked;
    else if (t.id === 'show-missing') state.showMissing = t.checked;
    else if (t.id === 'only-missing') state.onlyMissing = t.checked;
    else if (t.id === 'step-jump') return setStep(Number(t.value));
    else if (t.id === 'step-follow') {
      state.follow = t.checked;
      state.refocus = t.checked ? 'force' : false;
      if (!t.checked) frame();
      return applyStates();
    } else return;
    state.shown = 25;
    refresh();
  });
  $('tool-spin').addEventListener('click', (e) => {
    stage.autoRotate = !stage.autoRotate;
    e.currentTarget.setAttribute('aria-pressed', String(stage.autoRotate));
  });
  $('tool-real').addEventListener('click', (e) => {
    stage.setReal(!stage.real);
    e.currentTarget.setAttribute('aria-pressed', String(stage.real));
    // En la vista real no hay siluetas de vidrio: su botón no hace nada.
    $('tool-vol').disabled = stage.real;
  });
  $('tool-fit').addEventListener('click', () => {
    if (state.tab !== 'steps') return frame();
    stage.focusParts(stepParts(state.step), { context: stepContext(state.step), padTop: coveredTop() });
  });
  $('tool-build').addEventListener('click', toggleBuild);
  $('tool-figs').addEventListener('click', (e) => {
    state.showFigs = !state.showFigs;
    e.currentTarget.setAttribute('aria-pressed', String(state.showFigs));
    applyStates();
  });
  $('tool-vol').addEventListener('click', (e) => {
    state.showVolumes = !state.showVolumes;
    e.currentTarget.setAttribute('aria-pressed', String(state.showVolumes));
    applyStates();
  });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== state.id) loadModel(id);
  });
}

// ---------------------------------------------------------------- carga
async function loadModel(id) {
  stopPlay();
  const msg = $('stage-msg');
  msg.hidden = false;
  msg.textContent = 'Cargando piezas…';
  api.status = 'loading';
  state.thumbRun++;
  try {
    const modelText = fetch(`models/${id}/model.mpd`).then((r) => {
      if (!r.ok) throw new Error(`No encuentro el modelo "${id}"`);
      return r.text();
    });
    modelText.catch(() => {});
    const report = await fetch(`models/${id}/report.json`).then((r) => {
      if (!r.ok) throw new Error(`No encuentro el modelo "${id}"`);
      return r.json();
    });
    // El cuaderno (sets, piezas, pasos) se muestra enseguida; el 3D llega después.
    Object.assign(state, { id, report, selected: [], step: 0, focusLot: null, onlyMissing: false, shown: 25, query: '', thumbs: new Map(), refocus: state.tab === 'steps' ? 'force' : false });
    state.step = memory.load(); // retoma donde quedó el armado
    state.setByNum = new Map((report.sets ? report.sets.list : []).map((s) => [s.num, s]));
    renderModels();
    renderBrief();
    renderTab();
    await stage.load(await modelText);
    if (state.id !== id) return;
    if (stage.parts.length !== report.placements.length) throw new Error('El modelo 3D y la lista de piezas no coinciden');
    const volumes = report.figs ? (report.figs.volumes || []).length : 0;
    $('tool-figs').hidden = !report.figs || report.figs.count === 0;
    $('tool-vol').hidden = !volumes;
    if (report.figs) {
      const figText = await fetch(`models/${id}/figs.mpd`).then((r) => (r.ok ? r.text() : null)).catch(() => null);
      if (state.id !== id) return;
      if (figText) await stage.loadFigs(figText, volumes);
    }
    frame();
    msg.hidden = true;
    applyStates();
    startThumbs();
    api.status = 'ready';
  } catch (e) {
    console.error(e);
    msg.textContent = `No se pudo cargar: ${e.message}`;
    api.status = `error: ${e.message}`;
  }
}

// Vista de siempre, dejando libre la franja que tapan los botones del visor.
function frame() {
  const tools = document.querySelector('.stage-tools');
  stage.view(-34, 22, 1, tools && tools.offsetParent ? tools.offsetHeight + 20 : 0);
}

async function boot() {
  stage = new Stage($('stage-canvas'));
  api.stage = stage;
  api.state = state;
  // Para sacar capturas automáticas (scripts/render.mjs).
  api.clean = () => {
    document.documentElement.classList.add('shot');
    stage.resize();
  };
  api.shot = ({ azimuth, elevation, zoom = 1, step = null, edges = true, figs = true, volumes = true, focus = null, real = false }) => {
    stage.setEdges(edges);
    stage.setReal(real);
    stage.setStates(state.report.placements.map(([, s]) => (step === null || s <= step ? 'normal' : 'hidden')));
    stage.setFigs(figs && step === null);
    stage.setVolumes(volumes && step === null);
    stage.resize();
    if (focus) stage.viewAt(azimuth, elevation, focus.slice(0, 3), focus[3] || 40);
    else stage.view(azimuth, elevation, zoom);
    stage.renderNow();
  };
  // Para el cuadernillo de instrucciones (scripts/instructions.mjs).
  api.stepShot = (k, { follow = true } = {}) => {
    stage.setEdges(true);
    stage.setReal(false);
    stage.setStates(state.report.placements.map(([, s]) => (s < k ? 'past' : s === k ? 'new' : 'hidden')), { highlight: true });
    stage.setFigs(false);
    stage.setVolumes(false);
    stage.resize();
    const view = follow ? stage.focusParts(stepParts(k), { sticky: true, context: stepContext(k) }) : null;
    stage.renderNow();
    return view;
  };
  api.minimap = (k) => minimap(k);
  api.allThumbs = () => {
    const shooter = new Thumbnailer(160);
    const first = new Map();
    state.report.placements.forEach(([lot], i) => {
      if (!first.has(lot)) first.set(lot, i);
    });
    const out = state.report.bom.map((_, lot) => (first.has(lot) ? shooter.shot(stage.parts[first.get(lot)]) : ''));
    shooter.dispose();
    return out;
  };
  wire();
  try {
    state.models = await fetch('models/index.json').then((r) => r.json());
  } catch {
    state.models = [];
  }
  const wanted = location.hash.slice(1);
  const id = wanted || (state.models[0] && state.models[0].id);
  if (!id) {
    $('stage-msg').textContent = 'Todavía no hay modelos generados.';
    api.status = 'error: sin modelos';
    return;
  }
  await loadModel(id);
}

boot();

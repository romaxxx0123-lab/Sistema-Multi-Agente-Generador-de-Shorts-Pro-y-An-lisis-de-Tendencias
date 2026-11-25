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
  spares: false,
  sort: 'exact',
  maxSize: 0,
  minYear: 0,
  query: '',
  shown: 25,
  step: 0,
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
      states[i] = s < state.step ? 'normal' : s === state.step ? 'new' : 'hidden';
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
      ? `En rojo translúcido: <b>${num(missing)} pieza${missing === 1 ? '' : 's'}</b> que no trae ${esc(state.selected.join(' + '))}`
      : `Con <b>${esc(state.selected.join(' + '))}</b> armás el modelo completo`;
  }
  stage.setStates(states);
  $('stage-flag').hidden = !flag;
  $('stage-flag').classList.toggle('miss', miss);
  $('stage-flag').innerHTML = flag;
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
    ? `<span class="fact ok">Armable: sin choques y todo encastrado</span>`
    : `<span class="fact err">${v.errors.length} problema${v.errors.length === 1 ? '' : 's'} de armado</span>`;
  $('brief').innerHTML = `
    ${r.prompt ? `<span class="eyebrow">Pedido: «${esc(r.prompt)}»</span>` : ''}
    <h1>${esc(r.title)}</h1>
    <p>${esc(r.description)}</p>
    <div class="facts">
      <span class="fact"><b>${num(r.counts.pieces)}</b> piezas</span>
      <span class="fact"><b>${num(r.counts.lots)}</b> lotes distintos</span>
      <span class="fact"><b>${num(r.counts.steps)}</b> pasos</span>
      ${check}
    </div>`;
}

function renderSets() {
  const r = state.report;
  if (!r.sets) return `<p class="note">Este modelo todavía no tiene búsqueda de sets.</p>`;
  const total = r.counts.pieces;
  const list = filteredSets();
  const best = list[0];
  const filtered = state.maxSize || state.minYear || state.query.trim();
  let html = '';

  if (best) {
    const e = setExact(best);
    html += `<section class="lead">
      <span class="eyebrow">${filtered ? 'Mejor set con estos filtros' : 'El set que más piezas trae'}</span>
      <h2>${esc(best.name)}</h2>
      <span class="meta"><span class="num" style="font-family:var(--font-mono)">${esc(best.num)}</span> · ${best.year} · ${esc(best.theme)} · ${num(best.parts)} piezas</span>
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
  const lots = new Map();
  r.placements.forEach(([lot, s]) => {
    if (s === state.step) lots.set(lot, (lots.get(lot) || 0) + 1);
  });
  return `<section class="stepper">
      <div class="count"><b>${state.step + 1}</b><span>de ${n}</span></div>
      <h2>${esc(r.steps[state.step])}</h2>
      <input type="range" id="step-range" min="0" max="${n - 1}" value="${state.step}" aria-label="Paso de armado">
      <div class="row-actions">
        <button type="button" class="btn ghost" id="step-prev" ${state.step === 0 ? 'disabled' : ''}>Anterior</button>
        <button type="button" class="btn" id="step-next" ${state.step === n - 1 ? 'disabled' : ''}>Siguiente</button>
        <button type="button" class="btn ghost" id="step-play">${state.playing ? 'Pausar' : 'Reproducir'}</button>
      </div>
    </section>
    <h3 class="section-title">Piezas de este paso</h3>
    <div class="lots">${[...lots].map(([l, q]) => lotCard(l, { qty: q })).join('')}</div>
    <p class="foot">Las piezas nuevas de cada paso aparecen iluminadas en el modelo. El archivo model.ldr del proyecto abre estos mismos pasos en BrickLink Studio o LeoCAD.</p>`;
}

function renderTab() {
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
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
  refresh();
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
    state.tab = b.dataset.tab;
    refresh();
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
          refresh();
        }, 1400);
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
    else return;
    state.shown = 25;
    refresh();
  });
  $('tool-spin').addEventListener('click', (e) => {
    stage.autoRotate = !stage.autoRotate;
    e.currentTarget.setAttribute('aria-pressed', String(stage.autoRotate));
  });
  $('tool-edges').addEventListener('click', (e) => {
    stage.setEdges(!stage.showEdges);
    e.currentTarget.setAttribute('aria-pressed', String(stage.showEdges));
  });
  $('tool-fit').addEventListener('click', () => stage.view(-34, 22, 1.3));
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
    Object.assign(state, { id, report, selected: [], step: 0, focusLot: null, onlyMissing: false, shown: 25, query: '', thumbs: new Map() });
    state.setByNum = new Map((report.sets ? report.sets.list : []).map((s) => [s.num, s]));
    renderModels();
    renderBrief();
    renderTab();
    await stage.load(await modelText);
    if (state.id !== id) return;
    if (stage.parts.length !== report.placements.length) throw new Error('El modelo 3D y la lista de piezas no coinciden');
    stage.view(-34, 22, 1.3);
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

async function boot() {
  stage = new Stage($('stage-canvas'));
  api.stage = stage;
  api.state = state;
  // Para sacar capturas automáticas (scripts/render.mjs).
  api.clean = () => {
    document.documentElement.classList.add('shot');
    stage.resize();
  };
  api.shot = ({ azimuth, elevation, zoom = 1, step = null, edges = true }) => {
    stage.setEdges(edges);
    stage.setStates(state.report.placements.map(([, s]) => (step === null || s <= step ? 'normal' : 'hidden')));
    stage.resize();
    stage.view(azimuth, elevation, zoom);
    stage.renderNow();
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

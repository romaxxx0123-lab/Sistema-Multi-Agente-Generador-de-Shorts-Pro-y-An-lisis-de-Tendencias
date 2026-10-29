/**
 * Panel de ESTACIÓN según el tipo de módulo:
 *  - almacén: tu inventario ↔ estanterías;
 *  - banco de trabajo / taller / cocina: recetas, ficha tengo/necesito y tiempo, Fabricar ×1/×5,
 *    cola con progreso y cancelar, bandeja de salida, combustible del fogón, despensa y energía;
 *  - huerto: 4 parcelas (cultivo, crecimiento, agua, luz), plantar con selector de semilla,
 *    cosechar y retirar plaga o plantas secas;
 *  - depósito, colector, potabilizadora, generador, baterías, panel solar, motor;
 *  - y en todos: condición, avería/daño/fuga/fuego, obra en curso y Reparar con requisitos.
 */
import { CROPS } from '../../data/crops';
import { moduleDef, type ModuleDef } from '../../data/modules';
import { WATER_PER_DRINK } from '../../sim/constants';
import { REPAIR_THRESHOLD } from '../../sim/construction';
import { findModule, payInventories } from '../../sim/helpers';
import { countIn, countItem } from '../../sim/inventory';
import type { InvRef } from '../../sim/Simulation';
import { MAX_QUEUE, plotLight, stationKindOf } from '../../sim/stations';
import { daylight } from '../../sim/time';
import type { ModuleInstance } from '../../sim/types';
import { conditionFactor, fuelMinutes, hasGrowLamps, hasPowerSwitch, moduleHasSky } from '../../sim/utilities';
import type { UiEnv } from '../env';
import { duration, itemName, num, pct } from '../fmt';
import { MODULE_GLYPH } from '../icons';
import { cx, h, type VInput, type VNode } from '../vdom';
import { bar, btn, chip, empty, gl, icon, kbd, meter, section, slot } from '../widgets';
import { recipeDetail, recipeRow } from './crafting';
import type { PanelView } from './index';
import { quickMove, transferHelp, transferView } from './transfer';

export function renderStation(env: UiEnv, moduleId: number): PanelView | null {
  const sim = env.ctx.sim;
  const m = findModule(sim, moduleId);
  if (!m) return null;
  const def = moduleDef(m.type);
  const head = statusChips(m);
  const glyphName = MODULE_GLYPH[m.type] ?? 'box';
  if (m.status === 'construction') {
    return { title: def.name, subtitle: 'En obras', glyph: glyphName, head, body: constructionBody(env, m, def), cls: 'pn-narrow' };
  }
  const kind = stationKindOf(m);
  let body: VInput;
  let cls = 'pn-wide';
  let tabs: VInput = null;
  if (kind) {
    const res = craftStation(env, m, def);
    body = res.body;
    tabs = res.tabs;
  } else {
    switch (m.type) {
      case 'almacen':
        body = [transferView(env, { ref: { kind: 'module', id: m.id, slot: 'inventory' }, title: h('span', null, gl('box'), 'Estanterías'), cols: 5 }), transferHelp()];
        cls = 'pn-wide pn-auto';
        break;
      case 'huerto':
        body = gardenBody(env, m);
        break;
      case 'deposito':
        body = tankBody(env, m);
        cls = 'pn-mid';
        break;
      case 'colector':
        body = collectorBody(env, m);
        cls = 'pn-mid';
        break;
      case 'potabilizadora':
        body = purifierBody(env, m);
        cls = 'pn-mid';
        break;
      case 'generador':
        body = generatorBody(env, m);
        cls = 'pn-mid';
        break;
      case 'bateria':
        body = batteryBody(env, m);
        cls = 'pn-mid';
        break;
      case 'panel_solar':
        body = solarBody(env, m);
        cls = 'pn-mid';
        break;
      case 'motor':
        body = motorBody(env, m);
        cls = 'pn-mid';
        break;
      default:
        body = genericBody(env, m, def);
        cls = 'pn-mid';
    }
  }
  return { title: def.name, subtitle: def.desc, glyph: glyphName, head, tabs, body, foot: conditionFoot(env, m, def), cls };
}

/* ================================================================== */
/* Estado, avería y reparación (común)                                 */
/* ================================================================== */

function statusChips(m: ModuleInstance): VNode {
  const chips: VNode[] = [];
  if (m.status === 'construction') chips.push(chip(`En obras · ${Math.floor(m.buildProgress * 100)} %`, 'info', 'hammer'));
  if (m.fire > 0) chips.push(chip(`¡Ardiendo! ${Math.round(m.fire)} %`, 'danger', 'fire'));
  if (m.status === 'broken') chips.push(chip('Averiado', 'danger', 'wrench'));
  if (m.leak) chips.push(chip('Fuga', 'warn', 'leak'));
  return h('div', { class: 'pn-chips' }, chips);
}

function conditionColor(c: number): string {
  return c < 25 ? 'var(--danger)' : c < 50 ? 'var(--warn)' : 'var(--good)';
}

/** Pie del panel: condición, motivo de la avería y reparación con requisitos. */
function conditionFoot(env: UiEnv, m: ModuleInstance, def: ModuleDef): VNode {
  const sim = env.ctx.sim;
  const info = sim.repairInfo(m.id);
  const parts: VInput[] = [];
  parts.push(
    h(
      'div',
      { class: 'cond-meter' },
      h('span', { class: 'cm-label' }, gl('wrench'), 'Condición'),
      bar(m.condition / 100, conditionColor(m.condition)),
      h('b', { class: 'cm-val' }, `${Math.round(m.condition)} %`),
    ),
  );
  let msg: VInput = null;
  if (m.fire > 0) msg = h('span', { class: 'danger' }, gl('fire'), '¡Fuego! Llena el cubo en la borda y haz clic sobre las llamas para apagarlo.');
  else if (m.status === 'broken') msg = h('span', { class: 'danger' }, gl('alert'), `Averiado: ${m.brokenReason ?? 'necesita reparación'}`);
  else if (m.leak) msg = h('span', { class: 'warn' }, gl('leak'), 'Pierde agua: hay que sellar la fuga.');
  else if (m.condition < 50) msg = h('span', { class: 'warn' }, gl('alert'), def.machine ? 'Dañado: rinde un 30 % menos.' : 'Dañado: conviene repararlo antes de la próxima tormenta.');
  else if (m.condition < REPAIR_THRESHOLD) msg = h('span', { class: 'faint' }, 'Algo de desgaste por el uso.');
  if (msg) parts.push(h('div', { class: 'cond-msg' }, msg));
  if (info.needed && info.tool && info.part) {
    const hasTool = countItem(sim.state.player.inventory, info.tool) > 0;
    const parts2 = countItem(sim.state.player.inventory, info.part);
    // La pieza se paga con el inventario y, si no, con los almacenes.
    const partTotal = countIn(payInventories(sim), info.part);
    parts.push(
      h(
        'div',
        { class: 'repair' },
        h('span', { class: cx('req', hasTool ? 'ok' : 'short'), title: hasTool ? 'Lo llevas encima' : 'Tiene que estar en tu inventario' }, icon(info.tool, 'ico ico-sm'), itemName(info.tool), gl(hasTool ? 'check' : 'close')),
        h('span', { class: 'plus' }, '+'),
        h(
          'span',
          { class: cx('req', partTotal > 0 ? 'ok' : 'short'), title: `Se toma de tu inventario o de los almacenes (llevas ${parts2}, hay ${partTotal} en total)` },
          icon(info.part, 'ico ico-sm'),
          itemName(info.part),
          h('small', null, ` (${partTotal})`),
        ),
        btn('Reparar', () => env.act(sim.repair(m.id), 'good'), { primary: info.ok, disabled: !info.ok, glyph: 'wrench', title: info.reason ?? 'Repara el módulo (también con R mirándolo)' }),
        !info.ok && info.reason ? h('span', { class: 'repair-why warn' }, info.reason) : null,
      ),
    );
  }
  return h('div', { class: 'cond-foot' }, parts);
}

function powerSwitch(env: UiEnv, m: ModuleInstance, label?: string): VNode | null {
  const sim = env.ctx.sim;
  if (!hasPowerSwitch(sim, m)) return null;
  return h(
    'div',
    { class: 'switch-row' },
    h('button', { type: 'button', class: cx('switch', m.on && 'on'), role: 'switch', 'aria-checked': m.on ? 'true' : 'false', onclick: () => env.act(sim.togglePower(m.id), 'info') }, h('i')),
    h('span', null, label ?? (m.on ? 'Encendido' : 'Apagado')),
    m.on ? (m.powered ? chip('Con energía', 'good', 'power') : chip('Sin energía', 'warn', 'plug')) : null,
  );
}

/* ================================================================== */
/* Obras                                                               */
/* ================================================================== */

function constructionBody(env: UiEnv, m: ModuleInstance, def: ModuleDef): VNode {
  const cs = env.ctx.sim.constructionStatus(m.id);
  const hammer = countItem(env.ctx.sim.state.player.inventory, 'martillo') > 0;
  return h(
    'div',
    { class: 'build-site' },
    h('p', { class: 'muted' }, def.desc),
    meter('Progreso de la obra', `${Math.floor((cs?.progress ?? m.buildProgress) * 100)} %`, cs?.progress ?? m.buildProgress, 'var(--accent)'),
    h('div', { class: 'kv' }, kvRow('Tiempo restante', cs ? `≈ ${duration(cs.etaMin)}` : '—'), kvRow('Habitantes ayudando', String(cs?.builders ?? 0))),
    h('div', { class: 'note' }, gl('hammer'), hammer ? ['Mantén ', kbd('E'), ' con el martillo en la mano mirando la obra para acabar antes.'] : 'Con un martillo puedes ayudar a construir más rápido.'),
  );
}

function kvRow(k: string, v: VInput): VNode {
  return h('div', { class: 'kv-row' }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v' }, v));
}

/* ================================================================== */
/* Estaciones de fabricación                                           */
/* ================================================================== */

function craftStation(env: UiEnv, m: ModuleInstance, def: ModuleDef): { body: VNode; tabs: VInput } {
  const sim = env.ctx.sim;
  const isKitchen = m.type === 'cocina';
  const tab = env.ps.tab ?? 'fabricar';
  const tabs = isKitchen
    ? h(
        'nav',
        { class: 'pn-tabs' },
        [
          { id: 'fabricar', label: 'Cocinar', glyph: 'pot' },
          { id: 'despensa', label: 'Despensa y fogón', glyph: 'box' },
        ].map((t) =>
          h(
            'button',
            {
              key: t.id,
              type: 'button',
              class: cx('tab', tab === t.id && 'active'),
              onclick: () => {
                env.ps.tab = t.id;
                env.tip.hide();
                env.refresh();
              },
            },
            gl(t.glyph),
            t.label,
          ),
        ),
      )
    : null;
  if (isKitchen && tab === 'despensa') {
    return {
      tabs,
      body: h(
        'div',
        null,
        transferView(env, {
          ref: { kind: 'module', id: m.id, slot: 'inventory' },
          title: h('span', null, gl('box'), 'Despensa'),
          cols: 4,
          extra: fuelBox(env, m, 'Fogón'),
          note: 'Los habitantes comen de aquí y del almacén.',
        }),
        transferHelp(),
      ),
    };
  }

  const recipes = sim.stationRecipes(m.id);
  const ss = sim.stationStatus(m.id);
  let selId = env.ps.recipe ?? null;
  if (!selId || !recipes.some((r) => r.recipe.id === selId)) selId = recipes.find((r) => r.canCraft)?.recipe.id ?? recipes[0]?.recipe.id ?? null;
  const sel = recipes.find((r) => r.recipe.id === selId) ?? null;
  const queueFull = m.queue.length >= MAX_QUEUE;

  const list = h(
    'div',
    { class: 'rc-list scroll' },
    recipes.map((a) => {
      const state = a.locked ? 'locked' : a.canCraft ? 'ok' : Object.keys(a.missing).length ? 'missing' : 'blocked';
      return recipeRow(a.recipe, state, a.recipe.id === selId, () => {
        env.ps.recipe = a.recipe.id;
        env.refresh();
      });
    }),
  );

  let detail: VNode = empty('Elige una receta.');
  if (sel) {
    const r = sel.recipe;
    const verb = isKitchen ? 'Cocinar' : 'Fabricar';
    detail = recipeDetail(
      env,
      r,
      sel.reason,
      [
        btn(`${verb} ×1`, () => env.act(sim.queueCraft(m.id, r.id, 1), 'info'), { primary: true, disabled: !sel.canCraft, glyph: isKitchen ? 'pot' : 'hammer' }),
        btn('×5', () => env.act(sim.queueCraft(m.id, r.id, 5), 'info'), { disabled: !sel.canCraft || queueFull, title: 'Encola hasta 5 (los que alcancen)' }),
      ],
      queueFull ? h('span', { class: 'warn' }, `La cola está llena (máx. ${MAX_QUEUE}).`) : 'Se paga al encargarlo con tu inventario y los almacenes. Cancelar devuelve los ingredientes.',
    );
  }

  const tone = !ss ? 'dim' : ss.working ? 'good' : /Sin|Averiad|Ardiendo/.test(ss.status) ? 'warn' : 'dim';
  const queue = section(
    h('span', { class: 'sec-row' }, h('span', null, gl('clock'), 'En marcha'), ss ? chip(ss.status, tone) : null),
    ss && ss.jobs.length
      ? h(
          'ol',
          { class: 'queue' },
          ss.jobs.map((j) =>
            h(
              'li',
              { key: `${j.index}-${j.recipe.id}`, class: cx(j.index === 0 && 'first') },
              icon(Object.keys(j.recipe.outputs)[0] ?? '', 'ico ico-md'),
              h(
                'div',
                { class: 'q-main' },
                h('div', { class: 'q-name' }, j.recipe.name, j.byNpc ? h('small', { class: 'faint' }, ' · encargo de un habitante') : null),
                bar(j.progress, 'var(--accent)', 'thin'),
              ),
              h('span', { class: 'q-eta' }, j.etaMin === null ? '—' : duration(j.etaMin)),
              j.byNpc ? null : h('button', { type: 'button', class: 'q-x', title: 'Cancelar y recuperar los ingredientes', onclick: () => env.act(sim.cancelCraft(m.id, j.index), 'info') }, gl('close')),
            ),
          ),
        )
      : empty('Nada en cola.', 'clock'),
  );

  const side: VInput[] = [queue];
  if (m.type === 'taller') side.push(section(h('span', null, gl('power'), 'Electricidad'), powerSwitch(env, m), h('div', { class: 'faint small' }, `Consume ${num(def.powerUse ?? 0, 1)} kW mientras trabaja. Suministro de la red: ${pct(sim.state.utilities.power.satisfaction)}.`)));
  if (isKitchen) {
    side.push(fuelBox(env, m, 'Fogón'));
    side.push(
      section(
        h('span', { class: 'sec-row' }, h('span', null, gl('box'), 'Despensa'), btn('Abrir', () => {
          env.ps.tab = 'despensa';
          env.refresh();
        }, { small: true })),
        trayRow(env, m, 6),
      ),
    );
  } else {
    const ref: InvRef = { kind: 'module', id: m.id, slot: 'inventory' };
    const inv = m.inventory;
    const used = inv ? inv.slots.filter((s) => !!s).length : 0;
    side.push(
      section(
        h('span', { class: 'sec-row' }, h('span', null, gl('box'), 'Bandeja de salida'), btn('Tomar todo', () => env.act(sim.takeAll(ref), 'good'), { small: true, disabled: used === 0 })),
        trayRow(env, m, 6),
        h('div', { class: 'faint small' }, 'Lo fabricado espera aquí. Clic en una ranura para cogerlo.'),
      ),
    );
  }

  return { tabs, body: h('div', { class: 'station-layout' }, h('div', { class: 'st-list' }, list), h('div', { class: 'st-detail scroll' }, detail), h('div', { class: 'st-side scroll' }, side)) };
}

/** Fila compacta de la bandeja/despensa: clic coge la pila. */
function trayRow(env: UiEnv, m: ModuleInstance, max: number): VNode {
  const ref: InvRef = { kind: 'module', id: m.id, slot: 'inventory' };
  const inv = m.inventory;
  if (!inv) return empty('Sin bandeja');
  const slots = inv.slots.slice(0, max);
  const more = inv.slots.slice(max).filter((s) => !!s).length;
  return h(
    'div',
    { class: 'tray' },
    h(
      'div',
      { class: 'slot-grid', style: `--cols:${max}` },
      slots.map((s, i) => slot(env, { ref, index: i, stack: s, hints: ['Clic: coger · Mayús+clic: coger todo lo de ese tipo'], onClick: (e) => quickMove(env, ref, i, { kind: 'player' }, e.shiftKey) })),
    ),
    more ? h('div', { class: 'faint small' }, `y ${more} pila${more === 1 ? '' : 's'} más`) : null,
  );
}

/** Ranura(s) de combustible con su autonomía y botones para echar leña o un bidón. */
function fuelBox(env: UiEnv, m: ModuleInstance, title: string): VNode {
  const sim = env.ctx.sim;
  const ref: InvRef = { kind: 'module', id: m.id, slot: 'fuel' };
  const inv = m.fuelInv;
  const mins = fuelMinutes(m);
  const pinv = sim.state.player.inventory;
  const fuels = ['madera', 'combustible'].filter((id) => countItem(pinv, id) > 0);
  const addFuel = (id: string): void => {
    const i = pinv.slots.findIndex((s) => s?.id === id);
    if (i >= 0) env.act(sim.moveItem({ kind: 'player' }, i, ref), 'info');
  };
  return section(
    h('span', { class: 'sec-row' }, h('span', null, gl('fire'), title), m.fuelBurn > 0.01 && m.powered ? chip('Encendido', 'good', 'fire') : null),
    h(
      'div',
      { class: 'fuel' },
      inv
        ? h(
            'div',
            { class: 'slot-grid', style: `--cols:${inv.slots.length}` },
            inv.slots.map((s, i) =>
              slot(env, {
                ref,
                index: i,
                stack: s,
                placeholder: 'fire',
                emptyTitle: 'Arrastra aquí madera o un bidón de combustible',
                hints: ['Clic: sacar el combustible'],
                onClick: () => quickMove(env, ref, i, { kind: 'player' }, false),
              }),
            ),
          )
        : null,
      h('div', { class: 'fuel-info' }, h('b', { class: mins > 0 ? '' : 'warn' }, mins > 0 ? `Para ${duration(mins)}` : 'Sin combustible'), h('div', { class: 'faint small' }, 'Madera: 40 min · Bidón: 6 h')),
    ),
    h(
      'div',
      { class: 'fuel-btns' },
      fuels.length
        ? fuels.map((id) => btn(`Echar ${id === 'madera' ? 'madera' : 'bidón'} (${countItem(pinv, id)})`, () => addFuel(id), { small: true, title: 'Mueve una pila de tu inventario a la ranura de combustible' }))
        : h('span', { class: 'faint small' }, 'No llevas madera ni bidones encima.'),
    ),
  );
}

/* ================================================================== */
/* Huerto                                                              */
/* ================================================================== */

const SEEDS = ['semilla_hortaliza', 'semilla_lino'];

function gardenBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const sky = moduleHasSky(sim, m);
  const lamps = hasGrowLamps(sim, m);
  const light = plotLight(sim, m);
  const u = sim.state.utilities;
  const pinv = sim.state.player.inventory;
  const seeds = SEEDS.filter((id) => countItem(pinv, id) > 0);
  const picking = env.ps.seedFor ?? null;

  const cards = m.plots.map((p, i) => {
    const crop = p.crop ? CROPS[p.crop] : undefined;
    const ready = !!crop && !p.dead && p.growth >= 1;
    const cropIcon = crop ? (ready ? crop.yield[0]?.id : crop.seed) : null;
    const actions: VInput[] = [];
    if (p.dead) actions.push(btn('Retirar plantas secas', () => env.act(sim.tendPlot(m.id, i), 'info'), { small: true, glyph: 'trash' }));
    else if (p.pest && !ready) actions.push(btn('Quitar la plaga', () => env.act(sim.tendPlot(m.id, i), 'good'), { small: true, glyph: 'bug', primary: true }));
    if (ready) actions.push(btn('Cosechar', () => env.act(sim.harvest(m.id, i), 'good'), { small: true, primary: true, glyph: 'sprout' }));
    if (!p.crop && !p.pest && !p.dead) {
      actions.push(
        btn(picking === i ? 'Cancelar' : 'Plantar', () => {
          env.ps.seedFor = picking === i ? null : i;
          env.refresh();
        }, { small: true, primary: picking !== i, glyph: 'sprout', disabled: !seeds.length, title: seeds.length ? 'Elige la semilla' : 'No llevas semillas: cógelas del almacén' }),
      );
    }
    const dryFrac = crop && p.dryHours > 0 ? Math.min(1, p.dryHours / crop.dryHoursToDie) : 0;
    return h(
      'div',
      { key: i, class: cx('plot', ready && 'ready', p.dead && 'dead', p.pest && 'pest', !p.crop && 'vacant') },
      h('div', { class: 'plot-head' }, h('span', { class: 'plot-n' }, `Bancal ${i + 1}`), p.pest ? chip('Plaga', 'danger', 'bug') : null, ready ? chip('¡Listo!', 'good', 'check') : null),
      h(
        'div',
        { class: 'plot-main' },
        cropIcon ? icon(cropIcon, 'ico plot-ico') : h('div', { class: 'plot-soil' }, gl('sprout')),
        h(
          'div',
          { class: 'plot-info' },
          h('b', null, crop ? crop.name : 'Vacío'),
          h('div', { class: 'faint small' }, sim.plotStatus(m.id, i)),
          crop && !p.dead ? meter('Crecimiento', `${Math.floor(p.growth * 100)} %`, p.growth, 'var(--good)') : null,
          crop && !p.dead && !ready ? meter([gl('drop'), 'Sin agua'], p.dryHours > 0.05 ? `${num(p.dryHours, 1)} / ${crop.dryHoursToDie} h` : 'Regado', dryFrac, dryFrac > 0.5 ? 'var(--danger)' : 'var(--thirst)') : null,
        ),
      ),
      picking === i
        ? h(
            'div',
            { class: 'seed-pick' },
            seeds.map((id) => btn([icon(id, 'ico ico-sm'), `${itemName(id)} (${countItem(pinv, id)})`], () => {
              env.ps.seedFor = null;
              env.act(sim.plant(m.id, i, id), 'good');
            }, { small: true, key: id })),
          )
        : null,
      actions.length ? h('div', { class: 'plot-actions' }, actions) : null,
    );
  });

  const lightText = sky ? `A cielo abierto: ${pct(light)} de luz (de noche crecen al 30 %)` : lamps ? (m.on && m.powered ? `Lámparas de cultivo: ${pct(light)}` : 'Lámparas apagadas o sin energía: no crecen') : 'Interior sin luz: necesita el plano de lámparas de cultivo';
  return h(
    'div',
    { class: 'garden' },
    h(
      'div',
      { class: 'garden-info' },
      h('span', { class: cx('gi', light > 0 ? 'good' : 'warn') }, gl('sun'), lightText),
      h('span', { class: cx('gi', u.waterL > 1 ? '' : 'warn') }, gl('drop'), `Agua de la red: ${Math.floor(u.waterL)}/${Math.round(u.water.capacityL)} L${sky && sim.state.weather.rain > 0.2 ? ' · la lluvia riega' : ''}`),
      lamps ? powerSwitch(env, m, 'Lámparas de cultivo') : null,
    ),
    h('div', { class: 'plots' }, cards),
    h('div', { class: 'faint small' }, 'Las semillas se toman de tu inventario. Los cultivos beben de los depósitos del barco mientras crecen.'),
  );
}

/* ================================================================== */
/* Agua                                                                */
/* ================================================================== */

function tankGauge(env: UiEnv): VNode {
  const u = env.ctx.sim.state.utilities;
  const frac = u.water.capacityL > 0 ? u.waterL / u.water.capacityL : 0;
  return h(
    'div',
    { class: 'gauge' },
    h('div', { class: 'gauge-tube' }, h('i', { style: { height: `${Math.round(Math.min(1, frac) * 1000) / 10}%` } }), h('span', null, `${Math.floor(u.waterL)} L`)),
    h('div', { class: 'gauge-cap faint small' }, `de ${Math.round(u.water.capacityL)} L`),
  );
}

function waterKv(env: UiEnv): VNode {
  const u = env.ctx.sim.state.utilities;
  const net = u.water.inPerHour - u.water.outPerHour;
  return h('div', { class: 'kv' }, kvRow('Entrada', `${num(u.water.inPerHour, 1)} L/h`), kvRow('Consumo y pérdidas', `${num(u.water.outPerHour, 1)} L/h`), kvRow('Balance', h('span', { class: net < -0.05 ? 'warn' : net > 0.05 ? 'good' : '' }, `${net >= 0 ? '+' : '−'}${num(Math.abs(net), 1)} L/h`)));
}

function tankBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const u = sim.state.utilities;
  const p = sim.state.player;
  const bottles = countItem(p.inventory, 'agua_potable');
  const empty0 = u.waterL < WATER_PER_DRINK;
  return h(
    'div',
    { class: 'utility' },
    tankGauge(env),
    h(
      'div',
      { class: 'util-main' },
      h('p', { class: 'muted' }, 'Todos los depósitos y colectores comparten la red de agua potable del barco.'),
      waterKv(env),
      m.leak ? h('div', { class: 'note warn' }, gl('leak'), 'Este depósito tiene una fuga: pierde 6 L cada hora hasta que la repares.') : null,
      h(
        'div',
        { class: 'util-actions' },
        btn('Beber', () => env.act(sim.drinkFromTank(), 'good'), { primary: true, glyph: 'thirst', disabled: empty0 || p.needs.thirst >= 99, title: p.needs.thirst >= 99 ? 'No tienes sed' : '1 L: sed +40' }),
        btn(`Llenar botella${bottles ? ` (tienes ${bottles})` : ''}`, () => env.act(sim.fillBottle(), 'good'), { glyph: 'drop', disabled: empty0, title: '1 L del depósito → 1 Botella de agua' }),
      ),
      empty0 ? h('div', { class: 'note warn' }, gl('alert'), 'Los depósitos están vacíos: recoge lluvia, destila agua de mar en la cocina o construye una potabilizadora.') : null,
    ),
  );
}

function collectorBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const def = moduleDef(m.type);
  const rain = sim.state.weather.rain;
  const sky = moduleHasSky(sim, m);
  const rate = sky && m.status === 'active' && m.fire <= 0 ? (def.waterGen ?? 0) * rain : 0;
  return h(
    'div',
    { class: 'utility' },
    tankGauge(env),
    h(
      'div',
      { class: 'util-main' },
      h('div', { class: 'big-stat' }, gl('rain'), h('b', null, `${num(rate, 1)} L/h`), h('span', { class: 'muted' }, rate > 0 ? 'recogiendo lluvia' : rain > 0 ? 'no le llega la lluvia' : 'esperando lluvia')),
      h('div', { class: 'kv' }, kvRow('Lluvia', pct(rain)), kvRow('A cielo abierto', sky ? 'Sí' : 'No (algo lo cubre)'), kvRow('Capacidad extra', `${def.waterCapacity ?? 0} L`)),
      waterKv(env),
    ),
  );
}

function purifierBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const def = moduleDef(m.type);
  const u = sim.state.utilities;
  const full = u.waterL >= u.water.capacityL - 0.05;
  const working = m.on && m.powered && m.status === 'active' && m.fire <= 0 && !full;
  const rate = working ? (def.waterGen ?? 0) * conditionFactor(m) * u.power.satisfaction : 0;
  return h(
    'div',
    { class: 'utility' },
    tankGauge(env),
    h(
      'div',
      { class: 'util-main' },
      powerSwitch(env, m),
      h('div', { class: 'big-stat' }, gl('filter'), h('b', null, `${num(rate, 1)} L/h`), h('span', { class: 'muted' }, working ? 'potabilizando agua de mar' : full ? 'depósitos llenos: en espera' : !m.on ? 'apagada' : 'parada')),
      h('div', { class: 'kv' }, kvRow('Consumo', `${num(def.powerUse ?? 0, 1)} kW al trabajar`), kvRow('Suministro eléctrico', pct(u.power.satisfaction))),
      waterKv(env),
    ),
  );
}

/* ================================================================== */
/* Energía                                                             */
/* ================================================================== */

function genKw(env: UiEnv, m: ModuleInstance): number {
  return env.ctx.sim.powerBreakdown().find((b) => b.moduleId === m.id)?.kw ?? 0;
}

function gridKv(env: UiEnv): VNode {
  const u = env.ctx.sim.state.utilities;
  return h(
    'div',
    { class: 'kv' },
    kvRow('Generación total', `${num(u.power.generation, 1)} kW`),
    kvRow('Demanda total', `${num(u.power.demand, 1)} kW`),
    u.power.capacityKWh > 0 ? kvRow('Baterías', `${num(u.batteryKWh, 1)} / ${Math.round(u.power.capacityKWh)} kWh`) : null,
  );
}

function generatorBody(env: UiEnv, m: ModuleInstance): VNode {
  const def = moduleDef(m.type);
  const kw = genKw(env, m);
  return h(
    'div',
    { class: 'utility two' },
    h('div', { class: 'util-main' }, powerSwitch(env, m), h('div', { class: 'big-stat' }, gl('power'), h('b', null, `${num(kw, 1)} kW`), h('span', { class: 'muted' }, m.powered ? 'en marcha' : m.on ? 'en reposo: arranca cuando falta energía o hay baterías por cargar' : 'apagado')), h('div', { class: 'faint small' }, `Máximo ${num((def.powerGen ?? 0) * conditionFactor(m), 1)} kW${m.condition < 50 ? ' (dañado: −30 %)' : ''}.`), gridKv(env)),
    h('div', { class: 'util-side' }, fuelBox(env, m, 'Combustible')),
  );
}

function batteryBody(env: UiEnv, m: ModuleInstance): VNode {
  const u = env.ctx.sim.state.utilities;
  const def = moduleDef(m.type);
  const frac = u.power.capacityKWh > 0 ? u.batteryKWh / u.power.capacityKWh : 0;
  const flow = u.power.generation - u.power.demand;
  return h(
    'div',
    { class: 'utility' },
    h('div', { class: 'gauge battery' }, h('div', { class: 'gauge-tube' }, h('i', { style: { height: `${Math.round(Math.min(1, frac) * 1000) / 10}%` } }), h('span', null, pct(frac))), h('div', { class: 'gauge-cap faint small' }, `${num(u.batteryKWh, 1)} kWh`)),
    h(
      'div',
      { class: 'util-main' },
      h('div', { class: 'big-stat' }, gl('battery'), h('b', null, flow > 0.05 && frac < 0.999 ? 'Cargando' : flow < -0.05 && u.batteryKWh > 0.01 ? 'Descargando' : 'En reposo'), h('span', { class: 'muted' }, `${num(Math.abs(flow), 1)} kW de ${flow >= 0 ? 'excedente' : 'déficit'}`)),
      h('div', { class: 'faint small' }, `Este banco guarda ${def.batteryKWh ?? 0} kWh y entrega hasta 10 kW. ${m.status === 'broken' ? 'Averiado: desconectado de la red.' : ''}`),
      gridKv(env),
    ),
  );
}

function solarBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const def = moduleDef(m.type);
  const kw = genKw(env, m);
  return h(
    'div',
    { class: 'utility two' },
    h(
      'div',
      { class: 'util-main' },
      powerSwitch(env, m),
      h('div', { class: 'big-stat' }, gl('solar'), h('b', null, `${num(kw, 2)} kW`), h('span', { class: 'muted' }, `de ${num(def.powerGen ?? 0, 1)} kW máximos`)),
      h('div', { class: 'kv' }, kvRow('Luz del día', pct(daylight(sim.state.time))), kvRow('Nubes', pct(sim.state.weather.cloudiness)), kvRow('A cielo abierto', moduleHasSky(sim, m) ? 'Sí' : 'No')),
    ),
    h('div', { class: 'util-side' }, section('Red eléctrica', gridKv(env))),
  );
}

function motorBody(env: UiEnv, m: ModuleInstance): VNode {
  const sim = env.ctx.sim;
  const def = moduleDef(m.type);
  const active = m.on && m.powered && m.status === 'active' && m.fire <= 0;
  return h(
    'div',
    { class: 'utility two' },
    h(
      'div',
      { class: 'util-main' },
      powerSwitch(env, m),
      h('div', { class: 'big-stat' }, gl('propeller'), h('b', null, active ? `+${def.speedBonus ?? 3} nudos` : 'Parado'), h('span', { class: 'muted' }, `Velocidad actual: ${num(sim.state.voyage.speed, 1)} nudos`)),
      h('div', { class: 'faint small' }, `Consume ${num(def.powerUse ?? 0, 1)} kW mientras navegamos (no al estar fondeados).`),
    ),
    h('div', { class: 'util-side' }, section('Red eléctrica', gridKv(env))),
  );
}

/* ================================================================== */
/* Otros módulos                                                       */
/* ================================================================== */

function genericBody(env: UiEnv, m: ModuleInstance, def: ModuleDef): VNode {
  const sim = env.ctx.sim;
  const beds = m.beds.map((b, i) => {
    const who = b === 'player' ? 'Tú' : b ? (sim.state.npcs.find((n) => n.id === b)?.name ?? '—') : 'Libre';
    return h('li', { key: i }, gl('bed'), h('span', { class: 'ml-name' }, `Cama ${i + 1}`), h('span', { class: cx('ml-val', !b && 'faint') }, who));
  });
  return h(
    'div',
    { class: 'generic' },
    beds.length ? section('Camas', h('ul', { class: 'mini-list' }, beds)) : null,
    def.comfort ? h('div', { class: 'faint small' }, `Confort: ${'★'.repeat(Math.min(5, def.comfort))}`) : null,
    powerSwitch(env, m),
  );
}

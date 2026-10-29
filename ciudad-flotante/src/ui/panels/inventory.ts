/**
 * Panel de INVENTARIO con pestañas:
 *  - Objetos: 24 ranuras (las 8 primeras = barra rápida), arrastrar y soltar, usar (clic derecho o
 *    doble clic), ficha del objeto, prenda equipada con "Quitar", estado del jugador.
 *  - Fabricar: recetas a mano (se fabrican aquí) y de referencia por estación (tengo/necesito).
 *  - Diario: situaciones en curso con objetivos, diario de a bordo, travesía, estadísticas, consejos.
 *  - Barco: energía, agua, tripulación y camas, despensa y módulos con problemas.
 */
import { ITEMS } from '../../data/items';
import { REGIONS } from '../../data/regions';
import type { StationKind } from '../../data/recipes';
import { npcRoleName } from '../../sim/npc';
import { HOTBAR_SLOTS } from '../../sim/constants';
import { eventStatusText } from '../../sim/events';
import { healthRatePerHour, playerConditions, warmthEnvironment } from '../../sim/needs';
import { dayOf } from '../../sim/time';
import { resumeTutorial, dismissTutorial, tutorialProgress } from '../../sim/tutorial';
import { currentRegion, isAnchored } from '../../sim/voyage';
import { weatherName } from '../../sim/weather';
import type { UiEnv } from '../env';
import { agoText, dayClock, duration, itemName, num, signed } from '../fmt';
import { EVENT_GLYPH, MODULE_GLYPH } from '../icons';
import { bedSummary, CATEGORY_NAMES, eventTone, foodSummary, itemEffects, moduleIssues, recipeRows, sortedEvents, sortInventory, toolUse, useVerb } from '../model';
import { cx, h, type VInput, type VNode } from '../vdom';
import { bar, btn, empty, gl, grid, icon, kbd, meter, section, type SlotOpts } from '../widgets';
import type { PanelView } from './index';
import { STATION_GLYPH, STATION_LABEL, recipeDetail, recipeRow } from './crafting';

const TABS: { id: string; label: string; glyph: string; key: string }[] = [
  { id: 'objetos', label: 'Objetos', glyph: 'bag', key: 'Tab' },
  { id: 'fabricar', label: 'Fabricar', glyph: 'hammer', key: 'C' },
  { id: 'diario', label: 'Diario', glyph: 'book', key: 'J' },
  { id: 'barco', label: 'Barco', glyph: 'ship', key: '' },
];

export function renderInventory(env: UiEnv): PanelView {
  const tab = env.ps.tab ?? 'objetos';
  const tabs = h(
    'nav',
    { class: 'pn-tabs', role: 'tablist' },
    TABS.map((t) =>
      h(
        'button',
        {
          key: t.id,
          type: 'button',
          role: 'tab',
          class: cx('tab', tab === t.id && 'active'),
          'aria-selected': tab === t.id ? 'true' : 'false',
          onclick: () => {
            env.ps.tab = t.id;
            env.tip.hide();
            env.refresh();
          },
        },
        gl(t.glyph),
        t.label,
        t.key ? kbd(t.key) : null,
      ),
    ),
  );
  let body: VInput;
  switch (tab) {
    case 'fabricar':
      body = craftTab(env);
      break;
    case 'diario':
      body = logTab(env);
      break;
    case 'barco':
      body = shipTab(env);
      break;
    default:
      body = itemsTab(env);
  }
  const st = env.ctx.sim.state;
  const used = st.player.inventory.slots.filter((s) => !!s).length;
  return {
    title: 'Inventario',
    subtitle: `${used}/${st.player.inventory.slots.length} ranuras ocupadas`,
    glyph: 'bag',
    tabs,
    body,
    cls: 'pn-wide',
  };
}

/* ================================================================== */
/* Objetos                                                             */
/* ================================================================== */

function itemsTab(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const p = sim.state.player;
  const inv = p.inventory;
  const sel = env.ps.sel ?? null;
  const selStack = sel !== null ? inv.slots[sel] : null;
  const player = { kind: 'player' as const };

  const slotOpts = (i: number): Partial<SlotOpts> => {
    const s = inv.slots[i];
    const def = s ? ITEMS[s.id] : undefined;
    const verb = def ? useVerb(def, i) : null;
    const hints = ['Arrastra para mover · 1-8: a la barra rápida'];
    if (verb) hints.unshift(`Clic derecho o doble clic: ${verb}`);
    return {
      selected: sel === i,
      hotkey: i < HOTBAR_SLOTS ? i + 1 : undefined,
      cls: i < HOTBAR_SLOTS && i === p.hotbar ? 'held' : undefined,
      hints,
      onClick: () => {
        env.ps.sel = env.ps.sel === i ? null : i;
        env.refresh();
      },
      onUse: () => useSlot(env, i),
    };
  };

  return h(
    'div',
    { class: 'inv-layout' },
    h(
      'div',
      { class: 'inv-left' },
      h('div', { class: 'grid-label' }, gl('hand'), 'Barra rápida', h('span', { class: 'faint' }, 'teclas 1-8 · rueda del ratón')),
      grid(env, player, 8, (i) => slotOpts(i), 0, HOTBAR_SLOTS),
      h(
        'div',
        { class: 'grid-label' },
        gl('bag'),
        'Mochila',
        h('span', { class: 'grid-label-act' }, btn('Ordenar', () => sortBackpack(env), { small: true, title: 'Junta las pilas y ordena la mochila por tipo (la barra rápida no se toca)' })),
      ),
      grid(env, player, 8, (i) => slotOpts(i), HOTBAR_SLOTS),
      h(
        'div',
        { class: 'inv-hint' },
        h('span', null, gl('info'), 'Arrastra para ordenar.'),
        h('span', null, kbd('Clic der.'), ' o doble clic: usar o empuñar (una herramienta de la mochila pasa a la barra).'),
        h('span', null, 'Con el ratón encima, ', kbd('1'), '–', kbd('8'), ' la lleva a la barra rápida.'),
      ),
    ),
    h('div', { class: 'inv-right scroll' }, detailSection(env, sel, selStack), equipSection(env), statusSection(env)),
  );
}

/** Ordena la mochila (ranuras 9-24) con movimientos reales de la simulación. */
function sortBackpack(env: UiEnv): void {
  const sim = env.ctx.sim;
  const inv = sim.state.player.inventory;
  const player = { kind: 'player' as const };
  const n = sortInventory(inv, HOTBAR_SLOTS, inv.slots.length, (a, b) => sim.moveItem(player, a, player, b).ok);
  env.ps.sel = null;
  env.toast(n ? 'Mochila ordenada' : 'La mochila ya estaba ordenada', 'info');
  env.refresh();
}

function useSlot(env: UiEnv, i: number): void {
  const sim = env.ctx.sim;
  const s = sim.state.player.inventory.slots[i];
  if (!s) return;
  if (i >= HOTBAR_SLOTS && ITEMS[s.id]?.category === 'herramienta') {
    const to = wieldFromSlot(env, i);
    if (to >= 0 && env.ps.sel === i) env.ps.sel = to;
    return;
  }
  env.act(sim.useItem(i), 'good');
}

/**
 * Empuña una herramienta de la mochila: la lleva a la barra rápida (a un hueco libre o, si está
 * llena, cambiándola por lo menos útil que no sea herramienta) y la selecciona. Devuelve la
 * ranura de la barra donde queda (o -1).
 */
export function wieldFromSlot(env: UiEnv, slot: number): number {
  const sim = env.ctx.sim;
  const player = { kind: 'player' as const };
  const inv = sim.state.player.inventory;
  let to = -1;
  for (let i = 0; i < HOTBAR_SLOTS; i++) {
    if (!inv.slots[i]) {
      to = i;
      break;
    }
  }
  if (to < 0) {
    // Barra llena: se intercambia con lo menos útil que no sea herramienta.
    const rank: Record<string, number> = { material: 0, pieza: 1, semilla: 2, combustible: 3, plano: 4, ropa: 5, medicina: 6, comida: 7, bebida: 8 };
    let best = Infinity;
    for (let i = HOTBAR_SLOTS - 1; i >= 0; i--) {
      const c = ITEMS[inv.slots[i]?.id ?? '']?.category;
      if (!c || c === 'herramienta') continue;
      const r = rank[c] ?? 9;
      if (r < best) {
        best = r;
        to = i;
      }
    }
  }
  if (to < 0) {
    env.act({ ok: false, msg: 'La barra rápida está llena de herramientas: arrastra una a la mochila' }, 'info');
    return -1;
  }
  const mv = sim.moveItem(player, slot, player, to);
  if (!mv.ok) {
    env.act(mv, 'info');
    return -1;
  }
  env.act(sim.useItem(to), 'good');
  return to;
}

/** Primera ranura libre de la barra rápida (o la seleccionada si están todas ocupadas). */
function hotbarTarget(env: UiEnv): number {
  const p = env.ctx.sim.state.player;
  for (let i = 0; i < HOTBAR_SLOTS; i++) if (!p.inventory.slots[i]) return i;
  return p.hotbar;
}

function detailSection(env: UiEnv, sel: number | null, stack: { id: string; qty: number } | null | undefined): VNode {
  const sim = env.ctx.sim;
  if (sel === null || !stack) {
    return section('Objeto', empty('Haz clic en una ranura para ver qué es y qué puedes hacer con ello.', 'hand'));
  }
  const def = ITEMS[stack.id];
  if (!def) return section('Objeto', empty('Objeto desconocido'));
  const verb = useVerb(def, sel);
  const effects = itemEffects(def, sim.state.unlocks);
  const use = toolUse(def);
  const actions: VInput[] = [];
  const isTool = def.category === 'herramienta';
  const held = isTool && sel < HOTBAR_SLOTS && sim.state.player.hotbar === sel;
  if (verb) {
    actions.push(
      btn(held ? 'En la mano' : verb, () => useSlot(env, sel), {
        primary: !held,
        disabled: held,
        glyph: def.category === 'plano' ? 'book' : def.category === 'ropa' ? 'shirt' : 'hand',
        title: isTool && sel >= HOTBAR_SLOTS ? 'La pasa a la barra rápida y la lleva en la mano' : undefined,
      }),
    );
  }
  if (sel >= HOTBAR_SLOTS && !isTool) {
    actions.push(
      btn('A la barra rápida', () => {
        const to = hotbarTarget(env);
        if (env.act(sim.moveItem({ kind: 'player' }, sel, { kind: 'player' }, to), 'info')) env.ps.sel = to;
        env.refresh();
      }, { glyph: 'arrow' }),
    );
  }
  actions.push(
    btn('Dejar en el suelo', () => {
      if (env.act(sim.dropItem(sel), 'info')) env.ps.sel = null;
    }, { glyph: 'box', title: 'Deja la pila en una caja a tus pies (no se pierde)' }),
  );
  return section(
    null,
    h(
      'div',
      { class: 'it-detail' },
      h('div', { class: 'it-head' }, icon(def.id, 'ico it-ico'), h('div', null, h('div', { class: 'it-name' }, def.name, stack.qty > 1 ? h('span', { class: 'it-qty' }, ` ×${stack.qty}`) : null), h('div', { class: `it-cat cat-${def.category}` }, CATEGORY_NAMES[def.category]))),
      h('p', { class: 'it-desc' }, def.desc),
      effects.length ? h('div', { class: 'tip-fx' }, effects.map((e) => h('div', { class: `fx fx-${e.tone}` }, h('span', null, e.label), e.value ? h('b', { style: e.need ? `color: var(--${e.need})` : '' }, e.value) : null))) : null,
      use ? h('p', { class: 'tip-use' }, use) : null,
      h('div', { class: 'it-actions' }, actions),
    ),
  );
}

function equipSection(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const p = sim.state.player;
  const c = p.clothing;
  const def = c ? ITEMS[c] : undefined;
  return section(
    'Ropa',
    h(
      'div',
      { class: 'equip-row' },
      h('div', { class: cx('slot', 'equip-slot', !c && 'empty'), title: def?.name ?? 'Sin abrigo' }, c ? icon(c) : gl('shirt', 'gl ph')),
      h(
        'div',
        { class: 'equip-info' },
        def ? h('b', null, def.name) : h('span', { class: 'muted' }, 'Sin abrigo'),
        h('div', { class: 'faint small' }, def ? `Protege del frío en cubierta (${Math.round((def.warmthProtection ?? 0) * 100)} %)` : 'Equipa un abrigo desde el inventario (clic derecho) para no pasar frío en cubierta.'),
      ),
      c ? btn('Quitar', () => env.act(sim.unequipClothing(), 'info'), { small: true }) : null,
    ),
  );
}

const NEED_ROWS = [
  { k: 'health', label: 'Salud', glyph: 'health' },
  { k: 'hunger', label: 'Hambre', glyph: 'hunger' },
  { k: 'thirst', label: 'Sed', glyph: 'thirst' },
  { k: 'energy', label: 'Energía', glyph: 'energy' },
  { k: 'warmth', label: 'Calor', glyph: 'warmth' },
] as const;

function statusSection(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const p = sim.state.player;
  const n = p.needs as unknown as Record<string, number>;
  let rate = 0;
  let target = 50;
  let conds: { id: string; label: string; kind: string }[] = [];
  try {
    rate = healthRatePerHour(sim);
    target = warmthEnvironment(sim).target;
    conds = playerConditions(sim);
  } catch {
    /* estado incompleto */
  }
  return section(
    'Tu estado',
    h(
      'div',
      { class: 'need-table' },
      NEED_ROWS.map((d) => {
        const v = Math.max(0, Math.min(100, n[d.k] ?? 0));
        let extra: string | null = null;
        if (d.k === 'health' && Math.abs(rate) > 0.05) extra = `${signed(rate, 1)}/h`;
        if (d.k === 'warmth' && Math.abs(target - v) > 2) extra = `tiende a ${Math.round(target)}`;
        return h(
          'div',
          { key: d.k, class: cx('nt-row', `n-${d.k}`, v < 30 && 'low') },
          gl(d.glyph, 'gl need-ico'),
          h('span', { class: 'nt-label' }, d.label),
          bar(v / 100, `var(--${d.k})`),
          h('span', { class: 'nt-val' }, String(Math.round(v))),
          h('span', { class: 'nt-extra faint' }, extra ?? ''),
        );
      }),
    ),
    conds.length ? h('div', { class: 'cond-row' }, conds.map((c) => h('span', { key: c.id, class: `cond cond-${c.kind}` }, c.label))) : null,
  );
}

/* ================================================================== */
/* Fabricar                                                            */
/* ================================================================== */

const STATIONS: StationKind[] = ['mano', 'banco', 'taller', 'cocina'];

function craftTab(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const station = (env.ps.station as StationKind | undefined) ?? 'mano';
  const rows = recipeRows(sim, station);
  // A mano: la disponibilidad real viene de la simulación.
  const hand = station === 'mano' ? sim.stationRecipes(null) : [];
  const stateOf = (id: string): 'ok' | 'missing' | 'locked' => {
    const r = rows.find((x) => x.recipe.id === id)!;
    if (r.locked) return 'locked';
    return r.affordable ? 'ok' : 'missing';
  };
  let selId = env.ps.recipe ?? null;
  if (!selId || !rows.some((r) => r.recipe.id === selId)) selId = rows.find((r) => r.affordable)?.recipe.id ?? rows[0]?.recipe.id ?? null;
  const selRow = rows.find((r) => r.recipe.id === selId) ?? null;

  const chips = h(
    'div',
    { class: 'seg' },
    STATIONS.map((s) => {
      const n = recipeRows(sim, s).filter((r) => r.affordable).length;
      return h(
        'button',
        {
          key: s,
          type: 'button',
          class: cx('seg-btn', station === s && 'active'),
          onclick: () => {
            env.ps.station = s;
            env.ps.recipe = null;
            env.refresh();
          },
        },
        gl(STATION_GLYPH[s]),
        STATION_LABEL[s],
        n ? h('span', { class: 'seg-n' }, String(n)) : null,
      );
    }),
  );

  let detail: VNode;
  if (!selRow) detail = empty('No hay recetas aquí.');
  else {
    const r = selRow.recipe;
    if (station === 'mano') {
      const av = hand.find((a) => a.recipe.id === r.id);
      const reason = av?.reason ?? null;
      detail = recipeDetail(env, r, reason, btn('Fabricar', () => env.act(sim.craftByHand(r.id), 'good'), { primary: true, disabled: !av?.canCraft, glyph: 'hand' }), 'Se fabrica al momento con lo que llevas encima y lo que hay en los almacenes.');
    } else {
      const where = station === 'banco' ? 'Ve al banco de trabajo y pulsa E para fabricarlo.' : station === 'taller' ? 'Se fabrica en el taller mecánico (necesita electricidad).' : 'Se cocina en la cocina (necesita leña o combustible en el fogón).';
      const has = sim.state.ship.modules.some((m) => m.status !== 'construction' && ((station === 'banco' && m.type === 'banco_trabajo') || m.type === station));
      detail = recipeDetail(env, r, selRow.locked ? selRow.reason : null, null, h('span', null, gl(has ? 'info' : 'alert'), has ? where : `Aún no tienes ${station === 'banco' ? 'banco de trabajo' : station === 'taller' ? 'taller mecánico' : 'cocina'} a bordo: constrúyelo con B.`));
    }
  }
  return h(
    'div',
    { class: 'craft-layout' },
    h(
      'div',
      { class: 'craft-left' },
      chips,
      h(
        'div',
        { class: 'rc-list scroll' },
        rows.map((row) =>
          recipeRow(row.recipe, stateOf(row.recipe.id), row.recipe.id === selId, () => {
            env.ps.recipe = row.recipe.id;
            env.refresh();
          }),
        ),
      ),
    ),
    h('div', { class: 'craft-right scroll' }, detail),
  );
}

/* ================================================================== */
/* Diario                                                              */
/* ================================================================== */

function logTab(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const st = sim.state;
  const evs = sortedEvents(st.events.active);
  const log = [...st.log].reverse().slice(0, 60);
  const region = currentRegion(sim);
  const stats = st.player.stats;
  const tut = tutorialProgress(sim);
  const route = st.voyage.route;
  return h(
    'div',
    { class: 'log-layout' },
    h(
      'div',
      { class: 'log-left scroll' },
      section(
        'Situaciones en curso',
        evs.length
          ? h(
              'div',
              { class: 'ev-list' },
              evs.map((ev) =>
                h(
                  'div',
                  { key: ev.id, class: cx('ev-card', 'big', `tone-${eventTone(ev.type)}`) },
                  h('div', { class: 'ev-head' }, gl(EVENT_GLYPH[ev.type] ?? 'alert', 'gl ev-ico'), h('b', null, ev.title), h('span', { class: 'ev-time' }, eventStatusText(sim, ev))),
                  h('p', { class: 'ev-desc' }, ev.description),
                  ev.objectives.length
                    ? h(
                        'ul',
                        { class: 'ev-objs' },
                        ev.objectives.map((o, i) => h('li', { key: i, class: o.done ? 'done' : '' }, h('span', { class: 'ev-check' }, o.done ? '✓' : ''), o.text)),
                      )
                    : null,
                  ev.choices.length ? h('div', { class: 'ev-hint' }, gl('helm'), 'Hay decisiones pendientes en el timón del puente') : null,
                ),
              ),
            )
          : empty('Nada fuera de lo normal. El mar está tranquilo… por ahora.', 'waves'),
      ),
      section(
        'Diario de a bordo',
        h(
          'ol',
          { class: 'log-list' },
          log.map((e, i) => h('li', { key: `${e.at}-${i}-${e.text.length}`, class: `log-${e.kind}` }, h('span', { class: 'log-at', title: dayClock(e.at) }, agoText(e.at, st.time)), h('span', { class: 'log-text' }, e.text))),
        ),
      ),
    ),
    h(
      'div',
      { class: 'log-right scroll' },
      section(
        'Travesía',
        h(
          'div',
          { class: 'kv' },
          kv('Región', region.name),
          kv('Día', `${dayOf(st.time)} (${weatherName(st.weather.kind).toLowerCase()})`),
          kv('Recorrido', `${num(st.voyage.distance, 1)} millas`),
          kv('Velocidad', isAnchored(sim) ? 'Fondeados' : `${num(st.voyage.speed, 1)} nudos`),
        ),
        h('div', { class: 'route-chips' }, route.map((id, i) => h('span', { key: `${id}-${i}`, class: cx('route-chip', i === route.length - 1 && 'now') }, REGIONS[id]?.name ?? id))),
      ),
      section(
        'Estadísticas',
        h(
          'div',
          { class: 'stat-grid' },
          stat('sun', 'Días a bordo', stats.daysSurvived),
          stat('hammer', 'Objetos fabricados', stats.itemsCrafted),
          stat('waves', 'Restos rescatados', stats.debrisCollected),
          stat('fish', 'Peces pescados', stats.fishCaught),
          stat('box', 'Módulos construidos', stats.modulesBuilt),
          stat('wrench', 'Reparaciones', stats.repairs),
          stat('fire', 'Fuegos apagados', stats.firesPutOut),
          stat('people', 'Habitantes', st.npcs.length),
        ),
      ),
      st.events.history.length
        ? section(
            'Sucesos pasados',
            h(
              'ul',
              { class: 'mini-list history' },
              [...st.events.history]
                .reverse()
                .slice(0, 8)
                .map((ev, i) =>
                  h(
                    'li',
                    { key: `${ev.at}-${i}` },
                    gl(EVENT_GLYPH[ev.type] ?? 'info', cx('gl', ev.success === true ? 'good' : ev.success === false ? 'danger' : '')),
                    h('span', { class: 'ml-name' }, ev.title),
                    h('span', { class: 'ml-val faint' }, ev.success === true ? '✓' : ev.success === false ? '✗' : '–', ' ', agoText(ev.at, st.time)),
                  ),
                ),
            ),
          )
        : null,
      section(
        'Consejos',
        h('div', { class: 'tut-prog' }, bar(tut.done / tut.total, 'var(--accent)'), h('span', null, `${tut.done} de ${tut.total} aprendidos`)),
        st.tutorial.dismissed
          ? btn('Mostrar consejos', () => {
              resumeTutorial(sim);
              env.ctx.settings.tutorial = true;
              env.ctx.saveSettings();
              env.toast('Los consejos vuelven a aparecer', 'info');
              env.refresh();
            }, { small: true, glyph: 'star' })
          : btn('Ocultar consejos', () => {
              dismissTutorial(sim);
              env.refresh();
            }, { small: true, glyph: 'eye' }),
      ),
    ),
  );
}

/** Ampliación del casco en obra (si la hay). */
function expansionMeter(env: UiEnv): VNode | null {
  const cs = env.ctx.sim.constructionStatus(-1);
  if (!cs) return null;
  return meter([gl('hammer'), cs.name], `${Math.floor(cs.progress * 100)} % · ≈ ${duration(cs.etaMin)}`, cs.progress, 'var(--accent)');
}

function kv(k: string, v: VInput): VNode {
  return h('div', { class: 'kv-row' }, h('span', { class: 'kv-k' }, k), h('span', { class: 'kv-v' }, v));
}

function stat(glyphName: string, label: string, v: number): VNode {
  return h('div', { class: 'stat' }, gl(glyphName), h('span', null, label), h('b', null, String(v)));
}

/* ================================================================== */
/* Barco                                                               */
/* ================================================================== */

function shipTab(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const st = sim.state;
  const u = st.utilities;
  const pw = u.power;
  const breakdown = sim.powerBreakdown();
  const food = foodSummary(sim);
  const beds = bedSummary(sim);
  const issues = moduleIssues(sim);
  const net = u.water.inPerHour - u.water.outPerHour;
  const present = st.npcs.filter((n) => n.awayUntil === null).length;

  const energy = section(
    h('span', null, gl('power'), 'Energía'),
    breakdown.length
      ? [
          h(
            'div',
            { class: 'kv' },
            kv('Generación', `${num(pw.generation, 1)} kW`),
            kv('Demanda', `${num(pw.demand, 1)} kW`),
            kv('Suministro', h('span', { class: pw.satisfaction < 0.5 ? 'danger' : pw.satisfaction < 0.95 ? 'warn' : 'good' }, `${Math.round(pw.satisfaction * 100)} %`)),
          ),
          pw.capacityKWh > 0 ? meter([gl('battery'), 'Baterías'], `${num(u.batteryKWh, 1)} / ${Math.round(pw.capacityKWh)} kWh`, u.batteryKWh / pw.capacityKWh, 'var(--energy)') : null,
          h(
            'ul',
            { class: 'mini-list' },
            breakdown.map((b) =>
              h(
                'li',
                { key: b.moduleId },
                gl(b.role === 'gen' ? 'power' : b.role === 'battery' ? 'battery' : 'plug'),
                h('span', { class: 'ml-name' }, b.name),
                h('span', { class: cx('ml-val', !b.on ? 'faint' : b.powered ? 'good' : 'warn') }, !b.on ? 'Apagado' : b.role === 'battery' ? 'Conectada' : b.role === 'gen' ? (b.powered ? `+${num(b.kw, 1)} kW` : 'Parado') : b.powered ? `−${num(b.kw, 1)} kW` : 'Sin energía'),
              ),
            ),
          ),
        ]
      : empty('Aún no hay instalación eléctrica. Con el plano de Energía podrás construir generadores y baterías.', 'plug'),
  );

  const water = section(
    h('span', null, gl('drop'), 'Agua potable'),
    meter('Depósitos', `${Math.floor(u.waterL)} / ${Math.round(u.water.capacityL)} L`, u.water.capacityL > 0 ? u.waterL / u.water.capacityL : 0, 'var(--thirst)'),
    h(
      'div',
      { class: 'kv' },
      kv('Entrada', `${num(u.water.inPerHour, 1)} L/h`),
      kv('Consumo y pérdidas', `${num(u.water.outPerHour, 1)} L/h`),
      kv('Balance', h('span', { class: net < -0.05 ? 'warn' : net > 0.05 ? 'good' : '' }, `${signed(net, 1)} L/h`)),
    ),
    st.ship.modules.some((m) => m.leak) ? h('div', { class: 'note warn' }, gl('leak'), 'Hay una fuga en un depósito: repárala con martillo y kit.') : null,
  );

  const crew = section(
    h('span', null, gl('people'), 'Tripulación'),
    h('div', { class: 'kv' }, kv('A bordo', `${present + 1} (tú y ${present} habitante${present === 1 ? '' : 's'})`), kv('Camas', `${beds.assigned} ocupadas de ${beds.total}`)),
    beds.homeless.length ? h('div', { class: 'note warn' }, gl('bed'), `Sin cama: ${beds.homeless.join(', ')}`) : null,
    h(
      'ul',
      { class: 'mini-list' },
      st.npcs.map((n) =>
        h(
          'li',
          { key: n.id },
          gl(n.needs.mood >= 60 ? 'smile' : n.needs.mood >= 35 ? 'meh' : 'frown', cx('gl', n.needs.mood >= 60 ? 'good' : n.needs.mood >= 35 ? 'warn' : 'danger')),
          h('span', { class: 'ml-name' }, h('b', null, n.name), h('small', { class: 'faint' }, ` · ${npcRoleName(n, n.role)}`)),
          h('span', { class: 'ml-val muted' }, sim.npcStatus(n.id)),
        ),
      ),
    ),
  );

  const pantry = section(
    h('span', null, gl('food'), 'Despensa'),
    food.items.length
      ? [
          h(
            'div',
            { class: 'food-grid' },
            food.items.map((f) => h('div', { key: f.id, class: 'food-item', title: itemName(f.id) }, icon(f.id, 'ico ico-md'), h('b', null, String(f.qty)))),
          ),
          h('div', { class: cx('note', food.days < 1 ? 'warn' : '') }, gl('clock'), `Reservas para unos ${num(food.days, 1)} días con ${food.crew} bocas.`),
        ]
      : empty('No queda comida en los almacenes. ¡Pesca o rescata barriles!', 'alert'),
  );

  const status = section(
    h('span', null, gl('wrench'), 'Estado del barco'),
    h('div', { class: 'kv' }, kv('Eslora', `${st.ship.length * 4} m`), kv('Módulos', String(st.ship.modules.filter((m) => m.status !== 'construction').length))),
    expansionMeter(env),
    issues.length
      ? h(
          'ul',
          { class: 'mini-list issues' },
          issues.map((iss, i) =>
            h(
              'li',
              { key: `${iss.module.id}-${iss.kind}-${i}`, class: `sev-${iss.severity}` },
              gl(iss.kind === 'fire' ? 'fire' : iss.kind === 'leak' ? 'leak' : iss.kind === 'construction' ? 'hammer' : MODULE_GLYPH[iss.module.type] ?? 'wrench'),
              h('span', { class: 'ml-name' }, iss.name),
              h('span', { class: 'ml-val' }, iss.text),
            ),
          ),
        )
      : h('div', { class: 'note good' }, gl('check'), 'Todo en orden: no hay daños ni averías.'),
  );

  return h('div', { class: 'ship-layout scroll' }, h('div', { class: 'ship-col' }, energy, water, status), h('div', { class: 'ship-col' }, crew, pantry));
}


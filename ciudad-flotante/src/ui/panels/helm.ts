/**
 * Panel del TIMÓN: carta del viaje (regiones visitadas, ruta, posición), progreso de la región,
 * velocidad, distancia y fondeo, barómetro, opciones de rumbo (descripción, peligro, temperatura)
 * y avistamientos con sus decisiones (`sim.eventChoice`). Acceso al comercio con el mercante.
 */
import { REGIONS } from '../../data/regions';
import { eventStatusText } from '../../sim/events';
import { currentRegion, gatedRoutes, hoursToRegionEnd, isAnchored, milesToRegionEnd, routeOptions } from '../../sim/voyage';
import { barometer, weatherName } from '../../sim/weather';
import type { ActiveEvent } from '../../sim/types';
import type { UiEnv } from '../env';
import { duration, num } from '../fmt';
import { EVENT_GLYPH, WEATHER_GLYPH } from '../icons';
import { CHART_POS, dangerText, eventTone } from '../model';
import { cx, h, type VInput, type VNode } from '../vdom';
import { bar, btn, chip, empty, gl, section } from '../widgets';
import type { PanelView } from './index';

const DANGER_COLOR = ['#8ac66b', '#8ac66b', '#c9d36a', '#f2c14e', '#f4a261', '#e5604d'];

/** Carta náutica en SVG. */
function chart(env: UiEnv): VNode {
  const sim = env.ctx.sim;
  const v = sim.state.voyage;
  const cur = v.regionId;
  const visited = new Set(v.route);
  const choices = new Set(routeOptions(sim).map((r) => r.id));
  const edges: VNode[] = [];
  const drawn = new Set<string>();
  for (const r of Object.values(REGIONS)) {
    const a = CHART_POS[r.id];
    if (!a) continue;
    for (const n of r.next) {
      const b = CHART_POS[n];
      if (!b) continue;
      const key = [r.id, n].sort().join('-');
      if (drawn.has(key)) continue;
      drawn.add(key);
      const loop = Math.abs(a.x - b.x) > 200;
      const d = loop ? `M${a.x} ${a.y} C ${a.x - 10} 214, ${b.x + 10} 214, ${b.x} ${b.y}` : `M${a.x} ${a.y} L${b.x} ${b.y}`;
      const next = (r.id === cur && choices.has(n)) || (n === cur && choices.has(r.id));
      edges.push(h('path', { key, d, class: cx('ch-edge', next && 'next') }));
    }
  }
  // Ruta recorrida.
  const pts = v.route.map((id) => CHART_POS[id]).filter((p): p is { x: number; y: number } => !!p);
  const routePath = pts.length > 1 ? h('polyline', { class: 'ch-route', points: pts.map((p) => `${p.x},${p.y}`).join(' ') }) : null;
  // Rumbo fijado.
  const chosen = v.chosenNext ? CHART_POS[v.chosenNext] : null;
  const curPos = CHART_POS[cur];
  const chosenPath = chosen && curPos ? h('line', { class: 'ch-chosen', x1: curPos.x, y1: curPos.y, x2: chosen.x, y2: chosen.y }) : null;
  const nodes = Object.values(REGIONS).map((r) => {
    const p = CHART_POS[r.id];
    if (!p) return null;
    const isCur = r.id === cur;
    const known = visited.has(r.id) || choices.has(r.id);
    return h(
      'g',
      { key: r.id, class: cx('ch-node', isCur && 'cur', visited.has(r.id) && 'visited', choices.has(r.id) && 'option', r.id === v.chosenNext && 'chosen'), transform: `translate(${p.x} ${p.y})` },
      known ? h('title', null, `${r.name} (peligro: ${dangerText(r.danger).toLowerCase()}, ${r.baseTemp} °C). ${r.desc}`) : h('title', null, 'Región sin explorar'),
      h('circle', { r: isCur ? 10 : 7, fill: known ? DANGER_COLOR[r.danger] : '#53606b' }),
      isCur ? h('circle', { r: 15, class: 'ch-pulse' }) : null,
      h('text', { y: isCur ? 26 : 21, 'text-anchor': 'middle' }, known ? r.name : '¿?'),
    );
  });
  return h(
    'svg',
    { class: 'chart', viewBox: '0 0 360 210', role: 'img', 'aria-label': 'Carta náutica del viaje' },
    h('rect', { x: 0, y: 0, width: 360, height: 210, rx: 10, class: 'ch-sea' }),
    h('path', { class: 'ch-grid', d: 'M0 52H360M0 105H360M0 158H360M90 0V210M180 0V210M270 0V210' }),
    edges,
    routePath,
    chosenPath,
    nodes,
    h('g', { class: 'ch-rose', transform: 'translate(338 186)' }, h('circle', { r: 13 }), h('path', { d: 'M0 -11 L3 0 L0 11 L-3 0 Z' }), h('text', { y: -15, 'text-anchor': 'middle' }, 'N')),
  );
}

/** Tarjeta de un avistamiento o situación con decisiones. */
function decisionCard(env: UiEnv, ev: ActiveEvent): VNode {
  const sim = env.ctx.sim;
  const sighting = sim.state.voyage.sightings.find((s) => s.eventId === ev.id);
  const isMerchant = ev.type === 'mercante';
  return h(
    'div',
    { key: ev.id, class: cx('ev-card', 'big', `tone-${eventTone(ev.type)}`) },
    h('div', { class: 'ev-head' }, gl(EVENT_GLYPH[ev.type] ?? 'alert', 'gl ev-ico'), h('b', null, ev.title), h('span', { class: 'ev-time' }, eventStatusText(sim, ev))),
    h('p', { class: 'ev-desc' }, ev.description),
    sighting ? h('div', { class: 'faint small' }, gl('eye'), ` ${sighting.name} por ${sighting.side < 0 ? 'babor' : 'estribor'}, a unos ${Math.round(sighting.distance)} m`) : null,
    ev.objectives.length ? h('ul', { class: 'ev-objs' }, ev.objectives.map((o, i) => h('li', { key: i, class: o.done ? 'done' : '' }, h('span', { class: 'ev-check' }, o.done ? '✓' : ''), o.text))) : null,
    h(
      'div',
      { class: 'ev-choices' },
      ev.choices.map((c) =>
        btn(
          c.label,
          () => {
            const res = sim.eventChoice(ev.id, c.id);
            if (isMerchant && c.id === 'comerciar' && res.ok) {
              env.toast(res.msg ?? 'El mercante te enseña su mercancía', 'info');
              env.open({ kind: 'trade', eventId: ev.id });
              return;
            }
            env.act(res, 'good');
          },
          { key: c.id, primary: c.enabled && ev.choices[0]?.id === c.id, disabled: !c.enabled, title: c.reason ?? '' },
        ),
      ),
      ev.choices.filter((c) => !c.enabled && c.reason).map((c) => h('div', { key: `r-${c.id}`, class: 'warn small' }, c.reason!)),
    ),
  );
}

export function renderHelm(env: UiEnv): PanelView {
  const sim = env.ctx.sim;
  const st = sim.state;
  const v = st.voyage;
  const region = currentRegion(sim);
  const prog = v.regionLength > 0 ? Math.min(1, v.regionDistance / v.regionLength) : 0;
  const hrs = hoursToRegionEnd(sim);
  const anchored = isAnchored(sim);
  const baro = barometer(sim);
  const opts = routeOptions(sim);
  const mustChoose = !!v.nextChoices && !v.chosenNext;
  const decisions = st.events.active.filter((e) => e.choices.length > 0);
  const merchant = st.events.active.find((e) => e.type === 'mercante');

  const regionCard = section(
    null,
    h(
      'div',
      { class: 'region-card' },
      h('div', { class: 'rc-top' }, h('div', null, h('div', { class: 'faint small' }, 'Navegamos por'), h('div', { class: 'rc-region' }, region.name)), chip(dangerText(region.danger), region.danger >= 4 ? 'danger' : region.danger >= 3 ? 'warn' : 'good', 'alert')),
      h('p', { class: 'muted small' }, region.desc),
      h('div', { class: 'rc-prog' }, bar(prog, 'var(--sea)'), h('span', null, `${num(v.regionDistance, 0)} / ${v.regionLength} mi`)),
      h(
        'div',
        { class: 'helm-stats' },
        h('div', { class: 'hs' }, gl('speed'), h('b', null, anchored ? '0' : num(v.speed, 1)), h('span', null, 'nudos')),
        h('div', { class: 'hs' }, gl('map'), h('b', null, num(milesToRegionEnd(sim), 0)), h('span', null, 'mi al final')),
        h('div', { class: 'hs' }, gl('clock'), h('b', null, hrs === null ? '—' : duration(hrs * 60)), h('span', null, 'a este ritmo')),
        h('div', { class: 'hs' }, gl('ship'), h('b', null, num(v.distance, 0)), h('span', null, 'mi en total')),
      ),
      anchored ? h('div', { class: 'note' }, gl('anchor'), `Fondeados${v.anchorReason ? `: ${v.anchorReason}` : ''}. Levamos anclas en ${duration((v.anchoredUntil ?? st.time) - st.time)}.`) : null,
      h('div', { class: cx('note', baro.trend === 'baja' && baro.next === 'tormenta' && 'warn') }, gl(WEATHER_GLYPH[st.weather.kind] ?? 'cloud'), `${weatherName(st.weather.kind)} · ${Math.round(st.weather.temperature)} °C · Barómetro: ${baro.text}`),
    ),
  );

  const routes = section(
    h('span', { class: 'sec-row' }, h('span', null, gl('compass'), 'Rumbo'), mustChoose ? chip('¡Elige rumbo!', 'warn', 'alert') : v.chosenNext ? chip(`Rumbo a ${REGIONS[v.chosenNext]?.name ?? v.chosenNext}`, 'good', 'check') : null),
    h(
      'div',
      { class: 'routes' },
      opts.map((r) =>
        h(
          'div',
          { key: r.id, class: cx('route', r.chosen && 'chosen') },
          h('div', { class: 'route-head' }, h('b', null, r.name), h('span', { class: 'danger-pips', title: `Peligro: ${dangerText(r.danger)}` }, [1, 2, 3, 4, 5].map((i) => h('i', { key: i, class: i <= r.danger ? 'on' : '', style: i <= r.danger ? `background:${DANGER_COLOR[r.danger]}` : '' })))),
          h('p', { class: 'small muted' }, r.desc),
          h('div', { class: 'route-meta' }, chip(`${r.baseTemp} °C`, r.baseTemp < 12 ? 'info' : 'dim', 'thermo'), chip(dangerText(r.danger), r.danger >= 4 ? 'danger' : r.danger >= 3 ? 'warn' : 'dim')),
          r.chosen ? h('div', { class: 'route-set good' }, gl('check'), 'Rumbo fijado') : btn('Fijar rumbo', () => env.act(sim.chooseRoute(r.id), 'good'), { small: true, primary: mustChoose, glyph: 'compass' }),
        ),
      ),
    ),
    gatedRoutes(sim).length
      ? h('div', { class: 'routes gated' }, gatedRoutes(sim).map((g) => h('div', { key: `g-${g.id}`, class: 'route disabled', title: g.reason }, h('div', { class: 'route-head' }, h('b', null, g.name), chip('Aún no', 'dim', 'lock')), h('p', { class: 'small faint' }, g.reason))))
      : null,
    h('div', { class: 'faint small' }, mustChoose ? `Nos acercamos al final de la región: si no eliges, pondremos rumbo hacia ${REGIONS[opts.find((o) => (o as { autopilot?: boolean }).autopilot)?.id ?? '']?.name ?? 'donde nos lleve la corriente'}.` : 'Puedes fijar el rumbo en cualquier momento antes de llegar al final de la región.'),
  );

  const sight = section(
    h('span', { class: 'sec-row' }, h('span', null, gl('eye'), 'Avistamientos y decisiones'), merchant ? btn('Comerciar', () => env.open({ kind: 'trade', eventId: merchant.id }), { small: true, primary: true, glyph: 'swap' }) : null),
    decisions.length ? h('div', { class: 'ev-list' }, decisions.map((e) => decisionCard(env, e))) : empty('Nada a la vista. El vigía avisará si aparece algo en el horizonte.', 'eye'),
  );

  // Si hay que elegir rumbo ya, el rumbo va primero.
  const right = mustChoose ? [routes, sight] : [sight, routes];
  const body: VInput = h('div', { class: 'helm-layout' }, h('div', { class: 'helm-left scroll' }, h('div', { class: 'chart-wrap' }, chart(env)), regionCard), h('div', { class: 'helm-right scroll' }, right));
  return { title: 'Timón', subtitle: 'Rumbo, carta del viaje y avistamientos', glyph: 'helm', body, cls: 'pn-wide' };
}

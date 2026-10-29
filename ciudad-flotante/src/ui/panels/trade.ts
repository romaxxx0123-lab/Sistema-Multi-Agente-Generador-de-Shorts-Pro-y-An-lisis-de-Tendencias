/**
 * Panel de COMERCIO con el mercante: ofertas (`sim.tradeOffers`) con lo que das y lo que recibes,
 * lo que tienes, y el intercambio real (`sim.trade`). Paga con tu inventario y los almacenes.
 */
import { eventStatusText } from '../../sim/events';
import { payInventories } from '../../sim/helpers';
import { countIn } from '../../sim/inventory';
import type { UiEnv } from '../env';
import { stacksText } from '../fmt';
import { cx, h } from '../vdom';
import { btn, chip, empty, gl, stackList } from '../widgets';
import type { PanelView } from './index';

export function renderTrade(env: UiEnv, eventId: number): PanelView | null {
  const sim = env.ctx.sim;
  const ev = sim.state.events.active.find((e) => e.id === eventId && e.type === 'mercante');
  if (!ev) return null;
  const offers = sim.tradeOffers(eventId);
  const invs = payInventories(sim);
  const have = (id: string): number => countIn(invs, id);
  const despedir = ev.choices.find((c) => c.id === 'despedir');
  const rows = offers.map((o) =>
    h(
      'div',
      { key: o.index, class: cx('offer', o.done && 'done', o.canAfford && 'can') },
      h('div', { class: 'offer-side' }, h('div', { class: 'faint small' }, 'Das'), stackList(o.give, have)),
      h('div', { class: 'offer-arrow' }, gl('swap')),
      h('div', { class: 'offer-side' }, h('div', { class: 'faint small' }, 'Recibes'), stackList(o.get)),
      h(
        'div',
        { class: 'offer-act' },
        o.done
          ? chip('Trato hecho', 'good', 'check')
          : btn('Intercambiar', () => env.act(sim.trade(eventId, o.index), 'good'), { primary: o.canAfford, disabled: !o.canAfford, glyph: 'swap', title: o.canAfford ? 'Se paga con tu inventario y los almacenes' : `Te faltan: ${stacksText(o.missing)}` }),
        !o.done && !o.canAfford ? h('div', { class: 'warn small' }, `Faltan: ${stacksText(o.missing)}`) : null,
      ),
    ),
  );
  return {
    title: 'Comercio',
    subtitle: ev.description,
    glyph: 'merchant',
    head: chip(eventStatusText(sim, ev), 'info', 'clock'),
    body: h('div', { class: 'trade' }, rows.length ? rows : empty('El mercante no tiene nada que ofrecer.'), h('div', { class: 'faint small' }, 'Cada trato se puede hacer una vez. El mercante se irá cuando se acabe el tiempo.')),
    foot: despedir
      ? h('div', { class: 'foot-row' }, btn('Volver al timón', () => env.open({ kind: 'helm' }), { small: true, glyph: 'back' }), btn('Despedir al mercante', () => {
          if (env.act(sim.eventChoice(eventId, 'despedir'), 'info')) env.close();
        }, { small: true, danger: true }))
      : null,
    cls: 'pn-mid',
  };
}

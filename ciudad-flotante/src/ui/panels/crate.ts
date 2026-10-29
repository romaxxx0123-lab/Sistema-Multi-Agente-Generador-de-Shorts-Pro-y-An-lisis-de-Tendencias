/**
 * Panel de CAJA SUELTA (restos de demolición, inventario lleno, productos sin sitio).
 * Al vaciarse, la simulación la elimina y el panel se cierra solo.
 */
import type { UiEnv } from '../env';
import { h } from '../vdom';
import { gl, kbd } from '../widgets';
import type { PanelView } from './index';
import { transferHelp, transferView } from './transfer';

export function renderCrate(env: UiEnv, crateId: number): PanelView | null {
  const crate = env.ctx.sim.state.crates.find((c) => c.id === crateId);
  if (!crate) return null;
  const n = crate.inventory.slots.length;
  return {
    title: crate.label || 'Caja',
    subtitle: 'Una caja en el suelo. Cuando la vacíes, desaparecerá.',
    glyph: 'box',
    body: [
      transferView(env, {
        ref: { kind: 'crate', id: crate.id },
        title: h('span', null, gl('box'), 'Caja'),
        cols: n > 16 ? 5 : 4,
        canStore: true,
      }),
      transferHelp(),
      h('div', { class: 'help-line' }, h('span', null, kbd('E'), ' sobre una caja: cogerlo todo si cabe'), h('span', null, kbd('Mantén'), ' ', kbd('E'), ' abrir la caja para elegir')),
    ],
    cls: 'pn-wide pn-auto',
  };
}

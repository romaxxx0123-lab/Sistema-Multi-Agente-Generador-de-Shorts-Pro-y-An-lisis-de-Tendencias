/**
 * Piezas comunes de fabricación: fila de receta y ficha de receta (ingredientes tengo/necesito,
 * tiempo, estación, productos). Las usan la pestaña Fabricar y los paneles de estación.
 */
import { ITEMS } from '../../data/items';
import type { RecipeDef, StationKind } from '../../data/recipes';
import type { UiEnv } from '../env';
import { duration, itemName } from '../fmt';
import { ingredientRows } from '../model';
import { cx, h, type VInput, type VNode } from '../vdom';
import { chip, gl, icon } from '../widgets';

export const STATION_LABEL: Record<StationKind, string> = {
  mano: 'A mano',
  banco: 'Banco de trabajo',
  taller: 'Taller mecánico',
  cocina: 'Cocina',
  ahumadero: 'Ahumadero',
};

export const STATION_GLYPH: Record<StationKind, string> = {
  mano: 'hand',
  banco: 'hammer',
  taller: 'gear',
  cocina: 'pot',
  ahumadero: 'fire',
};

/** Primer producto de una receta (para el icono). */
export function mainOutput(r: RecipeDef): string {
  return Object.keys(r.outputs)[0] ?? Object.keys(r.inputs)[0] ?? '';
}

export type RecipeState = 'ok' | 'missing' | 'locked' | 'blocked';

/** Fila de la lista de recetas. */
export function recipeRow(r: RecipeDef, state: RecipeState, selected: boolean, onSelect: () => void): VNode {
  const out = mainOutput(r);
  const qty = r.outputs[out] ?? 1;
  const glyphName = state === 'ok' ? 'check' : state === 'locked' ? 'lock' : state === 'blocked' ? 'alert' : 'minus';
  return h(
    'div',
    { key: r.id, class: cx('rc-row', `st-${state}`, selected && 'sel'), onclick: onSelect, role: 'button', tabindex: 0 },
    icon(out, 'ico rc-ico'),
    h('div', { class: 'rc-name' }, h('b', null, r.name), qty > 1 ? h('span', { class: 'rc-qty' }, `×${qty}`) : null, r.time > 0 ? h('span', { class: 'rc-time' }, duration(r.time)) : null),
    gl(glyphName, 'gl rc-state'),
  );
}

/** Ficha completa de una receta. `reason` = por qué no se puede ahora (o null). */
export function recipeDetail(env: UiEnv, r: RecipeDef, reason: string | null, actions: VInput, note?: VInput): VNode {
  const out = mainOutput(r);
  const def = ITEMS[out];
  const rows = ingredientRows(env.ctx.sim, r.inputs);
  return h(
    'div',
    { class: 'rc-detail', key: `rd-${r.id}` },
    h(
      'div',
      { class: 'rd-head' },
      icon(out, 'ico rd-ico'),
      h(
        'div',
        { class: 'rd-titles' },
        h('div', { class: 'rd-name' }, r.name),
        h(
          'div',
          { class: 'rd-outs' },
          Object.entries(r.outputs).map(([id, n]) => h('span', { class: 'rd-out' }, icon(id, 'ico ico-sm'), `${n}× ${itemName(id)}`)),
        ),
      ),
    ),
    h('p', { class: 'rd-desc' }, r.desc ?? def?.desc ?? ''),
    h(
      'div',
      { class: 'rd-meta' },
      chip(STATION_LABEL[r.station], 'dim', STATION_GLYPH[r.station]),
      r.time > 0 ? chip(duration(r.time), 'dim', 'clock') : chip('Instantáneo', 'dim', 'clock'),
    ),
    h('div', { class: 'rd-sub' }, 'Ingredientes', h('span', { class: 'faint' }, 'tienes / necesitas')),
    h(
      'div',
      { class: 'rd-ings' },
      rows.map((row) => {
        const ok = row.have >= row.need;
        const stored = row.have - row.carried;
        return h(
          'div',
          { key: row.id, class: cx('ing', ok ? 'ok' : 'short') },
          icon(row.id, 'ico ico-md'),
          h('span', { class: 'ing-name' }, itemName(row.id), stored > 0 ? h('small', { class: 'faint' }, ` (${stored} en almacenes)`) : null),
          h('span', { class: 'ing-count' }, h('b', null, String(row.have)), ` / ${row.need}`),
        );
      }),
    ),
    reason ? h('div', { class: 'rd-reason' }, gl('alert'), reason) : null,
    note ? h('div', { class: 'rd-note' }, note) : null,
    actions ? h('div', { class: 'rd-actions' }, actions) : null,
  );
}

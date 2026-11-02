/**
 * Textos de los diálogos de confirmación del modo construcción (lógica pura, sin DOM): desmontar
 * o cancelar una obra, encargar una mejora, cancelar una mejora en obras y ampliar el casco.
 */
import { durationText } from '../sim/construction';
import { withArticle } from '../sim/utilities';
import type { DemolishPreview, ExpansionInfo, UpgradePreview } from './catalog';
import type { ConfirmModel } from './hud';

export function demolishConfirmModel(p: DemolishPreview): ConfirmModel {
  const lines = p.inConstruction
    ? ['La obra se cancela y se recuperan todos los materiales.']
    : [
        `Se recupera la mitad de los materiales${p.tier > 1 ? ' (también de sus mejoras)' : ''}. Los habitantes que dormían o trabajaban aquí buscarán otro sitio.`,
        ...(p.upgradeInProgress ? [`La mejora en obras (${p.upgradeInProgress}) se cancela y se recupera entera.`] : []),
      ];
  return {
    kind: 'demolish',
    title: p.inConstruction ? `¿Cancelar la obra: ${p.name}?` : `¿Desmontar ${withArticle(p.name)}?`,
    glyph: 'trash',
    lines,
    items: p.refund.map((r) => ({ id: r.id, name: r.name, qty: r.qty })),
    itemsLabel: 'Recuperas',
    // El agua y la carga no caben en la caja: se avisa antes, no después.
    warnings: p.losses,
    note:
      p.contents > 0
        ? `Lo que contenga (${p.contents} ${p.contents === 1 ? 'objeto' : 'objetos'}) quedará en una caja en el suelo, junto con los materiales.`
        : 'Lo que contenga quedará en una caja en el suelo, junto con los materiales.',
    confirmLabel: p.inConstruction ? 'Cancelar obra' : 'Desmontar',
    danger: true,
  };
}

export function upgradeConfirmModel(u: UpgradePreview): ConfirmModel {
  return {
    kind: 'upgrade',
    title: `¿Mejorar ${withArticle(u.name)}?`,
    glyph: 'star',
    lines: [
      `Nivel ${u.toTier ?? u.tier + 1}: ${u.nextName ?? ''}. ${u.desc ?? ''}`.trim(),
      `La obra dura ${u.timeText ?? '—'} y ${withArticle(u.name)} se sigue usando mientras tanto. Los habitantes libres ayudan, y tú también con el martillo.`,
    ],
    chips: u.effects,
    items: u.cost.map((c) => ({ id: c.id, name: c.name, qty: c.need, have: c.have })),
    itemsLabel: 'Coste (se paga ahora)',
    note: 'Si cancelas la mejora antes de que termine, recuperas todo lo pagado.',
    confirmLabel: 'Mejorar',
    danger: false,
  };
}

export function cancelUpgradeConfirmModel(u: UpgradePreview): ConfirmModel {
  const p = Math.floor((u.progress ?? 0) * 100);
  return {
    kind: 'cancelUpgrade',
    title: `¿Cancelar la mejora: ${u.nextName ?? ''}?`,
    glyph: 'trash',
    lines: [`La obra va por el ${p} %${u.etaMin !== null ? ` y le faltan ${durationText(u.etaMin)}` : ''}. Si la cancelas, ${withArticle(u.name)} se queda en el nivel ${u.tier}.`],
    progress: u.progress ?? 0,
    items: u.cost.map((c) => ({ id: c.id, name: c.name, qty: c.need })),
    itemsLabel: 'Recuperas',
    note: 'Lo que no quepa en tu mochila quedará en una caja a tus pies.',
    confirmLabel: 'Cancelar mejora',
    danger: true,
  };
}

export function expandConfirmModel(info: ExpansionInfo): ConfirmModel {
  return {
    kind: 'expand',
    title: '¿Ampliar el casco?',
    glyph: 'ship',
    lines: [
      `El barco crecerá dos secciones por la proa: de ${info.lengthNowM} m a ${info.lengthAfterM} m de eslora, con más cubierta y más bodega.`,
      `La obra dura ${info.timeText}; puedes ayudar con el martillo en la proa.`,
      ...(info.done > 0 ? [`Cada ampliación cuesta más que la anterior: esta es la ${info.done + 1}.ª.`] : []),
    ],
    items: info.cost.map((c) => ({ id: c.id, name: c.name, qty: c.need, have: c.have })),
    itemsLabel: 'Coste',
    confirmLabel: 'Ampliar',
    danger: false,
  };
}

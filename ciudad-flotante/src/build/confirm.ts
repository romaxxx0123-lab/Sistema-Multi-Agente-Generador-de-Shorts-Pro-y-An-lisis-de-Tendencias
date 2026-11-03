/**
 * Textos de los diálogos de confirmación del modo construcción (lógica pura, sin DOM): desmontar
 * o cancelar una obra, encargar una mejora, cancelar una mejora en obras y ampliar el casco.
 */
import type { NotifyKind } from '../core/EventBus';
import { durationText } from '../sim/construction';
import type { Simulation } from '../sim/Simulation';
import { withArticle } from '../sim/utilities';
import { demolishPreview, expansionInfo, stock, upgradePreview, type DemolishPreview, type ExpansionInfo, type UpgradePreview } from './catalog';
import type { ConfirmModel } from './hud';

/**
 * Qué pregunta el diálogo abierto. En «desmontar», `obra` dice si se abrió para cancelar una obra
 * (si la obra termina mientras tanto, la pregunta ya no es la misma).
 */
export type ConfirmTarget =
  | { kind: 'demolish'; moduleId: number; obra: boolean }
  | { kind: 'expand' }
  | { kind: 'upgrade'; moduleId: number }
  | { kind: 'cancelUpgrade'; moduleId: number };

/** El diálogo sigue al día con este modelo, o ya no tiene sentido y se cierra con este aviso. */
export type ConfirmRefresh = { model: ConfirmModel } | { close: string; kind: NotifyKind };

/**
 * Diálogo de confirmación abierto, con los datos de ahora: la simulación sigue mientras se lee, así
 * que la obra avanza (o se para si arde), la mejora puede terminar, el módulo desaparecer o dejar de
 * poder pagarse. Si la pregunta ya no tiene sentido, devuelve el aviso con el que cerrarlo: nunca se
 * deja un diálogo que diga algo falso ni que, al confirmar, haga otra cosa de la que pregunta.
 */
export function refreshConfirm(sim: Simulation, c: ConfirmTarget): ConfirmRefresh {
  if (c.kind === 'expand') {
    const info = expansionInfo(sim, stock(sim));
    return info.ok ? { model: expandConfirmModel(info) } : { close: info.reason ?? 'Ya no se puede ampliar el casco', kind: 'warn' };
  }
  const m = sim.state.ship.modules.find((mm) => mm.id === c.moduleId);
  if (!m) return { close: 'Ese módulo ya no está en el barco', kind: 'info' };
  if (c.kind === 'demolish') {
    const obra = m.status === 'construction';
    if (c.obra && !obra) return { close: 'La obra ya ha terminado: no hay nada que cancelar', kind: 'info' };
    const p = demolishPreview(sim, m);
    if (!p.ok) return { close: `${p.name}: ${p.reason ?? 'ya no se puede desmontar'}`, kind: 'warn' };
    return { model: demolishConfirmModel(p) };
  }
  const u = upgradePreview(sim, m);
  if (c.kind === 'cancelUpgrade') {
    if (u.state !== 'busy') return { close: `La mejora ya ha terminado (ahora es ${withArticle(u.name)}): no hay nada que cancelar`, kind: 'info' };
    return { model: cancelUpgradeConfirmModel(u) };
  }
  if (u.state === 'busy') return { close: `La mejora de ${withArticle(u.name)} ya está en obras`, kind: 'info' };
  if (u.state !== 'ok') return { close: `${u.name}: ${u.reason ?? 'ya no se puede mejorar'}${u.hint ? `. ${u.hint}` : ''}`, kind: 'warn' };
  return { model: upgradeConfirmModel(u) };
}

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
  // Parada mientras arde: sin cuenta atrás (no baja) y con lo que hay que hacer para que siga.
  const state = u.paused ? ' y está parada mientras arde: si apagas el fuego, seguirá donde se quedó' : u.etaMin !== null ? ` y le faltan ${durationText(u.etaMin)}` : '';
  return {
    kind: 'cancelUpgrade',
    title: `¿Cancelar la mejora: ${u.nextName ?? ''}?`,
    glyph: 'trash',
    lines: [`La obra va por el ${p} %${state}. Si la cancelas, ${withArticle(u.name)} se queda en el nivel ${u.tier}.`],
    progress: u.progress ?? 0,
    progressTone: u.paused ? 'bad' : 'work',
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

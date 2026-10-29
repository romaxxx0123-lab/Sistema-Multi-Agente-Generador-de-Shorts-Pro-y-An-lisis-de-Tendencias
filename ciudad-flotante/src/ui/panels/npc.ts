/**
 * Panel de HABITANTE: retrato (aspecto real del personaje), nombre, rasgo, puesto con selector,
 * ánimo (y por qué), necesidades, qué hace ahora, frases de `sim.talkTo` y opciones: mediar,
 * curar, vendar, charlar y darle un objeto del inventario.
 */
import { ITEMS } from '../../data/items';
import { ROLES, TRAITS } from '../../data/names';
import { hash01 } from '../../render/ship/geo';
import { lookFromAppearance } from '../../render/ship/character';
import { isFemaleNpc, npcAdj, npcMoodFactors, npcRoleName, npcTraitName } from '../../sim/npc';
import type { NpcRole, NpcState } from '../../sim/types';
import type { UiEnv } from '../env';
import { signed } from '../fmt';
import { shade } from '../icons';
import { cx, h } from '../vdom';
import { bar, btn, chip, empty, gl, grid, section } from '../widgets';
import type { PanelView } from './index';

/** Misma semilla que usa NpcView para el aspecto (pelo, gorro). */
function seedOf(id: string): number {
  let hh = 0;
  for (let i = 0; i < id.length; i++) hh = (hh * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hh % 1000) + hash01(hh) * 0.001;
}

/** Retrato low-poly en SVG con los colores reales del habitante. */
export function portrait(npc: NpcState): string {
  const look = lookFromAppearance(npc.appearance, seedOf(npc.id));
  const skin = npc.sick ? shade(look.skin, 0.92) : look.skin;
  const mood = npc.needs.mood;
  const sleeping = npc.activity === 'sleeping';
  const O = '#1b2227';
  const S = `stroke="${O}" stroke-width="2.2" stroke-linejoin="round"`;
  const hair = look.hair;
  let hairBack = '';
  let hairTop = '';
  switch (look.hairStyle) {
    case 0:
      hairTop = `<path d="M33 40 L35 27 L50 21 L65 27 L67 40 L62 33 L38 33 Z" fill="${hair}" ${S}/>`;
      break;
    case 1:
      hairTop = `<path d="M34 37 L36 27 L50 22 L64 27 L66 37 L59 31 L41 31 Z" fill="${hair}" ${S}/>`;
      break;
    case 2:
      hairBack = `<path d="M31 36 L33 66 L40 68 L38 40 Z M69 36 L67 66 L60 68 L62 40 Z" fill="${shade(hair, 0.85)}" ${S}/>`;
      hairTop = `<path d="M32 42 L34 26 L50 20 L66 26 L68 42 L63 32 L50 30 L37 32 Z" fill="${hair}" ${S}/>`;
      break;
    default:
      hairBack = `<path d="M44 26 L56 26 L60 14 L50 10 L40 14 Z" fill="${shade(hair, 0.9)}" ${S}/>`;
      hairTop = `<path d="M33 39 L35 27 L50 22 L65 27 L67 39 L60 32 L40 32 Z" fill="${hair}" ${S}/>`;
  }
  let hat = '';
  if (look.hat === 'beanie') hat = `<path d="M33 34 C33 18 67 18 67 34 Z" fill="${look.hatColor}" ${S}/><rect x="32" y="31" width="36" height="6" rx="2" fill="${shade(look.hatColor, 0.8)}" ${S}/>`;
  else if (look.hat === 'cap') hat = `<path d="M34 33 C34 20 66 20 66 33 Z" fill="${look.hatColor}" ${S}/><path d="M34 32 L22 35 L34 36 Z" fill="${shade(look.hatColor, 0.8)}" ${S}/><rect x="33" y="30" width="34" height="4" rx="1.5" fill="#264653" ${S}/>`;
  const eyes = sleeping
    ? `<path d="M40 46 h6 M54 46 h6" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`
    : `<rect x="40.5" y="43" width="5" height="6" rx="1.5" fill="${O}"/><rect x="54.5" y="43" width="5" height="6" rx="1.5" fill="${O}"/>`;
  const mouth =
    mood >= 60
      ? `<path d="M43 56 Q50 62 57 56" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`
      : mood >= 35
        ? `<path d="M44 58 h12" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`
        : `<path d="M43 60 Q50 54 57 60" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`;
  const sick = npc.sick ? `<circle cx="61" cy="52" r="3" fill="#9dbf7a" opacity="0.8"/><circle cx="39" cy="52" r="3" fill="#9dbf7a" opacity="0.8"/>` : '';
  const bandage = npc.injured ? `<path d="M36 36 L64 40" stroke="#f8f9fa" stroke-width="5" stroke-linecap="round"/><path d="M48 37 l2 5" stroke="#e5604d" stroke-width="2"/>` : '';
  return (
    `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<defs><linearGradient id="pbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4e8"/><stop offset="1" stop-color="#2f6f86"/></linearGradient></defs>` +
    `<rect width="100" height="100" rx="14" fill="url(#pbg)"/>` +
    `<path d="M0 82 C20 78 30 86 50 82 C70 78 80 86 100 82 L100 100 L0 100 Z" fill="#1d5c74" opacity="0.6"/>` +
    hairBack +
    `<path d="M16 100 L20 80 C24 72 34 69 44 68 L56 68 C66 69 76 72 80 80 L84 100 Z" fill="${look.shirt}" ${S}/>` +
    `<path d="M44 68 L50 76 L56 68" fill="${shade(look.shirt, 0.8)}" ${S}/>` +
    `<rect x="44" y="58" width="12" height="12" fill="${shade(skin, 0.88)}" ${S}/>` +
    `<path d="M34 34 L66 34 L68 50 L62 62 L50 66 L38 62 L32 50 Z" fill="${skin}" ${S}/>` +
    `<path d="M31 44 L34 42 L34 50 Z M69 44 L66 42 L66 50 Z" fill="${shade(skin, 0.9)}" ${S}/>` +
    eyes +
    `<path d="M50 47 L48 54 L52 54" fill="none" stroke="${shade(skin, 0.6)}" stroke-width="1.8" stroke-linejoin="round"/>` +
    mouth +
    sick +
    hairTop +
    hat +
    bandage +
    `</svg>`
  );
}

const NEEDS = [
  { k: 'hunger', label: 'Hambre', glyph: 'hunger' },
  { k: 'thirst', label: 'Sed', glyph: 'thirst' },
  { k: 'energy', label: 'Energía', glyph: 'energy' },
  { k: 'health', label: 'Salud', glyph: 'health' },
] as const;

export function renderNpc(env: UiEnv, npcId: string): PanelView | null {
  const sim = env.ctx.sim;
  const npc = sim.state.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const talk = sim.talkTo(npc.id);
  if (!talk) return null;
  const trait = TRAITS[npc.trait];
  const away = npc.awayUntil !== null;
  const mood = npc.needs.mood;
  const moodGlyph = mood >= 60 ? 'smile' : mood >= 35 ? 'meh' : 'frown';
  const moodTone = mood >= 60 ? 'good' : mood >= 35 ? 'warn' : 'danger';
  let factors: { label: string; value: number }[] = [];
  try {
    factors = npcMoodFactors(sim, npc).filter((f) => f.label !== 'Ánimo de base');
  } catch {
    factors = [];
  }

  const card = h(
    'div',
    { class: 'npc-card' },
    h('div', { class: 'npc-portrait', html: portrait(npc) }),
    h('div', { class: 'npc-name' }, npc.name),
    h('div', { class: 'npc-trait', title: trait?.desc ?? '' }, npcTraitName(npc), trait ? h('small', { class: 'faint' }, ` · ${trait.desc}`) : null),
    h('div', { class: 'npc-chips' }, chip(npcRoleName(npc, npc.role), 'info', 'wrench'), npc.sick ? chip(npcAdj(npc, 'Enfermo'), 'warn', 'sick') : null, npc.injured ? chip(npcAdj(npc, 'Herido'), 'warn', 'medical') : null, away ? chip('De expedición', 'dim', 'ship') : null, !npc.bed ? chip('Sin cama', 'warn', 'bed') : null),
    h('div', { class: cx('npc-mood', `tone-${moodTone}`) }, h('div', { class: 'mood-head' }, gl(moodGlyph), h('span', null, 'Ánimo'), h('b', null, String(Math.round(mood)))), bar(mood / 100, `var(--${moodTone})`)),
    h(
      'div',
      { class: 'npc-needs' },
      NEEDS.map((d) => {
        const v = Math.max(0, Math.min(100, (npc.needs as unknown as Record<string, number>)[d.k] ?? 0));
        return h('div', { key: d.k, class: cx('nt-row', 'compact', v < 30 && 'low') }, gl(d.glyph, 'gl need-ico'), h('span', { class: 'nt-label' }, d.label), bar(v / 100, `var(--${d.k})`), h('span', { class: 'nt-val' }, String(Math.round(v))));
      }),
    ),
  );

  const status = h('div', { class: 'npc-doing' }, gl('eye'), h('span', null, 'Ahora: '), h('b', null, sim.npcStatus(npc.id) || '—'));
  const lines = h(
    'div',
    { class: 'talk' },
    talk.lines.map((l, i) => h('div', { key: `${i}-${l.length}`, class: cx('bubble', i === 0 && 'first') }, l)),
  );

  const opts = talk.options.filter((o) => !o.id.startsWith('rol:'));
  const OPT_GLYPH: Record<string, string> = { mediar: 'chat', curar: 'medical', vendar: 'health', charlar: 'smile', dar: 'hand' };
  const actions = h(
    'div',
    { class: 'npc-actions' },
    opts.map((o) =>
      btn(
        o.label,
        () => {
          if (o.id === 'dar') {
            env.ps.giving = !env.ps.giving;
            env.refresh();
            return;
          }
          env.act(sim.npcOption(npc.id, o.id), 'good');
        },
        { key: o.id, disabled: !o.enabled, primary: o.id === 'mediar' || (o.id === 'curar' && o.enabled), glyph: OPT_GLYPH[o.id] ?? 'chat', cls: o.id === 'dar' && env.ps.giving ? 'active' : undefined },
      ),
    ),
  );

  const giving = env.ps.giving && !away
    ? section(
        'Darle un objeto',
        h('div', { class: 'faint small' }, 'Clic en un objeto: si es comida, bebida o medicina y lo necesita, lo usa; lo demás lo guarda en el almacén.'),
        grid(env, { kind: 'player' }, 8, (i, s) => ({
          noDrag: true,
          hints: s ? [`Clic: dárselo a ${npc.name}`] : [],
          onClick: () => {
            if (!s) return;
            env.act(sim.giveItemToNpc(npc.id, i), 'good');
          },
          dim: !!s && !['comida', 'bebida', 'medicina'].includes(ITEMS[s.id]?.category ?? ''),
        })),
      )
    : null;

  const roles = section(
    'Puesto de trabajo',
    h(
      'div',
      { class: 'role-grid' },
      (Object.keys(ROLES) as NpcRole[]).map((r) =>
        h(
          'button',
          {
            key: r,
            type: 'button',
            class: cx('role', npc.role === r && 'active'),
            title: ROLES[r].desc,
            disabled: away,
            onclick: () => {
              if (npc.role !== r) env.act(sim.setNpcRole(npc.id, r), 'good');
            },
          },
          h('b', null, npcRoleName(npc, r)),
          h('small', null, ROLES[r].desc),
        ),
      ),
    ),
  );

  const why = factors.length
    ? section(
        '¿Cómo se siente?',
        h(
          'ul',
          { class: 'mini-list mood-factors' },
          factors.map((f, i) => h('li', { key: i }, h('span', { class: 'ml-name' }, f.label), h('span', { class: cx('ml-val', f.value > 0 ? 'good' : 'danger') }, signed(f.value)))),
        ),
      )
    : null;

  return {
    title: npc.name,
    subtitle: `${npcRoleName(npc, npc.role)} · a bordo desde el día ${npc.joinedDay}`,
    glyph: 'person',
    body: h('div', { class: 'npc-layout' }, card, h('div', { class: 'npc-main scroll' }, status, lines, away ? empty(`Está fuera del barco. Podrás hablar con ${isFemaleNpc(npc) ? 'ella' : 'él'} cuando vuelva.`, 'ship') : actions, giving, roles, why)),
    cls: 'pn-wide',
  };
}


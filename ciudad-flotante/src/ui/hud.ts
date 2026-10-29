/**
 * HUD discreto durante el juego:
 *  - necesidades compactas abajo a la izquierda (se destacan al bajar) y estados del jugador;
 *  - reloj, clima, región con progreso y fondeo arriba a la izquierda;
 *  - tarjetas de eventos activos con objetivos arriba a la derecha (máx. 2);
 *  - punto de mira y aviso de interacción (tecla, texto, subtexto, anillo de progreso, alternativa);
 *  - barra rápida de 8 ranuras con la prenda equipada;
 *  - "+3 Madera", avisos (toasts), banner de plano aprendido y de nuevo día, FPS;
 *  - viñeta roja al perder salud, escarcha con frío y capa de sueño.
 */
import type { NotifyKind } from '../core/EventBus';
import { ITEMS } from '../data/items';
import { MODULE_LIST } from '../data/modules';
import { RECIPE_LIST } from '../data/recipes';
import type { GameContext } from '../game/context';
import type { PromptInfo } from '../game/types';
import { eventStatusText } from '../sim/events';
import { healthRatePerHour, playerConditions, warmthEnvironment, type PlayerCondition } from '../sim/needs';
import { clockText, dayOf, isNight } from '../sim/time';
import { currentRegion, isAnchored, milesToRegionEnd } from '../sim/voyage';
import { barometer, weatherName } from '../sim/weather';
import { currentTutorial, tutorialProgress, type TutorialStep } from '../sim/tutorial';
import { blueprintShort, duration, itemName, num } from './fmt';
import { EVENT_GLYPH, WEATHER_GLYPH } from './icons';
import { eventTone, sortedEvents } from './model';
import { cx, h, patch, type VNode } from './vdom';
import { gl, icon, kbd, richKeys } from './widgets';

type Toast = ToastEntry;

interface FeedEntry {
  id: number;
  item: string;
  qty: number;
  born: number;
}

interface Banner {
  kind: 'unlock' | 'day';
  title: string;
  name: string;
  text: string;
  itemId: string | null;
  born: number;
  ttl: number;
}

const NEEDS = [
  { k: 'health', label: 'Salud', glyph: 'health', low: 35, crit: 20 },
  { k: 'hunger', label: 'Hambre', glyph: 'hunger', low: 30, crit: 12 },
  { k: 'thirst', label: 'Sed', glyph: 'thirst', low: 30, crit: 12 },
  { k: 'energy', label: 'Energía', glyph: 'energy', low: 25, crit: 10 },
  { k: 'warmth', label: 'Calor', glyph: 'warmth', low: 35, crit: 20 },
] as const;

const TOAST_TTL: Record<NotifyKind, number> = { info: 4.5, good: 4.5, warn: 6.5, danger: 8 };
/** Avisos visibles a la vez (los más viejos y menos graves ceden el sitio). */
export const MAX_TOASTS = 3;
const TOAST_RANK: Record<NotifyKind, number> = { info: 0, good: 0, warn: 1, danger: 2 };

/** Forma de un aviso sin cifras: "Bebes agua (quedan 56 L)" y "(quedan 55 L)" se agrupan. */
export function toastShape(text: string): string {
  return text.replace(/\d+(?:[.,]\d+)?/g, '#').trim();
}

/** Aviso en pantalla (estado puro de la cola; el HUD lo pinta). */
export interface ToastEntry {
  id: number;
  text: string;
  kind: NotifyKind;
  born: number;
  ttl: number;
  count: number;
}

/**
 * Añade un aviso a la cola: si hay uno vivo con la misma forma y tono, lo actualiza en vez de
 * apilar otro (el mismo texto suma un contador ×N; si solo cambian las cifras, se queda el texto
 * más reciente sin contador, porque «Echas 5× Madera ×2» parecería 10); si pasan de `max`, se
 * quita el más viejo de los menos graves (un peligro no lo desplaza una ráfaga de avisos).
 */
export function pushToast(list: ToastEntry[], t: Omit<ToastEntry, 'count'>, max = MAX_TOASTS): ToastEntry[] {
  const shape = toastShape(t.text);
  const same = list.find((x) => x.kind === t.kind && toastShape(x.text) === shape && t.born - x.born < x.ttl);
  if (same) {
    same.count = same.text === t.text ? same.count + 1 : 1;
    same.text = t.text;
    same.born = t.born;
    same.ttl = t.ttl;
    // El agrupado pasa al final (es el más reciente).
    return [...list.filter((x) => x !== same), same];
  }
  const out = [...list, { ...t, count: 1 }];
  while (out.length > max) {
    let drop = 0;
    for (let i = 1; i < out.length; i++) if (TOAST_RANK[out[i]!.kind] < TOAST_RANK[out[drop]!.kind]) drop = i;
    out.splice(drop, 1);
  }
  return out;
}

export class Hud {
  readonly el: HTMLElement;
  private time = 0;
  private nextId = 1;
  private toasts: Toast[] = [];
  private feed: FeedEntry[] = [];
  private banners: Banner[] = [];
  private prompt: PromptInfo | null = null;
  private hotbarFlash = { key: '', born: -10 };
  private prevHealth: number | null = null;
  private flash = 0;
  private fps = 60;
  private slowAt = -1;
  private conds: PlayerCondition[] = [];
  private healthRate = 0;
  private warmthTarget = 50;
  private eventBorn = new Map<number, number>();
  /** Opacidades suavizadas de la viñeta de daño y de la escarcha. */
  private fxDamage = 0;
  private fxFrost = 0;
  private tutShown: TutorialStep | null = null;
  private tutDoneAt = -10;
  /** Se llama al pulsar el botón de descartar el tutorial. */
  onDismissTutorial: () => void = () => {};

  constructor(
    layer: HTMLElement,
    private readonly ctx: GameContext,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    layer.appendChild(this.el);
  }

  /* ---------------- Entradas ---------------- */

  setPrompt(p: PromptInfo | null): void {
    this.prompt = p;
  }

  toast(text: string, kind: NotifyKind): void {
    const t = text.trim();
    if (!t) return;
    this.toasts = pushToast(this.toasts, { id: this.nextId++, text: t, kind, born: this.time, ttl: TOAST_TTL[kind] ?? 5 });
  }

  itemGained(id: string, qty: number): void {
    const recent = this.feed.find((f) => f.item === id && this.time - f.born < 2);
    if (recent) {
      recent.qty += qty;
      recent.born = this.time;
      return;
    }
    this.feed.push({ id: this.nextId++, item: id, qty, born: this.time });
    while (this.feed.length > 5) this.feed.shift();
  }

  unlocked(key: string, name: string): void {
    const mods = MODULE_LIST.filter((m) => m.unlock === key).map((m) => m.name);
    const recs = RECIPE_LIST.filter((r) => r.unlock === key).map((r) => r.name);
    const parts: string[] = [];
    if (mods.length) parts.push(`Nuevo en construcción (B): ${mods.join(', ')}`);
    if (recs.length) parts.push(`Nuevas recetas: ${recs.join(', ')}`);
    if (key === 'casco') parts.push('Ya puedes ampliar el casco desde el modo construcción (B)');
    if (key === 'invernadero') parts.push('Los huertos de interior tendrán lámparas de cultivo');
    const item = Object.values(ITEMS).find((d) => d.unlocks === key);
    this.banners.push({ kind: 'unlock', title: '¡Plano aprendido!', name: blueprintShort(name), text: parts.join(' · '), itemId: item?.id ?? null, born: this.time, ttl: 6 });
  }

  newDay(day: number): void {
    const region = currentRegion(this.ctx.sim).name;
    this.banners.push({ kind: 'day', title: `Día ${day}`, name: region, text: '', itemId: null, born: this.time, ttl: 4 });
  }

  eventStarted(id: number): void {
    this.eventBorn.set(id, this.time);
  }

  tutorialDone(): void {
    if (this.tutShown) this.tutDoneAt = this.time;
  }

  /** Quita los avisos en pantalla (al morir, por ejemplo). */
  clearToasts(): void {
    this.toasts = [];
  }

  reset(): void {
    this.feed = [];
    this.banners = [];
    this.prompt = null;
    this.prevHealth = null;
    this.flash = 0;
    this.eventBorn.clear();
    this.tutShown = null;
    this.tutDoneAt = -10;
    this.slowAt = -1;
  }

  /* ---------------- Bucle ---------------- */

  update(dt: number, opts: { panelOpen: boolean; menuOpen: boolean }): void {
    this.time += dt;
    if (dt > 0) this.fps += (1 / dt - this.fps) * Math.min(1, dt * 2);
    const now = this.time;
    this.toasts = this.toasts.filter((t) => now - t.born < t.ttl);
    this.feed = this.feed.filter((f) => now - f.born < 3.4);
    while (this.banners.length && now - this.banners[0]!.born > this.banners[0]!.ttl) {
      this.banners.shift();
      if (this.banners[0]) this.banners[0].born = now;
    }

    const sim = this.ctx.sim;
    const st = sim.state;
    const p = st.player;
    // Valores más caros: 5 veces por segundo.
    if (now - this.slowAt > 0.2 || this.slowAt < 0) {
      this.slowAt = now;
      try {
        this.conds = playerConditions(sim).filter((c) => c.id !== 'durmiendo' && c.id !== 'inconsciente');
        this.healthRate = healthRatePerHour(sim);
        this.warmthTarget = warmthEnvironment(sim).target;
      } catch {
        this.conds = [];
      }
    }
    // Daño: destello si la salud cae de golpe.
    const hp = p.needs.health;
    if (this.prevHealth !== null && p.alive) {
      const drop = this.prevHealth - hp;
      if (drop > 0.6) this.flash = Math.min(1, this.flash + drop / 12);
    }
    this.prevHealth = hp;
    this.flash = Math.max(0, this.flash - dt * 1.4);
    // Efectos de pantalla: objetivo según el estado y suavizado exponencial.
    const n = p.needs;
    const low = Math.max(0, Math.min(1, (35 - n.health) / 35));
    const losing = p.alive && this.healthRate < -0.5 ? 0.22 + Math.min(0.25, -this.healthRate / 40) : 0;
    const pulse = low > 0.4 ? 0.12 * Math.sin(now * 4) : 0;
    const dmgTarget = p.alive ? Math.max(low * 0.75 + pulse, losing, this.flash) : 0;
    const frostTarget = p.alive ? Math.max(0, Math.min(1, (38 - n.warmth) / 38)) * 0.95 : 0;
    const k = 1 - Math.exp(-dt * 6);
    this.fxDamage += (dmgTarget - this.fxDamage) * (dmgTarget > this.fxDamage ? Math.max(k, 0.5) : k);
    this.fxFrost += (frostTarget - this.fxFrost) * (1 - Math.exp(-dt * 2));

    // Nombre del objeto de la barra rápida al cambiar de selección.
    const sel = p.inventory.slots[p.hotbar];
    const hk = `${p.hotbar}:${sel?.id ?? ''}`;
    if (hk !== this.hotbarFlash.key) this.hotbarFlash = { key: hk, born: now };

    // Clase del modo de juego (para que el modo construcción u otras capas puedan adaptar el HUD).
    const cls = `hud mode-${this.ctx.mode}${opts.panelOpen ? ' with-panel' : ''}`;
    if (this.el.className !== cls) this.el.className = cls;
    patch(this.el, this.render(opts));
  }

  /* ---------------- Pintado ---------------- */

  private render(opts: { panelOpen: boolean; menuOpen: boolean }): VNode[] {
    const ctx = this.ctx;
    const mode = ctx.mode;
    const st = ctx.sim.state;
    const p = st.player;
    const playing = mode === 'play' || mode === 'build';
    const sleeping = !!p.sleeping && p.alive;
    const out: VNode[] = [];
    if (playing && p.alive) {
      out.push(this.fx());
      // La capa de sueño va debajo del resto del HUD: reloj y necesidades siguen legibles.
      if (sleeping) out.push(this.sleep());
      out.push(this.topLeft(mode === 'play' && !sleeping ? this.tutorial(opts.panelOpen) : null));
      out.push(this.needs());
      if (mode === 'play' && !sleeping) {
        if (!opts.panelOpen) out.push(this.crosshair(), this.promptNode());
        if (!opts.panelOpen) out.push(this.hotbar());
        out.push(this.events());
      }
      out.push(this.feedNode());
      out.push(this.banner());
    }
    if (ctx.settings.showFps) out.push(h('div', { key: 'fps', class: 'hud-fps' }, `${Math.round(this.fps)} FPS`));
    out.push(this.toastsNode(opts.panelOpen));
    return out;
  }

  private fx(): VNode {
    return h(
      'div',
      { key: 'fx', class: 'hud-fx' },
      h('div', { class: 'fx-damage', style: { opacity: this.fxDamage.toFixed(3) } }),
      h('div', { class: 'fx-frost', style: { opacity: this.fxFrost.toFixed(3) } }),
    );
  }

  private topLeft(tutorial: VNode | null): VNode {
    const sim = this.ctx.sim;
    const st = sim.state;
    const w = st.weather;
    const v = st.voyage;
    const region = currentRegion(sim);
    const night = isNight(st.time);
    const prog = v.regionLength > 0 ? v.regionDistance / v.regionLength : 0;
    const baro = barometer(sim);
    const anchored = isAnchored(sim);
    const needRoute = !!v.nextChoices && v.nextChoices.length > 1 && !v.chosenNext;
    const fast = !!st.player.sleeping;
    return h(
      'div',
      { key: 'tl', class: 'hud-tl' },
      h(
        'div',
        { class: 'tl-clock' },
        gl(night ? 'moon' : 'sun', cx('gl', night ? 'moon' : 'sunny')),
        h('b', null, `Día ${dayOf(st.time)}`),
        h('span', { class: 'sep' }, '·'),
        h('span', { class: 'time' }, clockText(st.time)),
        fast ? h('span', { class: 'fast' }, '×14') : null,
      ),
      h(
        'div',
        { class: 'tl-weather' },
        gl(WEATHER_GLYPH[w.kind] ?? 'cloud'),
        h('span', null, weatherName(w.kind)),
        h('span', { class: 'sep' }, '·'),
        h('span', null, `${Math.round(w.temperature)} °C`),
        baro.trend === 'baja' && baro.next === 'tormenta' ? h('span', { class: 'tl-warn', title: 'Barómetro' }, gl('alert'), 'Tormenta en camino') : null,
      ),
      h(
        'div',
        { class: 'tl-region' },
        h('div', { class: 'tl-region-row' }, gl('compass'), h('span', { class: 'rname' }, region.name), h('span', { class: 'rmiles' }, `${num(milesToRegionEnd(sim), 0)} mi`)),
        h('div', { class: 'tl-prog' }, h('i', { style: { width: `${Math.round(Math.min(1, prog) * 1000) / 10}%` } })),
      ),
      anchored
        ? h('div', { class: 'tl-chip' }, gl('anchor'), `Fondeados${v.anchorReason ? `: ${v.anchorReason}` : ''}`, h('span', { class: 'dim' }, ` · ${duration((v.anchoredUntil ?? st.time) - st.time)}`))
        : null,
      needRoute ? h('div', { class: 'tl-chip warn' }, gl('helm'), 'Elige rumbo en el timón') : null,
      tutorial,
    );
  }

  private needs(): VNode {
    const p = this.ctx.sim.state.player;
    const n = p.needs as unknown as Record<string, number>;
    const rows = NEEDS.map((d) => {
      const val = Math.max(0, Math.min(100, n[d.k] ?? 0));
      const crit = val < d.crit;
      const low = val < d.low;
      let trend: string | null = null;
      if (d.k === 'health') trend = this.healthRate > 0.3 && val < 99.5 ? 'up' : this.healthRate < -0.3 ? 'down' : null;
      if (d.k === 'warmth') trend = this.warmthTarget > val + 4 ? 'up' : this.warmthTarget < val - 4 ? 'down' : null;
      return h(
        'div',
        { key: d.k, class: cx('need', `n-${d.k}`, low && 'low', crit && 'crit'), title: d.label },
        gl(d.glyph, 'gl need-ico'),
        h('div', { class: 'need-bar' }, h('i', { style: { width: `${val.toFixed(1)}%` } })),
        h('span', { class: 'need-val' }, low ? `${d.label} ${Math.round(val)}` : String(Math.round(val))),
        trend ? h('span', { class: cx('need-trend', trend) }, trend === 'up' ? '▲' : '▼') : null,
      );
    });
    const list = this.conds.slice(0, 4).map((c) => h('span', { key: c.id, class: `cond cond-${c.kind}` }, c.label));
    // Con el inventario lleno, lo que se consiga cae en cajas a los pies: conviene saberlo.
    if (p.inventory.slots.every((sl) => !!sl)) list.push(h('span', { key: 'lleno', class: 'cond cond-warn', title: 'Lo que consigas irá a una caja a tus pies' }, 'Inventario lleno'));
    return h('div', { key: 'needs', class: 'hud-needs' }, list.length ? h('div', { class: 'conds' }, list) : null, h('div', { class: 'need-list' }, rows));
  }

  private crosshair(): VNode {
    const has = !!this.prompt && !this.prompt.disabled;
    return h('div', { key: 'xh', class: cx('hud-cross', has && 'focus') }, h('i'));
  }

  private promptNode(): VNode {
    const p = this.prompt;
    if (!p || (!p.text && !p.key)) return h('div', { key: 'pr', class: 'hud-prompt hidden' });
    const prog = p.progress;
    // "Mantén E" → texto "Mantén" + tecla "E" (el anillo de progreso rodea solo la tecla).
    const m = /^(Mantén|Pulsa|Mantener)\s+(.+)$/i.exec(p.key);
    const hold = m ? m[1]! : null;
    const cap = m ? m[2]! : p.key;
    const short = cap.length <= 3;
    const ring =
      prog !== undefined && short
        ? h(
            'svg',
            { class: 'pr-ring', viewBox: '0 0 40 40' },
            h('circle', { cx: 20, cy: 20, r: 17, class: 'bg' }),
            h('circle', { cx: 20, cy: 20, r: 17, class: 'fg', 'stroke-dasharray': '106.8', 'stroke-dashoffset': ((1 - Math.max(0, Math.min(1, prog))) * 106.8).toFixed(1) }),
          )
        : null;
    return h(
      'div',
      { key: 'pr', class: cx('hud-prompt', p.disabled && 'disabled') },
      h(
        'div',
        { class: 'pr-main' },
        hold ? h('span', { class: 'pr-hold' }, hold) : null,
        cap ? h('span', { class: cx('pr-key', ring && 'ringed') }, ring, kbd(cap)) : null,
        h('span', { class: 'pr-text' }, p.text),
      ),
      prog !== undefined && !short ? h('div', { class: 'pr-bar' }, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, prog)) * 100)}%` } })) : null,
      p.sub ? h('div', { class: 'pr-sub' }, p.sub) : null,
      p.alt ? h('div', { class: cx('pr-alt', p.alt.disabled && 'disabled') }, kbd(p.alt.key), h('span', null, p.alt.text)) : null,
    );
  }

  private hotbar(): VNode {
    const p = this.ctx.sim.state.player;
    const slots = p.inventory.slots.slice(0, 8);
    const sel = p.inventory.slots[p.hotbar];
    const age = this.time - this.hotbarFlash.born;
    return h(
      'div',
      { key: 'hb', class: 'hud-hotbar' },
      h('div', { class: cx('hb-name', age < 2.2 && sel && 'show') }, sel ? itemName(sel.id) : ''),
      h(
        'div',
        { class: 'hb-row' },
        slots.map((s, i) =>
          h(
            'div',
            { key: i, class: cx('slot', 'hb-slot', i === p.hotbar && 'sel', !s && 'empty') },
            h('span', { class: 'hk' }, String(i + 1)),
            s ? icon(s.id) : null,
            s && s.qty > 1 ? h('span', { class: 'qty' }, String(s.qty)) : null,
          ),
        ),
        h('div', { class: 'hb-sep' }),
        h(
          'div',
          { key: 'cloth', class: cx('slot', 'hb-slot', 'hb-cloth', !p.clothing && 'empty'), title: p.clothing ? itemName(p.clothing) : 'Sin abrigo' },
          p.clothing ? icon(p.clothing) : gl('shirt', 'gl ph'),
        ),
      ),
    );
  }

  private events(): VNode {
    const sim = this.ctx.sim;
    const evs = sortedEvents(sim.state.events.active);
    const shown = evs.slice(0, 2);
    return h(
      'div',
      { key: 'ev', class: 'hud-events' },
      shown.map((ev) => {
        const tone = eventTone(ev.type);
        const born = this.eventBorn.get(ev.id);
        const fresh = born !== undefined && this.time - born < 2.5;
        const objs = ev.objectives.slice(0, 4);
        const hint = ev.choices.length ? (ev.type === 'mercante' ? 'Comercia desde el timón del puente' : 'Decide en el timón del puente') : null;
        return h(
          'div',
          { key: ev.id, class: cx('ev-card', `tone-${tone}`, fresh && 'fresh') },
          h('div', { class: 'ev-head' }, gl(EVENT_GLYPH[ev.type] ?? 'alert', 'gl ev-ico'), h('b', null, ev.title), h('span', { class: 'ev-time' }, eventStatusText(sim, ev))),
          objs.length
            ? h(
                'ul',
                { class: 'ev-objs' },
                objs.map((o, i) => h('li', { key: i, class: o.done ? 'done' : '' }, h('span', { class: 'ev-check' }, o.done ? '✓' : ''), o.text)),
              )
            : null,
          hint ? h('div', { class: 'ev-hint' }, gl('helm'), hint) : null,
        );
      }),
      evs.length > 2 ? h('div', { key: 'more', class: 'ev-more' }, `+${evs.length - 2} más · `, kbd('J'), ' Diario') : null,
    );
  }

  private tutorial(panelOpen: boolean): VNode {
    const ctx = this.ctx;
    let step: TutorialStep | null = null;
    if (ctx.settings.tutorial) {
      try {
        step = currentTutorial(ctx.sim);
      } catch {
        step = null;
      }
    }
    const doneAge = this.time - this.tutDoneAt;
    if (!step && this.tutShown && doneAge < 1.8) {
      // Animación de "¡Hecho!" del paso que se acaba de completar.
      const s = this.tutShown;
      return h('div', { key: 'tut', class: cx('hud-tut', 'done', panelOpen && 'under') }, h('div', { class: 'tut-head' }, gl('check'), h('b', null, s.title), h('span', { class: 'tut-n' }, '¡Hecho!')), h('div', { class: 'tut-text' }, richKeys(s.text)));
    }
    if (step) this.tutShown = step;
    if (!step) return h('div', { key: 'tut', class: 'hud-tut hidden' });
    const prog = tutorialProgress(ctx.sim);
    return h(
      'div',
      { key: 'tut', class: cx('hud-tut', panelOpen && 'under', step.urgent && 'urgent') },
      h(
        'div',
        { class: 'tut-head' },
        gl(step.urgent ? 'alert' : 'star'),
        h('b', null, step.title),
        step.urgent ? h('span', { class: 'tut-now', title: 'Este consejo es oportuno ahora' }, 'Ahora') : null,
        h('span', { class: 'tut-n', title: `Consejos aprendidos: ${prog.done} de ${prog.total}` }, `${prog.done}/${prog.total}`),
        h('span', { class: 'tut-hide', title: 'F1 oculta o muestra los consejos' }, kbd('F1')),
        h(
          'button',
          {
            class: 'tut-x interactive',
            type: 'button',
            title: 'Ocultar los consejos (F1; se pueden reactivar en el Diario o en Ajustes)',
            onclick: (e: MouseEvent) => {
              e.stopPropagation();
              this.onDismissTutorial();
            },
          },
          gl('close'),
        ),
      ),
      h('div', { class: 'tut-text' }, richKeys(step.text)),
    );
  }

  private sleep(): VNode {
    const st = this.ctx.sim.state;
    const s = st.player.sleeping!;
    const fainted = s.until !== null && st.time < s.until;
    const e = st.player.needs.energy;
    return h(
      'div',
      { key: 'sleep', class: 'hud-sleep' },
      h(
        'div',
        { class: 'sl-box' },
        gl('moon', 'gl sl-moon'),
        h('div', { class: 'sl-title' }, fainted ? 'Desmayado…' : 'Durmiendo…'),
        h('div', { class: 'sl-clock' }, `Día ${dayOf(st.time)} · ${clockText(st.time)}`),
        h('div', { class: 'sl-energy' }, gl('energy'), h('div', { class: 'need-bar' }, h('i', { style: { width: `${e.toFixed(1)}%` } })), h('span', null, `${Math.round(e)} %`)),
        h('div', { class: 'sl-hint' }, fainted ? 'Recuperando fuerzas: no puedes levantarte todavía' : [kbd('E'), ' para despertar']),
      ),
    );
  }

  private feedNode(): VNode {
    return h(
      'div',
      { key: 'feed', class: 'hud-feed' },
      this.feed.map((f) => {
        const age = this.time - f.born;
        return h('div', { key: f.id, class: cx('feed-row', age > 2.8 && 'out') }, icon(f.item, 'ico ico-sm'), h('b', null, `+${f.qty}`), h('span', null, itemName(f.item)));
      }),
    );
  }

  private banner(): VNode {
    const b = this.banners[0];
    if (!b) return h('div', { key: 'bn', class: 'hud-banner hidden' });
    const age = this.time - b.born;
    const out = age > b.ttl - 0.6;
    if (b.kind === 'day') {
      return h('div', { key: 'bn', class: cx('hud-banner', 'day', out && 'out') }, h('div', { class: 'bn-title' }, b.title), h('div', { class: 'bn-name' }, b.name));
    }
    return h(
      'div',
      { key: 'bn', class: cx('hud-banner', 'unlock', out && 'out') },
      b.itemId ? icon(b.itemId, 'ico bn-ico') : null,
      h('div', null, h('div', { class: 'bn-title' }, b.title), h('div', { class: 'bn-name' }, b.name), b.text ? h('div', { class: 'bn-text' }, b.text) : null),
    );
  }

  private toastsNode(compact: boolean): VNode {
    const glyphs: Record<NotifyKind, string> = { info: 'info', good: 'check', warn: 'alert', danger: 'alert' };
    // Con un panel abierto, solo el aviso más reciente y en una línea (no tapa las pestañas).
    const list = compact ? this.toasts.slice(-1) : this.toasts;
    return h(
      'div',
      { key: 'toasts', class: cx('hud-toasts', compact && 'compact'), role: 'status', 'aria-live': 'polite' },
      list.map((t) => {
        const age = this.time - t.born;
        return h(
          'div',
          { key: t.id, class: cx('toast', `t-${t.kind}`, age > t.ttl - 0.45 && 'out') },
          gl(glyphs[t.kind] ?? 'info'),
          h('span', null, t.text),
          t.count > 1 ? h('span', { class: 'toast-n' }, `×${t.count}`) : null,
        );
      }),
    );
  }
}

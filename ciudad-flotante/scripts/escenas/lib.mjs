/**
 * Ayudas para escenas de juego automatizado con Playwright (scripts/shot.mjs --script).
 * Juegan con teclado y ratón reales; leen el estado con window.__game.
 */
import { mkdirSync } from 'node:fs';
export let OUT = 'test-output/escenas/';
/** Carpeta de capturas de la escena actual. */
export function setOut(dir) {
  OUT = dir.endsWith('/') ? dir : dir + '/';
}
const T0 = Date.now();
const el = () => ((Date.now() - T0) / 1000).toFixed(0) + 's';

// Funciones auxiliares instaladas en la página (no tocan el juego: solo leen estado y usan cmd.mouse/cmd.step).
export async function install(page) {
  await page.evaluate(() => {
    const g = () => window.__game;
    const sens = () => g().ctx.settings.sensitivity / 1000;
    const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const R = g().ctx.renderer;
    if (!R.__qaOrig) { R.__qaOrig = R.render.bind(R); R.render = (cam) => { if (window.__qaRender) R.__qaOrig(cam); }; }
    window.__qaRender = false;
    window.__qa = {
      // Gira con deltas de ratón hacia un punto (mismo camino que el ratón real).
      aim(x, y, z) {
        const p = g().state.player, e = g().ctx.player.eye();
        const dx = x - e.x, dy = y - e.y, dz = z - e.z;
        const yawT = Math.atan2(-dx, -dz), pitchT = Math.atan2(dy, Math.hypot(dx, dz));
        g().cmd.mouse(-wrap(yawT - p.yaw) / sens(), -(pitchT - p.pitch) / sens());
        g().cmd.step(1);
      },
      aimYaw(x, z, pitch = -0.1) {
        const p = g().state.player;
        const yawT = Math.atan2(-(x - p.pos.x), -(z - p.pos.z));
        g().cmd.mouse(-wrap(yawT - p.yaw) / sens(), -(pitch - p.pitch) / sens());
      },
      // Sigue una ruta (con W pulsada desde fuera). Devuelve info.
      follow(tx, ty, tz, tol = 0.6, maxFrames = 2400) {
        const sim = g().sim, p = g().state.player;
        const path = sim.nav.findPath({ ...p.pos }, { x: tx, y: ty, z: tz }) ?? [{ x: tx, y: ty, z: tz }];
        const pts = path.concat([{ x: tx, y: ty, z: tz }]);
        let i = 0, frames = 0, stuck = 0, last = { ...p.pos };
        while (frames < maxFrames) {
          while (i < pts.length - 1 && Math.hypot(pts[i].x - p.pos.x, pts[i].z - p.pos.z) < 0.7) i++;
          const w = pts[i];
          const d = Math.hypot(w.x - p.pos.x, w.z - p.pos.z);
          if (i === pts.length - 1 && d < tol) break;
          this.aimYaw(w.x, w.z);
          g().cmd.step(1);
          frames++;
          if (frames % 30 === 0) {
            if (Math.hypot(p.pos.x - last.x, p.pos.z - last.z) < 0.05) { stuck++; if (stuck > 3) break; } else stuck = 0;
            last = { ...p.pos };
          }
          if (g().ctx.ui.panelOpen || p.sleeping) break;
        }
        const dEnd = Math.hypot(tx - p.pos.x, tz - p.pos.z);
        return { ok: dEnd < tol + 0.4 && Math.abs(ty - p.pos.y) < 1.2, frames, pos: [p.pos.x, p.pos.y, p.pos.z].map((v) => +v.toFixed(2)), wp: pts.length, stuck };
      },
      stepUntil(fnSrc, maxFrames = 600, dt = 1 / 60) {
        const fn = new Function('g', 'return (' + fnSrc + ')');
        let f = 0;
        while (f < maxFrames) { if (fn(g())) return { ok: true, f }; g().cmd.step(1, dt); f++; }
        return { ok: !!fn(g()), f };
      },
      propStand(key) {
        const pr = g().sim.layout.props.find((q) => q.key === key);
        if (!pr) return null;
        const sp = g().sim.nav.standPoint(pr);
        return { stand: sp, prop: { x: pr.x, y: pr.y, z: pr.z } };
      },
    };
  });
}

export async function dump(page, extra = '') {
  return page.evaluate((extra) => {
    const g = window.__game, st = g.state, p = st.player;
    const j = g.cmd.jugador();
    const tut = document.querySelector('.hud-tut:not(.hidden)');
    const pr = document.querySelector('.hud-prompt:not(.hidden)');
    const toasts = [...document.querySelectorAll('.hud-toasts .toast')].map((t) => t.textContent);
    const hot = p.inventory.slots.slice(0, 8).map((s) => (s ? `${s.id}x${s.qty}` : '-'));
    const mm = Math.floor(st.time % 1440);
    return {
      mode: g.ctx.mode, panel: g.ctx.ui.panelOpen, time: `${Math.floor(st.time / 1440) + 1}d ${String(Math.floor(mm / 60)).padStart(2, '0')}:${String(Math.floor(mm % 60)).padStart(2, '0')}`,
      pos: [p.pos.x.toFixed(2), p.pos.y.toFixed(2), p.pos.z.toFixed(2)].join(','), yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2),
      needs: Object.fromEntries(Object.entries(p.needs).map(([k, v]) => [k, Math.round(v)])), sick: p.sick, sleeping: !!p.sleeping,
      hotbar: p.hotbar, hot, inv: p.inventory.slots.slice(8).filter(Boolean).map((s) => `${s.id}x${s.qty}`),
      tut: tut ? tut.textContent : null, rtoasts: j.toasts.slice(-3), tutDone: st.tutorial.done.join(','), prompt: pr ? pr.textContent : null, toasts, focus: j.focus, tools: j.tools, hand: j.hand + (j.handVisible ? '' : '(oculta)'),
      debris: st.debris.length, events: st.events.active.map((e) => e.type), extra: extra ? eval(extra) : undefined,
    };
  }, extra);
}
export async function log(page, label, extra) {
  const d = await dump(page, extra);
  console.log(`== [${el()}] ${label}: ` + JSON.stringify(d));
  return d;
}
export async function goTo(page, h, x, y, z, { run = false, tol = 0.6, label = '' } = {}) {
  if (run) await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  const r = await page.evaluate(([x, y, z, tol]) => window.__qa.follow(x, y, z, tol), [x, y, z, tol]);
  await page.keyboard.up('KeyW');
  if (run) await page.keyboard.up('ShiftLeft');
  await h.step(6);
  console.log(`[${el()}] goTo ${label} (${x},${y},${z}) -> ${r.ok ? 'OK' : 'FALLO'} ${JSON.stringify(r)}`);
  return r.ok;
}
export async function aim(page, h, x, y, z) {
  await page.evaluate(([x, y, z]) => window.__qa.aim(x, y, z), [x, y, z]);
}
export async function stepUntil(page, cond, maxFrames = 600, dt = 1 / 60) {
  return page.evaluate(([c, m, d]) => window.__qa.stepUntil(c, m, d), [cond, maxFrames, dt]);
}
export async function press(page, h, key, frames = 2) {
  await page.keyboard.down(key);
  await h.step(frames);
  await page.keyboard.up(key);
  await h.step(1);
}
export async function hold(page, h, key, frames) {
  await page.keyboard.down(key);
  await h.step(frames);
  await page.keyboard.up(key);
  await h.step(2);
}
export async function click(page, h, button = 'left', frames = 2) {
  await page.mouse.down({ button });
  await h.step(frames);
  await page.mouse.up({ button });
  await h.step(1);
}
export async function shot(page, h, name) {
  for (let i = 0; i < 2; i++) {
    try {
      const t0 = Date.now();
      await page.evaluate(() => { window.__qaRender = true; });
      await h.step(2);
      if (await page.evaluate(() => __game.ctx.ui.panelOpen)) await page.waitForTimeout(600);
      mkdirSync(OUT, { recursive: true });
      await page.screenshot({ path: OUT + name, timeout: 90000 });
      await page.evaluate(() => { window.__qaRender = false; });
      console.log(`[${el()}] captura: ${name} ${Date.now() - t0}ms`);
      return true;
    } catch (e) {
      console.log('captura FALLIDA', name, String(e).split('\n')[0]);
    }
  }
  return false;
}
/** Clic real en un elemento del DOM (botón de panel) buscando por texto. */
export async function clickText(page, h, selector, text, opts = {}) {
  const loc = page.locator(selector, { hasText: text }).first();
  const n = await loc.count();
  if (!n) { console.log(`clickText: no encuentro ${selector} "${text}"`); return false; }
  const box = await loc.boundingBox();
  if (!box) { console.log(`clickText: sin caja ${selector} "${text}"`); return false; }
  if (opts.shift) await page.keyboard.down('ShiftLeft');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: opts.button ?? 'left' });
  if (opts.shift) await page.keyboard.up('ShiftLeft');
  await h.step(2);
  return true;
}
export async function panelText(page) {
  return page.evaluate(() => { const p = document.querySelector('.ui-panels .pn-wrap'); return p ? p.innerText.slice(0, 1500) : null; });
}

/** Camina hasta un mueble, lo mira y pulsa E. Devuelve el estado tras pulsar. */
export async function useProp(page, h, key, { aimY = 0.9, label = key, press: doPress = true } = {}) {
  const info = await page.evaluate((k) => window.__qa.propStand(k), key);
  if (!info) { console.log('useProp: no existe', key); return null; }
  const s = info.stand ?? info.prop;
  await goTo(page, h, s.x, s.y, s.z, { label, tol: 0.35 });
  await aim(page, h, info.prop.x, info.prop.y + aimY, info.prop.z);
  await h.step(2);
  const f = await page.evaluate(() => ({ focus: __game.cmd.jugador().focus, prompt: __game.cmd.jugador().prompt }));
  console.log(`useProp ${label}: focus=${f.focus} prompt=${JSON.stringify(f.prompt)}`);
  if (!doPress) return f;
  await page.keyboard.press('KeyE');
  await h.step(3);
  const st = await page.evaluate(() => ({ panel: __game.ctx.ui.panelOpen, sleeping: !!__game.state.player.sleeping, toasts: __game.cmd.jugador().toasts.slice(-3) }));
  console.log(`useProp ${label} tras E: ${JSON.stringify(st)}`);
  return { ...f, ...st };
}
export async function closePanel(page, h) {
  await page.keyboard.press('Escape');
  await h.step(3);
  const open = await page.evaluate(() => __game.ctx.ui.panelOpen);
  if (open) console.log('closePanel: sigue abierto');
}
export async function slotClick(page, h, inv, slot, opts = {}) {
  const loc = page.locator(`.ui-panels [data-inv="${inv}"][data-slot="${slot}"]`).first();
  if (!(await loc.count())) { console.log('slotClick: no hay', inv, slot); return false; }
  const box = await loc.boundingBox();
  if (opts.shift) await page.keyboard.down('ShiftLeft');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: opts.button ?? 'left' });
  if (opts.shift) await page.keyboard.up('ShiftLeft');
  await h.step(2);
  return true;
}
export async function invOf(page, ref) {
  return page.evaluate((ref) => { const inv = __game.sim.inventoryOf(ref); return inv ? inv.slots.map((s, i) => s ? `${i}:${s.id}x${s.qty}` : null).filter(Boolean) : null; }, ref);
}

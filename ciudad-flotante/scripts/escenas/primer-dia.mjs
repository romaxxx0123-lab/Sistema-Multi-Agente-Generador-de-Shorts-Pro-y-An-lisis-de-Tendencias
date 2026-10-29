/**
 * ESCENA DE REGRESIÓN: el primer día de un jugador nuevo, con teclado y ratón reales.
 *
 *   node scripts/shot.mjs --query "seed=1" --script scripts/escenas/primer-dia.mjs
 *
 * Variables: SHOTS=0 (sin capturas), PHASE=n (parar tras la fase n).
 * Imprime un resumen con cada paso OK/FALLO y termina con código 1 si alguno falla.
 */
import { install, log, goTo, aim, stepUntil, press, hold, click, shot, clickText, useProp, closePanel, slotClick, invOf, setOut } from './lib.mjs';

const PHASE = Number(process.env.PHASE ?? 99);
const SHOTS = process.env.SHOTS !== '0';

export default async (page, h) => {
  setOut('test-output/escenas/primer-dia/');
  const results = [];
  const check = (name, ok, info = '') => {
    results.push({ name, ok: !!ok, info });
    console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' · ' + info : ''}`);
  };
  const sh = async (n) => {
    if (SHOTS) await shot(page, h, n);
  };
  const ev = (js) => page.evaluate(js);

  page.on('dialog', (d) => d.dismiss());
  // En headless no hay captura real del ratón: mirada libre con deltas.
  await ev(() => {
    __game.ctx.input.lockUnavailable = true;
  });
  await install(page);

  // 1. Menú principal → Nueva partida
  const btn = page.locator('button', { hasText: 'Nueva partida' }).first();
  const box = await btn.boundingBox();
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await h.step(5);
  // Si había guardados, pide confirmación.
  if (await page.locator('button', { hasText: 'Empezar' }).count()) await clickText(page, h, 'button', 'Empezar');
  check('nueva partida desde el menú', (await ev(() => __game.ctx.mode)) === 'play');
  await sh('01-inicio.png');

  // 2. Moverse
  const p0 = await ev(() => ({ ...__game.state.player.pos }));
  await hold(page, h, 'KeyW', 60);
  await hold(page, h, 'KeyD', 30);
  await page.keyboard.down('ShiftLeft');
  await hold(page, h, 'KeyW', 30);
  await page.keyboard.up('ShiftLeft');
  await press(page, h, 'Space', 2);
  await h.step(40);
  const p1 = await ev(() => ({ ...__game.state.player.pos }));
  check('moverse, correr y saltar', Math.hypot(p1.x - p0.x, p1.z - p0.z) > 3, `${Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1)} m`);
  if (PHASE < 2) return finish();

  // 3. Gancho a un resto flotante
  let collected = 0;
  for (let attempt = 0; attempt < 6 && collected < 1; attempt++) {
    await stepUntil(page, 'g.state.debris.length > 0', 3000, 0.05);
    const first = await ev(() => {
      const p = __game.state.player.pos;
      return __game.state.debris.filter((d) => d.pos.x > p.x - 4).sort((a, b) => Math.abs(a.pos.z) - Math.abs(b.pos.z))[0] ?? null;
    });
    if (!first) {
      await h.step(60, 0.1);
      continue;
    }
    const side = Math.sign(first.pos.z) || 1;
    await press(page, h, 'Digit1');
    await goTo(page, h, 14, 3.2, side * 6.8, { label: 'borda proa' });
    const near = await stepUntil(page, `g.state.debris.some(d => Math.hypot(d.pos.x - g.state.player.pos.x, d.pos.z - g.state.player.pos.z) < 18 && Math.sign(d.pos.z) === Math.sign(g.state.player.pos.z) && d.pos.x > g.state.player.pos.x - 8)`, 4000, 1 / 30);
    if (!near.ok) continue;
    const tgt = await ev(() => {
      const p = __game.state.player.pos;
      return __game.state.debris.map((d) => ({ x: d.pos.x, z: d.pos.z, dist: Math.hypot(d.pos.x - p.x, d.pos.z - p.z) })).sort((a, b) => a.dist - b.dist)[0];
    });
    const wy = await page.evaluate(([x, z]) => __game.ctx.renderer.waterHeight(x, z), [tgt.x, tgt.z]);
    await aim(page, h, tgt.x, wy + 0.3, tgt.z);
    if (attempt === 0) await sh('02-apuntar-resto.png');
    await click(page, h);
    await stepUntil(page, `g.cmd.jugador().tools.hook === 'idle'`, 900);
    collected = await ev(() => __game.state.player.stats.debrisCollected);
  }
  check('rescatar un resto con el gancho', collected >= 1, `${collected} restos`);
  if (PHASE < 3) return finish();

  // 4. Almacén: guardar la mochila y coger madera
  let u = await useProp(page, h, '4:0', { label: 'estanteria' });
  if (!u?.panel) u = await useProp(page, h, '4:1', { label: 'estanteria2' });
  check('abrir el almacén con E', u?.panel);
  await sh('03-almacen.png');
  const packBefore = await ev(() => __game.state.player.inventory.slots.slice(8).filter(Boolean).length);
  await clickText(page, h, '.ui-panels button', 'Guardar todo');
  const packAfter = await ev(() => __game.state.player.inventory.slots.slice(8).filter((s) => s && s.id.startsWith('pagina') === false).length);
  check('«Guardar todo» vacía la mochila', packBefore === 0 || packAfter < packBefore, `${packBefore} → ${packAfter}`);
  const alm = await invOf(page, { kind: 'module', id: 4, slot: 'inventory' });
  const wood = alm?.find((e) => e.includes(':madera'));
  if (wood) await slotClick(page, h, 'module:4:inventory', Number(wood.split(':')[0]));
  check('coger madera del almacén', (await ev(() => __game.sim.state.player.inventory.slots.some((s) => s && s.id === 'madera'))));
  await closePanel(page, h);
  if (PHASE < 4) return finish();

  // 5. Fabricar una caña en el banco
  u = await useProp(page, h, '6:0', { label: 'banco' });
  check('abrir el banco de trabajo', u?.panel);
  await clickText(page, h, '.ui-panels .rc-row', 'Caña de pescar');
  await clickText(page, h, '.ui-panels button', 'Fabricar ×1');
  await stepUntil(page, `(g.state.ship.modules.find(m=>m.id===6).queue.length === 0)`, 1500, 0.1);
  await sh('04-banco.png');
  const tray = await invOf(page, { kind: 'module', id: 6, slot: 'inventory' });
  if (tray && tray.length) await slotClick(page, h, 'module:6:inventory', Number(tray[0].split(':')[0]));
  check('fabricar y recoger la caña', await ev(() => __game.state.player.inventory.slots.some((s) => s && s.id === 'cana')));
  await closePanel(page, h);
  if (PHASE < 5) return finish();

  // 6. Pescar desde la borda
  const rodSlot = await ev(() => __game.state.player.inventory.slots.findIndex((s) => s && s.id === 'cana'));
  if (rodSlot >= 0 && rodSlot < 8) await press(page, h, `Digit${rodSlot + 1}`);
  await goTo(page, h, 6, 3.2, 7.0, { label: 'borda estribor' });
  let fish = 0;
  for (let attempt = 0; attempt < 6 && fish < 1; attempt++) {
    await aim(page, h, 6 + attempt * 0.3, 0, 14);
    await click(page, h);
    await stepUntil(page, `g.cmd.jugador().tools.fishing === 'bite' || g.cmd.jugador().tools.fishing === 'idle'`, 3000, 1 / 30);
    if ((await ev(() => __game.cmd.jugador().tools.fishing)) !== 'bite') continue;
    if (attempt === 0) await sh('05-pica.png');
    await click(page, h);
    await stepUntil(page, `g.cmd.jugador().tools.fishing === 'idle'`, 600);
    fish = await ev(() => __game.state.player.stats.fishCaught);
  }
  check('pescar con la caña', fish >= 1, `${fish} capturas`);
  if (PHASE < 6) return finish();

  // 7. Cocinar el pescado
  u = await useProp(page, h, '3:0', { label: 'fogon' });
  check('abrir la cocina', u?.panel);
  await clickText(page, h, '.ui-panels .rc-row', 'Pescado asado');
  await clickText(page, h, '.ui-panels button', 'Cocinar ×1');
  if (await page.locator('.ui-panels button', { hasText: 'Echar madera' }).count()) await clickText(page, h, '.ui-panels button', 'Echar madera');
  await stepUntil(page, `(g.state.ship.modules.find(m=>m.id===3).queue.length === 0)`, 1200, 0.1);
  await sh('06-cocina.png');
  const ktray = await invOf(page, { kind: 'module', id: 3, slot: 'inventory' });
  const asado = ktray?.find((e) => e.includes(':pescado_asado'));
  if (asado) await slotClick(page, h, 'module:3:inventory', Number(asado.split(':')[0]));
  check('cocinar pescado asado', await ev(() => __game.state.player.inventory.slots.some((s) => s && s.id === 'pescado_asado')));
  await closePanel(page, h);
  if (PHASE < 7) return finish();

  // 8. Beber del depósito de la bodega (E bebe directamente)
  const thirst0 = await ev(() => __game.state.player.needs.thirst);
  u = await useProp(page, h, '9:0', { label: 'deposito bodega' });
  const thirst1 = await ev(() => __game.state.player.needs.thirst);
  check('bajar a la bodega y beber con E', thirst1 > thirst0 || thirst0 > 97, `${thirst0.toFixed(0)} → ${thirst1.toFixed(0)}`);
  if (await ev(() => __game.ctx.ui.panelOpen)) await closePanel(page, h);
  if (PHASE < 8) return finish();

  // 9. Comer desde la barra rápida con F
  const foodSlot = await ev(() => __game.state.player.inventory.slots.findIndex((s) => s && s.id === 'pescado_asado'));
  const hunger0 = await ev(() => __game.state.player.needs.hunger);
  if (foodSlot >= 0 && foodSlot < 8) {
    await press(page, h, `Digit${foodSlot + 1}`);
    await press(page, h, 'KeyF');
    await h.step(10);
  }
  const hunger1 = await ev(() => __game.state.player.needs.hunger);
  check('comer con F desde la barra rápida', hunger1 > hunger0, `${hunger0.toFixed(0)} → ${hunger1.toFixed(0)}`);
  if (PHASE < 9) return finish();

  // 10. Leer la página del cuaderno (si la mecánica existe)
  const pageSlot = await ev(() => __game.state.player.inventory.slots.findIndex((s) => s && s.id === 'pagina_1'));
  if (pageSlot >= 0) {
    await ev((i) => __game.sim.useItem(i), pageSlot);
    await h.step(3);
    const pages = await ev(() => __game.state.story?.pages ?? []);
    check('leer la primera página del cuaderno', pages.includes(1));
    if (await ev(() => __game.ctx.ui.panelOpen)) await closePanel(page, h);
  }

  // 11. Timón y naufragio del mediodía
  u = await useProp(page, h, '10:0', { label: 'timon' });
  check('subir al puente y abrir el timón', u?.panel);
  await closePanel(page, h);
  const wreck = await stepUntil(page, `g.state.events.active.some(e => e.type === 'naufragio')`, 30000, 0.1);
  check('aparece el naufragio del guion', wreck.ok);
  if (wreck.ok) {
    u = await useProp(page, h, '10:0', { label: 'timon2' });
    await sh('07-timon-naufragio.png');
    await clickText(page, h, '.ui-panels button', 'Detenerse a rescatar');
    check('decidir rescatar el naufragio', (await ev(() => __game.state.voyage.anchoredUntil)) !== null);
    await closePanel(page, h);
  }
  if (PHASE < 12) return finish();

  // 12. Pasar la tarde comiendo y bebiendo, y dormir en el camarote
  for (let k = 0; k < 30; k++) {
    const st = await ev(() => ({ h: (__game.state.time % 1440) / 60, n: __game.state.player.needs }));
    if (st.h >= 21) break;
    if (st.n.thirst < 45 || st.n.hunger < 45) {
      const s = await ev(() => __game.state.player.inventory.slots.findIndex((s) => s && ['agua_potable', 'conserva', 'pescado_asado', 'guiso'].includes(s.id)));
      if (s >= 0 && s < 8) {
        await press(page, h, `Digit${s + 1}`);
        await press(page, h, 'KeyF');
      }
    }
    await stepUntil(page, 'false', 600, 0.1);
  }
  await sh('08-atardecer.png');
  u = await useProp(page, h, '2:0', { label: 'cama camarote' });
  const slept = await ev(() => !!__game.state.player.sleeping);
  check('dormir en el camarote', slept);
  if (slept) {
    const woke = await stepUntil(page, `!g.state.player.sleeping`, 20000, 0.1);
    const st = await ev(() => ({ alive: __game.state.player.alive, h: (__game.state.time % 1440) / 60, e: __game.state.player.needs.energy }));
    check('despertar descansado al día siguiente', woke.ok && st.alive && st.e > 80, `energía ${st.e.toFixed(0)} a las ${st.h.toFixed(1)} h`);
    await sh('09-despertar.png');
  }
  return finish();

  function finish() {
    const bad = results.filter((r) => !r.ok);
    console.log(`\nRESUMEN primer día: ${results.length - bad.length}/${results.length} pasos correctos`);
    for (const r of bad) console.log(`  FALLO: ${r.name} ${r.info}`);
    if (bad.length) process.exitCode = 1;
  }
};

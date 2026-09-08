/* =========================================================
   game.js — bucle, pantallas y reglas. Sin DOM: todo va al
   lienzo, escalado a números enteros para que no se emborrone.
   ========================================================= */
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  /* ---------- escalado entero a pantalla completa ---------- */
  let SCALE = 1;
  function fit() {
    SCALE = Math.max(1, Math.min(Math.floor(innerWidth / W), Math.floor(innerHeight / H)));
    cv.style.width = (W * SCALE) + 'px';
    cv.style.height = (H * SCALE) + 'px';
  }
  addEventListener('resize', fit);
  fit();

  const FINISHERS = ['¡RIDICULEZ!', '¡PAPELÓN!', '¡QUÉ VERGÜENZA!', '¡SE ACABÓ!', '¡A CASA!'];
  const COMMENTS = {
    start: [
      'DOS FAMOSOS QUE NUNCA DEBIERON COINCIDIR.',
      'NADIE PIDIÓ ESTO Y SIN EMBARGO AQUÍ ESTAMOS.',
      'SUS ABOGADOS YA ESTÁN TOMANDO NOTA.',
      'EL REGLAMENTO SE PERDIÓ. IMPROVISAMOS.'
    ],
    low: ['ESTÁ MÁS ROJO QUE MI ALQUILER.', 'UN GOLPE MÁS Y SE VA EN TAXI.', 'LE QUEDA MENOS QUE A MI BATERÍA.'],
    ko: ['ALGUIEN AVISE A SU EQUIPO DE PRENSA.', 'ESO SALE EN EL RESUMEN Y EN TERAPIA.', 'SE APAGÓ COMO EL WIFI EN TORMENTA.'],
    timeout: ['SE ACABÓ EL TIEMPO Y LA PACIENCIA.', 'GANA EL QUE MENOS SE DEJÓ PEGAR.']
  };
  const ROUND_FRAMES = 60 * 60, WINS_NEEDED = 2;

  /* ---------- entrada ---------- */
  const BTN = { up: 1, punch: 1, kick: 1, special: 1, super: 1, taunt: 1 };
  const Input = {
    keys: {}, taps: {},
    maps: {
      1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', special: 'KeyH', super: 'KeyT', taunt: 'KeyR' },
      2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyJ', kick: 'KeyK', special: 'KeyL', super: 'KeyO', taunt: 'KeyP' }
    },
    intent(p) {
      const m = this.maps[p], o = {};
      for (const k in m) o[k] = !!this.keys[m[k]] || (!!BTN[k] && !!this.taps[m[k]]);
      return o;
    },
    clearTaps() { for (const k in this.taps) delete this.taps[k]; }
  };
  const tapped = c => !!Input.taps[c];
  const anyTap = list => list.some(tapped);

  const UP_KEYS = ['KeyW', 'ArrowUp'], DOWN_KEYS = ['KeyS', 'ArrowDown'];
  const LEFT_KEYS = ['KeyA', 'ArrowLeft'], RIGHT_KEYS = ['KeyD', 'ArrowRight'];
  const OK_KEYS = ['KeyF', 'KeyJ', 'Enter', 'Space'], BACK_KEYS = ['Escape', 'Backspace'];

  addEventListener('keydown', e => {
    Sfx.init(); Sfx.resume();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    Input.keys[e.code] = true;
    if (!e.repeat) Input.taps[e.code] = true;
    if (e.code === 'KeyM') announce(Sfx.toggle() ? 'SILENCIO' : 'SONIDO', 40);
  });
  addEventListener('keyup', e => { Input.keys[e.code] = false; });

  /* ratón: se traduce a coordenadas del lienzo */
  const Mouse = { x: -1, y: -1, click: false };
  function toVirt(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / SCALE, y: (e.clientY - r.top) / SCALE };
  }
  cv.addEventListener('mousemove', e => { const p = toVirt(e); Mouse.x = p.x; Mouse.y = p.y; });
  cv.addEventListener('mousedown', e => {
    Sfx.init(); Sfx.resume();
    const p = toVirt(e); Mouse.x = p.x; Mouse.y = p.y; Mouse.click = true;
  });
  const inRect = r => Mouse.x >= r.x && Mouse.x <= r.x + r.w && Mouse.y >= r.y && Mouse.y <= r.y + r.h;

  /* ---------- estado ---------- */
  const G = {
    t: 0, screen: 'title', mode: '1p', menu: 0,
    picks: [null, null], cur: [0, 7], rouletteT: 0,
    world: null, f1: null, f2: null,
    round: 1, timer: ROUND_FRAMES, phase: 'intro', phaseT: 0,
    winner: null, quote: '', ann: null, lowSaid: [false, false], finisher: null
  };
  window.PK = G;

  function announce(text, frames, color) {
    G.ann = { text, t0: G.t, until: G.t + (frames || 70), color };
  }

  /* =======================================================
     DEMO DE FONDO (menús)
     ======================================================= */
  let demo = null;
  function startDemo() {
    const a = pick(ROSTER), b = pick(ROSTER.filter(c => c !== a));
    const w = new World(pick(STAGES).id);
    const f1 = new Fighter(a, 92, 1, 1, true);
    const f2 = new Fighter(b, 228, -1, 2, true);
    w.fighters = [f1, f2];
    demo = { w, f1, f2, over: 0 };
  }
  function stepDemo() {
    if (!demo) startDemo();
    const { w, f1, f2 } = demo;
    if (w.hitstop > 0) w.hitstop--;
    else {
      f1.update(AI.think(f1, f2, w, 1), f2, w);
      f2.update(AI.think(f2, f1, w, 1), f1, w);
      resolveMelee(f1, f2, w); resolveMelee(f2, f1, w);
      pushApart(f1, f2); faceEachOther(f1, f2);
      w.update();
    }
    w.pops.length = 0;                       // sin textos flotantes en el menú
    if ((f1.state === 'ko' || f2.state === 'ko') && ++demo.over > 90) startDemo();
    drawArena(w, f1, f2);
  }

  /* =======================================================
     SELECCIÓN
     ======================================================= */
  function gotoSelect(mode) {
    G.mode = mode; G.screen = 'select';
    G.picks = [null, null]; G.cur = [0, 7]; G.rouletteT = 0;
    Sfx.quiet = false;
    Sfx.confirm();
  }

  function moveCursor(p, dx, dy) {
    const cols = 5, rows = Math.ceil(ROSTER.length / cols);
    let cx = G.cur[p] % cols, cy = Math.floor(G.cur[p] / cols);
    cx = (cx + dx + cols) % cols; cy = (cy + dy + rows) % rows;
    const i = clamp(cy * cols + cx, 0, ROSTER.length - 1);
    if (i !== G.cur[p]) { G.cur[p] = i; Sfx.select(); }
  }

  function confirmPick(p) {
    if (G.picks[p] !== null) return;
    G.picks[p] = G.cur[p];
    Sfx.confirm();
    if (G.mode === '1p' && G.picks[1] === null) G.rouletteT = 70;
    if (G.picks[0] !== null && G.picks[1] !== null) G.vsAt = G.t + 16;
  }

  function stepSelect() {
    if (G.vsAt && G.t >= G.vsAt) { G.vsAt = 0; gotoVs(); return; }
    if (G.rouletteT > 0) {
      if (G.rouletteT % 5 === 0) { G.cur[1] = irnd(0, ROSTER.length - 1); Sfx.select(); }
      if (--G.rouletteT === 0) { G.picks[1] = G.cur[1]; Sfx.confirm(); G.vsAt = G.t + 40; }
      return;
    }
    const p = G.picks[0] === null ? 0 : (G.mode === '2p' ? 1 : -1);
    if (p < 0) return;
    const m = Input.maps[p + 1];
    if (tapped(m.left)) moveCursor(p, -1, 0);
    if (tapped(m.right)) moveCursor(p, 1, 0);
    if (tapped(m.up)) moveCursor(p, 0, -1);
    if (tapped(m.down)) moveCursor(p, 0, 1);
    if (tapped(m.punch) || tapped('Enter')) confirmPick(p);
    if (anyTap(BACK_KEYS)) { G.screen = 'title'; G.menu = 0; }

    /* ratón */
    for (let i = 0; i < ROSTER.length; i++) {
      if (inRect(UI.cellRect(i))) {
        if (G.cur[p] !== i) { G.cur[p] = i; Sfx.select(); }
        if (Mouse.click) confirmPick(p);
      }
    }
  }

  /* =======================================================
     VS Y COMBATE
     ======================================================= */
  function gotoVs() {
    G.screen = 'vs'; G.t0 = G.t;
    Sfx.bell();
    G.vsUntil = G.t + 130;
  }

  function startMatch() {
    G.world = new World(pick(STAGES).id);
    G.f1 = new Fighter(ROSTER[G.picks[0]], 92, 1, 1, false);
    const d2 = G.picks[0] === G.picks[1] ? mirrorDef(ROSTER[G.picks[1]]) : ROSTER[G.picks[1]];
    G.f2 = new Fighter(d2, 228, -1, 2, G.mode === '1p');
    G.world.fighters = [G.f1, G.f2];
    G.round = 1;
    G.screen = 'fight';
    Sfx.quiet = false;
    startRound();
  }

  function startRound() {
    const w = G.world;
    w.projs.length = 0; w.walls.length = 0; w.parts.length = 0; w.pops.length = 0; w.decos.length = 0;
    const m1 = G.f1.meter, m2 = G.f2.meter, w1 = G.f1.wins, w2 = G.f2.wins;
    G.f1.reset(92, 1); G.f2.reset(228, -1);
    G.f1.meter = Math.floor(m1 * 0.5); G.f2.meter = Math.floor(m2 * 0.5);
    G.f1.wins = w1; G.f2.wins = w2;
    G.f1.frozen = 999; G.f2.frozen = 999;
    G.timer = ROUND_FRAMES; G.phase = 'intro'; G.phaseT = 0;
    G.lowSaid = [false, false];
    w.say(G.round === 1 ? pick(COMMENTS.start) : matchupLine(G.f1.def.type, G.f2.def.type), 220);
    announce('ROUND ' + G.round, 70);
    Sfx.bell();
  }

  function gotoResult() {
    G.winner = G.f1.wins > G.f2.wins ? G.f1 : G.f2;
    G.quote = pick(G.winner.def.quotes);
    G.screen = 'result'; G.menu = 0;
    Sfx.win();
  }

  function endRound(winner, reason) {
    G.phase = 'ko'; G.phaseT = 0;
    /* el combate se cierra con remate: solo por KO y solo el asalto final */
    G.finisher = (winner && !reason && winner.wins + 1 >= WINS_NEEDED)
      ? { loser: (winner === G.f1) ? G.f2 : G.f1 } : null;
    if (winner) {
      winner.wins++; winner.state = 'win'; winner.t = 0;
      G.world.emote(winner, 'corona', barkLine(winner, 'win'), true);
      announce(reason || (G.world.koSuper ? '¡SUPER EFECTIVO!' : pick(FINISHERS)), 150, CO.red);
      G.world.say(reason ? pick(COMMENTS.timeout) : pick(COMMENTS.ko), 240);
      Sfx.win();
    } else {
      announce('EMPATE', 150, CO.red);
    }
  }

  function stepFight() {
    const w = G.world, f1 = G.f1, f2 = G.f2;

    if (G.phase === 'intro') {
      G.phaseT++;
      if (G.phaseT === 12) w.emote(f1, 'tipo', introLine(f1, f2), true);   // se pican antes de empezar
      if (G.phaseT === 60) w.emote(f2, 'tipo', introLine(f2, f1), true);
      if (G.phaseT === 112) w.emotes.length = 0;
      if (G.phaseT === 118) announce('¡PELEA!', 55);
      if (G.phaseT > 150) { f1.frozen = 0; f2.frozen = 0; G.phase = 'fight'; }
    } else if (G.phase === 'ko') {
      G.phaseT++;
      const fin = G.finisher;
      if (fin) {
        /* BEBALIDAD: el perdedor se hace bebé y sale de una patada */
        const L = fin.loser, Wn = (L === f1) ? f2 : f1;
        if (G.phaseT === 50) {
          L.baby = true; L.koT = 0; L.vx = 0; L.vy = 0; L.y = GROUND; L.dir = Wn.x > L.x ? 1 : -1;
          announce('¡BEBALIDAD!', 100, '#f07ac0');
          w.flash = 12; w.shake = 6;
          w.say('SE HIZO CHIQUITO. NO ESTABA EN EL PLAN.', 240, '#f07ac0');
          Sfx.baby();
        }
        if (G.phaseT > 56 && G.phaseT < 124 && G.phaseT % 7 === 0)
          w.parts.push(new Particle(L.x + rnd(-9, 9), L.y - 37, rnd(-0.7, 0.7), -0.5, 34, '#8ee0f0', 2, 0.14));
        if (G.phaseT === 124) {
          Wn.dir = L.x > Wn.x ? 1 : -1;
          Wn.startAttack(ATTACKS.kick);
        }
        if (G.phaseT === 138) {
          L.launched = true;
          L.vx = Wn.dir * 9.5; L.vy = -7.5;
          w.impact(L.x, L.y - 27, true);
          w.shake = 16; w.flash = 8;
          Sfx.punt();
          w.say('Y AHÍ VA. QUE TENGA BUEN VIAJE.', 200, '#f07ac0');
        }
        if (G.phaseT === 250) { gotoResult(); return; }
      } else if (G.phaseT === 150) {
        if (f1.wins >= WINS_NEEDED || f2.wins >= WINS_NEEDED) { gotoResult(); return; }
        G.round++; startRound();
      }
    } else if (G.phase === 'fight') {
      if (--G.timer <= 0) {
        G.timer = 0;
        if (f1.hp === f2.hp) endRound(null);
        else endRound(f1.hp > f2.hp ? f1 : f2, '¡TIEMPO!');
      }
    }

    if (w.hitstop > 0) w.hitstop--;
    else {
      const i1 = G.phase === 'fight' ? Input.intent(1) : AI.blank();
      const i2 = G.phase !== 'fight' ? AI.blank() : (f2.cpu ? AI.think(f2, f1, w, 1) : Input.intent(2));
      f1.update(i1, f2, w); f2.update(i2, f1, w);
      resolveMelee(f1, f2, w); resolveMelee(f2, f1, w);
      pushApart(f1, f2); faceEachOther(f1, f2);
      w.update();
      if (G.phase === 'fight') {
        [f1, f2].forEach((f, i) => {
          if (!G.lowSaid[i] && f.hp > 0 && f.hp <= 25) {
            G.lowSaid[i] = true;
            w.say(f.def.short + ': ' + pick(COMMENTS.low), 200);
            w.emote(f, 'alerta', barkLine(f, 'low'), true);
          }
        });
        if (f1.state === 'ko') endRound(f2);
        else if (f2.state === 'ko') endRound(f1);
      }
    }
    drawArena(w, f1, f2);
  }

  function pushApart(a, b) {
    /* el que ocupa más sitio (el coche) separa más */
    const half = f => (f.def.wide ? f.def.wide / 2 : (f.def.hurt ? f.def.hurt.w / 2 : 12.5));
    const d = b.x - a.x, min = Math.max(27, half(a) + half(b) + 3);
    /* durante una embestida no se separan: si no, el que embiste nunca llega */
    if (a.state === 'dash' || b.state === 'dash') return;
    if (Math.abs(d) < min && a.state !== 'ko' && b.state !== 'ko') {
      const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
      a.x = clamp(a.x - push * 0.6, 15, W - 15);
      b.x = clamp(b.x + push * 0.6, 15, W - 15);
    }
  }
  function faceEachOther(a, b) {
    if (a.onGround && a.state !== 'attack' && a.state !== 'dash' && a.state !== 'ko') a.dir = b.x >= a.x ? 1 : -1;
    if (b.onGround && b.state !== 'attack' && b.state !== 'dash' && b.state !== 'ko') b.dir = a.x >= b.x ? 1 : -1;
  }

  /* ---------- dibujo de la arena ---------- */
  function drawArena(w, f1, f2) {
    ctx.save();
    if (w.shake > 0) ctx.translate(irnd(-2, 2), irnd(-2, 2));
    drawStage(ctx, w.stage, w.t);
    w.drawBack(ctx);
    for (const f of [f1, f2]) {
      const alt = clamp(GROUND - f.y, 0, 60);
      Pix.shadow(ctx, f.x, GROUND, Math.max(13, (f.def.wide || 34) - alt * 0.26));
      drawAura(f);
      drawFighter(ctx, f);
    }
    w.drawFront(ctx);
    ctx.restore();
  }

  function drawAura(f) {
    if (f.guard > 0) for (let i = 0; i < 6; i++) {
      const a = f.t / 10 + i;
      Pix.r(ctx, f.x + Math.cos(a) * 22, f.y - 42 + Math.sin(a) * 37, 2, 2, '#9bf59b');
    }
    if (f.slow > 0 && f.t % 12 < 6) {
      Pix.r(ctx, f.x - 16, f.y - 89, 3, 1, CO.cyan);
      Pix.r(ctx, f.x + 14, f.y - 96, 3, 1, CO.cyan);
    }
    if (f.burn > 0 && f.t % 8 < 4) Pix.r(ctx, f.x - 2, f.y - 84, 2, 2, '#f0932b');
    if (f.meter >= 100 && f.state !== 'ko' && f.t % 20 < 10) Pix.r(ctx, f.x - 15, f.y + 1, 30, 1, CO.gold);
  }

  /* =======================================================
     NAVEGACIÓN DE MENÚS
     ======================================================= */
  function menuNav(len) {
    if (anyTap(UP_KEYS)) { G.menu = (G.menu + len - 1) % len; Sfx.select(); }
    if (anyTap(DOWN_KEYS)) { G.menu = (G.menu + 1) % len; Sfx.select(); }
    return anyTap(OK_KEYS);
  }
  function menuMouse(rectFn, len) {
    let clicked = -1;
    for (let i = 0; i < len; i++) {
      if (inRect(rectFn(i))) {
        if (G.menu !== i) { G.menu = i; Sfx.select(); }
        if (Mouse.click) clicked = i;
      }
    }
    return clicked;
  }

  /* =======================================================
     BUCLE
     ======================================================= */
  function tick() {
    G.t++;
    if (G.ann && G.t > G.ann.until) G.ann = null;

    switch (G.screen) {
      case 'title': {
        stepDemo();
        const ok = menuNav(UI.TITLE_ITEMS.length);
        const m = menuMouse(i => UI.titleItemRect(i), UI.TITLE_ITEMS.length);
        if (ok || m >= 0) {
          const i = m >= 0 ? m : G.menu;
          if (i === 0) gotoSelect('1p');
          else if (i === 1) gotoSelect('2p');
          else { G.screen = 'howto'; Sfx.confirm(); }
        }
        UI.drawTitle(ctx, G);
        break;
      }
      case 'howto':
        stepDemo();
        if (anyTap(BACK_KEYS) || anyTap(OK_KEYS) || Mouse.click) { G.screen = 'title'; G.menu = 2; }
        UI.drawHowto(ctx, G);
        break;

      case 'select':
        stepSelect();
        UI.drawSelect(ctx, G);
        break;

      case 'vs':
        if (G.t >= G.vsUntil || anyTap(OK_KEYS)) startMatch();
        UI.drawVs(ctx, G);
        break;

      case 'fight':
        if (anyTap(BACK_KEYS)) { G.screen = 'pause'; G.menu = 0; break; }
        stepFight();
        if (G.screen === 'fight' || G.screen === 'result') UI.drawHud(ctx, G);
        UI.drawAnnounce(ctx, G);
        break;

      case 'pause': {
        drawArena(G.world, G.f1, G.f2);
        UI.drawHud(ctx, G);
        const ok = menuNav(UI.PAUSE_ITEMS.length);
        const m = menuMouse(i => UI.pauseItemRect(i), UI.PAUSE_ITEMS.length);
        if (anyTap(BACK_KEYS)) G.screen = 'fight';
        else if (ok || m >= 0) {
          const i = m >= 0 ? m : G.menu;
          if (i === 0) G.screen = 'fight';
          else { G.screen = 'title'; G.menu = 0; Sfx.quiet = true; startDemo(); }
        }
        UI.drawPause(ctx, G);
        break;
      }

      case 'result': {
        drawArena(G.world, G.f1, G.f2);
        const ok = menuNav(UI.RESULT_ITEMS.length);
        const m = menuMouse(i => UI.resultItemRect(i), UI.RESULT_ITEMS.length);
        if (ok || m >= 0) {
          const i = m >= 0 ? m : G.menu;
          if (i === 0) startMatch();
          else if (i === 1) gotoSelect(G.mode);
          else { G.screen = 'title'; G.menu = 0; Sfx.quiet = true; startDemo(); }
        }
        UI.drawResult(ctx, G);
        break;
      }
    }

    Mouse.click = false;
    Input.clearTaps();
  }

  let acc = 0, last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    acc += Math.min(now - last, 100);
    last = now;
    let steps = 0;
    while (acc >= 1000 / 60 && steps++ < 4) { acc -= 1000 / 60; tick(); }
  }

  Sfx.quiet = true;
  startDemo();
  requestAnimationFrame(loop);
})();

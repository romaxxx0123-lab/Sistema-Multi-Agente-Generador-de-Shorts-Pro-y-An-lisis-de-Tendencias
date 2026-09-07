/* =========================================================
   game.js — pantallas, bucle principal, HUD y reglas del torneo
   ========================================================= */
(() => {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const $ = id => document.getElementById(id);
  const LAYERS = ['title', 'howto', 'select', 'vs', 'result', 'pause', 'hud', 'announce'];
  const show = (...ids) => LAYERS.forEach(l => $(l).classList.toggle('hidden', !ids.includes(l)));

  const COMMENTS = {
    start: [
      'DOS DESCONOCIDOS TOTALES. UN SOLO RING.',
      'NADIE PIDIÓ ESTE COMBATE Y SIN EMBARGO AQUÍ ESTAMOS.',
      'APUESTEN, SEÑORES. PERO POCO.',
      'EL REGLAMENTO SE PERDIÓ. IMPROVISAMOS.',
      'ESTO NO DEBERÍA ESTAR PASANDO Y ES HERMOSO.'
    ],
    low: [
      'ESTÁ MÁS ROJO QUE MI ALQUILER.',
      'UN GOLPE MÁS Y SE VA A CASA EN TAXI.',
      'LE QUEDA MENOS VIDA QUE A MI BATERÍA.'
    ],
    ko: [
      'SE APAGÓ COMO EL WIFI EN TORMENTA.',
      'ALGUIEN AVISE A UN FAMILIAR.',
      'LO MANDÓ A LA PANTALLA DE CARGA.',
      'ESO VA A SALIR EN EL RESUMEN Y EN TERAPIA.'
    ],
    timeout: ['SE ACABÓ EL TIEMPO Y LA PACIENCIA.', 'GANA EL QUE MENOS SE DEJÓ PEGAR.']
  };

  const FINISHERS = ['¡RIDICULEZ!', '¡PAPELÓN!', '¡QUÉ VERGÜENZA!', '¡FATALIDAD (MÁS O MENOS)!', '¡SE ACABÓ EL PAN!'];
  const ROUND_FRAMES = 60 * 60;      // 60 segundos
  const WINS_NEEDED = 2;             // al mejor de 3

  /* ---------------- entrada ---------------- */
  const BTN = { up: 1, punch: 1, kick: 1, special: 1, super: 1, taunt: 1 };
  const Input = {
    keys: {},        // teclas mantenidas
    taps: {},        // pulsaciones nuevas (se consumen cada tick)
    maps: {
      1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', special: 'KeyH', super: 'KeyT', taunt: 'KeyR' },
      2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyJ', kick: 'KeyK', special: 'KeyL', super: 'KeyO', taunt: 'KeyP' }
    },
    /* un toque brevisimo (menos de un frame) tambien cuenta */
    intent(p) {
      const m = this.maps[p], o = {};
      for (const k in m) o[k] = !!this.keys[m[k]] || (!!BTN[k] && !!this.taps[m[k]]);
      return o;
    },
    clearTaps() { for (const k in this.taps) delete this.taps[k]; }
  };

  function tapped(code) { return !!Input.taps[code]; }

  addEventListener('keydown', e => {
    Sfx.init(); Sfx.resume();
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    Input.keys[e.code] = true;
    if (!e.repeat) Input.taps[e.code] = true;
    if (e.code === 'KeyM') {
      const m = Sfx.toggle();
      announce(m ? 'SILENCIO' : 'SONIDO', 700, 'small');
    }
  });
  addEventListener('keyup', e => { Input.keys[e.code] = false; });
  addEventListener('mousedown', () => { Sfx.init(); Sfx.resume(); });

  /* ---------------- estado global ---------------- */
  const G = {
    screen: 'title',
    mode: '1p',
    picks: [null, null],
    cur: [0, 4],
    world: null,
    f1: null, f2: null,
    round: 1,
    timer: ROUND_FRAMES,
    phase: 'intro',      // intro · fight · ko · over
    phaseT: 0,
    winner: null,
    rouletteT: 0
  };

  window.PK = G;   // hook de depuracion: window.PK.f1.meter = 100, etc.

  /* ---------------- anuncios ---------------- */
  let announceT = 0;
  function announce(text, ms, cls) {
    const el = $('announceText');
    el.textContent = text;
    el.className = cls || '';
    $('announce').classList.remove('hidden');
    void el.offsetWidth;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    announceT = performance.now() + (ms || 1000);
  }
  function tickAnnounce() {
    if (announceT && performance.now() > announceT) {
      announceT = 0;
      $('announce').classList.add('hidden');
    }
  }

  /* =======================================================
     PANTALLA: TITULO (con pelea de demostracion de fondo)
     ======================================================= */
  function gotoTitle() {
    G.screen = 'title';
    Sfx.quiet = true;
    show('title');
    startAttract();
  }

  let attract = null;
  function startAttract() {
    const a = pick(ROSTER);
    const b = pick(ROSTER.filter(c => c !== a));
    const w = new World(pick(STAGES).id);
    const f1 = new Fighter(a, 96, 1, 1, true);
    const f2 = new Fighter(b, 224, -1, 2, true);
    w.fighters = [f1, f2];
    attract = { w, f1, f2, t: 0 };
  }
  function stepAttract() {
    if (!attract) return;
    const { w, f1, f2 } = attract;
    if (w.hitstop > 0) { w.hitstop--; }
    else {
      f1.update(AI.think(f1, f2, w, 1), f2, w);
      f2.update(AI.think(f2, f1, w, 1), f1, w);
      resolveMelee(f1, f2, w); resolveMelee(f2, f1, w);
      pushApart(f1, f2); faceEachOther(f1, f2);
      w.update();
    }
    if (f1.state === 'ko' || f2.state === 'ko') {
      if (++attract.t > 90) startAttract();
    }
    drawArena(w, f1, f2);
    ctx.fillStyle = 'rgba(5,6,12,0.35)';
    ctx.fillRect(0, 0, W, H);
  }

  /* =======================================================
     PANTALLA: SELECCION
     ======================================================= */
  function buildGrid() {
    const grid = $('selGrid');
    grid.innerHTML = '';
    ROSTER.forEach((def, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.i = i;
      const t1 = document.createElement('span'); t1.className = 'tagp tag1'; t1.textContent = 'P1';
      const t2 = document.createElement('span'); t2.className = 'tagp tag2'; t2.textContent = 'P2';
      const c = document.createElement('canvas'); c.width = 40; c.height = 52;
      const n = document.createElement('span'); n.className = 'cname'; n.textContent = def.name;
      const ch = document.createElement('div'); ch.className = 'chips'; ch.innerHTML = typeChip(def.type, true);
      const sb = document.createElement('span'); sb.className = 'sub'; sb.textContent = 'sub: ' + def.sub;
      card.append(t1, t2, c, n, ch, sb);
      card.addEventListener('click', () => {
        if (G.picks[0] === null) { G.cur[0] = i; confirmPick(0); }
        else if (G.mode === '2p' && G.picks[1] === null) { G.cur[1] = i; confirmPick(1); }
      });
      card.addEventListener('mouseenter', () => {
        if (G.picks[0] === null) { G.cur[0] = i; refreshGrid(); }
        else if (G.mode === '2p' && G.picks[1] === null) { G.cur[1] = i; refreshGrid(); }
      });
      grid.appendChild(card);
      renderPortrait(c, def);
    });
  }

  function refreshGrid() {
    const cards = $('selGrid').children;
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      const p1 = (G.picks[0] === null ? G.cur[0] : G.picks[0]) === i;
      const p2 = G.mode === '2p' && (G.picks[1] === null ? G.cur[1] : G.picks[1]) === i;
      c.classList.toggle('p1', p1);
      c.classList.toggle('p2', p2);
      c.classList.toggle('locked', G.picks[0] === i || G.picks[1] === i);
      c.querySelector('.tag1').style.display = p1 ? 'block' : 'none';
      c.querySelector('.tag2').style.display = p2 ? 'block' : 'none';
    }
    const hov = ROSTER[G.picks[0] === null ? G.cur[0] : (G.picks[1] === null ? G.cur[1] : G.picks[1])];
    $('selBio').innerHTML = hov.name + ' — <span style="color:#48e0d0">' + hov.title + '</span> ' +
      typeChip(hov.type) + ' <span style="color:#66748f">/ ' + hov.sub + '</span><br>' +
      '<span style="color:#b9c4d8;font-size:.9em">' + hov.bio + '</span><br>' +
      'ESPECIAL: ' + hov.special.name + ' · SUPER: ' + hov.superMove.name;
    if (G.picks[0] !== null) {
      const other = ROSTER[G.picks[1] !== null ? G.picks[1] : G.cur[1]];
      $('selMatch').textContent = matchupLine(ROSTER[G.picks[0]].type, other.type);
    } else {
      $('selMatch').textContent = TYPES[hov.type].icon + ' ' + TYPES[hov.type].name + ': ' + TYPES[hov.type].tag;
    }
    $('selPrompt').textContent = G.picks[0] === null ? 'JUGADOR 1: ELIGE TU RANDOM'
      : (G.mode === '2p' ? 'JUGADOR 2: ELIGE TU RANDOM' : 'LA CPU ESTÁ ELIGIENDO...');
  }

  function gotoSelect(mode) {
    G.mode = mode;
    G.screen = 'select';
    G.picks = [null, null];
    G.cur = [0, 4];
    G.rouletteT = 0;
    Sfx.quiet = false;
    show('select');
    buildGrid();
    refreshGrid();
  }

  function moveCursor(p, dx, dy) {
    let i = G.cur[p];
    const cols = 4, rows = Math.ceil(ROSTER.length / cols);
    let cx = i % cols, cy = Math.floor(i / cols);
    cx = (cx + dx + cols) % cols;
    cy = (cy + dy + rows) % rows;
    i = clamp(cy * cols + cx, 0, ROSTER.length - 1);
    if (i !== G.cur[p]) { G.cur[p] = i; Sfx.select(); refreshGrid(); }
  }

  function confirmPick(p) {
    if (G.picks[p] !== null) return;
    G.picks[p] = G.cur[p];
    Sfx.confirm();
    refreshGrid();
    if (G.mode === '1p' && G.picks[0] !== null && G.picks[1] === null) {
      G.rouletteT = 70;                      // ruleta de la CPU
    }
    if (G.picks[0] !== null && G.picks[1] !== null) setTimeout(gotoVs, 260);
  }

  function stepSelect() {
    if (G.rouletteT > 0) {
      if (G.rouletteT % 5 === 0) { G.cur[1] = irnd(0, ROSTER.length - 1); refreshGridCPU(); }
      if (--G.rouletteT === 0) { G.picks[1] = G.cur[1]; Sfx.confirm(); refreshGrid(); setTimeout(gotoVs, 400); }
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
    if (tapped('Escape')) gotoTitle();
  }
  function refreshGridCPU() {
    const cards = $('selGrid').children;
    for (let i = 0; i < cards.length; i++) cards[i].classList.toggle('p2', G.cur[1] === i);
  }

  /* =======================================================
     PANTALLA: VS
     ======================================================= */
  function gotoVs() {
    G.screen = 'vs';
    show('vs');
    const a = ROSTER[G.picks[0]], b = ROSTER[G.picks[1]];
    renderPortrait($('vsA'), a);
    renderPortrait($('vsB'), b);
    $('vsAName').textContent = a.name;
    $('vsBName').textContent = b.name + (G.mode === '1p' ? ' (CPU)' : '');
    $('vsAType').innerHTML = typeChip(a.type) + '<span class="sub">sub: ' + a.sub + '</span>';
    $('vsBType').innerHTML = typeChip(b.type) + '<span class="sub">sub: ' + b.sub + '</span>';
    $('vsMatch').textContent = matchupLine(a.type, b.type);
    Sfx.bell();
    ctx.fillStyle = '#05060c'; ctx.fillRect(0, 0, W, H);
    setTimeout(startMatch, 1500);
  }

  /* =======================================================
     COMBATE
     ======================================================= */
  function startMatch() {
    const stage = pick(STAGES).id;
    G.world = new World(stage);
    G.f1 = new Fighter(ROSTER[G.picks[0]], 92, 1, 1, false);
    G.f2 = new Fighter(ROSTER[G.picks[1]], 228, -1, 2, G.mode === '1p');
    G.world.fighters = [G.f1, G.f2];
    G.f1.wins = 0; G.f2.wins = 0;
    G.round = 1;
    G.screen = 'fight';
    Sfx.quiet = false;
    $('p1name').textContent = G.f1.def.name;
    $('p2name').textContent = G.f2.def.name + (G.mode === '1p' ? ' [CPU]' : '');
    $('p1type').innerHTML = typeChip(G.f1.def.type, true);
    $('p2type').innerHTML = typeChip(G.f2.def.type, true);
    show('hud');
    startRound();
  }

  function startRound() {
    const w = G.world;
    w.projs.length = 0; w.walls.length = 0; w.parts.length = 0; w.pops.length = 0;
    const m1 = G.f1.meter, m2 = G.f2.meter, w1 = G.f1.wins, w2 = G.f2.wins;
    G.f1.reset(92, 1); G.f2.reset(228, -1);
    G.f1.meter = Math.floor(m1 * 0.5); G.f2.meter = Math.floor(m2 * 0.5);
    G.f1.wins = w1; G.f2.wins = w2;
    G.f1.frozen = 999; G.f2.frozen = 999;
    G.timer = ROUND_FRAMES;
    G.phase = 'intro';
    G.phaseT = 0;
    G.lowSaid = [false, false];
    $('roundlab').textContent = 'ROUND ' + G.round;
    G.world.say(G.round === 1 ? pick(COMMENTS.start) : matchupLine(G.f1.def.type, G.f2.def.type), 220);
    announce('ROUND ' + G.round, 1000);
    Sfx.bell();
  }

  function endRound(winner, reason) {
    G.phase = 'ko';
    G.phaseT = 0;
    if (winner) {
      winner.wins++;
      winner.state = 'win';
      winner.t = 0;
      const remate = reason || (G.world.koSuper ? '¡REMATE SUPER EFECTIVO!' : FINISHERS[irnd(0, FINISHERS.length - 1)]);
      announce(remate, 2200, 'ko');
      G.world.say(reason ? pick(COMMENTS.timeout) : pick(COMMENTS.ko), 240);
      Sfx.win();
    } else {
      announce('EMPATE', 2000, 'ko');
    }
    updateHud();
  }

  function stepFight() {
    const w = G.world, f1 = G.f1, f2 = G.f2;

    /* --- fases --- */
    if (G.phase === 'intro') {
      G.phaseT++;
      if (G.phaseT === 70) announce('¡PELEA!', 800);
      if (G.phaseT > 100) { f1.frozen = 0; f2.frozen = 0; G.phase = 'fight'; }
    } else if (G.phase === 'ko') {
      G.phaseT++;
      if (G.phaseT === 150) {
        if (f1.wins >= WINS_NEEDED || f2.wins >= WINS_NEEDED) {
          G.winner = f1.wins > f2.wins ? f1 : f2;
          gotoResult();
          return;
        }
        G.round++;
        startRound();
      }
    } else if (G.phase === 'fight') {
      if (--G.timer <= 0) {
        G.timer = 0;
        if (f1.hp === f2.hp) endRound(null, 'EMPATE');
        else endRound(f1.hp > f2.hp ? f1 : f2, '¡SE ACABÓ EL TIEMPO!');
      }
    }

    /* --- simulacion --- */
    if (w.hitstop > 0) {
      w.hitstop--;
    } else {
      const i1 = G.phase === 'fight' ? Input.intent(1) : AI.blank();
      const i2 = G.phase !== 'fight' ? AI.blank()
        : (f2.cpu ? AI.think(f2, f1, w, 1) : Input.intent(2));
      f1.update(i1, f2, w);
      f2.update(i2, f1, w);
      resolveMelee(f1, f2, w);
      resolveMelee(f2, f1, w);
      pushApart(f1, f2);
      faceEachOther(f1, f2);
      w.update();
      if (G.phase === 'fight') {
        [f1, f2].forEach((f, i) => {
          if (!G.lowSaid[i] && f.hp > 0 && f.hp <= 25) {
            G.lowSaid[i] = true;
            w.say(f.def.name + ': ' + pick(COMMENTS.low), 200);
          }
        });
        if (f1.state === 'ko') endRound(f2);
        else if (f2.state === 'ko') endRound(f1);
      }
    }

    drawArena(w, f1, f2);
    updateHud();
  }

  function pushApart(a, b) {
    const d = b.x - a.x;
    const min = 15;
    if (Math.abs(d) < min && a.state !== 'ko' && b.state !== 'ko') {
      const push = (min - Math.abs(d)) / 2 * (d >= 0 ? 1 : -1);
      a.x = clamp(a.x - push * 0.6, 12, W - 12);
      b.x = clamp(b.x + push * 0.6, 12, W - 12);
    }
  }

  function faceEachOther(a, b) {
    if (a.onGround && a.state !== 'attack' && a.state !== 'dash' && a.state !== 'ko') a.dir = b.x >= a.x ? 1 : -1;
    if (b.onGround && b.state !== 'attack' && b.state !== 'dash' && b.state !== 'ko') b.dir = a.x >= b.x ? 1 : -1;
  }

  /* ---------------- dibujo de la arena ---------------- */
  function drawArena(w, f1, f2) {
    ctx.save();
    if (w.shake > 0) ctx.translate(irnd(-2, 2), irnd(-2, 2));
    drawStage(ctx, w.stage, w.t);
    w.drawBack(ctx);
    for (const f of [f1, f2]) {
      const alt = clamp(GROUND - f.y, 0, 60);
      Pix.shadow(ctx, f.x, GROUND, Math.max(8, 20 - alt * 0.22));
      drawAura(f);
      drawFighter(ctx, f);
    }
    w.drawFront(ctx);
    ctx.restore();
  }

  function drawAura(f) {
    if (f.guard > 0) {
      for (let i = 0; i < 6; i++) {
        const a = f.t / 10 + i;
        Pix.r(ctx, f.x + Math.cos(a) * 13, f.y - 22 + Math.sin(a) * 20, 2, 2, '#9bf59b');
      }
    }
    if (f.slow > 0 && f.t % 12 < 6) {
      Pix.text(ctx, '~', f.x - 10, f.y - 50, '#48e0d0', 'center', 8);
      Pix.text(ctx, '~', f.x + 10, f.y - 54, '#48e0d0', 'center', 8);
    }
    if (f.meter >= 100 && f.state !== 'ko' && f.t % 20 < 10) {
      Pix.r(ctx, f.x - 9, f.y + 1, 18, 1, '#f5c542');
    }
  }

  /* ---------------- HUD ---------------- */
  function updateHud() {
    const f1 = G.f1, f2 = G.f2;
    if (!f1) return;
    const set = (id, f) => {
      const el = $(id);
      el.style.width = (f.hp / f.maxHp * 100) + '%';
      el.classList.toggle('low', f.hp <= 30);
    };
    set('p1hp', f1); set('p2hp', f2);
    $('p1meter').style.width = f1.meter + '%';
    $('p2meter').style.width = f2.meter + '%';
    $('p1meter').parentElement.classList.toggle('full', f1.meter >= 100);
    $('p2meter').parentElement.classList.toggle('full', f2.meter >= 100);
    $('p1mlab').textContent = f1.meter >= 100 ? '¡SUPER LISTO!' : 'SUPER ' + Math.floor(f1.meter) + '%';
    $('p2mlab').textContent = f2.meter >= 100 ? '¡SUPER LISTO!' : 'SUPER ' + Math.floor(f2.meter) + '%';
    const secs = Math.ceil(G.timer / 60);
    $('timer').textContent = secs < 10 ? '0' + secs : secs;
    $('timer').classList.toggle('danger', secs <= 10);
    pips('p1pips', f1.wins); pips('p2pips', f2.wins);
    const ch = G.world && G.world.chyron, chEl = $('chyron');
    chEl.classList.toggle('on', !!ch);
    if (ch && chEl.dataset.cid !== String(ch.id)) {
      chEl.innerHTML = '<span>' + ch.text + '</span>';
      chEl.dataset.cid = String(ch.id);
    }
    combo('combo1', f1); combo('combo2', f2);
  }
  function pips(id, n) {
    const el = $(id);
    if (el.children.length !== WINS_NEEDED) {
      el.innerHTML = '';
      for (let i = 0; i < WINS_NEEDED; i++) { const d = document.createElement('i'); d.className = 'pip'; el.appendChild(d); }
    }
    for (let i = 0; i < WINS_NEEDED; i++)
      el.children[i].style.background = i < n ? '#f5c542' : '#2a3550';
  }
  function combo(id, f) {
    const el = $(id);
    const on = f.combo >= 2 && f.comboT > 0;
    el.classList.toggle('on', on);
    if (on) el.textContent = f.combo + ' GOLPES';
  }

  /* =======================================================
     PANTALLA: RESULTADO
     ======================================================= */
  function gotoResult() {
    G.screen = 'result';
    const w = G.winner;
    $('winnerName').textContent = w.def.name + ' GANA';
    $('winnerQuote').textContent = '"' + pick(w.def.quotes) + '"';
    show('result');
    Sfx.win();
  }

  /* =======================================================
     PAUSA
     ======================================================= */
  function togglePause() {
    if (G.screen === 'fight') { G.screen = 'pause'; show('pause'); }
    else if (G.screen === 'pause') { G.screen = 'fight'; show('hud'); }
  }

  /* =======================================================
     BUCLE PRINCIPAL (60 fps fijos)
     ======================================================= */
  let acc = 0, last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    acc += Math.min(now - last, 100);
    last = now;
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      tick();
    }
    tickAnnounce();
  }

  function tick() {
    if (tapped('Escape') && (G.screen === 'fight' || G.screen === 'pause')) togglePause();
    switch (G.screen) {
      case 'title': stepAttract(); if (tapped('Enter')) gotoSelect('1p'); break;
      case 'howto': stepAttract(); if (tapped('Escape') || tapped('Enter')) gotoTitle(); break;
      case 'select': stepSelect(); break;
      case 'fight': stepFight(); break;
      case 'pause': if (G.world) drawArena(G.world, G.f1, G.f2); break;
      case 'result':
        if (G.world) drawArena(G.world, G.f1, G.f2);
        if (tapped('Enter')) { show('hud'); G.screen = 'fight'; startMatch(); }
        break;
    }
    Input.clearTaps();
  }

  /* ---------------- botones ---------------- */
  document.querySelectorAll('.btn[data-mode]').forEach(b =>
    b.addEventListener('click', () => { Sfx.init(); Sfx.resume(); gotoSelect(b.dataset.mode); }));
  $('typeHelp').innerHTML =
    '<div class="thead">TABLA DE TIPOS — CADA UNO LE PEGA 40% MÁS FUERTE A:</div>' +
    Object.keys(TYPES).map(id => '<div class="trow">' + typeChip(id, true) + '<b>&gt;</b>' +
      CHART[id].strong.map(s2 => TYPES[s2].icon + ' ' + TYPES[s2].name).join(', ') + '</div>').join('');
  $('howtoBtn').addEventListener('click', () => { G.screen = 'howto'; show('howto'); });
  $('howtoBack').addEventListener('click', gotoTitle);
  $('resumeBtn').addEventListener('click', togglePause);
  $('quitBtn').addEventListener('click', gotoTitle);
  $('againBtn').addEventListener('click', () => { show('hud'); G.screen = 'fight'; startMatch(); });
  $('menuBtn').addEventListener('click', gotoTitle);

  /* ---------------- arranque ---------------- */
  Sfx.quiet = true;
  gotoTitle();
  requestAnimationFrame(loop);
})();

/* =========================================================
   fighter.js — maquina de estados del luchador y combate
   ========================================================= */

const TAUNT_REACTIONS = [
  'SE ESTÁ BURLANDO. QUÉ FALTA DE RESPETO.',
  'ESO LO VA A PAGAR CARO.',
  'EL PÚBLICO ABUCHEA. UN POCO.',
  'PROVOCAR GRATIS NO EXISTE.',
  'LA BURLA CARGA BARRA. LA VERGÜENZA NO SE VA.'
];

/* frase de un luchador según la situación */
function barkLine(f, kind) {
  const b = f.def.barks;
  if (!b || !b[kind] || !b[kind].length) return null;
  return pick(b[kind]);
}
/* saludo inicial: si hay pique con ese rival, se usa el suyo */
function introLine(f, opp) {
  const b = f.def.barks;
  if (!b) return null;
  if (b.vs && b.vs[opp.def.id]) return b.vs[opp.def.id];
  return barkLine(f, 'intro');
}

const GRAV = 0.42;
const JUMP_V = -6.3;

const ATTACKS = {
  punch: { startup: 3, active: 3, recover: 7, dmg: 5, reach: 22, h: 12, oy: -48, push: 1.7, hitstun: 11, anim: 'punch', name: 'PUÑO' },
  kick: { startup: 6, active: 4, recover: 12, dmg: 9, reach: 32, h: 13, oy: -38, push: 3.4, hitstun: 17, anim: 'kick', name: 'PATADA' },
  low: { startup: 5, active: 4, recover: 11, dmg: 7, reach: 29, h: 10, oy: -14, push: 2.0, hitstun: 15, anim: 'kick', low: true, name: 'BARRIDA' },
  upper: { startup: 5, active: 5, recover: 17, dmg: 13, reach: 22, h: 32, oy: -62, push: 2.4, hitstun: 26, anim: 'upper', launch: true, name: 'UPPERCUT' },
  air: { startup: 4, active: 9, recover: 7, dmg: 8, reach: 26, h: 14, oy: -29, push: 2.9, hitstun: 16, anim: 'kick', air: true, name: 'PATADA AÉREA' },
  cast: { startup: 9, active: 1, recover: 15, anim: 'cast', name: 'ESPECIAL' },
  taunt: { startup: 8, active: 1, recover: 22, anim: 'taunt', name: 'BURLA' }
};

class Fighter {
  constructor(def, x, dir, playerNum, isCPU) {
    this.def = def;
    this.x = x; this.y = GROUND;
    this.dir = dir;
    this.vx = 0; this.vy = 0;
    this.onGround = true;
    this.maxHp = def.hp || 100; this.hp = this.maxHp;
    this.meter = 0;
    this.wins = 0;
    this.player = playerNum;
    this.cpu = !!isCPU;
    this.reset(x, dir);
  }

  reset(x, dir) {
    this.x = x; this.y = GROUND; this.dir = dir;
    this.vx = 0; this.vy = 0; this.onGround = true;
    this.hp = this.maxHp;
    this.stunT = 0;
    this.state = 'idle';
    this.t = 0;
    this.atk = null; this.atkT = 0; this.hasHit = false;
    this.pendingSp = null;
    this.hitstun = 0; this.flash = 0;
    this.crouching = false; this.blocking = false;
    this.guard = 0; this.slow = 0; this.burn = 0;
    this.hpShown = this.maxHp; this.hpGhost = this.maxHp; this.ghostWait = 0;
    this.tauntPending = false; this.lastTypeSay = -999; this.barkCd = 0;
    this.combo = 0; this.comboT = 0;
    this.koT = 0; this.dead = false;
    this.frozen = 0;
    this.dashT = 0; this.dashSp = null; this.dashCd = 0; this.dashHits = 0;
    this.squash = 0;
    this.prev = {};
  }

  get speed() { return this.def.speed * (this.slow > 0 ? 0.45 : 1); }

  hurtbox() {
    const low = this.crouching || (this.atk && this.atk.low);
    const h = low ? 50 : 74;
    return { x: this.x - 10, y: this.y - h, w: 20, h };
  }

  attackBox() {
    const a = this.atk;
    if (!a || !a.reach || !this.isActive()) return null;
    return {
      x: this.dir > 0 ? this.x + 7 : this.x - 7 - a.reach,
      y: this.y + a.oy,
      w: a.reach,
      h: a.h
    };
  }

  isActive() {
    const a = this.atk;
    return a && this.atkT >= a.startup && this.atkT < a.startup + a.active;
  }

  atkPhase() {
    const a = this.atk, t = this.atkT;
    if (!a) return 0;
    if (t < a.startup) return -0.5 * Math.sin((t / a.startup) * Math.PI / 2);   // recoge el brazo
    if (t < a.startup + a.active) return 1;
    return Math.max(0, 1 - (t - a.startup - a.active) / a.recover);
  }

  canBlock(src) {
    return this.blocking && this.onGround && this.state !== 'attack' &&
      this.state !== 'dash' && this.hitstun <= 0 &&
      Math.sign(src.x - this.x) === this.dir;
  }

  /* ---------------- entradas ---------------- */
  edge(inp, key) {
    const now = !!inp[key], was = !!this.prev[key];
    this.prev[key] = now;
    return now && !was;
  }

  update(inp, opp, world) {
    this.t++;
    /* la barra baja con inercia y deja un rastro que se vacía después */
    this.hpShown += (this.hp - this.hpShown) * 0.45;
    if (Math.abs(this.hpShown - this.hp) < 0.4) this.hpShown = this.hp;
    if (this.hpGhost > this.hp) {
      if (this.ghostWait > 0) this.ghostWait--;
      else this.hpGhost = Math.max(this.hp, this.hpGhost - 0.55);
    } else this.hpGhost = this.hp;
    if (this.flash > 0) this.flash--;
    if (this.guard > 0) this.guard--;
    if (this.slow > 0) this.slow--;
    if (this.dashCd > 0) this.dashCd--;
    if (this.squash > 0) this.squash--;
    if (this.barkCd > 0) this.barkCd--;
    if (this.burn > 0) {                       // la sopa de la abuela sigue quemando
      this.burn--;
      if (this.burn % 26 === 0 && this.hp > 1) {
        this.hp = Math.max(1, this.hp - 1);
        world.parts.push(new Particle(this.x + rnd(-6, 6), this.y - rnd(14, 58), rnd(-.3, .3), -0.5, 22, '#f0932b', 1, -0.02));
        if (this.burn % 78 === 0) world.popup(this.x, this.y - 80, '¡AY!', '#f0932b');
      }
    }
    if (this.comboT > 0 && --this.comboT === 0) this.combo = 0;

    /* registra flancos aunque no podamos actuar */
    const pPunch = this.edge(inp, 'punch');
    const pKick = this.edge(inp, 'kick');
    const pSpec = this.edge(inp, 'special');
    const pSuper = this.edge(inp, 'super');
    const pUp = this.edge(inp, 'up');
    const pTaunt = this.edge(inp, 'taunt');

    if (this.state === 'ko') {
      this.koT = Math.min(1, this.koT + 0.14);
      this.physics(world);
      return;
    }
    if (this.state === 'win' || this.frozen > 0) {
      if (this.frozen > 0) this.frozen--;
      this.vx *= 0.8;
      this.physics(world);
      return;
    }
    if (this.hitstun > 0) {
      this.hitstun--;
      this.blocking = false;
      this.physics(world);
      if (this.hitstun === 0 && this.state === 'hit') this.state = 'idle';
      return;
    }
    if (this.stunT > 0) {                       // aturdido: no responde
      this.stunT--;
      this.vx *= 0.85;
      this.state = 'hit';
      this.physics(world);
      if (this.stunT === 0) this.state = 'idle';
      return;
    }
    if (this.state === 'dash') { this.dashUpdate(world, opp); return; }
    if (this.state === 'attack') { this.attackUpdate(world); this.physics(world); return; }

    /* ---- estado libre ---- */
    const away = (opp.x >= this.x) ? -1 : 1;
    this.crouching = !!inp.down && this.onGround;
    this.blocking = this.onGround &&
      ((away < 0 && inp.left) || (away > 0 && inp.right));

    this.vx = 0;
    if (this.onGround && !this.crouching) {
      if (inp.left) this.vx = -this.speed * (away < 0 ? 0.75 : 1);
      if (inp.right) this.vx = this.speed * (away > 0 ? 0.75 : 1);
    }

    if (pUp && this.onGround && !this.crouching) {
      this.vy = JUMP_V * (this.def.jump || 1);
      this.onGround = false;
      this.vx = (inp.left ? -1 : inp.right ? 1 : 0) * this.speed * 1.15;
      world.dust(this.x, GROUND - 1, 0);
      Sfx.jump();
    }

    if (pSuper && this.meter >= 100) { this.startSpecial(this.def.superMove, world, true); return; }
    if (pSpec && this.meter >= this.def.special.cost) { this.startSpecial(this.def.special, world, false); return; }
    if (pTaunt && this.onGround) { this.startTaunt(); return; }
    if (pPunch) { this.startAttack(!this.onGround ? ATTACKS.air : this.crouching ? ATTACKS.upper : ATTACKS.punch); return; }
    if (pKick) { this.startAttack(!this.onGround ? ATTACKS.air : this.crouching ? ATTACKS.low : ATTACKS.kick); return; }

    this.state = this.onGround ? (this.crouching ? 'crouch' : (this.vx !== 0 ? 'walk' : 'idle')) : 'jump';
    this.physics(world);
  }

  startAttack(a) {
    /* cada personaje golpea a su ritmo y con su alcance */
    const sp = this.def.atkSpeed || 1, rc = this.def.reach || 1;
    this.atk = Object.assign({}, a, {
      startup: Math.max(2, Math.round(a.startup / sp)),
      recover: Math.max(3, Math.round(a.recover / sp)),
      reach: Math.round(a.reach * rc)
    });
    this.atkT = 0;
    this.hasHit = false;
    this.state = 'attack';
    this.blocking = false;
    Sfx.whiff();
  }

  startTaunt() {
    this.atk = ATTACKS.taunt;
    this.atkT = 0;
    this.hasHit = true;
    this.tauntPending = true;
    this.state = 'attack';
    this.blocking = false;
    this.crouching = false;
    this.vx = 0;
  }

  startSpecial(sp, world, isSuper) {
    this.meter -= sp.cost;
    this.atk = Object.assign({}, ATTACKS.cast, { startup: isSuper ? 12 : 9 });
    this.atkT = 0;
    this.hasHit = true;
    this.pendingSp = sp;
    this.state = 'attack';
    this.blocking = false;
    this.crouching = false;
    world.popup(this.x, this.y - 82, sp.name, isSuper ? '#f5c542' : '#48e0d0');
    if (isSuper) { world.flash = 10; world.shake = 6; }
  }

  attackUpdate(world) {
    this.atkT++;
    const a = this.atk;
    if (this.tauntPending && this.atkT === a.startup) {
      this.tauntPending = false;
      this.meter = Math.min(100, this.meter + 12);   // burlarse carga barra... si te dejan
      world.bark(this, this.def.taunt, true);
      world.say(pick(TAUNT_REACTIONS));
      Sfx.taunt();
    }
    if (this.pendingSp && this.atkT === a.startup) {
      const sp = this.pendingSp;
      this.pendingSp = null;          // se limpia antes: 'dash' cambia de estado
      world.fire(this, sp);
      if (sp.say) world.bark(this, sp.say, true);
      if (this.state !== 'attack') return;
    }
    if (this.atkT >= a.startup + a.active + a.recover) {
      this.atk = null;
      this.state = 'idle';
    }
  }

  startDash(sp) {
    this.state = 'dash';
    this.dashSp = sp;
    this.dashT = sp.dur || 30;
    this.dashHits = sp.hits || 3;
    this.dashCd = 0;
    this.atk = null;
    this.pendingSp = null;
    this.vy = sp.air ? -1.4 : 0;
  }

  dashUpdate(world, opp) {
    const sp = this.dashSp;
    this.vx = this.dir * sp.speed;
    if (sp.air) this.vy += 0.05;
    this.physics(world);
    if (world.t % 3 === 0) world.dust(this.x - this.dir * 6, this.y - 2, this.dir);
    if (this.dashCd <= 0 && this.dashHits > 0 && opp && opp.state !== 'ko' &&
      aabb(this.hurtbox(), opp.hurtbox())) {
      dealDamage(this, opp, sp.dmg, { push: 1.6, hitstun: 12, noBlockStop: true }, world);
      this.dashHits--;
      this.dashCd = 7;
    }
    if (--this.dashT <= 0 || this.x <= 14 || this.x >= W - 14) {
      this.state = 'idle';
      this.vx = 0;
      this.vy = sp.air ? this.vy : 0;
    }
  }

  physics(world) {
    if (!this.onGround) this.vy += GRAV;
    this.x += this.vx;
    this.y += this.vy;

    /* muros del rival bloquean el paso */
    for (const wl of world.walls) {
      if (wl.owner === this) continue;
      const hb = this.hurtbox();
      if (aabb(hb, wl.box())) {
        const wb = wl.box();
        if (this.x < wl.x) this.x = wb.x - 7;
        else this.x = wb.x + wb.w + 7;
        this.vx = 0;
      }
    }

    if (this.y >= GROUND) {
      if (!this.onGround) {
        this.squash = 6;
        world.dust(this.x, GROUND - 1, 0);
        if (this.state === 'jump' || this.state === 'attack') this.state = 'idle';
      }
      this.y = GROUND; this.vy = 0; this.onGround = true;
      this.vx *= 0.6;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    } else {
      this.onGround = false;
    }
    this.x = clamp(this.x, 12, W - 12);
  }

  animParams() {
    const A = {
      crouch: 0, punch: 0, kick: 0, kickHigh: false, cast: 0, walk: 0, lean: 0,
      air: false, ko: 0, bob: 0, block: false, spin: false, punchUp: false,
      flash: this.flash > 0 && this.flash % 4 < 2
    };
    if (this.squash > 0) A.crouch = this.squash * 1.6;
    if (this.state === 'ko') { A.ko = this.koT; return A; }
    if (this.state === 'dash') { A.spin = true; A.walk = this.t * 0.6; return A; }
    if (!this.onGround) A.air = true;
    if (this.state === 'hit') { A.crouch = 3; A.lean = -5; return A; }
    if (this.crouching) A.crouch = 11;
    if (this.blocking) A.block = true;
    if (this.state === 'attack' && this.atk) {
      const a = this.atk, p = this.atkPhase();
      if (a.anim === 'punch') { A.punch = p; A.lean = p > 0 ? 3 * p : 6 * p; }
      else if (a.anim === 'upper') { A.punch = p; A.punchUp = true; A.lean = p > 0 ? -2 * p : 5 * p; }
      else if (a.anim === 'kick') { A.kick = Math.max(0, p); A.kickHigh = !a.low; A.lean = p > 0 ? -3 * p : 5 * p; }
      else if (a.anim === 'cast') A.cast = Math.max(0, p);
      else if (a.anim === 'taunt') { A.cast = Math.max(0, p); A.bob = this.atkT % 8 < 4 ? 1 : 0; }
      if (a.low) A.crouch = 9;
    } else if (this.state === 'walk') {
      A.walk = this.t * 0.26;
    } else if (this.state === 'win') {
      A.bob = Math.sin(this.t / 6) > 0 ? 1 : 0;
      A.punch = Math.sin(this.t / 6) > 0 ? 0.5 : 0.2;
      A.punchUp = true;
    } else {
      A.bob = Math.sin(this.t / 16) > 0.5 ? 1 : 0;
      A.walk = Math.sin(this.t / 22) * 0.22;      // respiración: los brazos se mecen
    }
    return A;
  }
}

/* ---------------------------------------------------------
   Resolucion de golpes
   --------------------------------------------------------- */
function dealDamage(src, tgt, dmg, opts, world) {
  opts = opts || {};
  if (!tgt || tgt.state === 'ko' || tgt.dead) return false;

  const blocked = !opts.unblockable && tgt.canBlock(src);
  const tm = typeMult(src.def.type, tgt.def.type);      // ventaja de tipo estilo Pokémon
  let d = Math.round(dmg * (src.def.power || 1) * tm.m);
  if (blocked) d = Math.max(1, Math.round(d * 0.22));
  if (tgt.guard > 0) d = Math.max(1, Math.round(d * 0.6));

  tgt.hp = Math.max(0, tgt.hp - d);
  tgt.flash = blocked ? 4 : 10;
  tgt.ghostWait = 32;
  tgt.combo = 0; tgt.comboT = 0;

  const dirAway = Math.sign(tgt.x - src.x) || src.dir;
  const cx = (src.x + tgt.x) / 2;
  const cy = tgt.y - 40;

  if (blocked) {
    tgt.vx = dirAway * (opts.push || 1) * 0.5;
    tgt.hitstun = 7;
    world.impact(cx, cy, false);
    world.burst(cx, cy, 5, '#a8d8ff');
    if (Math.random() < 0.14) world.bark(tgt, barkLine(tgt, 'block'));
    world.popup(tgt.x, tgt.y - 74, 'BLOQUEO', '#a8d8ff');
    world.shake = 2;
    world.hitstop = 2;
    Sfx.block();
  } else {
    tgt.vx = dirAway * (opts.push || 1.5);
    tgt.hitstun = opts.hitstun || 12;
    tgt.state = 'hit';
    tgt.atk = null;
    tgt.pendingSp = null;
    tgt.blocking = false;
    if (opts.launch) { tgt.vy = -5.2; tgt.onGround = false; }
    src.combo++; src.comboT = 90;
    /* comentario del que pega o del que lo recibe, nunca los dos a la vez */
    if (tm.kind === 'super' && Math.random() < 0.5) world.bark(src, barkLine(src, 'gloat'));
    else if (d >= 9 && Math.random() < 0.3) world.bark(src, barkLine(src, 'hit'));
    else if (Math.random() < 0.22) world.bark(tgt, barkLine(tgt, 'hurt'));
    const big = d > 9 || tm.kind === 'super';
    world.impact(cx, cy, big);
    world.burst(cx, cy, big ? 12 : 7, tm.kind === 'super' ? '#f5c542' : (big ? '#ffe07a' : '#ffffff'));
    world.popup(tgt.x, tgt.y - 78, '-' + d, tm.kind === 'super' ? '#f5c542' : (tm.kind === 'weak' ? '#9aa6bd' : '#ffffff'));
    world.shake = big ? 8 : 4;
    world.hitstop = big ? 6 : 3;
    if (big) Sfx.bigHit(); else Sfx.hit();

    /* el chiste del cruce de tipos, sin repetirlo cada golpe */
    if (tm.kind !== 'normal' && world.t - src.lastTypeSay > 110) {
      src.lastTypeSay = world.t;
      if (tm.kind === 'super') {
        world.popup(tgt.x, tgt.y - 96, '¡SUPER EFECTIVO!', '#f5c542');
        world.flash = 6;
        Sfx.superEff();
      } else {
        world.popup(tgt.x, tgt.y - 96, 'poco efectivo...', '#9aa6bd');
      }
      world.say(tm.msg);
    }
  }

  if (opts.effect === 'slow' && !blocked) {
    tgt.slow = 260;
    world.popup(tgt.x, tgt.y - 90, 'LAG', '#48e0d0');
  }
  if (opts.effect === 'stun' && !blocked) {
    tgt.stunT = 105;
    world.popup(tgt.x, tgt.y - 90, '¡ATURDIDO!', '#f07ac0');
  }
  if (opts.effect === 'burn' && !blocked) {
    tgt.burn = 300;
    world.popup(tgt.x, tgt.y - 90, '¡QUEMA!', '#f0932b');
    world.say('LA SOPA ESTABA HIRVIENDO. SIEMPRE ESTÁ HIRVIENDO.');
  }

  src.meter = Math.min(100, src.meter + (blocked ? 4 : 9));
  tgt.meter = Math.min(100, tgt.meter + (blocked ? 3 : 6));

  if (tgt.hp <= 0) {
    world.koSuper = (tm.kind === 'super');
    tgt.state = 'ko';
    tgt.koT = 0;
    tgt.vy = -4.6;
    tgt.vx = dirAway * 2.4;
    tgt.onGround = false;
    tgt.hitstun = 0;
    world.flash = 12;
    world.shake = 16;
    world.burst(tgt.x, tgt.y - 36, 30, '#e0343c');
    Sfx.ko();
  }
  return !blocked;
}

/* golpes cuerpo a cuerpo: comprueba hitbox contra hurtbox */
function resolveMelee(att, def, world) {
  if (att.state !== 'attack' || att.hasHit) return;
  const box = att.attackBox();
  if (!box) return;
  if (aabb(box, def.hurtbox())) {
    att.hasHit = true;
    dealDamage(att, def, att.atk.dmg, {
      push: att.atk.push,
      hitstun: att.atk.hitstun,
      launch: att.atk.launch
    }, world);
  }
}

/* =========================================================
   fighter.js — maquina de estados del luchador y combate
   ========================================================= */

/* frase de un luchador según la situación */
function barkLine(f, kind) {
  const b = f.def.barks;
  if (!b || !b[kind] || !b[kind].length) return null;
  return pick(b[kind]);
}
/* Frase al pulsar la tecla de hablar: la elige según cómo va el combate.
   No es una frase fija: cambia si vas ganando, si estás al límite, si el
   rival tiene pique escrito contigo o si lo tienes encima. */
function tauntLine(f, opp) {
  const b = f.def.barks;
  if (!b) return { text: f.def.taunt, kind: 'burla' };
  if (opp.state === 'ko' || opp.hp <= opp.maxHp * 0.22)
    return { text: pick(b.win.concat(b.gloat)), kind: 'corona' };
  if (f.hp <= f.maxHp * 0.3)
    return { text: pick(b.low), kind: 'alerta' };
  if (b.vs && b.vs[opp.def.id] && Math.random() < 0.6)
    return { text: b.vs[opp.def.id], kind: 'chulo' };
  if (Math.abs(opp.x - f.x) < 60)
    return { text: pick(b.hit.concat([f.def.taunt])), kind: 'burla' };
  return { text: pick(b.intro.concat(b.gloat)), kind: 'tipo' };
}

/* saludo inicial: si hay pique con ese rival, se usa el suyo */
function introLine(f, opp) {
  const b = f.def.barks;
  if (!b) return null;
  if (b.vs && b.vs[opp.def.id]) return b.vs[opp.def.id];
  return barkLine(f, 'intro');
}

const GRAV = 0.42;
const JUMP_V = -6.6;

const ATTACKS = {
  punch: { startup: 3, active: 3, recover: 7, dmg: 5, reach: 27, h: 15, oy: -59, push: 1.7, hitstun: 11, anim: 'punch', name: 'PUÑO' },
  kick: { startup: 6, active: 4, recover: 12, dmg: 9, reach: 39, h: 16, oy: -47, push: 3.4, hitstun: 17, anim: 'kick', name: 'PATADA' },
  low: { startup: 5, active: 4, recover: 11, dmg: 7, reach: 36, h: 13, oy: -18, push: 2.0, hitstun: 15, anim: 'kick', low: true, name: 'BARRIDA' },
  upper: { startup: 5, active: 5, recover: 17, dmg: 13, reach: 27, h: 39, oy: -76, push: 2.4, hitstun: 26, anim: 'upper', launch: true, name: 'UPPERCUT' },
  air: { startup: 4, active: 9, recover: 7, dmg: 8, reach: 32, h: 17, oy: -36, push: 2.9, hitstun: 16, anim: 'kick', air: true, name: 'PATADA AÉREA' },
  cast: { startup: 9, active: 1, recover: 15, anim: 'cast', name: 'ESPECIAL' },
  nose: { startup: 9, active: 13, recover: 18, dmg: 12, reach: 66, h: 10, oy: -76, push: 3.2, hitstun: 20, anim: 'nose', name: 'NARIZÓN' },
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
    this.catchT = 0;
    this.baby = false; this.launched = false;
    this.tauntPending = false; this.lastTypeSay = -999; this.barkCd = 0;
    this.combo = 0; this.comboT = 0;
    this.koT = 0; this.dead = false;
    this.frozen = 0;
    this.dashT = 0; this.dashSp = null; this.dashCd = 0; this.dashHits = 0;
    this.counterT = 0;                  // postura de contra del Chad
    this.moonT = 0; this.moonSp = null; // moonwalk de Michael
    this.squash = 0;
    this.prev = {};
  }

  get speed() { return this.def.speed * (this.slow > 0 ? 0.45 : 1); }

  hurtbox() {
    const hu = this.def.hurt;                    // el coche es bajo y ancho
    if (hu) return { x: this.x - hu.w / 2, y: this.y - hu.h, w: hu.w, h: hu.h };
    const low = this.crouching || (this.atk && this.atk.low);
    const h = low ? 62 : 91;
    return { x: this.x - 12, y: this.y - h, w: 25, h };
  }

  attackBox() {
    const a = this.atk;
    if (!a || !a.reach || !this.isActive()) return null;
    const hu = this.def.hurt;
    /* el coche pega con el parachoques: sale de su morro y a su altura */
    const off = hu ? hu.w / 2 - 5 : 9;
    const oy = hu ? Math.max(a.oy, -(hu.h - a.h)) : a.oy;
    return {
      x: this.dir > 0 ? this.x + off : this.x - off - a.reach,
      y: this.y + oy,
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
    if (this.counterT > 0 && --this.counterT === 0) world.emote(this, 'duda');
    if (this.squash > 0) this.squash--;
    if (this.barkCd > 0) this.barkCd--;
    if (this.catchT > 0) this.catchT--;
    if (this.burn > 0) {                       // la sopa de la abuela sigue quemando
      this.burn--;
      if (this.burn % 26 === 0 && this.hp > 1) {
        this.hp = Math.max(1, this.hp - 1);
        world.parts.push(new Particle(this.x + rnd(-8, 8), this.y - rnd(17, 72), rnd(-.3, .3), -0.5, 22, '#f0932b', 1, -0.02));
        if (this.burn % 78 === 0) world.popup(this.x, this.y - 98, '¡AY!', '#f0932b');
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
      if (!this.baby) this.koT = Math.min(1, this.koT + 0.14);
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
    if (this.state === 'moon') {
      /* el paso se corta al pulsar cualquier cosa, y esa pulsación
         se aprovecha en este mismo fotograma: nada de tragarse teclas */
      if (inp.punch || inp.kick || inp.special || inp.super || inp.up) {
        this.state = 'idle'; this.vx = 0; this.moonT = 0;
      } else { this.moonUpdate(world); return; }
    }
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
    if (pTaunt && this.onGround) { this.startTaunt(opp); return; }
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

  startTaunt(opp) {
    this.tauntSay = opp ? tauntLine(this, opp) : { text: this.def.taunt, kind: 'burla' };
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
    world.popup(this.x, this.y - 79, sp.name, isSuper ? '#f5c542' : '#48e0d0');
    if (isSuper) { world.flash = 10; world.shake = 6; }
  }

  attackUpdate(world) {
    this.atkT++;
    const a = this.atk;
    if (this.tauntPending && this.atkT === a.startup) {
      this.tauntPending = false;
      this.meter = Math.min(100, this.meter + 12);   // burlarse carga barra... si te dejan
      const t = this.tauntSay || { text: this.def.taunt, kind: 'burla' };
      world.emote(this, t.kind, t.text, true);      // su frase manda en el rótulo
      Sfx.taunt();
    }
    if (this.pendingSp && this.atkT === a.startup) {
      const sp = this.pendingSp;
      this.pendingSp = null;          // se limpia antes: 'dash' cambia de estado
      world.fire(this, sp);
      if (sp.say) world.emote(this, 'tipo', sp.say, true);
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
      dealDamage(this, opp, sp.dmg,
        { push: 1.6, hitstun: 12, noBlockStop: true, unblockable: !!sp.unblockable }, world);
      this.dashHits--;
      this.dashCd = 7;
    }
    const chocado = this.x <= 14 || this.x >= W - 14;
    if (--this.dashT <= 0 || chocado) {
      this.state = 'idle';
      this.vx = 0;
      this.vy = sp.air ? this.vy : 0;
      /* SE VA DEL MEET: si acaba estampado contra el borde, se lo come él */
      if (sp.recoil && chocado) {
        this.hp = Math.max(1, this.hp - sp.recoil);
        world.impact(this.x, this.y - 46, true);
        world.burst(this.x, this.y - 46, 22, '#f0932b');
        world.popup(this.x, this.y - 106, '-' + sp.recoil + ' CHAPA', '#f0932b');
        world.shake = 14;
        world.say('SE FUE DEL MEET. COMO SIEMPRE.', 190, '#c0392b');
        this.squash = 8;
        Sfx.bigHit();
      }
    }
  }

  /* moonwalk: se desliza hacia atrás sin dejar de encarar al rival.
     Mientras dura, los proyectiles le pasan de largo y carga barra. */
  moonUpdate(world) {
    const sp = this.moonSp;
    this.vx = -this.dir * (sp.speed || 1.5);
    this.physics(world);
    this.meter = Math.min(100, this.meter + (sp.gain || 0.5));
    if (world.t % 5 === 0) world.dust(this.x + this.dir * 8, GROUND - 1, -this.dir);
    if (--this.moonT <= 0) { this.state = 'idle'; this.vx = 0; }
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

    if (this.launched) {                       // va por el aire tras el remate
      this.vy += GRAV * 0.6;
      return;
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
    if (!this.launched) this.x = clamp(this.x, 12, W - 12);
  }

  animParams() {
    const A = {
      crouch: 0, punch: 0, kick: 0, kickHigh: false, cast: 0, walk: 0, lean: 0, nose: 0, baby: false, pose: false,
      air: false, ko: 0, bob: 0, block: false, spin: false, punchUp: false,
      flash: this.flash > 0 && this.flash % 4 < 2
    };
    if (this.squash > 0) A.crouch = this.squash * 1.6;
    if (this.state === 'ko') { A.ko = this.koT; A.baby = this.baby; return A; }
    /* embestida: cuerpo escorado hacia delante y hombro por delante */
    if (this.state === 'dash') {
      A.spin = true; A.walk = this.t * 0.6;
      A.lean = 6; A.crouch = 5; A.punch = 0.9;
      return A;
    }
    if (!this.onGround) A.air = true;
    if (this.state === 'hit') { A.crouch = 3; A.lean = -5; return A; }
    if (this.crouching) A.crouch = 11;
    if (this.blocking) A.block = true;
    if (this.state === 'attack' && this.atk) {
      const a = this.atk, p = this.atkPhase();
      if (a.anim === 'punch') { A.punch = p; A.lean = p > 0 ? 3 * p : 6 * p; }
      else if (a.anim === 'upper') { A.punch = p; A.punchUp = true; A.lean = p > 0 ? -2 * p : 5 * p; }
      else if (a.anim === 'kick') { A.kick = Math.max(0, p); A.kickHigh = !a.low; A.lean = p > 0 ? -3 * p : 5 * p; }
      else if (a.anim === 'nose') { A.nose = Math.max(0, p); A.lean = 4 * Math.max(0, p); }
      else if (a.anim === 'cast') A.cast = Math.max(0, p);
      else if (a.anim === 'taunt') { A.cast = Math.max(0, p); A.bob = this.atkT % 8 < 4 ? 1 : 0; }
      if (a.low) A.crouch = 9;
    } else if (this.state === 'moon') {
      A.walk = this.t * 0.34; A.lean = -4; A.crouch = 2;
    } else if (this.state === 'walk') {
      A.walk = this.t * 0.26;
    } else if (this.state === 'win') {
      A.bob = Math.sin(this.t / 6) > 0 ? 1 : 0;
      A.punch = Math.sin(this.t / 6) > 0 ? 0.5 : 0.2;
      A.punchUp = true;
    } else if (this.counterT > 0) {
      A.pose = true; A.lean = 2;                  // brazos cruzados, esperando
      A.bob = this.t % 14 < 7 ? 1 : 0;
    } else {
      /* postura de combate: rodillas algo flexionadas y peso adelante */
      A.bob = Math.sin(this.t / 16) > 0.5 ? 1 : 0;
      A.walk = Math.sin(this.t / 22) * 0.22;      // respiración: los brazos se mecen
      A.crouch = 2; A.lean = 1;
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

  /* POSE: el Chad no bloquea, devuelve. Se gasta con el primer golpe. */
  if (tgt.counterT > 0 && !opts.noCounter && src.state !== 'ko') {
    tgt.counterT = 0;
    world.hitstop = 9; world.flash = 10; world.shake = 11;
    world.popup(tgt.x, tgt.y - 112, '¡CONTRA!', '#d7dbe6');
    world.emote(tgt, 'chulo');
    world.duel(tgt, src, 'nullify', 'NO.');
    world.parts.push(new Shock(tgt.x, tgt.y - 52, '#e8ecf2', 78, 24));
    Sfx.superEff();
    /* al dinero le tiene especial manía: eso se lo devuelve doble */
    const rico = src.def.type === 'dinero';   /* la frase ya sale en el rótulo */
    dealDamage(tgt, src, Math.round(dmg * (rico ? 2.2 : 1.5)) + 4,
      { push: 3.4, hitstun: 24, unblockable: true, noCounter: true }, world);
    return false;
  }

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
  const cy = tgt.y - 49;

  if (blocked) {
    tgt.vx = dirAway * (opts.push || 1) * 0.5;
    tgt.hitstun = 7;
    world.impact(cx, cy, false);
    world.burst(cx, cy, 5, '#a8d8ff');
    if (Math.random() < 0.18) world.emote(tgt, 'escudo');
    world.popup(tgt.x, tgt.y - 91, 'BLOQUEO', '#a8d8ff');
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
    if (tm.kind === 'super' && Math.random() < 0.5) world.emote(src, 'chulo');
    else if (d >= 9 && Math.random() < 0.26) world.emote(src, 'golpe');
    else if (Math.random() < 0.22) world.emote(tgt, 'dolor');
    const big = d > 9 || tm.kind === 'super';
    world.impact(cx, cy, big);
    world.burst(cx, cy, big ? 12 : 7, tm.kind === 'super' ? '#f5c542' : (big ? '#ffe07a' : '#ffffff'));
    world.popup(tgt.x, tgt.y - 96, '-' + d, tm.kind === 'super' ? '#f5c542' : (tm.kind === 'weak' ? '#9aa6bd' : '#ffffff'));
    world.shake = big ? 8 : 4;
    world.hitstop = big ? 6 : 3;
    if (big) Sfx.bigHit(); else Sfx.hit();

    /* el chiste del cruce de tipos, sin repetirlo cada golpe */
    if (tm.kind !== 'normal' && world.t - src.lastTypeSay > 110) {
      src.lastTypeSay = world.t;
      if (tm.kind === 'super') {
        world.popup(tgt.x, tgt.y - 112, '¡SUPER EFECTIVO!', '#f5c542');
        world.flash = 6;
        Sfx.superEff();
      } else {
        world.popup(tgt.x, tgt.y - 112, 'poco efectivo...', '#9aa6bd');
      }
      world.say(tm.msg);
    }
  }

  if (opts.effect === 'slow' && !blocked) {
    tgt.slow = 260;
    world.popup(tgt.x, tgt.y - 106, 'LAG', '#48e0d0');
  }
  if (opts.effect === 'stun' && !blocked) {
    tgt.stunT = 105;
    world.popup(tgt.x, tgt.y - 106, '¡ATURDIDO!', '#f07ac0');
  }
  if (opts.effect === 'burn' && !blocked) {
    tgt.burn = 300;
    world.popup(tgt.x, tgt.y - 106, '¡QUEMA!', '#f0932b');
    world.say('LA SOPA ESTABA HIRVIENDO. SIEMPRE ESTÁ HIRVIENDO.');
  }

  /* si el empujón lo estampa contra el borde, duele más */
  if (opts.bounce && !blocked) {
    const room = dirAway > 0 ? (W - 12 - tgt.x) : (tgt.x - 12);
    if (room < 48) {
      const extra = Math.max(2, Math.round(d * 0.5));
      tgt.hp = Math.max(0, tgt.hp - extra);
      world.popup(tgt.x, tgt.y - 112, 'CONTRA LAS CUERDAS -' + extra, '#f050a0');
      world.impact(clamp(tgt.x + dirAway * 14, 8, W - 8), tgt.y - 52, true);
      world.shake = 13;
      Sfx.bigHit();
    }
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
    world.burst(tgt.x, tgt.y - 44, 30, '#e0343c');
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

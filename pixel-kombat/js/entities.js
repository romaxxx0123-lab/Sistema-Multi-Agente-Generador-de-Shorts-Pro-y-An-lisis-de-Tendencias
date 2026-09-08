/* =========================================================
   entities.js — proyectiles, muros, particulas y el "mundo"
   ========================================================= */

class Proj {
  constructor(owner, sp, o = {}) {
    this.owner = owner;
    this.sp = sp;
    this.art = ART[sp.art] || ART.bill;
    this.dir = owner.dir;
    this.x = o.x !== undefined ? o.x : owner.x + this.dir * 17;
    this.y = o.y !== undefined ? o.y : owner.y + (sp.oy || -30);
    this.vx = o.vx !== undefined ? o.vx : this.dir * (sp.speed || 2.4);
    this.vy = o.vy !== undefined ? o.vy : (sp.vy || 0);
    this.g = o.g !== undefined ? o.g : (sp.gravity || 0);
    this.life = sp.life || 120;
    this.dmg = sp.dmg;
    this.hom = sp.homing || 0;
    this.big = !!sp.big;
    this.effect = sp.effect || null;
    this.splash = !!sp.splash;
    this.rot = 0;
    this.age = 0;
    this.sc = 1;                       // los que crecen suben de tamaño
    this.rogue = !!o.rogue;            // cohete que sale al revés
    this.dead = false;
    this.w = this.art.rows[0].length * (this.big ? 2 : 1);
    this.h = this.art.rows.length * (this.big ? 2 : 1);
  }

  box() {
    const w = this.w * this.sc, h = this.h * this.sc;
    return { x: this.x - w / 2, y: this.y - h / 2, w, h };
  }

  update(world) {
    this.age++;
    if (this.sp.grow && this.age % 32 === 0 && this.sc < 3) this.sc++;   // cuanto más viaja, más pega
    const tgt = this.rogue ? this.owner : world.opponentOf(this.owner);
    if (this.hom && tgt) {
      const dy = (tgt.y - 34) - this.y;
      this.vy += clamp(dy, -1, 1) * this.hom;
      this.vy = clamp(this.vy, -2.2, 2.2);
      if (Math.sign(tgt.x - this.x) !== 0) this.vx += Math.sign(tgt.x - this.x) * this.hom * 0.5;
      this.vx = clamp(this.vx, -3.4, 3.4);
    }
    this.vy += this.g;
    this.x += this.vx;
    this.y += this.vy;
    this.rot += 0.35;
    this.life--;

    if (this.life <= 0 || this.x < -20 || this.x > W + 20) { this.pop(world); return; }
    if (this.y > GROUND - 2) {
      if (this.splash) { world.burst(this.x, GROUND - 3, 12, '#f2f4ee'); Sfx.hit(); }
      this.pop(world); return;
    }

    /* muros enemigos frenan proyectiles */
    for (const wl of world.walls) {
      if (wl.owner !== this.owner && aabb(this.box(), wl.box())) {
        wl.hp -= this.dmg;
        world.burst(this.x, this.y, 8, '#f5c542');
        Sfx.block();
        this.pop(world);
        return;
      }
    }

    if (tgt && !tgt.dead && tgt.catchT > 0 && !this.rogue && aabb(this.box(), tgt.hurtbox())) {
      tgt.meter = Math.min(100, tgt.meter + 14);
      world.popup(this.x, this.y - 14, '¡ATAJADA!', '#c9f542');
      world.parts.push(new Shock(this.x, this.y, '#c9f542', 34, 14));
      world.duel(tgt, this.owner, 'catch', '¡ATAJADA!');
      Sfx.block();
      this.pop(world);
      return;
    }
    if (tgt && !tgt.dead && aabb(this.box(), tgt.hurtbox())) {
      const src = this.rogue ? (world.opponentOf(this.owner) || this.owner) : this.owner;
      dealDamage(src, tgt, this.dmg * this.sc, {
        push: this.sp.push || (this.big ? 3.4 : 2.2),
        hitstun: this.big ? 22 : 16,
        effect: this.effect,
        projectile: true
      }, world);
      if (this.rogue) world.emote(tgt, 'dolor', null, true);
      world.burst(this.x, this.y, this.big ? 16 : 10, '#ffe07a');
      this.pop(world);
    }
  }

  pop(world) {
    if (this.dead) return;
    this.dead = true;
    world.burst(this.x, this.y, 5, '#ffffff');
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(Math.round(this.x), Math.round(this.y));
    const step = Math.PI / 4;
    ctx.rotate(Math.round(this.rot / step) * step);
    if (this.big) ctx.scale(2, 2);
    else if (this.sc > 1) ctx.scale(this.sc, this.sc);
    if (this.dir < 0) ctx.scale(-1, 1);
    Pix.grid(ctx, this.art.rows, this.art.pal,
      -this.art.rows[0].length / 2, -this.art.rows.length / 2);
    ctx.restore();
  }
}

class Wall {
  constructor(owner) {
    this.owner = owner;
    this.dir = owner.dir;
    this.x = owner.x + this.dir * 32;
    this.w = 14;
    this.h = 44;
    this.hp = 42;
    this.life = 420;
    this.dead = false;
    this.t = 0;
  }
  box() { return { x: this.x - this.w / 2, y: GROUND - this.h, w: this.w, h: this.h }; }
  update(world) {
    this.t++;
    this.life--;
    if (this.life <= 0 || this.hp <= 0) {
      this.dead = true;
      world.burst(this.x, GROUND - this.h / 2, 18, '#f5c542');
      world.impact(this.x, GROUND - this.h / 2, true);
      if (this.owner.def.barks && this.owner.def.barks.wall)
        world.emote(this.owner, 'alerta', pick(this.owner.def.barks.wall), true);
      Sfx.wall();
    }
  }
  draw(ctx) {
    const b = this.box();
    const shake = this.hp < 18 ? (this.t % 6 < 3 ? 1 : 0) : 0;
    for (let r = 0; r < this.h; r += 5) {
      for (let c = 0; c < this.w; c += 6) {
        const off = (r / 5) % 2 ? 3 : 0;
        Pix.r(ctx, b.x + c - off + shake, b.y + r, 5, 4, r % 10 ? '#f5c542' : '#e0aa2a');
      }
    }
    Pix.r(ctx, b.x - 1 + shake, b.y - 2, this.w + 2, 2, '#fff2a8');
    Pix.r(ctx, b.x - 2 + shake, GROUND - 2, this.w + 4, 2, '#a8811f');
  }
}

/* destello de impacto: núcleo, rayos y anillo en expansión */
class Impact {
  constructor(x, y, big) {
    this.x = x; this.y = y; this.big = !!big;
    this.t = 0; this.max = big ? 11 : 8; this.dead = false;
    this.rot = Math.random() * Math.PI;
  }
  update() { if (++this.t >= this.max) this.dead = true; }
  draw(ctx) {
    const p = this.t / this.max;
    const R = (this.big ? 19 : 12) * (0.35 + p * 1.05);
    const c = p < 0.3 ? '#ffffff' : (p < 0.62 ? '#ffe9a8' : '#f0932b');
    /* núcleo */
    if (p < 0.45) {
      const s = Math.round((this.big ? 8 : 5) * (1 - p * 1.6));
      Pix.r(ctx, this.x - s / 2, this.y - s / 2, s, s, '#ffffff');
    }
    /* rayos */
    const arms = this.big ? 8 : 6;
    for (let i = 0; i < arms; i++) {
      const a = this.rot + i * Math.PI * 2 / arms;
      const dx = Math.cos(a), dy = Math.sin(a) * 0.75;
      const w = Math.max(1, Math.round(3 * (1 - p)));
      for (let d = R * 0.45; d < R; d += 2)
        Pix.r(ctx, this.x + dx * d - w / 2, this.y + dy * d - w / 2, w, w, c);
    }
    /* anillo */
    if (p > 0.25) {
      for (let i = 0; i < 18; i++) {
        const a = i * Math.PI / 9;
        Pix.r(ctx, this.x + Math.cos(a) * R, this.y + Math.sin(a) * R * 0.75, 1, 1, c);
      }
    }
  }
}

/* onda expansiva (¡NO HAY PLATA!, atajadas) */
class Shock {
  constructor(x, y, color, max, life) {
    this.x = x; this.y = y; this.color = color;
    this.max = max || 60; this.t = 0; this.life = life || 22; this.dead = false;
  }
  update() { if (++this.t >= this.life) this.dead = true; }
  draw(ctx) {
    const p = this.t / this.life, r = this.max * p;
    const n = 26 + Math.round(r * 0.5);
    for (let i = 0; i < n; i++) {
      const a = i * Math.PI * 2 / n;
      Pix.r(ctx, this.x + Math.cos(a) * r, this.y + Math.sin(a) * r * 0.6, 1, 1,
        p < 0.4 ? '#ffffff' : this.color);
    }
    if (p < 0.5) Pix.circle(ctx, this.x, this.y, Math.round(6 * (1 - p * 2)), '#ffffff');
  }
}

class Particle {
  constructor(x, y, vx, vy, life, color, size, g) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.max = life; this.color = color;
    this.size = size || 1; this.g = g === undefined ? 0.16 : g;
    this.dead = false;
  }
  update() {
    this.vy += this.g;
    this.x += this.vx; this.y += this.vy;
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    if (this.life < this.max * 0.35 && this.life % 2) return;
    Pix.r(ctx, this.x, this.y, this.size, this.size, this.color);
  }
}

/* Agujero negro: atrae al rival y le va royendo la vida */
class Vortex {
  constructor(owner, x, y, dmg) {
    this.owner = owner; this.x = x; this.y = y; this.dmg = dmg || 4;
    this.t = 0; this.life = 160; this.dead = false;
  }
  update(world) {
    this.t++;
    const opp = world.opponentOf(this.owner);
    if (opp && opp.state !== 'ko') {
      const dx = this.x - opp.x;
      opp.x = clamp(opp.x + clamp(dx * 0.04, -1.7, 1.7), 12, W - 12);
      if (!opp.onGround) opp.vy -= 0.08;
      if (this.t % 26 === 0)
        dealDamage(this.owner, opp, this.dmg, { push: 0.2, hitstun: 8, unblockable: true }, world);
      if (this.t % 3 === 0) {          // la materia del rival se va al agujero
        const px = opp.x + rnd(-10, 10), py = opp.y - rnd(10, 60);
        const a = Math.atan2(this.y - py, this.x - px);
        world.parts.push(new Particle(px, py, Math.cos(a) * 1.6, Math.sin(a) * 1.6, 26,
          Math.random() < 0.5 ? '#8ee0f0' : '#c9a6ff', 1, 0));
      }
    }
    if (--this.life <= 0) this.dead = true;
  }
  draw(ctx) {
    const grow = Math.min(1, this.t / 20), fade = this.life < 30 ? this.life / 30 : 1;
    const scale = grow * fade;
    /* disco de acreción */
    for (let r = 38; r > 5; r -= 3) {
      const rr = r * scale;
      if (rr < 2) continue;
      const a = this.t * 0.11 + r * 0.5;
      const n = 10 + Math.round(r * 0.6);
      for (let i = 0; i < n; i++) {
        const ang = a + i * Math.PI * 2 / n;
        Pix.r(ctx, this.x + Math.cos(ang) * rr, this.y + Math.sin(ang) * rr * 0.55, 1, 1,
          r > 28 ? '#3a2a6b' : (r > 18 ? '#5a3d96' : (r > 10 ? '#8ee0f0' : '#ffffff')));
      }
    }
    /* horizonte de sucesos */
    Pix.circle(ctx, this.x, this.y, Math.round(9 * scale), '#0a0612');
    Pix.circle(ctx, this.x, this.y, Math.round(6 * scale), '#150c28');
    for (let i = 0; i < 12; i++) {
      const ang = this.t * 0.2 + i * Math.PI / 6;
      Pix.r(ctx, this.x + Math.cos(ang) * 10 * scale, this.y + Math.sin(ang) * 6 * scale, 1, 1, '#c9a6ff');
    }
  }
}

/* Emote: icono sobre la cabeza. Se entiende de un vistazo y no
   convierte la pelea en una conversación. */
class Emote {
  constructor(f, kind) {
    this.f = f; this.kind = kind; this.t = 0; this.life = 64; this.dead = false;
  }
  update() { if (++this.t >= this.life) this.dead = true; }
  draw(ctx) {
    if (this.life < 10 && this.life % 4 < 2) return;
    const pop = Math.min(3, this.t);
    const w = 14, h = 14;
    const x = Math.round(clamp(this.f.x - w / 2, 3, W - w - 3));
    const y = Math.round(Math.max(44, this.f.y - 94)) + (3 - pop);
    Pix.r(ctx, x - 1, y - 1, w + 2, h + 2, '#000');
    Pix.r(ctx, x, y, w, h, '#f4eeff');
    Pix.r(ctx, x + 1, y + 1, w - 2, 2, '#ffffff');
    Pix.r(ctx, x + 1, y + h - 2, w - 2, 1, '#cfc4e8');
    const tx = Math.round(clamp(this.f.x - 2, x + 3, x + w - 7));
    Pix.r(ctx, tx, y + h, 4, 2, '#f4eeff');
    Pix.r(ctx, tx - 1, y + h, 1, 2, '#000');
    Pix.r(ctx, tx + 4, y + h, 1, 2, '#000');
    Pix.r(ctx, tx + 1, y + h + 2, 2, 2, '#f4eeff');
    if (this.kind === 'tipo') drawTypeIcon(ctx, this.f.def.type, x + 4, y + 4);
    else {
      const e = EMOTES[this.kind] || EMOTES.duda;
      Pix.grid(ctx, e.rows, e.pal, x + 3, y + 3);
    }
  }
}

/* adorno decorativo (el arbolito feliz de Bob) */
class Deco {
  constructor(x, y, artId, life) {
    this.art = ART[artId];
    this.x = x; this.y = y;
    this.life = life || 240; this.max = this.life;
    this.dead = false;
  }
  update() { if (--this.life <= 0) this.dead = true; }
  draw(ctx) {
    if (this.life < 40 && this.life % 6 < 3) return;
    const rise = Math.min(0, -(this.max - this.life) + 8);
    Pix.grid(ctx, this.art.rows, this.art.pal,
      this.x - this.art.rows[0].length / 2, this.y - this.art.rows.length + rise);
  }
}

class Popup {
  constructor(x, y, text, color) {
    this.size = text.length > 14 ? 6 : 8;
    const half = text.length * this.size * 0.3;
    this.x = clamp(x, half + 4, W - half - 4);
    this.y = Math.max(44, y);          // nunca por encima del marcador
    this.text = text; this.color = color;
    this.life = 52; this.dead = false;
  }
  update() { this.y = Math.max(44, this.y - 0.45); if (--this.life <= 0) this.dead = true; }
  draw(ctx) {
    if (this.life < 14 && this.life % 2) return;
    Pix.text(ctx, this.text, this.x, this.y, this.color, 'center', this.size);
  }
}

/* ---------------------------------------------------------
   Mundo: contiene entidades y utilidades de combate
   --------------------------------------------------------- */
class World {
  constructor(stageId) {
    this.stage = stageId;
    this.projs = [];
    this.walls = [];
    this.decos = [];
    this.emotes = [];
    this.pending = [];
    this.parts = [];
    this.pops = [];
    this.fighters = [];
    this.shake = 0;
    this.hitstop = 0;
    this.flash = 0;
    this.t = 0;
    this.chyron = null;      // linea del comentarista
    this.sayN = 0;
  }

  /* frase encadenada: la respuesta llega un momento después */
  sayLater(f, text, delay) { this.pending.push({ f, text, at: this.t + (delay || 45) }); }

  /* cruce escrito entre dos personajes concretos */
  duel(a, b, ev, fallback) {
    const kind = ev === 'nullify' ? 'anula' : (ev === 'catch' ? 'guante' : 'golpe');
    const lines = dueloLines(a, b, ev);
    if (lines) {
      this.emote(a, kind, lines[0], true);
      this.sayLater(b, lines[1], 55);
    } else if (fallback) {
      this.emote(a, kind, fallback, true);
    }
  }

  /* Un luchador reacciona: icono sobre la cabeza + su voz. El texto
     (solo en los momentos escritos) va al rótulo de abajo. */
  emote(f, kind, text, prio) {
    if (!f || f.state === 'ko') return;
    if (f.barkCd > 0 && !prio) return;
    f.barkCd = prio ? 45 : 115;
    this.emotes = this.emotes.filter(e => e.f !== f);
    this.emotes.push(new Emote(f, kind || 'duda'));
    Sfx.speak(f.def.voice, text ? clamp(Math.round(text.length / 5), 2, 6) : 3);
    if (text) this.say(f.def.short + ': ' + text, 165, TYPES[f.def.type].color);
  }

  /* compatibilidad: hablar con texto equivale a emote de tipo */
  bark(f, text, prio) { this.emote(f, 'tipo', text, prio); }

  /* el comentarista dice algo (lo pinta el HUD) */
  say(text, frames, color) {
    if (!text) return;
    this.chyron = { text, t: frames || 170, id: ++this.sayN, color: color };
  }

  opponentOf(f) { return this.fighters.find(o => o !== f); }

  impact(x, y, big) { this.parts.push(new Impact(x, y, big)); }

  burst(x, y, n, color) {
    for (let i = 0; i < n; i++)
      this.parts.push(new Particle(x, y, rnd(-1.8, 1.8), rnd(-2.2, 0.6),
        irnd(14, 30), color, Math.random() < 0.3 ? 2 : 1));
  }

  dust(x, y, dir) {
    for (let i = 0; i < 4; i++)
      this.parts.push(new Particle(x, y, rnd(-0.6, 0.6) - dir * 0.6, rnd(-0.8, -0.1),
        irnd(10, 20), '#b8b0a0', 1, 0.05));
  }

  popup(x, y, text, color) {
    /* escalona los avisos cercanos para que no se pisen */
    /* nada de repetir el mismo aviso dos veces seguidas */
    if (this.pops.some(p => p.text === text && p.life > 28)) return;
    const near = this.pops.filter(p => Math.abs(p.x - x) < 110 && p.life > 18).length;
    let py = y - near * 15;
    if (py < 48) py = 48 + near * 13;      // si no cabe arriba, se apilan hacia abajo
    this.pops.push(new Popup(x, py, text, color));
    while (this.pops.length > 4) this.pops.shift();
  }

  /* --- disparo de especiales --- */
  fire(owner, sp) {
    switch (sp.kind) {
      case 'projectile': {
        const n = sp.count || 1;
        const backfire = sp.unstable && Math.random() < sp.unstable;   // le explota en la cara
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * (sp.spread || 0);
          this.projs.push(new Proj(owner, sp, {
            y: backfire ? owner.y - 40 : owner.y + (sp.oy || -30) - i * (sp.gravity ? 3 : 0),
            x: backfire ? owner.x - owner.dir * 2 : undefined,
            vx: backfire ? -owner.dir * 1.6 : undefined,
            vy: backfire ? 0 : ((sp.vy || 0) + off * 1.6),
            rogue: backfire
          }));
        }
        if (backfire) this.say('EL COHETE SALIÓ AL REVÉS. CLÁSICO.', 150);
        Sfx.shoot();
        break;
      }
      case 'poke': {                          // le crece la nariz y pica con ella
        owner.startAttack(ATTACKS.nose);
        Sfx.whiff();
        break;
      }
      case 'nullify': {                       // ¡NO HAY PLATA!
        const opp = this.opponentOf(owner);
        let killed = 0;
        for (const p of this.projs) if (p.owner !== owner) { this.burst(p.x, p.y, 7, '#f0932b'); p.pop(this); killed++; }
        for (const wl of this.walls) if (wl.owner !== owner) { wl.hp = 0; killed++; }
        this.parts.push(new Shock(owner.x, owner.y - 38, '#f0932b', 96, 26));
        this.shake = 8;
        Sfx.wall();
        if (opp) {
          const rico = opp.def.type === 'dinero';         // contra el dinero es demoledor
          const drain = rico ? 100 : (sp.drain || 40);
          opp.meter = Math.max(0, opp.meter - drain);
          if (drain > 0) this.popup(opp.x, opp.y - 92, '-' + drain + ' SUPER', '#f0932b');
          if (Math.abs(opp.x - owner.x) < 70)
            dealDamage(owner, opp, sp.dmg * (rico ? 2 : 1), { push: 2.5, hitstun: 16 }, this);
          if (killed || rico) this.duel(owner, opp, 'nullify', sp.say);
          else this.bark(owner, sp.say, true);
        }
        break;
      }
      case 'catch': {                          // ATAJADA
        owner.catchT = sp.frames || 100;
        this.parts.push(new Shock(owner.x, owner.y - 38, '#c9f542', 44, 16));
        this.popup(owner.x, owner.y - 92, 'ATAJADA', '#c9f542');
        Sfx.block();
        break;
      }
      case 'psych': {                          // MIRÁ QUE TE LO ATAJO
        const opp = this.opponentOf(owner);
        if (opp) {
          opp.stunT = 95;
          const st = Math.min(opp.meter, sp.steal || 50);
          opp.meter -= st;
          owner.meter = Math.min(100, owner.meter + st * 0.4);
          dealDamage(owner, opp, sp.dmg, { push: 1.2, hitstun: 12, unblockable: true }, this);
          this.popup(opp.x, opp.y - 92, '¡ATURDIDO!', '#c9f542');
          if (st > 0) this.popup(opp.x, opp.y - 106, '-' + Math.round(st) + ' SUPER', '#c9f542');
          this.parts.push(new Shock(opp.x, opp.y - 38, '#c9f542', 70, 20));
        }
        this.flash = 8; this.shake = 8;
        Sfx.super();
        break;
      }
      case 'vortex': {
        const opp = this.opponentOf(owner);
        this.decos.push(new Vortex(owner, opp ? opp.x : owner.x + owner.dir * 60, GROUND - 42, sp.dmg));
        this.flash = 10; this.shake = 10;
        Sfx.super();
        break;
      }
      case 'wall': {
        this.walls = this.walls.filter(w => w.owner !== owner);
        const wl = new Wall(owner);
        this.walls.push(wl);
        const opp = this.opponentOf(owner);
        if (opp && Math.abs(opp.x - wl.x) < 22) {
          dealDamage(owner, opp, sp.dmg || 8, { push: 3.5, hitstun: 20 }, this);
        }
        this.burst(wl.x, GROUND - 12, 18, '#f5c542');
        this.shake = 8;
        Sfx.wall();
        break;
      }
      case 'heal': {
        owner.hp = Math.min(owner.maxHp, owner.hp + (sp.heal || 15));
        owner.guard = sp.guard || 120;
        for (let i = 0; i < 16; i++)
          this.parts.push(new Particle(owner.x + rnd(-12, 12), owner.y - rnd(0, 62),
            rnd(-0.3, 0.3), rnd(-1.2, -0.4), irnd(20, 40), '#9bf59b', 1, -0.01));
        this.popup(owner.x, owner.y - 78, '+' + (sp.heal || 15), '#4ad14a');
        if (sp.art) this.decos.push(new Deco(owner.x - owner.dir * 22, GROUND, sp.art, 260));
        Sfx.heal();
        break;
      }
      case 'rain': {
        const opp = this.opponentOf(owner);
        const cx = opp ? opp.x : owner.x + owner.dir * 60;
        for (let i = 0; i < (sp.count || 6); i++) {
          this.projs.push(new Proj(owner, {
            dmg: sp.dmg, art: sp.art, speed: 0, life: 200, gravity: 0.16, effect: sp.effect
          }, { x: clamp(cx + rnd(-42, 42), 10, W - 10), y: -10 - i * 14, vx: rnd(-0.4, 0.4), vy: rnd(0.4, 1.4), g: 0.16 }));
        }
        Sfx.shoot();
        break;
      }
      case 'dash': {
        owner.startDash(sp);
        Sfx.super();
        break;
      }
      case 'teleport': {
        const opp = this.opponentOf(owner);
        if (opp) {
          this.burst(owner.x, owner.y - 34, 16, '#f2f0e6');
          owner.x = clamp(opp.x - opp.dir * 22, 16, W - 16);
          owner.dir = opp.dir;
          owner.y = GROUND; owner.vy = 0; owner.onGround = true;
          this.burst(owner.x, owner.y - 34, 16, '#c0392b');
          dealDamage(owner, opp, sp.dmg, { push: 4.2, hitstun: 30, launch: true }, this);
          this.shake = 12;
        }
        Sfx.super();
        break;
      }
    }
  }

  update() {
    this.t++;
    if (this.chyron && --this.chyron.t <= 0) this.chyron = null;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.t >= this.pending[i].at) {
        this.emote(this.pending[i].f, 'alerta', this.pending[i].text, true);
        this.pending.splice(i, 1);
      }
    }
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
    for (const a of [this.projs, this.walls, this.parts, this.pops, this.decos, this.emotes]) {
      for (const e of a) e.update(this);
    }
    /* dos proyectiles rivales se anulan al chocar */
    for (let i = 0; i < this.projs.length; i++)
      for (let j = i + 1; j < this.projs.length; j++) {
        const a = this.projs[i], b = this.projs[j];
        if (a.dead || b.dead || a.owner === b.owner) continue;
        if (aabb(a.box(), b.box())) {
          const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
          this.impact(cx, cy, false);
          this.popup(cx, cy - 12, '¡CHOQUE!', '#ffe9a8');
          this.duel(a.owner, b.owner, 'clash');
          a.pop(this); b.pop(this);
        }
      }
    this.projs = this.projs.filter(e => !e.dead);
    this.walls = this.walls.filter(e => !e.dead);
    this.decos = this.decos.filter(e => !e.dead);
    this.emotes = this.emotes.filter(e => !e.dead && e.f.state !== 'ko');
    this.parts = this.parts.filter(e => !e.dead);
    this.pops = this.pops.filter(e => !e.dead);
  }

  drawBack(ctx) {
    for (const d of this.decos) d.draw(ctx);
    for (const w of this.walls) w.draw(ctx);
  }

  drawFront(ctx) {
    for (const p of this.projs) p.draw(ctx);
    for (const p of this.parts) p.draw(ctx);
    for (const p of this.pops) p.draw(ctx);
    for (const e of this.emotes) e.draw(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (this.flash / 14) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
}

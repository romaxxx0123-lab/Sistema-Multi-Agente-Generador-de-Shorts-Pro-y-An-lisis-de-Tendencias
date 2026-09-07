/* =========================================================
   entities.js — proyectiles, muros, particulas y el "mundo"
   ========================================================= */

class Proj {
  constructor(owner, sp, o = {}) {
    this.owner = owner;
    this.sp = sp;
    this.art = ART[sp.art] || ART.bill;
    this.dir = owner.dir;
    this.x = o.x !== undefined ? o.x : owner.x + this.dir * 13;
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
    this.dead = false;
    this.w = this.art.rows[0].length * (this.big ? 2 : 1);
    this.h = this.art.rows.length * (this.big ? 2 : 1);
  }

  box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  update(world) {
    const tgt = world.opponentOf(this.owner);
    if (this.hom && tgt) {
      const dy = (tgt.y - 22) - this.y;
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

    if (tgt && !tgt.dead && aabb(this.box(), tgt.hurtbox())) {
      dealDamage(this.owner, tgt, this.dmg, {
        push: this.big ? 3.4 : 2.2,
        hitstun: this.big ? 22 : 16,
        effect: this.effect,
        projectile: true
      }, world);
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
    this.x = owner.x + this.dir * 26;
    this.w = 11;
    this.h = 30;
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
      world.burst(this.x, GROUND - this.h / 2, 16, '#f5c542');
      world.popup(this.x, GROUND - this.h - 6, '¡SE CAYÓ!', '#f5c542');
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

class Popup {
  constructor(x, y, text, color) {
    this.size = text.length > 14 ? 6 : 8;
    const half = text.length * this.size * 0.3;
    this.x = clamp(x, half + 4, W - half - 4);
    this.y = y; this.text = text; this.color = color;
    this.life = 52; this.dead = false;
  }
  update() { this.y -= 0.45; if (--this.life <= 0) this.dead = true; }
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

  /* el comentarista dice algo (lo pinta el HUD) */
  say(text, frames) {
    if (!text) return;
    this.chyron = { text, t: frames || 170, id: ++this.sayN };
  }

  opponentOf(f) { return this.fighters.find(o => o !== f); }

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
    const near = this.pops.filter(p => Math.abs(p.x - x) < 56 && p.life > 26).length;
    this.pops.push(new Popup(x, y - near * 10, text, color));
    if (this.pops.length > 6) this.pops.shift();
  }

  /* --- disparo de especiales --- */
  fire(owner, sp) {
    switch (sp.kind) {
      case 'projectile': {
        const n = sp.count || 1;
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * (sp.spread || 0);
          this.projs.push(new Proj(owner, sp, {
            vy: (sp.vy || 0) + off * 1.6,
            y: owner.y + (sp.oy || -30) - i * (sp.gravity ? 3 : 0)
          }));
        }
        Sfx.shoot();
        break;
      }
      case 'wall': {
        this.walls = this.walls.filter(w => w.owner !== owner);
        const wl = new Wall(owner);
        this.walls.push(wl);
        const opp = this.opponentOf(owner);
        if (opp && Math.abs(opp.x - wl.x) < 16) {
          dealDamage(owner, opp, sp.dmg || 8, { push: 3.5, hitstun: 20 }, this);
        }
        this.burst(wl.x, GROUND - 8, 14, '#f5c542');
        this.shake = 8;
        Sfx.wall();
        break;
      }
      case 'heal': {
        owner.hp = Math.min(owner.maxHp, owner.hp + (sp.heal || 15));
        owner.guard = sp.guard || 120;
        for (let i = 0; i < 16; i++)
          this.parts.push(new Particle(owner.x + rnd(-9, 9), owner.y - rnd(0, 42),
            rnd(-0.3, 0.3), rnd(-1.2, -0.4), irnd(20, 40), '#9bf59b', 1, -0.01));
        this.popup(owner.x, owner.y - 52, '+' + (sp.heal || 15), '#4ad14a');
        Sfx.heal();
        break;
      }
      case 'rain': {
        const opp = this.opponentOf(owner);
        const cx = opp ? opp.x : owner.x + owner.dir * 60;
        for (let i = 0; i < (sp.count || 6); i++) {
          this.projs.push(new Proj(owner, {
            dmg: sp.dmg, art: sp.art, speed: 0, life: 200, gravity: 0.16
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
          this.burst(owner.x, owner.y - 22, 14, '#f2f0e6');
          owner.x = clamp(opp.x - opp.dir * 16, 14, W - 14);
          owner.dir = opp.dir;
          owner.y = GROUND; owner.vy = 0; owner.onGround = true;
          this.burst(owner.x, owner.y - 22, 14, '#c0392b');
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
    if (this.shake > 0) this.shake--;
    if (this.flash > 0) this.flash--;
    for (const a of [this.projs, this.walls, this.parts, this.pops]) {
      for (const e of a) e.update(this);
    }
    this.projs = this.projs.filter(e => !e.dead);
    this.walls = this.walls.filter(e => !e.dead);
    this.parts = this.parts.filter(e => !e.dead);
    this.pops = this.pops.filter(e => !e.dead);
  }

  drawBack(ctx) {
    for (const w of this.walls) w.draw(ctx);
  }

  drawFront(ctx) {
    for (const p of this.projs) p.draw(ctx);
    for (const p of this.parts) p.draw(ctx);
    for (const p of this.pops) p.draw(ctx);
    if (this.flash > 0) {
      ctx.fillStyle = 'rgba(255,255,255,' + (this.flash / 14) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  }
}

/* =========================================================
   ai.js — CPU: decide un "plan" cada pocos frames y lo ejecuta
   ========================================================= */
const AI = {
  blank() {
    return { left: false, right: false, up: false, down: false, punch: false, kick: false, special: false, super: false, taunt: false };
  },

  think(f, opp, world, level) {
    level = level || 1;                 // 0 facil · 1 normal · 2 duro
    if (!f.ai) f.ai = { plan: 'wait', t: 0, fire: false, react: 0 };
    const a = f.ai;
    const inp = this.blank();
    const dist = Math.abs(opp.x - f.x);
    const toward = opp.x > f.x ? 'right' : 'left';
    const away = toward === 'right' ? 'left' : 'right';

    if (f.state === 'ko' || opp.state === 'ko' || f.frozen > 0) return inp;

    /* --- reacciones: proyectiles y golpes cercanos --- */
    const danger = world.projs.some(p =>
      p.owner !== f && Math.abs(p.x - f.x) < 52 && Math.sign(p.vx || 0.001) === Math.sign(f.x - p.x));
    const meleeThreat = opp.state === 'attack' && dist < 37;
    const reactChance = [0.35, 0.6, 0.85][level];

    if ((danger || meleeThreat) && a.react <= 0 && Math.random() < reactChance) {
      a.react = 26;
      a.plan = (danger && Math.random() < 0.45) ? 'jump' : 'block';
      a.t = danger ? 16 : irnd(18, 30);
      a.fire = true;
    }
    if (a.react > 0) a.react--;

    /* --- reacción: si me llega algo y sé anularlo o atajarlo, lo uso --- */
    const k = f.def.special.kind;
    if ((k === 'nullify' || k === 'catch') && f.meter >= f.def.special.cost &&
        a.t <= 6 && world.projs.some(p => p.owner !== f && Math.abs(p.x - f.x) < 90)) {
      a.plan = 'special'; a.t = 24; a.fire = true;
    }

    /* --- elegir plan nuevo --- */
    if (a.t <= 0) {
      a.fire = true;
      const r = Math.random();
      if (f.meter >= 100 && r < 0.55) { a.plan = 'super'; a.t = 24; }
      else if (f.meter >= f.def.special.cost && r < 0.42 && (dist > 42 || f.def.special.kind === 'heal' || f.def.special.kind === 'wall')) {
        a.plan = 'special'; a.t = 26;
      }
      else if (dist > 76) { a.plan = r < 0.78 ? 'approach' : 'jump'; a.t = irnd(16, 34); }
      else if (dist > 32) { a.plan = r < 0.6 ? 'approach' : (r < 0.8 ? 'poke' : 'block'); a.t = irnd(12, 26); }
      else {
        if (r < [0.42, 0.58, 0.72][level]) { a.plan = 'poke'; a.t = irnd(10, 20); }
        else if (r < 0.78) { a.plan = 'block'; a.t = irnd(14, 28); }
        else { a.plan = 'retreat'; a.t = irnd(10, 22); }
      }
      if (f.hp < 30 && f.def.special.kind === 'heal' && f.meter >= f.def.special.cost) { a.plan = 'special'; a.t = 26; }
      /* si va ganando de sobra y está lejos, se burla (y se lo hace pagar) */
      if (f.hp - opp.hp > 35 && dist > 68 && Math.random() < 0.16) { a.plan = 'taunt'; a.t = 34; }
      /* con ventaja de tipo se envalentona */
      if (a.plan === 'retreat' && typeMult(f.def.type, opp.def.type).kind === 'super' && Math.random() < 0.6) {
        a.plan = 'approach'; a.t = 22;
      }
    }
    a.t--;

    /* --- ejecutar plan --- */
    switch (a.plan) {
      case 'approach':
        inp[toward] = true;
        if (dist < 37 && a.fire) { inp.punch = true; }
        break;
      case 'retreat':
        inp[away] = true;
        break;
      case 'block':
        inp[away] = true;
        if (Math.random() < 0.25) inp.down = true;
        break;
      case 'jump':
        if (a.fire) inp.up = true;
        inp[toward] = true;
        if (!f.onGround && dist < 42 && Math.random() < 0.2) inp.kick = true;
        break;
      case 'poke':
        if (dist > 33) inp[toward] = true;
        if (a.fire) {
          const r = Math.random();
          if (r < 0.42) inp.punch = true;
          else if (r < 0.78) inp.kick = true;
          else { inp.down = true; inp.kick = true; }
        }
        break;
      case 'special':
        if (f.def.special.kind === 'dash' && dist > 110) inp[toward] = true;
        else if (a.fire) inp.special = true;
        break;
      case 'super':
        if (a.fire) inp.super = true;
        break;
      case 'taunt':
        if (a.fire) inp.taunt = true;
        break;
      default:
        if (Math.random() < 0.05) inp[toward] = true;
    }
    a.fire = false;
    return inp;
  }
};

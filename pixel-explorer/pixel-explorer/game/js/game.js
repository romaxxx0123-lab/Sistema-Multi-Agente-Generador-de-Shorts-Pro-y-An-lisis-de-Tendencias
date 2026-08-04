import { World, CH, BIOME, BIOME_INFO, mulberry32 } from './world.js';
import { Atlas, GroundCache, Lighting, Shadows, TS, hash2 } from './render.js';
import { BitmapFont, nineSlice, Button } from './ui.js';
import { TitleScreen } from './menu.js';
import { Creator } from './creator.js';
import { Progress, QUEST_DEFS } from './quests.js';
import { buildPlayerSheet, defaultLook, CLASSES } from './charcustom.js';
import { Audio } from './audio.js';
import { RECIPES, craft, canAfford, isBuilt } from './crafting.js';
import { CraftPanel } from './craftui.js';
import * as Persist from './persist.js';
import { UNLOCKS, applyUnlocks, progressOf, earned, TRACK_LABEL } from './legacy.js';
import { SEASONS, seasonOf, recolorAtlas } from './seasons.js';

const DIRN = ['s', 'w', 'n', 'e'];
const shadows = new Shadows();
let atlasImg = null;          // atlas original, sin teñir
let season = SEASONS[0], seasonApplied = false;

// ------------------------------------------------------------------ boot
const cv = document.getElementById('game');
const ctx = cv.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;

let ZOOM = 3;
let atlas, world, ground, light;
let cam = { x: 0, y: 0 };
const keys = new Set();
let paused = false, showMap = false, started = false;

const state = {
  time: 7.0,           // hours 0..24
  day: 1,
  seed: 0,
  stamina: 100, maxStamina: 100,
  discovered: new Set(),
  biomesSeen: new Set(),
  items: { berry: 0, wood: 0, stone: 0, mushroom: 0, ore: 0, crystal: 0, relic: 0, flower: 0 },
  distance: 0,
  lookedAt: null,
  // customisation + perks
  look: null, cls: null,
  viewBonus: 0, relicBonus: 0, shrineBonus: 0, mapBonus: 0,
  gatherBonus: 0, gatherStamina: 0,
  prog: null,
  sawNight: false,
  // survival
  hp: 100, maxHp: 100,
  food: 100, maxFood: 100,
  warm: 100,               // 0 = freezing, 50 = neutral, 100 = comfortable
  heat: 0,                 // desert/ash overheating, 0..100
  gear: {}, pouch: {}, built: new Set(),
  shyBonus: 0, unlocksActive: [],
  placeSel: 'campfire', sleeping: 0,
  swingT: 0,
  hurtFlash: 0, healTimer: 0,
  deaths: 0, gameOver: false, goT: 0,
};

const audio = new Audio();
let craftPanel = null;

let playerSheet = null;   // recoloured frames for the chosen look
let creator = null;
let scene = 'title';      // title | creator | game

const player = {
  x: 0, y: 0, vx: 0, vy: 0, dir: 0, moving: false, anim: 0, speed: 62,
  lantern: true, swim: false,
};

let creatures = [];
let particles = [];
let floaters = [];
let weather = { type: 'clear', t: 0, next: 40 };

// ------------------------------------------------------------------ load
let bestRecord = null, totalRuns = 0, savedRun = null;
let font, title, palette, bgWorld, bgGround, bgCam = { x: 0, y: 0 }, bgAng = 0;

async function boot() {
  const [img, idx, fmeta, pmeta] = await Promise.all([
    loadImg('atlas.png'),
    fetch('atlas.json').then(r => r.json()),
    fetch('font.json').then(r => r.json()),
    fetch('pal.json').then(r => r.json()),
  ]);
  palette = pmeta;
  atlasImg = img;
  atlas = new Atlas(img, idx);
  font = new BitmapFont(atlas, fmeta);
  craftPanel = new CraftPanel(atlas, font);
  light = new Lighting();
  const sv = Persist.load();
  if (sv.look) state.look = sv.look;
  if (sv.settings) {
    audio.enabled = sv.settings.sound !== false;
    audio.musicOn = sv.settings.music !== false;
  }
  bestRecord = sv.best || null;
  totalRuns = sv.runs || 0;
  savedRun = sv.run || null;
  buildBackdrop();
  title = new TitleScreen({
    atlas, font, best: bestRecord, saved: savedRun,
    meta: (Persist.load().meta || {}), runs: totalRuns,
    onStart: () => { savedRun = null; Persist.clearRun(); openCreator(); },
    onSeed: (txt) => { savedRun = null; Persist.clearRun(); openCreator(txt); },
    onResume: (r) => resumeRun(r),
  });
  document.getElementById('loading').classList.add('hidden');
  started = false;
}

function resumeRun(r) {
  startGame(r.seed, r.look, r.cfg, true);
  world.restore(r.consumed, r.placed);
  ground.invalidateAll && ground.invalidateAll();
  state.time = r.time; state.day = r.day;
  player.x = r.px; player.y = r.py; player.dir = r.dir || 0;
  cam.x = player.x; cam.y = player.y;
  state.hp = r.hp; state.maxHp = r.maxHp;
  state.stamina = r.stamina; state.maxStamina = r.maxStamina;
  state.food = r.food; state.warm = r.warm; state.heat = r.heat || 0;
  Object.assign(state.items, r.items || {});
  state.pouch = Object.assign({}, r.pouch || {});
  state.gear = Object.assign({}, r.gear || {});
  state.built = new Set(r.built || []);
  state.biomesSeen = new Set(r.biomes || []);
  state.discovered = new Set(r.discovered || []);
  state.distance = r.distance || 0;
  if (state.prog) {
    state.prog.xp = r.xp || 0;
    state.prog.level = r.level || 1;
    Object.assign(state.prog.counters, r.counters || {});
    state.prog.done = new Set(r.doneQuests || []);
    state.prog.pending = [];
    state.prog.refresh();
  }
  const who = (state.look.name || 'Vagabundo').toUpperCase();
  note(`BIENVENIDO DE VUELTA, ${who}`, `DIA ${state.day}`);
}

function openCreator(seedText) {
  creator = new Creator({
    atlas, font, pal: palette, look: state.look || defaultLook(),
    onBack: () => { scene = 'title'; },
    onBegin: (look, cfg) => {
      state.look = look;
      const seed = cfg.seedText ? hashSeed(cfg.seedText)
                                : (Math.random() * 4294967295) >>> 0;
      startGame(seed, look, cfg);
    },
  });
  if (seedText) creator.world.seedText = seedText;
  scene = 'creator';
}

function refreshTitleMeta() {
  const sv = Persist.load();
  bestRecord = sv.best || null;
  totalRuns = sv.runs || 0;
  savedRun = sv.run || null;
  if (title) {
    title.best = bestRecord; title.saved = savedRun;
    title.meta = sv.meta || {}; title.runs = totalRuns;
    title.build();
  }
}

function autoSave() {
  if (!started || state.gameOver) return;
  Persist.saveRun(state, player, world);
}

function hashSeed(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** A real slice of world, slowly panning behind the title. */
function buildBackdrop() {
  const seed = 0x5EED1E;
  bgWorld = new World(seed);
  bgGround = new GroundCache(bgWorld, atlas);
  // find a scenic forest-edge spot
  for (let i = 0; i < 3000; i++) {
    const tx = ((Math.sin(i * 12.9898) * 43758.5453) % 400) | 0;
    const ty = ((Math.cos(i * 78.233) * 12345.6789) % 400) | 0;
    if (bgWorld.biomeAt(tx, ty) === BIOME.FOREST) {
      bgCam.x = tx * TS; bgCam.y = ty * TS; break;
    }
  }
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function startGame(seed, look, cfg, resuming) {
  state.seed = seed >>> 0;
  state.look = look || state.look || defaultLook();
  state.worldCfg = cfg || { size: 1, density: 1, daylen: 1 };
  playerSheet = buildPlayerSheet(atlas, palette, state.look);
  world = new World(state.seed, state.worldCfg);
  ground = new GroundCache(world, atlas);
  if (!light) light = new Lighting();
  // find a nice land spawn
  let sx = 0, sy = 0;
  const rnd = mulberry32(state.seed ^ 0xBEEF);
  for (let i = 0; i < 4000; i++) {
    const tx = ((rnd() - 0.5) * 900) | 0, ty = ((rnd() - 0.5) * 900) | 0;
    const b = world.biomeAt(tx, ty);
    if (b === BIOME.MEADOW || b === BIOME.GRASS || b === BIOME.FOREST) {
      let ok = true;
      for (let d = 0; d < 8 && ok; d++) {
        const a = d / 8 * Math.PI * 2;
        if (world.isWater(tx + Math.cos(a) * 3 | 0, ty + Math.sin(a) * 3 | 0)) ok = false;
      }
      if (ok) { sx = tx; sy = ty; break; }
    }
  }
  player.x = sx * TS + 8; player.y = sy * TS + 8;
  cam.x = player.x; cam.y = player.y;
  state.time = 7.0; state.day = 1;
  state.discovered = new Set(); state.biomesSeen = new Set();
  for (const k in state.items) state.items[k] = 0;
  state.distance = 0;
  // reset perk fields, then apply the chosen class
  state.maxStamina = 100;
  state.viewBonus = state.relicBonus = state.shrineBonus = 0;
  state.mapBonus = state.gatherBonus = state.gatherStamina = 0;
  player.speed = 62;
  state.cls = CLASSES[state.look.cls];
  state.cls.apply(state, player);
  state.stamina = state.maxStamina;
  state.maxHp = 100 + (state.cls.id === 'ranger' ? 20 : 0);
  state.hp = state.maxHp;
  state.food = state.maxFood;
  state.warm = 100;
  state.heat = 0;
  state.gear = {}; state.pouch = {}; state.built = new Set();
  state.shyBonus = 0; state.unlocksActive = [];
  state.placeSel = 'campfire'; state.sleeping = 0;
  state.swingT = 0;
  state.hurtFlash = 0; state.gameOver = false; state.goT = 0;
  state.prog = new Progress();
  // lifetime boons earned in previous expeditions (after all resets)
  if (!resuming) {
    const sv0 = Persist.load();
    const got = applyUnlocks(state, sv0.meta || {}, sv0.runs || 0);
    state.unlocksActive = got.map(u => u.n);
    state.hp = state.maxHp;
    state.stamina = state.maxStamina;
    if (got.length) {
      setTimeout(() => note('LEGADO ACTIVO', got.map(g => g.n).join('  ')), 3600);
    }
  }
  state.sawNight = false;
  creatures = []; particles = []; floaters = [];
  started = true; paused = false; scene = 'game';
  if (!resuming) {
    const who = (state.look.name || 'Vagabundo').toUpperCase();
    note(`${who} - ${state.cls.n}`, BIOME_INFO[world.biomeAt(sx, sy)].name.toUpperCase());
  }
}

// ------------------------------------------------------------------ input
addEventListener('keydown', e => {
  audio.init(); audio.resume();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (!started) {
    if (scene === 'creator' && creator) { if (creator.key(e)) e.preventDefault(); return; }
    if (title && title.key(e)) e.preventDefault();
    return;
  }
  if (started && craftPanel && craftPanel.open) {
    const kk = e.key.toLowerCase();
    if (kk === 'c' || kk === 'escape') { craftPanel.open = false; audio.ui('back'); return; }
    const act = craftPanel.key(kk);
    if (act === 'move') audio.ui('move');
    if (act === 'craft') doCraft();
    e.preventDefault();
    return;
  }
  keys.add(e.key.toLowerCase());
  const k = e.key.toLowerCase();
  if (k === 'm') showMap = !showMap;
  if (state.gameOver) {
    if (k === 'enter' && state.goT > 1.4) {
      Persist.recordResult(state, true);
      savedRun = null;
      started = false; scene = 'title'; audio.ui('back');
      refreshTitleMeta();
    }
    return;
  }
  if (k === 'escape') { paused = !paused; buildPauseButtons(); }
  if (k === 'f') {
    if (state.gear.spear) swing();
    else { player.lantern = !player.lantern; }
  }
  if (k === 'l') player.lantern = !player.lantern;
  if (k === 'e' || k === ' ') interact();
  if (k === 'q') eat();
  if (k === 'c') { craftPanel.toggle(); audio.ui(craftPanel.open ? 'select' : 'back'); }
  if (k === 'r') useSalve();
  if (k === 'g') placeSelected();
  if (k === 'h') cyclePlaceable();
  if (k === 'n') { audio.setEnabled(!audio.enabled); Persist.saveSettings(audio);
    note(audio.enabled ? 'SONIDO ACTIVADO' : 'SONIDO SILENCIADO', ''); }
  if (k === 'b') { audio.setMusic(!audio.musicOn); Persist.saveSettings(audio);
    note(audio.musicOn ? 'MUSICA ACTIVADA' : 'MUSICA APAGADA', ''); }
  if (k === '=' || k === '+') ZOOM = Math.min(5, ZOOM + 1);
  if (k === '-') ZOOM = Math.max(2, ZOOM - 1);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));

// ---- pointer input for the canvas UI
function ptr(e) {
  const r = cv.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
}
cv.addEventListener('mousemove', e => {
  const [x, y] = ptr(e);
  let over = false;
  if (started && craftPanel && craftPanel.open) { craftPanel.move(x, y); cv.style.cursor = 'pointer'; return; }
  if (!started && scene === 'creator' && creator) {
    creator.move(x, y); over = creator.buttons.some(b => b.hover) || creator.hoverRow >= 0;
  } else if (!started && title) { title.move(x, y); over = title.buttons.some(b => b.hover); }
  else if (paused) {
    for (const b of pauseBtns) { b.hover = b.hit(x, y); if (b.hover) over = true; }
  }
  cv.style.cursor = over ? 'pointer' : 'default';
});
cv.addEventListener('mousedown', e => {
  audio.init(); audio.resume();
  const [x, y] = ptr(e);
  if (!started && scene === 'creator' && creator) creator.down(x, y);
  else if (!started && title) title.down(x, y);
  else if (paused) for (const b of pauseBtns) if (b.hit(x, y)) b.press = true;
});
cv.addEventListener('mouseup', e => {
  const [x, y] = ptr(e);
  if (started && craftPanel && craftPanel.open) {
    const act = craftPanel.click(x, y);
    if (act === 'craft') doCraft();
    else if (act === 'move') audio.ui('move');
    return;
  }
  if (!started && scene === 'creator' && creator) {
    if (creator.up(x, y)) audio.ui('select');
    return;
  }
  if (!started && title) { if (title.up(x, y)) audio.ui('select'); return; }
  if (paused) {
    for (const b of pauseBtns) {
      if (b.press && b.hit(x, y)) { b.press = false; b.onClick(); return; }
      b.press = false;
    }
  }
});
// touch = tap to activate
cv.addEventListener('touchstart', e => {
  audio.init(); audio.resume();
  if (started && !paused) return;
  const t = e.touches[0]; const r = cv.getBoundingClientRect();
  const x = t.clientX - r.left, y = t.clientY - r.top;
  if (!started && scene === 'creator' && creator) { creator.move(x, y); creator.down(x, y); }
  else if (!started && title) { title.move(x, y); title.down(x, y); }
  else if (paused) for (const b of pauseBtns) { b.hover = b.hit(x, y); if (b.hover) b.press = true; }
}, { passive: true });
cv.addEventListener('touchend', e => {
  if (started && !paused) return;
  const t = e.changedTouches[0]; const r = cv.getBoundingClientRect();
  const x = t.clientX - r.left, y = t.clientY - r.top;
  if (!started && scene === 'creator' && creator) creator.up(x, y);
  else if (!started && title) title.up(x, y);
  else if (paused) for (const b of pauseBtns) {
    if (b.press && b.hit(x, y)) { b.press = false; b.onClick(); return; }
    b.press = false;
  }
});
addEventListener('blur', () => keys.clear());
addEventListener('visibilitychange', () => { if (document.hidden) autoSave(); });
addEventListener('beforeunload', () => autoSave());

// touch joystick
const stick = document.getElementById('stick');
let touchVec = { x: 0, y: 0 };
if (stick) {
  let base = null;
  const nub = document.getElementById('nub');
  const start = e => { const t = e.touches[0]; base = { x: t.clientX, y: t.clientY }; };
  const move = e => {
    if (!base) return;
    const t = e.touches[0];
    let dx = t.clientX - base.x, dy = t.clientY - base.y;
    const d = Math.hypot(dx, dy) || 1, m = Math.min(d, 42);
    dx = dx / d * m; dy = dy / d * m;
    nub.style.transform = `translate(${dx}px,${dy}px)`;
    touchVec = { x: dx / 42, y: dy / 42 };
    e.preventDefault();
  };
  const end = () => { base = null; touchVec = { x: 0, y: 0 }; nub.style.transform = ''; };
  stick.addEventListener('touchstart', start, { passive: true });
  stick.addEventListener('touchmove', move, { passive: false });
  stick.addEventListener('touchend', end);
  document.getElementById('btnAct').addEventListener('touchstart', e => { e.preventDefault(); interact(); });
  document.getElementById('btnMap').addEventListener('touchstart', e => { e.preventDefault(); showMap = !showMap; });
}



// ------------------------------------------------------------------ helpers
let noteT = 0, noteTitle = '', noteSub = '';
let toast = null, toastT = 0;
function note(title, sub) {
  noteTitle = title; noteSub = sub || ''; noteT = 3.4;
}
function floater(x, y, text, color, icon) {
  floaters.push({ x, y, text, color: color || '#fff', t: 0, icon });
}
function nearbyProps(radius) {
  const out = [];
  const c0 = Math.floor((player.x - radius) / (CH * TS)), c1 = Math.floor((player.x + radius) / (CH * TS));
  const r0 = Math.floor((player.y - radius) / (CH * TS)), r1 = Math.floor((player.y + radius) / (CH * TS));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    for (const p of world.chunk(cx, cy).props) {
      const d = Math.hypot(p.x - player.x, p.y - player.y);
      if (d < radius) out.push([d, p]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

const HARVEST = {
  berry: ['berry', 2, '#e8657a', 'Bayas'],
  mushroom: ['mushroom', 1, '#d89a5a', 'Hongo'],
  wood: ['wood', 2, '#c09050', 'Madera'],
  stone: ['stone', 2, '#b0b0c0', 'Piedra'],
  flower: ['flower', 1, '#e8a0d0', 'Flor'],
  ore: ['ore', 1, '#9ad0e8', 'Mineral'],
};

function interact() {
  if (paused) return;
  // Structures you built (and landmarks) take priority over scenery: a flower
  // growing next to your door should never steal the interaction.
  const PRIORITY = { door: 0, bed: 0, campfire: 0, chest: 1, shrine: 1 };
  const near = nearbyProps(34)
    .sort((a, b) => {
      const pa = PRIORITY[a[1].type] ?? 2, pb = PRIORITY[b[1].type] ?? 2;
      return pa !== pb ? pa - pb : a[0] - b[0];
    });
  for (const [d, p] of near) {
    if (p.taken) continue;
    if (p.type === 'chest' && !p.opened) {
      p.opened = true;
      world.consume(p);
      const rnd = mulberry32(hash2(p.x | 0, p.y | 0));
      const relics = 1 + (rnd() * 2 | 0) + state.relicBonus, ore = 1 + (rnd() * 3 | 0);
      state.items.relic += relics; state.items.ore += ore;
      floater(p.x, p.y - 12, `+${relics}`, '#f2d878', 'relic');
      note('COFRE ABIERTO', `${relics} RELIQUIA  ${ore} MINERAL`);
      audio.chest();
      state.prog.bump('chests');
      state.prog.set('relics', state.items.relic);
      for (let i = 0; i < 22; i++) burst(p.x, p.y - 6, '#e8c24a');
      ground.invalidate(Math.floor(p.x / (CH * TS)), Math.floor(p.y / (CH * TS)));
      return;
    }
    if (p.type === 'shrine') {
      if (!state.discovered.has(p.id)) {
        state.discovered.add(p.id);
        const gain = 10 + state.shrineBonus;
        state.maxStamina += gain; state.stamina = state.maxStamina;
        audio.shrine();
        state.prog.bump('shrines');
        state.prog.addXP(50);
        note('SANTUARIO DESPERTADO', `VIGOR MAXIMO +${gain}`);
        for (let i = 0; i < 34; i++) burst(p.x, p.y - 10, '#7fe4ff');
      } else { note('Santuario', 'Ya despertaste este lugar.'); }
      return;
    }
    if (p.type === 'door') {
      p.open = !p.open;
      p.s = p.open ? 'door_open' : 'door_closed';
      p.solid = !p.open;
      audio.noise({ dur: 0.22, vol: 0.13, freq: 380, q: 1.6,
                    sweep: p.open ? 240 : -180 });
      note(p.open ? 'PUERTA ABIERTA' : 'PUERTA CERRADA', '');
      return;
    }
    if (p.type === 'bed') {
      const isNightNow = state.time > 20 || state.time < 5.5;
      if (!isNightNow) { note('AUN ES DE DIA', 'DUERME AL ANOCHECER'); audio.ui('back'); return; }
      if (state.food < 15) { note('DEMASIADA HAMBRE', 'COME ANTES DE DORMIR'); audio.ui('back'); return; }
      const foes = creatures.some(c => (c.kind === 'wolf' || c.kind === 'slime') &&
        Math.hypot(c.x - player.x, c.y - player.y) < 110);
      if (foes) { note('HAY BESTIAS CERCA', 'NO PODES DORMIR'); audio.ui('back'); return; }
      state.sleeping = 2.6;
      audio.heal();
      return;
    }
    if (p.type === 'campfire') {
      state.stamina = state.maxStamina;
      state.warm = 100;
      state.hp = Math.min(state.maxHp, state.hp + 12);
      audio.heal();
      note('DESCANSASTE', 'VIGOR Y CALOR RESTAURADOS');
      return;
    }
    const h = HARVEST[p.type];
    if (h) {
      const [key, baseAmt, col, label] = h;
      const amt = baseAmt + state.gatherBonus;
      state.items[key] += amt;
      state.prog.bump('gathered', amt);
      if (p.type === 'wood') audio.chop();
      else if (p.type === 'stone' || p.type === 'ore') audio.mine();
      else audio.pickup(key);
      if (key === 'relic') state.prog.set('relics', state.items.relic);
      if (state.gatherStamina)
        state.stamina = Math.min(state.maxStamina, state.stamina + state.gatherStamina);
      p.taken = true;
      world.consume(p);
      floater(p.x, p.y - 10, `+${amt}`, col, key);
      for (let i = 0; i < 8; i++) burst(p.x, p.y - 4, col);
      ground.invalidate(Math.floor(p.x / (CH * TS)), Math.floor(p.y / (CH * TS)));
      return;
    }
  }
  note('Nada por aquí', 'Acercate a un recurso o estructura.');
}

function burst(x, y, col) {
  particles.push({
    x, y, vx: (Math.random() - .5) * 40, vy: -20 - Math.random() * 40,
    life: .5 + Math.random() * .5, t: 0, c: col, g: 60,
  });
}

// ------------------------------------------------------------------ update
/** Recolorea el atlas si cambió la estación. Barato de llamar por fotograma:
 *  compara un id y sale. El recoloreo en si corre una vez cada varios días. */
function applySeason(force) {
  if (!atlas || !atlasImg) return;
  const s = seasonOf(state.day);
  if (!force && seasonApplied && s.id === season.id) return;
  season = s; seasonApplied = true;
  atlas.img = recolorAtlas(atlasImg, atlas.idx, s);
  if (ground) ground.invalidateAll();
  if (bgGround) bgGround.invalidateAll();
}

let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  resize();
  if (started) applySeason();
  if (started && !paused && !(craftPanel && craftPanel.open)) update(dt);
  if (started) { draw(dt); if (paused) drawPause(); }
  else if (scene === 'creator') { drawTitle(dt, true); creator.draw(ctx, cv.width, cv.height, dt); }
  else drawTitle(dt);
  requestAnimationFrame(frame);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  const dpr = 1; // pixel-art: render at CSS pixels, integer zoom
  if (cv.width !== w * dpr || cv.height !== h * dpr) {
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.imageSmoothingEnabled = false;
    if (light) light.resize(w, h);
  }
}

function update(dt) {
  // ---- time
  const dayScale = [0.6, 1.0, 1.7][state.worldCfg ? state.worldCfg.daylen : 1];
  state.time += dt * (24 / (900 * dayScale));
  if (state.time > 21 || state.time < 4) state.sawNight = true;
  if (state.time >= 24) {
    state.time -= 24; state.day++;
    note(`DIA ${state.day}`, '');
    if (state.sawNight) { state.prog.bump('nights'); state.sawNight = false; }
  }

  // ---- weather
  weather.t += dt;
  if (weather.t > weather.next) {
    weather.t = 0; weather.next = 45 + Math.random() * 90;
    const b = world.biomeAt(Math.floor(player.x / TS), Math.floor(player.y / TS));
    const r = Math.random();
    if (b === BIOME.SNOW) weather.type = r < .5 ? 'snow' : 'clear';
    else if (b === BIOME.DESERT || b === BIOME.ASH) weather.type = 'clear';
    else weather.type = r < .32 ? 'rain' : 'clear';
    if (weather.type === 'rain') note('Empieza a llover', '');
    if (weather.type === 'snow') note('Comienza a nevar', '');
  }

  // ---- movement
  let ix = 0, iy = 0;
  if (keys.has('w') || keys.has('arrowup')) iy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) iy += 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  ix += touchVec.x; iy += touchVec.y;
  const mag = Math.hypot(ix, iy);
  if (mag > 1) { ix /= mag; iy /= mag; }

  const tileX = Math.floor(player.x / TS), tileY = Math.floor(player.y / TS);
  const inWater = world.isWater(tileX, tileY);
  player.swim = inWater;
  const sprint = (keys.has('shift')) && state.stamina > 0 && mag > 0 && !inWater;
  let sp = player.speed * (inWater ? 0.55 : 1) * (sprint ? 1.85 : 1);
  const bio = world.biomeAt(tileX, tileY);
  if (bio === BIOME.SWAMP) sp *= 0.78;
  if (bio === BIOME.SNOW) sp *= 0.88;

  if (sprint) state.stamina = Math.max(0, state.stamina - dt * (state.gear.boots ? 16.5 : 22));
  else state.stamina = Math.min(state.maxStamina, state.stamina + dt * (mag > 0 ? 6 : 14));

  const nx = player.x + ix * sp * dt, ny = player.y + iy * sp * dt;
  const moved = Math.hypot(nx - player.x, ny - player.y);
  if (!blocked(nx, player.y)) player.x = nx;
  if (!blocked(player.x, ny)) player.y = ny;
  state.distance += moved;
  state.prog.set('distance', state.distance / TS / 10 * 100);

  player.moving = mag > 0.06;
  if (player.moving) {
    player.anim += dt * (sprint ? 12 : 8);
    if (Math.abs(ix) > Math.abs(iy)) player.dir = ix > 0 ? 3 : 1;
    else if (iy !== 0) player.dir = iy > 0 ? 0 : 2;
    // footstep dust / ripples
    stepAcc += dt * (sprint ? 9.5 : 6.2);
    if (stepAcc >= 1) {
      stepAcc = 0;
      const tn2 = world.tileName(tileX, tileY);
      audio.step(inWater ? 'water' :
        (tn2 === 'rock' || tn2 === 'ash' ? 'rock' :
         tn2 === 'snow' ? 'snow' : tn2 === 'sand' ? 'sand' : 'grass'));
    }
    if (Math.random() < dt * 12) {
      particles.push({
        x: player.x + (Math.random() - .5) * 6, y: player.y + 9,
        vx: 0, vy: -4, life: .45, t: 0, g: 0,
        c: inWater ? 'rgba(200,235,255,.75)' : 'rgba(200,190,160,.5)', size: inWater ? 3 : 2,
      });
    }
  } else player.anim = 0;

  // ---- discovery
  const bname = BIOME_INFO[bio].name;
  if (!state.biomesSeen.has(bio)) {
    state.biomesSeen.add(bio);
    state.prog.set('biomes', state.biomesSeen.size);
    audio.discover();
    note(`DESCUBRISTE: ${bname}`, `BIOMAS ${state.biomesSeen.size}/11`);
  }

  // ---- survival: hunger, cold, regeneration
  const foodDrain = sprint ? 0.85 : (mag > 0 ? 0.55 : 0.32);
  state.food = Math.max(0, state.food - dt * foodDrain);
  const nearFire = nearbyProps(60).some(([, p]) => p.type === 'campfire');
  const isNight = state.time > 20.5 || state.time < 5.5;
  const noon = Math.max(0, 1 - Math.abs(state.time - 13) / 4.5);   // midday strength
  const thermal = state.gear.thermal ? 0.45 : 1;                    // thermal cloak

  // --- COLD: tundra, mountains, night, swimming
  let chill = 0;
  if (bio === BIOME.SNOW) chill += 5.4;
  else if (bio === BIOME.ROCK) chill += 2.0;
  if (isNight) chill += 2.2;
  if (inWater) chill += 3.2;
  chill += season.chill;        // invierno endurece, verano perdona
  if (nearFire) chill = -9;
  state.warm = Math.max(0, Math.min(100, state.warm - dt * chill * thermal));
  if (chill <= 0) state.warm = Math.min(100, state.warm + dt * 9);

  // --- HEAT: desert and ashlands under the midday sun; shade helps
  const inShade = nearbyProps(26).some(([, p]) => p.type === 'tree');
  let bake = 0;
  if (bio === BIOME.DESERT) bake += 4.6 * (0.35 + noon);
  else if (bio === BIOME.ASH) bake += 5.6 * (0.5 + noon * 0.8);
  if (bake > 0) bake = Math.max(0, bake + season.bake);
  if (bake > 0) {
    if (inShade) bake *= 0.35;
    if (inWater) bake = -14;
    if (isNight) bake *= 0.15;
  }
  if (bake > 0) state.heat = Math.min(100, state.heat + dt * bake * thermal);
  else state.heat = Math.max(0, state.heat - dt * 11);
  // heat makes you thirsty-hungry faster
  if (state.heat > 55) state.food = Math.max(0, state.food - dt * 0.5);

  let dps = 0;
  if (state.food <= 0) dps += 1.6;
  if (state.warm <= 0) dps += 2.2;
  if (state.heat >= 100) dps += 2.4;
  if (dps > 0) damage(dps * dt, 'exposure');
  else if (state.food > 40 && state.warm > 30 && state.heat < 70) {
    state.healTimer += dt;
    if (state.healTimer > 1) {
      state.healTimer = 0;
      if (state.hp < state.maxHp) state.hp = Math.min(state.maxHp, state.hp + 1);
    }
  }
  if (state.hurtFlash > 0) state.hurtFlash -= dt;
  if (state.swingT > 0) state.swingT -= dt;

  // ---- creatures
  updateCreatures(dt);

  // ---- sleeping: fade out, skip to dawn, wake restored
  if (state.sleeping > 0) {
    state.sleeping -= dt;
    if (state.sleeping <= 1.3 && !state.slept) {
      state.slept = true;
      state.day++;
      state.time = 6.2;
      state.hp = Math.min(state.maxHp, state.hp + state.maxHp * 0.45);
      state.stamina = state.maxStamina;
      state.warm = 100;
      state.food = Math.max(0, state.food - 18);   // you still get hungry
      if (state.sawNight) { state.prog.bump('nights'); state.sawNight = false; }
      state.prog.addXP(25);
      autoSave();
    }
    if (state.sleeping <= 0) {
      state.slept = false;
      note('AMANECE', `DIA ${state.day}`);
      audio.discover();
    }
    return;   // world is paused while you sleep
  }

  // ---- autosave every 20s of play
  saveTimer -= dt;
  if (saveTimer <= 0) { saveTimer = 20; autoSave(); }

  // ---- audio ambience + score
  const night = state.time > 20 || state.time < 5.5;
  const danger = creatures.some(c => c.kind === 'wolf' &&
    Math.hypot(c.x - player.x, c.y - player.y) < 150);
  const ak = { [BIOME.ROCK]: 'rock', [BIOME.SNOW]: 'snow', [BIOME.ASH]: 'ash',
    [BIOME.DESERT]: 'desert', [BIOME.FOREST]: 'forest', [BIOME.SWAMP]: 'swamp' }[bio];
  audio.setAmbience(inWater ? 'water' : (ak || 'default'), night);
  audio.tickAmbience(dt, bio, night);
  audio.tickMusic(dt, night, danger);

  // ---- particles / weather fx
  updateParticles(dt);
  spawnWeather(dt);

  // ---- camera (smooth, snapped later)
  const lead = 10;
  const tx = player.x + ix * lead, ty = player.y + iy * lead;
  cam.x += (tx - cam.x) * Math.min(1, dt * 6);
  cam.y += (ty - cam.y) * Math.min(1, dt * 6);

  // ---- look-at prompt
  const near = nearbyProps(34).filter(([, p]) => !p.taken &&
    (HARVEST[p.type] || ['chest', 'shrine', 'campfire', 'bed', 'door'].includes(p.type)));
  state.lookedAt = near.length ? near[0][1] : null;

  updateHUD();
}

function damage(amount, src) {
  if (state.gameOver) return;
  state.hp -= amount;
  if (amount > 0.6) {
    state.hurtFlash = 0.35;
    audio.hurt();
    shake(Math.min(6, amount * 0.7));
  }
  if (state.hp <= 0) {
    state.hp = 0;
    state.gameOver = true;
    state.goT = 0;
    state.deaths++;
    audio.tone(160, { type: 'sawtooth', dur: 1.4, vol: 0.22, slide: -90 });
  }
}

function eat() {
  // crafted rations first, they are the best food
  if (state.pouch.ration > 0) {
    state.pouch.ration--;
    state.food = Math.min(state.maxFood, state.food + 60);
    audio.heal();
    floater(player.x, player.y - 14, '+60', '#8fd48a', 'berry');
    note('RACION CONSUMIDA', 'HAMBRE RESTAURADA');
    return true;
  }
  const order = [['mushroom', 26], ['berry', 18]];
  for (const [k, amt] of order) {
    if (state.items[k] > 0) {
      state.items[k]--;
      state.food = Math.min(state.maxFood, state.food + amt);
      state.hp = Math.min(state.maxHp, state.hp + amt * 0.35);
      audio.heal();
      floater(player.x, player.y - 14, `+${amt}`, '#8fd48a', k);
      note('COMISTE', k === 'berry' ? 'BAYAS' : 'HONGO');
      return true;
    }
  }
  note('SIN COMIDA', 'BUSCA BAYAS U HONGOS');
  audio.ui('back');
  return false;
}

function doCraft() {
  const r = RECIPES[craftPanel.sel];
  if (isBuilt(state, r) || !canAfford(state, r)) {
    craftPanel.notify(false); audio.ui('back'); return;
  }
  craft(state, player, r);
  craftPanel.notify(true);
  audio.chest();
  note('FABRICADO', r.n);
}

function useSalve() {
  if ((state.pouch.poultice || 0) <= 0) {
    note('SIN CATAPLASMAS', 'FABRICA UNA EN EL TALLER [C]');
    audio.ui('back'); return;
  }
  if (state.hp >= state.maxHp) { note('YA ESTAS SANO', ''); return; }
  state.pouch.poultice--;
  state.hp = Math.min(state.maxHp, state.hp + 45);
  audio.heal();
  floater(player.x, player.y - 14, '+45', '#8fd48a', 'mushroom');
  note('CATAPLASMA', 'VIDA RESTAURADA');
}

const PLACEABLES = {
  campfire: { s: 'campfire_0', type: 'campfire', anim: 4, solid: false, r: 0,
              n: 'HOGUERA', sub: 'CALOR Y DESCANSO' },
  bedroll:  { s: 'bedroll_0', type: 'bed', solid: false, r: 0,
              n: 'PETATE', sub: 'DUERME CON [E]' },
  wall:     { s: 'wall_0', type: 'wall', solid: true, r: 7,
              n: 'MURO', sub: 'BLOQUEA EL PASO' },
  door:     { s: 'door_closed', type: 'door', solid: true, r: 7,
              n: 'PUERTA', sub: 'ABRE Y CIERRA CON [E]' },
};
const PLACE_ORDER = ['campfire', 'bedroll', 'wall', 'door'];

function ownedPlaceables() {
  return PLACE_ORDER.filter(k => (state.pouch[k] || 0) > 0);
}

function cyclePlaceable() {
  const own = ownedPlaceables();
  if (!own.length) return;
  const i = own.indexOf(state.placeSel);
  state.placeSel = own[(i + 1) % own.length];
  audio.ui('move');
  note('SELECCIONADO', PLACEABLES[state.placeSel].n);
}

function placeSelected() {
  const own = ownedPlaceables();
  if (!own.length) {
    note('NADA QUE COLOCAR', 'FABRICA EN EL TALLER [C]');
    audio.ui('back'); return;
  }
  if (!own.includes(state.placeSel)) state.placeSel = own[0];
  const key = state.placeSel;
  const def = PLACEABLES[key];
  // drop it just in front of the player, snapped to the tile grid
  const off = [[0, 16], [-16, 0], [0, -16], [16, 0]][player.dir];
  const gx = Math.floor((player.x + off[0]) / TS) * TS + TS / 2;
  const gy = Math.floor((player.y + off[1]) / TS) * TS + TS / 2;
  // refuse to stack on something solid
  if (def.solid && blocked(gx, gy - 6)) {
    note('NO CABE AHI', ''); audio.ui('back'); return;
  }
  state.pouch[key]--;
  world.place({
    x: gx, y: gy, s: def.s, solid: def.solid, r: def.r,
    type: def.type, anim: def.anim || 0,
  });
  ground.invalidate(Math.floor(gx / (CH * TS)), Math.floor(gy / (CH * TS)));
  audio.chest();
  note(def.n + ' COLOCADO', def.sub);
}

/** Spear swing: shoves and hurts nearby beasts. */
function swing() {
  if (state.swingT > 0) return;
  state.swingT = 0.42;
  audio.noise({ dur: 0.14, vol: 0.16, freq: 1500, q: 1.2, sweep: -900 });
  let hitAny = false;
  for (const c of creatures) {
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d > 34) continue;
    const a = Math.atan2(c.y - player.y, c.x - player.x);
    c.x += Math.cos(a) * 26; c.y += Math.sin(a) * 26;
    c.vx = Math.cos(a) * c.speed * 2.2; c.vy = Math.sin(a) * c.speed * 2.2;
    c.scared = 4.5;
    c.t = 3;
    hitAny = true;
    for (let i = 0; i < 6; i++) burst(c.x, c.y - 4, '#e8d0a0');
  }
  if (hitAny) { audio.hurt(); shake(2.2); }
}

let stepAcc = 0;
let saveTimer = 20;
let shakeAmt = 0, shakeT = 0;
function shake(a) { shakeAmt = Math.max(shakeAmt, a); shakeT = 0.28; }

function blocked(x, y) {
  const r = 4;
  const c0 = Math.floor((x - 40) / (CH * TS)), c1 = Math.floor((x + 40) / (CH * TS));
  const r0 = Math.floor((y - 40) / (CH * TS)), r1 = Math.floor((y + 40) / (CH * TS));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    for (const p of world.chunk(cx, cy).props) {
      if (!p.solid || p.taken) continue;
      const dx = x - p.x, dy = (y + 6) - p.y;
      const rr = p.r + r;
      if (dx * dx + dy * dy * 2.2 < rr * rr) return true;
    }
  }
  // deep water is impassable
  return world.biomeAt(Math.floor(x / TS), Math.floor((y + 6) / TS)) === BIOME.DEEP;
}

function updateCreatures(dt) {
  // spawn from nearby chunks
  const pc = [Math.floor(player.x / (CH * TS)), Math.floor(player.y / (CH * TS))];
  if (creatures.length < 26) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const ch = world.chunk(pc[0] + dx, pc[1] + dy);
      for (const s of ch.spawns) {
        if (s.alive) continue;
        const d = Math.hypot(s.x - player.x, s.y - player.y);
        if (d > 200 && d < 420 && Math.random() < dt * 0.9) {
          s.alive = true;
          creatures.push({
            kind: s.kind, x: s.x, y: s.y, dir: 0, anim: 0, src: s,
            state: 'idle', t: Math.random() * 3, vx: 0, vy: 0,
            speed: { rabbit: 46, deer: 38, wolf: 44, slime: 18, bird: 55 }[s.kind],
            shy: ({ rabbit: 78, deer: 92, wolf: 40, slime: 30, bird: 70 }[s.kind]) + (state.shyBonus || 0),
          });
        }
      }
    }
  }
  for (let i = creatures.length - 1; i >= 0; i--) {
    const c = creatures[i];
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d > 560) { c.src.alive = false; creatures.splice(i, 1); continue; }
    c.t -= dt;
    if (c.scared > 0) c.scared -= dt;
    const fleeing = (d < c.shy && c.kind !== 'wolf') || c.scared > 0;
    const stalking = c.kind === 'wolf' && d < 150 && d > 34;
    if (fleeing) {
      const a = Math.atan2(c.y - player.y, c.x - player.x);
      c.vx = Math.cos(a) * c.speed * 1.5; c.vy = Math.sin(a) * c.speed * 1.5;
      c.state = 'run';
    } else if (stalking) {
      const a = Math.atan2(player.y - c.y, player.x - c.x);
      const rush = d < 80 ? 1.25 : 0.6;
      c.vx = Math.cos(a) * c.speed * rush; c.vy = Math.sin(a) * c.speed * rush;
      c.state = 'walk';
      c.growlT = (c.growlT || 0) - dt;
      if (c.growlT <= 0) { c.growlT = 3 + Math.random() * 4; audio.growl(); }
    }
    // hostile contact
    if (c.kind === 'wolf' || c.kind === 'slime') {
      c.atk = (c.atk || 0) - dt;
      if (d < 16 && c.atk <= 0 && !state.gameOver && !(c.scared > 0)) {
        c.atk = 1.1;
        damage(c.kind === 'wolf' ? 9 : 5, c.kind);
        // knock the player back so it never becomes an instant loop
        const a2 = Math.atan2(player.y - c.y, player.x - c.x);
        player.x += Math.cos(a2) * 11; player.y += Math.sin(a2) * 11;
      }
    } else if (c.t <= 0) {
      c.t = 1 + Math.random() * 3;
      if (Math.random() < .55) {
        const a = Math.random() * Math.PI * 2;
        c.vx = Math.cos(a) * c.speed * .5; c.vy = Math.sin(a) * c.speed * .5;
        c.state = 'walk';
      } else { c.vx = c.vy = 0; c.state = 'idle'; }
    }
    const nx = c.x + c.vx * dt, ny = c.y + c.vy * dt;
    const flying = c.kind === 'bird';
    if (flying || !world.isWater(Math.floor(nx / TS), Math.floor(c.y / TS))) c.x = nx;
    else c.vx *= -1;
    if (flying || !world.isWater(Math.floor(c.x / TS), Math.floor(ny / TS))) c.y = ny;
    else c.vy *= -1;
    if (Math.abs(c.vx) > Math.abs(c.vy)) c.dir = c.vx > 0 ? 3 : 1;
    else if (c.vy !== 0) c.dir = c.vy > 0 ? 0 : 2;
    const mv = Math.hypot(c.vx, c.vy);
    c.anim += dt * (mv > 1 ? (c.kind === 'bird' ? 14 : 8) : 2.5);
    if (c.state === 'idle') { c.vx *= 0.9; c.vy *= 0.9; }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.t += dt;
    if (p.t > p.life) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    floaters[i].t += dt;
    if (floaters[i].t > 1.3) floaters.splice(i, 1);
  }
}

let wxAcc = 0;
function spawnWeather(dt) {
  if (weather.type === 'clear') return;
  wxAcc += dt * (weather.type === 'rain' ? 90 : 34);
  const vw = cv.width / ZOOM, vh = cv.height / ZOOM;
  while (wxAcc > 1) {
    wxAcc -= 1;
    const x = cam.x - vw / 2 + Math.random() * vw * 1.3;
    const y = cam.y - vh / 2 - 10 + Math.random() * 10;
    if (weather.type === 'rain')
      particles.push({ x, y, vx: -40, vy: 320, life: vh / 320, t: 0, g: 0, c: 'rgba(160,200,240,.55)', size: 1, len: 6 });
    else
      particles.push({ x, y, vx: (Math.random() - .5) * 20, vy: 34 + Math.random() * 20, life: vh / 40, t: 0, g: 0, c: 'rgba(255,255,255,.85)', size: 1 + (Math.random() * 2 | 0), sway: Math.random() * 6 });
  }
}

// ------------------------------------------------------------------ draw
function skyTint() {
  const t = state.time;
  // key colours through the day
  const stops = [
    [0,    [14, 20, 52],   0.90], [4.5,  [18, 24, 60],   0.88],
    [5.8,  [78, 62, 96],   0.52], [6.8,  [255, 186, 146], 0.20],
    [8.0,  [255, 232, 200], 0.05], [12,   [255, 255, 255], 0.00],
    [17,   [255, 248, 224], 0.05], [18.6, [255, 172, 112], 0.26],
    [19.8, [186, 108, 118], 0.46], [20.8, [92, 72, 122],   0.66],
    [22,   [18, 24, 60],   0.88], [24,   [14, 20, 52],   0.90],
  ];
  let a = stops[0], b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (t >= stops[i][0] && t <= stops[i + 1][0]) { a = stops[i]; b = stops[i + 1]; }
  const f = (t - a[0]) / Math.max(0.001, b[0] - a[0]);
  const col = [0, 1, 2].map(i => Math.round(a[1][i] + (b[1][i] - a[1][i]) * f));
  const amt = a[2] + (b[2] - a[2]) * f;
  return { col, amt };
}

function draw(dt) {
  const vw = Math.ceil(cv.width / ZOOM), vh = Math.ceil(cv.height / ZOOM);
  let shx = 0, shy = 0;
  if (shakeT > 0) {
    shakeT -= 1 / 60;
    const k = Math.max(0, shakeT / 0.28) * shakeAmt;
    shx = (Math.random() - .5) * k * 2; shy = (Math.random() - .5) * k * 2;
    if (shakeT <= 0) shakeAmt = 0;
  }
  const camX = Math.round(cam.x - vw / 2 + shx), camY = Math.round(cam.y - vh / 2 + shy);

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  ctx.fillStyle = '#0d1520';
  ctx.fillRect(0, 0, vw, vh);

  // ---- ground
  const wframe = Math.floor(performance.now() / 190) % 6;
  const fframe = Math.floor(performance.now() / 230) % 4;
  const c0 = Math.floor(camX / (CH * TS)), c1 = Math.floor((camX + vw) / (CH * TS));
  const r0 = Math.floor(camY / (CH * TS)), r1 = Math.floor((camY + vh) / (CH * TS));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    const g = ground.get(cx, cy, wframe, fframe);
    ctx.drawImage(g, cx * CH * TS - camX, cy * CH * TS - camY);
  }

  // ---- collect drawables (y-sorted)
  const draws = [];
  for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
    for (const p of world.chunk(cx, cy).props) {
      if (p.taken) continue;
      let name = p.s;
      if (p.anim) name = p.s.replace(/_\d+$/, '_' + (Math.floor(performance.now() / 130) % p.anim));
      if (p.type === 'chest' && p.opened) name = 'chest_0';
      const [w, h] = atlas.size(name);
      const x = p.x - w / 2, y = p.y - h + 4;
      if (x > camX + vw + 40 || x + w < camX - 40 || y > camY + vh + 40 || y + h < camY - 60) continue;
      draws.push({ y: p.y, n: name, x, yy: y, p });
    }
  }
  for (const c of creatures) {
    const f = Math.floor(c.anim) % 4;
    const act = Math.hypot(c.vx, c.vy) > 1 ? 'walk' : 'idle';
    const name = `${c.kind}_${act}_${DIRN[c.dir]}_${act === 'idle' ? 0 : f}`;
    const [w, h] = atlas.size(name);
    draws.push({ y: c.y, n: name, x: c.x - w / 2, yy: c.y - h + 5 });
  }
  {
    const f = Math.floor(player.anim) % 4;
    const act = player.moving ? 'walk' : 'idle';
    const hs = state.look ? state.look.hair : 0;
    const name = `player${hs}_${act}_${DIRN[player.dir]}_${act === 'idle' ? 0 : f}`;
    const fr = playerSheet ? playerSheet.index[name] : null;
    const w = fr ? fr[2] : 20, h = fr ? fr[3] : 30;
    draws.push({ y: player.y, n: name, x: player.x - w / 2,
      yy: player.y - h + 7, isPlayer: true, custom: fr });
  }
  draws.sort((a, b) => a.y - b.y);

  // ---- sombras proyectadas
  // Tiene que ser un pase propio: si la sombra se dibujara junto a cada sprite,
  // la sombra de un árbol de adelante taparia al árbol de atrás. Antes la sombra
  // venia horneada dentro del sprite (alpha 70, radio 10px), asi que era
  // invisible y no podia seguir al sol.
  {
    const ph = (state.time - 12) / 24 * Math.PI * 2;
    const day = Math.max(0, Math.min(1, (Math.cos(ph) + 0.25) / 0.8));
    const skew = Math.sin(ph) * 0.8;          // de un lado al otro a lo largo del día
    const len = 0.75 + (1 - day) * 0.95;      // corta al mediodía, larga al alba
    ctx.globalAlpha = 0.13 + day * 0.23;      // de noche queda sólo el contacto
    for (const d of draws) {
      if (d.p && d.p.type === 'deco') continue;
      let w, h;
      if (d.isPlayer && d.custom) { w = d.custom[2]; h = d.custom[3]; }
      else { const sz = atlas.size(d.n); w = sz[0]; h = sz[1]; }
      if (!w) continue;
      const sw = Math.max(6, (Math.round(w * 0.74) >> 1) << 1);
      const sh = Math.max(4, (Math.round(h * 0.20 * len) >> 1) << 1);
      ctx.save();
      ctx.translate(Math.round(d.x - camX + w / 2), Math.round(d.yy - camY + h - 3));
      ctx.transform(1, 0, skew, 1, 0, 0);
      ctx.drawImage(shadows.get(sw, sh), -sw / 2, -sh / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  for (const d of draws) {
    if (d.isPlayer && d.custom) {
      const fr = d.custom;
      if (player.swim) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x - camX, d.yy - camY, 22, 20);
        ctx.clip();
        ctx.drawImage(playerSheet.canvas, fr[0], fr[1], fr[2], fr[3],
          Math.round(d.x - camX), Math.round(d.yy - camY), fr[2], fr[3]);
        ctx.restore();
        ctx.fillStyle = 'rgba(140,200,235,.35)';
        ctx.fillRect(d.x - camX - 2, d.yy - camY + 18, 24, 3);
      } else {
        ctx.drawImage(playerSheet.canvas, fr[0], fr[1], fr[2], fr[3],
          Math.round(d.x - camX), Math.round(d.yy - camY), fr[2], fr[3]);
      }
    } else if (d.isPlayer && player.swim) {
      // clip lower body when swimming
      ctx.save();
      ctx.beginPath();
      ctx.rect(d.x - camX, d.yy - camY, 22, 20);
      ctx.clip();
      atlas.draw(ctx, d.n, d.x - camX, d.yy - camY);
      ctx.restore();
      ctx.fillStyle = 'rgba(140,200,235,.35)';
      ctx.fillRect(d.x - camX - 2, d.yy - camY + 18, 24, 3);
    } else {
      // fade props that overlap the player from the front
      let a;
      if (d.p && d.p.solid && (d.p.type === 'tree' || d.p.type === 'ruin') &&
        Math.abs(d.p.x - player.x) < 22 &&
        player.y < d.p.y && player.y > d.p.y - 58) a = 0.42;
      // Espejado por posición: duplica las siluetas sin gastar un byte de atlas.
      // Ya lo haciamos con los tiles del suelo pero no con los props.
      const flip = d.p && (d.p.type === 'tree' || d.p.type === 'deco' || d.p.type === 'bush') &&
        (hash2(d.p.x | 0, d.p.y | 0) & 1);

      const sway = d.p && (d.p.type === 'tree' || (d.n.startsWith('tuft_')));
      const [szW, szH] = atlas.size(d.n);
      const wind = sway ? Math.sin(performance.now() / 1400 + (d.p.x + d.p.y) * 0.012) * 1.6 : 0;

      ctx.save();
      if (sway) {
        ctx.translate(Math.round(d.x - camX), Math.round(d.yy - camY + szH));
        ctx.transform(1, 0, -wind / szH, 1, 0, 0);
        if (flip) {
          ctx.translate(szW, 0);
          ctx.scale(-1, 1);
        }
        atlas.draw(ctx, d.n, 0, -szH, a);
      } else {
        if (flip) {
          ctx.translate(Math.round(d.x - camX) + szW, Math.round(d.yy - camY));
          ctx.scale(-1, 1);
          atlas.draw(ctx, d.n, 0, 0, a);
        } else {
          atlas.draw(ctx, d.n, d.x - camX, d.yy - camY, a);
        }
      }
      ctx.restore();

      // Rim light for tall props
      if (d.p && (d.p.type === 'tree' || d.p.type === 'ruin' || d.p.type === 'stone')) {
        const ph = (state.time - 12) / 24 * Math.PI * 2;
        const day = Math.max(0, Math.min(1, (Math.cos(ph) + 0.25) / 0.8));
        if (day > 0.05 && day < 0.95) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25;
          const sunX = Math.sign(Math.sin(ph));
          if (flip) {
            ctx.translate(Math.round(d.x - camX) + szW + sunX, Math.round(d.yy - camY) - 1);
            ctx.scale(-1, 1);
            atlas.draw(ctx, d.n, 0, 0, a);
          } else {
            atlas.draw(ctx, d.n, d.x - camX + sunX, d.yy - camY - 1, a);
          }
          ctx.restore();
        }
      }
    }
  }

  // ---- particles
  for (const p of particles) {
    const a = 1 - p.t / p.life;
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.fillStyle = p.c;
    const px = Math.round(p.x - camX + (p.sway ? Math.sin(p.t * 3) * p.sway : 0));
    const py = Math.round(p.y - camY);
    if (p.len) ctx.fillRect(px, py, 1, p.len);
    else ctx.fillRect(px, py, p.size || 2, p.size || 2);
  }
  ctx.globalAlpha = 1;

  // ---- fireflies at night
  const night = state.time > 19.5 || state.time < 5.5;
  if (night) drawFireflies(camX, camY, vw, vh);

  // ---- floaters
  ctx.font = 'bold 7px monospace'; ctx.textAlign = 'left';
  for (const f of floaters) {
    const a = Math.max(0, 1 - Math.pow(f.t / 1.3, 2));
    ctx.globalAlpha = a;
    const fx = Math.round(f.x - camX), fy = Math.round(f.y - camY - f.t * 16);
    const w = ctx.measureText(f.text).width;
    const hasIcon = f.icon && atlas.has('item_' + f.icon);
    const iw = hasIcon ? 11 : 0;
    const x0 = fx - (w + iw) / 2;
    if (hasIcon) {
      ctx.save();
      ctx.translate(x0, fy - 8);
      ctx.scale(0.5, 0.5);
      atlas.draw(ctx, 'item_' + f.icon, 0, 0);
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    ctx.fillText(f.text, x0 + iw + 1, fy + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x0 + iw, fy);
  }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
  ctx.restore();

  // ---- lighting pass (screen space)
  const { col, amt } = skyTint();
  if (amt > 0.02) {
    // multiply tint = lerp(white, skyColour, amt)
    const tint = col.map(c => Math.round(255 + (c - 255) * amt));
    const lights = [];
    if (player.lantern && amt > 0.12) {
      const fl = 1 + Math.sin(performance.now() / 90) * 0.03 + Math.sin(performance.now() / 37) * 0.02;
      const tb = state.gear.torch ? 1.6 : 1;
      lights.push({ x: player.x, y: player.y + 2, r: 64 * fl * tb, i: 1.15, c: [255, 196, 122] });
      lights.push({ x: player.x, y: player.y + 2, r: 26 * fl * tb, i: 0.9, c: [255, 232, 186] });
    }
    for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
      for (const p of world.chunk(cx, cy).props) {
        if (p.type === 'campfire') lights.push({ x: p.x, y: p.y - 4, r: 58 + Math.sin(performance.now() / 120) * 4, i: 1.25, c: [255, 166, 84] });
        if (p.type === 'shrine') lights.push({ x: p.x, y: p.y - 20, r: 44, i: 0.95, c: [110, 210, 255] });
        if (p.s === 'ore_crystal') lights.push({ x: p.x, y: p.y - 6, r: 26, i: 0.7, c: [110, 210, 255] });
      }
    }
    const lm = light.render(`rgb(${tint[0]},${tint[1]},${tint[2]})`,
      lights, camX, camY, ZOOM);
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lm, 0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;

    // colour grade: golden hour warmth / moonlit cool on the highlights
    const t = state.time;
    const goldenAM = Math.max(0, 1 - Math.abs(t - 7.2) / 1.9);
    const goldenPM = Math.max(0, 1 - Math.abs(t - 18.8) / 2.1);
    const golden = Math.max(goldenAM, goldenPM);
    if (golden > 0.02) {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = `rgba(255,168,86,${(golden * 0.22).toFixed(3)})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    const moon = Math.max(0, Math.min(1, (amt - 0.55) / 0.35));
    if (moon > 0.02) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(48,74,138,${(moon * 0.13).toFixed(3)})`;
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---- gradación permanente: sombras al frío, luces al ámbar.
  // Antes esto sólo entraba en la hora dorada (`golden > 0.02`), asi que el
  // resto del día la imagen salia neutra: el "mediodía plano" de la captura.
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = `rgb(${season.mul[0]},${season.mul[1]},${season.mul[2]})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = `rgb(${season.ovr[0]},${season.ovr[1]},${season.ovr[2]})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // subtle vignette — más suave: ahora hay sombras de verdad en escena y no
  // hace falta oscurecer las esquinas a la fuerza
  const vg = ctx.createRadialGradient(cv.width / 2, cv.height / 2, Math.min(cv.width, cv.height) * .42,
    cv.width / 2, cv.height / 2, Math.max(cv.width, cv.height) * .78);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.26)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cv.width, cv.height);

  if (state.hurtFlash > 0) {
    const a = Math.max(0, state.hurtFlash / 0.35);
    const vg2 = ctx.createRadialGradient(cv.width / 2, cv.height / 2,
      Math.min(cv.width, cv.height) * .22, cv.width / 2, cv.height / 2,
      Math.max(cv.width, cv.height) * .62);
    vg2.addColorStop(0, 'rgba(150,20,20,0)');
    vg2.addColorStop(1, `rgba(150,20,20,${(a * .55).toFixed(3)})`);
    ctx.fillStyle = vg2; ctx.fillRect(0, 0, cv.width, cv.height);
  }
  // low-health pulse
  if (state.hp / state.maxHp < 0.3 && !state.gameOver) {
    const p = 0.16 + 0.12 * Math.sin(performance.now() / 260);
    const vg3 = ctx.createRadialGradient(cv.width / 2, cv.height / 2,
      Math.min(cv.width, cv.height) * .30, cv.width / 2, cv.height / 2,
      Math.max(cv.width, cv.height) * .68);
    vg3.addColorStop(0, 'rgba(140,16,16,0)');
    vg3.addColorStop(1, `rgba(140,16,16,${p.toFixed(3)})`);
    ctx.fillStyle = vg3; ctx.fillRect(0, 0, cv.width, cv.height);
  }
  drawHUD();
  if (showMap) drawMap();
  if (craftPanel && craftPanel.open) craftPanel.draw(ctx, cv.width, cv.height, state, 1 / 60);
  if (state.sleeping > 0) {
    // fade to black and back as the night passes
    const a = state.sleeping > 1.3
      ? 1 - (state.sleeping - 1.3) / 1.3
      : state.sleeping / 1.3;
    ctx.fillStyle = `rgba(4,4,10,${Math.min(1, a).toFixed(3)})`;
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (a > 0.7) {
      font.center(ctx, 'DURMIENDO...', cv.width / 2, cv.height / 2 - 8, 3,
        '#c9b184', 'rgba(0,0,0,.8)', 2);
    }
  }
  if (state.gameOver) drawGameOver();
}

// ---------------------------------------------------------------- HUD (canvas)
function drawHUD() {
  const F = font, A = atlas;
  // ---- top-left status panel
  const pw = 232, px = 16, py = 16;
  let panelH = 112;
  // measure first so the wooden frame hugs the visible rows
  let rowsN = 2;
  if (state.food / state.maxFood < 0.75) rowsN++;
  if (state.warm / 100 < 0.75) rowsN++;
  if (state.heat / 100 > 0.25) rowsN++;
  panelH = 46 + rowsN * 12 + 18;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(px + 3, py + 4, pw, panelH);
  nineSlice(ctx, A, 'ui_panel', px, py, pw, panelH, 3, 1);
  const hh = Math.floor(state.time), mm = Math.floor((state.time % 1) * 60);
  const clock = `DIA ${state.day}  ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  F.drawShadow(ctx, clock, px + 13, py + 12, 2, '#f7e6b0', 'rgba(0,0,0,.75)');
  const snw = F.width(season.n, 1, 1);
  F.drawShadow(ctx, season.n, px + pw - 13 - snw, py + 16, 1, '#cbb98e', 'rgba(0,0,0,.7)', 1, 1);
  const bio = BIOME_INFO[world.biomeAt(Math.floor(player.x / TS), Math.floor(player.y / TS))].name;
  F.drawShadow(ctx, bio.toUpperCase(), px + 13, py + 31, 2, '#9fc48a', 'rgba(0,0,0,.7)', 1, 2);
  // ---- vital bars. Health and stamina are always shown; hunger, cold and
  // heat only appear once they actually matter, so the HUD stays quiet.
  const bx = px + 13, bw = pw - 26;
  const rows = [];
  rows.push({ f: state.hp / state.maxHp, a: '#a02c2c', b: '#e05a4a', l: 'VIDA',
              warn: state.hp / state.maxHp < 0.3 });
  rows.push({ f: state.stamina / state.maxStamina, a: '#5d9440', b: '#c2d86a',
              l: 'VIGOR', warn: state.stamina / state.maxStamina < 0.25 });
  const fdF = state.food / state.maxFood;
  if (fdF < 0.75) rows.push({ f: fdF, a: '#8a5a1e', b: '#dba24a', l: 'HAMBRE', warn: fdF < 0.25 });
  const wmF = state.warm / 100;
  if (wmF < 0.75) rows.push({ f: wmF, a: '#2a6a94', b: '#6fc0e0', l: 'FRIO', warn: wmF < 0.25 });
  const htF = state.heat / 100;
  if (htF > 0.25) rows.push({ f: htF, a: '#8a3a12', b: '#e8873a', l: 'CALOR', warn: htF > 0.75 });

  let byy = py + 46;
  for (const r of rows) {
    nineSlice(ctx, A, 'ui_bar', bx, byy, bw, 10, 3, 1);
    const fw2 = Math.max(0, Math.round((bw - 4) * Math.max(0, Math.min(1, r.f))));
    const pulse = r.warn ? (0.68 + 0.32 * Math.sin(performance.now() / 150)) : 1;
    const gr = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    gr.addColorStop(0, r.a); gr.addColorStop(1, r.b);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = gr;
    ctx.fillRect(bx + 2, byy + 3, fw2, 5);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(bx + 2, byy + 3, fw2, 1);
    ctx.globalAlpha = 1;
    F.draw(ctx, r.l, bx + 3, byy + 2, 1, 'rgba(255,255,255,.62)', 2);
    byy += 12;
  }
  F.drawShadow(ctx, `${(state.distance / TS / 10).toFixed(1)} KM`,
    px + 13, byy + 2, 1, '#9a8f78', 'rgba(0,0,0,.7)', 1, 2);
  panelH = byy + 16 - py;

  // ---- objectives panel (top right, under the key hints)
  if (state.prog) {
    const qs = state.prog.active;
    const qw = 226;
    const qh = 34 + qs.length * 26;
    const qx = cv.width - qw - 16, qy = 16;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(qx + 3, qy + 4, qw, qh);
    nineSlice(ctx, A, 'ui_panel', qx, qy, qw, qh, 3, 1);
    // level + xp bar in the header
    F.drawShadow(ctx, `NIVEL ${state.prog.level}`, qx + 10, qy + 8, 2,
      '#f7e6b0', 'rgba(0,0,0,.75)');
    const xbw = 92, xbx = qx + qw - xbw - 10, xby = qy + 10;
    nineSlice(ctx, A, 'ui_bar', xbx, xby, xbw, 9, 3, 1);
    ctx.fillStyle = '#7a5ec4';
    ctx.fillRect(xbx + 2, xby + 3, Math.round((xbw - 4) * state.prog.frac), 4);
    ctx.fillStyle = 'rgba(255,255,255,.28)';
    ctx.fillRect(xbx + 2, xby + 3, Math.round((xbw - 4) * state.prog.frac), 1);
    let qyy = qy + 28;
    for (const q of qs) {
      const pr = state.prog.progressOf(q);
      F.draw(ctx, q.n, qx + 10, qyy, 1, pr >= 1 ? '#8fd48a' : '#e0d0a6', 2);
      const tx3 = state.prog.textOf(q);
      const tw3 = F.width(tx3, 1, 2);
      F.draw(ctx, tx3, qx + qw - tw3 - 10, qyy, 1, '#9a8f78', 2);
      // thin progress line
      const lw = qw - 20;
      ctx.fillStyle = '#241c2a';
      ctx.fillRect(qx + 10, qyy + 10, lw, 3);
      ctx.fillStyle = pr >= 1 ? '#6fae5f' : '#c9a227';
      ctx.fillRect(qx + 10, qyy + 10, Math.round(lw * pr), 3);
      F.draw(ctx, q.d.toUpperCase(), qx + 10, qyy + 15, 1, '#7d7460', 2);
      qyy += 26;
    }
  }

  // ---- inventory slots, bottom centre
  const entries = Object.entries(state.items).filter(([, v]) => v > 0);
  if (entries.length) {
    const SS = 44, gap = 6;
    const totalW = entries.length * SS + (entries.length - 1) * gap;
    let ix = Math.round(cv.width / 2 - totalW / 2);
    const iy = cv.height - SS - 16;
    for (const [k, v] of entries) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(ix + 2, iy + 3, SS, SS);
      nineSlice(ctx, A, 'ui_slot_idle', ix, iy, SS, SS, 3, 1);
      const f = A.idx['item_' + k];
      if (f) {
        const isz = 32;
        ctx.drawImage(A.img, f[0], f[1], f[2], f[3],
          ix + (SS - isz) / 2, iy + (SS - isz) / 2 - 2, isz, isz);
      }
      const cnt = String(v);
      const cw2 = F.width(cnt, 2, 1);
      ctx.fillStyle = 'rgba(14,10,18,.9)';
      ctx.fillRect(ix + SS - cw2 - 7, iy + SS - 15, cw2 + 5, 13);
      F.draw(ctx, cnt, ix + SS - cw2 - 4, iy + SS - 13, 2, '#f7e6b0', 1);
      ix += SS + gap;
    }
  }

  // ---- compact key legend, under the objectives panel
  {
    const kx = cv.width - 226 - 16;
    let ky = 16 + (state.prog ? 34 + state.prog.active.length * 26 : 0) + 8;
    const pairs = [['E', 'usar'], ['Q', 'comer'], ['C', 'taller'],
                   ['M', 'mapa'], [state.gear.spear ? 'F' : 'L', state.gear.spear ? 'atacar' : 'farol']];
    let kxx = kx;
    for (const [k, lbl] of pairs) {
      const kw = F.width(k, 1, 2) + 8;
      nineSlice(ctx, A, 'ui_btn_idle', kxx, ky, kw, 14, 3, 1);
      F.draw(ctx, k, kxx + 4, ky + 4, 1, '#f0dcae', 2);
      kxx += kw + 3;
      F.draw(ctx, lbl, kxx, ky + 4, 1, '#8d8371', 2);
      kxx += F.width(lbl, 1, 2) + 9;
      if (kxx > kx + 200) { kxx = kx; ky += 17; }
    }
  }

  // ---- pouch: crafted consumables with their hotkey
  const pouchItems = [
    ['ration', 'berry', 'Q'], ['poultice', 'mushroom', 'R'], ['campfire', 'wood', 'G'],
  ].filter(([k]) => (state.pouch[k] || 0) > 0);
  if (pouchItems.length) {
    const SS = 34, gap = 5;
    const tot = pouchItems.length * SS + (pouchItems.length - 1) * gap;
    let ix2 = Math.round(cv.width / 2 - tot / 2);
    const iy2 = cv.height - 44 - SS - 12;
    for (const [k, icon, key] of pouchItems) {
      nineSlice(ctx, A, 'ui_slot_idle', ix2, iy2, SS, SS, 3, 1);
      const f = A.idx['item_' + icon];
      if (f) ctx.drawImage(A.img, f[0], f[1], f[2], f[3], ix2 + 7, iy2 + 5, 20, 20);
      const n = String(state.pouch[k]);
      const nw = F.width(n, 1, 1);
      F.draw(ctx, n, ix2 + SS - nw - 4, iy2 + SS - 10, 1, '#f7e6b0', 2);
      F.draw(ctx, key, ix2 + 3, iy2 + 2, 1, '#f0c85a', 2);
      ix2 += SS + gap;
    }
  }

  // ---- currently selected placeable
  {
    const own = PLACE_ORDER.filter(k => (state.pouch[k] || 0) > 0);
    if (own.length) {
      const key = own.includes(state.placeSel) ? state.placeSel : own[0];
      const def = PLACEABLES[key];
      const lbl = `${def.n} x${state.pouch[key]}`;
      const lw = F.width(lbl, 1, 2) + 44;
      const bxp = 18, byp = cv.height - 66;
      nineSlice(ctx, A, 'ui_panel', bxp, byp, lw, 20, 3, 1);
      F.draw(ctx, 'G', bxp + 5, byp + 6, 1, '#f0c85a', 2);
      F.draw(ctx, lbl, bxp + 16, byp + 6, 1, '#e0d0a6', 2);
      if (own.length > 1) F.draw(ctx, '[H]', bxp + lw - 22, byp + 6, 1, '#8d8371', 2);
    }
  }

  // ---- equipment pips (small, bottom-left, only what you own)
  const gearList = [
    ['torch', 'ANT'], ['pack', 'MOR'], ['boots', 'BOT'],
    ['thermal', 'MAN'], ['spear', 'LAN'], ['charm', 'AMU'],
  ].filter(([k]) => state.gear[k]);
  if (gearList.length) {
    let gx = 18;
    const gy = cv.height - 26;
    F.draw(ctx, 'EQUIPO', gx, gy - 12, 1, '#7d7460', 2);
    for (const [, lbl] of gearList) {
      const lw = F.width(lbl, 1, 2) + 8;
      nineSlice(ctx, A, 'ui_btn_idle', gx, gy, lw, 14, 3, 1);
      F.draw(ctx, lbl, gx + 4, gy + 4, 1, '#d8c9a2', 2);
      gx += lw + 4;
    }
  }

  // ---- interaction prompt
  if (state.lookedAt) {
    const t = state.lookedAt.type;
    const L = { berry: 'RECOGER BAYAS', mushroom: 'RECOGER HONGO', wood: 'TALAR MADERA',
      stone: 'PICAR PIEDRA', flower: 'CORTAR FLOR', ore: 'EXTRAER MINERAL',
      chest: 'ABRIR COFRE', shrine: 'TOCAR SANTUARIO', campfire: 'DESCANSAR',
      bed: 'DORMIR', door: 'ABRIR / CERRAR' }[t];
    const ik = { berry: 'berry', mushroom: 'mushroom', wood: 'wood', stone: 'stone',
      flower: 'flower', ore: 'ore', chest: 'relic' }[t];
    const tw = F.width(L, 2, 2);
    const bwid = tw + 84 + (ik ? 26 : 0);
    const bxp = Math.round(cv.width / 2 - bwid / 2);
    const byp = cv.height - 116;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(bxp + 3, byp + 4, bwid, 32);
    nineSlice(ctx, A, 'ui_panel', bxp, byp, bwid, 32, 3, 1);
    let tx2 = bxp + 10;
    if (ik && A.idx['item_' + ik]) {
      const f = A.idx['item_' + ik];
      ctx.drawImage(A.img, f[0], f[1], f[2], f[3], tx2, byp + 6, 20, 20);
      tx2 += 26;
    }
    const kw2 = F.width('E', 2, 1) + 12;
    nineSlice(ctx, A, 'ui_btn_hover', tx2, byp + 6, kw2, 20, 3, 1);
    F.draw(ctx, 'E', tx2 + 6, byp + 10, 2, '#fff4d2', 1);
    tx2 += kw2 + 10;
    F.drawShadow(ctx, L, tx2, byp + 10, 2, '#f2e2b4', 'rgba(0,0,0,.7)', 1, 2);
  }

  // ---- quest / level-up toasts
  if (state.prog && state.prog.pending.length && toastT <= 0) {
    const t0 = state.prog.pending.shift();
    if (t0.type === 'level') audio.levelUp(); else audio.quest();
    if (t0.type === 'level') {
      state.maxStamina += 10;
      state.stamina = state.maxStamina;
    }
    toast = t0; toastT = 2.8;
  }
  if (toastT > 0) {
    toastT -= 1 / 60;
    const a = Math.min(1, toastT / 0.5) * Math.min(1, (2.8 - toastT) / 0.3);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const tw4 = Math.max(F.width(toast.title, 3, 2), F.width(toast.sub, 2, 2)) + 44;
    const txp = Math.round(cv.width / 2 - tw4 / 2), typ = Math.round(cv.height * 0.30);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(txp + 4, typ + 5, tw4, 56);
    nineSlice(ctx, A, 'ui_panel', txp, typ, tw4, 56, 3, 1);
    const head = toast.type === 'level' ? 'SUBISTE DE NIVEL' : 'OBJETIVO COMPLETO';
    F.center(ctx, head, txp + tw4 / 2, typ + 7, 1,
      toast.type === 'level' ? '#c9a8ff' : '#8fd48a', 'rgba(0,0,0,.8)', 2);
    F.center(ctx, toast.title, txp + tw4 / 2, typ + 19, 3, '#f7e6b0', 'rgba(0,0,0,.8)', 2);
    F.center(ctx, toast.sub, txp + tw4 / 2, typ + 42, 1, '#c9bb9a', 'rgba(0,0,0,.8)', 2);
    ctx.globalAlpha = 1;
  }

  // ---- discovery banner
  if (noteT > 0) {
    noteT -= 1 / 60;
    const a = Math.min(1, noteT / 0.6) * Math.min(1, (3.4 - noteT) / 0.35);
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    const cxx = cv.width / 2, ny = cv.height * 0.17;
    F.center(ctx, noteTitle.toUpperCase(), cxx, ny, 3, '#f7e6b0', 'rgba(0,0,0,.85)', 2);
    if (noteSub) F.center(ctx, noteSub, cxx, ny + 30, 2, '#b9c2d4', 'rgba(0,0,0,.85)', 2);
    ctx.globalAlpha = 1;
  }
}

function drawFireflies(camX, camY, vw, vh) {
  const t = performance.now() / 1000;
  const gx0 = Math.floor(camX / 96), gx1 = Math.floor((camX + vw) / 96);
  const gy0 = Math.floor(camY / 96), gy1 = Math.floor((camY + vh) / 96);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const h = hash2(gx, gy);
    if (h % 5 !== 0) continue;
    const b = world.biomeAt(Math.floor(gx * 96 / TS), Math.floor(gy * 96 / TS));
    if (b !== BIOME.FOREST && b !== BIOME.SWAMP && b !== BIOME.MEADOW) continue;
    for (let i = 0; i < 3; i++) {
      const s = (h + i * 977) % 1000 / 1000;
      const x = gx * 96 + 48 + Math.sin(t * .5 + s * 7) * 40;
      const y = gy * 96 + 48 + Math.cos(t * .42 + s * 11) * 34;
      const fr = Math.floor(t * 4 + s * 4) % 4;
      atlas.draw(ctx, `firefly_${fr}`, x - camX - 4, y - camY - 4);
    }
  }
}

// ------------------------------------------------------------------ minimap
const mapCv = document.createElement('canvas');
mapCv.width = 200; mapCv.height = 200;
const mapCtx = mapCv.getContext('2d');
let mapKey = '';
const BCOL = {
  0: '#12294a', 1: '#2b6ba0', 2: '#d8c48d', 3: '#6f9e4a', 4: '#5a8a3d',
  5: '#3a6130', 6: '#4a5738', 7: '#dcc98f', 8: '#74747f', 9: '#e2eaf4', 10: '#4a414a',
};
function drawMap() {
  const S = 2;                       // world tiles per map pixel
  const cxT = Math.floor(player.x / TS), cyT = Math.floor(player.y / TS);
  const key = `${(cxT / 4) | 0},${(cyT / 4) | 0}`;
  if (key !== mapKey) {
    mapKey = key;
    const im = mapCtx.createImageData(200, 200);
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const wx = cxT + (x - 100) * S, wy = cyT + (y - 100) * S;
      const b = world.biomeAt(wx, wy);
      const c = BCOL[b];
      // subtle relief shading so the map reads as terrain, not flat blobs
      const sh = (world.height(wx, wy) - world.height(wx - 2, wy - 2)) * 260;
      const i = (y * 200 + x) * 4;
      const cl = v => Math.max(0, Math.min(255, v));
      im.data[i]     = cl(parseInt(c.slice(1, 3), 16) + sh);
      im.data[i + 1] = cl(parseInt(c.slice(3, 5), 16) + sh);
      im.data[i + 2] = cl(parseInt(c.slice(5, 7), 16) + sh);
      im.data[i + 3] = 255;
    }
    mapCtx.putImageData(im, 0, 0);
  }
  const D = 208, X = cv.width - D - 20, Y = 116;
  ctx.save();
  // frame
  ctx.fillStyle = 'rgba(12,14,20,.88)';
  ctx.fillRect(X - 6, Y - 24, D + 12, D + 46);
  ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 2;
  ctx.strokeRect(X - 6, Y - 24, D + 12, D + 46);
  ctx.fillStyle = '#d8b45c'; ctx.font = '11px monospace';
  ctx.fillText('MAPA', X, Y - 9);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(mapCv, X, Y, D, D);
  // landmarks discovered
  for (const id of state.discovered) {
    // ids look like s<cx>,<cy>
    const m = /^s(-?\d+),(-?\d+)$/.exec(id);
    if (!m) continue;
    const wx = (+m[1]) * CH + CH / 2, wy = (+m[2]) * CH + CH / 2;
    const mx = X + D / 2 + (wx - cxT) / S * (D / 200);
    const my = Y + D / 2 + (wy - cyT) / S * (D / 200);
    if (mx < X || mx > X + D || my < Y || my > Y + D) continue;
    ctx.fillStyle = '#7fe4ff';
    ctx.fillRect(mx - 2, my - 2, 4, 4);
  }
  // player marker (pulsing)
  const pu = 2 + Math.sin(performance.now() / 260) * 0.8;
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(X + D / 2, Y + D / 2, 4 + pu, 0, 7); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(X + D / 2 - 2, Y + D / 2 - 2, 4, 4);
  ctx.fillStyle = '#e8c24a'; ctx.fillRect(X + D / 2 - 1, Y + D / 2 - 1, 2, 2);
  ctx.fillStyle = '#cfc6b0'; ctx.font = '10px monospace';
  ctx.fillText(`X ${cxT}  Y ${cyT}`, X, Y + D + 14);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b93a8';
  ctx.fillText(`${state.biomesSeen.size}/11 biomas`, X + D, Y + D + 14);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ------------------------------------------------------------------ HUD
// item icons are cut out of the atlas once and reused as CSS backgrounds
const iconURL = {};
function itemIcon(key) {
  if (iconURL[key]) return iconURL[key];
  const f = atlas.idx['item_' + key];
  if (!f) return '';
  const c = document.createElement('canvas');
  c.width = f[2]; c.height = f[3];
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(atlas.img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  return (iconURL[key] = c.toDataURL());
}

const ITEM_NAME = {
  berry: 'Bayas', wood: 'Madera', stone: 'Piedra', mushroom: 'Hongos',
  ore: 'Mineral', crystal: 'Cristal', relic: 'Reliquia', flower: 'Flores',
};

function updateHUD() { /* HUD is drawn on canvas in drawHUD() */ }

function drawTitle(dt, backdropOnly) {
  const w = cv.width, h = cv.height;
  if (!atlas || !title) {
    ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, w, h); return;
  }
  // slow orbital pan over a real generated forest
  bgAng += dt * 0.045;
  const BZ = 3;
  const vw = Math.ceil(w / BZ), vh = Math.ceil(h / BZ);
  const camX = Math.round(bgCam.x + Math.cos(bgAng) * 120 - vw / 2);
  const camY = Math.round(bgCam.y + Math.sin(bgAng * 0.8) * 90 - vh / 2);
  ctx.save();
  ctx.scale(BZ, BZ);
  ctx.fillStyle = '#0d1520'; ctx.fillRect(0, 0, vw, vh);
  const wframe = Math.floor(performance.now() / 190) % 6;
  const fframe = Math.floor(performance.now() / 230) % 4;
  const c0 = Math.floor(camX / (CH * TS)), c1 = Math.floor((camX + vw) / (CH * TS));
  const r0 = Math.floor(camY / (CH * TS)), r1 = Math.floor((camY + vh) / (CH * TS));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
    ctx.drawImage(bgGround.get(cx, cy, wframe, fframe),
      cx * CH * TS - camX, cy * CH * TS - camY);
  }
  const ds = [];
  for (let cy = r0 - 1; cy <= r1 + 1; cy++) for (let cx = c0 - 1; cx <= c1 + 1; cx++) {
    for (const p of bgWorld.chunk(cx, cy).props) {
      let n = p.s;
      if (p.anim) n = p.s.replace(/_\d+$/, '_' + (Math.floor(performance.now() / 130) % p.anim));
      const [pw, ph] = atlas.size(n);
      const x = p.x - pw / 2, y = p.y - ph + 4;
      if (x > camX + vw + 40 || x + pw < camX - 40) continue;
      if (y > camY + vh + 40 || y + ph < camY - 60) continue;
      ds.push({ y: p.y, n, x: x - camX, yy: y - camY });
    }
  }
  ds.sort((a, b) => a.y - b.y);
  for (const d of ds) atlas.draw(ctx, d.n, d.x, d.yy);
  ctx.restore();

  // dusk lighting so the backdrop stays subdued behind the text
  light.resize(w, h);
  const lm = light.render('rgb(120,110,150)', [], camX, camY, BZ);
  ctx.globalCompositeOperation = 'multiply';
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lm, 0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';

  if (!backdropOnly) title.draw(ctx, w, h, dt);
}

function drawGameOver() {
  state.goT += 1 / 60;
  const a = Math.min(1, state.goT / 1.2);
  ctx.fillStyle = `rgba(10,4,6,${(a * .86).toFixed(3)})`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  const cx = cv.width / 2;
  font.center(ctx, 'HAS CAIDO', cx, cv.height * 0.30, 5, '#c04040', 'rgba(0,0,0,.9)', 2);
  const lines = [
    ['DIAS SOBREVIVIDOS', String(state.day)],
    ['DISTANCIA', (state.distance / TS / 10).toFixed(1) + ' KM'],
    ['BIOMAS', state.biomesSeen.size + ' / 11'],
    ['NIVEL', String(state.prog.level)],
    ['OBJETIVOS', state.prog.done.size + ' / ' + QUEST_DEFS.length],
  ];
  const pw = 340, ph = 40 + lines.length * 18;
  const px = cx - pw / 2, py = cv.height * 0.42;
  nineSlice(ctx, atlas, 'ui_panel', px, py, pw, ph, 3, 1);
  let ly = py + 16;
  for (const [k, v] of lines) {
    font.draw(ctx, k, px + 22, ly, 1, '#a99a76', 2);
    const vw = font.width(v, 2, 1);
    font.draw(ctx, v, px + pw - 22 - vw, ly - 3, 2, '#e8d9ae', 1);
    ly += 18;
  }
  if (state.goT > 1.4) {
    const blink = (state.goT * 2 | 0) % 2 === 0;
    font.center(ctx, blink ? 'PULSA ENTER PARA VOLVER' : '', cx,
      py + ph + 26, 2, '#f0c85a', 'rgba(0,0,0,.8)', 2);
  }
}

// ---------------------------------------------------------------- pause
let pauseBtns = [];
function buildPauseButtons() {
  pauseBtns = [
    new Button('CONTINUAR', 0, 0, 260, 40, () => { paused = false; }, { scale: 2 }),
    new Button('VOLVER AL TITULO', 0, 0, 260, 40, () => {
      paused = false; started = false; scene = 'title';
      autoSave(); refreshTitleMeta();
    }, { scale: 2 }),
  ];
}

function drawPause() {
  const w = cv.width, h = cv.height;
  ctx.fillStyle = 'rgba(8,7,14,.78)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const pw = 360, ph = 306;
  const px = cx - pw / 2, py = h / 2 - ph / 2;
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(px + 5, py + 6, pw, ph);
  nineSlice(ctx, atlas, 'ui_panel', px, py, pw, ph, 3, 1);
  font.center(ctx, 'PAUSA', cx, py + 22, 4, '#f7e6b0', 'rgba(0,0,0,.75)', 2);
  ctx.fillStyle = '#8a6b45';
  ctx.fillRect(px + 28, py + 60, pw - 56, 2);
  // run stats
  const who = (state.look && state.look.name ? state.look.name : 'VAGABUNDO').toUpperCase();
  font.center(ctx, who + '  -  ' + (state.cls ? state.cls.n : ''),
    cx, py + 62, 1, '#c9b184', 'rgba(0,0,0,.7)', 2);
  const lines = [
    ['NIVEL', String(state.prog.level)],
    ['EXPERIENCIA', `${state.prog.xp}/${state.prog.need}`],
    ['DIA', String(state.day)],
    ['DISTANCIA', (state.distance / TS / 10).toFixed(1) + ' KM'],
    ['BIOMAS', state.biomesSeen.size + ' / 11'],
    ['OBJETIVOS', state.prog.done.size + ' / ' + QUEST_DEFS.length],
  ];
  let ly = py + 78;
  for (const [k, v] of lines) {
    font.draw(ctx, k, px + 30, ly, 1, '#a99a76', 2);
    const vw2 = font.width(v, 2, 1);
    font.draw(ctx, v, px + pw - 30 - vw2, ly - 3, 2, '#e8d9ae', 1);
    ly += 17;
  }
  let by = py + 194;
  for (const b of pauseBtns) {
    b.x = cx - b.w / 2; b.y = by; by += b.h + 12;
    b.draw(ctx, atlas, font, performance.now());
  }
}

// debug hooks (screenshot tooling)
window.__setTime = t => { state.time = t; };
window.__tp = (tx, ty) => { player.x = tx * TS + 8; player.y = ty * TS + 8; cam.x = player.x; cam.y = player.y; };
window.__state = state;
window.__audio = audio;
window.__world = () => world;
window.__player = () => player;
window.__autosave = () => autoSave();
window.__craftSel = i => { craftPanel.sel = i; };
window.__interact = () => interact();
window.__creatorDbg = () => creator ? { hits: creator._hits, look: creator.look, auto: creator.autoRotate } : null;
window.__findBiome = (b, maxR = 700) => {
  const t0 = [Math.floor(player.x / TS), Math.floor(player.y / TS)];
  for (let r = 4; r < maxR; r += 4)
    for (let a = 0; a < 32; a++) {
      const th = a / 32 * Math.PI * 2;
      const x = t0[0] + Math.cos(th) * r | 0, y = t0[1] + Math.sin(th) * r | 0;
      if (world.biomeAt(x, y) === b) { window.__tp(x, y); return [x, y]; }
    }
  return null;
};

boot();
requestAnimationFrame(frame);

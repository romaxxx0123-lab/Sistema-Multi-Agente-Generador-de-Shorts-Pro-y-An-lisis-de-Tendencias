// Verificación automática del motor de audio (sin oídos): niveles, clipping, errores y crecimiento de nodos.
import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = await esbuild.build({ entryPoints: [path.join(ROOT, 'src/audio/audio.js')], bundle: true, format: 'iife', globalName: 'CNAudio', write: false, logLevel: 'warning' });
const js = res.outputFiles[0].text;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
await page.setContent('<html><body><script>' + js.replace(/<\/script/g, '<\\/script') + '</script></body></html>');
const radioSecs = Number(process.env.RADIO_SECS || 5);
const out = await page.evaluate(async (radioSecs) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Contador de fuentes activas
  let live = 0, created = 0;
  const P = AudioContext.prototype;
  for (const fn of ['createOscillator', 'createBufferSource']) {
    const orig = P[fn];
    P[fn] = function (...a) {
      const n = orig.apply(this, a);
      live++;
      created++;
      n.addEventListener('ended', () => live--);
      return n;
    };
  }
  const A = new CNAudio.AudioSystem();
  A.init();
  for (let i = 0; i < 40 && !A.ready; i++) await sleep(50);
  const report = { ready: A.ready, sfx: {}, engines: {}, radio: [], liveAfterSfx: 0 };
  const watch = async (ms) => {
    let peak = 0, rms = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const m = A.meter();
      peak = Math.max(peak, m.peak);
      rms = Math.max(rms, m.rms);
      await sleep(20);
    }
    return { peak: +peak.toFixed(3), rms: +rms.toFixed(3) };
  };
  A.setListener({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 });
  for (const name of CNAudio.SFX_NAMES) {
    A.play(name);
    report.sfx[name] = await watch(name.startsWith('mission') || name === 'wasted' || name === 'explosion' ? 900 : 260);
  }
  // Posicionales cerca y lejos
  A.play('pistol', { pos: { x: 10, y: 0, z: 0 } });
  report.sfx.pistol_near = await watch(250);
  A.play('pistol', { pos: { x: 200, y: 0, z: 0 } });
  report.sfx.pistol_far = await watch(250);
  for (const type of ['car', 'sports', 'truck', 'bike', 'boat', 'heli']) {
    const e = A.createEngine(type);
    let peak = 0;
    for (let i = 0; i < 40; i++) {
      e.update({ rpm: i / 40, throttle: 1, pos: { x: 3, y: 0, z: 0 } });
      await sleep(25);
      peak = Math.max(peak, A.meter().peak);
    }
    e.stop();
    report.engines[type] = +peak.toFixed(3);
    await sleep(200);
  }
  const s = A.createSiren();
  for (let i = 0; i < 20; i++) { s.update({ pos: { x: 5, y: 0, z: 0 }, mode: i < 10 ? 'wail' : 'yelp' }); await sleep(30); }
  report.siren = await watch(300);
  s.stop();
  for (const name of ['skid', 'fire', 'horn', 'alarm', 'wake', 'wind']) {
    const l = A.createLoop(name);
    l.update({ pos: { x: 2, y: 0, z: 0 }, volume: 1 });
    report.engines['loop_' + name] = (await watch(250)).peak;
    l.stop();
  }
  A.setAmbience({ city: 1, ocean: 1, rain: 1, wind: 1, night: 0 });
  for (let i = 0; i < 40; i++) { A.update(0.1); await sleep(25); }
  report.ambience = await watch(800);
  A.setAmbience({ city: 0, ocean: 0, rain: 0, wind: 0 });
  A.thunder(0.1);
  report.thunder = await watch(2500);
  await sleep(1500);
  report.liveAfterSfx = live;
  const tracks = [];
  A.radio.onTrack = (i) => tracks.push(i.station.name + ' — ' + i.title + ' / ' + i.artist);
  A.radio._forceBar = 12;
  for (let i = 0; i < A.radio.stations.length; i++) {
    A.radio.play(i);
    const m = await watch(radioSecs * 1000);
    report.radio.push({ station: A.radio.stations[i].name, ...m, live });
  }
  // Prueba larga en una estación para detectar crecimiento de nodos
  A.radio._forceBar = null;
  A.radio.play(-1);
  A.radio.play(0);
  const longSecs = Number(radioSecs) * 6;
  const samples = [];
  for (let k = 0; k < 6; k++) { await sleep(longSecs * 1000 / 6); samples.push(live); }
  report.liveSamples = samples;
  report.tracks = tracks;
  report.created = created;
  A.radio.stop();
  return report;
}, radioSecs);
console.log(JSON.stringify(out, null, 1));
const bad = [];
for (const [k, v] of Object.entries(out.sfx)) {
  if (k === 'pistol_far') continue;
  if (v.peak < 0.005) bad.push('silencio: ' + k);
  if (v.peak >= 0.999) bad.push('clipping: ' + k);
}
for (const r of out.radio) {
  if (r.rms < 0.005) bad.push('radio en silencio: ' + r.station);
  if (r.peak >= 0.999) bad.push('radio clipping: ' + r.station);
}
for (const [k, v] of Object.entries(out.engines)) if (v < 0.003) bad.push('silencio: ' + k);
const ls = out.liveSamples;
if (ls[ls.length - 1] > 600) bad.push('demasiados nodos activos: ' + ls.join(','));
console.log('ERRORES:', errors.length ? errors.slice(0, 20) : 'ninguno');
console.log('PROBLEMAS:', bad.length ? bad : 'ninguno');
await browser.close();
process.exit(bad.length || errors.length ? 1 : 0);

// Punto de entrada de Costa Neón.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { createWorld } from './world/map.js';
import { CollisionWorld } from './world/collision.js';
import { generateGroundTextures, generateDetailTextures } from './world/textures.js';
import { MaterialLib } from './world/materials.js';
import { Sky } from './world/sky.js';
import { CityRenderer } from './world/city.js';
import { Ocean } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { StreetProps } from './world/props.js';
import { Landmarks } from './world/landmarks.js';
import { WeatherFX } from './world/weather.js';
import { PlanarReflection } from './world/reflection.js';
import { ChunkedInstances } from './world/instancing.js';
import { U } from './world/shaders.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function setProgress(p, text) {
  const f = document.getElementById('loading-fill');
  const t = document.getElementById('loading-text');
  if (f) f.style.width = Math.round(p * 100) + '%';
  if (t && text) t.textContent = text;
}

function pickQuality() {
  try {
    const q = new URLSearchParams(location.search).get('q');
    if (q) return q;
  } catch (e) { /* sin query */ }
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && matchMedia('(pointer: coarse)').matches);
  return mobile ? 'bajo' : 'alto';
}

async function boot() {
  const canvas = document.getElementById('view');
  const engine = new Engine(canvas);
  // Activa USE_FOG en los materiales; los shaders usan su propia niebla de altura.
  engine.scene.fog = new THREE.FogExp2(0x000000, 0.001);
  engine.onQualityChange((q) => { ChunkedInstances.distScale = 0.45 + 0.55 * q.density; });
  engine.setQuality(pickQuality());
  setProgress(0.08, 'Generando texturas…');
  await nextFrame();
  const ground = generateGroundTextures(engine.renderer, engine.q.texSize);
  const detail = generateDetailTextures(engine.renderer, 512);
  const lib = new MaterialLib(engine.renderer, ground, detail);
  engine.setMaterialLib(lib);
  setProgress(0.2, 'Trazando calles de Puerto Índigo…');
  await nextFrame();
  const world = createWorld();
  const collision = new CollisionWorld(world);
  setProgress(0.32, 'Encendiendo el cielo…');
  await nextFrame();
  const sky = new Sky(engine);
  setProgress(0.45, 'Levantando edificios…');
  await nextFrame();
  const city = new CityRenderer(engine, world, lib);
  setProgress(0.6, 'Llenando el mar…');
  await nextFrame();
  const ocean = new Ocean(engine, lib);
  setProgress(0.7, 'Plantando palmeras…');
  await nextFrame();
  const vegetation = new Vegetation(engine, world, lib);
  setProgress(0.8, 'Instalando faroles y semáforos…');
  await nextFrame();
  const props = new StreetProps(engine, world, lib);
  const landmarks = new Landmarks(engine, world, lib);
  const weather = new WeatherFX(engine, engine.q.density >= 1 ? 6000 : 3000);
  sky.on((ev) => { if (ev.type === 'lightning') weather.strike(engine.camera, ev.distance); });
  const reflection = new PlanarReflection(engine, 0.5);
  reflection.exclude(...city.flat, ocean.mesh, weather.rain, props.instGroups.lampCones);
  engine.reflection = reflection;
  setProgress(0.92, 'Compilando shaders…');
  await nextFrame();

  const cam = engine.camera;
  cam.position.set(-60, 60, 140);
  cam.lookAt(0, 20, 0);
  const state = { t: 0, orbit: true };

  const G = { engine, world, collision, sky, city, ocean, vegetation, props, landmarks, weather, lib, state, U };
  window.__cn = {
    G,
    setCam(x, y, z, tx, ty, tz) {
      state.orbit = false;
      cam.position.set(x, y, z);
      cam.lookAt(tx, ty, tz);
    },
    setTime: (h) => sky.setTime(h),
    setWeather: (id) => sky.setWeather(id, true),
    info: () => ({ ...(engine.stats || {}), programs: engine.renderer.info.programs.length, frameMs: Math.round(state.frameMs || 0) }),
  };

  let last = performance.now();
  function frame(now) {
    state.frameMs = now - last;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    state.t += dt;
    U.uTime.value = state.t;
    if (state.orbit) {
      const a = state.t * 0.05;
      cam.position.set(Math.cos(a) * 180, 70, Math.sin(a) * 180);
      cam.lookAt(0, 25, 0);
    }
    sky.update(dt);
    engine.setMainLight(sky.light.dir, sky.light.color, sky.light.intensity);
    sky.follow(cam);
    ocean.update(cam, sky.w.wind);
    props.update(dt, state.t, sky.nightK, U.uLamps.value, cam.position);
    vegetation.update(cam.position);
    landmarks.update(dt, state.t, sky.nightK);
    weather.update(dt, cam, sky);
    const p = cam.position;
    const nearWater = (p.x > 380 || p.z > 400 || p.z < -400 || p.x < -420) && p.y < 160;
    reflection.enabled = !!engine.q.reflections;
    reflection.wanted = U.uWet.value > 0.12 || nearWater;
    engine.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setProgress(1, 'Listo');
  setTimeout(() => document.getElementById('loading').classList.add('hide'), 300);
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('loading-text');
  if (t) {
    t.classList.add('loading-error');
    t.textContent = 'No se pudo iniciar el juego: ' + (e && e.message ? e.message : e) + '. Probá con otro navegador o actualizá los controladores de video.';
  }
});

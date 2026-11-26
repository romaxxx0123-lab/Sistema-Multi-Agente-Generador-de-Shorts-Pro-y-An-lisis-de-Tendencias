// Punto de entrada de Costa Neón: carga del mundo y arranque del juego.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { createWorld } from './world/map.js';
import { CollisionWorld } from './world/collision.js';
import { generateGroundTextures, generateDetailTextures, loadScannedTextures } from './world/textures.js';
import { MaterialLib } from './world/materials.js';
import { Sky } from './world/sky.js';
import { HdriSky } from './world/hdriSky.js';
import { CityRenderer } from './world/city.js';
import { Ocean } from './world/water.js';
import { Vegetation, loadFoliageTextures } from './world/vegetation.js';
import { StreetProps } from './world/props.js';
import { Landmarks } from './world/landmarks.js';
import { WeatherFX } from './world/weather.js';
import { PlanarReflection } from './world/reflection.js';
import { ChunkedInstances } from './world/instancing.js';
import { U } from './world/shaders.js';
import { setProbeVisible } from './core/layers.js';
import { Game } from './game/game.js';
import { loadCarAssets } from './entities/carAssets.js';

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
  setProgress(0.06, 'Cargando superficies escaneadas…');
  await nextFrame();
  let noScan = false;
  try { noScan = new URLSearchParams(location.search).has('noscan'); } catch (e) { /* sin query */ }
  const scanned = noScan ? null : await loadScannedTextures();
  const ground = generateGroundTextures(engine.renderer, engine.q.texSize, scanned);
  const detail = generateDetailTextures(engine.renderer, scanned ? Math.max(512, engine.q.texSize) : 512, scanned);
  const lib = new MaterialLib(engine.renderer, ground, detail);
  engine.setMaterialLib(lib);
  setProgress(0.18, 'Trazando calles de Puerto Índigo…');
  await nextFrame();
  const world = createWorld();
  const collision = new CollisionWorld(world);
  setProgress(0.3, 'Encendiendo el cielo…');
  await nextFrame();
  const sky = new Sky(engine);
  setProgress(0.34, 'Fotografiando el cielo…');
  const hdri = new HdriSky(engine.renderer);
  let noHdri = false;
  try { noHdri = new URLSearchParams(location.search).has('nohdri'); } catch (e) { /* sin query */ }
  if (!noHdri && await hdri.load()) sky.setHdri(hdri);
  setProgress(0.42, 'Levantando edificios…');
  await nextFrame();
  const city = new CityRenderer(engine, world, lib);
  setProgress(0.56, 'Llenando el mar…');
  await nextFrame();
  const ocean = new Ocean(engine, lib);
  setProgress(0.66, 'Plantando palmeras…');
  await nextFrame();
  const foliage = noScan ? null : await loadFoliageTextures();
  const vegetation = new Vegetation(engine, world, lib, foliage);
  setProgress(0.76, 'Instalando faroles y semáforos…');
  await nextFrame();
  const props = new StreetProps(engine, world, lib);
  const landmarks = new Landmarks(engine, world, lib);
  const weather = new WeatherFX(engine, engine.q.density >= 1 ? 6000 : 3000);
  sky.on((ev) => { if (ev.type === 'lightning') weather.strike(engine.camera, ev.distance); });
  // Lo que refleja la sonda de los autos: edificios, calles, mar, hitos y cielo
  setProbeVisible(city.group);
  setProbeVisible(ocean.mesh);
  setProbeVisible(landmarks.group);
  setProbeVisible(sky.dome);
  setProbeVisible(vegetation.group);
  const reflection = new PlanarReflection(engine, 0.5);
  reflection.exclude(...city.flat, ocean.mesh, weather.rain, ...(props.instGroups.lampCones ? props.instGroups.lampCones.meshes : []));
  engine.reflection = reflection;
  setProgress(0.84, 'Trayendo los autos del taller…');
  await nextFrame();
  await loadCarAssets();
  setProgress(0.88, 'Despertando a los vecinos…');
  await nextFrame();
  const game = new Game({ engine, world, collision, sky, city, ocean, vegetation, props, landmarks, weather, reflection, lib });
  setProgress(0.95, 'Compilando shaders…');
  await nextFrame();
  game.start();

  // Ganchos para pruebas automatizadas
  window.__cn = {
    G: game,
    setCam(x, y, z, tx, ty, tz) {
      game.camRig.startCinematic(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y, z), new THREE.Vector3(tx, ty, tz), new THREE.Vector3(tx, ty, tz), 0.01);
      game.camRig.cine.d = 1e9;
    },
    freeCam() { game.camRig.stopCinematic(); },
    setTime: (h) => sky.setTime(h),
    setWeather: (id) => sky.setWeather(id, true),
    info: () => ({ ...(engine.stats || {}), programs: engine.renderer.info.programs.length, frameMs: Math.round(game.frameMs || 0) }),
    move(x, y, actions = []) {
      const v = game.input.virtual;
      v.active = true;
      v.move.x = x;
      v.move.y = y;
      v.actions = new Set(actions);
    },
    look(dx, dy) {
      game.input.virtual.active = true;
      game.input.virtual.look.x += dx;
      game.input.virtual.look.y += dy;
    },
    drive(throttle = 0, brake = 0, steer = 0, actions = []) {
      const v = game.input.virtual;
      v.active = true;
      v.throttle = throttle;
      v.brake = brake;
      v.steer = steer;
      v.actions = new Set(actions);
    },
    teleport(x, z, yaw = 0) { game.player.teleport(x, z, yaw); game.camRig.yaw = yaw; },
    probeAt(x, y, z) { game.probeOverride = x == null ? null : new THREE.Vector3(x, y, z); },
    spawnCar(id, dist = 6, opts = {}) {
      const p = game.player;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      return game.vehicles.spawn(id, p.pos.x + fx * dist, p.pos.z + fz * dist, opts.yaw ?? p.yaw + Math.PI / 2, opts);
    },
    vehicleInfo() {
      const v = game.player.vehicle;
      const p = game.player;
      return {
        inVehicle: !!v, model: v && v.modelId, speed: v ? +(v.speed * 3.6).toFixed(1) : 0, gear: v && v.gear,
        pos: [+p.pos.x.toFixed(1), +p.pos.y.toFixed(2), +p.pos.z.toFixed(1)], health: Math.round(p.health), dead: p.dead,
        knock: p.knock && p.knock.phase, vehicles: game.vehicles.list.length, traffic: game.traffic.cars.length,
        entering: !!game.enterState, exiting: !!game.exitState,
      };
    },
  };
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

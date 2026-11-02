/**
 * Pruebas del mundo visual (área render-world). El `Renderer` necesita WebGL, pero todas sus
 * piezas de cálculo (oleaje compartido CPU/GPU, perfil del casco, balanceo, atmósfera, malla del
 * océano, modelos, lluvia, avistamientos) funcionan en Node y se prueban aquí.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOW_LENGTH, bowStartX, hullHalfWidth, insideHull, sternX } from '../src/render/ship/hull';
import { antialiasFor, reloadNeededFor } from '../src/render/Renderer';
import { computeAtmosphere, createAtmosphere, moonPhase, regionColors, sunDirection, type Atmosphere } from '../src/render/world/atmosphere';
import { arrivalJustHappened, Celebration, fiestaLevel } from '../src/render/world/celebration';
import { createGlowShared, GlowPoints, glowGeometry, lightsLevel } from '../src/render/world/glow';
import {
  APPROACH_MILES,
  CHANNEL_HALF,
  CLUSTER_VARIANTS,
  DRIFT_PER_MILE,
  harborSlots,
  harborSpan,
  HarborView,
  MOOR_MIN_Z,
  PROMENADE_Z,
  segmentHitsBox,
  TOWER_BAND,
  TOWER_Z,
  towerVisibility,
  towerX,
} from '../src/render/world/harbor';
import { channelBuoyModel, greenTowerModel, harborBoatModel, houseboatClusterModel, promenadeModel, TOWER_LIGHT_Y, type HarborModel } from '../src/render/world/harborModels';
import { Kit } from '../src/render/world/kit';
import { Clouds } from '../src/render/world/clouds';
import { waterlineProfile } from '../src/render/world/hullProfile';
import { flashProfile, Lightning } from '../src/render/world/lightning';
import {
  bigIslandModel,
  icebergModel,
  islandModel,
  lighthouseModel,
  marketBargeModel,
  merchantModel,
  platformModel,
  raftModel,
  sailboatModel,
  seaStackModel,
  signalTowerModel,
  weatherStationModel,
  wreckModel,
} from '../src/render/world/models';
import { axisCoords, buildOceanGeometry, Ocean, OCEAN_GRID, withoutPointLights } from '../src/render/world/ocean';
import { Rain } from '../src/render/world/rain';
import { MAX_PITCH, MAX_ROLL, ShipMotion } from '../src/render/world/shipMotion';
import { MERCHANT_STATION_X, SightingsView } from '../src/render/world/sightings';
import { hullHalfWidthAt, WaveField } from '../src/render/world/waves';
import { REGIONS } from '../src/data/regions';
import { LEVEL_H } from '../src/sim/constants';
import { createNewGame } from '../src/sim/newGame';
import { computeLayout } from '../src/sim/ship';
import type { GameState, Sighting } from '../src/sim/types';

const deg = THREE.MathUtils.radToDeg;
const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

function hasNaN(g: THREE.BufferGeometry): boolean {
  const a = g.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) return true;
  return false;
}

/* ------------------------------------------------------------------ */

describe('oleaje compartido CPU/GPU', () => {
  it('heightAt invierte el desplazamiento horizontal de Gerstner', () => {
    const w = new WaveField();
    w.setSea(2.6, 1, 0.6);
    w.advance(3.7, 12, 2.6, 1, 0.6);
    const d = { x: 0, y: 0, z: 0 };
    for (const [gx, gz] of [
      [5, 30],
      [-60, 12],
      [80, -45],
      [140, 140],
      [-3, -90],
    ] as const) {
      w.displacement(gx, gz, d);
      expect(Math.abs(w.heightAt(gx + d.x, gz + d.z) - d.y)).toBeLessThan(0.02);
    }
  });

  it('la altura está acotada por la amplitud', () => {
    const w = new WaveField();
    w.wake.sf = 0;
    w.setSea(2.6, 1, 0);
    let max = 0;
    for (let i = 0; i < 400; i++) {
      w.advance(0.37, 0, 2.6, 1, 0);
      max = Math.max(max, Math.abs(w.heightAt((i * 7.3) % 120 - 60, (i * 3.1) % 80 - 40)));
    }
    expect(max).toBeGreaterThan(0.5);
    expect(max).toBeLessThanOrEqual(w.ampTotal + 1e-6);
  });

  it('el agua se desplaza hacia popa la distancia recorrida', () => {
    const w = new WaveField();
    w.wake.sf = 0;
    w.setSea(1.2, 0.5, 0.9);
    const before = [10, 25, 40].map((x) => w.heightAt(x + 7.5, 13));
    w.advance(0, 7.5, 1.2, 0.5, 0.9);
    const after = [10, 25, 40].map((x) => w.heightAt(x, 13));
    after.forEach((h, i) => expect(h).toBeCloseTo(before[i]!, 4));
  });

  it('las fases siguen finitas y envueltas tras un viaje muy largo', () => {
    const w = new WaveField();
    for (let i = 0; i < 2000; i++) w.advance(0.1, 500, 1, 0.5, 0.6);
    for (const p of w.phase) {
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(Math.PI * 2);
    }
    expect(w.drift).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(w.heightAt(3, 4))).toBe(true);
  });

  it('la estela solo levanta agua cuando el barco avanza', () => {
    const w = new WaveField();
    w.hull = waterlineProfile(10, 4);
    w.setSea(0.3, 0, 0);
    w.wake.sf = 0;
    const tip = w.hull.xMax;
    const calm = w.heightAt(tip + 1, 0);
    w.wake.sf = 1;
    expect(w.heightAt(tip + 1, 0)).toBeGreaterThan(calm + 0.1);
  });

  it('sin estela, la altura es solo oleaje (lo que mueve el casco)', () => {
    const w = new WaveField();
    w.hull = waterlineProfile(10, 4);
    w.setSea(0.3, 0, 0);
    w.wake.sf = 1;
    const x = w.hull.xMax + 1;
    expect(w.heightAt(x, 0)).toBeGreaterThan(w.heightAt(x, 0, false) + 0.1);
    w.wake.sf = 0;
    expect(w.heightAt(x, 0)).toBeCloseTo(w.heightAt(x, 0, false), 6);
  });

  it('sanea entradas no finitas', () => {
    const w = new WaveField();
    w.advance(0.1, 0, Number.NaN, Number.NaN, Number.NaN);
    expect(Number.isFinite(w.heightAt(0, 20))).toBe(true);
  });
});

describe('perfil del casco en la flotación', () => {
  it('sigue al casco real (popa, proa y manga) y queda dentro de la cubierta', () => {
    const p = waterlineProfile(10, 4);
    expect(p.xMin).toBeGreaterThan(sternX() - 0.05);
    expect(p.xMin).toBeLessThan(sternX() + 0.3);
    expect(p.xMax).toBeGreaterThan(bowStartX(10) + 4);
    expect(p.xMax).toBeLessThan(bowStartX(10) + BOW_LENGTH);
    const mid = hullHalfWidthAt(p, 0);
    expect(mid).toBeGreaterThan(hullHalfWidth(4) - 0.3);
    expect(mid).toBeLessThan(hullHalfWidth(4));
    for (let x = p.xMin + 0.2; x < p.xMax - 0.2; x += 0.7) {
      const hw = hullHalfWidthAt(p, x);
      if (hw > 0.05) expect(insideHull(x, hw * 0.98, 10, 4)).toBe(true);
    }
  });

  it('se alarga con las ampliaciones del casco', () => {
    const a = waterlineProfile(10, 4);
    const b = waterlineProfile(14, 4);
    expect(b.xMax - a.xMax).toBeCloseTo(16, 0);
    expect(b.xMin).toBeCloseTo(a.xMin, 3);
  });
});

describe('movimiento del barco', () => {
  function run(H: number, wind: number, storm: number, secs = 150): { roll: number; pitch: number; heave: number } {
    const w = new WaveField();
    const hull = waterlineProfile(10, 4);
    w.hull = hull;
    w.setSea(H, wind, 0.6);
    const m = new ShipMotion();
    const root = new THREE.Group();
    let roll = 0;
    let pitch = 0;
    let heave = 0;
    for (let t = 0; t < secs; t += 1 / 30) {
      w.advance(1 / 30, (2.6 / 30) * 1, H, wind, 0.6);
      m.update(1 / 30, w, hull, wind, 0.6, storm, root);
      if (t > 10) {
        roll = Math.max(roll, Math.abs(deg(m.roll.x)));
        pitch = Math.max(pitch, Math.abs(deg(m.pitch.x)));
        heave = Math.max(heave, Math.abs(m.heave.x));
      }
      expect(Number.isFinite(root.position.y)).toBe(true);
    }
    return { roll, pitch, heave };
  }

  it('en calma es casi imperceptible (±1,5° aprox.)', () => {
    const r = run(0.6, 0.3, 0);
    expect(r.roll).toBeLessThan(2);
    expect(r.pitch).toBeLessThan(1.6);
    expect(r.heave).toBeLessThan(0.35);
  });

  it('en tormenta es notable pero acotado', () => {
    const r = run(2.6, 1, 1);
    expect(r.roll).toBeGreaterThan(3.5);
    expect(r.roll).toBeLessThanOrEqual(deg(MAX_ROLL) + 1e-6);
    expect(r.pitch).toBeLessThanOrEqual(deg(MAX_PITCH) + 1e-6);
    expect(r.heave).toBeGreaterThan(0.3);
  });

  it('gira alrededor del centro del casco (el centro apenas se desplaza)', () => {
    const m = new ShipMotion();
    const root = new THREE.Group();
    m.apply(root, 0.08, 0.1, 0, 3.5);
    const c = new THREE.Vector3(3.5, 1.5, 0).applyMatrix4(root.matrixWorld);
    expect(c.distanceTo(new THREE.Vector3(3.5, 1.5, 0))).toBeLessThan(1e-6);
  });
});

describe('atmósfera', () => {
  const region = regionColors(REGIONS.templadas!.palette);
  const clear = { cloudiness: 0.15, rain: 0, fog: 0, wind: 0.3, flash: 0 };
  const at = (h: number, w = clear) => computeAtmosphere(h * 60 + 1440, region, w, createAtmosphere());

  it('el sol sale, culmina y se pone; la luna sale de noche', () => {
    expect(sunDirection(1440 + 12 * 60).y).toBeGreaterThan(0.8);
    expect(sunDirection(1440 + 2 * 60).y).toBeLessThan(0);
    const n = at(0);
    expect(n.moonDir.y).toBeGreaterThan(0.3);
    expect(n.starAlpha).toBeGreaterThan(0.8);
    expect(at(12).starAlpha).toBe(0);
  });

  it('mediodía claro, noche azul oscura, ocaso anaranjado', () => {
    const noon = at(12);
    const night = at(23);
    const dusk = at(19);
    expect(lum(noon.zenith)).toBeGreaterThan(lum(night.zenith) * 4);
    expect(night.zenith.b).toBeGreaterThan(night.zenith.r);
    expect(dusk.golden).toBeGreaterThan(0.5);
    expect(dusk.horizonSun.r).toBeGreaterThan(dusk.horizonSun.b * 1.5);
    expect(noon.lightIntensity).toBeGreaterThan(night.lightIntensity * 2);
    expect(night.lightIntensity).toBeGreaterThan(0.2);
  });

  it('la tormenta oscurece y la niebla espesa la bruma', () => {
    const storm = at(12, { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, flash: 0 });
    const fog = at(12, { cloudiness: 0.6, rain: 0, fog: 0.85, wind: 0.15, flash: 0 });
    const noon = at(12);
    expect(storm.storm).toBeGreaterThan(0.9);
    expect(lum(storm.zenith)).toBeLessThan(lum(noon.zenith) * 0.6);
    expect(storm.lightIntensity).toBeLessThan(noon.lightIntensity * 0.4);
    expect(fog.fogDensity).toBeGreaterThan(noon.fogDensity * 10);
    // visibilidad con niebla densa: el 50 % de bruma a menos de 120 m
    const d50 = Math.sqrt(Math.log(2)) / fog.fogDensity;
    expect(d50).toBeLessThan(120);
    expect(d50).toBeGreaterThan(40);
  });

  it('el relámpago aclara la luz ambiente', () => {
    const a = at(16, { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, flash: 0 });
    const b = at(16, { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, flash: 1 });
    expect(b.hemiIntensity).toBeGreaterThan(a.hemiIntensity + 0.5);
  });

  it('sin disco visible no hay destellos en el mar (pero sí al ocaso con cielo limpio)', () => {
    const storm = at(16, { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, flash: 0 });
    const fog = at(10, { cloudiness: 0.6, rain: 0, fog: 0.85, wind: 0.15, flash: 0 });
    expect(at(12).glint).toBeGreaterThan(0.9);
    expect(at(19).glint).toBeGreaterThan(0.9);
    expect(storm.glint).toBeLessThan(0.06);
    expect(fog.glint).toBeLessThan(0.2);
  });

  it('la fase lunar recorre el ciclo', () => {
    const p0 = moonPhase(0);
    const p1 = moonPhase(1440 * 14.76);
    expect(Math.abs(((p1 - p0 + 1) % 1) - 0.5)).toBeLessThan(0.01);
  });
});

describe('malla del océano', () => {
  it('núcleo uniforme, simétrica y hasta el horizonte', () => {
    for (const q of ['baja', 'media', 'alta'] as const) {
      const s = OCEAN_GRID[q];
      const ax = axisCoords(s);
      expect(ax[0]).toBeCloseTo(-s.extent, 3);
      expect(ax[ax.length - 1]).toBeCloseTo(s.extent, 3);
      for (let i = 1; i < ax.length; i++) expect(ax[i]!).toBeGreaterThan(ax[i - 1]!);
      const mid = Math.floor(ax.length / 2);
      expect(ax[mid]).toBeCloseTo(0, 6);
      expect(ax[mid + 1]! - ax[mid]!).toBeCloseTo(s.cell, 6);
      // la celda del núcleo divide el periodo del ruido (el ciclo de la malla cierra sin saltos)
      expect((1536 / s.cell) % 1).toBeCloseTo(0, 6);
    }
  });

  it('el mar ignora las luces puntuales (lámparas interiores) pero no el sol', () => {
    const src = THREE.ShaderChunk.lights_fragment_begin;
    const out = withoutPointLights(src);
    expect(out).not.toContain('NUM_POINT_LIGHTS; i ++');
    expect(out).toContain('NUM_DIR_LIGHTS');
    // las directivas siguen equilibradas
    const opens = (out.match(/#if/g) ?? []).length;
    const closes = (out.match(/#endif/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('el shader del mar engancha todos sus trozos en el material de three.js', () => {
    const ocean = new Ocean('baja');
    const lib = THREE.ShaderLib.phong;
    const shader = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
    ocean.material.onBeforeCompile(shader as never, null as never);
    const fsrc = shader.fragmentShader;
    // cada sustitución debe haber encontrado su #include (si three.js cambia, la prueba avisa)
    expect(fsrc).toContain('uniform float uGlint;');
    expect(fsrc).toContain('ocHullHW(ocLocal.x)');
    expect(fsrc).toContain('diffuseColor.rgb = wc;');
    expect(fsrc).toContain('material.specularStrength = 1.0 - ocFoam * 0.85;');
    expect(fsrc).toContain('reflectedLight.directSpecular *= uGlint;');
    expect(fsrc).toContain('outgoingLight = mix(outgoingLight, ocSky');
    expect(fsrc).not.toContain('NUM_POINT_LIGHTS; i ++');
    expect(shader.vertexShader).toContain('vec3 dsp = gerstner(gW, hRaw);');
    expect(shader.uniforms).toHaveProperty('uGlint');
    // el especular se apaga ANTES de sumarse a la luz de salida
    expect(fsrc.indexOf('directSpecular *= uGlint')).toBeLessThan(fsrc.indexOf('vec3 outgoingLight'));
    ocean.dispose();
  });

  it('más resolución con más calidad', () => {
    const n = (q: 'baja' | 'media' | 'alta'): number => {
      const g = buildOceanGeometry(OCEAN_GRID[q]);
      const c = g.getAttribute('position').count;
      g.dispose();
      return c;
    };
    expect(n('baja')).toBeLessThan(n('media'));
    expect(n('media')).toBeLessThan(n('alta'));
    expect(n('alta')).toBeLessThan(65000);
  });
});

describe('modelos del mundo', () => {
  const builders = {
    naufragio: () => wreckModel(1),
    isla: () => islandModel(2),
    mercante: () => merchantModel(3),
    plataforma: () => platformModel(4),
    faro: () => lighthouseModel(5),
    balsa: () => raftModel(6),
    islaGrande: () => bigIslandModel(7),
    iceberg: () => icebergModel(8),
    farallon: () => seaStackModel(9),
    velero: () => sailboatModel(10),
    torre: () => signalTowerModel(11),
    estacion: () => weatherStationModel(12),
  };
  for (const [name, b] of Object.entries(builders)) {
    it(`${name}: geometría válida con colores`, () => {
      const m = b();
      expect(hasNaN(m.solid)).toBe(false);
      expect(m.solid.getAttribute('color').count).toBe(m.solid.getAttribute('position').count);
      expect(m.solid.getAttribute('position').count).toBeGreaterThan(30);
      expect(m.radius).toBeGreaterThan(0);
      if (m.glow) expect(hasNaN(m.glow)).toBe(false);
      m.solid.dispose();
      m.glow?.dispose();
    });
  }
  it('el faro tiene linterna y haz; el mercante, luces', () => {
    expect(lighthouseModel(1).beamY).toBeGreaterThan(15);
    expect(merchantModel(1).glow).not.toBeNull();
  });
});

describe('lluvia bajo techo', () => {
  it('el mapa de cubiertas tapa las habitaciones y deja llover sobre el mar', () => {
    const st = createNewGame(1);
    const layout = computeLayout(st.ship);
    const rain = new Rain('media');
    const hull = waterlineProfile(layout.length, layout.width);
    rain.updateCover(layout, hull);
    const tex = (rain as unknown as { cover: THREE.DataTexture }).cover;
    const data = tex.image.data as Float32Array;
    let covered = 0;
    let open = 0;
    let max = -1000;
    for (const v of data) {
      if (v > -100) covered++;
      else open++;
      max = Math.max(max, v);
    }
    expect(covered).toBeGreaterThan(100);
    expect(open).toBeGreaterThan(0);
    // hay techos por encima de la cubierta principal (habitaciones / puente)
    expect(max).toBeGreaterThan(LEVEL_H * 1.5);
    rain.dispose();
  });
});

describe('relámpagos', () => {
  it('destello con rebote que se apaga', () => {
    expect(flashProfile(0.01)).toBe(1);
    expect(flashProfile(0.08)).toBeLessThan(0.5);
    expect(flashProfile(0.14)).toBeGreaterThan(0.5);
    expect(flashProfile(1.2)).toBeLessThan(0.01);
  });
  it('se dispara en el flanco de subida de weather.lightning', () => {
    const l = new Lightning();
    const cam = new THREE.Vector3(0, 5, 0);
    l.update(0.016, 0, cam);
    expect(l.flash).toBe(0);
    l.update(0.016, 0.4, cam);
    expect(l.flash).toBeGreaterThan(0.9);
    expect(l.mesh.visible).toBe(true);
    for (let i = 0; i < 90; i++) l.update(0.016, 0.3, cam);
    expect(l.mesh.visible).toBe(false);
    l.dispose();
  });
});

describe('nubes', () => {
  it('más nubosidad, más nubes visibles', () => {
    const atm = createAtmosphere();
    const visible = (c: number): number => {
      const cl = new Clouds('media');
      cl.snap(c);
      cl.update(0.016, 0, 0, 0, c, atm);
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      let n = 0;
      for (let i = 0; i < cl.mesh.count; i++) {
        cl.mesh.getMatrixAt(i, m);
        s.setFromMatrixScale(m);
        if (s.x > 0.5) n++;
      }
      cl.dispose();
      return n;
    };
    const a = visible(0.15);
    const b = visible(0.7);
    const c = visible(1);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThanOrEqual(b);
  });
});

describe('avistamientos', () => {
  const water = (): number => 1;
  function fakeState(sightings: Sighting[]): GameState {
    const st = createNewGame(3);
    st.voyage.sightings = sightings;
    return st;
  }
  const S = (id: number, kind: Sighting['kind'], x: number, side: 1 | -1 = 1, name: string = kind): Sighting => ({ id, kind, name, expiresAt: 10_000, side, distance: 70, x, eventId: 1 });

  it('crea un modelo por avistamiento en su sitio y lo funde al aparecer', () => {
    const root = new THREE.Group();
    const v = new SightingsView(root);
    const st = fakeState([
      S(1, 'naufragio', 60),
      S(2, 'isla', 150, -1),
      S(3, 'estructura', 200, 1, 'Un faro sin luz sobre las rocas'),
      S(4, 'estructura', 220, 1, 'Una plataforma petrolífera abandonada'),
      S(5, 'estructura', 240, -1, 'Una torre de señales oxidada'),
      S(6, 'estructura', 260, -1, 'Una estación meteorológica a la deriva'),
    ]);
    v.update(st, 0.1, 0, water, createAtmosphere(), false);
    expect(v.count).toBe(6);
    const kinds = root.children.map((c) => c.userData.kind as string);
    for (const k of ['faro-apagado', 'plataforma', 'torre', 'estacion']) expect(kinds).toContain(k);
    const g = root.children.find((c) => c.userData.sightingId === 2)!;
    expect(g.position.x).toBeCloseTo(150, 0);
    expect(g.position.z).toBeCloseTo(-70, 0);
    for (let i = 0; i < 40; i++) v.update(st, 0.1, 0, water, createAtmosphere(), false);
    v.dispose();
  });

  it('el mercante navega a la par y los avistamientos caducados se desvanecen', () => {
    const root = new THREE.Group();
    const v = new SightingsView(root);
    const st = fakeState([S(7, 'mercante', -50, -1)]);
    for (let i = 0; i < 80; i++) v.update(st, 0.1, 0, water, createAtmosphere(), false);
    const g = root.children.find((c) => c.userData.sightingId === 7)!;
    expect(g.position.x).toBeGreaterThan(MERCHANT_STATION_X - 1);
    st.voyage.sightings = [];
    for (let i = 0; i < 40; i++) v.update(st, 0.1, 0, water, createAtmosphere(), false);
    expect(v.count).toBe(0);
    expect(root.children.some((c) => c.userData.sightingId === 7)).toBe(false);
    v.dispose();
  });

  it('el decorado del archipiélago viaja hacia popa y se renueva', () => {
    const root = new THREE.Group();
    const v = new SightingsView(root);
    const st = fakeState([]);
    st.voyage.regionId = 'archipielago';
    v.update(st, 0.1, 0, water, createAtmosphere(), true);
    const n0 = v.decorCount;
    expect(n0).toBeGreaterThan(2);
    const first = root.children[0]!;
    const x0 = first.position.x;
    v.update(st, 0.1, 50, water, createAtmosphere(), false);
    expect(first.position.x).toBeLessThan(x0 - 40);
    // un viaje largo no acumula objetos
    for (let i = 0; i < 400; i++) v.update(st, 0.1, 30, water, createAtmosphere(), false);
    expect(v.decorCount).toBeLessThan(n0 + 8);
    expect(v.decorCount).toBeGreaterThan(0);
    v.dispose();
  });
});

/* ------------------------------------------------------------------ */
/* Ronda de contenido 2: Puerto Esperanza, luz verde y celebración     */
/* ------------------------------------------------------------------ */

const tris = (g: THREE.BufferGeometry): number => g.getAttribute('position').count / 3;

function atmAt(hour: number, cloudiness = 0.15): Atmosphere {
  return computeAtmosphere(hour * 60, regionColors(REGIONS['esperanza']!.palette), { cloudiness, rain: 0, fog: 0, wind: 0.3, flash: 0 }, createAtmosphere());
}

function harborState(mode: 'normal' | 'approach' | 'port' | 'leaving', miles: number): GameState {
  const st = createNewGame(5);
  const v = st.voyage;
  st.story = { pages: [1, 2, 3, 4, 5], revealed: true, arrived: false };
  if (mode === 'approach') {
    v.chosenNext = 'esperanza';
    v.regionDistance = v.regionLength - miles;
  } else if (mode === 'port') {
    v.regionId = 'esperanza';
    v.regionLength = REGIONS['esperanza']!.length;
    v.regionDistance = miles;
    v.route.push('esperanza');
  } else if (mode === 'leaving') {
    v.route.push('esperanza', 'templadas');
    v.regionId = 'templadas';
    v.regionDistance = miles;
  }
  return st;
}

const HULL = { xMin: -10, xMax: 12, halfWidth: 4 };

describe('kit: canal luminoso', () => {
  it('solo luce lo que se añade con emit, y los modelos de siempre no llevan aEmit', () => {
    const k = new Kit(1, 0);
    k.box(1, 1, 1, '#ff0000');
    k.emit('#ffd27d').box(1, 1, 1, '#2b3a44', { p: [2, 0, 0] }).emit(null);
    const g = k.build();
    const e = g.getAttribute('aEmit');
    expect(e.count).toBe(g.getAttribute('position').count);
    const half = e.count / 2;
    expect(e.getX(0) + e.getY(0) + e.getZ(0)).toBe(0);
    expect(e.getX(half)).toBeGreaterThan(0.5);
    expect(wreckModel(1).solid.getAttribute('aEmit')).toBeUndefined();
  });
  it('toModel aplica la transformación de grupo', () => {
    const k = new Kit(1);
    k.push({ p: [10, 0, 0], r: [0, Math.PI / 2, 0] });
    const p = k.toModel([1, 2, 0]);
    expect(p[0]).toBeCloseTo(10, 5);
    expect(p[1]).toBeCloseTo(2, 5);
    expect(p[2]).toBeCloseTo(-1, 5);
  });
});

describe('modelos de Puerto Esperanza', () => {
  const all: [string, () => HarborModel][] = [
    ['grupo de barcos-hogar', () => houseboatClusterModel(1000)],
    ['grupo de barcos-hogar (otra variante)', () => houseboatClusterModel(1037)],
    ['torre de la luz verde', () => greenTowerModel(77)],
    ['bote de remos', () => harborBoatModel('bote', 3)],
    ['lancha', () => harborBoatModel('lancha', 4)],
    ['velero pequeño', () => harborBoatModel('velero', 5)],
    ['tramo de pantalán', () => promenadeModel(500, 49)],
    ['boya roja', () => channelBuoyModel('red')],
    ['boya verde', () => channelBuoyModel('green')],
  ];
  for (const [name, b] of all) {
    it(`${name}: geometría válida con colores, emisión y luces dentro del modelo`, () => {
      const m = b();
      expect(hasNaN(m.geo)).toBe(false);
      const n = m.geo.getAttribute('position').count;
      expect(m.geo.getAttribute('color').count).toBe(n);
      expect(m.geo.getAttribute('aEmit').count).toBe(n);
      expect(m.lights.length).toBeGreaterThan(0);
      const bs = m.geo.boundingSphere!;
      for (const l of m.lights) {
        expect(new THREE.Vector3(...l.p).distanceTo(bs.center)).toBeLessThan(bs.radius + 1);
        expect(l.size).toBeGreaterThan(0);
      }
      m.geo.dispose();
    });
  }
  it('el grupo de barcos-hogar tiene farolillos, ventanas y farolas (mil luces cálidas) con un coste contenido', () => {
    for (const seed of [1000, 1037, 1074, 1111, 1148, 1185, 1222, 1259]) {
      const m = houseboatClusterModel(seed);
      expect(m.lights.length).toBeGreaterThan(20);
      expect(m.lights.some((l) => (l.flicker ?? 0) > 0.4)).toBe(true); // farolillos
      expect(tris(m.geo)).toBeLessThan(9000);
      expect(m.radius).toBeGreaterThan(12);
      expect(m.radius).toBeLessThan(45);
      m.geo.dispose();
    }
  });
  it('la torre tiene la linterna verde que luce y la luz arriba', () => {
    const m = greenTowerModel(77);
    expect(m.starY).toBe(TOWER_LIGHT_Y);
    expect(TOWER_LIGHT_Y).toBeGreaterThan(40);
    const pos = m.geo.getAttribute('position');
    const e = m.geo.getAttribute('aEmit');
    let green = 0;
    for (let i = 0; i < e.count; i++) if (e.getY(i) > 0.8 && e.getX(i) < 0.2 && Math.abs(pos.getY(i) - TOWER_LIGHT_Y) < 2.5) green++;
    expect(green).toBeGreaterThan(30);
    expect(tris(m.geo)).toBeLessThan(30000);
    m.geo.dispose();
  });
  it('el mercado flotante del muelle tiene puestos y farolillos', () => {
    const m = marketBargeModel(7);
    expect(hasNaN(m.solid)).toBe(false);
    expect(m.glow).not.toBeNull();
    expect(m.glow!.getAttribute('position').count).toBeGreaterThan(100);
  });
});

describe('geografía del puerto', () => {
  it('sin el rumbo de la capitana no hay puerto ni luz verde', () => {
    expect(harborSpan(harborState('normal', 0))).toBeNull();
    const st = harborState('normal', 0);
    st.voyage.chosenNext = 'sargazos';
    st.voyage.regionDistance = st.voyage.regionLength - 5;
    expect(harborSpan(st)).toBeNull();
  });
  it('con rumbo a Puerto Esperanza la luz asoma solo en el último tramo', () => {
    expect(harborSpan(harborState('approach', APPROACH_MILES + 5))).toBeNull();
    const sp = harborSpan(harborState('approach', APPROACH_MILES - 1))!;
    expect(sp.mode).toBe('approach');
    expect(sp.s).toBeCloseTo(-(APPROACH_MILES - 1), 5);
    // la bocana está por delante, a la distancia que el agua tardará en traerla
    expect(sp.start).toBeCloseTo((APPROACH_MILES - 1) * DRIFT_PER_MILE, 3);
  });
  it('la torre asoma en el horizonte, casi por la proa, y se acerca sin saltos al cruzar la bocana', () => {
    const far = towerX(-APPROACH_MILES);
    expect(far).toBeGreaterThan(2000);
    expect(far).toBeLessThan(3000); // dentro del mar dibujado y del plano lejano
    expect(Math.abs(Math.atan2(TOWER_Z, far))).toBeLessThan(THREE.MathUtils.degToRad(10));
    let prev = Infinity;
    for (let s = -APPROACH_MILES; s <= 140; s += 0.5) {
      const x = towerX(s);
      expect(x).toBeLessThan(prev + 1e-9);
      prev = x;
    }
    expect(towerX(-0.0001)).toBeCloseTo(towerX(0), 1);
    // aparece fundiéndose y al llegar ya se ve del todo
    expect(towerVisibility({ mode: 'approach', s: -APPROACH_MILES, start: 0, end: 0 })).toBeLessThan(0.05);
    expect(towerVisibility({ mode: 'approach', s: -10, start: 0, end: 0 })).toBe(1);
    expect(towerVisibility({ mode: 'port', s: 30, start: 0, end: 0 })).toBe(1);
    // durante toda la estancia sigue a la vista (por delante al llegar, a popa al final)
    expect(towerX(0)).toBeGreaterThan(300);
    expect(towerX(REGIONS['esperanza']!.length)).toBeGreaterThan(-1400);
  });
  it('la bocana no salta al pasar de la región anterior al puerto', () => {
    const a = harborSpan(harborState('approach', 0.001))!;
    const p = harborSpan(harborState('port', 0.001))!;
    expect(Math.abs(a.start - p.start)).toBeLessThan(0.1);
    expect(p.mode).toBe('port');
    expect(p.end).toBeCloseTo((REGIONS['esperanza']!.length - 0.001) * DRIFT_PER_MILE, 2);
  });
  it('al dejar el puerto queda a popa un rato y luego desaparece', () => {
    const l = harborSpan(harborState('leaving', 5))!;
    expect(l.mode).toBe('leaving');
    expect(l.end).toBeLessThan(0);
    expect(harborSpan(harborState('leaving', 200))).toBeNull();
  });
  it('los amarres son deterministas, dejan libre el canal y la franja de la torre', () => {
    expect(harborSlots(7, 12)).toEqual(harborSlots(7, 12));
    let n = 0;
    for (let k = 0; k < 400; k++) {
      for (const s of harborSlots(7, k)) {
        n++;
        expect(Math.abs(s.z)).toBeGreaterThanOrEqual(MOOR_MIN_Z);
        if (s.z > 0) expect(Math.abs(s.z - TOWER_Z)).toBeGreaterThanOrEqual(TOWER_BAND);
        expect(s.variant).toBeGreaterThanOrEqual(0);
        expect(s.variant).toBeLessThan(CLUSTER_VARIANTS);
      }
    }
    expect(n).toBeGreaterThan(700);
  });
  it('segmentHitsBox detecta un rumbo que atraviesa el casco', () => {
    expect(segmentHitsBox(0, -50, 0, 50, -10, 12, 6)).toBe(true);
    expect(segmentHitsBox(100, -50, 100, 50, -10, 12, 6)).toBe(false);
  });
});

describe('vista del puerto', () => {
  const water = (): number => 1;
  const shared = createGlowShared();

  it('en la aproximación: la luz verde, las boyas de la bocana y el puerto solo más allá de ella', () => {
    const h = new HarborView(shared, 'media');
    const st = harborState('approach', 20);
    h.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    const span = harborSpan(st)!;
    expect(h.mode).toBe('approach');
    expect(h.towerPosition!.x).toBeCloseTo(towerX(-20), 3);
    const kids = h.root.children;
    const keys = kids.map((c) => c.userData['harbor'] as string);
    expect(keys).toContain('torre');
    expect(keys.filter((k) => k.startsWith('boya-in')).length).toBe(2);
    for (const c of kids) if (!String(c.userData['harbor']).startsWith('boya') && c.userData['harbor'] !== 'torre') expect(c.position.x).toBeGreaterThan(span.start);
    expect(h.boatCount).toBe(0);
    // de día, la gran luz verde ya se ve en el horizonte
    const star = h.root.getObjectByName('luz-verde') as THREE.Points;
    expect(star.visible).toBe(true);
    expect((star.material as THREE.ShaderMaterial).uniforms['uIntensity']!.value).toBeGreaterThan(0.5);
    // las boyas: roja a babor (−z) y verde a estribor al entrar
    const red = kids.find((c) => c.userData['harbor'] === 'boya-in--1')!;
    expect(red.position.z).toBeLessThan(0);
    h.dispose();
  });

  it('en el puerto: grupos a ambos lados del canal, botes y, de noche, mil luces', () => {
    const h = new HarborView(shared, 'media');
    const st = harborState('port', 30);
    h.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    expect(h.mode).toBe('port');
    expect(h.clusterCount).toBeGreaterThan(10);
    expect(h.boatCount).toBe(7);
    const groups = h.root.children.filter((c) => /^\d+[abc]$/.test(String(c.userData['harbor'])));
    expect(groups.some((g) => g.position.z > 0)).toBe(true);
    expect(groups.some((g) => g.position.z < 0)).toBe(true);
    for (const g of groups) expect(Math.abs(g.position.z)).toBeGreaterThanOrEqual(MOOR_MIN_Z);
    // pantalanes iluminados a ambos lados del canal
    const piers = h.root.children.filter((c) => String(c.userData['harbor']).startsWith('pantalan-'));
    expect(piers.length).toBeGreaterThan(4);
    expect(MOOR_MIN_Z).toBeGreaterThan(PROMENADE_Z + 15);
    expect(PROMENADE_Z).toBeGreaterThan(CHANNEL_HALF);
    // de día no hay halos; de noche sí, con reflejo en el agua
    const halos = (): THREE.Points[] => {
      const out: THREE.Points[] = [];
      for (const g of h.root.children) {
        if (!/^\d+[abc]$/.test(String(g.userData['harbor']))) continue;
        g.traverse((o) => {
          if (o.name === 'halos-luces') out.push(o as THREE.Points);
        });
      }
      return out;
    };
    expect(halos().some((p) => p.visible)).toBe(false);
    for (let i = 0; i < 40; i++) h.update(st, 0.1, 0, water, atmAt(23), false, HULL);
    expect(halos().filter((p) => p.visible).length).toBeGreaterThan(10);
    let mirrors = 0;
    h.root.traverse((o) => {
      if (o.name === 'reflejos-luces' && o.visible) mirrors++;
    });
    expect(mirrors).toBeGreaterThan(5);
    const beam = h.root.getObjectByName('haz-luz-verde')!;
    expect(beam.visible).toBe(true);
    h.dispose();
  });

  it('el puerto viaja con el agua: avanzar millas lo desplaza lo mismo que el mar', () => {
    const h = new HarborView(shared, 'baja');
    const st = harborState('port', 30);
    h.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    const g = h.root.children.find((c) => /^\d+[ab]$/.test(String(c.userData['harbor'])) && c.position.x > 0 && c.position.x < 800)!;
    const x0 = g.position.x;
    st.voyage.regionDistance += 2;
    h.update(st, 0.1, 2 * DRIFT_PER_MILE, water, atmAt(12), false, HULL);
    expect(g.position.x).toBeCloseTo(x0 - 2 * DRIFT_PER_MILE, 3);
    // la torre, enorme y lejana, se desplaza más despacio (paralaje)
    expect(h.towerPosition!.x).toBeCloseTo(towerX(32), 3);
    h.dispose();
  });

  it('los botes van y vienen sin cruzar nunca el casco del barco', () => {
    const h = new HarborView(shared, 'media');
    const st = harborState('port', 10);
    h.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    const boats = (): THREE.Object3D[] => h.root.children.filter((c) => String(c.userData['harbor']).startsWith('bote-'));
    const start = boats().map((b) => b.position.clone());
    let moved = 0;
    for (let i = 0; i < 3000; i++) {
      // 2 m/s de agua hacia popa (unos 4,6 nudos)
      st.voyage.regionDistance += 2 / 0.1 / DRIFT_PER_MILE / 10 / 10;
      h.update(st, 0.1, 0.2, water, atmAt(12), false, HULL);
      for (const b of boats()) {
        const inside = b.position.x > HULL.xMin - 2 && b.position.x < HULL.xMax + 2 && Math.abs(b.position.z) < HULL.halfWidth + 2;
        expect(inside).toBe(false);
        // ni atraviesan los pantalanes: se quedan en el canal
        expect(Math.abs(b.position.z)).toBeLessThan(PROMENADE_Z - 1.4);
      }
    }
    for (const [i, b] of boats().entries()) if (start[i] && b.position.distanceTo(start[i]!) > 20) moved++;
    expect(moved).toBeGreaterThan(3);
    expect(h.boatCount).toBe(7);
    h.dispose();
  });

  it('al aparecer el puerto construye los modelos poco a poco (sin tirones) y no amarra sobre un naufragio', () => {
    const h = new HarborView(shared, 'media');
    const st = harborState('port', 20);
    h.update(st, 0.1, 0, water, atmAt(12), false, HULL);
    const first = h.clusterCount;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) h.update(st, 0.1, 0, water, atmAt(12), false, HULL);
    expect(h.clusterCount).toBeGreaterThan(first);
    h.dispose();
    // Con un naufragio a 90 m por estribor, ningún grupo a menos de su radio
    const h2 = new HarborView(shared, 'media');
    const st2 = harborState('port', 20);
    st2.voyage.sightings = [{ id: 1, kind: 'naufragio', name: 'Restos', expiresAt: 1e6, side: 1, distance: 90, x: 200, eventId: 1 }];
    h2.update(st2, 0.1, 0, water, atmAt(12), true, HULL);
    for (const c of h2.root.children) {
      if (!/^\d+[abc]$/.test(String(c.userData['harbor']))) continue;
      expect(Math.hypot(c.position.x - 200, c.position.z - 90)).toBeGreaterThan(40);
    }
    h2.dispose();
  });

  it('al dejar el puerto atrás todo se desvanece y se libera', () => {
    const h = new HarborView(shared, 'media');
    const st = harborState('port', 70);
    h.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    expect(h.clusterCount).toBeGreaterThan(5);
    const left = createNewGame(5);
    for (let i = 0; i < 60; i++) h.update(left, 0.1, 0, water, atmAt(12), false, HULL);
    expect(h.clusterCount).toBe(0);
    expect(h.boatCount).toBe(0);
    expect(h.root.children.length).toBe(0);
    h.dispose();
  });

  it('una partida cargada en el puerto lo muestra igual (determinista)', () => {
    const a = new HarborView(shared, 'media');
    const b = new HarborView(shared, 'media');
    const st = harborState('port', 42);
    a.update(st, 0.1, 0, water, atmAt(12), true, HULL);
    b.update(JSON.parse(JSON.stringify(st)) as GameState, 0.1, 0, water, atmAt(12), true, HULL);
    const sig = (h: HarborView): string =>
      h.root.children
        .filter((c) => /^\d+[abc]$/.test(String(c.userData['harbor'])))
        .map((c) => `${c.userData['harbor']}:${c.position.x.toFixed(2)},${c.position.z.toFixed(2)}`)
        .sort()
        .join('|');
    expect(sig(a)).toBe(sig(b));
    a.dispose();
    b.dispose();
  });
});

describe('celebración de la llegada', () => {
  const shared = createGlowShared();
  it('solo empieza cuando la llegada ocurre en la partida (no al cargar una ya llegada)', () => {
    const st = harborState('port', 1);
    st.story!.arrived = true;
    expect(arrivalJustHappened(false, st, false)).toBe(true);
    expect(arrivalJustHappened(true, st, false)).toBe(false);
    expect(arrivalJustHappened(false, st, true)).toBe(false);
    st.voyage.regionId = 'templadas';
    expect(arrivalJustHappened(false, st, false)).toBe(false);
  });

  it('fuegos que suben, estallan en el cielo y se apagan; farolillos que suben', () => {
    const c = new Celebration(shared);
    let bursts = 0;
    let maxY = 0;
    c.onBurst = () => bursts++;
    c.start();
    const spots = [new THREE.Vector3(120, 3, 90), new THREE.Vector3(200, 3, -140)];
    const atm = atmAt(22);
    let maxSparks = 0;
    for (let i = 0; i < 300; i++) {
      c.update(0.05, 0, atm, () => spots, { x: 1, z: 0 }, 0);
      maxSparks = Math.max(maxSparks, c.sparkCount);
      const g = c.group.getObjectByName('fuegos-artificiales') as THREE.InstancedMesh;
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let k = 0; k < g.count; k++) {
        g.getMatrixAt(k, m);
        p.setFromMatrixPosition(m);
        maxY = Math.max(maxY, p.y);
      }
    }
    expect(bursts).toBeGreaterThan(10);
    expect(maxSparks).toBeGreaterThan(100);
    expect(maxY).toBeGreaterThan(60);
    expect(maxY).toBeLessThan(200);
    expect(c.lanternCount).toBeGreaterThan(10);
    // al terminar el espectáculo se apaga todo (los farolillos se pierden en el cielo)
    for (let i = 0; i < 3600; i++) c.update(0.1, 0, atm, () => spots, { x: 1, z: 0 }, 0);
    expect(c.sparkCount).toBe(0);
    expect(c.lanternCount).toBe(0);
    expect(c.active).toBe(false);
    expect(c.flash.r + c.flash.g + c.flash.b).toBeLessThan(0.01);
    c.dispose();
  });

  it('la fiesta se repite la primera noche en el puerto, no otro día ni fuera de él', () => {
    const st = harborState('port', 2);
    expect(fiestaLevel(st)).toBe(0);
    st.story!.arrived = true;
    const day = 3;
    st.events.cooldowns['llegada'] = (day - 1) * 1440 + 9 * 60;
    st.time = (day - 1) * 1440 + 22 * 60;
    expect(fiestaLevel(st)).toBeGreaterThan(0.99);
    st.time = (day - 1) * 1440 + 15 * 60;
    expect(fiestaLevel(st)).toBe(0);
    st.time = day * 1440 + 22 * 60;
    expect(fiestaLevel(st)).toBe(0);
    st.time = (day - 1) * 1440 + 22 * 60;
    st.voyage.regionId = 'templadas';
    expect(fiestaLevel(st)).toBe(0);
  });
});

describe('calidad y antialias (QA P6)', () => {
  it('el antialias depende de la calidad y avisa cuando hace falta recargar', () => {
    expect(antialiasFor('baja')).toBe(false);
    expect(antialiasFor('media')).toBe(true);
    expect(antialiasFor('alta')).toBe(true);
    // contexto creado en media (con antialias)
    expect(reloadNeededFor(true, 'baja')).toBe(true);
    expect(reloadNeededFor(true, 'alta')).toBe(false);
    // contexto creado en baja (sin antialias)
    expect(reloadNeededFor(false, 'media')).toBe(true);
    expect(reloadNeededFor(false, 'baja')).toBe(false);
  });
});

describe('halos de luz', () => {
  it('guardan el color en sRGB y una geometría compartida no se libera con quien la usa', () => {
    const shared = createGlowShared();
    const geo = glowGeometry([{ p: [0, 1, 0], color: '#ff8000', size: 2 }]);
    const a = new GlowPoints(shared, geo);
    const c = geo.getAttribute('aColor');
    expect(c.getX(0)).toBeCloseTo(1, 3);
    expect(c.getY(0)).toBeCloseTo(128 / 255, 3);
    a.intensity = 1;
    expect(a.points.visible).toBe(true);
    a.dispose();
    expect(geo.getAttribute('position').count).toBe(1);
    a.intensity = 0;
    expect(a.points.visible).toBe(false);
  });
  it('las luces del puerto se encienden al anochecer', () => {
    expect(lightsLevel(1, 0, 0)).toBe(0);
    expect(lightsLevel(0, 0, 0)).toBe(1);
    expect(lightsLevel(1, 1, 0)).toBeGreaterThan(0.1); // cielo cubierto: alguna ventana encendida
  });
});

describe('mercado del muelle', () => {
  it('en Puerto Esperanza el mercante es el mercado flotante', () => {
    const root = new THREE.Group();
    const v = new SightingsView(root);
    const st = createNewGame(3);
    st.voyage.regionId = 'esperanza';
    st.voyage.sightings = [{ id: 9, kind: 'mercante', name: 'Mercado del muelle', expiresAt: 10_000, side: 1, distance: 30, x: 60, eventId: 1 }];
    v.update(st, 0.1, 0, () => 1, createAtmosphere(), false);
    const g = root.children.find((c) => c.userData.sightingId === 9) as THREE.Group;
    const solid = g.children[0] as THREE.Mesh;
    const ref = marketBargeModel(7);
    expect(solid.geometry.getAttribute('position').count).toBe(ref.solid.getAttribute('position').count);
    v.dispose();
  });
});

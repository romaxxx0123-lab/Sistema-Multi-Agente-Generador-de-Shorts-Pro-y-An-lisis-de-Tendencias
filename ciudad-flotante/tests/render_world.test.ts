/**
 * Pruebas del mundo visual (área render-world). El `Renderer` necesita WebGL, pero todas sus
 * piezas de cálculo (oleaje compartido CPU/GPU, perfil del casco, balanceo, atmósfera, malla del
 * océano, modelos, lluvia, avistamientos) funcionan en Node y se prueban aquí.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOW_LENGTH, bowStartX, hullHalfWidth, insideHull, sternX } from '../src/render/ship/hull';
import { computeAtmosphere, createAtmosphere, moonPhase, regionColors, sunDirection } from '../src/render/world/atmosphere';
import { Clouds } from '../src/render/world/clouds';
import { waterlineProfile } from '../src/render/world/hullProfile';
import { flashProfile, Lightning } from '../src/render/world/lightning';
import {
  bigIslandModel,
  icebergModel,
  islandModel,
  lighthouseModel,
  merchantModel,
  platformModel,
  raftModel,
  sailboatModel,
  seaStackModel,
  signalTowerModel,
  weatherStationModel,
  wreckModel,
} from '../src/render/world/models';
import { axisCoords, buildOceanGeometry, OCEAN_GRID, withoutPointLights } from '../src/render/world/ocean';
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

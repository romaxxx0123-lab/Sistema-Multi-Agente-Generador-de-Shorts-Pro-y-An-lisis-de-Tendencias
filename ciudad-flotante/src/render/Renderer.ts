/**
 * [AGENTE render-world] Escena, cielo, sol y luna, océano, clima, avistamientos y balanceo del
 * barco (docs/SISTEMAS.md §12 "Mundo").
 *
 * Marcos de referencia:
 *  - `worldRoot` / escena = marco del OCÉANO. El barco está en el origen y navega hacia +x; el
 *    agua, los restos y los avistamientos se desplazan hacia popa (−x).
 *  - `shipRoot` = marco LOCAL del barco: se mece con las olas (cabeceo, balanceo, arfada) en
 *    torno al centro del casco. Todo lo que vive a bordo (y la cámara del jugador) cuelga de aquí.
 *
 * Piezas (src/render/world): oleaje compartido CPU/GPU (`waves`), perfil del casco en la
 * flotación (`hullProfile`), océano (`ocean`), atmósfera pura (`atmosphere`), cúpula, sol, luna y
 * estrellas (`sky`), nubes, lluvia, relámpagos, rociones de proa, gaviotas, movimiento del barco
 * (`shipMotion`) y avistamientos/decorado lejano (`sightings`, `models`, `kit`).
 *
 * Calidad: 'baja' sin sombras ni antialias, malla del mar gruesa y menos nubes/lluvia; 'media'
 * sombras 1024; 'alta' sombras 2048, más resolución. (El antialias se fija al crear el contexto.)
 *
 * Depuración (`window.__game.cmd`): `vista(px,py,pz, tx,ty,tz[, fov])` cámara libre (sin
 * argumentos vuelve a la del juego), `clima('tormenta')`, `avistamiento(tipo, x, distancia, lado,
 * nombre)`, `decorado()` (repuebla el decorado lejano), `delfines(s)`, `peces(true|false)` y
 * `mundo()` (estado resumido).
 */
import * as THREE from 'three';
import { clamp } from '../core/math';
import { REGIONS, START_REGION } from '../data/regions';
import { registerDebug } from '../game/debug';
import type { Quality } from '../game/types';
import { VISUAL_DRIFT, WATERLINE_Y } from '../sim/constants';
import type { ShipLayout } from '../sim/ship';
import { hourOf } from '../sim/time';
import type { GameState, WeatherKind } from '../sim/types';
import { computeAtmosphere, createAtmosphere, lerpRegionColors, regionColors, type RegionColors } from './world/atmosphere';
import { Birds } from './world/birds';
import { Clouds } from './world/clouds';
import { waterlineProfile } from './world/hullProfile';
import { Lightning } from './world/lightning';
import { MarineLife } from './world/marine';
import { Ocean } from './world/ocean';
import { Rain } from './world/rain';
import { ShipMotion } from './world/shipMotion';
import { Sky } from './world/sky';
import { Spray } from './world/spray';
import { SightingsView } from './world/sightings';
import { HULL_SAMPLES, hullHalfWidthAt, WaveField, type HullProfile } from './world/waves';

/** Parámetros de cada nivel de calidad. */
const QUALITY: Record<Quality, { pixelRatio: number; shadows: boolean; shadowMap: number }> = {
  baja: { pixelRatio: 1, shadows: false, shadowMap: 512 },
  media: { pixelRatio: 1.5, shadows: true, shadowMap: 1024 },
  alta: { pixelRatio: 2, shadows: true, shadowMap: 2048 },
};

/** Clima "de manual" para pruebas (`__game.cmd.clima('tormenta')`). */
const WEATHER_PRESETS: Record<WeatherKind, { cloudiness: number; rain: number; fog: number; wind: number; waveHeight: number }> = {
  despejado: { cloudiness: 0.15, rain: 0, fog: 0, wind: 0.3, waveHeight: 0.6 },
  nublado: { cloudiness: 0.7, rain: 0, fog: 0.1, wind: 0.45, waveHeight: 0.9 },
  lluvia: { cloudiness: 0.9, rain: 0.7, fog: 0.2, wind: 0.55, waveHeight: 1.2 },
  tormenta: { cloudiness: 1, rain: 1, fog: 0.3, wind: 1, waveHeight: 2.6 },
  niebla: { cloudiness: 0.6, rain: 0, fog: 0.85, wind: 0.15, waveHeight: 0.5 },
};

const num = (v: number, d: number): number => (Number.isFinite(v) ? v : d);

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  /** Grupo que se balancea con las olas. Todo lo que vive "en el barco" cuelga de aquí (coords locales). */
  readonly shipRoot = new THREE.Group();
  /** Marco del océano (restos flotantes, islas). El barco está en el origen; el agua se desplaza. */
  readonly worldRoot = new THREE.Group();

  private quality: Quality;
  private readonly waves = new WaveField();
  private readonly ocean: Ocean;
  private readonly sky: Sky;
  private readonly clouds: Clouds;
  private readonly rain: Rain;
  private readonly lightning: Lightning;
  private readonly sightings: SightingsView;
  private readonly birds: Birds;
  private readonly spray = new Spray();
  private readonly marine = new MarineLife();
  private readonly bow = new THREE.Vector3();
  private readonly sprayColor = new THREE.Color();
  private readonly motion = new ShipMotion();
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog = new THREE.FogExp2('#bfe0ea', 0.0007);
  private readonly atm = createAtmosphere();
  private region: RegionColors | null = null;
  private readonly regionTargets = new Map<string, RegionColors>();
  private readonly rainColor = new THREE.Color();
  private regionId = '';
  private hull: HullProfile;
  private hullKey = '';
  private lastState: GameState | null = null;
  private lastTime: number | null = null;
  private readonly camPos = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private viewAz: number | null = null;
  private readonly center = new THREE.Vector3();
  private debugCam: THREE.PerspectiveCamera | null = null;
  /** Depuración: fuerza el banco de peces visual. */
  private forceFish = false;
  /** `waterHeight` ligada (se pasa a los subsistemas sin crear cierres en cada frame). */
  private readonly waterFn = (x: number, z: number): number => this.waterHeight(x, z);
  private readonly splashFn = (x: number, y: number, z: number, big: boolean): void => this.spray.burst(x, y, z, big ? 14 : 6, big ? 3.2 : 2, big ? 1.8 : 1);

  constructor(
    readonly container: HTMLElement,
    quality: Quality,
  ) {
    this.quality = quality;
    // El antialias solo puede fijarse al crear el contexto (cambiarlo requiere recargar).
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'baja', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[quality].pixelRatio));
    this.renderer.setSize(Math.max(1, container.clientWidth), Math.max(1, container.clientHeight));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.name = 'escena';
    this.scene.background = new THREE.Color('#bfe0ea');
    this.scene.fog = this.fog;
    this.shipRoot.name = 'barco';
    this.shipRoot.matrixAutoUpdate = false;
    this.worldRoot.name = 'oceano-marco';
    this.scene.add(this.shipRoot, this.worldRoot);

    this.hemi = new THREE.HemisphereLight('#cfe8f5', '#2b5266', 1.1);
    this.hemi.name = 'luz-cielo';
    this.sun = new THREE.DirectionalLight('#fff2dd', 3);
    this.sun.name = 'luz-sol';
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.hull = waterlineProfile(10, 4);
    this.waves.hull = this.hull;
    this.ocean = new Ocean(quality);
    this.sky = new Sky();
    this.clouds = new Clouds(quality);
    this.rain = new Rain(quality);
    this.lightning = new Lightning();
    this.sightings = new SightingsView(this.worldRoot);
    this.birds = new Birds();
    this.scene.add(this.sky.group, this.ocean.mesh, this.clouds.mesh, this.rain.lines, this.rain.splashes, this.lightning.mesh, this.birds.mesh, this.spray.points, this.marine.fishMesh, this.marine.dolphinMesh);
    this.applyQuality(quality, false);
    this.registerDebug();
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  /**
   * Actitud actual del barco sobre las olas (cabeceo y balanceo en radianes, arfada en metros).
   * Útil para el audio (crujidos) o efectos de cámara. Solo lectura.
   */
  get attitude(): { pitch: number; roll: number; heave: number } {
    return { pitch: this.motion.pitch.x, roll: this.motion.roll.x, heave: this.motion.heave.x };
  }

  /** Altura del agua (coordenadas del océano, barco en el origen). Misma función que el shader. */
  waterHeight(x: number, z: number): number {
    return WATERLINE_Y + this.waves.heightAt(x, z);
  }

  setQuality(q: Quality): void {
    if (q === this.quality) return;
    this.applyQuality(q, true);
  }

  private applyQuality(q: Quality, recompile: boolean): void {
    this.quality = q;
    const cfg = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
    this.resize();
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
    if (cfg.shadows && this.sun.shadow.mapSize.x !== cfg.shadowMap) {
      this.sun.shadow.mapSize.set(cfg.shadowMap, cfg.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.ocean.setQuality(q);
    this.clouds.setQuality(q);
    this.rain.setQuality(q);
    if (recompile) {
      // Activar/desactivar sombras cambia los programas de los materiales iluminados.
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) mm.needsUpdate = true;
      });
    }
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    if (this.debugCam) {
      this.debugCam.aspect = w / h;
      this.debugCam.updateProjectionMatrix();
    }
  }

  /* ================================================================== */
  /* Actualización por frame                                             */
  /* ================================================================== */

  update(state: GameState, layout: ShipLayout, dtReal: number, camera: THREE.Camera): void {
    const dt = clamp(num(dtReal, 0), 0, 0.1);
    const newSim = state !== this.lastState;
    this.lastState = state;
    const w = state.weather;
    const v = state.voyage;

    // --- Tiempo de juego transcurrido (saltos: carga, depuración → sin arrastre) ---
    let dGame = this.lastTime === null || newSim ? 0 : state.time - this.lastTime;
    if (!(dGame >= 0) || dGame > 5) dGame = 0;
    this.lastTime = state.time;

    // --- Casco (cambia con las ampliaciones) ---
    const hk = `${layout.length}x${layout.width}`;
    if (hk !== this.hullKey) {
      this.hullKey = hk;
      this.hull = waterlineProfile(layout.length, layout.width);
      this.waves.hull = this.hull;
      let hwMax = 0;
      for (let i = 0; i < HULL_SAMPLES; i++) hwMax = Math.max(hwMax, this.hull.hw[i]!);
      this.waves.wake.hwMid = hwMax;
      this.waves.wake.hwStern = this.hull.hw[0]! > 0 ? this.hull.hw[0]! : hwMax;
    }

    // --- Oleaje y desplazamiento del agua hacia popa ---
    const speed = Math.max(0, num(v.speed, 0));
    const driftPerMin = (VISUAL_DRIFT * speed) / 6;
    const ds = driftPerMin * dGame;
    this.waves.wake.sf = clamp(speed / 6, 0, 1.5);
    if (newSim) this.waves.setSea(num(w.waveHeight, 0.6), num(w.wind, 0.3), num(w.windDir, 0.6));
    this.waves.advance(dt, ds, num(w.waveHeight, 0.6), num(w.wind, 0.3), num(w.windDir, 0.6));

    // --- Paleta de la región (transición suave) ---
    const reg = REGIONS[v.regionId] ?? REGIONS[START_REGION]!;
    let target = this.regionTargets.get(reg.id);
    if (!target) {
      target = regionColors(reg.palette);
      this.regionTargets.set(reg.id, target);
    }
    if (!this.region || newSim) {
      this.region = regionColors(reg.palette);
    } else {
      // Al entrar en otra región la paleta cambia poco a poco (≈ 15 s).
      lerpRegionColors(this.region, target, 1 - Math.exp(-dt / 6));
    }
    this.regionId = reg.id;

    // --- Atmósfera ---
    this.lightning.update(dt, num(w.lightning, 0), this.camPos, this.viewAz);
    computeAtmosphere(
      state.time,
      this.region,
      { cloudiness: num(w.cloudiness, 0.2), rain: num(w.rain, 0), fog: num(w.fog, 0), wind: num(w.wind, 0.3), flash: this.lightning.flash },
      this.atm,
    );
    const atm = this.atm;

    // --- Barco sobre las olas ---
    if (newSim) this.motion.reset();
    this.motion.update(dt, this.waves, this.hull, this.waves.wind, this.waves.windDir, atm.storm, this.shipRoot);

    // --- Cámara (posición mundial) ---
    const cam = this.debugCam ?? camera;
    cam.updateWorldMatrix(true, false);
    this.camPos.setFromMatrixPosition(cam.matrixWorld);
    this.camDir.set(0, 0, -1).transformDirection(cam.matrixWorld);
    this.viewAz = Math.hypot(this.camDir.x, this.camDir.z) > 0.05 ? Math.atan2(this.camDir.z, this.camDir.x) : null;

    // --- Luces y niebla ---
    const cx = (this.hull.xMin + this.hull.xMax) / 2;
    this.center.set(cx, 4, 0).applyMatrix4(this.shipRoot.matrixWorld);
    this.sun.position.copy(this.center).addScaledVector(atm.lightDir, 180);
    this.sun.target.position.copy(this.center);
    this.sun.target.updateMatrixWorld();
    this.sun.color.copy(atm.lightColor);
    this.sun.intensity = atm.lightIntensity;
    if (this.sun.castShadow) {
      const R = (this.hull.xMax - this.hull.xMin) / 2 + 14;
      const sc = this.sun.shadow.camera;
      if (sc.right !== R) {
        sc.left = -R;
        sc.right = R;
        sc.top = R;
        sc.bottom = -R;
        sc.near = 20;
        sc.far = 180 + R + 40;
        sc.updateProjectionMatrix();
      }
    }
    this.hemi.color.copy(atm.hemiSky);
    this.hemi.groundColor.copy(atm.hemiGround);
    this.hemi.intensity = atm.hemiIntensity;
    this.fog.color.copy(atm.fogColor);
    this.fog.density = atm.fogDensity;
    (this.scene.background as THREE.Color).copy(atm.fogColor);

    // --- Cielo, nubes ---
    this.sky.aurora = reg.id === 'boreal' ? 1 : 0;
    this.sky.update(atm, this.camPos, dt, hourOf(state.time), this.renderer.getPixelRatio());
    if (newSim) this.clouds.snap(num(w.cloudiness, 0.2));
    const windSpeed = this.waves.wind * 7;
    const wx = Math.cos(this.waves.windDir) * windSpeed;
    const wz = Math.sin(this.waves.windDir) * windSpeed;
    this.clouds.update(dt, ds, wx, wz, num(w.cloudiness, 0.2), atm);

    // --- Océano ---
    const u = this.ocean.uniforms;
    u.uShallow.value.copy(atm.waterShallow);
    u.uDeep.value.copy(atm.waterDeep);
    u.uFoamCol.value.copy(atm.foam).multiplyScalar(0.9);
    u.uSkyZen.value.copy(atm.zenith);
    u.uSkyHor.value.copy(atm.horizon);
    u.uSkyHorSun.value.copy(atm.horizonSun);
    u.uSunDirW.value.copy(atm.sunDir);
    u.uSunCol.value.copy(atm.sunColor).multiplyScalar(atm.day * (1 - atm.overcast * 0.9) * (1 - atm.fogAmount));
    u.uAlgae.value += ((reg.id === 'sargazos' ? 1 : 0) - u.uAlgae.value) * (1 - Math.exp(-dt / 6));
    u.uReflect.value = 0.4 + 0.15 * atm.day;
    const crest = THREE.MathUtils.smoothstep(this.waves.wind, 0.25, 0.95) * 0.85 + atm.storm * 0.35;
    this.ocean.sync(this.waves, this.shipRoot.matrixWorld, crest);
    // Destellos del sol (o de la luna) en las facetas: el pico de Blinn-Phong se normaliza con la
    // intensidad de la luz para que el reflejo sea un camino de destellos (no una mancha blanca)
    // tanto a mediodía como al ocaso o con luna. Sin disco visible (nubes, niebla) no hay
    // destellos: `uGlint` apaga todo el término, también el Fresnel rasante (ver ocean.ts).
    const peak = ((0.5 * this.ocean.material.shininess + 1) / Math.PI) * Math.max(0.3, atm.lightIntensity);
    this.ocean.material.specular.setScalar(THREE.MathUtils.clamp(2 / peak, 0, 0.5));
    u.uGlint.value = atm.glint;

    // --- Lluvia y relámpagos ---
    this.rain.updateCover(layout, this.hull);
    this.rainColor.copy(atm.fogColor).lerp(atm.hemiSky, 0.3).multiplyScalar(0.85 + 0.6 * atm.day);
    this.rain.update(dt, num(w.rain, 0), wx * 1.2 - driftPerMin, wz * 1.2, this.camPos, this.shipRoot.matrixWorld, this.rainColor, WATERLINE_Y - 0.4, this.waterFn, this.renderer.getPixelRatio());

    // --- Rociones de proa con mar movido ---
    this.bow.set(this.hull.xMax - 1.5, WATERLINE_Y, 0).applyMatrix4(this.shipRoot.matrixWorld);
    const rough = THREE.MathUtils.smoothstep(this.waves.ampTotal, 0.42, 1.2);
    this.spray.update(dt, this.bow, this.waterHeight(this.bow.x, this.bow.z), rough, this.waves.wake.sf, wx, wz, Math.max(1, hullHalfWidthAt(this.hull, this.hull.xMax - 4)), this.sprayColor.copy(atm.foam).multiplyScalar(0.35 + 0.65 * atm.day), this.renderer.getPixelRatio());

    // --- Avistamientos y decorado lejano ---
    this.sightings.update(state, dt, ds, this.waterFn, atm, newSim);

    // --- Gaviotas: de día, más cerca de tierra o con banco de peces ---
    const land = reg.id === 'archipielago' || v.sightings.some((x) => x.kind === 'isla' || x.kind === 'naufragio');
    const fish = this.forceFish || state.events.active.some((e) => e.type === 'banco_peces');
    const want = (fish ? 0.9 : land ? 0.65 : 0.35) * THREE.MathUtils.smoothstep(atm.day, 0.35, 0.8) * (1 - atm.storm) * (1 - 0.6 * atm.fogAmount);
    this.birds.update(dt, want, cx);

    // --- Vida marina: peces con banco de peces; delfines con buen tiempo en aguas cálidas ---
    const warm = reg.id === 'templadas' || reg.id === 'archipielago' || reg.id === 'sargazos';
    const dolphinsOk = warm && atm.day > 0.6 && atm.storm < 0.1 && this.waves.ampTotal < 0.6 && this.waves.wake.sf > 0.4;
    this.marine.update(dt, fish, dolphinsOk, ds, this.hull, this.waves.wake.sf, this.waterFn, this.splashFn);
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, this.debugCam ?? camera);
  }

  dispose(): void {
    this.ocean.dispose();
    this.sky.dispose();
    this.clouds.dispose();
    this.rain.dispose();
    this.lightning.dispose();
    this.sightings.dispose();
    this.birds.dispose();
    this.spray.dispose();
    this.marine.dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
  }

  /* ================================================================== */
  /* Depuración                                                          */
  /* ================================================================== */

  /** Estado interno resumido (para pruebas y depuración). */
  debugInfo(): Record<string, unknown> {
    const d = this.motion.degrees;
    return {
      region: this.regionId,
      calidad: this.quality,
      cabeceo: +d.pitch.toFixed(2),
      balanceo: +d.roll.toFixed(2),
      arfada: +d.heave.toFixed(2),
      amplitud: +this.waves.ampTotal.toFixed(2),
      niebla: +this.fog.density.toFixed(5),
      luz: +this.sun.intensity.toFixed(2),
      casco: [+this.hull.xMin.toFixed(2), +this.hull.xMax.toFixed(2)],
      avistamientos: this.sightings.count,
    };
  }

  private registerDebug(): void {
    // Cámara libre en coordenadas del océano: vista(px,py,pz, tx,ty,tz[, fov]); vista() la quita.
    registerDebug('vista', ((px?: number, py = 12, pz = 30, tx = 0, ty = 3, tz = 0, fov = 55) => {
      if (px === undefined) {
        this.debugCam = null;
        return 'vista del juego';
      }
      const c = this.debugCam ?? new THREE.PerspectiveCamera(fov, 1, 0.3, 3000);
      c.fov = fov;
      c.aspect = Math.max(1, this.container.clientWidth) / Math.max(1, this.container.clientHeight);
      c.position.set(px, py, pz);
      c.lookAt(tx, ty, tz);
      c.updateProjectionMatrix();
      this.debugCam = c;
      return 'vista libre';
    }) as never);
    // Fija un clima al instante: clima('tormenta').
    registerDebug('clima', ((kind: WeatherKind) => {
      const st = this.lastState;
      const p = WEATHER_PRESETS[kind];
      if (!st || !p) return 'clima desconocido';
      Object.assign(st.weather, p, { kind, blend: 1, remaining: Math.max(st.weather.remaining, 240) });
      return kind;
    }) as never);
    // Añade un avistamiento visual: avistamiento('isla', 60, 70, 1).
    registerDebug('avistamiento', ((kind: 'naufragio' | 'isla' | 'balsa' | 'mercante' | 'estructura', x = 60, distance = 70, side: 1 | -1 = 1, name = '') => {
      const st = this.lastState;
      if (!st) return null;
      const id = st.nextId++;
      st.voyage.sightings.push({ id, kind, name: name || kind, expiresAt: st.time + 120, side, distance, x, eventId: -1 });
      return id;
    }) as never);
    registerDebug('mundo', (() => this.debugInfo()) as never);
    // Fuerza un grupo de delfines junto a la proa (pruebas visuales).
    registerDebug('delfines', ((s = 40) => this.marine.startPod(s)) as never);
    // Fuerza (o quita) el banco de peces visual: peces('si') / peces().
    registerDebug('peces', ((on?: unknown) => (this.forceFish = !!on)) as never);
    // Repuebla el decorado lejano de la región actual (pruebas visuales).
    registerDebug('decorado', (() => {
      this.sightings.populate(this.regionId);
      return this.sightings.decorCount;
    }) as never);
  }
}

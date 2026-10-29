/**
 * ATMÓSFERA: a partir de la hora, la paleta de la región (ya suavizada) y el clima calcula todos
 * los colores e intensidades del mundo: cielo (cenit/horizonte), niebla, sol, luna, luces,
 * agua, nubes y estrellas. Función pura (sin escena) para poder probarla.
 *
 * Convenciones: los colores `THREE.Color` están en el espacio de trabajo lineal de three.js.
 * El sol sale por la aleta de estribor, pasa alto por babor a mediodía y se pone por la amura de
 * babor (por delante del barco): al atardecer se navega "hacia el ocaso".
 */
import * as THREE from 'three';
import { clamp, smoothstep } from '../../core/math';
import { MINUTES_PER_DAY } from '../../sim/constants';
import { hourOf, sunElevation } from '../../sim/time';

export interface RegionColors {
  water: THREE.Color;
  waterDeep: THREE.Color;
  sky: THREE.Color;
  horizon: THREE.Color;
  fog: THREE.Color;
}

export function regionColors(p: { water: string; waterDeep: string; sky: string; horizon: string; fog: string }): RegionColors {
  return {
    water: new THREE.Color(p.water),
    waterDeep: new THREE.Color(p.waterDeep),
    sky: new THREE.Color(p.sky),
    horizon: new THREE.Color(p.horizon),
    fog: new THREE.Color(p.fog),
  };
}

/** Acerca una paleta a otra (transición suave entre regiones). */
export function lerpRegionColors(cur: RegionColors, target: RegionColors, t: number): void {
  cur.water.lerp(target.water, t);
  cur.waterDeep.lerp(target.waterDeep, t);
  cur.sky.lerp(target.sky, t);
  cur.horizon.lerp(target.horizon, t);
  cur.fog.lerp(target.fog, t);
}

export interface WeatherLook {
  cloudiness: number;
  rain: number;
  fog: number;
  wind: number;
  /** >0 durante un relámpago (destello 0..1 ya normalizado). */
  flash: number;
}

export interface Atmosphere {
  sunDir: THREE.Vector3;
  moonDir: THREE.Vector3;
  /** Elevación solar normalizada (−1..1). */
  sunElev: number;
  /** 0 noche … 1 día. */
  day: number;
  /** Intensidad del tono dorado del amanecer/atardecer (0..1). */
  golden: number;
  /** Cobertura gris del cielo (0..1). */
  overcast: number;
  /** Fuerza de tormenta (0..1). */
  storm: number;
  zenith: THREE.Color;
  horizon: THREE.Color;
  /** Horizonte en la dirección del sol (anaranjado al atardecer). */
  horizonSun: THREE.Color;
  fogColor: THREE.Color;
  fogDensity: number;
  /** Niebla del clima (0..1), para el cielo. */
  fogAmount: number;
  sunColor: THREE.Color;
  /** Visibilidad del disco solar y su halo (0..1). */
  sunDisk: number;
  moonColor: THREE.Color;
  moonDisk: number;
  /** Fase lunar 0..1 (0 nueva, 0,5 llena). */
  moonPhase: number;
  /** Luz direccional (sol o luna). */
  lightDir: THREE.Vector3;
  lightColor: THREE.Color;
  lightIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  waterShallow: THREE.Color;
  waterDeep: THREE.Color;
  foam: THREE.Color;
  cloudColor: THREE.Color;
  /** Brillo propio de las nubes (tinte del ocaso). */
  cloudGlow: THREE.Color;
  starAlpha: number;
  /** Destello de relámpago 0..1. */
  flash: number;
}

export function createAtmosphere(): Atmosphere {
  return {
    sunDir: new THREE.Vector3(0, 1, 0),
    moonDir: new THREE.Vector3(0, -1, 0),
    sunElev: 1,
    day: 1,
    golden: 0,
    overcast: 0,
    storm: 0,
    zenith: new THREE.Color(),
    horizon: new THREE.Color(),
    horizonSun: new THREE.Color(),
    fogColor: new THREE.Color(),
    fogDensity: 0.0007,
    fogAmount: 0,
    sunColor: new THREE.Color(),
    sunDisk: 1,
    moonColor: new THREE.Color(),
    moonDisk: 0,
    moonPhase: 0.5,
    lightDir: new THREE.Vector3(0, 1, 0),
    lightColor: new THREE.Color(),
    lightIntensity: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 1,
    waterShallow: new THREE.Color(),
    waterDeep: new THREE.Color(),
    foam: new THREE.Color(),
    cloudColor: new THREE.Color(),
    cloudGlow: new THREE.Color(),
    starAlpha: 0,
    flash: 0,
  };
}

/* Colores fijos de la dirección artística (sRGB → lineal al construirlos). */
const C = {
  zenithDeep: new THREE.Color('#2f7fc4'),
  nightZenith: new THREE.Color('#06111f'),
  nightHorizon: new THREE.Color('#1d3557'),
  nightFog: new THREE.Color('#122238'),
  goldZenith: new THREE.Color('#4d63a0'),
  goldHorizonSun: new THREE.Color('#ff9348'),
  goldHorizon: new THREE.Color('#d58e95'),
  goldFog: new THREE.Color('#d9a385'),
  greySky: new THREE.Color('#7b8791'),
  greyHorizon: new THREE.Color('#b4bcc0'),
  stormSky: new THREE.Color('#3f4a54'),
  stormHorizon: new THREE.Color('#5e6a72'),
  mist: new THREE.Color('#c3cdd0'),
  sunLow: new THREE.Color('#ff8a45'),
  sunHigh: new THREE.Color('#fff2dd'),
  moon: new THREE.Color('#9db4e0'),
  moonDisk: new THREE.Color('#f1eee0'),
  foam: new THREE.Color('#e8f4f2'),
  stormWater: new THREE.Color('#3b4d57'),
  cloudDay: new THREE.Color('#ffffff'),
  cloudGrey: new THREE.Color('#c3c9cd'),
  cloudStorm: new THREE.Color('#59636b'),
  white: new THREE.Color('#ffffff'),
  nightAmbient: new THREE.Color('#3d5f93'),
};

/** Elevación máxima del sol a mediodía (rad). */
const SUN_MAX_ELEV = THREE.MathUtils.degToRad(62);
/** Azimut del ocaso (rad, 0 = proa, +π/2 = estribor). */
const SUNSET_AZ = -0.45;

/** Dirección del sol (unitaria, hacia el sol) para un minuto de juego. */
export function sunDirection(time: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = sunElevation(time);
  const el = Math.asin(clamp(e, -1, 1)) * (SUN_MAX_ELEV / (Math.PI / 2));
  // Progreso del arco diurno 0 (6:00) .. 1 (18:30); continúa por debajo del horizonte de noche.
  const p = (hourOf(time) - 6) / 12.5;
  const az = SUNSET_AZ - Math.PI + p * Math.PI;
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

/** Dirección de la luna: opuesta al sol, algo desplazada, alta a medianoche. */
export function moonDirection(time: number, out = new THREE.Vector3()): THREE.Vector3 {
  const e = -sunElevation(time);
  const el = Math.asin(clamp(e, -1, 1)) * THREE.MathUtils.degToRad(55) / (Math.PI / 2);
  const p = (hourOf(time) - 18.5) / 11.5;
  const az = SUNSET_AZ + 0.5 - Math.PI + p * Math.PI;
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
}

/** Fase lunar (0 nueva, 0,5 llena) según el día de juego; empieza en cuarto creciente. */
export function moonPhase(time: number): number {
  const days = time / MINUTES_PER_DAY + 9;
  return (((days / 29.53) % 1) + 1) % 1;
}

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function lum(c: THREE.Color): number {
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Desatura hacia gris conservando algo de luminancia y lo mezcla con `grey` según `t`. */
function toGrey(c: THREE.Color, grey: THREE.Color, t: number): void {
  const l = lum(c);
  tmpA.setRGB(l, l, l).lerp(grey, 0.6);
  c.lerp(tmpA, t);
}

/** Calcula la atmósfera completa. `out` se reutiliza entre frames. */
export function computeAtmosphere(time: number, region: RegionColors, w: WeatherLook, out: Atmosphere): Atmosphere {
  const e = sunElevation(time);
  out.sunElev = e;
  sunDirection(time, out.sunDir);
  moonDirection(time, out.moonDir);
  // Crepúsculo largo: a las 19 h (sol ya bajo el horizonte) el cielo aún arde en naranjas.
  const day = smoothstep(-0.3, 0.25, e);
  const golden = smoothstep(-0.34, -0.08, e) * (1 - smoothstep(0.08, 0.36, e));
  const overcast = smoothstep(0.3, 1.0, w.cloudiness);
  const storm = smoothstep(0.55, 1.0, w.wind) * smoothstep(0.3, 0.9, w.rain);
  const fog = clamp(w.fog, 0, 1);
  out.day = day;
  out.golden = golden;
  out.overcast = overcast;
  out.storm = storm;
  out.fogAmount = fog;
  out.flash = clamp(w.flash, 0, 1);

  // --- Cielo base (noche ↔ día) ---
  const dayZenith = tmpB.copy(region.sky).lerp(C.zenithDeep, 0.3);
  out.zenith.copy(C.nightZenith).lerp(dayZenith, day);
  out.horizon.copy(C.nightHorizon).lerp(region.horizon, day);
  out.fogColor.copy(C.nightFog).lerp(tmpA.copy(region.fog).lerp(region.horizon, 0.25), day);
  // Dorado del amanecer / atardecer.
  out.zenith.lerp(C.goldZenith, golden * 0.55);
  out.horizon.lerp(C.goldHorizon, golden * 0.75);
  out.horizonSun.copy(out.horizon).lerp(C.goldHorizonSun, golden * 0.95);
  out.fogColor.lerp(C.goldFog, golden * 0.6);

  // --- Nubes y tormenta ---
  const lightLevel = 0.25 + 0.75 * day;
  toGrey(out.zenith, tmpB.copy(C.greySky).multiplyScalar(lightLevel), overcast * 0.8);
  toGrey(out.horizon, tmpB.copy(C.greyHorizon).multiplyScalar(lightLevel), overcast * 0.7);
  toGrey(out.horizonSun, tmpB.copy(C.greyHorizon).multiplyScalar(lightLevel), overcast * 0.6);
  toGrey(out.fogColor, tmpB.copy(C.greyHorizon).multiplyScalar(lightLevel), overcast * 0.6);
  out.zenith.lerp(tmpB.copy(C.stormSky).multiplyScalar(lightLevel), storm * 0.85);
  out.horizon.lerp(tmpB.copy(C.stormHorizon).multiplyScalar(lightLevel), storm * 0.8);
  out.horizonSun.lerp(tmpB.copy(C.stormHorizon).multiplyScalar(lightLevel), storm * 0.8);
  out.fogColor.lerp(tmpB.copy(C.stormHorizon).multiplyScalar(lightLevel), storm * 0.8);

  // La lluvia oscurece el cielo y la luz.
  const gloom = 1 - 0.28 * clamp(w.rain, 0, 1) * overcast;
  out.zenith.multiplyScalar(gloom);
  out.horizon.multiplyScalar(gloom);
  out.horizonSun.multiplyScalar(gloom);
  out.fogColor.multiplyScalar(0.5 + 0.5 * gloom);

  // --- Niebla del clima: el cielo se blanquea hacia la bruma ---
  const mist = tmpB.copy(C.mist).multiplyScalar(0.18 + 0.82 * day).lerp(out.fogColor, 0.35);
  out.fogColor.lerp(mist, fog * 0.85);
  out.zenith.lerp(out.fogColor, fog * 0.7);
  out.horizon.lerp(out.fogColor, fog * 0.85);
  out.horizonSun.lerp(out.fogColor, fog * 0.8);
  // El destello del relámpago también aclara la bruma (si no, se vería una línea en el horizonte).
  if (out.flash > 0) {
    tmpA.copy(out.fogColor).convertLinearToSRGB();
    tmpA.r += 0.15 * out.flash;
    tmpA.g += 0.165 * out.flash;
    tmpA.b += 0.21 * out.flash;
    out.fogColor.copy(tmpA).convertSRGBToLinear();
  }
  out.fogDensity = 0.00045 + 0.0026 * w.rain + 0.0012 * overcast * w.rain + 0.0135 * fog * fog + 0.0018 * storm;

  // --- Sol y luna ---
  out.sunColor.copy(C.sunLow).lerp(C.sunHigh, smoothstep(0.02, 0.45, e));
  // El sol se apaga justo cuando la luna empieza a iluminar (e = −0,2): sin saltos de luz.
  const sunVis = smoothstep(-0.2, 0.1, e);
  out.sunDisk = clamp((1 - overcast * 0.92) * (1 - fog * 0.85) * smoothstep(-0.08, 0.0, e), 0, 1);
  const phase = moonPhase(time);
  out.moonPhase = phase;
  const illum = 0.5 * (1 - Math.cos(phase * Math.PI * 2));
  out.moonColor.copy(C.moonDisk);
  const moonUp = smoothstep(-0.05, 0.08, out.moonDir.y);
  out.moonDisk = moonUp * (1 - day) * (1 - overcast * 0.9) * (1 - fog * 0.85);
  const sunInt = 3.1 * sunVis * (1 - 0.72 * overcast) * (1 - 0.35 * storm) * (1 - 0.55 * fog);
  const moonInt = 1.05 * (1 - smoothstep(-0.36, -0.2, e)) * (0.45 + 0.55 * illum) * moonUp * (1 - 0.75 * overcast);
  if (e > -0.2) {
    out.lightDir.copy(out.sunDir);
    out.lightColor.copy(out.sunColor);
    out.lightIntensity = sunInt;
  } else {
    out.lightDir.copy(out.moonDir);
    out.lightColor.copy(C.moon);
    out.lightIntensity = moonInt;
  }
  // Luz rasante: no dejar que la dirección baje del horizonte (sombras infinitas).
  if (out.lightDir.y < 0.08) {
    out.lightDir.y = 0.08;
    out.lightDir.normalize();
  }

  // --- Luz ambiente de cielo y mar ---
  out.hemiSky.copy(out.zenith).lerp(C.white, 0.3 * day).lerp(out.horizon, 0.3).lerp(C.nightAmbient, (1 - day) * 0.55);
  out.hemiGround.copy(region.waterDeep).lerp(out.fogColor, 0.3).multiplyScalar(0.55 + 0.45 * day);
  out.hemiIntensity = (0.95 + 0.4 * day) * (1 - 0.2 * storm) + out.flash * 1.4;

  // --- Agua ---
  out.waterShallow.copy(region.water);
  out.waterDeep.copy(region.waterDeep);
  out.waterShallow.lerp(C.stormWater, storm * 0.5 + overcast * 0.15);
  out.waterDeep.lerp(tmpB.copy(C.stormWater).multiplyScalar(0.6), storm * 0.45 + overcast * 0.1);
  out.foam.copy(C.foam);

  // --- Nubes ---
  out.cloudColor.copy(C.cloudDay).lerp(C.cloudGrey, overcast * 0.6).lerp(C.cloudStorm, storm * 0.85);
  out.cloudColor.lerp(tmpB.copy(out.fogColor), fog * 0.5);
  // De noche las nubes son siluetas azuladas; al ocaso se tiñen del horizonte.
  out.cloudColor.multiplyScalar(0.45 + 0.55 * day);
  out.cloudGlow.copy(out.horizonSun).multiplyScalar(golden * 0.35 * (1 - overcast * 0.6));

  // --- Estrellas ---
  out.starAlpha = (1 - smoothstep(-0.4, -0.14, e)) * (1 - 0.95 * overcast) * (1 - fog);
  return out;
}

/** Componentes sRGB de un color lineal (para shaders que escriben directamente en pantalla). */
export function toSRGB(c: THREE.Color, out: THREE.Vector3): THREE.Vector3 {
  tmpA.copy(c).convertLinearToSRGB();
  return out.set(tmpA.r, tmpA.g, tmpA.b);
}

/** Utilidades de reloj. `time` = minutos de juego desde el día 1 a las 00:00. */
import { MINUTES_PER_DAY } from './constants';
import { clamp, smoothstep } from '../core/math';

export const dayOf = (time: number): number => Math.floor(time / MINUTES_PER_DAY) + 1;
export const minuteOfDay = (time: number): number => ((time % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
/** Hora decimal 0..24. */
export const hourOf = (time: number): number => minuteOfDay(time) / 60;

export function clockText(time: number): string {
  const m = Math.floor(minuteOfDay(time));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Elevación solar normalizada: 1 a mediodía, 0 en el horizonte (6:00 y 18:30), negativa de noche. */
export function sunElevation(time: number): number {
  const h = hourOf(time);
  // Amanecer 6:00, mediodía 12:15, ocaso 18:30.
  return Math.sin(((h - 6) / 12.5) * Math.PI);
}

/** Luz diurna 0..1 (suave en amanecer/ocaso). */
export function daylight(time: number): number {
  return clamp(smoothstep(-0.12, 0.25, sunElevation(time)), 0, 1);
}

export const isNight = (time: number): boolean => daylight(time) < 0.15;

/** Fase del día para textos de UI. */
export function dayPhase(time: number): 'madrugada' | 'amanecer' | 'mañana' | 'tarde' | 'atardecer' | 'noche' {
  const h = hourOf(time);
  if (h < 5) return 'madrugada';
  if (h < 7.5) return 'amanecer';
  if (h < 13) return 'mañana';
  if (h < 18) return 'tarde';
  if (h < 20.5) return 'atardecer';
  return 'noche';
}

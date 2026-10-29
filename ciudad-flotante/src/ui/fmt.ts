/**
 * Formato de textos de la interfaz (puro, sin DOM): horas, duraciones, cantidades, fechas.
 */
import { ITEMS } from '../data/items';
import type { ItemId } from '../sim/types';
import { clockText, dayOf } from '../sim/time';

/** "Día 3 · 14:05" */
export function dayClock(time: number): string {
  return `Día ${dayOf(time)} · ${clockText(time)}`;
}

/** "45 min", "1 h 30 min", "3 h" (minutos de juego). */
export function duration(minutes: number): string {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h >= 48 && r === 0) return `${Math.round(h / 24)} días`;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "hace 5 min", "hace 2 h", "ayer 14:20", "día 3 · 09:10" respecto a `now` (minutos de juego). */
export function agoText(at: number, now: number): string {
  const d = now - at;
  if (d < 1) return 'ahora';
  if (d < 60) return `hace ${Math.round(d)} min`;
  if (d < 6 * 60) return `hace ${Math.round(d / 60)} h`;
  const dayAt = dayOf(at);
  const dayNow = dayOf(now);
  if (dayAt === dayNow) return `hoy ${clockText(at)}`;
  if (dayAt === dayNow - 1) return `ayer ${clockText(at)}`;
  return `día ${dayAt} · ${clockText(at)}`;
}

/** Fecha real corta para guardados: "12 mar, 18:40". */
export function realDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]}, ${hh}:${mm}`;
}

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? id;
}

/** "3× Madera" */
export function qtyName(id: ItemId, qty: number): string {
  return `${qty}× ${itemName(id)}`;
}

/** Lista "3× Madera, 2× Cuerda". */
export function stacksText(rec: Record<ItemId, number>): string {
  return Object.entries(rec)
    .map(([id, n]) => qtyName(id, n))
    .join(', ');
}

/** Número con un decimal solo si hace falta: 2 → "2", 2.46 → "2,5". */
export function num(v: number, decimals = 1): string {
  if (!Number.isFinite(v)) return '—';
  const r = Number(v.toFixed(decimals));
  return Number.isInteger(r) ? String(r) : r.toFixed(decimals).replace('.', ',');
}

/** Porcentaje entero "73 %". */
export function pct(v01: number): string {
  return `${Math.round(Math.max(0, Math.min(1, v01)) * 100)} %`;
}

/** Signo explícito: +3, −2 (con signo menos tipográfico). */
export function signed(v: number, decimals = 0): string {
  const r = Number(v.toFixed(decimals));
  if (r > 0) return `+${num(r, decimals)}`;
  if (r < 0) return `−${num(-r, decimals)}`;
  return '0';
}

/** Mayúscula inicial. */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Nombre corto de un plano ("Plano: Energía" → "Energía"). */
export function blueprintShort(name: string): string {
  return name.replace(/^Plano:\s*/i, '');
}

/** Nombre de una tecla (KeyboardEvent.code) para mostrarla. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Espacio',
    ShiftLeft: 'Mayús',
    ShiftRight: 'Mayús',
    Escape: 'Esc',
    Tab: 'Tab',
    Mouse0: 'Clic',
    Mouse2: 'Clic der.',
  };
  return map[code] ?? code;
}

/**
 * Estadísticas EFECTIVAS de un módulo según su nivel de mejora. Todos los sistemas deben leer
 * capacidades, producciones y multiplicadores a través de estas funciones (no de `moduleDef`
 * directamente) para que las mejoras tengan efecto.
 */
import { moduleDef, type ModuleEffects, type UpgradeDef } from '../data/modules';
import type { ModuleInstance } from './types';

type NumericBase = 'storageSlots' | 'fuelSlots' | 'waterCapacity' | 'waterGen' | 'powerGen' | 'powerUse' | 'batteryKWh' | 'comfort' | 'speedBonus';
type Mult = 'workSpeed' | 'fuelEfficiency' | 'growthMult' | 'waterUseMult' | 'healMult' | 'wearMult';

export function moduleTier(m: Pick<ModuleInstance, 'tier'>): number {
  const t = Math.floor(Number(m.tier ?? 1));
  return Number.isFinite(t) && t >= 1 ? t : 1;
}

/** Efectos acumulados hasta el nivel actual (cada nivel sustituye los valores del anterior). */
export function tierEffects(m: Pick<ModuleInstance, 'type' | 'tier'>): ModuleEffects {
  const def = moduleDef(m.type);
  const t = moduleTier(m);
  const out: ModuleEffects = {};
  for (const u of def.upgrades ?? []) if (u.tier <= t) Object.assign(out, u.effects);
  return out;
}

/** Valor numérico efectivo (capacidades, producciones). 0 si el módulo no lo tiene. */
export function moduleStat(m: Pick<ModuleInstance, 'type' | 'tier'>, key: NumericBase): number {
  const eff = tierEffects(m)[key];
  if (eff !== undefined) return eff;
  return (moduleDef(m.type)[key] as number | undefined) ?? 0;
}

/** Multiplicador efectivo (1 si no hay mejora que lo cambie). */
export function moduleMult(m: Pick<ModuleInstance, 'type' | 'tier'>, key: Mult): number {
  return tierEffects(m)[key] ?? 1;
}

/** Siguiente mejora disponible (o null si está al máximo). */
export function nextUpgrade(m: Pick<ModuleInstance, 'type' | 'tier'>): UpgradeDef | null {
  const t = moduleTier(m);
  return (moduleDef(m.type).upgrades ?? []).find((u) => u.tier === t + 1) ?? null;
}

/** Nombre a mostrar del módulo según su nivel ("Almacén con altillo"). */
export function moduleDisplayName(m: Pick<ModuleInstance, 'type' | 'tier'>): string {
  const t = moduleTier(m);
  const def = moduleDef(m.type);
  const u = (def.upgrades ?? []).filter((x) => x.tier <= t).pop();
  return u ? u.name : def.name;
}

/** Nivel máximo posible del módulo. */
export function maxTier(type: string): number {
  return Math.max(1, ...(moduleDef(type).upgrades ?? []).map((u) => u.tier));
}

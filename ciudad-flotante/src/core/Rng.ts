/**
 * Generador pseudoaleatorio determinista (mulberry32) con estado serializable.
 * La simulación usa SIEMPRE este RNG (nunca Math.random) para que las partidas
 * guardadas y los tests sean reproducibles.
 */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }

  /** Número en [0, 1). */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: array vacío');
    return arr[Math.floor(this.next() * arr.length)]!;
  }

  /** Elige una clave según pesos (pesos <= 0 se ignoran). Devuelve null si no hay candidatos. */
  weighted<T extends string>(weights: Partial<Record<T, number>>): T | null {
    let total = 0;
    for (const k in weights) {
      const w = weights[k] ?? 0;
      if (w > 0) total += w;
    }
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const k in weights) {
      const w = weights[k] ?? 0;
      if (w <= 0) continue;
      r -= w;
      if (r <= 0) return k;
    }
    for (const k in weights) if ((weights[k] ?? 0) > 0) return k;
    return null;
  }
}

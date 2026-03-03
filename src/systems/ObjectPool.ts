/**
 * OBJECT POOLING SYSTEM
 * Efficiently reuse objects to avoid garbage collection overhead.
 * Crucial for scaling to 100+ enemies.
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private active: Set<T> = new Set();

  constructor(
    private factory: () => T,
    private reset: (obj: T) => void,
    initialSize: number = 10
  ) {
    // Pre-create objects to reduce runtime allocation
    for (let i = 0; i < initialSize; i++) {
      this.available.push(this.factory());
    }
  }

  /**
   * Retrieves an object from the pool.
   * Creates a new one if the pool is empty (pool growing).
   */
  get(): T {
    let obj: T;
    if (this.available.length > 0) {
      obj = this.available.pop()!;
    } else {
      // Pool empty, create new instance
      obj = this.factory();
    }
    this.active.add(obj);
    return obj;
  }

  /**
   * Releases an object back into the pool for future reuse.
   */
  release(obj: T): void {
    if (this.active.has(obj)) {
      this.active.delete(obj);
      this.reset(obj);
      this.available.push(obj);
    }
  }

  get activeCount(): number {
    return this.active.size;
  }

  get availableCount(): number {
    return this.available.length;
  }
}

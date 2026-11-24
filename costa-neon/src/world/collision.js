// Colisiones estáticas: grilla espacial de cajas (AABB con rango Y) y cilindros verticales.
import { WATER_LEVEL } from './map.js';

const MIN_X = -720, MIN_Z = -720, MAX_X = 1240, MAX_Z = 820;

export class CollisionWorld {
  constructor(world, cell = 16) {
    this.world = world;
    this.cell = cell;
    this.nx = Math.ceil((MAX_X - MIN_X) / cell);
    this.nz = Math.ceil((MAX_Z - MIN_Z) / cell);
    this.cells = new Array(this.nx * this.nz);
    this.list = [];
    this.stamp = 1;
    for (const c of world.colliders) this.add(c);
    // Árboles, faroles y mobiliario rompible
    for (const t of world.trees) {
      if (t.planter) this.add({ kind: 'cyl', x: t.x, z: t.z, r: 0.95, minY: -1, maxY: 0.9, type: 'prop' });
      else this.add({ kind: 'cyl', x: t.x, z: t.z, r: t.type === 'palm' ? 0.28 * t.s + 0.08 : 0.4 * t.s, minY: -1, maxY: 9, type: 'tree' });
    }
    for (const l of world.lamps) this.add({ kind: 'cyl', x: l.x, z: l.z, r: 0.17, minY: (l.y || 0) - 1, maxY: 8, type: 'lamp', breakable: true, ref: l, group: 'lamps', index: l.id });
    world.props.hydrants.forEach((h, i) => this.add({ kind: 'cyl', x: h.x, z: h.z, r: 0.22, minY: -1, maxY: 0.9, type: 'hydrant', breakable: true, ref: h, group: 'hydrants', index: i }));
    world.props.bins.forEach((h, i) => this.add({ kind: 'cyl', x: h.x, z: h.z, r: 0.32, minY: -1, maxY: 1.1, type: 'bin', breakable: true, ref: h, group: 'bins', index: i }));
    world.props.benches.forEach((h, i) => this.add({ kind: 'cyl', x: h.x, z: h.z, r: 0.7, minY: -1, maxY: 0.9, type: 'bench', breakable: true, ref: h, group: 'benches', index: i }));
  }

  _bounds(c) {
    if (c.kind === 'box') return [c.minX, c.minZ, c.maxX, c.maxZ];
    return [c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r];
  }

  add(c) {
    c._stamp = 0;
    this.list.push(c);
    const [x0, z0, x1, z1] = this._bounds(c);
    const i0 = Math.max(0, Math.floor((x0 - MIN_X) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((x1 - MIN_X) / this.cell));
    const j0 = Math.max(0, Math.floor((z0 - MIN_Z) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((z1 - MIN_Z) / this.cell));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = i * this.nz + j;
        (this.cells[k] || (this.cells[k] = [])).push(c);
      }
    return c;
  }

  /** Itera colisionadores que tocan el rectángulo. fn(c) puede devolver true para cortar. */
  query(x0, z0, x1, z1, fn) {
    const st = ++this.stamp;
    const i0 = Math.max(0, Math.floor((x0 - MIN_X) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((x1 - MIN_X) / this.cell));
    const j0 = Math.max(0, Math.floor((z0 - MIN_Z) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((z1 - MIN_Z) / this.cell));
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const arr = this.cells[i * this.nz + j];
        if (!arr) continue;
        for (let n = 0; n < arr.length; n++) {
          const c = arr[n];
          if (c._stamp === st || c.disabled) continue;
          c._stamp = st;
          if (fn(c)) return;
        }
      }
  }

  /**
   * Empuja un círculo fuera de los colisionadores que se solapan en el rango vertical [y0,y1].
   * opts.boat: incluye muelles/pilotes; opts.ignoreBreakable: atraviesa lo rompible.
   * Devuelve { x, z, hit, nx, nz, depth, collider, hits[] }.
   */
  resolveCircle(x, z, r, y0, y1, opts = {}) {
    const res = { x, z, hit: false, nx: 0, nz: 0, depth: 0, collider: null, hits: null };
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(res.x - r, res.z - r, res.x + r, res.z + r, (c) => {
        if (c.boatOnly && !opts.boat) return;
        if (c.maxY <= y0 || c.minY >= y1) return;
        if (opts.ignoreBreakable && c.breakable) {
          if (opts.onBreakable) {
            const d = c.kind === 'cyl' ? Math.hypot(res.x - c.x, res.z - c.z) - c.r : 1;
            if (d < r) opts.onBreakable(c);
          }
          return;
        }
        let px, pz, dist, nx, nz, depth;
        if (c.kind === 'box') {
          px = Math.max(c.minX, Math.min(res.x, c.maxX));
          pz = Math.max(c.minZ, Math.min(res.z, c.maxZ));
          const dx = res.x - px, dz = res.z - pz;
          dist = Math.hypot(dx, dz);
          if (dist >= r) return;
          if (dist > 1e-6) {
            nx = dx / dist;
            nz = dz / dist;
            depth = r - dist;
          } else {
            // centro dentro de la caja: salir por la cara más cercana
            const dl = res.x - c.minX, dr = c.maxX - res.x, dn = res.z - c.minZ, ds = c.maxZ - res.z;
            const m = Math.min(dl, dr, dn, ds);
            if (m === dl) { nx = -1; nz = 0; depth = dl + r; }
            else if (m === dr) { nx = 1; nz = 0; depth = dr + r; }
            else if (m === dn) { nx = 0; nz = -1; depth = dn + r; }
            else { nx = 0; nz = 1; depth = ds + r; }
          }
        } else {
          const dx = res.x - c.x, dz = res.z - c.z;
          dist = Math.hypot(dx, dz);
          const rr = r + c.r;
          if (dist >= rr) return;
          if (dist > 1e-6) {
            nx = dx / dist;
            nz = dz / dist;
          } else {
            nx = 1;
            nz = 0;
          }
          depth = rr - dist;
        }
        res.x += nx * depth;
        res.z += nz * depth;
        res.hit = true;
        moved = true;
        if (depth > res.depth) {
          res.depth = depth;
          res.nx = nx;
          res.nz = nz;
          res.collider = c;
        }
        if (opts.collect) (res.hits || (res.hits = [])).push({ c, nx, nz, depth });
      });
      if (!moved) break;
    }
    return res;
  }

  /** ¿El círculo se solapa con algo sólido? */
  overlapsCircle(x, z, r, y0, y1) {
    let hit = false;
    this.query(x - r, z - r, x + r, z + r, (c) => {
      if (c.boatOnly || c.maxY <= y0 || c.minY >= y1) return;
      if (c.kind === 'box') {
        const px = Math.max(c.minX, Math.min(x, c.maxX)), pz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if (Math.hypot(x - px, z - pz) < r) hit = true;
      } else if (Math.hypot(x - c.x, z - c.z) < r + c.r) hit = true;
      return hit;
    });
    return hit;
  }

  /**
   * Raycast 3D contra colisionadores y el suelo. Devuelve { t, x, y, z, nx, ny, nz, collider, ground, water } o null.
   * opts.ignoreGround, opts.ignoreTrees, opts.ignoreBreakable, opts.water (detenerse en la superficie del agua)
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    let best = maxDist, hit = null;
    const st = ++this.stamp;
    const cell = this.cell;
    // DDA en XZ
    let ix = Math.floor((ox - MIN_X) / cell), iz = Math.floor((oz - MIN_Z) / cell);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? cell / Math.abs(dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? cell / Math.abs(dz) : Infinity;
    const nextBX = MIN_X + (ix + (stepX > 0 ? 1 : 0)) * cell;
    const nextBZ = MIN_Z + (iz + (stepZ > 0 ? 1 : 0)) * cell;
    let tMaxX = Math.abs(dx) > 1e-9 ? (nextBX - ox) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? (nextBZ - oz) / dz : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 400 && tCell <= best; guard++) {
      if (ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz) {
        const arr = this.cells[ix * this.nz + iz];
        if (arr)
          for (let n = 0; n < arr.length; n++) {
            const c = arr[n];
            if (c._stamp === st || c.disabled) continue;
            c._stamp = st;
            if (c.boatOnly && !opts.boat) continue;
            if (opts.ignoreTrees && c.type === 'tree') continue;
            if (opts.ignoreBreakable && c.breakable) continue;
            if (opts.ignoreSmall && (c.type === 'lamp' || c.type === 'pole' || c.type === 'tree' || c.breakable)) continue;
            const r = c.kind === 'box' ? rayBox(ox, oy, oz, dx, dy, dz, c) : rayCyl(ox, oy, oz, dx, dy, dz, c);
            if (r && r.t >= 0 && r.t < best) {
              best = r.t;
              hit = { t: r.t, nx: r.nx, ny: r.ny, nz: r.nz, collider: c };
            }
          }
      } else if ((ix < 0 && stepX < 0) || (iz < 0 && stepZ < 0) || (ix >= this.nx && stepX > 0) || (iz >= this.nz && stepZ > 0)) break;
      if (tMaxX < tMaxZ) {
        tCell = tMaxX;
        tMaxX += tDeltaX;
        ix += stepX;
      } else {
        tCell = tMaxZ;
        tMaxZ += tDeltaZ;
        iz += stepZ;
      }
    }
    // Suelo / agua
    if (!opts.ignoreGround && dy < -1e-4) {
      const g = this._rayGround(ox, oy, oz, dx, dy, dz, best, opts);
      if (g && g.t < best) {
        best = g.t;
        hit = g;
      }
    }
    if (!hit) return null;
    hit.x = ox + dx * hit.t;
    hit.y = oy + dy * hit.t;
    hit.z = oz + dz * hit.t;
    return hit;
  }

  _rayGround(ox, oy, oz, dx, dy, dz, maxT, opts) {
    const W = this.world;
    // Avanza por pasos y refina por bisección contra groundAt / nivel del agua
    const surf = (x, z) => {
      const g = W.groundAt(x, z);
      return opts.water !== false && g < WATER_LEVEL ? WATER_LEVEL : g;
    };
    const step = 2.5;
    let tPrev = 0, fPrev = oy - surf(ox, oz);
    if (fPrev < 0) return null;
    const tEnd = Math.min(maxT, 600);
    for (let t = step; t <= tEnd + step; t += step) {
      const tt = Math.min(t, tEnd);
      const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
      const f = y - surf(x, z);
      if (f <= 0) {
        let a = tPrev, b = tt;
        for (let k = 0; k < 10; k++) {
          const m = (a + b) / 2;
          const fm = oy + dy * m - surf(ox + dx * m, oz + dz * m);
          if (fm > 0) a = m;
          else b = m;
        }
        const hx = ox + dx * b, hz = oz + dz * b;
        const water = opts.water !== false && W.groundAt(hx, hz) < WATER_LEVEL;
        return { t: b, nx: 0, ny: 1, nz: 0, collider: null, ground: true, water };
      }
      tPrev = tt;
      fPrev = f;
      if (tt >= tEnd) break;
    }
    return null;
  }

  lineOfSight(ax, ay, az, bx, by, bz, opts = {}) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.01) return true;
    const h = this.raycast(ax, ay, az, dx, dy, dz, d - 0.2, { ignoreTrees: true, ignoreBreakable: true, ...opts });
    return !h;
  }

  /** Techo (o suelo) más alto bajo (x,z) que no supere y+step. Para aterrizar y caminar sobre azoteas. */
  surfaceBelow(x, z, y, step = 0.6) {
    let h = this.world.groundAt(x, z);
    this.query(x - 0.01, z - 0.01, x + 0.01, z + 0.01, (c) => {
      if (c.boatOnly || c.type !== 'building' && c.type !== 'ship' && c.type !== 'prop') return;
      if (c.maxY > y + step || c.maxY <= h) return;
      if (c.kind === 'box') {
        if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) h = c.maxY;
      } else if (Math.hypot(x - c.x, z - c.z) <= c.r) h = c.maxY;
    });
    return h;
  }

  /** Busca un punto libre en un radio. */
  findFreeSpot(x, z, r, y0 = 0, y1 = 2, tries = 24) {
    if (!this.overlapsCircle(x, z, r, y0, y1)) return { x, z };
    for (let k = 1; k <= tries; k++) {
      const a = k * 2.399, d = 1.2 * Math.sqrt(k) * r * 1.5;
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      if (!this.overlapsCircle(px, pz, r, y0, y1)) return { x: px, z: pz };
    }
    return { x, z };
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, c) {
  let tmin = -Infinity, tmax = Infinity, nAxis = -1, nSign = 0;
  const bounds = [[c.minX, c.maxX, ox, dx], [c.minY, c.maxY, oy, dy], [c.minZ, c.maxZ, oz, dz]];
  for (let a = 0; a < 3; a++) {
    const [mn, mx, o, d] = bounds[a];
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d, t2 = (mx - o) / d;
    let s = -1;
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
      s = 1;
    }
    if (t1 > tmin) {
      tmin = t1;
      nAxis = a;
      nSign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  if (tmin < 0) return { t: 0, nx: 0, ny: 0, nz: 0, inside: true };
  return { t: tmin, nx: nAxis === 0 ? nSign : 0, ny: nAxis === 1 ? nSign : 0, nz: nAxis === 2 ? nSign : 0 };
}

function rayCyl(ox, oy, oz, dx, dy, dz, c) {
  const fx = ox - c.x, fz = oz - c.z;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fz * dz);
  const cc = fx * fx + fz * fz - c.r * c.r;
  const disc = b * b - 4 * a * cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) {
    if (cc < 0) t = 0;
    else return null;
  }
  const y = oy + dy * t;
  if (y < c.minY || y > c.maxY) {
    // ¿entra por la tapa superior?
    if (dy < 0 && oy > c.maxY) {
      const tt = (c.maxY - oy) / dy;
      const px = ox + dx * tt - c.x, pz = oz + dz * tt - c.z;
      if (px * px + pz * pz <= c.r * c.r) return { t: tt, nx: 0, ny: 1, nz: 0 };
    }
    return null;
  }
  const hx = fx + dx * t, hz = fz + dz * t;
  const l = Math.hypot(hx, hz) || 1;
  return { t, nx: hx / l, ny: 0, nz: hz / l };
}

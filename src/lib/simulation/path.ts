/**
 * Lightweight navigation grid for the dining room. Tables, the bar and the
 * planters are inflated by a body radius so guests and staff walk the aisles
 * instead of crossing furniture. A* runs on a ~0.35 m grid; paths are then
 * string-pulled so movement looks natural rather than grid-stepped.
 */

export interface Point {
  x: number;
  z: number;
}

export interface NavObstacle {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The navigable floor includes the interior and the west terrace, which is
 * separated by a glass wall with a wide opening between z 0.6 and 2.8.
 */
export const ROOM = { minX: -11.4, maxX: 9.6, minZ: -7.9, maxZ: 8.8 };

/** Fixed furniture that is never walkable. */
export const FIXED_OBSTACLES: NavObstacle[] = [
  { minX: 4.15, maxX: 7.85, minZ: -6.25, maxZ: -4.05 }, // bar counter
  { minX: 4.15, maxX: 7.85, minZ: -7.9, maxZ: -6.45 }, // back bar
  // glass wall between dining room and terrace (door opening at z 0.6–2.8)
  { minX: -4.95, maxX: -4.65, minZ: -7.9, maxZ: 0.6 },
  { minX: -4.95, maxX: -4.65, minZ: 2.8, maxZ: 8.8 },
  { minX: -4.6, maxX: -3.9, minZ: -2.4, maxZ: 0.5 }, // interior planters
  { minX: -4.6, maxX: -3.9, minZ: 3.3, maxZ: 5.9 },
  { minX: -11.2, maxX: -10.9, minZ: -7.9, maxZ: -3.0 }, // terrace planters
  { minX: -11.2, maxX: -10.9, minZ: 5.6, maxZ: 8.8 },
];

/** Landmarks used by the simulation (world coordinates). */
export const LANDMARKS = {
  door: { x: 8.9, z: 7.9 },
  host: { x: 7.9, z: 6.4 },
  counter: { x: 6.7, z: -3.35 },
  pass: { x: 2.9, z: -7.2 },
  bathroom: { x: -4.1, z: -6.55 },
  kitchen: { x: 2.4, z: -7.55 },
};

const CELL = 0.35;
const BODY_RADIUS = 0.42;

export class NavGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;

  constructor(tables: { x: number; z: number; shape: "round" | "rect"; seats: number }[]) {
    this.cols = Math.ceil((ROOM.maxX - ROOM.minX) / CELL) + 1;
    this.rows = Math.ceil((ROOM.maxZ - ROOM.minZ) / CELL) + 1;
    this.blocked = new Uint8Array(this.cols * this.rows);

    for (let cx = 0; cx < this.cols; cx++) {
      for (let cz = 0; cz < this.rows; cz++) {
        const x = ROOM.minX + cx * CELL;
        const z = ROOM.minZ + cz * CELL;
        if (this.isSolid(x, z, tables)) this.blocked[cz * this.cols + cx] = 1;
      }
    }
  }

  private isSolid(x: number, z: number, tables: { x: number; z: number; shape: "round" | "rect"; seats: number }[]) {
    if (x < ROOM.minX + 0.3 || x > ROOM.maxX - 0.3 || z < ROOM.minZ + 0.3 || z > ROOM.maxZ - 0.3) return true;
    for (const o of FIXED_OBSTACLES) {
      if (x > o.minX - BODY_RADIUS && x < o.maxX + BODY_RADIUS && z > o.minZ - BODY_RADIUS && z < o.maxZ + BODY_RADIUS) {
        return true;
      }
    }
    for (const t of tables) {
      const stretch = 0.58 + BODY_RADIUS;
      if (t.shape === "round") {
        const r = radiusFor(t.seats) + stretch;
        if (Math.hypot(x - t.x, z - t.z) < r) return true;
      } else {
        const w = widthFor(t.seats) / 2 + stretch;
        const d = 0.95 / 2 + stretch;
        if (Math.abs(x - t.x) < w && Math.abs(z - t.z) < d) return true;
      }
    }
    return false;
  }

  private index(x: number, z: number) {
    const cx = Math.round((x - ROOM.minX) / CELL);
    const cz = Math.round((z - ROOM.minZ) / CELL);
    return { cx, cz };
  }

  private free(cx: number, cz: number) {
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return false;
    return this.blocked[cz * this.cols + cx] === 0;
  }

  /** Nearest walkable cell centre, used to snap seats and door positions. */
  nearestFree(p: Point): Point {
    const { cx, cz } = this.index(p.x, p.z);
    if (this.free(cx, cz)) return { x: ROOM.minX + cx * CELL, z: ROOM.minZ + cz * CELL };
    for (let r = 1; r < 14; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          if (this.free(cx + dx, cz + dz)) {
            return { x: ROOM.minX + (cx + dx) * CELL, z: ROOM.minZ + (cz + dz) * CELL };
          }
        }
      }
    }
    return p;
  }

  path(from: Point, to: Point): Point[] {
    const start = this.nearestFree(from);
    const goal = this.nearestFree(to);
    const s = this.index(start.x, start.z);
    const g = this.index(goal.x, goal.z);
    const startKey = s.cz * this.cols + s.cx;

    const open: number[] = [startKey];
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>([[startKey, 0]]);
    const fScore = new Map<number, number>([[startKey, this.heuristic(s.cx, s.cz, g.cx, g.cz)]]);

    while (open.length > 0) {
      // Small grids: a linear scan is cheaper than maintaining a heap.
      let bestIndex = 0;
      for (let i = 1; i < open.length; i++) {
        if ((fScore.get(open[i]) ?? Infinity) < (fScore.get(open[bestIndex]) ?? Infinity)) bestIndex = i;
      }
      const current = open.splice(bestIndex, 1)[0];
      const cx = current % this.cols;
      const cz = Math.floor(current / this.cols);
      if (cx === g.cx && cz === g.cz) return this.reconstruct(cameFrom, current);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.free(nx, nz)) continue;
          // no corner cutting
          if (dx !== 0 && dz !== 0 && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue;
          const key = nz * this.cols + nx;
          const step = dx !== 0 && dz !== 0 ? 1.4142 : 1;
          const tentative = (gScore.get(current) ?? Infinity) + step;
          if (tentative < (gScore.get(key) ?? Infinity)) {
            cameFrom.set(key, current);
            gScore.set(key, tentative);
            fScore.set(key, tentative + this.heuristic(nx, nz, g.cx, g.cz));
            if (!open.includes(key)) open.push(key);
          }
        }
      }
    }
    return [to];
  }

  private reconstruct(cameFrom: Map<number, number>, end: number): Point[] {
    const cells: Point[] = [];
    let current: number | undefined = end;
    while (current !== undefined) {
      const cx = current % this.cols;
      const cz = Math.floor(current / this.cols);
      cells.push({ x: ROOM.minX + cx * CELL, z: ROOM.minZ + cz * CELL });
      current = cameFrom.get(current);
    }
    const points = cells.reverse();
    return this.smooth(points);
  }

  private smooth(points: Point[]): Point[] {
    if (points.length <= 2) return points;
    const out: Point[] = [points[0]];
    let anchor = 0;
    for (let i = 2; i < points.length; i++) {
      if (!this.clearLine(points[anchor], points[i])) {
        out.push(points[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(points[points.length - 1]);
    return out;
  }

  private clearLine(a: Point, b: Point) {
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(distance / (CELL * 0.6)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const { cx, cz } = this.index(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!this.free(cx, cz)) return false;
    }
    return true;
  }

  private heuristic(ax: number, az: number, bx: number, bz: number) {
    const dx = Math.abs(ax - bx);
    const dz = Math.abs(az - bz);
    return Math.max(dx, dz) + 0.4142 * Math.min(dx, dz);
  }
}

function radiusFor(seats: number) {
  return { 1: 0.5, 2: 0.62, 3: 0.72, 4: 0.82, 5: 0.9, 6: 0.98 }[Math.min(6, Math.max(1, seats))] ?? 0.82;
}

function widthFor(seats: number) {
  return seats <= 2 ? 1.0 : seats <= 4 ? 1.35 : seats <= 6 ? 2.0 : 2.7;
}

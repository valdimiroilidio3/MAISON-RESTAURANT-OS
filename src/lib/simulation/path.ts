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

/*
 * The walkable world is derived from the canonical layout — partitions,
 * fixtures and pots — so navigation, rendering and validation cannot disagree
 * about where a wall or the bar counter is.
 */
import {
  FIXTURES,
  LANDMARKS as LAYOUT_LANDMARKS,
  POTS,
  ROOM_BOUNDS,
  tableObb,
  wallFootprints,
  type TableLike,
} from "@/lib/scene/layout";
import { CHAIR_RADIUS, computeSeatPlan, plannedSeats } from "@/lib/scene/placement";
import { obbCircleGap } from "@/lib/scene/spatial";

export const ROOM = ROOM_BOUNDS;
export const LANDMARKS = LAYOUT_LANDMARKS;

export const FIXED_OBSTACLES: NavObstacle[] = [
  ...wallFootprints().map((wall) => wall.rect),
  ...FIXTURES.filter((fixture) => fixture.blocksCirculation).map((fixture) => fixture.footprint),
  ...POTS.map((pot) => ({ minX: pot.x - pot.r, maxX: pot.x + pot.r, minZ: pot.z - pot.r, maxZ: pot.z + pot.r })),
];

export const NAV_LANDMARKS = LAYOUT_LANDMARKS;

const CELL = 0.35;
const BODY_RADIUS = 0.42;

type NavTable = Pick<TableLike, "id" | "seats" | "shape" | "x" | "z" | "rotation">;

/**
 * The navigation grid.
 *
 * Obstacles are the real shapes, not a circle drawn around each table: the
 * tabletop is an oriented box and every chair is a small circle, both inflated
 * by the body radius. Treating a table as one fat disc (table + chair ring +
 * body) used to seal every 1.4 m aisle in the plan, which made most of the room
 * unreachable while *looking* free — the classic failure of a too-coarse model.
 */
export class NavGrid {
  private readonly cols: number;
  private readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly seats: Array<{ x: number; z: number }> = [];
  private readonly obstacles = new Map<number, ReturnType<typeof tableObb>>();

  constructor(tables: NavTable[]) {
    this.cols = Math.ceil((ROOM.maxX - ROOM.minX) / CELL) + 1;
    this.rows = Math.ceil((ROOM.maxZ - ROOM.minZ) / CELL) + 1;
    this.blocked = new Uint8Array(this.cols * this.rows);

    const plan = computeSeatPlan(tables as TableLike[]);
    for (const table of tables) {
      this.obstacles.set(table.id, tableObb(table as TableLike));
      for (const seat of plannedSeats(table as TableLike, plan)) this.seats.push({ x: seat.x, z: seat.z });
    }

    for (let cx = 0; cx < this.cols; cx++) {
      for (let cz = 0; cz < this.rows; cz++) {
        const x = ROOM.minX + cx * CELL;
        const z = ROOM.minZ + cz * CELL;
        if (this.isSolid(x, z)) this.blocked[cz * this.cols + cx] = 1;
      }
    }
  }

  private isSolid(x: number, z: number) {
    if (x < ROOM.minX + 0.3 || x > ROOM.maxX - 0.3 || z < ROOM.minZ + 0.3 || z > ROOM.maxZ - 0.3) return true;
    for (const o of FIXED_OBSTACLES) {
      if (x > o.minX - BODY_RADIUS && x < o.maxX + BODY_RADIUS && z > o.minZ - BODY_RADIUS && z < o.maxZ + BODY_RADIUS) {
        return true;
      }
    }
    for (const obb of this.obstacles.values()) {
      if (obbCircleGap(obb, { x, z, r: BODY_RADIUS }) < 0) return true;
    }
    for (const seat of this.seats) {
      if (Math.hypot(x - seat.x, z - seat.z) < CHAIR_RADIUS + BODY_RADIUS) return true;
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
          const known = gScore.get(key) ?? Infinity;
          // Parentheses matter: `a < b ?? c` evaluates as `(a < b) ?? c`, and a
          // false result never falls through to the default, so the original
          // `tentative < (gScore.get(key) ?? Infinity)` silently never expanded
          // a single neighbour.
          if (tentative < known) {
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

  /**
   * Can a body walk from `from` to `to`? Used by the spatial validator, so the
   * answer must never be "yes" just because the two points coincide.
   */
  canReach(from: Point, to: Point, tolerance = 0.9): boolean {
    const goal = this.nearestFree(to);
    const path = this.path(from, goal);
    if (path.length < 2) return false;
    const last = path[path.length - 1];
    return Math.hypot(last.x - goal.x, last.z - goal.z) <= tolerance;
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

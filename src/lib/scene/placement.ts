/**
 * Placement solver — seat orientation.
 *
 * A round table's seats can be rotated around it. Doing that by hand (or with a
 * per-id jitter) is how neighbouring tables end up sharing chair space. Instead
 * the orientation of every round table is *solved*: for each table we try every
 * candidate yaw and keep the one that maximises the smallest clearance to the
 * other chairs, other tabletops, fixed furniture and walls.
 *
 * The solver is deterministic (fixed candidate set, fixed iteration order,
 * ties broken by the smallest rotation), so the browser, the simulation and the
 * 2D plan all derive identical seat positions.
 */

import { chairSlots, tableDimensions } from "@/lib/floor-geometry";
import {
  FIXTURES,
  POTS,
  ROOM_BOUNDS,
  type Fixture,
  type TableLike,
} from "./layout";
import {
  circleRectOverlap,
  distance,
  obbCircleGap,
  obbFromRect,
  obbGap,
  rectFromCenter,
  type Circle,
  type Obb,
  type Rect,
} from "./spatial";

export const SEAT_OFFSET = { round: 0.36, rect: 0.4 };
export const CHAIR_RADIUS = 0.26;

export type SeatPlan = Map<number, number>;

/** A table plus its solved seat rotation. */
type WorkingTable = TableLike & { yaw: number };

interface Blocking {
  obbs: Array<{ id: string; obb: Obb }>;
  circles: Array<{ id: string; circle: Circle }>;
}

/** Everything fixed a chair must not touch (excluding the table's own seats). */
export function staticBlockers(fixtures: Fixture[] = FIXTURES): Blocking {
  return {
    obbs: fixtures
      .filter((fixture) => fixture.blocksCirculation)
      .map((fixture) => ({ id: fixture.id, obb: obbFromRect(fixture.footprint) })),
    circles: POTS.map((pot) => ({ id: pot.id, circle: { x: pot.x, z: pot.z, r: pot.r } })),
  };
}

export function seatCircles(table: TableLike, yaw = 0): Circle[] {
  return chairSlots(table, table.id, { seatOffset: table.shape === "round" ? SEAT_OFFSET.round : SEAT_OFFSET.rect, yaw }).map(
    (slot) => ({ x: slot.x, z: slot.z, r: CHAIR_RADIUS }),
  );
}

function seatsClearance(
  table: TableLike,
  yaw: number,
  others: WorkingTable[],
  blockers: Blocking,
  bounds: Rect,
): number {
  const seats = seatCircles(table, yaw);
  let best = Infinity;
  for (const seat of seats) {
    // inside the floor
    best = Math.min(
      best,
      seat.x - seat.r - bounds.minX,
      bounds.maxX - seat.x - seat.r,
      seat.z - seat.r - bounds.minZ,
      bounds.maxZ - seat.z - seat.r,
    );
    // fixed furniture
    for (const blocker of blockers.obbs) best = Math.min(best, obbCircleGap(blocker.obb, seat));
    for (const blocker of blockers.circles) best = Math.min(best, distance(seat, blocker.circle) - seat.r - blocker.circle.r);
    // other tables and their chairs
    for (const other of others) {
      if (other.id === table.id) continue;
      const own = chairSlots(other, other.id, {
        seatOffset: other.shape === "round" ? SEAT_OFFSET.round : SEAT_OFFSET.rect,
        yaw: other.shape === "round" ? other.yaw : 0,
      });
      const obbOther: Obb =
        other.shape === "round"
          ? { x: other.x, z: other.z, hw: tableDimensions(other).radius, hd: tableDimensions(other).radius, rotation: other.rotation }
          : obbFromRect(
              rectFromCenter(other.x, other.z, tableDimensions(other).width, tableDimensions(other).depth),
            );
      best = Math.min(best, obbCircleGap(obbOther, seat));
      for (const slot of own) {
        best = Math.min(best, distance(seat, slot) - seat.r - CHAIR_RADIUS);
      }
    }
    if (best < 0) return best;
  }
  return best;
}

/**
 * Solve the yaw of every round table. Rectangular tables keep their fixed
 * side-seating (rotating them would make chairs float off the long edges).
 */
export function computeSeatPlan(
  tables: TableLike[],
  fixtures: Fixture[] = FIXTURES,
  bounds: Rect = ROOM_BOUNDS,
  options: { step?: number; passes?: number } = {},
): SeatPlan {
  const step = options.step ?? Math.PI / 24; // 7.5°
  const passes = options.passes ?? 3;
  const blockers = staticBlockers(fixtures);
  const plan: SeatPlan = new Map(tables.map((table) => [table.id, 0]));
  // Work on copies that carry the current yaw so neighbour checks stay in sync.
  const working: WorkingTable[] = tables.map((table) => ({ ...table, yaw: 0 }));

  for (let pass = 0; pass < passes; pass++) {
    let improved = false;
    for (const table of working) {
      if (table.shape !== "round" || table.seats < 2) continue;
      let bestYaw = plan.get(table.id) ?? 0;
      let bestScore = seatsClearance(table, bestYaw, working, blockers, bounds);
      for (let stepIndex = 0; stepIndex < Math.round((Math.PI * 2) / step); stepIndex++) {
        const yaw = stepIndex * step;
        const score = seatsClearance(table, yaw, working, blockers, bounds);
        // deterministic tie-break: prefer the smallest rotation
        if (score > bestScore + 1e-4 || (Math.abs(score - bestScore) <= 1e-4 && yaw < bestYaw)) {
          bestScore = score;
          bestYaw = yaw;
        }
      }
      if (bestYaw !== plan.get(table.id)) improved = true;
      plan.set(table.id, bestYaw);
      table.yaw = bestYaw;
    }
    if (!improved) break;
  }
  return plan;
}

/** Seats of a table, honouring the solved plan. */
export function plannedSeats(table: TableLike, plan?: SeatPlan) {
  return chairSlots(table, table.id, {
    seatOffset: table.shape === "round" ? SEAT_OFFSET.round : SEAT_OFFSET.rect,
    yaw: table.shape === "round" ? plan?.get(table.id) ?? 0 : 0,
  });
}

/**
 * Points a body can stand at to use a table: one step beyond each seat, outside
 * the chair's own footprint. A table only counts as reachable if at least one of
 * them can be reached — a table whose only free cell sits in a sealed pocket
 * between two chair backs is not usable.
 */
export function approachPoints(table: TableLike, plan?: SeatPlan): Array<{ x: number; z: number }> {
  return plannedSeats(table, plan).map((seat) => {
    const dx = seat.x - table.x;
    const dz = seat.z - table.z;
    const length = Math.hypot(dx, dz) || 1;
    return { x: seat.x + (dx / length) * 0.78, z: seat.z + (dz / length) * 0.78 };
  });
}

/** Keep a chair from being placed inside a wall (used by the validator too). */
export function chairTouchesRect(seat: Circle, rect: Rect): boolean {
  return circleRectOverlap(seat, rect);
}

/** Convenience for tests: are two table groups (table + chairs) separated? */
export function tableGroupsOverlap(a: TableLike, aYaw: number, b: TableLike, bYaw: number): boolean {
  const obbA: Obb = {
    x: a.x,
    z: a.z,
    hw: a.shape === "round" ? tableDimensions(a).radius : tableDimensions(a).width / 2,
    hd: a.shape === "round" ? tableDimensions(a).radius : tableDimensions(a).depth / 2,
    rotation: a.rotation,
  };
  const obbB: Obb = {
    x: b.x,
    z: b.z,
    hw: b.shape === "round" ? tableDimensions(b).radius : tableDimensions(b).width / 2,
    hd: b.shape === "round" ? tableDimensions(b).radius : tableDimensions(b).depth / 2,
    rotation: b.rotation,
  };
  if (obbGap(obbA, obbB) < 0) return true;
  for (const seat of seatCircles(a, aYaw)) {
    if (obbCircleGap(obbB, seat) < 0) return true;
    for (const other of seatCircles(b, bYaw)) {
      if (distance(seat, other) < seat.r + other.r) return true;
    }
  }
  return false;
}

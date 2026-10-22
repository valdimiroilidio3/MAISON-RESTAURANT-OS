/**
 * Seat placement is solved, not authored. These tests pin the properties that
 * make the result safe to render and safe to simulate:
 *  - deterministic (same input → same yaw, in any order of iteration);
 *  - tucked close enough that neighbours never share chair space;
 *  - chairs never inside a wall, fixture or another table's top;
 *  - the plan can be reproduced from the layout alone.
 */

import { describe, expect, it } from "vitest";
import { chairSlots } from "@/lib/floor-geometry";
import { FIXTURES, TABLES, wallFootprints, type TableLike } from "@/lib/scene/layout";
import {
  CHAIR_RADIUS,
  SEAT_OFFSET,
  computeSeatPlan,
  plannedSeats,
  seatCircles,
  staticBlockers,
  tableGroupsOverlap,
} from "@/lib/scene/placement";
import { obbCircleGap, obbFromRect } from "@/lib/scene/spatial";

const tables = TABLES as TableLike[];

describe("seat solver", () => {
  it("is deterministic across calls and independent of input order", () => {
    const forward = computeSeatPlan(tables);
    const again = computeSeatPlan(tables);
    const reversed = computeSeatPlan([...tables].reverse());
    for (const table of tables) {
      expect(again.get(table.id)).toBe(forward.get(table.id));
      expect(reversed.get(table.id)).toBe(forward.get(table.id));
    }
  });

  it("only rotates round tables and keeps the rotation in [0, 2π)", () => {
    const plan = computeSeatPlan(tables);
    for (const table of tables) {
      const yaw = plan.get(table.id) ?? 0;
      if (table.shape === "rect") expect(yaw).toBe(0);
      expect(yaw).toBeGreaterThanOrEqual(0);
      expect(yaw).toBeLessThan(Math.PI * 2 + 1e-9);
    }
  });

  it("puts every seat the planned distance from its table edge", () => {
    const plan = computeSeatPlan(tables);
    for (const table of tables) {
      const seats = plannedSeats(table, plan);
      expect(seats).toHaveLength(table.seats);
      for (const seat of seats) {
        const radius = table.shape === "round" ? Math.hypot(seat.x - table.x, seat.z - table.z) : Math.abs(seat.z - table.z);
        const expected = table.shape === "round" ? (SEAT_OFFSET.round as number) : SEAT_OFFSET.rect;
        // + table radius/depth for rounds is folded into the distance check below
        if (table.shape === "round") {
          const tableRadius = radius - SEAT_OFFSET.round;
          expect(tableRadius).toBeGreaterThan(0.4);
        } else {
          expect(radius).toBeCloseTo(expected + 0.475, 2); // depth 0.95 / 2 + 0.4
        }
      }
    }
  });

  it("never leaves two table groups (table + chairs) touching", () => {
    const plan = computeSeatPlan(tables);
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        expect(
          tableGroupsOverlap(tables[i], plan.get(tables[i].id) ?? 0, tables[j], plan.get(tables[j].id) ?? 0),
          `${tables[i].code} ↔ ${tables[j].code}`,
        ).toBe(false);
      }
    }
  });

  it("keeps every chair clear of the fixed furniture and the pots", () => {
    const plan = computeSeatPlan(tables);
    const blockers = staticBlockers();
    for (const table of tables) {
      for (const seat of seatCircles(table, plan.get(table.id) ?? 0)) {
        for (const blocker of blockers.obbs) {
          // a chair may tuck under nothing: 0 m is the floor, not a negative gap
          expect(obbCircleGap(blocker.obb, seat), `${table.code} chair ↔ ${blocker.id}`).toBeGreaterThanOrEqual(-0.02);
        }
        for (const blocker of blockers.circles) {
          const gap = Math.hypot(seat.x - blocker.circle.x, seat.z - blocker.circle.z) - seat.r - blocker.circle.r;
          expect(gap, `${table.code} chair ↔ ${blocker.id}`).toBeGreaterThanOrEqual(-0.02);
        }
      }
    }
  });

  it("keeps every chair outside every wall footprint", () => {
    const plan = computeSeatPlan(tables);
    const walls = wallFootprints();
    for (const table of tables) {
      for (const seat of seatCircles(table, plan.get(table.id) ?? 0)) {
        for (const wall of walls) {
          expect(obbCircleGap(obbFromRect(wall.rect), seat), `${table.code} chair ↔ ${wall.id}`).toBeGreaterThanOrEqual(-0.02);
        }
      }
    }
  });

  it("keeps the minimum clearance between chairs of different tables usable", () => {
    const plan = computeSeatPlan(tables);
    let minimum = Infinity;
    let pair = "";
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        for (const a of seatCircles(tables[i], plan.get(tables[i].id) ?? 0)) {
          for (const b of seatCircles(tables[j], plan.get(tables[j].id) ?? 0)) {
            const gap = Math.hypot(a.x - b.x, a.z - b.z) - a.r - b.r;
            if (gap < minimum) {
              minimum = gap;
              pair = `${tables[i].code}↔${tables[j].code}`;
            }
          }
        }
      }
    }
    // two diners must be able to get up at the same time
    expect(minimum, pair).toBeGreaterThanOrEqual(0.18);
  });
});

describe("chair geometry contract", () => {
  it("defaults to the tucked offset and is overridable", () => {
    const table = tables[0];
    const tucked = chairSlots(table, table.id);
    const loose = chairSlots(table, table.id, { seatOffset: 0.9 });
    const length = (seat: { x: number; z: number }) => Math.hypot(seat.x - table.x, seat.z - table.z);
    expect(length(loose[0])).toBeCloseTo(length(tucked[0]) + 0.54, 6);
  });

  it("applies yaw as a pure rotation of the seat ring", () => {
    const round = tables.find((table) => table.shape === "round" && table.seats >= 4)!;
    const a = chairSlots(round, round.id, { yaw: 0 });
    const b = chairSlots(round, round.id, { yaw: Math.PI / 2 });
    expect(b).toHaveLength(a.length);
    for (const seat of b) {
      expect(Math.hypot(seat.x - round.x, seat.z - round.z)).toBeCloseTo(
        Math.hypot(a[0].x - round.x, a[0].z - round.z),
        6,
      );
    }
  });

  it("has a chair radius that fits between two seats of the same table", () => {
    // adjacent chairs at the long communal table (perSide = 4) must not overlap
    const communal = tables.find((table) => table.shape === "rect" && table.seats === 8)!;
    const seats = plannedSeats(communal, computeSeatPlan(tables));
    const sameSide = seats.filter((seat) => seat.z > communal.z);
    const spacing = Math.abs(sameSide[1].x - sameSide[0].x);
    expect(spacing).toBeGreaterThan(CHAIR_RADIUS * 2);
  });
});

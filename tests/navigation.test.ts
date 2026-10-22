/**
 * Navigation is the part of the spatial model the guest actually feels: if the
 * pathfinder silently fails, every actor walks through furniture and nobody
 * notices until it is watched. These tests assert the path is *walkable*, not
 * merely non-empty.
 */

import { describe, expect, it } from "vitest";
import { NavGrid, LANDMARKS } from "@/lib/simulation/path";
import { FIXTURES, TABLES, tableObb } from "@/lib/scene/layout";
import { approachPoints, computeSeatPlan, seatCircles } from "@/lib/scene/placement";
import { obbCircleGap, obbFromRect } from "@/lib/scene/spatial";

const nav = new NavGrid(TABLES);
const door = LANDMARKS.door;

describe("pathfinding", () => {
  it("returns a real path (regression: the A* neighbour update once never fired)", () => {
    // The bug was a precedence error (`a < b ?? c`) that never expanded a
    // neighbour, so every call returned just the destination.
    const path = nav.path(door, LANDMARKS.host);
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path[0].x).toBeCloseTo(8.55, 1);
    // the straight line is clear here, so two points is the correct answer —
    // the regression was a *single* point equal to the destination
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - LANDMARKS.host.x, end.z - LANDMARKS.host.z)).toBeLessThan(1.2);
  });

  it("reaches the service landmarks", () => {
    for (const landmark of [LANDMARKS.host, LANDMARKS.counter, LANDMARKS.pass, LANDMARKS.bathroom]) {
      expect(nav.canReach(door, landmark), JSON.stringify(landmark)).toBe(true);
    }
  });

  it("gives every table at least one usable approach", () => {
    const plan = computeSeatPlan(TABLES);
    for (const table of TABLES) {
      const reachable = approachPoints(table, plan).some((point) => nav.canReach(door, point));
      expect(reachable, `${table.code} has no approach`).toBe(true);
    }
  });

  it("produces a walkable polyline that never crosses furniture", () => {
    const plan = computeSeatPlan(TABLES);
    const seats = TABLES.flatMap((table) => seatCircles(table, plan.get(table.id) ?? 0));
    const furniture = [
      ...TABLES.map((table) => ({ id: table.code, obb: tableObb(table) })),
      ...FIXTURES.map((fixture) => ({ id: fixture.id, obb: obbFromRect(fixture.footprint) })),
    ];

    for (const table of TABLES) {
      const approach = approachPoints(table, plan).find((point) => nav.canReach(door, point))!;
      const path = nav.path(door, approach);
      expect(path.length).toBeGreaterThan(1);
      for (let i = 1; i < path.length; i++) {
        const steps = Math.ceil(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) / 0.12);
        for (let step = 0; step <= steps; step++) {
          const t = step / steps;
          const x = path[i - 1].x + (path[i].x - path[i - 1].x) * t;
          const z = path[i - 1].z + (path[i].z - path[i - 1].z) * t;
          for (const item of furniture) {
            // 2 cm of tolerance for grid rounding
            expect(obbCircleGap(item.obb, { x, z, r: 0 }), `${table.code} route enters ${item.id}`).toBeGreaterThan(-0.02);
          }
          for (const seat of seats) {
            expect(Math.hypot(x - seat.x, z - seat.z), `${table.code} route enters a chair`).toBeGreaterThan(seat.r - 0.02);
          }
        }
      }
    }
  });

  it("is deterministic", () => {
    const a = nav.path(door, { x: -2.6, z: -3.6 });
    const b = new NavGrid(TABLES).path(door, { x: -2.6, z: -3.6 });
    expect(a).toEqual(b);
  });

  it("refuses a point outside the room", () => {
    expect(nav.canReach(door, { x: 40, z: 40 })).toBe(false);
  });

  it("keeps every waypoint inside the room and every route plausible", () => {
    const plan = computeSeatPlan(TABLES);
    for (const table of TABLES) {
      const approach = approachPoints(table, plan).find((point) => nav.canReach(door, point));
      expect(approach, table.code).toBeTruthy();
      const path = nav.path(door, approach!);
      for (const point of path) {
        expect(point.x).toBeGreaterThanOrEqual(-11.4);
        expect(point.x).toBeLessThanOrEqual(9.6);
        expect(point.z).toBeGreaterThanOrEqual(-7.9);
        expect(point.z).toBeLessThanOrEqual(8.8);
      }
      const length = path.slice(1).reduce((total, point, index) => total + Math.hypot(point.x - path[index].x, point.z - path[index].z), 0);
      const direct = Math.hypot(approach!.x - door.x, approach!.z - door.z);
      expect(direct).toBeGreaterThan(0);
      // Length is a smoke bound, not a score: a table can be 1 m from the door
      // and still need a 5 m walk around a planter.
      expect(length, table.code).toBeGreaterThan(direct);
      // Smoke bound only: the longest real route (entrance → far terrace table,
      // around the bar and through the single terrace door) is ~47 m.
      expect(length, table.code).toBeLessThan(60);
      // string-pulled segments are long by design (a straight corridor is one
      // segment); what matters is that no segment crosses furniture, covered by
      // the walkable-polyline test above
      for (let i = 1; i < path.length; i++) {
        expect(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)).toBeLessThan(12);
      }
    }
  });
});

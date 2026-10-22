/**
 * One space, four views.
 *
 * The 3D public scene, the live simulation, the agent navigation grid and the
 * 2D floor plan must all describe the *same* restaurant. Historically they did
 * not: the 2D plan drew its own room outline and computed table size with a
 * private formula, so the mobile/no-WebGL fallback showed a room that did not
 * exist.
 *
 * These tests assert the projection contract rather than any particular
 * geometry: every view derives its numbers from the canonical plan.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tableDimensions } from "@/lib/floor-geometry";
import {
  FIXTURES,
  INTERIOR,
  KITCHEN,
  OPENINGS,
  PARTITIONS,
  ROOM_BOUNDS,
  TABLE_PLAN,
  TERRACE,
  ZONE_BOUNDS,
} from "@/lib/scene/layout";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

describe("canonical shell", () => {
  it("keeps the interior and terrace inside the walkable bounds", () => {
    for (const rect of [INTERIOR, TERRACE]) {
      expect(rect.minX).toBeGreaterThanOrEqual(ROOM_BOUNDS.minX - 0.001);
      expect(rect.maxX).toBeLessThanOrEqual(ROOM_BOUNDS.maxX + 0.001);
      expect(rect.minZ).toBeGreaterThanOrEqual(ROOM_BOUNDS.minZ - 0.001);
      expect(rect.maxZ).toBeLessThanOrEqual(ROOM_BOUNDS.maxZ + 0.001);
    }
  });

  it("puts the kitchen behind the back wall, reachable only through the pass", () => {
    expect(KITCHEN.maxZ).toBeLessThanOrEqual(INTERIOR.minZ + 0.001);
    expect(KITCHEN.minZ).toBeLessThan(INTERIOR.minZ);
    const pass = OPENINGS.find((opening) => opening.kind === "pass")!;
    // the pass opening must lie within the kitchen's width
    expect(pass.from).toBeGreaterThanOrEqual(KITCHEN.minX - 0.001);
    expect(pass.to).toBeLessThanOrEqual(KITCHEN.maxX + 0.001);
  });

  it("keeps every opening either inside a wall run or filling the gap between two", () => {
    for (const opening of OPENINGS) {
      const coplanar = PARTITIONS.filter(
        (run) => run.axis === opening.axis && Math.abs(run.at - opening.at) < 0.02,
      );
      const inside = coplanar.some(
        (run) => opening.from >= run.from - 0.001 && opening.to <= run.to + 0.001,
      );
      // A door can also be exactly the gap between two collinear runs; then the
      // runs must butt up against it rather than overlap it.
      const fillsGap = coplanar.some((run) => Math.abs(run.to - opening.from) < 0.002) &&
        coplanar.some((run) => Math.abs(run.from - opening.to) < 0.002);
      expect(inside || fillsGap, `${opening.id} is neither inside a wall run nor filling a gap`).toBe(true);
    }
  });

  it("places every fixture inside the walkable bounds", () => {
    for (const fixture of FIXTURES) {
      const { minX, minZ, maxX, maxZ } = fixture.footprint;
      expect(minX, fixture.id).toBeGreaterThanOrEqual(ROOM_BOUNDS.minX - 0.001);
      expect(maxX, fixture.id).toBeLessThanOrEqual(ROOM_BOUNDS.maxX + 0.001);
      expect(minZ, fixture.id).toBeGreaterThanOrEqual(ROOM_BOUNDS.minZ - 0.001);
      expect(maxZ, fixture.id).toBeLessThanOrEqual(ROOM_BOUNDS.maxZ + 0.001);
    }
  });
});

describe("table footprint", () => {
  it("agrees with the seat count it is drawn for", () => {
    for (const table of TABLE_PLAN) {
      const dims = tableDimensions(table);
      // a table must be big enough for the people sitting at it
      expect(Math.max(dims.width, dims.depth), table.code).toBeGreaterThanOrEqual(0.9);
      expect(dims.height, table.code).toBeGreaterThan(0.6);
      expect(dims.height, table.code).toBeLessThan(0.85);
    }
  });

  it("grows monotonically with the number of seats", () => {
    const round = [1, 2, 3, 4, 5, 6].map((seats) => tableDimensions({ shape: "round", seats }).radius);
    for (let index = 1; index < round.length; index++) {
      expect(round[index]).toBeGreaterThanOrEqual(round[index - 1]);
    }
    const rect = [2, 4, 6, 8].map((seats) => tableDimensions({ shape: "rect", seats }).width);
    for (let index = 1; index < rect.length; index++) {
      expect(rect[index]).toBeGreaterThanOrEqual(rect[index - 1]);
    }
  });
});

describe("the 2D plan is a projection, not a second opinion", () => {
  const source = read("src/components/dining/FloorPlan2D.tsx");

  it("imports the canonical model", () => {
    for (const symbol of ["ROOM_BOUNDS", "INTERIOR", "TERRACE", "PARTITIONS", "OPENINGS", "FIXTURES", "KITCHEN"]) {
      expect(source, `FloorPlan2D must import ${symbol}`).toContain(symbol);
    }
    expect(source).toContain("tableDimensions");
  });

  it("contains no baked room coordinates", () => {
    // The old file hardcoded x=-4.8 / width=14.4 / x=3.2 y=-5.5. `rx=` and
    // `tabIndex=` are not coordinates, hence the leading word boundary.
    const numericLiterals = source.match(/(?<![a-zA-Z])(x1|x2|y1|y2|x|y|width|height)=\{-?\d+(\.\d+)?\}/g) ?? [];
    expect(numericLiterals, `baked coordinates: ${numericLiterals.join(", ")}`).toHaveLength(0);
  });

  it("derives its viewport from the shell, with a margin", () => {
    expect(source).toMatch(/minX:\s*ROOM_BOUNDS\.minX\s*-\s*PAD/);
    expect(source).toMatch(/minZ:\s*KITCHEN\.minZ\s*-\s*PAD/);
  });
});

describe("zone bounds partition the interior", () => {
  it("covers the interior exactly once", () => {
    const { sala, balcao } = ZONE_BOUNDS;
    expect(sala.minX).toBe(INTERIOR.minX);
    expect(balcao.maxX).toBe(INTERIOR.maxX);
    expect(sala.maxX).toBe(balcao.minX);
    expect(sala.minZ).toBe(INTERIOR.minZ);
    expect(sala.maxZ).toBe(INTERIOR.maxZ);
  });

  it("assigns every table to the zone that contains it", () => {
    for (const table of TABLE_PLAN) {
      const zone = ZONE_BOUNDS[table.zone];
      expect(table.x, `${table.code} x`).toBeGreaterThanOrEqual(zone.minX - 0.9);
      expect(table.x, `${table.code} x`).toBeLessThanOrEqual(zone.maxX + 0.9);
      expect(table.z, `${table.code} z`).toBeGreaterThanOrEqual(zone.minZ - 0.9);
      expect(table.z, `${table.code} z`).toBeLessThanOrEqual(zone.maxZ + 0.9);
    }
  });
});

describe("label placement", () => {
  it("finds a clear patch of floor for a caption", async () => {
    const { labelAnchor, circleBox } = await import("@/lib/scene/labels");
    // A room with an obstacle wall across the middle: the anchor must not sit on it.
    const room = { minX: 0, minZ: 0, maxX: 10, maxZ: 6 };
    const wall = { minX: 0, minZ: 2.6, maxX: 10, maxZ: 3.4 };
    const anchor = labelAnchor(room, [wall], { padding: 0.4, self: { width: 2, height: 0.5 } });
    expect(anchor.clearance).toBeGreaterThan(0);
    expect(anchor.z <= 2.6 - 0.25 || anchor.z >= 3.4 + 0.25).toBe(true);
  });

  it("accounts for the width of the caption, not just its origin", async () => {
    const { labelAnchor, circleBox } = await import("@/lib/scene/labels");
    const room = { minX: 0, minZ: 0, maxX: 8, maxZ: 4 };
    const obstacle = circleBox(4, 2, 0.6);
    const tight = labelAnchor(room, [obstacle], { self: { width: 0, height: 0 } });
    const wide = labelAnchor(room, [obstacle], { self: { width: 3, height: 0.6 } });
    expect(wide.clearance).toBeLessThan(tight.clearance);
  });

  it("is deterministic", async () => {
    const { labelAnchor, circleBox } = await import("@/lib/scene/labels");
    const room = { minX: -11.4, minZ: -7.9, maxX: -4.8, maxZ: 8.8 };
    const obstacles = [circleBox(-9.4, -5.6, 0.62), circleBox(-6.8, -5.6, 0.62)];
    const a = labelAnchor(room, obstacles, { self: { width: 1.95, height: 0.45 } });
    const b = labelAnchor(room, obstacles, { self: { width: 1.95, height: 0.45 } });
    expect(a).toEqual(b);
  });
});

describe("operational legibility", () => {
  const source = read("src/components/dining/FloorPlan2D.tsx");

  it("encodes table status with something other than colour", () => {
    // WCAG 1.4.1 — colour must never be the only channel.
    expect(source).toMatch(/STATUS_DASH/);
    expect(source).toMatch(/stopDash|strokeDasharray=\{statusDash\}|strokeDasharray=\{statusDash\}/);
    for (const status of ["reserved", "order_pending", "awaiting_payment", "cleaning"]) {
      expect(source, `${status} needs a dash signature`).toContain(status);
    }
  });

  it("never dims a table label below legibility", () => {
    // The label must not inherit the group's dim opacity; it gets its own colour.
    expect(source).toMatch(/labelFill/);
    expect(source).not.toMatch(/opacity=\{dimmed \? 0\.2\d : 1\}[\s\S]{0,400}<text/);
  });

  it("does not paint status colour over the whole table body", () => {
    // A 13%-alpha tint plus a 13%-alpha border is invisible on a dark plan.
    expect(source).toContain("bodyFill");
    expect(source).not.toContain("`${meta.dot}22`");
  });
});

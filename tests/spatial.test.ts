/**
 * The geometry kernel. These tests pin the primitives that every other spatial
 * check is built on — if SAT or a circle/rect test is wrong, the validator and
 * the nav grid are wrong in the same direction and the mistake is invisible.
 */

import { describe, expect, it } from "vitest";
import {
  circleInsideRect,
  circleRectOverlap,
  distance,
  obbBounds,
  obbCircleGap,
  obbFromRect,
  obbGap,
  rectContainsPoint,
  rectContainsRect,
  rectFromCenter,
  rectGap,
  rectOverlapArea,
  rectsOverlap,
  groupGap,
  type Circle,
} from "@/lib/scene/spatial";

const rect = (minX: number, minZ: number, maxX: number, maxZ: number) => ({ minX, minZ, maxX, maxZ });

describe("rectangles", () => {
  it("builds a rect from its centre", () => {
    expect(rectFromCenter(1, 2, 2, 4)).toEqual({ minX: 0, minZ: 0, maxX: 2, maxZ: 4 });
  });

  it("handles touching edges as not overlapping but zero gap", () => {
    const a = rect(0, 0, 1, 1);
    const b = rect(1, 0, 2, 1);
    expect(rectsOverlap(a, b)).toBe(false);
    expect(rectGap(a, b)).toBe(0);
    expect(rectOverlapArea(a, b)).toBe(0);
  });

  it("measures the gap on the nearest axis, including diagonal cases", () => {
    const a = rect(0, 0, 1, 1);
    const diagonal = rect(1.5, 1.5, 2, 2);
    // diagonal separation is measured on the dominant axis (0.5), never negative
    expect(rectGap(a, diagonal)).toBeCloseTo(0.5, 6);
    expect(rectGap(rect(0, 0, 1, 1), rect(3, 0, 4, 1))).toBeCloseTo(2, 6);
  });

  it("includes the boundary and shrinks it by an explicit margin", () => {
    const area = rect(0, 0, 10, 10);
    expect(rectContainsPoint(area, { x: 5, z: 5 })).toBe(true);
    expect(rectContainsPoint(area, { x: 5, z: 10 })).toBe(true);
    // a 0.5 m margin pulls the usable edge inside the wall
    expect(rectContainsPoint(area, { x: 5, z: 9.7 }, 0.5)).toBe(false);
    expect(rectContainsPoint(area, { x: 5, z: 9.4 }, 0.5)).toBe(true);
  });

  it("contains a rect only when all four edges fit", () => {
    expect(rectContainsRect(rect(0, 0, 4, 4), rect(1, 1, 3, 3))).toBe(true);
    expect(rectContainsRect(rect(0, 0, 4, 4), rect(1, 1, 4.2, 3))).toBe(false);
  });
});

describe("circles", () => {
  const circle = (x: number, z: number, r: number): Circle => ({ x, z, r });

  it("treats internal overlap as overlap, not containment", () => {
    const area = rect(0, 0, 2, 2);
    expect(circleRectOverlap(circle(1, 1, 0.4), area)).toBe(true);
    expect(circleInsideRect(circle(1, 1, 0.4), area)).toBe(true);
    expect(circleInsideRect(circle(1, 1, 1.01), area)).toBe(false);
  });

  it("detects a circle that only clips a corner", () => {
    const area = rect(0, 0, 1, 1);
    // centre outside, radius reaches into the corner at ~0.14 m
    expect(circleRectOverlap(circle(1.1, 1.1, 0.2), area)).toBe(true);
    expect(circleRectOverlap(circle(1.2, 1.2, 0.2), area)).toBe(false);
  });

  it("uses euclidean distance", () => {
    expect(distance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});

describe("oriented boxes (SAT)", () => {
  it("separates two parallel boxes with a known gap", () => {
    const a = obbFromRect(rect(0, 0, 2, 2));
    const b = obbFromRect(rect(3, 0, 5, 2));
    expect(obbGap(a, b)).toBeCloseTo(1, 6);
  });

  it("never reports a negative gap for touching boxes", () => {
    const a = obbFromRect(rect(0, 0, 2, 2));
    const b = obbFromRect(rect(2, 0, 4, 2));
    expect(obbGap(a, b)).toBe(0);
  });

  it("separates two rotated planks whose bounding boxes still overlap", () => {
    // Two 2 × 0.2 planks, both at 45°, one offset 0.6 m along its own normal:
    // AABBs overlap heavily, the real surfaces are 0.4 m apart.
    const angle = Math.PI / 4;
    const a = { x: 0, z: 0, hw: 1, hd: 0.1, rotation: angle };
    const b = { x: Math.cos(angle) * 0.6, z: Math.sin(angle) * 0.6, hw: 1, hd: 0.1, rotation: angle };
    expect(obbGap(a, b)).toBeCloseTo(0.4, 6);
    expect(obbBounds(a).minX).toBeCloseTo(-(Math.SQRT1_2 + 0.1 * Math.SQRT1_2), 6);
    // their bounding boxes overlap, so an AABB-only check would report a clash
    expect(obbBounds(b).minX).toBeLessThan(obbBounds(a).maxX);
  });

  it("measures box-to-circle distance against the face, not the centre", () => {
    const box = obbFromRect(rect(0, 0, 2, 2));
    // centre 0.6 m outside the +X face, radius 0.2 → 0.4 m of clear space
    expect(obbCircleGap(box, { x: 2.6, z: 1, r: 0.2 })).toBeCloseTo(0.4, 6);
    // circle fully inside the box: penetration is returned as a negative gap
    expect(obbCircleGap(box, { x: 1, z: 1, r: 0.3 })).toBeLessThan(0);
  });
});

describe("group spacing", () => {
  it("takes the smallest pairwise gap between two furniture groups", () => {
    const groupA = [
      { kind: "obb" as const, obb: obbFromRect(rect(0, 0, 1, 1)) },
      { kind: "obb" as const, obb: obbFromRect(rect(0, 4, 1, 5)) },
    ];
    const groupB = [{ kind: "obb" as const, obb: obbFromRect(rect(3, 4.5, 4, 5.5)) }];
    expect(groupGap(groupA, groupB)).toBeCloseTo(2, 6);
  });
});

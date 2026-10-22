/**
 * Framing tests.
 *
 * A camera pose is a *constraint*, not a matter of taste: the establishing view
 * must contain the whole room at the aspect ratios the product ships on, the
 * query-string presets must resolve to real tables, and the orbit envelope must
 * not let a visitor drop the camera under the floor.
 */

import { describe, expect, it } from "vitest";
import {
  CAMERA,
  OVERVIEW,
  ROOM_BOX,
  VIEW_PRESETS,
  boxCentre,
  boxCorners,
  fitPose,
  focusOnTable,
  isViewName,
  poseContains,
  poseFromQuery,
} from "@/lib/scene/framing";
import { ROOM_BOUNDS, TABLE_PLAN } from "@/lib/scene/layout";

describe("fitPose", () => {
  it("returns a pose that contains the box at 16:9", () => {
    expect(poseContains(ROOM_BOX, OVERVIEW, 16 / 9)).toBe(true);
  });

  it("is tight, not merely safe: the eye is not parked at infinity", () => {
    const distance = Math.hypot(
      OVERVIEW.position[0] - OVERVIEW.target[0],
      OVERVIEW.position[1] - OVERVIEW.target[1],
      OVERVIEW.position[2] - OVERVIEW.target[2],
    );
    expect(distance).toBeGreaterThan(18);
    expect(distance).toBeLessThan(45);
    // …and inside the orbit envelope, so a drag from the overview never snaps
    expect(distance).toBeGreaterThan(CAMERA.orbit.minDistance);
    expect(distance).toBeLessThan(CAMERA.orbit.maxDistance);
  });

  it("pulls back for narrower viewports and stays valid at every aspect", () => {
    const portrait = fitPose(ROOM_BOX, 9 / 16, { fov: 42, margin: 0.055, elevation: 0.4 });
    const distance = (pose: typeof portrait) =>
      Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    expect(distance(portrait)).toBeGreaterThan(distance(OVERVIEW));
    for (const aspect of [0.5, 0.75, 1, 1.33, 1.78, 2.4, 3.2]) {
      expect(poseContains(ROOM_BOX, fitPose(ROOM_BOX, aspect), aspect), `aspect ${aspect}`).toBe(true);
    }
  });

  it("looks at the middle of the room", () => {
    const centre = boxCentre(ROOM_BOX);
    expect(OVERVIEW.target[0]).toBeCloseTo(centre[0], 1);
    expect(OVERVIEW.target[2]).toBeCloseTo(centre[2], 1);
    expect(OVERVIEW.position[1]).toBeGreaterThan(ROOM_BOX.max[1]);
  });

  it("has exactly eight corners to satisfy", () => {
    expect(boxCorners(ROOM_BOX)).toHaveLength(8);
  });
});

describe("named presets", () => {
  it("keeps every preset inside the room or just outside its glazing", () => {
    for (const [name, pose] of Object.entries(VIEW_PRESETS)) {
      const [x, y, z] = pose.position;
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), name).toBe(true);
      expect(y, `${name} must stay above the floor`).toBeGreaterThan(0.5);
      // eye never leaves the block by more than 4 m (the camera can sit on the
      // street, but it must not fly across the city)
      expect(x).toBeGreaterThan(ROOM_BOUNDS.minX - 4);
      expect(x).toBeLessThan(ROOM_BOUNDS.maxX + 12);
      expect(z).toBeGreaterThan(ROOM_BOUNDS.minZ - 4);
      // the establishing view is *supposed* to stand well outside the building
      expect(z, name).toBeLessThan(ROOM_BOUNDS.maxZ + 30);
    }
  });

  it("points the entrance view into the room, not at a wall", () => {
    const [ex, , ez] = CAMERA.entrance.position;
    const [tx, , tz] = CAMERA.entrance.target;
    const length = Math.hypot(tx - ex, tz - ez);
    expect(length).toBeGreaterThan(8);
    // looking roughly north-west, into the dining room
    expect(tx).toBeLessThan(ex);
    expect(tz).toBeLessThan(ez);
  });

  it("keeps every table close-up inside the orbit envelope, so controls never clamp", () => {
    for (const table of TABLE_PLAN.slice(0, 6)) {
      const pose = focusOnTable(table.x, table.z);
      const distance = Math.hypot(
        pose.position[0] - pose.target[0],
        pose.position[1] - pose.target[1],
        pose.position[2] - pose.target[2],
      );
      expect(distance, table.code).toBeGreaterThan(CAMERA.orbit.minDistance);
      expect(distance, table.code).toBeLessThan(CAMERA.orbit.maxDistance);
      // below the ceiling, so the cutaway slab closes over the shot
      expect(pose.position[1], table.code).toBeLessThan(3.1);
    }
  });

  it("never allows the orbit to go below the floor", () => {
    expect(CAMERA.orbit.maxPolarAngle).toBeLessThanOrEqual(Math.PI / 2);
    expect(CAMERA.orbit.minPolarAngle).toBeGreaterThan(0);
    expect(CAMERA.orbit.minDistance).toBeLessThan(CAMERA.orbit.maxDistance);
  });
});

describe("query presets", () => {
  it("resolves a named view", () => {
    expect(poseFromQuery("?view=entrance")).toEqual(VIEW_PRESETS.entrance);
    expect(poseFromQuery("view=top&debug3d=1")).toEqual(VIEW_PRESETS.top);
  });

  it("resolves a table code, case-insensitively", () => {
    const table = TABLE_PLAN.find((entry) => entry.code === "T14")!;
    expect(poseFromQuery("?mesa=t14")).toEqual(focusOnTable(table.x, table.z));
  });

  it("returns null rather than guessing", () => {
    expect(poseFromQuery("")).toBeNull();
    expect(poseFromQuery("?view=kitchen")).toBeNull();
    expect(poseFromQuery("?mesa=T99")).toBeNull();
    expect(isViewName("salon")).toBe(false);
  });
});

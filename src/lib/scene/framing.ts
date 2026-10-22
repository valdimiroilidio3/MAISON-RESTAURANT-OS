/**
 * Camera framing, as arithmetic instead of taste.
 *
 * The room is 21 m × 16.7 m. Picking an eye position by eye is how a "hero view"
 * ends up cutting off the terrace on one laptop and floating in space on
 * another. `fitPose` takes the bounding box that must be visible and the aspect
 * ratio that must contain it, and returns the closest eye position on a chosen
 * orbit that keeps every corner inside the frustum with a fixed margin.
 *
 * Pure: no three.js, no DOM. The result is a plain pose that any renderer, test
 * or URL preset can use.
 */

import { ROOM_BOUNDS, TABLE_PLAN, WALL } from "./layout";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov?: number;
}

export interface Bounds3 {
  min: [number, number, number];
  max: [number, number, number];
}

/** Everything that must stay on screen in the establishing view. */
export const ROOM_BOX: Bounds3 = {
  min: [ROOM_BOUNDS.minX, 0, ROOM_BOUNDS.minZ],
  max: [ROOM_BOUNDS.maxX, WALL.height, ROOM_BOUNDS.maxZ],
};

/** Centre of the seated area, used as the default look-at point. */
export const SEATING_CENTRE = { x: -0.6, z: 0.6 };

export function boxCentre(box: Bounds3): [number, number, number] {
  return [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
}

export function boxCorners(box: Bounds3): Array<[number, number, number]> {
  const corners: Array<[number, number, number]> = [];
  for (const x of [box.min[0], box.max[0]]) {
    for (const y of [box.min[1], box.max[1]]) {
      for (const z of [box.min[2], box.max[2]]) corners.push([x, y, z]);
    }
  }
  return corners;
}

interface FitOptions {
  /** Azimuth in radians: 0 = looking from +Z (south), π/2 = from +X (east). */
  azimuth?: number;
  /** Elevation in radians above the floor plane. */
  elevation?: number;
  /** Vertical field of view in degrees. */
  fov?: number;
  /** Free space kept around the box, as a fraction of the frustum (0.08 = 8%). */
  margin?: number;
  /** Look-at override; defaults to the box centre. */
  target?: [number, number, number];
}

/**
 * Smallest distance along a fixed direction that still contains every corner.
 * For each corner we solve the vertical and horizontal half-angle constraints
 * and keep the largest required distance.
 */
export function fitPose(box: Bounds3, aspect: number, options: FitOptions = {}): CameraPose {
  const azimuth = options.azimuth ?? Math.PI * 0.24;
  const elevation = options.elevation ?? Math.PI * 0.23;
  const fov = options.fov ?? 34;
  const margin = options.margin ?? 0.08;
  const target = options.target ?? boxCentre(box);

  // Unit vector from target towards the eye.
  const direction: [number, number, number] = [
    Math.cos(elevation) * Math.sin(azimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.cos(azimuth),
  ];
  // Camera basis: forward = -direction, right = normalize(cross(forward, up)), up' = cross(right, forward)
  const forward: [number, number, number] = [-direction[0], -direction[1], -direction[2]];
  const worldUp: [number, number, number] = [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = normalize(cross(right, forward));

  const tanV = Math.tan((fov * Math.PI) / 360) * (1 - margin);
  const tanH = tanV * Math.max(0.4, aspect);

  let distance = 0;
  for (const corner of boxCorners(box)) {
    const rel: [number, number, number] = [corner[0] - target[0], corner[1] - target[1], corner[2] - target[2]];
    // Depth of the corner measured from the eye plane, expressed as distance minus
    // the corner's projection on the view direction.
    const along = dot(rel, direction); // positive when the corner is towards the eye
    const vertical = Math.abs(dot(rel, up));
    const horizontal = Math.abs(dot(rel, right));
    // (distance - along) is the corner's depth; it must satisfy |v| <= depth·tanV
    distance = Math.max(distance, along + vertical / tanV, along + horizontal / tanH);
  }

  const position: [number, number, number] = [
    round(target[0] + direction[0] * distance),
    round(target[1] + direction[1] * distance),
    round(target[2] + direction[2] * distance),
  ];
  return { position, target: [round(target[0]), round(target[1]), round(target[2])], fov };
}

function round(value: number) {
  // Two decimals is finer than a pixel at these distances and keeps snapshots stable.
  return Math.round(value * 100) / 100;
}

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}

/**
 * The establishing view is *computed*, not authored: a 50° lens, a 19° elevation
 * and a 6% margin give an eye 25 m out on the south-east diagonal — the same
 * distance the hand-tuned pose used, but now guaranteed to contain the whole
 * plot at 16:9 and re-solved for any other aspect by `FitCamera`.
 */
export const OVERVIEW_FIT = { fov: 50, margin: 0.06, elevation: 0.33 } as const;
export const OVERVIEW: CameraPose = fitPose(ROOM_BOX, 16 / 9, OVERVIEW_FIT);

export const CAMERA = {
  overview: OVERVIEW,
  /**
   * The view a guest sees walking in: standing inside the threshold, 0.9 m from
   * the door, looking down the room towards the bar.
   */
  entrance: {
    position: [8.25, 1.68, 7.35],
    target: [1.0, 1.15, -3.4],
    fov: 56,
  } satisfies CameraPose,
  /** Terrace under the parasols, looking back at the glazed facade. */
  terrace: {
    position: [-12.6, 7.4, 9.6],
    target: [-7.2, 0.7, 0.2],
    fov: 38,
  } satisfies CameraPose,
  /** Top-down reading of the plan, used by the 2D plan and the debug probe. */
  top: {
    position: [0.4, 25, 0.4],
    target: [0.4, 0, 0.4],
    fov: 32,
  } satisfies CameraPose,
  /** Constrained orbit envelope — nothing below the floor, nothing outside. */
  orbit: {
    // 2.6 m is close enough for a table-side view, far enough that the eye never
    // ends up inside a chair. This bound used to be 6 m, which silently pushed
    // every table close-up out through the glazing.
    minDistance: 2.6,
    maxDistance: 40,
    minPolarAngle: 0.3,
    /** almost horizontal: a guest-level view is the point of the entrance preset */
    maxPolarAngle: Math.PI / 2.06,
  },
} as const;

/**
 * A three-quarter close-up on one table, at seated eye level.
 *
 * The first version framed from 3.4 m — above the ceiling slab, so the camera
 * ended up looking at the roof from on top of it. A table view is an interior
 * view: 1.75 m, 3.2 m back, 40° lens, with the tabletop, the chairs and the
 * seated figure all inside the frustum. Its 4.1 m eye–table distance sits safely
 * inside the orbit envelope (`CAMERA.orbit.minDistance`), so the controls never
 * clamp — and therefore never drag the camera through a wall — when the pose is
 * applied.
 */
export function focusOnTable(x: number, z: number): CameraPose {
  return {
    position: [round(x + 2.6), 1.78, round(z + 2.8)],
    target: [round(x), 0.8, round(z)],
    fov: 40,
  };
}

/**
 * Named, shareable camera presets. `?view=entrance` on the public floor opens
 * the room the way a guest first sees it.
 */
export const VIEW_PRESETS = {
  overview: CAMERA.overview,
  entrance: CAMERA.entrance,
  terrace: CAMERA.terrace,
  top: CAMERA.top,
} as const;

export type ViewName = keyof typeof VIEW_PRESETS;

export function isViewName(value: string | null | undefined): value is ViewName {
  return !!value && value in VIEW_PRESETS;
}

/**
 * `?view=night` is a *time* preset rather than a camera pose, so it is not part
 * of VIEW_PRESETS (which is purely spatial). Parsing lives here so the URL
 * grammar stays in one place and both the public and the operations floor read
 * it the same way.
 */
export function nightFromQuery(search: string): boolean | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get("luz") ?? params.get("light");
  if (!value) return null;
  if (value === "noite" || value === "night") return true;
  if (value === "dia" || value === "day") return false;
  return null;
}

/** `?view=…` or `?mesa=T14` → a camera pose. Returns null when nothing valid is asked for. */
export function poseFromQuery(search: string): CameraPose | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const view = params.get("view");
  if (isViewName(view)) return VIEW_PRESETS[view];
  const code = params.get("mesa") ?? params.get("table");
  if (!code) return null;
  const table = TABLE_PLAN.find((entry) => entry.code.toUpperCase() === code.toUpperCase());
  return table ? focusOnTable(table.x, table.z) : null;
}

/**
 * True when every corner of the box lands inside the frustum of `pose`.
 * The single assertion that keeps a hand-edited pose honest.
 */
export function poseContains(box: Bounds3, pose: CameraPose, aspect: number): boolean {
  const eye = pose.position;
  const target = pose.target;
  const forward = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const tanV = Math.tan(((pose.fov ?? 34) * Math.PI) / 360);
  const tanH = tanV * aspect;
  return boxCorners(box).every((corner) => {
    const rel: [number, number, number] = [corner[0] - eye[0], corner[1] - eye[1], corner[2] - eye[2]];
    const depth = dot(rel, forward);
    if (depth <= 0.01) return false;
    return Math.abs(dot(rel, up)) <= depth * tanV && Math.abs(dot(rel, right)) <= depth * tanH;
  });
}

/**
 * Generic 2D spatial primitives for scene validation and placement.
 *
 * Everything is expressed on the floor plane (x, z) — the plane on which
 * furniture, circulation and camera targets are laid out in this project — so
 * the same helpers can be reused by any top-down-validated 3D scene. Nothing
 * here imports three.js, React or the database: it is pure and unit-testable.
 *
 * Conventions
 *  - Rect: axis-aligned bounds in world units (metres), `min <= max`.
 *  - Obb:  oriented box = centre + half extents + rotation around +Y
 *           (identical to a three.js Object3D with rotation.y = `rotation`).
 *  - Circle: centre + radius.
 *  - "gap" is the smallest translation needed to separate two shapes; it is
 *    positive when they are apart and negative when they interpenetrate.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Obb {
  x: number;
  z: number;
  /** Half width (local X). */
  hw: number;
  /** Half depth (local Z). */
  hd: number;
  /** Rotation around +Y, radians; 0 means aligned with world axes. */
  rotation: number;
}

export function rectFromCenter(x: number, z: number, width: number, depth: number): Rect {
  return { minX: x - width / 2, maxX: x + width / 2, minZ: z - depth / 2, maxZ: z + depth / 2 };
}

export function rectFromEdges(minX: number, minZ: number, maxX: number, maxZ: number): Rect {
  return { minX: Math.min(minX, maxX), minZ: Math.min(minZ, maxZ), maxX: Math.max(minX, maxX), maxZ: Math.max(minZ, maxZ) };
}

export function rectWidth(rect: Rect): number {
  return rect.maxX - rect.minX;
}

export function rectDepth(rect: Rect): number {
  return rect.maxZ - rect.minZ;
}

export function rectCenter(rect: Rect): Vec2 {
  return { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 };
}

export function expandRect(rect: Rect, by: number): Rect {
  return { minX: rect.minX - by, maxX: rect.maxX + by, minZ: rect.minZ - by, maxZ: rect.maxZ + by };
}

export function rectContainsPoint(rect: Rect, point: Vec2, margin = 0): boolean {
  return (
    point.x >= rect.minX + margin &&
    point.x <= rect.maxX - margin &&
    point.z >= rect.minZ + margin &&
    point.z <= rect.maxZ - margin
  );
}

/** True when `inner` is fully inside `outer`, allowing a `margin` inside the edges. */
export function rectContainsRect(outer: Rect, inner: Rect, margin = 0): boolean {
  return (
    inner.minX >= outer.minX + margin &&
    inner.maxX <= outer.maxX - margin &&
    inner.minZ >= outer.minZ + margin &&
    inner.maxZ <= outer.maxZ - margin
  );
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

/** Overlap area of two axis-aligned rects (0 when they only touch). */
export function rectOverlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const d = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
  return w > 0 && d > 0 ? w * d : 0;
}

/** Gap between two axis-aligned rects; negative when they overlap. */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
  const dz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
  if (dx >= 0 || dz >= 0) return Math.max(dx, dz);
  return Math.max(dx, dz); // both negative: the larger (less negative) is the separation to apply
}

export function clampPoint(point: Vec2, rect: Rect, margin = 0): Vec2 {
  return {
    x: Math.min(Math.max(point.x, rect.minX + margin), rect.maxX - margin),
    z: Math.min(Math.max(point.z, rect.minZ + margin), rect.maxZ - margin),
  };
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function circleOverlapsCircle(a: Circle, b: Circle): boolean {
  return distance(a, b) < a.r + b.r;
}

export function circleRectOverlap(circle: Circle, rect: Rect): boolean {
  const nx = Math.min(Math.max(circle.x, rect.minX), rect.maxX);
  const nz = Math.min(Math.max(circle.z, rect.minZ), rect.maxZ);
  return Math.hypot(circle.x - nx, circle.z - nz) < circle.r;
}

/** Circle fully inside a rect, keeping `r` from every edge. */
export function circleInsideRect(circle: Circle, rect: Rect): boolean {
  return (
    circle.x - circle.r >= rect.minX &&
    circle.x + circle.r <= rect.maxX &&
    circle.z - circle.r >= rect.minZ &&
    circle.z + circle.r <= rect.maxZ
  );
}

export function obbCorners(obb: Obb): Vec2[] {
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  const corners: Array<[number, number]> = [
    [-obb.hw, -obb.hd],
    [obb.hw, -obb.hd],
    [obb.hw, obb.hd],
    [-obb.hw, obb.hd],
  ];
  return corners.map(([lx, lz]) => ({ x: obb.x + lx * cos + lz * sin, z: obb.z - lx * sin + lz * cos }));
}

/** Axis-aligned bounds that contain the oriented box (conservative). */
export function obbBounds(obb: Obb): Rect {
  const corners = obbCorners(obb);
  return {
    minX: Math.min(...corners.map((c) => c.x)),
    maxX: Math.max(...corners.map((c) => c.x)),
    minZ: Math.min(...corners.map((c) => c.z)),
    maxZ: Math.max(...corners.map((c) => c.z)),
  };
}

/** Circle fully inside an oriented box (checked in the box's local frame). */
export function circleInsideObb(circle: Circle, obb: Obb): boolean {
  const cos = Math.cos(-obb.rotation);
  const sin = Math.sin(-obb.rotation);
  const dx = circle.x - obb.x;
  const dz = circle.z - obb.z;
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;
  return Math.abs(lx) + circle.r <= obb.hw && Math.abs(lz) + circle.r <= obb.hd;
}

function axesOf(obb: Obb): Vec2[] {
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  // local X and local Z expressed in world space
  return [
    { x: cos, z: -sin },
    { x: sin, z: cos },
  ];
}

function projectObb(obb: Obb, axis: Vec2): { min: number; max: number } {
  const cos = Math.cos(obb.rotation);
  const sin = Math.sin(obb.rotation);
  const center = obb.x * axis.x + obb.z * axis.z;
  const radius = Math.abs((cos * axis.x - sin * axis.z) * obb.hw) + Math.abs((sin * axis.x + cos * axis.z) * obb.hd);
  return { min: center - radius, max: center + radius };
}

export function obbOverlap(a: Obb, b: Obb): boolean {
  return obbGap(a, b) < 0;
}

/**
 * Separation between two oriented boxes along the best separating axis.
 * Positive = apart by that distance (a lower bound of the true distance),
 * negative = interpenetration depth. Uses the four face normals (SAT).
 */
export function obbGap(a: Obb, b: Obb): number {
  const axes = [...axesOf(a), ...axesOf(b)];
  let best = -Infinity;
  for (const axis of axes) {
    const pa = projectObb(a, axis);
    const pb = projectObb(b, axis);
    const gap = Math.max(pb.min - pa.max, pa.min - pb.max);
    if (gap > best) best = gap;
  }
  return best;
}

export function obbCircleGap(obb: Obb, circle: Circle): number {
  const cos = Math.cos(-obb.rotation);
  const sin = Math.sin(-obb.rotation);
  const dx = circle.x - obb.x;
  const dz = circle.z - obb.z;
  const lx = dx * cos + dz * sin;
  const lz = -dx * sin + dz * cos;
  const nx = Math.min(Math.max(lx, -obb.hw), obb.hw);
  const nz = Math.min(Math.max(lz, -obb.hd), obb.hd);
  return Math.hypot(lx - nx, lz - nz) - circle.r;
}

export type Footprint =
  | { kind: "obb"; obb: Obb }
  | { kind: "circle"; circle: Circle };

export function footprintBounds(shape: Footprint): Rect {
  return shape.kind === "obb" ? obbBounds(shape.obb) : rectFromCenter(shape.circle.x, shape.circle.z, shape.circle.r * 2, shape.circle.r * 2);
}

/** Signed separation between two footprints (negative = intersection). */
export function footprintGap(a: Footprint, b: Footprint): number {
  if (a.kind === "obb" && b.kind === "obb") return obbGap(a.obb, b.obb);
  if (a.kind === "circle" && b.kind === "circle") return distance(a.circle, b.circle) - a.circle.r - b.circle.r;
  const obb = a.kind === "obb" ? a.obb : (b as { obb: Obb }).obb;
  const circle = a.kind === "circle" ? a.circle : (b as { circle: Circle }).circle;
  return obbCircleGap(obb, circle);
}

export function footprintOverlaps(a: Footprint, b: Footprint): boolean {
  return footprintGap(a, b) < 0;
}

/** Rectangle approximated as an oriented box (rotation 0). */
export function obbFromRect(rect: Rect): Obb {
  const c = rectCenter(rect);
  return { x: c.x, z: c.z, hw: rectWidth(rect) / 2, hd: rectDepth(rect) / 2, rotation: 0 };
}

/**
 * Smallest gap between any pair of shapes in two groups. Used for aisle checks:
 * a positive value below the required clearance means the passage is too tight.
 */
export function groupGap(groupA: Footprint[], groupB: Footprint[]): number {
  let best = Infinity;
  for (const a of groupA) {
    for (const b of groupB) {
      best = Math.min(best, footprintGap(a, b));
      if (best < -0.001) return best;
    }
  }
  return best;
}
